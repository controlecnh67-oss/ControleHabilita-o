-- ==============================================================================
-- SISTEMA DE CONTROLE DE CNH - DETRAN (SETOR DE PROTOCOLO)
-- SCRIPT MESTRE DE BANCO DE DADOS POSTGRESQL + SUPABASE AUTH + REALTIME + STORAGE
-- Versão 3.1.0 - Totalmente Idempotente, Tolerante a Falhas e Compatível com Supabase
-- ==============================================================================

-- 0. EXTENSÕES DO POSTGRESQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. FUNÇÕES AUXILIARES DE AUDITORIA E ATUALIZAÇÃO AUTOMÁTICA
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. TABELA DE USUÁRIOS (Perfis vinculados ao Supabase Auth)
-- NOTA: Senhas são gerenciadas exclusivamente pelo Supabase Auth (auth.users).
-- ==============================================================================
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
    permissoes JSONB DEFAULT '[]'::jsonb,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garante que colunas existam caso a tabela tenha sido criada em versão anterior
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

CREATE OR REPLACE TRIGGER trigger_usuarios_updated_at
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Se a tabela usuarios já existia com coluna 'senha', removemos para conformidade de segurança
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'senha'
    ) THEN
        ALTER TABLE public.usuarios DROP COLUMN senha;
    END IF;
END $$;

-- ==============================================================================
-- 3. TABELA DE RESPONSÁVEIS PELA RETIRADA DE CNHS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.responsaveis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    telefone VARCHAR(50),
    registro VARCHAR(100),
    observacao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

CREATE OR REPLACE TRIGGER trigger_responsaveis_updated_at
BEFORE UPDATE ON public.responsaveis
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Proteção: O registro padrão "Proprietário" não pode ser excluído
CREATE OR REPLACE FUNCTION public.proteger_registro_proprietario()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.nome = 'Proprietário' OR OLD.cpf = '000.000.000-00' THEN
        RAISE EXCEPTION 'O registro padrão Proprietário não pode ser excluído do sistema DETRAN.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_proteger_proprietario ON public.responsaveis;
CREATE TRIGGER trigger_proteger_proprietario
BEFORE DELETE ON public.responsaveis
FOR EACH ROW EXECUTE FUNCTION public.proteger_registro_proprietario();

-- Inserção idempotente do Responsável padrão "Proprietário"
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.responsaveis WHERE id = 'a0000000-0000-0000-0000-000000000001' OR cpf = '000.000.000-00') THEN
        INSERT INTO public.responsaveis (id, nome, cpf, telefone, observacao, ativo)
        VALUES (
            'a0000000-0000-0000-0000-000000000001',
            'Proprietário',
            '000.000.000-00',
            '(93) 00000-0000',
            'Titular da CNH retirando seu próprio documento no guichê',
            TRUE
        );
    ELSE
        UPDATE public.responsaveis 
        SET nome = 'Proprietário', ativo = TRUE 
        WHERE id = 'a0000000-0000-0000-0000-000000000001' OR cpf = '000.000.000-00';
    END IF;
END $$;

-- ==============================================================================
-- 4. TABELA DE MAPEAMENTO DE LOCALIZAÇÃO (Gavetas e Repartições por Inicial)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.mapeamento_localizacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inicial VARCHAR(5) UNIQUE NOT NULL,
    gaveta VARCHAR(50) NOT NULL,
    reparticao VARCHAR(50) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.mapeamento_localizacao ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.mapeamento_localizacao ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.mapeamento_localizacao ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

