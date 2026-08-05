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
  resetDemoData,
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

export const BackupSyncPage: React.FC = () => {
  const [stats, setStats] = useState<SyncStatusItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [isSyncingUpload, setIsSyncingUpload] = useState<boolean>(false);
  const [isSyncingDownload, setIsSyncingDownload] = useState<boolean>(false);
  const [isSyncingBiDirectional, setIsSyncingBiDirectional] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [copiedFullSql, setCopiedFullSql] = useState<boolean>(false);
  const [pingStatus, setPingStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string; latency?: number }>({ status: 'idle' });

  const handleCopyFullSchemaSql = () => {
    const sql = `-- ============================================================================
-- SCRIPT DE CRIAÇÃO E INSTALAÇÃO COMPLETA DAS TABELAS NO SUPABASE
-- Sistema de Controle de Fluxo de CNHs - DETRAN/PA
-- ============================================================================

-- REMOÇÃO DE TABELAS ANTIGAS PARA PREVENIR CONFLITOS DE TIPOS DE CHAVES
DROP TABLE IF EXISTS auditoria CASCADE;
DROP TABLE IF EXISTS historico_movimentacoes CASCADE;
DROP TABLE IF EXISTS geral_cnhs CASCADE;
DROP TABLE IF EXISTS candidatos CASCADE;
DROP TABLE IF EXISTS memorandos CASCADE;
DROP TABLE IF EXISTS mapeamento_localizacao CASCADE;
DROP TABLE IF EXISTS responsaveis CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- CRIAÇÃO DAS TABELAS
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  nome_completo TEXT,
  nome_curto TEXT NOT NULL,
  cpf TEXT,
  fone TEXT,
  email TEXT UNIQUE NOT NULL,
  funcao TEXT,
  setor TEXT DEFAULT 'Protocolo',
  login TEXT UNIQUE NOT NULL,
  senha TEXT DEFAULT 'detran@123',
  permissoes JSONB DEFAULT '["memorandos:criar", "memorandos:remeter", "cnh:receber", "cnh:entregar", "cnh:editar", "mapeamento:gerenciar", "responsaveis:gerenciar", "usuarios:gerenciar", "auditoria:visualizar"]'::jsonb,
  perfil TEXT NOT NULL CHECK (perfil IN ('Administrador', 'Supervisor', 'Operador', 'Consulta')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE responsaveis (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  telefone TEXT,
  registro TEXT,
  observacao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE mapeamento_localizacao (
  id TEXT PRIMARY KEY,
  inicial TEXT UNIQUE NOT NULL,
  gaveta TEXT NOT NULL,
  reparticao TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true
);

CREATE TABLE memorandos (
  id TEXT PRIMARY KEY,
  numero TEXT UNIQUE NOT NULL,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  remessa TEXT,
  status TEXT NOT NULL DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração', 'Remetido')),
  candidatos_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE candidatos (
  id TEXT PRIMARY KEY,
  memorando_id TEXT REFERENCES memorandos(id) ON DELETE CASCADE,
  numero TEXT,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  telefone TEXT,
  remessa TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE geral_cnhs (
  id TEXT PRIMARY KEY,
  ordem INTEGER NOT NULL,
  memorando_id TEXT REFERENCES memorandos(id) ON DELETE SET NULL,
  candidato_id TEXT REFERENCES candidatos(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  gaveta TEXT,
  reparticao TEXT,
  situacao TEXT NOT NULL DEFAULT 'Recebida' CHECK (situacao IN ('Remetida', 'Recebida', 'Pendente', 'Entregue')),
  responsavel_id TEXT REFERENCES responsaveis(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  data_movimento TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  memorando_numero TEXT,
  remessa TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE historico_movimentacoes (
  id TEXT PRIMARY KEY,
  geral_id TEXT REFERENCES geral_cnhs(id) ON DELETE CASCADE,
  geral_ordem INTEGER,
  geral_nome TEXT,
  situacao_anterior TEXT,
  situacao_nova TEXT NOT NULL CHECK (situacao_nova IN ('Remetida', 'Recebida', 'Pendente', 'Entregue')),
  responsavel_id TEXT REFERENCES responsaveis(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  observacao TEXT,
  data_hora TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE auditoria (
  id TEXT PRIMARY KEY,
  tabela TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  data_hora TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  ip TEXT,
  valores_anteriores JSONB,
  valores_novos JSONB
);

-- HABILITAR RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapeamento_localizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE memorandos ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE geral_cnhs ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS DE PERMISSÃO
DROP POLICY IF EXISTS "Permitir acesso total em usuarios" ON usuarios;
CREATE POLICY "Permitir acesso total em usuarios" ON usuarios FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em responsaveis" ON responsaveis;
CREATE POLICY "Permitir acesso total em responsaveis" ON responsaveis FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em mapeamento_localizacao" ON mapeamento_localizacao;
CREATE POLICY "Permitir acesso total em mapeamento_localizacao" ON mapeamento_localizacao FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em memorandos" ON memorandos;
CREATE POLICY "Permitir acesso total em memorandos" ON memorandos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em candidatos" ON candidatos;
CREATE POLICY "Permitir acesso total em candidatos" ON candidatos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em geral_cnhs" ON geral_cnhs;
CREATE POLICY "Permitir acesso total em geral_cnhs" ON geral_cnhs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em historico_movimentacoes" ON historico_movimentacoes;
CREATE POLICY "Permitir acesso total em historico_movimentacoes" ON historico_movimentacoes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total em auditoria" ON auditoria;
CREATE POLICY "Permitir acesso total em auditoria" ON auditoria FOR ALL USING (true) WITH CHECK (true);

-- HABILITAR REALTIME
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY['usuarios', 'responsaveis', 'mapeamento_localizacao', 'memorandos', 'candidatos', 'geral_cnhs', 'historico_movimentacoes', 'auditoria'];
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
END $$;
`;

    navigator.clipboard.writeText(sql);
    setCopiedFullSql(true);
    setTimeout(() => setCopiedFullSql(false), 3000);
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

  const isConnected = isSupabaseConfigured();
  const supabaseUrl = creds.url;

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

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
    if (confirm("Deseja remover as credenciais do Supabase salvas localmente?")) {
      clearLocalSupabaseConfig();
      setInputUrl("");
      setInputKey("");
      loadStats();
      alert("Credenciais locais removidas.");
    }
  };

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const items = await checkSyncStatus();
      setStats(items);
    } catch (err) {
      console.error("Erro ao carregar status de sincronia:", err);
    } finally {
      setIsLoadingStats(false);
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
      alert("Conexão Supabase não configurada.");
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
      alert("Conexão Supabase não configurada.");
      return;
    }
    if (!confirm("Atenção: Baixar dados do Supabase atualizará seu armazenamento local com os dados do banco de dados remoto. Deseja continuar?")) {
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
      alert("Conexão Supabase não configurada.");
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
  tabelas text[] := ARRAY['usuarios', 'responsaveis', 'mapeamento_localizacao', 'memorandos', 'candidatos', 'geral_cnhs', 'historico_movimentacoes', 'auditoria'];
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
            disabled={isSyncingBiDirectional || isSyncingUpload || isSyncingDownload || !isConnected}
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
            disabled={isSyncingUpload || isSyncingBiDirectional || !isConnected}
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
            disabled={isSyncingDownload || isSyncingBiDirectional || !isConnected}
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

      {/* Tabela de Totais e Status por Entidade */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Contagem e Status por Tabela
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Comparativo Armazenamento Local vs Banco de Dados Supabase
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
                      <button
                        onClick={() => handleExportTableExcel(item.key, item.label)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                        title={`Baixar ${item.label} em Excel`}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Excel</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleCopyFullSchemaSql}
              className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-800 cursor-pointer"
            >
              {copiedFullSql ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copiedFullSql ? "Script Completo Copiado!" : "Copiar Script SQL Completo"}</span>
            </button>

            <button
              onClick={handleCopySqlRealtime}
              className="py-2.5 px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-purple-200 dark:border-purple-800 cursor-pointer"
            >
              {copiedSql ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copiedSql ? "SQL Copiado!" : "SQL Realtime"}</span>
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
