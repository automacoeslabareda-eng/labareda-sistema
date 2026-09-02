---
name: labareda-criar-tarefa
description: Cria uma nova tarefa no sistema de gestao Labareda. Use quando o usuario pedir para criar, adicionar, fazer ou agendar algo para a equipe. Interpreta setor, prioridade e responsavel a partir de linguagem natural.
compatibility: Requer MCP Supabase conectado com execute_sql
---

# Criar Tarefa

Quando o usuario pedir para criar uma tarefa, siga estes passos.

> **Regra que nao se quebra:** toda tarefa precisa gerar pelo menos um
> registro em `checklist_items`. O painel do colaborador
> (https://painel.sitiolabareda.com) le `checklist_items`, nao `tarefas`.
> Tarefa criada sem item nao aparece para ninguem e ninguem e avisado.

## 1. Interpretar a mensagem

Extraia da mensagem:
- **descricao**: O que precisa ser feito
- **setor**: Baseado no conteudo (ver tabela abaixo)
- **colaborador**: Se mencionou um nome
- **prioridade**: `normal` (default), `baixa`, `alta`, `urgente`
- **data_limite**: Se mencionou prazo (formato YYYY-MM-DD)
- **propriedade**: Default Labareda, ou Sao Miguel se mencionado

### Mapeamento de Setores

| Palavras-chave | Setor |
|---|---|
| poda, rocagem, arvore, jardim, grama, planta, viveiro, agrofloresta, frutiferas, adubo, trator, cerca | jardinagem |
| limpar, limpeza, mofo, vidro, desumidificador, casa, quarto | limpeza |
| cozinha, refeicao, cafe, comida, almoco | cozinha |
| reparo, eletrica, hidraulica, consertar, trocar, fixar | manutencao |
| piscina, trilha, lampada, diesel, fossa, cupim, animal, agua | servicos_gerais |
| gasto, inventario, granja, mostruario, controle, fechadura | administrativo |

### Mapeamento de Colaboradores

| Nome | Setor |
|---|---|
| Carlos | jardinagem |
| Wendel | jardinagem |
| Rai | jardinagem |
| Queila | limpeza |
| Nane | limpeza |
| Kali | cozinha |
| Abel | servicos_gerais |
| Junior | administrativo |

## 2. Buscar IDs no banco

Execute estas queries em sequencia:

### Buscar setor_id
```sql
SELECT id, nome FROM setores WHERE nome ILIKE '%{setor}%' LIMIT 1;
```

### Buscar propriedade_id (se nao for Labareda default)
- Labareda: `229e2813-6d46-4bdb-9aee-5d9a119733e6`
- Sao Miguel: `4a5580bb-9971-40c9-9409-ffbe0cff65da`

### Buscar o responsavel
O colaborador e **obrigatorio** para a tarefa chegar em alguem. Traga
tambem o email, porque ele entra na resposta como usuario do painel:

```sql
SELECT id, nome, email FROM colaboradores
WHERE nome ILIKE '%{nome}%' AND ativo = true LIMIT 1;
```

Se o usuario nao disse o nome, escolha pelo setor:

```sql
SELECT c.id, c.nome, c.email FROM colaboradores c
JOIN setores s ON s.id = c.setor_id
WHERE s.nome ILIKE '%{setor}%' AND c.ativo = true
  AND c.propriedade_id = '{propriedade_id}'
ORDER BY c.nome LIMIT 1;
```

Se mesmo assim nao achar ninguem, **pergunte para quem e a tarefa** antes
de inserir. Nao crie tarefa sem dono.

## 3. Inserir tarefa + item do checklist

Faca as duas insercoes na mesma resposta. A segunda depende do `id` da primeira:

```sql
WITH nova AS (
  INSERT INTO tarefas (
    comando_original, descricao, setor_interpretado, setor_id,
    propriedade_id, responsavel_id, prioridade,
    data_limite, origem, status
  ) VALUES (
    '{descricao}',
    '{descricao}',
    '{setor}',
    '{setor_id}',
    '{propriedade_id}',
    '{responsavel_id}',
    '{prioridade}',
    {data_limite ou NULL},
    'hermes',
    'pendente'
  )
  RETURNING id, descricao, propriedade_id, responsavel_id
)
INSERT INTO checklist_items (
  tarefa_id, propriedade_id, colaborador_id, descricao, ordem, status, whatsapp_enviado
)
SELECT id, propriedade_id, responsavel_id, descricao, 1, 'pendente', false
FROM nova
RETURNING id, tarefa_id, descricao;
```

`whatsapp_enviado = false` e o que faz o vigia do n8n
(workflow *Avisos WhatsApp - Colaboradores*, roda de 10 em 10 minutos)
mandar a mensagem para o colaborador com o link do painel. Voce nao
precisa mandar WhatsApp — so deixe o item marcado como nao avisado.

### Varios itens numa tarefa so

Se o pedido tem varias partes ("limpar a piscina e trocar as lampadas"),
crie uma tarefa e um `checklist_items` por parte, com `ordem` 1, 2, 3...

## 4. Responder

```
✅ Tarefa criada!
📋 {descricao}
🏷️ Setor: {setor}
👤 Responsavel: {nome}
⚡ Prioridade: {prioridade}
📅 Prazo: {data ou "sem prazo"}

📲 {nome} vai receber o aviso no WhatsApp em ate 10 min.
👉 Painel: https://painel.sitiolabareda.com
```

## Exemplos

**Input:** "podar as arvores do jardim"
- setor: jardinagem
- prioridade: normal
- responsavel: escolher pelo setor jardinagem (Carlos)

**Input:** "Carlos, limpar a caixa dagua urgente"
- setor: jardinagem (Carlos e de jardinagem)
- prioridade: urgente
- responsavel: Carlos

**Input:** "Queila fazer limpeza profunda na casa grande ate sexta"
- setor: limpeza
- prioridade: normal
- responsavel: Queila
- data_limite: proxima sexta-feira

## O que NAO fazer

- ❌ Inserir em `tarefas` sem inserir em `checklist_items`
- ❌ Deixar `colaborador_id` ou `propriedade_id` nulos no item
- ❌ Mandar qualquer outro link de painel — o unico e
  `https://painel.sitiolabareda.com` (nao existe `/painel` no site,
  nao use netlify, nao use vercel.app)
- ❌ Criar rotina recorrente por aqui: para algo que se repete toda
  semana/quinzena/mes, use a skill `labareda-rotinas`
