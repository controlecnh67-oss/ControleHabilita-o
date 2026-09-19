import React from "react";
import { X, FileDown, Printer, Edit, FileText, CheckCircle } from "lucide-react";
import { Declaracao } from "../../types";
import { getOrgaoConfig } from "../../services/orgaoService";
import { downloadDeclaracaoPDF, formatDataPorExtenso, formatCPFDisplay, resolveCondutorDetails } from "../../services/declaracaoPdfService";

interface DeclaracaoViewModalProps {
  declaracao: Declaracao | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (declaracao: Declaracao) => void;
}

export const DeclaracaoViewModal: React.FC<DeclaracaoViewModalProps> = ({
  declaracao,
  isOpen,
  onClose,
  onEdit,
}) => {
  if (!isOpen || !declaracao) return null;

  const cfg = getOrgaoConfig();
  const cidade = declaracao.cidade || "Itaituba";
  const uf = declaracao.uf || "PA";
  const dataExtenso = formatDataPorExtenso(declaracao.data_emissao);

  const handleDownload = () => {
    downloadDeclaracaoPDF(declaracao);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Barra Superior */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Declaração Nº {declaracao.numero}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium">
                  Emitida
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Visualização do documento oficial pronto para impressão ou download
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Baixar PDF</span>
            </button>
            {onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(declaracao);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Folha Oficial de Visualização (Simulando A4) */}
        <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950/50">
          <div className="max-w-2xl mx-auto bg-white text-slate-900 p-8 sm:p-10 rounded-xl shadow-md border border-slate-200 text-xs font-sans space-y-6">
            
            {/* Cabeçalho Oficial */}
            <div className="text-center space-y-1 pb-4 border-b border-slate-900/40">
              {cfg.logo && (
                <div className="flex justify-center mb-2">
                  <img src={cfg.logo} alt="Logo DETRAN" className="h-14 w-auto object-contain" />
                </div>
              )}
              <div className="font-bold text-xs uppercase tracking-wider text-slate-900">
                {cfg.sigla?.includes("DETRAN") ? cfg.sigla : "DETRAN-PA"}
              </div>
              <div className="font-bold text-[11px] uppercase text-slate-900">
                {cfg.governo || "GOVERNO DO ESTADO DO PARÁ"}
              </div>
              <div className="text-[10px] uppercase text-slate-800">
                {cfg.secretaria || "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA"}
              </div>
              <div className="text-[10px] uppercase text-slate-800">
                {cfg.orgao || "DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ"}
              </div>
            </div>

            {/* Título Principal */}
            <div className="text-center pt-1">
              <h1 className="text-base font-bold uppercase tracking-widest text-slate-900">
                DECLARAÇÃO
              </h1>
            </div>

            {/* Número */}
            <div className="font-bold text-xs text-slate-900">
              NÚMERO: {declaracao.numero}
            </div>

            {/* Dados do Procurador */}
            <div className="space-y-1.5 border border-slate-200 rounded-lg p-3.5 bg-slate-50">
              <div className="font-bold uppercase text-[11px] text-slate-900 border-b border-slate-200 pb-1">
                DADOS DO PROCURADOR
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px]">
                <div>
                  <strong className="text-slate-800">NOME: </strong>
                  <span className="uppercase text-slate-900 font-medium">{declaracao.procurador_nome}</span>
                </div>
                <div>
                  <strong className="text-slate-800">CPF: </strong>
                  <span className="font-mono text-slate-900">{formatCPFDisplay(declaracao.procurador_cpf)}</span>
                </div>
                <div>
                  <strong className="text-slate-800">FONE: </strong>
                  <span className="text-slate-900">{declaracao.procurador_telefone || "-"}</span>
                </div>
                <div>
                  <strong className="text-slate-800">ENDEREÇO: </strong>
                  <span className="text-slate-900">{declaracao.procurador_endereco || "-"}</span>
                </div>
              </div>
            </div>

            {/* Texto da Declaração */}
            <p className="text-[11px] leading-relaxed text-slate-800 text-justify">
              {declaracao.texto_declaracao || 
                "Declaro, para fins administrativos, que recebi nesta agência, a Carteira Nacional de Habilitação, ou as Carteiras Nacionais de Habilitação, do(s) condutor(es) abaixo identificado(s), assumindo a responsabilidade por sua entrega ao(s) respectivo(s) destinatário(s)."}
            </p>

            {/* Tabela de Condutores */}
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 text-center font-bold text-[11px] text-slate-900 border-b border-slate-300">
                CONDUTOR(S)
              </div>
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-300 font-bold text-slate-800 uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-2.5 w-12 text-center border-r border-slate-200">ITEM</th>
                    <th className="py-2 px-3 border-r border-slate-200">NOME</th>
                    <th className="py-2 px-3 text-center border-r border-slate-200">CPF</th>
                    <th className="py-2 px-2.5 text-center border-r border-slate-200">GAVETA</th>
                    <th className="py-2 px-3 text-center border-r border-slate-200">REPARTIÇÃO</th>
                    <th className="py-2 px-3 text-center">DATA MOV. DA CNH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {declaracao.condutores && declaracao.condutores.length > 0 ? (
                    declaracao.condutores.map((c, i) => {
                      const details = resolveCondutorDetails(c);
                      return (
                        <tr key={i}>
                          <td className="py-1.5 px-2.5 text-center font-bold border-r border-slate-200">
                            {c.item || i + 1}
                          </td>
                          <td className="py-1.5 px-3 font-semibold uppercase border-r border-slate-200">
                            {c.nome}
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono text-slate-700 border-r border-slate-200">
                            {formatCPFDisplay(c.cpf) || "-"}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-slate-700 border-r border-slate-200">
                            {details.gaveta}
                          </td>
                          <td className="py-1.5 px-3 text-center text-slate-700 border-r border-slate-200">
                            {details.reparticao}
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono text-slate-700">
                            {details.data_movimento}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-2 px-3 text-center text-slate-400">
                        Nenhum condutor listado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Cidade e Data */}
            <div className="text-right text-[11px] font-medium text-slate-900 pt-2">
              {cidade}-{uf}, {dataExtenso}
            </div>

            {/* Assinaturas */}
            <div className="grid grid-cols-2 gap-8 pt-8 items-end">
              {/* Assinatura do Procurador */}
              <div className="text-center space-y-1">
                <div className="border-b border-slate-700 w-full mb-1"></div>
                <div className="font-bold text-[10px] uppercase text-slate-900">
                  {declaracao.procurador_nome}
                </div>
                <div className="text-[10px] font-mono text-slate-700">
                  {formatCPFDisplay(declaracao.procurador_cpf)}
                </div>
              </div>

              {/* Carimbo / Gerente */}
              <div className="border border-dashed border-slate-300 rounded-lg p-2.5 text-center space-y-0.5 bg-slate-50/50">
                <div className="text-[9px] italic text-slate-400">
                  [ Carimbo / Assinatura do Gerente ]
                </div>
                <div className="font-bold text-[10px] text-slate-900 pt-1">
                  {declaracao.gerente_nome || "Zedequias Carlos de Melo"}
                </div>
                <div className="text-[9px] text-slate-700">
                  {declaracao.gerente_cargo || "Gerente DETRAN"}
                </div>
                <div className="text-[9px] text-slate-700 uppercase">
                  {declaracao.gerente_unidade || `${cidade}-${uf}`}
                </div>
                <div className="text-[9px] text-slate-600 font-mono">
                  {declaracao.gerente_portaria || "Portaria 1.083/2025 - CCG"}
                </div>
              </div>
            </div>

            {/* Rodapé Oficial da Agência */}
            <div className="pt-6 border-t border-slate-300 text-center text-[9px] text-slate-500">
              Endereço: {cfg.endereco || "Tv.15 de agosto-CENTRO, CEP:68180-00- ITAITUBA/PA"}, Telefones: {cfg.telefone || "(93) 3518-1460"}
            </div>

          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Cadastrada por: <strong>{declaracao.usuario_nome || "Operador"}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
