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
