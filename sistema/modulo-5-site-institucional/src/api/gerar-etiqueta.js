/**
 * ============================================================
 *  gerar-etiqueta  (Vercel Serverless Function)
 * ============================================================
 *  Gera etiqueta de envio via SuperFrete, salva no pedido e
 *  envia email de rastreamento ao cliente.
 *
 *  Requer: admin token (mesmo auth do admin-api.js)
 *  Recebe: { pedido_id, service_id? (default: PAC=1) }
 *
 *  Fluxo:
 *   1. Valida token admin
 *   2. Busca pedido + cliente + itens no Supabase
 *   3. Cria envio no SuperFrete (POST /api/v0/cart)
 *   4. Paga a etiqueta (POST /api/v0/checkout) e pega o PDF (POST /api/v0/tag/print)
 *   5. Salva tracking + etiqueta_url no pedido
 *   6. Envia email ao cliente com rastreamento
 *   7. Retorna dados da etiqueta
 *
 *  Variaveis de ambiente:
 *   - ECOMMERCE_SUPABASE_URL, ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY
 *   - SUPERFRETE_TOKEN, SUPERFRETE_ENV ('sandbox'|'producao')
 *   - SUPERFRETE_CEP_ORIGEM (default: 45653000)
 *   - RESEND_API_KEY (para email de rastreamento)
 *   - EMAIL_FROM (default: Sitio Labareda <noreply@sitiolabareda.com>)
 *   - SITE_URL (default: https://sitiolabareda.com)
 *   - WHATSAPP_PEDIDOS (default: 5573998150799)
 * ============================================================
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { toVercel } = require('./_netlify-adapter');
const { linkAcompanhar } = require('./_pedido-token');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function resposta(status, corpo) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

/* ---- Auth (mesma logica do admin-api.js) ---- */
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function verificarToken(token, secret) {
  if (!token || token.indexOf('.') < 0) return null;
  var parts = token.split('.');
  var expected = b64url(crypto.createHmac('sha256', secret).update(parts[0]).digest());
  if (parts[1] !== expected) return null;
  var payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch (e) { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/* ---- SuperFrete ---- */
function getSuperfrete() {
  var token = process.env.SUPERFRETE_TOKEN;
  if (!token) return null;
  // Mesma regra tolerante do cotacao-frete.js
  var env = (process.env.SUPERFRETE_ENV || 'sandbox').trim().toLowerCase();
  var baseUrl = ['producao', 'produção', 'production', 'prod'].indexOf(env) >= 0
    ? 'https://api.superfrete.com'
    : 'https://sandbox.superfrete.com';
  var cepOrigem = process.env.SUPERFRETE_CEP_ORIGEM || '45653000';
  return { token: token, baseUrl: baseUrl, cepOrigem: cepOrigem };
}

function motivoSuperFrete(texto) {
  try {
    var j = JSON.parse(texto);
    var m = j.message || j.error || (j.errors ? JSON.stringify(j.errors) : '');
    return String(m || texto).slice(0, 200);
  } catch (e) { return String(texto || '').slice(0, 200); }
}

async function criarEnvioSuperFrete(sf, pedido, cliente, itens, db) {
  var end = pedido.endereco_entrega || {};

  // Regras do POST /api/v0/cart (superfrete.readme.io/reference/adicionar-frete-carrinho):
  // CEP/CPF so digitos, UF 2 letras maiusculas, telefone com 11 digitos (sem
  // DDI), limites de tamanho por campo, district "NA" se vazio.
  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function corta(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function telefone11(v) {
    var d = digitos(v);
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    return d.length === 11 ? d : '';
  }

  // Monta dados do remetente
  var from = {
    name: corta('Sitio Labareda', 50),
    address: corta(process.env.SUPERFRETE_RUA_ORIGEM || 'Rodovia BA-001, KM 39,5', 50),
    complement: '',
    number: corta(process.env.SUPERFRETE_NUM_ORIGEM || 'SN', 10),
    district: corta(process.env.SUPERFRETE_BAIRRO_ORIGEM || 'Serra Grande', 60) || 'NA',
    city: corta(process.env.SUPERFRETE_CIDADE_ORIGEM || 'Urucuca', 50),
    state_abbr: corta(process.env.SUPERFRETE_UF_ORIGEM || 'BA', 2).toUpperCase(),
    postal_code: digitos(sf.cepOrigem),
  };
  var telOrigem = telefone11(process.env.WHATSAPP_PEDIDOS || '73998150799');
  if (telOrigem) from.phone = telOrigem;
  // Sem documento: a SuperFrete usa o da conta (string vazia da erro)
  if (process.env.SUPERFRETE_CNPJ) from.document = digitos(process.env.SUPERFRETE_CNPJ);

  // Monta dados do destinatario
  var to = {
    name: corta(cliente.nome, 50),
    address: corta(end.rua, 50),
    complement: corta(end.complemento, 20),
    number: corta(end.numero, 10),
    district: corta(end.bairro, 50) || 'NA',
    city: corta(end.cidade, 50),
    state_abbr: corta(end.estado, 2).toUpperCase(),
    postal_code: digitos(end.cep),
    document: digitos(cliente.cpf),
    email: cliente.email || null,
  };
  var telDestino = telefone11(cliente.telefone);
  if (telDestino) to.phone = telDestino;

  // Calcula peso e dimensões reais a partir dos produtos
  var pesoTotal = 0;
  var pkgHeight = 0, pkgWidth = 0, pkgLength = 0;
  var valorTotal = Number(pedido.subtotal) || 0;
  var products = (itens || []).map(function (it) {
    var prod = it.produtos || {};
    var qty = it.quantidade || 1;
    var pesoItem = (prod.peso_gramas || 200) / 1000;
    pesoTotal += pesoItem * qty;
    // Altura soma (empilha), largura e comprimento pega o maior
    pkgHeight += (prod.frete_altura || 5) * qty;
    if ((prod.frete_largura || 20) > pkgWidth) pkgWidth = prod.frete_largura || 20;
    if ((prod.frete_comprimento || 30) > pkgLength) pkgLength = prod.frete_comprimento || 30;
    return { name: it.nome_produto, quantity: String(qty), unitary_value: String(Number(it.preco_unitario) || 0) };
  });

  // Service ID: 1=PAC, 2=SEDEX, 17=Mini Envios
  var serviceId = parseInt(pedido.frete_service_id, 10) || 1;

  var payload = {
    from: from,
    to: to,
    service: serviceId,
    products: products,
    platform: 'Sitio Labareda',
    volumes: {
      height: Math.max(2, Math.ceil(pkgHeight)),
      width: Math.max(11, Math.ceil(pkgWidth)),
      length: Math.max(16, Math.ceil(pkgLength)),
      weight: Math.max(0.3, pesoTotal),
    },
    options: {
      insurance_value: valorTotal,
      receipt: false,
      own_hand: false,
      non_commercial: true,
    },
  };

  var headers = {
    'Authorization': 'Bearer ' + sf.token,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'SitioLabareda/1.0 (sitiolabareda@gmail.com)',
  };

  // 1. Cria o envio no carrinho SuperFrete (POST /api/v0/cart) e guarda o id
  //    no pedido logo em seguida. Se o pagamento falhar (ex.: sem saldo), a
  //    proxima tentativa reaproveita esse envio em vez de criar outro.
  async function criarCarrinho() {
    var cartRes = await fetch(sf.baseUrl + '/api/v0/cart', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });
    if (!cartRes.ok) {
      var errText = await cartRes.text();
      console.error('SuperFrete cart error:', cartRes.status, errText, '| payload:', JSON.stringify(payload));
      var motivo = motivoSuperFrete(errText);
      throw new Error('Erro ao criar envio no SuperFrete: ' + cartRes.status + (motivo ? ' — ' + motivo : ''));
    }
    var data = await cartRes.json();
    if (db && data && data.id) {
      await db.from('pedidos').update({ superfrete_order_id: data.id }).eq('id', pedido.id);
    }
    return data;
  }

  // 2. Paga o frete e gera a etiqueta (POST /api/v0/checkout — usa o saldo
  //    da conta SuperFrete). Resposta: { success, purchase: { orders: [{ id,
  //    tracking, print: { url } }] } }. Doc: superfrete.readme.io/reference/apiintegrationv1checkout
  async function pagar(id) {
    return fetch(sf.baseUrl + '/api/v0/checkout', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ orders: [id] }),
    });
  }

  var reaproveitado = !!(pedido.superfrete_order_id && !pedido.codigo_rastreio);
  var cartData = reaproveitado ? { id: pedido.superfrete_order_id } : await criarCarrinho();
  var orderRes = await pagar(cartData.id);

  // Envio reaproveitado sumiu do carrinho (apagado no site da SuperFrete):
  // cria um novo uma vez.
  if (!orderRes.ok && reaproveitado && (orderRes.status === 404 || orderRes.status === 422)) {
    cartData = await criarCarrinho();
    orderRes = await pagar(cartData.id);
  }

  if (!orderRes.ok) {
    var errText2 = await orderRes.text();
    console.error('SuperFrete checkout error:', orderRes.status, errText2);
    var motivo2 = motivoSuperFrete(errText2);
    throw new Error('Erro ao pagar a etiqueta no SuperFrete: ' + orderRes.status
      + (motivo2 ? ' — ' + motivo2 : '. Verifique o saldo/credito.'));
  }

  var orderData = await orderRes.json();
  if (orderData && orderData.success === false) {
    console.error('SuperFrete checkout recusado:', JSON.stringify(orderData));
    throw new Error('SuperFrete recusou a etiqueta: ' + (orderData.message || orderData.error || 'verifique o saldo/credito'));
  }
  var compra = (orderData && orderData.purchase) || {};
  var order = (Array.isArray(compra.orders) && compra.orders[0]) || {};
  var orderId = order.id || cartData.id;
  var labelUrl = order.print && order.print.url ? order.print.url : null;

  // 3. O checkout pode voltar com print.url vazio: pede o link do PDF em
  //    POST /api/v0/tag/print. Doc: superfrete.readme.io/reference/tag-link
  if (!labelUrl) {
    try {
      var printRes = await fetch(sf.baseUrl + '/api/v0/tag/print', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ orders: [orderId] }),
      });
      if (printRes.ok) {
        var printData = await printRes.json();
        labelUrl = printData && printData.url ? printData.url : null;
      } else {
        console.error('SuperFrete tag/print error:', printRes.status, await printRes.text().catch(function () { return ''; }));
      }
    } catch (e) {
      console.error('SuperFrete tag/print falhou:', e.message);
    }
  }

  return {
    superfrete_order_id: orderId,
    tracking: order.tracking || cartData.tracking || null,
    label_url: labelUrl,
    status: compra.status || 'generated',
    service_name: cartData.service_name || '',
    protocol: cartData.protocol || '',
  };
}

