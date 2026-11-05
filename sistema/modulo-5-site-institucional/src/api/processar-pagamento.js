/**
 * ============================================================
 *  processar-pagamento  (Vercel Serverless Function)
 * ============================================================
 *  Checkout transparente: o cliente preenche o formulario de pagamento
 *  do Mercado Pago (Payment Brick) DENTRO do site e os dados vem pra ca.
 *  Aqui o pagamento e criado com a chave secreta — cartao, Pix ou boleto,
 *  sem o cliente precisar de conta Mercado Pago.
 *
 *  Recebe: { pedido_id, t (token do pedido, vindo do criar-pagamento),
 *            tentativa (id unico da tentativa, p/ idempotencia),
 *            formData (do Payment Brick) }
 *
 *  Seguranca:
 *   - So aceita pedido "pendente", sem pagamento aprovado, com o token certo.
 *   - O VALOR vem do banco (pedidos.total), nunca do navegador.
 *   - Cartao: o numero nunca passa por aqui — so o token gerado pelo Brick.
 *
 *  A confirmacao (baixa de estoque, etiqueta, nota, e-mails) continua no
 *  webhook-mercadopago: o pagamento leva external_reference = id do pedido.
 *
 *  Responde: { ok, metodo:'cartao'|'pix'|'boleto', status, status_detail,
 *              mensagem, pix?:{qr_code,qr_code_base64,ticket_url,expira_em},
 *              boleto?:{url,codigo} }
 *
 *  Variaveis de ambiente: as mesmas do criar-pagamento.
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { toVercel } = require('./_netlify-adapter');
const { tokenValido } = require('./_pedido-token');
const { registrarEvento } = require('./_pedido-registro');
const { dadosPagador } = require('./_pagador');
const { emailInstrucoesPagamento } = require('./_emails');
const { enviarWhatsApp, msgAguardandoPix, msgAguardandoBoleto } = require('./_whatsapp');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function resposta(status, corpo) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

function resolverAccessToken(env) {
  const ambiente = (env.MP_ENV || 'teste').toLowerCase();
  const prod = ambiente === 'producao' || ambiente === 'production' || ambiente === 'prod';
  return (prod ? env.MP_ACCESS_TOKEN_PROD : env.MP_ACCESS_TOKEN_TESTE) || env.MP_ACCESS_TOKEN || '';
}

// Data no formato do Mercado Pago, fuso de Brasilia (igual criar-pagamento)
function isoBrasilia(data) {
  const local = new Date(data.getTime() - 3 * 3600 * 1000);
  return local.toISOString().replace('Z', '-03:00');
}

/* Motivo da recusa do cartao em linguagem de gente (status_detail do MP). */
const RECUSAS = {
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a data de validade do cartão.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança (CVV) do cartão.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente. Tente outro cartão ou pague com Pix.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização: ligue para o seu banco e libere a compra, ou tente outro cartão.',
  cc_rejected_card_disabled: 'O cartão está bloqueado. Ligue para o banco para ativá-lo ou use outro cartão.',
  cc_rejected_duplicated_payment: 'Já existe um pagamento igual a este. Se não recebeu a confirmação, fale com a gente.',
  cc_rejected_high_risk: 'O pagamento foi recusado pela análise de segurança. Tente pagar com Pix ou outro cartão.',
  cc_rejected_max_attempts: 'Limite de tentativas atingido. Use outro cartão ou pague com Pix.',
  cc_rejected_blacklist: 'Não foi possível processar este cartão. Use outro cartão ou pague com Pix.',
  cc_rejected_card_type_not_allowed: 'Este tipo de cartão não é aceito. Tente outro cartão ou Pix.',
};
function mensagemRecusa(detail) {
  return RECUSAS[detail] || 'O pagamento não foi aprovado. Tente outro cartão ou pague com Pix.';
}

