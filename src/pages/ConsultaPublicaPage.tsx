import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Building2, 
  FileText, 
  User, 
  MapPin, 
  Smartphone, 
  QrCode, 
  Share2, 
  Copy, 
  ArrowLeft, 
  Info,
  Sparkles,
  RefreshCw,
  Download
} from "lucide-react";
import { consultarCnhPublicaPorCpf, ResultadoConsultaPublica, getPublicSearchCount } from "../services/db";
import { formatCPF, formatDateTime } from "../lib/utils";

interface ConsultaPublicaPageProps {
  onBackToLogin?: () => void;
  initialCpf?: string;
}

export const ConsultaPublicaPage: React.FC<ConsultaPublicaPageProps> = ({
  onBackToLogin,
  initialCpf = ""
}) => {
  const [cpfInput, setCpfInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoConsultaPublica | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrCodeModal, setShowQrCodeModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [searchCount, setSearchCount] = useState(() => getPublicSearchCount());

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
        setIsStandalone(true);
      }

      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setDeferredPrompt(null);
        }
      } catch (err) {
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  // Formatar CPF enquanto digita
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length <= 11) {
      let formatted = raw;
      if (raw.length > 9) {
        formatted = raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      } else if (raw.length > 6) {
        formatted = raw.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
      } else if (raw.length > 3) {
        formatted = raw.replace(/(\d{3})(\d{1,3})/, "$1.$2");
      }
      setCpfInput(formatted);
      setError(null);
    }
  };

  const handleBuscar = async (cpfParaBuscar?: string) => {
    const targetCpf = cpfParaBuscar || cpfInput;
    const cleanCpf = targetCpf.replace(/\D/g, "");

    if (!cleanCpf || cleanCpf.length !== 11) {
      setError("Por favor, digite um CPF válido contendo 11 números.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Atualizar URL sem recarregar para salvar o CPF consultado
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("consulta", "true");
        url.searchParams.set("cpf", cleanCpf);
        window.history.replaceState({}, "", url.toString());
      }

      const res = await consultarCnhPublicaPorCpf(cleanCpf);
      setResultado(res);
      setSearchCount(getPublicSearchCount());
    } catch (err: any) {
      setError(err.message || "Erro ao consultar banco de dados.");
      setResultado(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Ler CPF da URL se fornecido no carregamento da página
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlCpf = params.get("cpf") || initialCpf;
      if (urlCpf) {
        const clean = urlCpf.replace(/\D/g, "");
        if (clean.length === 11) {
          let formatted = clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
          setCpfInput(formatted);
          handleBuscar(clean);
        }
      }
    }
  }, [initialCpf]);

  const handleCopyShareLink = async () => {
    if (typeof window === "undefined") return;
    const cleanCpf = cpfInput.replace(/\D/g, "");
    const shareUrl = `${window.location.origin}${window.location.pathname}?consulta=true${cleanCpf ? `&cpf=${cleanCpf}` : ""}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      alert("Link direto: " + shareUrl);
    }
  };

  const currentPublicUrl = typeof window !== "undefined" 
    ? `${window.location.origin}${window.location.pathname}?consulta=true`
    : "";

  return (
    <div className="min-h-screen w-full bg-slate-900 bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-blue-500 selection:text-white pb-8">
      
      {/* Cabeçalho Mobile DETRAN */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-700/60 sticky top-0 z-30 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-extrabold tracking-tight text-white">DETRAN / PA</h1>
              <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-400/30">
                Público
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Consulta de CNH para Cidadão</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleInstallApp}
            title="Instalar App no celular ou computador"
            className="px-2.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl border border-emerald-400/50 shadow-md shadow-emerald-900/30 transition-all cursor-pointer text-xs flex items-center gap-1.5 font-bold"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Instalar App</span>
          </button>

          <button
            onClick={() => setShowQrCodeModal(true)}
            title="Ver QR Code para Compartilhar"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
          </button>
          
          {onBackToLogin && (
            <button
              onClick={onBackToLogin}
              title="Acesso de Servidores / Login"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer text-xs flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline font-semibold">Login Servidor</span>
            </button>
          )}
        </div>
      </header>

      {/* Conteúdo Principal Adaptado para Celular */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 flex flex-col justify-start space-y-5">
        
        {/* Banner Informativo */}
        <div className="bg-gradient-to-r from-blue-900/60 to-indigo-900/60 border border-blue-500/30 rounded-2xl p-4 shadow-lg backdrop-blur-sm space-y-2">
          <div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase tracking-wider">
            <Smartphone className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
            <span>Atendimento Rápido sem Login</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            Informe o seu <strong className="text-white">CPF</strong> abaixo para verificar em tempo real se a sua Carteira Nacional de Habilitação (CNH) já chegou ao balcão de atendimento e está pronta para ser retirada.
          </p>
        </div>

        {/* Botão / Banner de Instalação do App no Dispositivo */}
        {!isStandalone && (
          <button
            type="button"
            onClick={handleInstallApp}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-950/90 via-slate-800 to-teal-950/90 border-2 border-emerald-500/60 hover:border-emerald-400 rounded-2xl shadow-lg text-emerald-100 flex items-center justify-between gap-3 group transition-all cursor-pointer hover:shadow-emerald-950/50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-110 transition-transform">
                <Download className="w-5 h-5 animate-bounce" />
              </div>
              <div className="text-left">
                <span className="text-xs font-black text-white block">
                  📲 Instalar App no Dispositivo
                </span>
                <span className="text-[11px] text-emerald-300 font-medium">Crie um atalho na tela inicial do seu celular</span>
              </div>
            </div>
            <span className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md shrink-0">
              Instalar
            </span>
          </button>
        )}

        {/* Card do Formulário de Consulta */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-5 shadow-xl space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleBuscar();
            }}
            className="space-y-3"
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              Digite seu CPF *
            </label>

            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <input
                type="text"
                inputMode="numeric"
                value={cpfInput}
                onChange={handleCpfChange}
                placeholder="000.000.000-00"
                className="w-full pl-11 pr-4 py-3 bg-slate-900/90 border-2 border-slate-600 focus:border-blue-500 rounded-2xl text-base font-mono font-bold text-white placeholder-slate-500 focus:outline-hidden transition-all tracking-wider shadow-inner"
              />
              {cpfInput && (
                <button
                  type="button"
                  onClick={() => {
                    setCpfInput("");
                    setResultado(null);
                    setError(null);
                  }}
                  className="absolute right-3 top-3 text-xs text-slate-400 hover:text-white bg-slate-800 px-2 py-1 rounded-lg border border-slate-700"
                >
                  Limpar
                </button>
              )}
            </div>

            {error && (
              <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-xl text-xs text-rose-200 font-semibold flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !cpfInput.trim()}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Consultando Banco de Dados...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Consultar CNH</span>
                </>
              )}
            </button>
          </form>

          {/* Card Contador de Consultas Feitas pelo App Público */}
          <div className="pt-3 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-slate-300">Consultas no App Público:</span>
            </div>
            <span className="px-2.5 py-1 bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-extrabold font-mono rounded-lg text-xs shadow-inner">
              {searchCount} {searchCount === 1 ? "consulta" : "consultas"}
            </span>
          </div>
        </div>

        {/* Exibição do Resultado da Consulta */}
        {resultado && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* STATUS DISPONÍVEL PARA RETIRADA (RECEBIDA) */}
            {resultado.statusDisponibilidade === "DISPONIVEL" && resultado.cnhEncontrada && (
              <div className="bg-emerald-950/80 border-2 border-emerald-500/80 rounded-3xl p-5 shadow-2xl space-y-4 text-emerald-100">
                
                <div className="flex items-center gap-3 border-b border-emerald-800/80 pb-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="inline-block bg-emerald-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wider mb-1">
                      ✅ CNH Pronta
                    </span>
                    <h2 className="text-lg font-black text-white leading-tight">
                      Disponível para Retirada!
                    </h2>
                  </div>
                </div>

                {/* Destaque para o Número de Ordem */}
                <div className="p-3.5 bg-emerald-900/60 rounded-2xl border border-emerald-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] uppercase font-bold text-emerald-300 block">Número da Ordem</span>
                    <span className="text-2xl font-black font-mono text-white tracking-wider">
                      #{resultado.cnhEncontrada.ordem}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] uppercase font-bold text-emerald-300 block">Status Atual</span>
                    <span className="inline-flex items-center gap-1 font-bold text-xs text-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Recebida no Balcão
                    </span>
                  </div>
                </div>

                {/* Informações Detalhadas */}
                <div className="space-y-2.5 bg-slate-900/60 p-3.5 rounded-2xl border border-emerald-900/80 text-xs">
                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 font-medium">Titular:</span>
                      <p className="font-extrabold text-white text-sm">{resultado.cnhEncontrada.nome}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 font-medium">Localização de Armazenamento:</span>
                      <p className="font-bold text-emerald-300 text-sm">
                        {resultado.cnhEncontrada.gaveta || "Balcão principal"} {resultado.cnhEncontrada.reparticao ? `(${resultado.cnhEncontrada.reparticao})` : ""}
                      </p>
                    </div>
                  </div>

                  {resultado.cnhEncontrada.data_movimento && (
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-slate-400 font-medium">Data de Chegada no Setor:</span>
                        <p className="font-mono font-bold text-white">
                          {formatDateTime(resultado.cnhEncontrada.data_movimento)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instruções para Retirada */}
                <div className="p-3.5 bg-emerald-900/40 rounded-2xl border border-emerald-800/80 space-y-1.5 text-xs text-emerald-200">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Instruções para Retirada:</span>
                  </p>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] leading-relaxed text-emerald-100">
                    <li>Dirija-se ao setor de Atendimento e Protocolo do DETRAN.</li>
                    <li>Informe a <strong>Ordem #{resultado.cnhEncontrada.ordem}</strong> ao atendente.</li>
                    <li>Apresente documento oficial de identificação original com foto.</li>
                  </ul>
                </div>

              </div>
            )}

            {/* STATUS ENTREGUE */}
            {resultado.statusDisponibilidade === "ENTREGUE" && resultado.cnhEncontrada && (
              <div className="bg-blue-950/80 border-2 border-blue-500/80 rounded-3xl p-5 shadow-2xl space-y-3 text-blue-100">
                <div className="flex items-center gap-3 border-b border-blue-800/80 pb-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block bg-blue-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wider mb-0.5">
                      CNH Entregue
                    </span>
                    <h2 className="text-base font-extrabold text-white">
                      Documento Já Retirado
                    </h2>
                  </div>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-2xl border border-blue-900 text-xs space-y-2">
                  <p><strong className="text-slate-400">Titular:</strong> <span className="text-white font-bold">{resultado.cnhEncontrada.nome}</span></p>
                  <p><strong className="text-slate-400">Ordem:</strong> <span className="font-mono font-bold text-blue-300">#{resultado.cnhEncontrada.ordem}</span></p>
                  {resultado.cnhEncontrada.responsavel_nome && (
                    <p><strong className="text-slate-400">Retirado por:</strong> <span className="text-amber-300 font-bold">{resultado.cnhEncontrada.responsavel_nome}</span></p>
                  )}
                  {resultado.cnhEncontrada.data_movimento && (
                    <p><strong className="text-slate-400">Data da Entrega:</strong> <span className="font-mono text-white">{formatDateTime(resultado.cnhEncontrada.data_movimento)}</span></p>
                  )}
                </div>
              </div>
            )}

            {/* STATUS EM PROCESSAMENTO / REMETIDA */}
            {resultado.statusDisponibilidade === "EM_PROCESSAMENTO" && resultado.cnhEncontrada && (
              <div className="bg-amber-950/80 border-2 border-amber-500/80 rounded-3xl p-5 shadow-2xl space-y-3 text-amber-100">
                <div className="flex items-center gap-3 border-b border-amber-800/80 pb-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block bg-amber-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wider mb-0.5">
                      Em Trânsito / Processamento
                    </span>
                    <h2 className="text-base font-extrabold text-white">
                      Ainda não disponível para retirada
                    </h2>
                  </div>
                </div>

                <p className="text-xs text-amber-200 leading-relaxed">
                  A sua CNH foi remetida pelo setor emissor (Ordem #{resultado.cnhEncontrada.ordem}), mas ainda não deu entrada física no balcão de atendimento para retirada.
                </p>
                
                <div className="p-3 bg-slate-900/60 rounded-2xl border border-amber-900 text-xs text-slate-300">
                  <p><strong className="text-slate-400">Titular:</strong> {resultado.cnhEncontrada.nome}</p>
                  <p><strong className="text-slate-400">Situação Atual:</strong> <span className="text-amber-300 font-bold">{resultado.cnhEncontrada.situacao}</span></p>
                </div>
              </div>
            )}

            {/* STATUS NÃO ENCONTRADA */}
            {resultado.statusDisponibilidade === "NAO_ENCONTRADA" && (
              <div className="bg-slate-800/90 border-2 border-slate-700 rounded-3xl p-5 shadow-xl text-center space-y-3 text-slate-300">
                <div className="w-12 h-12 rounded-2xl bg-slate-700 mx-auto flex items-center justify-center text-slate-400">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-base font-extrabold text-white">Nenhum registro localizado</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Não encontramos nenhuma CNH registrada para o CPF <strong className="text-slate-200 font-mono">{formatCPF(resultado.cpfConsultado)}</strong> no sistema de protocolo.
                </p>
              </div>
            )}

            {/* Botão de Compartilhar Link */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-2xl border border-slate-700 text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {copiedLink ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300 font-bold">Link Copiado!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-blue-400" />
                    <span>Compartilhar este resultado</span>
                  </>
                )}
              </button>
            </div>

          </div>
        )}

      </main>

      {/* Rodapé Mobile */}
      <footer className="text-center text-[10px] text-slate-500 space-y-1 pt-4">
        <p>© 2026 DETRAN/PA - Sistema de Protocolo e Atendimento de CNHs</p>
        <p className="text-slate-600">Sessão pública mobile e segura</p>
      </footer>

      {/* Modal QR Code */}
      {showQrCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowQrCodeModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg"
            >
              ✕
            </button>

            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <QrCode className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">QR Code de Consulta</h3>
              <p className="text-xs text-slate-400 mt-1">
                Escaneie com a câmera do seu celular para abrir a consulta direta no smartphone:
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner mx-auto border-4 border-slate-800">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentPublicUrl)}`}
                alt="QR Code Consulta CNH"
                className="w-48 h-48 mx-auto rounded-lg object-contain"
              />
            </div>

            <p className="text-[10px] text-slate-400 font-mono break-all bg-slate-950 p-2 rounded-xl border border-slate-800">
              {currentPublicUrl}
            </p>

            <button
              onClick={() => setShowQrCodeModal(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Instruções de Instalação do App */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-800/80 rounded-3xl max-w-md w-full p-6 text-left space-y-4 shadow-2xl relative text-slate-200">
            <button
              onClick={() => setShowInstallModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg shrink-0">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Instalar App no Dispositivo</h3>
                <p className="text-xs text-emerald-400 font-semibold">Adicione o Portal do Cidadão à sua Tela Inicial</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Você pode instalar este aplicativo no seu celular ou computador para consultar a CNH instantaneamente com 1 toque, mesmo sem internet:
            </p>

            <div className="space-y-3 pt-1">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-emerald-300">
                  <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>No Android (Chrome):</span>
                </div>
                <p className="text-[11px] text-slate-400 pl-6 leading-normal">
                  Toque no menu do navegador <strong className="text-slate-200">⋮ (três pontos)</strong> no canto superior e selecione <strong className="text-emerald-300 font-bold">"Instalar aplicativo"</strong> ou <strong className="text-emerald-300 font-bold">"Adicionar à Tela inicial"</strong>.
                </p>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-blue-300">
                  <Share2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>No iPhone / iPad (Safari):</span>
                </div>
                <p className="text-[11px] text-slate-400 pl-6 leading-normal">
                  Toque no botão <strong className="text-slate-200">Compartilhar (quadrado com seta para cima)</strong> na barra inferior e escolha <strong className="text-blue-300 font-bold">"Adicionar à Tela de Início"</strong>.
                </p>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-purple-300">
                  <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>No Computador (Chrome / Edge):</span>
                </div>
                <p className="text-[11px] text-slate-400 pl-6 leading-normal">
                  Clique no ícone de <strong className="text-purple-300 font-bold">Instalação ⊕</strong> na barra de endereço do navegador.
                </p>
              </div>
            </div>

            {deferredPrompt && (
              <button
                type="button"
                onClick={() => {
                  setShowInstallModal(false);
                  handleInstallApp();
                }}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                <Download className="w-4 h-4" />
                <span>Instalar Agora Direto</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Entendi / Fechar
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
