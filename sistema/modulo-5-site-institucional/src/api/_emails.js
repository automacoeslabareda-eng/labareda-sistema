/**
 * ============================================================
 *  Emails transacionais da loja (Resend)
 * ============================================================
 *  Arquivo iniciado por "_" => NAO vira rota no Vercel.
 *
 *  Dois momentos:
 *   1. emailPedidoCriado    — logo que o pedido e criado (criar-pagamento):
 *      resumo + link de pagamento do Mercado Pago. Vai pro cliente e pra loja.
 *   2. emailPagamentoAprovado — quando o MP aprova (webhook): confirmacao +
 *      rastreio/etiqueta do frete (se ja gerada). Vai pro cliente e pra loja
 *      (a copia da loja leva tambem o link da etiqueta pra imprimir).
 *
 *  Variaveis de ambiente:
 *   - RESEND_API_KEY  (sem ela nenhum email sai — fica logado o aviso)
 *   - EMAIL_FROM      (default: Sitio Labareda <noreply@sitiolabareda.com>)
 *   - EMAIL_LOJA      (default: sitiolabareda@gmail.com) — copia pra loja
 *   - SITE_URL, WHATSAPP_PEDIDOS
 * ============================================================
 */

const { linkAcompanhar } = require('./_pedido-token');

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function brl(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}
function siteUrl() {
  return (process.env.SITE_URL || 'https://sitiolabareda.com').trim().replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
}

async function enviarEmail(to, subject, html) {
  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('[emails] RESEND_API_KEY nao configurada. Email nao enviado:', subject);
    return false;
  }
  if (!to) return false;
  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Sitio Labareda <noreply@sitiolabareda.com>',
        to: [to],
        subject: subject,
        html: html,
      }),
    });
    if (!res.ok) {
      var errBody = await res.text().catch(function () { return ''; });
      console.error('[emails] Erro Resend:', res.status, errBody, '| assunto:', subject);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[emails] Falha ao enviar email:', err, '| assunto:', subject);
    return false;
  }
}

function botao(href, texto) {
  return '<div style="text-align:center;margin:24px 0;">'
    + '<a href="' + esc(href) + '" style="display:inline-block;background:#AA3424;color:#F3E9D2;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:.9rem;">' + esc(texto) + '</a>'
    + '</div>';
}

function resumoHtml(pedido, itens) {
  var linhas = (itens || []).map(function (it) {
    var nome = (it.nome_produto || '') + (it.tamanho ? ' (' + it.tamanho + ')' : '');
    return '<tr>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e0d5c5;">' + esc(nome) + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e0d5c5;text-align:center;">' + esc(it.quantidade) + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #e0d5c5;text-align:right;">' + brl(it.preco_unitario) + '</td>'
      + '</tr>';
  }).join('');
  var freteNome = pedido.frete_service_name ? ' (' + esc(pedido.frete_service_name) + ')' : '';
  return [
    '<div style="background:#f5f0e8;border-radius:8px;padding:20px;margin:20px 0;">',
    '<table style="width:100%;border-collapse:collapse;font-size:.9rem;">',
    '<thead><tr style="color:#6b5f56;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;">',
    '<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #d4c9b8;">Produto</th>',
    '<th style="padding:8px 12px;text-align:center;border-bottom:2px solid #d4c9b8;">Qtd</th>',
    '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #d4c9b8;">Valor</th>',
    '</tr></thead>',
    '<tbody>' + linhas + '</tbody>',
    '<tfoot>',
    '<tr><td colspan="2" style="padding:8px 12px;text-align:right;font-size:.85rem;color:#6b5f56;">Subtotal</td><td style="padding:8px 12px;text-align:right;">' + brl(pedido.subtotal) + '</td></tr>',
    '<tr><td colspan="2" style="padding:8px 12px;text-align:right;font-size:.85rem;color:#6b5f56;">Frete' + freteNome + '</td><td style="padding:8px 12px;text-align:right;">' + brl(pedido.frete) + '</td></tr>',
    '<tr><td colspan="2" style="padding:8px 12px;text-align:right;font-weight:bold;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:bold;">' + brl(pedido.total) + '</td></tr>',
    '</tfoot>',
    '</table>',
    '</div>',
  ].join('');
}

function enderecoHtml(end) {
  end = end || {};
  if (!end.rua) return '';
  return '<div style="margin:20px 0;"><p style="font-size:.85rem;color:#6b5f56;margin-bottom:4px;">Endereço de entrega:</p><p style="font-size:.9rem;">'
    + esc(end.rua) + ', ' + esc(end.numero) + (end.complemento ? ' — ' + esc(end.complemento) : '')
    + '<br>' + esc(end.bairro) + ' — ' + esc(end.cidade) + '/' + esc(end.estado)
    + '<br>CEP: ' + esc(end.cep) + '</p></div>';
}

