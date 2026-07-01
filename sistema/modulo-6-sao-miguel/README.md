# Modulo 6 — Sistema Sao Miguel

**Objetivo:** Implementar para a segunda propriedade (Sao Miguel) um sistema de gestao de equipe nos mesmos moldes do Modulo 1, com isolamento total em relacao ao sistema Labareda.

**Propriedade:** Sao Miguel

## Isolamento

- Banco de dados PROPRIO (schema separado ou instancia separada)
- Bot PROPRIO no Telegram (conversa separada)
- Cadastro PROPRIO de colaboradores
- ZERO compartilhamento de dados com Labareda
- Compartilha apenas stack tecnologica e padroes de desenvolvimento

## Funcionalidades (identicas ao Modulo 1)

- [ ] Cadastro de colaboradores da propriedade Sao Miguel
- [ ] Comando por linguagem natural via Telegram
- [ ] Disparo via WhatsApp (Evolution API)
- [ ] Painel do colaborador
- [ ] Rotina semanal recorrente
- [ ] Relatorio semanal consolidado em PDF
- [ ] Acompanhamento centralizado

## Nao Incluido (requer termo aditivo)

- E-commerce para Sao Miguel
- COMUNIK / Marketing para Sao Miguel
- Dashboard para Sao Miguel
- Site Institucional para Sao Miguel

## Estrutura de Pastas

```
modulo-6-sao-miguel/
├── src/              # Codigo fonte
├── n8n-flows/        # Workflows n8n (separados do Modulo 1)
├── telegram-bot/     # Bot proprio (conversa separada)
├── whatsapp/         # Templates Evolution API
└── supabase/
    └── migrations/   # DDL proprio (banco separado)
```
