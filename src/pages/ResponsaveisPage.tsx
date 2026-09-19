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
  Layers, 
  Eye, 
  Copy, 
  Check, 
  X, 
  RefreshCw,
  FolderCheck,
  Building2,
  GitMerge,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trophy,
  UserCheck,
  SlidersHorizontal,
  Database,
  ShieldCheck
} from "lucide-react";
import { Responsavel, ResponsavelSchema, GeralCNH, TipoResponsavel } from "../types";
import { 
  getResponsaveis, 
  createResponsavel, 
  updateResponsavel, 
  deleteResponsavel, 
  getGeralCNHs,
  deduplicateResponsaveis,
  mergeResponsaveisByNome,
  restoreResponsaveisInfoAndDatabase,
  isProprietarioRecord,
  CANONICAL_PROPRIETARIO_ID
} from "../services/db";
import { ModalChecagemMesclagem } from "../components/ModalChecagemMesclagem";
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

type StatusFilterTipo = "todos" | "Titular" | "Despachante" | "Procurador" | "com_retiradas";

export interface ResponsaveisVisibleColumns {
  index: boolean;
  nome: boolean;
  tipo: boolean;
  cpf: boolean;
  telefone: boolean;
  retiradas: boolean;
  observacoes: boolean;
  cadastro: boolean;
  acoes: boolean;
}

export const DEFAULT_RESPONSAVEIS_VISIBLE_COLUMNS: ResponsaveisVisibleColumns = {
  index: true,
  nome: true,
  tipo: true,
  cpf: true,
  telefone: true,
  retiradas: true,
  observacoes: true,
  cadastro: true,
  acoes: true,
};

const STORAGE_KEY_RESPONSAVEIS_COLUMNS = "responsaveis_table_columns_preference";

function getInitialResponsaveisVisibleColumns(userEmail?: string): ResponsaveisVisibleColumns {
  try {
    const userKey = userEmail ? `${STORAGE_KEY_RESPONSAVEIS_COLUMNS}_${userEmail}` : STORAGE_KEY_RESPONSAVEIS_COLUMNS;
    const saved = localStorage.getItem(userKey) || localStorage.getItem(STORAGE_KEY_RESPONSAVEIS_COLUMNS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_RESPONSAVEIS_VISIBLE_COLUMNS, ...parsed };
    }
  } catch (e) {
    console.warn("Erro ao ler preferências de colunas de responsáveis:", e);
  }
  return DEFAULT_RESPONSAVEIS_VISIBLE_COLUMNS;
}

