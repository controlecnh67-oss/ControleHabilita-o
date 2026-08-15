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

export class SyncConflictError extends Error {
  remoteRecord: GeralCNH;

  constructor(remoteRecord: GeralCNH) {
    super("Conflito de sincronização: o registro remoto foi alterado por outro usuário.");
    this.name = "SyncConflictError";
    this.remoteRecord = remoteRecord;
  }
}

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
  return () => syncStatusListeners.delete(callback);
}

function updateSyncStats(partial: Partial<SyncStats>) {
  currentSyncStats = { ...currentSyncStats, ...partial };
  for (const listener of syncStatusListeners) {
    try { listener(currentSyncStats); } catch (e) { console.warn("Erro em listener de sync:", e); }
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
  } catch (e) { console.warn("Aviso ao carregar estatísticas do IndexedDB:", e); }
  return currentSyncStats;
}

export async function setMeta(key: string, value: any) {
  try { await dexieDb.syncMeta.put({ key, value }); }
  catch (e) { console.warn(`Erro ao salvar meta ${key}:`, e); }
}

export async function getMeta(key: string): Promise<any> {
  try {
    const item = await dexieDb.syncMeta.get(key);
    return item ? item.value : null;
  } catch { return null; }
}

function normalizeCNHRecord(item: any): GeralCNH {
  const now = new Date().toISOString();
  return {
    id: item.id || `cnh-${item.ordem || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ordem: Number(item.ordem) || 0,
    memorando_id: item.memorando_id || undefined,
    candidato_id: item.candidato_id || undefined,
    nome: item.nome || "",
    cpf: item.cpf || "",
    telefone: item.telefone != null ? String(item.telefone) : "",
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

function getPendingMutations(): Array<{ record: GeralCNH; expectedUpdatedAt: string | null }> {
  return (currentPendingMutations as Array<{ record: GeralCNH; expectedUpdatedAt: string | null }>) || [];
}

let currentPendingMutations: Array<{ record: GeralCNH; expectedUpdatedAt: string | null }> = [];
let pendingLoaded = false;

async function loadPendingMutations() {
  if (pendingLoaded) return;
  const saved = await getMeta("pending_geral_mutations");
  currentPendingMutations = Array.isArray(saved) ? saved : [];
  pendingLoaded = true;
}

async function persistPendingMutations() {
  await setMeta("pending_geral_mutations", currentPendingMutations);
}

async function queuePendingMutation(record: GeralCNH, expectedUpdatedAt: string | null) {
  await loadPendingMutations();
  currentPendingMutations = currentPendingMutations.filter(p => p.record.id !== record.id);
  currentPendingMutations.push({ record, expectedUpdatedAt });
  await persistPendingMutations();
}

async function removePendingMutation(id: string) {
  await loadPendingMutations();
  currentPendingMutations = currentPendingMutations.filter(p => p.record.id !== id);
  await persistPendingMutations();
}

async function flushPendingMutations(): Promise<void> {
  await loadPendingMutations();
  if (!isSupabaseConfigured() || currentPendingMutations.length === 0) return;

  const pending = [...currentPendingMutations];
  for (const mutation of pending) {
    const { record, expectedUpdatedAt } = mutation;
    try {
      const { data: remote, error: readError } = await supabase
        .from("geral_cnhs")
        .select("*")
        .eq("id", record.id)
        .maybeSingle();
      if (readError) throw readError;

      if (remote && expectedUpdatedAt && remote.updated_at && remote.updated_at !== expectedUpdatedAt) {
        const authoritative = normalizeCNHRecord(remote);
        await dexieDb.geral.put(authoritative);
        await removePendingMutation(record.id);
        continue;
      }

      const payload = buildCNHPayload(record);
      let query = supabase.from("geral_cnhs").update(payload).eq("id", record.id);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const { data: saved, error } = await query.select("*").maybeSingle();
      if (error) throw error;

      if (!saved) {
        const { data: created, error: createError } = await supabase
          .from("geral_cnhs")
          .upsert(payload, { onConflict: "id" })
          .select("*")
          .single();
        if (createError) throw createError;
        await dexieDb.geral.put(normalizeCNHRecord(created));
      } else {
        await dexieDb.geral.put(normalizeCNHRecord(saved));
      }
      await removePendingMutation(record.id);
    } catch (error) {
      console.warn("Pendência de sincronização ainda não enviada:", error);
    }
  }
}

function buildCNHPayload(record: GeralCNH): Record<string, any> {
  const payload: Record<string, any> = {
    id: record.id,
    ordem: record.ordem,
    nome: record.nome,
    cpf: record.cpf,
    telefone: record.telefone || null,
    gaveta: record.gaveta || "",
    reparticao: record.reparticao || "",
    situacao: record.situacao,
    responsavel_id: record.responsavel_id || null,
    responsavel_nome: record.responsavel_nome || null,
    data_movimento: record.data_movimento,
    usuario_id: record.usuario_id || null,
    usuario_nome: record.usuario_nome || null,
    memorando_numero: record.memorando_numero || null,
    remessa: record.remessa || null,
    observacao: record.observacao || null,
    memorando_id: record.memorando_id || null,
    candidato_id: record.candidato_id || null,
    created_at: record.created_at
  };
  if (record.notificado_whatsapp !== undefined) payload.notificado_whatsapp = record.notificado_whatsapp;
  if (record.notificado_at) payload.notificado_at = record.notificado_at;
  return payload;
}

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
    await flushPendingMutations();
    const localCount = await dexieDb.geral.count();
    const isFirstRun = localCount === 0 || forceFull;

    if (isFirstRun) {
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      let totalDownloaded = 0;
      while (hasMore) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("geral_cnhs")
          .select("*")
          .order("ordem", { ascending: false })
          .range(from, to);
        if (error) throw new Error(`Erro ao consultar Supabase (${from}-${to}): ${error.message}`);
        if (!data?.length) break;
        const records = data.map(normalizeCNHRecord);
        await dexieDb.geral.bulkPut(records);
        totalDownloaded += records.length;
        from += pageSize;
        updateSyncStats({ totalRecords: totalDownloaded });
        hasMore = data.length === pageSize;
      }
      const syncTime = new Date().toISOString();
      const duration = Date.now() - startTime;
      const max = await dexieDb.geral.orderBy("updated_at").last();
      if (max?.updated_at) await setMeta("max_updated_at", max.updated_at);
      await setMeta("last_sync_at", syncTime);
      await setMeta("total_records", totalDownloaded);
      await setMeta("last_duration_ms", duration);
      const finalStats: SyncStats = { status: "synced", lastSyncAt: syncTime, totalRecords: totalDownloaded, syncDurationMs: duration, isOffline: false };
      updateSyncStats(finalStats);
      return finalStats;
    }

    let maxUpdatedAt: string | null = await getMeta("max_updated_at");
    if (!maxUpdatedAt) {
      const lastRecord = await dexieDb.geral.orderBy("updated_at").last();
      maxUpdatedAt = lastRecord?.updated_at || null;
    }

    let query = supabase.from("geral_cnhs").select("*");
    if (maxUpdatedAt) query = query.gt("updated_at", maxUpdatedAt);
    const { data, error } = await query;
    if (error) throw new Error(`Erro ao buscar delta no Supabase: ${error.message}`);

    if (data?.length) {
      const records = data.map(normalizeCNHRecord);
      await dexieDb.geral.bulkPut(records);
      const newest = records.reduce<string | null>((acc, r) => !acc || r.updated_at > acc ? r.updated_at : acc, maxUpdatedAt);
      if (newest) await setMeta("max_updated_at", newest);
    }

    const syncTime = new Date().toISOString();
    const duration = Date.now() - startTime;
    const totalCount = await dexieDb.geral.count();
    await setMeta("last_sync_at", syncTime);
    await setMeta("total_records", totalCount);
    await setMeta("last_duration_ms", duration);
    const finalStats: SyncStats = { status: "synced", lastSyncAt: syncTime, totalRecords: totalCount, syncDurationMs: duration, isOffline: false };
    updateSyncStats(finalStats);
    return finalStats;
  } catch (err: any) {
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

export async function getLocalGeralCNHs(): Promise<GeralCNH[]> {
  try { return await dexieDb.geral.orderBy("ordem").reverse().toArray(); }
  catch (err) { console.warn("Erro ao buscar no IndexedDB:", err); return []; }
}

function notifySyncUpdated(type: string = "geral") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("detran_sync_updated", { detail: { type, timestamp: Date.now() } }));
  }
}

export async function saveLocalGeralCNH(record: GeralCNH): Promise<void> {
  const local = normalizeCNHRecord(record);
  const existing = await dexieDb.geral.get(local.id);
  const expectedUpdatedAt = existing?.updated_at || record.updated_at || null;

  if (isSupabaseConfigured()) {
    try {
      const { data: remote, error: readError } = await supabase
        .from("geral_cnhs")
        .select("*")
        .eq("id", local.id)
        .maybeSingle();
      if (readError) throw readError;

      if (remote && expectedUpdatedAt && remote.updated_at && remote.updated_at !== expectedUpdatedAt) {
        const authoritative = normalizeCNHRecord(remote);
        await dexieDb.geral.put(authoritative);
        updateSyncStats({ totalRecords: await dexieDb.geral.count() });
        notifySyncUpdated("geral");
        throw new SyncConflictError(authoritative);
      }

      const payload = buildCNHPayload(local);
      let updateQuery = supabase.from("geral_cnhs").update(payload).eq("id", local.id);
      if (remote && expectedUpdatedAt) updateQuery = updateQuery.eq("updated_at", expectedUpdatedAt);
      const { data: saved, error } = await updateQuery.select("*").maybeSingle();
      if (error) throw error;

      if (!saved) {
        const { data: created, error: createError } = await supabase
          .from("geral_cnhs")
          .upsert(payload, { onConflict: "id" })
          .select("*")
          .single();
        if (createError) throw createError;
        await dexieDb.geral.put(normalizeCNHRecord(created));
      } else {
        await dexieDb.geral.put(normalizeCNHRecord(saved));
      }
      await removePendingMutation(local.id);
    } catch (err) {
      if (err instanceof SyncConflictError) throw err;
      await dexieDb.geral.put(local);
      await queuePendingMutation(local, expectedUpdatedAt);
      updateSyncStats({ status: "offline", isOffline: true, errorMessage: "Alteração salva localmente e aguardando sincronização." });
      notifySyncUpdated("geral");
      return;
    }
  } else {
    await dexieDb.geral.put({ ...local, updated_at: new Date().toISOString() });
    await queuePendingMutation(local, expectedUpdatedAt);
  }

  const count = await dexieDb.geral.count();
  updateSyncStats({ totalRecords: count });
  notifySyncUpdated("geral");
}

export async function saveLocalGeralCNHsBulk(records: GeralCNH[]): Promise<void> {
  for (const record of records) await saveLocalGeralCNH(record);
}

export async function deleteLocalGeralCNH(id: string): Promise<void> {
  await dexieDb.geral.delete(id);
  if (isSupabaseConfigured()) {
    try { await supabase.from("geral_cnhs").delete().eq("id", id); }
    catch (err) { console.warn("Erro ao excluir do Supabase:", err); }
  }
  await removePendingMutation(id);
  updateSyncStats({ totalRecords: await dexieDb.geral.count() });
  notifySyncUpdated("geral");
}

export async function deleteLocalGeralCNHsBulk(ids: string[]): Promise<void> {
  await dexieDb.geral.bulkDelete(ids);
  if (isSupabaseConfigured()) {
    try { await supabase.from("geral_cnhs").delete().in("id", ids); }
    catch (err) { console.warn("Erro ao excluir lote do Supabase:", err); }
  }
  for (const id of ids) await removePendingMutation(id);
  updateSyncStats({ totalRecords: await dexieDb.geral.count() });
  notifySyncUpdated("geral");
}
