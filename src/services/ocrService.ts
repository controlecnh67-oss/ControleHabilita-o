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
 * Extrai apenas dígitos do PA (até 9 dígitos)
 */
export function cleanPaDigits(pa?: string): string {
  if (!pa) return "";
  return String(pa).replace(/\D/g, "").slice(0, 9);
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

/**
 * Cruza itens extraídos da planilha Excel ou OCR com a base geral de CNHs
 * A correspondência se dá pelo PA (Identificador Único CNH), Nome e CPF.
 */
export async function matchExtractedWithGeralCNHs(
  extractedList: ExtractedCnhItem[],
  geralList: GeralCNH[]
): Promise<OcrMatchResult[]> {
  const results: OcrMatchResult[] = [];
  const usedCnhIds = new Set<string>();

  // Pré-indexar geral por PA, CPF limpo e Nome normalizado
  const paMap = new Map<string, GeralCNH[]>();
  const cpfMap = new Map<string, GeralCNH[]>();
  const nameMap = new Map<string, GeralCNH[]>();

  for (const cnh of geralList) {
    const paClean = cleanPaDigits(cnh.pa);
    if (paClean.length >= 6) {
      const arr = paMap.get(paClean) || [];
      arr.push(cnh);
      paMap.set(paClean, arr);
    }

    const cpfClean = cleanCpfDigits(cnh.cpf);
    if (cpfClean.length >= 11) {
      const arr = cpfMap.get(cpfClean) || [];
      arr.push(cnh);
      cpfMap.set(cpfClean, arr);
    }

    const normName = normalizeString(cnh.nome);
    if (normName) {
      const arr = nameMap.get(normName) || [];
      arr.push(cnh);
      nameMap.set(normName, arr);
    }
  }

  for (let idx = 0; idx < extractedList.length; idx++) {
    const item = extractedList[idx];
    const itemPaClean = cleanPaDigits(item.pa);
    const itemCpfClean = cleanCpfDigits(item.cpf);
    const itemNormName = normalizeString(item.nome);

    let matchedCnh: GeralCNH | null = null;
    let matchType: OcrMatchType = "none";
    let matchScore = 0;

    // 1. TENTATIVA 1: Correspondência Exata por PA (Processo/Identificador Único CNH de 9 dígitos)
    if (itemPaClean.length >= 6 && paMap.has(itemPaClean)) {
      const matches = paMap.get(itemPaClean)!;
      // Se tiver nome também, tentar priorizar quem bate PA e Nome
      if (itemNormName) {
        const exactNameAndPa = matches.find(m => normalizeString(m.nome) === itemNormName);
        if (exactNameAndPa) {
          matchedCnh = exactNameAndPa;
          matchType = "exact_pa";
          matchScore = 100;
        }
      }
      if (!matchedCnh) {
        const remetidaMatch = matches.find(m => !usedCnhIds.has(m.id) && m.situacao === "Remetida");
        const unusedMatch = matches.find(m => !usedCnhIds.has(m.id));
        matchedCnh = remetidaMatch || unusedMatch || matches[0];
        matchType = "exact_pa";
        matchScore = 100;
      }
    }

    // 2. TENTATIVA 2: Correspondência Exata por CPF (11 dígitos)
    if (!matchedCnh && itemCpfClean.length >= 11 && cpfMap.has(itemCpfClean)) {
      const matches = cpfMap.get(itemCpfClean)!;
      // Preferir um que ainda não foi associado e que esteja 'Remetida'
      const remetidaMatch = matches.find(m => !usedCnhIds.has(m.id) && m.situacao === "Remetida");
      const unusedMatch = matches.find(m => !usedCnhIds.has(m.id));
      matchedCnh = remetidaMatch || unusedMatch || matches[0];
      matchType = "exact_cpf";
      matchScore = 100;
    }

    // 3. TENTATIVA 3: Correspondência Exata por Nome Completo
    if (!matchedCnh && itemNormName && nameMap.has(itemNormName)) {
      const matches = nameMap.get(itemNormName)!;
      const remetidaMatch = matches.find(m => !usedCnhIds.has(m.id) && m.situacao === "Remetida");
      const unusedMatch = matches.find(m => !usedCnhIds.has(m.id));
      matchedCnh = remetidaMatch || unusedMatch || matches[0];
      matchType = "exact_name";
      matchScore = 98;
    }

    // 4. TENTATIVA 4: Similaridade de Nome (>80%)
    if (!matchedCnh && itemNormName.length > 5) {
      let bestCandidate: GeralCNH | null = null;
      let highestScore = 0;

      for (const cnh of geralList) {
        if (usedCnhIds.has(cnh.id)) continue;
        const score = calculateNameSimilarity(item.nome, cnh.nome);
        if (score >= 80 && score > highestScore) {
          highestScore = score;
          bestCandidate = cnh;
        }
      }

      if (bestCandidate && highestScore >= 80) {
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
      selected = false;
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
