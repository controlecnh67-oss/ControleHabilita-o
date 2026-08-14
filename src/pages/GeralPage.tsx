import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  FolderArchive, 
  Plus, 
  Search, 
  Download, 
  FileSpreadsheet, 
  Filter, 
  ArrowUpDown, 
  ArrowUp,
  ArrowDown,
  Inbox, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Users, 
  Phone, 
  MapPin, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert, 
  Edit2, 
  RefreshCw,
  X,
  Printer,
  Columns,
  Upload,
  FileText,
  Building2,
  Eye,
  Trash2,
  QrCode,
  Smartphone,
  MessageSquare,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrgaoConfig, addPDFHeaderLogo } from "../services/orgaoService";
import { GeralCNH, Responsavel, SituacaoGeral, CadastroManualCNHSchema, EntregaCNHSchema, ResponsavelSchema } from "../types";
import { sendWhatsAppMessageAPI, buildWhatsAppWebUrl } from "../services/whatsappService";
import { 
  getGeralCNHs, 
  createGeralManual, 
  receberCNH, 
  entregarCNH, 
  updateGeralCNH, 
  deleteGeralCNH,
  deleteMultipleGeralCNHs,
  getResponsaveis, 
  createResponsavel,
  importSpreadsheetData,
  getPublicSearchCount
} from "../services/db";
import { subscribeSyncStatus, syncGeralWithSupabase, SyncStats } from "../services/dexieDb";
import { getPublicShareUrl } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { formatCPF, formatPhone, formatDateTime, normalizeSearch, matchDigitsSafe } from "../lib/utils";

// Helper para exibir Gaveta e Repartição de forma compacta (apenas número/código) na tabela
const cleanGavetaText = (text?: string) => {
  if (!text) return "";
  const cleaned = text.replace(/^gaveta\s*/i, "").trim();
  return cleaned || text;
};

const cleanReparticaoText = (text?: string) => {
  if (!text) return "";
  const cleaned = text.replace(/^repartição\s*/i, "").replace(/^reparticao\s*/i, "").trim();
  return cleaned || text;
};

