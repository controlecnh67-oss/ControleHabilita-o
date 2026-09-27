import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Search, 
  Filter, 
  Columns, 
  CheckCircle2, 
  Clock, 
  Inbox, 
  Truck, 
  X, 
  User, 
  RefreshCw, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  FileText,
  ShieldCheck,
  Copy,
  Phone,
  FolderArchive,
  Building2,
  Calendar,
  UserCheck,
  Eye,
  Tag,
  Printer,
  FileSpreadsheet
} from "lucide-react";
import { GeralCNH, Responsavel, SituacaoGeral } from "../types";
import { getGeralCNHs, getResponsaveis } from "../services/db";
import { syncGeralWithSupabase, deduplicateCNHRecords } from "../services/dexieDb";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
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

// Interface para as colunas visíveis da Consulta
export interface ConsultaCNHVisibleColumns {
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
  ficha: boolean;
}

export const DEFAULT_CONSULTA_COLUMNS: ConsultaCNHVisibleColumns = {
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
  ficha: true,
};

const STORAGE_KEY_COLUMNS = "detran_consulta_cnh_columns";

export const ConsultaCNHPage: React.FC = () => {
  const { user } = useAuth();

  // Estados dos dados principais
  const [cnhs, setCnhs] = useState<GeralCNH[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const [visibleColumns, setVisibleColumns] = useState<ConsultaCNHVisibleColumns>(() => {
    if (typeof window !== "undefined") {
      try {
        const userKey = user?.email || user?.id;
        const saved = userKey ? localStorage.getItem(`${STORAGE_KEY_COLUMNS}_${userKey}`) : null;
        if (saved) return { ...DEFAULT_CONSULTA_COLUMNS, ...JSON.parse(saved) };
        const general = localStorage.getItem(STORAGE_KEY_COLUMNS);
        if (general) return { ...DEFAULT_CONSULTA_COLUMNS, ...JSON.parse(general) };
      } catch {}
    }
    return DEFAULT_CONSULTA_COLUMNS;
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

  // Modal de Ficha da CNH
  const [isFichaModalOpen, setIsFichaModalOpen] = useState(false);
  const [selectedCNH, setSelectedCNH] = useState<GeralCNH | null>(null);
  const [copiedFichaText, setCopiedFichaText] = useState(false);

  // Feedback de Cópia Rápida em campos
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

  // Abrir Ficha da CNH (ao clicar na linha ou no botão de ficha)
  const handleOpenFicha = (cnh: GeralCNH, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCNH(cnh);
    setIsFichaModalOpen(true);
  };

  // Copiar dados completos da ficha
  const handleCopyFicha = (cnh: GeralCNH) => {
    const text = `=============================
DETRAN - FICHA DA CNH #${cnh.ordem}
=============================
Titular: ${cnh.nome}
CPF: ${cnh.cpf ? formatCPF(cnh.cpf) : "Não informado"}
${cnh.telefone ? `Telefone: ${formatPhone(cnh.telefone)}` : ""}
${cnh.pa ? `PA: ${cnh.pa}` : ""}
Situação: ${cnh.situacao}
Gaveta: ${cnh.gaveta ? cleanGavetaText(cnh.gaveta) : "-"}
Repartição: ${cnh.reparticao ? cleanReparticaoText(cnh.reparticao) : "-"}
${cnh.responsavel_nome ? `Retirado por: ${getResponsavelDisplayName(cnh.responsavel_nome, cnh.responsavel_id)}` : ""}
${cnh.lote ? `Lote: ${cnh.lote}` : ""}
Data de Movimento: ${formatDateTime(cnh.data_movimento)}
Operador: ${cnh.usuario_nome || "Sistema"}
${cnh.observacao ? `Observação: ${cnh.observacao}` : ""}`;

    navigator.clipboard.writeText(text);
    setCopiedFichaText(true);
    setTimeout(() => setCopiedFichaText(false), 2000);
  };

  // Imprimir ficha
  const handlePrintFicha = () => {
    window.print();
  };

  // Carregar dados
  const fetchDados = async () => {
    try {
      const [dataCnhs, dataResp] = await Promise.all([getGeralCNHs(), getResponsaveis()]);
      const { cleanList } = deduplicateCNHRecords(dataCnhs);
      setCnhs(cleanList);
      setResponsaveis(dataResp);
    } catch (err) {
      console.error("Erro ao carregar dados da Consulta CNH:", err);
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
      if (nome.toLowerCase().includes("próprio") || nome.toLowerCase().includes("proprietário")) {
        return "Próprio Titular";
      }
      return nome;
    }
    const found = responsaveis.find((r) => r.id === id);
    if (found) {
      if (found.nome.toLowerCase().includes("próprio") || found.nome.toLowerCase().includes("proprietário")) {
        return "Próprio Titular";
      }
      return found.nome;
    }
    return "-";
  };

  // Alternar Colunas Visíveis
  const toggleColumn = (key: keyof ConsultaCNHVisibleColumns) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleResetColumns = () => {
    setVisibleColumns(DEFAULT_CONSULTA_COLUMNS);
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
      ficha: true,
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-4">
      {/* HEADER VISUAL DA CONSULTA CNH */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Consulta CNH
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Modo Consulta
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pesquisa geral e localização física imediata. <strong className="text-blue-600 dark:text-blue-400">Clique na linha</strong> para abrir a ficha completa.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing || loading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Atualizar lista com dados em tempo real"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (refreshing || loading) && "animate-spin text-blue-600")} />
              <span>{refreshing ? "Sincronizando..." : "Atualizar"}</span>
            </button>
          </div>
        </div>

        {/* CARDS VISUAIS DE STATUS (FILTROS RÁPIDOS INTERATIVOS) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          {/* Card: Total */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("todas");
              setCurrentPage(1);
            }}
            className={cn(
              "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
              filtroSituacao === "todas"
                ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-white shadow-sm ring-2 ring-slate-400/20"
                : "bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-850 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Todas</span>
              <FileSpreadsheet className="w-3.5 h-3.5 opacity-60" />
            </div>
            <div className="text-xl font-mono font-black mt-1">{counts.todas}</div>
          </button>

          {/* Card: Recebida (No Balcão) */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Recebida");
              setCurrentPage(1);
            }}
            className={cn(
              "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
              filtroSituacao === "Recebida"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 ring-2 ring-emerald-400/40"
                : "bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                No Balcão
              </span>
              <Inbox className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-mono font-black mt-1">{counts.Recebida}</div>
          </button>

          {/* Card: Entregue */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Entregue");
              setCurrentPage(1);
            }}
            className={cn(
              "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
              filtroSituacao === "Entregue"
                ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 ring-2 ring-blue-400/40"
                : "bg-blue-50/60 hover:bg-blue-100/60 dark:bg-blue-950/40 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider">Entregues</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-mono font-black mt-1">{counts.Entregue}</div>
          </button>

          {/* Card: Remetida */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Remetida");
              setCurrentPage(1);
            }}
            className={cn(
              "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
              filtroSituacao === "Remetida"
                ? "bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20 ring-2 ring-amber-400/40"
                : "bg-amber-50/60 hover:bg-amber-100/60 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider">Remetidas</span>
              <Truck className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-mono font-black mt-1">{counts.Remetida}</div>
          </button>

          {/* Card: Pendente */}
          <button
            type="button"
            onClick={() => {
              setFiltroSituacao("Pendente");
              setCurrentPage(1);
            }}
            className={cn(
              "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1",
              filtroSituacao === "Pendente"
                ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20 ring-2 ring-rose-400/40"
                : "bg-rose-50/60 hover:bg-rose-100/60 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider">Pendentes</span>
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-mono font-black mt-1">{counts.Pendente}</div>
          </button>
        </div>
      </div>

      {/* BARRA DE PESQUISA RÁPIDA GERAL & CONTROLES */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Campo de Pesquisa Rápida Geral */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Pesquisar por Nome, CPF, Ordem (#), PA, Gaveta, Repartição, Lote..."
            className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-hidden transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Seletor de Colunas Visíveis */}
        <div className="relative shrink-0 flex items-center gap-2" ref={columnSelectorRef}>
          <button
            type="button"
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Selecionar colunas visíveis na tabela"
          >
            <Columns className="w-4 h-4 text-blue-500" />
            <span>Colunas</span>
          </button>

          {/* Dropdown do Seletor de Colunas */}
          {showColumnSelector && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 p-3 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Columns className="w-3.5 h-3.5 text-blue-500" />
                  Colunas Visíveis
                </span>
                <button
                  type="button"
                  onClick={() => setShowColumnSelector(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 pr-1 text-xs">
                {[
                  { key: "ordem", label: "# Ordem (Identificador)" },
                  { key: "pa", label: "PA (Processo Administrativo)" },
                  { key: "nome", label: "Nome do Titular" },
                  { key: "cpf", label: "CPF" },
                  { key: "telefone", label: "Telefone" },
                  { key: "gaveta", label: "Gaveta" },
                  { key: "reparticao", label: "Repartição" },
                  { key: "situacao", label: "Situação" },
                  { key: "responsavel", label: "Retirado Por" },
                  { key: "data_movimento", label: "Data Movimento" },
                  { key: "usuario", label: "Operador" },
                  { key: "lote", label: "Lote" },
                  { key: "observacao", label: "Observações" },
                  { key: "ficha", label: "Ficha da CNH" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300 font-medium select-none"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key as keyof ConsultaCNHVisibleColumns]}
                      onChange={() => toggleColumn(key as keyof ConsultaCNHVisibleColumns)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAllColumns}
                  className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={handleResetColumns}
                  className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
                >
                  Restaurar Padrão
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FILTRO DE SITUAÇÃO (BOTÕES RÁPIDOS) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs select-none">
        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] shrink-0 flex items-center gap-1">
          <Filter className="w-3 h-3 text-slate-400" />
          Situação:
        </span>

        <button
          type="button"
          onClick={() => {
            setFiltroSituacao("todas");
            setCurrentPage(1);
          }}
          className={cn(
            "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 border shrink-0",
            filtroSituacao === "todas"
              ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 shadow-sm"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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

        {/* Destaque para Recebidas (No Balcão) */}
        <button
          type="button"
          onClick={() => {
            setFiltroSituacao("Recebida");
            setCurrentPage(1);
          }}
          className={cn(
            "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 border shrink-0",
            filtroSituacao === "Recebida"
              ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 ring-2 ring-emerald-500/20"
              : "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
          )}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Recebida (No Balcão)</span>
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
            "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 border shrink-0",
            filtroSituacao === "Entregue"
              ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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
            "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 border shrink-0",
            filtroSituacao === "Remetida"
              ? "bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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
            "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 border shrink-0",
            filtroSituacao === "Pendente"
              ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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

      {/* TABELA DE CONSULTA CNH COM CLIQUE NA LINHA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col flex-1">
        {/* Barra superior de contagem e paginação */}
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
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium ml-2">
              💡 Dica: Clique em qualquer linha para abrir a Ficha Completa
            </span>
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

        {/* Tabela de Consulta */}
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
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
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
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
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
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
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
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
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
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.reparticao && (
                  <th
                    onClick={() => handleSort("reparticao")}
                    className="py-3 px-3 w-28 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Repartição</span>
                      {sortColumn === "reparticao" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.situacao && (
                  <th
                    onClick={() => handleSort("situacao")}
                    className="py-3 px-3 w-28 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                      <span>Situação</span>
                      {sortColumn === "situacao" && (
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.responsavel && (
                  <th className="py-3 px-3 min-w-[150px]">
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
                        sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      )}
                    </div>
                  </th>
                )}

                {visibleColumns.usuario && (
                  <th className="py-3 px-3 w-28">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>Operador</span>
                    </div>
                  </th>
                )}

                {visibleColumns.lote && (
                  <th className="py-3 px-3 w-24">
                    <span>Lote</span>
                  </th>
                )}

                {visibleColumns.observacao && (
                  <th className="py-3 px-3 min-w-[160px]">
                    <span>Observações</span>
                  </th>
                )}

                {visibleColumns.ficha && (
                  <th className="py-3 px-3 w-24 text-center sticky right-0 bg-slate-100 dark:bg-slate-800 shadow-xs">
                    <span>Ficha CNH</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={14}
                    className="py-12 text-center text-slate-500 dark:text-slate-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="font-semibold text-xs">Carregando CNHs para consulta...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-500">
                    <Search className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
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

                  return (
                    <tr
                      key={cnh.id}
                      onClick={() => handleOpenFicha(cnh)}
                      title="Clique em qualquer ponto da linha para abrir a Ficha da CNH"
                      className={cn(
                        "hover:bg-blue-50/70 dark:hover:bg-slate-800/80 transition-colors group cursor-pointer border-b border-slate-100 dark:border-slate-800/80",
                        isReadyForDelivery && "bg-emerald-50/15 dark:bg-emerald-950/10 hover:bg-emerald-50/40"
                      )}
                    >
                      {/* # Ordem - Destaque visual arredondado em azul claro */}
                      {visibleColumns.ordem && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 border border-blue-200 dark:border-blue-700 shadow-2xs tracking-wide group-hover:scale-105 transition-transform">
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

                      {/* Situação com Badge colorido */}
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

                      {/* Botão de Abrir Ficha */}
                      {visibleColumns.ficha && (
                        <td className="py-2 px-3 text-center sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors shadow-xs">
                          <button
                            type="button"
                            onClick={(e) => handleOpenFicha(cnh, e)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs mx-auto"
                            title="Abrir Ficha Completa da CNH"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>Ficha</span>
                          </button>
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

      {/* MODAL: FICHA COMPLETA DA CNH (Focada em Consulta) */}
      <Modal
        isOpen={isFichaModalOpen}
        onClose={() => {
          setIsFichaModalOpen(false);
          setSelectedCNH(null);
        }}
        title="📄 Ficha Completa da CNH"
        maxWidth="lg"
      >
        {selectedCNH && (
          <div className="space-y-4">
            {/* Header com Ordem, Nome, CPF e Situação */}
            <div className="p-4 bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50 dark:from-slate-800 dark:via-slate-850 dark:to-slate-850 rounded-2xl border border-blue-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-base px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
                  #{selectedCNH.ordem}
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {selectedCNH.nome}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                      CPF: {selectedCNH.cpf ? formatCPF(selectedCNH.cpf) : "Não informado"}
                    </span>
                    {selectedCNH.cpf && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(formatCPF(selectedCNH.cpf), "modal-cpf")}
                        className="text-slate-400 hover:text-blue-600 p-0.5 rounded cursor-pointer"
                        title="Copiar CPF"
                      >
                        {copiedKey === "modal-cpf" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <Badge situacao={selectedCNH.situacao} />
            </div>

            {/* Grid de Informações Visuais Detalhadas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Localização Física (Gaveta e Repartição) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Localização Física no Órgão
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs">
                    <FolderArchive className="w-4 h-4 text-blue-500" />
                    <span>Gaveta {cleanGavetaText(selectedCNH.gaveta)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800 shadow-2xs">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <span>Repartição {cleanReparticaoText(selectedCNH.reparticao)}</span>
                  </span>
                </div>
              </div>

              {/* Contato & Identificadores */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Identificadores & Contato
                </span>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Telefone:</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      {selectedCNH.telefone ? (
                        <>
                          <Phone className="w-3 h-3 text-emerald-600" />
                          {formatPhone(selectedCNH.telefone)}
                        </>
                      ) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Processo Adm. (PA):</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {selectedCNH.pa || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Lote da Remessa:</span>
                    <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                      {selectedCNH.lote || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Movimentação & Auditoria */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Movimentação & Auditoria
                </span>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Data de Movimento:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-200 font-semibold">
                      {formatDateTime(selectedCNH.data_movimento)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Operador:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                      {selectedCNH.usuario_nome || "Sistema"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Data de Cadastro:</span>
                    <span className="font-mono text-slate-500 text-[11px]">
                      {formatDateTime(selectedCNH.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Retirada / Responsável */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Registro de Entrega / Retirada
                </span>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Retirado Por:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {getResponsavelDisplayName(selectedCNH.responsavel_nome, selectedCNH.responsavel_id)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Situação Atual:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {selectedCNH.situacao}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Observações */}
            {selectedCNH.observacao && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-300 block mb-0.5">
                  Observações Registradas:
                </span>
                <p className="text-amber-900 dark:text-amber-200 italic">
                  {selectedCNH.observacao}
                </p>
              </div>
            )}

            {/* Ações da Ficha (Focada em Consulta) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyFicha(selectedCNH)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                >
                  {copiedFichaText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFichaText ? "Dados Copiados!" : "Copiar Dados da CNH"}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintFicha}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                  title="Imprimir ficha da CNH"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Imprimir Ficha</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFichaModalOpen(false);
                  setSelectedCNH(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-blue-600/20"
              >
                <span>Fechar</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
