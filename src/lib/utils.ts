import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatação de CPF (000.000.000-00)
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// Validação simples de formato CPF
export function cleanCPF(value: string): string {
  return value.replace(/\D/g, "");
}

// Formatação de Telefone ((00) 00000-0000 ou (00) 0000-0000)
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

// Formatação de data/hora (dd/mm/yyyy hh:mm)
export function formatDateTime(dateStr?: string | Date): string {
  if (!dateStr) return "-";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "-";
  }
}

// Formatação de data (dd/mm/yyyy)
export function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return "-";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return "-";
  }
}

// Extrair inicial ignorando acentos e minúsculas para mapeamento (ex: "Álvaro" -> "A")
export function getInitialChar(name: string): string {
  if (!name || !name.trim()) return "";
  const normalized = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return normalized.charAt(0);
}

// Normaliza texto para busca (remove acentos, espaços extras e converte para minúsculas)
export function normalizeSearch(str?: string | number | null): string {
  if (str === undefined || str === null) return "";
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Verifica correspondência segura por dígitos (CPF, Telefone, etc), evitando match com string vazia
export function matchDigitsSafe(target?: string | null, query?: string | null): boolean {
  if (!target || !query) return false;
  const cleanQuery = query.replace(/\D/g, "");
  if (!cleanQuery) return false;
  const cleanTarget = target.replace(/\D/g, "");
  return cleanTarget.includes(cleanQuery);
}

