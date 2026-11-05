/**
 * ============================================================
 *  webhook-mercadopago  (Vercel Serverless Function)
 * ============================================================
 *  O Mercado Pago CHAMA esta funcao sozinho quando muda o status de
 *  um pagamento. Aqui a gente:
 *   1. Confere a assinatura (x-signature), se MP_WEBHOOK_SECRET existir.
 *   2. Descobre qual pagamento mudou (data.id) e consulta o status REAL
 *      no Mercado Pago (nunca confia so na notificacao).
 *   3. Acha o pedido pelo external_reference.
 *   4. Se APROVADO (uma unica vez por pedido): marca "pago", efetiva a
 *      baixa de estoque, gera a etiqueta, emite a nota fiscal (se o modo
 *      automatico estiver ligado), manda o email "Compra confirmada" (com a
 *      nota anexada, se ja autorizada), o WhatsApp do comprador (termos +
 *      nota) e avisa a equipe (n8n). Vale para Checkout Pro e para o Pix
 *      direto (os dois usam external_reference = id do pedido).
 *      Cada etapa grava historico; falhas viram pendencia no painel.
 *   5. Recusado/em analise: so registra (o cliente pode tentar de novo
 *      com outro cartao no mesmo link).
 *   6. Estorno/chargeback de pedido ja pago: registra e alerta a equipe.
 *
 *  Variaveis de ambiente:
 *   - MP_ENV, MP_ACCESS_TOKEN_TESTE/PROD  (secreta)
 *   - MP_WEBHOOK_SECRET                   (opcional) "assinatura secreta" do
 *     painel de Webhooks do Mercado Pago. Com ela, notificacoes sem
 *     assinatura valida sao recusadas.
 *   - ECOMMERCE_SUPABASE_URL
 *   - ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY (secreta)
 *   - N8N_WEBHOOK_URL                     fluxo n8n do aviso de venda
 *   - RESEND_API_KEY, EMAIL_FROM, EMAIL_LOJA (emails — ver _emails.js)
 *   - SITE_URL, WHATSAPP_PEDIDOS          (opcionais)
 * ============================================================
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { toVercel } = require('./_netlify-adapter');
const { registrarEvento, abrirPendencia } = require('./_pedido-registro');
const {
  confirmarBaixaEstoque, carregarContexto, etapaEtiqueta, etapaNotaFiscal, etapaEmailConfirmacao, etapaAvisoEquipe,
  etapaWhatsappConfirmacao,
} = require('./_pedido-fluxo');

// Escolhe o Access Token conforme MP_ENV ('teste' ou 'producao').
function resolverAccessToken(env) {
  const ambiente = (env.MP_ENV || 'teste').toLowerCase();
  const prod = ambiente === 'producao' || ambiente === 'production' || ambiente === 'prod';
  return (prod ? env.MP_ACCESS_TOKEN_PROD : env.MP_ACCESS_TOKEN_TESTE) || env.MP_ACCESS_TOKEN || '';
}

/* Assinatura do Mercado Pago: header x-signature "ts=...,v1=..." e HMAC-SHA256
   (hex) de "id:{data.id};request-id:{x-request-id};ts:{ts};". */
function assinaturaValida(event, secret) {
  const h = event.headers || {};
  const sig = String(h['x-signature'] || h['X-Signature'] || '');
  const requestId = String(h['x-request-id'] || h['X-Request-Id'] || '');
  let ts = '', v1 = '';
  sig.split(',').forEach(function (parte) {
    const kv = parte.split('=');
    const k = (kv[0] || '').trim(), v = (kv[1] || '').trim();
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  });
  if (!ts || !v1) return false;
  let dataId = String((event.queryStringParameters || {})['data.id'] || '');
  if (/^[a-z0-9]+$/i.test(dataId)) dataId = dataId.toLowerCase();
  let manifest = '';
  if (dataId) manifest += 'id:' + dataId + ';';
  if (requestId) manifest += 'request-id:' + requestId + ';';
  manifest += 'ts:' + ts + ';';
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return esperado.length === v1.length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
  } catch (e) {
    return false;
  }
}

const STATUS_PAGO = ['pago', 'preparando', 'enviado', 'entregue'];
const STATUS_ESTORNO = ['refunded', 'charged_back', 'cancelled'];

