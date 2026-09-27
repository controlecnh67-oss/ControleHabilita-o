import React, { useState, useMemo } from "react";
import {
  BookOpen,
  Download,
  Printer,
  Search,
  CheckCircle2,
  Users,
  ShieldCheck,
  UserCheck,
  Eye,
  FolderArchive,
  Layers,
  Inbox,
  ArrowRight,
  HelpCircle,
  Sparkles,
  FileSpreadsheet,
  QrCode,
  FileCheck,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  HardDrive,
  Database,
  ExternalLink,
  Info,
  Check
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrgaoConfig, addPDFHeaderLogo } from "../../services/orgaoService";
import { PerfilUsuario } from "../../types";

export const ManualUsuarioSubTab: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<PerfilUsuario | "todos">("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const orgaoConfig = getOrgaoConfig();

  const handleCopyText = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // FAQs didáticas
  const faqs = [
    {
      q: "O cidadão veio retirar uma nova CNH (renovação), mas o sistema já tinha uma CNH antiga. O que acontece?",
      a: "O número do PA (Processo de Habilitação) é único para cada processo. Ao receber a nova CNH via Excel ou cadastro, o sistema identifica que é um novo processo/renovação do mesmo CPF e gera automaticamente um NOVO NÚMERO DE ORDEM sequencial na tabela geral, mantendo a CNH anterior arquivada com seu histórico intacto. O cidadão pode ter múltiplos processos registrados ao longo do tempo."
    },
    {
      q: "Como gravar o número do LOTE ao importar planilhas Excel?",
      a: "Na aba Protocolo Geral, clique em 'Importar Excel (Recebidas)'. O assistente detecta automaticamente a coluna LOTE (ou você pode selecioná-la manualmente no seletor). Se a planilha não tiver a coluna, você pode preencher o campo 'Lote Padrão'. Ao confirmar, o lote é gravado individualmente em cada CNH recebida."
    },
    {
      q: "Como localizar uma CNH em menos de 5 segundos no balcão de atendimento?",
      a: "Acesse a aba 'Consulta CNH' ou 'Protocolo Entrega'. No campo de busca rápida, digite apenas os números do CPF (sem pontos) ou o primeiro nome do titular. O sistema filtra instantaneamente. A gaveta e a repartição são exibidas em destaque (ex.: Gaveta 2 / Repartição 4)."
    },
    {
      q: "Como emitir a Declaração de Retirada para procuradores, despachantes ou CFCs?",
      a: "Acesse a aba 'Declaração'. Selecione a CNH a ser entregue, preencha os dados do procurador/terceiro autorizado (nome, RG, CPF e documento de procuração/credencial) e clique em 'Gerar Declaração em PDF'. O documento é gerado com cabeçalho oficial e linhas para assinatura."
    },
    {
      q: "O sistema funciona se a internet cair?",
      a: "Sim! O sistema possui tecnologia Offline-First com banco de dados local (IndexedDB / Dexie). Todas as consultas, alocações e edições continuam funcionando no navegador. Quando a conexão é restabelecida, os dados são sincronizados automaticamente com o Supabase na nuvem."
    },
    {
      q: "Qual a diferença entre Situação 'Remetida', 'Recebida', 'Entregue' e 'Pendente'?",
      a: "• REMETIDA: CNH enviada pelo setor de emissão, a caminho do posto de atendimento.\n• RECEBIDA: CNH conferida fisicamente e guardada na gaveta/repartição, pronta para entrega.\n• ENTREGUE: CNH entregue ao cidadão ou procurador com recibo assinado.\n• PENDENTE: CNH com pendência cadastral, retenção administrativa ou aguardando decisão."
    }
  ];

  // Filtro de tópicos por busca
  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [searchQuery, faqs]);

  // Função para Gerar a Cartilha Explicativa Oficial em PDF
  const handleDownloadCartilhaPDF = () => {
    setIsGeneratingPdf(true);
    setFeedbackMsg(null);

    setTimeout(() => {
      try {
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        const cfg = getOrgaoConfig();
        const dateStr = new Date().toLocaleDateString("pt-BR");
        const hourStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

        // Helper de cabeçalho padrão
        const drawHeader = (docInstance: any, pageTitle: string) => {
          const pageWidth = docInstance.internal.pageSize.getWidth();
          const leftX = 14;
          const rightX = pageWidth - 14;

          const hasLogo = addPDFHeaderLogo(docInstance, leftX, 6, 13, 13);
          const textX = hasLogo ? 30 : leftX;

          docInstance.setFont("helvetica", "bold");
          docInstance.setFontSize(9.5);
          docInstance.setTextColor(15, 23, 42);
          docInstance.text(`${cfg.sigla || "DETRAN"} — ${cfg.orgao || "DEPARTAMENTO DE TRÂNSITO"}`, textX, 10);

          docInstance.setFontSize(8);
          docInstance.setFont("helvetica", "normal");
          docInstance.setTextColor(71, 85, 105);
          docInstance.text(cfg.secretaria || "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA", textX, 14);
          docInstance.text(pageTitle, textX, 18);

          docInstance.setFontSize(7.5);
          docInstance.setTextColor(100, 116, 139);
          docInstance.text(`Emissão: ${dateStr} às ${hourStr}`, rightX, 10, { align: "right" });
          docInstance.text("Manual Oficial", rightX, 14, { align: "right" });

          docInstance.setDrawColor(203, 213, 225);
          docInstance.setLineWidth(0.4);
          docInstance.line(leftX, 21, rightX, 21);
        };

        const drawFooter = (docInstance: any, pageNum: number, totalPages: string = "") => {
          const pageWidth = docInstance.internal.pageSize.getWidth();
          const pageHeight = docInstance.internal.pageSize.getHeight();
          const leftX = 14;
          const rightX = pageWidth - 14;

          docInstance.setDrawColor(226, 232, 240);
          docInstance.setLineWidth(0.3);
          docInstance.line(leftX, pageHeight - 11, rightX, pageHeight - 11);

          docInstance.setFontSize(7.2);
          docInstance.setTextColor(148, 163, 184);
          docInstance.setFont("helvetica", "normal");
          docInstance.text("Sistema DETRAN-PROT • Cartilha Explicativa do Usuário", leftX, pageHeight - 6);
          docInstance.text(`Página ${pageNum}${totalPages ? ` de ${totalPages}` : ""}`, rightX, pageHeight - 6, { align: "right" });
        };

        // ================= PÁGINA 1: CAPA & VISÃO GERAL =================
        drawHeader(doc, "MANUAL DO USUÁRIO & GUIA OPERACIONAL");

        doc.setFillColor(30, 58, 138);
        doc.roundedRect(14, 26, 182, 32, 3, 3, "F");

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("CARTILHA DIDÁTICA DO USUÁRIO", 20, 36);

        doc.setFontSize(9.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(224, 231, 255);
        doc.text("Sistema de Protocolo Geral, Alocação em Gavetas, Lotes e Entrega de CNHs", 20, 43);
        doc.text("Guia prático passo a passo adaptado para cada perfil de acesso institucional.", 20, 49);

        // Tabela de Perfis
        autoTable(doc, {
          startY: 63,
          margin: { left: 14, right: 14 },
          head: [["Perfil", "Foco Operacional", "Principais Módulos & Ações"]],
          body: [
            [
              "OPERADOR\n(Balcão)",
              "Atendimento ao cidadão, recebimento de CNHs físicas e entrega.",
              "• Consulta CNH & Protocolo Entrega\n• Recebimento via Planilha Excel (com Lote)\n• Alocação em Gavetas/Repartições\n• Emissão de Declaração de Retirada (Procurador)"
            ],
            [
              "SUPERVISOR\n(Gestão)",
              "Acompanhamento da equipe, controle de lotes e auditoria.",
              "• Gestão de Lotes de CNHs (arquivos PDF e comprovantes)\n• Monitoramento de prazos em estoque (30, 60, 90+ dias)\n• Emissão de Relatórios gerenciais e estatísticas\n• Consulta de Histórico e trilhas de auditoria"
            ],
            [
              "ADMINISTRADOR\n(Governança)",
              "Controle integral do sistema, segurança, backups e saneamento.",
              "• Gestão de Usuários e permissões granulares\n• Varredura calibrada de duplicatas (preservando renovações)\n• Backups automáticos (Google Drive e local)\n• Parametrização da agência e órgão"
            ],
            [
              "CONSULTA\n(Atendimento)",
              "Pesquisas rápidas de status de CNH e orientação ao cidadão.",
              "• Consulta rápida por Nome, CPF, PA, Lote ou Gaveta\n• Visualização da ficha completa da CNH\n• Compartilhamento do QR Code / Link de Consulta Pública"
            ],
          ],
          headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          styles: { fontSize: 8, cellPadding: 3, valign: "top", lineColor: [203, 213, 225], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 32, fontStyle: "bold", textColor: [30, 58, 138] },
            1: { cellWidth: 50 },
            2: { cellWidth: 100 },
          },
        });

        // O Ciclo da CNH
        const afterPerfisY = (doc as any).lastAutoTable.finalY + 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("1. O CICLO DE VIDA DA CNH NO PROTOCOLO", 14, afterPerfisY);

        autoTable(doc, {
          startY: afterPerfisY + 3,
          margin: { left: 14, right: 14 },
          head: [["Fase", "Situação", "O que acontece?", "Responsável"]],
          body: [
            ["1. Remessa", "REMETIDA", "A CNH foi despachada pela fábrica/sede com número PA único.", "Emissor / Central"],
            ["2. Entrada", "RECEBIDA", "Conferência física no posto, gravação do Lote e alocação na Gaveta.", "Operador / Triagem"],
            ["3. Arquivo", "NO BALCÃO", "CNH acondicionada na gaveta/repartição aguardando o titular.", "Operador"],
            ["4. Saída", "ENTREGUE", "Identificação do cidadão/procurador, assinatura do protocolo e baixa.", "Operador de Balcão"],
          ],
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
          styles: { fontSize: 7.8, cellPadding: 2.5, valign: "middle", lineColor: [203, 213, 225], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 26, fontStyle: "bold" },
            1: { cellWidth: 28, fontStyle: "bold", textColor: [16, 185, 129] },
            2: { cellWidth: 95 },
            3: { cellWidth: 33 },
          },
        });

        drawFooter(doc, 1);

        // ================= PÁGINA 2: GUIA PASSO A PASSO OPERADOR & SUPERVISOR =================
        doc.addPage();
        drawHeader(doc, "MANUAL DO USUÁRIO — GUIA DO OPERADOR & SUPERVISOR");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("2. GUIA DO OPERADOR: ATENDIMENTO E PROTOCOLO", 14, 27);

        autoTable(doc, {
          startY: 31,
          margin: { left: 14, right: 14 },
          head: [["Ação", "Passo a Passo Prático no Sistema"]],
          body: [
            [
              "Importar Planilha Excel de CNHs Recebidas com LOTE",
              "1. Acesse 'Protocolo Geral' e clique em 'Importar Excel (Recebidas)'.\n2. Selecione o arquivo (.xlsx, .xls ou .csv).\n3. O sistema mapeia: NOME, PA, LOTE e CPF. (Preencha Lote Padrão se necessário).\n4. Clique em 'Executar Comparação'. O sistema cruza os PAs:\n   • PA Idêntico: atualiza status para RECEBIDA, atualiza data e grava o LOTE.\n   • CPF existente com novo PA: gera NOVA ORDEM sequencial preservando a anterior.\n5. Clique em 'Confirmar Recebimento em Lote'."
            ],
            [
              "Localizar CNH em segundos (Consulta CNH)",
              "1. Abra a aba 'Consulta CNH' no menu lateral.\n2. Digite o CPF ou Nome no campo de pesquisa.\n3. O sistema exibe o número de ordem (#), Gaveta e Repartição física.\n4. Dê um clique na linha para abrir a Ficha Completa da CNH com todos os dados."
            ],
            [
              "Realizar Entrega no Balcão",
              "1. Abra a aba 'Protocolo Entrega'.\n2. Localize a CNH e clique no botão 'Entregar'.\n3. Selecione quem está retirando: Titular ou Procurador.\n4. Caso seja procurador, informe Nome e Documento.\n5. O sistema marca a CNH como ENTREGUE e gera registro no histórico e auditoria."
            ],
            [
              "Emitir Declaração de Retirada por Procurador",
              "1. Acesse a aba 'Declaração'.\n2. Selecione a CNH e informe os dados da procuração/credencial.\n3. Clique em 'Gerar Declaração em PDF' e imprima para assinatura física."
            ]
          ],
          headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          styles: { fontSize: 7.8, cellPadding: 2.8, valign: "top", lineColor: [203, 213, 225], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 48, fontStyle: "bold", textColor: [6, 95, 70] },
            1: { cellWidth: 134 },
          }
        });

        // Seção Supervisor
        const afterOpY = (doc as any).lastAutoTable.finalY + 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("3. GUIA DO SUPERVISOR: GESTÃO E CONTROLE", 14, afterOpY);

        autoTable(doc, {
          startY: afterOpY + 3,
          margin: { left: 14, right: 14 },
          head: [["Ferramenta", "Como Utilizar para Supervisão"]],
          body: [
            [
              "Sub-aba 'Lotes' no Protocolo Geral",
              "Permite criar e gerenciar lotes oficiais de CNHs recebidas, associar memorandos de remessa e anexar o documento PDF comprobatório digitalizado."
            ],
            [
              "Relatórios & Métricas Operacionais",
              "Acesse a aba 'Relatórios' para visualizar taxas de entrega, tempo médio de permanência em gaveta, CNHs sem PA e listagens completas para conferência física."
            ],
            [
              "Histórico e Auditoria",
              "Monitore na aba 'Histórico' e 'Auditoria' todas as entradas, saídas, edições de gaveta e entregas realizadas com carimbo de data/hora e identificação do usuário logado."
            ]
          ],
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          styles: { fontSize: 7.8, cellPadding: 2.5, valign: "top", lineColor: [203, 213, 225], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 48, fontStyle: "bold", textColor: [67, 56, 202] },
            1: { cellWidth: 134 },
          }
        });

        drawFooter(doc, 2);

        // ================= PÁGINA 3: ADMINISTRADOR, REGRAS & FAQ =================
        doc.addPage();
        drawHeader(doc, "MANUAL DO USUÁRIO — ADMINISTRAÇÃO & REGRAS DO DETRAN");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("4. GUIA DO ADMINISTRADOR & REGRAS FUNDAMENTAIS", 14, 27);

        autoTable(doc, {
          startY: 31,
          margin: { left: 14, right: 14 },
          head: [["Regra / Módulo", "Diretriz Operacional Rigorosa"]],
          body: [
            [
              "Regra de Ouro do PA (Processo CNH)",
              "O número PA é único para cada processo. Renovações e inclusões de categoria possuem novo número de PA. O sistema NUNCA sobrescreve a CNH anterior: cria uma nova ordem com o novo PA e lote."
            ],
            [
              "Varredura de Duplicatas Calibrada",
              "A varredura inteligente reconhece quando o mesmo CPF possui PAs distintos (renovações legítimas) e NÃO os seleciona para exclusão. Apenas registros com o MESMO PA são apontados para saneamento."
            ],
            [
              "Gestão de Usuários & Permissões",
              "O Administrador define perfis (Operador, Supervisor, Consulta) e permissões granulares por aba, garantindo segurança institucional e conformidade com a LGPD."
            ],
            [
              "Backups Automáticos & Nuvem",
              "O sistema realiza sincronização contínua com Supabase e permite agendamento de backups diários em CSV e Excel (.xlsx) diretamente no Google Drive da instituição."
            ]
          ],
          headStyles: { fillColor: [190, 24, 93], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          styles: { fontSize: 7.8, cellPadding: 2.8, valign: "top", lineColor: [203, 213, 225], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 50, fontStyle: "bold", textColor: [157, 23, 77] },
            1: { cellWidth: 132 },
          }
        });

        // FAQ
        const afterAdminY = (doc as any).lastAutoTable.finalY + 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("5. PERGUNTAS FREQUENTES (FAQ)", 14, afterAdminY);

        const faqRows = faqs.slice(0, 4).map(f => [f.q, f.a]);
        autoTable(doc, {
          startY: afterAdminY + 3,
          margin: { left: 14, right: 14 },
          head: [["Dúvida Operacional", "Solução no Sistema"]],
          body: faqRows,
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
          styles: { fontSize: 7.4, cellPadding: 2.5, valign: "top", lineColor: [203, 213, 225], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 60, fontStyle: "bold", textColor: [15, 23, 42] },
            1: { cellWidth: 122 },
          }
        });

        drawFooter(doc, 3, "3");

        // Salvar arquivo
        const fileName = `Cartilha_Usuario_DETRAN_Protocolo_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(fileName);
        setFeedbackMsg("Cartilha didática baixada com sucesso!");
        setTimeout(() => setFeedbackMsg(null), 4000);
      } catch (err: any) {
        console.error("Erro ao gerar Cartilha em PDF:", err);
        setFeedbackMsg("Erro ao gerar cartilha em PDF. Tente novamente.");
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 150);
  };

  const handlePrintManual = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Banner Principal com Apresentação e Ações Rápidas */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold text-blue-200 border border-white/15">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Guia Didático Oficial • {orgaoConfig.sigla || "DETRAN"}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Manual do Usuário & Cartilha Operacional
            </h2>
            <p className="text-sm text-blue-100/90 leading-relaxed">
              Instruções didáticas passo a passo sobre o ciclo de vida da CNH, importação de planilhas com lote, arquivamento físico em gavetas e entrega com protocolo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCartilhaPDF}
              disabled={isGeneratingPdf}
              title="Baixar Cartilha Didática Completa em PDF com todos os capítulos e tabelas"
              className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-2xl shadow-lg hover:shadow-emerald-500/25 transition-all text-xs cursor-pointer border border-emerald-400/40 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isGeneratingPdf ? "Gerando Cartilha..." : "Baixar Cartilha (PDF)"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintManual}
              title="Imprimir visualização desta tela"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-semibold rounded-2xl transition-all text-xs cursor-pointer border border-white/20"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {feedbackMsg && (
          <div className="mt-4 px-4 py-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 rounded-xl text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}
      </div>

      {/* Seletor Rápido de Perfil & Campo de Busca Didática */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Abas dos Perfis */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-2 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Perfil:
          </span>

          <button
            type="button"
            onClick={() => setSelectedProfile("todos")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedProfile === "todos"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            Todos os Perfis
          </button>

          <button
            type="button"
            onClick={() => setSelectedProfile("Operador")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedProfile === "Operador"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Operador (Balcão)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedProfile("Supervisor")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedProfile === "Supervisor"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Supervisor (Gestão)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedProfile("Administrador")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedProfile === "Administrador"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-100"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrador</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedProfile("Consulta")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedProfile === "Consulta"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Consulta</span>
          </button>
        </div>

        {/* Busca rápida de tópicos */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar tópico ou dúvida..."
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs pl-8 pr-3 py-1.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Fluxo Visual: Ciclo de Vida da CNH no Protocolo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-xl">
              <FolderArchive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                O Ciclo de Vida da CNH no Protocolo DETRAN
              </h3>
              <p className="text-xs text-slate-500">
                Entenda o caminho de cada documento desde o despacho até a entrega ao cidadão
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-block px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300">
            Fluxo Oficial 4 Etapas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Etapa 1 */}
          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                1. REMESSA
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">Status: Remetida</span>
            </div>
            <h4 className="text-xs font-bold text-amber-950 dark:text-amber-100 mb-1">
              Despacho & Transporte
            </h4>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
              A CNH é emitida e despachada para a agência em um memorando/remessa acompanhada de número <strong>PA único</strong>.
            </p>
          </div>

          {/* Etapa 2 */}
          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200">
                2. RECEBIMENTO
              </span>
              <span className="text-[10px] text-blue-700 dark:text-blue-400 font-semibold">Status: Recebida</span>
            </div>
            <h4 className="text-xs font-bold text-blue-950 dark:text-blue-100 mb-1">
              Conferência & Lote
            </h4>
            <p className="text-[11px] text-blue-900/80 dark:text-blue-200/80 leading-relaxed">
              O operador importa a planilha Excel ou usa OCR. Grava o <strong>Lote</strong>, confere o PA e aloca fisicamente na gaveta.
            </p>
          </div>

          {/* Etapa 3 */}
          <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200">
                3. ARQUIVAMENTO
              </span>
              <span className="text-[10px] text-purple-700 dark:text-purple-400 font-semibold">Localizado</span>
            </div>
            <h4 className="text-xs font-bold text-purple-950 dark:text-purple-100 mb-1">
              Gaveta & Repartição
            </h4>
            <p className="text-[11px] text-purple-900/80 dark:text-purple-200/80 leading-relaxed">
              O documento fica arquivado na gaveta por ordem alfabética. O cidadão pode consultar o status online pelo CPF/QR Code.
            </p>
          </div>

          {/* Etapa 4 */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
                4. ENTREGA
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">Status: Entregue</span>
            </div>
            <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-100 mb-1">
              Baixa com Recibo
            </h4>
            <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
              No balcão, o operador identifica o titular (ou procurador com declaração), colhe a assinatura e dá baixa no estoque.
            </p>
          </div>
        </div>
      </div>

      {/* SEÇÃO 1: GUIA DIDÁTICO DO OPERADOR */}
      {(selectedProfile === "todos" || selectedProfile === "Operador") && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-xl">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Guia do Operador — Atendimento de Balcão e Protocolo Físico
                </h3>
                <p className="text-xs text-slate-500">
                  Instruções para receber remessas, alocar gavetas e registrar entregas no balcão
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-lg border border-emerald-300 dark:border-emerald-800">
              Perfil Operador
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Card 1: Como Receber CNHs em Lote via Excel */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>1. Como Importar Planilha Excel de CNHs Recebidas com LOTE</span>
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>Acesse o <strong>Protocolo Geral</strong> e clique no botão verde <strong>"📥 Importar Excel (Recebidas)"</strong>.</li>
                <li>Selecione o arquivo da remessa (.xlsx, .xls ou .csv).</li>
                <li>O sistema mapeará as colunas: <strong>Nome</strong>, <strong>PA</strong>, <strong>Lote</strong> e <strong>CPF</strong>. Caso não haja coluna de lote, você pode digitar o lote no campo <em>Lote Padrão</em>.</li>
                <li>Clique em <strong>Executar Comparação</strong>. O sistema cruza os números de PA:
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg my-1 text-[11px] text-emerald-900 dark:text-emerald-200 font-mono">
                    ✓ PA Exato: Altera status para RECEBIDA, atualiza Data Mov e grava LOTE.<br/>
                    ⚡ CPF com novo PA: Gera NOVA ORDEM mantendo o registro anterior intacto!
                  </div>
                </li>
                <li>Revise a listagem e clique em <strong>Confirmar Recebimento em Lote</strong>.</li>
              </ul>
            </div>

            {/* Card 2: Como Localizar no Balcão e Ficha Rápida */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-xs">
                <Search className="w-4 h-4 text-blue-600" />
                <span>2. Como Localizar CNH em segundos (Consulta CNH)</span>
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>Abra a aba <strong>Consulta CNH</strong> no menu principal.</li>
                <li>Digite o CPF (com ou sem máscara) ou o nome do condutor no campo de busca rápida geral.</li>
                <li>Localize a coluna <strong>Gaveta / Repartição</strong> para ir direto ao arquivo físico.</li>
                <li><strong>Clique em qualquer ponto da linha</strong> para abrir a <em>Ficha Completa da CNH</em> com histórico de movimentações, data de recebimento e lote.</li>
                <li>Use o botão <strong>"Copiar Dados da CNH"</strong> ou <strong>"Imprimir Ficha"</strong> caso precise anexar ao processo físico.</li>
              </ul>
            </div>

            {/* Card 3: Como Entregar na aba Protocolo Entrega */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span>3. Realizar Entrega ao Titular ou Despachante</span>
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>Abra a aba <strong>Protocolo Entrega</strong> (tela enxuta para atendimento rápido).</li>
                <li>Na linha da CNH, clique no botão <strong>"Entregar"</strong>.</li>
                <li>Selecione se quem está retirando é o <strong>Próprio Titular</strong> ou <strong>Procurador / Terceiro</strong>.</li>
                <li>Caso seja procurador, informe o nome e CPF dele para registro oficial na trilha de auditoria.</li>
                <li>O status é atualizado para <strong>ENTREGUE</strong> e é gerado o comprovante de saída.</li>
              </ul>
            </div>

            {/* Card 4: Declaração de Retirada por Procurador */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
                <FileCheck className="w-4 h-4 text-amber-600" />
                <span>4. Declaração Oficial para Despachantes / CFCs</span>
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>Quando um despachante ou representante de CFC vier retirar múltiplas CNHs, acesse a aba <strong>Declaração</strong>.</li>
                <li>Selecione o condutor correspondente e digite o número da procuração ou credencial.</li>
                <li>Clique em <strong>"Gerar Declaração em PDF"</strong>.</li>
                <li>Imprima a folha timbrada para que o procurador assine presencialmente com data e carimbo da agência.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 2: GUIA DIDÁTICO DO SUPERVISOR */}
      {(selectedProfile === "todos" || selectedProfile === "Supervisor") && (
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-100 dark:border-indigo-900/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Guia do Supervisor — Gestão Operacional, Lotes e Auditoria
                </h3>
                <p className="text-xs text-slate-500">
                  Instruções para monitorar o estoque de CNHs, auditar processos e gerenciar lotes
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 text-xs font-bold rounded-lg border border-indigo-300 dark:border-indigo-800">
              Perfil Supervisor
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Gestão de Lotes de CNHs</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Na sub-aba <strong>Lotes</strong> do Protocolo Geral, o supervisor pode agrupar e fiscalizar remessas recebidas, vincular memorandos e fazer upload de arquivos PDF digitalizados com os comprovantes de entrega de malotes.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                <Inbox className="w-4 h-4 text-indigo-600" />
                <span>Controle de CNHs Paradas no Estoque</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Na aba <strong>Dashboard</strong> e <strong>Relatórios</strong>, acompanhe o número de CNHs paradas há mais de 30, 60 ou 90 dias sem busca pelo cidadão. Use os filtros para gerar listas e acionar os cidadãos via SMS ou WhatsApp.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                <span>Auditoria & Histórico de Movimentações</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Todas as operações no sistema deixam rastro: quem recebeu a CNH, quem alterou a gaveta, quem realizou a entrega e os dados do procurador. Acesse as abas <strong>Histórico</strong> e <strong>Auditoria</strong> para inspeção e controle interno.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 3: GUIA DIDÁTICO DO ADMINISTRADOR */}
      {(selectedProfile === "todos" || selectedProfile === "Administrador") && (
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-900/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Guia do Administrador — Governança, Backups, Usuários e Segurança
                </h3>
                <p className="text-xs text-slate-500">
                  Instruções para parametrização do órgão, controle de usuários, saneamento de dados e cópias de segurança
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 text-xs font-bold rounded-lg border border-rose-300 dark:border-rose-800">
              Perfil Administrador
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-rose-600" />
                <span>Gestão de Usuários & Acessos</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Acesse a aba <strong>Usuários</strong> para cadastrar servidores, redefinir senhas e configurar permissões granulares de abas para manter a conformidade com a política de segurança e controle de dados.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                <Copy className="w-4 h-4 text-rose-600" />
                <span>Varredura de Duplicatas Calibrada</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                O motor de duplicatas foi calibrado para respeitar processos com PAs distintos para o mesmo CPF (renovações/categorias). Apenas registros com o MESMO PA são apontados para exclusão em lote com registro em auditoria.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-rose-600" />
                <span>Rotinas de Backup e Sincronização</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Na aba <strong>Backup & Sincronização</strong>, configure o envio de cópias diárias em planilha Excel (.xlsx) e JSON diretamente para o Google Drive institucional e execute o download local manual de segurança.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 4: GUIA DIDÁTICO DO PERFIL CONSULTA */}
      {(selectedProfile === "todos" || selectedProfile === "Consulta") && (
        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-amber-100 dark:border-amber-900/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-xl">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Guia do Perfil Consulta — Atendimento e Orientação ao Cidadão
                </h3>
                <p className="text-xs text-slate-500">
                  Instruções para consultas rápidas sem risco de alteração acidental de registros
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-lg border border-amber-300 dark:border-amber-800">
              Perfil Consulta
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <Search className="w-4 h-4 text-amber-600" />
                <span>Consulta Segura de CNHs</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                O usuário de Consulta pode visualizar e filtrar todas as CNHs do protocolo por CPF, Nome, Gaveta ou Lote. Ele não pode editar ou excluir registros, o que garante 100% de segurança contra alterações não autorizadas.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-amber-600" />
                <span>Orientação do Cidadão via QR Code</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Utilize o botão <strong>"📱 QR Code Cidadão"</strong> para exibir e imprimir o QR Code de consulta pública. O cidadão pode apontar a câmera do celular e verificar em casa se a sua CNH já chegou ao posto de atendimento.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 5: DICIONÁRIO DE TERMOS & REGRAS DE OURO DO DETRAN */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="p-2 bg-blue-600 text-white rounded-xl">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Dicionário Operacional & Regras de Ouro do DETRAN
            </h3>
            <p className="text-xs text-slate-400">
              Conceitos essenciais para a rotina diária no setor de protocolo de CNHs
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-emerald-400">Identificador do Processo</span>
            <h4 className="text-xs font-bold text-white">Número PA (Processo CNH)</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              O número PA é único para cada processo de habilitação. Toda renovação, alteração de categoria ou 2ª via gera um novo PA. Por isso, um cidadão pode ter vários registros históricos no sistema.
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-blue-400">Controle de Remessa</span>
            <h4 className="text-xs font-bold text-white">Lote de Recebimento</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Número identificador do malote/remessa em que a CNH foi entregue na agência. Fica gravado no registro da CNH e permite rastrear todos os documentos chegados em um mesmo dia ou remessa.
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-purple-400">Coordenadas Físicas</span>
            <h4 className="text-xs font-bold text-white">Gaveta & Repartição</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Sistema físico de arquivamento (Gavetas de 1 a 12 e Repartições de 1 a 12). A organização é alfabética por letra inicial do nome do titular para localização imediata pelo operador.
            </p>
          </div>
        </div>
      </div>

      {/* SEÇÃO 6: PERGUNTAS FREQUENTES (FAQ DIDÁTICA) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-xl">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Dúvidas Frequentes da Operação (FAQ)
              </h3>
              <p className="text-xs text-slate-500">
                Respostas diretas e didáticas para as situações mais comuns no atendimento diário
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-semibold">
            {filteredFaqs.length} pergunta(s) encontrada(s)
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <div key={idx} className="py-3">
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span>{faq.q}</span>
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="mt-2.5 pl-7 pr-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line animate-fadeIn bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
