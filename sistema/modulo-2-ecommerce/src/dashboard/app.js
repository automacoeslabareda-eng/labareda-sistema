/**
 * Labareda Shop — Dashboard E-commerce
 * Conecta SOMENTE ao banco de e-commerce.
 *
 * Campos bilingues: nome_pt/nome_en, descricao_pt/descricao_en, etc.
 * Imagens: upload para Supabase Storage (bucket "imagens")
 */

/* ================================================================== */
/*  CONFIGURACAO                                                      */
/* ================================================================== */
var CONFIG = {
  SUPABASE_URL: 'https://wgvqiguebiqhubhtwfhz.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndndnFpZ3VlYmlxaHViaHR3Zmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjE1NTIsImV4cCI6MjA5ODQ5NzU1Mn0.FEALNU6X_sXkJlaXlfLizkzGUI8kD6TbIU88LmAyn7w',
};

/* ================================================================== */
/*  ESTADO GLOBAL                                                     */
/* ================================================================== */
var paginaAtual = 'visao-geral';
var modalModo = null;
var modalItemId = null;
var cacheCategorias = [];
var bucketPronto = false;
var usuarioLogado = null;

// Banco de gestao (para login - tabela usuarios_admin)
var GESTAO_SUPABASE_URL = 'https://tidngxclgaspltzqoemi.supabase.co';
var GESTAO_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE';

/* ================================================================== */
/*  CAMADA SEGURA (admin-api) — dados sensiveis via chave secreta      */
/* ================================================================== */
var ADMIN_API_URL = 'https://sitiolabareda.com/api/admin-api';
var adminToken = null;

async function adminApi(action, params) {
  var headers = { 'Content-Type': 'application/json' };
  if (adminToken) headers['Authorization'] = 'Bearer ' + adminToken;
  var r = await fetch(ADMIN_API_URL, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(Object.assign({ action: action }, params || {})),
  });
  var data = await r.json();
  if (!r.ok || (data && data.erro)) throw new Error((data && data.erro) || ('Erro ' + r.status));
  return data;
}

/* ================================================================== */
/*  LOGIN / LOGOUT                                                    */
/* ================================================================== */
function verificarSessao() {
  try {
    var dados = sessionStorage.getItem('labareda_shop_usuario');
    var tok = sessionStorage.getItem('labareda_shop_token');
    if (dados && tok) { usuarioLogado = JSON.parse(dados); adminToken = tok; return true; }
  } catch (e) { console.error(e); }
  return false;
}

function mostrarApp() {
  document.getElementById('login-screen').classList.add('escondido');
  document.getElementById('app-wrapper').classList.remove('escondido');
  var el = document.getElementById('sidebar-user-name');
  if (el && usuarioLogado) el.textContent = usuarioLogado.nome || usuarioLogado.email;
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

  if (!email || !senha) { errorEl.textContent = 'Preencha email e senha'; errorEl.classList.remove('escondido'); return; }

  errorEl.classList.add('escondido');
  btnEl.disabled = true;
  btnEl.textContent = 'Entrando...';

  try {
    // Login pela camada segura: valida no servidor e devolve um token assinado.
    var resp = await adminApi('login', { email: email, senha: senha });
    usuarioLogado = resp.usuario;
    adminToken = resp.token;
    sessionStorage.setItem('labareda_shop_usuario', JSON.stringify(usuarioLogado));
    sessionStorage.setItem('labareda_shop_token', adminToken);
    mostrarApp();
    initDashboard();
  } catch (err) {
    errorEl.textContent = (err && /incorret/i.test(err.message)) ? 'Email ou senha incorretos' : 'Erro ao conectar. Tente novamente.';
    errorEl.classList.remove('escondido');
  }
  btnEl.disabled = false; btnEl.textContent = 'Entrar';
}

function realizarLogout() {
  sessionStorage.removeItem('labareda_shop_usuario');
  sessionStorage.removeItem('labareda_shop_token');
  usuarioLogado = null;
  adminToken = null;
  var e = document.getElementById('login-email'); if (e) e.value = '';
  var s = document.getElementById('login-senha'); if (s) s.value = '';
  var err = document.getElementById('login-error'); if (err) err.classList.add('escondido');
  mostrarLogin();
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

/* ================================================================== */
/*  SUPABASE STORAGE — UPLOAD DE IMAGENS                              */
/* ================================================================== */
async function garantirBucket() {
  if (bucketPronto) return;
  try {
    await fetch(CONFIG.SUPABASE_URL + '/storage/v1/bucket', {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'imagens', name: 'imagens', public: true }),
    });
  } catch (e) {
    // bucket ja existe — silently ignore
  }
  bucketPronto = true;
}

async function uploadImagem(file, pasta, nomeArquivo) {
  await garantirBucket();
  var path = pasta + '/' + nomeArquivo;
  var resp = await fetch(CONFIG.SUPABASE_URL + '/storage/v1/object/imagens/' + path, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
      'Content-Type': file.type,
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!resp.ok) {
    var txt = await resp.text();
    throw new Error('Upload falhou: ' + txt);
  }
  return CONFIG.SUPABASE_URL + '/storage/v1/object/public/imagens/' + path;
}

