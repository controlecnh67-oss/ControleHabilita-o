import React, { useState, useEffect, useMemo } from "react";
import { 
  Archive, 
  Layers, 
  ChevronRight, 
  FolderArchive, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  Hash,
  Sparkles,
  LayoutGrid,
  X,
  Search,
  FileText,
  User,
  Calendar,
  ArrowDownAZ,
  ArrowUpZA,
  ArrowDown01,
  FileDown,
  Printer,
  CheckSquare,
  SlidersHorizontal,
  Check,
  RotateCcw
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrgaoConfig, addPDFHeaderLogo } from "../services/orgaoService";
import { MapaArquivoFisico, MapaGavetaItem, MapaReparticaoItem, GeralCNH } from "../types";
import { getGeralCNHs } from "../services/db";
import { formatDateTime, formatCPF } from "../lib/utils";

interface Props {
  data?: MapaArquivoFisico;
  onSelectReparticao?: (gavetaNum: number, reparticaoNum: number) => void;
}

type TipoOrdenacao = "az" | "za" | "ordem_asc" | "ordem_desc" | "recentes";

export const MapaArquivoFisicoCard: React.FC<Props> = ({ data, onSelectReparticao }) => {
  const [gavetaFiltro, setGavetaFiltro] = useState<number | "todas">("todas");
  const [reparticaoHover, setReparticaoHover] = useState<{ gavetaNum: number; repNum: number } | null>(null);

  // Estado para o Modal de Inspeção de CNHs da Repartição
  const [modalReparticao, setModalReparticao] = useState<{
    gavetaNum: number;
    repNum: number;
    iniciais: string[];
    total: number;
  } | null>(null);

  const [loadingCNHs, setLoadingCNHs] = useState(false);
  const [cnhsReparticao, setCnhsReparticao] = useState<GeralCNH[]>([]);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [tipoOrdenacao, setTipoOrdenacao] = useState<TipoOrdenacao>("az");
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 4000);
  };

  // Carregar CNHs quando o modal for aberto
  useEffect(() => {
    if (!modalReparticao) {
      setCnhsReparticao([]);
      setFiltroBusca("");
      setTipoOrdenacao("az");
      return;
    }

    let isMounted = true;
    setLoadingCNHs(true);

    const carregar = async () => {
      try {
        const todas = await getGeralCNHs();
        if (!isMounted) return;

        const parseNum = (val?: string) => {
          if (!val) return null;
          const m = String(val).match(/(\d+)/);
          return m ? parseInt(m[1], 10) : null;
        };

        const filtradas = todas.filter((c) => {
          if (c.situacao !== "Recebida") return false;
          let g = parseNum(c.gaveta);
          let r = parseNum(c.reparticao);

          // Se faltar gaveta/repartição mas tiver inicial correspondente
          if ((!g || !r) && c.nome && modalReparticao.iniciais.length > 0) {
            const init = c.nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()[0];
            if (modalReparticao.iniciais.includes(init)) {
              return true;
            }
          }

          return g === modalReparticao.gavetaNum && r === modalReparticao.repNum;
        });

        setCnhsReparticao(filtradas);
      } catch (err) {
        console.error("Erro ao carregar CNHs da repartição:", err);
      } finally {
        if (isMounted) setLoadingCNHs(false);
      }
    };

    carregar();

    return () => {
      isMounted = false;
    };
  }, [modalReparticao]);

  // Lista com busca aplicada e ordenação rigorosa
  const cnhsProcessadas = useMemo(() => {
    let list = [...cnhsReparticao];

    if (filtroBusca.trim()) {
      const term = filtroBusca.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.nome.toLowerCase().includes(term) ||
          (c.cpf && c.cpf.includes(term)) ||
          (c.ordem && String(c.ordem).includes(term))
      );
    }

    list.sort((a, b) => {
      if (tipoOrdenacao === "az") {
        return (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" });
      }
      if (tipoOrdenacao === "za") {
        return (b.nome || "").localeCompare(a.nome || "", "pt-BR", { sensitivity: "base" });
      }
      if (tipoOrdenacao === "ordem_asc") {
        const numA = typeof a.ordem === "number" ? a.ordem : parseInt(String(a.ordem || 0), 10) || 0;
        const numB = typeof b.ordem === "number" ? b.ordem : parseInt(String(b.ordem || 0), 10) || 0;
        return numA - numB;
      }
      if (tipoOrdenacao === "ordem_desc") {
        const numA = typeof a.ordem === "number" ? a.ordem : parseInt(String(a.ordem || 0), 10) || 0;
        const numB = typeof b.ordem === "number" ? b.ordem : parseInt(String(b.ordem || 0), 10) || 0;
        return numB - numA;
      }
      if (tipoOrdenacao === "recentes") {
        const dateA = a.data_movimento ? new Date(a.data_movimento).getTime() : 0;
        const dateB = b.data_movimento ? new Date(b.data_movimento).getTime() : 0;
        return dateB - dateA;
      }
      return 0;
    });

    return list;
  }, [cnhsReparticao, filtroBusca, tipoOrdenacao]);

  if (!data) return null;

  const gavetasFiltradas = gavetaFiltro === "todas" 
    ? data.gavetas 
    : data.gavetas.filter((g) => g.numero === gavetaFiltro);

  const handleAbrirReparticao = (gavetaNum: number, rep: MapaReparticaoItem) => {
    setModalReparticao({
      gavetaNum,
      repNum: rep.numero,
      iniciais: rep.iniciais,
      total: rep.total
    });
    if (onSelectReparticao) {
      onSelectReparticao(gavetaNum, rep.numero);
    }
  };

  // Helper para cor de intensidade da repartição com base na quantidade
  const getReparticaoColor = (total: number) => {
    if (total === 0) {
      return {
        bg: "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500",
        badge: "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700",
        bar: "bg-slate-300 dark:bg-slate-700",
        tag: "Vazio"
      };
    }
    if (total <= 15) {
      return {
        bg: "bg-blue-50/70 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 text-blue-950 dark:text-blue-200 hover:border-blue-300 dark:hover:border-blue-700",
        badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
        bar: "bg-blue-500",
        tag: "Baixo"
      };
    }
    if (total <= 35) {
      return {
        bg: "bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200 hover:border-indigo-300 dark:hover:border-indigo-700",
        badge: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700",
        bar: "bg-indigo-500",
        tag: "Médio"
      };
    }
    return {
      bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 text-purple-950 dark:text-purple-200 hover:border-purple-400 dark:hover:border-purple-600 shadow-sm",
      badge: "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-200 border-purple-300 dark:border-purple-700",
      bar: "bg-purple-600",
      tag: "Alto"
    };
  };

  // Função para Gerar o PDF de Balanço e Auditoria Física de uma Repartição
  const handleBaixarBalancoReparticao = () => {
    if (!modalReparticao) return;
    setGerandoPDF(true);

    try {
      const cfg = getOrgaoConfig();
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
      const rightMarginX = pageWidth - 14;

      // Ordena de A a Z para a auditoria física da pasta
      const itemsParaImprimir = [...cnhsProcessadas];
      const dataStr = `Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

      const tableData = itemsParaImprimir.map((c, idx) => [
        `${idx + 1}`,
        `#${c.ordem || "-"}`,
        (c.nome || "").toUpperCase(),
        c.cpf ? formatCPF(c.cpf) : "-",
        c.pa || "-",
        "[   ] OK",
        ""
      ]);

      autoTable(doc, {
        startY: 32,
        margin: { top: 32, bottom: 22, left: 14, right: 14 },
        head: [["Nº", "Ordem", "Nome do Titular / Condutor", "CPF", "PA", "Conferência Física", "Observações"]],
        body: tableData,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 1.6,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [30, 58, 138], // blue-900
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          fontSize: 8,
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 10, fontStyle: "bold" },
          1: { halign: "center", cellWidth: 16, fontStyle: "bold" },
          2: { cellWidth: 70, fontStyle: "bold" },
          3: { halign: "center", cellWidth: 28 },
          4: { halign: "center", cellWidth: 15 },
          5: { halign: "center", cellWidth: 26, fontStyle: "bold" },
          6: { cellWidth: "auto" },
        },
        didDrawPage: (pageData) => {
          const hasLogo = addPDFHeaderLogo(doc, 14, 6, 15, 15);
          const startTextX = hasLogo ? 33 : 14;

          // Cabeçalho Institucional
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(15, 23, 42);
          doc.text(`${cfg.sigla || "DETRAN"} — SETOR OPERACIONAL DE PROTOCOLO E HABILITAÇÃO`, startTextX, 11);

          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 58, 138); // blue-900
          doc.text(`BALANÇO E AUDITORIA FÍSICA DE ESTOQUE • GAVETA ${modalReparticao.gavetaNum} — REPARTIÇÃO ${modalReparticao.repNum}`, startTextX, 16);

          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
          const letrasTexto = modalReparticao.iniciais.length > 0 ? `Iniciais: [ ${modalReparticao.iniciais.join(", ")} ]` : "Todas as iniciais";
          doc.text(`${letrasTexto} • Classificação de A para Z para conferência física nas pastas`, startTextX, 20.5);

          // Metadados à direita
          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);
          doc.text(dataStr, rightMarginX, 11, { align: "right" });
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 58, 138);
          doc.text(`Estoque Físico: ${itemsParaImprimir.length} CNHs`, rightMarginX, 16, { align: "right" });
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 116, 139);
          doc.text("Status: Recebida", rightMarginX, 20.5, { align: "right" });

          // Linha divisória
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.4);
          doc.line(14, 23.5, rightMarginX, 23.5);

          // Rodapé em TODAS as páginas
          const pageStr = `Página ${pageData.pageNumber}`;
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text("Sistema DETRAN-PROT — Folha Oficial de Balanço Físico e Auditoria de Pastas Suspensas", 14, pageHeight - 7);
          doc.text(pageStr, rightMarginX, pageHeight - 7, { align: "right" });
        },
      });

      // Bloco de Termo de Encerramento da Auditoria
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      let termoY = finalY + 6;
      if (termoY + 30 > pageHeight - 15) {
        doc.addPage();
        termoY = 25;
      }

      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, termoY, pageWidth - 28, 26, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("TERMO DE ENCERRAMENTO DA AUDITORIA FÍSICA:", 18, termoY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Total de CNHs Esperadas: ${itemsParaImprimir.length}    |    Total Conferido: [ ______ ]    |    Divergências: [   ] Nenhuma   [   ] Divergência anotada`,
        18,
        termoY + 10
      );

      doc.text(
        "Data da Auditoria: _____/_____/202___       Assinatura do Conferente: ____________________________________________________",
        18,
        termoY + 17
      );
      doc.text(
        "Nome Legível: _________________________________________    Matrícula / Cargo: _______________________________________",
        18,
        termoY + 22
      );

      const nomeArquivo = `Balanco_Gaveta_${modalReparticao.gavetaNum}_Rep_${modalReparticao.repNum}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(nomeArquivo);

      showToast(`✅ PDF de Balanço da Gaveta ${modalReparticao.gavetaNum} • Repartição ${modalReparticao.repNum} gerado com sucesso!`);
    } catch (err: any) {
      console.error("Erro ao gerar PDF de balanço da repartição:", err);
      alert("Erro ao gerar PDF: " + (err.message || "Tente novamente"));
    } finally {
      setGerandoPDF(false);
    }
  };

  // Função para Gerar o PDF de Balanço Consolidado da Gaveta Inteira (todas as 8 repartições)
  const handleBaixarBalancoGaveta = async (gaveta: MapaGavetaItem) => {
    setGerandoPDF(true);
    try {
      const todas = await getGeralCNHs();
      const parseNum = (val?: string) => {
        if (!val) return null;
        const m = String(val).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
      };

      // CNHs da gaveta
      const cnhsGaveta = todas.filter((c) => {
        if (c.situacao !== "Recebida") return false;
        const g = parseNum(c.gaveta);
        return g === gaveta.numero;
      });

      const cfg = getOrgaoConfig();
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const rightMarginX = pageWidth - 14;
      const dataStr = `Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

      // Monta as linhas agrupadas por repartição (1 a 8)
      const tableData: (string | { content: string; colSpan: number; styles: any })[][] = [];

      gaveta.reparticoes.forEach((rep) => {
        // CNHs desta repartição
        const cnhsRep = cnhsGaveta.filter((c) => {
          const r = parseNum(c.reparticao);
          if (!r && c.nome && rep.iniciais.length > 0) {
            const init = c.nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()[0];
            return rep.iniciais.includes(init);
          }
          return r === rep.numero;
        });

        // Ordenar A-Z
        cnhsRep.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" }));

        // Linha divisória de Repartição
        const letrasTxt = rep.iniciais.length > 0 ? `[ Iniciais: ${rep.iniciais.join(", ")} ]` : "";
        tableData.push([
          {
            content: `REPARTIÇÃO ${rep.numero} ${letrasTxt} • TOTAL: ${cnhsRep.length} CNHs EM ESTOQUE`,
            colSpan: 7,
            styles: {
              fillColor: [238, 242, 255], // indigo-50
              textColor: [30, 58, 138], // blue-900
              fontStyle: "bold",
              halign: "left",
              cellPadding: 2,
            },
          },
        ]);

        if (cnhsRep.length === 0) {
          tableData.push([
            {
              content: "Nenhuma CNH física cadastrada nesta repartição",
              colSpan: 7,
              styles: {
                textColor: [148, 163, 184],
                fontStyle: "italic",
                halign: "center",
                cellPadding: 1.5,
              },
            },
          ]);
        } else {
          cnhsRep.forEach((c, idx) => {
            tableData.push([
              `${idx + 1}`,
              `#${c.ordem || "-"}`,
              (c.nome || "").toUpperCase(),
              c.cpf ? formatCPF(c.cpf) : "-",
              c.pa || "-",
              "[   ] OK",
              ""
            ]);
          });
        }
      });

      autoTable(doc, {
        startY: 32,
        margin: { top: 32, bottom: 22, left: 14, right: 14 },
        head: [["Nº", "Ordem", "Nome do Titular / Condutor", "CPF", "PA", "Conferência Física", "Observações"]],
        body: tableData as any,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 1.5,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          fontSize: 8,
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 10, fontStyle: "bold" },
          1: { halign: "center", cellWidth: 16, fontStyle: "bold" },
          2: { cellWidth: 70, fontStyle: "bold" },
          3: { halign: "center", cellWidth: 28 },
          4: { halign: "center", cellWidth: 15 },
          5: { halign: "center", cellWidth: 26, fontStyle: "bold" },
          6: { cellWidth: "auto" },
        },
        didDrawPage: (pageData) => {
          const hasLogo = addPDFHeaderLogo(doc, 14, 6, 15, 15);
          const startTextX = hasLogo ? 33 : 14;

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(15, 23, 42);
          doc.text(`${cfg.sigla || "DETRAN"} — SETOR OPERACIONAL DE PROTOCOLO E HABILITAÇÃO`, startTextX, 11);

          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 58, 138);
          doc.text(`BALANÇO GERAL DE ESTOQUE • ${gaveta.nome.toUpperCase()} (8 REPARTIÇÕES)`, startTextX, 16);

          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
          doc.text("Auditoria física consolidada com classificação alfabética (A → Z) de cada pasta", startTextX, 20.5);

          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);
          doc.text(dataStr, rightMarginX, 11, { align: "right" });
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 58, 138);
          doc.text(`Total Gaveta: ${cnhsGaveta.length} CNHs`, rightMarginX, 16, { align: "right" });
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 116, 139);
          doc.text("Status: Recebida", rightMarginX, 20.5, { align: "right" });

          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.4);
          doc.line(14, 23.5, rightMarginX, 23.5);

          const pageStr = `Página ${pageData.pageNumber}`;
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text("Sistema DETRAN-PROT — Folha Oficial de Balanço Físico e Auditoria de Gavetas", 14, pageHeight - 7);
          doc.text(pageStr, rightMarginX, pageHeight - 7, { align: "right" });
        },
      });

      // Termo de Encerramento
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      let termoY = finalY + 6;
      if (termoY + 30 > pageHeight - 15) {
        doc.addPage();
        termoY = 25;
      }

      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, termoY, pageWidth - 28, 26, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`TERMO DE AUDITORIA CONSOLIDADA • ${gaveta.nome.toUpperCase()}:`, 18, termoY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Total Esperado: ${cnhsGaveta.length} CNHs    |    Total Conferido: [ ______ ]    |    Divergências: [   ] Nenhuma   [   ] Divergência anotada`,
        18,
        termoY + 10
      );

      doc.text(
        "Data da Auditoria: _____/_____/202___       Assinatura do Conferente: ____________________________________________________",
        18,
        termoY + 17
      );
      doc.text(
        "Nome Legível: _________________________________________    Matrícula / Cargo: _______________________________________",
        18,
        termoY + 22
      );

      doc.save(`Balanco_Geral_${gaveta.nome.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast(`✅ PDF de Balanço da ${gaveta.nome} gerado com sucesso!`);
    } catch (err: any) {
      console.error("Erro ao gerar PDF da gaveta:", err);
      alert("Erro ao gerar PDF: " + (err.message || "Tente novamente"));
    } finally {
      setGerandoPDF(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm p-5 transition-all relative">
      {/* Toast Feedback */}
      {toastMsg && (
        <div className="absolute top-4 right-4 z-40 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2 rounded-lg text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Cabeçalho do Mapa Físico */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                Mapa Visual do Arquivo Físico
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  4 Gavetas × 8 Repartições (32 Compartimentos)
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Alocação espacial e contagem das CNHs com situação <strong>Recebida</strong> no arquivo físico de aço do protocolo.
              </p>
            </div>
          </div>
        </div>

        {/* Resumo Rápido das 4 Gavetas */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Estoque em Gavetas</span>
            <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">{data.totalFisico} CNHs</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Ocupação das Repartições</span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {data.reparticoesComCNH} / {data.totalCompartimentos} <span className="text-xs font-medium text-slate-400">({Math.round((data.reparticoesComCNH / data.totalCompartimentos) * 100)}%)</span>
            </span>
          </div>
          {data.gavetaMaiorVolume && (
            <div className="bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Maior Volume</span>
              <span className="text-sm font-extrabold text-purple-600 dark:text-purple-400">
                {data.gavetaMaiorVolume.nome} ({data.gavetaMaiorVolume.total})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Legenda */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-slate-100 dark:border-slate-800/60">
        {/* Seletor de Gaveta */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
            <LayoutGrid className="w-3.5 h-3.5" />
            Filtrar Gaveta:
          </span>
          <button
            onClick={() => setGavetaFiltro("todas")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              gavetaFiltro === "todas"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Todas (Visão Completa)
          </button>
          {data.gavetas.map((g) => (
            <button
              key={g.numero}
              onClick={() => setGavetaFiltro(g.numero)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                gavetaFiltro === g.numero
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>{g.nome}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                gavetaFiltro === g.numero ? "bg-blue-700 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}>
                {g.total}
              </span>
            </button>
          ))}
        </div>

        {/* Legenda de Densidade */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-400">Legenda:</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 inline-block" />
            Vazio (0)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-300 dark:bg-blue-700 inline-block" />
            Baixo (1-15)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 dark:bg-indigo-600 inline-block" />
            Médio (16-35)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-600 dark:bg-purple-700 inline-block" />
            Alto (&gt;35)
          </span>
        </div>
      </div>

      {/* Grid de Gavetas Físicas */}
      <div className="mt-4 space-y-4">
        {gavetasFiltradas.map((gaveta) => (
          <div
            key={gaveta.numero}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 transition-all shadow-xs"
          >
            {/* Topo Estilizado da Gaveta (Efeito Puxador e Etiqueta Metálica do Arquivo) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {/* Puxador Metálico Decorativo */}
                <div className="w-9 h-6 bg-gradient-to-b from-slate-200 to-slate-400 dark:from-slate-700 dark:to-slate-800 rounded border border-slate-300 dark:border-slate-600 flex items-center justify-center shadow-inner shrink-0">
                  <div className="w-5 h-1.5 bg-slate-100 dark:bg-slate-900 rounded-xs shadow-xs" />
                </div>

                {/* Etiqueta de Identificação da Gaveta */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tracking-widest uppercase text-slate-800 dark:text-slate-100 font-mono">
                      {gaveta.nome}
                    </span>
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                      {gaveta.total} CNHs físicas
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      ({gaveta.percentualTotal}% do estoque geral)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    8 repartições organizadoras internas (Pastas suspensas de 1 a 8)
                  </p>
                </div>
              </div>

              {/* Ações da Gaveta: Botão de Balanço em PDF + Barra de Distribuição */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => handleBaixarBalancoGaveta(gaveta)}
                  disabled={gerandoPDF}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                  title={`Baixar relatório consolidado de auditoria e balanço físico da ${gaveta.nome} em PDF (todas as 8 repartições)`}
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Balanço da Gaveta (PDF)</span>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-24 sm:w-32 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (gaveta.total / (data.totalFisico || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 font-mono shrink-0">
                    {gaveta.total} un.
                  </span>
                </div>
              </div>
            </div>

            {/* As 8 Repartições da Gaveta (Grid 8 colunas ou 4x2 responsivo) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {gaveta.reparticoes.map((rep) => {
                const colors = getReparticaoColor(rep.total);
                const isHovered = reparticaoHover?.gavetaNum === gaveta.numero && reparticaoHover?.repNum === rep.numero;

                return (
                  <div
                    key={rep.numero}
                    onMouseEnter={() => setReparticaoHover({ gavetaNum: gaveta.numero, repNum: rep.numero })}
                    onMouseLeave={() => setReparticaoHover(null)}
                    onClick={() => handleAbrirReparticao(gaveta.numero, rep)}
                    className={`relative rounded-lg border p-3 flex flex-col justify-between transition-all cursor-pointer select-none ${colors.bg} ${
                      isHovered ? "ring-2 ring-blue-500 dark:ring-blue-400 scale-[1.02] z-10" : ""
                    }`}
                  >
                    {/* Topo da Repartição: Número e Letras */}
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide opacity-80">
                        Rep. {rep.numero}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${colors.badge}`}>
                        {colors.tag}
                      </span>
                    </div>

                    {/* Letras / Iniciais Mapeadas */}
                    <div className="min-h-[22px] flex items-center flex-wrap gap-1 mb-2">
                      {rep.iniciais.length > 0 ? (
                        rep.iniciais.map((letra, lIdx) => (
                          <span
                            key={lIdx}
                            className="inline-block text-[11px] font-black px-1.5 py-0.2 bg-white/80 dark:bg-slate-900/80 rounded border border-slate-200 dark:border-slate-700 shadow-2xs font-mono text-slate-800 dark:text-slate-200"
                            title={`Inicial atendida: ${letra}`}
                          >
                            {letra}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">sem letra</span>
                      )}
                    </div>

                    {/* Quantidade em Destaque Grande */}
                    <div className="my-1 flex items-baseline justify-between">
                      <div>
                        <span className="text-xl font-black tracking-tight font-mono">
                          {rep.total}
                        </span>
                        <span className="text-[10px] opacity-70 ml-1 font-semibold">CNHs</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {rep.percentualGaveta}%
                      </span>
                    </div>

                    {/* Mini barra de preenchimento */}
                    <div className="w-full bg-slate-200/70 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full ${colors.bar} transition-all duration-300`}
                        style={{ width: `${Math.min(100, (rep.total / (gaveta.total || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Alerta caso existam CNHs com status "Recebida" aguardando definição física */}
      {data.outrasNaoAlocadas > 0 && (
        <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Atenção:</strong> Existem <strong>{data.outrasNaoAlocadas} CNHs recebidas</strong> com dados de gaveta ou repartição ainda não associados à grade 4×8.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 underline cursor-pointer">
            Verificar em Geral
          </span>
        </div>
      )}

      {/* Modal de Inspeção das CNHs da Repartição com Ordenação A-Z e Download de PDF para Balanço */}
      {modalReparticao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>Gaveta {modalReparticao.gavetaNum} • Repartição {modalReparticao.repNum}</span>
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {cnhsReparticao.length} CNHs em estoque
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {modalReparticao.iniciais.length > 0 
                      ? `Iniciais alfabéticas atendidas: [ ${modalReparticao.iniciais.join(", ")} ]`
                      : "Sem letras exclusivas configuradas"}
                  </p>
                </div>
              </div>

              {/* Botão Baixar Balanço (PDF) no Topo e Fechar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBaixarBalancoReparticao}
                  disabled={cnhsReparticao.length === 0 || gerandoPDF}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer hover:shadow"
                  title="Baixar lista desta repartição em PDF para auditoria e conferência física"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>{gerandoPDF ? "Gerando PDF..." : "Baixar Balanço (PDF)"}</span>
                </button>

                <button
                  onClick={() => setModalReparticao(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Fechar janela"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Barra de Busca Rápida + SELEÇÃO DE ORDENAÇÃO (A → Z, Z → A, Nº Ordem, Data) */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* Campo de Busca */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, CPF ou ordem nesta repartição..."
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {filtroBusca && (
                <button
                  onClick={() => setFiltroBusca("")}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0"
                >
                  Limpar busca
                </button>
              )}

              {/* Botões de Ordenação */}
              <div className="flex items-center gap-1 shrink-0 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700/60">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 px-1.5 uppercase tracking-wider flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3" />
                  Ordenar:
                </span>
                <button
                  onClick={() => setTipoOrdenacao("az")}
                  title="Ordenar Alfabeticamente de A para Z (Padrão para Auditoria Física)"
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                    tipoOrdenacao === "az"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <ArrowDownAZ className="w-3.5 h-3.5" />
                  <span>A → Z</span>
                </button>

                <button
                  onClick={() => setTipoOrdenacao("za")}
                  title="Ordenar Alfabeticamente de Z para A"
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                    tipoOrdenacao === "za"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <ArrowUpZA className="w-3.5 h-3.5" />
                  <span>Z → A</span>
                </button>

                <button
                  onClick={() => setTipoOrdenacao("ordem_asc")}
                  title="Ordenar por Número de Ordem Crescente"
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                    tipoOrdenacao === "ordem_asc"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <Hash className="w-3 h-3" />
                  <span>Nº Ordem</span>
                </button>

                <button
                  onClick={() => setTipoOrdenacao("recentes")}
                  title="Ordenar por Data de Movimento (Mais Recentes Primeiro)"
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                    tipoOrdenacao === "recentes"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>Data</span>
                </button>
              </div>
            </div>

            {/* Lista de CNHs */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100 dark:divide-slate-800">
              {loadingCNHs ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Localizando CNHs físicas no estoque...</span>
                </div>
              ) : cnhsProcessadas.length > 0 ? (
                cnhsProcessadas.map((cnh, index) => (
                  <div key={cnh.id} className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-md transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Numeração de Linha + Ordem */}
                      <span className="text-[10px] text-slate-400 font-mono w-5 text-right shrink-0">
                        {index + 1}.
                      </span>
                      <span className="w-8 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold flex items-center justify-center text-[10px] shrink-0 border border-slate-200/80 dark:border-slate-700">
                        {cnh.ordem ? `#${cnh.ordem}` : "•"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                          {cnh.nome}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                          <span>CPF: {cnh.cpf ? formatCPF(cnh.cpf) : "Não informado"}</span>
                          {cnh.pa && <span>• PA: <strong>{cnh.pa}</strong></span>}
                          {cnh.data_movimento && <span>• Mov: {formatDateTime(cnh.data_movimento)}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50">
                        <CheckCircle2 className="w-3 h-3 text-blue-500" />
                        Recebida
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <FolderArchive className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    {filtroBusca ? "Nenhuma CNH encontrada para a busca." : "Nenhuma CNH física nesta repartição no momento."}
                  </p>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  Exibindo <strong>{cnhsProcessadas.length}</strong> de {cnhsReparticao.length} CNHs físicas
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  {tipoOrdenacao === "az" && "Ordem Alfabética (A → Z)"}
                  {tipoOrdenacao === "za" && "Ordem Alfabética Inversa (Z → A)"}
                  {tipoOrdenacao === "ordem_asc" && "Nº de Ordem Crescente"}
                  {tipoOrdenacao === "ordem_desc" && "Nº de Ordem Decrescente"}
                  {tipoOrdenacao === "recentes" && "Data de Movimento (Recentes)"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleBaixarBalancoReparticao}
                  disabled={cnhsReparticao.length === 0 || gerandoPDF}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Baixar folha de balanço físico em PDF desta repartição"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>{gerandoPDF ? "Gerando..." : "Baixar Balanço (PDF)"}</span>
                </button>

                <button
                  onClick={() => setModalReparticao(null)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md font-semibold transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
