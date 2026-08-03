import React, { useState, useEffect } from "react";
import { History, Search, ArrowRight, Lock, User, Clock, FileText, Calendar, Filter } from "lucide-react";
import { HistoricoMovimentacao, Responsavel } from "../types";
import { getHistoricoList, getResponsaveis } from "../services/db";
import { Badge } from "../components/ui/Badge";
import { formatDateTime, normalizeSearch } from "../lib/utils";

export const HistoricoPage: React.FC = () => {
  const [historico, setHistorico] = useState<HistoricoMovimentacao[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<string>("todas");

  const fetchDados = async () => {
    setLoading(true);
    try {
      const [data, dataResp] = await Promise.all([getHistoricoList(), getResponsaveis()]);
      setHistorico(data);
      setResponsaveis(dataResp);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    } finally {
      setLoading(false);
    }
  };

  const getRespName = (nome?: string, id?: string) => {
    if (!nome && !id) return "-";
    if (nome) {
      const matchById = responsaveis.find((r) => r.id === nome);
      if (matchById) return matchById.nome;
      const matchByName = responsaveis.find((r) => r.nome.trim().toLowerCase() === nome.trim().toLowerCase());
      if (matchByName) return matchByName.nome;
    }
    if (id) {
      const matchById = responsaveis.find((r) => r.id === id);
      if (matchById) return matchById.nome;
    }
    return nome && nome !== "-" ? nome : "-";
  };

  useEffect(() => {
    fetchDados();
  }, []);

  const normSearch = normalizeSearch(searchTerm);
  const filtered = historico.filter((h) => {
    const matchSearch =
      !normSearch ||
      normalizeSearch(h.geral_nome).includes(normSearch) ||
      (h.geral_ordem && h.geral_ordem.toString().includes(searchTerm.trim())) ||
      normalizeSearch(h.usuario_nome).includes(normSearch) ||
      normalizeSearch(h.responsavel_nome).includes(normSearch) ||
      normalizeSearch(h.observacao).includes(normSearch);

    const matchSituacao = filtroSituacao === "todas" || h.situacao_nova === filtroSituacao;
    return matchSearch && matchSituacao;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            Histórico Inalterável de Movimentações (CNHs)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Registro oficial e permanente do protocolo DETRAN. As exclusões são bloqueadas no banco de dados.</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar titular, ordem, operador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all w-full sm:w-64"
            />
          </div>

          <div className="relative">
            <select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value)}
              className="pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden appearance-none"
            >
              <option value="todas">Todas Situações</option>
              <option value="Remetida">Remetida</option>
              <option value="Recebida">Recebida</option>
              <option value="Pendente">Pendente</option>
              <option value="Entregue">Entregue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista / Timeline do Histórico */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Carregando registros de histórico...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">Nenhum histórico encontrado para os filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-3.5 px-6">Data e Hora</th>
                  <th className="py-3.5 px-6">CNH (Ordem / Titular)</th>
                  <th className="py-3.5 px-6">Movimentação de Status</th>
                  <th className="py-3.5 px-6">Responsável (Retirada)</th>
                  <th className="py-3.5 px-6">Operador DETRAN</th>
                  <th className="py-3.5 px-6">Observações</th>
                  <th className="py-3.5 px-6 w-20 text-center">Proteção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-6 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>{formatDateTime(item.data_hora)}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-6 font-bold text-slate-900 dark:text-white">
                      <span>Ordem #{item.geral_ordem}</span>
                      <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {item.geral_nome}
                      </span>
                    </td>

                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2">
                        {item.situacao_anterior ? (
                          <>
                            <Badge situacao={item.situacao_anterior} />
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Inclusão:</span>
                        )}
                        <Badge situacao={item.situacao_nova} />
                      </div>
                    </td>

                    <td className="py-3.5 px-6 font-medium text-slate-700 dark:text-slate-300">
                      {getRespName(item.responsavel_nome, item.responsavel_id)}
                    </td>

                    <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.usuario_nome}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={item.observacao}>
                      {item.observacao || "-"}
                    </td>

                    <td className="py-3.5 px-6 text-center">
                      <span className="inline-flex items-center justify-center p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500" title="Imutável por RLS e Triggers">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
