-- ==============================================================================
-- SCRIPT DE CRIAÇÃO DA TABELA: DECLARACOES (DETRAN - RETIRADA POR PROCURADOR)
-- Executar no SQL Editor do Supabase para criar a nova tabela com todas as permissões
-- ==============================================================================

-- 1. EXTENSÃO UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE DECLARAÇÕES
CREATE TABLE IF NOT EXISTS public.declaracoes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    numero VARCHAR(50) NOT NULL UNIQUE,
    ano INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    cidade VARCHAR(100) NOT NULL DEFAULT 'Itaituba',
    uf VARCHAR(2) NOT NULL DEFAULT 'PA',
    procurador_id TEXT,
    procurador_nome VARCHAR(255) NOT NULL,
    procurador_cpf VARCHAR(20) NOT NULL,
    procurador_fone VARCHAR(50),
    procurador_endereco TEXT,
    texto_declaracao TEXT NOT NULL,
    condutores JSONB NOT NULL DEFAULT '[]'::jsonb,
    gerente_nome VARCHAR(255),
    gerente_cargo VARCHAR(100),
    gerente_unidade VARCHAR(100),
    gerente_portaria VARCHAR(150),
    observacao TEXT,
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantia de colunas se a tabela já existia
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS condutores JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_nome VARCHAR(255);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_cargo VARCHAR(100);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_unidade VARCHAR(100);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_portaria VARCHAR(150);

-- 3. TRIGGER PARA ATUALIZAÇÃO AUTOMÁTICA DE updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_declaracoes_updated_at ON public.declaracoes;
CREATE TRIGGER trigger_declaracoes_updated_at
BEFORE UPDATE ON public.declaracoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_declaracoes_numero ON public.declaracoes(numero);
CREATE INDEX IF NOT EXISTS idx_declaracoes_ano ON public.declaracoes(ano);
CREATE INDEX IF NOT EXISTS idx_declaracoes_procurador_cpf ON public.declaracoes(procurador_cpf);
CREATE INDEX IF NOT EXISTS idx_declaracoes_data_emissao ON public.declaracoes(data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_declaracoes_created_at ON public.declaracoes(created_at DESC);

-- 5. CONFIGURAÇÃO DE SUPABASE REALTIME (SINCRONIZAÇÃO EM TEMPO REAL)
ALTER TABLE public.declaracoes REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'declaracoes'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.declaracoes;
        END IF;
    END IF;
END $$;

-- 6. ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
ALTER TABLE public.declaracoes ENABLE ROW LEVEL SECURITY;

-- Leitura liberada para autenticados e anônimos
DROP POLICY IF EXISTS "declaracoes_read_policy" ON public.declaracoes;
CREATE POLICY "declaracoes_read_policy" ON public.declaracoes
    FOR SELECT TO authenticated, anon USING (true);

-- Gravação permitida para operadores autenticados
DROP POLICY IF EXISTS "declaracoes_write_policy" ON public.declaracoes;
CREATE POLICY "declaracoes_write_policy" ON public.declaracoes
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Gravação permitida para a chave anon da aplicação
DROP POLICY IF EXISTS "declaracoes_anon_write_policy" ON public.declaracoes;
CREATE POLICY "declaracoes_anon_write_policy" ON public.declaracoes
    FOR ALL TO anon
    USING (true)
    WITH CHECK (true);

-- 7. PERMISSÕES DE ACESSO (GRANTS)
GRANT ALL ON TABLE public.declaracoes TO postgres, anon, authenticated, service_role;
