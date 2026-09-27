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
  // REGRA DE OURO DETRAN: O número PA é único para cada processo.
  // Um cidadão pode ter mais de um registro com o mesmo CPF e Nome se tiverem PAs diferentes (renovações, adição de categoria, etc.).
  // Esses registros possuem ordens distintas e NÃO são duplicatas!
  // Apenas registros com o MESMO CPF E MESMO PA (ou ambos sem PA) são duplicatas a serem saneadas.
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
      // Sub-agrupa por PA limpo para não misturar processos/renovações legítimas
      const paSubMap = new Map<string, typeof prepared>();
      entries.forEach((e) => {
        const paKey = e.cleanPa.length >= 4 ? e.cleanPa : "SEM_PA";
        const list = paSubMap.get(paKey) || [];
        list.push(e);
        paSubMap.set(paKey, list);
      });

      paSubMap.forEach((subEntries, paKey) => {
        if (subEntries.length > 1) {
          const unassigned = subEntries.filter((e) => !assignedToGroup.has(e.item.id));
          if (unassigned.length > 1) {
            const firstNorm = unassigned[0].normName;
            const allSameName = firstNorm.length > 2 && unassigned.every((e) => e.normName === firstNorm);
            const hasRealPa = paKey !== "SEM_PA";

            let matchType: DuplicateMatchType = "exact_cpf";
            if (hasRealPa && allSameName) matchType = "exact_both";
            else if (hasRealPa) matchType = "exact_pa";

            let matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf})`;
            if (hasRealPa && allSameName) {
              matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf}), Mesmo Nome e Mesmo PA (${unassigned[0].item.pa || paKey}) [Processo Duplicado]`;
            } else if (hasRealPa) {
              matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf}) e Mesmo PA (${unassigned[0].item.pa || paKey}) [Processo Duplicado]`;
            } else if (allSameName) {
              matchReason = `Mesmo CPF (${unassigned[0].item.cpf || cpf}) e Mesmo Nome (Ambos sem PA)`;
            }

            const rawItems = unassigned.map((e) => e.item);
            const group = buildDuplicateGroup(
              `cpf_${cpf}_pa_${paKey}`,
              matchType,
              matchReason,
              rawItems,
              true,
              allSameName,
              hasRealPa
            );
            groups.push(group);
            unassigned.forEach((e) => assignedToGroup.add(e.item.id));
          }
        }
      });
    }
  });

  // 2. Agrupamento O(N) por PA Limpo (>= 4 dígitos) para registros ainda não associados
  // O número PA é único por processo; se dois registros têm o mesmo PA, são duplicatas do mesmo processo!
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
      const firstCpf = unassigned[0].cpfDigits;
      const allSameCpf = firstCpf.length === 11 && unassigned.every((e) => e.cpfDigits === firstCpf);

      let matchReason = `Mesmo PA (${unassigned[0].item.pa || cleanPa}) [Processo Duplicado]`;
      if (allSameName && allSameCpf) {
        matchReason = `Mesmo PA (${unassigned[0].item.pa || cleanPa}), Mesmo CPF e Mesmo Nome`;
      } else if (allSameName) {
        matchReason = `Mesmo PA (${unassigned[0].item.pa || cleanPa}) e Mesmo Nome`;
      }

      const rawItems = unassigned.map((e) => e.item);
      const group = buildDuplicateGroup(
        `pa_${cleanPa}`,
        "exact_pa",
        matchReason,
        rawItems,
        allSameCpf,
        allSameName,
        true
      );
      groups.push(group);
      unassigned.forEach((e) => assignedToGroup.add(e.item.id));
    }
  });

  // 3. Agrupamento O(N) por Nome Normalizado Exato para registros ainda não associados
  // ATENÇÃO: Só agrupa se NÃO houver CPFs válidos conflitantes E NÃO houver PAs válidos conflitantes
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
      // Filtra para garantir que não estamos agrupando pessoas com CPFs distintos ou PAs distintos
      const cpfs = new Set(unassigned.map(e => e.cpfDigits).filter(c => c.length === 11));
      const pas = new Set(unassigned.map(e => e.cleanPa).filter(p => p.length >= 4));

      // Se há múltiplos CPFs diferentes ou múltiplos PAs diferentes, são condutores ou processos distintos!
      if (cpfs.size <= 1 && pas.size <= 1) {
        const matchReason = `Mesmo Nome (${unassigned[0].item.nome}) sem divergência de CPF/PA`;
        const rawItems = unassigned.map((e) => e.item);
        const group = buildDuplicateGroup(
          `name_${normName.replace(/\s+/g, "_")}`,
          "exact_name",
          matchReason,
          rawItems,
          cpfs.size === 1,
          true,
          pas.size === 1
        );
        groups.push(group);
        unassigned.forEach((e) => assignedToGroup.add(e.item.id));
      }
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
