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
        const patch = { status: body.status };
        if (body.status === 'enviado' && body.codigo_rastreio) {
          patch.codigo_rastreio = body.codigo_rastreio;
          patch.rastreio_url = 'https://www.linkcorreios.com.br/?id=' + body.codigo_rastreio;
          patch.enviado_at = new Date().toISOString();
        }
        const { error } = await db.from('pedidos').update(patch).eq('id', body.pedido_id);
        if (error) throw error;
        return resposta(200, { ok: true });
      }
      case 'update-pedido-rastreio': {
        if (!body.pedido_id || !body.codigo_rastreio) return resposta(400, { erro: 'pedido_id e codigo_rastreio obrigatorios' });
        const rastreioUrl = 'https://www.linkcorreios.com.br/?id=' + body.codigo_rastreio;
        const { error } = await db.from('pedidos').update({
          codigo_rastreio: body.codigo_rastreio,
          rastreio_url: rastreioUrl,
          status: 'enviado',
          enviado_at: new Date().toISOString(),
        }).eq('id', body.pedido_id);
        if (error) throw error;
        // Buscar dados do pedido + cliente para notificacao
        const { data: pedidoData } = await db.from('pedidos').select('*,clientes(nome,email,telefone)').eq('id', body.pedido_id).single();
        // Envia email de rastreamento ao cliente
        var emailEnviado = false;
        if (pedidoData && pedidoData.clientes && pedidoData.clientes.email && process.env.RESEND_API_KEY) {
          try {
            var cli = pedidoData.clientes;
            var sUrl = (process.env.SITE_URL || 'https://sitiolabareda.com').replace(/\/+$/, '');
            var wpp = process.env.WHATSAPP_PEDIDOS || '5573998150799';
            var wppLink = 'https://wa.me/' + wpp + '?text=' + encodeURIComponent('Oi! Tenho uma duvida sobre o pedido #' + pedidoData.numero);
            var acompUrl = sUrl + '/pedido.html?numero=' + pedidoData.numero;
            var emailHtml = '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#2E2624;">'
              + '<h2 style="color:#AA3424;text-align:center;margin-bottom:24px;">Sitio Labareda</h2>'
              + '<p>Ola, ' + (cli.nome || '').split(' ')[0] + '!</p>'
              + '<p>Seu pedido <strong>#' + pedidoData.numero + '</strong> foi enviado!</p>'
              + '<div style="background:#f5f0e8;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">'
              + '<p style="margin:0 0 8px;font-size:.85rem;color:#6b5f56;">Codigo de rastreamento</p>'
              + '<p style="font-size:1.3rem;font-weight:bold;letter-spacing:.15em;margin:0;">' + body.codigo_rastreio + '</p>'
              + '</div>'
              + '<div style="text-align:center;margin:20px 0;">'
              + '<a href="' + rastreioUrl + '" style="display:inline-block;background:#AA3424;color:#F3E9D2;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:.9rem;">Rastrear meu pedido</a>'
              + '</div>'
              + '<p style="font-size:.85rem;color:#6b5f56;">Acompanhe seu pedido em: <a href="' + acompUrl + '">' + acompUrl + '</a></p>'
              + '<hr style="border:none;border-top:1px solid #e0d5c5;margin:24px 0;">'
              + '<p style="font-size:.85rem;color:#6b5f56;">Duvidas sobre seu pedido?</p>'
              + '<p style="font-size:.85rem;"><a href="' + wppLink + '" style="color:#AA3424;">Fale conosco pelo WhatsApp</a> — (73) 99815-0799</p>'
              + '<p style="font-size:.75rem;color:#9a8b7d;margin-top:20px;text-align:center;">Sitio Labareda — Roca & Arte<br>Serra Grande, Costa do Cacau, Bahia</p>'
              + '</div>';
            var emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: process.env.EMAIL_FROM || 'Sitio Labareda <noreply@sitiolabareda.com>',
                to: [cli.email],
                subject: 'Seu pedido #' + pedidoData.numero + ' foi enviado! — Sitio Labareda',
                html: emailHtml,
              }),
            });
            emailEnviado = emailRes.ok;
          } catch (emailErr) {
            console.error('admin-api: erro ao enviar email de rastreio:', emailErr.message);
          }
        }
        return resposta(200, { ok: true, pedido: pedidoData, rastreio_url: rastreioUrl, email_enviado: emailEnviado });
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