const handler = async (event) => {
  const ok200 = { statusCode: 200, body: 'ok' };
  if (event.httpMethod !== 'POST') return ok200;

  // Nomes PROPRIOS da loja (Site-ecommerce), para nao colidir com SUPABASE_URL
  // ja existente (que aponta para o projeto de GESTAO).
  const SUPABASE_URL = process.env.ECOMMERCE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
  const MP_ACCESS_TOKEN = resolverAccessToken(process.env);
  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('webhook: variaveis de ambiente ausentes');
    return ok200;
  }

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret && !assinaturaValida(event, secret)) {
    console.warn('webhook: assinatura x-signature invalida ou ausente — notificacao recusada');
    return { statusCode: 401, body: 'assinatura invalida' };
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
    let info;
    try {
      info = await new Payment(mp).get({ id: paymentId });
    } catch (e) {
      // Pagamento inexistente (ex.: "Simular notificacao" do painel do MP, que
      // manda id 123456): nada a processar. Responde 200 pra o MP nao reenviar.
      const st = e && (e.status || (e.cause && e.cause.status) || (e.response && e.response.status));
      if (st === 404 || /not.?found/i.test(String(e && e.message))) {
        console.warn('webhook: pagamento ' + paymentId + ' nao existe no Mercado Pago — ignorado');
        return ok200;
      }
      throw e;
    }
    const status = info.status;
    const pedidoId = info.external_reference;
    if (!pedidoId) return ok200;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: pedido } = await supabase
      .from('pedidos').select('*').eq('id', pedidoId).single();
    if (!pedido) return ok200;

    // 3a. Estorno / chargeback de pedido ja pago: registra e alerta.
    if (STATUS_PAGO.indexOf(pedido.status) >= 0) {
      if (STATUS_ESTORNO.indexOf(status) >= 0 && pedido.mercadopago_status !== status) {
        await supabase.from('pedidos').update({ mercadopago_status: status }).eq('id', pedidoId);
        const desc = status === 'charged_back' ? 'Chargeback (contestação) no Mercado Pago' : 'Pagamento estornado/cancelado no Mercado Pago';
        await registrarEvento(supabase, pedidoId, 'pagamento_' + status, desc, { pagamento_id: String(paymentId) }, 'webhook');
        const notaAviso = pedido.nfe_status === 'autorizada'
          ? ' A NF-e ' + (pedido.nfe_numero || '') + ' deste pedido está autorizada: cancele-a no painel do NFe+ (a SEFAZ aceita cancelamento em até 24h da autorização).'
          : '';
        await abrirPendencia(supabase, pedidoId, 'pagamento', desc + ' — confira o pedido #' + pedido.numero + ' antes de enviar.' + notaAviso);
      }
      return ok200;
    }

    // 3b. Ainda nao aprovado (recusado, em analise, pendente): so registra.
    // NAO cancela o pedido — o cliente pode tentar de novo no mesmo link, e a
    // reserva de estoque expira sozinha.
    if (status !== 'approved') {
      if (pedido.mercadopago_status !== status) {
        await supabase.from('pedidos').update({
          mercadopago_status: status,
          metodo_pagamento: info.payment_method_id || 'mercadopago',
        }).eq('id', pedidoId).is('pago_at', null);
        await registrarEvento(supabase, pedidoId, 'pagamento_' + status,
          'Mercado Pago: ' + status + (info.status_detail ? ' (' + info.status_detail + ')' : ''),
          { pagamento_id: String(paymentId), metodo: info.payment_method_id || null }, 'webhook');
      }
      return ok200;
    }

    // 4. APROVADO. Update condicionado (pendente/cancelado e sem pago_at):
    // se o MP mandar duas notificacoes ao mesmo tempo, so uma "ganha" e
    // processa estoque, etiqueta e emails.
    const statusAnterior = pedido.status;
    const { data: atualizados, error: errUpd } = await supabase
      .from('pedidos')
      .update({
        status: 'pago',
        mercadopago_status: status,
        mercadopago_id: String(paymentId),
        metodo_pagamento: info.payment_method_id || 'mercadopago',
        pago_at: new Date().toISOString(),
      })
      .eq('id', pedidoId).in('status', ['pendente', 'cancelado']).is('pago_at', null)
      .select('id');
    if (errUpd) throw errUpd;
    if (!atualizados || atualizados.length === 0) return ok200;

    await registrarEvento(supabase, pedidoId, 'pagamento_aprovado',
      'Pagamento aprovado no Mercado Pago (' + (info.payment_method_id || 'mercadopago') + ')',
      { pagamento_id: String(paymentId), valor: info.transaction_amount }, 'webhook');
    if (statusAnterior === 'cancelado') {
      await abrirPendencia(supabase, pedidoId, 'pagamento',
        'Pagamento aprovado num pedido que estava CANCELADO — o pedido voltou para "pago". Confira estoque e envio.');
    }

    const ctx = await carregarContexto(supabase, pedidoId);
    ctx.emailPagador = info.payer && info.payer.email;
    ctx.nomePagador = info.payer && info.payer.first_name;

    // 5. Baixa de estoque (uma unica vez)
    let alertas = [];
    try {
      alertas = (await confirmarBaixaEstoque(supabase, pedidoId, ctx.itens)).alertas;
    } catch (e) {
      console.error('webhook: falha na baixa de estoque:', e.message);
      await abrirPendencia(supabase, pedidoId, 'estoque', 'Falha ao baixar o estoque: ' + e.message + ' — ajuste o estoque manualmente.');
    }

    // 6. Etiqueta, email ao comprador e aviso da equipe. Nenhuma falha aqui
    // derruba o webhook: vira pendencia com "Tentar novamente" no painel.
    const r = await etapaEtiqueta(supabase, ctx, { origem: 'webhook' });
    const etiquetaOuErro = r.etiqueta || { erro: r.erro };
    // Nota fiscal (so no modo automatico). Se autorizar agora, vai anexada no
    // email de confirmacao e o link entra no aviso da equipe.
    await etapaNotaFiscal(supabase, ctx, { origem: 'webhook', enviarEmail: false, avisarEquipe: false });
    await etapaEmailConfirmacao(supabase, ctx, etiquetaOuErro, { origem: 'webhook' });
    await etapaWhatsappConfirmacao(supabase, ctx, { origem: 'webhook' });
    await etapaAvisoEquipe(supabase, ctx, etiquetaOuErro, alertas, { origem: 'webhook' });

    return ok200;
  } catch (err) {
    // 500 => o Mercado Pago reenvia depois. Seguro: o pedido so e
    // processado uma vez (update condicionado acima).
    console.error('Erro no webhook-mercadopago:', err);
    return { statusCode: 500, body: 'erro' };
  }
};

module.exports = toVercel(handler);
