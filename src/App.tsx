import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth, SessionCountdownBadge } from "./context/AuthContext";
import { Navbar } from "./components/layout/Navbar";
import { Sidebar } from "./components/layout/Sidebar";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GeralPage } from "./pages/GeralPage";
import { MemorandosPage } from "./pages/MemorandosPage";
import { ResponsaveisPage } from "./pages/ResponsaveisPage";
import { HistoricoPage } from "./pages/HistoricoPage";
import { AuditoriaPage } from "./pages/AuditoriaPage";
import { MapeamentoPage } from "./pages/MapeamentoPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { ConfigOrgaoPage } from "./pages/ConfigOrgaoPage";
import { BackupSyncPage } from "./pages/BackupSyncPage";
import { DatabaseMonitoringPage } from "./pages/DatabaseMonitoringPage";
import { ConsultaPublicaPage } from "./pages/ConsultaPublicaPage";
import { AcessosCidadaoPage } from "./pages/AcessosCidadaoPage";
import { RelatoriosPage } from "./pages/RelatoriosPage";
import { DeclaracoesPage } from "./pages/DeclaracoesPage";
import { CandidatosPage } from "./pages/CandidatosPage";
import { isTabAllowedForProfile, NavTab } from "./types";
import { loadOrgaoConfigFromSupabase } from "./services/orgaoService";
import { isSupabaseConfigured, subscribeToMultipleSupabaseRealtime } from "./services/supabase";
import { checkAndRunDailyGoogleDriveBackup } from "./services/googleDriveService";
import { dexieDb, normalizeCNHRecord, notifySyncUpdated, syncGeralWithSupabase, subscribeSyncStatus } from "./services/dexieDb";
import { notifyDataSync, invalidateSupabaseCache } from "./services/db";
import { initAutoSyncService } from "./services/autoSyncService";
import { 
  recordSyncTransaction, 
  subscribeSyncPerformance, 
  printSyncPerformanceReport, 
  SyncTransactionMetric 
} from "./services/syncPerformanceMonitor";

