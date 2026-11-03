/**
 * ============================================================
 *  Nota fiscal (NF-e modelo 55) via NFe+ (NFeMais)
 * ============================================================
 *  Arquivo iniciado por "_" => NAO vira rota no Vercel.
 *
 *  A API do NFe+ nao monta a nota a partir de JSON: a gente monta o XML
 *  da NF-e 4.00 (sem assinatura) e manda em POST /v1/nfe/salvar com
 *  enviar=true — o NFe+ assina com o certificado da conta, renumera
 *  (usarNumeracaoDoSistema) e transmite para a SEFAZ.
 *  Docs: https://v4.nfemais.com.br/www/api/docs/
 *
 *  - montarXmlNFe        XML da nota a partir do pedido (funcao pura)
 *  - validarDadosFiscais o que falta (NCM, CPF, emitente...) antes de emitir
 *  - etapaNotaFiscal     emite/consulta, guarda XML+DANFE no Storage, manda
 *                        ao comprador, registra historico e pendencia
 *
 *  Nunca emite duas notas para o mesmo pedido: a emissao "trava" o pedido
 *  (nfe_status = processando) com update condicionado, e uma nota ja enviada
 *  ao NFe+ (nfe_codigo) e so consultada, nunca reenviada.
 *
 *  Variaveis de ambiente:
 *   - NFEMAIS_TOKEN  personal_token da conta NFe+ (secreta). Sem ela nada e
 *                    emitido. O plano da conta precisa ter acesso a API.
 *  Configuracao fiscal (emitente, CFOP, CSOSN...): tabela config_fiscal,
 *  editada no painel em Configuracoes > Nota fiscal.
 * ============================================================
 */

const { registrarEvento, abrirPendencia, resolverPendencia, faltaMigration } = require('./_pedido-registro');
const { emailNotaFiscal } = require('./_emails');

const NFEMAIS_URL = 'https://v4.nfemais.com.br/api';
const BUCKET = 'notas-fiscais';
const VERSAO_PROCESSO = 'sitiolabareda-1.0';
const NOME_HOMOLOGACAO = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
// Uma emissao "processando" sem retorno do NFe+ ha mais que isso e
// considerada interrompida (a funcao caiu no meio) e pode ser retomada.
const MINUTOS_EMISSAO_TRAVADA = 10;

const UF_CODIGO = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23',
  RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

/* ------------------------------------------------------------------ */
/*  Utilitarios                                                        */
/* ------------------------------------------------------------------ */

function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

