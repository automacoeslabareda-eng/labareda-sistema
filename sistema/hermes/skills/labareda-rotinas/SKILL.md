---
name: labareda-rotinas
description: Gerencia rotinas recorrentes (diarias, semanais, quinzenais e mensais) do sistema Labareda. Use quando perguntarem sobre rotinas, tarefas recorrentes, o que tem programado pra cada dia, ou pedirem para criar/listar/alterar rotinas.
compatibility: Requer MCP Supabase conectado com execute_sql
---

# Gerenciar Rotinas

Rotina e um modelo de tarefa que se repete. Ela **nao** e a tarefa em si:
todo dia as 07h00 o workflow *Cron - Rotinas Diarias* (n8n) le as rotinas
ativas, decide quais vencem hoje e gera as `tarefas` + `checklist_items`
correspondentes no painel dos colaboradores.

Voce mexe no **molde** (rotina). Quem gera a tarefa do dia e o n8n.

## Como cada frequencia dispara

| frequencia | quando o n8n gera | fica visivel no painel ate |
|---|---|---|
| `diaria` | todo dia | ser concluida |
| `semanal` | no `dia_semana` da rotina; se falhar, no proximo dia da mesma semana | ser concluida |
| `quinzenal` | 1x por quinzena, ja no dia 1 e no dia 16 | ser concluida |
| `mensal` | 1x por mes, ja no dia 1 | ser concluida |

Quinzenal e mensal abrem no inicio do periodo de proposito: assim o
colaborador enxerga esse checklist durante o periodo inteiro, e nao so no
dia em que a rotina venceria.

`dia_semana`: 0=domingo, 1=segunda, 2=terca, 3=quarta, 4=quinta, 5=sexta, 6=sabado.

## Listar rotinas

### Todas as rotinas ativas
```sql
SELECT
  r.id, r.nome, r.frequencia, r.dia_semana, r.ativo,
  s.nome AS setor,
  c.nome AS responsavel,
  (SELECT COUNT(*) FROM rotina_items ri WHERE ri.rotina_id = r.id) AS total_items
FROM rotinas_semanais r
LEFT JOIN setores s ON s.id = r.setor_id
LEFT JOIN colaboradores c ON c.id = r.responsavel_id
WHERE r.propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6'
  AND r.ativo = true
ORDER BY r.frequencia, r.dia_semana, r.nome;
```

### Rotinas de um dia especifico
```sql
SELECT r.id, r.nome, r.frequencia, s.nome AS setor, c.nome AS responsavel
FROM rotinas_semanais r
LEFT JOIN setores s ON s.id = r.setor_id
LEFT JOIN colaboradores c ON c.id = r.responsavel_id
WHERE r.propriedade_id = '229e2813-6d46-4bdb-9aee-5d9a119733e6'
  AND r.dia_semana = {dia}
  AND r.ativo = true
ORDER BY r.nome;
```

### Itens de uma rotina
```sql
SELECT ri.ordem, ri.descricao, c.nome AS colaborador
FROM rotina_items ri
LEFT JOIN colaboradores c ON c.id = ri.colaborador_id
WHERE ri.rotina_id = '{rotina_id}'
ORDER BY ri.ordem;
```

### Conferir se a rotina esta gerando tarefa
Util quando alguem reclama que "nao chegou a rotina":
```sql
SELECT r.nome, r.frequencia, MAX(t.created_at) AS ultima_geracao
FROM rotinas_semanais r
LEFT JOIN tarefas t ON t.rotina_id = r.id
WHERE r.ativo = true
GROUP BY r.id, r.nome, r.frequencia
ORDER BY ultima_geracao NULLS FIRST;
```

## Criar rotina

### 1. Buscar setor e responsavel
```sql
SELECT id FROM setores WHERE nome ILIKE '%{setor}%' LIMIT 1;
SELECT id, nome FROM colaboradores WHERE nome ILIKE '%{nome}%' AND ativo = true LIMIT 1;
```

### 2. Inserir a rotina
```sql
INSERT INTO rotinas_semanais (
  nome, descricao, frequencia, dia_semana,
  setor_id, responsavel_id, propriedade_id, ativo
) VALUES (
  '{nome}', '{descricao}',
  '{diaria|semanal|quinzenal|mensal}',
  {dia_semana},
  '{setor_id}', '{responsavel_id}',
  '229e2813-6d46-4bdb-9aee-5d9a119733e6', true
)
RETURNING id;
```

### 3. Inserir os itens
Cada item precisa de `colaborador_id` e `propriedade_id` — e o que faz o
item cair no painel da pessoa certa. Se todos os itens sao da mesma
pessoa, repita o `responsavel_id` da rotina.

```sql
INSERT INTO rotina_items (rotina_id, propriedade_id, colaborador_id, descricao, ordem)
VALUES
  ('{rotina_id}', '{propriedade_id}', '{colaborador_id}', '{item_1}', 1),
  ('{rotina_id}', '{propriedade_id}', '{colaborador_id}', '{item_2}', 2);
```

> Rotina sem item nao gera nada. O n8n pula rotina vazia.

## Alterar / desligar rotina

```sql
UPDATE rotinas_semanais SET frequencia = '{nova}', updated_at = now() WHERE id = '{rotina_id}';
UPDATE rotinas_semanais SET ativo = false, updated_at = now() WHERE id = '{rotina_id}';
```

## Gerar agora, sem esperar as 07h

Se o usuario pedir para adiantar a geracao do dia, diga que da para
disparar manualmente pelo n8n (workflow *Cron - Rotinas Diarias*,
node "Disparo Manual"). Voce nao precisa criar as tarefas na mao.

## Formato de resposta

**Lista por dia:**
```
📅 Rotinas — Sitio Labareda:

📌 Segunda:
  - {nome} ({frequencia}) — {setor} — {responsavel}

📌 Terca:
  - ...
```

**Rotina especifica:**
```
📋 Rotina: {nome}
🔁 {frequencia} — {dia da semana}
🏷️ Setor: {setor}
👤 Responsavel: {nome}
📝 Itens:
  1. {item}
  2. {item}
```

**Rotina criada:**
```
✅ Rotina criada!
📋 {nome}
🔁 {frequencia} — toda {dia}
🏷️ Setor: {setor}
👤 Responsavel: {nome}
📝 {N} itens no checklist

O painel de {nome} recebe essa rotina na proxima geracao (todo dia 07h00).
👉 Painel: https://painel.sitiolabareda.com
```
