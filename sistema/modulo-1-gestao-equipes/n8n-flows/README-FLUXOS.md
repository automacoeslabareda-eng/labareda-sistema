# Fluxos n8n — Gestao de Equipes

Instancia: https://n8n.sitiolabareda.com
Painel do colaborador: **https://painel.sitiolabareda.com** (unico endereco valido)

## Os dois fluxos que sustentam a operacao

| Arquivo | Workflow no n8n | Quando roda |
|---|---|---|
| `cron-rotinas-diarias.json` | Cron - Rotinas Diarias | todo dia 07h00 (America/Bahia) |
| `avisos-whatsapp-colaboradores.json` | Avisos WhatsApp - Colaboradores | 07h15 (resumo) + 10 em 10 min das 6h as 20h (vigia) |

### Cron - Rotinas Diarias
Le `rotinas_semanais` + `rotina_items` e gera as `tarefas` e os
`checklist_items` do dia. Um unico node Code faz tudo — nao ha
`splitInBatches`, e por isso nao ha perda de itens.

Quando cada frequencia dispara:

| frequencia | gera | por que |
|---|---|---|
| `diaria` | todo dia | — |
| `semanal` | no `dia_semana` da rotina | se o cron falhar, gera no proximo dia da mesma semana (catch-up) |
| `quinzenal` | dia 1 e dia 16 | abre no inicio da quinzena para ficar a semana toda visivel no painel |
| `mensal` | dia 1 | abre no inicio do mes pelo mesmo motivo |

Deduplicacao e por **periodo**, nao por "hoje": a rotina semanal so gera
outra vez na semana seguinte, mesmo que o workflow rode varias vezes.

### Avisos WhatsApp - Colaboradores
Ponto **unico** de notificacao. Qualquer origem de tarefa (rotina, Hermes,
bot do Telegram, dashboard) e coberta por ele. Faz tres coisas:

1. **Sincroniza** — tarefa com `responsavel_id` mas sem `checklist_items`
   ganha um item. Sem isso ela nao apareceria no painel de ninguem.
2. **Avisa** — uma mensagem por colaborador, com os itens separados em
   Hoje / Da semana / Da quinzena / Do mes, atrasados destacados, e o
   link do painel.
3. **Marca** — grava `whatsapp_enviado = true` para nao repetir.

Modos:
- `resumo` (07h15) — tudo que esta pendente
- `novos` (10 em 10 min) — so `checklist_items` com `whatsapp_enviado = false`

**Sexta-feira** o resumo muda de tom sozinho: vira cobranca de fechamento
("Hoje e sexta — dia de fechar a semana", prazo ate 16:30) e leva email +
senha do colaborador, para ninguem travar na hora de entrar. Isso substitui
o antigo `cron-lembrete-sexta`, que era um workflow separado e por isso
mandava uma segunda mensagem no mesmo dia.

> Para avisar alguem de uma tarefa nova, **nao mande WhatsApp**: basta
> criar o `checklist_items` com `whatsapp_enviado = false`. O vigia pega
> em ate 10 minutos.

Disparo manual:
```
POST https://n8n.sitiolabareda.com/webhook/gerar-rotinas
POST https://n8n.sitiolabareda.com/webhook/avisar-colaboradores  {"modo":"resumo"}
```

## Desativados

| Workflow | Motivo |
|---|---|
| WhatsApp - Notificar Rotinas aos Colaboradores | mandava uma segunda mensagem por dia para o mesmo colaborador, com texto fixo de `rotinas_semanais.msg_whatsapp` |
| Cron - Lembretes Mensais (Dias 5, 15, 25) | tinha `rotina_id` e `setor_id` fixos no codigo; agora as rotinas quinzenais/mensais cobrem isso |
| `cron-lembrete-sexta.json` | removido. Mandava `sitiolabareda.com/painel`, que cai no site institucional, e duplicaria a mensagem de sexta. O lembrete de sexta agora e um ramo do fluxo de avisos |

## Armadilhas conhecidas do n8n (nao repetir)

1. **`$input.item` em node `runOnceForAllItems`** — devolve so o primeiro
   item e engole silenciosamente o resto. Era isso que fazia 19 rotinas
   virarem 1 tarefa por dia, e um checklist de 18 itens virar 1 item. Em
   `runOnceForAllItems` use `$input.all()`.
2. **`fetch` nao existe** no sandbox do Code node desta instancia. Use
   `this.helpers.httpRequest({ method, url, headers, body, json: true })`.
3. **Trigger "a cada N horas"** nao e "todo dia as N horas". Os dois crons
   estavam como `hoursInterval: 8` e `hoursInterval: 10` — disparavam em
   horarios que iam andando. Use `cronExpression` e deixe o timezone do
   workflow em `America/Bahia`.
4. **Loop `splitInBatches` sem aresta de volta** processa so o primeiro
   lote. Se der para resolver num Code node so, resolva.

## Senha do painel

Todos os colaboradores ativos usam a senha padrao `123456`, por decisao do
dono do sistema (02/09/2026) — o login e o email (`abel@labareda.com`).
A senha e enviada no WhatsApp junto do lembrete de sexta. Se um dia isso
mudar, o unico lugar a ajustar e `colaboradores.senha_hash`; o fluxo le a
senha de la, nao tem valor fixo no codigo.

## Testar sem enviar WhatsApp

O `avisar-colaboradores.js` manda mensagem de verdade assim que roda. Para
inspecionar o texto sem disparar nada, gere a versao dry-run — ela troca o
transporte HTTP por um que so faz GET e recusa qualquer escrita ou envio:

```
node mkdry.cjs avisar-colaboradores.js dry.mjs [--sexta]
node dry.mjs resumo
```

> Nunca teste esse fluxo apontando `fetch` real para o webhook de envio.
> Ja aconteceu de um "dry-run" mandar 8 mensagens porque o bloqueio dependia
> de uma regex que parou de casar depois de um refactor.
