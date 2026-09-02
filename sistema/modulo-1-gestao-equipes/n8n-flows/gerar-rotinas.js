/* ==================================================================
   GERAR TAREFAS DO DIA — a partir das rotinas cadastradas
   Roda 1x por dia (07h00 Brasilia). Um unico node Code faz tudo:
   le propriedades + rotinas + rotina_items, decide o que dispara hoje,
   cria a tarefa e TODOS os itens do checklist de uma vez.

   Regras de disparo (com catch-up: se o cron falhar no dia certo,
   ele gera assim que voltar a rodar, dentro do mesmo periodo):
     diaria     -> todo dia
     semanal    -> 1x por semana, a partir do dia_semana da rotina
     quinzenal  -> 1x por quinzena, ja no 1o dia dela (dia 1 e dia 16)
     mensal     -> 1x por mes, ja no 1o dia do mes

   Quinzenal e mensal abrem no inicio do periodo de proposito: assim o
   colaborador ve esse checklist no painel durante o periodo inteiro,
   e nao apenas no dia em que a rotina dispararia.
   ================================================================== */

const SUPA = 'https://tidngxclgaspltzqoemi.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE';
const TZ = 'America/Bahia'; // UTC-3 fixo, sem horario de verao

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

/* ---------- datas ---------- */
// "hoje" no fuso do sitio, como YYYY-MM-DD
const hojeStr = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const hojeD = new Date(hojeStr + 'T12:00:00Z'); // meio-dia UTC evita virada de fuso
const diaSemana = hojeD.getUTCDay();            // 0=Dom ... 6=Sab
const diaMes = hojeD.getUTCDate();

function addDias(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
const iso = (d) => d.toISOString().slice(0, 10);

// segunda-feira da semana corrente ... domingo
const offsetSemana = (dia) => (dia + 6) % 7; // Seg=0, Ter=1, ..., Dom=6
const semanaInicio = addDias(hojeD, -offsetSemana(diaSemana));
const semanaFim = addDias(semanaInicio, 6);
const mesInicio = new Date(Date.UTC(hojeD.getUTCFullYear(), hojeD.getUTCMonth(), 1, 12));
const mesFim = new Date(Date.UTC(hojeD.getUTCFullYear(), hojeD.getUTCMonth() + 1, 0, 12));

// quinzena corrente: A = dias 1-15, B = dia 16 ate o fim do mes
const quinzenaInicio = diaMes <= 15
  ? mesInicio
  : new Date(Date.UTC(hojeD.getUTCFullYear(), hojeD.getUTCMonth(), 16, 12));
const quinzenaFim = diaMes <= 15
  ? new Date(Date.UTC(hojeD.getUTCFullYear(), hojeD.getUTCMonth(), 15, 12))
  : mesFim;

/* ---------- leitura ---------- */
const propriedades = await get('propriedades?ativo=eq.true&select=id,nome,slug');
const rotinas = await get(
  'rotinas_semanais?ativo=eq.true&select=id,propriedade_id,nome,setor_id,dia_semana,frequencia,responsavel_id,setores(nome)'
);
const rotinaItems = await get('rotina_items?select=id,rotina_id,descricao,ordem,colaborador_id&order=rotina_id,ordem');

// tarefas dos ultimos 40 dias, para deduplicar por periodo
const desde = iso(addDias(hojeD, -40));
const tarefasRecentes = await get(
  'tarefas?origem=eq.rotina&rotina_id=not.is.null&created_at=gte.' + desde + 'T00:00:00&select=id,rotina_id,created_at'
);

const propsAtivas = new Set(propriedades.map((p) => p.id));
const nomeProp = {};
propriedades.forEach((p) => { nomeProp[p.id] = p.nome; });

const itensPorRotina = {};
rotinaItems.forEach((i) => {
  (itensPorRotina[i.rotina_id] = itensPorRotina[i.rotina_id] || []).push(i);
});

// ultima geracao de cada rotina (data YYYY-MM-DD no fuso do sitio)
const ultimaGeracao = {};
tarefasRecentes.forEach((t) => {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(t.created_at));
  if (!ultimaGeracao[t.rotina_id] || d > ultimaGeracao[t.rotina_id]) ultimaGeracao[t.rotina_id] = d;
});

