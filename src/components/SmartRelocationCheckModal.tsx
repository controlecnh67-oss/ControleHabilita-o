import React, { useState, useMemo } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderArchive,
  Building2,
  Filter,
  Search,
  ArrowRight,
  Database,
  Check,
  X,
  SlidersHorizontal,
  Table as TableIcon,
  HelpCircle,
  ShieldCheck,
  Send,
  Layers,
  Info
} from "lucide-react";
import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import { GeralCNH, Usuario } from "../types";
import {
  MATRIZ_OFICIAL_ROWS,
  DUAL_LETTER_RULES,
  SmartRelocationMode,
  analyzeSmartRelocation,
  SmartRelocationItem
} from "../services/smartMappingService";
import { saveLocalGeralCNHsBulk, notifySyncUpdated } from "../services/dexieDb";
import { logAuditoriaBulk, saveStoredList, getStoredList, SEED_MAPEAMENTO } from "../services/db";
import { isSupabaseConfigured } from "../services/supabase";
import { formatCPF } from "../lib/utils";

export interface SmartRelocationCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  cnhs: GeralCNH[];
  selectedIds: string[];
  currentUser: Usuario | null;
  onSuccess: (updatedCount: number, message: string) => void;
}

export const SmartRelocationCheckModal: React.FC<SmartRelocationCheckModalProps> = ({
  isOpen,
  onClose,
  cnhs,
  selectedIds,
  currentUser,
  onSuccess,
}) => {
  // Modo de balanceamento para letras com repartição dupla (A, M, G, J, R)
  const [allocationMode, setAllocationMode] = useState<SmartRelocationMode>("balanced");

  // Escopo de aplicação: todas as CNHs ou apenas as selecionadas
  const [scope, setScope] = useState<"all" | "selected">(() =>
    selectedIds.length > 0 ? "selected" : "all"
  );

  // Aba interna do modal
  const [activeTab, setActiveTab] = useState<"matrix" | "preview" | "summary">("summary");

  // Filtros da prévia
  const [previewFilter, setPreviewFilter] = useState<"all" | "changes_only" | "aligned_only">("changes_only");
  const [filterLetter, setFilterLetter] = useState<string>("todas");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Estado de execução
  const [syncToSupabase, setSyncToSupabase] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const isSupabaseReady = isSupabaseConfigured();

  // Conjunto de CNHs a analisar conforme o escopo escolhido
  const targetCNHs = useMemo(() => {
    if (scope === "selected" && selectedIds.length > 0) {
      const set = new Set(selectedIds);
      return cnhs.filter((c) => set.has(c.id));
    }
    return cnhs;
  }, [cnhs, scope, selectedIds]);

  // Executa a análise inteligente em tempo real
  const analysis = useMemo(() => {
    return analyzeSmartRelocation(targetCNHs, allocationMode);
  }, [targetCNHs, allocationMode]);

  // Lista filtrada para a tabela de prévia
  const filteredPreviewItems = useMemo(() => {
    return analysis.items.filter((item) => {
      // Filtro de status (mudará vs já alinhado)
      if (previewFilter === "changes_only" && !item.needsChange) return false;
      if (previewFilter === "aligned_only" && item.needsChange) return false;

      // Filtro por letra inicial
      if (filterLetter !== "todas" && item.firstLetter !== filterLetter) return false;

      // Filtro por termo de busca
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase();
        const nomeMatch = item.cnh.nome.toLowerCase().includes(q);
        const cpfMatch = item.cnh.cpf ? item.cnh.cpf.replace(/\D/g, "").includes(q.replace(/\D/g, "")) : false;
        const ordemMatch = String(item.cnh.ordem).includes(q);
        if (!nomeMatch && !cpfMatch && !ordemMatch) return false;
      }

      return true;
    });
  }, [analysis.items, previewFilter, filterLetter, searchTerm]);

  // Confirmação e Realocação em Lote
  const handleExecuteRelocation = async () => {
    if (analysis.needsRelocationCount === 0 && analysis.items.length === 0) return;

    setIsProcessing(true);
    try {
      const nowIso = new Date().toISOString();
      const userNome = currentUser?.nome_curto || currentUser?.nome || currentUser?.login || "Operador";
      const userId = currentUser?.id || "sistema";

      // Mapeia todas as CNHs com os novos alvos
      const updatedList: GeralCNH[] = analysis.items.map((item) => ({
        ...item.cnh,
        gaveta: item.targetGaveta,
        reparticao: item.targetReparticao,
        data_movimento: nowIso,
        usuario_id: userId,
        usuario_nome: userNome,
        updated_at: nowIso,
      }));

      // 1. Salva no Dexie (IndexedDB) e sincroniza no Supabase se ativado
      await saveLocalGeralCNHsBulk(updatedList, !syncToSupabase || !isSupabaseReady);

      // 2. Atualiza a tabela global de mapeamento local com a nova matriz
      try {
        const mapeamentoAtual = getStoredList("mapeamento", SEED_MAPEAMENTO);
        const novosMapeamentos = [
          { id: "m-a", inicial: "A", gaveta: "Gaveta 1", reparticao: "Repartição 1", ativo: true },
          { id: "m-b", inicial: "B", gaveta: "Gaveta 1", reparticao: "Repartição 3", ativo: true },
          { id: "m-c", inicial: "C", gaveta: "Gaveta 1", reparticao: "Repartição 4", ativo: true },
          { id: "m-d", inicial: "D", gaveta: "Gaveta 1", reparticao: "Repartição 5", ativo: true },
          { id: "m-e", inicial: "E", gaveta: "Gaveta 1", reparticao: "Repartição 6", ativo: true },
          { id: "m-f", inicial: "F", gaveta: "Gaveta 1", reparticao: "Repartição 7", ativo: true },
          { id: "m-g", inicial: "G", gaveta: "Gaveta 1", reparticao: "Repartição 8", ativo: true },
          { id: "m-h", inicial: "H", gaveta: "Gaveta 2", reparticao: "Repartição 2", ativo: true },
          { id: "m-i", inicial: "I", gaveta: "Gaveta 2", reparticao: "Repartição 3", ativo: true },
          { id: "m-j", inicial: "J", gaveta: "Gaveta 2", reparticao: "Repartição 4", ativo: true },
          { id: "m-k", inicial: "K", gaveta: "Gaveta 2", reparticao: "Repartição 6", ativo: true },
          { id: "m-l", inicial: "L", gaveta: "Gaveta 2", reparticao: "Repartição 7", ativo: true },
          { id: "m-m", inicial: "M", gaveta: "Gaveta 2", reparticao: "Repartição 8", ativo: true },
          { id: "m-n", inicial: "N", gaveta: "Gaveta 3", reparticao: "Repartição 2", ativo: true },
          { id: "m-o", inicial: "O", gaveta: "Gaveta 3", reparticao: "Repartição 3", ativo: true },
          { id: "m-p", inicial: "P", gaveta: "Gaveta 3", reparticao: "Repartição 4", ativo: true },
          { id: "m-q", inicial: "Q", gaveta: "Gaveta 3", reparticao: "Repartição 4", ativo: true },
          { id: "m-r", inicial: "R", gaveta: "Gaveta 3", reparticao: "Repartição 5", ativo: true },
          { id: "m-s", inicial: "S", gaveta: "Gaveta 3", reparticao: "Repartição 7", ativo: true },
          { id: "m-t", inicial: "T", gaveta: "Gaveta 3", reparticao: "Repartição 8", ativo: true },
          { id: "m-u", inicial: "U", gaveta: "Gaveta 4", reparticao: "Repartição 1", ativo: true },
          { id: "m-v", inicial: "V", gaveta: "Gaveta 4", reparticao: "Repartição 2", ativo: true },
          { id: "m-w", inicial: "W", gaveta: "Gaveta 4", reparticao: "Repartição 4", ativo: true },
          { id: "m-x", inicial: "X", gaveta: "Gaveta 4", reparticao: "Repartição 3", ativo: true },
          { id: "m-y", inicial: "Y", gaveta: "Gaveta 4", reparticao: "Repartição 3", ativo: true },
          { id: "m-z", inicial: "Z", gaveta: "Gaveta 4", reparticao: "Repartição 5", ativo: true },
        ];
        saveStoredList("mapeamento", novosMapeamentos);
      } catch (err) {
        console.warn("Aviso ao sincronizar mapeamento padrão:", err);
      }

      // 3. Registra auditoria
      try {
        await logAuditoriaBulk(
          "geral",
          updatedList.map((c) => c.id),
          "Realocação Inteligente Nova Matriz",
          userId,
          userNome,
          `Realocadas ${updatedList.length} CNHs conforme matriz oficial de gavetas e repartições (Dual Repartição para A e M).`
        );
      } catch {}

      notifySyncUpdated("geral");

      onSuccess(
        analysis.needsRelocationCount,
        `🎉 ${analysis.needsRelocationCount} CNHs foram realocadas com sucesso para a nova matriz de gavetas e repartições!` +
          (syncToSupabase && isSupabaseReady ? " Sincronizado com a nuvem Supabase." : "")
      );

      onClose();
    } catch (err: any) {
      console.error("Erro na realocação inteligente:", err);
      alert(`Erro ao processar realocação: ${err.message || "Tente novamente."}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🎯 Checagem & Realocação Inteligente de Gaveta e Repartição"
      size="5xl"
    >
      <div className="space-y-4 text-xs">
        {/* CABEÇALHO EXPLICATIVO */}
        <div className="p-3.5 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-emerald-50/60 dark:from-slate-800 dark:via-slate-800 dark:to-slate-850 rounded-2xl border border-blue-200/80 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/30">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Nova Matriz Oficial de Mapeamento Físico
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Dual Repartição: A & M
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Distribui automaticamente as CNHs em 4 Gavetas e 8 Repartições. As iniciais <strong>A</strong> e <strong>M</strong> possuem duas repartições exclusivas devido ao grande volume de condutores.
              </p>
            </div>
          </div>

          {/* Seletores de Escopo e Balanceamento */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500">Escopo:</span>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as any)}
                  className="bg-transparent font-bold text-blue-600 dark:text-blue-400 outline-hidden cursor-pointer"
                >
                  <option value="all">Todas as CNHs ({cnhs.length})</option>
                  <option value="selected">Marcadas ({selectedIds.length})</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500">Divisão A & M:</span>
              <select
                value={allocationMode}
                onChange={(e) => setAllocationMode(e.target.value as any)}
                className="bg-transparent font-bold text-indigo-600 dark:text-indigo-400 outline-hidden cursor-pointer"
              >
                <option value="balanced">Balanceado 50% / 50%</option>
                <option value="subinitial">Corte Sub-inicial</option>
              </select>
            </div>
          </div>
        </div>

        {/* CARDS DE CONFERÊNCIA E DIAGNÓSTICO (KPIS) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Card 1: Total Analisado */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">CNHs no Escopo</span>
              <Layers className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xl font-black text-slate-800 dark:text-slate-100 font-mono">
              {analysis.total.toLocaleString("pt-BR")}
            </div>
            <span className="text-[10px] text-slate-500">
              {scope === "selected" ? "Linhas marcadas na tabela" : "Base total de CNHs"}
            </span>
          </div>

          {/* Card 2: Precisam de Realocação */}
          <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Precisam Realocação</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-black text-amber-700 dark:text-amber-300 font-mono">
              {analysis.needsRelocationCount.toLocaleString("pt-BR")}
            </div>
            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
              {analysis.total > 0
                ? `${Math.round((analysis.needsRelocationCount / analysis.total) * 100)}% das CNHs`
                : "0%"}
            </span>
          </div>

          {/* Card 3: Já Alinhadas */}
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Já Alinhadas</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono">
              {analysis.alreadyAlignedCount.toLocaleString("pt-BR")}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              Já estão no local correto
            </span>
          </div>

          {/* Card 4: Sem Alocação Prévia */}
          <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Sem Gaveta / Rep.</span>
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-black text-blue-700 dark:text-blue-300 font-mono">
              {analysis.missingLocationCount.toLocaleString("pt-BR")}
            </div>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
              Serão alocadas automaticamente
            </span>
          </div>
        </div>

        {/* NAVEGAÇÃO ENTRE ABAS */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "summary"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Resumo & Destaque A e M</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "matrix"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Matriz Oficial (4 Gavetas x 8 Repartições)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "preview"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Lista de Checagem CNH a CNH ({filteredPreviewItems.length})</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-500">
            {analysis.needsRelocationCount > 0 ? (
              <strong className="text-amber-600 dark:text-amber-400">
                {analysis.needsRelocationCount} alterações pendentes
              </strong>
            ) : (
              <strong className="text-emerald-600">Base 100% alinhada</strong>
            )}
          </span>
        </div>

        {/* ABA 1: RESUMO & DESTAQUE A E M */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            {/* CARDS ESPECIAIS DE REPARTIÇÃO DUPLA (A e M) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Card Destaque Letra A */}
              <div className="p-4 bg-gradient-to-br from-blue-50/90 to-indigo-50/60 dark:from-slate-800 dark:to-slate-850 rounded-2xl border border-blue-200 dark:border-blue-900/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                      A
                    </span>
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                        Letra A (Gaveta 1) - Repartições 1 e 2
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Dois compartimentos reservados para evitar sobrecarga
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    Total: {analysis.dualStats.A.slot1Count + analysis.dualStats.A.slot2Count} CNHs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      Gaveta 1 • Repartição 1
                    </span>
                    <div className="text-base font-black text-blue-700 dark:text-blue-300 font-mono">
                      {analysis.dualStats.A.slot1Count} CNHs
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {allocationMode === "balanced" ? "1ª Metade Alfabética" : "A até AL"}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      Gaveta 1 • Repartição 2
                    </span>
                    <div className="text-base font-black text-indigo-700 dark:text-indigo-300 font-mono">
                      {analysis.dualStats.A.slot2Count} CNHs
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {allocationMode === "balanced" ? "2ª Metade Alfabética" : "AM até AZ"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Destaque Letra M */}
              <div className="p-4 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 dark:from-slate-800 dark:to-slate-850 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                      M
                    </span>
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                        Letra M - Repartição 8 (G2) e Repartição 1 (G3)
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Dois compartimentos em gavetas distintas para máximo espaço
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Total: {analysis.dualStats.M.slot1Count + analysis.dualStats.M.slot2Count} CNHs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      Gaveta 2 • Repartição 8
                    </span>
                    <div className="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono">
                      {analysis.dualStats.M.slot1Count} CNHs
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {allocationMode === "balanced" ? "1ª Metade Alfabética" : "MA até MI"}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      Gaveta 3 • Repartição 1
                    </span>
                    <div className="text-base font-black text-teal-700 dark:text-teal-300 font-mono">
                      {analysis.dualStats.M.slot2Count} CNHs
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {allocationMode === "balanced" ? "2ª Metade Alfabética" : "MO até MZ"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Outras Letras com Repartição Dupla (G, J, R) */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                Outras Letras Otimizadas na Matriz (G, J e R):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div>
                    <span className="font-black text-slate-900 dark:text-white mr-1.5">Letra G:</span>
                    <span className="text-[10px] text-slate-500">G1 Rep 8 & G2 Rep 1</span>
                  </div>
                  <span className="font-mono font-bold text-blue-600">
                    {analysis.dualStats.G.slot1Count} / {analysis.dualStats.G.slot2Count}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div>
                    <span className="font-black text-slate-900 dark:text-white mr-1.5">Letra J:</span>
                    <span className="text-[10px] text-slate-500">G2 Rep 4 & G2 Rep 5</span>
                  </div>
                  <span className="font-mono font-bold text-blue-600">
                    {analysis.dualStats.J.slot1Count} / {analysis.dualStats.J.slot2Count}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div>
                    <span className="font-black text-slate-900 dark:text-white mr-1.5">Letra R:</span>
                    <span className="text-[10px] text-slate-500">G3 Rep 5 & G3 Rep 6</span>
                  </div>
                  <span className="font-mono font-bold text-blue-600">
                    {analysis.dualStats.R.slot1Count} / {analysis.dualStats.R.slot2Count}
                  </span>
                </div>
              </div>
            </div>

            {/* Totalizadores por Gaveta Físicas */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                Distribuição Resultante por Gaveta Física
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["Gaveta 1", "Gaveta 2", "Gaveta 3", "Gaveta 4"].map((gav, idx) => (
                  <div key={gav} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {gav}
                    </span>
                    <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
                      {(analysis.byGaveta[gav] || 0).toLocaleString("pt-BR")}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {idx === 0 ? "Letras A até G" : idx === 1 ? "Letras G até M" : idx === 2 ? "Letras M até T" : "Letras U até Z"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: MATRIZ OFICIAL VISUAL (TABELA REPLICA DA IMAGEM) */}
        {activeTab === "matrix" && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-900 dark:text-blue-200 text-[11px] flex items-center justify-between">
              <span>
                📋 Esta matriz física reflete fielmente a tabela afixada no arquivo do DETRAN.
              </span>
              <span className="font-bold text-blue-700 dark:text-blue-300">
                8 Repartições verticais • 4 Gavetas horizontais
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider">
                    <th className="py-3 px-4 w-32 border-r border-slate-200 dark:border-slate-700 text-left">
                      REPARTIÇÃO
                    </th>
                    <th className="py-3 px-4 border-r border-slate-200 dark:border-slate-700">
                      GAVETA 1
                    </th>
                    <th className="py-3 px-4 border-r border-slate-200 dark:border-slate-700">
                      GAVETA 2
                    </th>
                    <th className="py-3 px-4 border-r border-slate-200 dark:border-slate-700">
                      GAVETA 3
                    </th>
                    <th className="py-3 px-4">
                      GAVETA 4
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {MATRIZ_OFICIAL_ROWS.map((row) => (
                    <tr key={row.reparticao} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                      <td className="py-2.5 px-4 font-black text-sm text-left border-r border-slate-200 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-800/40">
                        {row.reparticao}
                      </td>

                      {/* Gaveta 1 */}
                      <td className="py-2.5 px-4 border-r border-slate-200 dark:border-slate-750">
                        <span className={`inline-flex items-center justify-center font-black text-sm px-3 py-1 rounded-xl shadow-2xs ${
                          row.gaveta1 === "A"
                            ? "bg-blue-100 text-blue-900 dark:bg-blue-900/80 dark:text-blue-100 border border-blue-300 ring-2 ring-blue-500/20"
                            : row.gaveta1 === "G"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/80 dark:text-amber-100"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                        }`}>
                          {row.gaveta1}
                        </span>
                      </td>

                      {/* Gaveta 2 */}
                      <td className="py-2.5 px-4 border-r border-slate-200 dark:border-slate-750">
                        <span className={`inline-flex items-center justify-center font-black text-sm px-3 py-1 rounded-xl shadow-2xs ${
                          row.gaveta2 === "M"
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/80 dark:text-emerald-100 border border-emerald-300 ring-2 ring-emerald-500/20"
                            : row.gaveta2 === "G"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/80 dark:text-amber-100"
                            : row.gaveta2 === "J"
                            ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/80 dark:text-indigo-100"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                        }`}>
                          {row.gaveta2}
                        </span>
                      </td>

                      {/* Gaveta 3 */}
                      <td className="py-2.5 px-4 border-r border-slate-200 dark:border-slate-750">
                        <span className={`inline-flex items-center justify-center font-black text-sm px-3 py-1 rounded-xl shadow-2xs ${
                          row.gaveta3 === "M"
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/80 dark:text-emerald-100 border border-emerald-300 ring-2 ring-emerald-500/20"
                            : row.gaveta3 === "R"
                            ? "bg-purple-100 text-purple-900 dark:bg-purple-900/80 dark:text-purple-100"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                        }`}>
                          {row.gaveta3}
                        </span>
                      </td>

                      {/* Gaveta 4 */}
                      <td className="py-2.5 px-4">
                        {row.gaveta4 !== "-" ? (
                          <span className="inline-flex items-center justify-center font-black text-sm px-3 py-1 rounded-xl bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 shadow-2xs">
                            {row.gaveta4}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 font-bold">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ABA 3: LISTA DE CHECAGEM CNH A CNH */}
        {activeTab === "preview" && (
          <div className="space-y-3">
            {/* Barra de Filtros Internos da Prévia */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Pesquisar titular, CPF ou ordem..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <select
                  value={filterLetter}
                  onChange={(e) => setFilterLetter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold outline-hidden cursor-pointer"
                >
                  <option value="todas">Todas as Letras</option>
                  {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => (
                    <option key={l} value={l}>
                      Letra {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro de Status */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPreviewFilter("changes_only")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === "changes_only"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  Apenas Alterações ({analysis.needsRelocationCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter("aligned_only")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === "aligned_only"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  Já Alinhadas ({analysis.alreadyAlignedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === "all"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  Todas ({analysis.total})
                </button>
              </div>
            </div>

            {/* Tabela de Amostra */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-[44vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-10 select-none">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-16"># Ordem</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Nome do Titular</th>
                    <th className="py-2.5 px-3 w-32">CPF</th>
                    <th className="py-2.5 px-3 text-center w-28">Situação</th>
                    <th className="py-2.5 px-3 text-center min-w-[140px]">Gaveta Atual</th>
                    <th className="py-2.5 px-3 text-center min-w-[150px]">Gaveta Nova</th>
                    <th className="py-2.5 px-3 text-center min-w-[140px]">Repartição Atual</th>
                    <th className="py-2.5 px-3 text-center min-w-[150px]">Repartição Nova</th>
                    <th className="py-2.5 px-3 text-center w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {filteredPreviewItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Nenhuma CNH encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredPreviewItems.slice(0, 150).map((item) => (
                      <tr
                        key={item.cnh.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors ${
                          item.needsChange ? "bg-amber-50/20 dark:bg-amber-950/10" : ""
                        }`}
                      >
                        <td className="py-2 px-3 text-center font-mono font-bold text-blue-600">
                          #{item.cnh.ordem}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-black flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0">
                              {item.firstLetter}
                            </span>
                            <span className="truncate">{item.cnh.nome}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {item.cnh.cpf ? formatCPF(item.cnh.cpf) : "-"}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Badge situacao={item.cnh.situacao} />
                        </td>

                        {/* Gaveta Atual */}
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">
                          {item.currentGaveta}
                        </td>

                        {/* Gaveta Nova */}
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-[11px] ${
                            item.currentGaveta !== item.targetGaveta
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 border border-blue-300 font-mono"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}>
                            <FolderArchive className="w-3 h-3 text-blue-500" />
                            {item.targetGaveta}
                          </span>
                        </td>

                        {/* Repartição Atual */}
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">
                          {item.currentReparticao}
                        </td>

                        {/* Repartição Nova */}
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-[11px] ${
                            item.currentReparticao !== item.targetReparticao
                              ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-100 border border-indigo-300 font-mono"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}>
                            <Building2 className="w-3 h-3 text-indigo-500" />
                            {item.targetReparticao}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-2 px-3 text-center">
                          {item.needsChange ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <ArrowRight className="w-2.5 h-2.5" />
                              Atualizar
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <Check className="w-2.5 h-2.5" />
                              Alinhado
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredPreviewItems.length > 150 && (
              <p className="text-[10px] text-slate-400 text-center">
                Mostrando os primeiros 150 registros filtrados para máxima performance da interface.
              </p>
            )}
          </div>
        )}

        {/* SINCRONIZAÇÃO EM NUVEM E EXECUÇÃO */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={syncToSupabase}
              onChange={(e) => setSyncToSupabase(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
            />
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>Sincronizar e salvar no Supabase em lote</span>
            <span className="text-[10px] text-slate-400 font-normal">
              ({isSupabaseReady ? "Conexão ativa" : "Apenas local"})
            </span>
          </label>

          <div className="text-[11px] text-slate-500">
            {analysis.needsRelocationCount > 0 ? (
              <span>
                <strong>{analysis.needsRelocationCount}</strong> CNHs serão atualizadas para Gavetas e Repartições oficiais.
              </span>
            ) : (
              <span className="text-emerald-600 font-bold">
                ✓ Todas as CNHs já estão posicionadas em conformidade com a nova matriz!
              </span>
            )}
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleExecuteRelocation}
            disabled={isProcessing || analysis.needsRelocationCount === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Realocando CNHs...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>
                  Confirmar e Realocar {analysis.needsRelocationCount.toLocaleString("pt-BR")} CNHs
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
