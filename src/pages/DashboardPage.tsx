import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  FolderArchive, 
  Send, 
  Inbox, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Users, 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  MapPin, 
  Layers,
  RefreshCw,
  Smartphone
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  CartesianGrid,
  AreaChart,
  Area
} from "recharts";
import { getDashboardStats } from "../services/db";
import { subscribeToMultipleSupabaseRealtime } from "../services/supabase";

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBackgroundFetching, setIsBackgroundFetching] = useState(false);

  const isFetchingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isInitial) {
      setLoading(true);
    } else {
      setIsBackgroundFetching(true);
    }

    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err);
    } finally {
      setLoading(false);
      setIsBackgroundFetching(false);
      isFetchingRef.current = false;
    }
  }, []);

  const scheduleFetch = useCallback((delayMs: number = 300) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchStats(false);
    }, delayMs);
  }, [fetchStats]);

  useEffect(() => {
    // 1. Carga inicial
    fetchStats(true);

    // 2. Realtime do Supabase (atualizações instantâneas de múltiplas tabelas em tempo real)
    const unsubRealtime = subscribeToMultipleSupabaseRealtime(
      ["geral_cnhs", "memorandos", "candidatos", "usuarios", "acessos_cidadao"],
      (table, payload) => {
        console.log(`⚡ [Realtime Dashboard] Mudança na tabela ${table}:`, payload);
        scheduleFetch(200);
      }
    );

    // 3. Eventos locais e entre abas
    const handleSync = () => {
      scheduleFetch(300);
    };

    window.addEventListener("detran_sync_updated", handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubRealtime();
      window.removeEventListener("detran_sync_updated", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [fetchStats, scheduleFetch]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-medium text-slate-500">Carregando painel de protocolo DETRAN...</p>
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Total de CNHs", value: stats.cards.totalGeral, icon: FolderArchive, labelColor: "text-slate-500", barColor: "bg-slate-800 dark:bg-slate-300", percent: 100 },
    { label: "Remetidas (Trânsito)", value: stats.cards.remetidas, icon: Send, labelColor: "text-amber-600 dark:text-amber-400", barColor: "bg-amber-500", percent: stats.cards.totalGeral ? Math.min(100, Math.round((stats.cards.remetidas / stats.cards.totalGeral) * 100)) : 0 },
    { label: "Recebidas (Em Gaveta)", value: stats.cards.recebidas, icon: Inbox, labelColor: "text-blue-600 dark:text-blue-400", barColor: "bg-blue-600", percent: stats.cards.totalGeral ? Math.min(100, Math.round((stats.cards.recebidas / stats.cards.totalGeral) * 100)) : 0 },
    { label: "Pendentes Alocação", value: stats.cards.pendentes, icon: AlertCircle, labelColor: "text-rose-600 dark:text-rose-400", barColor: "bg-rose-500", percent: stats.cards.totalGeral ? Math.min(100, Math.round((stats.cards.pendentes / stats.cards.totalGeral) * 100)) : 0 },
    { label: "Entregues ao Cidadão", value: stats.cards.entregues, icon: CheckCircle2, labelColor: "text-emerald-600 dark:text-emerald-400", barColor: "bg-emerald-600", percent: stats.cards.totalGeral ? Math.min(100, Math.round((stats.cards.entregues / stats.cards.totalGeral) * 100)) : 0 },
    { label: "Memorandos Ativos", value: stats.cards.memorandos, icon: FileText, labelColor: "text-purple-600 dark:text-purple-400", barColor: "bg-purple-600", percent: 100 },
    { label: "Usuários no Sistema", value: stats.cards.usuarios, icon: Users, labelColor: "text-indigo-600 dark:text-indigo-400", barColor: "bg-indigo-600", percent: 100 },
    { label: "Consultas App Público", value: stats.cards.consultasPublicas || 0, icon: Smartphone, labelColor: "text-teal-600 dark:text-teal-400", barColor: "bg-teal-500", percent: 100 },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho do Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Painel Geral de Controle de CNHs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Visão estatística em tempo real de remessas, recebimentos em gaveta e entregas ao titular.
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Total CNHs no Banco (Nuvem): {stats.cards.totalGeral.toLocaleString("pt-BR")}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              Total Acessos no Banco (Nuvem): {(stats.cards.consultasPublicas || 0).toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar Gráficos
        </button>
      </div>

      {/* Grid de Cartões de Métricas - High Density */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3.5">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <div className="flex items-start justify-between gap-1">
                <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${card.labelColor}`}>
                  {card.label}
                </span>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${card.labelColor}`} />
              </div>
              <div className="mt-1">
                <span className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white">
                  {typeof card.value === "number" ? card.value.toLocaleString("pt-BR") : card.value}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>{card.percent}% cap. / total</span>
              </div>
              <div className="mt-1.5 w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                <div className={`h-full ${card.barColor} transition-all duration-500`} style={{ width: `${card.percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráficos Linha 1: Situação + Movimentação Mensal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico de Situação (Pizza/Rosca) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-amber-500" />
                Distribuição por Situação
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Proporção atual de CNHs</p>
            </div>
          </div>
          <div className="flex-1 min-h-[260px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height={260}>
              <RechartsPieChart>
                <Pie
                  data={stats.chartSituacao}
                  dataKey="valor"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {stats.chartSituacao.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => [`${value} CNHs`, "Quantidade"]}
                  contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Movimentação Mensal (Área/Linha) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Evolução de Movimentações (Mensal)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Comparativo entre remessas recebidas e entregas ao titular</p>
            </div>
          </div>
          <div className="flex-1 min-h-[260px]">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.chartMensal} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRemessas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorEntregas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="mes" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "10px", color: "#fff", fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area type="monotone" dataKey="Remessas" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRemessas)" />
                <Area type="monotone" dataKey="Entregas" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorEntregas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Gráficos Linha 2: Gaveta + Repartição (Apenas CNHs Físicas Recebidas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico por Gaveta */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                Alocação por Gaveta (Recebidas)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Estoque físico de CNHs com status <strong>Recebida</strong> em cada gaveta</p>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 shrink-0">
              {stats.cards.recebidas} CNHs físicas
            </span>
          </div>
          <div className="min-h-[250px]">
            {stats.chartGaveta && stats.chartGaveta.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.chartGaveta} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-15} textAnchor="end" />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip 
                    formatter={(value) => [`${value} CNHs`, "Estoque Físico"]}
                    contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                  />
                  <Bar dataKey="quantidade" fill="#3b82f6" radius={[4, 4, 0, 0]} name="CNHs Físicas em Gaveta" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex flex-col items-center justify-center text-center p-4 text-slate-400 text-xs">
                <Inbox className="w-8 h-8 mb-2 text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">Nenhuma CNH recebida nas gavetas</p>
                <p className="text-[11px] text-slate-400 mt-0.5">As CNHs com situação &quot;Recebida&quot; aparecerão aqui contabilizadas por gaveta.</p>
              </div>
            )}
          </div>
        </div>

        {/* Gráfico por Repartição */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" />
                Alocação por Repartição (Recebidas)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Estoque físico de CNHs com status <strong>Recebida</strong> por repartição/pasta</p>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 shrink-0">
              {stats.cards.recebidas} CNHs físicas
            </span>
          </div>
          <div className="min-h-[250px]">
            {stats.chartReparticao && stats.chartReparticao.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.chartReparticao} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-15} textAnchor="end" />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip 
                    formatter={(value) => [`${value} CNHs`, "Estoque Físico"]}
                    contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                  />
                  <Bar dataKey="quantidade" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="CNHs Físicas por Repartição" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex flex-col items-center justify-center text-center p-4 text-slate-400 text-xs">
                <Layers className="w-8 h-8 mb-2 text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">Nenhuma CNH recebida por repartição</p>
                <p className="text-[11px] text-slate-400 mt-0.5">As CNHs com situação &quot;Recebida&quot; aparecerão aqui contabilizadas por repartição.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
