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

    const env = process.env.SUPERFRETE_ENV || 'sandbox';
    const baseUrl = env === 'producao'
      ? 'https://api.superfrete.com'
      : 'https://sandbox.superfrete.com';

    const cepOrigem = process.env.SUPERFRETE_CEP_ORIGEM || '45680000';

    // Peso e dimensões padrão para produtos da loja (cosméticos, camisetas, arte)
    const pacote = body.package || {
      height: 10,
      width: 20,
      length: 30,
      weight: 0.5,
    };

    const payload = {
      from: { postal_code: cepOrigem },
      to: { postal_code: cepDestino },
      services: '1,2,17',  // PAC, SEDEX, Mini Envios
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: body.insurance_value || 0,
        use_insurance_value: !!body.insurance_value,
      },
      package: {
        height: pacote.height,
        width: pacote.width,
        length: pacote.length,
        weight: pacote.weight,
      },
    };

    const response = await fetch(baseUrl + '/api/v0/calculator', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'SitioLabareda (sitiolabareda@gmail.com)',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('SuperFrete error:', response.status, errText);
      return {
        statusCode: response.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ erro: 'Erro ao calcular frete. Tente novamente.' }),
      };
    }

    const data = await response.json();

    // Filtra opções com erro e formata a resposta
    const opcoes = (Array.isArray(data) ? data : [])
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
