-- Migration: Estoque por tamanho (variantes) na tabela produtos
-- Projeto: Site-ecommerce (wgvqiguebiqhubhtwfhz)
-- Migration name: add_produto_variantes_estoque
--
-- Como rodar:
-- 1. Entre no painel do Supabase do projeto "Site-ecommerce".
-- 2. Va em SQL Editor > New query.
-- 3. Cole o bloco abaixo e clique em "Run".
-- Nao precisa fazer mais nada depois disso — o preenchimento dos
-- numeros por tamanho e o resto do codigo ja estao prontos e vao
-- funcionar assim que essa coluna existir.

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS variantes_estoque JSONB DEFAULT NULL;

COMMENT ON COLUMN produtos.variantes_estoque IS
  'Estoque por tamanho quando o produto tem variantes, ex: {"P":2,"M":4,"G":2,"GG":9}. NULL = produto sem tamanho (usa so a coluna estoque, comportamento antigo preservado).';

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS tamanho TEXT DEFAULT NULL;

COMMENT ON COLUMN pedido_itens.tamanho IS
  'Tamanho escolhido (P/M/G/GG) quando o produto tem variantes_estoque. NULL para produtos sem tamanho.';

-- STATUS: ambas as colunas ja foram aplicadas em produtos e em pedido_itens
-- (2026-09-03, via MCP, apos reconexao do plugin Supabase a este projeto).
-- Os dados por tamanho dos 7 produtos com variante ja foram populados
-- de acordo com atualizacoes/estoque labareda.md.
