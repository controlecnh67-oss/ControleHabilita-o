import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { GeralCNH } from "../types";
import { getOrgaoConfig, addPDFHeaderLogo } from "./orgaoService";
import { formatCPF, formatDateTime } from "../lib/utils";

/**
 * Constrói e faz o download do PDF oficial padronizado com a Ficha Individual da CNH.
 */
export function downloadCNHFichaPDF(cnh: GeralCNH, responsavelDisplayName?: string): void {
  const cfg = getOrgaoConfig();

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // 1. Logotipo oficial
  const hasLogo = addPDFHeaderLogo(doc, marginX, 10, 20, 20);

  // 2. Cabeçalho Oficial Governamental
  const textStartX = hasLogo ? 38 : marginX;
  const textCenterRef = hasLogo ? (textStartX + contentWidth + marginX) / 2 : pageWidth / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42); // slate-900

  const siglaDetran = cfg.sigla.includes("DETRAN") ? cfg.sigla : "DETRAN-PA";
  doc.text(siglaDetran.toUpperCase(), textCenterRef, 13, { align: "center" });

  doc.setFontSize(9.5);
  doc.text(cfg.governo.toUpperCase(), textCenterRef, 17.5, { align: "center" });
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(cfg.secretaria.toUpperCase(), textCenterRef, 21.5, { align: "center" });
  doc.text(
    (cfg.orgao.toUpperCase().includes("DEPARTAMENTO") 
      ? cfg.orgao 
      : "DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ").toUpperCase(),
    textCenterRef,
    25.5,
    { align: "center" }
  );

  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(
    (cfg.subtitulo_relatorio || "COORDENADORIA DE HABILITAÇÃO & PROTOCOLO GERAL DE CNHs").toUpperCase(),
    textCenterRef,
    29.5,
    { align: "center" }
  );

  // Linha separadora de cabeçalho
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(marginX, 33, marginX + contentWidth, 33);

  // 3. Título do Documento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("FICHA INDIVIDUAL DE PROTOCOLO E CUSTÓDIA DE CNH", pageWidth / 2, 41, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Registro Cadastral, Localização Física e Rastreabilidade do Documento", pageWidth / 2, 45.5, { align: "center" });

  // 4. Banner de Destaque: Ordem & Situação
  const bannerY = 49;
  const bannerH = 15;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, bannerY, contentWidth, bannerH, 2, 2, "FD");

  // Box Ordem
  doc.setFillColor(37, 99, 235); // blue-600
  doc.roundedRect(marginX + 2, bannerY + 2, 46, bannerH - 4, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`ORDEM #${cnh.ordem}`, marginX + 25, bannerY + 9, { align: "center" });

  // Nome do Titular no Banner
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const maxNomeWidth = contentWidth - 105;
  const truncatedNome = doc.splitTextToSize(cnh.nome.toUpperCase(), maxNomeWidth)[0];
  doc.text(truncatedNome, marginX + 52, bannerY + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const infoSubText = `CPF: ${formatCPF(cnh.cpf)}${cnh.pa ? `  •  PA: ${cnh.pa}` : ""}${cnh.telefone ? `  •  Tel: ${cnh.telefone}` : ""}`;
  doc.text(infoSubText, marginX + 52, bannerY + 11.5);

  // Badge da Situação
  let situacaoFill: [number, number, number] = [226, 232, 240];
  let situacaoTextCol: [number, number, number] = [30, 41, 59];
  const sitUpper = (cnh.situacao || "").toUpperCase();
  if (sitUpper.includes("RECEBIDA")) {
    situacaoFill = [219, 234, 254]; // blue-100
    situacaoTextCol = [29, 78, 216]; // blue-700
  } else if (sitUpper.includes("ENTREGUE")) {
    situacaoFill = [220, 252, 231]; // green-100
    situacaoTextCol = [21, 128, 61]; // green-700
  } else if (sitUpper.includes("REMETIDA")) {
    situacaoFill = [254, 243, 199]; // amber-100
    situacaoTextCol = [180, 83, 9]; // amber-700
  } else if (sitUpper.includes("PENDENTE")) {
    situacaoFill = [254, 226, 226]; // red-100
    situacaoTextCol = [185, 28, 28]; // red-700
  }

  const badgeW = 38;
  const badgeH = 8;
  const badgeX = marginX + contentWidth - badgeW - 3;
  const badgeY = bannerY + (bannerH - badgeH) / 2;
  doc.setFillColor(...situacaoFill);
  doc.setDrawColor(...situacaoTextCol);
  doc.setLineWidth(0.2);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...situacaoTextCol);
  doc.text(sitUpper, badgeX + badgeW / 2, badgeY + 5.5, { align: "center" });

  let currentY = bannerY + bannerH + 5;

  // Helper para desenhar títulos de seção elegantes
  const drawSectionHeader = (title: string, yPos: number) => {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(marginX, yPos - 4.5, contentWidth, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(title.toUpperCase(), marginX + 3, yPos - 0.5);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(marginX, yPos + 1.5, marginX + contentWidth, yPos + 1.5);
    return yPos + 4;
  };

  // 5. Tabela 1: Identificação Detalhada
  currentY = drawSectionHeader("1. Identificação do Titular / Condutor", currentY);
  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: "plain",
    tableWidth: contentWidth,
    styles: {
      fontSize: 8.5,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
      1: { cellWidth: 50 },
      2: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
      3: { cellWidth: 48 },
    },
    body: [
      [
        "Nome Completo:",
        cnh.nome,
        "Número do CPF:",
        formatCPF(cnh.cpf)
      ],
      [
        "Processo Administrativo (PA):",
        cnh.pa || "Não informado",
        "Telefone / Contato:",
        cnh.telefone || "Não informado"
      ],
    ]
  });

  currentY = (doc as any).lastAutoTable.finalY + 5;

  // 6. Tabela 2: Localização Física & Origem
  currentY = drawSectionHeader("2. Localização Física & Dados de Origem", currentY);
  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: "plain",
    tableWidth: contentWidth,
    styles: {
      fontSize: 8.5,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
      1: { cellWidth: 50 },
      2: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
      3: { cellWidth: 48 },
    },
    body: [
      [
        "Gaveta / Arquivo:",
        cnh.gaveta && cnh.gaveta.trim() ? cnh.gaveta : "Em trânsito",
        "Repartição / Posto:",
        cnh.reparticao || "Geral"
      ],
      [
        "Nº do Memorando:",
        cnh.memorando_numero || "Avulsa / Cadastro Manual",
        "Identificador Remessa:",
        cnh.remessa || "-"
      ]
    ]
  });

  currentY = (doc as any).lastAutoTable.finalY + 5;

  // 7. Tabela 3: Movimentação e Responsáveis
  currentY = drawSectionHeader("3. Controle de Movimentação e Protocolo", currentY);
  const respFinal = responsavelDisplayName || cnh.responsavel_nome || "-";
  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: "plain",
    tableWidth: contentWidth,
    styles: {
      fontSize: 8.5,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
      1: { cellWidth: 50 },
      2: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
      3: { cellWidth: 48 },
    },
    body: [
      [
        "Data / Hora Movimento:",
        formatDateTime(cnh.data_movimento),
        "Operador / Servidor:",
        cnh.usuario_nome || "Sistema"
      ],
      [
        "Responsável / Retirada:",
        respFinal,
        "Data de Cadastro no Sistema:",
        formatDateTime(cnh.created_at)
      ]
    ]
  });

  currentY = (doc as any).lastAutoTable.finalY + 5;

  // 8. Tabela 4: Observações
  currentY = drawSectionHeader("4. Observações e Anotações do Registro", currentY);
  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: "plain",
    tableWidth: contentWidth,
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    body: [
      [
        cnh.observacao && cnh.observacao.trim() 
          ? cnh.observacao 
          : "Nenhuma observação informada no cadastro desta CNH."
      ]
    ]
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // 9. Termo de Entrega / Conferência e Assinaturas
  currentY = drawSectionHeader("5. Termo de Conferência e Assinatura", currentY);
  
  const signY = currentY + 16;
  const colW = (contentWidth - 14) / 2; // 84mm cada coluna

  // Assinatura 1: Titular / Procurador
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.3);
  doc.line(marginX, signY, marginX + colW, signY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("ASSINATURA DO TITULAR / PROCURADOR", marginX + colW / 2, signY + 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`CPF: ${formatCPF(cnh.cpf)}   •   Data: _____/_____/202___`, marginX + colW / 2, signY + 7.5, { align: "center" });

  // Assinatura 2: Servidor DETRAN
  const sign2X = marginX + colW + 14;
  doc.line(sign2X, signY, sign2X + colW, signY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("SERVIDOR / ATENDENTE DO DETRAN", sign2X + colW / 2, signY + 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Matrícula / Carimbo: ________________________", sign2X + colW / 2, signY + 7.5, { align: "center" });

  // 10. Rodapé Oficial
  const footerY = pageHeight - 12;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(marginX, footerY - 4, marginX + contentWidth, footerY - 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`ID Sistema: ${cnh.id}`, marginX, footerY);
  
  const emissaoText = `Emitido em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  doc.text(emissaoText, pageWidth / 2, footerY, { align: "center" });
  
  doc.text("Ficha Oficial • Página 1 de 1", marginX + contentWidth, footerY, { align: "right" });

  // Dispara o download
  const safeNome = (cnh.nome || "CNH").trim().replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  const filename = `Ficha_CNH_Ordem_${cnh.ordem}_${safeNome}.pdf`;
  doc.save(filename);
}

/**
 * Constrói o texto formatado e padronizado da CNH para compartilhamento em mensagens
 * (WhatsApp, E-mail, memorando ou bloco de notas).
 */
export function buildCNHShareableText(cnh: GeralCNH, responsavelDisplayName?: string): string {
  const dataMovStr = formatDateTime(cnh.data_movimento);
  const dataCriadoStr = formatDateTime(cnh.created_at);
  const emissaoStr = `${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const resp = responsavelDisplayName || cnh.responsavel_nome || "-";
  const gaveta = cnh.gaveta && cnh.gaveta.trim() ? cnh.gaveta : "Em trânsito";
  const reparticao = cnh.reparticao || "Geral";
  const memo = cnh.memorando_numero || "Avulsa / Manual";
  const remessa = cnh.remessa || "-";
  const obs = cnh.observacao && cnh.observacao.trim() ? cnh.observacao : "Nenhuma observação informada.";
  const paLine = cnh.pa ? `🛡️ *Processo / PA:* ${cnh.pa}\n` : "";
  const foneLine = cnh.telefone ? `📞 *Telefone:* ${cnh.telefone}\n` : "";

  return [
    `📋 *DETRAN/PA • FICHA INDIVIDUAL DE CNH*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🆔 *Ordem:* #${cnh.ordem}`,
    `👤 *Nome:* ${cnh.nome}`,
    `📄 *CPF:* ${formatCPF(cnh.cpf)}`,
    paLine ? paLine.trimEnd() : null,
    foneLine ? foneLine.trimEnd() : null,
    `📌 *Situação Atual:* ${cnh.situacao.toUpperCase()}`,
    ``,
    `📂 *LOCALIZAÇÃO FÍSICA*`,
    `• Gaveta: ${gaveta}`,
    `• Repartição: ${reparticao}`,
    ``,
    `📑 *ORIGEM & REMESSA*`,
    `• Memorando: ${memo}`,
    `• Remessa: ${remessa}`,
    ``,
    `🕒 *CONTROLE DE MOVIMENTAÇÃO*`,
    `• Data Movimento: ${dataMovStr}`,
    `• Operador / Servidor: ${cnh.usuario_nome || "Sistema"}`,
    `• Responsável / Retirada: ${resp}`,
    `• Cadastrado em: ${dataCriadoStr}`,
    ``,
    `📝 *OBSERVAÇÕES*`,
    `${obs}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🆔 *ID Sistema:* ${cnh.id}`,
    `🏛️ *DETRAN Protocolo CNH* • Emitido em ${emissaoStr}`
  ].filter(line => line !== null).join("\n");
}