function rodape(pedido) {
  var whatsapp = process.env.WHATSAPP_PEDIDOS || '5573998150799';
  var whatsappLink = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent('Oi! Tenho uma dúvida sobre o pedido #' + pedido.numero);
  return '<hr style="border:none;border-top:1px solid #e0d5c5;margin:24px 0;">'
    + '<p style="font-size:.85rem;color:#6b5f56;">Dúvidas sobre seu pedido?</p>'
    + '<p style="font-size:.85rem;"><a href="' + esc(whatsappLink) + '" style="color:#AA3424;">Fale conosco pelo WhatsApp</a> — (73) 99815-0799</p>'
    + '<p style="font-size:.75rem;color:#9a8b7d;margin-top:20px;text-align:center;">Sítio Labareda — Roça & Arte<br>Serra Grande, Costa do Cacau, Bahia</p>';
}

function moldura(conteudo) {
  return '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#2E2624;">'
    + '<h2 style="color:#AA3424;text-align:center;margin-bottom:24px;">Sítio Labareda</h2>'
    + conteudo + '</div>';
}

function dadosClienteHtml(cliente) {
  cliente = cliente || {};
  return '<div style="margin:20px 0;font-size:.9rem;"><p style="font-size:.85rem;color:#6b5f56;margin-bottom:4px;">Cliente:</p>'
    + esc(cliente.nome) + '<br>' + esc(cliente.email) + (cliente.telefone ? '<br>' + esc(cliente.telefone) : '')
    + (cliente.cpf ? '<br>CPF: ' + esc(cliente.cpf) : '') + '</div>';
}

/* 1. Pedido criado: cliente recebe o link pra pagar; loja recebe aviso. */
async function emailPedidoCriado(cliente, pedido, itens, linkPagamento) {
  var acompanharUrl = linkAcompanhar(siteUrl(), pedido.numero);
  var primeiroNome = esc(((cliente && cliente.nome) || '').split(' ')[0]);

  var htmlCliente = moldura(
    '<p>Olá, ' + primeiroNome + '!</p>'
    + '<p>Recebemos seu pedido <strong>#' + esc(pedido.numero) + '</strong>. Para confirmá-lo, conclua o pagamento pelo Mercado Pago:</p>'
    + (linkPagamento ? botao(linkPagamento, 'Pagar com Mercado Pago') : '')
    + resumoHtml(pedido, itens)
    + enderecoHtml(pedido.endereco_entrega)
    + '<p style="font-size:.9rem;">Assim que o pagamento for aprovado, você recebe outro email de confirmação e, quando o pedido for despachado, o código de rastreamento.</p>'
    + '<p style="font-size:.85rem;color:#6b5f56;">Acompanhe seu pedido em: <a href="' + esc(acompanharUrl) + '">' + esc(acompanharUrl) + '</a></p>'
    + rodape(pedido)
  );

  var htmlLoja = moldura(
    '<p>Novo pedido <strong>#' + esc(pedido.numero) + '</strong> criado no site — <strong>aguardando pagamento</strong>.</p>'
    + dadosClienteHtml(cliente)
    + resumoHtml(pedido, itens)
    + enderecoHtml(pedido.endereco_entrega)
    + (linkPagamento ? '<p style="font-size:.85rem;">Link de pagamento enviado ao cliente: <a href="' + esc(linkPagamento) + '">' + esc(linkPagamento) + '</a></p>' : '')
  );

  var r = await Promise.all([
    enviarEmail(cliente && cliente.email, 'Pedido #' + pedido.numero + ' recebido — finalize o pagamento | Sítio Labareda', htmlCliente),
    enviarEmail(process.env.EMAIL_LOJA || 'sitiolabareda@gmail.com', '[Loja] Novo pedido #' + pedido.numero + ' (aguardando pagamento)', htmlLoja),
  ]);
  return { cliente: r[0], loja: r[1] };
}

