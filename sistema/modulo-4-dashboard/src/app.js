/**
 * Labareda Gestao — Dashboard de Propriedades
 * Conecta SOMENTE ao banco de gestao.
 */

/* ================================================================== */
/*  CONFIGURACAO                                                      */
/* ================================================================== */
const CONFIG = {
  SUPABASE_URL: 'https://tidngxclgaspltzqoemi.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE',
};

/* ================================================================== */
/*  ESTADO GLOBAL                                                     */
/* ================================================================== */
var paginaAtual = 'visao-geral';
var propriedadeFiltro = 'todas';
var modalModo = null;
var modalItemId = null;

var cacheSetores = [];
var cachePropriedades = [];

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

async function supaInsert(tabela, data) {
  var url = CONFIG.SUPABASE_URL + '/rest/v1/' + tabela;
  var r = await fetch(url, {
    method: 'POST',
    headers: apiHeaders('return=representation'),
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    var txt = await r.text();
    throw new Error('POST ' + tabela + ': ' + txt);
  }
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

async function supaCount(tabela, filtro) {
  var qs = filtro ? '&' + filtro : '';
  var url = CONFIG.SUPABASE_URL + '/rest/v1/' + tabela + '?select=id' + qs;
  var h = Object.assign({}, apiHeaders(), { 'Prefer': 'count=exact' });
  var r = await fetch(url, { headers: h });
  var range = r.headers.get('content-range');
  if (range) {
    var parts = range.split('/');
    return parseInt(parts[1]) || 0;
  }
  var d = await r.json();
  return d.length;
}

// Adds propriedade filter to a query string
function addPropFiltro(qs) {
  if (propriedadeFiltro !== 'todas') {
    return qs + '&propriedade_id=eq.' + propriedadeFiltro;
  }
  return qs;
}

function propFiltroParam() {
  if (propriedadeFiltro !== 'todas') {
    return 'propriedade_id=eq.' + propriedadeFiltro;
  }
  return '';
}

/* ================================================================== */
/*  DOM HELPERS                                                       */
/* ================================================================== */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function mostrarToast(msg, tipo) {
  var toast = $('#toast');
  toast.textContent = msg;
  toast.className = 'toast toast--' + (tipo || 'success');
  setTimeout(function() { toast.classList.add('escondido'); }, 3500);
}

function formatarData(iso) {
  if (!iso) return '--';
  var d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function slugStatus(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/\s+/g, '_');
}

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ================================================================== */
/*  NAVEGACAO                                                         */
/* ================================================================== */
function navegarPara(pagina) {
  $$('.page').forEach(function(p) { p.classList.add('page--hidden'); });
  var el = $('#page-' + pagina);
  if (el) el.classList.remove('page--hidden');

  $$('.sidebar__link').forEach(function(l) {
    l.classList.toggle('sidebar__link--active', l.dataset.page === pagina);
  });

  var linkAtivo = document.querySelector('.sidebar__link[data-page="' + pagina + '"] span');
  if (linkAtivo) $('#topbar-title').textContent = linkAtivo.textContent;

  paginaAtual = pagina;

  $('#sidebar').classList.remove('sidebar--open');
  $('#sidebar-overlay').classList.remove('sidebar-overlay--open');

  carregarPagina(pagina);
}

function toggleSidebar() {
  $('#sidebar').classList.toggle('sidebar--open');
  $('#sidebar-overlay').classList.toggle('sidebar-overlay--open');
}

function filtrarPropriedade() {
  propriedadeFiltro = $('#filtro-propriedade').value;

  // Remove previous propriedade classes
  document.body.classList.remove('propriedade-labareda', 'propriedade-saomiguel');

  // Find selected propriedade data
  var banner = $('#propriedade-banner');
  if (propriedadeFiltro !== 'todas') {
    var prop = cachePropriedades.find(function(p) { return String(p.id) === String(propriedadeFiltro); });
    if (prop) {
      var slug = (prop.slug || prop.nome || '').toLowerCase();
      if (slug.indexOf('labareda') !== -1) {
        document.body.classList.add('propriedade-labareda');
      } else if (slug.indexOf('miguel') !== -1 || slug.indexOf('sao-miguel') !== -1 || slug.indexOf('saomiguel') !== -1) {
        document.body.classList.add('propriedade-saomiguel');
      }
      banner.textContent = prop.nome;
    }
  } else {
    banner.textContent = '';
  }

  carregarPagina(paginaAtual);
}

function carregarPagina(pagina) {
  switch (pagina) {
    case 'visao-geral':    carregarVisaoGeral(); break;
    case 'colaboradores':  carregarColaboradores(); break;
    case 'tarefas':        carregarTarefas(); break;
    case 'rotinas':        carregarRotinas(); break;
    case 'relatorios':     carregarRelatorios(); break;
    case 'configuracoes':  carregarConfiguracoes(); break;
  }
}

/* ================================================================== */
/*  VISAO GERAL                                                       */
/* ================================================================== */
async function carregarVisaoGeral() {
  try {
    var pf = propFiltroParam();

    var [totalColabs, tarefasAtivas, tarefasConcluidas, totalTarefas, ultimas] = await Promise.all([
      supaCount('colaboradores', pf ? pf + '&ativo=eq.true' : 'ativo=eq.true'),
      supaCount('tarefas', 'status=in.(pendente,em_andamento)' + (pf ? '&' + pf : '')),
      supaCount('tarefas', 'status=eq.concluida' + (pf ? '&' + pf : '')),
      supaCount('tarefas', pf || undefined),
      supaFetch('tarefas?select=*&order=created_at.desc&limit=5' + (pf ? '&' + pf : '')),
    ]);

    $('#stat-colaboradores').textContent = totalColabs;
    $('#stat-tarefas-ativas').textContent = tarefasAtivas;
    $('#stat-tarefas-concluidas').textContent = tarefasConcluidas;

    var pct = totalTarefas > 0 ? Math.round((tarefasConcluidas / totalTarefas) * 100) : 0;
    $('#stat-conclusao').textContent = pct + '%';

    var container = $('#ultimas-tarefas');
    if (!ultimas || ultimas.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhuma tarefa encontrada</p>';
      return;
    }

    container.innerHTML = ultimas.map(function(t) {
      var status = slugStatus(t.status);
      var cmd = t.comando_original || t.descricao || 'Tarefa';
      if (cmd.length > 60) cmd = cmd.substring(0, 57) + '...';
      return '<div class="lista-simples__item">' +
        '<span class="lista-simples__texto">' + escapeHtml(cmd) + '</span>' +
        '<span class="lista-simples__setor">' + escapeHtml(t.setor || '') + '</span>' +
        '<span class="badge badge--' + status + '">' + (t.status || 'pendente') + '</span>' +
        '</div>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar visao geral:', err);
    mostrarToast('Erro ao carregar dados', 'error');
  }
}

/* ================================================================== */
/*  COLABORADORES                                                     */
/* ================================================================== */
async function carregarColaboradores() {
  try {
    if (cacheSetores.length === 0) {
      cacheSetores = await supaFetch('setores?select=*');
      var selectSetor = $('#filtro-colab-setor');
      cacheSetores.forEach(function(s) {
        if (!selectSetor.querySelector('option[value="' + s.id + '"]')) {
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.nome;
          selectSetor.appendChild(opt);
        }
      });
    }

    var qs = '?select=*,setores(nome)&order=nome.asc';
    var setorFiltro = $('#filtro-colab-setor').value;
    if (setorFiltro) qs += '&setor_id=eq.' + setorFiltro;
    qs = addPropFiltro(qs);

    var data = await supaFetch('colaboradores' + qs);
    var tbody = $('#tbody-colaboradores');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="placeholder">Nenhum colaborador encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function(c) {
      var ativo = c.ativo !== false;
      var statusClass = ativo ? 'ativo' : 'inativo';
      var statusText = ativo ? 'Ativo' : 'Inativo';
      var setor = (c.setores && c.setores.nome) || '--';
      var temLogin = c.email ? true : false;
      var loginBadge = temLogin
        ? '<span class="badge badge--login-sim">Login ativo</span>'
        : '<span class="badge badge--login-nao">Sem login</span>';

      return '<tr>' +
        '<td>' + escapeHtml(c.nome || '--') + '</td>' +
        '<td>' + escapeHtml(c.email || '--') + '</td>' +
        '<td>' + escapeHtml(c.telefone || '--') + '</td>' +
        '<td>' + escapeHtml(c.funcao || '--') + '</td>' +
        '<td>' + escapeHtml(setor) + '</td>' +
        '<td>' + loginBadge + '</td>' +
        '<td><span class="badge badge--' + statusClass + '">' + statusText + '</span></td>' +
        '<td>' +
          '<button class="btn btn--small btn--secondary" onclick="editarColaborador(\'' + c.id + '\')">Editar</button> ' +
          '<button class="btn btn--small btn--danger" onclick="toggleColaborador(\'' + c.id + '\',' + ativo + ')">' + (ativo ? 'Desativar' : 'Ativar') + '</button>' +
        '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar colaboradores:', err);
    $('#tbody-colaboradores').innerHTML = '<tr><td colspan="8" class="placeholder">Erro ao carregar</td></tr>';
  }
}

function abrirModalColaborador(id) {
  modalModo = id ? 'colaborador-editar' : 'colaborador-novo';
  modalItemId = id || null;

  $('#modal-titulo').textContent = id ? 'Editar Colaborador' : 'Novo Colaborador';

  var setorOptions = cacheSetores.map(function(s) {
    return '<option value="' + s.id + '">' + escapeHtml(s.nome) + '</option>';
  }).join('');

  var propOptions = cachePropriedades.map(function(p) {
    return '<option value="' + p.id + '">' + escapeHtml(p.nome) + '</option>';
  }).join('');

  var isNovo = !id;
  var senhaHtml = isNovo
    ? '<div class="form-group"><label>Senha</label><input type="password" id="campo-senha" placeholder="Senha de acesso"></div>'
    : '<div class="form-group"><label>Alterar Senha (opcional)</label><input type="password" id="campo-senha" placeholder="Deixe vazio para manter a senha atual"></div>';

  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Nome</label><input type="text" id="campo-nome" placeholder="Nome completo"></div>' +
    '<div class="form-group"><label>Email</label><input type="email" id="campo-email" placeholder="email@exemplo.com"></div>' +
    senhaHtml +
    '<div class="form-group"><label>Telefone</label><input type="tel" id="campo-telefone" placeholder="+5511999999999"></div>' +
    '<div class="form-group"><label>WhatsApp</label><input type="tel" id="campo-whatsapp" placeholder="+5511999999999 (se diferente do telefone)"></div>' +
    '<div class="form-group"><label>Funcao</label><input type="text" id="campo-funcao" placeholder="Ex: Auxiliar de cozinha"></div>' +
    '<div class="form-group"><label>Setor</label><select id="campo-setor"><option value="">Selecione</option>' + setorOptions + '</select></div>' +
    '<div class="form-group"><label>Propriedade</label><select id="campo-propriedade"><option value="">Selecione</option>' + propOptions + '</select></div>';

  // Pre-select current propriedade if filtered
  if (!id && propriedadeFiltro !== 'todas') {
    setTimeout(function() {
      var campoProp = $('#campo-propriedade');
      if (campoProp) campoProp.value = propriedadeFiltro;
    }, 0);
  }

  if (id) {
    carregarDadosColaboradorModal(id);
  }

  $('#modal-overlay').classList.remove('escondido');
}

async function carregarDadosColaboradorModal(id) {
  try {
    var data = await supaFetch('colaboradores?id=eq.' + id);
    if (data && data.length > 0) {
      var c = data[0];
      var campoNome = $('#campo-nome');
      var campoEmail = $('#campo-email');
      var campoTel = $('#campo-telefone');
      var campoFunc = $('#campo-funcao');
      var campoSetor = $('#campo-setor');
      var campoProp = $('#campo-propriedade');
      if (campoNome) campoNome.value = c.nome || '';
      if (campoEmail) campoEmail.value = c.email || '';
      if (campoTel) campoTel.value = c.telefone || '';
      if (campoFunc) campoFunc.value = c.funcao || '';
      if (campoSetor) campoSetor.value = c.setor_id || '';
      if (campoProp) campoProp.value = c.propriedade_id || '';
      var campoWpp = $('#campo-whatsapp');
      if (campoWpp) campoWpp.value = c.whatsapp_jid || '';
    }
  } catch (err) {
    console.error('Erro ao carregar colaborador:', err);
  }
}

function editarColaborador(id) {
  abrirModalColaborador(id);
}

async function toggleColaborador(id, atualmenteAtivo) {
  try {
    await supaUpdate('colaboradores', id, { ativo: !atualmenteAtivo });
    mostrarToast(atualmenteAtivo ? 'Colaborador desativado' : 'Colaborador ativado');
    carregarColaboradores();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao alterar status', 'error');
  }
}

/* ================================================================== */
/*  TAREFAS                                                           */
/* ================================================================== */
async function carregarTarefas() {
  try {
    var qs = '?select=*&order=created_at.desc';
    var statusFiltro = $('#filtro-tarefa-status').value;
    if (statusFiltro) qs += '&status=eq.' + statusFiltro;
    qs = addPropFiltro(qs);

    var data = await supaFetch('tarefas' + qs);
    var tbody = $('#tbody-tarefas');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Nenhuma tarefa encontrada</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function(t) {
      var status = slugStatus(t.status);
      var prioridade = (t.prioridade || 'media').toLowerCase();
      var cmd = t.comando_original || t.descricao || '--';
      if (cmd.length > 80) cmd = cmd.substring(0, 77) + '...';
      var conclusao = t.porcentagem_conclusao || 0;

      return '<tr class="tr-clicavel" onclick="expandirTarefa(\'' + t.id + '\')">' +
        '<td>' + escapeHtml(cmd) + '</td>' +
        '<td>' + escapeHtml(t.setor || '--') + '</td>' +
        '<td><span class="badge badge--' + status + '">' + (t.status || 'pendente') + '</span></td>' +
        '<td><span class="badge badge--' + prioridade + '">' + prioridade + '</span></td>' +
        '<td>' + formatarData(t.created_at) + '</td>' +
        '<td>' +
          '<div class="progress" title="' + conclusao + '%"><div class="progress__bar" style="width:' + conclusao + '%"></div></div>' +
          '<span style="font-size:12px;color:var(--text-muted)">' + conclusao + '%</span>' +
        '</td>' +
        '</tr>';
    }).join('');

    $('#tarefa-detalhe').classList.add('escondido');

  } catch (err) {
    console.error('Erro ao carregar tarefas:', err);
    $('#tbody-tarefas').innerHTML = '<tr><td colspan="6" class="placeholder">Erro ao carregar</td></tr>';
  }
}

async function expandirTarefa(tarefaId) {
  try {
    var items = await supaFetch('checklist_items?tarefa_id=eq.' + tarefaId + '&order=ordem.asc');
    var detalhe = $('#tarefa-detalhe');
    var container = $('#tarefa-checklist');

    if (!items || items.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhum item de checklist</p>';
    } else {
      container.innerHTML = items.map(function(item) {
        var concluido = item.concluido || item.status === 'concluido';
        return '<div class="checklist-item">' +
          '<span class="checklist-item__status checklist-item__status--' + (concluido ? 'concluido' : 'pendente') + '">' +
            (concluido ? '&#10003;' : '&#9711;') +
          '</span>' +
          '<span>' + escapeHtml(item.descricao || item.texto || '--') + '</span>' +
          '</div>';
      }).join('');
    }

    detalhe.classList.remove('escondido');
    $('#tarefa-detalhe-titulo').textContent = 'Checklist da Tarefa';
    detalhe.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Erro ao expandir tarefa:', err);
  }
}

/* ================================================================== */
/*  ROTINAS                                                           */
/* ================================================================== */
async function carregarRotinas() {
  try {
    var qs = '?select=*&order=dia_semana.asc,hora.asc';
    qs = addPropFiltro(qs);

    var data = await supaFetch('rotinas_semanais' + qs);
    var tbody = $('#tbody-rotinas');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">Nenhuma rotina encontrada</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function(r) {
      var ativo = r.ativo !== false;
      var statusClass = ativo ? 'ativo' : 'inativo';
      var statusText = ativo ? 'Ativo' : 'Inativo';

      return '<tr class="tr-clicavel" onclick="expandirRotina(\'' + r.id + '\')">' +
        '<td>' + escapeHtml(r.nome || '--') + '</td>' +
        '<td>' + escapeHtml(r.setor || '--') + '</td>' +
        '<td>' + escapeHtml(r.dia_semana || '--') + '</td>' +
        '<td>' + escapeHtml(r.hora || '--') + '</td>' +
        '<td><span class="badge badge--' + statusClass + '">' + statusText + '</span></td>' +
        '</tr>';
    }).join('');

    $('#rotina-detalhe').classList.add('escondido');

  } catch (err) {
    console.error('Erro ao carregar rotinas:', err);
    $('#tbody-rotinas').innerHTML = '<tr><td colspan="5" class="placeholder">Erro ao carregar</td></tr>';
  }
}

