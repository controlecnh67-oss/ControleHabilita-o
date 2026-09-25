/**
 * Serviço de Rastreamento e Diagnóstico de Erros de Sincronização
 * Monitora e armazena o histórico detalhado de falhas e divergências
 * entre a base local Dexie (IndexedDB) e a nuvem (Supabase).
 */

export type SyncErrorType =
  | "network_offline"       // Conexão / Falha de Rede / DNS / Offline
  | "timeout"               // Timeout na requisição / Resposta lenta do Supabase
  | "constraint_violation"  // Violação de Integridade / Chave Estrangeira (FK) / Unicidade
  | "permission_rls"        // Permissão negada / RLS / Autenticação
  | "data_validation"       // Payload inválido / Coluna inexistente / Tipo incorreto
  | "dexie_io"              // Erro no IndexedDB / Cota de armazenamento / Falha de I/O local
  | "conflict"              // Conflito de versão / Concorrência
  | "other";                // Outros erros inesperados

export type SyncDirection =
  | "supabase_to_dexie"     // Nuvem ➔ Local (Download / Delta Sync / Carga)
  | "dexie_to_supabase"     // Local ➔ Nuvem (Upload / Upsert / Gravação)
  | "realtime"              // WebSocket Realtime CDC
  | "local_dexie";          // Operação interna do Dexie

export interface SyncErrorLog {
  id: string;
  timestamp: string;        // ISO string
  table: string;            // ex: geral_cnhs, lotes, responsaveis, etc.
  direction: SyncDirection;
  errorType: SyncErrorType;
  message: string;          // Mensagem amigável resumida
  technicalDetails?: string;// Stack trace, objeto de erro Supabase ou detalhes técnicos
  actionTaken?: string;     // Ex: "Fallback para cache local ativado", "Tentativa com payload simplificado", etc.
  recordsCount?: number;    // Quantidade de registros envolvidos
  severity: "error" | "warning" | "critical";
  resolved?: boolean;
}

const STORAGE_KEY = "detran_sync_errors_log";
const MAX_ERRORS_STORED = 500;

// Listeners reativos para atualizações em tempo real
type SyncErrorListener = (errors: SyncErrorLog[]) => void;
const listeners = new Set<SyncErrorListener>();

// Cache em memória
let memoryErrors: SyncErrorLog[] | null = null;

/**
 * Carrega a lista de erros persistida no localStorage
 */
export function getSyncErrors(): SyncErrorLog[] {
  if (memoryErrors) return memoryErrors;

  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryErrors = [];
      return memoryErrors;
    }
    const parsed = JSON.parse(raw);
    memoryErrors = Array.isArray(parsed) ? parsed : [];
    return memoryErrors;
  } catch (err) {
    console.warn("Erro ao ler histórico de erros de sincronização:", err);
    memoryErrors = [];
    return memoryErrors;
  }
}

/**
 * Salva a lista de erros no localStorage e notifica assinantes
 */
function persistErrors(list: SyncErrorLog[]) {
  memoryErrors = list.slice(0, MAX_ERRORS_STORED);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryErrors));
    } catch (e) {
      console.warn("Erro ao salvar histórico de erros no localStorage:", e);
    }
  }

  // Notifica ouvintes
  listeners.forEach((listener) => {
    try {
      listener([...memoryErrors!]);
    } catch (e) {
      console.warn("Erro no listener de sync errors:", e);
    }
  });
}

/**
 * Classifica automaticamente um erro com base na mensagem ou código retornado
 */