/* 2. Pagamento aprovado: confirmacao + dados do frete/rastreio. */
async function emailPagamentoAprovado(cliente, pedido, itens, etiqueta) {
  var acompanharUrl = linkAcompanhar(siteUrl(), pedido.numero);
  var primeiroNome = esc(((cliente && cliente.nome) || '').split(' ')[0]);

  var blocoRastreio = '';
  if (etiqueta && etiqueta.tracking) {
    blocoRastreio = '<div style="background:#f5f0e8;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">'
      + '<p style="margin:0 0 8px;font-size:.85rem;color:#6b5f56;">Código de rastreamento</p>'
      + '<p style="font-size:1.3rem;font-weight:bold;letter-spacing:.15em;margin:0;">' + esc(etiqueta.tracking) + '</p>'
      + '</div>'
      + (etiqueta.rastreio_url ? botao(etiqueta.rastreio_url, 'Rastrear meu pedido') : '');
  }

  var htmlCliente = moldura(
    '<p>Olá, ' + primeiroNome + '!</p>'
    + '<p>O pagamento do pedido <strong>#' + esc(pedido.numero) + '</strong> foi aprovado. Obrigado pela compra! 🌿</p>'
    + resumoHtml(pedido, itens)
    + enderecoHtml(pedido.endereco_entrega)
    + (blocoRastreio || '<p style="font-size:.9rem;">Quando seu pedido for despachado, você receberá um email com o código de rastreamento.</p>')
    + botao(acompanharUrl, 'Acompanhar pedido')
    + rodape(pedido)
  );

  var blocoEtiquetaLoja;
  if (etiqueta && (etiqueta.tracking || etiqueta.etiqueta_url)) {
    blocoEtiquetaLoja = '<p style="font-size:.9rem;"><strong>Etiqueta gerada no SuperFrete.</strong><br>'
      + (etiqueta.tracking ? 'Rastreio: ' + esc(etiqueta.tracking) + '<br>' : '')
      + (etiqueta.etiqueta_url ? '<a href="' + esc(etiqueta.etiqueta_url) + '">Imprimir etiqueta</a>' : '')
      + '</p>';
  } else {
    blocoEtiquetaLoja = '<p style="font-size:.9rem;color:#AA3424;"><strong>Etiqueta NÃO gerada automaticamente</strong> — gere pelo painel da loja.'
      + (etiqueta && etiqueta.erro ? '<br>Motivo: ' + esc(etiqueta.erro) : '') + '</p>';
  }

  // Checklist do que a equipe precisa fazer pra despachar a venda
  var tel = ((cliente && cliente.telefone) || '').replace(/\D/g, '');
  var waCliente = tel ? 'https://wa.me/' + (tel.length <= 11 ? '55' + tel : tel) : '';
  var item = function (feito, html) {
    return '<li style="margin:8px 0;list-style:none;">' + (feito ? '✅ ' : '⬜ ') + html + '</li>';
  };
  var checklist = '<div style="background:#fff4e5;border:1px solid #f0d9b5;border-radius:8px;padding:12px 16px;margin:20px 0;">'
    + '<p style="margin:0 0 6px;font-weight:bold;">Checklist do pedido</p><ul style="padding:0;margin:0;font-size:.9rem;">'
    + item(etiqueta && etiqueta.etiqueta_url, 'Etiqueta de envio' + (etiqueta && etiqueta.etiqueta_url ? ' — <a href="' + esc(etiqueta.etiqueta_url) + '">imprimir</a>' : ' — gerar no painel da loja'))
    + item(false, 'Emitir nota fiscal' + (cliente && cliente.cpf ? ' (CPF ' + esc(cliente.cpf) + ')' : ''))
    + item(false, 'Falar com o cliente: ' + esc(cliente && cliente.nome)
      + (tel ? ' — <a href="' + esc(waCliente) + '">WhatsApp ' + esc(cliente.telefone) + '</a>' : '')
      + (cliente && cliente.email ? ' — <a href="mailto:' + esc(cliente.email) + '">' + esc(cliente.email) + '</a>' : ''))
    + item(false, 'Separar, embalar e postar')
    + '</ul></div>';

  var htmlLoja = moldura(
    '<p>💰 <strong>VENDEU!</strong> Pagamento aprovado — pedido <strong>#' + esc(pedido.numero) + '</strong>.</p>'
    + checklist
    + blocoEtiquetaLoja
    + dadosClienteHtml(cliente)
    + resumoHtml(pedido, itens)
    + enderecoHtml(pedido.endereco_entrega)
  );

  var r = await Promise.all([
    enviarEmail(cliente && cliente.email, 'Pedido #' + pedido.numero + ' confirmado! — Sítio Labareda', htmlCliente),
    enviarEmail(process.env.EMAIL_LOJA || 'sitiolabareda@gmail.com', '💰 VENDEU! Pedido #' + pedido.numero + ' pago — etiqueta, nota e contato', htmlLoja),
  ]);
  return { cliente: r[0], loja: r[1] };
}

module.exports = { enviarEmail, emailPedidoCriado, emailPagamentoAprovado };
