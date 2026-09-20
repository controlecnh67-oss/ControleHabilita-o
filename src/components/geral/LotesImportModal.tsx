import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Check,
  Sparkles,
  Info,
  Layers,
  Download,
  Calendar,
  Hash,
  Package,
  AlertCircle,
  Filter,
  CheckCheck,
  ChevronRight,
  ArrowUpDown,
  FileText
} from "lucide-react";
import * as XLSX from "xlsx";
import { Lote } from "../../types";
import { cadastrarLotesBulk, LoteBulkItem } from "../../services/db";
import { useAuth } from "../../context/AuthContext";

export interface LotesImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLotes: Lote[];
  onSuccess: (insertedCount: number, updatedCount: number, totalDocs: number) => void;
}

export interface ParsedLoteRow {
  id: string;
  rowIndex: number; // Linha da planilha (1-based)
  rawLote: any;
  rawData: any;
  rawQtd: any;
  rawObs: any;
  numero: number | null;
  data_recebimento: string | null; // YYYY-MM-DD
  data_formatada: string; // DD/MM/YYYY
  documentos_impressos: number | null;
  observacao: string;
  status: "valid" | "existing" | "duplicate_in_file" | "invalid";
  errorMessage?: string;
  existingLote?: Lote;
  selected: boolean;
}

