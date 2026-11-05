/**
 * Testes da nota fiscal (NF-e via NFe+) com servicos simulados:
 * banco (Supabase), NFe+, ViaCEP e Resend. Sem dependencias externas.
 *
 *   node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

// Os modulos do fluxo importam supabase-js e mercadopago no topo; os testes
// nao usam nenhum dos dois, entao entram stubs vazios.
const resolverOriginal = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === '@supabase/supabase-js' || req === 'mercadopago') return req;
  return resolverOriginal.call(this, req, parent, ...rest);
};
require.cache['@supabase/supabase-js'] = { id: '@supabase/supabase-js', filename: '@supabase/supabase-js', loaded: true, exports: { createClient() {} } };
require.cache.mercadopago = { id: 'mercadopago', filename: 'mercadopago', loaded: true, exports: { MercadoPagoConfig: function () {}, Payment: function () {}, Preference: function () {} } };

const API = path.join(__dirname, '..', 'src', 'api');
const nf = require(path.join(API, '_nota-fiscal.js'));
const fluxo = require(path.join(API, '_pedido-fluxo.js'));

/* ------------------------------------------------------------------ */
/*  Banco simulado (subconjunto do supabase-js usado pelo fluxo)       */
/* ------------------------------------------------------------------ */

function partirTopo(s) {
  const partes = [];
  let nivel = 0, atual = '';
  for (const ch of s) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { partes.push(atual); atual = ''; continue; }
    atual += ch;
  }
  if (atual) partes.push(atual);
  return partes;
}

/* Avalia filtros PostgREST do tipo usado em .or(): col.is.null, col.eq.v,
   col.lt.v, col.in.(a,b), and(...). */
function avaliarOr(expr, linha) {
  return partirTopo(expr).some((termo) => avaliarTermo(termo, linha));
}
function avaliarTermo(termo, linha) {
  if (termo.startsWith('and(')) return partirTopo(termo.slice(4, -1)).every((t) => avaliarTermo(t, linha));
  const [col, op, ...resto] = termo.split('.');
  const valor = resto.join('.');
  const atual = linha[col];
  if (op === 'is') return valor === 'null' ? atual == null : String(atual) === valor;
  if (op === 'eq') return String(atual) === valor;
  if (op === 'lt') return atual != null && String(atual) < valor;
  if (op === 'in') return valor.slice(1, -1).split(',').indexOf(String(atual)) >= 0;
  throw new Error('filtro nao suportado: ' + termo);
}

