import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Usuario, PerfilUsuario } from "../types";
import { getUsuarios, logAuditoria } from "../services/db";

interface AuthContextType {
  user: Usuario | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (loginOrEmail: string, senha?: string) => Promise<boolean>;
  loginAsProfile: (perfil: PerfilUsuario) => Promise<boolean>;
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

  // Carregar sessão salva ao inicializar
  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedUserId = sessionStorage.getItem("detran_active_user_id");
        if (savedUserId) {
          const usuarios = await getUsuarios();
          const found = usuarios.find((u) => u.id === savedUserId && u.ativo !== false);
          if (found) {
            setUser(found);
            lastActivityRef.current = Date.now();
          } else {
            sessionStorage.removeItem("detran_active_user_id");
          }
        } else {
          // No modo demo, opcionalmente inicia com o Administrador se não houver sessão para facilitar a visualização imediata
          const autoLogin = localStorage.getItem("detran_auto_logged");
          if (!autoLogin) {
            const usuarios = await getUsuarios();
            const admin = usuarios.find((u) => u.perfil === "Administrador");
            if (admin) {
              setUser(admin);
              sessionStorage.setItem("detran_active_user_id", admin.id);
              localStorage.setItem("detran_auto_logged", "true");
              await logAuditoria("usuarios", admin.login, "Login", admin.id, admin.nome_curto, null, { modo: "Auto Login Inicial" });
            }
          }
        }
      } catch (err) {
        console.error("Erro ao verificar sessão Auth:", err);
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      await logAuditoria("usuarios", user.login, "Logout", user.id, user.nome_curto, null, { causa: "Logout pelo usuário ou inatividade" });
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
      const found = usuarios.find(
        (u) =>
          (u.login.toLowerCase() === loginOrEmail.toLowerCase() ||
            u.email.toLowerCase() === loginOrEmail.toLowerCase()) &&
          u.ativo !== false
      );

      if (!found) {
        throw new Error("Usuário não encontrado ou inativo no sistema.");
      }

      if (senha && found.senha && found.senha !== senha) {
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

  const loginAsProfile = async (perfil: PerfilUsuario): Promise<boolean> => {
    try {
      const usuarios = await getUsuarios();
      const found = usuarios.find((u) => u.perfil === perfil && u.ativo !== false);
      if (!found) {
        throw new Error(`Nenhum usuário ativo encontrado com o perfil ${perfil}.`);
      }
      setUser(found);
      sessionStorage.setItem("detran_active_user_id", found.id);
      lastActivityRef.current = Date.now();
      await logAuditoria("usuarios", found.login, "Login", found.id, found.nome_curto, null, { modo: `Troca Rápida para ${perfil}` });
      return true;
    } catch (err) {
      console.error("Erro na troca de perfil:", err);
      throw err;
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
    loginAsProfile,
    logout,
    hasAccess,
    canEdit,
    canManageUsers,
    timeRemaining,
    updateCurrentUser
  }), [user, isLoading, login, loginAsProfile, logout, hasAccess, canEdit, canManageUsers, timeRemaining, updateCurrentUser]);

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
