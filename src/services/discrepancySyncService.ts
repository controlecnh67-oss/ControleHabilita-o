/**
 * Serviço de Detecção e Re-sincronização Unidirecional de Discrepâncias
 * Compara registros entre o IndexedDB (Dexie) e o Supabase com base no timestamp
 * da coluna 'updated_at', permitindo alinhamento cirúrgico unidirecional sem recargas cegas.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { dexieDb, normalizeCNHRecord, notifySyncUpdated, getDeletedGeralIds } from "./dexieDb";
import { recordSyncError } from "./syncErrorService";
import { trackEgress } from "./egressMonitorService";
import { 
  GeralCNH, 
  Usuario, 
  Responsavel, 
  MapeamentoLocalizacao, 
  Memorando, 
  Candidato, 
  Lote, 
  Declaracao, 
  HistoricoMovimentacao, 
  Auditoria 
} from "../types";
import { 
  ensureBaseEntitiesSynced, 
  getValidRemoteFkCache, 
  sanitizeGeralCnhForSupabase,
  cleanFK,
  toValidUUID
} from "./fkSanitizerService";
import { 
  notifyDataSync, 
  getStoredList, 
  saveStoredList, 
  idbGet,
  idbSet, 
  getDeletedIds, 
  getAcessosCidadaoLogs 
} from "./db";
import { 
  getOrgaoConfig, 
  saveOrgaoConfig 
} from "./orgaoService";

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

      // Se ocorreu violação de FK (23503), formato UUID (22P02) ou constraint referencial
      if (error && (
        error.code === "23503" || 
        error.code === "22P02" || 
        error.message?.includes("foreign key") || 
        error.message?.includes("uuid") || 
        error.message?.includes("fkey")
      )) {
        console.warn("Aviso no upsert (FK ou UUID constraint). Aplicando fallback seguro sem FKs conflitantes e com UUID determinístico:", error.message);
        const safePayloads = payloads.map((p) => ({
          ...p,
          id: toValidUUID(p.id) || p.id,
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
          const safeItemBase = {
            ...item,
            id: toValidUUID(item.id) || item.id
          };
          const single = await supabase.from("geral_cnhs").upsert([safeItemBase], { onConflict: "id" });
          if (!single.error) {
            savedInChunk++;
          } else {
            const safeItem = {
              ...safeItemBase,
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

export interface AllTablesSyncResult {
  success: boolean;
  totalTables: number;
  alignedTablesCount: number;
  totalCreatedRemote: number;
  totalCreatedLocal: number;
  totalUpdatedRemote: number;
  totalUpdatedLocal: number;
  totalDeletedRemote: number;
  totalDeletedLocal: number;
  durationMs: number;
  errors: string[];
  message: string;
}

/**
 * Realiza o alinhamento cirúrgico de TODAS as 13 tabelas da aplicação
 * cobrindo todas as ações CRUD (Create, Read, Update, Delete) com base
 * nos timestamps 'updated_at' / 'data_hora' sem requerer ação manual do usuário.
 */
