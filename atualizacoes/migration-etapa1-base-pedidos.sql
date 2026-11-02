-- Migration: Etapa 1 (base) da operacao da loja — briefing squads/site.md
-- Projeto: Site-ecommerce (wgvqiguebiqhubhtwfhz)
-- Rodar no Supabase > SQL Editor. Pode rodar mais de uma vez (idempotente).
--
-- O que entra:
--  1. pedidos: controle da reserva de estoque (reserva_expira_em,
--     estoque_reservado, estoque_baixado).
--  2. pedido_eventos: historico de cada pedido (pagamento, estoque, etiqueta,
--     emails, avisos, mudancas feitas no painel).
--  3. pedido_pendencias: falhas que precisam de acao (etiqueta, email, aviso
--     da equipe, estoque, pagamento) com "tentar novamente" no painel.
--  4. Funcoes atomicas de estoque (travam a linha do produto, sem corrida
--     entre duas vendas simultaneas):
--       reservar_estoque_pedido   — no checkout, separa o estoque do pedido
--       confirmar_baixa_estoque   — no pagamento aprovado, efetiva UMA vez
--       liberar_reserva_pedido    — devolve o estoque (cancelado/expirado)
--       liberar_reservas_expiradas — devolve todas as reservas vencidas
--
-- O codigo do site funciona sem esta migration (cai no comportamento
-- antigo), mas a reserva, o historico e as pendencias so passam a valer
-- depois de rodar.

-- ------------------------------------------------------------------
-- 1. Colunas de reserva no pedido
-- ------------------------------------------------------------------
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS reserva_expira_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estoque_reservado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estoque_baixado BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN pedidos.reserva_expira_em IS 'Ate quando o estoque fica separado aguardando pagamento';
COMMENT ON COLUMN pedidos.estoque_reservado IS 'TRUE enquanto o estoque do pedido esta separado (descontado) aguardando pagamento';
COMMENT ON COLUMN pedidos.estoque_baixado IS 'TRUE quando a baixa definitiva ja foi feita (pagamento aprovado) — nunca baixa duas vezes';

-- Pedidos ja pagos antes desta migration ja tiveram o estoque baixado
-- pelo webhook antigo: marca pra nunca baixar de novo.
UPDATE pedidos SET estoque_baixado = TRUE
 WHERE status IN ('pago', 'preparando', 'enviado', 'entregue') AND estoque_baixado = FALSE;

-- ------------------------------------------------------------------
-- 2. Historico do pedido
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT,
  dados JSONB,
  origem TEXT,           -- checkout | webhook | painel | sistema
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pedido_eventos_pedido_idx ON pedido_eventos (pedido_id, created_at);
COMMENT ON TABLE pedido_eventos IS 'Historico de cada pedido: pagamento, estoque, etiqueta, emails, avisos e alteracoes do painel';

-- ------------------------------------------------------------------
-- 3. Pendencias (falhas com "tentar novamente")
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_pendencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('etiqueta', 'email_confirmacao', 'aviso_equipe', 'estoque', 'pagamento')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'resolvida')),
  erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 1,
  ultima_tentativa_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvida_at TIMESTAMPTZ,
  resolvida_por TEXT
);
-- No maximo UMA pendencia aberta por pedido+tipo (evita alerta repetido)
CREATE UNIQUE INDEX IF NOT EXISTS pedido_pendencias_aberta_unica
  ON pedido_pendencias (pedido_id, tipo) WHERE status = 'aberta';
COMMENT ON TABLE pedido_pendencias IS 'Falhas de integracao por pedido, reprocessaveis pelo painel';

-- So o servidor (service_role) le/escreve. Sem policies = chave publica bloqueada.
ALTER TABLE pedido_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_pendencias ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------
-- 4. Funcoes de estoque
-- ------------------------------------------------------------------

-- Aplica um delta (negativo = tira, positivo = devolve) no estoque de um
-- produto, por tamanho quando houver variantes. Recalcula o total.
-- p_permitir_falta: se FALSE, falta de estoque gera erro; se TRUE, zera e
-- devolve quanto faltou (usado quando o pagamento ja entrou).
CREATE OR REPLACE FUNCTION _aplicar_delta_estoque(
  p_produto_id UUID, p_tamanho TEXT, p_delta INTEGER, p_permitir_falta BOOLEAN
) RETURNS INTEGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_prod RECORD;
  v_atual INTEGER;
  v_novo INTEGER;
  v_variantes JSONB;
  v_falta INTEGER := 0;
