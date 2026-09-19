import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Search,
  UserPlus,
  Plus,
  Trash2,
  FileDown,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Building2,
  Loader2
} from "lucide-react";
import { Declaracao, DeclaracaoItemCondutor, Responsavel, GeralCNH } from "../../types";
import {
  getResponsaveis,
  createResponsavel,
  getGeralCNHs,
  getNextDeclaracaoNumero,
  createDeclaracao,
  updateDeclaracao
} from "../../services/db";
import { getOrgaoConfig } from "../../services/orgaoService";
import { useAuth } from "../../context/AuthContext";
import { formatCPFDisplay, formatDataCurta } from "../../services/declaracaoPdfService";
import { formatCPF, formatPhone } from "../../lib/utils";

interface DeclaracaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (declaracao: Declaracao, downloadPdf?: boolean) => void;
  declaracaoToEdit?: Declaracao | null;
}

export const DeclaracaoModal: React.FC<DeclaracaoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  declaracaoToEdit,
}) => {
  const { user } = useAuth();
  const cfg = getOrgaoConfig();

  // Estados principais da declaração
  const [numero, setNumero] = useState("");
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [cidade, setCidade] = useState(cfg.cidade_uf?.split("-")[0]?.trim() || "Itaituba");
  const [uf, setUf] = useState(cfg.cidade_uf?.split("-")[1]?.trim() || "PA");

  // Dados do Procurador
  const [procuradorId, setProcuradorId] = useState<string>("");
  const [procuradorNome, setProcuradorNome] = useState("");
  const [procuradorCpf, setProcuradorCpf] = useState("");
  const [procuradorTelefone, setProcuradorTelefone] = useState("");
  const [procuradorEndereco, setProcuradorEndereco] = useState("");
  const [procuradorSearch, setProcuradorSearch] = useState("");
  const [isProcuradorDropdownOpen, setIsProcuradorDropdownOpen] = useState(false);
  const procuradorDropdownRef = useRef<HTMLDivElement>(null);

  // Lista de Responsáveis existentes para autocomplete
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);

  // Sub-modal: Cadastro rápido de novo procurador
  const [showNovoProcuradorModal, setShowNovoProcuradorModal] = useState(false);
  const [novoProcNome, setNovoProcNome] = useState("");
  const [novoProcCpf, setNovoProcCpf] = useState("");
  const [novoProcTelefone, setNovoProcTelefone] = useState("");
  const [novoProcEndereco, setNovoProcEndereco] = useState("");
  const [novoProcError, setNovoProcError] = useState("");
  const [isSavingNovoProc, setIsSavingNovoProc] = useState(false);

  // Texto legal da declaração
  const defaultTexto =
    "Declaro, para fins administrativos, que recebi nesta agência, a Carteira Nacional de Habilitação, ou as Carteiras Nacionais de Habilitação, do(s) condutor(es) abaixo identificado(s), assumindo a responsabilidade por sua entrega ao(s) respectivo(s) destinatário(s).";
  const [textoDeclaracao, setTextoDeclaracao] = useState(defaultTexto);

  // Condutores da Declaração
  const [condutores, setCondutores] = useState<DeclaracaoItemCondutor[]>([]);

  // Busca de CNHs no Protocolo Geral
  const [allCNHs, setAllCNHs] = useState<GeralCNH[]>([]);
  const [cnhSearch, setCnhSearch] = useState("");
  const [isSearchingCNH, setIsSearchingCNH] = useState(false);

  // Adição manual de condutor
  const [showManualCondutor, setShowManualCondutor] = useState(false);
  const [manualNome, setManualNome] = useState("");
  const [manualCpf, setManualCpf] = useState("");
  const [manualPa, setManualPa] = useState("");
  const [manualGaveta, setManualGaveta] = useState("");
  const [manualReparticao, setManualReparticao] = useState("");
  const [manualDataMovimento, setManualDataMovimento] = useState(new Date().toISOString().slice(0, 10));

  // Configurações de Assinatura do Gerente / Órgão
  const [showGerenteConfig, setShowGerenteConfig] = useState(false);
  const [gerenteNome, setGerenteNome] = useState("Zedequias Carlos de Melo");
  const [gerenteCargo, setGerenteCargo] = useState("Gerente DETRAN");
  const [gerenteUnidade, setGerenteUnidade] = useState("ITAITUBA-PA");
  const [gerentePortaria, setGerentePortaria] = useState("Portaria 1.083/2025 - CCG");

  // Estados de controle e feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Fechar dropdown de procurador ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        procuradorDropdownRef.current &&
        !procuradorDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProcuradorDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Carregar dados de apoio (Responsáveis e CNHs)
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadData() {
      try {
        const [resps, cnhs] = await Promise.all([getResponsaveis(), getGeralCNHs()]);
        if (isMounted) {
          setResponsaveis(resps);
          setAllCNHs(cnhs);
        }
      } catch (err) {
        console.error("Erro ao carregar dados para declaração:", err);
      }
    }
    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Inicializar formulário para criação ou edição
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg("");
    if (declaracaoToEdit) {
      setNumero(declaracaoToEdit.numero);
      setAno(declaracaoToEdit.ano || new Date().getFullYear());
      setDataEmissao(declaracaoToEdit.data_emissao || new Date().toISOString().slice(0, 10));
      setCidade(declaracaoToEdit.cidade || "Itaituba");
      setUf(declaracaoToEdit.uf || "PA");
      setProcuradorId(declaracaoToEdit.procurador_id || "");
      setProcuradorNome(declaracaoToEdit.procurador_nome || "");
      setProcuradorCpf(declaracaoToEdit.procurador_cpf || "");
      setProcuradorTelefone(declaracaoToEdit.procurador_telefone || "");
      setProcuradorEndereco(declaracaoToEdit.procurador_endereco || "");
      setTextoDeclaracao(declaracaoToEdit.texto_declaracao || defaultTexto);
      setCondutores(declaracaoToEdit.condutores || []);
      setGerenteNome(declaracaoToEdit.gerente_nome || "Zedequias Carlos de Melo");
      setGerenteCargo(declaracaoToEdit.gerente_cargo || "Gerente DETRAN");
      setGerenteUnidade(declaracaoToEdit.gerente_unidade || "ITAITUBA-PA");
      setGerentePortaria(declaracaoToEdit.gerente_portaria || "Portaria 1.083/2025 - CCG");
    } else {
      // Nova Declaração: obter próximo número sequencial
      getNextDeclaracaoNumero()
        .then((nextNum) => {
          setNumero(nextNum);
        })
        .catch(() => {
          setNumero(`0110/${new Date().getFullYear()}`);
        });

      setAno(new Date().getFullYear());
      setDataEmissao(new Date().toISOString().slice(0, 10));
      setCidade(cfg.cidade_uf?.split("-")[0]?.trim() || "Itaituba");
      setUf(cfg.cidade_uf?.split("-")[1]?.trim() || "PA");
      setProcuradorId("");
      setProcuradorNome("");
      setProcuradorCpf("");
      setProcuradorTelefone("");
      setProcuradorEndereco("");
      setProcuradorSearch("");
      setTextoDeclaracao(defaultTexto);
      setCondutores([]);
      setGerenteNome("Zedequias Carlos de Melo");
      setGerenteCargo("Gerente DETRAN");
      setGerenteUnidade(cfg.cidade_uf?.toUpperCase() || "ITAITUBA-PA");
      setGerentePortaria("Portaria 1.083/2025 - CCG");
    }
  }, [isOpen, declaracaoToEdit]);

  // Filtragem rápida de procuradores/responsáveis
  const filteredProcuradores = useMemo(() => {
    if (!procuradorSearch.trim()) {
      return responsaveis.filter((r) => r.ativo).slice(0, 8);
    }
    const q = procuradorSearch.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");
    return responsaveis
      .filter((r) => {
        if (!r.ativo) return false;
        const nomeMatch = r.nome.toLowerCase().includes(q);
        const cpfMatch = qDigits && (r.cpf || "").replace(/\D/g, "").includes(qDigits);
        const foneMatch = qDigits && (r.telefone || "").replace(/\D/g, "").includes(qDigits);
        return nomeMatch || cpfMatch || foneMatch;
      })
      .slice(0, 10);
  }, [responsaveis, procuradorSearch]);

  const handleSelectProcurador = (resp: Responsavel) => {
    setProcuradorId(resp.id);
    setProcuradorNome(resp.nome);
    setProcuradorCpf(resp.cpf || "");
    setProcuradorTelefone(resp.telefone || "");
    if (resp.observacao && resp.observacao.includes("Endereço:")) {
      setProcuradorEndereco(resp.observacao.replace(/.*Endereço:\s*/i, "").trim());
    } else if (resp.observacao && resp.observacao.length > 5) {
      setProcuradorEndereco(resp.observacao);
    }
    setIsProcuradorDropdownOpen(false);
    setProcuradorSearch("");
  };

  // Salvar novo procurador rapidamente
  const handleSaveNovoProcurador = async (e: React.FormEvent) => {
    e.preventDefault();
    setNovoProcError("");
    if (!novoProcNome.trim()) {
      setNovoProcError("Nome do procurador é obrigatório.");
      return;
    }

    const formattedCpf = formatCPF(novoProcCpf);
    const formattedTel = formatPhone(novoProcTelefone);

    const cleanCpf = formattedCpf.replace(/\D/g, "");
    if (!cleanCpf || (cleanCpf.length !== 11 && cleanCpf.length !== 14)) {
      setNovoProcError("CPF ou CNPJ válido é obrigatório por padrão.");
      return;
    }

    const cleanTel = formattedTel.replace(/\D/g, "");
    if (!cleanTel || cleanTel.length < 10 || cleanTel.length > 11) {
      setNovoProcError("Telefone de contato com DDD é obrigatório por padrão.");
      return;
    }

    // Validação preventiva de duplicatas
    const dupCpf = responsaveis.find((r) => (r.cpf || "").replace(/\D/g, "") === cleanCpf);
    if (dupCpf) {
      setNovoProcError(`Este CPF já está cadastrado para o responsável "${dupCpf.nome}".`);
      return;
    }
    const dupTel = responsaveis.find((r) => (r.telefone || "").replace(/\D/g, "") === cleanTel);
    if (dupTel) {
      setNovoProcError(`Este telefone já está cadastrado para o responsável "${dupTel.nome}".`);
      return;
    }

    setIsSavingNovoProc(true);
    try {
      const created = await createResponsavel(
        {
          nome: novoProcNome.trim().toUpperCase(),
          cpf: formattedCpf,
          telefone: formattedTel,
          observacao: novoProcEndereco ? `Endereço: ${novoProcEndereco.trim()}` : "",
          ativo: true
        },
        user?.id || "admin",
        user?.nome || "Operador"
      );

      // Adicionar à lista local e selecioná-lo automaticamente
      setResponsaveis((prev) => [created, ...prev]);
      setProcuradorId(created.id);
      setProcuradorNome(created.nome);
      setProcuradorCpf(created.cpf || "");
      setProcuradorTelefone(created.telefone || "");
      setProcuradorEndereco(novoProcEndereco.trim());

      // Fechar modal de criação rápida
      setShowNovoProcuradorModal(false);
      setNovoProcNome("");
      setNovoProcCpf("");
      setNovoProcTelefone("");
      setNovoProcEndereco("");
    } catch (err: any) {
      setNovoProcError(err.message || "Erro ao cadastrar novo procurador.");
    } finally {
      setIsSavingNovoProc(false);
    }
  };

  // Filtragem de CNHs disponíveis para adicionar
  const filteredCNHs = useMemo(() => {
    if (!cnhSearch.trim()) return [];
    const q = cnhSearch.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");

    return allCNHs
      .filter((cnh) => {
        // Ignora CNHs já adicionadas na declaração atual
        if (condutores.some((c) => c.cnh_id === cnh.id)) return false;

        const nomeMatch = (cnh.nome || "").toLowerCase().includes(q);
        const cpfMatch = qDigits && (cnh.cpf || "").replace(/\D/g, "").includes(qDigits);
        const paMatch = (cnh.pa || "").toLowerCase().includes(q);
        return nomeMatch || cpfMatch || paMatch;
      })
      .slice(0, 8);
  }, [allCNHs, cnhSearch, condutores]);

  // Adicionar CNH encontrada à lista de condutores
  const handleAddCNH = (cnh: GeralCNH) => {
    const newItem: DeclaracaoItemCondutor = {
      item: condutores.length + 1,
      cnh_id: cnh.id,
      nome: (cnh.nome || "").toUpperCase(),
      cpf: cnh.cpf || "",
      pa: cnh.pa || "",
      situacao: cnh.situacao,
      gaveta: cnh.gaveta || "",
      reparticao: cnh.reparticao || "",
      data_movimento: cnh.data_movimento || new Date().toISOString().slice(0, 10)
    };
    setCondutores((prev) => [...prev, newItem]);
    setCnhSearch("");
  };

  // Adicionar condutor manual
  const handleAddManualCondutor = () => {
    if (!manualNome.trim()) return;
    const newItem: DeclaracaoItemCondutor = {
      item: condutores.length + 1,
      nome: manualNome.trim().toUpperCase(),
      cpf: manualCpf.trim(),
      pa: manualPa.trim(),
      gaveta: manualGaveta.trim(),
      reparticao: manualReparticao.trim(),
      data_movimento: manualDataMovimento.trim() || new Date().toISOString().slice(0, 10)
    };
    setCondutores((prev) => [...prev, newItem]);
    setManualNome("");
    setManualCpf("");
    setManualPa("");
    setManualGaveta("");
    setManualReparticao("");
    setManualDataMovimento(new Date().toISOString().slice(0, 10));
    setShowManualCondutor(false);
  };

  // Remover condutor da lista
  const handleRemoveCondutor = (index: number) => {
    setCondutores((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // Re-indexar itens
      return updated.map((c, i) => ({ ...c, item: i + 1 }));
    });
  };

  // Submissão do formulário
  const handleSubmit = async (downloadPdfImmediately: boolean = false) => {
    setErrorMsg("");

    if (!numero.trim()) {
      setErrorMsg("O número da declaração é obrigatório (ex: 0109/2026).");
      return;
    }
    if (!procuradorNome.trim()) {
      setErrorMsg("Informe o nome do Procurador / Responsável.");
      return;
    }
    if (!procuradorCpf.trim()) {
      setErrorMsg("Informe o CPF do Procurador.");
      return;
    }
    if (condutores.length === 0) {
      setErrorMsg("Adicione pelo menos 1 condutor à declaração.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        numero: numero.trim(),
        ano: parseInt(numero.split("/")[1], 10) || ano,
        data_emissao: dataEmissao,
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        procurador_id: procuradorId || undefined,
        procurador_nome: procuradorNome.trim().toUpperCase(),
        procurador_cpf: procuradorCpf.trim(),
        procurador_telefone: procuradorTelefone.trim() || undefined,
        procurador_endereco: procuradorEndereco.trim() || undefined,
        texto_declaracao: textoDeclaracao.trim(),
        condutores: condutores,
        gerente_nome: gerenteNome.trim(),
        gerente_cargo: gerenteCargo.trim(),
        gerente_unidade: gerenteUnidade.trim(),
        gerente_portaria: gerentePortaria.trim(),
        usuario_id: user?.id || "admin",
        usuario_nome: user?.nome || "Operador"
      };

      let saved: Declaracao;
      if (declaracaoToEdit) {
        saved = await updateDeclaracao(
          declaracaoToEdit.id,
          payload,
          user?.id || "admin",
          user?.nome || "Operador"
        );
      } else {
        saved = await createDeclaracao(
          payload,
          user?.id || "admin",
          user?.nome || "Operador"
        );
      }

      onSuccess(saved, downloadPdfImmediately);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao salvar declaração.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {declaracaoToEdit ? "Editar Declaração de Retirada" : "Nova Declaração de Retirada de CNH"}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-mono font-semibold">
                  Modelo Oficial DETRAN
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gere o documento oficial de entrega de CNH para procurador ou responsável credenciado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. DADOS DE IDENTIFICAÇÃO DO DOCUMENTO */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Número do Documento <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Ex: 0109/2026"
                className="w-full px-3 py-2 text-sm font-mono font-bold text-blue-700 dark:text-blue-300 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Data da Emissão <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cidade da Agência
              </label>
              <input
                type="text"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Itaituba"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                UF
              </label>
              <input
                type="text"
                maxLength={2}
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
                placeholder="PA"
                className="w-full px-3 py-2 text-sm font-bold uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 2. DADOS DO PROCURADOR (RESPONSÁVEIS) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Dados do Procurador (Responsável)
              </h3>
              <button
                type="button"
                onClick={() => setShowNovoProcuradorModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Novo Procurador</span>
              </button>
            </div>

            {/* Busca Rápida de Procurador Cadastrado */}
            <div className="relative" ref={procuradorDropdownRef}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar procurador cadastrado por Nome, CPF ou Telefone..."
                  value={procuradorSearch}
                  onFocus={() => setIsProcuradorDropdownOpen(true)}
                  onChange={(e) => {
                    setProcuradorSearch(e.target.value);
                    setIsProcuradorDropdownOpen(true);
                  }}
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Dropdown de sugestões */}
              {isProcuradorDropdownOpen && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProcuradores.length > 0 ? (
                    filteredProcuradores.map((resp) => (
                      <button
                        key={resp.id}
                        type="button"
                        onClick={() => handleSelectProcurador(resp)}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            {resp.nome}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3 mt-0.5">
                            {resp.cpf && <span>CPF: {formatCPFDisplay(resp.cpf)}</span>}
                            {resp.telefone && <span>Fone: {resp.telefone}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                          Selecionar
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      Nenhum procurador encontrado com "{procuradorSearch}".
                      <button
                        type="button"
                        onClick={() => {
                          setNovoProcNome(procuradorSearch);
                          setShowNovoProcuradorModal(true);
                          setIsProcuradorDropdownOpen(false);
                        }}
                        className="block mx-auto mt-1.5 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                      >
                        Clique aqui para cadastrar "{procuradorSearch}"
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Campos do Procurador */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo do Procurador <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={procuradorNome}
                  onChange={(e) => setProcuradorNome(e.target.value.toUpperCase())}
                  placeholder="Ex: REGINALDO DE SOUZA SANTOS"
                  className="w-full px-3 py-2 text-sm uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  CPF <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={procuradorCpf}
                  onChange={(e) => setProcuradorCpf(e.target.value)}
                  placeholder="Ex: 36956201291"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={procuradorTelefone}
                  onChange={(e) => setProcuradorTelefone(e.target.value)}
                  placeholder="Ex: 93992912928"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={procuradorEndereco}
                  onChange={(e) => setProcuradorEndereco(e.target.value)}
                  placeholder="Ex: Campo Verde, MT, 78840-000, Brasil"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 3. TEXTO LEGAL DA DECLARAÇÃO */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Termo da Declaração
            </label>
            <textarea
              rows={2}
              value={textoDeclaracao}
              onChange={(e) => setTextoDeclaracao(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 4. CONDUTORES / CNHS (PROTOCOLO GERAL) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Condutores e CNHs ({condutores.length}) <span className="text-rose-500">*</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Localize as CNHs no Protocolo Geral ou adicione condutores manualmente
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualCondutor(!showManualCondutor)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Condutor Manual</span>
              </button>
            </div>

            {/* Formulário de Condutor Manual (opcional) */}
            {showManualCondutor && (
              <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Adicionar Condutor sem CNH no Sistema:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Nome do condutor"
                      value={manualNome}
                      onChange={(e) => setManualNome(e.target.value.toUpperCase())}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="CPF do condutor"
                      value={manualCpf}
                      onChange={(e) => setManualCpf(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="PA (opcional)"
                      value={manualPa}
                      onChange={(e) => setManualPa(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 items-center">
                  <div>
                    <input
                      type="text"
                      placeholder="Gaveta (opcional)"
                      value={manualGaveta}
                      onChange={(e) => setManualGaveta(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Repartição (opcional)"
                      value={manualReparticao}
                      onChange={(e) => setManualReparticao(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      title="Data de Movimentação da CNH"
                      value={manualDataMovimento}
                      onChange={(e) => setManualDataMovimento(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddManualCondutor}
                      className="w-full sm:w-auto px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0 transition-colors"
                    >
                      Inserir Condutor
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Campo de Busca no Protocolo Geral */}
            <div className="relative">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar CNH no Protocolo Geral por Nome, CPF ou PA..."
                  value={cnhSearch}
                  onChange={(e) => setCnhSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Resultados da Busca de CNHs */}
              {cnhSearch.trim().length > 0 && (
                <div className="mt-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {filteredCNHs.length > 0 ? (
                    filteredCNHs.map((cnh) => (
                      <div
                        key={cnh.id}
                        className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                            {cnh.nome}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3">
                            <span>CPF: {formatCPFDisplay(cnh.cpf)}</span>
                            {cnh.pa && <span>PA: {cnh.pa}</span>}
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                              cnh.situacao === "Recebida"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }`}>
                              {cnh.situacao}
                            </span>
                            {cnh.gaveta && (
                              <span className="text-[10px] text-slate-400">
                                {cnh.gaveta} - {cnh.reparticao}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddCNH(cnh)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-xs text-center text-slate-500 dark:text-slate-400">
                      Nenhuma CNH encontrada com "{cnhSearch}".
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tabela de Condutores Adicionados (Exatamente o modelo da foto: ITEM | NOME | CPF) */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-center font-bold text-xs text-slate-700 dark:text-slate-300 tracking-wider">
                CONDUTOR(S)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-2.5 w-12 text-center">ITEM</th>
                      <th className="py-2.5 px-3">NOME</th>
                      <th className="py-2.5 px-3 text-center">CPF</th>
                      <th className="py-2.5 px-2.5 text-center">GAVETA</th>
                      <th className="py-2.5 px-3 text-center">REPARTIÇÃO</th>
                      <th className="py-2.5 px-3 text-center">DATA MOV. DA CNH</th>
                      <th className="py-2.5 px-2 w-12 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950">
                    {condutores.length > 0 ? (
                      condutores.map((cond, index) => (
                        <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="py-2.5 px-2.5 text-center font-bold text-slate-700 dark:text-slate-300">
                            {cond.item || index + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 uppercase">
                            {cond.nome}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                            {formatCPFDisplay(cond.cpf) || "-"}
                          </td>
                          <td className="py-2.5 px-2.5 text-center text-slate-600 dark:text-slate-400">
                            {cond.gaveta || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600 dark:text-slate-400">
                            {cond.reparticao || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                            {formatDataCurta(cond.data_movimento)}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveCondutor(index)}
                              className="p-1 text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors"
                              title="Remover condutor da lista"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400 dark:text-slate-500">
                          Nenhum condutor adicionado ainda. Busque uma CNH acima ou clique em "Condutor Manual".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 5. CONFIGURAÇÃO DE ASSINATURA DA AGÊNCIA (GERENTE / PORTARIA) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGerenteConfig(!showGerenteConfig)}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 text-left text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Dados de Assinatura do Gerente / Servidor DETRAN</span>
              </div>
              {showGerenteConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showGerenteConfig && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Nome do Gerente / Responsável
                  </label>
                  <input
                    type="text"
                    value={gerenteNome}
                    onChange={(e) => setGerenteNome(e.target.value)}
                    placeholder="Zedequias Carlos de Melo"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Cargo / Função
                  </label>
                  <input
                    type="text"
                    value={gerenteCargo}
                    onChange={(e) => setGerenteCargo(e.target.value)}
                    placeholder="Gerente DETRAN"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Unidade / Regional
                  </label>
                  <input
                    type="text"
                    value={gerenteUnidade}
                    onChange={(e) => setGerenteUnidade(e.target.value)}
                    placeholder="ITAITUBA-PA"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Portaria / Ato de Nomeação
                  </label>
                  <input
                    type="text"
                    value={gerentePortaria}
                    onChange={(e) => setGerentePortaria(e.target.value)}
                    placeholder="Portaria 1.083/2025 - CCG"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(false)}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl transition-colors inline-flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Salvar Declaração</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(true)}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md hover:shadow-lg transition-all inline-flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              <span>Salvar e Baixar PDF</span>
            </button>
          </div>
        </div>

      </div>

      {/* SUB-MODAL: CADASTRO RÁPIDO DE NOVO PROCURADOR */}
      {showNovoProcuradorModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Novo Procurador / Responsável
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNovoProcuradorModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {novoProcError && (
              <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs border border-rose-200">
                {novoProcError}
              </div>
            )}

            <form onSubmit={handleSaveNovoProcurador} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={novoProcNome}
                  onChange={(e) => setNovoProcNome(e.target.value.toUpperCase())}
                  placeholder="Ex: REGINALDO DE SOUZA SANTOS"
                  className="w-full px-3 py-2 uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  CPF ou CNPJ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={novoProcCpf}
                  onChange={(e) => setNovoProcCpf(formatCPF(e.target.value))}
                  placeholder="Ex: 000.000.000-00"
                  maxLength={18}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Telefone / WhatsApp <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={novoProcTelefone}
                  onChange={(e) => setNovoProcTelefone(formatPhone(e.target.value))}
                  placeholder="Ex: (93) 99999-9999"
                  maxLength={15}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Endereço
                </label>
                <input
                  type="text"
                  value={novoProcEndereco}
                  onChange={(e) => setNovoProcEndereco(e.target.value)}
                  placeholder="Ex: Campo Verde, MT, 78840-000, Brasil"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNovoProcuradorModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingNovoProc}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5"
                >
                  {isSavingNovoProc && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Cadastrar e Selecionar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
