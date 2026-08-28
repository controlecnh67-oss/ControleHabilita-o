import { GeralCNH } from "../types";
import { normalizeString, cleanCpfDigits, calculateNameSimilarity } from "./ocrService";

export type DuplicateMatchType = "exact_cpf" | "exact_name" | "exact_both" | "similar_name";

export interface DuplicateItem extends GeralCNH {
  isRecommendedKeep: boolean;
  selectedForDeletion: boolean;
  score: number;
  scoreReasons: string[];
}

export interface DuplicateGroup {
  groupId: string;
  matchType: DuplicateMatchType;
  matchReason: string;
  primaryRecordId: string;
  hasConflicts: boolean;
  items: DuplicateItem[];
}

/**
 * Remove preposições comuns em nomes brasileiros para criar uma chave canônica rápida O(1)
 */
function getCanonicalName(normName: string): string {
  if (!normName) return "";
  const stopWords = new Set(["DE", "DA", "DO", "DOS", "DAS", "E", "D"]);
  return normName
    .split(" ")
    .filter((w) => w.length > 0 && !stopWords.has(w))
    .join(" ");
}

/**
 * Extrai a chave de primeiro e último nome para agrupamento em micro-baldes
 */
function getFirstAndLastNameKey(normName: string): string {
  if (!normName) return "";
  const words = normName.split(" ").filter((w) => w.length > 1);
  if (words.length < 2) return "";
  return `${words[0]}_${words[words.length - 1]}`;
}

/**
 * Calcula pontuação de qualidade/completude para o registro
 */
export function calculateRecordQualityScore(record: GeralCNH): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Prioridade de Situação
  if (record.situacao === "Entregue") {
    score += 100;
    reasons.push("Já Entregue ao cidadão (+100)");
  } else if (record.situacao === "Recebida") {
    score += 80;
    reasons.push("Já Recebida no estoque (+80)");
  } else if (record.situacao === "Remetida") {
    score += 50;
    reasons.push("Remetida (+50)");
  } else {
    score += 20;
    reasons.push("Pendente (+20)");
  }

  // Tem CPF válido
  const cpfDigits = cleanCpfDigits(record.cpf || "");
  if (cpfDigits.length === 11) {
    score += 35;
    reasons.push("CPF completo (+35)");
  }

  // Tem Gaveta e Repartição
  if (record.gaveta && record.gaveta.trim() !== "") {
    score += 20;
    reasons.push("Gaveta alocada (+20)");
  }
  if (record.reparticao && record.reparticao.trim() !== "") {
    score += 10;
    reasons.push("Repartição definida (+10)");
  }

  // Tem Responsável preenchido
  if (record.responsavel_id || record.responsavel_nome) {
    score += 15;
    reasons.push("Responsável registrado (+15)");
  }

  // Tem Observação relevante
  if (record.observacao && record.observacao.trim().length > 3) {
    score += 10;
    reasons.push("Possui observações (+10)");
  }

  // Ordem mais recente / id
  if (record.ordem) {
    score += Math.min(record.ordem / 1000, 10);
  }

  return { score, reasons };
}

/**
 * Realiza uma varredura ULTRA-RÁPIDA O(N) com indexação por Hash Maps e Micro-Buckets
 * Evita qualquer travamento ou loop infinito mesmo com 50.000+ registros.
 */
