import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  Users, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Phone, 
  ShieldAlert, 
  CheckCircle2, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Award, 
  Layers, 
  Eye, 
  Copy, 
  Check, 
  X, 
  ExternalLink, 
  RefreshCw,
  FolderCheck,
  Building2,
  Share2,
  Calendar,
  Clock,
  IdCard
} from "lucide-react";
import { Responsavel, ResponsavelSchema, GeralCNH } from "../types";
import { 
  getResponsaveis, 
  createResponsavel, 
  updateResponsavel, 
  deleteResponsavel, 
  getGeralCNHs 
} from "../services/db";
import { subscribeToSupabaseRealtime } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { 
  formatCPF, 
  formatPhone, 
  formatDate, 
  formatDateTime, 
  normalizeSearch, 
  matchDigitsSafe 
} from "../lib/utils";
import { getOrgaoConfig } from "../services/orgaoService";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

type StatusFilterTipo = "todos" | "com_registro" | "com_telefone" | "com_retiradas" | "com_observacao" | "proprietario";

export const ResponsaveisPage: React.FC = () => {
  const { user, canEdit } = useAuth();
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [cnhs, setCnhs] = useState<GeralCNH[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterTipo>("todos");
  
  // Modal de Detalhes / Ficha
  const [selectedDetailResp, setSelectedDetailResp] = useState<Responsavel | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Modal de Cadastro/Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Responsavel | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isFetchingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Form State
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [registro, setRegistro] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchDados = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isInitial) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const [dataResp, dataCnhs] = await Promise.all([
        getResponsaveis(),
        getGeralCNHs()
      ]);
      setResponsaveis(dataResp || []);
      setCnhs(dataCnhs || []);
    } catch (err) {
      console.error("Erro ao buscar responsáveis e CNHs:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, []);

  const scheduleFetch = useCallback((delayMs: number = 300) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchDados(false);
    }, delayMs);
  }, [fetchDados]);

  useEffect(() => {
    // 1. Carga inicial
    fetchDados(true);

    // 2. Realtime do Supabase
    const unsubRealtimeResp = subscribeToSupabaseRealtime("responsaveis", () => {
      scheduleFetch(100);
    });
    const unsubRealtimeGeral = subscribeToSupabaseRealtime("geral_cnhs", () => {
      scheduleFetch(100);
    });

    // 3. Eventos locais e sincronização
    const handleSync = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (!customEvt.detail || customEvt.detail.type === "all" || customEvt.detail.type === "responsaveis" || customEvt.detail.type === "geral") {
        scheduleFetch(100);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        scheduleFetch(200);
      }
    };

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        scheduleFetch(0);
      }
    }, 30000);

    window.addEventListener("detran_sync_updated", handleSync);
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubRealtimeResp();
      unsubRealtimeGeral();
      clearInterval(intervalId);
      window.removeEventListener("detran_sync_updated", handleSync);
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [fetchDados, scheduleFetch]);

  // Mapeamento de CNHs retiradas por Responsável
  const cnhsByResponsavelMap = useMemo(() => {
    const byId = new Map<string, GeralCNH[]>();
    const byNormName = new Map<string, GeralCNH[]>();

    cnhs.forEach((c) => {
      if (c.situacao === "Entregue") {
        if (c.responsavel_id) {
          const list = byId.get(c.responsavel_id) || [];
          list.push(c);
          byId.set(c.responsavel_id, list);
        }
        if (c.responsavel_nome) {
          const norm = normalizeSearch(c.responsavel_nome);
          const list = byNormName.get(norm) || [];
          list.push(c);
          byNormName.set(norm, list);
        }
      }
    });

    return { byId, byNormName };
  }, [cnhs]);

  const getCnhsDoResponsavel = useCallback(
    (resp: Responsavel): GeralCNH[] => {
      const byIdList = cnhsByResponsavelMap.byId.get(resp.id);
      if (byIdList && byIdList.length > 0) return byIdList;
      const norm = normalizeSearch(resp.nome);
      return cnhsByResponsavelMap.byNormName.get(norm) || [];
    },
    [cnhsByResponsavelMap]
  );

  // Métricas Superiores
  const metricas = useMemo(() => {
    const total = responsaveis.length;
    const comRegistro = responsaveis.filter((r) => r.registro && r.registro.trim().length > 0).length;
    const comTelefone = responsaveis.filter((r) => r.telefone && r.telefone.replace(/\D/g, "").length >= 8).length;
    const comObservacao = responsaveis.filter((r) => r.observacao && r.observacao.trim().length > 0).length;

    let comRetiradasCount = 0;
    let totalCnhsRetiradas = 0;

    responsaveis.forEach((r) => {
      const count = getCnhsDoResponsavel(r).length;
      if (count > 0) {
        comRetiradasCount++;
        totalCnhsRetiradas += count;
      }
    });

    return {
      total,
      comRegistro,
      percentRegistro: total > 0 ? Math.round((comRegistro / total) * 100) : 0,
      comTelefone,
      percentTelefone: total > 0 ? Math.round((comTelefone / total) * 100) : 0,
      comRetiradasCount,
      percentRetiradas: total > 0 ? Math.round((comRetiradasCount / total) * 100) : 0,
      totalCnhsRetiradas,
      mediaPorAtivo: comRetiradasCount > 0 ? (totalCnhsRetiradas / comRetiradasCount).toFixed(1) : "0.0",
      comObservacao,
      percentObservacao: total > 0 ? Math.round((comObservacao / total) * 100) : 0,
    };
  }, [responsaveis, getCnhsDoResponsavel]);

  // Filtragem
  const normSearch = normalizeSearch(searchTerm);
  const filtered = useMemo(() => {
    return responsaveis.filter((r) => {
      // 1. Filtro dos cards
      if (statusFilter === "com_registro" && (!r.registro || !r.registro.trim())) {
        return false;
      }
      if (statusFilter === "com_telefone" && (!r.telefone || r.telefone.replace(/\D/g, "").length < 8)) {
        return false;
      }
      if (statusFilter === "com_retiradas") {
        const count = getCnhsDoResponsavel(r).length;
        if (count === 0) return false;
      }
      if (statusFilter === "com_observacao" && (!r.observacao || !r.observacao.trim())) {
        return false;
      }
      if (statusFilter === "proprietario") {
        const isProp = r.nome === "Proprietário" || r.nome === "PROPRIETÁRIO(A)" || r.cpf === "000.000.000-00";
        if (!isProp) return false;
      }

      // 2. Busca textual
      if (!normSearch) return true;
      const matchId = r.id.toLowerCase().includes(normSearch);
      const matchRegistro = r.registro ? r.registro.toLowerCase().includes(normSearch) : false;
      const matchNome = normalizeSearch(r.nome).includes(normSearch);
      const matchCpf = r.cpf ? (matchDigitsSafe(r.cpf, searchTerm) || r.cpf.includes(searchTerm.trim())) : false;
      const matchTel = r.telefone ? (matchDigitsSafe(r.telefone, searchTerm) || r.telefone.includes(searchTerm.trim())) : false;
      const matchObs = r.observacao ? normalizeSearch(r.observacao).includes(normSearch) : false;

      return matchId || matchRegistro || matchNome || matchCpf || matchTel || matchObs;
    });
  }, [responsaveis, statusFilter, normSearch, searchTerm, getCnhsDoResponsavel]);

  const handleOpenModal = (item?: Responsavel) => {
    setFormErrors({});
    setMessage(null);
    if (item) {
      setEditingItem(item);
      setNome(item.nome);
      setCpf(item.cpf || "");
      setRegistro(item.registro || "");
      setTelefone(item.telefone || "");
      setObservacao(item.observacao || "");
    } else {
      setEditingItem(null);
      setNome("");
      setCpf("");
      setRegistro("");
      setTelefone("");
      setObservacao("");
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormErrors({});
    setMessage(null);

    const formattedCpf = cpf ? formatCPF(cpf) : "";
    const formattedTel = telefone ? formatPhone(telefone) : "";

    const validation = ResponsavelSchema.safeParse({
      nome,
      cpf: formattedCpf,
      registro,
      telefone: formattedTel,
      observacao,
      ativo: true,
    });

    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.issues.forEach((iss) => {
        if (iss.path[0]) errs[iss.path[0].toString()] = iss.message;
      });
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await updateResponsavel(
          editingItem.id,
          { nome, cpf: formattedCpf, registro, telefone: formattedTel, observacao },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: "Responsável atualizado com sucesso!" });
      } else {
        await createResponsavel(
          { nome, cpf: formattedCpf, registro, telefone: formattedTel, observacao, ativo: true },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: "Novo responsável cadastrado com sucesso!" });
      }
      setIsModalOpen(false);
      await fetchDados();
    } catch (err: any) {
      setFormErrors({ geral: err.message || "Erro ao salvar responsável." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: Responsavel) => {
    if (!user || !canEdit) return;
    if (item.nome === "Proprietário" || item.nome === "PROPRIETÁRIO(A)" || item.cpf === "000.000.000-00") {
      alert("⚠️ Ação não permitida: O registro padrão Proprietário não pode ser excluído.");
      return;
    }
    if (confirm(`Deseja realmente remover o responsável "${item.nome}"?`)) {
      try {
        await deleteResponsavel(item.id, user.id, user.nome_curto);
        setMessage({ type: "success", text: "Responsável excluído com sucesso!" });
        await fetchDados();
      } catch (err: any) {
        alert(err.message || "Erro ao excluir o registro.");
      }
    }
  };

  // ==========================================
  // RELATÓRIOS: PDF INSTITUCIONAL COMPLETO
  // ==========================================
  const handlePrintPDF = async () => {
    if (filtered.length === 0) {
      alert("Nenhum responsável disponível na listagem atual para gerar relatório.");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const orgao = await getOrgaoConfig();

      // Cabeçalho Institucional
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(orgao.governo || "GOVERNO DO ESTADO DO PARÁ", 14, 14);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(orgao.secretaria || "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA", 14, 19);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(orgao.orgao || orgao.sigla || "DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ", 14, 26);

      // Título do Relatório
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235); // Blue 600
      doc.text("RELATÓRIO GERAL DE RESPONSÁVEIS E PROCURADORES CREDENCIADOS (CFCs)", 14, 34);

      // Metadados
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      const dataEmissao = formatDateTime(new Date());
      const emitidoPor = user?.nome_curto || user?.nome || "Servidor do Protocolo";
      const filtroTxt = 
        statusFilter === "todos" ? "Todos os Registros" :
        statusFilter === "com_registro" ? "Com Registro / CFC" :
        statusFilter === "com_telefone" ? "Com Contato Telefônico" :
        statusFilter === "com_retiradas" ? "Com Retiradas Registradas" :
        statusFilter === "com_observacao" ? "Com Observações / Procurações" : "Proprietário";

      doc.text(
        `Emitido em: ${dataEmissao} | Responsável: ${emitidoPor} | Filtro: ${filtroTxt} | Registros Listados: ${filtered.length}`,
        14,
        40
      );

      // Bloco de Síntese Estatística (Cards no Relatório)
      autoTable(doc, {
        startY: 44,
        head: [["TOTAL CADASTRADOS", "COM REGISTRO (CFC)", "COM CONTATO", "ATIVOS NO BALCÃO", "TOTAL CNHs RETIRADAS", "MÉDIA / ATIVO"]],
        body: [[
          `${metricas.total}`,
          `${metricas.comRegistro} (${metricas.percentRegistro}%)`,
          `${metricas.comTelefone} (${metricas.percentTelefone}%)`,
          `${metricas.comRetiradasCount} (${metricas.percentRetiradas}%)`,
          `${metricas.totalCnhsRetiradas} CNHs`,
          `${metricas.mediaPorAtivo} docs`
        ]],
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          halign: "center",
          font: "helvetica",
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [71, 85, 105],
          fontStyle: "bold",
          lineWidth: 0.2,
          lineColor: [203, 213, 225],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontStyle: "bold",
          lineWidth: 0.2,
          lineColor: [203, 213, 225],
        },
        margin: { left: 14, right: 14 }
      });

      // Tabela Principal de Responsáveis
      const startTableY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 6 : 56;

      const tableRows = filtered.map((r, idx) => {
        const cnhsCount = getCnhsDoResponsavel(r).length;
        return [
          (idx + 1).toString(),
          r.nome + (r.nome === "Proprietário" ? " (Padrão)" : ""),
          r.registro || "—",
          r.cpf || "—",
          r.telefone || "—",
          cnhsCount > 0 ? `${cnhsCount} retirada(s)` : "Nenhuma",
          r.observacao || "—",
          formatDate(r.created_at)
        ];
      });

      autoTable(doc, {
        startY: startTableY,
        head: [["#", "NOME COMPLETO / INSTITUIÇÃO", "REGISTRO", "CPF / CNPJ", "TELEFONE", "CNHs RETIRADAS", "OBSERVAÇÕES / PROCURAÇÕES", "CADASTRO"]],
        body: tableRows,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: "linebreak",
          valign: "middle"
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 7.5,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 55, fontStyle: "bold" },
          2: { cellWidth: 24, fontStyle: "bold" },
          3: { cellWidth: 32 },
          4: { cellWidth: 30 },
          5: { cellWidth: 26, halign: "center", fontStyle: "bold" },
          6: { cellWidth: 62 },
          7: { cellWidth: 20, halign: "center" },
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
          // Rodapé oficial
          const pageCount = (doc.internal as any).getNumberOfPages();
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(148, 163, 184);
          doc.text(
            `${orgao.orgao || "DETRAN"} • Sistema de Controle e Rastreabilidade de CNHs • Página ${data.pageNumber} de ${pageCount}`,
            14,
            202
          );
        }
      });

      const fileName = `Responsaveis_DETRAN_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(fileName);
    } catch (e) {
      console.error("Erro ao gerar PDF:", e);
      alert("Houve uma falha ao gerar o PDF. Verifique o console.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ==========================================
  // RELATÓRIO INDIVIDUAL: FICHA DO RESPONSÁVEL
  // ==========================================
  const handlePrintFichaIndividualPDF = async (resp: Responsavel) => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const orgao = await getOrgaoConfig();
      const cnhsResp = getCnhsDoResponsavel(resp);

      // Cabeçalho Institucional
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(orgao.governo || "GOVERNO DO ESTADO DO PARÁ", 14, 15);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(orgao.secretaria || "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA", 14, 20);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(orgao.orgao || orgao.sigla || "DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ", 14, 27);

      doc.setFontSize(13);
      doc.setTextColor(37, 99, 235);
      doc.text("FICHA CADASTRAL DO RESPONSÁVEL / PROCURADOR CREDENCIADO", 14, 36);

      // Dados Cadastrais
      autoTable(doc, {
        startY: 42,
        head: [["CAMPO", "INFORMAÇÃO REGISTRADA NO SISTEMA"]],
        body: [
          ["Nome Completo / Razão Social", resp.nome],
          ["Registro / Matrícula DETRAN (CFC)", resp.registro || "Não informado / Sem registro"],
          ["CPF / CNPJ", resp.cpf || "Não informado"],
          ["Telefone / WhatsApp", resp.telefone || "Não informado"],
          ["Data do Cadastro", formatDateTime(resp.created_at)],
          ["Total de CNHs Retiradas", `${cnhsResp.length} documento(s) retirado(s)`],
          ["Observações / Procurações", resp.observacao || "Nenhuma observação informada."]
        ],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: "bold", fillColor: [248, 250, 252] },
          1: { cellWidth: 127 }
        },
        margin: { left: 14, right: 14 }
      });

      // Tabela de CNHs Retiradas por este responsável
      let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 95;

      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`HISTÓRICO DE CNHs RETIRADAS NO PROTOCOLO (${cnhsResp.length})`, 14, currentY);
      currentY += 4;

      if (cnhsResp.length === 0) {
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 116, 139);
        doc.text("Nenhuma CNH foi registrada como retirada por este responsável até o momento.", 14, currentY + 4);
      } else {
        const cnhsTableRows = cnhsResp.map((c, idx) => [
          (idx + 1).toString(),
          c.nome,
          formatCPF(c.cpf),
          c.pa || "—",
          c.gaveta ? `${c.gaveta} / ${c.reparticao || ""}` : "—",
          c.data_movimento ? formatDateTime(c.data_movimento) : "—",
          c.usuario_nome || "Servidor"
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["#", "TITULAR DA CNH", "CPF", "PA", "LOCALIZAÇÃO", "DATA RETIRADA", "SERVIDOR"]],
          body: cnhsTableRows,
          styles: { fontSize: 7.5, cellPadding: 2 },
          headStyles: { fillColor: [71, 85, 105], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 }
        });
      }

      const endY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 16 : currentY + 25;

      // Bloco de Assinatura se couber na página
      if (endY < 250) {
        doc.setDrawColor(203, 213, 225);
        doc.line(14, endY + 15, 95, endY + 15);
        doc.line(115, endY + 15, 196, endY + 15);

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text("Assinatura do Responsável / Procurador", 14, endY + 19);
        doc.text("Servidor do Protocolo DETRAN", 115, endY + 19);
      }

      const safeName = resp.nome.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
      doc.save(`Ficha_Responsavel_${safeName}.pdf`);
    } catch (e) {
      console.error("Erro ao gerar ficha individual:", e);
      alert("Não foi possível gerar a ficha individual em PDF.");
    }
  };

  // Exportar Excel (.xlsx)
  const handleExportExcel = () => {
    if (filtered.length === 0) return;

    const dataToExport = filtered.map((r, idx) => {
      const cnhsCount = getCnhsDoResponsavel(r).length;
      return {
        "#": idx + 1,
        "Nome Completo / Instituição": r.nome,
        "Registro / Matrícula (CFC)": r.registro || "—",
        "CPF / CNPJ": r.cpf ? formatCPF(r.cpf) : "—",
        "Telefone": r.telefone ? formatPhone(r.telefone) : "—",
        "CNHs Retiradas (Qtd)": cnhsCount,
        "Observações / Procurações": r.observacao || "—",
        "Data de Cadastro": formatDateTime(r.created_at)
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Responsaveis");
    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Responsaveis_DETRAN_${dateStr}.xlsx`);
  };

  // Exportar CSV
  const handleExportCSV = () => {
    if (filtered.length === 0) return;

    const headers = [
      "Item",
      "Nome",
      "Registro",
      "CPF_CNPJ",
      "Telefone",
      "CNHs_Retiradas",
      "Observacoes",
      "Data_Cadastro"
    ];

    const rows = filtered.map((r, idx) => {
      const cnhsCount = getCnhsDoResponsavel(r).length;
      return [
        (idx + 1).toString(),
        `"${r.nome.replace(/"/g, '""')}"`,
        `"${(r.registro || "").replace(/"/g, '""')}"`,
        `"${(r.cpf ? formatCPF(r.cpf) : "").replace(/"/g, '""')}"`,
        `"${(r.telefone ? formatPhone(r.telefone) : "").replace(/"/g, '""')}"`,
        cnhsCount.toString(),
        `"${(r.observacao || "").replace(/"/g, '""')}"`,
        `"${formatDateTime(r.created_at)}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((e) => e.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `Responsaveis_DETRAN_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copiar Ficha em Texto para WhatsApp
  const handleCopyFichaText = (resp: Responsavel) => {
    const cnhsResp = getCnhsDoResponsavel(resp);
    const txt = [
      `*DETRAN - FICHA DE RESPONSÁVEL / PROCURADOR*`,
      `👤 *Nome:* ${resp.nome}`,
      resp.registro ? `🏛️ *Registro/CFC:* ${resp.registro}` : null,
      resp.cpf ? `📄 *CPF/CNPJ:* ${formatCPF(resp.cpf)}` : null,
      resp.telefone ? `📞 *Telefone:* ${formatPhone(resp.telefone)}` : null,
      `📁 *CNHs Retiradas:* ${cnhsResp.length} documento(s)`,
      resp.observacao ? `📝 *Observação:* ${resp.observacao}` : null,
      `📅 *Data Cadastro:* ${formatDateTime(resp.created_at)}`
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(txt).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Cadastro de Responsáveis e Procuradores (CFCs)</span>
                {isRefreshing && (
                  <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Controle de pessoas, despachantes e autoescolas autorizados a retirar CNHs no balcão de atendimento.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação Superiores: Exportações e Cadastro */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Exportar PDF */}
          <button
            id="btn-export-pdf-responsaveis"
            onClick={handlePrintPDF}
            disabled={isGeneratingPDF || filtered.length === 0}
            title="Emitir Relatório Geral Oficial em PDF"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>{isGeneratingPDF ? "Gerando PDF..." : "Emitir Relatório PDF"}</span>
          </button>

          {/* Exportar Excel */}
          <button
            id="btn-export-excel-responsaveis"
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            title="Exportar para planilha Excel (.xlsx)"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Excel</span>
          </button>

          {/* Exportar CSV */}
          <button
            id="btn-export-csv-responsaveis"
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            title="Exportar dados em formato CSV"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>

          {/* Recarregar */}
          <button
            id="btn-refresh-responsaveis"
            onClick={() => fetchDados(false)}
            disabled={loading || isRefreshing}
            title="Sincronizar e atualizar lista de responsáveis"
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Novo Responsável */}
          {canEdit && (
            <button
              id="btn-novo-responsavel"
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Responsável</span>
            </button>
          )}
        </div>
      </div>

      {/* CARDS DE MÉTRICAS SUPERIORES (6 CARDS INTERATIVOS) */}
      <div id="responsaveis-metrics-cards" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Total Geral */}
        <div
          id="metric-card-total-responsaveis"
          onClick={() => setStatusFilter("todos")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "todos"
              ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 shadow-sm ring-2 ring-blue-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Geral
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.total}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Despachantes e CFCs</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">100%</span>
          </div>
        </div>

        {/* Card 2: Com Registro / Credencial CFC */}
        <div
          id="metric-card-com-registro"
          onClick={() => setStatusFilter((prev) => (prev === "com_registro" ? "todos" : "com_registro"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "com_registro"
              ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm ring-2 ring-indigo-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Com Registro
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.comRegistro}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Credenciados CFC</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{metricas.percentRegistro}%</span>
          </div>
        </div>

        {/* Card 3: Com Contato Telefônico */}
        <div
          id="metric-card-com-telefone"
          onClick={() => setStatusFilter((prev) => (prev === "com_telefone" ? "todos" : "com_telefone"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "com_telefone"
              ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 shadow-sm ring-2 ring-emerald-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Com Contato
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
              <Phone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.comTelefone}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Telefone cadastrado</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{metricas.percentTelefone}%</span>
          </div>
        </div>

        {/* Card 4: Ativos no Balcão (Com Retiradas) */}
        <div
          id="metric-card-ativos-balcao"
          onClick={() => setStatusFilter((prev) => (prev === "com_retiradas" ? "todos" : "com_retiradas"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "com_retiradas"
              ? "bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 shadow-sm ring-2 ring-purple-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ativos Balcão
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 flex items-center justify-center">
              <FolderCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.comRetiradasCount}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Com retiradas no geral</span>
            <span className="font-bold text-purple-600 dark:text-purple-400">{metricas.percentRetiradas}%</span>
          </div>
        </div>

        {/* Card 5: Total de CNHs Retiradas */}
        <div
          id="metric-card-total-cnhs-retiradas"
          onClick={() => setStatusFilter((prev) => (prev === "com_retiradas" ? "todos" : "com_retiradas"))}
          className="p-4 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 transition-all cursor-pointer relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              CNHs Retiradas
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.totalCnhsRetiradas}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Média: {metricas.mediaPorAtivo} / resp.</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">Total</span>
          </div>
        </div>

        {/* Card 6: Com Observações / Procurações */}
        <div
          id="metric-card-com-observacoes"
          onClick={() => setStatusFilter((prev) => (prev === "com_observacao" ? "todos" : "com_observacao"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "com_observacao"
              ? "bg-teal-50/80 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 shadow-sm ring-2 ring-teal-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Observações
            </span>
            <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-300 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.comObservacao}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Instruções registradas</span>
            <span className="font-bold text-teal-600 dark:text-teal-400">{metricas.percentObservacao}%</span>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-center gap-2 animate-fadeIn border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* BARRA DE FILTROS E PESQUISA */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 w-full">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-busca-responsaveis"
              type="text"
              placeholder="Pesquisar por Nome, CPF, Registro, Telefone ou Observação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Seletor de Categoria / Filtro */}
          <div className="hidden sm:block">
            <select
              id="select-categoria-responsavel"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterTipo)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            >
              <option value="todos">Todos os Responsáveis ({responsaveis.length})</option>
              <option value="com_registro">Com Registro / CFC ({metricas.comRegistro})</option>
              <option value="com_telefone">Com Contato Telefônico ({metricas.comTelefone})</option>
              <option value="com_retiradas">Ativos no Balcão / Com Retiradas ({metricas.comRetiradasCount})</option>
              <option value="com_observacao">Com Observações / Procurações ({metricas.comObservacao})</option>
              <option value="proprietario">Apenas Proprietário Padrão</option>
            </select>
          </div>
        </div>

        {/* Indicador de Filtro Ativo e Quantidade */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 w-full sm:w-auto justify-between sm:justify-end">
          {statusFilter !== "todos" && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 font-semibold text-[11px]">
              <span>
                Filtro:{" "}
                {statusFilter === "com_registro" ? "Com Registro" :
                 statusFilter === "com_telefone" ? "Com Telefone" :
                 statusFilter === "com_retiradas" ? "Com Retiradas" :
                 statusFilter === "com_observacao" ? "Com Observações" : "Proprietário"}
              </span>
              <button
                id="btn-limpar-filtro-ativo"
                onClick={() => setStatusFilter("todos")}
                className="hover:text-blue-900 dark:hover:text-blue-100 cursor-pointer"
                title="Limpar filtro"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <span className="font-medium">
            Exibindo <strong className="text-slate-900 dark:text-white">{filtered.length}</strong> de {responsaveis.length}
          </span>
        </div>
      </div>

      {/* TABELA DE RESPONSÁVEIS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
            Carregando responsáveis e registros do protocolo...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            Nenhum responsável encontrado com os critérios de busca selecionados.
            {statusFilter !== "todos" && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    setStatusFilter("todos");
                    setSearchTerm("");
                  }}
                  className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-6">Nome Completo / Instituição</th>
                  <th className="py-3.5 px-4">Registro / CFC</th>
                  <th className="py-3.5 px-4">CPF / CNPJ</th>
                  <th className="py-3.5 px-4">Telefone</th>
                  <th className="py-3.5 px-4 text-center">CNHs Retiradas</th>
                  <th className="py-3.5 px-6">Observações / Procurações</th>
                  <th className="py-3.5 px-4 text-center w-28">Cadastro</th>
                  <th className="py-3.5 px-6 text-right w-36">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filtered.map((r, index) => {
                  const isProprietario = r.nome === "Proprietário" || r.nome === "PROPRIETÁRIO(A)" || r.cpf === "000.000.000-00";
                  const cnhsResp = getCnhsDoResponsavel(r);
                  const totalRetiradas = cnhsResp.length;

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Numeração */}
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      {/* Nome / Instituição */}
                      <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="hover:text-blue-600 transition-colors">
                            {r.nome}
                          </span>
                          {isProprietario && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              Padrão Titular
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Registro / CFC */}
                      <td className="py-3.5 px-4">
                        {r.registro ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-md font-mono text-[11px] font-bold">
                            <Award className="w-3 h-3" />
                            {r.registro}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* CPF / CNPJ */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {r.cpf ? formatCPF(r.cpf) : "—"}
                      </td>

                      {/* Telefone */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {r.telefone ? (
                          <a
                            href={`https://wa.me/55${r.telefone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-mono text-[11px]"
                            title="Abrir WhatsApp"
                          >
                            <Phone className="w-3 h-3" />
                            {formatPhone(r.telefone)}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* CNHs Retiradas */}
                      <td className="py-3.5 px-4 text-center">
                        {totalRetiradas > 0 ? (
                          <button
                            onClick={() => setSelectedDetailResp(r)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            title="Clique para ver o histórico das CNHs retiradas"
                          >
                            <Layers className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                            <span>{totalRetiradas}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">0</span>
                        )}
                      </td>

                      {/* Observações */}
                      <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={r.observacao || ""}>
                        {r.observacao || "—"}
                      </td>

                      {/* Data de Cadastro */}
                      <td className="py-3.5 px-4 text-center text-slate-500 text-[11px]">
                        {formatDate(r.created_at)}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Visualizar Detalhes / Ficha */}
                          <button
                            id={`btn-detalhes-resp-${r.id}`}
                            onClick={() => setSelectedDetailResp(r)}
                            title="Ver ficha cadastral e histórico"
                            className="p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Baixar Ficha Individual em PDF */}
                          <button
                            id={`btn-pdf-resp-${r.id}`}
                            onClick={() => handlePrintFichaIndividualPDF(r)}
                            title="Emitir Ficha Individual em PDF"
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Editar */}
                          {canEdit && (
                            <button
                              id={`btn-editar-resp-${r.id}`}
                              onClick={() => handleOpenModal(r)}
                              title="Editar dados cadastrais"
                              disabled={isProprietario}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Excluir */}
                          {canEdit && (
                            <button
                              id={`btn-excluir-resp-${r.id}`}
                              onClick={() => handleDelete(r)}
                              title="Excluir responsável"
                              disabled={isProprietario}
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE DETALHES / FICHA DO RESPONSÁVEL */}
      {selectedDetailResp && (
        <Modal
          isOpen={Boolean(selectedDetailResp)}
          onClose={() => setSelectedDetailResp(null)}
          title="Ficha Cadastral do Responsável / Procurador"
          maxWidth="2xl"
        >
          <div className="space-y-5">
            {/* Cabeçalho do Responsável */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-lg">
                  {selectedDetailResp.nome.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedDetailResp.nome}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {selectedDetailResp.registro && (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-md text-[11px] font-mono font-bold">
                        Reg: {selectedDetailResp.registro}
                      </span>
                    )}
                    {selectedDetailResp.cpf && (
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        CPF: {formatCPF(selectedDetailResp.cpf)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Ações da Ficha */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleCopyFichaText(selectedDetailResp)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-all cursor-pointer"
                  title="Copiar dados para o WhatsApp"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedText ? "Copiado!" : "Copiar Texto"}</span>
                </button>

                <button
                  onClick={() => handlePrintFichaIndividualPDF(selectedDetailResp)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-all cursor-pointer"
                  title="Baixar Ficha Cadastral em PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Baixar Ficha PDF</span>
                </button>
              </div>
            </div>

            {/* Metadados Cadastrais em Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Telefone de Contato</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                  {selectedDetailResp.telefone ? formatPhone(selectedDetailResp.telefone) : "Não informado"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Data de Cadastro</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                  {formatDateTime(selectedDetailResp.created_at)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Total CNHs Entregues</span>
                <span className="font-semibold text-purple-700 dark:text-purple-400 mt-0.5 block">
                  {getCnhsDoResponsavel(selectedDetailResp).length} documento(s)
                </span>
              </div>
            </div>

            {/* Observações / Procuração */}
            {selectedDetailResp.observacao && (
              <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-300 block mb-1">
                  Observações e Portarias Registradas:
                </span>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedDetailResp.observacao}
                </p>
              </div>
            )}

            {/* Histórico de CNHs Retiradas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-600" />
                  <span>CNHs Retiradas no Protocolo ({getCnhsDoResponsavel(selectedDetailResp).length})</span>
                </h4>
              </div>

              {getCnhsDoResponsavel(selectedDetailResp).length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  Nenhuma CNH foi registrada como retirada por este responsável até o momento.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-500 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Titular</th>
                        <th className="py-2.5 px-3">CPF</th>
                        <th className="py-2.5 px-3">PA</th>
                        <th className="py-2.5 px-3">Localização</th>
                        <th className="py-2.5 px-3 text-right">Data Entrega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {getCnhsDoResponsavel(selectedDetailResp).map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                            {c.nome}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-500">
                            {formatCPF(c.cpf)}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">
                            {c.pa || "—"}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {c.gaveta ? `${c.gaveta} / ${c.reparticao || ""}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500 text-[11px]">
                            {c.data_movimento ? formatDate(c.data_movimento) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Fechar */}
            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setSelectedDetailResp(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Fechar Ficha
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? "Editar Responsável / Despachante" : "Cadastrar Novo Responsável"}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formErrors.geral && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-300 font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{formErrors.geral}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo ou Razão Social <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Dr. Carlos Mendes ou CFC Transito Seguro"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            />
            {formErrors.nome && <p className="text-[11px] text-rose-500 mt-1">{formErrors.nome}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Registro / Matrícula (CFC)
              </label>
              <input
                type="text"
                value={registro}
                onChange={(e) => setRegistro(e.target.value)}
                placeholder="ex: 1522"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CPF ou CNPJ
              </label>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                maxLength={18}
                disabled={editingItem?.nome === "Proprietário" || editingItem?.nome === "PROPRIETÁRIO(A)"}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all disabled:opacity-50"
              />
              {formErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{formErrors.cpf}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Telefone de Contato
              </label>
              <input
                type="text"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(91) 99999-9999"
                maxLength={15}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações (Procurações, autorizações, etc.)
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Informações adicionais sobre autorização de retirada no DETRAN..."
              rows={3}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Salvando..." : "Salvar Responsável"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
