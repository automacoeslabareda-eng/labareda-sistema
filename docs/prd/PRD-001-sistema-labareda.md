# PRD-001 — Sistema Sítio Labareda

**Produto:** Sistema de Gestão, E-commerce, Comunicação e Site Institucional
**Cliente:** Sítio Labareda Pousada e Hospedagem LTDA (CNPJ: 61.691.405/0001-08)
**Contratada:** Adabtech (62.880.271 Adávio Luiz Costa Tittoni)
**Versão:** 1.0 — Draft Inicial
**Data:** 2026-06-25
**Autor:** Orion (@aiox-master) → delegado a @pm (Morgan) para refinamento
**Status:** DRAFT
**Ref. contratual:** Contrato de Prestação de Serviços + Anexo I — Escopo Técnico

---

## 1. Visão do Produto

### 1.1 Declaração de Visão

Construir um **sistema modular de agentes de IA** que permite ao proprietário do Sítio Labareda comandar toda a operação — hotel, loja, marketing e site — diretamente pelo Telegram, com uma camada web (Dashboard + Site Institucional) como complemento desktop.

### 1.2 Problema

O Sítio Labareda opera duas propriedades (Labareda e São Miguel) com processos manuais: gestão de equipes via comunicação informal, vendas sem automação, marketing sem pipeline criativo e sem presença institucional na web. O proprietário (Marcos Diego Pacheco) precisa comandar tudo pelo celular, de forma rápida e por linguagem natural.

### 1.3 Proposta de Valor

| Para | O sistema oferece |
|------|-------------------|
| **Marcos (operador)** | Comando centralizado via Telegram, linguagem natural, relatórios automáticos |
| **Equipe de colaboradores** | Recebem tarefas via WhatsApp, marcam conclusão, feedback automatizado |
| **Clientes da loja** | Experiência de compra sob medida, checkout rápido, frete claro |
| **Visitantes do site** | Presença institucional autêntica da marca ROÇA e ARTE |
| **Hóspedes potenciais** | Booking facilitado, redirecionamento Airbnb configurável |

### 1.4 Marca e Identidade

- **Slogan:** ROÇA e ARTE
- **Voz:** Quente, folclórica, sensorial — anos 70 + design mexicano + tropicalismo baiano
- **Localização:** Serra Grande, Costa do Cacau, Sul da Bahia
- **Teste de marca:** "Isto soa como ROÇA e ARTE? Está quente, folclórico, autêntico? Gritaria Costa do Cacau, anos 70 e mão humana à primeira vista?"

---

## 2. Personas e Público-Alvo

### 2.1 Operador do Sistema

- **Marcos Diego Pacheco** — Sócio administrador, ponto focal / ordenador
- Comanda via Telegram, espera retornos pelo Telegram
- Precisa de interface simples, linguagem natural, sem fricção técnica

### 2.2 Personas de Negócio (4 perfis)

| # | Persona | Frente | Perfil |
|---|---------|--------|--------|
| **P1** | O Casal em Busca de Refúgio | Hospedagem (BR) | Casais 25-67, SP/RJ/DF + BA, classe A/B, slow travel, orgânicos |
| **P2** | Lukas & Sofia, os Tropicalistas | Hospedagem (INT) | Casais 28-58, Europa + circuito Ibiza/Tulum/Bali, wellness/design |
| **P3** | Marina, a Consumidora Consciente | E-commerce (cosméticos) | Mulheres/LGBTQI+ 20-60, capitais BR, clean beauty, consumo consciente |
| **P4** | A Tribo da Arte Manual | E-commerce (arte) | Artistas/colecionadores 20-68, BR foco Sudeste, arte manual/analógico |

### 2.3 Ponte Cruzada (estratégia-chave)

Hóspede vira cliente do e-commerce; cliente do e-commerce sonha em ir à fonte. Toda interface deve plantar a semente da outra porta.

---

## 3. Arquitetura e Premissas Técnicas

### 3.1 Stack Tecnológica

