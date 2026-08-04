import React, { useState, useMemo, useEffect } from "react";
import { 
  Smartphone, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  Send, 
  Clock, 
  Inbox, 
  HelpCircle, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  RefreshCw, 
  TrendingUp, 
  Users, 
  MapPin, 
  QrCode, 
  ShieldCheck, 
  ChevronDown, 
  X, 
  ArrowUpDown,
  PieChart as PieIcon,
  BarChart2,
  Activity
} from "lucide-react";
import { getAcessosCidadaoLogs, getPublicSearchCount } from "../services/db";
import { AcessoCidadaoLog } from "../types";
import { formatCPF, formatDateTime } from "../lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type PeriodoPreset = "hoje" | "ontem" | "7dias" | "30dias" | "mes_atual" | "mes_anterior" | "personalizado" | "todos";

export const AcessosCidadaoPage: React.FC = () => {
  const [logs, setLogs] = useState<AcessoCidadaoLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de Período
  const [presetPeriodo, setPresetPeriodo] = useState<PeriodoPreset>("30dias");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  // Filtros adicionais de Busca e Status
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<string>("TODAS");
  const [filtroCanal, setFiltroCanal] = useState<string>("TODOS");

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Carregar Logs
  const loadLogs = () => {
    setLoading(true);
    const data = getAcessosCidadaoLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Recalcular datas do preset
  useEffect(() => {
    const now = new Date();
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    if (presetPeriodo === "hoje") {
      const todayStr = formatDate(now);
      setDataInicio(todayStr);
      setDataFim(todayStr);
    } else if (presetPeriodo === "ontem") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yestStr = formatDate(yesterday);
      setDataInicio(yestStr);
      setDataFim(yestStr);
    } else if (presetPeriodo === "7dias") {
      const d7 = new Date(now);
      d7.setDate(now.getDate() - 7);
      setDataInicio(formatDate(d7));
      setDataFim(formatDate(now));
    } else if (presetPeriodo === "30dias") {
      const d30 = new Date(now);
      d30.setDate(now.getDate() - 30);
      setDataInicio(formatDate(d30));
      setDataFim(formatDate(now));
    } else if (presetPeriodo === "mes_atual") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDataInicio(formatDate(firstDay));
      setDataFim(formatDate(now));
    } else if (presetPeriodo === "mes_anterior") {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDataInicio(formatDate(firstDayLastMonth));
      setDataFim(formatDate(lastDayLastMonth));
    } else if (presetPeriodo === "todos") {
      setDataInicio("");
      setDataFim("");
    }
  }, [presetPeriodo]);

  // Filtragem dos registros por período, busca e situação
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Data do log em timestamp
      const logTime = new Date(log.data_hora).getTime();

      let matchPeriodo = true;
      if (dataInicio) {
        const startMs = new Date(`${dataInicio}T00:00:00`).getTime();
        if (logTime < startMs) matchPeriodo = false;
      }
      if (dataFim) {
        const endMs = new Date(`${dataFim}T23:59:59.999`).getTime();
        if (logTime > endMs) matchPeriodo = false;
      }

      // Filtro de Situação
      let matchSituacao = true;
      if (filtroSituacao !== "TODAS") {
        matchSituacao = log.situacao === filtroSituacao;
      }

      // Filtro de Canal
      let matchCanal = true;
      if (filtroCanal !== "TODOS") {
        matchCanal = log.canal === filtroCanal;
      }

      // Busca Textual
      let matchSearch = true;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().replace(/\D/g, "");
        const termRaw = searchTerm.toLowerCase();
        const cpfClean = log.cpf.replace(/\D/g, "");
        const nomeClean = (log.nome_titular || "").toLowerCase();
        const dispClean = (log.dispositivo || "").toLowerCase();
        const cidClean = (log.cidade_origem || "").toLowerCase();

        matchSearch = 
          (term && cpfClean.includes(term)) ||
          nomeClean.includes(termRaw) ||
          dispClean.includes(termRaw) ||
          cidClean.includes(termRaw);
      }

      return matchPeriodo && matchSituacao && matchCanal && matchSearch;
    });
  }, [logs, dataInicio, dataFim, filtroSituacao, filtroCanal, searchTerm]);

  // Estatísticas calculadas sobre os dados filtrados
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    let recebidas = 0;
    let remetidas = 0;
    let entregues = 0;
    let pendentes = 0;
    let naoEncontradas = 0;

    filteredLogs.forEach((log) => {
      if (log.situacao === "Recebida") recebidas++;
      else if (log.situacao === "Remetida") remetidas++;
      else if (log.situacao === "Entregue") entregues++;
      else if (log.situacao === "Pendente") pendentes++;
      else if (log.situacao === "Não Encontrada") naoEncontradas++;
    });

    const taxaDisponivel = total > 0 ? Math.round((recebidas / total) * 100) : 0;

    return {
      total,
      recebidas,
      remetidas,
      entregues,
      pendentes: pendentes + naoEncontradas,
      naoEncontradas,
      taxaDisponivel
    };
  }, [filteredLogs]);

  // Paginação
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  // Resetar página ao mudar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [dataInicio, dataFim, filtroSituacao, filtroCanal, searchTerm, itemsPerPage]);

  // Exportar Excel
  const handleExportXLSX = () => {
    const rows = filteredLogs.map((l) => ({
      "Data e Hora": formatDateTime(l.data_hora),
      "CPF Consultado": formatCPF(l.cpf),
      "Nome do Titular": l.nome_titular || "Não identificado",
      "Situação CNH": l.situacao,
      "Status Resultado": l.resultado_status,
      "Canal de Acesso": l.canal,
      "Dispositivo": l.dispositivo || "-",
      "Cidade Origem": l.cidade_origem || "-"
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Acessos Cidadao");
    XLSX.writeFile(wb, `Acessos_App_Cidadao_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Exportar PDF
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rightMarginX = pageWidth - 14;

    const tableData = filteredLogs.map((l) => [
      formatDateTime(l.data_hora),
      formatCPF(l.cpf),
      l.nome_titular || "N/A",
      l.situacao,
      l.canal
    ]);

    autoTable(doc, {
      startY: 28,
      margin: { top: 28, bottom: 14, left: 14, right: 14 },
      head: [["Data/Hora", "CPF", "Titular", "Situação CNH", "Canal de Acesso"]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [14, 116, 144], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 28, halign: "center" },
        2: { cellWidth: 65 },
        3: { cellWidth: 25, halign: "center" },
        4: { cellWidth: "auto" }
      },
      didDrawPage: (data) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("DETRAN/PA — Relatório de Acessos do Cidadão no Aplicativo", 14, 11);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        doc.text("Painel de Consultas Públicas de CNH pelo App / PWA Mobile", 14, 16);

        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Emissão: ${new Date().toLocaleDateString("pt-BR")}`, rightMarginX, 11, { align: "right" });
        doc.text(`Total Registros: ${filteredLogs.length}`, rightMarginX, 15, { align: "right" });

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(14, 21, rightMarginX, 21);

        doc.setFontSize(7.5);
        doc.text("Sistema DETRAN-PROT — Módulo Analítico de Consultas do Cidadão", 14, pageHeight - 6);
        doc.text(`Página ${data.pageNumber}`, rightMarginX, pageHeight - 6, { align: "right" });
      }
    });

    doc.save(`Relatorio_Acessos_Cidadao_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const getPresetLabel = () => {
    switch (presetPeriodo) {
      case "hoje": return "Hoje";
      case "ontem": return "Ontem";
      case "7dias": return "Últimos 7 dias";
      case "30dias": return "Últimos 30 dias";
      case "mes_atual": return "Esse mês";
      case "mes_anterior": return "Último mês";
      case "personalizado": return "Personalizado";
      case "todos": return "Todos os períodos";
      default: return "Período";
    }
  };

  const formatDisplayDateRange = () => {
    if (!dataInicio && !dataFim) return "Todos os registros";
    const dIn = dataInicio ? new Date(`${dataInicio}T00:00:00`).toLocaleDateString("pt-BR") : "...";
    const dFi = dataFim ? new Date(`${dataFim}T00:00:00`).toLocaleDateString("pt-BR") : "...";
    return `${dIn} - ${dFi}`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho da Página */}
      <div className="bg-gradient-to-r from-cyan-900 via-slate-900 to-blue-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 backdrop-blur-3xl transform skew-x-12 translate-x-12 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded-full text-xs font-semibold">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Módulo de Consulta Pública do Cidadão</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Acessos e Consultas pelo Aplicativo
            </h1>
            <p className="text-slate-300 text-xs md:text-sm max-w-2xl leading-relaxed">
              Acompanhe em tempo real o volume de buscas realizadas pelos cidadãos no aplicativo PWA mobile e portal web. Monitore o número de CNHs consultadas nas situações <strong>Recebida</strong>, <strong>Remetida</strong>, <strong>Entregue</strong> e <strong>Pendente</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadLogs}
              className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur-xs transition-all cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </button>

            <button
              type="button"
              onClick={handleExportXLSX}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>PDF Oficial</span>
            </button>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTRO POR PERÍODO (Estilo Seletor da Imagem) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-sm">
            <Filter className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Filtros de Período e Pesquisa</span>
          </div>

          {/* Seletor de Período com Popover Presets */}
          <div className="relative inline-block text-left">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Período:
              </label>
              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer min-w-[210px] justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>{formatDisplayDateRange()}</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showPeriodDropdown ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown Popover estilo o da imagem */}
                {showPeriodDropdown && (
                  <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 p-3 space-y-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      Selecione o Atalho de Período
                    </div>

                    <div className="grid grid-cols-1 gap-1">
                      {[
                        { key: "hoje", label: "Hoje" },
                        { key: "ontem", label: "Ontem" },
                        { key: "7dias", label: "Últimos 7 dias" },
                        { key: "30dias", label: "Últimos 30 dias" },
                        { key: "mes_atual", label: "Esse mês" },
                        { key: "mes_anterior", label: "Último mês" },
                        { key: "personalizado", label: "Personalizado" },
                        { key: "todos", label: "Todos os Registros" },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setPresetPeriodo(item.key as PeriodoPreset);
                            if (item.key !== "personalizado") {
                              setShowPeriodDropdown(false);
                            }
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            presetPeriodo === item.key
                              ? "bg-cyan-700 text-white font-bold shadow-2xs"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Inputs de Data para modo Personalizado */}
                    {presetPeriodo === "personalizado" && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-1">
                              Início
                            </label>
                            <input
                              type="date"
                              value={dataInicio}
                              onChange={(e) => setDataInicio(e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-1">
                              Fim
                            </label>
                            <input
                              type="date"
                              value={dataFim}
                              onChange={(e) => setDataFim(e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-100"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          setPresetPeriodo("todos");
                          setShowPeriodDropdown(false);
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium cursor-pointer"
                      >
                        Limpar Filtro
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowPeriodDropdown(false)}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg shadow-2xs transition-all cursor-pointer"
                      >
                        Selecionar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filtro Secundário: Busca por CPF/Nome e Selects de Situação / Canal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por CPF, Nome, Cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div>
            <select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="TODAS">Todas as Situações</option>
              <option value="Recebida">Situação: Recebida (Disponível)</option>
              <option value="Remetida">Situação: Remetida (Em Trânsito)</option>
              <option value="Entregue">Situação: Entregue (Balcão)</option>
              <option value="Pendente">Situação: Pendente / Cadastramento</option>
              <option value="Não Encontrada">Situação: Não Localizada</option>
            </select>
          </div>

          <div>
            <select
              value={filtroCanal}
              onChange={(e) => setFiltroCanal(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="TODOS">Todos os Canais de Acesso</option>
              <option value="App Android">App Android</option>
              <option value="App iOS">App iOS</option>
              <option value="PWA Web Mobile">PWA Web Mobile</option>
              <option value="QR Code Totem">QR Code Totem</option>
              <option value="Web Browser">Navegador Web</option>
            </select>
          </div>

          <div className="flex items-center justify-end text-xs text-slate-500 dark:text-slate-400 font-semibold px-1">
            <span>Listando <strong>{filteredLogs.length}</strong> consultas</span>
          </div>
        </div>
      </div>

      {/* DASHBOARD DE ESTATÍSTICAS E CONTAGENS POR SITUAÇÃO (Solicitação do Usuário) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Recebida */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Recebida
            </span>
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {stats.recebidas}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium flex items-center gap-1">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {stats.total > 0 ? Math.round((stats.recebidas / stats.total) * 100) : 0}%
            </span>
            <span>Prontas para Retirada</span>
          </div>
        </div>

        {/* Card 2: Remetida */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 w-16 h-16 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
              Remetida
            </span>
            <div className="p-2 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Send className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {stats.remetidas}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium flex items-center gap-1">
            <span className="text-blue-600 dark:text-blue-400 font-bold">
              {stats.total > 0 ? Math.round((stats.remetidas / stats.total) * 100) : 0}%
            </span>
            <span>Em Trânsito / Lote</span>
          </div>
        </div>

        {/* Card 3: Entregue */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 w-16 h-16 bg-purple-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
              Entregue
            </span>
            <div className="p-2 bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl">
              <Inbox className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {stats.entregues}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium flex items-center gap-1">
            <span className="text-purple-600 dark:text-purple-400 font-bold">
              {stats.total > 0 ? Math.round((stats.entregues / stats.total) * 100) : 0}%
            </span>
            <span>Já Entregues no Balcão</span>
          </div>
        </div>

        {/* Card 4: Pendente */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 w-16 h-16 bg-amber-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Pendente
            </span>
            <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {stats.pendentes}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium flex items-center gap-1">
            <span className="text-amber-600 dark:text-amber-400 font-bold">
              {stats.total > 0 ? Math.round((stats.pendentes / stats.total) * 100) : 0}%
            </span>
            <span>Em Cadastramento / Ausente</span>
          </div>
        </div>

        {/* Card 5: Total no Período */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-cyan-200 dark:border-cyan-900/50 shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 w-16 h-16 bg-cyan-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">
              Total do Período
            </span>
            <div className="p-2 bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {stats.total}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium flex items-center gap-1">
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">
              {stats.taxaDisponivel}% Sucesso
            </span>
            <span>Disponíveis no Balcão</span>
          </div>
        </div>
      </div>

      {/* GRÁFICOS E PAINEL VISUAL DE DISTRIBUIÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribuição por Situação (Barra Visual) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                Proporção de CNHs Consultadas por Situação no Período
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Base: {stats.total} consultas
            </span>
          </div>

          {/* Barra Proporcional Multi-segmento */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              {stats.total > 0 ? (
                <>
                  <div 
                    style={{ width: `${(stats.recebidas / stats.total) * 100}%` }} 
                    className="bg-emerald-500 hover:bg-emerald-400 transition-all cursor-pointer"
                    title={`Recebida: ${stats.recebidas}`}
                  />
                  <div 
                    style={{ width: `${(stats.remetidas / stats.total) * 100}%` }} 
                    className="bg-blue-500 hover:bg-blue-400 transition-all cursor-pointer"
                    title={`Remetida: ${stats.remetidas}`}
                  />
                  <div 
                    style={{ width: `${(stats.entregues / stats.total) * 100}%` }} 
                    className="bg-purple-500 hover:bg-purple-400 transition-all cursor-pointer"
                    title={`Entregue: ${stats.entregues}`}
                  />
                  <div 
                    style={{ width: `${(stats.pendentes / stats.total) * 100}%` }} 
                    className="bg-amber-500 hover:bg-amber-400 transition-all cursor-pointer"
                    title={`Pendente: ${stats.pendentes}`}
                  />
                </>
              ) : (
                <div className="w-full bg-slate-200 dark:bg-slate-700" />
              )}
            </div>

            {/* Legenda dos Segmentos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                <div className="truncate">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Recebida: </span>
                  <strong className="text-slate-900 dark:text-white">{stats.recebidas}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                <div className="truncate">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Remetida: </span>
                  <strong className="text-slate-900 dark:text-white">{stats.remetidas}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500 shrink-0" />
                <div className="truncate">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Entregue: </span>
                  <strong className="text-slate-900 dark:text-white">{stats.entregues}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                <div className="truncate">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Pendente: </span>
                  <strong className="text-slate-900 dark:text-white">{stats.pendentes}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo de Canais de Acesso */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Smartphone className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
              Canais Mais Utilizados
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            {[
              { name: "App Android", icon: Smartphone, color: "text-emerald-500" },
              { name: "App iOS", icon: Smartphone, color: "text-blue-500" },
              { name: "PWA Web Mobile", icon: QrCode, color: "text-purple-500" },
              { name: "QR Code Totem", icon: Users, color: "text-amber-500" },
            ].map((canal) => {
              const count = filteredLogs.filter(l => l.canal === canal.name).length;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              const IconComp = canal.icon;

              return (
                <div key={canal.name} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <div className="flex items-center gap-2">
                    <IconComp className={`w-4 h-4 ${canal.color}`} />
                    <span className="font-medium text-slate-700 dark:text-slate-200">{canal.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{count}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TABELA DE DADOS DETALHADA COM CONSULTAS DO CIDADÃO */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Registros Individuais de Acesso do Cidadão
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Exibir por página:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-100"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Data e Hora</th>
                <th className="py-3 px-4">CPF Consultado</th>
                <th className="py-3 px-4">Nome do Titular</th>
                <th className="py-3 px-4 text-center">Situação CNH</th>
                <th className="py-3 px-4">Canal / Dispositivo</th>
                <th className="py-3 px-4">Cidade Origem</th>
                <th className="py-3 px-4 text-center">Status no Balcão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="font-semibold text-sm">Nenhum registro de acesso encontrado para o período selecionado.</p>
                      <p className="text-xs">Tente ajustar a data no filtro superior ou limpar os campos de busca.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  let statusBadge = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                  if (log.situacao === "Recebida") {
                    statusBadge = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800";
                  } else if (log.situacao === "Remetida") {
                    statusBadge = "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800";
                  } else if (log.situacao === "Entregue") {
                    statusBadge = "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-800";
                  } else if (log.situacao === "Pendente") {
                    statusBadge = "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800";
                  }

                  return (
                    <tr 
                      key={log.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-slate-700 dark:text-slate-200"
                    >
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.data_hora)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatCPF(log.cpf)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                        {log.nome_titular || <span className="text-slate-400 italic">Não identificado</span>}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusBadge}`}>
                          {log.situacao}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{log.canal}</span>
                          <span className="text-[10px] text-slate-400">{log.dispositivo || "Navegador Web"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                          <MapPin className="w-3 h-3 text-cyan-500" />
                          {log.cidade_origem || "Belém"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {log.resultado_status === "DISPONIVEL" && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px] flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Disponível
                          </span>
                        )}
                        {log.resultado_status === "EM_PROCESSAMENTO" && (
                          <span className="text-blue-600 dark:text-blue-400 font-bold text-[11px] flex items-center justify-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Em Trânsito
                          </span>
                        )}
                        {log.resultado_status === "ENTREGUE" && (
                          <span className="text-purple-600 dark:text-purple-400 font-bold text-[11px] flex items-center justify-center gap-1">
                            <Inbox className="w-3.5 h-3.5" /> Entregue
                          </span>
                        )}
                        {log.resultado_status === "NAO_ENCONTRADA" && (
                          <span className="text-slate-400 font-bold text-[11px]">
                            Não Encontrada
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

        {/* Rodapé com Paginação */}
        {filteredLogs.length > 0 && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div>
              Exibindo <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong> a <strong>{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</strong> de <strong>{filteredLogs.length}</strong> consultas.
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
              >
                Primeira
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
              >
                Anterior
              </button>
              
              <span className="px-3 font-semibold text-slate-800 dark:text-slate-200">
                Página {currentPage} de {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
              >
                Próxima
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
              >
                Última
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
