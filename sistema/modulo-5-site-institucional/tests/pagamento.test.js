/**
 * Testes do checkout transparente (processar-pagamento) e dos avisos ao
 * comprador (WhatsApp), com Supabase, Mercado Pago, Resend e Evolution
 * simulados. Sem dependencias externas.
 *
 *   node --test tests/pagamento.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

/* ---- Mercado Pago simulado: guarda o que foi enviado ---- */
const mpChamadas = [];
let mpResposta = null;
function Payment() {}
Payment.prototype.create = async function (args) { mpChamadas.push(args); return mpResposta(args); };

/* ---- Supabase simulado (so o que processar-pagamento usa) ---- */
let tabelas = {};
function consulta(nome) {
  const filtros = [];
  let patch = null;
  const q = {
    select() { return q; },
    eq(c, v) { filtros.push((r) => r[c] === v); return q; },
    is(c, v) { filtros.push((r) => (r[c] == null) === (v == null)); return q; },
    update(p) { patch = p; return q; },
    insert(r) { (tabelas[nome] = tabelas[nome] || []).push(r); return Promise.resolve({ error: null }); },
    single() { const r = (tabelas[nome] || []).find((x) => filtros.every((f) => f(x))); return Promise.resolve({ data: r || null, error: r ? null : { message: 'nao achou' } }); },
    then(ok, err) {
      const linhas = (tabelas[nome] || []).filter((x) => filtros.every((f) => f(x)));
      if (patch) linhas.forEach((l) => Object.assign(l, patch));
      return Promise.resolve({ data: linhas, error: null }).then(ok, err);
    },
  };
  return q;
}
const db = { from: consulta, rpc: async () => ({ data: null, error: null }) };

const resolverOriginal = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === '@supabase/supabase-js' || req === 'mercadopago') return req;
  return resolverOriginal.call(this, req, parent, ...rest);
};
require.cache['@supabase/supabase-js'] = { id: '@supabase/supabase-js', filename: '@supabase/supabase-js', loaded: true, exports: { createClient: () => db } };
require.cache.mercadopago = { id: 'mercadopago', filename: 'mercadopago', loaded: true, exports: { MercadoPagoConfig: function () {}, Payment: Payment, Preference: function () {} } };

/* ---- fetch simulado: Resend e Evolution ---- */
const envios = [];
global.fetch = async (url, opts) => {
  envios.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null, headers: (opts && opts.headers) || {} });
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

process.env.ECOMMERCE_SUPABASE_URL = 'https://x.supabase.co';
process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY = 'chave-servico-teste';
process.env.MP_ACCESS_TOKEN_TESTE = 'TEST-token';
process.env.RESEND_API_KEY = 're_teste';
process.env.EVOLUTION_INSTANCE_TOKEN = 'evo-token';
process.env.SITE_URL = 'https://sitiolabareda.com';

const API = path.join(__dirname, '..', 'src', 'api');
const processar = require(path.join(API, 'processar-pagamento.js'));
const { tokenPedido } = require(path.join(API, '_pedido-token.js'));
const wpp = require(path.join(API, '_whatsapp.js'));
const { dadosPagador } = require(path.join(API, '_pagador.js'));

function novoBanco(statusPedido) {
  tabelas = {
    pedidos: [{
      id: 'ped-1', numero: 77, status: statusPedido || 'pendente', pago_at: null, total: 148.49, cliente_id: 'cli-1',
      reserva_expira_em: new Date(Date.now() + 20 * 3600 * 1000).toISOString(),
      endereco_entrega: { rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Uruçuca', estado: 'BA', cep: '45680-000' },
    }],
    clientes: [{ id: 'cli-1', nome: 'Maria da Silva Souza', email: 'maria@ex.com', telefone: '(73) 99999-1234', cpf: '52998224725' }],
    pedido_itens: [{ pedido_id: 'ped-1', nome_produto: 'Chocolate 70%', tamanho: null, quantidade: 2, preco_unitario: 50 }],
    pedido_eventos: [],
  };
  mpChamadas.length = 0;
  envios.length = 0;
}

async function chamar(corpo) {
  let status = 0, enviado = '';
  const res = { setHeader() {}, status(s) { status = s; return res; }, send(b) { enviado = b; }, json(b) { enviado = JSON.stringify(b); } };
  await processar({ method: 'POST', headers: {}, query: {}, body: JSON.stringify(corpo) }, res);
  return { status, corpo: JSON.parse(enviado || '{}') };
}

test('recusa pedido com token errado', async () => {
  novoBanco();
  const r = await chamar({ pedido_id: 'ped-1', t: 'token-falso', formData: { payment_method_id: 'pix' } });
  assert.equal(r.status, 404);
  assert.equal(mpChamadas.length, 0);
});

test('nao cobra pedido ja pago', async () => {
  novoBanco('pago');
  const r = await chamar({ pedido_id: 'ped-1', t: tokenPedido(77), formData: { payment_method_id: 'pix' } });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.status, 'approved');
  assert.equal(mpChamadas.length, 0);
});

