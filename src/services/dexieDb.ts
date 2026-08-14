import Dexie, { Table } from "dexie";
import { GeralCNH } from "../types";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface SyncStats {
  status: "synced" | "syncing" | "error" | "offline";
  lastSyncAt: string | null;
  totalRecords: number;
  syncDurationMs: number;
  errorMessage?: string;
  isOffline?: boolean;
}

export interface SyncMetaItem {
  key: string;
  value: any;
}

// Classe do Banco Dexie IndexedDB: ControleCNH
export class ControleCNHDatabase extends Dexie {
  geral!: Table<GeralCNH, string>;
  syncMeta!: Table<SyncMetaItem, string>;

  constructor() {
    super("ControleCNH");
    this.version(1).stores({
      geral: "id, ordem, nome, cpf, gaveta, reparticao, situacao, responsavel_nome, data_movimento, usuario_nome, updated_at, created_at",
      syncMeta: "key"
    });
  }
}

export const dexieDb = new ControleCNHDatabase();

// Objeto para notificar ouvintes sobre mudanças de status da sincronização
type SyncStatusCallback = (stats: SyncStats) => void;
const syncStatusListeners: Set<SyncStatusCallback> = new Set();

let currentSyncStats: SyncStats = {
  status: "synced",
  lastSyncAt: null,
  totalRecords: 0,
  syncDurationMs: 0,
  isOffline: false
};

export function subscribeSyncStatus(callback: SyncStatusCallback): () => void {
  syncStatusListeners.add(callback);
  callback(currentSyncStats);
  return () => {
    syncStatusListeners.delete(callback);
  };
}

function updateSyncStats(partial: Partial<SyncStats>) {
  currentSyncStats = { ...currentSyncStats, ...partial };
  for (const listener of syncStatusListeners) {
    try {
      listener(currentSyncStats);
    } catch (e) {
      console.warn("Erro em listener de sync:", e);
    }
  }
}

export async function getSyncStats(): Promise<SyncStats> {
  try {
    const metaLastSync = await dexieDb.syncMeta.get("last_sync_at");
    const metaCount = await dexieDb.syncMeta.get("total_records");
    const metaDuration = await dexieDb.syncMeta.get("last_duration_ms");
    const count = await dexieDb.geral.count();

    currentSyncStats = {
      ...currentSyncStats,
      lastSyncAt: metaLastSync?.value || currentSyncStats.lastSyncAt,
      totalRecords: count || metaCount?.value || 0,
      syncDurationMs: metaDuration?.value || currentSyncStats.syncDurationMs
    };
  } catch (e) {
    console.warn("Aviso ao carregar estatísticas do IndexedDB:", e);
  }
  return currentSyncStats;
}

// Salvar/Obter Metadata no IndexedDB
export async function setMeta(key: string, value: any) {
  try {
    await dexieDb.syncMeta.put({ key, value });
  } catch (e) {
    console.warn(`Erro ao salvar meta ${key}:`, e);
  }
}

export async function getMeta(key: string): Promise<any> {
  try {
    const item = await dexieDb.syncMeta.get(key);
    return item ? item.value : null;
  } catch (e) {
    return null;
  }
}

/**
 * Normaliza objetos do Supabase para ter campos updated_at e formatos corretos
 */
