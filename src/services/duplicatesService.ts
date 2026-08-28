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
 * Calcula uma pontuação de qualidade/completude para um registro CNH
 * para sugerir qual deve ser MANTIDO e qual deve ser EXCLUÍDO.
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
  const cpfDigits = cleanCpfDigits(record.cpf);
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
 * Realiza uma varredura completa na lista geral de CNHs em busca de duplicatas
 * por CPF exato, Nome exato ou Nome com alta similaridade.
 */
export function scanForDuplicates(cnhs: GeralCNH[]): DuplicateGroup[] {
  if (!cnhs || cnhs.length < 2) return [];

  // Mapa de registros já agrupados para não duplicar grupos
  const assignedToGroup = new Set<string>();
  const groups: DuplicateGroup[] = [];

  // Indexação rápida por CPF limpo (apenas com 11 dígitos)
  const cpfMap = new Map<string, GeralCNH[]>();
  // Indexação por Nome Normalizado
  const nameMap = new Map<string, GeralCNH[]>();

  cnhs.forEach((item) => {
    const cpfDigits = cleanCpfDigits(item.cpf);
    if (cpfDigits.length === 11) {
      if (!cpfMap.has(cpfDigits)) cpfMap.set(cpfDigits, []);
      cpfMap.get(cpfDigits)!.push(item);
    }

    const normName = normalizeString(item.nome);
    if (normName.length > 2) {
      if (!nameMap.has(normName)) nameMap.set(normName, []);
      nameMap.get(normName)!.push(item);
    }
  });

  // 1. Agrupamento por CPF Exato (Prioridade Máxima)
  cpfMap.forEach((records, cpf) => {
    if (records.length > 1) {
      const unassigned = records.filter((r) => !assignedToGroup.has(r.id));
      if (unassigned.length > 1) {
        // Verifica se os nomes são todos iguais ou similares
        const firstNormName = normalizeString(unassigned[0].nome);
        const allSameName = unassigned.every((r) => normalizeString(r.nome) === firstNormName);
        const matchType: DuplicateMatchType = allSameName ? "exact_both" : "exact_cpf";
        const matchReason = allSameName
          ? `Mesmo CPF (${unassigned[0].cpf || cpf}) e Mesmo Nome`
          : `Mesmo CPF (${unassigned[0].cpf || cpf})`;

        const group = buildDuplicateGroup(`cpf_${cpf}`, matchType, matchReason, unassigned);
        groups.push(group);
        unassigned.forEach((r) => assignedToGroup.add(r.id));
      }
    }
  });

  // 2. Agrupamento por Nome Normalizado Exato (para os que ainda não foram agrupados)
  nameMap.forEach((records, normName) => {
    const unassigned = records.filter((r) => !assignedToGroup.has(r.id));
    if (unassigned.length > 1) {
      const matchReason = `Mesmo Nome (${records[0].nome})`;
      const group = buildDuplicateGroup(`name_${normName.replace(/\s+/g, "_")}`, "exact_name", matchReason, unassigned);
      groups.push(group);
      unassigned.forEach((r) => assignedToGroup.add(r.id));
    }
  });

  // 3. Varredura por Similaridade de Nome (> 88%) entre os registros restantes
  const remaining = cnhs.filter((r) => !assignedToGroup.has(r.id));
  for (let i = 0; i < remaining.length; i++) {
    const current = remaining[i];
    if (assignedToGroup.has(current.id)) continue;

    const similarMatches: GeralCNH[] = [current];

    for (let j = i + 1; j < remaining.length; j++) {
      const candidate = remaining[j];
      if (assignedToGroup.has(candidate.id)) continue;

      const sim = calculateNameSimilarity(current.nome, candidate.nome);
      if (sim >= 88) {
        const cpfA = cleanCpfDigits(current.cpf);
        const cpfB = cleanCpfDigits(candidate.cpf);
        // Se ambos tiverem CPFs e forem diferentes, não agrupa para evitar falsos positivos
        if (cpfA.length === 11 && cpfB.length === 11 && cpfA !== cpfB) {
          continue;
        }

        similarMatches.push(candidate);
      }
    }

    if (similarMatches.length > 1) {
      const matchReason = `Nomes Muito Similares (${similarMatches.map((s) => s.nome).join(" ≈ ")})`;
      const group = buildDuplicateGroup(
        `sim_${current.id}`,
        "similar_name",
        matchReason,
        similarMatches
      );
      groups.push(group);
      similarMatches.forEach((r) => assignedToGroup.add(r.id));
    }
  }

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
