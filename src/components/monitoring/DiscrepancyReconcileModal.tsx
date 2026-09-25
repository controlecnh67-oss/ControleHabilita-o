import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Server,
  HardDrive,
  Sliders,
  Filter,
  Layers,
  Sparkles,
  Info,
  X
} from "lucide-react";
import {
  detectDiscrepancies,
  forceUnidirectionalReconciliation,
  DiscrepancyReport,
  ReconcileDirection,
  ReconcileResult
} from "../../services/discrepancySyncService";
import { formatDateTime } from "../../lib/utils";

interface DiscrepancyReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const DiscrepancyReconcileModal: React.FC<DiscrepancyReconcileModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted
}) => {
  const [report, setReport] = useState<DiscrepancyReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [direction, setDirection] = useState<ReconcileDirection>("supabase_to_dexie");
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState("");
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [filterView, setFilterView] = useState<"all" | "remote_newer" | "local_newer">("all");

  const runScan = async () => {
    setIsScanning(true);
    setResult(null);
    setScanMessage("Iniciando varredura comparativa por 'updated_at'...");
    try {
      const rep = await detectDiscrepancies((msg) => setScanMessage(msg));
      setReport(rep);
      // Auto-seleciona a direção recomendada com base nas discrepâncias
      if (rep.remoteNewerCount > 0 && rep.localNewerCount === 0) {
        setDirection("supabase_to_dexie");
      } else if (rep.localNewerCount > 0 && rep.remoteNewerCount === 0) {
        setDirection("dexie_to_supabase");
      } else {
        setDirection("supabase_to_dexie");
      }
    } catch (err: any) {
      alert("Erro na varredura de discrepâncias: " + (err.message || err));
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runScan();
    } else {
      setReport(null);
      setResult(null);
      setScanMessage("");
      setReconcileMessage("");
    }
  }, [isOpen]);

  const handleExecuteReconciliation = async () => {
    if (!report) return;

    const countToSync =
      direction === "supabase_to_dexie"
        ? report.remoteNewerCount + report.onlyInRemoteCount
        : direction === "dexie_to_supabase"
        ? report.localNewerCount + report.onlyInLocalCount
        : report.totalDiscrepancies;

    if (countToSync === 0) {
      alert("Não há registros discrepantes para a direção selecionada.");
      return;
    }

    const dirText =
      direction === "supabase_to_dexie"
        ? "Nuvem ➔ Local (Supabase ➔ Dexie)"
        : direction === "dexie_to_supabase"
        ? "Local ➔ Nuvem (Dexie ➔ Supabase)"
        : "Automática pelo 'updated_at' mais recente";

    if (
      !window.confirm(
        `Confirma a re-sincronização unidirecional [${dirText}] de ${countToSync} registro(s) discrepante(s)?`
      )
    ) {
      return;
    }

    setIsReconciling(true);
    setResult(null);
    setReconcileMessage("Preparando sincronização unidirecional...");

    try {
      const res = await forceUnidirectionalReconciliation({
        direction,
        report,
        onProgress: (msg) => setReconcileMessage(msg)
      });
      setResult(res);
      onSyncCompleted?.();
      // Re-escaneia para confirmar alinhamento
      const newRep = await detectDiscrepancies();
      setReport(newRep);
    } catch (err: any) {
      alert("Erro ao executar re-sincronização: " + (err.message || err));
    } finally {
      setIsReconciling(false);
    }
  };

  if (!isOpen) return null;

  const filteredItems = report?.items.filter((item) => {
    if (filterView === "remote_newer") return item.status === "remote_newer" || item.status === "only_remote";
    if (filterView === "local_newer") return item.status === "local_newer" || item.status === "only_local";
    return true;
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] my-4">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 rounded-xl">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Re-sincronização Unidirecional de Discrepâncias
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono">
                  coluna updated_at
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alinha cirurgicamente registros divergentes entre o IndexedDB (Dexie) e o Supabase com base nos timestamps de alteração
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isReconciling}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Seção de Varredura / Status */}
          {isScanning ? (
            <div className="p-8 text-center bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-xl space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto" />
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Escaneando timestamps de alteração ('updated_at')...
              </p>
              <p className="text-xs text-slate-500 font-mono">{scanMessage}</p>
            </div>
          ) : report ? (
            <>
              {/* Cards de Métricas da Varredura */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Base IndexedDB</span>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {report.totalLocal.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">registros locais</span>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Base Supabase</span>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {report.totalRemote.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-slate-400">registros na nuvem</span>
                </div>

                <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/60 dark:border-emerald-900/50">
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Em Sincronismo</span>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {report.inSyncCount.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-emerald-600/80">timestamps idênticos</span>
                </div>

                <div className={`p-3.5 rounded-xl border ${
                  report.totalDiscrepancies > 0
                    ? "bg-amber-50/60 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                    : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                }`}>
                  <span className="text-[10px] font-semibold uppercase">Discrepâncias</span>
                  <div className="text-xl font-bold mt-0.5">
                    {report.totalDiscrepancies}
                  </div>
                  <span className="text-[10px]">
                    {report.totalDiscrepancies > 0 ? "divergências por updated_at" : "totalmente alinhados"}
                  </span>
                </div>
              </div>

              {/* Mensagem de Feedback de Execução */}
              {result && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs font-medium flex items-start gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{result.message}</div>
                    {result.errors.length > 0 && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                        Avisos: {result.errors.join("; ")}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Seleção da Direção Unidirecional */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    Selecione a Direção da Re-sincronização Unidirecional:
                  </label>
                  <button
                    onClick={runScan}
                    disabled={isScanning || isReconciling}
                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-escanear
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Direção 1: Supabase -> Dexie */}
                  <label
                    onClick={() => setDirection("supabase_to_dexie")}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      direction === "supabase_to_dexie"
                        ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 text-blue-950 dark:text-blue-100 shadow-xs"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-blue-600" />
                          <ArrowRight className="w-3 h-3 text-blue-500" />
                          <HardDrive className="w-3.5 h-3.5 text-blue-600" />
                          Nuvem ➔ Local
                        </span>
                        <input
                          type="radio"
                          name="sync_direction"
                          checked={direction === "supabase_to_dexie"}
                          onChange={() => setDirection("supabase_to_dexie")}
                          className="w-3.5 h-3.5 text-blue-600"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Atualiza o <strong>IndexedDB (Dexie)</strong> com os registros que foram alterados mais recentemente na nuvem.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] font-mono">
                      <span>Registros elegíveis:</span>
                      <strong className="text-blue-600 dark:text-blue-400 font-bold">
                        {report.remoteNewerCount + report.onlyInRemoteCount}
                      </strong>
                    </div>
                  </label>

                  {/* Direção 2: Dexie -> Supabase */}
                  <label
                    onClick={() => setDirection("dexie_to_supabase")}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      direction === "dexie_to_supabase"
                        ? "border-purple-600 bg-purple-50/70 dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 shadow-xs"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-purple-600" />
                          <ArrowRight className="w-3 h-3 text-purple-500" />
                          <Server className="w-3.5 h-3.5 text-purple-600" />
                          Local ➔ Nuvem
                        </span>
                        <input
                          type="radio"
                          name="sync_direction"
                          checked={direction === "dexie_to_supabase"}
                          onChange={() => setDirection("dexie_to_supabase")}
                          className="w-3.5 h-3.5 text-purple-600"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Envia para o <strong>Supabase</strong> os registros locais cuja coluna <code>updated_at</code> é mais recente.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] font-mono">
                      <span>Registros elegíveis:</span>
                      <strong className="text-purple-600 dark:text-purple-400 font-bold">
                        {report.localNewerCount + report.onlyInLocalCount}
                      </strong>
                    </div>
                  </label>

                  {/* Direção 3: Timestamp Mais Recente */}
                  <label
                    onClick={() => setDirection("latest_timestamp")}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      direction === "latest_timestamp"
                        ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 shadow-xs"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          Timestamp Mais Recente
                        </span>
                        <input
                          type="radio"
                          name="sync_direction"
                          checked={direction === "latest_timestamp"}
                          onChange={() => setDirection("latest_timestamp")}
                          className="w-3.5 h-3.5 text-emerald-600"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Atualiza cada registro na direção de onde o <code>updated_at</code> for maior, garantindo alinhamento bidirecional seguro.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] font-mono">
                      <span>Total discrepante:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {report.totalDiscrepancies}
                      </strong>
                    </div>
                  </label>
                </div>
              </div>

              {/* Tabela de Amostra dos Registros Discrepantes */}
              {report.totalDiscrepancies > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      Detalhamento dos Registros com Timestamp Divergente ({filteredItems.length})
                    </span>

                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        onClick={() => setFilterView("all")}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          filterView === "all" ? "bg-blue-600 text-white font-bold" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Todos ({report.items.length})
                      </button>
                      <button
                        onClick={() => setFilterView("remote_newer")}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          filterView === "remote_newer" ? "bg-blue-600 text-white font-bold" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Nuvem Mais Recente ({report.remoteNewerCount + report.onlyInRemoteCount})
                      </button>
                      <button
                        onClick={() => setFilterView("local_newer")}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          filterView === "local_newer" ? "bg-blue-600 text-white font-bold" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Local Mais Recente ({report.localNewerCount + report.onlyInLocalCount})
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Ordem / Titular</th>
                          <th className="py-2 px-3">Dexie 'updated_at'</th>
                          <th className="py-2 px-3">Supabase 'updated_at'</th>
                          <th className="py-2 px-3 text-right">Diagnóstico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                        {filteredItems.slice(0, 50).map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                #{item.ordem}
                              </span>{" "}
                              <span className="font-sans text-slate-600 dark:text-slate-300">
                                {item.nome}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                              {item.localUpdatedAt ? formatDateTime(item.localUpdatedAt) : <span className="text-slate-400">Ausente local</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                              {item.remoteUpdatedAt ? formatDateTime(item.remoteUpdatedAt) : <span className="text-slate-400">Ausente nuvem</span>}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {item.status === "remote_newer" && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                  Nuvem +{item.diffSeconds}s
                                </span>
                              )}
                              {item.status === "local_newer" && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                  Local +{item.diffSeconds}s
                                </span>
                              )}
                              {item.status === "only_remote" && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                  Apenas na Nuvem
                                </span>
                              )}
                              {item.status === "only_local" && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                                  Apenas no Dexie
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredItems.length > 50 && (
                    <p className="text-[10px] text-center text-slate-400">
                      Mostrando os primeiros 50 registros discrepantes de {filteredItems.length}.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl space-y-1.5">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                    Nenhuma discrepância de timestamp detectada!
                  </p>
                  <p className="text-xs text-slate-500">
                    Todos os 11.226 registros do IndexedDB possuem o mesmo timestamp da coluna 'updated_at' que a tabela remota do Supabase.
                  </p>
                </div>
              )}
            </>
          ) : null}

          {/* Feedback de Progresso da Reconciliação */}
          {isReconciling && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-blue-900 dark:text-blue-200">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Re-sincronizando registros discrepantes...</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                {reconcileMessage}
              </p>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            disabled={isReconciling}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            onClick={handleExecuteReconciliation}
            disabled={isScanning || isReconciling || !report || report.totalDiscrepancies === 0}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md text-xs transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <Zap className={`w-4 h-4 ${isReconciling ? "animate-spin" : ""}`} />
            <span>
              {isReconciling
                ? "Sincronizando..."
                : direction === "supabase_to_dexie"
                ? "Forçar Re-sincronização (Nuvem ➔ Local)"
                : direction === "dexie_to_supabase"
                ? "Forçar Re-sincronização (Local ➔ Nuvem)"
                : "Forçar Re-sincronização por 'updated_at'"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