| Componente | Tecnologia | Hospedagem |
|-----------|-----------|------------|
| **Banco de dados** | Supabase self-hosted | VPS da contratante |
| **Orquestração / automação** | n8n self-hosted | VPS da contratante |
| **Agentes de IA** | LLM (API externa) | API cloud |
| **Comando** | Telegram Bot API | Telegram Cloud |
| **Disparo para equipe** | Evolution API (WhatsApp) | VPS da contratante |
| **Pagamento** | Mercado Pago | SaaS |
| **Loja** | Código próprio (sob medida) | VPS da contratante |
| **Site institucional** | Código próprio | VPS da contratante |
| **Dashboard** | Código próprio (web) | VPS da contratante |
| **Criativos em vídeo** | Higgsfield ou equivalente | API cloud |
| **Armazenamento** | Supabase Storage | VPS da contratante |

### 3.2 Arquitetura de Agentes

```
                    MARCOS (Telegram)
                         │
                   ┌─────┼─────┐
                   ▼     ▼     ▼
              AGENTE   AGENTE  AGENTE
              EQUIPE   ECOM    COMUNIK
              & GESTÃO        (Mkt/Tráfego)
                │        │        │
           subagentes subagentes subagentes
                │        │        │
           WhatsApp   Loja     Meta Ads
           (equipe)   Checkout  Criativos
```

- **Camada de orquestração superior** coordena os 3 agentes master
- **Cada agente** tem subagentes especializados
- **Comando e retornos** centralizados no Telegram
- **Dashboard Web** como visualização complementar

### 3.3 Premissas de Infraestrutura

- VPS contratada e mantida pela CONTRATANTE (ela detém o ambiente)
- Custo recorrente estimado: R$ 180–350/mês
- Portabilidade nativa: o ambiente é da contratante
- Separação total de dados entre Labareda e São Miguel (Módulo 6)

---

## 4. Módulos — Requisitos Funcionais

### MÓDULO 1 — Gestão de Equipes via Telegram (Labareda)

**Objetivo:** Permitir que Marcos comande a operação interna do hotel pelo celular, criando e distribuindo tarefas por linguagem natural.

#### Funcionalidades Requeridas (FR)

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-1.1 | Cadastro de colaboradores | MUST | Nome, telefone, função (jardinagem, limpeza, serviço de quarto) |
| FR-1.2 | Comando por linguagem natural | MUST | Agente interpreta setor e monta checklist automaticamente |
| FR-1.3 | Disparo automático via WhatsApp | MUST | Tarefas enviadas a cada colaborador via Evolution API |
| FR-1.4 | Painel do colaborador | MUST | Marcar itens concluídos + registrar observações |
| FR-1.5 | Rotina semanal recorrente | MUST | Lembretes e checklists disparados automaticamente |
| FR-1.6 | Relatório semanal PDF | MUST | Gerado automaticamente, enviado pelo Telegram para sócios |
| FR-1.7 | Acompanhamento centralizado | MUST | Visão de feito, pendências e observações por equipe |

#### Fluxo Principal

```
Marcos (Telegram) → "Jardinagem: podar as palmeiras da entrada e regar a horta"
    → Agente interpreta: setor=jardinagem, gera checklist
    → WhatsApp dispara para colaborador(es) de jardinagem
    → Colaborador marca conclusão no painel
    → Marcos recebe confirmação no Telegram
    → Fim da semana: relatório PDF consolidado no Telegram
```

---

### MÓDULO 2 — E-commerce Sob Medida + Automação

**Objetivo:** Loja online própria da marca com automação que transforma cada venda em fluxo operacional reportado pelo Telegram.

#### 2A — Loja Sob Medida

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-2.1 | Loja online com design próprio | MUST | Vestuário, chocolates, artes e cosméticos |
| FR-2.2 | Catálogo de produtos | MUST | Gestão de produtos, categorias, imagens |
| FR-2.3 | Carrinho de compras | MUST | Persistente, multi-produto |
| FR-2.4 | Checkout em 3 passos | MUST | Com cadastro rápido |
| FR-2.5 | Pagamento Mercado Pago | MUST | Pix + cartão |
| FR-2.6 | Etiqueta de envio (Mercado Pago) | MUST | Preparação automática |
| FR-2.7 | Cálculo de frete fixo | MUST | Tabela pré-configurada pela contratante |

