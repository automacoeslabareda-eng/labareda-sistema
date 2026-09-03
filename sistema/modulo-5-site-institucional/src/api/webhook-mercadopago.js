/**
 * ============================================================
 *  webhook-mercadopago  (Vercel Serverless Function)
 * ============================================================
 *  O Mercado Pago CHAMA esta funcao sozinho quando muda o status de
 *  um pagamento. Aqui a gente:
 *   1. Descobre qual pagamento mudou (data.id).
 *   2. Consulta o status REAL no Mercado Pago (nunca confia so na
 *      notificacao — seguranca).
 *   3. Acha o pedido pelo external_reference.
 *   4. Se APROVADO: marca "pago", baixa estoque e avisa o n8n
 *      (que dispara o Telegram da Labareda).
 *
 *  Variaveis de ambiente:
 *   - MP_ENV, MP_ACCESS_TOKEN_TESTE/PROD  (secreta)
 *   - ECOMMERCE_SUPABASE_URL
 *   - ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY (secreta)
 *   - N8N_WEBHOOK_URL                     (opcional) fluxo n8n p/ Telegram
 *   - RESEND_API_KEY                      (opcional) email de confirmacao ao cliente
 *   - EMAIL_FROM                          (opcional) remetente do email
 *   - SITE_URL                            (opcional) URL base do site
 *   - WHATSAPP_PEDIDOS                    (opcional) WhatsApp para duvidas
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { toVercel } = require('./_netlify-adapter');
const { gerarEtiquetaParaPedido } = require('./gerar-etiqueta');

// Propriedade Labareda (mesmo id usado no fluxo Telegram do modulo 1)
const PROPRIEDADE_LABAREDA = '229e2813-6d46-4bdb-9aee-5d9a119733e6';

// Escolhe o Access Token conforme MP_ENV ('teste' ou 'producao').
function resolverAccessToken(env) {
  const ambiente = (env.MP_ENV || 'teste').toLowerCase();
  const prod = ambiente === 'producao' || ambiente === 'production' || ambiente === 'prod';
  return (prod ? env.MP_ACCESS_TOKEN_PROD : env.MP_ACCESS_TOKEN_TESTE) || env.MP_ACCESS_TOKEN || '';
}

/* ---- Email de confirmação de compra ---- */
async function enviarEmailConfirmacao(cliente, pedido, itens) {
  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !cliente || !cliente.email) return false;

  var siteUrl = (process.env.SITE_URL || 'https://sitiolabareda.com').replace(/\/+$/, '');
  var whatsapp = process.env.WHATSAPP_PEDIDOS || '5573998150799';
  var whatsappLink = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent('Oi! Tenho uma duvida sobre o pedido #' + pedido.numero);
  var acompanharUrl = siteUrl + '/pedido.html?numero=' + pedido.numero;
  var from = process.env.EMAIL_FROM || 'Sitio Labareda <noreply@sitiolabareda.com>';

  var itensHtml = (itens || []).map(function (it) {
    var nomeComTamanho = (it.nome_produto || '') + (it.tamanho ? ' (' + it.tamanho + ')' : '');
    return '<tr>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e0d5c5;">' + nomeComTamanho + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e0d5c5;text-align:center;">' + it.quantidade + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e0d5c5;text-align:right;">R$ ' + Number(it.preco_unitario).toFixed(2).replace('.', ',') + '</td>'
      + '</tr>';
  }).join('');

  var endereco = pedido.endereco_entrega || {};
  var enderecoTexto = endereco.rua
    ? (endereco.rua + ', ' + endereco.numero + (endereco.complemento ? ' — ' + endereco.complemento : '') + '<br>' + endereco.bairro + ' — ' + endereco.cidade + '/' + endereco.estado + '<br>CEP: ' + endereco.cep)
    : '';

  var html = [
    '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#2E2624;">',
    '<h2 style="color:#AA3424;text-align:center;margin-bottom:24px;">Sitio Labareda</h2>',
    '<p>Ola, ' + (cliente.nome || '').split(' ')[0] + '!</p>',
    '<p>Seu pedido <strong>#' + pedido.numero + '</strong> foi confirmado! Obrigado pela compra. 🌿</p>',

    '<div style="background:#f5f0e8;border-radius:8px;padding:20px;margin:20px 0;">',
    '<table style="width:100%;border-collapse:collapse;font-size:.9rem;">',
    '<thead><tr style="color:#6b5f56;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;">',
    '<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #d4c9b8;">Produto</th>',
    '<th style="padding:8px 12px;text-align:center;border-bottom:2px solid #d4c9b8;">Qtd</th>',
    '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #d4c9b8;">Valor</th>',
    '</tr></thead>',
    '<tbody>' + itensHtml + '</tbody>',
    '<tfoot>',
    '<tr><td colspan="2" style="padding:8px 12px;text-align:right;font-size:.85rem;color:#6b5f56;">Subtotal</td><td style="padding:8px 12px;text-align:right;">R$ ' + Number(pedido.subtotal).toFixed(2).replace('.', ',') + '</td></tr>',
    '<tr><td colspan="2" style="padding:8px 12px;text-align:right;font-size:.85rem;color:#6b5f56;">Frete</td><td style="padding:8px 12px;text-align:right;">R$ ' + Number(pedido.frete).toFixed(2).replace('.', ',') + '</td></tr>',
    '<tr><td colspan="2" style="padding:8px 12px;text-align:right;font-weight:bold;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:bold;">R$ ' + Number(pedido.total).toFixed(2).replace('.', ',') + '</td></tr>',
    '</tfoot>',
    '</table>',
    '</div>',

    enderecoTexto ? '<div style="margin:20px 0;"><p style="font-size:.85rem;color:#6b5f56;margin-bottom:4px;">Endereco de entrega:</p><p style="font-size:.9rem;">' + enderecoTexto + '</p></div>' : '',

    '<p style="font-size:.9rem;">Quando seu pedido for despachado, voce recebera um email com o codigo de rastreamento.</p>',

    '<div style="text-align:center;margin:24px 0;">',
    '<a href="' + acompanharUrl + '" style="display:inline-block;background:#AA3424;color:#F3E9D2;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:.9rem;">Acompanhar pedido</a>',
    '</div>',

    '<hr style="border:none;border-top:1px solid #e0d5c5;margin:24px 0;">',
    '<p style="font-size:.85rem;color:#6b5f56;">Duvidas sobre seu pedido?</p>',
    '<p style="font-size:.85rem;"><a href="' + whatsappLink + '" style="color:#AA3424;">Fale conosco pelo WhatsApp</a> — (73) 99815-0799</p>',
    '<p style="font-size:.75rem;color:#9a8b7d;margin-top:20px;text-align:center;">Sitio Labareda — Roca & Arte<br>Serra Grande, Costa do Cacau, Bahia</p>',
    '</div>',
  ].join('');

  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from,
        to: [cliente.email],
        subject: 'Pedido #' + pedido.numero + ' confirmado! — Sitio Labareda',
        html: html,
      }),
    });
    if (!res.ok) {
      var errBody = await res.text().catch(function () { return ''; });
      console.error('[webhook-mp] Erro Resend:', res.status, errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[webhook-mp] Erro ao enviar email confirmacao:', err);
    return false;
  }
}

