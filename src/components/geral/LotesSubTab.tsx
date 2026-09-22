import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Layers,
  Plus,
  Search,
  FileSpreadsheet,
  Printer,
  FileText,
  Upload,
  Download,
  Eye,
  Edit2,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  FileCheck,
  Hash,
  ArrowUpDown,
  Filter,
  Package
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Lote, LoteInput } from "../../types";
import { getLotes, createLote, updateLote, deleteLote } from "../../services/db";
import { getOrgaoConfig, addPDFHeaderLogo } from "../../services/orgaoService";
import { resolveLotePdfUrl } from "../../services/lotesStorageService";
import { useAuth } from "../../context/AuthContext";
import { LoteModal } from "./LoteModal";
import { LotePdfViewerModal } from "./LotePdfViewerModal";
import { LotesImportModal } from "./LotesImportModal";

export const LotesSubTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.permissoes?.includes("cnh:receber") || user?.permissoes?.includes("cnh:editar") || true;

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("todos");
  const [sortField, setSortField] = useState<"numero" | "data_recebimento" | "documentos_impressos">("numero");
  const [sortAsc, setSortAsc] = useState(false);

  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [loteToEdit, setLoteToEdit] = useState<Lote | null>(null);
  const [pdfViewerLote, setPdfViewerLote] = useState<Lote | null>(null);
  const [loteToDelete, setLoteToDelete] = useState<Lote | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Upload rápido de PDF por linha
  const [uploadingLoteId, setUploadingLoteId] = useState<string | null>(null);
  const fileInputRowRef = useRef<HTMLInputElement>(null);
  const [targetLoteForUpload, setTargetLoteForUpload] = useState<Lote | null>(null);

  // Notificação toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const loadData = async (silent = false) => {
    try {
      if (!silent && lotes.length === 0) setLoading(true);
      const data = await getLotes();
      setLotes(data);
    } catch (err) {
      console.error("Erro ao carregar lotes:", err);
      if (!silent) showToast("Erro ao carregar lista de lotes", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = (e: any) => {
      if (!e.detail?.type || e.detail.type === "all" || e.detail.type === "lotes") {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          loadData(true);
        }, 400);
      }
    };

    window.addEventListener("detran_sync_updated", handleSync);
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      window.removeEventListener("detran_sync_updated", handleSync);
    };
  }, []);

  // Formatação segura de datas sem fuso horário
  const formatDataRecebimento = (str?: string) => {
    if (!str) return "-";
    if (str.includes("-")) {
      const [y, m, d] = str.split("T")[0].split("-");
      if (y && m && d) return `${d}/${m}/${y}`;
    }
    return str;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Anos disponíveis para filtro
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    lotes.forEach((l) => {
      if (l.data_recebimento) {
        const y = l.data_recebimento.split("-")[0];
        if (y) years.add(y);
      }
    });
    return Array.from(years).sort().reverse();
  }, [lotes]);

  // Filtragem e ordenação
  const filteredLotes = useMemo(() => {
    let result = [...lotes];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter((l) => {
        const numMatch = String(l.numero).includes(term);
        const dataMatch = formatDataRecebimento(l.data_recebimento).includes(term) || l.data_recebimento.includes(term);
        const docMatch = String(l.documentos_impressos).includes(term);
        const obsMatch = l.observacao?.toLowerCase().includes(term);
        const pdfMatch = l.pdf_nome?.toLowerCase().includes(term);
        return numMatch || dataMatch || docMatch || obsMatch || pdfMatch;
      });
    }

    if (selectedYear !== "todos") {
      result = result.filter((l) => l.data_recebimento && l.data_recebimento.startsWith(selectedYear));
    }

    result.sort((a, b) => {
      if (sortField === "numero") {
        return sortAsc ? a.numero - b.numero : b.numero - a.numero;
      }
      if (sortField === "documentos_impressos") {
        return sortAsc ? a.documentos_impressos - b.documentos_impressos : b.documentos_impressos - a.documentos_impressos;
      }
      if (sortField === "data_recebimento") {
        const dateA = new Date(a.data_recebimento).getTime();
        const dateB = new Date(b.data_recebimento).getTime();
        return sortAsc ? dateA - dateB : dateB - dateA;
      }
      return 0;
    });

    return result;
  }, [lotes, searchTerm, selectedYear, sortField, sortAsc]);

  // Métricas
  const totalLotes = lotes.length;
  const totalDocumentos = useMemo(() => {
    return lotes.reduce((acc, l) => acc + (Number(l.documentos_impressos) || 0), 0);
  }, [lotes]);
  const lotesComPdf = useMemo(() => {
    return lotes.filter((l) => !!l.pdf_url).length;
  }, [lotes]);
  const mediaPorLote = totalLotes > 0 ? (totalDocumentos / totalLotes).toFixed(1) : "0";

  // Ações de CRUD
  const handleOpenCreate = () => {
    setLoteToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (lote: Lote) => {
    setLoteToEdit(lote);
    setIsModalOpen(true);
  };

  const handleSaveLote = async (data: LoteInput) => {
    const userId = user?.id || "operador";
    const userNome = user?.nome_curto || user?.nome || "Operador";

    try {
      if (loteToEdit) {
        await updateLote(loteToEdit.id, data, userId, userNome);
        showToast(`Lote #${data.numero} atualizado com sucesso!`);
      } else {
        await createLote(data, userId, userNome);
        showToast(`Lote #${data.numero} cadastrado com sucesso!`);
      }
      await loadData();
    } catch (err: any) {
      console.error("Erro ao salvar lote:", err);
      showToast(err?.message || "Erro ao salvar o lote no banco de dados.", "error");
      throw err;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!loteToDelete) return;
    setIsDeleting(true);
    try {
      const userId = user?.id || "operador";
      const userNome = user?.nome_curto || user?.nome || "Operador";
      await deleteLote(loteToDelete.id, userId, userNome);
      showToast(`Lote #${loteToDelete.numero} excluído.`);
      setLoteToDelete(null);
      await loadData();
    } catch (err: any) {
      showToast(err?.message || "Erro ao excluir lote", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Upload rápido de PDF por linha
  const handleTriggerRowUpload = (lote: Lote) => {
    setTargetLoteForUpload(lote);
    if (fileInputRowRef.current) {
      fileInputRowRef.current.value = "";
      fileInputRowRef.current.click();
    }
  };

  const handleRowFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetLoteForUpload) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Selecione um arquivo válido no formato PDF (.pdf)", "error");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast("O arquivo PDF selecionado ultrapassa o limite de 15 MB", "error");
      return;
    }

    setUploadingLoteId(targetLoteForUpload.id);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result as string;
        const userId = user?.id || "operador";
        const userNome = user?.nome_curto || user?.nome || "Operador";

        const updated = await updateLote(
          targetLoteForUpload.id,
          {
            pdf_nome: file.name,
            pdf_tamanho: file.size,
            pdf_url: result
          },
          userId,
          userNome
        );

        showToast(`PDF anexado com sucesso ao Lote #${targetLoteForUpload.numero}!`);
        // Atualiza diretamente no estado local para resposta instantânea e ZERO piscadeira
        setLotes((prev) => prev.map((l) => (l.id === targetLoteForUpload.id ? updated : l)));
      } catch (err: any) {
        showToast(err?.message || "Erro ao anexar arquivo PDF", "error");
      } finally {
        setUploadingLoteId(null);
        setTargetLoteForUpload(null);
      }
    };
    reader.onerror = () => {
      showToast("Erro na leitura do arquivo PDF", "error");
      setUploadingLoteId(null);
      setTargetLoteForUpload(null);
    };
    reader.readAsDataURL(file);
  };

  // Download do PDF
  const handleDownloadPdf = async (lote: Lote) => {
    let activeUrl = lote.pdf_url;
    if (!activeUrl) {
      activeUrl = await resolveLotePdfUrl(lote);
    }
    if (!activeUrl) {
      showToast("Nenhum arquivo PDF encontrado para este lote.", "error");
      return;
    }
    try {
      showToast(`Iniciando download do PDF do Lote #${lote.numero}...`);
      if (activeUrl.startsWith("http")) {
        const response = await fetch(activeUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = lote.pdf_nome || `Lote_${lote.numero}_CNHs.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        const a = document.createElement("a");
        a.href = activeUrl;
        a.download = lote.pdf_nome || `Lote_${lote.numero}_CNHs.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      const a = document.createElement("a");
      a.href = activeUrl;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = lote.pdf_nome || `Lote_${lote.numero}_CNHs.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Exportar Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredLotes.length === 0) {
      showToast("Nenhum lote disponível para exportação", "error");
      return;
    }

    const dataToExport = filteredLotes.map((l, index) => ({
      "Item": index + 1,
      "Lote": l.numero,
      "Data de Recebimento": formatDataRecebimento(l.data_recebimento),
      "Documentos Impressos": l.documentos_impressos,
      "Possui PDF": l.pdf_url ? "Sim" : "Não",
      "Nome do Arquivo PDF": l.pdf_nome || "-",
      "Observações": l.observacao || "-",
      "Registrado por": l.usuario_nome || "-",
      "Data Cadastro": l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : "-"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lotes");
    XLSX.writeFile(wb, `Lotes_Protocolo_Geral_${new Date().toISOString().split("T")[0]}.xlsx`);
    showToast("Planilha de lotes exportada com sucesso!");
  };

  // Imprimir Relatório (PDF)
  const handlePrintReport = async () => {
    if (filteredLotes.length === 0) {
      showToast("Nenhum lote para impressão", "error");
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const orgaoConfig = getOrgaoConfig();
    addPDFHeaderLogo(doc, 14, 8, 18, 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("RELATÓRIO DE CONTROLE DE LOTES - PROTOCOLO GERAL", 105, 36, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • Total de Lotes: ${filteredLotes.length} • Total Documentos: ${filteredLotes.reduce((acc, l) => acc + (l.documentos_impressos || 0), 0)}`,
      105,
      42,
      { align: "center" }
    );

    const tableBody = filteredLotes.map((l, idx) => [
      String(idx + 1).padStart(2, "0"),
      `Lote ${l.numero}`,
      formatDataRecebimento(l.data_recebimento),
      String(l.documentos_impressos),
      l.pdf_nome ? `Sim (${l.pdf_nome})` : "Não",
      l.observacao || "-"
    ]);

    autoTable(doc, {
      startY: 47,
      head: [["Item", "Lote", "Data de Recebimento", "Docs Impressos", "Arquivo PDF", "Observação"]],
      body: tableBody,
      theme: "striped",
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: "bold"
      },
      columnStyles: {
        0: { cellWidth: 14, halign: "center" },
        1: { cellWidth: 26, fontStyle: "bold" },
        2: { cellWidth: 32, halign: "center" },
        3: { cellWidth: 28, halign: "center", fontStyle: "bold" },
        4: { cellWidth: 45 },
        5: { cellWidth: "auto" }
      }
    });

    doc.save(`Relatorio_Lotes_${new Date().toISOString().split("T")[0]}.pdf`);
    showToast("Relatório de lotes gerado em PDF!");
  };

  const toggleSort = (field: "numero" | "data_recebimento" | "documentos_impressos") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // Mais novos/maiores primeiro
    }
  };

  return (
    <div className="space-y-6">
      {/* Input oculto para upload rápido na linha da tabela */}
      <input
        type="file"
        ref={fileInputRowRef}
        accept="application/pdf,.pdf"
        onChange={handleRowFileSelected}
        className="hidden"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold animate-slideUp ${
            toastMessage.type === "success"
              ? "bg-emerald-600 text-white shadow-emerald-600/20"
              : "bg-rose-600 text-white shadow-rose-600/20"
          }`}
        >
          {toastMessage.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Métricas do Topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total de Lotes */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900/50">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total de Lotes</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{totalLotes}</p>
          </div>
        </div>

        {/* Total de Documentos Impressos */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Documentos Impressos</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{totalDocumentos}</p>
          </div>
        </div>

        {/* Lotes com PDF */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Com Comprovante PDF</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 font-mono">
              {lotesComPdf} <span className="text-xs font-normal text-slate-400">/ {totalLotes}</span>
            </p>
          </div>
        </div>

        {/* Média por Lote */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 rounded-xl border border-amber-100 dark:border-amber-900/50">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Média Docs / Lote</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">{mediaPorLote}</p>
          </div>
        </div>
      </div>

      {/* Barra de Ações e Filtros */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Campo de Busca e Filtro de Ano */}
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por lote, data, observação..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {availableYears.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer"
              >
                <option value="todos">Todos os anos</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            title="Atualizar lista de lotes"
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>

          <button
            onClick={handleExportExcel}
            title="Exportar dados para Excel (.xlsx)"
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-semibold rounded-xl text-xs transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={handlePrintReport}
            title="Gerar relatório de lotes em PDF"
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900 text-purple-800 dark:text-purple-200 font-semibold rounded-xl text-xs transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
          >
            <Printer className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="hidden sm:inline">Imprimir PDF</span>
          </button>

          {canEdit && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              title="Importar e auditar lotes a partir de planilha Excel (.xlsx)"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 text-xs transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Importar Planilha XLSX</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Lote</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Lotes */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th 
                  onClick={() => toggleSort("numero")}
                  className="py-3.5 px-4 cursor-pointer hover:text-blue-600 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Lote (número)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort("data_recebimento")}
                  className="py-3.5 px-4 cursor-pointer hover:text-blue-600 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Data de Recebimento</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort("documentos_impressos")}
                  className="py-3.5 px-4 cursor-pointer hover:text-blue-600 select-none text-center"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Documentos Impressos (número)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4">
                  <span>Arquivo PDF</span>
                </th>
                <th className="py-3.5 px-4">
                  <span>Observações / Operador</span>
                </th>
                <th className="py-3.5 px-4 text-right">
                  <span>Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading && lotes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <span>Carregando lotes do sistema...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLotes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="font-semibold text-slate-600 dark:text-slate-300">Nenhum lote encontrado</p>
                      <p className="text-xs text-slate-400">
                        {searchTerm ? "Nenhum resultado corresponde aos filtros aplicados." : "Cadastre o primeiro lote clicando no botão '+ Novo Lote'."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLotes.map((lote) => {
                  const isUploadingThis = uploadingLoteId === lote.id;

                  return (
                    <tr 
                      key={lote.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Lote (número) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80">
                            #{lote.numero}
                          </span>
                        </div>
                      </td>

                      {/* Data de Recebimento */}
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDataRecebimento(lote.data_recebimento)}</span>
                        </div>
                      </td>

                      {/* Documentos Impressos (número) */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>{lote.documentos_impressos}</span>
                        </span>
                      </td>

                      {/* Arquivo PDF */}
                      <td className="py-3.5 px-4">
                        {lote.pdf_url ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setPdfViewerLote(lote)}
                              title="Visualizar documento PDF"
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:hover:bg-red-900/60 dark:text-red-300 border border-red-200 dark:border-red-800 transition-colors cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span className="max-w-[140px] truncate">{lote.pdf_nome || "Comprovante.pdf"}</span>
                            </button>

                            <button
                              onClick={() => handleDownloadPdf(lote)}
                              title="Baixar arquivo PDF"
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleTriggerRowUpload(lote)}
                            disabled={isUploadingThis}
                            title="Subir arquivo PDF para este lote"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            {isUploadingThis ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                                <span>Subindo...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-3 h-3 text-slate-400" />
                                <span>Subir PDF</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Observações / Operador */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-[200px]">
                        <p className="truncate text-xs text-slate-800 dark:text-slate-200" title={lote.observacao || ""}>
                          {lote.observacao || "-"}
                        </p>
                        {lote.usuario_nome && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            Por: {lote.usuario_nome}
                          </p>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {lote.pdf_url && (
                            <button
                              onClick={() => setPdfViewerLote(lote)}
                              title="Visualizar PDF"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}

                          {canEdit && (
                            <>
                              <button
                                onClick={() => handleTriggerRowUpload(lote)}
                                title={lote.pdf_url ? "Trocar PDF" : "Subir PDF"}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Upload className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleOpenEdit(lote)}
                                title="Editar Lote"
                                className="p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => setLoteToDelete(lote)}
                                title="Excluir Lote"
                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da tabela */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <span>
            Exibindo <strong>{filteredLotes.length}</strong> de <strong>{lotes.length}</strong> lotes cadastrados
          </span>
          <div className="flex items-center gap-4">
            <span>
              Docs filtrados: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{filteredLotes.reduce((acc, l) => acc + (l.documentos_impressos || 0), 0)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Modal de Cadastro / Edição */}
      <LoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLote}
        loteToEdit={loteToEdit}
      />

      {/* Modal de Importação e Auditoria via Planilha Excel */}
      <LotesImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingLotes={lotes}
        onSuccess={(insertedCount, updatedCount, totalDocs) => {
          loadData();
          showToast(
            `Importação concluída! ${insertedCount} novo(s) lote(s) cadastrado(s)${
              updatedCount > 0 ? `, ${updatedCount} atualizado(s)` : ""
            } (${totalDocs} documentos).`,
            "success"
          );
        }}
      />

      {/* Modal de Visualização de PDF */}
      <LotePdfViewerModal
        isOpen={!!pdfViewerLote}
        onClose={() => setPdfViewerLote(null)}
        lote={pdfViewerLote}
      />

      {/* Modal de Confirmação de Exclusão */}
      {loteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div 
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Excluir Lote #{loteToDelete.numero}?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Data: {formatDataRecebimento(loteToDelete.data_recebimento)} • Docs: {loteToDelete.documentos_impressos}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-6">
              Esta ação removerá permanentemente o registro deste lote do sistema{loteToDelete.pdf_url ? " e o arquivo PDF associado" : ""}. Tem certeza que deseja prosseguir?
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setLoteToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sim, Excluir Lote</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