#### 2B — Camada de Automação (pós-venda)

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-2.8 | Comprovante de venda + NFSe (Mercado Pago) | MUST | Geração automática |
| FR-2.9 | Preparação de etiqueta/frete | MUST | Automático pós-pagamento |
| FR-2.10 | Baixa automática no estoque | MUST | Decremento ao confirmar pagamento |
| FR-2.11 | Alerta de estoque baixo | MUST | Quando < 5 unidades |
| FR-2.12 | Aviso no Telegram | MUST | Cliente, produto e valor da venda |

#### Fluxo de Venda

```
Cliente → Loja → Carrinho → Checkout (3 passos) → Pag. Mercado Pago
    → Confirmação de pagamento
        → Comprovante gerado
        → Etiqueta preparada
        → Estoque atualizado
        → Alerta Telegram para Marcos: "Venda: [produto] R$ [valor] — [cliente]"
        → Se estoque < 5: alerta adicional
```

#### Design e UX da Loja

Conforme documento "Estrutura das Páginas de Venda":
- **Mobile-first** (tráfego vem de Instagram/TikTok)
- **Estética ROÇA e ARTE:** cores terrosas, tipografia retrô, grão de filme
- **Categorias:** Cosméticos naturais + Arte (Estúdio Tartaruga)
- **Checkout:** Pix com incentivo + cartão parcelado
- **Ponte:** toda página da loja planta semente da hospedagem

---

### MÓDULO 3 — Marketing & Tráfego (COMUNIK)

**Objetivo:** Automatizar criação de conteúdo e tráfego pago para Reservas (Airbnb) e Produtos (E-commerce), com ativação via Telegram.

#### 3A — Camada de Criação de Conteúdo

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-3.1 | Geração de copies por IA | MUST | Para frentes Reservas e Produtos |
| FR-3.2 | Geração de criativos em vídeo | MUST | A partir de fotos (Higgsfield ou equiv.) |
| FR-3.3 | Armazenamento de conteúdos | MUST | Organização no Supabase |

#### 3B — Camada de Integração de Campanha

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-3.4 | Montagem de campanhas Meta Ads | MUST | Seguindo estrutura de 4 personas |
| FR-3.5 | Apoio à definição de investimento | MUST | Sugestão de budget por campanha |
| FR-3.6 | Ativação via Telegram | MUST | Orquestração de campanhas pelo chat |

#### Estrutura de Campanhas (ref. doc Conjuntos de Anúncios)

| Campanha | Persona | Estágio | Budget/dia sugerido |
|----------|---------|---------|-------------------|
| HOSP-P1-TOPO/MEIO/FUNDO | P1 Casal-Refúgio | Funil completo | R$ 40-70/dia |
| HOSP-P2-TOP/MID/BOT (EN) | P2 Tropicalistas | Funil completo | R$ 60-110/dia |
| ECOM-P3-TOPO/MEIO/FUNDO | P3 Marina | Funil completo | R$ 30-80/dia |
| ECOM-P4-TOPO/MEIO/FUNDO | P4 Tribo Arte | Funil completo | R$ 25-70/dia |
| PONTE-CRUZADA | P1↔P3 / P3↔P1 | Cross-sell | R$ 20-40/dia |

---

### MÓDULO 4 — Dashboard Web Transversal

**Objetivo:** Camada web para visualização e ajuste das operações em ambiente desktop.

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-4.1 | Visualização consolidada | MUST | Produtos, estoque, vendas, conteúdos |
| FR-4.2 | Cadastro/edição de produtos | MUST | CRUD completo de produtos |
| FR-4.3 | Ajuste manual de estoque | MUST | Complementar à baixa automática |
| FR-4.4 | Visualização de conteúdos COMUNIK | MUST | Conteúdos gerados pelo Módulo 3 |
| FR-4.5 | Autenticação | MUST | Usuário + senha, perfis de acesso |

