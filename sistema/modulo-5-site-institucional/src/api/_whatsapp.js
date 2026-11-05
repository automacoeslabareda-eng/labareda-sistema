/**
 * ============================================================
 *  WhatsApp do comprador (Evolution Go — celular do sitio)
 * ============================================================
 *  Arquivo iniciado por "_" => NAO vira rota no Vercel.
 *
 *  Manda ao COMPRADOR as mensagens da compra (pedido aguardando Pix,
 *  compra confirmada + termos, nota fiscal, pedido postado + rastreio).
 *  O aviso pra EQUIPE continua no n8n (etapaAvisoEquipe).
 *
 *  Melhor esforco: sem configuracao ou com erro, so loga e devolve false —
 *  o e-mail continua sendo o canal garantido.
 *
 *  Variaveis de ambiente:
 *   - EVOLUTION_API_URL         (default https://apiwhats.sitiolabareda.com)
 *   - EVOLUTION_INSTANCE_TOKEN  token da instancia do celular do sitio
 *                               (header apikey do POST /send/text)
 *   - SITE_URL, WHATSAPP_PEDIDOS
 * ============================================================
 */

const { linkAcompanhar } = require('./_pedido-token');

function siteUrl() {
  return (process.env.SITE_URL || 'https://sitiolabareda.com').trim().replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
}

function termosUrl() {
  return siteUrl() + '/termos-e-condicoes.pdf';
}

function brl(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

/* Telefone do checkout -> 55 + DDD + numero. Devolve '' se nao parecer celular BR. */
function numeroWhatsApp(telefone) {
  var d = String(telefone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55\d{10,11}$/.test(d) ? d : '';
}

async function enviarWhatsApp(telefone, texto) {
  var token = process.env.EVOLUTION_INSTANCE_TOKEN;
  var numero = numeroWhatsApp(telefone);
  if (!token) {
    console.warn('[whatsapp] EVOLUTION_INSTANCE_TOKEN nao configurado — mensagem ao comprador nao enviada.');
    return false;
  }
  if (!numero) return false;
  var base = (process.env.EVOLUTION_API_URL || 'https://apiwhats.sitiolabareda.com').replace(/\/+$/, '');
  try {
    var res = await fetch(base + '/send/text', {
      method: 'POST',
      headers: { 'apikey': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    if (!res.ok) {
      console.error('[whatsapp] Evolution respondeu', res.status, await res.text().catch(function () { return ''; }));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[whatsapp] Falha ao enviar:', e.message);
    return false;
  }
}

function primeiroNome(cliente) {
  return (((cliente && cliente.nome) || '').trim().split(' ')[0]) || 'tudo bem';
}

/* ---- Textos (naturais, sem IDs internos) ---- */

function msgAguardandoPix(cliente, pedido, linkPix) {
  return 'Oi, ' + primeiroNome(cliente) + '! 🌿\n\n'
    + 'Recebemos seu pedido #' + pedido.numero + ' no Sítio Labareda (' + brl(pedido.total) + ').\n'
    + 'Falta só o Pix pra gente confirmar. Se fechou a página, é só abrir o QR Code por aqui:\n' + linkPix + '\n\n'
    + 'Assim que o pagamento cair, te avisamos. 😉';
}

function msgAguardandoBoleto(cliente, pedido, linkBoleto) {
  return 'Oi, ' + primeiroNome(cliente) + '! 🌿\n\n'
    + 'Seu boleto do pedido #' + pedido.numero + ' (' + brl(pedido.total) + ') está aqui:\n' + linkBoleto + '\n\n'
    + 'Ele leva até 3 dias úteis pra compensar. Quando o pagamento cair, te avisamos por aqui. 😉';
}

function msgCompraConfirmada(cliente, pedido, extras) {
  extras = extras || {};
  var linhas = [
    'Oi, ' + primeiroNome(cliente) + '! 🎉',
    '',
    'Pagamento confirmado! Seu pedido #' + pedido.numero + ' (' + brl(pedido.total) + ') já está com a gente e vamos começar a preparar.',
  ];
  if (extras.danfeUrl) linhas.push('', '🧾 Sua nota fiscal: ' + extras.danfeUrl);
  else linhas.push('', '🧾 A nota fiscal chega por aqui e no seu e-mail assim que for emitida.');
  linhas.push(
    '📄 Termos e condições da compra: ' + termosUrl(),
    '📦 Acompanhe o pedido: ' + linkAcompanhar(siteUrl(), pedido.numero),
    '',
    'Quando o pedido for postado, mandamos o código de rastreio. Qualquer dúvida, é só responder aqui. 💛',
    'Equipe Sítio Labareda'
  );
  return linhas.join('\n');
}

function msgNotaFiscal(cliente, pedido, danfeUrl) {
  return 'Oi, ' + primeiroNome(cliente) + '! 🧾\n\n'
    + 'A nota fiscal do seu pedido #' + pedido.numero + ' foi emitida' + (pedido.nfe_numero ? ' (NF-e ' + pedido.nfe_numero + ')' : '') + '.\n'
    + (danfeUrl ? 'Baixe aqui: ' + danfeUrl + '\n' : '')
    + 'Ela também foi pro seu e-mail, com o XML.\n\n'
    + 'Equipe Sítio Labareda 🌿';
}

function msgPedidoEnviado(cliente, pedido, tracking, rastreioUrl) {
  return 'Oi, ' + primeiroNome(cliente) + '! 📦\n\n'
    + 'Seu pedido #' + pedido.numero + ' saiu para entrega!\n'
    + (tracking ? 'Código de rastreio: ' + tracking + '\n' : '')
    + (rastreioUrl ? 'Rastreie aqui: ' + rastreioUrl + '\n' : '')
    + '\nSe chegar algo avariado ou diferente do pedido, avise em até 48h pelo e-mail sitiolabareda@gmail.com, com fotos. 🙏\n'
    + 'Equipe Sítio Labareda 🌿';
}

module.exports = {
  enviarWhatsApp, numeroWhatsApp, termosUrl,
  msgAguardandoPix, msgAguardandoBoleto, msgCompraConfirmada, msgNotaFiscal, msgPedidoEnviado,
};
