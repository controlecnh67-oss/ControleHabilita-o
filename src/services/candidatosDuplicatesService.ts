import { CandidatoEnriquecido } from "../pages/CandidatosPage";
import { normalizeString, cleanCpfDigits, cleanPaDigits, calculateNameSimilarity } from "./ocrService";

export type CandidateDuplicateType =
  | "exact_cpf"
  | "exact_pa"
  | "exact_name"
  | "exact_cpf_name"
  | "similar_name";

export interface CandidateDuplicateItem extends CandidatoEnriquecido {
  isRecommendedKeep: boolean;
  selectedForDeletion: boolean;
  score: number;
  scoreReasons: string[];
}

export interface CandidateDuplicateGroup {
  groupId: string;
  matchType: CandidateDuplicateType;
  matchReason: string;
  duplicateScope: "mesmo_memorando" | "memorandos_diferentes";
  primaryRecordId: string;
  items: CandidateDuplicateItem[];
}

/**
 * Calcula uma pontuação de qualidade/integridade para o candidato.
 * Candidatos com CNH já na Tabela Geral ou em Memorando Remetido recebem maior pontuação
 * para serem preservados preferencialmente em relação a registros redundantes ou em rascunho.
 */
export function calculateCandidateQualityScore(cand: CandidatoEnriquecido): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  // 1. CNH já gerada na Tabela Geral (prioridade máxima para preservar integridade referencial)
  if (cand.cnh_id) {
    score += 100;
    reasons.push("CNH registrada na Tabela Geral (+100)");
  }

  // 2. Status do Memorando de Origem
  if (cand.memorando_status === "Remetido") {
    score += 60;
    reasons.push("Memorando já Remetido (+60)");
  } else if (cand.memorando_status === "Recebido") {
    score += 40;
    reasons.push("Memorando Recebido (+40)");
  } else {
    score += 20;
    reasons.push("Memorando em Elaboração (+20)");
  }

  // 3. Completude dos dados cadastrais
  const cpfDigits = cleanCpfDigits(cand.cpf || "");
  if (cpfDigits.length === 11) {
    score += 25;
    reasons.push("CPF completo de 11 dígitos (+25)");
  }

  const paDigits = cleanPaDigits(cand.pa || "");
  if (paDigits.length >= 4) {
    score += 15;
    reasons.push("Processo PA registrado (+15)");
  }

  if (cand.telefone && cand.telefone.replace(/\D/g, "").length >= 8) {
    score += 10;
    reasons.push("Telefone informado (+10)");
  }

  // 4. Data de cadastro (desempate: o registro mais consolidado)
  if (cand.created_at) {
    const timestamp = new Date(cand.created_at).getTime();
    if (!isNaN(timestamp)) {
      // Pequeno bônus para o registro mais antigo
      score += Math.max(0, 10 - Math.min(10, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24 * 30))));
    }
  }

  return { score, reasons };
}

/**
 * Executa a varredura inteligente por registros de candidatos duplicados.
 * Agrupa por CPF exato, Processo (PA) exato, Nome exato ou alta similaridade.
 */