---

### MÓDULO 5 — Site Institucional Labareda

**Objetivo:** Presença institucional da marca na web com seções editáveis e integração com canais.

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-5.1 | Página About | MUST | Texto institucional + embed de vídeo |
| FR-5.2 | Página Booking | MUST | Redirecionamento para Airbnb (link configurável) |
| FR-5.3 | Página Journal (blog) | MUST | Fluxo: fotos/textos/áudios → subagente Telegram → validação → publicação |
| FR-5.4 | Página Radio | MUST | Integração Spotify, upload/edição de playlists |
| FR-5.5 | Página Shop | MUST | Integração visual com loja (Módulo 2) |
| FR-5.6 | Página Contact | MUST | Formulário (nome, e-mail, mensagem) → envio por e-mail |

#### Estrutura de Páginas do Site (ref. doc Estrutura)

- **Hero:** Vídeo/imagem full com headline "Não é um quarto com vista. É uma vida por alguns dias."
- **Header fixo:** Início · Acomodações · A Roça · Experiências · Arredores · [Reservar]
- **Blocos:** Prova/experiência → Sítio/Roça → Acomodações → Café orgânico → Arredores → Estúdio Tartaruga → Depoimentos → FAQ → CTA Reserva → Rodapé com ponte para loja
- **Toggle idioma:** PT-BR / EN (para P2)
- **Mobile-first**

---

### MÓDULO 6 — Sistema São Miguel

**Objetivo:** Gestão de equipe para a segunda propriedade, isolamento total do sistema Labareda.

| ID | Funcionalidade | Prioridade | Detalhes |
|----|---------------|-----------|---------|
| FR-6.1 | Sistema independente | MUST | Banco próprio, bot Telegram separado |
| FR-6.2 | Cadastro de colaboradores SM | MUST | Colaboradores da propriedade São Miguel |
| FR-6.3 | Comando linguagem natural | MUST | Mesmos moldes do Módulo 1 |
| FR-6.4 | Disparo WhatsApp | MUST | Mesmo padrão do Módulo 1 |
| FR-6.5 | Painel + rotina + relatório | MUST | Idênticos ao Módulo 1 |

**Não incluído:** E-commerce, COMUNIK, Dashboard ou Site para São Miguel.

---

## 5. Requisitos Não-Funcionais (NFR)

| ID | Requisito | Detalhes |
|----|-----------|---------|
| NFR-1 | **Performance** | Tempo de resposta do agente Telegram < 5s para comandos simples |
| NFR-2 | **Disponibilidade** | 99% uptime (VPS gerenciada pela contratante) |
| NFR-3 | **Segurança** | Autenticação por perfis, LGPD compliance, dados isolados entre propriedades |
| NFR-4 | **Portabilidade** | Toda infraestrutura na VPS da contratante; portabilidade nativa |
| NFR-5 | **Escalabilidade** | Arquitetura modular permitindo novos agentes via aditivo |
| NFR-6 | **Mobile-first** | Site e loja otimizados para mobile (tráfego Instagram/TikTok) |
| NFR-7 | **Internacionalização** | Site com toggle PT-BR/EN para P2 (hóspedes internacionais) |
| NFR-8 | **SEO** | Domínio único com subpastas/subdomínios para autoridade |

---

## 6. Restrições e Exclusões (CON)

### 6.1 Fora do Escopo (contratual)

| ID | Exclusão | Nota |
|----|---------|------|
| CON-1 | Emissão de NFSe | Apenas comprovante via Mercado Pago |
| CON-2 | Agente financeiro | Orçamento separado se desejado |
| CON-3 | Agente pessoal/assistente (Hermes) | Orçamento separado |
| CON-4 | Devolução automatizada de métricas de campanhas | Não incluído |
| CON-5 | Integração APIs Airbnb | Não incluído |
| CON-6 | Integração Google Calendar/Calendly | Não incluído |
| CON-7 | Ampliação São Miguel (ecom, mkt, dashboard, site) | Orçamento separado |
| CON-8 | Motor de reserva direta | Módulo 5 usa redirecionamento para Airbnb |

