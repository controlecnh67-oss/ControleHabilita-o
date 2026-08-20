import React, { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Edit3, Save, X, Search, Info, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { MapeamentoLocalizacao } from "../types";
import { getMapeamentos, updateMapeamento, createMapeamento, deleteMapeamento } from "../services/db";
import { subscribeToSupabaseRealtime } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { normalizeSearch } from "../lib/utils";

export const MapeamentoPage: React.FC = () => {
  const { user, canEdit } = useAuth();
  const [mapeamentos, setMapeamentos] = useState<MapeamentoLocalizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBackgroundFetching, setIsBackgroundFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGaveta, setEditGaveta] = useState("");
  const [editReparticao, setEditReparticao] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Estados para Modal de Adição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newInicial, setNewInicial] = useState("");
  const [newGaveta, setNewGaveta] = useState("Gaveta 1");
  const [newReparticao, setNewReparticao] = useState("Repartição 1");
  const [submitting, setSubmitting] = useState(false);

  const fetchDados = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isInitial) {
      setLoading(true);
    } else {
      setIsBackgroundFetching(true);
    }

    try {
      const data = await getMapeamentos();
      setMapeamentos(data);
    } catch (err) {
      console.error("Erro ao buscar mapeamentos:", err);
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
      fetchDados(false);
    }, delayMs);
  }, [fetchDados]);

  useEffect(() => {
    // 1. Carga inicial
    fetchDados(true);

    // 2. Realtime do Supabase (atualizações instantâneas de mapeamento de outros computadores)
    const unsubRealtime = subscribeToSupabaseRealtime("mapeamento_localizacao", (payload) => {
      console.log("⚡ [Realtime Mapeamento] Alteração detectada em mapeamento_localizacao:", payload);
      scheduleFetch(100);
    });

    // 3. Eventos locais e entre abas
    const handleSync = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (!customEvt.detail || customEvt.detail.type === "all" || customEvt.detail.type === "mapeamento") {
        scheduleFetch(100);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        scheduleFetch(200);
      }
    };

    // Polling suave de segurança a cada 30 segundos se a aba estiver visível
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        scheduleFetch(0);
      }
    }, 30000);

    window.addEventListener("detran_sync_updated", handleSync);
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubRealtime();
      clearInterval(intervalId);
      window.removeEventListener("detran_sync_updated", handleSync);
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [fetchDados, scheduleFetch]);

  const handleStartEdit = (item: MapeamentoLocalizacao) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setEditGaveta(item.gaveta);
    setEditReparticao(item.reparticao);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditGaveta("");
    setEditReparticao("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editGaveta.trim() || !editReparticao.trim()) {
      alert("Gaveta e Repartição não podem ficar em branco.");
      return;
    }
    try {
      await updateMapeamento(
        id,
        editGaveta.trim(),
        editReparticao.trim(),
        user?.id || "admin",
        user?.nome_curto || "Agente DETRAN"
      );
      setMessage("Mapeamento atualizado com sucesso! A regra será aplicada automaticamente no próximo recebimento.");
      setTimeout(() => setMessage(null), 4000);
      setEditingId(null);
      await fetchDados();
    } catch (err: any) {
      alert(err.message || "Erro ao salvar mapeamento");
    }
  };

  const handleOpenAddModal = () => {
    if (!canEdit) return;
    setNewInicial("");
    setNewGaveta("Gaveta 1");
    setNewReparticao("Repartição 1");
    setIsModalOpen(true);
  };

  const handleCreateMapeamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInicial.trim() || !newGaveta.trim() || !newReparticao.trim()) {
      alert("Preencha a inicial, gaveta e repartição.");
      return;
    }
    setSubmitting(true);
    try {
      await createMapeamento(
        newInicial.trim(),
        newGaveta.trim(),
        newReparticao.trim(),
        user?.id || "admin",
        user?.nome_curto || "Agente DETRAN"
      );
      setMessage(`✅ Regra de mapeamento para "${newInicial.trim().toUpperCase()}" cadastrada com sucesso!`);
      setTimeout(() => setMessage(null), 4000);
      setIsModalOpen(false);
      await fetchDados();
    } catch (err: any) {
      alert(err.message || "Erro ao cadastrar mapeamento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: MapeamentoLocalizacao) => {
    if (!canEdit) return;
    if (!confirm(`Tem certeza que deseja remover o mapeamento da inicial "${item.inicial}"?`)) return;
    try {
      await deleteMapeamento(
        item.id,
        user?.id || "admin",
        user?.nome_curto || "Agente DETRAN"
      );
      setMessage(`🗑️ Mapeamento "${item.inicial}" removido com sucesso.`);
      setTimeout(() => setMessage(null), 4000);
      await fetchDados();
    } catch (err: any) {
      alert(err.message || "Erro ao remover mapeamento.");
    }
  };

  const filtered = mapeamentos.filter(
    (m) =>
      m.inicial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.gaveta.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.reparticao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-600" />
            Mapeamento de Localização (A-Z)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure as regras automáticas de gaveta e repartição baseadas na letra inicial do nome do condutor.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar letra, gaveta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all w-full sm:w-64"
            />
          </div>

          {canEdit && (
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-2 text-xs transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Mapeamento</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      {/* Caixa de Regra de Negócio */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-2xl flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 dark:text-blue-200 space-y-1">
          <p className="font-semibold">Como funciona a alocação inteligente do DETRAN?</p>
          <p className="text-blue-800/80 dark:text-blue-300/80 leading-normal">
            Quando o operador clica no botão <strong>📥 Receber</strong> na tela Geral ou efetua o <strong>➕ Cadastro Manual</strong> como Recebida, o sistema consulta esta tabela ignorando maiúsculas/minúsculas e acentos (ex: &quot;Álvaro&quot; busca a letra A). Caso uma inicial não tenha mapeamento, o recebimento <strong>não é impedido</strong> e é registrado como <span className="underline font-bold">Gaveta: Vazio | Repartição: Vazio</span>, avisando o operador.
          </p>
        </div>
      </div>

      {/* Tabela de Mapeamentos */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Carregando tabela de alocação...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-3.5 px-6 w-24 text-center">Letra Inicial</th>
                  <th className="py-3.5 px-6">Gaveta Destino</th>
                  <th className="py-3.5 px-6">Repartição / Subdivisão</th>
                  <th className="py-3.5 px-6 w-32 text-center">Status</th>
                  <th className="py-3.5 px-6 w-32 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filtered.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-6 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-extrabold text-sm border border-blue-200 dark:border-blue-800">
                          {item.inicial}
                        </span>
                      </td>

                      {/* Coluna Gaveta */}
                      <td className="py-3 px-6 font-medium text-slate-900 dark:text-white">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editGaveta}
                            onChange={(e) => setEditGaveta(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-hidden"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                            {item.gaveta}
                          </span>
                        )}
                      </td>

                      {/* Coluna Repartição */}
                      <td className="py-3 px-6 font-medium text-slate-900 dark:text-white">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editReparticao}
                            onChange={(e) => setEditReparticao(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-hidden"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            {item.reparticao}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-6 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Ativo
                        </span>
                      </td>

                      {/* Ação */}
                      <td className="py-3 px-6 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(item.id)}
                              title="Salvar"
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              title="Cancelar"
                              className="p-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          canEdit && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleStartEdit(item)}
                                title="Editar regra de localização"
                                className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                title="Remover regra de localização"
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Adicionar Mapeamento */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Cadastrar Nova Regra de Mapeamento"
        maxWidth="sm"
      >
        <form onSubmit={handleCreateMapeamento} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-800 dark:text-blue-300">
            A inicial pode ser uma letra (ex: <strong>U</strong>, <strong>X</strong>) ou uma sequência de caracteres (ex: <strong>DR</strong> para prefixos específicos).
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Letra Inicial ou Prefixo <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newInicial}
              onChange={(e) => setNewInicial(e.target.value.toUpperCase())}
              placeholder="ex: U, X, W..."
              maxLength={4}
              required
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Gaveta Destino <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newGaveta}
                onChange={(e) => setNewGaveta(e.target.value)}
                placeholder="ex: Gaveta 4"
                required
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Repartição / Subdivisão <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newReparticao}
                onChange={(e) => setNewReparticao(e.target.value)}
                placeholder="ex: Repartição 8"
                required
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Cadastrando..." : "Cadastrar Mapeamento"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

