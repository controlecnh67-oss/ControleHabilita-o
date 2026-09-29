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
import { 
  ensureBaseEntitiesSynced, 
  getValidRemoteFkCache, 
  sanitizeGeralCnhForSupabase 
} from "./fkSanitizerService";
import { notifyDataSync } from "./db";

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

    notifySyncUpdated("geral");
    notifyDataSync("geral", true);
  }

  // EXECUÇÃO 2: Local ➔ Nuvem (Dexie ➔ Supabase)
  if (idsToPush.length > 0) {
    onProgress?.("Sincronizando entidades base (usuários e responsáveis)...", updatedLocalCount, totalToProcess);
    await ensureBaseEntitiesSynced();
    const { validUserIds, validRespIds } = await getValidRemoteFkCache(true);

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

      // Auto-provisiona qualquer responsável referenciado que ainda não conste no cache do Supabase
      const unmappedResp = validRecords.filter(
        (c) => c.responsavel_id && !validRespIds.has(c.responsavel_id)
      );
      if (unmappedResp.length > 0) {
        try {
          const respUpserts = Array.from(
            new Map(
              unmappedResp.map((c) => [
                c.responsavel_id!,
                {
                  id: c.responsavel_id!,
                  nome: c.responsavel_nome || (c.responsavel_id === "a0000000-0000-0000-0000-000000000001" ? "PROPRIETÁRIO" : "RESPONSÁVEL"),
                  ativo: true
                }
              ])
            ).values()
          );
          await supabase.from("responsaveis").upsert(respUpserts, { onConflict: "id" });
          respUpserts.forEach((r) => validRespIds.add(r.id));
        } catch (e) {
          console.warn("Aviso ao auto-provisionar responsáveis na reconciliação:", e);
        }
      }

      // Sanitiza payloads aplicando regras estritas de integridade relacional
      const payloads = validRecords.map((r) => sanitizeGeralCnhForSupabase(r, validUserIds, validRespIds));

      let { error } = await supabase.from("geral_cnhs").upsert(payloads, { onConflict: "id" });

      // Se ocorreu violação de FK (23503) ou constraint referencial
      if (error && (error.code === "23503" || error.message?.includes("foreign key") || error.message?.includes("fkey"))) {
        console.warn("Aviso no upsert (FK constraint). Aplicando fallback seguro sem FKs conflitantes:", error.message);
        const safePayloads = payloads.map((p) => ({
          ...p,
          usuario_id: null,
          responsavel_id: p.responsavel_id && validRespIds.has(p.responsavel_id) ? p.responsavel_id : null,
          memorando_id: null,
          candidato_id: null
        }));
        const retry = await supabase.from("geral_cnhs").upsert(safePayloads, { onConflict: "id" });
        if (!retry.error) {
          error = null;
        } else {
          error = retry.error;
        }
      }

      // Se ainda persistir erro, executa gravação resiliente item a item
      if (error) {
        let savedInChunk = 0;
        let lastErr: any = null;
        for (const item of payloads) {
          const single = await supabase.from("geral_cnhs").upsert([item], { onConflict: "id" });
          if (!single.error) {
            savedInChunk++;
          } else {
            const safeItem = {
              ...item,
              usuario_id: null,
              responsavel_id: null,
              memorando_id: null,
              candidato_id: null
            };
            const retrySingle = await supabase.from("geral_cnhs").upsert([safeItem], { onConflict: "id" });
            if (!retrySingle.error) {
              savedInChunk++;
            } else {
              lastErr = retrySingle.error;
            }
          }
        }

        if (savedInChunk > 0) {
          updatedRemoteCount += savedInChunk;
        }
        if (savedInChunk < payloads.length) {
          const failed = payloads.length - savedInChunk;
          errors.push(`Falha ao gravar ${failed} registro(s) no lote: ${lastErr?.message || error.message}`);
          recordSyncError({
            table: "geral_cnhs",
            direction: "dexie_to_supabase",
            error: lastErr || error,
            actionTaken: `${savedInChunk} gravados com sucesso na nuvem; ${failed} preservados com segurança no IndexedDB local.`,
            recordsCount: failed
          });
        }
      } else {
        updatedRemoteCount += payloads.length;
      }
    }

    notifySyncUpdated("geral");
    notifyDataSync("geral", true);
  }

  // Notifica o sistema de que os dados foram atualizados
  notifySyncUpdated("geral");
  notifyDataSync("geral", true);

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

/**
 * Realiza a varredura e o alinhamento cirúrgico de forma 100% autônoma
 * entre o IndexedDB (Dexie) e o Supabase com base nos timestamps de alteração ('updated_at').
 */
export async function autoAlignDiscrepancies(
  onProgress?: (message: string) => void
): Promise<ReconcileResult | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    onProgress?.("Verificando diferenças entre banco local e nuvem (updated_at)...");
    const report = await detectDiscrepancies(onProgress);

    if (report.totalDiscrepancies === 0) {
      return {
        success: true,
        direction: "latest_timestamp",
        updatedLocalCount: 0,
        updatedRemoteCount: 0,
        totalProcessed: 0,
        durationMs: 0,
        errors: [],
        message: "Bancos local e nuvem já estão 100% alinhados."
      };
    }

    onProgress?.(`Alinhando cirurgicamente ${report.totalDiscrepancies} registro(s) divergente(s)...`);
    const result = await forceUnidirectionalReconciliation({
      direction: "latest_timestamp",
      report,
      onProgress
    });

    return result;
  } catch (err: any) {
    console.warn("Erro ao auto-alinhar discrepâncias:", err);
    return {
      success: false,
      direction: "latest_timestamp",
      updatedLocalCount: 0,
      updatedRemoteCount: 0,
      totalProcessed: 0,
      durationMs: 0,
      errors: [err.message || String(err)],
      message: "Falha durante o alinhamento automático."
    };
  }
}
