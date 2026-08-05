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
var usuarioLogado = null;

/* ================================================================== */
/*  LOGIN / LOGOUT                                                    */
/* ================================================================== */
function verificarSessao() {
  try {
    var dados = sessionStorage.getItem('labareda_usuario');
    if (dados) {
      usuarioLogado = JSON.parse(dados);
      return true;
    }
  } catch (e) {
    console.error('Erro ao verificar sessao:', e);
  }
  return false;
}

function mostrarApp() {
  document.getElementById('login-screen').classList.add('escondido');
  document.getElementById('app-wrapper').classList.remove('escondido');

  // Show user name in sidebar
  var el = document.getElementById('sidebar-user-name');
  if (el && usuarioLogado) {
    el.textContent = usuarioLogado.nome || usuarioLogado.email;
  }
}

function mostrarLogin() {
  document.getElementById('login-screen').classList.remove('escondido');
  document.getElementById('app-wrapper').classList.add('escondido');
}

async function realizarLogin(event) {
  event.preventDefault();

  var email = (document.getElementById('login-email').value || '').trim();
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
    var qs = 'usuarios_admin?email=eq.' + encodeURIComponent(email) +
             '&senha_hash=eq.' + encodeURIComponent(senha) +
             '&ativo=eq.true&select=*';
    var data = await supaFetch(qs);

    if (!data || data.length === 0) {
      errorEl.textContent = 'Email ou senha incorretos';
      errorEl.classList.remove('escondido');
      btnEl.disabled = false;
      btnEl.textContent = 'Entrar';
      return;
    }

    var user = data[0];
    usuarioLogado = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      propriedade_id: user.propriedade_id || null,
    };

    sessionStorage.setItem('labareda_usuario', JSON.stringify(usuarioLogado));
    mostrarApp();
    aplicarRestricaoRole();
    initDashboard();

  } catch (err) {
    console.error('Erro no login:', err);
    errorEl.textContent = 'Erro ao conectar. Tente novamente.';
    errorEl.classList.remove('escondido');
  }

  btnEl.disabled = false;
  btnEl.textContent = 'Entrar';
}

function realizarLogout() {
  sessionStorage.removeItem('labareda_usuario');
  usuarioLogado = null;

  // Reset form
  var emailEl = document.getElementById('login-email');
  var senhaEl = document.getElementById('login-senha');
  var errorEl = document.getElementById('login-error');
  if (emailEl) emailEl.value = '';
  if (senhaEl) senhaEl.value = '';
  if (errorEl) errorEl.classList.add('escondido');

  mostrarLogin();
}

function aplicarRestricaoRole() {
  if (!usuarioLogado) return;

  var selectProp = document.getElementById('filtro-propriedade');

  if (usuarioLogado.role === 'admin' && usuarioLogado.propriedade_id) {
    // Admin with specific propriedade: force filter and disable selector
    propriedadeFiltro = usuarioLogado.propriedade_id;
    if (selectProp) {
      selectProp.value = usuarioLogado.propriedade_id;
      selectProp.disabled = true;
    }
    filtrarPropriedade();
  } else {
    // Master: full access
    if (selectProp) {
      selectProp.disabled = false;
    }
  }
}

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
  // Evitar bug de timezone: datas no formato YYYY-MM-DD sao interpretadas como UTC
  // Adicionar T12:00 para garantir que nao pule um dia ao converter para local
  var dateStr = iso.length === 10 ? iso + 'T12:00:00' : iso;
  var d = new Date(dateStr);
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
    case 'whatsapp':       carregarWhatsApp(); break;
    case 'configuracoes':  carregarConfiguracoes(); break;
    case 'gastos':         carregarGastos(); break;
    case 'veiculos':       carregarVeiculos(); break;
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
      supaFetch('tarefas?select=*,colaboradores:responsavel_id(nome),setores:setor_id(nome,icone)&order=created_at.desc&limit=5' + (pf ? '&' + pf : '')),
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
      var setorNome = (t.setores && t.setores.nome) || t.setor_interpretado || '';
      var setorIcone = (t.setores && t.setores.icone) || '';
      var respNome = (t.colaboradores && t.colaboradores.nome) || '';
      return '<div class="lista-simples__item">' +
        '<span class="lista-simples__texto">' + escapeHtml(cmd) + '</span>' +
        '<span class="lista-simples__setor">' + escapeHtml(setorIcone + ' ' + setorNome) + (respNome ? ' <small style="color:var(--text-muted)">(' + escapeHtml(respNome) + ')</small>' : '') + '</span>' +
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
          '<button class="btn btn--small btn--danger" onclick="toggleColaborador(\'' + c.id + '\',' + ativo + ')">' + (ativo ? 'Desativar' : 'Ativar') + '</button> ' +
          '<button class="btn btn--small btn--danger" onclick="excluirColaborador(\'' + c.id + '\', \'' + escapeHtml(c.nome || '') + '\')" title="Excluir permanentemente">&times;</button>' +
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
    '<div class="form-group"><label>Nome *</label><input type="text" id="campo-nome" placeholder="Nome completo" required></div>' +
    '<div class="form-group"><label>Email</label><input type="email" id="campo-email" placeholder="email@exemplo.com"></div>' +
    senhaHtml +
    '<div class="form-group"><label>Telefone *</label><input type="tel" id="campo-telefone" placeholder="+5573999999999" required></div>' +
    '<div class="form-group"><label>Funcao *</label><input type="text" id="campo-funcao" placeholder="Ex: Auxiliar de cozinha" required></div>' +
    '<div class="form-group"><label>Setor *</label><select id="campo-setor" required><option value="">Selecione</option>' + setorOptions + '</select></div>' +
    '<div class="form-group"><label>Propriedade *</label><select id="campo-propriedade" required><option value="">Selecione</option>' + propOptions + '</select></div>';

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

async function excluirColaborador(id, nome) {
  if (!confirm('Tem certeza que deseja excluir o colaborador "' + nome + '"?\n\nIsso ira remover permanentemente todos os avisos, tarefas e dados associados.')) return;
  if (!confirm('CONFIRMACAO FINAL: Excluir "' + nome + '" permanentemente? Esta acao nao pode ser desfeita.')) return;

  try {
    // Remover dependencias primeiro
    var url = CONFIG.SUPABASE_URL + '/rest/v1/';
    var h = apiHeaders('return=minimal');

    await fetch(url + 'avisos?colaborador_id=eq.' + id, { method: 'DELETE', headers: h });
    await fetch(url + 'rotina_items?colaborador_id=eq.' + id, { method: 'DELETE', headers: h });
    await fetch(url + 'checklist_items?colaborador_id=eq.' + id, { method: 'DELETE', headers: h });
    await fetch(url + 'projetos?colaborador_id=eq.' + id, { method: 'DELETE', headers: h });
    await fetch(url + 'gastos?colaborador_id=eq.' + id, { method: 'DELETE', headers: h });

    // Remover rotinas onde e responsavel
    await fetch(url + 'rotinas_semanais?responsavel_id=eq.' + id, { method: 'DELETE', headers: h });

    // Remover colaborador
    await fetch(url + 'colaboradores?id=eq.' + id, { method: 'DELETE', headers: h });

    mostrarToast('Colaborador "' + nome + '" excluido permanentemente');
    carregarColaboradores();
  } catch (err) {
    console.error('Erro ao excluir colaborador:', err);
    mostrarToast('Erro ao excluir colaborador', 'error');
  }
}

/* ================================================================== */
/*  TAREFAS                                                           */
/* ================================================================== */
var tarefaAbertaId = null;
var tarefaAbertaDados = null;
var cacheColaboradores = [];

async function carregarCacheColaboradores() {
  if (cacheColaboradores.length > 0) return;
  try {
    var qs = '?select=id,nome,funcao,propriedade_id&ativo=eq.true&order=nome.asc';
    cacheColaboradores = await supaFetch('colaboradores' + qs);
  } catch (err) {
    console.error('Erro ao carregar colaboradores:', err);
  }
}

function preencherFiltroSetorTarefas() {
  var select = $('#filtro-tarefa-setor');
  if (!select || select.options.length > 1) return;
  cacheSetores.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s.nome;
    opt.textContent = s.nome;
    select.appendChild(opt);
  });
}

async function carregarTarefas() {
  try {
    preencherFiltroSetorTarefas();

    var qs = '?select=*,colaboradores:responsavel_id(nome,funcao),setores:setor_id(nome,icone),checklist_items(id,status)&order=created_at.desc';
    var statusFiltro = ($('#filtro-tarefa-status') || {}).value || '';
    var setorFiltro = ($('#filtro-tarefa-setor') || {}).value || '';
    var prioFiltro = ($('#filtro-tarefa-prio') || {}).value || '';

    if (statusFiltro) qs += '&status=eq.' + statusFiltro;
    if (setorFiltro) qs += '&setor_interpretado=eq.' + encodeURIComponent(setorFiltro);
    if (prioFiltro) qs += '&prioridade=eq.' + prioFiltro;
    qs = addPropFiltro(qs);

    var data = await supaFetch('tarefas' + qs);
    var tbody = $('#tbody-tarefas');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="placeholder">Nenhuma tarefa encontrada</td></tr>';
      $('#tarefa-detalhe').classList.add('escondido');
      return;
    }

    tbody.innerHTML = data.map(function(t) {
      var status = slugStatus(t.status);
      var prioridade = (t.prioridade || 'normal').toLowerCase();
      var cmd = t.comando_original || t.descricao || '--';
      if (cmd.length > 60) cmd = cmd.substring(0, 57) + '...';
      var conclusao = 0;
      if (t.checklist_items && t.checklist_items.length > 0) {
        var totalItens = t.checklist_items.length;
        var itensConcluidos = t.checklist_items.filter(function(i) { return i.status === 'concluido'; }).length;
        conclusao = Math.round((itensConcluidos / totalItens) * 100);
      } else {
        conclusao = t.porcentagem_conclusao || 0;
      }
      var responsavel = (t.colaboradores && t.colaboradores.nome) ? t.colaboradores.nome : '--';
      var setorNome = (t.setores && t.setores.nome) || t.setor_interpretado || '--';
      var setorIcone = (t.setores && t.setores.icone) || '';
      var origem = t.origem || 'dashboard';
      var origemClass = origem === 'telegram' ? 'origem--telegram' : 'origem--dashboard';
      var origemIcon = origem === 'telegram' ? '&#9992;' : '&#9776;';

      var dataLimite = t.data_limite ? formatarData(t.data_limite) : '--';
      var atrasada = t.data_limite && t.status !== 'concluida' && t.status !== 'cancelada' && new Date(t.data_limite) < new Date();
      var dataClass = atrasada ? ' style="color:var(--danger);font-weight:600"' : '';

      var isAtiva = tarefaAbertaId === t.id;

      return '<tr class="tr-clicavel' + (isAtiva ? ' tr-ativa' : '') + '" onclick="expandirTarefa(\'' + t.id + '\')">' +
        '<td><span class="tarefa-desc">' + escapeHtml(cmd) + '</span></td>' +
        '<td>' + escapeHtml(setorIcone + ' ' + setorNome) + '</td>' +
        '<td>' + escapeHtml(responsavel) + '</td>' +
        '<td><span class="badge badge--' + status + '">' + (t.status || 'pendente').replace('_', ' ') + '</span></td>' +
        '<td><span class="badge badge--' + prioridade + '">' + prioridade + '</span></td>' +
        '<td' + dataClass + '>' + dataLimite + (atrasada ? ' !' : '') + '</td>' +
        '<td><span class="badge-origem ' + origemClass + '" title="Criada via ' + escapeHtml(origem) + '">' + origemIcon + ' ' + escapeHtml(origem) + '</span></td>' +
        '<td>' +
          '<div class="progress" title="' + conclusao + '%"><div class="progress__bar" style="width:' + conclusao + '%"></div></div>' +
          '<span style="font-size:12px;color:var(--text-muted)">' + conclusao + '%</span>' +
        '</td>' +
        '<td class="td-acoes" onclick="event.stopPropagation()">' +
          '<button class="btn btn--small btn--secondary" onclick="abrirModalTarefa(\'' + t.id + '\')" title="Editar">&#9998;</button> ' +
          (t.status !== 'cancelada'
            ? '<button class="btn btn--small btn--danger" onclick="cancelarTarefa(\'' + t.id + '\')" title="Cancelar">&#10005;</button>'
            : '<button class="btn btn--small btn--secondary" onclick="reativarTarefa(\'' + t.id + '\')" title="Reativar">&#8634;</button>') +
        '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar tarefas:', err);
    $('#tbody-tarefas').innerHTML = '<tr><td colspan="9" class="placeholder">Erro ao carregar</td></tr>';
  }
}

async function expandirTarefa(tarefaId) {
  try {
    tarefaAbertaId = tarefaId;

    // Load tarefa data + checklist in parallel
    var tarefaPromise = supaFetch('tarefas?id=eq.' + tarefaId + '&select=*,colaboradores:responsavel_id(nome,funcao),setores:setor_id(nome,icone)');
    var itemsPromise = supaFetch('checklist_items?tarefa_id=eq.' + tarefaId + '&select=*,colaboradores:colaborador_id(nome)&order=ordem.asc');
    var results = await Promise.all([tarefaPromise, itemsPromise]);

    var tarefaData = results[0];
    var items = results[1];

    if (!tarefaData || tarefaData.length === 0) return;
    tarefaAbertaDados = tarefaData[0];
    var t = tarefaAbertaDados;

    var detalhe = $('#tarefa-detalhe');
    var container = $('#tarefa-checklist');

    // Update title and meta
    $('#tarefa-detalhe-titulo').textContent = t.comando_original || t.descricao || 'Tarefa';

    var responsavel = (t.colaboradores && t.colaboradores.nome) ? t.colaboradores.nome : 'Nao atribuida';
    var setorNome = (t.setores && t.setores.nome) || t.setor_interpretado || '--';
    var setorIcone = (t.setores && t.setores.icone) || '';
    var origemLabel = t.origem === 'telegram' ? '&#9992; Telegram' : '&#9776; Dashboard';
    var dataLimite = t.data_limite ? formatarData(t.data_limite) : 'Sem prazo';
    var criadaEm = formatarData(t.created_at);

    $('#tarefa-detalhe-meta').innerHTML =
      '<span class="meta-tag">Setor: <strong>' + escapeHtml(setorIcone + ' ' + setorNome) + '</strong></span>' +
      '<span class="meta-tag">Responsavel: <strong>' + escapeHtml(responsavel) + '</strong></span>' +
      '<span class="meta-tag">Prazo: <strong>' + dataLimite + '</strong></span>' +
      '<span class="meta-tag">Criada: <strong>' + criadaEm + '</strong></span>' +
      '<span class="meta-tag">Origem: ' + origemLabel + '</span>';

    // Set status dropdown
    var statusSelect = $('#tarefa-detalhe-status');
    if (statusSelect) statusSelect.value = t.status || 'pendente';

    // Render checklist
    if (!items || items.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhum item de checklist. Clique em "+ Item" para adicionar.</p>';
    } else {
      var totalItems = items.length;
      var concluidos = items.filter(function(i) { return i.status === 'concluido'; }).length;

      container.innerHTML =
        '<div class="checklist-resumo">' +
          '<span>' + concluidos + '/' + totalItems + ' concluidos</span>' +
          '<div class="progress" style="flex:1;max-width:200px" title="' + Math.round((concluidos/totalItems)*100) + '%">' +
            '<div class="progress__bar" style="width:' + Math.round((concluidos/totalItems)*100) + '%"></div>' +
          '</div>' +
        '</div>' +
        items.map(function(item) {
          var concluido = item.status === 'concluido';
          var colabNome = (item.colaboradores && item.colaboradores.nome) ? item.colaboradores.nome : '';

          // Linha principal — itens concluidos sao somente leitura
          var clickHandler = concluido ? '' : ' onclick="toggleChecklist(\'' + item.id + '\',true)"';
          var cursorClass = concluido ? ' style="cursor:default"' : '';
          var html = '<div class="checklist-item-row' + (concluido ? ' checklist-item-row--done' : '') + '">' +
            '<div class="checklist-item-check"' + clickHandler + cursorClass + '>' +
              '<span class="checklist-box ' + (concluido ? 'checklist-box--done' : '') + '">' +
                (concluido ? '&#10003;' : '') +
              '</span>' +
              '<div class="checklist-item-content">' +
                '<span class="' + (concluido ? 'checklist-text--done' : '') + '">' + escapeHtml(item.descricao || '--') + '</span>';

          // Detalhes de conclusao
          if (concluido) {
            html += '<div class="checklist-item-details">';
            if (colabNome) html += '<span class="checklist-detail"><strong>Concluido por:</strong> ' + escapeHtml(colabNome) + '</span>';
            if (item.concluido_at) html += '<span class="checklist-detail"><strong>Em:</strong> ' + formatarData(item.concluido_at) + ' ' + new Date(item.concluido_at).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) + '</span>';
            if (item.observacao) html += '<span class="checklist-detail"><strong>Obs:</strong> ' + escapeHtml(item.observacao) + '</span>';
            html += '</div>';
          } else if (colabNome) {
            html += '<div class="checklist-item-details"><span class="checklist-detail">Atribuido a: ' + escapeHtml(colabNome) + '</span></div>';
          }

          html += '</div></div>';

          // Foto de comprovacao
          if (concluido && item.foto_url) {
            html += '<a href="' + escapeHtml(item.foto_url) + '" target="_blank" class="checklist-foto-link" title="Ver foto de comprovacao">' +
              '<img src="' + escapeHtml(item.foto_url) + '" class="checklist-foto-thumb" alt="Foto comprovacao">' +
            '</a>';
          }

          html += '<button class="btn-icon btn-icon--danger" onclick="removerItemChecklist(\'' + item.id + '\')" title="Remover">&times;</button>' +
          '</div>';

          return html;
        }).join('');
    }

    detalhe.classList.remove('escondido');
    detalhe.scrollIntoView({ behavior: 'smooth' });

    // Highlight active row
    carregarTarefas();

  } catch (err) {
    console.error('Erro ao expandir tarefa:', err);
  }
}

