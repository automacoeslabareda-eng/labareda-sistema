/**
 * Labareda — Painel do Colaborador (PWA)
 * Vanilla JS, zero dependencias.
 * Tabs: Tarefas | Avisos
 */

/* ================================================================== */
/*  CONFIGURACAO                                                      */
/* ================================================================== */
const CONFIG = {
  SUPABASE_URL: 'https://tidngxclgaspltzqoemi.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZG5neGNsZ2FzcGx0enFvZW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA0NTUsImV4cCI6MjA5ODQ5NjQ1NX0.RXKWEePM6xsmXgd1ZVgkgavegQTNAIw-9FkMh-7vfFE',
  N8N_WEBHOOK_URL: 'https://n8n.sitiolabareda.com',
};

/* ================================================================== */
/*  ESTADO                                                            */
/* ================================================================== */
let estado = {
  token: null,
  usuario: null,
  itens: [],
  avisos: [],
  itemSelecionado: null,
  fotoBlob: null,
  audioBlob: null,
  online: navigator.onLine,
  modoLogin: false,
  abaAtiva: 'tarefas',
};

/* ================================================================== */
/*  AUDIO — gravacao                                                  */
/* ================================================================== */
let mediaRecorder = null;
let audioChunks = [];
let audioTimerInterval = null;
let audioStartTime = 0;

/* ================================================================== */
/*  JWT                                                               */
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
/*  DOM                                                               */
/* ================================================================== */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

