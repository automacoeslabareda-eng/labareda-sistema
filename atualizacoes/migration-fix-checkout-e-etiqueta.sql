-- Migration: corrige checkout quebrado (frete) e rastreio/etiqueta quebrados
-- Projeto: Site-ecommerce (wgvqiguebiqhubhtwfhz)
-- Ja aplicada em producao via MCP em 2026-09-03.
--
-- BUG 1: criar-pagamento.js grava frete_service_id/frete_service_name no
-- pedido (pra usar depois na etiqueta), mas essas colunas nunca existiram.
-- Toda vez que o cliente escolhia um frete calculado pelo SuperFrete, o
-- checkout quebrava com erro 500 ("Could not find the 'frete_service_id'
-- column of 'pedidos' in the schema cache").
--
-- BUG 2: TODO o codigo de rastreio/etiqueta (dashboard, admin-api.js,
-- consultar-pedido.js, pedido.html, gerar-etiqueta.js) sempre usou os
-- nomes codigo_rastreio/rastreio_url, mas as colunas reais da tabela
-- se chamavam rastreamento_codigo/rastreamento_url. Ou seja, salvar ou
-- mostrar o codigo de rastreio nunca funcionou, em lugar nenhum.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS frete_service_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS frete_service_name TEXT DEFAULT NULL;
COMMENT ON COLUMN pedidos.frete_service_id IS 'ID do servico de frete escolhido no SuperFrete (1=PAC, 2=SEDEX, 17=Mini Envios etc), usado por gerar-etiqueta.js';
COMMENT ON COLUMN pedidos.frete_service_name IS 'Nome do servico de frete escolhido pelo cliente no checkout (ex: PAC, SEDEX)';

ALTER TABLE pedidos RENAME COLUMN rastreamento_codigo TO codigo_rastreio;
ALTER TABLE pedidos RENAME COLUMN rastreamento_url TO rastreio_url;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS superfrete_order_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS etiqueta_url TEXT DEFAULT NULL;
COMMENT ON COLUMN pedidos.superfrete_order_id IS 'ID do pedido/envio criado no SuperFrete';
COMMENT ON COLUMN pedidos.etiqueta_url IS 'URL da etiqueta de envio (PDF) gerada no SuperFrete';
