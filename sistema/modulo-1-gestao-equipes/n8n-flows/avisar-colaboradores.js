/* ==================================================================
   AVISAR COLABORADORES — ponto unico de notificacao
   Cobre QUALQUER origem de tarefa: rotina (cron), Hermes, bot do
   Telegram, dashboard. Ninguem mais precisa mandar WhatsApp sozinho.

   Faz 3 coisas, nesta ordem:
     1) SINCRONIZA  tarefa com responsavel mas sem checklist_item
                    ganha um item (senao ela nao aparece no painel)
     2) AVISA       manda 1 mensagem por colaborador
     3) MARCA       whatsapp_enviado = true, para nao repetir

   Modos (vem do node Set anterior, campo `modo`):
     resumo -> tudo que esta pendente (usado 1x por dia, de manha)
     novos  -> so o que ainda nao foi avisado (roda de 10 em 10 min,
               para tarefa criada pelo Hermes/Telegram durante o dia)
   ================================================================== */

const SUPA = 'https://tidngxclgaspltzqoemi.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE';
const ENVIO_WEBHOOK = 'https://n8n.sitiolabareda.com/webhook/whatsapp-envio-direto';
const PAINEL_URL = 'https://painel.sitiolabareda.com';
const TZ = 'America/Bahia';

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

// o Code node do n8n roda em sandbox sem fetch global; o helper oficial e este
const http = this.helpers.httpRequest;

const get = (path) => http({ method: 'GET', url: SUPA + '/' + path, headers: H, json: true });
const post = (path, body) =>
  http({
    method: 'POST',
    url: SUPA + '/' + path,
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: body,
    json: true,
  });
const patch = (path, body) =>
  http({
    method: 'PATCH',
    url: SUPA + '/' + path,
    headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
    body: body,
    json: true,
    returnFullResponse: true,
  });
const enviarWhats = (telefone, mensagem) =>
  http({
    method: 'POST',
    url: ENVIO_WEBHOOK,
    headers: { 'Content-Type': 'application/json' },
    body: { telefone: telefone, mensagem: mensagem },
    json: true,
    returnFullResponse: true,
  });

const entrada = $input.first() ? $input.first().json : {};
const modo = String(entrada.modo || (entrada.body && entrada.body.modo) || 'resumo').toLowerCase();

const diaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hojeStr = diaFmt.format(new Date());
const horaBr = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()));
const saudacao = horaBr >= 5 && horaBr < 12 ? 'Bom dia' : horaBr < 18 ? 'Boa tarde' : 'Boa noite';

// sexta e o dia de fechar a semana: o resumo vira cobranca de prazo e
// leva email + senha, para ninguem travar na hora de entrar no painel
const ehSexta = new Date(hojeStr + 'T12:00:00Z').getUTCDay() === 5;

/* ================================================================
   1) SINCRONIZAR — tarefa orfa vira item no painel do responsavel
   ================================================================ */
const desde7d = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const tarefasRecentes = await get(
  'tarefas?status=neq.concluida&responsavel_id=not.is.null&created_at=gte.' + desde7d +
  'T00:00:00&select=id,descricao,comando_original,responsavel_id,propriedade_id,origem,frequencia,data_limite'
);
const idsTarefas = tarefasRecentes.map((t) => t.id);

let itensDasTarefas = [];
if (idsTarefas.length > 0) {
  itensDasTarefas = await get(
    'checklist_items?tarefa_id=in.(' + idsTarefas.join(',') + ')&select=id,tarefa_id'
  );
}
const temItem = new Set(itensDasTarefas.map((i) => i.tarefa_id));

const orfas = tarefasRecentes.filter((t) => !temItem.has(t.id));
const sincronizadas = [];
if (orfas.length > 0) {
  const novos = orfas.map((t) => ({
    tarefa_id: t.id,
    propriedade_id: t.propriedade_id,
    colaborador_id: t.responsavel_id,
    descricao: t.descricao || t.comando_original || 'Tarefa',
    ordem: 1,
    status: 'pendente',
    whatsapp_enviado: false,
  }));
  const criados = await post('checklist_items', novos);
  criados.forEach((c) => sincronizadas.push({ tarefa_id: c.tarefa_id, item_id: c.id }));
}

/* ================================================================
   2) AVISAR
   ================================================================ */
const colaboradores = await get(
  'colaboradores?ativo=eq.true&select=id,nome,email,senha_hash,telefone,whatsapp_jid,propriedade_id,propriedades(id,nome,ativo)'
);

let filtro = 'checklist_items?status=eq.pendente';
if (modo === 'novos') filtro += '&or=(whatsapp_enviado.is.null,whatsapp_enviado.is.false)';
const pendentes = await get(
  filtro + '&select=id,descricao,ordem,colaborador_id,created_at,whatsapp_enviado,' +
  'tarefas(id,descricao,frequencia,origem,data_limite)&order=ordem.asc'
);

const porColab = {};
for (const item of pendentes) {
  if (!item.colaborador_id) continue;
  (porColab[item.colaborador_id] = porColab[item.colaborador_id] || []).push(item);
}