### 6.2 Dependências Externas

| Dependência | Responsável | Status |
|------------|------------|--------|
| VPS contratada | CONTRATANTE | Pendente |
| API de IA (LLM) | CONTRATANTE (custo) | Pendente |
| Bot Telegram (token) | CONTRATANTE | Pendente |
| Evolution API (WhatsApp) | CONTRATANTE | Pendente |
| Mercado Pago (credenciais) | CONTRATANTE | Pendente |
| Tabela de frete fixo | CONTRATANTE | Pendente |
| Conteúdo institucional (fotos, textos, vídeos) | CONTRATANTE | Pendente |
| Domínio (labareda.com.br ou equiv.) | CONTRATANTE | A definir |
| Google Drive (integração) | CONTRATANTE | Pendente |
| Spotify (playlists) | CONTRATANTE | Pendente |
| Higgsfield ou equiv. (criativos vídeo) | CONTRATANTE (custo) | Pendente |

---

## 7. Cronograma e Ondas de Entrega

### 7.1 Prazo Total

**60–90 dias** a partir do início da execução (pós-pagamento 1a parcela + insumos mínimos).

### 7.2 Ondas Sugeridas

| Onda | Módulos | Justificativa | Duração est. |
|------|---------|--------------|-------------|
| **Onda 1** | M1 (Gestão Equipes) + M2 (E-commerce) | Destrava operação do hotel + canal de vendas | 3-4 semanas |
| **Onda 2** | M4 (Dashboard) + M3 (COMUNIK — parcial) | Visualização web + pipeline criativo inicial | 2-3 semanas |
| **Onda 3** | M5 (Site Institucional) + M3 (COMUNIK — completo) | Presença web + campanhas completas | 2-3 semanas |
| **Onda 4** | M6 (São Miguel) | Sistema independente segunda propriedade | 1-2 semanas |

### 7.3 Marcos de Pagamento

| Parcela | Valor | Marco |
|---------|-------|-------|
| 1a | R$ 11.166,67 | Assinatura — início do projeto |
| 2a | R$ 11.166,67 | Homologação — aprovação dos módulos |
| 3a | R$ 11.166,66 | Entrega — go-live e publicação |
| **Total** | **R$ 33.500,00** | |

---

## 8. Métricas de Sucesso

### 8.1 Métricas Operacionais

| Métrica | Meta | Módulo |
|---------|------|--------|
| Tempo de criação de tarefa (comando → disparo) | < 30s | M1 |
| % tarefas concluídas por semana | > 85% | M1 |
| Relatório semanal gerado automaticamente | 100% | M1 |
| Vendas processadas sem intervenção manual | 100% | M2 |
| Alertas de estoque baixo entregues | 100% | M2 |

### 8.2 Métricas de Negócio (ref. doc Campanhas)

| Métrica | Trilha A (Hospedagem) | Trilha B (E-commerce) |
|---------|----------------------|----------------------|
| CTR (link) | ≥ 1,0% (frio) / ≥ 1,5% (remarketing) | ≥ 1,2% (frio) / ≥ 2,0% (remarketing) |
| CAC alvo | ≤ 15-20% do ticket de diária | ≤ 30-40% do ticket médio |
| ROAS alvo | 3x+ | 2,5-4x (1a compra) / 5x+ (recompra) |
| Taxa conversão site | ≥ 1,5% | ≥ 1,5-2,5% |
| Ponte cruzada | % hóspedes → ecommerce | % compradores → hospedagem |

---

## 9. Riscos e Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|--------------|-----------|
| Atraso no envio de insumos pela contratante | Alto | Média | Checklist de insumos na 1a semana |
| APIs externas instáveis (Evolution, Mercado Pago) | Médio | Baixa | Fallback manual + monitoramento |
| Custo de LLM acima do esperado | Médio | Média | Otimização de prompts, cache de respostas |
| VPS subdimensionada | Alto | Baixa | Sizing na 1a semana + recomendações |
| Falta de conteúdo (fotos, textos) para site | Médio | Alta | Pipeline criativo do M3 gera conteúdo |

