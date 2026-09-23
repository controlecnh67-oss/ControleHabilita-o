import React, { useState, useEffect, useRef } from "react";
import { 
  Database, 
  UploadCloud, 
  DownloadCloud, 
  RefreshCw, 
  FileJson, 
  FileSpreadsheet,
  FileCode, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  Check, 
  RotateCcw, 
  Server, 
  Activity,
  ShieldCheck,
  Code2,
  Terminal,
  Upload,
  Layers,
  FileDown
} from "lucide-react";
import { 
  isSupabaseConnected, 
  exportDatabaseJSON, 
  exportDatabaseExcel,
  exportTableExcel,
  importDatabaseJSON, 
  importSpreadsheetData,
  checkSyncStatus, 
  syncLocalToSupabase, 
  syncSupabaseToLocal, 
  syncBiDirectional,
  syncSingleTable,
  resetDemoData,
  deduplicateResponsaveis,
  restaurarVinculosRelacionais,
  RelationalRestorationResult,
  SyncStatusItem
} from "../services/db";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";
import { 
  getSupabaseCredentials, 
  saveLocalSupabaseConfig, 
  clearLocalSupabaseConfig, 
  supabase, 
  isSupabaseConfigured 
} from "../services/supabase";
import { GoogleDriveBackupCard } from "../components/GoogleDriveBackupCard";
import { useAutoSync, reconcilePendingDifferences } from "../services/autoSyncService";

