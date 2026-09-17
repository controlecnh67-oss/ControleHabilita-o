import React, { useState, useEffect } from "react";
import { 
  getSupabaseClient, 
  isSupabaseConfigured 
} from "./supabase";
import { 
  checkSyncStatus, 
  syncSingleTable, 
  getStoredList, 
  saveStoredList, 
  notifyDataSync,
  SyncStatusItem
} from "./db";
import { dexieDb, normalizeCNHRecord, notifySyncUpdated } from "./dexieDb";

export interface AutoSyncState {
  status: "idle" | "syncing" | "synced" | "error" | "offline";
  lastSyncTime: Date | null;
  pendingDifferencesCount: number;
  activeChannel: boolean;
  onlineMachinesCount: number;
  lastMessage?: string;
}

export interface TableMutationEvent {
  table: string;
  action: "insert" | "update" | "delete" | "sync";
  record?: any;
  id?: string;
  clientId: string;
  timestamp: number;
}

// Identificador único para a aba/máquina atual (evita eco de broadcasts próprios)
const CLIENT_SESSION_ID = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `client_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

let autoSyncChannel: any = null;
let broadcastChannel: BroadcastChannel | null = null;
let isInitialized = false;
let isReconciling = false;
let autoSyncTimer: any = null;
let debouncedMutationTimer: any = null;

const syncListeners = new Set<(state: AutoSyncState) => void>();

let currentState: AutoSyncState = {
  status: "idle",
  lastSyncTime: null,
  pendingDifferencesCount: 0,
  activeChannel: false,
  onlineMachinesCount: 1,
  lastMessage: undefined
};

function updateState(partial: Partial<AutoSyncState>) {
  currentState = { ...currentState, ...partial };
  for (const listener of syncListeners) {
    try {
      listener(currentState);
    } catch (e) {
      console.warn("Erro ao notificar listener de AutoSync:", e);
    }
  }
}

export function subscribeAutoSync(listener: (state: AutoSyncState) => void): () => void {
  syncListeners.add(listener);
  listener(currentState);
  return () => {
    syncListeners.delete(listener);
  };
}

export function getAutoSyncState(): AutoSyncState {
  return currentState;
}

/**
 * Transmite uma mutação para todas as outras máquinas e abas abertas em tempo real.
 */
export function broadcastTableMutation(
  table: string,
  action: "insert" | "update" | "delete" | "sync" = "update",
  record?: any,
  id?: string
) {
  const payload: TableMutationEvent = {
    table,
    action,
    record,
    id: id || record?.id,
    clientId: CLIENT_SESSION_ID,
    timestamp: Date.now()
  };

  // 1. Enviar para outras abas no mesmo navegador via BroadcastChannel nativo
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch (e) {
      console.warn("Erro ao postar mensagem no BroadcastChannel:", e);
    }
  }

  // 2. Enviar para todas as outras máquinas e usuários conectados via Supabase Realtime Broadcast
  if (isSupabaseConfigured() && autoSyncChannel) {
    try {
      autoSyncChannel.send({
        type: "broadcast",
        event: "table_mutation",
        payload
      }).catch((err: any) => {
        console.warn("Aviso ao enviar broadcast de mutação Realtime:", err);
      });
    } catch (err) {
      console.warn("Falha ao disparar Realtime broadcast:", err);
    }
  }

  // 3. Agendar reconciliação automática suave após inserção local
  scheduleDebouncedReconciliation(1500);
}

if (typeof window !== "undefined") {
  (window as any).__detranBroadcastMutation = broadcastTableMutation;
}

/**
 * Processa uma mutação recebida remotamente de outra máquina ou aba.
 */
async function handleIncomingMutation(data: TableMutationEvent) {
  if (!data || data.clientId === CLIENT_SESSION_ID) return;

  const { table, action, record, id } = data;

  try {
    if (table === "geral_cnhs" || table === "geral") {
      if ((action === "insert" || action === "update") && record) {
        const normalized = normalizeCNHRecord(record);
        await dexieDb.geral.put(normalized);
        const storedGeral = getStoredList<any>("geral", []);
        const idx = storedGeral.findIndex((g) => g.id === normalized.id);
        if (idx >= 0) storedGeral[idx] = normalized;
        else storedGeral.unshift(normalized);
        saveStoredList("geral", storedGeral);
        notifySyncUpdated("geral");
      } else if (action === "delete" && id) {
        await dexieDb.geral.delete(id);
        const storedGeral = getStoredList<any>("geral", []).filter((g) => g.id !== id);
        saveStoredList("geral", storedGeral);
        notifySyncUpdated("geral");
      }
      notifyDataSync("geral");
    } else if (table === "lotes") {
      if ((action === "insert" || action === "update") && record) {
        if (dexieDb.lotes) await dexieDb.lotes.put(record);
        const list = getStoredList<any>("lotes", []);
        const idx = list.findIndex((l) => l.id === record.id);
        if (idx >= 0) list[idx] = record;
        else list.unshift(record);
        saveStoredList("lotes", list);
      } else if (action === "delete" && id) {
        if (dexieDb.lotes) await dexieDb.lotes.delete(id);
        const list = getStoredList<any>("lotes", []).filter((l) => l.id !== id);
        saveStoredList("lotes", list);
      }
      notifyDataSync("lotes");
    } else if (table === "memorandos") {
      if ((action === "insert" || action === "update") && record) {
        const list = getStoredList<any>("memorandos", []);
        const idx = list.findIndex((m) => m.id === record.id);
        if (idx >= 0) list[idx] = record;
        else list.unshift(record);
        saveStoredList("memorandos", list);
      } else if (action === "delete" && id) {
        const list = getStoredList<any>("memorandos", []).filter((m) => m.id !== id);
        saveStoredList("memorandos", list);
      }
      notifyDataSync("memorandos");
    } else if (table === "candidatos") {
      if ((action === "insert" || action === "update") && record) {
        const list = getStoredList<any>("candidatos", []);
        const idx = list.findIndex((c) => c.id === record.id);
        if (idx >= 0) list[idx] = record;
        else list.unshift(record);
        saveStoredList("candidatos", list);
      } else if (action === "delete" && id) {
        const list = getStoredList<any>("candidatos", []).filter((c) => c.id !== id);
        saveStoredList("candidatos", list);
      }
      notifyDataSync("candidatos");
      notifyDataSync("memorandos");
    } else if (table === "declaracoes") {
      if ((action === "insert" || action === "update") && record) {
        const list = getStoredList<any>("declaracoes", []);
        const idx = list.findIndex((d) => d.id === record.id);
        if (idx >= 0) list[idx] = record;
        else list.unshift(record);
        saveStoredList("declaracoes", list);
      } else if (action === "delete" && id) {
        const list = getStoredList<any>("declaracoes", []).filter((d) => d.id !== id);
        saveStoredList("declaracoes", list);
      }
      notifyDataSync("declaracoes");
    } else if (table === "responsaveis" || table === "mapeamento_localizacao" || table === "usuarios") {
      const key = table === "mapeamento_localizacao" ? "mapeamento" : table;
      if ((action === "insert" || action === "update") && record) {
        const list = getStoredList<any>(key, []);
        const idx = list.findIndex((item) => item.id === record.id);
        if (idx >= 0) list[idx] = record;
        else list.unshift(record);
        saveStoredList(key, list);
      } else if (action === "delete" && id) {
        const list = getStoredList<any>(key, []).filter((item) => item.id !== id);
        saveStoredList(key, list);
      }
      notifyDataSync(key);
    } else {
      notifyDataSync(table);
    }

    updateState({
      lastSyncTime: new Date(),
      lastMessage: `Atualização recebida em tempo real da tabela '${table}'`
    });
  } catch (err) {
    console.warn(`Erro ao aplicar mutação remota da tabela '${table}':`, err);
  }
}

/**
 * Reconcilia automaticamente todas as tabelas pendentes em segundo plano.
 * Elimina a necessidade de clicar manualmente tabela por tabela.
 */
export async function reconcilePendingDifferences(forceFull: boolean = false): Promise<void> {
  if (isReconciling || !isSupabaseConfigured()) return;
  isReconciling = true;
  updateState({ status: "syncing", lastMessage: "Verificando tabelas automáticas..." });

  try {
    const stats: SyncStatusItem[] = await checkSyncStatus();
    const pendingTables = stats.filter((s) => s.status === "pending" || (forceFull && s.status !== "not_configured"));
    
    updateState({ pendingDifferencesCount: pendingTables.length });

    if (pendingTables.length === 0) {
      updateState({
        status: "synced",
        lastSyncTime: new Date(),
        pendingDifferencesCount: 0,
        lastMessage: "Todas as tabelas estão 100% sincronizadas"
      });
      isReconciling = false;
      return;
    }

    // Ordem estrita de dependência relacional para evitar violação de Foreign Keys
    const priorityOrder = [
      "usuarios",
      "responsaveis",
      "mapeamento",
      "memorandos",
      "lotes",
      "candidatos",
      "geral",
      "declaracoes",
      "historico",
      "auditoria",
      "orgao",
      "imagens",
      "acessos_cidadao"
    ];

    const sortedTables = [...pendingTables].sort((a, b) => {
      const idxA = priorityOrder.indexOf(a.key);
      const idxB = priorityOrder.indexOf(b.key);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    });

    for (const item of sortedTables) {
      try {
        updateState({
          lastMessage: `Sincronizando automaticamente '${item.label}'...`
        });
        await syncSingleTable(item.key);
      } catch (err: any) {
        console.warn(`Aviso na sincronização automática da tabela '${item.key}':`, err.message);
      }
    }

    // Re-checagem final
    const finalStats = await checkSyncStatus();
    const remainingPending = finalStats.filter((s) => s.status === "pending");

    updateState({
      status: remainingPending.length === 0 ? "synced" : "idle",
      lastSyncTime: new Date(),
      pendingDifferencesCount: remainingPending.length,
      lastMessage: remainingPending.length === 0 
        ? "Todas as tabelas sincronizadas automaticamente" 
        : `${remainingPending.length} tabela(s) ainda em processo`
    });
  } catch (err: any) {
    console.warn("Erro durante ciclo de sincronização automática:", err);
    updateState({
      status: "error",
      lastMessage: err.message || "Erro na sincronização automática"
    });
  } finally {
    isReconciling = false;
  }
}

/**
 * Agenda uma sincronização com debounce para não sobrecarregar a rede em digitações rápidas.
 */
function scheduleDebouncedReconciliation(delayMs: number = 2000) {
  if (debouncedMutationTimer) clearTimeout(debouncedMutationTimer);
  debouncedMutationTimer = setTimeout(() => {
    reconcilePendingDifferences(false).catch(() => {});
  }, delayMs);
}

/**
 * Inicializa o serviço completo de AutoSync e Realtime na aplicação.
 */
export function initAutoSyncService(): () => void {
  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // 1. Inicializa o canal entre abas do mesmo navegador
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    try {
      broadcastChannel = new BroadcastChannel("detran_cross_tab_sync");
      broadcastChannel.onmessage = (event) => {
        if (event.data) {
          handleIncomingMutation(event.data);
        }
      };
    } catch (e) {
      console.warn("BroadcastChannel não suportado neste ambiente:", e);
    }
  }

  // 2. Conecta ao Supabase Realtime (Broadcast + Postgres Changes)
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseClient();
      const channelName = "detran_realtime_broadcast";

      autoSyncChannel = client
        .channel(channelName, {
          config: {
            broadcast: { self: false },
            presence: { key: CLIENT_SESSION_ID }
          }
        })
        .on("broadcast", { event: "table_mutation" }, (event: any) => {
          if (event.payload) {
            handleIncomingMutation(event.payload);
          }
        })
        .on("presence", { event: "sync" }, () => {
          const presenceState = autoSyncChannel.presenceState();
          const count = Object.keys(presenceState).length || 1;
          updateState({ onlineMachinesCount: count });
        })
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            updateState({ activeChannel: true, status: "synced" });
            autoSyncChannel.track({
              client: CLIENT_SESSION_ID,
              online_at: new Date().toISOString()
            });
            // Executa verificação inicial de sincronia
            setTimeout(() => {
              reconcilePendingDifferences(false).catch(() => {});
            }, 1000);
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            updateState({ activeChannel: false });
          }
        });
    } catch (err) {
      console.warn("Erro ao inicializar canal Supabase Realtime:", err);
    }
  }

  // 3. Ouvinte global de alterações locais (disparado por notifyDataSync)
  const handleLocalSyncEvent = (e: any) => {
    const detail = e.detail;
    if (detail && detail.type) {
      // Se não for evento disparado por recepção remota, agenda upload automático
      if (!detail.fromRemote) {
        scheduleDebouncedReconciliation(1800);
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("detran_sync_updated", handleLocalSyncEvent);

    // Sincronizar ao voltar para a aba do navegador
    const handleFocus = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        reconcilePendingDifferences(false).catch(() => {});
      }
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleFocus);

    // Loop contínuo de verificação a cada 25 segundos
    autoSyncTimer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        reconcilePendingDifferences(false).catch(() => {});
      }
    }, 25000);
  }

  // Função de limpeza / descarte
  return () => {
    isInitialized = false;
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    if (debouncedMutationTimer) clearTimeout(debouncedMutationTimer);
    if (broadcastChannel) {
      try {
        broadcastChannel.close();
      } catch {}
      broadcastChannel = null;
    }
    if (autoSyncChannel && isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        client.removeChannel(autoSyncChannel);
      } catch {}
      autoSyncChannel = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("detran_sync_updated", handleLocalSyncEvent);
    }
  };
}

/**
 * Hook do React para consumir o estado da sincronização automática em tempo real.
 */
export function useAutoSync(): AutoSyncState {
  const [state, setState] = useState<AutoSyncState>(getAutoSyncState());

  useEffect(() => {
    return subscribeAutoSync((newState) => {
      setState({ ...newState });
    });
  }, []);

  return state;
}