function criarBanco(tabelas) {
  const db = { tabelas, arquivos: {} };
  db.from = function (nome) {
    const t = tabelas[nome] || (tabelas[nome] = []);
    const filtros = [];
    let acao = 'select', dados = null, unico = null, retornar = false;
    const q = {
      select() { if (acao !== 'select') retornar = true; return q; },
      eq(c, v) { filtros.push((l) => l[c] === v); return q; },
      is(c, v) { filtros.push((l) => (v === null ? l[c] == null : l[c] === v)); return q; },
      in(c, vs) { filtros.push((l) => vs.indexOf(l[c]) >= 0); return q; },
      or(expr) { filtros.push((l) => avaliarOr(expr, l)); return q; },
      order() { return q; },
      limit() { return q; },
      update(d) { acao = 'update'; dados = d; return q; },
      insert(d) { acao = 'insert'; dados = d; return q; },
      upsert(d) { acao = 'upsert'; dados = d; return q; },
      single() { unico = 'single'; return q; },
      maybeSingle() { unico = 'maybe'; return q; },
      then(resolve, reject) {
        try { resolve(executar()); } catch (e) { reject(e); }
      },
    };
    function executar() {
      let linhas;
      if (acao === 'insert') {
        const novo = Object.assign({ id: 'id-' + Math.random().toString(36).slice(2), status: 'aberta', tentativas: 1 }, dados);
        if (nome === 'pedido_pendencias' && t.some((l) => l.pedido_id === novo.pedido_id && l.tipo === novo.tipo && l.status === 'aberta')) {
          return { data: null, error: { code: '23505', message: 'duplicada' } };
        }
        t.push(novo);
        linhas = [novo];
      } else if (acao === 'upsert') {
        let l = t.find((x) => x.id === dados.id);
        if (l) Object.assign(l, dados); else { l = Object.assign({}, dados); t.push(l); }
        linhas = [l];
      } else {
        linhas = t.filter((l) => filtros.every((f) => f(l)));
        if (acao === 'update') linhas.forEach((l) => Object.assign(l, dados));
      }
      const copia = linhas.map((l) => Object.assign({}, l));
      if (unico === 'single') return copia.length ? { data: copia[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'nenhuma linha' } };
      if (unico === 'maybe') return { data: copia[0] || null, error: null };
      return { data: acao === 'select' || retornar ? copia : null, error: null, count: copia.length };
    }
    return q;
  };
  db.rpc = async () => ({ data: null, error: { code: 'PGRST202' } });
  db.storage = {
    from() {
      return {
        async upload(p, conteudo) { db.arquivos[p] = Buffer.from(conteudo); return { data: { path: p }, error: null }; },
        async download(p) {
          if (!db.arquivos[p]) return { data: null, error: { message: 'nao existe' } };
          const b = db.arquivos[p];
          return { data: { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }, error: null };
        },
        async createSignedUrl(p) { return { data: { signedUrl: 'https://storage.test/' + p + '?token=x' }, error: null }; },
      };
    },
  };
  return db;
}

/* ------------------------------------------------------------------ */
/*  NFe+, ViaCEP e Resend simulados                                    */
/* ------------------------------------------------------------------ */

function criarServicos(opcoes) {
  const s = Object.assign({
    salvar: 0, emails: [], n8n: [], notas: {}, proximoCodigo: 500, situacaoNova: 50,
    msgSalvar: 'Retorno: 100 - Autorizado o uso da NF-e', falharSalvar: null, planoSemApi: false,
    atrasoSalvar: 0,
  }, opcoes || {});
  global.fetch = async (url, init) => {
    url = String(url);
    const corpo = init && init.body ? JSON.parse(init.body) : null;
    const json = (status, obj) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj), arrayBuffer: async () => new ArrayBuffer(0) });
    if (url.indexOf('viacep.com.br') >= 0) return json(200, { ibge: '3550308', localidade: 'São Paulo' });
    if (url.indexOf('api.resend.com') >= 0) { s.emails.push(corpo); return json(200, { id: 'email' }); }
    if (url.indexOf('n8n.test') >= 0) { s.n8n.push(corpo); return json(200, {}); }
    if (url.indexOf('/oauth/access_token') >= 0) return json(200, { access_token: 'AT', expires_in: 900 });
    if (s.planoSemApi) return json(403, { errCode: 403, errMsg: 'Seu plano não possui acesso à API.', errObs: 'A API NFeMais está disponível apenas para planos profissionais.' });
    if (url.endsWith('/v1/nfe/salvar')) {
      s.salvar++;
      s.ultimoXml = corpo.xml;
      if (s.atrasoSalvar) await new Promise((r) => setTimeout(r, s.atrasoSalvar));
      if (s.falharSalvar === 'rede') { s.falharSalvar = null; const codigo = s.proximoCodigo++; s.notas[codigo] = { codigo, numero: 77, chave: '2926' + '1'.repeat(40), situacao: s.situacaoNova, valor: 213.27, cliente: 'Maria José' }; throw new Error('fetch failed'); }
      if (s.falharSalvar === 'validacao') { s.falharSalvar = null; return json(400, { errCode: 400, errMsg: 'XML inválido' }); }
      const codigo = s.proximoCodigo++;
      s.notas[codigo] = { codigo, numero: 77, chave: '2926' + '1'.repeat(40), situacao: s.situacaoNova, valor: 213.27, cliente: 'Maria José' };
      return json(200, { codigo, code: 200, msg: s.situacaoNova === 15 ? 'Retorno: 778 - Rejeição: NCM inexistente' : s.msgSalvar });
    }
    const m = url.match(/\/v1\/nfe\/(\d+)(\/xml|\/danfe)?$/);
    if (m) {
      const n = s.notas[m[1]];
      if (!n) return json(404, { errCode: 404, errMsg: 'não encontrada' });
      if (m[2] === '/xml') return { ok: true, status: 200, text: async () => '<nfeProc>' + n.chave + '</nfeProc>' };
      if (m[2] === '/danfe') return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('%PDF-danfe').buffer };
      return json(200, { codigo: n.codigo, numero: n.numero, chave: n.chave, situacao: n.situacao });
    }
    if (url.indexOf('/v1/nfe?') >= 0) {
      // Como a API real: o dia de dtFim fica de fora — a nota de hoje so vem com dtFim = amanha
      const dtFim = (url.match(/dtFim=([0-9-]+)/) || [])[1];
      const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      return json(200, { data: dtFim > hoje ? Object.values(s.notas) : [] });
    }
    throw new Error('URL inesperada no teste: ' + url);
  };
  return s;
}