const els = {};
function cachearElementos() {
  els.telaLogin      = $('#tela-login');
  els.formLogin      = $('#form-login');
  els.loginEmail     = $('#login-email');
  els.loginSenha     = $('#login-senha');
  els.loginErro      = $('#login-erro');
  els.btnLogin       = $('#btn-login');
  els.headerPrincipal = $('#header-principal');
  els.btnSair        = $('#btn-sair');
  els.tabsNav        = $('#tabs-nav');
  els.telaLoading    = $('#tela-loading');
  els.telaErro       = $('#tela-erro');
  els.telaPrincipal  = $('#tela-principal');
  els.erroTitulo     = $('#erro-titulo');
  els.erroMsg        = $('#erro-msg');
  els.saudacao       = $('#saudacao');
  els.metaInfo       = $('#meta-info');
  els.listaTarefas   = $('#lista-tarefas');
  els.listaAvisos    = $('#lista-avisos');
  els.abaTarefas     = $('#aba-tarefas');
  els.abaAvisos      = $('#aba-avisos');
  els.bannerOffline  = $('#banner-offline');
  els.modalOverlay   = $('#modal-overlay');
  els.modalTitulo    = $('#modal-titulo');
  els.modalSetor     = $('#modal-setor');
  els.modalCheckbox  = $('#modal-checkbox');
  els.modalObs       = $('#modal-obs');
  els.inputFoto      = $('#input-foto');
  els.fotoPreview    = $('#foto-preview');
  els.fotoImg        = $('#foto-img');
  els.btnRemoverFoto = $('#btn-remover-foto');
  els.btnGravarAudio = $('#btn-gravar-audio');
  els.audioPreview   = $('#audio-preview');
  els.audioPlayer    = $('#audio-player');
  els.btnRemoverAudio = $('#btn-remover-audio');
  els.audioGravando  = $('#audio-gravando');
  els.audioTimer     = $('#audio-timer');
  els.btnPararAudio  = $('#btn-parar-audio');
  els.textoAudio     = $('#texto-audio');
  els.btnConfirmar   = $('#btn-confirmar');
  els.toast          = $('#toast');
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
    els.tabsNav.classList.add('escondido');
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
/*  TABS                                                              */
/* ================================================================== */
function trocarAba(aba) {
  estado.abaAtiva = aba;

  $$('.tab').forEach((t) => {
    t.classList.toggle('tab--ativo', t.dataset.tab === aba);
    t.setAttribute('aria-selected', t.dataset.tab === aba ? 'true' : 'false');
  });

  els.abaTarefas.classList.toggle('escondido', aba !== 'tarefas');
  els.abaAvisos.classList.toggle('escondido', aba !== 'avisos');
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
/*  HELPERS API                                                       */
/* ================================================================== */
function apiHeaders() {
  const authToken = estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token;
  return {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${authToken}`,
    'Accept': 'application/json',
  };
}

/* ================================================================== */
/*  API — carregar itens (tarefas)                                    */
/* ================================================================== */
async function carregarItens() {
  const uid = estado.usuario.colaborador_id;
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/checklist_items?colaborador_id=eq.${uid}&status=neq.bloqueado&select=id,descricao,status,observacao,foto_url,audio_url,tarefa_id,ordem,tarefas(comando_original,setor_interpretado,setor_id,data_inicio,data_fim,setores(nome,icone))&order=ordem.asc`;

  const resp = await fetch(url, { headers: apiHeaders() });
  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
  estado.itens = await resp.json();
  localStorage.setItem('labareda_itens', JSON.stringify(estado.itens));
}

/* ================================================================== */
/*  API — carregar avisos                                             */
/* ================================================================== */
async function carregarAvisos() {
  const uid = estado.usuario.colaborador_id;
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/avisos?colaborador_id=eq.${uid}&ativo=eq.true&select=id,descricao,frequencia,dia_disparo_semana,dias_disparo_mes&order=frequencia.asc,descricao.asc`;

  const resp = await fetch(url, { headers: apiHeaders() });
  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
  estado.avisos = await resp.json();
}


/* ================================================================== */
/*  API — upload de foto                                              */
/* ================================================================== */
async function uploadFoto(itemId) {
  if (!estado.fotoBlob) return null;

  const ts = Date.now();
  const path = `${estado.usuario.propriedade_id}/${estado.usuario.colaborador_id}/${itemId}-${ts}.jpg`;
  const url = `${CONFIG.SUPABASE_URL}/storage/v1/object/fotos-comprovacao/${path}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token}`,
      'Content-Type': 'image/jpeg',
    },
    body: estado.fotoBlob,
  });

  if (!resp.ok) throw new Error('Falha no upload da foto');
  return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/fotos-comprovacao/${path}`;
}

/* ================================================================== */
/*  API — upload de audio                                             */
/* ================================================================== */
async function uploadAudio(itemId) {
  if (!estado.audioBlob) return null;

  const ts = Date.now();
  const path = `${estado.usuario.propriedade_id}/${estado.usuario.colaborador_id}/${itemId}-${ts}.webm`;
  const url = `${CONFIG.SUPABASE_URL}/storage/v1/object/audios-observacao/${path}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token}`,
      'Content-Type': 'audio/webm',
    },
    body: estado.audioBlob,
  });

  if (!resp.ok) throw new Error('Falha no upload do audio');
  return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/audios-observacao/${path}`;
}

/* ================================================================== */
/*  API — marcar conclusao                                            */
/* ================================================================== */
async function marcarConclusao(itemId, observacao, fotoUrl, audioUrl) {
  const patchPayload = {
    status: 'concluido',
    observacao: observacao || null,
    foto_url: fotoUrl || null,
    audio_url: audioUrl || null,
    concluido_at: new Date().toISOString(),
  };

  if (!estado.online) {
    salvarPendente({ item_id: itemId, ...patchPayload });
    return;
  }

  // 1) Atualizar o checklist_item no Supabase
  const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/checklist_items?id=eq.${itemId}`, {
    method: 'PATCH',
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(patchPayload),
  });

  if (!resp.ok) {
    salvarPendente({ item_id: itemId, ...patchPayload });
    throw new Error('Falha ao enviar. Salvo para reenvio automatico.');
  }

  // 2) Atualizar porcentagem da tarefa pai
  const item = estado.itens.find((i) => i.id === itemId);
  if (item && item.tarefa_id) {
    await atualizarConclusaoTarefa(item.tarefa_id);
  }

  // 3) Notificar Telegram via webhook
  if (CONFIG.N8N_WEBHOOK_URL) {
    const itemDados = item || estado.itens.find((i) => i.id === itemId) || {};
    const tarefaNome = (itemDados.tarefas && itemDados.tarefas.comando_original) || itemDados.descricao || 'Tarefa';
    const webhookPayload = {
      colaborador_nome: estado.usuario.nome,
      descricao_item: itemDados.descricao || '',
      tarefa_nome: tarefaNome,
      foto_url: fotoUrl || '',
      observacao: observacao || '',
      propriedade_id: estado.usuario.propriedade_id,
    };
    console.log('Disparando Telegram:', webhookPayload);
    fetch(`${CONFIG.N8N_WEBHOOK_URL}/webhook/tarefa-concluida`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    }).then((r) => console.log('Telegram webhook:', r.status))
      .catch((e) => console.log('Webhook Telegram erro:', e.message));
  }
}

