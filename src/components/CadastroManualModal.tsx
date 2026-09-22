import React, { useState, useEffect, useRef } from "react";
import { RotateCcw, Zap, Sparkles, FolderArchive, Layers } from "lucide-react";
import { Modal } from "./ui/Modal";
import { GeralCNH, SituacaoGeral, CadastroManualCNHSchema } from "../types";
import { formatCPF } from "../lib/utils";
import { DEFAULT_GAVETAS, DEFAULT_REPARTICOES } from "../lib/constants";
import { createGeralManual, findLocalizacaoPorNome } from "../services/db";

interface CadastroManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (nova: GeralCNH, situacao: SituacaoGeral) => void;
  user: { id: string; nome_curto: string } | null;
  initialData?: Partial<GeralCNH> | null;
  nextOrdem?: number;
}

export const CadastroManualModal: React.FC<CadastroManualModalProps> = React.memo(({
  isOpen,
  onClose,
  onSuccess,
  user,
  initialData,
  nextOrdem,
}) => {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [pa, setPa] = useState("");
  const [situacao, setSituacao] = useState<SituacaoGeral>("Recebida");
  const [escolhaManual, setEscolhaManual] = useState(false);
  const [gavetaManual, setGavetaManual] = useState("Gaveta 1");
  const [reparticaoManual, setReparticaoManual] = useState("Repartição 1");
  const [sugestaoAutomatica, setSugestaoAutomatica] = useState<{ gaveta: string; reparticao: string } | null>(null);
  const [observacao, setObservacao] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nomeInputRef = useRef<HTMLInputElement>(null);
  const cpfInputRef = useRef<HTMLInputElement>(null);

  // Auto-foco ao abrir a modal e preenchimento de dados (novo cadastro ou duplicação)
  useEffect(() => {
    if (isOpen) {
      setSuccessMsg(null);
      setErrors({});

      if (initialData) {
        setNome((initialData.nome || "").toUpperCase());
        setCpf(initialData.cpf ? formatCPF(initialData.cpf) : "");
        setPa(initialData.pa || "");
        setSituacao(initialData.situacao || "Recebida");
        const hasCustomLoc = Boolean(initialData.gaveta || initialData.reparticao);
        setEscolhaManual(hasCustomLoc);
        if (initialData.gaveta) setGavetaManual(initialData.gaveta);
        if (initialData.reparticao) setReparticaoManual(initialData.reparticao);
        setSugestaoAutomatica(null);
        setObservacao(initialData.observacao || (initialData.ordem ? `Duplicado a partir da CNH #${initialData.ordem}` : ""));
      } else {
        setNome("");
        setCpf("");
        setPa("");
        setSituacao("Recebida");
        setEscolhaManual(false);
        setGavetaManual("Gaveta 1");
        setReparticaoManual("Repartição 1");
        setSugestaoAutomatica(null);
        setObservacao("");
      }

      const timer = setTimeout(() => {
        nomeInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialData]);

  // Atualiza sugestão automática ao digitar nome (se não for escolha manual)
  useEffect(() => {
    const nomeTrim = nome.trim();
    if (nomeTrim.length > 0 && !escolhaManual) {
      findLocalizacaoPorNome(nomeTrim).then((loc) => {
        setSugestaoAutomatica(loc);
        if (loc.gaveta && loc.gaveta !== "Vazio") setGavetaManual(loc.gaveta);
        if (loc.reparticao && loc.reparticao !== "Vazio") setReparticaoManual(loc.reparticao);
      });
    } else if (!nomeTrim) {
      setSugestaoAutomatica(null);
    }
  }, [nome, escolhaManual]);

  const handleClearForm = () => {
    setNome("");
    setCpf("");
    setPa("");
    setObservacao("");
    setEscolhaManual(false);
    setSugestaoAutomatica(null);
    setErrors({});
    setSuccessMsg(null);
    setTimeout(() => {
      nomeInputRef.current?.focus();
    }, 40);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrors({});

    const nomeTrimmed = nome.trim().toUpperCase();
    const formattedCpf = formatCPF(cpf);
    const paClean = pa.trim().replace(/\D/g, "");
    const situacaoEscolhida = situacao;
    const obsEscolhida = observacao.trim();

    const validation = CadastroManualCNHSchema.safeParse({
      nome: nomeTrimmed,
      cpf: formattedCpf,
      pa: paClean || undefined,
      situacao: situacaoEscolhida,
      observacao: obsEscolhida,
    });

    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.issues.forEach((iss) => {
        if (iss.path[0]) errs[iss.path[0].toString()] = iss.message;
      });
      setErrors(errs);
      return;
    }

    // LIMPEZA IMEDIATA DO FORMULÁRIO para digitação ultra-rápida do próximo registro se não for entregue e nem duplicação
    if (situacaoEscolhida !== "Entregue" && !initialData) {
      setNome("");
      setCpf("");
      setPa("");
      setObservacao("");
      setErrors({});
      setSuccessMsg(`⚡ Cadastrando "${nomeTrimmed}"...`);
      setTimeout(() => {
        nomeInputRef.current?.focus();
      }, 40);
    }

    setSubmitting(true);
    try {
      const nova = await createGeralManual(
        {
          nome: nomeTrimmed,
          cpf: formattedCpf,
          pa: paClean || undefined,
          situacao: situacaoEscolhida,
          observacao: obsEscolhida,
          gaveta: escolhaManual ? gavetaManual : undefined,
          reparticao: escolhaManual ? reparticaoManual : undefined,
        },
        user.id,
        user.nome_curto
      );

      if (situacaoEscolhida === "Entregue") {
        onSuccess(nova, "Entregue");
        onClose();
      } else {
        const modoAloc = escolhaManual ? "Alocada manualmente" : "Alocada";
        const msg = `✅ CNH #${nova.ordem} ("${nova.nome}") cadastrada com sucesso! ${modoAloc} em: ${nova.gaveta || "Em Trânsito"} ${nova.reparticao}`;
        setSuccessMsg(msg);
        onSuccess(nova, situacaoEscolhida);
        if (initialData) {
          // Se for duplicação, fecha a modal após concluir
          setTimeout(() => {
            onClose();
          }, 600);
        }
      }
    } catch (err: any) {
      setErrors({ geral: err.message || "Erro ao cadastrar CNH" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? "📑 Duplicar CNH no Protocolo Geral" : "➕ Cadastro Manual de CNH no Protocolo"}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner de Duplicação ou Regras Gerais */}
        {initialData ? (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
              <span>📑 Modo de Duplicação de Registro</span>
              {nextOrdem && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono text-[11px] font-extrabold ml-auto">
                  Nova Ordem Prevista: #{nextOrdem}
                </span>
              )}
            </p>
            <p>
              As informações da CNH {initialData.ordem ? `(Origem #${initialData.ordem})` : ""} foram carregadas. Revise ou altere os campos desejados e confirme o novo cadastro.
            </p>
          </div>
        ) : (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-bold flex items-center justify-between">
              <span>⚡ Regras do Cadastro Manual DETRAN:</span>
              {nextOrdem && (
                <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono text-[11px] font-extrabold">
                  Próxima Ordem: #{nextOrdem}
                </span>
              )}
            </p>
            <p>1. A <strong>Ordem</strong> sequencial é gerada automaticamente pelo sistema.</p>
            <p>2. Se cadastrar como <strong>Recebida</strong>, a Gaveta e Repartição são calculadas automaticamente conforme a inicial do nome.</p>
            <p>3. Se cadastrar como <strong>Entregue</strong>, a modal de entrega será aberta em seguida para informar o responsável pela retirada.</p>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 font-bold flex items-center justify-between gap-2 shadow-2xs">
            <span>{successMsg}</span>
            <span className="text-[10px] bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 px-2 py-0.5 rounded-md uppercase font-extrabold shrink-0">
              Pronto p/ próximo
            </span>
          </div>
        )}

        {errors.geral && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
            {errors.geral}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nome Completo do Titular da CNH <span className="text-rose-500">*</span>
            </label>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Pressione <strong>Enter</strong> para ir ao CPF
            </span>
          </div>
          <input
            ref={nomeInputRef}
            type="text"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value.toUpperCase());
              if (errors.nome) setErrors((prev) => ({ ...prev, nome: "" }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                cpfInputRef.current?.focus();
              }
            }}
            placeholder="EX: MARIA FERNANDA GONÇALVES"
            className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden uppercase"
            autoComplete="off"
            spellCheck={false}
          />
          {errors.nome && <p className="text-[11px] text-rose-500 mt-1">{errors.nome}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                CPF do Titular <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                <strong>Enter</strong> cadastra
              </span>
            </div>
            <input
              ref={cpfInputRef}
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
              <span className="text-[10px] text-slate-400">Opcional</span>
            </div>
            <input
              type="text"
              value={pa}
              onChange={(e) => {
                setPa(e.target.value.replace(/\D/g, "").slice(0, 11));
              }}
              placeholder="ex: 123456789"
              maxLength={11}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Situação Inicial
            </label>
            <select
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as SituacaoGeral)}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            >
              <option value="Recebida">🔵 Recebida na Agência</option>
              <option value="Remetida">🟡 Remetida (Em trânsito)</option>
              <option value="Pendente">🔴 Pendente (Com exigência)</option>
              <option value="Entregue">🟢 Entregue diretamente ao cidadão</option>
            </select>
          </div>
        </div>

        {/* Bloco de Escolha Manual de Gaveta e Repartição */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={escolhaManual}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setEscolhaManual(checked);
                  if (checked && sugestaoAutomatica) {
                    if (sugestaoAutomatica.gaveta && sugestaoAutomatica.gaveta !== "Vazio") {
                      setGavetaManual(sugestaoAutomatica.gaveta);
                    }
                    if (sugestaoAutomatica.reparticao && sugestaoAutomatica.reparticao !== "Vazio") {
                      setReparticaoManual(sugestaoAutomatica.reparticao);
                    }
                  }
                }}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <FolderArchive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Ativar escolha manual de Gaveta e Repartição
              </span>
            </label>

            {sugestaoAutomatica && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Mapeamento Auto: <strong className="text-slate-700 dark:text-slate-300">{sugestaoAutomatica.gaveta} / {sugestaoAutomatica.reparticao}</strong>
              </span>
            )}
          </div>

          {escolhaManual ? (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <FolderArchive className="w-3.5 h-3.5 text-blue-500" />
                  Gaveta de Destino
                </label>
                <select
                  value={gavetaManual}
                  onChange={(e) => setGavetaManual(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                >
                  {DEFAULT_GAVETAS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  Repartição de Destino
                </label>
                <select
                  value={reparticaoManual}
                  onChange={(e) => setReparticaoManual(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                >
                  {DEFAULT_REPARTICOES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {situacao === "Recebida"
                ? "A alocação ocorrerá automaticamente com base no mapeamento da inicial do nome."
                : "A gaveta e repartição permanecerão em trânsito até o recebimento da CNH."}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Observações (Motivo do cadastro manual, carimbo, etc.)
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="ex: CNH devolvida pelos Correios / Entrega avulsa do CFC..."
            rows={3}
            className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={handleClearForm}
            title="Limpar todos os campos do formulário para digitar do zero"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Limpar Formulário</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              <span>
                {submitting
                  ? "Gravando..."
                  : initialData
                  ? "Confirmar Duplicação (Nova Ordem)"
                  : "Confirmar Cadastro"}
              </span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
});

CadastroManualModal.displayName = "CadastroManualModal";
