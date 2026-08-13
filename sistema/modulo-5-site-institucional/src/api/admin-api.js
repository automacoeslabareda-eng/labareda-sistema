/**
 * ============================================================
 *  admin-api  (Vercel Serverless Function) — camada SEGURA do painel
 * ============================================================
 *  O painel admin (labareda-shop / modulo-2) NAO acessa mais dados
 *  sensiveis (pedidos, clientes, mensagens, reservas) direto com a
 *  chave publica. Ele chama esta funcao, que:
 *   1. Valida o login (email+senha) contra a tabela usuarios_admin.
 *   2. Emite um token assinado (HMAC) para as chamadas seguintes.
 *   3. Serve/atualiza os dados usando a chave SECRETA (service_role).
 *
 *  Assim, mesmo com o RLS ligado (bloqueando a chave publica), o painel
 *  continua funcionando — mas ninguem le dados de cliente pela chave publica.
 *
 *  Variaveis de ambiente:
 *   - ECOMMERCE_SUPABASE_URL, ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY
 *  (o segredo do token reutiliza a service_role key — nao precisa de nova var)
 * ============================================================
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { toVercel } = require('./_netlify-adapter');

// Projeto de GESTAO (onde vive usuarios_admin) — anon key e publica
const GESTAO_URL = 'https://tidngxclgaspltzqoemi.supabase.co';
const GESTAO_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function resposta(status, corpo) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function assinarToken(payload, secret) {
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(p).digest());
  return p + '.' + sig;
}
function verificarToken(token, secret) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', secret).update(parts[0]).digest());
  if (parts[1] !== expected) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch (e) { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resposta(200, { ok: true });
  if (event.httpMethod !== 'POST') return resposta(405, { erro: 'Metodo nao permitido' });

  const SUPABASE_URL = process.env.ECOMMERCE_SUPABASE_URL;
  const SERVICE_KEY = process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return resposta(500, { erro: 'Configuracao do servidor incompleta.' });
  const SECRET = SERVICE_KEY; // segredo do token = service_role (server-only)

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resposta(400, { erro: 'JSON invalido' }); }
  const action = body.action;

  // ---- LOGIN: valida contra usuarios_admin e devolve token ----
  if (action === 'login') {
    const email = (body.email || '').trim();
    const senha = (body.senha || '').trim();
    if (!email || !senha) return resposta(400, { erro: 'Informe email e senha' });
    try {
      const url = GESTAO_URL + '/rest/v1/usuarios_admin?email=eq.' + encodeURIComponent(email) +
        '&senha_hash=eq.' + encodeURIComponent(senha) + '&ativo=eq.true&select=id,nome,email,role';
      const r = await fetch(url, { headers: { apikey: GESTAO_ANON, Authorization: 'Bearer ' + GESTAO_ANON } });
      const data = await r.json();
      if (!Array.isArray(data) || data.length === 0) return resposta(401, { erro: 'Email ou senha incorretos' });
      const u = data[0];
      const token = assinarToken({ email: u.email, exp: Math.floor(Date.now() / 1000) + 12 * 3600 }, SECRET);
      return resposta(200, { ok: true, token: token, usuario: { id: u.id, nome: u.nome, email: u.email, role: u.role } });
    } catch (e) {
      return resposta(500, { erro: 'Falha ao validar login' });
    }
  }

  // ---- Demais acoes: exigem token valido ----
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  const sessao = verificarToken(auth || body.token, SECRET);
  if (!sessao) return resposta(401, { erro: 'Sessao invalida ou expirada. Faca login de novo.' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    switch (action) {
      case 'visao-geral': {
        const [prod, pend, msg, resv, pagos, baixo] = await Promise.all([
          db.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true),
          db.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
          db.from('mensagens_contato').select('id', { count: 'exact', head: true }).eq('lida', false),
          db.from('reservas').select('id', { count: 'exact', head: true }).eq('status', 'nova'),
          db.from('pedidos').select('total').in('status', ['pago', 'preparando', 'enviado', 'entregue']),
          db.from('produtos').select('id,nome_pt,estoque').eq('ativo', true).lte('estoque', 5).order('estoque', { ascending: true }),
        ]);
        const receita = (pagos.data || []).reduce((s, p) => s + (Number(p.total) || 0), 0);
        return resposta(200, {
          ok: true,
          produtos: prod.count || 0,
          pedidos_pendentes: pend.count || 0,
          mensagens_nao_lidas: msg.count || 0,
          reservas_novas: resv.count || 0,
          receita: receita,
          estoque_baixo: baixo.data || [],
        });
      }
      case 'pedidos': {
        let q = db.from('pedidos').select('*,clientes(nome,email,telefone)').order('created_at', { ascending: false });
        if (body.status) q = q.eq('status', body.status);
        const { data, error } = await q;
        if (error) throw error;
        return resposta(200, { ok: true, pedidos: data || [] });
      }
      case 'pedido-itens': {
        const { data, error } = await db.from('pedido_itens').select('*,produtos(nome_pt)').eq('pedido_id', body.pedido_id);
        if (error) throw error;
        return resposta(200, { ok: true, itens: data || [] });
      }
      case 'update-pedido-status': {
        const { error } = await db.from('pedidos').update({ status: body.status }).eq('id', body.pedido_id);
        if (error) throw error;
        return resposta(200, { ok: true });
      }
      case 'mensagens': {
        const { data, error } = await db.from('mensagens_contato').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return resposta(200, { ok: true, mensagens: data || [] });
      }
      case 'mark-mensagem-lida': {
        const { error } = await db.from('mensagens_contato').update({ lida: true }).eq('id', body.id);
        if (error) throw error;
        return resposta(200, { ok: true });
      }
      case 'reservas': {
        let q = db.from('reservas').select('*').order('created_at', { ascending: false });
        if (body.status) q = q.eq('status', body.status);
        const { data, error } = await q;
        if (error) throw error;
        return resposta(200, { ok: true, reservas: data || [] });
      }
      case 'update-reserva': {
        const patch = {};
        if (body.status != null) patch.status = body.status;
        if (body.observacoes != null) patch.observacoes = body.observacoes;
        const { error } = await db.from('reservas').update(patch).eq('id', body.id);
        if (error) throw error;
        return resposta(200, { ok: true });
      }
      default:
        return resposta(400, { erro: 'Acao desconhecida: ' + action });
    }
  } catch (err) {
    console.error('admin-api erro:', err);
    return resposta(500, { erro: 'Falha no servidor.', detalhe: String(err && err.message ? err.message : err) });
  }
};

module.exports = toVercel(handler);
