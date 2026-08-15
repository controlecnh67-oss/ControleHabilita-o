-- ============================================================================
-- MIGRAÇÃO DE SINCRONIZAÇÃO - CONTROLE CNH / DETRAN-PA
-- Não altera o método de autenticação da aplicação.
-- Execute este arquivo no SQL Editor do Supabase do projeto em produção.
-- ============================================================================

-- 1) Sincronização incremental da tabela principal
ALTER TABLE public.geral_cnhs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW());

UPDATE public.geral_cnhs
SET updated_at = COALESCE(updated_at, data_movimento, created_at, NOW())
WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_geral_cnhs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_geral_cnhs_updated_at ON public.geral_cnhs;
CREATE TRIGGER trg_geral_cnhs_updated_at
BEFORE INSERT OR UPDATE ON public.geral_cnhs
FOR EACH ROW EXECUTE FUNCTION public.set_geral_cnhs_updated_at();

CREATE INDEX IF NOT EXISTS idx_geral_cnhs_updated_at
  ON public.geral_cnhs (updated_at);

CREATE INDEX IF NOT EXISTS idx_geral_cnhs_cpf_normalized
  ON public.geral_cnhs ((regexp_replace(cpf, '\\D', '', 'g')));

-- 2) Tabela oficial de acessos da Consulta do Cidadão.
-- LocalStorage continua sendo cache/offline; o Supabase passa a ser a fonte
-- compartilhada para o painel administrativo.
CREATE TABLE IF NOT EXISTS public.acessos_cidadao (
  id TEXT PRIMARY KEY,
  numero BIGINT,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  cpf TEXT NOT NULL,
  nome_titular TEXT,
  situacao TEXT,
  resultado_status TEXT NOT NULL,
  canal TEXT NOT NULL,
  dispositivo TEXT,
  cidade_origem TEXT,
  ip_mascarado TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.acessos_cidadao
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW());

CREATE OR REPLACE FUNCTION public.set_acessos_cidadao_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acessos_cidadao_updated_at ON public.acessos_cidadao;
CREATE TRIGGER trg_acessos_cidadao_updated_at
BEFORE INSERT OR UPDATE ON public.acessos_cidadao
FOR EACH ROW EXECUTE FUNCTION public.set_acessos_cidadao_updated_at();

CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_data_hora
  ON public.acessos_cidadao (data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_cpf
  ON public.acessos_cidadao ((regexp_replace(cpf, '\\D', '', 'g')));
CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_updated_at
  ON public.acessos_cidadao (updated_at);

-- 3) Consulta pública segura: o cidadão recebe somente os dados necessários
-- para localizar a própria CNH. O frontend não precisa baixar toda geral_cnhs.
CREATE OR REPLACE FUNCTION public.consulta_cnh_publica(p_cpf TEXT)
RETURNS TABLE (
  id TEXT,
  ordem INTEGER,
  nome TEXT,
  cpf TEXT,
  gaveta TEXT,
  reparticao TEXT,
  situacao TEXT,
  responsavel_nome TEXT,
  data_movimento TIMESTAMPTZ,
  memorando_numero TEXT,
  remessa TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.ordem,
    g.nome,
    g.cpf,
    g.gaveta,
    g.reparticao,
    g.situacao,
    g.responsavel_nome,
    g.data_movimento,
    g.memorando_numero,
    g.remessa,
    NULL::TEXT AS observacao,
    g.created_at,
    g.updated_at
  FROM public.geral_cnhs g
  WHERE regexp_replace(COALESCE(g.cpf, ''), '\\D', '', 'g') =
        regexp_replace(COALESCE(p_cpf, ''), '\\D', '', 'g')
  ORDER BY g.ordem DESC, g.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.consulta_cnh_publica(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consulta_cnh_publica(TEXT) TO anon, authenticated;

-- 4) RPC para registrar consulta sem conceder ao cidadão acesso direto à tabela.
CREATE OR REPLACE FUNCTION public.registrar_acesso_cidadao(
  p_id TEXT,
  p_numero BIGINT,
  p_data_hora TIMESTAMPTZ,
  p_cpf TEXT,
  p_nome_titular TEXT,
  p_situacao TEXT,
  p_resultado_status TEXT,
  p_canal TEXT,
  p_dispositivo TEXT,
  p_cidade_origem TEXT,
  p_ip_mascarado TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.acessos_cidadao (
    id, numero, data_hora, cpf, nome_titular, situacao,
    resultado_status, canal, dispositivo, cidade_origem, ip_mascarado
  ) VALUES (
    p_id, p_numero, COALESCE(p_data_hora, NOW()), p_cpf, p_nome_titular,
    p_situacao, p_resultado_status, p_canal, p_dispositivo,
    p_cidade_origem, p_ip_mascarado
  )
  ON CONFLICT (id) DO UPDATE SET
    numero = EXCLUDED.numero,
    data_hora = EXCLUDED.data_hora,
    cpf = EXCLUDED.cpf,
    nome_titular = EXCLUDED.nome_titular,
    situacao = EXCLUDED.situacao,
    resultado_status = EXCLUDED.resultado_status,
    canal = EXCLUDED.canal,
    dispositivo = EXCLUDED.dispositivo,
    cidade_origem = EXCLUDED.cidade_origem,
    ip_mascarado = EXCLUDED.ip_mascarado;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_acesso_cidadao(TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_acesso_cidadao(TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- A tabela fica sem acesso direto para o cliente público; o painel administrativo
-- pode continuar usando SELECT quando o projeto estiver com as políticas atuais.
ALTER TABLE public.acessos_cidadao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acessos_cidadao_select_authenticated" ON public.acessos_cidadao;
CREATE POLICY "acessos_cidadao_select_authenticated"
ON public.acessos_cidadao
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "acessos_cidadao_insert_anon" ON public.acessos_cidadao;
DROP POLICY IF EXISTS "acessos_cidadao_update_anon" ON public.acessos_cidadao;
DROP POLICY IF EXISTS "acessos_cidadao_delete_anon" ON public.acessos_cidadao;

-- 5) Sequência consistente do número de consulta. IDs continuam sendo gerados
-- pelo cliente para preservar compatibilidade offline; o número é recalculado
-- pelo painel quando ausente.
CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_numero
  ON public.acessos_cidadao (numero);

-- IMPORTANTE: esta migração não remove nem altera a tabela usuarios/senha.
-- A autenticação existente permanece como está, conforme solicitado.
