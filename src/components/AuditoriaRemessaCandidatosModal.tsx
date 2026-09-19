import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Search,
  Send,
  Loader2,
  X,
  FileText,
  Hash,
  User,
  Clock,
  Check,
  FolderArchive,
  RefreshCw,
  Info
} from "lucide-react";
import { CandidatoEnriquecido } from "../pages/CandidatosPage";
import { formatCPF, formatDateTime, formatDate, normalizeSearch } from "../lib/utils";
import { remeterCandidatosFaltantesAoGeral } from "../services/db";
import { Usuario } from "../types";
import { useAuth } from "../context/AuthContext";

interface AuditoriaRemessaCandidatosModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidatosEnriquecidos: CandidatoEnriquecido[];
  user?: Usuario | null;
  canEdit?: boolean;
  onSuccess: (remetidosCount: number) => void;
}

export const AuditoriaRemessaCandidatosModal: React.FC<AuditoriaRemessaCandidatosModalProps> = ({
  isOpen,
  onClose,
  candidatosEnriquecidos,
  user,
  canEdit,
  onSuccess,
}) => {
  const auth = useAuth();
  const activeUser = user !== undefined ? user : auth.user;
  // Apenas bloqueia se o perfil for explicitamente "Consulta"
  const isConsultaOnly = activeUser?.perfil === "Consulta";
  const userCanEdit = canEdit !== undefined ? canEdit : !isConsultaOnly;

  // Filtro de busca interno na modal
  const [internalSearch, setInternalSearch] = useState("");
  // Opção para alocação automática por inicial
  const [alocarPorInicial, setAlocarPorInicial] = useState(false);
  // Estado de processamento
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // 1. Diagnóstico Geral de Auditoria
  const diagnostico = useMemo(() => {
    const totalCandidatos = candidatosEnriquecidos.length;
    // Candidatos pertencentes a memorandos já com status Remetido
    const remetidos = candidatosEnriquecidos.filter(
      (c) => c.memorando_status === "Remetido"
    );
    // Destes, os que JÁ constam na Tabela Geral (possuem cnh_id)
    const conformes = remetidos.filter((c) => Boolean(c.cnh_id));
    // Destes, os que NÃO constam na Tabela Geral (ausentes/pendentes de inserção)
    const ausentes = remetidos.filter((c) => !c.cnh_id);

    return {
      totalCandidatos,
      totalRemetidos: remetidos.length,
      totalConformes: conformes.length,
      totalAusentes: ausentes.length,
      ausentesList: ausentes,
    };
  }, [candidatosEnriquecidos]);

  // IDs dos selecionados para remessa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(diagnostico.ausentesList.map((c) => c.id));
  });

  // Atualizar seleção caso mude a lista de ausentes
  React.useEffect(() => {
    setSelectedIds(new Set(diagnostico.ausentesList.map((c) => c.id)));
    setMensagemSucesso(null);
    setErroMsg(null);
    setInternalSearch("");
  }, [diagnostico.ausentesList, isOpen]);

  // 2. Filtro dos ausentes de acordo com a busca interna
  const ausentesFiltrados = useMemo(() => {
    const q = normalizeSearch(internalSearch);
    if (!q) return diagnostico.ausentesList;

    return diagnostico.ausentesList.filter((c) => {
      const matchNome = normalizeSearch(c.nome).includes(q);
      const matchCpf = (c.cpf || "").replace(/\D/g, "").includes(q);
      const matchPa = normalizeSearch(c.pa || "").includes(q);
      const matchMemo = normalizeSearch(c.memorando_numero || "").includes(q);
      const matchRemessa = normalizeSearch(c.memorando_remessa || "").includes(q);
      return matchNome || matchCpf || matchPa || matchMemo || matchRemessa;
    });
  }, [diagnostico.ausentesList, internalSearch]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === ausentesFiltrados.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ausentesFiltrados.map((c) => c.id)));
    }
  };

  // 3. Executar Remessa em Lote dos Selecionados para a Tabela Geral
  const handleExecutarRemessa = async () => {
    if (!userCanEdit || selectedIds.size === 0) return;

    const candidatosParaEnviar = diagnostico.ausentesList.filter((c) =>
      selectedIds.has(c.id)
    );

    if (candidatosParaEnviar.length === 0) return;

    setIsSubmitting(true);
    setErroMsg(null);

    try {
      const userId = activeUser ? activeUser.id : "sistema";
      const userNome = activeUser ? (activeUser.nome_curto || activeUser.nome) : "Agente DETRAN";

      const res = await remeterCandidatosFaltantesAoGeral(
        candidatosParaEnviar,
        userId,
        userNome,
        { alocarGavetaPorInicial: alocarPorInicial }
      );

      setMensagemSucesso(
        `Sucesso! ${res.remetidosCount} CNH(s) remetida(s) com sucesso para a Tabela Geral com situação "Remetida".`
      );

      onSuccess(res.remetidosCount);

      // Limpar seleção
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error("Erro ao remeter candidatos faltantes:", err);
      setErroMsg(err?.message || "Ocorreu um erro ao remeter as CNHs para a Tabela Geral.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="modal-auditoria-remessa-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="modal-auditoria-remessa-content"
        className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Auditoria de CNHs Remetidas
                {diagnostico.totalAusentes > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold border border-amber-300 dark:border-amber-700">
                    {diagnostico.totalAusentes} pendentes
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-300 dark:border-emerald-700">
                    100% Conforme
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Checagem de candidatos em memorandos remetidos que ainda não constam na Tabela Geral de CNHs
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs">
          {/* Feedback de Sucesso ou Erro */}
          {mensagemSucesso && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-xs">{mensagemSucesso}</span>
            </div>
          )}

          {erroMsg && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-200 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="font-semibold text-xs">{erroMsg}</span>
            </div>
          )}

          {/* Cards de Métricas da Auditoria */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Total de Candidatos
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {diagnostico.totalCandidatos}
              </div>
              <span className="text-[10px] text-slate-500">Base cadastral completa</span>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Em Memos Remetidos
              </span>
              <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                {diagnostico.totalRemetidos}
              </div>
              <span className="text-[10px] text-slate-500">Memorandos despachados</span>
            </div>

            <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
                Conformes no Geral
              </span>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5" />
                {diagnostico.totalConformes}
              </div>
              <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/70">
                Possuem CNH registrada
              </span>
            </div>

            <div
              className={`p-3.5 rounded-2xl border ${
                diagnostico.totalAusentes > 0
                  ? "border-amber-300 dark:border-amber-700/80 bg-amber-50/60 dark:bg-amber-950/30"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${
                  diagnostico.totalAusentes > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-slate-400"
                }`}
              >
                Ausentes no Geral
              </span>
              <div
                className={`text-xl font-black flex items-center gap-1.5 ${
                  diagnostico.totalAusentes > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-slate-800 dark:text-slate-200"
                }`}
              >
                {diagnostico.totalAusentes > 0 && <AlertTriangle className="w-5 h-5" />}
                {diagnostico.totalAusentes}
              </div>
              <span
                className={`text-[10px] ${
                  diagnostico.totalAusentes > 0
                    ? "text-amber-700 dark:text-amber-300 font-semibold"
                    : "text-slate-500"
                }`}
              >
                {diagnostico.totalAusentes > 0 ? "Precisam ser remetidos" : "Nenhuma pendência"}
              </span>
            </div>
          </div>

          {/* Cenário 1: Tudo 100% Conforme */}
          {diagnostico.totalAusentes === 0 && (
            <div className="py-8 px-4 flex flex-col items-center justify-center text-center bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-3xl">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Conformidade Total de Remessas!
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mt-1 leading-relaxed">
                Todos os <strong>{diagnostico.totalRemetidos} candidatos</strong> vinculados a memorandos remetidos já
                possuem registros correspondentes ativos na Tabela Geral de CNHs. O protocolo está perfeitamente sincronizado.
              </p>
            </div>
          )}

          {/* Cenário 2: Existem Candidatos Remetidos Ausentes na Tabela Geral */}
          {diagnostico.totalAusentes > 0 && (
            <div className="space-y-4">
              {/* Alerta de Auditoria */}
              <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-xs block">
                      {diagnostico.totalAusentes} CNH(s) identificada(s) fora da Tabela Geral
                    </span>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-tight">
                      Estes candidatos foram despachados em memorandos remetidos, porém suas CNHs não constam no
                      protocolo geral. Você pode selecionar os registros abaixo e remeter todos de uma vez.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-amber-300 dark:border-amber-700/80 text-[11px] font-semibold text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-amber-50/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={alocarPorInicial}
                      onChange={(e) => setAlocarPorInicial(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Alocar gaveta/repartição por inicial</span>
                  </label>
                </div>
              </div>

              {/* Barra de Filtro e Seleção da Tabela */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={internalSearch}
                    onChange={(e) => setInternalSearch(e.target.value)}
                    placeholder="Filtrar por nome, CPF, processo ou memorando..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {internalSearch && (
                    <button
                      onClick={() => setInternalSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-[11px] transition-colors cursor-pointer"
                  >
                    {selectedIds.size === ausentesFiltrados.length ? "Desmarcar Todos" : "Selecionar Todos"}
                  </button>
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 px-2 py-1 bg-blue-50 dark:bg-blue-950/60 rounded-lg border border-blue-200 dark:border-blue-800">
                    {selectedIds.size} de {diagnostico.totalAusentes} selecionados
                  </span>
                </div>
              </div>

              {/* Tabela de Candidatos Pendentes de Remessa */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="max-h-72 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 z-10 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              ausentesFiltrados.length > 0 &&
                              selectedIds.size === ausentesFiltrados.length
                            }
                            onChange={handleSelectAll}
                            className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-3">Candidato</th>
                        <th className="py-2.5 px-3">CPF</th>
                        <th className="py-2.5 px-3">Processo (PA)</th>
                        <th className="py-2.5 px-3">Memorando / Remessa</th>
                        <th className="py-2.5 px-3">Data Remessa</th>
                        <th className="py-2.5 px-3 text-right">Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {ausentesFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            Nenhum candidato localizado com o termo de busca pesquisado.
                          </td>
                        </tr>
                      ) : (
                        ausentesFiltrados.map((c) => {
                          const isSelected = selectedIds.has(c.id);
                          return (
                            <tr
                              key={c.id}
                              onClick={() => handleToggleSelect(c.id)}
                              className={`transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelect(c.id)}
                                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <span className="truncate max-w-[200px]" title={c.nome}>
                                    {c.nome}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                                {formatCPF(c.cpf)}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-200">
                                {c.pa || "—"}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-blue-700 dark:text-blue-400">
                                  {c.memorando_numero}
                                </span>
                                {c.memorando_remessa && (
                                  <span className="text-slate-400 text-[10px] ml-1">
                                    ({c.memorando_remessa})
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500">
                                {c.memorando_data ? formatDate(c.memorando_data) : "—"}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                  <Clock className="w-3 h-3" />
                                  Ausente no Geral
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Informações de Rastreabilidade e Auditoria */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>
                    Operador Responsável: <strong>{user?.nome_curto || user?.nome || "Agente DETRAN"}</strong>
                  </span>
                </div>
                <div className="text-slate-400 text-[10px]">
                  Ação auditada nos livros de movimentações e logs de sistema
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer text-xs"
          >
            Fechar
          </button>

          {diagnostico.totalAusentes > 0 && (
            <button
              id="btn-confirmar-remessa-cnhs"
              type="button"
              onClick={handleExecutarRemessa}
              disabled={isSubmitting || selectedIds.size === 0 || !userCanEdit}
              className={`inline-flex items-center gap-2 px-5 py-2.5 font-bold rounded-xl text-xs transition-all ${
                isSubmitting || selectedIds.size === 0 || !userCanEdit
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed shadow-none"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md shadow-blue-500/20 cursor-pointer"
              }`}
              title={
                !userCanEdit
                  ? "Seu perfil não possui permissão de edição"
                  : selectedIds.size === 0
                  ? "Selecione ao menos um candidato para remeter"
                  : `Remeter ${selectedIds.size} CNH(s) para a Tabela Geral`
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Remetendo CNHs...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>
                    Remeter {selectedIds.size} CNH(s) para a Tabela Geral
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
