import React, { useState, useRef, useMemo } from "react";
import {
  X,
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FileSearch,
  Check
} from "lucide-react";
import { GeralCNH, Usuario } from "../types";
import {
  scanCnhDocumentOcr,
  matchExtractedWithGeralCNHs,
  OcrMatchResult,
  OcrCategory,
} from "../services/ocrService";
import { receberCNHsBulk } from "../services/db";

interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  geralList: GeralCNH[];
  currentUser: Usuario | null;
  onSuccess: (updatedCount: number, totalExtracted: number) => void;
}

export const OcrScannerModal: React.FC<OcrScannerModalProps> = ({
  isOpen,
  onClose,
  geralList,
  currentUser,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<OcrMatchResult[] | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contadores para os filtros e cartões
  const stats = useMemo(() => {
    if (!results) return { total: 0, remetidas: 0, pendentes: 0, jaRecebidas: 0, jaEntregues: 0, naoEncontradas: 0, selecionadas: 0 };
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
      // Filtro de categoria
      if (filterCategory === "ready_to_receive" && item.category !== "ready_to_receive") return false;
      if (filterCategory === "pending" && item.category !== "pending") return false;
      if (filterCategory === "already_received" && item.category !== "already_received" && item.category !== "already_delivered") return false;
      if (filterCategory === "not_found" && item.category !== "not_found") return false;
      if (filterCategory === "selected" && !item.selected) return false;

      // Filtro de busca por texto
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const nomeOcr = (item.extracted.nome || "").toLowerCase();
        const cpfOcr = (item.extracted.cpf || "").toLowerCase();
        const nomeGeral = (item.cnhMatched?.nome || "").toLowerCase();
        const cpfGeral = (item.cnhMatched?.cpf || "").toLowerCase();
        const remessa = (item.extracted.remessa || "").toLowerCase();
        const ordem = item.cnhMatched?.ordem ? `#${item.cnhMatched.ordem}` : "";

        return (
          nomeOcr.includes(query) ||
          cpfOcr.includes(query) ||
          nomeGeral.includes(query) ||
          cpfGeral.includes(query) ||
          remessa.includes(query) ||
          ordem.includes(query)
        );
      }

      return true;
    });
  }, [results, filterCategory, searchTerm]);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    const validTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/bmp",
      "image/heic",
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|jpe?g|png|webp|bmp|heic)$/i)) {
      setErrorMessage("Por favor, selecione um arquivo no formato PDF ou Imagem (JPG, PNG, WEBP).");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage("O arquivo é muito grande. O tamanho máximo permitido é de 25 MB.");
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
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

  const handleStartOcr = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingStep("Lendo arquivo e preparando dados...");

    try {
      // 1. Converter arquivo para base64
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      setProcessingStep("Processando documento com IA...");
      const mimeType = selectedFile.type || (selectedFile.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

      const response = await scanCnhDocumentOcr(fileData, mimeType, selectedFile.name);

      if (!response.items || response.items.length === 0) {
        setErrorMessage("Nenhum nome de condutor ou CNH foi identificado no documento. Verifique se o arquivo está legível e tente novamente.");
        setIsProcessing(false);
        return;
      }

      setProcessingStep("Cruzando nomes e CPFs com a base geral de CNHs...");
      const matchResults = await matchExtractedWithGeralCNHs(response.items, geralList);

      setResults(matchResults);
    } catch (err: any) {
      console.error("Erro ao processar OCR:", err);
      setErrorMessage(err.message || "Ocorreu um erro durante o escaneamento OCR. Verifique sua conexão e tente novamente.");
    } finally {
      setIsProcessing(false);
      setProcessingStep("");
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setResults(null);
    setErrorMessage(null);
    setFilterCategory("all");
    setSearchTerm("");
  };

  // Alternar seleção de um item individual
  const toggleItemSelection = (id: string) => {
    if (!results) return;
    setResults((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)) : null
    );
  };

  // Selecionar todos que estão prontos para receber (Remetidas)
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

  // Selecionar todas as correspondências encontradas
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

  // Desmarcar todos
  const handleDeselectAll = () => {
    if (!results) return;
    setResults((prev) =>
      prev ? prev.map((r) => ({ ...r, selected: false })) : null
    );
  };

  // Confirmação de recebimento em massa
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
        observacaoExtra: `OCR: ${selectedFile?.name || "Lista escaneada"}${r.extracted.remessa ? ` (Remessa ${r.extracted.remessa})` : ""}`,
      }));

      const userId = currentUser?.id || "sistema-ocr";
      const userNome = currentUser?.nome_curto || currentUser?.nome || "Agente DETRAN";

      const res = await receberCNHsBulk(itemsPayload, userId, userNome);

      onSuccess(res.updatedCount, results.length);
      onClose();
    } catch (err: any) {
      console.error("Erro ao salvar recebimento em lote:", err);
      setErrorMessage(err.message || "Erro ao atualizar a situação das CNHs para Recebida.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-fadeIn">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 rounded-xl">
              <FileSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Escaneamento OCR de Lista de CNHs Recebidas</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-200 dark:border-indigo-800">
                  IA Gemini
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Faça upload do documento (PDF ou Imagem) para reconhecer a relação de CNHs e mudar o status de <strong className="text-amber-600 dark:text-amber-400">REMETIDA</strong> para <strong className="text-blue-600 dark:text-blue-400">RECEBIDA</strong> automaticamente.
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
          
          {/* FASE 1: UPLOAD DO ARQUIVO (Quando ainda não escaneou) */}
          {!results && !isProcessing && (
            <div className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30"
                    : selectedFile
                    ? "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20"
                    : "border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-800/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/bmp"
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
                      {selectedFile.type.startsWith("image/") ? (
                        <ImageIcon className="w-8 h-8" />
                      ) : (
                        <FileText className="w-8 h-8" />
                      )}
                    </div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Clique ou arraste para trocar o arquivo
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        Clique para selecionar ou arraste o arquivo aqui
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Formatos aceitos: <strong>PDF</strong> ou Imagens (<strong>JPG, PNG, WEBP</strong>). Tamanho máximo: 25 MB.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Dicas de digitalização */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Como funciona a conferência automática:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-500 dark:text-slate-400">
                  <li>O modelo de visão e OCR do Google Gemini fará a leitura integral de todos os nomes e CPFs listados no documento.</li>
                  <li>O sistema cruzará os dados detectados com as CNHs cadastradas na tabela geral do protocolo.</li>
                  <li>As CNHs com situação <strong>"Remetida"</strong> serão pré-selecionadas para alteração de status para <strong>"Recebida"</strong>, calculando gaveta e repartição automaticamente.</li>
                </ul>
              </div>

              {/* Botão de Iniciar */}
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
                  onClick={handleStartOcr}
                  disabled={!selectedFile}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Escanear Documento com IA</span>
                </button>
              </div>
            </div>
          )}

          {/* FASE 2: PROCESSANDO OCR */}
          {isProcessing && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4 animate-fadeIn">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 dark:border-indigo-950 border-t-indigo-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Escaneando e Analisando Documento...
                </h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                  {processingStep || "Extraindo nomes e conferindo correspondências..."}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 max-w-sm">
                  Isso pode levar alguns segundos dependendo da quantidade de nomes e páginas do arquivo.
                </p>
              </div>
            </div>
          )}

          {/* FASE 3: RESULTADOS E CONFERÊNCIA DAS CORRESPONDÊNCIAS */}
          {results && !isProcessing && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Cartões de Estatísticas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Extraído</div>
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
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
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

                <div className="font-bold text-indigo-600 dark:text-indigo-400">
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
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 font-bold">Dados Lidos pelo OCR</th>
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
                                  ? "bg-indigo-50/40 dark:bg-indigo-950/20"
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
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </td>

                              {/* Dados Extraídos do Documento */}
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {item.extracted.nome}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
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
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                      CPF: {item.cnhMatched!.cpf || "-"}
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
                                {item.matchType === "exact_cpf" && (
                                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full inline-flex items-center gap-1">
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
                    <span>Trocar Arquivo / Novo Scan</span>
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