/* ------------------------------------------------------------------ */
/*  Dados de exemplo                                                   */
/* ------------------------------------------------------------------ */

const CONFIG = {
  id: 1, modo: 'manual', ambiente: 1, cnpj: '11222333000181', razao_social: 'Sitio Labareda Pousada e Hospedagem LTDA',
  inscricao_estadual: '123456789', logradouro: 'Estrada Serra Grande', numero: 'S/N', bairro: 'Zona Rural', cidade: 'Uruçuca',
  cod_municipio: '2932507', uf: 'BA', cep: '45680000', crt: 1, serie: 1, natureza_operacao: 'Venda de mercadoria',
  cfop_dentro_uf: '5102', cfop_fora_uf: '6102', csosn: '102', cst_icms: '00', aliquota_icms: 0, aliquota_icms_fora_uf: 0,
  aliquota_credito_sn: 0, cst_pis: '49', aliquota_pis: 0, cst_cofins: '49', aliquota_cofins: 0,
};

function cenario(extra) {
  extra = extra || {};
  process.env.NFEMAIS_TOKEN = 'personal-token-teste';
  process.env.RESEND_API_KEY = 're_teste';
  process.env.N8N_WEBHOOK_URL = 'https://n8n.test/webhook';
  const db = criarBanco({
    config_fiscal: [Object.assign({}, CONFIG, extra.config || {})],
    pedidos: [Object.assign({
      id: 'ped-1', numero: 1042, status: 'pago', subtotal: 189.8, frete: 23.47, total: 213.27, metodo_pagamento: 'pix', cliente_id: 'cli-1',
      endereco_entrega: { rua: 'Rua das Flores', numero: '12', bairro: 'Centro', cidade: 'São Paulo', estado: 'SP', cep: '01001000' },
      nfe_status: null, nfe_codigo: null,
    }, extra.pedido || {})],
    pedido_itens: [
      { pedido_id: 'ped-1', produto_id: 'prod-a', nome_produto: 'Camiseta', tamanho: 'M', quantidade: 2, preco_unitario: 79.9 },
      { pedido_id: 'ped-1', produto_id: 'prod-b', nome_produto: 'Chocolate', tamanho: null, quantidade: 1, preco_unitario: 30 },
    ],
    produtos: [
      { id: 'prod-a', nome_pt: 'Camiseta', ncm: extra.semNcm ? null : '61091000', origem_fiscal: 0, unidade_fiscal: 'UN' },
      { id: 'prod-b', nome_pt: 'Chocolate', ncm: '18063210', origem_fiscal: 0, unidade_fiscal: 'UN' },
    ],
    clientes: [{ id: 'cli-1', nome: 'Maria José', email: 'maria@example.com', telefone: '11988887777', cpf: '52998224725' }],
    pedido_eventos: [],
    pedido_pendencias: [],
  });
  const servicos = criarServicos(extra.servicos);
  return { db, servicos };
}

