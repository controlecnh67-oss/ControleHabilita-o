import { createClient } from "@supabase/supabase-js";

// ============================================================================
// CLIENTE DE CONEXÃO COM O SUPABASE (POSTGRESQL)
// ============================================================================
// Para ativar a conexão em nuvem:
// 1. Crie um arquivo .env na raiz do projeto com as seguintes variáveis:
//    VITE_SUPABASE_URL=https://seu-projeto.supabase.co
//    VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
// 2. O arquivo `supabase_schema.sql` na raiz possui todo o código para ser
//    colado no Editor SQL do Supabase.
// ============================================================================

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "https://sua-url.supabase.co";
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "sua-chave-anon";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Função utilitária para verificar se o Supabase está configurado corretamente.
 */
export function isSupabaseConfigured(): boolean {
  const env = (import.meta as any).env || {};
  return (
    env.VITE_SUPABASE_URL !== undefined &&
    env.VITE_SUPABASE_ANON_KEY !== undefined &&
    env.VITE_SUPABASE_URL !== "https://sua-url.supabase.co"
  );
}
