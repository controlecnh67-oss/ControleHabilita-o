import React, { useState, useRef, useMemo } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowRight,
  ShieldCheck,
  Check,
  SlidersHorizontal,
  TableProperties
} from "lucide-react";
import * as XLSX from "xlsx";
import { GeralCNH, Usuario } from "../types";
import {
  matchExtractedWithGeralCNHs,
  ExtractedCnhItem,
  OcrMatchResult,
} from "../services/ocrService";
import { receberCNHsBulk } from "../services/db";

interface ExcelRecebimentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  geralList: GeralCNH[];
  currentUser: Usuario | null;
  onSuccess: (updatedCount: number, totalExtracted: number) => void;
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

  // Mapeamento de colunas
  const [colNome, setColNome] = useState<string>("");
  const [colPa, setColPa] = useState<string>("");
  const [colCpf, setColCpf] = useState<string>("");
  const [colRemessa, setColRemessa] = useState<string>("");
  const [colObs, setColObs] = useState<string>("");

  // Resultados de correspondência
  const [results, setResults] = useState<OcrMatchResult[] | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estatísticas e Contadores calculados com useMemo
  const stats = useMemo(() => {
    if (!results) {
      return {
        total: 0,
        remetidas: 0,
        pendentes: 0,
        jaRecebidas: 0,
        jaEntregues: 0,
        naoEncontradas: 0,
        selecionadas: 0,
      };
    }
    return {
      total: results.length,
      remetidas: results.filter((r) => r.category === "ready_to_receive").length,
      pendentes: results.filter((r) => r.category === "pending").length,
      jaRecebidas: results.filter((r) => r.category === "already_received").length,
      jaEntregues: results.filter((r) => r.category === "already_delivered").length,
      naoEncontradas: results.filter((r) => r.category === "not_found").length,
      selecionadas: results.filter((r) => r.selected && r.cnhMatched !== null).length,
    };
  }, [results]);

  // Itens filtrados para a tabela
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter((item) => {
      if (filterCategory === "ready_to_receive" && item.category !== "ready_to_receive") return false;
      if (filterCategory === "pending" && item.category !== "pending") return false;
      if (
        filterCategory === "already_received" &&
        item.category !== "already_received" &&
        item.category !== "already_delivered"
      )
        return false;
      if (filterCategory === "not_found" && item.category !== "not_found") return false;
      if (filterCategory === "selected" && !item.selected) return false;

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

  if (!isOpen) return null;

  // Detecção automática de cabeçalhos
  const autoDetectColumns = (headers: string[]) => {
    let detectedNome = "";
    let detectedPa = "";
    let detectedCpf = "";
    let detectedRemessa = "";
    let detectedObs = "";

    headers.forEach((h) => {
      const clean = h.trim().toUpperCase();
      if (!detectedNome && (clean.includes("NOME") || clean.includes("CONDUTOR") || clean.includes("TITULAR") || clean.includes("CLIENTE") || clean.includes("NOME DO CONDUTOR"))) {
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

    if (!detectedNome && headers.length > 0) {
      detectedNome = headers[0];
    }
    if (!detectedCpf && headers.length > 1 && headers[1] !== detectedNome && headers[1] !== detectedPa) {
      detectedCpf = headers[1];
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
    setPreviewRows(json.slice(0, 5));
    autoDetectColumns(headers);
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
      setErrorMessage("Por favor, selecione a coluna do NOME ou do PA dos condutores.");
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

        if ((rawNome && rawNome.length > 1) || (rawPa && rawPa.length >= 6)) {
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

      // Cruzamento inteligente com a base geral de CNHs (por PA, Nome e CPF)
      const matched = await matchExtractedWithGeralCNHs(extractedItems, geralList);
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

  const handleSelectAllRemetidas = () => {
    if (!results) return;
    setResults((prev) =>
      prev
        ? prev.map((r) => ({
            ...r,
            selected: r.category === "ready_to_receive" || r.category === "pending",
          }))
        : null
    );
  };

  const handleSelectAllFound = () => {
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

  const handleDeselectAll = () => {
    if (!results) return;
    setResults((prev) =>
      prev ? prev.map((r) => ({ ...r, selected: false })) : null
    );
  };

  const handleConfirmRecebimento = async () => {
    if (!results) return;

    const toUpdate = results.filter((r) => r.selected && r.cnhMatched !== null);
    if (toUpdate.length === 0) {
      setErrorMessage("Nenhuma CNH correspondente foi selecionada para recebimento.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const itemsPayload = toUpdate.map((r) => ({
        id: r.cnhMatched!.id,
        observacaoExtra: `Excel: ${selectedFile?.name || "Planilha"}${r.extracted.remessa ? ` (Remessa ${r.extracted.remessa})` : ""}`,
      }));

      const userId = currentUser?.id || "sistema-excel";
      const userNome = currentUser?.nome_curto || currentUser?.nome || "Agente DETRAN";

      const res = await receberCNHsBulk(itemsPayload, userId, userNome);

      onSuccess(res.updatedCount, results.length);
      onClose();
    } catch (err: any) {
      console.error("Erro ao salvar recebimento via Excel:", err);
      setErrorMessage(err.message || "Erro ao atualizar a situação das CNHs para Recebida.");
    } finally {
      setIsSaving(false);
    }
  };

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
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Importar e Conferir Planilha Excel de CNHs Recebidas</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-md border border-emerald-300 dark:border-emerald-800">
                  .XLSX / .CSV
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Carregue a planilha para cruzar nomes e CPFs com o sistema e alterar a situação de <strong className="text-amber-600 dark:text-amber-400">REMETIDA</strong> para <strong className="text-blue-600 dark:text-blue-400">RECEBIDA</strong> em lote.
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
                        Formatos suportados: <strong>.xlsx, .xls ou .csv</strong> (Planilhas de CNHs recebidas)
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* MAPEAMENTO DE COLUNAS (Quando o arquivo foi carregado) */}
              {rawHeaders.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Configuração de Colunas da Planilha
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

                  {/* Seletores de Colunas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Coluna do NOME
                      </label>
                      <select
                        value={colNome}
                        onChange={(e) => setColNome(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs p-2 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">Selecione...</option>
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                        Coluna do PA (9 dígitos) <span className="text-emerald-500 font-extrabold">★</span>
                      </label>
                      <select
                        value={colPa}
                        onChange={(e) => setColPa(e.target.value)}
                        className="w-full bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs p-2 text-slate-900 dark:text-white font-medium"
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
                        Coluna do CPF
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
                        Coluna de Remessa / Lote
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
                        Coluna de Observações
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
                      <span>Cruzando Dados...</span>
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
              
              {/* Cartões de Estatísticas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total na Planilha</div>
                  <div className="text-xl font-black text-slate-800 dark:text-slate-100">{stats.total}</div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">🟡 Prontas p/ Receber</div>
                  <div className="text-xl font-black text-amber-800 dark:text-amber-200">
                    {stats.remetidas} <span className="text-xs font-normal">({stats.remetidas + stats.pendentes} elegíveis)</span>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">🔵 Já no Estoque / Entregues</div>
                  <div className="text-xl font-black text-blue-800 dark:text-blue-200">
                    {stats.jaRecebidas + stats.jaEntregues}
                  </div>
                </div>

                <div className="bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-800">
                  <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">⚪ Não Localizadas</div>
                  <div className="text-xl font-black text-rose-800 dark:text-rose-200">{stats.naoEncontradas}</div>
                </div>
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      filterCategory === "already_received"
                        ? "bg-blue-600 text-white"
                        : "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-100"
                    }`}
                  >
                    Já Recebidas ({stats.jaRecebidas})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterCategory("not_found")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      filterCategory === "not_found"
                        ? "bg-rose-600 text-white"
                        : "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100"
                    }`}
                  >
                    Não Localizadas ({stats.naoEncontradas})
                  </button>
                </div>

                {/* Campo de Busca */}
                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou CPF..."
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

              {/* Botões de Ação em Lote na Tabela */}
              <div className="flex items-center justify-between py-1 px-1 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Seleção Rápida:</span>
                  <button
                    type="button"
                    onClick={handleSelectAllRemetidas}
                    className="text-amber-700 dark:text-amber-400 hover:underline font-bold cursor-pointer"
                  >
                    Marcar Remetidas ({stats.remetidas})
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSelectAllFound}
                    className="text-emerald-700 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
                  >
                    Marcar Todas Localizadas
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    Desmarcar Todas
                  </button>
                </div>

                <div className="font-bold text-emerald-700 dark:text-emerald-400">
                  {stats.selecionadas} selecionada(s) para alteração
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
                            checked={stats.selecionadas > 0 && stats.selecionadas === (stats.remetidas + stats.pendentes)}
                            onChange={(e) => {
                              if (e.target.checked) handleSelectAllRemetidas();
                              else handleDeselectAll();
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 font-bold">Dados da Planilha Excel</th>
                        <th className="p-3 font-bold">Correspondência no Sistema Geral</th>
                        <th className="p-3 font-bold">Mudança de Situação</th>
                        <th className="p-3 font-bold">Alocação Prevista</th>
                        <th className="p-3 font-bold text-center">Tipo de Match</th>
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
                          const willChange = item.selected && isMatched && currentSituacao !== "Recebida";

                          return (
                            <tr
                              key={item.id}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                item.selected
                                  ? "bg-emerald-50/40 dark:bg-emerald-950/20"
                                  : ""
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!isMatched}
                                  checked={item.selected}
                                  onChange={() => toggleItemSelection(item.id)}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </td>

                              {/* Dados da Planilha */}
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {item.extracted.nome}
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                  {item.extracted.pa && (
                                    <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded font-mono font-bold text-[10px] border border-emerald-200 dark:border-emerald-800">
                                      PA: {item.extracted.pa}
                                    </span>
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

                              {/* Correspondência no Sistema Geral */}
                              <td className="p-3">
                                {isMatched ? (
                                  <div>
                                    <div className="flex items-center gap-1.5">
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
                                          PA: {item.cnhMatched!.pa}
                                        </span>
                                      )}
                                      <span>CPF: {item.cnhMatched!.cpf || "-"}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">
                                    Não localizado na base geral
                                  </span>
                                )}
                              </td>

                              {/* Situação e Mudança */}
                              <td className="p-3">
                                {isMatched ? (
                                  willChange ? (
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
                                        Recebida
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
                                      {currentSituacao} (Manter)
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[10px] text-slate-400">-</span>
                                )}
                              </td>

                              {/* Alocação Prevista */}
                              <td className="p-3">
                                {item.suggestedGaveta ? (
                                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 rounded text-[11px]">
                                    {item.suggestedGaveta} {item.suggestedReparticao}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Tipo de Match */}
                              <td className="p-3 text-center">
                                {item.matchType === "exact_pa" && (
                                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> PA Exato (100%)
                                  </span>
                                )}
                                {item.matchType === "exact_cpf" && (
                                  <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 text-[10px] font-extrabold rounded-full inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> CPF Exato
                                  </span>
                                )}
                                {item.matchType === "exact_name" && (
                                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 text-[10px] font-bold rounded-full inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Nome Exato
                                  </span>
                                )}
                                {item.matchType === "similar_name" && (
                                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">
                                    Similar ({item.matchScore}%)
                                  </span>
                                )}
                                {item.matchType === "none" && (
                                  <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 text-[10px] font-semibold rounded-full">
                                    Não Encontrado
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Trocar Planilha / Novo Arquivo</span>
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
                    disabled={isSaving || stats.selecionadas === 0}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 transition-all cursor-pointer w-full sm:w-auto"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Salvando Atualizações...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirmar e Mudar para RECEBIDA ({stats.selecionadas} CNHs)</span>
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
