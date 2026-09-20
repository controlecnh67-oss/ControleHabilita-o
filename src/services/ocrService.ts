import { GeralCNH } from "../types";
import { findLocalizacaoPorNome } from "./db";

export interface ExtractedCnhItem {
  nome: string;
  cpf?: string;
  pa?: string; // Número identificador único de CNH (9 dígitos)
  remessa?: string;
  observacao?: string;
}

export type OcrMatchType = "exact_pa" | "exact_cpf" | "exact_name" | "similar_name" | "none";
export type OcrCategory = "ready_to_receive" | "pending" | "already_received" | "already_delivered" | "not_found";

export interface OcrMatchResult {
  id: string;
  extracted: ExtractedCnhItem;
  cnhMatched: GeralCNH | null;
  matchType: OcrMatchType;
  matchScore: number;
  category: OcrCategory;
  selected: boolean;
  suggestedGaveta: string;
  suggestedReparticao: string;
}

export interface OcrApiResponse {
  success: boolean;
  count: number;
  items: ExtractedCnhItem[];
  fileName?: string;
  error?: string;
}

/**
 * Remove acentos e normaliza para caixa alta e espaços únicos
 */
export function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Extrai apenas dígitos do CPF
 */
export function cleanCpfDigits(cpf?: string): string {
  if (!cpf) return "";
  return cpf.replace(/\D/g, "");
}

/**
 * Extrai apenas dígitos do PA (sem restrição arbitrária de comprimento mínimo)
 */
export function cleanPaDigits(pa?: string): string {
  if (!pa) return "";
  return String(pa).replace(/\D/g, "");
}

/**
 * Normaliza PA alfanumérico (letras maiúsculas e números sem separadores)
 */
export function normalizePa(pa?: string): string {
  if (!pa) return "";
  return String(pa).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Calcula similaridade de tokens/palavras entre duas strings (0 a 100)
 */
export function calculateNameSimilarity(nameA: string, nameB: string): number {
  const normA = normalizeString(nameA);
  const normB = normalizeString(nameB);

  if (normA === normB) return 100;
  if (!normA || !normB) return 0;

  const wordsA = normA.split(" ").filter(w => w.length > 1);
  const wordsB = normB.split(" ").filter(w => w.length > 1);

  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setB = new Set(wordsB);
  const intersection = wordsA.filter(w => setB.has(w));

  const overlapScore = (2 * intersection.length) / (wordsA.length + wordsB.length) * 100;

  // Se o primeiro e o último sobrenome forem iguais, dá bônus
  const sameFirst = wordsA[0] === wordsB[0];
  const sameLast = wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1];

  let finalScore = overlapScore;
  if (sameFirst && sameLast && intersection.length >= 2) {
    finalScore = Math.max(finalScore, 85);
  }

  return Math.round(finalScore);
}

/**
 * Envia arquivo (PDF ou Imagem) para o endpoint de OCR com Gemini no backend
 */
export async function scanCnhDocumentOcr(
  fileData: string,
  mimeType: string,
  fileName: string
): Promise<OcrApiResponse> {
  let res: Response;
  try {
    res = await fetch("/api/ocr/cnh-list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileData,
        mimeType,
        fileName,
      }),
    });
  } catch (networkErr: any) {
    throw new Error(`Falha de conexão com o servidor ao enviar o arquivo: ${networkErr.message || "Verifique sua internet ou tente novamente."}`);
  }

  const rawText = await res.text();
  if (!rawText || rawText.trim().length === 0) {
    throw new Error(`O servidor retornou uma resposta vazia (HTTP ${res.status}). O arquivo pode ser muito grande ou houve um encerramento inesperado.`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (parseErr) {
    throw new Error(`Resposta inválida do servidor: ${rawText.slice(0, 150)}`);
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error || "Falha ao processar o documento via OCR.");
  }

  return data;
}

export interface MatchCnhOptions {
  /**
   * Se false, desativa completamente a localização por similaridade de nome (fuzzy match).
   * Apenas aceita correspondências exatas por Nome, PA ou CPF.
   * Padrão no Excel de Recebimento: false.
   */
  allowSimilarName?: boolean;
  /**
   * Quantidade mínima de dígitos numéricos para considerar um PA válido isoladamente.
   * Padrão: 4.
   */
  minPaDigits?: number;
}

/**
 * Cruza itens extraídos da planilha Excel ou OCR com a base geral de CNHs
 * A correspondência se dá pelo PA (Identificador Único CNH), Nome e CPF.
 */