const MainLayout: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  
  // Monitoramento de performance da última transação de sincronização
  const [lastSyncPerf, setLastSyncPerf] = useState<SyncTransactionMetric | null>(null);

  useEffect(() => {
    return subscribeSyncPerformance((metrics) => {
      if (metrics.length > 0) {
        setLastSyncPerf(metrics[0]);
      }
    });
  }, []);

  const [isPublicConsulta, setIsPublicConsulta] = useState(() => {
    if (typeof window !== "undefined") {
      const search = window.location.search;
      const hash = window.location.hash;
      return search.includes("consulta=true") || hash === "#consulta";
    }
    return false;
  });

  useEffect(() => {
    if (isSupabaseConfigured()) {
      loadOrgaoConfigFromSupabase().catch(() => {});
    }
    // Inicializa o motor de sincronização automática contínua e realtime multi-máquina
    const cleanupAutoSync = initAutoSyncService();
    return () => {
      cleanupAutoSync();
    };
  }, []);

  // Sincronização em Tempo Real (Supabase Realtime) e Heartbeat Multi-Máquina
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const tablesToWatch = [
      "geral_cnhs",
      "memorandos",
      "candidatos",
      "responsaveis",
      "mapeamento_localizacao",
      "acessos_cidadao",
      "orgao_config",
      "declaracoes",
      "lotes"
    ];

    const unsubscribe = subscribeToMultipleSupabaseRealtime(tablesToWatch, async (table, payload) => {
      const startTime = performance.now();
      let prepTime = 0;
      let dexieTime = 0;
      let notifyTime = 0;
      let errorOccurred: any = null;
      const recordId = payload.new?.id || payload.old?.id;

      try {
        const tPrep0 = performance.now();
        invalidateSupabaseCache(table);
        prepTime += performance.now() - tPrep0;

        if (table === "geral_cnhs") {
          const eventType = payload.eventType;
          if ((eventType === "INSERT" || eventType === "UPDATE") && payload.new) {
            try {
              const tPrepStart = performance.now();
              const normalized = normalizeCNHRecord(payload.new);
              prepTime += performance.now() - tPrepStart;

              const tDexieStart = performance.now();
              await dexieDb.geral.put(normalized);
              dexieTime = performance.now() - tDexieStart;

              const tNotifyStart = performance.now();
              notifySyncUpdated("geral");
              notifyTime = performance.now() - tNotifyStart;
            } catch (e: any) {
              errorOccurred = e;
              console.warn("Erro ao atualizar registro Realtime em geral_cnhs:", e);
            }
          } else if (eventType === "DELETE" && payload.old?.id) {
            try {
              const tDexieStart = performance.now();
              await dexieDb.geral.delete(payload.old.id);
              dexieTime = performance.now() - tDexieStart;

              const tNotifyStart = performance.now();
              notifySyncUpdated("geral");
              notifyTime = performance.now() - tNotifyStart;
            } catch (e: any) {
              errorOccurred = e;
              console.warn("Erro ao excluir registro Realtime em geral_cnhs:", e);
            }
          }
        } else if (table === "lotes") {
          const eventType = payload.eventType;
          if ((eventType === "INSERT" || eventType === "UPDATE") && payload.new) {
            try {
              const tDexieStart = performance.now();
              if (dexieDb.lotes) await dexieDb.lotes.put(payload.new);
              dexieTime = performance.now() - tDexieStart;
            } catch (e: any) {
              errorOccurred = e;
              console.warn("Erro ao atualizar lote no Realtime:", e);
            }
          } else if (eventType === "DELETE" && payload.old?.id) {
            try {
              const tDexieStart = performance.now();
              if (dexieDb.lotes) await dexieDb.lotes.delete(payload.old.id);
              dexieTime = performance.now() - tDexieStart;
            } catch (e: any) {
              errorOccurred = e;
              console.warn("Erro ao remover lote no Realtime:", e);
            }
          }
          const tNotifyStart = performance.now();
          notifyDataSync("lotes");
          notifyTime = performance.now() - tNotifyStart;
        } else {
          const tNotifyStart = performance.now();
          notifyDataSync(table);
          notifyTime = performance.now() - tNotifyStart;
        }
      } catch (err: any) {
        errorOccurred = err;
      } finally {
        const totalDuration = performance.now() - startTime;
        recordSyncTransaction({
          table,
          eventType: payload.eventType || "REALTIME",
          recordId,
          prepTimeMs: prepTime,
          dexieTimeMs: dexieTime,
          notifyTimeMs: notifyTime,
          totalTimeMs: totalDuration,
          metadata: {
            newOrdem: payload.new?.ordem,
            oldOrdem: payload.old?.ordem,
            situacao: payload.new?.situacao
          },
          error: errorOccurred
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Monitoramento de Sincronização em Lote / Delta (Supabase <-> Dexie)
  useEffect(() => {
    let lastRecordedSyncAt: string | null = null;
    const unsubSyncStatus = subscribeSyncStatus((stats) => {
      if (stats.lastSyncAt && stats.lastSyncAt !== lastRecordedSyncAt && stats.syncDurationMs > 0) {
        lastRecordedSyncAt = stats.lastSyncAt;
        recordSyncTransaction({
          table: "geral_cnhs",
          eventType: stats.isOffline ? "OFFLINE_CACHE" : "REMOTE_SYNC_SUMMARY",
          recordsCount: stats.totalRecords,
          prepTimeMs: 1.0,
          dexieTimeMs: Math.min(stats.syncDurationMs, 25), // I/O local estimado proporcional
          notifyTimeMs: 1.5,
          totalTimeMs: stats.syncDurationMs,
          metadata: {
            totalRecords: stats.totalRecords,
            isOffline: stats.isOffline,
            lastSyncAt: stats.lastSyncAt,
            networkDurationMs: stats.syncDurationMs
          }
        });
      }
    });
    return () => unsubSyncStatus();
  }, []);

  // Execução da rotina de verificação de backup diário automático para o Google Drive
  useEffect(() => {
    if (isAuthenticated) {
      // Executa após 3 segundos da inicialização para não interferir na renderização inicial
      const timer = setTimeout(() => {
        checkAndRunDailyGoogleDriveBackup().catch((e) => {
          console.warn("Aviso na verificação de backup diário do Google Drive:", e);
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleUrlChange = () => {
      if (typeof window !== "undefined") {
        const search = window.location.search;
        const hash = window.location.hash;
        if (search.includes("consulta=true") || hash === "#consulta") {
          setIsPublicConsulta(true);
        }
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, []);

  const openPublicConsulta = async () => {
    await logout();
    setIsPublicConsulta(true);
  };

  const closePublicConsulta = async () => {
    await logout();
    setIsPublicConsulta(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("consulta");
      url.searchParams.delete("cpf");
      if (window.location.hash === "#consulta") {
        url.hash = "";
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const [activeTabState, setActiveTabState] = useState<NavTab>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("detran_active_tab") as NavTab;
      if (saved) return saved;
    }
    return "dashboard";
  });

  const setActiveTab = (tab: NavTab) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("detran_active_tab", tab);
    }
  };

  const activeTab = activeTabState;

  // Redireciona se a aba ativa não for permitida para o perfil e permissões do usuário logado
  const userPerfil = user?.perfil;
  const permissoesKey = user?.permissoes ? user.permissoes.join(",") : "";
  useEffect(() => {
    if (user && !isTabAllowedForProfile(activeTab, user.perfil, user.permissoes)) {
      setActiveTab("dashboard");
    }
  }, [userPerfil, permissoesKey, activeTab]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return typeof window !== "undefined" ? window.innerWidth >= 1024 : true;
  });

  if (isPublicConsulta) {
    return <ConsultaPublicaPage onBackToLogin={closePublicConsulta} />;
  }

  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-500">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold tracking-wide uppercase">Carregando Sistema DETRAN CNH...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onOpenConsultaPublica={openPublicConsulta} />;
  }

  return (
    <div className="flex h-screen w-full bg-slate-100 dark:bg-slate-950 font-sans overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (typeof window !== "undefined" && window.innerWidth < 1024) {
            setIsSidebarOpen(false);
          }
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
          isSidebarOpen={isSidebarOpen}
          onNavigateToTab={(tab) => setActiveTab(tab)}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-100 dark:bg-slate-950 flex flex-col gap-6">
          <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
            {activeTab === "dashboard" && isTabAllowedForProfile("dashboard", user?.perfil, user?.permissoes) && <DashboardPage />}
            {activeTab === "geral" && isTabAllowedForProfile("geral", user?.perfil, user?.permissoes) && <GeralPage />}
            {activeTab === "candidatos" && isTabAllowedForProfile("candidatos", user?.perfil, user?.permissoes) && <CandidatosPage />}
            {activeTab === "memorandos" && isTabAllowedForProfile("memorandos", user?.perfil, user?.permissoes) && <MemorandosPage onNavigateToGeral={() => setActiveTab("geral")} />}
            {activeTab === "declaracao" && isTabAllowedForProfile("declaracao", user?.perfil, user?.permissoes) && <DeclaracoesPage />}
            {activeTab === "acessos_cidadao" && isTabAllowedForProfile("acessos_cidadao", user?.perfil, user?.permissoes) && <AcessosCidadaoPage />}
            {activeTab === "relatorios" && isTabAllowedForProfile("relatorios", user?.perfil, user?.permissoes) && <RelatoriosPage />}
            {activeTab === "responsaveis" && isTabAllowedForProfile("responsaveis", user?.perfil, user?.permissoes) && <ResponsaveisPage />}
            {activeTab === "historico" && isTabAllowedForProfile("historico", user?.perfil, user?.permissoes) && <HistoricoPage />}
            {activeTab === "auditoria" && isTabAllowedForProfile("auditoria", user?.perfil, user?.permissoes) && <AuditoriaPage />}
            {activeTab === "mapeamento" && isTabAllowedForProfile("mapeamento", user?.perfil, user?.permissoes) && <MapeamentoPage />}
            {activeTab === "usuarios" && isTabAllowedForProfile("usuarios", user?.perfil, user?.permissoes) && <UsuariosPage />}
            {activeTab === "orgao" && isTabAllowedForProfile("orgao", user?.perfil, user?.permissoes) && <ConfigOrgaoPage />}
            {activeTab === "backup" && isTabAllowedForProfile("backup", user?.perfil, user?.permissoes) && <BackupSyncPage />}
            {activeTab === "monitoramento" && isTabAllowedForProfile("monitoramento", user?.perfil, user?.permissoes) && <DatabaseMonitoringPage />}
          </div>
        </main>

        <footer className="h-8 bg-slate-800 dark:bg-slate-900 text-slate-400 px-4 flex items-center justify-between text-[10px] shrink-0 border-t border-slate-700 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Sistema Online
            </span>
            <span>Sessão expira em: <SessionCountdownBadge /></span>
            
            {/* Monitoramento de Performance da Sincronização Supabase <-> Dexie */}
            <button
              type="button"
              onClick={() => printSyncPerformanceReport()}
              title="Monitoramento de Performance da Sincronização ativo. Clique para imprimir relatório detalhado de gargalos no console do DevTools."
              className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded transition-all cursor-pointer font-sans text-[10px] border ${
                lastSyncPerf?.status === "bottleneck"
                  ? "bg-rose-950/80 text-rose-300 border-rose-700 animate-pulse"
                  : lastSyncPerf?.status === "warn"
                  ? "bg-amber-950/80 text-amber-300 border-amber-700"
                  : "bg-slate-700/60 text-slate-300 border-slate-600/60 hover:text-white hover:bg-slate-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  lastSyncPerf?.status === "bottleneck"
                    ? "bg-rose-500"
                    : lastSyncPerf?.status === "warn"
                    ? "bg-amber-400"
                    : "bg-emerald-400"
                }`}
              />
              <span>
                Sync Perf:{" "}
                {lastSyncPerf
                  ? `${lastSyncPerf.totalTimeMs.toFixed(1)}ms (${lastSyncPerf.table})`
                  : "Monitorando"}
              </span>
            </button>
          </div>
          <div className="flex gap-4 font-mono">
            <span>v2.4.0-stable</span>
            <span>© 2026 DETRAN-PROT</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
