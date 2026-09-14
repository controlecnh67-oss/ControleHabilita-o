import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Declaracao } from "../types";
import { getOrgaoConfig, addPDFHeaderLogo } from "./orgaoService";

/**
 * Converte data ISO/YYYY-MM-DD para formato por extenso:
 * Ex: "2026-09-14" -> "14 de setembro de 2026"
 */
export function formatDataPorExtenso(dataStr: string): string {
  if (!dataStr) return "";
  try {
    const parts = dataStr.split("T")[0].split("-");
    if (parts.length === 3) {
      const dia = parseInt(parts[2], 10);
      const mesIndex = parseInt(parts[1], 10) - 1;
      const ano = parseInt(parts[0], 10);
      const meses = [
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
      ];
      if (mesIndex >= 0 && mesIndex < 12) {
        return `${dia} de ${meses[mesIndex]} de ${ano}`;
      }
    }
    const d = new Date(dataStr);
    if (!isNaN(d.getTime())) {
      const meses = [
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
      ];
      return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    }
  } catch {}
  return dataStr;
}

/**
 * Formata CPF apenas com números ou mascarado
 */
export function formatCPFDisplay(cpf?: string): string {
  if (!cpf) return "";
  const clean = cpf.replace(/\D/g, "");
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }
  return cpf;
}

/**
 * Gera e retorna o objeto jsPDF correspondente à Declaração de Retirada de CNH,
 * replicando exatamente a diagramação e padrão oficial da foto do modelo.
 */
