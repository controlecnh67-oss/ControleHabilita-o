import React, { useState, useEffect } from "react";
import { Users, Plus, Search, Edit2, Trash2, Phone, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Responsavel, ResponsavelSchema } from "../types";
import { getResponsaveis, createResponsavel, updateResponsavel, deleteResponsavel } from "../services/db";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { formatCPF, formatPhone, formatDate, normalizeSearch, matchDigitsSafe } from "../lib/utils";

export const ResponsaveisPage: React.FC = () => {
  const { user, canEdit } = useAuth();
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Responsavel | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchDados = async () => {
    setLoading(true);
    try {
      const data = await getResponsaveis();
      setResponsaveis(data);
    } catch (err) {
      console.error("Erro ao buscar responsáveis:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, []);

  const handleOpenModal = (item?: Responsavel) => {
    setFormErrors({});
    setMessage(null);
    if (item) {
      setEditingItem(item);
      setNome(item.nome);
      setCpf(item.cpf);
      setTelefone(item.telefone || "");
      setObservacao(item.observacao || "");
    } else {
      setEditingItem(null);
      setNome("");
      setCpf("");
      setTelefone("");
      setObservacao("");
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormErrors({});
    setMessage(null);

    const validation = ResponsavelSchema.safeParse({
      nome,
      cpf: formatCPF(cpf),
      telefone: formatPhone(telefone),
      observacao,
      ativo: true,
    });

    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.issues.forEach((iss) => {
        if (iss.path[0]) errs[iss.path[0].toString()] = iss.message;
      });
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await updateResponsavel(
          editingItem.id,
          { nome, cpf: formatCPF(cpf), telefone: formatPhone(telefone), observacao },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: "Responsável atualizado com sucesso!" });
      } else {
        await createResponsavel(
          { nome, cpf: formatCPF(cpf), telefone: formatPhone(telefone), observacao, ativo: true },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: "Novo responsável cadastrado com sucesso!" });
      }
      setIsModalOpen(false);
      await fetchDados();
    } catch (err: any) {
      setFormErrors({ geral: err.message || "Erro ao salvar responsável." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: Responsavel) => {
    if (!user || !canEdit) return;
    if (item.nome === "Proprietário" || item.cpf === "000.000.000-00") {
      alert("⚠️ Ação não permitida: O registro padrão Proprietário não pode ser excluído.");
      return;
    }
    if (confirm(`Deseja realmente remover o responsável "${item.nome}"?`)) {
      try {
        await deleteResponsavel(item.id, user.id, user.nome_curto);
        setMessage({ type: "success", text: "Responsável excluído com sucesso!" });
        await fetchDados();
      } catch (err: any) {
        alert(err.message || "Erro ao excluir o registro.");
      }
    }
  };

  const normSearch = normalizeSearch(searchTerm);
  const filtered = responsaveis.filter(
    (r) =>
      !normSearch ||
      normalizeSearch(r.nome).includes(normSearch) ||
      matchDigitsSafe(r.cpf, searchTerm) ||
      (r.cpf && r.cpf.includes(searchTerm.trim())) ||
      matchDigitsSafe(r.telefone, searchTerm) ||
      (r.telefone && r.telefone.includes(searchTerm.trim()))
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Cadastro de Responsáveis e Procuradores (CFCs)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Controle de pessoas e despachantes autorizados a retirar CNHs no balcão de entrega.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar por Nome ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all w-full sm:w-64"
            />
          </div>

          {canEdit && (
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo Responsável
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-center gap-2 animate-fadeIn border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabela de Responsáveis */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Carregando responsáveis...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Nenhum responsável encontrado com os critérios de busca.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-3.5 px-6">Nome Completo / Instituição</th>
                  <th className="py-3.5 px-6">CPF / CNPJ</th>
                  <th className="py-3.5 px-6">Telefone</th>
                  <th className="py-3.5 px-6">Observações</th>
                  <th className="py-3.5 px-6 w-32 text-center">Cadastro em</th>
                  <th className="py-3.5 px-6 w-28 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filtered.map((r) => {
                  const isProprietario = r.nome === "Proprietário" || r.cpf === "000.000.000-00";
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span>{r.nome}</span>
                          {isProprietario && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              Padrão Intransferível
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 font-mono text-slate-600 dark:text-slate-300">{r.cpf}</td>
                      <td className="py-3.5 px-6 text-slate-600 dark:text-slate-300">
                        {r.telefone ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {r.telefone}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={r.observacao}>
                        {r.observacao || "-"}
                      </td>
                      <td className="py-3.5 px-6 text-center text-slate-500">{formatDate(r.created_at)}</td>
                      <td className="py-3.5 px-6 text-right">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenModal(r)}
                              title="Editar responsável"
                              disabled={isProprietario}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(r)}
                              title="Excluir responsável"
                              disabled={isProprietario}
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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

      {/* Modal de Cadastro/Edição de Responsável */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? "Editar Responsável / Despachante" : "Cadastrar Novo Responsável"}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formErrors.geral && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-300 font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{formErrors.geral}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo ou Razão Social <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Dr. Carlos Mendes ou CFC Transito Seguro"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            />
            {formErrors.nome && <p className="text-[11px] text-rose-500 mt-1">{formErrors.nome}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CPF ou CNPJ <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={18}
                disabled={editingItem?.nome === "Proprietário"}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all disabled:opacity-50"
              />
              {formErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{formErrors.cpf}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Telefone de Contato
              </label>
              <input
                type="text"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(67) 99999-9999"
                maxLength={15}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações (Procurações, autorizações, etc.)
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Informações adicionais sobre autorização de retirada no DETRAN..."
              rows={3}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Salvando..." : "Salvar Responsável"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