test('Pix: valor vem do banco, devolve QR Code e avisa por email e WhatsApp', async () => {
  novoBanco();
  mpResposta = () => ({
    id: 999, status: 'pending', status_detail: 'pending_waiting_transfer', payment_method_id: 'pix',
    date_of_expiration: '2026-11-06T10:00:00.000-03:00',
    point_of_interaction: { transaction_data: { qr_code: '000201PIX', qr_code_base64: 'iVBOR', ticket_url: 'https://mp/ticket/999' } },
  });
  const r = await chamar({
    pedido_id: 'ped-1', t: tokenPedido(77), tentativa: 'a1',
    formData: { payment_method_id: 'bank_transfer', transaction_amount: 1, payer: { email: 'maria@ex.com' } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.metodo, 'pix');
  assert.equal(r.corpo.pix.qr_code, '000201PIX');
  const body = mpChamadas[0].body;
  assert.equal(body.transaction_amount, 148.49, 'valor do banco, nao o do navegador');
  assert.equal(body.payment_method_id, 'pix');
  assert.equal(body.external_reference, 'ped-1');
  assert.equal(body.payer.identification.number, '52998224725');
  assert.ok(body.date_of_expiration, 'Pix expira junto com a reserva');
  assert.equal(mpChamadas[0].requestOptions.idempotencyKey, 'ped-1-a1');
  assert.equal(tabelas.pedidos[0].mercadopago_id, '999');
  const emailPix = envios.find((e) => e.url.includes('resend') && /Seu Pix/.test(e.body.subject));
  assert.ok(emailPix, 'email do Pix');
  const termos = (emailPix.body.attachments || []).find((a) => /Termos/.test(a.filename));
  assert.ok(termos, 'termos e condicoes anexados');
  assert.ok(termos.content && Buffer.from(termos.content, 'base64').slice(0, 4).toString() === '%PDF', 'anexo e o PDF dos termos');
  const zap = envios.find((e) => e.url.endsWith('/send/text'));
  assert.ok(zap, 'WhatsApp do Pix');
  assert.equal(zap.body.number, '5573999991234');
  assert.equal(zap.headers.apikey, 'evo-token');
});

test('boleto: manda endereco completo e devolve o link', async () => {
  novoBanco();
  mpResposta = () => ({
    id: 1000, status: 'pending', payment_method_id: 'bolbradesco',
    transaction_details: { external_resource_url: 'https://mp/boleto/1000', digitable_line: '23790.12345' },
  });
  const r = await chamar({ pedido_id: 'ped-1', t: tokenPedido(77), formData: { payment_method_id: 'bolbradesco', payer: { email: 'maria@ex.com' } } });
  assert.equal(r.corpo.metodo, 'boleto');
  assert.equal(r.corpo.boleto.url, 'https://mp/boleto/1000');
  assert.equal(r.corpo.boleto.codigo, '23790.12345');
  const end = mpChamadas[0].body.payer.address;
  assert.equal(end.zip_code, '45680000');
  assert.equal(end.federal_unit, 'BA');
  assert.equal(mpChamadas[0].body.payer.first_name, 'Maria');
  assert.equal(mpChamadas[0].body.payer.last_name, 'da Silva Souza');
});

test('cartao recusado: explica o motivo sem jargao', async () => {
  novoBanco();
  mpResposta = () => ({ id: 1001, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', payment_method_id: 'master' });
  const r = await chamar({
    pedido_id: 'ped-1', t: tokenPedido(77),
    formData: { payment_method_id: 'master', token: 'tok-cartao', installments: 3, issuer_id: '24', payer: { email: 'maria@ex.com', identification: { type: 'CPF', number: '52998224725' } } },
  });
  assert.equal(r.corpo.status, 'rejected');
  assert.match(r.corpo.mensagem, /limite/);
  const body = mpChamadas[0].body;
  assert.equal(body.token, 'tok-cartao');
  assert.equal(body.installments, 3);
  assert.equal(body.transaction_amount, 148.49);
});

test('cartao sem token nao chega ao Mercado Pago', async () => {
  novoBanco();
  const r = await chamar({ pedido_id: 'ped-1', t: tokenPedido(77), formData: { payment_method_id: 'visa' } });
  assert.equal(r.status, 400);
  assert.equal(mpChamadas.length, 0);
});

test('WhatsApp: normaliza o numero do checkout', () => {
  assert.equal(wpp.numeroWhatsApp('(73) 99871-0452'), '5573998710452');
  assert.equal(wpp.numeroWhatsApp('+55 73 99871-0452'), '5573998710452');
  assert.equal(wpp.numeroWhatsApp('123'), '');
});

test('WhatsApp de confirmacao leva termos, nota e acompanhamento', () => {
  const txt = wpp.msgCompraConfirmada({ nome: 'Maria Souza' }, { numero: 77, total: 148.49 }, { danfeUrl: 'https://x/danfe.pdf' });
  assert.match(txt, /Oi, Maria!/);
  assert.match(txt, /termos-e-condicoes\.pdf/);
  assert.match(txt, /danfe\.pdf/);
  assert.match(txt, /pedido\.html\?numero=77/);
  assert.match(txt, /R\$ 148,49/);
});

test('pagador: CNPJ e telefone no formato do Mercado Pago', () => {
  const p = dadosPagador({ nome: 'Loja', email: 'a@b.com', cpf: '11222333000181', telefone: '73998710452', endereco: {} });
  assert.equal(p.identification.type, 'CNPJ');
  assert.deepEqual(p.phone, { area_code: '73', number: '998710452' });
  assert.equal(p.address, undefined);
});
