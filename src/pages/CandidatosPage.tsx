import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  UserCheck,
  Search,
  Filter,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Printer,
  SlidersHorizontal,
  Check,
  X,
  Phone,
  PhoneCall,
  ExternalLink,
  Copy,
  FolderArchive,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Hash,
  Building2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Send,
  HelpCircle,
  FileCheck,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { getCandidatosAll, getMemorandos, getGeralCNHs, remeterCandidatosFaltantesAoGeral } from "../services/db";
import { Candidato, Memorando, GeralCNH, SituacaoGeral } from "../types";
import { formatCPF, formatPhone, formatDateTime, formatDate, normalizeSearch, matchDigitsSafe } from "../lib/utils";
import { getOrgaoConfig } from "../services/orgaoService";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";
import { AuditoriaRemessaCandidatosModal } from "../components/AuditoriaRemessaCandidatosModal";
import { AuditoriaDuplicatasCandidatosModal } from "../components/AuditoriaDuplicatasCandidatosModal";
import { scanCandidatosDuplicates } from "../services/candidatosDuplicatesService";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Estrutura do candidato enriquecido com dados do memorando e CNH correspondente
export interface CandidatoEnriquecido extends Candidato {
  sequencia_geral?: number; // Nova sequência numérica única da CNH/candidato na tabela
  memorando_numero?: string;
  memorando_remessa?: string;
  memorando_status?: "Em elaboração" | "Remetido" | string;
  memorando_data?: string;
  memorando_usuario?: string;
  // CNH associada (se já foi remetida ao protocolo geral)
  cnh_id?: string;
  cnh_ordem?: number;
  cnh_situacao?: SituacaoGeral | "Aguardando Envio";
  cnh_gaveta?: string;
  cnh_reparticao?: string;
  cnh_data_movimento?: string;
  cnh_responsavel_nome?: string;
}

// Configuração de visibilidade das colunas
export interface ColumnVisibility {
  index: boolean;
  nome: boolean;
  cpf: boolean;
  pa: boolean;
  telefone: boolean;
  memorando: boolean;
  remessa: boolean;
  status_memo: boolean;
  situacao_cnh: boolean;
  localizacao: boolean;
  data_cadastro: boolean;
  acoes: boolean;
}

const DEFAULT_COLUMNS: ColumnVisibility = {
  index: true,
  nome: true,
  cpf: true,
  pa: true,
  telefone: true,
  memorando: true,
  remessa: true,
  status_memo: false,
  situacao_cnh: true,
  localizacao: true,
  data_cadastro: false,
  acoes: true,
};

const COLUMN_DEFINITIONS: { key: keyof ColumnVisibility; label: string; description: string }[] = [
  { key: "index", label: "Nº Sequencial (#)", description: "Nova sequência numérica única de cada CNH na tabela" },
  { key: "nome", label: "Nome do Candidato", description: "Nome completo do titular e ordem da CNH" },
  { key: "cpf", label: "CPF", description: "Cadastro de Pessoa Física" },
  { key: "pa", label: "Processo (PA)", description: "Processo Administrativo / Registro CNH" },
  { key: "telefone", label: "Telefone / Contato", description: "Número de celular para contato" },
  { key: "memorando", label: "Memorando", description: "Número do memorando de remessa" },
  { key: "remessa", label: "Remessa", description: "Lote ou código da remessa" },
  { key: "status_memo", label: "Status do Memo", description: "Elaboração ou Remetido" },
  { key: "situacao_cnh", label: "Situação CNH", description: "Status no protocolo geral" },
  { key: "localizacao", label: "Gaveta & Repartição", description: "Local físico de arquivamento" },
  { key: "data_cadastro", label: "Data de Cadastro", description: "Data de inclusão no sistema" },
  { key: "acoes", label: "Ações", description: "Botões de detalhes e cópia rápida" },
];

const LOCAL_STORAGE_COLS_KEY = "detran_candidatos_cols_v1";

type SortField = "seq" | "nome" | "cpf" | "pa" | "telefone" | "memorando" | "created_at" | "situacao";
type SortDirection = "asc" | "desc";

