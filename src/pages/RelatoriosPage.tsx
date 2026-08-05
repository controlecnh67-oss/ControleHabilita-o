import React, { useState, useEffect, useMemo } from "react";
import { 
  BarChart3, 
  Printer, 
  FileSpreadsheet, 
  RefreshCw, 
  Calendar, 
  Filter, 
  FolderArchive, 
  Send, 
  Inbox, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Users, 
  TrendingUp, 
  PieChart as PieIcon, 
  Clock, 
  Search,
  Building2,
  Smartphone,
  Layers,
  Award,
  Download,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  CartesianGrid,
  AreaChart,
  Area
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { 
  getGeralCNHs, 
  getMemorandos, 
  getHistoricoList, 
  getAcessosCidadaoLogs, 
  getResponsaveis, 
  getUsuarios,
  getCandidatosAll
} from "../services/db";
import { 
  GeralCNH, 
  Memorando, 
  HistoricoMovimentacao, 
  AcessoCidadaoLog, 
  Responsavel, 
  Usuario,
  Candidato,
  SituacaoGeral
} from "../types";
import { formatCPF, formatDateTime, normalizeSearch } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

type PeriodoTipo = "hoje" | "7d" | "30d" | "mes_atual" | "ano_atual" | "custom";

export const RelatoriosPage: React.FC = () => {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [cnhs, setCnhs] = useState<GeralCNH[]>([]);
  const [memorandos, setMemorandos] = useState<Memorando[]>([]);
  const [historico, setHistorico] = useState<HistoricoMovimentacao[]>([]);
  const [logsCidadao, setLogsCidadao] = useState<AcessoCidadaoLog[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);

  // Filtros
  const [periodo, setPeriodo] = useState<PeriodoTipo>("30d");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [reparticaoFiltro, setReparticaoFiltro] = useState<string>("todas");
  const [situacaoFiltro, setSituacaoFiltro] = useState<string>("todas");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [cnhsData, memosData, histData, respData, userData, candData] = await Promise.all([
        getGeralCNHs(),
        getMemorandos(),
        getHistoricoList(),
        getResponsaveis(),
        getUsuarios(),
        getCandidatosAll()
      ]);
      const citizenLogs = getAcessosCidadaoLogs();

      setCnhs(cnhsData);
      setMemorandos(memosData);
      setHistorico(histData);
      setResponsaveis(respData);
      setUsuarios(userData);
      setCandidatos(candData);
      setLogsCidadao(citizenLogs);
    } catch (err) {
      console.error("Erro ao carregar dados do relatório:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Determinar faixa de datas ativas
  const dateRange = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (periodo === "hoje") {
      // Hoje já é default
    } else if (periodo === "7d") {
      start.setDate(now.getDate() - 6);
    } else if (periodo === "30d") {
      start.setDate(now.getDate() - 29);
    } else if (periodo === "mes_atual") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (periodo === "ano_atual") {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (periodo === "custom") {
      if (dataInicio) {
        const dStr = dataInicio.includes("T") ? dataInicio : `${dataInicio}T00:00:00`;
        start = new Date(dStr);
      } else {
        start.setDate(now.getDate() - 30);
      }
      if (dataFim) {
        const dStr = dataFim.includes("T") ? dataFim : `${dataFim}T23:59:59`;
        end = new Date(dStr);
      }
    }

    return { start, end };
  }, [periodo, dataInicio, dataFim]);

  // Função utilitária para checar se uma data cai no período
  const isDateInPeriod = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return d >= dateRange.start && d <= dateRange.end;
  };

  // Comparação para dia de hoje estrito
  const isToday = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  // CNHs filtradas por período e repartição
  const cnhsFiltradasPeriodo = useMemo(() => {
    return cnhs.filter((c) => {
      // Checa data de movimento ou data de criação
      const dataRef = c.data_movimento || c.created_at;
      const inPeriod = isDateInPeriod(dataRef);
      if (!inPeriod) return false;

      if (reparticaoFiltro !== "todas" && c.reparticao !== reparticaoFiltro) {
        return false;
      }

      if (situacaoFiltro !== "todas" && c.situacao !== situacaoFiltro) {
        return false;
      }

      if (searchTerm) {
        const term = normalizeSearch(searchTerm);
        const matchNome = normalizeSearch(c.nome).includes(term);
        const matchCpf = (c.cpf || "").replace(/\D/g, "").includes(term.replace(/\D/g, ""));
        const matchOrdem = c.ordem ? String(c.ordem).includes(term) : false;
        const matchResp = normalizeSearch(c.responsavel_nome || "").includes(term);
        const matchMemo = normalizeSearch(c.memorando_numero || "").includes(term);
        return matchNome || matchCpf || matchOrdem || matchResp || matchMemo;
      }

      return true;
    });
  }, [cnhs, dateRange, reparticaoFiltro, situacaoFiltro, searchTerm]);

  // Historico no periodo
  const histFiltradoPeriodo = useMemo(() => {
    return historico.filter((h) => isDateInPeriod(h.data_hora));
  }, [historico, dateRange]);

  // Memorandos no periodo
  const memorandosPeriodo = useMemo(() => {
    return memorandos.filter((m) => isDateInPeriod(m.created_at));
  }, [memorandos, dateRange]);

  // Logs Cidadao no periodo
  const logsCidadaoPeriodo = useMemo(() => {
    return logsCidadao.filter((l) => isDateInPeriod(l.data_hora));
  }, [logsCidadao, dateRange]);

  // ---- METRICAS DIARIAS (HOJE) ----
  const estatisticasHoje = useMemo(() => {
    const cnhsRecebidasHoje = cnhs.filter((c) => (c.situacao === "Recebida" || c.situacao === "Entregue") && isToday(c.data_movimento || c.created_at)).length;
    const cnhsEntreguesHoje = cnhs.filter((c) => c.situacao === "Entregue" && isToday(c.updated_at || c.data_movimento)).length;
    const memorandosHoje = memorandos.filter((m) => isToday(m.created_at)).length;
    const consultasHoje = logsCidadao.filter((l) => isToday(l.data_hora)).length;
    const movimentacoesHoje = historico.filter((h) => isToday(h.data_hora)).length;

    return {
      cnhsRecebidasHoje,
      cnhsEntreguesHoje,
      memorandosHoje,
      consultasHoje,
      movimentacoesHoje
    };
  }, [cnhs, memorandos, logsCidadao, historico]);

  // ---- METRICAS DO PERÍODO SELECIONADO ----
  const estatisticasPeriodo = useMemo(() => {
    const totalGeralAcervo = cnhs.length;
    const totalPeriodo = cnhsFiltradasPeriodo.length;

    const remetidas = cnhsFiltradasPeriodo.filter((c) => c.situacao === "Remetida").length;
    const recebidas = cnhsFiltradasPeriodo.filter((c) => c.situacao === "Recebida").length;
    const pendentes = cnhsFiltradasPeriodo.filter((c) => c.situacao === "Pendente").length;
    const entregues = cnhsFiltradasPeriodo.filter((c) => c.situacao === "Entregue").length;

    const totalMemosPeriodo = memorandosPeriodo.length;
    const memosRemetidos = memorandosPeriodo.filter((m) => m.status === "Remetido").length;
    const memosElaboracao = memorandosPeriodo.filter((m) => m.status === "Em elaboração").length;

    const totalCandidatosEmMemos = memorandosPeriodo.reduce((acc, m) => acc + (m.candidatos_count || 0), 0);

    const taxaEntrega = totalPeriodo > 0 ? Math.round((entregues / totalPeriodo) * 100) : 0;

    // Calcular movimentacoes de mudanca de status no historico durante o periodo
    const histEntregas = histFiltradoPeriodo.filter((h) => h.situacao_nova === "Entregue").length;
    const histRecebimentos = histFiltradoPeriodo.filter((h) => h.situacao_nova === "Recebida").length;
    const histRemessas = histFiltradoPeriodo.filter((h) => h.situacao_nova === "Remetida").length;

    return {
      totalGeralAcervo,
      totalPeriodo,
      remetidas,
      recebidas,
      pendentes,
      entregues,
      taxaEntrega,
      totalMemosPeriodo,
      memosRemetidos,
      memosElaboracao,
      totalCandidatosEmMemos,
      histEntregas,
      histRecebimentos,
      histRemessas
    };
  }, [cnhs, cnhsFiltradasPeriodo, memorandosPeriodo, histFiltradoPeriodo]);

  // ---- DADOS PARA GRAFICOS ----
  // 1. Donut Chart por Situação
  const pizzaData = useMemo(() => {
    return [
      { name: "Recebidas (Em Gaveta)", value: estatisticasPeriodo.recebidas, color: "#2563eb" },
      { name: "Entregues ao Cidadão", value: estatisticasPeriodo.entregues, color: "#059669" },
      { name: "Remetidas (Em Trânsito)", value: estatisticasPeriodo.remetidas, color: "#d97706" },
      { name: "Pendentes Alocação", value: estatisticasPeriodo.pendentes, color: "#e11d48" }
    ].filter((item) => item.value > 0 || estatisticasPeriodo.totalPeriodo === 0);
  }, [estatisticasPeriodo]);

  // 2. Evolução Diária no Período (Movimentação por Data)
  const timelineData = useMemo(() => {
    const mapDatas: Record<string, { data: string; recebidas: number; entregues: number; memorandos: number }> = {};

    // Inicializar dias da faixa de data
    const curr = new Date(dateRange.start);
    const limit = new Date(dateRange.end);
    
    // Limitar a no max 60 pontos no grafico para nao poluir
    let daysCount = Math.ceil((limit.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
    const step = daysCount > 60 ? Math.ceil(daysCount / 40) : 1;

    while (curr <= limit) {
      const label = curr.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      mapDatas[label] = { data: label, recebidas: 0, entregues: 0, memorandos: 0 };
      curr.setDate(curr.getDate() + step);
    }

    // Preencher dados das CNHs
    cnhsFiltradasPeriodo.forEach((c) => {
      const dt = new Date(c.data_movimento || c.created_at);
      const label = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (mapDatas[label]) {
        if (c.situacao === "Recebida") mapDatas[label].recebidas += 1;
        if (c.situacao === "Entregue") mapDatas[label].entregues += 1;
      }
    });

    memorandosPeriodo.forEach((m) => {
      const dt = new Date(m.created_at);
      const label = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (mapDatas[label]) {
        mapDatas[label].memorandos += 1;
      }
    });

    return Object.values(mapDatas);
  }, [cnhsFiltradasPeriodo, memorandosPeriodo, dateRange]);

  // 3. Ranking de Responsáveis / CFCs que mais retiraram CNHs no período
  const topResponsaveis = useMemo(() => {
    const mapResp: Record<string, { nome: string; count: number }> = {};
    cnhsFiltradasPeriodo
      .filter((c) => c.situacao === "Entregue" && c.responsavel_nome)
      .forEach((c) => {
        const nome = c.responsavel_nome || "Titular Direto";
        if (!mapResp[nome]) {
          mapResp[nome] = { nome, count: 0 };
        }
        mapResp[nome].count += 1;
      });

    return Object.values(mapResp)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [cnhsFiltradasPeriodo]);

  // 4. Repartições Físicas / Repartição por Volume
  const reparticoesStats = useMemo(() => {
    const mapRep: Record<string, number> = {};
    cnhsFiltradasPeriodo.forEach((c) => {
      const rep = c.reparticao || "DETRAN Central - Sede";
      mapRep[rep] = (mapRep[rep] || 0) + 1;
    });
    return Object.entries(mapRep).map(([name, total]) => ({ name, total }));
  }, [cnhsFiltradasPeriodo]);

  // ---- IMPRESSÃO DE PDF GERENCIAL SETORIAL ----
  const handlePrintPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Cabeçalho Institucional DETRAN
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 24, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("DEPARTAMENTO ESTADUAL DE TRÂNSITO DO AMAPÁ - DETRAN/AP", pageWidth / 2, 10, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("COORDENADORIA DE HABILITAÇÃO & PROTOCOLO GERAL DE CNHs", pageWidth / 2, 16, { align: "center" });

    // Faixa amarela institucional
    doc.setFillColor(234, 179, 8); // amber-500
    doc.rect(0, 24, pageWidth, 2, "F");

    // Subtítulo do Relatório
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO SETORIAL DE MOVIMENTAÇÃO DE CNHs E MEMORANDOS", 14, 34);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);

    const periodoStr = `${dateRange.start.toLocaleDateString("pt-BR")} até ${dateRange.end.toLocaleDateString("pt-BR")}`;
    doc.text(`Período de Análise: ${periodoStr} | Filtro Repartição: ${reparticaoFiltro === "todas" ? "Todas" : reparticaoFiltro}`, 14, 40);
    doc.text(`Emissão: ${new Date().toLocaleString("pt-BR")} | Emitido por: ${user?.nome_curto || user?.nome || "Servidor DETRAN"}`, 14, 45);

    let currentY = 50;

    // Tabela 1: Resumo dos Números Diários e Indicadores do Período
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("1. SÍNTESE E INDICADORES DO SETOR", 14, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      head: [["Indicador Setorial", "Quantidade / Valor", "Percentual / Status"]],
      body: [
        ["Total de CNHs no Acervo Geral", `${estatisticasPeriodo.totalGeralAcervo}`, "Acervo Ativo"],
        ["CNHs Movimentadas no Período", `${estatisticasPeriodo.totalPeriodo}`, "100% da Amostra"],
        ["CNHs Recebidas (Em Gaveta)", `${estatisticasPeriodo.recebidas}`, `${estatisticasPeriodo.totalPeriodo ? Math.round((estatisticasPeriodo.recebidas / estatisticasPeriodo.totalPeriodo) * 100) : 0}%`],
        ["CNHs Entregues ao Cidadão/Procurador", `${estatisticasPeriodo.entregues}`, `${estatisticasPeriodo.taxaEntrega}%`],
        ["CNHs Remetidas (Em Trânsito)", `${estatisticasPeriodo.remetidas}`, `${estatisticasPeriodo.totalPeriodo ? Math.round((estatisticasPeriodo.remetidas / estatisticasPeriodo.totalPeriodo) * 100) : 0}%`],
        ["CNHs Pendentes de Alocação", `${estatisticasPeriodo.pendentes}`, `${estatisticasPeriodo.totalPeriodo ? Math.round((estatisticasPeriodo.pendentes / estatisticasPeriodo.totalPeriodo) * 100) : 0}%`],
        ["Memorandos Expedidos no Período", `${estatisticasPeriodo.totalMemosPeriodo}`, `${estatisticasPeriodo.memosRemetidos} Remetidos / ${estatisticasPeriodo.memosElaboracao} Em Elaboração`],
        ["Total de Candidatos Vinculados a Memos", `${estatisticasPeriodo.totalCandidatosEmMemos}`, "Processos CNH"],
        ["Atendimentos / Entregas Efetuadas Hoje", `${estatisticasHoje.cnhsEntreguesHoje}`, "Registro Diário"],
        ["Consultas Realizadas pelo Cidadão (App)", `${logsCidadaoPeriodo.length}`, "Acessos Públicos"]
      ],
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [51, 65, 85] },
      margin: { left: 14, right: 14 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    // Tabela 2: Memorandos do Período
    if (memorandosPeriodo.length > 0) {
      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("2. DEMONSTRATIVO DE MEMORANDOS E REMESSAS EXPEDIDAS", 14, currentY);
      currentY += 3;

      const bodyMemos = memorandosPeriodo.map((m) => [
        m.numero,
        m.remessa || "N/A",
        formatDateTime(m.created_at),
        m.usuario_nome || "Sistema",
        `${m.candidatos_count || 0} candidato(s)`,
        m.status
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [["Nº Memorando", "Remessa", "Data Expedição", "Elaborador", "Candidatos", "Status"]],
        body: bodyMemos,
        theme: "striped",
        headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
        margin: { left: 14, right: 14 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }

    // Tabela 3: Amostra Detalhada das CNHs Movimentadas
    if (cnhsFiltradasPeriodo.length > 0) {
      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`3. RELAÇÃO INDIVIDUALIZADA DE CNHs (${cnhsFiltradasPeriodo.length} Registros)`, 14, currentY);
      currentY += 3;

      // Limitar a 150 itens no PDF para evitar estouro de arquivo
      const itensPdf = cnhsFiltradasPeriodo.slice(0, 150);
      const bodyCnhs = itensPdf.map((c) => [
        c.ordem ? String(c.ordem) : "-",
        c.nome,
        formatCPF(c.cpf),
        c.reparticao || "DETRAN Sede",
        c.gaveta || "-",
        c.situacao,
        c.responsavel_nome || "Titular",
        c.data_movimento ? new Date(c.data_movimento).toLocaleDateString("pt-BR") : "-"
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [["Ordem", "Titular CNH", "CPF", "Repartição", "Gaveta", "Situação", "Responsável/Retirante", "Data Mov."]],
        body: bodyCnhs,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
        margin: { left: 14, right: 14 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;
    }

    // Assinaturas Institucionais
    if (currentY > 240) {
      doc.addPage();
      currentY = 40;
    }

    currentY += 10;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);

    // Linha de assinatura 1
    doc.line(20, currentY, 90, currentY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`${user?.nome || "Responsável do Setor"}`, 55, currentY + 4, { align: "center" });
    doc.text("Servidor Responsável pela Emissão", 55, currentY + 8, { align: "center" });

    // Linha de assinatura 2
    doc.line(120, currentY, 190, currentY);
    doc.text("Chefia de Protocolo e Habilitação", 155, currentY + 4, { align: "center" });
    doc.text("Visto da Coordenadoria / DETRAN-AP", 155, currentY + 8, { align: "center" });

    // Numeração de Páginas
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Página ${i} de ${totalPages} - Sistema Integrado de Protocolo de CNHs - DETRAN AP`,
        pageWidth / 2,
        287,
        { align: "center" }
      );
    }

    doc.save(`Relatorio_Setorial_DETRAN_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ---- EXPORTAÇÃO EXCEL ----
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Planilha 1: Resumo Executivo
    const resumoData = [
      ["DEPARTAMENTO ESTADUAL DE TRÂNSITO - DETRAN/AP"],
      ["RELATÓRIO SETORIAL E ESTATÍSTICO DE PROTOCÓLO"],
      ["Período:", `${dateRange.start.toLocaleDateString("pt-BR")} até ${dateRange.end.toLocaleDateString("pt-BR")}`],
      ["Data de Exportação:", new Date().toLocaleString("pt-BR")],
      [""],
      ["Indicador", "Valor"],
      ["Total de CNHs no Acervo Geral", estatisticasPeriodo.totalGeralAcervo],
      ["CNHs Movimentadas no Período", estatisticasPeriodo.totalPeriodo],
      ["CNHs Recebidas (Em Gaveta)", estatisticasPeriodo.recebidas],
      ["CNHs Entregues ao Cidadão", estatisticasPeriodo.entregues],
      ["CNHs Remetidas (Em Trânsito)", estatisticasPeriodo.remetidas],
      ["CNHs Pendentes de Alocação", estatisticasPeriodo.pendentes],
      ["Taxa de Eficiência de Entrega (%)", `${estatisticasPeriodo.taxaEntrega}%`],
      ["Memorandos Expedidos", estatisticasPeriodo.totalMemosPeriodo],
      ["Entregas Efetuadas Hoje", estatisticasHoje.cnhsEntreguesHoje],
      ["Consultas no App do Cidadão", logsCidadaoPeriodo.length]
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo Executivo");

    // Planilha 2: CNHs no Período
    const cnhsExport = cnhsFiltradasPeriodo.map((c) => ({
      Ordem: c.ordem,
      Titular: c.nome,
      CPF: formatCPF(c.cpf),
      Situacao: c.situacao,
      Reparticao: c.reparticao,
      Gaveta: c.gaveta,
      Responsavel_Retirante: c.responsavel_nome || "Titular",
      Memorando: c.memorando_numero || "",
      Data_Movimento: c.data_movimento ? new Date(c.data_movimento).toLocaleDateString("pt-BR") : "",
      Servidor: c.usuario_nome || ""
    }));
    const wsCnhs = XLSX.utils.json_to_sheet(cnhsExport);
    XLSX.utils.book_append_sheet(wb, wsCnhs, "CNHs Movimentadas");

    // Planilha 3: Memorandos
    const memosExport = memorandosPeriodo.map((m) => ({
      Numero_Memorando: m.numero,
      Remessa: m.remessa || "",
      Status: m.status,
      Quantidade_Candidatos: m.candidatos_count || 0,
      Servidor_Elaborador: m.usuario_nome || "",
      Data_Expedicao: formatDateTime(m.created_at)
    }));
    const wsMemos = XLSX.utils.json_to_sheet(memosExport);
    XLSX.utils.book_append_sheet(wb, wsMemos, "Memorandos");

    XLSX.writeFile(wb, `Relatorio_Setorial_DETRAN_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Gerando estatísticas e relatórios setoriais...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* CABAÇALHO DA PÁGINA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Relatórios Setoriais & Estatísticas DETRAN
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Painel analítico de movimentação de CNHs, expedição de memorandos, atendimentos diários e exportação em PDF.
              </p>
            </div>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO PRINCIPAIS */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handlePrintPDF}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir Relatório (PDF)
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel (.xlsx)
          </button>

          <button
            onClick={loadData}
            title="Recarregar Dados"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* BARRA DE FILTROS E SELEÇÃO DE PERÍODO */}
      <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-600" />
            Filtragem por Período & Setor
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Período Ativo: <strong className="text-slate-700 dark:text-slate-200">{dateRange.start.toLocaleDateString("pt-BR")}</strong> até <strong className="text-slate-700 dark:text-slate-200">{dateRange.end.toLocaleDateString("pt-BR")}</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Seletor de Período Pré-definido */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Período de Análise
            </label>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as PeriodoTipo)}
              className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="hoje">Hoje (Dia Atual)</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="mes_atual">Mês Atual</option>
              <option value="ano_atual">Ano Atual</option>
              <option value="custom">Período Customizado...</option>
            </select>
          </div>

          {/* Repartição / Posto Setorial */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Repartição / Setor
            </label>
            <select
              value={reparticaoFiltro}
              onChange={(e) => setReparticaoFiltro(e.target.value)}
              className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todas">Todas as Repartições</option>
              <option value="DETRAN Central - Sede">DETRAN Central - Sede</option>
              <option value="Posto Avançado 01 - Z. Sul">Posto Avançado 01 - Z. Sul</option>
              <option value="Posto Avançado 02 - Z. Norte">Posto Avançado 02 - Z. Norte</option>
            </select>
          </div>

          {/* Filtro por Situação da CNH */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Situação da CNH
            </label>
            <select
              value={situacaoFiltro}
              onChange={(e) => setSituacaoFiltro(e.target.value)}
              className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todas">Todas as Situações</option>
              <option value="Recebida">Recebida (Em Gaveta)</option>
              <option value="Entregue">Entregue ao Cidadão</option>
              <option value="Remetida">Remetida (Em Trânsito)</option>
              <option value="Pendente">Pendente de Alocação</option>
            </select>
          </div>

          {/* Busca Rápida por Nome / CPF */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Buscar Titular / CPF / Memo
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nome, CPF ou memorando..."
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Inputs de Data Customizada */}
        {periodo === "custom" && (
          <div className="pt-2 flex flex-wrap items-center gap-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Data Inicial:</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Data Final:</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        )}
      </div>

      {/* SEÇÃO 1: INDICADORES DIÁRIOS & RESUMO EXECUTIVO DO SISTEMA */}
      <div>
        <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          Números Diários & Produção Executiva
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Entregas Hoje */}
          <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Entregues Hoje</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {estatisticasHoje.cnhsEntreguesHoje}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center">
                <ArrowUpRight className="w-3 h-3" /> Hoje
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Atendimentos concluídos</p>
          </div>

          {/* Card 2: Entradas Hoje */}
          <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Entradas Hoje</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
                <Inbox className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {estatisticasHoje.cnhsRecebidasHoje}
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold flex items-center">
                <ArrowUpRight className="w-3 h-3" /> Recebidas
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Gavetas atualizadas</p>
          </div>

          {/* Card 3: Memorandos no Período */}
          <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Memorandos Emitidos</span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {estatisticasPeriodo.totalMemosPeriodo}
              </span>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                ({estatisticasPeriodo.totalCandidatosEmMemos} CNHs)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Remessas oficiais</p>
          </div>

          {/* Card 4: Consultas App Cidadão */}
          <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Consultas Cidadão</span>
              <div className="p-2 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-xl">
                <Smartphone className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {logsCidadaoPeriodo.length}
              </span>
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                {estatisticasHoje.consultasHoje} hoje
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Pesquisas via app/portal</p>
          </div>

          {/* Card 5: Taxa de Resolução */}
          <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Taxa de Entrega</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {estatisticasPeriodo.taxaEntrega}%
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                do total filtrado
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, estatisticasPeriodo.taxaEntrega)}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: MOVIMENTAÇÃO DE CNHs POR SITUAÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Donut por Situação */}
        <div className="bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-blue-600" />
                Movimentação por Situação
              </h3>
              <span className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 rounded-md font-semibold">
                {estatisticasPeriodo.totalPeriodo} CNHs
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Proporção das Carteiras Nacionais de Habilitação na amostra selecionada.
            </p>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pizzaData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pizzaData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [`${value} CNHs`, "Quantidade"]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", color: "#fff", fontSize: "12px", border: "none" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legenda Detalhada por Situação */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Recebidas (Em Gaveta)
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{estatisticasPeriodo.recebidas}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Entregues ao Cidadão
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{estatisticasPeriodo.entregues}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Remetidas (Em Trânsito)
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{estatisticasPeriodo.remetidas}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Pendentes Alocação
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{estatisticasPeriodo.pendentes}</span>
            </div>
          </div>
        </div>

        {/* Evolução Diária (Área / Linha) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Fluxo Diário de Movimentação (Recebimentos x Entregas)
              </h3>
              <span className="text-[10px] text-slate-400">Datas da amostragem</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Comparativo diário de CNHs arquivadas em gaveta vs CNHs entregues aos titulares no período.
            </p>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="colorRecebidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorEntregues" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#33415522" />
                  <XAxis dataKey="data" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", color: "#fff", fontSize: "11px", border: "none" }} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  <Area type="monotone" dataKey="recebidas" name="Recebidas em Gaveta" stroke="#2563eb" fillOpacity={1} fill="url(#colorRecebidas)" strokeWidth={2} />
                  <Area type="monotone" dataKey="entregues" name="Entregues ao Cidadão" stroke="#059669" fillOpacity={1} fill="url(#colorEntregues)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 3: RELATÓRIO SETORIAL DE MEMORANDOS E REMESSAS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-600" />
              Relatório Setorial de Memorandos Expedidos ({memorandosPeriodo.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Histórico de remessas confeccionadas e candidatos encaminhados no período.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-xl">
              {estatisticasPeriodo.totalCandidatosEmMemos} Candidatos Processados
            </span>
          </div>
        </div>

        {memorandosPeriodo.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum memorando foi expedido no período selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Nº Memorando</th>
                  <th className="px-4 py-3">Remessa</th>
                  <th className="px-4 py-3">Elaborado Em</th>
                  <th className="px-4 py-3">Servidor Autor</th>
                  <th className="px-4 py-3 text-center">Nº Candidatos</th>
                  <th className="px-4 py-3 text-right">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {memorandosPeriodo.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      {m.numero}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {m.remessa || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(m.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                      {m.usuario_nome || "Servidor DETRAN"}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-purple-600 dark:text-purple-400">
                      {m.candidatos_count || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        m.status === "Remetido" 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800" 
                          : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                      }`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SEÇÃO 4: RANKING DE RETIRANTES E ESTATÍSTICAS SECUNDÁRIAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Retirantes / Despachantes / CFCs */}
        <div className="bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-1 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            Principais Retirantes / CFCs / Despachantes no Período
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Responsáveis credenciados que mais efetuaram retiradas de CNHs no balcão.
          </p>

          {topResponsaveis.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Nenhuma entrega registrada para responsáveis cadastrados no período.
            </div>
          ) : (
            <div className="space-y-3">
              {topResponsaveis.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {item.nome}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white px-2.5 py-1 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                    {item.count} CNH(s)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Volume por Repartição / Setor */}
        <div className="bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-1 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            Distribuição por Repartição Físicas
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Volume de CNHs arquivadas ou processadas por unidade setorial.
          </p>

          <div className="space-y-3">
            {reparticoesStats.map((rep, idx) => {
              const pct = estatisticasPeriodo.totalPeriodo > 0 ? Math.round((rep.total / estatisticasPeriodo.totalPeriodo) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-700 dark:text-slate-300">{rep.name}</span>
                    <span className="text-slate-900 dark:text-white font-bold">{rep.total} CNHs ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SEÇÃO 5: DETALHAMENTO ANALÍTICO DA MOVIMENTAÇÃO (LISTAGEM) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              Listagem de Movimentações Registradas ({cnhsFiltradasPeriodo.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Relação nominal individualizada conforme os filtros de período e setor aplicados.
            </p>
          </div>
        </div>

        {cnhsFiltradasPeriodo.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhuma CNH encontrada com os filtros de período e busca informados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Ordem</th>
                  <th className="px-4 py-3">Titular da CNH</th>
                  <th className="px-4 py-3">CPF</th>
                  <th className="px-4 py-3">Repartição / Gaveta</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Responsável Retirante</th>
                  <th className="px-4 py-3 text-right">Data Movimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cnhsFiltradasPeriodo.slice(0, 100).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      #{c.ordem || "-"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {c.nome}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {formatCPF(c.cpf)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {c.reparticao || "DETRAN Sede"} • Gaveta <strong className="text-slate-800 dark:text-slate-200">{c.gaveta || "-"}</strong>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                        c.situacao === "Entregue"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : c.situacao === "Recebida"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : c.situacao === "Remetida"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                      }`}>
                        {c.situacao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {c.responsavel_nome || "Titular Direto"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 font-mono">
                      {c.data_movimento ? new Date(c.data_movimento).toLocaleDateString("pt-BR") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cnhsFiltradasPeriodo.length > 100 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800">
                Exibindo os primeiros 100 de {cnhsFiltradasPeriodo.length} registros. Use a opção de Impressão PDF ou Exportar Excel para ver a relação completa.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
