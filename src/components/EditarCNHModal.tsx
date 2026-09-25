import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "./ui/Modal";
import { GeralCNH, SituacaoGeral } from "../types";
import { formatCPF } from "../lib/utils";
import { DEFAULT_GAVETAS, DEFAULT_REPARTICOES } from "../lib/constants";

interface EditarCNHModalProps {
  isOpen: boolean;
  cnh: GeralCNH | null;
  onClose: () => void;
  onSave: (id: string, data: Partial<GeralCNH>) => Promise<void>;
}

export const EditarCNHModal: React.FC<EditarCNHModalProps> = React.memo(({
  isOpen,
  cnh,
  onClose,
  onSave,
}) => {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [pa, setPa] = useState("");
  const [lote, setLote] = useState("");
  const [situacao, setSituacao] = useState<SituacaoGeral>("Remetida");
  const [gaveta, setGaveta] = useState("");
  const [reparticao, setReparticao] = useState("");
  const [isCustomGaveta, setIsCustomGaveta] = useState(false);
  const [isCustomReparticao, setIsCustomReparticao] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const gavetaOptions = useMemo(() => {
    const list = [...DEFAULT_GAVETAS];
    if (cnh?.gaveta && !list.includes(cnh.gaveta)) {
      list.unshift(cnh.gaveta);
    }
    return list;
  }, [cnh?.gaveta]);

  const reparticaoOptions = useMemo(() => {
    const list = [...DEFAULT_REPARTICOES];
    if (cnh?.reparticao && !list.includes(cnh.reparticao)) {
      list.unshift(cnh.reparticao);
    }
    return list;
  }, [cnh?.reparticao]);

  useEffect(() => {
    if (isOpen && cnh) {
      setNome((cnh.nome || "").toUpperCase());
      setCpf(cnh.cpf ? formatCPF(cnh.cpf) : "");
      setPa(cnh.pa || "");
      setLote(cnh.lote || "");
      setSituacao(cnh.situacao);
      setGaveta(cnh.gaveta || "");
      setReparticao(cnh.reparticao || "");
      setIsCustomGaveta(false);
      setIsCustomReparticao(false);
      setObservacao(cnh.observacao || "");
      setErrors({});
      setSubmitting(false);
    }
  }, [isOpen, cnh]);

  if (!cnh) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const nomeTrimmed = nome.trim().toUpperCase();
    if (!nomeTrimmed || nomeTrimmed.length < 3) {
      setErrors((prev) => ({ ...prev, nome: "Nome do titular é obrigatório (mínimo 3 caracteres)." }));
      return;
    }

    const cleanCpfDigits = cpf.replace(/\D/g, "");
    if (cleanCpfDigits && cleanCpfDigits.length !== 11) {
      setErrors((prev) => ({ ...prev, cpf: "O CPF deve conter exatamente 11 dígitos." }));
      return;
    }

    const formattedCpf = cleanCpfDigits ? formatCPF(cleanCpfDigits) : "";
    const cleanPa = pa.replace(/\D/g, "").slice(0, 11);

    setSubmitting(true);
    try {
      await onSave(cnh.id, {
        nome: nomeTrimmed,
        cpf: formattedCpf,
        pa: cleanPa || "",
        lote: lote.trim() || undefined,
        situacao,
        gaveta,
        reparticao,
        observacao,
      });
      onClose();
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, geral: err.message || "Erro ao salvar alterações da CNH" }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar CNH / Alterar Situação"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Informações da Ordem e Origem */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-xs rounded-md">
              Ordem #{cnh.ordem}
            </span>
            {cnh.remessa && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Remessa: {cnh.remessa}
              </span>
            )}
          </div>
          {cnh.memorando_numero && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Memo: {cnh.memorando_numero}
            </span>
          )}
        </div>

        {errors.geral && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
            {errors.geral}
          </div>
        )}

        {/* Campo: Nome do Titular (em caixa alta) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Nome do Titular <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value.toUpperCase());
              if (errors.nome) setErrors((prev) => ({ ...prev, nome: "" }));
            }}
            placeholder="EX: KAUA OLIVEIRA DA SILVA"
            className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden uppercase"
            autoComplete="off"
            spellCheck={false}
          />
          {errors.nome && <p className="text-[11px] text-rose-500 mt-1">{errors.nome}</p>}
        </div>

        {/* Campo: CPF e PA */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              CPF do Titular
            </label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => {
                setCpf(formatCPF(e.target.value));
                if (errors.cpf) setErrors((prev) => ({ ...prev, cpf: "" }));
              }}
              placeholder="000.000.000-00"
              maxLength={14}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              autoComplete="off"
            />
            {errors.cpf && <p className="text-[11px] text-rose-500 mt-1">{errors.cpf}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Processo Adm. (PA)
              </label>
              <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
            </div>
            <input
              type="text"
              value={pa}
              onChange={(e) => {
                setPa(e.target.value.replace(/\D/g, "").slice(0, 11));
              }}
              placeholder="ex: 123456789"
              maxLength={11}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Campo: Lote e Situação */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lote
            </label>
            <input
              type="text"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="ex: Lote 01/2026"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Situação
            </label>
            <select
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as SituacaoGeral)}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
            >
              <option value="Remetida">🟡 Remetida (Em trânsito)</option>
              <option value="Recebida">🔵 Recebida na Agência</option>
              <option value="Pendente">🔴 Pendente (Com exigência / Bloqueada)</option>
              <option value="Entregue">🟢 Entregue</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Campo: Gaveta (Dropdown) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Gaveta
              </label>
              {isCustomGaveta && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomGaveta(false);
                    setGaveta(cnh.gaveta || "");
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                >
                  Voltar p/ lista
                </button>
              )}
            </div>

            {isCustomGaveta ? (
              <input
                type="text"
                value={gaveta}
                onChange={(e) => setGaveta(e.target.value)}
                placeholder="ex: Gaveta 1"
                autoFocus
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            ) : (
              <select
                value={gaveta}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setIsCustomGaveta(true);
                    setGaveta("");
                  } else {
                    setGaveta(e.target.value);
                  }
                }}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
              >
                <option value="">Selecione a Gaveta...</option>
                {gavetaOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__custom__">✏️ Outra gaveta (digitar)...</option>
              </select>
            )}
          </div>

          {/* Campo: Repartição (Dropdown) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Repartição
              </label>
              {isCustomReparticao && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomReparticao(false);
                    setReparticao(cnh.reparticao || "");
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                >
                  Voltar p/ lista
                </button>
              )}
            </div>

            {isCustomReparticao ? (
              <input
                type="text"
                value={reparticao}
                onChange={(e) => setReparticao(e.target.value)}
                placeholder="ex: Repartição 1"
                autoFocus
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            ) : (
              <select
                value={reparticao}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setIsCustomReparticao(true);
                    setReparticao("");
                  } else {
                    setReparticao(e.target.value);
                  }
                }}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer"
              >
                <option value="">Selecione a Repartição...</option>
                {reparticaoOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__custom__">✏️ Outra repartição (digitar)...</option>
              </select>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Observações
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Informações adicionais..."
            rows={3}
            className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md text-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </form>
    </Modal>
  );
});

EditarCNHModal.displayName = "EditarCNHModal";
