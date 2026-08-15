-- FASE 2 - SINCRONIZAÇÃO
-- Execute DEPOIS de public/supabase_sync_migration.sql.
-- Objetivo: Supabase como fonte oficial online, updated_at padronizado,
-- consulta pública indexada e transições de status atômicas.

ALTER TABLE public.geral_cnhs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW());

UPDATE public.geral_cnhs
SET updated_at = COALESCE(updated_at, created_at, data_movimento, TIMEZONE('utc'::text, NOW()))
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_geral_cnhs_updated_at_id
  ON public.geral_cnhs (updated_at, id);

CREATE INDEX IF NOT EXISTS idx_geral_cnhs_cpf_normalizado
  ON public.geral_cnhs ((regexp_replace(COALESCE(cpf, ''), '[^0-9]', '', 'g')));

CREATE OR REPLACE FUNCTION public.set_geral_cnhs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_geral_cnhs_updated_at ON public.geral_cnhs;
CREATE TRIGGER trg_geral_cnhs_updated_at
BEFORE INSERT OR UPDATE ON public.geral_cnhs
FOR EACH ROW
EXECUTE FUNCTION public.set_geral_cnhs_updated_at();

-- Consulta pública: somente o CPF informado é retornado.
CREATE OR REPLACE FUNCTION public.consulta_cnh_publica(p_cpf TEXT)
RETURNS SETOF public.geral_cnhs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.*
  FROM public.geral_cnhs g
  WHERE regexp_replace(COALESCE(g.cpf, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g')
  ORDER BY g.ordem DESC, g.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.consulta_cnh_publica(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consulta_cnh_publica(TEXT) TO anon, authenticated;

-- Consulta pública de candidatos: fallback sem baixar a tabela inteira.
CREATE OR REPLACE FUNCTION public.consulta_candidato_publica(p_cpf TEXT)
RETURNS SETOF public.candidatos
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.candidatos c
  WHERE regexp_replace(COALESCE(c.cpf, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g')
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.consulta_candidato_publica(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consulta_candidato_publica(TEXT) TO anon, authenticated;

-- Registro de consulta pública sem INSERT direto do navegador.
CREATE OR REPLACE FUNCTION public.registrar_acesso_cidadao(
  p_id TEXT,
  p_numero INTEGER DEFAULT NULL,
  p_data_hora TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  p_cpf TEXT DEFAULT NULL,
  p_nome_titular TEXT DEFAULT NULL,
  p_situacao TEXT DEFAULT NULL,
  p_resultado_status TEXT DEFAULT NULL,
  p_canal TEXT DEFAULT NULL,
  p_dispositivo TEXT DEFAULT NULL,
  p_cidade_origem TEXT DEFAULT NULL,
  p_ip_mascarado TEXT DEFAULT NULL
)
RETURNS public.acessos_cidadao
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_row public.acessos_cidadao;
BEGIN
  INSERT INTO public.acessos_cidadao (
    id, numero, data_hora, cpf, nome_titular, situacao,
    resultado_status, canal, dispositivo, cidade_origem, ip_mascarado
  ) VALUES (
    p_id,
    COALESCE(p_numero, 0),
    COALESCE(p_data_hora, TIMEZONE('utc'::text, NOW())),
    regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g'),
    p_nome_titular,
    p_situacao,
    p_resultado_status,
    p_canal,
    p_dispositivo,
    p_cidade_origem,
    p_ip_mascarado
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_acesso_cidadao(TEXT, INTEGER, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_cidadao(TEXT, INTEGER, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_cpf_data
  ON public.acessos_cidadao (cpf, data_hora DESC);

-- Transição atômica para Recebida/Entregue.
-- O estado anterior precisa coincidir; duas abas não conseguem executar
-- a mesma transição com sucesso simultaneamente.
CREATE OR REPLACE FUNCTION public.transicionar_cnh_status(
  p_id TEXT,
  p_status_anterior TEXT,
  p_status_novo TEXT,
  p_usuario_id TEXT,
  p_usuario_nome TEXT,
  p_data_movimento TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  p_responsavel_id TEXT DEFAULT NULL,
  p_responsavel_nome TEXT DEFAULT NULL,
  p_gaveta TEXT DEFAULT NULL,
  p_reparticao TEXT DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL
)
RETURNS public.geral_cnhs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_row public.geral_cnhs;
BEGIN
  IF p_status_anterior = p_status_novo THEN
    RAISE EXCEPTION 'STATUS_CONFLICT: a situação anterior e a nova são iguais';
  END IF;

  IF NOT (
    (p_status_anterior = 'Remetida' AND p_status_novo = 'Recebida') OR
    (p_status_anterior = 'Pendente' AND p_status_novo = 'Recebida') OR
    (p_status_anterior = 'Recebida' AND p_status_novo = 'Entregue') OR
    (p_status_anterior = 'Pendente' AND p_status_novo = 'Entregue')
  ) THEN
    RAISE EXCEPTION 'STATUS_CONFLICT: transição não permitida';
  END IF;

  UPDATE public.geral_cnhs
  SET situacao = p_status_novo,
      usuario_id = p_usuario_id,
      usuario_nome = p_usuario_nome,
      data_movimento = COALESCE(p_data_movimento, TIMEZONE('utc'::text, NOW())),
      responsavel_id = COALESCE(p_responsavel_id, responsavel_id),
      responsavel_nome = COALESCE(p_responsavel_nome, responsavel_nome),
      gaveta = COALESCE(p_gaveta, gaveta),
      reparticao = COALESCE(p_reparticao, reparticao),
      observacao = COALESCE(p_observacao, observacao)
  WHERE id = p_id
    AND situacao = p_status_anterior
  RETURNING * INTO result_row;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'STATUS_CONFLICT: a CNH já foi alterada por outro usuário';
  END IF;

  RETURN result_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transicionar_cnh_status(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transicionar_cnh_status(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
