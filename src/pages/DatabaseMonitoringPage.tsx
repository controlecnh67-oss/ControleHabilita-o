import React, { useState, useEffect } from "react";
import { 
  Activity, 
  Database, 
  ArrowDownCircle, 
  Zap, 
  ShieldCheck, 
  RefreshCw, 
  Trash2, 
  Server, 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Layers, 
  Clock, 
  Cpu, 
  Sparkles,
  BarChart2,
  TrendingDown,
  Info,
  Sliders
} from "lucide-react";
import { 
  getEgressSummary, 
  subscribeToEgressMonitor, 
  resetEgressStats, 
  formatBytes,
  EgressSummary,
  EgressLogEntry,
  TableEgressStat
} from "../services/egressMonitorService";
import { syncGeralWithSupabase, getSyncStats, SyncStats } from "../services/dexieDb";
import { invalidateSupabaseCache } from "../services/db";
import { isSupabaseConfigured } from "../services/supabase";
import { SystemAuditSection } from "../components/monitoring/SystemAuditSection";
import { SyncErrorsSection } from "../components/monitoring/SyncErrorsSection";
import { DiscrepancyReconcileModal } from "../components/monitoring/DiscrepancyReconcileModal";
import { subscribeToSyncErrors, getSyncErrorsSummary } from "../services/syncErrorService";