BEGIN
  SELECT id, nome_pt, estoque, variantes_estoque INTO v_prod
    FROM produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF p_tamanho IS NOT NULL AND jsonb_typeof(v_prod.variantes_estoque) = 'object'
     AND v_prod.variantes_estoque ? p_tamanho THEN
    v_atual := COALESCE((v_prod.variantes_estoque ->> p_tamanho)::INTEGER, 0);
    v_novo := v_atual + p_delta;
    IF v_novo < 0 THEN
      IF NOT p_permitir_falta THEN
        RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE: % tamanho % (restam %)', v_prod.nome_pt, p_tamanho, v_atual;
      END IF;
      v_falta := -v_novo;
      v_novo := 0;
    END IF;
    v_variantes := jsonb_set(v_prod.variantes_estoque, ARRAY[p_tamanho], to_jsonb(v_novo));
    UPDATE produtos SET
      variantes_estoque = v_variantes,
      estoque = (SELECT COALESCE(SUM(NULLIF(value, '')::INTEGER), 0) FROM jsonb_each_text(v_variantes))
     WHERE id = p_produto_id;
  ELSIF v_prod.estoque IS NOT NULL THEN
    v_novo := v_prod.estoque + p_delta;
    IF v_novo < 0 THEN
      IF NOT p_permitir_falta THEN
        RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE: % (restam %)', v_prod.nome_pt, v_prod.estoque;
      END IF;
      v_falta := -v_novo;
      v_novo := 0;
    END IF;
    UPDATE produtos SET estoque = v_novo WHERE id = p_produto_id;
  END IF;
  RETURN v_falta;
END;
$$;