function fecharDetalheTarefa() {
  tarefaAbertaId = null;
  tarefaAbertaDados = null;
  $('#tarefa-detalhe').classList.add('escondido');
  carregarTarefas();
}

async function alterarStatusTarefa() {
  if (!tarefaAbertaId) return;
  var novoStatus = ($('#tarefa-detalhe-status') || {}).value;
  if (!novoStatus) return;
  try {
    var updates = { status: novoStatus };
    if (novoStatus === 'concluida') {
      updates.concluida_at = new Date().toISOString();
      updates.porcentagem_conclusao = 100;
    } else {
      updates.concluida_at = null;
    }
    await supaUpdate('tarefas', tarefaAbertaId, updates);
    mostrarToast('Status atualizado para ' + novoStatus.replace('_', ' '));
    await expandirTarefa(tarefaAbertaId);
  } catch (err) {
    console.error('Erro ao alterar status:', err);
    mostrarToast('Erro ao alterar status', 'error');
  }
}

async function cancelarTarefa(id) {
  if (!confirm('Cancelar esta tarefa?')) return;
  try {
    await supaUpdate('tarefas', id, { status: 'cancelada' });
    mostrarToast('Tarefa cancelada');
    carregarTarefas();
  } catch (err) {
    mostrarToast('Erro ao cancelar', 'error');
  }
}

async function reativarTarefa(id) {
  try {
    await supaUpdate('tarefas', id, { status: 'pendente', concluida_at: null });
    mostrarToast('Tarefa reativada');
    carregarTarefas();
  } catch (err) {
    mostrarToast('Erro ao reativar', 'error');
  }
}

async function toggleChecklist(itemId, marcar) {
  try {
    var novoStatus = marcar ? 'concluido' : 'pendente';
    var updates = { status: novoStatus };
    if (marcar) updates.concluido_at = new Date().toISOString();
    else updates.concluido_at = null;
    await supaUpdate('checklist_items', itemId, updates);
    if (tarefaAbertaId) {
      await atualizarConclusaoTarefa(tarefaAbertaId);
      await expandirTarefa(tarefaAbertaId);
    }
  } catch (err) {
    console.error('Erro ao atualizar checklist:', err);
    mostrarToast('Erro ao atualizar item', 'error');
  }
}

async function atualizarConclusaoTarefa(tarefaId) {
  try {
    var items = await supaFetch('checklist_items?tarefa_id=eq.' + tarefaId);
    if (!items || items.length === 0) return;
    var concluidos = items.filter(function(i) { return i.status === 'concluido'; }).length;
    var pct = Math.round((concluidos / items.length) * 100);
    var novoStatus = pct === 100 ? 'concluida' : (pct > 0 ? 'em_andamento' : 'pendente');
    await supaUpdate('tarefas', tarefaId, {
      porcentagem_conclusao: pct,
      status: novoStatus,
      concluida_at: pct === 100 ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error('Erro ao atualizar conclusao:', err);
  }
}

async function adicionarItemChecklist() {
  if (!tarefaAbertaId) { mostrarToast('Selecione uma tarefa primeiro', 'error'); return; }
  var texto = prompt('Descricao do item:');
  if (!texto || !texto.trim()) return;
  try {
    var tarefa = await supaFetch('tarefas?id=eq.' + tarefaAbertaId + '&select=propriedade_id,responsavel_id');
    var propId = (tarefa && tarefa[0]) ? tarefa[0].propriedade_id : null;
    if (!propId) { mostrarToast('Erro: tarefa sem propriedade', 'error'); return; }

    var items = await supaFetch('checklist_items?tarefa_id=eq.' + tarefaAbertaId + '&select=ordem&order=ordem.desc&limit=1');
    var proximaOrdem = (items && items.length > 0) ? (items[0].ordem + 1) : 1;
    await supaInsert('checklist_items', {
      tarefa_id: tarefaAbertaId,
      propriedade_id: propId,
      descricao: texto.trim(),
      ordem: proximaOrdem,
      status: 'pendente',
      colaborador_id: (tarefa && tarefa[0]) ? tarefa[0].responsavel_id : null,
    });
    mostrarToast('Item adicionado');
    await expandirTarefa(tarefaAbertaId);
  } catch (err) {
    console.error('Erro ao adicionar item:', err);
    mostrarToast('Erro ao adicionar item: ' + err.message, 'error');
  }
}

async function removerItemChecklist(itemId) {
  if (!confirm('Remover este item?')) return;
  try {
    var url = CONFIG.SUPABASE_URL + '/rest/v1/checklist_items?id=eq.' + itemId;
    var r = await fetch(url, { method: 'DELETE', headers: apiHeaders() });
    if (!r.ok) throw new Error('Erro ao remover');
    mostrarToast('Item removido');
    if (tarefaAbertaId) {
      await atualizarConclusaoTarefa(tarefaAbertaId);
      await expandirTarefa(tarefaAbertaId);
    }
  } catch (err) {
    mostrarToast('Erro ao remover item', 'error');
  }
}

async function abrirModalTarefa(id) {
  await carregarCacheColaboradores();
  checklistModalItems = [];

  modalModo = id ? 'tarefa-editar' : 'tarefa-nova';
  modalItemId = id || null;

  $('#modal-titulo').textContent = id ? 'Editar Tarefa' : 'Nova Tarefa';

  var opcoesSetor = cacheSetores.map(function(s) {
    return '<option value="' + s.id + '">' + escapeHtml(s.nome) + '</option>';
  }).join('');

  var opcoesProp = cachePropriedades.map(function(p) {
    return '<option value="' + p.id + '">' + escapeHtml(p.nome) + '</option>';
  }).join('');

  // Filter collaborators by selected property
  var colabsHtml = '<option value="">Nenhum (sem responsavel)</option>';
  var propSelecionada = propriedadeFiltro !== 'todas' ? propriedadeFiltro : '';

  var colabsFiltrados = propSelecionada
    ? cacheColaboradores.filter(function(c) { return String(c.propriedade_id) === String(propSelecionada); })
    : cacheColaboradores;

  colabsHtml += colabsFiltrados.map(function(c) {
    return '<option value="' + c.id + '">' + escapeHtml(c.nome) + ' (' + escapeHtml(c.funcao || '') + ')</option>';
  }).join('');

  var statusHtml = id
    ? '<div class="form-group">' +
        '<label>Status</label>' +
        '<select id="campo-tarefa-status" class="form-input">' +
          '<option value="pendente">Pendente</option>' +
          '<option value="em_andamento">Em Andamento</option>' +
          '<option value="concluida">Concluida</option>' +
          '<option value="cancelada">Cancelada</option>' +
        '</select>' +
      '</div>'
    : '';

  var checklistHtml = !id
    ? '<div class="form-group">' +
        '<label>Itens do Checklist <span style="font-weight:400;color:var(--text-muted)">(opcional)</span></label>' +
        '<div id="campo-tarefa-checklist-items" class="checklist-builder"></div>' +
        '<div class="checklist-builder-add">' +
          '<input type="text" id="campo-tarefa-checklist-input" class="form-input" placeholder="Descreva o item e pressione Enter" onkeydown="if(event.key===\'Enter\'){event.preventDefault();adicionarItemChecklistModal()}">' +
          '<button type="button" class="btn btn--small btn--secondary" onclick="adicionarItemChecklistModal()">+</button>' +
        '</div>' +
      '</div>'
    : '';

  $('#modal-body').innerHTML =
    '<div class="form-group">' +
      '<label>Descricao *</label>' +
      '<textarea id="campo-tarefa-desc" class="form-input" rows="3" placeholder="O que precisa ser feito?"></textarea>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-group form-group--half">' +
        '<label>Setor *</label>' +
        '<select id="campo-tarefa-setor" class="form-input">' +
          '<option value="">Selecione...</option>' + opcoesSetor +
        '</select>' +
      '</div>' +
      '<div class="form-group form-group--half">' +
        '<label>Propriedade *</label>' +
        '<select id="campo-tarefa-prop" class="form-input" onchange="atualizarColabsModal()">' +
          '<option value="">Selecione...</option>' + opcoesProp +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-group form-group--half">' +
        '<label>Prioridade</label>' +
        '<select id="campo-tarefa-prio" class="form-input">' +
          '<option value="normal">Normal</option>' +
          '<option value="alta">Alta</option>' +
          '<option value="urgente">Urgente</option>' +
          '<option value="baixa">Baixa</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group form-group--half">' +
        '<label>Data Limite</label>' +
        '<input id="campo-tarefa-data" type="date" class="form-input" />' +
      '</div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>Responsavel</label>' +
      '<select id="campo-tarefa-responsavel" class="form-input">' + colabsHtml + '</select>' +
    '</div>' +
    statusHtml +
    checklistHtml;

  if (propSelecionada) {
    $('#campo-tarefa-prop').value = propSelecionada;
  }

  if (id) {
    carregarDadosTarefaModal(id);
  }

  $('#modal-overlay').classList.remove('escondido');
}

// Update collaborator dropdown when property changes in modal
function atualizarColabsModal() {
  var propId = ($('#campo-tarefa-prop') || {}).value || '';
  var select = $('#campo-tarefa-responsavel');
  if (!select) return;

  var colabs = propId
    ? cacheColaboradores.filter(function(c) { return String(c.propriedade_id) === String(propId); })
    : cacheColaboradores;

  select.innerHTML = '<option value="">Nenhum (sem responsavel)</option>' +
    colabs.map(function(c) {
      return '<option value="' + c.id + '">' + escapeHtml(c.nome) + ' (' + escapeHtml(c.funcao || '') + ')</option>';
    }).join('');
}

// Checklist builder in modal
var checklistModalItems = [];

function adicionarItemChecklistModal() {
  var input = $('#campo-tarefa-checklist-input');
  if (!input) return;
  var texto = input.value.trim();
  if (!texto) return;

  checklistModalItems.push(texto);
  input.value = '';
  renderizarChecklistModal();
  input.focus();
}

function removerItemChecklistModal(index) {
  checklistModalItems.splice(index, 1);
  renderizarChecklistModal();
}

function renderizarChecklistModal() {
  var container = $('#campo-tarefa-checklist-items');
  if (!container) return;

  if (checklistModalItems.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = checklistModalItems.map(function(item, i) {
    return '<div class="checklist-builder-item">' +
      '<span class="checklist-builder-num">' + (i + 1) + '.</span>' +
      '<span class="checklist-builder-text">' + escapeHtml(item) + '</span>' +
      '<button type="button" class="btn-icon btn-icon--danger" onclick="removerItemChecklistModal(' + i + ')">&times;</button>' +
    '</div>';
  }).join('');
}

async function carregarDadosTarefaModal(id) {
  try {
    var data = await supaFetch('tarefas?id=eq.' + id);
    if (data && data.length > 0) {
      var t = data[0];
      $('#campo-tarefa-desc').value = t.comando_original || '';
      $('#campo-tarefa-setor').value = t.setor_id || '';
      $('#campo-tarefa-prop').value = t.propriedade_id || '';
      $('#campo-tarefa-prio').value = t.prioridade || 'normal';
      if (t.data_limite) {
        $('#campo-tarefa-data').value = t.data_limite.substring(0, 10);
      }
      // Load responsavel
      if (t.responsavel_id) {
        // Update colabs for the property first
        atualizarColabsModal();
        setTimeout(function() {
          var selectResp = $('#campo-tarefa-responsavel');
          if (selectResp) selectResp.value = t.responsavel_id;
        }, 100);
      }
      // Load status
      var statusSelect = $('#campo-tarefa-status');
      if (statusSelect) statusSelect.value = t.status || 'pendente';
    }
  } catch (err) {
    console.error('Erro ao carregar tarefa:', err);
  }
}

/* ================================================================== */
/*  ROTINAS                                                           */
/* ================================================================== */
var rotinaAbertaId = null;
var diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

async function carregarRotinas() {
  await carregarRotinasTabela();
  // Avisos esporadicos (se existirem)
  carregarAvisosEsporadicos();
}

async function carregarAvisosEsporadicos() {
  var container = document.getElementById('avisos-admin-container');
  try {
    var qs = '?select=*,colaboradores:colaborador_id(nome)&order=created_at.desc';
    qs = addPropFiltro(qs);
    var data = await supaFetch('avisos' + qs);
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="placeholder" style="font-size:13px">Nenhum aviso esporadico</p>';
      return;
    }
    container.innerHTML = data.map(function(a) {
      var colabNome = (a.colaboradores && a.colaboradores.nome) || '--';
      return '<div class="aviso-item">' +
        '<span class="aviso-item__num">📢</span>' +
        '<span class="aviso-item__desc"><strong>' + escapeHtml(colabNome) + ':</strong> ' + escapeHtml(a.descricao) + '</span>' +
        '<span class="aviso-item__acoes" style="opacity:1">' +
          '<button class="btn btn--small btn--danger" onclick="excluirAviso(\'' + a.id + '\')">&times;</button>' +
        '</span>' +
      '</div>';
    }).join('');
  } catch (err) {
    container.innerHTML = '<p class="placeholder">Erro ao carregar</p>';
  }
}

async function carregarAvisosAdmin() {
  var container = document.getElementById('avisos-admin-container');

  try {
    var qs = '?select=*,colaboradores:colaborador_id(nome,msg_aviso,setor_id,setores:setor_id(nome))&order=colaborador_id.asc,frequencia.asc,descricao.asc';
    qs = addPropFiltro(qs);

    var colabFiltro = document.getElementById('filtro-aviso-colaborador');
    if (colabFiltro && colabFiltro.value) {
      qs += '&colaborador_id=eq.' + colabFiltro.value;
    }

    var freqFiltro = document.getElementById('filtro-aviso-frequencia');
    if (freqFiltro && freqFiltro.value) {
      qs += '&frequencia=eq.' + freqFiltro.value;
    }

    // Popular select de colaboradores (primeira vez)
    if (colabFiltro && colabFiltro.options.length <= 1) {
      var qsC = '?select=id,nome&ativo=eq.true&order=nome.asc';
      qsC = addPropFiltro(qsC);
      var colabs = await supaFetch('colaboradores' + qsC);
      colabs.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        colabFiltro.appendChild(opt);
      });
    }

    var data = await supaFetch('avisos' + qs);

    if (!data || data.length === 0) {
      container.innerHTML =
        '<div class="avisos-vazio">' +
          '<div class="avisos-vazio__icon">&#128276;</div>' +
          '<p>Nenhum aviso encontrado</p>' +
        '</div>';
      return;
    }

    // Mapeamentos
    var freqLabels  = { diario: 'Diario', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
    var freqOrdem   = ['semanal', 'quinzenal', 'mensal', 'diario'];
    var diasNomes   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

    // Icones por setor (nome do setor em lowercase como chave)
    var setorIcones = {
      gado:       '&#128004;',
      lavoura:    '&#127807;',
      irrigacao:  '&#128167;',
      maquinas:   '&#128663;',
      manutencao: '&#128295;',
      escritorio: '&#128188;',
    };

    function getSetorIcon(setorNome) {
      if (!setorNome) return '&#128100;';
      var slug = setorNome.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '');
      return setorIcones[slug] || '&#128100;';
    }

    function getDiaTexto(aviso) {
      if (aviso.frequencia === 'semanal' && aviso.dia_disparo_semana !== null && aviso.dia_disparo_semana !== undefined) {
        return diasNomes[aviso.dia_disparo_semana] || ('Dia ' + aviso.dia_disparo_semana);
      }
      if (aviso.dias_disparo_mes) {
        return 'Dia ' + aviso.dias_disparo_mes;
      }
      return '';
    }

    // Agrupar por colaborador
    var porColab = {};
    var colabOrdem = [];

    data.forEach(function(a) {
      var cid = a.colaborador_id || 'sem-colab';
      if (!porColab[cid]) {
        var colabNome = (a.colaboradores && a.colaboradores.nome) || 'Sem colaborador';
        var setorNome = (a.colaboradores && a.colaboradores.setores && a.colaboradores.setores.nome) || '';
        var msgAviso = (a.colaboradores && a.colaboradores.msg_aviso) || '';
        porColab[cid] = { nome: colabNome, setor: setorNome, msgAviso: msgAviso, avisos: [] };
        colabOrdem.push(cid);
      }
      porColab[cid].avisos.push(a);
    });

    // Renderizar cards
    var html = '<div class="avisos-grid">';

    colabOrdem.forEach(function(cid) {
      var colab = porColab[cid];
      var total = colab.avisos.length;
      var icon  = getSetorIcon(colab.setor);

      // Dia de disparo do colaborador
      var diasNomesCard = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
      var diaDisparo = colab.avisos[0] && colab.avisos[0].dia_disparo_semana !== null
        ? diasNomesCard[colab.avisos[0].dia_disparo_semana]
        : '';

      // Card do colaborador
      html +=
        '<div class="aviso-colab-card" id="aviso-card-' + escapeHtml(cid) + '">' +
          '<div class="aviso-colab-header" onclick="toggleAvisoCard(\'' + escapeHtml(cid) + '\')">' +
            '<div class="aviso-colab-icon">' + icon + '</div>' +
            '<div class="aviso-colab-info">' +
              '<div class="aviso-colab-nome">' + escapeHtml(colab.nome) + '</div>' +
              '<div class="aviso-colab-sub">' + escapeHtml(colab.setor || '') + (diaDisparo ? ' — toda ' + diaDisparo : '') + '</div>' +
            '</div>' +
            '<span class="aviso-count-badge">' + total + ' lembretes</span>' +
            '<span class="aviso-colab-arrow">&#9660;</span>' +
          '</div>' +
          '<div class="aviso-colab-body">';

      // Mensagem WhatsApp como conteudo principal
      var msgTexto = colab.msgAviso || '(Nenhuma mensagem configurada — clique em Salvar para criar)';
      html +=
        '<div class="msg-preview" style="margin-top:0;border-top:none;padding-top:0">' +
          '<label class="msg-preview__label">Mensagem que sera enviada via WhatsApp:</label>' +
          '<textarea class="msg-preview__textarea" id="msg-text-' + escapeHtml(cid) + '" rows="10">' + escapeHtml(msgTexto) + '</textarea>' +
          '<div style="display:flex;gap:8px;margin-top:8px;align-items:center">' +
            '<button class="btn btn--small btn--primary" onclick="salvarMsgAviso(\'' + escapeHtml(cid) + '\')">Salvar mensagem</button>' +
            '<button class="btn btn--small btn--secondary" onclick="toggleItensAviso(\'' + escapeHtml(cid) + '\')">Gerenciar itens (' + total + ')</button>' +
          '</div>' +
        '</div>';

      // Lista de itens — escondida por padrao
      html += '<div class="aviso-itens-gerenciar escondido" id="aviso-itens-' + escapeHtml(cid) + '">';
      html += '<div class="aviso-itens-header">Itens individuais — edite ou exclua:</div>';
      colab.avisos.forEach(function(a, idx) {
        html +=
          '<div class="aviso-item">' +
            '<span class="aviso-item__num">' + (idx + 1) + '</span>' +
            '<span class="aviso-item__desc">' + escapeHtml(a.descricao) + '</span>' +
            '<span class="aviso-item__acoes">' +
              '<button class="btn btn--small btn--secondary" onclick="abrirModalEditarAviso(\'' + a.id + '\')" title="Editar">&#9998;</button> ' +
              '<button class="btn btn--small btn--danger" onclick="excluirAviso(\'' + a.id + '\')" title="Excluir">&times;</button>' +
            '</span>' +
          '</div>';
      });
      html += '</div>';

      html += '</div></div>'; // .aviso-colab-body .aviso-colab-card
    });

    html += '</div>'; // .avisos-grid
    container.innerHTML = html;

  } catch (err) {
    console.error('Erro ao carregar avisos:', err);
    container.innerHTML =
      '<div class="avisos-vazio">' +
        '<div class="avisos-vazio__icon">&#9888;</div>' +
        '<p>Erro ao carregar avisos. Tente novamente.</p>' +
      '</div>';
  }
}

