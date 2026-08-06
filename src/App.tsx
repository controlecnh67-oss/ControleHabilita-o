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
import { ConsultaPublicaPage } from "./pages/ConsultaPublicaPage";
import { AcessosCidadaoPage } from "./pages/AcessosCidadaoPage";
import { RelatoriosPage } from "./pages/RelatoriosPage";
import { isTabAllowedForProfile, NavTab } from "./types";
import { loadOrgaoConfigFromSupabase } from "./services/orgaoService";
import { isSupabaseConfigured } from "./services/supabase";

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
  }, []);

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
            {activeTab === "memorandos" && isTabAllowedForProfile("memorandos", user?.perfil, user?.permissoes) && <MemorandosPage onNavigateToGeral={() => setActiveTab("geral")} />}
            {activeTab === "acessos_cidadao" && isTabAllowedForProfile("acessos_cidadao", user?.perfil, user?.permissoes) && <AcessosCidadaoPage />}
            {activeTab === "relatorios" && isTabAllowedForProfile("relatorios", user?.perfil, user?.permissoes) && <RelatoriosPage />}
            {activeTab === "responsaveis" && isTabAllowedForProfile("responsaveis", user?.perfil, user?.permissoes) && <ResponsaveisPage />}
            {activeTab === "historico" && isTabAllowedForProfile("historico", user?.perfil, user?.permissoes) && <HistoricoPage />}
            {activeTab === "auditoria" && isTabAllowedForProfile("auditoria", user?.perfil, user?.permissoes) && <AuditoriaPage />}
            {activeTab === "mapeamento" && isTabAllowedForProfile("mapeamento", user?.perfil, user?.permissoes) && <MapeamentoPage />}
            {activeTab === "usuarios" && isTabAllowedForProfile("usuarios", user?.perfil, user?.permissoes) && <UsuariosPage />}
            {activeTab === "orgao" && isTabAllowedForProfile("orgao", user?.perfil, user?.permissoes) && <ConfigOrgaoPage />}
            {activeTab === "backup" && isTabAllowedForProfile("backup", user?.perfil, user?.permissoes) && <BackupSyncPage />}
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
