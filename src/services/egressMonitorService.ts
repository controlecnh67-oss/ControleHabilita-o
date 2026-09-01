/**
 * Serviço de Monitoramento de Recursos e Tráfego (Egress) do Supabase.
 * Rastreia consultas à rede, transferências de dados, economia de cache local (IndexedDB/Memória),
 * e fornece telemetria em tempo real para prevenção de estouro do plano gratuito (5 GB).
 */

export interface EgressLogEntry {
  id: string;
  timestamp: string;
  table: string;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "REALTIME" | "BATCH_UPSERT" | "COUNT";
  bytes: number; // bytes trafegados na rede (0 se cache hit)
  isCacheHit: boolean;
  durationMs: number;
  details?: string;
  caller?: string;
}

export interface TableEgressStat {
  table: string;
  networkRequests: number;
  cacheHits: number;
  totalBytes: number;
  bytesSaved: number;
  lastAccess: string;
}

export interface EgressSummary {
  totalNetworkRequests: number;
  totalCacheHits: number;
  totalBytesTransferred: number; // bytes reais transferidos via rede
  totalBytesSaved: number; // bytes economizados por servir do cache local
  cacheEfficiencyPercent: number; // % de requisições atendidas pelo cache
  monthlyProjectedBytes: number;
  maxFreeTierBytes: number; // 5 GB = 5 * 1024 * 1024 * 1024
  freeTierUsagePercent: number;
  lastResetAt: string;
  tables: Record<string, TableEgressStat>;
  recentLogs: EgressLogEntry[];
}

const STORAGE_KEY = "detran_egress_monitor_v1";
const MAX_LOGS = 100;
const FREE_TIER_LIMIT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

let inMemorySummary: EgressSummary = loadPersistedSummary();
const listeners = new Set<(summary: EgressSummary) => void>();

function loadPersistedSummary(): EgressSummary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.totalBytesTransferred === "number") {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Aviso ao carregar dados do monitor de egress:", e);
  }

  return {
    totalNetworkRequests: 0,
    totalCacheHits: 0,
    totalBytesTransferred: 0,
    totalBytesSaved: 0,
    cacheEfficiencyPercent: 100,
    monthlyProjectedBytes: 0,
    maxFreeTierBytes: FREE_TIER_LIMIT_BYTES,
    freeTierUsagePercent: 0,
    lastResetAt: new Date().toISOString(),
    tables: {},
    recentLogs: [],
  };
}

function saveSummary() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemorySummary));
  } catch (e) {
    // se localstorage estiver cheio, descarta logs antigos
    if (inMemorySummary.recentLogs.length > 20) {
      inMemorySummary.recentLogs = inMemorySummary.recentLogs.slice(0, 20);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemorySummary));
      } catch {}
    }
  }
}

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn(inMemorySummary);
    } catch (e) {
      console.warn("Erro no listener de egress:", e);
    }
  });
}

/**
 * Registra uma operação de rede ou acesso a cache.
 */
export function trackEgress(
  table: string,
  operation: EgressLogEntry["operation"],
  payloadDataOrBytes: any,
  isCacheHit: boolean,
  durationMs: number = 0,
  details?: string,
  caller?: string
) {
  let estimatedBytes = 0;

  if (typeof payloadDataOrBytes === "number") {
    estimatedBytes = payloadDataOrBytes;
  } else if (payloadDataOrBytes) {
    try {
      const str = JSON.stringify(payloadDataOrBytes);
      // UTF-8 approximation
      estimatedBytes = new Blob([str]).size;
    } catch {
      estimatedBytes = 512;
    }
  }

  // Se foi um cache hit, estimamos quantos bytes teriam sido trafegados se fosse pela rede
  const savedBytes = isCacheHit ? (estimatedBytes > 0 ? estimatedBytes : 1024) : 0;
  const actualNetworkBytes = isCacheHit ? 0 : estimatedBytes;

  // Atualiza totais
  if (isCacheHit) {
    inMemorySummary.totalCacheHits += 1;
    inMemorySummary.totalBytesSaved += savedBytes;
  } else {
    inMemorySummary.totalNetworkRequests += 1;
    inMemorySummary.totalBytesTransferred += actualNetworkBytes;
  }

  const totalOps = inMemorySummary.totalNetworkRequests + inMemorySummary.totalCacheHits;
  inMemorySummary.cacheEfficiencyPercent = totalOps > 0 
    ? Math.round((inMemorySummary.totalCacheHits / totalOps) * 1000) / 10 
    : 100;

  inMemorySummary.freeTierUsagePercent = Math.min(
    100,
    Math.round((inMemorySummary.totalBytesTransferred / FREE_TIER_LIMIT_BYTES) * 10000) / 100
  );

  // Projeção mensal simplificada
  inMemorySummary.monthlyProjectedBytes = inMemorySummary.totalBytesTransferred * 30;

  // Atualiza estatísticas por tabela
  if (!inMemorySummary.tables[table]) {
    inMemorySummary.tables[table] = {
      table,
      networkRequests: 0,
      cacheHits: 0,
      totalBytes: 0,
      bytesSaved: 0,
      lastAccess: new Date().toISOString(),
    };
  }

  const tStat = inMemorySummary.tables[table];
  tStat.lastAccess = new Date().toISOString();
  if (isCacheHit) {
    tStat.cacheHits += 1;
    tStat.bytesSaved += savedBytes;
  } else {
    tStat.networkRequests += 1;
    tStat.totalBytes += actualNetworkBytes;
  }

  // Cria entrada de log
  const logEntry: EgressLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    table,
    operation,
    bytes: isCacheHit ? 0 : actualNetworkBytes,
    isCacheHit,
    durationMs: Math.max(1, Math.round(durationMs)),
    details: details || (isCacheHit ? "Atendido instantaneamente via Cache Local (0 B egress)" : `${Math.round(actualNetworkBytes / 1024 * 10) / 10} KB transferidos da nuvem`),
    caller,
  };

  inMemorySummary.recentLogs = [logEntry, ...inMemorySummary.recentLogs.slice(0, MAX_LOGS - 1)];

  saveSummary();
  notifyListeners();
}

/**
 * Retorna o resumo consolidado de monitoramento
 */
export function getEgressSummary(): EgressSummary {
  return { ...inMemorySummary };
}

/**
 * Limpa histórico e zera contadores do monitor
 */
export function resetEgressStats() {
  inMemorySummary = {
    totalNetworkRequests: 0,
    totalCacheHits: 0,
    totalBytesTransferred: 0,
    totalBytesSaved: 0,
    cacheEfficiencyPercent: 100,
    monthlyProjectedBytes: 0,
    maxFreeTierBytes: FREE_TIER_LIMIT_BYTES,
    freeTierUsagePercent: 0,
    lastResetAt: new Date().toISOString(),
    tables: {},
    recentLogs: [],
  };
  saveSummary();
  notifyListeners();
}

/**
 * Permite que componentes React assinem atualizações em tempo real
 */
export function subscribeToEgressMonitor(listener: (summary: EgressSummary) => void): () => void {
  listeners.add(listener);
  listener(inMemorySummary);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Utilitário de formatação amigável de Bytes
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
