/**
 * ============================================================
 *  Fluxo operacional do pedido (estoque + etapas pos-pagamento)
 * ============================================================
 *  Arquivo iniciado por "_" => NAO vira rota no Vercel.
 *
 *  Estoque (funcoes SQL de atualizacoes/migration-etapa1-base-pedidos.sql):
 *   - reservarEstoque          checkout: separa o estoque ate o pagamento
 *   - confirmarBaixaEstoque    pagamento aprovado: baixa UMA vez
 *   - liberarReserva           pedido cancelado: devolve o estoque
 *   - liberarReservasExpiradas reservas vencidas: devolve o estoque
 *   Sem a migration, caem no comportamento antigo (sem reserva; baixa no
 *   pagamento item a item).
 *
 *  Etapas pos-pagamento — cada uma registra historico e, se falhar, abre
 *  uma pendencia que o painel reprocessa ("Tentar novamente"):
 *   - etapaEtiqueta, etapaEmailConfirmacao, etapaAvisoEquipe
 * ============================================================
 */

const { gerarEtiquetaParaPedido } = require('./gerar-etiqueta');
const { emailPagamentoAprovado } = require('./_emails');
const { registrarEvento, abrirPendencia, resolverPendencia, faltaMigration } = require('./_pedido-registro');

// Propriedade Labareda (mesmo id usado no fluxo Telegram do modulo 1)
const PROPRIEDADE_LABAREDA = '229e2813-6d46-4bdb-9aee-5d9a119733e6';

// Prazo da reserva de estoque aguardando pagamento (padrao 24h — cobre Pix
// e cartao; boleto pago depois disso ainda e aceito, com baixa direta).
function horasReserva() {
  var h = parseFloat(process.env.RESERVA_ESTOQUE_HORAS);
  return h > 0 ? h : 24;
}

// Erro de pagamento da etiqueta por falta de credito na conta SuperFrete
function semSaldoSuperFrete(msg) {
  return /saldo|insuficiente|cr[eé]dito|pagar a etiqueta no SuperFrete: 409/i.test(String(msg || ''));
}

/* ------------------------------------------------------------------ */
/*  Estoque                                                            */
/* ------------------------------------------------------------------ */

/* Retorna { ok:true, suportado } ou { ok:false, erro } (falta de estoque). */
async function reservarEstoque(db, pedidoId, expiraEm) {
  var { error } = await db.rpc('reservar_estoque_pedido', { p_pedido_id: pedidoId, p_expira_em: expiraEm });
  if (!error) return { ok: true, suportado: true };
  if (faltaMigration(error)) return { ok: true, suportado: false };
  var msg = String(error.message || '');
  if (msg.indexOf('ESTOQUE_INSUFICIENTE') >= 0) {
    return { ok: false, erro: 'Estoque insuficiente para ' + msg.replace(/^.*ESTOQUE_INSUFICIENTE:\s*/, '') + '.' };
  }
  throw error;
}

async function liberarReserva(db, pedidoId, motivo) {
  var { data, error } = await db.rpc('liberar_reserva_pedido', { p_pedido_id: pedidoId, p_motivo: motivo || null });
  if (error) {
    if (!faltaMigration(error)) console.error('[pedido-fluxo] liberar reserva:', error.message);
    return false;
  }
  return !!data;
}

async function liberarReservasExpiradas(db) {
  try {
    var { data, error } = await db.rpc('liberar_reservas_expiradas');
    if (error) {
      if (!faltaMigration(error)) console.error('[pedido-fluxo] liberar reservas expiradas:', error.message);
      return 0;
    }
    return data || 0;
  } catch (e) {
    console.error('[pedido-fluxo] liberar reservas expiradas:', e.message);
    return 0;
  }
}

/* Baixa antiga (sem migration): item a item, sem trava. */
async function baixaLegada(db, itens) {
  for (const it of itens || []) {
    if (!it.produto_id) continue;
    const { data: prod } = await db.from('produtos')
      .select('estoque, variantes_estoque').eq('id', it.produto_id).single();
    if (!prod) continue;
    if (it.tamanho && prod.variantes_estoque && typeof prod.variantes_estoque === 'object' && prod.variantes_estoque[it.tamanho] != null) {
      const v = { ...prod.variantes_estoque };
      v[it.tamanho] = Math.max(0, v[it.tamanho] - it.quantidade);
      const total = Object.values(v).reduce((s, n) => s + (Number(n) || 0), 0);
      await db.from('produtos').update({ variantes_estoque: v, estoque: total }).eq('id', it.produto_id);
    } else if (prod.estoque != null) {
      await db.from('produtos').update({ estoque: Math.max(0, prod.estoque - it.quantidade) }).eq('id', it.produto_id);
    }
  }
}