/* Tipo do meio de pagamento que veio do Brick */
function tipoDoMetodo(formData) {
  const id = String(formData.payment_method_id || '');
  if (id === 'pix' || id === 'bank_transfer') return 'pix';
  if (id === 'bolbradesco' || id === 'pec' || formData.payment_type_id === 'ticket') return 'boleto';
  return 'cartao';
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resposta(200, { ok: true });
  if (event.httpMethod !== 'POST') return resposta(405, { erro: 'Metodo nao permitido' });

  const SUPABASE_URL = process.env.ECOMMERCE_SUPABASE_URL;
  const SERVICE_KEY = process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
  const MP_ACCESS_TOKEN = resolverAccessToken(process.env);
  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return resposta(500, { erro: 'Configuracao do servidor incompleta.' });

  let siteUrl = (process.env.SITE_URL || 'https://sitiolabareda.com').trim().replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(siteUrl)) siteUrl = 'https://' + siteUrl.replace(/^\/+/, '');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resposta(400, { erro: 'JSON invalido' }); }
  const formData = body.formData || {};
  if (!body.pedido_id || !formData.payment_method_id) return resposta(400, { erro: 'Dados de pagamento incompletos.' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const { data: pedido } = await db.from('pedidos').select('*').eq('id', body.pedido_id).single();
    if (!pedido || !tokenValido(pedido.numero, body.t)) return resposta(404, { erro: 'Pedido não encontrado.' });
    if (pedido.pago_at || ['pago', 'preparando', 'enviado', 'entregue'].indexOf(pedido.status) >= 0) {
      return resposta(409, { erro: 'Este pedido já está pago.', status: 'approved' });
    }
    if (pedido.status !== 'pendente') {
      return resposta(409, { erro: 'Este pedido foi cancelado (o prazo de pagamento acabou). Faça o pedido de novo pela loja.' });
    }

    const { data: cli } = await db.from('clientes')
      .select('nome, email, telefone, cpf').eq('id', pedido.cliente_id).single();
    const cliente = Object.assign({}, cli || {}, { endereco: pedido.endereco_entrega || {} });
    const pagador = dadosPagador(cliente);
    const { data: itens } = await db.from('pedido_itens')
      .select('nome_produto, tamanho, quantidade, preco_unitario').eq('pedido_id', pedido.id);

    const tipo = tipoDoMetodo(formData);
    const fp = formData.payer || {};
    const idDoc = (fp.identification && fp.identification.number) ? fp.identification : pagador.identification;

    const pagamento = {
      transaction_amount: Math.round(Number(pedido.total) * 100) / 100,
      description: 'Pedido #' + pedido.numero + ' — Sítio Labareda',
      payment_method_id: tipo === 'pix' ? 'pix' : formData.payment_method_id,
      external_reference: pedido.id,
      notification_url: `${siteUrl}/api/webhook-mercadopago`,
      statement_descriptor: 'LABAREDA',
      payer: {
        email: fp.email || pagador.email,
        first_name: fp.first_name || pagador.first_name,
        last_name: fp.last_name || pagador.last_name,
        identification: idDoc,
      },
      additional_info: {
        items: (itens || []).map((i) => ({
          title: i.nome_produto + (i.tamanho ? ' (' + i.tamanho + ')' : ''),
          quantity: i.quantidade,
          unit_price: Number(i.preco_unitario),
        })),
        payer: {
          first_name: pagador.first_name,
          last_name: pagador.last_name,
          phone: pagador.phone,
          address: pagador.cep ? { zip_code: pagador.cep, street_name: pagador.end.rua || '', street_number: String(pagador.end.numero || '') } : undefined,
        },
        shipments: pagador.cep ? {
          receiver_address: { zip_code: pagador.cep, street_name: pagador.end.rua || '', street_number: String(pagador.end.numero || ''), city_name: pagador.end.cidade || '', state_name: pagador.end.estado || '' },
        } : undefined,
      },
    };

    if (tipo === 'cartao') {
      if (!formData.token) return resposta(400, { erro: 'Dados do cartão incompletos. Preencha de novo.' });
      pagamento.token = formData.token;
      pagamento.installments = Math.max(1, parseInt(formData.installments, 10) || 1);
      if (formData.issuer_id) pagamento.issuer_id = formData.issuer_id;
    } else if (tipo === 'boleto') {
      // Boleto exige endereco completo do pagador
      pagamento.payer.address = (fp.address && fp.address.zip_code) ? fp.address : pagador.address;
      if (!pagamento.payer.address) return resposta(400, { erro: 'Endereço incompleto para gerar o boleto.' });
    } else {
      // Pix vale enquanto o estoque estiver reservado (minimo do MP: 30 min)
      const limite = pedido.reserva_expira_em ? new Date(pedido.reserva_expira_em) : new Date(Date.now() + 24 * 3600 * 1000);
      if (limite.getTime() - Date.now() > 31 * 60 * 1000) pagamento.date_of_expiration = isoBrasilia(limite);
    }

    const mp = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const tentativa = String(body.tentativa || Date.now()).replace(/[^\w-]/g, '').slice(0, 40);
    let pg;
    try {
      pg = await new Payment(mp).create({ body: pagamento, requestOptions: { idempotencyKey: pedido.id + '-' + tentativa } });
    } catch (e) {
      const detalhe = (e && (e.message || (e.cause && JSON.stringify(e.cause)))) || String(e);
      console.error('processar-pagamento: Mercado Pago recusou a criacao:', detalhe);
      await registrarEvento(db, pedido.id, 'pagamento_erro', 'Mercado Pago não criou o pagamento (' + tipo + '): ' + String(detalhe).slice(0, 300), null, 'checkout');
      const msg = tipo === 'pix'
        ? 'Não conseguimos gerar o Pix agora. Tente de novo em instantes ou pague com cartão.'
        : tipo === 'boleto' ? 'Não conseguimos gerar o boleto agora. Tente de novo ou pague com Pix.'
          : 'Não conseguimos processar o cartão. Confira os dados ou pague com Pix.';
      return resposta(502, { erro: msg });
    }

    await db.from('pedidos').update({
      mercadopago_id: String(pg.id),
      mercadopago_status: pg.status,
      metodo_pagamento: pg.payment_method_id || pagamento.payment_method_id,
    }).eq('id', pedido.id).is('pago_at', null);
    await registrarEvento(db, pedido.id, 'pagamento_' + (pg.status || 'criado'),
      'Pagamento ' + (tipo === 'pix' ? 'Pix' : tipo === 'boleto' ? 'boleto' : 'cartão') + ' criado no site: ' + pg.status
        + (pg.status_detail ? ' (' + pg.status_detail + ')' : ''),
      { pagamento_id: String(pg.id), metodo: pg.payment_method_id, parcelas: pg.installments || null }, 'checkout');

    const saida = { ok: true, metodo: tipo, status: pg.status, status_detail: pg.status_detail || null };

    if (tipo === 'pix') {
      const td = (pg.point_of_interaction && pg.point_of_interaction.transaction_data) || {};
      saida.pix = {
        qr_code: td.qr_code || null,
        qr_code_base64: td.qr_code_base64 || null,
        ticket_url: td.ticket_url || null,
        expira_em: pg.date_of_expiration || null,
      };
      try {
        await emailInstrucoesPagamento(cliente, pedido, { tipo: 'pix', link: td.ticket_url, codigo: td.qr_code, expiraEm: pg.date_of_expiration });
        if (td.ticket_url) await enviarWhatsApp(cliente.telefone, msgAguardandoPix(cliente, pedido, td.ticket_url));
      } catch (e) { console.error('processar-pagamento: aviso do Pix (nao critico):', e.message); }
    } else if (tipo === 'boleto') {
      const det = pg.transaction_details || {};
      const linha = (pg.barcode && pg.barcode.content) || det.digitable_line || det.payment_method_reference_id || null;
      saida.boleto = { url: det.external_resource_url || null, codigo: linha };
      try {
        await emailInstrucoesPagamento(cliente, pedido, { tipo: 'boleto', link: det.external_resource_url, codigo: linha });
        if (det.external_resource_url) await enviarWhatsApp(cliente.telefone, msgAguardandoBoleto(cliente, pedido, det.external_resource_url));
      } catch (e) { console.error('processar-pagamento: aviso do boleto (nao critico):', e.message); }
    } else if (pg.status === 'rejected') {
      saida.mensagem = mensagemRecusa(pg.status_detail);
    } else if (pg.status === 'in_process' || pg.status === 'pending') {
      saida.mensagem = 'Seu pagamento está em análise pelo Mercado Pago. Você recebe a confirmação por e-mail e WhatsApp em instantes.';
    }

    return resposta(200, saida);
  } catch (err) {
    console.error('Erro em processar-pagamento:', err);
    return resposta(500, { erro: 'Falha ao processar o pagamento. Tente novamente.' });
  }
};

module.exports = toVercel(handler);