export function classifySyncError(err: any): {
  type: SyncErrorType;
  severity: "error" | "warning" | "critical";
  friendlyMessage: string;
} {
  if (!err) {
    return {
      type: "other",
      severity: "warning",
      friendlyMessage: "Falha de comunicação não especificada"
    };
  }

  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || "").toString().toLowerCase();
  const details = (err.details || "").toString().toLowerCase();

  // 1. Falhas de Rede / DNS / Offline
  if (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("networkerror") ||
    msg.includes("failed to fetch") ||
    msg.includes("offline") ||
    msg.includes("net::err") ||
    msg.includes("sua-url.supabase.co") ||
    msg.includes("connection refused")
  ) {
    return {
      type: "network_offline",
      severity: "warning",
      friendlyMessage: "Falha de conectividade com o Supabase (Servidor inacessível ou máquina offline)"
    };
  }

  // 2. Timeouts
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("tempo limite")
  ) {
    return {
      type: "timeout",
      severity: "warning",
      friendlyMessage: "Tempo limite de resposta excedido (Timeout de rede ou servidor sobrecarregado)"
    };
  }

  // 3. Violações de Integridade / Foreign Key / Chave Única
  if (
    msg.includes("foreign key") ||
    msg.includes("violates foreign key constraint") ||
    msg.includes("violates not-null constraint") ||
    msg.includes("duplicate key") ||
    msg.includes("unique constraint") ||
    code === "23503" ||
    code === "23505" ||
    code === "23502"
  ) {
    return {
      type: "constraint_violation",
      severity: "critical",
      friendlyMessage: "Violação de integridade referencial ou chave duplicada no banco remoto"
    };
  }

  // 4. Permissões / RLS / Autenticação
  if (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("rls") ||
    msg.includes("unauthorized") ||
    msg.includes("jwt") ||
    code === "42501" ||
    err.status === 401 ||
    err.status === 403
  ) {
    return {
      type: "permission_rls",
      severity: "critical",
      friendlyMessage: "Acesso negado pelas políticas de segurança RLS ou credenciais expiradas"
    };
  }

  // 5. Validação de Dados / Coluna Inexistente
  if (
    msg.includes("column") ||
    msg.includes("does not exist") ||
    msg.includes("invalid input syntax") ||
    msg.includes("malformed") ||
    code === "42703" ||
    code === "22p02"
  ) {
    return {
      type: "data_validation",
      severity: "error",
      friendlyMessage: "Divergência de esquema: coluna ou tipo de dado não suportado no Supabase"
    };
  }

  // 6. I/O Dexie / IndexedDB
  if (
    msg.includes("indexeddb") ||
    msg.includes("dexie") ||
    msg.includes("quotaexceeded") ||
    msg.includes("databaseclosed") ||
    msg.includes("versionerror")
  ) {
    return {
      type: "dexie_io",
      severity: "critical",
      friendlyMessage: "Falha de I/O no banco local IndexedDB (Cota do navegador ou base corrompida)"
    };
  }

  // 7. Conflitos de Concorrência
  if (msg.includes("conflict") || code === "40001") {
    return {
      type: "conflict",
      severity: "warning",
      friendlyMessage: "Conflito de alteração simultânea entre operador local e nuvem"
    };
  }

  return {
    type: "other",
    severity: "error",
    friendlyMessage: err.message || "Erro inesperado durante o ciclo de sincronização"
  };
}

/**
 * Registra uma nova ocorrência de erro de sincronização
 */
export function recordSyncError(params: {
  table: string;
  direction: SyncDirection;
  error: any;
  actionTaken?: string;
  recordsCount?: number;
  customType?: SyncErrorType;
  customMessage?: string;
}): SyncErrorLog {
  const classified = classifySyncError(params.error);
  const errorType = params.customType || classified.type;
  const severity = classified.severity;

  let technicalDetails = "";
  if (params.error) {
    if (typeof params.error === "object") {
      try {
        technicalDetails = JSON.stringify(params.error, Object.getOwnPropertyNames(params.error), 2);
      } catch {
        technicalDetails = String(params.error);
      }
    } else {
      technicalDetails = String(params.error);
    }
  }

  const logEntry: SyncErrorLog = {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    table: params.table,
    direction: params.direction,
    errorType,
    message: params.customMessage || classified.friendlyMessage,
    technicalDetails: technicalDetails || undefined,
    actionTaken: params.actionTaken || "Operação continuou com segurança na base local IndexedDB (Dexie)",
    recordsCount: params.recordsCount ?? 1,
    severity,
    resolved: false
  };

  const currentList = getSyncErrors();
  // Insere no início
  const updated = [logEntry, ...currentList];
  persistErrors(updated);

  return logEntry;
}

/**
 * Limpa todo o histórico de erros
 */
export function clearSyncErrors(): void {
  persistErrors([]);
}

/**
 * Alterna o status de resolvido de um erro específico
 */
export function toggleErrorResolved(id: string): void {
  const current = getSyncErrors();
  const updated = current.map((err) =>
    err.id === id ? { ...err, resolved: !err.resolved } : err
  );
  persistErrors(updated);
}

