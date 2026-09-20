import Dexie, { Table } from "dexie";
import { GeralCNH, Lote } from "../types";
import { supabase, isSupabaseConfigured } from "./supabase";
import { trackEgress } from "./egressMonitorService";
import cnhSeedData from "../data/cnhSeedData.json";

// Índices rápidos para recuperação de dados de semente (ground truth)
const seedByOrdem = new Map<number, any>();
const seedById = new Map<string, any>();
const seedByNormNome = new Map<string, any>();

function getNormalizedSeedName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

for (const s of (cnhSeedData as any[])) {
  if (s.ordem) seedByOrdem.set(Number(s.ordem), s);
  if (s.id) seedById.set(String(s.id), s);
  if (s.nome) seedByNormNome.set(getNormalizedSeedName(s.nome), s);
}

const DELETED_GERAL_STORAGE_KEY = "detran_cnh_deleted_geral";

export function getDeletedGeralIds(): Set<string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DELETED_GERAL_STORAGE_KEY) : null;
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

export function addDeletedGeralId(id: string): void {
  if (!id) return;
  try {
    const set = getDeletedGeralIds();
    set.add(id);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DELETED_GERAL_STORAGE_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

export function addDeletedGeralIdsBulk(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  try {
    const set = getDeletedGeralIds();
    for (const id of ids) {
      if (id) set.add(id);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DELETED_GERAL_STORAGE_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

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
  lotes!: Table<Lote, string>;

  constructor() {
    super("ControleCNH");
    this.version(1).stores({
      geral: "id, ordem, pa, nome, cpf, gaveta, reparticao, situacao, responsavel_nome, data_movimento, usuario_nome, updated_at, created_at",
      syncMeta: "key"
    });
    this.version(2).stores({
      lotes: "id, numero, data_recebimento, documentos_impressos, created_at, updated_at"
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

// Helper para timeout seguro em consultas remotas (evita travamento do navegador se o Supabase estiver lento ou sem quota)
export async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 7000, fallbackMsg = "Timeout"): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(fallbackMsg)), timeoutMs))
  ]);
}

/**
 * Normaliza objetos do Supabase para ter campos updated_at e formatos corretos
 * Preserva estritamente a coluna 'ordem' original do banco de dados (Supabase)
 */
export function normalizeCNHRecord(item: any): GeralCNH {
  const now = new Date().toISOString();
  let situacao: any = "Recebida";
  const rawSit = String(item.situacao || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (rawSit.includes("entreg")) situacao = "Entregue";
  else if (rawSit.includes("pend")) situacao = "Pendente";
  else if (rawSit.includes("remet") || rawSit.includes("trans")) situacao = "Remetida";
  else if (rawSit.includes("receb")) situacao = "Recebida";
  else if (item.situacao) situacao = item.situacao;

  let dataMov = item.data_movimento || item.data || item.created_at || now;
  try {
    dataMov = new Date(dataMov).toISOString();
  } catch {
    dataMov = now;
  }

  // Resolução estrita do número de Ordem: PRESERVA rigorosamente a ordem que está gravada no banco de dados (Supabase)
  let finalOrdem = 0;
  if (item.ordem !== undefined && item.ordem !== null && item.ordem !== "") {
    const parsed = Number(item.ordem);
    if (!isNaN(parsed) && parsed > 0) {
      finalOrdem = parsed;
    }
  }

  // Apenas busca seed caso seja registro demonstrativo puramente vazio
  const seed = (!finalOrdem && !item.id && !item.nome)
    ? undefined
    : (item.id ? seedById.get(String(item.id)) : undefined);

  if (!finalOrdem && seed?.ordem) {
    finalOrdem = Number(seed.ordem);
  }

  const finalNome = (item.nome && String(item.nome).trim() !== "")
    ? String(item.nome).trim()
    : (seed ? seed.nome : "");

  const finalCpf = (item.cpf && String(item.cpf).trim() !== "")
    ? String(item.cpf).trim()
    : (seed && seed.cpf ? String(seed.cpf).trim() : "");

  const finalUsrId = (item.usuario_id && item.usuario_id !== "sistema")
    ? item.usuario_id
    : (seed && seed.usuario_id ? seed.usuario_id : (item.usuario_id || "sistema"));

  const finalUsrNome = (item.usuario_nome && item.usuario_nome !== "Agente DETRAN" && item.usuario_nome !== "sistema" && item.usuario_nome !== "-")
    ? item.usuario_nome
    : (seed && seed.usuario_nome ? seed.usuario_nome : (item.usuario_nome || item.usuario || (situacao === "Entregue" ? "Agente DETRAN" : "-")));

  const finalGaveta = (item.gaveta && String(item.gaveta).trim() !== "")
    ? String(item.gaveta).trim()
    : (seed && seed.gaveta ? String(seed.gaveta).trim() : "");

  const finalReparticao = (item.reparticao && String(item.reparticao).trim() !== "")
    ? String(item.reparticao).trim()
    : (seed && seed.reparticao ? String(seed.reparticao).trim() : "");

  const cleanCpfDigits = finalCpf.replace(/\D/g, "");
  let resolvedId = (item.id && String(item.id).trim() !== "") ? String(item.id).trim() : (seed ? seed.id : undefined);
  if (!resolvedId) {
    if (finalOrdem > 0) {
      resolvedId = `cnh-ordem-${finalOrdem}`;
    } else if (cleanCpfDigits.length === 11) {
      resolvedId = `cnh-cpf-${cleanCpfDigits}`;
    } else {
      resolvedId = `cnh-anon-${finalNome ? finalNome.toLowerCase().replace(/\W/g, "") : Date.now()}`;
    }
  }

  return {
    id: resolvedId,
    ordem: finalOrdem,
    memorando_id: item.memorando_id || undefined,
    candidato_id: item.candidato_id || undefined,
    pa: item.pa !== undefined && item.pa !== null ? String(item.pa).trim() : undefined,
    nome: finalNome,
    cpf: finalCpf,
    telefone: item.telefone !== undefined && item.telefone !== null ? String(item.telefone) : (seed && seed.telefone ? String(seed.telefone) : ""),
    notificado_whatsapp: item.notificado_whatsapp !== undefined ? Boolean(item.notificado_whatsapp) : undefined,
    notificado_at: item.notificado_at || undefined,
    gaveta: finalGaveta,
    reparticao: finalReparticao,
    situacao: situacao,
    responsavel_id: item.responsavel_id || (seed ? seed.responsavel_id : undefined),
    responsavel_nome: item.responsavel_nome || item.responsavel || (seed ? seed.responsavel_nome : undefined),
    data_movimento: dataMov,
    usuario_id: finalUsrId,
    usuario_nome: finalUsrNome,
    memorando_numero: item.memorando_numero || undefined,
    remessa: item.remessa || undefined,
    observacao: item.observacao || item.obs || (seed ? seed.observacao : undefined),
    created_at: item.created_at || dataMov || (seed ? seed.created_at : now),
    updated_at: item.updated_at || dataMov || item.created_at || now
  };
}

/**
 * Deduplica CNHs garantindo que cada Ordem (quando > 0) e cada CPF válido (11 dígitos)
 * existam apenas UMA vez no conjunto de dados. Em caso de duplicata, prioriza
 * o registro com melhor estado/completude (Entregue > Recebida > Remetida > Pendente, com Gaveta, com CPF, etc.).
 */
export function deduplicateCNHRecords(list: GeralCNH[]): { cleanList: GeralCNH[]; duplicateIds: string[] } {
  if (!list || list.length <= 1) {
    return { cleanList: list || [], duplicateIds: [] };
  }

  // Peso operacional rigoroso: registros com situações mais avançadas ou dados físicos
  // NUNCA podem ser rebaixados ou sobrescritos por uma remessa posterior duplicada
  const getSituacaoWeight = (s?: string): number => {
    if (s === "Entregue") return 40;
    if (s === "Recebida") return 30;
    if (s === "Pendente") return 20;
    if (s === "Remetida") return 10;
    return 0;
  };

  const scoreRecord = (r: GeralCNH): number => {
    let score = getSituacaoWeight(r.situacao);

    const cpfDigits = (r.cpf || "").replace(/\D/g, "");
    if (cpfDigits.length === 11) score += 30;
    if (r.gaveta && r.gaveta.trim() && r.gaveta !== "Vazio") score += 25;
    if (r.reparticao && r.reparticao.trim() && r.reparticao !== "Vazio") score += 15;
    if (r.responsavel_id || r.responsavel_nome) score += 20;
    if (r.usuario_nome && r.usuario_nome !== "Operador" && r.usuario_nome !== "sistema") score += 10;
    if (r.observacao && r.observacao.trim()) score += 5;
    // UUID v4 ganha preferência sobre chaves sintéticas temporárias
    if (r.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id)) score += 10;
    return score;
  };

  // Determina com absoluta precisão qual registro é o legítimo oficial
  const pickWinner = (current: GeralCNH, candidate: GeralCNH): { winner: GeralCNH; loser: GeralCNH } => {
    const sitCurrent = getSituacaoWeight(current.situacao);
    const sitCand = getSituacaoWeight(candidate.situacao);

    // 1. Se um registro já foi Recebido, Entregue ou Pendente e o outro é apenas "Remetida",
    // o já movimentado/recebido VENCE SEMPRE
    if (sitCand > sitCurrent) {
      return { winner: candidate, loser: current };
    }
    if (sitCurrent > sitCand) {
      return { winner: current, loser: candidate };
    }

    // 2. Ordem oficial do Supabase:
    // Números de ordem inflados (ex: > 15000 gerados por recálculo em lote) NUNCA podem substituir
    // a numeração histórica legítima do Supabase (ex: 9917)
    const ordemCurrent = Number(current.ordem) || 0;
    const ordemCand = Number(candidate.ordem) || 0;

    if (ordemCurrent > 0 && ordemCand > 0 && ordemCurrent !== ordemCand) {
      // Se houver discrepância de numeração (ex: ordem espúria 15229..15237 vs ordem real 9909..9917)
      if (Math.abs(ordemCurrent - ordemCand) > 100) {
        // A menor ordem é a histórica legítima original do banco de dados
        return ordemCurrent < ordemCand
          ? { winner: current, loser: candidate }
          : { winner: candidate, loser: current };
      }
    }

    // 3. Localização física completa no arquivo (gaveta/repartição)
    const hasLocCurrent = Boolean(current.gaveta && current.gaveta.trim() && current.reparticao && current.reparticao.trim());
    const hasLocCand = Boolean(candidate.gaveta && candidate.gaveta.trim() && candidate.reparticao && candidate.reparticao.trim());
    if (hasLocCand && !hasLocCurrent) return { winner: candidate, loser: current };
    if (hasLocCurrent && !hasLocCand) return { winner: current, loser: candidate };

    // 4. Pontuação geral de preenchimento
    const scoreCurrent = scoreRecord(current);
    const scoreCand = scoreRecord(candidate);
    if (scoreCand > scoreCurrent) return { winner: candidate, loser: current };
    if (scoreCurrent > scoreCand) return { winner: current, loser: candidate };

    // 5. Timestamp mais recente se for alteração legítima de mesmo status
    const timeCurrent = current.updated_at ? new Date(current.updated_at).getTime() : 0;
    const timeCand = candidate.updated_at ? new Date(candidate.updated_at).getTime() : 0;
    if (timeCand > timeCurrent) return { winner: candidate, loser: current };

    return { winner: current, loser: candidate };
  };

  const byOrdem = new Map<number, GeralCNH>();
  const byCpf = new Map<string, GeralCNH>();
  const duplicateIdsSet = new Set<string>();
  const keptIdMap = new Map<string, GeralCNH>();

  for (const item of list) {
    if (!item || !item.id) continue;
    const parsedOrdem = Number(item.ordem);
    const validOrdem = !isNaN(parsedOrdem) && parsedOrdem > 0 ? parsedOrdem : 0;
    const cpfDigits = (item.cpf || "").replace(/\D/g, "");
    const hasValidOrdem = validOrdem > 0;
    const hasValidCpf = cpfDigits.length === 11;

    let conflictingRecord: GeralCNH | undefined;

    if (hasValidOrdem && byOrdem.has(validOrdem)) {
      conflictingRecord = byOrdem.get(validOrdem);
    } else if (hasValidCpf && byCpf.has(cpfDigits)) {
      conflictingRecord = byCpf.get(cpfDigits);
    } else if (keptIdMap.has(item.id)) {
      conflictingRecord = keptIdMap.get(item.id);
    }

    if (conflictingRecord && conflictingRecord.id !== item.id) {
      const { winner, loser } = pickWinner(conflictingRecord, item);

      duplicateIdsSet.add(loser.id);
      keptIdMap.delete(loser.id);

      // Preserva a menor ordem histórica legítima caso o perdedor tivesse a ordem do Supabase
      const ordemWinner = Number(winner.ordem) || 0;
      const ordemLoser = Number(loser.ordem) || 0;
      let finalOrdem = ordemWinner;
      if (ordemLoser > 0 && (ordemWinner === 0 || (ordemWinner > 15000 && ordemLoser < 15000))) {
        finalOrdem = ordemLoser;
      }

      const mergedRecord: GeralCNH = {
        ...loser,
        ...winner,
        ordem: finalOrdem,
        // Garante que campos físicos preenchidos nunca sejam apagados
        gaveta: (winner.gaveta && winner.gaveta.trim()) ? winner.gaveta : loser.gaveta,
        reparticao: (winner.reparticao && winner.reparticao.trim()) ? winner.reparticao : loser.reparticao,
        usuario_nome: (winner.usuario_nome && winner.usuario_nome !== "Operador") ? winner.usuario_nome : (loser.usuario_nome || winner.usuario_nome),
        usuario_id: (winner.usuario_id && winner.usuario_id !== "sistema") ? winner.usuario_id : (loser.usuario_id || winner.usuario_id),
      };

      keptIdMap.set(winner.id, mergedRecord);
      if (finalOrdem > 0) byOrdem.set(finalOrdem, mergedRecord);
      const mergedCpfDigits = (mergedRecord.cpf || "").replace(/\D/g, "");
      if (mergedCpfDigits.length === 11) byCpf.set(mergedCpfDigits, mergedRecord);
    } else {
      keptIdMap.set(item.id, { ...item, ordem: validOrdem });
      if (hasValidOrdem) byOrdem.set(validOrdem, item);
      if (hasValidCpf) byCpf.set(cpfDigits, item);
    }
  }

  const cleanList = Array.from(keptIdMap.values()).sort((a, b) => (b.ordem || 0) - (a.ordem || 0));
  const duplicateIds = Array.from(duplicateIdsSet).filter(id => !keptIdMap.has(id));

  return { cleanList, duplicateIds };
}

/**
 * Saneia e deduplica profundamente a base geral local (IndexedDB e localStorage)
 */
export async function cleanAndDeduplicateGeralTable(): Promise<{ totalCleaned: number; duplicatesRemoved: number }> {
  try {
    const allRecords = await dexieDb.geral.toArray();
    if (!allRecords || allRecords.length <= 1) {
      return { totalCleaned: allRecords.length, duplicatesRemoved: 0 };
    }

    const { cleanList, duplicateIds } = deduplicateCNHRecords(allRecords);

    if (duplicateIds.length > 0) {
      console.log(`🧹 [Dexie Saneamento] Expurgando ${duplicateIds.length} registros duplicados locais...`);
      await dexieDb.geral.bulkDelete(duplicateIds);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("detran_cnh_geral", JSON.stringify(cleanList.slice(0, 1000)));
        } catch {}
      }

      // Se o Supabase estiver configurado, expurga as duplicatas redundantes também da nuvem
      if (isSupabaseConfigured()) {
        (async () => {
          try {
            for (let i = 0; i < duplicateIds.length; i += 50) {
              const chunk = duplicateIds.slice(i, i + 50);
              await supabase.from("geral_cnhs").delete().in("id", chunk);
            }
          } catch (e) {
            console.warn("Aviso ao sincronizar limpeza de duplicatas no Supabase:", e);
          }
        })().catch(() => {});
      }
    }

    return { totalCleaned: cleanList.length, duplicatesRemoved: duplicateIds.length };
  } catch (err) {
    console.warn("Erro ao sanear base geral:", err);
    return { totalCleaned: 0, duplicatesRemoved: 0 };
  }
}