export function scanCandidatosDuplicates(
  candidatos: CandidatoEnriquecido[]
): CandidateDuplicateGroup[] {
  if (!candidatos || candidatos.length < 2) return [];

  // 1. Mapeamentos indexados para busca rápida O(1)
  const cpfMap = new Map<string, CandidatoEnriquecido[]>();
  const paMap = new Map<string, CandidatoEnriquecido[]>();
  const nameMap = new Map<string, CandidatoEnriquecido[]>();

  for (const c of candidatos) {
    const cpf = cleanCpfDigits(c.cpf);
    if (cpf.length === 11) {
      if (!cpfMap.has(cpf)) cpfMap.set(cpf, []);
      cpfMap.get(cpf)!.push(c);
    }

    const pa = cleanPaDigits(c.pa);
    if (pa.length >= 4) {
      if (!paMap.has(pa)) paMap.set(pa, []);
      paMap.get(pa)!.push(c);
    }

    const normName = normalizeString(c.nome);
    if (normName.length >= 4) {
      if (!nameMap.has(normName)) nameMap.set(normName, []);
      nameMap.get(normName)!.push(c);
    }
  }

  // 2. Disjoint-Set / Union-Find para agrupar candidatos conectados
  const parent = new Map<string, string>();
  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!));
    }
    return parent.get(id)!;
  }

  function union(idA: string, idB: string) {
    const rootA = find(idA);
    const rootB = find(idB);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  }

  const matchReasonsMap = new Map<string, { type: CandidateDuplicateType; reason: string }>();

  // Agrupar por CPF exato (prioridade 1)
  for (const [cpf, list] of cpfMap.entries()) {
    if (list.length > 1) {
      const firstId = list[0].id;
      for (let i = 1; i < list.length; i++) {
        union(firstId, list[i].id);
      }
      matchReasonsMap.set(firstId, {
        type: "exact_cpf",
        reason: `Mesmo CPF (${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")})`,
      });
    }
  }

  // Agrupar por PA exato (prioridade 2)
  for (const [pa, list] of paMap.entries()) {
    if (list.length > 1) {
      const firstId = list[0].id;
      for (let i = 1; i < list.length; i++) {
        union(firstId, list[i].id);
      }
      if (!matchReasonsMap.has(firstId)) {
        matchReasonsMap.set(firstId, {
          type: "exact_pa",
          reason: `Mesmo Processo/PA (${pa})`,
        });
      }
    }
  }

  // Agrupar por Nome exato (prioridade 3)
  for (const [name, list] of nameMap.entries()) {
    if (list.length > 1) {
      const firstId = list[0].id;
      for (let i = 1; i < list.length; i++) {
        union(firstId, list[i].id);
      }
      if (!matchReasonsMap.has(firstId)) {
        matchReasonsMap.set(firstId, {
          type: "exact_name",
          reason: `Mesmo Nome Completo (${list[0].nome})`,
        });
      } else {
        // Se já casou por CPF ou PA, enriquece
        const existing = matchReasonsMap.get(firstId)!;
        if (existing.type === "exact_cpf") {
          existing.type = "exact_cpf_name";
          existing.reason = `Mesmo CPF e Mesmo Nome (${list[0].nome})`;
        }
      }
    }
  }

  // Similaridade fonética/alta em nomes com mesmo primeiro e último sobrenome
  // Apenas para candidatos que ainda não estão unidos
  const nameBuckets = new Map<string, CandidatoEnriquecido[]>();
  for (const c of candidatos) {
    const norm = normalizeString(c.nome);
    const words = norm.split(" ").filter((w) => w.length > 1);
    if (words.length >= 2) {
      const key = `${words[0]}_${words[words.length - 1]}`;
      if (!nameBuckets.has(key)) nameBuckets.set(key, []);
      nameBuckets.get(key)!.push(c);
    }
  }

  for (const [, bucket] of nameBuckets.entries()) {
    if (bucket.length > 1 && bucket.length <= 15) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i];
          const b = bucket[j];
          if (find(a.id) === find(b.id)) continue;

          const sim = calculateNameSimilarity(a.nome, b.nome);
          if (sim >= 88) {
            union(a.id, b.id);
            if (!matchReasonsMap.has(a.id)) {
              matchReasonsMap.set(a.id, {
                type: "similar_name",
                reason: `Similaridade de Nome (${sim}% - ${a.nome} vs ${b.nome})`,
              });
            }
          }
        }
      }
    }
  }

  // 3. Montar os clusters finais
  const clusterMap = new Map<string, CandidatoEnriquecido[]>();
  for (const c of candidatos) {
    const root = find(c.id);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(c);
  }

  const groups: CandidateDuplicateGroup[] = [];
  let groupIndex = 1;

  for (const [rootId, members] of clusterMap.entries()) {
    if (members.length < 2) continue; // Não é duplicata

    // Calcular pontuação de cada membro
    const scoredMembers: CandidateDuplicateItem[] = members.map((cand) => {
      const { score, reasons } = calculateCandidateQualityScore(cand);
      return {
        ...cand,
        isRecommendedKeep: false,
        selectedForDeletion: true,
        score,
        scoreReasons: reasons,
      };
    });

    // Ordenar decrescente por score (o melhor fica no topo)
    scoredMembers.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Desempate por data de criação mais antiga
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    });

    // O primeiro é o recomendado para MANTER
    scoredMembers[0].isRecommendedKeep = true;
    scoredMembers[0].selectedForDeletion = false;

    // Verificar escopo: se todos pertencem ao mesmo memorando ou a memorandos diferentes
    const memoIds = new Set(members.map((m) => m.memorando_id));
    const duplicateScope = memoIds.size === 1 ? "mesmo_memorando" : "memorandos_diferentes";

    // Determinar motivo
    let matchMeta = matchReasonsMap.get(rootId);
    if (!matchMeta) {
      // Checar se compartilham CPF
      const cpfs = new Set(members.map((m) => cleanCpfDigits(m.cpf)).filter((c) => c.length === 11));
      if (cpfs.size === 1) {
        matchMeta = { type: "exact_cpf", reason: `Mesmo CPF (${Array.from(cpfs)[0]})` };
      } else {
        matchMeta = { type: "exact_name", reason: `Mesmo Nome (${members[0].nome})` };
      }
    }

    groups.push({
      groupId: `dup_cand_grp_${groupIndex++}_${rootId.substring(0, 8)}`,
      matchType: matchMeta.type,
      matchReason: matchMeta.reason,
      duplicateScope,
      primaryRecordId: scoredMembers[0].id,
      items: scoredMembers,
    });
  }

  // Ordenar grupos: primeiro os com duplicações no mesmo memorando (mais críticas para limpeza rápida)
  // depois pelo tamanho do grupo
  groups.sort((a, b) => {
    if (a.duplicateScope === "mesmo_memorando" && b.duplicateScope !== "mesmo_memorando") return -1;
    if (b.duplicateScope === "mesmo_memorando" && a.duplicateScope !== "mesmo_memorando") return 1;
    return b.items.length - a.items.length;
  });

  return groups;
}
