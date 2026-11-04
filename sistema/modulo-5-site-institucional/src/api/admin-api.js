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
const { linkAcompanhar } = require('./_pedido-token');
const { registrarEvento, resolverPendencia, faltaMigration } = require('./_pedido-registro');
const {
  liberarReserva, liberarReservasExpiradas, confirmarBaixaEstoque, carregarContexto, etiquetaDoPedido,
  etapaEtiqueta, etapaNotaFiscal, etapaEmailConfirmacao, etapaAvisoEquipe,
} = require('./_pedido-fluxo');
const { carregarConfigFiscal, linksDaNota, nfemais, cnpjValido } = require('./_nota-fiscal');

// Campos de config_fiscal que o painel pode editar
const CAMPOS_CONFIG_FISCAL = [
  'modo', 'ambiente', 'cnpj', 'razao_social', 'nome_fantasia', 'inscricao_estadual', 'inscricao_municipal',
  'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'cod_municipio', 'uf', 'cep', 'telefone',
  'crt', 'serie', 'natureza_operacao', 'cfop_dentro_uf', 'cfop_fora_uf', 'csosn', 'cst_icms',
  'aliquota_icms', 'aliquota_icms_fora_uf', 'aliquota_credito_sn', 'cst_pis', 'aliquota_pis',
  'cst_cofins', 'aliquota_cofins', 'informacoes_complementares', 'cnpj_autxml',
];
const CAMPOS_NUMERICOS_FISCAIS = ['ambiente', 'crt', 'serie', 'aliquota_icms', 'aliquota_icms_fora_uf',
  'aliquota_credito_sn', 'aliquota_pis', 'aliquota_cofins'];

// Situacao da nota que o painel mostra no pedido
const CAMPOS_NOTA = 'id, numero, status, nfe_status, nfe_codigo, nfe_numero, nfe_serie, nfe_chave, nfe_ambiente, '
  + 'nfe_xml_path, nfe_danfe_path, nfe_erro, nfe_autorizada_at, nfe_email_enviado_at';