export function buildDeclaracaoDoc(declaracao: Declaracao): jsPDF {
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
  const hasLogo = addPDFHeaderLogo(doc, marginX, 8, 20, 20);

  // 2. Cabeçalho Oficial Governamental
  const textStartX = hasLogo ? 38 : marginX;
  const textCenterRef = hasLogo ? (textStartX + contentWidth + marginX) / 2 : pageWidth / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42); // slate-900

  // Se o órgão for DETRAN/PA ou configurado
  const siglaDetran = cfg.sigla.includes("DETRAN") ? cfg.sigla : "DETRAN-PA";
  doc.text(siglaDetran.toUpperCase(), textCenterRef, 12, { align: "center" });

  doc.setFontSize(9.5);
  doc.text(cfg.governo.toUpperCase(), textCenterRef, 16.5, { align: "center" });
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(cfg.secretaria.toUpperCase(), textCenterRef, 20.5, { align: "center" });
  doc.text(
    (cfg.orgao.toUpperCase().includes("DEPARTAMENTO") 
      ? cfg.orgao 
      : "DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ").toUpperCase(),
    textCenterRef,
    24.5,
    { align: "center" }
  );

  // Linha fina separadora de cabeçalho
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.line(marginX, 30, marginX + contentWidth, 30);

  // 3. Título Central "DECLARAÇÃO"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);
  doc.setTextColor(15, 23, 42);
  doc.text("DECLARAÇÃO", pageWidth / 2, 40, { align: "center" });

  // 4. Número da Declaração
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(`NÚMERO: ${declaracao.numero || "0109/2026"}`, marginX, 50);

  // 5. Bloco "DADOS DO PROCURADOR"
  let currentY = 58;

  // Barra / Título de Seção
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(marginX, currentY - 4.5, contentWidth, 6.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text("DADOS DO PROCURADOR", marginX + 2, currentY);

  currentY += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("NOME:", marginX + 2, currentY);
  doc.setFont("helvetica", "normal");
  doc.text((declaracao.procurador_nome || "").toUpperCase(), marginX + 18, currentY);

  currentY += 5;
  doc.setFont("helvetica", "bold");
  doc.text("CPF:", marginX + 2, currentY);
  doc.setFont("helvetica", "normal");
  doc.text(declaracao.procurador_cpf || "", marginX + 14, currentY);

  currentY += 5;
  doc.setFont("helvetica", "bold");
  doc.text("FONE:", marginX + 2, currentY);
  doc.setFont("helvetica", "normal");
  doc.text(declaracao.procurador_telefone || "-", marginX + 16, currentY);

  currentY += 5;
  doc.setFont("helvetica", "bold");
  doc.text("ENDEREÇO:", marginX + 2, currentY);
  doc.setFont("helvetica", "normal");
  const endText = declaracao.procurador_endereco || "-";
  const wrappedEnd = doc.splitTextToSize(endText, contentWidth - 30);
  doc.text(wrappedEnd, marginX + 26, currentY);
  currentY += (wrappedEnd.length * 4.5) + 3;

  // 6. Texto legal da declaração
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const textoPadrao = declaracao.texto_declaracao || 
    "Declaro, para fins administrativos, que recebi nesta agência, a Carteira Nacional de Habilitação, ou as Carteiras Nacionais de Habilitação, do(s) condutor(es) abaixo identificado(s), assumindo a responsabilidade por sua entrega ao(s) respectivo(s) destinatário(s).";

  const textoLinhas = doc.splitTextToSize(textoPadrao, contentWidth);
  doc.text(textoLinhas, marginX, currentY);
  currentY += (textoLinhas.length * 5) + 5;

  // 7. Tabela de CONDUTOR(ES)
  const condutoresData = (declaracao.condutores && declaracao.condutores.length > 0)
    ? declaracao.condutores.map((c, idx) => [
        String(c.item || idx + 1),
        (c.nome || "").toUpperCase(),
        c.cpf || "-"
      ])
    : [["1", "CONDUTOR NÃO INFORMADO", "-"]];

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [
      [
        { content: "CONDUTOR(S)", colSpan: 3, styles: { halign: "center", fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" } }
      ],
      ["ITEM", "NOME", "CPF"]
    ],
    body: condutoresData,
    theme: "grid",
    headStyles: {
      fillColor: [226, 232, 240], // slate-200
      textColor: [15, 23, 42],
      fontSize: 8.5,
      fontStyle: "bold",
      halign: "center",
      lineWidth: 0.25,
      lineColor: [148, 163, 184]
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
      lineWidth: 0.2,
      lineColor: [203, 213, 225],
      cellPadding: 2.2
    },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: "auto", halign: "left" },
      2: { cellWidth: 46, halign: "center" }
    }
  });

  const finalTableY = (doc as any).lastAutoTable?.finalY || currentY + 30;
  currentY = finalTableY + 12;

  // 8. Linha de Cidade e Data por extenso
  // Ex: "Itaituba-PA, 14 de setembro de 2026"
  const cidade = declaracao.cidade || "Itaituba";
  const uf = declaracao.uf || "PA";
  const dataExtenso = formatDataPorExtenso(declaracao.data_emissao);
  const localDataStr = `${cidade}-${uf}, ${dataExtenso}`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(localDataStr, marginX + contentWidth - 2, currentY, { align: "right" });

  currentY += 18;

  // 9. Bloco de Assinaturas (Procurador à esquerda, Carimbo/Gerente à direita)
  const colWidth = (contentWidth - 14) / 2;
  const leftColX = marginX;
  const rightColX = marginX + colWidth + 14;

  // Assinatura do Procurador (Esquerda)
  const procuradorY = currentY + 10;
  doc.setDrawColor(71, 85, 105); // slate-600
  doc.setLineWidth(0.35);
  doc.line(leftColX, procuradorY, leftColX + colWidth, procuradorY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text((declaracao.procurador_nome || "").toUpperCase(), leftColX + (colWidth / 2), procuradorY + 5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(declaracao.procurador_cpf || "", leftColX + (colWidth / 2), procuradorY + 9, { align: "center" });

  // Assinatura e Carimbo do Gerente / Responsável DETRAN (Direita)
  // Conforme o modelo da foto:
  // Zedequias Carlos de Melo
  // Gerente DETRAN
  // ITAITUBA-PA
  // Portaria 1.083/2025 - CCG
  const gerenteNome = declaracao.gerente_nome || "Zedequias Carlos de Melo";
  const gerenteCargo = declaracao.gerente_cargo || "Gerente DETRAN";
  const gerenteUnidade = declaracao.gerente_unidade || (uf === "PA" ? "ITAITUBA-PA" : `${cidade}-${uf}`);
  const gerentePortaria = declaracao.gerente_portaria || "Portaria 1.083/2025 - CCG";

  // Retângulo tracejado para carimbo / autenticação
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(rightColX, procuradorY - 14, colWidth, 32);
  doc.setLineDashPattern([], 0); // reset dash

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("[ Carimbo / Assinatura do Gerente ]", rightColX + (colWidth / 2), procuradorY - 9, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(gerenteNome, rightColX + (colWidth / 2), procuradorY - 2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(gerenteCargo, rightColX + (colWidth / 2), procuradorY + 2.5, { align: "center" });
  doc.text(gerenteUnidade, rightColX + (colWidth / 2), procuradorY + 6.5, { align: "center" });
  doc.text(gerentePortaria, rightColX + (colWidth / 2), procuradorY + 11, { align: "center" });

  // 10. Rodapé Oficial da Agência
  const footerY = pageHeight - 14;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginX, footerY - 4, marginX + contentWidth, footerY - 4);

  const enderecoRodape = cfg.endereco 
    ? cfg.endereco 
    : "Tv.15 de agosto-CENTRO, CEP:68180-00- ITAITUBA/PA";
  const foneRodape = cfg.telefone 
    ? cfg.telefone 
    : "(93) 3518-1460";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const rodapeCompleto = `Endereço: ${enderecoRodape}, Telefones: ${foneRodape}`;
  doc.text(rodapeCompleto, pageWidth / 2, footerY, { align: "center" });

  return doc;
}

/**
 * Faz o download direto do PDF oficial da declaração
 */
export function downloadDeclaracaoPDF(declaracao: Declaracao): void {
  const doc = buildDeclaracaoDoc(declaracao);
  const safeNumero = (declaracao.numero || "declaracao").replace(/[\/\\]/g, "-");
  doc.save(`Declaracao_${safeNumero}.pdf`);
}

/**
 * Abre o PDF em uma nova aba ou visualizador do navegador
 */
export function openDeclaracaoPDF(declaracao: Declaracao): void {
  const doc = buildDeclaracaoDoc(declaracao);
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank");
}
