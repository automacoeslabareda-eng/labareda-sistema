/**
 * ============================================================
 *  codigo-validacao  (Vercel Serverless Function)
 * ============================================================
 *  Gera e valida codigos de verificacao por email (6 digitos).
 *  Usa HMAC para validacao stateless (sem tabela extra).
 *
 *  POST { acao:'enviar', email }        → gera codigo, envia email, retorna assinatura
 *  POST { acao:'validar', email, codigo, assinatura, expira } → valida codigo
 *
 *  Envia email via Resend (RESEND_API_KEY). Se nao configurado,
 *  loga o codigo no console (modo desenvolvimento).
 *
 *  Variaveis de ambiente:
 *   - RESEND_API_KEY (opcional — sem ela o email nao eh enviado)
 *   - EMAIL_FROM (opcional — default: noreply@sitiolabareda.com)
 *   - ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY (usado como HMAC secret)
 * ============================================================
 */

const crypto = require('crypto');
const { toVercel } = require('./_netlify-adapter');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function resposta(status, corpo) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

function getSecret() {
  return process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY || process.env.CODIGO_SECRET || 'labareda-dev-secret';
}

function gerarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function criarHmac(email, codigo, expira) {
  return crypto.createHmac('sha256', getSecret()).update(email + '|' + codigo + '|' + expira).digest('hex');
}

async function enviarEmail(email, codigo) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('[codigo-validacao] RESEND_API_KEY nao configurada. Codigo:', codigo);
    return false;
  }

  const from = process.env.EMAIL_FROM || 'Sitio Labareda <noreply@sitiolabareda.com>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Codigo de validacao — Sitio Labareda',
      html: [
        '<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px;text-align:center;">',
        '<h2 style="color:#AA3424;margin-bottom:24px;">Sitio Labareda</h2>',
        '<p style="color:#2E2624;">Seu codigo de validacao:</p>',
        '<p style="font-size:2.2rem;font-weight:bold;letter-spacing:.35em;color:#2E2624;margin:20px 0;">' + codigo + '</p>',
        '<p style="color:#6b5f56;font-size:.85rem;">Valido por 10 minutos. Se voce nao solicitou, ignore este email.</p>',
        '</div>',
      ].join(''),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(function () { return ''; });
    console.error('[codigo-validacao] Erro Resend:', res.status, err);
    return false;
  }
  return true;
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resposta(200, { ok: true });
  if (event.httpMethod !== 'POST') return resposta(405, { erro: 'Metodo nao permitido' });

  var dados;
  try { dados = JSON.parse(event.body || '{}'); } catch (e) { return resposta(400, { erro: 'JSON invalido' }); }

  var acao = (dados.acao || '').toLowerCase();

  /* ---- ENVIAR ---- */
  if (acao === 'enviar') {
    var email = (dados.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return resposta(400, { erro: 'E-mail invalido' });

    var codigo = gerarCodigo();
    var expira = String(Date.now() + 10 * 60 * 1000); // 10 min
    var assinatura = criarHmac(email, codigo, expira);

    var enviou = await enviarEmail(email, codigo);

    return resposta(200, { ok: true, assinatura: assinatura, expira: expira, enviou: enviou });
  }

  /* ---- VALIDAR ---- */
  if (acao === 'validar') {
    var email = (dados.email || '').trim().toLowerCase();
    var codigo = (dados.codigo || '').trim();
    var assinatura = dados.assinatura || '';
    var expira = dados.expira || '';

    if (!email || !codigo || !assinatura || !expira) {
      return resposta(400, { erro: 'Dados incompletos.' });
    }

    if (Date.now() > Number(expira)) {
      return resposta(410, { erro: 'Codigo expirado. Solicite um novo.' });
    }

    var esperado = criarHmac(email, codigo, expira);
    if (assinatura !== esperado) {
      return resposta(403, { erro: 'Codigo incorreto.' });
    }

    return resposta(200, { ok: true, validado: true });
  }

  return resposta(400, { erro: 'Acao invalida. Use "enviar" ou "validar".' });
};

module.exports = toVercel(handler);
