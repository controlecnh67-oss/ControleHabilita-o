import React, { useState, useMemo } from "react";
import {
  X,
  Sparkles,
  Archive,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  Check,
  CheckSquare,
  Square,
  HelpCircle,
  FolderArchive,
  Building2,
  RefreshCw,
  Info,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Clock
} from "lucide-react";
import { GeralCNH, Usuario } from "../types";
import { DEFAULT_GAVETAS, DEFAULT_REPARTICOES } from "../lib/constants";
import {
  RegraMapeamentoInteligente,
  TABELA_MAPEAMENTO_NOVA_PADRAO,
  getSubfaixaInfo,
  calcularLocalizacaoInteligente,
  realocarCNHsInteligenteBulk
} from "../services/db";
import { formatCPF, formatDateTime, normalizeSearch } from "../lib/utils";

interface MapeamentoInteligenteModalProps {
  isOpen: boolean;
  onClose: () => void;
  cnhs: GeralCNH[];
  selectedIds?: string[];
  currentUser: Usuario | null;
  onSuccess: (updatedCount: number, message: string) => void;
}

type TabMode = "conferencia" | "tabela_referencia";
type FiltroAlocacao = "todas" | "divergentes" | "sem_localizacao" | "alinhadas" | "letra_a" | "letra_m";

