# PRD-001 Validation Report

**PRD:** PRD-001 -- Sistema Sitio Labareda v1.0
**Validator:** Morgan (@pm)
**Date:** 2026-06-25
**Verdict:** NEEDS_REVISION
**Overall Score:** 3.9 / 5.0

---

## 1. Scoring Summary

| # | Criterion | Score (1-5) | Notes |
|---|-----------|:-----------:|-------|
| 1 | Completude (Coverage) | 4 | All 6 modules present; minor gaps in detail (see Section 3) |
| 2 | Clareza (Clarity) | 4 | FR tables are clear and story-ready for most modules; some FRs need decomposition |
| 3 | Rastreabilidade (Traceability) | 4 | FR-IDs map well to Anexo I; a few contract items lack explicit FR |
| 4 | Viabilidade Tecnica (Technical Feasibility) | 4 | Stack is sound; some architectural decisions need deeper spec |
| 5 | Priorizacao (Wave Prioritization) | 4 | Waves make operational sense; M3 split across waves needs clearer boundaries |
| 6 | Riscos (Risk Coverage) | 3 | Critical risks identified but missing some important ones |
| 7 | Exclusoes (Constraints/CON-) | 4 | Well-aligned with contract; one contradiction found |
| 8 | Metricas (Success Metrics) | 3 | Business metrics are campaign-level (not directly measurable by the system); operational metrics are good |
| 9 | Checklist de Iniciacao (Initiation) | 5 | Comprehensive and actionable |
| 10 | Gaps (Unaddressed Content) | 4 | Most reference docs captured; some specific content missing |

**Weighted Average: 3.9 / 5.0**

---

## 2. Detailed Analysis per Criterion

### 2.1 Completude -- Score: 4/5

**Strengths:**
- All 6 contract modules are fully represented with FR tables
- Anexo I items map 1:1 to PRD functional requirements
- E-commerce flow (Module 2) is particularly well-detailed with both storefront and automation layers
- Module 6 (Sao Miguel) isolation requirements are clearly stated

**Gaps Found:**

| Gap ID | Description | Severity | Source |
|--------|-------------|----------|--------|
| GAP-01 | **Google Drive integration** listed in contract stack but has no FR | Medium | Contract Cl. 2.4, Anexo I Stack |
| GAP-02 | **Spotify integration** mentioned in FR-5.4 but lacks detail on what "upload/edicion de playlists" means technically | Low | Anexo I M5 |
| GAP-03 | **Journal (blog) workflow** -- contract specifies subagent receiving .docx, audios, photos via Telegram, processing, validating with contratante, and publishing. PRD FR-5.3 captures this but lacks granularity on the validation step (approval flow) | Medium | Anexo I M5 |
| GAP-04 | **Vestuario (clothing)** listed as product category in contract M2 but not mentioned in PRD Section 2A product categories (only vestuario, chocolates, artes, cosmeticos in contract vs. "Vestuario, chocolates, artes e cosmeticos" in FR-2.1 -- this one is actually covered) | None | -- |
| GAP-05 | **Orchestration layer** described in contract Cl. 2.5 as "camada de orquestacao superior" -- PRD Section 3.2 covers this but no FR exists for it | Low | Contract Cl. 2.5 |

### 2.2 Clareza -- Score: 4/5

**Strengths:**
- FR tables with ID, description, priority, and details are story-ready
- Flow diagrams (Modules 1 and 2) are clear and implementable
- Design/UX direction for the store is well-grounded in reference docs

**Issues:**