function normalizeCNHRecord(item: any): GeralCNH {
  const now = new Date().toISOString();
  return {
    id: item.id || `cnh-${item.ordem || Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    ordem: Number(item.ordem) || 0,
    memorando_id: item.memorando_id || undefined,
    candidato_id: item.candidato_id || undefined,
    nome: item.nome || "",
    cpf: item.cpf || "",
    telefone: item.telefone !== undefined && item.telefone !== null ? String(item.telefone) : "",
    notificado_whatsapp: item.notificado_whatsapp !== undefined ? Boolean(item.notificado_whatsapp) : undefined,
    notificado_at: item.notificado_at || undefined,
    gaveta: item.gaveta || "",
    reparticao: item.reparticao || "",
    situacao: item.situacao || "Remetida",
    responsavel_id: item.responsavel_id || undefined,
    responsavel_nome: item.responsavel_nome || item.responsavel || undefined,
    data_movimento: item.data_movimento || item.data || item.created_at || now,
    usuario_id: item.usuario_id || "sistema",
    usuario_nome: item.usuario_nome || item.usuario || "Agente DETRAN",
    memorando_numero: item.memorando_numero || undefined,
    remessa: item.remessa || undefined,
    observacao: item.observacao || item.obs || undefined,
    created_at: item.created_at || item.data_movimento || now,
    updated_at: item.updated_at || item.data_movimento || item.created_at || now
  };
}

/**
 * Executa a sincronização com o Supabase.
 * - Se o IndexedDB estiver vazio: realiza a Sincronização Inicial Completa paginada em blocos de 1.000 registros sem limites.
 * - Se já possuir registros: realiza a Sincronização Inteligente por Delta usando updated_at > ultima_data.
 */
export async function syncGeralWithSupabase(forceFull: boolean = false): Promise<SyncStats> {
  const startTime = Date.now();
  updateSyncStats({ status: "syncing", errorMessage: undefined });

  if (!isSupabaseConfigured()) {
    const localCount = await dexieDb.geral.count();
    const stats: SyncStats = {
      status: "offline",
      lastSyncAt: await getMeta("last_sync_at"),
      totalRecords: localCount,
      syncDurationMs: 0,
      isOffline: true,
      errorMessage: "Supabase não configurado. Utilizando base local."
    };
    updateSyncStats(stats);
    return stats;
  }

  try {
    const localCount = await dexieDb.geral.count();
    const isFirstRun = localCount === 0 || forceFull;

    if (isFirstRun) {
      console.log("🚀 [ControleCNH IndexedDB] Iniciando Primeira Sincronização Completa em lotes de 1.000...");
      let pageSize = 1000;
      let from = 0;
      let hasMore = true;
      let totalDownloaded = 0;

      while (hasMore) {
        const to = from + pageSize - 1;
        console.log(`📥 Baixando lote de CNHs ${from} até ${to}...`);

        const { data, error } = await supabase
          .from("geral_cnhs")
          .select("*")
          .order("ordem", { ascending: false })
          .range(from, to);

        if (error) {
          throw new Error(`Erro ao consultar Supabase (lote ${from}-${to}): ${error.message}`);
        }

        if (data && data.length > 0) {
          const records = data.map(normalizeCNHRecord);
          await dexieDb.geral.bulkPut(records);
          totalDownloaded += records.length;
          from += pageSize;

          // Atualiza contador em progresso
          updateSyncStats({ totalRecords: totalDownloaded });

          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      const syncTime = new Date().toISOString();
      const duration = Date.now() - startTime;

      await setMeta("last_sync_at", syncTime);
      await setMeta("total_records", totalDownloaded);
      await setMeta("last_duration_ms", duration);

      const finalStats: SyncStats = {
        status: "synced",
        lastSyncAt: syncTime,
        totalRecords: totalDownloaded,
        syncDurationMs: duration,
        isOffline: false
      };
      updateSyncStats(finalStats);
      console.log(`✅ [ControleCNH IndexedDB] Sincronização Completa finalizada: ${totalDownloaded} registros em ${duration}ms.`);
      return finalStats;
    } else {
      // Sincronização Inteligente por Delta (updated_at)
      console.log("⚡ [ControleCNH IndexedDB] Iniciando Sincronização Inteligente Delta...");

      // Buscar maior updated_at do IndexedDB
      let maxUpdatedAt: string | null = await getMeta("max_updated_at");

      if (!maxUpdatedAt) {
        // Encontrar maior data_movimento ou updated_at na base local
        const lastRecord = await dexieDb.geral.orderBy("updated_at").last();
        if (lastRecord && lastRecord.updated_at) {
          maxUpdatedAt = lastRecord.updated_at;
        }
      }

      let query = supabase.from("geral_cnhs").select("*");

      if (maxUpdatedAt) {
        query = query.gt("updated_at", maxUpdatedAt);
      }

      let { data: deltaData, error: deltaError } = await query;

      // Se der erro por falta da coluna updated_at na tabela remota, buscar por created_at ou ordenação
      if (deltaError && (deltaError.message.includes("updated_at") || deltaError.code === "42703")) {
        console.warn("Coluna updated_at não existe no Supabase. Realizando verificação de novos por created_at.");
        const lastCreatedRecord = await dexieDb.geral.orderBy("created_at").last();
        let fallbackQuery = supabase.from("geral_cnhs").select("*");
        if (lastCreatedRecord && lastCreatedRecord.created_at) {
          fallbackQuery = fallbackQuery.gt("created_at", lastCreatedRecord.created_at);
        }
        const fallbackRes = await fallbackQuery;
        deltaData = fallbackRes.data;
        deltaError = fallbackRes.error;
      }

      if (deltaError) {
        throw new Error(`Erro ao buscar delta no Supabase: ${deltaError.message}`);
      }

      if (deltaData && deltaData.length > 0) {
        const updatedRecords = deltaData.map(normalizeCNHRecord);
        await dexieDb.geral.bulkPut(updatedRecords);
        console.log(`🔄 [ControleCNH IndexedDB] Delta aplicado: ${updatedRecords.length} registros atualizados/inseridos.`);

        // Atualiza max_updated_at
        let newestDate = maxUpdatedAt;
        for (const rec of updatedRecords) {
          if (rec.updated_at && (!newestDate || rec.updated_at > newestDate)) {
            newestDate = rec.updated_at;
          }
        }
        if (newestDate) {
          await setMeta("max_updated_at", newestDate);
        }
      } else {
        console.log("✨ [ControleCNH IndexedDB] Nenhum registro novo/alterado encontrado.");
      }

      const syncTime = new Date().toISOString();
      const duration = Date.now() - startTime;
      const totalCount = await dexieDb.geral.count();

      await setMeta("last_sync_at", syncTime);
      await setMeta("total_records", totalCount);
      await setMeta("last_duration_ms", duration);

      const finalStats: SyncStats = {
        status: "synced",
        lastSyncAt: syncTime,
        totalRecords: totalCount,
        syncDurationMs: duration,
        isOffline: false
      };
      updateSyncStats(finalStats);
      return finalStats;
    }
  } catch (err: any) {
    console.warn("⚠️ Aviso de sincronização Supabase (modo offline):", err?.message || err);
    const localCount = await dexieDb.geral.count();
    const errorStats: SyncStats = {
      status: "offline",
      lastSyncAt: await getMeta("last_sync_at"),
      totalRecords: localCount,
      syncDurationMs: Date.now() - startTime,
      errorMessage: err?.message || "Sem conexão com o Supabase. Utilizando dados locais.",
      isOffline: true
    };
    updateSyncStats(errorStats);
    return errorStats;
  }
}

/**
 * Funções do CRUD e Persistência no IndexedDB + Supabase
 */

// Obter todos os registros da tabela geral do IndexedDB
export async function getLocalGeralCNHs(): Promise<GeralCNH[]> {
  try {
    const list = await dexieDb.geral.orderBy("ordem").reverse().toArray();
    return list;
  } catch (err) {
    console.warn("Erro ao buscar no IndexedDB:", err);
    return [];
  }
}

// Disparar evento global de sincronização
function notifySyncUpdated(type: string = "geral") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("detran_sync_updated", { detail: { type, timestamp: Date.now() } }));
  }
}

// Inserir ou atualizar um registro no IndexedDB (e Supabase se online)
export async function saveLocalGeralCNH(record: GeralCNH): Promise<void> {
  const normalized = normalizeCNHRecord(record);
  normalized.updated_at = new Date().toISOString();

  // 1. Salva no IndexedDB imediatamente
  await dexieDb.geral.put(normalized);

  // 2. Se o Supabase estiver configurado, envia para a nuvem
  if (isSupabaseConfigured()) {
    try {
      const payload: any = {
        id: normalized.id,
        ordem: normalized.ordem,
        nome: normalized.nome,
        cpf: normalized.cpf,
        telefone: normalized.telefone || null,
        gaveta: normalized.gaveta || "",
        reparticao: normalized.reparticao || "",
        situacao: normalized.situacao,
        responsavel_id: normalized.responsavel_id || null,
        responsavel_nome: normalized.responsavel_nome || null,
        data_movimento: normalized.data_movimento,
        usuario_id: normalized.usuario_id || null,
        usuario_nome: normalized.usuario_nome || null,
        memorando_numero: normalized.memorando_numero || null,
        remessa: normalized.remessa || null,
        observacao: normalized.observacao || null,
        memorando_id: normalized.memorando_id || null,
        candidato_id: normalized.candidato_id || null,
        created_at: normalized.created_at,
        updated_at: normalized.updated_at
      };

      if (normalized.notificado_whatsapp !== undefined) {
        payload.notificado_whatsapp = normalized.notificado_whatsapp;
      }
      if (normalized.notificado_at) {
        payload.notificado_at = normalized.notificado_at;
      }

      const { error } = await supabase.from("geral_cnhs").upsert(payload, { onConflict: "id" });
      if (error) {
        console.warn("Aviso ao sincronizar alteração com Supabase (tentando payload simplificado):", error.message);
        // Tentar payload sem chaves opcionais caso foreign keys falhem
        const fallbackPayload = {
          id: normalized.id,
          ordem: normalized.ordem,
          nome: normalized.nome,
          cpf: normalized.cpf,
          gaveta: normalized.gaveta || "",
          reparticao: normalized.reparticao || "",
          situacao: normalized.situacao,
          data_movimento: normalized.data_movimento,
          responsavel_nome: normalized.responsavel_nome || null,
          usuario_nome: normalized.usuario_nome || null,
          observacao: normalized.observacao || null,
          updated_at: normalized.updated_at
        };
        await supabase.from("geral_cnhs").upsert(fallbackPayload, { onConflict: "id" });
      }
    } catch (err) {
      console.warn("Erro ao enviar para Supabase:", err);
    }
  }

  // Atualiza metadados
  const count = await dexieDb.geral.count();
  updateSyncStats({ totalRecords: count });
  notifySyncUpdated("geral");
}

// Salvar múltiplos registros (ex: importação Excel/Lote)
export async function saveLocalGeralCNHsBulk(records: GeralCNH[]): Promise<void> {
  const now = new Date().toISOString();
  const normalized = records.map((r) => {
    const norm = normalizeCNHRecord(r);
    norm.updated_at = now;
    return norm;
  });

  // Save to Dexie
  await dexieDb.geral.bulkPut(normalized);

  // Save to Supabase
  if (isSupabaseConfigured()) {
    try {
      const payloads = normalized.map((r) => ({
        id: r.id,
        ordem: r.ordem,
        nome: r.nome,
        cpf: r.cpf,
        telefone: r.telefone || null,
        gaveta: r.gaveta || "",
        reparticao: r.reparticao || "",
        situacao: r.situacao,
        responsavel_id: r.responsavel_id || null,
        responsavel_nome: r.responsavel_nome || null,
        data_movimento: r.data_movimento,
        usuario_id: r.usuario_id || null,
        usuario_nome: r.usuario_nome || null,
        memorando_numero: r.memorando_numero || null,
        remessa: r.remessa || null,
        observacao: r.observacao || null,
        memorando_id: r.memorando_id || null,
        candidato_id: r.candidato_id || null,
        created_at: r.created_at,
        updated_at: r.updated_at
      }));

      // Send in chunks of 250
      for (let i = 0; i < payloads.length; i += 250) {
        const chunk = payloads.slice(i, i + 250);
        const { error } = await supabase.from("geral_cnhs").upsert(chunk, { onConflict: "id" });
        if (error) {
          console.warn("Aviso ao salvar lote no Supabase:", error.message);
        }
      }
    } catch (err) {
      console.warn("Erro ao salvar lote no Supabase:", err);
    }
  }

  const count = await dexieDb.geral.count();
  updateSyncStats({ totalRecords: count });
  notifySyncUpdated("geral");
}

// Excluir um registro localmente e no Supabase
export async function deleteLocalGeralCNH(id: string): Promise<void> {
  await dexieDb.geral.delete(id);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("geral_cnhs").delete().eq("id", id);
    } catch (err) {
      console.warn("Erro ao excluir do Supabase:", err);
    }
  }

  const count = await dexieDb.geral.count();
  updateSyncStats({ totalRecords: count });
  notifySyncUpdated("geral");
}

// Excluir múltiplos registros
export async function deleteLocalGeralCNHsBulk(ids: string[]): Promise<void> {
  await dexieDb.geral.bulkDelete(ids);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("geral_cnhs").delete().in("id", ids);
    } catch (err) {
      console.warn("Erro ao excluir lote do Supabase:", err);
    }
  }

  const count = await dexieDb.geral.count();
  updateSyncStats({ totalRecords: count });
  notifySyncUpdated("geral");
}