const LABEL = { diaria: 'Hoje', diario: 'Hoje', semanal: 'Da semana', quinzenal: 'Da quinzena', mensal: 'Do mes' };
const EMOJI = {
  diaria: '\u{2600}\u{fe0f}', diario: '\u{2600}\u{fe0f}', semanal: '\u{1f5d3}\u{fe0f}',
  quinzenal: '\u{1f504}', mensal: '\u{1f4c5}', avulsa: '\u{1f4cc}',
};
const ORDEM = ['diaria', 'diario', 'semanal', 'quinzenal', 'mensal', 'avulsa'];

const enviados = [];
const falhas = [];
const idsParaMarcar = [];

for (const colab of colaboradores) {
  const prop = colab.propriedades || {};
  if (prop.ativo === false) continue;

  const itens = porColab[colab.id] || [];
  if (itens.length === 0) continue;

  let telefone = String(colab.whatsapp_jid || colab.telefone || '').replace(/\D/g, '');
  if (!telefone || telefone.includes('00000000')) {
    falhas.push({ colaborador: colab.nome, motivo: 'sem telefone valido' });
    continue;
  }
  if (!telefone.startsWith('55')) telefone = '55' + telefone;

  const grupos = {};
  let atrasados = 0;
  for (const it of itens) {
    const t = it.tarefas || {};
    const freq = String(t.frequencia || '').toLowerCase();
    const chave = LABEL[freq] ? freq : 'avulsa';
    (grupos[chave] = grupos[chave] || []).push(it);
    const criadoEm = it.created_at ? diaFmt.format(new Date(it.created_at)) : hojeStr;
    if (criadoEm < hojeStr) atrasados++;
  }

  const novos = modo === 'novos';
  const cobranca = !novos && ehSexta;
  const partes = [];
  if (novos) {
    partes.push('\u{1f514} ' + colab.nome + ', chegou tarefa nova pra voce!');
  } else if (cobranca) {
    partes.push('\u{23f0} ' + saudacao + ', ' + colab.nome + '!');
    partes.push('');
    partes.push('Hoje e sexta — dia de fechar a semana.');
    partes.push(
      'Falta marcar ' + itens.length + (itens.length === 1 ? ' item' : ' itens') + ':'
    );
  } else {
    partes.push('\u{1f305} ' + saudacao + ', ' + colab.nome + '!');
    partes.push('');
    partes.push('Voce tem ' + itens.length + (itens.length === 1 ? ' item pendente' : ' itens pendentes') + ' no painel:');
  }

  for (const chave of ORDEM) {
    const g = grupos[chave];
    if (!g || g.length === 0) continue;
    partes.push('');
    partes.push(EMOJI[chave] + ' *' + (LABEL[chave] || 'Avulsas') + '* (' + g.length + ')');
    g.slice(0, 12).forEach((it) => partes.push('  \u{2022} ' + it.descricao));
    if (g.length > 12) partes.push('  ... e mais ' + (g.length - 12) + ' no painel');
  }

  if (!novos && atrasados > 0) {
    partes.push('');
    partes.push('\u{26a0}\u{fe0f} ' + atrasados + (atrasados === 1 ? ' item vem de dias anteriores' : ' itens vem de dias anteriores'));
  }

  partes.push('');
  partes.push('\u{1f449} Marque como feito no seu painel:');
  partes.push(PAINEL_URL);
  if (colab.email) partes.push('\u{1f464} Usuario: ' + colab.email);
  // a senha vai so na sexta, junto da cobranca de prazo
  if (cobranca && colab.senha_hash) partes.push('\u{1f511} Senha: ' + colab.senha_hash);
  if (!novos) {
    partes.push('');
    partes.push(cobranca ? '\u{23f0} Prazo: hoje ate 16:30!' : '\u{23f0} Preencher ate sexta-feira 16:30!');
  }

  const mensagem = partes.join('\n');

  try {
    await enviarWhats(telefone, mensagem);
    enviados.push({ colaborador: colab.nome, telefone: telefone, itens: itens.length, atrasados: atrasados });
    itens.forEach((it) => idsParaMarcar.push(it.id));
  } catch (e) {
    falhas.push({ colaborador: colab.nome, motivo: String(e.message || e) });
  }

  // respiro entre envios, para nao estourar limite da Evolution
  await new Promise((ok) => setTimeout(ok, 1200));
}

/* ================================================================
   3) MARCAR como avisado
   ================================================================ */
if (idsParaMarcar.length > 0) {
  const agora = new Date().toISOString();
  for (let i = 0; i < idsParaMarcar.length; i += 50) {
    const lote = idsParaMarcar.slice(i, i + 50);
    await patch('checklist_items?id=in.(' + lote.join(',') + ')', {
      whatsapp_enviado: true,
      whatsapp_enviado_at: agora,
    });
  }
}

return [{
  json: {
    modo: modo,
    data: hojeStr,
    tarefas_sincronizadas: sincronizadas.length,
    mensagens_enviadas: enviados.length,
    itens_marcados: idsParaMarcar.length,
    enviados: enviados,
    falhas: falhas,
  },
}];
