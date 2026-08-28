import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Search,
  RefreshCw,
  Copy,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Info,
  Check,
  Filter
} from "lucide-react";
import { GeralCNH, Usuario } from "../types";
import {
  scanForDuplicates,
  DuplicateGroup,
  DuplicateMatchType,
  DuplicateItem
} from "../services/duplicatesService";
import { deleteMultipleGeralCNHs, logAuditoria } from "../services/db";
import { formatCPF } from "../lib/utils";

interface DuplicatasModalProps {
  isOpen: boolean;
  onClose: () => void;
  geralList: GeralCNH[];
  currentUser: Usuario | null;
  onSuccess: (deletedCount: number, groupsFixedCount: number) => void;
}

export const DuplicatasModal: React.FC<DuplicatasModalProps> = ({
  isOpen,
  onClose,
  geralList,
  currentUser,
  onSuccess,
}) => {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [auditNote, setAuditNote] = useState("Limpeza e saneamento de registros duplicados");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Executa a varredura ao abrir a modal
  useEffect(() => {
    if (isOpen) {
      handleRunScan();
    }
  }, [isOpen, geralList]);

  const handleRunScan = () => {
    setIsScanning(true);
    setErrorMessage(null);
    try {
      const detected = scanForDuplicates(geralList);
      setGroups(detected);
      // Por padrão expande todos os grupos
      setExpandedGroupIds(new Set(detected.map((g) => g.groupId)));
    } catch (err: any) {
      console.error("Erro na varredura de duplicatas:", err);
      setErrorMessage("Erro ao processar a varredura de duplicatas.");
    } finally {
      setIsScanning(false);
    }
  };

  // Contadores globais
  const stats = useMemo(() => {
    let totalDuplicatedRecords = 0;
    let totalSelectedForDeletion = 0;
    let conflictGroupsCount = 0;
    let exactCpfGroups = 0;
    let exactNameGroups = 0;
    let similarNameGroups = 0;

    groups.forEach((g) => {
      totalDuplicatedRecords += g.items.length;
      totalSelectedForDeletion += g.items.filter((i) => i.selectedForDeletion).length;
      if (g.hasConflicts) conflictGroupsCount++;
      if (g.matchType === "exact_cpf" || g.matchType === "exact_both") exactCpfGroups++;
      else if (g.matchType === "exact_name") exactNameGroups++;
      else if (g.matchType === "similar_name") similarNameGroups++;
    });

    return {
      totalAnalyzed: geralList.length,
      totalGroups: groups.length,
      totalDuplicatedRecords,
      totalSelectedForDeletion,
      conflictGroupsCount,
      exactCpfGroups,
      exactNameGroups,
      similarNameGroups,
    };
  }, [groups, geralList.length]);

  // Grupos filtrados
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      // Filtro por tipo
      if (filterType === "exact_cpf" && g.matchType !== "exact_cpf" && g.matchType !== "exact_both") {
        return false;
      }
      if (filterType === "exact_name" && g.matchType !== "exact_name" && g.matchType !== "exact_both") {
        return false;
      }
      if (filterType === "similar_name" && g.matchType !== "similar_name") {
        return false;
      }
      if (filterType === "conflicts" && !g.hasConflicts) {
        return false;
      }

      // Filtro por termo de busca
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const matchesReason = g.matchReason.toLowerCase().includes(query);
        const matchesAnyItem = g.items.some((item) => {
          const nome = (item.nome || "").toLowerCase();
          const cpf = (item.cpf || "").toLowerCase();
          const ordem = item.ordem ? `#${item.ordem}` : "";
          const obs = (item.observacao || "").toLowerCase();
          const gaveta = (item.gaveta || "").toLowerCase();
          return (
            nome.includes(query) ||
            cpf.includes(query) ||
            ordem.includes(query) ||
            obs.includes(query) ||
            gaveta.includes(query)
          );
        });
        if (!matchesReason && !matchesAnyItem) return false;
      }

      return true;
    });
  }, [groups, filterType, searchTerm]);

  // Ações de seleção em lote
  const handleAutoSelectBest = () => {
    setGroups((prev) =>
      prev.map((g) => {
        const primary = g.primaryRecordId;
        return {
          ...g,
          items: g.items.map((i) => ({
            ...i,
            selectedForDeletion: i.id !== primary,
          })),
        };
      })
    );
  };

  const handleSelectAllExceeding = () => {
    setGroups((prev) =>
      prev.map((g) => {
        return {
          ...g,
          items: g.items.map((i, idx) => ({
            ...i,
            selectedForDeletion: idx > 0,
          })),
        };
      })
    );
  };

  const handleDeselectAll = () => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((i) => ({
          ...i,
          selectedForDeletion: false,
        })),
      }))
    );
  };

  // Alternar seleção de item individual
  const toggleItemDeletion = (groupId: string, itemId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.groupId !== groupId) return g;
        return {
          ...g,
          items: g.items.map((i) =>
            i.id === itemId ? { ...i, selectedForDeletion: !i.selectedForDeletion } : i
          ),
        };
      })
    );
  };

  // Definir explicitamente qual item MANTER no grupo
  const setPrimaryKeepItem = (groupId: string, keepItemId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.groupId !== groupId) return g;
        return {
          ...g,
          primaryRecordId: keepItemId,
          items: g.items.map((i) => ({
            ...i,
            isRecommendedKeep: i.id === keepItemId,
            selectedForDeletion: i.id !== keepItemId,
          })),
        };
      })
    );
  };

  // Expandir / Recolher todos
  const toggleAllExpanded = () => {
    if (expandedGroupIds.size === groups.length) {
      setExpandedGroupIds(new Set());
    } else {
      setExpandedGroupIds(new Set(groups.map((g) => g.groupId)));
    }
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Lista de itens marcados para exclusão
  const itemsToDelete = useMemo(() => {
    const list: { item: DuplicateItem; group: DuplicateGroup }[] = [];
    groups.forEach((g) => {
      g.items.forEach((i) => {
        if (i.selectedForDeletion) {
          list.push({ item: i, group: g });
        }
      });
    });
    return list;
  }, [groups]);

  // Executar exclusão em lote
  const handleExecuteBulkDelete = async () => {
    if (itemsToDelete.length === 0) return;

    setIsDeleting(true);
    setErrorMessage(null);

    const idsToDelete = itemsToDelete.map((x) => x.item.id);
    const userId = currentUser?.id || "sistema-duplicatas";
    const userNome = currentUser?.nome_curto || currentUser?.nome || "Agente DETRAN";

    try {
      // 1. Executa a exclusão de múltiplos registros com persistência e log de auditoria
      const deletedCount = await deleteMultipleGeralCNHs(idsToDelete, userId, userNome);

      // 2. Registra trilha de auditoria específica da varredura
      await logAuditoria(
        "geral",
        `Varredura de Duplicatas: Exclusão de ${deletedCount} registros`,
        "Exclusão",
        userId,
        userNome,
        {
          motivo: auditNote,
          registros_excluidos: itemsToDelete.map((x) => ({
            id: x.item.id,
            ordem: x.item.ordem,
            nome: x.item.nome,
            cpf: x.item.cpf,
            situacao: x.item.situacao,
            grupo_motivo: x.group.matchReason,
          })),
        },
        null
      );

      setShowConfirmModal(false);
      onSuccess(deletedCount, groups.length);
      onClose();
    } catch (err: any) {
      console.error("Erro ao excluir duplicatas em massa:", err);
      setErrorMessage(err.message || "Erro ao efetuar a exclusão dos registros selecionados.");
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-fadeIn">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 rounded-xl shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Varredura de Duplicatas & Auditoria de Exclusão
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 rounded-md border border-rose-300 dark:border-rose-800">
                  Correspondência Nome & CPF
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Localize registros redundantes cadastrados por erro ou importações duplicadas e realize a exclusão seletiva com auditoria.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center justify-between gap-2 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Conteúdo Principal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Painel de Métricas e Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Analisado</div>
              <div className="text-xl font-black text-slate-800 dark:text-slate-100">
                {stats.totalAnalyzed} <span className="text-xs font-normal text-slate-500">CNHs</span>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
              <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <span>Grupos de Duplicatas</span>
              </div>
              <div className="text-xl font-black text-amber-800 dark:text-amber-200">
                {stats.totalGroups} <span className="text-xs font-normal">({stats.totalDuplicatedRecords} registros)</span>
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-800">
              <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Marcados p/ Excluir</span>
              </div>
              <div className="text-xl font-black text-rose-800 dark:text-rose-200">
                {stats.totalSelectedForDeletion} <span className="text-xs font-normal">selecionados</span>
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/40 p-3 rounded-xl border border-purple-200 dark:border-purple-800">
              <div className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                ⚠️ Conflitos de Situação
              </div>
              <div className="text-xl font-black text-purple-800 dark:text-purple-200">
                {stats.conflictGroupsCount} <span className="text-xs font-normal">grupos</span>
              </div>
            </div>
          </div>

          {/* Barra de Filtros e Busca */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
            
            {/* Abas de Tipos de Duplicata */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterType === "all"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                Todos os Grupos ({stats.totalGroups})
              </button>

              <button
                type="button"
                onClick={() => setFilterType("exact_cpf")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterType === "exact_cpf"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100"
                }`}
              >
                Mesmo CPF ({stats.exactCpfGroups})
              </button>

              <button
                type="button"
                onClick={() => setFilterType("exact_name")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterType === "exact_name"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-100"
                }`}
              >
                Mesmo Nome ({stats.exactNameGroups})
              </button>

              <button
                type="button"
                onClick={() => setFilterType("similar_name")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterType === "similar_name"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100"
                }`}
              >
                Nomes Similares ({stats.similarNameGroups})
              </button>

              {stats.conflictGroupsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterType("conflicts")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    filterType === "conflicts"
                      ? "bg-purple-600 text-white"
                      : "bg-purple-50 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 hover:bg-purple-100"
                  }`}
                >
                  Com Conflito ({stats.conflictGroupsCount})
                </button>
              )}
            </div>

            {/* Campo de Busca */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar por nome, CPF ou ordem..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Barra de Ferramentas de Seleção em Lote */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Ações em Lote:
              </span>

              <button
                type="button"
                onClick={handleAutoSelectBest}
                title="Mantém o melhor registro de cada grupo (completude e situação) e marca os excedentes para exclusão"
                className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 hover:bg-amber-200 rounded-lg font-bold transition-colors cursor-pointer"
              >
                ⚡ Auto-Selecionar Duplicadas
              </button>

              <button
                type="button"
                onClick={handleSelectAllExceeding}
                className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 rounded-lg font-semibold transition-colors cursor-pointer"
              >
                Marcar Todos Excedentes
              </button>

              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                Desmarcar Todos
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleAllExpanded}
                className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {expandedGroupIds.size === groups.length ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Recolher Grupos</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Expandir Todos ({groups.length})</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRunScan}
                disabled={isScanning}
                title="Executar novamente a varredura"
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Lista de Grupos de Duplicatas */}
          {groups.length === 0 ? (
            <div className="p-12 text-center bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl">
              <div className="w-12 h-12 mx-auto bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                Nenhuma Duplicata Encontrada!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 max-w-md mx-auto mt-1">
                A base geral de CNHs está perfeitamente saneada. Todos os nomes e CPFs cadastrados são únicos e válidos.
              </p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
              Nenhum grupo de duplicatas corresponde aos filtros selecionados.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group, groupIndex) => {
                const isExpanded = expandedGroupIds.has(group.groupId);
                const selectedInGroupCount = group.items.filter((i) => i.selectedForDeletion).length;
                const keepingInGroupCount = group.items.length - selectedInGroupCount;

                return (
                  <div
                    key={group.groupId}
                    className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                      selectedInGroupCount > 0
                        ? "border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    }`}
                  >
                    {/* Cabeçalho do Grupo */}
                    <div
                      onClick={() => toggleGroupExpand(group.groupId)}
                      className="p-3.5 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                          Grupo #{groupIndex + 1}:
                        </span>

                        <span className="font-semibold text-xs text-slate-900 dark:text-white">
                          {group.matchReason}
                        </span>

                        {/* Tipo de Match */}
                        {group.matchType === "exact_both" && (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-md border border-emerald-300 dark:border-emerald-800">
                            CPF & Nome Idênticos
                          </span>
                        )}
                        {group.matchType === "exact_cpf" && (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 rounded-md border border-rose-300 dark:border-rose-800">
                            Mesmo CPF
                          </span>
                        )}
                        {group.matchType === "exact_name" && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded-md border border-blue-300 dark:border-blue-800">
                            Mesmo Nome
                          </span>
                        )}
                        {group.matchType === "similar_name" && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-md border border-amber-300 dark:border-amber-800">
                            Nomes Similares
                          </span>
                        )}

                        {group.hasConflicts && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 rounded-md border border-purple-300 dark:border-purple-800">
                            ⚠️ Situações Divergentes
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right text-[11px]">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {keepingInGroupCount} manter
                          </span>
                          {" • "}
                          <span className="font-bold text-rose-700 dark:text-rose-400">
                            {selectedInGroupCount} excluir
                          </span>
                        </div>

                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Itens do Grupo */}
                    {isExpanded && (
                      <div className="p-3.5 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800">
                        {group.items.map((item) => {
                          const isKeep = !item.selectedForDeletion;
                          const isBest = item.isRecommendedKeep;

                          return (
                            <div
                              key={item.id}
                              className={`pt-2.5 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl transition-colors ${
                                item.selectedForDeletion
                                  ? "bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40"
                                  : "bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-200/80 dark:border-emerald-900/40"
                              }`}
                            >
                              {/* Lado Esquerdo: Checkbox / Ação e Dados da CNH */}
                              <div className="flex items-start gap-3 flex-1">
                                <div className="pt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={item.selectedForDeletion}
                                    onChange={() => toggleItemDeletion(group.groupId, item.id)}
                                    title="Marcar para exclusão"
                                    className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                  />
                                </div>

                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-md">
                                      #{item.ordem}
                                    </span>

                                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                                      {item.nome}
                                    </span>

                                    {/* Situação */}
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        item.situacao === "Entregue"
                                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                          : item.situacao === "Recebida"
                                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                          : item.situacao === "Remetida"
                                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                      }`}
                                    >
                                      {item.situacao}
                                    </span>

                                    {/* Tag Manter / Excluir */}
                                    {item.selectedForDeletion ? (
                                      <span className="px-2 py-0.5 text-[10px] font-extrabold bg-rose-600 text-white rounded-md inline-flex items-center gap-1 shadow-xs">
                                        <Trash2 className="w-3 h-3" /> EXCLUIR
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-600 text-white rounded-md inline-flex items-center gap-1 shadow-xs">
                                        <Check className="w-3 h-3" /> MANTER
                                      </span>
                                    )}

                                    {isBest && (
                                      <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-md">
                                        ⭐ Sugerido Manter
                                      </span>
                                    )}
                                  </div>

                                  {/* Detalhes Complementares */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400 pt-0.5">
                                    <div>
                                      CPF: <strong className="text-slate-900 dark:text-slate-200">{item.cpf || "-"}</strong>
                                    </div>
                                    <div>
                                      Gaveta: <strong className="text-slate-900 dark:text-slate-200">{item.gaveta || "-"}</strong> {item.reparticao && `(${item.reparticao})`}
                                    </div>
                                    <div>
                                      Responsável: <strong className="text-slate-900 dark:text-slate-200">{item.responsavel_nome || "-"}</strong>
                                    </div>
                                  </div>

                                  {item.observacao && (
                                    <div className="text-[11px] text-slate-500 italic bg-white/60 dark:bg-slate-800/60 p-1.5 rounded-md">
                                      Obs: {item.observacao}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Lado Direito: Botão para Definir como Principal */}
                              <div className="flex md:flex-col items-center md:items-end justify-between gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => setPrimaryKeepItem(group.groupId, item.id)}
                                  className={`px-3 py-1.5 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                                    isKeep
                                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                      : "bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  }`}
                                >
                                  {isKeep ? "✔ Registro a Manter" : "Eleger p/ Manter"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Rodapé da Modal */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {stats.totalSelectedForDeletion > 0 ? (
              <span className="font-bold text-rose-700 dark:text-rose-400">
                {stats.totalSelectedForDeletion} registro(s) CNH selecionado(s) para exclusão definitiva.
              </span>
            ) : (
              <span>Nenhum registro selecionado para exclusão.</span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={isDeleting || stats.totalSelectedForDeletion === 0}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/25 transition-all cursor-pointer w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir Duplicatas Selecionadas ({stats.totalSelectedForDeletion})</span>
            </button>
          </div>
        </div>

      </div>

      {/* MODAL DE CONFIRMAÇÃO DE AUDITORIA ANTES DA EXCLUSÃO */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 bg-rose-100 dark:bg-rose-950 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirmar Exclusão em Lote de Duplicatas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Esta ação excluirá permanentemente os registros redundantes selecionados.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-rose-900 dark:text-rose-200">
                Resumo da Exclusão:
              </div>
              <ul className="list-disc list-inside space-y-1 text-rose-800 dark:text-rose-300">
                <li>
                  Total de registros CNH a serem excluídos: <strong>{itemsToDelete.length}</strong>
                </li>
                <li>
                  Registros que permanecerão intactos: <strong>{stats.totalDuplicatedRecords - itemsToDelete.length}</strong>
                </li>
                <li>
                  A operação será gravada na trilha de auditoria sob o usuário <strong>{currentUser?.nome_curto || currentUser?.nome || "Agente"}</strong>.
                </li>
              </ul>
            </div>

            {/* Justificativa da Auditoria */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Justificativa / Motivo da Exclusão (Auditoria):
              </label>
              <input
                type="text"
                value={auditNote}
                onChange={(e) => setAuditNote(e.target.value)}
                placeholder="Informe o motivo para registro no log..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs p-2.5 text-slate-900 dark:text-white"
              />
            </div>

            {/* Ações de Confirmação */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Voltar e Revisar
              </button>

              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                disabled={isDeleting || itemsToDelete.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/25 transition-all cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Excluindo Registros...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar Exclusão Definitiva</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
