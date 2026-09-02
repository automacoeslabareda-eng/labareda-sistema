---
name: labareda-concluir-tarefa
description: Marca uma tarefa como concluida no sistema Labareda. Use quando o usuario disser que terminou algo, completou uma tarefa, ou pedir para fechar/concluir uma atividade.
compatibility: Requer MCP Supabase conectado com execute_sql
---

# Concluir Tarefa

Quando o usuario disser que terminou algo, identifique a tarefa e marque como concluida.

## 1. Identificar a tarefa

O usuario pode referenciar a tarefa de varias formas:

### Por ID (direto)
```sql
SELECT id, comando_original, setor_interpretado, status
FROM tarefas WHERE id = '{tarefa_id}';
```

### Por descricao (busca fuzzy)
Se o usuario disse "terminei a limpeza da piscina", busque:
```sql
SELECT id, comando_original, setor_interpretado, status
FROM tarefas
WHERE comando_original ILIKE '%{palavras-chave}%'
  AND status IN ('pendente', 'em_andamento')
ORDER BY created_at DESC
LIMIT 3;
```

### Se encontrar mais de uma
Liste as opcoes e peca para o usuario escolher:
```
Encontrei {N} tarefas parecidas:
1. {descricao} (criada em {data})
2. {descricao} (criada em {data})
Qual voce quer concluir? (1, 2...)
```

## 2. Concluir a tarefa

```sql
UPDATE tarefas
SET status = 'concluida',
    porcentagem_conclusao = 100,
    concluida_at = NOW(),
    updated_at = NOW()
WHERE id = '{tarefa_id}'
  AND status IN ('pendente', 'em_andamento')
RETURNING id, comando_original, setor_interpretado;
```

## 3. Concluir itens de checklist (se existirem)

```sql
UPDATE checklist_items
SET status = 'concluido',
    concluido_at = NOW()
WHERE tarefa_id = '{tarefa_id}'
  AND status != 'concluido';
```

## 4. Responder

```
✅ Tarefa concluida!
📋 {descricao}
🏷️ Setor: {setor}
🕐 Concluida em: {data/hora}
```

Se a tarefa ja estava concluida:
```
ℹ️ Essa tarefa ja estava concluida.
```

Se nao encontrou:
```
❌ Nao encontrei essa tarefa. Tente "listar tarefas" pra ver as pendentes.
```
