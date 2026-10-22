/**
 * ============================================================
 *  criar-pagamento  (Vercel Serverless Function)
 * ============================================================
 *  Cria o pedido INTEIRO no servidor (com a chave secreta) e gera o
 *  link de pagamento do Mercado Pago. A loja NAO grava mais nada
 *  direto no banco — tudo passa por aqui, com validacao.
 *
 *  Recebe: { cliente:{nome,email,telefone,cpf,endereco}, itens:[{produto_id,quantidade}], frete:{regiao,valor} }
 *  1. Upsert do cliente (por email).
 *  2. Le os produtos no banco e usa o PRECO DO BANCO (anti-fraude).
 *  3. Frete: recota no SuperFrete o servico escolhido (preco do servidor);
 *     sem servico SuperFrete, valida contra a tabela de frete.
 *  4. Cria pedido "pendente" + itens.
 *  5. Cria a preferencia no Mercado Pago (Checkout Pro) e devolve o link.
 *
 *  Variaveis de ambiente:
 *   - MP_ENV ('teste'|'producao'), MP_ACCESS_TOKEN_TESTE, MP_ACCESS_TOKEN_PROD
 *   - ECOMMERCE_SUPABASE_URL, ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY
 *   - SITE_URL
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { toVercel } = require('./_netlify-adapter');
const { emailPedidoCriado } = require('./_emails');
const { cotarFrete, montarPacote } = require('./cotacao-frete');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function resposta(status, corpo) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

function resolverAccessToken(env) {
  const ambiente = (env.MP_ENV || 'teste').toLowerCase();
  const prod = ambiente === 'producao' || ambiente === 'production' || ambiente === 'prod';
  return (prod ? env.MP_ACCESS_TOKEN_PROD : env.MP_ACCESS_TOKEN_TESTE) || env.MP_ACCESS_TOKEN || '';
}

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resposta(200, { ok: true });
  if (event.httpMethod !== 'POST') return resposta(405, { erro: 'Metodo nao permitido' });

  const SUPABASE_URL = process.env.ECOMMERCE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
  const MP_ACCESS_TOKEN = resolverAccessToken(process.env);
  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return resposta(500, { erro: 'Configuracao do servidor incompleta.' });
  }

  // URL do site (forca https; MP exige https nas back_urls)
  let siteUrl = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (!siteUrl) siteUrl = 'https://sitiolabareda.com';
  siteUrl = siteUrl.replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(siteUrl)) siteUrl = 'https://' + siteUrl.replace(/^\/+/, '');

  let dados;
  try {
    dados = JSON.parse(event.body || '{}');
  } catch (e) {
    return resposta(400, { erro: 'Corpo invalido (JSON).' });
  }

  const cliente = dados.cliente || {};
  const itens = Array.isArray(dados.itens) ? dados.itens : [];
  const freteReq = dados.frete || {};
  if (!cliente.email) return resposta(400, { erro: 'E-mail do cliente ausente.' });
  if (itens.length === 0) return resposta(400, { erro: 'Carrinho vazio.' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    // --- 1. Upsert do cliente (por email) ---
    const end = cliente.endereco || {};
    const { data: cli, error: errCli } = await supabase
      .from('clientes')
      .upsert(
        {
          nome: cliente.nome || '',
          email: cliente.email,
          telefone: cliente.telefone || null,
          cpf: cliente.cpf || null,
          endereco_rua: end.rua || null,
          endereco_numero: end.numero || null,
          endereco_complemento: end.complemento || null,
          endereco_bairro: end.bairro || null,
          endereco_cidade: end.cidade || null,
          endereco_estado: end.estado || null,
          endereco_cep: end.cep || null,
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single();
    if (errCli) throw errCli;
    const clienteId = cli.id;

    // --- 2. Produtos: usa preco do banco ---
    const ids = itens.map((i) => i.produto_id).filter(Boolean);
    if (ids.length === 0) return resposta(400, { erro: 'Itens sem produto_id.' });
    const { data: produtos, error: errProd } = await supabase
      .from('produtos')
      .select('id, nome_pt, preco, preco_promocional, estoque, variantes_estoque, ativo, peso_gramas, frete_altura, frete_largura, frete_comprimento')
      .in('id', ids);
    if (errProd) throw errProd;

    const itensPedido = [];
    const itensMP = [];
    const itensPacote = [];
    let subtotal = 0;
    for (const item of itens) {
      const prod = (produtos || []).find((p) => p.id === item.produto_id);
      if (!prod) return resposta(400, { erro: `Produto nao encontrado: ${item.produto_id}` });
      if (prod.ativo === false) return resposta(400, { erro: `Produto indisponivel: ${prod.nome_pt}` });
      const qtd = Math.max(1, parseInt(item.quantidade, 10) || 1);
      const tamanho = item.tamanho || null;

      // Produto com variantes (tamanho): valida o estoque DAQUELE tamanho, nao o total.
      if (prod.variantes_estoque && typeof prod.variantes_estoque === 'object') {
        if (!tamanho || prod.variantes_estoque[tamanho] == null) {
          return resposta(400, { erro: `Escolha um tamanho valido para ${prod.nome_pt}.` });
        }
        const estoqueTamanho = prod.variantes_estoque[tamanho];
        if (estoqueTamanho < qtd) {
          return resposta(409, { erro: `Estoque insuficiente para ${prod.nome_pt} tamanho ${tamanho} (restam ${estoqueTamanho}).` });
        }
      } else if (prod.estoque != null && prod.estoque < qtd) {
        return resposta(409, { erro: `Estoque insuficiente para ${prod.nome_pt} (restam ${prod.estoque}).` });
      }

      const preco = Number(prod.preco_promocional) > 0 ? Number(prod.preco_promocional) : Number(prod.preco);
      subtotal += preco * qtd;
      itensPedido.push({ produto_id: prod.id, nome_produto: prod.nome_pt, tamanho, quantidade: qtd, preco_unitario: preco, subtotal: preco * qtd });
      itensPacote.push({ quantidade: qtd, peso_gramas: prod.peso_gramas, frete_altura: prod.frete_altura, frete_largura: prod.frete_largura, frete_comprimento: prod.frete_comprimento });
      itensMP.push({ title: prod.nome_pt + (tamanho ? ` (${tamanho})` : ''), quantity: qtd, unit_price: preco, currency_id: 'BRL' });
    }

    // --- 3. Frete ---
    // Com servico SuperFrete escolhido: recota aqui no servidor com os
    // pesos/medidas do banco e cobra o preco DA COTACAO (o valor que vem do
    // navegador e so referencia). Antes o valor era limitado ao maior da
    // frete_tabela (R$ 45), entao um SEDEX de R$ 80 era cobrado a menos.
    let frete = Number(freteReq.valor) || 0;
    let freteServiceName = freteReq.service_name || null;
    if (freteReq.service_id) {
      let opcoes = null;
      try {
        opcoes = await cotarFrete(end.cep, montarPacote(itensPacote));
      } catch (e) {
        console.error('criar-pagamento: falha ao recotar frete:', e.message);
      }
      if (!opcoes) {
        return resposta(503, { erro: 'Não foi possível confirmar o frete agora. Tente novamente em instantes.' });
      }
      const opcao = opcoes.find((o) => String(o.id) === String(freteReq.service_id));
      if (!opcao) {
        return resposta(409, { erro: 'A opção de frete escolhida não está mais disponível para este CEP. Volte e recalcule o frete.' });
      }
      frete = Number(opcao.preco) || 0;
      freteServiceName = opcao.nome || freteServiceName;
    } else {
      // Fluxo antigo (tabela por regiao)
      const { data: fretes } = await supabase.from('frete_tabela').select('regiao, valor').eq('ativo', true);
      const maxFrete = (fretes || []).reduce((m, f) => Math.max(m, Number(f.valor) || 0), 0);
      if (freteReq.regiao) {
        const match = (fretes || []).find((f) => (f.regiao || '').toUpperCase() === String(freteReq.regiao).toUpperCase());
        if (match) frete = Number(match.valor) || 0;
      }
      if (maxFrete > 0 && frete > maxFrete) frete = maxFrete; // anti-manipulacao
    }
    if (frete < 0) frete = 0;
    const total = subtotal + frete;

    // --- 4. Cria pedido + itens ---
    const pedidoInsert = {
      cliente_id: clienteId,
      status: 'pendente',
      subtotal,
      frete,
      total,
      metodo_pagamento: 'mercadopago',
      endereco_entrega: end,
    };
    // Salva dados do frete para emissão da etiqueta
    if (freteReq.service_id) pedidoInsert.frete_service_id = freteReq.service_id;
    if (freteServiceName) pedidoInsert.frete_service_name = freteServiceName;
    const { data: pedido, error: errPed } = await supabase
      .from('pedidos')
      .insert(pedidoInsert)
      .select('id, numero')
      .single();
    if (errPed) throw errPed;

    const { error: errItens } = await supabase.from('pedido_itens').insert(itensPedido.map((i) => ({ ...i, pedido_id: pedido.id })));
    if (errItens) throw errItens;

    // --- 5. Preferencia Mercado Pago ---
    if (frete > 0) itensMP.push({ title: 'Frete', quantity: 1, unit_price: frete, currency_id: 'BRL' });
    const mp = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const pref = await new Preference(mp).create({
      body: {
        items: itensMP,
        external_reference: pedido.id,
        payer: { name: cliente.nome || '', email: cliente.email },
        back_urls: {
          success: `${siteUrl}/?pagamento=sucesso&pedido=${pedido.numero}`,
          failure: `${siteUrl}/?pagamento=falhou`,
          pending: `${siteUrl}/?pagamento=pendente`,
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/api/webhook-mercadopago`,
        statement_descriptor: 'LABAREDA',
      },
    });

    await supabase.from('pedidos').update({ mercadopago_id: pref.id }).eq('id', pedido.id);

    // Email "pedido recebido" com o link de pagamento (cliente + copia pra
    // loja). Se o cliente fechar a aba ou o Mercado Pago nao abrir, ele
    // ainda tem o link no email. Falha de email nao impede a compra.
    const linkPagamento = pref.init_point || pref.sandbox_init_point || '';
    try {
      await emailPedidoCriado(
        { nome: cliente.nome, email: cliente.email, telefone: cliente.telefone },
        { numero: pedido.numero, subtotal, frete, total, endereco_entrega: end, frete_service_name: freteServiceName },
        itensPedido,
        linkPagamento
      );
    } catch (e) {
      console.error('criar-pagamento: falha ao enviar email do pedido (nao critico):', e.message);
    }

    // Public key para o SDK do Mercado Pago (modal no frontend).
    // Prioriza a variavel do ambiente atual, mas cai pra qualquer uma
    // configurada — assim nao depende de MP_ENV estar escrito exatamente
    // igual em todo canto pra achar a chave certa (mesma logica tolerante
    // ja usada em resolverAccessToken, que tem fallback pra MP_ACCESS_TOKEN).
    const mpEnv = (process.env.MP_ENV || 'teste').toLowerCase();
    const isProd = mpEnv === 'producao' || mpEnv === 'production' || mpEnv === 'prod';
    const mpPublicKey = (isProd ? process.env.MP_PUBLIC_KEY_PROD : process.env.MP_PUBLIC_KEY_TESTE)
      || process.env.MP_PUBLIC_KEY_PROD
      || process.env.MP_PUBLIC_KEY_TESTE
      || process.env.MP_PUBLIC_KEY
      || '';

    return resposta(200, {
      ok: true,
      pedido_id: pedido.id,
      pedido_numero: pedido.numero,
      preference_id: pref.id,
      mp_public_key: mpPublicKey,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
      total,
    });
  } catch (err) {
    console.error('Erro em criar-pagamento:', err);
    return resposta(500, { erro: 'Falha ao criar pagamento.', detalhe: String(err && err.message ? err.message : err) });
  }
};

module.exports = toVercel(handler);