const STATUS_PAGO = ['pago', 'preparando', 'enviado', 'entregue'];

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
        await liberarReservasExpiradas(db);
        const [prod, pend, msg, resv, pagos, baixo, pendencias] = await Promise.all([
          db.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true),
          db.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
          db.from('mensagens_contato').select('id', { count: 'exact', head: true }).eq('lida', false),
          db.from('reservas').select('id', { count: 'exact', head: true }).eq('status', 'nova'),
          db.from('pedidos').select('total').in('status', ['pago', 'preparando', 'enviado', 'entregue']),
          db.from('produtos').select('id,nome_pt,estoque').eq('ativo', true).lte('estoque', 5).order('estoque', { ascending: true }),
          db.from('pedido_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
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
          // null = migration da etapa 1 ainda nao rodada
          pendencias_abertas: pendencias.error ? null : (pendencias.count || 0),
        });
      }
      case 'pendencias': {
        const { data, error } = await db.from('pedido_pendencias')
          .select('*, pedidos(numero, status, total, clientes(nome))')
          .eq('status', body.status || 'aberta')
          .order('created_at', { ascending: false }).limit(100);
        if (error) {
          if (faltaMigration(error)) return resposta(200, { ok: true, pendencias: [], migration_pendente: true });
          throw error;
        }
        return resposta(200, { ok: true, pendencias: data || [] });
      }
      case 'pedido-eventos': {
        const { data, error } = await db.from('pedido_eventos').select('*')
          .eq('pedido_id', body.pedido_id).order('created_at', { ascending: true });
        if (error) {
          if (faltaMigration(error)) return resposta(200, { ok: true, eventos: [], migration_pendente: true });
          throw error;
        }
        return resposta(200, { ok: true, eventos: data || [] });
      }
      case 'resolver-pendencia': {
        const { data: pend, error } = await db.from('pedido_pendencias').select('pedido_id, tipo').eq('id', body.id).single();
        if (error || !pend) return resposta(404, { erro: 'Pendencia nao encontrada' });
        await resolverPendencia(db, pend.pedido_id, pend.tipo, sessao.email);
        await registrarEvento(db, pend.pedido_id, 'pendencia_resolvida',
          'Pendência "' + pend.tipo + '" marcada como resolvida por ' + sessao.email + (body.nota ? ': ' + body.nota : ''), null, 'painel');
        return resposta(200, { ok: true });
      }
      case 'reprocessar-pendencia': {
        const { data: pend, error } = await db.from('pedido_pendencias').select('*').eq('id', body.id).single();
        if (error || !pend) return resposta(404, { erro: 'Pendencia nao encontrada' });
        if (pend.status !== 'aberta') return resposta(200, { ok: true, resolvida: true });
        const ctx = await carregarContexto(db, pend.pedido_id);
        const opcoes = { origem: 'painel', por: sessao.email };
        let sucesso = false;
        if (pend.tipo === 'etiqueta') {
          const r = await etapaEtiqueta(db, ctx, Object.assign({ enviarEmailRastreio: true }, opcoes));
          sucesso = !!r.etiqueta;
        } else if (pend.tipo === 'email_confirmacao') {
          sucesso = await etapaEmailConfirmacao(db, ctx, etiquetaDoPedido(ctx.pedido) || {}, opcoes);
        } else if (pend.tipo === 'aviso_equipe') {
          sucesso = await etapaAvisoEquipe(db, ctx, etiquetaDoPedido(ctx.pedido) || {}, [], opcoes);
        } else if (pend.tipo === 'nota_fiscal') {
          const r = await etapaNotaFiscal(db, ctx, Object.assign({ manual: true }, opcoes));
          if (r.pulado) return resposta(400, { erro: r.erro });
          sucesso = r.status === 'autorizada';
        } else {
          // estoque / pagamento: precisam de conferencia humana
          return resposta(400, { erro: 'Esta pendência precisa ser conferida e marcada como resolvida manualmente.' });
        }
        const { data: depois } = await db.from('pedido_pendencias').select('status, erro, tentativas').eq('id', pend.id).single();
        return resposta(200, { ok: true, resolvida: sucesso, pendencia: depois || null });
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
        const { data: atual } = await db.from('pedidos').select('*').eq('id', body.pedido_id).single();
        if (!atual) return resposta(404, { erro: 'Pedido nao encontrado' });
        const patch = { status: body.status };
        if (body.status === 'enviado' && body.codigo_rastreio) {
          patch.codigo_rastreio = body.codigo_rastreio;
          patch.rastreio_url = 'https://www.linkcorreios.com.br/?id=' + body.codigo_rastreio;
          patch.enviado_at = new Date().toISOString();
        }
        if (body.status === 'entregue' && !atual.entregue_at) patch.entregue_at = new Date().toISOString();
        const { error } = await db.from('pedidos').update(patch).eq('id', body.pedido_id);
        if (error) throw error;
        await registrarEvento(db, body.pedido_id, 'status_alterado',
          'Status alterado de "' + atual.status + '" para "' + body.status + '" por ' + sessao.email, null, 'painel');

        // Estoque acompanha o status: cancelado devolve a reserva; pago
        // manualmente (ex: Pix direto) efetiva a baixa — uma unica vez.
        let estoque = null;
        if (body.status === 'cancelado') {
          estoque = (await liberarReserva(db, body.pedido_id, 'Pedido cancelado pelo painel — estoque devolvido')) ? 'reserva_liberada' : null;
        } else if (STATUS_PAGO.indexOf(body.status) >= 0 && STATUS_PAGO.indexOf(atual.status) < 0 && atual.estoque_baixado === false) {
          const { data: itens } = await db.from('pedido_itens').select('produto_id, nome_produto, tamanho, quantidade').eq('pedido_id', body.pedido_id);
          await confirmarBaixaEstoque(db, body.pedido_id, itens || []);
          estoque = 'baixado';
        }
        return resposta(200, { ok: true, estoque: estoque });
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
        await registrarEvento(db, body.pedido_id, 'rastreio_manual',
          'Rastreio ' + body.codigo_rastreio + ' informado no painel por ' + sessao.email + ' — pedido marcado como enviado', null, 'painel');
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
            var acompUrl = linkAcompanhar(sUrl, pedidoData.numero);
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
        await registrarEvento(db, body.pedido_id, emailEnviado ? 'email_rastreio_enviado' : 'email_rastreio_falhou',
          emailEnviado ? 'Email de rastreio enviado ao comprador' : 'Email de rastreio NÃO foi enviado', null, 'painel');
        return resposta(200, { ok: true, pedido: pedidoData, rastreio_url: rastreioUrl, email_enviado: emailEnviado });
      }
      /* ---- Nota fiscal (NF-e via NFe+) ---- */
      case 'emitir-nota': {
        if (!body.pedido_id) return resposta(400, { erro: 'pedido_id obrigatorio' });
        const ctx = await carregarContexto(db, body.pedido_id);
        if (STATUS_PAGO.indexOf(ctx.pedido.status) < 0) return resposta(400, { erro: 'A nota só pode ser emitida para pedido pago.' });
        const r = await etapaNotaFiscal(db, ctx, { origem: 'painel', por: sessao.email, manual: true });
        if (r.pulado) return resposta(400, { erro: r.erro });
        const { data: depois } = await db.from('pedidos').select(CAMPOS_NOTA).eq('id', body.pedido_id).single();
        return resposta(200, { ok: true, status: r.status, erro: r.erro || null, pedido: depois || null });
      }
      case 'nota-pedido': {
        const { data: ped, error } = await db.from('pedidos').select(CAMPOS_NOTA).eq('id', body.pedido_id).single();
        if (error) {
          if (faltaMigration(error)) return resposta(200, { ok: true, migration_pendente: true });
          throw error;
        }
        const links = await linksDaNota(db, ped, 3600);
        return resposta(200, { ok: true, pedido: ped, danfe_url: links.danfe_url, xml_url: links.xml_url });
      }
      case 'config-fiscal': {
        const config = await carregarConfigFiscal(db);
        return resposta(200, {
          ok: true,
          migration_pendente: !config,
          config: config,
          token_configurado: !!(process.env.NFEMAIS_TOKEN || process.env.token_nfemais),
        });
      }
      case 'salvar-config-fiscal': {
        const entrada = body.config || {};
        const patch = {};
        CAMPOS_CONFIG_FISCAL.forEach(function (c) {
          if (entrada[c] === undefined) return;
          let v = entrada[c];
          if (typeof v === 'string') v = v.trim();
          if (CAMPOS_NUMERICOS_FISCAIS.indexOf(c) >= 0) v = v === '' || v == null ? 0 : Number(String(v).replace(',', '.'));
          else if (v === '') v = null;
          patch[c] = v;
        });
        if (patch.cnpj && !cnpjValido(patch.cnpj)) return resposta(400, { erro: 'CNPJ do emitente inválido.' });
        if (patch.modo && ['desligado', 'manual', 'automatico'].indexOf(patch.modo) < 0) return resposta(400, { erro: 'Modo inválido.' });
        CAMPOS_NUMERICOS_FISCAIS.forEach(function (c) {
          if (patch[c] !== undefined && !isFinite(patch[c])) patch[c] = 0;
        });
        patch.updated_at = new Date().toISOString();
        patch.updated_by = sessao.email;
        const { data, error } = await db.from('config_fiscal').upsert(Object.assign({ id: 1 }, patch)).select('*').single();
        if (error) {
          if (faltaMigration(error)) return resposta(400, { erro: 'Rode antes a atualização do banco (atualizacoes/migration-etapa2-nota-fiscal.sql).' });
          throw error;
        }
        return resposta(200, { ok: true, config: data });
      }
      case 'testar-nfemais': {
        if (!(process.env.NFEMAIS_TOKEN || process.env.token_nfemais)) return resposta(200, { ok: false, mensagem: 'NFEMAIS_TOKEN não configurado no servidor (Vercel).' });
        try {
          const st = await nfemais.status();
          return resposta(200, { ok: true, mensagem: 'Conectado ao NFe+. SEFAZ: ' + (st.msg || st.status_code) });
        } catch (e) {
          return resposta(200, { ok: false, mensagem: e.message });
        }
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