/* ---- Email de rastreamento ---- */
async function enviarEmailRastreamento(cliente, pedido, tracking, rastreioUrl) {
  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('[gerar-etiqueta] RESEND_API_KEY nao configurada. Email nao enviado.');
    return false;
  }

  var siteUrl = (process.env.SITE_URL || 'https://sitiolabareda.com').replace(/\/+$/, '');
  var whatsapp = process.env.WHATSAPP_PEDIDOS || '5573998150799';
  var whatsappLink = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent('Oi! Tenho uma duvida sobre o pedido #' + pedido.numero);
  var acompanharUrl = linkAcompanhar(siteUrl, pedido.numero);
  var from = process.env.EMAIL_FROM || 'Sitio Labareda <noreply@sitiolabareda.com>';

  var html = [
    '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#2E2624;">',
    '<h2 style="color:#AA3424;text-align:center;margin-bottom:24px;">Sitio Labareda</h2>',
    '<p>Ola, ' + (cliente.nome || '').split(' ')[0] + '!</p>',
    '<p>Seu pedido <strong>#' + pedido.numero + '</strong> foi enviado! 🎉</p>',
    '<div style="background:#f5f0e8;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">',
    '<p style="margin:0 0 8px;font-size:.85rem;color:#6b5f56;">Codigo de rastreamento</p>',
    '<p style="font-size:1.3rem;font-weight:bold;letter-spacing:.15em;margin:0;">' + tracking + '</p>',
    '</div>',
    '<div style="text-align:center;margin:20px 0;">',
    '<a href="' + rastreioUrl + '" style="display:inline-block;background:#AA3424;color:#F3E9D2;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:.9rem;">Rastrear meu pedido</a>',
    '</div>',
    '<p style="font-size:.85rem;color:#6b5f56;">Voce tambem pode acompanhar seu pedido em: <a href="' + acompanharUrl + '">' + acompanharUrl + '</a></p>',
    '<hr style="border:none;border-top:1px solid #e0d5c5;margin:24px 0;">',
    '<p style="font-size:.85rem;color:#6b5f56;">Duvidas sobre seu pedido ou entrega?</p>',
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
        subject: 'Seu pedido #' + pedido.numero + ' foi enviado! — Sitio Labareda',
        html: html,
      }),
    });
    if (!res.ok) {
      var errBody = await res.text().catch(function () { return ''; });
      console.error('[gerar-etiqueta] Erro Resend:', res.status, errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[gerar-etiqueta] Erro ao enviar email:', err);
    return false;
  }
}

