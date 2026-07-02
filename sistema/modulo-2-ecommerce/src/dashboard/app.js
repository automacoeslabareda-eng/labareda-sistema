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
/*  LOGIN / LOGOUT                                                    */
/* ================================================================== */
function verificarSessao() {
  try {
    var dados = sessionStorage.getItem('labareda_shop_usuario');
    if (dados) { usuarioLogado = JSON.parse(dados); return true; }
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
    var url = GESTAO_SUPABASE_URL + '/rest/v1/usuarios_admin?email=eq.' + encodeURIComponent(email) + '&senha_hash=eq.' + encodeURIComponent(senha) + '&ativo=eq.true&select=*';
    var r = await fetch(url, { headers: { 'apikey': GESTAO_SUPABASE_KEY, 'Authorization': 'Bearer ' + GESTAO_SUPABASE_KEY } });
    if (!r.ok) throw new Error('Erro de conexao');
    var data = await r.json();

    if (!data || data.length === 0) {
      errorEl.textContent = 'Email ou senha incorretos';
      errorEl.classList.remove('escondido');
      btnEl.disabled = false; btnEl.textContent = 'Entrar';
      return;
    }

    usuarioLogado = { id: data[0].id, nome: data[0].nome, email: data[0].email, role: data[0].role };
    sessionStorage.setItem('labareda_shop_usuario', JSON.stringify(usuarioLogado));
    mostrarApp();
    initDashboard();
  } catch (err) {
    errorEl.textContent = 'Erro ao conectar. Tente novamente.';
    errorEl.classList.remove('escondido');
  }
  btnEl.disabled = false; btnEl.textContent = 'Entrar';
}

