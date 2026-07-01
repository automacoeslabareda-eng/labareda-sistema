# Sistema Sítio Labareda

Sistema modular de agentes de IA para gestao, e-commerce, marketing e site institucional.

**Cliente:** Sitio Labareda Pousada e Hospedagem LTDA
**Operador:** Marcos Diego Pacheco (Telegram)
**Contrato:** PRD-001 / Anexo I

## Estrutura de Modulos

```
sistema/
├── modulo-1-gestao-equipes/   # Gestao de Equipes via Telegram (Labareda)
├── modulo-2-ecommerce/        # E-commerce Sob Medida + Automacao
├── modulo-3-marketing/        # Marketing & Trafego (COMUNIK)
├── modulo-4-dashboard/        # Dashboard Web Transversal
├── modulo-5-site-institucional/ # Site Institucional Labareda
├── modulo-6-sao-miguel/       # Sistema Sao Miguel (clone Modulo 1, isolado)
└── shared/                    # Codigo e config compartilhados
```

## Ondas de Entrega

| Onda | Modulos | Status |
|------|---------|--------|
| 1    | Modulo 1 + Modulo 6 | Em andamento |
| 2    | Modulo 2 (E-commerce) | Pendente |
| 3    | Modulo 3 + 4 + 5 | Pendente |

## Stack Tecnologica

- **Orquestracao:** n8n self-hosted (VPS do cliente)
- **Banco de dados:** Supabase self-hosted (VPS do cliente)
- **Telegram:** Telegram Bot API (comando por linguagem natural)
- **WhatsApp:** Evolution API (disparo de tarefas para colaboradores)
- **IA:** Agentes LLM (interpretacao de comandos)
- **Pagamento:** Mercado Pago (Modulo 2)
- **Site:** Loja sob medida + Site institucional
- **Video:** Higgsfield ou equivalente (Modulo 3)