const pedido = (db) => db.tabelas.pedidos[0];
const pendenciasAbertas = (db) => db.tabelas.pedido_pendencias.filter((p) => p.tipo === 'nota_fiscal' && p.status === 'aberta');
const eventos = (db) => db.tabelas.pedido_eventos.map((e) => e.tipo);

/* ------------------------------------------------------------------ */
/*  Testes                                                             */
/* ------------------------------------------------------------------ */

test('emissao desligada: nao chama o NFe+', async () => {
  const { db, servicos } = cenario({ config: { modo: 'desligado' } });
  const ctx = await fluxo.carregarContexto(db, 'ped-1');
  const r = await nf.etapaNotaFiscal(db, ctx, { origem: 'painel', manual: true });
  assert.equal(r.pulado, true);
  assert.equal(servicos.salvar, 0);
  assert.equal(pedido(db).nfe_status, null);
});

test('modo manual: o webhook nao emite, o botao do painel sim', async () => {
  const { db, servicos } = cenario();
  let ctx = await fluxo.carregarContexto(db, 'ped-1');
  assert.equal((await nf.etapaNotaFiscal(db, ctx, { origem: 'webhook' })).pulado, true);
  assert.equal(servicos.salvar, 0);
  ctx = await fluxo.carregarContexto(db, 'ped-1');
  assert.equal((await nf.etapaNotaFiscal(db, ctx, { origem: 'painel', manual: true })).status, 'autorizada');
});

test('sem migration: pula sem quebrar', async () => {
  const { db } = cenario();
  db.from = ((orig) => (nome) => {
    if (nome === 'config_fiscal') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42P01' } }) }) }) };
    return orig(nome);
  })(db.from);
  const ctx = await fluxo.carregarContexto(db, 'ped-1');
  const r = await nf.etapaNotaFiscal(db, ctx, { manual: true });
  assert.equal(r.pulado, true);
  assert.match(r.erro, /migration-etapa2/);
});

test('ambiente homologacao: nada e enviado (o NFe+ ignora o tpAmb e emitiria nota real)', async () => {
  const { db, servicos } = cenario({ config: { ambiente: 2 } });
  const r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'erro');
  assert.match(r.erro, /só emite em PRODUÇÃO/);
  assert.equal(servicos.salvar, 0);
  assert.equal(pendenciasAbertas(db).length, 1);
});

test('falta NCM: pendencia clara e nada enviado ao NFe+', async () => {
  const { db, servicos } = cenario({ semNcm: true });
  const ctx = await fluxo.carregarContexto(db, 'ped-1');
  const r = await nf.etapaNotaFiscal(db, ctx, { origem: 'painel', manual: true });
  assert.equal(r.status, 'erro');
  assert.match(r.erro, /NCM do produto "Camiseta"/);
  assert.equal(servicos.salvar, 0);
  assert.equal(pedido(db).nfe_status, 'erro');
  assert.equal(pendenciasAbertas(db).length, 1);
});

test('emissao autorizada: guarda XML+DANFE, envia ao comprador com anexos, avisa a equipe', async () => {
  const { db, servicos } = cenario();
  const ctx = await fluxo.carregarContexto(db, 'ped-1');
  const r = await nf.etapaNotaFiscal(db, ctx, { origem: 'painel', manual: true });
  assert.equal(r.status, 'autorizada');
  const p = pedido(db);
  assert.equal(p.nfe_status, 'autorizada');
  assert.equal(p.nfe_numero, 77);
  assert.equal(p.nfe_codigo, 500);
  assert.ok(db.arquivos[p.nfe_xml_path] && db.arquivos[p.nfe_danfe_path]);
  assert.ok(p.nfe_email_enviado_at);
  const paraComprador = servicos.emails.find((e) => e.to[0] === 'maria@example.com');
  // DANFE + XML + termos e condicoes de compra
  assert.equal(paraComprador.attachments.length, 3);
  assert.ok(paraComprador.attachments.some((a) => /Termos/.test(a.filename)));
  assert.ok(servicos.n8n.some((a) => a.evento === 'nota_fiscal_autorizada' && /storage\.test/.test(a.nfe_danfe_url)));
  assert.ok(eventos(db).indexOf('nota_autorizada') >= 0);
  // XML enviado: producao, com o nome real do comprador
  assert.match(servicos.ultimoXml, /<tpAmb>1<\/tpAmb>/);
  assert.match(servicos.ultimoXml, /<xNome>Maria José<\/xNome>/);
  assert.match(servicos.ultimoXml, /<vNF>213\.27<\/vNF>/);
  assert.match(servicos.ultimoXml, /<cMun>3550308<\/cMun>/);
});

