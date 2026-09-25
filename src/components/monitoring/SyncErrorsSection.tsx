import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Trash2,
  Download,
  RefreshCw,
  Server,
  HardDrive,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Radio,
  FileCode,
  Copy,
  Check,
  Calendar,
  X,
  Sparkles,
  Info,
  ShieldAlert,
  Database,
  Sliders,
  Zap
} from "lucide-react";
import {
  SyncErrorLog,
  SyncErrorType,
  SyncDirection,
  getSyncErrors,
  clearSyncErrors,
  toggleErrorResolved,
  deleteSyncError,
  subscribeToSyncErrors,
  generateTestSyncError,
  getSyncErrorsSummary
} from "../../services/syncErrorService";
import { formatDateTime } from "../../lib/utils";

interface SyncErrorsSectionProps {
  onOpenDiscrepancyReconcile?: () => void;
}

export const SyncErrorsSection: React.FC<SyncErrorsSectionProps> = ({ onOpenDiscrepancyReconcile }) => {
  const [errors, setErrors] = useState<SyncErrorLog[]>([]);
  const [selectedError, setSelectedError] = useState<SyncErrorLog | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDirection, setFilterDirection] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "unresolved" | "resolved">("all");
  const [dateRangeMode, setDateRangeMode] = useState<"all" | "today" | "7days" | "30days" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Inscreve no serviço reativo de erros
    const unsubscribe = subscribeToSyncErrors((data) => {
      setErrors(data);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const summary = useMemo(() => getSyncErrorsSummary(), [errors]);

  // Filtragem
  const filteredErrors = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    return errors.filter((item) => {
      // 1. Filtro por Tipo de Erro
      if (filterType !== "all" && item.errorType !== filterType) {
        return false;
      }

      // 2. Filtro por Sentido
      if (filterDirection !== "all" && item.direction !== filterDirection) {
        return false;
      }

      // 3. Filtro por Status de Resolução
      if (filterStatus === "unresolved" && item.resolved) return false;
      if (filterStatus === "resolved" && !item.resolved) return false;

      // 4. Filtro por Data
      const itemTime = new Date(item.timestamp).getTime();
      if (dateRangeMode === "today") {
        if (itemTime < todayStart) return false;
      } else if (dateRangeMode === "7days") {
        if (itemTime < sevenDaysAgo) return false;
      } else if (dateRangeMode === "30days") {
        if (itemTime < thirtyDaysAgo) return false;
      } else if (dateRangeMode === "custom") {
        if (customStartDate) {
          const start = new Date(`${customStartDate}T00:00:00`).getTime();
          if (itemTime < start) return false;
        }
        if (customEndDate) {
          const end = new Date(`${customEndDate}T23:59:59.999`).getTime();
          if (itemTime > end) return false;
        }
      }

      // 5. Filtro de Texto
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTable = item.table.toLowerCase().includes(q);
        const matchMsg = item.message.toLowerCase().includes(q);
        const matchDetails = (item.technicalDetails || "").toLowerCase().includes(q);
        const matchAction = (item.actionTaken || "").toLowerCase().includes(q);
        if (!matchTable && !matchMsg && !matchDetails && !matchAction) {
          return false;
        }
      }

      return true;
    });
  }, [errors, filterType, filterDirection, filterStatus, dateRangeMode, customStartDate, customEndDate, searchTerm]);

  const handleCopyDetails = (err: SyncErrorLog) => {
    const payload = JSON.stringify(err, null, 2);
    navigator.clipboard.writeText(payload);
    setCopiedId(err.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleClearHistory = () => {
    if (window.confirm("Deseja realmente limpar todo o histórico de erros de sincronização?")) {
      clearSyncErrors();
      setActionSuccess("Histórico de erros limpo com sucesso!");
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredErrors, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sync_errors_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleGenerateTestError = () => {
    const created = generateTestSyncError();
    setActionSuccess(`Erro de teste gerado (${created.errorType}) para validar os filtros!`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const formatDirectionBadge = (dir: SyncDirection) => {
    switch (dir) {
      case "supabase_to_dexie":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <Server className="w-3 h-3" />
            <ArrowRight className="w-2.5 h-2.5" />
            <HardDrive className="w-3 h-3" />
            Nuvem ➔ Local
          </span>
        );
      case "dexie_to_supabase":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            <HardDrive className="w-3 h-3" />
            <ArrowRight className="w-2.5 h-2.5" />
            <Server className="w-3 h-3" />
            Local ➔ Nuvem
          </span>
        );
      case "realtime":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <Radio className="w-3 h-3 animate-pulse" />
            Realtime CDC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            <HardDrive className="w-3 h-3" />
            Dexie Interno
          </span>
        );
    }
  };

  const formatTypeBadge = (type: SyncErrorType) => {
    switch (type) {
      case "network_offline":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
            <Radio className="w-3 h-3" />
            Rede / Offline
          </span>
        );
      case "timeout":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            Timeout Resposta
          </span>
        );
      case "constraint_violation":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <ShieldAlert className="w-3 h-3" />
            Violação de FK / Unicidade
          </span>
        );
      case "permission_rls":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800">
            <AlertOctagon className="w-3 h-3" />
            Permissão / RLS
          </span>
        );
      case "data_validation":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
            <FileCode className="w-3 h-3" />
            Esquema / Tipagem
          </span>
        );
      case "dexie_io":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
            <HardDrive className="w-3 h-3" />
            I/O Dexie (IndexedDB)
          </span>
        );
      case "conflict":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <RefreshCw className="w-3 h-3" />
            Conflito de Versão
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <AlertTriangle className="w-3 h-3" />
            Outros
          </span>
        );
    }
  };

  const getSolutionGuidance = (err: SyncErrorLog) => {
    switch (err.errorType) {
      case "network_offline":
        return {
          title: "Como mitigar falhas de rede / servidor offline:",
          steps: [
            "O sistema opera com proteção 'Local-First', mantendo todas as consultas, buscas por CPF e relatórios funcionando sem interrupção.",
            "Verifique a conexão de internet e certifique-se de que o domínio do Supabase está acessível.",
            "Quando a rede restabelecer, o sincronismo delta enviará as alterações acumuladas automaticamente."
          ]
        };
      case "timeout":
        return {
          title: "Como mitigar timeouts de sincronização:",
          steps: [
            "A requisição excedeu o tempo máximo de resposta programado (4 a 6 segundos).",
            "Nenhum travamento de tela ocorreu porque a operação foi isolada pelo timeout de segurança.",
            "Utilize a opção 'Delta Sync Otimizado' no topo da página ou reduza a carga de requisições simultâneas."
          ]
        };
      case "constraint_violation":
        return {
          title: "Como resolver violações de chave estrangeira (FK):",
          steps: [
            "O registro referenciou um responsável, usuário ou memorando que ainda não havia sido criado na nuvem.",
            "O Dexie ativou o fallback de segurança, gravando com sucesso a CNH no banco local e tentando auto-provisionamento de responsáveis.",
            "Acesse a aba 'Banco de Dados' e execute o script de alinhamento de integridade ou cadastre o responsável faltante."
          ]
        };
      case "permission_rls":
        return {
          title: "Como resolver erros de permissão RLS:",
          steps: [
            "A política de segurança em nível de linha (RLS) do Supabase bloqueou a gravação do registro.",
            "Verifique se o usuário atual está autenticado ou execute na aba 'Banco de Dados' a permissão permissiva para a tabela afetada."
          ]
        };
      case "data_validation":
        return {
          title: "Como resolver divergências de colunas:",
          steps: [
            "Uma coluna nova (ex: 'pa', 'notificado_whatsapp') pode não existir no banco Supabase remoto.",
            "Abra a aba 'Banco de Dados' e clique em 'Executar Migração / Alinhamento de Tabelas'."
          ]
        };
      case "dexie_io":
        return {
          title: "Como resolver lentidão ou erros no IndexedDB:",
          steps: [
            "Verifique se o armazenamento local do navegador possui espaço disponível.",
            "Use o botão 'Otimizar IndexedDB' na aba 'Diagnóstico de RAM' para compactar a base."
          ]
        };
      default:
        return {
          title: "Informações gerais:",
          steps: [
            "O erro foi interceptado e o dado permaneceu íntegro na base local.",
            "Copie os detalhes técnicos para análise ou gere uma nova tentativa de sincronização."
          ]
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumo Estatístico dos Erros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total de Ocorrências</span>
            <div className="p-2 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary.total}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {summary.unresolved} pendentes de análise • {summary.today} hoje
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">Falhas de Conexão / Rede</span>
            <div className="p-2 bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 rounded-lg">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">
              {summary.byType.network_offline}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Servidor offline, DNS ou perda de conectividade
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Timeouts de Resposta</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary.byType.timeout}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Abortados pelo limite de 4s a 6s para proteger a UI
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Integridade / FK / RLS</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {summary.byType.constraint_violation + summary.byType.permission_rls}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              FKs ausentes ou regras de segurança restritivas
            </p>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-medium flex items-center gap-2 shadow-xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Barra de Ações Rápidas e Diagnóstico */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Os erros registrados aqui representam falhas pontuais interceptadas pelas rotinas de resiliência entre o <strong>IndexedDB (Dexie)</strong> e o <strong>Supabase</strong>.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onOpenDiscrepancyReconcile && (
            <button
              onClick={onOpenDiscrepancyReconcile}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Detecta e força a re-sincronização unidirecional dos registros discrepantes pelo updated_at"
            >
              <Sliders className="w-3.5 h-3.5" />
              Re-sincronizar Discrepâncias ('updated_at')
            </button>
          )}

          <button
            onClick={handleGenerateTestError}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Gera um registro de teste para validação dos filtros"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Gerar Erro de Teste
          </button>

          <button
            onClick={handleExportJSON}
            disabled={filteredErrors.length === 0}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            title="Exportar logs filtrados em formato JSON"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            Exportar JSON
          </button>

          <button
            onClick={handleClearHistory}
            disabled={errors.length === 0}
            className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg border border-rose-200 dark:border-rose-900 shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            title="Limpar todos os registros de erro"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar Histórico
          </button>
        </div>
      </div>

      {/* Caixa de Filtros Avançados: Por Data, Tipo, Sentido e Busca */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Filtros de Auditoria & Pesquisa
            </h3>
          </div>
          {(filterType !== "all" || filterDirection !== "all" || filterStatus !== "all" || dateRangeMode !== "all" || searchTerm) && (
            <button
              onClick={() => {
                setFilterType("all");
                setFilterDirection("all");
                setFilterStatus("all");
                setDateRangeMode("all");
                setCustomStartDate("");
                setCustomEndDate("");
                setSearchTerm("");
              }}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <X className="w-3.5 h-3.5" />
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Filtro por Tipo de Erro */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tipo de Erro
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden font-medium cursor-pointer"
            >
              <option value="all">🔍 Todos os Tipos ({errors.length})</option>
              <option value="network_offline">📡 Rede / Offline ({summary.byType.network_offline})</option>
              <option value="timeout">⏱️ Timeout de Resposta ({summary.byType.timeout})</option>
              <option value="constraint_violation">🛡️ Violação FK / Unicidade ({summary.byType.constraint_violation})</option>
              <option value="permission_rls">🔒 Permissão / RLS ({summary.byType.permission_rls})</option>
              <option value="data_validation">📝 Validação / Esquema ({summary.byType.data_validation})</option>
              <option value="dexie_io">💾 I/O Dexie / IndexedDB ({summary.byType.dexie_io})</option>
              <option value="conflict">⚡ Conflito de Versão ({summary.byType.conflict})</option>
              <option value="other">⚠️ Outros Erros ({summary.byType.other})</option>
            </select>
          </div>

          {/* 2. Filtro por Sentido de Sincronização */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Sentido da Sincronização
            </label>
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden font-medium cursor-pointer"
            >
              <option value="all">Todas as Direções</option>
              <option value="supabase_to_dexie">Nuvem ➔ Local (Supabase ➔ Dexie)</option>
              <option value="dexie_to_supabase">Local ➔ Nuvem (Dexie ➔ Supabase)</option>
              <option value="realtime">WebSocket Realtime CDC</option>
              <option value="local_dexie">Operações Locais Dexie</option>
            </select>
          </div>

          {/* 3. Filtro por Período / Data */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Filtro por Período
            </label>
            <div className="flex items-center gap-1">
              <select
                value={dateRangeMode}
                onChange={(e) => setDateRangeMode(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden font-medium cursor-pointer"
              >
                <option value="all">Qualquer Data</option>
                <option value="today">Apenas Hoje ({summary.today})</option>
                <option value="7days">Últimos 7 dias</option>
                <option value="30days">Últimos 30 dias</option>
                <option value="custom">📅 Data Específica / Período...</option>
              </select>
            </div>
          </div>

          {/* 4. Campo de Busca Textual */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Pesquisa Textual
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por tabela, mensagem ou stack..."
                className="w-full pl-8.5 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Linha Opcional para Seleção de Data Customizada */}
        {dateRangeMode === "custom" && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-lg">
            <Calendar className="w-4 h-4 text-blue-600" />
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">De:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Até:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-800 dark:text-slate-200"
              />
            </div>

            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:underline"
              >
                Limpar datas
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabela Detalhada de Erros de Sincronização */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Registros Encontrados
            </h3>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {filteredErrors.length} de {errors.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setFilterStatus("all")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterStatus === "all"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterStatus("unresolved")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterStatus === "unresolved"
                    ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-semibold shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Pendentes
              </button>
              <button
                onClick={() => setFilterStatus("resolved")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterStatus === "resolved"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-semibold shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Resolvidos
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[550px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-4">Data / Hora</th>
                <th className="py-2.5 px-4">Tabela & Sentido</th>
                <th className="py-2.5 px-4">Tipo de Erro</th>
                <th className="py-2.5 px-4">Mensagem & Ação do Sistema</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredErrors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                        Nenhum erro de sincronização encontrado
                      </p>
                      <p className="text-xs text-slate-500">
                        Os filtros selecionados não retornaram divergências ou o banco de dados está operando em sincronismo total.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredErrors.map((err) => (
                  <tr
                    key={err.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                      err.resolved ? "opacity-75 bg-slate-50/40 dark:bg-slate-900/40" : ""
                    }`}
                  >
                    {/* 1. Timestamp */}
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono text-[11px]">
                      <div>{formatDateTime(err.timestamp)}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(err.timestamp).toLocaleDateString("pt-BR")}
                      </div>
                    </td>

                    {/* 2. Tabela & Sentido */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {err.table}
                      </div>
                      <div className="mt-1">
                        {formatDirectionBadge(err.direction)}
                      </div>
                    </td>

                    {/* 3. Tipo de Erro */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatTypeBadge(err.errorType)}
                    </td>

                    {/* 4. Mensagem & Ação */}
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-2" title={err.message}>
                        {err.message}
                      </div>
                      {err.actionTaken && (
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1">
                          <span className="text-blue-500 font-semibold shrink-0">↳ Ação:</span>
                          <span className="truncate" title={err.actionTaken}>{err.actionTaken}</span>
                        </div>
                      )}
                    </td>

                    {/* 5. Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleErrorResolved(err.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                          err.resolved
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-200"
                        }`}
                        title="Clique para alternar entre Pendente e Resolvido"
                      >
                        {err.resolved ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Resolvido
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            Pendente
                          </>
                        )}
                      </button>
                    </td>

                    {/* 6. Ações */}
                    <td className="py-3 px-4 whitespace-nowrap text-right space-x-1.5">
                      <button
                        onClick={() => setSelectedError(err)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-md transition-colors cursor-pointer"
                        title="Ver detalhes técnicos e guia de solução"
                      >
                        Detalhes
                      </button>

                      <button
                        onClick={() => handleCopyDetails(err)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Copiar JSON do erro"
                      >
                        {copiedId === err.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => deleteSyncError(err.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Remover este registro de erro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes Técnicos do Erro */}
      {selectedError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Topo do Modal */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Diagnóstico Técnico do Erro de Sincronização
                </h3>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Metadados Básicos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Tabela</span>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedError.table}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Sentido</span>
                  <div className="mt-0.5">{formatDirectionBadge(selectedError.direction)}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Tipo</span>
                  <div className="mt-0.5">{formatTypeBadge(selectedError.errorType)}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Data / Hora</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300 mt-0.5">
                    {formatDateTime(selectedError.timestamp)}
                  </div>
                </div>
              </div>

              {/* Mensagem Principal */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição Amigável da Ocorrência
                </label>
                <div className="p-3 bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-900 dark:text-rose-200 font-medium">
                  {selectedError.message}
                </div>
              </div>

              {/* Ação de Resiliência Executada */}
              {selectedError.actionTaken && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ação de Contingência Ativada pelo Sistema
                  </label>
                  <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg text-blue-900 dark:text-blue-200">
                    {selectedError.actionTaken}
                  </div>
                </div>
              )}

              {/* Detalhes Técnicos / Payload / Stack */}
              {selectedError.technicalDetails && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300">
                      Detalhes Técnicos / Resposta Bruta do Servidor
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopyDetails(selectedError)}
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copiar Raw
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                    {selectedError.technicalDetails}
                  </pre>
                </div>
              )}

              {/* Guia de Solução Recomendada */}
              {(() => {
                const guide = getSolutionGuidance(selectedError);
                return (
                  <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg space-y-1.5">
                    <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {guide.title}
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                      {guide.steps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => {
                  toggleErrorResolved(selectedError.id);
                  setSelectedError((prev) => prev ? { ...prev, resolved: !prev.resolved } : null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
                  selectedError.resolved
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {selectedError.resolved ? "Reabrir Ocorrência" : "Marcar como Resolvido"}
              </button>

              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
