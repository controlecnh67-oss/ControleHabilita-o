import React, { useState, useEffect } from "react";
import { ShieldAlert, Search, Lock, User, Clock, Database, Activity, FileText, RefreshCw } from "lucide-react";
import { RegistroAuditoria } from "../types";
import { getAuditoriaList } from "../services/db";
import { formatDateTime } from "../lib/utils";

export const AuditoriaPage: React.FC = () => {
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroAcao, setFiltroAcao] = useState<string>("todas");
  const [filtroTabela, setFiltroTabela] = useState<string>("todas");

  const fetchDados = async () => {
    setLoading(true);
    try {
      const data = await getAuditoriaList();
      setAuditoria(data);
    } catch (err) {
      console.error("Erro ao buscar auditoria:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();

    const handleSync = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (!customEvt.detail || customEvt.detail.type === "all" || customEvt.detail.type === "auditoria") {
        fetchDados();
      }
    };

    window.addEventListener("detran_sync_updated", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("detran_sync_updated", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const filtered = auditoria.filter((a) => {
    const matchSearch =
      (a.tabela && a.tabela.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (a.registro_id && a.registro_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (a.usuario_nome && a.usuario_nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (a.ip && a.ip.includes(searchTerm)) ||
      (a.valores_novos && JSON.stringify(a.valores_novos).toLowerCase().includes(searchTerm.toLowerCase()));

    const matchAcao = filtroAcao === "todas" || a.acao === filtroAcao;
    const matchTabela = filtroTabela === "todas" || a.tabela === filtroTabela;

    return matchSearch && matchAcao && matchTabela;
  });

  const getAcaoBadge = (acao: string) => {
    switch (acao) {
      case "Inclusão":
      case "Remessa":
      case "Recebimento":
      case "Entrega":
        return "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800";
      case "Alteração":
        return "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800";
      case "Exclusão":
        return "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800";
      case "Login":
      case "Logout":
        return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-blue-600" />
            Trilha de Auditoria Geral (Logs Inalteráveis)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              Todos os acessos e modificações de dados são rastreados para garantia de integridade do protocolo.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar por tabela, ID, usuário, IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all w-full sm:w-60"
            />
          </div>

          <select
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
          >
            <option value="todas">Todas as Ações</option>
            <option value="Login">Login</option>
            <option value="Logout">Logout</option>
            <option value="Inclusão">Inclusão</option>
            <option value="Alteração">Alteração</option>
            <option value="Exclusão">Exclusão</option>
            <option value="Remessa">Remessa</option>
            <option value="Recebimento">Recebimento</option>
            <option value="Entrega">Entrega</option>
          </select>

          <select
            value={filtroTabela}
            onChange={(e) => setFiltroTabela(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-hidden"
          >
            <option value="todas">Todas as Tabelas</option>
            <option value="autenticacao">Autenticação</option>
            <option value="geral">Geral (CNHs)</option>
            <option value="memorandos">Memorandos</option>
            <option value="candidatos">Candidatos</option>
            <option value="responsaveis">Responsáveis</option>
            <option value="mapeamento_localizacao">Mapeamento A-Z</option>
            <option value="usuarios">Usuários</option>
          </select>

          <button
            onClick={fetchDados}
            disabled={loading}
            title="Recarregar Auditoria"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabela de Auditoria */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Carregando trilha de auditoria...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Nenhum evento de auditoria encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-3.5 px-6">Data / Hora</th>
                  <th className="py-3.5 px-6">Tipo de Ação</th>
                  <th className="py-3.5 px-6">Módulo / Tabela</th>
                  <th className="py-3.5 px-6">ID Rastreio</th>
                  <th className="py-3.5 px-6">Usuário Operador</th>
                  <th className="py-3.5 px-6">Endereço IP</th>
                  <th className="py-3.5 px-6">Dados da Operação</th>
                  <th className="py-3.5 px-6 w-16 text-center">Proteção</th>
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

                    <td className="py-3.5 px-6 font-semibold">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getAcaoBadge(item.acao)}`}>
                        {item.acao}
                      </span>
                    </td>

                    <td className="py-3.5 px-6 font-mono font-bold text-slate-800 dark:text-slate-200 uppercase">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.tabela}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-6 font-mono text-[11px] text-slate-500 max-w-[120px] truncate" title={item.registro_id}>
                      {item.registro_id || "-"}
                    </td>

                    <td className="py-3.5 px-6 font-semibold text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.usuario_nome}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-6 font-mono text-slate-500">
                      {item.ip || "127.0.0.1"}
                    </td>

                    <td className="py-3.5 px-6 max-w-sm">
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200/80 dark:border-slate-700/60 font-mono max-h-16 overflow-y-auto">
                        {item.valores_novos ? (
                          <span>Novo: {JSON.stringify(item.valores_novos).slice(0, 100)}...</span>
                        ) : item.valores_anteriores ? (
                          <span>Antigo: {JSON.stringify(item.valores_anteriores).slice(0, 100)}...</span>
                        ) : (
                          <span className="text-slate-400 italic">Sessão / Operação de Sistema</span>
                        )}
                      </div>
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