export const GeralPage: React.FC = () => {
  const { user, canEdit } = useAuth();
  const [cnhs, setCnhs] = useState<GeralCNH[]>([]);
  const [loading, setLoading] = useState(true);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);

  // Estado da Sincronização do IndexedDB (Dexie)
  const [syncStats, setSyncStats] = useState<SyncStats>({
    status: "synced",
    lastSyncAt: null,
    totalRecords: 0,
    syncDurationMs: 0,
    isOffline: false
  });
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  
  // Filtros e Busca Instantânea
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<string>("todas");
  const [filtroOrdemInicial, setFiltroOrdemInicial] = useState<string>("");
  const [filtroOrdemFinal, setFiltroOrdemFinal] = useState<string>("");
  
  // Controle de visibilidade das colunas
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [quickEditMode, setQuickEditMode] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    ordem: true,
    nome: true,
    cpf: true,
    telefone: false,
    gaveta: true,
    reparticao: true,
    situacao: true,
    responsavel: false,
    data_movimento: false,
    usuario: false,
    observacao: false,
    whatsapp: true,
    wasender_direct: false,
    acoes: true,
  });

  // Ordenação
  const [sortColumn, setSortColumn] = useState<keyof GeralCNH>("ordem");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Paginação - Padrão 100 por página conforme especificação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);

  // Feedback Message
  const [message, setMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);

  // Modal Impressão PDF
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Modal 1: Cadastro Manual
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualNome, setManualNome] = useState("");
  const [manualCpf, setManualCpf] = useState("");
  const [manualSituacao, setManualSituacao] = useState<SituacaoGeral>("Recebida");
  const [manualObservacao, setManualObservacao] = useState("");
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);
  const [submittingManual, setSubmittingManual] = useState(false);

  // Modal 2: Entrega de CNH
  const [isEntregaModalOpen, setIsEntregaModalOpen] = useState(false);
  const [selectedCNHForEntrega, setSelectedCNHForEntrega] = useState<GeralCNH | null>(null);
  const [tipoRetirante, setTipoRetirante] = useState<"proprietario" | "outro">("proprietario");
  const [selectedRespId, setSelectedRespId] = useState<string>("");
  const [searchRespTerm, setSearchRespTerm] = useState("");
  const [entregaObservacao, setEntregaObservacao] = useState("");
  const [submittingEntrega, setSubmittingEntrega] = useState(false);

  // Modal 3: Novo Responsável (dentro da entrega)
  const [isNewRespModalOpen, setIsNewRespModalOpen] = useState(false);
  const [newRespNome, setNewRespNome] = useState("");
  const [newRespCpf, setNewRespCpf] = useState("");
  const [newRespTelefone, setNewRespTelefone] = useState("");
  const [newRespObs, setNewRespObs] = useState("");
  const [newRespErrors, setNewRespErrors] = useState<Record<string, string>>({});
  const [submittingNewResp, setSubmittingNewResp] = useState(false);

  // Modal 4: Editar/Alterar CNH (ou marcar Pendente)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCNH, setEditingCNH] = useState<GeralCNH | null>(null);
  const [editSituacao, setEditSituacao] = useState<SituacaoGeral>("Remetida");
  const [editGaveta, setEditGaveta] = useState("");
  const [editReparticao, setEditReparticao] = useState("");
  const [editObs, setEditObs] = useState("");

  // Modal 6: Visualização Detalhada da CNH
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedCNHDetails, setSelectedCNHDetails] = useState<GeralCNH | null>(null);

  // Modal 7: Envio de WhatsApp Personalizado por Status (Situação)
  const [whatsappModalCNH, setWhatsappModalCNH] = useState<GeralCNH | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isSendingWhatsAppApi, setIsSendingWhatsAppApi] = useState(false);
  const [whatsappApiError, setWhatsappApiError] = useState<string | null>(null);

  // Gerador de Mensagem Personalizada do WhatsApp por Situação (Status) na Tabela Geral
  const getWhatsAppMessageForCNH = (cnh: GeralCNH) => {
    const nome = cnh.nome ? cnh.nome.split(" ")[0] : "Cidadão";
    const cpfFormatted = cnh.cpf ? formatCPF(cnh.cpf) : "";
    const ordemTag = cnh.ordem ? `#${cnh.ordem}` : "";
    const gavetaTag = cnh.gaveta ? ` (Gaveta: ${cnh.gaveta})` : "";
    const reparticaoTag = cnh.reparticao ? ` - ${cnh.reparticao}` : "";

    if (cnh.situacao === "Recebida") {
      const primeiroNome = cnh.nome ? cnh.nome.trim().split(" ")[0] : "Cidadão";
      const nomeCompleto = cnh.nome || "Não informado";
      const cpfFormatted = cnh.cpf ? formatCPF(cnh.cpf) : "Não informado";
      const ordemTag = cnh.ordem !== undefined && cnh.ordem !== null ? `#${cnh.ordem}` : "#0";
      const gavetaVal = cnh.gaveta || "Não informada";
      const reparticaoVal = cnh.reparticao || "DETRAN ITAITUBA";

      return `Olá, *${primeiroNome}*! 👋\n\nInformamos que a sua Carteira Nacional de Habilitação (CNH)  foi **RECEBIDA** e já está **disponível para retirada** no balcão de atendimento do DETRAN ITAITUBA.\n\n🪪 DADOS:\nOrdem: *${ordemTag}*\nNome: *${nomeCompleto}*\nCPF: *${cpfFormatted}*\nGaveta:*${gavetaVal}*\nRepartição: *${reparticaoVal}*\n\nHORÁRIO DE ATENDIMENTO\n⏱️09h às 15h\n\n📍 *Local:* Balcão de Atendimento DETRAN \n📄 *Documentação:* Apresente um documento oficial original com foto.\n\n🤖 *Esta é uma mensagem automática.* Por favor, não responda esta mensagem.`;
    } else if (cnh.situacao === "Remetida") {
      const candidatoNome = cnh.nome || "Candidato";
      const cpfDisplay = cnh.cpf ? formatCPF(cnh.cpf) : "";
      const ordemTag = cnh.ordem ? `#${cnh.ordem}` : "";
      return `🚗 *Olá, ${candidatoNome}!* 👋\n\n🪪 *CPF:* *${cpfDisplay}*\n\n📢 Passando para informar que o seu processo de *CNH* *(Nº da Ordem: ${ordemTag})* encontra-se em **🚚 EM TRÂNSITO / REMETIDO PARA IMPRESSÃO**.\n\n📦 Assim que sua CNH for **recebida em nosso balcão de atendimento**, entraremos em contato e você poderá realizar a retirada. ✅\n\n🔎 Você também pode acompanhar o andamento do processo pelo aplicativo de consulta, utilizando seu **CPF**, através do link: https://controle-habilita-o.vercel.app/?consulta=true\n\n🤖 *Esta é uma mensagem automática.* Por favor, não responda esta mensagem.`;
    } else if (cnh.situacao === "Entregue") {
      const retirante = cnh.responsavel_nome ? ` por ${cnh.responsavel_nome}` : "";
      return `Olá, *${nome}*! ✅\n\nConfirmamos que a sua CNH Ordem *${ordemTag}* (CPF: *${cpfFormatted}*) foi devidamente **ENTREGUE** em nosso sistema${retirante}.\n\nAgradecemos pela atenção!`;
    } else if (cnh.situacao === "Pendente") {
      return `Olá, *${nome}*! ⏳\n\nSua CNH Ordem *${ordemTag}* (CPF: *${cpfFormatted}*) consta com a situação **PENDENTE** no protocolo do DETRAN.\n\nEm breve atualizaremos o status do seu documento. Fique atento às atualizações do sistema!`;
    } else {
      return `Olá, *${nome}*! 📌\n\nInformamos o status atual da sua CNH Ordem *${ordemTag}* (CPF: *${cpfFormatted}*):\n\nSituacão Atual: *${cnh.situacao}*\nRepartição: ${cnh.reparticao || "DETRAN"}\nData da Movimentação: ${formatDateTime(cnh.data_movimento)}\n\nPara mais informações, consulte nosso balcão de atendimento.`;
    }
  };

  const handleOpenWhatsAppModal = (cnh: GeralCNH) => {
    setWhatsappModalCNH(cnh);
    setWhatsappPhone(cnh.telefone || "");
    setWhatsappMessage(getWhatsAppMessageForCNH(cnh));
    setCopiedMessage(false);
    setWhatsappApiError(null);
  };

  const [sendingDirectId, setSendingDirectId] = useState<string | null>(null);

  const handleDirectWasenderSend = async (cnh: GeralCNH) => {
    const phone = cnh.telefone || "";
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 8) {
      alert(`⚠️ O registro #${cnh.ordem} (${cnh.nome}) não possui um número de telefone com DDD válido cadastrado.`);
      return;
    }

    const defaultMsg = getWhatsAppMessageForCNH(cnh);
    setSendingDirectId(cnh.id);

    try {
      const res = await sendWhatsAppMessageAPI(phone, defaultMsg);
      if (res.success) {
        const nowIso = new Date().toISOString();
        if (user) {
          await updateGeralCNH(
            cnh.id,
            {
              notificado_whatsapp: true,
              notificado_at: nowIso,
            },
            user.id,
            user.nome_curto || user.nome
          );
        }
        setMessage({
          type: "success",
          text: `🚀 Mensagem padrão de status ("${cnh.situacao}") enviada com sucesso via Wasender API para ${cnh.nome} (${phone})!`
        });
        await fetchDados();
      } else {
        setMessage({
          type: "error",
          text: `❌ Falha ao enviar via Wasender API para ${cnh.nome}: ${res.error || "Erro desconhecido"}`
        });
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: `❌ Erro no envio via Wasender API: ${err.message}`
      });
    } finally {
      setSendingDirectId(null);
    }
  };
  const handleSendWhatsAppAPI = async () => {
    if (!whatsappModalCNH || !whatsappMessage) return;
    if (!whatsappPhone || whatsappPhone.replace(/\D/g, "").length < 8) {
      alert("Por favor, informe um número de telefone válido com DDD para envio.");
      return;
    }

    setIsSendingWhatsAppApi(true);
    setWhatsappApiError(null);

    const res = await sendWhatsAppMessageAPI(whatsappPhone, whatsappMessage);
    setIsSendingWhatsAppApi(false);

    if (res.success) {
      const nowIso = new Date().toISOString();
      if (user) {
        await updateGeralCNH(
          whatsappModalCNH.id,
          {
            notificado_whatsapp: true,
            notificado_at: nowIso,
            telefone: whatsappPhone
          },
          user.id,
          user.nome_curto || user.nome
        );
      }
      setMessage({
        type: "success",
        text: `✅ Notificação de CNH #${whatsappModalCNH.ordem} enviada com sucesso via Wasender API para ${whatsappModalCNH.nome} (${whatsappPhone})!`
      });
      setWhatsappModalCNH(null);
      await fetchDados();
    } else {
      setWhatsappApiError(res.error || "Erro ao conectar com Wasender API");
    }
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappMessage) return;
    const cleanPhone = whatsappPhone.replace(/\D/g, "");
    const encodedText = encodeURIComponent(whatsappMessage);
    
    let url = "";
    if (cleanPhone) {
      const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
      url = `https://wa.me/${fullPhone}?text=${encodedText}`;
    } else {
      url = `https://wa.me/?text=${encodedText}`;
    }

    // Marca o registro como notificado
    if (whatsappModalCNH && user) {
      const nowIso = new Date().toISOString();
      await updateGeralCNH(
        whatsappModalCNH.id,
        {
          notificado_whatsapp: true,
          notificado_at: nowIso,
          telefone: whatsappPhone
        },
        user.id,
        user.nome_curto || user.nome
      );
      await fetchDados();
    }
    
    window.open(url, "_blank");
    setWhatsappModalCNH(null);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  // Handler para Edição Rápida (QuickEdit) diretamente na Tabela
  const handleQuickEditCell = async (id: string, field: keyof GeralCNH, val: any) => {
    if (!canEdit) return;

    // Atualização otimista imediata na UI
    setCnhs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );

    try {
      const uId = user ? user.id : "sistema";
      const uNome = user ? (user.nome_curto || user.nome) : "Agente DETRAN";
      await updateGeralCNH(id, { [field]: val }, uId, uNome);
    } catch (err) {
      console.error("Erro no QuickEdit:", err);
    }
  };

  // Seleção Múltipla de Registros
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modais de Exclusão Individual e em Massa
  const [cnhToDelete, setCnhToDelete] = useState<GeralCNH | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const handleOpenDetailsModal = (cnh: GeralCNH) => {
    setSelectedCNHDetails(cnh);
    setIsDetailsModalOpen(true);
  };
  const [isCitizenQrModalOpen, setIsCitizenQrModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [syncImportToSupabase, setSyncImportToSupabase] = useState(true);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImportFile(file);
    setIsImportModalOpen(true);
    if (importFileInputRef.current) importFileInputRef.current.value = "";
  };

  const handleConfirmImport = async () => {
    if (!selectedImportFile || !user) return;
    setIsImporting(true);
    try {
      const buffer = await selectedImportFile.arrayBuffer();
      const res = await importSpreadsheetData(buffer, {
        syncToSupabase: syncImportToSupabase,
        mode: importMode,
        usuarioId: user.id,
        usuarioNome: user.nome_curto || user.nome
      });

      if (res.success) {
        setMessage({
          type: "success",
          text: `🎉 ${res.importedCount} registros importados da planilha com sucesso!` +
            (res.supabaseSyncedCount ? ` (${res.supabaseSyncedCount} salvos no Supabase)` : "") +
            (res.supabaseError ? ` [Aviso Supabase: ${res.supabaseError}]` : "")
        });
        setIsImportModalOpen(false);
        setSelectedImportFile(null);
        await fetchDados();
      } else {
        alert(`Erro ao importar planilha: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Erro ao processar arquivo: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const fetchDados = async () => {
    try {
      const [dataCnhs, dataResp] = await Promise.all([getGeralCNHs(), getResponsaveis()]);
      setCnhs(dataCnhs);
      setResponsaveis(dataResp);
    } catch (err) {
      console.error("Erro ao buscar CNHs no protocolo:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async (forceFull: boolean = false) => {
    setIsSyncingManual(true);
    try {
      const stats = await syncGeralWithSupabase(forceFull);
      await fetchDados();
      if (stats.isOffline) {
        setMessage({
          type: "warning",
          text: `Modo Offline ativado: Utilizando dados salvos localmente no navegador (${stats.totalRecords.toLocaleString("pt-BR")} registros).`
        });
      } else {
        setMessage({
          type: "success",
          text: `⚡ Banco de dados local sincronizado com sucesso com o Supabase! ${stats.totalRecords.toLocaleString("pt-BR")} registros em ${(stats.syncDurationMs / 1000).toFixed(1)}s.`
        });
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: `Erro ao sincronizar com Supabase: ${err.message}`
      });
    } finally {
      setIsSyncingManual(false);
    }
  };

  useEffect(() => {
    // 1. Escutar alterações no estado da sincronização do Dexie
    const unsubscribe = subscribeSyncStatus(setSyncStats);

    // 2. Carregar imediatamente os dados locais do IndexedDB para abertura instantânea (<1s)
    fetchDados();

    // 3. Iniciar a sincronização inteligente em segundo plano
    syncGeralWithSupabase(false).then(() => {
      fetchDados();
    });

    // 4. Executar sincronização automática a cada 5 minutos (300.000 ms)
    const intervalId = setInterval(() => {
      console.log("⏰ Executando sincronização automática de 5 minutos...");
      syncGeralWithSupabase(false).then(() => {
        fetchDados();
      });
    }, 300000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  const getResponsavelDisplayName = (nome?: string, id?: string) => {
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
    if (nome && nome !== "-") return nome;
    return "-";
  };

  // Ordenação e Filtros na memória (TanStack style)
  const filteredData = useMemo(() => {
    const normSearch = normalizeSearch(searchTerm);
    return cnhs.filter((c) => {
      const matchSearch =
        !normSearch ||
        normalizeSearch(c.nome).includes(normSearch) ||
        matchDigitsSafe(c.cpf, searchTerm) ||
        (c.cpf && c.cpf.includes(searchTerm.trim())) ||
        c.ordem.toString().includes(searchTerm.trim()) ||
        normalizeSearch(c.gaveta).includes(normSearch) ||
        normalizeSearch(c.reparticao).includes(normSearch) ||
        normalizeSearch(c.observacao).includes(normSearch);

      const matchSituacao = filtroSituacao === "todas" || c.situacao === filtroSituacao;
      const matchOrdemInicial = !filtroOrdemInicial || Number(c.ordem) >= Number(filtroOrdemInicial);
      const matchOrdemFinal = !filtroOrdemFinal || Number(c.ordem) <= Number(filtroOrdemFinal);

      return matchSearch && matchSituacao && matchOrdemInicial && matchOrdemFinal;
    }).sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      if (sortColumn === "data_movimento") {
        const timeA = valA ? new Date(valA as string).getTime() : 0;
        const timeB = valB ? new Date(valB as string).getTime() : 0;
        return sortDirection === "asc" ? timeA - timeB : timeB - timeA;
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }
      return sortDirection === "asc"
        ? String(valA || "").localeCompare(String(valB || ""))
        : String(valB || "").localeCompare(String(valA || ""));
    });
  }, [cnhs, searchTerm, filtroSituacao, filtroOrdemInicial, filtroOrdemFinal, sortColumn, sortDirection]);

  // Paginação
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  // Lista para Impressão e PDF Oficial em ordem crescente por número de Ordem (do menor para o maior)
  const reportData = useMemo(() => {
    return [...filteredData].sort((a, b) => a.ordem - b.ordem);
  }, [filteredData]);

  const handleSort = (col: keyof GeralCNH) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
  };

  // Handlers para Seleção Múltipla
  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const currentPageIds = paginatedData.map((c) => c.id);
    const allSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      const newSelected = new Set([...selectedIds, ...currentPageIds]);
      setSelectedIds(Array.from(newSelected));
    }
  };

  // Handlers para Exclusão
  const handleConfirmDeleteSingle = async () => {
    if (!cnhToDelete || !user || !canEdit) return;
    setIsDeleting(true);
    try {
      await deleteGeralCNH(cnhToDelete.id, user.id, user.nome_curto || user.nome);
      setMessage({
        type: "success",
        text: `Registro de CNH #${cnhToDelete.ordem} (${cnhToDelete.nome}) excluído com sucesso!`
      });
      setSelectedIds((prev) => prev.filter((id) => id !== cnhToDelete.id));
      setCnhToDelete(null);
      await fetchDados();
    } catch (err: any) {
      setMessage({ type: "error", text: `Erro ao excluir CNH: ${err.message}` });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0 || !user || !canEdit) return;
    setIsDeleting(true);
    try {
      const count = await deleteMultipleGeralCNHs(selectedIds, user.id, user.nome_curto || user.nome);
      setMessage({
        type: "success",
        text: `${count} registros de CNH excluídos com sucesso!`
      });
      setSelectedIds([]);
      setIsBatchDeleteModalOpen(false);
      await fetchDados();
    } catch (err: any) {
      setMessage({ type: "error", text: `Erro ao excluir registros selecionados: ${err.message}` });
    } finally {
      setIsDeleting(false);
    }
  };

  // Botão 📥 Receber (por linha na tabela)
  const handleReceber = async (item: GeralCNH) => {
    if (!user || !canEdit) return;
    try {
      const { geral, isVazio } = await receberCNH(item.id, user.id, user.nome_curto);
      if (isVazio) {
        setMessage({
          type: "warning",
          text: `⚠️ CNH de "${geral.nome}" foi RECEBIDA no sistema, porém não existe mapeamento para a inicial "${geral.nome.charAt(0)}". Alocado como Gaveta: Vazio | Repartição: Vazio.`
        });
      } else {
        setMessage({
          type: "success",
          text: `📥 CNH de "${geral.nome}" recebida com sucesso e alocada em ${geral.gaveta} / ${geral.reparticao}!`
        });
      }
      await fetchDados();
    } catch (err: any) {
      alert(err.message || "Erro ao receber CNH.");
    }
  };

  // Botão ➕ Cadastro Manual
  const handleOpenManualModal = () => {
    setManualSuccessMsg(null);
    setManualErrors({});
    setManualNome("");
    setManualCpf("");
    setManualSituacao("Recebida");
    setManualObservacao("");
    setIsManualModalOpen(true);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setManualErrors({});
    setManualSuccessMsg(null);

    const validation = CadastroManualCNHSchema.safeParse({
      nome: manualNome,
      cpf: formatCPF(manualCpf),
      situacao: manualSituacao,
      observacao: manualObservacao,
    });

    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.issues.forEach((iss) => {
        if (iss.path[0]) errs[iss.path[0].toString()] = iss.message;
      });
      setManualErrors(errs);
      return;
    }

    setSubmittingManual(true);
    try {
      const nova = await createGeralManual(
        {
          nome: manualNome,
          cpf: formatCPF(manualCpf),
          situacao: manualSituacao,
          observacao: manualObservacao,
        },
        user.id,
        user.nome_curto
      );

      await fetchDados();

      // Se cadastrar como Entregue, fechar a modal manual e abrir a de entrega
      if (manualSituacao === "Entregue") {
        setIsManualModalOpen(false);
        setMessage({
          type: "success",
          text: `CNH #${nova.ordem} de "${nova.nome}" cadastrada. Complete agora as informações da entrega.`
        });
        handleOpenEntregaModal(nova);
      } else {
        const msg = `✅ CNH #${nova.ordem} ("${nova.nome}") cadastrada com sucesso! Alocada em: ${nova.gaveta || "Em Trânsito"} ${nova.reparticao}`;
        setManualSuccessMsg(msg);
        setMessage({
          type: "success",
          text: msg
        });

        // Mantém a modal aberta para novos cadastros e limpa os campos
        setManualNome("");
        setManualCpf("");
        setManualObservacao("");
        setManualErrors({});
        setIsManualModalOpen(true);
      }
    } catch (err: any) {
      setManualErrors({ geral: err.message || "Erro no cadastro manual." });
    } finally {
      setSubmittingManual(false);
    }
  };

  // Botão 📤 Entregar
  const handleOpenEntregaModal = (item: GeralCNH) => {
    setSelectedCNHForEntrega(item);
    setTipoRetirante("proprietario");
    // Seleciona proprietário por padrão
    const prop = responsaveis.find((r) => r.nome === "Proprietário" || r.nome === "PROPRIETÁRIO(A)" || r.id === "e2335b1e");
    setSelectedRespId(prop ? prop.id : "");
    setSearchRespTerm("");
    setEntregaObservacao("");
    setIsEntregaModalOpen(true);
  };

  const handleConfirmEntrega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCNHForEntrega) return;

    let targetRespId = selectedRespId;
    if (tipoRetirante === "proprietario") {
      const prop = responsaveis.find((r) => r.nome === "Proprietário" || r.nome === "PROPRIETÁRIO(A)" || r.id === "e2335b1e");
      if (!prop) {
        alert("Erro: Registro padrão Proprietário não encontrado.");
        return;
      }
      targetRespId = prop.id;
    } else {
      if (!targetRespId) {
        alert("Por favor, selecione ou cadastre o responsável / despachante que está retirando a CNH.");
        return;
      }
    }

    setSubmittingEntrega(true);
    try {
      const ent = await entregarCNH(
        selectedCNHForEntrega.id,
        targetRespId,
        entregaObservacao,
        user.id,
        user.nome_curto
      );
      setMessage({
        type: "success",
        text: `🎉 Entrega confirmada! CNH #${ent.ordem} de "${ent.nome}" foi entregue a ${ent.responsavel_nome}.`
      });
      setIsEntregaModalOpen(false);
      await fetchDados();
    } catch (err: any) {
      alert(err.message || "Erro ao confirmar entrega.");
    } finally {
      setSubmittingEntrega(false);
    }
  };

  // Botão ➕ Novo Responsável (dentro da modal de entrega)
  const handleOpenNewRespModal = () => {
    setNewRespErrors({});
    setNewRespNome("");
    setNewRespCpf("");
    setNewRespTelefone("");
    setNewRespObs("");
    setIsNewRespModalOpen(true);
  };

  const handleSaveNewResp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setNewRespErrors({});

    const validation = ResponsavelSchema.safeParse({
      nome: newRespNome,
      cpf: formatCPF(newRespCpf),
      telefone: formatPhone(newRespTelefone),
      observacao: newRespObs,
      ativo: true,
    });

    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.issues.forEach((iss) => {
        if (iss.path[0]) errs[iss.path[0].toString()] = iss.message;
      });
      setNewRespErrors(errs);
      return;
    }

    setSubmittingNewResp(true);
    try {
      const novo = await createResponsavel(
        {
          nome: newRespNome,
          cpf: formatCPF(newRespCpf),
          telefone: formatPhone(newRespTelefone),
          observacao: newRespObs,
          ativo: true,
        },
        user.id,
        user.nome_curto
      );

      // Atualiza lista, seleciona automaticamente o novo responsável e fecha a modal!
      const dataResp = await getResponsaveis();
      setResponsaveis(dataResp);
      setSelectedRespId(novo.id);
      setIsNewRespModalOpen(false);
      alert(`Despachante / Responsável "${novo.nome}" cadastrado com sucesso e selecionado para retirada!`);
    } catch (err: any) {
      setNewRespErrors({ geral: err.message || "Erro ao cadastrar novo responsável." });
    } finally {
      setSubmittingNewResp(false);
    }
  };

  // Edição Geral / Alterar para Pendente
  const handleOpenEditModal = (item: GeralCNH) => {
    setEditingCNH(item);
    setEditSituacao(item.situacao);
    setEditGaveta(item.gaveta);
    setEditReparticao(item.reparticao);
    setEditObs(item.observacao || "");
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingCNH) return;
    try {
      await updateGeralCNH(
        editingCNH.id,
        {
          situacao: editSituacao,
          gaveta: editGaveta,
          reparticao: editReparticao,
          observacao: editObs,
        },
        user.id,
        user.nome_curto
      );
      setMessage({ type: "success", text: `CNH #${editingCNH.ordem} atualizada com sucesso!` });
      setIsEditModalOpen(false);
      await fetchDados();
    } catch (err: any) {
      alert(err.message || "Erro ao editar CNH");
    }
  };

  // Exportação para Excel (.xlsx)
  const handleExportExcel = () => {
    const dataExport = filteredData.map((c) => ({
      Ordem: c.ordem,
      Titular_CNH: c.nome,
      CPF: c.cpf,
      Gaveta: c.gaveta || "Em Trânsito",
      Reparticao: c.reparticao || "-",
      Situacao: c.situacao,
      Responsavel_Retirada: c.responsavel_nome || "-",
      Data_Movimento: formatDateTime(c.data_movimento),
      Operador_DETRAN: c.usuario_nome,
      Memorando_Origem: c.memorando_numero || "Manual",
      Observacoes: c.observacao || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CNHs_DETRAN");
    XLSX.writeFile(workbook, `Controle_CNH_DETRAN_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Exportação para CSV (.csv)
  const handleExportCSV = () => {
    const dataExport = filteredData.map((c) => ({
      Ordem: c.ordem,
      Titular: c.nome,
      CPF: c.cpf,
      Gaveta: c.gaveta,
      Reparticao: c.reparticao,
      Situacao: c.situacao,
      Responsavel: c.responsavel_nome || "-",
      Data: formatDateTime(c.data_movimento),
      Usuario: c.usuario_nome,
      Observacao: c.observacao || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExport);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Controle_CNH_DETRAN_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Geração de Impressão / PDF Oficial via jsPDF (Vertical / Portrait com cabeçalhos repetidos em todas as páginas)
  const handleGeneratePDF = () => {
    try {
      const cfg = getOrgaoConfig();

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const dataStr = `Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

      // Corpo da tabela sem a coluna de Remessa
      const tableData = reportData.map((c) => [
        `#${c.ordem}`,
        c.nome,
        formatCPF(c.cpf),
        "___/___/202___",
        ""
      ]);

      autoTable(doc, {
        startY: 28,
        margin: { top: 28, bottom: 14, left: 14, right: 14 },
        head: [["Ordem", "Nome do Titular", "CPF", "Data", "Responsável pelo Recebimento"]],
        body: tableData,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 1.5,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [241, 245, 249], // slate-100
          textColor: [15, 23, 42], // slate-900
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 16, fontStyle: "bold" },
          1: { cellWidth: 72 },
          2: { halign: "center", cellWidth: 30 },
          3: { halign: "center", cellWidth: 26 },
          4: { cellWidth: "auto" },
        },
        didDrawPage: (data) => {
          const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
          const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
          const rightMarginX = pageWidth - 14; // 196mm

          // Tenta desenhar a logo oficial no lado esquerdo do cabeçalho
          const hasLogo = addPDFHeaderLogo(doc, 14, 5, 14, 14);
          const startTextX = hasLogo ? 32 : 14;

          // Cabeçalho Oficial Repetido em TODAS as páginas
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42); // slate-900
          doc.text(`${cfg.sigla} — Setor Operacional de Protocolo e Entregas`, startTextX, 11);

          doc.setFontSize(8.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85); // slate-700
          doc.text(`Lista de Conferência e Retirada - ${cfg.orgao}`, startTextX, 16);

          // Metadados à direita
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139); // slate-500
          doc.text(dataStr, rightMarginX, 11, { align: "right" });
          doc.text(`Total listado: ${reportData.length} CNH(s)`, rightMarginX, 15, { align: "right" });
          if (filtroOrdemInicial || filtroOrdemFinal) {
            doc.text(`Filtro Ordem: #${filtroOrdemInicial || "1"} até #${filtroOrdemFinal || "Fim"}`, rightMarginX, 19, { align: "right" });
          }

          // Linha divisória
          doc.setDrawColor(203, 213, 225); // slate-300
          doc.setLineWidth(0.4);
          doc.line(14, 21, rightMarginX, 21);

          // Rodapé em TODAS as páginas
          const pageStr = `Página ${data.pageNumber}`;
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text("Sistema DETRAN-PROT — Controle Operacional de Protocolo e Entregas (Orientação Vertical)", 14, pageHeight - 6);
          doc.text(pageStr, rightMarginX, pageHeight - 6, { align: "right" });
        },
      });

      doc.save(`Lista_Protocolo_CNH_DETRAN_${new Date().toISOString().slice(0, 10)}.pdf`);

      setIsPrintModalOpen(false);
      setMessage({
        type: "success",
        text: `✅ Arquivo PDF gerado e baixado com sucesso! (${reportData.length} registros em formato Vertical, com cabeçalho em todas as páginas e sem coluna de remessa).`
      });
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      alert("Erro ao gerar o arquivo PDF: " + (err.message || "Tente novamente."));
    }
  };

  const outOfPropes = responsaveis.filter((r) => r.nome !== "Proprietário" && r.nome !== "PROPRIETÁRIO(A)");
  const filteredRespDropdown = outOfPropes.filter(
    (r) =>
      r.id.toLowerCase().includes(searchRespTerm.toLowerCase()) ||
      (r.registro && r.registro.toLowerCase().includes(searchRespTerm.toLowerCase())) ||
      r.nome.toLowerCase().includes(searchRespTerm.toLowerCase()) ||
      (r.cpf && r.cpf.includes(searchRespTerm)) ||
      (r.observacao && r.observacao.toLowerCase().includes(searchRespTerm.toLowerCase()))
  );

  return (
    <>
      <div className="space-y-6 animate-fadeIn print:hidden">
        {/* Cabeçalho da Tela Geral */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderArchive className="w-6 h-6 text-blue-600" />
              Tela Geral de Controle e Entrega de CNHs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Gestão de protocolo: remessas recebidas, arquivamento nas gavetas físicas e entrega ao titular ou despachante.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Indicador de Sincronização IndexedDB */}
            {syncStats.status === "syncing" || isSyncingManual ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>🟡 Sincronizando...</span>
              </div>
            ) : syncStats.isOffline || syncStats.status === "offline" ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>🔴 Modo Offline</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>🟢 Banco sincronizado</span>
              </div>
            )}

            {/* Informações da Sincronização */}
            <div className="hidden xl:flex flex-col text-[10px] text-slate-500 dark:text-slate-400 leading-tight border-l border-slate-200 dark:border-slate-800 pl-2">
              <span>
                <strong>Última sync:</strong>{" "}
                {syncStats.lastSyncAt ? formatDateTime(syncStats.lastSyncAt) : "Primeira execução"}
              </span>
              <span>
                <strong>Registros:</strong> {syncStats.totalRecords.toLocaleString("pt-BR")} |{" "}
                <strong>Tempo:</strong> {(syncStats.syncDurationMs / 1000).toFixed(1)}s
              </span>
            </div>

            {/* Botão Sincronizar Agora */}
            <button
              onClick={() => handleManualSync(false)}
              disabled={syncStats.status === "syncing" || isSyncingManual}
              title="Sincronizar Agora com o Supabase em segundo plano"
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-blue-200 dark:border-blue-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStats.status === "syncing" || isSyncingManual ? "animate-spin" : ""}`} />
              <span>Sincronizar Agora</span>
            </button>

            <button
              onClick={() => setIsCitizenQrModalOpen(true)}
              title="Abrir e compartilhar QR Code / Link de Consulta do Cidadão"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-emerald-300 dark:border-emerald-800"
            >
              <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>📱 QR Code Cidadão</span>
            </button>

            <button
              onClick={handleExportExcel}
              title="Exportar para Excel (.xlsx)"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel</span>
            </button>

            <button
              onClick={handleExportCSV}
              title="Exportar para CSV (.csv)"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>CSV</span>
            </button>

            <button
              onClick={() => setIsPrintModalOpen(true)}
              title="Gerar impressão (PDF) do protocolo na orientação horizontal"
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Imprimir (PDF)</span>
            </button>

            {canEdit && (
              <button
                onClick={handleOpenManualModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>➕ Cadastro Manual</span>
              </button>
            )}
        </div>
      </div>

      {/* Banner Tratamento Offline */}
      {(syncStats.isOffline || syncStats.status === "offline") && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <strong className="font-bold text-amber-950 dark:text-amber-100">Modo Offline — Utilizando banco de dados local (IndexedDB)</strong>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                Utilizando dados sincronizados em:{" "}
                <strong className="font-bold">{syncStats.lastSyncAt ? formatDateTime(syncStats.lastSyncAt) : "Base Local Pré-carregada"}</strong>
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100 text-[10px] font-bold rounded-lg uppercase tracking-wider shrink-0">
            {syncStats.totalRecords.toLocaleString("pt-BR")} registros
          </span>
        </div>
      )}

      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-center justify-between animate-fadeIn border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
              : message.type === "warning"
              ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="p-1 hover:bg-black/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra de Filtros e Pesquisa Instantânea */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisa instantânea por Ordem, Nome, CPF, Gaveta, Repartição, Observação..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-4">
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={filtroSituacao}
                onChange={(e) => {
                  setFiltroSituacao(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden appearance-none"
              >
                <option value="todas">Todas as Situações</option>
                <option value="Remetida">🟡 Remetida (Em Trânsito)</option>
                <option value="Recebida">🔵 Recebida na Agência</option>
                <option value="Pendente">🔴 Pendente Alocação</option>
                <option value="Entregue">🟢 Entregue ao Titular</option>
              </select>
            </div>
          </div>
        </div>

        {/* Linha 2: Filtro por Ordem (Inicial e Final) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" />
              Filtro por Ordem:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Nº Inicial"
                value={filtroOrdemInicial}
                onChange={(e) => {
                  setFiltroOrdemInicial(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-24 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-400 font-medium">até</span>
              <input
                type="number"
                placeholder="Nº Final"
                value={filtroOrdemFinal}
                onChange={(e) => {
                  setFiltroOrdemFinal(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-24 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              {(filtroOrdemInicial || filtroOrdemFinal) && (
                <button
                  onClick={() => {
                    setFiltroOrdemInicial("");
                    setFiltroOrdemFinal("");
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Limpar Ordem
                </button>
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {filtroOrdemInicial || filtroOrdemFinal ? (
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                🎯 Filtrando ordens{filtroOrdemInicial ? ` de #${filtroOrdemInicial}` : ""}{filtroOrdemFinal ? ` até #${filtroOrdemFinal}` : ""}
              </span>
            ) : (
              "Sem filtro de intervalo de ordem aplicado"
            )}
          </div>
        </div>
      </div>

      {/* Tabela Principal TanStack style com Ordenação e Botões 📥 Receber / 📤 Entregar - High Density */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm flex flex-col overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center flex-wrap gap-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
            <FolderArchive className="w-4 h-4 text-blue-600" />
            Situação Geral de CNHs no Protocolo
          </h3>
          <div className="flex items-center gap-3 relative">
            {/* Atalho de Ordenação por Data Mov. com Setas */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs text-xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                Data Mov:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSortColumn("data_movimento");
                  setSortDirection("asc");
                }}
                className={`px-2 py-0.5 rounded flex items-center gap-1 text-[11px] font-bold transition-all cursor-pointer ${
                  sortColumn === "data_movimento" && sortDirection === "asc"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
                title="Visualizar por Data Movimento (Mais antiga primeiro ⬆)"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Mais Antiga</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSortColumn("data_movimento");
                  setSortDirection("desc");
                }}
                className={`px-2 py-0.5 rounded flex items-center gap-1 text-[11px] font-bold transition-all cursor-pointer ${
                  sortColumn === "data_movimento" && sortDirection === "desc"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
                title="Visualizar por Data Movimento (Mais recente primeiro ⬇)"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Mais Recente</span>
              </button>
            </div>

            <button
              onClick={() => setShowColumnFilter(!showColumnFilter)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <Columns className="w-3.5 h-3.5 text-blue-600" />
              <span>Colunas</span>
            </button>

            {/* Botão QuickEdit (Edição Rápida na Tabela) */}
            <button
              type="button"
              onClick={() => {
                setQuickEditMode(!quickEditMode);
                if (!quickEditMode && !visibleColumns.telefone) {
                  // Opcional: Ativar visibilidade da coluna de telefone para facilitar QuickEdit de telefone
                  setVisibleColumns((prev) => ({ ...prev, telefone: true }));
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                quickEditMode
                  ? "bg-amber-500 hover:bg-amber-600 text-white shadow-md ring-2 ring-amber-400/50"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200"
              }`}
              title="Ativar/Desativar edição direta nas linhas da tabela"
            >
              <Edit2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>{quickEditMode ? "QuickEdit Ativo" : "QuickEdit"}</span>
            </button>

            {showColumnFilter && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 z-50 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Exibir Colunas</span>
                  <button
                    onClick={() => setShowColumnFilter(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {[
                    { key: "ordem", label: "Ordem (#)" },
                    { key: "nome", label: "Nome do Titular" },
                    { key: "cpf", label: "CPF" },
                    { key: "telefone", label: "Telefone / Contato" },
                    { key: "gaveta", label: "Gaveta" },
                    { key: "reparticao", label: "Repartição" },
                    { key: "situacao", label: "Situação" },
                    { key: "responsavel", label: "Responsável Retirada" },
                    { key: "data_movimento", label: "Data Mov." },
                    { key: "usuario", label: "Usuário" },
                    { key: "observacao", label: "Observações" },
                    { key: "whatsapp", label: "Ação WhatsApp (Modal)" },
                    { key: "wasender_direct", label: "Envio Wasender API (Sem Modal)" },
                    { key: "acoes", label: "Ações DETRAN" },
                  ].map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/40 text-xs text-slate-700 dark:text-slate-200 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.key as keyof typeof visibleColumns]}
                        onChange={(e) =>
                          setVisibleColumns({
                            ...visibleColumns,
                            [col.key]: e.target.checked,
                          })
                        }
                        className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <span className="text-[11px] text-slate-500 font-mono">
              Total listado: {filteredData.length} registros
            </span>
          </div>
        </div>

        {/* Banner Indicador de Modo QuickEdit */}
        {quickEditMode && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800/80 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 font-medium">
              <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-bold text-[10px] uppercase tracking-wider shadow-2xs">
                QuickEdit Ativo
              </span>
              <span>
                Altere <strong>Nome, Telefone, Gaveta, Repartição, Situação e Observação</strong> diretamente nas células da tabela. As alterações são salvas automaticamente!
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQuickEditMode(false)}
              className="px-2 py-1 bg-amber-200/80 hover:bg-amber-300 dark:bg-amber-900 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-100 rounded text-[11px] font-bold transition-all cursor-pointer"
            >
              Concluir Edição
            </button>
          </div>
        )}

        {/* Barra de Ações em Lote para Linhas Selecionadas */}
        {selectedIds.length > 0 && (
          <div className="mb-3 p-3 bg-red-50/90 dark:bg-red-950/60 border border-red-200 dark:border-red-800/80 rounded-xl flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200 font-bold text-xs">
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>{selectedIds.length} {selectedIds.length === 1 ? "linha selecionada" : "linhas selecionadas"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Limpar Seleção
              </button>
              {canEdit && (
                <button
                  onClick={() => setIsBatchDeleteModalOpen(true)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir {selectedIds.length} Selecionado(s)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500">Carregando protocolo Geral de CNHs...</div>
        ) : paginatedData.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500">
            Nenhuma CNH encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                <tr>
                  {/* Caixa de Seleção para Multiplas Linhas */}
                  <th className="py-2 px-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={paginatedData.length > 0 && paginatedData.every((c) => selectedIds.includes(c.id))}
                      onChange={toggleSelectAll}
                      title="Selecionar / Desselecionar todos desta página"
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-700 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  {visibleColumns.ordem && (
                    <th onClick={() => handleSort("ordem")} className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-1">
                        <span>Ordem</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.nome && (
                    <th onClick={() => handleSort("nome")} className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Nome do Titular</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.cpf && (
                    <th onClick={() => handleSort("cpf")} className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors whitespace-nowrap min-w-[170px]">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>CPF</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.telefone && (
                    <th onClick={() => handleSort("telefone" as keyof GeralCNH)} className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Telefone</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.gaveta && (
                    <th onClick={() => handleSort("gaveta")} className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <FolderArchive className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Gaveta</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.reparticao && (
                    <th onClick={() => handleSort("reparticao")} className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>Repartição</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.situacao && (
                    <th onClick={() => handleSort("situacao")} className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                      <span>Situação</span>
                    </th>
                  )}
                  {visibleColumns.responsavel && (
                    <th className="py-2 px-4">Responsável Retirada</th>
                  )}
                  {visibleColumns.data_movimento && (
                    <th
                      onClick={() => handleSort("data_movimento")}
                      className="py-2 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors select-none"
                      title="Clique para ordenar por Data de Movimentação (Mais Antiga / Mais Recente)"
                    >
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Data Mov.</span>
                        <div className="inline-flex items-center gap-0.5">
                          {sortColumn === "data_movimento" ? (
                            sortDirection === "asc" ? (
                              <span className="inline-flex items-center text-blue-600 dark:text-blue-400 font-bold bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded text-[10px]" title="Ordenado: Mais Antiga (⬆)">
                                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-blue-600 dark:text-blue-400 font-bold bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded text-[10px]" title="Ordenado: Mais Recente (⬇)">
                                <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                              </span>
                            )
                          ) : (
                            <div className="inline-flex items-center text-slate-400 opacity-70 hover:opacity-100">
                              <ArrowUp className="w-3 h-3 -mr-1" />
                              <ArrowDown className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      </div>
                    </th>
                  )}
                  {visibleColumns.usuario && (
                    <th className="py-2 px-4">Usuário</th>
                  )}
                  {visibleColumns.observacao && (
                    <th className="py-2 px-4 max-w-[150px]">Observações</th>
                  )}
                  {visibleColumns.wasender_direct && (
                    <th className="py-2 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Wasender Direct</span>
                      </div>
                    </th>
                  )}
                  {visibleColumns.acoes && (
                    <th className="py-2 px-4 text-right w-44">Ações DETRAN</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paginatedData.map((c) => (
                  <tr 
                    key={c.id} 
                    onClick={() => handleOpenDetailsModal(c)}
                    className={`hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer ${
                      selectedIds.includes(c.id) ? "bg-blue-50/40 dark:bg-blue-950/30" : ""
                    }`}
                  >
                    {/* Caixa de Seleção para Linha */}
                    <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleSelectRow(c.id)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-700 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Ordem */}
                    {visibleColumns.ordem && (
                      <td className="py-2 px-4">
                        <span className="inline-flex items-center justify-center font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 border border-blue-200 dark:border-blue-700 shadow-2xs tracking-wide">
                          #{c.ordem}
                        </span>
                      </td>
                    )}

                    {/* Nome do Titular */}
                    {visibleColumns.nome && (
                      <td className="py-2 px-4 font-semibold text-slate-800 dark:text-slate-100" onClick={(e) => quickEditMode && e.stopPropagation()}>
                        {quickEditMode ? (
                          <input
                            type="text"
                            value={c.nome}
                            onChange={(e) => handleQuickEditCell(c.id, "nome", e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-2 py-1 text-xs bg-amber-50/70 dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>{c.nome}</span>
                          </div>
                        )}
                      </td>
                    )}

                    {/* CPF */}
                    {visibleColumns.cpf && (
                      <td className="py-2 px-4 whitespace-nowrap min-w-[170px]">
                        <div className="flex items-center gap-1.5 font-mono text-sm font-extrabold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span className="tracking-wide whitespace-nowrap">{c.cpf ? formatCPF(c.cpf) : "-"}</span>
                        </div>
                      </td>
                    )}

                    {/* Telefone */}
                    {visibleColumns.telefone && (
                      <td className="py-2 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono text-xs" onClick={(e) => quickEditMode && e.stopPropagation()}>
                        {quickEditMode ? (
                          <input
                            type="text"
                            placeholder="(91) 99999-9999"
                            value={c.telefone || ""}
                            onChange={(e) => handleQuickEditCell(c.id, "telefone", formatPhone(e.target.value))}
                            onClick={(e) => e.stopPropagation()}
                            className="w-32 px-2 py-1 text-xs font-mono bg-amber-50/70 dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                          />
                        ) : c.telefone ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            {c.telefone}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">-</span>
                        )}
                      </td>
                    )}

                    {/* Gaveta */}
                    {visibleColumns.gaveta && (
                      <td className="py-2 px-4" onClick={(e) => quickEditMode && e.stopPropagation()}>
                        {quickEditMode ? (
                          <input
                            type="text"
                            placeholder="Gaveta / Local"
                            value={c.gaveta || ""}
                            onChange={(e) => handleQuickEditCell(c.id, "gaveta", e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-24 px-2 py-1 text-xs bg-amber-50/70 dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                          />
                        ) : c.gaveta && c.gaveta.trim() ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-semibold text-[11px]" title={`Gaveta: ${c.gaveta}`}>
                            <FolderArchive className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{cleanGavetaText(c.gaveta)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Em trânsito</span>
                        )}
                      </td>
                    )}

                    {/* Repartição */}
                    {visibleColumns.reparticao && (
                      <td className="py-2 px-4" onClick={(e) => quickEditMode && e.stopPropagation()}>
                        {quickEditMode ? (
                          <input
                            type="text"
                            placeholder="Repartição"
                            value={c.reparticao || ""}
                            onChange={(e) => handleQuickEditCell(c.id, "reparticao", e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-28 px-2 py-1 text-xs bg-amber-50/70 dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                          />
                        ) : c.reparticao && c.reparticao.trim() ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold text-[11px]" title={`Repartição: ${c.reparticao}`}>
                            <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>{cleanReparticaoText(c.reparticao)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">-</span>
                        )}
                      </td>
                    )}

                    {/* Situação */}
                    {visibleColumns.situacao && (
                      <td className="py-2 px-4" onClick={(e) => quickEditMode && e.stopPropagation()}>
                        {quickEditMode ? (
                          <select
                            value={c.situacao}
                            onChange={(e) => handleQuickEditCell(c.id, "situacao", e.target.value as SituacaoGeral)}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 text-xs bg-amber-50/70 dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                          >
                            <option value="Recebida">Recebida</option>
                            <option value="Remetida">Remetida</option>
                            <option value="Entregue">Entregue</option>
                            <option value="Pendente">Pendente</option>
                          </select>
                        ) : (
                          <Badge situacao={c.situacao} />
                        )}
                      </td>
                    )}

                    {/* Responsável */}
                    {visibleColumns.responsavel && (
                      <td className="py-2 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {getResponsavelDisplayName(c.responsavel_nome, c.responsavel_id)}
                      </td>
                    )}

                    {/* Data */}
                    {visibleColumns.data_movimento && (
                      <td className="py-2 px-4 text-slate-500 font-mono">
                        {formatDateTime(c.data_movimento)}
                      </td>
                    )}

                    {/* Usuário */}
                    {visibleColumns.usuario && (
                      <td className="py-2 px-4 text-slate-600 dark:text-slate-400">
                        {c.usuario_nome}
                      </td>
                    )}

                    {/* Observação */}
                    {visibleColumns.observacao && (
                      <td className="py-2 px-4 max-w-[150px] text-slate-500" onClick={(e) => quickEditMode && e.stopPropagation()}>
                        {quickEditMode ? (
                          <input
                            type="text"
                            placeholder="Observação"
                            value={c.observacao || ""}
                            onChange={(e) => handleQuickEditCell(c.id, "observacao", e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-36 px-2 py-1 text-xs bg-amber-50/70 dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                          />
                        ) : (
                          <span className="truncate block max-w-[150px]" title={c.observacao}>
                            {c.observacao || "-"}
                          </span>
                        )}
                      </td>
                    )}

                    {/* Envio Direto Wasender API (sem modal) */}
                    {visibleColumns.wasender_direct && (
                      <td className="py-2 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {c.telefone && c.telefone.replace(/\D/g, "").length >= 8 ? (
                          <button
                            type="button"
                            disabled={sendingDirectId === c.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectWasenderSend(c);
                            }}
                            title={`Enviar mensagem padrão da situação "${c.situacao}" diretamente via Wasender API sem abrir modal`}
                            className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-50 active:scale-95 ${
                              c.notificado_whatsapp
                                ? "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white"
                            }`}
                          >
                            {sendingDirectId === c.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                                <span>Enviando...</span>
                              </>
                            ) : c.notificado_whatsapp ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                                <span>✓ Wasender Enviado</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Enviar API</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 text-xs font-normal">-</span>
                        )}
                      </td>
                    )}

                    {/* Ações (Botões WhatsApp, 📥 Receber e 📤 Entregar) */}
                    {visibleColumns.acoes && (
                      <td className="py-2 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Botão WhatsApp: Apenas visível para linhas com telefone cadastrado */}
                          {visibleColumns.whatsapp && c.telefone && c.telefone.replace(/\D/g, "").length >= 8 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenWhatsAppModal(c);
                              }}
                              title={
                                c.notificado_whatsapp
                                  ? `Notificação WhatsApp enviada em ${c.notificado_at ? formatDateTime(c.notificado_at) : "recente"}. Clique para reenviar.`
                                  : `Enviar WhatsApp para ${c.nome} (${c.telefone})`
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1 font-bold text-[11px] rounded-lg shadow-2xs hover:shadow transition-all cursor-pointer active:scale-95 shrink-0 ${
                                c.notificado_whatsapp
                                  ? "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30"
                                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
                              }`}
                            >
                              {c.notificado_whatsapp ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                                  <span>✓ Notificado</span>
                                </>
                              ) : (
                                <>
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>WhatsApp</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Botão 📥 Receber: Somente disponível quando Situação = Remetida ou Pendente */}
                          {canEdit && (c.situacao === "Remetida" || c.situacao === "Pendente") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReceber(c);
                              }}
                              title="Receber CNH no protocolo e alocar na gaveta"
                              className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow-xs text-[11px] transition-all cursor-pointer animate-pulse hover:animate-none"
                            >
                              <Inbox className="w-3.5 h-3.5" />
                              <span>📥 Receber</span>
                            </button>
                          )}

                          {/* Botão 📤 Entregar: Somente disponível quando Situação = Recebida */}
                          {canEdit && c.situacao === "Recebida" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEntregaModal(c);
                              }}
                              title="Confirmar entrega da CNH ao titular ou despachante"
                              className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow-xs text-[11px] transition-all cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>📤 Entregar</span>
                            </button>
                          )}

                          {/* Botão de Edição/Pendente */}
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(c);
                              }}
                              title="Editar CNH / Alterar situação"
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Botão de Exclusão Individual */}
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCnhToDelete(c);
                              }}
                              title="Excluir este registro de CNH"
                              className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500/80 hover:text-red-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação Padrão: 100 registros por página */}
        {!loading && filteredData.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-medium">
            <div>
              <span>
                Página <strong className="text-slate-900 dark:text-white">{currentPage}</strong> de{" "}
                <strong className="text-slate-900 dark:text-white">{totalPages || 1}</strong>
                <span className="mx-2 text-slate-300 dark:text-slate-700">|</span>
                Mostrando <strong>{filteredData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</strong> até{" "}
                <strong>{Math.min(currentPage * itemsPerPage, filteredData.length)}</strong> de{" "}
                <strong>{filteredData.length}</strong> registros
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-semibold text-xs cursor-pointer"
              >
                Primeira
              </button>

              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-semibold text-xs flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Anterior
              </button>

              <span className="px-3 py-1 font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-200/60 dark:bg-slate-700/60 rounded-lg text-xs">
                {currentPage} / {totalPages || 1}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-semibold text-xs flex items-center gap-1 cursor-pointer"
              >
                Próxima
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-semibold text-xs cursor-pointer"
              >
                Última
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: ➕ CADASTRO MANUAL */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="➕ Cadastro Manual de CNH no Protocolo"
        maxWidth="md"
      >
        <form onSubmit={handleSaveManual} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-bold">⚡ Regras do Cadastro Manual DETRAN:</p>
            <p>1. A <strong>Ordem</strong> sequencial é gerada automaticamente pelo sistema.</p>
            <p>2. Se cadastrar como <strong>Recebida</strong>, a Gaveta e Repartição são calculadas automaticamente conforme a inicial do nome.</p>
            <p>3. Se cadastrar como <strong>Entregue</strong>, a modal de entrega será aberta em seguida para informar o responsável pela retirada.</p>
          </div>

          {manualSuccessMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 font-bold flex items-center justify-between gap-2 shadow-2xs">
              <span>{manualSuccessMsg}</span>
              <span className="text-[10px] bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 px-2 py-0.5 rounded-md uppercase font-extrabold shrink-0">
                Pronto p/ próximo
              </span>
            </div>
          )}

          {manualErrors.geral && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-medium">
              {manualErrors.geral}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo do Titular da CNH <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={manualNome}
              onChange={(e) => setManualNome(e.target.value)}
              placeholder="ex: Maria Fernanda Gonçalves"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            {manualErrors.nome && <p className="text-[11px] text-rose-500 mt-1">{manualErrors.nome}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CPF do Titular <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={manualCpf}
                onChange={(e) => setManualCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
              {manualErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{manualErrors.cpf}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Situação Inicial
              </label>
              <select
                value={manualSituacao}
                onChange={(e) => setManualSituacao(e.target.value as SituacaoGeral)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value="Recebida">🔵 Recebida na Agência (Aloca Gaveta auto)</option>
                <option value="Remetida">🟡 Remetida (Em trânsito)</option>
                <option value="Pendente">🔴 Pendente (Com exigência)</option>
                <option value="Entregue">🟢 Entregue diretamente ao cidadão</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações (Motivo do cadastro manual, carimbo, etc.)
            </label>
            <textarea
              value={manualObservacao}
              onChange={(e) => setManualObservacao(e.target.value)}
              placeholder="ex: CNH devolvida pelos Correios / Entrega avulsa do CFC..."
              rows={3}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsManualModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingManual}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submittingManual ? "Cadastrando..." : "Confirmar Cadastro"}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: 📤 ENTREGAR CNH */}
      <Modal
        isOpen={isEntregaModalOpen}
        onClose={() => setIsEntregaModalOpen(false)}
        title="📤 Confirmar Entrega de CNH"
        maxWidth="lg"
      >
        {selectedCNHForEntrega && (
          <form onSubmit={handleConfirmEntrega} className="space-y-5">
            {/* Resumo do Titular */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-400">Titular da CNH (Ordem #{selectedCNHForEntrega.ordem})</p>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">{selectedCNHForEntrega.nome}</h4>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-300">CPF: {selectedCNHForEntrega.cpf ? formatCPF(selectedCNHForEntrega.cpf) : "-"}</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg">
                  {selectedCNHForEntrega.gaveta || "Sem gaveta"} / {selectedCNHForEntrega.reparticao || "-"}
                </span>
              </div>
            </div>

            {/* Quem está retirando? */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Quem está retirando a CNH no balcão? <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label
                  onClick={() => {
                    setTipoRetirante("proprietario");
                    const prop = responsaveis.find((r) => r.nome === "Proprietário");
                    setSelectedRespId(prop ? prop.id : "");
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    tipoRetirante === "proprietario"
                      ? "bg-blue-50 dark:bg-blue-950/60 border-blue-600 ring-2 ring-blue-500/20"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="retirante"
                    checked={tipoRetirante === "proprietario"}
                    onChange={() => {}}
                    className="w-4 h-4 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">Proprietário (O Próprio Titular)</span>
                    <span className="block text-[10px] text-slate-500">Entrega direta com conferência de RG/CNH</span>
                  </div>
                </label>

                <label
                  onClick={() => setTipoRetirante("outro")}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    tipoRetirante === "outro"
                      ? "bg-blue-50 dark:bg-blue-950/60 border-blue-600 ring-2 ring-blue-500/20"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="retirante"
                    checked={tipoRetirante === "outro"}
                    onChange={() => {}}
                    className="w-4 h-4 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">Outro Responsável / Despachante</span>
                    <span className="block text-[10px] text-slate-500">Procurador, CFC ou despachante autorizado</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Caso Outro Responsável: Mostrar um dropdown pesquisável e botão ➕ Novo Responsável */}
            {tipoRetirante === "outro" && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Selecione o Responsável / Despachante:
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenNewRespModal}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>➕ Novo Responsável</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome do responsável ou CPF..."
                    value={searchRespTerm}
                    onChange={(e) => setSearchRespTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs mb-2 focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 bg-white dark:bg-slate-900">
                  {filteredRespDropdown.length === 0 ? (
                    <p className="text-center py-4 text-xs text-slate-400">Nenhum responsável encontrado. Clique em ➕ Novo Responsável ao lado.</p>
                  ) : (
                    filteredRespDropdown.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRespId(r.id)}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                          selectedRespId === r.id
                            ? "bg-blue-600 text-white font-bold border-blue-600 shadow-sm"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${selectedRespId === r.id ? "text-white" : "text-slate-900 dark:text-white"}`}>{r.nome}</span>
                            {r.registro && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${selectedRespId === r.id ? "bg-blue-700 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"}`}>
                                Reg: {r.registro}
                              </span>
                            )}
                          </div>
                          <span className={`block text-[10px] font-mono ${selectedRespId === r.id ? "text-blue-100" : "text-slate-400"}`}>
                            {r.cpf ? `CPF: ${r.cpf}` : ""} {r.telefone ? `${r.cpf ? " | " : ""}Fone: ${r.telefone}` : ""}
                          </span>
                        </div>
                        {selectedRespId === r.id && <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Observações da Entrega (Opcional)
              </label>
              <input
                type="text"
                value={entregaObservacao}
                onChange={(e) => setEntregaObservacao(e.target.value)}
                placeholder="ex: Apresentou procuração cartorial original / Retirou 5 CNHs em lote..."
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEntregaModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingEntrega}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {submittingEntrega ? "Registrando Entrega..." : "✔ Confirmar Entrega"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 3: ➕ NOVO RESPONSÁVEL (Segunda modal acionada na entrega) */}
      <Modal
        isOpen={isNewRespModalOpen}
        onClose={() => setIsNewRespModalOpen(false)}
        title="➕ Cadastrar Novo Responsável / Despachante"
        maxWidth="sm"
      >
        <form onSubmit={handleSaveNewResp} className="space-y-4">
          {newRespErrors.geral && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-medium">
              {newRespErrors.geral}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo ou CFC <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newRespNome}
              onChange={(e) => setNewRespNome(e.target.value)}
              placeholder="ex: Carlos Alberto - CFC Brasil"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            {newRespErrors.nome && <p className="text-[11px] text-rose-500 mt-1">{newRespErrors.nome}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              CPF ou CNPJ <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newRespCpf}
              onChange={(e) => setNewRespCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={18}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            {newRespErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{newRespErrors.cpf}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Telefone
            </label>
            <input
              type="text"
              value={newRespTelefone}
              onChange={(e) => setNewRespTelefone(formatPhone(e.target.value))}
              placeholder="(67) 99999-9999"
              maxLength={15}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observação (Procuração, etc.)
            </label>
            <input
              type="text"
              value={newRespObs}
              onChange={(e) => setNewRespObs(e.target.value)}
              placeholder="ex: Autorizado por procuração autenticada"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsNewRespModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingNewResp}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submittingNewResp ? "Salvando..." : "Salvar e Selecionar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: EDITAR CNH / ALTERAR SITUAÇÃO */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar CNH / Alterar Situação"
        maxWidth="sm"
      >
        {editingCNH && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Ordem #{editingCNH.ordem} - {editingCNH.nome}</p>
              <p className="text-xs font-mono text-slate-500">CPF: {editingCNH.cpf ? formatCPF(editingCNH.cpf) : "-"}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Situação
              </label>
              <select
                value={editSituacao}
                onChange={(e) => setEditSituacao(e.target.value as SituacaoGeral)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value="Remetida">🟡 Remetida (Em trânsito)</option>
                <option value="Recebida">🔵 Recebida na Agência</option>
                <option value="Pendente">🔴 Pendente (Com exigência / Bloqueada)</option>
                <option value="Entregue">🟢 Entregue</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gaveta
                </label>
                <input
                  type="text"
                  value={editGaveta}
                  onChange={(e) => setEditGaveta(e.target.value)}
                  placeholder="ex: Gaveta 1"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Repartição
                </label>
                <input
                  type="text"
                  value={editReparticao}
                  onChange={(e) => setEditReparticao(e.target.value)}
                  placeholder="ex: Repartição 3"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Observações
              </label>
              <textarea
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md text-xs"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal 5: Visualização e Confirmação para Impressão PDF */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="🖨️ Impressão de Lista de Protocolo (PDF Vertical)"
      >
        <div className="space-y-4 text-slate-800 dark:text-slate-200">
          <div className="p-4 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded-xl text-xs space-y-1.5">
            <p className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5 text-sm">
              <Printer className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Configuração do Relatório e Geração de PDF Oficial
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              Devido a restrições de segurança de navegadores no modo de visualização (onde o comando de impressão do sistema pode ser silenciado ou bloqueado), implementamos a <strong>geração nativa do arquivo PDF oficial</strong> pronto para salvar, imprimir ou enviar pelo WhatsApp!
            </p>
            <ul className="list-disc pl-5 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 pt-1">
              <li><strong>Orientação do Papel:</strong> Vertical (Retrato / Portrait) em formato A4.</li>
              <li><strong>Cabeçalho em Todas as Páginas:</strong> Título, data de emissão e metadados repetidos no topo de cada folha.</li>
              <li><strong>Sem Coluna de Remessa:</strong> Tabela otimizada com foco em Ordem, Nome, CPF, Data e Assinatura.</li>
              <li><strong>Total Listado:</strong> {reportData.length} registro(s) refletindo exatamente os filtros aplicados na tela.</li>
            </ul>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50 max-h-60 overflow-y-auto">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Pré-visualização (Amostra dos primeiros registros A-Z):</p>
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-400">
                  <th className="py-1 px-1">Ordem</th>
                  <th className="py-1 px-2">Nome</th>
                  <th className="py-1 px-2">CPF</th>
                  <th className="py-1 px-2">Data</th>
                  <th className="py-1 px-2">Assinatura / Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {reportData.slice(0, 5).map((c, idx) => (
                  <tr key={idx} className="text-slate-700 dark:text-slate-300">
                    <td className="py-1 px-1 font-bold">#{c.ordem}</td>
                    <td className="py-1 px-2 font-medium truncate max-w-[140px]">{c.nome}</td>
                    <td className="py-1 px-2 font-mono">{formatCPF(c.cpf)}</td>
                    <td className="py-1 px-2 text-slate-400 font-mono">___/___/___</td>
                    <td className="py-1 px-2"></td>
                  </tr>
                ))}
                {reportData.length > 5 && (
                  <tr>
                    <td colSpan={5} className="py-1.5 text-center text-[10px] text-slate-400 italic font-semibold">
                      + {reportData.length - 5} outras CNHs incluídas na impressão...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  window.print();
                } catch (e) {
                  alert("A impressão direta do navegador foi bloqueada nesta aba. Clique em 'Baixar PDF Oficial' ao lado para obter o arquivo.");
                }
              }}
              title="Tenta abrir a caixa de diálogo de impressão do navegador (funciona em aba separada)"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-xs transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir via Navegador (Aba Solta)</span>
            </button>
            <button
              type="button"
              onClick={handleGeneratePDF}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md shadow-purple-600/20 text-xs transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>📥 Baixar Arquivo PDF Oficial (Vertical)</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal 5: Importar Planilha CSV / XLSX */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="📥 Importar Planilha (CSV ou Excel)"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200">
            <div className="font-bold flex items-center gap-2 mb-1">
              <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Arquivo Selecionado: <strong>{selectedImportFile?.name}</strong></span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Tamanho: {(selectedImportFile?.size ? selectedImportFile.size / 1024 : 0).toFixed(1)} KB
            </p>
          </div>

          <div className="space-y-2">
            <label className="font-bold text-slate-800 dark:text-slate-200 block">
              Modo de Inserção no Sistema
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                importMode === "merge" 
                  ? "bg-blue-50/70 border-blue-500 dark:bg-blue-950/60 ring-1 ring-blue-500" 
                  : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}>
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Mesclar e Atualizar</div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Atualiza os registros existentes por CPF/Ordem e adiciona os novos sem apagar os atuais.
                  </p>
                </div>
              </label>

              <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                importMode === "replace" 
                  ? "bg-rose-50/70 border-rose-500 dark:bg-rose-950/60 ring-1 ring-rose-500" 
                  : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}>
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Substituir Lista Local</div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Substitui inteiramente todos os registros da tabela local pelos dados desta planilha.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <label className="flex items-center gap-2 font-bold text-slate-900 dark:text-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncImportToSupabase}
                onChange={(e) => setSyncImportToSupabase(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Sincronizar também com o banco Supabase em nuvem</span>
            </label>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 pl-6">
              Quando ativado, envia todos os registros importados da planilha diretamente para a tabela <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">geral_cnhs</code> no Supabase.
            </p>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
            💡 <strong>Reconhecimento Automático de Colunas:</strong> A planilha pode estar em <code className="font-mono">.csv</code> ou <code className="font-mono">.xlsx</code>. O sistema detecta colunas como <em>Ordem, Nome/Candidato, CPF, Gaveta, Repartição, Situação, Responsável, Memorando e Observações</em>.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{isImporting ? "Importando Planilha..." : "Iniciar Importação"}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal 6: Visualização Detalhada da CNH */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={`👁️ Detalhes Completos da CNH (Ordem #${selectedCNHDetails?.ordem || ""})`}
      >
        {selectedCNHDetails && (
          <div className="space-y-4 text-xs">
            {/* Banner Superior com Nome e Situação */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-black font-mono text-lg shadow-sm tracking-wide">
                  Ordem #{selectedCNHDetails.ordem}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {selectedCNHDetails.nome}
                  </h3>
                  <p className="text-sm font-mono font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mt-1">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>CPF: {selectedCNHDetails.cpf ? formatCPF(selectedCNHDetails.cpf) : "Não informado"}</span>
                  </p>
                  {selectedCNHDetails.telefone && (
                    <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-1">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>Contato: {selectedCNHDetails.telefone}</span>
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Badge situacao={selectedCNHDetails.situacao} />
              </div>
            </div>

            {/* Grid de Informações Estruturadas de Todas as Colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Localização Física */}
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <FolderArchive className="w-4 h-4 text-blue-500" />
                  <span>Localização Física</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Gaveta:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                      {selectedCNHDetails.gaveta && selectedCNHDetails.gaveta.trim() ? selectedCNHDetails.gaveta : "Em trânsito"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Repartição:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                      {selectedCNHDetails.reparticao || "Geral"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Origem e Memorando */}
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  <span>Origem & Remessa</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Nº Memorando:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {selectedCNHDetails.memorando_numero || "Avulsa / Manual"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Remessa:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {selectedCNHDetails.remessa || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Registro de Movimentação */}
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <Calendar className="w-4 h-4 text-purple-500" />
                  <span>Movimentação</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Data Movimento:</span>
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      {formatDateTime(selectedCNHDetails.data_movimento)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Operador / Servidor:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {selectedCNHDetails.usuario_nome || "Sistema"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Responsável pela Retirada */}
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <User className="w-4 h-4 text-amber-500" />
                  <span>Retirada / Responsável</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Responsável:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {getResponsavelDisplayName(selectedCNHDetails.responsavel_nome, selectedCNHDetails.responsavel_id)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Criado em:</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      {formatDateTime(selectedCNHDetails.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">Observações do Registro:</span>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed italic">
                {selectedCNHDetails.observacao || "Nenhuma observação informada."}
              </p>
            </div>

            {/* Rodapé e Botões de Ação */}
            <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono">
                ID Sistema: {selectedCNHDetails.id}
              </span>

              <div className="flex items-center gap-2">
                {canEdit && (selectedCNHDetails.situacao === "Remetida" || selectedCNHDetails.situacao === "Pendente") && (
                  <button
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      handleReceber(selectedCNHDetails);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Inbox className="w-3.5 h-3.5" />
                    <span>📥 Receber</span>
                  </button>
                )}

                {canEdit && selectedCNHDetails.situacao === "Recebida" && (
                  <button
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      handleOpenEntregaModal(selectedCNHDetails);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>📤 Entregar</span>
                  </button>
                )}

                {canEdit && (
                  <button
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      handleOpenEditModal(selectedCNHDetails);
                    }}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                )}

                {canEdit && (
                  <button
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      setCnhToDelete(selectedCNHDetails);
                    }}
                    className="px-3 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                )}

                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal 7: Confirmação de Exclusão Individual */}
      <Modal
        isOpen={cnhToDelete !== null}
        onClose={() => setCnhToDelete(null)}
        title="⚠️ Confirmar Exclusão de Registro"
      >
        {cnhToDelete && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl text-red-800 dark:text-red-200">
              <p className="font-bold flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>Atenção: Ação Irreversível</span>
              </p>
              <p className="mt-1">
                Você está prestes a excluir permanentemente o registro de CNH da tabela geral. Esta alteração será salva no sistema e registrada para auditoria.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-2 border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Ordem:</span>
                <span className="font-black font-mono text-base text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-lg border border-blue-200/60 dark:border-blue-800/60">#{cnhToDelete.ordem}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Nome:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{cnhToDelete.nome}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">CPF:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{cnhToDelete.cpf ? formatCPF(cnhToDelete.cpf) : "Não informado"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Situação Atual:</span>
                <Badge situacao={cnhToDelete.situacao} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setCnhToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteSingle}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? "Excluindo..." : "Confirmar Exclusão"}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal 8: Confirmação de Exclusão em Massa */}
      <Modal
        isOpen={isBatchDeleteModalOpen}
        onClose={() => setIsBatchDeleteModalOpen(false)}
        title={`⚠️ Excluir ${selectedIds.length} Registros Selecionados`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl text-red-800 dark:text-red-200">
            <p className="font-bold flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>Atenção: Exclusão em Massa</span>
            </p>
            <p className="mt-1 leading-relaxed">
              Tem certeza que deseja excluir permanentemente os <strong className="font-mono text-sm underline">{selectedIds.length}</strong> registros de CNH selecionados? Essa operação removerá todas as linhas marcadas e registrará o evento de exclusão em lote no histórico de auditoria.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setIsBatchDeleteModalOpen(false)}
              disabled={isDeleting}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmBatchDelete}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? "Excluindo..." : `Excluir ${selectedIds.length} Registros`}</span>
            </button>
          </div>
        </div>
      </Modal>
      </div>

      {/* Relatório Oculto Exclusivo para Impressão (Vertical, Cabeçalho repetido em todas as páginas) */}
      <div id="printable-cnh-report" className="hidden print:block font-sans text-black p-4 bg-white w-full">
        <table className="w-full text-left border-collapse border border-black text-xs">
          <thead className="table-header-group">
            <tr>
              <th colSpan={5} className="border-b-2 border-black pb-3 mb-2 font-normal text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-base font-bold uppercase tracking-wider text-black">
                      DETRAN/PA — Setor Operacional de Protocolo e Entregas
                    </h1>
                    <h2 className="text-xs font-semibold text-black mt-0.5">
                      Lista de Conferência e Retirada de CNHs no Protocolo Geral
                    </h2>
                  </div>
                  <div className="text-right text-[10px] text-black">
                    <p><strong>Data de Emissão:</strong> {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Total Listado:</strong> {reportData.length} registro(s)</p>
                    {(filtroOrdemInicial || filtroOrdemFinal) && (
                      <p><strong>Filtro de Ordem:</strong> #{filtroOrdemInicial || "1"} até #{filtroOrdemFinal || "Fim"}</p>
                    )}
                  </div>
                </div>
              </th>
            </tr>
            <tr className="bg-gray-100 border-b-2 border-black font-bold uppercase text-[10px] text-black">
              <th className="border border-black py-1.5 px-2 w-16 text-center">Ordem</th>
              <th className="border border-black py-1.5 px-3">Nome</th>
              <th className="border border-black py-1.5 px-2 w-32 text-center">CPF</th>
              <th className="border border-black py-1.5 px-2 w-32 text-center">Data</th>
              <th className="border border-black py-1.5 px-3">Responsável pelo recebimento</th>
            </tr>
          </thead>
          <tbody>
            {reportData.map((c, idx) => (
              <tr key={c.id || idx} className="border-b border-black text-black">
                <td className="border border-black py-1 px-2 font-bold text-center font-mono">#{c.ordem}</td>
                <td className="border border-black py-1 px-3 font-semibold text-black">{c.nome}</td>
                <td className="border border-black py-1 px-2 font-mono text-center text-black">{formatCPF(c.cpf)}</td>
                <td className="border border-black py-1 px-2 text-center text-gray-400 font-mono">___/___/202___</td>
                <td className="border border-black py-1 px-3 text-black"></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 pt-2 border-t border-black flex justify-between items-center text-[9px] text-gray-600">
          <span>Sistema DETRAN-PROT — Controle Operacional de Protocolo e Entregas</span>
          <span>Orientação: Vertical (Retrato) | Cabeçalho repetido em todas as páginas</span>
        </div>
      </div>

      {/* Modal QR Code / Link do Cidadão */}
      <Modal
        isOpen={isCitizenQrModalOpen}
        onClose={() => setIsCitizenQrModalOpen(false)}
        title="📱 Link e QR Code de Consulta do Cidadão"
        size="md"
      >
        <div className="space-y-4 text-center">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-left">
            <Smartphone className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="text-xs text-emerald-800 dark:text-emerald-200">
              <p className="font-bold">Acesso Direto sem Login</p>
              <p className="mt-0.5">Disponibilize este QR Code ou link no balcão de atendimento para que o cidadão possa consultar pelo celular se a CNH já está disponível para retirada.</p>
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl inline-block border-4 border-slate-200 dark:border-slate-700 shadow-md">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                getPublicShareUrl()
              )}`}
              alt="QR Code Consulta Cidadão"
              className="w-48 h-48 mx-auto rounded-lg object-contain"
            />
          </div>

          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-left space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Link de Acesso Público:</label>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
                📊 {getPublicSearchCount()} consultas efetuadas
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 break-all select-all">
              {getPublicShareUrl()}
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  const url = getPublicShareUrl();
                  navigator.clipboard.writeText(url);
                  alert("✅ Link público de consulta copiado com sucesso!");
                }
              }}
              className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Copiar Link
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.open(`${window.location.origin}${window.location.pathname}?consulta=true`, "_blank");
                }
              }}
              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Testar Consulta Agora
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal 7: Envio WhatsApp para CNH no Protocolo Geral */}
      {whatsappModalCNH && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header do Modal */}
            <div className="p-4 bg-emerald-600 dark:bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-base">
                <MessageSquare className="w-5 h-5 text-emerald-200" />
                <span>Enviar WhatsApp — CNH #{whatsappModalCNH.ordem}</span>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappModalCNH(null)}
                className="p-1 rounded-lg hover:bg-emerald-500 text-emerald-100 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-5 space-y-4 text-xs text-slate-700 dark:text-slate-200 overflow-y-auto max-h-[80vh]">
              
              {/* Banner de Status de Notificação Anterior */}
              {whatsappModalCNH.notificado_whatsapp && (
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between text-indigo-700 dark:text-indigo-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <span className="font-bold block">Notificação já enviada anteriormente</span>
                      <span className="text-[10px] opacity-80">
                        {whatsappModalCNH.notificado_at
                          ? `Enviada em ${formatDateTime(whatsappModalCNH.notificado_at)}`
                          : "Notificação registrada no sistema"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                    ✓ Notificado
                  </span>
                </div>
              )}

              {/* Cartão Informativo da CNH */}
              <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  <span>Ordem Nº <strong className="text-slate-800 dark:text-slate-200">#{whatsappModalCNH.ordem}</strong></span>
                  <span>{formatDateTime(whatsappModalCNH.data_movimento)}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Titular</span>
                    <strong className="text-slate-800 dark:text-slate-100 text-sm block">
                      {whatsappModalCNH.nome}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">CPF</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {whatsappModalCNH.cpf ? formatCPF(whatsappModalCNH.cpf) : "-"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500">Situação no Protocolo:</span>
                  <Badge situacao={whatsappModalCNH.situacao} />
                </div>
              </div>

              {/* Exibição de Erro da API Wasender se houver */}
              {whatsappApiError && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-700 dark:text-rose-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-[11px]">
                    <strong className="block font-bold">Falha no envio da API Wasender:</strong>
                    <span>{whatsappApiError}</span>
                    <span className="block mt-1 font-semibold text-slate-600 dark:text-slate-300">
                      💡 Você pode clicar em "Abrir no WhatsApp Web" abaixo para enviar manualmente.
                    </span>
                  </div>
                </div>
              )}

              {/* Campo do Número do Telefone / Celular */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Número do WhatsApp do Cidadão:
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold dark:text-emerald-400">Integração Wasender API Ativa</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: (91) 99888-7766 ou 91998887766"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Campo de Texto Personalizado */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-200">
                    Mensagem Personalizada (Situação: <span className="text-emerald-600 dark:text-emerald-400">{whatsappModalCNH.situacao}</span>):
                  </label>
                  <button
                    type="button"
                    onClick={() => setWhatsappMessage(getWhatsAppMessageForCNH(whatsappModalCNH))}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer font-semibold"
                  >
                    Restaurar Padrão
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                />
              </div>

            </div>

            {/* Footer do Modal */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="w-full sm:w-auto px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedMessage ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>Copiar Texto</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                title="Abre a mensagem diretamente no WhatsApp Web ou App"
                className="w-full sm:w-auto px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp Web</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </button>

              <button
                type="button"
                disabled={isSendingWhatsAppApi}
                onClick={handleSendWhatsAppAPI}
                title="Envia a mensagem de forma 100% automática através da Wasender API"
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                {isSendingWhatsAppApi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando via API...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar Wasender API</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
