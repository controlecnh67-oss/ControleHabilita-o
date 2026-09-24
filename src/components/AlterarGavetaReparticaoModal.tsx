import React, { useState, useMemo } from "react";
import {
  X,
  Layers,
  Building2,
  Archive,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Check,
  User,
  ShieldAlert,
  Edit3
} from "lucide-react";
import { GeralCNH, Usuario, SituacaoGeral, AcaoAuditoria } from "../types";
import { DEFAULT_GAVETAS, DEFAULT_REPARTICOES } from "../lib/constants";
import { saveLocalGeralCNHsBulk, notifySyncUpdated } from "../services/dexieDb";
import { logAuditoriaBulk } from "../services/db";
import { formatCPF, normalizeSearch } from "../lib/utils";

interface AlterarGavetaReparticaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  cnhs: GeralCNH[];
  currentUser: Usuario | null;
  filtroLoteAtual?: string;
  onSuccess: (updatedCount: number, message: string) => void;
}

export const AlterarGavetaReparticaoModal: React.FC<AlterarGavetaReparticaoModalProps> = ({
  isOpen,
  onClose,
  selectedIds,
  cnhs,
  currentUser,
  filtroLoteAtual,
  onSuccess,
}) => {
  // Configurações de alteração
  const [alterarGaveta, setAlterarGaveta] = useState(true);
  const [selectedGaveta, setSelectedGaveta] = useState<string>("Gaveta 1");
  const [customGaveta, setCustomGaveta] = useState<string>("");
  const [isCustomGaveta, setIsCustomGaveta] = useState(false);

  const [alterarReparticao, setAlterarReparticao] = useState(true);
  const [selectedReparticao, setSelectedReparticao] = useState<string>("Repartição 1");
  const [customReparticao, setCustomReparticao] = useState<string>("");
  const [isCustomReparticao, setIsCustomReparticao] = useState(false);

  const [alterarSituacao, setAlterarSituacao] = useState(false);
  const [novaSituacao, setNovaSituacao] = useState<SituacaoGeral>("Recebida");

  const [adicionarObservacao, setAdicionarObservacao] = useState(false);
  const [observacaoTexto, setObservacaoTexto] = useState("");

  const [searchPreview, setSearchPreview] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Lista de opções únicas encontradas na base
  const availableGavetas = useMemo(() => {
    const set = new Set<string>(DEFAULT_GAVETAS);
    cnhs.forEach((c) => {
      if (c.gaveta && c.gaveta.trim()) set.add(c.gaveta.trim());
    });
    return Array.from(set);
  }, [cnhs]);

  const availableReparticoes = useMemo(() => {
    const set = new Set<string>(DEFAULT_REPARTICOES);
    cnhs.forEach((c) => {
      if (c.reparticao && c.reparticao.trim()) set.add(c.reparticao.trim());
    });
    return Array.from(set);
  }, [cnhs]);

  // Registros selecionados
  const selectedCNHs = useMemo(() => {
    const idSet = new Set(selectedIds);
    return cnhs.filter((c) => idSet.has(c.id));
  }, [selectedIds, cnhs]);

  // Lote predominante entre os selecionados
  const loteDetectado = useMemo(() => {
    if (filtroLoteAtual && filtroLoteAtual.trim()) {
      return filtroLoteAtual.trim();
    }
    const lotesCount: Record<string, number> = {};
    selectedCNHs.forEach((c) => {
      if (c.lote && c.lote.trim()) {
        lotesCount[c.lote] = (lotesCount[c.lote] || 0) + 1;
      }
    });
    const entries = Object.entries(lotesCount);
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      return entries[0][0];
    }
    return null;
  }, [filtroLoteAtual, selectedCNHs]);

  // Registros filtrados na tabela de pré-visualização
  const previewList = useMemo(() => {
    if (!searchPreview.trim()) return selectedCNHs;
    const q = normalizeSearch(searchPreview);
    return selectedCNHs.filter(
      (c) =>
        normalizeSearch(c.nome).includes(q) ||
        (c.cpf && c.cpf.includes(searchPreview.trim())) ||
        (c.pa && c.pa.includes(searchPreview.trim())) ||
        (c.lote && normalizeSearch(c.lote).includes(q)) ||
        c.ordem.toString().includes(searchPreview.trim())
    );
  }, [selectedCNHs, searchPreview]);

  // Valor final de Gaveta e Repartição
  const finalGaveta = isCustomGaveta ? customGaveta.trim() : selectedGaveta.trim();
  const finalReparticao = isCustomReparticao ? customReparticao.trim() : selectedReparticao.trim();

  // Executar salvamento em lote
  const handleConfirm = async () => {
    if (selectedCNHs.length === 0) return;
    if (!alterarGaveta && !alterarReparticao && !alterarSituacao && !adicionarObservacao) {
      setErrorMessage("Selecione pelo menos um campo para alterar (Gaveta, Repartição, Situação ou Observação).");
      return;
    }

    if (alterarGaveta && isCustomGaveta && !customGaveta.trim()) {
      setErrorMessage("Por favor, digite o nome da gaveta personalizada.");
      return;
    }

    if (alterarReparticao && isCustomReparticao && !customReparticao.trim()) {
      setErrorMessage("Por favor, digite o nome da repartição personalizada.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const now = new Date().toISOString();
      const userNome = currentUser?.nome_curto || currentUser?.nome || "Usuário do Sistema";
      const userId = currentUser?.id || "system";

      const updatedRecords: GeralCNH[] = [];
      const auditEntries: Array<{
        tabela: string;
        registro_id: string | number;
        acao: AcaoAuditoria;
        usuario_id: string;
        usuario_nome: string;
        valores_anteriores: any;
        valores_novos: any;
      }> = [];

      for (const item of selectedCNHs) {
        const prevGaveta = item.gaveta || "";
        const prevReparticao = item.reparticao || "";
        const prevSituacao = item.situacao;
        const prevObs = item.observacao || "";

        let nextGaveta = item.gaveta;
        if (alterarGaveta) {
          nextGaveta = finalGaveta;
        }

        let nextReparticao = item.reparticao;
        if (alterarReparticao) {
          nextReparticao = finalReparticao;
        }

        let nextSituacao = item.situacao;
        if (alterarSituacao) {
          nextSituacao = novaSituacao;
        }

        let nextObs = item.observacao;
        if (adicionarObservacao && observacaoTexto.trim()) {
          const prefix = item.observacao && item.observacao.trim() ? `${item.observacao.trim()} | ` : "";
          nextObs = `${prefix}${observacaoTexto.trim()}`;
        }

        const updated: GeralCNH = {
          ...item,
          gaveta: nextGaveta,
          reparticao: nextReparticao,
          situacao: nextSituacao,
          observacao: nextObs,
          usuario_id: userId,
          usuario_nome: userNome,
          updated_at: now
        };

        updatedRecords.push(updated);

        auditEntries.push({
          tabela: "geral_cnhs",
          registro_id: item.id,
          acao: "Alteração",
          usuario_id: userId,
          usuario_nome: userNome,
          valores_anteriores: {
            gaveta: prevGaveta,
            reparticao: prevReparticao,
            situacao: prevSituacao,
            observacao: prevObs
          },
          valores_novos: {
            gaveta: nextGaveta,
            reparticao: nextReparticao,
            situacao: nextSituacao,
            observacao: nextObs
          }
        });
      }

      // 1. Salvar no Dexie e Supabase via bulk helper
      await saveLocalGeralCNHsBulk(updatedRecords);

      // 2. Registrar auditoria em massa
      if (auditEntries.length > 0) {
        await logAuditoriaBulk(auditEntries);
      }

      // 3. Notificar sincronização
      notifySyncUpdated("geral");

      // Montar mensagem de sucesso
      const partes: string[] = [];
      if (alterarGaveta) partes.push(`Gaveta: "${finalGaveta || 'Vazio'}"`);
      if (alterarReparticao) partes.push(`Repartição: "${finalReparticao || 'Vazio'}"`);
      if (alterarSituacao) partes.push(`Situação: "${novaSituacao}"`);

      const msg = `Localização de ${updatedRecords.length} CNHs atualizada com sucesso! (${partes.join(" | ")})`;

      onSuccess(updatedRecords.length, msg);
      onClose();
    } catch (err: any) {
      console.error("Erro ao alterar localização em lote:", err);
      setErrorMessage(err.message || "Ocorreu um erro ao salvar as alterações em lote.");
    } finally {
      setIsSaving(false);
    }
  };

  // Regra de Hooks do React: o early return deve ficar estritamente no final antes do JSX
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header do Modal */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-50/80 via-white to-slate-50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Alterar Gaveta e Repartição em Lote
                </h3>
                {loteDetectado && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 font-bold text-[11px] border border-indigo-200 dark:border-indigo-800">
                    <Layers className="w-3 h-3 text-indigo-600" />
                    Lote: {loteDetectado}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Aplicar nova localização física para as <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedCNHs.length}</strong> CNHs marcadas
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

        {/* Mensagem de Erro se houver */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-xl flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Painel de Definição dos Novos Valores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Bloco de Gaveta */}
            <div className={`p-4 rounded-2xl border transition-all ${
              alterarGaveta 
                ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60" 
                : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alterarGaveta}
                    onChange={(e) => setAlterarGaveta(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-700 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Archive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Atualizar Gaveta
                  </span>
                </label>

                {alterarGaveta && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomGaveta(!isCustomGaveta);
                      if (!isCustomGaveta && !customGaveta) {
                        setCustomGaveta(selectedGaveta);
                      }
                    }}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                  >
                    {isCustomGaveta ? "Selecionar da lista" : "+ Digitar personalizado"}
                  </button>
                )}
              </div>

              {alterarGaveta && (
                <div className="space-y-2">
                  {!isCustomGaveta ? (
                    <select
                      value={selectedGaveta}
                      onChange={(e) => setSelectedGaveta(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
                    >
                      <option value="">(Deixar Vazio / Sem Gaveta)</option>
                      {availableGavetas.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ex: Gaveta 10, Armário A, etc."
                      value={customGaveta}
                      onChange={(e) => setCustomGaveta(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-hidden"
                      autoFocus
                    />
                  )}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Nova gaveta que será atribuída às {selectedCNHs.length} CNHs.
                  </p>
                </div>
              )}
            </div>

            {/* Bloco de Repartição */}
            <div className={`p-4 rounded-2xl border transition-all ${
              alterarReparticao 
                ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60" 
                : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alterarReparticao}
                    onChange={(e) => setAlterarReparticao(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Atualizar Repartição
                  </span>
                </label>

                {alterarReparticao && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomReparticao(!isCustomReparticao);
                      if (!isCustomReparticao && !customReparticao) {
                        setCustomReparticao(selectedReparticao);
                      }
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    {isCustomReparticao ? "Selecionar da lista" : "+ Digitar personalizado"}
                  </button>
                )}
              </div>

              {alterarReparticao && (
                <div className="space-y-2">
                  {!isCustomReparticao ? (
                    <select
                      value={selectedReparticao}
                      onChange={(e) => setSelectedReparticao(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-hidden cursor-pointer"
                    >
                      <option value="">(Deixar Vazio / Sem Repartição)</option>
                      {availableReparticoes.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ex: Repartição 09, Posto Central, etc."
                      value={customReparticao}
                      onChange={(e) => setCustomReparticao(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      autoFocus
                    />
                  )}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Nova repartição que será atribuída às {selectedCNHs.length} CNHs.
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Opções Complementares (Situação e Observação) */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Opções Adicionais (Opcional)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Situação */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                  <input
                    type="checkbox"
                    checked={alterarSituacao}
                    onChange={(e) => setAlterarSituacao(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 dark:border-slate-700 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Também atualizar Situação
                  </span>
                </label>
                {alterarSituacao && (
                  <select
                    value={novaSituacao}
                    onChange={(e) => setNovaSituacao(e.target.value as SituacaoGeral)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-hidden cursor-pointer"
                  >
                    <option value="Recebida">🔵 Recebida na Agência</option>
                    <option value="Remetida">🟡 Remetida (Em Trânsito)</option>
                    <option value="Pendente">🔴 Pendente Alocação</option>
                    <option value="Entregue">🟢 Entregue ao Titular</option>
                  </select>
                )}
              </div>

              {/* Observação */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                  <input
                    type="checkbox"
                    checked={adicionarObservacao}
                    onChange={(e) => setAdicionarObservacao(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 dark:border-slate-700 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Anexar Nota / Observação
                  </span>
                </label>
                {adicionarObservacao && (
                  <input
                    type="text"
                    placeholder="Ex: Movimentado em lote para conferência"
                    value={observacaoTexto}
                    onChange={(e) => setObservacaoTexto(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Tabela de Pré-visualização das CNHs que serão alteradas */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <span>Lista de CNHs a serem alteradas</span>
                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-[11px] font-mono">
                  {previewList.length} {previewList.length === 1 ? "registro" : "registros"}
                </span>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar na lista selecionada..."
                  value={searchPreview}
                  onChange={(e) => setSearchPreview(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Titular / CPF</th>
                    <th className="py-2 px-3">PA / Lote</th>
                    <th className="py-2 px-3">Gaveta</th>
                    <th className="py-2 px-3">Repartição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {previewList.map((c) => {
                    const willChangeGaveta = alterarGaveta && (c.gaveta || "") !== finalGaveta;
                    const willChangeRep = alterarReparticao && (c.reparticao || "") !== finalReparticao;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                          #{c.ordem}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                            {c.nome}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {formatCPF(c.cpf)}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {c.pa && (
                            <div className="text-emerald-700 dark:text-emerald-400 font-bold">
                              PA: {c.pa}
                            </div>
                          )}
                          {c.lote ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold text-[10px]">
                              {c.lote}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Sem lote</span>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {alterarGaveta ? (
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span className="text-slate-400 line-through text-[11px]">
                                {c.gaveta || "Vazio"}
                              </span>
                              <ArrowRight className="w-3 h-3 text-blue-600" />
                              <span className="text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded text-[11px] font-bold">
                                {finalGaveta || "(Vazio)"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-300">
                              {c.gaveta || "-"}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {alterarReparticao ? (
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span className="text-slate-400 line-through text-[11px]">
                                {c.reparticao || "Vazio"}
                              </span>
                              <ArrowRight className="w-3 h-3 text-indigo-600" />
                              <span className="text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded text-[11px] font-bold">
                                {finalReparticao || "(Vazio)"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-300">
                              {c.reparticao || "-"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Rodapé da Modal com Ações */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Total selecionado: <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold">{selectedCNHs.length}</strong> CNHs
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || selectedCNHs.length === 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Salvando em Lote...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Salvar e Atualizar {selectedCNHs.length} CNHs</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
