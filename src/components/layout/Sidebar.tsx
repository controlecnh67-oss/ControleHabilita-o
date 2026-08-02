import React from "react";
import { 
  LayoutDashboard, 
  FolderArchive, 
  FileText, 
  Users, 
  MapPin, 
  History, 
  ShieldAlert, 
  UserCog, 
  Database,
  X,
  LogOut,
  ShieldCheck,
  Smartphone,
  QrCode
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { NavTab, isTabAllowedForProfile } from "../../types";

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

  const navItems = [
    { id: "dashboard" as NavTab, label: "Dashboard", icon: LayoutDashboard },
    { id: "geral" as NavTab, label: "Protocolo Geral (CNHs)", icon: FolderArchive },
    { id: "memorandos" as NavTab, label: "Memorandos e Remessas", icon: FileText },
    { id: "responsaveis" as NavTab, label: "Responsáveis e CFCs", icon: Users },
    { id: "mapeamento" as NavTab, label: "Mapeamento (A-Z)", icon: MapPin },
    { id: "historico" as NavTab, label: "Histórico de Movimento", icon: History },
    { id: "auditoria" as NavTab, label: "Auditoria do Sistema", icon: ShieldAlert },
    { id: "usuarios" as NavTab, label: "Gerenciar Usuários", icon: UserCog },
    { id: "backup" as NavTab, label: "Backup e Sincronização", icon: Database },
  ];

  const visibleNavItems = navItems.filter((item) =>
    isTabAllowedForProfile(item.id, user?.perfil)
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
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity" 
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 bg-slate-900 text-slate-300 border-slate-800 transition-all duration-300 ease-in-out lg:static flex flex-col justify-between shrink-0 shadow-lg lg:shadow-none overflow-hidden",
          isOpen 
            ? "w-64 translate-x-0 opacity-100 border-r" 
            : "-translate-x-full w-64 lg:translate-x-0 lg:w-0 opacity-0 lg:border-r-0 pointer-events-none"
        )}
      >
        <div className="w-64 flex flex-col justify-between h-full">
          <div>
            {/* Cabeçalho do Sidebar / Menu */}
            <div className="p-6 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-sm">
                  D
                </div>
                <span className="font-bold text-white tracking-tight text-sm">DETRAN Protocolo</span>
              </div>
              <button
                onClick={onClose}
                title="Recolher / Esconder Menu"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

          {/* Navegação Principal */}
          <nav className="p-4 space-y-1">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
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
                  onClick={() => handleNavClick(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors text-left cursor-pointer",
                    isActive
                      ? "bg-blue-600 text-white shadow-sm font-semibold"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-transform",
                      isActive ? "text-white" : "text-slate-400"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            <div className="pt-2 mt-2 border-t border-slate-800">
              <button
                type="button"
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
        </div>

        {/* Rodapé do Sidebar com Perfil & Ações rápidas */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
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
                onClick={logout}
                title="Sair do Sistema"
                className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors shrink-0"
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
