# Teste da loja: compra com nota fiscal

Roteiro para testar a compra de ponta a ponta (Story 2.2).

> ⚠️ É tudo real: cobra no Mercado Pago, paga a etiqueta no SuperFrete e emite nota fiscal com valor fiscal.
> O NFe+ desta conta emite **sempre em produção**: não existe nota de teste "sem valor fiscal".
> Por isso o teste usa um produto barato e, no final, tudo é desfeito.

## 1. Preparar (painel da loja)
- Configurações > Nota fiscal: clicar em **"Testar conexão com o NFe+"**. Deve aparecer "Conectado ao NFe+".
- Ambiente: **Produção**. Emissão: **Automática**. Salvar.
- Produtos: abrir o produto **mais barato** e preencher o **NCM** (do contador). Salvar.

## 2. Comprar no site (sitiolabareda.com)
- Colocar o produto no carrinho e finalizar.
- Usar **CPF real** (a nota sai no nome de quem compra) e um **e-mail que dê para abrir**.
- Escolher o frete e pagar (Pix é mais rápido).

## 3. Conferir
- **E-mail do comprador:** "Compra confirmada — Pedido #N" com o **DANFE (PDF) e o XML anexados**. Se a nota demorar, eles chegam num segundo e-mail, "Nota fiscal do pedido #N". Olhar também o spam.
- **E-mail da loja (sitiolabareda@gmail.com):** "VENDEU! Pedido #N" com a nota marcada como feita.
- **Painel > Pedidos > Ver:** bloco "Nota fiscal" **Autorizada**, com **Imprimir DANFE** e **Baixar XML**; histórico com pagamento, estoque, etiqueta, nota e e-mails.
- **Painel > Visão Geral:** nenhuma pendência. Se aparecer alguma, tirar print.
- **Telegram/WhatsApp:** o aviso da venda chega.

## 4. Desfazer (no mesmo dia)
- **NFe+:** cancelar a nota do pedido **em até 24h**. Pela integração não dá para cancelar.
- **SuperFrete:** cancelar a etiqueta (o saldo volta).
- **Mercado Pago:** estornar o pagamento. O sistema abre uma pendência lembrando de cancelar a nota.
- **Painel:** mudar o pedido para **Cancelado** (o estoque volta).

## 5. Retorno
Mandar o número do pedido e prints de qualquer erro.

## Se der errado
| O que aparece | O que fazer |
|---|---|
| Pendência "Faltam dados para emitir a nota: NCM…" | Preencher o NCM do produto e clicar em "Tentar novamente" na pendência |
| "O plano da conta NFe+ não tem acesso à API" | Conferir o plano do NFe+ |
| "NFEMAIS_TOKEN não configurado" | Cadastrar o token no projeto labareda-site da Vercel e fazer redeploy |
| "Ambiente Homologação selecionado…" | Mudar o Ambiente para Produção e clicar em "Tentar novamente" |
| "Nota rejeitada: Retorno NNN …" | Mandar o print: é regra da SEFAZ e pode precisar de ajuste do contador |
