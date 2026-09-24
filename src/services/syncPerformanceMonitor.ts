/**
 * Serviço de Monitoramento de Performance da Camada de Sincronização
 * Rastreia o tempo gasto em cada transação entre Supabase e Dexie (IndexedDB),
 * identificando gargalos (CPU, Dexie I/O, Notificações UI) que provocam travamentos no navegador.
 */

export interface SyncTransactionMetric {
  id: string;
  timestamp: string;
  table: string;
  eventType: string; // "INSERT" | "UPDATE" | "DELETE" | "DELTA_SYNC" | "FULL_SYNC" | "BATCH"
  recordId?: string;
  recordsCount: number;
  prepTimeMs: number;
  dexieTimeMs: number;
  notifyTimeMs: number;
  totalTimeMs: number;
  status: "fast" | "warn" | "bottleneck";
  bottleneckReason?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export interface SyncPerformanceSummary {
  totalTransactions: number;
  fastCount: number; // < 16ms
  warnCount: number; // 16ms - 60ms
  bottleneckCount: number; // >= 60ms
  avgTotalTimeMs: number;
  avgDexieTimeMs: number;
  maxTotalTimeMs: number;
  slowestTransaction: SyncTransactionMetric | null;
  tableStats: Record<string, { count: number; avgTotalMs: number; maxMs: number; bottlenecks: number }>;
}

const MAX_HISTORY_SIZE = 250;
const transactionHistory: SyncTransactionMetric[] = [];
const listeners = new Set<(metrics: SyncTransactionMetric[]) => void>();

/**
 * Registra e analisa uma transação de sincronização entre Supabase e Dexie.
 */
export function recordSyncTransaction(params: {
  table: string;
  eventType: string;
  recordId?: string;
  recordsCount?: number;
  prepTimeMs: number;
  dexieTimeMs: number;
  notifyTimeMs: number;
  totalTimeMs: number;
  metadata?: Record<string, any>;
  error?: any;
}): SyncTransactionMetric {
  const recordsCount = params.recordsCount ?? 1;
  const prepTimeMs = Math.round(params.prepTimeMs * 100) / 100;
  const dexieTimeMs = Math.round(params.dexieTimeMs * 100) / 100;
  const notifyTimeMs = Math.round(params.notifyTimeMs * 100) / 100;
  const totalTimeMs = Math.round(params.totalTimeMs * 100) / 100;

  // Determinação de status com base no tipo de operação (pontual vs lote/background)
  let status: "fast" | "warn" | "bottleneck" = "fast";
  let bottleneckReason: string | undefined = undefined;

  const isBatchOrSync = recordsCount > 1 || params.eventType.includes("SYNC") || params.eventType.includes("BATCH");

  if (isBatchOrSync) {
    // Para operações em lote/background assíncronas (download e gravação de dezenas/centenas de registros)
    if (dexieTimeMs >= 1500) {
      status = "bottleneck";
      bottleneckReason = `I/O IndexedDB em Lote Elevado (${dexieTimeMs}ms para ${recordsCount} registros)`;
    } else if (dexieTimeMs >= 500) {
      status = "warn";
      bottleneckReason = `Operação em Lote Demorada (${dexieTimeMs}ms)`;
    }
  } else {
    // Para transações pontuais / Realtime unitárias (orçamento de resposta interativa)
    if (totalTimeMs >= 100 || dexieTimeMs >= 80) {
      status = "bottleneck";
      if (dexieTimeMs > prepTimeMs && dexieTimeMs > notifyTimeMs) {
        bottleneckReason = `I/O IndexedDB Unitário Lento (${dexieTimeMs}ms)`;
      } else if (prepTimeMs > dexieTimeMs && prepTimeMs > notifyTimeMs) {
        bottleneckReason = `Processamento CPU (${prepTimeMs}ms)`;
      } else {
        bottleneckReason = `Notificação UI (${notifyTimeMs}ms)`;
      }
    } else if (totalTimeMs >= 35 || dexieTimeMs >= 30) {
      status = "warn";
      bottleneckReason = `Latência Acima do Ideal (${totalTimeMs}ms)`;
    }
  }

  const metric: SyncTransactionMetric = {
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    table: params.table,
    eventType: params.eventType,
    recordId: params.recordId,
    recordsCount,
    prepTimeMs,
    dexieTimeMs,
    notifyTimeMs,
    totalTimeMs,
    status,
    bottleneckReason,
    metadata: params.metadata,
    error: params.error ? String(params.error.message || params.error) : undefined
  };

  // Armazena no buffer circular
  transactionHistory.unshift(metric);
  if (transactionHistory.length > MAX_HISTORY_SIZE) {
    transactionHistory.pop();
  }

  // Notifica ouvintes
  listeners.forEach((cb) => {
    try {
      cb(transactionHistory);
    } catch {}
  });

  // Emite log formatado no console do navegador
  logTransactionToConsole(metric);

  return metric;
}

/**
 * Formata e emite log detalhado no console do navegador com cores por severidade
 */
function logTransactionToConsole(m: SyncTransactionMetric) {
  const timeStr = `${m.totalTimeMs.toFixed(1)}ms`;
  const dexieStr = `${m.dexieTimeMs.toFixed(1)}ms`;
  const prepStr = `${m.prepTimeMs.toFixed(1)}ms`;
  const notifyStr = `${m.notifyTimeMs.toFixed(1)}ms`;
  const idStr = m.recordId ? ` | ID: ${m.recordId}` : "";
  const countStr = m.recordsCount > 1 ? ` (${m.recordsCount} registros)` : "";

  if (m.status === "bottleneck") {
    console.groupCollapsed(
      `%c⚡ [Sync Perf: Atenção I/O] %c${m.table} (${m.eventType})${countStr} ➔ %cTotal: ${timeStr} %c(Dexie: ${dexieStr} | Prep: ${prepStr} | Notify: ${notifyStr})`,
      "background: #f59e0b; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
      "color: #d97706; font-weight: bold;",
      "color: #b45309; font-weight: bold;",
      "color: #64748b;"
    );
    console.warn(
      `[Monitor de Performance - I/O Assíncrono]:
- Diagnóstico: ${m.bottleneckReason || "Operação volumosa em processamento"}
- Tempo Total: ${timeStr}
- Tempo Dexie (IndexedDB): ${dexieStr}
- Tempo de Normalização (CPU): ${prepStr}
- Tempo de Notificação UI: ${notifyStr}
- Tabela: ${m.table}${idStr}`
    );
    if (m.error) console.warn("Erro associado:", m.error);
    if (m.metadata) console.log("Metadados:", m.metadata);
    console.groupEnd();
  } else if (m.status === "warn") {
    console.warn(
      `%c⚠️ [Sync Perf: Alerta] %c${m.table} (${m.eventType})${countStr} ➔ %cTotal: ${timeStr} %c| Dexie: ${dexieStr} | Prep: ${prepStr} | Notify: ${notifyStr}${idStr}`,
      "color: #d97706; font-weight: bold;",
      "color: #b45309; font-weight: bold;",
      "color: #b45309; font-weight: bold;",
      "color: #64748b;"
    );
  } else {
    // Fast (<16ms)
    console.log(
      `%c⚡ [Sync Perf] %c${m.table} (${m.eventType})${countStr} ➔ %cTotal: ${timeStr} %c| Dexie: ${dexieStr} | Prep: ${prepStr} | Notify: ${notifyStr}${idStr}`,
      "color: #10b981; font-weight: bold;",
      "color: #059669; font-weight: bold;",
      "color: #047857; font-weight: bold;",
      "color: #94a3b8;"
    );
  }
}

/**
 * Retorna o histórico de métricas
 */
export function getSyncPerformanceHistory(): SyncTransactionMetric[] {
  return [...transactionHistory];
}

/**
 * Calcula resumo e agregações estatísticas do monitoramento de performance
 */
export function getSyncPerformanceSummary(): SyncPerformanceSummary {
  if (transactionHistory.length === 0) {
    return {
      totalTransactions: 0,
      fastCount: 0,
      warnCount: 0,
      bottleneckCount: 0,
      avgTotalTimeMs: 0,
      avgDexieTimeMs: 0,
      maxTotalTimeMs: 0,
      slowestTransaction: null,
      tableStats: {}
    };
  }

  let totalMs = 0;
  let dexieMs = 0;
  let maxMs = 0;
  let slowest: SyncTransactionMetric | null = null;
  let fast = 0;
  let warn = 0;
  let bottleneck = 0;
  const tableStats: Record<string, { count: number; totalMs: number; maxMs: number; bottlenecks: number }> = {};

  for (const m of transactionHistory) {
    totalMs += m.totalTimeMs;
    dexieMs += m.dexieTimeMs;

    if (m.totalTimeMs > maxMs) {
      maxMs = m.totalTimeMs;
      slowest = m;
    }

    if (m.status === "fast") fast++;
    else if (m.status === "warn") warn++;
    else if (m.status === "bottleneck") bottleneck++;

    if (!tableStats[m.table]) {
      tableStats[m.table] = { count: 0, totalMs: 0, maxMs: 0, bottlenecks: 0 };
    }
    tableStats[m.table].count++;
    tableStats[m.table].totalMs += m.totalTimeMs;
    if (m.totalTimeMs > tableStats[m.table].maxMs) {
      tableStats[m.table].maxMs = m.totalTimeMs;
    }
    if (m.status === "bottleneck") {
      tableStats[m.table].bottlenecks++;
    }
  }

  const count = transactionHistory.length;
  const formattedTableStats: Record<string, { count: number; avgTotalMs: number; maxMs: number; bottlenecks: number }> = {};

  for (const [table, s] of Object.entries(tableStats)) {
    formattedTableStats[table] = {
      count: s.count,
      avgTotalMs: Math.round((s.totalMs / s.count) * 100) / 100,
      maxMs: s.maxMs,
      bottlenecks: s.bottlenecks
    };
  }

  return {
    totalTransactions: count,
    fastCount: fast,
    warnCount: warn,
    bottleneckCount: bottleneck,
    avgTotalTimeMs: Math.round((totalMs / count) * 100) / 100,
    avgDexieTimeMs: Math.round((dexieMs / count) * 100) / 100,
    maxTotalTimeMs: maxMs,
    slowestTransaction: slowest,
    tableStats: formattedTableStats
  };
}

/**
 * Imprime um relatório completo e tabular no console para depuração imediata
 */
export function printSyncPerformanceReport() {
  const summary = getSyncPerformanceSummary();
  console.group("%c📊 [DETRAN-PROT] Relatório de Performance de Sincronização Supabase ➔ Dexie", "background: #1e293b; color: #38bdf8; font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 4px;");

  console.log(`📈 Estatísticas Gerais:
- Total de Transações: ${summary.totalTransactions}
- Transações Rápidas (<16ms): ${summary.fastCount}
- Transações com Alerta (16ms-60ms): ${summary.warnCount}
- 🚨 GARGALOS CRÍTICOS (>=60ms): ${summary.bottleneckCount}
- Duração Média Total: ${summary.avgTotalTimeMs} ms
- Duração Média Dexie (IndexedDB): ${summary.avgDexieTimeMs} ms
- Pior Pico de Latência: ${summary.maxTotalTimeMs} ms`);

  if (summary.slowestTransaction) {
    console.log("🐌 Transação Mais Lenta:", summary.slowestTransaction);
  }

  console.log("📋 Estatísticas por Tabela:");
  console.table(summary.tableStats);

  const topSlow = [...transactionHistory]
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 10)
    .map((t) => ({
      Tabela: t.table,
      Operação: t.eventType,
      "Total (ms)": t.totalTimeMs,
      "Dexie (ms)": t.dexieTimeMs,
      "Prep (ms)": t.prepTimeMs,
      "Notify (ms)": t.notifyTimeMs,
      Status: t.status,
      Gargalo: t.bottleneckReason || "-"
    }));

  console.log("🔥 Top 10 Transações Mais Lentas:");
  console.table(topSlow);

  console.groupEnd();
}

/**
 * Limpa o histórico em memória
 */
export function clearSyncPerformanceHistory() {
  transactionHistory.length = 0;
  console.log("🧹 Histórico de métricas de performance de sincronização limpo.");
}

/**
 * Inscreve um ouvinte para receber atualizações de métricas
 */
export function subscribeSyncPerformance(cb: (metrics: SyncTransactionMetric[]) => void): () => void {
  listeners.add(cb);
  cb(transactionHistory);
  return () => {
    listeners.delete(cb);
  };
}

// Expõe globalmente no objeto window para diagnóstico rápido via DevTools
if (typeof window !== "undefined") {
  (window as any).__detranSyncPerf = {
    getHistory: getSyncPerformanceHistory,
    getSummary: getSyncPerformanceSummary,
    printReport: printSyncPerformanceReport,
    clear: clearSyncPerformanceHistory
  };
  (window as any).__detranPrintSyncReport = printSyncPerformanceReport;
}