CREATE OR REPLACE TRIGGER trigger_mapeamento_updated_at
BEFORE UPDATE ON public.mapeamento_localizacao
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed inicial de mapeamento A-Z
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.mapeamento_localizacao LIMIT 1) THEN
        INSERT INTO public.mapeamento_localizacao (inicial, gaveta, reparticao, ativo) VALUES
        ('A', 'GAVETA 1', 'REPARTIÇÃO 1', true),
        ('B', 'GAVETA 1', 'REPARTIÇÃO 2', true),
        ('C', 'GAVETA 1', 'REPARTIÇÃO 3', true),
        ('D', 'GAVETA 1', 'REPARTIÇÃO 4', true),
        ('E', 'GAVETA 1', 'REPARTIÇÃO 5', true),
        ('F', 'GAVETA 2', 'REPARTIÇÃO 1', true),
        ('G', 'GAVETA 2', 'REPARTIÇÃO 2', true),
        ('H', 'GAVETA 2', 'REPARTIÇÃO 3', true),
        ('I', 'GAVETA 2', 'REPARTIÇÃO 4', true),
        ('J', 'GAVETA 2', 'REPARTIÇÃO 5', true),
        ('K', 'GAVETA 3', 'REPARTIÇÃO 1', true),
        ('L', 'GAVETA 3', 'REPARTIÇÃO 2', true),
        ('M', 'GAVETA 3', 'REPARTIÇÃO 3', true),
        ('N', 'GAVETA 3', 'REPARTIÇÃO 4', true),
        ('O', 'GAVETA 3', 'REPARTIÇÃO 5', true),
        ('P', 'GAVETA 4', 'REPARTIÇÃO 1', true),
        ('Q', 'GAVETA 4', 'REPARTIÇÃO 2', true),
        ('R', 'GAVETA 4', 'REPARTIÇÃO 3', true),
        ('S', 'GAVETA 4', 'REPARTIÇÃO 4', true),
        ('T', 'GAVETA 4', 'REPARTIÇÃO 5', true),
        ('U', 'GAVETA 5', 'REPARTIÇÃO 1', true),
        ('V', 'GAVETA 5', 'REPARTIÇÃO 2', true),
        ('W', 'GAVETA 5', 'REPARTIÇÃO 3', true),
        ('X', 'GAVETA 5', 'REPARTIÇÃO 4', true),
        ('Y', 'GAVETA 5', 'REPARTIÇÃO 5', true),
        ('Z', 'GAVETA 5', 'REPARTIÇÃO 5', true);
    END IF;
END $$;

-- ==============================================================================
-- 5. TABELA DE MEMORANDOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.memorandos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(100) NOT NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(255),
    remessa VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração', 'Remetido', 'Recebido')),
    candidatos_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS candidatos_count INTEGER DEFAULT 0;

CREATE OR REPLACE TRIGGER trigger_memorandos_updated_at
BEFORE UPDATE ON public.memorandos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 6. TABELA DE CANDIDATOS (Filha de Memorandos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.candidatos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memorando_id UUID REFERENCES public.memorandos(id) ON DELETE CASCADE,
    numero VARCHAR(50),
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    telefone VARCHAR(50),
    remessa VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS remessa VARCHAR(100);
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);

-- ==============================================================================
-- 7. TABELA OFICIAL: GERAL_CNHS (Tabela Principal de Controle de CNHs e Protocolo)
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS public.geral_cnhs_ordem_seq START 1;

CREATE TABLE IF NOT EXISTS public.geral_cnhs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordem INTEGER NOT NULL DEFAULT nextval('public.geral_cnhs_ordem_seq'),
    memorando_id UUID REFERENCES public.memorandos(id) ON DELETE SET NULL,
    candidato_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    telefone VARCHAR(50),
    notificado_whatsapp BOOLEAN DEFAULT FALSE,
    notificado_at TIMESTAMPTZ,
    gaveta VARCHAR(50) DEFAULT '',
    reparticao VARCHAR(50) DEFAULT '',
    situacao VARCHAR(50) NOT NULL DEFAULT 'Remetida' CHECK (situacao IN ('Remetida', 'Recebida', 'Pendente', 'Entregue')),
    responsavel_id UUID REFERENCES public.responsaveis(id) ON DELETE SET NULL,
    responsavel_nome VARCHAR(255),
    data_movimento TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(255),
    memorando_numero VARCHAR(100),
    remessa VARCHAR(100),
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT FALSE;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS notificado_at TIMESTAMPTZ;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS remessa VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS memorando_numero VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(255);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);

CREATE OR REPLACE TRIGGER trigger_geral_cnhs_updated_at
BEFORE UPDATE ON public.geral_cnhs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rotina de migração transparente: se a tabela legada 'geral' existir como tabela física, migra para geral_cnhs
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'geral' AND table_type = 'BASE TABLE'
    ) THEN
        ALTER TABLE public.geral ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
        ALTER TABLE public.geral ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

        INSERT INTO public.geral_cnhs (
            id, ordem, memorando_id, candidato_id, nome, cpf, gaveta, reparticao,
            situacao, responsavel_id, data_movimento, usuario_id, observacao, created_at, updated_at
        )
        SELECT 
            id, 
            COALESCE(ordem, nextval('public.geral_cnhs_ordem_seq')), 
            memorando_id, candidato_id, nome, cpf, gaveta, reparticao,
            situacao, responsavel_id, data_movimento, usuario_id, observacao, 
            COALESCE(created_at, timezone('utc'::text, now())), 
            COALESCE(updated_at, timezone('utc'::text, now()))
        FROM public.geral
        ON CONFLICT (id) DO NOTHING;

        DROP TABLE public.geral CASCADE;
        CREATE OR REPLACE VIEW public.geral AS SELECT * FROM public.geral_cnhs;
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'geral'
    ) THEN
        CREATE OR REPLACE VIEW public.geral AS SELECT * FROM public.geral_cnhs;
    END IF;
