import { GeralCNH } from "../types";

/**
 * Matriz Oficial de Mapeamento Físico de Gaveta e Repartição
 * Baseada estritamente na nova tabela do DETRAN:
 * Linhas: Repartições 1 a 8
 * Colunas: Gavetas 1 a 4
 */

export interface MatrixRowDef {
  reparticao: number;
  label: string;
  gaveta1: string; // Letra(s)
  gaveta2: string;
  gaveta3: string;
  gaveta4: string;
}

export const MATRIZ_OFICIAL_ROWS: MatrixRowDef[] = [
  { reparticao: 1, label: "Repartição 1", gaveta1: "A", gaveta2: "G", gaveta3: "M", gaveta4: "U" },
  { reparticao: 2, label: "Repartição 2", gaveta1: "A", gaveta2: "H", gaveta3: "N", gaveta4: "V" },
  { reparticao: 3, label: "Repartição 3", gaveta1: "B", gaveta2: "I", gaveta3: "O", gaveta4: "Y" },
  { reparticao: 4, label: "Repartição 4", gaveta1: "C", gaveta2: "J", gaveta3: "P, Q", gaveta4: "W" },
  { reparticao: 5, label: "Repartição 5", gaveta1: "D", gaveta2: "J", gaveta3: "R", gaveta4: "Z" },
  { reparticao: 6, label: "Repartição 6", gaveta1: "E", gaveta2: "K", gaveta3: "R", gaveta4: "-" },
  { reparticao: 7, label: "Repartição 7", gaveta1: "F", gaveta2: "L", gaveta3: "S", gaveta4: "-" },
  { reparticao: 8, label: "Repartição 8", gaveta1: "G", gaveta2: "M", gaveta3: "T", gaveta4: "-" },
];

export interface DualLetterRule {
  letter: string;
  slot1: { gaveta: string; reparticao: string; description: string };
  slot2: { gaveta: string; reparticao: string; description: string };
  subinitialCut: string; // Ex: 'L' -> <= L vai pro slot 1, > L pro slot 2
}

export const DUAL_LETTER_RULES: Record<string, DualLetterRule> = {
  A: {
    letter: "A",
    slot1: { gaveta: "Gaveta 1", reparticao: "Repartição 1", description: "1ª Parte (A - AL)" },
    slot2: { gaveta: "Gaveta 1", reparticao: "Repartição 2", description: "2ª Parte (AM - AZ)" },
    subinitialCut: "L",
  },
  M: {
    letter: "M",
    slot1: { gaveta: "Gaveta 2", reparticao: "Repartição 8", description: "1ª Parte (MA - MI)" },
    slot2: { gaveta: "Gaveta 3", reparticao: "Repartição 1", description: "2ª Parte (MO - MZ)" },
    subinitialCut: "I",
  },
  G: {
    letter: "G",
    slot1: { gaveta: "Gaveta 1", reparticao: "Repartição 8", description: "1ª Parte (GA - GL)" },
    slot2: { gaveta: "Gaveta 2", reparticao: "Repartição 1", description: "2ª Parte (GM - GZ)" },
    subinitialCut: "L",
  },
  J: {
    letter: "J",
    slot1: { gaveta: "Gaveta 2", reparticao: "Repartição 4", description: "1ª Parte (JA - JL)" },
    slot2: { gaveta: "Gaveta 2", reparticao: "Repartição 5", description: "2ª Parte (JM - JZ)" },
    subinitialCut: "L",
  },
  R: {
    letter: "R",
    slot1: { gaveta: "Gaveta 3", reparticao: "Repartição 5", description: "1ª Parte (RA - RL)" },
    slot2: { gaveta: "Gaveta 3", reparticao: "Repartição 6", description: "2ª Parte (RM - RZ)" },
    subinitialCut: "L",
  },
};

