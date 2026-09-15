-- ==============================================================================
-- SCRIPT DE CRIAÇÃO DA TABELA: LOTES (DETRAN - PROTOCOLO GERAL)
-- Executar no SQL Editor do Supabase para criar a nova tabela com todas as permissões
-- ==============================================================================

-- 1. EXTENSÃO UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE LOTES
CREATE TABLE IF NOT EXISTS public.lotes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    numero INTEGER NOT NULL,
    data_recebimento DATE NOT NULL DEFAULT CURRENT_DATE,
    documentos_impressos INTEGER NOT NULL DEFAULT 0,
    pdf_nome TEXT,
    pdf_url TEXT,
    observacao TEXT,
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantia de colunas caso a tabela já exista
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS pdf_nome TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);

-- 3. TRIGGER PARA ATUALIZAÇÃO AUTOMÁTICA DE updated_at
CREATE OR REPLACE FUNCTION public.set_lotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lotes_updated_at ON public.lotes;
CREATE TRIGGER trigger_lotes_updated_at
BEFORE UPDATE ON public.lotes
FOR EACH ROW EXECUTE FUNCTION public.set_lotes_updated_at();

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_lotes_numero ON public.lotes(numero);
CREATE INDEX IF NOT EXISTS idx_lotes_data_recebimento ON public.lotes(data_recebimento DESC);
CREATE INDEX IF NOT EXISTS idx_lotes_created_at ON public.lotes(created_at DESC);

-- 5. CONFIGURAÇÃO DE SUPABASE REALTIME (SINCRONIZAÇÃO EM TEMPO REAL)
ALTER TABLE public.lotes REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lotes'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.lotes;
        END IF;
    END IF;
END $$;

-- 6. ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

-- Leitura liberada para autenticados e anônimos
DROP POLICY IF EXISTS "lotes_read_policy" ON public.lotes;
CREATE POLICY "lotes_read_policy" ON public.lotes
    FOR SELECT TO authenticated, anon USING (true);

-- Gravação permitida para operadores autenticados
DROP POLICY IF EXISTS "lotes_write_policy" ON public.lotes;
CREATE POLICY "lotes_write_policy" ON public.lotes
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Gravação permitida para a chave anon da aplicação
DROP POLICY IF EXISTS "lotes_anon_write_policy" ON public.lotes;
CREATE POLICY "lotes_anon_write_policy" ON public.lotes
    FOR ALL TO anon
    USING (true)
    WITH CHECK (true);

-- 7. PERMISSÕES DE ACESSO (GRANTS)
GRANT ALL ON TABLE public.lotes TO postgres, anon, authenticated, service_role;
