/**
 * Serviço de Detecção e Re-sincronização Unidirecional de Discrepâncias
 * Compara registros entre o IndexedDB (Dexie) e o Supabase com base no timestamp
 * da coluna 'updated_at', permitindo alinhamento cirúrgico unidirecional sem recargas cegas.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { dexieDb, normalizeCNHRecord, notifySyncUpdated } from "./dexieDb";
import { recordSyncError } from "./syncErrorService";
import { trackEgress } from "./egressMonitorService";
import { GeralCNH } from "../types";

export type ReconcileDirection = "supabase_to_dexie" | "dexie_to_supabase" | "latest_timestamp";

export interface DiscrepancyItem {
  id: string;
  nome: string;
  ordem: number;
  cpf?: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  status: "remote_newer" | "local_newer" | "only_remote" | "only_local";
  diffSeconds: number;
}

export interface DiscrepancyReport {
  totalLocal: number;
  totalRemote: number;
  inSyncCount: number;
  remoteNewerCount: number;
  localNewerCount: number;
  onlyInRemoteCount: number;
  onlyInLocalCount: number;
  totalDiscrepancies: number;
  remoteNewerIds: string[];
  localNewerIds: string[];
  onlyInRemoteIds: string[];
  onlyInLocalIds: string[];
  items: DiscrepancyItem[];
  scannedAt: string;
}

export interface ReconcileResult {
  success: boolean;
  direction: ReconcileDirection;
  updatedLocalCount: number;
  updatedRemoteCount: number;
  totalProcessed: number;
  durationMs: number;
  errors: string[];
  message: string;
}

/**
 * Realiza a varredura e comparação de todos os registros entre o Dexie e o Supabase
 * baseado no timestamp da coluna 'updated_at'.
 */