function xmlEsc(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function txt(v, max) {
  var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return max ? s.slice(0, max) : s;
}

function tag(nome, valor) { return '<' + nome + '>' + valor + '</' + nome + '>'; }
function tagTxt(nome, valor, max) { return tag(nome, xmlEsc(txt(valor, max))); }
function tagOpc(nome, valor, max) { return valor == null || txt(valor) === '' ? '' : tagTxt(nome, valor, max); }

function centavos(v) { return Math.round((Number(v) || 0) * 100); }
function dec(c) { return (c / 100).toFixed(2); }          // centavos -> "12.34"
function num(v, casas) { return (Number(v) || 0).toFixed(casas); }

function cpfValido(cpf) {
  cpf = digitos(cpf);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  for (var t = 9; t < 11; t++) {
    var s = 0;
    for (var i = 0; i < t; i++) s += Number(cpf[i]) * (t + 1 - i);
    var d = ((s * 10) % 11) % 10;
    if (d !== Number(cpf[t])) return false;
  }
  return true;
}

function cnpjValido(cnpj) {
  cnpj = digitos(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  var calc = function (n) {
    var pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var s = 0;
    for (var i = 0; i < n; i++) s += Number(cnpj[i]) * pesos[i];
    var r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/* Digito verificador da chave de acesso (modulo 11, pesos 2..9). */
function dvChave(chave43) {
  var soma = 0, peso = 2;
  for (var i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  var dv = 11 - (soma % 11);
  return dv >= 10 ? 0 : dv;
}

/* Data no fuso da Bahia (UTC-3, sem horario de verao): 2026-11-03T14:30:00-03:00 */
function dataHoraBahia(d) {
  var local = new Date(d.getTime() - 3 * 3600 * 1000);
  return local.toISOString().slice(0, 19) + '-03:00';
}

/* Meio de pagamento da NF-e a partir do payment_method_id do Mercado Pago. */
function formaPagamento(metodo) {
  var m = String(metodo || '').toLowerCase();
  if (m === 'pix') return { tPag: '17' };
  if (/^bol|boleto|^pec$/.test(m)) return { tPag: '15' };
  if (m === 'account_money') return { tPag: '99', xPag: 'Saldo Mercado Pago' };
  if (/^deb/.test(m) || m === 'debit_card') return { tPag: '04', cartao: true };
  if (/visa|master|amex|elo|hipercard|diners|cabal|credit/.test(m)) return { tPag: '03', cartao: true };
  return { tPag: '99', xPag: 'Mercado Pago' };
}

/* Reparte um total (centavos) entre itens proporcionalmente ao peso de
   cada um; o ultimo leva o resto, pra soma bater exata. */
function ratear(totalCent, pesos) {
  var somaPesos = pesos.reduce(function (s, p) { return s + p; }, 0);
  var partes = [], acumulado = 0;
  pesos.forEach(function (p, i) {
    if (i === pesos.length - 1) { partes.push(totalCent - acumulado); return; }
    var v = somaPesos > 0 ? Math.floor(totalCent * p / somaPesos) : 0;
    partes.push(v);
    acumulado += v;
  });
  return partes;
}

/* ------------------------------------------------------------------ */
/*  Validacao                                                          */
/* ------------------------------------------------------------------ */

const CSOSN_SUPORTADOS = ['101', '102', '103', '300', '400', '500'];
const CST_ICMS_SUPORTADOS = ['00', '40', '41', '50'];

/* Lista do que falta para emitir. [] = pode emitir. */
function validarDadosFiscais(config, ctx) {
  var faltas = [];
  config = config || {};
  var pedido = ctx.pedido || {};
  var cliente = ctx.cliente || {};
  var end = pedido.endereco_entrega || {};

  if (!cnpjValido(config.cnpj)) faltas.push('CNPJ do emitente (Configurações > Nota fiscal)');
  if (!txt(config.razao_social)) faltas.push('razão social do emitente');
  if (!digitos(config.inscricao_estadual)) faltas.push('inscrição estadual do emitente');
  if (!txt(config.logradouro) || !txt(config.numero) || !txt(config.bairro) || !txt(config.cidade)) faltas.push('endereço do emitente');
  if (digitos(config.cod_municipio).length !== 7) faltas.push('código IBGE do município do emitente');
  if (!UF_CODIGO[String(config.uf || '').toUpperCase()]) faltas.push('UF do emitente');
  if (digitos(config.cep).length !== 8) faltas.push('CEP do emitente');
  var simples = Number(config.crt) !== 3;
  if (simples && CSOSN_SUPORTADOS.indexOf(String(config.csosn)) < 0) faltas.push('CSOSN ' + config.csosn + ' não suportado (use 101, 102, 103, 300, 400 ou 500)');
  if (!simples && CST_ICMS_SUPORTADOS.indexOf(String(config.cst_icms)) < 0) faltas.push('CST de ICMS ' + config.cst_icms + ' não suportado (use 00, 40, 41 ou 50)');
  if (!simples && String(config.uf || '').toUpperCase() !== String(end.estado || '').toUpperCase()) {
    faltas.push('venda para outro estado no regime normal precisa do DIFAL (grupo ICMSUFDest), que ainda não está implementado — emita esta nota pelo painel do NFe+');
  }

  var doc = digitos(cliente.cpf);
  if (!(doc.length === 11 ? cpfValido(doc) : cnpjValido(doc))) faltas.push('CPF/CNPJ válido do comprador');
  if (!txt(cliente.nome)) faltas.push('nome do comprador');
  if (!txt(end.rua) || !txt(end.numero) || !txt(end.bairro) || !txt(end.cidade)) faltas.push('endereço de entrega completo');
  if (!UF_CODIGO[String(end.estado || '').toUpperCase()]) faltas.push('UF do endereço de entrega');
  if (digitos(end.cep).length !== 8) faltas.push('CEP do endereço de entrega');

  if (!(ctx.itens || []).length) faltas.push('itens do pedido');
  (ctx.itens || []).forEach(function (it) {
    var prod = it.produto || {};
    if (digitos(prod.ncm).length !== 8) faltas.push('NCM do produto "' + (it.nome_produto || prod.nome_pt || '?') + '" (cadastro do produto)');
  });
  return faltas;
}

/* ------------------------------------------------------------------ */
/*  XML da NF-e 4.00                                                   */
/* ------------------------------------------------------------------ */

/* dados: { config, pedido, cliente, itens:[{...pedido_itens, produto:{ncm,
   origem_fiscal, unidade_fiscal, cest, gtin, sku}}], codMunicipioDestino,
   agora: Date, cNF: '12345678' }
   Retorna { xml, chave, totalCent }. Assume validarDadosFiscais() === []. */
function montarXmlNFe(dados) {
  var config = dados.config;
  var pedido = dados.pedido;
  var cliente = dados.cliente || {};
  var itens = dados.itens || [];
  var end = pedido.endereco_entrega || {};
  var agora = dados.agora || new Date();
  var ambiente = Number(config.ambiente) === 1 ? 1 : 2;
  var ufEmit = String(config.uf).toUpperCase();
  var ufDest = String(end.estado).toUpperCase();
  var dentroUf = ufEmit === ufDest;
  var cfop = digitos(dentroUf ? config.cfop_dentro_uf : config.cfop_fora_uf);
  var simples = Number(config.crt) !== 3;
  var serie = Number(config.serie) || 1;
  // Numero provisorio: o NFe+ renumera (usarNumeracaoDoSistema) e recalcula a chave.
  var nNF = Math.max(1, Number(pedido.numero) || 1) % 1000000000;
  var cNF = dados.cNF || String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  if (cNF === String(nNF).padStart(8, '0')) cNF = String((Number(cNF) + 1) % 1e8).padStart(8, '0');

  var cnpj = digitos(config.cnpj);
  var aamm = dataHoraBahia(agora).slice(2, 4) + dataHoraBahia(agora).slice(5, 7);
  var chave43 = UF_CODIGO[ufEmit] + aamm + cnpj + '55' + String(serie).padStart(3, '0')
    + String(nNF).padStart(9, '0') + '1' + cNF;
  var cDV = dvChave(chave43);
  var chave = chave43 + cDV;

  // Valores em centavos. Frete e desconto rateados pelo valor de cada item;
  // o desconto e o que faltar pra nota bater com o total cobrado.
  var vProdItens = itens.map(function (it) { return centavos(it.preco_unitario) * (Number(it.quantidade) || 1); });
  var vProd = vProdItens.reduce(function (s, v) { return s + v; }, 0);
  var vFrete = centavos(pedido.frete);
  var totalCobrado = pedido.total != null ? centavos(pedido.total) : vProd + vFrete;
  var vDesc = Math.max(0, vProd + vFrete - totalCobrado);
  var freteItens = ratear(vFrete, vProdItens);
  var descItens = ratear(vDesc, vProdItens);

  var tot = { vBC: 0, vICMS: 0, vPIS: 0, vCOFINS: 0 };

  var det = itens.map(function (it, i) {
    var prod = it.produto || {};
    var qtd = Number(it.quantidade) || 1;
    var gtin = digitos(prod.gtin);
    var ean = gtin.length === 8 || gtin.length === 12 || gtin.length === 13 || gtin.length === 14 ? gtin : 'SEM GTIN';
    var unidade = txt(prod.unidade_fiscal || 'UN', 6) || 'UN';
    var cProd = txt(prod.sku || it.produto_id || ('ITEM' + (i + 1)), 60);
    var xProd = txt((it.nome_produto || prod.nome_pt || 'Produto') + (it.tamanho ? ' - Tam. ' + it.tamanho : ''), 120);
    var orig = String(Number(prod.origem_fiscal) || 0);
    var base = vProdItens[i] - descItens[i];

    var prodXml = '<prod>'
      + tagTxt('cProd', cProd)
      + tag('cEAN', ean)
      + tagTxt('xProd', xProd)
      + tag('NCM', digitos(prod.ncm))
      + (digitos(prod.cest).length === 7 ? tag('CEST', digitos(prod.cest)) : '')
      + tag('CFOP', cfop)
      + tagTxt('uCom', unidade)
      + tag('qCom', num(qtd, 4))
      + tag('vUnCom', num(it.preco_unitario, 2))
      + tag('vProd', dec(vProdItens[i]))
      + tag('cEANTrib', ean)
      + tagTxt('uTrib', unidade)
      + tag('qTrib', num(qtd, 4))
      + tag('vUnTrib', num(it.preco_unitario, 2))
      + (freteItens[i] > 0 ? tag('vFrete', dec(freteItens[i])) : '')
      + (descItens[i] > 0 ? tag('vDesc', dec(descItens[i])) : '')
      + tag('indTot', '1')
      + '</prod>';

    // ICMS
    var icms;
    if (simples) {
      var csosn = String(config.csosn);
      if (csosn === '101') {
        var pCred = Number(config.aliquota_credito_sn) || 0;
        icms = '<ICMSSN101>' + tag('orig', orig) + tag('CSOSN', csosn)
          + tag('pCredSN', num(pCred, 4)) + tag('vCredICMSSN', dec(Math.round(base * pCred / 100))) + '</ICMSSN101>';
      } else if (csosn === '500') {
        icms = '<ICMSSN500>' + tag('orig', orig) + tag('CSOSN', csosn) + '</ICMSSN500>';
      } else {
        icms = '<ICMSSN102>' + tag('orig', orig) + tag('CSOSN', csosn) + '</ICMSSN102>';
      }
    } else {
      var cst = String(config.cst_icms);
      if (cst === '00') {
        var pICMS = Number(dentroUf ? config.aliquota_icms : config.aliquota_icms_fora_uf) || 0;
        var vICMS = Math.round(base * pICMS / 100);
        tot.vBC += base; tot.vICMS += vICMS;
        icms = '<ICMS00>' + tag('orig', orig) + tag('CST', cst) + tag('modBC', '3')
          + tag('vBC', dec(base)) + tag('pICMS', num(pICMS, 4)) + tag('vICMS', dec(vICMS)) + '</ICMS00>';
      } else {
        icms = '<ICMS40>' + tag('orig', orig) + tag('CST', cst) + '</ICMS40>';
      }
    }

    var pisCofins = function (grupo, cst, aliquota) {
      cst = String(cst || '49').padStart(2, '0');
      var p = Number(aliquota) || 0;
      var v = Math.round(base * p / 100);
      if (cst === '01' || cst === '02') {
        tot['v' + grupo] += v;
        return '<' + grupo + '><' + grupo + 'Aliq>' + tag('CST', cst) + tag('vBC', dec(base))
          + tag('p' + grupo, num(p, 4)) + tag('v' + grupo, dec(v)) + '</' + grupo + 'Aliq></' + grupo + '>';
      }
      if (['04', '05', '06', '07', '08', '09'].indexOf(cst) >= 0) {
        return '<' + grupo + '><' + grupo + 'NT>' + tag('CST', cst) + '</' + grupo + 'NT></' + grupo + '>';
      }
      tot['v' + grupo] += v;
      return '<' + grupo + '><' + grupo + 'Outr>' + tag('CST', cst) + tag('vBC', dec(p > 0 ? base : 0))
        + tag('p' + grupo, num(p, 4)) + tag('v' + grupo, dec(v)) + '</' + grupo + 'Outr></' + grupo + '>';
    };

    return '<det nItem="' + (i + 1) + '">' + prodXml
      + '<imposto>' + tag('ICMS', icms)
      + pisCofins('PIS', config.cst_pis, config.aliquota_pis)
      + pisCofins('COFINS', config.cst_cofins, config.aliquota_cofins)
      + '</imposto></det>';
  }).join('');

  var vNF = vProd - vDesc + vFrete;

  var ide = '<ide>'
    + tag('cUF', UF_CODIGO[ufEmit])
    + tag('cNF', cNF)
    + tagTxt('natOp', config.natureza_operacao || 'Venda de mercadoria', 60)
    + tag('mod', '55')
    + tag('serie', String(serie))
    + tag('nNF', String(nNF))
    + tag('dhEmi', dataHoraBahia(agora))
    + tag('tpNF', '1')
    + tag('idDest', dentroUf ? '1' : '2')
    + tag('cMunFG', digitos(config.cod_municipio))
    + tag('tpImp', '1')
    + tag('tpEmis', '1')
    + tag('cDV', String(cDV))
    + tag('tpAmb', String(ambiente))
    + tag('finNFe', '1')
    + tag('indFinal', '1')
    + tag('indPres', '2')        // operacao pela internet
    + tag('indIntermed', '0')    // site proprio, sem marketplace
    + tag('procEmi', '0')
    + tag('verProc', VERSAO_PROCESSO)
    + '</ide>';

  var emit = '<emit>'
    + tag('CNPJ', cnpj)
    + tagTxt('xNome', config.razao_social, 60)
    + tagOpc('xFant', config.nome_fantasia, 60)
    + '<enderEmit>'
    + tagTxt('xLgr', config.logradouro, 60)
    + tagTxt('nro', config.numero, 60)
    + tagOpc('xCpl', config.complemento, 60)
    + tagTxt('xBairro', config.bairro, 60)
    + tag('cMun', digitos(config.cod_municipio))
    + tagTxt('xMun', config.cidade, 60)
    + tag('UF', ufEmit)
    + tag('CEP', digitos(config.cep))
    + tag('cPais', '1058') + tag('xPais', 'Brasil')
    + (digitos(config.telefone).length >= 6 ? tag('fone', digitos(config.telefone).slice(0, 14)) : '')
    + '</enderEmit>'
    + tag('IE', digitos(config.inscricao_estadual))
    + (digitos(config.inscricao_municipal) ? tag('IM', digitos(config.inscricao_municipal)) : '')
    + tag('CRT', String(Number(config.crt) || 1))
    + '</emit>';

  var docDest = digitos(cliente.cpf);
  var codMunDest = digitos(dados.codMunicipioDestino);
  var dest = '<dest>'
    + (docDest.length === 14 ? tag('CNPJ', docDest) : tag('CPF', docDest))
    + tagTxt('xNome', ambiente === 2 ? NOME_HOMOLOGACAO : cliente.nome, 60)
    + '<enderDest>'
    + tagTxt('xLgr', end.rua, 60)
    + tagTxt('nro', end.numero, 60)
    + tagOpc('xCpl', end.complemento, 60)
    + tagTxt('xBairro', end.bairro, 60)
    + tag('cMun', codMunDest)
    + tagTxt('xMun', end.cidade, 60)
    + tag('UF', ufDest)
    + tag('CEP', digitos(end.cep))
    + tag('cPais', '1058') + tag('xPais', 'Brasil')
    + (digitos(cliente.telefone).length >= 6 ? tag('fone', digitos(cliente.telefone).slice(0, 14)) : '')
    + '</enderDest>'
    + tag('indIEDest', '9')
    + (cliente.email ? tagTxt('email', cliente.email, 60) : '')
    + '</dest>';

  var total = '<total><ICMSTot>'
    + tag('vBC', dec(tot.vBC)) + tag('vICMS', dec(tot.vICMS)) + tag('vICMSDeson', '0.00')
    + tag('vFCP', '0.00') + tag('vBCST', '0.00') + tag('vST', '0.00') + tag('vFCPST', '0.00')
    + tag('vFCPSTRet', '0.00') + tag('vProd', dec(vProd)) + tag('vFrete', dec(vFrete))
    + tag('vSeg', '0.00') + tag('vDesc', dec(vDesc)) + tag('vII', '0.00') + tag('vIPI', '0.00')
    + tag('vIPIDevol', '0.00') + tag('vPIS', dec(tot.vPIS)) + tag('vCOFINS', dec(tot.vCOFINS))
    + tag('vOutro', '0.00') + tag('vNF', dec(vNF))
    + '</ICMSTot></total>';

  // Frete contratado pelo emitente (SuperFrete), cobrado do comprador na nota.
  var transp = '<transp>' + tag('modFrete', '0') + '</transp>';

  var fp = formaPagamento(pedido.metodo_pagamento);
  var pag = '<pag><detPag>' + tag('indPag', '0') + tag('tPag', fp.tPag)
    + (fp.xPag ? tagTxt('xPag', fp.xPag, 60) : '')
    + tag('vPag', dec(vNF))
    + (fp.cartao ? '<card>' + tag('tpIntegra', '2') + '</card>' : '')
    + '</detPag></pag>';

  var obs = ['Pedido #' + pedido.numero + ' - loja sitiolabareda.com'];
  if (simples) obs.push('Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.');
  if (simples && String(config.csosn) === '101') {
    var credito = Math.round((vProd - vDesc) * (Number(config.aliquota_credito_sn) || 0) / 100);
    obs.push('Permite o aproveitamento do crédito de ICMS no valor de R$ ' + dec(credito).replace('.', ',')
      + ', correspondente à alíquota de ' + num(config.aliquota_credito_sn, 2).replace('.', ',') + '%, nos termos do art. 23 da LC 123/2006.');
  }
  if (txt(config.informacoes_complementares)) obs.push(txt(config.informacoes_complementares));
  var infAdic = '<infAdic>' + tagTxt('infCpl', obs.join(' '), 5000) + '</infAdic>';

  var xml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'
    + '<infNFe versao="4.00" Id="NFe' + chave + '">'
    + ide + emit + dest + det + total + transp + pag + infAdic
    + '</infNFe></NFe>';

  return { xml: xml, chave: chave, totalCent: vNF };
}

/* ------------------------------------------------------------------ */
/*  Cliente da API NFe+                                                */
/* ------------------------------------------------------------------ */

var tokenCache = { access: null, expira: 0 };

function tokenNfemais() {
  return (process.env.NFEMAIS_TOKEN || process.env.token_nfemais || '').trim();
}

function erroNfemais(status, corpo) {
  var j = null;
  try { j = JSON.parse(corpo); } catch (e) { /* corpo nao-JSON */ }
  var msg = j ? [j.errMsg || j.msg, j.errObs || j.obs].filter(Boolean).join(' — ') : String(corpo || '').slice(0, 300);
  if (status === 403 && /plano/i.test(msg)) {
    msg = 'O plano da conta NFe+ não tem acesso à API — contrate o plano Básico ou Ilimitado. (' + msg + ')';
  }
  var e = new Error('NFe+ ' + status + ': ' + (msg || 'sem detalhe'));
  e.status = status;
  e.corpo = j;
  return e;
}

async function accessToken(forcar) {
  if (!forcar && tokenCache.access && Date.now() < tokenCache.expira) return tokenCache.access;
  var personal = tokenNfemais();
  if (!personal) throw new Error('NFEMAIS_TOKEN não configurado no servidor — a nota não pode ser emitida.');
  var r = await fetch(NFEMAIS_URL + '/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'personal', personal_token: personal }),
  });
  var corpo = await r.text();
  if (!r.ok) throw erroNfemais(r.status, corpo);
  var j = JSON.parse(corpo);
  if (!j.access_token) throw erroNfemais(r.status, corpo);
  // validade de 15 min; renova com 1 min de folga
  tokenCache = { access: j.access_token, expira: Date.now() + Math.max(60, (Number(j.expires_in) || 900) - 60) * 1000 };
  return tokenCache.access;
}

/* Chamada autenticada. resposta: 'json' | 'texto' | 'binario' */
async function chamar(metodo, caminho, corpo, resposta) {
  for (var tentativa = 0; tentativa < 2; tentativa++) {
    var at = await accessToken(tentativa > 0);
    var r = await fetch(NFEMAIS_URL + caminho, {
      method: metodo,
      headers: Object.assign({ Authorization: 'Bearer ' + at }, corpo ? { 'Content-Type': 'application/json' } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (r.status === 401 && tentativa === 0) continue; // token expirou: renova uma vez
    if (!r.ok) throw erroNfemais(r.status, await r.text());
    if (resposta === 'binario') return Buffer.from(await r.arrayBuffer());
    if (resposta === 'texto') return r.text();
    return r.json();
  }
}

const nfemais = {
  salvar: function (xml) {
    return chamar('POST', '/v1/nfe/salvar', { xml: xml, enviar: true, usarNumeracaoDoSistema: true });
  },
  detalhe: function (codigo) { return chamar('GET', '/v1/nfe/' + codigo); },
  xml: function (codigo) { return chamar('GET', '/v1/nfe/' + codigo + '/xml', null, 'texto'); },
  danfe: function (codigo) { return chamar('GET', '/v1/nfe/' + codigo + '/danfe', null, 'binario'); },
  status: function () { return chamar('POST', '/v1/nfe/status'); },
  listar: function (dtIni, dtFim) {
    return chamar('GET', '/v1/nfe?dtIni=' + dtIni + '&dtFim=' + dtFim
      + '&fields=' + encodeURIComponent('codigo,numero,chave,situacao,valor,cliente,dtEmissao,ambiente'));
  },
};

/* situacao do NFe+ -> nfe_status do pedido */
function statusDaSituacao(s) {
  s = Number(s);
  if (s === 50) return 'autorizada';
  if (s === 90 || s === 91) return 'cancelada';
  if (s === 20 || s === 30 || s === 40) return 'processando';
  return 'rejeitada'; // 5/10 (nao transmitida), 15 (rejeitada), 80 (denegada)
}

/* ------------------------------------------------------------------ */
/*  Banco                                                              */
/* ------------------------------------------------------------------ */

async function carregarConfigFiscal(db) {
  var { data, error } = await db.from('config_fiscal').select('*').eq('id', 1).maybeSingle();
  if (error) {
    if (faltaMigration(error)) return null;
    throw error;
  }
  return data || null;
}

/* Dados fiscais de cada produto do pedido (itens ganham .produto). */
async function anexarProdutos(db, itens) {
  var ids = [...new Set((itens || []).map(function (i) { return i.produto_id; }).filter(Boolean))];
  if (!ids.length) return itens || [];
  var { data } = await db.from('produtos')
    .select('id, nome_pt, sku, ncm, origem_fiscal, unidade_fiscal, cest, gtin').in('id', ids);
  return (itens || []).map(function (it) {
    return Object.assign({}, it, { produto: (data || []).find(function (p) { return p.id === it.produto_id; }) || {} });
  });
}

async function atualizarPedido(db, ctx, patch) {
  patch = Object.assign({ nfe_atualizada_at: new Date().toISOString() }, patch);
  var { error } = await db.from('pedidos').update(patch).eq('id', ctx.pedido.id);
  if (error) throw error;
  Object.assign(ctx.pedido, patch);
}

/* Codigo IBGE do municipio pelo CEP (ViaCEP). */
async function codigoMunicipio(cep) {
  var r = await fetch('https://viacep.com.br/ws/' + digitos(cep) + '/json/');
  if (!r.ok) throw new Error('ViaCEP respondeu ' + r.status);
  var j = await r.json();
  if (j.erro || digitos(j.ibge).length !== 7) throw new Error('CEP ' + cep + ' sem código IBGE no ViaCEP');
  return digitos(j.ibge);
}

/* Baixa XML + DANFE do NFe+ e guarda no Storage. */
async function guardarArquivos(db, ctx) {
  var p = ctx.pedido;
  var pasta = 'pedido-' + p.numero + '/';
  var nome = p.nfe_chave || ('nfe-' + p.nfe_codigo);
  var xml = await nfemais.xml(p.nfe_codigo);
  var pdf = await nfemais.danfe(p.nfe_codigo);
  var up1 = await db.storage.from(BUCKET).upload(pasta + nome + '.xml', Buffer.from(xml, 'utf8'), { contentType: 'application/xml', upsert: true });
  if (up1.error) throw new Error('Storage (XML): ' + up1.error.message);
  var up2 = await db.storage.from(BUCKET).upload(pasta + nome + '.pdf', pdf, { contentType: 'application/pdf', upsert: true });
  if (up2.error) throw new Error('Storage (DANFE): ' + up2.error.message);
  await atualizarPedido(db, ctx, { nfe_xml_path: pasta + nome + '.xml', nfe_danfe_path: pasta + nome + '.pdf' });
  return { xml: xml, pdf: pdf };
}

/* Anexos (DANFE + XML) para email. Usa o Storage; se faltar, baixa do NFe+. */
async function anexosDaNota(db, pedido) {
  if (!pedido || pedido.nfe_status !== 'autorizada') return null;
  var nomeBase = 'NF-e ' + (pedido.nfe_numero || '') + ' - Pedido ' + pedido.numero;
  if (pedido.nfe_xml_path && pedido.nfe_danfe_path) {
    var a = await db.storage.from(BUCKET).download(pedido.nfe_danfe_path);
    var b = await db.storage.from(BUCKET).download(pedido.nfe_xml_path);
    if (!a.error && !b.error) {
      return {
        numero: pedido.nfe_numero, chave: pedido.nfe_chave,
        anexos: [
          { filename: nomeBase + '.pdf', content: Buffer.from(await a.data.arrayBuffer()).toString('base64') },
          { filename: nomeBase + '.xml', content: Buffer.from(await b.data.arrayBuffer()).toString('base64') },
        ],
      };
    }
  }
  if (!pedido.nfe_codigo) return null;
  var pdf = await nfemais.danfe(pedido.nfe_codigo);
  var xml = await nfemais.xml(pedido.nfe_codigo);
  return {
    numero: pedido.nfe_numero, chave: pedido.nfe_chave,
    anexos: [
      { filename: nomeBase + '.pdf', content: pdf.toString('base64') },
      { filename: nomeBase + '.xml', content: Buffer.from(xml, 'utf8').toString('base64') },
    ],
  };
}

/* Links temporarios do DANFE e do XML (painel / aviso da equipe). */
async function linksDaNota(db, pedido, segundos) {
  var out = { danfe_url: null, xml_url: null };
  if (!pedido) return out;
  if (pedido.nfe_danfe_path) {
    var a = await db.storage.from(BUCKET).createSignedUrl(pedido.nfe_danfe_path, segundos || 3600);
    if (!a.error) out.danfe_url = a.data.signedUrl;
  }
  if (pedido.nfe_xml_path) {
    var b = await db.storage.from(BUCKET).createSignedUrl(pedido.nfe_xml_path, segundos || 3600);
    if (!b.error) out.xml_url = b.data.signedUrl;
  }
  return out;
}

/* Depois de uma falha de comunicacao, a nota pode ter sido criada no NFe+
   mesmo sem resposta. Procura uma nota recente com o mesmo valor (e o mesmo
   destinatario, em producao) antes de enviar outra. */
async function procurarNotaExistente(ctx, config, desde) {
  var hoje = dataHoraBahia(new Date()).slice(0, 10);
  var ini = dataHoraBahia(desde ? new Date(new Date(desde).getTime() - 24 * 3600 * 1000) : new Date(Date.now() - 2 * 24 * 3600 * 1000)).slice(0, 10);
  var lista = await nfemais.listar(ini, hoje);
  var total = centavos(ctx.pedido.total);
  var nome = txt(Number(config.ambiente) === 2 ? NOME_HOMOLOGACAO : (ctx.cliente || {}).nome).toLowerCase();
  return ((lista && lista.data) || []).find(function (n) {
    return [20, 30, 40, 50].indexOf(Number(n.situacao)) >= 0
      && centavos(n.valor) === total
      && txt(n.cliente).toLowerCase() === nome;
  }) || null;
}

/* ------------------------------------------------------------------ */
/*  Avisos                                                             */
/* ------------------------------------------------------------------ */

/* Complemento do aviso de venda (n8n -> Telegram/WhatsApp). Melhor esforco:
   so registra no historico se falhar. */
async function avisarEquipeNota(db, ctx, evento, extra, origem) {
  var url = process.env.N8N_WEBHOOK_URL;
  if (!url) return false;
  var p = ctx.pedido;
  try {
    var links = evento === 'nota_fiscal_autorizada' ? await linksDaNota(db, p, 7 * 24 * 3600) : {};
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        evento: evento,
        pedido_numero: p.numero,
        pedido_id: p.id,
        cliente_nome: (ctx.cliente || {}).nome || '',
        valor_total: p.total,
        nfe_numero: p.nfe_numero || null,
        nfe_chave: p.nfe_chave || null,
        nfe_danfe_url: links.danfe_url || null,
        nfe_xml_url: links.xml_url || null,
        nfe_erro: p.nfe_erro || null,
      }, extra || {})),
    });
    if (!res.ok) throw new Error('n8n respondeu ' + res.status);
    return true;
  } catch (e) {
    await registrarEvento(db, p.id, 'aviso_nota_falhou', 'Aviso da nota fiscal para a equipe não enviado: ' + e.message, null, origem);
    return false;
  }
}

/* Envia a nota ao comprador num email proprio (quando ela fica pronta
   depois da confirmacao da compra). Nunca envia duas vezes. */
async function enviarNotaAoComprador(db, ctx, origem) {
  var p = ctx.pedido;
  if (p.nfe_status !== 'autorizada' || p.nfe_email_enviado_at) return false;
  var cliente = ctx.cliente || {};
  if (!cliente.email) {
    await registrarEvento(db, p.id, 'email_nota_falhou', 'Comprador sem email — nota fiscal não enviada', null, origem);
    return false;
  }
  var nota = await anexosDaNota(db, p);
  var ok = nota ? await emailNotaFiscal(cliente, p, nota) : false;
  if (ok) {
    await atualizarPedido(db, ctx, { nfe_email_enviado_at: new Date().toISOString() });
    await registrarEvento(db, p.id, 'email_nota_enviado', 'Nota fiscal ' + (p.nfe_numero || '') + ' enviada por email para ' + cliente.email, null, origem);
  } else {
    await registrarEvento(db, p.id, 'email_nota_falhou', 'Email com a nota fiscal não foi enviado para ' + cliente.email, null, origem);
  }
  return ok;
}

/* ------------------------------------------------------------------ */
/*  Etapa do fluxo do pedido                                           */
/* ------------------------------------------------------------------ */

/* Resultado da nota consultada no NFe+ -> pedido, arquivos, avisos. */
async function aplicarSituacao(db, ctx, detalhe, msgRetorno, opcoes) {
  var origem = opcoes.origem;
  var p = ctx.pedido;
  var status = statusDaSituacao(detalhe.situacao);
  var patch = { nfe_status: status, nfe_numero: detalhe.numero || p.nfe_numero || null, nfe_chave: detalhe.chave || p.nfe_chave || null };

  if (status === 'autorizada') {
    patch.nfe_erro = null;
    if (!p.nfe_autorizada_at) patch.nfe_autorizada_at = new Date().toISOString();
    await atualizarPedido(db, ctx, patch);
    var erroArquivos = null;
    if (!p.nfe_xml_path || !p.nfe_danfe_path) {
      try { await guardarArquivos(db, ctx); } catch (e) { erroArquivos = e.message; }
    }
    await registrarEvento(db, p.id, 'nota_autorizada', 'NF-e ' + (p.nfe_numero || '?') + ' autorizada pela SEFAZ'
      + (Number(p.nfe_ambiente) === 2 ? ' (homologação, sem valor fiscal)' : ''), { chave: p.nfe_chave, codigo: p.nfe_codigo }, origem);
    if (erroArquivos) {
      await registrarEvento(db, p.id, 'nota_arquivos_falhou', 'Nota autorizada, mas o XML/DANFE não foi guardado: ' + erroArquivos, null, origem);
    }
    await resolverPendencia(db, p.id, 'nota_fiscal', opcoes.por || 'sistema');
    if (opcoes.enviarEmail !== false) await enviarNotaAoComprador(db, ctx, origem);
    if (opcoes.avisarEquipe !== false) await avisarEquipeNota(db, ctx, 'nota_fiscal_autorizada', null, origem);
    return { status: status };
  }

  if (status === 'processando') {
    await atualizarPedido(db, ctx, patch);
    await registrarEvento(db, p.id, 'nota_processando', 'NF-e enviada à SEFAZ, aguardando autorização' + (msgRetorno ? ' (' + msgRetorno + ')' : ''), null, origem);
    await abrirPendencia(db, p.id, 'nota_fiscal', 'Nota enviada à SEFAZ e ainda sem autorização — clique em "Tentar novamente" para consultar.');
    return { status: status };
  }

  if (status === 'cancelada') {
    await atualizarPedido(db, ctx, patch);
    await registrarEvento(db, p.id, 'nota_cancelada', 'NF-e ' + (p.nfe_numero || '?') + ' consta como cancelada/inutilizada no NFe+', null, origem);
    return { status: status };
  }

  var erro = 'Nota rejeitada' + (msgRetorno ? ': ' + msgRetorno : ' (situação ' + detalhe.situacao + ' no NFe+)');
  patch.nfe_erro = erro.slice(0, 2000);
  await atualizarPedido(db, ctx, patch);
  await registrarEvento(db, p.id, 'nota_rejeitada', erro, { codigo: p.nfe_codigo, situacao: detalhe.situacao }, origem);
  await abrirPendencia(db, p.id, 'nota_fiscal', erro + ' — corrija o cadastro e tente novamente.');
  if (opcoes.avisarEquipe !== false) await avisarEquipeNota(db, ctx, 'nota_fiscal_falhou', null, origem);
  return { status: status, erro: erro };
}

async function falhar(db, ctx, erro, opcoes, liberar) {
  var p = ctx.pedido;
  if (liberar) await atualizarPedido(db, ctx, { nfe_status: 'erro', nfe_erro: String(erro).slice(0, 2000) });
  await registrarEvento(db, p.id, 'nota_falhou', erro, null, opcoes.origem);
  await abrirPendencia(db, p.id, 'nota_fiscal', erro);
  if (opcoes.avisarEquipe !== false) await avisarEquipeNota(db, ctx, 'nota_fiscal_falhou', null, opcoes.origem);
  return { status: 'erro', erro: erro };
}

/* Emite (ou consulta) a NF-e do pedido.
   opcoes: { origem, por, manual (botao do painel), enviarEmail, avisarEquipe }
   Retorna { status, erro?, pulado? }. Nunca lanca. */
async function etapaNotaFiscal(db, ctx, opcoes) {
  opcoes = Object.assign({ origem: 'webhook' }, opcoes || {});
  var p = ctx.pedido;
  try {
    var config = await carregarConfigFiscal(db);
    if (!config) return { pulado: true, erro: 'Banco sem a atualização da nota fiscal (rode atualizacoes/migration-etapa2-nota-fiscal.sql).' };
    if (config.modo === 'desligado' || (config.modo === 'manual' && !opcoes.manual)) {
      return { pulado: true, erro: 'Emissão de nota fiscal desligada em Configurações > Nota fiscal.' };
    }
    if (!tokenNfemais()) return await falhar(db, ctx, 'NFEMAIS_TOKEN não configurado no servidor — a nota não pode ser emitida.', opcoes, false);

    // Ja autorizada: so completa o que faltar (arquivos, email).
    if (p.nfe_status === 'autorizada') {
      if ((!p.nfe_xml_path || !p.nfe_danfe_path) && p.nfe_codigo) {
        try { await guardarArquivos(db, ctx); } catch (e) { console.error('[nota-fiscal] arquivos:', e.message); }
      }
      await resolverPendencia(db, p.id, 'nota_fiscal', opcoes.por || 'sistema');
      if (opcoes.enviarEmail !== false) await enviarNotaAoComprador(db, ctx, opcoes.origem);
      return { status: 'autorizada' };
    }
    if (p.nfe_status === 'cancelada') return { status: 'cancelada', erro: 'A nota deste pedido foi cancelada no NFe+.' };

    // Ja enviada ao NFe+: consulta, nunca reenvia.
    if (p.nfe_status === 'processando' && p.nfe_codigo) {
      var det = await nfemais.detalhe(p.nfe_codigo);
      return await aplicarSituacao(db, ctx, det, null, opcoes);
    }

    var itens = await anexarProdutos(db, ctx.itens);
    var faltas = validarDadosFiscais(config, { pedido: p, cliente: ctx.cliente, itens: itens });
    if (faltas.length) {
      return await falhar(db, ctx, 'Faltam dados para emitir a nota: ' + faltas.join('; ') + '.', opcoes, p.nfe_status !== 'processando');
    }

    // Trava o pedido pra emissao (uma unica emissao, mesmo com duas chamadas ao
    // mesmo tempo). Rejeitada/erro pode emitir de novo: a nota rejeitada fica
    // no NFe+ so como registro e o pedido passa a apontar para a nova.
    // "processando" so e retomado se travou sem chegar ao NFe+ (sem codigo).
    var antes = p.nfe_status;
    var codigoAnterior = p.nfe_codigo;
    var limite = new Date(Date.now() - MINUTOS_EMISSAO_TRAVADA * 60 * 1000).toISOString();
    var trava = { nfe_status: 'processando', nfe_erro: null, nfe_codigo: null, nfe_numero: null, nfe_chave: null,
      nfe_atualizada_at: new Date().toISOString(), nfe_ambiente: Number(config.ambiente) };
    var { data: travou, error: errTrava } = await db.from('pedidos')
      .update(trava)
      .eq('id', p.id)
      .or('nfe_status.is.null,nfe_status.in.(rejeitada,erro),and(nfe_status.eq.processando,nfe_codigo.is.null,nfe_atualizada_at.lt.' + limite + ')')
      .select('id');
    if (errTrava) throw errTrava;
    if (!travou || !travou.length) {
      return { status: 'processando', erro: 'A nota deste pedido já está sendo emitida — aguarde alguns minutos e consulte de novo.' };
    }
    Object.assign(p, trava);
    if (codigoAnterior && antes === 'rejeitada') {
      await registrarEvento(db, p.id, 'nota_reemitida', 'Nova emissão depois da rejeição (nota anterior no NFe+: código ' + codigoAnterior + ')', null, opcoes.origem);
    }

    // Tentativa anterior caiu sem resposta: confere se a nota ja existe no NFe+.
    if (antes === 'erro' || antes === 'processando') {
      var existente = null;
      try { existente = await procurarNotaExistente(ctx, config, p.nfe_atualizada_at); } catch (e) { /* segue e emite */ }
      if (existente) {
        await atualizarPedido(db, ctx, { nfe_codigo: existente.codigo });
        await registrarEvento(db, p.id, 'nota_recuperada', 'Nota encontrada no NFe+ (código ' + existente.codigo + ') de uma tentativa anterior — não foi emitida de novo.', null, opcoes.origem);
        return await aplicarSituacao(db, ctx, existente, null, opcoes);
      }
    }

    var codMun = await codigoMunicipio((p.endereco_entrega || {}).cep);
    var montada = montarXmlNFe({ config: config, pedido: p, cliente: ctx.cliente, itens: itens, codMunicipioDestino: codMun });
    if (montada.totalCent !== centavos(p.total)) {
      return await falhar(db, ctx, 'O total da nota (' + dec(montada.totalCent) + ') não bate com o total do pedido (' + p.total + ').', opcoes, true);
    }

    await registrarEvento(db, p.id, 'nota_enviada', 'Nota enviada ao NFe+ para assinatura e transmissão'
      + (Number(config.ambiente) === 2 ? ' (homologação)' : ''), null, opcoes.origem);

    var ret;
    try {
      ret = await nfemais.salvar(montada.xml);
    } catch (e) {
      // Com status HTTP: o NFe+ recusou (400/403/422) e a nota nao foi criada.
      // Sem status (rede/timeout): pode ter sido criada — a proxima tentativa
      // procura a nota no NFe+ antes de reenviar (status 'erro').
      return await falhar(db, ctx, e.status
        ? 'NFe+ recusou a nota: ' + e.message
        : 'Sem resposta do NFe+ (' + e.message + '). A próxima tentativa confere se a nota foi criada antes de reenviar.', opcoes, true);
    }
    if (!ret || !ret.codigo) return await falhar(db, ctx, 'NFe+ não devolveu o código da nota: ' + JSON.stringify(ret).slice(0, 300), opcoes, true);

    await atualizarPedido(db, ctx, { nfe_codigo: ret.codigo, nfe_serie: Number(config.serie) || 1 });
    var detalhe = await nfemais.detalhe(ret.codigo);
    return await aplicarSituacao(db, ctx, detalhe, ret.msg || null, opcoes);
  } catch (e) {
    console.error('[nota-fiscal] erro:', e);
    var codigoSalvo = !!ctx.pedido.nfe_codigo;
    // Com nfe_codigo a nota existe no NFe+: fica "processando" pra ser consultada.
    try {
      return await falhar(db, ctx, 'Falha na emissão da nota: ' + e.message, opcoes, !codigoSalvo && ctx.pedido.nfe_status === 'processando');
    } catch (e2) {
      return { status: 'erro', erro: e.message };
    }
  }
}

module.exports = {
  etapaNotaFiscal,
  montarXmlNFe,
  validarDadosFiscais,
  carregarConfigFiscal,
  anexosDaNota,
  linksDaNota,
  nfemais,
  cpfValido,
  cnpjValido,
  dvChave,
  formaPagamento,
  ratear,
  statusDaSituacao,
};
