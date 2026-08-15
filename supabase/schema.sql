-- ==============================================================================
-- SISTEMA DE CONTROLE DE CNH - DETRAN (SETOR DE PROTOCOLO)
-- Script Completo de Criação de Tabelas, Índices, RLS (Row Level Security) e Triggers
-- Compatível com Supabase PostgreSQL + Auth
-- ==============================================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE USUÁRIOS (Perfil estendido do Supabase Auth)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    nome_curto VARCHAR(100) NOT NULL,
    fone VARCHAR(50),
    email VARCHAR(255) UNIQUE NOT NULL,
    funcao VARCHAR(100) DEFAULT 'Agente de Trânsito',
    setor VARCHAR(100) DEFAULT 'Protocolo',
    login VARCHAR(100) UNIQUE NOT NULL,
    perfil VARCHAR(50) NOT NULL CHECK (perfil IN ('Administrador', 'Supervisor', 'Operador', 'Consulta')),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABELA DE RESPONSÁVEIS
CREATE TABLE IF NOT EXISTS public.responsaveis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    telefone VARCHAR(50),
    observacao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir que o registro Padrão "Proprietário" não possa ser excluído
CREATE OR REPLACE FUNCTION proteger_registro_proprietario()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.nome = 'Proprietário' OR OLD.cpf = '000.000.000-00' THEN
        RAISE EXCEPTION 'O registro padrão Proprietário não pode ser excluído do sistema DETRAN.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_proteger_proprietario
BEFORE DELETE ON public.responsaveis
FOR EACH ROW EXECUTE FUNCTION proteger_registro_proprietario();

-- 3. TABELA DE MEMORANDOS
CREATE TABLE IF NOT EXISTS public.memorandos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(100) NOT NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    remessa VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração', 'Remetido', 'Recebido')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TABELA DE CANDIDATOS (Filha de Memorandos)
CREATE TABLE IF NOT EXISTS public.candidatos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memorando_id UUID REFERENCES public.memorandos(id) ON DELETE CASCADE,
    numero VARCHAR(50),
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    telefone VARCHAR(50),
    remessa VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. TABELA GERAL (Tabela principal de controle de CNHs)
CREATE SEQUENCE IF NOT EXISTS public.geral_ordem_seq START 1;

CREATE TABLE IF NOT EXISTS public.geral (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordem INTEGER NOT NULL DEFAULT nextval('public.geral_ordem_seq'),
    memorando_id UUID REFERENCES public.memorandos(id) ON DELETE SET NULL,
    candidato_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    gaveta VARCHAR(50) DEFAULT '',
    reparticao VARCHAR(50) DEFAULT '',
    situacao VARCHAR(50) NOT NULL DEFAULT 'Remetida' CHECK (situacao IN ('Remetida', 'Recebida', 'Pendente', 'Entregue')),
    responsavel_id UUID REFERENCES public.responsaveis(id) ON DELETE SET NULL,
    data_movimento TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. TABELA DE HISTÓRICO DE MOVIMENTAÇÕES
CREATE TABLE IF NOT EXISTS public.historico_movimentacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    geral_id UUID REFERENCES public.geral(id) ON DELETE CASCADE,
    situacao_anterior VARCHAR(50),
    situacao_nova VARCHAR(50) NOT NULL,
    responsavel_id UUID REFERENCES public.responsaveis(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    observacao TEXT,
    data_hora TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Nunca permitir exclusão de registros do Histórico
CREATE OR REPLACE FUNCTION impedir_exclusao_historico()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Registros de histórico de movimentações são imutáveis e nunca podem ser excluídos.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_impedir_exclusao_historico
BEFORE DELETE ON public.historico_movimentacoes
FOR EACH ROW EXECUTE FUNCTION impedir_exclusao_historico();

-- 7. TABELA DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabela VARCHAR(100) NOT NULL,
    registro_id VARCHAR(100) NOT NULL,
    acao VARCHAR(50) NOT NULL CHECK (acao IN ('Inclusão', 'Alteração', 'Exclusão', 'Login', 'Logout', 'Remessa', 'Recebimento', 'Entrega')),
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    data_hora TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    ip VARCHAR(50) DEFAULT '127.0.0.1',
    valores_anteriores JSONB,
    valores_novos JSONB
);

-- Nunca permitir exclusão ou alteração de Auditoria
CREATE OR REPLACE FUNCTION impedir_modificacao_auditoria()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Registros de auditoria são estritamente protegidos e não podem ser alterados nem excluídos.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_impedir_modificacao_auditoria
BEFORE UPDATE OR DELETE ON public.auditoria
FOR EACH ROW EXECUTE FUNCTION impedir_modificacao_auditoria();

-- 8. TABELA DE MAPEAMENTO DE LOCALIZAÇÃO (Gavetas e Repartições por Inicial)
CREATE TABLE IF NOT EXISTS public.mapeamento_localizacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inicial VARCHAR(5) UNIQUE NOT NULL,
    gaveta VARCHAR(50) NOT NULL,
    reparticao VARCHAR(50) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE
);