| Issue ID | Description | Impact |
|----------|-------------|--------|
| CLR-01 | **FR-3.4 "Montagem de campanhas Meta Ads"** -- unclear what "montagem" means technically. Does the system create draft campaigns via Meta API? Or just organize content and the user manually uploads to Meta? This is a critical ambiguity for scoping | High |
| CLR-02 | **FR-3.6 "Ativacao via Telegram"** -- same ambiguity. Does the system push campaigns live via API or just notify/organize? | High |
| CLR-03 | **FR-2.8 "NFSe (Mercado Pago)"** -- the PRD says "Geracao automatica" but the contract explicitly says NFSe emission is OUT of scope (CON-1) and only "comprovante de venda via Mercado Pago" is included. The PRD FR-2.8 text is contradictory with CON-1 | Critical |
| CLR-04 | **FR-5.2 "Redirecionamento para Airbnb"** -- PRD correctly states this, but the Pages Structure document mentions a "motor de reserva direta" with date selection, availability calendar, and direct payment. This is a significant discrepancy. The contract says redirect only (CON-8 confirms). The Pages doc was aspirational. PRD is correct here but should explicitly note the discrepancy | Medium |

### 2.3 Rastreabilidade -- Score: 4/5

**Mapping Verification (Contract Anexo I --> PRD FRs):**

| Contract Module/Item | PRD FR | Status |
|---------------------|--------|--------|
| M1: Cadastro colaboradores | FR-1.1 | Covered |
| M1: Comando linguagem natural | FR-1.2 | Covered |
| M1: Disparo WhatsApp | FR-1.3 | Covered |
| M1: Painel colaborador | FR-1.4 | Covered |
| M1: Rotina semanal | FR-1.5 | Covered |
| M1: Relatorio PDF | FR-1.6 | Covered |
| M1: Acompanhamento centralizado | FR-1.7 | Covered |
| M2: Loja propria | FR-2.1 | Covered |
| M2: Catalogo | FR-2.2 | Covered |
| M2: Carrinho | FR-2.3 | Covered |
| M2: Checkout 3 passos | FR-2.4 | Covered |
| M2: Mercado Pago | FR-2.5 | Covered |
| M2: Etiqueta envio | FR-2.6 | Covered |
| M2: Frete fixo | FR-2.7 | Covered |
| M2: Comprovante venda (NOT NFSe) | FR-2.8 | **CONTRADICTION** (see CLR-03) |
| M2: Etiqueta/frete auto | FR-2.9 | Covered |
| M2: Baixa estoque | FR-2.10 | Covered |
| M2: Alerta estoque < 5 | FR-2.11 | Covered |
| M2: Aviso Telegram | FR-2.12 | Covered |
| M3: Copies IA | FR-3.1 | Covered |
| M3: Criativos video | FR-3.2 | Covered |
| M3: Armazenamento conteudos | FR-3.3 | Covered |
| M3: Campanhas Meta | FR-3.4 | Covered (but unclear scope) |
| M3: Apoio investimento | FR-3.5 | Covered |
| M3: Ativacao Telegram | FR-3.6 | Covered (but unclear scope) |
| M4: Visualizacao consolidada | FR-4.1 | Covered |
| M4: CRUD produtos | FR-4.2 | Covered |
| M4: Ajuste estoque | FR-4.3 | Covered |
| M4: Conteudos COMUNIK | FR-4.4 | Covered |
| M4: Autenticacao | FR-4.5 | Covered |
| M5: About | FR-5.1 | Covered |
| M5: Booking (redirect Airbnb) | FR-5.2 | Covered |
| M5: Journal | FR-5.3 | Covered (needs detail) |
| M5: Radio/Spotify | FR-5.4 | Covered |
| M5: Shop integration | FR-5.5 | Covered |
| M5: Contact | FR-5.6 | Covered |
| M6: All items | FR-6.1 to FR-6.5 | Covered |
| Stack: Google Drive | -- | **MISSING FR** |
| Stack: Spotify detail | FR-5.4 | Partial |

### 2.4 Viabilidade Tecnica -- Score: 4/5

**Strengths:**
- Supabase self-hosted + n8n is a proven stack for this type of project
- Evolution API for WhatsApp is appropriate
- VPS-hosted architecture gives the client full ownership (contractual requirement)
- Agent architecture diagram is clear

**Concerns:**

