import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  Upload, 
  RefreshCw, 
  HelpCircle, 
  User, 
  FileText, 
  FolderArchive, 
  Building2, 
  Tag, 
  Phone, 
  Calendar, 
  Layers, 
  UserCheck, 
  Inbox, 
  Truck, 
  Clock, 
  Check, 
  ArrowRight,
  Database,
  SlidersHorizontal,
  Eye,
  Info
} from "lucide-react";
import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import { 
  GeralCNH, 
  MapeamentoLocalizacao, 
  SituacaoGeral 
} from "../types";
import { 
  getGeralCNHs, 
  getStoredList, 
  SEED_MAPEAMENTO, 
  importSpreadsheetData, 
  mapSpreadsheetRowToGeralCNH,
  SpreadsheetImportSummary 
} from "../services/db";
import { isSupabaseConfigured } from "../services/supabase";
import { formatCPF, formatPhone, formatDateTime } from "../lib/utils";

export interface ImportSpreadsheetConferenceModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onSuccess: (result: SpreadsheetImportSummary) => void;
  defaultSyncToSupabase?: boolean;
}

// Definição dos campos alvo para conferência e mapeamento
interface TargetFieldDef {
  key: string;
  label: string;
  description: string;
  required?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  defaultPatterns: RegExp[];
  fallbackNote: string;
}

const TARGET_FIELDS: TargetFieldDef[] = [
  {
    key: "nome",
    label: "Nome do Titular",
    description: "Nome completo do condutor / candidato",
    required: true,
    icon: User,
    defaultPatterns: [/nome/, /candidato/, /titular/, /aluno/, /condutor/],
    fallbackNote: "Obrigatório: Linhas sem nome válido serão desconsideradas."
  },
  {
    key: "cpf",
    label: "CPF",
    description: "Documento de identificação com 11 dígitos",
    icon: FileText,
    defaultPatterns: [/cpf/, /doc/, /documento/],
    fallbackNote: "Opcional: Se não constar, a CNH será identificada pela ordem."
  },
  {
    key: "ordem",
    label: "Número de Ordem (#)",
    description: "Identificador sequencial numérico na pasta/gaveta",
    icon: Tag,
    defaultPatterns: [/ordem/, /num/, /numero/, /nº/, /posicao/, /pos/],
    fallbackNote: "Automático: Se ausente, continuará a numeração a partir da maior ordem atual."
  },
  {
    key: "pa",
    label: "PA (Processo / Registro CNH)",
    description: "Número do processo administrativo ou identificador do documento",
    icon: FileText,
    defaultPatterns: [/^pa$/, /processo/, /renach/, /registro/],
    fallbackNote: "Opcional: Ficará disponível na consulta rápida e ficha do balcão."
  },
  {
    key: "gaveta",
    label: "Gaveta Física",
    description: "Identificação da gaveta de guarda (ex: Gaveta 1, G-01)",
    icon: FolderArchive,
    defaultPatterns: [/gaveta/, /local/, /caixa/, /pasta/],
    fallbackNote: "Inteligente: Se não informada, será alocada pela inicial do titular (A-Z)."
  },
  {
    key: "reparticao",
    label: "Repartição / Setor",
    description: "Unidade ou repartição de arquivamento",
    icon: Building2,
    defaultPatterns: [/reparti/, /setor/, /unidade/, /depto/],
    fallbackNote: "Inteligente: Se ausente, utilizará a regra de distribuição do órgão."
  },
  {
    key: "situacao",
    label: "Situação / Status",
    description: "Estado atual (Recebida, Entregue, Remetida ou Pendente)",
    icon: Tag,
    defaultPatterns: [/situa/, /status/, /estado/],
    fallbackNote: "Padrão: Se não constar, será cadastrada como 'Recebida' (No Balcão)."
  },
  {
    key: "telefone",
    label: "Telefone / Contato",
    description: "Telefone do condutor para avisos de recebimento / entrega",
    icon: Phone,
    defaultPatterns: [/telefone/, /fone/, /celular/, /contato/, /whatsapp/],
    fallbackNote: "Opcional: Permite envio de avisos via WhatsApp / Wasender."
  },
  {
    key: "responsavel",
    label: "Responsável Retirada",
    description: "Nome do titular, despachante ou procurador que retirou o documento",
    icon: UserCheck,
    defaultPatterns: [/responsavel/, /retirante/, /procurador/],
    fallbackNote: "Opcional: Utilizado caso a planilha já contenha registros de entregas efetuadas."
  },
  {
    key: "data_movimento",
    label: "Data do Movimento",
    description: "Data em que a CNH foi recebida, remetida ou entregue",
    icon: Calendar,
    defaultPatterns: [/^data_movimentacao$/, /^data_movimento$/, /^data_mov$/, /data_movim/, /^data$/],
    fallbackNote: "Automático: Caso não informada, será registrada a data atual."
  },
  {
    key: "lote",
    label: "Lote / Remessa",
    description: "Identificador do lote de envio da gráfica ou malote",
    icon: Layers,
    defaultPatterns: [/^lote$/, /lote_num/, /malote/, /remessa/],
    fallbackNote: "Opcional: Permite rastreamento conjunto de documentos."
  },
  {
    key: "observacao",
    label: "Observações",
    description: "Anotações adicionais e despachos pertinentes à CNH",
    icon: Info,
    defaultPatterns: [/^observacao$/, /observa/, /obs/, /nota/],
    fallbackNote: "Opcional: Ficará visível na ficha rápida da CNH."
  }
];

