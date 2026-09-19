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
  Info,
  Check,
  Filter,
  User,
  FileText,
  Hash,
  Send,
  Loader2,
  Phone,
  Clock,
  ArrowRightLeft
} from "lucide-react";
import { CandidatoEnriquecido } from "../pages/CandidatosPage";
import { Usuario } from "../types";
import {
  scanCandidatosDuplicates,
  CandidateDuplicateGroup,
  CandidateDuplicateItem,
  CandidateDuplicateType
} from "../services/candidatosDuplicatesService";
import { excluirCandidatosDuplicadosEmLote } from "../services/db";
import { formatCPF, formatPhone, formatDate, formatDateTime } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

interface AuditoriaDuplicatasCandidatosModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidatosEnriquecidos: CandidatoEnriquecido[];
  user?: Usuario | null;
  canEdit?: boolean;
  onSuccess: (deletedCount: number, groupsFixedCount: number) => void;
}

export const AuditoriaDuplicatasCandidatosModal: React.FC<
  AuditoriaDuplicatasCandidatosModalProps
> = ({
  isOpen,
  onClose,
  candidatosEnriquecidos,
  user,
  canEdit,
  onSuccess,
}) => {
  const auth = useAuth();
  const activeUser = user !== undefined ? user : auth.user;
  const isConsultaOnly = activeUser?.perfil === "Consulta";
  const userCanEdit = canEdit !== undefined ? canEdit : !isConsultaOnly;

  const [groups, setGroups] = useState<CandidateDuplicateGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [auditNote, setAuditNote] = useState("Saneamento de candidatos duplicados");
  const [permitirRemetidos, setPermitirRemetidos] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Executa varredura ao abrir a modal
  useEffect(() => {
    if (isOpen) {
      handleRunScan();
    }
  }, [isOpen]);

  const handleRunScan = () => {
    setIsScanning(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTimeout(() => {
      try {
        const detected = scanCandidatosDuplicates(candidatosEnriquecidos);
        setGroups(detected);
        // Expandir por padrão os primeiros 15 grupos
        setExpandedGroupIds(new Set(detected.slice(0, 15).map((g) => g.groupId)));
      } catch (err: any) {
        console.error("Erro na varredura de duplicatas de candidatos:", err);
        setErrorMessage("Erro ao processar a varredura de duplicatas.");
      } finally {
        setIsScanning(false);
      }
    }, 60);
  };

  // Métricas e estatísticas globais
  const stats = useMemo(() => {
    let totalDuplicatedRecords = 0;
    let totalSelectedForDeletion = 0;
    let mesmoMemorandoGroups = 0;
    let memorandosDiferentesGroups = 0;
    let exactCpfCount = 0;
    let exactPaCount = 0;
    let exactNameCount = 0;

    groups.forEach((g) => {
      totalDuplicatedRecords += g.items.length;
      totalSelectedForDeletion += g.items.filter((i) => i.selectedForDeletion).length;
      if (g.duplicateScope === "mesmo_memorando") mesmoMemorandoGroups++;
      else memorandosDiferentesGroups++;

      if (g.matchType === "exact_cpf" || g.matchType === "exact_cpf_name") exactCpfCount++;
      else if (g.matchType === "exact_pa") exactPaCount++;
      else exactNameCount++;
    });

    return {
      totalAnalyzed: candidatosEnriquecidos.length,
      totalGroups: groups.length,
      totalDuplicatedRecords,
      totalSelectedForDeletion,
      mesmoMemorandoGroups,
      memorandosDiferentesGroups,
      exactCpfCount,
      exactPaCount,
      exactNameCount,
    };
  }, [groups, candidatosEnriquecidos]);

  // Alternar checkbox de exclusão de um candidato específico
  const toggleCandidateSelection = (groupId: string, candidateId: string) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.groupId !== groupId) return group;

        const updatedItems = group.items.map((item) => {
          if (item.id === candidateId) {
            return { ...item, selectedForDeletion: !item.selectedForDeletion };
          }
          return item;
        });

        return { ...group, items: updatedItems };
      })
    );
  };

  // Definir um candidato como o principal a ser MANTIDO no grupo
  const setAsPrimaryCandidate = (groupId: string, candidateId: string) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.groupId !== groupId) return group;

        const updatedItems = group.items.map((item) => {
          const isTarget = item.id === candidateId;
          return {
            ...item,
            isRecommendedKeep: isTarget,
            selectedForDeletion: !isTarget,
          };
        });

        return {
          ...group,
          primaryRecordId: candidateId,
          items: updatedItems,
        };
      })
    );
  };

  // Ações em massa de seleção
  const handleSelectAllRecommended = () => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((item) => ({
          ...item,
          selectedForDeletion: !item.isRecommendedKeep,
        })),
      }))
    );
  };

  const handleUnselectAll = () => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((item) => ({
          ...item,
          selectedForDeletion: false,
        })),
      }))
    );
  };

  const handleToggleExpandAll = () => {
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

  // Filtragem dos grupos de duplicatas
  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      // Filtro por tipo ou escopo
      if (filterType === "mesmo_memorando" && group.duplicateScope !== "mesmo_memorando") return false;
      if (filterType === "memorandos_diferentes" && group.duplicateScope !== "memorandos_diferentes") return false;
      if (filterType === "exact_cpf" && group.matchType !== "exact_cpf" && group.matchType !== "exact_cpf_name") return false;
      if (filterType === "exact_pa" && group.matchType !== "exact_pa") return false;
      if (filterType === "exact_name" && group.matchType !== "exact_name" && group.matchType !== "similar_name") return false;

      // Filtro por termo de busca
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesGroup =
          group.matchReason.toLowerCase().includes(query) ||
          group.items.some(
            (item) =>
              item.nome.toLowerCase().includes(query) ||
              (item.cpf && item.cpf.includes(query)) ||
              (item.pa && item.pa.includes(query)) ||
              (item.memorando_numero && item.memorando_numero.toLowerCase().includes(query))
          );
        if (!matchesGroup) return false;
      }

      return true;
    });
  }, [groups, filterType, searchTerm]);

  // Lista dos IDs atualmente marcados para exclusão
  const candidateIdsToDelete = useMemo(() => {
    const ids: string[] = [];
    groups.forEach((g) => {
      g.items.forEach((item) => {
        if (item.selectedForDeletion) {
          ids.push(item.id);
        }
      });
    });
    return ids;
  }, [groups]);

  // Checar se há candidatos em memorandos já remetidos selecionados para exclusão
  const candsInRemetidosToDelete = useMemo(() => {
    const list: CandidateDuplicateItem[] = [];
    groups.forEach((g) => {
      g.items.forEach((item) => {
        if (item.selectedForDeletion && item.memorando_status === "Remetido") {
          list.push(item);
        }
      });
    });
    return list;
  }, [groups]);

  // Executar a exclusão das duplicatas selecionadas
  const handleExecuteDeletion = async () => {
    if (candidateIdsToDelete.length === 0 || !userCanEdit) return;

    // Se houver registros em memorandos remetidos e o usuário não autorizou expressamente
    if (candsInRemetidosToDelete.length > 0 && !permitirRemetidos) {
      setErrorMessage(
        `Atenção: ${candsInRemetidosToDelete.length} candidato(s) selecionado(s) pertence(m) a memorando(s) já remetido(s). Marque a opção de autorização de auditoria para prosseguir.`
      );
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const userId = activeUser?.id || "sistema-duplicatas";
      const userNome = activeUser ? activeUser.nome_curto || activeUser.nome : "Agente DETRAN";

      const res = await excluirCandidatosDuplicadosEmLote(
        candidateIdsToDelete,
        userId,
        userNome,
        {
          motivo: auditNote,
          permitirEmMemorandoRemetido: permitirRemetidos,
        }
      );

      setSuccessMessage(
        `Sucesso! ${res.count} registro(s) duplicado(s) excluído(s) e ${res.memorandosAtualizados} memorando(s) atualizado(s).`
      );
      setShowConfirmModal(false);

      // Notificar componente pai
      onSuccess(res.count, groups.length);

      // Re-executar varredura atualizada após breve pausa
      setTimeout(() => {
        handleRunScan();
      }, 350);
    } catch (err: any) {
      console.error("Erro ao excluir duplicatas de candidatos:", err);
      setErrorMessage(err?.message || "Erro ao excluir registros duplicados.");
    } finally {
      setIsDeleting(false);
    }
  };

  const getMatchTypeBadge = (type: CandidateDuplicateType) => {
    switch (type) {
      case "exact_cpf":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Mesmo CPF
          </span>
        );
      case "exact_pa":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Mesmo Processo (PA)
          </span>
        );
      case "exact_cpf_name":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Mesmo CPF e Nome
          </span>
        );
      case "exact_name":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Mesmo Nome Completo
          </span>
        );
      case "similar_name":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            Alta Similaridade Fonética
          </span>
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Cabeçalho da Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Auditoria e Varredura de Duplicatas
                </h3>
                {stats.totalGroups > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    {stats.totalGroups} grupo{stats.totalGroups > 1 ? "s" : ""} ({stats.totalDuplicatedRecords} cadastros)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Checagem automática de candidatos redundantes por CPF, Processo (PA) ou Nome
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunScan}
              disabled={isScanning}
              title="Recalcular varredura de duplicatas"
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin text-blue-600" : ""}`} />
            </button>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mensagens de Sucesso ou Erro */}
        {successMessage && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-2 text-emerald-800 dark:text-emerald-200 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between gap-2 text-rose-800 dark:text-rose-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Painel de Métricas e Diagnóstico */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/40 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              Total Analisado
            </div>
            <div className="text-xl font-bold text-slate-800 dark:text-white mt-1">
              {stats.totalAnalyzed}
            </div>
            <div className="text-[11px] text-slate-400">Candidatos na base</div>
          </div>

          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
            <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 tracking-wider">
              Grupos Duplicados
            </div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1">
              {stats.totalGroups}
            </div>
            <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80">
              {stats.totalDuplicatedRecords} cadastros envolvidos
            </div>
          </div>

          <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800">
            <div className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400 tracking-wider">
              Duplicatas Selecionadas
            </div>
            <div className="text-xl font-bold text-rose-700 dark:text-rose-300 mt-1">
              {stats.totalSelectedForDeletion}
            </div>
            <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80">
              Prontas para expurgo
            </div>
          </div>

          <div className="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800">
            <div className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-400 tracking-wider">
              No Mesmo Memorando
            </div>
            <div className="text-xl font-bold text-purple-700 dark:text-purple-300 mt-1">
              {stats.mesmoMemorandoGroups}
            </div>
            <div className="text-[11px] text-purple-600/80 dark:text-purple-400/80">
              {stats.memorandosDiferentesGroups} entre memorandos
            </div>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF, PA ou memorando..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <button
                onClick={() => setFilterType("all")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  filterType === "all"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Todos ({groups.length})
              </button>
              <button
                onClick={() => setFilterType("mesmo_memorando")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  filterType === "mesmo_memorando"
                    ? "bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                No Mesmo Memo ({stats.mesmoMemorandoGroups})
              </button>
              <button
                onClick={() => setFilterType("memorandos_diferentes")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  filterType === "memorandos_diferentes"
                    ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Entre Memos ({stats.memorandosDiferentesGroups})
              </button>
              <button
                onClick={() => setFilterType("exact_cpf")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  filterType === "exact_cpf"
                    ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Mesmo CPF ({stats.exactCpfCount})
              </button>
            </div>

            <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
              <button
                onClick={handleSelectAllRecommended}
                className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                title="Selecionar automaticamente todas as duplicatas recomendadas para exclusão"
              >
                Selecionar Sugeridos
              </button>
              <button
                onClick={handleUnselectAll}
                className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                Desmarcar Todos
              </button>
              <button
                onClick={handleToggleExpandAll}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg transition-colors cursor-pointer"
                title={expandedGroupIds.size === groups.length ? "Recolher todos" : "Expandir todos"}
              >
                {expandedGroupIds.size === groups.length ? "Recolher" : "Expandir"}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Grupos de Duplicatas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/40 dark:bg-slate-950/20">
          {isScanning ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-semibold">Executando varredura por duplicatas em candidatos...</p>
              <p className="text-xs text-slate-400">Indexando CPFs, Processos e similaridades fonéticas de nomes</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-800 dark:text-white">
                {groups.length === 0
                  ? "Nenhuma duplicata encontrada na tabela de candidatos!"
                  : "Nenhum grupo corresponde ao filtro aplicado."}
              </h4>
              <p className="text-xs text-slate-500 max-w-md">
                {groups.length === 0
                  ? "A base de candidatos está saneada. Não foram detectados registros repetidos de CPF, Processo (PA) ou Nome."
                  : "Tente alterar os termos de busca ou o seletor de tipo de duplicata."}
              </p>
            </div>
          ) : (
            filteredGroups.map((group, groupIdx) => {
              const isExpanded = expandedGroupIds.has(group.groupId);
              const selectedInGroup = group.items.filter((i) => i.selectedForDeletion).length;

              return (
                <div
                  key={group.groupId}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-all"
                >
                  {/* Cabeçalho do Grupo */}
                  <div
                    onClick={() => toggleGroupExpand(group.groupId)}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/70 select-none"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-xs flex items-center justify-center shrink-0">
                        {groupIdx + 1}
                      </span>
                      {getMatchTypeBadge(group.matchType)}

                      {group.duplicateScope === "mesmo_memorando" ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          Duplicado no Mesmo Memorando
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          Entre Memorandos Distintos
                        </span>
                      )}

                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {group.matchReason}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {selectedInGroup} de {group.items.length - 1} duplicata(s) marcada(s)
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Detalhes e Itens do Grupo */}
                  {isExpanded && (
                    <div className="p-3 sm:p-4 divide-y divide-slate-100 dark:divide-slate-800 space-y-3 sm:space-y-0">
                      {group.items.map((item) => {
                        const isKeep = item.isRecommendedKeep;
                        const isSelected = item.selectedForDeletion;

                        return (
                          <div
                            key={item.id}
                            className={`pt-3 first:pt-0 sm:p-3 rounded-xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isKeep
                                ? "bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 my-1"
                                : isSelected
                                ? "bg-rose-50/30 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/40 my-1"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                            }`}
                          >
                            {/* Checkbox e Dados do Candidato */}
                            <div className="flex items-start gap-3">
                              <div className="pt-0.5">
                                <input
                                  type="checkbox"
                                  id={`cand-dup-${item.id}`}
                                  checked={isSelected}
                                  onChange={() => toggleCandidateSelection(group.groupId, item.id)}
                                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                                />
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    {item.nome}
                                  </span>

                                  {isKeep ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-600 text-white flex items-center gap-1">
                                      <Check className="w-3 h-3" />
                                      RECOMENDADO MANTER
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                      SUGERIDO EXCLUSÃO
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
                                  <span>
                                    <strong className="text-slate-500">CPF:</strong> {formatCPF(item.cpf)}
                                  </span>
                                  <span>
                                    <strong className="text-slate-500">PA:</strong> {item.pa || "N/A"}
                                  </span>
                                  {item.telefone && (
                                    <span>
                                      <strong className="text-slate-500">Tel:</strong> {formatPhone(item.telefone)}
                                    </span>
                                  )}
                                  <span>
                                    <strong className="text-slate-500">Cadastro:</strong>{" "}
                                    {item.created_at ? formatDate(item.created_at) : "N/D"}
                                  </span>
                                </div>

                                {/* Origem do Memorando e Status CNH */}
                                <div className="flex items-center gap-2 text-[11px] pt-1 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-md font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                                    <FileText className="w-3 h-3" />
                                    Memo: {item.memorando_numero} ({item.memorando_status})
                                  </span>

                                  {item.cnh_id ? (
                                    <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                      CNH #{item.cnh_ordem} no Geral ({item.cnh_situacao || "Registrada"})
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                      Sem CNH no Geral
                                    </span>
                                  )}

                                  <span className="text-[10px] text-slate-400" title={item.scoreReasons.join(" | ")}>
                                    Score: {item.score} pts
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Ações individuais do item */}
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-7 sm:pl-0">
                              {!isKeep && (
                                <button
                                  type="button"
                                  onClick={() => setAsPrimaryCandidate(group.groupId, item.id)}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer flex items-center gap-1"
                                  title="Definir este candidato como o registro principal a ser preservado"
                                >
                                  <ArrowRightLeft className="w-3 h-3" />
                                  <span>Manter Este</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé da Modal com Ação de Exclusão */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer text-xs"
          >
            Fechar
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-500 font-medium">
              {candidateIdsToDelete.length} duplicata(s) marcada(s) para expurgo
            </span>

            <button
              id="btn-confirmar-exclusao-duplicatas-candidatos"
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={isDeleting || candidateIdsToDelete.length === 0 || !userCanEdit}
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 font-bold rounded-xl text-xs transition-all ${
                isDeleting || candidateIdsToDelete.length === 0 || !userCanEdit
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed shadow-none"
                  : "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 cursor-pointer"
              }`}
              title={
                !userCanEdit
                  ? "Seu perfil não possui permissão de exclusão"
                  : candidateIdsToDelete.length === 0
                  ? "Nenhum candidato selecionado para exclusão"
                  : `Excluir ${candidateIdsToDelete.length} candidato(s) duplicado(s)`
              }
            >
              <Trash2 className="w-4 h-4" />
              <span>
                Excluir {candidateIdsToDelete.length} Duplicata(s) Selecionada(s)
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Submodal de Confirmação de Segurança */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  Confirmar Saneamento de Duplicatas
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Você está prestes a excluir permanentemente{" "}
                  <strong className="text-rose-600">{candidateIdsToDelete.length} candidato(s)</strong> duplicado(s).
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2 text-slate-600 dark:text-slate-300">
              <p>
                ✓ Os candidatos mantidos continuarão vinculados normalmente aos seus respectivos memorandos e registros gerais.
              </p>
              <p>
                ✓ O contador de candidatos dos memorandos afetados será recalculado automaticamente.
              </p>
              <p>
                ✓ Esta ação será registrada no histórico de Auditoria do sistema.
              </p>
            </div>

            {candsInRemetidosToDelete.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-2">
                <p className="font-bold">
                  ⚠️ {candsInRemetidosToDelete.length} candidato(s) pertence(m) a memorando(s) já remetido(s).
                </p>
                <label className="flex items-center gap-2 cursor-pointer pt-1 font-semibold">
                  <input
                    type="checkbox"
                    checked={permitirRemetidos}
                    onChange={(e) => setPermitirRemetidos(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 border-amber-300"
                  />
                  <span>Autorizo o saneamento mesmo em memorandos remetidos</span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Justificativa da Auditoria:
              </label>
              <input
                type="text"
                value={auditNote}
                onChange={(e) => setAuditNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                placeholder="Ex: Remoção de cadastro duplicado no Memorando 2026/156"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteDeletion}
                disabled={isDeleting || (candsInRemetidosToDelete.length > 0 && !permitirRemetidos)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white shadow-md shadow-rose-600/20 cursor-pointer disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
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