test('idempotencia: nota autorizada nao e emitida de novo nem reenviada por email', async () => {
  const { db, servicos } = cenario();
  await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  const emails = servicos.emails.length;
  const r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'autorizada');
  assert.equal(servicos.salvar, 1);
  assert.equal(servicos.emails.length, emails);
});

test('concorrencia: duas emissoes ao mesmo tempo geram uma nota so', async () => {
  const { db, servicos } = cenario({ servicos: { atrasoSalvar: 30 } });
  const [a, b] = await Promise.all([
    nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true }),
    nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true }),
  ]);
  assert.equal(servicos.salvar, 1);
  assert.deepEqual([a.status, b.status].sort(), ['autorizada', 'processando']);
});

test('rejeicao da SEFAZ: pendencia; depois de corrigir, nova emissao resolve', async () => {
  const { db, servicos } = cenario({ servicos: { situacaoNova: 15 } });
  let r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'rejeitada');
  assert.match(pedido(db).nfe_erro, /778 - Rejeição: NCM inexistente/);
  assert.equal(pendenciasAbertas(db).length, 1);
  assert.ok(servicos.n8n.some((a) => a.evento === 'nota_fiscal_falhou'));
  assert.equal(pedido(db).nfe_codigo, 500);
  // reemissao: a nota rejeitada (codigo 500) fica no NFe+; a nova tentativa cria outra
  servicos.situacaoNova = 50;
  r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'autorizada');
  assert.equal(pedido(db).nfe_codigo, 501);
  assert.equal(servicos.salvar, 2);
  assert.equal(pendenciasAbertas(db).length, 0);
  assert.ok(eventos(db).indexOf('nota_reemitida') >= 0);
});

test('SEFAZ demorando: fica processando e a consulta posterior nao reenvia', async () => {
  const { db, servicos } = cenario({ servicos: { situacaoNova: 40, msgSalvar: 'Lote em processamento' } });
  let r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'processando');
  assert.equal(pendenciasAbertas(db).length, 1);
  servicos.notas[500].situacao = 50;
  r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'autorizada');
  assert.equal(servicos.salvar, 1);
  assert.equal(pendenciasAbertas(db).length, 0);
});

test('queda de rede no envio: a nova tentativa acha a nota no NFe+ e nao duplica', async () => {
  const { db, servicos } = cenario({ servicos: { falharSalvar: 'rede' } });
  let r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'erro');
  assert.equal(pedido(db).nfe_status, 'erro');
  r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'autorizada');
  assert.equal(servicos.salvar, 1);
  assert.ok(eventos(db).indexOf('nota_recuperada') >= 0);
});

test('NFe+ recusa o XML (400): erro e pode reenviar depois', async () => {
  const { db, servicos } = cenario({ servicos: { falharSalvar: 'validacao' } });
  let r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'erro');
  assert.match(r.erro, /NFe\+ recusou a nota/);
  r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'autorizada');
  assert.equal(servicos.salvar, 2);
});