async function atualizarConclusaoTarefa(tarefaId) {
  try {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/checklist_items?tarefa_id=eq.${tarefaId}&select=id,status`;
    const resp = await fetch(url, { headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token}`,
    }});
    if (!resp.ok) return;
    const items = await resp.json();
    if (!items || items.length === 0) return;

    const concluidos = items.filter((i) => i.status === 'concluido').length;
    const pct = Math.round((concluidos / items.length) * 100);
    const novoStatus = pct === 100 ? 'concluida' : (pct > 0 ? 'em_andamento' : 'pendente');

    await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/tarefas?id=eq.${tarefaId}`, {
      method: 'PATCH',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${estado.modoLogin ? CONFIG.SUPABASE_ANON_KEY : estado.token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        porcentagem_conclusao: pct,
        status: novoStatus,
        concluida_at: pct === 100 ? new Date().toISOString() : null,
      }),
    });
  } catch (err) {
    console.error('Erro ao atualizar conclusao da tarefa:', err);
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
  const pendentes = JSON.parse(localStorage.getItem('labareda_pendentes') || '[]');
  if (pendentes.length === 0) return;

  const restantes = [];
  for (const p of pendentes) {
    try {
      const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/checklist_items?id=eq.${p.item_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          status: p.status,
          observacao: p.observacao,
          foto_url: p.foto_url,
          audio_url: p.audio_url,
          concluido_at: p.concluido_at,
        }),
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
          if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
          else { w = Math.round((w * MAX) / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Falha na compressao')),
          'image/jpeg', 0.7
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
/*  GRAVACAO DE AUDIO                                                 */
/* ================================================================== */
async function iniciarGravacao() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      estado.audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(estado.audioBlob);
      els.audioPlayer.src = url;
      els.audioPreview.classList.remove('escondido');
      els.audioGravando.classList.add('escondido');
      els.btnGravarAudio.classList.remove('escondido');
      pararTimerAudio();
    };

    mediaRecorder.start();
    audioStartTime = Date.now();
    iniciarTimerAudio();

    els.btnGravarAudio.classList.add('escondido');
    els.audioGravando.classList.remove('escondido');
  } catch {
    toast('Nao foi possivel acessar o microfone.');
  }
}

function pararGravacao() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function iniciarTimerAudio() {
  audioTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - audioStartTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    els.audioTimer.textContent = `${min}:${sec}`;
  }, 500);
}

function pararTimerAudio() {
  if (audioTimerInterval) {
    clearInterval(audioTimerInterval);
    audioTimerInterval = null;
  }
}

function removerAudio() {
  estado.audioBlob = null;
  els.audioPlayer.src = '';
  els.audioPreview.classList.add('escondido');
}

/* ================================================================== */
/*  RENDERIZAR — TAREFAS                                              */
/* ================================================================== */
function renderizarTarefas() {
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

  // Separar itens pendentes e concluidos
  const itensPendentes = estado.itens.filter((i) => i.status !== 'concluido');
  const itensConcluidos = estado.itens.filter((i) => i.status === 'concluido');

  function renderizarGrupo(itensLista, containerEl) {
    const grupos = {};
    itensLista.forEach((item) => {
      const tid = item.tarefa_id || 'sem-tarefa';
      if (!grupos[tid]) grupos[tid] = [];
      grupos[tid].push(item);
    });

    Object.entries(grupos).forEach(([tarefaId, itens]) => {
      const tarefa = itens[0].tarefas;
      const setorNome = tarefa?.setores?.nome || tarefa?.setor_interpretado || 'Geral';
      const setorIcone = tarefa?.setores?.icone || '📋';
      const todosCompletos = itens.every((i) => i.status === 'concluido');

      let periodo = '';
      if (tarefa?.data_inicio && tarefa?.data_fim) {
        const di = new Date(tarefa.data_inicio + 'T12:00:00');
        const df = new Date(tarefa.data_fim + 'T12:00:00');
        periodo = `${di.getDate()}/${di.getMonth()+1} a ${df.getDate()}/${df.getMonth()+1}`;
      }

      const grupoEl = document.createElement('section');
      grupoEl.className = 'grupo-tarefa';
      grupoEl.setAttribute('aria-label', `Tarefa: ${setorNome}`);

      grupoEl.innerHTML = `
        <div class="grupo-tarefa__header">
          <span class="grupo-tarefa__icone" aria-hidden="true">${setorIcone}</span>
          <h2 class="grupo-tarefa__nome">${setorNome}${periodo ? ' — ' + periodo : ''}</h2>
        </div>
        <div class="banner-completa ${todosCompletos ? 'visivel' : ''}" role="status" aria-live="polite">
          <span class="banner-completa__icone" aria-hidden="true">&#10003;</span>
          Tarefa completa!
        </div>
      `;

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
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirModal(item); }
          });
        }

        grupoEl.appendChild(card);
      });

      containerEl.appendChild(grupoEl);
    });
  }

  // Pendentes primeiro
  if (itensPendentes.length > 0) {
    renderizarGrupo(itensPendentes, container);
  } else {
    container.innerHTML = `
      <div class="empty-state" role="status">
        <div class="empty-state__icone" aria-hidden="true">&#11088;</div>
        <p class="empty-state__msg">Tudo concluido! Bom trabalho!</p>
      </div>
    `;
  }

  // Concluidos separados
  if (itensConcluidos.length > 0) {
    const secaoConcluidos = document.createElement('div');
    secaoConcluidos.innerHTML = `
      <div class="secao-header" style="margin-top:24px;padding:8px 0;border-top:1px solid var(--border, #e0e0e0)">
        <span class="secao-header__icone">&#10003;</span>
        <span class="secao-header__titulo" style="color:var(--text-muted, #888)">Concluidos (${itensConcluidos.length})</span>
      </div>
    `;
    container.appendChild(secaoConcluidos);
    renderizarGrupo(itensConcluidos, container);
  }
}

/* ================================================================== */
/*  RENDERIZAR — AVISOS                                               */
/* ================================================================== */
function renderizarAvisos() {
  const container = els.listaAvisos;
  container.innerHTML = '';

  if (estado.avisos.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="status">
        <div class="empty-state__icone" aria-hidden="true">&#128276;</div>
        <p class="empty-state__msg">Nenhum aviso no momento.</p>
      </div>
    `;
    return;
  }

  const freqLabel = { diario: 'Diario', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
  const freqIcone = { diario: '📅', semanal: '📆', quinzenal: '🔄', mensal: '📋' };

  // Agrupar por frequencia
  const grupos = {};
  estado.avisos.forEach((a) => {
    const f = a.frequencia || 'semanal';
    if (!grupos[f]) grupos[f] = [];
    grupos[f].push(a);
  });

  Object.entries(grupos).forEach(([freq, avisos]) => {
    const secao = document.createElement('div');
    secao.style.marginBottom = '20px';

    secao.innerHTML = `
      <div class="secao-header">
        <span class="secao-header__icone">${freqIcone[freq] || '📋'}</span>
        <span class="secao-header__titulo">${freqLabel[freq] || freq}</span>
        <span class="secao-header__badge">${avisos.length}</span>
      </div>
    `;

    avisos.forEach((aviso) => {
      const card = document.createElement('div');
      card.className = 'card-aviso';
      card.innerHTML = `
        <span class="card-aviso__icone">&#128276;</span>
        <div class="card-aviso__corpo">
          <p class="card-aviso__descricao">${aviso.descricao}</p>
          <span class="card-aviso__freq">${freqLabel[aviso.frequencia] || aviso.frequencia}</span>
        </div>
      `;
      secao.appendChild(card);
    });

    container.appendChild(secao);
  });
}