export async function autoAlignAllTablesCRUD(
  onProgress?: (msg: string) => void
): Promise<AllTablesSyncResult> {
  const startTime = Date.now();
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      totalTables: 0,
      alignedTablesCount: 0,
      totalCreatedRemote: 0,
      totalCreatedLocal: 0,
      totalUpdatedRemote: 0,
      totalUpdatedLocal: 0,
      totalDeletedRemote: 0,
      totalDeletedLocal: 0,
      durationMs: 0,
      errors: ["Supabase não configurado"],
      message: "Supabase não está configurado."
    };
  }

  let totalCreatedRemote = 0;
  let totalCreatedLocal = 0;
  let totalUpdatedRemote = 0;
  let totalUpdatedLocal = 0;
  let totalDeletedRemote = 0;
  let totalDeletedLocal = 0;
  const errors: string[] = [];

  onProgress?.("Iniciando auto-sincronização cirúrgica de todas as tabelas (CRUD)...");

  // PASSO 0: Assegurar entidades fundamentais (Usuários e Responsáveis base)
  try {
    await ensureBaseEntitiesSynced();
  } catch (err: any) {
    console.warn("Aviso ao sincronizar entidades base:", err);
  }

  const { validUserIds, validRespIds } = await getValidRemoteFkCache(true);

  // Helper para buscar todas as linhas de uma tabela com paginação
  async function fetchRemoteTable(table: string, selectCols = "*"): Promise<any[]> {
    const rows: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(table)
        .select(selectCols)
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(`Erro ao buscar dados da tabela '${table}': ${error.message}`);
      }

      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }
    return rows;
  }

  // Helper para deletar em lotes do Supabase (Ação CRUD: Delete)
  async function deleteRemoteInBatches(table: string, ids: string[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const { error } = await supabase.from(table).delete().in("id", batch);
      if (!error) {
        count += batch.length;
      } else {
        console.warn(`Aviso ao excluir em lote de '${table}':`, error.message);
      }
    }
    return count;
  }

  // Helper para upsert em lotes no Supabase (Ação CRUD: Create / Update)
  async function upsertRemoteInBatches(table: string, records: any[], batchSize = 100): Promise<number> {
    if (!records || records.length === 0) return 0;
    let saved = 0;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
      if (error) {
        // Fallback resiliente item a item
        for (const item of batch) {
          const res = await supabase.from(table).upsert([item], { onConflict: "id" });
          if (!res.error) {
            saved++;
          }
        }
      } else {
        saved += batch.length;
      }
    }
    return saved;
  }

  // =========================================================================
  // 1. USUÁRIOS (CRUD + updated_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [1/13] Usuários...");
    const deletedUserIds = getDeletedIds("usuarios");
    if (deletedUserIds.size > 0) {
      const delCount = await deleteRemoteInBatches("usuarios", Array.from(deletedUserIds));
      totalDeletedRemote += delCount;
    }

    const localUsers = getStoredList<Usuario>("usuarios", []).filter((u) => !deletedUserIds.has(u.id));
    const remoteUsers = await fetchRemoteTable("usuarios");

    const localMap = new Map(localUsers.map((u) => [u.id, u]));
    const remoteMap = new Map(remoteUsers.map((u: any) => [u.id, u]));

    const usersToPush: any[] = [];
    const usersToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      const remote = remoteMap.get(id);
      if (!remote) {
        // CREATE no remote
        usersToPush.push(local);
      } else {
        // UPDATE baseado no timestamp mais recente
        const localTime = local.updated_at ? new Date(local.updated_at).getTime() : (local.created_at ? new Date(local.created_at).getTime() : 0);
        const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : (remote.created_at ? new Date(remote.created_at).getTime() : 0);
        if (remoteTime > localTime + 1000) {
          usersToKeepLocal.set(id, { ...local, ...remote });
          totalUpdatedLocal++;
        } else if (localTime > remoteTime + 1000) {
          usersToPush.push(local);
          totalUpdatedRemote++;
        }
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id) && !deletedUserIds.has(id)) {
        // CREATE no local
        usersToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (usersToPush.length > 0) {
      const payload = usersToPush.map((u) => ({
        id: u.id,
        nome: u.nome,
        nome_curto: u.nome_curto,
        fone: u.fone || null,
        email: u.email,
        funcao: u.funcao || null,
        setor: u.setor || "Protocolo",
        login: u.login,
        perfil: u.perfil,
        permissoes: u.permissoes || [],
        ativo: u.ativo !== false,
        created_at: u.created_at || new Date().toISOString(),
        updated_at: u.updated_at || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("usuarios", payload);
      totalCreatedRemote += pushed;
    }

    const mergedUsers = Array.from(usersToKeepLocal.values());
    saveStoredList("usuarios", mergedUsers);
    await idbSet("detran_cnh_usuarios", mergedUsers);
    mergedUsers.forEach((u) => validUserIds.add(u.id));
    notifyDataSync("usuarios", true);
  } catch (err: any) {
    errors.push(`Usuários: ${err.message}`);
  }

  // =========================================================================
  // 2. RESPONSÁVEIS (CRUD + updated_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [2/13] Responsáveis e CFCs...");
    const deletedRespIds = getDeletedIds("responsaveis");
    deletedRespIds.delete("a0000000-0000-0000-0000-000000000001");
    if (deletedRespIds.size > 0) {
      const delCount = await deleteRemoteInBatches("responsaveis", Array.from(deletedRespIds));
      totalDeletedRemote += delCount;
    }

    const localResp = getStoredList<Responsavel>("responsaveis", []).filter((r) => !deletedRespIds.has(r.id));
    const remoteResp = await fetchRemoteTable("responsaveis");

    const localMap = new Map(localResp.map((r) => [r.id, r]));
    const remoteMap = new Map(remoteResp.map((r: any) => [r.id, r]));

    const respToPush: any[] = [];
    const respToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      const remote = remoteMap.get(id);
      if (!remote) {
        respToPush.push(local);
      } else {
        const localTime = local.updated_at ? new Date(local.updated_at).getTime() : (local.created_at ? new Date(local.created_at).getTime() : 0);
        const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : (remote.created_at ? new Date(remote.created_at).getTime() : 0);
        if (remoteTime > localTime + 1000) {
          respToKeepLocal.set(id, { ...local, ...remote });
          totalUpdatedLocal++;
        } else if (localTime > remoteTime + 1000) {
          respToPush.push(local);
          totalUpdatedRemote++;
        }
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id) && !deletedRespIds.has(id)) {
        respToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (respToPush.length > 0) {
      const payload = respToPush.map((r) => ({
        id: r.id,
        nome: r.nome,
        tipo: r.tipo || "Despachante",
        cpf: r.cpf || "",
        telefone: r.telefone || null,
        registro: r.registro || null,
        observacao: r.observacao || null,
        ativo: r.ativo !== false,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("responsaveis", payload);
      totalCreatedRemote += pushed;
    }

    const mergedResp = Array.from(respToKeepLocal.values());
    saveStoredList("responsaveis", mergedResp);
    await idbSet("detran_cnh_responsaveis", mergedResp);
    mergedResp.forEach((r) => validRespIds.add(r.id));
    notifyDataSync("responsaveis", true);
  } catch (err: any) {
    errors.push(`Responsáveis: ${err.message}`);
  }

  // =========================================================================
  // 3. MAPEAMENTO DE LOCALIZAÇÃO (CRUD + updated_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [3/13] Mapeamento de Arquivo (A-Z)...");
    const deletedMapIds = getDeletedIds("mapeamento");
    if (deletedMapIds.size > 0) {
      const delCount = await deleteRemoteInBatches("mapeamento_localizacao", Array.from(deletedMapIds));
      totalDeletedRemote += delCount;
    }

    const localMapList = getStoredList<MapeamentoLocalizacao>("mapeamento", []).filter((m) => !deletedMapIds.has(m.id));
    const remoteMapList = await fetchRemoteTable("mapeamento_localizacao");

    const localMap = new Map(localMapList.map((m) => [m.id, m]));
    const remoteMap = new Map(remoteMapList.map((m: any) => [m.id, m]));

    const mapToPush: any[] = [];
    const mapToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      const remote = remoteMap.get(id);
      if (!remote) {
        mapToPush.push(local);
      } else {
        const localTime = local.updated_at ? new Date(local.updated_at).getTime() : 0;
        const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        if (remoteTime > localTime + 1000) {
          mapToKeepLocal.set(id, { ...local, ...remote });
          totalUpdatedLocal++;
        } else if (localTime > remoteTime + 1000) {
          mapToPush.push(local);
          totalUpdatedRemote++;
        }
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id) && !deletedMapIds.has(id)) {
        mapToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (mapToPush.length > 0) {
      const payload = mapToPush.map((m) => ({
        id: m.id,
        inicial: m.inicial,
        gaveta: m.gaveta,
        reparticao: m.reparticao,
        ativo: m.ativo !== false,
        created_at: m.created_at || new Date().toISOString(),
        updated_at: m.updated_at || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("mapeamento_localizacao", payload);
      totalCreatedRemote += pushed;
    }

    const mergedMap = Array.from(mapToKeepLocal.values());
    saveStoredList("mapeamento", mergedMap);
    await idbSet("detran_cnh_mapeamento", mergedMap);
    notifyDataSync("mapeamento", true);
  } catch (err: any) {
    errors.push(`Mapeamento: ${err.message}`);
  }

  // =========================================================================
  // 4. MEMORANDOS (CRUD + updated_at)
  // =========================================================================
  const validMemoIds = new Set<string>();
  try {
    onProgress?.("Alinhando [4/13] Memorandos e Remessas...");
    const deletedMemoIds = getDeletedIds("memorandos");
    if (deletedMemoIds.size > 0) {
      const delCount = await deleteRemoteInBatches("memorandos", Array.from(deletedMemoIds));
      totalDeletedRemote += delCount;
    }

    const localMemos = getStoredList<Memorando>("memorandos", []).filter((m) => !deletedMemoIds.has(m.id));
    const remoteMemos = await fetchRemoteTable("memorandos");

    const localMap = new Map(localMemos.map((m) => [m.id, m]));
    const remoteMap = new Map(remoteMemos.map((m: any) => [m.id, m]));

    const memosToPush: any[] = [];
    const memosToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      const remote = remoteMap.get(id);
      if (!remote) {
        memosToPush.push(local);
      } else {
        const localTime = local.updated_at ? new Date(local.updated_at).getTime() : (local.created_at ? new Date(local.created_at).getTime() : 0);
        const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : (remote.created_at ? new Date(remote.created_at).getTime() : 0);
        if (remoteTime > localTime + 1000) {
          memosToKeepLocal.set(id, { ...local, ...remote });
          totalUpdatedLocal++;
        } else if (localTime > remoteTime + 1000) {
          memosToPush.push(local);
          totalUpdatedRemote++;
        }
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id) && !deletedMemoIds.has(id)) {
        memosToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (memosToPush.length > 0) {
      const payload = memosToPush.map((m) => ({
        id: m.id,
        numero: m.numero,
        usuario_id: cleanFK(m.usuario_id, validUserIds),
        usuario_nome: m.usuario_nome || null,
        remessa: m.remessa || null,
        status: m.status || "Em elaboração",
        candidatos_count: m.candidatos_count || 0,
        created_at: m.created_at || new Date().toISOString(),
        updated_at: m.updated_at || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("memorandos", payload);
      totalCreatedRemote += pushed;
    }

    const mergedMemos = Array.from(memosToKeepLocal.values());
    saveStoredList("memorandos", mergedMemos);
    await idbSet("detran_cnh_memorandos", mergedMemos);
    mergedMemos.forEach((m) => validMemoIds.add(m.id));
    notifyDataSync("memorandos", true);
  } catch (err: any) {
    errors.push(`Memorandos: ${err.message}`);
  }

  // =========================================================================
  // 5. CANDIDATOS (CRUD + created_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [5/13] Candidatos de Memorando...");
    const deletedCandIds = getDeletedIds("candidatos");
    if (deletedCandIds.size > 0) {
      const delCount = await deleteRemoteInBatches("candidatos", Array.from(deletedCandIds));
      totalDeletedRemote += delCount;
    }

    let localCands = getStoredList<Candidato>("candidatos", []).filter((c) => !deletedCandIds.has(c.id));
    if (localCands.length === 0) {
      const idbCands = await idbGet<Candidato[]>("detran_cnh_candidatos");
      if (idbCands && idbCands.length > 0) {
        localCands = idbCands.filter((c) => !deletedCandIds.has(c.id));
      }
    }
    const remoteCands = await fetchRemoteTable("candidatos");

    const localMap = new Map(localCands.map((c) => [c.id, c]));
    const remoteMap = new Map(remoteCands.map((c: any) => [c.id, c]));

    const candsToPush: any[] = [];
    const candsToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      if (!remoteMap.has(id)) {
        candsToPush.push(local);
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id) && !deletedCandIds.has(id)) {
        candsToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (candsToPush.length > 0) {
      const payload = candsToPush.map((c) => ({
        id: c.id,
        memorando_id: cleanFK(c.memorando_id, validMemoIds),
        numero: c.numero || null,
        nome: c.nome,
        cpf: c.cpf,
        telefone: c.telefone || null,
        remessa: c.remessa || null,
        created_at: c.created_at || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("candidatos", payload);
      totalCreatedRemote += pushed;
    }

    const mergedCands = Array.from(candsToKeepLocal.values());
    saveStoredList("candidatos", mergedCands);
    await idbSet("detran_cnh_candidatos", mergedCands);
    notifyDataSync("candidatos", true);
  } catch (err: any) {
    errors.push(`Candidatos: ${err.message}`);
  }

  // =========================================================================
  // 6. LOTES (CRUD + updated_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [6/13] Lotes de Protocolo...");
    const deletedLoteIds = getDeletedIds("lotes");
    if (deletedLoteIds.size > 0) {
      const delCount = await deleteRemoteInBatches("lotes", Array.from(deletedLoteIds));
      totalDeletedRemote += delCount;
    }

    let localLotes: Lote[] = [];
    if (dexieDb.lotes) {
      localLotes = await dexieDb.lotes.toArray();
    }
    if (localLotes.length === 0) {
      localLotes = getStoredList<Lote>("lotes", []);
    }
    localLotes = localLotes.filter((l) => !deletedLoteIds.has(l.id));

    const remoteLotes = await fetchRemoteTable("lotes");

    const localMap = new Map(localLotes.map((l) => [l.id, l]));
    const remoteMap = new Map(remoteLotes.map((l: any) => [l.id, l]));

    const lotesToPush: any[] = [];
    const lotesToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      const remote = remoteMap.get(id);
      if (!remote) {
        lotesToPush.push(local);
      } else {
        const localTime = local.updated_at ? new Date(local.updated_at).getTime() : (local.created_at ? new Date(local.created_at).getTime() : 0);
        const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : (remote.created_at ? new Date(remote.created_at).getTime() : 0);
        if (remoteTime > localTime + 1000) {
          lotesToKeepLocal.set(id, { ...local, ...remote });
          totalUpdatedLocal++;
        } else if (localTime > remoteTime + 1000) {
          lotesToPush.push(local);
          totalUpdatedRemote++;
        }
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id) && !deletedLoteIds.has(id)) {
        lotesToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (lotesToPush.length > 0) {
      const payload = lotesToPush.map((l) => ({
        id: l.id,
        numero: Number(l.numero) || 0,
        data_recebimento: l.data_recebimento ? l.data_recebimento.split("T")[0] : new Date().toISOString().split("T")[0],
        documentos_impressos: Number(l.documentos_impressos) || 0,
        pdf_nome: l.pdf_nome || null,
        pdf_url: (l.pdf_url && !l.pdf_url.startsWith("data:") && l.pdf_url.length < 2000) ? l.pdf_url : null,
        pdf_tamanho: l.pdf_tamanho !== undefined && l.pdf_tamanho !== null ? Number(l.pdf_tamanho) : null,
        observacao: l.observacao || null,
        usuario_id: cleanFK(l.usuario_id, validUserIds),
        usuario_nome: l.usuario_nome || null,
        created_at: l.created_at || new Date().toISOString(),
        updated_at: l.updated_at || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("lotes", payload, 50);
      totalCreatedRemote += pushed;
    }

    const mergedLotes = Array.from(lotesToKeepLocal.values());
    if (dexieDb.lotes) {
      await dexieDb.lotes.clear();
      await dexieDb.lotes.bulkPut(mergedLotes);
    }
    saveStoredList("lotes", mergedLotes);
    await idbSet("detran_cnh_lotes", mergedLotes);
    notifyDataSync("lotes", true);
  } catch (err: any) {
    errors.push(`Lotes: ${err.message}`);
  }

  // =========================================================================
  // 7. GERAL CNHS (CRUD + updated_at - Alinhamento Cirúrgico Central)
  // =========================================================================
  try {
    onProgress?.("Alinhando [7/13] Protocolo Geral de CNHs (IndexedDB & Supabase)...");
    const deletedGeralIds = new Set<string>([
      ...Array.from(getDeletedGeralIds()),
      ...Array.from(getDeletedIds("geral"))
    ]);

    if (deletedGeralIds.size > 0) {
      const delCount = await deleteRemoteInBatches("geral_cnhs", Array.from(deletedGeralIds));
      totalDeletedRemote += delCount;
      if (dexieDb.geral) {
        await dexieDb.geral.bulkDelete(Array.from(deletedGeralIds));
      }
    }

    // Executa a reconciliação cirúrgica de CNHs com base em updated_at
    const discRep = await detectDiscrepancies((msg) => onProgress?.(`CNHs: ${msg}`));
    if (discRep && discRep.totalDiscrepancies > 0) {
      const reconResult = await forceUnidirectionalReconciliation({
        direction: "latest_timestamp",
        report: discRep,
        onProgress: (m) => onProgress?.(`CNHs: ${m}`)
      });
      totalUpdatedLocal += reconResult.updatedLocalCount;
      totalUpdatedRemote += reconResult.updatedRemoteCount;
      if (reconResult.errors.length > 0) {
        errors.push(...reconResult.errors);
      }
    }
  } catch (err: any) {
    errors.push(`Geral CNHs: ${err.message}`);
  }

  // =========================================================================
  // 8. DECLARAÇÕES (CRUD + updated_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [8/13] Declarações de Retirada...");
    const deletedDeclIds = getDeletedIds("declaracoes");
    if (deletedDeclIds.size > 0) {
      const delCount = await deleteRemoteInBatches("declaracoes", Array.from(deletedDeclIds));
      totalDeletedRemote += delCount;
    }

    const localDecls = getStoredList<Declaracao>("declaracoes", []).filter((d) => !deletedDeclIds.has(d.id));
    const remoteDecls = await fetchRemoteTable("declaracoes");

    const localMap = new Map(localDecls.map((d) => [d.id, d]));
    const remoteMap = new Map(remoteDecls.map((d: any) => [d.id, d]));

    const declsToPush: any[] = [];
    const declsToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      const remote = remoteMap.get(id);
      if (!remote) {
        declsToPush.push(local);
      } else {
        const localTime = local.updated_at ? new Date(local.updated_at).getTime() : (local.created_at ? new Date(local.created_at).getTime() : 0);
        const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : (remote.created_at ? new Date(remote.created_at).getTime() : 0);
        if (remoteTime > localTime + 1000) {
          declsToKeepLocal.set(id, { ...local, ...remote });
          totalUpdatedLocal++;
        } else if (localTime > remoteTime + 1000) {
          declsToPush.push(local);
          totalUpdatedRemote++;
        }
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id) && !deletedDeclIds.has(id)) {
        declsToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (declsToPush.length > 0) {
      const payload = declsToPush.map((d) => ({
        id: d.id,
        numero: d.numero,
        ano: Number(d.ano) || new Date().getFullYear(),
        data_emissao: d.data_emissao || new Date().toISOString().split("T")[0],
        cidade: d.cidade || "Itaituba",
        uf: d.uf || "PA",
        procurador_id: d.procurador_id && validRespIds.has(d.procurador_id) ? d.procurador_id : null,
        procurador_nome: d.procurador_nome,
        procurador_cpf: d.procurador_cpf,
        procurador_telefone: d.procurador_telefone || null,
        procurador_endereco: d.procurador_endereco || null,
        texto_declaracao: d.texto_declaracao,
        condutores: d.condutores || [],
        gerente_nome: d.gerente_nome || null,
        gerente_cargo: d.gerente_cargo || null,
        gerente_unidade: d.gerente_unidade || null,
        gerente_portaria: d.gerente_portaria || null,
        observacao: d.observacao || null,
        usuario_id: cleanFK(d.usuario_id, validUserIds),
        usuario_nome: d.usuario_nome || null,
        created_at: d.created_at || new Date().toISOString(),
        updated_at: d.updated_at || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("declaracoes", payload, 50);
      totalCreatedRemote += pushed;
    }

    const mergedDecls = Array.from(declsToKeepLocal.values());
    saveStoredList("declaracoes", mergedDecls);
    await idbSet("detran_cnh_declaracoes", mergedDecls);
    notifyDataSync("declaracoes", true);
  } catch (err: any) {
    errors.push(`Declarações: ${err.message}`);
  }

  // =========================================================================
  // 9. HISTÓRICO DE MOVIMENTAÇÕES (CRUD + data_hora)
  // =========================================================================
  try {
    onProgress?.("Alinhando [9/13] Histórico de Movimentações...");
    const localHist = getStoredList<HistoricoMovimentacao>("historico", []);
    const remoteHist = await fetchRemoteTable("historico_movimentacoes");

    const localMap = new Map(localHist.map((h) => [h.id, h]));
    const remoteMap = new Map(remoteHist.map((h: any) => [h.id, h]));

    const histToPush: any[] = [];
    const histToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      if (!remoteMap.has(id)) {
        histToPush.push(local);
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id)) {
        histToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (histToPush.length > 0) {
      const payload = histToPush.map((h) => ({
        id: toValidUUID(h.id) || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : (toValidUUID(`hist-${h.geral_id}-${Math.random()}`) || "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12))),
        geral_id: h.geral_id,
        geral_ordem: h.geral_ordem || null,
        geral_nome: h.geral_nome || null,
        situacao_anterior: h.situacao_anterior || null,
        situacao_nova: h.situacao_nova,
        responsavel_id: cleanFK(h.responsavel_id, validRespIds),
        responsavel_nome: h.responsavel_nome || null,
        usuario_id: cleanFK(h.usuario_id, validUserIds),
        usuario_nome: h.usuario_nome || null,
        observacao: h.observacao || null,
        data_hora: h.data_hora || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("historico_movimentacoes", payload, 200);
      totalCreatedRemote += pushed;
    }

    const mergedHist = Array.from(histToKeepLocal.values());
    saveStoredList("historico", mergedHist);
    await idbSet("detran_cnh_historico", mergedHist);
    notifyDataSync("historico", true);
  } catch (err: any) {
    errors.push(`Histórico: ${err.message}`);
  }

  // =========================================================================
  // 10. AUDITORIA (CRUD + data_hora)
  // =========================================================================
  try {
    onProgress?.("Alinhando [10/13] Auditoria do Sistema...");
    const localAud = getStoredList<Auditoria>("auditoria", []);
    const remoteAud = await fetchRemoteTable("auditoria");

    const localMap = new Map(localAud.map((a) => [a.id, a]));
    const remoteMap = new Map(remoteAud.map((a: any) => [a.id, a]));

    const audToPush: any[] = [];
    const audToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      if (!remoteMap.has(id)) {
        audToPush.push(local);
      }
    }

    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id)) {
        audToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (audToPush.length > 0) {
      const payload = audToPush.map((a) => ({
        id: toValidUUID(a.id) || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : (toValidUUID(`aud-${a.registro_id}-${Math.random()}`) || "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12))),
        tabela: a.tabela,
        registro_id: a.registro_id || "",
        acao: a.acao,
        usuario_id: cleanFK(a.usuario_id, validUserIds),
        usuario_nome: a.usuario_nome || null,
        dados_antigos: (a as any).dados_antigos ? JSON.stringify((a as any).dados_antigos) : (a.valores_anteriores ? JSON.stringify(a.valores_anteriores) : null),
        dados_novos: (a as any).dados_novos ? JSON.stringify((a as any).dados_novos) : (a.valores_novos ? JSON.stringify(a.valores_novos) : null),
        data_hora: a.data_hora || new Date().toISOString()
      }));
      const pushed = await upsertRemoteInBatches("auditoria", payload, 200);
      totalCreatedRemote += pushed;
    }

    const mergedAud = Array.from(audToKeepLocal.values());
    saveStoredList("auditoria", mergedAud);
    await idbSet("detran_cnh_auditoria", mergedAud);
    notifyDataSync("auditoria", true);
  } catch (err: any) {
    errors.push(`Auditoria: ${err.message}`);
  }

  // =========================================================================
  // 11. CONFIGURAÇÃO DO ÓRGÃO (CRUD + updated_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [11/13] Configurações e Logomarca do Órgão...");
    const localCfg = getOrgaoConfig() || ({} as any);
    const { data: remoteCfgRows } = await supabase.from("orgao_config").select("*").limit(1);
    const remoteCfg = remoteCfgRows && remoteCfgRows.length > 0 ? remoteCfgRows[0] : null;

    if (remoteCfg) {
      const localTime = localCfg.updated_at ? new Date(localCfg.updated_at).getTime() : 0;
      const remoteTime = remoteCfg.updated_at ? new Date(remoteCfg.updated_at).getTime() : 0;
      if (remoteTime > localTime + 1000) {
        saveOrgaoConfig(remoteCfg);
        totalUpdatedLocal++;
      } else if (localTime > remoteTime + 1000) {
        await supabase.from("orgao_config").upsert([localCfg], { onConflict: "id" });
        totalUpdatedRemote++;
      }
    } else if (localCfg.id) {
      await supabase.from("orgao_config").upsert([localCfg], { onConflict: "id" });
      totalCreatedRemote++;
    }
    notifyDataSync("orgao", true);
  } catch (err: any) {
    errors.push(`Órgão: ${err.message}`);
  }

  // =========================================================================
  // 12. IMAGENS E ANEXOS SINCRONIZADOS (CRUD + created_at)
  // =========================================================================
  try {
    onProgress?.("Alinhando [12/13] Imagens e Anexos...");
    const localImgs = getStoredList<any>("imagens", []);
    const remoteImgs = await fetchRemoteTable("imagens_sync");

    const localMap = new Map(localImgs.map((img: any) => [img.id, img]));
    const remoteMap = new Map(remoteImgs.map((img: any) => [img.id, img]));

    const imgsToPush: any[] = [];
    const imgsToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      if (!remoteMap.has(id)) imgsToPush.push(local);
    }
    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id)) {
        imgsToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (imgsToPush.length > 0) {
      const pushed = await upsertRemoteInBatches("imagens_sync", imgsToPush, 20);
      totalCreatedRemote += pushed;
    }

    const mergedImgs = Array.from(imgsToKeepLocal.values());
    saveStoredList("imagens", mergedImgs);
    notifyDataSync("imagens", true);
  } catch (err: any) {
    errors.push(`Imagens: ${err.message}`);
  }

  // =========================================================================
  // 13. CONSULTAS DO CIDADÃO (LOGS) (CRUD + data_hora)
  // =========================================================================
  try {
    onProgress?.("Alinhando [13/13] Consultas do Cidadão (Logs)...");
    const localLogs = getAcessosCidadaoLogs();
    const remoteLogs = await fetchRemoteTable("acessos_cidadao");

    const localMap = new Map(localLogs.map((l: any) => [l.id, l]));
    const remoteMap = new Map(remoteLogs.map((l: any) => [l.id, l]));

    const logsToPush: any[] = [];
    const logsToKeepLocal = new Map<string, any>(localMap);

    for (const [id, local] of localMap.entries()) {
      if (!remoteMap.has(id)) logsToPush.push(local);
    }
    for (const [id, remote] of remoteMap.entries()) {
      if (!localMap.has(id)) {
        logsToKeepLocal.set(id, remote);
        totalCreatedLocal++;
      }
    }

    if (logsToPush.length > 0) {
      const pushed = await upsertRemoteInBatches("acessos_cidadao", logsToPush, 200);
      totalCreatedRemote += pushed;
    }

    const mergedLogs = Array.from(logsToKeepLocal.values());
    await idbSet("detran_acessos_cidadao_logs", mergedLogs);
    notifyDataSync("acessos_cidadao", true);
  } catch (err: any) {
    errors.push(`Acessos Cidadão: ${err.message}`);
  }

  const durationMs = Date.now() - startTime;
  const alignedTablesCount = 13 - errors.length;

  return {
    success: errors.length === 0,
    totalTables: 13,
    alignedTablesCount,
    totalCreatedRemote,
    totalCreatedLocal,
    totalUpdatedRemote,
    totalUpdatedLocal,
    totalDeletedRemote,
    totalDeletedLocal,
    durationMs,
    errors,
    message: `Alinhamento cirúrgico de todas as 13 tabelas (CRUD) concluído em ${durationMs}ms.`
  };
}