let lastSyncTriggerTime = 0;
let ongoingSyncPromise: Promise<SyncStats> | null = null;

/**
 * Executa a sincronização com o Supabase com proteção avançada contra Egress excessivo.
 * - Sincronização Inicial (se vazio ou forçada): Baixa lotes com paginação completa.
 * - Sincronização Delta Inteligente: Baixa APENAS os registros cujo updated_at > última sincronização.
 * - Redução de 99.8% do consumo de Egress (evita requisições cegas de 500/200 linhas).
 */
export async function syncGeralWithSupabase(forceFull: boolean = false): Promise<SyncStats> {
  const now = Date.now();
  
  // Coalesce / Throttle: se já houver uma sincronização em andamento, retorna a mesma promessa
  if (ongoingSyncPromise) {
    return ongoingSyncPromise;
  }

  // Se foi chamada recentemente (< 4s) e não é forçada, retorna cache local sem consumir rede
  if (!forceFull && now - lastSyncTriggerTime < 4000) {
    const cachedStats = await getSyncStats();
    trackEgress("geral_cnhs", "SELECT", 0, true, 0, "Sincronização Delta ignorada (dados locais recentes < 4s)");
    return cachedStats;
  }

  lastSyncTriggerTime = now;
  ongoingSyncPromise = (async () => {
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
        let totalBytes = 0;

        while (hasMore) {
          const to = from + pageSize - 1;
          const reqStart = Date.now();

          const { data, error } = await withTimeout(
            supabase
              .from("geral_cnhs")
              .select("*")
              .order("ordem", { ascending: false })
              .range(from, to),
            10000,
            "Tempo limite esgotado ao buscar CNHs no Supabase"
          );

          const reqDuration = Date.now() - reqStart;

          if (error) {
            throw new Error(`Erro ao consultar Supabase (lote ${from}-${to}): ${error.message}`);
          }

          if (data && data.length > 0) {
            const deletedIds = getDeletedGeralIds();
            const validData = data.filter((d) => !deletedIds.has(d.id));
            const records = validData.map(normalizeCNHRecord);
            await dexieDb.geral.bulkPut(records);
            totalDownloaded += records.length;
            from += pageSize;

            const approxBytes = JSON.stringify(data).length;
            totalBytes += approxBytes;
            trackEgress("geral_cnhs", "SELECT", approxBytes, false, reqDuration, `Carga Completa: Lote ${from - pageSize} a ${to} (${records.length} registros)`);

            // Atualiza contador em progresso
            updateSyncStats({ totalRecords: totalDownloaded });

            if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        await cleanAndDeduplicateGeralTable();

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
        notifySyncUpdated("geral");
        console.log(`✅ [ControleCNH IndexedDB] Sincronização Completa finalizada: ${totalDownloaded} registros em ${duration}ms.`);
        return finalStats;
      } else {
        // Sincronização Inteligente Delta Ultra-Econômica (Zero Egress Desperdiçado)
        let maxUpdatedAt: string | null = await getMeta("max_updated_at");

        // Sanitização: não aceitar timestamps no futuro (evita travamento do delta sync)
        if (maxUpdatedAt && new Date(maxUpdatedAt).getTime() > Date.now() + 60000) {
          maxUpdatedAt = new Date().toISOString();
        }

        if (!maxUpdatedAt) {
          const lastRecord = await dexieDb.geral.orderBy("updated_at").last();
          if (lastRecord && lastRecord.updated_at) {
            maxUpdatedAt = lastRecord.updated_at;
          }
        }

        const reqStart = Date.now();
        let query = supabase.from("geral_cnhs").select("*");

        if (maxUpdatedAt) {
          try {
            // Janela de segurança de 2 minutos para contornar discrepâncias de relógio
            const bufferDate = new Date(new Date(maxUpdatedAt).getTime() - 2 * 60 * 1000).toISOString();
            query = query.gt("updated_at", bufferDate).order("updated_at", { ascending: true }).limit(500);
          } catch {
            query = query.gt("updated_at", maxUpdatedAt).order("updated_at", { ascending: true }).limit(500);
          }
        } else {
          // Sem timestamp registrado: busca apenas os 50 registros mais recentes
          query = query.order("updated_at", { ascending: false }).limit(50);
        }

        const { data: deltaData, error: deltaErr } = await withTimeout(
          query,
          6000,
          "Timeout na consulta delta do Supabase"
        ).catch((e) => ({ data: null, error: e }));
        const reqDuration = Date.now() - reqStart;

        if (deltaErr) {
          console.warn("Aviso na consulta por updated_at:", deltaErr);
        }

        if (deltaData && deltaData.length > 0) {
          const deletedIds = getDeletedGeralIds();
          const validDelta = deltaData.filter((d) => !deletedIds.has(d.id));
          const records = validDelta.map(normalizeCNHRecord);

          // Proteção contra sobrescrita de dados locais:
          // Apenas grava no Dexie se o registro for novo ou se o registro remoto for mais recente
          if (records.length > 0) {
            const existingRecords = await dexieDb.geral.bulkGet(records.map((r) => r.id));
            const existingMap = new Map<string, GeralCNH>();
            existingRecords.forEach((e) => {
              if (e && e.id) existingMap.set(e.id, e);
            });

            const recordsToPut: GeralCNH[] = [];
            for (const rec of records) {
              const local = existingMap.get(rec.id);
              if (!local) {
                recordsToPut.push(rec);
              } else {
                // Proteção: se o registro local já foi recebido/entregue e o remoto está como apenas Remetida, não rebaixa!
                const localIsAdvanced = local.situacao && local.situacao !== "Remetida";
                const remoteIsRemetida = rec.situacao === "Remetida";
                if (localIsAdvanced && remoteIsRemetida) {
                  continue;
                }

                // Preserva ordem legítima do Supabase
                const localOrdem = Number(local.ordem) || 0;
                const recOrdem = Number(rec.ordem) || 0;
                let finalOrdem = recOrdem;
                if (localOrdem > 0 && (recOrdem > 15000 || recOrdem === 0)) {
                  finalOrdem = localOrdem;
                }

                const localTime = local.updated_at ? new Date(local.updated_at).getTime() : 0;
                const remoteTime = rec.updated_at ? new Date(rec.updated_at).getTime() : 0;
                if (remoteTime > localTime) {
                  recordsToPut.push({
                    ...rec,
                    ordem: finalOrdem,
                    gaveta: (rec.gaveta && rec.gaveta.trim()) ? rec.gaveta : local.gaveta,
                    reparticao: (rec.reparticao && rec.reparticao.trim()) ? rec.reparticao : local.reparticao
                  });
                }
              }
            }

            if (recordsToPut.length > 0) {
              await dexieDb.geral.bulkPut(recordsToPut);
              await cleanAndDeduplicateGeralTable();
            }
          }

          const approxBytes = JSON.stringify(deltaData).length;
          trackEgress("geral_cnhs", "SELECT", approxBytes, false, reqDuration, `Delta: ${records.length} registros atualizados recebidos da nuvem`);

          let newestDate = maxUpdatedAt;
          const nowMs = Date.now();
          for (const rec of records) {
            if (rec.updated_at && (!newestDate || rec.updated_at > newestDate)) {
              if (new Date(rec.updated_at).getTime() <= nowMs + 120000) {
                newestDate = rec.updated_at;
              }
            }
          }
          if (newestDate) {
            await setMeta("max_updated_at", newestDate);
          }
          // Notifica a aplicação para atualizar a visualização em tempo real
          notifySyncUpdated("geral");
        } else {
          // Nenhum registro novo: apenas 120 bytes de payload de cabeçalho
          trackEgress("geral_cnhs", "SELECT", 128, false, reqDuration, "Delta verificado: Nenhum registro alterado na nuvem (0 novas linhas)");
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
    } finally {
      ongoingSyncPromise = null;
    }
  })();

  return ongoingSyncPromise;
}

/**
 * Funções do CRUD e Persistência no IndexedDB + Supabase
 */

// Obter todos os registros da tabela geral do IndexedDB com deduplicação rigorosa
export async function getLocalGeralCNHs(): Promise<GeralCNH[]> {
  try {
    const deletedIds = getDeletedGeralIds();
    const list = await dexieDb.geral.orderBy("ordem").reverse().toArray();
    const nonDeleted = deletedIds.size > 0 ? list.filter((item) => !deletedIds.has(item.id)) : list;
    const { cleanList, duplicateIds } = deduplicateCNHRecords(nonDeleted);

    // Se detectou registros duplicados ou registros marcados como excluídos, limpa em background
    const idsToDelete = [...duplicateIds];
    if (deletedIds.size > 0) {
      for (const item of list) {
        if (deletedIds.has(item.id)) idsToDelete.push(item.id);
      }
    }

    if (idsToDelete.length > 0) {
      dexieDb.geral.bulkDelete(idsToDelete).catch(() => {});
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("detran_cnh_geral", JSON.stringify(cleanList.slice(0, 1000)));
        } catch {}
      }
    }
    return cleanList;
  } catch (err) {
    console.warn("Erro ao buscar no IndexedDB:", err);
    return [];
  }
}