/* Produtos do pedido que ficaram abaixo do estoque minimo. */
async function alertasEstoqueBaixo(db, itens) {
  const ids = [...new Set((itens || []).map((i) => i.produto_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: prods } = await db.from('produtos')
    .select('id, nome_pt, estoque, estoque_minimo, variantes_estoque').in('id', ids);
  const alertas = [];
  for (const it of itens) {
    const p = (prods || []).find((x) => x.id === it.produto_id);
    if (!p) continue;
    const minimo = p.estoque_minimo != null ? p.estoque_minimo : 5;
    const temTamanho = it.tamanho && p.variantes_estoque && typeof p.variantes_estoque === 'object' && p.variantes_estoque[it.tamanho] != null;
    const nome = p.nome_pt + (temTamanho ? ' (' + it.tamanho + ')' : '');
    const qtd = temTamanho ? Number(p.variantes_estoque[it.tamanho]) || 0 : p.estoque;
    if (qtd != null && qtd < minimo && !alertas.some((a) => a.nome === nome)) alertas.push({ nome: nome, estoque: qtd });
  }
  return alertas;
}

/* Pagamento aprovado: baixa uma unica vez. Retorna { faltas, alertas }. */
async function confirmarBaixaEstoque(db, pedidoId, itens) {
  var faltas = [];
  var { data, error } = await db.rpc('confirmar_baixa_estoque', { p_pedido_id: pedidoId });
  if (error) {
    if (!faltaMigration(error)) throw error;
    await baixaLegada(db, itens);
  } else if (data && Array.isArray(data.faltas)) {
    faltas = data.faltas;
  }
  if (faltas.length) {
    await abrirPendencia(db, pedidoId, 'estoque', 'Pagamento aprovado mas faltou estoque: '
      + faltas.map((f) => f.nome + (f.tamanho ? ' (' + f.tamanho + ')' : '') + ' — faltou ' + f.faltou).join('; '));
  }
  var alertas = [];
  try { alertas = await alertasEstoqueBaixo(db, itens); } catch (e) { console.error('[pedido-fluxo] alertas estoque:', e.message); }
  return { faltas: faltas, alertas: alertas };
}

/* ------------------------------------------------------------------ */
/*  Contexto do pedido                                                 */
/* ------------------------------------------------------------------ */

async function carregarContexto(db, pedidoId) {
  const { data: pedido, error } = await db.from('pedidos').select('*').eq('id', pedidoId).single();
  if (error || !pedido) throw new Error('Pedido nao encontrado.');
  const { data: itens } = await db.from('pedido_itens')
    .select('produto_id, nome_produto, tamanho, quantidade, preco_unitario').eq('pedido_id', pedidoId);
  let cliente = null;
  if (pedido.cliente_id) {
    const { data: cli } = await db.from('clientes').select('nome, email, telefone, cpf').eq('id', pedido.cliente_id).single();
    cliente = cli || null;
  }
  return { pedido: pedido, itens: itens || [], cliente: cliente };
}

function etiquetaDoPedido(pedido) {
  if (!pedido || !(pedido.etiqueta_url || pedido.codigo_rastreio)) return null;
  return { tracking: pedido.codigo_rastreio, rastreio_url: pedido.rastreio_url, etiqueta_url: pedido.etiqueta_url };
}

/* ------------------------------------------------------------------ */
/*  Etapas pos-pagamento                                               */
/* ------------------------------------------------------------------ */

/* Gera a etiqueta no SuperFrete. Retorna { etiqueta } ou { erro }.
   opcoes.enviarEmailRastreio: manda o email de rastreio sozinho (no
   reprocessamento; no webhook o rastreio vai no email de confirmacao). */
async function etapaEtiqueta(db, ctx, opcoes) {
  const pedido = ctx.pedido;
  const ja = etiquetaDoPedido(pedido);
  if (ja && pedido.etiqueta_url) {
    await resolverPendencia(db, pedido.id, 'etiqueta', 'sistema');
    return { etiqueta: ja };
  }
  if (!pedido.frete_service_id) {
    const erro = 'Pedido sem serviço de frete SuperFrete escolhido no checkout — gere a etiqueta manualmente ou poste por fora.';
    await abrirPendencia(db, pedido.id, 'etiqueta', erro);
    return { erro: erro };
  }
  try {
    const etiqueta = await gerarEtiquetaParaPedido(db, pedido.id, { enviarEmail: !!(opcoes && opcoes.enviarEmailRastreio) });
    await registrarEvento(db, pedido.id, 'etiqueta_gerada', 'Etiqueta SuperFrete gerada — rastreio ' + (etiqueta.tracking || '?'),
      { tracking: etiqueta.tracking, etiqueta_url: etiqueta.etiqueta_url }, (opcoes && opcoes.origem) || 'webhook');
    await resolverPendencia(db, pedido.id, 'etiqueta', (opcoes && opcoes.por) || 'sistema');
    return { etiqueta: etiqueta };
  } catch (e) {
    const erro = semSaldoSuperFrete(e.message) ? 'SEM SALDO NO SUPERFRETE — coloque crédito e tente novamente. (' + e.message + ')' : e.message;
    await registrarEvento(db, pedido.id, 'etiqueta_falhou', erro, null, (opcoes && opcoes.origem) || 'webhook');
    await abrirPendencia(db, pedido.id, 'etiqueta', erro);
    return { erro: e.message };
  }
}

/* Email "Compra confirmada" ao comprador (+ copia da loja). */
async function etapaEmailConfirmacao(db, ctx, etiquetaOuErro, opcoes) {
  const pedido = ctx.pedido;
  const cliente = ctx.cliente || { email: ctx.emailPagador };
  const origem = (opcoes && opcoes.origem) || 'webhook';
  let r = { cliente: false, loja: false };
  try {
    r = await emailPagamentoAprovado(cliente, pedido, ctx.itens, etiquetaOuErro);
  } catch (e) {
    console.error('[pedido-fluxo] email confirmacao:', e.message);
  }
  if (r.cliente) {
    await registrarEvento(db, pedido.id, 'email_confirmacao_enviado', 'Email "Compra confirmada" enviado para ' + (cliente.email || '?'),
      { copia_loja: !!r.loja }, origem);
    await resolverPendencia(db, pedido.id, 'email_confirmacao', (opcoes && opcoes.por) || 'sistema');
    return true;
  }
  const erro = cliente.email
    ? 'Email de confirmação não foi enviado para ' + cliente.email + ' (Resend falhou ou RESEND_API_KEY ausente).'
    : 'Comprador sem email cadastrado.';
  await registrarEvento(db, pedido.id, 'email_confirmacao_falhou', erro, null, origem);
  await abrirPendencia(db, pedido.id, 'email_confirmacao', erro);
  return false;
}

/* Aviso de venda pra equipe (n8n -> Telegram COMUNIK + WhatsApp do sitio). */
async function etapaAvisoEquipe(db, ctx, etiquetaOuErro, alertas, opcoes) {
  const pedido = ctx.pedido;
  const cliente = ctx.cliente || {};
  const origem = (opcoes && opcoes.origem) || 'webhook';
  const url = process.env.N8N_WEBHOOK_URL;
  const etiqueta = etiquetaOuErro && (etiquetaOuErro.tracking || etiquetaOuErro.etiqueta_url) ? etiquetaOuErro : null;
  const erroEtiqueta = etiqueta ? null : (etiquetaOuErro && etiquetaOuErro.erro) || null;
  let erro = null;
  if (!url) {
    erro = 'N8N_WEBHOOK_URL não configurada — aviso de venda não enviado.';
  } else {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'compra_aprovada',
          propriedade_id: PROPRIEDADE_LABAREDA,
          pedido_numero: pedido.numero,
          pedido_id: pedido.id,
          cliente_nome: cliente.nome || ctx.nomePagador || '',
          cliente_email: cliente.email || ctx.emailPagador || '',
          cliente_telefone: cliente.telefone || '',
          valor_produtos: pedido.subtotal,
          valor_frete: pedido.frete,
          valor_total: pedido.total,
          pagamento_id: pedido.mercadopago_id || null,
          endereco: pedido.endereco_entrega || null,
          itens: (ctx.itens || []).map((i) => ({ nome: i.nome_produto, tamanho: i.tamanho || null, quantidade: i.quantidade, preco: i.preco_unitario })),
          alertas_estoque_baixo: alertas || [],
          etiqueta_gerada: !!etiqueta,
          rastreio_codigo: etiqueta ? etiqueta.tracking : null,
          etiqueta_url: etiqueta ? etiqueta.etiqueta_url : null,
          rastreio_url: etiqueta ? etiqueta.rastreio_url : null,
          etiqueta_erro: erroEtiqueta,
          etiqueta_sem_saldo: !etiqueta && semSaldoSuperFrete(erroEtiqueta),
          frete_servico: pedido.frete_service_name || null,
          cliente_cpf: cliente.cpf || null,
          reenvio: origem !== 'webhook',
        }),
      });
      if (!res.ok) erro = 'n8n respondeu ' + res.status + ' ao aviso de venda.';
    } catch (e) {
      erro = 'Falha ao chamar o n8n: ' + e.message;
    }
  }
  if (!erro) {
    await registrarEvento(db, pedido.id, 'aviso_equipe_enviado', 'Aviso de venda enviado (Telegram/WhatsApp via n8n)', null, origem);
    await resolverPendencia(db, pedido.id, 'aviso_equipe', (opcoes && opcoes.por) || 'sistema');
    return true;
  }
  console.error('[pedido-fluxo] aviso equipe:', erro);
  await registrarEvento(db, pedido.id, 'aviso_equipe_falhou', erro, null, origem);
  await abrirPendencia(db, pedido.id, 'aviso_equipe', erro);
  return false;
}

module.exports = {
  horasReserva,
  reservarEstoque,
  liberarReserva,
  liberarReservasExpiradas,
  confirmarBaixaEstoque,
  carregarContexto,
  etiquetaDoPedido,
  etapaEtiqueta,
  etapaEmailConfirmacao,
  etapaAvisoEquipe,
};
