# ARCH-001 — Arquitetura Tecnica: Modulos 1 e 6 (Gestao de Equipes)

**Projeto:** Sistema Sitio Labareda
**Modulos:** M1 (Gestao de Equipes — Labareda) + M6 (Sistema Sao Miguel)
**Autor:** Aria (@architect)
**Data:** 2026-07-01
**Revisao:** 2026-07-01 (v2.0 — banco unificado com propriedade_id)
**Status:** DRAFT
**PRD Ref:** PRD-001, FR-1.1 a FR-1.7, FR-6.1 a FR-6.5
**Stack:** Supabase self-hosted, n8n self-hosted, Telegram Bot API, Evolution API, LLM API

---

## 1. Diagrama de Arquitetura

### 1.1 Visao Geral do Sistema

```
                         MARCOS (operador)
                              |
                    +---------+---------+
                    |                   |
              BOT LABAREDA        BOT SAO MIGUEL
              (Telegram)          (Telegram)
                    |                   |
                    v                   v
            +-------------+    +-------------+
            | n8n Workflow |    | n8n Workflow |
            | (labareda)   |    | (sao_miguel) |
            +------+------+    +------+------+
                   |                   |
                   |  PROPRIEDADE_ID   |
                   |  identifica       |
                   v                   v
              +----------------------------+
              |        Supabase            |
              |   Banco UNIFICADO (public) |
              |   propriedade_id em cada   |
              |   tabela de dados          |
              +-------------+--------------+
                            |
                            v
                  +-------------------+
                  |   Evolution API   |
                  |   (WhatsApp)      |
                  +--------+----------+
                           |
              +------------+------------+
              v                         v
        COLABORADORES             COLABORADORES
        LABAREDA                  SAO MIGUEL
        (painel web +             (painel web +
         WhatsApp)                 WhatsApp)
```

### 1.2 Fluxo Detalhado — Comando ate Execucao

```
+------------------+     +------------------+     +------------------+
|   1. TELEGRAM    |     |    2. n8n         |     |    3. LLM        |
|                  |     |                   |     |                  |
| Marcos envia:    |---->| Webhook recebe    |---->| Interpreta:      |
| "Jardinagem:    |     | mensagem          |     | - setor          |
|  podar palmeiras |     | Identifica        |     | - acao           |
|  e regar horta"  |     | propriedade       |     | - checklist items|
|                  |     | (pelo bot token)  |     |                  |
+------------------+     +------------------+     +------------------+
                                                          |
                                                          v
+------------------+     +------------------+     +------------------+
|   6. TELEGRAM    |     |   5. EVOLUTION   |     |   4. SUPABASE    |
|                  |     |      API         |     |                  |
| Marcos recebe    |<----| Dispara WhatsApp |<----| Grava com        |
| confirmacao de   |     | para cada        |     | propriedade_id:  |
| disparo          |     | colaborador do   |     | - tarefa         |
|                  |     | setor            |     | - checklist_items|
|                  |     |                  |     | - vincula colab. |
+------------------+     +------------------+     +------------------+
                                                          |
                                                          v
+------------------+     +------------------+     +------------------+
|   9. TELEGRAM    |     |   8. SUPABASE    |     |   7. PAINEL WEB  |
|                  |     |                  |     |                  |
| Marcos recebe    |<----| Atualiza status  |<----| Colaborador      |
| notificacao de   |     | do item          |     | marca item como  |
| conclusao        |     | Verifica se      |     | concluido +      |
|                  |     | tarefa completa  |     | observacoes      |
+------------------+     +------------------+     +------------------+
```

### 1.3 Fluxo de Relatorio Semanal

```
+------------------+     +------------------+     +------------------+
|   1. CRON n8n    |     |   2. SUPABASE    |     |   3. n8n         |
|                  |     |                  |     |                  |
| Domingo 20:00   |---->| Query consolida  |---->| Gera PDF com:    |
| Trigger semanal  |     | por propriedade: |     | - resumo geral   |
| (1 por propried.)|     | - tarefas/semana |     | - por setor      |
|                  |     | - % conclusao    |     | - pendencias     |
|                  |     | - observacoes    |     | - observacoes    |
+------------------+     +------------------+     +------+-----------+
                                                         |
                                                         v
                                                  +------------------+
                                                  |   4. TELEGRAM    |
                                                  |                  |
                                                  | Envia PDF para   |
                                                  | Marcos via bot   |
                                                  | da propriedade   |
                                                  | Salva em Supabase|
                                                  | Storage          |
                                                  +------------------+
```

---

## 2. Estrategia de Isolamento: Labareda vs Sao Miguel

### 2.1 Decisao Arquitetural

**Abordagem escolhida: Banco de dados UNIFICADO com coluna `propriedade_id` (schema public)**

| Opcao Avaliada | Pros | Contras | Decisao |
|----------------|------|---------|---------|
| A. Tenant ID (propriedade_id) | Simples de manter, schema unico, queries diretas, Dashboard futuro facil | Precisa garantir WHERE propriedade_id em toda query | **ESCOLHIDA** |
| B. Schemas separados | Isolamento fisico por schema | Duplicacao de DDL, migrations por schema, overhead operacional | REJEITADA |
| C. Instancias separadas | Isolamento maximo | Custo dobrado VPS, overhead operacional | REJEITADA (overkill) |

### 2.2 Justificativa

1. **Simplicidade de manutencao:** Um unico schema, um unico set de migrations, um unico DDL
2. **Isolamento natural na entrada:** Bots do Telegram sao separados — cada bot identifica automaticamente a propriedade. O isolamento comeca no ponto de entrada, nao no banco
3. **Dashboard futuro (Modulo 4):** Marcos podera alternar entre propriedades ou ver dados consolidados de todas as propriedades no mesmo painel, sem queries cross-schema
4. **Migracoes futuras facilitadas:** Se algum dia precisar separar fisicamente, basta exportar dados filtrados por `propriedade_id` para outro banco
5. **Menos complexidade operacional:** Sem `SET search_path`, sem duplicacao de triggers/functions/views, sem script wrapper de migrations
6. **Tabela `propriedades` centraliza config:** Bot token, chat ID do Marcos, dados da Evolution API — tudo na tabela `propriedades`, eliminando a necessidade de key-value em `configuracoes` para dados de infraestrutura por propriedade

### 2.3 Estrutura do Schema

```
PostgreSQL (Supabase self-hosted)
|
+-- schema: public (unico)
    +-- propriedades          (tabela master — Labareda, Sao Miguel, futuras)
    +-- setores               (jardinagem, limpeza, servico_quarto, etc.)
    +-- colaboradores         (com propriedade_id FK)
    +-- tarefas               (com propriedade_id FK)
    +-- checklist_items       (com propriedade_id FK)
    +-- rotinas_semanais      (com propriedade_id FK)
    +-- rotina_items          (com propriedade_id FK)
    +-- relatorios_semanais   (com propriedade_id FK)
    +-- configuracoes         (com propriedade_id FK)
```

### 2.4 Regras de Isolamento

