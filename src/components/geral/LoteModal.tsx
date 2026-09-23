import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Calendar,
  Layers,
  FileCheck,
  RotateCcw,
  Copy,
  Check
} from "lucide-react";
import { Lote, LoteInput } from "../../types";
import { getNextLoteNumero } from "../../services/db";

interface LoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LoteInput) => Promise<void>;
  loteToEdit?: Lote | null;
}

export const LoteModal: React.FC<LoteModalProps> = ({
  isOpen,
  onClose,
  onSave,
  loteToEdit
}) => {
  const [numero, setNumero] = useState<number | "">("");
  const [dataRecebimento, setDataRecebimento] = useState<string>("");
  const [documentosImpressos, setDocumentosImpressos] = useState<number | "">("");
  const [observacao, setObservacao] = useState<string>("");

  // Arquivo PDF
  const [pdfNome, setPdfNome] = useState<string | undefined>(undefined);
  const [pdfTamanho, setPdfTamanho] = useState<number | undefined>(undefined);
  const [pdfUrl, setPdfUrl] = useState<string | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    if (loteToEdit) {
      setNumero(loteToEdit.numero);
      setDataRecebimento(loteToEdit.data_recebimento);
      setDocumentosImpressos(loteToEdit.documentos_impressos);
      setObservacao(loteToEdit.observacao || "");
      setPdfNome(loteToEdit.pdf_nome);
      setPdfTamanho(loteToEdit.pdf_tamanho);
      setPdfUrl(loteToEdit.pdf_url);
    } else {
      // Novo lote
      const hoje = new Date().toISOString().split("T")[0];
      setDataRecebimento(hoje);
      setDocumentosImpressos("");
      setObservacao("");
      setPdfNome(undefined);
      setPdfTamanho(undefined);
      setPdfUrl(undefined);

      // Sugerir próximo número de lote automaticamente
      getNextLoteNumero().then((nextNum) => {
        setNumero(nextNum);
      }).catch(() => {
        setNumero(1);
      });
    }
  }, [isOpen, loteToEdit]);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    setError(null);
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Por favor, selecione um arquivo no formato PDF (.pdf).");
      return;
    }

    // Limite de 15MB para o arquivo
    if (file.size > 15 * 1024 * 1024) {
      setError("O arquivo PDF selecionado é muito grande. O limite máximo é de 15 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPdfUrl(result);
      setPdfNome(file.name);
      setPdfTamanho(file.size);
    };
    reader.onerror = () => {
      setError("Erro ao ler o arquivo PDF. Tente novamente.");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setPdfNome(undefined);
    setPdfTamanho(undefined);
    setPdfUrl(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const num = Number(numero);
    if (!numero || isNaN(num) || num <= 0) {
      setError("Informe um número de lote válido (maior que zero).");
      return;
    }

    if (!dataRecebimento) {
      setError("Informe a data de recebimento do lote.");
      return;
    }

    const docCount = Number(documentosImpressos);
    if (documentosImpressos === "" || isNaN(docCount) || docCount < 0) {
      setError("Informe a quantidade de documentos impressos (número maior ou igual a zero).");
      return;
    }

    setLoading(true);
    try {
      await onSave({
        numero: num,
        data_recebimento: dataRecebimento,
        documentos_impressos: docCount,
        pdf_nome: pdfNome,
        pdf_tamanho: pdfTamanho,
        pdf_url: pdfUrl,
        observacao: observacao.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar o lote. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {loteToEdit ? `Editar Lote #${loteToEdit.numero}` : "Novo Lote de CNHs"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadastro e controle de lotes recebidos com anexo de comprovante em PDF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl flex flex-col gap-2 text-red-700 dark:text-red-300 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {(error.includes("out of range") || error.includes("integer")) && (
                <div className="mt-1 pt-2 border-t border-red-200 dark:border-red-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-red-100/50 dark:bg-red-900/30 p-2 rounded-lg">
                  <span className="text-[11px] text-red-800 dark:text-red-200 font-medium">
                    A coluna no Supabase é INTEGER (máx ~2 bilhões). Altere para BIGINT:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText("ALTER TABLE public.lotes ALTER COLUMN numero TYPE BIGINT;");
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 2500);
                    }}
                    className="shrink-0 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? "Comando Copiado!" : "Copiar Comando SQL"}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Lote (número) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Lote (número) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={numero}
                  onChange={(e) => setNumero(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                  placeholder="Ex: 145"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden font-mono font-semibold"
                />
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">
                {typeof numero === "number" && numero > 2147483647
                  ? "Código/Identificador longo de remessa (suportado via BIGINT)"
                  : "Identificador sequencial do malote/remessa"}
              </span>
            </div>

            {/* Data de Recebimento */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Data de Recebimento <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setDataRecebimento(new Date().toISOString().split("T")[0])}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                >
                  Hoje
                </button>
              </div>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={dataRecebimento}
                  onChange={(e) => setDataRecebimento(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Documentos Impressos (número) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Documentos Impressos (número) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                required
                value={documentosImpressos}
                onChange={(e) => setDocumentosImpressos(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                placeholder="Ex: 50"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden font-semibold"
              />
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">
              Quantidade de CNHs físicas contidas no lote
            </span>
          </div>

          {/* Upload de Arquivo PDF */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Arquivo PDF (Relatório / Comprovante do Lote)
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept="application/pdf,.pdf"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            {pdfUrl ? (
              <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {pdfNome || "documento_lote.pdf"}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatFileSize(pdfTamanho)} • Arquivo PDF pronto para salvar
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Substituir PDF"
                    className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors cursor-pointer"
                  >
                    Substituir
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    title="Remover PDF"
                    className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-blue-500 bg-blue-50/80 dark:bg-blue-950/30"
                    : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="p-3 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-full mb-2">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Clique para selecionar ou arraste o arquivo PDF aqui
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Formato aceito: .pdf (Máximo 15 MB)
                </p>
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Observações (Opcional)
            </label>
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Malote A, remessa regional, CNHs de renovação..."
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden resize-none"
            />
          </div>

          {/* Rodapé e Botões */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{loteToEdit ? "Salvar Alterações" : "Cadastrar Lote"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