/* ================================================================== */
/*  MODAL — DETALHE DO ITEM                                           */
/* ================================================================== */
function abrirModal(item) {
  estado.itemSelecionado = item;
  estado.fotoBlob = null;
  estado.audioBlob = null;

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
  els.audioPreview.classList.add('escondido');
  els.audioPlayer.src = '';
  els.audioGravando.classList.add('escondido');
  els.btnGravarAudio.classList.remove('escondido');
  els.btnConfirmar.disabled = true;

  els.modalOverlay.classList.add('aberto');
  document.body.style.overflow = 'hidden';

  setTimeout(() => els.modalCheckbox.focus(), 300);
}

function fecharModal() {
  els.modalOverlay.classList.remove('aberto');
  document.body.style.overflow = '';
  estado.itemSelecionado = null;
  estado.fotoBlob = null;
  estado.audioBlob = null;
  pararGravacao();
  pararTimerAudio();
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
    let audioUrl = null;

    if (estado.fotoBlob) {
      try { fotoUrl = await uploadFoto(item.id); }
      catch { toast('Foto nao enviada, mas tarefa registrada.'); }
    }

    if (estado.audioBlob) {
      try { audioUrl = await uploadAudio(item.id); }
      catch { toast('Audio nao enviado, mas tarefa registrada.'); }
    }

    await marcarConclusao(item.id, els.modalObs.value, fotoUrl, audioUrl);

    const idx = estado.itens.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      estado.itens[idx].status = 'concluido';
      estado.itens[idx].observacao = els.modalObs.value || null;
      estado.itens[idx].foto_url = fotoUrl;
      estado.itens[idx].audio_url = audioUrl;
      localStorage.setItem('labareda_itens', JSON.stringify(estado.itens));
    }

    fecharModal();
    renderizarTarefas();
    toast('Item concluido!');
  } catch (err) {
    toast(err.message || 'Erro ao confirmar. Tente novamente.');
  } finally {
    els.btnConfirmar.disabled = false;
    els.btnConfirmar.textContent = 'CONFIRMAR';
  }
}