| Concern | Risk Level | Recommendation |
|---------|-----------|----------------|
| **Meta Ads API integration** -- if FR-3.4/3.6 means programmatic campaign creation, this requires Business Verification, App Review, and Marketing API access. This is a 2-4 week process with Meta and has approval risk | High | Clarify if this is API-based or manual-assisted. If API, add as a dependency |
| **Higgsfield API** -- relatively new service; availability/pricing/rate limits not validated | Medium | Add fallback option (e.g., Runway, Pika) and validate API access early |
| **LLM cost for 3 agents + subagents** -- continuous Telegram-based NLU will consume significant tokens. No cost model in PRD | Medium | Add estimated monthly token cost to Section 3.3 |
| **Custom e-commerce security** -- building a custom store requires PCI-DSS awareness, CSRF protection, input validation. No security requirements beyond LGPD | Medium | Add security NFR for payment flow |
| **Next.js preset active but not mentioned in PRD** -- core-config shows `nextjs-react` preset but PRD stack table says "Codigo proprio" without specifying framework | Low | Align stack table with actual tech choice |

### 2.5 Priorizacao -- Score: 4/5

**Strengths:**
- Wave 1 (M1 + M2) is strategically correct -- unblocks hotel operations and revenue channel
- Wave 4 (M6) at the end makes sense as it reuses M1 patterns
- Contract Cl. 4.1.1 explicitly supports this prioritization

**Issues:**

| Issue | Description |
|-------|-------------|
| M3 split is vague | "COMUNIK parcial" in Wave 2 vs "COMUNIK completo" in Wave 3 -- which FRs go in each wave? FR-3.1/3.2/3.3 (content creation) vs FR-3.4/3.5/3.6 (campaign integration)? This needs explicit assignment |
| Wave 0 not time-boxed | The initiation checklist (Section 11) defines Wave 0 but no duration estimate. This could drag if client delays insumos |
| No dependency map between waves | M5 (Site) depends on M2 (Shop integration via FR-5.5). M4 (Dashboard) depends on M2 data. These cross-wave dependencies should be explicit |

### 2.6 Riscos -- Score: 3/5

**Present Risks (well-identified):**
- Client delay in providing insumos
- External API instability
- LLM cost overrun
- Undersized VPS
- Missing content for site

**Missing Risks:**

| Missing Risk | Impact | Probability | Recommended Mitigation |
|-------------|--------|-------------|----------------------|
| **Meta Ads API approval** -- if programmatic integration, Meta review process can block M3 for weeks | High | Medium | Early application or fallback to manual campaign management |
| **WhatsApp Business API compliance** -- Evolution API is an unofficial bridge; Meta can block numbers | High | Medium | Document risk to client; consider official WhatsApp Business API as alternative |
| **Scope creep on "linguagem natural"** -- NLU interpretation quality depends on prompt engineering and can generate unlimited edge cases | Medium | High | Define a bounded command vocabulary per sector; document "supported commands" |
| **Client expectation mismatch on "motor de reserva"** -- the Pages Structure doc describes a full booking engine with availability calendar, but contract says redirect-only. Client may expect the former | High | Medium | Explicit client communication comparing PRD (redirect) vs Pages doc (booking engine). Get sign-off |
| **Single point of failure: Marcos** -- all Telegram commands go through one person (Cl. 10.4). If unavailable, operations stall | Medium | Low | Consider delegate/backup user capability |
| **Currency/payment for international guests (P2)** -- Mercado Pago is Brazil-only. P2 personas are European. No international payment path for hospedagem | Low | Low | Out of scope (redirect to Airbnb handles this), but note explicitly |

### 2.7 Exclusoes (CON-) -- Score: 4/5

**Alignment with Contract:**

