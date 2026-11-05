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
const { termosUrl } = require('./_whatsapp');

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

/* anexos (opcional): [{ filename, content (base64) }] */
async function enviarEmail(to, subject, html, anexos) {
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
      body: JSON.stringify(Object.assign({
        from: process.env.EMAIL_FROM || 'Sitio Labareda <noreply@sitiolabareda.com>',
        to: [to],
        subject: subject,
        html: html,
      }, anexos && anexos.length ? { attachments: anexos } : {})),
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

/* Contatos oficiais exibidos ao comprador. O numero mostrado sai do mesmo
   WHATSAPP_PEDIDOS do link (antes o texto era fixo e podia divergir). */
function contatos() {
  var whatsapp = String(process.env.WHATSAPP_PEDIDOS || '5573998150799').replace(/\D/g, '');
  var local = whatsapp.replace(/^55(?=\d{10,11}$)/, '');
  var exibicao = local.length === 11
    ? '(' + local.slice(0, 2) + ') ' + local.slice(2, 7) + '-' + local.slice(7)
    : (local.length === 10 ? '(' + local.slice(0, 2) + ') ' + local.slice(2, 6) + '-' + local.slice(6) : whatsapp);
  return {
    whatsapp: whatsapp,
    whatsappExibicao: exibicao,
    email: process.env.EMAIL_CONTATO || process.env.EMAIL_LOJA || 'sitiolabareda@gmail.com',
  };
}

/* Prazo cotado no checkout (criar-pagamento guarda em endereco_entrega.frete_prazo). */
function prazoTexto(pedido) {
  var p = pedido && pedido.endereco_entrega && pedido.endereco_entrega.frete_prazo;
  if (!p || !p.min) return '';
  var max = p.max || p.min;
  var dias = max !== p.min ? p.min + ' a ' + max : String(p.min);
  return dias + (max > 1 ? ' dias úteis' : ' dia útil') + ' após a postagem'
    + (pedido.frete_service_name ? ' (' + pedido.frete_service_name + ')' : '');
}

function rodape(pedido) {
  var c = contatos();
  var whatsappLink = 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent('Oi! Tenho uma dúvida sobre o pedido #' + pedido.numero);
  return '<hr style="border:none;border-top:1px solid #e0d5c5;margin:24px 0;">'
    + '<p style="font-size:.85rem;color:#6b5f56;">Se precisar falar conosco:</p>'
    + '<p style="font-size:.85rem;margin:4px 0;">E-mail: <a href="mailto:' + esc(c.email) + '" style="color:#AA3424;">' + esc(c.email) + '</a></p>'
    + '<p style="font-size:.85rem;margin:4px 0;">WhatsApp: <a href="' + esc(whatsappLink) + '" style="color:#AA3424;">' + esc(c.whatsappExibicao) + '</a></p>'
    + '<p style="font-size:.85rem;margin:12px 0 4px;"><a href="' + esc(termosUrl()) + '" style="color:#AA3424;">Termos e condições de compra (PDF)</a> — trocas, devoluções, desistência e avarias.</p>'
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
async function emailPedidoCriado(cliente, pedido, itens, linkPagamento, reservaAte) {
  var acompanharUrl = linkAcompanhar(siteUrl(), pedido.numero);
  var primeiroNome = esc(((cliente && cliente.nome) || '').split(' ')[0]);
  var validade = '';
  if (reservaAte) {
    var quando = new Date(reservaAte).toLocaleString('pt-BR', {
      timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    validade = '<p style="font-size:.85rem;color:#6b5f56;text-align:center;">Seus itens ficam separados e o link vale até '
      + esc(quando) + '. Depois disso eles voltam para a loja.</p>';
  }

  var htmlCliente = moldura(
    '<p>Olá, ' + primeiroNome + '!</p>'
    + '<p>Recebemos seu pedido <strong>#' + esc(pedido.numero) + '</strong>. Se ainda não concluiu o pagamento no site, você pode pagar por aqui (cartão, Pix ou boleto):</p>'
    + (linkPagamento ? botao(linkPagamento, 'Concluir pagamento') + validade : '')
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

/* 2. Pagamento aprovado: confirmacao + dados do frete/rastreio.
   nota (opcional): { numero, chave, anexos } quando a NF-e ja foi autorizada —
   vai anexada ao email do comprador (DANFE + XML). */
async function emailPagamentoAprovado(cliente, pedido, itens, etiqueta, nota) {
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

  // Segue o modelo de confirmacao do briefing (squads/site.md, secao 4):
  // nota ja autorizada vai anexada; senao, avisa que chega em outro email.
  var temNota = !!(nota && nota.anexos && nota.anexos.length);
  var textoNota = temNota
    ? 'Sua nota fiscal' + (nota.numero ? ' (NF-e ' + esc(nota.numero) + ')' : '') + ' está disponível neste e-mail, em anexo.'
    : 'Enviaremos sua nota fiscal assim que a emissão for concluída.';
  var prazo = prazoTexto(pedido);
  var htmlCliente = moldura(
    '<p>Olá, ' + primeiroNome + '!</p>'
    + '<p>Obrigado por comprar no Sítio Labareda. 🌿 Recebemos a confirmação do pagamento do seu pedido <strong>#'
    + esc(pedido.numero) + '</strong> e vamos iniciar a preparação.</p>'
    + '<p style="font-size:.85rem;color:#6b5f56;margin:20px 0 0;">Seu pedido:</p>'
    + resumoHtml(pedido, itens)
    + '<p style="font-size:.9rem;margin:6px 0;"><strong>Valor total:</strong> ' + brl(pedido.total) + '</p>'
    + (prazo ? '<p style="font-size:.9rem;margin:6px 0;"><strong>Previsão de entrega:</strong> ' + esc(prazo) + '</p>' : '')
    + enderecoHtml(pedido.endereco_entrega)
    + '<p style="font-size:.9rem;">' + textoNota + '</p>'
    + (blocoRastreio
      ? '<p style="font-size:.9rem;">Seu pedido já tem código de rastreamento:</p>' + blocoRastreio
      : '<p style="font-size:.9rem;">Assim que o pedido for despachado, você receberá o código de rastreamento.</p>')
    + botao(acompanharUrl, 'Acompanhar pedido')
    + rodape(pedido)
    + '<p style="font-size:.9rem;margin-top:20px;">Com carinho,<br>Equipe Sítio Labareda</p>'
  );

  var blocoEtiquetaLoja;
  if (etiqueta && (etiqueta.tracking || etiqueta.etiqueta_url)) {
    blocoEtiquetaLoja = '<p style="font-size:.9rem;"><strong>Etiqueta gerada no SuperFrete.</strong><br>'
      + (etiqueta.tracking ? 'Rastreio: ' + esc(etiqueta.tracking) + '<br>' : '')
      + (etiqueta.etiqueta_url ? '<a href="' + esc(etiqueta.etiqueta_url) + '">Imprimir etiqueta</a>' : '')
      + '</p>';
  } else if (etiqueta && /saldo|insuficiente|cr[eé]dito|SuperFrete: 409/i.test(String(etiqueta.erro || ''))) {
    blocoEtiquetaLoja = '<div style="background:#fdecea;border:2px solid #AA3424;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:.95rem;">'
      + '<strong>⚠️ SEM SALDO NO SUPERFRETE — a etiqueta não foi emitida.</strong><br>'
      + '1. Coloque crédito na conta SuperFrete.<br>'
      + '2. No painel da loja, abra o pedido #' + esc(pedido.numero) + ' e clique em <strong>Gerar etiqueta SuperFrete</strong>.'
      + '</div>';
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
    + item(etiqueta && etiqueta.etiqueta_url, 'Etiqueta de envio' + (etiqueta && etiqueta.etiqueta_url ? ' — <a href="' + esc(etiqueta.etiqueta_url) + '">imprimir</a>' : ' — gerar no painel da loja (veja o aviso abaixo)'))
    + (temNota
      ? item(true, 'Nota fiscal NF-e ' + esc(nota.numero || '') + ' autorizada — DANFE e XML em anexo (imprima o DANFE e coloque na embalagem)')
      : item(false, 'Nota fiscal' + (cliente && cliente.cpf ? ' (CPF ' + esc(cliente.cpf) + ')' : '')
        + ' — emitir pelo painel da loja (botão Emitir nota fiscal no pedido) ou acompanhar a emissão automática'))
    + item(false, 'Falar com o cliente: ' + esc(cliente && cliente.nome)
      + (tel ? ' — <a href="' + esc(waCliente) + '">WhatsApp ' + esc(cliente.telefone) + '</a>' : '')
      + (cliente && cliente.email ? ' — <a href="mailto:' + esc(cliente.email) + '">' + esc(cliente.email) + '</a>' : ''))
    + item(false, 'Separar, embalar e postar')
    + '</ul></div>';

  var htmlLoja = moldura(
    '<p>💰 <strong>VENDEU!</strong> Pagamento aprovado — pedido <strong>#' + esc(pedido.numero) + '</strong>.</p>'
    + checklist
    + blocoEtiquetaLoja
    + (prazo ? '<p style="font-size:.9rem;">Prazo informado ao cliente: ' + esc(prazo) + '</p>' : '')
    + dadosClienteHtml(cliente)
    + resumoHtml(pedido, itens)
    + enderecoHtml(pedido.endereco_entrega)
  );

  var anexos = temNota ? nota.anexos : null;
  var r = await Promise.all([
    enviarEmail(cliente && cliente.email, 'Compra confirmada — Pedido #' + pedido.numero, htmlCliente, anexos),
    enviarEmail(process.env.EMAIL_LOJA || 'sitiolabareda@gmail.com', '💰 VENDEU! Pedido #' + pedido.numero + ' pago — etiqueta, nota e contato', htmlLoja, anexos),
  ]);
  return { cliente: r[0], loja: r[1] };
}

/* 3. Nota fiscal pronta depois da confirmacao: segundo email ao comprador
   com DANFE + XML anexados (copia pra loja). Retorna true se o comprador
   recebeu. */
async function emailNotaFiscal(cliente, pedido, nota) {
  var primeiroNome = esc(((cliente && cliente.nome) || '').split(' ')[0]);
  var html = moldura(
    '<p>Olá, ' + primeiroNome + '!</p>'
    + '<p>A nota fiscal do seu pedido <strong>#' + esc(pedido.numero) + '</strong> foi emitida'
    + (nota.numero ? ' (NF-e ' + esc(nota.numero) + ')' : '') + ' e segue em anexo: o DANFE em PDF e o arquivo XML.</p>'
    + (nota.chave ? '<p style="font-size:.8rem;color:#6b5f56;word-break:break-all;">Chave de acesso: ' + esc(nota.chave) + '</p>' : '')
    + '<p style="font-size:.85rem;color:#6b5f56;">Você também pode consultá-la no Portal da Nota Fiscal Eletrônica com a chave de acesso.</p>'
    + botao(linkAcompanhar(siteUrl(), pedido.numero), 'Acompanhar pedido')
    + rodape(pedido)
    + '<p style="font-size:.9rem;margin-top:20px;">Com carinho,<br>Equipe Sítio Labareda</p>'
  );
  var r = await Promise.all([
    enviarEmail(cliente && cliente.email, 'Nota fiscal do pedido #' + pedido.numero + ' — Sítio Labareda', html, nota.anexos),
    enviarEmail(process.env.EMAIL_LOJA || 'sitiolabareda@gmail.com', '[Loja] Nota fiscal do pedido #' + pedido.numero + ' emitida', html, nota.anexos),
  ]);
  return r[0];
}

/* Instrucoes de pagamento gerado no site (Pix ou boleto) — so ao comprador.
   dados: { tipo:'pix'|'boleto', link, codigo (copia e cola / linha digitavel), expiraEm } */
async function emailInstrucoesPagamento(cliente, pedido, dados) {
  var primeiroNome = esc(((cliente && cliente.nome) || '').split(' ')[0]);
  var pix = dados.tipo === 'pix';
  var quando = dados.expiraEm ? new Date(dados.expiraEm).toLocaleString('pt-BR', {
    timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '';
  var html = moldura(
    '<p>Olá, ' + primeiroNome + '!</p>'
    + '<p>' + (pix ? 'Seu Pix' : 'Seu boleto') + ' do pedido <strong>#' + esc(pedido.numero) + '</strong> (' + brl(pedido.total) + ') está pronto.'
    + (pix ? ' Pague pelo app do seu banco com o QR Code ou o Pix copia e cola abaixo.' : ' Pague no app do banco, lotérica ou internet banking.') + '</p>'
    + (dados.link ? botao(dados.link, pix ? 'Abrir QR Code do Pix' : 'Abrir boleto') : '')
    + (dados.codigo
      ? '<p style="font-size:.8rem;color:#6b5f56;margin:0 0 4px;">' + (pix ? 'Pix copia e cola:' : 'Linha digitável:') + '</p>'
        + '<p style="font-size:.75rem;font-family:monospace;word-break:break-all;background:#f5f0e8;padding:10px;border-radius:6px;">' + esc(dados.codigo) + '</p>'
      : '')
    + (pix && quando ? '<p style="font-size:.85rem;color:#6b5f56;">O Pix vale até ' + esc(quando) + '.</p>' : '')
    + (!pix ? '<p style="font-size:.85rem;color:#6b5f56;">O boleto leva até 3 dias úteis para ser compensado. Assim que o pagamento cair, você recebe a confirmação.</p>' : '')
    + rodape(pedido)
  );
  return enviarEmail(cliente && cliente.email, (pix ? 'Seu Pix' : 'Seu boleto') + ' do pedido #' + pedido.numero + ' — Sítio Labareda', html);
}

/* 4. Pedido postado (marcado como "enviado" no painel): rastreio ao comprador. */
async function emailPedidoEnviado(cliente, pedido, tracking, rastreioUrl) {
  var primeiroNome = esc(((cliente && cliente.nome) || '').split(' ')[0]);
  var html = moldura(
    '<p>Olá, ' + primeiroNome + '!</p>'
    + '<p>Seu pedido <strong>#' + esc(pedido.numero) + '</strong> saiu para entrega! 📦</p>'
    + (tracking
      ? '<div style="background:#f5f0e8;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">'
        + '<p style="margin:0 0 8px;font-size:.85rem;color:#6b5f56;">Código de rastreamento</p>'
        + '<p style="font-size:1.3rem;font-weight:bold;letter-spacing:.15em;margin:0;">' + esc(tracking) + '</p>'
        + '</div>'
        + (rastreioUrl ? botao(rastreioUrl, 'Rastrear meu pedido') : '')
      : '')
    + (prazoTexto(pedido) ? '<p style="font-size:.9rem;"><strong>Previsão de entrega:</strong> ' + esc(prazoTexto(pedido)) + '</p>' : '')
    + '<p style="font-size:.85rem;color:#6b5f56;">Se o produto chegar avariado ou diferente do pedido, avise preferencialmente em até 48 horas pelo e-mail de atendimento, com fotos.</p>'
    + '<p style="font-size:.85rem;color:#6b5f56;">Acompanhe seu pedido em: <a href="' + esc(linkAcompanhar(siteUrl(), pedido.numero)) + '">' + esc(linkAcompanhar(siteUrl(), pedido.numero)) + '</a></p>'
    + rodape(pedido)
    + '<p style="font-size:.9rem;margin-top:20px;">Com carinho,<br>Equipe Sítio Labareda</p>'
  );
  return enviarEmail(cliente && cliente.email, 'Seu pedido #' + pedido.numero + ' saiu para entrega — Sítio Labareda', html);
}

module.exports = { enviarEmail, emailPedidoCriado, emailPagamentoAprovado, emailNotaFiscal, emailPedidoEnviado, emailInstrucoesPagamento };
