import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
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
import { dexieDb, normalizeCNHRecord, notifySyncUpdated, syncGeralWithSupabase } from "./services/dexieDb";
import { notifyDataSync, invalidateSupabaseCache } from "./services/db";
import { initAutoSyncService } from "./services/autoSyncService";

const MainLayout: React.FC = () => {
  const { user, isAuthenticated, isLoading, timeRemaining, logout } = useAuth();
  
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
      invalidateSupabaseCache(table);
      if (table === "geral_cnhs") {
        const eventType = payload.eventType;
        if ((eventType === "INSERT" || eventType === "UPDATE") && payload.new) {
          try {
            const normalized = normalizeCNHRecord(payload.new);
            await dexieDb.geral.put(normalized);
            notifySyncUpdated("geral");
          } catch (e) {
            console.warn("Erro ao atualizar registro Realtime em geral_cnhs:", e);
          }
        } else if (eventType === "DELETE" && payload.old?.id) {
          try {
            await dexieDb.geral.delete(payload.old.id);
            notifySyncUpdated("geral");
          } catch (e) {
            console.warn("Erro ao excluir registro Realtime em geral_cnhs:", e);
          }
        }
      } else if (table === "lotes") {
        const eventType = payload.eventType;
        if ((eventType === "INSERT" || eventType === "UPDATE") && payload.new) {
          try {
            if (dexieDb.lotes) await dexieDb.lotes.put(payload.new);
          } catch (e) {
            console.warn("Erro ao atualizar lote no Realtime:", e);
          }
        } else if (eventType === "DELETE" && payload.old?.id) {
          try {
            if (dexieDb.lotes) await dexieDb.lotes.delete(payload.old.id);
          } catch (e) {
            console.warn("Erro ao remover lote no Realtime:", e);
          }
        }
        notifyDataSync("lotes");
      } else {
        notifyDataSync(table);
      }
    });

    return () => {
      unsubscribe();
    };
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
  useEffect(() => {
    if (user && !isTabAllowedForProfile(activeTab, user.perfil, user.permissoes)) {
      setActiveTab("dashboard");
    }
  }, [user?.perfil, user?.permissoes, activeTab]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return typeof window !== "undefined" ? window.innerWidth >= 1024 : true;
  });

  const formatCountdown = (secs: number = 0) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

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
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Sistema Online
            </span>
            <span>Sessão expira em: <strong className="font-mono text-slate-300">{formatCountdown(timeRemaining)}</strong></span>
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
