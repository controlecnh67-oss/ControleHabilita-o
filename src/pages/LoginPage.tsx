import React, { useState } from "react";
import { ShieldCheck, UserCheck, Lock, Sparkles, ArrowRight, Eye, EyeOff, Key, CheckCircle2, Smartphone } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getUsuarios, updateUsuario } from "../services/db";
import { Modal } from "../components/ui/Modal";

interface LoginPageProps {
  onOpenConsultaPublica?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onOpenConsultaPublica }) => {
  const { login, isLoading } = useAuth();
  
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("detran_remember_me") === "true";
    }
    return false;
  });

  const [loginInput, setLoginInput] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("detran_remember_login") || "";
    }
    return "";
  });

  const [senhaInput, setSenhaInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados do Modal "Esqueci minha senha" / Redefinição
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotLogin, setForgotLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(null);
    if (!forgotLogin.trim()) {
      setForgotError("Digite o seu login ou e-mail cadastrado.");
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setForgotError("A nova senha deve ter pelo menos 4 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError("As senhas digitadas não coincidem.");
      return;
    }
    setIsResetting(true);
    try {
      const usuarios = await getUsuarios();
      const target = usuarios.find(u => 
        (u.login && u.login.toLowerCase() === forgotLogin.trim().toLowerCase()) ||
        (u.email && u.email.toLowerCase() === forgotLogin.trim().toLowerCase())
      );
      if (!target) {
        throw new Error("Usuário não encontrado. Verifique o login ou e-mail informado.");
      }
      await updateUsuario(target.id, { senha: newPassword }, target.id, target.nome_curto || "Servidor");
      setForgotSuccess("✅ Senha redefinida com sucesso! Você já pode entrar com sua nova senha.");
      setSenhaInput(newPassword);
      setLoginInput(target.login || forgotLogin);
      setTimeout(() => {
        setShowForgotModal(false);
        setNewPassword("");
        setConfirmPassword("");
        setForgotSuccess(null);
      }, 2000);
    } catch (err: any) {
      setForgotError(err.message || "Erro ao redefinir a senha.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginInput.trim()) {
      setError("Por favor, digite o seu login ou e-mail.");
      return;
    }
    setError(null);

    // Salvar ou remover login do localStorage de acordo com a checkbox 'Lembrar meu acesso'
    if (typeof window !== "undefined") {
      if (rememberMe) {
        localStorage.setItem("detran_remember_login", loginInput.trim());
        localStorage.setItem("detran_remember_me", "true");
      } else {
        localStorage.removeItem("detran_remember_login");
        localStorage.removeItem("detran_remember_me");
      }
    }

    try {
      await login(loginInput.trim(), senhaInput);
    } catch (err: any) {
      setError(err.message || "Erro ao efetuar login. Verifique suas credenciais.");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 font-sans text-slate-100">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-700/50">
        
        {/* Esquerda: Banner Institucional DETRAN */}
        <div className="md:col-span-5 bg-gradient-to-b from-blue-700 to-indigo-900 p-8 flex flex-col justify-between text-white relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-4 z-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-lg">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">DETRAN / PA</h1>
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mt-1">
                Setor de Protocolo Geral
              </p>
            </div>
            <p className="text-sm text-blue-100/90 leading-relaxed pt-2">
              Sistema moderno de controle de requisição, remessa, recebimento com alocação automática de gaveta e entrega ao cidadão.
            </p>
          </div>

          <div className="pt-8 z-10">
            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Segurança e Proteção de Dados</span>
              </div>
              <p className="text-xs text-blue-100 leading-normal">
                Sessão com expiração automática após 30 minutos de inatividade e auditoria completa de todas as transações.
              </p>
            </div>
          </div>
        </div>

        {/* Direita: Formulário de Login */}
        <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
          <div className="max-w-md mx-auto w-full space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Acesse sua conta</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Digite suas credenciais do DETRAN para acessar o sistema.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-300 font-medium animate-shake">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Login ou E-mail Institucional
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <UserCheck className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
                    placeholder="ex: admin ou operador@detran.pa.gov.br"
                    className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotLogin(loginInput || "");
                      setForgotError(null);
                      setForgotSuccess(null);
                      setNewPassword("");
                      setConfirmPassword("");
                      setShowForgotModal(true);
                    }}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={senhaInput}
                    onChange={(e) => setSenhaInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Caixa 'Lembrar meu acesso' */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 dark:border-slate-700 rounded focus:ring-blue-500 dark:bg-slate-800 transition-colors cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                    Lembrar meu acesso
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? "Autenticando..." : "Entrar no Sistema"}
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Botão de Consulta Pública Mobile para Cidadãos */}
              <button
                type="button"
                onClick={() => {
                  if (onOpenConsultaPublica) {
                    onOpenConsultaPublica();
                  } else if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("consulta", "true");
                    window.location.href = url.toString();
                  }
                }}
                className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-extrabold rounded-xl border border-emerald-300 dark:border-emerald-700/80 transition-all flex items-center justify-center gap-2 text-xs shadow-2xs cursor-pointer group"
              >
                <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>📱 Consulta Cidadão (Sem Login / Por CPF)</span>
              </button>
            </form>

          </div>
        </div>

      </div>

      {/* Segunda Modal: Esqueci minha senha / Redefinir Senha */}
      <Modal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        title="Redefinir Senha de Acesso"
        size="md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-xl flex items-start gap-3">
            <Key className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 dark:text-blue-200">
              <p className="font-bold">Recuperação e Redefinição de Credencial</p>
              <p className="mt-0.5">Informe seu login institucional cadastrado ou e-mail para cadastrar uma nova senha de acesso ao sistema do DETRAN/PA.</p>
            </div>
          </div>

          {forgotError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-300 font-medium">
              {forgotError}
            </div>
          )}

          {forgotSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{forgotSuccess}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Login ou E-mail Cadastrado *
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={forgotLogin}
                onChange={(e) => setForgotLogin(e.target.value)}
                placeholder="Ex: admin ou supervisor@detran.pa.gov.br"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nova Senha *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showNewPassword ? "text" : "password"}
                required
                min={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha..."
                className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title={showNewPassword ? "Ocultar senha" : "Ver senha"}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Confirmar Nova Senha *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showNewPassword ? "text" : "password"}
                required
                min={4}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha..."
                className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isResetting || !!forgotSuccess}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              <span>{isResetting ? "Salvando..." : "Salvar Nova Senha"}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