- Cada n8n workflow recebe o `PROPRIEDADE_ID` da propriedade que opera (derivado do bot token recebido)
- Toda query SQL inclui `WHERE propriedade_id = $propriedade_id`
- Supabase service_role key e compartilhada; cada workflow filtra por propriedade_id
- Nenhuma query mistura dados de propriedades diferentes (exceto views consolidadas futuras para Dashboard do Marcos)
- Painel do colaborador recebe URL com propriedade: `painel.labareda.com.br` vs `painel.saomiguel.com.br` (ou parametro na URL)
- Relatorios PDF identificam a propriedade no cabecalho
- **Lookup da propriedade pelo bot token:** O workflow n8n identifica qual propriedade esta sendo operada atraves do bot token do webhook recebido, consultando `propriedades.telegram_bot_token`

---

## 3. Schema do Banco de Dados

### 3.1 Diagrama Entidade-Relacionamento

```
propriedades (tabela master)
    |
    | propriedade_id (FK em todas as tabelas)
    |
    +-- setores (lookup, compartilhado entre propriedades)
    |       |
    |       | setor_id (FK)
    |       v
    +-- colaboradores ----< tarefas ----< checklist_items
    |       |                  |               |
    |       | colaborador_id   | tarefa_id     | item_id
    |       |                  |               |
    |       +------------------+               |
    |       | (colaborador_id FK               |
    |       |  em checklist_items)             |
    |       |                                  |
    +-- rotinas_semanais ----< rotina_items   |
    |       |                      |           |
    |       | rotina_id            |           |
    |       |                      +-----------+
    |       |                      (template para checklist_items)
    |       |
    +-- relatorios_semanais
    |       |
    |       | periodo, dados consolidados
    |
    +-- configuracoes (key-value por propriedade)
```

### 3.2 SQL — Tabela de Propriedades (Master)

```sql
-- ============================================================
-- TABELA MASTER: PROPRIEDADES
-- Centraliza dados de cada propriedade gerenciada pelo sistema
-- ============================================================

CREATE TABLE propriedades (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome                TEXT NOT NULL,                  -- 'Sitio Labareda', 'Sitio Sao Miguel'
    slug                TEXT NOT NULL UNIQUE,           -- 'labareda', 'sao_miguel'
    telegram_bot_token  TEXT NOT NULL,                  -- token do bot Telegram desta propriedade
    telegram_chat_id    TEXT NOT NULL,                  -- chat ID do Marcos para esta propriedade
    evolution_api_url   TEXT,                           -- URL da Evolution API
    evolution_api_key   TEXT,                           -- API key da Evolution API
    evolution_instance  TEXT,                           -- nome da instancia Evolution
    relatorio_dia_semana INTEGER DEFAULT 0,             -- dia do relatorio semanal (0=dom)
    relatorio_hora      TIME DEFAULT '20:00',           -- hora do relatorio semanal
    lembrete_hora       TIME DEFAULT '08:00',           -- hora dos lembretes diarios
    ativo               BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_propriedades_slug ON propriedades(slug);
CREATE UNIQUE INDEX idx_propriedades_bot_token ON propriedades(telegram_bot_token);

-- Seed: propriedades iniciais
INSERT INTO propriedades (nome, slug, telegram_bot_token, telegram_chat_id) VALUES
    ('Sitio Labareda',    'labareda',    '',  ''),
    ('Sitio Sao Miguel',  'sao_miguel',  '',  '');
```

### 3.3 SQL — Tabela de Setores (Lookup compartilhado)

```sql
-- ============================================================
-- SETORES (lookup table compartilhada entre propriedades)
-- ============================================================

CREATE TABLE setores (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome        TEXT NOT NULL UNIQUE,       -- 'jardinagem', 'limpeza', 'servico_quarto', 'manutencao', 'cozinha'
    descricao   TEXT,
    icone       TEXT,                        -- emoji ou icon name para UI
    ativo       BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed data
INSERT INTO setores (nome, descricao, icone) VALUES
    ('jardinagem',      'Jardinagem, poda, rega, paisagismo',           '🌿'),
    ('limpeza',         'Limpeza geral, areas comuns, piscina',         '🧹'),
    ('servico_quarto',  'Arrumacao de quartos, troca de roupa de cama', '🛏️'),
    ('manutencao',      'Reparos, eletrica, hidraulica',                '🔧'),
    ('cozinha',         'Preparo de refeicoes, cafe, organizacao',      '🍳');
```

### 3.4 SQL — Tabelas de Dados (todas com propriedade_id)