function toggleAvisoCard(cid) {
  var card = document.getElementById('aviso-card-' + cid);
  if (card) card.classList.toggle('is-open');
}

async function excluirAviso(id) {
  if (!confirm('Excluir este aviso?')) return;
  try {
    var url = CONFIG.SUPABASE_URL + '/rest/v1/avisos?id=eq.' + id;
    await fetch(url, { method: 'DELETE', headers: apiHeaders('return=minimal') });
    carregarAvisosAdmin();
    mostrarToast('Aviso excluido');
  } catch (err) {
    mostrarToast('Erro ao excluir', 'error');
  }
}

function montarFormAviso() {
  return '<div class="form-group"><label>Colaborador *</label><select id="aviso-colaborador" class="input"><option value="">Carregando...</option></select></div>' +
    '<div class="form-group"><label>Descricao do lembrete *</label><input id="aviso-descricao" class="input" placeholder="Ex: Verificar caixa d\'agua"></div>' +
    '<div class="form-group"><label>Dia do disparo via WhatsApp *</label><select id="aviso-dia-semana" class="input">' +
      '<option value="1">Segunda-feira</option>' +
      '<option value="2">Terca-feira</option>' +
      '<option value="3">Quarta-feira</option>' +
      '<option value="4">Quinta-feira</option>' +
      '<option value="5">Sexta-feira</option>' +
      '<option value="6">Sabado</option>' +
      '<option value="0">Domingo</option>' +
    '</select></div>' +
    '<p style="font-size:12px;color:var(--text-muted);margin-top:-8px">O lembrete sera enviado toda semana neste dia via WhatsApp.</p>';
}

function carregarColabsNoSelect(selectId) {
  var qsC = '?select=id,nome&ativo=eq.true&order=nome.asc';
  qsC = addPropFiltro(qsC);
  supaFetch('colaboradores' + qsC).then(function(colabs) {
    var sel = document.getElementById(selectId);
    sel.innerHTML = '<option value="">-- Selecione --</option>';
    colabs.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      sel.appendChild(opt);
    });
  });
}

function abrirModalAviso() {
  modalModo = 'aviso-novo';
  $('#modal-titulo').textContent = 'Novo Aviso';

  if (propriedadeFiltro === 'todas') {
    mostrarToast('Selecione uma propriedade primeiro', 'error');
    return;
  }

  $('#modal-body').innerHTML = montarFormAviso();
  $('#modal-btn-salvar').onclick = salvarAviso;
  $('#modal-overlay').classList.remove('escondido');
  carregarColabsNoSelect('aviso-colaborador');
}

async function salvarAviso() {
  var colaboradorId = document.getElementById('aviso-colaborador').value;
  var descricao = document.getElementById('aviso-descricao').value.trim();

  if (!colaboradorId || !descricao) {
    mostrarToast('Preencha colaborador e descricao', 'error');
    return;
  }

  try {
    await supaInsert('avisos', {
      propriedade_id: propriedadeFiltro,
      colaborador_id: colaboradorId,
      descricao: descricao,
      frequencia: 'semanal',
      dia_disparo_semana: parseInt(document.getElementById('aviso-dia-semana').value),
      dias_disparo_mes: null,
    });
    fecharModal();
    carregarAvisosAdmin();
    mostrarToast('Aviso criado!');
  } catch (err) {
    mostrarToast('Erro ao salvar aviso', 'error');
  }
}

function toggleItensAviso(cid) {
  var el = document.getElementById('aviso-itens-' + cid);
  if (el) el.classList.toggle('escondido');
}

async function salvarMsgAviso(colaboradorId) {
  var textarea = document.getElementById('msg-text-' + colaboradorId);
  if (!textarea) return;

  try {
    await supaUpdate('colaboradores', colaboradorId, { msg_aviso: textarea.value });
    mostrarToast('Mensagem salva!');
  } catch (err) {
    mostrarToast('Erro ao salvar mensagem', 'error');
  }
}

async function abrirModalEditarAviso(avisoId) {
  modalModo = 'aviso-editar';
  modalItemId = avisoId;
  $('#modal-titulo').textContent = 'Editar Aviso';

  $('#modal-body').innerHTML = montarFormAviso();

  $('#modal-btn-salvar').onclick = async function() {
    var descricao = document.getElementById('aviso-descricao').value.trim();
    var colaboradorId = document.getElementById('aviso-colaborador').value;
    if (!descricao || !colaboradorId) { mostrarToast('Preencha colaborador e descricao', 'error'); return; }

    try {
      await supaUpdate('avisos', avisoId, {
        colaborador_id: colaboradorId,
        descricao: descricao,
        frequencia: 'semanal',
        dia_disparo_semana: parseInt(document.getElementById('aviso-dia-semana').value),
      });
      fecharModal();
      carregarAvisosAdmin();
      mostrarToast('Aviso atualizado!');
    } catch (err) {
      mostrarToast('Erro ao atualizar', 'error');
    }
  };

  $('#modal-overlay').classList.remove('escondido');

  // Carregar colaboradores e preencher dados
  carregarColabsNoSelect('aviso-colaborador');

  try {
    var avisoData = await supaFetch('avisos?id=eq.' + avisoId);
    if (avisoData && avisoData.length > 0) {
      var a = avisoData[0];
      // Aguardar select popular
      setTimeout(function() {
        document.getElementById('aviso-colaborador').value = a.colaborador_id || '';
      }, 500);
      document.getElementById('aviso-descricao').value = a.descricao || '';
      document.getElementById('aviso-dia-semana').value = (a.dia_disparo_semana !== null) ? a.dia_disparo_semana : 1;
    }
  } catch (err) {
    console.error('Erro ao carregar aviso:', err);
  }
}

async function carregarRotinasTabela() {
  try {
    var qs = '?select=*,setores(nome,icone),colaboradores:responsavel_id(nome)&order=dia_semana.asc,hora_disparo.asc';
    qs = addPropFiltro(qs);

    var data = await supaFetch('rotinas_semanais' + qs);
    var tbody = $('#tbody-rotinas');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="placeholder">Nenhuma rotina encontrada. Clique em "+ Nova Rotina" para criar.</td></tr>';
      $('#rotina-detalhe').classList.add('escondido');
      return;
    }

    var freqLabels = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };

    tbody.innerHTML = data.map(function(r) {
      var ativo = r.ativo !== false;
      var statusClass = ativo ? 'ativo' : 'inativo';
      var statusText = ativo ? 'Ativo' : 'Inativo';
      var setorNome = (r.setores && r.setores.nome) || '--';
      var setorIcone = (r.setores && r.setores.icone) || '';
      var diaNome = (r.dia_semana !== null && r.dia_semana !== undefined) ? (diasSemana[r.dia_semana] || r.dia_semana) : '--';
      var freq = freqLabels[r.frequencia] || r.frequencia || 'Semanal';
      var respNome = (r.colaboradores && r.colaboradores.nome) || 'Todos';
      var isAtiva = rotinaAbertaId === r.id;

      // Dias de lembrete WhatsApp
      var diasLembrete = r.dias_lembrete || 'mesmo_dia';
      var diasTexto = '';
      if (diasLembrete === 'mesmo_dia') {
        diasTexto = diaNome;
      } else {
        diasTexto = diasLembrete.split(',').map(function(d) { return diasSemana[parseInt(d)] || d; }).join(', ');
      }
      var temMsg = r.msg_whatsapp ? true : false;

      return '<tr class="tr-clicavel' + (isAtiva ? ' tr-ativa' : '') + '" onclick="expandirRotina(\'' + r.id + '\')">' +
        '<td>' + escapeHtml(r.nome || '--') + '</td>' +
        '<td>' + escapeHtml(setorIcone + ' ' + setorNome) + '</td>' +
        '<td>' + freq + '</td>' +
        '<td>' + escapeHtml(respNome) + '</td>' +
        '<td>' + escapeHtml(diasTexto) + '</td>' +
        '<td><span class="badge badge--' + statusClass + '">' + statusText + '</span></td>' +
        '<td class="td-acoes" onclick="event.stopPropagation()">' +
          '<button class="btn btn--small btn--secondary" onclick="mostrarMsgRotina(\'' + r.id + '\')" title="Mensagem WhatsApp">📱</button> ' +
          '<button class="btn btn--small btn--secondary" onclick="abrirModalRotina(\'' + r.id + '\')" title="Editar">&#9998;</button> ' +
          '<button class="btn btn--small btn--danger" onclick="toggleRotina(\'' + r.id + '\',' + ativo + ')" title="' + (ativo ? 'Desativar' : 'Ativar') + '">' + (ativo ? '&#10005;' : '&#10003;') + '</button>' +
        '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar rotinas:', err);
    $('#tbody-rotinas').innerHTML = '<tr><td colspan="7" class="placeholder">Erro ao carregar</td></tr>';
  }
}

var rotinaWhatsappId = null;

async function mostrarMsgRotina(rotinaId) {
  try {
    var data = await supaFetch('rotinas_semanais?id=eq.' + rotinaId + '&select=id,msg_whatsapp,dias_lembrete,nome');
    if (!data || data.length === 0) return;
    var r = data[0];
    rotinaWhatsappId = rotinaId;

    var diasTexto = r.dias_lembrete || 'mesmo_dia';
    if (diasTexto !== 'mesmo_dia') {
      diasTexto = 'Dias: ' + diasTexto.split(',').map(function(d) { return diasSemana[parseInt(d)] || d; }).join(', ');
    } else {
      diasTexto = 'Mesmo dia da rotina';
    }

    $('#rotina-dias-lembrete').textContent = diasTexto;
    $('#rotina-msg-texto').value = r.msg_whatsapp || '(Sem mensagem — edite e salve)';
    $('#rotina-dias-input').value = r.dias_lembrete || 'mesmo_dia';
    $('#rotina-whatsapp').classList.remove('escondido');
    $('#rotina-whatsapp').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    mostrarToast('Erro ao carregar mensagem', 'error');
  }
}

async function salvarMsgRotina() {
  if (!rotinaWhatsappId) return;
  try {
    await supaUpdate('rotinas_semanais', rotinaWhatsappId, {
      msg_whatsapp: $('#rotina-msg-texto').value,
      dias_lembrete: $('#rotina-dias-input').value.trim() || 'mesmo_dia',
    });
    mostrarToast('Mensagem e dias salvos!');
    carregarRotinasTabela();
  } catch (err) {
    mostrarToast('Erro ao salvar', 'error');
  }
}