-- Checkout: separa o estoque do pedido. Tudo ou nada.
CREATE OR REPLACE FUNCTION reservar_estoque_pedido(p_pedido_id UUID, p_expira_em TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_it RECORD;
BEGIN
  -- Trava o pedido e garante idempotencia
  PERFORM 1 FROM pedidos
    WHERE id = p_pedido_id AND NOT estoque_reservado AND NOT estoque_baixado
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', TRUE, 'ja_processado', TRUE);
  END IF;

  -- Ordena por produto pra evitar deadlock entre dois checkouts
  FOR v_it IN
    SELECT produto_id, tamanho, SUM(quantidade)::INTEGER AS qtd
      FROM pedido_itens WHERE pedido_id = p_pedido_id AND produto_id IS NOT NULL
     GROUP BY produto_id, tamanho ORDER BY produto_id, tamanho
  LOOP
    PERFORM _aplicar_delta_estoque(v_it.produto_id, v_it.tamanho, -v_it.qtd, FALSE);
  END LOOP;

  UPDATE pedidos SET estoque_reservado = TRUE, reserva_expira_em = p_expira_em WHERE id = p_pedido_id;
  INSERT INTO pedido_eventos (pedido_id, tipo, descricao, origem, dados)
    VALUES (p_pedido_id, 'estoque_reservado', 'Estoque separado aguardando pagamento', 'checkout',
            jsonb_build_object('expira_em', p_expira_em));
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- Pagamento aprovado: efetiva a baixa UMA unica vez.
-- Com reserva ativa: so converte a reserva (o estoque ja saiu).
-- Sem reserva (expirou ou pedido antigo): baixa agora; se faltar, zera e
-- devolve a lista do que faltou (o dinheiro ja entrou — a equipe resolve).
CREATE OR REPLACE FUNCTION confirmar_baixa_estoque(p_pedido_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_reservado BOOLEAN;
  v_it RECORD;
  v_falta INTEGER;
  v_faltas JSONB := '[]'::JSONB;
BEGIN
  UPDATE pedidos SET estoque_baixado = TRUE
   WHERE id = p_pedido_id AND NOT estoque_baixado
   RETURNING estoque_reservado INTO v_reservado;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', TRUE, 'ja_baixado', TRUE);
  END IF;

  IF v_reservado THEN
    UPDATE pedidos SET estoque_reservado = FALSE WHERE id = p_pedido_id;
    INSERT INTO pedido_eventos (pedido_id, tipo, descricao, origem)
      VALUES (p_pedido_id, 'estoque_baixado', 'Baixa de estoque confirmada (reserva convertida)', 'webhook');
    RETURN jsonb_build_object('ok', TRUE, 'origem', 'reserva', 'faltas', v_faltas);
  END IF;

  FOR v_it IN
    SELECT i.produto_id, i.tamanho, SUM(i.quantidade)::INTEGER AS qtd, MAX(i.nome_produto) AS nome
      FROM pedido_itens i WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
     GROUP BY i.produto_id, i.tamanho ORDER BY i.produto_id, i.tamanho
  LOOP
    v_falta := _aplicar_delta_estoque(v_it.produto_id, v_it.tamanho, -v_it.qtd, TRUE);
    IF v_falta > 0 THEN
      v_faltas := v_faltas || jsonb_build_object('nome', v_it.nome, 'tamanho', v_it.tamanho, 'faltou', v_falta);
    END IF;
  END LOOP;

  INSERT INTO pedido_eventos (pedido_id, tipo, descricao, origem, dados)
    VALUES (p_pedido_id, 'estoque_baixado',
            CASE WHEN jsonb_array_length(v_faltas) > 0
                 THEN 'Baixa de estoque feita SEM reserva — faltou produto'
                 ELSE 'Baixa de estoque feita (sem reserva ativa)' END,
            'webhook', jsonb_build_object('faltas', v_faltas));
  RETURN jsonb_build_object('ok', TRUE, 'origem', 'direta', 'faltas', v_faltas);
END;
$$;

-- Devolve o estoque reservado (pedido cancelado ou reserva vencida).
CREATE OR REPLACE FUNCTION liberar_reserva_pedido(p_pedido_id UUID, p_motivo TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_it RECORD;
BEGIN
  UPDATE pedidos SET estoque_reservado = FALSE
   WHERE id = p_pedido_id AND estoque_reservado AND NOT estoque_baixado;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  FOR v_it IN
    SELECT produto_id, tamanho, SUM(quantidade)::INTEGER AS qtd
      FROM pedido_itens WHERE pedido_id = p_pedido_id AND produto_id IS NOT NULL
     GROUP BY produto_id, tamanho ORDER BY produto_id, tamanho
  LOOP
    PERFORM _aplicar_delta_estoque(v_it.produto_id, v_it.tamanho, v_it.qtd, TRUE);
  END LOOP;

  INSERT INTO pedido_eventos (pedido_id, tipo, descricao, origem)
    VALUES (p_pedido_id, 'reserva_liberada', COALESCE(p_motivo, 'Reserva de estoque liberada'), 'sistema');
  RETURN TRUE;
END;
$$;

-- Libera todas as reservas vencidas de pedidos ainda nao pagos.
-- O pedido continua "pendente": se o pagamento cair depois (boleto), o
-- webhook baixa o estoque direto e avisa se faltar.
CREATE OR REPLACE FUNCTION liberar_reservas_expiradas()
RETURNS INTEGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_total INTEGER := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM pedidos
     WHERE estoque_reservado AND NOT estoque_baixado
       AND status IN ('pendente', 'cancelado')
       AND reserva_expira_em IS NOT NULL AND reserva_expira_em < NOW()
  LOOP
    IF liberar_reserva_pedido(v_id, 'Reserva expirada sem pagamento — estoque devolvido à loja') THEN
      v_total := v_total + 1;
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

-- Funcoes so pro servidor: a chave publica (anon) nao pode chamar.
REVOKE ALL ON FUNCTION _aplicar_delta_estoque(UUID, TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reservar_estoque_pedido(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION confirmar_baixa_estoque(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION liberar_reserva_pedido(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION liberar_reservas_expiradas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _aplicar_delta_estoque(UUID, TEXT, INTEGER, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION reservar_estoque_pedido(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION confirmar_baixa_estoque(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION liberar_reserva_pedido(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION liberar_reservas_expiradas() TO service_role;

NOTIFY pgrst, 'reload schema';