/* ---- Logica reutilizavel: gera a etiqueta pra um pedido ----
   Usada tanto pelo endpoint HTTP (admin manual) quanto pelo webhook do
   Mercado Pago (automatico, assim que o pagamento e aprovado).
   opcoes.enviarEmail === false: nao manda o email de rastreamento (o webhook
   ja manda o rastreio dentro do email de confirmacao de pagamento). */
async function gerarEtiquetaParaPedido(db, pedidoId, opcoes) {
  var sf = getSuperfrete();
  if (!sf) throw new Error('SUPERFRETE_TOKEN nao configurado.');

  // 1. Busca pedido + cliente
  var { data: pedido, error: errPed } = await db
    .from('pedidos')
    .select('*, clientes(nome, email, telefone, cpf, endereco_cep)')
    .eq('id', pedidoId)
    .single();
  if (errPed || !pedido) throw new Error('Pedido nao encontrado.');
  if (pedido.status !== 'pago' && pedido.status !== 'preparando') {
    throw new Error('Pedido precisa estar com status "pago" ou "preparando" para gerar etiqueta.');
  }

  // 2. Busca itens com dimensões do produto
  var { data: itens } = await db
    .from('pedido_itens')
    .select('nome_produto, quantidade, preco_unitario, produto_id, produtos(peso_gramas, frete_altura, frete_largura, frete_comprimento)')
    .eq('pedido_id', pedidoId);

  var cliente = pedido.clientes || {};

  // 3. Gera etiqueta no SuperFrete
  var etiqueta = await criarEnvioSuperFrete(sf, pedido, cliente, itens, db);

  // 4. Atualiza pedido com tracking e etiqueta
  var rastreioUrl = 'https://www.linkcorreios.com.br/?id=' + (etiqueta.tracking || '');
  var updateData = {
    status: 'enviado',
    codigo_rastreio: etiqueta.tracking,
    rastreio_url: rastreioUrl,
    enviado_at: new Date().toISOString(),
    superfrete_order_id: etiqueta.superfrete_order_id,
    etiqueta_url: etiqueta.label_url,
  };
  await db.from('pedidos').update(updateData).eq('id', pedidoId);

  // 5. Envia email de rastreamento
  var emailEnviado = false;
  if (cliente.email && etiqueta.tracking && !(opcoes && opcoes.enviarEmail === false)) {
    emailEnviado = await enviarEmailRastreamento(cliente, pedido, etiqueta.tracking, rastreioUrl);
  }

  return {
    tracking: etiqueta.tracking,
    rastreio_url: rastreioUrl,
    etiqueta_url: etiqueta.label_url,
    superfrete_order_id: etiqueta.superfrete_order_id,
    email_enviado: emailEnviado,
  };
}

