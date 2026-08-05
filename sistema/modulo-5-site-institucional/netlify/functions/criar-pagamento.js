/**
 * ============================================================
 *  criar-pagamento  (Netlify Function)
 * ============================================================
 *  O QUE FAZ (em portugues simples):
 *  O site (Shop do modulo 5) JA cria o pedido no Supabase durante o
 *  checkout (cliente + pedido "pendente" + itens). Esta funcao recebe
 *  o ID desse pedido, LE os dados no banco (nunca confia no navegador),
 *  cria a "preferencia" de pagamento no Mercado Pago (Checkout Pro) e
 *  devolve o link para onde o cliente sera enviado para pagar.
 *
 *  Variaveis de ambiente (configurar no painel Netlify):
 *   - MP_ACCESS_TOKEN            (secreta) Access Token do Mercado Pago
 *   - SUPABASE_URL                         URL do projeto Site-ecommerce
 *   - SUPABASE_SERVICE_ROLE_KEY  (secreta) chave service_role
 *   - SITE_URL                             URL publica do site (back_urls)
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(status, corpo) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resposta(200, { ok: true });
  if (event.httpMethod !== 'POST') return resposta(405, { erro: 'Metodo nao permitido' });

  const { MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL } = process.env;
  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return resposta(500, { erro: 'Configuracao do servidor incompleta (variaveis de ambiente).' });
  }
  const siteUrl = (SITE_URL || '').replace(/\/$/, '') || 'https://sitiolabareda.netlify.app';

  let dados;
  try {
    dados = JSON.parse(event.body || '{}');
  } catch (e) {
    return resposta(400, { erro: 'Corpo da requisicao invalido (JSON).' });
  }

  const pedidoId = dados.pedido_id;
  if (!pedidoId) return resposta(400, { erro: 'pedido_id ausente.' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    // 1. Le o pedido no banco (fonte da verdade)
    const { data: pedido, error: errPed } = await supabase
      .from('pedidos')
      .select('id, numero, status, subtotal, frete, total, cliente_id')
      .eq('id', pedidoId)
      .single();
    if (errPed || !pedido) return resposta(404, { erro: 'Pedido nao encontrado.' });
    if (pedido.status === 'pago') return resposta(409, { erro: 'Pedido ja foi pago.' });

    // 2. Le os itens do pedido
    const { data: itens, error: errItens } = await supabase
      .from('pedido_itens')
      .select('nome_produto, quantidade, preco_unitario')
      .eq('pedido_id', pedidoId);
    if (errItens) throw errItens;
    if (!itens || itens.length === 0) return resposta(400, { erro: 'Pedido sem itens.' });

    // 3. Le dados do cliente (para preencher o pagador no MP)
    let payer;
    if (pedido.cliente_id) {
      const { data: cli } = await supabase
        .from('clientes')
        .select('nome, email, telefone')
        .eq('id', pedido.cliente_id)
        .single();
      if (cli && cli.email) payer = { name: cli.nome || '', email: cli.email };
    }

    // 4. Monta os itens para o Mercado Pago (valores do banco)
    const itemsMP = itens.map((i) => ({
      title: i.nome_produto,
      quantity: Number(i.quantidade),
      unit_price: Number(i.preco_unitario),
      currency_id: 'BRL',
    }));
    if (Number(pedido.frete) > 0) {
      itemsMP.push({ title: 'Frete', quantity: 1, unit_price: Number(pedido.frete), currency_id: 'BRL' });
    }

    // 5. Cria a preferencia no Mercado Pago (Checkout Pro)
    const mp = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const preference = new Preference(mp);
    const pref = await preference.create({
      body: {
        items: itemsMP,
        external_reference: pedido.id, // o webhook usa isso para achar o pedido
        payer,
        back_urls: {
          success: `${siteUrl}/?pagamento=sucesso&pedido=${pedido.numero}#shop`,
          failure: `${siteUrl}/?pagamento=falhou#shop`,
          pending: `${siteUrl}/?pagamento=pendente#shop`,
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/.netlify/functions/webhook-mercadopago`,
        statement_descriptor: 'LABAREDA',
      },
    });

    // 6. Guarda o id da preferencia no pedido
    await supabase.from('pedidos').update({ mercadopago_id: pref.id }).eq('id', pedido.id);

    return resposta(200, {
      ok: true,
      pedido_id: pedido.id,
      pedido_numero: pedido.numero,
      preference_id: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
    });
  } catch (err) {
    console.error('Erro em criar-pagamento:', err);
    return resposta(500, { erro: 'Falha ao criar pagamento.', detalhe: String(err && err.message ? err.message : err) });
  }
};
