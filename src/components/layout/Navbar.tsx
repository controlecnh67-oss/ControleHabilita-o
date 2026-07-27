import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Sun, 
  Moon, 
  LogOut, 
  User, 
  Clock, 
  Database, 
  RotateCcw,
  Menu,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Key,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  UserCheck
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { isSupabaseConnected, resetDemoData, updateUsuario } from "../../services/db";
import { cn } from "../../lib/utils";

interface NavbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const { user, logout, timeRemaining, loginAsProfile, updateCurrentUser } = useAuth();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showDbInfo, setShowDbInfo] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Estados para edição das credenciais do próprio usuário logado
  const [showEditCredenciais, setShowEditCredenciais] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editNomeCurto, setEditNomeCurto] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editFone, setEditFone] = useState("");
  const [editLogin, setEditLogin] = useState("");
  const [editSenha, setEditSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingCredenciais, setSavingCredenciais] = useState(false);

  const openEditCredenciais = () => {
    if (!user) return;
    setEditNome(user.nome || "");
    setEditNomeCurto(user.nome_curto || "");
    setEditEmail(user.email || "");
    setEditFone(user.fone || "");
    setEditLogin(user.login || "");
    setEditSenha(user.senha || "detran@123");
    setShowPassword(false);
    setShowEditCredenciais(true);
  };

  const handleSaveCredenciais = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingCredenciais(true);
    try {
      const atualizado = await updateUsuario(user.id, {
        nome: editNome,
        nome_completo: editNome,
        nome_curto: editNomeCurto,
        email: editEmail,
        fone: editFone,
        login: editLogin,
        senha: editSenha || "detran@123"
      }, user.id, user.nome_curto);
      updateCurrentUser(atualizado);
      setShowEditCredenciais(false);
      alert("✅ Suas credenciais de acesso foram atualizadas com sucesso!");
    } catch (err: any) {
      alert("Erro ao atualizar credenciais: " + (err.message || "Erro desconhecido"));
    } finally {
      setSavingCredenciais(false);
    }
  };

  useEffect(() => {
    // Check initial theme
    const isDark = document.documentElement.classList.contains("dark") ||
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isDark ? "dark" : "light");
    if (isDark) document.documentElement.classList.add("dark");
  }, []);

  const toggleTheme = () => {
    if (theme === "light") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setTheme("dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setTheme("light");
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s < 10 ? "0" : ""}${s}s`;
  };

  const handleResetDemo = () => {
    if (confirm("Deseja redefinir todos os dados de demonstração (CNHs, Memorandos, Responsáveis) para o estado inicial?")) {
      resetDemoData();
      window.location.reload();
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 flex items-center justify-between shrink-0 shadow-xs transition-colors">
      {/* Esquerda: Menu toggle & Título da seção / Logo no Mobile ou Menu Retraído */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
          aria-label="Alternar menu principal"
          title={isSidebarOpen ? "Recolher / Esconder Menu" : "Expandir Menu Principal"}
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <div className={cn("flex items-center gap-2.5 transition-opacity", isSidebarOpen ? "lg:hidden" : "flex")}>
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-600 text-white font-bold text-xs shadow-xs shrink-0">
            D
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
              DETRAN <span className="text-blue-600 dark:text-blue-400">CNH</span>
            </h1>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3 ml-1">
          <h1 className="text-sm md:text-base font-bold text-slate-800 dark:text-white tracking-tight">
            Setor Operacional de Protocolo e Entregas
          </h1>
        </div>
      </div>

      {/* Direita: Conexão DB, Tema, Perfil Logado */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Badge de Status DB / Modo Demo */}
        <div className="relative">
          <button
            onClick={() => setShowDbInfo(!showDbInfo)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all border ${
              isSupabaseConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isSupabaseConnected ? "Supabase DB" : "Modo Demo Local"}
            </span>
          </button>

          {/* Painel de Informações de Conexão */}
          {showDbInfo && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 p-4 z-50 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Status do Banco de Dados
                </h4>
                <button onClick={() => setShowDbInfo(false)} className="text-xs text-slate-400 hover:text-slate-600">
                  Fechar
                </button>
              </div>
              
              {isSupabaseConnected ? (
                <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 py-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">Conectado ao Supabase</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      PostgreSQL e Row Level Security (RLS) ativos.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 py-1">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">Modo Demo Local Ativo</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Rodando com motor de banco de dados no localStorage. Todas as regras (A-Z, Remessa, Entrega) e perfis funcionam perfeitamente!
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleResetDemo}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-md text-xs transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Redefinir Dados de Teste (Seed)
                  </button>
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/supabase_schema.sql');
                      const sql = await res.text();
                      await navigator.clipboard.writeText(sql);
                      alert("✅ Script SQL do Supabase copiado com sucesso!\n\nCole no Editor SQL (SQL Editor) do seu painel Supabase para criar e popular todas as 8 tabelas iniciais.");
                    } catch (e) {
                      alert("⚠️ O arquivo supabase_schema.sql está disponível na raiz do projeto!");
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold rounded-md text-xs transition-colors border border-blue-200 dark:border-blue-800 cursor-pointer shadow-2xs"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Copiar Script SQL do Supabase
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Botão Tema Claro / Escuro */}
        <button
          onClick={toggleTheme}
          className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          title={theme === "light" ? "Mudar para Modo Escuro" : "Mudar para Modo Claro"}
          aria-label="Alternar tema"
        >
          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Perfil e Switcher Rápido para Teste */}
        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 p-1 pr-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 transition-all"
            >
              <div className="w-7 h-7 rounded bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                {user.nome_curto.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate max-w-[120px]">
                  {user.nome_curto}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5 font-semibold">
                  {user.perfil}
                </p>
              </div>
            </button>

            {/* Dropdown do Usuário */}
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-50 animate-fadeIn">
                <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{user.nome}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{user.email}</p>
                  <div className="mt-1.5">
                    <Badge situacao={user.perfil} />
                  </div>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      openEditCredenciais();
                    }}
                    className="w-full mt-2.5 flex items-center justify-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-300 dark:bg-blue-950/60 dark:hover:bg-blue-900/50 rounded-md transition-colors border border-blue-200/80 dark:border-blue-800/80 shadow-2xs"
                  >
                    <Key className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Editar Minhas Credenciais</span>
                  </button>
                </div>

                {/* Switcher rápido de perfis */}
                <div className="py-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                    Alternar Perfil de Teste:
                  </p>
                  {(["Administrador", "Supervisor", "Operador", "Consulta"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={async () => {
                        await loginAsProfile(p);
                        setShowProfileMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        user.perfil === p
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{p}</span>
                      {user.perfil === p && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Encerrar Sessão (Logout)
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-slate-400" />
          </div>
        )}
      </div>

      {/* Modal de Editar Minhas Credenciais de Acesso */}
      <Modal
        isOpen={showEditCredenciais}
        onClose={() => setShowEditCredenciais(false)}
        title="Minhas Credenciais de Acesso"
        size="md"
      >
        <form onSubmit={handleSaveCredenciais} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-xl flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 dark:text-blue-200">
              <p className="font-bold">Área do Servidor Logado</p>
              <p className="mt-0.5">Atualize seus dados pessoais e redefina sua senha de acesso ao sistema do DETRAN/PA.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo *
            </label>
            <input
              type="text"
              required
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Digite seu nome completo..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nome Curto / Carimbo *
              </label>
              <input
                type="text"
                required
                value={editNomeCurto}
                onChange={(e) => setEditNomeCurto(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Carlos Eduardo"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Telefone / Celular
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={editFone}
                  onChange={(e) => setEditFone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="(67) 99999-9999"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Login de Acesso *
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={editLogin}
                  onChange={(e) => setEditLogin(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="Ex: admin"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                E-mail Institucional *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="seunome@detran.pa.gov.br"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Senha de Acesso / Credencial *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showPassword ? "text" : "password"}
                required
                min={4}
                value={editSenha}
                onChange={(e) => setEditSenha(e.target.value)}
                className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="Digite sua senha de acesso..."
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title={showPassword ? "Ocultar senha" : "Ver senha"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Use esta senha junto com seu login ou e-mail na tela de autenticação.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowEditCredenciais(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingCredenciais}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              <span>{savingCredenciais ? "Salvando..." : "Salvar Alterações"}</span>
            </button>
          </div>
        </form>
      </Modal>
    </header>
  );
};
