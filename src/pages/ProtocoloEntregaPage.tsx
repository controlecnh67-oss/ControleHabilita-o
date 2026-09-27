import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  PackageCheck,
  Search, 
  Filter, 
  Columns, 
  Edit2, 
  Send, 
  CheckCircle2, 
  Clock, 
  Inbox, 
  Truck, 
  X, 
  User, 
  Plus, 
  RefreshCw, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  FileText,
  ShieldCheck,
  RotateCcw,
  SlidersHorizontal,
  Copy,
  Phone,
  FolderArchive,
  Building2,
  Calendar,
  UserCheck,
  Eye,
  Tag,
  Sparkles
} from "lucide-react";
import { GeralCNH, Responsavel, SituacaoGeral, ResponsavelSchema } from "../types";
import { 
  getGeralCNHs, 
  getResponsaveis, 
  createResponsavel, 
  entregarCNH, 
  updateGeralCNH 
} from "../services/db";
import { syncGeralWithSupabase, deduplicateCNHRecords } from "../services/dexieDb";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { EditarCNHModal } from "../components/EditarCNHModal";
import { cn, formatCPF, formatPhone, formatDateTime, normalizeSearch, matchDigitsSafe } from "../lib/utils";

// Helper para exibir Gaveta e Repartição de forma limpa e compacta
const cleanNumeroApenas = (text?: string | number) => {
  if (text === undefined || text === null || text === "") return "-";
  const str = String(text).trim();
  const match = str.match(/\d+/);
  if (match) return match[0];
  const cleaned = str.replace(/^(gaveta|gav\.?|repartição|reparticao|rep\.?)\s*/i, "").trim();
  return cleaned || str || "-";
};

const cleanGavetaText = (text?: string | number) => cleanNumeroApenas(text);
const cleanReparticaoText = (text?: string | number) => cleanNumeroApenas(text);

// Interface para as colunas visíveis
export interface ProtocoloEntregaVisibleColumns {
  ordem: boolean;
  pa: boolean;
  nome: boolean;
  cpf: boolean;
  telefone: boolean;
  gaveta: boolean;
  reparticao: boolean;
  situacao: boolean;
  responsavel: boolean;
  data_movimento: boolean;
  usuario: boolean;
  lote: boolean;
  observacao: boolean;
  acoes: boolean;
}

export const DEFAULT_ENTREGA_COLUMNS: ProtocoloEntregaVisibleColumns = {
  ordem: true,
  pa: false,
  nome: true,
  cpf: true,
  telefone: false,
  gaveta: true,
  reparticao: true,
  situacao: true,
  responsavel: true,
  data_movimento: true,
  usuario: true,
  lote: false,
  observacao: false,
  acoes: true,
};

const STORAGE_KEY_COLUMNS = "detran_protocolo_entrega_columns";

