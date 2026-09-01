-- Migration: Adicionar dimensões de frete na tabela produtos
-- EXECUTADA no Supabase em 2026-08-31 via MCP
-- Projeto: Site-ecommerce (wgvqiguebiqhubhtwfhz)
-- Migration name: add_produto_dimensoes_frete

-- DDL: novas colunas
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS frete_altura NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS frete_largura NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS frete_comprimento NUMERIC DEFAULT NULL;

COMMENT ON COLUMN produtos.frete_altura IS 'Altura da embalagem em cm para calculo de frete';
COMMENT ON COLUMN produtos.frete_largura IS 'Largura da embalagem em cm para calculo de frete';
COMMENT ON COLUMN produtos.frete_comprimento IS 'Comprimento da embalagem em cm para calculo de frete';

-- DATA: dimensões preenchidas para todos os 26 produtos
-- COSMETICOS
UPDATE produtos SET frete_altura=7, frete_largura=7, frete_comprimento=18 WHERE slug='creme';
UPDATE produtos SET frete_altura=7, frete_largura=7, frete_comprimento=10 WHERE slug='desodorante';
UPDATE produtos SET frete_altura=5, frete_largura=5, frete_comprimento=12, peso_gramas=COALESCE(peso_gramas,200) WHERE slug='oleo-corporal-mata-atlantica';
UPDATE produtos SET frete_altura=5, frete_largura=8, frete_comprimento=12, peso_gramas=COALESCE(peso_gramas,150) WHERE slug='sabonete-cacau-lavanda';

-- VESTUARIO - Bones
UPDATE produtos SET frete_altura=12, frete_largura=20, frete_comprimento=28, peso_gramas=COALESCE(peso_gramas,100) WHERE slug IN ('bone-labareda','bone-estrela-labareda');

-- VESTUARIO - Camisetas manga curta
UPDATE produtos SET frete_altura=5, frete_largura=22, frete_comprimento=30, peso_gramas=COALESCE(peso_gramas,250) WHERE slug IN ('cine-jangada-azul','cine-jangada-branca','labareda-off-white','labareda-preta','camiseta-tropicalia');

-- VESTUARIO - Camisetas manga longa
UPDATE produtos SET frete_altura=6, frete_largura=24, frete_comprimento=32, peso_gramas=COALESCE(peso_gramas,350) WHERE slug IN ('labareda-manga-longa-off-white','labareda-manga-longa-preta');

-- VESTUARIO - Camisa linho
UPDATE produtos SET frete_altura=5, frete_largura=24, frete_comprimento=32, peso_gramas=COALESCE(peso_gramas,250) WHERE slug='camisa-linho-serra-grande';

-- VESTUARIO - Vestido
UPDATE produtos SET frete_altura=6, frete_largura=24, frete_comprimento=32, peso_gramas=COALESCE(peso_gramas,300) WHERE slug='vestido-mandala-cacau';

-- ART - Prints 65x43 (tubo postal)
UPDATE produtos SET frete_altura=8, frete_largura=8, frete_comprimento=70 WHERE slug IN ('mojacaye-arun-shangri-la-1','mojacaye-arun-shangri-la-2','farol-celeste');

-- ART - Prints 72x24 (tubo postal)
UPDATE produtos SET frete_altura=8, frete_largura=8, frete_comprimento=77 WHERE slug IN ('mojacaye-arun-jangada-1','mojacaye-arun-jangada-2');

-- ART - Rosa Salgada 66x44 (tubo postal)
UPDATE produtos SET frete_altura=8, frete_largura=8, frete_comprimento=71 WHERE slug='rosa-salgada';

-- ART - Poster 50x70 (tubo postal)
UPDATE produtos SET frete_altura=8, frete_largura=8, frete_comprimento=75, peso_gramas=COALESCE(peso_gramas,120) WHERE slug='poster-roca-arte';

-- ART - Xilogravura
UPDATE produtos SET frete_altura=8, frete_largura=8, frete_comprimento=55, peso_gramas=COALESCE(peso_gramas,100) WHERE slug='xilogravura-mulheres-cacau';

-- ALIMENTOS
UPDATE produtos SET frete_altura=5, frete_largura=10, frete_comprimento=15, peso_gramas=COALESCE(peso_gramas,120) WHERE slug='chocolate-70-cacau';
UPDATE produtos SET frete_altura=8, frete_largura=8, frete_comprimento=12, peso_gramas=COALESCE(peso_gramas,350) WHERE slug='geleia-cupuacu';
UPDATE produtos SET frete_altura=10, frete_largura=8, frete_comprimento=12, peso_gramas=COALESCE(peso_gramas,500) WHERE slug='mel-silvestre-serra-grande';
