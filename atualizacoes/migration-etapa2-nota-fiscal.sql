-- Migration: Etapa 2 da operacao da loja — emissao de NOTA FISCAL (NF-e)
-- Briefing squads/site.md, secao 3. Integracao fiscal: NFe+ (NFeMais).
-- Projeto: Site-ecommerce (wgvqiguebiqhubhtwfhz)
-- Rodar no Supabase > SQL Editor DEPOIS da etapa 1
-- (migration-etapa1-base-pedidos.sql). Pode rodar mais de uma vez.
--
-- O que entra:
--  1. produtos: dados fiscais por produto (NCM, origem, unidade, CEST, GTIN).
--  2. config_fiscal: dados do emitente e regras tributarias (1 linha so),
--     editados no painel em Configuracoes > Nota fiscal.
--  3. pedidos: situacao da nota de cada pedido (numero, chave, arquivos).
--  4. pedido_pendencias: novo tipo 'nota_fiscal' (falha com "tentar de novo").
--  5. Bucket privado 'notas-fiscais' no Storage (XML + DANFE de cada nota).
--
-- O codigo do site funciona sem esta migration: a emissao fica desligada e
-- o painel avisa que falta atualizar o banco.

-- ------------------------------------------------------------------
-- 1. Dados fiscais do produto
-- ------------------------------------------------------------------
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS ncm TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS origem_fiscal SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidade_fiscal TEXT NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS cest TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gtin TEXT DEFAULT NULL;
COMMENT ON COLUMN produtos.ncm IS 'NCM (8 digitos) — informado pelo contador. Sem NCM a nota nao e emitida';
COMMENT ON COLUMN produtos.origem_fiscal IS 'Origem da mercadoria (tabela ICMS): 0 = nacional';
COMMENT ON COLUMN produtos.unidade_fiscal IS 'Unidade comercial/tributavel na nota (UN, KG, PC...)';
COMMENT ON COLUMN produtos.cest IS 'CEST (so para produtos sujeitos a substituicao tributaria)';
COMMENT ON COLUMN produtos.gtin IS 'Codigo de barras EAN/GTIN; vazio = SEM GTIN';

