import React from "react";
import { BookOpen } from "lucide-react";
import { ManualDoUsuarioSubTab } from "../components/geral/ManualDoUsuarioSubTab";

export const ManualDoUsuarioPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página no Padrão do Sistema DETRAN */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Manual do Usuário & Cartilha Operacional
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Acesso Geral (Todos os Usuários)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Instruções didáticas para cada perfil de usuário, regras de negócio do DETRAN, procedimentos no balcão e download da cartilha oficial em PDF.
            </p>
          </div>
        </div>
      </div>

      {/* Conteúdo Completo do Manual */}
      <ManualDoUsuarioSubTab />
    </div>
  );
};