```sql
-- ============================================================
-- TABELAS DE DADOS — SCHEMA PUBLIC, UNIFICADO
-- Todas as tabelas possuem propriedade_id NOT NULL
-- ============================================================

-- 1. COLABORADORES
-- Registro de cada pessoa que trabalha em uma propriedade.
CREATE TABLE colaboradores (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    propriedade_id  UUID NOT NULL REFERENCES propriedades(id),
    nome            TEXT NOT NULL,
    telefone        TEXT NOT NULL,                  -- formato: +5573999999999
    funcao          TEXT NOT NULL,                  -- funcao primaria (ex: 'jardineiro', 'camareira')
    setor_id        UUID NOT NULL REFERENCES setores(id),
    whatsapp_jid    TEXT,                           -- JID do WhatsApp (preenchido pela Evolution API)
    ativo           BOOLEAN DEFAULT true,
    observacoes     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT telefone_format CHECK (telefone ~ '^\+\d{10,15}$')
);

CREATE INDEX idx_colaboradores_propriedade ON colaboradores(propriedade_id);
CREATE INDEX idx_colaboradores_setor ON colaboradores(setor_id);
CREATE INDEX idx_colaboradores_ativo ON colaboradores(propriedade_id, ativo) WHERE ativo = true;
CREATE UNIQUE INDEX idx_colaboradores_telefone ON colaboradores(telefone);


-- 2. TAREFAS
-- Cada comando do Marcos gera uma tarefa. A tarefa agrupa checklist items.
CREATE TABLE tarefas (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    propriedade_id      UUID NOT NULL REFERENCES propriedades(id),
    comando_original    TEXT NOT NULL,              -- texto exato enviado pelo Marcos no Telegram
    setor_interpretado  TEXT NOT NULL,              -- setor identificado pelo LLM
    setor_id            UUID NOT NULL REFERENCES setores(id),
    status              TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
    prioridade          TEXT DEFAULT 'normal'
                        CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
    data_limite         DATE,                       -- prazo opcional
    telegram_message_id BIGINT,                     -- ID da mensagem original no Telegram
    telegram_chat_id    BIGINT,                     -- chat ID do Marcos
    origem              TEXT DEFAULT 'comando'
                        CHECK (origem IN ('comando', 'rotina')),  -- se veio de comando manual ou rotina automatica
    rotina_id           UUID,                       -- referencia a rotina se origem='rotina'
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    concluida_at        TIMESTAMPTZ                 -- timestamp de conclusao (todos items feitos)
);

CREATE INDEX idx_tarefas_propriedade ON tarefas(propriedade_id);
CREATE INDEX idx_tarefas_status ON tarefas(propriedade_id, status);
CREATE INDEX idx_tarefas_setor ON tarefas(setor_id);
CREATE INDEX idx_tarefas_created ON tarefas(created_at DESC);
CREATE INDEX idx_tarefas_origem_rotina ON tarefas(origem, rotina_id) WHERE origem = 'rotina';


-- 3. CHECKLIST_ITEMS
-- Itens individuais de uma tarefa. Cada item e atribuido a um colaborador.
CREATE TABLE checklist_items (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    propriedade_id      UUID NOT NULL REFERENCES propriedades(id),
    tarefa_id           UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    colaborador_id      UUID REFERENCES colaboradores(id),  -- NULL = nao atribuido ainda
    descricao           TEXT NOT NULL,              -- "Podar as palmeiras da entrada"
    ordem               INTEGER DEFAULT 0,          -- ordem de exibicao
    status              TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'bloqueado')),
    observacao          TEXT,                        -- observacao do colaborador ao concluir
    foto_url            TEXT,                        -- URL da foto de comprovacao (Supabase Storage)
    whatsapp_enviado    BOOLEAN DEFAULT false,       -- se ja foi disparado via WhatsApp
    whatsapp_enviado_at TIMESTAMPTZ,
    concluido_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_checklist_propriedade ON checklist_items(propriedade_id);
CREATE INDEX idx_checklist_tarefa ON checklist_items(tarefa_id);
CREATE INDEX idx_checklist_colaborador ON checklist_items(colaborador_id);
CREATE INDEX idx_checklist_status ON checklist_items(propriedade_id, status);
CREATE INDEX idx_checklist_pendentes ON checklist_items(colaborador_id, status)
    WHERE status IN ('pendente', 'em_andamento');


-- 4. ROTINAS_SEMANAIS
-- Templates de rotina recorrente. Cada rotina gera tarefas automaticamente.
CREATE TABLE rotinas_semanais (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    propriedade_id  UUID NOT NULL REFERENCES propriedades(id),
    nome            TEXT NOT NULL,                  -- "Rotina Jardinagem Segunda-feira"
    setor_id        UUID NOT NULL REFERENCES setores(id),
    dia_semana      INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
                                                    -- 0=domingo, 1=segunda ... 6=sabado
    hora_disparo    TIME NOT NULL DEFAULT '07:00',  -- hora em que dispara
    ativo           BOOLEAN DEFAULT true,
    descricao       TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rotinas_propriedade ON rotinas_semanais(propriedade_id);
CREATE INDEX idx_rotinas_setor ON rotinas_semanais(setor_id);
CREATE INDEX idx_rotinas_dia ON rotinas_semanais(propriedade_id, dia_semana) WHERE ativo = true;


-- 5. ROTINA_ITEMS
-- Itens template de cada rotina. Servem de molde para gerar checklist_items.
CREATE TABLE rotina_items (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    propriedade_id  UUID NOT NULL REFERENCES propriedades(id),
    rotina_id       UUID NOT NULL REFERENCES rotinas_semanais(id) ON DELETE CASCADE,
    descricao       TEXT NOT NULL,                  -- "Regar horta organica"
    ordem           INTEGER DEFAULT 0,
    colaborador_id  UUID REFERENCES colaboradores(id),  -- colaborador padrao para este item
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rotina_items_propriedade ON rotina_items(propriedade_id);
CREATE INDEX idx_rotina_items_rotina ON rotina_items(rotina_id);


-- 6. RELATORIOS_SEMANAIS
-- Relatorio consolidado gerado automaticamente toda semana.
CREATE TABLE relatorios_semanais (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    propriedade_id  UUID NOT NULL REFERENCES propriedades(id),
    semana_inicio   DATE NOT NULL,                  -- segunda-feira da semana
    semana_fim      DATE NOT NULL,                  -- domingo da semana
    dados_json      JSONB NOT NULL,                 -- dados consolidados para geracao do PDF
                                                    -- estrutura: { por_setor: [...], totais: {...}, observacoes: [...] }
    pdf_url         TEXT,                            -- URL do PDF no Supabase Storage
    pdf_gerado_at   TIMESTAMPTZ,
    telegram_enviado BOOLEAN DEFAULT false,
    telegram_enviado_at TIMESTAMPTZ,
    total_tarefas       INTEGER DEFAULT 0,
    tarefas_concluidas  INTEGER DEFAULT 0,
    tarefas_pendentes   INTEGER DEFAULT 0,
    percentual_conclusao NUMERIC(5,2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT semana_valida CHECK (semana_fim > semana_inicio)
);

CREATE INDEX idx_relatorios_propriedade ON relatorios_semanais(propriedade_id);
CREATE UNIQUE INDEX idx_relatorios_semana ON relatorios_semanais(propriedade_id, semana_inicio);
CREATE INDEX idx_relatorios_created ON relatorios_semanais(created_at DESC);


-- 7. CONFIGURACOES
-- Configuracoes extras especificas por propriedade (key-value).
-- Nota: configs de infraestrutura (bot token, Evolution, etc.) estao na tabela propriedades.
-- Esta tabela e para configs adicionais/customizaveis.
CREATE TABLE configuracoes (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    propriedade_id  UUID NOT NULL REFERENCES propriedades(id),
    chave           TEXT NOT NULL,                   -- 'lembrete_texto_padrao', 'max_items_por_tarefa', etc.
    valor           TEXT NOT NULL,
    descricao       TEXT,
    tipo            TEXT DEFAULT 'text'
                    CHECK (tipo IN ('text', 'number', 'boolean', 'json')),
    sensivel        BOOLEAN DEFAULT false,           -- se true, valor e mascarado no painel
    updated_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT configuracoes_unica_por_propriedade UNIQUE (propriedade_id, chave)
);

CREATE INDEX idx_configuracoes_propriedade ON configuracoes(propriedade_id);
```

### 3.5 SQL — Funcoes e Triggers

```sql
-- ============================================================
-- FUNCOES UTILITARIAS (database functions)
-- ============================================================

-- Funcao: calcular percentual de conclusao de uma tarefa
CREATE OR REPLACE FUNCTION calcular_percentual_tarefa(p_tarefa_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_total INTEGER;
    v_concluidos INTEGER;
BEGIN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'concluido')
    INTO v_total, v_concluidos
    FROM checklist_items
    WHERE tarefa_id = p_tarefa_id;

    IF v_total = 0 THEN RETURN 0; END IF;
    RETURN ROUND((v_concluidos::NUMERIC / v_total) * 100, 2);
END;
$$ LANGUAGE plpgsql STABLE;


-- Funcao: verificar se tarefa esta 100% concluida e atualizar status
CREATE OR REPLACE FUNCTION verificar_conclusao_tarefa()
RETURNS TRIGGER AS $$
DECLARE
    v_total INTEGER;
    v_concluidos INTEGER;
BEGIN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'concluido')
    INTO v_total, v_concluidos
    FROM checklist_items
    WHERE tarefa_id = NEW.tarefa_id;

    IF v_total > 0 AND v_total = v_concluidos THEN
        UPDATE tarefas
        SET status = 'concluida',
            concluida_at = now(),
            updated_at = now()
        WHERE id = NEW.tarefa_id
          AND status != 'concluida';
    ELSIF v_concluidos > 0 THEN
        UPDATE tarefas
        SET status = 'em_andamento',
            updated_at = now()
        WHERE id = NEW.tarefa_id
          AND status = 'pendente';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verificar_conclusao
    AFTER UPDATE OF status ON checklist_items
    FOR EACH ROW
    WHEN (NEW.status = 'concluido')
    EXECUTE FUNCTION verificar_conclusao_tarefa();


-- Funcao: atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION atualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_propriedades_updated_at
    BEFORE UPDATE ON propriedades FOR EACH ROW
    EXECUTE FUNCTION atualizar_updated_at();

CREATE TRIGGER trg_colaboradores_updated_at
    BEFORE UPDATE ON colaboradores FOR EACH ROW
    EXECUTE FUNCTION atualizar_updated_at();

CREATE TRIGGER trg_tarefas_updated_at
    BEFORE UPDATE ON tarefas FOR EACH ROW
    EXECUTE FUNCTION atualizar_updated_at();

CREATE TRIGGER trg_checklist_updated_at
    BEFORE UPDATE ON checklist_items FOR EACH ROW
    EXECUTE FUNCTION atualizar_updated_at();

CREATE TRIGGER trg_rotinas_updated_at
    BEFORE UPDATE ON rotinas_semanais FOR EACH ROW
    EXECUTE FUNCTION atualizar_updated_at();
```