test('plano sem API (situacao atual da conta): mensagem explica o plano', async () => {
  const { db, servicos } = cenario({ servicos: { planoSemApi: true } });
  const r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'erro');
  assert.match(r.erro, /plano da conta NFe\+ não tem acesso à API/);
  assert.equal(pendenciasAbertas(db).length, 1);
  assert.equal(servicos.salvar, 0);
});

test('sem token: pendencia, nada enviado', async () => {
  const { db, servicos } = cenario();
  delete process.env.NFEMAIS_TOKEN;
  const r = await nf.etapaNotaFiscal(db, await fluxo.carregarContexto(db, 'ped-1'), { manual: true });
  assert.equal(r.status, 'erro');
  assert.match(r.erro, /NFEMAIS_TOKEN/);
  assert.equal(servicos.salvar, 0);
});

test('fluxo do webhook: nota autorizada vai anexada no email "Compra confirmada" (uma vez so)', async () => {
  const { db, servicos } = cenario({ config: { modo: 'automatico' } });
  const ctx = await fluxo.carregarContexto(db, 'ped-1');
  await nf.etapaNotaFiscal(db, ctx, { origem: 'webhook', enviarEmail: false, avisarEquipe: false });
  assert.equal(servicos.emails.length, 0);
  await fluxo.etapaEmailConfirmacao(db, ctx, {}, { origem: 'webhook' });
  const confirmacao = servicos.emails.find((e) => e.to[0] === 'maria@example.com');
  assert.match(confirmacao.subject, /Compra confirmada/);
  assert.equal(confirmacao.attachments.length, 3); // DANFE + XML + termos
  assert.match(confirmacao.html, /está disponível neste e-mail/);
  assert.ok(pedido(db).nfe_email_enviado_at);
  // aviso da equipe leva o link do DANFE
  await fluxo.etapaAvisoEquipe(db, ctx, {}, [], { origem: 'webhook' });
  const aviso = servicos.n8n.find((a) => a.evento === 'compra_aprovada');
  assert.equal(aviso.nfe_status, 'autorizada');
  assert.match(aviso.nfe_danfe_url, /storage\.test/);
  // nao manda a nota de novo num segundo email
  const antes = servicos.emails.length;
  await nf.etapaNotaFiscal(db, ctx, { origem: 'painel', manual: true });
  assert.equal(servicos.emails.length, antes);
});

test('fluxo do webhook sem nota pronta: email avisa que a nota vem depois', async () => {
  const { db, servicos } = cenario({ config: { modo: 'automatico' }, semNcm: true });
  const ctx = await fluxo.carregarContexto(db, 'ped-1');
  await nf.etapaNotaFiscal(db, ctx, { origem: 'webhook', enviarEmail: false, avisarEquipe: false });
  await fluxo.etapaEmailConfirmacao(db, ctx, {}, { origem: 'webhook' });
  const confirmacao = servicos.emails.find((e) => e.to[0] === 'maria@example.com');
  // sem nota ainda: so os termos e condicoes vao anexados
  assert.deepEqual(confirmacao.attachments.map((a) => /Termos/.test(a.filename)), [true]);
  assert.match(confirmacao.html, /Enviaremos sua nota fiscal/);
  await fluxo.etapaAvisoEquipe(db, ctx, {}, [], { origem: 'webhook' });
  assert.match(servicos.n8n.find((a) => a.evento === 'compra_aprovada').nfe_erro, /NCM/);
});

/* ---- funcoes puras ---- */

test('chave de acesso: digito confere com o exemplo do manual da SEFAZ', () => {
  const k = '52060433009911002506550120000007800267301615';
  assert.equal(nf.dvChave(k.slice(0, 43)), Number(k[43]));
});

test('CPF/CNPJ', () => {
  assert.equal(nf.cpfValido('529.982.247-25'), true);
  assert.equal(nf.cpfValido('529.982.247-24'), false);
  assert.equal(nf.cpfValido('111.111.111-11'), false);
  assert.equal(nf.cnpjValido('11.444.777/0001-61'), true);
  assert.equal(nf.cnpjValido('11.444.777/0001-62'), false);
});

