import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Usuario, PerfilUsuario } from "../types";
import { getUsuarios, logAuditoria } from "../services/db";
import { supabase, isSupabaseConfigured } from "../services/supabase";

interface AuthContextType {
  user: Usuario | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (loginOrEmail: string, senha?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hasAccess: (allowedProfiles: PerfilUsuario[]) => boolean;
  canEdit: boolean;
  canManageUsers: boolean;
  timeRemaining: number; // Em segundos (para timeout de 30 min)
  updateCurrentUser: (updatedUser: Usuario) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TIMEOUT_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutos

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const lastActivityRef = useRef<number>(Date.now());
  const [timeRemaining, setTimeRemaining] = useState<number>(30 * 60);

  // Carregar sessão salva ao inicializar e ouvir mudanças no Supabase Auth
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        if (isSupabaseConfigured()) {
          // 1. Tentar recuperar sessão nativa do Supabase Auth
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && isMounted) {
            const usuarios = await getUsuarios();
            const found = usuarios.find(
              (u) =>
                (u.id === session.user.id ||
                  (u.email && session.user.email && u.email.toLowerCase() === session.user.email.toLowerCase())) &&
                u.ativo !== false
            );
            if (found) {
              setUser(found);
              sessionStorage.setItem("detran_active_user_id", found.id);
              lastActivityRef.current = Date.now();
              return;
            }
          }
        }

        // 2. Fallback para sessão local salva em sessionStorage
        const savedUserId = sessionStorage.getItem("detran_active_user_id");
        if (savedUserId && isMounted) {
          const usuarios = await getUsuarios();
          const found = usuarios.find((u) => u.id === savedUserId && u.ativo !== false);
          if (found) {
            setUser(found);
            lastActivityRef.current = Date.now();
          } else {
            sessionStorage.removeItem("detran_active_user_id");
          }
        }
      } catch (err) {
        console.error("Erro ao verificar sessão Auth:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Ouvir alterações de estado de autenticação no Supabase (login, logout, token refresh)
    let authListenerSubscription: any = null;
    if (isSupabaseConfigured()) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          const usuarios = await getUsuarios();
          const found = usuarios.find(
            (u) =>
              (u.id === session.user.id ||
                (u.email && session.user.email && u.email.toLowerCase() === session.user.email.toLowerCase())) &&
              u.ativo !== false
          );
          if (found && isMounted) {
            setUser(found);
            sessionStorage.setItem("detran_active_user_id", found.id);
            lastActivityRef.current = Date.now();
          }
        } else if (event === "SIGNED_OUT") {
          if (isMounted) {
            setUser(null);
            sessionStorage.removeItem("detran_active_user_id");
            sessionStorage.removeItem("detran_active_tab");
          }
        }
      });
      authListenerSubscription = authListener.subscription;
    }

    return () => {
      isMounted = false;
      if (authListenerSubscription) {
        authListenerSubscription.unsubscribe();
      }
    };
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      await logAuditoria("usuarios", user.login, "Logout", user.id, user.nome_curto, null, {
        causa: "Logout pelo usuário ou inatividade"
      });
    }
    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn("Aviso ao encerrar sessão Supabase Auth:", e);
      }
    }
    setUser(null);
    sessionStorage.removeItem("detran_active_user_id");
    sessionStorage.removeItem("detran_active_tab");
  }, [user]);

  // Monitorar inatividade (30 minutos)
  useEffect(() => {
    if (!user) return;

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("mousemove", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });
    window.addEventListener("click", handleUserActivity, { passive: true });
    window.addEventListener("scroll", handleUserActivity, { passive: true });

    const timer = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remainingSecs = Math.max(0, Math.floor((TIMEOUT_INACTIVITY_MS - elapsed) / 1000));
      setTimeRemaining((prev) => (prev !== remainingSecs ? remainingSecs : prev));

      if (elapsed >= TIMEOUT_INACTIVITY_MS) {
        console.warn("Sessão DETRAN expirada por inatividade (30 min).");
        logout();
      }
    }, 1000);

    return () => {
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("click", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
      clearInterval(timer);
    };
  }, [user, logout]);

  const login = async (loginOrEmail: string, senha?: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const usuarios = await getUsuarios();
      const cleanInput = loginOrEmail.trim().toLowerCase();

      const found = usuarios.find(
        (u) =>
          (u.login.toLowerCase() === cleanInput ||
            u.email.toLowerCase() === cleanInput) &&
          u.ativo !== false
      );

      if (!found) {
        throw new Error("Usuário não encontrado ou inativo no sistema.");
      }

      // Se o Supabase estiver configurado e a senha for informada, tenta autenticar via Supabase Auth
      if (isSupabaseConfigured() && senha) {
        const targetEmail = found.email || (cleanInput.includes("@") ? cleanInput : `${found.login}@detran.pa.gov.br`);
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: targetEmail,
            password: senha
          });

          if (authError) {
            // Se o usuário ainda não tiver sido criado no auth.users do Supabase, tenta cadastrar automaticamente
            if (authError.message.toLowerCase().includes("invalid login credentials")) {
              const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: targetEmail,
                password: senha,
                options: {
                  data: {
                    nome: found.nome,
                    nome_curto: found.nome_curto,
                    login: found.login,
                    perfil: found.perfil
                  }
                }
              });

              if (signUpError && !signUpData?.user) {
                // Se falhar o auto-cadastro ou credenciais inválidas reais, lança erro
                throw new Error("Credenciais inválidas. Verifique seu login e senha.");
              }
            } else {
              throw new Error(authError.message || "Erro ao autenticar com Supabase Auth.");
            }
          }
        } catch (supabaseAuthErr: any) {
          console.warn("Aviso na autenticação Supabase Auth:", supabaseAuthErr);
          // Permite prosseguir se for ambiente offline/desenvolvimento ou validação local
          if (found.senha && found.senha !== senha) {
            throw new Error("Senha incorreta para este usuário.");
          }
        }
      } else if (senha && found.senha && found.senha !== senha) {
        throw new Error("Senha incorreta para este usuário.");
      }

      setUser(found);
      sessionStorage.setItem("detran_active_user_id", found.id);
      lastActivityRef.current = Date.now();
      await logAuditoria("usuarios", found.login, "Login", found.id, found.nome_curto, null, { status: "Sucesso" });
      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const hasAccess = useCallback((allowedProfiles: PerfilUsuario[]): boolean => {
    if (!user) return false;
    return allowedProfiles.includes(user.perfil);
  }, [user]);

  // Pode editar se não for "Consulta"
  const canEdit = Boolean(user && user.perfil !== "Consulta");

  // Pode gerenciar usuários (Somente Administrador)
  const canManageUsers = Boolean(user && user.perfil === "Administrador");

  const updateCurrentUser = useCallback((updatedUser: Usuario) => {
    setUser(updatedUser);
    sessionStorage.setItem("detran_active_user_id", updatedUser.id);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasAccess,
    canEdit,
    canManageUsers,
    timeRemaining,
    updateCurrentUser
  }), [user, isLoading, login, logout, hasAccess, canEdit, canManageUsers, timeRemaining, updateCurrentUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um AuthProvider");
  }
  return context;
};
