import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  AlertCircle,
  Columns,
  Layers
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { Lote } from "../../types";
import { formatDate } from "../../lib/utils";
import { resolveLotePdfUrl, dataUrlToBlob } from "../../services/lotesStorageService";

// Polyfill Promise.withResolvers para compatibilidade com navegadores mais antigos
if (typeof (Promise as any).withResolvers === "undefined") {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Configuração do Worker do PDF.js com fallback resiliente
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
}

interface LotePdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lote: Lote | null;
}

/**
 * Converte de forma segura Data URLs, Blobs ou URLs HTTP em Uint8Array para o PDF.js
 */
async function loadPdfBinary(source: string | Blob): Promise<{ data: Uint8Array; blob: Blob }> {
  if (source instanceof Blob) {
    const buffer = await source.arrayBuffer();
    return { data: new Uint8Array(buffer), blob: source };
  }

  if (typeof source === "string") {
    // Se for Data URL
    if (source.startsWith("data:")) {
      try {
        const res = await fetch(source);
        const buffer = await res.arrayBuffer();
        const blob = new Blob([buffer], { type: "application/pdf" });
        return { data: new Uint8Array(buffer), blob };
      } catch {
        // Fallback manual para base64
        const commaIdx = source.indexOf(",");
        const base64 = commaIdx !== -1 ? source.slice(commaIdx + 1).replace(/\s/g, "") : source;
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/pdf" });
        return { data: bytes, blob };
      }
    }

    // Se for URL HTTP/HTTPS ou Blob URL
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Falha ao obter arquivo PDF (${res.status} ${res.statusText})`);
    }
    const buffer = await res.arrayBuffer();
    const blob = new Blob([buffer], { type: "application/pdf" });
    return { data: new Uint8Array(buffer), blob };
  }

  throw new Error("Formato de anexo não suportado");
}

export const LotePdfViewerModal: React.FC<LotePdfViewerModalProps> = ({
  isOpen,
  onClose,
  lote
}) => {
  const [loading, setLoading] = useState(false);
  const [renderLoading, setRenderLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado do PDF
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.1);
  const [rotation, setRotation] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"single" | "continuous">("single");

  // Blob nativo e URL de objeto para abrir em nova aba / download
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [blobObjectUrl, setBlobObjectUrl] = useState<string | null>(null);

  // Referências para telas e canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const continuousContainerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Limpeza de Blob URL ao fechar
  useEffect(() => {
    return () => {
      if (blobObjectUrl) {
        URL.revokeObjectURL(blobObjectUrl);
      }
    };
  }, [blobObjectUrl]);

  // Carrega o documento PDF
  useEffect(() => {
    if (!isOpen || !lote) {
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      setError(null);
      setCurrentBlob(null);
      if (blobObjectUrl) {
        URL.revokeObjectURL(blobObjectUrl);
        setBlobObjectUrl(null);
      }
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const initPdf = async () => {
      try {
        let rawUrl = lote.pdf_url;
        if (!rawUrl) {
          rawUrl = await resolveLotePdfUrl(lote);
        }

        if (!rawUrl) {
          if (isMounted) {
            setError("Nenhum arquivo PDF disponível para este lote.");
            setLoading(false);
          }
          return;
        }

        const { data, blob } = await loadPdfBinary(rawUrl);
        if (!isMounted) return;

        setCurrentBlob(blob);
        const objUrl = URL.createObjectURL(blob);
        setBlobObjectUrl(objUrl);

        // Carrega o documento via PDF.js
        const loadingTask = pdfjsLib.getDocument({
          data,
          cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/",
          cMapPacked: true
        });

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
      } catch (err: any) {
        console.error("Erro ao carregar PDF com PDF.js:", err);
        if (isMounted) {
          setError(
            err?.message || "Não foi possível carregar e decodificar o documento PDF."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initPdf();

    return () => {
      isMounted = false;
    };
  }, [isOpen, lote]);

  // Renderiza a página única ativa no Canvas
  const renderSinglePage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current || viewMode !== "single") return;

      // Cancela renderização anterior se estiver em andamento
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }

      setRenderLoading(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const viewport = page.getViewport({ scale, rotation });
        const pixelRatio = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const renderContext = {
          canvasContext: context,
          viewport
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (renderErr: any) {
        if (renderErr?.name !== "RenderingCancelledException") {
          console.warn("Aviso ao renderizar página do PDF:", renderErr);
        }
      } finally {
        setRenderLoading(false);
      }
    },
    [pdfDoc, scale, rotation, viewMode]
  );

  // Renderiza modo contínuo (todas as páginas)
  const renderContinuousPages = useCallback(async () => {
    if (!pdfDoc || !continuousContainerRef.current || viewMode !== "continuous") return;

    setRenderLoading(true);
    const container = continuousContainerRef.current;
    container.innerHTML = "";

    try {
      const pixelRatio = window.devicePixelRatio || 1;

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: scale * 0.95, rotation });

        const pageWrapper = document.createElement("div");
        pageWrapper.className =
          "flex flex-col items-center my-4 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-2 relative";

        const label = document.createElement("div");
        label.className =
          "text-[11px] font-semibold text-slate-400 mb-2 select-none tracking-wider uppercase";
        label.innerText = `Página ${i} de ${pdfDoc.numPages}`;
        pageWrapper.appendChild(label);

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        pageWrapper.appendChild(canvas);
        container.appendChild(pageWrapper);
      }
    } catch (err: any) {
      console.warn("Erro ao renderizar modo contínuo:", err);
    } finally {
      setRenderLoading(false);
    }
  }, [pdfDoc, scale, rotation, viewMode]);

  // Efeito para disparar renderização ao mudar página/zoom/modo
  useEffect(() => {
    if (!pdfDoc) return;
    if (viewMode === "single") {
      renderSinglePage(currentPage);
    } else {
      renderContinuousPages();
    }
  }, [pdfDoc, currentPage, scale, rotation, viewMode, renderSinglePage, renderContinuousPages]);

  // Atalhos de teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && currentPage > 1 && viewMode === "single") {
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === "ArrowRight" && currentPage < numPages && viewMode === "single") {
        setCurrentPage((p) => Math.min(numPages, p + 1));
      } else if (e.key === "+" || (e.ctrlKey && e.key === "=")) {
        e.preventDefault();
        setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)));
      } else if (e.key === "-" || (e.ctrlKey && e.key === "-")) {
        e.preventDefault();
        setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentPage, numPages, viewMode, onClose]);

  if (!isOpen || !lote) return null;

  // Download do arquivo
  const handleDownload = () => {
    const filename = lote.pdf_nome || `Lote_${lote.numero}_CNHs.pdf`;
    if (blobObjectUrl) {
      const a = document.createElement("a");
      a.href = blobObjectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (lote.pdf_url) {
      const blob = dataUrlToBlob(lote.pdf_url);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  // Abrir em Nova Aba com o leitor nativo do navegador
  const handleOpenNewTab = () => {
    if (blobObjectUrl) {
      window.open(blobObjectUrl, "_blank", "noopener,noreferrer");
    } else if (lote.pdf_url?.startsWith("http")) {
      window.open(lote.pdf_url, "_blank", "noopener,noreferrer");
    } else if (lote.pdf_url) {
      const blob = dataUrlToBlob(lote.pdf_url);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleZoomIn = () => setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)));
  const handleResetZoom = () => setScale(1.1);
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho Principal */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base truncate">
                  Visualização do PDF • Lote #{lote.numero}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 shrink-0">
                  {lote.documentos_impressos} docs
                </span>
                {lote.pdf_tamanho ? (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300">
                    {formatFileSize(lote.pdf_tamanho)}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {lote.pdf_nome || `Lote_${lote.numero}.pdf`} • Recebido em: {formatDate(lote.data_recebimento)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenNewTab}
              title="Abrir arquivo em uma Nova Aba do navegador"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Nova Aba</span>
            </button>

            <button
              onClick={handleDownload}
              title="Baixar Arquivo PDF Completo"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Baixar PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Ferramentas do Visualizador de PDF */}
        {pdfDoc && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 shrink-0">
            {/* Controles de Navegação de Página */}
            <div className="flex items-center gap-1.5">
              {viewMode === "single" ? (
                <>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Página Anterior (Seta Esquerda)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {currentPage}
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="text-slate-500 dark:text-slate-400">{numPages}</span>
                  </div>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                    disabled={currentPage >= numPages}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Próxima Página (Seta Direita)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <span className="text-slate-500 font-medium">
                  {numPages} página{numPages > 1 ? "s" : ""} carregada{numPages > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Controles de Zoom, Rotação e Modo de Exibição */}
            <div className="flex items-center gap-2">
              {/* Modo de Exibição */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setViewMode("single")}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    viewMode === "single"
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  title="Página Individual"
                >
                  Página Única
                </button>
                <button
                  onClick={() => setViewMode("continuous")}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    viewMode === "continuous"
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  title="Rolagem Contínua de Todas as Páginas"
                >
                  Todas as Páginas
                </button>
              </div>

              {/* Divisor */}
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

              {/* Zoom */}
              <button
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors cursor-pointer"
                title="Diminuir Zoom (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <span className="w-12 text-center font-semibold text-slate-700 dark:text-slate-300">
                {Math.round(scale * 100)}%
              </span>

              <button
                onClick={handleZoomIn}
                disabled={scale >= 2.5}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors cursor-pointer"
                title="Aumentar Zoom (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleResetZoom}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Ajustar Zoom (100%)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              {/* Rotação */}
              <button
                onClick={handleRotate}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Girar 90° no Sentido Horário"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Área de Exibição do Documento PDF */}
        <div className="flex-1 bg-slate-200/70 dark:bg-slate-950 p-3 sm:p-6 overflow-auto relative flex flex-col items-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center my-auto gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-9 h-9 animate-spin text-blue-600" />
              <p className="text-sm font-semibold">Carregando e renderizando documento PDF...</p>
              <p className="text-xs text-slate-400">Processando páginas em alta definição</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center my-auto max-w-md text-center p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl mb-3">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                Visualização Indisponível
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{error}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo PDF</span>
                </button>
                <button
                  onClick={handleOpenNewTab}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Tentar em Nova Aba</span>
                </button>
              </div>
            </div>
          ) : viewMode === "single" ? (
            <div className="relative my-auto flex flex-col items-center">
              {renderLoading && (
                <div className="absolute inset-0 z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xs flex items-center justify-center rounded-xl">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                </div>
              )}
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-300/80 dark:border-slate-800 overflow-hidden transition-all duration-200">
                <canvas ref={canvasRef} className="block max-w-full h-auto mx-auto" />
              </div>
            </div>
          ) : (
            <div
              ref={continuousContainerRef}
              className="w-full flex flex-col items-center space-y-4 my-2"
            >
              {renderLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé Informativo */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2 shrink-0">
          <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            <span>
              <strong>Lote:</strong> #{lote.numero}
            </span>
            <span>
              <strong>Recebimento:</strong> {formatDate(lote.data_recebimento)}
            </span>
            <span>
              <strong>Documentos Impressos:</strong> {lote.documentos_impressos}
            </span>
            {numPages > 0 && (
              <span>
                <strong>Total de Páginas:</strong> {numPages}
              </span>
            )}
          </div>
          {lote.observacao && (
            <span className="truncate max-w-md italic text-slate-600 dark:text-slate-300">
              <strong>Obs:</strong> {lote.observacao}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
