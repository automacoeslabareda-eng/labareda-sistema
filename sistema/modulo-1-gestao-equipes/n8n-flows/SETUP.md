# Bot Telegram - Gestao de Tarefas Labareda

## Arquitetura

```
Colaborador envia mensagem no Telegram
        |
   [Telegram Trigger] (n8n)
        |
   [Extrair Contexto] - chat_id, texto, nome
        |
   [AI Agent] (gpt-5-mini) - interpreta a mensagem
        |--- Tool: Criar Tarefa ---> Supabase (origem: 'telegram')
        |--- Tool: Listar Tarefas -> Supabase (select)
        |--- Tool: Concluir Tarefa -> Supabase (update)
        |
   [Responder Telegram] - envia resposta formatada
```

## Workflows (4 arquivos)

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `bot-telegram-tarefas.json` | **Principal** | Trigger + AI Agent + Resposta |
| `tool-criar-tarefa.json` | Sub-workflow | Cria tarefa no Supabase |
| `tool-listar-tarefas.json` | Sub-workflow | Lista tarefas pendentes |
| `tool-concluir-tarefa.json` | Sub-workflow | Marca tarefa como concluida |

## Setup no n8n (https://n8n.sitiolabareda.com)

### Passo 1: Importar Sub-workflows
1. Ir em **Workflows > Import from File**
2. Importar `tool-criar-tarefa.json` → salvar → anotar o ID do workflow
3. Importar `tool-listar-tarefas.json` → salvar → anotar o ID
4. Importar `tool-concluir-tarefa.json` → salvar → anotar o ID

### Passo 2: Configurar Credencial Telegram
1. Ir em **Credentials > Add Credential > Telegram API**
2. Nome: `Telegram Bot Labareda`
3. Token: pegar de `propriedades.telegram_bot_token` no Supabase
4. Salvar

### Passo 3: Importar Workflow Principal
1. Importar `bot-telegram-tarefas.json`
2. No node **Telegram Trigger**: selecionar credencial `Telegram Bot Labareda`
3. No node **Responder Telegram**: selecionar credencial `Telegram Bot Labareda`
4. Nos 3 nodes **Tool**: apontar para os IDs dos sub-workflows importados:
   - Tool: Criar Tarefa → ID do workflow `tool-criar-tarefa`
   - Tool: Listar Tarefas → ID do workflow `tool-listar-tarefas`
   - Tool: Concluir Tarefa → ID do workflow `tool-concluir-tarefa`

### Passo 4: Ativar
1. Ativar o workflow principal (toggle no canto superior direito)
2. O Telegram Trigger vai registrar o webhook automaticamente

## Comandos que o bot entende

O bot usa linguagem natural (nao precisa de /comandos):

| Mensagem do usuario | Acao |
|---------------------|------|
| "limpar o galinheiro" | Cria tarefa setor=limpeza |
| "podar as arvores do jardim" | Cria tarefa setor=jardinagem |
| "urgente: consertar a cerca" | Cria tarefa prioridade=urgente setor=manutencao |
| "quais tarefas pendentes?" | Lista tarefas ativas |
| "o que tem pra fazer?" | Lista tarefas ativas |
| "terminei a tarefa X" | Marca como concluida |
| "concluir tarefa abc123" | Marca como concluida |

## Setores mapeados

| Setor | Palavras-chave que ativam |
|-------|--------------------------|
| jardinagem | jardim, plantas, podar, arvore, grama |
| limpeza | limpar, limpeza, varrer, lavar, faxina |
| cozinha | cozinha, comida, preparo, refeicao |
| manutencao | consertar, arrumar, cerca, maquina, reparo |
| recepcao | hospede, check-in, recepcao, reserva |
| administrativo | documento, compra, pagamento, nota |
| eventos | evento, festa, decoracao, montagem |

## Integracao com Dashboard

Tarefas criadas pelo Telegram aparecem automaticamente no Dashboard
(modulo-4-dashboard) com o badge "telegram" na coluna Origem.

O fluxo e bidirecional:
- Telegram cria → Dashboard mostra
- Dashboard cria → Colaborador ve no Painel PWA

## Propriedade

Por default, o bot cria tarefas para a primeira propriedade encontrada.
Para suportar multiplas propriedades:
- Configurar bots separados por propriedade (cada um com seu token)
- Ou adicionar logica de identificacao por grupo/chat_id

## OpenAI

Usando a API key e modelo do workflow existente:
- Credential ID: `l6Qxy5ePeCjrwytp`
- Modelo: `gpt-5-mini`
- Temperature: 0.3 (mais deterministic para comandos)