| CON | PRD Statement | Contract Reference | Status |
|-----|---------------|-------------------|--------|
| CON-1 | NFSe excluded | Cl. 3.4, Anexo I Limites | **CONTRADICTION with FR-2.8** |
| CON-2 | Agente financeiro excluded | Cl. 3.2, Anexo I Limites | Aligned |
| CON-3 | Agente pessoal/Hermes excluded | Cl. 3.2, Anexo I Limites | Aligned |
| CON-4 | Metricas campanhas devolution excluded | Anexo I Limites (iii) | Aligned |
| CON-5 | APIs Airbnb excluded | Anexo I Limites (iv) | Aligned |
| CON-6 | Google Calendar/Calendly excluded | Anexo I Limites (iv) | Aligned |
| CON-7 | SM ampliacao excluded | Anexo I Limites (v), M6 "Nao incluido" | Aligned |
| CON-8 | Motor de reserva direta excluded | Implicit from M5 redirect | Aligned, but should reference contract explicitly |

**Critical Issue:** FR-2.8 text says "Comprovante de venda + NFSe (Mercado Pago) -- Geracao automatica" but CON-1 says "Emissao de NFSe -- Apenas comprovante via Mercado Pago." The contract Cl. 3.4 is explicit: NFSe is OUT of scope. The Anexo I M2 uses the phrase "Nota Fiscal de Servico (NFSe)" but in the context of what Mercado Pago itself generates (the payment receipt/NF that MP issues as intermediary, not a separate NFSe emission by the system). **FR-2.8 must be rewritten to remove "NFSe" or clarify it refers only to whatever Mercado Pago automatically provides as part of its payment processing.**

### 2.8 Metricas -- Score: 3/5

**Strengths:**
- Operational metrics (Section 8.1) are concrete, measurable, and system-observable
- Time-to-dispatch metric (< 30s) is a good NFR-adjacent metric

**Issues:**

| Issue | Description |
|-------|-------------|
| Business metrics are external | CTR, CAC, ROAS, conversion rate (Section 8.2) are campaign/analytics metrics, not measured by the system itself. The system has no analytics dashboard (CON-4 excludes metrics devolution). These are aspirational targets from the campaign document, not system success metrics |
| No e-commerce metrics | Missing: average order value, cart abandonment rate, orders per week, repeat purchase rate -- all measurable by the system |
| No site metrics | Missing: page load time (NFR-related), bounce rate, contact form submissions per month |
| No agent quality metrics | Missing: NLU interpretation accuracy, false positive rate on task assignment, user correction rate |
| "Ponte cruzada" metric undefined | Listed as a metric but has no target value or measurement method |

### 2.9 Checklist de Iniciacao -- Score: 5/5

Comprehensive and actionable. Covers all dependencies. Good separation between client-side prerequisites (11.1) and contratada-side setup (11.2). Documentation reference table (11.3) is a strong addition.

### 2.10 Gaps -- Score: 4/5

**Content from Reference Docs Not Captured in PRD:**

| Source Document | Missing Content | Severity |
|----------------|----------------|----------|
| Pages Structure | **Checkout details** -- Pix with discount incentive, installment options for cards. PRD says "Pix + cartao" but misses the Pix discount strategy and parcelamento | Medium |
| Pages Structure | **WhatsApp as conversion channel** -- the doc heavily emphasizes WhatsApp as a purchase/booking shortcut (especially for Bahian audience). PRD has no FR for WhatsApp-based purchase flow or pre-booking chat | Medium |
| Pages Structure | **Newsletter / "Diario da Roca"** -- email capture with coupon incentive, CRM for recompra. No FR in any module | Medium |
| Pages Structure | **Embalagem with voucher** -- physical product shipments include a card/voucher for hospedagem (ponte cruzada mechanism). No FR | Low |
| Pages Structure | **Toggle PT-BR/EN** -- captured in NFR-7 but no FR for translation management or content duplication | Low |
| Pages Structure | **Booking engine vs redirect** -- doc describes full booking engine. PRD correctly uses redirect (per contract) but does not explicitly note the discrepancy or get client sign-off | Medium |
| Personas doc | **Sub-segmentation of P1** (25-40 vs 45-67) -- relevant for campaign targeting but not captured | Low |
| Campaigns doc | **Google Ads** -- the campaigns document includes Google Search/RSA campaigns (headlines, descriptions, keywords). PRD Module 3 only mentions Meta Ads. Contract also only mentions Meta/Instagram. Google Ads may be out of scope but the reference doc covers it | Low |
| Calendar doc | **Content pillar framework** (Roca viva, Mao & Arte, Santuario, Produto & oferta) -- not captured anywhere in PRD. Useful for M3 content generation | Low |
| Calendar doc | **Posting cadence** (5-7 posts/week + daily stories) -- operational parameter for M3 that should be documented | Low |