async function expandirRotina(rotinaId) {
  try {
    var items = await supaFetch('rotina_items?rotina_id=eq.' + rotinaId + '&order=ordem.asc');
    var detalhe = $('#rotina-detalhe');
    var container = $('#rotina-items');

    if (!items || items.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhum item na rotina</p>';
    } else {
      container.innerHTML = items.map(function(item) {
        var concluido = item.concluido || item.status === 'concluido';
        return '<div class="checklist-item">' +
          '<span class="checklist-item__status checklist-item__status--' + (concluido ? 'concluido' : 'pendente') + '">' +
            (concluido ? '&#10003;' : '&#9711;') +
          '</span>' +
          '<span>' + escapeHtml(item.descricao || item.texto || item.nome || '--') + '</span>' +
          '</div>';
      }).join('');
    }

    detalhe.classList.remove('escondido');
    $('#rotina-detalhe-titulo').textContent = 'Itens da Rotina';
    detalhe.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Erro ao expandir rotina:', err);
  }
}

/* ================================================================== */
/*  RELATORIOS                                                        */
/* ================================================================== */
async function carregarRelatorios() {
  try {
    var qs = '?select=*&order=created_at.desc';
    qs = addPropFiltro(qs);

    var data = await supaFetch('relatorios_semanais' + qs);
    var tbody = $('#tbody-relatorios');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="placeholder">Nenhum relatorio encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function(r) {
      var periodo = '';
      if (r.periodo_inicio && r.periodo_fim) {
        periodo = formatarData(r.periodo_inicio) + ' - ' + formatarData(r.periodo_fim);
      } else if (r.periodo) {
        periodo = escapeHtml(r.periodo);
      } else {
        periodo = formatarData(r.created_at);
      }

      var conclusao = r.porcentagem_conclusao || r.percentual || 0;
      var pdfUrl = r.pdf_url || r.url_pdf || '';
      var pdfLink = pdfUrl
        ? '<a href="' + escapeHtml(pdfUrl) + '" target="_blank" class="btn btn--small btn--secondary">Baixar PDF</a>'
        : '<span style="color:var(--text-muted)">--</span>';

      return '<tr>' +
        '<td>' + periodo + '</td>' +
        '<td>' +
          '<div class="progress" title="' + conclusao + '%"><div class="progress__bar" style="width:' + conclusao + '%"></div></div>' +
          '<span style="font-size:12px;color:var(--text-muted)">' + conclusao + '%</span>' +
        '</td>' +
        '<td>' + pdfLink + '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar relatorios:', err);
    $('#tbody-relatorios').innerHTML = '<tr><td colspan="3" class="placeholder">Erro ao carregar</td></tr>';
  }
}