export const CandidatosPage: React.FC = () => {
  const { user, canEdit } = useAuth();

  // Estados principais de dados
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [memorandos, setMemorandos] = useState<Memorando[]>([]);
  const [geralCNHs, setGeralCNHs] = useState<GeralCNH[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Modal de Auditoria e Remessa de CNHs Faltantes
  const [isAuditoriaModalOpen, setIsAuditoriaModalOpen] = useState<boolean>(false);
  // Modal de Varredura e Auditoria de Duplicatas
  const [isDuplicatasModalOpen, setIsDuplicatasModalOpen] = useState<boolean>(false);

  // Filtros de busca
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedMemorando, setSelectedMemorando] = useState<string>("all");
  const [selectedRemessa, setSelectedRemessa] = useState<string>("all");
  const [selectedStatusMemo, setSelectedStatusMemo] = useState<string>("all"); // "all" | "Elaboração" | "Remetido"
  const [selectedSituacaoCNH, setSelectedSituacaoCNH] = useState<string>("all"); // "all" | SituacaoGeral | "Aguardando Envio"
  const [filterPA, setFilterPA] = useState<"all" | "com_pa" | "sem_pa">("all");
  const [filterTelefone, setFilterTelefone] = useState<"all" | "com_telefone" | "sem_telefone">("all");

  // Ordenação
  const [sortField, setSortField] = useState<SortField>("nome");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Paginação
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Visibilidade de colunas
  const [columns, setColumns] = useState<ColumnVisibility>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_COLS_KEY);
      if (saved) {
        return { ...DEFAULT_COLUMNS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Erro ao carregar preferências de colunas:", e);
    }
    return DEFAULT_COLUMNS;
  });
  const [isColsDropdownOpen, setIsColsDropdownOpen] = useState<boolean>(false);
  const colsDropdownRef = useRef<HTMLDivElement>(null);

  // Modal de Detalhes do Candidato
  const [selectedCandidato, setSelectedCandidato] = useState<CandidatoEnriquecido | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Fechar dropdown de colunas ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colsDropdownRef.current && !colsDropdownRef.current.contains(event.target as Node)) {
        setIsColsDropdownOpen(false);
      }
    };
    if (isColsDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isColsDropdownOpen]);

  // Salvar preferências de colunas no localStorage
  const handleToggleColumn = (key: keyof ColumnVisibility) => {
    setColumns((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(LOCAL_STORAGE_COLS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Erro ao salvar preferências de colunas:", e);
      }
      return updated;
    });
  };

  const handleSelectAllColumns = () => {
    const allOn: ColumnVisibility = {
      index: true,
      nome: true,
      cpf: true,
      pa: true,
      telefone: true,
      memorando: true,
      remessa: true,
      status_memo: true,
      situacao_cnh: true,
      localizacao: true,
      data_cadastro: true,
      acoes: true,
    };
    setColumns(allOn);
    try {
      localStorage.setItem(LOCAL_STORAGE_COLS_KEY, JSON.stringify(allOn));
    } catch {}
  };

  const handleResetDefaultColumns = () => {
    setColumns(DEFAULT_COLUMNS);
    try {
      localStorage.setItem(LOCAL_STORAGE_COLS_KEY, JSON.stringify(DEFAULT_COLUMNS));
    } catch {}
  };

  // Carregar dados
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [candsData, memosData, cnhsData] = await Promise.all([
        getCandidatosAll(),
        getMemorandos(),
        getGeralCNHs(),
      ]);

      setCandidatos(candsData || []);
      setMemorandos(memosData || []);
      setGeralCNHs(cnhsData || []);
    } catch (err) {
      console.error("Erro ao carregar dados dos candidatos:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Ouvinte para atualizações automáticas via sincronização
    const handleSync = () => {
      loadData(true);
    };
    window.addEventListener("detran_sync_updated", handleSync);
    return () => {
      window.removeEventListener("detran_sync_updated", handleSync);
    };
  }, [loadData]);

  // Cruzamento dos dados para enriquecer os candidatos (visão geral da tabela filha de memorandos)
  const candidatosEnriquecidos = useMemo<CandidatoEnriquecido[]>(() => {
    // 1. Mapeamento de memorandos por ID
    const memoMap = new Map<string, Memorando>();
    memorandos.forEach((m) => {
      memoMap.set(m.id, m);
    });

    // 2. Mapeamento estrito de CNHs para evitar QUALQUER duplicidade na tabela geral
    // Uma CNH física só pode estar vinculada a exatamente um candidato.
    const assignedCnhIds = new Set<string>();

    // Indexação primária por candidato_id
    const cnhByCandId = new Map<string, GeralCNH>();
    // Indexação por memorando_id + cpf limpo
    const cnhByMemoAndCpf = new Map<string, GeralCNH>();
    // Indexação por memorando_id + PA limpo
    const cnhByMemoAndPa = new Map<string, GeralCNH>();
    // CNHs avulsas (sem memorando_id) por CPF
    const cnhAvulsaByCpf = new Map<string, GeralCNH>();
    const cnhAvulsaByPa = new Map<string, GeralCNH>();

    geralCNHs.forEach((c) => {
      if (c.candidato_id) {
        cnhByCandId.set(c.candidato_id, c);
      }
      const cleanCpf = c.cpf ? c.cpf.replace(/\D/g, "") : "";
      const cleanPa = c.pa ? c.pa.replace(/\D/g, "") : "";

      if (c.memorando_id) {
        if (cleanCpf) cnhByMemoAndCpf.set(`${c.memorando_id}_${cleanCpf}`, c);
        if (cleanPa) cnhByMemoAndPa.set(`${c.memorando_id}_${cleanPa}`, c);
      } else {
        if (cleanCpf) cnhAvulsaByCpf.set(cleanCpf, c);
        if (cleanPa) cnhAvulsaByPa.set(cleanPa, c);
      }
    });

    // Deduplicação estrita de candidatos por ID para a listagem geral
    const seenCandIds = new Set<string>();
    const candsValidos = candidatos.filter((cand) => {
      if (!cand.id || seenCandIds.has(cand.id)) return false;
      seenCandIds.add(cand.id);
      return true;
    });

    return candsValidos.map((cand, index) => {
      const memo = memoMap.get(cand.memorando_id);
      const cleanCpf = cand.cpf ? cand.cpf.replace(/\D/g, "") : "";
      const cleanPa = cand.pa ? cand.pa.replace(/\D/g, "") : "";

      // Busca estrita e exclusiva da CNH associada
      let cnh: GeralCNH | undefined = undefined;

      // 1ª Prioridade: Vinculação direta por candidato_id
      const directCnh = cnhByCandId.get(cand.id);
      if (directCnh && !assignedCnhIds.has(directCnh.id)) {
        cnh = directCnh;
      }

      // 2ª Prioridade: Vinculação por memorando_id + CPF ou PA
      if (!cnh && cand.memorando_id) {
        const memoCnh = (cleanCpf && cnhByMemoAndCpf.get(`${cand.memorando_id}_${cleanCpf}`)) ||
                        (cleanPa && cnhByMemoAndPa.get(`${cand.memorando_id}_${cleanPa}`));
        if (memoCnh && !assignedCnhIds.has(memoCnh.id)) {
          cnh = memoCnh;
        }
      }

      // 3ª Prioridade: Apenas se o memorando está Remetido e existir CNH avulsa não reclamada
      if (!cnh && memo?.status === "Remetido") {
        const avulsa = (cleanCpf && cnhAvulsaByCpf.get(cleanCpf)) ||
                       (cleanPa && cnhAvulsaByPa.get(cleanPa));
        if (avulsa && !assignedCnhIds.has(avulsa.id)) {
          cnh = avulsa;
        }
      }

      // Se encontrou uma CNH válida, marca o ID como já atribuído
      if (cnh) {
        assignedCnhIds.add(cnh.id);
      }

      // Determinação segura da situação:
      // Se o candidato está em memorando em elaboração e não tem CNH emitida, NUNCA herda CNH de outro lote
      let situacaoCNH: SituacaoGeral | "Aguardando Envio" = "Aguardando Envio";
      if (cnh) {
        situacaoCNH = cnh.situacao;
      } else if (memo?.status === "Remetido") {
        situacaoCNH = "Remetida";
      }

      return {
        ...cand,
        sequencia_geral: index + 1,
        memorando_numero: memo?.numero || "Sem memorando",
        memorando_remessa: cand.remessa || memo?.remessa || "—",
        memorando_status: memo?.status || "Em elaboração",
        memorando_data: memo?.remetido_em || memo?.created_at,
        memorando_usuario: memo?.usuario_nome,
        cnh_id: cnh?.id,
        cnh_ordem: cnh?.ordem,
        cnh_situacao: situacaoCNH,
        cnh_gaveta: cnh?.gaveta,
        cnh_reparticao: cnh?.reparticao,
        cnh_data_movimento: cnh?.data_movimento,
        cnh_responsavel_nome: cnh?.responsavel_nome,
      };
    });
  }, [candidatos, memorandos, geralCNHs]);

  // Lista única de remessas para o seletor de filtro
  const remessasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    candidatosEnriquecidos.forEach((c) => {
      if (c.memorando_remessa && c.memorando_remessa !== "—") {
        set.add(c.memorando_remessa);
      }
    });
    return Array.from(set).sort();
  }, [candidatosEnriquecidos]);

  // Candidatos que já foram remetidos (memorando com status "Remetido"), mas que NÃO estão na Tabela Geral de CNHs
  const candidatosRemetidosFaltantes = useMemo(() => {
    return candidatosEnriquecidos.filter(
      (c) => c.memorando_status === "Remetido" && !c.cnh_id
    );
  }, [candidatosEnriquecidos]);

  // Grupos de duplicatas em candidatos para exibição e auditoria
  const duplicatasDetectadas = useMemo(() => {
    return scanCandidatosDuplicates(candidatosEnriquecidos);
  }, [candidatosEnriquecidos]);

  // Contadores para métricas
  const metricas = useMemo(() => {
    const total = candidatosEnriquecidos.length;
    const comPA = candidatosEnriquecidos.filter((c) => c.pa && c.pa.trim().length > 0).length;
    const comTelefone = candidatosEnriquecidos.filter((c) => c.telefone && c.telefone.replace(/\D/g, "").length >= 8).length;
    const remetidos = candidatosEnriquecidos.filter((c) => c.memorando_status === "Remetido" || c.cnh_id).length;
    const emElaboracao = candidatosEnriquecidos.filter(
      (c) => (c.memorando_status === "Em elaboração" || c.memorando_status === "Elaboração") && !c.cnh_id
    ).length;
    const entregues = candidatosEnriquecidos.filter((c) => c.cnh_situacao === "Entregue").length;

    return {
      total,
      comPA,
      percentPA: total > 0 ? Math.round((comPA / total) * 100) : 0,
      comTelefone,
      percentTelefone: total > 0 ? Math.round((comTelefone / total) * 100) : 0,
      remetidos,
      percentRemetidos: total > 0 ? Math.round((remetidos / total) * 100) : 0,
      emElaboracao,
      percentEmElaboracao: total > 0 ? Math.round((emElaboracao / total) * 100) : 0,
      entregues,
      percentEntregues: total > 0 ? Math.round((entregues / total) * 100) : 0,
      remetidosFaltantes: candidatosRemetidosFaltantes.length,
      duplicatasGrupos: duplicatasDetectadas.length,
    };
  }, [candidatosEnriquecidos, candidatosRemetidosFaltantes, duplicatasDetectadas]);

  // Filtragem dos dados
  const candidatosFiltrados = useMemo(() => {
    const cleanQuery = normalizeSearch(searchQuery);

    return candidatosEnriquecidos.filter((c) => {
      // 1. Busca textual
      if (cleanQuery) {
        const matchNome = normalizeSearch(c.nome).includes(cleanQuery);
        const matchCpf = matchDigitsSafe(c.cpf, searchQuery) || normalizeSearch(c.cpf).includes(cleanQuery);
        const matchPa = matchDigitsSafe(c.pa, searchQuery) || normalizeSearch(c.pa).includes(cleanQuery);
        const matchTel = matchDigitsSafe(c.telefone, searchQuery);
        const matchMemo = normalizeSearch(c.memorando_numero).includes(cleanQuery);
        const matchRemessa = normalizeSearch(c.memorando_remessa).includes(cleanQuery);
        const matchNum = c.numero && c.numero.toString().includes(cleanQuery);

        if (!matchNome && !matchCpf && !matchPa && !matchTel && !matchMemo && !matchRemessa && !matchNum) {
          return false;
        }
      }

      // 2. Filtro por Memorando
      if (selectedMemorando !== "all" && c.memorando_id !== selectedMemorando) {
        return false;
      }

      // 3. Filtro por Remessa
      if (selectedRemessa !== "all" && c.memorando_remessa !== selectedRemessa) {
        return false;
      }

      // 4. Filtro por Status do Memorando
      if (selectedStatusMemo !== "all") {
        if (selectedStatusMemo === "Remetido" && c.memorando_status !== "Remetido") {
          return false;
        }
        if (
          (selectedStatusMemo === "Em elaboração" || selectedStatusMemo === "Elaboração") &&
          c.memorando_status !== "Em elaboração" &&
          c.memorando_status !== "Elaboração"
        ) {
          return false;
        }
      }

      // 5. Filtro por Situação da CNH
      if (selectedSituacaoCNH !== "all") {
        if (selectedSituacaoCNH === "remetidas_fora_geral") {
          if (!(c.memorando_status === "Remetido" && !c.cnh_id)) return false;
        } else if (selectedSituacaoCNH === "nao_gerada") {
          if (c.cnh_id || c.memorando_status === "Remetido") return false;
        } else if (c.cnh_situacao !== selectedSituacaoCNH) {
          return false;
        }
      }

      // 6. Filtro por PA
      if (filterPA === "com_pa" && (!c.pa || !c.pa.trim())) {
        return false;
      }
      if (filterPA === "sem_pa" && c.pa && c.pa.trim()) {
        return false;
      }

      // 7. Filtro por Telefone
      if (filterTelefone === "com_telefone" && (!c.telefone || c.telefone.replace(/\D/g, "").length < 8)) {
        return false;
      }
      if (filterTelefone === "sem_telefone" && c.telefone && c.telefone.replace(/\D/g, "").length >= 8) {
        return false;
      }

      return true;
    });
  }, [
    candidatosEnriquecidos,
    searchQuery,
    selectedMemorando,
    selectedRemessa,
    selectedStatusMemo,
    selectedSituacaoCNH,
    filterPA,
    filterTelefone,
  ]);

  // Ordenação com atribuição da nova sequência numérica
  const candidatosOrdenados = useMemo(() => {
    const sorted = [...candidatosFiltrados].sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      switch (sortField) {
        case "seq":
          valA = a.sequencia_geral || 0;
          valB = b.sequencia_geral || 0;
          break;
        case "nome":
          valA = a.nome.toLowerCase();
          valB = b.nome.toLowerCase();
          break;
        case "cpf":
          valA = (a.cpf || "").replace(/\D/g, "");
          valB = (b.cpf || "").replace(/\D/g, "");
          break;
        case "pa":
          valA = (a.pa || "").replace(/\D/g, "");
          valB = (b.pa || "").replace(/\D/g, "");
          break;
        case "telefone":
          valA = (a.telefone || "").replace(/\D/g, "");
          valB = (b.telefone || "").replace(/\D/g, "");
          break;
        case "memorando":
          valA = a.memorando_numero || "";
          valB = b.memorando_numero || "";
          break;
        case "situacao":
          valA = a.cnh_situacao || "";
          valB = b.cnh_situacao || "";
          break;
        case "created_at":
          valA = new Date(a.created_at || 0).getTime();
          valB = new Date(b.created_at || 0).getTime();
          break;
        default:
          valA = a.nome;
          valB = b.nome;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    // Atribuição de nova sequência numérica contínua para cada CNH na visão geral
    return sorted.map((cand, idx) => ({
      ...cand,
      sequencia_geral: idx + 1
    }));
  }, [candidatosFiltrados, sortField, sortDirection]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(candidatosOrdenados.length / pageSize));
  const paginatedCandidatos = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return candidatosOrdenados.slice(startIndex, startIndex + pageSize);
  }, [candidatosOrdenados, currentPage, pageSize]);

  // Resetar para página 1 ao mudar qualquer filtro
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    selectedMemorando,
    selectedRemessa,
    selectedStatusMemo,
    selectedSituacaoCNH,
    filterPA,
    filterTelefone,
    pageSize,
  ]);

  // Função para alternar ordenação
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (selectedMemorando !== "all") count++;
    if (selectedRemessa !== "all") count++;
    if (selectedStatusMemo !== "all") count++;
    if (selectedSituacaoCNH !== "all") count++;
    if (filterPA !== "all") count++;
    if (filterTelefone !== "all") count++;
    return count;
  }, [
    searchQuery,
    selectedMemorando,
    selectedRemessa,
    selectedStatusMemo,
    selectedSituacaoCNH,
    filterPA,
    filterTelefone,
  ]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedMemorando("all");
    setSelectedRemessa("all");
    setSelectedStatusMemo("all");
    setSelectedSituacaoCNH("all");
    setFilterPA("all");
    setFilterTelefone("all");
  };

  // Copiar para área de transferência
  const handleCopyText = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  // Exportar para Excel
  const handleExportExcel = () => {
    if (candidatosOrdenados.length === 0) return;

    const dataToExport = candidatosOrdenados.map((c, idx) => ({
      "Nº Sequencial (#)": idx + 1,
      "Item no Memo": c.numero || "—",
      Nome: c.nome,
      CPF: formatCPF(c.cpf),
      "Processo (PA)": c.pa || "—",
      Telefone: c.telefone ? formatPhone(c.telefone) : "—",
      Memorando: c.memorando_numero || "—",
      Remessa: c.memorando_remessa || "—",
      "Status Memorando": c.memorando_status || "—",
      "Ordem CNH": c.cnh_ordem ? `#${c.cnh_ordem}` : "Sem CNH gerada",
      "Situação Protocolo": c.cnh_situacao || "—",
      Gaveta: c.cnh_gaveta || "—",
      Repartição: c.cnh_reparticao || "—",
      "Responsável / CFC": c.cnh_responsavel_nome || "—",
      "Data Cadastro": formatDateTime(c.created_at),
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Candidatos");
    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Candidatos_DETRAN_${dateStr}.xlsx`);
  };

  // Exportar para CSV
  const handleExportCSV = () => {
    if (candidatosOrdenados.length === 0) return;

    const headers = [
      "Seq_Geral",
      "Item_Memo",
      "Nome",
      "CPF",
      "PA",
      "Telefone",
      "Memorando",
      "Remessa",
      "Status_Memo",
      "Ordem_CNH",
      "Situacao_CNH",
      "Gaveta",
      "Reparticao",
      "Data_Cadastro",
    ];

    const rows = candidatosOrdenados.map((c, idx) => [
      `"${idx + 1}"`,
      `"${c.numero || ""}"`,
      `"${(c.nome || "").replace(/"/g, '""')}"`,
      `"${formatCPF(c.cpf)}"`,
      `"${c.pa || ""}"`,
      `"${c.telefone ? formatPhone(c.telefone) : ""}"`,
      `"${c.memorando_numero || ""}"`,
      `"${c.memorando_remessa || ""}"`,
      `"${c.memorando_status || ""}"`,
      `"${c.cnh_ordem ? `#${c.cnh_ordem}` : ""}"`,
      `"${c.cnh_situacao || ""}"`,
      `"${c.cnh_gaveta || ""}"`,
      `"${c.cnh_reparticao || ""}"`,
      `"${formatDateTime(c.created_at)}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((e) => e.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `Candidatos_DETRAN_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Imprimir / Gerar PDF
  const handlePrintPDF = async () => {
    if (candidatosOrdenados.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape" });
    const orgao = await getOrgaoConfig();

    // Cabeçalho institucional
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(orgao.orgao || orgao.sigla || "DETRAN - DEPARTAMENTO DE TRÂNSITO", 14, 15);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Visão Geral de Candidatos e CNHs (Tabela Filha de Memorandos) • Emitido em: ${formatDateTime(new Date())}`,
      14,
      22
    );

    const tableData = candidatosOrdenados.map((c, idx) => [
      String(idx + 1).padStart(2, "0"),
      c.nome,
      formatCPF(c.cpf),
      c.pa || "—",
      c.telefone ? formatPhone(c.telefone) : "—",
      c.memorando_numero || "—",
      c.numero ? `Item ${c.numero}` : "—",
      c.cnh_ordem ? `#${c.cnh_ordem}` : "—",
      c.cnh_situacao || "—",
      c.cnh_gaveta ? `${c.cnh_gaveta} / ${c.cnh_reparticao || ""}` : "—",
    ]);

    autoTable(doc, {
      head: [["#", "Nome", "CPF", "PA", "Telefone", "Memorando", "Item Memo", "Ordem CNH", "Situação", "Localização"]],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`Candidatos_Relatorio_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // Helper para gerar avatar com iniciais
  const getInitials = (name: string) => {
    if (!name) return "??";
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Badge da Situação da CNH
  const renderSituacaoBadge = (situacao?: SituacaoGeral | "Aguardando Envio") => {
    switch (situacao) {
      case "Entregue":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            Entregue
          </span>
        );
      case "Recebida":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <FolderArchive className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
            Recebida
          </span>
        );
      case "Remetida":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <Send className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
            Remetida
          </span>
        );
      case "Pendente":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            Pendente
          </span>
        );
      case "Aguardando Envio":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
            Em Elaboração
          </span>
        );
    }
  };

  return (
    <div id="candidatos-page-container" className="flex flex-col gap-5 pb-10">
      {/* 1. Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Candidatos
              <span className="text-xs px-2.5 py-0.5 font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
                {candidatosFiltrados.length} encontrados
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Painel analítico e listagem consolidada de candidatos de remessas e memorandos
            </p>
          </div>
        </div>

        {/* Botões de Ação do Cabeçalho */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Atualização */}
          <button
            id="btn-refresh-candidatos"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            title="Atualizar dados"
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
          </button>

          {/* Botão de Auditoria e Checagem de Remessas */}
          <button
            id="btn-auditoria-remessas"
            onClick={() => setIsAuditoriaModalOpen(true)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold text-xs transition-all cursor-pointer border ${
              candidatosRemetidosFaltantes.length > 0
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20"
                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
            }`}
            title="Auditar candidatos de memorandos remetidos que não constam na Tabela Geral"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Auditar Remessas</span>
            {candidatosRemetidosFaltantes.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full bg-white text-amber-700 text-[10px] font-black animate-pulse">
                {candidatosRemetidosFaltantes.length}
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                OK
              </span>
            )}
          </button>

          {/* Botão de Varredura e Auditoria de Duplicatas */}
          <button
            id="btn-varredura-duplicatas-candidatos"
            onClick={() => setIsDuplicatasModalOpen(true)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold text-xs transition-all cursor-pointer border ${
              duplicatasDetectadas.length > 0
                ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-700 shadow-md shadow-purple-600/20"
                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
            }`}
            title="Executar varredura de duplicatas em candidatos com modal de auditoria para saneamento"
          >
            <Copy className="w-4 h-4" />
            <span>Varredura Duplicatas</span>
            {duplicatasDetectadas.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full bg-white text-purple-700 text-[10px] font-black animate-pulse">
                {duplicatasDetectadas.length}
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                0
              </span>
            )}
          </button>

          {/* Botão de Colunas (Dropdown) */}
          <div className="relative" ref={colsDropdownRef}>
            <button
              id="btn-toggle-columns-dropdown"
              onClick={() => setIsColsDropdownOpen(!isColsDropdownOpen)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <SlidersHorizontal className="w-4 h-4 text-slate-500" />
              <span>Colunas</span>
              <span className="px-1.5 py-0.2 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                {Object.values(columns).filter(Boolean).length}/{COLUMN_DEFINITIONS.length}
              </span>
            </button>

            {/* Menu Popover de Colunas */}
            {isColsDropdownOpen && (
              <div
                id="columns-visibility-menu"
                className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-3 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                    Colunas Visíveis
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAllColumns}
                      className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Todas
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <button
                      type="button"
                      onClick={handleResetDefaultColumns}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:underline cursor-pointer"
                    >
                      Padrão
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {COLUMN_DEFINITIONS.map((col) => {
                    const isChecked = columns[col.key];
                    return (
                      <label
                        key={col.key}
                        className={`flex items-start gap-2.5 p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? "bg-blue-50/60 dark:bg-blue-950/30 text-slate-900 dark:text-slate-100 font-medium"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleColumn(col.key)}
                          className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold leading-tight">{col.label}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">
                            {col.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Exportações */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              id="btn-export-excel"
              onClick={handleExportExcel}
              disabled={candidatosFiltrados.length === 0}
              title="Exportar dados filtrados para Excel (.xlsx)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              id="btn-export-csv"
              onClick={handleExportCSV}
              disabled={candidatosFiltrados.length === 0}
              title="Exportar dados filtrados para CSV"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              id="btn-export-pdf"
              onClick={handlePrintPDF}
              disabled={candidatosFiltrados.length === 0}
              title="Imprimir / Salvar relatório PDF"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Cards de Métricas */}
      <div id="candidatos-metrics-cards" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Total Geral */}
        <div
          onClick={handleClearFilters}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            activeFiltersCount === 0
              ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 shadow-sm"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Geral
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.total}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Candidatos cadastrados</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">100%</span>
          </div>
        </div>

        {/* Card 2: Com PA (Processo) */}
        <div
          onClick={() => setFilterPA(filterPA === "com_pa" ? "all" : "com_pa")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            filterPA === "com_pa"
              ? "bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 shadow-sm ring-2 ring-purple-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Com PA
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 flex items-center justify-center">
              <Hash className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.comPA}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Processo preenchido</span>
            <span className="font-bold text-purple-600 dark:text-purple-400">{metricas.percentPA}%</span>
          </div>
        </div>

        {/* Card 3: Com Telefone / WhatsApp */}
        <div
          onClick={() => setFilterTelefone(filterTelefone === "com_telefone" ? "all" : "com_telefone")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            filterTelefone === "com_telefone"
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
            <span>Telefone / WhatsApp</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{metricas.percentTelefone}%</span>
          </div>
        </div>

        {/* Card 4: Remetidos / Protocolo */}
        <div
          onClick={() => setSelectedStatusMemo(selectedStatusMemo === "Remetido" ? "all" : "Remetido")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            selectedStatusMemo === "Remetido"
              ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm ring-2 ring-indigo-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Remetidos
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.remetidos}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>CNHs no protocolo</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{metricas.percentRemetidos}%</span>
          </div>
        </div>

        {/* Card 5: Em Elaboração */}
        <div
          onClick={() =>
            setSelectedStatusMemo(
              selectedStatusMemo === "Em elaboração" || selectedStatusMemo === "Elaboração"
                ? "all"
                : "Em elaboração"
            )
          }
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            selectedStatusMemo === "Em elaboração" || selectedStatusMemo === "Elaboração"
              ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 shadow-sm ring-2 ring-amber-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Em Elaboração
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.emElaboracao}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Aguardando envio</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">{metricas.percentEmElaboracao}%</span>
          </div>
        </div>

        {/* Card 6: CNH Entregue */}
        <div
          onClick={() => setSelectedSituacaoCNH(selectedSituacaoCNH === "Entregue" ? "all" : "Entregue")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            selectedSituacaoCNH === "Entregue"
              ? "bg-teal-50/80 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 shadow-sm ring-2 ring-teal-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Entregues
            </span>
            <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-300 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.entregues}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Retiradas com sucesso</span>
            <span className="font-bold text-teal-600 dark:text-teal-400">{metricas.percentEntregues}%</span>
          </div>
        </div>
      </div>

      {/* Alerta de Auditoria: Candidatos Remetidos Ausentes no Geral */}
      {candidatosRemetidosFaltantes.length > 0 && (
        <div
          id="alert-candidatos-remetidos-faltantes"
          className="p-4 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950 dark:text-amber-100 shadow-xs animate-in fade-in duration-200"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs sm:text-sm flex items-center gap-2">
                Auditoria: {candidatosRemetidosFaltantes.length} CNH(s) remetida(s) ausente(s) na Tabela Geral
                <span className="px-2 py-0.2 rounded-md bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 text-[10px] font-black">
                  Ação Necessária
                </span>
              </h4>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                Estes candidatos pertencem a memorandos remetidos, porém os registros físicos de CNH ainda não constam na base do Protocolo Geral.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => setSelectedSituacaoCNH(selectedSituacaoCNH === "remetidas_fora_geral" ? "all" : "remetidas_fora_geral")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                selectedSituacaoCNH === "remetidas_fora_geral"
                  ? "bg-amber-600 text-white border-amber-600 font-bold"
                  : "bg-amber-100/70 hover:bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:hover:bg-amber-900/70 dark:text-amber-200 border-amber-300 dark:border-amber-700"
              }`}
            >
              {selectedSituacaoCNH === "remetidas_fora_geral" ? "Ver Todos" : "Filtrar na Lista"}
            </button>
            <button
              onClick={() => setIsAuditoriaModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Auditar e Remeter CNHs</span>
            </button>
          </div>
        </div>
      )}

      {/* Alerta de Auditoria: Duplicatas Detectadas na Tabela de Candidatos */}
      {duplicatasDetectadas.length > 0 && (
        <div
          id="alert-candidatos-duplicatas-detectadas"
          className="p-4 bg-purple-50/90 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-purple-950 dark:text-purple-100 shadow-xs animate-in fade-in duration-200"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-200/80 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs sm:text-sm flex items-center gap-2">
                Auditoria: {duplicatasDetectadas.length} grupo(s) de duplicatas identificado(s) na Tabela de Candidatos
                <span className="px-2 py-0.2 rounded-md bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-200 text-[10px] font-black">
                  Saneamento
                </span>
              </h4>
              <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mt-0.5">
                Foram detectados candidatos repetidos com mesmo CPF, mesmo Processo (PA) ou correspondência fonética. Abra a auditoria para revisar e expurgar duplicatas com segurança.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              id="btn-abrir-auditoria-duplicatas-banner"
              onClick={() => setIsDuplicatasModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-md shadow-purple-600/20 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Auditar Duplicatas</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Painel de Filtros de Busca */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Filtros de Pesquisa
            </span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                {activeFiltersCount} {activeFiltersCount === 1 ? "filtro ativo" : "filtros ativos"}
              </span>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Limpar Filtros
            </button>
          )}
        </div>

        {/* Linha 1 de Filtros: Campo de Busca Ampla */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            id="input-search-candidatos"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por Nome do Candidato, CPF, Processo (PA), Telefone, Memorando..."
            className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="Limpar pesquisa"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Linha 2 de Filtros: Seletores Específicos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Filtro: Memorando */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Memorando
            </label>
            <select
              value={selectedMemorando}
              onChange={(e) => setSelectedMemorando(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value="all">Todos os Memorandos</option>
              {memorandos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.numero} ({m.remessa || "Sem remessa"}) - {m.status}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro: Remessa */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Remessa
            </label>
            <select
              value={selectedRemessa}
              onChange={(e) => setSelectedRemessa(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value="all">Todas as Remessas</option>
              {remessasDisponiveis.map((rem) => (
                <option key={rem} value={rem}>
                  {rem}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro: Status do Memorando */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Status do Memorando
            </label>
            <select
              value={selectedStatusMemo}
              onChange={(e) => setSelectedStatusMemo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value="all">Todos os Status</option>
              <option value="Remetido">Remetido (Protocolado)</option>
              <option value="Elaboração">Em Elaboração</option>
            </select>
          </div>

          {/* Filtro: Situação no Protocolo (CNH) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Situação CNH / Protocolo
            </label>
            <select
              value={selectedSituacaoCNH}
              onChange={(e) => setSelectedSituacaoCNH(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value="all">Todas as Situações</option>
              {candidatosRemetidosFaltantes.length > 0 && (
                <option value="remetidas_fora_geral">
                  ⚠️ Remetidas fora do Geral ({candidatosRemetidosFaltantes.length})
                </option>
              )}
              <option value="Recebida">Recebida (Arquivada)</option>
              <option value="Entregue">Entregue ao Titular</option>
              <option value="Remetida">Remetida (Em Trânsito)</option>
              <option value="Pendente">Pendente</option>
              <option value="Aguardando Envio">Aguardando Envio (Memo)</option>
            </select>
          </div>

          {/* Filtro Combinado: PA e Telefone */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 truncate">
                Filtro PA
              </label>
              <select
                value={filterPA}
                onChange={(e) => setFilterPA(e.target.value as any)}
                className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
              >
                <option value="all">Todos</option>
                <option value="com_pa">Com PA</option>
                <option value="sem_pa">Sem PA</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 truncate">
                Telefone
              </label>
              <select
                value={filterTelefone}
                onChange={(e) => setFilterTelefone(e.target.value as any)}
                className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
              >
                <option value="all">Todos</option>
                <option value="com_telefone">Com Tel.</option>
                <option value="sem_telefone">Sem Tel.</option>
              </select>
            </div>
          </div>
        </div>

        {/* Badges de filtros rápidos ativos */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-1">
              Filtros em aplicação:
            </span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Termo: "{searchQuery}"
                <button onClick={() => setSearchQuery("")} className="hover:text-blue-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedMemorando !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                Memo: {memorandos.find((m) => m.id === selectedMemorando)?.numero || selectedMemorando}
                <button onClick={() => setSelectedMemorando("all")} className="hover:text-purple-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedRemessa !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Remessa: {selectedRemessa}
                <button onClick={() => setSelectedRemessa("all")} className="hover:text-emerald-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedStatusMemo !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Status Memo: {selectedStatusMemo}
                <button onClick={() => setSelectedStatusMemo("all")} className="hover:text-indigo-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedSituacaoCNH !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Situação: {selectedSituacaoCNH}
                <button onClick={() => setSelectedSituacaoCNH("all")} className="hover:text-amber-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filterPA !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                {filterPA === "com_pa" ? "Com PA cadastrado" : "Sem PA cadastrado"}
                <button onClick={() => setFilterPA("all")} className="hover:text-slate-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filterTelefone !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                {filterTelefone === "com_telefone" ? "Com Telefone" : "Sem Telefone"}
                <button onClick={() => setFilterTelefone("all")} className="hover:text-slate-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 4. Tabela de Candidatos */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
        {/* Barra superior de contagem e controles de visualização */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mostrando{" "}
              <strong className="text-slate-900 dark:text-white">
                {candidatosFiltrados.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </strong>{" "}
              a{" "}
              <strong className="text-slate-900 dark:text-white">
                {Math.min(currentPage * pageSize, candidatosFiltrados.length)}
              </strong>{" "}
              de{" "}
              <strong className="text-slate-900 dark:text-white">
                {candidatosFiltrados.length}
              </strong>{" "}
              candidatos
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Linhas por página:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 outline-hidden cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Tabela Responsiva */}
        <div className="overflow-x-auto min-h-[350px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Carregando candidatos...</p>
            </div>
          ) : paginatedCandidatos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                Nenhum candidato encontrado
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                Não há registros que correspondam aos filtros ou termos de pesquisa aplicados.
              </p>
              {activeFiltersCount > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider select-none">
                  {columns.index && (
                    <th
                      onClick={() => handleSort("seq")}
                      className="py-3 px-4 w-16 text-center cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Ordenar pela nova sequência numérica única"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>#</span>
                        {sortField === "seq" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.nome && (
                    <th
                      onClick={() => handleSort("nome")}
                      className="py-3 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nome do Candidato</span>
                        {sortField === "nome" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.cpf && (
                    <th
                      onClick={() => handleSort("cpf")}
                      className="py-3 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>CPF</span>
                        {sortField === "cpf" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.pa && (
                    <th
                      onClick={() => handleSort("pa")}
                      className="py-3 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Processo (PA)</span>
                        {sortField === "pa" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.telefone && (
                    <th
                      onClick={() => handleSort("telefone")}
                      className="py-3 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Telefone / WhatsApp</span>
                        {sortField === "telefone" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.memorando && (
                    <th
                      onClick={() => handleSort("memorando")}
                      className="py-3 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Memorando</span>
                        {sortField === "memorando" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.remessa && (
                    <th className="py-3 px-4">Remessa</th>
                  )}

                  {columns.status_memo && (
                    <th className="py-3 px-4">Status Memo</th>
                  )}

                  {columns.situacao_cnh && (
                    <th
                      onClick={() => handleSort("situacao")}
                      className="py-3 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Situação Protocolo</span>
                        {sortField === "situacao" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.localizacao && (
                    <th className="py-3 px-4">Gaveta & Repartição</th>
                  )}

                  {columns.data_cadastro && (
                    <th
                      onClick={() => handleSort("created_at")}
                      className="py-3 px-4 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Data Cadastro</span>
                        {sortField === "created_at" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  )}

                  {columns.acoes && (
                    <th className="py-3 px-4 text-center w-28">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {paginatedCandidatos.map((cand, idx) => {
                  const seqGeral = cand.sequencia_geral || (currentPage - 1) * pageSize + idx + 1;
                  const cleanTel = cand.telefone ? cand.telefone.replace(/\D/g, "") : "";
                  const waNumber = cleanTel.startsWith("55") ? cleanTel : `55${cleanTel}`;

                  return (
                    <tr
                      key={cand.id}
                      onClick={() => setSelectedCandidato(cand)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* 1. Item (#) - Nova sequência contínua única */}
                      {columns.index && (
                        <td className="py-3 px-4 text-center font-mono">
                          <span className="inline-flex items-center justify-center min-w-[30px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-xs group-hover:bg-blue-50 group-hover:border-blue-200 group-hover:text-blue-700 dark:group-hover:bg-blue-950/60 dark:group-hover:border-blue-800 dark:group-hover:text-blue-300 transition-colors">
                            {String(seqGeral).padStart(2, "0")}
                          </span>
                        </td>
                      )}

                      {/* 2. Nome do Candidato */}
                      {columns.nome && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0">
                              {getInitials(cand.nome)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-slate-900 dark:text-white tracking-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {cand.nome}
                              </span>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                {cand.numero && (
                                  <span>Memo #{cand.numero}</span>
                                )}
                                {cand.cnh_ordem ? (
                                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                                    • CNH #{cand.cnh_ordem}
                                  </span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    • Aguardando Envio
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* 3. CPF */}
                      {columns.cpf && (
                        <td className="py-3 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span>{formatCPF(cand.cpf)}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(cand.cpf, `cpf_${cand.id}`);
                              }}
                              title="Copiar CPF"
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-opacity p-0.5"
                            >
                              {copiedField === `cpf_${cand.id}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      )}

                      {/* 4. Processo (PA) */}
                      {columns.pa && (
                        <td className="py-3 px-4">
                          {cand.pa && cand.pa.trim() ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 text-[11px]">
                                {cand.pa}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyText(cand.pa || "", `pa_${cand.id}`);
                                }}
                                title="Copiar PA"
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-opacity p-0.5"
                              >
                                {copiedField === `pa_${cand.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">—</span>
                          )}
                        </td>
                      )}

                      {/* 5. Telefone / WhatsApp */}
                      {columns.telefone && (
                        <td className="py-3 px-4">
                          {cand.telefone && cand.telefone.replace(/\D/g, "").length >= 8 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-slate-700 dark:text-slate-300">
                                {formatPhone(cand.telefone)}
                              </span>
                              <a
                                href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
                                  `Olá, ${cand.nome}! Informamos que seu processo de CNH está em andamento no DETRAN.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Enviar mensagem no WhatsApp"
                                className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition-colors"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Sem telefone</span>
                          )}
                        </td>
                      )}

                      {/* 6. Memorando */}
                      {columns.memorando && (
                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate max-w-[140px]" title={cand.memorando_numero}>
                              {cand.memorando_numero}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* 7. Remessa */}
                      {columns.remessa && (
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                          {cand.memorando_remessa || "—"}
                        </td>
                      )}

                      {/* 8. Status do Memorando */}
                      {columns.status_memo && (
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                              cand.memorando_status === "Remetido"
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {cand.memorando_status}
                          </span>
                        </td>
                      )}

                      {/* 9. Situação CNH / Protocolo */}
                      {columns.situacao_cnh && (
                        <td className="py-3 px-4">
                          {cand.memorando_status === "Remetido" && !cand.cnh_id ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-xs">
                              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              Ausente no Geral
                            </span>
                          ) : (
                            renderSituacaoBadge(cand.cnh_situacao)
                          )}
                        </td>
                      )}

                      {/* 10. Localização Física (Gaveta & Repartição) */}
                      {columns.localizacao && (
                        <td className="py-3 px-4">
                          {cand.cnh_gaveta ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                                {cand.cnh_gaveta}
                              </span>
                              {cand.cnh_reparticao && (
                                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                                  {cand.cnh_reparticao}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Não alocada</span>
                          )}
                        </td>
                      )}

                      {/* 11. Data Cadastro */}
                      {columns.data_cadastro && (
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                          {formatDate(cand.created_at)}
                        </td>
                      )}

                      {/* 12. Ações */}
                      {columns.acoes && (
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {cand.memorando_status === "Remetido" && !cand.cnh_id && canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCandidato(cand);
                                  setIsAuditoriaModalOpen(true);
                                }}
                                title="CNH remetida não consta no Geral - Abrir Auditoria/Remessa"
                                className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/60 rounded-lg transition-colors cursor-pointer"
                              >
                                <ShieldCheck className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedCandidato(cand)}
                              title="Ver ficha completa do candidato"
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const ficha = `CANDIDATO: ${cand.nome}\nCPF: ${formatCPF(cand.cpf)}\nPA: ${
                                  cand.pa || "N/A"
                                }\nTELEFONE: ${cand.telefone || "N/A"}\nMEMORANDO: ${
                                  cand.memorando_numero
                                }\nREMESSA: ${cand.memorando_remessa}\nSITUAÇÃO: ${cand.cnh_situacao}`;
                                handleCopyText(ficha, `ficha_${cand.id}`);
                              }}
                              title="Copiar dados formatados"
                              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            >
                              {copiedField === `ficha_${cand.id}` ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação Inferior */}
        {!isLoading && candidatosFiltrados.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Página <strong className="text-slate-900 dark:text-white">{currentPage}</strong> de{" "}
              <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
            </span>

            <div className="flex items-center gap-1.5">
              <button
                id="btn-prev-page"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Anterior
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        currentPage === pageNum
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                id="btn-next-page"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-all cursor-pointer"
              >
                Próxima
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Modal de Detalhes do Candidato */}
      {selectedCandidato && (
        <Modal
          isOpen={Boolean(selectedCandidato)}
          onClose={() => setSelectedCandidato(null)}
          title="Ficha Cadastral do Candidato"
        >
          <div id="candidato-details-modal" className="flex flex-col gap-4 text-xs">
            {/* Identificação Principal */}
            <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-base flex items-center justify-center shadow-sm shrink-0">
                {getInitials(selectedCandidato.nome)}
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
                  {selectedCandidato.nome}
                </h3>
                <div className="flex items-center flex-wrap gap-2 mt-1">
                  <span className="text-slate-500 dark:text-slate-400 font-mono font-medium">
                    CPF: {formatCPF(selectedCandidato.cpf)}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-bold text-[10px]">
                    Nº Seq: #{String(selectedCandidato.sequencia_geral || 1).padStart(2, "0")}
                  </span>
                  {selectedCandidato.numero && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[10px]">
                      Item Memo: #{selectedCandidato.numero}
                    </span>
                  )}
                  {selectedCandidato.cnh_ordem ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                      Ordem CNH: #{selectedCandidato.cnh_ordem}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-semibold text-[10px]">
                      Aguardando Remessa
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Grid com Blocos de Informação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Bloco 1: Processo e Contato */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex flex-col gap-2.5">
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5 pb-1 border-b border-slate-100 dark:border-slate-700">
                  <Hash className="w-3.5 h-3.5 text-blue-500" />
                  Dados do Processo e Contato
                </span>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Processo Administrativo (PA):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedCandidato.pa || "Não informado"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Telefone / WhatsApp:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {selectedCandidato.telefone ? formatPhone(selectedCandidato.telefone) : "Não informado"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Data de Inclusão:</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {formatDateTime(selectedCandidato.created_at)}
                  </span>
                </div>
              </div>

              {/* Bloco 2: Memorando e Remessa */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex flex-col gap-2.5">
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5 pb-1 border-b border-slate-100 dark:border-slate-700">
                  <FileText className="w-3.5 h-3.5 text-purple-500" />
                  Origem do Memorando
                </span>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Memorando:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {selectedCandidato.memorando_numero}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Remessa:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedCandidato.memorando_remessa}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Status do Envio:</span>
                  <span
                    className={`font-bold ${
                      selectedCandidato.memorando_status === "Remetido"
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {selectedCandidato.memorando_status}
                  </span>
                </div>

                {selectedCandidato.memorando_usuario && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Elaborado por:</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {selectedCandidato.memorando_usuario}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bloco 3: Situação no Protocolo de CNHs */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col gap-2.5">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-slate-700">
                <FolderArchive className="w-3.5 h-3.5 text-emerald-500" />
                Situação no Protocolo Geral de CNHs
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">Status Atual:</span>
                  <div>{renderSituacaoBadge(selectedCandidato.cnh_situacao)}</div>
                </div>

                <div>
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">Gaveta Física:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedCandidato.cnh_gaveta || "— (Não alocada)"}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 dark:text-slate-400 block mb-1">Repartição:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedCandidato.cnh_reparticao || "— (Não alocada)"}
                  </span>
                </div>
              </div>

              {selectedCandidato.cnh_responsavel_nome && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Responsável / CFC:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedCandidato.cnh_responsavel_nome}
                  </span>
                </div>
              )}
            </div>

            {/* Aviso de Auditoria e Ação de Remessa Individual */}
            {selectedCandidato.memorando_status === "Remetido" && !selectedCandidato.cnh_id && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold">
                      CNH remetida no Memorando #{selectedCandidato.memorando_numero}, mas ausente no Geral.
                    </p>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                      Este candidato consta como remetido, porém o registro no Protocolo Geral ainda não foi gerado.
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await remeterCandidatosFaltantesAoGeral(
                          [selectedCandidato],
                          user?.id || "sistema",
                          user?.nome_curto || user?.nome || "Agente DETRAN"
                        );
                        await loadData(true);
                        setSelectedCandidato(null);
                      } catch (err: any) {
                        alert(err?.message || "Erro ao remeter CNH");
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Remeter CNH ao Geral</span>
                  </button>
                )}
              </div>
            )}

            {/* Rodapé do Modal com Botões de Ação */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              {selectedCandidato.telefone ? (
                <a
                  href={`https://wa.me/${
                    selectedCandidato.telefone.replace(/\D/g, "").startsWith("55")
                      ? selectedCandidato.telefone.replace(/\D/g, "")
                      : `55${selectedCandidato.telefone.replace(/\D/g, "")}`
                  }?text=${encodeURIComponent(
                    `Olá, ${selectedCandidato.nome}! Informamos que seu processo de CNH está em andamento no DETRAN.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all cursor-pointer shadow-xs"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Chamar no WhatsApp</span>
                </a>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const ficha = `FICHA DE CANDIDATO - DETRAN\nNome: ${selectedCandidato.nome}\nCPF: ${formatCPF(
                      selectedCandidato.cpf
                    )}\nProcesso (PA): ${selectedCandidato.pa || "N/A"}\nTelefone: ${
                      selectedCandidato.telefone || "N/A"
                    }\nMemorando: ${selectedCandidato.memorando_numero}\nRemessa: ${
                      selectedCandidato.memorando_remessa
                    }\nSituação: ${selectedCandidato.cnh_situacao}\nLocalização: ${
                      selectedCandidato.cnh_gaveta || "N/A"
                    } - ${selectedCandidato.cnh_reparticao || "N/A"}`;
                    handleCopyText(ficha, "modal_ficha");
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-semibold transition-all cursor-pointer"
                >
                  {copiedField === "modal_ficha" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedField === "modal_ficha" ? "Copiado!" : "Copiar Ficha"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCandidato(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 rounded-xl font-semibold transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de Auditoria e Remessa de CNHs Faltantes */}
      <AuditoriaRemessaCandidatosModal
        isOpen={isAuditoriaModalOpen}
        onClose={() => setIsAuditoriaModalOpen(false)}
        candidatosEnriquecidos={candidatosEnriquecidos}
        user={user}
        canEdit={canEdit}
        onSuccess={async () => {
          await loadData(true);
        }}
      />

      {/* Modal de Varredura e Auditoria de Duplicatas */}
      <AuditoriaDuplicatasCandidatosModal
        isOpen={isDuplicatasModalOpen}
        onClose={() => setIsDuplicatasModalOpen(false)}
        candidatosEnriquecidos={candidatosEnriquecidos}
        user={user}
        canEdit={canEdit}
        onSuccess={async () => {
          await loadData(true);
        }}
      />
    </div>
  );
};