async function expandirRotina(rotinaId) {
  try {
    rotinaAbertaId = rotinaId;

    var rotinaPromise = supaFetch('rotinas_semanais?id=eq.' + rotinaId + '&select=*,setores(nome,icone)');
    var itemsPromise = supaFetch('rotina_items?rotina_id=eq.' + rotinaId + '&select=*,colaboradores:colaborador_id(nome)&order=ordem.asc');
    var results = await Promise.all([rotinaPromise, itemsPromise]);

    var rotinaData = results[0];
    var items = results[1];

    if (!rotinaData || rotinaData.length === 0) return;
    var rot = rotinaData[0];

    var detalhe = $('#rotina-detalhe');
    var container = $('#rotina-items');

    var setorNome = (rot.setores && rot.setores.nome) || '--';
    var diaNome = (rot.dia_semana !== null) ? (diasSemana[rot.dia_semana] || rot.dia_semana) : '--';
    $('#rotina-detalhe-titulo').textContent = rot.nome + ' — ' + setorNome + ' (' + diaNome + ')';

    if (!items || items.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhum item na rotina. Clique em "+ Item" para adicionar.</p>';
    } else {
      container.innerHTML = items.map(function(item) {
        var colabNome = (item.colaboradores && item.colaboradores.nome) ? ' <span style="font-size:11px;color:var(--text-muted)">(' + escapeHtml(item.colaboradores.nome) + ')</span>' : '';
        return '<div class="checklist-item-row">' +
          '<div class="checklist-item-check">' +
            '<span class="checklist-box">' + (item.ordem || '') + '</span>' +
            '<span>' + escapeHtml(item.descricao || '--') + colabNome + '</span>' +
          '</div>' +
          '<button class="btn-icon btn-icon--danger" onclick="removerItemRotina(\'' + item.id + '\')" title="Remover">&times;</button>' +
        '</div>';
      }).join('');
    }

    detalhe.classList.remove('escondido');
    detalhe.scrollIntoView({ behavior: 'smooth' });
    carregarRotinas();

  } catch (err) {
    console.error('Erro ao expandir rotina:', err);
  }
}

function fecharDetalheRotina() {
  rotinaAbertaId = null;
  $('#rotina-detalhe').classList.add('escondido');
  carregarRotinas();
}

async function abrirModalRotina(id) {
  modalModo = id ? 'rotina-editar' : 'rotina-nova';
  modalItemId = id || null;

  $('#modal-titulo').textContent = id ? 'Editar Rotina' : 'Nova Rotina';

  if (propriedadeFiltro === 'todas') {
    mostrarToast('Selecione uma propriedade primeiro', 'error');
    return;
  }

  var setorOptions = cacheSetores.map(function(s) {
    return '<option value="' + s.id + '">' + escapeHtml(s.nome) + '</option>';
  }).join('');

  var diasOptions = diasSemana.map(function(d, i) {
    return '<option value="' + i + '">' + d + '</option>';
  }).join('');

  // Carregar colaboradores para seletor de responsavel
  await carregarCacheColaboradores();
  var colabOptions = '<option value="">Todos do setor</option>';
  cacheColaboradores.forEach(function(c) {
    colabOptions += '<option value="' + c.id + '">' + escapeHtml(c.nome) + ' (' + (c.funcao || '') + ')</option>';
  });

  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Nome da Rotina *</label><input type="text" id="campo-rotina-nome" placeholder="Ex: Limpeza matinal areas comuns" required></div>' +
    '<div class="form-row">' +
      '<div class="form-group form-group--half"><label>Setor *</label><select id="campo-rotina-setor" required><option value="">Selecione...</option>' + setorOptions + '</select></div>' +
      '<div class="form-group form-group--half"><label>Dia da Semana *</label><select id="campo-rotina-dia" required>' + diasOptions + '</select></div>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-group form-group--half"><label>Hora de Disparo</label><input type="time" id="campo-rotina-hora" value="07:00"></div>' +
      '<div class="form-group form-group--half"><label>Responsavel</label><select id="campo-rotina-responsavel">' + colabOptions + '</select></div>' +
    '</div>' +
    '<div class="form-group"><label>Descricao</label><input type="text" id="campo-rotina-desc" placeholder="Descricao opcional"></div>';

  if (id) {
    carregarDadosRotinaModal(id);
  }

  $('#modal-overlay').classList.remove('escondido');
}

async function carregarDadosRotinaModal(id) {
  try {
    var data = await supaFetch('rotinas_semanais?id=eq.' + id);
    if (data && data.length > 0) {
      var r = data[0];
      $('#campo-rotina-nome').value = r.nome || '';
      $('#campo-rotina-setor').value = r.setor_id || '';
      $('#campo-rotina-dia').value = (r.dia_semana !== null) ? r.dia_semana : 0;
      $('#campo-rotina-hora').value = r.hora_disparo || '07:00';
      var descEl = $('#campo-rotina-desc');
      if (descEl) descEl.value = r.descricao || '';
    }
  } catch (err) {
    console.error('Erro ao carregar rotina:', err);
  }
}

async function toggleRotina(id, atualmenteAtivo) {
  try {
    await supaUpdate('rotinas_semanais', id, { ativo: !atualmenteAtivo });
    mostrarToast(atualmenteAtivo ? 'Rotina desativada' : 'Rotina ativada');
    carregarRotinas();
  } catch (err) {
    mostrarToast('Erro ao alterar status', 'error');
  }
}

async function adicionarItemRotina() {
  if (!rotinaAbertaId) { mostrarToast('Selecione uma rotina primeiro', 'error'); return; }

  // Buscar colaboradores da propriedade filtrada
  await carregarCacheColaboradores();
  var colabOptions = '<option value="">Sem responsavel</option>';
  cacheColaboradores.forEach(function(c) {
    colabOptions += '<option value="' + c.id + '">' + escapeHtml(c.nome) + ' (' + (c.funcao || '') + ')</option>';
  });

  modalModo = 'rotina-item-novo';
  modalItemId = null;
  $('#modal-titulo').textContent = 'Novo Item da Rotina';
  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Descricao do item *</label><input type="text" id="campo-item-descricao" placeholder="Ex: Rocagem geral" required></div>' +
    '<div class="form-group"><label>Responsavel</label><select id="campo-item-colaborador">' + colabOptions + '</select></div>';
  $('#modal-overlay').classList.remove('escondido');

  // Focar no input
  setTimeout(function() { var el = $('#campo-item-descricao'); if (el) el.focus(); }, 100);
}

async function salvarItemRotina() {
  var descricao = ($('#campo-item-descricao') || {}).value;
  var colaboradorId = ($('#campo-item-colaborador') || {}).value;
  if (!descricao || !descricao.trim()) { mostrarToast('Preencha a descricao', 'error'); return; }

  try {
    var rotina = await supaFetch('rotinas_semanais?id=eq.' + rotinaAbertaId + '&select=propriedade_id');
    var propId = (rotina && rotina[0]) ? rotina[0].propriedade_id : null;
    if (!propId) { mostrarToast('Erro: rotina sem propriedade', 'error'); return; }

    var items = await supaFetch('rotina_items?rotina_id=eq.' + rotinaAbertaId + '&select=ordem&order=ordem.desc&limit=1');
    var proximaOrdem = (items && items.length > 0) ? (items[0].ordem + 1) : 1;

    var body = {
      rotina_id: rotinaAbertaId,
      propriedade_id: propId,
      descricao: descricao.trim(),
      ordem: proximaOrdem,
    };
    if (colaboradorId) body.colaborador_id = colaboradorId;

    await supaInsert('rotina_items', body);
    mostrarToast('Item adicionado');
    fecharModal();
    await expandirRotina(rotinaAbertaId);
  } catch (err) {
    console.error('Erro ao adicionar item:', err);
    mostrarToast('Erro ao adicionar item: ' + err.message, 'error');
  }
}

async function removerItemRotina(itemId) {
  if (!confirm('Remover este item?')) return;
  try {
    var url = CONFIG.SUPABASE_URL + '/rest/v1/rotina_items?id=eq.' + itemId;
    var r = await fetch(url, { method: 'DELETE', headers: apiHeaders() });
    if (!r.ok) throw new Error('Erro ao remover');
    mostrarToast('Item removido');
    if (rotinaAbertaId) await expandirRotina(rotinaAbertaId);
  } catch (err) {
    mostrarToast('Erro ao remover item', 'error');
  }
}

/* ================================================================== */
/*  GERAR TAREFAS A PARTIR DE ROTINAS                                 */
/* ================================================================== */
async function gerarTarefasDoDia() {
  if (propriedadeFiltro === 'todas') {
    mostrarToast('Selecione uma propriedade primeiro', 'error');
    return;
  }

  var btn = $('#btn-gerar-tarefas');
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }

  try {
    // 1. Buscar dia da semana atual
    var hoje = new Date();
    var diaSemana = hoje.getDay(); // 0=dom, 1=seg...

    // 2. Buscar rotinas ativas para hoje e esta propriedade
    var rotinas = await supaFetch(
      'rotinas_semanais?select=*,setores(nome)&ativo=eq.true&dia_semana=eq.' + diaSemana +
      '&propriedade_id=eq.' + propriedadeFiltro
    );

    if (!rotinas || rotinas.length === 0) {
      var diasNomes = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
      mostrarToast('Nenhuma rotina ativa para ' + diasNomes[diaSemana], 'error');
      if (btn) { btn.disabled = false; btn.textContent = '\u26A1 Gerar Tarefas de Hoje'; }
      return;
    }

    // 3. Verificar se ja foram geradas hoje (evitar duplicatas)
    var hojeStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    var jaGeradas = await supaFetch(
      'tarefas?select=rotina_id&origem=eq.rotina&propriedade_id=eq.' + propriedadeFiltro +
      '&created_at=gte.' + hojeStr + 'T00:00:00-03:00&created_at=lt.' + hojeStr + 'T23:59:59-03:00'
    );
    var rotinasJaGeradas = {};
    if (jaGeradas) {
      jaGeradas.forEach(function(t) { if (t.rotina_id) rotinasJaGeradas[t.rotina_id] = true; });
    }

    var criadas = 0;
    var puladas = 0;

    // 4. Para cada rotina, criar tarefa + copiar itens
    for (var i = 0; i < rotinas.length; i++) {
      var rot = rotinas[i];

      // Pular se ja foi gerada hoje
      if (rotinasJaGeradas[rot.id]) {
        puladas++;
        continue;
      }

      // Buscar itens da rotina
      var rotItems = await supaFetch(
        'rotina_items?rotina_id=eq.' + rot.id + '&select=*&order=ordem.asc'
      );

      var setorNome = (rot.setores && rot.setores.nome) || '';

      // Criar tarefa
      var novaTarefa = await supaInsert('tarefas', {
        propriedade_id: rot.propriedade_id,
        comando_original: rot.nome,
        descricao: rot.descricao || rot.nome,
        setor_id: rot.setor_id,
        setor_interpretado: setorNome,
        status: 'pendente',
        prioridade: 'normal',
        origem: 'rotina',
        rotina_id: rot.id,
        data_limite: hojeStr,
      });

      // Criar checklist_items atribuidos aos colaboradores do setor
      if (novaTarefa && novaTarefa.length > 0) {
        var tarefaId = novaTarefa[0].id;

        // Buscar colaboradores ativos do setor da rotina
        var colabsSetor = await supaFetch(
          'colaboradores?propriedade_id=eq.' + rot.propriedade_id +
          '&setor_id=eq.' + rot.setor_id + '&ativo=eq.true&select=id,nome'
        );

        if (rotItems && rotItems.length > 0) {
          // Tem itens de rotina: criar checklist para cada item X cada colaborador do setor
          for (var j = 0; j < rotItems.length; j++) {
            var ri = rotItems[j];
            if (ri.colaborador_id) {
              // Item com colaborador especifico
              await supaInsert('checklist_items', {
                tarefa_id: tarefaId,
                propriedade_id: rot.propriedade_id,
                colaborador_id: ri.colaborador_id,
                descricao: ri.descricao,
                ordem: ri.ordem || (j + 1),
                status: 'pendente',
              });
            } else if (colabsSetor && colabsSetor.length > 0) {
              // Item sem colaborador: atribuir a TODOS do setor
              for (var k = 0; k < colabsSetor.length; k++) {
                await supaInsert('checklist_items', {
                  tarefa_id: tarefaId,
                  propriedade_id: rot.propriedade_id,
                  colaborador_id: colabsSetor[k].id,
                  descricao: ri.descricao,
                  ordem: ri.ordem || (j + 1),
                  status: 'pendente',
                });
              }
            } else {
              // Sem colaboradores no setor: criar sem atribuicao
              await supaInsert('checklist_items', {
                tarefa_id: tarefaId,
                propriedade_id: rot.propriedade_id,
                colaborador_id: null,
                descricao: ri.descricao,
                ordem: ri.ordem || (j + 1),
                status: 'pendente',
              });
            }
          }
        } else {
          // Sem itens de rotina: criar 1 checklist por colaborador do setor com a descricao da rotina
          if (colabsSetor && colabsSetor.length > 0) {
            for (var k = 0; k < colabsSetor.length; k++) {
              await supaInsert('checklist_items', {
                tarefa_id: tarefaId,
                propriedade_id: rot.propriedade_id,
                colaborador_id: colabsSetor[k].id,
                descricao: rot.nome,
                ordem: 1,
                status: 'pendente',
              });
            }
          }
        }
      }

      criadas++;
    }

    // 5. Feedback
    var msg = criadas + ' tarefa(s) gerada(s) a partir das rotinas';
    if (puladas > 0) msg += ' (' + puladas + ' ja existiam hoje)';
    mostrarToast(msg);

  } catch (err) {
    console.error('Erro ao gerar tarefas:', err);
    mostrarToast('Erro ao gerar tarefas: ' + err.message, 'error');
  }

  if (btn) { btn.disabled = false; btn.textContent = '\u26A1 Gerar Tarefas de Hoje'; }
}