export async function matchExtractedWithGeralCNHs(
  extractedList: ExtractedCnhItem[],
  geralList: GeralCNH[],
  options?: MatchCnhOptions
): Promise<OcrMatchResult[]> {
  const allowSimilarName = options?.allowSimilarName ?? false;
  const minPaDigits = options?.minPaDigits ?? 4;
  const results: OcrMatchResult[] = [];
  const usedCnhIds = new Set<string>();

  // Pré-indexar geral por PA limpo/normalizado, CPF limpo, Nome e combinação Nome+PA
  const namePaMap = new Map<string, GeralCNH[]>();
  const paMap = new Map<string, GeralCNH[]>();
  const cpfMap = new Map<string, GeralCNH[]>();
  const nameMap = new Map<string, GeralCNH[]>();

  for (const cnh of geralList) {
    const paClean = cleanPaDigits(cnh.pa);
    const paNorm = normalizePa(cnh.pa);
    const normName = normalizeString(cnh.nome);
    const cpfClean = cleanCpfDigits(cnh.cpf);

    if (normName && paClean) {
      const key = `${normName}:::${paClean}`;
      const arr = namePaMap.get(key) || [];
      arr.push(cnh);
      namePaMap.set(key, arr);
    }
    if (normName && paNorm && paNorm !== paClean) {
      const key = `${normName}:::${paNorm}`;
      const arr = namePaMap.get(key) || [];
      arr.push(cnh);
      namePaMap.set(key, arr);
    }

    if (paClean.length >= minPaDigits) {
      const arr = paMap.get(paClean) || [];
      arr.push(cnh);
      paMap.set(paClean, arr);
    }
    if (paNorm.length >= minPaDigits && paNorm !== paClean) {
      const arr = paMap.get(paNorm) || [];
      arr.push(cnh);
      paMap.set(paNorm, arr);
    }

    if (cpfClean.length >= 11) {
      const arr = cpfMap.get(cpfClean) || [];
      arr.push(cnh);
      cpfMap.set(cpfClean, arr);
    }

    if (normName) {
      const arr = nameMap.get(normName) || [];
      arr.push(cnh);
      nameMap.set(normName, arr);
    }
  }

  for (let idx = 0; idx < extractedList.length; idx++) {
    const item = extractedList[idx];
    const itemPaClean = cleanPaDigits(item.pa);
    const itemPaNorm = normalizePa(item.pa);
    const itemCpfClean = cleanCpfDigits(item.cpf);
    const itemNormName = normalizeString(item.nome);

    let matchedCnh: GeralCNH | null = null;
    let matchType: OcrMatchType = "none";
    let matchScore = 0;

    // 1. TENTATIVA 1: Correspondência Dupla Perfeita (NOME exato + PA exato simultâneos)
    if (itemNormName && (itemPaClean || itemPaNorm)) {
      const key1 = itemPaClean ? `${itemNormName}:::${itemPaClean}` : "";
      const key2 = itemPaNorm ? `${itemNormName}:::${itemPaNorm}` : "";
      const matches = (key1 && namePaMap.get(key1)) || (key2 && namePaMap.get(key2));
      if (matches && matches.length > 0) {
        const remetidaMatch = matches.find(m => !usedCnhIds.has(m.id) && m.situacao === "Remetida");
        const unusedMatch = matches.find(m => !usedCnhIds.has(m.id));
        matchedCnh = remetidaMatch || unusedMatch || matches[0];
        matchType = "exact_pa";
        matchScore = 100;
      }
    }

    // 1.1 TENTATIVA 1.1: PA exato com Nome Altamente Similar (>= 75% de similaridade) - Apenas se allowSimilarName ativado
    if (allowSimilarName && !matchedCnh && (itemPaClean.length >= minPaDigits || itemPaNorm.length >= minPaDigits) && itemNormName) {
      const matches = (itemPaClean && paMap.get(itemPaClean)) || (itemPaNorm && paMap.get(itemPaNorm));
      if (matches && matches.length > 0) {
        const closeName = matches.find(m => !usedCnhIds.has(m.id) && calculateNameSimilarity(item.nome, m.nome) >= 75);
        if (closeName) {
          matchedCnh = closeName;
          matchType = "exact_pa";
          matchScore = 98;
        }
      }
    }

    // 2. TENTATIVA 2: Correspondência Exata por Nome Completo
    if (!matchedCnh && itemNormName && nameMap.has(itemNormName)) {
      const matches = nameMap.get(itemNormName)!;
      // Se tiver PA na planilha, preferir correspondência com mesmo PA ou PA ainda vazio no sistema
      let candidate = matches.find(m => !usedCnhIds.has(m.id) && (!m.pa || cleanPaDigits(m.pa) === itemPaClean));
      if (!candidate) {
        candidate = matches.find(m => !usedCnhIds.has(m.id) && m.situacao === "Remetida");
      }
      if (!candidate) {
        candidate = matches.find(m => !usedCnhIds.has(m.id));
      }
      if (candidate) {
        matchedCnh = candidate;
        matchType = "exact_name";
        matchScore = 95;
      }
    }

    // 3. TENTATIVA 3: Correspondência por PA
    if (!matchedCnh && (itemPaClean.length >= minPaDigits || itemPaNorm.length >= minPaDigits)) {
      const matches = (itemPaClean && paMap.get(itemPaClean)) || (itemPaNorm && paMap.get(itemPaNorm));
      if (matches && matches.length > 0) {
        if (itemNormName && itemNormName !== "CONDUTOR") {
          if (allowSimilarName) {
            // Se similaridade permitida, aceita compatibilidade >= 50%
            const compatible = matches.find(m => !usedCnhIds.has(m.id) && calculateNameSimilarity(item.nome, m.nome) >= 50);
            if (compatible) {
              matchedCnh = compatible;
              matchType = "exact_pa";
              matchScore = 90;
            }
          } else {
            // Modo Estrito: só casa por PA se o nome for idêntico ou se for o condutor correto
            const exactNameMatch = matches.find(m => !usedCnhIds.has(m.id) && normalizeString(m.nome) === itemNormName);
            if (exactNameMatch) {
              matchedCnh = exactNameMatch;
              matchType = "exact_pa";
              matchScore = 100;
            }
          }
        } else {
          // Planilha não informou nome (apenas PA)
          const remetidaMatch = matches.find(m => !usedCnhIds.has(m.id) && m.situacao === "Remetida");
          const unusedMatch = matches.find(m => !usedCnhIds.has(m.id));
          matchedCnh = remetidaMatch || unusedMatch || matches[0];
          matchType = "exact_pa";
          matchScore = 90;
        }
      }
    }

    // 4. TENTATIVA 4: Correspondência Exata por CPF (se presente)
    if (!matchedCnh && itemCpfClean.length >= 11 && cpfMap.has(itemCpfClean)) {
      const matches = cpfMap.get(itemCpfClean)!;
      // Se tiver nome e modo estrito, evitar casar se o nome for completamente antagônico
      let candidate: GeralCNH | undefined;
      if (!allowSimilarName && itemNormName && itemNormName !== "CONDUTOR") {
        candidate = matches.find(m => !usedCnhIds.has(m.id) && (normalizeString(m.nome) === itemNormName || calculateNameSimilarity(item.nome, m.nome) >= 60));
      } else {
        candidate = matches.find(m => !usedCnhIds.has(m.id) && m.situacao === "Remetida") || matches.find(m => !usedCnhIds.has(m.id));
      }

      if (candidate) {
        matchedCnh = candidate;
        matchType = "exact_cpf";
        matchScore = 95;
      }
    }

    // 5. TENTATIVA 5: Similaridade de Nome (>85%) - EXECUTADA APENAS SE allowSimilarName === true
    if (allowSimilarName && !matchedCnh && itemNormName.length > 5) {
      let bestCandidate: GeralCNH | null = null;
      let highestScore = 0;

      for (const cnh of geralList) {
        if (usedCnhIds.has(cnh.id)) continue;
        const score = calculateNameSimilarity(item.nome, cnh.nome);
        if (score >= 85 && score > highestScore) {
          highestScore = score;
          bestCandidate = cnh;
        }
      }

      if (bestCandidate && highestScore >= 85) {
        matchedCnh = bestCandidate;
        matchType = "similar_name";
        matchScore = highestScore;
      }
    }

    if (matchedCnh) {
      usedCnhIds.add(matchedCnh.id);
    }

    // Determinar categoria do registro
    let category: OcrCategory = "not_found";
    let selected = false;

    if (matchedCnh) {
      if (matchedCnh.situacao === "Remetida") {
        category = "ready_to_receive";
        selected = true; // Auto-selecionado para mudar status
      } else if (matchedCnh.situacao === "Pendente") {
        category = "pending";
        selected = true; // Pendente também pode ser recebida
      } else if (matchedCnh.situacao === "Recebida") {
        category = "already_received";
        selected = false;
      } else if (matchedCnh.situacao === "Entregue") {
        category = "already_delivered";
        selected = false;
      } else {
        category = "ready_to_receive";
        selected = true;
      }
    } else {
      category = "not_found";
      selected = true; // Não localizado: auto-selecionado para criar novo cadastro com Situação Recebida
    }

    // Determinar gaveta e repartição sugeridas
    const targetName = matchedCnh ? matchedCnh.nome : item.nome;
    const loc = await findLocalizacaoPorNome(targetName);

    results.push({
      id: `ocr-row-${idx}-${Date.now()}`,
      extracted: item,
      cnhMatched: matchedCnh,
      matchType,
      matchScore,
      category,
      selected,
      suggestedGaveta: loc.gaveta,
      suggestedReparticao: loc.reparticao,
    });
  }

  return results;
}
