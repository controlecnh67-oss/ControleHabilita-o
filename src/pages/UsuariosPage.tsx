import React, { useState, useEffect } from "react";
import { Users, Plus, Search, Edit2, Trash2, ShieldCheck, CheckCircle2, Mail, Key, UserCheck, Eye, EyeOff, Lock, Shield } from "lucide-react";
import { Usuario, PerfilAcesso, UsuarioSchema, PERMISSOES_SISTEMA, getPermissoesPadrao } from "../types";
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario } from "../services/db";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { formatCPF, formatDate, normalizeSearch, matchDigitsSafe } from "../lib/utils";

export const UsuariosPage: React.FC = () => {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [nomeCurto, setNomeCurto] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<PerfilAcesso>("Operador");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchDados = async () => {
    setLoading(true);
    try {
      const data = await getUsuarios();
      setUsuarios(data);
    } catch (err) {
      console.error("Erro ao buscar usuários:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, []);

  const handleOpenModal = (item?: Usuario) => {
    setFormErrors({});
    setMessage(null);
    if (item) {
      setEditingUser(item);
      setNomeCompleto(item.nome_completo || item.nome || "");
      setNomeCurto(item.nome_curto || "");
      setCpf(item.cpf || "");
      setEmail(item.email || "");
      setPerfil(item.perfil || "Operador");
      setSenha(item.senha || "");
      setPermissoes(item.permissoes || getPermissoesPadrao(item.perfil || "Operador"));
    } else {
      setEditingUser(null);
      setNomeCompleto("");
      setNomeCurto("");
      setCpf("");
      setEmail("");
      setPerfil("Operador");
      setSenha("detran@123");
      setPermissoes(getPermissoesPadrao("Operador"));
    }
    setShowSenha(false);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormErrors({});
    setMessage(null);

    const loginVal = email.split("@")[0] || nomeCurto || "operador";
    const validation = UsuarioSchema.safeParse({
      nome: nomeCompleto,
      nome_completo: nomeCompleto,
      nome_curto: nomeCurto || nomeCompleto.split(" ")[0] || "Operador",
      cpf: formatCPF(cpf),
      email,
      login: loginVal,
      perfil,
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
      if (editingUser) {
        await updateUsuario(
          editingUser.id,
          {
            nome: nomeCompleto,
            nome_completo: nomeCompleto,
            nome_curto: nomeCurto || nomeCompleto.split(" ")[0],
            cpf: formatCPF(cpf),
            email,
            login: loginVal,
            perfil,
            senha: senha || "detran@123",
            permissoes,
          },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: "Usuário atualizado com sucesso!" });
      } else {
        await createUsuario(
          {
            nome: nomeCompleto,
            nome_completo: nomeCompleto,
            nome_curto: nomeCurto || nomeCompleto.split(" ")[0],
            cpf: formatCPF(cpf),
            email,
            login: loginVal,
            perfil,
            senha: senha || "detran@123",
            permissoes,
            ativo: true,
          },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: "Novo servidor cadastrado com sucesso!" });
      }
      setIsModalOpen(false);
      await fetchDados();
    } catch (err: any) {
      setFormErrors({ geral: err.message || "Erro ao salvar usuário." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: Usuario) => {
    if (!user) return;
    if (item.id === user.id) {
      alert("⚠️ Você não pode excluir ou inativar sua própria conta durante uma sessão ativa.");
      return;
    }
    if (confirm(`Deseja remover o acesso ao sistema do servidor "${item.nome_completo || item.nome}"?`)) {
      try {
        await deleteUsuario(item.id, user.id, user.nome_curto);
        setMessage({ type: "success", text: "Usuário removido com sucesso!" });
        await fetchDados();
      } catch (err: any) {
        alert(err.message || "Erro ao excluir usuário.");
      }
    }
  };

  const normSearch = normalizeSearch(searchTerm);
  const filtered = usuarios.filter(
    (u) =>
      !normSearch ||
      normalizeSearch(u.nome_completo || u.nome).includes(normSearch) ||
      normalizeSearch(u.nome_curto).includes(normSearch) ||
      normalizeSearch(u.email).includes(normSearch) ||
      matchDigitsSafe(u.cpf, searchTerm) ||
      (u.cpf && u.cpf.includes(searchTerm.trim())) ||
      normalizeSearch(u.perfil).includes(normSearch)
  );

  const getPerfilBadge = (perfil: PerfilAcesso) => {
    switch (perfil) {
      case "Administrador":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800";
      case "Supervisor":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800";
      case "Operador":
        return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700";
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Controle de Usuários e Perfis de Acesso
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gerenciamento de contas de servidores, atribuição de cargos e níveis de permissão (Supabase Auth).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar servidor, e-mail, perfil..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all w-full sm:w-64"
            />
          </div>

          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Servidor
          </button>
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

      {/* Tabela de Usuários */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Carregando usuários do sistema...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">Nenhum servidor encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-3.5 px-6">Servidor / Nome Curto</th>
                  <th className="py-3.5 px-6">E-mail (Supabase Login)</th>
                  <th className="py-3.5 px-6">CPF</th>
                  <th className="py-3.5 px-6">Perfil / Cargo</th>
                  <th className="py-3.5 px-6 w-32 text-center">Cadastro em</th>
                  <th className="py-3.5 px-6 w-28 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                          {u.nome_curto.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{u.nome_completo || u.nome}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">@{u.nome_curto}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-6 text-slate-600 dark:text-slate-300 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{u.email}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-6 font-mono text-slate-600 dark:text-slate-300">{u.cpf || "-"}</td>

                    <td className="py-3.5 px-6">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getPerfilBadge(u.perfil)}`}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{u.perfil}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-6 text-center text-slate-500">{formatDate(u.created_at)}</td>

                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenModal(u)}
                          title="Editar servidor"
                          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => handleDelete(u)}
                            title="Remover servidor"
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cadastro/Edição de Servidor */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? "Editar Conta de Servidor" : "Cadastrar Novo Servidor (Supabase Auth)"}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formErrors.geral && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-300 font-medium">
              {formErrors.geral}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo do Servidor <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={nomeCompleto}
              onChange={(e) => {
                setNomeCompleto(e.target.value);
                if (!editingUser && !nomeCurto) {
                  setNomeCurto(e.target.value.split(" ")[0]);
                }
              }}
              placeholder="ex: Carlos Eduardo Souza Mendes"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
            />
            {formErrors.nome_completo && <p className="text-[11px] text-rose-500 mt-1">{formErrors.nome_completo}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome Curto / Carimbo <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={nomeCurto}
                onChange={(e) => setNomeCurto(e.target.value)}
                placeholder="ex: Carlos Mendes"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
              {formErrors.nome_curto && <p className="text-[11px] text-rose-500 mt-1">{formErrors.nome_curto}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CPF do Servidor <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
              {formErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{formErrors.cpf}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                E-mail Institucional <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="servidor@detran.pa.gov.br"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
              {formErrors.email && <p className="text-[11px] text-rose-500 mt-1">{formErrors.email}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Perfil de Acesso e Permissões <span className="text-rose-500">*</span>
              </label>
              <select
                value={perfil}
                onChange={(e) => {
                  const val = e.target.value as PerfilAcesso;
                  setPerfil(val);
                  if (!editingUser) {
                    setPermissoes(getPermissoesPadrao(val));
                  }
                }}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              >
                <option value="Operador">👤 Operador (Protocolo Geral e Entrega)</option>
                <option value="Supervisor">🛡️ Supervisor (Acesso Amplo de Gestão)</option>
                <option value="Administrador">🔑 Administrador (Acesso Total ao Sistema)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Senha Temporária / Credencial <span className="text-slate-400 font-normal">(padrão: detran@123)</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type={showSenha ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="detran@123"
                className="w-full pl-10 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
              />
              <button
                type="button"
                onClick={() => setShowSenha(!showSenha)}
                className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title={showSenha ? "Ocultar senha" : "Ver senha"}
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Permissões Granulares no Sistema</span>
                </label>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {permissoes.length} de {PERMISSOES_SISTEMA.length} ativas
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPermissoes(PERMISSOES_SISTEMA.map(p => p.id))}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                >
                  Marcar Todas
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() => setPermissoes([])}
                  className="text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Desmarcar
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() => setPermissoes(getPermissoesPadrao(perfil))}
                  className="text-slate-500 dark:text-slate-400 hover:underline"
                >
                  Padrão do Perfil
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto p-2.5 bg-slate-50/80 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              {PERMISSOES_SISTEMA.map((item) => {
                const checked = permissoes.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      checked
                        ? "bg-blue-50/90 border-blue-300 dark:bg-blue-950/50 dark:border-blue-700 text-blue-950 dark:text-blue-100 shadow-xs"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setPermissoes(permissoes.filter(id => id !== item.id));
                        } else {
                          setPermissoes([...permissoes, item.id]);
                        }
                      }}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <div className="text-[11px] leading-tight flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="font-bold truncate">{item.label}</p>
                        {item.isTab && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                            Aba Menu
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider block mb-0.5">
                        {item.category}
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{item.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
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
              {submitting ? "Salvando..." : "Salvar Servidor"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