export const MapeamentoInteligenteModal: React.FC<MapeamentoInteligenteModalProps> = ({
  isOpen,
  onClose,
  cnhs,
  selectedIds: initialSelectedIds = [],
  currentUser,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabMode>("conferencia");
  const [regrasMapeamento, setRegrasMapeamento] = useState<RegraMapeamentoInteligente[]>(
    TABELA_MAPEAMENTO_NOVA_PADRAO
  );

  // Filtros de visualização na conferência
  const [filtroAlocacao, setFiltroAlocacao] = useState<FiltroAlocacao>("divergentes");
  const [searchTerm, setSearchTerm] = useState("");
  const [apenasRecebidas, setApenasRecebidas] = useState(true);
  const [atualizarDataMovimento, setAtualizarDataMovimento] = useState(true);

  // Sobrescritas manuais por CNH (id -> { gaveta, reparticao })
  const [customDestinos, setCustomDestinos] = useState<Record<string, { gaveta: string; reparticao: string }>>({});

  // CNHs marcadas para serem realocadas
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [hasInitializedChecked, setHasInitializedChecked] = useState(false);

  // Estado de execução
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");

  // Diagnóstico completo de cada CNH analisada
  const analiseCNHs = useMemo(() => {
    return cnhs.map((cnh) => {
      const nomeLimpo = (cnh.nome || "").trim();
      const subInfo = getSubfaixaInfo(nomeLimpo);
      const locCalculada = calcularLocalizacaoInteligente(nomeLimpo, regrasMapeamento);

      const custom = customDestinos[cnh.id];
      const gavetaDestino = custom ? custom.gaveta : locCalculada.gaveta;
      const reparticaoDestino = custom ? custom.reparticao : locCalculada.reparticao;

      const gavetaAtual = (cnh.gaveta || "").trim();
      const reparticaoAtual = (cnh.reparticao || "").trim();

      const isSemLocalizacao =
        !gavetaAtual ||
        !reparticaoAtual ||
        gavetaAtual === "-" ||
        reparticaoAtual === "-" ||
        gavetaAtual.toLowerCase() === "vazio" ||
        reparticaoAtual.toLowerCase() === "vazio" ||
        gavetaAtual.toLowerCase() === "em trânsito";

      const isAlinhada =
        !isSemLocalizacao &&
        gavetaAtual.toLowerCase() === gavetaDestino.toLowerCase() &&
        reparticaoAtual.toLowerCase() === reparticaoDestino.toLowerCase();

      const isDivergente = !isAlinhada && !isSemLocalizacao;

      let statusAlocacao: "alinhada" | "divergente" | "sem_localizacao" = "alinhada";
      if (isSemLocalizacao) statusAlocacao = "sem_localizacao";
      else if (isDivergente) statusAlocacao = "divergente";

      return {
        cnh,
        subInfo,
        locCalculada,
        gavetaDestino,
        reparticaoDestino,
        gavetaAtual,
        reparticaoAtual,
        statusAlocacao,
        isAlinhada,
        isDivergente,
        isSemLocalizacao,
        isLetraA: subInfo.inicial === "A",
        isLetraM: subInfo.inicial === "M",
      };
    });
  }, [cnhs, regrasMapeamento, customDestinos]);

  // Contadores para o painel de diagnósticos
  const metrics = useMemo(() => {
    let totalAnalisadas = 0;
    let divergentes = 0;
    let semLocalizacao = 0;
    let alinhadas = 0;

    let letraA_Rep1 = 0;
    let letraA_Rep2 = 0;
    let letraM_Rep1 = 0;
    let letraM_Rep2 = 0;

    analiseCNHs.forEach((item) => {
      // Se filtro "apenasRecebidas" ativo nas métricas principais
      if (apenasRecebidas && item.cnh.situacao !== "Recebida") return;

      totalAnalisadas++;
      if (item.statusAlocacao === "divergente") divergentes++;
      else if (item.statusAlocacao === "sem_localizacao") semLocalizacao++;
      else alinhadas++;

      if (item.subInfo.subChave === "A-1") letraA_Rep1++;
      if (item.subInfo.subChave === "A-2") letraA_Rep2++;
      if (item.subInfo.subChave === "M-1") letraM_Rep1++;
      if (item.subInfo.subChave === "M-2") letraM_Rep2++;
    });

    return {
      totalAnalisadas,
      divergentes,
      semLocalizacao,
      alinhadas,
      precisamRealocacao: divergentes + semLocalizacao,
      letraA_Total: letraA_Rep1 + letraA_Rep2,
      letraA_Rep1,
      letraA_Rep2,
      letraM_Total: letraM_Rep1 + letraM_Rep2,
      letraM_Rep1,
      letraM_Rep2,
    };
  }, [analiseCNHs, apenasRecebidas]);

  // Inicializa a seleção padrão (marca CNHs divergentes e sem localização automaticamente)
  React.useEffect(() => {
    if (!isOpen) return;

    if (!hasInitializedChecked && analiseCNHs.length > 0) {
      const initialSet = new Set<string>();
      if (initialSelectedIds && initialSelectedIds.length > 0) {
        // Se usuário já havia selecionado linhas na tabela principal, marca-as
        initialSelectedIds.forEach((id) => initialSet.add(id));
      } else {
        // Padrão: marca todas que precisam de realocação (divergentes ou sem localização)
        analiseCNHs.forEach((it) => {
          if (apenasRecebidas && it.cnh.situacao !== "Recebida") return;
          if (it.statusAlocacao === "divergente" || it.statusAlocacao === "sem_localizacao") {
            initialSet.add(it.cnh.id);
          }
        });
      }
      setCheckedIds(initialSet);
      setHasInitializedChecked(true);
    }
  }, [isOpen, hasInitializedChecked, analiseCNHs, initialSelectedIds, apenasRecebidas]);

  // Lista filtrada para exibição na tabela de conferência
  const filteredItems = useMemo(() => {
    const q = normalizeSearch(searchTerm);

    return analiseCNHs.filter((item) => {
      // 1. Filtro por Situação Recebida (estoque no balcão) se ativado
      if (apenasRecebidas && item.cnh.situacao !== "Recebida") {
        return false;
      }

      // 2. Filtro de Alocação
      if (filtroAlocacao === "divergentes" && item.statusAlocacao !== "divergente") {
        return false;
      }
      if (filtroAlocacao === "sem_localizacao" && item.statusAlocacao !== "sem_localizacao") {
        return false;
      }
      if (filtroAlocacao === "alinhadas" && item.statusAlocacao !== "alinhada") {
        return false;
      }
      if (filtroAlocacao === "letra_a" && !item.isLetraA) {
        return false;
      }
      if (filtroAlocacao === "letra_m" && !item.isLetraM) {
        return false;
      }

      // 3. Pesquisa por texto
      if (q) {
        const nomeMatch = normalizeSearch(item.cnh.nome).includes(q);
        const cpfMatch = (item.cnh.cpf || "").replace(/\D/g, "").includes(q);
        const ordemMatch = String(item.cnh.ordem || "").includes(q);
        const subMatch = normalizeSearch(item.subInfo.subfaixaLabel).includes(q);
        const gavDestMatch = normalizeSearch(item.gavetaDestino).includes(q);
        const repDestMatch = normalizeSearch(item.reparticaoDestino).includes(q);
        return nomeMatch || cpfMatch || ordemMatch || subMatch || gavDestMatch || repDestMatch;
      }

      return true;
    });
  }, [analiseCNHs, filtroAlocacao, apenasRecebidas, searchTerm]);

  // Handlers de seleção
  const handleToggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((it) => next.add(it.cnh.id));
      return next;
    });
  };

  const handleDeselectAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((it) => next.delete(it.cnh.id));
      return next;
    });
  };

  const handleSelectOnlyDivergentAndEmpty = () => {
    const next = new Set<string>();
    analiseCNHs.forEach((it) => {
      if (apenasRecebidas && it.cnh.situacao !== "Recebida") return;
      if (it.statusAlocacao === "divergente" || it.statusAlocacao === "sem_localizacao") {
        next.add(it.cnh.id);
      }
    });
    setCheckedIds(next);
  };

  // Alteração pontual de destino para um registro
  const handleCustomDestinoChange = (
    cnhId: string,
    field: "gaveta" | "reparticao",
    value: string
  ) => {
    setCustomDestinos((prev) => {
      const cur = prev[cnhId] || {
        gaveta: analiseCNHs.find((a) => a.cnh.id === cnhId)?.locCalculada.gaveta || "Gaveta 1",
        reparticao: analiseCNHs.find((a) => a.cnh.id === cnhId)?.locCalculada.reparticao || "Repartição 1",
      };
      return {
        ...prev,
        [cnhId]: {
          ...cur,
          [field]: value,
        },
      };
    });
  };

  // Execução da Realocação em Lote
  const handleConfirmarRealocacao = async () => {
    const idsToUpdate = Array.from(checkedIds);
    if (idsToUpdate.length === 0) {
      alert("Por favor, marque pelo menos uma CNH para executar a realocação.");
      return;
    }

    const payloadItens = idsToUpdate
      .map((id) => {
        const item = analiseCNHs.find((a) => a.cnh.id === id);
        if (!item) return null;
        return {
          id,
          gaveta: item.gavetaDestino,
          reparticao: item.reparticaoDestino,
          motivo: item.subInfo.subfaixaLabel
            ? `Regra: ${item.subInfo.subfaixaLabel}`
            : undefined,
        };
      })
      .filter(Boolean) as Array<{ id: string; gaveta: string; reparticao: string; motivo?: string }>;

    setIsProcessing(true);
    setProgressText(`Processando ${payloadItens.length} registros...`);

    try {
      const uId = currentUser?.id || "admin";
      const uNome = currentUser?.nome_curto || currentUser?.nome || "Agente DETRAN";

      const res = await realocarCNHsInteligenteBulk(payloadItens, uId, uNome, {
        atualizarDataMovimento,
      });

      if (res.success) {
        onSuccess(res.updatedCount, res.message);
        onClose();
      } else {
        alert("Ocorreu um aviso durante a realocação. Verifique os dados.");
      }
    } catch (err: any) {
      console.error("Erro ao realocar CNHs:", err);
      alert(`Falha na realocação: ${err.message || "Tente novamente."}`);
    } finally {
      setIsProcessing(false);
      setProgressText("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-6xl w-full flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* ========================================================================= */}
        {/* HEADER DO MODAL */}
        {/* ========================================================================= */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white flex items-start justify-between gap-4 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 bg-white/15 backdrop-blur-md rounded-xl text-amber-300">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Mapeamento Inteligente — Checagem & Realocação de Gaveta e Repartição
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-200 border border-amber-300/30">
                2 Repartições Reservadas para A e M
              </span>
            </div>
            <p className="text-xs text-blue-100/90 mt-1.5 max-w-3xl leading-relaxed">
              Mapeamento automático com conferência das 4 gavetas e 32 repartições físicas. Devido ao grande volume de titulares com inicial <strong>A</strong> e <strong>M</strong>, foram reservadas <strong>duas repartições dedicadas</strong> para cada uma dessas letras, permitindo alocação balanceada e conferência registro a registro antes de aplicar ao sistema.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SELETOR DE ABAS DO MODAL */}
        {/* ========================================================================= */}
        <div className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("conferencia")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "conferencia"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/80 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <CheckSquare className="w-4 h-4 text-blue-500" />
              <span>Conferência & Realocação em Lote</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                {checkedIds.size} selecionadas
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("tabela_referencia")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "tabela_referencia"
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Building2 className="w-4 h-4 text-indigo-500" />
              <span>Tabela Nova de Mapeamento (4 Gavetas × 8 Repartições)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300/40">
                Regras A & M
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={apenasRecebidas}
                onChange={(e) => setApenasRecebidas(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
              />
              <span>Focar no estoque físico no balcão (Situação: <strong>Recebida</strong>)</span>
            </label>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CORPO DO MODAL */}
        {/* ========================================================================= */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 dark:text-slate-100">
          
          {/* ========================================================================= */}
          {/* ABA 1: CONFERÊNCIA & REALOCAÇÃO EM LOTE */}
          {/* ========================================================================= */}
          {activeTab === "conferencia" && (
            <div className="space-y-6">
              
              {/* CARDS DE DIAGNÓSTICO E MÉTRICAS */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                
                {/* 1. Total Analisadas */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                  <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                    Total Analisadas
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-mono font-black text-slate-900 dark:text-white">
                      {metrics.totalAnalisadas}
                    </span>
                    <span className="text-[10px] text-slate-400">CNHs</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                    {apenasRecebidas ? "Apenas em estoque" : "Base completa"}
                  </span>
                </div>

                {/* 2. Divergentes (Necessitam Realocação) */}
                <button
                  type="button"
                  onClick={() => setFiltroAlocacao("divergentes")}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    filtroAlocacao === "divergentes"
                      ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/40 shadow-xs"
                      : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 hover:border-amber-400"
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block tracking-wider flex items-center justify-between">
                    <span>⚠️ Divergentes</span>
                    <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.2 rounded-full">
                      Mudar
                    </span>
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-mono font-black text-amber-700 dark:text-amber-300">
                      {metrics.divergentes}
                    </span>
                    <span className="text-[10px] text-amber-600/80">CNHs</span>
                  </div>
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 block mt-0.5">
                    Gaveta/Rep. incorreta
                  </span>
                </button>

                {/* 3. Sem Localização (Vazias) */}
                <button
                  type="button"
                  onClick={() => setFiltroAlocacao("sem_localizacao")}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    filtroAlocacao === "sem_localizacao"
                      ? "bg-rose-500/10 border-rose-500 ring-2 ring-rose-400/40 shadow-xs"
                      : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 hover:border-rose-400"
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 block tracking-wider">
                    🔴 Sem Local
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-mono font-black text-rose-700 dark:text-rose-300">
                      {metrics.semLocalizacao}
                    </span>
                    <span className="text-[10px] text-rose-600/80">CNHs</span>
                  </div>
                  <span className="text-[10px] text-rose-700/80 dark:text-rose-400/80 block mt-0.5">
                    Vazias / Em trânsito
                  </span>
                </button>

                {/* 4. Corretas / Alinhadas */}
                <button
                  type="button"
                  onClick={() => setFiltroAlocacao("alinhadas")}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    filtroAlocacao === "alinhadas"
                      ? "bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-400/40 shadow-xs"
                      : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-400"
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block tracking-wider">
                    ✅ Alinhadas
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-mono font-black text-emerald-700 dark:text-emerald-300">
                      {metrics.alinhadas}
                    </span>
                    <span className="text-[10px] text-emerald-600/80">CNHs</span>
                  </div>
                  <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 block mt-0.5">
                    Já na repartição certa
                  </span>
                </button>

                {/* 5. Especial Letra A (2 Repartições) */}
                <button
                  type="button"
                  onClick={() => setFiltroAlocacao("letra_a")}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    filtroAlocacao === "letra_a"
                      ? "bg-blue-500/15 border-blue-500 ring-2 ring-blue-400/40 shadow-xs"
                      : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 hover:border-blue-400"
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300 block tracking-wider flex items-center justify-between">
                    <span>🗂️ Inicial A</span>
                    <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.2 rounded-full">
                      2 Repartições
                    </span>
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-mono font-black text-blue-700 dark:text-blue-300">
                      {metrics.letraA_Total}
                    </span>
                    <span className="text-[10px] text-blue-600/80">CNHs</span>
                  </div>
                  <div className="text-[9px] font-mono text-blue-700/80 dark:text-blue-300/80 mt-0.5 flex items-center gap-1 justify-between">
                    <span>R1(Aa-Al): <strong>{metrics.letraA_Rep1}</strong></span>
                    <span>R2(Am-Az): <strong>{metrics.letraA_Rep2}</strong></span>
                  </div>
                </button>

                {/* 6. Especial Letra M (2 Repartições) */}
                <button
                  type="button"
                  onClick={() => setFiltroAlocacao("letra_m")}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    filtroAlocacao === "letra_m"
                      ? "bg-indigo-500/15 border-indigo-500 ring-2 ring-indigo-400/40 shadow-xs"
                      : "bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-400"
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 block tracking-wider flex items-center justify-between">
                    <span>🗂️ Inicial M</span>
                    <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.2 rounded-full">
                      2 Repartições
                    </span>
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-mono font-black text-indigo-700 dark:text-indigo-300">
                      {metrics.letraM_Total}
                    </span>
                    <span className="text-[10px] text-indigo-600/80">CNHs</span>
                  </div>
                  <div className="text-[9px] font-mono text-indigo-700/80 dark:text-indigo-300/80 mt-0.5 flex items-center gap-1 justify-between">
                    <span>R1(Ma-Me): <strong>{metrics.letraM_Rep1}</strong></span>
                    <span>R2(Maria+): <strong>{metrics.letraM_Rep2}</strong></span>
                  </div>
                </button>

              </div>

              {/* BARRA DE FILTROS E PESQUISA */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                
                {/* Abas Rápidas de Filtro de Alocação */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
                    <Filter className="w-3.5 h-3.5 text-blue-500" />
                    Filtrar:
                  </span>
                  {[
                    { id: "todas", label: `Todas (${analiseCNHs.length})` },
                    { id: "divergentes", label: `⚠️ Divergentes (${metrics.divergentes})` },
                    { id: "sem_localizacao", label: `🔴 Sem Local (${metrics.semLocalizacao})` },
                    { id: "alinhadas", label: `✅ Alinhadas (${metrics.alinhadas})` },
                    { id: "letra_a", label: `🔤 Inicial A (${metrics.letraA_Total})` },
                    { id: "letra_m", label: `🔤 Inicial M (${metrics.letraM_Total})` },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltroAlocacao(f.id as FiltroAlocacao)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        filtroAlocacao === f.id
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Campo de Pesquisa Instantânea */}
                <div className="relative min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar titular, CPF, #Ordem..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

              </div>

              {/* BARRA DE AÇÕES EM MASSA DE SELEÇÃO */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Exibindo <strong className="text-blue-600 font-mono">{filteredItems.length}</strong> CNHs |
                    <strong className="text-indigo-600 font-mono ml-1">{checkedIds.size}</strong> marcadas para realocação
                  </span>

                  <button
                    type="button"
                    onClick={handleSelectOnlyDivergentAndEmpty}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                    <span>🎯 Marcar Todas que Precisam de Realocação ({metrics.precisamRealocacao})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Marcar Visíveis ({filteredItems.length})
                  </button>

                  <button
                    type="button"
                    onClick={handleDeselectAllVisible}
                    className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    Desmarcar Visíveis
                  </button>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                  <span>Dica: você pode alterar pontualmente a gaveta ou repartição de destino diretamente na linha da tabela.</span>
                </div>
              </div>

              {/* TABELA DE CONFERÊNCIA REGISTRO A REGISTRO */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-slate-900">
                <div className="overflow-x-auto max-h-[480px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-bold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 shadow-2xs">
                      <tr>
                        <th className="py-3 px-3 w-10 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const allVisChecked = filteredItems.length > 0 && filteredItems.every((it) => checkedIds.has(it.cnh.id));
                              if (allVisChecked) handleDeselectAllVisible();
                              else handleSelectAllVisible();
                            }}
                            className="cursor-pointer text-slate-500 hover:text-blue-600 p-0.5"
                            title="Alternar seleção de todas as linhas visíveis"
                          >
                            {filteredItems.length > 0 && filteredItems.every((it) => checkedIds.has(it.cnh.id)) ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-2 w-14 text-center"># Ordem</th>
                        <th className="py-3 px-3 min-w-[240px]">Nome do Titular & Regra Inteligente</th>
                        <th className="py-3 px-2 w-28 text-center">CPF</th>
                        <th className="py-3 px-2 w-24 text-center">Situação</th>
                        <th className="py-3 px-3 min-w-[170px] text-center">Localização Atual</th>
                        <th className="py-3 px-1 w-8 text-center text-slate-400">➔</th>
                        <th className="py-3 px-3 min-w-[210px] text-center">Nova Localização (Sugerida)</th>
                        <th className="py-3 px-3 w-36 text-center">Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400">
                            <Archive className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                            <p className="font-semibold text-sm">Nenhuma CNH encontrada para os filtros selecionados.</p>
                            <p className="text-xs mt-1">Tente alternar a pílula de filtro acima ou limpar a busca.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          const isChecked = checkedIds.has(item.cnh.id);

                          return (
                            <tr
                              key={item.cnh.id}
                              onClick={() => handleToggleCheck(item.cnh.id)}
                              className={`transition-colors cursor-pointer select-none ${
                                isChecked
                                  ? "bg-blue-50/60 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                  : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleCheck(item.cnh.id)}
                                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                />
                              </td>

                              {/* # Ordem */}
                              <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-500">
                                #{item.cnh.ordem}
                              </td>

                              {/* Nome do Titular & Regra */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <strong className="text-slate-900 dark:text-white text-xs">
                                    {item.cnh.nome}
                                  </strong>
                                  
                                  {/* Badge de Destaque para A e M com 2 Repartições */}
                                  {item.isLetraA && (
                                    <span className="px-1.5 py-0.5 rounded-md font-mono font-bold text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                      {item.subInfo.subfaixaLabel}
                                    </span>
                                  )}
                                  {item.isLetraM && (
                                    <span className="px-1.5 py-0.5 rounded-md font-mono font-bold text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                      {item.subInfo.subfaixaLabel}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  {item.subInfo.detalheRegra}
                                </span>
                              </td>

                              {/* CPF */}
                              <td className="py-2.5 px-2 text-center font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {item.cnh.cpf ? formatCPF(item.cnh.cpf) : "-"}
                              </td>

                              {/* Situação */}
                              <td className="py-2.5 px-2 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    item.cnh.situacao === "Recebida"
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                      : item.cnh.situacao === "Entregue"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                      : item.cnh.situacao === "Pendente"
                                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  }`}
                                >
                                  {item.cnh.situacao}
                                </span>
                              </td>

                              {/* Localização Atual */}
                              <td className="py-2.5 px-3 text-center">
                                {item.isSemLocalizacao ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold text-[11px] border border-rose-200 dark:border-rose-900/60">
                                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                                    Sem Localização
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-[11px] border border-slate-200 dark:border-slate-700">
                                    <Archive className="w-3 h-3 text-slate-500" />
                                    <span>{item.gavetaAtual}</span>
                                    <span>•</span>
                                    <span>{item.reparticaoAtual}</span>
                                  </span>
                                )}
                              </td>

                              {/* Seta */}
                              <td className="py-2.5 px-1 text-center font-bold text-slate-300 dark:text-slate-600">
                                ➔
                              </td>

                              {/* Nova Localização (Sugerida / Customizável) */}
                              <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  {/* Select Gaveta */}
                                  <select
                                    value={item.gavetaDestino}
                                    onChange={(e) => handleCustomDestinoChange(item.cnh.id, "gaveta", e.target.value)}
                                    className="px-2 py-1 bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg text-xs font-bold text-blue-900 dark:text-blue-200 focus:ring-2 focus:ring-blue-500"
                                  >
                                    {DEFAULT_GAVETAS.filter((g) => g !== "Em trânsito" && g !== "Vazio").map((g) => (
                                      <option key={g} value={g}>{g}</option>
                                    ))}
                                  </select>

                                  {/* Select Repartição */}
                                  <select
                                    value={item.reparticaoDestino}
                                    onChange={(e) => handleCustomDestinoChange(item.cnh.id, "reparticao", e.target.value)}
                                    className="px-2 py-1 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-xs font-bold text-indigo-900 dark:text-indigo-200 focus:ring-2 focus:ring-indigo-500"
                                  >
                                    {DEFAULT_REPARTICOES.filter((r) => r !== "Geral" && r !== "Vazio").map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                </div>
                              </td>

                              {/* Diagnóstico */}
                              <td className="py-2.5 px-3 text-center">
                                {item.statusAlocacao === "alinhada" ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Alinhada
                                  </span>
                                ) : item.statusAlocacao === "sem_localizacao" ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    Alocar
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    <RefreshCw className="w-3 h-3 text-amber-600" />
                                    Realocar
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
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 2: TABELA NOVA DE MAPEAMENTO (REFERÊNCIA 4 GAVETAS × 8 REPARTIÇÕES) */}
          {/* ========================================================================= */}
          {activeTab === "tabela_referencia" && (
            <div className="space-y-6">
              
              {/* Banner Informativo Explicando as 2 Repartições de A e M */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-blue-500/10 to-indigo-500/15 border border-amber-300/60 dark:border-amber-800/60 flex items-start gap-3.5">
                <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-200 space-y-1">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Organização do Arquivo Físico: 2 Repartições Reservadas para 'A' e 'M'</span>
                    <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">
                      Otimização Operacional
                    </span>
                  </h4>
                  <p className="leading-relaxed">
                    Em razão da alta concentração de cidadãos com nomes iniciados em <strong>A</strong> (como Alexandre, Amanda, Ana, Antonio...) e <strong>M</strong> (como Manoel, Marcelo, Márcio, Marcos, Maria e Mariana), foram reservadas <strong>duas repartições completas</strong> para cada uma dessas iniciais:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900/60">
                      <strong className="text-blue-600 dark:text-blue-400 block">🗂️ Inicial A (Dupla):</strong>
                      <span>• Repartição 1: Nomes de <strong>Aa até Al</strong> (Alexandre, Adailton...)</span><br />
                      <span>• Repartição 2: Nomes de <strong>Am até Az</strong> (Amanda, Ana, Antonio...)</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/60">
                      <strong className="text-indigo-600 dark:text-indigo-400 block">🗂️ Inicial M (Dupla):</strong>
                      <span>• Repartição 6: Nomes de <strong>Ma até Marc</strong> (Manoel, Marcelo, Marcos...)</span><br />
                      <span>• Repartição 7: Nomes de <strong>Mari até Mz</strong> (Maria [todas], Mateus, Mauro...)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Matriz Visual das 4 Gavetas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((gNum) => {
                  const gavetaName = `Gaveta ${gNum}`;
                  const regrasGaveta = regrasMapeamento.filter((r) => r.gaveta === gavetaName);

                  return (
                    <div
                      key={gNum}
                      className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col"
                    >
                      <div className="p-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                          <Archive className="w-4 h-4 text-blue-600" />
                          Gaveta {gNum}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          8 Repartições
                        </span>
                      </div>

                      <div className="p-3 space-y-2 flex-1 text-xs">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((rNum) => {
                          const repName = `Repartição ${rNum}`;
                          const regrasRep = regrasGaveta.filter((r) => r.reparticao === repName);

                          return (
                            <div
                              key={rNum}
                              className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                                regrasRep.some((r) => r.isDupla)
                                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/80 ring-1 ring-amber-400/30"
                                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono font-bold text-[10px] text-slate-400">
                                  R{rNum}:
                                </span>
                                {regrasRep.length === 0 ? (
                                  <span className="text-slate-400 text-[11px] italic">Livre / Reserva</span>
                                ) : (
                                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                                    {regrasRep.map((r) => (
                                      <span
                                        key={r.chave}
                                        className={`px-1.5 py-0.2 rounded-md font-mono font-bold text-[10px] ${
                                          r.isDupla
                                            ? "bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 border border-amber-400/50"
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                        }`}
                                        title={r.descricao}
                                      >
                                        {r.subfaixa ? `${r.letra} (${r.subfaixa})` : r.letra}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {regrasRep.some((r) => r.isDupla) && (
                                <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                                  ★ Dupla
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botão de Restaurar Padrão */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRegrasMapeamento(TABELA_MAPEAMENTO_NOVA_PADRAO);
                    alert("Tabela nova restaurada com os padrões balanceados para as 4 gavetas.");
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Restaurar Padrão Oficial DETRAN
                </button>
              </div>

            </div>
          )}

        </div>

        {/* ========================================================================= */}
        {/* FOOTER DO MODAL */}
        {/* ========================================================================= */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer select-none font-medium">
              <input
                type="checkbox"
                checked={atualizarDataMovimento}
                onChange={(e) => setAtualizarDataMovimento(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
              />
              <span>Atualizar data da movimentação para agora ({new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})</span>
            </label>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmarRealocacao}
              disabled={isProcessing || checkedIds.size === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span>{progressText || "Realocando em lote..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>
                    Confirmar Realocação em Lote ({checkedIds.size} CNHs)
                  </span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