/**
 * Marca todos os erros acumulados como resolvidos/verificados
 */
export function resolveAllSyncErrors(): void {
  const current = getSyncErrors();
  const updated = current.map((err) => ({ ...err, resolved: true }));
  persistErrors(updated);
}

/**
 * Remove um único erro do histórico
 */
export function deleteSyncError(id: string): void {
  const current = getSyncErrors();
  const updated = current.filter((err) => err.id !== id);
  persistErrors(updated);
}

/**
 * Assina para receber atualizações do histórico de erros em tempo real
 */
export function subscribeToSyncErrors(listener: SyncErrorListener): () => void {
  listeners.add(listener);
  // Envia estado atual imediatamente
  listener(getSyncErrors());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Gera um erro simulado para diagnóstico e verificação visual
 */
export function generateTestSyncError(): SyncErrorLog {
  const testTypes: { type: SyncErrorType; table: string; dir: SyncDirection; msg: string; details: string; action: string }[] = [
    {
      type: "network_offline",
      table: "geral_cnhs",
      dir: "supabase_to_dexie",
      msg: "Falha de conectividade com o Supabase (Servidor inacessível ou máquina offline)",
      details: "TypeError: fetch failed\nCaused by: Error: getaddrinfo ENOTFOUND sua-url.supabase.co\nStatus: offline",
      action: "Sincronização Delta pausada. 11.226 registros locais do IndexedDB preservados com zero perda de dados."
    },
    {
      type: "timeout",
      table: "geral_cnhs",
      dir: "supabase_to_dexie",
      msg: "Tempo limite de resposta excedido (Timeout de rede ou servidor sobrecarregado)",
      details: "TimeoutError: Timeout na consulta delta do Supabase após 4000ms.\nAbortController disparado.",
      action: "Consulta abortada para evitar travamento da UI. Operador continuou utilizando cache local."
    },
    {
      type: "constraint_violation",
      table: "geral_cnhs",
      dir: "dexie_to_supabase",
      msg: "Violação de integridade referencial: chave estrangeira responsavel_id não encontrada",
      details: 'PostgresError: insert or update on table "geral_cnhs" violates foreign key constraint "geral_cnhs_responsavel_id_fkey" (code 23503)',
      action: "Acionado payload seguro sem FKs para garantir persistência dos dados físicos da CNH."
    },
    {
      type: "permission_rls",
      table: "usuarios",
      dir: "dexie_to_supabase",
      msg: "Acesso negado pelas políticas de segurança RLS na tabela de usuários",
      details: 'PostgresError: new row violates row-level security policy for table "usuarios" (code 42501)',
      action: "Registro mantido na sessão local, solicitação de sincronização bloqueada pelo servidor."
    },
    {
      type: "dexie_io",
      table: "geral_cnhs",
      dir: "local_dexie",
      msg: "Alerta de I/O no IndexedDB: latência elevada de gravação em lote",
      details: "DexieIOReport: Transação em lote de 500 registros demorou 128ms para persistir no disco local.",
      action: "Chunking assíncrono executado em lotes de 500 itens com yield ao Event Loop."
    }
  ];

  const pick = testTypes[Math.floor(Math.random() * testTypes.length)];
  return recordSyncError({
    table: pick.table,
    direction: pick.dir,
    error: pick.details,
    customType: pick.type,
    customMessage: pick.msg,
    actionTaken: pick.action
  });
}

/**
 * Retorna estatísticas consolidadas dos erros
 */
export function getSyncErrorsSummary() {
  const all = getSyncErrors();
  const todayStr = new Date().toISOString().slice(0, 10);

  const byType: Record<SyncErrorType, number> = {
    network_offline: 0,
    timeout: 0,
    constraint_violation: 0,
    permission_rls: 0,
    data_validation: 0,
    dexie_io: 0,
    conflict: 0,
    other: 0
  };

  let todayCount = 0;
  let unresolvedCount = 0;

  for (const err of all) {
    if (byType[err.errorType] !== undefined) {
      byType[err.errorType]++;
    } else {
      byType.other++;
    }

    if (err.timestamp.startsWith(todayStr)) {
      todayCount++;
    }

    if (!err.resolved) {
      unresolvedCount++;
    }
  }

  return {
    total: all.length,
    today: todayCount,
    unresolved: unresolvedCount,
    byType,
    lastError: all[0] || null
  };
}