export const ResponsaveisPage: React.FC = () => {
  const { user, canEdit } = useAuth();
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [cnhs, setCnhs] = useState<GeralCNH[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterTipo>("todos");
  const [sortRetiradas, setSortRetiradas] = useState<"none" | "asc" | "desc">("none");
  const [sortNome, setSortNome] = useState<"none" | "asc" | "desc">("none");
  const [isMerging, setIsMerging] = useState(false);

  // Escolha de Colunas e Preferências de Usuário
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const columnFilterRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<ResponsaveisVisibleColumns>(() =>
    getInitialResponsaveisVisibleColumns(user?.email)
  );

  // Persistência de preferência de colunas por usuário
  useEffect(() => {
    try {
      const userKey = user?.email ? `${STORAGE_KEY_RESPONSAVEIS_COLUMNS}_${user.email}` : STORAGE_KEY_RESPONSAVEIS_COLUMNS;
      localStorage.setItem(userKey, JSON.stringify(visibleColumns));
      localStorage.setItem(STORAGE_KEY_RESPONSAVEIS_COLUMNS, JSON.stringify(visibleColumns));
    } catch (e) {
      console.warn("Erro ao salvar preferências de colunas de responsáveis:", e);
    }
  }, [visibleColumns, user?.email]);

  // Fechamento ao clicar fora do dropdown de colunas
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnFilterRef.current && !columnFilterRef.current.contains(event.target as Node)) {
        setShowColumnFilter(false);
      }
    };
    if (showColumnFilter) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColumnFilter]);

  const toggleColumn = (key: keyof ResponsaveisVisibleColumns) => {
    if (key === "nome") return; // Nome é coluna principal e obrigatória
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetVisibleColumns = () => {
    setVisibleColumns(DEFAULT_RESPONSAVEIS_VISIBLE_COLUMNS);
  };
  
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
  const [tipo, setTipo] = useState<TipoResponsavel>("Despachante");
  const [cpf, setCpf] = useState("");
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
        scheduleFetch(300);
      }
    };

    window.addEventListener("detran_sync_updated", handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubRealtimeResp();
      unsubRealtimeGeral();
      window.removeEventListener("detran_sync_updated", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [fetchDados, scheduleFetch]);

  // Mapeamento de CNHs retiradas por Responsável
  const cnhsByResponsavelMap = useMemo(() => {
    const byId = new Map<string, GeralCNH[]>();
    const byNormName = new Map<string, GeralCNH[]>();

    cnhs.forEach((c) => {
      if ((c.situacao || "").trim().toLowerCase() === "entregue") {
        if (c.responsavel_id) {
          const list = byId.get(c.responsavel_id) || [];
          list.push(c);
          byId.set(c.responsavel_id, list);
        }
        if (c.responsavel_nome) {
          const norm = normalizeSearch(c.responsavel_nome);
          if (norm) {
            const list = byNormName.get(norm) || [];
            list.push(c);
            byNormName.set(norm, list);
          }
        }
      }
    });

    return { byId, byNormName };
  }, [cnhs]);

  const getCnhsDoResponsavel = useCallback(
    (resp: Responsavel): GeralCNH[] => {
      const isProp = isProprietarioRecord(resp);
      const matchedMap = new Map<string, GeralCNH>();

      // 1. Busca por ID direto
      const byIdList = cnhsByResponsavelMap.byId.get(resp.id);
      if (byIdList) {
        byIdList.forEach((c) => matchedMap.set(c.id, c));
      }

      // 2. Busca por nome normalizado
      const norm = normalizeSearch(resp.nome);
      if (norm) {
        const byNameList = cnhsByResponsavelMap.byNormName.get(norm);
        if (byNameList) {
          byNameList.forEach((c) => matchedMap.set(c.id, c));
        }

        // Variações conhecidas de nomes e apelidos de despachantes
        if (norm.includes("tula")) {
          const tulaList = cnhsByResponsavelMap.byNormName.get("tula despachante") || cnhsByResponsavelMap.byNormName.get("tula");
          if (tulaList) tulaList.forEach((c) => matchedMap.set(c.id, c));
        }
        if (norm.includes("bambam") || norm.includes("babam")) {
          const bbList = cnhsByResponsavelMap.byNormName.get("babam desp") || cnhsByResponsavelMap.byNormName.get("bambam despachante");
          if (bbList) bbList.forEach((c) => matchedMap.set(c.id, c));
        }
        if (norm.includes("regis") || norm.includes("rubia")) {
          const rList = cnhsByResponsavelMap.byNormName.get("rubia") || cnhsByResponsavelMap.byNormName.get("regis");
          if (rList) rList.forEach((c) => matchedMap.set(c.id, c));
        }
        if (norm.includes("ary") || norm.includes("ari")) {
          const aList = cnhsByResponsavelMap.byNormName.get("ari desp") || cnhsByResponsavelMap.byNormName.get("ary despachante");
          if (aList) aList.forEach((c) => matchedMap.set(c.id, c));
        }
        if (norm.includes("moises") || norm.includes("moyses")) {
          const mList = cnhsByResponsavelMap.byNormName.get("moises desp") || cnhsByResponsavelMap.byNormName.get("moises despachante");
          if (mList) mList.forEach((c) => matchedMap.set(c.id, c));
        }
      }

      // 3. Se for Proprietário / Titular canônico:
      if (isProp) {
        const propOldList = cnhsByResponsavelMap.byId.get("e2335b1e");
        if (propOldList) propOldList.forEach((c) => matchedMap.set(c.id, c));

        const propCanonList = cnhsByResponsavelMap.byId.get(CANONICAL_PROPRIETARIO_ID);
        if (propCanonList) propCanonList.forEach((c) => matchedMap.set(c.id, c));

        const propNormList = cnhsByResponsavelMap.byNormName.get("proprietario");
        if (propNormList) propNormList.forEach((c) => matchedMap.set(c.id, c));

        const propNormListA = cnhsByResponsavelMap.byNormName.get("proprietarioa");
        if (propNormListA) propNormListA.forEach((c) => matchedMap.set(c.id, c));

        const titularNormList = cnhsByResponsavelMap.byNormName.get("titular");
        if (titularNormList) titularNormList.forEach((c) => matchedMap.set(c.id, c));

        // Adiciona CNHs entregues sem despachante ou procurador atribuído
        cnhs.forEach((c) => {
          if ((c.situacao || "").trim().toLowerCase() === "entregue") {
            const hasOtherRespId =
              c.responsavel_id &&
              c.responsavel_id !== CANONICAL_PROPRIETARIO_ID &&
              c.responsavel_id !== "e2335b1e";
            const normR = normalizeSearch(c.responsavel_nome || "");
            const isNamedProp =
              !normR ||
              normR === "proprietario" ||
              normR === "proprietarioa" ||
              normR === "titular" ||
              normR === "proprio";
            if (!hasOtherRespId && isNamedProp) {
              matchedMap.set(c.id, c);
            }
          }
        });
      }

      return Array.from(matchedMap.values());
    },
    [cnhsByResponsavelMap, cnhs]
  );

  const getTipoResponsavel = useCallback((resp: Responsavel): TipoResponsavel => {
    if (resp.tipo) return resp.tipo;
    if (isProprietarioRecord(resp)) return "Titular";
    return "Despachante";
  }, []);

  // Métricas Superiores
  const metricas = useMemo(() => {
    const total = responsaveis.length;
    const titulares = responsaveis.filter((r) => getTipoResponsavel(r) === "Titular").length;
    const despachantes = responsaveis.filter((r) => getTipoResponsavel(r) === "Despachante").length;
    const procuradores = responsaveis.filter((r) => getTipoResponsavel(r) === "Procurador").length;
    const comTelefone = responsaveis.filter((r) => r.telefone && r.telefone.replace(/\D/g, "").length >= 8).length;
    const totalEntreguesBalcao = cnhs.filter((c) => c.situacao === "Entregue").length;

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
      titulares,
      percentTitulares: total > 0 ? Math.round((titulares / total) * 100) : 0,
      despachantes,
      percentDespachantes: total > 0 ? Math.round((despachantes / total) * 100) : 0,
      procuradores,
      percentProcuradores: total > 0 ? Math.round((procuradores / total) * 100) : 0,
      comTelefone,
      percentTelefone: total > 0 ? Math.round((comTelefone / total) * 100) : 0,
      comRetiradasCount,
      percentRetiradas: total > 0 ? Math.round((comRetiradasCount / total) * 100) : 0,
      totalCnhsRetiradas,
      totalEntreguesBalcao,
      coincide: totalCnhsRetiradas === totalEntreguesBalcao,
      mediaPorAtivo: comRetiradasCount > 0 ? (totalCnhsRetiradas / comRetiradasCount).toFixed(1) : "0.0",
    };
  }, [responsaveis, cnhs, getCnhsDoResponsavel, getTipoResponsavel]);

  // Filtragem
  const normSearch = normalizeSearch(searchTerm);
  const filtered = useMemo(() => {
    return responsaveis.filter((r) => {
      const respTipo = getTipoResponsavel(r);

      // 1. Filtro dos cards / categorias solicitadas (Titular, Despachante, Procurador)
      if (statusFilter === "Titular" && respTipo !== "Titular") {
        return false;
      }
      if (statusFilter === "Despachante" && respTipo !== "Despachante") {
        return false;
      }
      if (statusFilter === "Procurador" && respTipo !== "Procurador") {
        return false;
      }
      if (statusFilter === "com_retiradas") {
        const count = getCnhsDoResponsavel(r).length;
        if (count === 0) return false;
      }

      // 2. Busca textual
      if (!normSearch) return true;
      const matchId = r.id.toLowerCase().includes(normSearch);
      const matchTipo = respTipo.toLowerCase().includes(normSearch);
      const matchNome = normalizeSearch(r.nome).includes(normSearch);
      const matchCpf = r.cpf ? (matchDigitsSafe(r.cpf, searchTerm) || r.cpf.includes(searchTerm.trim())) : false;
      const matchTel = r.telefone ? (matchDigitsSafe(r.telefone, searchTerm) || r.telefone.includes(searchTerm.trim())) : false;
      const matchObs = r.observacao ? normalizeSearch(r.observacao).includes(normSearch) : false;

      return matchId || matchTipo || matchNome || matchCpf || matchTel || matchObs;
    });
  }, [responsaveis, statusFilter, normSearch, searchTerm, getCnhsDoResponsavel, getTipoResponsavel]);

  // Ordenação da tabela (com suporte a setas cima/baixo para Ranking de CNHs Retiradas e Ordem Alfabética)
  const sortedAndFiltered = useMemo(() => {
    const list = [...filtered];
    if (sortNome === "asc") {
      list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    } else if (sortNome === "desc") {
      list.sort((a, b) => b.nome.localeCompare(a.nome, "pt-BR", { sensitivity: "base" }));
    } else if (sortRetiradas === "desc") {
      list.sort((a, b) => {
        const countA = getCnhsDoResponsavel(a).length;
        const countB = getCnhsDoResponsavel(b).length;
        if (countB !== countA) return countB - countA;
        return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      });
    } else if (sortRetiradas === "asc") {
      list.sort((a, b) => {
        const countA = getCnhsDoResponsavel(a).length;
        const countB = getCnhsDoResponsavel(b).length;
        if (countA !== countB) return countA - countB;
        return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      });
    }
    return list;
  }, [filtered, sortNome, sortRetiradas, getCnhsDoResponsavel]);

  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [isRestoringDb, setIsRestoringDb] = useState(false);

  // Mecanismo de mesclagem por nome - abre o modal de checagem
  const handleMergePorNome = () => {
    if (!canEdit) return;
    setIsCheckModalOpen(true);
  };

  // Mecanismo de deduplicação - abre o modal de checagem
  const handleDeduplicate = () => {
    if (!canEdit) return;
    setIsCheckModalOpen(true);
  };

  // Restauração direta de todas as informações de CNHs e responsáveis no banco
  const handleQuickRestore = async () => {
    if (!canEdit) return;
    setIsRestoringDb(true);
    setMessage(null);
    try {
      const res = await restoreResponsaveisInfoAndDatabase();
      await fetchDados(false);
      setMessage({
        type: "success",
        text: `Restauração para o status anterior concluída com sucesso! ${res.cpfsReparadosCount || 0} CPFs, ${res.usuariosReparadosCount || 0} usuários e ${res.gavetasReparadasCount || 0} gavetas/repartições restauradas (${res.restoredCnhsCount} CNHs sincronizadas no banco de dados).`
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro ao restaurar dados no banco." });
    } finally {
      setIsRestoringDb(false);
    }
  };

  const handleCheckModalCompleted = async (result: any) => {
    setIsCheckModalOpen(false);
    await fetchDados(false);
    setMessage({
      type: "success",
      text: result.message || "Operação concluída com sucesso!"
    });
  };

  const handleOpenModal = (item?: Responsavel) => {
    setFormErrors({});
    setMessage(null);
    if (item) {
      setEditingItem(item);
      setNome(item.nome.toUpperCase());
      setTipo(getTipoResponsavel(item));
      setCpf(item.cpf || "");
      setTelefone(item.telefone || "");
      setObservacao(item.observacao || "");
    } else {
      setEditingItem(null);
      setNome("");
      setTipo("Despachante");
      setCpf("");
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
    const uppercaseNome = (nome || "").trim().toUpperCase();

    const validation = ResponsavelSchema.safeParse({
      nome: uppercaseNome,
      tipo,
      cpf: formattedCpf,
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

    // Validação preventiva local de duplicidade por CPF ou Telefone
    const cleanCpf = formattedCpf.replace(/\D/g, "");
    const cleanTel = formattedTel.replace(/\D/g, "");
    const isProp = editingItem ? isProprietarioRecord(editingItem) : false;

    if (!isProp) {
      const dupCpf = responsaveis.find(
        (r) => (!editingItem || r.id !== editingItem.id) && !isProprietarioRecord(r) && (r.cpf || "").replace(/\D/g, "") === cleanCpf
      );
      if (dupCpf) {
        setFormErrors({ cpf: `Este CPF já está cadastrado para o responsável "${dupCpf.nome}".` });
        return;
      }

      const dupTel = responsaveis.find(
        (r) => (!editingItem || r.id !== editingItem.id) && !isProprietarioRecord(r) && (r.telefone || "").replace(/\D/g, "") === cleanTel
      );
      if (dupTel) {
        setFormErrors({ telefone: `Este telefone já está cadastrado para o responsável "${dupTel.nome}".` });
        return;
      }
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await updateResponsavel(
          editingItem.id,
          { nome: uppercaseNome, tipo, cpf: formattedCpf, telefone: formattedTel, observacao },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: "Responsável atualizado com sucesso!" });
      } else {
        await createResponsavel(
          { nome: uppercaseNome, tipo, cpf: formattedCpf, telefone: formattedTel, observacao, ativo: true },
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
    if (isProprietarioRecord(item)) {
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
      doc.text("RELATÓRIO GERAL DE RESPONSÁVEIS", 14, 34);

      // Metadados
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      const dataEmissao = formatDateTime(new Date());
      const emitidoPor = user?.nome_curto || user?.nome || "Servidor do Protocolo";
      const filtroTxt = 
        statusFilter === "todos" ? "Todos os Registros" :
        statusFilter === "Titular" ? "Titulares (Proprietários)" :
        statusFilter === "Despachante" ? "Despachantes" :
        statusFilter === "Procurador" ? "Procuradores" : "Com Retiradas Registradas";

      doc.text(
        `Emitido em: ${dataEmissao} | Responsável: ${emitidoPor} | Filtro: ${filtroTxt} | Registros Listados: ${sortedAndFiltered.length}`,
        14,
        40
      );

      // Bloco de Síntese Estatística (Cards no Relatório)
      autoTable(doc, {
        startY: 44,
        head: [["TOTAL CADASTRADOS", "TITULARES", "DESPACHANTES", "PROCURADORES", "TOTAL CNHs RETIRADAS", "BALCÃO (ENTREGUES)"]],
        body: [[
          `${metricas.total}`,
          `${metricas.titulares} (${metricas.percentTitulares}%)`,
          `${metricas.despachantes} (${metricas.percentDespachantes}%)`,
          `${metricas.procuradores} (${metricas.percentProcuradores}%)`,
          `${metricas.totalCnhsRetiradas} CNHs`,
          `${metricas.totalEntreguesBalcao} CNHs`
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

      const tableRows = sortedAndFiltered.map((r, idx) => {
        const cnhsCount = getCnhsDoResponsavel(r).length;
        const tipoResp = getTipoResponsavel(r);
        return [
          (idx + 1).toString(),
          r.nome.toUpperCase(),
          tipoResp,
          r.cpf || "—",
          r.telefone || "—",
          cnhsCount > 0 ? `${cnhsCount} retirada(s)` : "Nenhuma",
          r.observacao || "—",
          formatDate(r.created_at)
        ];
      });

      autoTable(doc, {
        startY: startTableY,
        head: [["#", "NOME COMPLETO (RESPONSÁVEL)", "TIPO", "CPF / CNPJ", "TELEFONE", "CNHs RETIRADAS", "OBSERVAÇÕES / PROCURAÇÕES", "CADASTRO"]],
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
          1: { cellWidth: 60, fontStyle: "bold" },
          2: { cellWidth: 26, fontStyle: "bold", halign: "center" },
          3: { cellWidth: 32 },
          4: { cellWidth: 28 },
          5: { cellWidth: 26, halign: "center", fontStyle: "bold" },
          6: { cellWidth: 57 },
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
      const tipoResp = getTipoResponsavel(resp);

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
      doc.text("FICHA CADASTRAL DO RESPONSÁVEL", 14, 36);

      // Dados Cadastrais
      autoTable(doc, {
        startY: 42,
        head: [["CAMPO", "INFORMAÇÃO REGISTRADA NO SISTEMA"]],
        body: [
          ["Nome Completo / Razão Social", resp.nome.toUpperCase()],
          ["Tipo de Responsável", tipoResp],
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
          c.nome.toUpperCase(),
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
    if (sortedAndFiltered.length === 0) return;

    const dataToExport = sortedAndFiltered.map((r, idx) => {
      const cnhsCount = getCnhsDoResponsavel(r).length;
      return {
        "#": idx + 1,
        "Nome Completo": r.nome.toUpperCase(),
        "Tipo": getTipoResponsavel(r),
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
    if (sortedAndFiltered.length === 0) return;

    const headers = [
      "Item",
      "Nome",
      "Tipo",
      "CPF_CNPJ",
      "Telefone",
      "CNHs_Retiradas",
      "Observacoes",
      "Data_Cadastro"
    ];

    const rows = sortedAndFiltered.map((r, idx) => {
      const cnhsCount = getCnhsDoResponsavel(r).length;
      return [
        (idx + 1).toString(),
        `"${r.nome.toUpperCase().replace(/"/g, '""')}"`,
        `"${getTipoResponsavel(r)}"`,
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
      `*DETRAN - FICHA DE RESPONSÁVEL*`,
      `👤 *Nome:* ${resp.nome.toUpperCase()}`,
      `🏷️ *Tipo:* ${getTipoResponsavel(resp)}`,
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
                <span>Responsáveis</span>
                {isRefreshing && (
                  <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Controle de titulares, despachantes e procuradores autorizados a retirar CNHs no balcão de atendimento.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação Superiores: Exportações, Mesclagem e Cadastro */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Exportar PDF */}
          <button
            id="btn-export-pdf-responsaveis"
            onClick={handlePrintPDF}
            disabled={isGeneratingPDF || sortedAndFiltered.length === 0}
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
            disabled={sortedAndFiltered.length === 0}
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
            disabled={sortedAndFiltered.length === 0}
            title="Exportar dados em formato CSV"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>

          {/* Botão Restaurar Informações no Banco */}
          {canEdit && (
            <button
              id="btn-quick-restore-db"
              onClick={handleQuickRestore}
              disabled={isRestoringDb}
              title="Restaurar e sincronizar todas as informações de responsavel_id e responsavel_nome no banco de dados"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              <Database className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${isRestoringDb ? "animate-spin" : ""}`} />
              <span>{isRestoringDb ? "Restaurando..." : "Restaurar Banco"}</span>
            </button>
          )}

          {/* Botão Mesclar por Nome (Com Modal de Checagem) */}
          {canEdit && (
            <button
              id="btn-merge-responsaveis"
              onClick={handleMergePorNome}
              title="Mesclar responsáveis com verificação prévia e conciliação de contagens com o balcão"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-700 rounded-xl transition-all cursor-pointer"
            >
              <GitMerge className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Mesclar por Nome</span>
            </button>
          )}

          {/* Botão Unificar e Limpar Duplicatas (Com Modal de Checagem) */}
          {canEdit && (
            <button
              id="btn-deduplicate-responsaveis"
              onClick={handleDeduplicate}
              title="Escanear e checar duplicatas de responsáveis antes de unificar"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700 rounded-xl transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Checar Duplicatas</span>
            </button>
          )}

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

      {/* CARDS DE MÉTRICAS SUPERIORES (6 CARDS INTERATIVOS COM AS 3 CATEGORIAS) */}
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
            <span>Responsáveis</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">100%</span>
          </div>
        </div>

        {/* Card 2: Titulares */}
        <div
          id="metric-card-titulares"
          onClick={() => setStatusFilter((prev) => (prev === "Titular" ? "todos" : "Titular"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "Titular"
              ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 shadow-sm ring-2 ring-amber-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Titulares
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.titulares}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Proprietários</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">{metricas.percentTitulares}%</span>
          </div>
        </div>

        {/* Card 3: Despachantes */}
        <div
          id="metric-card-despachantes"
          onClick={() => setStatusFilter((prev) => (prev === "Despachante" ? "todos" : "Despachante"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "Despachante"
              ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm ring-2 ring-indigo-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Despachantes
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.despachantes}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Credenciados</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{metricas.percentDespachantes}%</span>
          </div>
        </div>

        {/* Card 4: Procuradores */}
        <div
          id="metric-card-procuradores"
          onClick={() => setStatusFilter((prev) => (prev === "Procurador" ? "todos" : "Procurador"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "Procurador"
              ? "bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 shadow-sm ring-2 ring-purple-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Procuradores
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.procuradores}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Com Procuração</span>
            <span className="font-bold text-purple-600 dark:text-purple-400">{metricas.percentProcuradores}%</span>
          </div>
        </div>

        {/* Card 5: Total de CNHs Retiradas */}
        <div
          id="metric-card-total-cnhs-retiradas"
          onClick={() => setStatusFilter((prev) => (prev === "com_retiradas" ? "todos" : "com_retiradas"))}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "com_retiradas"
              ? "bg-teal-50/80 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 shadow-sm ring-2 ring-teal-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              CNHs Retiradas
            </span>
            <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-300 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.totalCnhsRetiradas}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>{metricas.comRetiradasCount} ativos</span>
            <span className="font-bold text-teal-600 dark:text-teal-400">Total</span>
          </div>
        </div>

        {/* Card 6: Balcão (Entregues) & Conciliação */}
        <div
          id="metric-card-balcao-conciliacao"
          className="p-4 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Balcão (Entregues)
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              metricas.coincide 
                ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300"
                : "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300"
            }`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metricas.totalEntreguesBalcao}
          </div>
          <div className="text-[10px] mt-1 flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">Conciliação</span>
            <span className={`font-bold ${
              metricas.coincide 
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}>
              {metricas.coincide ? "100% Coincide" : "Mesclar nomes"}
            </span>
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
              placeholder="Pesquisar por Nome, Tipo, CPF, Telefone ou Observação..."
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

          {/* Seletor de Categoria / Tipo de Responsável */}
          <div className="hidden sm:block">
            <select
              id="select-categoria-responsavel"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterTipo)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            >
              <option value="todos">Todos os Responsáveis ({responsaveis.length})</option>
              <option value="Titular">Titular ({metricas.titulares})</option>
              <option value="Despachante">Despachante ({metricas.despachantes})</option>
              <option value="Procurador">Procurador ({metricas.procuradores})</option>
              <option value="com_retiradas">Com CNHs Retiradas ({metricas.comRetiradasCount})</option>
            </select>
          </div>

          {/* Botão de Escolha de Colunas e Preferências de Usuário */}
          <div className="relative" ref={columnFilterRef}>
            <button
              id="btn-escolher-colunas-responsaveis"
              onClick={() => setShowColumnFilter(!showColumnFilter)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Escolher quais colunas exibir na tabela de responsáveis"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="hidden md:inline">Colunas</span>
              <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded-full font-bold">
                {Object.values(visibleColumns).filter(Boolean).length}
              </span>
            </button>

            {showColumnFilter && (
              <div 
                id="dropdown-colunas-responsaveis"
                className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Colunas Visíveis
                  </span>
                  <button
                    id="btn-reset-colunas-responsaveis"
                    onClick={resetVisibleColumns}
                    className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Padrão
                  </button>
                </div>

                <div className="space-y-1 max-h-60 overflow-y-auto pr-1 text-xs">
                  {[
                    { key: "index", label: "Número (#)" },
                    { key: "nome", label: "Nome Completo (Obrigatório)", locked: true },
                    { key: "tipo", label: "Tipo de Responsável" },
                    { key: "cpf", label: "CPF / CNPJ" },
                    { key: "telefone", label: "Telefone / WhatsApp" },
                    { key: "retiradas", label: "CNHs Retiradas" },
                    { key: "observacoes", label: "Observações" },
                    { key: "cadastro", label: "Data de Cadastro" },
                    { key: "acoes", label: "Ações" }
                  ].map((col) => (
                    <label
                      key={col.key}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 select-none ${col.locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span className="text-xs">{col.label}</span>
                      <input
                        id={`chk-col-${col.key}`}
                        type="checkbox"
                        checked={visibleColumns[col.key as keyof ResponsaveisVisibleColumns]}
                        disabled={col.locked}
                        onChange={() => toggleColumn(col.key as keyof ResponsaveisVisibleColumns)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-700 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Indicador de Filtro Ativo e Quantidade */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 w-full sm:w-auto justify-between sm:justify-end">
          {statusFilter !== "todos" && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 font-semibold text-[11px]">
              <span>
                Filtro:{" "}
                {statusFilter === "Titular" ? "Titular" :
                 statusFilter === "Despachante" ? "Despachante" :
                 statusFilter === "Procurador" ? "Procurador" : "Com Retiradas"}
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
            Exibindo <strong className="text-slate-900 dark:text-white">{sortedAndFiltered.length}</strong> de {responsaveis.length}
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
        ) : sortedAndFiltered.length === 0 ? (
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
                  {visibleColumns.index && <th className="py-3.5 px-4 w-12 text-center">#</th>}
                  
                  {visibleColumns.nome && (
                    <th 
                      id="th-nome-responsavel"
                      onClick={() => {
                        setSortNome((prev) => (prev === "none" ? "asc" : prev === "asc" ? "desc" : "none"));
                        setSortRetiradas("none");
                      }}
                      className="py-3.5 px-6 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group/th"
                      title="Clique para alternar a ordenação alfabética dos responsáveis (A-Z ou Z-A)"
                    >
                      <div className="inline-flex items-center gap-1.5 font-bold">
                        <span>Nome Completo</span>
                        <div className="flex flex-col -space-y-1 text-slate-400">
                          <ArrowUp className={`w-3.5 h-3.5 transition-colors ${sortNome === "asc" ? "text-blue-600 dark:text-blue-400 font-black scale-110" : "text-slate-300 dark:text-slate-600 group-hover/th:text-slate-400"}`} />
                          <ArrowDown className={`w-3.5 h-3.5 transition-colors ${sortNome === "desc" ? "text-blue-600 dark:text-blue-400 font-black scale-110" : "text-slate-300 dark:text-slate-600 group-hover/th:text-slate-400"}`} />
                        </div>
                      </div>
                    </th>
                  )}

                  {visibleColumns.tipo && <th className="py-3.5 px-4 text-center">Tipo</th>}
                  {visibleColumns.cpf && <th className="py-3.5 px-4">CPF / CNPJ</th>}
                  {visibleColumns.telefone && <th className="py-3.5 px-4">Telefone</th>}
                  
                  {/* Coluna CNHs Retiradas com Setas de Ordenação / Ranking */}
                  {visibleColumns.retiradas && (
                    <th 
                      id="th-cnhs-retiradas"
                      onClick={() => {
                        setSortRetiradas((prev) => (prev === "none" ? "desc" : prev === "desc" ? "asc" : "none"));
                        setSortNome("none");
                      }}
                      className="py-3.5 px-4 text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group/th"
                      title="Clique para alternar a ordenação do ranking de CNHs retiradas"
                    >
                      <div className="inline-flex items-center justify-center gap-1.5 font-bold">
                        <span>CNHs Retiradas</span>
                        <div className="flex flex-col -space-y-1 text-slate-400">
                          <ArrowUp className={`w-3.5 h-3.5 transition-colors ${sortRetiradas === "asc" ? "text-blue-600 dark:text-blue-400 font-black scale-110" : "text-slate-300 dark:text-slate-600 group-hover/th:text-slate-400"}`} />
                          <ArrowDown className={`w-3.5 h-3.5 transition-colors ${sortRetiradas === "desc" ? "text-blue-600 dark:text-blue-400 font-black scale-110" : "text-slate-300 dark:text-slate-600 group-hover/th:text-slate-400"}`} />
                        </div>
                      </div>
                    </th>
                  )}

                  {visibleColumns.observacoes && <th className="py-3.5 px-6">Observações / Procurações</th>}
                  {visibleColumns.cadastro && <th className="py-3.5 px-4 text-center w-28">Cadastro</th>}
                  {visibleColumns.acoes && <th className="py-3.5 px-6 text-right w-36">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {sortedAndFiltered.map((r, index) => {
                  const isProprietario = isProprietarioRecord(r);
                  const cnhsResp = getCnhsDoResponsavel(r);
                  const totalRetiradas = cnhsResp.length;
                  const tipoResp = getTipoResponsavel(r);

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Numeração */}
                      {visibleColumns.index && (
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-[11px]">
                          {index + 1}
                        </td>
                      )}

                      {/* Nome Completo (Formatado em Caixa Alta) */}
                      {visibleColumns.nome && (
                        <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-white uppercase tracking-tight">
                          <div className="flex items-center gap-2">
                            <span className="hover:text-blue-600 transition-colors font-bold">
                              {r.nome.toUpperCase()}
                            </span>
                            {isProprietario && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 normal-case">
                                Padrão
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Tipo de Responsável: Titular, Despachante ou Procurador */}
                      {visibleColumns.tipo && (
                        <td className="py-3.5 px-4 text-center">
                          {tipoResp === "Titular" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <UserCheck className="w-3 h-3" />
                              Titular
                            </span>
                          )}
                          {tipoResp === "Despachante" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              <Building2 className="w-3 h-3" />
                              Despachante
                            </span>
                          )}
                          {tipoResp === "Procurador" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <FileText className="w-3 h-3" />
                              Procurador
                            </span>
                          )}
                        </td>
                      )}

                      {/* CPF / CNPJ */}
                      {visibleColumns.cpf && (
                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {r.cpf ? formatCPF(r.cpf) : "—"}
                        </td>
                      )}

                      {/* Telefone */}
                      {visibleColumns.telefone && (
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
                      )}

                      {/* CNHs Retiradas com Rank Badge */}
                      {visibleColumns.retiradas && (
                        <td className="py-3.5 px-4 text-center">
                          {totalRetiradas > 0 ? (
                            <div className="inline-flex items-center gap-1.5">
                              {sortRetiradas === "desc" && index < 3 && (
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                  index === 0 
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300"
                                    : index === 1
                                    ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300"
                                    : "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border border-orange-300"
                                }`} title={`Rank ${index + 1}º em retiradas`}>
                                  {index + 1}º
                                </span>
                              )}
                              <button
                                onClick={() => setSelectedDetailResp(r)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                title="Clique para ver o histórico das CNHs retiradas"
                              >
                                <Layers className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                <span>{totalRetiradas}</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">0</span>
                          )}
                        </td>
                      )}

                      {/* Observações */}
                      {visibleColumns.observacoes && (
                        <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={r.observacao || ""}>
                          {r.observacao || "—"}
                        </td>
                      )}

                      {/* Data de Cadastro */}
                      {visibleColumns.cadastro && (
                        <td className="py-3.5 px-4 text-center text-slate-500 text-[11px]">
                          {formatDate(r.created_at)}
                        </td>
                      )}

                      {/* Ações */}
                      {visibleColumns.acoes && (
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
                      )}
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
                  <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                    {selectedDetailResp.nome.toUpperCase()}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {getTipoResponsavel(selectedDetailResp) === "Titular" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 rounded-md text-[11px] font-bold">
                        <UserCheck className="w-3 h-3" />
                        Titular (Proprietário)
                      </span>
                    )}
                    {getTipoResponsavel(selectedDetailResp) === "Despachante" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 rounded-md text-[11px] font-bold">
                        <Building2 className="w-3 h-3" />
                        Despachante
                      </span>
                    )}
                    {getTipoResponsavel(selectedDetailResp) === "Procurador" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 rounded-md text-[11px] font-bold">
                        <FileText className="w-3 h-3" />
                        Procurador
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
        title={editingItem ? "Editar Responsável" : "Cadastrar Novo Responsável"}
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
              onChange={(e) => setNome(e.target.value.toUpperCase())}
              placeholder="ex: CARLOS MENDES ou DESPACHANTE CENTRAL"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs uppercase text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            />
            {formErrors.nome && <p className="text-[11px] text-rose-500 mt-1">{formErrors.nome}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tipo de Responsável: Titular, Despachante ou Procurador */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tipo <span className="text-rose-500">*</span>
              </label>
              <select
                id="select-modal-tipo-responsavel"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoResponsavel)}
                disabled={editingItem ? isProprietarioRecord(editingItem) : false}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-hidden transition-all disabled:opacity-50"
              >
                <option value="Titular">Titular</option>
                <option value="Despachante">Despachante</option>
                <option value="Procurador">Procurador</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CPF ou CNPJ <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                maxLength={18}
                disabled={editingItem ? isProprietarioRecord(editingItem) : false}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all disabled:opacity-50"
              />
              {formErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{formErrors.cpf}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Telefone de Contato <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(91) 99999-9999"
                maxLength={15}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
              {formErrors.telefone && <p className="text-[11px] text-rose-500 mt-1">{formErrors.telefone}</p>}
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

      {/* Modal de Checagem e Confirmação de Mesclagem */}
      <ModalChecagemMesclagem
        isOpen={isCheckModalOpen}
        onClose={() => setIsCheckModalOpen(false)}
        onCompleted={handleCheckModalCompleted}
      />
    </div>
  );
};
