import React, { useState, useEffect, useMemo } from "react";
import { 
  Archive, 
  Layers, 
  ChevronRight, 
  FolderArchive, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  Hash,
  Sparkles,
  LayoutGrid,
  X,
  Search,
  FileText,
  User,
  Calendar
} from "lucide-react";
import { MapaArquivoFisico, MapaGavetaItem, MapaReparticaoItem, GeralCNH } from "../types";
import { getGeralCNHs } from "../services/db";
import { formatDateTime } from "../lib/utils";

interface Props {
  data?: MapaArquivoFisico;
  onSelectReparticao?: (gavetaNum: number, reparticaoNum: number) => void;
}

export const MapaArquivoFisicoCard: React.FC<Props> = ({ data, onSelectReparticao }) => {
  const [gavetaFiltro, setGavetaFiltro] = useState<number | "todas">("todas");
  const [reparticaoHover, setReparticaoHover] = useState<{ gavetaNum: number; repNum: number } | null>(null);

  // Estado para o Modal de Inspeção de CNHs da Repartição
  const [modalReparticao, setModalReparticao] = useState<{
    gavetaNum: number;
    repNum: number;
    iniciais: string[];
    total: number;
  } | null>(null);

  const [loadingCNHs, setLoadingCNHs] = useState(false);
  const [cnhsReparticao, setCnhsReparticao] = useState<GeralCNH[]>([]);
  const [filtroBusca, setFiltroBusca] = useState("");

  // Carregar CNHs quando o modal for aberto
  useEffect(() => {
    if (!modalReparticao) {
      setCnhsReparticao([]);
      setFiltroBusca("");
      return;
    }

    let isMounted = true;
    setLoadingCNHs(true);

    const carregar = async () => {
      try {
        const todas = await getGeralCNHs();
        if (!isMounted) return;

        const parseNum = (val?: string) => {
          if (!val) return null;
          const m = String(val).match(/(\d+)/);
          return m ? parseInt(m[1], 10) : null;
        };

        const filtradas = todas.filter((c) => {
          if (c.situacao !== "Recebida") return false;
          let g = parseNum(c.gaveta);
          let r = parseNum(c.reparticao);

          // Se faltar gaveta/repartição mas tiver inicial correspondente
          if ((!g || !r) && c.nome && modalReparticao.iniciais.length > 0) {
            const init = c.nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()[0];
            if (modalReparticao.iniciais.includes(init)) {
              return true;
            }
          }

          return g === modalReparticao.gavetaNum && r === modalReparticao.repNum;
        });

        setCnhsReparticao(filtradas);
      } catch (err) {
        console.error("Erro ao carregar CNHs da repartição:", err);
      } finally {
        if (isMounted) setLoadingCNHs(false);
      }
    };

    carregar();

    return () => {
      isMounted = false;
    };
  }, [modalReparticao]);

  const cnhsFiltradasBusca = useMemo(() => {
    if (!filtroBusca.trim()) return cnhsReparticao;
    const term = filtroBusca.toLowerCase().trim();
    return cnhsReparticao.filter(
      (c) =>
        c.nome.toLowerCase().includes(term) ||
        (c.cpf && c.cpf.includes(term)) ||
        (c.ordem && String(c.ordem).includes(term))
    );
  }, [cnhsReparticao, filtroBusca]);

  if (!data) return null;

  const gavetasFiltradas = gavetaFiltro === "todas" 
    ? data.gavetas 
    : data.gavetas.filter((g) => g.numero === gavetaFiltro);

  const handleAbrirReparticao = (gavetaNum: number, rep: MapaReparticaoItem) => {
    setModalReparticao({
      gavetaNum,
      repNum: rep.numero,
      iniciais: rep.iniciais,
      total: rep.total
    });
    if (onSelectReparticao) {
      onSelectReparticao(gavetaNum, rep.numero);
    }
  };

  // Helper para cor de intensidade da repartição com base na quantidade
  const getReparticaoColor = (total: number) => {
    if (total === 0) {
      return {
        bg: "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500",
        badge: "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700",
        bar: "bg-slate-300 dark:bg-slate-700",
        tag: "Vazio"
      };
    }
    if (total <= 15) {
      return {
        bg: "bg-blue-50/70 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 text-blue-950 dark:text-blue-200 hover:border-blue-300 dark:hover:border-blue-700",
        badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
        bar: "bg-blue-500",
        tag: "Baixo"
      };
    }
    if (total <= 35) {
      return {
        bg: "bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200 hover:border-indigo-300 dark:hover:border-indigo-700",
        badge: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700",
        bar: "bg-indigo-500",
        tag: "Médio"
      };
    }
    return {
      bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 text-purple-950 dark:text-purple-200 hover:border-purple-400 dark:hover:border-purple-600 shadow-sm",
      badge: "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-200 border-purple-300 dark:border-purple-700",
      bar: "bg-purple-600",
      tag: "Alto"
    };
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm p-5 transition-all">
      {/* Cabeçalho do Mapa Físico */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                Mapa Visual do Arquivo Físico
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  4 Gavetas × 8 Repartições (32 Compartimentos)
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Alocação espacial e contagem das CNHs com situação <strong>Recebida</strong> no arquivo físico de aço do protocolo.
              </p>
            </div>
          </div>
        </div>

        {/* Resumo Rápido das 4 Gavetas */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Estoque em Gavetas</span>
            <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">{data.totalFisico} CNHs</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Ocupação das Repartições</span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {data.reparticoesComCNH} / {data.totalCompartimentos} <span className="text-xs font-medium text-slate-400">({Math.round((data.reparticoesComCNH / data.totalCompartimentos) * 100)}%)</span>
            </span>
          </div>
          {data.gavetaMaiorVolume && (
            <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Maior Volume</span>
              <span className="text-sm font-extrabold text-purple-600 dark:text-purple-400">
                {data.gavetaMaiorVolume.nome} ({data.gavetaMaiorVolume.total})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Legenda */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-slate-100 dark:border-slate-800/60">
        {/* Seletor de Gaveta */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
            <LayoutGrid className="w-3.5 h-3.5" />
            Filtrar Gaveta:
          </span>
          <button
            onClick={() => setGavetaFiltro("todas")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              gavetaFiltro === "todas"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Todas (Visão Completa)
          </button>
          {data.gavetas.map((g) => (
            <button
              key={g.numero}
              onClick={() => setGavetaFiltro(g.numero)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                gavetaFiltro === g.numero
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>{g.nome}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                gavetaFiltro === g.numero ? "bg-blue-700 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}>
                {g.total}
              </span>
            </button>
          ))}
        </div>

        {/* Legenda de Densidade */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-400">Legenda:</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 inline-block" />
            Vazio (0)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-300 dark:bg-blue-700 inline-block" />
            Baixo (1-15)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 dark:bg-indigo-600 inline-block" />
            Médio (16-35)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-600 dark:bg-purple-700 inline-block" />
            Alto (&gt;35)
          </span>
        </div>
      </div>

      {/* Grid de Gavetas Físicas */}
      <div className="mt-4 space-y-4">
        {gavetasFiltradas.map((gaveta) => (
          <div
            key={gaveta.numero}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 transition-all shadow-xs"
          >
            {/* Topo Estilizado da Gaveta (Efeito Puxador e Etiqueta Metálica do Arquivo) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {/* Puxador Metálico Decorativo */}
                <div className="w-9 h-6 bg-gradient-to-b from-slate-200 to-slate-400 dark:from-slate-700 dark:to-slate-800 rounded border border-slate-300 dark:border-slate-600 flex items-center justify-center shadow-inner shrink-0">
                  <div className="w-5 h-1.5 bg-slate-100 dark:bg-slate-900 rounded-xs shadow-xs" />
                </div>

                {/* Etiqueta de Identificação da Gaveta */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tracking-widest uppercase text-slate-800 dark:text-slate-100 font-mono">
                      {gaveta.nome}
                    </span>
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                      {gaveta.total} CNHs físicas
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      ({gaveta.percentualTotal}% do estoque geral)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    8 repartições organizadoras internas (Pastas suspensas de 1 a 8)
                  </p>
                </div>
              </div>

              {/* Barra de Distribuição da Gaveta */}
              <div className="flex items-center gap-3 w-full sm:w-56">
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (gaveta.total / (data.totalFisico || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 font-mono shrink-0">
                  {gaveta.total} un.
                </span>
              </div>
            </div>

            {/* As 8 Repartições da Gaveta (Grid 8 colunas ou 4x2 responsivo) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {gaveta.reparticoes.map((rep) => {
                const colors = getReparticaoColor(rep.total);
                const isHovered = reparticaoHover?.gavetaNum === gaveta.numero && reparticaoHover?.repNum === rep.numero;

                return (
                  <div
                    key={rep.numero}
                    onMouseEnter={() => setReparticaoHover({ gavetaNum: gaveta.numero, repNum: rep.numero })}
                    onMouseLeave={() => setReparticaoHover(null)}
                    onClick={() => handleAbrirReparticao(gaveta.numero, rep)}
                    className={`relative rounded-lg border p-3 flex flex-col justify-between transition-all cursor-pointer select-none ${colors.bg} ${
                      isHovered ? "ring-2 ring-blue-500 dark:ring-blue-400 scale-[1.02] z-10" : ""
                    }`}
                  >
                    {/* Topo da Repartição: Número e Letras */}
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide opacity-80">
                        Rep. {rep.numero}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${colors.badge}`}>
                        {colors.tag}
                      </span>
                    </div>

                    {/* Letras / Iniciais Mapeadas */}
                    <div className="min-h-[22px] flex items-center flex-wrap gap-1 mb-2">
                      {rep.iniciais.length > 0 ? (
                        rep.iniciais.map((letra, lIdx) => (
                          <span
                            key={lIdx}
                            className="inline-block text-[11px] font-black px-1.5 py-0.2 bg-white/80 dark:bg-slate-900/80 rounded border border-slate-200 dark:border-slate-700 shadow-2xs font-mono text-slate-800 dark:text-slate-200"
                            title={`Inicial atendida: ${letra}`}
                          >
                            {letra}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">sem letra</span>
                      )}
                    </div>

                    {/* Quantidade em Destaque Grande */}
                    <div className="my-1 flex items-baseline justify-between">
                      <div>
                        <span className="text-xl font-black tracking-tight font-mono">
                          {rep.total}
                        </span>
                        <span className="text-[10px] opacity-70 ml-1 font-semibold">CNHs</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {rep.percentualGaveta}%
                      </span>
                    </div>

                    {/* Mini barra de preenchimento */}
                    <div className="w-full bg-slate-200/70 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full ${colors.bar} transition-all duration-300`}
                        style={{ width: `${Math.min(100, (rep.total / (gaveta.total || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Alerta caso existam CNHs com status "Recebida" aguardando definição física */}
      {data.outrasNaoAlocadas > 0 && (
        <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Atenção:</strong> Existem <strong>{data.outrasNaoAlocadas} CNHs recebidas</strong> com dados de gaveta ou repartição ainda não associados à grade 4×8.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 underline cursor-pointer">
            Verificar em Geral
          </span>
        </div>
      )}

      {/* Modal de Inspeção das CNHs da Repartição */}
      {modalReparticao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    Gaveta {modalReparticao.gavetaNum} • Repartição {modalReparticao.repNum}
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                      {cnhsReparticao.length} CNHs em estoque
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {modalReparticao.iniciais.length > 0 
                      ? `Iniciais alfabéticas atendidas: [ ${modalReparticao.iniciais.join(", ")} ]`
                      : "Sem letras exclusivas configuradas"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalReparticao(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Barra de Busca Rápida */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, CPF ou ordem nesta repartição..."
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {filtroBusca && (
                <button
                  onClick={() => setFiltroBusca("")}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Lista de CNHs */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100 dark:divide-slate-800">
              {loadingCNHs ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Localizando CNHs físicas...</span>
                </div>
              ) : cnhsFiltradasBusca.length > 0 ? (
                cnhsFiltradasBusca.map((cnh) => (
                  <div key={cnh.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono font-bold flex items-center justify-center text-[10px] shrink-0">
                        {cnh.ordem || "•"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {cnh.nome}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          CPF: {cnh.cpf || "Não informado"} {cnh.pa ? `• PA: ${cnh.pa}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50">
                        Recebida
                      </span>
                      {cnh.data_movimento && (
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {formatDateTime(cnh.data_movimento)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <FolderArchive className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    {filtroBusca ? "Nenhuma CNH encontrada para a busca." : "Nenhuma CNH física nesta repartição no momento."}
                  </p>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                Exibindo <strong>{cnhsFiltradasBusca.length}</strong> de {cnhsReparticao.length} CNHs físicas
              </span>
              <button
                onClick={() => setModalReparticao(null)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md font-semibold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