const handler = async (event) => {
  const ok200 = { statusCode: 200, body: 'ok' };
  if (event.httpMethod !== 'POST') return ok200;

  // Nomes PROPRIOS da loja (Site-ecommerce), para nao colidir com SUPABASE_URL
  // ja existente (que aponta para o projeto de GESTAO).
  const SUPABASE_URL = process.env.ECOMMERCE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
  const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
  const MP_ACCESS_TOKEN = resolverAccessToken(process.env);
  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('webhook: variaveis de ambiente ausentes');
    return ok200;
  }

  try {
    // 1. Descobre o ID do pagamento (query ou body)
    let paymentId = null;
    const qs = event.queryStringParameters || {};
    if (qs['data.id']) paymentId = qs['data.id'];
    if (qs.id && qs.topic === 'payment') paymentId = qs.id;
    if (!paymentId && event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.data && body.data.id) paymentId = body.data.id;
        if (!paymentId && body.type === 'payment' && body.id) paymentId = body.id;
      } catch (e) { /* corpo nao-JSON */ }
    }
    if (!paymentId) return ok200;

    // 2. Consulta o pagamento real no Mercado Pago
    const mp = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const info = await new Payment(mp).get({ id: paymentId });
    const status = info.status;
    const pedidoId = info.external_reference;
    if (!pedidoId) return ok200;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // 3. Busca o pedido (idempotencia)
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, numero, status, subtotal, frete, total, endereco_entrega, cliente_id')
      .eq('id', pedidoId)
      .single();
    if (!pedido) return ok200;
    // So processa se o pedido ainda estiver pendente. Qualquer outro status
    // (pago, preparando, enviado, entregue, cancelado) significa que uma
    // notificacao anterior ja tratou esse pagamento — evita baixar estoque
    // ou gerar etiqueta (que tem custo real no SuperFrete) duas vezes.
    if (pedido.status !== 'pendente') return ok200;

    // 4. Atualiza status
    const mapaStatus = {
      approved: 'pago', pending: 'pendente', in_process: 'pendente',
      rejected: 'cancelado', cancelled: 'cancelado', refunded: 'cancelado',
    };
    const novoStatus = mapaStatus[status] || 'pendente';
    const update = {
      status: novoStatus,
      mercadopago_status: status,
      mercadopago_id: String(paymentId),
      metodo_pagamento: info.payment_method_id || 'mercadopago',
    };
    if (novoStatus === 'pago') update.pago_at = new Date().toISOString();
    await supabase.from('pedidos').update(update).eq('id', pedidoId);

    // 5. Se aprovado: baixa estoque + avisa n8n/Telegram
    if (novoStatus === 'pago') {
      const { data: itens } = await supabase
        .from('pedido_itens')
        .select('produto_id, nome_produto, tamanho, quantidade, preco_unitario')
        .eq('pedido_id', pedidoId);

      // Baixa de estoque item a item (com alerta de estoque baixo).
      // Produto com tamanho: baixa so daquele tamanho e recalcula o total
      // (soma de todos os tamanhos) pra manter a coluna `estoque` sincronizada.
      const alertasEstoqueBaixo = [];
      for (const it of itens || []) {
        if (!it.produto_id) continue;
        const { data: prod } = await supabase
          .from('produtos')
          .select('nome_pt, estoque, estoque_minimo, variantes_estoque')
          .eq('id', it.produto_id)
          .single();
        if (!prod) continue;

        const minimo = prod.estoque_minimo != null ? prod.estoque_minimo : 5;

        if (it.tamanho && prod.variantes_estoque && typeof prod.variantes_estoque === 'object' && prod.variantes_estoque[it.tamanho] != null) {
          const novasVariantes = { ...prod.variantes_estoque };
          const novoEstoqueTamanho = Math.max(0, novasVariantes[it.tamanho] - it.quantidade);
          novasVariantes[it.tamanho] = novoEstoqueTamanho;
          const novoEstoqueTotal = Object.values(novasVariantes).reduce((soma, v) => soma + (Number(v) || 0), 0);
          await supabase.from('produtos').update({ variantes_estoque: novasVariantes, estoque: novoEstoqueTotal }).eq('id', it.produto_id);
          if (novoEstoqueTamanho < minimo) {
            alertasEstoqueBaixo.push({ nome: prod.nome_pt + ' (' + it.tamanho + ')', estoque: novoEstoqueTamanho });
          }
        } else if (prod.estoque != null) {
          const novoEstoque = Math.max(0, prod.estoque - it.quantidade);
          await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', it.produto_id);
          if (novoEstoque < minimo) alertasEstoqueBaixo.push({ nome: prod.nome_pt, estoque: novoEstoque });
        }
      }

      // Dados do cliente para a mensagem
      let cliente = null;
      if (pedido.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes').select('nome, email, telefone').eq('id', pedido.cliente_id).single();
        cliente = cli || null;
      }

      // Email de confirmacao de compra ao cliente — dispara primeiro, antes
      // da etiqueta/rastreio, pra chegar na caixa de entrada nessa ordem.
      try {
        await enviarEmailConfirmacao(cliente, pedido, itens);
      } catch (e) {
        console.error('webhook: falha ao enviar email confirmacao (nao critico):', e.message);
      }

      // Gera a etiqueta no SuperFrete automaticamente (compra o frete de
      // verdade). Se falhar (endereco incompleto, sem saldo, SuperFrete
      // fora do ar etc.), nao quebra o webhook — fica pra gerar manual
      // depois pelo painel. O pedido so tem frete_service_id quando o
      // cliente escolheu uma opcao de frete calculada no checkout.
      let etiqueta = null;
      if (pedido.frete_service_id) {
        try {
          etiqueta = await gerarEtiquetaParaPedido(supabase, pedidoId);
        } catch (e) {
          console.error('webhook: falha ao gerar etiqueta automatica (nao critico):', e.message);
        }
      }

      // Dispara o n8n (Telegram). Se falhar, nao quebra o webhook.
      if (N8N_WEBHOOK_URL) {
        try {
          await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              evento: 'compra_aprovada',
              propriedade_id: PROPRIEDADE_LABAREDA,
              pedido_numero: pedido.numero,
              pedido_id: pedido.id,
              cliente_nome: cliente ? cliente.nome : (info.payer && info.payer.first_name) || '',
              cliente_email: cliente ? cliente.email : (info.payer && info.payer.email) || '',
              cliente_telefone: cliente ? cliente.telefone : '',
              valor_produtos: pedido.subtotal,
              valor_frete: pedido.frete,
              valor_total: pedido.total,
              pagamento_id: String(paymentId),
              endereco: pedido.endereco_entrega || null,
              itens: (itens || []).map((i) => ({ nome: i.nome_produto, tamanho: i.tamanho || null, quantidade: i.quantidade, preco: i.preco_unitario })),
              alertas_estoque_baixo: alertasEstoqueBaixo,
              etiqueta_gerada: !!etiqueta,
              rastreio_codigo: etiqueta ? etiqueta.tracking : null,
              etiqueta_url: etiqueta ? etiqueta.etiqueta_url : null,
            }),
          });
        } catch (e) {
          console.error('webhook: falha ao chamar n8n (nao critico):', e.message);
        }
      }
    }

    return ok200;
  } catch (err) {
    console.error('Erro no webhook-mercadopago:', err);
    return ok200; // 200 para o MP nao reenviar em loop
  }
};

module.exports = toVercel(handler);