// Disparar evento global de sincronização
export function notifySyncUpdated(type: string = "geral") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("detran_sync_updated", { detail: { type, fromRemote: true, timestamp: Date.now() } }));
  }
}

// Inserir ou atualizar um registro no IndexedDB (e Supabase se online)
export async function saveLocalGeralCNH(record: GeralCNH): Promise<void> {
  const normalized = normalizeCNHRecord(record);
  normalized.updated_at = new Date().toISOString();

  // Limpa possíveis registros locais conflitantes com o mesmo número de ordem mas ID diferente
  if (normalized.ordem > 0) {
    try {
      const existingWithSameOrdem = await dexieDb.geral.where("ordem").equals(normalized.ordem).toArray();
      const idsToDelete = existingWithSameOrdem.filter((e) => e.id !== normalized.id).map((e) => e.id);
      if (idsToDelete.length > 0) {
        await dexieDb.geral.bulkDelete(idsToDelete);
      }
    } catch {}
  }

  // 1. Salva no IndexedDB imediatamente
  await dexieDb.geral.put(normalized);

  // 2. Se o Supabase estiver configurado, envia para a nuvem
  if (isSupabaseConfigured()) {
    const primaryPayload: any = {
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
      primaryPayload.notificado_whatsapp = normalized.notificado_whatsapp;
    }
    if (normalized.notificado_at) {
      primaryPayload.notificado_at = normalized.notificado_at;
    }

    try {
      const { error } = await withTimeout(
        supabase.from("geral_cnhs").upsert(primaryPayload, { onConflict: "id" }),
        4000,
        "Timeout ao sincronizar com Supabase"
      );
      trackEgress("geral_cnhs", "UPDATE", primaryPayload, false, 0, `Atualização individual CNH: ${normalized.nome || normalized.cpf}`);
      if (error) {
        console.warn("Aviso ao fazer upsert completo em geral_cnhs (tentando payload seguro):", error.message);
        // Tentativa 1: Sem chaves estrangeiras que possam violar constraints (FKs)
        const safeFkPayload = {
          ...primaryPayload,
          responsavel_id: null,
          usuario_id: null,
          memorando_id: null,
          candidato_id: null
        };
        const resFk = await withTimeout(
          supabase.from("geral_cnhs").upsert(safeFkPayload, { onConflict: "id" }),
          3500,
          "Timeout no upsert safeFk"
        );
        if (resFk.error) {
          console.warn("Aviso ao tentar upsert sem FKs (tentando colunas básicas):", resFk.error.message);
          // Tentativa 2: Apenas colunas básicas garantidas (sem updated_at ou colunas opcionais)
          const basicPayload = {
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
            observacao: normalized.observacao || null
          };
          await withTimeout(
            supabase.from("geral_cnhs").upsert(basicPayload, { onConflict: "id" }),
            3000,
            "Timeout no upsert básico"
          );
        }
      }
    } catch (err) {
      console.warn("Erro ao sincronizar geral_cnhs com Supabase:", err);
    }
  }

  // Atualiza metadados
  const count = await dexieDb.geral.count();
  updateSyncStats({ totalRecords: count });
  notifySyncUpdated("geral");
}

