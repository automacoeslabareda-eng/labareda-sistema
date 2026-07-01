/**
 * Labareda — Painel do Colaborador (PWA)
 * Vanilla JS, zero dependencias.
 */

/* ================================================================== */
/*  CONFIGURACAO                                                      */
/* ================================================================== */
const CONFIG = {
  SUPABASE_URL: 'https://tidngxclgaspltzqoemi.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE',
  N8N_WEBHOOK_URL: '',     // preenchido no deploy
};

/* ================================================================== */
/*  ESTADO                                                            */
/* ================================================================== */
let estado = {
  token: null,
  usuario: null,         // { colaborador_id, propriedade_id, nome, exp }
  itens: [],             // itens carregados da API
  itemSelecionado: null, // item aberto no modal
  fotoBlob: null,        // foto comprimida pronta para upload
  online: navigator.onLine,
  modoLogin: false,      // true = logado via email/senha (sem JWT)
};

/* ================================================================== */
/*  JWT — decodificar sem verificar assinatura (server-side)          */
/* ================================================================== */
function decodificarJWT(token) {
  try {
    const partes = token.split('.');
    if (partes.length !== 3) return null;
    const payload = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(payload)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function tokenExpirado(payload) {
  if (!payload || !payload.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

/* ================================================================== */
/*  ELEMENTOS DO DOM                                                  */
/* ================================================================== */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

const els = {};
function cachearElementos() {
  els.telaLogin     = $('#tela-login');
  els.formLogin     = $('#form-login');
  els.loginEmail    = $('#login-email');
  els.loginSenha    = $('#login-senha');
  els.loginErro     = $('#login-erro');
  els.btnLogin      = $('#btn-login');
  els.headerPrincipal = $('#header-principal');
  els.btnSair       = $('#btn-sair');
  els.telaLoading   = $('#tela-loading');
  els.telaErro      = $('#tela-erro');
  els.telaPrincipal = $('#tela-principal');
  els.erroTitulo    = $('#erro-titulo');
  els.erroMsg       = $('#erro-msg');
  els.saudacao      = $('#saudacao');
  els.metaInfo      = $('#meta-info');
  els.listaTarefas  = $('#lista-tarefas');
  els.bannerOffline = $('#banner-offline');
  els.modalOverlay  = $('#modal-overlay');
  els.modalTitulo   = $('#modal-titulo');
  els.modalSetor    = $('#modal-setor');
  els.modalCheckbox = $('#modal-checkbox');
  els.modalObs      = $('#modal-obs');
  els.inputFoto     = $('#input-foto');
  els.fotoPreview   = $('#foto-preview');
  els.fotoImg       = $('#foto-img');
  els.btnRemoverFoto= $('#btn-remover-foto');
  els.btnConfirmar  = $('#btn-confirmar');
  els.toast         = $('#toast');
}

/* ================================================================== */
/*  TELAS                                                             */
/* ================================================================== */
function mostrarTela(tela) {
  els.telaLogin.classList.add('escondido');
  els.telaLoading.classList.add('escondido');
  els.telaErro.classList.add('escondido');
  els.telaPrincipal.classList.add('escondido');

  if (tela === els.telaLogin) {
    els.headerPrincipal.classList.add('escondido');
  } else {
    els.headerPrincipal.classList.remove('escondido');
  }

  tela.classList.remove('escondido');
}

function mostrarErro(titulo, msg) {
  els.erroTitulo.textContent = titulo;
  els.erroMsg.textContent = msg;
  mostrarTela(els.telaErro);
}

/* ================================================================== */
/*  DATA FORMATADA                                                    */
/* ================================================================== */
function dataFormatada() {
  const agora = new Date();
  const opcoes = { weekday: 'long', day: 'numeric', month: 'long' };
  const str = agora.toLocaleDateString('pt-BR', opcoes);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ================================================================== */
/*  TOAST                                                             */
/* ================================================================== */
let toastTimer = null;
function toast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.classList.add('visivel');
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('visivel');
  }, 3000);
}

/* ================================================================== */
/*  API — carregar itens                                              */
/* ================================================================== */
async function carregarItens() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    // Sem configuracao, usar dados do cache se existir
    const cache = localStorage.getItem('labareda_itens');
    if (cache) {
      estado.itens = JSON.parse(cache);
      return;
    }
    throw new Error('API nao configurada e sem cache local.');
  }

  const uid = estado.usuario.colaborador_id;
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/checklist_items?colaborador_id=eq.${uid}&status=neq.bloqueado&select=id,descricao,status,observacao,foto_url,tarefa_id,ordem,tarefas(comando_original,setor_interpretado,setor_id,setores(nome,icone))&order=ordem.asc`;

  const authToken = estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token;
  const resp = await fetch(url, {
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${authToken}`,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
  estado.itens = await resp.json();

  // Salvar no cache para modo offline
  localStorage.setItem('labareda_itens', JSON.stringify(estado.itens));
}