/* ================================================================== */
/*  RELATORIOS                                                        */
/* ================================================================== */
function getInicioSemana(date) {
  var d = new Date(date);
  var dia = d.getDay(); // 0=dom
  d.setDate(d.getDate() - dia);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getFimSemana(date) {
  var d = getInicioSemana(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function carregarRelatorios() {
  try {
    var qs = '?select=*&order=created_at.desc';
    qs = addPropFiltro(qs);

    var data = await supaFetch('relatorios_semanais' + qs);
    var tbody = $('#tbody-relatorios');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Nenhum relatorio encontrado. Clique em "Gerar Relatorio" para criar.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function(r) {
      var periodo = '';
      if (r.semana_inicio && r.semana_fim) {
        periodo = formatarData(r.semana_inicio) + ' - ' + formatarData(r.semana_fim);
      } else {
        periodo = formatarData(r.created_at);
      }

      var conclusao = r.percentual_conclusao || 0;

      return '<tr class="tr-clicavel" onclick="expandirRelatorio(\'' + r.id + '\')">' +
        '<td>' + periodo + '</td>' +
        '<td>' + (r.total_tarefas || 0) + '</td>' +
        '<td>' + (r.tarefas_concluidas || 0) + '</td>' +
        '<td>' + (r.tarefas_pendentes || 0) + '</td>' +
        '<td>' +
          '<div class="progress" title="' + conclusao + '%"><div class="progress__bar" style="width:' + conclusao + '%"></div></div>' +
          '<span style="font-size:12px;color:var(--text-muted)">' + conclusao + '%</span>' +
        '</td>' +
        '<td class="td-acoes" onclick="event.stopPropagation()">' +
          '<button class="btn btn--small btn--secondary" onclick="expandirRelatorio(\'' + r.id + '\')" title="Ver detalhes">&#128270;</button>' +
        '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar relatorios:', err);
    $('#tbody-relatorios').innerHTML = '<tr><td colspan="6" class="placeholder">Erro ao carregar</td></tr>';
  }
}

async function gerarRelatorioSemanal() {
  if (propriedadeFiltro === 'todas') {
    mostrarToast('Selecione uma propriedade primeiro', 'error');
    return;
  }

  var btn = $('#btn-gerar-relatorio');
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }

  try {
    var hoje = new Date();
    var inicio = getInicioSemana(hoje);
    var fim = getFimSemana(hoje);
    var inicioStr = inicio.getFullYear() + '-' + String(inicio.getMonth() + 1).padStart(2, '0') + '-' + String(inicio.getDate()).padStart(2, '0');
    var fimStr = fim.getFullYear() + '-' + String(fim.getMonth() + 1).padStart(2, '0') + '-' + String(fim.getDate()).padStart(2, '0');

    // Verificar se ja existe relatorio para esta semana
    var existente = await supaFetch(
      'relatorios_semanais?semana_inicio=eq.' + inicioStr +
      '&propriedade_id=eq.' + propriedadeFiltro + '&select=id'
    );
    if (existente && existente.length > 0) {
      if (!confirm('Ja existe um relatorio para esta semana. Deseja gerar novamente (substituir)?')) {
        if (btn) { btn.disabled = false; btn.textContent = '\u26A1 Gerar Relatorio da Semana'; }
        return;
      }
      // Deletar o existente
      var urlDel = CONFIG.SUPABASE_URL + '/rest/v1/relatorios_semanais?id=eq.' + existente[0].id;
      await fetch(urlDel, { method: 'DELETE', headers: apiHeaders() });
    }

    // Buscar tarefas da semana
    var tarefas = await supaFetch(
      'tarefas?select=*,colaboradores:responsavel_id(nome),setores:setor_id(nome,icone)' +
      '&propriedade_id=eq.' + propriedadeFiltro +
      '&created_at=gte.' + inicioStr + 'T00:00:00-03:00' +
      '&created_at=lte.' + fimStr + 'T23:59:59-03:00' +
      '&order=created_at.asc'
    );

    // Buscar checklist_items da semana
    var checkItems = await supaFetch(
      'checklist_items?select=*,colaboradores:colaborador_id(nome)' +
      '&propriedade_id=eq.' + propriedadeFiltro +
      '&created_at=gte.' + inicioStr + 'T00:00:00-03:00' +
      '&created_at=lte.' + fimStr + 'T23:59:59-03:00'
    );

    // Buscar colaboradores ativos
    var colabs = await supaFetch(
      'colaboradores?select=id,nome,funcao,setor_id,setores(nome)' +
      '&propriedade_id=eq.' + propriedadeFiltro +
      '&ativo=eq.true'
    );

    // Calcular estatisticas
    var totalTarefas = tarefas ? tarefas.length : 0;
    var tarefasConcluidas = tarefas ? tarefas.filter(function(t) { return t.status === 'concluida'; }).length : 0;
    var tarefasPendentes = totalTarefas - tarefasConcluidas;
    var percentual = totalTarefas > 0 ? Math.round((tarefasConcluidas / totalTarefas) * 100) : 0;

    // Estatisticas por setor
    var porSetor = {};
    if (tarefas) {
      tarefas.forEach(function(t) {
        var setor = (t.setores && t.setores.nome) || t.setor_interpretado || 'Geral';
        var icone = (t.setores && t.setores.icone) || '';
        if (!porSetor[setor]) porSetor[setor] = { icone: icone, total: 0, concluidas: 0, tarefas: [] };
        porSetor[setor].total++;
        if (t.status === 'concluida') porSetor[setor].concluidas++;
        porSetor[setor].tarefas.push({
          nome: t.comando_original || t.descricao,
          status: t.status,
          responsavel: (t.colaboradores && t.colaboradores.nome) || null,
          origem: t.origem,
        });
      });
    }

    // Estatisticas por colaborador (com itens detalhados)
    var porColab = {};
    if (checkItems) {
      checkItems.forEach(function(ci) {
        var nome = (ci.colaboradores && ci.colaboradores.nome) || 'Nao atribuido';
        if (!porColab[nome]) porColab[nome] = { total: 0, concluidos: 0, itens: [] };
        porColab[nome].total++;
        if (ci.status === 'concluido') porColab[nome].concluidos++;
        porColab[nome].itens.push({
          descricao: ci.descricao,
          status: ci.status,
          observacao: ci.observacao || null,
          foto: ci.foto_url ? true : false,
          concluido_at: ci.concluido_at || null,
        });
      });
    }

    // Montar JSON do relatorio
    var dadosJson = {
      gerado_em: new Date().toISOString(),
      propriedade: propriedadeFiltro,
      por_setor: porSetor,
      por_colaborador: porColab,
      total_checklist_items: checkItems ? checkItems.length : 0,
      checklist_concluidos: checkItems ? checkItems.filter(function(ci) { return ci.status === 'concluido'; }).length : 0,
      colaboradores_ativos: colabs ? colabs.length : 0,
    };

    // Inserir relatorio
    await supaInsert('relatorios_semanais', {
      propriedade_id: propriedadeFiltro,
      semana_inicio: inicioStr,
      semana_fim: fimStr,
      dados_json: dadosJson,
      total_tarefas: totalTarefas,
      tarefas_concluidas: tarefasConcluidas,
      tarefas_pendentes: tarefasPendentes,
      percentual_conclusao: percentual,
    });

    mostrarToast('Relatorio gerado com sucesso!');
    carregarRelatorios();

  } catch (err) {
    console.error('Erro ao gerar relatorio:', err);
    mostrarToast('Erro ao gerar relatorio: ' + err.message, 'error');
  }

  if (btn) { btn.disabled = false; btn.textContent = '\u26A1 Gerar Relatorio da Semana'; }
}

async function expandirRelatorio(relatorioId) {
  try {
    var data = await supaFetch('relatorios_semanais?id=eq.' + relatorioId);
    if (!data || data.length === 0) return;
    var r = data[0];

    var detalhe = $('#relatorio-detalhe');
    var body = $('#relatorio-detalhe-body');

    var periodo = formatarData(r.semana_inicio) + ' - ' + formatarData(r.semana_fim);
    $('#relatorio-detalhe-titulo').textContent = 'Relatorio: ' + periodo;

    var pct = r.percentual_conclusao || 0;
    var dados = r.dados_json || {};

    // Resumo geral
    var html = '<div class="relatorio-resumo">' +
      '<div class="relatorio-stat"><span class="relatorio-stat__valor">' + (r.total_tarefas || 0) + '</span><span class="relatorio-stat__label">Total Tarefas</span></div>' +
      '<div class="relatorio-stat relatorio-stat--success"><span class="relatorio-stat__valor">' + (r.tarefas_concluidas || 0) + '</span><span class="relatorio-stat__label">Concluidas</span></div>' +
      '<div class="relatorio-stat relatorio-stat--warning"><span class="relatorio-stat__valor">' + (r.tarefas_pendentes || 0) + '</span><span class="relatorio-stat__label">Pendentes</span></div>' +
      '<div class="relatorio-stat"><span class="relatorio-stat__valor">' + pct + '%</span><span class="relatorio-stat__label">Conclusao</span></div>' +
    '</div>';

    // Por setor
    if (dados.por_setor && Object.keys(dados.por_setor).length > 0) {
      html += '<h4 style="margin:20px 0 10px;font-size:14px;color:var(--text)">Por Setor</h4>';
      html += '<div class="relatorio-setores">';
      Object.keys(dados.por_setor).forEach(function(setor) {
        var s = dados.por_setor[setor];
        var sPct = s.total > 0 ? Math.round((s.concluidas / s.total) * 100) : 0;
        html += '<div class="relatorio-setor-card">' +
          '<div class="relatorio-setor-header">' +
            '<span>' + (s.icone || '') + ' <strong>' + escapeHtml(setor) + '</strong></span>' +
            '<span>' + s.concluidas + '/' + s.total + ' (' + sPct + '%)</span>' +
          '</div>' +
          '<div class="progress"><div class="progress__bar" style="width:' + sPct + '%"></div></div>';

        // Listar tarefas do setor
        if (s.tarefas && s.tarefas.length > 0) {
          html += '<div class="relatorio-setor-tarefas">';
          s.tarefas.forEach(function(t) {
            var statusIcon = t.status === 'concluida' ? '&#10003;' : (t.status === 'cancelada' ? '&#10005;' : '&#9711;');
            var statusClass = t.status === 'concluida' ? 'color:var(--success)' : (t.status === 'cancelada' ? 'color:var(--danger)' : 'color:var(--warning)');
            html += '<div style="font-size:13px;padding:3px 0;display:flex;gap:6px;align-items:center">' +
              '<span style="' + statusClass + '">' + statusIcon + '</span>' +
              '<span>' + escapeHtml(t.nome || '--') + '</span>' +
              (t.responsavel ? '<span style="font-size:11px;color:var(--text-muted)">(' + escapeHtml(t.responsavel) + ')</span>' : '') +
            '</div>';
          });
          html += '</div>';
        }

        html += '</div>';
      });
      html += '</div>';
    }

    // Por colaborador
    if (dados.por_colaborador && Object.keys(dados.por_colaborador).length > 0) {
      html += '<h4 style="margin:20px 0 10px;font-size:14px;color:var(--text)">Por Colaborador (Checklist Items)</h4>';
      html += '<div class="relatorio-setores">';
      Object.keys(dados.por_colaborador).forEach(function(nome) {
        var c = dados.por_colaborador[nome];
        var cPct = c.total > 0 ? Math.round((c.concluidos / c.total) * 100) : 0;
        html += '<div class="relatorio-setor-card">' +
          '<div class="relatorio-setor-header">' +
            '<span><strong>' + escapeHtml(nome) + '</strong></span>' +
            '<span>' + c.concluidos + '/' + c.total + ' itens (' + cPct + '%)</span>' +
          '</div>' +
          '<div class="progress"><div class="progress__bar" style="width:' + cPct + '%"></div></div>';

        // Listar itens do colaborador
        if (c.itens && c.itens.length > 0) {
          html += '<div class="relatorio-setor-tarefas">';
          c.itens.forEach(function(item) {
            var ic = item.status === 'concluido' ? '&#10003;' : '&#9711;';
            var cor = item.status === 'concluido' ? 'color:var(--success)' : 'color:var(--warning)';
            var hora = '';
            if (item.concluido_at) {
              var dt = new Date(item.concluido_at);
              hora = ' ' + dt.getHours().toString().padStart(2,'0') + ':' + dt.getMinutes().toString().padStart(2,'0');
            }
            html += '<div style="font-size:13px;padding:3px 0;display:flex;gap:6px;align-items:center">' +
              '<span style="' + cor + '">' + ic + '</span>' +
              '<span>' + escapeHtml(item.descricao || '') + '</span>' +
              (hora ? '<span style="font-size:11px;color:var(--text-muted)">' + hora + '</span>' : '') +
              (item.foto ? '<span style="font-size:11px">&#128248;</span>' : '') +
              (item.observacao ? '<span style="font-size:11px;color:var(--text-muted);font-style:italic">' + escapeHtml(item.observacao).substring(0,30) + '</span>' : '') +
            '</div>';
          });
          html += '</div>';
        }

        html += '</div>';
      });
      html += '</div>';
    }

    // Info extra + botao exportar
    html += '<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-size:12px;color:var(--text-muted)">' +
        'Gerado em: ' + (dados.gerado_em ? new Date(dados.gerado_em).toLocaleString('pt-BR') : '--') +
        ' | Colaboradores ativos: ' + (dados.colaboradores_ativos || 0) +
        ' | Items checklist: ' + (dados.checklist_concluidos || 0) + '/' + (dados.total_checklist_items || 0) +
      '</span>' +
      '<button class="btn btn--primary btn--small" onclick="exportarRelatorio(\'' + relatorioId + '\')">&#128196; Exportar PDF</button>' +
    '</div>';

    body.innerHTML = html;
    detalhe.classList.remove('escondido');
    detalhe.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Erro ao expandir relatorio:', err);
  }
}

function exportarRelatorio(relatorioId) {
  var detalhe = $('#relatorio-detalhe');
  if (!detalhe) return;

  // Encontrar nome da propriedade
  var propNome = 'Propriedade';
  if (propriedadeFiltro !== 'todas') {
    var prop = cachePropriedades.find(function(p) { return String(p.id) === String(propriedadeFiltro); });
    if (prop) propNome = prop.nome;
  }

  var titulo = ($('#relatorio-detalhe-titulo') || {}).textContent || 'Relatorio';
  var conteudo = ($('#relatorio-detalhe-body') || {}).innerHTML || '';

  var printWindow = window.open('', '_blank');
  printWindow.document.write(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + escapeHtml(propNome) + ' - ' + escapeHtml(titulo) + '</title>' +
    '<style>' +
      'body{font-family:"DM Sans",sans-serif;max-width:800px;margin:0 auto;padding:20px 30px;color:#1a1a1a}' +
      '.header{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #C45D3E}' +
      '.header h1{font-size:20px;margin:0;color:#C45D3E}' +
      '.header h2{font-size:16px;margin:4px 0 0;font-weight:400;color:#666}' +
      '.relatorio-resumo{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}' +
      '.relatorio-stat{background:#f5f5f0;border-radius:8px;padding:14px;text-align:center;border:1px solid #e5e5e0}' +
      '.relatorio-stat--success{background:#e8f3ec;border-color:#3D6B4F}' +
      '.relatorio-stat--warning{background:#faf3e0;border-color:#B8964E}' +
      '.relatorio-stat__valor{display:block;font-size:24px;font-weight:700}' +
      '.relatorio-stat__label{display:block;font-size:11px;color:#666;margin-top:2px;text-transform:uppercase}' +
      '.relatorio-setores{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}' +
      '.relatorio-setor-card{background:#f5f5f0;border-radius:8px;padding:12px;border:1px solid #e5e5e0}' +
      '.relatorio-setor-header{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px}' +
      '.relatorio-setor-tarefas{margin-top:6px;padding-top:6px;border-top:1px solid #e5e5e0}' +
      '.progress{background:#e5e5e0;border-radius:100px;height:6px;overflow:hidden}' +
      '.progress__bar{background:#C45D3E;height:100%;border-radius:100px}' +
      'h4{margin:18px 0 8px;font-size:14px}' +
      '@media print{body{padding:10px}@page{margin:15mm}}' +
    '</style></head><body>' +
    '<div class="header">' +
      '<h1>' + escapeHtml(propNome) + '</h1>' +
      '<h2>' + escapeHtml(titulo) + '</h2>' +
    '</div>' +
    conteudo +
    '<script>window.onload=function(){window.print()}<\/script>' +
    '</body></html>'
  );
  printWindow.document.close();
}

/* ================================================================== */
/*  WHATSAPP — EVOLUTION API                                          */
/* ================================================================== */
var wppInstanciaAtual = null;
var wppInstanciaToken = null;
var wppInstanciaId = null;
var wppStatusInterval = null;
var wppColaboradoresSelecionados = [];

function getEvolutionConfig() {
  if (propriedadeFiltro === 'todas') return null;
  var prop = cachePropriedades.find(function(p) { return String(p.id) === String(propriedadeFiltro); });
  if (!prop || !prop.evolution_api_url || !prop.evolution_api_key) return null;
  return {
    url: prop.evolution_api_url.replace(/\/+$/, ''),
    key: prop.evolution_api_key,
    nome: prop.nome || 'Propriedade',
    slug: prop.slug || prop.nome || '',
    instanceName: prop.evolution_instance_name || '',
    instanceToken: prop.evolution_instance_token || '',
  };
}

async function evolutionFetch(method, path, body, tokenOverride) {
  var cfg = getEvolutionConfig();
  if (!cfg) throw new Error('Evolution API nao configurada para esta propriedade');
  var url = cfg.url + path;
  var opts = {
    method: method,
    headers: {
      'apikey': tokenOverride || cfg.key,
      'Content-Type': 'application/json',
    },
  };
  // Evolution Go expects a body for POST/PATCH/PUT even if empty
  if (body) {
    opts.body = JSON.stringify(body);
  } else if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    opts.body = '{}';
  }
  var r = await fetch(url, opts);
  if (!r.ok) {
    var txt = await r.text();
    throw new Error('Evolution API ' + method + ' ' + path + ': ' + r.status + ' ' + txt);
  }
  var txt = await r.text();
  if (!txt) return {};
  try { return JSON.parse(txt); } catch(e) { return { raw: txt }; }
}

async function carregarWhatsApp() {
  carregarWppConexao();
}

async function carregarWppConexao() {
  var container = $('#wpp-conexao-body');
  var cfg = getEvolutionConfig();

  if (!cfg) {
    container.innerHTML = '<p class="placeholder">Selecione uma propriedade e configure a Evolution API nas Configuracoes (URL e Key)</p>';
    $('#wpp-disparo-body').innerHTML = '<p class="placeholder">Conecte uma instancia primeiro</p>';
    return;
  }

  container.innerHTML = '<p class="placeholder">Carregando instancias...</p>';

  try {
    var instanciaSlug = cfg.slug.toLowerCase().replace(/[^a-z0-9]/g, '-');
    var instanceName = cfg.instanceName || (instanciaSlug + '-gestao');
    var instanceToken = cfg.instanceToken || (instanceName + '-token');
    var instancia = null;

    // Evolution Go: GET /instance/all (global apikey) lists all instances
    try {
      var resp = await evolutionFetch('GET', '/instance/all', null);
      var instances = resp && resp.data ? resp.data : (Array.isArray(resp) ? resp : []);
      if (instances.length > 0) {
        var found = instances.find(function(inst) {
          return inst.name === instanceName;
        });
        if (found) {
          instancia = { name: found.name, id: found.id, connected: found.connected === true, token: found.token, status: found };
          // Use the instance's own token if available
          if (found.token) instanceToken = found.token;
        }
      }
    } catch (e) {
      console.error('Erro ao listar instancias:', e);
      // Fallback: try status with instance token
      try {
        var statusResp = await evolutionFetch('GET', '/instance/status', null, instanceToken);
        if (statusResp && statusResp.data) {
          instancia = { name: instanceName, connected: statusResp.data.Connected === true, status: statusResp.data };
        }
      } catch (e2) {
        // Instance doesn't exist
      }
    }

    if (instancia) {
      wppInstanciaAtual = instancia.name;
      wppInstanciaToken = instancia.token || instanceToken;
      wppInstanciaId = instancia.id || null;
      // Save instance token to Supabase so n8n can use it
      if (wppInstanciaToken) {
        var prop = cachePropriedades.find(function(p) { return String(p.id) === String(propriedadeFiltro); });
        if (prop && prop.evolution_instance_token !== wppInstanciaToken) {
          supaFetch('propriedades?id=eq.' + propriedadeFiltro, 'PATCH', { evolution_instance_token: wppInstanciaToken })
            .then(function() { if (prop) prop.evolution_instance_token = wppInstanciaToken; })
            .catch(function(e) { console.error('Erro ao salvar token:', e); });
        }
      }
      renderWppConexaoStatus(instancia);
    } else {
      wppInstanciaAtual = null;
      wppInstanciaToken = null;
      wppInstanciaId = null;
      renderWppSemInstancia(instanceName);
    }

  } catch (err) {
    console.error('Erro ao carregar instancias:', err);
    container.innerHTML = '<div class="wpp-error"><p>Erro ao conectar com a Evolution API</p><p style="font-size:12px;color:var(--text-muted)">' + escapeHtml(err.message) + '</p></div>';
    $('#wpp-disparo-body').innerHTML = '<p class="placeholder">Erro na conexao com a API</p>';
  }
}

function renderWppSemInstancia(sugestedName) {
  var container = $('#wpp-conexao-body');
  container.innerHTML =
    '<div class="wpp-sem-instancia">' +
      '<div class="wpp-status-badge wpp-status-badge--desconectado">Sem instancia</div>' +
      '<p style="margin:16px 0 12px;color:var(--text-muted)">Nenhuma instancia encontrada para esta propriedade. Crie uma nova:</p>' +
      '<div class="form-group"><label>Nome da Instancia</label><input type="text" id="wpp-instance-name" value="' + escapeHtml(sugestedName) + '" placeholder="nome-da-instancia"></div>' +
      '<button class="btn btn--primary" onclick="criarInstancia()">Criar Instancia</button>' +
    '</div>';

  $('#wpp-disparo-body').innerHTML = '<p class="placeholder">Crie e conecte uma instancia primeiro</p>';
}

async function renderWppConexaoStatus(instancia) {
  var container = $('#wpp-conexao-body');
  var instanceName = instancia.instanceName || instancia.name || instancia.instance;
  wppInstanciaAtual = instanceName;

  // Check status - use data from instance list first, then try API
  try {
    var status = 'desconectado';
    if (instancia.connected === true) {
      status = 'conectado';
    } else {
      // Try to get detailed status via API
      try {
        var statusData = await evolutionFetch('GET', '/instance/status', null, wppInstanciaToken || undefined);
        var d = statusData.data || statusData;
        if (d.Connected === true || d.connected === true) {
          status = 'conectado';
        }
      } catch(e) {
        // Status check failed, use instance list data
        console.log('Status check falhou, usando dados da listagem:', e.message);
      }
    }

    var statusLabel = { conectado: 'Conectado', desconectado: 'Desconectado', aguardando: 'Aguardando QR Code' };
    var html =
      '<div class="wpp-conexao-info">' +
        '<div class="wpp-conexao-row">' +
          '<span class="wpp-conexao-label">Instancia:</span>' +
          '<span class="wpp-conexao-valor">' + escapeHtml(instanceName) + '</span>' +
        '</div>' +
        '<div class="wpp-conexao-row">' +
          '<span class="wpp-conexao-label">Status:</span>' +
          '<span class="wpp-status-badge wpp-status-badge--' + status + '">' + statusLabel[status] + '</span>' +
        '</div>' +
      '</div>';

    if (status === 'conectado') {
      html += '<div class="wpp-acoes">' +
        '<button class="btn btn--secondary" onclick="desconectarInstancia()">Desconectar</button>' +
        '<button class="btn btn--danger btn--small" onclick="deletarInstancia()">Deletar Instancia</button>' +
      '</div>';
      carregarWppDisparo();
    } else {
      html += '<div id="wpp-qr-area" class="wpp-qr-area">' +
        '<p style="margin-bottom:12px;color:var(--text-muted)">Escaneie o QR Code com o WhatsApp:</p>' +
        '<div id="wpp-qr-container" class="wpp-qr-container"><p class="placeholder">Carregando QR Code...</p></div>' +
      '</div>' +
      '<div class="wpp-acoes">' +
        '<button class="btn btn--primary" onclick="buscarQrCode()">Gerar QR Code</button>' +
        '<button class="btn btn--secondary" onclick="carregarWppConexao()">Atualizar Status</button>' +
        '<button class="btn btn--danger btn--small" onclick="deletarInstancia()">Deletar Instancia</button>' +
      '</div>';
      $('#wpp-disparo-body').innerHTML = '<p class="placeholder">Conecte a instancia escaneando o QR Code</p>';
      buscarQrCode();
    }

    container.innerHTML = html;

  } catch (err) {
    console.error('Erro ao checar status:', err);
    container.innerHTML =
      '<div class="wpp-conexao-info">' +
        '<div class="wpp-conexao-row">' +
          '<span class="wpp-conexao-label">Instancia:</span>' +
          '<span class="wpp-conexao-valor">' + escapeHtml(instanceName) + '</span>' +
        '</div>' +
        '<div class="wpp-conexao-row">' +
          '<span class="wpp-conexao-label">Status:</span>' +
          '<span class="wpp-status-badge wpp-status-badge--desconectado">Erro</span>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:12px;color:var(--danger);margin-top:8px">' + escapeHtml(err.message) + '</p>' +
      '<div class="wpp-acoes"><button class="btn btn--primary" onclick="conectarInstancia()">Tentar Conectar</button></div>';
  }
}

async function criarInstancia() {
  var nome = ($('#wpp-instance-name') || {}).value || '';
  if (!nome.trim()) {
    mostrarToast('Informe o nome da instancia', 'error');
    return;
  }

  try {
    mostrarToast('Criando instancia...');
    var instanceToken = nome.trim() + '-token';
    // Evolution Go: POST /instance/create
    try {
      await evolutionFetch('POST', '/instance/create', {
        name: nome.trim(),
        token: instanceToken,
      });
      mostrarToast('Instancia criada com sucesso!');
    } catch (createErr) {
      // If instance already exists, just connect to it
      if (createErr.message && createErr.message.indexOf('already exists') !== -1) {
        mostrarToast('Instancia ja existe, conectando...');
      } else {
        throw createErr;
      }
    }
    wppInstanciaToken = instanceToken;
    // Save instance name and token to Supabase
    supaFetch('propriedades?id=eq.' + propriedadeFiltro, 'PATCH', {
      evolution_instance_name: nome.trim(),
      evolution_instance_token: instanceToken,
    }).catch(function(e) { console.error('Erro ao salvar config instancia:', e); });
    carregarWppConexao();
  } catch (err) {
    console.error('Erro ao criar instancia:', err);
    mostrarToast('Erro ao criar instancia: ' + err.message, 'error');
  }
}

async function conectarInstancia() {
  if (!wppInstanciaAtual) return;
  try {
    mostrarToast('Conectando instancia...');
    // Evolution Go: POST /instance/connect (uses apikey header to identify instance)
    await evolutionFetch('POST', '/instance/connect', null, wppInstanciaToken || undefined);
    carregarWppConexao();
  } catch (err) {
    console.error('Erro ao conectar:', err);
    mostrarToast('Erro ao conectar: ' + err.message, 'error');
  }
}

async function desconectarInstancia() {
  if (!wppInstanciaAtual) return;
  try {
    // Evolution Go: POST /instance/disconnect
    await evolutionFetch('POST', '/instance/disconnect', null, wppInstanciaToken || undefined);
    mostrarToast('Instancia desconectada');
    carregarWppConexao();
  } catch (err) {
    console.error('Erro ao desconectar:', err);
    mostrarToast('Erro: ' + err.message, 'error');
  }
}

async function deletarInstancia() {
  if (!wppInstanciaAtual) return;
  if (!confirm('Tem certeza que deseja deletar a instancia "' + wppInstanciaAtual + '"? Esta acao nao pode ser desfeita.')) return;
  try {
    // Evolution Go: DELETE /instance/delete/{instanceId}
    var deleteId = wppInstanciaId || wppInstanciaAtual;
    await evolutionFetch('DELETE', '/instance/delete/' + deleteId, null);
    mostrarToast('Instancia deletada');
    wppInstanciaAtual = null;
    carregarWppConexao();
  } catch (err) {
    console.error('Erro ao deletar:', err);
    mostrarToast('Erro: ' + err.message, 'error');
  }
}

async function buscarQrCode() {
  if (!wppInstanciaAtual) return;
  var container = $('#wpp-qr-container');
  if (!container) return;
  container.innerHTML = '<p class="placeholder">Gerando QR Code...</p>';

  try {
    // Evolution Go: first connect, then wait a moment for QR to generate
    try { await evolutionFetch('POST', '/instance/connect', { immediate: true }, wppInstanciaToken || undefined); } catch(e) { console.log('Connect pre-QR:', e.message); }
    // Wait briefly for QR to be generated after connect
    await new Promise(function(r) { setTimeout(r, 2000); });
    var data = await evolutionFetch('GET', '/instance/qr', null, wppInstanciaToken || undefined);
    // Evolution Go response: { data: { Qrcode: "data:image/png;base64,...", Code: "2@..." }, message: "success" }
    var qrData = data && data.data ? data.data : data;
    if (qrData && (qrData.Qrcode || qrData.qrcode)) {
      var src = qrData.Qrcode || qrData.qrcode;
      if (!src.startsWith('data:')) {
        src = 'data:image/png;base64,' + src;
      }
      container.innerHTML = '<img src="' + src + '" alt="QR Code WhatsApp" class="wpp-qr-img">';
    } else if (qrData && (qrData.base64 || qrData.Base64)) {
      var src2 = qrData.base64 || qrData.Base64;
      if (!src2.startsWith('data:')) {
        src2 = 'data:image/png;base64,' + src2;
      }
      container.innerHTML = '<img src="' + src2 + '" alt="QR Code WhatsApp" class="wpp-qr-img">';
    } else if (qrData && (qrData.Code || qrData.code)) {
      container.innerHTML = '<div class="wpp-qr-text"><code>' + escapeHtml(qrData.Code || qrData.code) + '</code></div>';
    } else {
      container.innerHTML = '<p class="placeholder">QR Code nao disponivel. Tente conectar a instancia primeiro.</p>' +
        '<button class="btn btn--secondary btn--small" onclick="conectarInstancia()" style="margin-top:8px">Conectar</button>';
    }
  } catch (err) {
    console.error('Erro ao buscar QR:', err);
    container.innerHTML = '<p class="placeholder" style="color:var(--danger)">Erro ao gerar QR Code</p>' +
      '<button class="btn btn--secondary btn--small" onclick="conectarInstancia()" style="margin-top:8px">Tentar Conectar</button>';
  }
}

async function carregarWppDisparo() {
  var container = $('#wpp-disparo-body');
  if (!wppInstanciaAtual) {
    container.innerHTML = '<p class="placeholder">Conecte uma instancia primeiro</p>';
    return;
  }

  // Check if property has a WhatsApp group configured
  var prop = cachePropriedades.find(function(p) { return String(p.id) === String(propriedadeFiltro); });
  var grupoId = (prop && prop.whatsapp_grupo_id) || '';

  try {
    var pf = propFiltroParam();
    var qs = '?select=id,nome,telefone,whatsapp_jid,funcao,setores(nome)&ativo=eq.true&order=nome.asc';
    if (pf) qs += '&' + pf;
    var colabs = await supaFetch('colaboradores' + qs);

    // Group dispatch section
    var grupoHtml = '';
    if (grupoId) {
      grupoHtml =
        '<div class="wpp-grupo-section">' +
          '<h4 class="wpp-subtitulo">Enviar para Grupo</h4>' +
          '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Grupo configurado: <strong>' + escapeHtml(grupoId) + '</strong></p>' +
          '<div class="form-group">' +
            '<label>Mensagem para o Grupo</label>' +
            '<textarea id="wpp-mensagem-grupo" rows="3" placeholder="Digite a mensagem para o grupo..."></textarea>' +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end">' +
            '<button class="btn btn--primary" onclick="enviarParaGrupoWpp()" id="btn-enviar-grupo">Enviar para Grupo</button>' +
          '</div>' +
        '</div>' +
        '<div class="wpp-divider"></div>';
    } else {
      grupoHtml =
        '<div class="wpp-grupo-section">' +
          '<h4 class="wpp-subtitulo">Enviar para Grupo</h4>' +
          '<p style="font-size:13px;color:var(--text-muted)">Nenhum grupo configurado. Va em <strong>Configuracoes > WhatsApp Grupo ID</strong> para adicionar.</p>' +
        '</div>' +
        '<div class="wpp-divider"></div>';
    }

    // Individual dispatch section
    var colabHtml = '';
    if (!colabs || colabs.length === 0) {
      colabHtml = '<p class="placeholder">Nenhum colaborador ativo encontrado</p>';
    } else {
      var checkboxes = colabs.map(function(c) {
        var tel = c.whatsapp_jid || c.telefone || '';
        var setor = (c.setores && c.setores.nome) || '';
        var disabled = !tel ? ' disabled' : '';
        var semTel = !tel ? ' <span style="color:var(--danger);font-size:11px">(sem telefone)</span>' : '';
        return '<label class="wpp-colab-item' + (disabled ? ' wpp-colab-item--disabled' : '') + '">' +
          '<input type="checkbox" value="' + c.id + '" data-tel="' + escapeHtml(tel) + '" data-nome="' + escapeHtml(c.nome) + '"' + disabled + ' onchange="atualizarContagemWpp()">' +
          '<span class="wpp-colab-nome">' + escapeHtml(c.nome || '--') + semTel + '</span>' +
          '<span class="wpp-colab-setor">' + escapeHtml(setor) + '</span>' +
          '</label>';
      }).join('');

      colabHtml =
        '<h4 class="wpp-subtitulo">Enviar Individual</h4>' +
        '<div class="wpp-disparo-header">' +
          '<button class="btn btn--small btn--secondary" onclick="selecionarTodosWpp(true)">Selecionar Todos</button>' +
          '<button class="btn btn--small btn--secondary" onclick="selecionarTodosWpp(false)">Limpar</button>' +
          '<span class="wpp-colab-count" id="wpp-colab-count">0 selecionados</span>' +
        '</div>' +
        '<div class="wpp-colab-lista">' + checkboxes + '</div>' +
        '<div class="form-group" style="margin-top:16px">' +
          '<label>Mensagem Individual</label>' +
          '<textarea id="wpp-mensagem" rows="4" placeholder="Digite a mensagem para enviar individualmente..."></textarea>' +
        '</div>' +
        '<div class="wpp-disparo-acoes">' +
          '<span class="wpp-disparo-info" id="wpp-disparo-info"></span>' +
          '<button class="btn btn--primary" onclick="enviarDisparoWpp()" id="btn-enviar-wpp">Enviar Mensagens</button>' +
        '</div>';
    }

    container.innerHTML =
      '<div class="wpp-disparo-form">' + grupoHtml + colabHtml + '</div>';

  } catch (err) {
    console.error('Erro ao carregar disparo:', err);
    container.innerHTML = '<p class="placeholder">Erro ao carregar colaboradores</p>';
  }
}

async function enviarParaGrupoWpp() {
  var mensagem = ($('#wpp-mensagem-grupo') || {}).value || '';
  if (!mensagem.trim()) {
    mostrarToast('Digite uma mensagem para o grupo', 'error');
    return;
  }

  var prop = cachePropriedades.find(function(p) { return String(p.id) === String(propriedadeFiltro); });
  var grupoId = (prop && prop.whatsapp_grupo_id) || '';
  if (!grupoId) {
    mostrarToast('Grupo WhatsApp nao configurado', 'error');
    return;
  }

  var btn = $('#btn-enviar-grupo');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    // Evolution Go: POST /send/text (instance identified by apikey header token)
    await evolutionFetch('POST', '/send/text', {
      number: grupoId,
      text: mensagem.trim(),
    }, wppInstanciaToken || undefined);
    mostrarToast('Mensagem enviada para o grupo!');
    if ($('#wpp-mensagem-grupo')) $('#wpp-mensagem-grupo').value = '';
  } catch (err) {
    console.error('Erro ao enviar para grupo:', err);
    mostrarToast('Erro ao enviar: ' + err.message, 'error');
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Enviar para Grupo'; }
}

function atualizarContagemWpp() {
  var checks = document.querySelectorAll('#wpp-disparo-body input[type="checkbox"]:checked');
  var count = checks.length;
  var el = $('#wpp-colab-count');
  if (el) el.textContent = count + ' selecionado' + (count !== 1 ? 's' : '');
}

function selecionarTodosWpp(marcar) {
  var checks = document.querySelectorAll('#wpp-disparo-body input[type="checkbox"]:not(:disabled)');
  checks.forEach(function(cb) { cb.checked = marcar; });
  atualizarContagemWpp();
}

async function enviarDisparoWpp() {
  var mensagem = ($('#wpp-mensagem') || {}).value || '';
  if (!mensagem.trim()) {
    mostrarToast('Digite uma mensagem', 'error');
    return;
  }

  var checks = document.querySelectorAll('#wpp-disparo-body input[type="checkbox"]:checked');
  if (checks.length === 0) {
    mostrarToast('Selecione pelo menos um colaborador', 'error');
    return;
  }

  var destinatarios = [];
  checks.forEach(function(cb) {
    destinatarios.push({
      id: cb.value,
      tel: cb.dataset.tel,
      nome: cb.dataset.nome,
    });
  });

  var btn = $('#btn-enviar-wpp');
  var info = $('#wpp-disparo-info');
  if (btn) btn.disabled = true;
  if (btn) btn.textContent = 'Enviando...';

  var enviados = 0;
  var erros = 0;

  for (var i = 0; i < destinatarios.length; i++) {
    var dest = destinatarios[i];
    if (info) info.textContent = 'Enviando ' + (i + 1) + '/' + destinatarios.length + ' - ' + dest.nome;

    try {
      // Format phone number - remove non-digits, ensure country code
      var numero = dest.tel.replace(/[^0-9]/g, '');
      if (numero.length === 11 && numero.startsWith('0')) {
        numero = '55' + numero.substring(1);
      } else if (numero.length === 11 || numero.length === 10) {
        numero = '55' + numero;
      }

      // Evolution Go: POST /send/text
      await evolutionFetch('POST', '/send/text', {
        number: numero,
        text: mensagem.trim(),
      }, wppInstanciaToken || undefined);
      enviados++;
    } catch (err) {
      console.error('Erro ao enviar para ' + dest.nome + ':', err);
      erros++;
    }

    // Small delay between messages to avoid rate limiting
    if (i < destinatarios.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, 1500); });
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Enviar Mensagens'; }
  if (info) info.textContent = '';

  if (erros === 0) {
    mostrarToast('Todas as ' + enviados + ' mensagens enviadas!');
  } else {
    mostrarToast(enviados + ' enviadas, ' + erros + ' com erro', erros > 0 ? 'error' : 'success');
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
      { chave: 'nome', label: 'Nome da Propriedade', valor: prop.nome || '', section: 'geral' },
      { chave: 'slug', label: 'Slug', valor: prop.slug || '', section: 'geral' },
      { chave: 'telegram_bot_token', label: 'Telegram Bot Token', valor: prop.telegram_bot_token || '', sensitive: true, section: 'telegram' },
      { chave: 'telegram_chat_id', label: 'Telegram Chat ID', valor: prop.telegram_chat_id || '', section: 'telegram' },
      { chave: 'telegram_grupo_id', label: 'Telegram Grupo ID', valor: prop.telegram_grupo_id || '', section: 'telegram', placeholder: 'Ex: -1001234567890 (ID do grupo)' },
      { chave: 'evolution_api_url', label: 'Evolution API URL', valor: prop.evolution_api_url || '', section: 'whatsapp', placeholder: 'https://apiwhats.sitiolabareda.com' },
      { chave: 'evolution_api_key', label: 'Evolution API Key', valor: prop.evolution_api_key || '', sensitive: true, section: 'whatsapp' },
      { chave: 'evolution_instance_name', label: 'Nome da Instancia WhatsApp', valor: prop.evolution_instance_name || '', section: 'whatsapp', placeholder: 'Ex: labareda-gestao' },
      { chave: 'evolution_instance_token', label: 'Token da Instancia (auto)', valor: prop.evolution_instance_token || '', section: 'whatsapp', placeholder: 'Preenchido automaticamente ao conectar' },
      { chave: 'whatsapp_grupo_id', label: 'WhatsApp Grupo ID', valor: prop.whatsapp_grupo_id || '', section: 'whatsapp', placeholder: 'Ex: 5511999999999-1234567890@g.us' },
      { chave: 'relatorio_dia_semana', label: 'Dia do Relatorio', valor: prop.relatorio_dia_semana || '', section: 'config' },
      { chave: 'relatorio_hora', label: 'Hora do Relatorio', valor: prop.relatorio_hora || '', section: 'config' },
      { chave: 'lembrete_hora', label: 'Hora do Lembrete', valor: prop.lembrete_hora || '', section: 'config' },
    ];

    var sections = {
      geral: 'Dados Gerais',
      telegram: 'Telegram Bot',
      whatsapp: 'WhatsApp (Evolution API)',
      config: 'Agendamentos',
    };

    var html = '<form id="form-config-prop" class="config-prop-form">';
    var currentSection = '';
    campos.forEach(function(c) {
      if (c.section !== currentSection) {
        currentSection = c.section;
        html += '<h4 class="config-section-title">' + sections[currentSection] + '</h4>';
      }
      var placeholder = c.placeholder ? ' placeholder="' + escapeHtml(c.placeholder) + '"' : '';
      html += '<div class="form-group">' +
        '<label>' + escapeHtml(c.label) + '</label>' +
        '<input type="text" id="config-prop-' + c.chave + '" value="' + escapeHtml(c.valor) + '" data-campo="' + c.chave + '"' + placeholder + '>' +
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
    if (modalModo === 'rotina-item-novo') {
      await salvarItemRotina();
      return;
    }
    if (modalModo === 'colaborador-novo' || modalModo === 'colaborador-editar') {
      var nome = (($('#campo-nome') || {}).value || '').trim();
      var email = (($('#campo-email') || {}).value || '').trim();
      var telefoneRaw = (($('#campo-telefone') || {}).value || '').trim();
      var funcao = (($('#campo-funcao') || {}).value || '').trim();

      var setorId = ($('#campo-setor') || {}).value || '';
      var propriedadeId = ($('#campo-propriedade') || {}).value || '';

      // Validacoes — campos obrigatorios no banco
      if (!nome) { mostrarToast('Nome e obrigatorio', 'error'); return; }
      if (!telefoneRaw) { mostrarToast('Telefone e obrigatorio', 'error'); return; }
      if (!funcao) { mostrarToast('Funcao e obrigatoria', 'error'); return; }
      if (!setorId) { mostrarToast('Setor e obrigatorio', 'error'); return; }
      if (!propriedadeId) { mostrarToast('Propriedade e obrigatoria', 'error'); return; }

      // Formatar telefone: garantir formato +XXXXXXXXXXX
      var digits = telefoneRaw.replace(/[^0-9]/g, '');
      if (!telefoneRaw.startsWith('+')) {
        if (digits.length === 11 || digits.length === 10) {
          digits = '55' + digits;
        }
      }
      if (digits.length < 10 || digits.length > 15) {
        mostrarToast('Telefone invalido. Use formato: +5511999999999', 'error');
        return;
      }
      var telefone = '+' + digits;

      var body = {
        nome: nome,
        email: email || null,
        telefone: telefone,
        funcao: funcao,
        setor_id: setorId,
        propriedade_id: propriedadeId,
      };


      // Handle password
      var senha = (($('#campo-senha') || {}).value || '').trim();
      if (senha) {
        body.senha_hash = senha;
      }

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

    } else if (modalModo === 'tarefa-nova' || modalModo === 'tarefa-editar') {
      var desc = (($('#campo-tarefa-desc') || {}).value || '').trim();
      var setorId = ($('#campo-tarefa-setor') || {}).value || '';
      var propId = ($('#campo-tarefa-prop') || {}).value || '';
      var prio = ($('#campo-tarefa-prio') || {}).value || 'normal';
      var dataLimite = ($('#campo-tarefa-data') || {}).value || null;
      var responsavelId = ($('#campo-tarefa-responsavel') || {}).value || null;

      if (!desc) { mostrarToast('Descricao e obrigatoria', 'error'); return; }
      if (!setorId) { mostrarToast('Setor e obrigatorio', 'error'); return; }
      if (!propId) { mostrarToast('Propriedade e obrigatoria', 'error'); return; }

      var setorNome = '';
      for (var s = 0; s < cacheSetores.length; s++) {
        if (cacheSetores[s].id === setorId) { setorNome = cacheSetores[s].nome; break; }
      }

      var body = {
        comando_original: desc,
        setor_id: setorId,
        setor_interpretado: setorNome,
        propriedade_id: propId,
        prioridade: prio,
        data_limite: dataLimite || null,
        origem: 'dashboard',
        responsavel_id: responsavelId || null,
      };

      if (modalModo === 'tarefa-editar') {
        var statusEditar = ($('#campo-tarefa-status') || {}).value;
        if (statusEditar) {
          body.status = statusEditar;
          if (statusEditar === 'concluida') body.concluida_at = new Date().toISOString();
          else body.concluida_at = null;
        }
      }

      if (modalModo === 'tarefa-nova') {
        var result = await supaInsert('tarefas', body);
        mostrarToast('Tarefa criada com sucesso');

        if (result && result.length > 0) {
          var novaTarefaId = result[0].id;

          // Buscar colaboradores do setor para atribuir checklist_items
          var colabsDoSetor = await supaFetch(
            'colaboradores?propriedade_id=eq.' + propId +
            '&setor_id=eq.' + setorId + '&ativo=eq.true&select=id'
          );

          if (checklistModalItems.length > 0) {
            // Criar checklist items definidos pelo usuario
            for (var ci = 0; ci < checklistModalItems.length; ci++) {
              if (responsavelId) {
                // Responsavel especifico
                await supaInsert('checklist_items', {
                  tarefa_id: novaTarefaId,
                  propriedade_id: propId,
                  descricao: checklistModalItems[ci],
                  ordem: ci + 1,
                  status: 'pendente',
                  colaborador_id: responsavelId,
                });
              } else if (colabsDoSetor && colabsDoSetor.length > 0) {
                // Sem responsavel: atribuir a todos do setor
                for (var ck = 0; ck < colabsDoSetor.length; ck++) {
                  await supaInsert('checklist_items', {
                    tarefa_id: novaTarefaId,
                    propriedade_id: propId,
                    descricao: checklistModalItems[ci],
                    ordem: ci + 1,
                    status: 'pendente',
                    colaborador_id: colabsDoSetor[ck].id,
                  });
                }
              }
            }
            checklistModalItems = [];
          } else {
            // Sem checklist manual: criar 1 item por colaborador do setor
            if (responsavelId) {
              await supaInsert('checklist_items', {
                tarefa_id: novaTarefaId,
                propriedade_id: propId,
                descricao: desc,
                ordem: 1,
                status: 'pendente',
                colaborador_id: responsavelId,
              });
            } else if (colabsDoSetor && colabsDoSetor.length > 0) {
              for (var ck = 0; ck < colabsDoSetor.length; ck++) {
                await supaInsert('checklist_items', {
                  tarefa_id: novaTarefaId,
                  propriedade_id: propId,
                  descricao: desc,
                  ordem: 1,
                  status: 'pendente',
                  colaborador_id: colabsDoSetor[ck].id,
                });
              }
            }
          }
        }

        // Disparar WhatsApp direto para cada colaborador atribuido
        try {
          var colabsNotificar = [];
          if (responsavelId) {
            // Responsavel especifico
            var rc = await supaFetch('colaboradores?id=eq.' + responsavelId + '&select=nome,telefone,email,senha_hash');
            if (rc && rc.length > 0) colabsNotificar.push(rc[0]);
          } else if (colabsDoSetor && colabsDoSetor.length > 0) {
            // Todos do setor
            var ids = colabsDoSetor.map(function(c) { return c.id; }).join(',');
            var rc = await supaFetch('colaboradores?id=in.(' + ids + ')&select=nome,telefone,email,senha_hash');
            if (rc) colabsNotificar = rc;
          }

          var itensTexto = checklistModalItems.length > 0
            ? checklistModalItems.map(function(it, i) { return '  ' + (i+1) + '. ' + it; }).join('\n')
            : '  1. ' + desc;

          for (var wi = 0; wi < colabsNotificar.length; wi++) {
            var colab = colabsNotificar[wi];
            var tel = (colab.telefone || '').replace(/\D/g, '');
            if (!tel || tel.includes('00000000')) continue;
            if (!tel.startsWith('55')) tel = '55' + tel;

            var msg = '\u{1f4cb} Ola ' + colab.nome + '!\n\nVoce tem uma nova tarefa:\n\n' + itensTexto + '\n\n\u{1f449} Acesse seu painel:\nhttps://sitiolabareda.com/painel\n\n\u{1f511} Email: ' + (colab.email || '') + '\n\u{1f511} Senha: ' + (colab.senha_hash || '');

            fetch('https://n8n.sitiolabareda.com/webhook/whatsapp-envio-direto', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ telefone: tel, mensagem: msg }),
            }).catch(function(e) { console.log('WhatsApp:', e.message); });
          }
        } catch(e) { console.log('Erro WhatsApp:', e); }
      } else {
        await supaUpdate('tarefas', modalItemId, body);
        mostrarToast('Tarefa atualizada');
      }

      fecharModal();
      carregarTarefas();

    } else if (modalModo === 'rotina-nova' || modalModo === 'rotina-editar') {
      var rNome = (($('#campo-rotina-nome') || {}).value || '').trim();
      var rSetor = ($('#campo-rotina-setor') || {}).value || '';
      var rDia = ($('#campo-rotina-dia') || {}).value;
      var rHora = ($('#campo-rotina-hora') || {}).value || '07:00';
      var rDesc = (($('#campo-rotina-desc') || {}).value || '').trim();

      if (!rNome) { mostrarToast('Nome e obrigatorio', 'error'); return; }
      if (!rSetor) { mostrarToast('Setor e obrigatorio', 'error'); return; }

      var rBody = {
        nome: rNome,
        setor_id: rSetor,
        dia_semana: parseInt(rDia),
        hora_disparo: rHora,
        descricao: rDesc || null,
        propriedade_id: propriedadeFiltro,
      };

      if (modalModo === 'rotina-nova') {
        rBody.ativo = true;
        await supaInsert('rotinas_semanais', rBody);
        mostrarToast('Rotina criada com sucesso');
      } else {
        await supaUpdate('rotinas_semanais', modalItemId, rBody);
        mostrarToast('Rotina atualizada');
      }

      fecharModal();
      carregarRotinas();

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

function modalOverlayMouseDown(event) {
  // Nao fecha ao clicar fora — so pelo botao Cancelar/Fechar
}

function fecharModal() {
  $('#modal-overlay').classList.add('escondido');
  modalModo = null;
  modalItemId = null;
}

/* ================================================================== */
/*  INICIALIZACAO                                                     */
/* ================================================================== */
async function initDashboard() {
  try {
    cachePropriedades = await supaFetch('propriedades?select=*');
    if (cacheSetores.length === 0) {
      cacheSetores = await supaFetch('setores?select=*');
    }
    var selectProp = $('#filtro-propriedade');

    // Clear existing options (except "Todas")
    while (selectProp.options.length > 1) {
      selectProp.remove(1);
    }

    cachePropriedades.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nome;
      selectProp.appendChild(opt);
    });

    aplicarRestricaoRole();
    navegarPara('visao-geral');

  } catch (err) {
    console.error('Erro na inicializacao:', err);
    mostrarToast('Erro ao conectar com o banco de dados', 'error');
    navegarPara('visao-geral');
  }
}