### 3.6 SQL — Views Utilitarias

```sql
-- ============================================================
-- VIEWS UTILITARIAS
-- ============================================================

-- View: painel de tarefas ativas com percentual (filtrar por propriedade_id)
CREATE OR REPLACE VIEW vw_tarefas_ativas AS
SELECT
    t.propriedade_id,
    p.nome AS propriedade_nome,
    t.id,
    t.comando_original,
    t.setor_interpretado,
    s.nome AS setor_nome,
    t.status,
    t.prioridade,
    t.origem,
    t.created_at,
    t.data_limite,
    COUNT(ci.id) AS total_items,
    COUNT(ci.id) FILTER (WHERE ci.status = 'concluido') AS items_concluidos,
    CASE
        WHEN COUNT(ci.id) = 0 THEN 0
        ELSE ROUND((COUNT(ci.id) FILTER (WHERE ci.status = 'concluido')::NUMERIC / COUNT(ci.id)) * 100, 2)
    END AS percentual
FROM tarefas t
JOIN propriedades p ON p.id = t.propriedade_id
JOIN setores s ON s.id = t.setor_id
LEFT JOIN checklist_items ci ON ci.tarefa_id = t.id
WHERE t.status IN ('pendente', 'em_andamento')
GROUP BY t.propriedade_id, p.nome, t.id, t.comando_original, t.setor_interpretado, s.nome,
         t.status, t.prioridade, t.origem, t.created_at, t.data_limite;


-- View: pendencias por colaborador (para painel)
CREATE OR REPLACE VIEW vw_pendencias_colaborador AS
SELECT
    c.propriedade_id,
    c.id AS colaborador_id,
    c.nome AS colaborador_nome,
    c.telefone,
    s.nome AS setor,
    COUNT(ci.id) AS items_pendentes,
    COUNT(ci.id) FILTER (WHERE ci.status = 'concluido') AS items_concluidos,
    ARRAY_AGG(DISTINCT t.id) FILTER (WHERE t.status IN ('pendente', 'em_andamento')) AS tarefas_ativas
FROM colaboradores c
JOIN setores s ON s.id = c.setor_id
LEFT JOIN checklist_items ci ON ci.colaborador_id = c.id
    AND ci.status IN ('pendente', 'em_andamento')
LEFT JOIN tarefas t ON t.id = ci.tarefa_id
WHERE c.ativo = true
GROUP BY c.propriedade_id, c.id, c.nome, c.telefone, s.nome;


-- View: dados para relatorio semanal (filtrar por propriedade_id)
CREATE OR REPLACE VIEW vw_dados_relatorio_semanal AS
SELECT
    t.propriedade_id,
    s.nome AS setor,
    COUNT(DISTINCT t.id) AS total_tarefas,
    COUNT(ci.id) AS total_items,
    COUNT(ci.id) FILTER (WHERE ci.status = 'concluido') AS items_concluidos,
    COUNT(ci.id) FILTER (WHERE ci.status IN ('pendente', 'em_andamento')) AS items_pendentes,
    ARRAY_AGG(ci.observacao) FILTER (WHERE ci.observacao IS NOT NULL) AS observacoes,
    DATE_TRUNC('week', t.created_at)::DATE AS semana
FROM tarefas t
JOIN setores s ON s.id = t.setor_id
LEFT JOIN checklist_items ci ON ci.tarefa_id = t.id
GROUP BY t.propriedade_id, s.nome, DATE_TRUNC('week', t.created_at)::DATE;
```

### 3.7 Estrutura do JSONB — dados_json (relatorios_semanais)

```json
{
  "propriedade": "Labareda",
  "propriedade_id": "uuid-da-propriedade",
  "semana": "2026-06-23 a 2026-06-29",
  "gerado_em": "2026-06-29T20:00:00-03:00",
  "resumo": {
    "total_tarefas": 12,
    "concluidas": 10,
    "pendentes": 2,
    "percentual": 83.33
  },
  "por_setor": [
    {
      "setor": "jardinagem",
      "total_items": 8,
      "concluidos": 7,
      "pendentes": 1,
      "percentual": 87.5,
      "colaboradores": [
        {
          "nome": "Joao",
          "items_concluidos": 4,
          "items_pendentes": 1,
          "observacoes": ["Palmeira do fundo precisa de poda profissional"]
        }
      ]
    }
  ],
  "observacoes_destaque": [
    {
      "colaborador": "Joao",
      "setor": "jardinagem",
      "observacao": "Palmeira do fundo precisa de poda profissional",
      "data": "2026-06-25"
    }
  ],
  "pendencias": [
    {
      "descricao": "Podar palmeira do fundo",
      "setor": "jardinagem",
      "colaborador": "Joao",
      "motivo": "Precisa equipamento especial"
    }
  ]
}
```

---

## 4. Fluxos n8n — Workflows Detalhados

### 4.1 WF-01: Comando Telegram (Marcos envia comando)

**Trigger:** Telegram Bot Webhook (mensagem de texto do Marcos)
**Frequencia:** On-demand (cada mensagem)
**Nota:** Pode ser um unico workflow com branch por bot token, ou workflows separados por propriedade