/* ================================================================== */
/*  API — upload de foto                                              */
/* ================================================================== */
async function uploadFoto(itemId) {
  if (!estado.fotoBlob || !CONFIG.SUPABASE_URL) return null;

  const ts = Date.now();
  const path = `${estado.usuario.propriedade_id}/${estado.usuario.colaborador_id}/${itemId}-${ts}.jpg`;
  const url = `${CONFIG.SUPABASE_URL}/storage/v1/object/fotos-comprovacao/${path}`;

  const authToken = estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'image/jpeg',
    },
    body: estado.fotoBlob,
  });

  if (!resp.ok) throw new Error('Falha no upload da foto');

  return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/fotos-comprovacao/${path}`;
}

/* ================================================================== */
/*  API — marcar conclusao                                            */
/* ================================================================== */
async function marcarConclusao(itemId, observacao, fotoUrl) {
  // Modo login: marcar direto no Supabase
  if (estado.modoLogin) {
    const patchPayload = {
      status: 'concluido',
      observacao: observacao || null,
      foto_url: fotoUrl || null,
      concluido_at: new Date().toISOString(),
    };

    if (!estado.online) {
      salvarPendente({ item_id: itemId, ...patchPayload });
      return;
    }

    const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/checklist_items?id=eq.${itemId}`, {
      method: 'PATCH',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(patchPayload),
    });

    if (!resp.ok) {
      salvarPendente({ item_id: itemId, ...patchPayload });
      throw new Error('Falha ao enviar. Salvo para reenvio automatico.');
    }
    return;
  }

  // Modo JWT: usar webhook n8n
  const payload = {
    item_id: itemId,
    status: 'concluido',
    observacao: observacao || null,
    foto_url: fotoUrl || null,
  };

  // Se offline, salvar na fila
  if (!estado.online || !CONFIG.N8N_WEBHOOK_URL) {
    salvarPendente(payload);
    return;
  }

  const resp = await fetch(`${CONFIG.N8N_WEBHOOK_URL}/webhook/checklist-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${estado.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    // Falha de rede — salvar na fila
    salvarPendente(payload);
    throw new Error('Falha ao enviar. Salvo para reenvio automatico.');
  }
}

/* ================================================================== */
/*  FILA OFFLINE                                                      */
/* ================================================================== */
function salvarPendente(payload) {
  const pendentes = JSON.parse(localStorage.getItem('labareda_pendentes') || '[]');
  pendentes.push({ ...payload, timestamp: Date.now() });
  localStorage.setItem('labareda_pendentes', JSON.stringify(pendentes));
}

async function sincronizarPendentes() {
  if (!CONFIG.N8N_WEBHOOK_URL) return;

  const pendentes = JSON.parse(localStorage.getItem('labareda_pendentes') || '[]');
  if (pendentes.length === 0) return;

  const restantes = [];

  for (const p of pendentes) {
    try {
      const resp = await fetch(`${CONFIG.N8N_WEBHOOK_URL}/webhook/checklist-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${estado.token}`,
        },
        body: JSON.stringify(p),
      });
      if (!resp.ok) restantes.push(p);
    } catch {
      restantes.push(p);
    }
  }

  localStorage.setItem('labareda_pendentes', JSON.stringify(restantes));

  if (restantes.length === 0 && pendentes.length > 0) {
    toast('Tarefas pendentes sincronizadas!');
  }
}

/* ================================================================== */
/*  COMPRESSAO DE IMAGEM                                              */
/* ================================================================== */
function comprimirImagem(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width;
        let h = img.height;

        if (w > MAX || h > MAX) {
          if (w > h) {
            h = Math.round((h * MAX) / w);
            w = MAX;
          } else {
            w = Math.round((w * MAX) / h);
            h = MAX;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Falha na compressao'));
          },
          'image/jpeg',
          0.7
        );
      };
      img.onerror = () => reject(new Error('Imagem invalida'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

/* ================================================================== */
/*  RENDERIZAR LISTA DE TAREFAS                                       */
/* ================================================================== */
function renderizarLista() {
  const container = els.listaTarefas;
  container.innerHTML = '';

  if (estado.itens.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="status">
        <div class="empty-state__icone" aria-hidden="true">&#9734;</div>
        <p class="empty-state__msg">Nenhuma tarefa pendente. Bom trabalho!</p>
      </div>
    `;
    return;
  }

  // Agrupar por tarefa_id
  const grupos = {};
  estado.itens.forEach((item) => {
    const tid = item.tarefa_id || 'sem-tarefa';
    if (!grupos[tid]) grupos[tid] = [];
    grupos[tid].push(item);
  });

  Object.entries(grupos).forEach(([tarefaId, itens]) => {
    const tarefa = itens[0].tarefas;
    const setorNome = tarefa?.setores?.nome || tarefa?.setor_interpretado || 'Geral';
    const setorIcone = tarefa?.setores?.icone || '📋';
    const todosCompletos = itens.every((i) => i.status === 'concluido');

    const grupoEl = document.createElement('section');
    grupoEl.className = 'grupo-tarefa';
    grupoEl.setAttribute('aria-label', `Tarefa: ${setorNome}`);

    // Header do grupo
    grupoEl.innerHTML = `
      <div class="grupo-tarefa__header">
        <span class="grupo-tarefa__icone" aria-hidden="true">${setorIcone}</span>
        <h2 class="grupo-tarefa__nome">${setorNome}</h2>
      </div>
      <div class="banner-completa ${todosCompletos ? 'visivel' : ''}" role="status" aria-live="polite">
        <span class="banner-completa__icone" aria-hidden="true">&#10003;</span>
        Tarefa completa!
      </div>
    `;

    // Cards de itens
    itens.forEach((item) => {
      const concluido = item.status === 'concluido';
      const card = document.createElement('article');
      card.className = `card-item ${concluido ? 'card-item--concluido' : ''}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', concluido ? '-1' : '0');
      card.setAttribute('aria-label', `${item.descricao}${concluido ? ' - concluido' : ''}`);
      card.dataset.itemId = item.id;

      card.innerHTML = `
        <div class="checkbox-custom ${concluido ? 'checkbox-custom--marcado' : ''}" aria-hidden="true">
          <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 7.5L5.5 11L12 3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="card-item__corpo">
          <p class="card-item__descricao">${item.descricao}</p>
          ${item.observacao ? `<p class="card-item__obs">${item.observacao}</p>` : ''}
        </div>
        ${concluido ? '' : '<span class="card-item__seta" aria-hidden="true">&#8250;</span>'}
      `;

      if (!concluido) {
        card.addEventListener('click', () => abrirModal(item));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            abrirModal(item);
          }
        });
      }

      grupoEl.appendChild(card);
    });

    container.appendChild(grupoEl);
  });
}

/* ================================================================== */
/*  MODAL — DETALHE DO ITEM                                           */
/* ================================================================== */
function abrirModal(item) {
  estado.itemSelecionado = item;
  estado.fotoBlob = null;

  els.modalTitulo.textContent = item.descricao;

  const tarefa = item.tarefas;
  const setorNome = tarefa?.setores?.nome || tarefa?.setor_interpretado || 'Geral';
  const setorIcone = tarefa?.setores?.icone || '📋';
  els.modalSetor.innerHTML = `<span>${setorIcone}</span> ${setorNome}`;

  els.modalCheckbox.checked = false;
  els.modalObs.value = item.observacao || '';
  els.fotoPreview.classList.remove('visivel');
  els.fotoImg.src = '';
  els.inputFoto.value = '';
  els.btnConfirmar.disabled = true;

  els.modalOverlay.classList.add('aberto');
  document.body.style.overflow = 'hidden';

  // Focus trap
  setTimeout(() => els.modalCheckbox.focus(), 300);
}

function fecharModal() {
  els.modalOverlay.classList.remove('aberto');
  document.body.style.overflow = '';
  estado.itemSelecionado = null;
  estado.fotoBlob = null;
}

/* ================================================================== */
/*  CONFIRMAR CONCLUSAO                                               */
/* ================================================================== */
async function confirmarConclusao() {
  const item = estado.itemSelecionado;
  if (!item || !els.modalCheckbox.checked) return;

  els.btnConfirmar.disabled = true;
  els.btnConfirmar.textContent = 'Enviando...';

  try {
    let fotoUrl = null;

    // Upload da foto se existir
    if (estado.fotoBlob) {
      try {
        fotoUrl = await uploadFoto(item.id);
      } catch {
        // Foto falhou, continuar sem
        toast('Foto nao enviada, mas tarefa registrada.');
      }
    }

    // Marcar conclusao
    await marcarConclusao(item.id, els.modalObs.value, fotoUrl);

    // Atualizar estado local
    const idx = estado.itens.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      estado.itens[idx].status = 'concluido';
      estado.itens[idx].observacao = els.modalObs.value || null;
      estado.itens[idx].foto_url = fotoUrl;
      localStorage.setItem('labareda_itens', JSON.stringify(estado.itens));
    }

    fecharModal();
    renderizarLista();
    toast('Item concluido!');
  } catch (err) {
    toast(err.message || 'Erro ao confirmar. Tente novamente.');
  } finally {
    els.btnConfirmar.disabled = false;
    els.btnConfirmar.textContent = 'CONFIRMAR';
  }
}

/* ================================================================== */
/*  LOGIN VIA EMAIL/SENHA                                             */
/* ================================================================== */
async function fazerLogin(email, senha) {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/colaboradores?email=eq.${encodeURIComponent(email)}&senha_hash=eq.${encodeURIComponent(senha)}&ativo=eq.true&select=id,nome,propriedade_id,email`;

  const resp = await fetch(url, {
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    },
  });

  if (!resp.ok) throw new Error('Erro de conexao. Tente novamente.');

  const data = await resp.json();
  if (data.length !== 1) throw new Error('Email ou senha incorretos.');

  return data[0];
}

async function processarLogin(e) {
  e.preventDefault();

  const email = els.loginEmail.value.trim();
  const senha = els.loginSenha.value;

  if (!email || !senha) return;

  els.btnLogin.disabled = true;
  els.btnLogin.textContent = 'Entrando...';
  els.loginErro.classList.add('escondido');

  try {
    const colaborador = await fazerLogin(email, senha);

    estado.modoLogin = true;
    estado.token = null;
    estado.usuario = {
      colaborador_id: colaborador.id,
      propriedade_id: colaborador.propriedade_id,
      nome: colaborador.nome,
    };

    sessionStorage.setItem('labareda_usuario', JSON.stringify(estado.usuario));

    await iniciarPainel();
  } catch (err) {
    els.loginErro.textContent = err.message || 'Erro ao entrar. Tente novamente.';
    els.loginErro.classList.remove('escondido');
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.textContent = 'Entrar';
  }
}

function fazerLogout() {
  sessionStorage.removeItem('labareda_usuario');
  sessionStorage.removeItem('labareda_token');
  localStorage.removeItem('labareda_itens');

  estado.token = null;
  estado.usuario = null;
  estado.itens = [];
  estado.modoLogin = false;

  els.btnSair.classList.add('escondido');
  mostrarTela(els.telaLogin);
  els.loginEmail.value = '';
  els.loginSenha.value = '';
  els.loginErro.classList.add('escondido');
}

async function iniciarPainel() {
  // Mostrar header e loading
  els.headerPrincipal.classList.remove('escondido');
  els.btnSair.classList.toggle('escondido', !estado.modoLogin);
  mostrarTela(els.telaLoading);

  // Atualizar header
  els.saudacao.textContent = `Ola, ${estado.usuario.nome}!`;
  els.metaInfo.textContent = dataFormatada();

  // Carregar itens
  try {
    await carregarItens();
    renderizarLista();
    mostrarTela(els.telaPrincipal);
  } catch (err) {
    const cache = localStorage.getItem('labareda_itens');
    if (cache) {
      estado.itens = JSON.parse(cache);
      renderizarLista();
      mostrarTela(els.telaPrincipal);
      toast('Exibindo dados do cache.');
    } else {
      mostrarErro('Erro ao carregar', 'Nao foi possivel carregar suas tarefas. Verifique sua conexao e tente novamente.');
    }
  }

  // Sincronizar pendentes
  sincronizarPendentes();
}

/* ================================================================== */
/*  EVENT LISTENERS                                                   */
/* ================================================================== */
function registrarEventos() {
  // Login form
  els.formLogin.addEventListener('submit', processarLogin);

  // Botao sair
  els.btnSair.addEventListener('click', fazerLogout);

  // Checkbox do modal habilita botao
  els.modalCheckbox.addEventListener('change', () => {
    els.btnConfirmar.disabled = !els.modalCheckbox.checked;
  });

  // Botao confirmar
  els.btnConfirmar.addEventListener('click', confirmarConclusao);

  // Fechar modal
  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) fecharModal();
  });

  // Tecla Escape fecha modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.modalOverlay.classList.contains('aberto')) {
      fecharModal();
    }
  });

  // Input de foto
  els.inputFoto.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      estado.fotoBlob = await comprimirImagem(file);
      const url = URL.createObjectURL(estado.fotoBlob);
      els.fotoImg.src = url;
      els.fotoPreview.classList.add('visivel');
    } catch {
      toast('Erro ao processar a foto.');
    }
  });

  // Remover foto
  els.btnRemoverFoto.addEventListener('click', () => {
    estado.fotoBlob = null;
    els.fotoImg.src = '';
    els.fotoPreview.classList.remove('visivel');
    els.inputFoto.value = '';
  });

  // Online / Offline
  window.addEventListener('online', () => {
    estado.online = true;
    els.bannerOffline.classList.remove('visivel');
    sincronizarPendentes();
  });

  window.addEventListener('offline', () => {
    estado.online = false;
    els.bannerOffline.classList.add('visivel');
  });

  // Service Worker sync
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SYNC_PENDENTES') {
        sincronizarPendentes();
      }
    });
  }
}

