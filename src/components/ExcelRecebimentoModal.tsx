import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowRight,
  Check,
  SlidersHorizontal,
  TableProperties,
  UserPlus,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  FolderArchive,
  Layers,
  FileText,
  Download,
  Printer
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { GeralCNH, Usuario } from "../types";
import {
  matchExtractedWithGeralCNHs,
  ExtractedCnhItem,
  OcrMatchResult,
} from "../services/ocrService";
import { receberCNHsBulk, cadastrarNovasCNHsRecebidas } from "../services/db";
import { getOrgaoConfig, addPDFHeaderLogo } from "../services/orgaoService";
import { formatCPF } from "../lib/utils";
import { DEFAULT_GAVETAS, DEFAULT_REPARTICOES } from "../lib/constants";

// Helper para exibir Gaveta e Repartição apenas com número (evita redundância)
const cleanNumeroApenas = (text?: string | number) => {
  if (text === undefined || text === null || text === "") return "-";
  const str = String(text).trim();
  const match = str.match(/\d+/);
  if (match) return match[0];
  const cleaned = str.replace(/^(gaveta|gav\.?|repartição|reparticao|rep\.?)\s*/i, "").trim();
  return cleaned || str || "-";
};

interface ExcelRecebimentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  geralList: GeralCNH[];
  currentUser: Usuario | null;
  onSuccess: (updatedCount: number, totalExtracted: number, insertedCount?: number) => void;
}