function init() {
  if (verificarSessao()) {
    mostrarApp();
    initDashboard();
  } else {
    mostrarLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);

/* ================================================================== */
/*  GASTOS                                                            */
/* ================================================================== */
async function carregarGastos() {
  try {
    var qs = '?select=*,colaboradores:colaborador_id(nome)&order=data.desc,created_at.desc';
    qs = addPropFiltro(qs);

    var tipoFiltro = document.getElementById('filtro-gasto-tipo');
    if (tipoFiltro && tipoFiltro.value) {
      qs += '&tipo=eq.' + tipoFiltro.value;
    }

    var mesFiltro = document.getElementById('filtro-gasto-mes');
    if (mesFiltro && mesFiltro.value) {
      var [ano, mes] = mesFiltro.value.split('-');
      var inicio = ano + '-' + mes + '-01';
      var ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
      var fim = ano + '-' + mes + '-' + String(ultimoDia).padStart(2, '0');
      qs += '&data=gte.' + inicio + '&data=lte.' + fim;
    }

    var data = await supaFetch('gastos' + qs);
    var tbody = document.getElementById('tbody-gastos');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Nenhum gasto encontrado</td></tr>';
      document.getElementById('gastos-resumo').innerHTML = '';
      return;
    }

    var totalEntradas = 0;
    var totalSaidas = 0;

    tbody.innerHTML = data.map(function(g) {
      if (g.tipo === 'entrada') totalEntradas += parseFloat(g.valor) || 0;
      else totalSaidas += parseFloat(g.valor) || 0;

      var colabNome = (g.colaboradores && g.colaboradores.nome) || '--';
      var tipoClass = g.tipo === 'entrada' ? 'badge--concluida' : 'badge--pendente';
      var tipoLabel = g.tipo === 'entrada' ? 'Entrada' : 'Saida';

      return '<tr>' +
        '<td>' + formatarData(g.data) + '</td>' +
        '<td><span class="badge ' + tipoClass + '">' + tipoLabel + '</span></td>' +
        '<td>' + escapeHtml(g.descricao) + '</td>' +
        '<td>R$ ' + parseFloat(g.valor).toFixed(2) + '</td>' +
        '<td>' + escapeHtml(colabNome) + '</td>' +
        '<td><button class="btn btn--small btn--danger" onclick="excluirGasto(\'' + g.id + '\')">Excluir</button></td>' +
        '</tr>';
    }).join('');

    var saldo = totalEntradas - totalSaidas;
    var saldoClass = saldo >= 0 ? 'color: var(--success)' : 'color: var(--pending-text)';
    document.getElementById('gastos-resumo').innerHTML =
      '<div style="display:flex;gap:24px;padding:16px 0;font-weight:600">' +
        '<span style="color:var(--success)">Entradas: R$ ' + totalEntradas.toFixed(2) + '</span>' +
        '<span style="color:var(--pending-text)">Saidas: R$ ' + totalSaidas.toFixed(2) + '</span>' +
        '<span style="' + saldoClass + '">Saldo: R$ ' + saldo.toFixed(2) + '</span>' +
      '</div>';

  } catch (err) {
    console.error('Erro ao carregar gastos:', err);
    mostrarToast('Erro ao carregar gastos', 'error');
  }
}

