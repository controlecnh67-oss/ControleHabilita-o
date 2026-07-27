import React from "react";
import { cn } from "../../lib/utils";
import { SituacaoGeral } from "../../types";

interface BadgeProps {
  situacao?: SituacaoGeral | string;
  className?: string;
  children?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

export const Badge: React.FC<BadgeProps> = ({ situacao, className, children, variant }) => {
  let bgClass = "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";

  if (situacao) {
    switch (situacao) {
      case "Remetida":
      case "Em elaboração":
        bgClass = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
        break;
      case "Remetido":
      case "Recebida":
      case "Operador":
        bgClass = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800";
        break;
      case "Pendente":
      case "Consulta":
        bgClass = "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800";
        break;
      case "Entregue":
      case "Administrador":
        bgClass = "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800";
        break;
      case "Supervisor":
        bgClass = "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800";
        break;
      default:
        bgClass = "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  } else if (variant) {
    switch (variant) {
      case "success":
        bgClass = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
        break;
      case "warning":
        bgClass = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
        break;
      case "danger":
        bgClass = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
        break;
      case "info":
        bgClass = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
        break;
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-2xs whitespace-nowrap",
        bgClass,
        className
      )}
    >
      {children || situacao}
    </span>
  );
};