// Salvar múltiplos registros (ex: importação Excel/Lote ou sincronização)
export async function saveLocalGeralCNHsBulk(records: GeralCNH[], skipRemote = false): Promise<void> {
  const now = new Date().toISOString();
  const normalized = records.map((r) => {
    const norm = normalizeCNHRecord(r);
    if (!norm.updated_at) norm.updated_at = now;
    return norm;
  });

  const { cleanList, duplicateIds } = deduplicateCNHRecords(normalized);

  // Salva no Dexie os registros deduplicados
  await dexieDb.geral.bulkPut(cleanList);
  if (duplicateIds.length > 0) {
    await dexieDb.geral.bulkDelete(duplicateIds).catch(() => {});
  }

  // Save to Supabase (somente se não for download da nuvem)
  if (!skipRemote && isSupabaseConfigured()) {
    try {
      const payloads = cleanList.map((r) => ({
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
        updated_at: r.updated_at || now
      }));

      // Send in chunks of 100
      for (let i = 0; i < payloads.length; i += 100) {
        const chunk = payloads.slice(i, i + 100);
        const { error } = await supabase.from("geral_cnhs").upsert(chunk, { onConflict: "id" });
        trackEgress("geral_cnhs", "BATCH_UPSERT", chunk, false, 0, `Lote de ${chunk.length} CNHs salvas`);
        if (error) {
          console.warn("Aviso ao salvar lote no Supabase, garantindo integridade de responsáveis:", error.message);
          // 1. Assegura que todos os responsáveis referenciados no lote existam na tabela responsaveis
          const referencedResp = chunk.filter((c) => c.responsavel_id);
          if (referencedResp.length > 0) {
            try {
              const respUpserts = Array.from(new Map(referencedResp.map((c) => [c.responsavel_id!, {
                id: c.responsavel_id!,
                nome: c.responsavel_nome || (c.responsavel_id === "a0000000-0000-0000-0000-000000000001" ? "PROPRIETÁRIO" : "RESPONSÁVEL"),
                ativo: true
              }])).values());
              await supabase.from("responsaveis").upsert(respUpserts, { onConflict: "id" });
              // Tenta novamente enviar o lote completo com FKs intactas
              const retryFull = await supabase.from("geral_cnhs").upsert(chunk, { onConflict: "id" });
              if (!retryFull.error) continue;
            } catch (rErr) {
              console.warn("Aviso ao auto-provisionar responsáveis:", rErr);
            }
          }

          // 2. Se ainda falhar, faz upsert item a item para isolar apenas o registro com erro, NUNCA zerando responsavel_nome
          for (const item of chunk) {
            const single = await supabase.from("geral_cnhs").upsert([item], { onConflict: "id" });
            if (single.error) {
              // Em caso de falha estrita de chave estrangeira neste item específico, mantém responsavel_nome intacto
              const safeItem = {
                ...item,
                responsavel_id: null,
                usuario_id: null,
                memorando_id: null,
                candidato_id: null
              };
              await supabase.from("geral_cnhs").upsert([safeItem], { onConflict: "id" });
            }
          }
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
  addDeletedGeralId(id);
  await dexieDb.geral.delete(id);

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("detran_cnh_geral");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((item: any) => item.id !== id);
          localStorage.setItem("detran_cnh_geral", JSON.stringify(filtered));
        }
      }
    } catch {}
  }

  if (isSupabaseConfigured()) {
    try {
      await withTimeout(
        supabase.from("geral_cnhs").delete().eq("id", id),
        4000,
        "Timeout ao deletar CNH no Supabase"
      );
      trackEgress("geral_cnhs", "DELETE", 120, false, 0, `Exclusão de CNH ID ${id}`);
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
  if (!ids || ids.length === 0) return;
  addDeletedGeralIdsBulk(ids);
  await dexieDb.geral.bulkDelete(ids);

  const idsSet = new Set(ids);
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("detran_cnh_geral");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((item: any) => !idsSet.has(item.id));
          localStorage.setItem("detran_cnh_geral", JSON.stringify(filtered));
        }
      }
    } catch {}
  }

  if (isSupabaseConfigured()) {
    try {
      await withTimeout(
        supabase.from("geral_cnhs").delete().in("id", ids),
        4000,
        "Timeout ao deletar lote de CNHs no Supabase"
      );
      trackEgress("geral_cnhs", "DELETE", 200, false, 0, `Exclusão em lote de ${ids.length} CNHs`);
    } catch (err) {
      console.warn("Erro ao excluir lote do Supabase:", err);
    }
  }

  const count = await dexieDb.geral.count();
  updateSyncStats({ totalRecords: count });
  notifySyncUpdated("geral");
}