---

## 3. Issues Registry (Ordered by Severity)

| # | Severity | Issue | PRD Section | Action Required |
|---|----------|-------|-------------|----------------|
| 1 | **CRITICAL** | FR-2.8 contradicts CON-1 regarding NFSe. Contract explicitly excludes NFSe emission | Sec 4 M2, Sec 6 | Rewrite FR-2.8: "Comprovante de venda gerado automaticamente via Mercado Pago" -- remove "NFSe" |
| 2 | **HIGH** | FR-3.4 and FR-3.6 ambiguity: programmatic Meta API integration vs. manual-assisted campaign management | Sec 4 M3 | Add clarifying note: define whether system creates campaigns via Meta Marketing API or only organizes/suggests content for manual upload. This changes scope significantly |
| 3 | **HIGH** | Missing risk: Evolution API (unofficial WhatsApp bridge) can be blocked by Meta at any time | Sec 9 | Add risk with mitigation: "Monitor Evolution API status; maintain fallback to official WhatsApp Business API or SMS" |
| 4 | **HIGH** | Missing risk: Client expectation mismatch on booking engine (Pages doc vs. contract redirect-only) | Sec 9 | Add explicit note in Section 4 M5 and get client sign-off |
| 5 | **MEDIUM** | No FR for Google Drive integration (listed in contract stack) | Sec 4 | Either add FR (e.g., FR-4.6 or FR-X.X for Drive-based asset management) or add to CON as excluded |
| 6 | **MEDIUM** | M3 split across Waves 2-3 is undefined | Sec 7.2 | Specify which FRs belong to each wave. Suggestion: Wave 2 = FR-3.1, 3.2, 3.3 (content creation); Wave 3 = FR-3.4, 3.5, 3.6 (campaign integration) |
| 7 | **MEDIUM** | Business metrics (Sec 8.2) are not system-measurable | Sec 8 | Move to appendix "Campaign KPI Targets" and add system-measurable e-commerce metrics |
| 8 | **MEDIUM** | Missing FR: Newsletter/email capture with CRM (mentioned in Pages doc, cross-sell strategy) | Sec 4 M5 | Decide: in scope or excluded? If in scope, add FR-5.7. If not, add CON-9 |
| 9 | **MEDIUM** | Missing FR: WhatsApp as conversion/inquiry channel for site visitors | Sec 4 M5 | Add FR-5.8 or document as UX detail under FR-5.2/5.6 |
| 10 | **MEDIUM** | Checkout lacks detail on Pix discount and parcelamento strategy | Sec 4 M2 | Enrich FR-2.4/FR-2.5 details |
| 11 | **LOW** | No estimated LLM token cost in infrastructure section | Sec 3.3 | Add estimated monthly cost range |
| 12 | **LOW** | NFR missing: security requirements for custom e-commerce (XSS, CSRF, input validation) | Sec 5 | Add NFR-9 |
| 13 | **LOW** | Content pillar framework from Calendar doc not referenced in M3 | Sec 4 M3 | Add as context/reference in M3 description |
| 14 | **LOW** | Stack table says "Codigo proprio" but no frontend framework specified | Sec 3.1 | Align with technical preset (Next.js) or keep generic if undecided |

---

## 4. Recommendations

### 4.1 Must-Fix Before Epic Creation (Blocking)

