import React, { useState, useEffect } from "react";
import {
  Cpu,
  Zap,
  HardDrive,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Sparkles,
  Trash2,
  Gauge,
  HelpCircle,
  Clock,
  Check
} from "lucide-react";
import {
  SystemAuditReport,
  runFullSystemAudit,
  performDeepMemoryCleanup,
  performIndexedDbOptimization,
  getMemoryMetrics,
  measureEventLoopLag
} from "../../services/systemAuditService";

export const SystemAuditSection: React.FC = () => {
  const [report, setReport] = useState<SystemAuditReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaningRam, setIsCleaningRam] = useState(false);
  const [isOptimizingDb, setIsOptimizingDb] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "info" | "warning"; text: string } | null>(null);

  // Monitor em tempo real de RAM e Lag da thread (atualiza a cada 3s)
  const [realtimeRam, setRealtimeRam] = useState(() => getMemoryMetrics());
  const [realtimeLag, setRealtimeLag] = useState<number>(0);

  const loadAudit = async () => {
    setIsLoading(true);
    try {
      const rep = await runFullSystemAudit();
      setReport(rep);
      setRealtimeRam(rep.memory);
      setRealtimeLag(rep.dom.eventLoopLagMs);
    } catch (e) {
      console.warn("Erro ao executar auditoria do sistema:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();

    const interval = setInterval(async () => {
      setRealtimeRam(getMemoryMetrics());
      const lag = await measureEventLoopLag();
      setRealtimeLag(lag);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleCleanRam = async () => {
    setIsCleaningRam(true);
    setStatusMessage(null);
    try {
      const res = await performDeepMemoryCleanup();
      setStatusMessage({ type: "success", text: res.message });
      await loadAudit();
    } catch (err: any) {
      setStatusMessage({ type: "warning", text: "Erro ao tentar limpar memória: " + (err?.message || err) });
    } finally {
      setIsCleaningRam(false);
    }
  };

  const handleOptimizeDb = async () => {
    setIsOptimizingDb(true);
    setStatusMessage(null);
    try {
      const res = await performIndexedDbOptimization();
      setStatusMessage({ type: "success", text: res.message });
      await loadAudit();
    } catch (err: any) {
      setStatusMessage({ type: "warning", text: "Erro na otimização da base: " + (err?.message || err) });
    } finally {
      setIsOptimizingDb(false);
    }
  };

  // Cores de severidade da pontuação
  const score = report?.overallScore || 100;
  const scoreColor =
    score >= 85
      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500"
      : score >= 65
      ? "text-amber-600 dark:text-amber-400 border-amber-500"
      : "text-red-600 dark:text-red-400 border-red-500";

  return (
    <div className="space-y-6">
      {/* Alerta de feedback de ação */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
            statusMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : statusMessage.type === "warning"
              ? "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
              : "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Cartão de Visão Geral e Termômetro de Saúde */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-16 h-16 rounded-2xl border-4 flex items-center justify-center font-bold text-2xl shrink-0 ${scoreColor}`}
            >
              {score}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Laudo de Saúde & Performance do Sistema
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    score >= 85
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : score >= 65
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  }`}
                >
                  {score >= 85
                    ? "Excelente (Ágil & Leve)"
                    : score >= 65
                    ? "Atenção (Otimização Recomendada)"
                    : "Crítico (Alto Consumo)"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                Diagnóstico em tempo real para detectar e mitigar lentidões, vazamentos de memória (RAM leaks),
                travamento do navegador e sobrecargas no processador causadas por re-renderizações ou acúmulo de cache.
              </p>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-1">
                <Clock className="w-3.5 h-3.5" />
                Última varredura técnica: {report?.timestamp || "Carregando..."}
              </div>
            </div>
          </div>

          {/* Botões de Ação de Otimização Rápida */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleCleanRam}
              disabled={isCleaningRam}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              title="Libera memória RAM descartando caches voláteis e sugerindo Garbage Collection ao navegador"
            >
              <Zap className={`w-4 h-4 ${isCleaningRam ? "animate-spin" : "text-amber-300"}`} />
              {isCleaningRam ? "Limpando RAM..." : "Liberar Memória RAM"}
            </button>

            <button
              onClick={handleOptimizeDb}
              disabled={isOptimizingDb}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              title="Varre o IndexedDB, expurga duplicatas e compacta os registros"
            >
              <Sparkles className="w-4 h-4 text-emerald-500" />
              {isOptimizingDb ? "Compactando..." : "Sanear IndexedDB"}
            </button>

            <button
              onClick={loadAudit}
              disabled={isLoading}
              className="p-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Executar nova varredura agora"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Grid de 4 Métricas de Hardware e Navegador em Tempo Real */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Medidor de Memória RAM (Heap JS) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Memória RAM (Heap JS)
            </span>
            <div
              className={`p-2 rounded-lg ${
                realtimeRam.status === "optimal"
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600"
                  : realtimeRam.status === "moderate"
                  ? "bg-amber-50 dark:bg-amber-950/50 text-amber-600"
                  : "bg-red-50 dark:bg-red-950/50 text-red-600"
              }`}
            >
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            {realtimeRam.supported ? (
              <>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {realtimeRam.usedJSHeapMB}{" "}
                  <span className="text-xs font-normal text-slate-500">MB em uso</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Alocado pelo Chrome:</span>
                  <span className="font-mono font-semibold">{realtimeRam.totalJSHeapMB} MB</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      realtimeRam.status === "optimal"
                        ? "bg-emerald-500"
                        : realtimeRam.status === "moderate"
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(5, (realtimeRam.usedJSHeapMB / (realtimeRam.limitJSHeapMB || 2048)) * 100))}%`
                    }}
                  />
                </div>
                <div className="mt-1.5 text-[10px] text-slate-400 truncate">
                  Limite máx: {realtimeRam.limitJSHeapMB} MB
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
                  Estável
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Aba operando sem vazamentos detectados.
                </p>
              </>
            )}
          </div>
        </div>

        {/* 2. Responsividade da UI (Event Loop Lag) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Atraso da Thread (Event Loop)
            </span>
            <div
              className={`p-2 rounded-lg ${
                realtimeLag < 30
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600"
                  : realtimeLag < 70
                  ? "bg-amber-50 dark:bg-amber-950/50 text-amber-600"
                  : "bg-red-50 dark:bg-red-950/50 text-red-600"
              }`}
            >
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {realtimeLag}{" "}
              <span className="text-xs font-normal text-slate-500">ms</span>
            </div>
            <div className="mt-2 text-[11px] font-medium flex items-center gap-1.5">
              {realtimeLag < 30 ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Fluido e Ágil (Zero delay)
                </span>
              ) : realtimeLag < 70 ? (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> Carga Moderada
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> Interface Congelando
                </span>
              )}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Tempo que o navegador leva para atender cliques e animações.
            </p>
          </div>
        </div>

        {/* 3. Elementos Renderizados na Tela (DOM Nodes) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Elementos na Tela (DOM)
            </span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {report?.dom.domElementsCount || 0}
              <span className="text-xs font-normal text-slate-500 ml-1">nós</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {(report?.dom.domElementsCount || 0) < 2500
                ? "Densidade ideal de elementos para rolagem rápida."
                : "Atenção: Muitos elementos na tela. Mantenha paginação ativa."}
            </p>
            <div className="mt-2 text-[10px] text-slate-400">
              Paginação de 100 CNHs por página ativa.
            </div>
          </div>
        </div>

        {/* 4. Armazenamento Síncrono (LocalStorage) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Uso do LocalStorage
            </span>
            <div className="p-2 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-lg">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {report?.storage.localStorageUsedKB || 0}{" "}
              <span className="text-xs font-normal text-slate-500">KB</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Cota utilizada (~5MB):</span>
              <span className="font-mono font-semibold">
                {report?.storage.localStoragePercent || 0}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-purple-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, report?.storage.localStoragePercent || 0)}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Base pesada reside no IndexedDB assíncrono.
            </div>
          </div>
        </div>
      </div>

      {/* Seção Central: Diagnósticos Detalhados com Recomendações */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-blue-600" />
              Auditoria de Gargalos & Fatores de Desempenho
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Análise técnica automatizada de cada subsistema da aplicação
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-500">
            {report?.diagnostics.length || 0} itens verificados
          </span>
        </div>

        <div className="space-y-3">
          {report?.diagnostics.map((diag) => {
            const isSuccess = diag.severity === "success";
            const isWarning = diag.severity === "warning";
            const isDanger = diag.severity === "danger";

            return (
              <div
                key={diag.id}
                className={`p-4 rounded-xl border transition-all ${
                  isSuccess
                    ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/40"
                    : isWarning
                    ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900/40"
                    : isDanger
                    ? "bg-red-50/40 dark:bg-red-950/20 border-red-200/70 dark:border-red-900/40"
                    : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {isWarning && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
                      {isDanger && <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />}
                      {!isSuccess && !isWarning && !isDanger && (
                        <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {diag.title}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {diag.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {diag.description}
                      </p>
                      <div className="pt-1.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-[11px]">
                        <span className="text-slate-500">
                          <strong className="text-slate-700 dark:text-slate-300">Impacto:</strong>{" "}
                          {diag.impact}
                        </span>
                        <span className="text-blue-700 dark:text-blue-400 font-medium">
                          <strong>Recomendação:</strong> {diag.recommendation}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cartão de Dicas Práticas para o Operador */}
      <div className="bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-200/80 dark:border-blue-900/60 p-5 text-xs text-slate-700 dark:text-slate-300 space-y-3">
        <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-200">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Medidas de Otimização Aplicadas no Sistema para Eliminar Lentidão:
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-1">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong>Timer de Sessão Desacoplado:</strong> A contagem de 30 minutos de inatividade foi isolada em micro-componente, impedindo que telas com milhares de CNHs re-renderizassem 60 vezes por minuto.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong>I/O Assíncrono no IndexedDB:</strong> Os dados de CNHs são manipulados pelo Dexie DB em segundo plano, sem travar o congelamento síncrono da aba no LocalStorage.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong>Throttling de Telemetria:</strong> O salvamento de logs de rede foi debounced com limite de 1s para evitar sobrecarga de escrita em disco.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong>Dica de Hardware:</strong> Certifique-se de que a opção <em>"Usar aceleração de hardware quando disponível"</em> nas configurações do Chrome/Edge esteja ativada no seu computador.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