export const ProtocoloEntregaPage: React.FC = () => {
  const { user } = useAuth();

  // Estados dos dados principais
  const [cnhs, setCnhs] = useState<GeralCNH[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);

  // Filtros rápidos
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"todas" | SituacaoGeral>("todas");

  // Ordenação
  const [sortColumn, setSortColumn] = useState<keyof GeralCNH>("ordem");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);

  // Seletor de Colunas Visíveis
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const columnSelectorRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<ProtocoloEntregaVisibleColumns>(() => {
    if (typeof window !== "undefined") {
      try {
        const userKey = user?.email || user?.id;
        const saved = userKey ? localStorage.getItem(`${STORAGE_KEY_COLUMNS}_${userKey}`) : null;
        if (saved) return { ...DEFAULT_ENTREGA_COLUMNS, ...JSON.parse(saved) };
        const general = localStorage.getItem(STORAGE_KEY_COLUMNS);
        if (general) return { ...DEFAULT_ENTREGA_COLUMNS, ...JSON.parse(general) };
      } catch {}
    }
    return DEFAULT_ENTREGA_COLUMNS;
  });

  // Salva no localStorage quando mudar
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const userKey = user?.email || user?.id;
        if (userKey) {
          localStorage.setItem(`${STORAGE_KEY_COLUMNS}_${userKey}`, JSON.stringify(visibleColumns));
        }
        localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(visibleColumns));
      } catch {}
    }
  }, [visibleColumns, user?.email, user?.id]);

  // Fechar menu de colunas ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target as Node)) {
        setShowColumnSelector(false);
      }
    };
    if (showColumnSelector) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColumnSelector]);

  // Modais de Ação Limitada
  // 1. Modal de Entrega
  const [isEntregaModalOpen, setIsEntregaModalOpen] = useState(false);
  const [selectedCNHForEntrega, setSelectedCNHForEntrega] = useState<GeralCNH | null>(null);
  const [tipoRetirante, setTipoRetirante] = useState<"proprietario" | "outro">("proprietario");
  const [selectedRespId, setSelectedRespId] = useState<string>("");
  const [searchRespTerm, setSearchRespTerm] = useState("");
  const [entregaObservacao, setEntregaObservacao] = useState("");
  const [submittingEntrega, setSubmittingEntrega] = useState(false);

  // 2. Modal de Novo Responsável (inline na entrega)
  const [isNewRespModalOpen, setIsNewRespModalOpen] = useState(false);
  const [newRespNome, setNewRespNome] = useState("");
  const [newRespCpf, setNewRespCpf] = useState("");
  const [newRespTelefone, setNewRespTelefone] = useState("");
  const [newRespObs, setNewRespObs] = useState("");
  const [newRespErrors, setNewRespErrors] = useState<Record<string, string>>({});
  const [submittingNewResp, setSubmittingNewResp] = useState(false);

  // 3. Modal de Edição (reaproveitando EditarCNHModal)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCNH, setEditingCNH] = useState<GeralCNH | null>(null);

  // 4. Modal de Visualização Rápida de Detalhes da CNH
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedCNHDetails, setSelectedCNHDetails] = useState<GeralCNH | null>(null);
  const [copiedDetailsText, setCopiedDetailsText] = useState(false);

  // Feedback de Cópia Rápida (para qualquer campo da tabela)
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1500);
  };

  const handleOpenDetails = (cnh: GeralCNH, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCNHDetails(cnh);
    setIsDetailsModalOpen(true);
  };

  const handleCopyDetails = (cnh: GeralCNH) => {
    const text = `CNH #${cnh.ordem}
Nome: ${cnh.nome}
CPF: ${cnh.cpf ? formatCPF(cnh.cpf) : "Não informado"}
${cnh.telefone ? `Telefone: ${formatPhone(cnh.telefone)}` : ""}
${cnh.pa ? `PA: ${cnh.pa}` : ""}
Situação: ${cnh.situacao}
Gaveta: ${cnh.gaveta ? cleanGavetaText(cnh.gaveta) : "-"}
Repartição: ${cnh.reparticao ? cleanReparticaoText(cnh.reparticao) : "-"}
${cnh.responsavel_nome ? `Retirado por: ${getResponsavelDisplayName(cnh.responsavel_nome, cnh.responsavel_id)}` : ""}
${cnh.lote ? `Lote: ${cnh.lote}` : ""}
${cnh.observacao ? `Observação: ${cnh.observacao}` : ""}`;

    navigator.clipboard.writeText(text);
    setCopiedDetailsText(true);
    setTimeout(() => setCopiedDetailsText(false), 2000);
  };

  // Carregar dados
  const fetchDados = async () => {
    try {
      const [dataCnhs, dataResp] = await Promise.all([getGeralCNHs(), getResponsaveis()]);
      const { cleanList } = deduplicateCNHRecords(dataCnhs);
      setCnhs(cleanList);
      setResponsaveis(dataResp);
    } catch (err) {
      console.error("Erro ao carregar dados do protocolo de entrega:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDados();
    // Sincronização em segundo plano com Supabase
    syncGeralWithSupabase(false).then(() => {
      fetchDados();
    });
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await syncGeralWithSupabase(false);
    await fetchDados();
  };

  // Contadores por Situação
  const counts = useMemo(() => {
    const res = {
      todas: cnhs.length,
      Recebida: 0,
      Entregue: 0,
      Remetida: 0,
      Pendente: 0,
    };
    cnhs.forEach((c) => {
      if (c.situacao && res[c.situacao] !== undefined) {
        res[c.situacao]++;
      }
    });
    return res;
  }, [cnhs]);

  // Filtragem e Ordenação Rápida
  const filteredData = useMemo(() => {
    const normSearch = normalizeSearch(searchTerm);
    return cnhs
      .filter((c) => {
        // Filtro de Situação
        if (filtroSituacao !== "todas" && c.situacao !== filtroSituacao) {
          return false;
        }

        // Pesquisa Rápida Geral
        if (!normSearch) return true;

        const matchNome = normalizeSearch(c.nome).includes(normSearch);
        const matchCpf = matchDigitsSafe(c.cpf, searchTerm) || (c.cpf && c.cpf.includes(searchTerm.trim()));
        const matchOrdem = c.ordem.toString().includes(searchTerm.trim());
        const matchPa = c.pa && c.pa.includes(searchTerm.trim());
        const matchGaveta = normalizeSearch(c.gaveta).includes(normSearch);
        const matchReparticao = normalizeSearch(c.reparticao).includes(normSearch);
        const matchLote = c.lote && normalizeSearch(c.lote).includes(normSearch);
        const matchObs = c.observacao && normalizeSearch(c.observacao).includes(normSearch);
        const matchResp = c.responsavel_nome && normalizeSearch(c.responsavel_nome).includes(normSearch);

        return (
          matchNome ||
          matchCpf ||
          matchOrdem ||
          matchPa ||
          matchGaveta ||
          matchReparticao ||
          matchLote ||
          matchObs ||
          matchResp
        );
      })
      .sort((a, b) => {
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
  }, [cnhs, searchTerm, filtroSituacao, sortColumn, sortDirection]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const handleSort = (col: keyof GeralCNH) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
  };

  // Helper para exibir nome do responsável
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
    return nome || "-";
  };

  // HANDLER: Abrir Modal de Entrega
  const handleOpenEntrega = (cnh: GeralCNH) => {
    setSelectedCNHForEntrega(cnh);
    setTipoRetirante("proprietario");
    const prop = responsaveis.find((r) => r.nome === "Proprietário");
    setSelectedRespId(prop ? prop.id : "");
    setSearchRespTerm("");
    setEntregaObservacao("");
    setIsEntregaModalOpen(true);
  };

  // HANDLER: Confirmar Entrega
  const handleConfirmEntrega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCNHForEntrega || !user) return;

    let targetRespId = selectedRespId;
    let targetRespNome = "Proprietário";

    if (tipoRetirante === "proprietario") {
      let prop = responsaveis.find(
        (r) => r.nome === "Proprietário" || r.tipo === "Titular"
      );
      if (!prop) {
        try {
          prop = await createResponsavel(
            {
              nome: "Proprietário",
              tipo: "Titular",
              ativo: true,
            },
            user.id,
            user.nome_curto || user.nome
          );
          setResponsaveis((prev) => [prop!, ...prev]);
        } catch {}
      }
      if (!prop) {
        alert("Erro: Não foi possível definir o registro padrão Proprietário.");
        return;
      }
      targetRespId = prop.id;
      targetRespNome = prop.nome;
    } else {
      if (!targetRespId) {
        alert("Por favor, selecione ou cadastre o responsável / despachante que está retirando a CNH.");
        return;
      }
      const foundResp = responsaveis.find((r) => r.id === targetRespId);
      if (foundResp) {
        targetRespNome = foundResp.nome;
      }
    }

    const cnhToDeliver = selectedCNHForEntrega;
    const obsEntrega = entregaObservacao.trim();

    // Fecha a modal de imediato para máxima fluidez
    setIsEntregaModalOpen(false);
    setSelectedCNHForEntrega(null);

    // Atualização otimista imediata na tabela
    const nowIso = new Date().toISOString();
    setCnhs((prev) =>
      prev.map((item) =>
        item.id === cnhToDeliver.id
          ? {
              ...item,
              situacao: "Entregue",
              responsavel_id: targetRespId,
              responsavel_nome: targetRespNome,
              data_movimento: nowIso,
              usuario_id: user.id,
              usuario_nome: user.nome_curto || user.nome,
              observacao: `${item.observacao ? item.observacao + " | " : ""}Entregue para: ${targetRespNome}${
                obsEntrega ? ` (${obsEntrega})` : ""
              }`,
            }
          : item
      )
    );

    setMessage({
      type: "success",
      text: `🎉 Entrega confirmada com sucesso! CNH #${cnhToDeliver.ordem} de "${cnhToDeliver.nome}" foi entregue a ${targetRespNome}.`,
    });

    try {
      await entregarCNH(
        cnhToDeliver.id,
        targetRespId,
        obsEntrega || undefined,
        user.id,
        user.nome_curto || user.nome
      );
      fetchDados();
    } catch (err: any) {
      console.error("Erro ao persistir entrega:", err);
      setMessage({
        type: "error",
        text: `Erro ao salvar entrega: ${err.message || "Tente novamente."}`,
      });
      fetchDados();
    }
  };

  // HANDLER: Abrir Modal de Edição
  const handleOpenEdit = (cnh: GeralCNH) => {
    setEditingCNH(cnh);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (id: string, data: Partial<GeralCNH>) => {
    if (!user) return;
    try {
      const updated = await updateGeralCNH(
        id,
        data,
        user.id,
        user.nome_curto || user.nome
      );
      setCnhs((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)));
      setMessage({
        type: "success",
        text: `✅ CNH #${updated.ordem} (${updated.nome}) atualizada com sucesso!`,
      });
      setIsEditModalOpen(false);
      setEditingCNH(null);
      fetchDados();
    } catch (err: any) {
      console.error("Erro ao salvar edição:", err);
      alert(`Erro ao salvar alterações da CNH: ${err.message || "Tente novamente."}`);
    }
  };

  // HANDLER: Novo Responsável inline
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
          tipo: "Procurador",
        },
        user.id,
        user.nome_curto || user.nome
      );
      setResponsaveis((prev) => [novo, ...prev]);
      setSelectedRespId(novo.id);
      setIsNewRespModalOpen(false);
    } catch (err: any) {
      setNewRespErrors({ geral: err.message || "Erro ao cadastrar responsável" });
    } finally {
      setSubmittingNewResp(false);
    }
  };

  // Lista filtrada de responsáveis no dropdown
  const filteredRespDropdown = useMemo(() => {
    return responsaveis
      .filter((r) => r.ativo && r.nome !== "Proprietário")
      .filter((r) => {
        if (!searchRespTerm.trim()) return true;
        const term = normalizeSearch(searchRespTerm);
        return (
          normalizeSearch(r.nome).includes(term) ||
          (r.cpf && r.cpf.includes(searchRespTerm.trim())) ||
          (r.registro && normalizeSearch(r.registro).includes(term))
        );
      });
  }, [responsaveis, searchRespTerm]);

  // Alternar Colunas Visíveis
  const toggleColumn = (key: keyof ProtocoloEntregaVisibleColumns) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleResetColumns = () => {
    setVisibleColumns(DEFAULT_ENTREGA_COLUMNS);
  };

  const handleSelectAllColumns = () => {
    setVisibleColumns({
      ordem: true,
      pa: true,
      nome: true,
      cpf: true,
      telefone: true,
      gaveta: true,
      reparticao: true,
      situacao: true,
      responsavel: true,
      data_movimento: true,
      usuario: true,
      lote: true,
      observacao: true,
      acoes: true,
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-4">
      {/* Toast de Feedback */}
      {message && (
        <div
          className={cn(
            "p-3.5 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-sm transition-all animate-fadeIn",
            message.type === "success" && "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800",
            message.type === "warning" && "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800",
            message.type === "error" && "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
          )}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {message.type === "warning" && <Clock className="w-4 h-4 text-amber-600 shrink-0" />}
            {message.type === "error" && <X className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CABEÇALHO ENXUTO DO PROTOCOLO ENTREGA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/25 shrink-0">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Protocolo Entrega
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                Balcão Rápido
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Interface ágil e amigável para busca expressa, edição e confirmação de entrega de CNHs com suporte a cópia rápida.
            </p>
          </div>
        </div>

        {/* Contadores Rápidos Interativos do Balcão */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Card No Balcão (Recebidas) */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao(filtroSituacao === "Recebida" ? "todas" : "Recebida");
              setCurrentPage(1);
            }}
            className={cn(
              "px-3.5 py-2 rounded-xl text-left border transition-all cursor-pointer flex items-center gap-2.5",
              filtroSituacao === "Recebida"
                ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20 shadow-xs"
                : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 hover:bg-emerald-50/50 text-slate-700 dark:text-slate-300"
            )}
            title="Clique para filtrar CNHs prontas no balcão"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider leading-none">
                No Balcão
              </span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400 leading-none">
                {counts.Recebida}
              </span>
            </div>
          </button>

          {/* Card Entregues */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao(filtroSituacao === "Entregue" ? "todas" : "Entregue");
              setCurrentPage(1);
            }}
            className={cn(
              "px-3.5 py-2 rounded-xl text-left border transition-all cursor-pointer flex items-center gap-2.5",
              filtroSituacao === "Entregue"
                ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20 shadow-xs"
                : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 hover:bg-blue-50/50 text-slate-700 dark:text-slate-300"
            )}
            title="Clique para filtrar CNHs já entregues"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider leading-none">
                Entregues
              </span>
              <span className="text-base font-black text-blue-600 dark:text-blue-400 leading-none">
                {counts.Entregue}
              </span>
            </div>
          </button>

          {/* Botão de Atualizar */}
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shrink-0"
            title="Atualizar dados do protocolo"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin text-emerald-600")} />
          </button>
        </div>
      </div>

      {/* BARRA DE CONTROLE: PESQUISA RÁPIDA GERAL + FILTRO DE SITUAÇÃO + SELETOR DE COLUNAS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Campo de Pesquisa Rápida Geral */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchTerm("");
              }}
              placeholder="Pesquisa rápida geral: Digite Nome do Titular, CPF, Ordem (#), PA, Gaveta, Repartição, Lote..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-hidden transition-all shadow-inner"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md cursor-pointer"
                title="Limpar pesquisa (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Botão Seletor de Colunas Visíveis */}
          <div className="relative" ref={columnSelectorRef}>
            <button
              type="button"
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className={cn(
                "px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs",
                showColumnSelector
                  ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
              )}
            >
              <Columns className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Colunas Visíveis</span>
            </button>

            {/* Menu Popover das Colunas */}
            {showColumnSelector && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-30 animate-fadeIn space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                    Seletor de Colunas
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={handleSelectAllColumns}
                      className="text-emerald-600 hover:underline font-bold cursor-pointer"
                    >
                      Todas
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <button
                      type="button"
                      onClick={handleResetColumns}
                      className="text-slate-500 hover:underline font-bold cursor-pointer"
                    >
                      Padrão
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {[
                    { key: "ordem", label: "Ordem (#)" },
                    { key: "pa", label: "PA (Identificador)" },
                    { key: "nome", label: "Nome do Titular" },
                    { key: "cpf", label: "CPF" },
                    { key: "telefone", label: "Telefone / Contato" },
                    { key: "gaveta", label: "Gaveta" },
                    { key: "reparticao", label: "Repartição" },
                    { key: "situacao", label: "Situação (Status)" },
                    { key: "responsavel", label: "Retirado Por (Responsável)" },
                    { key: "data_movimento", label: "Data de Movimento" },
                    { key: "usuario", label: "Operador / Servidor" },
                    { key: "lote", label: "Lote" },
                    { key: "observacao", label: "Observações" },
                    { key: "acoes", label: "Ações (Editar / Entregar)" },
                  ].map((col) => {
                    const isChecked = visibleColumns[col.key as keyof ProtocoloEntregaVisibleColumns];
                    return (
                      <label
                        key={col.key}
                        className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl cursor-pointer text-xs transition-colors"
                      >
                        <span className={cn(
                          "font-medium",
                          isChecked ? "text-slate-900 dark:text-white font-semibold" : "text-slate-400"
                        )}>
                          {col.label}
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleColumn(col.key as keyof ProtocoloEntregaVisibleColumns)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filtro de Situação (Chips Interativas com Contadores) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/60">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Situação:
          </span>

          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("todas");
              setCurrentPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border",
              filtroSituacao === "todas"
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs"
                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            )}
          >
            <span>Todas</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
              filtroSituacao === "todas"
                ? "bg-white/20 dark:bg-black/20 text-white dark:text-slate-900"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            )}>
              {counts.todas}
            </span>
          </button>

          {/* Destaque especial para RECEBIDA (as que estão no balcão prontas para entrega) */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Recebida");
              setCurrentPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border",
              filtroSituacao === "Recebida"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 ring-2 ring-emerald-500/20"
                : "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
            )}
            title="CNHs já recebidas e organizadas em gavetas, prontas para entrega ao titular"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Recebida (Pronta no Balcão)</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold",
              filtroSituacao === "Recebida"
                ? "bg-emerald-700 text-white"
                : "bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200"
            )}>
              {counts.Recebida}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Entregue");
              setCurrentPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border",
              filtroSituacao === "Entregue"
                ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20"
                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Entregue</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
              filtroSituacao === "Entregue"
                ? "bg-blue-700 text-white"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            )}>
              {counts.Entregue}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Remetida");
              setCurrentPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border",
              filtroSituacao === "Remetida"
                ? "bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20"
                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            )}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Remetida</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
              filtroSituacao === "Remetida"
                ? "bg-amber-700 text-white"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            )}>
              {counts.Remetida}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Pendente");
              setCurrentPage(1);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border",
              filtroSituacao === "Pendente"
                ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20"
                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pendente</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
              filtroSituacao === "Pendente"
                ? "bg-rose-700 text-white"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            )}>
              {counts.Pendente}
            </span>
          </button>
        </div>
      </div>

      {/* TABELA ENXUTA DO PROTOCOLO ENTREGA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col flex-1">
        {/* Barra superior de contagem e paginação resumida */}
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Listando {filteredData.length} de {cnhs.length} registro(s)
            </span>
            {searchTerm && (
              <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono text-[11px]">
                Filtro: "{searchTerm}"
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px]">Por página:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold outline-hidden cursor-pointer"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold cursor-pointer disabled:cursor-not-allowed text-xs"
              >
                Anterior
              </button>
              <span className="px-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold cursor-pointer disabled:cursor-not-allowed text-xs"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>

        {/* Tabela Responsiva */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 select-none sticky top-0 z-10 backdrop-blur-xs">
              <tr>
                {visibleColumns.ordem && (
                  <th
                    onClick={() => handleSort("ordem")}
                    className="py-3 px-3 w-20 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span># Ordem</span>
                      {sortColumn === "ordem" ? (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.pa && (
                  <th
                    onClick={() => handleSort("pa")}
                    className="py-3 px-3 w-28 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors font-mono"
                  >
                    <div className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>PA</span>
                      {sortColumn === "pa" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.nome && (
                  <th
                    onClick={() => handleSort("nome")}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors min-w-[220px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Nome do Titular</span>
                      {sortColumn === "nome" ? (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.cpf && (
                  <th
                    onClick={() => handleSort("cpf")}
                    className="py-3 px-3 w-36 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>CPF</span>
                      {sortColumn === "cpf" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.telefone && (
                  <th className="py-3 px-3 w-32">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Telefone</span>
                    </div>
                  </th>
                )}

                {visibleColumns.gaveta && (
                  <th
                    onClick={() => handleSort("gaveta")}
                    className="py-3 px-3 w-28 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <FolderArchive className="w-3.5 h-3.5 text-slate-400" />
                      <span>Gaveta</span>
                      {sortColumn === "gaveta" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.reparticao && (
                  <th
                    onClick={() => handleSort("reparticao")}
                    className="py-3 px-3 w-32 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Repartição</span>
                      {sortColumn === "reparticao" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.situacao && (
                  <th
                    onClick={() => handleSort("situacao")}
                    className="py-3 px-3 w-32 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                      <span>Situação</span>
                      {sortColumn === "situacao" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.responsavel && (
                  <th className="py-3 px-3 min-w-[160px]">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>Retirado Por</span>
                    </div>
                  </th>
                )}

                {visibleColumns.data_movimento && (
                  <th
                    onClick={() => handleSort("data_movimento")}
                    className="py-3 px-3 w-36 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Data Movimento</span>
                      {sortColumn === "data_movimento" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.usuario && (
                  <th className="py-3 px-3 w-32">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>Operador</span>
                    </div>
                  </th>
                )}

                {visibleColumns.lote && (
                  <th className="py-3 px-3 w-28 font-mono">Lote</th>
                )}

                {visibleColumns.observacao && (
                  <th className="py-3 px-3 min-w-[160px]">Observações</th>
                )}

                {visibleColumns.acoes && (
                  <th className="py-3 px-3 text-center min-w-[210px] sticky right-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-xs">
                    Ações Limitadas
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    <span>Carregando CNHs do protocolo...</span>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center">
                    <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      Nenhuma CNH encontrada
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm
                        ? `Não encontramos registros correspondentes à busca "${searchTerm}".`
                        : "Não há registros cadastrados para a situação selecionada."}
                    </p>
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
                      >
                        Limpar Termo de Busca
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedData.map((cnh) => {
                  const isReadyForDelivery = cnh.situacao === "Recebida";
                  const isDelivered = cnh.situacao === "Entregue";

                  return (
                    <tr
                      key={cnh.id}
                      onClick={() => handleOpenDetails(cnh)}
                      className={cn(
                        "hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer",
                        isReadyForDelivery && "bg-emerald-50/20 dark:bg-emerald-950/15 hover:bg-emerald-50/40"
                      )}
                    >
                      {/* # Ordem - Destaque visual arredondado em azul claro */}
                      {visibleColumns.ordem && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 border border-blue-200 dark:border-blue-700 shadow-2xs tracking-wide">
                            #{cnh.ordem}
                          </span>
                        </td>
                      )}

                      {/* PA (Identificador) */}
                      {visibleColumns.pa && (
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs">
                          {cnh.pa ? (
                            <div className="inline-flex items-center gap-1.5 group/pa">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono font-bold text-xs border border-emerald-200 dark:border-emerald-800">
                                {cnh.pa}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyText(cnh.pa!, `pa-${cnh.id}`, e)}
                                title="Copiar PA"
                                className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                              >
                                {copiedKey === `pa-${cnh.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-600" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>
                      )}

                      {/* Nome do Titular com ícone, tipografia clara e cópia rápida */}
                      {visibleColumns.nome && (
                        <td className="py-2.5 px-3 text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2 group/nome">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs">
                              <User className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm truncate">
                                  {cnh.nome}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyText(cnh.nome, `nome-${cnh.id}`, e)}
                                  title="Copiar Nome do Titular"
                                  className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 opacity-70 group-hover/nome:opacity-100"
                                >
                                  {copiedKey === `nome-${cnh.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                                  )}
                                </button>
                              </div>
                              {cnh.telefone && !visibleColumns.telefone && (
                                <span className="text-[10px] text-slate-400 font-mono font-medium flex items-center gap-1">
                                  <Phone className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                  {formatPhone(cnh.telefone)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      )}

                      {/* CPF com ícone FileText, espaçamento e botão de cópia */}
                      {visibleColumns.cpf && (
                        <td className="py-2.5 px-3 whitespace-nowrap min-w-[170px]">
                          <div className="flex items-center gap-1.5 font-mono text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 group/cpf">
                            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="tracking-wide">{cnh.cpf ? formatCPF(cnh.cpf) : "-"}</span>
                            {cnh.cpf && (
                              <button
                                type="button"
                                onClick={(e) => handleCopyText(formatCPF(cnh.cpf), `cpf-${cnh.id}`, e)}
                                title="Copiar CPF"
                                className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 opacity-70 group-hover/cpf:opacity-100"
                              >
                                {copiedKey === `cpf-${cnh.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Telefone */}
                      {visibleColumns.telefone && (
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs">
                          {cnh.telefone ? (
                            <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 group/tel">
                              <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{formatPhone(cnh.telefone)}</span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyText(cnh.telefone!, `tel-${cnh.id}`, e)}
                                title="Copiar Telefone"
                                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 opacity-70 group-hover/tel:opacity-100"
                              >
                                {copiedKey === `tel-${cnh.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-600" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>
                      )}

                      {/* Gaveta com ícone FolderArchive e badge azul destacado */}
                      {visibleColumns.gaveta && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {cnh.gaveta && cnh.gaveta.trim() ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-blue-50 text-blue-800 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60 shadow-2xs">
                              <FolderArchive className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>Gaveta {cleanGavetaText(cnh.gaveta)}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                              Sem gaveta
                            </span>
                          )}
                        </td>
                      )}

                      {/* Repartição com ícone Building2 e badge índigo */}
                      {visibleColumns.reparticao && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {cnh.reparticao && cnh.reparticao.trim() ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-indigo-50 text-indigo-800 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60 shadow-2xs">
                              <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>Repartição {cleanReparticaoText(cnh.reparticao)}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>
                      )}

                      {/* Situação com Badge colorido oficial */}
                      {visibleColumns.situacao && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <Badge situacao={cnh.situacao} />
                        </td>
                      )}

                      {/* Retirado Por com ícone e badge suave */}
                      {visibleColumns.responsavel && (
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          {cnh.responsavel_nome ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-xs">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="font-bold text-emerald-800 dark:text-emerald-200">
                                {getResponsavelDisplayName(cnh.responsavel_nome, cnh.responsavel_id)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>
                      )}

                      {/* Data Movimento */}
                      {visibleColumns.data_movimento && (
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{formatDateTime(cnh.data_movimento)}</span>
                          </div>
                        </td>
                      )}

                      {/* Operador */}
                      {visibleColumns.usuario && (
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-200/60 dark:border-slate-700/60">
                            <ShieldCheck className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{cnh.usuario_nome || "Sistema"}</span>
                          </div>
                        </td>
                      )}

                      {/* Lote */}
                      {visibleColumns.lote && (
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {cnh.lote ? (
                            <div className="inline-flex items-center gap-1.5 group/lote">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold text-xs border border-indigo-200 dark:border-indigo-800">
                                {cnh.lote}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyText(cnh.lote!, `lote-${cnh.id}`, e)}
                                title="Copiar Lote"
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                              >
                                {copiedKey === `lote-${cnh.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-600" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>
                      )}

                      {/* Observações */}
                      {visibleColumns.observacao && (
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-[11px] italic max-w-xs truncate" title={cnh.observacao}>
                          {cnh.observacao || "-"}
                        </td>
                      )}

                      {/* AÇÕES LIMITADAS: ENTREGAR, EDITAR e VISUALIZAR */}
                      {visibleColumns.acoes && (
                        <td className="py-2 px-3 text-center sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors shadow-xs" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Botão Entregar */}
                            {isDelivered ? (
                              <button
                                type="button"
                                onClick={() => handleOpenEntrega(cnh)}
                                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                                title="Entrega já realizada. Clique para ver ou editar responsável da entrega."
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Entregue</span>
                              </button>
                            ) : isReadyForDelivery ? (
                              <button
                                type="button"
                                onClick={() => handleOpenEntrega(cnh)}
                                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 transition-all cursor-pointer ring-2 ring-emerald-500/20"
                                title="Confirmar entrega da CNH no balcão"
                              >
                                <PackageCheck className="w-4 h-4 text-white" />
                                <span>Entregar</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(cnh)}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                                title="Situação atual: Não está no balcão. Clique para editar situação."
                              >
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>{cnh.situacao}</span>
                              </button>
                            )}

                            {/* Botão Editar */}
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(cnh)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs hover:border-slate-300"
                              title="Editar dados da CNH (Gaveta, Repartição, Situação, etc.)"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>Editar</span>
                            </button>

                            {/* Botão Visualizar Detalhes */}
                            <button
                              type="button"
                              onClick={(e) => handleOpenDetails(cnh, e)}
                              className="p-1.5 bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/50 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
                              title="Visualizar ficha rápida e completa da CNH"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela */}
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Mostrando {paginatedData.length} de {filteredData.length} registros filtrados (Total cadastrado: {cnhs.length})
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 text-xs font-semibold cursor-pointer"
              >
                Primeira
              </button>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 text-xs font-semibold cursor-pointer"
              >
                Anterior
              </button>
              <span className="px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                Pág. {currentPage} de {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 text-xs font-semibold cursor-pointer"
              >
                Próxima
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 text-xs font-semibold cursor-pointer"
              >
                Última
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: CONFIRMAR ENTREGA DE CNH (Ágil e Completo) */}
      <Modal
        isOpen={isEntregaModalOpen}
        onClose={() => setIsEntregaModalOpen(false)}
        title="📤 Confirmar Entrega de CNH"
        maxWidth="lg"
      >
        {selectedCNHForEntrega && (
          <form onSubmit={handleConfirmEntrega} className="space-y-4">
            {/* Resumo do Titular */}
            <div className="p-4 bg-gradient-to-r from-emerald-50/70 via-blue-50/50 to-slate-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-850 rounded-2xl border border-emerald-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center font-mono font-black text-sm px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 border border-blue-200 dark:border-blue-700 shadow-2xs tracking-wide">
                  #{selectedCNHForEntrega.ordem}
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                      {selectedCNHForEntrega.nome}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-slate-400" />
                      CPF: {selectedCNHForEntrega.cpf ? formatCPF(selectedCNHForEntrega.cpf) : "-"}
                    </span>
                    {selectedCNHForEntrega.pa && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                        PA: {selectedCNHForEntrega.pa}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-blue-50 text-blue-800 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60 shadow-2xs">
                  <FolderArchive className="w-3.5 h-3.5 text-blue-500" />
                  <span>Gaveta {cleanGavetaText(selectedCNHForEntrega.gaveta)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-indigo-50 text-indigo-800 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60 shadow-2xs">
                  <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Rep {cleanReparticaoText(selectedCNHForEntrega.reparticao)}</span>
                </span>
              </div>
            </div>

            {/* Quem está retirando? */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Quem está retirando a CNH no balcão? <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  onClick={() => {
                    setTipoRetirante("proprietario");
                    const prop = responsaveis.find((r) => r.nome === "Proprietário");
                    setSelectedRespId(prop ? prop.id : "");
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all",
                    tipoRetirante === "proprietario"
                      ? "bg-emerald-50/70 dark:bg-emerald-950/60 border-emerald-600 ring-2 ring-emerald-500/20"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  )}
                >
                  <input
                    type="radio"
                    name="retirante"
                    checked={tipoRetirante === "proprietario"}
                    onChange={() => {}}
                    className="w-4 h-4 text-emerald-600 focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">
                      Proprietário (O Próprio Titular)
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      Entrega direta mediante conferência de documento
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setTipoRetirante("outro")}
                  className={cn(
                    "flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all",
                    tipoRetirante === "outro"
                      ? "bg-blue-50/70 dark:bg-blue-950/60 border-blue-600 ring-2 ring-blue-500/20"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  )}
                >
                  <input
                    type="radio"
                    name="retirante"
                    checked={tipoRetirante === "outro"}
                    onChange={() => {}}
                    className="w-4 h-4 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">
                      Outro Responsável / Despachante
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      Procurador, CFC ou terceiro autorizado
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Dropdown de Responsável se for 'outro' */}
            {tipoRetirante === "outro" && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Selecione o Responsável / Despachante:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewRespNome("");
                      setNewRespCpf("");
                      setNewRespTelefone("");
                      setNewRespObs("");
                      setNewRespErrors({});
                      setIsNewRespModalOpen(true);
                    }}
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
                    placeholder="Filtrar responsável por nome ou CPF..."
                    value={searchRespTerm}
                    onChange={(e) => setSearchRespTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 bg-white dark:bg-slate-900">
                  {filteredRespDropdown.length === 0 ? (
                    <p className="text-center py-4 text-xs text-slate-400">
                      Nenhum responsável encontrado. Clique em ➕ Novo Responsável acima.
                    </p>
                  ) : (
                    filteredRespDropdown.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRespId(r.id)}
                        className={cn(
                          "p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors",
                          selectedRespId === r.id
                            ? "bg-emerald-600 text-white font-bold border-emerald-600 shadow-xs"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={selectedRespId === r.id ? "text-white font-bold" : "text-slate-900 dark:text-white font-semibold"}>
                              {r.nome}
                            </span>
                            {r.registro && (
                              <span className={cn(
                                "text-[10px] font-mono px-1.5 py-0.5 rounded font-bold",
                                selectedRespId === r.id ? "bg-emerald-700 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                              )}>
                                Reg: {r.registro}
                              </span>
                            )}
                          </div>
                          <span className={cn(
                            "block text-[10px] font-mono",
                            selectedRespId === r.id ? "text-emerald-100" : "text-slate-400"
                          )}>
                            {r.cpf ? `CPF: ${r.cpf}` : ""} {r.telefone ? `| Fone: ${r.telefone}` : ""}
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
                placeholder="ex: Apresentou procuração original / Entregue com termo assinado..."
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEntregaModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingEntrega}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{submittingEntrega ? "Registrando Entrega..." : "Confirmar Entrega"}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 2: NOVO RESPONSÁVEL INLINE */}
      <Modal
        isOpen={isNewRespModalOpen}
        onClose={() => setIsNewRespModalOpen(false)}
        title="➕ Cadastrar Novo Responsável / Despachante"
        maxWidth="sm"
      >
        <form onSubmit={handleSaveNewResp} className="space-y-3.5">
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
              onChange={(e) => setNewRespNome(e.target.value.toUpperCase())}
              placeholder="ex: Carlos Alberto - CFC Brasil"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-hidden uppercase"
              required
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
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
              required
            />
            {newRespErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{newRespErrors.cpf}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Telefone de Contato <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newRespTelefone}
              onChange={(e) => setNewRespTelefone(formatPhone(e.target.value))}
              placeholder="(67) 99999-9999"
              maxLength={15}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
              required
            />
            {newRespErrors.telefone && <p className="text-[11px] text-rose-500 mt-1">{newRespErrors.telefone}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observação (Procuração, etc.)
            </label>
            <input
              type="text"
              value={newRespObs}
              onChange={(e) => setNewRespObs(e.target.value)}
              placeholder="ex: Autorizado por procuração cartorial autenticada"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsNewRespModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
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

      {/* MODAL 3: EDITAR CNH (Ação Limitada: Editar) */}
      <EditarCNHModal
        isOpen={isEditModalOpen}
        cnh={editingCNH}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCNH(null);
        }}
        onSave={handleSaveEdit}
      />

      {/* MODAL 4: DETALHES VISUAIS DA CNH (Ficha Rápida do Balcão) */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedCNHDetails(null);
        }}
        title="📄 Ficha Rápida da CNH"
        maxWidth="md"
      >
        {selectedCNHDetails && (
          <div className="space-y-4">
            {/* Header com Ordem e Situação */}
            <div className="p-4 bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50 dark:from-slate-800 dark:to-slate-850 rounded-2xl border border-blue-200/80 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-base px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
                  #{selectedCNHDetails.ordem}
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {selectedCNHDetails.nome}
                  </h3>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    CPF: {selectedCNHDetails.cpf ? formatCPF(selectedCNHDetails.cpf) : "Não informado"}
                  </p>
                </div>
              </div>
              <Badge situacao={selectedCNHDetails.situacao} />
            </div>

            {/* Grid de Informações Visuais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Localização Física */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Localização Física
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                    <FolderArchive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Gaveta {cleanGavetaText(selectedCNHDetails.gaveta)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Repartição {cleanReparticaoText(selectedCNHDetails.reparticao)}</span>
                  </span>
                </div>
              </div>

              {/* Contato & Identificação */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Identificadores
                </span>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Telefone:</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {selectedCNHDetails.telefone ? formatPhone(selectedCNHDetails.telefone) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">PA / Lote:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {selectedCNHDetails.pa || "-"} / {selectedCNHDetails.lote || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Movimentação */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Movimentação & Operador
                </span>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Data Movimento:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      {formatDateTime(selectedCNHDetails.data_movimento)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Operador:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {selectedCNHDetails.usuario_nome || "Sistema"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Retirada / Responsável */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Retirada / Entrega
                </span>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retirado Por:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {getResponsavelDisplayName(selectedCNHDetails.responsavel_nome, selectedCNHDetails.responsavel_id)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Criado em:</span>
                    <span className="font-mono text-slate-500">
                      {formatDateTime(selectedCNHDetails.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Observações */}
            {selectedCNHDetails.observacao && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-300 block mb-0.5">
                  Observações:
                </span>
                <p className="text-amber-900 dark:text-amber-200 italic">
                  {selectedCNHDetails.observacao}
                </p>
              </div>
            )}

            {/* Ações do Modal de Detalhes */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleCopyDetails(selectedCNHDetails)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              >
                {copiedDetailsText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDetailsText ? "Copiado!" : "Copiar Dados"}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleOpenEdit(selectedCNHDetails);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Editar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleOpenEntrega(selectedCNHDetails);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>{selectedCNHDetails.situacao === "Entregue" ? "Atualizar Entrega" : "Confirmar Entrega"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