END $$;

-- ==============================================================================
-- 8. TABELA DE HISTÓRICO DE MOVIMENTAÇÕES (IMUTÁVEL)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.historico_movimentacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    geral_id UUID REFERENCES public.geral_cnhs(id) ON DELETE CASCADE,
    situacao_anterior VARCHAR(50),
    situacao_nova VARCHAR(50) NOT NULL,
    responsavel_id UUID REFERENCES public.responsaveis(id) ON DELETE SET NULL,
    responsavel_nome VARCHAR(255),
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(255),
    observacao TEXT,
    data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Proteção: Registros do histórico são imutáveis
CREATE OR REPLACE FUNCTION public.impedir_exclusao_historico()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Registros de histórico de movimentações são estritamente imutáveis e não podem ser excluídos.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_impedir_exclusao_historico ON public.historico_movimentacoes;
CREATE TRIGGER trigger_impedir_exclusao_historico
BEFORE DELETE OR UPDATE ON public.historico_movimentacoes
FOR EACH ROW EXECUTE FUNCTION public.impedir_exclusao_historico();

-- ==============================================================================
-- 9. TABELA DE AUDITORIA DO SISTEMA (IMUTÁVEL)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabela VARCHAR(100) NOT NULL,
    registro_id VARCHAR(100) NOT NULL,
    acao VARCHAR(50) NOT NULL CHECK (acao IN ('Inclusão', 'Alteração', 'Exclusão', 'Login', 'Logout', 'Remessa', 'Recebimento', 'Entrega', 'Reabertura', 'Importação', 'Backup')),
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(255),
    data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ip VARCHAR(50) DEFAULT '127.0.0.1',
    valores_anteriores JSONB,
    valores_novos JSONB
);

-- Proteção: Registros de auditoria nunca podem ser alterados ou excluídos
CREATE OR REPLACE FUNCTION public.impedir_modificacao_auditoria()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Registros de auditoria são estritamente protegidos e não podem ser alterados nem excluídos.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_impedir_modificacao_auditoria ON public.auditoria;
CREATE TRIGGER trigger_impedir_modificacao_auditoria
BEFORE UPDATE OR DELETE ON public.auditoria
FOR EACH ROW EXECUTE FUNCTION public.impedir_modificacao_auditoria();

-- ==============================================================================
-- 10. TABELA DE CONFIGURAÇÃO INSTITUCIONAL DO ÓRGÃO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orgao_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    governo TEXT DEFAULT 'GOVERNO DO ESTADO DO PARÁ',
    secretaria TEXT DEFAULT 'SECRETARIA DE ESTADO DE TRANSPORTES',
    orgao TEXT DEFAULT 'DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ',
    sigla TEXT DEFAULT 'DETRAN/PA - Ciretran Itaituba',
    origem_padrao TEXT DEFAULT 'Agência DETRAN Itaituba',
    destino_padrao TEXT DEFAULT 'Coordenação de Habilitação / RENACH',
    cidade_uf TEXT DEFAULT 'Itaituba - PA',
    telefone TEXT DEFAULT '(93) 3518-1234',
    email TEXT DEFAULT 'protocolo.itaituba@detran.pa.gov.br',
    endereco TEXT DEFAULT 'Rod. Transamazônica, Km 02 - Bela Vista',
    subtitulo_relatorio TEXT DEFAULT 'Setor de Protocolo e Controle de CNHs',
    logo TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

CREATE OR REPLACE TRIGGER trigger_orgao_config_updated_at
BEFORE UPDATE ON public.orgao_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Registro padrão de configuração do órgão
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgao_config WHERE id = 'default') THEN
        INSERT INTO public.orgao_config (id, governo, secretaria, orgao, sigla, origem_padrao, destino_padrao, cidade_uf, telefone, email, endereco, subtitulo_relatorio)
        VALUES (
            'default',
            'GOVERNO DO ESTADO DO PARÁ',
            'SECRETARIA DE ESTADO DE TRANSPORTES',
            'DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ',
            'DETRAN/PA - Agência Itaituba',
            'Agência DETRAN Itaituba',
            'Coordenação de Habilitação / RENACH',
            'Itaituba - PA',
            '(93) 3518-1234',
            'protocolo.itaituba@detran.pa.gov.br',
            'Rod. Transamazônica, Km 02 - Bela Vista',
            'Setor de Protocolo e Controle de CNHs'
        );
    END IF;
