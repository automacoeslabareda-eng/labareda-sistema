# Labareda Gestao — Schema de Referencia

## Propriedades

| ID | Nome | Slug |
|---|---|---|
| `229e2813-6d46-4bdb-9aee-5d9a119733e6` | Sitio Labareda | labareda |
| `4a5580bb-9971-40c9-9409-ffbe0cff65da` | Sitio Sao Miguel | sao-miguel |

## Setores

| Nome | Colaboradores |
|---|---|
| jardinagem | Carlos (caixa dagua, bomba, adubacao, animais, rocagem, poda, coqueira, viveiro), Wendel (frutiferas, plantacao, triturar, sementes, trator, cercas), Rai (trabalha com Wendel) |
| limpeza | Queila (abrir casa, areas comuns, limpeza profunda dias 5/15/25), Nane (trabalha com Queila) |
| cozinha | Kali (segunda a terca, cuida de Felipe e Bela) |
| manutencao | reparos, eletrica, hidraulica |
| servicos_gerais | Abel (agua, trilhas, piscina, lampadas, cupim, diesel) |
| administrativo | Junior (gastos, fechaduras, granja, inventario, mostruario) |

## Tabelas Principais

### propriedades
```sql
id UUID PK, nome TEXT, slug TEXT, telegram_bot_token TEXT, telegram_chat_id TEXT
```

### setores
```sql
id UUID PK, nome TEXT, propriedade_id UUID FK
```

### colaboradores
```sql
id UUID PK, nome TEXT, funcao TEXT, telefone TEXT, email TEXT, senha_hash TEXT,
setor_id UUID FK, propriedade_id UUID FK, ativo BOOLEAN, whatsapp_jid TEXT,
msg_aviso TEXT, msg_tarefa TEXT
```

### tarefas
```sql
id UUID PK DEFAULT gen_random_uuid(),
comando_original TEXT,            -- texto original do pedido
descricao TEXT,                   -- descricao limpa (use esta no painel)
setor_interpretado TEXT,
setor_id UUID FK,
propriedade_id UUID FK,
responsavel_id UUID FK,           -- colaborador
prioridade TEXT DEFAULT 'normal', -- baixa, normal, alta, urgente
status TEXT DEFAULT 'pendente',   -- pendente, em_andamento, concluida, cancelada
frequencia TEXT,                  -- diaria, semanal, quinzenal, mensal (NULL = avulsa)
data_inicio DATE, data_fim DATE, data_limite DATE,
origem TEXT DEFAULT 'telegram',   -- telegram, dashboard, rotina, whatsapp, hermes
rotina_id UUID FK,                -- preenchido so quando origem = 'rotina'
telegram_message_id TEXT, telegram_chat_id TEXT,
concluida_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()
```

### checklist_items
E ESTA a tabela que o painel do colaborador le. Tarefa sem checklist_item
NAO aparece para ninguem.
```sql
id UUID PK DEFAULT gen_random_uuid(),
tarefa_id UUID FK,
propriedade_id UUID FK,          -- OBRIGATORIO
colaborador_id UUID FK,          -- OBRIGATORIO: de quem e o item
descricao TEXT,
ordem INT,
status TEXT DEFAULT 'pendente',  -- pendente, em_andamento, concluido
observacao TEXT, tipo_observacao TEXT, foto_url TEXT, audio_url TEXT,
whatsapp_enviado BOOLEAN DEFAULT false,   -- o vigia do n8n usa este campo
whatsapp_enviado_at TIMESTAMPTZ,
concluido_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()
```

### rotinas_semanais
```sql
id UUID PK, nome TEXT, descricao TEXT,
dia_semana INT,                  -- 0=Dom, 1=Seg ... 6=Sab
frequencia TEXT,                 -- diaria, semanal, quinzenal, mensal
hora_disparo TIME, dias_lembrete TEXT, msg_whatsapp TEXT,
setor_id UUID FK, responsavel_id UUID FK, propriedade_id UUID FK, ativo BOOLEAN
```

### rotina_items
```sql
id UUID PK, rotina_id UUID FK, propriedade_id UUID FK,
colaborador_id UUID FK, descricao TEXT, ordem INT
```

### relatorios_semanais
```sql
id UUID PK, semana_inicio DATE, semana_fim DATE,
dados JSONB, pdf_url TEXT, propriedade_id UUID FK,
created_at TIMESTAMPTZ DEFAULT now()
```

## Views

- `vw_tarefas_ativas` — tarefas com porcentagem de conclusao
- `vw_pendencias_colaborador` — itens pendentes por colaborador
- `vw_dados_relatorio_semanal` — dados agrupados por setor para relatorio