export function scanForDuplicates(cnhs: GeralCNH[]): DuplicateGroup[] {
  if (!cnhs || cnhs.length < 2) return [];

  const assignedToGroup = new Set<string>();
  const groups: DuplicateGroup[] = [];

  // Pré-computa normalizações de forma linear O(N)
  const prepared = cnhs.map((item) => {
    const cpfDigits = cleanCpfDigits(item.cpf || "");
    const normName = normalizeString(item.nome || "");
    const canonicalName = getCanonicalName(normName);
    const firstLastKey = getFirstAndLastNameKey(normName);
    return {
      item,
      cpfDigits,
      normName,
      canonicalName,
      firstLastKey,
    };
  });

  // 1. Agrupamento O(N) por CPF Limpo (11 dígitos)
  const cpfMap = new Map<string, typeof prepared>();
  prepared.forEach((entry) => {
    if (entry.cpfDigits.length === 11) {
      const list = cpfMap.get(entry.cpfDigits) || [];
      list.push(entry);
      cpfMap.set(entry.cpfDigits, list);
    }
  });

  cpfMap.forEach((entries, cpf) => {
    if (entries.length > 1) {
      const unassigned = entries.filter((e) => !assignedToGroup.has(e.item.id));
      if (unassigned.length > 1) {
        const firstNorm = unassigned[0].normName;
        const allSameName = unassigned.every((e) => e.normName === firstNorm);
        const matchType: DuplicateMatchType = allSameName ? "exact_both" : "exact_cpf";
        const matchReason = allSameName
          ? `Mesmo CPF (${unassigned[0].item.cpf || cpf}) e Mesmo Nome`
          : `Mesmo CPF (${unassigned[0].item.cpf || cpf})`;

        const rawItems = unassigned.map((e) => e.item);
        const group = buildDuplicateGroup(`cpf_${cpf}`, matchType, matchReason, rawItems);
        groups.push(group);
        unassigned.forEach((e) => assignedToGroup.add(e.item.id));
      }
    }
  });

  // 2. Agrupamento O(N) por Nome Normalizado Exato
  const nameMap = new Map<string, typeof prepared>();
  prepared.forEach((entry) => {
    if (!assignedToGroup.has(entry.item.id) && entry.normName.length > 2) {
      const list = nameMap.get(entry.normName) || [];
      list.push(entry);
      nameMap.set(entry.normName, list);
    }
  });

  nameMap.forEach((entries, normName) => {
    const unassigned = entries.filter((e) => !assignedToGroup.has(e.item.id));
    if (unassigned.length > 1) {
      const matchReason = `Mesmo Nome (${unassigned[0].item.nome})`;
      const rawItems = unassigned.map((e) => e.item);
      const group = buildDuplicateGroup(
        `name_${normName.replace(/\s+/g, "_")}`,
        "exact_name",
        matchReason,
        rawItems
      );
      groups.push(group);
      unassigned.forEach((e) => assignedToGroup.add(e.item.id));
    }
  });

  // 3. Agrupamento O(N) por Nome Canônico (ignorando "DE", "DA", "DOS", etc.)
  const canonicalMap = new Map<string, typeof prepared>();
  prepared.forEach((entry) => {
    if (!assignedToGroup.has(entry.item.id) && entry.canonicalName.length > 3) {
      const list = canonicalMap.get(entry.canonicalName) || [];
      list.push(entry);
      canonicalMap.set(entry.canonicalName, list);
    }
  });

  canonicalMap.forEach((entries) => {
    const unassigned = entries.filter((e) => !assignedToGroup.has(e.item.id));
    if (unassigned.length > 1) {
      // Se tiverem CPFs conflitantes de 11 dígitos diferentes, não agrupa
      const cpfs = new Set(unassigned.map((e) => e.cpfDigits).filter((c) => c.length === 11));
      if (cpfs.size <= 1) {
        const matchReason = `Nomes Praticamente Idênticos (${unassigned.map((e) => e.item.nome).join(" / ")})`;
        const rawItems = unassigned.map((e) => e.item);
        const group = buildDuplicateGroup(
          `canon_${unassigned[0].item.id}`,
          "similar_name",
          matchReason,
          rawItems
        );
        groups.push(group);
        unassigned.forEach((e) => assignedToGroup.add(e.item.id));
      }
    }
  });

  // 4. Micro-Bucketing O(N) por Primeiro + Último Nome (Apenas compara dentro de pequenos baldes)
  const bucketMap = new Map<string, typeof prepared>();
  prepared.forEach((entry) => {
    if (!assignedToGroup.has(entry.item.id) && entry.firstLastKey.length > 3) {
      const list = bucketMap.get(entry.firstLastKey) || [];
      list.push(entry);
      bucketMap.set(entry.firstLastKey, list);
    }
  });

  bucketMap.forEach((bucketEntries) => {
    const unassignedInBucket = bucketEntries.filter((e) => !assignedToGroup.has(e.item.id));
    if (unassignedInBucket.length > 1 && unassignedInBucket.length <= 25) {
      // Pequeno balde de 2 a 25 itens -> comparação rápida segura
      for (let i = 0; i < unassignedInBucket.length; i++) {
        const cur = unassignedInBucket[i];
        if (assignedToGroup.has(cur.item.id)) continue;

        const similarMatches: GeralCNH[] = [cur.item];

        for (let j = i + 1; j < unassignedInBucket.length; j++) {
          const cand = unassignedInBucket[j];
          if (assignedToGroup.has(cand.item.id)) continue;

          // Se ambos tiverem CPFs válidos e forem diferentes, ignora
          if (cur.cpfDigits.length === 11 && cand.cpfDigits.length === 11 && cur.cpfDigits !== cand.cpfDigits) {
            continue;
          }

          const sim = calculateNameSimilarity(cur.item.nome, cand.item.nome);
          if (sim >= 85) {
            similarMatches.push(cand.item);
            assignedToGroup.add(cand.item.id);
          }
        }

        if (similarMatches.length > 1) {
          assignedToGroup.add(cur.item.id);
          const matchReason = `Nomes Muito Similares (${similarMatches.map((s) => s.nome).join(" ≈ ")})`;
          const group = buildDuplicateGroup(
            `sim_${cur.item.id}`,
            "similar_name",
            matchReason,
            similarMatches
          );
          groups.push(group);
        }
      }
    }
  });

  // Ordenar grupos: primeiro os com mais itens ou com CPF exato
  return groups.sort((a, b) => {
    if (b.items.length !== a.items.length) {
      return b.items.length - a.items.length;
    }
    if (a.matchType === "exact_both" || a.matchType === "exact_cpf") return -1;
    if (b.matchType === "exact_both" || b.matchType === "exact_cpf") return 1;
    return 0;
  });
}