```
[Telegram Trigger] ──> [Identificar Propriedade]
    Webhook: POST /webhook/telegram-{slug}
    Filtra: apenas mensagens de texto
    Identifica propriedade:
      SQL: SELECT id, telegram_chat_id FROM propriedades
           WHERE telegram_bot_token = $bot_token AND ativo = true
    Valida: mensagem vem do chat_id do Marcos desta propriedade

──> [Preparar Prompt LLM]
    System prompt:
      "Voce e um assistente de gestao de equipes de hotel.
       Extraia: setor, lista de tarefas (checklist items), prioridade.
       Retorne JSON com: { setor, prioridade, items: [string] }
       Setores validos: jardinagem, limpeza, servico_quarto, manutencao, cozinha.
       Se o setor nao for claro, pergunte."

    User message: {{ $json.message.text }}

──> [LLM HTTP Request]
    POST https://api.openai.com/v1/chat/completions
    (ou Anthropic, configuravel via configuracoes)
    Model: gpt-4o-mini (custo baixo, suficiente para classificacao)
    Temperature: 0.1 (deterministico)
    Response format: JSON

──> [Validar Resposta LLM]
    IF resposta tem setor valido E items.length > 0:
        CONTINUE
    ELSE:
        Telegram: "Nao entendi o comando. Tente: 'Jardinagem: podar palmeiras'"
        STOP

──> [Buscar Colaboradores do Setor]
    SQL: SELECT id, nome, telefone, whatsapp_jid
         FROM colaboradores
         WHERE setor_id = (SELECT id FROM setores WHERE nome = $setor)
           AND propriedade_id = $propriedade_id
           AND ativo = true

──> [Criar Tarefa no Supabase]
    INSERT INTO tarefas (propriedade_id, comando_original, setor_interpretado, setor_id, telegram_message_id, telegram_chat_id)
    VALUES ($propriedade_id, $comando, $setor, $setor_id, $msg_id, $chat_id)
    RETURNING id

──> [Criar Checklist Items]
    FOR EACH item IN items:
        INSERT INTO checklist_items (propriedade_id, tarefa_id, colaborador_id, descricao, ordem)
        VALUES ($propriedade_id, $tarefa_id, $colaborador_id, $item, $index)
        -- Distribuicao: round-robin entre colaboradores do setor
        -- OU todos recebem todos os items (configuravel)

──> [Disparar WhatsApp via Evolution API]
    Buscar config da propriedade:
      SELECT evolution_api_url, evolution_api_key, evolution_instance
      FROM propriedades WHERE id = $propriedade_id

    FOR EACH colaborador com items atribuidos:
        POST {evolution_api_url}/message/sendText/{instance}
        Body:
        {
            "number": "{telefone}",
            "text": "Ola {nome}! Novas tarefas para voce:\n\n{lista_items}\n\nAcesse o painel para marcar conclusao:\n{painel_url}?token={jwt_token}"
        }
        UPDATE checklist_items SET whatsapp_enviado = true, whatsapp_enviado_at = now()

──> [Confirmar no Telegram]
    Telegram: "Tarefa criada! {n} items enviados para {nomes_colaboradores} ({setor})."
```

**Variaveis de Ambiente do Workflow:**
- `PROPRIEDADE_ID`: UUID da propriedade (derivado do bot token no webhook, ou fixo por workflow)
- `SUPABASE_URL`: URL da instancia Supabase
- `SUPABASE_SERVICE_KEY`: service_role key
- `LLM_API_KEY`: chave da API do LLM
- `LLM_MODEL`: modelo a usar (default: gpt-4o-mini)

**Abordagem de Workflow (duas opcoes validas):**

| Opcao | Descricao | Pros | Contras |
|-------|-----------|------|---------|
| A. 1 workflow por propriedade | WF-01-LAB, WF-01-SM com PROPRIEDADE_ID fixo | Simples de entender, facil debug | Duplicacao de workflows |
| B. 1 workflow unificado | Webhook unico, identifica propriedade pelo bot token | Menos manutencao, DRY | Branch logic no workflow |

[AUTO-DECISION] Qual abordagem de workflow? --> Abordagem A (1 workflow por propriedade), mantendo a mesma estrutura do documento original (reason: Com apenas 2 propriedades, a duplicacao e minima — 10 workflows totais. A simplicidade de debug e isolamento de falhas supera o beneficio DRY. Se escalar para muitas propriedades, migrar para abordagem B.)

---

### 4.2 WF-02: Rotina Semanal Automatica

**Trigger:** Cron (verifica diariamente as 06:00)
**Frequencia:** Diaria, mas so gera tarefas se houver rotina para o dia

```
[Cron Trigger] ──> [Consultar Rotinas do Dia]
    06:00 UTC-3 diariamente

    SQL: SELECT r.*, p.evolution_api_url, p.evolution_api_key, p.evolution_instance,
                ARRAY_AGG(ri.* ORDER BY ri.ordem)
         FROM rotinas_semanais r
         JOIN propriedades p ON p.id = r.propriedade_id
         JOIN rotina_items ri ON ri.rotina_id = r.id
         WHERE r.dia_semana = EXTRACT(DOW FROM CURRENT_DATE)
           AND r.ativo = true
           AND r.propriedade_id = $propriedade_id
         GROUP BY r.id, p.evolution_api_url, p.evolution_api_key, p.evolution_instance

──> [IF rotinas.length == 0]
    STOP (nada para hoje)

──> [FOR EACH rotina]
    ──> [Criar Tarefa]
        INSERT INTO tarefas (
            propriedade_id, comando_original, setor_interpretado, setor_id,
            origem, rotina_id
        ) VALUES (
            $propriedade_id, 'Rotina automatica: ' || $rotina.nome,
            $setor_nome, $setor_id,
            'rotina', $rotina.id
        ) RETURNING id

    ──> [Criar Checklist Items a partir de rotina_items]
        FOR EACH rotina_item:
            INSERT INTO checklist_items (
                propriedade_id, tarefa_id, colaborador_id, descricao, ordem
            ) VALUES (
                $propriedade_id, $tarefa_id, $rotina_item.colaborador_id,
                $rotina_item.descricao, $rotina_item.ordem
            )

    ──> [Agrupar items por colaborador]

    ──> [Disparar WhatsApp]
        FOR EACH colaborador:
            Evolution API sendText com lista de items do dia
            + link do painel

──> [Notificar Marcos no Telegram]
    "Rotinas do dia disparadas: {n} tarefas, {m} colaboradores notificados."
```

---

### 4.3 WF-03: Relatorio Semanal Consolidado

**Trigger:** Cron (domingo 20:00 — configuravel por propriedade via `propriedades.relatorio_hora`)
**Frequencia:** Semanal

```
[Cron Trigger] ──> [Definir Periodo]
    Domingo 20:00 UTC-3 (ou hora configurada)

    semana_inicio = date_trunc('week', CURRENT_DATE) -- segunda
    semana_fim = CURRENT_DATE -- domingo

──> [Consultar Dados Consolidados]
    SQL via view vw_dados_relatorio_semanal
    WHERE propriedade_id = $propriedade_id
      AND semana = $semana_inicio

──> [Buscar dados da propriedade]
    SELECT nome, telegram_bot_token, telegram_chat_id
    FROM propriedades WHERE id = $propriedade_id

──> [Montar JSON Consolidado]
    Estrutura conforme secao 3.7 acima

──> [Gerar PDF]
    Opcao A (recomendada): Template HTML → Puppeteer/Chromium headless → PDF
    Opcao B: n8n node "HTML to PDF" (community node)
    Opcao C: API externa (ex: html2pdf.app)

    Conteudo do PDF:
    - Cabecalho: "Relatorio Semanal — {propriedade.nome} — {periodo}"
    - Resumo geral: total tarefas, % conclusao, grafico de barras simples
    - Por setor: tabela com items concluidos/pendentes
    - Observacoes dos colaboradores (destaque)
    - Pendencias em aberto

──> [Upload PDF para Supabase Storage]
    Bucket: relatorios
    Path: {propriedade.slug}/{ano}/{semana}/relatorio-semanal-{data}.pdf

──> [Salvar Registro no Banco]
    INSERT INTO relatorios_semanais (
        propriedade_id, semana_inicio, semana_fim, dados_json, pdf_url, pdf_gerado_at,
        total_tarefas, tarefas_concluidas, tarefas_pendentes, percentual_conclusao
    )

──> [Enviar PDF no Telegram]
    Telegram Bot API: sendDocument
    Bot token: $propriedade.telegram_bot_token
    Chat: $propriedade.telegram_chat_id
    Caption: "Relatorio semanal {propriedade.nome} — {periodo}\n{percentual}% concluido"

──> [Atualizar Registro]
    UPDATE relatorios_semanais SET telegram_enviado = true, telegram_enviado_at = now()
```

