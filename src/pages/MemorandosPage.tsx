import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Send, 
  Printer, 
  Users, 
  User,
  CheckCircle2, 
  AlertCircle, 
  UserPlus, 
  X, 
  ShieldAlert,
  ArrowRight,
  Download,
  ArrowDownAZ,
  RotateCcw
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrgaoConfig, addPDFHeaderLogo } from "../services/orgaoService";
import { Memorando, Candidato, MemorandoSchema, CandidatoSchema } from "../types";
import { 
  getMemorandos, 
  createMemorando, 
  updateMemorando, 
  deleteMemorando,
  getCandidatosByMemorando,
  addCandidato,
  updateCandidato,
  deleteCandidato,
  remeterMemorando,
  reabrirMemorando
} from "../services/db";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { formatCPF, formatPhone, formatDateTime, normalizeSearch } from "../lib/utils";

const getNextCandNumero = (list: Candidato[]): string => {
  let maxNum = 0;
  for (const c of list) {
    const parsed = parseInt(c.numero || "0", 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }
  const nextNum = maxNum > 0 ? maxNum + 1 : 1;
  return String(nextNum).padStart(2, "0");
};

export const MemorandosPage: React.FC<{ onNavigateToGeral?: () => void }> = ({ onNavigateToGeral }) => {
  const { user, canEdit } = useAuth();
  const [memorandos, setMemorandos] = useState<Memorando[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMemo, setSelectedMemo] = useState<Memorando | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [loadingCands, setLoadingCands] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modais
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [isCandModalOpen, setIsCandModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<Memorando | null>(null);
  const [editingCand, setEditingCand] = useState<Candidato | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "remeter" | "reabrir" | "reabrirEDeletarCand" | "deleteMemo" | "deleteCand"; title: string; message: string; target: any } | null>(null);
  const isExecutingActionRef = useRef(false);

  // Form State Memorando
  const [numero, setNumero] = useState("");
  const [remessa, setRemessa] = useState("");
  const [memoErrors, setMemoErrors] = useState<Record<string, string>>({});
  const [submittingMemo, setSubmittingMemo] = useState(false);

  // Form State Candidato
  const [candNumero, setCandNumero] = useState("");
  const [candNome, setCandNome] = useState("");
  const [candCpf, setCandCpf] = useState("");
  const [candTelefone, setCandTelefone] = useState("");
  const [candErrors, setCandErrors] = useState<Record<string, string>>({});
  const [candSuccess, setCandSuccess] = useState<string | null>(null);
  const [submittingCand, setSubmittingCand] = useState(false);
  const [sortingCands, setSortingCands] = useState(false);

  const fetchDados = async (targetId?: string | null) => {
    setLoading(true);
    try {
      const data = await getMemorandos();
      setMemorandos(data);
      const idToFind = targetId !== undefined ? targetId : selectedMemo?.id;
      if (idToFind) {
        const updated = data.find((m) => m.id === idToFind);
        if (updated) {
          setSelectedMemo(updated);
        } else {
          setSelectedMemo(null);
        }
      } else if (targetId === null) {
        setSelectedMemo(null);
      }
    } catch (err) {
      console.error("Erro ao buscar memorandos:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCandidatos = async (memoId: string) => {
    setLoadingCands(true);
    try {
      const data = await getCandidatosByMemorando(memoId);
      setCandidatos(data);
    } catch (err) {
      console.error("Erro ao buscar candidatos:", err);
    } finally {
      setLoadingCands(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, []);

  const handleSelectMemo = async (memo: Memorando) => {
    setSelectedMemo(memo);
    await fetchCandidatos(memo.id);
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        const el = document.getElementById("painel-detalhes-memorando");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  };

  const handleOpenMemoModal = (memo?: Memorando) => {
    setMemoErrors({});
    setMessage(null);
    if (memo) {
      setEditingMemo(memo);
      setNumero(memo.numero);
      setRemessa(memo.remessa || "");
    } else {
      setEditingMemo(null);
      setNumero(`MEMO-2026/${Math.floor(100 + Math.random() * 900)}`);
      setRemessa(`REM-${Math.floor(10 + Math.random() * 90)}/DETRAN`);
    }
    setIsMemoModalOpen(true);
  };

  const handleSaveMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setMemoErrors({});

    const validation = MemorandoSchema.safeParse({
      numero,
      remessa,
      status: editingMemo ? editingMemo.status : "Em elaboração",
    });

    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.issues.forEach((iss) => {
        if (iss.path[0]) errs[iss.path[0].toString()] = iss.message;
      });
      setMemoErrors(errs);
      return;
    }

    setSubmittingMemo(true);
    try {
      let targetId = selectedMemo?.id;
      if (editingMemo) {
        await updateMemorando(editingMemo.id, { numero, remessa }, user.id, user.nome_curto);
        setMessage({ type: "success", text: "Memorando atualizado com sucesso!" });
        targetId = editingMemo.id;
      } else {
        const novo = await createMemorando({ numero, remessa }, user.id, user.nome_curto);
        setMessage({ type: "success", text: "Memorando criado com sucesso! Adicione candidatos a seguir." });
        targetId = novo.id;
        setSelectedMemo(novo);
        await fetchCandidatos(novo.id);
        if (window.innerWidth < 1024) {
          setTimeout(() => {
            const el = document.getElementById("painel-detalhes-memorando");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }, 150);
        }
      }
      setIsMemoModalOpen(false);
      await fetchDados(targetId);
    } catch (err: any) {
      setMemoErrors({ geral: err.message || "Erro ao salvar memorando." });
    } finally {
      setSubmittingMemo(false);
    }
  };

  const handleDeleteMemo = async (memo: Memorando) => {
    if (!user || !canEdit) return;
    setConfirmAction({
      type: "deleteMemo",
      title: "Excluir Memorando",
      message: memo.status === "Remetido"
        ? `⚠️ Este memorando está REMETIDO. Deseja realmente excluir o memorando "${memo.numero}", todos os seus candidatos e as CNHs correspondentes na Tela Geral?`
        : `Deseja realmente excluir o memorando "${memo.numero}" e todos os seus candidatos cadastrados?`,
      target: memo
    });
  };

  // Candidatos
  const handleOpenCandModal = () => {
    if (selectedMemo && selectedMemo.usuario_id && selectedMemo.usuario_id !== user?.id) {
      alert(`Apenas o elaborador deste memorando (${selectedMemo.usuario_nome || "autor"}) pode adicionar novos candidatos.`);
      return;
    }
    setCandErrors({});
    setCandSuccess(null);
    setEditingCand(null);
    setCandNumero(getNextCandNumero(candidatos));
    setCandNome("");
    setCandCpf("");
    setCandTelefone("");
    setIsCandModalOpen(true);
  };

  const handleOpenEditCandModal = (cand: Candidato) => {
    if (selectedMemo && selectedMemo.usuario_id && selectedMemo.usuario_id !== user?.id) {
      alert(`Apenas o elaborador deste memorando (${selectedMemo.usuario_nome || "autor"}) pode editar os candidatos.`);
      return;
    }
    setCandErrors({});
    setCandSuccess(null);
    setEditingCand(cand);
    setCandNumero(cand.numero || "");
    setCandNome(cand.nome || "");
    setCandCpf(cand.cpf || "");
    setCandTelefone(cand.telefone || "");
    setIsCandModalOpen(true);
  };

  const handleSaveCand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedMemo) return;
    if (selectedMemo.usuario_id && selectedMemo.usuario_id !== user.id) {
      setCandErrors({ geral: `Apenas o elaborador deste memorando (${selectedMemo.usuario_nome || "autor"}) pode adicionar ou editar candidatos.` });
      return;
    }
    setCandErrors({});

    const validation = CandidatoSchema.safeParse({
      numero: candNumero,
      nome: candNome,
      cpf: formatCPF(candCpf),
      telefone: formatPhone(candTelefone),
    });

    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.issues.forEach((iss) => {
        if (iss.path[0]) errs[iss.path[0].toString()] = iss.message;
      });
      setCandErrors(errs);
      return;
    }

    // Checar duplicidade de candidato na lista deste memorando
    const formattedCpf = formatCPF(candCpf);
    const cleanCpf = formattedCpf.replace(/\D/g, "");
    const cleanNome = candNome.trim().toLowerCase();

    const otherCands = editingCand
      ? candidatos.filter((c) => c.id !== editingCand.id)
      : candidatos;

    if (cleanCpf.length >= 11) {
      const dupCpf = otherCands.find((c) => (c.cpf || "").replace(/\D/g, "") === cleanCpf);
      if (dupCpf) {
        setCandErrors({
          cpf: `O candidato com CPF ${dupCpf.cpf} ("${dupCpf.nome}") já consta na lista deste memorando.`,
        });
        return;
      }
    }

    if (cleanNome) {
      const dupNome = otherCands.find((c) => (c.nome || "").trim().toLowerCase() === cleanNome);
      if (dupNome) {
        setCandErrors({
          nome: `O candidato "${dupNome.nome}" já foi adicionado a este memorando.`,
        });
        return;
      }
    }

    setSubmittingCand(true);
    try {
      if (editingCand) {
        await updateCandidato(
          editingCand.id,
          {
            numero: candNumero,
            nome: candNome,
            cpf: formatCPF(candCpf),
            telefone: formatPhone(candTelefone),
          },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: `Candidato "${candNome}" atualizado com sucesso!` });
        const updatedCands = await getCandidatosByMemorando(selectedMemo.id);
        setCandidatos(updatedCands);
        await fetchDados(selectedMemo.id);
        setIsCandModalOpen(false);
        setEditingCand(null);
      } else {
        await addCandidato(
          selectedMemo.id,
          {
            numero: candNumero,
            nome: candNome,
            cpf: formatCPF(candCpf),
            telefone: formatPhone(candTelefone),
            remessa: selectedMemo.remessa,
          },
          user.id,
          user.nome_curto
        );
        setMessage({ type: "success", text: `Candidato "${candNome}" adicionado ao memorando!` });
        const updatedCands = await getCandidatosByMemorando(selectedMemo.id);
        setCandidatos(updatedCands);
        await fetchDados(selectedMemo.id);

        // Manter a modal aberta e preparar campos para o próximo candidato
        setCandSuccess(`✅ Candidato "${candNome}" cadastrado com sucesso! Pode adicionar o próximo.`);
        setTimeout(() => setCandSuccess(null), 4000);
        setCandNumero(getNextCandNumero(updatedCands));
        setCandNome("");
        setCandCpf("");
        setCandTelefone("");
      }
    } catch (err: any) {
      setCandErrors({ geral: err.message || "Erro ao salvar candidato." });
    } finally {
      setSubmittingCand(false);
    }
  };

  const handleDeleteCand = async (cand: Candidato) => {
    if (!user || !canEdit || !selectedMemo) return;
    if (selectedMemo.status !== "Em elaboração") {
      setConfirmAction({
        type: "reabrirEDeletarCand",
        title: "Reabrir Memorando e Remover Candidato",
        message: `Este memorando está "${selectedMemo.status}". Para remover o candidato "${cand.nome}", o memorando será reaberto para "Em elaboração".\n\nDeseja reabrir o memorando e remover o candidato agora?`,
        target: cand
      });
      return;
    }
    setConfirmAction({
      type: "deleteCand",
      title: "Remover Candidato",
      message: `Deseja realmente remover o candidato "${cand.nome}" deste memorando?`,
      target: cand
    });
  };

  const handleReabrirMemo = async (memo: Memorando) => {
    if (!user || !canEdit) return;
    setConfirmAction({
      type: "reabrir",
      title: "Reabrir Memorando para Edição",
      message: `🔓 Deseja reabrir o memorando "${memo.numero}"?\n\nO status do memorando será alterado para "Em elaboração", permitindo que você exclua ou adicione candidatos.\n\nApós ajustar a lista, você poderá clicar em "Remeter para Protocolo" novamente para enviar os dados atualizados para a Lista Geral.`,
      target: memo
    });
  };

  const handleSortCandidatosAZ = async () => {
    if (!candidatos || candidatos.length <= 1) return;
    setSortingCands(true);
    try {
      const sorted = [...candidatos].sort((a, b) =>
        (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" })
      );

      const renumbered = sorted.map((cand, idx) => ({
        ...cand,
        numero: String(idx + 1).padStart(2, "0")
      }));

      setCandidatos(renumbered);

      if (selectedMemo && selectedMemo.status === "Em elaboração" && canEdit) {
        for (const cand of renumbered) {
          await updateCandidato(cand.id, { numero: cand.numero }, user!.id, user!.nome_curto);
        }
      }
      setMessage({ type: "success", text: "Lista de candidatos ordenada de A a Z com sucesso!" });
    } catch (err: any) {
      console.error("Erro ao ordenar candidatos:", err);
    } finally {
      setSortingCands(false);
    }
  };

  // Ação REMETER
  const handleRemeter = async () => {
    if (!user || !selectedMemo || !canEdit) return;
    if (selectedMemo.status !== "Em elaboração") {
      alert("Este memorando já foi remetido. Clique no botão 'Reabrir Memorando' se precisar alterar a lista e remeter novamente.");
      return;
    }
    if (candidatos.length === 0) {
      alert("Não é possível remeter um memorando vazio. Adicione pelo menos 1 candidato.");
      return;
    }

    setConfirmAction({
      type: "remeter",
      title: "Confirmar Remessa para Protocolo",
      message: `🚀 Confirmar remessa de ${candidatos.length} CNH(s) do ${selectedMemo.numero} para o setor de protocolo Geral?\n\nIsso gerará automaticamente a próxima Ordem sequencial para cada candidato e alterará a situação para 'Remetida'.`,
      target: selectedMemo
    });
  };

  const handleExecuteConfirmAction = async () => {
    if (!confirmAction || !user || isExecutingActionRef.current) return;
    const action = confirmAction;
    
    // Fecha a modal IMEDIATAMENTE ao clicar para evitar duplo clique e envio duplicado
    setConfirmAction(null);
    isExecutingActionRef.current = true;

    try {
      if (action.type === "remeter") {
        const total = await remeterMemorando(action.target.id, user.id, user.nome_curto);
        setMessage({
          type: "success",
          text: `🎯 Remessa concluída com sucesso! ${total} CNH(s) remetidas ao Protocolo Geral com Ordem sequencial automática.`
        });
        await fetchDados(action.target.id);
      } else if (action.type === "reabrir") {
        await reabrirMemorando(action.target.id, user.id, user.nome_curto);
        setMessage({
          type: "success",
          text: `🔓 Memorando "${action.target.numero}" reaberto com sucesso! Status alterado para 'Em elaboração'. Agora você pode excluir ou adicionar candidatos e remetê-lo novamente.`
        });
        await fetchDados(action.target.id);
      } else if (action.type === "reabrirEDeletarCand") {
        await reabrirMemorando(selectedMemo!.id, user.id, user.nome_curto);
        await deleteCandidato(action.target.id, user.id, user.nome_curto);
        setMessage({
          type: "success",
          text: `🔓 Memorando reaberto e candidato "${action.target.nome}" removido com sucesso!`
        });
        const updated = await getCandidatosByMemorando(selectedMemo!.id);
        setCandidatos(updated);
        await fetchDados(selectedMemo?.id);
      } else if (action.type === "deleteMemo") {
        await deleteMemorando(action.target.id, user.id, user.nome_curto);
        setMessage({ type: "success", text: "Memorando excluído com sucesso!" });
        const isCurrentSelected = selectedMemo?.id === action.target.id;
        if (isCurrentSelected) {
          setSelectedMemo(null);
          setCandidatos([]);
        }
        await fetchDados(isCurrentSelected ? null : selectedMemo?.id);
      } else if (action.type === "deleteCand") {
        await deleteCandidato(action.target.id, user.id, user.nome_curto);
        setMessage({ type: "success", text: `Candidato "${action.target.nome}" removido.` });
        const updated = await getCandidatosByMemorando(selectedMemo!.id);
        setCandidatos(updated);
        await fetchDados(selectedMemo?.id);
      }
    } catch (err: any) {
      alert(err.message || "Erro na operação.");
    } finally {
      isExecutingActionRef.current = false;
    }
  };

  const handlePrint = () => {
    setIsPrintModalOpen(true);
  };

  const handleExecPrint = () => {
    window.print();
  };

  const handleGeneratePDF = () => {
    if (!selectedMemo) return;
    try {
      const cfg = getOrgaoConfig();

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Tenta desenhar a logo oficial no lado esquerdo do cabeçalho
      addPDFHeaderLogo(doc, 14, 8, 22, 22);

      // Cabeçalho Oficial
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(cfg.governo.toUpperCase(), 112, 13, { align: "center" });
      doc.setFontSize(10);
      doc.text(cfg.secretaria.toUpperCase(), 112, 19, { align: "center" });
      doc.text(cfg.orgao.toUpperCase(), 112, 25, { align: "center" });

      // Linha divisória do cabeçalho
      doc.setDrawColor(30, 41, 59); // slate-800
      doc.setLineWidth(0.5);
      doc.line(14, 32, 196, 32);

      // Informações do Memorando
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      
      // Esquerda
      doc.setFont("helvetica", "bold");
      doc.text("Memorando Nº:", 14, 39);
      doc.setFont("helvetica", "normal");
      doc.text(selectedMemo.numero, 45, 39);

      doc.setFont("helvetica", "bold");
      doc.text("Lote / Remessa:", 14, 45);
      doc.setFont("helvetica", "normal");
      doc.text(selectedMemo.remessa || "Não especificado", 45, 45);

      // Direita
      doc.setFont("helvetica", "bold");
      doc.text("Data de Emissão:", 115, 39);
      doc.setFont("helvetica", "normal");
      doc.text(formatDateTime(selectedMemo.created_at), 148, 39);

      doc.setFont("helvetica", "bold");
      doc.text("Responsável:", 115, 45);
      doc.setFont("helvetica", "normal");
      doc.text(selectedMemo.usuario_nome || "Não informado", 148, 45);

      // Origem e Destino do Órgão
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(cfg.origem_padrao, 14, 53);
      doc.text(cfg.destino_padrao, 14, 59);

      // Parágrafo introdutório
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const introText = `Servimo-nos do presente para encaminhar a esta agência os processos dos candidatos abaixo relacionados para impressão das Carteiras Nacionais de Habilitação (CNHs).`;
      const splitIntro = doc.splitTextToSize(introText, 182);
      doc.text(splitIntro, 14, 68);

      // Tabela de Candidatos
      const tableData = candidatos.map((c, idx) => [
        c.numero || String(idx + 1),
        c.nome.toUpperCase(),
        formatCPF(c.cpf)
      ]);

      const startYTable = 68 + (splitIntro.length * 5) + 3;

      autoTable(doc, {
        startY: startYTable,
        head: [["Nº", "Nome do Titular", "CPF"]],
        body: tableData,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: { top: 1, bottom: 1, left: 2, right: 2 },
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [241, 245, 249], // slate-100
          textColor: [15, 23, 42], // slate-900
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 16, fontStyle: "bold" },
          1: { cellWidth: "auto" },
          2: { halign: "center", cellWidth: 46, font: "courier" },
        },
        didDrawPage: () => {
          const pageStr = `Página ${(doc.internal as any).getNumberOfPages()}`;
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text("Sistema DETRAN-PROT — Controle Operacional de Protocolo e Entregas", 14, doc.internal.pageSize.getHeight() - 10);
          doc.text(pageStr, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 10, { align: "right" });
        },
      });

      // Seção de Assinaturas
      const finalY = (doc as any).lastAutoTable?.finalY || startYTable + 30;
      let sigY = finalY + 28;
      if (sigY > 260) {
        doc.addPage();
        sigY = 40;
      }

      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      
      // Assinatura Esquerda
      doc.line(18, sigY, 90, sigY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(selectedMemo.usuario_nome || "Servidor Emissor", 54, sigY + 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("Servidor Emissor (Remetente)", 54, sigY + 8, { align: "center" });

      // Assinatura Direita
      doc.line(116, sigY, 188, sigY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("Gerente", 152, sigY + 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("CIRETRAN de Itaituba-PA", 152, sigY + 8, { align: "center" });

      const safeNum = selectedMemo.numero.replace(/[^a-zA-Z0-9]/g, "_");
      doc.save(`Memorando_${safeNum}_${new Date().toISOString().slice(0, 10)}.pdf`);

      setMessage({
        type: "success",
        text: `✅ Arquivo PDF do memorando ${selectedMemo.numero} baixado com sucesso!`
      });
    } catch (err: any) {
      console.error("Erro ao gerar PDF do memorando:", err);
      alert("Erro ao gerar o arquivo PDF: " + (err.message || "Tente novamente."));
    }
  };

  const normSearch = normalizeSearch(searchTerm);
  const filteredMemos = memorandos.filter(
    (m) =>
      !normSearch ||
      normalizeSearch(m.numero).includes(normSearch) ||
      normalizeSearch(m.remessa).includes(normSearch)
  );

  const isMyMemo = Boolean(user && selectedMemo && selectedMemo.usuario_id === user.id);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Controle de Memorandos e Remessas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Elabore memorandos, adicione candidatos e remeta CNHs diretamente para o fluxo da tabela Geral.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar número, remessa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all w-full sm:w-64"
            />
          </div>

          {canEdit && (
            <button
              onClick={() => handleOpenMemoModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo Memorando
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-center justify-between animate-fadeIn border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
          {message.text.includes("Remessa concluída") && onNavigateToGeral && (
            <button
              onClick={onNavigateToGeral}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
            >
              <span>Ver na Tela Geral</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Grid: Lista de Memorandos à Esquerda (5 cols) | Detalhes do Memorando à Direita (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Esquerda: Lista de Memorandos */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col overflow-hidden max-h-[680px]">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Memorandos Cadastrados ({filteredMemos.length})
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Carregando memorandos...</div>
            ) : filteredMemos.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Nenhum memorando encontrado.</div>
            ) : (
              filteredMemos.map((m) => {
                const isSelected = selectedMemo?.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleSelectMemo(m)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/80 dark:bg-blue-950/60 border-blue-500 shadow-sm"
                        : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {m.numero}
                          </span>
                          <Badge situacao={m.status} />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Remessa: <strong className="text-slate-700 dark:text-slate-300">{m.remessa || "Sem remessa"}</strong>
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Elaborado por: <strong className="text-slate-700 dark:text-slate-300">{m.usuario_nome || "Não informado"}</strong></span>
                        </p>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {m.status !== "Em elaboração" && (
                            <button
                              onClick={() => handleReabrirMemo(m)}
                              title="Reabrir memorando para edição/exclusão"
                              className="p-1 text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 rounded-md transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenMemoModal(m)}
                            title="Editar memorando"
                            className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMemo(m)}
                            title="Excluir memorando"
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 font-medium">
                        <Users className="w-3.5 h-3.5 text-blue-500" />
                        {m.candidatos_count || 0} candidato(s)
                      </span>
                      <span>Criado em: {formatDateTime(m.created_at).slice(0, 10)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Direita: Painel de Candidatos e Ações do Memorando Selecionado */}
        <div id="painel-detalhes-memorando" className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col min-h-[500px]">
          {selectedMemo ? (
            <>
              {/* Top Bar do Memorando */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {selectedMemo.numero}
                    </h3>
                    <Badge situacao={selectedMemo.status} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Lote de Remessa: <strong>{selectedMemo.remessa || "Não especificado"}</strong> | Cadastrado por: {selectedMemo.usuario_nome}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir
                  </button>

                  {canEdit && (
                    <>
                      {selectedMemo.status === "Em elaboração" ? (
                        <>
                          {isMyMemo ? (
                            <button
                              onClick={handleOpenCandModal}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Adicionar Candidato
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 font-medium rounded-xl text-xs" title="Apenas o usuário que elaborou o memorando pode adicionar novos candidatos">
                              🔒 Apenas {selectedMemo.usuario_nome || "o autor"} pode adicionar
                            </span>
                          )}

                          <button
                            onClick={handleRemeter}
                            disabled={candidatos.length === 0}
                            title="Remeter CNHs para a Tela Geral"
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md shadow-amber-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Remeter para Protocolo
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleReabrirMemo(selectedMemo)}
                          title="Reabrir memorando para excluir/editar candidatos e remeter novamente"
                          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md shadow-amber-600/20 text-xs transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reabrir Memorando
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Lista de Candidatos */}
              <div className="flex-1 p-5 overflow-y-auto">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Candidatos / Titulares da CNH ({candidatos.length})
                    </h4>
                    {candidatos.length > 1 && (
                      <button
                        type="button"
                        onClick={handleSortCandidatosAZ}
                        disabled={sortingCands}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 font-semibold rounded-lg text-xs border border-blue-200/80 dark:border-blue-800/80 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        title="Ordenar lista de candidatos de A a Z por Nome"
                      >
                        <ArrowDownAZ className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>{sortingCands ? "Ordenando..." : "Ordenar de A a Z"}</span>
                      </button>
                    )}
                  </div>
                  {selectedMemo.status === "Em elaboração" ? (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ Clique em &quot;Remeter para Protocolo&quot; para enviar ao balcão Geral.
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                      ℹ️ Memorando Remetido. Clique em &quot;Reabrir Memorando&quot; para excluir/editar candidatos.
                    </span>
                  )}
                </div>

                {loadingCands ? (
                  <div className="p-12 text-center text-xs text-slate-500">Carregando candidatos...</div>
                ) : candidatos.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium">Nenhum candidato inserido neste memorando.</p>
                    {canEdit && selectedMemo.status === "Em elaboração" && (
                      isMyMemo ? (
                        <button
                          onClick={handleOpenCandModal}
                          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-all cursor-pointer"
                        >
                          Adicionar Primeiro Candidato
                        </button>
                      ) : (
                        <p className="mt-3 text-xs text-rose-500 font-medium bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 py-2 px-3 rounded-xl max-w-md mx-auto">
                          🔒 Apenas o usuário {selectedMemo.usuario_nome || "autor"} pode adicionar candidatos neste memorando.
                        </p>
                      )
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          <th className="py-2.5 px-4 w-16 text-center">Nº</th>
                          <th className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <span>Nome do Candidato</span>
                              {candidatos.length > 1 && (
                                <button
                                  type="button"
                                  onClick={handleSortCandidatosAZ}
                                  disabled={sortingCands}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                                  title="Ordenar lista de A a Z por Nome"
                                >
                                  <ArrowDownAZ className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </th>
                          <th className="py-2.5 px-4">CPF</th>
                          <th className="py-2.5 px-4">Telefone</th>
                          {canEdit && (
                            <th className="py-2.5 px-4 w-20 text-right">Ações</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {candidatos.map((cand, idx) => (
                          <tr key={cand.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-4 text-center font-bold text-slate-400">
                              {cand.numero || idx + 1}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                              {cand.nome}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                              {cand.cpf}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                              {cand.telefone || "-"}
                            </td>
                            {canEdit && (
                              <td className="py-2.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleOpenEditCandModal(cand)}
                                    className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
                                    title="Editar candidato"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCand(cand)}
                                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors cursor-pointer"
                                    title="Remover candidato do memorando"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <FileText className="w-12 h-12 text-slate-200 dark:text-slate-800 mb-3" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Selecione um memorando à esquerda para visualizar seus candidatos
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Ou clique no botão &quot;Novo Memorando&quot; acima para iniciar o processo de remessa de um novo lote de CNHs.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Modal: Criar/Editar Memorando */}
      <Modal
        isOpen={isMemoModalOpen}
        onClose={() => setIsMemoModalOpen(false)}
        title={editingMemo ? "Editar Memorando" : "Criar Novo Memorando"}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveMemo} className="space-y-4">
          {memoErrors.geral && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-medium">
              {memoErrors.geral}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Número do Memorando <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="ex: MEMO-2026/045"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            {memoErrors.numero && <p className="text-[11px] text-rose-500 mt-1">{memoErrors.numero}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lote / Identificação de Remessa
            </label>
            <input
              type="text"
              value={remessa}
              onChange={(e) => setRemessa(e.target.value)}
              placeholder="ex: REM-004/MAIO"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsMemoModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingMemo}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submittingMemo ? "Salvando..." : "Salvar Memorando"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Adicionar/Editar Candidato ao Memorando */}
      <Modal
        isOpen={isCandModalOpen}
        onClose={() => setIsCandModalOpen(false)}
        title={editingCand ? "Editar Candidato (CNH) no Memorando" : "Adicionar Candidato (CNH) ao Memorando"}
        maxWidth="md"
      >
        <form onSubmit={handleSaveCand} className="space-y-4">
          {candSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {candSuccess}
            </div>
          )}

          {candErrors.geral && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-medium">
              {candErrors.geral}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Número / Item
              </label>
              <input
                type="text"
                value={candNumero}
                onChange={(e) => setCandNumero(e.target.value)}
                placeholder="01"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CPF do Candidato <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={candCpf}
                onChange={(e) => setCandCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
              {candErrors.cpf && <p className="text-[11px] text-rose-500 mt-1">{candErrors.cpf}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo do Candidato <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={candNome}
              onChange={(e) => setCandNome(e.target.value)}
              placeholder="ex: João da Silva Souza"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            {candErrors.nome && <p className="text-[11px] text-rose-500 mt-1">{candErrors.nome}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Telefone Celular / Contato <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={candTelefone}
              onChange={(e) => setCandTelefone(formatPhone(e.target.value))}
              placeholder="(67) 99999-9999"
              maxLength={15}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            {candErrors.telefone && <p className="text-[11px] text-rose-500 mt-1">{candErrors.telefone}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsCandModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Concluir / Fechar
            </button>
            <button
              type="submit"
              disabled={submittingCand}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submittingCand ? "Salvando..." : editingCand ? "Salvar Alterações" : "+ Adicionar ao Lote"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal / Visualização de Impressão do Memorando */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="Visualização para Impressão de Memorando"
        maxWidth="xl"
      >
        {selectedMemo && (
          <div className="space-y-6 text-slate-900 dark:text-slate-100">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                <Printer className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Você pode imprimir via navegador ou baixar o PDF formatado no padrão oficial DETRAN/PA.</span>
              </div>
              <button
                type="button"
                onClick={handleGeneratePDF}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-xs transition-all cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar PDF Oficial</span>
              </button>
            </div>

            <div className="p-8 bg-white text-slate-900 border-2 border-slate-300 rounded-xl shadow-inner font-serif">
              {/* Cabeçalho Oficial */}
              <div className="border-b-2 border-slate-800 pb-4 mb-6 flex items-center justify-between gap-4">
                {getOrgaoConfig().logo && (
                  <img src={getOrgaoConfig().logo} alt="Logo" className="h-16 w-auto object-contain shrink-0" />
                )}
                <div className="text-center flex-1">
                  <h2 className="text-base font-bold tracking-wide uppercase">{getOrgaoConfig().governo}</h2>
                  <h3 className="text-xs font-bold uppercase mt-0.5">{getOrgaoConfig().secretaria}</h3>
                  <h4 className="text-xs font-bold uppercase mt-0.5 text-slate-800">{getOrgaoConfig().orgao}</h4>
                </div>
              </div>

              {/* Informações do Memorando */}
              <div className="flex justify-between items-baseline mb-4 font-sans text-sm">
                <div>
                  <p><strong>Memorando Nº:</strong> {selectedMemo.numero}</p>
                  <p><strong>Lote / Remessa:</strong> {selectedMemo.remessa || "Não especificado"}</p>
                </div>
                <div className="text-right">
                  <p><strong>Data de Emissão:</strong> {formatDateTime(selectedMemo.created_at)}</p>
                  <p><strong>Responsável:</strong> {selectedMemo.usuario_nome}</p>
                </div>
              </div>

              <div className="mb-6 font-sans text-sm font-bold text-slate-800 space-y-1">
                <p>{getOrgaoConfig().origem_padrao}</p>
                <p>{getOrgaoConfig().destino_padrao}</p>
              </div>

              <div className="mb-6 font-sans text-sm leading-relaxed">
                <p>
                  Servimo-nos do presente para encaminhar a esta agência os processos dos candidatos abaixo relacionados para impressão das Carteiras Nacionais de Habilitação (CNHs).
                </p>
              </div>

              {/* Tabela Impressa */}
              <table className="w-full text-left border-collapse border border-slate-400 font-sans text-xs mb-8">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-400 font-bold">
                    <th className="px-2 py-1 border-r border-slate-400 w-12 text-center">Nº</th>
                    <th className="px-2 py-1 border-r border-slate-400">Nome do Titular</th>
                    <th className="px-2 py-1 w-36 text-center">CPF</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatos.map((c, idx) => (
                    <tr key={c.id} className="border-b border-slate-300">
                      <td className="px-2 py-1 border-r border-slate-300 text-center font-bold">{c.numero || idx + 1}</td>
                      <td className="px-2 py-1 border-r border-slate-300 uppercase">{c.nome}</td>
                      <td className="px-2 py-1 font-mono text-center">{c.cpf}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Assinaturas */}
              <div className="grid grid-cols-2 gap-12 pt-12 mt-8 border-t border-slate-300 font-sans text-xs text-center">
                <div>
                  <div className="w-48 mx-auto border-b border-slate-800 mb-1" />
                  <p className="font-bold">{selectedMemo.usuario_nome || "Servidor Emissor"}</p>
                  <p className="text-slate-600">Servidor Emissor (Remetente)</p>
                </div>
                <div>
                  <div className="w-48 mx-auto border-b border-slate-800 mb-1" />
                  <p className="font-bold">Gerente</p>
                  <p className="text-slate-600">CIRETRAN de Itaituba-PA</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleExecPrint}
                title="Abre a caixa de diálogo de impressão do navegador"
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-xs transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Documento</span>
              </button>
              <button
                type="button"
                onClick={handleGeneratePDF}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/20 text-xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>📥 Baixar PDF Oficial</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Confirmação (Substitui window.confirm para compatibilidade com iFrame e melhor UX) */}
      <Modal
        isOpen={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.title || "Confirmar Ação"}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed font-medium">
            {confirmAction?.message}
          </p>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExecuteConfirmAction}
              className={`px-5 py-2 font-bold rounded-xl text-xs text-white shadow-md transition-all cursor-pointer ${
                confirmAction?.type === "remeter"
                  ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
              }`}
            >
              {confirmAction?.type === "remeter" 
                ? "Sim, Confirmar Remessa" 
                : confirmAction?.type === "reabrir" || confirmAction?.type === "reabrirEDeletarCand"
                ? "Sim, Reabrir e Continuar"
                : "Sim, Excluir"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