/* ================================================================== */
/*  CONFIGURACOES                                                     */
/* ================================================================== */
async function carregarConfiguracoes() {
  // 1. Load propriedade settings
  carregarConfigPropriedade();

  // 2. Load extras from configuracoes table
  carregarConfigExtras();
}

async function carregarConfigPropriedade() {
  var container = $('#config-propriedade-body');
  var titulo = $('#config-prop-titulo');

  if (propriedadeFiltro === 'todas') {
    titulo.textContent = 'Configuracoes da Propriedade';
    container.innerHTML = '<p class="placeholder">Selecione uma propriedade no filtro lateral para ver suas configuracoes</p>';
    return;
  }

  try {
    var data = await supaFetch('propriedades?id=eq.' + propriedadeFiltro);
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="placeholder">Propriedade nao encontrada</p>';
      return;
    }

    var prop = data[0];
    titulo.textContent = 'Configuracoes — ' + (prop.nome || 'Propriedade');

    var campos = [
      { chave: 'nome', label: 'Nome da Propriedade', valor: prop.nome || '' },
      { chave: 'slug', label: 'Slug', valor: prop.slug || '' },
      { chave: 'telegram_bot_token', label: 'Telegram Bot Token', valor: prop.telegram_bot_token || '', sensitive: true },
      { chave: 'telegram_chat_id', label: 'Telegram Chat ID', valor: prop.telegram_chat_id || '' },
      { chave: 'evolution_api_url', label: 'Evolution API URL', valor: prop.evolution_api_url || '' },
      { chave: 'evolution_api_key', label: 'Evolution API Key', valor: prop.evolution_api_key || '', sensitive: true },
      { chave: 'relatorio_dia_semana', label: 'Dia do Relatorio', valor: prop.relatorio_dia_semana || '' },
      { chave: 'relatorio_hora', label: 'Hora do Relatorio', valor: prop.relatorio_hora || '' },
      { chave: 'lembrete_hora', label: 'Hora do Lembrete', valor: prop.lembrete_hora || '' },
    ];

    var html = '<form id="form-config-prop" class="config-prop-form">';
    campos.forEach(function(c) {
      var displayVal = c.sensitive && c.valor ? c.valor.substring(0, 8) + '...' : c.valor;
      html += '<div class="form-group">' +
        '<label>' + escapeHtml(c.label) + '</label>' +
        '<input type="text" id="config-prop-' + c.chave + '" value="' + escapeHtml(c.valor) + '" data-campo="' + c.chave + '">' +
        '</div>';
    });
    html += '<div style="display:flex;justify-content:flex-end;padding-top:8px">' +
      '<button type="button" class="btn btn--primary" onclick="salvarConfigPropriedade()">Salvar Configuracoes</button>' +
      '</div></form>';

    container.innerHTML = html;

  } catch (err) {
    console.error('Erro ao carregar config propriedade:', err);
    container.innerHTML = '<p class="placeholder">Erro ao carregar configuracoes da propriedade</p>';
  }
}

