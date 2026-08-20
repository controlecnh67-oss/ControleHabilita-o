import React, { useState, useEffect, useMemo } from "react";
import {
  History,
  Search,
  ArrowRight,
  Lock,
  User,
  Clock,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  TrendingUp,
  Inbox,
  Send,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  ShieldCheck,
  Download,
  Printer
} from "lucide-react";
import { HistoricoMovimentacao, Responsavel } from "../types";
import { getHistoricoList, getResponsaveis } from "../services/db";
import { subscribeToSupabaseRealtime } from "../services/supabase";
import { Badge } from "../components/ui/Badge";
import { formatDateTime, formatCPF, normalizeSearch, matchDigitsSafe } from "../lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrgaoConfig, addPDFHeaderLogo } from "../services/orgaoService";

type PeriodoPreset = "todos" | "hoje" | "7dias" | "30dias" | "mes_atual";

export const HistoricoPage: React.FC = () => {
  const [historico, setHistorico] = useState<HistoricoMovimentacao[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<string>("todas");
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("todos");

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchDados = async () => {
    setLoading(true);
    try {
      const [data, dataResp] = await Promise.all([getHistoricoList(), getResponsaveis()]);
      setHistorico(data);
      setResponsaveis(dataResp);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();

    const unsubRealtimeHist = subscribeToSupabaseRealtime("historico_movimentacoes", () => {
      console.log("⚡ [Realtime Histórico] Atualização detectada em historico_movimentacoes");
      fetchDados();
    });

    const unsubRealtimeGeral = subscribeToSupabaseRealtime("geral_cnhs", () => {
      console.log("⚡ [Realtime Histórico] Atualização detectada em geral_cnhs");
      fetchDados();
    });

    const handleSync = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (!customEvt.detail || customEvt.detail.type === "all" || customEvt.detail.type === "historico" || customEvt.detail.type === "geral") {
        fetchDados();
      }
    };

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchDados();
      }
    };

    // Polling suave a cada 15 segundos se a aba estiver visível
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchDados();
      }
    }, 15000);

    window.addEventListener("detran_sync_updated", handleSync);
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      unsubRealtimeHist();
      unsubRealtimeGeral();
      clearInterval(intervalId);
      window.removeEventListener("detran_sync_updated", handleSync);
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  const getRespName = (nome?: string, id?: string) => {
    if (!nome && !id) return "-";
    if (nome) {
      const matchById = responsaveis.find((r) => r.id === nome);
      if (matchById) return matchById.nome;
      const matchByName = responsaveis.find((r) => r.nome.trim().toLowerCase() === nome.trim().toLowerCase());
      if (matchByName) return matchByName.nome;
    }
    if (id) {
      const matchById = responsaveis.find((r) => r.id === id);
      if (matchById) return matchById.nome;
    }
    return nome && nome !== "-" ? nome : "-";
  };

  // Filtragem
  const filtered = useMemo(() => {
    const normSearch = normalizeSearch(searchTerm);
    const searchDigits = searchTerm.replace(/\D/g, "");

    const now = new Date();
    const hojeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const seteDiasAgo = hojeStart - 7 * 86400000;
    const trintaDiasAgo = hojeStart - 30 * 86400000;
    const mesAtualStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return historico.filter((h) => {
      // Filtro por texto
      let matchSearch = true;
      if (normSearch) {
        const matchNome = h.geral_nome ? normalizeSearch(h.geral_nome).includes(normSearch) : false;
        const matchOrdem = h.geral_ordem !== undefined && h.geral_ordem !== null
          ? h.geral_ordem.toString().includes(searchDigits || normSearch)
          : false;
        const matchCpf = h.geral_cpf ? matchDigitsSafe(h.geral_cpf, searchTerm) : false;
        const matchUsuario = h.usuario_nome ? normalizeSearch(h.usuario_nome).includes(normSearch) : false;
        const matchResp = h.responsavel_nome ? normalizeSearch(h.responsavel_nome).includes(normSearch) : false;
        const matchObs = h.observacao ? normalizeSearch(h.observacao).includes(normSearch) : false;

        matchSearch = matchNome || matchOrdem || matchCpf || matchUsuario || matchResp || matchObs;
      }

      // Filtro por situação
      const matchSituacao = filtroSituacao === "todas" || h.situacao_nova === filtroSituacao;

      // Filtro por período
      let matchPeriodo = true;
      if (periodoPreset !== "todos" && h.data_hora) {
        const itemTime = new Date(h.data_hora).getTime();
        if (!isNaN(itemTime)) {
          if (periodoPreset === "hoje") matchPeriodo = itemTime >= hojeStart;
          else if (periodoPreset === "7dias") matchPeriodo = itemTime >= seteDiasAgo;
          else if (periodoPreset === "30dias") matchPeriodo = itemTime >= trintaDiasAgo;
          else if (periodoPreset === "mes_atual") matchPeriodo = itemTime >= mesAtualStart;
        }
      }

      return matchSearch && matchSituacao && matchPeriodo;
    });
  }, [historico, searchTerm, filtroSituacao, periodoPreset]);

  // Estatísticas calculadas
  const stats = useMemo(() => {
    const total = filtered.length;
    let recebidas = 0;
    let entregues = 0;
    let remetidas = 0;

    filtered.forEach((item) => {
      if (item.situacao_nova === "Recebida") recebidas++;
      else if (item.situacao_nova === "Entregue") entregues++;
      else if (item.situacao_nova === "Remetida") remetidas++;
    });

    return { total, recebidas, entregues, remetidas };
  }, [filtered]);

  // Resetar paginação ao alterar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filtroSituacao, periodoPreset, pageSize]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedLogs = filtered.slice(startIndex, startIndex + pageSize);

  // Exportar Excel
  const handleExportExcel = () => {
    const dataToExport = filtered.map((h, idx) => ({
      "#": idx + 1,
      "Data e Hora": formatDateTime(h.data_hora),
      "Ordem CNH": h.geral_ordem ? `#${h.geral_ordem}` : "-",
      "Titular CNH": h.geral_nome || "-",
      "CPF": h.geral_cpf ? formatCPF(h.geral_cpf) : "-",
      "Situação Anterior": h.situacao_anterior || "Inclusão",
      "Nova Situação": h.situacao_nova,
      "Responsável (Retirada)": getRespName(h.responsavel_nome, h.responsavel_id),
      "Operador DETRAN": h.usuario_nome || "-",
      "Observações": h.observacao || "-"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Histórico Movimentação");
    XLSX.writeFile(wb, `Historico_Movimentacao_DETRAN_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Exportar PDF Completo (Filtrados)
  const handleExportPDF = () => {
    const cfg = getOrgaoConfig();
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rightMarginX = pageWidth - 14;

    const tableData = filtered.map((h, index) => [
      `${index + 1}`,
      formatDateTime(h.data_hora),
      h.geral_ordem !== undefined && h.geral_ordem !== null ? `#${h.geral_ordem}` : "-",
      h.geral_nome || "-",
      h.geral_cpf ? formatCPF(h.geral_cpf) : "-",
      h.situacao_anterior ? `${h.situacao_anterior} → ${h.situacao_nova}` : `Inclusão: ${h.situacao_nova}`,
      getRespName(h.responsavel_nome, h.responsavel_id),
      h.usuario_nome || "-",
      h.observacao || "-"
    ]);

    autoTable(doc, {
      startY: 28,
      head: [["#", "Data/Hora", "Ordem", "Titular CNH", "CPF", "Movimentação Status", "Responsável Retirada", "Operador", "Observação"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 28 },
        2: { cellWidth: 18, halign: "center", fontStyle: "bold" },
        3: { cellWidth: 50 },
        4: { cellWidth: 28, halign: "center" },
        5: { cellWidth: 35 },
        6: { cellWidth: 35 },
        7: { cellWidth: 28 },
        8: { cellWidth: "auto" }
      },
      didDrawPage: () => {
        const hasLogo = addPDFHeaderLogo(doc, 14, 5, 14, 14);
        const startTextX = hasLogo ? 32 : 14;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`${cfg.sigla || "AGÊNCIA ITAITUBA"} — Relatório Oficial do Histórico Inalterável de Movimentações`, startTextX, 11);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        doc.text(`Protocolo Geral de CNHs — Total de Registros Emitidos: ${filtered.length} | Filtro: ${filtroSituacao.toUpperCase()}`, startTextX, 16);

        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, rightMarginX, 11, { align: "right" });

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(14, 21, rightMarginX, 21);
      }
    });

    const totalPagesCount = doc.getNumberOfPages();
    for (let i = 1; i <= totalPagesCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sistema DETRAN-PROT — Registro Permanente e Auditável de Movimentação de CNH", 14, pageHeight - 6);
      doc.text(`Página ${i} de ${totalPagesCount}`, rightMarginX, pageHeight - 6, { align: "right" });
    }

    doc.save(`Historico_Movimentacao_DETRAN_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Exportar Comprovante Individual em PDF
  const handleExportSingleItemPDF = (item: HistoricoMovimentacao) => {
    const cfg = getOrgaoConfig();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rightMarginX = pageWidth - 14;

    const hasLogo = addPDFHeaderLogo(doc, 14, 10, 20, 20);
    const startTextX = hasLogo ? 38 : 14;

    // Cabeçalho Institucional
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(cfg.orgao || "AGÊNCIA DE ITAITUBA", startTextX, 15);

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`${cfg.secretaria || "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA"} • ${cfg.sigla || "AGÊNCIA ITAITUBA"}`, startTextX, 20);
    doc.text(`Setor de Habilitação e Protocolo de CNHs • ${cfg.cidade_uf || "Itaituba - PA"}`, startTextX, 25);

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(14, 33, rightMarginX, 33);

    // Título do Documento
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 58, 138);
    doc.text("COMPROVANTE OFICIAL DE MOVIMENTAÇÃO DE CNH", pageWidth / 2, 42, { align: "center" });

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Identificador do Registro: #${item.id} • Autenticação de Auditoria`, pageWidth / 2, 47, { align: "center" });

    // Tabela com os Detalhes da CNH e da Movimentação
    const dados = [
      ["Número de Ordem da CNH", item.geral_ordem !== undefined && item.geral_ordem !== null ? `#${item.geral_ordem}` : "Não informado"],
      ["Nome do Titular", item.geral_nome || "Não informado"],
      ["CPF do Titular", item.geral_cpf ? formatCPF(item.geral_cpf) : "Não informado"],
      ["Situação Anterior", item.situacao_anterior || "Inclusão no Sistema"],
      ["Nova Situação (Status)", item.situacao_nova || "Recebida"],
      ["Data e Hora do Registro", formatDateTime(item.data_hora)],
      ["Responsável / Retirante", getRespName(item.responsavel_nome, item.responsavel_id)],
      ["Operador DETRAN Responsável", item.usuario_nome || "Sistema"],
      ["Observações e Justificativa", item.observacao || "Nenhuma observação registrada"]
    ];

    autoTable(doc, {
      startY: 53,
      head: [["Campo / Parâmetro", "Informação Registrada"]],
      body: dados,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9.5 },
      bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 62, fontStyle: "bold", fillColor: [248, 250, 252] },
        1: { cellWidth: "auto" }
      }
    });

    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 12 : 160;

    // Caixa de Segurança e Autenticidade
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, finalY, pageWidth - 28, 22, 2, 2, "F");
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, finalY, pageWidth - 28, 22, 2, 2, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("🔒 REGISTRO IMUTÁVEL E AUDITÁVEL", 18, finalY + 6.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Este documento certifica que a movimentação acima foi registrada de forma perpétua e protegida no banco de dados.", 18, finalY + 12);
    doc.text(`Carimbo UTC: ${item.data_hora} | Hash de Rastreabilidade: sha256-${(item.id || "0").replace(/\D/g, "").slice(0, 16)}`, 18, finalY + 17);

    // Campos de Assinatura
    const signY = finalY + 38;
    if (signY < pageHeight - 25) {
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.line(20, signY, 90, signY);
      doc.line(pageWidth - 90, signY, pageWidth - 20, signY);

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 65, 85);
      doc.text("Operador DETRAN", 55, signY + 4.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(item.usuario_nome || "Assinatura do Servidor", 55, signY + 8.5, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Responsável / Recebedor", pageWidth - 55, signY + 4.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(getRespName(item.responsavel_nome, item.responsavel_id), pageWidth - 55, signY + 8.5, { align: "center" });
    }

    // Rodapé
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${cfg.sigla || "DETRAN-PA"} — Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR")}`, 14, pageHeight - 8);

    doc.save(`Comprovante_Movimentacao_${item.geral_ordem || item.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Cabeçalho principal */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600 shrink-0" />
            <span>Histórico Inalterável de Movimentações (CNHs)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Registro permanente e imutável de todas as movimentações do Protocolo Geral DETRAN.</span>
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchDados}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Atualizar histórico"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-500" : ""}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Exportar planilha Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Exportar relatório em PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF Oficial</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas em Destaque */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-bold text-slate-900 dark:text-white block tracking-tight">
              {stats.total.toLocaleString("pt-BR")}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total no Histórico</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-bold text-slate-900 dark:text-white block tracking-tight">
              {stats.recebidas.toLocaleString("pt-BR")}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">CNHs Recebidas</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-bold text-slate-900 dark:text-white block tracking-tight">
              {stats.entregues.toLocaleString("pt-BR")}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">CNHs Entregues</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-bold text-slate-900 dark:text-white block tracking-tight">
              {stats.remetidas.toLocaleString("pt-BR")}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Remetidas / Iniciais</span>
          </div>
        </div>
      </div>

        {/* Barra de Filtros de Busca */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar por nome, CPF, ordem, operador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Filtro por Situação */}
            <select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value="todas">Todas as Situações</option>
              <option value="Remetida">Remetida</option>
              <option value="Recebida">Recebida</option>
              <option value="Pendente">Pendente</option>
              <option value="Entregue">Entregue</option>
            </select>

            {/* Filtro por Período */}
            <select
              value={periodoPreset}
              onChange={(e) => setPeriodoPreset(e.target.value as PeriodoPreset)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value="todos">Todo o Período</option>
              <option value="hoje">Hoje</option>
              <option value="7dias">Últimos 7 dias</option>
              <option value="30dias">Últimos 30 dias</option>
              <option value="mes_atual">Mês Atual</option>
            </select>

            {/* Tamanho da Página */}
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value={15}>15 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>

            {/* Botão Baixar Relatório PDF */}
            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"
              title="Baixar Relatório Completo em PDF dos registros filtrados"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Baixar Relatório PDF</span>
            </button>
          </div>
        </div>

        {/* Tabela do Histórico */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
              <span>Carregando dados de histórico de movimentação...</span>
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Nenhum registro de histórico encontrado.</span>
              <span>Tente alterar o termo de busca ou ajustar os filtros selecionados.</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                      <th className="py-3.5 px-5">Data e Hora</th>
                      <th className="py-3.5 px-5">CNH (Ordem / Titular / CPF)</th>
                      <th className="py-3.5 px-5">Movimentação Status</th>
                      <th className="py-3.5 px-5">Responsável (Retirada)</th>
                      <th className="py-3.5 px-5">Operador DETRAN</th>
                      <th className="py-3.5 px-5">Observações</th>
                      <th className="py-3.5 px-4 text-center w-24">Baixar PDF</th>
                      <th className="py-3.5 px-4 w-16 text-center">Proteção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    {paginatedLogs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{formatDateTime(item.data_hora)}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-5">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>Ordem #{item.geral_ordem !== undefined && item.geral_ordem !== null ? item.geral_ordem : "-"}</span>
                          </div>
                          <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            {item.geral_nome || "-"}
                          </span>
                          {item.geral_cpf && (
                            <span className="block text-[10px] text-slate-400 font-mono">
                              CPF: {formatCPF(item.geral_cpf)}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {item.situacao_anterior ? (
                              <>
                                <Badge situacao={item.situacao_anterior} />
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </>
                            ) : (
                              <span className="text-[10px] font-semibold uppercase text-slate-400">Inclusão:</span>
                            )}
                            <Badge situacao={item.situacao_nova} />
                          </div>
                        </td>

                        <td className="py-3.5 px-5 font-medium text-slate-700 dark:text-slate-300">
                          {getRespName(item.responsavel_nome, item.responsavel_id)}
                        </td>

                        <td className="py-3.5 px-5 text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.usuario_nome || "Sistema"}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-5 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={item.observacao}>
                          {item.observacao || "-"}
                        </td>

                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleExportSingleItemPDF(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-lg text-[11px] font-bold border border-rose-200 dark:border-rose-800 shadow-2xs transition-all cursor-pointer"
                            title="Baixar Comprovante Oficial em PDF desta movimentação"
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>PDF</span>
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center justify-center p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500" title="Imutável por RLS e Triggers">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            {/* Rodapé e Controles de Paginação */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div>
                Exibindo <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length > 0 ? startIndex + 1 : 0}</span> a <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(startIndex + pageSize, filtered.length)}</span> de <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length.toLocaleString("pt-BR")}</span> registros no histórico
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                  title="Primeira página"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-slate-700 dark:text-slate-200">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                  title="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                  title="Última página"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