1. **Fix FR-2.8 / CON-1 contradiction** -- this is a contractual compliance issue. Remove "NFSe" from FR-2.8 or reword to clarify it means only MP's built-in receipt/NF.

2. **Clarify FR-3.4 / FR-3.6 scope** -- the difference between "the system creates Meta campaigns via API" and "the system organizes content and suggests budget, user uploads manually" is easily a 2-3 week scope difference. Get a decision before epic creation.

3. **Address booking engine expectation** -- the Pages Structure document (written by the same team) describes a full booking engine with date picker, availability check, and direct payment. The contract says redirect-to-Airbnb only. This discrepancy MUST be surfaced to the client before development starts. Add a note to FR-5.2 and get explicit sign-off.

### 4.2 Should-Fix Before Story Creation (Important)

4. Add missing Google Drive FR or explicit exclusion.
5. Define M3 wave split (which FRs per wave).
6. Replace or supplement business metrics with system-measurable metrics.
7. Add missing risks (Evolution API, Meta API approval, scope creep on NLU).
8. Decide on Newsletter/CRM feature -- in or out.
9. Decide on WhatsApp as site conversion channel -- in or out.

### 4.3 Nice-to-Have Improvements

10. Add LLM cost estimate to infrastructure section.
11. Add security NFR for payment flows.
12. Reference content pillar framework in M3.
13. Add dependency map between waves.
14. Specify frontend framework in stack table.

---

## 5. Items Requiring Client Decision

| # | Question | Context | Impact if Unresolved |
|---|----------|---------|---------------------|
| 1 | **Meta Ads: API integration or manual?** | Contract says "montagem e ativacao de campanhas." Does Marcos expect to type "launch campaign" in Telegram and have it go live on Meta? Or is it "prepare content and I'll upload manually"? | Scope of M3 changes by 2-3 weeks |
| 2 | **Booking: redirect only (contract) or direct booking (Pages doc)?** | Pages doc describes a full booking engine. Contract says redirect to Airbnb. Which does Marcos expect? | If booking engine: major scope addition requiring aditivo contratual |
| 3 | **Newsletter/CRM: in scope?** | Pages doc describes "Diario da Roca" newsletter with email capture and coupon. Not in contract | If yes: add FR + small scope increase |
| 4 | **WhatsApp for purchase inquiries?** | Pages doc shows WhatsApp as key conversion channel (especially for Bahian audience). Is a WhatsApp chat widget on the site expected? | UX impact on M5 |
| 5 | **Google Drive: what for?** | Listed in contract stack. For what purpose? Asset storage? Content pipeline? Collaboration? | Determines if an FR is needed |
| 6 | **Pix discount percentage?** | Pages doc mentions "Pix com desconto" and "5% off" in product examples. Is this a business rule to implement? | Affects checkout logic in M2 |

---

## 6. Verdict

### NEEDS_REVISION

The PRD is **structurally solid** and covers the contract scope well. The FR tables are clear enough to generate epics and, for most modules, stories. However, three issues prevent an APPROVED verdict:

1. **The FR-2.8 / CON-1 contradiction on NFSe** is a contractual compliance problem that must be fixed before any development begins.

2. **The ambiguity on Meta Ads integration scope (FR-3.4/3.6)** creates a significant estimation risk for Module 3. A client decision is needed.

3. **The booking engine expectation mismatch** between the Pages Structure document and the contract/PRD could surface mid-development as a major scope dispute.

Once these three items are resolved and the Medium-severity gaps are addressed, the PRD should be re-validated for APPROVED status.

**Estimated effort to reach APPROVED:** 2-4 hours of PRD revision + 1 client alignment meeting.

---

*Validation performed by Morgan (@pm) -- Synkra AIOX*
*Cross-referenced against: Contract + Anexo I, 4 reference documents (Personas, Campaigns, Pages Structure, Editorial Calendar)*
*PRD-001-VALIDATION v1.0 -- 2026-06-25*