function realizarLogout() {
  sessionStorage.removeItem('labareda_shop_usuario');
  usuarioLogado = null;
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
    var [totalProdutos, pedidosPendentes, msgNaoLidas, reservasNovas, pedidos, estoqueBaixo] = await Promise.all([
      supaCount('produtos', 'ativo=eq.true'),
      supaCount('pedidos', 'status=eq.pendente'),
      supaCount('mensagens_contato', 'lida=eq.false'),
      supaCount('reservas', 'status=eq.nova'),
      supaFetch('pedidos?select=total&status=in.(pago,preparando,enviado,entregue)'),
      supaFetch('produtos?select=id,nome_pt,estoque&ativo=eq.true&estoque=lte.5&order=estoque.asc'),
    ]);

    $('#stat-produtos').textContent = totalProdutos;
    $('#stat-pedidos-pendentes').textContent = pedidosPendentes;
    $('#stat-mensagens').textContent = msgNaoLidas;

    var statReservas = $('#stat-reservas');
    if (statReservas) statReservas.textContent = reservasNovas;

    var receita = 0;
    if (pedidos && pedidos.length > 0) {
      pedidos.forEach(function(p) { receita += (p.total || 0); });
    }
    $('#stat-receita').textContent = formatarMoeda(receita);

    // Estoque baixo
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
    '<div class="form-group"><label>SKU</label><input type="text" id="campo-prod-sku" placeholder="SKU do produto"></div>' +
    '<div class="form-group"><label>Peso (gramas)</label><input type="number" id="campo-prod-peso" min="0" placeholder="0"></div>' +
    '<div class="form-group"><label>Imagem do Produto</label>' +
      '<input type="file" id="campo-prod-imagem-file" accept="image/*">' +
      '<div id="campo-prod-imagem-preview" style="margin-top:8px"></div>' +
    '</div>' +
    '<div class="form-group"><label>Descricao (PT)</label><textarea id="campo-prod-descricao-pt" rows="3" placeholder="Descricao em portugues"></textarea></div>' +
    '<div class="form-group"><label>Descricao (EN)</label><textarea id="campo-prod-descricao-en" rows="3" placeholder="Description in english"></textarea></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="campo-prod-destaque"> Produto Destaque</label></div>' +
    '<div class="form-group"><label>Slug</label><input type="text" id="campo-prod-slug" placeholder="gerado-automaticamente" style="color:var(--text-muted)"></div>';

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
      if (el('#campo-prod-descricao-pt')) el('#campo-prod-descricao-pt').value = p.descricao_pt || '';
      if (el('#campo-prod-descricao-en')) el('#campo-prod-descricao-en').value = p.descricao_en || '';
      if (el('#campo-prod-destaque')) el('#campo-prod-destaque').checked = !!p.destaque;
      if (el('#campo-prod-slug')) el('#campo-prod-slug').value = p.slug || '';

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
    var qs = '?select=*,clientes(nome,email)&order=created_at.desc';
    var statusFiltro = $('#filtro-pedido-status').value;
    if (statusFiltro) qs += '&status=eq.' + statusFiltro;

    var data = await supaFetch('pedidos' + qs);
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
    var items = await supaFetch('pedido_itens?pedido_id=eq.' + pedidoId + '&select=*,produtos(nome_pt)');
    var detalhe = $('#pedido-detalhe');
    var container = $('#pedido-itens');

    if (!items || items.length === 0) {
      container.innerHTML = '<p class="placeholder">Nenhum item no pedido</p>';
    } else {
      var html = '<table class="tabela"><thead><tr><th>Produto</th><th>Qtd</th><th>Preco Unit.</th><th>Subtotal</th></tr></thead><tbody>';
      items.forEach(function(item) {
        var nome = (item.produtos && item.produtos.nome_pt) || item.produto_nome || '--';
        var qtd = item.quantidade || 1;
        var preco = item.preco_unitario || item.preco || 0;
        html += '<tr>' +
          '<td>' + escapeHtml(nome) + '</td>' +
          '<td>' + qtd + '</td>' +
          '<td>' + formatarMoeda(preco) + '</td>' +
          '<td>' + formatarMoeda(preco * qtd) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    detalhe.classList.remove('escondido');
    detalhe.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Erro ao expandir pedido:', err);
  }
}

async function mudarStatusPedido(pedidoId, novoStatus) {
  try {
    await supaUpdate('pedidos', pedidoId, { status: novoStatus });
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
    '<div class="form-group"><label>Titulo (PT)</label><input type="text" id="campo-journal-titulo-pt" placeholder="Titulo do post em portugues"></div>' +
    '<div class="form-group"><label>Titulo (EN)</label><input type="text" id="campo-journal-titulo-en" placeholder="Post title in english"></div>' +
    '<div class="form-group"><label>Resumo (PT)</label><textarea id="campo-journal-resumo-pt" rows="2" placeholder="Resumo em portugues"></textarea></div>' +
    '<div class="form-group"><label>Resumo (EN)</label><textarea id="campo-journal-resumo-en" rows="2" placeholder="Summary in english"></textarea></div>' +
    '<div class="form-group"><label>Conteudo (PT)</label><textarea id="campo-journal-conteudo-pt" rows="8" placeholder="Conteudo completo em portugues"></textarea></div>' +
    '<div class="form-group"><label>Conteudo (EN)</label><textarea id="campo-journal-conteudo-en" rows="8" placeholder="Full content in english"></textarea></div>' +
    '<div class="form-group"><label>Imagem de Capa</label>' +
      '<input type="file" id="campo-journal-imagem-file" accept="image/*">' +
      '<div id="campo-journal-imagem-preview" style="margin-top:8px"></div>' +
    '</div>' +
    '<div class="form-group"><label>Tags (separadas por virgula)</label><input type="text" id="campo-journal-tags" placeholder="tag1, tag2, tag3"></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="campo-journal-destaque"> Post Destaque</label></div>' +
    '<div class="form-group"><label>Slug</label><input type="text" id="campo-journal-slug" placeholder="gerado-automaticamente" style="color:var(--text-muted)"></div>';

  // Auto-gerar slug ao digitar titulo PT
  var tituloPtInput = $('#campo-journal-titulo-pt');
  var slugInput = $('#campo-journal-slug');
  tituloPtInput.addEventListener('input', function() {
    slugInput.value = gerarSlug(tituloPtInput.value);
  });

  // Preview de imagem
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

  if (id) {
    carregarDadosJournalModal(id);
  }

  $('#modal-overlay').classList.remove('escondido');
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
      if (el('#campo-journal-conteudo-pt')) el('#campo-journal-conteudo-pt').value = p.conteudo_pt || '';
      if (el('#campo-journal-conteudo-en')) el('#campo-journal-conteudo-en').value = p.conteudo_en || '';
      if (el('#campo-journal-destaque')) el('#campo-journal-destaque').checked = !!p.destaque;
      if (el('#campo-journal-slug')) el('#campo-journal-slug').value = p.slug || '';

      // Tags
      if (el('#campo-journal-tags')) {
        var tags = p.tags;
        if (Array.isArray(tags)) {
          el('#campo-journal-tags').value = tags.join(', ');
        } else if (typeof tags === 'string') {
          el('#campo-journal-tags').value = tags;
        }
      }

      // Imagem de capa existente
      if (p.imagem_capa) {
        var preview = $('#campo-journal-imagem-preview');
        if (preview) preview.innerHTML = '<img src="' + escapeHtml(p.imagem_capa) + '" style="max-width:200px;max-height:150px;border-radius:8px"><p style="font-size:12px;color:var(--text-muted);margin-top:4px">Imagem atual. Selecione outra para substituir.</p>';
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
    container.innerHTML = '<p class="placeholder">Nenhuma secao encontrada</p>';
    return;
  }

  container.innerHTML = secoes.map(function(s, idx) {
    var visivel = s.visivel !== false;
    var slug = s.slug || '--';
    var badgeClass = visivel ? 'secao-badge--visivel' : 'secao-badge--oculto';
    var badgeText = visivel ? 'Visivel' : 'Oculto';

    var imgFundoPreview = '';
    if (s.imagem_fundo) {
      imgFundoPreview = '<img class="secao-imagem-fundo-preview" src="' + escapeHtml(s.imagem_fundo) + '" alt="Fundo">';
    }

    return '<div class="secao-card" data-secao-id="' + s.id + '">' +
      '<div class="secao-card__header" onclick="toggleSecaoCard(\'' + s.id + '\')">' +
        '<span class="secao-card__drag" title="Arrastar">&#10303;</span>' +
        '<span class="secao-card__nome">' + escapeHtml(slug.toUpperCase()) + '</span>' +
        '<span class="' + badgeClass + '">' + badgeText + '</span>' +
        '<button class="btn-reorder" onclick="event.stopPropagation();reordenarSecao(\'' + s.id + '\',-1)" title="Subir"' + (idx === 0 ? ' disabled' : '') + '>&#9650;</button>' +
        '<button class="btn-reorder" onclick="event.stopPropagation();reordenarSecao(\'' + s.id + '\',1)" title="Descer"' + (idx === secoes.length - 1 ? ' disabled' : '') + '>&#9660;</button>' +
        '<button class="secao-card__toggle" id="toggle-' + s.id + '">&#9662;</button>' +
      '</div>' +
      '<div class="secao-card__body" id="body-' + s.id + '">' +
        '<div class="secao-form-row">' +
          '<div class="form-group"><label>Titulo (PT)</label><input type="text" id="titulo-pt-' + s.id + '" value="' + escapeHtml(s.titulo_pt || '') + '"></div>' +
          '<div class="form-group"><label>Titulo (EN)</label><input type="text" id="titulo-en-' + s.id + '" value="' + escapeHtml(s.titulo_en || '') + '"></div>' +
        '</div>' +
        '<div class="secao-form-row">' +
          '<div class="form-group"><label>Subtitulo (PT)</label><input type="text" id="subtitulo-pt-' + s.id + '" value="' + escapeHtml(s.subtitulo_pt || '') + '"></div>' +
          '<div class="form-group"><label>Subtitulo (EN)</label><input type="text" id="subtitulo-en-' + s.id + '" value="' + escapeHtml(s.subtitulo_en || '') + '"></div>' +
        '</div>' +
        '<div class="secao-form-row">' +
          '<div class="form-group"><label>Conteudo (PT)</label><textarea id="conteudo-pt-' + s.id + '" rows="4">' + escapeHtml(s.conteudo_pt || '') + '</textarea></div>' +
          '<div class="form-group"><label>Conteudo (EN)</label><textarea id="conteudo-en-' + s.id + '" rows="4">' + escapeHtml(s.conteudo_en || '') + '</textarea></div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Imagem de Fundo</label>' +
          '<div id="fundo-preview-' + s.id + '">' + imgFundoPreview + '</div>' +
          '<input type="file" id="fundo-file-' + s.id + '" accept="image/*" onchange="previewFundoSecao(\'' + s.id + '\', this)">' +
        '</div>' +
        '<div class="form-group"><label>Video URL</label><input type="text" id="video-' + s.id + '" value="' + escapeHtml(s.video_url || '') + '" placeholder="https://..."></div>' +
        '<div class="secao-form-row">' +
          '<div class="form-group"><label>Botao CTA - Texto (PT)</label><input type="text" id="btn-texto-pt-' + s.id + '" value="' + escapeHtml(s.botao_texto_pt || '') + '"></div>' +
          '<div class="form-group"><label>Botao CTA - Texto (EN)</label><input type="text" id="btn-texto-en-' + s.id + '" value="' + escapeHtml(s.botao_texto_en || '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label>Botao CTA - URL</label><input type="text" id="btn-url-' + s.id + '" value="' + escapeHtml(s.botao_url || '') + '" placeholder="https://..."></div>' +
        '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="visivel-' + s.id + '"' + (visivel ? ' checked' : '') + ' onchange="toggleVisibilidadeSecao(\'' + s.id + '\', this.checked)"> Secao visivel no site</label></div>' +
        '<div class="secao-separator">Galeria de Imagens</div>' +
        '<div id="galeria-' + s.id + '" class="secao-galeria"><p class="placeholder" style="grid-column:1/-1">Carregando galeria...</p></div>' +
        '<div style="margin-top:20px;text-align:center"><button class="btn btn--primary" onclick="salvarSecao(\'' + s.id + '\')">Salvar Secao</button></div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Carregar galeria de cada secao
  secoes.forEach(function(s) {
    carregarGaleriaSecao(s.id, s.slug);
  });
}

function toggleSecaoCard(secaoId) {
  var body = $('#body-' + secaoId);
  var toggle = $('#toggle-' + secaoId);
  if (body) {
    body.classList.toggle('aberto');
    if (toggle) toggle.classList.toggle('secao-card__toggle--aberto');
  }
}

function previewFundoSecao(secaoId, input) {
  var preview = $('#fundo-preview-' + secaoId);
  if (input.files && input.files[0] && preview) {
    var reader = new FileReader();
    reader.onload = function(e) {
      preview.innerHTML = '<img class="secao-imagem-fundo-preview" src="' + e.target.result + '" alt="Preview">';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function valor(id) {
  var el = $('#' + id);
  return el ? el.value : '';
}

async function salvarSecao(secaoId) {
  try {
    var data = {
      titulo_pt: valor('titulo-pt-' + secaoId),
      titulo_en: valor('titulo-en-' + secaoId),
      subtitulo_pt: valor('subtitulo-pt-' + secaoId),
      subtitulo_en: valor('subtitulo-en-' + secaoId),
      conteudo_pt: valor('conteudo-pt-' + secaoId),
      conteudo_en: valor('conteudo-en-' + secaoId),
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
    mostrarToast('Secao atualizada!');
  } catch (err) {
    console.error('Erro ao salvar secao:', err);
    mostrarToast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function toggleVisibilidadeSecao(secaoId, visivel) {
  try {
    await supaUpdate('site_secoes', secaoId, { visivel: visivel });
    mostrarToast(visivel ? 'Secao visivel' : 'Secao oculta');
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
        (idx > 0 ? '<button class="btn-reorder" onclick="reordenarImagemGaleria(\'' + img.id + '\',-1,\'' + secaoId + '\',\'' + secaoSlug + '\')" title="Mover esquerda">&#9650;</button>' : '') +
        (idx < imagens.length - 1 ? '<button class="btn-reorder" onclick="reordenarImagemGaleria(\'' + img.id + '\',1,\'' + secaoId + '\',\'' + secaoSlug + '\')" title="Mover direita">&#9660;</button>' : '') +
      '</div>' +
    '</div>';
  });

  html += '<button class="secao-galeria__add" onclick="adicionarImagemGaleria(\'' + secaoId + '\',\'' + secaoSlug + '\')" title="Adicionar imagem">+ Adicionar</button>';

  container.innerHTML = html;
}

async function adicionarImagemGaleria(secaoId, secaoSlug) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async function() {
    if (!input.files || !input.files[0]) return;
    try {
      mostrarToast('Enviando imagem...', 'success');
      var urlPublica = await uploadImagemSite(input.files[0], secaoSlug);

      // Buscar max ordem atual
      var existentes = await supaFetch('site_galeria?secao_slug=eq.' + secaoSlug + '&select=ordem&order=ordem.desc&limit=1');
      var novaOrdem = (existentes && existentes.length > 0 && existentes[0].ordem != null) ? existentes[0].ordem + 1 : 0;

      await supaInsert('site_galeria', {
        secao_slug: secaoSlug,
        imagem_url: urlPublica,
        titulo: '',
        descricao: '',
        ordem: novaOrdem,
        ativo: true,
      });

      mostrarToast('Imagem adicionada!');
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

      var body = {
        nome_pt: nomePt,
        nome_en: ($('#campo-prod-nome-en') || {}).value || '',
        categoria_id: ($('#campo-prod-categoria') || {}).value || null,
        preco: parseFloat(($('#campo-prod-preco') || {}).value) || 0,
        preco_promocional: parseFloat(($('#campo-prod-preco-promo') || {}).value) || null,
        estoque: parseInt(($('#campo-prod-estoque') || {}).value) || 0,
        sku: ($('#campo-prod-sku') || {}).value || null,
        peso_gramas: parseInt(($('#campo-prod-peso') || {}).value) || null,
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
        conteudo_pt: ($('#campo-journal-conteudo-pt') || {}).value || '',
        conteudo_en: ($('#campo-journal-conteudo-en') || {}).value || '',
        destaque: ($('#campo-journal-destaque') || {}).checked || false,
        slug: ($('#campo-journal-slug') || {}).value || gerarSlug(tituloPt),
      };

      // Tags
      var tagsStr = ($('#campo-journal-tags') || {}).value || '';
      if (tagsStr.trim()) {
        body.tags = tagsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t.length > 0; });
      } else {
        body.tags = [];
      }

      // Upload de imagem de capa se selecionado
      var fileInput = $('#campo-journal-imagem-file');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        mostrarToast('Enviando imagem...', 'success');
        var file = fileInput.files[0];
        var nomeArq = gerarNomeArquivo(file);
        var urlPublica = await uploadImagem(file, 'journal', nomeArq);
        body.imagem_capa = urlPublica;
      }

      if (modalModo === 'journal-novo') {
        body.publicado = false;
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