/* Upload de video para o bucket 'videos' (limite 50MB no plano atual) */
async function uploadVideoArquivo(file, nomeArquivo) {
  var path = 'journal/' + nomeArquivo;
  var resp = await fetch(CONFIG.SUPABASE_URL + '/storage/v1/object/videos/' + path, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
      'Content-Type': file.type,
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!resp.ok) {
    var txt = await resp.text();
    throw new Error('Upload de video falhou: ' + txt);
  }
  return CONFIG.SUPABASE_URL + '/storage/v1/object/public/videos/' + path;
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

function formatarMoeda(valor) {
  if (valor == null) return 'R$ 0,00';
  return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
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

function gerarSlug(texto) {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function gerarNomeArquivo(file) {
  var ts = Date.now();
  var ext = file.name.split('.').pop() || 'jpg';
  return ts + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext;
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

function carregarPagina(pagina) {
  switch (pagina) {
    case 'visao-geral':    carregarVisaoGeral(); break;
    case 'produtos':       carregarProdutos(); break;
    case 'pedidos':        carregarPedidos(); break;
    case 'journal':        carregarJournal(); break;
    case 'reservas':       carregarReservas(); break;
    case 'mensagens':      carregarMensagens(); break;
    case 'playlists':      carregarPlaylists(); break;
    case 'conteudo-site':  carregarConteudoSite(); break;
    case 'configuracoes':  carregarConfiguracoes(); break;
  }
}

/* ================================================================== */
/*  VISAO GERAL                                                       */
/* ================================================================== */
async function carregarVisaoGeral() {
  try {
    var vg = await adminApi('visao-geral');

    $('#stat-produtos').textContent = vg.produtos;
    $('#stat-pedidos-pendentes').textContent = vg.pedidos_pendentes;
    $('#stat-mensagens').textContent = vg.mensagens_nao_lidas;

    var statReservas = $('#stat-reservas');
    if (statReservas) statReservas.textContent = vg.reservas_novas;

    $('#stat-receita').textContent = formatarMoeda(vg.receita);

    // Estoque baixo
    var estoqueBaixo = vg.estoque_baixo || [];
    var alertaContainer = $('#alerta-estoque');
    var listaContainer = $('#lista-estoque-baixo');
    if (estoqueBaixo && estoqueBaixo.length > 0) {
      alertaContainer.classList.remove('escondido');
      listaContainer.innerHTML = estoqueBaixo.map(function(p) {
        return '<div class="lista-simples__item">' +
          '<span class="lista-simples__texto">' + escapeHtml(p.nome_pt) + '</span>' +
          '<span class="badge badge--estoque-baixo">Estoque: ' + (p.estoque || 0) + '</span>' +
          '</div>';
      }).join('');
    } else {
      alertaContainer.classList.add('escondido');
    }

  } catch (err) {
    console.error('Erro ao carregar visao geral:', err);
    mostrarToast('Erro ao carregar dados', 'error');
  }
}

/* ================================================================== */
/*  PRODUTOS                                                          */
/* ================================================================== */
async function carregarProdutos() {
  try {
    if (cacheCategorias.length === 0) {
      cacheCategorias = await supaFetch('categorias?select=*');
      var selectCat = $('#filtro-produto-categoria');
      cacheCategorias.forEach(function(c) {
        if (!selectCat.querySelector('option[value="' + c.id + '"]')) {
          var opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.nome_pt || c.nome_en || '--';
          selectCat.appendChild(opt);
        }
      });
    }

    var qs = '?select=*,categorias(nome_pt)&order=nome_pt.asc';
    var catFiltro = $('#filtro-produto-categoria').value;
    if (catFiltro) qs += '&categoria_id=eq.' + catFiltro;

    var data = await supaFetch('produtos' + qs);
    var grid = $('#grid-produtos');

    if (!data || data.length === 0) {
      grid.innerHTML = '<p class="placeholder">Nenhum produto encontrado</p>';
      return;
    }

    grid.innerHTML = data.map(function(p) {
      var estoque = p.estoque != null ? p.estoque : 0;
      var estoqueBaixo = estoque <= 5;
      var imagens = p.imagens;
      var imgUrl = null;
      if (Array.isArray(imagens) && imagens.length > 0) {
        imgUrl = imagens[0];
      } else if (typeof imagens === 'string') {
        try { var parsed = JSON.parse(imagens); if (Array.isArray(parsed) && parsed.length > 0) imgUrl = parsed[0]; } catch(e) {}
      }
      var imgHtml = imgUrl
        ? '<img class="card-produto__img" src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(p.nome_pt) + '" loading="lazy">'
        : '<div class="card-produto__img--placeholder">&#128722;</div>';
      var categoria = (p.categorias && p.categorias.nome_pt) || '--';
      var ativo = p.ativo !== false;
      var destaqueHtml = p.destaque ? '<span class="badge badge--warning" style="margin-bottom:4px;display:inline-block">Destaque</span> ' : '';
      var porTamanhoHtml = '';
      if (p.variantes_estoque && typeof p.variantes_estoque === 'object') {
        porTamanhoHtml = '<p style="font-size:11px;color:var(--text-muted);margin-top:2px">' +
          ['P', 'M', 'G', 'GG'].filter(function(t) { return p.variantes_estoque[t] != null; })
            .map(function(t) { return t + ':' + p.variantes_estoque[t]; }).join(' &middot; ') +
          '</p>';
      }

      return '<div class="card-produto">' +
        imgHtml +
        '<div class="card-produto__body">' +
          destaqueHtml +
          '<p class="card-produto__nome">' + escapeHtml(p.nome_pt || '--') + '</p>' +
          '<p class="card-produto__categoria">' + escapeHtml(categoria) + '</p>' +
          '<div class="card-produto__info">' +
            '<span class="card-produto__preco">' + formatarMoeda(p.preco) + '</span>' +
            '<span class="card-produto__estoque">' +
              (estoqueBaixo
                ? '<span class="badge badge--estoque-baixo">Estoque: ' + estoque + '</span>'
                : 'Estoque: ' + estoque) +
            '</span>' +
          '</div>' +
          porTamanhoHtml +
          '<span class="badge badge--' + (ativo ? 'ativo' : 'inativo') + '" style="margin-bottom:8px;display:inline-block">' + (ativo ? 'Ativo' : 'Inativo') + '</span>' +
          '<div class="card-produto__acoes">' +
            '<button class="btn btn--small btn--secondary" onclick="abrirModalProduto(\'' + p.id + '\')">Editar</button>' +
            '<button class="btn btn--small btn--danger" onclick="toggleProduto(\'' + p.id + '\',' + ativo + ')">' + (ativo ? 'Desativar' : 'Ativar') + '</button>' +
          '</div>' +
        '</div>' +
        '</div>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
    $('#grid-produtos').innerHTML = '<p class="placeholder">Erro ao carregar</p>';
  }
}

function abrirModalProduto(id) {
  modalModo = id ? 'produto-editar' : 'produto-novo';
  modalItemId = id || null;

  $('#modal-titulo').textContent = id ? 'Editar Produto' : 'Novo Produto';

  var catOptions = cacheCategorias.map(function(c) {
    return '<option value="' + c.id + '">' + escapeHtml(c.nome_pt || c.nome_en || '--') + '</option>';
  }).join('');

  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Nome (PT)</label><input type="text" id="campo-prod-nome-pt" placeholder="Nome do produto em portugues"></div>' +
    '<div class="form-group"><label>Nome (EN)</label><input type="text" id="campo-prod-nome-en" placeholder="Product name in english"></div>' +
    '<div class="form-group"><label>Categoria</label><select id="campo-prod-categoria"><option value="">Selecione</option>' + catOptions + '</select></div>' +
    '<div class="form-group"><label>Preco (R$)</label><input type="number" id="campo-prod-preco" step="0.01" min="0" placeholder="0.00"></div>' +
    '<div class="form-group"><label>Preco Promocional (R$)</label><input type="number" id="campo-prod-preco-promo" step="0.01" min="0" placeholder="0.00"></div>' +
    '<div class="form-group"><label>Estoque</label><input type="number" id="campo-prod-estoque" min="0" placeholder="0"></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="campo-prod-tem-tamanho"> Produto tem tamanhos (P/M/G/GG)</label></div>' +
    '<div id="campo-prod-tamanhos-wrap" class="form-group" style="display:none">' +
      '<label>Estoque por tamanho</label>' +
      '<p style="font-size:11px;color:var(--text-muted);margin:-2px 0 8px">Deixe em branco o tamanho que o produto nao tem. O campo "Estoque" acima passa a ser somado automaticamente.</p>' +
      '<div style="display:flex;gap:8px">' +
        '<div style="flex:1"><label style="font-size:11px">P</label><input type="number" id="campo-prod-tam-P" min="0" placeholder="--" style="width:100%"></div>' +
        '<div style="flex:1"><label style="font-size:11px">M</label><input type="number" id="campo-prod-tam-M" min="0" placeholder="--" style="width:100%"></div>' +
        '<div style="flex:1"><label style="font-size:11px">G</label><input type="number" id="campo-prod-tam-G" min="0" placeholder="--" style="width:100%"></div>' +
        '<div style="flex:1"><label style="font-size:11px">GG</label><input type="number" id="campo-prod-tam-GG" min="0" placeholder="--" style="width:100%"></div>' +
      '</div>' +
    '</div>' +
    '<div class="form-group"><label>SKU</label><input type="text" id="campo-prod-sku" placeholder="SKU do produto"></div>' +
    '<div class="form-group"><label>Peso (gramas)</label><input type="number" id="campo-prod-peso" min="0" placeholder="0"></div>' +
    '<p style="font-size:12px;font-weight:600;margin:12px 0 6px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em">Dimensoes para frete (cm)</p>' +
    '<div style="display:flex;gap:8px">' +
      '<div class="form-group" style="flex:1"><label>Comprimento</label><input type="number" id="campo-prod-frete-comprimento" min="0" step="0.1" placeholder="cm"></div>' +
      '<div class="form-group" style="flex:1"><label>Largura</label><input type="number" id="campo-prod-frete-largura" min="0" step="0.1" placeholder="cm"></div>' +
      '<div class="form-group" style="flex:1"><label>Altura</label><input type="number" id="campo-prod-frete-altura" min="0" step="0.1" placeholder="cm"></div>' +
    '</div>' +
    '<div class="form-group"><label>Imagem do Produto</label>' +
      '<input type="file" id="campo-prod-imagem-file" accept="image/*">' +
      '<div id="campo-prod-imagem-preview" style="margin-top:8px"></div>' +
    '</div>' +
    '<div class="form-group"><label>Descricao (PT)</label><textarea id="campo-prod-descricao-pt" rows="3" placeholder="Descricao em portugues"></textarea></div>' +
    '<div class="form-group"><label>Descricao (EN)</label><textarea id="campo-prod-descricao-en" rows="3" placeholder="Description in english"></textarea></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="campo-prod-destaque"> Produto Destaque</label></div>' +
    '<div class="form-group"><label>Slug</label><input type="text" id="campo-prod-slug" placeholder="gerado-automaticamente" style="color:var(--text-muted)"></div>';

  // Toggle do bloco de estoque por tamanho (P/M/G/GG)
  var temTamanhoCheck = $('#campo-prod-tem-tamanho');
  var tamanhosWrap = $('#campo-prod-tamanhos-wrap');
  var estoqueInput = $('#campo-prod-estoque');
  temTamanhoCheck.addEventListener('change', function() {
    tamanhosWrap.style.display = temTamanhoCheck.checked ? '' : 'none';
    estoqueInput.readOnly = temTamanhoCheck.checked;
    estoqueInput.title = temTamanhoCheck.checked ? 'Somado automaticamente dos tamanhos' : '';
    if (temTamanhoCheck.checked) recalcularEstoqueTamanhos();
  });
  ['P', 'M', 'G', 'GG'].forEach(function(tam) {
    $('#campo-prod-tam-' + tam).addEventListener('input', recalcularEstoqueTamanhos);
  });
  function recalcularEstoqueTamanhos() {
    if (!temTamanhoCheck.checked) return;
    var soma = 0;
    ['P', 'M', 'G', 'GG'].forEach(function(tam) {
      var v = $('#campo-prod-tam-' + tam).value;
      if (v !== '') soma += parseInt(v, 10) || 0;
    });
    estoqueInput.value = soma;
  }

  // Auto-gerar slug ao digitar nome PT
  var nomePtInput = $('#campo-prod-nome-pt');
  var slugInput = $('#campo-prod-slug');
  nomePtInput.addEventListener('input', function() {
    slugInput.value = gerarSlug(nomePtInput.value);
  });

  // Preview de imagem existente
  var fileInput = $('#campo-prod-imagem-file');
  fileInput.addEventListener('change', function() {
    var preview = $('#campo-prod-imagem-preview');
    if (fileInput.files && fileInput.files[0]) {
      var reader = new FileReader();
      reader.onload = function(e) {
        preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:200px;max-height:150px;border-radius:8px">';
      };
      reader.readAsDataURL(fileInput.files[0]);
    }
  });

  if (id) {
    carregarDadosProdutoModal(id);
  }

  $('#modal-overlay').classList.remove('escondido');
}

async function carregarDadosProdutoModal(id) {
  try {
    var data = await supaFetch('produtos?id=eq.' + id);
    if (data && data.length > 0) {
      var p = data[0];
      var el = function(s) { return $(s); };
      if (el('#campo-prod-nome-pt')) el('#campo-prod-nome-pt').value = p.nome_pt || '';
      if (el('#campo-prod-nome-en')) el('#campo-prod-nome-en').value = p.nome_en || '';
      if (el('#campo-prod-categoria')) el('#campo-prod-categoria').value = p.categoria_id || '';
      if (el('#campo-prod-preco')) el('#campo-prod-preco').value = p.preco || '';
      if (el('#campo-prod-preco-promo')) el('#campo-prod-preco-promo').value = p.preco_promocional || '';
      if (el('#campo-prod-estoque')) el('#campo-prod-estoque').value = p.estoque != null ? p.estoque : '';
      if (el('#campo-prod-sku')) el('#campo-prod-sku').value = p.sku || '';
      if (el('#campo-prod-peso')) el('#campo-prod-peso').value = p.peso_gramas || '';
      if (el('#campo-prod-frete-comprimento')) el('#campo-prod-frete-comprimento').value = p.frete_comprimento || '';
      if (el('#campo-prod-frete-largura')) el('#campo-prod-frete-largura').value = p.frete_largura || '';
      if (el('#campo-prod-frete-altura')) el('#campo-prod-frete-altura').value = p.frete_altura || '';
      if (el('#campo-prod-descricao-pt')) el('#campo-prod-descricao-pt').value = p.descricao_pt || '';
      if (el('#campo-prod-descricao-en')) el('#campo-prod-descricao-en').value = p.descricao_en || '';
      if (el('#campo-prod-destaque')) el('#campo-prod-destaque').checked = !!p.destaque;
      if (el('#campo-prod-slug')) el('#campo-prod-slug').value = p.slug || '';

      // Estoque por tamanho (P/M/G/GG) — preenche os tamanhos ANTES de disparar o
      // "change" do checkbox, senao o recalculo automatico zera o campo Estoque.
      if (p.variantes_estoque && typeof p.variantes_estoque === 'object') {
        ['P', 'M', 'G', 'GG'].forEach(function(tam) {
          var input = el('#campo-prod-tam-' + tam);
          if (input && p.variantes_estoque[tam] != null) input.value = p.variantes_estoque[tam];
        });
        if (el('#campo-prod-tem-tamanho')) {
          el('#campo-prod-tem-tamanho').checked = true;
          el('#campo-prod-tem-tamanho').dispatchEvent(new Event('change'));
        }
      }

      // Mostrar imagem existente
      var imagens = p.imagens;
      var imgUrl = null;
      if (Array.isArray(imagens) && imagens.length > 0) {
        imgUrl = imagens[0];
      } else if (typeof imagens === 'string') {
        try { var parsed = JSON.parse(imagens); if (Array.isArray(parsed) && parsed.length > 0) imgUrl = parsed[0]; } catch(e) {}
      }
      if (imgUrl) {
        var preview = $('#campo-prod-imagem-preview');
        if (preview) preview.innerHTML = '<img src="' + escapeHtml(imgUrl) + '" style="max-width:200px;max-height:150px;border-radius:8px"><p style="font-size:12px;color:var(--text-muted);margin-top:4px">Imagem atual. Selecione outra para substituir.</p>';
      }
    }
  } catch (err) {
    console.error('Erro ao carregar produto:', err);
  }
}

async function toggleProduto(id, atualmenteAtivo) {
  try {
    await supaUpdate('produtos', id, { ativo: !atualmenteAtivo });
    mostrarToast(atualmenteAtivo ? 'Produto desativado' : 'Produto ativado');
    carregarProdutos();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao alterar status', 'error');
  }
}

/* ================================================================== */
/*  PEDIDOS                                                           */
/* ================================================================== */
async function carregarPedidos() {
  try {
    var statusFiltro = $('#filtro-pedido-status').value;
    var resp = await adminApi('pedidos', statusFiltro ? { status: statusFiltro } : {});
    var data = resp.pedidos || [];
    var tbody = $('#tbody-pedidos');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Nenhum pedido encontrado</td></tr>';
      return;
    }

    var statusOptions = ['pendente', 'pago', 'preparando', 'enviado', 'entregue', 'cancelado'];

    tbody.innerHTML = data.map(function(p) {
      var status = slugStatus(p.status);
      var cliente = (p.clientes && p.clientes.nome) || p.cliente_nome || '--';
      var numero = p.numero || p.id.substring(0, 8);

      var selectHtml = '<select class="filtro-select" style="min-width:120px;padding:4px 8px;font-size:12px" onchange="mudarStatusPedido(\'' + p.id + '\', this.value)">';
      statusOptions.forEach(function(s) {
        selectHtml += '<option value="' + s + '"' + (s === (p.status || 'pendente') ? ' selected' : '') + '>' + s + '</option>';
      });
      selectHtml += '</select>';

      return '<tr>' +
        '<td>#' + escapeHtml(String(numero)) + '</td>' +
        '<td>' + escapeHtml(cliente) + '</td>' +
        '<td>' + formatarMoeda(p.total) + '</td>' +
        '<td><span class="badge badge--' + status + '">' + (p.status || 'pendente') + '</span></td>' +
        '<td>' + formatarData(p.created_at) + '</td>' +
        '<td>' +
          '<button class="btn btn--small btn--secondary" onclick="expandirPedido(\'' + p.id + '\')" style="margin-right:4px">Ver</button>' +
          selectHtml +
        '</td>' +
        '</tr>';
    }).join('');

    $('#pedido-detalhe').classList.add('escondido');

  } catch (err) {
    console.error('Erro ao carregar pedidos:', err);
    $('#tbody-pedidos').innerHTML = '<tr><td colspan="6" class="placeholder">Erro ao carregar</td></tr>';
  }
}

async function expandirPedido(pedidoId) {
  try {
    var respItens = await adminApi('pedido-itens', { pedido_id: pedidoId });
    var items = respItens.itens || [];
    var detalhe = $('#pedido-detalhe');
    var container = $('#pedido-itens');

    if (!items || items.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhum item no pedido</p>';
    } else {
      var html = '<table class="tabela"><thead><tr><th>Produto</th><th>Tam.</th><th>Qtd</th><th>Preco Unit.</th><th>Subtotal</th></tr></thead><tbody>';
      items.forEach(function(item) {
        var nome = (item.produtos && item.produtos.nome_pt) || item.produto_nome || '--';
        var qtd = item.quantidade || 1;
        var preco = item.preco_unitario || item.preco || 0;
        html += '<tr>' +
          '<td>' + escapeHtml(nome) + '</td>' +
          '<td>' + (item.tamanho ? escapeHtml(item.tamanho) : '--') + '</td>' +
          '<td>' + qtd + '</td>' +
          '<td>' + formatarMoeda(preco) + '</td>' +
          '<td>' + formatarMoeda(preco * qtd) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    // Adiciona campo de rastreio
    var rastreioHtml = '<div style="margin-top:16px;padding:14px;border:1px solid #ddd;border-radius:6px;background:#fafaf5">'
      + '<label style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:8px">Codigo de Rastreio (Correios)</label>'
      + '<div style="display:flex;gap:8px">'
      + '<input type="text" id="input-rastreio-' + pedidoId + '" placeholder="Ex: AB123456789BR" style="flex:1;padding:10px;border:1px solid #ccc;font-family:monospace;font-size:14px;letter-spacing:.1em">'
      + '<button class="btn btn--primary" onclick="salvarRastreio(\'' + pedidoId + '\')" style="white-space:nowrap">Salvar Rastreio</button>'
      + '</div>'
      + '</div>';
    container.innerHTML += rastreioHtml;

    detalhe.classList.remove('escondido');
    detalhe.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Erro ao expandir pedido:', err);
  }
}

async function salvarRastreio(pedidoId) {
  var input = $('#input-rastreio-' + pedidoId);
  var codigo = (input ? input.value : '').trim().toUpperCase();
  if (!codigo) { mostrarToast('Informe o codigo de rastreio', 'error'); return; }
  try {
    var resp = await adminApi('update-pedido-rastreio', { pedido_id: pedidoId, codigo_rastreio: codigo });
    mostrarToast('Rastreio salvo! Status atualizado para ENVIADO');
    carregarPedidos();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao salvar rastreio', 'error');
  }
}

async function mudarStatusPedido(pedidoId, novoStatus) {
  try {
    var payload = { pedido_id: pedidoId, status: novoStatus };
    if (novoStatus === 'enviado') {
      var codigo = prompt('Codigo de rastreio dos Correios (opcional):');
      if (codigo && codigo.trim()) payload.codigo_rastreio = codigo.trim().toUpperCase();
    }
    await adminApi('update-pedido-status', payload);
    mostrarToast('Status atualizado para ' + novoStatus);
    carregarPedidos();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao mudar status', 'error');
  }
}

/* ================================================================== */
/*  JOURNAL                                                           */
/* ================================================================== */
async function carregarJournal() {
  try {
    var data = await supaFetch('journal_posts?select=*&order=created_at.desc');
    var grid = $('#grid-journal');

    if (!data || data.length === 0) {
      grid.innerHTML = '<p class="placeholder">Nenhum post encontrado</p>';
      return;
    }

    grid.innerHTML = data.map(function(p) {
      var publicado = p.publicado !== false;
      var imgHtml = p.imagem_capa
        ? '<img class="card-journal__img" src="' + escapeHtml(p.imagem_capa) + '" alt="' + escapeHtml(p.titulo_pt || '') + '" loading="lazy">'
        : '';
      var titulo = p.titulo_pt || p.titulo_en || '--';
      var destaque = p.destaque ? '<span class="badge badge--warning" style="margin-left:6px">Destaque</span>' : '';

      return '<div class="card-journal" style="cursor:pointer" onclick="abrirModalJournal(\'' + p.id + '\')">' +
        imgHtml +
        '<div class="card-journal__body">' +
          '<p class="card-journal__titulo">' + escapeHtml(titulo) + destaque + '</p>' +
          '<div class="card-journal__meta">' +
            '<span class="card-journal__data">' + formatarData(p.published_at || p.created_at) + '</span>' +
            '<span class="badge badge--' + (publicado ? 'publicado' : 'rascunho') + '">' + (publicado ? 'Publicado' : 'Rascunho') + '</span>' +
          '</div>' +
          '<div class="card-journal__acoes" onclick="event.stopPropagation()">' +
            '<button class="btn btn--small btn--secondary" onclick="abrirModalJournal(\'' + p.id + '\')">Editar</button>' +
            '<button class="btn btn--small ' + (publicado ? 'btn--danger' : 'btn--primary') + '" onclick="toggleJournal(\'' + p.id + '\',' + publicado + ')">' +
              (publicado ? 'Despublicar' : 'Publicar') +
            '</button>' +
          '</div>' +
        '</div>' +
        '</div>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar journal:', err);
    $('#grid-journal').innerHTML = '<p class="placeholder">Erro ao carregar</p>';
  }
}

function abrirModalJournal(id) {
  modalModo = id ? 'journal-editar' : 'journal-novo';
  modalItemId = id || null;

  $('#modal-titulo').textContent = id ? 'Editar Post' : 'Novo Post';

  $('#modal-body').innerHTML =
    '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Estes campos aparecem no <b>card do journal no site</b>. O título tambem e usado como titulo da pagina do journal.</p>' +
    '<div class="form-group"><label>Imagem de capa (vai para o card no site)</label>' +
      '<input type="file" id="campo-journal-imagem-file" accept="image/*">' +
      '<div id="campo-journal-imagem-preview" style="margin-top:8px"></div>' +
    '</div>' +
    '<div class="form-group"><label>Titulo (PT)</label><input type="text" id="campo-journal-titulo-pt" placeholder="Ex: Feira da Serra"></div>' +
    '<div class="form-group"><label>Titulo (EN)</label><input type="text" id="campo-journal-titulo-en" placeholder="Post title in english"></div>' +
    '<div class="form-group"><label>Descricao do card (PT)</label><textarea id="campo-journal-resumo-pt" rows="2" placeholder="Texto curto que aparece embaixo do card no site"></textarea></div>' +
    '<div class="form-group"><label>Descricao do card (EN)</label><textarea id="campo-journal-resumo-en" rows="2" placeholder="Short text in english"></textarea></div>' +

    '<hr style="border:none;border-top:1px solid var(--border);margin:18px 0">' +
    '<p style="font-size:13px;font-weight:600;margin-bottom:4px">Imagens do journal (pagina interna)</p>' +
    '<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Adicione quantas quiser. Cada imagem precisa de um arquivo (ou URL) e uma descricao. Se nao adicionar nenhuma, a pagina mostra so o video.</p>' +
    '<div id="journal-imgs"></div>' +
    '<button type="button" class="btn btn--small btn--secondary" onclick="journalAddImagemRow()">+ Adicionar imagem</button>' +

    '<hr style="border:none;border-top:1px solid var(--border);margin:18px 0">' +
    '<p style="font-size:13px;font-weight:600;margin-bottom:4px">Video (opcional, sempre no rodape da pagina)</p>' +
    '<div class="form-group"><label>Link do YouTube</label><input type="text" id="campo-journal-video-url" placeholder="https://youtube.com/watch?v=..."></div>' +
    '<div class="form-group"><label>Ou envie um arquivo de video (ate 50MB)</label>' +
      '<input type="file" id="campo-journal-video-file" accept="video/*">' +
      '<div id="campo-journal-video-preview" style="margin-top:6px;font-size:12px;color:var(--text-muted)"></div>' +
    '</div>' +

    '<hr style="border:none;border-top:1px solid var(--border);margin:18px 0">' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="campo-journal-destaque"> Favoritar (mostrar este journal no site)</label></div>' +
    '<div class="form-group"><label>Slug (endereco da pagina)</label><input type="text" id="campo-journal-slug" placeholder="gerado-automaticamente" style="color:var(--text-muted)"></div>';

  // Auto-gerar slug ao digitar titulo PT
  var tituloPtInput = $('#campo-journal-titulo-pt');
  var slugInput = $('#campo-journal-slug');
  tituloPtInput.addEventListener('input', function() {
    slugInput.value = gerarSlug(tituloPtInput.value);
  });

  // Preview da capa
  var fileInput = $('#campo-journal-imagem-file');
  fileInput.addEventListener('change', function() {
    var preview = $('#campo-journal-imagem-preview');
    if (fileInput.files && fileInput.files[0]) {
      var reader = new FileReader();
      reader.onload = function(e) {
        preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:200px;max-height:150px;border-radius:8px">';
      };
      reader.readAsDataURL(fileInput.files[0]);
    }
  });

  // Nome do arquivo de video selecionado
  var videoFile = $('#campo-journal-video-file');
  videoFile.addEventListener('change', function() {
    var prev = $('#campo-journal-video-preview');
    if (videoFile.files && videoFile.files[0]) {
      var f = videoFile.files[0];
      var mb = (f.size / 1048576).toFixed(1);
      prev.innerHTML = f.name + ' (' + mb + ' MB)' + (f.size > 52428800 ? ' <b style="color:#c0392b">— maior que 50MB, use o YouTube</b>' : '');
    } else { prev.innerHTML = ''; }
  });

  if (id) {
    carregarDadosJournalModal(id);
  } else {
    journalAddImagemRow(); // comeca com uma linha vazia
  }

  $('#modal-overlay').classList.remove('escondido');
}

/* Adiciona uma linha de imagem de conteudo do journal (imagem/url + descricao PT/EN) */
function journalAddImagemRow(dados) {
  dados = dados || {};
  var cont = document.getElementById('journal-imgs');
  if (!cont) return;
  var row = document.createElement('div');
  row.className = 'jimg-row';
  row.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px';
  row.innerHTML =
    '<div class="jimg-prev" style="margin-bottom:8px">' +
      (dados.url ? '<img src="' + escapeHtml(dados.url) + '" style="max-width:160px;max-height:120px;border-radius:6px">' : '') +
    '</div>' +
    '<input type="file" accept="image/*" class="jimg-file" style="margin-bottom:6px;display:block">' +
    '<input type="text" class="jimg-url input" placeholder="ou cole a URL da imagem" value="' + escapeHtml(dados.url || '') + '" style="margin-bottom:6px;display:block;width:100%">' +
    '<textarea class="jimg-dpt" rows="2" placeholder="Descricao da imagem (PT)" style="margin-bottom:6px;display:block;width:100%">' + escapeHtml(dados.descricao_pt || '') + '</textarea>' +
    '<textarea class="jimg-den" rows="2" placeholder="Image description (EN)" style="margin-bottom:8px;display:block;width:100%">' + escapeHtml(dados.descricao_en || '') + '</textarea>' +
    '<button type="button" class="btn btn--small btn--danger jimg-rm">Remover imagem</button>';
  cont.appendChild(row);

  // preview ao escolher arquivo
  row.querySelector('.jimg-file').addEventListener('change', function() {
    var prev = row.querySelector('.jimg-prev');
    if (this.files && this.files[0]) {
      var reader = new FileReader();
      reader.onload = function(e) { prev.innerHTML = '<img src="' + e.target.result + '" style="max-width:160px;max-height:120px;border-radius:6px">'; };
      reader.readAsDataURL(this.files[0]);
    }
  });
  // remover linha
  row.querySelector('.jimg-rm').addEventListener('click', function() { row.remove(); });
}

async function carregarDadosJournalModal(id) {
  try {
    var data = await supaFetch('journal_posts?id=eq.' + id);
    if (data && data.length > 0) {
      var p = data[0];
      var el = function(s) { return $(s); };
      if (el('#campo-journal-titulo-pt')) el('#campo-journal-titulo-pt').value = p.titulo_pt || '';
      if (el('#campo-journal-titulo-en')) el('#campo-journal-titulo-en').value = p.titulo_en || '';
      if (el('#campo-journal-resumo-pt')) el('#campo-journal-resumo-pt').value = p.resumo_pt || '';
      if (el('#campo-journal-resumo-en')) el('#campo-journal-resumo-en').value = p.resumo_en || '';
      if (el('#campo-journal-destaque')) el('#campo-journal-destaque').checked = !!p.destaque;
      if (el('#campo-journal-slug')) el('#campo-journal-slug').value = p.slug || '';
      if (el('#campo-journal-video-url')) el('#campo-journal-video-url').value = (p.video_url && !/\/storage\/v1\/object\/public\/videos\//.test(p.video_url)) ? p.video_url : (p.video_url || '');

      // Imagem de capa existente
      if (p.imagem_capa) {
        var preview = $('#campo-journal-imagem-preview');
        if (preview) preview.innerHTML = '<img src="' + escapeHtml(p.imagem_capa) + '" style="max-width:200px;max-height:150px;border-radius:8px"><p style="font-size:12px;color:var(--text-muted);margin-top:4px">Imagem atual. Selecione outra para substituir.</p>';
      }

      // Imagens de conteudo existentes
      var imagens = p.imagens;
      if (typeof imagens === 'string') { try { imagens = JSON.parse(imagens); } catch(e) { imagens = []; } }
      if (!Array.isArray(imagens)) imagens = [];
      var cont = document.getElementById('journal-imgs');
      if (cont) cont.innerHTML = '';
      if (imagens.length === 0) {
        journalAddImagemRow();
      } else {
        imagens.forEach(function(it) {
          if (typeof it === 'string') journalAddImagemRow({ url: it });
          else journalAddImagemRow({ url: it.url || it.imagem || '', descricao_pt: it.descricao_pt || it.descricao || '', descricao_en: it.descricao_en || '' });
        });
      }
    }
  } catch (err) {
    console.error('Erro ao carregar post:', err);
  }
}

async function toggleJournal(id, atualmentePublicado) {
  try {
    var updateData = { publicado: !atualmentePublicado };
    if (!atualmentePublicado) {
      updateData.published_at = new Date().toISOString();
    }
    await supaUpdate('journal_posts', id, updateData);
    mostrarToast(atualmentePublicado ? 'Post despublicado' : 'Post publicado');
    carregarJournal();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao alterar status', 'error');
  }
}

/* ================================================================== */
/*  RESERVAS                                                          */
/* ================================================================== */
async function carregarReservas() {
  try {
    var qs = '?select=*&order=created_at.desc';
    var statusFiltro = $('#filtro-reserva-status');
    if (statusFiltro && statusFiltro.value) qs += '&status=eq.' + statusFiltro.value;

    var data = await supaFetch('reservas' + qs);
    var tbody = $('#tbody-reservas');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="placeholder">Nenhuma reserva encontrada</td></tr>';
      return;
    }

    var statusOptions = ['nova', 'confirmada', 'recusada', 'cancelada'];

    tbody.innerHTML = data.map(function(r) {
      var status = r.status || 'nova';
      var badgeClass = {
        'nova': 'warning',
        'confirmada': 'ativo',
        'recusada': 'danger',
        'cancelada': 'inativo',
      }[status] || 'warning';

      var selectHtml = '<select class="filtro-select" style="min-width:110px;padding:4px 8px;font-size:12px" onchange="mudarStatusReserva(\'' + r.id + '\', this.value)">';
      statusOptions.forEach(function(s) {
        selectHtml += '<option value="' + s + '"' + (s === status ? ' selected' : '') + '>' + s + '</option>';
      });
      selectHtml += '</select>';

      return '<tr>' +
        '<td>' + escapeHtml(r.nome || '--') + '</td>' +
        '<td>' + formatarData(r.checkin) + '</td>' +
        '<td>' + formatarData(r.checkout) + '</td>' +
        '<td>' + (r.hospedes || '--') + '</td>' +
        '<td><span class="badge badge--' + badgeClass + '">' + status + '</span></td>' +
        '<td>' + formatarData(r.created_at) + '</td>' +
        '<td>' +
          '<button class="btn btn--small btn--secondary" onclick="abrirModalReserva(\'' + r.id + '\')" style="margin-right:4px">Ver</button>' +
          selectHtml +
        '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar reservas:', err);
    $('#tbody-reservas').innerHTML = '<tr><td colspan="7" class="placeholder">Erro ao carregar</td></tr>';
  }
}

async function mudarStatusReserva(id, novoStatus) {
  try {
    await supaUpdate('reservas', id, { status: novoStatus });
    mostrarToast('Status atualizado para ' + novoStatus);
    carregarReservas();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao mudar status', 'error');
  }
}

function abrirModalReserva(id) {
  modalModo = 'reserva-ver';
  modalItemId = id;

  $('#modal-titulo').textContent = 'Detalhes da Reserva';
  $('#modal-body').innerHTML = '<p class="placeholder">Carregando...</p>';
  $('#modal-btn-salvar').textContent = 'Salvar Observacoes';
  $('#modal-btn-salvar').style.display = '';

  supaFetch('reservas?id=eq.' + id).then(function(data) {
    if (data && data.length > 0) {
      var r = data[0];
      var status = r.status || 'nova';

      $('#modal-body').innerHTML =
        '<div style="margin-bottom:16px">' +
          '<p style="font-weight:600;font-size:1.1rem;margin-bottom:4px">' + escapeHtml(r.nome || '--') + '</p>' +
          '<p style="color:var(--text-muted);font-size:14px">' + escapeHtml(r.email || '--') + '</p>' +
          (r.telefone ? '<p style="color:var(--text-muted);font-size:14px">' + escapeHtml(r.telefone) + '</p>' : '') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;background:var(--bg);padding:16px;border-radius:var(--radius-sm)">' +
          '<div><p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Check-in</p><p style="font-weight:600">' + formatarData(r.checkin) + '</p></div>' +
          '<div><p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Check-out</p><p style="font-weight:600">' + formatarData(r.checkout) + '</p></div>' +
          '<div><p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Hospedes</p><p style="font-weight:600">' + (r.hospedes || '--') + '</p></div>' +
        '</div>' +
        '<div style="margin-bottom:16px"><p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Status</p><span class="badge badge--' + ({nova:'warning',confirmada:'ativo',recusada:'danger',cancelada:'inativo'}[status]||'warning') + '">' + status + '</span></div>' +
        (r.mensagem ? '<div style="margin-bottom:16px"><p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Mensagem do Hospede</p><div style="background:var(--bg);padding:12px;border-radius:var(--radius-sm);white-space:pre-wrap;line-height:1.6;font-size:14px">' + escapeHtml(r.mensagem) + '</div></div>' : '') +
        '<div style="margin-bottom:16px"><p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Recebido em</p><p>' + formatarData(r.created_at) + '</p></div>' +
        '<div class="form-group"><label>Observacoes internas</label><textarea id="campo-reserva-obs" rows="3" placeholder="Notas internas sobre esta reserva...">' + escapeHtml(r.observacoes || '') + '</textarea></div>';
    }
  });

  $('#modal-overlay').classList.remove('escondido');
}

/* ================================================================== */
/*  MENSAGENS                                                         */
/* ================================================================== */
async function carregarMensagens() {
  try {
    var data = await supaFetch('mensagens_contato?select=*&order=created_at.desc');
    var tbody = $('#tbody-mensagens');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">Nenhuma mensagem encontrada</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function(m) {
      var lida = m.lida === true;
      var statusClass = lida ? 'lida' : 'nao-lida';
      var statusText = lida ? 'Lida' : 'Nao lida';
      var msg = m.mensagem || '';
      var msgTruncada = msg.length > 60 ? msg.substring(0, 57) + '...' : msg;

      return '<tr style="cursor:pointer" onclick="abrirModalMensagem(\'' + m.id + '\')">' +
        '<td>' + escapeHtml(m.nome || '--') + '</td>' +
        '<td>' + escapeHtml(m.email || '--') + '</td>' +
        '<td><span class="msg-preview">' + escapeHtml(msgTruncada) + '</span></td>' +
        '<td>' + formatarData(m.created_at) + '</td>' +
        '<td><span class="badge badge--' + statusClass + '">' + statusText + '</span></td>' +
        '<td onclick="event.stopPropagation()">' +
          (lida
            ? '<span style="color:var(--text-muted);font-size:12px">--</span>'
            : '<button class="btn btn--small btn--secondary" onclick="marcarComoLida(\'' + m.id + '\')">Marcar lida</button>') +
        '</td>' +
        '</tr>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar mensagens:', err);
    $('#tbody-mensagens').innerHTML = '<tr><td colspan="6" class="placeholder">Erro ao carregar</td></tr>';
  }
}

function abrirModalMensagem(id) {
  modalModo = 'mensagem-ver';
  modalItemId = id;

  $('#modal-titulo').textContent = 'Mensagem';
  $('#modal-body').innerHTML = '<p class="placeholder">Carregando...</p>';

  // Esconder botao salvar para mensagens (somente visualizacao)
  $('#modal-btn-salvar').style.display = 'none';

  supaFetch('mensagens_contato?id=eq.' + id).then(function(data) {
    if (data && data.length > 0) {
      var m = data[0];
      $('#modal-body').innerHTML =
        '<div style="margin-bottom:16px">' +
          '<p style="font-weight:600;margin-bottom:4px">' + escapeHtml(m.nome || '--') + '</p>' +
          '<p style="color:var(--text-muted);font-size:14px">' + escapeHtml(m.email || '--') + '</p>' +
          '<p style="color:var(--text-muted);font-size:12px">' + formatarData(m.created_at) + '</p>' +
        '</div>' +
        '<div style="background:var(--bg);padding:16px;border-radius:var(--radius-sm);white-space:pre-wrap;line-height:1.6">' +
          escapeHtml(m.mensagem || '') +
        '</div>';

      // Marcar como lida automaticamente ao abrir
      if (!m.lida) {
        supaUpdate('mensagens_contato', id, { lida: true }).then(function() {
          carregarMensagens();
        });
      }
    }
  });

  $('#modal-overlay').classList.remove('escondido');
}

async function marcarComoLida(id) {
  try {
    await supaUpdate('mensagens_contato', id, { lida: true });
    mostrarToast('Mensagem marcada como lida');
    carregarMensagens();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao marcar mensagem', 'error');
  }
}

/* ================================================================== */
/*  PLAYLISTS SPOTIFY                                                 */
/* ================================================================== */

async function carregarPlaylists() {
  try {
    var data = await supaFetch('playlists?select=*&order=ordem.asc');
    var grid = $('#grid-playlists');

    if (!data || data.length === 0) {
      grid.innerHTML = '<p class="placeholder">Nenhuma playlist cadastrada</p>';
      return;
    }

    grid.innerHTML = data.map(function(p) {
      var embedUrl = p.spotify_embed_url || '';
      // Converter URL normal para embed se necessário
      if (embedUrl.indexOf('/embed/') === -1 && embedUrl.indexOf('open.spotify.com') !== -1) {
        embedUrl = embedUrl.replace('open.spotify.com/', 'open.spotify.com/embed/');
      }

      return '<div class="card-playlist">' +
        '<div class="card-playlist__header">' +
          '<div class="card-playlist__info">' +
            '<h3 class="card-playlist__nome">' + escapeHtml(p.nome || '--') + '</h3>' +
            '<p class="card-playlist__desc">' + escapeHtml(p.descricao || '') + '</p>' +
          '</div>' +
          '<div class="card-playlist__acoes">' +
            '<span class="badge badge--' + (p.ativo !== false ? 'ativo' : 'inativo') + '">' + (p.ativo !== false ? 'Ativa' : 'Inativa') + '</span>' +
            '<button class="btn btn--small btn--secondary" onclick="abrirModalPlaylist(\'' + p.id + '\')">Editar</button>' +
            '<button class="btn btn--small btn--danger" onclick="togglePlaylist(\'' + p.id + '\',' + (p.ativo !== false) + ')">' + (p.ativo !== false ? 'Desativar' : 'Ativar') + '</button>' +
          '</div>' +
        '</div>' +
        (embedUrl ? '<div class="card-playlist__embed"><iframe src="' + escapeHtml(embedUrl) + '" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe></div>' : '<p class="placeholder" style="padding:12px">Sem URL de embed</p>') +
        '<div class="card-playlist__footer">Ordem: ' + (p.ordem || 0) +
          ' <button class="btn-reorder" onclick="reordenarPlaylist(\'' + p.id + '\',-1)" title="Subir">▲</button>' +
          ' <button class="btn-reorder" onclick="reordenarPlaylist(\'' + p.id + '\',1)" title="Descer">▼</button>' +
        '</div>' +
        '</div>';
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar playlists:', err);
    $('#grid-playlists').innerHTML = '<p class="placeholder">Erro ao carregar</p>';
  }
}

function abrirModalPlaylist(id) {
  modalModo = id ? 'playlist-editar' : 'playlist-nova';
  modalItemId = id || null;

  $('#modal-titulo').textContent = id ? 'Editar Playlist' : 'Nova Playlist';
  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Nome</label><input type="text" id="campo-pl-nome" placeholder="Ex: Tropicalia Bahiana"></div>' +
    '<div class="form-group"><label>Descricao</label><textarea id="campo-pl-desc" rows="2" placeholder="Descricao da playlist"></textarea></div>' +
    '<div class="form-group"><label>URL Spotify (embed ou normal)</label><input type="text" id="campo-pl-url" placeholder="https://open.spotify.com/playlist/..."></div>' +
    '<div class="form-group"><label>Ordem</label><input type="number" id="campo-pl-ordem" min="0" value="0"></div>';

  if (id) {
    supaFetch('playlists?id=eq.' + id).then(function(data) {
      if (data && data.length > 0) {
        var p = data[0];
        $('#campo-pl-nome').value = p.nome || '';
        $('#campo-pl-desc').value = p.descricao || '';
        $('#campo-pl-url').value = p.spotify_embed_url || '';
        $('#campo-pl-ordem').value = p.ordem || 0;
      }
    });
  }

  // Mostrar botão salvar
  var btnSalvar = document.querySelector('#modal-overlay .btn--primary');
  if (btnSalvar) btnSalvar.style.display = '';

  $('#modal-overlay').classList.remove('escondido');
}

async function togglePlaylist(id, atualmenteAtiva) {
  try {
    await supaUpdate('playlists', id, { ativo: !atualmenteAtiva });
    mostrarToast(atualmenteAtiva ? 'Playlist desativada' : 'Playlist ativada');
    carregarPlaylists();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao alterar status', 'error');
  }
}

var cachePlaylistsOrdem = [];

async function reordenarPlaylist(id, direcao) {
  try {
    if (cachePlaylistsOrdem.length === 0) {
      cachePlaylistsOrdem = await supaFetch('playlists?select=id,ordem&order=ordem.asc');
    }
    var idx = cachePlaylistsOrdem.findIndex(function(p) { return p.id === id; });
    var targetIdx = idx + direcao;
    if (targetIdx < 0 || targetIdx >= cachePlaylistsOrdem.length) return;

    var ordemAtual = cachePlaylistsOrdem[idx].ordem;
    var ordemTarget = cachePlaylistsOrdem[targetIdx].ordem;

    await Promise.all([
      supaUpdate('playlists', id, { ordem: ordemTarget }),
      supaUpdate('playlists', cachePlaylistsOrdem[targetIdx].id, { ordem: ordemAtual }),
    ]);

    cachePlaylistsOrdem = [];
    carregarPlaylists();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao reordenar', 'error');
  }
}

/* ================================================================== */
/*  CONTEUDO DO SITE                                                  */
/* ================================================================== */
var cacheSecoes = [];

/* ---- Seed: secoes padrao do site com conteudo atual ---- */
var SECOES_PADRAO = [
  {
    slug: 'hero', ordem: 1, visivel: true,
    titulo_pt: 'LABAREDA', titulo_en: 'LABAREDA',
    subtitulo_pt: 'ROCA & ARTE', subtitulo_en: 'FARM & ART',
    conteudo_pt: 'Serra Grande \u00b7 Costa do Cacau \u00b7 Bahia',
    conteudo_en: 'Serra Grande \u00b7 Cocoa Coast \u00b7 Bahia',
    botao_texto_pt: '', botao_texto_en: '', botao_url: '', video_url: '',
  },
  {
    slug: 'experience', ordem: 2, visivel: true,
    titulo_pt: 'Sobre o Sitio', titulo_en: 'About the Farm',
    subtitulo_pt: 'Um santuario de roca e arte', subtitulo_en: 'A sanctuary of farm and art',
    conteudo_pt: 'Um santuario de roca e arte no coracao da Costa do Cacau.\nMata viva, lagoas cristalinas, praia logo ali \u2014 e o cafe da manha que a terra deu de manha.',
    conteudo_en: 'A sanctuary of farm and art in the heart of the Cocoa Coast.\nLiving forest, crystal lagoons, beach nearby \u2014 and the breakfast that the land gave this morning.',
    botao_texto_pt: 'RESERVA DIRETA', botao_texto_en: 'DIRECT BOOKING', botao_url: '', video_url: '',
  },
  {
    slug: 'manifesto', ordem: 3, visivel: true,
    titulo_pt: 'MANIFESTO', titulo_en: 'MANIFESTO',
    subtitulo_pt: '', subtitulo_en: '',
    conteudo_pt: 'Nossa agrofloresta e um organismo vivo no meio da Mata Atlantica. E dela que vem a fruta do seu cafe, o cheiro do nosso creme, a cor que vira arte. Quando voce caminha entre o cacau, esta caminhando dentro da fonte.\n\nSem cenario. Sem fachada. So o que se vive.',
    conteudo_en: 'Our agroforest is a living organism within the Atlantic Forest. From it comes the fruit in your coffee, the scent of our cream, the color that becomes art. When you walk among the cacao trees, you walk inside the source.\n\nNo scenery. No facade. Only what is lived.',
    botao_texto_pt: '', botao_texto_en: '', botao_url: '', video_url: '',
  },
  {
    slug: 'book', ordem: 4, visivel: true,
    titulo_pt: 'Reservas', titulo_en: 'Book',
    subtitulo_pt: 'Hospedagem', subtitulo_en: 'Accommodation',
    conteudo_pt: 'Escolha quando quer viver a roca e a arte.\nPoucas unidades, atencao de verdade \u2014 os melhores periodos costumam fechar cedo.',
    conteudo_en: 'Choose when you want to live the farm and the art.\nFew units, real attention \u2014 the best periods tend to fill up early.',
    botao_texto_pt: 'RESERVAR', botao_texto_en: 'BOOK NOW', botao_url: 'https://www.airbnb.com.br/', video_url: '',
  },
  {
    slug: 'radio', ordem: 5, visivel: true,
    titulo_pt: 'Labareda Radio', titulo_en: 'Labareda Radio',
    subtitulo_pt: 'A trilha sonora da roca. Ouca nossas playlists curadas.', subtitulo_en: 'The farm soundtrack. Listen to our curated playlists.',
    conteudo_pt: 'Radio', conteudo_en: 'Radio',
    botao_texto_pt: '', botao_texto_en: '', botao_url: '', video_url: '',
  },
  {
    slug: 'shop', ordem: 6, visivel: true,
    titulo_pt: 'Leve um pedaco para casa', titulo_en: 'Take a piece home',
    subtitulo_pt: 'Produtos artesanais feitos com amor e materia-prima da regiao.', subtitulo_en: 'Handmade products made with love and local raw materials.',
    conteudo_pt: 'Loja', conteudo_en: 'Shop',
    botao_texto_pt: '', botao_texto_en: '', botao_url: '', video_url: '',
  },
  {
    slug: 'journal', ordem: 7, visivel: true,
    titulo_pt: 'Diario da Roca', titulo_en: 'Farm Journal',
    subtitulo_pt: 'Historias, imagens e cronicas da vida na roca.', subtitulo_en: 'Stories, images and chronicles from life on the farm.',
    conteudo_pt: 'Diario', conteudo_en: 'Journal',
    botao_texto_pt: '', botao_texto_en: '', botao_url: '', video_url: '',
  },
  {
    slug: 'depoimentos', ordem: 8, visivel: true,
    titulo_pt: 'Quem ja viveu, conta', titulo_en: 'Those who lived it, tell',
    subtitulo_pt: 'Depoimentos', subtitulo_en: 'Testimonials',
    conteudo_pt: 'Depoimentos de hospedes', conteudo_en: 'Guest testimonials',
    botao_texto_pt: '', botao_texto_en: '', botao_url: '', video_url: '',
  },
  {
    slug: 'faq', ordem: 9, visivel: true,
    titulo_pt: 'Perguntas que a gente sempre ouve', titulo_en: 'Questions we always hear',
    subtitulo_pt: 'Duvidas frequentes', subtitulo_en: 'FAQ',
    conteudo_pt: 'Duvidas frequentes', conteudo_en: 'Frequently asked questions',
    botao_texto_pt: '', botao_texto_en: '', botao_url: '', video_url: '',
  },
  {
    slug: 'contato', ordem: 10, visivel: true,
    titulo_pt: 'Fale conosco', titulo_en: 'Contact us',
    subtitulo_pt: 'Contato', subtitulo_en: 'Contact',
    conteudo_pt: 'Estamos na Serra Grande, Costa do Cacau, sul da Bahia, atencao nossa do inicio ao fim.',
    conteudo_en: 'We are in Serra Grande, Cocoa Coast, southern Bahia. Our full attention from start to finish.',
    botao_texto_pt: 'Falar no WhatsApp', botao_texto_en: 'Chat on WhatsApp', botao_url: 'https://wa.me/5573999999999', video_url: '',
  },
];

async function sincronizarSecoesDoSite() {
  try {
    mostrarToast('Sincronizando secoes...', 'success');
    var existentes = await supaFetch('site_secoes?select=slug');
    var slugsExistentes = (existentes || []).map(function(s) { return s.slug; });

    var novas = SECOES_PADRAO.filter(function(s) {
      return slugsExistentes.indexOf(s.slug) === -1;
    });

    if (novas.length === 0) {
      mostrarToast('Todas as secoes ja existem!');
      return;
    }

    for (var i = 0; i < novas.length; i++) {
      await supaInsert('site_secoes', novas[i]);
    }

    mostrarToast(novas.length + ' secao(oes) criada(s)!');
    carregarConteudoSite();
  } catch (err) {
    console.error('Erro ao sincronizar:', err);
    mostrarToast('Erro ao sincronizar: ' + err.message, 'error');
  }
}

/* ---- Icones por tipo de secao ---- */
var SECAO_ICONS = {
  hero: '&#127968;',
  about: '&#128196;',
  sobre: '&#128196;',
  experience: '&#127793;',
  manifesto: '&#128220;',
  book: '&#128197;',
  radio: '&#127925;',
  shop: '&#128722;',
  journal: '&#128221;',
  depoimentos: '&#128172;',
  testimonials: '&#128172;',
  faq: '&#10067;',
  contact: '&#9993;',
  contato: '&#9993;',
  galeria: '&#127748;',
  gallery: '&#127748;',
  servicos: '&#9881;',
  parceiros: '&#129309;',
  menu: '&#127860;',
  cardapio: '&#127860;',
  reservas: '&#128197;',
  experiencias: '&#127793;',
};

function getSecaoIcon(slug) {
  var key = (slug || '').toLowerCase();
  return SECAO_ICONS[key] || '&#9726;';
}

function getSecaoDisplayName(slug) {
  var names = {
    hero: 'Hero / Banner Principal',
    about: 'Sobre Nos',
    experience: 'Experiencia / Tagline',
    manifesto: 'Manifesto',
    book: 'Reservas',
    radio: 'Radio',
    shop: 'Loja',
    journal: 'Diario / Journal',
    depoimentos: 'Depoimentos',
    faq: 'Perguntas Frequentes',
    contact: 'Contato',
    contato: 'Contato',
    galeria: 'Galeria',
    servicos: 'Servicos',
    menu: 'Cardapio',
    cardapio: 'Cardapio',
    reservas: 'Reservas',
    experiencias: 'Experiencias',
  };
  var key = (slug || '').toLowerCase();
  return names[key] || slug.charAt(0).toUpperCase() + slug.slice(1);
}

async function carregarConteudoSite() {
  try {
    var secoes = await supaFetch('site_secoes?select=*&order=ordem.asc');
    cacheSecoes = secoes || [];
    renderizarSecoes(cacheSecoes);
  } catch (err) {
    console.error('Erro ao carregar conteudo do site:', err);
    $('#secoes-container').innerHTML = '<p class="placeholder">Erro ao carregar secoes</p>';
    mostrarToast('Erro ao carregar conteudo', 'error');
  }
}

function renderizarSecoes(secoes) {
  var container = $('#secoes-container');
  if (!secoes || secoes.length === 0) {
    container.innerHTML = '<p class="placeholder">Nenhuma secao encontrada. Adicione uma nova secao abaixo.</p>';
    renderizarAddSecao();
    return;
  }

  container.innerHTML = secoes.map(function(s, idx) {
    var visivel = s.visivel !== false;
    var slug = s.slug || '--';
    var hasImg = !!s.imagem_fundo;
    var previewClass = hasImg ? 'secao-card__preview' : 'secao-card__preview secao-card__preview--empty';
    var previewStyle = hasImg ? ' style="background-image:url(\'' + escapeHtml(s.imagem_fundo) + '\')"' : '';
    var displayName = getSecaoDisplayName(slug);
    var icon = getSecaoIcon(slug);

    return '<div class="secao-card" data-secao-id="' + s.id + '">' +
      /* -- Visual Preview Header -- */
      '<div class="' + previewClass + '"' + previewStyle + ' onclick="toggleSecaoCard(\'' + s.id + '\')">' +
        '<div class="secao-card__preview-overlay"></div>' +
        '<div class="secao-card__preview-info">' +
          '<div class="secao-card__preview-title">' + icon + ' ' + escapeHtml(displayName) + '</div>' +
          '<div class="secao-card__preview-slug">' + escapeHtml(slug) + '</div>' +
        '</div>' +
      '</div>' +

      /* -- Toolbar -- */
      '<div class="secao-card__toolbar">' +
        '<div class="secao-card__toolbar-group">' +
          '<button class="btn-toolbar' + (visivel ? ' btn-toolbar--active' : '') + '" onclick="toggleVisibilidadeSecao(\'' + s.id + '\',' + !visivel + ')" title="' + (visivel ? 'Ocultar secao' : 'Mostrar secao') + '">' +
            (visivel ? '&#128065; Visivel' : '&#128683; Oculto') +
          '</button>' +
        '</div>' +
        '<div class="secao-card__toolbar-group">' +
          '<button class="btn-toolbar" onclick="reordenarSecao(\'' + s.id + '\',-1)" title="Mover para cima"' + (idx === 0 ? ' disabled' : '') + '>&#9650; Subir</button>' +
          '<button class="btn-toolbar" onclick="reordenarSecao(\'' + s.id + '\',1)" title="Mover para baixo"' + (idx === secoes.length - 1 ? ' disabled' : '') + '>&#9660; Descer</button>' +
        '</div>' +
        '<div class="secao-card__toolbar-spacer"></div>' +
        '<div class="secao-card__toolbar-group">' +
          '<button class="btn-toolbar btn-toolbar--save" onclick="salvarSecao(\'' + s.id + '\')">&#128190; Salvar</button>' +
          '<button class="btn-toolbar" onclick="toggleSecaoCard(\'' + s.id + '\')" id="toggle-' + s.id + '">&#9662; Editar</button>' +
        '</div>' +
      '</div>' +

      /* -- Body (expandable) -- */
      '<div class="secao-card__body" id="body-' + s.id + '">' +

        /* -- Language Tabs -- */
        '<div class="secao-lang-tabs">' +
          '<button class="secao-lang-tab secao-lang-tab--active" onclick="switchLangTab(\'' + s.id + '\',\'pt\')" id="tab-pt-' + s.id + '">' +
            '<span class="secao-lang-tab__flag">&#127463;&#127479;</span> Portugues' +
          '</button>' +
          '<button class="secao-lang-tab" onclick="switchLangTab(\'' + s.id + '\',\'en\')" id="tab-en-' + s.id + '">' +
            '<span class="secao-lang-tab__flag">&#127482;&#127480;</span> English' +
          '</button>' +
        '</div>' +

        /* -- PT Panel -- */
        '<div class="secao-lang-panel secao-lang-panel--active" id="panel-pt-' + s.id + '">' +
          '<div class="wp-field">' +
            '<label class="wp-field__label">Titulo</label>' +
            '<input type="text" class="wp-field__input wp-field__input--large" id="titulo-pt-' + s.id + '" value="' + escapeHtml(s.titulo_pt || '') + '" placeholder="Digite o titulo...">' +
          '</div>' +
          '<div class="wp-field">' +
            '<label class="wp-field__label">Subtitulo</label>' +
            '<input type="text" class="wp-field__input" id="subtitulo-pt-' + s.id + '" value="' + escapeHtml(s.subtitulo_pt || '') + '" placeholder="Subtitulo opcional...">' +
          '</div>' +
          renderConteudoField(s, 'pt', slug) +
          '<div class="wp-field-row">' +
            '<div class="wp-field">' +
              '<label class="wp-field__label">Texto do Botao (CTA)</label>' +
              '<input type="text" class="wp-field__input" id="btn-texto-pt-' + s.id + '" value="' + escapeHtml(s.botao_texto_pt || '') + '" placeholder="Ex: Saiba Mais">' +
            '</div>' +
            '<div class="wp-field">' +
              '<label class="wp-field__label">URL do Botao</label>' +
              '<input type="text" class="wp-field__input" id="btn-url-' + s.id + '" value="' + escapeHtml(s.botao_url || '') + '" placeholder="https://...">' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* -- EN Panel -- */
        '<div class="secao-lang-panel" id="panel-en-' + s.id + '">' +
          '<div class="wp-field">' +
            '<label class="wp-field__label">Title</label>' +
            '<input type="text" class="wp-field__input wp-field__input--large" id="titulo-en-' + s.id + '" value="' + escapeHtml(s.titulo_en || '') + '" placeholder="Enter the title...">' +
          '</div>' +
          '<div class="wp-field">' +
            '<label class="wp-field__label">Subtitle</label>' +
            '<input type="text" class="wp-field__input" id="subtitulo-en-' + s.id + '" value="' + escapeHtml(s.subtitulo_en || '') + '" placeholder="Optional subtitle...">' +
          '</div>' +
          renderConteudoField(s, 'en', slug) +
          '<div class="wp-field-row">' +
            '<div class="wp-field">' +
              '<label class="wp-field__label">Button Text (CTA)</label>' +
              '<input type="text" class="wp-field__input" id="btn-texto-en-' + s.id + '" value="' + escapeHtml(s.botao_texto_en || '') + '" placeholder="Ex: Learn More">' +
            '</div>' +
            '<div class="wp-field">' +
              '<label class="wp-field__label">Button URL</label>' +
              '<input type="text" class="wp-field__input" id="btn-url-en-' + s.id + '" value="' + escapeHtml(s.botao_url || '') + '" placeholder="https://..." disabled>' +
              '<span class="wp-field__hint">Compartilhado com PT</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* -- Media Section -- */
        '<div class="secao-media">' +
          '<div class="secao-media__title">&#127912; Midia</div>' +

          /* Imagem de Fundo - Drop Zone */
          '<div class="wp-field">' +
            '<label class="wp-field__label">Imagem de Fundo</label>' +
            '<div class="wp-dropzone' + (hasImg ? ' wp-dropzone--has-image' : '') + '" id="dropzone-' + s.id + '" onclick="triggerFundoUpload(\'' + s.id + '\')"' +
              ' ondragover="event.preventDefault();this.classList.add(\'wp-dropzone--dragover\')"' +
              ' ondragleave="this.classList.remove(\'wp-dropzone--dragover\')"' +
              ' ondrop="handleFundoDrop(event,\'' + s.id + '\')">' +
              (hasImg ?
                '<div class="wp-dropzone__preview-wrap">' +
                  '<img class="wp-dropzone__preview-img" src="' + escapeHtml(s.imagem_fundo) + '" alt="Fundo">' +
                  '<div class="wp-dropzone__preview-actions">' +
                    '<button class="wp-dropzone__preview-btn" onclick="event.stopPropagation();triggerFundoUpload(\'' + s.id + '\')">Trocar</button>' +
                    '<button class="wp-dropzone__preview-btn wp-dropzone__preview-btn--danger" onclick="event.stopPropagation();removerFundoSecao(\'' + s.id + '\')">Remover</button>' +
                  '</div>' +
                '</div>'
                :
                '<span class="wp-dropzone__icon">&#128247;</span>' +
                '<div class="wp-dropzone__text">Arraste uma imagem ou <strong>clique para escolher</strong></div>' +
                '<div class="wp-dropzone__hint">JPG, PNG ou WebP - Recomendado: 1920x1080px</div>'
              ) +
              '<input type="file" class="wp-dropzone__input" id="fundo-file-' + s.id + '" accept="image/*" onchange="previewFundoSecao(\'' + s.id + '\', this)" style="display:none">' +
            '</div>' +
          '</div>' +

          /* Video URL */
          '<div class="wp-field">' +
            '<label class="wp-field__label">Video (URL)</label>' +
            '<input type="text" class="wp-field__input" id="video-' + s.id + '" value="' + escapeHtml(s.video_url || '') + '" placeholder="https://youtube.com/... ou https://vimeo.com/...">' +
            '<span class="wp-field__hint">YouTube, Vimeo ou link direto do video</span>' +
          '</div>' +
        '</div>' +

        /* -- Gallery Section -- */
        '<div class="secao-galeria-wrap">' +
          '<div class="secao-galeria-wrap__title">&#127748; Galeria de Imagens</div>' +
          '<div id="galeria-' + s.id + '" class="secao-galeria"><p class="placeholder" style="grid-column:1/-1">Carregando galeria...</p></div>' +
        '</div>' +

      '</div>' +
    '</div>';
  }).join('');

  // Carregar galeria de cada secao
  secoes.forEach(function(s) {
    carregarGaleriaSecao(s.id, s.slug);
  });

  renderizarAddSecao();
}

function renderizarAddSecao() {
  var area = $('#secao-add-area');
  if (!area) return;
  area.innerHTML = '<div class="secao-add-card" onclick="mostrarFormNovaSecao()">' +
    '<span class="secao-add-card__icon">+</span>' +
    '<span class="secao-add-card__text">Adicionar Nova Secao</span>' +
  '</div>';
}

function mostrarFormNovaSecao() {
  var area = $('#secao-add-area');
  if (!area) return;
  area.innerHTML = '<div class="secao-add-modal">' +
    '<div class="secao-add-modal__title">Nova Secao</div>' +
    '<div class="secao-add-modal__row">' +
      '<div class="wp-field" style="margin:0">' +
        '<label class="wp-field__label">Slug (identificador)</label>' +
        '<input type="text" class="wp-field__input" id="nova-secao-slug" placeholder="Ex: hero, about, galeria...">' +
        '<span class="wp-field__hint">Sem espacos, letras minusculas</span>' +
      '</div>' +
      '<div class="wp-field" style="margin:0">' +
        '<label class="wp-field__label">Titulo (PT)</label>' +
        '<input type="text" class="wp-field__input" id="nova-secao-titulo" placeholder="Titulo da secao">' +
      '</div>' +
    '</div>' +
    '<div class="secao-add-modal__actions">' +
      '<button class="btn btn--secondary" onclick="renderizarAddSecao()">Cancelar</button>' +
      '<button class="btn btn--primary" onclick="criarNovaSecao()">Criar Secao</button>' +
    '</div>' +
  '</div>';
  var slugInput = $('#nova-secao-slug');
  if (slugInput) slugInput.focus();
}

async function criarNovaSecao() {
  var slug = valor('nova-secao-slug').toLowerCase().replace(/[^a-z0-9-_]/g, '');
  var titulo = valor('nova-secao-titulo');
  if (!slug) { mostrarToast('Informe um slug para a secao', 'error'); return; }

  // Verificar slug duplicado
  var existe = cacheSecoes.find(function(s) { return s.slug === slug; });
  if (existe) { mostrarToast('Ja existe uma secao com este slug', 'error'); return; }

  try {
    var maxOrdem = 0;
    cacheSecoes.forEach(function(s) { if (s.ordem > maxOrdem) maxOrdem = s.ordem; });

    await supaInsert('site_secoes', {
      slug: slug,
      titulo_pt: titulo || slug,
      titulo_en: titulo || slug,
      subtitulo_pt: '',
      subtitulo_en: '',
      conteudo_pt: '',
      conteudo_en: '',
      imagem_fundo: null,
      video_url: '',
      botao_texto_pt: '',
      botao_texto_en: '',
      botao_url: '',
      visivel: true,
      ordem: maxOrdem + 1,
    });

    mostrarToast('Secao criada!');
    carregarConteudoSite();
  } catch (err) {
    console.error('Erro ao criar secao:', err);
    mostrarToast('Erro ao criar secao: ' + err.message, 'error');
  }
}

/* ---- FAQ Repeater Editor ---- */
function parseFaqFromText(text) {
  if (!text) return [];
  var items = [];
  var blocos = text.split('\n\n').filter(function(b) { return b.trim(); });
  blocos.forEach(function(bloco) {
    var linhas = bloco.split('\n');
    var pergunta = '', resposta = '';
    linhas.forEach(function(l) {
      if (l.match(/^[PQ]:\s*/)) pergunta = l.replace(/^[PQ]:\s*/, '');
      else if (l.match(/^[RA]:\s*/)) resposta = l.replace(/^[RA]:\s*/, '');
    });
    if (pergunta || resposta) items.push({ q: pergunta, a: resposta });
  });
  return items;
}

function faqToText(secaoId, lang) {
  var prefix = lang === 'en' ? 'Q' : 'P';
  var aPrefix = lang === 'en' ? 'A' : 'R';
  var items = [];
  var container = $('#faq-repeater-' + lang + '-' + secaoId);
  if (!container) return '';
  var cards = container.querySelectorAll('.wp-repeater__item');
  cards.forEach(function(card, idx) {
    var q = card.querySelector('.faq-q-input');
    var a = card.querySelector('.faq-a-input');
    if (q && a && (q.value.trim() || a.value.trim())) {
      items.push(prefix + ': ' + q.value.trim() + '\n' + aPrefix + ': ' + a.value.trim());
    }
  });
  return items.join('\n\n');
}

function renderFaqRepeater(secaoId, lang, text) {
  var items = parseFaqFromText(text);
  if (items.length === 0) items = [{ q: '', a: '' }];
  var html = '<div class="wp-repeater" id="faq-repeater-' + lang + '-' + secaoId + '">';
  items.forEach(function(item, idx) {
    html += renderFaqItem(secaoId, lang, idx, item.q, item.a, items.length);
  });
  html += '</div>';
  html += '<button class="wp-repeater__add" onclick="addFaqItem(\'' + secaoId + '\',\'' + lang + '\')" type="button">+ Adicionar Pergunta</button>';
  return html;
}

function renderFaqItem(secaoId, lang, idx, q, a, total) {
  return '<div class="wp-repeater__item">' +
    '<div class="wp-repeater__item-header">' +
      '<span class="wp-repeater__item-num">' + (idx + 1) + '</span>' +
      '<div class="wp-repeater__item-actions">' +
        (idx > 0 ? '<button class="wp-repeater__item-btn" onclick="moveFaqItem(\'' + secaoId + '\',\'' + lang + '\',' + idx + ',-1)" title="Subir">&#9650;</button>' : '') +
        (idx < total - 1 ? '<button class="wp-repeater__item-btn" onclick="moveFaqItem(\'' + secaoId + '\',\'' + lang + '\',' + idx + ',1)" title="Descer">&#9660;</button>' : '') +
        '<button class="wp-repeater__item-btn wp-repeater__item-btn--danger" onclick="removeFaqItem(\'' + secaoId + '\',\'' + lang + '\',' + idx + ')" title="Remover">&times;</button>' +
      '</div>' +
    '</div>' +
    '<div class="wp-field" style="margin-bottom:10px">' +
      '<label class="wp-field__label">Pergunta</label>' +
      '<input type="text" class="wp-field__input faq-q-input" value="' + escapeHtml(q) + '" placeholder="Digite a pergunta...">' +
    '</div>' +
    '<div class="wp-field" style="margin-bottom:0">' +
      '<label class="wp-field__label">Resposta</label>' +
      '<textarea class="wp-field__textarea faq-a-input" rows="2" placeholder="Digite a resposta...">' + escapeHtml(a) + '</textarea>' +
    '</div>' +
  '</div>';
}

function addFaqItem(secaoId, lang) {
  var container = $('#faq-repeater-' + lang + '-' + secaoId);
  if (!container) return;
  var items = container.querySelectorAll('.wp-repeater__item');
  var total = items.length + 1;
  var div = document.createElement('div');
  div.innerHTML = renderFaqItem(secaoId, lang, items.length, '', '', total);
  container.appendChild(div.firstChild);
  rebuildFaqNumbers(secaoId, lang);
}

function removeFaqItem(secaoId, lang, idx) {
  var container = $('#faq-repeater-' + lang + '-' + secaoId);
  if (!container) return;
  var items = container.querySelectorAll('.wp-repeater__item');
  if (items.length <= 1) return;
  items[idx].remove();
  rebuildFaqNumbers(secaoId, lang);
}

function moveFaqItem(secaoId, lang, idx, dir) {
  var container = $('#faq-repeater-' + lang + '-' + secaoId);
  if (!container) return;
  var items = Array.from(container.querySelectorAll('.wp-repeater__item'));
  var newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= items.length) return;
  if (dir === -1) container.insertBefore(items[idx], items[newIdx]);
  else container.insertBefore(items[newIdx], items[idx]);
  rebuildFaqNumbers(secaoId, lang);
}

function rebuildFaqNumbers(secaoId, lang) {
  var container = $('#faq-repeater-' + lang + '-' + secaoId);
  if (!container) return;
  var items = container.querySelectorAll('.wp-repeater__item');
  items.forEach(function(item, idx) {
    var num = item.querySelector('.wp-repeater__item-num');
    if (num) num.textContent = idx + 1;
  });
}

/* ---- Depoimentos Repeater Editor ---- */
function parseDepoFromText(text) {
  if (!text) return [];
  var items = [];
  var blocos = text.split('\n\n').filter(function(b) { return b.trim(); });
  blocos.forEach(function(bloco) {
    var linhas = bloco.split('\n');
    var quote = '', author = '', origin = '';
    linhas.forEach(function(l) {
      var t = l.trim();
      if (t.match(/^[""\u201C]/)) {
        quote = t.replace(/^[""\u201C]/, '').replace(/[""\u201D]$/, '');
      } else if (t.match(/^[\u2014\u2013—-]\s*/)) {
        var parts = t.replace(/^[\u2014\u2013—-]\s*/, '').split(',');
        author = parts[0] ? parts[0].trim() : '';
        origin = parts.slice(1).join(',').trim();
      }
    });
    if (quote || author) items.push({ quote: quote, author: author, origin: origin });
  });
  return items;
}

function depoToText(secaoId, lang) {
  var items = [];
  var container = $('#depo-repeater-' + lang + '-' + secaoId);
  if (!container) return '';
  var cards = container.querySelectorAll('.wp-repeater__item');
  cards.forEach(function(card) {
    var q = card.querySelector('.depo-quote-input');
    var a = card.querySelector('.depo-author-input');
    var o = card.querySelector('.depo-origin-input');
    if (q && a && (q.value.trim() || a.value.trim())) {
      var line = '\u201C' + q.value.trim() + '\u201D';
      line += '\n\u2014 ' + a.value.trim();
      if (o && o.value.trim()) line += ', ' + o.value.trim();
      items.push(line);
    }
  });
  return items.join('\n\n');
}

function renderDepoRepeater(secaoId, lang, text) {
  var items = parseDepoFromText(text);
  if (items.length === 0) items = [{ quote: '', author: '', origin: '' }];
  var html = '<div class="wp-repeater" id="depo-repeater-' + lang + '-' + secaoId + '">';
  items.forEach(function(item, idx) {
    html += renderDepoItem(secaoId, lang, idx, item, items.length);
  });
  html += '</div>';
  html += '<button class="wp-repeater__add" onclick="addDepoItem(\'' + secaoId + '\',\'' + lang + '\')" type="button">+ Adicionar Depoimento</button>';
  return html;
}

function renderDepoItem(secaoId, lang, idx, item, total) {
  return '<div class="wp-repeater__item">' +
    '<div class="wp-repeater__item-header">' +
      '<span class="wp-repeater__item-num">' + (idx + 1) + '</span>' +
      '<div class="wp-repeater__item-actions">' +
        '<button class="wp-repeater__item-btn wp-repeater__item-btn--danger" onclick="removeDepoItem(\'' + secaoId + '\',\'' + lang + '\',' + idx + ')" title="Remover">&times;</button>' +
      '</div>' +
    '</div>' +
    '<div class="wp-field" style="margin-bottom:10px">' +
      '<label class="wp-field__label">Depoimento</label>' +
      '<textarea class="wp-field__textarea depo-quote-input" rows="3" placeholder="O que o hospede disse...">' + escapeHtml(item.quote) + '</textarea>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="wp-field" style="margin-bottom:0">' +
        '<label class="wp-field__label">Nome</label>' +
        '<input type="text" class="wp-field__input depo-author-input" value="' + escapeHtml(item.author) + '" placeholder="Carolina & Pedro">' +
      '</div>' +
      '<div class="wp-field" style="margin-bottom:0">' +
        '<label class="wp-field__label">Cidade / Origem</label>' +
        '<input type="text" class="wp-field__input depo-origin-input" value="' + escapeHtml(item.origin) + '" placeholder="Sao Paulo, SP">' +
      '</div>' +
    '</div>' +
  '</div>';
}

function addDepoItem(secaoId, lang) {
  var container = $('#depo-repeater-' + lang + '-' + secaoId);
  if (!container) return;
  var items = container.querySelectorAll('.wp-repeater__item');
  var div = document.createElement('div');
  div.innerHTML = renderDepoItem(secaoId, lang, items.length, { quote: '', author: '', origin: '' }, items.length + 1);
  container.appendChild(div.firstChild);
  rebuildDepoNumbers(secaoId, lang);
}

function removeDepoItem(secaoId, lang, idx) {
  var container = $('#depo-repeater-' + lang + '-' + secaoId);
  if (!container) return;
  var items = container.querySelectorAll('.wp-repeater__item');
  if (items.length <= 1) return;
  items[idx].remove();
  rebuildDepoNumbers(secaoId, lang);
}

function rebuildDepoNumbers(secaoId, lang) {
  var container = $('#depo-repeater-' + lang + '-' + secaoId);
  if (!container) return;
  var items = container.querySelectorAll('.wp-repeater__item');
  items.forEach(function(item, idx) {
    var num = item.querySelector('.wp-repeater__item-num');
    if (num) num.textContent = idx + 1;
  });
}

/* ---- Renderizar campo de conteudo (generico ou customizado) ---- */
function renderConteudoField(s, lang, slug) {
  var conteudo = lang === 'en' ? (s.conteudo_en || '') : (s.conteudo_pt || '');
  var labelPt = lang === 'en' ? 'Content / Description' : 'Conteudo / Descricao';
  var placeholderPt = lang === 'en' ? 'Write the content for this section...' : 'Escreva o conteudo desta secao...';

  try {
    if (slug === 'faq') {
      var faqLabel = lang === 'en' ? 'Questions & Answers' : 'Perguntas e Respostas';
      return '<div class="wp-field">' +
        '<label class="wp-field__label">' + faqLabel + '</label>' +
        renderFaqRepeater(s.id, lang, conteudo) +
        '<textarea class="wp-field__textarea escondido" id="conteudo-' + lang + '-' + s.id + '">' + escapeHtml(conteudo) + '</textarea>' +
      '</div>';
    }

    if (slug === 'depoimentos') {
      var depoLabel = lang === 'en' ? 'Testimonials' : 'Depoimentos';
      return '<div class="wp-field">' +
        '<label class="wp-field__label">' + depoLabel + '</label>' +
        renderDepoRepeater(s.id, lang, conteudo) +
        '<textarea class="wp-field__textarea escondido" id="conteudo-' + lang + '-' + s.id + '">' + escapeHtml(conteudo) + '</textarea>' +
      '</div>';
    }
  } catch (err) {
    console.error('Erro no editor customizado (' + slug + '):', err);
  }

  // Fallback: textarea generico
  return '<div class="wp-field">' +
    '<label class="wp-field__label">' + labelPt + '</label>' +
    '<textarea class="wp-field__textarea" id="conteudo-' + lang + '-' + s.id + '" rows="5" placeholder="' + placeholderPt + '">' + escapeHtml(conteudo) + '</textarea>' +
  '</div>';
}

/* ---- Tabs de idioma ---- */
function switchLangTab(secaoId, lang) {
  var tabs = ['pt', 'en'];
  tabs.forEach(function(t) {
    var tab = $('#tab-' + t + '-' + secaoId);
    var panel = $('#panel-' + t + '-' + secaoId);
    if (tab) tab.classList.toggle('secao-lang-tab--active', t === lang);
    if (panel) panel.classList.toggle('secao-lang-panel--active', t === lang);
  });
}

function toggleSecaoCard(secaoId) {
  var body = $('#body-' + secaoId);
  var toggle = $('#toggle-' + secaoId);
  if (body) {
    var isOpen = body.classList.toggle('aberto');
    if (toggle) {
      toggle.innerHTML = isOpen ? '&#9652; Fechar' : '&#9662; Editar';
    }
  }
}

/* ---- Imagem de fundo: Drop zone ---- */
function triggerFundoUpload(secaoId) {
  var fileInput = $('#fundo-file-' + secaoId);
  if (fileInput) fileInput.click();
}

function handleFundoDrop(event, secaoId) {
  event.preventDefault();
  var dropzone = $('#dropzone-' + secaoId);
  if (dropzone) dropzone.classList.remove('wp-dropzone--dragover');
  var files = event.dataTransfer.files;
  if (files && files.length > 0) {
    var fileInput = $('#fundo-file-' + secaoId);
    if (fileInput) {
      // Create a new DataTransfer to set files on input
      var dt = new DataTransfer();
      dt.items.add(files[0]);
      fileInput.files = dt.files;
      previewFundoSecao(secaoId, fileInput);
    }
  }
}

function previewFundoSecao(secaoId, input) {
  if (!input.files || !input.files[0]) return;
  var dropzone = $('#dropzone-' + secaoId);
  if (!dropzone) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    dropzone.className = 'wp-dropzone wp-dropzone--has-image';
    dropzone.innerHTML =
      '<div class="wp-dropzone__preview-wrap">' +
        '<img class="wp-dropzone__preview-img" src="' + e.target.result + '" alt="Preview">' +
        '<div class="wp-dropzone__preview-actions">' +
          '<button class="wp-dropzone__preview-btn" onclick="event.stopPropagation();triggerFundoUpload(\'' + secaoId + '\')">Trocar</button>' +
          '<button class="wp-dropzone__preview-btn wp-dropzone__preview-btn--danger" onclick="event.stopPropagation();removerFundoSecao(\'' + secaoId + '\')">Remover</button>' +
        '</div>' +
      '</div>' +
      '<input type="file" class="wp-dropzone__input" id="fundo-file-' + secaoId + '" accept="image/*" onchange="previewFundoSecao(\'' + secaoId + '\', this)" style="display:none">';

    // Update preview header too
    var card = dropzone.closest('.secao-card');
    if (card) {
      var preview = card.querySelector('.secao-card__preview');
      if (preview) {
        preview.style.backgroundImage = 'url(\'' + e.target.result + '\')';
        preview.classList.remove('secao-card__preview--empty');
      }
    }
  };
  reader.readAsDataURL(input.files[0]);
}

async function removerFundoSecao(secaoId) {
  try {
    await supaUpdate('site_secoes', secaoId, { imagem_fundo: null });
    mostrarToast('Imagem de fundo removida');
    carregarConteudoSite();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao remover imagem', 'error');
  }
}

function valor(id) {
  var el = $('#' + id);
  return el ? el.value : '';
}

async function salvarSecao(secaoId) {
  try {
    // Detectar se eh secao com editor customizado
    var secao = cacheSecoes.find(function(s) { return s.id === secaoId; });
    var secSlug = secao ? secao.slug : '';
    var conteudoPt, conteudoEn;

    if (secSlug === 'faq') {
      conteudoPt = faqToText(secaoId, 'pt');
      conteudoEn = faqToText(secaoId, 'en');
    } else if (secSlug === 'depoimentos') {
      conteudoPt = depoToText(secaoId, 'pt');
      conteudoEn = depoToText(secaoId, 'en');
    } else {
      conteudoPt = valor('conteudo-pt-' + secaoId);
      conteudoEn = valor('conteudo-en-' + secaoId);
    }

    var data = {
      titulo_pt: valor('titulo-pt-' + secaoId),
      titulo_en: valor('titulo-en-' + secaoId),
      subtitulo_pt: valor('subtitulo-pt-' + secaoId),
      subtitulo_en: valor('subtitulo-en-' + secaoId),
      conteudo_pt: conteudoPt,
      conteudo_en: conteudoEn,
      video_url: valor('video-' + secaoId),
      botao_texto_pt: valor('btn-texto-pt-' + secaoId),
      botao_texto_en: valor('btn-texto-en-' + secaoId),
      botao_url: valor('btn-url-' + secaoId),
    };

    // Upload imagem de fundo se selecionada
    var fileInput = $('#fundo-file-' + secaoId);
    if (fileInput && fileInput.files && fileInput.files[0]) {
      mostrarToast('Enviando imagem de fundo...', 'success');
      var secao = cacheSecoes.find(function(s) { return s.id === secaoId; });
      var slug = secao ? secao.slug : 'secao';
      var urlFundo = await uploadImagemSite(fileInput.files[0], slug);
      data.imagem_fundo = urlFundo;
    }

    await supaUpdate('site_secoes', secaoId, data);
    mostrarToast('Secao salva com sucesso!');

    // Atualizar cache local sem recarregar tudo
    var secao = cacheSecoes.find(function(s) { return s.id === secaoId; });
    if (secao) {
      Object.keys(data).forEach(function(k) { secao[k] = data[k]; });
    }
  } catch (err) {
    console.error('Erro ao salvar secao:', err);
    mostrarToast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function toggleVisibilidadeSecao(secaoId, visivel) {
  try {
    await supaUpdate('site_secoes', secaoId, { visivel: visivel });
    mostrarToast(visivel ? 'Secao visivel no site' : 'Secao oculta do site');
    carregarConteudoSite();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao alterar visibilidade', 'error');
  }
}

async function reordenarSecao(secaoId, direcao) {
  try {
    var idx = cacheSecoes.findIndex(function(s) { return s.id === secaoId; });
    if (idx < 0) return;
    var novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= cacheSecoes.length) return;

    var secaoA = cacheSecoes[idx];
    var secaoB = cacheSecoes[novoIdx];
    var ordemA = secaoA.ordem;
    var ordemB = secaoB.ordem;

    await Promise.all([
      supaUpdate('site_secoes', secaoA.id, { ordem: ordemB }),
      supaUpdate('site_secoes', secaoB.id, { ordem: ordemA }),
    ]);

    carregarConteudoSite();
  } catch (err) {
    console.error('Erro ao reordenar:', err);
    mostrarToast('Erro ao reordenar', 'error');
  }
}

/* ---- Upload de imagem do site ---- */
async function uploadImagemSite(file, secaoSlug) {
  await garantirBucket();
  var nome = Date.now() + '-' + Math.random().toString(36).substr(2, 6) + '.jpg';
  var path = 'site/' + secaoSlug + '/' + nome;
  var url = CONFIG.SUPABASE_URL + '/storage/v1/object/imagens/' + path;
  var r = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
      'Content-Type': file.type,
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!r.ok) throw new Error('Upload falhou');
  return CONFIG.SUPABASE_URL + '/storage/v1/object/public/imagens/' + path;
}

/* ---- Galeria de Imagens por Secao ---- */
async function carregarGaleriaSecao(secaoId, secaoSlug) {
  try {
    var secao = cacheSecoes.find(function(s) { return s.id === secaoId; });
    var slug = secaoSlug || (secao ? secao.slug : '');
    var imagens = await supaFetch('site_galeria?secao_slug=eq.' + slug + '&order=ordem.asc');
    renderizarGaleria(secaoId, slug, imagens || []);
  } catch (err) {
    console.error('Erro ao carregar galeria:', err);
    var container = $('#galeria-' + secaoId);
    if (container) container.innerHTML = '<p class="placeholder" style="grid-column:1/-1">Erro ao carregar galeria</p>';
  }
}

function renderizarGaleria(secaoId, secaoSlug, imagens) {
  var container = $('#galeria-' + secaoId);
  if (!container) return;

  var html = '';
  imagens.forEach(function(img, idx) {
    html += '<div class="secao-galeria__item">' +
      '<img src="' + escapeHtml(img.imagem_url) + '" alt="' + escapeHtml(img.titulo || '') + '" loading="lazy">' +
      '<button class="secao-galeria__remove" onclick="removerImagemGaleria(\'' + img.id + '\',\'' + secaoId + '\',\'' + secaoSlug + '\')" title="Remover">&times;</button>' +
      '<div class="secao-galeria__reorder">' +
        (idx > 0 ? '<button class="btn-reorder" onclick="reordenarImagemGaleria(\'' + img.id + '\',-1,\'' + secaoId + '\',\'' + secaoSlug + '\')" title="Mover esquerda">&#9664;</button>' : '') +
        (idx < imagens.length - 1 ? '<button class="btn-reorder" onclick="reordenarImagemGaleria(\'' + img.id + '\',1,\'' + secaoId + '\',\'' + secaoSlug + '\')" title="Mover direita">&#9654;</button>' : '') +
      '</div>' +
    '</div>';
  });

  html += '<button class="secao-galeria__add" onclick="adicionarImagemGaleria(\'' + secaoId + '\',\'' + secaoSlug + '\')" title="Adicionar imagem">' +
    '<span class="secao-galeria__add-icon">+</span>' +
    'Adicionar' +
  '</button>';

  container.innerHTML = html;
}

async function adicionarImagemGaleria(secaoId, secaoSlug) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async function() {
    if (!input.files || input.files.length === 0) return;
    try {
      var files = Array.from(input.files);
      mostrarToast('Enviando ' + files.length + ' imagem(ns)...', 'success');

      // Buscar max ordem atual
      var existentes = await supaFetch('site_galeria?secao_slug=eq.' + secaoSlug + '&select=ordem&order=ordem.desc&limit=1');
      var novaOrdem = (existentes && existentes.length > 0 && existentes[0].ordem != null) ? existentes[0].ordem + 1 : 0;

      for (var i = 0; i < files.length; i++) {
        var urlPublica = await uploadImagemSite(files[i], secaoSlug);
        await supaInsert('site_galeria', {
          secao_slug: secaoSlug,
          imagem_url: urlPublica,
          titulo: '',
          descricao: '',
          ordem: novaOrdem + i,
          ativo: true,
        });
      }

      mostrarToast(files.length > 1 ? files.length + ' imagens adicionadas!' : 'Imagem adicionada!');
      carregarGaleriaSecao(secaoId, secaoSlug);
    } catch (err) {
      console.error('Erro ao adicionar imagem:', err);
      mostrarToast('Erro ao enviar imagem', 'error');
    }
  };
  input.click();
}

async function removerImagemGaleria(imagemId, secaoId, secaoSlug) {
  if (!confirm('Remover esta imagem da galeria?')) return;
  try {
    var url = CONFIG.SUPABASE_URL + '/rest/v1/site_galeria?id=eq.' + imagemId;
    var r = await fetch(url, {
      method: 'DELETE',
      headers: apiHeaders(),
    });
    if (!r.ok) throw new Error('Erro ao remover');
    mostrarToast('Imagem removida');
    carregarGaleriaSecao(secaoId, secaoSlug);
  } catch (err) {
    console.error('Erro ao remover imagem:', err);
    mostrarToast('Erro ao remover imagem', 'error');
  }
}

async function reordenarImagemGaleria(imagemId, direcao, secaoId, secaoSlug) {
  try {
    var imagens = await supaFetch('site_galeria?secao_slug=eq.' + secaoSlug + '&order=ordem.asc');
    if (!imagens) return;
    var idx = imagens.findIndex(function(img) { return img.id === imagemId; });
    if (idx < 0) return;
    var novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= imagens.length) return;

    var imgA = imagens[idx];
    var imgB = imagens[novoIdx];
    var ordemA = imgA.ordem;
    var ordemB = imgB.ordem;

    await Promise.all([
      supaUpdate('site_galeria', imgA.id, { ordem: ordemB }),
      supaUpdate('site_galeria', imgB.id, { ordem: ordemA }),
    ]);

    carregarGaleriaSecao(secaoId, secaoSlug);
  } catch (err) {
    console.error('Erro ao reordenar imagem:', err);
    mostrarToast('Erro ao reordenar', 'error');
  }
}

/* ================================================================== */
/*  CONFIGURACOES                                                     */
/* ================================================================== */
async function carregarConfiguracoes() {
  try {
    var [siteConfig, frete] = await Promise.all([
      supaFetch('site_config?select=*&order=chave.asc'),
      supaFetch('frete_tabela?select=*&order=regiao.asc'),
    ]);

    // Site Config
    var tbodySite = $('#tbody-site-config');
    if (siteConfig && siteConfig.length > 0) {
      tbodySite.innerHTML = siteConfig.map(function(c) {
        var chave = c.chave || '--';
        var valor = c.valor || '';
        var displayValor = String(valor);
        if (displayValor.length > 80) displayValor = displayValor.substring(0, 77) + '...';

        return '<tr>' +
          '<td>' + escapeHtml(chave) + '</td>' +
          '<td>' + escapeHtml(displayValor) + '</td>' +
          '<td>' +
            '<button class="btn btn--small btn--secondary" onclick="editarSiteConfig(\'' + c.id + '\',\'' + escapeHtml(chave) + '\')">Editar</button>' +
          '</td>' +
          '</tr>';
      }).join('');
    } else {
      tbodySite.innerHTML = '<tr><td colspan="3" class="placeholder">Nenhuma configuracao</td></tr>';
    }

    // Frete
    var tbodyFrete = $('#tbody-frete');
    if (frete && frete.length > 0) {
      tbodyFrete.innerHTML = frete.map(function(f) {
        var prazo = f.prazo_dias != null ? f.prazo_dias + ' dias' : '--';
        return '<tr>' +
          '<td>' + escapeHtml(f.regiao || '--') + '</td>' +
          '<td>' + formatarMoeda(f.valor) + '</td>' +
          '<td>' + prazo + '</td>' +
          '<td>' +
            '<button class="btn btn--small btn--secondary" onclick="editarFrete(\'' + f.id + '\')">Editar</button>' +
          '</td>' +
          '</tr>';
      }).join('');
    } else {
      tbodyFrete.innerHTML = '<tr><td colspan="4" class="placeholder">Nenhuma faixa de frete</td></tr>';
    }

  } catch (err) {
    console.error('Erro ao carregar configuracoes:', err);
  }
}

function editarSiteConfig(id, chave) {
  modalModo = 'site-config-editar';
  modalItemId = id;

  $('#modal-titulo').textContent = 'Editar Configuracao';
  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Chave</label><input type="text" id="campo-config-chave" value="' + escapeHtml(chave) + '" disabled></div>' +
    '<div class="form-group"><label>Valor</label><textarea id="campo-config-valor" rows="4" placeholder="Valor da configuracao"></textarea></div>';

  supaFetch('site_config?id=eq.' + id).then(function(data) {
    if (data && data.length > 0) {
      var campo = $('#campo-config-valor');
      if (campo) campo.value = data[0].valor || '';
    }
  });

  $('#modal-overlay').classList.remove('escondido');
}

function editarFrete(id) {
  modalModo = 'frete-editar';
  modalItemId = id;

  $('#modal-titulo').textContent = 'Editar Frete';
  $('#modal-body').innerHTML =
    '<div class="form-group"><label>Regiao</label><input type="text" id="campo-frete-regiao" placeholder="Ex: Sudeste"></div>' +
    '<div class="form-group"><label>Descricao</label><input type="text" id="campo-frete-descricao" placeholder="Descricao da faixa"></div>' +
    '<div class="form-group"><label>Valor (R$)</label><input type="number" id="campo-frete-valor" step="0.01" min="0" placeholder="0.00"></div>' +
    '<div class="form-group"><label>Prazo (dias)</label><input type="number" id="campo-frete-prazo" min="0" placeholder="Ex: 5"></div>';

  supaFetch('frete_tabela?id=eq.' + id).then(function(data) {
    if (data && data.length > 0) {
      var f = data[0];
      var el = function(s) { return $(s); };
      if (el('#campo-frete-regiao')) el('#campo-frete-regiao').value = f.regiao || '';
      if (el('#campo-frete-descricao')) el('#campo-frete-descricao').value = f.descricao || '';
      if (el('#campo-frete-valor')) el('#campo-frete-valor').value = f.valor || '';
      if (el('#campo-frete-prazo')) el('#campo-frete-prazo').value = f.prazo_dias != null ? f.prazo_dias : '';
    }
  });

  $('#modal-overlay').classList.remove('escondido');
}

/* ================================================================== */
/*  MODAL — SALVAR                                                    */
/* ================================================================== */
async function salvarModal() {
  try {
    /* ---- PRODUTO ---- */
    if (modalModo === 'produto-novo' || modalModo === 'produto-editar') {
      var nomePt = ($('#campo-prod-nome-pt') || {}).value || '';
      if (!nomePt.trim()) {
        mostrarToast('Nome (PT) e obrigatorio', 'error');
        return;
      }

      if (!(($('#campo-prod-categoria') || {}).value || '').trim()) {
        mostrarToast('Selecione uma categoria', 'error');
        return;
      }

      // Estoque por tamanho (P/M/G/GG): so entra no body se o checkbox estiver marcado.
      // Tamanho com input vazio = produto nao vem nesse tamanho (fica de fora do objeto).
      var variantesEstoque = null;
      var estoqueFinal = parseInt(($('#campo-prod-estoque') || {}).value) || 0;
      if (($('#campo-prod-tem-tamanho') || {}).checked) {
        variantesEstoque = {};
        var somaVariantes = 0;
        ['P', 'M', 'G', 'GG'].forEach(function(tam) {
          var v = ($('#campo-prod-tam-' + tam) || {}).value;
          if (v !== '' && v != null) {
            var qtd = parseInt(v, 10) || 0;
            variantesEstoque[tam] = qtd;
            somaVariantes += qtd;
          }
        });
        if (Object.keys(variantesEstoque).length === 0) variantesEstoque = null;
        else estoqueFinal = somaVariantes;
      }

      var body = {
        nome_pt: nomePt,
        nome_en: ($('#campo-prod-nome-en') || {}).value || '',
        categoria_id: ($('#campo-prod-categoria') || {}).value || null,
        preco: parseFloat(($('#campo-prod-preco') || {}).value) || 0,
        preco_promocional: parseFloat(($('#campo-prod-preco-promo') || {}).value) || null,
        estoque: estoqueFinal,
        variantes_estoque: variantesEstoque,
        sku: ($('#campo-prod-sku') || {}).value || null,
        peso_gramas: parseInt(($('#campo-prod-peso') || {}).value) || null,
        frete_comprimento: parseFloat(($('#campo-prod-frete-comprimento') || {}).value) || null,
        frete_largura: parseFloat(($('#campo-prod-frete-largura') || {}).value) || null,
        frete_altura: parseFloat(($('#campo-prod-frete-altura') || {}).value) || null,
        descricao_pt: ($('#campo-prod-descricao-pt') || {}).value || '',
        descricao_en: ($('#campo-prod-descricao-en') || {}).value || '',
        destaque: ($('#campo-prod-destaque') || {}).checked || false,
        slug: ($('#campo-prod-slug') || {}).value || gerarSlug(nomePt),
      };

      if (!body.categoria_id) body.categoria_id = null;
      if (!body.preco_promocional) body.preco_promocional = null;
      if (!body.sku) body.sku = null;
      if (!body.peso_gramas) body.peso_gramas = null;

      // Upload de imagem se selecionado
      var fileInput = $('#campo-prod-imagem-file');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        mostrarToast('Enviando imagem...', 'success');
        var file = fileInput.files[0];
        var nomeArq = gerarNomeArquivo(file);
        var urlPublica = await uploadImagem(file, 'produtos', nomeArq);
        body.imagens = [urlPublica];
      }

      if (modalModo === 'produto-novo') {
        body.ativo = true;
        if (!body.imagens) body.imagens = [];
        await supaInsert('produtos', body);
        mostrarToast('Produto criado com sucesso');
      } else {
        await supaUpdate('produtos', modalItemId, body);
        mostrarToast('Produto atualizado');
      }

      fecharModal();
      carregarProdutos();

    /* ---- JOURNAL ---- */
    } else if (modalModo === 'journal-editar' || modalModo === 'journal-novo') {
      var tituloPt = ($('#campo-journal-titulo-pt') || {}).value || '';
      if (!tituloPt.trim()) {
        mostrarToast('Titulo (PT) e obrigatorio', 'error');
        return;
      }

      var body = {
        titulo_pt: tituloPt,
        titulo_en: ($('#campo-journal-titulo-en') || {}).value || '',
        resumo_pt: ($('#campo-journal-resumo-pt') || {}).value || '',
        resumo_en: ($('#campo-journal-resumo-en') || {}).value || '',
        destaque: ($('#campo-journal-destaque') || {}).checked || false,
        slug: ($('#campo-journal-slug') || {}).value || gerarSlug(tituloPt),
      };

      // Upload de imagem de capa se selecionado
      var fileInput = $('#campo-journal-imagem-file');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        mostrarToast('Enviando capa...', 'success');
        var file = fileInput.files[0];
        var nomeArq = gerarNomeArquivo(file);
        body.imagem_capa = await uploadImagem(file, 'journal', nomeArq);
      }

      // Imagens de conteudo (cada linha: arquivo OU url + descricao PT/EN)
      var linhas = document.querySelectorAll('#journal-imgs .jimg-row');
      var imagensArr = [];
      for (var i = 0; i < linhas.length; i++) {
        var linha = linhas[i];
        var arq = linha.querySelector('.jimg-file');
        var urlCampo = linha.querySelector('.jimg-url');
        var dpt = linha.querySelector('.jimg-dpt');
        var den = linha.querySelector('.jimg-den');
        var urlFinal = (urlCampo && urlCampo.value || '').trim();
        if (arq && arq.files && arq.files[0]) {
          mostrarToast('Enviando imagem ' + (i + 1) + '...', 'success');
          urlFinal = await uploadImagem(arq.files[0], 'journal', gerarNomeArquivo(arq.files[0]));
        }
        if (!urlFinal) continue; // linha sem imagem -> ignora
        imagensArr.push({
          url: urlFinal,
          descricao_pt: (dpt && dpt.value || '').trim(),
          descricao_en: (den && den.value || '').trim(),
        });
      }
      body.imagens = imagensArr;

      // Video: arquivo (upload) tem prioridade; senao usa o link colado (YouTube)
      var videoFile = $('#campo-journal-video-file');
      var videoUrlCampo = ($('#campo-journal-video-url') || {}).value || '';
      if (videoFile && videoFile.files && videoFile.files[0]) {
        var vf = videoFile.files[0];
        if (vf.size > 52428800) {
          mostrarToast('Video maior que 50MB. Use um link do YouTube.', 'error');
          return;
        }
        mostrarToast('Enviando video...', 'success');
        body.video_url = await uploadVideoArquivo(vf, gerarNomeArquivo(vf));
      } else if (videoUrlCampo.trim()) {
        body.video_url = videoUrlCampo.trim();
      } else {
        body.video_url = null;
      }

      if (modalModo === 'journal-novo') {
        body.publicado = true;
        body.published_at = new Date().toISOString();
        await supaInsert('journal_posts', body);
        mostrarToast('Post criado com sucesso');
      } else {
        await supaUpdate('journal_posts', modalItemId, body);
        mostrarToast('Post atualizado');
      }

      fecharModal();
      carregarJournal();

    /* ---- SITE CONFIG ---- */
    } else if (modalModo === 'site-config-editar') {
      var valor = ($('#campo-config-valor') || {}).value || '';
      await supaUpdate('site_config', modalItemId, { valor: valor });
      mostrarToast('Configuracao atualizada');
      fecharModal();
      carregarConfiguracoes();

    /* ---- FRETE ---- */
    } else if (modalModo === 'frete-editar') {
      var body = {
        regiao: ($('#campo-frete-regiao') || {}).value || '',
        descricao: ($('#campo-frete-descricao') || {}).value || '',
        valor: parseFloat(($('#campo-frete-valor') || {}).value) || 0,
        prazo_dias: parseInt(($('#campo-frete-prazo') || {}).value) || 0,
      };

      await supaUpdate('frete_tabela', modalItemId, body);
      mostrarToast('Frete atualizado');
      fecharModal();
      carregarConfiguracoes();

    /* ---- RESERVA OBSERVACOES ---- */
    } else if (modalModo === 'reserva-ver') {
      var obs = ($('#campo-reserva-obs') || {}).value || '';
      await supaUpdate('reservas', modalItemId, { observacoes: obs });
      mostrarToast('Observacoes salvas');
      fecharModal();
      carregarReservas();
      return;

    /* ---- PLAYLISTS ---- */
    } else if (modalModo === 'playlist-nova' || modalModo === 'playlist-editar') {
      var plBody = {
        nome: ($('#campo-pl-nome') || {}).value || '',
        descricao: ($('#campo-pl-desc') || {}).value || '',
        spotify_embed_url: ($('#campo-pl-url') || {}).value || '',
        ordem: parseInt(($('#campo-pl-ordem') || {}).value) || 0,
      };

      if (!plBody.nome.trim()) {
        mostrarToast('Nome e obrigatorio', 'error');
        return;
      }

      if (modalModo === 'playlist-nova') {
        plBody.ativo = true;
        await supaInsert('playlists', plBody);
        mostrarToast('Playlist criada!');
      } else {
        await supaUpdate('playlists', modalItemId, plBody);
        mostrarToast('Playlist atualizada');
      }

      cachePlaylistsOrdem = [];
      fecharModal();
      carregarPlaylists();
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
  // Restaurar botao salvar (pode ter sido escondido para mensagens)
  var btnSalvar = $('#modal-btn-salvar');
  if (btnSalvar) btnSalvar.style.display = '';
}

/* ================================================================== */
/*  INICIALIZACAO                                                     */
/* ================================================================== */
async function initDashboard() {
  try {
    navegarPara('visao-geral');
  } catch (err) {
    console.error('Erro na inicializacao:', err);
    mostrarToast('Erro ao conectar com o banco de dados', 'error');
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