END $$;

-- ==============================================================================
-- 11. TABELA DE LOGS DE CONSULTA DO CIDADÃO (Consulta Pública por CPF)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.acessos_cidadao (
    id TEXT PRIMARY KEY,
    numero INTEGER,
    data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    cpf TEXT NOT NULL,
    nome_titular TEXT,
    situacao TEXT,
    resultado_status TEXT,
    canal TEXT DEFAULT 'Web Mobile',
    dispositivo TEXT,
    cidade_origem TEXT,
    ip_mascarado TEXT
);

-- ==============================================================================
-- 12. TABELA DE IMAGENS E ANEXOS SINCRONIZADOS
-- ==============================================================================
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
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 13. TABELA DE DECLARAÇÕES DE RETIRADA DE CNH POR PROCURADOR
-- ==============================================================================
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

ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS condutores JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_nome VARCHAR(255);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_cargo VARCHAR(100);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_unidade VARCHAR(100);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_portaria VARCHAR(150);

CREATE OR REPLACE TRIGGER trigger_declaracoes_updated_at
BEFORE UPDATE ON public.declaracoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 14. ÍNDICES DE ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_cpf ON public.geral_cnhs(cpf);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_nome ON public.geral_cnhs(nome);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_situacao ON public.geral_cnhs(situacao);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_ordem ON public.geral_cnhs(ordem DESC);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_memorando ON public.geral_cnhs(memorando_id);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_updated_at ON public.geral_cnhs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_data_movimento ON public.geral_cnhs(data_movimento DESC);

CREATE INDEX IF NOT EXISTS idx_candidatos_cpf ON public.candidatos(cpf);
CREATE INDEX IF NOT EXISTS idx_candidatos_memo ON public.candidatos(memorando_id);
CREATE INDEX IF NOT EXISTS idx_memorandos_status ON public.memorandos(status);
CREATE INDEX IF NOT EXISTS idx_memorandos_updated_at ON public.memorandos(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_historico_geral ON public.historico_movimentacoes(geral_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_reg ON public.auditoria(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_responsaveis_cpf ON public.responsaveis(cpf);
CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_cpf ON public.acessos_cidadao(cpf);

CREATE INDEX IF NOT EXISTS idx_declaracoes_numero ON public.declaracoes(numero);
CREATE INDEX IF NOT EXISTS idx_declaracoes_ano ON public.declaracoes(ano);
CREATE INDEX IF NOT EXISTS idx_declaracoes_procurador_cpf ON public.declaracoes(procurador_cpf);
CREATE INDEX IF NOT EXISTS idx_declaracoes_data_emissao ON public.declaracoes(data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_declaracoes_created_at ON public.declaracoes(created_at DESC);

-- ==============================================================================
-- 15. SUPABASE REALTIME REPLICATION (Habilita sincronização instantânea multi-máquina)
-- ==============================================================================
ALTER TABLE public.declaracoes REPLICA IDENTITY FULL;

DO $$
DECLARE
    tbl text;
    tbls text[] := ARRAY['geral_cnhs', 'memorandos', 'candidatos', 'responsaveis', 'mapeamento_localizacao', 'acessos_cidadao', 'orgao_config', 'declaracoes'];
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH tbl IN ARRAY tbls LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables 
                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
            ) THEN
                BEGIN
                    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
                EXCEPTION
                    WHEN duplicate_object OR duplicate_table OR undefined_object THEN
                        NULL;
                END;
            END IF;
        END LOOP;
    END IF;
END $$;

-- ==============================================================================
-- 16. ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO RBAC
-- ==============================================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memorandos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geral_cnhs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapeamento_localizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orgao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessos_cidadao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imagens_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.declaracoes ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes para evitar duplicidade
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- Função auxiliar segura para obter o perfil do usuário autenticado no JWT / tabela usuarios
CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS VARCHAR AS $$
DECLARE
    usr_perfil VARCHAR;
BEGIN
    SELECT perfil INTO usr_perfil
    FROM public.usuarios
    WHERE id = auth.uid() OR email = auth.email()
    LIMIT 1;

    RETURN COALESCE(usr_perfil, 'Consulta');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Políticas para USUÁRIOS
CREATE POLICY "usuarios_select_policy" ON public.usuarios
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "usuarios_admin_manage_policy" ON public.usuarios
    FOR ALL TO authenticated
    USING (
        auth.role() = 'authenticated' AND (
            public.get_current_user_profile() = 'Administrador' OR
            id = auth.uid()
        )
    )
    WITH CHECK (
        auth.role() = 'authenticated' AND (
            public.get_current_user_profile() = 'Administrador' OR
            id = auth.uid()
        )
    );

-- Políticas para GERAL_CNHS (Controle de CNHs)
CREATE POLICY "geral_cnhs_read_policy" ON public.geral_cnhs
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "geral_cnhs_write_policy" ON public.geral_cnhs
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    );

-- Políticas para MEMORANDOS
CREATE POLICY "memorandos_read_policy" ON public.memorandos
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "memorandos_write_policy" ON public.memorandos
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    );

-- Políticas para CANDIDATOS
CREATE POLICY "candidatos_read_policy" ON public.candidatos
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "candidatos_write_policy" ON public.candidatos
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    );

