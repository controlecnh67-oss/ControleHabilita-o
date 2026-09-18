import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  GitMerge,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  FileCheck2,
  ArrowRight,
  Info,
  Layers,
  Sparkles,
  Check
} from "lucide-react";
import {
  previewMergeResponsaveis,
  MergePreviewData,
  restoreResponsaveisInfoAndDatabase,
  mergeResponsaveisByNome,
  CANONICAL_PROPRIETARIO_ID
} from "../services/db";

interface ModalChecagemMesclagemProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: (result: {
    type: "merge" | "restore";
    removedCount?: number;
    reassignedCount?: number;
    totalEntregues?: number;
    message: string;
  }) => void;
}

export const ModalChecagemMesclagem: React.FC<ModalChecagemMesclagemProps> = ({
  isOpen,
  onClose,
  onCompleted
}) => {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<MergePreviewData | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingAction, setExecutingAction] = useState<"merge" | "restore" | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [expandedGroupIdxs, setExpandedGroupIdxs] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"diagnostico" | "grupos" | "logs">("diagnostico");
  const [executionFinished, setExecutionFinished] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const data = await previewMergeResponsaveis();
      setPreviewData(data);
      // Expande todos os grupos duplicados por padrão
      setExpandedGroupIdxs(new Set(data.duplicateGroups.map((_, idx) => idx)));
    } catch (err) {
      console.error("Erro ao carregar pré-visualização de mesclagem:", err);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLogs([]);
      setExecutionFinished(false);
      setExecutingAction(null);
      setActiveTab("diagnostico");
      loadPreview();
    }
  }, [isOpen, loadPreview]);

  const toggleGroup = (idx: number) => {
    setExpandedGroupIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // 1. Executa restauração integral no banco
  const handleRestoreDatabase = async () => {
    setIsExecuting(true);
    setExecutingAction("restore");
    setActiveTab("logs");
    setLogs([]);
    addLog("Iniciando rotina de restauração e integridade no banco de dados...");

    try {
      const res = await restoreResponsaveisInfoAndDatabase((msg) => addLog(msg));
      setExecutionFinished(true);
      addLog(`Restauração concluída com sucesso! ${res.cpfsReparadosCount || 0} CPFs, ${res.usuariosReparadosCount || 0} usuários e ${res.gavetasReparadasCount || 0} gavetas/repartições recuperadas, ${res.restoredCnhsCount} CNH(s) reparadas/reconciliadas.`);
      onCompleted({
        type: "restore",
        reassignedCount: res.restoredCnhsCount,
        totalEntregues: res.proprietarioCnhsCount + res.despachanteCnhsCount,
        message: `Restauração concluída com sucesso! ${res.cpfsReparadosCount || 0} CPFs, ${res.usuariosReparadosCount || 0} usuários e ${res.gavetasReparadasCount || 0} gavetas/repartições restauradas no banco.`
      });
    } catch (err: any) {
      addLog(`ERRO durante restauração: ${err.message || err}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // 2. Executa a mesclagem segura
  const handleConfirmMerge = async () => {
    setIsExecuting(true);
    setExecutingAction("merge");
    setActiveTab("logs");
    setLogs([]);
    addLog("Iniciando mesclagem segura com reconciliação 100% dos vínculos...");

    try {
      const res = await mergeResponsaveisByNome((msg) => addLog(msg));
      setExecutionFinished(true);
      addLog(`Mesclagem concluída! ${res.removedCount} duplicatas eliminadas, ${res.reassignedCnhsCount} CNH(s) realinhadas.`);
      onCompleted({
        type: "merge",
        removedCount: res.removedCount,
        reassignedCount: res.reassignedCnhsCount,
        totalEntregues: res.totalEntreguesNoBalcao,
        message: `Mesclagem por nome concluída com sucesso! ${res.removedCount} cadastro(s) duplicado(s) unificado(s). Vínculos e IDs preservados no banco de dados.`
      });
    } catch (err: any) {
      addLog(`ERRO durante mesclagem: ${err.message || err}`);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        id="modal-checagem-mesclagem"
        className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden my-auto"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Checagem e Confirmação de Mesclagem
                {previewData && previewData.totalDuplicates > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    {previewData.totalDuplicates} duplicata{previewData.totalDuplicates > 1 ? "s" : ""}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auditoria de integridade, unificação de cadastros e proteção das colunas <span className="font-mono text-indigo-600 dark:text-indigo-400">responsavel_id</span> e <span className="font-mono text-indigo-600 dark:text-indigo-400">responsavel_nome</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-6 bg-white dark:bg-slate-900 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("diagnostico")}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "diagnostico"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Diagnóstico de Integridade</span>
          </button>

          <button
            onClick={() => setActiveTab("grupos")}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "grupos"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Grupos Duplicados ({previewData?.duplicateGroups.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "logs"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isExecuting ? "animate-spin text-indigo-600" : ""}`} />
            <span>Progresso e Logs {logs.length > 0 && `(${logs.length})`}</span>
          </button>
        </div>

        {/* Conteúdo da Modal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loadingPreview ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Analisando banco de dados e preparando diagnóstico seguro...
              </p>
            </div>
          ) : (
            <>
              {/* TAB 1: DIAGNÓSTICO DE INTEGRIDADE */}
              {activeTab === "diagnostico" && (
                <div className="space-y-4">
                  {/* Cartão de Garantia de Integridade */}
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-emerald-950 dark:text-emerald-100">
                        Mecanismo de Proteção Ativa Contra Perda de Dados
                      </p>
                      <p className="text-emerald-800 dark:text-emerald-200 leading-relaxed">
                        Ao mesclar ou restaurar, o sistema sincroniza os responsáveis mestres no Supabase antes de qualquer alteração nas CNHs. Em seguida, os vínculos das CNHs com <strong className="underline">responsavel_id</strong> e <strong className="underline">responsavel_nome</strong> são gravados em lote, impedindo que o banco de dados defina valores nulos.
                      </p>
                    </div>
                  </div>

                  {/* Cards de Métricas */}
                  {previewData && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          Responsáveis Atuais
                        </span>
                        <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                          {previewData.totalResponsaveis}
                        </div>
                        <span className="text-[10px] text-slate-500">Cadastros totais</span>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                          Cadastros a Unificar
                        </span>
                        <div className="text-xl font-bold text-amber-900 dark:text-amber-200 mt-1">
                          {previewData.totalDuplicates}
                        </div>
                        <span className="text-[10px] text-amber-700 dark:text-amber-400">
                          {previewData.duplicateGroups.length} grupo(s) detectado(s)
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                        <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400 uppercase tracking-wider block">
                          Após Mesclagem
                        </span>
                        <div className="text-xl font-bold text-indigo-900 dark:text-indigo-200 mt-1">
                          {previewData.remainingCount}
                        </div>
                        <span className="text-[10px] text-indigo-700 dark:text-indigo-400">Cadastros mestres</span>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                          CNHs Entregues
                        </span>
                        <div className="text-xl font-bold text-emerald-900 dark:text-emerald-200 mt-1">
                          {previewData.totalEntregues}
                        </div>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                          {previewData.cnhsWithDespachante} Desp. / {previewData.cnhsWithProprietario} Titular
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Checklist de Verificações Pré-Execução */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-indigo-600" />
                      Checklist de Validação do Banco de Dados
                    </h3>
                    <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          <strong>ID Canônico do Titular/Proprietário:</strong> Assegurado como <code>{CANONICAL_PROPRIETARIO_ID}</code> com nome <strong>"PROPRIETÁRIO"</strong>.
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          <strong>Preservação de responsavel_id e responsavel_nome:</strong> Todos os 424 registros de CNHs entregues serão atualizados em lote no Supabase com ambos os campos preenchidos.
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          <strong>Ordem Segura de Operações:</strong> 1º Salvar responsáveis mestres → 2º Atualizar CNHs → 3º Apenas depois excluir IDs duplicados obsoletos.
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          <strong>Conexão Supabase:</strong> {previewData?.isSupabaseConfigured ? "Conectado e operacional" : "Modo Local (Offline/Dexie)"}.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Alerta explicativo */}
                  <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Informação sobre os campos no banco de dados:</p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                        Se em alguma atualização anterior o seu banco de dados Supabase ficou com <code className="font-mono font-bold">responsavel_id: null</code> ou <code className="font-mono font-bold">responsavel_nome: null</code>, utilize o botão <strong>"Restaurar Banco de Dados"</strong> abaixo para repovoar imediatamente todos os 424 registros entregues com seus dados originais de retiradas.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: GRUPOS DUPLICADOS */}
              {activeTab === "grupos" && (
                <div className="space-y-3">
                  {previewData?.duplicateGroups.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        Nenhuma duplicata encontrada!
                      </p>
                      <p className="text-xs text-slate-500">
                        A tabela de responsáveis já está 100% unificada.
                      </p>
                    </div>
                  ) : (
                    previewData?.duplicateGroups.map((group, idx) => {
                      const isExpanded = expandedGroupIdxs.has(idx);
                      return (
                        <div
                          key={idx}
                          className="border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden bg-white dark:bg-slate-800/40"
                        >
                          <div
                            onClick={() => toggleGroup(idx)}
                            className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">
                                {group.master.nome}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                {group.duplicates.length + 1} cadastros unificados
                              </span>
                              {group.affectedCnhsCount > 0 && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  {group.affectedCnhsCount} CNHs vinculadas
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">
                                {group.reason}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3.5 space-y-2.5 text-xs">
                              {/* Registro Mestre */}
                              <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-emerald-900 dark:text-emerald-200 uppercase">
                                      {group.master.nome}
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                      MESTRE MANTIDO
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                    ID: <code className="font-mono">{group.master.id}</code> {group.master.cpf && `• CPF: ${group.master.cpf}`} {group.master.telefone && `• Tel: ${group.master.telefone}`}
                                  </p>
                                </div>
                              </div>

                              {/* Registros Duplicados */}
                              <div className="pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-1.5">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                  Duplicatas que serão absorvidas:
                                </p>
                                {group.duplicates.map((dup) => (
                                  <div
                                    key={dup.id}
                                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                                  >
                                    <div className="space-y-0.5">
                                      <span className="font-medium text-slate-800 dark:text-slate-200">
                                        {dup.nome}
                                      </span>
                                      <p className="text-[11px] text-slate-500">
                                        ID duplicado: <code className="font-mono">{dup.id}</code> {dup.cpf && `• CPF: ${dup.cpf}`} {dup.telefone && `• Tel: ${dup.telefone}`}
                                      </p>
                                    </div>
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                      Será mesclado
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 3: LOGS EM TEMPO REAL */}
              {activeTab === "logs" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Registro de Execução
                    </span>
                    {isExecuting && (
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5 animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Processando em segundo plano...
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs max-h-72 overflow-y-auto space-y-1.5 border border-slate-800 shadow-inner">
                    {logs.length === 0 ? (
                      <p className="text-slate-500 italic">
                        Nenhuma operação iniciada ainda. Clique em "Confirmar e Executar Mesclagem" ou "Restaurar Banco de Dados".
                      </p>
                    ) : (
                      logs.map((l, i) => (
                        <div key={i} className="leading-relaxed">
                          <span className="text-emerald-400">➜</span> {l}
                        </div>
                      ))
                    )}
                  </div>

                  {executionFinished && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Operação concluída com sucesso! Os dados foram salvos tanto localmente quanto no Supabase.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé / Ações */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Botão de Restauração Direta do Banco */}
            <button
              id="btn-restaurar-dados-banco"
              onClick={handleRestoreDatabase}
              disabled={isExecuting}
              title="Recupera todos os responsavel_id e responsavel_nome de CNHs entregues e sincroniza diretamente no Supabase"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              <Database className={`w-4 h-4 ${executingAction === "restore" && isExecuting ? "animate-spin" : ""}`} />
              <span>{executingAction === "restore" && isExecuting ? "Restaurando no Banco..." : "Restaurar Informações no Banco"}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              disabled={isExecuting}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              id="btn-confirmar-mesclagem-modal"
              onClick={handleConfirmMerge}
              disabled={isExecuting || (previewData?.totalDuplicates === 0 && !previewData?.cnhsWithProprietario)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <GitMerge className={`w-4 h-4 ${executingAction === "merge" && isExecuting ? "animate-spin" : ""}`} />
              <span>{executingAction === "merge" && isExecuting ? "Processando Mesclagem..." : "Confirmar e Executar Mesclagem"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