export const ImportSpreadsheetConferenceModal: React.FC<ImportSpreadsheetConferenceModalProps> = ({
  isOpen,
  file,
  onClose,
  onSuccess,
  defaultSyncToSupabase = true
}) => {
  // Abas internas do modal
  const [activeTab, setActiveTab] = useState<"summary" | "columns" | "preview">("summary");

  // Estados do arquivo e abas da planilha
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Mapeamento personalizado: { [targetKey]: selectedFileColumn }
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({});

  // Configurações de importação
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [syncToSupabase, setSyncToSupabase] = useState<boolean>(defaultSyncToSupabase);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const isSupabaseReady = isSupabaseConfigured();

  // Dados existentes do sistema para conferência de duplicidade / atualização
  const [existingCnhs, setExistingCnhs] = useState<GeralCNH[]>([]);
  const [maxExistingOrdem, setMaxExistingOrdem] = useState<number>(0);

  // Carrega CNHs existentes do banco para cruzamento
  useEffect(() => {
    if (isOpen) {
      getGeralCNHs().then((list) => {
        setExistingCnhs(list);
        const max = list.reduce((m, item) => Math.max(m, item.ordem || 0), 0);
        setMaxExistingOrdem(max);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Efeito para carregar e inspecionar o arquivo XLSX / CSV
  useEffect(() => {
    if (!isOpen || !file) {
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet("");
      setRawRows([]);
      setFileHeaders([]);
      setParseError(null);
      return;
    }

    setLoadingFile(true);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: "array" });

        if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
          throw new Error("O arquivo não contém nenhuma planilha legível.");
        }

        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Encontra a aba mais provável ou usa a primeira
        const defaultSheet = wb.SheetNames.find((s) =>
          /geral|cnh|protocolo|candidato/i.test(s)
        ) || wb.SheetNames[0];

        setSelectedSheet(defaultSheet);
      } catch (err: any) {
        console.error("Erro ao ler planilha:", err);
        setParseError(err.message || "Erro desconhecido ao ler o arquivo Excel/CSV.");
      } finally {
        setLoadingFile(false);
      }
    };

    reader.onerror = () => {
      setParseError("Falha na leitura física do arquivo. Verifique permissões.");
      setLoadingFile(false);
    };

    reader.readAsArrayBuffer(file);
  }, [isOpen, file]);

  // Efeito ao trocar a aba selecionada da planilha
  useEffect(() => {
    if (!workbook || !selectedSheet) return;

    try {
      const ws = workbook.Sheets[selectedSheet];
      if (!ws) {
        setRawRows([]);
        setFileHeaders([]);
        return;
      }

      // Extrai cabeçalhos da primeira linha
      const headersAoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const rawHeaderRow = (headersAoa && headersAoa.length > 0 ? headersAoa[0] : []) as any[];
      const detectedHeaders = rawHeaderRow
        .map((h) => (h !== undefined && h !== null ? String(h).trim() : ""))
        .filter((h) => h !== "");

      // Extrai todas as linhas como JSON de objetos chave-valor
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      setRawRows(rows);
      setFileHeaders(detectedHeaders);

      // Auto-identifica mapeamento inicial de colunas
      const autoMap: Record<string, string> = {};
      TARGET_FIELDS.forEach((tf) => {
        // Tenta encontrar melhor correspondência
        for (const col of detectedHeaders) {
          const cleanCol = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          for (const pattern of tf.defaultPatterns) {
            if (pattern.test(cleanCol)) {
              autoMap[tf.key] = col;
              break;
            }
          }
          if (autoMap[tf.key]) break;
        }
      });

      setCustomMapping(autoMap);
    } catch (err: any) {
      console.error("Erro ao processar aba da planilha:", err);
      setParseError(`Erro ao extrair linhas da aba '${selectedSheet}': ${err.message}`);
    }
  }, [workbook, selectedSheet]);

  // Mapeamento e Análise em tempo real de todas as linhas com base nas colunas identificadas
  const analysis = useMemo(() => {
    if (rawRows.length === 0) {
      return {
        totalRows: 0,
        validItems: [] as GeralCNH[],
        invalidCount: 0,
        cpfCount: 0,
        situacaoDistribution: { Recebida: 0, Entregue: 0, Remetida: 0, Pendente: 0 } as Record<SituacaoGeral, number>,
        newRecordsCount: 0,
        existingRecordsCount: 0,
        firstSampleValues: {} as Record<string, string>
      };
    }

    const mapeamento = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
    const validItems: GeralCNH[] = [];
    let invalidCount = 0;
    let cpfCount = 0;
    const situacaoDistribution: Record<SituacaoGeral, number> = {
      Recebida: 0,
      Entregue: 0,
      Remetida: 0,
      Pendente: 0
    };

    // Amostras da primeira linha com valor preenchido
    const firstSampleValues: Record<string, string> = {};
    for (const h of fileHeaders) {
      for (const r of rawRows) {
        if (r[h] !== undefined && r[h] !== null && String(r[h]).trim() !== "") {
          firstSampleValues[h] = String(r[h]).trim();
          break;
        }
      }
    }

    // Processa cada linha através do mapeador oficial
    rawRows.forEach((row, idx) => {
      const item = mapSpreadsheetRowToGeralCNH(
        row,
        idx,
        maxExistingOrdem,
        mapeamento,
        "operador-preview",
        "Conferência Prévia",
        customMapping
      );

      if (item && item.nome && item.nome.trim().length >= 2) {
        validItems.push(item);
        if (item.cpf && item.cpf.replace(/\D/g, "").length >= 11) {
          cpfCount++;
        }
        if (situacaoDistribution[item.situacao] !== undefined) {
          situacaoDistribution[item.situacao]++;
        } else {
          situacaoDistribution.Recebida++;
        }
      } else {
        invalidCount++;
      }
    });

    // Cruzamento com a base atual (Novos vs Existentes)
    const existingCpfSet = new Set(
      existingCnhs.map((c) => c.cpf?.replace(/\D/g, "")).filter(Boolean)
    );
    const existingOrdemSet = new Set(existingCnhs.map((c) => c.ordem));

    let existingRecordsCount = 0;
    let newRecordsCount = 0;

    validItems.forEach((item) => {
      const cleanCpf = item.cpf?.replace(/\D/g, "");
      const matchByCpf = cleanCpf && existingCpfSet.has(cleanCpf);
      const matchByOrdem = existingOrdemSet.has(item.ordem);

      if (matchByCpf || matchByOrdem) {
        existingRecordsCount++;
      } else {
        newRecordsCount++;
      }
    });

    return {
      totalRows: rawRows.length,
      validItems,
      invalidCount,
      cpfCount,
      situacaoDistribution,
      newRecordsCount,
      existingRecordsCount,
      firstSampleValues
    };
  }, [rawRows, customMapping, maxExistingOrdem, existingCnhs, fileHeaders]);

  // Contagem de colunas identificadas
  const mappedCount = useMemo(() => {
    return Object.values(customMapping).filter(Boolean).length;
  }, [customMapping]);

  // Executar a Carga com Confirmação
  const handleConfirmAndImport = async () => {
    if (!file || analysis.validItems.length === 0) return;

    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await importSpreadsheetData(buffer, {
        syncToSupabase: syncToSupabase && isSupabaseReady,
        mode: importMode,
        sheetName: selectedSheet,
        customColumnMapping: customMapping
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      console.error("Erro ao carregar planilha:", err);
      alert(`Erro durante a carga dos dados: ${err.message || "Tente novamente."}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const isNomeIdentified = Boolean(customMapping.nome);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📑 Conferência e Identificação de Planilha de CNHs"
      size="5xl"
    >
      <div className="space-y-4 text-xs">
        {/* CABEÇALHO DO ARQUIVO + SELETOR DE ABA */}
        <div className="p-3.5 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-slate-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-850 rounded-2xl border border-blue-200/80 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">
                  {file?.name || "Planilha"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 uppercase">
                  {file?.name.endsWith(".csv") ? "CSV" : "Excel .xlsx"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Tamanho: {((file?.size || 0) / 1024).toFixed(1)} KB • Colunas Detectadas no cabeçalho: <strong>{fileHeaders.length}</strong>
              </p>
            </div>
          </div>

          {/* Seletor de Aba (se tiver mais de 1) */}
          {sheetNames.length > 1 && (
            <div className="flex items-center gap-2 shrink-0 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Aba da Planilha:
              </span>
              <select
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(e.target.value)}
                className="bg-transparent font-bold text-blue-600 dark:text-blue-400 outline-hidden cursor-pointer"
              >
                {sheetNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {parseError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{parseError}</span>
          </div>
        )}

        {/* CARDS DE CONFERÊNCIA DE QUANTIDADES (KPIs) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Card 1: Total Linhas */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Total Linhas</span>
              <Layers className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">
              {analysis.totalRows.toLocaleString("pt-BR")}
            </div>
            <span className="text-[10px] text-slate-500">Linhas na planilha</span>
          </div>

          {/* Card 2: Válidos para Carga */}
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Aptos p/ Carga</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">
              {analysis.validItems.length.toLocaleString("pt-BR")}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              Com titular identificado
            </span>
          </div>

          {/* Card 3: Linhas Ignoradas */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Descartadas</span>
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-lg font-black text-slate-600 dark:text-slate-400">
              {analysis.invalidCount}
            </div>
            <span className="text-[10px] text-slate-400">Linhas vazias / sem nome</span>
          </div>

          {/* Card 4: Com CPF */}
          <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Com CPF</span>
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-black text-blue-700 dark:text-blue-300">
              {analysis.cpfCount.toLocaleString("pt-BR")}
            </div>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
              {analysis.validItems.length > 0 ? `${Math.round((analysis.cpfCount / analysis.validItems.length) * 100)}% dos válidos` : "0%"}
            </span>
          </div>

          {/* Card 5: Novos vs Atualizações */}
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Novos / Base</span>
              <Database className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5 mt-1">
              <span className="text-emerald-600 font-black">+{analysis.newRecordsCount}</span>
              <span className="text-slate-400 font-normal">novos</span>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="text-blue-600 font-black">{analysis.existingRecordsCount}</span>
              <span className="text-slate-400 font-normal">existentes</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Cruzamento por CPF/Ordem</span>
          </div>
        </div>

        {/* NAVEGAÇÃO ENTRE AS ABAS DA CONFERÊNCIA */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "summary"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Resumo & Situações</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("columns")}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "columns"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Identificação de Colunas ({mappedCount}/{TARGET_FIELDS.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "preview"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Prévia dos Dados ({Math.min(10, analysis.validItems.length)} registros)</span>
            </button>
          </div>

          {!isNomeIdentified && (
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Nome não mapeado</span>
            </span>
          )}
        </div>

        {/* CONTEÚDO DAS ABAS */}
        {loadingFile ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
            <span>Analisando estrutura da planilha...</span>
          </div>
        ) : (
          <div>
            {/* ABA 1: RESUMO & SITUAÇÕES */}
            {activeTab === "summary" && (
              <div className="space-y-4">
                {/* Distribuição por Situação */}
                <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-blue-600" />
                      Distribuição de Situação Identificada na Planilha
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Total: {analysis.validItems.length} registros válidos
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-900/60 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-bold mb-1">
                        <Inbox className="w-3.5 h-3.5" />
                        <span>No Balcão (Recebidas)</span>
                      </div>
                      <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                        {analysis.situacaoDistribution.Recebida}
                      </div>
                      <span className="text-[10px] text-slate-400">Prontas para retirada</span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-900/60 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-bold mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Entregues</span>
                      </div>
                      <div className="text-xl font-black text-blue-600 dark:text-blue-400">
                        {analysis.situacaoDistribution.Entregue}
                      </div>
                      <span className="text-[10px] text-slate-400">Com entrega registrada</span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900/60 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-bold mb-1">
                        <Truck className="w-3.5 h-3.5" />
                        <span>Remetidas</span>
                      </div>
                      <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                        {analysis.situacaoDistribution.Remetida}
                      </div>
                      <span className="text-[10px] text-slate-400">Em trânsito / remessa</span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-bold mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pendentes</span>
                      </div>
                      <div className="text-xl font-black text-rose-600 dark:text-rose-400">
                        {analysis.situacaoDistribution.Pendente}
                      </div>
                      <span className="text-[10px] text-slate-400">Aguardando alocação</span>
                    </div>
                  </div>
                </div>

                {/* Checklist de Validação */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <span className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                    Checklist de Conferência e Prontidão
                  </span>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                      {isNomeIdentified ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <div className="flex-1">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Coluna de Nome do Titular
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {isNomeIdentified
                            ? `Mapeada para coluna '${customMapping.nome}'. ${analysis.validItems.length} nomes identificados com sucesso.`
                            : "Atenção: A coluna com o Nome do Candidato/Titular não foi detectada automaticamente. Acesse a aba 'Identificação de Colunas' para selecionar manualmente."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                      {customMapping.cpf ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Info className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <div className="flex-1">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Coluna de CPF
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {customMapping.cpf
                            ? `Mapeada para '${customMapping.cpf}'. ${analysis.cpfCount} registros possuem CPF válido.`
                            : "Coluna de CPF não identificada. O sistema usará o número de ordem (#) como chave primária de identificação."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="flex-1">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Alocação Física (Gaveta e Repartição)
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {customMapping.gaveta && customMapping.reparticao
                            ? `Colunas mapeadas diretamente da planilha: '${customMapping.gaveta}' e '${customMapping.reparticao}'.`
                            : "As CNHs que não tiverem gaveta explícita na planilha serão alocadas automaticamente com base na inicial do nome (Regra Oficial A-Z)."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: IDENTIFICAÇÃO DE COLUNAS */}
            {activeTab === "columns" && (
              <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-900 dark:text-blue-200 text-[11px] leading-relaxed">
                  💡 <strong>Correspondência Inteligente:</strong> O sistema detectou automaticamente as melhores correspondências de cabeçalho. Você pode alterar a seleção de qualquer coluna abaixo caso sua planilha utilize nomes diferentes.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {TARGET_FIELDS.map((tf) => {
                    const currentMapped = customMapping[tf.key] || "";
                    const sample = currentMapped ? analysis.firstSampleValues[currentMapped] : "";
                    const Icon = tf.icon;

                    return (
                      <div
                        key={tf.key}
                        className={`p-3 rounded-xl border transition-all ${
                          currentMapped
                            ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs"
                            : tf.required
                            ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900/60"
                            : "bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="font-bold text-slate-900 dark:text-white">
                              {tf.label}
                            </span>
                            {tf.required && (
                              <span className="text-[10px] text-rose-500 font-bold">*</span>
                            )}
                          </div>

                          {currentMapped ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <Check className="w-2.5 h-2.5" />
                              Identificado
                            </span>
                          ) : tf.required ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Não Mapeado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Automático
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                          {tf.description}
                        </p>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-400 block">
                            Coluna correspondente na planilha:
                          </label>
                          <select
                            value={currentMapped}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomMapping((prev) => ({
                                ...prev,
                                [tf.key]: val
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
                          >
                            <option value="">(Nenhuma / Usar padrão do sistema)</option>
                            {fileHeaders.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        {sample && (
                          <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[10px]">
                            <span className="text-slate-400 font-medium shrink-0">Exemplo lido:</span>
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-200 truncate">
                              "{sample}"
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ABA 3: PRÉVIA DOS DADOS */}
            {activeTab === "preview" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    Exibindo amostra das primeiras <strong>{Math.min(10, analysis.validItems.length)}</strong> linhas processadas de <strong>{analysis.validItems.length}</strong> válidas:
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓ Formato pronto para inserção
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-[46vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-10 select-none">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-16"># Ordem</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Nome do Titular</th>
                        <th className="py-2.5 px-3 w-32">CPF</th>
                        <th className="py-2.5 px-3 text-center w-24">Gaveta</th>
                        <th className="py-2.5 px-3 text-center w-28">Repartição</th>
                        <th className="py-2.5 px-3 text-center w-28">Situação</th>
                        <th className="py-2.5 px-3 w-28">PA</th>
                        <th className="py-2.5 px-3 w-32">Telefone</th>
                        <th className="py-2.5 px-3 min-w-[140px]">Responsável</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                      {analysis.validItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400">
                            Nenhum registro pôde ser pré-visualizado. Verifique se o nome do titular foi mapeado.
                          </td>
                        </tr>
                      ) : (
                        analysis.validItems.slice(0, 10).map((item, idx) => (
                          <tr key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-3 text-center font-mono font-bold text-blue-600">
                              #{item.ordem}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">
                              {item.nome}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                              {item.cpf ? formatCPF(item.cpf) : <span className="text-slate-400 italic">-</span>}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                                {item.gaveta || "G-01"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                                {item.reparticao || "Protocolo"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <Badge situacao={item.situacao} />
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {item.pa || "-"}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {item.telefone ? formatPhone(item.telefone) : "-"}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-xs">
                              {item.responsavel_nome || "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONFIGURAÇÕES DE INSERÇÃO E SINCRONIZAÇÃO */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Modo de Carga */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-900 dark:text-white block">
                Modo de Inserção:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label
                  onClick={() => setImportMode("merge")}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2 ${
                    importMode === "merge"
                      ? "bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-900 dark:text-blue-100 ring-1 ring-blue-500"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="modalImportMode"
                    checked={importMode === "merge"}
                    onChange={() => {}}
                    className="w-3.5 h-3.5 text-blue-600"
                  />
                  <div>
                    <span className="block font-bold text-xs">Mesclar / Atualizar</span>
                    <span className="block text-[10px] text-slate-400">Preserva dados atuais</span>
                  </div>
                </label>

                <label
                  onClick={() => setImportMode("replace")}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2 ${
                    importMode === "replace"
                      ? "bg-rose-50 dark:bg-rose-950/60 border-rose-600 text-rose-900 dark:text-rose-100 ring-1 ring-rose-500"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="modalImportMode"
                    checked={importMode === "replace"}
                    onChange={() => {}}
                    className="w-3.5 h-3.5 text-rose-600"
                  />
                  <div>
                    <span className="block font-bold text-xs text-rose-600 dark:text-rose-400">Substituir Tabela</span>
                    <span className="block text-[10px] text-slate-400">Substitui a lista toda</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Sincronização Supabase */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-900 dark:text-white block">
                Sincronização em Nuvem:
              </label>
              <label className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncToSupabase}
                  onChange={(e) => setSyncToSupabase(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <span className="block font-bold text-xs text-slate-900 dark:text-white">
                    Gravar e Sincronizar com o Supabase
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {isSupabaseReady
                      ? "Conexão ativa: upsert em lote na tabela 'geral_cnhs'"
                      : "Supabase não conectado: gravará apenas no banco local"}
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* RODAPÉ E BOTÕES DE CONFIRMAÇÃO */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500">
            {isNomeIdentified ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Pronto para carregar {analysis.validItems.length} registros no sistema.</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-500 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Selecione a coluna 'Nome do Titular' antes de continuar.</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmAndImport}
              disabled={isProcessing || !isNomeIdentified || analysis.validItems.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Carregando Dados...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Carregar {analysis.validItems.length.toLocaleString("pt-BR")} CNHs para o Sistema</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
