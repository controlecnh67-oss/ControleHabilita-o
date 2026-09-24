import React, { useState, useRef, useMemo } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowRight,
  Check,
  SlidersHorizontal,
  TableProperties,
  Layers,
  Sparkles,
  Info,
  CheckCheck,
  ChevronDown,
  UserCheck,
  UserX,
  FileCheck
} from "lucide-react";
import * as XLSX from "xlsx";
import { GeralCNH, Usuario } from "../types";
import { saveLocalGeralCNHsBulk, notifySyncUpdated } from "../services/dexieDb";
import { logAuditoriaBulk } from "../services/db";
import { normalizeSearch, matchDigitsSafe } from "../lib/utils";

interface ImportarLoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  geralList: GeralCNH[];
  currentUser: Usuario | null;
  onSuccess: (updatedCount: number, message: string) => void;
}

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, any>;
  nome: string;
  pa: string;
  lote: string;
  matchedCnh?: GeralCNH;
  matchType?: "PA" | "NOME" | "PA_E_NOME" | "NONE";
  status: "LOCALIZADA" | "JA_POSSUI_LOTE" | "NAO_LOCALIZADA";
  selected: boolean;
}

export const ImportarLoteModal: React.FC<ImportarLoteModalProps> = ({
  isOpen,
  onClose,
  geralList,
  currentUser,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

  // Mapeamento de Colunas
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [colNome, setColNome] = useState<string>("");
  const [colPa, setColPa] = useState<string>("");
  const [colLote, setColLote] = useState<string>("");
  const [defaultLoteInput, setDefaultLoteInput] = useState<string>("");

  // Dados Analisados
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [activeTab, setActiveTab] = useState<"todas" | "localizadas" | "nao_localizadas">("todas");
  const [filterQuery, setFilterQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Opções de Processamento
  const [overwriteExistingLote, setOverwriteExistingLote] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resetar estado quando fecha ou reabre
  const handleReset = () => {
    setFile(null);
    setFileName("");
    setSheets([]);
    setSelectedSheet("");
    setWorkbook(null);
    setRawHeaders([]);
    setColNome("");
    setColPa("");
    setColLote("");
    setDefaultLoteInput("");
    setParsedRows([]);
    setIsAnalyzing(false);
    setHasAnalyzed(false);
    setActiveTab("todas");
    setFilterQuery("");
    setIsSaving(false);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // 1. Leitura inicial do arquivo Excel / CSV
  const handleFileUpload = (uploadedFile: File) => {
    setErrorMessage(null);
    setFile(uploadedFile);
    setFileName(uploadedFile.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        setWorkbook(wb);
        setSheets(wb.SheetNames);
        if (wb.SheetNames.length > 0) {
          const firstSheet = wb.SheetNames[0];
          setSelectedSheet(firstSheet);
          inspectSheet(wb, firstSheet);
        }
      } catch (err: any) {
        setErrorMessage("Erro ao ler arquivo: " + (err.message || "Formato inválido"));
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // 2. Inspecionar cabeçalhos e auto-detectar colunas
  const inspectSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!rows || rows.length === 0) {
      setErrorMessage("A planilha selecionada está vazia.");
      return;
    }

    // Procura a linha que mais parece ser o cabeçalho (com textos válidos)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const row = rows[i];
      if (Array.isArray(row) && row.some((cell) => typeof cell === "string" && cell.trim().length > 1)) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = (rows[headerRowIndex] || []).map((h, idx) =>
      typeof h === "string" && h.trim() ? h.trim() : `Coluna ${idx + 1}`
    );
    setRawHeaders(headers);

    // Auto-detecção inteligente de colunas
    let detectedNome = "";
    let detectedPa = "";
    let detectedLote = "";

    headers.forEach((h) => {
      const norm = normalizeSearch(h).replace(/[^a-z0-9]/g, "");
      // Nome
      if (!detectedNome && (norm.includes("nome") || norm.includes("condutor") || norm.includes("titular") || norm.includes("cliente"))) {
        detectedNome = h;
      }
      // PA
      if (!detectedPa && (norm === "pa" || norm.includes("numpa") || norm.includes("numeropa") || norm.includes("proc") || norm.includes("processo") || norm.includes("protocolo"))) {
        detectedPa = h;
      }
      // Lote
      if (!detectedLote && (norm.includes("lote") || norm.includes("remessa") || norm.includes("grupo"))) {
        detectedLote = h;
      }
    });

    setColNome(detectedNome || (headers[0] || ""));
    setColPa(detectedPa || (headers.find((h) => h !== detectedNome) || ""));
    setColLote(detectedLote || "");
  };

  const handleSheetChange = (newSheet: string) => {
    setSelectedSheet(newSheet);
    if (workbook) {
      inspectSheet(workbook, newSheet);
      setHasAnalyzed(false);
      setParsedRows([]);
    }
  };

  // 3. Executar Análise de Correspondência (Nome & PA vs Base do Protocolo Geral)
  const handleRunAnalysis = () => {
    if (!workbook || !selectedSheet) {
      setErrorMessage("Por favor, selecione uma planilha para analisar.");
      return;
    }
    if (!colNome && !colPa) {
      setErrorMessage("É necessário selecionar ao menos a coluna de Nome ou de PA para cruzamento.");
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    setTimeout(() => {
      try {
        const ws = workbook.Sheets[selectedSheet];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        // Mapas de busca rápida na base geral existente
        const mapByPa = new Map<string, GeralCNH>();
        const mapByNormNome = new Map<string, GeralCNH>();

        geralList.forEach((c) => {
          if (c.pa) {
            const cleanPa = String(c.pa).replace(/\D/g, "");
            if (cleanPa) mapByPa.set(cleanPa, c);
          }
          if (c.nome) {
            const normNome = normalizeSearch(c.nome);
            if (normNome) mapByNormNome.set(normNome, c);
          }
        });

        const analyzed: ParsedRow[] = [];

        rows.forEach((row, idx) => {
          const rawNome = colNome && row[colNome] ? String(row[colNome]).trim() : "";
          const rawPa = colPa && row[colPa] ? String(row[colPa]).trim() : "";
          const cleanPaDigits = rawPa.replace(/\D/g, "");
          const normRowNome = normalizeSearch(rawNome);

          // Extrai o lote da coluna mapeada ou utiliza o lote padrão informado
          const rowLoteVal = colLote && row[colLote] ? String(row[colLote]).trim() : "";
          const targetLote = (rowLoteVal || defaultLoteInput).trim();

          // Ignora linhas totalmente vazias
          if (!rawNome && !rawPa) return;

          let matched: GeralCNH | undefined = undefined;
          let matchType: "PA" | "NOME" | "PA_E_NOME" | "NONE" = "NONE";

          // Prioridade 1: Match exato por PA
          if (cleanPaDigits && mapByPa.has(cleanPaDigits)) {
            matched = mapByPa.get(cleanPaDigits);
            matchType = "PA";
          }

          // Prioridade 2: Se não achou por PA ou não tem PA, busca por Nome
          if (!matched && normRowNome && mapByNormNome.has(normRowNome)) {
            matched = mapByNormNome.get(normRowNome);
            matchType = "NOME";
          }

          // Se achou por PA e o nome também coincide
          if (matched && normRowNome && normalizeSearch(matched.nome) === normRowNome) {
            matchType = "PA_E_NOME";
          }

          let status: "LOCALIZADA" | "JA_POSSUI_LOTE" | "NAO_LOCALIZADA" = "NAO_LOCALIZADA";

          if (matched) {
            if (matched.lote && targetLote && matched.lote.trim().toLowerCase() === targetLote.toLowerCase()) {
              status = "JA_POSSUI_LOTE";
            } else {
              status = "LOCALIZADA";
            }
          }

          analyzed.push({
            rowIndex: idx + 1,
            raw: row,
            nome: rawNome,
            pa: rawPa,
            lote: targetLote,
            matchedCnh: matched,
            matchType,
            status,
            selected: status === "LOCALIZADA",
          });
        });

        setParsedRows(analyzed);
        setHasAnalyzed(true);
      } catch (err: any) {
        setErrorMessage("Erro durante a análise da planilha: " + err.message);
      } finally {
        setIsAnalyzing(false);
      }
    }, 40);
  };

  // Contadores e métricas de análise
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const localizadas = parsedRows.filter((r) => r.status === "LOCALIZADA").length;
    const jaPossui = parsedRows.filter((r) => r.status === "JA_POSSUI_LOTE").length;
    const naoLocalizadas = parsedRows.filter((r) => r.status === "NAO_LOCALIZADA").length;
    const selecionadas = parsedRows.filter((r) => r.selected).length;

    return { total, localizadas, jaPossui, naoLocalizadas, selecionadas };
  }, [parsedRows]);

  // Lista filtrada para tabela de preview
  const displayRows = useMemo(() => {
    return parsedRows.filter((row) => {
      if (activeTab === "localizadas" && row.status === "NAO_LOCALIZADA") return false;
      if (activeTab === "nao_localizadas" && row.status !== "NAO_LOCALIZADA") return false;

      if (!filterQuery) return true;
      const q = normalizeSearch(filterQuery);
      return (
        normalizeSearch(row.nome).includes(q) ||
        row.pa.includes(filterQuery.trim()) ||
        normalizeSearch(row.lote).includes(q) ||
        (row.matchedCnh && normalizeSearch(row.matchedCnh.nome).includes(q))
      );
    });
  }, [parsedRows, activeTab, filterQuery]);

  const toggleSelectRow = (idx: number) => {
    setParsedRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleSelectAllVisible = () => {
    const allSelected = displayRows.every((r) => r.selected);
    const visibleRowIndices = new Set(displayRows.map((r) => r.rowIndex));
    setParsedRows((prev) =>
      prev.map((r) =>
        visibleRowIndices.has(r.rowIndex) ? { ...r, selected: !allSelected } : r
      )
    );
  };

  // 4. Execução da Gravação dos Lotes no Banco de Dados
  const handleApplyLote = async () => {
    const toUpdate = parsedRows.filter((r) => r.selected && r.matchedCnh);
    if (toUpdate.length === 0) {
      setErrorMessage("Nenhum registro selecionado com CNH localizada para vincular o lote.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const now = new Date().toISOString();
      const updatedCnhs: GeralCNH[] = [];
      const auditEntries: Array<{
        tabela: string;
        registro_id: string | number;
        acao: "Alteração";
        usuario_id: string;
        usuario_nome?: string;
        valores_antigos?: any;
        valores_novos?: any;
      }> = [];

      toUpdate.forEach((row) => {
        const cnh = row.matchedCnh!;
        const novoLote = (row.lote || defaultLoteInput).trim();

        // Se a CNH já possui lote e o usuário desmarcou sobrescrita, preserva
        if (cnh.lote && !overwriteExistingLote) return;

        const updated: GeralCNH = {
          ...cnh,
          lote: novoLote,
          updated_at: now,
        };

        updatedCnhs.push(updated);

        auditEntries.push({
          tabela: "geral_cnhs",
          registro_id: cnh.id,
          acao: "Alteração",
          usuario_id: currentUser?.id || "sistema",
          usuario_nome: currentUser?.nome_curto || currentUser?.nome || "Operador",
          valores_antigos: { lote: cnh.lote || null },
          valores_novos: { lote: novoLote },
        });
      });

      if (updatedCnhs.length > 0) {
        // Salva em lote no Dexie e envia para o Supabase
        await saveLocalGeralCNHsBulk(updatedCnhs);

        // Registra auditoria em lote
        if (auditEntries.length > 0) {
          logAuditoriaBulk(auditEntries as any).catch((e) =>
            console.warn("Aviso ao registrar auditoria de importação de lote:", e)
          );
        }

        notifySyncUpdated("geral");
        onSuccess(
          updatedCnhs.length,
          `🎉 ${updatedCnhs.length} CNHs tiveram a coluna Lote vinculada com sucesso a partir da planilha!`
        );
        handleClose();
      } else {
        setErrorMessage("Nenhum registro apto a ser atualizado com base nos critérios selecionados.");
      }
    } catch (err: any) {
      setErrorMessage("Erro ao aplicar lote: " + (err.message || "Falha na sincronização"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabeçalho da Modal */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Importar Planilha e Vincular Lote
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  Cruzamento Nome & PA
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Identifique as colunas de Nome e Processo Adm. (PA) para preencher a coluna <strong>Lote</strong> nas CNHs
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro / Alerta */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="font-medium flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 font-bold">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Conteúdo Principal com Scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          
          {/* ETAPA 1: Upload do Arquivo */}
          {!hasAnalyzed ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  file
                    ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20"
                    : "border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-800/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                  className="hidden"
                />
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
                  {file ? <FileCheck className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
                </div>
                {file ? (
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{fileName}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                      Arquivo carregado • Clique para trocar
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Arraste ou clique para selecionar a planilha Excel (.xlsx, .xls) ou CSV
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      A planilha deve conter colunas com o <strong>Nome do Titular</strong> e/ou <strong>PA (Processo Administrativo)</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Configurações de Colunas e Abas */}
              {rawHeaders.length > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Identificação e Mapeamento de Colunas
                      </h3>
                    </div>
                    {sheets.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Aba da Planilha:</span>
                        <select
                          value={selectedSheet}
                          onChange={(e) => handleSheetChange(e.target.value)}
                          className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200"
                        >
                          {sheets.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Coluna Nome */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Coluna do Nome <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={colNome}
                        onChange={(e) => setColNome(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      >
                        <option value="">-- Não usar coluna de Nome --</option>
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Coluna PA */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Coluna do PA (Processo Adm.) <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={colPa}
                        onChange={(e) => setColPa(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      >
                        <option value="">-- Não usar coluna de PA --</option>
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Coluna Lote (da planilha) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Coluna de Lote na Planilha
                      </label>
                      <select
                        value={colLote}
                        onChange={(e) => setColLote(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      >
                        <option value="">(Usar Lote Fixo informado ao lado)</option>
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Lote Padrão Manual */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {colLote ? "Lote Reserva / Padrão" : "Definir Lote a Vincular"}
                      </label>
                      <input
                        type="text"
                        value={defaultLoteInput}
                        onChange={(e) => setDefaultLoteInput(e.target.value)}
                        placeholder="ex: Lote 12/2026 ou Remessa 45"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      O cruzamento identificará as CNHs cadastradas usando o número do PA (9 dígitos) e/ou o Nome Completo.
                    </p>
                    <button
                      onClick={handleRunAnalysis}
                      disabled={isAnalyzing || (!colNome && !colPa)}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-transform active:scale-98"
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Analisando Correspondências...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          Executar Análise da Planilha
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ETAPA 2: Painel de Análise e Tabela de Conferência */
            <div className="space-y-4">
              
              {/* Cards de Métricas da Análise */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total na Planilha
                  </span>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                    {stats.total}
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    Localizadas no Geral
                  </span>
                  <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {stats.localizadas}
                  </div>
                </div>

                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 rounded-xl">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5" />
                    Já com Este Lote
                  </span>
                  <div className="text-xl font-extrabold text-blue-700 dark:text-blue-300 mt-0.5">
                    {stats.jaPossui}
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <UserX className="w-3.5 h-3.5" />
                    Não Encontradas
                  </span>
                  <div className="text-xl font-extrabold text-amber-700 dark:text-amber-300 mt-0.5">
                    {stats.naoLocalizadas}
                  </div>
                </div>
              </div>

              {/* Barra de Filtros da Análise e Opções */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                {/* Abas */}
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setActiveTab("todas")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "todas"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                    }`}
                  >
                    Todas ({stats.total})
                  </button>
                  <button
                    onClick={() => setActiveTab("localizadas")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "localizadas"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                    }`}
                  >
                    Localizadas ({stats.localizadas})
                  </button>
                  <button
                    onClick={() => setActiveTab("nao_localizadas")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "nao_localizadas"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                    }`}
                  >
                    Não Localizadas ({stats.naoLocalizadas})
                  </button>
                </div>

                {/* Busca rápida na lista */}
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou PA..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Opção de Sobrescrita */}
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overwriteExistingLote}
                    onChange={(e) => setOverwriteExistingLote(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Sobrescrever se CNH já tiver outro lote</span>
                </label>

                {/* Botão para reconfigurar colunas */}
                <button
                  onClick={() => setHasAnalyzed(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Reajustar Colunas
                </button>
              </div>

              {/* Tabela de Visualização de Análise */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 z-10 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={displayRows.length > 0 && displayRows.every((r) => r.selected)}
                            onChange={toggleSelectAllVisible}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                        </th>
                        <th className="p-3 w-12">#</th>
                        <th className="p-3">Nome na Planilha</th>
                        <th className="p-3">PA na Planilha</th>
                        <th className="p-3">Lote a Atribuir</th>
                        <th className="p-3">Correspondência no Protocolo</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200 font-medium">
                      {displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Nenhum registro encontrado com os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((row) => {
                          const isMatched = Boolean(row.matchedCnh);
                          return (
                            <tr
                              key={row.rowIndex}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                !isMatched ? "opacity-75 bg-slate-50/40 dark:bg-slate-900/30" : ""
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!isMatched}
                                  checked={row.selected}
                                  onChange={() => toggleSelectRow(row.rowIndex - 1)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                                />
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-400">
                                {row.rowIndex}
                              </td>
                              <td className="p-3 font-bold text-slate-900 dark:text-white uppercase">
                                {row.nome || <span className="text-slate-400 italic">Vazio</span>}
                              </td>
                              <td className="p-3 font-mono text-[11px]">
                                {row.pa || <span className="text-slate-400">-</span>}
                              </td>
                              <td className="p-3 font-semibold text-indigo-600 dark:text-indigo-400">
                                {row.lote || defaultLoteInput || <span className="text-slate-400 italic">Não informado</span>}
                              </td>
                              <td className="p-3">
                                {row.matchedCnh ? (
                                  <div className="text-xs space-y-0.5">
                                    <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-[10px] font-mono">
                                        #{row.matchedCnh.ordem}
                                      </span>
                                      <span>{row.matchedCnh.nome}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                      <span>PA Atual: {row.matchedCnh.pa || "N/A"}</span>
                                      <span>•</span>
                                      <span>Lote Atual: {row.matchedCnh.lote || "Sem lote"}</span>
                                      <span>•</span>
                                      <span>{row.matchedCnh.gaveta} {row.matchedCnh.reparticao}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                    Não encontrada no Protocolo Geral
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {row.status === "LOCALIZADA" && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    <Check className="w-3 h-3" />
                                    Apta a Vincular
                                  </span>
                                )}
                                {row.status === "JA_POSSUI_LOTE" && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                                    <CheckCheck className="w-3 h-3" />
                                    Já Possui Este Lote
                                  </span>
                                )}
                                {row.status === "NAO_LOCALIZADA" && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                    <AlertTriangle className="w-3 h-3" />
                                    Não Localizada
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Rodapé com Ações */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {hasAnalyzed ? (
              <span>
                <strong>{stats.selecionadas}</strong> de <strong>{stats.localizadas}</strong> CNHs localizadas selecionadas para atualização.
              </span>
            ) : (
              <span>Suporta planilhas Excel (.xlsx, .xls) e arquivos CSV formatados.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            {hasAnalyzed && (
              <button
                onClick={handleApplyLote}
                disabled={isSaving || stats.selecionadas === 0}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Gravando Lotes no Banco...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    Vincular Lote às {stats.selecionadas} CNHs Selecionadas
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
