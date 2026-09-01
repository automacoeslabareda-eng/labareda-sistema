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
 *   4. Gera etiqueta (POST /api/v0/order/checkout ou /api/v0/order)
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
  var env = process.env.SUPERFRETE_ENV || 'sandbox';
  var baseUrl = env === 'producao'
    ? 'https://api.superfrete.com'
    : 'https://sandbox.superfrete.com';
  var cepOrigem = process.env.SUPERFRETE_CEP_ORIGEM || '45653000';
  return { token: token, baseUrl: baseUrl, cepOrigem: cepOrigem };
}

async function criarEnvioSuperFrete(sf, pedido, cliente, itens) {
  var end = pedido.endereco_entrega || {};

  // Monta dados do remetente
  var from = {
    name: 'Sitio Labareda',
    phone: process.env.WHATSAPP_PEDIDOS || '73998150799',
    email: 'sitiolabareda@gmail.com',
    document: process.env.SUPERFRETE_CNPJ || '',
    company_document: process.env.SUPERFRETE_CNPJ || '',
    state_register: '',
    address: process.env.SUPERFRETE_RUA_ORIGEM || 'Rodovia BA-001, KM 39,5',
    complement: '',
    number: process.env.SUPERFRETE_NUM_ORIGEM || 'SN',
    district: process.env.SUPERFRETE_BAIRRO_ORIGEM || 'Serra Grande',
    city: process.env.SUPERFRETE_CIDADE_ORIGEM || 'Urucuca',
    state_abbr: process.env.SUPERFRETE_UF_ORIGEM || 'BA',
    country_id: 'BR',
    postal_code: sf.cepOrigem,
  };

  // Monta dados do destinatario
  var to = {
    name: cliente.nome || '',
    phone: (cliente.telefone || '').replace(/\D/g, ''),
    email: cliente.email || '',
    document: cliente.cpf || '',
    address: end.rua || '',
    complement: end.complemento || '',
    number: end.numero || '',
    district: end.bairro || '',
    city: end.cidade || '',
    state_abbr: end.estado || '',
    country_id: 'BR',
    postal_code: (end.cep || '').replace(/\D/g, ''),
  };

  // Calcula peso total
  var pesoTotal = 0.3; // minimo 300g
  var valorTotal = Number(pedido.subtotal) || 0;
  var products = (itens || []).map(function (it) {
    return { name: it.nome_produto, quantity: it.quantidade, unitary_value: Number(it.preco_unitario) || 0 };
  });

  // Service ID: 1=PAC, 2=SEDEX, 17=Mini Envios
  var serviceId = pedido.frete_service_id || 1;

  var payload = {
    from: from,
    to: to,
    service: serviceId,
    products: products,
    package: {
      height: 15,
      width: 30,
      length: 40,
      weight: Math.max(0.3, pesoTotal),
    },
    options: {
      insurance_value: valorTotal,
      receipt: false,
      own_hand: false,
      non_commercial: true,
    },
  };

  // 1. Adiciona ao carrinho SuperFrete
  var cartRes = await fetch(sf.baseUrl + '/api/v0/cart', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + sf.token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'SitioLabareda/1.0 (sitiolabareda@gmail.com)',
    },
    body: JSON.stringify(payload),
  });

  if (!cartRes.ok) {
    var errText = await cartRes.text();
    console.error('SuperFrete cart error:', cartRes.status, errText);
    throw new Error('Erro ao criar envio no SuperFrete: ' + cartRes.status);
  }

  var cartData = await cartRes.json();

  // 2. Gera a etiqueta (checkout do carrinho)
  var checkoutPayload = { orders: [cartData.id] };
  var orderRes = await fetch(sf.baseUrl + '/api/v0/order', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + sf.token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'SitioLabareda/1.0 (sitiolabareda@gmail.com)',
    },
    body: JSON.stringify(checkoutPayload),
  });

  if (!orderRes.ok) {
    var errText2 = await orderRes.text();
    console.error('SuperFrete order error:', orderRes.status, errText2);
    throw new Error('Erro ao gerar etiqueta no SuperFrete: ' + orderRes.status + '. Verifique o saldo/credito.');
  }

  var orderData = await orderRes.json();

  // Extrai dados da etiqueta
  var order = Array.isArray(orderData) ? orderData[0] : orderData;
  return {
    superfrete_order_id: order.id || cartData.id,
    tracking: order.tracking || cartData.tracking || null,
    label_url: order.print && order.print.url ? order.print.url : null,
    status: order.status || 'generated',
    service_name: order.service_name || '',
    protocol: order.protocol || '',
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
  var acompanharUrl = siteUrl + '/pedido.html?numero=' + pedido.numero;
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

/* ---- Handler principal ---- */
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

  // SuperFrete config
  var sf = getSuperfrete();
  if (!sf) return resposta(500, { erro: 'SUPERFRETE_TOKEN nao configurado.' });

  var db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    // 1. Busca pedido + cliente
    var { data: pedido, error: errPed } = await db
      .from('pedidos')
      .select('*, clientes(nome, email, telefone, cpf, endereco_cep)')
      .eq('id', pedidoId)
      .single();
    if (errPed || !pedido) return resposta(404, { erro: 'Pedido nao encontrado.' });
    if (pedido.status !== 'pago' && pedido.status !== 'preparando') {
      return resposta(400, { erro: 'Pedido precisa estar com status "pago" ou "preparando" para gerar etiqueta.' });
    }

    // 2. Busca itens
    var { data: itens } = await db
      .from('pedido_itens')
      .select('nome_produto, quantidade, preco_unitario')
      .eq('pedido_id', pedidoId);

    var cliente = pedido.clientes || {};

    // 3. Gera etiqueta no SuperFrete
    var etiqueta = await criarEnvioSuperFrete(sf, pedido, cliente, itens);

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
    if (cliente.email && etiqueta.tracking) {
      emailEnviado = await enviarEmailRastreamento(cliente, pedido, etiqueta.tracking, rastreioUrl);
    }

    return resposta(200, {
      ok: true,
      tracking: etiqueta.tracking,
      rastreio_url: rastreioUrl,
      etiqueta_url: etiqueta.label_url,
      superfrete_order_id: etiqueta.superfrete_order_id,
      email_enviado: emailEnviado,
    });

  } catch (err) {
    console.error('gerar-etiqueta erro:', err);
    return resposta(500, {
      erro: 'Falha ao gerar etiqueta.',
      detalhe: String(err && err.message ? err.message : err),
    });
  }
};

module.exports = toVercel(handler);
