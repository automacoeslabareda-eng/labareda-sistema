/**
 * Labareda Gestao — Painel do Colaborador
 * Interface mobile-first para colaboradores marcarem tarefas do dia.
 * Conecta SOMENTE ao banco de gestao via Supabase REST API.
 */

/* ================================================================== */
/*  CONFIGURACAO                                                      */
/* ================================================================== */
var CONFIG = {
  SUPABASE_URL: 'https://tidngxclgaspltzqoemi.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE',
};

// URL do webhook n8n para notificacao no Telegram (configurar conforme necessario)
var WEBHOOK_NOTIFICACAO = 'https://n8n.sitiolabareda.com/webhook/tarefa-concluida';

/* ================================================================== */
/*  ESTADO GLOBAL                                                     */
/* ================================================================== */
var colaboradorLogado = null;
var tarefasCarregadas = [];

/* ================================================================== */
/*  SUPABASE REST HELPERS                                             */
/* ================================================================== */
function apiHeaders(preferHeader) {
  return {
    'apikey': CONFIG.SUPABASE_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': preferHeader || 'return=representation',
  };
}

async function supaFetch(path) {
  var url = CONFIG.SUPABASE_URL + '/rest/v1/' + path;
  var r = await fetch(url, { headers: apiHeaders() });
  if (!r.ok) throw new Error('GET ' + path + ': ' + r.status);
  return r.json();
}

