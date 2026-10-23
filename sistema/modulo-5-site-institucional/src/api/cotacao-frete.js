/**
 * ============================================================
 *  cotacao-frete  (Vercel Serverless Function)
 * ============================================================
 *  Proxy para a API do SuperFrete — calcula cotação de frete
 *  sem expor o token no frontend.
 *
 *  Recebe: { cep_destino: "12345678" }
 *  Retorna: array de opções de frete (PAC, SEDEX, Mini Envios, etc.)
 *
 *  Variáveis de ambiente:
 *   - SUPERFRETE_TOKEN        (token da API SuperFrete)
 *   - SUPERFRETE_ENV          ('sandbox' | 'producao', default: 'sandbox')
 *   - SUPERFRETE_CEP_ORIGEM   (CEP de origem, default: '45680000' Serra Grande/BA)
 * ============================================================
 */

const { toVercel } = require('./_netlify-adapter');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* Monta o pacote a partir dos itens (mesma regra do carrinho no app.js):
   altura somada (itens empilhados), largura/comprimento = maior item. */
function montarPacote(itens) {
  let peso = 0, altura = 0, largura = 0, comprimento = 0;
  (itens || []).forEach(function (i) {
    const qty = i.quantidade || 1;
    peso += ((i.peso_gramas || 200) / 1000) * qty;
    altura += (i.frete_altura || 5) * qty;
    largura = Math.max(largura, i.frete_largura || 20);
    comprimento = Math.max(comprimento, i.frete_comprimento || 30);
  });
  return {
    height: Math.max(2, Math.ceil(altura)),
    width: Math.max(11, Math.ceil(largura)),
    length: Math.max(16, Math.ceil(comprimento)),
    weight: Math.max(0.3, peso),
  };
}

/* Cota no SuperFrete. Retorna array de opcoes formatadas, ou null se falhar. */
async function cotarFrete(cepDestino, pacote, insuranceValue) {
  const token = process.env.SUPERFRETE_TOKEN;
  if (!token) return null;
  // Aceita 'producao', 'produção', 'production', 'prod' (com/sem maiusculas
  // e espacos) — qualquer grafia diferente caia no sandbox sem avisar.
  const env = (process.env.SUPERFRETE_ENV || 'sandbox').trim().toLowerCase();
  const prod = ['producao', 'produção', 'production', 'prod'].includes(env);
  const baseUrl = prod ? 'https://api.superfrete.com' : 'https://sandbox.superfrete.com';
  const cepOrigem = process.env.SUPERFRETE_CEP_ORIGEM || '45653000';
  // Peso e dimensões padrão para produtos da loja (cosméticos, camisetas, arte)
  const pkg = pacote || { height: 10, width: 20, length: 30, weight: 0.5 };

  const response = await fetch(baseUrl + '/api/v0/calculator', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'SitioLabareda/1.0 (sitiolabareda@gmail.com)',
    },
    body: JSON.stringify({
      from: { postal_code: cepOrigem },
      to: { postal_code: String(cepDestino || '').replace(/\D/g, '') },
      services: '1,2,17',  // PAC, SEDEX, Mini Envios
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: insuranceValue || 0,
        use_insurance_value: !!insuranceValue,
      },
      package: { height: pkg.height, width: pkg.width, length: pkg.length, weight: pkg.weight },
    }),
  });
  if (!response.ok) {
    console.error('SuperFrete error:', response.status, await response.text().catch(function () { return ''; }));
    return null;
  }
  const data = await response.json();

  // Filtra opções com erro e formata a resposta
  return (Array.isArray(data) ? data : [])
    .filter(function (op) { return !op.has_error; })
    .map(function (op) {
      return {
        id: op.id,
        nome: op.name,
        preco: parseFloat(op.custom_price || op.price || 0),
        preco_original: parseFloat(op.price || 0),
        moeda: op.currency || 'R$',
        prazo_dias: op.custom_delivery_time || op.delivery_time,
        prazo_range: op.custom_delivery_range || op.delivery_range,
        transportadora: op.company ? op.company.name : '',
        transportadora_logo: op.company ? op.company.picture : '',
        desconto: op.discount,
      };
    });
}

async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ erro: 'Método não permitido' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const cepDestino = (body.cep_destino || '').replace(/\D/g, '');

    if (!cepDestino || cepDestino.length !== 8) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ erro: 'CEP inválido. Informe 8 dígitos.' }),
      };
    }

    const token = process.env.SUPERFRETE_TOKEN;
    if (!token) {
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ erro: 'Token SuperFrete não configurado.' }),
      };
    }

    const opcoes = await cotarFrete(cepDestino, body.package, body.insurance_value);
    if (!opcoes) {
      return {
        statusCode: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ erro: 'Erro ao calcular frete. Tente novamente.' }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(opcoes),
    };

  } catch (err) {
    console.error('cotacao-frete error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ erro: 'Erro interno no servidor.' }),
    };
  }
}

module.exports = toVercel(handler);
module.exports.cotarFrete = cotarFrete;
module.exports.montarPacote = montarPacote;