/* ---- Handler principal (chamado manualmente pelo admin, com token) ---- */
const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resposta(200, { ok: true });
  if (event.httpMethod !== 'POST') return resposta(405, { erro: 'Metodo nao permitido' });

  var SERVICE_KEY = process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
  var SUPABASE_URL = process.env.ECOMMERCE_SUPABASE_URL;
  if (!SUPABASE_URL || !SERVICE_KEY) return resposta(500, { erro: 'Configuracao do servidor incompleta.' });

  // Auth
  var auth = ((event.headers || {}).authorization || (event.headers || {}).Authorization || '').replace(/^Bearer\s+/i, '');
  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resposta(400, { erro: 'JSON invalido' }); }
  var sessao = verificarToken(auth || body.token, SERVICE_KEY);
  if (!sessao) return resposta(401, { erro: 'Sessao invalida ou expirada.' });

  var pedidoId = body.pedido_id;
  if (!pedidoId) return resposta(400, { erro: 'pedido_id obrigatorio.' });

  var db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    var resultado = await gerarEtiquetaParaPedido(db, pedidoId);
    return resposta(200, { ok: true, ...resultado });
  } catch (err) {
    console.error('gerar-etiqueta erro:', err);
    return resposta(500, {
      erro: 'Falha ao gerar etiqueta.',
      detalhe: String(err && err.message ? err.message : err),
    });
  }
};

module.exports = toVercel(handler);
module.exports.gerarEtiquetaParaPedido = gerarEtiquetaParaPedido;
