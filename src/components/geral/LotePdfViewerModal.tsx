import React, { useState, useEffect } from "react";
import { X, Download, ExternalLink, FileText, Calendar, Layers, Hash, Loader2 } from "lucide-react";
import { Lote } from "../../types";
import { formatDate } from "../../lib/utils";
import { resolveLotePdfUrl } from "../../services/lotesStorageService";

interface LotePdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lote: Lote | null;
}

export const LotePdfViewerModal: React.FC<LotePdfViewerModalProps> = ({
  isOpen,
  onClose,
  lote
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(lote?.pdf_url);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !lote) {
      setResolvedUrl(undefined);
      return;
    }

    if (lote.pdf_url) {
      setResolvedUrl(lote.pdf_url);
    } else {
      setLoading(true);
      resolveLotePdfUrl(lote)
        .then((url) => {
          setResolvedUrl(url);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, lote]);

  if (!isOpen || !lote) return null;

  const activeUrl = resolvedUrl || lote.pdf_url;

  const handleDownload = async () => {
    if (!activeUrl) return;
    try {
      if (activeUrl.startsWith("http")) {
        const response = await fetch(activeUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = lote.pdf_nome || `Lote_${lote.numero}_CNHs.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        const a = document.createElement("a");
        a.href = activeUrl;
        a.download = lote.pdf_nome || `Lote_${lote.numero}_CNHs.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      const a = document.createElement("a");
      a.href = activeUrl;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = lote.pdf_nome || `Lote_${lote.numero}_CNHs.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleOpenNewTab = () => {
    if (!activeUrl) return;
    if (activeUrl.startsWith("http")) {
      window.open(activeUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const win = window.open();
    if (win) {
      win.document.write(
        `<iframe src="${activeUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
      );
      win.document.title = lote.pdf_nome || `Lote ${lote.numero}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">
                  Visualização do PDF • Lote #{lote.numero}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  {lote.documentos_impressos} docs
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {lote.pdf_nome || `Lote_${lote.numero}.pdf`} • Recebido em: {formatDate(lote.data_recebimento)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenNewTab}
              title="Abrir em Nova Aba"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Nova Aba</span>
            </button>

            <button
              onClick={handleDownload}
              title="Baixar Arquivo PDF"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo do PDF */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 overflow-hidden relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Carregando anexo do lote...</p>
            </div>
          ) : activeUrl ? (
            <iframe
              src={activeUrl}
              title={`PDF Lote ${lote.numero}`}
              className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <FileText className="w-12 h-12 stroke-[1.5]" />
              <p className="text-sm font-medium">Nenhum documento PDF disponível para este lote.</p>
            </div>
          )}
        </div>

        {/* Rodapé informativo */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <span><strong>Lote:</strong> #{lote.numero}</span>
            <span><strong>Recebimento:</strong> {formatDate(lote.data_recebimento)}</span>
            <span><strong>Documentos Impressos:</strong> {lote.documentos_impressos}</span>
          </div>
          {lote.observacao && (
            <span className="truncate max-w-md italic">
              <strong>Obs:</strong> {lote.observacao}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
