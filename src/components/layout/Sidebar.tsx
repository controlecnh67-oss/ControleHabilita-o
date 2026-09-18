import React, { useState, useEffect, useRef } from "react";
import { 
  LayoutDashboard, 
  FolderArchive, 
  UserCheck,
  FileText, 
  FileCheck,
  Users, 
  MapPin, 
  History, 
  ShieldAlert, 
  UserCog, 
  Building2,
  Database,
  X,
  LogOut,
  ShieldCheck,
  Smartphone,
  QrCode,
  BarChart3,
  Activity
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { NavTab, isTabAllowedForProfile } from "../../types";
import { getOrgaoConfig } from "../../services/orgaoService";

export type { NavTab };

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onClose,
}) => {
  const { user, logout } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [imgError, setImgError] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateLogo = () => {
      const cfg = getOrgaoConfig();
      if (cfg && cfg.logo) {
        setLogoUrl(cfg.logo);
        setImgError(false);
      }
    };
    updateLogo();
    window.addEventListener("storage", updateLogo);
    return () => window.removeEventListener("storage", updateLogo);
  }, []);

  // Garante que a aba ativa esteja sempre visível na barra de rolagem ao carregar ou alternar
  useEffect(() => {
    if (navRef.current) {
      const activeBtn = navRef.current.querySelector(`[data-tab-id="${activeTab}"]`);
      if (activeBtn) {
        activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [activeTab]);

  const navItems = [
    { id: "dashboard" as NavTab, label: "Dashboard", icon: LayoutDashboard },
    { id: "geral" as NavTab, label: "Protocolo Geral (CNHs)", icon: FolderArchive },
    { id: "candidatos" as NavTab, label: "Candidatos", icon: UserCheck },
    { id: "memorandos" as NavTab, label: "Memorandos e Remessas", icon: FileText },
    { id: "declaracao" as NavTab, label: "Declaração", icon: FileCheck },
    { id: "acessos_cidadao" as NavTab, label: "Consulta Cidadão (App)", icon: Smartphone },
    { id: "relatorios" as NavTab, label: "Relatórios Setoriais", icon: BarChart3 },
    { id: "responsaveis" as NavTab, label: "Responsáveis", icon: Users },
    { id: "mapeamento" as NavTab, label: "Mapeamento (A-Z)", icon: MapPin },
    { id: "historico" as NavTab, label: "Histórico de Movimento", icon: History },
    { id: "auditoria" as NavTab, label: "Auditoria do Sistema", icon: ShieldAlert },
    { id: "usuarios" as NavTab, label: "Gerenciar Usuários", icon: UserCog },
    { id: "orgao" as NavTab, label: "Configuração do Órgão", icon: Building2 },
    { id: "backup" as NavTab, label: "Backup e Sincronização", icon: Database },
    { id: "monitoramento" as NavTab, label: "Monitoramento Supabase", icon: Activity },
  ];

  const visibleNavItems = navItems.filter((item) =>
    isTabAllowedForProfile(item.id, user?.perfil, user?.permissoes)
  );

  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop mobile */}
      {isOpen && (
        <div 
          id="sidebar-backdrop"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden transition-opacity" 
          onClick={onClose}
        />
      )}

      <aside
        id="main-sidebar-aside"
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 bg-slate-900 text-slate-300 border-slate-800 transition-all duration-300 ease-in-out lg:static flex flex-col shrink-0 shadow-xl lg:shadow-none h-screen max-h-screen overflow-hidden",
          isOpen 
            ? "w-64 translate-x-0 opacity-100 border-r" 
            : "-translate-x-full w-64 lg:translate-x-0 lg:w-0 opacity-0 lg:border-r-0 pointer-events-none"
        )}
      >
        <div className="w-64 flex flex-col h-full min-h-0 overflow-hidden">
          {/* Cabeçalho do Sidebar / Menu (Fixo no topo) */}
          <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-800 shrink-0 bg-slate-900/95 backdrop-blur-xs z-10">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl && !imgError ? (
                <img
                  src={logoUrl}
                  alt="Logo DETRAN"
                  onError={() => setImgError(true)}
                  className="w-8 h-8 object-contain rounded bg-white/90 p-0.5 shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-sm">
                  D
                </div>
              )}
              <span className="font-bold text-white tracking-tight text-sm truncate">
                DETRAN Protocolo
              </span>
            </div>
            <button
              onClick={onClose}
              title="Recolher / Esconder Menu"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navegação Principal com Barra de Rolagem Ativa */}
          <nav 
            ref={navRef}
            id="sidebar-main-navigation"
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-1 custom-menu-scrollbar overscroll-contain select-none focus:outline-none"
            tabIndex={0}
            aria-label="Abas do Menu Principal"
          >
            <div className="flex items-center justify-between px-2 mb-2 sticky top-0 bg-slate-900/95 backdrop-blur-xs py-1.5 z-10 border-b border-slate-800/40">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Menu Principal
              </span>
              {user && (
                <span className="text-[10px] font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60 truncate max-w-[100px]" title={`Perfil: ${user.perfil}`}>
                  {user.perfil}
                </span>
              )}
            </div>

            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  data-tab-id={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors text-left cursor-pointer",
                    isActive
                      ? "bg-blue-600 text-white shadow-sm font-semibold ring-1 ring-blue-400/40"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-transform",
                      isActive ? "text-white scale-105" : "text-slate-400"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            <div className="pt-2.5 mt-2.5 border-t border-slate-800/80">
              <button
                type="button"
                id="nav-tab-portal-cidadao"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("consulta", "true");
                    window.location.href = url.toString();
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md font-bold text-xs bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 transition-colors text-left group cursor-pointer shadow-2xs"
              >
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">📱 Portal Cidadão (Sem Login)</span>
              </button>
            </div>
          </nav>

          {/* Rodapé do Sidebar com Perfil & Ações rápidas (Fixo no fundo) */}
          <div className="p-3.5 bg-slate-950 border-t border-slate-800 shrink-0 space-y-2.5">
            {user && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {user.nome_curto.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 overflow-hidden text-left">
                    <p className="text-xs font-semibold text-white truncate">
                      {user.nome_curto}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase truncate font-semibold">
                      {user.perfil}
                    </p>
                  </div>
                </div>
                
                <button
                  id="btn-logout-sidebar"
                  onClick={logout}
                  title="Sair do Sistema"
                  className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="text-center pt-1 border-t border-slate-900">
              <p className="text-[9px] text-slate-600 font-mono">
                DETRAN/PA - Protocolo v2.4.0
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