/* ================================================================== */
/*  LOGIN                                                             */
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
  estado.avisos = [];
  estado.modoLogin = false;

  els.btnSair.classList.add('escondido');
  els.tabsNav.classList.add('escondido');
  mostrarTela(els.telaLogin);
  els.loginEmail.value = '';
  els.loginSenha.value = '';
  els.loginErro.classList.add('escondido');
}

async function iniciarPainel() {
  els.headerPrincipal.classList.remove('escondido');
  els.btnSair.classList.toggle('escondido', !estado.modoLogin);
  mostrarTela(els.telaLoading);

  els.saudacao.textContent = `Ola, ${estado.usuario.nome}!`;
  els.metaInfo.textContent = dataFormatada();

  try {
    await Promise.all([
      carregarItens(),
      carregarAvisos(),
    ]);

    renderizarTarefas();
    renderizarAvisos();

    els.tabsNav.classList.remove('escondido');
    trocarAba('tarefas');
    mostrarTela(els.telaPrincipal);
  } catch (err) {
    const cache = localStorage.getItem('labareda_itens');
    if (cache) {
      estado.itens = JSON.parse(cache);
      renderizarTarefas();
      els.tabsNav.classList.remove('escondido');
      trocarAba('tarefas');
      mostrarTela(els.telaPrincipal);
      toast('Exibindo dados do cache.');
    } else {
      mostrarErro('Erro ao carregar', 'Nao foi possivel carregar suas tarefas. Verifique sua conexao e tente novamente.');
    }
  }

  sincronizarPendentes();
}