-- ------------------------------------------------------------------
-- 2. Configuracao fiscal (emitente + regras) — linha unica id = 1
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_fiscal (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- desligado: nada e emitido | manual: so pelo botao do painel |
  -- automatico: emite sozinho quando o pagamento e aprovado
  modo TEXT NOT NULL DEFAULT 'desligado' CHECK (modo IN ('desligado', 'manual', 'automatico')),
  ambiente SMALLINT NOT NULL DEFAULT 2 CHECK (ambiente IN (1, 2)), -- 1 producao | 2 homologacao
  -- Emitente
  cnpj TEXT, razao_social TEXT, nome_fantasia TEXT,
  inscricao_estadual TEXT, inscricao_municipal TEXT,
  logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT,
  cidade TEXT, cod_municipio TEXT, uf TEXT DEFAULT 'BA', cep TEXT, telefone TEXT,
  -- Regras tributarias (confirmar com o contador)
  crt SMALLINT NOT NULL DEFAULT 1 CHECK (crt IN (1, 2, 3, 4)), -- 1 Simples | 2 Simples excesso | 3 Normal | 4 MEI
  serie INTEGER NOT NULL DEFAULT 1,
  natureza_operacao TEXT NOT NULL DEFAULT 'Venda de mercadoria',
  cfop_dentro_uf TEXT NOT NULL DEFAULT '5102',
  cfop_fora_uf TEXT NOT NULL DEFAULT '6102',
  csosn TEXT NOT NULL DEFAULT '102',          -- Simples Nacional (CRT 1, 2, 4)
  cst_icms TEXT NOT NULL DEFAULT '00',        -- Regime normal (CRT 3)
  aliquota_icms NUMERIC NOT NULL DEFAULT 0,   -- Regime normal (CRT 3), % dentro da UF
  aliquota_icms_fora_uf NUMERIC NOT NULL DEFAULT 0, -- Regime normal (CRT 3), % interestadual
  aliquota_credito_sn NUMERIC NOT NULL DEFAULT 0,   -- CSOSN 101: % de credito
  cst_pis TEXT NOT NULL DEFAULT '49',
  aliquota_pis NUMERIC NOT NULL DEFAULT 0,
  cst_cofins TEXT NOT NULL DEFAULT '49',
  aliquota_cofins NUMERIC NOT NULL DEFAULT 0,
  informacoes_complementares TEXT,
  aliquotas_internas_uf JSONB,                -- DIFAL: sobrescreve a aliquota interna de alguma UF, ex.: {"SP": 18}
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
COMMENT ON TABLE config_fiscal IS 'Dados do emitente e regras tributarias da NF-e (linha unica). Validar com o contador';
ALTER TABLE config_fiscal ADD COLUMN IF NOT EXISTS aliquotas_internas_uf JSONB;
-- autXML (exigido pela SEFAZ-BA): CNPJ do escritorio de contabilidade ou,
-- sem ele, o da propria SEFAZ-BA (padrao, igual as notas do painel do NFe+).
ALTER TABLE config_fiscal ADD COLUMN IF NOT EXISTS cnpj_autxml TEXT NOT NULL DEFAULT '13937073000156';
-- Dados do emitente como cadastrados na conta NFe+ e tributacao igual a da
-- nota de teste autorizada pelo contador em 03/11/2026 (CSOSN 102, PIS/COFINS 08).
INSERT INTO config_fiscal (id, cnpj, razao_social, nome_fantasia, inscricao_estadual, logradouro, numero, complemento,
    bairro, cidade, cod_municipio, uf, cep, crt, natureza_operacao, csosn, cst_pis, cst_cofins)
  VALUES (1, '61691405000108', 'SITIO LABAREDA POUSADA E HOSPEDAGEM LTDA', 'SITIO LABAREDA', '233156974',
    'RODOVIA BA 001', 'S/N', 'KM 39,5', 'DISTRITO - SERRA GRANDE', 'Uruçuca', '2932705', 'BA', '45680000', 1,
    'Venda de mercadoria adquirida ou recebida de terceiros', '102', '08', '08')
  ON CONFLICT (id) DO NOTHING;
-- So o servidor (service_role) le/escreve.
ALTER TABLE config_fiscal ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------
-- 3. Nota fiscal do pedido
-- ------------------------------------------------------------------
ALTER TABLE pedidos
  -- NULL (nao emitida) | processando | autorizada | rejeitada | erro | cancelada
  ADD COLUMN IF NOT EXISTS nfe_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_codigo INTEGER DEFAULT NULL,   -- id da nota no NFe+
  ADD COLUMN IF NOT EXISTS nfe_numero INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_serie INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_chave TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_ambiente SMALLINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_xml_path TEXT DEFAULT NULL,    -- Storage: notas-fiscais/...
  ADD COLUMN IF NOT EXISTS nfe_danfe_path TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_erro TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_autorizada_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_email_enviado_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nfe_atualizada_at TIMESTAMPTZ DEFAULT NULL;
COMMENT ON COLUMN pedidos.nfe_status IS 'Situacao da NF-e: processando | autorizada | rejeitada | erro | cancelada (NULL = nao emitida)';
COMMENT ON COLUMN pedidos.nfe_email_enviado_at IS 'Quando a nota foi enviada ao comprador — nunca envia duas vezes';

-- ------------------------------------------------------------------
-- 4. Pendencia do tipo nota_fiscal
-- ------------------------------------------------------------------
ALTER TABLE pedido_pendencias DROP CONSTRAINT IF EXISTS pedido_pendencias_tipo_check;
ALTER TABLE pedido_pendencias ADD CONSTRAINT pedido_pendencias_tipo_check
  CHECK (tipo IN ('etiqueta', 'email_confirmacao', 'aviso_equipe', 'estoque', 'pagamento', 'nota_fiscal'));

-- ------------------------------------------------------------------
-- 5. Storage privado para XML e DANFE
-- ------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('notas-fiscais', 'notas-fiscais', FALSE)
  ON CONFLICT (id) DO NOTHING;
