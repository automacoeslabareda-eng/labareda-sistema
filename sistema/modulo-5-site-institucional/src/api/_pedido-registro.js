/**
 * ============================================================
 *  Historico e pendencias dos pedidos
 * ============================================================
 *  Arquivo iniciado por "_" => NAO vira rota no Vercel.
 *
 *  - registrarEvento: grava uma linha em pedido_eventos (historico).
 *  - abrirPendencia: registra uma falha que precisa de acao (uma so
 *    pendencia aberta por pedido+tipo; repetir so soma tentativas).
 *  - resolverPendencia: fecha a pendencia aberta daquele tipo.
 *
 *  Nunca quebram o fluxo da venda: se a tabela ainda nao existir (migration
 *  atualizacoes/migration-etapa1-base-pedidos.sql nao rodada) ou o banco
 *  falhar, so loga e segue.
 * ============================================================
 */

const TIPOS_PENDENCIA = ['etiqueta', 'email_confirmacao', 'aviso_equipe', 'estoque', 'pagamento', 'nota_fiscal'];

// Erros de "tabela/funcao nao existe" (migration nao rodada)
function faltaMigration(error) {
  if (!error) return false;
  var code = String(error.code || '');
  return code === '42P01' || code === '42883' || code === 'PGRST202' || code === 'PGRST205' || code === '42703';
}

async function registrarEvento(db, pedidoId, tipo, descricao, dados, origem) {
  if (!db || !pedidoId) return false;
  try {
    var { error } = await db.from('pedido_eventos').insert({
      pedido_id: pedidoId,
      tipo: tipo,
      descricao: descricao || null,
      dados: dados || null,
      origem: origem || 'sistema',
    });
    if (error) {
      if (!faltaMigration(error)) console.error('[pedido-registro] evento nao gravado:', error.message, tipo);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[pedido-registro] evento nao gravado:', e.message, tipo);
    return false;
  }
}

async function abrirPendencia(db, pedidoId, tipo, erro) {
  if (!db || !pedidoId || TIPOS_PENDENCIA.indexOf(tipo) < 0) return null;
  var msg = String(erro || 'Falha sem detalhe').slice(0, 2000);
  try {
    var { data: aberta, error: errSel } = await db.from('pedido_pendencias')
      .select('id, tentativas').eq('pedido_id', pedidoId).eq('tipo', tipo).eq('status', 'aberta').maybeSingle();
    if (errSel) {
      if (!faltaMigration(errSel)) console.error('[pedido-registro] pendencia:', errSel.message);
      return null;
    }
    if (aberta) {
      await db.from('pedido_pendencias').update({
        erro: msg, tentativas: (aberta.tentativas || 1) + 1, ultima_tentativa_at: new Date().toISOString(),
      }).eq('id', aberta.id);
      return aberta.id;
    }
    var { data: nova, error: errIns } = await db.from('pedido_pendencias')
      .insert({ pedido_id: pedidoId, tipo: tipo, erro: msg }).select('id').single();
    if (errIns) {
      // 23505 = outra chamada abriu a mesma pendencia ao mesmo tempo
      if (errIns.code !== '23505') console.error('[pedido-registro] pendencia nao aberta:', errIns.message);
      return null;
    }
    return nova.id;
  } catch (e) {
    console.error('[pedido-registro] pendencia nao aberta:', e.message);
    return null;
  }
}

async function resolverPendencia(db, pedidoId, tipo, por) {
  if (!db || !pedidoId) return false;
  try {
    var { data, error } = await db.from('pedido_pendencias')
      .update({ status: 'resolvida', resolvida_at: new Date().toISOString(), resolvida_por: por || 'sistema' })
      .eq('pedido_id', pedidoId).eq('tipo', tipo).eq('status', 'aberta').select('id');
    if (error) {
      if (!faltaMigration(error)) console.error('[pedido-registro] pendencia nao resolvida:', error.message);
      return false;
    }
    return !!(data && data.length);
  } catch (e) {
    console.error('[pedido-registro] pendencia nao resolvida:', e.message);
    return false;
  }
}

module.exports = { registrarEvento, abrirPendencia, resolverPendencia, faltaMigration, TIPOS_PENDENCIA };
