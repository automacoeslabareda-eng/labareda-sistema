/**
 * ============================================================
 *  Adaptador Netlify -> Vercel
 * ============================================================
 *  Converte um handler no formato Netlify Functions
 *    (event) => { statusCode, headers, body }
 *  para o formato de Vercel Serverless Functions
 *    (req, res) => void
 *
 *  Assim reaproveitamos 100% da logica ja testada das functions,
 *  trocando apenas a "casca" da requisicao/resposta.
 *
 *  OBS: arquivos iniciados por "_" dentro de /api NAO viram rotas
 *  no Vercel — este helper nao e um endpoint.
 * ============================================================
 */
function toVercel(handler) {
  return async function (req, res) {
    // O Vercel pode ja ter parseado o corpo como objeto; o handler
    // Netlify espera uma string (ele faz JSON.parse internamente).
    let rawBody = '';
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      rawBody = JSON.stringify(req.body);
    }

    const event = {
      httpMethod: req.method,
      headers: req.headers || {},
      queryStringParameters: req.query || {},
      body: rawBody,
    };

    try {
      const result = (await handler(event)) || {};
      const headers = result.headers || {};
      for (const k of Object.keys(headers)) res.setHeader(k, headers[k]);
      res.status(result.statusCode || 200);
      res.send(result.body != null ? result.body : '');
    } catch (err) {
      console.error('Adaptador Vercel: erro nao tratado:', err);
      res.status(500).json({ erro: 'Falha interna do servidor.' });
    }
  };
}

module.exports = { toVercel };