-- Políticas para RESPONSÁVEIS
CREATE POLICY "responsaveis_read_policy" ON public.responsaveis
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "responsaveis_write_policy" ON public.responsaveis
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    );

-- Políticas para MAPEAMENTO_LOCALIZACAO
CREATE POLICY "mapeamento_read_policy" ON public.mapeamento_localizacao
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "mapeamento_write_policy" ON public.mapeamento_localizacao
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor')
    );

-- Políticas para HISTÓRICO DE MOVIMENTAÇÕES
CREATE POLICY "historico_read_policy" ON public.historico_movimentacoes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "historico_insert_policy" ON public.historico_movimentacoes
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    );

-- Políticas para AUDITORIA
CREATE POLICY "auditoria_read_policy" ON public.auditoria
    FOR SELECT TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor')
    );

CREATE POLICY "auditoria_insert_policy" ON public.auditoria
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- Políticas para CONFIGURAÇÃO DO ÓRGÃO
CREATE POLICY "orgao_config_read_policy" ON public.orgao_config
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "orgao_config_write_policy" ON public.orgao_config
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor')
    );

-- Políticas para ACESSOS DO CIDADÃO (Registro de consultas públicas por CPF)
CREATE POLICY "acessos_cidadao_read_policy" ON public.acessos_cidadao
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "acessos_cidadao_insert_policy" ON public.acessos_cidadao
    FOR INSERT TO authenticated, anon WITH CHECK (true);

-- Políticas para IMAGENS SYNC
CREATE POLICY "imagens_sync_read_policy" ON public.imagens_sync
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "imagens_sync_write_policy" ON public.imagens_sync
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    );

-- Políticas para DECLARAÇÕES DE RETIRADA POR PROCURADOR
CREATE POLICY "declaracoes_read_policy" ON public.declaracoes
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "declaracoes_write_policy" ON public.declaracoes
    FOR ALL TO authenticated
    USING (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    )
    WITH CHECK (
        public.get_current_user_profile() IN ('Administrador', 'Supervisor', 'Operador')
    );

CREATE POLICY "declaracoes_anon_write_policy" ON public.declaracoes
    FOR ALL TO anon
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 17. CONFIGURAÇÃO DE STORAGE DO SUPABASE (Buckets para Logos e Anexos)
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'orgao_logos') THEN
            INSERT INTO storage.buckets (id, name, public) VALUES ('orgao_logos', 'orgao_logos', true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'anexos_detran') THEN
            INSERT INTO storage.buckets (id, name, public) VALUES ('anexos_detran', 'anexos_detran', true);
        END IF;
    END IF;
END $$;

-- Políticas de Storage para o bucket orgao_logos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'orgao_logos_public_read'
    ) THEN
        CREATE POLICY "orgao_logos_public_read" ON storage.objects
            FOR SELECT TO public USING (bucket_id = 'orgao_logos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'orgao_logos_auth_insert'
    ) THEN
        CREATE POLICY "orgao_logos_auth_insert" ON storage.objects
            FOR INSERT TO authenticated WITH CHECK (bucket_id = 'orgao_logos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'orgao_logos_auth_update'
    ) THEN
        CREATE POLICY "orgao_logos_auth_update" ON storage.objects
            FOR UPDATE TO authenticated USING (bucket_id = 'orgao_logos');
    END IF;
END $$;

-- ==============================================================================
-- 18. PERMISSÕES DE ACESSO (GRANTS) PARA ROLES SUPABASE
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.declaracoes TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

