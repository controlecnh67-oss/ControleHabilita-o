import { GeralCNH } from "../types";
import { normalizeString, cleanCpfDigits } from "./ocrService";

export type DuplicateMatchType = "exact_cpf" | "exact_name" | "exact_both" | "exact_pa";

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
  hasSameCpf: boolean;
  hasSameName: boolean;
  hasSamePa: boolean;
  items: DuplicateItem[];
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

  // Tem PA válido (Processo do candidato)
  const cleanPa = (record.pa || "").replace(/\D/g, "");
  if (cleanPa.length >= 4) {
    score += 25;
    reasons.push("PA cadastrado (+25)");
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
 * Realiza uma varredura ULTRA-RÁPIDA O(N) com indexação por Hash Maps
 * Agrupa exclusivamente por:
 * 1. CPF exato
 * 2. PA exato
 * 3. Nome exato
 * Sem similaridade de nomes e sem tratamentos por conflitos de situação.
 */
export function scanForDuplicates(cnhs: GeralCNH[]): DuplicateGroup[] {
  if (!cnhs || cnhs.length < 2) return [];

  const assignedToGroup = new Set<string>();
  const groups: DuplicateGroup[] = [];

  // Pré-computa normalizações de forma linear O(N)
  const prepared = cnhs.map((item) => {
    const cpfDigits = cleanCpfDigits(item.cpf || "");
    const normName = normalizeString(item.nome || "").trim();
    const cleanPa = (item.pa || "").replace(/\D/g, "");
    return {
      item,
      cpfDigits,
      normName,
      cleanPa,
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
        const allSameName = firstNorm.length > 2 && unassigned.every((e) => e.normName === firstNorm);
        const firstPa = unassigned[0].cleanPa;
        const allSamePa = firstPa.length >= 4 && unassigned.every((e) => e.cleanPa === firstPa);

        let matchType: DuplicateMatchType = "exact_cpf";
        if (allSameName) matchType = "exact_both";

        let matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf})`;
        if (allSameName && allSamePa) {
          matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf}), Mesmo Nome e Mesmo PA (${unassigned[0].item.pa || firstPa})`;
        } else if (allSameName) {
          matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf}) e Mesmo Nome`;
        } else if (allSamePa) {
          matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf}) e Mesmo PA (${unassigned[0].item.pa || firstPa})`;
        }

        const rawItems = unassigned.map((e) => e.item);
        const group = buildDuplicateGroup(
          `cpf_${cpf}`,
          matchType,
          matchReason,
          rawItems,
          true,
          allSameName,
          allSamePa
        );
        groups.push(group);
        unassigned.forEach((e) => assignedToGroup.add(e.item.id));
      }
    }
  });

  // 2. Agrupamento O(N) por PA Limpo (>= 4 dígitos) para registros ainda não associados
  const paMap = new Map<string, typeof prepared>();
  prepared.forEach((entry) => {
    if (!assignedToGroup.has(entry.item.id) && entry.cleanPa.length >= 4) {
      const list = paMap.get(entry.cleanPa) || [];
      list.push(entry);
      paMap.set(entry.cleanPa, list);
    }
  });

  paMap.forEach((entries, cleanPa) => {
    const unassigned = entries.filter((e) => !assignedToGroup.has(e.item.id));
    if (unassigned.length > 1) {
      const firstNorm = unassigned[0].normName;
      const allSameName = firstNorm.length > 2 && unassigned.every((e) => e.normName === firstNorm);

      let matchReason = `Mesmo PA (${unassigned[0].item.pa || cleanPa})`;
      if (allSameName) {
        matchReason = `Mesmo PA (${unassigned[0].item.pa || cleanPa}) e Mesmo Nome`;
      }

      const rawItems = unassigned.map((e) => e.item);
      const group = buildDuplicateGroup(
        `pa_${cleanPa}`,
        "exact_pa",
        matchReason,
        rawItems,
        false,
        allSameName,
        true
      );
      groups.push(group);
      unassigned.forEach((e) => assignedToGroup.add(e.item.id));
    }
  });

  // 3. Agrupamento O(N) por Nome Normalizado Exato para registros ainda não associados
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
        rawItems,
        false,
        true,
        false
      );
      groups.push(group);
      unassigned.forEach((e) => assignedToGroup.add(e.item.id));
    }
  });

  // Ordenar grupos: primeiro grupos com mais itens, ou por CPF, depois PA, depois Nome
  return groups.sort((a, b) => {
    if (b.items.length !== a.items.length) {
      return b.items.length - a.items.length;
    }
    if (a.hasSameCpf && !b.hasSameCpf) return -1;
    if (!a.hasSameCpf && b.hasSameCpf) return 1;
    if (a.hasSamePa && !b.hasSamePa) return -1;
    if (!a.hasSamePa && b.hasSamePa) return 1;
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
  rawItems: GeralCNH[],
  hasSameCpf: boolean,
  hasSameName: boolean,
  hasSamePa: boolean
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

  return {
    groupId,
    matchType,
    matchReason,
    primaryRecordId: bestRecord.id,
    hasSameCpf,
    hasSameName,
    hasSamePa,
    items: scoredItems,
  };
}