function abrirModalGasto() {
  modalModo = 'criar';
  document.getElementById('modal-titulo').textContent = 'Novo Gasto';

  var colabOptions = '<option value="">-- Selecione --</option>';
  // Will be populated after fetch

  var hoje = new Date().toISOString().split('T')[0];

  document.getElementById('modal-body').innerHTML =
    '<div class="form-group"><label>Tipo</label>' +
    '<select id="gasto-tipo" class="input"><option value="saida">Saida</option><option value="entrada">Entrada</option></select></div>' +
    '<div class="form-group"><label>Descricao</label><input id="gasto-descricao" class="input" placeholder="Ex: Gasolina 50 reais"></div>' +
    '<div class="form-group"><label>Valor (R$)</label><input id="gasto-valor" class="input" type="number" step="0.01" min="0"></div>' +
    '<div class="form-group"><label>Data</label><input id="gasto-data" class="input" type="date" value="' + hoje + '"></div>' +
    '<div class="form-group"><label>Categoria (opcional)</label><input id="gasto-categoria" class="input" placeholder="Ex: combustivel, racao"></div>' +
    '<div class="form-group"><label>Colaborador</label><select id="gasto-colaborador" class="input"><option value="">Carregando...</option></select></div>' +
    '<div class="form-group"><label>Observacao</label><textarea id="gasto-obs" class="input" rows="2"></textarea></div>';

  document.getElementById('modal-btn-salvar').onclick = salvarGasto;
  document.getElementById('modal-overlay').classList.remove('escondido');

  // Carregar colaboradores no select
  var qs = '?select=id,nome&ativo=eq.true&order=nome.asc';
  qs = addPropFiltro(qs);
  supaFetch('colaboradores' + qs).then(function(colabs) {
    var sel = document.getElementById('gasto-colaborador');
    sel.innerHTML = '<option value="">-- Selecione --</option>';
    colabs.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      sel.appendChild(opt);
    });
  });
}

