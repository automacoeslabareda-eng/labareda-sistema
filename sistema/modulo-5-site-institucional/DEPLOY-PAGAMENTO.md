# Pagamento Mercado Pago — Site Labareda (Shop)

A loja é a seção **Shop** do site institucional (este módulo 5). O checkout já existia
(cliente + pedido + itens no Supabase); foi adicionada a cobrança real via Mercado Pago
(Checkout Pro) + webhook de confirmação.

## Arquivos desta integração

| Arquivo | Papel |
|---|---|
| `netlify/functions/criar-pagamento.js` | Recebe o `pedido_id` (que o site já criou), lê o pedido no banco e gera o link de pagamento do MP |
| `netlify/functions/webhook-mercadopago.js` | MP chama ao aprovar → marca pedido "pago", baixa estoque, dispara n8n (Telegram) |
| `src/app.js` (checkout-confirm) | Após criar o pedido, chama `criar-pagamento` e redireciona o cliente ao MP |
| `package.json` | Dependências: `mercadopago`, `@supabase/supabase-js` |
| `../../netlify.toml` (raiz) | Build com `npm install` + functions |

## Deploy (feito por @devops)

O site já é deployado pelo `netlify.toml` da raiz. Agora ele roda `npm install` e publica as functions.

### Variáveis de ambiente no Netlify (nomes EXATOS)

> IMPORTANTE: usamos nomes PRÓPRIOS da loja (`ECOMMERCE_...`) porque já existe
> uma variável `SUPABASE_URL` na Netlify apontando para o projeto de GESTÃO.

| Variável | Valor | Secreta? |
|---|---|---|
| `MP_ENV` | `teste` (troca para `producao` no go-live) | Não |
| `MP_ACCESS_TOKEN_TESTE` | Access Token de **teste** do MP (`APP_USR-...`) | 🔒 |
| `MP_ACCESS_TOKEN_PROD` | Access Token de produção (só após regenerar; vazio agora) | 🔒 |
| `ECOMMERCE_SUPABASE_URL` | `https://wgvqiguebiqhubhtwfhz.supabase.co` | Não |
| `ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY` | service_role do projeto Site-ecommerce (Supabase → Settings → API) | 🔒 |
| `SITE_URL` | URL pública do site (ex: `https://sitiolabareda.netlify.app`) | Não |
| `N8N_WEBHOOK_URL` | URL do fluxo n8n de venda (Telegram) — tarefa 3, opcional agora | Não |

### Webhook no painel do Mercado Pago
URL: `https://SEU-SITE/.netlify/functions/webhook-mercadopago` — evento **Pagamentos (payment)**.

## Teste (cartão de teste MP)
1. Site → seção Shop → adicionar produto → carrinho → Finalizar → preencher 3 passos → Confirmar.
2. Redireciona ao Mercado Pago. Cartão de teste aprovado: `5031 4332 1540 6351`, `11/30`, CVV `123`, nome `APRO`.
3. Volta ao site com `?pagamento=sucesso`. No dashboard admin (aba Pedidos) o pedido vira **pago** e o estoque baixa.

## Pendências
- [ ] Credenciais de teste do MP (cliente busca no painel)
- [ ] Fluxo n8n de venda → Telegram (tarefa 3). O webhook já envia o payload pronto
      (formato compatível com o webhook do módulo 1, `propriedade_id` da Labareda incluído).
- [ ] RLS desligado nas tabelas (segurança — tarefa separada)

---

## Atualização 05/11/2026 — Checkout transparente (cartão, Pix e boleto no site)

O cliente agora paga **dentro do site**, sem precisar de conta Mercado Pago:
o formulário de pagamento do Mercado Pago (Payment Brick) aparece no passo 3
do checkout, com as cores do sítio. Pix mostra QR Code + copia e cola e confirma
sozinho; boleto mostra o link e a linha digitável. A opção "Conta Mercado Pago"
continua disponível no mesmo formulário.

| Arquivo | Papel |
|---|---|
| `src/api/criar-pagamento.js` | Cria pedido + reserva + preferência; devolve chave pública e token do pedido. Exige `aceite_termos` |
| `src/api/processar-pagamento.js` | **Novo.** Recebe o formulário do Brick e cria o pagamento (cartão/Pix/boleto) com o valor do banco |
| `src/api/_pagador.js` | **Novo.** Nome, CPF, telefone e endereço no formato do MP (melhora aprovação sem conta MP) |
| `src/api/_whatsapp.js` | **Novo.** Mensagens ao comprador no WhatsApp (Pix/boleto, compra confirmada + termos + NF, postado + rastreio) |
| `src/termos-e-condicoes.pdf` | Termos de compra (link no checkout, nos e-mails e no WhatsApp) |

### Fluxo de avisos ao comprador
1. Pedido criado → e-mail com link reserva de pagamento.
2. Pix/boleto gerado → e-mail + WhatsApp com QR/boleto.
3. Pagamento aprovado → e-mail "Compra confirmada" (NF anexada se pronta) + WhatsApp (termos + NF + acompanhamento).
4. NF emitida depois → e-mail com DANFE/XML + WhatsApp com link do DANFE.
5. **Postado** → no painel, botão **"Postei — avisar cliente"** (ou status "enviado") → e-mail + WhatsApp "saiu para entrega" com rastreio.
   A etiqueta SuperFrete agora deixa o pedido em **preparando** (antes já marcava "enviado" sem ter postado).

### Variáveis de ambiente NOVAS (Vercel)
| Variável | Valor | Secreta? |
|---|---|---|
| `EVOLUTION_INSTANCE_TOKEN` | token da instância do celular do sítio na Evolution (apiwhats) | 🔒 |
| `EVOLUTION_API_URL` | opcional — padrão `https://apiwhats.sitiolabareda.com` | Não |
| `MP_PUBLIC_KEY_PROD` / `MP_PUBLIC_KEY_TESTE` | **Public Key da MESMA conta e ambiente do Access Token** (senão o formulário não carrega e cai no link do MP) | Não |

### No painel do Mercado Pago (conta do sítio) — obrigatório
- [ ] **Cadastrar uma chave Pix** na conta (sem isso o MP não gera Pix — nem no site, nem no Checkout Pro).
- [ ] Conferir `MP_ENV=producao` + `MP_ACCESS_TOKEN_PROD` + `MP_PUBLIC_KEY_PROD` da mesma aplicação.
      Com credenciais de teste, cartão real/"sem conta" falha — é o sintoma relatado.
- [ ] (Opcional) Seu negócio → logo e nome da loja: aparecem no Checkout Pro e no comprovante.
