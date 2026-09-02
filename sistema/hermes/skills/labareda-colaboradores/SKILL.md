---
name: labareda-colaboradores
description: Gerencia colaboradores do sistema Labareda. Use quando perguntarem sobre a equipe, quem trabalha em qual setor, informacoes de contato, ou pedirem para listar os colaboradores.
compatibility: Requer MCP Supabase conectado com execute_sql
---

# Gerenciar Colaboradores

## Listar equipe

```sql
SELECT
  c.nome,
  c.funcao,
  c.telefone,
  s.nome as setor,
  c.ativo
FROM colaboradores c
LEFT JOIN setores s ON s.id = c.setor_id
WHERE c.propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6'
  AND c.ativo = true
ORDER BY s.nome, c.nome;
```

## Buscar colaborador especifico

```sql
SELECT
  c.nome,
  c.funcao,
  c.telefone,
  s.nome as setor,
  c.ativo,
  (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = c.id AND t.status IN ('pendente', 'em_andamento')) as tarefas_pendentes,
  (SELECT COUNT(*) FROM tarefas t WHERE t.responsavel_id = c.id AND t.status = 'concluida' AND t.concluida_at >= CURRENT_DATE - INTERVAL '7 days') as concluidas_semana
FROM colaboradores c
LEFT JOIN setores s ON s.id = c.setor_id
WHERE c.nome ILIKE '%{nome}%'
  AND c.ativo = true;
```

## Listar por setor

```sql
SELECT c.nome, c.funcao, c.telefone
FROM colaboradores c
LEFT JOIN setores s ON s.id = c.setor_id
WHERE s.nome ILIKE '%{setor}%'
  AND c.ativo = true
  AND c.propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6'
ORDER BY c.nome;
```

## Formato de resposta

**Lista geral:**
```
👥 Equipe Sitio Labareda:

🌿 Jardinagem:
  - Carlos — {funcao}
  - Wendel — {funcao}
  - Rai — {funcao}

🧹 Limpeza:
  - Queila — {funcao}
  - Nane — {funcao}

🍳 Cozinha:
  - Kali — {funcao}

⚙️ Servicos Gerais:
  - Abel — {funcao}

📑 Administrativo:
  - Junior — {funcao}
```

**Colaborador especifico:**
```
👤 {nome}
🏷️ Setor: {setor}
💼 Funcao: {funcao}
📱 Telefone: {telefone}
📋 Tarefas pendentes: {N}
✅ Concluidas esta semana: {N}
```