async function salvarGasto() {
  var tipo = document.getElementById('gasto-tipo').value;
  var descricao = document.getElementById('gasto-descricao').value.trim();
  var valor = parseFloat(document.getElementById('gasto-valor').value);
  var data = document.getElementById('gasto-data').value;
  var categoria = document.getElementById('gasto-categoria').value.trim();
  var colaboradorId = document.getElementById('gasto-colaborador').value;
  var obs = document.getElementById('gasto-obs').value.trim();

  if (!descricao || !valor || !data) {
    mostrarToast('Preencha descricao, valor e data', 'error');
    return;
  }

  try {
    var payload = {
      tipo: tipo,
      descricao: descricao,
      valor: valor,
      data: data,
      categoria: categoria || null,
      colaborador_id: colaboradorId || null,
      observacao: obs || null,
      propriedade_id: propriedadeFiltro !== 'todas' ? propriedadeFiltro : cachePropriedades[0].id,
    };

    await supaInsert('gastos', payload);
    fecharModal();
    carregarGastos();
    mostrarToast('Gasto registrado!');
  } catch (err) {
    console.error('Erro ao salvar gasto:', err);
    mostrarToast('Erro ao salvar gasto', 'error');
  }
}

async function excluirGasto(id) {
  if (!confirm('Excluir este gasto?')) return;
  try {
    var url = CONFIG.SUPABASE_URL + '/rest/v1/gastos?id=eq.' + id;
    var r = await fetch(url, { method: 'DELETE', headers: apiHeaders('return=minimal') });
    if (!r.ok) throw new Error('Erro');
    carregarGastos();
    mostrarToast('Gasto excluido');
  } catch (err) {
    mostrarToast('Erro ao excluir', 'error');
  }
}

/* ================================================================== */
/*  VEICULOS                                                          */
/* ================================================================== */
async function carregarVeiculos() {
  try {
    // Veiculos
    var qsV = '?select=*&order=nome.asc';
    qsV = addPropFiltro(qsV);
    var veiculos = await supaFetch('veiculos' + qsV);

    var container = document.getElementById('lista-veiculos');
    if (!veiculos || veiculos.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhum veiculo cadastrado</p>';
    } else {
      container.innerHTML = veiculos.map(function(v) {
        return '<div class="lista-simples__item" style="display:flex;align-items:center;gap:12px;padding:12px">' +
          '<span style="font-size:24px">🚗</span>' +
          '<div style="flex:1">' +
            '<strong>' + escapeHtml(v.nome) + '</strong>' +
            (v.placa ? ' <small style="color:var(--text-muted)">(' + escapeHtml(v.placa) + ')</small>' : '') +
            (v.km_atual ? '<br><small>KM atual: ' + v.km_atual + '</small>' : '') +
          '</div>' +
          '<span class="badge badge--' + (v.ativo ? 'concluida' : 'pendente') + '">' + (v.ativo ? 'Ativo' : 'Inativo') + '</span>' +
        '</div>';
      }).join('');
    }

    // Uso de veiculos
    var qsU = '?select=*,veiculos:veiculo_id(nome),colaboradores:colaborador_id(nome)&order=saida_at.desc&limit=20';
    qsU = addPropFiltro(qsU);
    var usos = await supaFetch('veiculos_uso' + qsU);

    var tbodyUso = document.getElementById('tbody-veiculos-uso');
    if (!usos || usos.length === 0) {
      tbodyUso.innerHTML = '<tr><td colspan="7" class="placeholder">Nenhum registro de uso</td></tr>';
    } else {
      tbodyUso.innerHTML = usos.map(function(u) {
        var veiculoNome = (u.veiculos && u.veiculos.nome) || '--';
        var colabNome = (u.colaboradores && u.colaboradores.nome) || '--';
        var saida = u.saida_at ? new Date(u.saida_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '--';
        var emUso = !u.entrada_at;
        var entrada = u.entrada_at ? new Date(u.entrada_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '<button class="btn btn--small btn--secondary" onclick="abrirModalEntradaVeiculo(\'' + u.id + '\', \'' + escapeHtml(veiculoNome) + '\', ' + (u.km_saida || 0) + ')">Registrar Entrada</button>';
        return '<tr' + (emUso ? ' style="background:var(--bg-warning, #fff8e1)"' : '') + '>' +
          '<td>' + escapeHtml(veiculoNome) + '</td>' +
          '<td>' + escapeHtml(colabNome) + '</td>' +
          '<td>' + escapeHtml(u.destino || '--') + '</td>' +
          '<td>' + (u.km_saida || '--') + '</td>' +
          '<td>' + (u.km_entrada || '--') + '</td>' +
          '<td>' + saida + '</td>' +
          '<td>' + entrada + '</td>' +
        '</tr>';
      }).join('');
    }

  } catch (err) {
    console.error('Erro ao carregar veiculos:', err);
    mostrarToast('Erro ao carregar veiculos', 'error');
  }
}

function abrirModalVeiculo() {
  modalModo = 'criar';
  document.getElementById('modal-titulo').textContent = 'Novo Veiculo';

  document.getElementById('modal-body').innerHTML =
    '<div class="form-group"><label>Nome</label><input id="veiculo-nome" class="input" placeholder="Ex: Hilux, Moto"></div>' +
    '<div class="form-group"><label>Placa (opcional)</label><input id="veiculo-placa" class="input" placeholder="ABC-1234"></div>' +
    '<div class="form-group"><label>KM Atual</label><input id="veiculo-km" class="input" type="number" step="0.1"></div>';

  document.getElementById('modal-btn-salvar').onclick = salvarVeiculo;
  document.getElementById('modal-overlay').classList.remove('escondido');
}

async function salvarVeiculo() {
  var nome = document.getElementById('veiculo-nome').value.trim();
  if (!nome) { mostrarToast('Preencha o nome', 'error'); return; }

  try {
    await supaInsert('veiculos', {
      nome: nome,
      placa: document.getElementById('veiculo-placa').value.trim() || null,
      km_atual: parseFloat(document.getElementById('veiculo-km').value) || null,
      propriedade_id: propriedadeFiltro !== 'todas' ? propriedadeFiltro : cachePropriedades[0].id,
    });
    fecharModal();
    carregarVeiculos();
    mostrarToast('Veiculo cadastrado!');
  } catch (err) {
    mostrarToast('Erro ao salvar veiculo', 'error');
  }
}

function abrirModalUsoVeiculo() {
  modalModo = 'criar';
  document.getElementById('modal-titulo').textContent = 'Registrar Uso de Veiculo';

  document.getElementById('modal-body').innerHTML =
    '<div class="form-group"><label>Veiculo</label><select id="uso-veiculo" class="input"><option>Carregando...</option></select></div>' +
    '<div class="form-group"><label>Colaborador</label><select id="uso-colaborador" class="input"><option>Carregando...</option></select></div>' +
    '<div class="form-group"><label>Destino</label><input id="uso-destino" class="input" placeholder="Para onde"></div>' +
    '<div class="form-group"><label>KM Saida</label><input id="uso-km-saida" class="input" type="number" step="0.1"></div>';

  document.getElementById('modal-btn-salvar').onclick = salvarUsoVeiculo;
  document.getElementById('modal-overlay').classList.remove('escondido');

  var qsV = '?select=id,nome,km_atual&ativo=eq.true&order=nome.asc';
  var qsC = '?select=id,nome&ativo=eq.true&order=nome.asc';
  qsV = addPropFiltro(qsV);
  qsC = addPropFiltro(qsC);

  var cacheVeiculosKm = {};

  Promise.all([supaFetch('veiculos' + qsV), supaFetch('colaboradores' + qsC)]).then(function(r) {
    var selV = document.getElementById('uso-veiculo');
    selV.innerHTML = '<option value="">-- Selecione --</option>';
    r[0].forEach(function(v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.nome + (v.km_atual ? ' (KM: ' + v.km_atual + ')' : '');
      selV.appendChild(opt);
      cacheVeiculosKm[v.id] = v.km_atual || '';
    });

    // Ao selecionar veiculo, preenche KM Saida com ultimo KM
    selV.addEventListener('change', function() {
      var kmInput = document.getElementById('uso-km-saida');
      var km = cacheVeiculosKm[selV.value];
      if (km) {
        kmInput.value = km;
      } else {
        kmInput.value = '';
      }
    });

    var selC = document.getElementById('uso-colaborador');
    selC.innerHTML = '<option value="">-- Selecione --</option>';
    r[1].forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      selC.appendChild(opt);
    });
  });
}

function abrirModalEntradaVeiculo(usoId, veiculoNome, kmSaida) {
  modalModo = 'editar';
  document.getElementById('modal-titulo').textContent = 'Registrar Entrada — ' + veiculoNome;

  document.getElementById('modal-body').innerHTML =
    '<div class="form-group"><label>KM Entrada</label><input id="entrada-km" class="input" type="number" step="0.1" placeholder="KM ao retornar" min="' + kmSaida + '"></div>' +
    '<p style="color:var(--text-muted);font-size:13px">KM de saida: ' + kmSaida + '</p>';

  document.getElementById('modal-btn-salvar').onclick = function() { salvarEntradaVeiculo(usoId); };
  document.getElementById('modal-overlay').classList.remove('escondido');

  setTimeout(function() { document.getElementById('entrada-km').focus(); }, 100);
}

async function salvarEntradaVeiculo(usoId) {
  var kmEntrada = parseFloat(document.getElementById('entrada-km').value);
  if (!kmEntrada) {
    mostrarToast('Preencha o KM de entrada', 'error');
    return;
  }

  try {
    await supaUpdate('veiculos_uso', usoId, {
      km_entrada: kmEntrada,
      entrada_at: new Date().toISOString(),
    });

    // Atualiza km_atual do veiculo
    var uso = await supaFetch('veiculos_uso?id=eq.' + usoId + '&select=veiculo_id');
    if (uso && uso.length > 0) {
      await supaUpdate('veiculos', uso[0].veiculo_id, { km_atual: kmEntrada });
    }

    fecharModal();
    carregarVeiculos();
    mostrarToast('Entrada registrada!');
  } catch (err) {
    mostrarToast('Erro ao registrar entrada', 'error');
  }
}

async function salvarUsoVeiculo() {
  var veiculoId = document.getElementById('uso-veiculo').value;
  var colaboradorId = document.getElementById('uso-colaborador').value;
  if (!veiculoId || !colaboradorId) {
    mostrarToast('Selecione veiculo e colaborador', 'error');
    return;
  }

  try {
    var kmSaida = parseFloat(document.getElementById('uso-km-saida').value) || null;
    await supaInsert('veiculos_uso', {
      veiculo_id: veiculoId,
      colaborador_id: colaboradorId,
      destino: document.getElementById('uso-destino').value.trim() || null,
      km_saida: kmSaida,
      propriedade_id: propriedadeFiltro !== 'todas' ? propriedadeFiltro : cachePropriedades[0].id,
    });

    // Atualiza km_atual do veiculo com o KM de saida
    if (kmSaida) {
      await supaUpdate('veiculos', veiculoId, { km_atual: kmSaida });
    }

    fecharModal();
    carregarVeiculos();
    mostrarToast('Uso registrado!');
  } catch (err) {
    mostrarToast('Erro ao registrar uso', 'error');
  }
}