-- 9. TABELA DE CONFIGURAÇÃO DO ÓRGÃO
CREATE TABLE IF NOT EXISTS public.orgao_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    governo TEXT,
    secretaria TEXT,
    orgao TEXT,
    sigla TEXT,
    origem_padrao TEXT,
    destino_padrao TEXT,
    cidade_uf TEXT,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    subtitulo_relatorio TEXT,
    logo TEXT,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 10. TABELA DE LOGS DE ACESSO DO CIDADÃO
CREATE TABLE IF NOT EXISTS public.acessos_cidadao (
    id TEXT PRIMARY KEY,
    numero INTEGER,
    data_hora TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
    cpf TEXT NOT NULL,
    nome_titular TEXT,
    situacao TEXT,
    resultado_status TEXT,
    canal TEXT,
    dispositivo TEXT,
    cidade_origem TEXT,
    ip_mascarado TEXT
);

-- 11. TABELA DE IMAGENS E ANEXOS SINCRONIZADOS
CREATE TABLE IF NOT EXISTS public.imagens_sync (
    id TEXT PRIMARY KEY,
    tabela_ref TEXT,
    registro_id TEXT,
    nome TEXT NOT NULL,
    tipo TEXT,
    tamanho INTEGER,
    dados_base64 TEXT,
    url_publica TEXT,
    usuario_id TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ==============================================================================
-- ÍNDICES PARA ALTA PERFORMANCE DE CONSULTA
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_geral_cpf ON public.geral(cpf);
CREATE INDEX IF NOT EXISTS idx_geral_nome ON public.geral(nome);
CREATE INDEX IF NOT EXISTS idx_geral_situacao ON public.geral(situacao);
CREATE INDEX IF NOT EXISTS idx_geral_ordem ON public.geral(ordem);
CREATE INDEX IF NOT EXISTS idx_geral_memorando ON public.geral(memorando_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_cpf ON public.candidatos(cpf);
CREATE INDEX IF NOT EXISTS idx_candidatos_memo ON public.candidatos(memorando_id);
CREATE INDEX IF NOT EXISTS idx_historico_geral ON public.historico_movimentacoes(geral_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_reg ON public.auditoria(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_responsaveis_cpf ON public.responsaveis(cpf);
CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_cpf ON public.acessos_cidadao(cpf);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
-- ==============================================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memorandos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geral ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapeamento_localizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orgao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessos_cidadao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imagens_sync ENABLE ROW LEVEL SECURITY;

-- Política geral para usuários autenticados no Supabase (Acesso de leitura)
CREATE POLICY "Leitura permitida a autenticados" ON public.geral FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.memorandos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.candidatos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.responsaveis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.mapeamento_localizacao FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.historico_movimentacoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.auditoria FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.orgao_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.acessos_cidadao FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Leitura permitida a autenticados" ON public.imagens_sync FOR ALL USING (true) WITH CHECK (true);
