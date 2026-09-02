# Hermes — Gestao Labareda

Configuracao do Hermes Agent (Nous Research) para gestao operacional
do Sitio Labareda e Sitio Sao Miguel.

## Estrutura

```
hermes/
├── SOUL.md                          # Persona do Hermes (system prompt)
├── references/
│   └── schema.md                    # Schema do banco Supabase
└── skills/
    ├── labareda-criar-tarefa/       # Criar tarefas por linguagem natural
    ├── labareda-listar-tarefas/     # Listar/filtrar tarefas
    ├── labareda-concluir-tarefa/    # Marcar tarefas como concluidas
    ├── labareda-resumo/             # Dashboard/resumo operacional
    ├── labareda-colaboradores/      # Consultar equipe
    └── labareda-rotinas/            # Gerenciar rotinas semanais
```

## Deploy na VPS

### 1. Copiar arquivos

```bash
# Copiar SOUL.md para o contexto do Hermes
cp SOUL.md ~/.hermes/SOUL.md

# Copiar references
cp -r references/ ~/.hermes/references/

# Copiar skills
cp -r skills/* ~/.hermes/skills/
```

### 2. Verificar MCP Supabase

O MCP do Supabase ja deve estar conectado. Verificar:
```bash
hermes tools
```

Deve mostrar o Supabase MCP com `execute_sql` disponivel.

### 3. Configurar gateway Telegram

```bash
hermes gateway
```

Ou editar `~/.hermes/config.yaml`:
```yaml
messaging:
  telegram:
    bot_token: "SEU_BOT_TOKEN_AQUI"
```

### 4. Testar

```bash
# Testar no CLI primeiro
hermes
> listar tarefas pendentes
> criar tarefa: limpar a piscina

# Depois ativar o gateway
hermes gateway start
```

## Skills disponiveis

| Skill | Slash command | Descricao |
|---|---|---|
| labareda-criar-tarefa | `/labareda-criar-tarefa` | Cria tarefa a partir de linguagem natural |
| labareda-listar-tarefas | `/labareda-listar-tarefas` | Lista tarefas com filtros |
| labareda-concluir-tarefa | `/labareda-concluir-tarefa` | Marca tarefa como concluida |
| labareda-resumo | `/labareda-resumo` | Resumo operacional completo |
| labareda-colaboradores | `/labareda-colaboradores` | Consulta equipe por setor |
| labareda-rotinas | `/labareda-rotinas` | Gerencia rotinas semanais |

## Integracao com Dashboard

O dashboard web continua funcionando normalmente — le e escreve no
mesmo Supabase. As tarefas criadas pelo Hermes (Telegram) aparecem
automaticamente no dashboard e vice-versa.