// Mapeamento direto de letras com repartição única
export const SINGLE_LETTER_MAPPING: Record<string, { gaveta: string; reparticao: string }> = {
  B: { gaveta: "Gaveta 1", reparticao: "Repartição 3" },
  C: { gaveta: "Gaveta 1", reparticao: "Repartição 4" },
  D: { gaveta: "Gaveta 1", reparticao: "Repartição 5" },
  E: { gaveta: "Gaveta 1", reparticao: "Repartição 6" },
  F: { gaveta: "Gaveta 1", reparticao: "Repartição 7" },
  H: { gaveta: "Gaveta 2", reparticao: "Repartição 2" },
  I: { gaveta: "Gaveta 2", reparticao: "Repartição 3" },
  K: { gaveta: "Gaveta 2", reparticao: "Repartição 6" },
  L: { gaveta: "Gaveta 2", reparticao: "Repartição 7" },
  N: { gaveta: "Gaveta 3", reparticao: "Repartição 2" },
  O: { gaveta: "Gaveta 3", reparticao: "Repartição 3" },
  P: { gaveta: "Gaveta 3", reparticao: "Repartição 4" },
  Q: { gaveta: "Gaveta 3", reparticao: "Repartição 4" },
  S: { gaveta: "Gaveta 3", reparticao: "Repartição 7" },
  T: { gaveta: "Gaveta 3", reparticao: "Repartição 8" },
  U: { gaveta: "Gaveta 4", reparticao: "Repartição 1" },
  V: { gaveta: "Gaveta 4", reparticao: "Repartição 2" },
  W: { gaveta: "Gaveta 4", reparticao: "Repartição 4" },
  X: { gaveta: "Gaveta 4", reparticao: "Repartição 3" },
  Y: { gaveta: "Gaveta 4", reparticao: "Repartição 3" },
  Z: { gaveta: "Gaveta 4", reparticao: "Repartição 5" },
};

export type SmartRelocationMode = "balanced" | "subinitial";

export interface SmartLocationResult {
  gaveta: string;
  reparticao: string;
  ruleExplanation: string;
  isDual: boolean;
}

/**
 * Normaliza o nome removendo acentos e retornando caracteres em maiúsculo
 */