/**
 * Cria a estrutura de DuplicateGroup calculando pontuações e pré-selecionando os excedentes para exclusão
 */
function buildDuplicateGroup(
  groupId: string,
  matchType: DuplicateMatchType,
  matchReason: string,
  rawItems: GeralCNH[]
): DuplicateGroup {
  const scoredItems = rawItems.map((item) => {
    const { score, reasons } = calculateRecordQualityScore(item);
    return {
      ...item,
      score,
      scoreReasons: reasons,
      isRecommendedKeep: false,
      selectedForDeletion: false,
    };
  });

  // Ordena por pontuação decrescente (o de maior pontuação fica no topo como recomendado)
  scoredItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.ordem || 0) - (a.ordem || 0);
  });

  // O primeiro é o recomendado para MANTER
  const bestRecord = scoredItems[0];
  bestRecord.isRecommendedKeep = true;
  bestRecord.selectedForDeletion = false;

  // Os outros são pré-selecionados para EXCLUSÃO
  for (let k = 1; k < scoredItems.length; k++) {
    scoredItems[k].isRecommendedKeep = false;
    scoredItems[k].selectedForDeletion = true;
  }

  // Verifica se há conflito de situações (ex: uma está Entregue e outra Pendente)
  const situacoes = new Set(rawItems.map((r) => r.situacao));
  const hasConflicts = situacoes.size > 1;

  return {
    groupId,
    matchType,
    matchReason,
    primaryRecordId: bestRecord.id,
    hasConflicts,
    items: scoredItems,
  };
}
