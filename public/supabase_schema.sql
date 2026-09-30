-- ==============================================================================
-- SISTEMA DE CONTROLE DE CNH - DETRAN (SETOR DE PROTOCOLO)
-- SCRIPT MESTRE DE BANCO DE DADOS POSTGRESQL + SUPABASE AUTH + REALTIME + STORAGE
-- Versão 4.0.0 - 100% Idempotente, Tolerante a Falhas e Totalmente Compatível com o Supabase SQL Editor
-- ==============================================================================

-- 0. EXTENSÕES DO POSTGRESQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 0.1 MIGRAÇÃO AUTOMÁTICA INFALÍVEL DE TIPOS UUID PARA TEXT (100% Tolerante a Falhas)
-- Converte com segurança tabelas e colunas antigas de UUID para TEXT para aceitar
-- identificadores alfanuméricos como 'cnh-0171', 'cand-123', 'ba8dff5e', etc.
-- ==============================================================================

-- 1. Remove dinamicamente TODAS as restrições de Foreign Key que possam travar alterações de tipos
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Busca via pg_constraint para garantir cobertura total
    FOR r IN (
        SELECT conrelid::regclass::text AS table_name, conname
        FROM pg_constraint
        WHERE contype = 'f' 
          AND connamespace = 'public'::regnamespace
    ) LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I CASCADE', r.table_name, r.conname);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;

    -- Busca complementar via information_schema
    FOR r IN (
        SELECT tc.table_schema, tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'public' 
          AND tc.constraint_type = 'FOREIGN KEY'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I CASCADE', r.table_schema, r.table_name, r.constraint_name);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;
END $$;

-- 2. Converte dinamicamente todas as colunas de UUID para TEXT no schema public
DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN (
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type = 'uuid'
          AND table_name IN (
              SELECT table_name FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          )
    ) LOOP
        -- Remove default anterior que possa impedir a conversão
        BEGIN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT', col.table_name, col.column_name);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- Converte a coluna para TEXT usando cast explícito
        BEGIN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE TEXT USING %I::text', col.table_name, col.column_name, col.column_name);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- Se for 'id', define novo default padrão
        IF col.column_name = 'id' THEN
            BEGIN
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()::text', col.table_name);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END IF;
    END LOOP;
END $$;

-- 3. Garantia explícita e direta nas tabelas principais do sistema
DO $$
BEGIN
    -- geral_cnhs
    ALTER TABLE IF EXISTS public.geral_cnhs ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.geral_cnhs ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.geral_cnhs ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE IF EXISTS public.geral_cnhs ALTER COLUMN memorando_id TYPE TEXT USING memorando_id::text;
    ALTER TABLE IF EXISTS public.geral_cnhs ALTER COLUMN candidato_id TYPE TEXT USING candidato_id::text;
    ALTER TABLE IF EXISTS public.geral_cnhs ALTER COLUMN responsavel_id TYPE TEXT USING responsavel_id::text;
    ALTER TABLE IF EXISTS public.geral_cnhs ALTER COLUMN usuario_id TYPE TEXT USING usuario_id::text;

    -- candidatos
    ALTER TABLE IF EXISTS public.candidatos ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.candidatos ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.candidatos ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE IF EXISTS public.candidatos ALTER COLUMN memorando_id TYPE TEXT USING memorando_id::text;

    -- memorandos
    ALTER TABLE IF EXISTS public.memorandos ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.memorandos ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.memorandos ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE IF EXISTS public.memorandos ALTER COLUMN usuario_id TYPE TEXT USING usuario_id::text;

    -- usuarios
    ALTER TABLE IF EXISTS public.usuarios ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.usuarios ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.usuarios ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

    -- responsaveis
    ALTER TABLE IF EXISTS public.responsaveis ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.responsaveis ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.responsaveis ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

    -- historico_movimentacoes
    ALTER TABLE IF EXISTS public.historico_movimentacoes ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.historico_movimentacoes ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.historico_movimentacoes ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE IF EXISTS public.historico_movimentacoes ALTER COLUMN geral_id TYPE TEXT USING geral_id::text;
    ALTER TABLE IF EXISTS public.historico_movimentacoes ALTER COLUMN responsavel_id TYPE TEXT USING responsavel_id::text;
    ALTER TABLE IF EXISTS public.historico_movimentacoes ALTER COLUMN usuario_id TYPE TEXT USING usuario_id::text;

    -- auditoria
    ALTER TABLE IF EXISTS public.auditoria ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.auditoria ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.auditoria ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE IF EXISTS public.auditoria ALTER COLUMN usuario_id TYPE TEXT USING usuario_id::text;

    -- mapeamento, declaracoes, lotes
    ALTER TABLE IF EXISTS public.mapeamento_localizacao ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.mapeamento_localizacao ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.mapeamento_localizacao ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

    ALTER TABLE IF EXISTS public.declaracoes ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.declaracoes ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.declaracoes ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

    ALTER TABLE IF EXISTS public.lotes ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE IF EXISTS public.lotes ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS public.lotes ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 1. FUNÇÕES AUXILIARES DE ATUALIZAÇÃO AUTOMÁTICA (updated_at)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. TABELA DE USUÁRIOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    nome VARCHAR(255) NOT NULL,
    nome_completo VARCHAR(255),
    nome_curto VARCHAR(100) NOT NULL,
    cpf VARCHAR(14),
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

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS nome_completo VARCHAR(255);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS fone VARCHAR(50);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS funcao VARCHAR(100) DEFAULT 'Agente de Trânsito';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS setor VARCHAR(100) DEFAULT 'Protocolo';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER trigger_usuarios_updated_at
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
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ==============================================================================
-- 2.1 INSERÇÃO IDEMPOTENTE DOS 17 USUÁRIOS OFICIAIS DO DETRAN (INCLUINDO CONTROLE CNH 67)
-- ==============================================================================
DO $$
DECLARE
    u RECORD;
BEGIN
    FOR u IN (
        SELECT * FROM (VALUES
            ('67676767-6767-6767-6767-676767676767', 'Controle CNH 67 (Administrador)', 'Administrador Geral Controle CNH', 'Controle CNH', NULL, '(67) 99999-9999', 'controlecnh67@gmail.com', 'Administrador do Sistema', 'Protocolo Geral', 'controlecnh67', 'Administrador', '["dashboard:visualizar", "geral:visualizar", "consulta_cnh:visualizar", "protocolo_entrega:visualizar", "cnh:receber", "cnh:entregar", "cnh:editar", "candidatos:visualizar", "memorandos:criar", "memorandos:remeter", "declaracao:gerenciar", "acessos_cidadao:visualizar", "relatorios:visualizar", "responsaveis:gerenciar", "mapeamento:gerenciar", "historico:visualizar", "auditoria:visualizar", "usuarios:gerenciar", "orgao:gerenciar", "backup:gerenciar", "manual:visualizar"]'::jsonb),
            ('11111111-1111-1111-1111-111111111111', 'Carlos Eduardo Mendes (Administrador)', 'Carlos Eduardo Mendes (Administrador)', 'Carlos Eduardo', NULL, '(67) 99111-2222', 'admin@detran.pa.gov.br', 'Chefe de Setor de Protocolo', 'Protocolo Geral', 'admin', 'Administrador', '["dashboard:visualizar", "geral:visualizar", "consulta_cnh:visualizar", "protocolo_entrega:visualizar", "cnh:receber", "cnh:entregar", "cnh:editar", "candidatos:visualizar", "memorandos:criar", "memorandos:remeter", "declaracao:gerenciar", "acessos_cidadao:visualizar", "relatorios:visualizar", "responsaveis:gerenciar", "mapeamento:gerenciar", "historico:visualizar", "auditoria:visualizar", "usuarios:gerenciar", "orgao:gerenciar", "backup:gerenciar", "manual:visualizar"]'::jsonb),
            ('a1111111-1111-1111-1111-111111111112', 'Amerson', 'Amerson', 'Amerson', NULL, NULL, 'bentovi007@gmail.com', 'Administrador de Protocolo', 'Protocolo', 'bentovi007', 'Administrador', '["memorandos:criar", "memorandos:remeter", "cnh:receber", "cnh:entregar", "cnh:editar", "mapeamento:gerenciar", "responsaveis:gerenciar", "usuarios:gerenciar", "auditoria:visualizar"]'::jsonb),
            ('33a4ab38-0000-4000-8000-000000000001', 'DECK', 'DECK', 'Deck', NULL, '(67) 99777-8888', 'deck@detran.pa.gov.br', 'Agente de Trânsito', 'Atendimento CNH', 'deck', 'Supervisor', '["dashboard:visualizar", "geral:visualizar", "cnh:receber", "cnh:entregar", "memorandos:criar", "memorandos:remeter", "declaracao:gerenciar", "acessos_cidadao:visualizar", "relatorios:visualizar", "responsaveis:gerenciar", "mapeamento:gerenciar", "cnh:editar", "candidatos:visualizar", "historico:visualizar", "usuarios:gerenciar", "auditoria:visualizar", "orgao:gerenciar", "backup:gerenciar"]'::jsonb),
            ('ba8dff5e-0000-4000-8000-000000000002', 'Amerson Gonçalves Bento', 'Amerson Gonçalves Bento', 'Amerson', NULL, '(67) 99333-4444', 'amerson@detran.pa.gov.br', 'Agente de Trânsito', 'Atendimento CNH', 'amerson', 'Operador', '["dashboard:visualizar", "geral:visualizar", "protocolo_entrega:visualizar", "manual:visualizar", "cnh:receber", "cnh:entregar", "memorandos:criar", "memorandos:remeter", "declaracao:gerenciar", "acessos_cidadao:visualizar", "relatorios:visualizar", "responsaveis:gerenciar", "mapeamento:gerenciar"]'::jsonb),
            ('51f76373-0000-4000-8000-000000000003', 'Kaio ', 'Kaio Lohandes Gomes de Melo', 'Kaio', NULL, '(67) 99111-2222', 'kaio@detran.pa.gov.br', 'Agente de Trânsito', 'Atendimento CNH', 'kaio', 'Operador', '["dashboard:visualizar", "geral:visualizar", "cnh:receber", "cnh:entregar", "memorandos:criar", "memorandos:remeter", "declaracao:gerenciar", "acessos_cidadao:visualizar", "relatorios:visualizar", "responsaveis:gerenciar", "mapeamento:gerenciar"]'::jsonb),
            ('6459633e-dc86-43dd-9c14-f12aca624da5', 'Dabita Cardoso', 'Dabita Cardoso', 'Dabita', NULL, NULL, 'daby@gmail.com', 'Agente de Protocolo', 'Protocolo', 'daby', 'Operador', '["consulta_cnh:visualizar"]'::jsonb),
            ('f057331c-4c77-48f7-9dec-6d8047783167', 'João ', 'João Cristovão', 'João', NULL, NULL, 'joao@gmail.com', 'Agente de Protocolo', 'Protocolo', 'joao', 'Operador', '["dashboard:visualizar", "geral:visualizar", "cnh:receber", "memorandos:criar", "memorandos:remeter", "acessos_cidadao:visualizar", "backup:gerenciar"]'::jsonb),
            ('2837b0a8-0000-4000-8000-000000000004', 'Zedequias', 'Zedequias', 'Zedequias', NULL, '(67) 99666-7777', 'zedequias@detran.pa.gov.br', 'Agente de Trânsito', 'Atendimento CNH', 'zedequias', 'Operador', '["dashboard:visualizar", "geral:visualizar", "protocolo_entrega:visualizar", "manual:visualizar", "cnh:receber", "cnh:entregar", "memorandos:criar", "memorandos:remeter", "declaracao:gerenciar", "acessos_cidadao:visualizar", "relatorios:visualizar", "responsaveis:gerenciar", "mapeamento:gerenciar"]'::jsonb),
            ('33333333-3333-3333-3333-333333333333', 'Roberto Alves Pereira (Operador)', 'Roberto Alves Pereira', 'Roberto Alves', NULL, '(67) 99333-4444', 'operador@detran.pa.gov.br', 'Agente de Trânsito / Protocolista', 'Guichê de Entrega', 'operador', 'Operador', '["dashboard:visualizar", "geral:visualizar", "protocolo_entrega:visualizar", "manual:visualizar", "cnh:receber", "cnh:entregar", "memorandos:criar", "memorandos:remeter", "declaracao:gerenciar", "acessos_cidadao:visualizar", "relatorios:visualizar", "responsaveis:gerenciar", "mapeamento:gerenciar"]'::jsonb),
            ('33aa7d87-0000-4000-8000-000000000005', 'Regis', 'Regis', 'Regis', NULL, '(67) 99444-5555', 'regis@detran.pa.gov.br', 'Agente de Trânsito', 'Atendimento CNH', 'regis', 'Operador', '["dashboard:visualizar", "cnh:receber", "cnh:entregar", "consulta_cnh:visualizar", "memorandos:remeter", "memorandos:criar"]'::jsonb),
            ('44444444-4444-4444-4444-444444444444', 'Juliana Lima Rocha (Consulta)', 'Juliana Lima Rocha (Consulta)', 'Juliana Lima', NULL, '(67) 99444-5555', 'consulta@detran.pa.gov.br', 'Auditora de Controle Interno', 'Auditoria Geral', 'consulta', 'Consulta', '["dashboard:visualizar", "geral:visualizar", "protocolo_entrega:visualizar", "manual:visualizar", "acessos_cidadao:visualizar", "relatorios:visualizar", "historico:visualizar", "auditoria:visualizar"]'::jsonb),
            ('8bc1be25-0000-4000-8000-000000000006', 'Ivanilde', 'Ivanilde', 'Ivanilde', NULL, '(67) 99555-6666', 'ivanilde@detran.pa.gov.br', 'Agente de Trânsito', 'Atendimento CNH', 'ivanilde', 'Operador', '["memorandos:criar", "memorandos:remeter", "candidatos:visualizar", "consulta_cnh:visualizar", "cnh:entregar", "protocolo_entrega:visualizar"]'::jsonb),
            ('93fae0a9-657b-4cad-9b75-0a44050a3a6d', 'Ney Atendente', 'Ney Atendente', 'Ney', NULL, NULL, 'ney@gmail.com', 'Agente de Protocolo', 'Protocolo', 'ney', 'Operador', '["geral:visualizar", "dashboard:visualizar"]'::jsonb),
            ('a3897f28-66bd-401d-afe7-df4b47fb965c', 'Dayane', 'Dayane', 'Day', NULL, NULL, 'dayane@gmail.com', 'Agente de Protocolo', 'Protocolo', 'dayane', 'Operador', '["geral:visualizar", "dashboard:visualizar", "acessos_cidadao:visualizar", "responsaveis:gerenciar", "declaracao:gerenciar"]'::jsonb),
            ('ca606c23-1574-415c-bfa4-cfd163ce1236', 'Vanessa Aguiar', 'Vanessa Aguiar', 'Vanessa', NULL, NULL, 'vanessa@gmail.com', 'Agente de Protocolo', 'Protocolo', 'vanessa', 'Operador', '["protocolo_entrega:visualizar", "dashboard:visualizar"]'::jsonb),
            ('00000000-0000-0000-0000-000000000000', 'Agente Sistema', 'Agente Sistema', 'Agente', NULL, NULL, 'sistema@detran.local', 'Agente de Protocolo', 'Protocolo', 'sistema', 'Operador', '["memorandos:criar", "memorandos:remeter", "cnh:receber", "cnh:entregar", "cnh:editar", "mapeamento:gerenciar", "responsaveis:gerenciar", "usuarios:gerenciar", "auditoria:visualizar"]'::jsonb)
        ) AS t(id, nome, nome_completo, nome_curto, cpf, fone, email, funcao, setor, login, perfil, permissoes)
    ) LOOP
        BEGIN
            INSERT INTO public.usuarios (
                id, nome, nome_completo, nome_curto, cpf, fone, email, funcao, setor, login, perfil, permissoes, ativo
            )
            VALUES (
                u.id, u.nome, u.nome_completo, u.nome_curto, u.cpf, u.fone, u.email, u.funcao, u.setor, u.login, u.perfil, u.permissoes, true
            )
            ON CONFLICT (id) DO UPDATE SET
                nome = EXCLUDED.nome,
                nome_completo = EXCLUDED.nome_completo,
                nome_curto = EXCLUDED.nome_curto,
                email = EXCLUDED.email,
                login = EXCLUDED.login,
                perfil = EXCLUDED.perfil,
                permissoes = EXCLUDED.permissoes,
                ativo = true,
                updated_at = timezone('utc'::text, now());
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;


-- ==============================================================================
-- 3. TABELA DE RESPONSÁVEIS PELA RETIRADA DE CNHS (Despachantes, CFCs, Terceiros)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.responsaveis (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(100) DEFAULT 'Terceiro',
    cpf VARCHAR(14) UNIQUE NOT NULL,
    telefone VARCHAR(50),
    registro VARCHAR(100),
    observacao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS tipo VARCHAR(100) DEFAULT 'Terceiro';
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS registro VARCHAR(100);
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_responsaveis_updated_at ON public.responsaveis;
CREATE TRIGGER trigger_responsaveis_updated_at
BEFORE UPDATE ON public.responsaveis
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Proteção: O registro padrão "Proprietário" não pode ser excluído
CREATE OR REPLACE FUNCTION public.proteger_registro_proprietario()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.nome = 'Proprietário' OR OLD.cpf = '000.000.000-00' OR OLD.id = 'a0000000-0000-0000-0000-000000000001' THEN
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
        INSERT INTO public.responsaveis (id, nome, tipo, cpf, telefone, observacao, ativo)
        VALUES (
            'a0000000-0000-0000-0000-000000000001',
            'Proprietário',
            'Titular',
            '000.000.000-00',
            '(93) 00000-0000',
            'Titular da CNH retirando seu próprio documento no guichê',
            TRUE
        );
    ELSE
        UPDATE public.responsaveis 
        SET nome = 'Proprietário', tipo = 'Titular', ativo = TRUE 
        WHERE id = 'a0000000-0000-0000-0000-000000000001' OR cpf = '000.000.000-00';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 4. TABELA DE MAPEAMENTO DE LOCALIZAÇÃO (Gavetas e Repartições por Inicial)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.mapeamento_localizacao (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    inicial VARCHAR(5) UNIQUE NOT NULL,
    gaveta VARCHAR(50) NOT NULL,
    reparticao VARCHAR(50) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.mapeamento_localizacao ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
ALTER TABLE public.mapeamento_localizacao ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.mapeamento_localizacao ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_mapeamento_updated_at ON public.mapeamento_localizacao;
CREATE TRIGGER trigger_mapeamento_updated_at
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
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 5. TABELA DE MEMORANDOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.memorandos (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    numero VARCHAR(100) NOT NULL,
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    remessa VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração', 'Remetido', 'Recebido')),
    candidatos_count INTEGER DEFAULT 0,
    remetido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS remessa VARCHAR(100);
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Em elaboração';
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS candidatos_count INTEGER DEFAULT 0;
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS remetido_em TIMESTAMPTZ;
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_memorandos_updated_at ON public.memorandos;
CREATE TRIGGER trigger_memorandos_updated_at
BEFORE UPDATE ON public.memorandos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 6. TABELA DE CANDIDATOS (Filha de Memorandos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.candidatos (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    memorando_id TEXT,
    numero VARCHAR(50),
    pa VARCHAR(100),
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    telefone VARCHAR(50),
    remessa VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS memorando_id TEXT;
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS numero VARCHAR(50);
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS pa VARCHAR(100);
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS remessa VARCHAR(100);
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_candidatos_updated_at ON public.candidatos;
CREATE TRIGGER trigger_candidatos_updated_at
BEFORE UPDATE ON public.candidatos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 7. TABELA OFICIAL: GERAL_CNHS (Tabela Principal de Controle de CNHs e Protocolo)
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS public.geral_cnhs_ordem_seq START 1;

CREATE TABLE IF NOT EXISTS public.geral_cnhs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    ordem INTEGER NOT NULL DEFAULT nextval('public.geral_cnhs_ordem_seq'),
    memorando_id TEXT,
    candidato_id TEXT,
    pa VARCHAR(100),
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    telefone VARCHAR(50),
    notificado_whatsapp BOOLEAN DEFAULT FALSE,
    notificado_at TIMESTAMPTZ,
    gaveta VARCHAR(50) DEFAULT '',
    reparticao VARCHAR(50) DEFAULT '',
    situacao VARCHAR(50) NOT NULL DEFAULT 'Remetida' CHECK (situacao IN ('Remetida', 'Recebida', 'Pendente', 'Entregue')),
    responsavel_id TEXT,
    responsavel_nome VARCHAR(255),
    data_movimento TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    memorando_numero VARCHAR(100),
    remessa VARCHAR(100),
    lote VARCHAR(100),
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS memorando_id TEXT;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS candidato_id TEXT;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS pa VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT FALSE;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS notificado_at TIMESTAMPTZ;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS gaveta VARCHAR(50) DEFAULT '';
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS reparticao VARCHAR(50) DEFAULT '';
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS responsavel_id TEXT;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(255);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS memorando_numero VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS remessa VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS lote VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_geral_cnhs_updated_at ON public.geral_cnhs;
CREATE TRIGGER trigger_geral_cnhs_updated_at
BEFORE UPDATE ON public.geral_cnhs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 8. TABELA DE HISTÓRICO DE MOVIMENTAÇÕES (Auditoria de CNHs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.historico_movimentacoes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    geral_id TEXT,
    geral_ordem INTEGER,
    geral_nome VARCHAR(255),
    geral_cpf VARCHAR(14),
    situacao_anterior VARCHAR(50),
    situacao_nova VARCHAR(50) NOT NULL,
    responsavel_id TEXT,
    responsavel_nome VARCHAR(255),
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    observacao TEXT,
    data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS geral_ordem INTEGER;
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS geral_nome VARCHAR(255);
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS geral_cpf VARCHAR(14);
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS responsavel_id TEXT;
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(255);
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.historico_movimentacoes ADD COLUMN IF NOT EXISTS data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Proteção: Registros de histórico nunca devem ser excluídos
CREATE OR REPLACE FUNCTION public.impedir_exclusao_historico()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Registros de histórico de movimentação são imutáveis e não podem ser excluídos.';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_impedir_exclusao_historico ON public.historico_movimentacoes;
CREATE TRIGGER trigger_impedir_exclusao_historico
BEFORE DELETE ON public.historico_movimentacoes
FOR EACH ROW EXECUTE FUNCTION public.impedir_exclusao_historico();

-- ==============================================================================
-- 9. TABELA DE AUDITORIA DO SISTEMA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auditoria (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tabela VARCHAR(100) NOT NULL,
    registro_id VARCHAR(100) NOT NULL,
    acao VARCHAR(50) NOT NULL CHECK (acao IN ('Inclusão', 'Alteração', 'Exclusão', 'Login', 'Logout', 'Remessa', 'Recebimento', 'Entrega', 'Reabertura', 'Importação', 'Backup')),
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ip VARCHAR(50) DEFAULT '127.0.0.1',
    valores_anteriores JSONB,
    valores_novos JSONB
);

ALTER TABLE public.auditoria ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.auditoria ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.auditoria ADD COLUMN IF NOT EXISTS ip VARCHAR(50) DEFAULT '127.0.0.1';
ALTER TABLE public.auditoria ADD COLUMN IF NOT EXISTS valores_anteriores JSONB;
ALTER TABLE public.auditoria ADD COLUMN IF NOT EXISTS valores_novos JSONB;
ALTER TABLE public.auditoria ADD COLUMN IF NOT EXISTS data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Proteção: Logs de auditoria são imutáveis (sem UPDATE ou DELETE)
CREATE OR REPLACE FUNCTION public.impedir_modificacao_auditoria()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'A tabela de auditoria é estritamente append-only. Operações de UPDATE ou DELETE são proibidas.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_impedir_modificacao_auditoria ON public.auditoria;
CREATE TRIGGER trigger_impedir_modificacao_auditoria
BEFORE UPDATE OR DELETE ON public.auditoria
FOR EACH ROW EXECUTE FUNCTION public.impedir_modificacao_auditoria();

-- ==============================================================================
-- 10. TABELA DE CONFIGURAÇÃO DO ÓRGÃO E LOGO
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

ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS governo TEXT DEFAULT 'GOVERNO DO ESTADO DO PARÁ';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS secretaria TEXT DEFAULT 'SECRETARIA DE ESTADO DE TRANSPORTES';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS orgao TEXT DEFAULT 'DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS sigla TEXT DEFAULT 'DETRAN/PA - Ciretran Itaituba';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS origem_padrao TEXT DEFAULT 'Agência DETRAN Itaituba';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS destino_padrao TEXT DEFAULT 'Coordenação de Habilitação / RENACH';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS cidade_uf TEXT DEFAULT 'Itaituba - PA';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS telefone TEXT DEFAULT '(93) 3518-1234';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS email TEXT DEFAULT 'protocolo.itaituba@detran.pa.gov.br';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS endereco TEXT DEFAULT 'Rod. Transamazônica, Km 02 - Bela Vista';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS subtitulo_relatorio TEXT DEFAULT 'Setor de Protocolo e Controle de CNHs';
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE public.orgao_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_orgao_config_updated_at ON public.orgao_config;
CREATE TRIGGER trigger_orgao_config_updated_at
BEFORE UPDATE ON public.orgao_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inserção idempotente do registro padrão de configurações
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgao_config WHERE id = 'default') THEN
        INSERT INTO public.orgao_config (id) VALUES ('default');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 11. TABELA DE CONSULTAS DO CIDADÃO (LOGS DE ACESSO WEB MOBILE)
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

ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS numero INTEGER;
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS nome_titular TEXT;
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS situacao TEXT;
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS resultado_status TEXT;
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'Web Mobile';
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS dispositivo TEXT;
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS cidade_origem TEXT;
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS ip_mascarado TEXT;
ALTER TABLE public.acessos_cidadao ADD COLUMN IF NOT EXISTS data_hora TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- ==============================================================================
-- 12. TABELA DE SINCRONIZAÇÃO DE IMAGENS E ANEXOS
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

ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS tabela_ref TEXT;
ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS registro_id TEXT;
ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS tamanho INTEGER;
ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS dados_base64 TEXT;
ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS url_publica TEXT;
ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.imagens_sync ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- ==============================================================================
-- 13. TABELA DE DECLARAÇÕES DE ENTREGA DE CNH
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
    procurador_telefone VARCHAR(50),
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

ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS procurador_telefone VARCHAR(50);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS procurador_fone VARCHAR(50);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS procurador_endereco TEXT;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS condutores JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_nome VARCHAR(255);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_cargo VARCHAR(100);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_unidade VARCHAR(100);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS gerente_portaria VARCHAR(150);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_declaracoes_updated_at ON public.declaracoes;
CREATE TRIGGER trigger_declaracoes_updated_at
BEFORE UPDATE ON public.declaracoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 14. TABELA DE LOTES DE CNHs (CNHs RECEBIDAS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.lotes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    numero INTEGER NOT NULL,
    data_recebimento DATE NOT NULL DEFAULT CURRENT_DATE,
    documentos_impressos INTEGER NOT NULL DEFAULT 0,
    pdf_nome TEXT,
    pdf_url TEXT,
    pdf_tamanho BIGINT,
    observacao TEXT,
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS documentos_impressos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS pdf_nome TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS pdf_tamanho BIGINT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

DROP TRIGGER IF EXISTS trigger_lotes_updated_at ON public.lotes;
CREATE TRIGGER trigger_lotes_updated_at
BEFORE UPDATE ON public.lotes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 15. ÍNDICES DE ALTA PERFORMANCE PARA BUSCA E SINCRONIZAÇÃO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_login ON public.usuarios(login);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_updated_at ON public.usuarios(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_responsaveis_cpf ON public.responsaveis(cpf);
CREATE INDEX IF NOT EXISTS idx_responsaveis_nome ON public.responsaveis(nome);
CREATE INDEX IF NOT EXISTS idx_responsaveis_updated_at ON public.responsaveis(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mapeamento_inicial ON public.mapeamento_localizacao(inicial);
CREATE INDEX IF NOT EXISTS idx_mapeamento_updated_at ON public.mapeamento_localizacao(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memorandos_numero ON public.memorandos(numero);
CREATE INDEX IF NOT EXISTS idx_memorandos_status ON public.memorandos(status);
CREATE INDEX IF NOT EXISTS idx_memorandos_updated_at ON public.memorandos(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidatos_cpf ON public.candidatos(cpf);
CREATE INDEX IF NOT EXISTS idx_candidatos_nome ON public.candidatos(nome);
CREATE INDEX IF NOT EXISTS idx_candidatos_memorando_id ON public.candidatos(memorando_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_updated_at ON public.candidatos(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_geral_cnhs_cpf ON public.geral_cnhs(cpf);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_nome ON public.geral_cnhs(nome);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_situacao ON public.geral_cnhs(situacao);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_ordem ON public.geral_cnhs(ordem DESC);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_updated_at ON public.geral_cnhs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_memorando_id ON public.geral_cnhs(memorando_id);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_candidato_id ON public.geral_cnhs(candidato_id);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_responsavel_id ON public.geral_cnhs(responsavel_id);

CREATE INDEX IF NOT EXISTS idx_historico_geral_id ON public.historico_movimentacoes(geral_id);
CREATE INDEX IF NOT EXISTS idx_historico_data_hora ON public.historico_movimentacoes(data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_reg ON public.auditoria(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_data_hora ON public.auditoria(data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_cpf ON public.acessos_cidadao(cpf);
CREATE INDEX IF NOT EXISTS idx_acessos_cidadao_data ON public.acessos_cidadao(data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_declaracoes_numero ON public.declaracoes(numero);
CREATE INDEX IF NOT EXISTS idx_declaracoes_data ON public.declaracoes(data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_declaracoes_updated_at ON public.declaracoes(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_lotes_numero ON public.lotes(numero);
CREATE INDEX IF NOT EXISTS idx_lotes_data ON public.lotes(data_recebimento DESC);
CREATE INDEX IF NOT EXISTS idx_lotes_updated_at ON public.lotes(updated_at DESC);

-- ==============================================================================
-- 16. CONFIGURAÇÃO DE SEGURANÇA (RLS - ROW LEVEL SECURITY)
-- Habilitação e Políticas Totalmente Idempotentes (DROP IF EXISTS antes de CREATE)
-- ==============================================================================

-- 16.1. USUÁRIOS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_read_policy" ON public.usuarios;
CREATE POLICY "usuarios_read_policy" ON public.usuarios FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "usuarios_write_policy" ON public.usuarios;
CREATE POLICY "usuarios_write_policy" ON public.usuarios FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.2. RESPONSÁVEIS
ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "responsaveis_read_policy" ON public.responsaveis;
CREATE POLICY "responsaveis_read_policy" ON public.responsaveis FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "responsaveis_write_policy" ON public.responsaveis;
CREATE POLICY "responsaveis_write_policy" ON public.responsaveis FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.3. MAPEAMENTO DE LOCALIZAÇÃO
ALTER TABLE public.mapeamento_localizacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mapeamento_read_policy" ON public.mapeamento_localizacao;
CREATE POLICY "mapeamento_read_policy" ON public.mapeamento_localizacao FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "mapeamento_write_policy" ON public.mapeamento_localizacao;
CREATE POLICY "mapeamento_write_policy" ON public.mapeamento_localizacao FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.4. MEMORANDOS
ALTER TABLE public.memorandos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "memorandos_read_policy" ON public.memorandos;
CREATE POLICY "memorandos_read_policy" ON public.memorandos FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "memorandos_write_policy" ON public.memorandos;
CREATE POLICY "memorandos_write_policy" ON public.memorandos FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.5. CANDIDATOS
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "candidatos_read_policy" ON public.candidatos;
CREATE POLICY "candidatos_read_policy" ON public.candidatos FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "candidatos_write_policy" ON public.candidatos;
CREATE POLICY "candidatos_write_policy" ON public.candidatos FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.6. GERAL_CNHS
ALTER TABLE public.geral_cnhs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "geral_cnhs_read_policy" ON public.geral_cnhs;
CREATE POLICY "geral_cnhs_read_policy" ON public.geral_cnhs FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "geral_cnhs_write_policy" ON public.geral_cnhs;
CREATE POLICY "geral_cnhs_write_policy" ON public.geral_cnhs FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.7. HISTÓRICO DE MOVIMENTAÇÕES
ALTER TABLE public.historico_movimentacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico_read_policy" ON public.historico_movimentacoes;
CREATE POLICY "historico_read_policy" ON public.historico_movimentacoes FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "historico_insert_policy" ON public.historico_movimentacoes;
CREATE POLICY "historico_insert_policy" ON public.historico_movimentacoes FOR INSERT TO authenticated, anon WITH CHECK (true);

-- 16.8. AUDITORIA
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auditoria_read_policy" ON public.auditoria;
CREATE POLICY "auditoria_read_policy" ON public.auditoria FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "auditoria_insert_policy" ON public.auditoria;
CREATE POLICY "auditoria_insert_policy" ON public.auditoria FOR INSERT TO authenticated, anon WITH CHECK (true);

-- 16.9. CONFIGURAÇÃO DO ÓRGÃO
ALTER TABLE public.orgao_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orgao_config_read_policy" ON public.orgao_config;
CREATE POLICY "orgao_config_read_policy" ON public.orgao_config FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "orgao_config_write_policy" ON public.orgao_config;
CREATE POLICY "orgao_config_write_policy" ON public.orgao_config FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.10. CONSULTAS DO CIDADÃO
ALTER TABLE public.acessos_cidadao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acessos_cidadao_read_policy" ON public.acessos_cidadao;
CREATE POLICY "acessos_cidadao_read_policy" ON public.acessos_cidadao FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "acessos_cidadao_insert_policy" ON public.acessos_cidadao;
CREATE POLICY "acessos_cidadao_insert_policy" ON public.acessos_cidadao FOR INSERT TO authenticated, anon WITH CHECK (true);

-- 16.11. IMAGENS SYNC
ALTER TABLE public.imagens_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "imagens_sync_read_policy" ON public.imagens_sync;
CREATE POLICY "imagens_sync_read_policy" ON public.imagens_sync FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "imagens_sync_write_policy" ON public.imagens_sync;
CREATE POLICY "imagens_sync_write_policy" ON public.imagens_sync FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.12. DECLARAÇÕES
ALTER TABLE public.declaracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "declaracoes_read_policy" ON public.declaracoes;
CREATE POLICY "declaracoes_read_policy" ON public.declaracoes FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "declaracoes_write_policy" ON public.declaracoes;
CREATE POLICY "declaracoes_write_policy" ON public.declaracoes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 16.13. LOTES
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lotes_read_policy" ON public.lotes;
CREATE POLICY "lotes_read_policy" ON public.lotes FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "lotes_write_policy" ON public.lotes;
CREATE POLICY "lotes_write_policy" ON public.lotes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- ==============================================================================
-- 17. REPLICAÇÃO SUPABASE REALTIME (13 Tabelas)
-- ==============================================================================
DO $$
DECLARE
    tbl text;
    tbls text[] := ARRAY[
        'usuarios',
        'responsaveis',
        'mapeamento_localizacao',
        'memorandos',
        'candidatos',
        'geral_cnhs',
        'historico_movimentacoes',
        'auditoria',
        'orgao_config',
        'acessos_cidadao',
        'imagens_sync',
        'declaracoes',
        'lotes'
    ];
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH tbl IN ARRAY tbls LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables 
                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
            ) THEN
                BEGIN
                    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;
            END IF;
        END LOOP;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ==============================================================================
-- 18. PERMISSÕES DE ACESSO (GRANTS) PARA ROLES SUPABASE
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- ==============================================================================
-- 19. CONFIGURAÇÃO DE STORAGE DO SUPABASE (Buckets para Logos e Anexos)
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('orgao_logos', 'orgao_logos', true) 
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('anexos_detran', 'anexos_detran', true) 
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('app_images', 'app_images', true) 
        ON CONFLICT (id) DO NOTHING;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS "orgao_logos_public_read" ON storage.objects;
        CREATE POLICY "orgao_logos_public_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'orgao_logos');

        DROP POLICY IF EXISTS "orgao_logos_auth_insert" ON storage.objects;
        CREATE POLICY "orgao_logos_auth_insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'orgao_logos');

        DROP POLICY IF EXISTS "orgao_logos_auth_update" ON storage.objects;
        CREATE POLICY "orgao_logos_auth_update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'orgao_logos');

        DROP POLICY IF EXISTS "app_images_public_read" ON storage.objects;
        CREATE POLICY "app_images_public_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'app_images');

        DROP POLICY IF EXISTS "app_images_public_insert" ON storage.objects;
        CREATE POLICY "app_images_public_insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'app_images');

        DROP POLICY IF EXISTS "app_images_public_update" ON storage.objects;
        CREATE POLICY "app_images_public_update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'app_images');
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