/* ================================================================== */
/*  INICIALIZACAO                                                     */
/* ================================================================== */
async function inicializar() {
  cachearElementos();
  registrarEventos();

  // Status online/offline
  if (!estado.online) {
    els.bannerOffline.classList.add('visivel');
  }

  // ---- Fluxo 1: JWT via URL (?t=...) ----
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t');

  // Tentar sessionStorage JWT se nao veio na URL
  const tokenFinal = token || sessionStorage.getItem('labareda_token');

  if (tokenFinal) {
    const payload = decodificarJWT(tokenFinal);
    if (!payload) {
      mostrarErro('Link invalido', 'O link de acesso nao e valido. Solicite um novo link.');
      return;
    }

    if (tokenExpirado(payload)) {
      // Token expirado — limpar e mostrar login
      sessionStorage.removeItem('labareda_token');
      mostrarTela(els.telaLogin);
      return;
    }

    // JWT valido
    estado.token = tokenFinal;
    estado.modoLogin = false;
    estado.usuario = {
      colaborador_id: payload.colaborador_id,
      propriedade_id: payload.propriedade_id,
      nome: payload.nome,
      exp: payload.exp,
    };
    sessionStorage.setItem('labareda_token', tokenFinal);

    // Limpar token da URL (seguranca)
    if (token) {
      const url = new URL(window.location);
      url.searchParams.delete('t');
      window.history.replaceState({}, '', url);
    }

    await iniciarPainel();
    return;
  }

  // ---- Fluxo 2: Sessao salva (login anterior) ----
  const usuarioSalvo = sessionStorage.getItem('labareda_usuario');
  if (usuarioSalvo) {
    try {
      estado.usuario = JSON.parse(usuarioSalvo);
      estado.modoLogin = true;
      estado.token = null;
      await iniciarPainel();
      return;
    } catch {
      sessionStorage.removeItem('labareda_usuario');
    }
  }

  // ---- Fluxo 3: Sem token e sem sessao — mostrar login ----
  mostrarTela(els.telaLogin);
}

/* ================================================================== */
/*  SERVICE WORKER REGISTER                                           */
/* ================================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // SW nao suportado ou falhou — continuar sem
    });
  });
}

/* ================================================================== */
/*  BOOT                                                              */
/* ================================================================== */
document.addEventListener('DOMContentLoaded', inicializar);