---

## 10. Garantia e Pós-Entrega

- **60 dias de garantia** pós go-live: testes, ajustes, correções de bugs, treinamento
- **Sustentação mensal** (opcional, valor a combinar): monitoramento, manutenção de agentes, site e ajustes evolutivos
- **Fora da garantia:** novos módulos, novos agentes, mudanças estruturais, integrações adicionais

---

## 11. Checklist de Iniciação do Projeto

### 11.1 Pré-requisitos para Início (Onda 0)

- [ ] **Contrato assinado** por ambas as partes
- [ ] **1a parcela paga** (R$ 11.166,67)
- [ ] **VPS contratada** pela contratante (specs mínimas a definir na 1a semana)
- [ ] **Domínio** definido/registrado (labareda.com.br ou equiv.)
- [ ] **Token do Bot Telegram** (Labareda) criado
- [ ] **Token do Bot Telegram** (São Miguel) criado
- [ ] **Número WhatsApp** para Evolution API separado
- [ ] **Credenciais Mercado Pago** (sandbox + produção)
- [ ] **Tabela de frete fixo** fornecida pela contratante
- [ ] **Acesso ao Google Drive** da contratante
- [ ] **Credenciais Spotify** para integração de playlists
- [ ] **Conteúdo mínimo:** logo vetorizado, fotos do sítio, textos institucionais
- [ ] **API key de LLM** definida (OpenAI / Anthropic / etc.)

### 11.2 Setup Técnico (Onda 0 — CONTRATADA)

- [ ] Instalação do **Supabase self-hosted** na VPS
- [ ] Instalação do **n8n self-hosted** na VPS
- [ ] Configuração da **Evolution API** na VPS
- [ ] Setup do repositório Git do projeto
- [ ] Definição do schema inicial do banco de dados
- [ ] Configuração dos bots do Telegram (Labareda + São Miguel)
- [ ] Configuração do ambiente de desenvolvimento
- [ ] Definição do cronograma detalhado de ondas (em conjunto)

### 11.3 Documentação de Referência Disponível

| Documento | Localização | Conteúdo |
|-----------|------------|---------|
| Contrato + Anexo I | `Contrato_Adabtech_Labareda_atualizado.docx` | Escopo completo, cláusulas, stack |
| Públicos-Alvo (4 Personas) | `documentos/Sítio Labareda - Públicos-Alvo (4 Personas).docx` | P1-P4 detalhados |
| Conjuntos de Anúncios | `documentos/Sítio Labareda - Conjuntos de Anúncios por Persona.docx` | Campanhas Meta/Google prontas |
| Estrutura das Páginas | `documentos/Sítio Labareda - Estrutura das Páginas de Venda.docx` | Wireframe completo site + loja |
| Calendário Editorial | `documentos/Sítio Labareda - Calendário Editorial 90 Dias.docx` | Plano de conteúdo 90 dias |
| Vetores da marca | `documentos/VETORES LABAREDA.pdf` | Assets visuais da marca |
| Referência de sites | `documentos/Sítio Labareda - Referências de Sites.xlsx` | Sites de referência |
| Setores (DOC) | `documentos/DOC SETORES.pages` | Estrutura de setores |
| Screenshot de referência | `documentos/Captura de Tela 2026-06-19 às 13.59.25.png` | Referência visual |

---

## 12. Próximos Passos

1. **Validar este PRD** com o cliente (Marcos) — confirmar prioridades e ondas
2. **Levantar insumos pendentes** (checklist 11.1) — bloqueia início
3. **Definir specs da VPS** e contratar
4. **Criar Epics** por módulo no backlog
5. **Detalhar stories** da Onda 1 (M1 + M2) — @sm para criação, @po para validação
6. **Setup técnico** (Onda 0) — @devops + @data-engineer para infra + schema

---

*PRD-001 — Sistema Sítio Labareda v1.0 — Draft*
*Gerado por Orion (@aiox-master) com base no contrato e documentos de referência*
*Pendente: revisão @pm (Morgan) + validação cliente*
