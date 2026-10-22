/**
 * Token do link "Acompanhar pedido" (arquivo com "_" => nao vira rota).
 *
 * O consultar-pedido so mostra um pedido para quem tem o numero E
 * (o email do comprador OU este token). O token vai nos links dos emails,
 * assim o cliente abre direto, mas ninguem consegue listar pedidos dos
 * outros trocando o numero na URL.
 *
 * Chave: PEDIDO_LINK_SECRET (opcional) ou, na falta, a service role key.
 * Se a chave mudar, links antigos param de abrir direto (o cliente ainda
 * consegue consultar digitando o email).
 */
const crypto = require('crypto');

function segredo() {
  return process.env.PEDIDO_LINK_SECRET || process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY || '';
}

function tokenPedido(numero) {
  const key = segredo();
  if (!key) return '';
  return crypto.createHmac('sha256', key).update('pedido:' + String(numero)).digest('hex').slice(0, 24);
}

function tokenValido(numero, token) {
  const esperado = tokenPedido(numero);
  if (!esperado || !token || String(token).length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(token)));
}

function linkAcompanhar(siteUrl, numero) {
  const t = tokenPedido(numero);
  return siteUrl.replace(/\/+$/, '') + '/pedido.html?numero=' + encodeURIComponent(numero) + (t ? '&t=' + t : '');
}

module.exports = { tokenPedido, tokenValido, linkAcompanhar };
