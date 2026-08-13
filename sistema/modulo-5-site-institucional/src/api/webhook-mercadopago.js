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
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { toVercel } = require('./_netlify-adapter');

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
      .select('id, numero, status, subtotal, frete, total, endereco_entrega, cliente_id')
      .eq('id', pedidoId)
      .single();
    if (!pedido) return ok200;
    if (pedido.status === 'pago') return ok200; // ja processado

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
        .select('produto_id, nome_produto, quantidade, preco_unitario')
        .eq('pedido_id', pedidoId);

      // Baixa de estoque item a item (com alerta de estoque baixo)
      const alertasEstoqueBaixo = [];
      for (const it of itens || []) {
        if (!it.produto_id) continue;
        const { data: prod } = await supabase
          .from('produtos')
          .select('nome_pt, estoque, estoque_minimo')
          .eq('id', it.produto_id)
          .single();
        if (prod && prod.estoque != null) {
          const novoEstoque = Math.max(0, prod.estoque - it.quantidade);
          await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', it.produto_id);
          const minimo = prod.estoque_minimo != null ? prod.estoque_minimo : 5;
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
              itens: (itens || []).map((i) => ({ nome: i.nome_produto, quantidade: i.quantidade, preco: i.preco_unitario })),
              alertas_estoque_baixo: alertasEstoqueBaixo,
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