export async function detectDiscrepancies(
  onProgress?: (message: string) => void
): Promise<DiscrepancyReport> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não está configurado.");
  }

  const startTime = Date.now();
  onProgress?.("Consultando registros locais no IndexedDB (Dexie)...");

  // 1. Carrega registros do Dexie
  const localList = await dexieDb.geral.toArray();
  const localMap = new Map<string, GeralCNH>();
  for (const item of localList) {
    if (item.id) localMap.set(item.id, item);
  }

  onProgress?.(`Local: ${localList.length} registros. Consultando Supabase...`);

  // 2. Consulta id, updated_at, ordem, nome, cpf do Supabase com paginação eficiente
  const remoteMap = new Map<string, { id: string; updated_at?: string; ordem: number; nome: string; cpf?: string }>();
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    onProgress?.(`Baixando metadados da nuvem (linhas ${from + 1} a ${from + pageSize})...`);
    const { data, error } = await supabase
      .from("geral_cnhs")
      .select("id, updated_at, ordem, nome, cpf")
      .order("ordem", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      recordSyncError({
        table: "geral_cnhs",
        direction: "supabase_to_dexie",
        error,
        actionTaken: "Falha ao escanear metadados de updated_at para detecção de discrepâncias."
      });
      throw new Error(`Erro ao consultar Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.id) remoteMap.set(row.id, row);
    }

    if (data.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  trackEgress(
    "geral_cnhs",
    "SELECT",
    remoteMap.size * 60,
    false,
    Date.now() - startTime,
    `Varredura de discrepâncias (updated_at): ${remoteMap.size} linhas analisadas`
  );

  onProgress?.("Comparando timestamps da coluna 'updated_at'...");

  // 3. Comparação de timestamps
  const remoteNewerIds: string[] = [];
  const localNewerIds: string[] = [];
  const onlyInRemoteIds: string[] = [];
  const onlyInLocalIds: string[] = [];
  const items: DiscrepancyItem[] = [];
  let inSyncCount = 0;

  const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && remote) {
      const timeLocal = local.updated_at ? new Date(local.updated_at).getTime() : 0;
      const timeRemote = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
      const diffSeconds = Math.round(Math.abs(timeRemote - timeLocal) / 1000);

      // Tolerância de 1 segundo para variações de relógio
      if (diffSeconds > 1) {
        if (timeRemote > timeLocal) {
          remoteNewerIds.push(id);
          items.push({
            id,
            nome: remote.nome || local.nome || "Não informado",
            ordem: Number(remote.ordem || local.ordem) || 0,
            cpf: remote.cpf || local.cpf,
            localUpdatedAt: local.updated_at,
            remoteUpdatedAt: remote.updated_at,
            status: "remote_newer",
            diffSeconds
          });
        } else {
          localNewerIds.push(id);
          items.push({
            id,
            nome: local.nome || remote.nome || "Não informado",
            ordem: Number(local.ordem || remote.ordem) || 0,
            cpf: local.cpf || remote.cpf,
            localUpdatedAt: local.updated_at,
            remoteUpdatedAt: remote.updated_at,
            status: "local_newer",
            diffSeconds
          });
        }
      } else {
        inSyncCount++;
      }
    } else if (remote && !local) {
      onlyInRemoteIds.push(id);
      items.push({
        id,
        nome: remote.nome || "Não informado",
        ordem: Number(remote.ordem) || 0,
        cpf: remote.cpf,
        remoteUpdatedAt: remote.updated_at,
        status: "only_remote",
        diffSeconds: 0
      });
    } else if (local && !remote) {
      onlyInLocalIds.push(id);
      items.push({
        id,
        nome: local.nome || "Não informado",
        ordem: Number(local.ordem) || 0,
        cpf: local.cpf,
        localUpdatedAt: local.updated_at,
        status: "only_local",
        diffSeconds: 0
      });
    }
  }

  // Ordena itens pela ordem e maior diferença
  items.sort((a, b) => b.diffSeconds - a.diffSeconds || a.ordem - b.ordem);

  const totalDiscrepancies = remoteNewerIds.length + localNewerIds.length + onlyInRemoteIds.length + onlyInLocalIds.length;

  return {
    totalLocal: localList.length,
    totalRemote: remoteMap.size,
    inSyncCount,
    remoteNewerCount: remoteNewerIds.length,
    localNewerCount: localNewerIds.length,
    onlyInRemoteCount: onlyInRemoteIds.length,
    onlyInLocalCount: onlyInLocalIds.length,
    totalDiscrepancies,
    remoteNewerIds,
    localNewerIds,
    onlyInRemoteIds,
    onlyInLocalIds,
    items,
    scannedAt: new Date().toISOString()
  };
}

/**
 * Executa a re-sincronização unidirecional dos registros discrepantes detectados
 * baseando-se no timestamp da coluna 'updated_at'.
 */
export async function forceUnidirectionalReconciliation(params: {
  direction: ReconcileDirection;
  report: DiscrepancyReport;
  onProgress?: (message: string, current: number, total: number) => void;
}): Promise<ReconcileResult> {
  const { direction, report, onProgress } = params;
  const startTime = Date.now();
  const errors: string[] = [];
  let updatedLocalCount = 0;
  let updatedRemoteCount = 0;

  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não está configurado.");
  }

  // 1. Direção: Nuvem ➔ Local (Supabase ➔ Dexie)
  // Baixa os registros onde o Supabase está mais recente ou novos na nuvem
  const shouldSyncToLocal = direction === "supabase_to_dexie" || direction === "latest_timestamp";
  const idsToPull = shouldSyncToLocal
    ? [...report.remoteNewerIds, ...report.onlyInRemoteIds]
    : [];

  // 2. Direção: Local ➔ Nuvem (Dexie ➔ Supabase)
  // Envia os registros onde o Dexie local está mais recente ou novos localmente
  const shouldSyncToRemote = direction === "dexie_to_supabase" || direction === "latest_timestamp";
  const idsToPush = shouldSyncToRemote
    ? [...report.localNewerIds, ...report.onlyInLocalIds]
    : [];

  const totalToProcess = idsToPull.length + idsToPush.length;

  if (totalToProcess === 0) {
    return {
      success: true,
      direction,
      updatedLocalCount: 0,
      updatedRemoteCount: 0,
      totalProcessed: 0,
      durationMs: Date.now() - startTime,
      errors: [],
      message: "Nenhum registro discrepante elegível para a direção selecionada."
    };
  }

  // EXECUÇÃO 1: Nuvem ➔ Local (Supabase ➔ Dexie)
  if (idsToPull.length > 0) {
    onProgress?.("Baixando registros mais recentes da nuvem para o IndexedDB...", 0, totalToProcess);

    const pullChunkSize = 200;
    for (let i = 0; i < idsToPull.length; i += pullChunkSize) {
      const chunkIds = idsToPull.slice(i, i + pullChunkSize);
      onProgress?.(
        `Baixando lote ${Math.floor(i / pullChunkSize) + 1} de ${Math.ceil(idsToPull.length / pullChunkSize)} (Supabase ➔ Dexie)...`,
        i,
        totalToProcess
      );

      const { data, error } = await supabase
        .from("geral_cnhs")
        .select("*")
        .in("id", chunkIds);

      if (error) {
        errors.push(`Falha ao buscar lote da nuvem: ${error.message}`);
        recordSyncError({
          table: "geral_cnhs",
          direction: "supabase_to_dexie",
          error,
          actionTaken: "Tentativa de re-sincronização unidirecional falhou no lote."
        });
        continue;
      }

      if (data && data.length > 0) {
        const normalized = data.map(normalizeCNHRecord);
        await dexieDb.geral.bulkPut(normalized);
        updatedLocalCount += normalized.length;
      }
    }
  }

  // EXECUÇÃO 2: Local ➔ Nuvem (Dexie ➔ Supabase)
  if (idsToPush.length > 0) {
    onProgress?.("Enviando registros mais recentes do Dexie para a nuvem...", updatedLocalCount, totalToProcess);

    const pushChunkSize = 100;
    for (let i = 0; i < idsToPush.length; i += pushChunkSize) {
      const chunkIds = idsToPush.slice(i, i + pushChunkSize);
      onProgress?.(
        `Enviando lote ${Math.floor(i / pushChunkSize) + 1} de ${Math.ceil(idsToPush.length / pushChunkSize)} (Dexie ➔ Supabase)...`,
        updatedLocalCount + i,
        totalToProcess
      );

      const records = await dexieDb.geral.bulkGet(chunkIds);
      const validRecords = records.filter(Boolean) as GeralCNH[];

      if (validRecords.length === 0) continue;

      const payloads = validRecords.map((r) => ({
        id: r.id,
        ordem: Number(r.ordem) || 0,
        nome: (r.nome || "").trim().toUpperCase(),
        cpf: r.cpf || null,
        pa: r.pa || null,
        gaveta: r.gaveta || "",
        reparticao: r.reparticao || "",
        situacao: r.situacao,
        responsavel_id: r.responsavel_id || null,
        responsavel_nome: r.responsavel_nome || null,
        data_movimento: r.data_movimento || new Date().toISOString(),
        usuario_id: r.usuario_id || null,
        usuario_nome: r.usuario_nome || null,
        memorando_numero: r.memorando_numero || null,
        remessa: r.remessa || null,
        lote: r.lote || null,
        observacao: r.observacao || null,
        created_at: r.created_at,
        updated_at: r.updated_at || new Date().toISOString()
      }));

      const { error } = await supabase.from("geral_cnhs").upsert(payloads, { onConflict: "id" });

      if (error) {
        errors.push(`Falha ao gravar lote na nuvem: ${error.message}`);
        recordSyncError({
          table: "geral_cnhs",
          direction: "dexie_to_supabase",
          error,
          actionTaken: "Re-sincronização unidirecional local->nuvem teve erro no lote.",
          recordsCount: payloads.length
        });
      } else {
        updatedRemoteCount += payloads.length;
      }
    }
  }

  // Notifica o sistema de que os dados foram atualizados
  notifySyncUpdated("geral");

  const durationMs = Date.now() - startTime;
  const dirLabel =
    direction === "supabase_to_dexie"
      ? "Nuvem ➔ Local (Supabase ➔ Dexie)"
      : direction === "dexie_to_supabase"
      ? "Local ➔ Nuvem (Dexie ➔ Supabase)"
      : "Automática pelo 'updated_at' Mais Recente";

  return {
    success: errors.length === 0,
    direction,
    updatedLocalCount,
    updatedRemoteCount,
    totalProcessed: updatedLocalCount + updatedRemoteCount,
    durationMs,
    errors,
    message: `Re-sincronização unidirecional [${dirLabel}] concluída em ${durationMs}ms. ${updatedLocalCount} registro(s) atualizado(s) no Dexie e ${updatedRemoteCount} no Supabase.`
  };
}