export function normalizeNameForMapping(nome?: string): string {
  if (!nome) return "";
  return nome.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Resolve a localização individual com base no critério de sub-inicial
 */
export function resolveLocationBySubinitial(nome: string): SmartLocationResult {
  const clean = normalizeNameForMapping(nome);
  const firstLetter = clean.charAt(0);
  const secondLetter = clean.charAt(1) || "A";

  if (DUAL_LETTER_RULES[firstLetter]) {
    const rule = DUAL_LETTER_RULES[firstLetter];
    const goesToSlot1 = secondLetter <= rule.subinitialCut;
    const target = goesToSlot1 ? rule.slot1 : rule.slot2;

    return {
      gaveta: target.gaveta,
      reparticao: target.reparticao,
      ruleExplanation: `${rule.letter} (${target.description})`,
      isDual: true,
    };
  }

  if (SINGLE_LETTER_MAPPING[firstLetter]) {
    const single = SINGLE_LETTER_MAPPING[firstLetter];
    return {
      gaveta: single.gaveta,
      reparticao: single.reparticao,
      ruleExplanation: `Letra ${firstLetter}`,
      isDual: false,
    };
  }

  // Fallback para nomes sem inicial alfabética (ex: números ou caracteres especiais)
  return {
    gaveta: "Gaveta 1",
    reparticao: "Repartição 1",
    ruleExplanation: "Padrão A-Z",
    isDual: false,
  };
}

export interface SmartRelocationItem {
  cnh: GeralCNH;
  currentGaveta: string;
  currentReparticao: string;
  targetGaveta: string;
  targetReparticao: string;
  needsChange: boolean;
  firstLetter: string;
  ruleExplanation: string;
  isDual: boolean;
}

export interface SmartRelocationAnalysis {
  total: number;
  alreadyAlignedCount: number;
  needsRelocationCount: number;
  missingLocationCount: number;
  byGaveta: Record<string, number>;
  byReparticao: Record<string, number>;
  dualStats: Record<string, { slot1Count: number; slot2Count: number; slot1Label: string; slot2Label: string }>;
  items: SmartRelocationItem[];
}

/**
 * Executa a análise e cálculo em lote da realocação inteligente
 */
export function analyzeSmartRelocation(
  cnhs: GeralCNH[],
  mode: SmartRelocationMode = "balanced"
): SmartRelocationAnalysis {
  // Inicialização de contadores
  const byGaveta: Record<string, number> = {
    "Gaveta 1": 0,
    "Gaveta 2": 0,
    "Gaveta 3": 0,
    "Gaveta 4": 0,
  };

  const byReparticao: Record<string, number> = {
    "Repartição 1": 0,
    "Repartição 2": 0,
    "Repartição 3": 0,
    "Repartição 4": 0,
    "Repartição 5": 0,
    "Repartição 6": 0,
    "Repartição 7": 0,
    "Repartição 8": 0,
  };

  const dualStats: Record<string, { slot1Count: number; slot2Count: number; slot1Label: string; slot2Label: string }> = {};
  Object.keys(DUAL_LETTER_RULES).forEach((key) => {
    const r = DUAL_LETTER_RULES[key];
    dualStats[key] = {
      slot1Count: 0,
      slot2Count: 0,
      slot1Label: `${r.slot1.reparticao} (${r.slot1.gaveta})`,
      slot2Label: `${r.slot2.reparticao} (${r.slot2.gaveta})`,
    };
  });

  // Agrupa CNHs por inicial para balanceamento de alta precisão
  const groupedByLetter: Record<string, GeralCNH[]> = {};
  cnhs.forEach((cnh) => {
    const clean = normalizeNameForMapping(cnh.nome);
    const letter = clean.charAt(0) || "A";
    if (!groupedByLetter[letter]) groupedByLetter[letter] = [];
    groupedByLetter[letter].push(cnh);
  });

  // Ordena alfabeticamente os grupos
  Object.keys(groupedByLetter).forEach((letter) => {
    groupedByLetter[letter].sort((a, b) =>
      normalizeNameForMapping(a.nome).localeCompare(normalizeNameForMapping(b.nome), "pt-BR")
    );
  });

  const analyzedItems: SmartRelocationItem[] = [];
  let alreadyAlignedCount = 0;
  let needsRelocationCount = 0;
  let missingLocationCount = 0;

  // Processa cada CNH
  cnhs.forEach((cnh) => {
    const clean = normalizeNameForMapping(cnh.nome);
    const firstLetter = clean.charAt(0) || "A";
    const currentGaveta = cnh.gaveta ? cnh.gaveta.trim() : "";
    const currentReparticao = cnh.reparticao ? cnh.reparticao.trim() : "";

    let targetGaveta = "Gaveta 1";
    let targetReparticao = "Repartição 1";
    let ruleExplanation = `Letra ${firstLetter}`;
    let isDual = false;

    if (DUAL_LETTER_RULES[firstLetter]) {
      isDual = true;
      const rule = DUAL_LETTER_RULES[firstLetter];

      if (mode === "balanced") {
        const group = groupedByLetter[firstLetter] || [];
        const indexInGroup = group.findIndex((item) => item.id === cnh.id);
        const half = Math.ceil(group.length / 2);

        if (indexInGroup < half) {
          targetGaveta = rule.slot1.gaveta;
          targetReparticao = rule.slot1.reparticao;
          ruleExplanation = `${firstLetter} (1º Lote Balanceado)`;
          dualStats[firstLetter].slot1Count++;
        } else {
          targetGaveta = rule.slot2.gaveta;
          targetReparticao = rule.slot2.reparticao;
          ruleExplanation = `${firstLetter} (2º Lote Balanceado)`;
          dualStats[firstLetter].slot2Count++;
        }
      } else {
        const res = resolveLocationBySubinitial(cnh.nome);
        targetGaveta = res.gaveta;
        targetReparticao = res.reparticao;
        ruleExplanation = res.ruleExplanation;

        if (targetReparticao === rule.slot1.reparticao && targetGaveta === rule.slot1.gaveta) {
          dualStats[firstLetter].slot1Count++;
        } else {
          dualStats[firstLetter].slot2Count++;
        }
      }
    } else if (SINGLE_LETTER_MAPPING[firstLetter]) {
      const single = SINGLE_LETTER_MAPPING[firstLetter];
      targetGaveta = single.gaveta;
      targetReparticao = single.reparticao;
      ruleExplanation = `Letra ${firstLetter}`;
    }

    // Contabiliza gaveta e repartição alvo
    if (byGaveta[targetGaveta] !== undefined) {
      byGaveta[targetGaveta]++;
    }
    if (byReparticao[targetReparticao] !== undefined) {
      byReparticao[targetReparticao]++;
    }

    const hasMissingLocation = !currentGaveta || !currentReparticao;
    if (hasMissingLocation) {
      missingLocationCount++;
    }

    // Normaliza textos para comparação direta (ex: "Gaveta 1" vs "1" ou "G1")
    const cleanCurrentGav = currentGaveta.replace(/\D/g, "");
    const cleanTargetGav = targetGaveta.replace(/\D/g, "");
    const cleanCurrentRep = currentReparticao.replace(/\D/g, "");
    const cleanTargetRep = targetReparticao.replace(/\D/g, "");

    const isMatch =
      cleanCurrentGav !== "" &&
      cleanCurrentRep !== "" &&
      cleanCurrentGav === cleanTargetGav &&
      cleanCurrentRep === cleanTargetRep;

    const needsChange = !isMatch;

    if (needsChange) {
      needsRelocationCount++;
    } else {
      alreadyAlignedCount++;
    }

    analyzedItems.push({
      cnh,
      currentGaveta: currentGaveta || "Sem gaveta",
      currentReparticao: currentReparticao || "Sem repartição",
      targetGaveta,
      targetReparticao,
      needsChange,
      firstLetter,
      ruleExplanation,
      isDual,
    });
  });

  return {
    total: cnhs.length,
    alreadyAlignedCount,
    needsRelocationCount,
    missingLocationCount,
    byGaveta,
    byReparticao,
    dualStats,
    items: analyzedItems,
  };
}
