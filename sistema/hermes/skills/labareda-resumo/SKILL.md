---
name: labareda-resumo
description: Gera resumo operacional do sistema Labareda. Use quando pedirem status geral, resumo do dia, como estao as coisas, dashboard, visao geral, ou relatorio rapido das propriedades.
compatibility: Requer MCP Supabase conectado com execute_sql
---

# Resumo Operacional

Quando pedirem um resumo/status, gere uma visao consolidada das operacoes.

## Query de resumo geral

```sql
SELECT
  (SELECT COUNT(*) FROM colaboradores WHERE ativo = true AND propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6') as total_colaboradores,
  (SELECT COUNT(*) FROM tarefas WHERE status IN ('pendente', 'em_andamento') AND propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6') as tarefas_ativas,
  (SELECT COUNT(*) FROM tarefas WHERE status = 'concluida' AND concluida_at >= CURRENT_DATE AND propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6') as concluidas_hoje,
  (SELECT COUNT(*) FROM tarefas WHERE status IN ('pendente', 'em_andamento') AND data_limite < NOW() AND propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6') as atrasadas,
  (SELECT COUNT(*) FROM tarefas WHERE status = 'pendente' AND prioridade = 'urgente' AND propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6') as urgentes;
```

## Query por setor

```sql
SELECT
  t.setor_interpretado as setor,
  COUNT(*) FILTER (WHERE t.status = 'pendente') as pendentes,
  COUNT(*) FILTER (WHERE t.status = 'em_andamento') as em_andamento,
  COUNT(*) FILTER (WHERE t.status = 'concluida' AND t.concluida_at >= CURRENT_DATE) as concluidas_hoje
FROM tarefas t
WHERE t.propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6'
  AND t.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY t.setor_interpretado
ORDER BY pendentes DESC;
```

## Query de produtividade por colaborador

```sql
SELECT
  c.nome,
  COUNT(*) FILTER (WHERE t.status IN ('pendente', 'em_andamento')) as pendentes,
  COUNT(*) FILTER (WHERE t.status = 'concluida' AND t.concluida_at >= CURRENT_DATE - INTERVAL '7 days') as concluidas_semana
FROM colaboradores c
LEFT JOIN tarefas t ON t.responsavel_id = c.id
WHERE c.ativo = true
  AND c.propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6'
GROUP BY c.id, c.nome
ORDER BY pendentes DESC;
```

## Formato de resposta

```
📊 Resumo — Sitio Labareda
📅 {data de hoje}

👥 Equipe: {total} colaboradores ativos
📋 Tarefas ativas: {N}
✅ Concluidas hoje: {N}
⚠️ Atrasadas: {N}
🔴 Urgentes: {N}

📊 Por setor:
🌿 Jardinagem: {pendentes} pendentes, {concluidas} feitas
🧹 Limpeza: ...
🍳 Cozinha: ...
🔧 Manutencao: ...
⚙️ Servicos gerais: ...
📑 Administrativo: ...

👤 Equipe:
- Carlos: {pendentes} pendentes, {concluidas} feitas na semana
- Queila: ...
- ...
```

Se pedirem de Sao Miguel, usar propriedade_id `4a5580bb-9971-40c9-9409-ffbe0cff65da`.
Se pedirem de ambas, rodar queries para as duas e consolidar.