---

### 4.4 WF-04: Conclusao de Item pelo Colaborador

**Trigger:** Webhook do Painel Web (POST /api/checklist/complete)
**Frequencia:** On-demand (cada interacao do colaborador)

```
[Webhook Trigger] ──> [Validar Token JWT]
    POST /webhook/checklist-complete
    Body: { item_id, status, observacao?, foto_url? }
    Header: Authorization: Bearer {jwt}

    Validar JWT (assinado com Supabase JWT secret)
    Extrair: colaborador_id, propriedade_id

──> [Atualizar Item]
    UPDATE checklist_items
    SET status = 'concluido',
        observacao = $observacao,
        foto_url = $foto_url,
        concluido_at = now()
    WHERE id = $item_id
      AND colaborador_id = $colaborador_id
      AND propriedade_id = $propriedade_id

    -- O trigger trg_verificar_conclusao no banco atualiza a tarefa automaticamente

──> [Verificar se Tarefa Completa]
    SELECT status, concluida_at FROM tarefas WHERE id = $tarefa_id

──> [IF tarefa concluida (100% items)]
    ──> [Buscar bot token da propriedade]
        SELECT telegram_bot_token, telegram_chat_id
        FROM propriedades WHERE id = $propriedade_id

    ──> [Notificar Marcos no Telegram]
        "Tarefa concluida! '{comando_original}' — todos os items marcados como feitos por {colaboradores}."

──> [ELSE (tarefa parcial)]
    ──> [Notificar Marcos (opcional, configuravel)]
        "Item concluido: '{descricao}' por {colaborador_nome} ({setor}). {n}/{total} items feitos."
```

---

### 4.5 WF-05: Lembretes Diarios

**Trigger:** Cron (diario — hora configuravel por propriedade via `propriedades.lembrete_hora`)
**Frequencia:** Diaria

```
[Cron Trigger] ──> [Buscar Pendencias]
    Hora configurada por propriedade (default 08:00 UTC-3)

    SQL: SELECT c.nome, c.telefone, c.whatsapp_jid,
                ARRAY_AGG(ci.descricao) AS items_pendentes
         FROM checklist_items ci
         JOIN colaboradores c ON c.id = ci.colaborador_id
         WHERE ci.status IN ('pendente', 'em_andamento')
           AND ci.propriedade_id = $propriedade_id
         GROUP BY c.id, c.nome, c.telefone, c.whatsapp_jid

──> [IF pendencias.length == 0]
    STOP

──> [Buscar config Evolution da propriedade]
    SELECT evolution_api_url, evolution_api_key, evolution_instance
    FROM propriedades WHERE id = $propriedade_id

──> [FOR EACH colaborador com pendencias]
    ──> [Evolution API sendText]
        "Bom dia {nome}! Voce tem {n} items pendentes:\n\n{lista}\n\nAcesse: {painel_url}"

──> [Log] (sem notificar Marcos, para nao poluir)
```

---

### 4.6 Mapa de Workflows por Propriedade

Cada propriedade (Labareda, Sao Miguel) tem seu proprio conjunto de workflows no n8n. A separacao e feita por:

1. **Webhook URLs distintos:** `/webhook/telegram-labareda` vs `/webhook/telegram-saomiguel`
2. **Bot Tokens distintos:** cada workflow escuta seu proprio bot
3. **Variavel PROPRIEDADE_ID:** determina qual propriedade esta sendo operada (todas as queries filtram por este ID)
4. **Credenciais n8n separadas:** cada propriedade tem seu credential set para Telegram e Evolution

```
n8n
├── Folder: Labareda
│   ├── WF-01-LAB: Comando Telegram
│   ├── WF-02-LAB: Rotina Semanal
│   ├── WF-03-LAB: Relatorio Semanal
│   ├── WF-04-LAB: Conclusao Item
│   └── WF-05-LAB: Lembretes Diarios
│
└── Folder: Sao Miguel
    ├── WF-01-SM: Comando Telegram
    ├── WF-02-SM: Rotina Semanal
    ├── WF-03-SM: Relatorio Semanal
    ├── WF-04-SM: Conclusao Item
    └── WF-05-SM: Lembretes Diarios
```

---

## 5. Integracoes

### 5.1 Telegram Bot API

| Aspecto | Detalhe |
|---------|---------|
| **Bots necessarios** | 2 (um Labareda, um Sao Miguel) |
| **Criacao** | Via @BotFather no Telegram |
| **Webhook** | Configurado via `setWebhook` apontando para n8n |
| **Metodos usados** | `sendMessage`, `sendDocument` (PDF), `getUpdates` (fallback) |
| **Autenticacao** | Bot Token (armazenado em `propriedades.telegram_bot_token`) |
| **Chat ID do Marcos** | Obtido na primeira interacao, salvo em `propriedades.telegram_chat_id` |
| **Comandos especiais** | Nenhum — tudo por linguagem natural, LLM interpreta |
| **Rate limits** | 30 msgs/s por bot (suficiente) |

**Seguranca:**
- Apenas mensagens do `telegram_chat_id` da propriedade sao processadas como comandos
- Outros usuarios recebem "Acesso nao autorizado"
- Bot tokens armazenados na tabela `propriedades` (acesso restrito via service_role key)

### 5.2 Evolution API (WhatsApp)

| Aspecto | Detalhe |
|---------|---------|
| **Instancias** | 1 instancia compartilhada (ou 2, uma por propriedade — decisao do deploy) |
| **API** | REST, self-hosted na VPS |
| **Metodos usados** | `POST /message/sendText/{instance}` |
| **Autenticacao** | API Key (header `apikey`) |
| **Numero WhatsApp** | 1 numero vinculado a Evolution API |
| **Formato telefone** | `+5573999999999` (E.164) |
| **Rate limits** | WhatsApp Business: ~250 msgs/dia (tier 1), escalar com uso |

**Mensagem padrao para colaborador:**
```
Ola {nome}! 

Novas tarefas para voce hoje ({setor}):

1. {item_1}
2. {item_2}
3. {item_3}

Marque como concluido no painel:
{painel_url}?t={token}
```

**Decisao sobre instancias Evolution:**