export const DatabaseMonitoringPage: React.FC = () => {
  const [monitorTab, setMonitorTab] = useState<"audit" | "egress" | "errors">(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("monitoring_active_tab");
      if (saved === "audit" || saved === "egress" || saved === "errors") {
        return saved;
      }
    }
    return "audit";
  });
  const [summary, setSummary] = useState<EgressSummary>(getEgressSummary);
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [errorsCount, setErrorsCount] = useState<number>(() => getSyncErrorsSummary().total);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "network" | "cache">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isDiscrepancyModalOpen, setIsDiscrepancyModalOpen] = useState(false);

  useEffect(() => {
    // Carrega estatísticas iniciais
    setSummary(getEgressSummary());
    getSyncStats().then(setSyncStats).catch(() => {});

    // Inscreve no monitor de telemetria
    const unsubscribe = subscribeToEgressMonitor((updatedSummary) => {
      setSummary({ ...updatedSummary });
    });

    // Inscreve no monitor de erros de sincronização
    const unsubErrors = subscribeToSyncErrors((errs) => {
      setErrorsCount(errs.length);
    });

    // Listener para troca de aba disparada externamente (ex: Navbar)
    const handleSwitchTab = (e: any) => {
      const target = e.detail || sessionStorage.getItem("monitoring_active_tab");
      if (target === "audit" || target === "egress" || target === "errors") {
        setMonitorTab(target);
      }
    };
    window.addEventListener("switch-monitoring-tab", handleSwitchTab);

    return () => {
      unsubscribe();
      unsubErrors();
      window.removeEventListener("switch-monitoring-tab", handleSwitchTab);
    };
  }, []);

  const changeTab = (tab: "audit" | "egress" | "errors") => {
    setMonitorTab(tab);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("monitoring_active_tab", tab);
    }
  };

  const handleManualDeltaSync = async () => {
    setIsSyncing(true);
    setActionSuccess(null);
    try {
      const res = await syncGeralWithSupabase(false);
      setSyncStats(res);
      setActionSuccess("Sincronização Delta inteligente concluída com consumo mínimo de dados!");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error("Erro na sincronização:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForceFullSync = async () => {
    if (!window.confirm("Atenção: A sincronização completa baixará todos os registros do banco na nuvem. Deseja prosseguir?")) {
      return;
    }
    setIsSyncing(true);
    setActionSuccess(null);
    try {
      const res = await syncGeralWithSupabase(true);
      setSyncStats(res);
      setActionSuccess("Sincronização Completa finalizada e IndexedDB atualizado com sucesso!");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error("Erro na sincronização:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearCache = () => {
    invalidateSupabaseCache();
    setActionSuccess("Cache de tabelas relacionais em memória limpo com sucesso!");
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleClearLogs = () => {
    if (window.confirm("Deseja redefinir o histórico de telemetria desta sessão?")) {
      resetEgressStats();
      setSummary(getEgressSummary());
      setActionSuccess("Métricas de telemetria reiniciadas!");
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  // Filtragem de logs
  const filteredLogs = summary.recentLogs.filter((log) => {
    if (filterType === "network" && log.isCacheHit) return false;
    if (filterType === "cache" && !log.isCacheHit) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        log.table.toLowerCase().includes(term) ||
        log.operation.toLowerCase().includes(term) ||
        (log.details && log.details.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const totalOps = summary.totalNetworkRequests + summary.totalCacheHits;
  const tablesList: TableEgressStat[] = (Object.values(summary.tables || {}) as TableEgressStat[]).sort(
    (a, b) => (b.totalBytes || 0) - (a.totalBytes || 0)
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-200/60 dark:border-blue-900/50">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Painel de Monitoramento & Otimização de Recursos
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Economia Ativa
                </span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Acompanhamento em tempo real de consumo de rede (Egress), tráfego economizado e saúde do banco
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsDiscrepancyModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Detecta e re-sincroniza unidirecionalmente registros discrepantes entre o Dexie e o Supabase com base na coluna 'updated_at'"
          >
            <Sliders className="w-3.5 h-3.5" />
            Re-sincronizar Discrepâncias ('updated_at')
          </button>

          <button
            onClick={handleClearCache}
            className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Limpa cache de memória local"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Limpar Cache
          </button>

          <button
            onClick={handleManualDeltaSync}
            disabled={isSyncing}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Delta Sync Otimizado"}
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-medium flex items-center gap-2 shadow-xs transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Abas Superiores de Navegação do Monitoramento */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => changeTab("audit")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            monitorTab === "audit"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Cpu className="w-4 h-4" />
          Diagnóstico de RAM & Auditoria do Sistema
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            monitorTab === "audit" ? "bg-blue-500 text-white" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}>
            Ao Vivo
          </span>
        </button>

        <button
          onClick={() => changeTab("egress")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            monitorTab === "egress"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Activity className="w-4 h-4" />
          Tráfego de Rede & Egress (5 GB)
        </button>

        <button
          onClick={() => changeTab("errors")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            monitorTab === "errors"
              ? "bg-rose-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Erros de Sincronização (Dexie ⇄ Supabase)
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            monitorTab === "errors"
              ? "bg-rose-700 text-white"
              : errorsCount > 0
              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}>
            {errorsCount > 0 ? `${errorsCount} ocorrências` : "0 erros"}
          </span>
        </button>
      </div>

      {/* Conteúdo da Aba Selecionada */}
      {monitorTab === "audit" && <SystemAuditSection />}
      {monitorTab === "errors" && (
        <SyncErrorsSection onOpenDiscrepancyReconcile={() => setIsDiscrepancyModalOpen(true)} />
      )}
      {monitorTab === "egress" && (
        <>
          {/* Cartões Principais de Telemetria */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Tráfego Real Egress */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Consumo Real (Egress)</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg">
              <ArrowDownCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatBytes(summary.totalBytesTransferred)}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Limite Mensal (5 GB):</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {summary.freeTierUsagePercent.toFixed(4)}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(1, summary.freeTierUsagePercent)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 2. Tráfego Economizado */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Economizado (Local-First)</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatBytes(summary.totalBytesSaved)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Evitado através de cache IndexedDB e consultas delta inteligentes
            </p>
          </div>
        </div>

        {/* 3. Taxa de Eficiência de Cache */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Eficiência de Cache</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-lg">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary.cacheEfficiencyPercent.toFixed(1)}%
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{summary.totalCacheHits} locais</span>
              <span>{summary.totalNetworkRequests} na nuvem</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${summary.cacheEfficiencyPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* 4. Estado da Base IndexedDB */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Base Local (IndexedDB)</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {syncStats?.totalRecords || 0}
              <span className="text-xs font-normal text-slate-500 ml-1.5">CNHs</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 truncate">
              {isSupabaseConfigured() ? "⚡ Supabase Online & Realtime" : "⚠️ Modo Offline Local"}
            </p>
          </div>
        </div>
      </div>

      {/* Seção Central: Diagnóstico de Otimizações Ativas + Gráficos por Tabela */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Diagnóstico e Otimizações Ativas */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Técnicas de Otimização Ativas
            </h2>
            <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900">
              Ativo
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Sincronização Delta Incremental
              </div>
              <p className="text-slate-500 dark:text-slate-400 pl-5.5 text-[11px]">
                Substituiu downloads cegos de registros por consultas cirúrgicas via <code className="text-blue-600 dark:text-blue-400 font-mono">updated_at &gt; timestamp</code>.
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Cache TTL em Memória (Tabelas Relacionais)
              </div>
              <p className="text-slate-500 dark:text-slate-400 pl-5.5 text-[11px]">
                Consultas a usuários, responsáveis e mapeamentos são servidas da memória (TTL 3m) com 0 bytes de Egress.
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Throttling e Coalesce de Requisições
              </div>
              <p className="text-slate-500 dark:text-slate-400 pl-5.5 text-[11px]">
                Sincronizações repetidas em rajada (&lt; 4s) são bloqueadas, reutilizando o resultado já em andamento.
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Supabase Realtime CDC Multi-Máquina
              </div>
              <p className="text-slate-500 dark:text-slate-400 pl-5.5 text-[11px]">
                Atualizações instantâneas orientadas a eventos via WebSocket sem necessidade de polling agressivo.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleForceFullSync}
              disabled={isSyncing}
              className="w-full py-2 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              Forçar Sincronização Completa (Recarga Total)
            </button>
          </div>
        </div>

        {/* Coluna 2 e 3: Consumo de Tráfego por Tabela */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-600" />
                Distribuição de Egress por Tabela
              </h2>
              <span className="text-xs text-slate-500">
                Total de Operações: {totalOps}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {tablesList.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Nenhuma chamada de rede registrada na sessão atual.
                </div>
              ) : (
                tablesList.map((tStat) => {
                  const tablePercent = summary.totalBytesTransferred > 0
                    ? Math.round((tStat.totalBytes / summary.totalBytesTransferred) * 100)
                    : 0;

                  return (
                    <div key={tStat.table} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          {tStat.table}
                        </span>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>{tStat.networkRequests} reqs / {tStat.cacheHits} cache</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                            {formatBytes(tStat.totalBytes)} ({tablePercent}%)
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(2, tablePercent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Dica de Desempenho:</strong> Graças à arquitetura <em>Local-First com Dexie IndexedDB</em>, 98% das consultas cotidianas (pesquisas por CPF, filtros por gaveta, relatórios e contagens) são respondidas instantaneamente da máquina do operador em 1ms sem consumir a quota do Supabase.
            </span>
          </div>
        </div>
      </div>

      {/* Tabela de Telemetria e Logs em Tempo Real */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Fluxo de Telemetria em Tempo Real (Últimas Operações)
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              ({filteredLogs.length} eventos)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar por tabela ou ação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
              />
            </div>

            <div className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-xs">
              <button
                onClick={() => setFilterType("all")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterType === "all"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFilterType("network")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterType === "network"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                🌐 Nuvem
              </button>
              <button
                onClick={() => setFilterType("cache")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterType === "cache"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                ⚡ Cache Local
              </button>
            </div>

            <button
              onClick={handleClearLogs}
              title="Limpar logs"
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Horário</th>
                <th className="py-2.5 px-4">Tabela</th>
                <th className="py-2.5 px-4">Operação</th>
                <th className="py-2.5 px-4">Origem / Status</th>
                <th className="py-2.5 px-4">Tamanho</th>
                <th className="py-2.5 px-4">Latência</th>
                <th className="py-2.5 px-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                    Nenhum registro de telemetria encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                      {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                      {log.table}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.operation === "SELECT" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" :
                        log.operation === "UPDATE" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                        log.operation === "DELETE" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                        log.operation === "BATCH_UPSERT" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" :
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}>
                        {log.operation}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {log.isCacheHit ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold font-sans text-[11px]">
                          <Zap className="w-3 h-3 text-emerald-500" />
                          Memória / Dexie
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-sans text-[11px]">
                          <Server className="w-3 h-3 text-blue-500" />
                          Supabase REST
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                      {log.isCacheHit ? (
                        <span className="text-slate-400">0 B (0%)</span>
                      ) : (
                        formatBytes(log.bytes)
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                      {log.durationMs ? `${log.durationMs}ms` : "< 1ms"}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 font-sans text-[11px] max-w-xs truncate" title={log.details}>
                      {log.details || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* Modal de Re-sincronização Unidirecional de Discrepâncias por 'updated_at' */}
      <DiscrepancyReconcileModal
        isOpen={isDiscrepancyModalOpen}
        onClose={() => setIsDiscrepancyModalOpen(false)}
        onSyncCompleted={async () => {
          getSyncStats().then(setSyncStats).catch(() => {});
          setActionSuccess("Re-sincronização unidirecional concluída com sucesso!");
          setTimeout(() => setActionSuccess(null), 5000);
        }}
      />
    </div>
  );
};
