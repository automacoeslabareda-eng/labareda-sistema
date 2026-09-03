/**
 * consultar-pedido (Vercel Serverless Function)
 * Endpoint PUBLICO — nao requer login.
 * Recebe { numero: "XXX" } e retorna status, rastreio e itens do pedido.
 */

const { createClient } = require('@supabase/supabase-js');
const { toVercel } = require('./_netlify-adapter');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function resposta(status, corpo) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resposta(200, { ok: true });
  if (event.httpMethod !== 'POST') return resposta(405, { erro: 'Metodo nao permitido' });

  const SUPABASE_URL = process.env.ECOMMERCE_SUPABASE_URL;
  const SERVICE_KEY = process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return resposta(500, { erro: 'Configuracao incompleta.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resposta(400, { erro: 'JSON invalido' }); }

  const numero = (body.numero || '').toString().trim();
  if (!numero) return resposta(400, { erro: 'Informe o numero do pedido.' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    // Busca por numero do pedido
    const { data: pedido, error } = await db
      .from('pedidos')
      .select('id,numero,status,subtotal,frete,total,metodo_pagamento,codigo_rastreio,rastreio_url,enviado_at,created_at,endereco_entrega')
      .eq('numero', parseInt(numero, 10))
      .single();

    if (error || !pedido) return resposta(404, { erro: 'Pedido nao encontrado. Verifique o numero.' });

    // Busca itens do pedido
    const { data: itens } = await db
      .from('pedido_itens')
      .select('nome_produto,tamanho,quantidade,preco_unitario,subtotal')
      .eq('pedido_id', pedido.id);

    // Traduz status para texto amigavel
    const statusMap = {
      pendente: 'Aguardando pagamento',
      pago: 'Pagamento confirmado',
      preparando: 'Preparando para envio',
      enviado: 'Enviado',
      entregue: 'Entregue',
      cancelado: 'Cancelado',
    };

    return resposta(200, {
      ok: true,
      pedido: {
        numero: pedido.numero,
        status: pedido.status,
        status_texto: statusMap[pedido.status] || pedido.status,
        subtotal: pedido.subtotal,
        frete: pedido.frete,
        total: pedido.total,
        codigo_rastreio: pedido.codigo_rastreio || null,
        rastreio_url: pedido.rastreio_url || null,
        enviado_at: pedido.enviado_at || null,
        criado_em: pedido.created_at,
        itens: itens || [],
      },
    });
  } catch (err) {
    console.error('consultar-pedido erro:', err);
    return resposta(500, { erro: 'Erro ao consultar pedido.' });
  }
};

module.exports = toVercel(handler);
