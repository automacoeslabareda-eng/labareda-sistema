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
 *   - RESEND_API_KEY, EMAIL_FROM, EMAIL_LOJA (opcional) emails — ver _emails.js
 *   - SITE_URL                            (opcional) URL base do site
 *   - WHATSAPP_PEDIDOS                    (opcional) WhatsApp para duvidas
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { toVercel } = require('./_netlify-adapter');
const { gerarEtiquetaParaPedido } = require('./gerar-etiqueta');
const { emailPagamentoAprovado } = require('./_emails');

// Propriedade Labareda (mesmo id usado no fluxo Telegram do modulo 1)
const PROPRIEDADE_LABAREDA = '229e2813-6d46-4bdb-9aee-5d9a119733e6';

// Escolhe o Access Token conforme MP_ENV ('teste' ou 'producao').
function resolverAccessToken(env) {
  const ambiente = (env.MP_ENV || 'teste').toLowerCase();
  const prod = ambiente === 'producao' || ambiente === 'production' || ambiente === 'prod';
  return (prod ? env.MP_ACCESS_TOKEN_PROD : env.MP_ACCESS_TOKEN_TESTE) || env.MP_ACCESS_TOKEN || '';
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
      .select('id, numero, status, subtotal, frete, total, endereco_entrega, cliente_id, frete_service_id, frete_service_name')
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
    // Update condicionado a status 'pendente': se o MP mandar duas
    // notificacoes ao mesmo tempo, so uma "ganha" e processa estoque,
    // etiqueta e emails.
    const { data: atualizados, error: errUpd } = await supabase
      .from('pedidos').update(update).eq('id', pedidoId).eq('status', 'pendente').select('id');
    if (errUpd) throw errUpd;
    if (!atualizados || atualizados.length === 0) return ok200;

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
          .from('clientes').select('nome, email, telefone, cpf').eq('id', pedido.cliente_id).single();
        cliente = cli || null;
      }

      // Gera a etiqueta no SuperFrete automaticamente (compra o frete de
      // verdade). Se falhar (endereco incompleto, sem saldo, SuperFrete
      // fora do ar etc.), nao quebra o webhook — fica pra gerar manual
      // depois pelo painel. O pedido so tem frete_service_id quando o
      // cliente escolheu uma opcao de frete calculada no checkout.
      let etiqueta = null;
      let erroEtiqueta = null;
      if (pedido.frete_service_id) {
        try {
          etiqueta = await gerarEtiquetaParaPedido(supabase, pedidoId, { enviarEmail: false });
        } catch (e) {
          erroEtiqueta = e.message;
          console.error('webhook: falha ao gerar etiqueta automatica (nao critico):', e.message);
        }
      } else {
        erroEtiqueta = 'pedido sem servico de frete SuperFrete escolhido no checkout';
      }

      // Email de confirmacao (cliente + loja), ja com rastreio/etiqueta
      // quando a etiqueta foi gerada acima.
      try {
        await emailPagamentoAprovado(
          cliente || { email: info.payer && info.payer.email },
          pedido,
          itens,
          etiqueta || { erro: erroEtiqueta }
        );
      } catch (e) {
        console.error('webhook: falha ao enviar email confirmacao (nao critico):', e.message);
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
              rastreio_url: etiqueta ? etiqueta.rastreio_url : null,
              etiqueta_erro: etiqueta ? null : erroEtiqueta,
              frete_servico: pedido.frete_service_name || null,
              cliente_cpf: cliente ? cliente.cpf || null : null,
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