[AUTO-DECISION] Uma ou duas instancias Evolution API? --> Uma instancia compartilhada com numero unico (reason: O isolamento de dados e no banco via propriedade_id. A Evolution API e apenas um canal de disparo. Usar duas instancias dobraria o custo de infraestrutura sem beneficio real de isolamento, pois o WhatsApp ja envia mensagens individuais por numero de telefone do colaborador. O conteudo da mensagem ja vem isolado por propriedade_id.)

### 5.3 LLM Provider

| Aspecto | Detalhe |
|---------|---------|
| **Provider recomendado** | OpenAI (gpt-4o-mini) ou Anthropic (Claude Haiku) |
| **Uso** | Interpretacao de comandos de linguagem natural |
| **Chamadas estimadas** | 5-20/dia (comandos do Marcos) |
| **Custo estimado** | < USD 1/mes com gpt-4o-mini |
| **Fallback** | Se LLM falhar: pedir reformulacao ao Marcos via Telegram |
| **Temperatura** | 0.1 (respostas deterministicas) |
| **Response format** | JSON (structured output) |

**System Prompt padrao:**
```
Voce e um assistente de gestao de equipes de uma pousada.
Seu trabalho e interpretar comandos em linguagem natural e extrair:

1. setor: um dos seguintes: jardinagem, limpeza, servico_quarto, manutencao, cozinha
2. items: lista de tarefas individuais (checklist)
3. prioridade: baixa, normal, alta ou urgente (default: normal)
4. data_limite: se mencionada (formato YYYY-MM-DD), senao null

Responda SOMENTE em JSON valido:
{
  "setor": "string",
  "items": ["string"],
  "prioridade": "string",
  "data_limite": "string|null"
}

Se o comando nao for sobre tarefas de equipe, responda:
{ "erro": "Comando nao reconhecido como tarefa de equipe" }
```

---

## 6. Painel do Colaborador

### 6.1 Decisao Arquitetural

**Abordagem: Progressive Web App (PWA) minimalista, acessado via link no WhatsApp**

| Opcao | Pros | Contras | Decisao |
|-------|------|---------|---------|
| A. App nativo | UX rica | Custo alto, colaboradores nao instalarao | REJEITADA |
| B. Bot WhatsApp interativo | Zero fricao, ja no canal | Limitacoes de UI, dificil listar muitos items | REJEITADA |
| C. PWA via link no WhatsApp | Zero instalacao, funciona offline, checklist visual | Precisa abrir browser | **ESCOLHIDA** |
| D. Mini-app Telegram | Bom para quem usa Telegram | Colaboradores usam WhatsApp, nao Telegram | REJEITADA |

### 6.2 Fluxo de Acesso

```
1. Colaborador recebe WhatsApp com link:
   "https://painel.labareda.com.br?t={jwt_token}"

2. JWT contem: { colaborador_id, propriedade_id, exp (24h) }

3. Pagina carrega: lista de items pendentes do colaborador
   (filtrado por propriedade_id automaticamente)

4. Colaborador pode:
   - Marcar item como concluido (checkbox)
   - Adicionar observacao (textarea)
   - Enviar foto de comprovacao (camera do celular)

5. Cada acao envia POST para n8n webhook (WF-04)

6. Pagina atualiza em tempo real (Supabase Realtime ou polling simples)
```

### 6.3 Especificacao Tecnica do Painel

| Aspecto | Detalhe |
|---------|---------|
| **Tipo** | PWA (HTML + CSS + JS vanilla ou Preact) |
| **Hosting** | Supabase Storage (static files) ou VPS com nginx |
| **Autenticacao** | JWT no query parameter (link unico por colaborador) |
| **Validade do token** | 24 horas (renovado a cada disparo de tarefa) |
| **Backend** | Supabase REST API (PostgREST) direto, sem backend intermediario |
| **Offline** | Service Worker com cache de items pendentes, sync ao reconectar |
| **Responsivo** | Mobile-first (100% do uso sera no celular) |
| **Idioma** | PT-BR unico |

### 6.4 Telas do Painel

**Tela 1 — Lista de Tarefas Pendentes**
```
+------------------------------------------+
|  Ola, {nome}!                            |
|  {propriedade.nome} — {data}             |
+------------------------------------------+
|                                          |
|  JARDINAGEM                              |
|  +--------------------------------------+|
|  | [ ] Podar palmeiras da entrada       ||
|  | [ ] Regar horta organica             ||
|  | [x] Limpar canteiro central          ||
|  +--------------------------------------+|
|                                          |
|  LIMPEZA                                 |
|  +--------------------------------------+|
|  | [ ] Limpar piscina                   ||
|  | [ ] Varrer area externa              ||
|  +--------------------------------------+|
|                                          |
+------------------------------------------+
```

**Tela 2 — Marcar Conclusao (ao tocar no item)**
```
+------------------------------------------+
|  < Voltar                                |
+------------------------------------------+
|                                          |
|  Podar palmeiras da entrada              |
|  Setor: Jardinagem                       |
|                                          |
|  Status: [ ] Concluido                   |
|                                          |
|  Observacao (opcional):                  |
|  +------------------------------------+  |
|  | Palmeira do fundo precisa de       |  |
|  | equipamento especial               |  |
|  +------------------------------------+  |
|                                          |
|  Foto (opcional):                        |
|  [Tirar Foto]  [Escolher da Galeria]     |
|                                          |
|  [    CONFIRMAR    ]                     |
|                                          |
+------------------------------------------+
```

### 6.5 Seguranca do Painel

- **JWT assinado** com Supabase JWT secret — nao pode ser forjado
- **Expiracao de 24h** — colaborador precisa usar o link do dia
- **Escopo limitado** — JWT permite APENAS operacoes no proprio colaborador_id E propriedade_id
- **HTTPS obrigatorio** — certificado Let's Encrypt no nginx
- **Sem senha** — autenticacao e pelo link (simplicidade para colaboradores rurais)
- **Rate limiting** — max 100 requests/hora por token (previne abuso)

### 6.6 Dashboard do Marcos (futuro — Modulo 4)

No futuro, o Dashboard administrativo (Modulo 4) permitira ao Marcos:

- **Alternar entre propriedades:** Selector "Labareda" / "Sao Miguel" filtrando por `propriedade_id`
- **Visao consolidada:** Ver dados de TODAS as propriedades juntas (queries sem filtro de propriedade_id)
- **Comparativo:** Comparar desempenho entre propriedades lado a lado
- **Gestao centralizada:** Gerenciar colaboradores, rotinas e configuracoes de qualquer propriedade em um unico painel

Esta flexibilidade e possivel justamente porque o banco e unificado — nao ha necessidade de queries cross-schema ou ferramentas de ETL para consolidar dados.

---

## 7. Infraestrutura e Deploy

### 7.1 Componentes na VPS

```
VPS (Ubuntu 22.04+ LTS)
├── Docker
│   ├── supabase-stack (docker-compose)
│   │   ├── postgres:15
│   │   ├── supabase-auth
│   │   ├── supabase-rest (PostgREST)
│   │   ├── supabase-storage
│   │   ├── supabase-realtime
│   │   └── supabase-studio (admin UI)
│   │
│   ├── n8n (docker)
│   │   └── porta 5678
│   │
│   ├── evolution-api (docker)
│   │   └── porta 8080
│   │
│   └── nginx (reverse proxy + SSL)
│       ├── api.labareda.com.br → supabase-rest
│       ├── n8n.labareda.com.br → n8n
│       ├── painel.labareda.com.br → static files
│       └── evo.labareda.com.br → evolution-api
│
└── certbot (Let's Encrypt auto-renewal)
```