async function supaUpdate(tabela, id, data) {
  var url = CONFIG.SUPABASE_URL + '/rest/v1/' + tabela + '?id=eq.' + id;
  var r = await fetch(url, {
    method: 'PATCH',
    headers: apiHeaders('return=representation'),
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    var txt = await r.text();
    throw new Error('PATCH ' + tabela + ': ' + txt);
  }
  return r.json();
}

/* ================================================================== */
/*  HELPERS                                                           */
/* ================================================================== */

// Retorna data de hoje no formato YYYY-MM-DD no fuso local
function hojeISO() {
  var d = new Date();
  var ano = d.getFullYear();
  var mes = String(d.getMonth() + 1).padStart(2, '0');
  var dia = String(d.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

// Formata data legivel: "Quarta, 30 de julho"
function dataLegivel() {
  var dias = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
  var meses = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var d = new Date();
  return dias[d.getDay()] + ', ' + d.getDate() + ' de ' + meses[d.getMonth()];
}

// Mostra toast de feedback
function mostrarToast(msg, erro) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (erro ? ' toast--erro' : '') + ' toast--visivel';
  clearTimeout(el._timer);
  el._timer = setTimeout(function() {
    el.classList.remove('toast--visivel');
  }, 3000);
}

/* ================================================================== */
/*  LOGIN / LOGOUT                                                    */
/* ================================================================== */
function verificarSessao() {
  try {
    var dados = sessionStorage.getItem('labareda_colaborador');
    if (dados) {
      colaboradorLogado = JSON.parse(dados);
      return true;
    }
  } catch (e) {
    console.error('Erro ao verificar sessao:', e);
  }
  return false;
}

function mostrarApp() {
  document.getElementById('login-screen').classList.add('escondido');
  document.getElementById('app-screen').classList.remove('escondido');

  // Preenche header
  var nomeEl = document.getElementById('header-nome');
  if (nomeEl && colaboradorLogado) {
    nomeEl.textContent = colaboradorLogado.nome;
  }
  var dataEl = document.getElementById('header-data');
  if (dataEl) {
    dataEl.textContent = dataLegivel();
  }
}

function mostrarLogin() {
  document.getElementById('login-screen').classList.remove('escondido');
  document.getElementById('app-screen').classList.add('escondido');
}

async function realizarLogin(event) {
  event.preventDefault();

  var email = (document.getElementById('login-email').value || '').trim().toLowerCase();
  var senha = (document.getElementById('login-senha').value || '').trim();
  var errorEl = document.getElementById('login-error');
  var btnEl = document.getElementById('login-btn');

  if (!email || !senha) {
    errorEl.textContent = 'Preencha email e senha';
    errorEl.classList.remove('escondido');
    return;
  }

  errorEl.classList.add('escondido');
  btnEl.disabled = true;
  btnEl.textContent = 'Entrando...';

  try {
    // Busca colaborador pelo email + senha + ativo
    var qs = 'colaboradores?email=eq.' + encodeURIComponent(email) +
             '&senha_hash=eq.' + encodeURIComponent(senha) +
             '&ativo=eq.true&select=id,nome,email,telefone,funcao,setor_id,propriedade_id';
    var data = await supaFetch(qs);

    if (!data || data.length === 0) {
      errorEl.textContent = 'Email ou senha incorretos';
      errorEl.classList.remove('escondido');
      btnEl.disabled = false;
      btnEl.textContent = 'Entrar';
      return;
    }

    var colab = data[0];
    colaboradorLogado = {
      id: colab.id,
      nome: colab.nome,
      email: colab.email,
      funcao: colab.funcao,
      setor_id: colab.setor_id,
      propriedade_id: colab.propriedade_id,
    };

    sessionStorage.setItem('labareda_colaborador', JSON.stringify(colaboradorLogado));
    mostrarApp();
    carregarTarefas();

  } catch (err) {
    console.error('Erro no login:', err);
    errorEl.textContent = 'Erro ao conectar. Tente novamente.';
    errorEl.classList.remove('escondido');
  }

  btnEl.disabled = false;
  btnEl.textContent = 'Entrar';
}

function realizarLogout() {
  sessionStorage.removeItem('labareda_colaborador');
  colaboradorLogado = null;
  tarefasCarregadas = [];

  // Limpa form
  var emailEl = document.getElementById('login-email');
  var senhaEl = document.getElementById('login-senha');
  var errorEl = document.getElementById('login-error');
  if (emailEl) emailEl.value = '';
  if (senhaEl) senhaEl.value = '';
  if (errorEl) errorEl.classList.add('escondido');

  mostrarLogin();
}

/* ================================================================== */
/*  CARREGAR TAREFAS DO DIA                                           */
/* ================================================================== */
async function carregarTarefas() {
  var container = document.getElementById('lista-tarefas');
  container.innerHTML = '<div class="carregando">Carregando tarefas...</div>';

  try {
    var hoje = hojeISO();

    // Busca checklist_items do colaborador:
    // 1. Todos os PENDENTES (inclusive de dias anteriores - cobrar!)
    // 2. Os CONCLUIDOS de hoje (para mostrar progresso do dia)
    var qsPendentes = 'checklist_items?colaborador_id=eq.' + colaboradorLogado.id +
             '&status=eq.pendente' +
             '&select=id,descricao,ordem,status,observacao,foto_url,concluido_at,tarefa_id,created_at,tarefas(id,descricao,comando_original,prioridade,data_limite,frequencia)' +
             '&order=created_at.desc,ordem.asc';

    var qsConcluidos = 'checklist_items?colaborador_id=eq.' + colaboradorLogado.id +
             '&status=eq.concluido' +
             '&concluido_at=gte.' + hoje + 'T00:00:00-03:00' +
             '&concluido_at=lt.' + hoje + 'T23:59:59-03:00' +
             '&select=id,descricao,ordem,status,observacao,foto_url,concluido_at,tarefa_id,created_at,tarefas(id,descricao,comando_original,prioridade,data_limite,frequencia)' +
             '&order=ordem.asc';

    var pendentes = await supaFetch(qsPendentes);
    var concluidos = await supaFetch(qsConcluidos);

    // Marcar itens atrasados (criados antes de hoje)
    if (pendentes) {
      for (var p = 0; p < pendentes.length; p++) {
        var createdDate = pendentes[p].created_at ? pendentes[p].created_at.substring(0, 10) : hoje;
        pendentes[p]._atrasado = createdDate < hoje;
      }
    }

    var items = (pendentes || []).concat(concluidos || []);
    var qs = ''; // dummy

    tarefasCarregadas = items || [];

    renderizarTarefas();
    atualizarContagem();
    verificarTudoConcluido();

  } catch (err) {
    console.error('Erro ao carregar tarefas:', err);
    container.innerHTML =
      '<div class="estado-vazio">' +
        '<div class="estado-vazio__icone">&#9888;</div>' +
        '<div class="estado-vazio__texto">Erro ao carregar tarefas. Tente novamente.</div>' +
      '</div>';
    mostrarToast('Erro ao carregar tarefas', true);
  }
}

/* ================================================================== */
/*  RENDERIZAR LISTA DE TAREFAS                                       */
/* ================================================================== */
function renderizarTarefas() {
  var container = document.getElementById('lista-tarefas');

  if (tarefasCarregadas.length === 0) {
    var diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
    var agora = new Date();
    var hora = agora.getHours();
    var msgVazio = '';
    if (hora < 7) {
      msgVazio = 'Suas tarefas de hoje serao geradas as 7h da manha.';
    } else {
      msgVazio = 'Nenhuma tarefa programada para hoje. Bom descanso!';
    }
    container.innerHTML =
      '<div class="estado-vazio">' +
        '<div class="estado-vazio__icone">&#9996;</div>' +
        '<div class="estado-vazio__texto">' + msgVazio + '</div>' +
        '<div class="estado-vazio__dica">As tarefas sao geradas automaticamente todo dia as 7h.</div>' +
      '</div>';
    return;
  }

  // Agrupar por tarefa pai
  var grupos = {};
  var grupoOrdem = [];
  for (var i = 0; i < tarefasCarregadas.length; i++) {
    var item = tarefasCarregadas[i];
    var tarefaPai = item.tarefas;
    var grupoId = item.tarefa_id || 'sem-tarefa';
    var grupoNome = '';
    if (tarefaPai) {
      grupoNome = tarefaPai.descricao || tarefaPai.comando_original || 'Tarefas';
    } else {
      grupoNome = 'Outras Tarefas';
    }
    // periodo do checklist: diaria / semanal / quinzenal / mensal.
    // tarefa criada na mao (Hermes, Telegram, dashboard) vem sem
    // frequencia e entra como 'avulsa'.
    var periodo = tarefaPai && tarefaPai.frequencia
      ? String(tarefaPai.frequencia).toLowerCase()
      : 'avulsa';
    if (periodo === 'diario') periodo = 'diaria';
    if (['diaria','semanal','quinzenal','mensal'].indexOf(periodo) === -1) periodo = 'avulsa';

    if (!grupos[grupoId]) {
      grupos[grupoId] = { nome: grupoNome, items: [], periodo: periodo };
      grupoOrdem.push(grupoId);
    }
    grupos[grupoId].items.push(item);
  }

  // Barra de progresso geral
  var total = tarefasCarregadas.length;
  var feitas = 0;
  for (var j = 0; j < tarefasCarregadas.length; j++) {
    if (tarefasCarregadas[j].status === 'concluido') feitas++;
  }
  var pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
  var barColor = pct === 100 ? '#3D6B4F' : pct > 50 ? '#B8964E' : '#C45D3E';

  var html = '<div class="progresso-geral">';
  html += '  <div class="progresso-geral__barra">';
  html += '    <div class="progresso-geral__fill" style="width:' + pct + '%;background:' + barColor + '"></div>';
  html += '  </div>';
  html += '  <div class="progresso-geral__texto">' + pct + '% concluido</div>';
  html += '</div>';

  // Separar por periodo: atrasadas primeiro, depois hoje / semana /
  // quinzena / mes, e por fim as concluidas.
  var atrasadas = [];
  var concluidos = [];
  var porPeriodo = { diaria: [], semanal: [], quinzenal: [], mensal: [], avulsa: [] };

  for (var g = 0; g < grupoOrdem.length; g++) {
    var gid = grupoOrdem[g];
    var grupo = grupos[gid];
    var grupoFeitas = 0;
    var temAtrasado = false;
    for (var k = 0; k < grupo.items.length; k++) {
      if (grupo.items[k].status === 'concluido') grupoFeitas++;
      if (grupo.items[k]._atrasado) temAtrasado = true;
    }
    var entrada = { id: gid, grupo: grupo, feitas: grupoFeitas };

    if (grupoFeitas === grupo.items.length) {
      concluidos.push(entrada);
    } else if (temAtrasado) {
      atrasadas.push(entrada);
    } else {
      porPeriodo[grupo.periodo].push(entrada);
    }
  }

  // Atrasadas (destaque vermelho)
  if (atrasadas.length > 0) {
    html += '<div class="secao-titulo secao-titulo--atrasado">&#9888; Pendentes de dias anteriores</div>';
    for (var a = 0; a < atrasadas.length; a++) {
      html += renderizarGrupo(atrasadas[a].grupo, atrasadas[a].feitas, true);
    }
  }

  // Hoje / semana / quinzena / mes — nesta ordem
  var SECOES = [
    { chave: 'diaria',    titulo: '&#9728;&#65039; Tarefas de hoje' },
    { chave: 'avulsa',    titulo: '&#128221; Tarefas de hoje' },
    { chave: 'semanal',   titulo: '&#128197; Checklist da semana' },
    { chave: 'quinzenal', titulo: '&#128260; Checklist da quinzena' },
    { chave: 'mensal',    titulo: '&#128198; Checklist do mes' },
  ];
  var tituloAnterior = '';
  for (var s = 0; s < SECOES.length; s++) {
    var lista = porPeriodo[SECOES[s].chave];
    if (!lista || lista.length === 0) continue;
    // 'diaria' e 'avulsa' compartilham o mesmo titulo: nao repetir
    if (SECOES[s].titulo !== tituloAnterior) {
      html += '<div class="secao-titulo">' + SECOES[s].titulo + '</div>';
      tituloAnterior = SECOES[s].titulo;
    }
    for (var p = 0; p < lista.length; p++) {
      html += renderizarGrupo(lista[p].grupo, lista[p].feitas, false);
    }
  }

  // Concluidos (colapsados)
  if (concluidos.length > 0) {
    var totalConcl = 0;
    for (var ci = 0; ci < concluidos.length; ci++) {
      totalConcl += concluidos[ci].grupo.items.length;
    }
    html += '<div class="secao-concluidos">';
    html += '  <div class="secao-concluidos__header" onclick="toggleConcluidos()">';
    html += '    &#9989; <strong>' + totalConcl + ' itens concluidos hoje</strong>';
    html += '    <span class="secao-concluidos__seta" id="seta-concluidos">&#9660;</span>';
    html += '  </div>';
    html += '  <div class="secao-concluidos__lista escondido" id="lista-concluidos">';
    for (var c = 0; c < concluidos.length; c++) {
      html += renderizarGrupo(concluidos[c].grupo, concluidos[c].feitas, false);
    }
    html += '  </div>';
    html += '</div>';
  }

  container.innerHTML = html;
}

function renderizarGrupo(grupo, feitas, atrasado) {
  var totalGrupo = grupo.items.length;
  var todoConcluido = feitas === totalGrupo;
  var classe = todoConcluido ? ' grupo-tarefa--done' : (atrasado ? ' grupo-tarefa--atrasado' : '');

  var SELO = {
    diaria:    { texto: 'hoje',     cor: '#B8964E' },
    semanal:   { texto: 'semana',   cor: '#3D6B4F' },
    quinzenal: { texto: 'quinzena', cor: '#4A6FA5' },
    mensal:    { texto: 'mes',      cor: '#7A4E8C' },
  };
  var selo = SELO[grupo.periodo];

  var html = '<div class="grupo-tarefa' + classe + '">';
  html += '  <div class="grupo-tarefa__header">';
  html += '    <div class="grupo-tarefa__nome">' + escapeHtml(grupo.nome);
  if (selo) {
    html += ' <span class="grupo-tarefa__selo" style="background:' + selo.cor + '">' + selo.texto + '</span>';
  }
  html += '</div>';
  html += '    <div class="grupo-tarefa__progresso">' + feitas + '/' + totalGrupo + '</div>';
  html += '  </div>';

  for (var i = 0; i < grupo.items.length; i++) {
    var item = grupo.items[i];
    var concluido = item.status === 'concluido';

    html += '<div class="tarefa-card' + (concluido ? ' tarefa-card--concluido' : '') + '" id="card-' + item.id + '">';

    // Linha principal: checkbox + nome + acoes discretas
    html += '  <div class="tarefa-card__topo" onclick="toggleConcluir(\'' + item.id + '\')">';

    // Checkbox
    html += '    <div class="tarefa-card__check' + (concluido ? ' tarefa-card__check--done' : '') + '">';
    html += concluido ? '&#10003;' : '';
    html += '    </div>';

    // Descricao
    html += '    <div class="tarefa-card__descricao' + (concluido ? ' tarefa-card__descricao--done' : '') + '">';
    html += escapeHtml(item.descricao || 'Sem descricao');
    if (concluido && item.concluido_at) {
      var dt = new Date(item.concluido_at);
      var hora = dt.getHours().toString().padStart(2,'0') + ':' + dt.getMinutes().toString().padStart(2,'0');
      html += ' <span class="tarefa-card__hora">' + hora + '</span>';
    }
    html += '    </div>';

    // Icones discretos de obs/foto (nao concluido)
    if (!concluido) {
      html += '  <div class="tarefa-card__icons" onclick="event.stopPropagation()">';
      html += '    <span class="icon-btn" onclick="toggleObs(\'' + item.id + '\')" title="Observacao">&#128172;</span>';
      html += '    <span class="icon-btn" onclick="abrirFoto(\'' + item.id + '\')" title="Foto">&#128247;</span>';
      html += '    <input type="file" accept="image/*" capture="environment" class="input-foto-hidden" id="foto-input-' + item.id + '" onchange="processarFoto(\'' + item.id + '\')">';
      html += '  </div>';
    }

    html += '  </div>'; // topo

    // Indicadores (foto/obs) pequenos
    if (item.foto_url || item.observacao) {
      html += '<div class="tarefa-card__indicadores">';
      if (item.foto_url) html += '<span class="indicador">&#128248;</span>';
      if (item.observacao) html += '<span class="indicador">&#128172; ' + escapeHtml(item.observacao).substring(0, 40) + '</span>';
      html += '</div>';
    }

    // Area de observacao (escondida)
    if (!concluido) {
      html += '  <div class="tarefa-card__obs-area escondido" id="obs-area-' + item.id + '">';
      html += '    <textarea id="obs-text-' + item.id + '" placeholder="Observacao...">' + escapeHtml(item.observacao || '') + '</textarea>';
      html += '    <button class="btn btn--primary btn--sm" onclick="salvarObs(\'' + item.id + '\')">Salvar</button>';
      html += '  </div>';
    }

    html += '</div>'; // card
  }

  html += '</div>'; // grupo
  return html;
}

function atualizarContagem() {
  var el = document.getElementById('contagem-tarefas');
  if (!el) return;

  var total = tarefasCarregadas.length;
  var feitas = 0;
  for (var i = 0; i < tarefasCarregadas.length; i++) {
    if (tarefasCarregadas[i].status === 'concluido') feitas++;
  }

  if (total === 0) {
    el.textContent = 'Nenhuma tarefa';
  } else {
    el.textContent = feitas + '/' + total + ' concluidas';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================== */
/*  MARCAR COMO CONCLUIDO / DESFAZER                                  */
/* ================================================================== */
async function toggleConcluir(itemId) {
  // Encontra o item no array local
  var item = null;
  var idx = -1;
  for (var i = 0; i < tarefasCarregadas.length; i++) {
    if (tarefasCarregadas[i].id === itemId) {
      item = tarefasCarregadas[i];
      idx = i;
      break;
    }
  }
  if (!item) return;

  var jaConcluido = item.status === 'concluido';

  try {
    if (jaConcluido) {
      // Desfazer — volta para pendente
      await supaUpdate('checklist_items', itemId, {
        status: 'pendente',
        concluido_at: null,
      });

      tarefasCarregadas[idx].status = 'pendente';
      tarefasCarregadas[idx].concluido_at = null;
      mostrarToast('Tarefa reaberta');

    } else {
      // Marcar como concluido
      var agora = new Date().toISOString();

      // Coleta observacao se preenchida
      var obsEl = document.getElementById('obs-text-' + itemId);
      var obsTexto = obsEl ? obsEl.value.trim() : '';

      var updateData = {
        status: 'concluido',
        concluido_at: agora,
      };

      if (obsTexto) {
        updateData.observacao = obsTexto;
      }

      await supaUpdate('checklist_items', itemId, updateData);

      tarefasCarregadas[idx].status = 'concluido';
      tarefasCarregadas[idx].concluido_at = agora;
      if (obsTexto) tarefasCarregadas[idx].observacao = obsTexto;

      mostrarToast('Tarefa concluida!');

      // Envia webhook de notificacao (nao bloqueia a UI)
      enviarWebhook(item, obsTexto);
    }

    renderizarTarefas();
    atualizarContagem();

    // Verifica se TODAS foram concluidas — envia relatorio automatico
    verificarTudoConcluido();

  } catch (err) {
    console.error('Erro ao atualizar tarefa:', err);
    mostrarToast('Erro ao atualizar. Tente novamente.', true);
  }
}

/* ================================================================== */
/*  OBSERVACAO                                                        */
/* ================================================================== */
function toggleObs(itemId) {
  var area = document.getElementById('obs-area-' + itemId);
  if (!area) return;
  area.classList.toggle('escondido');

  // Foca no textarea ao abrir
  if (!area.classList.contains('escondido')) {
    var ta = document.getElementById('obs-text-' + itemId);
    if (ta) ta.focus();
  }
}

async function salvarObs(itemId) {
  var ta = document.getElementById('obs-text-' + itemId);
  if (!ta) return;

  var texto = ta.value.trim();
  if (!texto) {
    mostrarToast('Escreva algo antes de salvar', true);
    return;
  }

  try {
    await supaUpdate('checklist_items', itemId, { observacao: texto });

    // Atualiza local
    for (var i = 0; i < tarefasCarregadas.length; i++) {
      if (tarefasCarregadas[i].id === itemId) {
        tarefasCarregadas[i].observacao = texto;
        break;
      }
    }

    mostrarToast('Observacao salva!');
  } catch (err) {
    console.error('Erro ao salvar observacao:', err);
    mostrarToast('Erro ao salvar. Tente novamente.', true);
  }
}

/* ================================================================== */
/*  FOTO                                                              */
/* ================================================================== */
function abrirFoto(itemId) {
  var input = document.getElementById('foto-input-' + itemId);
  if (input) input.click();
}

async function processarFoto(itemId) {
  var input = document.getElementById('foto-input-' + itemId);
  if (!input || !input.files || !input.files[0]) return;

  var file = input.files[0];

  // Valida tamanho (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    mostrarToast('Foto muito grande (max 5MB)', true);
    return;
  }

  mostrarToast('Enviando foto...');

  try {
    // Tenta upload para Supabase Storage (bucket "fotos")
    var fotoUrl = await uploadFotoStorage(file, itemId);

    // Se Storage falhar, usa base64 como fallback
    if (!fotoUrl) {
      fotoUrl = await converterBase64(file);
    }

    // Salva URL no banco
    await supaUpdate('checklist_items', itemId, { foto_url: fotoUrl });

    // Atualiza local
    for (var i = 0; i < tarefasCarregadas.length; i++) {
      if (tarefasCarregadas[i].id === itemId) {
        tarefasCarregadas[i].foto_url = fotoUrl;
        break;
      }
    }

    mostrarToast('Foto salva!');
    renderizarTarefas();

  } catch (err) {
    console.error('Erro ao processar foto:', err);
    mostrarToast('Erro ao salvar foto. Tente novamente.', true);
  }
}

// Tenta upload para Supabase Storage bucket "fotos"
async function uploadFotoStorage(file, itemId) {
  try {
    var extensao = file.name.split('.').pop() || 'jpg';
    var nomeArquivo = colaboradorLogado.id + '/' + itemId + '_' + Date.now() + '.' + extensao;
    var url = CONFIG.SUPABASE_URL + '/storage/v1/object/fotos/' + nomeArquivo;

    var r = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!r.ok) {
      console.warn('Storage upload falhou (status ' + r.status + '), usando base64 como fallback');
      return null;
    }

    // Retorna URL publica
    var publicUrl = CONFIG.SUPABASE_URL + '/storage/v1/object/public/fotos/' + nomeArquivo;
    return publicUrl;

  } catch (err) {
    console.warn('Storage indisponivel, usando base64:', err);
    return null;
  }
}

// Fallback: converte imagem para base64 data URL
function converterBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      // Redimensiona se muito grande (max 800px largura para economia)
      var img = new Image();
      img.onload = function() {
        var maxW = 800;
        var w = img.width;
        var h = img.height;

        if (w > maxW) {
          h = Math.round(h * (maxW / w));
          w = maxW;
        }

        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = function() {
        // Se nao conseguir como imagem, usa base64 direto
        resolve(e.target.result);
      };
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ================================================================== */
/*  VERIFICAR TUDO CONCLUIDO — RELATORIO AUTOMATICO                   */
/* ================================================================== */
var relatorioEnviado = false;

function toggleConcluidos() {
  var lista = document.getElementById('lista-concluidos');
  var seta = document.getElementById('seta-concluidos');
  if (!lista) return;
  lista.classList.toggle('escondido');
  if (seta) seta.textContent = lista.classList.contains('escondido') ? '\u25BC' : '\u25B2';
}

function verificarTudoConcluido() {
  if (tarefasCarregadas.length === 0) return;

  var todasFeitas = true;
  for (var i = 0; i < tarefasCarregadas.length; i++) {
    if (tarefasCarregadas[i].status !== 'concluido') {
      todasFeitas = false;
      break;
    }
  }

  if (!todasFeitas) return;

  // Enviar relatorio apenas uma vez por sessao
  if (!relatorioEnviado && WEBHOOK_NOTIFICACAO) {
    relatorioEnviado = true;

    var resumo = '';
    resumo += '\n\n📊 Resumo do dia:\n';
    for (var j = 0; j < tarefasCarregadas.length; j++) {
      var t = tarefasCarregadas[j];
      var hora = '';
      if (t.concluido_at) {
        var dt = new Date(t.concluido_at);
        hora = ' (' + dt.getHours().toString().padStart(2,'0') + ':' + dt.getMinutes().toString().padStart(2,'0') + ')';
      }
      resumo += '  ✅ ' + (t.descricao || '') + hora + '\n';
      if (t.observacao) resumo += '     💬 ' + t.observacao + '\n';
    }

    fetch(WEBHOOK_NOTIFICACAO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colaborador_nome: colaboradorLogado.nome,
        descricao_item: tarefasCarregadas.length + ' tarefas concluidas',
        tarefa_nome: '🏁 Dia completo — ' + colaboradorLogado.nome,
        foto_url: '',
        observacao: resumo,
        propriedade_id: colaboradorLogado.propriedade_id || '',
      }),
    }).catch(function() {});
  }

  // Mostrar banner no topo
  var container = document.getElementById('lista-tarefas');
  if (container.querySelector('.tudo-feito')) return; // ja tem banner

  var diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
  var amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  var diaAmanha = diasSemana[amanha.getDay()];

  var banner = '<div class="tudo-feito">' +
    '<div class="tudo-feito__icone">&#127881;</div>' +
    '<div class="tudo-feito__texto">Tudo feito! Bom trabalho, ' + escapeHtml(colaboradorLogado.nome) + '!</div>' +
    '<div class="tudo-feito__sub">Relatorio enviado para o grupo</div>' +
    '<div class="tudo-feito__proximo">' +
      '&#128197; <strong>Proximas tarefas:</strong> ' + diaAmanha + ' as 7h<br>' +
      '&#128241; Voce recebera no WhatsApp quando estiverem prontas' +
    '</div>' +
    '</div>';
  container.insertAdjacentHTML('afterbegin', banner);
}

/* ================================================================== */
/*  WEBHOOK DE NOTIFICACAO                                            */
/* ================================================================== */
async function enviarWebhook(item, observacao) {
  if (!WEBHOOK_NOTIFICACAO) return;

  var tarefaPai = item.tarefas;
  var nomeTarefa = '';
  if (tarefaPai) {
    nomeTarefa = tarefaPai.descricao || tarefaPai.comando_original || '';
  }

  var payload = {
    colaborador_nome: colaboradorLogado.nome,
    descricao_item: item.descricao,
    tarefa_nome: nomeTarefa,
    foto_url: item.foto_url || '',
    observacao: observacao || item.observacao || '',
    propriedade_id: colaboradorLogado.propriedade_id || '',
  };

  try {
    await fetch(WEBHOOK_NOTIFICACAO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Webhook e best-effort, nao bloqueia a experiencia do usuario
    console.warn('Webhook falhou (nao critico):', err);
  }
}

/* ================================================================== */
/*  INICIALIZACAO                                                     */
/* ================================================================== */
(function init() {
  if (verificarSessao()) {
    mostrarApp();
    carregarTarefas();
  } else {
    mostrarLogin();
  }
})();
