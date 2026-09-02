---
name: labareda-listar-tarefas
description: Lista tarefas do sistema de gestao Labareda. Use quando o usuario perguntar o que tem pra fazer, quais tarefas pendentes, tarefas de um setor, tarefas de um colaborador, ou pedir um resumo das atividades.
compatibility: Requer MCP Supabase conectado com execute_sql
---

# Listar Tarefas

Quando o usuario perguntar sobre tarefas, interprete os filtros e consulte o banco.

## Interpretar filtros

Da mensagem do usuario, extraia:
- **status**: `pendente`, `em_andamento`, `concluida`, `cancelada` (default: pendente + em_andamento)
- **setor**: se mencionou um setor especifico
- **colaborador**: se perguntou sobre uma pessoa
- **propriedade**: default Labareda

## Query base

```sql
SELECT
  t.id,
  t.comando_original,
  t.setor_interpretado,
  t.status,
  t.prioridade,
  t.data_limite,
  t.porcentagem_conclusao,
  t.created_at,
  t.origem,
  c.nome as responsavel
FROM tarefas t
LEFT JOIN colaboradores c ON c.id = t.responsavel_id
WHERE t.status IN ('pendente', 'em_andamento')
  AND t.propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6'
ORDER BY
  CASE t.prioridade
    WHEN 'urgente' THEN 1
    WHEN 'alta' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'baixa' THEN 4
  END,
  t.created_at DESC
LIMIT 20;
```

### Filtros opcionais (adicionar ao WHERE)

**Por setor:**
```sql
AND t.setor_interpretado ILIKE '%{setor}%'
```

**Por colaborador:**
```sql
AND c.nome ILIKE '%{nome}%'
```

**Por status especifico:**
```sql
AND t.status = '{status}'
```

**Tarefas concluidas hoje:**
```sql
AND t.status = 'concluida'
AND t.concluida_at >= CURRENT_DATE
```

**Tarefas atrasadas:**
```sql
AND t.data_limite < NOW()
AND t.status IN ('pendente', 'em_andamento')
```

## Formato de resposta

```
📋 {N} tarefa(s) encontrada(s):

1. {descricao}
   🏷️ {setor} | ⚡ {prioridade} | 📊 {porcentagem}%
   👤 {responsavel ou "sem responsavel"}

2. ...
```

Se nao encontrar tarefas:
```
✅ Nenhuma tarefa pendente! Tudo em dia.
```

## Exemplos de perguntas

- "quais tarefas pendentes?" → listar pendentes + em_andamento
- "o que o Carlos tem pra fazer?" → filtrar por colaborador Carlos
- "tarefas de jardinagem" → filtrar por setor jardinagem
- "tarefas concluidas hoje" → filtrar concluidas do dia
- "tarefas atrasadas" → filtrar por data_limite < hoje
- "quanto % da tarefa X?" → buscar porcentagem especifica
