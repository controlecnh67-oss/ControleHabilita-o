import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  FileText,
  Plus,
  Search,
  FileDown,
  Eye,
  Edit2,
  Trash2,
  Users,
  CreditCard,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Building2,
  UserCheck,
  Filter,
  X
} from "lucide-react";
import { Declaracao } from "../types";
import {
  getDeclaracoes,
  deleteDeclaracao
} from "../services/db";
import { useAuth } from "../context/AuthContext";
import { DeclaracaoModal } from "../components/declaracoes/DeclaracaoModal";
import { DeclaracaoViewModal } from "../components/declaracoes/DeclaracaoViewModal";
import { downloadDeclaracaoPDF, formatCPFDisplay } from "../services/declaracaoPdfService";
import { subscribeToSupabaseRealtime } from "../services/supabase";

export const DeclaracoesPage: React.FC = () => {
  const { user, canEdit } = useAuth();

  const [declaracoes, setDeclaracoes] = useState<Declaracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAno, setSelectedAno] = useState<string>("todos");
  
  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [declaracaoToEdit, setDeclaracaoToEdit] = useState<Declaracao | null>(null);
  const [declaracaoToView, setDeclaracaoToView] = useState<Declaracao | null>(null);
  const [declaracaoToDelete, setDeclaracaoToDelete] = useState<Declaracao | null>(null);

  // Mensagens de feedback
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Carregamento de dados
  const fetchDados = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const data = await getDeclaracoes();
      setDeclaracoes(data);
    } catch (err) {
      console.error("Erro ao carregar declarações:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  const scheduleFetch = useCallback((delayMs = 150) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchDados(false);
    }, delayMs);
  }, [fetchDados]);

  useEffect(() => {
    fetchDados(true);

    const unsubRealtime = subscribeToSupabaseRealtime("declaracoes", () => {
      scheduleFetch(100);
    });

    const handleSync = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (!customEvt.detail || customEvt.detail.type === "all" || customEvt.detail.type === "declaracoes") {
        scheduleFetch(100);
      }
    };

    window.addEventListener("detran_sync_updated", handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      unsubRealtime();
      window.removeEventListener("detran_sync_updated", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [fetchDados, scheduleFetch]);

  // Lista de anos disponíveis para filtro
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    declaracoes.forEach((d) => {
      if (d.ano) set.add(String(d.ano));
      else if (d.numero && d.numero.includes("/")) {
        const p = d.numero.split("/")[1];
        if (p) set.add(p);
      }
    });
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [declaracoes]);

  // Filtragem de dados
  const filteredDeclaracoes = useMemo(() => {
    return declaracoes.filter((d) => {
      // Filtro por ano
      if (selectedAno !== "todos") {
        const anoMatch = String(d.ano) === selectedAno || d.numero.endsWith(`/${selectedAno}`);
        if (!anoMatch) return false;
      }

      // Filtro por texto
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");

      const numMatch = (d.numero || "").toLowerCase().includes(q);
      const procMatch = (d.procurador_nome || "").toLowerCase().includes(q);
      const procCpfMatch = qDigits && (d.procurador_cpf || "").replace(/\D/g, "").includes(qDigits);
      const procFoneMatch = qDigits && (d.procurador_telefone || "").replace(/\D/g, "").includes(qDigits);

      // Busca nos condutores relacionados
      const condMatch = d.condutores?.some((c) => {
        const cNome = (c.nome || "").toLowerCase().includes(q);
        const cCpf = qDigits && (c.cpf || "").replace(/\D/g, "").includes(qDigits);
        const cPa = (c.pa || "").toLowerCase().includes(q);
        return cNome || cCpf || cPa;
      });

      return numMatch || procMatch || procCpfMatch || procFoneMatch || condMatch;
    });
  }, [declaracoes, selectedAno, searchTerm]);

  // Estatísticas do topo
  const stats = useMemo(() => {
    const total = declaracoes.length;
    let totalCnhs = 0;
    const procuradoresUnicos = new Set<string>();
    const anoAtual = new Date().getFullYear();
    let totalAnoAtual = 0;

    declaracoes.forEach((d) => {
      totalCnhs += d.condutores?.length || 0;
      if (d.procurador_cpf) procuradoresUnicos.add(d.procurador_cpf);
      else if (d.procurador_nome) procuradoresUnicos.add(d.procurador_nome.toLowerCase());
      
      if (d.ano === anoAtual || d.numero.endsWith(`/${anoAtual}`)) {
        totalAnoAtual += 1;
      }
    });

    return {
      total,
      totalCnhs,
      totalProcuradores: procuradoresUnicos.size,
      totalAnoAtual
    };
  }, [declaracoes]);

  // Ações
  const handleOpenCreate = () => {
    setDeclaracaoToEdit(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (item: Declaracao) => {
    setDeclaracaoToEdit(item);
    setIsCreateModalOpen(true);
  };

  const handleOpenView = (item: Declaracao) => {
    setDeclaracaoToView(item);
  };

  const handleDownloadPdf = (item: Declaracao) => {
    try {
      downloadDeclaracaoPDF(item);
      setMessage({ type: "success", text: `PDF da Declaração nº ${item.numero} gerado com sucesso!` });
    } catch (err: any) {
      setMessage({ type: "error", text: "Erro ao gerar PDF da declaração." });
    }
  };

  const handleConfirmDelete = async () => {
    if (!declaracaoToDelete) return;
    try {
      await deleteDeclaracao(
        declaracaoToDelete.id,
        user?.id || "admin",
        user?.nome || "Operador"
      );
      setMessage({ type: "success", text: `Declaração nº ${declaracaoToDelete.numero} excluída com sucesso!` });
      setDeclaracaoToDelete(null);
      fetchDados();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro ao excluir declaração." });
    }
  };

  const handleSaveSuccess = (saved: Declaracao, downloadPdf?: boolean) => {
    fetchDados();
    setMessage({
      type: "success",
      text: `Declaração nº ${saved.numero} salva com sucesso!`
    });
    if (downloadPdf) {
      downloadDeclaracaoPDF(saved);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Mensagem de Feedback */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm font-medium">
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <span>Declarações de Retirada de CNH</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Formalização e controle de entrega de Carteiras de Habilitação a procuradores e responsáveis credenciados
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Declaração</span>
          </button>
        )}
      </div>

      {/* Cards de Métricas e Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
              Total de Declarações
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.total}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
              CNHs nas Declarações
            </span>
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.totalCnhs}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
              Procuradores Atendidos
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.totalProcuradores}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
              Emissões em {new Date().getFullYear()}
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.totalAnoAtual}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número (0109/2026), procurador, condutor ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Ano:</span>
            <select
              value={selectedAno}
              onChange={(e) => setSelectedAno(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos os Anos</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => fetchDados()}
            title="Atualizar lista"
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabela Principal de Declarações */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 w-32">Nº Declaração</th>
                <th className="py-3.5 px-4 w-28">Emissão</th>
                <th className="py-3.5 px-4">Procurador (Responsável)</th>
                <th className="py-3.5 px-4">Condutores / CNHs</th>
                <th className="py-3.5 px-4">Unidade / Gerente</th>
                <th className="py-3.5 px-4">Operador</th>
                <th className="py-3.5 px-4 text-center w-36">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Carregando declarações...
                  </td>
                </tr>
              ) : filteredDeclaracoes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <div>Nenhuma declaração encontrada.</div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                      >
                        Clique aqui para criar a primeira declaração
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredDeclaracoes.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Número */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                        {item.numero}
                      </span>
                    </td>

                    {/* Data */}
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 font-medium">
                      {item.data_emissao
                        ? item.data_emissao.split("-").reverse().join("/")
                        : "-"}
                    </td>

                    {/* Procurador */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs uppercase">
                        {item.procurador_nome}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>CPF: {formatCPFDisplay(item.procurador_cpf)}</span>
                        {item.procurador_telefone && <span>• {item.procurador_telefone}</span>}
                      </div>
                      {item.procurador_endereco && (
                        <div className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5" title={item.procurador_endereco}>
                          📍 {item.procurador_endereco}
                        </div>
                      )}
                    </td>

                    {/* Condutores */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {item.condutores?.length || 0} CNH(s)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 max-w-xs truncate" title={item.condutores?.map((c) => c.nome).join(", ")}>
                        {item.condutores?.map((c) => c.nome).join(", ") || "Sem condutores"}
                      </div>
                    </td>

                    {/* Gerente / Unidade */}
                    <td className="py-3.5 px-4 text-xs">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {item.gerente_nome || "Zedequias Carlos de Melo"}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.gerente_cargo || "Gerente DETRAN"} • {item.cidade || "Itaituba"}-{item.uf || "PA"}
                      </div>
                    </td>

                    {/* Operador */}
                    <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                      {item.usuario_nome || "Operador"}
                    </td>

                    {/* Ações */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(item)}
                          title="Baixar PDF Oficial"
                          className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition-colors"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenView(item)}
                          title="Visualizar documento"
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            title="Editar declaração"
                            className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setDeclaracaoToDelete(item)}
                            title="Excluir declaração"
                            className="p-1.5 text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      <DeclaracaoModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleSaveSuccess}
        declaracaoToEdit={declaracaoToEdit}
      />

      {/* Modal de Visualização da Declaração */}
      <DeclaracaoViewModal
        declaracao={declaracaoToView}
        isOpen={!!declaracaoToView}
        onClose={() => setDeclaracaoToView(null)}
        onEdit={(decl) => {
          setDeclaracaoToView(null);
          handleOpenEdit(decl);
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      {declaracaoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Excluir Declaração
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Deseja realmente excluir a Declaração <strong>nº {declaracaoToDelete.numero}</strong> referente ao procurador <strong>{declaracaoToDelete.procurador_nome}</strong>?
              Esta ação não pode ser desfeita.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeclaracaoToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