async function salvarConfigPropriedade() {
  try {
    var form = $('#form-config-prop');
    if (!form) return;

    var inputs = form.querySelectorAll('input[data-campo]');
    var body = {};
    inputs.forEach(function(inp) {
      body[inp.dataset.campo] = inp.value || null;
    });

    await supaUpdate('propriedades', propriedadeFiltro, body);
    mostrarToast('Configuracoes da propriedade atualizadas');

    // Refresh cache
    cachePropriedades = await supaFetch('propriedades?select=*');

  } catch (err) {
    console.error('Erro ao salvar config propriedade:', err);
    mostrarToast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function carregarConfigExtras() {
  try {
    var qs = '?select=*&order=chave.asc';
    qs = addPropFiltro(qs);

    var data = await supaFetch('configuracoes' + qs);
    var tbody = $('#tbody-config');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="placeholder">Nenhuma configuracao extra encontrada</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function(c) {
      var chave = c.chave || c.key || '--';
      var valor = c.valor || c.value || '';
      var displayValor = String(valor);
      if (displayValor.length > 80) displayValor = displayValor.substring(0, 77) + '...';

      return '<tr>' +
        '<td>' + escapeHtml(chave) + '</td>' +
        '<td id="config-val-' + c.id + '">' + escapeHtml(displayValor) + '</td>' +
        '<td>' +
          '<button class="btn btn--small btn--secondary" onclick="editarConfig(\'' + c.id + '\',\'' + escapeHtml(chave) + '\')">Editar</button>' +
        '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar configuracoes extras:', err);
    $('#tbody-config').innerHTML = '<tr><td colspan="3" class="placeholder">Erro ao carregar</td></tr>';
  }
}

function editarConfig(id, chave) {
  modalModo = 'config-editar';
  modalItemId = id;

  $('#modal-titulo').textContent = 'Editar Configuracao';
  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Chave</label><input type="text" id="campo-config-chave" value="' + escapeHtml(chave) + '" disabled></div>' +
    '<div class="form-group"><label>Valor</label><textarea id="campo-config-valor" rows="4" placeholder="Valor da configuracao"></textarea></div>';

  // Load current value
  supaFetch('configuracoes?id=eq.' + id).then(function(data) {
    if (data && data.length > 0) {
      var campo = $('#campo-config-valor');
      if (campo) campo.value = data[0].valor || data[0].value || '';
    }
  });

  $('#modal-overlay').classList.remove('escondido');
}

/* ================================================================== */
/*  MODAL — SALVAR                                                    */
/* ================================================================== */
async function salvarModal() {
  try {
    if (modalModo === 'colaborador-novo' || modalModo === 'colaborador-editar') {
      var body = {
        nome: ($('#campo-nome') || {}).value || '',
        email: ($('#campo-email') || {}).value || '',
        telefone: ($('#campo-telefone') || {}).value || '',
        funcao: ($('#campo-funcao') || {}).value || '',
        setor_id: ($('#campo-setor') || {}).value || null,
        propriedade_id: ($('#campo-propriedade') || {}).value || null,
      };

      // Handle email — set null if empty
      if (!body.email.trim()) body.email = null;

      // Handle WhatsApp
      var wpp = ($('#campo-whatsapp') || {}).value || '';
      if (wpp.trim()) {
        body.whatsapp_jid = wpp.trim();
      }

      // Handle password
      var senha = ($('#campo-senha') || {}).value || '';
      if (senha.trim()) {
        body.senha_hash = senha; // Will be hashed by backend later
      }

      if (!body.nome.trim()) {
        mostrarToast('Nome e obrigatorio', 'error');
        return;
      }
      if (!body.setor_id) body.setor_id = null;
      if (!body.propriedade_id) body.propriedade_id = null;

      if (modalModo === 'colaborador-novo') {
        body.ativo = true;
        await supaInsert('colaboradores', body);
        mostrarToast('Colaborador criado com sucesso');
      } else {
        await supaUpdate('colaboradores', modalItemId, body);
        mostrarToast('Colaborador atualizado');
      }

      fecharModal();
      carregarColaboradores();

    } else if (modalModo === 'config-editar') {
      var valor = ($('#campo-config-valor') || {}).value || '';
      await supaUpdate('configuracoes', modalItemId, { valor: valor });
      mostrarToast('Configuracao atualizada');
      fecharModal();
      carregarConfigExtras();
    }

  } catch (err) {
    console.error('Erro ao salvar:', err);
    mostrarToast('Erro ao salvar: ' + err.message, 'error');
  }
}

function fecharModal(event) {
  if (event && event.target && !event.target.classList.contains('modal-overlay')) return;
  $('#modal-overlay').classList.add('escondido');
  modalModo = null;
  modalItemId = null;
}

/* ================================================================== */
/*  INICIALIZACAO                                                     */
/* ================================================================== */
async function init() {
  try {
    cachePropriedades = await supaFetch('propriedades?select=*');
    var selectProp = $('#filtro-propriedade');
    cachePropriedades.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nome;
      selectProp.appendChild(opt);
    });

    navegarPara('visao-geral');

  } catch (err) {
    console.error('Erro na inicializacao:', err);
    mostrarToast('Erro ao conectar com o banco de dados', 'error');
    navegarPara('visao-geral');
  }
}

document.addEventListener('DOMContentLoaded', init);
