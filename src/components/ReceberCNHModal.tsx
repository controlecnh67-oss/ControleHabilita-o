import React, { useState, useEffect } from "react";
import { FolderArchive, Layers, Sparkles, Inbox, AlertCircle } from "lucide-react";
import { Modal } from "./ui/Modal";
import { GeralCNH } from "../types";
import { formatCPF } from "../lib/utils";
import { DEFAULT_GAVETAS, DEFAULT_REPARTICOES } from "../lib/constants";
import { findLocalizacaoPorNome } from "../services/db";

interface ReceberCNHModalProps {
  isOpen: boolean;
  onClose: () => void;
  cnh: GeralCNH | null;
  onConfirm: (cnh: GeralCNH, gaveta?: string, reparticao?: string) => Promise<void>;
  submitting?: boolean;
}

export const ReceberCNHModal: React.FC<ReceberCNHModalProps> = ({
  isOpen,
  onClose,
  cnh,
  onConfirm,
  submitting = false,
}) => {
  const [escolhaManual, setEscolhaManual] = useState(false);
  const [sugestao, setSugestao] = useState<{ gaveta: string; reparticao: string }>({
    gaveta: "Vazio",
    reparticao: "Vazio",
  });
  const [gavetaManual, setGavetaManual] = useState<string>("Gaveta 1");
  const [reparticaoManual, setReparticaoManual] = useState<string>("Repartição 1");
  const [loadingSugestao, setLoadingSugestao] = useState(false);

  useEffect(() => {
    if (isOpen && cnh) {
      setEscolhaManual(false);
      setLoadingSugestao(true);
      findLocalizacaoPorNome(cnh.nome)
        .then((loc) => {
          setSugestao(loc);
          if (loc.gaveta && loc.gaveta !== "Vazio") {
            setGavetaManual(loc.gaveta);
          } else {
            setGavetaManual("Gaveta 1");
          }
          if (loc.reparticao && loc.reparticao !== "Vazio") {
            setReparticaoManual(loc.reparticao);
          } else {
            setReparticaoManual("Repartição 1");
          }
        })
        .finally(() => {
          setLoadingSugestao(false);
        });
    }
  }, [isOpen, cnh]);

  if (!cnh) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (escolhaManual) {
      await onConfirm(cnh, gavetaManual, reparticaoManual);
    } else {
      await onConfirm(cnh, undefined, undefined);
    }
  };

  const initialChar = cnh.nome.trim().charAt(0).toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📥 Recebimento de CNH no Protocolo"
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        {/* Identificação da CNH */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Condutor / Titular
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                {cnh.nome}
              </h3>
            </div>
            <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 font-mono text-xs font-bold rounded-lg shrink-0">
              Ordem #{cnh.ordem}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-medium">CPF</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {formatCPF(cnh.cpf)}
              </span>
            </div>
            {cnh.pa && (
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-medium">Processo (PA)</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{cnh.pa}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-medium">Situação Atual</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{cnh.situacao}</span>
            </div>
          </div>
        </div>

        {/* Escolha da Gaveta e Repartição */}
        <div className="p-4 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <FolderArchive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Destino do Documento no Estoque
            </h4>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={escolhaManual}
                onChange={(e) => setEscolhaManual(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 cursor-pointer"
              />
              <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                Ativar opção de escolha manual de gaveta e repartição
              </span>
            </label>
          </div>

          {!escolhaManual ? (
            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Mapeamento Automático (Inicial "{initialChar}")
                </span>
                {loadingSugestao && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 animate-pulse font-medium">
                    Calculando...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900 flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Gaveta Sugerida</span>
                    <strong className="text-slate-900 dark:text-white font-bold">{sugestao.gaveta}</strong>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Repartição Sugerida</span>
                    <strong className="text-slate-900 dark:text-white font-bold">{sugestao.reparticao}</strong>
                  </div>
                </div>
              </div>

              {sugestao.gaveta === "Vazio" && (
                <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Não há mapeamento cadastrado para a letra "{initialChar}". Ative a escolha manual acima para definir o local.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
                <span>Você ativou a escolha manual de gaveta e repartição para esta CNH.</span>
                <button
                  type="button"
                  onClick={() => {
                    if (sugestao.gaveta && sugestao.gaveta !== "Vazio") setGavetaManual(sugestao.gaveta);
                    if (sugestao.reparticao && sugestao.reparticao !== "Vazio") setReparticaoManual(sugestao.reparticao);
                  }}
                  className="text-[11px] underline font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 cursor-pointer shrink-0"
                >
                  Restaurar sugestão auto
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <FolderArchive className="w-3.5 h-3.5 text-blue-500" />
                    Gaveta
                  </label>
                  <select
                    value={gavetaManual}
                    onChange={(e) => setGavetaManual(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                  >
                    {DEFAULT_GAVETAS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    Repartição
                  </label>
                  <select
                    value={reparticaoManual}
                    onChange={(e) => setReparticaoManual(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                  >
                    {DEFAULT_REPARTICOES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé da Modal */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <Inbox className="w-4 h-4" />
            <span>{submitting ? "Processando..." : "Confirmar Recebimento"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