test('rateio do frete fecha a soma exata', () => {
  const partes = nf.ratear(2347, [15980, 3000, 1]);
  assert.equal(partes.reduce((s, v) => s + v, 0), 2347);
});

test('XML: desconto quando o total cobrado e menor, e soma bate com vNF', () => {
  const itens = [{ quantidade: 1, preco_unitario: 100, nome_produto: 'X', produto: { ncm: '61091000' } }];
  const r = nf.montarXmlNFe({
    config: CONFIG, cliente: { nome: 'A', cpf: '52998224725' }, itens, codMunicipioDestino: '2913606',
    pedido: { numero: 1, frete: 10, total: 95, metodo_pagamento: 'master', endereco_entrega: { rua: 'R', numero: '1', bairro: 'B', cidade: 'Ilhéus', estado: 'BA', cep: '45650000' } },
  });
  assert.equal(r.totalCent, 9500);
  assert.match(r.xml, /<vDesc>15\.00<\/vDesc>/);
  assert.match(r.xml, /<idDest>1<\/idDest>/);
  assert.match(r.xml, /<CFOP>5102<\/CFOP>/);
  assert.match(r.xml, /<tPag>03<\/tPag><vPag>95\.00<\/vPag><card><tpIntegra>2<\/tpIntegra><\/card>/);
  assert.equal(r.chave.length, 44);
});

test('DIFAL: venda para SC calcula a partilha como a nota autorizada do contador (17% - 12% sobre R$ 50)', () => {
  const itens = [{ quantidade: 1, preco_unitario: 50, nome_produto: 'Toalha', produto: { ncm: '63026000' } }];
  const r = nf.montarXmlNFe({
    config: CONFIG, cliente: { nome: 'A', cpf: '52998224725' }, itens, codMunicipioDestino: '4216602',
    pedido: { numero: 1, frete: 0, total: 50, metodo_pagamento: 'pix', endereco_entrega: { rua: 'R', numero: '1', bairro: 'B', cidade: 'São José', estado: 'SC', cep: '88113250' } },
  });
  assert.match(r.xml, /<ICMSUFDest><vBCUFDest>50\.00<\/vBCUFDest><vBCFCPUFDest>50\.00<\/vBCFCPUFDest><pFCPUFDest>0\.00<\/pFCPUFDest><pICMSUFDest>17\.00<\/pICMSUFDest><pICMSInter>12\.00<\/pICMSInter><pICMSInterPart>100\.00<\/pICMSInterPart><vFCPUFDest>0\.00<\/vFCPUFDest><vICMSUFDest>2\.50<\/vICMSUFDest><vICMSUFRemet>0\.00<\/vICMSUFRemet><\/ICMSUFDest>/);
  assert.match(r.xml, /<vICMSDeson>0\.00<\/vICMSDeson><vFCPUFDest>0\.00<\/vFCPUFDest><vICMSUFDest>2\.50<\/vICMSUFDest>/);
  assert.match(r.xml, /<infRespTec><CNPJ>04693497000121<\/CNPJ>/);
  assert.match(r.xml, /<\/dest><autXML><CNPJ>13937073000156<\/CNPJ><\/autXML><det /);
  assert.match(r.xml, /<vNF>50\.00<\/vNF>/);
});

test('DIFAL: venda dentro da BA nao leva ICMSUFDest', () => {
  const itens = [{ quantidade: 1, preco_unitario: 50, nome_produto: 'Toalha', produto: { ncm: '63026000' } }];
  const r = nf.montarXmlNFe({
    config: CONFIG, cliente: { nome: 'A', cpf: '52998224725' }, itens, codMunicipioDestino: '2913606',
    pedido: { numero: 1, frete: 0, total: 50, metodo_pagamento: 'pix', endereco_entrega: { rua: 'R', numero: '1', bairro: 'B', cidade: 'Ilhéus', estado: 'BA', cep: '45650000' } },
  });
  assert.doesNotMatch(r.xml, /ICMSUFDest/);
});
