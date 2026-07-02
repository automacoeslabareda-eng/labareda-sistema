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
    case 'whatsapp':       carregarWhatsApp(); break;
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
    '<div class="form-group"><label>Nome *</label><input type="text" id="campo-nome" placeholder="Nome completo" required></div>' +
    '<div class="form-group"><label>Email</label><input type="email" id="campo-email" placeholder="email@exemplo.com"></div>' +
    senhaHtml +
    '<div class="form-group"><label>Telefone *</label><input type="tel" id="campo-telefone" placeholder="+5573999999999" required></div>' +
    '<div class="form-group"><label>WhatsApp</label><input type="tel" id="campo-whatsapp" placeholder="+5511999999999 (se diferente do telefone)"></div>' +
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
/*  WHATSAPP — EVOLUTION API                                          */
/* ================================================================== */
var wppInstanciaAtual = null;
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
  };
}

async function evolutionFetch(method, path, body) {
  var cfg = getEvolutionConfig();
  if (!cfg) throw new Error('Evolution API nao configurada para esta propriedade');
  var url = cfg.url + path;
  var opts = {
    method: method,
    headers: {
      'apikey': cfg.key,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(url, opts);
  if (!r.ok) {
    var txt = await r.text();
    throw new Error('Evolution API ' + method + ' ' + path + ': ' + r.status + ' ' + txt);
  }
  return r.json();
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
    var instances = await evolutionFetch('GET', '/instance/all');
    var instanciaSlug = cfg.slug.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Find instance for this property
    var instancia = null;
    if (Array.isArray(instances)) {
      instancia = instances.find(function(i) {
        var name = (i.instanceName || i.name || i.instance || '').toLowerCase();
        return name === instanciaSlug || name.indexOf(instanciaSlug) !== -1;
      });
    }

    if (instancia) {
      wppInstanciaAtual = instancia.instanceName || instancia.name || instancia.instance;
      renderWppConexaoStatus(instancia);
    } else {
      wppInstanciaAtual = null;
      renderWppSemInstancia(instanciaSlug);
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

  // Check detailed status
  try {
    var statusData = await evolutionFetch('GET', '/instance/status?instanceName=' + encodeURIComponent(instanceName));
    var status = 'desconectado';
    if (statusData) {
      var s = (statusData.state || statusData.status || statusData.connectionStatus || '').toLowerCase();
      if (s === 'open' || s === 'connected' || s === 'online') {
        status = 'conectado';
      } else if (s === 'connecting' || s === 'qr') {
        status = 'aguardando';
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
    await evolutionFetch('POST', '/instance/create', {
      instanceName: nome.trim(),
      integration: 'WHATSAPP-BAILEYS',
    });
    mostrarToast('Instancia criada com sucesso!');
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
    await evolutionFetch('POST', '/instance/connect', {
      instanceName: wppInstanciaAtual,
    });
    carregarWppConexao();
  } catch (err) {
    console.error('Erro ao conectar:', err);
    mostrarToast('Erro ao conectar: ' + err.message, 'error');
  }
}

async function desconectarInstancia() {
  if (!wppInstanciaAtual) return;
  try {
    await evolutionFetch('POST', '/instance/disconnect?instanceName=' + encodeURIComponent(wppInstanciaAtual));
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
    await evolutionFetch('DELETE', '/instance/delete/' + encodeURIComponent(wppInstanciaAtual));
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
    var data = await evolutionFetch('GET', '/instance/qr?instanceName=' + encodeURIComponent(wppInstanciaAtual));
    if (data && data.qrcode) {
      // qrcode can be a base64 image or a data URL
      var src = data.qrcode;
      if (!src.startsWith('data:')) {
        src = 'data:image/png;base64,' + src;
      }
      container.innerHTML = '<img src="' + src + '" alt="QR Code WhatsApp" class="wpp-qr-img">';
    } else if (data && data.base64) {
      var src2 = data.base64;
      if (!src2.startsWith('data:')) {
        src2 = 'data:image/png;base64,' + src2;
      }
      container.innerHTML = '<img src="' + src2 + '" alt="QR Code WhatsApp" class="wpp-qr-img">';
    } else if (data && data.code) {
      container.innerHTML = '<div class="wpp-qr-text"><code>' + escapeHtml(data.code) + '</code></div>';
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
    await evolutionFetch('POST', '/send/media', {
      instanceName: wppInstanciaAtual,
      number: grupoId,
      mediatype: 'text',
      caption: mensagem.trim(),
    });
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

      await evolutionFetch('POST', '/send/media', {
        instanceName: wppInstanciaAtual,
        number: numero,
        mediatype: 'text',
        caption: mensagem.trim(),
      });
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
      { chave: 'evolution_instance_name', label: 'Nome da Instancia WhatsApp', valor: prop.evolution_instance_name || '', section: 'whatsapp', placeholder: 'Ex: labareda' },
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

      // Handle WhatsApp
      var wpp = (($('#campo-whatsapp') || {}).value || '').trim();
      if (wpp) {
        body.whatsapp_jid = wpp;
      }

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
async function initDashboard() {
  try {
    cachePropriedades = await supaFetch('propriedades?select=*');
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