export const ExcelRecebimentoModal: React.FC<ExcelRecebimentoModalProps> = ({
  isOpen,
  onClose,
  geralList,
  currentUser,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Dados brutos da planilha
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [workbookData, setWorkbookData] = useState<XLSX.WorkBook | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  // Mapeamento de colunas (Foco em NOME e PA)
  const [colNome, setColNome] = useState<string>("");
  const [colPa, setColPa] = useState<string>("");
  const [colCpf, setColCpf] = useState<string>("");
  const [colRemessa, setColRemessa] = useState<string>("");
  const [colObs, setColObs] = useState<string>("");
  const [showOptionalCols, setShowOptionalCols] = useState(false);
  // Calibração do motor: por padrão NÃO localizar por nome similar (fuzzy)
  const [allowSimilarName, setAllowSimilarName] = useState<boolean>(false);

  // Resultados de correspondência
  const [results, setResults] = useState<OcrMatchResult[] | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Escolha de Gaveta e Repartição para o lote
  const [manualBulkAllocation, setManualBulkAllocation] = useState<boolean>(false);
  const [bulkGaveta, setBulkGaveta] = useState<string>("Gaveta 1");
  const [bulkReparticao, setBulkReparticao] = useState<string>("Repartição 1");

  // Controle de Menu e Exportação de PDF por Grupo
  const [showPdfDropdown, setShowPdfDropdown] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estatísticas e Contadores calculados com useMemo
  const stats = useMemo(() => {
    if (!results) {
      return {
        total: 0,
        localizadas: 0,
        remetidas: 0,
        pendentes: 0,
        jaRecebidas: 0,
        jaEntregues: 0,
        jaNoEstoque: 0,
        naoEncontradas: 0,
        selecionadasParaAtualizar: 0,
        selecionadasParaInserir: 0,
        totalSelecionadas: 0,
      };
    }

    const remetidas = results.filter((r) => r.category === "ready_to_receive").length;
    const pendentes = results.filter((r) => r.category === "pending").length;
    const jaRecebidas = results.filter((r) => r.category === "already_received").length;
    const jaEntregues = results.filter((r) => r.category === "already_delivered").length;
    const jaNoEstoque = results.filter((r) => Boolean(r.isAlreadyInStockNewOrder)).length;
    const naoEncontradas = results.filter((r) => r.cnhMatched === null).length;
    const localizadas = results.length - naoEncontradas;

    // Apenas quem é Remetida/Pendente localizada (sem ser novo cadastro) atualizará status existente:
    const selecionadasParaAtualizar = results.filter(
      (r) => r.selected && r.cnhMatched !== null && !r.isAlreadyInStockNewOrder
    ).length;

    // Condutores não localizados OU já em estoque preparados para nova ordem serão CADASTRADOS COM NOVA ORDEM:
    const selecionadasParaInserir = results.filter(
      (r) => r.selected && (r.cnhMatched === null || r.isAlreadyInStockNewOrder)
    ).length;

    return {
      total: results.length,
      localizadas,
      remetidas,
      pendentes,
      jaRecebidas,
      jaEntregues,
      jaNoEstoque,
      naoEncontradas,
      selecionadasParaAtualizar,
      selecionadasParaInserir,
      totalSelecionadas: selecionadasParaAtualizar + selecionadasParaInserir,
    };
  }, [results]);

  // Itens filtrados para a tabela
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter((item) => {
      // Filtros de Categoria
      if (filterCategory === "localizadas" && item.cnhMatched === null) return false;
      if (filterCategory === "nao_localizadas" && item.cnhMatched !== null) return false;
      if (filterCategory === "ready_to_receive" && item.category !== "ready_to_receive") return false;
      if (
        filterCategory === "already_received" &&
        item.category !== "already_received" &&
        item.category !== "already_delivered" &&
        !item.isAlreadyInStockNewOrder
      )
        return false;
      if (filterCategory === "selected" && !item.selected) return false;

      // Filtro de Busca
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const nomeOcr = (item.extracted.nome || "").toLowerCase();
        const paOcr = (item.extracted.pa || "").toLowerCase();
        const cpfOcr = (item.extracted.cpf || "").toLowerCase();
        const nomeGeral = (item.cnhMatched?.nome || "").toLowerCase();
        const paGeral = (item.cnhMatched?.pa || "").toLowerCase();
        const cpfGeral = (item.cnhMatched?.cpf || "").toLowerCase();
        const remessa = (item.extracted.remessa || "").toLowerCase();
        const ordem = item.cnhMatched?.ordem ? `#${item.cnhMatched.ordem}` : "";

        return (
          nomeOcr.includes(query) ||
          paOcr.includes(query) ||
          cpfOcr.includes(query) ||
          nomeGeral.includes(query) ||
          paGeral.includes(query) ||
          cpfGeral.includes(query) ||
          remessa.includes(query) ||
          ordem.includes(query)
        );
      }

      return true;
    });
  }, [results, filterCategory, searchTerm]);

  // Fechar dropdown de PDF ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(event.target as Node)) {
        setShowPdfDropdown(false);
      }
    };
    if (showPdfDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPdfDropdown]);

  // Detecção inteligente de colunas (Foco em NOME e PA)
  const autoDetectColumns = (headers: string[], sampleRows: any[] = []) => {
    let detectedNome = "";
    let detectedPa = "";
    let detectedCpf = "";
    let detectedRemessa = "";
    let detectedObs = "";

    headers.forEach((h) => {
      const clean = h.trim().toUpperCase();
      if (!detectedNome && (clean.includes("NOME") || clean.includes("CONDUTOR") || clean.includes("TITULAR") || clean.includes("CLIENTE") || clean.includes("MOTORISTA") || clean.includes("NOME DO CONDUTOR"))) {
        detectedNome = h;
      }
      if (!detectedPa && (clean === "PA" || clean === "Nº PA" || clean === "NUM PA" || clean === "NUM_PA" || clean === "N_PA" || clean.includes("IDENTIFICADOR") || clean.includes("PROCESSO") || clean.startsWith("PA ") || clean.endsWith(" PA") || clean === "CNH" || clean.includes("PA"))) {
        detectedPa = h;
      }
      if (!detectedCpf && (clean.includes("CPF") || clean.includes("DOCUMENTO") || clean.includes("DOC") || clean.includes("CIC"))) {
        detectedCpf = h;
      }
      if (!detectedRemessa && (clean.includes("REMESSA") || clean.includes("LOTE") || clean.includes("MEMO") || clean.includes("OFICIO") || clean.includes("GUIA"))) {
        detectedRemessa = h;
      }
      if (!detectedObs && (clean.includes("OBS") || clean.includes("MOTIVO") || clean.includes("CATEGORIA") || clean.includes("SERVICO") || clean.includes("TIPO"))) {
        detectedObs = h;
      }
    });

    // Se tiver exatamente 2 colunas e não tiver detectado com clareza pelos nomes dos cabeçalhos:
    if ((!detectedNome || !detectedPa) && headers.length === 2) {
      const col0 = headers[0];
      const col1 = headers[1];

      let col0NumericScore = 0;
      let col1NumericScore = 0;

      sampleRows.forEach((row) => {
        const v0 = String(row[col0] || "").replace(/\D/g, "");
        const v1 = String(row[col1] || "").replace(/\D/g, "");
        if (v0.length >= 4) col0NumericScore++;
        if (v1.length >= 4) col1NumericScore++;
      });

      if (col1NumericScore > col0NumericScore) {
        detectedNome = detectedNome || col0;
        detectedPa = detectedPa || col1;
      } else if (col0NumericScore > col1NumericScore) {
        detectedNome = detectedNome || col1;
        detectedPa = detectedPa || col0;
      } else {
        detectedNome = detectedNome || col0;
        detectedPa = detectedPa || col1;
      }
    } else {
      if (!detectedNome && headers.length > 0) {
        detectedNome = headers[0];
      }
      if (!detectedPa && headers.length > 1 && headers[1] !== detectedNome) {
        detectedPa = headers[1];
      }
    }

    setColNome(detectedNome);
    setColPa(detectedPa);
    setColCpf(detectedCpf);
    setColRemessa(detectedRemessa);
    setColObs(detectedObs);
  };

  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    setResults(null);

    const validExtensions = /\.(xlsx|xls|csv)$/i;
    if (!validExtensions.test(file.name)) {
      setErrorMessage("Por favor, selecione um arquivo Excel (.xlsx, .xls) ou CSV.");
      return;
    }

    setSelectedFile(file);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        setWorkbookData(wb);
        setSheetNames(wb.SheetNames);

        const firstSheetName = wb.SheetNames[0] || "";
        setSelectedSheet(firstSheetName);

        processSheet(wb, firstSheetName);
      } catch (err: any) {
        console.error("Erro ao ler arquivo Excel:", err);
        setErrorMessage("Erro ao processar o arquivo Excel. Verifique se o arquivo não está corrompido.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setErrorMessage("Erro na leitura do arquivo.");
      setIsProcessing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const processSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    // Converter para JSON com cabeçalhos
    const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (json.length === 0) {
      setRawHeaders([]);
      setPreviewRows([]);
      setErrorMessage("A aba selecionada da planilha está vazia.");
      return;
    }

    const headers = Object.keys(json[0] || {});
    setRawHeaders(headers);
    const sample = json.slice(0, 5);
    setPreviewRows(sample);
    autoDetectColumns(headers, sample);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbookData) {
      processSheet(workbookData, sheetName);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleExecuteMatching = async () => {
    if (!workbookData || !selectedSheet || (!colNome && !colPa)) {
      setErrorMessage("Por favor, selecione as colunas de NOME e PA para fazer a comparação.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const ws = workbookData.Sheets[selectedSheet];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const extractedItems: ExtractedCnhItem[] = [];

      json.forEach((row) => {
        const rawNome = colNome ? String(row[colNome] || "").trim() : "";
        const rawPa = colPa ? String(row[colPa] || "").trim() : "";
        const rawCpf = colCpf ? String(row[colCpf] || "").trim() : "";
        const rawRemessa = colRemessa ? String(row[colRemessa] || "").trim() : "";
        const rawObs = colObs ? String(row[colObs] || "").trim() : "";

        if ((rawNome && rawNome.length > 1) || (rawPa && rawPa.replace(/\D/g, "").length >= 3)) {
          extractedItems.push({
            nome: rawNome ? rawNome.toUpperCase() : "CONDUTOR",
            pa: rawPa,
            cpf: rawCpf,
            remessa: rawRemessa,
            observacao: rawObs,
          });
        }
      });

      if (extractedItems.length === 0) {
        setErrorMessage("Nenhum registro válido (Nome ou PA) foi encontrado na coluna selecionada.");
        setIsProcessing(false);
        return;
      }

      // Cruzamento calibrado com a base geral de CNHs (por PA e Nome, sem nome similar por padrão)
      const matched = await matchExtractedWithGeralCNHs(extractedItems, geralList, {
        allowSimilarName,
      });
      setResults(matched);
    } catch (err: any) {
      console.error("Erro ao cruzar dados do Excel:", err);
      setErrorMessage(err.message || "Erro ao processar as correspondências da planilha.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setWorkbookData(null);
    setSheetNames([]);
    setSelectedSheet("");
    setRawHeaders([]);
    setPreviewRows([]);
    setColNome("");
    setColPa("");
    setColCpf("");
    setColRemessa("");
    setColObs("");
    setShowOptionalCols(false);
    setAllowSimilarName(false);
    setResults(null);
    setErrorMessage(null);
    setFilterCategory("all");
    setSearchTerm("");
  };

  const toggleItemSelection = (id: string) => {
    if (!results) return;
    setResults((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)) : null
    );
  };

  const handleSelectAll = () => {
    if (!results) return;
    setResults((prev) =>
      prev ? prev.map((r) => ({ ...r, selected: true })) : null
    );
  };

  const handleSelectAllLocalizadas = () => {
    if (!results) return;
    setResults((prev) =>
      prev
        ? prev.map((r) => ({
            ...r,
            selected: r.cnhMatched !== null,
          }))
        : null
    );
  };

  const handleSelectAllNovos = () => {
    if (!results) return;
    setResults((prev) =>
      prev
        ? prev.map((r) => ({
            ...r,
            selected: r.cnhMatched === null,
          }))
        : null
    );
  };

  const handleDeselectAll = () => {
    if (!results) return;
    setResults((prev) =>
      prev ? prev.map((r) => ({ ...r, selected: false })) : null
    );
  };

  const handleConfirmRecebimento = async () => {
    if (!results) return;

    // 1. Registros existentes localizados (Remetidas/Pendentes) que apenas terão o status alterado para RECEBIDA
    const toUpdate = results.filter((r) => r.selected && r.cnhMatched !== null && !r.isAlreadyInStockNewOrder);

    // 2. Registros que serão CADASTRADOS COMO NOVO REGISTRO COM NOVA ORDEM:
    // - Não localizados na tabela geral (r.cnhMatched === null)
    // - CNHs que já constam em estoque (Recebida ou Entregue com gaveta/repartição) (r.isAlreadyInStockNewOrder === true)
    const toInsert = results.filter((r) => r.selected && (r.cnhMatched === null || r.isAlreadyInStockNewOrder));

    if (toUpdate.length === 0 && toInsert.length === 0) {
      setErrorMessage("Nenhum registro selecionado para atualizar ou cadastrar.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const userId = currentUser?.id || "sistema-excel";
      const userNome = currentUser?.nome_curto || currentUser?.nome || "Agente DETRAN";
      const fileName = selectedFile?.name || "Planilha";

      let updatedCount = 0;
      let insertedCount = 0;

      const bulkLocation = manualBulkAllocation
        ? { gaveta: bulkGaveta, reparticao: bulkReparticao }
        : undefined;

      // 1. Atualizar registros existentes localizados (Remetidas/Pendentes) para RECEBIDA
      if (toUpdate.length > 0) {
        const itemsPayload = toUpdate.map((r) => ({
          id: r.cnhMatched!.id,
          observacaoExtra: `Excel: ${fileName}${r.extracted.remessa ? ` (Remessa ${r.extracted.remessa})` : ""}`,
        }));
        const resUpdate = await receberCNHsBulk(itemsPayload, userId, userNome, bulkLocation);
        updatedCount = resUpdate.updatedCount;
      }

      // 2. Inserir novos registros (não localizados OU já em estoque preparados para nova ordem)
      if (toInsert.length > 0) {
        const newPayload = toInsert.map((r) => {
          const isStock = Boolean(r.isAlreadyInStockNewOrder && r.cnhMatched);
          const extraObs = isStock
            ? `Importado via planilha Excel (${fileName}) - Nova via/emissão (Constava no estoque na Ordem #${r.cnhMatched!.ordem} como ${r.cnhMatched!.situacao} em ${r.cnhMatched!.gaveta || "-"} / ${r.cnhMatched!.reparticao || "-"}) - Cadastrado diretamente como RECEBIDA com nova ordem`
            : `Importado via planilha Excel (${fileName}) - Não localizado na tabela geral - Cadastrado diretamente como RECEBIDA`;

          return {
            nome: r.extracted.nome || r.cnhMatched?.nome || "",
            pa: r.extracted.pa || r.cnhMatched?.pa || undefined,
            cpf: r.extracted.cpf || r.cnhMatched?.cpf || undefined,
            remessa: r.extracted.remessa || r.cnhMatched?.remessa || undefined,
            observacaoExtra: extraObs,
            forceNewRecord: true,
            cnhAnteriorOrdem: isStock ? r.cnhMatched!.ordem : undefined,
            cnhAnteriorSituacao: isStock ? r.cnhMatched!.situacao : undefined,
          };
        });

        const resInsert = await cadastrarNovasCNHsRecebidas(newPayload, userId, userNome, bulkLocation);
        insertedCount = resInsert.insertedCount;
      }

      onSuccess(updatedCount, results.length, insertedCount);
      onClose();
    } catch (err: any) {
      console.error("Erro ao processar planilha Excel:", err);
      setErrorMessage(err.message || "Erro ao processar as CNHs da planilha.");
    } finally {
      setIsSaving(false);
    }
  };

  const getActiveTabLabel = () => {
    switch (filterCategory) {
      case "localizadas":
        return "Localizadas";
      case "nao_localizadas":
        return "Novos Cadastros";
      case "ready_to_receive":
        return "Prontas p/ Receber";
      case "already_received":
        return "Já no Estoque";
      default:
        return "Todas";
    }
  };

  const handleExportPdfByGroup = (
    groupKey: "selected" | "all" | "localizadas" | "nao_localizadas" | "ready_to_receive" | "already_received" | "current_tab",
    groupLabel: string
  ) => {
    if (!results || results.length === 0) return;

    let targetItems: OcrMatchResult[] = [];

    if (groupKey === "selected") {
      targetItems = results.filter((r) => r.selected);
    } else if (groupKey === "all") {
      targetItems = results;
    } else if (groupKey === "localizadas") {
      targetItems = results.filter((r) => r.cnhMatched !== null && r.selected);
      if (targetItems.length === 0) targetItems = results.filter((r) => r.cnhMatched !== null);
    } else if (groupKey === "nao_localizadas") {
      targetItems = results.filter((r) => r.cnhMatched === null && r.selected);
      if (targetItems.length === 0) targetItems = results.filter((r) => r.cnhMatched === null);
    } else if (groupKey === "ready_to_receive") {
      targetItems = results.filter((r) => r.category === "ready_to_receive" && r.selected);
      if (targetItems.length === 0) targetItems = results.filter((r) => r.category === "ready_to_receive");
    } else if (groupKey === "already_received") {
      targetItems = results.filter((r) => Boolean(r.isAlreadyInStockNewOrder) && r.selected);
      if (targetItems.length === 0) targetItems = results.filter((r) => Boolean(r.isAlreadyInStockNewOrder));
    } else if (groupKey === "current_tab") {
      targetItems = filteredResults.filter((r) => r.selected);
      if (targetItems.length === 0) targetItems = filteredResults;
    }

    if (targetItems.length === 0) {
      setFeedbackMessage({
        type: "error",
        text: `Nenhuma CNH selecionada encontrada para o grupo "${groupLabel}".`,
      });
      return;
    }

    try {
      const cfg = getOrgaoConfig();
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const dataStr = `Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

      const tableData = targetItems.map((item, idx) => {
        const isMatched = item.cnhMatched !== null;
        const ordemStr = isMatched ? `#${item.cnhMatched!.ordem}` : "Novo";
        const nomeStr = (item.extracted.nome || item.cnhMatched?.nome || "-").toUpperCase();
        const paStr = item.extracted.pa || item.cnhMatched?.pa || "-";
        const cpfRaw = item.extracted.cpf || item.cnhMatched?.cpf || "";
        const cpfStr = cpfRaw ? formatCPF(cpfRaw) : "-";

        const gavetaRaw = manualBulkAllocation
          ? bulkGaveta
          : item.suggestedGaveta || item.cnhMatched?.gaveta || "";
        const reparticaoRaw = manualBulkAllocation
          ? bulkReparticao
          : item.suggestedReparticao || item.cnhMatched?.reparticao || "";

        const gavetaClean = cleanNumeroApenas(gavetaRaw);
        const reparticaoClean = cleanNumeroApenas(reparticaoRaw);

        return [
          String(idx + 1).padStart(2, "0"),
          ordemStr,
          nomeStr,
          paStr,
          cpfStr,
          gavetaClean,
          reparticaoClean,
          "", // Coluna de Data em branco para preenchimento manual conforme padrão solicitado
          "", // Coluna de Assinatura / Visto em branco para conferência física
        ];
      });

      autoTable(doc, {
        startY: 25,
        margin: { top: 25, bottom: 12, left: 10, right: 10 },
        head: [["Item", "Ordem", "Nome do Titular", "PA", "CPF", "Gav.", "Rep.", "Data", "Assinatura / Visto"]],
        body: tableData,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7,
          cellPadding: { top: 1.8, bottom: 1.8, left: 1.2, right: 1.2 },
          minCellHeight: 6,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 9, fontStyle: "bold" },
          1: { halign: "center", cellWidth: 14, fontStyle: "bold" },
          2: { cellWidth: 56, fontStyle: "bold", overflow: "ellipsize" },
          3: { halign: "center", cellWidth: 19, font: "helvetica" },
          4: { halign: "center", cellWidth: 23, font: "helvetica" },
          5: { halign: "center", cellWidth: 9, fontStyle: "bold" },
          6: { halign: "center", cellWidth: 9, fontStyle: "bold" },
          7: { halign: "center", cellWidth: 16 },
          8: { cellWidth: 35 },
        },
        didDrawPage: (data) => {
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const leftMarginX = 10;
          const rightMarginX = pageWidth - 10;

          // Tenta desenhar a logo oficial no lado esquerdo do cabeçalho
          const hasLogo = addPDFHeaderLogo(doc, leftMarginX, 5, 14, 14);
          const startTextX = hasLogo ? 27 : leftMarginX;

          // Cabeçalho Oficial Repetido em TODAS as páginas
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(15, 23, 42);
          doc.text(`${cfg.sigla || "DETRAN"} — Setor Operacional de Protocolo e Entregas`, startTextX, 10);

          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 58, 138);
          doc.text(`CONFERÊNCIA DE RECEBIMENTO — PLANILHA EXCEL (${groupLabel.toUpperCase()})`, startTextX, 14.5);

          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
          const fileNameStr = selectedFile?.name || "Planilha Excel";
          doc.text(`Arquivo: ${fileNameStr} • Órgão: ${cfg.orgao || "DETRAN"}`, startTextX, 18.5);

          // Metadados à direita
          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);
          doc.text(dataStr, rightMarginX, 10, { align: "right" });
          doc.text(`Grupo: ${groupLabel} (${targetItems.length} CNHs)`, rightMarginX, 14.5, { align: "right" });
          doc.text(`Alocação: ${manualBulkAllocation ? `${bulkGaveta} / ${bulkReparticao}` : "Automática por Inicial"}`, rightMarginX, 18.5, { align: "right" });

          // Linha divisória
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.4);
          doc.line(leftMarginX, 22, rightMarginX, 22);

          // Rodapé em TODAS as páginas
          doc.setFontSize(7.2);
          doc.setTextColor(148, 163, 184);
          doc.text("Sistema DETRAN-PROT — Conferência Física e Recebimento de CNHs via Planilha", leftMarginX, pageHeight - 6);
          doc.text(`Página ${data.pageNumber}`, rightMarginX, pageHeight - 6, { align: "right" });
        },
      });

      const sanitizedGroup = groupLabel.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      doc.save(`Conferencia_Recebimento_${sanitizedGroup}_${new Date().toISOString().slice(0, 10)}.pdf`);

      setShowPdfDropdown(false);
      setFeedbackMessage({
        type: "success",
        text: `Arquivo PDF baixado com sucesso! (${targetItems.length} CNHs do grupo "${groupLabel}").`,
      });
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      setFeedbackMessage({
        type: "error",
        text: `Erro ao gerar o arquivo PDF: ${err.message || "Tente novamente."}`,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-fadeIn">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Importar e Conferir Planilha Excel de CNHs Recebidas</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-md border border-emerald-300 dark:border-emerald-800">
                  Cruzamento Nome + PA
                </span>
                {!allowSimilarName && (
                  <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded-md border border-blue-300 dark:border-blue-800">
                    Modo Estrito (Sem Nome Similar)
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cruze as colunas <strong className="text-emerald-700 dark:text-emerald-300">NOME</strong> e <strong className="text-emerald-700 dark:text-emerald-300">PA</strong> com a base geral. Os localizados mudam para <strong className="text-blue-600 dark:text-blue-400">RECEBIDA</strong> e os não localizados serão <strong className="text-indigo-600 dark:text-indigo-400">CADASTRADOS COMO RECEBIDA</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center justify-between gap-2 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Mensagem de Feedback (PDF gerado ou avisos) */}
        {feedbackMessage && (
          <div
            className={`mx-6 mt-3 p-3.5 border rounded-xl text-xs flex items-center justify-between gap-2 animate-fadeIn ${
              feedbackMessage.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Conteúdo Principal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* ETAPA 1: UPLOAD DO ARQUIVO EXCEL */}
          {!results && (
            <div className="space-y-5">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30"
                    : selectedFile
                    ? "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20"
                    : "border-slate-300 dark:border-slate-700 hover:border-emerald-400 bg-slate-50/50 dark:bg-slate-800/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-full">
                      <FileSpreadsheet className="w-8 h-8" />
                    </div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Clique ou arraste para trocar de planilha
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-full">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        Clique para selecionar ou arraste o arquivo Excel aqui
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Formatos suportados: <strong>.xlsx, .xls ou .csv</strong> (Planilha com colunas de NOME e PA)
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* MAPEAMENTO DE COLUNAS (Focado em NOME e PA) */}
              {rawHeaders.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Colunas de Comparação da Planilha (Nome & PA)
                      </span>
                    </div>

                    {sheetNames.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Aba / Planilha:</span>
                        <select
                          value={selectedSheet}
                          onChange={(e) => handleSheetChange(e.target.value)}
                          className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold"
                        >
                          {sheetNames.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* As 2 Colunas Principais: NOME e PA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border-2 border-emerald-300 dark:border-emerald-700/60 shadow-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span>1. Coluna do NOME</span>
                          <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold rounded">Obrigatória</span>
                        </label>
                      </div>
                      <select
                        value={colNome}
                        onChange={(e) => setColNome(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs p-2 text-slate-900 dark:text-white font-semibold"
                      >
                        <option value="">Selecione a coluna de Nome...</option>
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Nome do condutor na planilha</p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border-2 border-emerald-300 dark:border-emerald-700/60 shadow-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span>2. Coluna do PA (Processo CNH)</span>
                          <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold rounded">Chave de Cruzamento</span>
                        </label>
                      </div>
                      <select
                        value={colPa}
                        onChange={(e) => setColPa(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs p-2 text-slate-900 dark:text-white font-semibold"
                      >
                        <option value="">Selecione a coluna de PA...</option>
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Número do PA / identificador único da CNH</p>
                    </div>
                  </div>

                  {/* Calibração do Motor: Sem Cruzamento por Nome Similar */}
                  <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-start sm:items-center gap-2 text-emerald-900 dark:text-emerald-200">
                      <CheckCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                      <div>
                        <span className="font-bold">Motor Calibrado (Sem Nome Similar): </span>
                        <span className="text-emerald-800 dark:text-emerald-300 text-[11px]">
                          Localiza apenas por <strong>Nome Exato</strong>, <strong>PA Exato</strong> ou <strong>CPF Exato</strong>. Nomes parecidos/similares não são vinculados para evitar misturar condutores distintos.
                        </span>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-slate-400 shrink-0 select-none bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={allowSimilarName}
                        onChange={(e) => setAllowSimilarName(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-amber-600 border-slate-300 focus:ring-amber-500 cursor-pointer"
                      />
                      <span>Permitir busca por similaridade</span>
                    </label>
                  </div>

                  {/* Botão de colunas adicionais opcionais (para não poluir quando a planilha tem apenas Nome e PA) */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowOptionalCols(!showOptionalCols)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {showOptionalCols ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>{showOptionalCols ? "Ocultar colunas opcionais adicionais" : "Outras colunas opcionais (CPF, Remessa, Observações)"}</span>
                    </button>

                    {showOptionalCols && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 animate-fadeIn">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Coluna do CPF (Opcional)
                          </label>
                          <select
                            value={colCpf}
                            onChange={(e) => setColCpf(e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs p-2 text-slate-900 dark:text-white font-medium"
                          >
                            <option value="">Nenhuma / Sem CPF</option>
                            {rawHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Coluna de Remessa / Lote (Opcional)
                          </label>
                          <select
                            value={colRemessa}
                            onChange={(e) => setColRemessa(e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs p-2 text-slate-900 dark:text-white font-medium"
                          >
                            <option value="">Nenhuma / Opcional</option>
                            {rawHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Coluna de Observações (Opcional)
                          </label>
                          <select
                            value={colObs}
                            onChange={(e) => setColObs(e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs p-2 text-slate-900 dark:text-white font-medium"
                          >
                            <option value="">Nenhuma / Opcional</option>
                            {rawHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Prévia das Primeiras Linhas */}
                  {previewRows.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5">
                        <TableProperties className="w-3.5 h-3.5" />
                        <span>Prévia das primeiras linhas do arquivo:</span>
                      </div>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto bg-white dark:bg-slate-900">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            <tr>
                              {rawHeaders.slice(0, 6).map((h) => (
                                <th key={h} className="p-2 font-bold whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {previewRows.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                {rawHeaders.slice(0, 6).map((h) => (
                                  <td key={h} className="p-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                    {String(r[h] || "-")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Ações da Etapa 1 */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleExecuteMatching}
                  disabled={!selectedFile || !colNome || isProcessing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Cruzando Nome e PA...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Conferir Correspondências com a Tabela Geral</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ETAPA 2: RESULTADOS E CONFERÊNCIA DAS CORRESPONDÊNCIAS */}
          {results && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Cartões de Estatísticas com destaque para Localizados e Novos Cadastros */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total na Planilha</div>
                  <div className="text-xl font-black text-slate-800 dark:text-slate-100">{stats.total}</div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Localizadas no Sistema</span>
                  </div>
                  <div className="text-xl font-black text-emerald-900 dark:text-emerald-100">
                    {stats.localizadas} <span className="text-xs font-normal text-emerald-700 dark:text-emerald-300">({stats.remetidas} a receber)</span>
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Não Localizadas (Novos)</span>
                  </div>
                  <div className="text-xl font-black text-indigo-900 dark:text-indigo-100">
                    {stats.naoEncontradas} <span className="text-xs font-normal text-indigo-700 dark:text-indigo-300">(serão cadastradas)</span>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="text-[11px] font-bold text-blue-800 dark:text-blue-300">Selecionadas p/ Ação</div>
                  <div className="text-xl font-black text-blue-900 dark:text-blue-100">
                    {stats.totalSelecionadas} <span className="text-xs font-normal text-blue-700">({stats.selecionadasParaAtualizar} atualiz. + {stats.selecionadasParaInserir} novos cadastros)</span>
                  </div>
                </div>
              </div>

              {/* Banner Informativo Explicando o Processo */}
              <div className="bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 rounded-xl p-3 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-blue-800 dark:text-blue-200">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Motor de Importação Calibrado:</strong> Localizadas <strong>{stats.localizadas}</strong> CNH(s) no sistema (<strong>{stats.remetidas}</strong> a receber; <strong>{stats.jaNoEstoque}</strong> já em estoque preparadas para <strong>novo cadastro com nova ordem</strong>) e <strong>{stats.naoEncontradas}</strong> novos condutores (total de <strong>{stats.selecionadasParaInserir}</strong> novos cadastros com nova ordem gerada).
                  </span>
                </div>
              </div>

              {/* Opção de Escolha de Gaveta e Repartição para as CNHs em Lote */}
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={manualBulkAllocation}
                      onChange={(e) => setManualBulkAllocation(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 cursor-pointer"
                    />
                    <span className="flex items-center gap-1.5">
                      <FolderArchive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Definir Gaveta e Repartição única para todas as CNHs deste lote
                    </span>
                  </label>

                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {manualBulkAllocation ? (
                      <span className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1">
                        ✓ Modo Manual Ativo
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Mapeamento Automático por Letra Inicial
                      </span>
                    )}
                  </span>
                </div>

                {manualBulkAllocation ? (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                        <FolderArchive className="w-3.5 h-3.5 text-blue-500" />
                        Gaveta de Destino (Lote)
                      </label>
                      <select
                        value={bulkGaveta}
                        onChange={(e) => setBulkGaveta(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                      >
                        {DEFAULT_GAVETAS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        Repartição de Destino (Lote)
                      </label>
                      <select
                        value={bulkReparticao}
                        onChange={(e) => setBulkReparticao(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                      >
                        {DEFAULT_REPARTICOES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    O sistema utilizará o mapeamento automático configurado (cada CNH alocada em sua gaveta e repartição correspondente à inicial do condutor).
                  </p>
                )}
              </div>

              {/* Filtros e Barra de Pesquisa */}
              <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
                
                {/* Abas / Filtros de Categoria */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setFilterCategory("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      filterCategory === "all"
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    Todas ({stats.total})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterCategory("localizadas")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      filterCategory === "localizadas"
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100"
                    }`}
                  >
                    Localizadas ({stats.localizadas})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterCategory("nao_localizadas")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                      filterCategory === "nao_localizadas"
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 hover:bg-indigo-100"
                    }`}
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Novos Cadastros ({stats.naoEncontradas})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterCategory("ready_to_receive")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      filterCategory === "ready_to_receive"
                        ? "bg-amber-600 text-white"
                        : "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100"
                    }`}
                  >
                    Prontas p/ Receber ({stats.remetidas})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterCategory("already_received")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                      filterCategory === "already_received"
                        ? "bg-amber-600 text-white"
                        : "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Já no Estoque ({stats.jaRecebidas + stats.jaEntregues})</span>
                    <span className="px-1.5 py-0.2 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 rounded text-[9px] font-bold">
                      Nova Ordem
                    </span>
                  </button>
                </div>

                {/* Campo de Busca */}
                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou PA..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Botões de Seleção Rápida e Ação de Baixar PDF por Grupo */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 py-1 px-1 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Seleção Rápida:</span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-blue-700 dark:text-blue-400 hover:underline font-bold cursor-pointer"
                  >
                    Marcar Todos ({stats.total})
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSelectAllLocalizadas}
                    className="text-emerald-700 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
                  >
                    Apenas Localizados ({stats.localizadas})
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSelectAllNovos}
                    className="text-indigo-700 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                  >
                    Apenas Novos Cadastros ({stats.naoEncontradas})
                  </button>
                  {stats.jaNoEstoque > 0 && (
                    <>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!results) return;
                          setResults((prev) =>
                            prev
                              ? prev.map((r) => ({
                                  ...r,
                                  selected: Boolean(r.isAlreadyInStockNewOrder),
                                }))
                              : null
                          );
                        }}
                        className="text-amber-700 dark:text-amber-400 hover:underline font-bold cursor-pointer"
                      >
                        Apenas Já no Estoque / Nova Ordem ({stats.jaNoEstoque})
                      </button>
                    </>
                  )}
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    Desmarcar Todos
                  </button>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap justify-end">
                  <div className="font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                    {stats.totalSelecionadas} selecionado(s) para processamento
                  </div>

                  {/* Dropdown de Ação: Baixar Arquivo PDF por Grupo */}
                  <div className="relative" ref={pdfMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowPdfDropdown(!showPdfDropdown)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all cursor-pointer whitespace-nowrap"
                      title="Baixar lista em PDF para conferência física e assinatura por grupo"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Baixar PDF por Grupo</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showPdfDropdown ? "rotate-180" : ""}`} />
                    </button>

                    {showPdfDropdown && (
                      <div className="absolute right-0 top-full mt-1.5 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-30 py-1.5 animate-fadeIn">
                        <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-900/50">
                          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Baixar Arquivo PDF por Grupo</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Formato oficial vertical A4 com campos para conferência, data e visto/assinatura
                          </div>
                        </div>

                        <div className="py-1 max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {/* Todas as Selecionadas */}
                          <button
                            type="button"
                            onClick={() => handleExportPdfByGroup("selected", "Todas Selecionadas")}
                            disabled={stats.totalSelecionadas === 0}
                            className="w-full px-3.5 py-2 text-left hover:bg-emerald-50/70 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                                <CheckCheck className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  Todas Selecionadas
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Todas as CNHs marcadas no modal
                                </div>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 rounded-md font-bold text-[10px]">
                              {stats.totalSelecionadas}
                            </span>
                          </button>

                          {/* Aba Atual / Filtro Ativo */}
                          <button
                            type="button"
                            onClick={() => handleExportPdfByGroup("current_tab", `Aba ${getActiveTabLabel()}`)}
                            className="w-full px-3.5 py-2 text-left hover:bg-emerald-50/70 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                                <Layers className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  Aba Atual: {getActiveTabLabel()}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  CNHs exibidas no filtro e busca atuais
                                </div>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md font-bold text-[10px]">
                              {filteredResults.filter((r) => r.selected).length || filteredResults.length}
                            </span>
                          </button>

                          {/* Apenas Localizadas */}
                          <button
                            type="button"
                            onClick={() => handleExportPdfByGroup("localizadas", "Localizadas no Sistema")}
                            disabled={stats.localizadas === 0}
                            className="w-full px-3.5 py-2 text-left hover:bg-emerald-50/70 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  Localizadas no Sistema
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  CNHs que já constavam na base
                                </div>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded-md font-bold text-[10px]">
                              {results ? results.filter((r) => r.cnhMatched !== null && r.selected).length || stats.localizadas : 0}
                            </span>
                          </button>

                          {/* Apenas Novos Cadastros */}
                          <button
                            type="button"
                            onClick={() => handleExportPdfByGroup("nao_localizadas", "Novos Cadastros")}
                            disabled={stats.naoEncontradas === 0}
                            className="w-full px-3.5 py-2 text-left hover:bg-emerald-50/70 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
                                <UserPlus className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  Novos Cadastros
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  CNHs que serão cadastradas agora
                                </div>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 rounded-md font-bold text-[10px]">
                              {results ? results.filter((r) => r.cnhMatched === null && r.selected).length || stats.naoEncontradas : 0}
                            </span>
                          </button>

                          {/* Prontas p/ Receber */}
                          <button
                            type="button"
                            onClick={() => handleExportPdfByGroup("ready_to_receive", "Prontas p/ Receber")}
                            disabled={stats.remetidas === 0}
                            className="w-full px-3.5 py-2 text-left hover:bg-emerald-50/70 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 shrink-0">
                                <FolderArchive className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  Prontas p/ Receber
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  CNHs em status Remetida
                                </div>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-md font-bold text-[10px]">
                              {results ? results.filter((r) => r.category === "ready_to_receive" && r.selected).length || stats.remetidas : 0}
                            </span>
                          </button>

                          {/* Já no Estoque / Nova Ordem */}
                          {stats.jaNoEstoque > 0 && (
                            <button
                              type="button"
                              onClick={() => handleExportPdfByGroup("already_received", "Já no Estoque - Nova Ordem")}
                              className="w-full px-3.5 py-2 text-left hover:bg-emerald-50/70 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 shrink-0">
                                  <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                    Já no Estoque (Nova Ordem)
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    CNHs com nova emissão/ordem
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-md font-bold text-[10px]">
                                {results ? results.filter((r) => Boolean(r.isAlreadyInStockNewOrder) && r.selected).length || stats.jaNoEstoque : 0}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabela de Correspondências */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={stats.totalSelecionadas > 0 && stats.totalSelecionadas === stats.total}
                            onChange={(e) => {
                              if (e.target.checked) handleSelectAll();
                              else handleDeselectAll();
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            title="Selecionar todos os registros"
                          />
                        </th>
                        <th className="p-3 font-bold">Dados da Planilha (Nome & PA)</th>
                        <th className="p-3 font-bold">Diagnóstico no Sistema</th>
                        <th className="p-3 font-bold">Ação a Executar</th>
                        <th className="p-3 font-bold">Alocação Prevista</th>
                        <th className="p-3 font-bold text-center">Critério de Cruzamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {filteredResults.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            Nenhum registro corresponde aos filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        filteredResults.map((item) => {
                          const isMatched = item.cnhMatched !== null;
                          const currentSituacao = item.cnhMatched?.situacao;
                          const isAlreadyInStock = Boolean(item.isAlreadyInStockNewOrder);
                          const willChangeToReceived = item.selected && isMatched && currentSituacao !== "Recebida" && !isAlreadyInStock;
                          const isNewInsert = !isMatched;

                          return (
                            <tr
                              key={item.id}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                isAlreadyInStock
                                  ? item.selected
                                    ? "bg-amber-50/50 dark:bg-amber-950/25 border-l-2 border-l-amber-500"
                                    : "bg-amber-50/20 dark:bg-amber-950/10"
                                  : isNewInsert
                                  ? item.selected
                                    ? "bg-indigo-50/50 dark:bg-indigo-950/25 border-l-2 border-l-indigo-500"
                                    : "bg-indigo-50/20 dark:bg-indigo-950/10"
                                  : item.selected
                                  ? "bg-emerald-50/40 dark:bg-emerald-950/20"
                                  : ""
                              }`}
                            >
                              {/* Checkbox (Habilitado para todos, inclusive novos a cadastrar) */}
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.selected}
                                  onChange={() => toggleItemSelection(item.id)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              </td>

                              {/* Dados da Planilha (Nome e PA) */}
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-white uppercase">
                                  {item.extracted.nome}
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                  {item.extracted.pa ? (
                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-md font-mono font-bold text-[10px] border border-emerald-300 dark:border-emerald-800">
                                      PA: {item.extracted.pa}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic text-[10px]">Sem PA na planilha</span>
                                  )}
                                  {item.extracted.cpf && (
                                    <span>CPF: <strong>{item.extracted.cpf}</strong></span>
                                  )}
                                  {item.extracted.remessa && (
                                    <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[10px]">
                                      Remessa: {item.extracted.remessa}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Diagnóstico no Sistema */}
                              <td className="p-3">
                                {isAlreadyInStock ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 font-extrabold text-[9px] uppercase rounded-md border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                        <span>Já em Estoque (Nova Ordem)</span>
                                      </span>
                                      <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px] rounded text-slate-700 dark:text-slate-300">
                                        #{item.cnhMatched!.ordem}
                                      </span>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        {item.cnhMatched!.nome}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                                      <span className="text-amber-800 dark:text-amber-300 font-medium">
                                        Situação atual: <strong>{currentSituacao}</strong> ({item.cnhMatched!.gaveta || "-"} / {item.cnhMatched!.reparticao || "-"})
                                      </span>
                                      {item.cnhMatched!.pa && (
                                        <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold text-[10px]">
                                          PA: {item.cnhMatched!.pa}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                      ⚡ Será criado NOVO CADASTRO com NOVA ORDEM
                                    </p>
                                  </div>
                                ) : isMatched ? (
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold text-[9px] uppercase rounded">
                                        ✓ Localizado
                                      </span>
                                      <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px] rounded text-slate-700 dark:text-slate-300">
                                        #{item.cnhMatched!.ordem}
                                      </span>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        {item.cnhMatched!.nome}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                      {item.cnhMatched!.pa && (
                                        <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold text-[10px]">
                                          PA Sistema: {item.cnhMatched!.pa}
                                        </span>
                                      )}
                                      {item.cnhMatched!.cpf && (
                                        <span>CPF: {item.cnhMatched!.cpf}</span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-extrabold text-[10px] uppercase rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                                        <UserPlus className="w-3 h-3" />
                                        <span>Não Localizado (Novo Cadastro)</span>
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
                                      Será inserido como novo cadastro com Situação <strong>RECEBIDA</strong>
                                    </p>
                                  </div>
                                )}
                              </td>

                              {/* Ação a Executar */}
                              <td className="p-3">
                                {isAlreadyInStock ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-600 text-white shadow-xs flex items-center gap-1">
                                      <UserPlus className="w-3 h-3" />
                                      <span>Novo Cadastro</span>
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400" />
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                                      RECEBIDA (Nova Ordem)
                                    </span>
                                  </div>
                                ) : isMatched ? (
                                  willChangeToReceived ? (
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          currentSituacao === "Remetida"
                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                        }`}
                                      >
                                        {currentSituacao}
                                      </span>
                                      <ArrowRight className="w-3 h-3 text-slate-400" />
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                                        RECEBIDA
                                      </span>
                                    </div>
                                  ) : (
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        currentSituacao === "Recebida"
                                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                          : currentSituacao === "Entregue"
                                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                      }`}
                                    >
                                      {currentSituacao} (Manter no Estoque)
                                    </span>
                                  )
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white shadow-xs flex items-center gap-1">
                                      <UserPlus className="w-3 h-3" />
                                      <span>Cadastrar</span>
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400" />
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                                      RECEBIDA
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Alocação Prevista */}
                              <td className="p-3">
                                {manualBulkAllocation ? (
                                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 font-bold rounded text-[11px] border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1">
                                    <FolderArchive className="w-3 h-3 text-blue-600" />
                                    {bulkGaveta} / {bulkReparticao}
                                  </span>
                                ) : item.suggestedGaveta ? (
                                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 rounded text-[11px]">
                                    {item.suggestedGaveta} {item.suggestedReparticao}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Critério de Cruzamento */}
                              <td className="p-3 text-center">
                                {isAlreadyInStock ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold rounded-full inline-flex items-center gap-1 border border-amber-300 dark:border-amber-800">
                                      <Sparkles className="w-3 h-3 text-amber-600" /> Nova Emissão
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      {item.matchType === "exact_pa" ? "PA Exato" : item.matchType === "exact_name" ? "Nome Exato" : "Estoque"}
                                    </span>
                                  </div>
                                ) : item.matchType === "exact_pa" ? (
                                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> PA Exato (100%)
                                  </span>
                                ) : item.matchType === "exact_name" ? (
                                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 text-[10px] font-bold rounded-full inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Nome Exato
                                  </span>
                                ) : item.matchType === "similar_name" ? (
                                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">
                                    Nome Similar ({item.matchScore}%)
                                  </span>
                                ) : item.matchType === "exact_cpf" ? (
                                  <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 text-[10px] font-extrabold rounded-full inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> CPF Exato
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold rounded-full border border-indigo-200 dark:border-indigo-800">
                                    Novo Cadastro
                                  </span>
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

              {/* Rodapé de Ações de Confirmação */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Trocar Planilha / Novo Arquivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportPdfByGroup("selected", "Todas Selecionadas")}
                    disabled={isSaving || stats.totalSelecionadas === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-xl transition-colors cursor-pointer border border-emerald-300 dark:border-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Baixar lista oficial em PDF com todas as CNHs marcadas"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Baixar PDF Selecionadas ({stats.totalSelecionadas})</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSaving}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmRecebimento}
                    disabled={isSaving || stats.totalSelecionadas === 0}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 transition-all cursor-pointer w-full sm:w-auto"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Processando Registros...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {stats.selecionadasParaAtualizar > 0 && stats.selecionadasParaInserir > 0
                            ? `Confirmar: Atualizar ${stats.selecionadasParaAtualizar} e Cadastrar ${stats.selecionadasParaInserir} com Nova Ordem como RECEBIDA`
                            : stats.selecionadasParaInserir > 0
                            ? `Cadastrar ${stats.selecionadasParaInserir} CNHs com Nova Ordem como RECEBIDA`
                            : `Confirmar e Mudar para RECEBIDA (${stats.selecionadasParaAtualizar} CNHs)`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
