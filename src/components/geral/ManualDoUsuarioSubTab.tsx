import React, { useState } from "react";
import {
  BookOpen,
  Download,
  Shield,
  UserCheck,
  Headphones,
  Eye,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Layers,
  Archive,
  QrCode,
  FileSpreadsheet,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Printer,
  FileText,
  KeyRound,
  ExternalLink,
  Info
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrgaoConfig, addPDFHeaderLogo } from "../../services/orgaoService";
import { getPublicShareUrl } from "../../services/supabase";

export const ManualDoUsuarioSubTab: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<"admin" | "supervisor" | "operador" | "consulta" | "cidadao">("operador");
  const [searchManual, setSearchManual] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const orgao = getOrgaoConfig();
  const citizenPortalUrl = getPublicShareUrl();

  const toggleFaq = (idx: number) => {
    setExpandedFaq(expandedFaq === idx ? null : idx);
  };

  // Geração e Download da Cartilha Explicativa Oficial em PDF
  const handleDownloadCartilhaPDF = () => {
    setIsGeneratingPdf(true);
    setDownloadSuccess(false);

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const leftMargin = 14;
      const rightMargin = pageWidth - 14;
      const contentWidth = pageWidth - 28;

      let currentY = 16;

      // Cabeçalho da Primeira Página
      const hasLogo = addPDFHeaderLogo(doc, leftMargin, 12, 18, 18);
      const textStartX = hasLogo ? leftMargin + 22 : leftMargin;

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(orgao.governo || "GOVERNO DO ESTADO DO PARÁ", textStartX, 15);
      
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(orgao.secretaria || "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA", textStartX, 19.5);
      doc.text(orgao.orgao || "DEPARTAMENTO DE TRÂNSITO DO ESTADO — DETRAN", textStartX, 24);

      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${orgao.origem_padrao || "AGÊNCIA REGIONAL"} | ${orgao.cidade_uf || "PA"}`, textStartX, 28.5);

      // Linha separadora do cabeçalho
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, 33, rightMargin, 33);

      currentY = 40;

      // Banner do Título da Cartilha
      doc.setFillColor(37, 99, 235); // blue-600
      doc.roundedRect(leftMargin, currentY, contentWidth, 20, 3, 3, "F");

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("CARTILHA DIDÁTICA DO USUÁRIO & MANUAL OPERACIONAL", pageWidth / 2, currentY + 8, { align: "center" });

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text("Sistema DETRAN-PROT — Gestão de Protocolo, Recebimento em Lote e Entrega de CNHs", pageWidth / 2, currentY + 14, { align: "center" });

      currentY += 28;

      // Seção 1: Apresentação do Sistema
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("1. APRESENTAÇÃO E OBJETIVO DO SISTEMA", leftMargin, currentY);
      currentY += 4;

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const introText = "O Sistema DETRAN-PROT foi desenvolvido com o propósito de modernizar, dar transparência e agilizar todo o ciclo de custódia e entrega da Carteira Nacional de Habilitação (CNH). Ele atende desde a recepção de malotes e remessas oficiais, triagem com conferência e cruzamento de dados (Nome, CPF, PA e LOTE), organização física em arquivos (gavetas e repartições), notificação automática ao cidadão via WhatsApp, até a efetiva entrega do documento ao condutor titular ou despachante legalmente constituído.";
      const splitIntro = doc.splitTextToSize(introText, contentWidth);
      doc.text(splitIntro, leftMargin, currentY);
      currentY += splitIntro.length * 4.2 + 4;

      // Seção 2: Tabela de Perfis de Usuário
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("2. PERFIS DE ACESSO E SUAS ATRIBUIÇÕES NO SISTEMA", leftMargin, currentY);
      currentY += 3;

      const rolesTableData = [
        [
          "ADMINISTRADOR\n(Acesso Total)",
          "• Gerenciamento completo de usuários e senhas;\n• Definição de permissões granulares;\n• Personalização da agência (logo, portaria, gerente);\n• Sincronização em nuvem e backups de segurança;\n• Execução de varredura de duplicatas e auditoria geral."
        ],
        [
          "SUPERVISOR\n(Gestão Operacional)",
          "• Supervisão de todos os postos de atendimento;\n• Configuração do mapeamento alfabético de gavetas;\n• Emissão e homologação de relatórios gerenciais e estatísticas;\n• Monitoramento de malotes, lotes e prazos de retenção;\n• Resolução de divergências e autorizações especiais."
        ],
        [
          "OPERADOR\n(Balcão de Atendimento)",
          "• Recepção em lote de planilhas Excel com gravação de LOTE;\n• Cruzamento automático por PA e cadastro direto como Recebida;\n• Arquivamento físico nas gavetas e repartições indicadas;\n• Protocolo formal de entrega com validação de titular ou procuração;\n• Disparo de avisos via WhatsApp e emissão de recibos assinados."
        ],
        [
          "CONSULTA\n(Somente Leitura)",
          "• Localização instantânea de CNHs por Nome, CPF ou PA;\n• Consulta ágil de gaveta e repartição para atendimento ao público;\n• Emissão de Ficha Cadastral da CNH e consulta de histórico;\n• Sem permissão de edição, garantindo integridade das informações."
        ],
        [
          "CIDADÃO & DESPACHANTE\n(Consulta Pública Externa)",
          "• Acesso ao Portal de Consulta através de QR Code ou Link;\n• Verificação em tempo real se o documento já está disponível no posto;\n• Informações claras sobre documentação necessária para retirada;\n• Atendimento desburocratizado sem filas desnecessárias."
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [["Perfil de Usuário", "Competências, Funções e Responsabilidades"]],
        body: rolesTableData,
        theme: "striped",
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 3
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: "bold" },
          1: { cellWidth: contentWidth - 50 }
        },
        margin: { left: leftMargin, right: leftMargin }
      });

      // Segunda Página
      doc.addPage();
      currentY = 16;

      // Mini Header nas páginas seguintes
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("SISTEMA DETRAN-PROT — MANUAL OPERACIONAL DO USUÁRIO", leftMargin, currentY);
      doc.setFont("helvetica", "normal");
      doc.text("Página 2 de 3", rightMargin, currentY, { align: "right" });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(leftMargin, currentY + 2, rightMargin, currentY + 2);
      currentY += 8;

      // Seção 3: Regras Cruciais de Negócio DETRAN
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("3. REGRAS DE NEGÓCIO E MECANISMO DE IMPORTAÇÃO EM LOTE", leftMargin, currentY);
      currentY += 4;

      const regrasTableData = [
        [
          "Regra do PA\n(Identificador Único)",
          "O número PA (Processo da CNH) é único para cada emissão. Quando a planilha é carregada:\n1. PA Idêntico: Se o PA corresponder exatamente ao registro existente, a situação muda para 'RECEBIDA', a data da movimentação (updated_at) é renovada, e o operador logado é registrado.\n2. Mesmo CPF com PA Diferente: O sistema reconhece que o cidadão renovou a CNH ou adicionou categoria. Cria automaticamente um NOVO REGISTRO com novo número de ordem sequencial, preservando o histórico da CNH anterior!"
        ],
        [
          "Gravação da\nColuna LOTE",
          "O número do lote identifica a remessa do malote oficial enviado pela gráfica/sede. Ao processar a planilha XLSX, o sistema identifica automaticamente a coluna LOTE e grava essa informação de forma persistente em cada CNH, permitindo rastrear a qual pacote o documento pertenceu."
        ],
        [
          "Varredura de\nDuplicatas Calibrada",
          "A ferramenta de Varredura de Duplicatas é inteligente: ela considera legítimo haver mais de um registro do mesmo cidadão (mesmo Nome e CPF) desde que possuam PAs diferentes (renovações ou 2ª vias). Só é apontada duplicata quando houver repetição do mesmo PA ou erro cadastral evidente."
        ],
        [
          "Alocação Física\n(Gavetas e Repartições)",
          "Cada CNH recebida é alocada no arquivo físico do DETRAN. Por padrão, o sistema sugere a Gaveta e Repartição baseando-se na letra inicial do nome do condutor (conforme Mapeamento configurado pelo Supervisor). O operador também pode marcar alocação manual para caixas de remessa específicas."
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [["Conceito / Regra", "Diretriz Operacional do Sistema"]],
        body: regrasTableData,
        theme: "grid",
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 3
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 46, fontStyle: "bold" },
          1: { cellWidth: contentWidth - 46 }
        },
        margin: { left: leftMargin, right: leftMargin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Seção 4: Passo a Passo do Fluxo Operacional (Do Recebimento à Entrega)
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("4. FLUXO OPERACIONAL PASSO A PASSO NO BALCÃO", leftMargin, currentY);
      currentY += 4;

      const fluxoSteps = [
        [
          "Passo 1:\nRecepção do Malote",
          "O operador abre a aba 'Controle Geral de CNHs' e clica no botão '📥 Importar Excel (Recebidas)'. Seleciona o arquivo .xlsx fornecido pelo DETRAN sede. O sistema detecta as colunas de Nome, PA, LOTE e CPF."
        ],
        [
          "Passo 2:\nConferência & Gravação",
          "O sistema cruza as CNHs da planilha contra o banco. Itens com PA idêntico são marcados para atualização para RECEBIDA. Registros com novo PA são marcados para cadastro com nova ordem. Ao confirmar, o sistema grava o lote, atualiza a data/hora e o operador responsável."
        ],
        [
          "Passo 3:\nArquivamento Físico",
          "O operador imprime a Lista de Recebimento por Gaveta ou consulta a tela para guardar as CNHs de papel nas repartições físicas identificadas (ex: Gaveta 1 / Repartição 2)."
        ],
        [
          "Passo 4:\nNotificação do Cidadão",
          "Caso haja telefone cadastrado, o operador pode acionar o botão de WhatsApp para enviar aviso oficial informando que o documento já se encontra disponível para retirada no posto."
        ],
        [
          "Passo 5:\nEntrega & Protocolo",
          "No momento do comparecimento, o atendente acessa 'Protocolo de Entrega', localiza o condutor, confere a identidade (ou procuração com poderes específicos para despachante) e clica em 'Efetuar Entrega'. O sistema gera o Recibo com assinatura e altera a situação para ENTREGUE."
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [["Etapa Operacional", "Procedimento Padronizado e Instruções Técnicas"]],
        body: fluxoSteps,
        theme: "striped",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 3
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 46, fontStyle: "bold" },
          1: { cellWidth: contentWidth - 46 }
        },
        margin: { left: leftMargin, right: leftMargin }
      });

      // Terceira Página
      doc.addPage();
      currentY = 16;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("SISTEMA DETRAN-PROT — MANUAL OPERACIONAL DO USUÁRIO", leftMargin, currentY);
      doc.setFont("helvetica", "normal");
      doc.text("Página 3 de 3", rightMargin, currentY, { align: "right" });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(leftMargin, currentY + 2, rightMargin, currentY + 2);
      currentY += 8;

      // Seção 5: Documentação Exigida e Normas de Entrega
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("5. DIRETRIZES DE SEGURANÇA PARA A RETIRADA DE CNHs", leftMargin, currentY);
      currentY += 4;

      const segurancaData = [
        [
          "Retirada pelo Próprio Titular",
          "• Apresentação obrigatória de documento de identidade oficial original com foto (RG, CTPS, Passaporte, Carteira Funcional ou CNH anterior);\n• Conferência da foto e assinatura do condutor;\n• Coleta da assinatura na Ficha de Protocolo ou Lista de Entrega."
        ],
        [
          "Retirada por Despachante Credenciado",
          "• Apresentação da credencial de Despachante emitida pelo DETRAN válida;\n• Procuração com poderes específicos para recebimento de CNH do titular;\n• Cópia do documento de identidade do titular em anexo;\n• Registro formal do despachante como Responsável da Entrega no sistema."
        ],
        [
          "Retirada por Familiar / Terceiro",
          "• Instrumento de Procuração Pública (Lavrada em Cartório) ou Procuração Particular com Firma Reconhecida em Cartório;\n• Documento oficial com foto do outorgado (procurador) e cópia autenticada do documento do titular;\n• Gravação dos dados do portador nas observações do protocolo."
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [["Modalidade de Retirada", "Requisitos Documentais e Validações Obrigatórias"]],
        body: segurancaData,
        theme: "grid",
        headStyles: {
          fillColor: [16, 185, 129], // emerald-600
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 3
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: "bold" },
          1: { cellWidth: contentWidth - 50 }
        },
        margin: { left: leftMargin, right: leftMargin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Seção 6: Perguntas Frequentes (FAQ Operacional)
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("6. PERGUNTAS FREQUENTES & RESOLUÇÃO DE DÚVIDAS", leftMargin, currentY);
      currentY += 4;

      const faqData = [
        [
          "O que fazer quando o cidadão tem duas CNHs com o mesmo CPF?",
          "Verifique o número do PA. Se os PAs forem diferentes, trata-se de um processo legítimo de renovação ou nova categoria. Ambas as ordens devem coexistir no sistema para preservar o histórico cadastral."
        ],
        [
          "Como o cidadão sabe se a CNH já está na agência?",
          "O cidadão pode ler o QR Code do Posto ou acessar o link público do DETRAN-PROT diretamente pelo celular. Ele digita o CPF ou Nome e o sistema informa na hora se a CNH já está 'Recebida' ou ainda 'Remetida'."
        ],
        [
          "Como corrigir uma CNH entregue por engano?",
          "Acesse a Ficha da CNH no Protocolo Geral ou Entrega, clique em 'Editar CNH' (se possuir perfil com permissão) e retorne a situação para 'Recebida', informando o motivo na justificativa de auditoria."
        ],
        [
          "A planilha carregada não tinha coluna de Lote. O que fazer?",
          "Na tela de importação, o operador pode preencher o campo 'Lote Padrão' (ex: 'Lote 12/2026'). O sistema gravará essa informação em todos os registros processados daquela remessa."
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [["Dúvida Comum", "Orientação Técnica do Sistema"]],
        body: faqData,
        theme: "striped",
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 3
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: "bold" },
          1: { cellWidth: contentWidth - 55 }
        },
        margin: { left: leftMargin, right: leftMargin }
      });

      // Rodapé em todas as páginas
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `DETRAN-PROT — Cartilha Explicativa do Usuário | Emitido em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`,
          leftMargin,
          pageHeight - 8
        );
        doc.text(`Página ${i} de ${totalPages}`, rightMargin, pageHeight - 8, { align: "right" });
      }

      doc.save(`Cartilha_Manual_Usuario_DETRAN_PROT_${new Date().toISOString().slice(0, 10)}.pdf`);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
    } catch (err: any) {
      console.error("Erro ao gerar cartilha PDF:", err);
      alert("Erro ao gerar a cartilha em PDF: " + (err.message || "Tente novamente."));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Filtragem de tópicos pela busca
  const filterMatch = (text: string) => {
    if (!searchManual.trim()) return true;
    return text.toLowerCase().includes(searchManual.toLowerCase());
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Banner Principal com Apresentação e Botão de Download */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 p-6 sm:p-8 text-white shadow-lg border border-blue-600/30">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 backdrop-blur-xs border border-blue-400/30 text-blue-200 text-xs font-semibold">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Guia Didático Oficial DETRAN-PROT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Manual do Usuário & Cartilha Operacional
            </h1>
            <p className="text-sm text-blue-100/90 leading-relaxed">
              Instruções didáticas e padronizadas para cada perfil de usuário. Entenda o fluxo completo de remessas, gravação de lotes, regra de unicidade de PA e entrega segura ao cidadão.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={handleDownloadCartilhaPDF}
              disabled={isGeneratingPdf}
              className="flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{isGeneratingPdf ? "Gerando Cartilha..." : "Baixar Cartilha Explicativa (PDF)"}</span>
            </button>
          </div>
        </div>

        {downloadSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Cartilha explicativa gerada e baixada com sucesso em formato PDF oficial de alta resolução!</span>
          </div>
        )}
      </div>

      {/* Barra de Busca de Tópicos do Manual */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchManual}
            onChange={(e) => setSearchManual(e.target.value)}
            placeholder="Pesquisar tópico no manual (ex: 'PA', 'Lote', 'Gaveta', 'WhatsApp', 'Procuração', 'Duplicata')..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {searchManual && (
          <button
            onClick={() => setSearchManual("")}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium px-2 py-1"
          >
            Limpar busca
          </button>
        )}
      </div>

      {/* Seletor de Perfis de Usuário */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Instruções Específicas por Tipo de Usuário</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecione o seu perfil para visualizar as ferramentas e rotinas recomendadas:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* 1. Administrador */}
          <button
            onClick={() => setSelectedRole("admin")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              selectedRole === "admin"
                ? "bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200 shadow-xs ring-2 ring-purple-500/20"
                : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Shield className="w-5 h-5 mb-1.5 text-purple-600" />
            <span className="text-xs font-bold">Administrador</span>
            <span className="text-[10px] opacity-75">Configuração & Gestão</span>
          </button>

          {/* 2. Supervisor */}
          <button
            onClick={() => setSelectedRole("supervisor")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              selectedRole === "supervisor"
                ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 shadow-xs ring-2 ring-blue-500/20"
                : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <UserCheck className="w-5 h-5 mb-1.5 text-blue-600" />
            <span className="text-xs font-bold">Supervisor</span>
            <span className="text-[10px] opacity-75">Mapeamento & Auditoria</span>
          </button>

          {/* 3. Operador */}
          <button
            onClick={() => setSelectedRole("operador")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              selectedRole === "operador"
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200 shadow-xs ring-2 ring-emerald-500/20"
                : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Headphones className="w-5 h-5 mb-1.5 text-emerald-600" />
            <span className="text-xs font-bold">Operador (Balcão)</span>
            <span className="text-[10px] opacity-75">Recebimento & Entrega</span>
          </button>

          {/* 4. Consulta */}
          <button
            onClick={() => setSelectedRole("consulta")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              selectedRole === "consulta"
                ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-200 shadow-xs ring-2 ring-amber-500/20"
                : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Eye className="w-5 h-5 mb-1.5 text-amber-600" />
            <span className="text-xs font-bold">Consulta (Leitura)</span>
            <span className="text-[10px] opacity-75">Localização Rápida</span>
          </button>

          {/* 5. Cidadão & Despachante */}
          <button
            onClick={() => setSelectedRole("cidadao")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
              selectedRole === "cidadao"
                ? "bg-teal-50 dark:bg-teal-950/40 border-teal-500 text-teal-900 dark:text-teal-200 shadow-xs ring-2 ring-teal-500/20"
                : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <QrCode className="w-5 h-5 mb-1.5 text-teal-600" />
            <span className="text-xs font-bold">Cidadão / Público</span>
            <span className="text-[10px] opacity-75">QR Code & Consulta</span>
          </button>
        </div>

        {/* Conteúdo Dinâmico do Perfil Selecionado */}
        <div className="pt-2">
          {selectedRole === "admin" && (
            <div className="p-4 sm:p-5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 text-purple-900 dark:text-purple-200 font-bold text-sm">
                <Shield className="w-5 h-5 text-purple-600" />
                <span>Perfil Administrador — Atribuições e Boas Práticas</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                O Administrador possui controle irrestrito sobre os módulos do sistema. Ele é responsável pela governança de dados, parametrização da agência e manutenção da segurança da informação.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-purple-100 dark:border-purple-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Gestão de Servidores & Permissões</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Cadastrar novos operadores, resetar senhas provisórias e configurar permissões granulares no menu <strong>Usuários</strong>.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-purple-100 dark:border-purple-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5" />
                    <span>Dados do Órgão & Logo Oficial</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Personalizar o cabeçalho oficial do DETRAN no menu <strong>Configurações do Órgão</strong>, definindo Brasão, Portaria do Gerente e Endereço da Unidade.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-purple-100 dark:border-purple-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Varredura de Duplicatas & Limpeza</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Acionar a <strong>Varredura de Duplicatas</strong> na tela Geral para auditar possíveis inconsistências. O sistema preserva múltiplos registros de um mesmo cidadão caso os PAs sejam distintos (renovações/categorias).
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-purple-100 dark:border-purple-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Sincronização em Nuvem (Supabase)</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Monitorar o status da sincronização em tempo real (Realtime). Dados salvos localmente no navegador (IndexedDB) são sincronizados com a nuvem do DETRAN.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedRole === "supervisor" && (
            <div className="p-4 sm:p-5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200 font-bold text-sm">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <span>Perfil Supervisor — Fiscalização Operacional & Regras</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                O Supervisor organiza o fluxo de custódia, define a distribuição física dos documentos no arquivo e gera os relatórios executivos para a chefia da agência.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-blue-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5" />
                    <span>Mapeamento Alfabético de Gavetas</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Na aba <strong>Mapeamento</strong>, definir qual letra inicial corresponde a qual Gaveta e Repartição (ex: Letra A ➡️ Gaveta 1 / Repartição 1). Isso padroniza a alocação em todo o posto.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-blue-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5" />
                    <span>Emissão de Relatórios & Estatísticas</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Gerar relatórios de conferência em PDF e planilhas Excel na aba <strong>Relatórios</strong> e no cabeçalho do <strong>Protocolo Geral</strong>.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-blue-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Gestão de Lotes & Anexos Oficiais</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Na sub-aba <strong>Lotes</strong>, anexar os PDFs dos ofícios de remessa e memorandos do malote, mantendo a comprovação documental arquivada de forma digital.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-blue-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    <span>Auditoria de Movimentações</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Consultar o histórico da CNH para saber quem recebeu, quem realocou e quem entregou cada documento físico, com carimbo de data e hora.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedRole === "operador" && (
            <div className="p-4 sm:p-5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-bold text-sm">
                <Headphones className="w-5 h-5 text-emerald-600" />
                <span>Perfil Operador — Rotina Diária no Balcão de Atendimento</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                O Operador executa o recebimento das remessas, a guarda física nas pastas/gavetas e a entrega final ao cidadão ou despachante credenciado.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>📥 Importar Excel (Recebidas) com Lote & PA</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Carregar a planilha da remessa. O sistema grava automaticamente a informação do <strong>LOTE</strong> e analisa o <strong>PA</strong>: se o PA bater, marca como Recebida; se o CPF já existir mas com novo PA, gera nova ordem para preservar a renovação.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5" />
                    <span>Guarda Física no Arquivo</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Imprimir a lista por gaveta ou consultar a indicação de <strong>Gaveta</strong> e <strong>Repartição</strong> para acondicionar a CNH no gaveteiro correspondente à inicial do condutor.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Protocolo de Entrega Rigoroso</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Ao atender o condutor, exigir documento oficial com foto. Se for despachante, exigir procuração específica e registrar o nome do despachante como Responsável. Coletar assinatura no recibo.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    <span>Notificação via WhatsApp</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Utilizar o botão de WhatsApp ao lado do registro para avisar o titular que o documento chegou, reduzindo o comparecimento desnecessário antes da chegada da remessa.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedRole === "consulta" && (
            <div className="p-4 sm:p-5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-sm">
                <Eye className="w-5 h-5 text-amber-600" />
                <span>Perfil Consulta — Consulta Ágil & Atendimento Rápido</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Destinado a atendentes da triagem e recepção externa que precisam apenas informar se o documento já está pronto e em qual gaveta ele se encontra, sem risco de alterar os registros operacionais.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-100 dark:border-amber-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    <span>Busca Instantânea por CPF ou Nome</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Na aba <strong>Consulta CNH</strong> ou <strong>Protocolo Geral</strong>, digitar o CPF ou nome do cidadão. O resultado aparece na hora indicando a situação ('Recebida', 'Remetida' ou 'Entregue').
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-100 dark:border-amber-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5" />
                    <span>Localização Exata de Gaveta</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Identificar prontamente o número da Gaveta e Repartição para orientar o balcão de entrega, agilizando o atendimento e diminuindo o tempo de espera do cidadão.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-100 dark:border-amber-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Visualização de Ficha Cadastral</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Clicar na linha da CNH para abrir a Ficha Completa, visualizando data de recebimento, número do lote e dados cadastrais.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-100 dark:border-amber-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Segurança Contra Alterações Indesejadas</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Este perfil não possui botões de exclusão, edição de gaveta ou baixa de entrega, evitando qualquer erro operacional acidental.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedRole === "cidadao" && (
            <div className="p-4 sm:p-5 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/60 space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200 font-bold text-sm">
                <QrCode className="w-5 h-5 text-teal-600" />
                <span>Portal Público do Cidadão & Despachantes Credenciados</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Canal aberto e seguro para consulta externa via celular ou computador, sem necessidade de login. O cidadão acompanha a chegada de sua CNH no posto de atendimento.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-teal-100 dark:border-teal-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Acesso Instantâneo via QR Code</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    O cartaz com QR Code fica afixado na entrada do DETRAN. Basta apontar a câmera do smartphone para ser direcionado à tela de consulta segura.
                  </p>
                  {citizenPortalUrl && (
                    <div className="pt-1">
                      <a
                        href={citizenPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline"
                      >
                        <span>Abrir Consulta Cidadão</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-teal-100 dark:border-teal-900 shadow-2xs space-y-1.5">
                  <div className="font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Regras para Retirada no Balcão</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    <strong>Titular:</strong> Documento original com foto.<br />
                    <strong>Despachante:</strong> Credencial válida + Procuração com poderes específicos.<br />
                    <strong>Terceiro/Parente:</strong> Procuração pública ou particular com firma reconhecida.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Seção Didática: As 3 Regras de Ouro do Sistema DETRAN-PROT */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Regras de Negócio Fundamentais
          </span>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Mecanismo de Carregamento em Lote & Inteligência de Dados</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Como o sistema garante que nenhum histórico de CNH seja perdido e que todas as remessas sejam auditáveis:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Card 1: Regra de Ouro do PA */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-blue-700 dark:text-blue-400">
              <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center font-mono text-xs">
                1
              </span>
              <span>Regra do PA (Número do Processo)</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
              O <strong>número PA</strong> é o identificador único para cada processo de CNH. Quando o cruzamento de CPF, Nome e PA encontra correspondência exata de PA:
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>PA Exato:</strong> Seta situação para <strong>RECEBIDA</strong>, atualiza a Data de Movimento (updated_at) e registra o operador logado.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span><strong>Novo PA p/ mesmo CPF:</strong> Cria um NOVO registro com novo número de ordem sequencial, sem substituir o antigo! (Ideal para renovação periódica ou adição de categoria).</span>
              </li>
            </ul>
          </div>

          {/* Card 2: Gravação da Coluna LOTE */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-400">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center font-mono text-xs">
                2
              </span>
              <span>Gravação da Coluna LOTE</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
              O número de lote discrimina o pacote físico encaminhado pela gráfica. O carregamento de planilhas grava a coluna <strong>LOTE</strong> para cada registro individual:
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                <span>Detecção automática de colunas com cabeçalhos como <code>LOTE</code>, <code>NUM_LOTE</code> ou <code>Nº LOTE</code>.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                <span>Possibilidade de digitar um <strong>Lote Padrão</strong> para toda a planilha se a coluna não estiver presente.</span>
              </li>
            </ul>
          </div>

          {/* Card 3: Varredura de Duplicatas */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400">
              <span className="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-950 flex items-center justify-center font-mono text-xs">
                3
              </span>
              <span>Varredura de Duplicatas Calibrada</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
              O motor de varredura foi calibrado para diferenciar processos legítimos de duplicatas acidentais:
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                <span>Mesmo CPF e Nome com <strong>PAs diferentes</strong>: Válido! Representa renovações legítimas e terá ordens diferentes.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>Mesmo CPF e <strong>mesmo PA</strong>: Duplicata real! O sistema aponta para que o operador decida qual manter.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Ciclo Visual de Custódia da CNH */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>Ciclo de Vida da CNH no Posto de Atendimento</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                1. Remetida
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Em trânsito</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              A CNH foi emitida pela gráfica ou sede central e enviada em malote oficial para a agência regional.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                2. Recebida
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">No posto</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              O operador importa a planilha Excel com o Lote e PA. O sistema valida os dados e a situação passa para <strong>Recebida</strong>.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                3. Alocada (Arquivo)
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">Gaveta física</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              A CNH física é guardada na gaveta e repartição indicadas pelo mapeamento alfabético. Cidadão é notificado via WhatsApp.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                4. Entregue
              </span>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono">Finalizada</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Conferência de documento do titular ou procuração do despachante. Emissão de termo de entrega assinado e baixa no sistema.
            </p>
          </div>
        </div>
      </div>

      {/* Seção FAQ: Perguntas Frequentes Didáticas (Accordion) */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          <span>Perguntas Frequentes & Resolução de Dúvidas Operacionais</span>
        </h2>

        <div className="space-y-2.5">
          {[
            {
              q: "Por que uma CNH que o cidadão renovou não substitui a anterior?",
              a: "Para garantir o histórico auditável do DETRAN. Se um condutor tirou CNH provisória e agora recebeu a definitiva, ou renovou aos 10 anos, cada processo tem um número PA único e uma ordem sequencial distinta. Manter ambos os registros preserva o histórico de quando o documento antigo esteve no posto e quando foi entregue.",
            },
            {
              q: "O que significa o número de LOTE e como ele é gravado?",
              a: "O LOTE é a identificação do malote físico em que as CNHs foram remetidas. Durante a importação da planilha Excel, o sistema lê a coluna LOTE e grava o dado no registro de cada CNH. Isso permite filtrar posteriormente todas as CNHs que vieram em uma mesma remessa.",
            },
            {
              q: "Quais documentos o terceiro ou despachante deve apresentar para retirar a CNH?",
              a: "O terceiro deve apresentar documento de identificação oficial com foto e Procuração Pública (feita em cartório) ou Particular com firma reconhecida por autenticidade. No caso de despachantes credenciados, deve ser apresentada a credencial do DETRAN e a procuração de representação do condutor titular.",
            },
            {
              q: "Como o cidadão faz para consultar a CNH sem ir ao DETRAN?",
              a: "O cidadão pode escanear o QR Code oficial disponível nos cartazes da agência ou acessar diretamente o link de consulta pública do sistema pelo celular. Basta digitar o CPF ou Nome para saber em tempo real se o documento já se encontra disponível para retirada.",
            },
            {
              q: "Como funciona a definição de Gaveta e Repartição automática?",
              a: "O sistema utiliza o Mapeamento Alfabético configurado pelo Supervisor. Pela letra inicial do nome do condutor (ex: 'Carlos' ➡️ letra C), o sistema busca a regra cadastrada (ex: Gaveta 1 / Repartição 3) e preenche automaticamente, economizando tempo no balcão.",
            },
          ]
            .filter((item) => filterMatch(item.q) || filterMatch(item.a))
            .map((item, idx) => (
              <div
                key={idx}
                className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-3.5 text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-mono text-[11px]">
                      ?
                    </span>
                    <span>{item.q}</span>
                  </span>
                  {expandedFaq === idx ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>
                {expandedFaq === idx && (
                  <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed animate-fadeIn">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Cartão de Download no Rodapé da Página */}
      <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-600 text-white shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Precisa imprimir ou compartilhar a Cartilha com a equipe?
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              O arquivo PDF gerado contém tabelas detalhadas, fluxograma oficial e todas as regras de negócio para treinamento de novos atendentes.
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadCartilhaPDF}
          disabled={isGeneratingPdf}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors shrink-0 cursor-pointer disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          <span>{isGeneratingPdf ? "Baixando..." : "Baixar Cartilha em PDF"}</span>
        </button>
      </div>
    </div>
  );
};
