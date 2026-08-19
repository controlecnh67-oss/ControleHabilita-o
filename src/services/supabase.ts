import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// CLIENTE DE CONEXÃO COM O SUPABASE (POSTGRESQL)
// ============================================================================

const DEFAULT_URL = "https://sua-url.supabase.co";
const DEFAULT_KEY = "sua-chave-anon";

export interface SupabaseConfigInfo {
  url: string;
  key: string;
  source: 'env' | 'local' | 'none';
}

export function getSupabaseCredentials(): SupabaseConfigInfo {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  const localUrl = typeof window !== 'undefined' ? localStorage.getItem("detran_supabase_url") : null;
  const localKey = typeof window !== 'undefined' ? localStorage.getItem("detran_supabase_key") : null;

  if (localUrl && localKey && localUrl.trim() !== "" && localUrl !== DEFAULT_URL) {
    return { url: localUrl.trim(), key: localKey.trim(), source: 'local' };
  }

  if (envUrl && envKey && envUrl.trim() !== "" && envUrl !== DEFAULT_URL && envUrl !== "https://seu-projeto.supabase.co") {
    return { url: envUrl.trim(), key: envKey.trim(), source: 'env' };
  }

  return {
    url: localUrl || envUrl || DEFAULT_URL,
    key: localKey || envKey || DEFAULT_KEY,
    source: 'none'
  };
}

let supabaseClientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  const { url, key } = getSupabaseCredentials();
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(url, key);
  }
  return supabaseClientInstance;
}

export function resetSupabaseClient(): void {
  const { url, key } = getSupabaseCredentials();
  supabaseClientInstance = createClient(url, key);
}

// Proxy export para garantir chamadas transparentes sempre ao cliente ativo
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient() as any;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

/**
 * Verifica se o Supabase está configurado corretamente (via .env ou localStorage).
 */
export function isSupabaseConfigured(): boolean {
  const { url, key, source } = getSupabaseCredentials();
  return (
    source !== 'none' &&
    !!url &&
    !!key &&
    url !== DEFAULT_URL &&
    url !== "https://seu-projeto.supabase.co"
  );
}

export function saveLocalSupabaseConfig(url: string, key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem("detran_supabase_url", url.trim());
    localStorage.setItem("detran_supabase_key", key.trim());
    resetSupabaseClient();
  }
}

export function clearLocalSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem("detran_supabase_url");
    localStorage.removeItem("detran_supabase_key");
    resetSupabaseClient();
  }
}

/**
 * Assina eventos do Supabase Realtime (PostgreSQL changes) em uma tabela pública.
 * Retorna uma função de cancelamento (unsubscribe).
 */
export function subscribeToSupabaseRealtime(
  table: string,
  callback: (payload: any) => void
): () => void {
  if (!isSupabaseConfigured()) {
    return () => {};
  }
  try {
    const client = getSupabaseClient();
    const channelName = `realtime_${table}_${Math.random().toString(36).substring(2, 8)}`;
    const channel = client
      .channel(channelName)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        (payload: any) => {
          callback(payload);
        }
      )
      .subscribe();

    return () => {
      try {
        client.removeChannel(channel);
      } catch {}
    };
  } catch (err) {
    console.warn(`Erro ao assinar Realtime para ${table}:`, err);
    return () => {};
  }
}

export function getPublicShareUrl(cpf?: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("consulta", "true");
  if (cpf) {
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf) url.searchParams.set("cpf", cleanCpf);
  }

  const creds = getSupabaseCredentials();
  if (creds.url && creds.key && creds.source !== 'none') {
    url.searchParams.set("sb_url", creds.url);
    url.searchParams.set("sb_key", creds.key);
  }

  return url.toString();
}