/* ================================================================== */
/*  EVENT LISTENERS                                                   */
/* ================================================================== */
function registrarEventos() {
  els.formLogin.addEventListener('submit', processarLogin);
  els.btnSair.addEventListener('click', fazerLogout);

  // Tabs
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => trocarAba(tab.dataset.tab));
  });

  // Modal
  els.modalCheckbox.addEventListener('change', () => {
    els.btnConfirmar.disabled = !els.modalCheckbox.checked;
  });

  els.btnConfirmar.addEventListener('click', confirmarConclusao);

  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) fecharModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.modalOverlay.classList.contains('aberto')) fecharModal();
  });

  // Foto
  els.inputFoto.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      estado.fotoBlob = await comprimirImagem(file);
      els.fotoImg.src = URL.createObjectURL(estado.fotoBlob);
      els.fotoPreview.classList.add('visivel');
    } catch {
      toast('Erro ao processar a foto.');
    }
  });

  els.btnRemoverFoto.addEventListener('click', () => {
    estado.fotoBlob = null;
    els.fotoImg.src = '';
    els.fotoPreview.classList.remove('visivel');
    els.inputFoto.value = '';
  });

  // Audio
  els.btnGravarAudio.addEventListener('click', iniciarGravacao);
  els.btnPararAudio.addEventListener('click', pararGravacao);
  els.btnRemoverAudio.addEventListener('click', removerAudio);

  // Online/Offline
  window.addEventListener('online', () => {
    estado.online = true;
    els.bannerOffline.classList.remove('visivel');
    sincronizarPendentes();
  });

  window.addEventListener('offline', () => {
    estado.online = false;
    els.bannerOffline.classList.add('visivel');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SYNC_PENDENTES') sincronizarPendentes();
    });
  }
}

/* ================================================================== */
/*  INICIALIZACAO                                                     */
/* ================================================================== */
async function inicializar() {
  cachearElementos();
  registrarEventos();

  if (!estado.online) els.bannerOffline.classList.add('visivel');

  // Fluxo 1: JWT via URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t');
  const tokenFinal = token || sessionStorage.getItem('labareda_token');

  if (tokenFinal) {
    const payload = decodificarJWT(tokenFinal);
    if (!payload) {
      mostrarErro('Link invalido', 'O link de acesso nao e valido. Solicite um novo link.');
      return;
    }
    if (tokenExpirado(payload)) {
      sessionStorage.removeItem('labareda_token');
      mostrarTela(els.telaLogin);
      return;
    }
    estado.token = tokenFinal;
    estado.modoLogin = false;
    estado.usuario = {
      colaborador_id: payload.colaborador_id,
      propriedade_id: payload.propriedade_id,
      nome: payload.nome,
      exp: payload.exp,
    };
    sessionStorage.setItem('labareda_token', tokenFinal);
    if (token) {
      const url = new URL(window.location);
      url.searchParams.delete('t');
      window.history.replaceState({}, '', url);
    }
    await iniciarPainel();
    return;
  }

  // Fluxo 2: Sessao salva
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

  // Fluxo 3: Login
  mostrarTela(els.telaLogin);
}

/* ================================================================== */
/*  SERVICE WORKER                                                    */
/* ================================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* ================================================================== */
/*  BOOT                                                              */
/* ================================================================== */
document.addEventListener('DOMContentLoaded', inicializar);