/* ---------- decisao: essa rotina dispara hoje? ---------- */
function avaliar(rotina) {
  const freq = String(rotina.frequencia || 'semanal').toLowerCase();
  const ultima = ultimaGeracao[rotina.id] || null;
  // rotina sem dia definido dispara no primeiro dia do periodo (segunda)
  const diaAlvo = rotina.dia_semana === null || rotina.dia_semana === undefined ? 1 : Number(rotina.dia_semana);
  const chegouNoDia = offsetSemana(diaSemana) >= offsetSemana(diaAlvo);

  if (freq === 'diaria' || freq === 'diario') {
    if (ultima === hojeStr) return { gerar: false, motivo: 'ja gerou hoje' };
    return { gerar: true, inicio: hojeStr, fim: hojeStr };
  }

  // quinzenal e mensal abrem no inicio do periodo, para ficarem visiveis
  // no painel do colaborador durante todo o periodo
  if (freq === 'quinzenal') {
    if (ultima && ultima >= iso(quinzenaInicio)) return { gerar: false, motivo: 'ja gerou nesta quinzena' };
    return { gerar: true, inicio: iso(quinzenaInicio), fim: iso(quinzenaFim) };
  }

  if (freq === 'mensal') {
    if (ultima && ultima >= iso(mesInicio)) return { gerar: false, motivo: 'ja gerou neste mes' };
    return { gerar: true, inicio: iso(mesInicio), fim: iso(mesFim) };
  }

  // semanal (default)
  if (ultima && ultima >= iso(semanaInicio)) return { gerar: false, motivo: 'ja gerou nesta semana' };
  if (!chegouNoDia) return { gerar: false, motivo: 'ainda nao chegou o dia da rotina' };
  return { gerar: true, inicio: iso(semanaInicio), fim: iso(semanaFim) };
}

/* ---------- execucao ---------- */
const criadas = [];
const puladas = [];
const erros = [];

for (const rotina of rotinas) {
  if (!propsAtivas.has(rotina.propriedade_id)) continue;

  const decisao = avaliar(rotina);
  if (!decisao.gerar) {
    puladas.push({ rotina: rotina.nome, motivo: decisao.motivo });
    continue;
  }

  const itens = itensPorRotina[rotina.id] || [];
  if (itens.length === 0) {
    puladas.push({ rotina: rotina.nome, motivo: 'rotina sem itens cadastrados' });
    continue;
  }

  try {
    const freq = String(rotina.frequencia || 'semanal').toLowerCase();
    const tarefa = (await post('tarefas', {
      propriedade_id: rotina.propriedade_id,
      comando_original: rotina.nome,
      descricao: rotina.nome,
      setor_id: rotina.setor_id,
      setor_interpretado: (rotina.setores && rotina.setores.nome) || 'geral',
      status: 'pendente',
      prioridade: freq === 'mensal' ? 'alta' : 'normal',
      origem: 'rotina',
      rotina_id: rotina.id,
      frequencia: freq,
      responsavel_id: rotina.responsavel_id || null,
      data_inicio: decisao.inicio,
      data_fim: decisao.fim,
      data_limite: decisao.fim,
    }))[0];

    // insert em lote: todos os itens do checklist de uma vez
    const payload = itens.map((it) => ({
      tarefa_id: tarefa.id,
      propriedade_id: rotina.propriedade_id,
      colaborador_id: it.colaborador_id || rotina.responsavel_id || null,
      descricao: it.descricao,
      ordem: it.ordem,
      status: 'pendente',
    }));
    const inseridos = await post('checklist_items', payload);

    criadas.push({
      propriedade: nomeProp[rotina.propriedade_id],
      rotina: rotina.nome,
      frequencia: freq,
      tarefa_id: tarefa.id,
      itens: inseridos.length,
    });
  } catch (e) {
    erros.push({ rotina: rotina.nome, erro: String(e.message || e) });
  }
}

return [{
  json: {
    data: hojeStr,
    dia_semana: diaSemana,
    rotinas_avaliadas: rotinas.length,
    tarefas_criadas: criadas.length,
    itens_criados: criadas.reduce((s, c) => s + c.itens, 0),
    criadas,
    puladas,
    erros,
    tem_novidade: criadas.length > 0,
  },
}];