### 7.2 Requisitos Minimos da VPS

| Recurso | Minimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Banda | 1 TB/mes | Ilimitada |

### 7.3 Subdominios Necessarios

| Subdominio | Servico | Uso |
|------------|---------|-----|
| `api.labareda.com.br` | Supabase REST | APIs do banco |
| `n8n.labareda.com.br` | n8n UI + webhooks | Automacao |
| `painel.labareda.com.br` | PWA painel colaborador | Colaboradores Labareda |
| `painel.saomiguel.com.br` | PWA painel colaborador | Colaboradores Sao Miguel |
| `evo.labareda.com.br` | Evolution API | WhatsApp (interno) |

---

## 8. Seguranca

### 8.1 Matriz de Seguranca

| Vetor | Mitigacao |
|-------|-----------|
| Acesso nao autorizado ao Telegram Bot | Filtro por `telegram_chat_id` da propriedade — rejeita todos os outros |
| Interceptacao de JWT do painel | HTTPS obrigatorio, JWT expira em 24h, escopo inclui propriedade_id |
| SQL Injection | PostgREST (Supabase) usa parametros preparados; n8n queries parametrizadas |
| Acesso cruzado entre propriedades | Toda query filtra por propriedade_id; JWT do painel inclui propriedade_id no escopo |
| Exfiltracoes via Evolution API | API Key rotacionada mensalmente, acesso apenas interno (firewall) |
| Acesso ao n8n UI | Autenticacao propria do n8n + firewall (apenas IP do Marcos/Adabtech) |
| Supabase Studio exposto | Firewall: apenas IP do Marcos/Adabtech |
| Dados sensiveis em propriedades | Bot tokens e API keys na tabela `propriedades`, acessivel apenas via service_role |
| Backup de dados | pg_dump automatico diario + upload para storage externo |

### 8.2 LGPD

| Dado Pessoal | Justificativa Legal | Retencao |
|-------------|---------------------|----------|
| Nome do colaborador | Execucao de contrato de trabalho | Enquanto ativo + 5 anos |
| Telefone do colaborador | Execucao de contrato (envio de tarefas) | Enquanto ativo + 5 anos |
| Observacoes de tarefas | Interesse legitimo (gestao operacional) | 2 anos |
| Fotos de comprovacao | Interesse legitimo | 1 ano |

---

## 9. Trade-offs e Decisoes Arquiteturais

### ADR-001: Banco unificado com propriedade_id vs schemas separados

- **Decisao:** Banco unificado (schema `public`) com coluna `propriedade_id` em todas as tabelas de dados
- **Decisao anterior (v1.0):** Schemas separados (labareda, sao_miguel) — REVOGADA
- **Motivo da mudanca:** Cliente decidiu que banco unificado e mais simples de manter. Isolamento natural ja existe nos bots Telegram (entrada separada por propriedade). Dashboard futuro se beneficia de banco unico.
- **Trade-off:** Precisa garantir WHERE propriedade_id em toda query vs simplicidade de manutencao com unico schema, unico set de migrations, e queries consolidadas triviais
- **Risco:** Query sem filtro de propriedade_id pode retornar dados de outra propriedade — mitigado com convencao de sempre incluir propriedade_id e validacao em code review
- **Impacto:** Migration unica, sem script wrapper, sem SET search_path, sem duplicacao de DDL
- **Estrategia de saida:** Se precisar separar fisicamente no futuro, basta exportar dados filtrados por propriedade_id (`pg_dump` com WHERE ou `COPY ... WHERE propriedade_id = X`)

### ADR-002: PWA vs Bot WhatsApp para painel do colaborador

- **Decisao:** PWA acessada via link no WhatsApp
- **Trade-off:** Colaborador precisa abrir browser vs limitacao de UI no WhatsApp
- **Justificativa:** Checklist visual com checkboxes, fotos e observacoes nao cabem bem em mensagens WhatsApp
- **Risco:** Colaboradores menos tech-savvy podem ter dificuldade — mitigado com UI ultra-simples e treinamento

### ADR-003: LLM para interpretacao vs comandos estruturados

- **Decisao:** LLM (gpt-4o-mini) para linguagem natural
- **Trade-off:** Custo de API (minimo, < USD 1/mes) vs flexibilidade total
- **Justificativa:** Marcos quer comandar por linguagem natural (requisito contratual)
- **Fallback:** Se LLM indisponivel, n8n pede reformulacao via Telegram
- **Risco:** Interpretacao errada — mitigado com temperatura 0.1 e confirmacao no Telegram

### ADR-004: Uma instancia Evolution API compartilhada

- **Decisao:** Uma instancia, um numero WhatsApp
- **Trade-off:** Menor isolamento no canal de disparo vs menor custo e complexidade
- **Justificativa:** O isolamento real e nos dados (propriedade_id), nao no canal de envio. O colaborador recebe uma mensagem individual independente da origem.
- **Risco:** Se a instancia cair, ambas propriedades ficam sem WhatsApp — mitigado com monitoramento

---

## 10. Estimativas e Metricas de Referencia

### 10.1 Volume Estimado

| Metrica | Estimativa |
|---------|-----------|
| Colaboradores (Labareda) | 5-15 |
| Colaboradores (Sao Miguel) | 3-10 |
| Comandos/dia (Marcos) | 5-20 |
| Tarefas/semana (total) | 30-100 |
| Checklist items/semana | 100-400 |
| Mensagens WhatsApp/dia | 20-80 |
| Chamadas LLM/dia | 5-20 |
| Relatorios PDF/semana | 2 (1 por propriedade) |

### 10.2 SLAs

| Operacao | Meta (NFR-1) |
|----------|-------------|
| Comando Telegram → confirmacao de disparo | < 30s (FR meta) |
| Interpretacao LLM | < 5s |
| Disparo WhatsApp | < 10s apos criacao |
| Painel: carregar items pendentes | < 2s |
| Relatorio PDF: geracao | < 60s |

---

## 11. Proximo Passo — Delegacoes

| Acao | Agente | Entregavel |
|------|--------|-----------|
| Criar migration SQL (banco unificado) | @data-engineer (Dara) | `supabase/migrations/` |
| Criar stories da Onda 1 (M1) | @sm (River) | `docs/stories/` |
| Validar stories | @po (Pax) | Verdicts GO/NO-GO |
| Setup VPS + Docker + Supabase | @devops (Gage) | Infra operacional |
| Implementar workflows n8n | @dev (Dex) | 10 workflows (5 per propriedade) |
| Implementar painel PWA | @dev (Dex) | Static site |

---

*ARCH-001 v2.0 — Modulos 1 e 6 — Arquitetura Tecnica Completa*
*Autor: Aria (@architect) — 2026-07-01*
*Revisao v2.0: Banco unificado com propriedade_id (decisao do cliente)*
*Pendente: revisao @data-engineer (schema), @devops (infra), validacao cliente*