// Auxiliar para converter datas do Excel (números seriais ou strings) em YYYY-MM-DD
function parseExcelDate(val: any): { iso: string | null; formatted: string } {
  if (val === null || val === undefined || val === "") {
    return { iso: null, formatted: "-" };
  }

  // Se já for Date
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return { iso: `${y}-${m}-${d}`, formatted: `${d}/${m}/${y}` };
  }

  // Se for número serial do Excel (ex: 45320)
  if (typeof val === "number" || (!isNaN(Number(val)) && String(val).trim() !== "" && !String(val).includes("/") && !String(val).includes("-"))) {
    const num = Number(val);
    if (num > 1000 && num < 100000) {
      if (XLSX.SSF && XLSX.SSF.parse_date_code) {
        const parsed = XLSX.SSF.parse_date_code(num);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const iso = `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
          const formatted = `${String(parsed.d).padStart(2, "0")}/${String(parsed.m).padStart(2, "0")}/${String(parsed.y).padStart(4, "0")}`;
          return { iso, formatted };
        }
      }
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dia = String(d.getUTCDate()).padStart(2, "0");
        return { iso: `${y}-${m}-${dia}`, formatted: `${dia}/${m}/${y}` };
      }
    }
  }

  const str = String(val).trim();

  // Formato Brasileiro: DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (brMatch) {
    let dia = parseInt(brMatch[1], 10);
    let mes = parseInt(brMatch[2], 10);
    let ano = parseInt(brMatch[3], 10);
    if (ano < 100) ano += ano > 50 ? 1900 : 2000;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 1900 && ano <= 2100) {
      const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const formatted = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
      return { iso, formatted };
    }
  }

  // Formato ISO: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const ano = parseInt(isoMatch[1], 10);
    const mes = parseInt(isoMatch[2], 10);
    const dia = parseInt(isoMatch[3], 10);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const formatted = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
      return { iso, formatted };
    }
  }

  // Fallback com Date nativo
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return { iso: `${y}-${m}-${dia}`, formatted: `${dia}/${m}/${y}` };
  }

  return { iso: null, formatted: str };
}

// Auxiliar para extrair número do lote
function parseLoteNumero(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number" && !isNaN(val) && val > 0) {
    return Math.floor(val);
  }
  const clean = String(val).replace(/\D/g, "");
  if (!clean) return null;
  const num = parseInt(clean, 10);
  return !isNaN(num) && num > 0 ? num : null;
}

// Auxiliar para extrair quantidade de documentos
function parseQuantidade(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number" && !isNaN(val) && val >= 0) {
    return Math.floor(val);
  }
  // Remove pontos de milhar, trata vírgula como decimal se houver
  const clean = String(val).trim().replace(/\./g, "").replace(/,/g, ".");
  const num = parseInt(clean, 10);
  return !isNaN(num) && num >= 0 ? num : null;
}

export const LotesImportModal: React.FC<LotesImportModalProps> = ({
  isOpen,
  onClose,
  existingLotes,
  onSuccess,
}) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados do arquivo
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  // Cabeçalhos e linhas brutas
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(0);

  // Identificação e Mapeamento de Colunas (Lote, Data, Qtd, Obs)
  const [columnLote, setColumnLote] = useState<string>("");
  const [columnData, setColumnData] = useState<string>("");
  const [columnQtd, setColumnQtd] = useState<string>("");
  const [columnObs, setColumnObs] = useState<string>("");

  // Opções de Auditoria
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "valid" | "existing" | "error" | "selected">("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Linhas processadas e auditadas
  const [parsedRows, setParsedRows] = useState<ParsedLoteRow[]>([]);

  // Feedback e Loading
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mapa rápido de lotes existentes no sistema
  const existingMap = useMemo(() => {
    const map = new Map<number, Lote>();
    for (const l of existingLotes) {
      map.set(Number(l.numero), l);
    }
    return map;
  }, [existingLotes]);

  // Reset ao fechar ou abrir
  useEffect(() => {
    if (!isOpen) {
      setFileName("");
      setFileSize(0);
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet("");
      setRawHeaders([]);
      setRawRows([]);
      setParsedRows([]);
      setColumnLote("");
      setColumnData("");
      setColumnQtd("");
      setColumnObs("");
      setErrorMessage(null);
      setSearchTerm("");
      setFilterStatus("all");
      setOverwriteExisting(false);
    }
  }, [isOpen]);

  // Função para baixar modelo XLSX de exemplo
  const handleDownloadTemplate = () => {
    try {
      const wb = XLSX.utils.book_new();
      const wsData = [
        ["LOTE", "DATA", "QTD", "OBSERVACAO"],
        [101, "20/09/2026", 45, "Remessa Capital - CNHs impressas"],
        [102, "21/09/2026", 30, "Remessa Interior - 1ª via"],
        [103, "22/09/2026", 52, "Renovações e Segunda Via"],
        [104, "23/09/2026", 18, "Lote complementar"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [{ wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, ws, "Lotes");
      XLSX.writeFile(wb, "Modelo_Importacao_Lotes.xlsx");
    } catch (e) {
      console.error("Erro ao baixar modelo:", e);
    }
  };

  // Processa o arquivo selecionado
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      setErrorMessage("Por favor, selecione um arquivo válido do Excel (.xlsx ou .xls) ou .csv.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setFileName(file.name);
    setFileSize(file.size);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      const firstSheet = wb.SheetNames[0] || "";
      setSelectedSheet(firstSheet);
      processSheet(wb, firstSheet);
    } catch (err: any) {
      console.error("Erro ao ler arquivo Excel:", err);
      setErrorMessage(`Falha ao ler a planilha: ${err?.message || "Arquivo corrompido ou formato inválido."}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Troca de aba da planilha
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      processSheet(workbook, sheetName);
    }
  };

  // Lê a aba, encontra cabeçalhos e faz a identificação inteligente das colunas
  const processSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return;

    // Extrai todas as linhas como matriz
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows || rows.length === 0) {
      setErrorMessage("A planilha selecionada está vazia.");
      return;
    }

    // Procura a linha de cabeçalho (busca nas primeiras 10 linhas aquela com palavras-chave de colunas)
    let foundHeaderIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const rowStr = rows[i].map((c) => String(c).toLowerCase()).join(" ");
      if (
        (rowStr.includes("lote") || rowStr.includes("numero")) &&
        (rowStr.includes("data") || rowStr.includes("receb") || rowStr.includes("qtd") || rowStr.includes("documento"))
      ) {
        foundHeaderIdx = i;
        break;
      }
    }

    setHeaderRowIdx(foundHeaderIdx);
    const headerRow = rows[foundHeaderIdx] || [];
    const headers = headerRow.map((h, idx) => {
      const clean = String(h || "").trim();
      return clean || `Coluna ${idx + 1}`;
    });

    setRawHeaders(headers);
    setRawRows(rows);

    // Identificação inteligente das colunas
    let autoLote = "";
    let autoData = "";
    let autoQtd = "";
    let autoObs = "";

    headers.forEach((h) => {
      const clean = h.toLowerCase().trim();

      // 1. Identificação Coluna LOTE
      if (!autoLote) {
        if (/^(lote|n[ºo°]?\s*lote|lote\s*n[ºo°]?|num(\.|ero)?\s*lote|codigo(\s*lote)?|lote_num)$/i.test(clean)) {
          autoLote = h;
        } else if (clean.includes("lote") && !clean.includes("data") && !clean.includes("qtd")) {
          autoLote = h;
        } else if (clean === "numero" || clean === "nº" || clean === "num") {
          autoLote = h;
        }
      }

      // 2. Identificação Coluna DATA
      if (!autoData) {
        if (/^(data|data\s*recebimento|data\s*lote|dt(\.?)\s*recebimento|data\s*emiss[aã]o|recebimento|dt_recebimento)$/i.test(clean)) {
          autoData = h;
        } else if (clean.includes("data") || clean.includes("recebimento") || clean.includes("dt_")) {
          autoData = h;
        }
      }

      // 3. Identificação Coluna QTD
      if (!autoQtd) {
        if (/^(qtd|quantidade|docs|documentos|documentos\s*impressos|qtd(\.?)\s*docs|total(\s*docs)?|impressos|qnt|volume)$/i.test(clean)) {
          autoQtd = h;
        } else if (clean.includes("qtd") || clean.includes("quantidade") || clean.includes("impressos") || clean.includes("documentos")) {
          autoQtd = h;
        }
      }

      // 4. Identificação Coluna OBSERVAÇÃO
      if (!autoObs) {
        if (/^(obs|observa[cç][aã]o|detalhes|nota|observacoes)$/i.test(clean)) {
          autoObs = h;
        } else if (clean.includes("obs") || clean.includes("observa")) {
          autoObs = h;
        }
      }
    });

    // Fallbacks se não achou por nome exato
    if (!autoLote && headers.length > 0) autoLote = headers[0];
    if (!autoData && headers.length > 1) autoData = headers[1];
    if (!autoQtd && headers.length > 2) autoQtd = headers[2];

    setColumnLote(autoLote);
    setColumnData(autoData);
    setColumnQtd(autoQtd);
    setColumnObs(autoObs);

    // Executa auditoria inicial
    runAudit(rows, foundHeaderIdx, headers, autoLote, autoData, autoQtd, autoObs, overwriteExisting);
  };

  // Recalcula auditoria quando as colunas mapeadas ou a opção de sobrescrever mudam
  const runAudit = (
    allRows: any[][],
    headIdx: number,
    headers: string[],
    colLote: string,
    colData: string,
    colQtd: string,
    colObs: string,
    overwrite: boolean
  ) => {
    if (!allRows || allRows.length === 0) return;

    const idxLote = headers.indexOf(colLote);
    const idxData = headers.indexOf(colData);
    const idxQtd = headers.indexOf(colQtd);
    const idxObs = colObs ? headers.indexOf(colObs) : -1;

    const parsed: ParsedLoteRow[] = [];
    const seenLotesInFile = new Map<number, number>(); // numero -> linha

    for (let r = headIdx + 1; r < allRows.length; r++) {
      const row = allRows[r];
      if (!row || row.length === 0) continue;

      // Verifica se a linha inteira está em branco
      const isRowEmpty = row.every((c) => c === null || c === undefined || String(c).trim() === "");
      if (isRowEmpty) continue;

      const rawLoteVal = idxLote >= 0 ? row[idxLote] : null;
      const rawDataVal = idxData >= 0 ? row[idxData] : null;
      const rawQtdVal = idxQtd >= 0 ? row[idxQtd] : null;
      const rawObsVal = idxObs >= 0 ? row[idxObs] : null;

      const numero = parseLoteNumero(rawLoteVal);
      const { iso: dataIso, formatted: dataFormatada } = parseExcelDate(rawDataVal);
      const qtd = parseQuantidade(rawQtdVal);
      const obs = rawObsVal !== null && rawObsVal !== undefined ? String(rawObsVal).trim() : "";

      let status: "valid" | "existing" | "duplicate_in_file" | "invalid" = "valid";
      let errorMessage: string | undefined = undefined;
      let existingLote: Lote | undefined = undefined;

      // Validação de integridade básica
      if (numero === null) {
        status = "invalid";
        errorMessage = "Número do Lote ausente ou inválido";
      } else if (!dataIso) {
        status = "invalid";
        errorMessage = "Data de recebimento inválida ou ilegível";
      } else if (qtd === null) {
        status = "invalid";
        errorMessage = "Quantidade de documentos não informada ou inválida";
      } else if (seenLotesInFile.has(numero)) {
        // Duplicado no próprio arquivo
        status = "duplicate_in_file";
        const previousRow = seenLotesInFile.get(numero);
        errorMessage = `Lote #${numero} duplicado (já apareceu na linha #${previousRow})`;
      } else if (existingMap.has(numero)) {
        // Já existe no sistema
        status = "existing";
        existingLote = existingMap.get(numero);
      }

      if (numero !== null && !seenLotesInFile.has(numero)) {
        seenLotesInFile.set(numero, r + 1);
      }

      // Definição de seleção padrão:
      // Se válido: marcado
      // Se existente: marcado se overwrite=true, senão desmarcado
      // Se inválido ou duplicado: desmarcado
      let isSelected = false;
      if (status === "valid") {
        isSelected = true;
      } else if (status === "existing") {
        isSelected = overwrite;
      }

      parsed.push({
        id: `parsed-row-${r}-${numero || "semnum"}`,
        rowIndex: r + 1,
        rawLote: rawLoteVal,
        rawData: rawDataVal,
        rawQtd: rawQtdVal,
        rawObs: rawObsVal,
        numero,
        data_recebimento: dataIso,
        data_formatada: dataFormatada,
        documentos_impressos: qtd,
        observacao: obs,
        status,
        errorMessage,
        existingLote,
        selected: isSelected,
      });
    }

    setParsedRows(parsed);
  };

  // Reavalia quando o usuário altera qualquer mapeamento de coluna
  const handleColLoteChange = (col: string) => {
    setColumnLote(col);
    runAudit(rawRows, headerRowIdx, rawHeaders, col, columnData, columnQtd, columnObs, overwriteExisting);
  };

  const handleColDataChange = (col: string) => {
    setColumnData(col);
    runAudit(rawRows, headerRowIdx, rawHeaders, columnLote, col, columnQtd, columnObs, overwriteExisting);
  };

  const handleColQtdChange = (col: string) => {
    setColumnQtd(col);
    runAudit(rawRows, headerRowIdx, rawHeaders, columnLote, columnData, col, columnObs, overwriteExisting);
  };

  const handleColObsChange = (col: string) => {
    setColumnObs(col);
    runAudit(rawRows, headerRowIdx, rawHeaders, columnLote, columnData, columnQtd, col, overwriteExisting);
  };

  const handleToggleOverwrite = (checked: boolean) => {
    setOverwriteExisting(checked);
    setParsedRows((prev) =>
      prev.map((row) => {
        if (row.status === "existing") {
          return { ...row, selected: checked };
        }
        return row;
      })
    );
  };

  // Estatísticas de Auditoria
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const valid = parsedRows.filter((r) => r.status === "valid").length;
    const existing = parsedRows.filter((r) => r.status === "existing").length;
    const duplicate = parsedRows.filter((r) => r.status === "duplicate_in_file").length;
    const invalid = parsedRows.filter((r) => r.status === "invalid").length;
    const errors = duplicate + invalid;

    const selectedRows = parsedRows.filter((r) => r.selected);
    const selectedCount = selectedRows.length;
    const selectedDocs = selectedRows.reduce((acc, r) => acc + (r.documentos_impressos || 0), 0);
    const selectedToInsert = selectedRows.filter((r) => r.status === "valid").length;
    const selectedToUpdate = selectedRows.filter((r) => r.status === "existing").length;

    const totalDocsInFile = parsedRows.reduce((acc, r) => acc + (r.documentos_impressos || 0), 0);

    return {
      total,
      valid,
      existing,
      duplicate,
      invalid,
      errors,
      selectedCount,
      selectedDocs,
      selectedToInsert,
      selectedToUpdate,
      totalDocsInFile,
    };
  }, [parsedRows]);

  // Linhas filtradas para exibição
  const filteredRows = useMemo(() => {
    return parsedRows.filter((item) => {
      // Filtro de status
      if (filterStatus === "valid" && item.status !== "valid") return false;
      if (filterStatus === "existing" && item.status !== "existing") return false;
      if (filterStatus === "error" && item.status !== "invalid" && item.status !== "duplicate_in_file") return false;
      if (filterStatus === "selected" && !item.selected) return false;

      // Filtro de busca textual
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const numMatch = String(item.numero || "").includes(term);
        const dataMatch = item.data_formatada.includes(term) || (item.data_recebimento || "").includes(term);
        const qtdMatch = String(item.documentos_impressos || "").includes(term);
        const obsMatch = item.observacao.toLowerCase().includes(term);
        const statusMatch = item.errorMessage?.toLowerCase().includes(term);
        return numMatch || dataMatch || qtdMatch || obsMatch || statusMatch;
      }

      return true;
    });
  }, [parsedRows, filterStatus, searchTerm]);

  // Seleções em massa
  const handleSelectAll = (select: boolean) => {
    setParsedRows((prev) =>
      prev.map((r) => {
        // Não seleciona linhas inválidas ou duplicadas
        if (select && (r.status === "invalid" || r.status === "duplicate_in_file")) {
          return { ...r, selected: false };
        }
        return { ...r, selected: select };
      })
    );
  };

  const handleSelectOnlyValid = () => {
    setParsedRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.status === "valid",
      }))
    );
  };

  const handleSelectOnlyExisting = () => {
    setParsedRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.status === "existing",
      }))
    );
  };

  const handleToggleRow = (id: string) => {
    setParsedRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          if (r.status === "invalid" || r.status === "duplicate_in_file") {
            return r; // Não permite selecionar linhas inválidas
          }
          return { ...r, selected: !r.selected };
        }
        return r;
      })
    );
  };

  // Confirmação e gravação no banco
  const handleConfirmImport = async () => {
    const toImport = parsedRows.filter((r) => r.selected && r.numero !== null && r.data_recebimento !== null);
    if (toImport.length === 0) {
      setErrorMessage("Nenhum lote válido selecionado para importação.");
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const userId = user?.id || "operador";
      const userNome = user?.nome_curto || user?.nome || "Operador";

      const payload: LoteBulkItem[] = toImport.map((r) => ({
        numero: r.numero!,
        data_recebimento: r.data_recebimento!,
        documentos_impressos: r.documentos_impressos || 0,
        observacao: r.observacao
          ? `${r.observacao} (Importado via ${fileName})`
          : `Importado via planilha Excel (${fileName})`,
        overwriteIfExisting: overwriteExisting,
      }));

      const res = await cadastrarLotesBulk(payload, userId, userNome);

      onSuccess(res.insertedCount, res.updatedCount, stats.selectedDocs);
      onClose();
    } catch (err: any) {
      console.error("Erro ao importar lotes:", err);
      setErrorMessage(`Erro ao gravar lotes no sistema: ${err?.message || "Tente novamente."}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/80 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Cabeçalho do Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Cadastro de Lotes via Planilha Excel
                </h2>
                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] rounded-full uppercase border border-emerald-300 dark:border-emerald-800">
                  .XLSX / .XLS
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auditoria, identificação das colunas de <strong>Lote</strong>, <strong>Data</strong> e <strong>Qtd</strong>, e gravação no sistema
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
              title="Baixar modelo XLSX com as colunas LOTE, DATA e QTD"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Baixar Modelo XLSX</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo do Modal com Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Alerta de erro caso ocorra */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2.5 text-rose-800 dark:text-rose-200 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Área de Seleção / Drop do Arquivo */}
          {!workbook ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30 rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-emerald-500/10">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
                Selecione ou Arraste sua Planilha de Lotes (.xlsx, .xls)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
                O sistema identificará automaticamente as colunas de <strong>Lote</strong>, <strong>Data</strong> e <strong>Qtd</strong> e abrirá o modal completo de auditoria e validação antes da importação.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Escolher Arquivo do Computador</span>
              </div>
            </div>
          ) : (
            /* Planilha Carregada: Identificação de Colunas + Auditoria */
            <div className="space-y-5">
              {/* Barra do Arquivo Selecionado */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">
                      {fileName}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {(fileSize / 1024).toFixed(1)} KB • {rawRows.length} linhas lidas no arquivo
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {sheetNames.length > 1 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500 font-medium">Aba:</span>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 outline-hidden"
                      >
                        {sheetNames.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setWorkbook(null);
                      setFileName("");
                      setParsedRows([]);
                    }}
                    className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-600 transition-colors cursor-pointer"
                  >
                    Trocar Planilha
                  </button>
                </div>
              </div>

              {/* CARD 1: IDENTIFICAÇÃO E MAPEAMENTO DAS COLUNAS */}
              <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center font-black text-xs">
                      1
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Identificação e Mapeamento de Colunas</span>
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    </h3>
                  </div>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Auto-detectado com sucesso
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Coluna LOTE */}
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-blue-600" />
                        <span>Coluna LOTE *</span>
                      </label>
                      <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.2 rounded">
                        Obrigatório
                      </span>
                    </div>
                    <select
                      value={columnLote}
                      onChange={(e) => handleColLoteChange(e.target.value)}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white outline-hidden focus:border-blue-500"
                    >
                      <option value="">-- Selecione a Coluna --</option>
                      {rawHeaders.map((h) => (
                        <option key={`lote-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Número identificador do Lote
                    </span>
                  </div>

                  {/* Coluna DATA */}
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Coluna DATA *</span>
                      </label>
                      <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.2 rounded">
                        Obrigatório
                      </span>
                    </div>
                    <select
                      value={columnData}
                      onChange={(e) => handleColDataChange(e.target.value)}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white outline-hidden focus:border-emerald-500"
                    >
                      <option value="">-- Selecione a Coluna --</option>
                      {rawHeaders.map((h) => (
                        <option key={`data-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Data de recebimento do Lote
                    </span>
                  </div>

                  {/* Coluna QTD */}
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-purple-600" />
                        <span>Coluna QTD *</span>
                      </label>
                      <span className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.2 rounded">
                        Obrigatório
                      </span>
                    </div>
                    <select
                      value={columnQtd}
                      onChange={(e) => handleColQtdChange(e.target.value)}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white outline-hidden focus:border-purple-500"
                    >
                      <option value="">-- Selecione a Coluna --</option>
                      {rawHeaders.map((h) => (
                        <option key={`qtd-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Documentos impressos no lote
                    </span>
                  </div>

                  {/* Coluna OBSERVAÇÃO (Opcional) */}
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span>Observação</span>
                      </label>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 dark:bg-slate-700 px-1.5 py-0.2 rounded">
                        Opcional
                      </span>
                    </div>
                    <select
                      value={columnObs}
                      onChange={(e) => handleColObsChange(e.target.value)}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white outline-hidden focus:border-slate-500"
                    >
                      <option value="">-- Nenhuma (Padrão) --</option>
                      {rawHeaders.map((h) => (
                        <option key={`obs-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Observações adicionais
                    </span>
                  </div>
                </div>
              </div>

              {/* CARD 2: PAINEL DE AUDITORIA E RESUMO */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black text-xs">
                      2
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Auditoria e Análise dos Lotes
                    </h3>
                  </div>

                  {/* Toggle para Lotes Já Existentes */}
                  {stats.existing > 0 && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overwriteExisting}
                        onChange={(e) => handleToggleOverwrite(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <span>Atualizar lotes já cadastrados no sistema ({stats.existing})</span>
                    </label>
                  )}
                </div>

                {/* Métricas da Auditoria */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Total na Planilha */}
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total na Planilha</div>
                    <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{stats.total}</div>
                    <div className="text-[10px] text-slate-500">{stats.totalDocsInFile} docs totais</div>
                  </div>

                  {/* Novos Lotes (Prontos) */}
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Novos / Válidos
                    </div>
                    <div className="text-xl font-black text-emerald-700 dark:text-emerald-200 font-mono">{stats.valid}</div>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400">Prontos p/ inclusão</div>
                  </div>

                  {/* Já Cadastrados */}
                  <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Já no Sistema
                    </div>
                    <div className="text-xl font-black text-amber-700 dark:text-amber-200 font-mono">{stats.existing}</div>
                    <div className="text-[10px] text-amber-700 dark:text-amber-400">
                      {overwriteExisting ? "Serão atualizados" : "Serão ignorados"}
                    </div>
                  </div>

                  {/* Duplicados ou Inválidos */}
                  <div className="bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-800">
                    <div className="text-[11px] font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Com Inconsistência
                    </div>
                    <div className="text-xl font-black text-rose-700 dark:text-rose-200 font-mono">{stats.errors}</div>
                    <div className="text-[10px] text-rose-700 dark:text-rose-400">
                      {stats.duplicate} dup. / {stats.invalid} inválidos
                    </div>
                  </div>

                  {/* Selecionados p/ Gravação */}
                  <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-800 col-span-2 sm:col-span-1">
                    <div className="text-[11px] font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5 text-blue-600" /> Selecionados p/ Ação
                    </div>
                    <div className="text-xl font-black text-blue-700 dark:text-blue-200 font-mono">{stats.selectedCount}</div>
                    <div className="text-[10px] text-blue-700 dark:text-blue-400">
                      {stats.selectedDocs} documentos
                    </div>
                  </div>
                </div>

                {/* Filtros da Tabela de Auditoria */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      type="button"
                      onClick={() => setFilterStatus("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        filterStatus === "all"
                          ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      Todos ({stats.total})
                    </button>

                    <button
                      type="button"
                      onClick={() => setFilterStatus("valid")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        filterStatus === "valid"
                          ? "bg-emerald-600 text-white"
                          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100"
                      }`}
                    >
                      Prontos / Novos ({stats.valid})
                    </button>

                    {stats.existing > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterStatus("existing")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                          filterStatus === "existing"
                            ? "bg-amber-600 text-white"
                            : "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100"
                        }`}
                      >
                        Já no Sistema ({stats.existing})
                      </button>
                    )}

                    {stats.errors > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterStatus("error")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                          filterStatus === "error"
                            ? "bg-rose-600 text-white"
                            : "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100"
                        }`}
                      >
                        Inconsistências ({stats.errors})
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setFilterStatus("selected")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        filterStatus === "selected"
                          ? "bg-blue-600 text-white"
                          : "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-100"
                      }`}
                    >
                      Selecionados ({stats.selectedCount})
                    </button>
                  </div>

                  {/* Busca textual na auditoria */}
                  <div className="relative min-w-[200px] sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Filtrar por lote, data ou obs..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-hidden focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Ações de Seleção Rápida */}
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">Seleção Rápida:</span>
                  <button
                    type="button"
                    onClick={handleSelectOnlyValid}
                    className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                  >
                    Apenas Novos ({stats.valid})
                  </button>
                  {stats.existing > 0 && (
                    <>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={handleSelectOnlyExisting}
                        className="text-amber-700 dark:text-amber-400 font-bold hover:underline cursor-pointer"
                      >
                        Apenas Existentes ({stats.existing})
                      </button>
                    </>
                  )}
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Marcar Todos Válidos
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(false)}
                    className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:underline cursor-pointer"
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              {/* TABELA DE AUDITORIA LINHA POR LINHA */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={stats.selectedCount > 0 && stats.selectedCount === (stats.valid + (overwriteExisting ? stats.existing : 0))}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 w-14 text-center">Linha</th>
                        <th className="p-3">Lote (Número)</th>
                        <th className="p-3">Data de Recebimento</th>
                        <th className="p-3 text-right">Qtd (Documentos)</th>
                        <th className="p-3">Observação</th>
                        <th className="p-3">Diagnóstico da Auditoria</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Nenhum registro encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => {
                          const isInvalidOrDup = row.status === "invalid" || row.status === "duplicate_in_file";
                          return (
                            <tr
                              key={row.id}
                              className={`transition-colors ${
                                row.selected
                                  ? row.status === "existing"
                                    ? "bg-amber-50/50 dark:bg-amber-950/20"
                                    : "bg-emerald-50/40 dark:bg-emerald-950/20"
                                  : isInvalidOrDup
                                  ? "bg-rose-50/30 dark:bg-rose-950/10 opacity-80"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  disabled={isInvalidOrDup}
                                  onChange={() => handleToggleRow(row.id)}
                                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30"
                                />
                              </td>

                              {/* Linha da Planilha */}
                              <td className="p-3 text-center font-mono text-[11px] text-slate-400">
                                #{row.rowIndex}
                              </td>

                              {/* Lote */}
                              <td className="p-3">
                                {row.numero !== null ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-mono font-bold text-xs rounded-md border border-blue-200 dark:border-blue-800">
                                      Lote #{row.numero}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-rose-600 font-bold text-[11px] flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> Ausente ({String(row.rawLote)})
                                  </span>
                                )}
                              </td>

                              {/* Data */}
                              <td className="p-3">
                                {row.data_recebimento ? (
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                                    {row.data_formatada}
                                  </span>
                                ) : (
                                  <span className="text-rose-600 font-bold text-[11px] flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> Inválida ({String(row.rawData)})
                                  </span>
                                )}
                              </td>

                              {/* Qtd */}
                              <td className="p-3 text-right">
                                {row.documentos_impressos !== null ? (
                                  <span className="font-mono font-bold text-slate-900 dark:text-white px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                                    {row.documentos_impressos}
                                  </span>
                                ) : (
                                  <span className="text-rose-600 font-bold text-[11px]">
                                    Inválido ({String(row.rawQtd)})
                                  </span>
                                )}
                              </td>

                              {/* Observação */}
                              <td className="p-3 text-slate-500 max-w-[180px] truncate" title={row.observacao}>
                                {row.observacao || <span className="text-slate-400 italic">-</span>}
                              </td>

                              {/* Diagnóstico da Auditoria */}
                              <td className="p-3">
                                {row.status === "valid" && (
                                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Novo Lote (Pronto p/ inclusão)</span>
                                  </div>
                                )}

                                {row.status === "existing" && (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold">
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                      <span>Já cadastrado no sistema</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Consta com {row.existingLote?.documentos_impressos} docs em{" "}
                                      {row.existingLote?.data_recebimento ? row.existingLote.data_recebimento.split("-").reverse().join("/") : "-"}
                                      {row.selected ? " ➔ Será atualizado" : " ➔ Será ignorado"}
                                    </div>
                                  </div>
                                )}

                                {row.status === "duplicate_in_file" && (
                                  <div className="flex items-center gap-1.5 text-orange-700 dark:text-orange-400 font-semibold">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{row.errorMessage}</span>
                                  </div>
                                )}

                                {row.status === "invalid" && (
                                  <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-bold">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{row.errorMessage}</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
            {workbook && (
              <span>
                Auditoria: <strong>{stats.selectedCount}</strong> lote(s) selecionado(s) totalizando{" "}
                <strong className="text-blue-600 dark:text-blue-400">{stats.selectedDocs} documentos impressos</strong>
                {stats.selectedToUpdate > 0 && ` (${stats.selectedToUpdate} atualização)`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {workbook && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting || stats.selectedCount === 0}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Gravando e Auditando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Confirmar Importação de {stats.selectedCount} Lote(s) ({stats.selectedDocs} docs)
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
