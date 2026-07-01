# Modulo 1 — Gestao de Equipes via Telegram (Labareda)

**Objetivo:** Permitir que o Marcos comande a operacao interna do hotel pelo celular, criando e distribuindo tarefas por linguagem natural.

**Propriedade:** Sitio Labareda (Serra Grande, BA)

## Funcionalidades

- [ ] Cadastro de colaboradores (nome, telefone, funcao: jardinagem, limpeza, servico de quarto)
- [ ] Comando por linguagem natural no Telegram (agente interpreta setor e monta checklist)
- [ ] Disparo automatico das tarefas a cada colaborador via WhatsApp
- [ ] Painel do colaborador para marcar itens concluidos e registrar observacoes
- [ ] Rotina semanal recorrente (lembretes e checklists automaticos)
- [ ] Relatorio semanal consolidado em PDF (disponibilizado via Telegram)
- [ ] Acompanhamento centralizado de pendencias e observacoes

## Arquitetura

```
Marcos (Telegram) → Bot Telegram → n8n → Agente LLM → Supabase
                                      ↓
                            Evolution API (WhatsApp) → Colaboradores
                                      ↓
                            Painel Web (colaborador marca conclusao)
```

## Stack

| Componente | Tecnologia |
|-----------|------------|
| Comando | Telegram Bot API |
| Orquestracao | n8n self-hosted |
| IA | Agente LLM (interpretacao) |
| Banco de dados | Supabase self-hosted |
| Disparo tarefas | Evolution API (WhatsApp) |
| Relatorios | PDF gerado automaticamente |

## Estrutura de Pastas

```
modulo-1-gestao-equipes/
├── src/              # Codigo fonte
├── n8n-flows/        # Workflows n8n exportados
├── telegram-bot/     # Configuracao e handlers do bot
├── whatsapp/         # Templates e config Evolution API
└── supabase/
    └── migrations/   # DDL do banco de dados
```