export const BackupSyncPage: React.FC = () => {
  const [stats, setStats] = useState<SyncStatusItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [isSyncingUpload, setIsSyncingUpload] = useState<boolean>(false);
  const [isSyncingDownload, setIsSyncingDownload] = useState<boolean>(false);
  const [isSyncingBiDirectional, setIsSyncingBiDirectional] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [copiedFullSql, setCopiedFullSql] = useState<boolean>(false);
  const [copiedImagesSql, setCopiedImagesSql] = useState<boolean>(false);
  const [copiedLotesSql, setCopiedLotesSql] = useState<boolean>(false);
  const [pingStatus, setPingStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string; latency?: number }>({ status: 'idle' });

  const handleCopyFullSchemaSql = () => {
    const sql = `-- ==============================================================================
-- SISTEMA DE CONTROLE DE CNH - DETRAN (SETOR DE PROTOCOLO)
-- SCRIPT MESTRE DE BANCO DE DADOS POSTGRESQL + SUPABASE AUTH + REALTIME + STORAGE
-- Versão 3.0.0 - Oficial, Idempotente e Compatível com Vercel / Supabase
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. TABELA DE USUÁRIOS
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

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

-- 2. TABELA DE RESPONSÁVEIS
CREATE TABLE IF NOT EXISTS public.responsaveis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'Despachante',
    cpf VARCHAR(14) UNIQUE NOT NULL,
    telefone VARCHAR(50),
    registro VARCHAR(100),
    observacao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) DEFAULT 'Despachante';
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

-- Inserção segura do Responsável padrão "Proprietário"
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
END $$;

-- 3. TABELA DE MAPEAMENTO DE LOCALIZAÇÃO
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

-- 4. TABELA DE MEMORANDOS
CREATE TABLE IF NOT EXISTS public.memorandos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(100) NOT NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(255),
    remessa VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração', 'Remetido', 'Recebido')),
    candidatos_count INTEGER DEFAULT 0,
    remetido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS candidatos_count INTEGER DEFAULT 0;
ALTER TABLE public.memorandos ADD COLUMN IF NOT EXISTS remetido_em TIMESTAMPTZ;

-- 5. TABELA DE CANDIDATOS
CREATE TABLE IF NOT EXISTS public.candidatos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memorando_id UUID REFERENCES public.memorandos(id) ON DELETE CASCADE,
    numero VARCHAR(50),
    pa VARCHAR(20),
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    telefone VARCHAR(50),
    remessa VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS remessa VARCHAR(100);
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS pa VARCHAR(20);

-- 6. TABELA OFICIAL DE CNHS (GERAL_CNHS)
CREATE SEQUENCE IF NOT EXISTS public.geral_cnhs_ordem_seq START 1;

CREATE TABLE IF NOT EXISTS public.geral_cnhs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordem INTEGER NOT NULL DEFAULT nextval('public.geral_cnhs_ordem_seq'),
    memorando_id UUID REFERENCES public.memorandos(id) ON DELETE SET NULL,
    candidato_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    pa VARCHAR(20),
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
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS pa VARCHAR(20);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT FALSE;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS notificado_at TIMESTAMPTZ;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS remessa VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS memorando_numero VARCHAR(100);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(255);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.geral_cnhs ADD COLUMN IF NOT EXISTS telefone VARCHAR(50);

-- 7. TABELA DE HISTÓRICO DE MOVIMENTAÇÕES
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

-- 8. TABELA DE AUDITORIA
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

-- 9. TABELA DE CONFIGURAÇÃO DO ÓRGÃO
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

-- 10. TABELA DE CONSULTAS DO CIDADÃO
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

-- 11. TABELA DE IMAGENS E ANEXOS
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

-- 12. TABELA DE LOTES DE CNHs (CNHs RECEBIDAS)
CREATE TABLE IF NOT EXISTS public.lotes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    numero BIGINT NOT NULL,
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

-- 13. TABELA DE DECLARAÇÕES EMITIDAS
CREATE TABLE IF NOT EXISTS public.declaracoes (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    numero VARCHAR(100) NOT NULL,
    ano INTEGER NOT NULL,
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    procurador_id TEXT,
    procurador_nome TEXT NOT NULL,
    procurador_cpf VARCHAR(14) NOT NULL,
    procurador_telefone VARCHAR(50),
    procurador_endereco TEXT,
    texto_declaracao TEXT,
    condutores JSONB DEFAULT '[]'::jsonb,
    cidade VARCHAR(100) DEFAULT 'Itaituba',
    uf VARCHAR(10) DEFAULT 'PA',
    gerente_nome VARCHAR(255),
    gerente_cargo VARCHAR(255),
    gerente_unidade VARCHAR(255),
    gerente_portaria VARCHAR(255),
    observacao TEXT,
    usuario_id TEXT,
    usuario_nome VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_cpf ON public.geral_cnhs(cpf);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_pa ON public.geral_cnhs(pa);
CREATE INDEX IF NOT EXISTS idx_candidatos_pa ON public.candidatos(pa);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_nome ON public.geral_cnhs(nome);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_situacao ON public.geral_cnhs(situacao);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_ordem ON public.geral_cnhs(ordem DESC);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_memorando ON public.geral_cnhs(memorando_id);
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_updated_at ON public.geral_cnhs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lotes_numero ON public.lotes(numero);
CREATE INDEX IF NOT EXISTS idx_lotes_data_recebimento ON public.lotes(data_recebimento DESC);
CREATE INDEX IF NOT EXISTS idx_declaracoes_numero ON public.declaracoes(numero);

-- Garantir colunas compatíveis em bancos legados
ALTER TABLE public.lotes ALTER COLUMN numero TYPE BIGINT;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS pdf_tamanho BIGINT;
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS procurador_telefone VARCHAR(50);
ALTER TABLE public.declaracoes ADD COLUMN IF NOT EXISTS procurador_fone VARCHAR(50);

-- 15. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapeamento_localizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memorandos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geral_cnhs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orgao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessos_cidadao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imagens_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.declaracoes ENABLE ROW LEVEL SECURITY;

-- 16. POLÍTICAS DE ACESSO
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

CREATE POLICY "usuarios_policy" ON public.usuarios FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "responsaveis_policy" ON public.responsaveis FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "mapeamento_policy" ON public.mapeamento_localizacao FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "memorandos_policy" ON public.memorandos FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "candidatos_policy" ON public.candidatos FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "geral_cnhs_policy" ON public.geral_cnhs FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "historico_policy" ON public.historico_movimentacoes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "auditoria_policy" ON public.auditoria FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "orgao_config_policy" ON public.orgao_config FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "acessos_cidadao_policy" ON public.acessos_cidadao FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "imagens_sync_policy" ON public.imagens_sync FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "lotes_policy" ON public.lotes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "declaracoes_policy" ON public.declaracoes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 17. HABILITAR REALTIME REPLICATION
DO $$
DECLARE
    tbl text;
    tbls text[] := ARRAY['geral_cnhs', 'memorandos', 'candidatos', 'responsaveis', 'mapeamento_localizacao', 'acessos_cidadao', 'orgao_config', 'declaracoes', 'lotes'];
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
`;

    navigator.clipboard.writeText(sql);
    setCopiedFullSql(true);
    setTimeout(() => setCopiedFullSql(false), 3000);
  };

  const handleCopyImagesAndStorageSql = () => {
    const sql = `-- ============================================================================
-- SCRIPT DE MÍDIA, LOGOMARCA E ARMAZENAMENTO (SUPABASE STORAGE & POLÍTICAS)
-- Sistema de Controle DETRAN/PA
-- ============================================================================

-- 1. TABELA DE CONFIGURAÇÃO DO ÓRGÃO E LOGOMARCA
CREATE TABLE IF NOT EXISTS orgao_config (
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

-- 2. TABELA DE IMAGENS E ANEXOS SINCRONIZADOS
CREATE TABLE IF NOT EXISTS imagens_sync (
  id TEXT PRIMARY KEY,
  tabela_ref TEXT,
  registro_id TEXT,
  nome TEXT NOT NULL,
  tipo TEXT,
  tamanho INTEGER,
  dados_base64 TEXT,
  url_publica TEXT,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- HABILITAR RLS NAS TABELAS DE IMAGEM
ALTER TABLE orgao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE imagens_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acesso total em orgao_config" ON orgao_config;
CREATE POLICY "Permitir acesso total em orgao_config" ON orgao_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em imagens_sync" ON imagens_sync;
CREATE POLICY "Permitir acesso total em imagens_sync" ON imagens_sync FOR ALL USING (true) WITH CHECK (true);

-- 3. BUCKET DE IMAGENS NO SUPABASE STORAGE (storage.buckets)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app_images', 
  'app_images', 
  true, 
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- POLÍTICAS DE SEGURANÇA (RLS) PARA ARQUIVOS NO SUPABASE STORAGE (storage.objects)
DROP POLICY IF EXISTS "Permitir Leitura Publica de Imagens" ON storage.objects;
CREATE POLICY "Permitir Leitura Publica de Imagens"
ON storage.objects FOR SELECT
USING (bucket_id = 'app_images');

DROP POLICY IF EXISTS "Permitir Upload de Imagens" ON storage.objects;
CREATE POLICY "Permitir Upload de Imagens"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app_images');

DROP POLICY IF EXISTS "Permitir Atualizacao de Imagens" ON storage.objects;
CREATE POLICY "Permitir Atualizacao de Imagens"
ON storage.objects FOR UPDATE
USING (bucket_id = 'app_images');

DROP POLICY IF EXISTS "Permitir Delecao de Imagens" ON storage.objects;
CREATE POLICY "Permitir Delecao de Imagens"
ON storage.objects FOR DELETE
USING (bucket_id = 'app_images');
`;

    navigator.clipboard.writeText(sql);
    setCopiedImagesSql(true);
    setTimeout(() => setCopiedImagesSql(false), 3000);
  };
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  // Estados de configuração manual do Supabase
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const creds = getSupabaseCredentials();
  const [inputUrl, setInputUrl] = useState<string>(creds.url !== "https://sua-url.supabase.co" ? creds.url : "");
  const [inputKey, setInputKey] = useState<string>(creds.key !== "sua-chave-anon" ? creds.key : "");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const spreadsheetFileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [spreadsheetModalOpen, setSpreadsheetModalOpen] = useState(false);
  const [selectedSpreadsheetFile, setSelectedSpreadsheetFile] = useState<File | null>(null);
  const [syncSpreadsheetToSupabase, setSyncSpreadsheetToSupabase] = useState<boolean>(true);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [isImportingSpreadsheet, setIsImportingSpreadsheet] = useState<boolean>(false);
  const [syncingTableKey, setSyncingTableKey] = useState<string | null>(null);
  const [isAutoReconciling, setIsAutoReconciling] = useState<boolean>(false);
  const [isDeduplicatingResp, setIsDeduplicatingResp] = useState<boolean>(false);
  const [isRestoringLinks, setIsRestoringLinks] = useState<boolean>(false);
  const [linksResult, setLinksResult] = useState<RelationalRestorationResult | null>(null);
  const [copiedAnalyzeSql, setCopiedAnalyzeSql] = useState<boolean>(false);

  const isConnected = isSupabaseConfigured();
  const supabaseUrl = creds.url;
  const autoSyncState = useAutoSync();

  const isLoadingStatsRef = useRef(false);

  useEffect(() => {
    loadStats();
    let debounceTimer: any = null;
    const handleSyncUpdated = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadStats();
      }, 1200);
    };
    window.addEventListener("detran_sync_updated", handleSyncUpdated);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("detran_sync_updated", handleSyncUpdated);
    };
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleReconcileAllTables = async () => {
    if (!isConnected) {
      setShowConfigModal(true);
      setLogs(["⚠️ Supabase não configurado. Por favor, insira a URL e Chave ANON no painel para ativar a sincronização."]);
      return;
    }
    setIsAutoReconciling(true);
    addLog("🚀 Disparando reconciliação automática de todas as tabelas com o banco de dados...");
    try {
      await reconcilePendingDifferences(true);
      addLog("✨ Ciclo de sincronização automática de todas as tabelas finalizado com sucesso!");
    } catch (err: any) {
      addLog(`❌ Erro durante a reconciliação automática: ${err.message}`);
    } finally {
      setIsAutoReconciling(false);
      await loadStats();
    }
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim() || !inputKey.trim()) {
      alert("Por favor, preencha a URL e a Chave ANON do Supabase.");
      return;
    }
    saveLocalSupabaseConfig(inputUrl, inputKey);
    setSaveSuccessMsg("Credenciais do Supabase salvas no navegador com sucesso!");
    setTimeout(() => {
      setSaveSuccessMsg(null);
      setShowConfigModal(false);
    }, 1500);
    loadStats();
  };

  const handleClearCredentials = () => {
    clearLocalSupabaseConfig();
    setInputUrl("");
    setInputKey("");
    loadStats();
    setSaveSuccessMsg("Credenciais locais do Supabase foram removidas com sucesso.");
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  const loadStats = async () => {
    if (isLoadingStatsRef.current) return;
    isLoadingStatsRef.current = true;
    setIsLoadingStats(true);
    try {
      const items = await checkSyncStatus();
      setStats(items);
    } catch (err) {
      console.error("Erro ao carregar status de sincronia:", err);
    } finally {
      setIsLoadingStats(false);
      isLoadingStatsRef.current = false;
    }
  };

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const handleTestConnection = async () => {
    setPingStatus({ status: 'testing' });
    const startTime = performance.now();
    try {
      if (!isSupabaseConfigured()) {
        setShowConfigModal(true);
        setPingStatus({ 
          status: 'error', 
          message: 'Credenciais do Supabase não configuradas. Insira sua URL e Chave Anon no formulário aberto para conectar.' 
        });
        return;
      }
      const { data, error } = await supabase.from('usuarios').select('id', { count: 'exact', head: true });
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      if (error) {
        setPingStatus({ status: 'error', message: `Erro ao comunicar com Supabase: ${error.message}` });
      } else {
        setPingStatus({ status: 'success', message: 'Conexão ativa e operando normalmente com o banco Supabase!', latency });
      }
    } catch (err: any) {
      setPingStatus({ status: 'error', message: err.message || 'Falha ao conectar no Supabase' });
    }
  };

  const handleSyncUpload = async () => {
    if (!isConnected) {
      setShowConfigModal(true);
      setLogs(["⚠️ Supabase não configurado. Por favor, insira a URL e Chave ANON no painel para ativar o envio."]);
      return;
    }
    setIsSyncingUpload(true);
    setLogs([]);
    addLog("=== INICIANDO SINCRONIZAÇÃO: LOCAL -> SUPABASE ===");

    try {
      const result = await syncLocalToSupabase((msg) => addLog(msg));
      if (result.success) {
        addLog(`🎉 Sucesso! Total de ${result.syncedCount} registros atualizados no Supabase.`);
      } else {
        addLog(`⚠️ Concluído com avisos: ${result.errors.length} erro(s) encontrados.`);
      }
    } catch (err: any) {
      addLog(`❌ Erro fatal durante a sincronização: ${err.message}`);
    } finally {
      setIsSyncingUpload(false);
      await loadStats();
    }
  };

  const handleSyncDownload = async () => {
    if (!isConnected) {
      setShowConfigModal(true);
      setLogs(["⚠️ Supabase não configurado. Por favor, insira a URL e Chave ANON no painel para ativar o download."]);
      return;
    }

    setIsSyncingDownload(true);
    setLogs([]);
    addLog("=== INICIANDO SINCRONIZAÇÃO: SUPABASE -> LOCAL ===");

    try {
      const result = await syncSupabaseToLocal((msg) => addLog(msg));
      if (result.success) {
        addLog(`🎉 Sucesso! Total de ${result.pulledCount} registros baixados para o cache local.`);
      } else {
        addLog(`⚠️ Concluído com avisos: ${result.errors.length} erro(s).`);
      }
    } catch (err: any) {
      addLog(`❌ Erro fatal durante o download: ${err.message}`);
    } finally {
      setIsSyncingDownload(false);
      await loadStats();
    }
  };

  const handleSyncBiDirectional = async () => {
    if (!isConnected) {
      setShowConfigModal(true);
      setLogs(["⚠️ Supabase não configurado. Por favor, insira a URL e Chave ANON no painel para ativar a sincronização."]);
      return;
    }
    setIsSyncingBiDirectional(true);
    setLogs([]);
    addLog("=== INICIANDO SINCRONIZAÇÃO BIDIRECIONAL COMPLETA (UNIFICAÇÃO DE DADOS) ===");

    try {
      const result = await syncBiDirectional((msg) => addLog(msg));
      if (result.success) {
        addLog(`🎉 Sucesso! Unificação concluída. Total de ${result.totalCount} registros sincronizados sem divergências.`);
      } else {
        addLog(`⚠️ Concluído com avisos: ${result.errors.length} erro(s).`);
      }
    } catch (err: any) {
      addLog(`❌ Erro fatal durante a unificação: ${err.message}`);
    } finally {
      setIsSyncingBiDirectional(false);
      await loadStats();
    }
  };

  const handleSyncSingleTable = async (key: string, label: string) => {
    if (!isConnected) {
      setShowConfigModal(true);
      setLogs(["⚠️ Supabase não configurado. Por favor, insira a URL e Chave ANON no painel para ativar a sincronização."]);
      return;
    }
    setSyncingTableKey(key);
    addLog(`=== SINCRONIZANDO INDIVIDUALMENTE: ${label.toUpperCase()} ===`);
    try {
      const res = await syncSingleTable(key, (msg) => addLog(msg));
      if (res.success) {
        addLog(`🎉 Tabela '${label}' sincronizada! Local (${res.localCount}) e Supabase (${res.remoteCount}) alinhados.`);
      } else {
        addLog(`⚠️ Aviso em '${label}': ${res.message}`);
      }
    } catch (err: any) {
      addLog(`❌ Erro ao sincronizar '${label}': ${err.message}`);
    } finally {
      setSyncingTableKey(null);
      await loadStats();
    }
  };

  const handleDeduplicateResponsaveisAction = async () => {
    setIsDeduplicatingResp(true);
    addLog("🧹 Iniciando varredura e unificação inteligente de responsáveis duplicados...");
    try {
      const result = await deduplicateResponsaveis((msg) => addLog(msg));
      if (result.removedCount > 0) {
        addLog(`✅ Unificação concluída com sucesso! ${result.removedCount} registros duplicados foram unificados. ${result.reassignedCnhsCount} CNHs foram realinhadas.`);
      } else {
        addLog("✨ Nenhum responsável duplicado foi encontrado. A base já está 100% normalizada.");
      }
      await loadStats();
    } catch (err: any) {
      addLog(`❌ Erro durante unificação de responsáveis: ${err.message}`);
    } finally {
      setIsDeduplicatingResp(false);
    }
  };

  const handleRestoreLinksAction = async () => {
    if (!isConnected) {
      setShowConfigModal(true);
      setLogs(["⚠️ Supabase não configurado. Insira as credenciais para rodar a auditoria relacional completa."]);
      return;
    }
    setIsRestoringLinks(true);
    setLogs([]);
    addLog("=== INICIANDO AUDITORIA & RECUPERAÇÃO DE VÍNCULOS RELACIONAIS ===");
    try {
      const result = await restaurarVinculosRelacionais((msg) => addLog(msg));
      setLinksResult(result);
      if (result.totalRepaired > 0) {
        addLog(`🎉 Sucesso! Total de ${result.totalRepaired} vínculos reestabelecidos:`);
        addLog(`  • ${result.restoredCandMemoCount} candidatos revinculados aos seus memorandos.`);
        addLog(`  • ${result.restoredCnhCandCount} CNHs revinculadas aos seus candidatos.`);
        addLog(`  • ${result.restoredCnhMemoCount} CNHs revinculadas aos seus memorandos.`);
      } else {
        addLog("✨ Integridade verificada: todos os candidatos e CNHs já possuem chaves e vínculos íntegros.");
      }
      await loadStats();
    } catch (err: any) {
      addLog(`❌ Erro fatal durante a restauração de vínculos: ${err.message}`);
    } finally {
      setIsRestoringLinks(false);
    }
  };

  const handleCopyAnalyzeSql = () => {
    const sql = `-- =========================================================================
-- ATUALIZAÇÃO DAS ESTATÍSTICAS DO POSTGRESQL (CORRIGIR "0 ROWS ESTIMATED")
-- =========================================================================
-- O Table Editor do Supabase exibe a contagem estimada baseada em pg_class.reltuples.
-- Após inserções em lote via API, execute estes comandos no SQL Editor do Supabase:

ANALYZE public.usuarios;
ANALYZE public.responsaveis;
ANALYZE public.mapeamento_localizacao;
ANALYZE public.memorandos;
ANALYZE public.candidatos;
ANALYZE public.geral_cnhs;
ANALYZE public.lotes;
ANALYZE public.declaracoes;
ANALYZE public.historico_movimentacoes;
ANALYZE public.auditoria;
ANALYZE public.acessos_cidadao;
ANALYZE public.orgao_config;
ANALYZE public.imagens_sync;
`;
    navigator.clipboard.writeText(sql);
    setCopiedAnalyzeSql(true);
    setTimeout(() => setCopiedAnalyzeSql(false), 3000);
  };

  const handleCopyLotesBigIntSql = () => {
    const sql = `-- =========================================================================
-- CORREÇÃO DA TABELA DE LOTES: SUPORTE A NÚMEROS LONGOS / IMPORTADOS (BIGINT)
-- =========================================================================
-- Corrige o erro "value '...' is out of range for type integer" no Supabase:

ALTER TABLE IF EXISTS public.lotes ALTER COLUMN numero TYPE BIGINT;
ALTER TABLE IF EXISTS public.lotes ADD COLUMN IF NOT EXISTS pdf_tamanho BIGINT;
ANALYZE public.lotes;
`;
    navigator.clipboard.writeText(sql);
    setCopiedLotesSql(true);
    setTimeout(() => setCopiedLotesSql(false), 3000);
  };

  const handleExportJSON = () => {
    try {
      const jsonStr = exportDatabaseJSON();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      link.href = url;
      link.download = `backup_detran_protocolo_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Erro ao exportar JSON: " + err.message);
    }
  };

  const handleExportExcel = () => {
    try {
      exportDatabaseExcel();
    } catch (err: any) {
      alert("Erro ao exportar arquivo Excel: " + err.message);
    }
  };

  const handleExportTableExcel = (tableName: string, label: string) => {
    try {
      exportTableExcel(tableName, label);
    } catch (err: any) {
      alert(`Erro ao exportar tabela ${label}: ${err.message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const res = importDatabaseJSON(content);
        setImportResult({
          success: res.success,
          message: res.message
        });
        if (res.success) {
          loadStats();
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSpreadsheetFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedSpreadsheetFile(file);
    setSpreadsheetModalOpen(true);
    if (spreadsheetFileInputRef.current) spreadsheetFileInputRef.current.value = "";
  };

  const handleConfirmSpreadsheetImport = async () => {
    if (!selectedSpreadsheetFile) return;
    setIsImportingSpreadsheet(true);
    try {
      const buffer = await selectedSpreadsheetFile.arrayBuffer();
      const res = await importSpreadsheetData(buffer, {
        syncToSupabase: syncSpreadsheetToSupabase && isConnected,
        mode: importMode,
        usuarioId: user?.id,
        usuarioNome: user?.nome_curto || user?.nome
      });

      setImportResult({
        success: res.success,
        message: res.message + (res.supabaseSyncedCount ? ` (${res.supabaseSyncedCount} salvos no Supabase)` : "") + (res.supabaseError ? ` [Aviso: ${res.supabaseError}]` : "")
      });

      if (res.success) {
        await loadStats();
        setSpreadsheetModalOpen(false);
        setSelectedSpreadsheetFile(null);
      }
    } catch (err: any) {
      setImportResult({
        success: false,
        message: "Erro ao importar planilha: " + err.message
      });
    } finally {
      setIsImportingSpreadsheet(false);
    }
  };

  const handleCopySqlRealtime = () => {
    const sqlScript = `-- SCRIPT DE REPLICA IDENTITY E REALTIME (SUPABASE)
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY['usuarios', 'responsaveis', 'mapeamento_localizacao', 'memorandos', 'candidatos', 'geral_cnhs', 'historico_movimentacoes', 'auditoria', 'declaracoes', 'lotes'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tabelas LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL;', t);
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;`;

    navigator.clipboard.writeText(sqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleResetDemo = () => {
    resetDemoData();
    setShowResetModal(false);
    loadStats();
    alert("Dados demonstrativos locais restaurados com sucesso!");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Backup e Sincronização Supabase
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                isConnected 
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800" 
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
                {isConnected ? "Supabase Conectado" : "Modo Armazenamento Local"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Gerencie cópias de segurança JSON/SQL locais e sincronize tabelas com o banco de dados em nuvem em tempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            disabled={isLoadingStats}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingStats ? "animate-spin" : ""}`} />
            <span>Atualizar Totais</span>
          </button>
        </div>
      </div>

      {/* Cartão de Monitoramento de Egress e Otimização */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-blue-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              Economia de Egress Ativa
            </span>
            <span className="text-xs text-blue-200">Supabase Free Tier (5 GB/mês)</span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Painel de Monitoramento & Otimização de Tráfego
          </h2>
          <p className="text-xs text-blue-200/90 max-w-2xl leading-relaxed">
            O sistema agora utiliza sincronização delta inteligente, cache TTL em memória e persistência IndexedDB com Dexie. Acompanhe o consumo de banda em tempo real e o volume de dados economizado.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.setItem("detran_active_tab", "monitoramento");
                window.location.reload();
              }
            }}
            className="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Activity className="w-4 h-4" />
            <span>Abrir Painel de Telemetria</span>
          </button>
        </div>
      </div>

      {/* Cartão 1: Estado da Conexão Supabase */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Painel de Diagnóstico do Supabase (PostgreSQL)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <Database className="w-3.5 h-3.5 text-blue-500" />
              <span>Configurar Credenciais</span>
            </button>
            <button
              onClick={handleTestConnection}
              disabled={pingStatus.status === 'testing'}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer border border-blue-200 dark:border-blue-800"
            >
              <Activity className={`w-3.5 h-3.5 ${pingStatus.status === 'testing' ? 'animate-pulse' : ''}`} />
              <span>{pingStatus.status === 'testing' ? "Testando Ping..." : "Testar Conexão"}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase text-slate-400">URL do Projeto Supabase</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {creds.source === 'local' ? 'Salvo no Navegador' : creds.source === 'env' ? 'Variável .env' : 'Não configurado'}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-800 dark:text-slate-200 mt-1 truncate" title={supabaseUrl}>
              {supabaseUrl}
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase text-slate-400">Estado de Sincronização em Tempo Real</p>
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Realtime Broadcast Ativo</span>
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase text-slate-400">Latência do Banco de Dados</p>
            <p className="text-xs font-bold text-slate-900 dark:text-white mt-1">
              {pingStatus.latency !== undefined ? `${pingStatus.latency} ms` : "Não testado"}
            </p>
          </div>
        </div>

        {pingStatus.status === 'success' && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{pingStatus.message}</span>
          </div>
        )}

        {pingStatus.status === 'error' && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{pingStatus.message}</span>
          </div>
        )}
      </div>

      {/* Cartão 2: Sincronização em Massa e Unificação Bidirecional */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Unificação Bidirecional */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl border border-indigo-700/50 p-6 shadow-md flex flex-col justify-between space-y-4 md:col-span-3 lg:col-span-1">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Sincronização Bidirecional
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Recomendado
              </span>
            </div>
            <p className="text-xs text-indigo-200/90 leading-relaxed">
              Envia todos os registros locais para o Supabase em lotes e, em seguida, baixa a base remota completa unificada (sem o limite de 1000 registros). Resolve divergências e deixa ambos 100% iguais.
            </p>
          </div>

          <button
            onClick={handleSyncBiDirectional}
            disabled={isSyncingBiDirectional || isSyncingUpload || isSyncingDownload}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-900/50 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingBiDirectional ? "animate-spin" : ""}`} />
            <span>{isSyncingBiDirectional ? "Unificando Dados em Lote..." : "🔄 Unificar Bancos (Bidirecional)"}</span>
          </button>
        </div>

        {/* Upload Local -> Supabase */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <UploadCloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Enviar Local → Supabase
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sincronize todos os registros mantidos no armazenamento local com as tabelas do Supabase via operação <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">UPSERT</code> em lotes de 250 itens.
            </p>
          </div>

          <button
            onClick={handleSyncUpload}
            disabled={isSyncingUpload || isSyncingBiDirectional}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <UploadCloud className={`w-4 h-4 ${isSyncingUpload ? "animate-bounce" : ""}`} />
            <span>{isSyncingUpload ? "Sincronizando em Lotes..." : "Iniciar Upload (Local → Supabase)"}</span>
          </button>
        </div>

        {/* Download Supabase -> Local */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <DownloadCloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Baixar Supabase → Local
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Baixa a totalidade das tabelas remotas com paginação contínua (além do limite de 1.000 linhas do PostgREST) para atualizar o cache local.
            </p>
          </div>

          <button
            onClick={handleSyncDownload}
            disabled={isSyncingDownload || isSyncingBiDirectional}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <DownloadCloud className={`w-4 h-4 ${isSyncingDownload ? "animate-bounce" : ""}`} />
            <span>{isSyncingDownload ? "Baixando Registros do Banco..." : "Iniciar Download (Supabase → Local)"}</span>
          </button>
        </div>
      </div>

      {/* Terminal de Logs da Sincronização */}
      {logs.length > 0 && (
        <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 shadow-md space-y-2 font-mono text-xs text-slate-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="flex items-center gap-2 font-bold text-blue-400">
              <Terminal className="w-4 h-4" />
              Console de Execução da Sincronização
            </span>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-500 hover:text-slate-300 underline"
            >
              Limpar Console
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
            {logs.map((log, i) => (
              <div key={i} className="leading-relaxed">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Banner de alerta caso existam tabelas não criadas ou com erro */}
      {stats.some((s) => s.status === "error") && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Atenção: Uma ou mais tabelas apresentaram erro de conexão ou não existem no Supabase
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                Para corrigir, copie o Script SQL de instalação completo, cole no <strong>SQL Editor</strong> do seu painel Supabase e clique em <strong>Run</strong>. Depois clique em <strong>"Iniciar Upload (Local → Supabase)"</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={handleCopyFullSchemaSql}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
          >
            {copiedFullSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedFullSql ? "Script Copiado!" : "Copiar Script SQL Completo"}</span>
          </button>
        </div>
      )}

      {/* Cartões de Diagnóstico & Recuperação de Integridade Relacional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Restauração de Vínculos e Chaves Estrangeiras */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-900/60 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Recuperação de Vínculos Relacionais
                  </h3>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                    Memorandos ⇄ Candidatos ⇄ Protocolo Geral de CNHs
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Auditoria Ativa
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Faz uma varredura cruzando CPFs, remessas e números de memorando para <strong>reestabelecer chaves estrangeiras que foram desvinculadas</strong> e atualiza tanto o banco local quanto o Supabase.
            </p>
            {linksResult && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Auditoria Concluída: {linksResult.totalRepaired} vínculos restaurados!</span>
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300/90">
                  • {linksResult.restoredCandMemoCount} candidatos revinculados a memorandos.
                  <br />
                  • {linksResult.restoredCnhCandCount} CNHs revinculadas aos seus candidatos.
                  <br />
                  • {linksResult.restoredCnhMemoCount} CNHs revinculadas aos seus memorandos.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleRestoreLinksAction}
            disabled={isRestoringLinks || !isConnected}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRestoringLinks ? "animate-spin" : ""}`} />
            <span>{isRestoringLinks ? "Restaurando e Reconciliando Vínculos..." : "🛠️ Restaurar Todos os Vínculos e Chaves"}</span>
          </button>
        </div>

        {/* Card 2: Esclarecimento de Estatísticas do PostgreSQL (ROWS ESTIMATED: 0) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold shrink-0">
                <Database className="w-4 h-4 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Painel Supabase: "ROWS (ESTIMATED): 0"
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                  Estatísticas do PostgreSQL (pg_class.reltuples)
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              O Table Editor do Supabase exibe uma estimativa em cache e <strong>não roda contagem em tempo real</strong> para economizar CPU. Seus <strong>11.463+ registros continuam salvos e íntegros</strong> na nuvem. Para forçar o painel do Supabase a refletir a contagem real imediatamente, rode os comandos <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[11px]">ANALYZE</code> no SQL Editor.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAnalyzeSql}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {copiedAnalyzeSql ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-blue-500" />}
              <span>{copiedAnalyzeSql ? "SQL ANALYZE Copiado!" : "Copiar Comandos ANALYZE para o SQL Editor"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Totais e Status por Entidade */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        {/* Painel de Sincronização Automática Integrada */}
        <div className="p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 dark:from-slate-800/80 dark:via-blue-950/40 dark:to-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Sincronização Automática Multi-Máquinas Ativa
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {autoSyncState.status === "syncing" ? "Sincronizando..." : "Tempo Real (WebSocket + Delta Sync)"}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Ao inserir ou alterar dados em qualquer computador ou aba, a atualização é refletida automaticamente em todas as máquinas abertas.
              {autoSyncState.lastSyncTime && (
                <span className="ml-1 text-slate-500 dark:text-slate-400">
                  (Última sincronização do ciclo: {autoSyncState.lastSyncTime.toLocaleTimeString()})
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleReconcileAllTables}
              disabled={isAutoReconciling || autoSyncState.status === "syncing" || !isConnected}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              title="Executa a verificação e alinhamento automático de todas as tabelas pendentes sem precisar forçar uma a uma"
            >
              <RefreshCw className={`w-4 h-4 ${isAutoReconciling || autoSyncState.status === "syncing" ? "animate-spin" : ""}`} />
              <span>
                {isAutoReconciling || autoSyncState.status === "syncing"
                  ? "Sincronizando Todas as Tabelas..."
                  : "Sincronizar Todas as Tabelas Automaticamente"}
              </span>
            </button>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Contagem e Status por Tabela
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Comparativo Armazenamento Local vs Banco de Dados Supabase (Atualização Contínua)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Entidade / Descrição</th>
                <th className="py-3 px-4">Tabela Supabase</th>
                <th className="py-3 px-4 text-center">Registros Locais</th>
                <th className="py-3 px-4 text-center">Registros no Supabase</th>
                <th className="py-3 px-4 text-center">Status de Sincronia</th>
                <th className="py-3 px-4 text-right">Ação Excel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {stats.map((item) => {
                const isSynced = item.status === "synced";
                const isPending = item.status === "pending";
                const isError = item.status === "error";

                return (
                  <tr key={item.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      <div>{item.label}</div>
                      {item.lastError && (
                        <div className="text-[10px] font-normal text-rose-600 dark:text-rose-400 mt-0.5 font-sans">
                          ⚠️ {item.lastError}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                      {item.tableName}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-blue-600 dark:text-blue-400">
                      {item.localCount}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                      {item.supabaseCount !== null ? item.supabaseCount : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isSynced && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Sincronizado
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          <AlertTriangle className="w-3 h-3" /> Diferença
                        </span>
                      )}
                      {isError && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title={item.lastError}>
                          <XCircle className="w-3 h-3" /> Erro de Tabela
                        </span>
                      )}
                      {item.status === "not_configured" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSyncSingleTable(item.key, item.label)}
                          disabled={syncingTableKey === item.key || !isConnected}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1 border cursor-pointer ${
                            isPending || isError
                              ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-xs"
                              : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          } disabled:opacity-50`}
                          title={`Sincronizar exclusivamente a tabela ${item.label}`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingTableKey === item.key ? "animate-spin" : ""}`} />
                          <span>{syncingTableKey === item.key ? "Sincronizando..." : "Sincronizar"}</span>
                        </button>
                        {item.key === "responsaveis" && (
                          <button
                            onClick={handleDeduplicateResponsaveisAction}
                            disabled={isDeduplicatingResp}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1 border border-amber-200 dark:border-amber-800 cursor-pointer disabled:opacity-50"
                            title="Unificar duplicatas de responsáveis e realinhar CNHs entregues"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 ${isDeduplicatingResp ? "animate-spin" : ""}`} />
                            <span>{isDeduplicatingResp ? "Unificando..." : "Unificar"}</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleExportTableExcel(item.key, item.label)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                          title={`Baixar ${item.label} em Excel`}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Excel</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cartão: Integração com Google Drive (Backups Diários em CSV, Excel e JSON) */}
      <GoogleDriveBackupCard />

      {/* Cartão 3: Ferramentas de Backup Físico (Excel, JSON e SQL) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Exportar e Importar Backups
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Baixe todos os seus dados estruturados em uma planilha Excel (<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">.xlsx</code>) com abas por entidade ou exporte/restaure backups no formato JSON.
          </p>

          {importResult && (
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              importResult.success 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800" 
                : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
            }`}>
              {importResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{importResult.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={handleExportExcel}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel (.xlsx)</span>
            </button>

            <input
              type="file"
              ref={spreadsheetFileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleSpreadsheetFileChange}
              className="hidden"
            />

            <button
              onClick={() => spreadsheetFileInputRef.current?.click()}
              className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Importar CSV / Excel</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <DownloadCloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Exportar JSON</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-800 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Restaurar JSON</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <Code2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Utilitários SQL & Reset do Sistema
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Copie os scripts SQL para configurar a replicação em tempo real no Supabase ou redefina o banco local para as configurações iniciais do DETRAN.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <button
              onClick={handleCopyFullSchemaSql}
              className="flex-1 min-w-[200px] py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-800 cursor-pointer"
            >
              {copiedFullSql ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copiedFullSql ? "Script Completo Copiado!" : "Copiar Script SQL Completo"}</span>
            </button>

            <button
              onClick={handleCopyImagesAndStorageSql}
              className="py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
            >
              {copiedImagesSql ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copiedImagesSql ? "SQL Imagens Copiado!" : "SQL Imagens & Storage"}</span>
            </button>

            <button
              onClick={handleCopySqlRealtime}
              className="py-2.5 px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-purple-200 dark:border-purple-800 cursor-pointer"
            >
              {copiedSql ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copiedSql ? "SQL Copiado!" : "SQL Realtime"}</span>
            </button>

            <button
              onClick={handleCopyLotesBigIntSql}
              className="py-2.5 px-3 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-800 cursor-pointer"
              title="Executar no Supabase para corrigir 'out of range for type integer' em lotes longos"
            >
              {copiedLotesSql ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLotesSql ? "SQL Lotes Copiado!" : "Corrigir Lotes (BIGINT)"}</span>
            </button>

            <button
              onClick={() => setShowResetModal(true)}
              className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-rose-200 dark:border-rose-800 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Local</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação para Reset de Dados */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Restaurar Dados Demonstrativos?
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta ação redefinirá todos os registros armazenados no seu navegador para a semente inicial do sistema DETRAN (Usuários padrão, CNHs iniciais, Memorandos e Mapeamento A-Z). Os dados não salvos no Supabase serão sobrescritos.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetDemo}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-500/20 transition-all cursor-pointer"
              >
                Sim, Restaurar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuração de Credenciais do Supabase */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0 font-bold">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Configurar Credenciais do Supabase
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Insira as chaves do seu projeto PostgreSQL/Supabase
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  URL do Projeto Supabase (<code className="font-mono text-blue-600">VITE_SUPABASE_URL</code>)
                </label>
                <input
                  type="url"
                  placeholder="https://sua-id-projeto.supabase.co"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Obtenha em: <em>Project Settings → API → Project URL</em>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chave Anon Pública (<code className="font-mono text-blue-600">VITE_SUPABASE_ANON_KEY</code>)
                </label>
                <textarea
                  rows={3}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Obtenha em: <em>Project Settings → API → Project API keys → anon (public)</em>
                </p>
              </div>

              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                💡 <strong>Dica:</strong> As credenciais salvas aqui são armazenadas com segurança no navegador local e permitem testar conexões e sincronizações em tempo real. Se preferir, configure no arquivo <code className="font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">.env</code>.
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                {creds.source === 'local' ? (
                  <button
                    type="button"
                    onClick={handleClearCredentials}
                    className="px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Remover Salvos
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    Salvar e Conectar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Importação de Planilha CSV / XLSX */}
      <Modal
        isOpen={spreadsheetModalOpen}
        onClose={() => setSpreadsheetModalOpen(false)}
        title="📥 Importar Planilha de CNHs (CSV ou Excel)"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200">
            <div className="font-bold flex items-center gap-2 mb-1">
              <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Arquivo Selecionado: <strong>{selectedSpreadsheetFile?.name}</strong></span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Tamanho: {(selectedSpreadsheetFile?.size ? selectedSpreadsheetFile.size / 1024 : 0).toFixed(1)} KB
            </p>
          </div>

          <div className="space-y-2">
            <label className="font-bold text-slate-800 dark:text-slate-200 block">
              Modo de Inserção de Dados
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                importMode === "merge" 
                  ? "bg-blue-50/70 border-blue-500 dark:bg-blue-950/60 ring-1 ring-blue-500" 
                  : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}>
                <input
                  type="radio"
                  name="syncImportMode"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Mesclar e Atualizar</div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Atualiza os registros existentes por CPF/Ordem e adiciona os novos mantendo os atuais.
                  </p>
                </div>
              </label>

              <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                importMode === "replace" 
                  ? "bg-rose-50/70 border-rose-500 dark:bg-rose-950/60 ring-1 ring-rose-500" 
                  : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}>
                <input
                  type="radio"
                  name="syncImportMode"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Substituir Tabela Local</div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Substitui totalmente todos os registros da tabela local de CNHs pelos dados desta planilha.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <label className="flex items-center gap-2 font-bold text-slate-900 dark:text-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncSpreadsheetToSupabase}
                onChange={(e) => setSyncSpreadsheetToSupabase(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Sincronizar dados automaticamente com o Supabase</span>
            </label>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 pl-6">
              {isConnected 
                ? "Conexão com o Supabase ativa. Os dados serão enviados via upsert para a tabela 'geral_cnhs'."
                : "Aviso: Conexão com Supabase não configurada. Apenas a tabela local será atualizada."}
            </p>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
            💡 <strong>Reconhecimento Inteligente:</strong> O sistema mapeia dinamicamente colunas como <em>Ordem, Nome/Candidato, CPF, Gaveta, Repartição, Situação, Responsável, Memorando e Observações</em>.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSpreadsheetModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmSpreadsheetImport}
              disabled={isImportingSpreadsheet}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              {isImportingSpreadsheet ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{isImportingSpreadsheet ? "Processando..." : "Iniciar Importação"}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
