import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, Search, CheckCircle2, Clock, AlertCircle, Building2, User, MapPin,
  Smartphone, QrCode, Share2, ArrowLeft, Info, RefreshCw, Download
} from "lucide-react";
import { consultarCnhPublicaPorCpf } from "../services/cidadaoConsultaService";
import type { ResultadoConsultaPublica } from "../services/db";
import { formatCPF, formatDateTime } from "../lib/utils";
import { getPublicShareUrl, saveLocalSupabaseConfig } from "../services/supabase";

interface ConsultaPublicaPageProps { onBackToLogin?: () => void; initialCpf?: string; }

export const ConsultaPublicaPage: React.FC<ConsultaPublicaPageProps> = ({ onBackToLogin, initialCpf = "" }) => {
  const [cpfInput, setCpfInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoConsultaPublica | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrCodeModal, setShowQrCodeModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [searchCount, setSearchCount] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSearchCount(Number(localStorage.getItem("detran_public_search_count") || "0"));
      const handleBeforeInstallPrompt = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    }
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) { setShowInstallModal(true); return; }
    deferredPrompt.prompt();
    try { const { outcome } = await deferredPrompt.userChoice; if (outcome === "accepted") setDeferredPrompt(null); }
    catch { setShowInstallModal(true); }
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    let formatted = raw;
    if (raw.length > 9) formatted = raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    else if (raw.length > 6) formatted = raw.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    else if (raw.length > 3) formatted = raw.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    setCpfInput(formatted); setError(null);
  };

  const handleBuscar = async (cpfParaBuscar?: string) => {
    const cleanCpf = (cpfParaBuscar || cpfInput).replace(/\D/g, "");
    if (!cleanCpf || cleanCpf.length < 9) { setError("Por favor, digite um CPF válido contendo até 11 números."); return; }
    setLoading(true); setError(null);
    try {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("consulta", "true"); url.searchParams.set("cpf", cleanCpf);
        window.history.replaceState({}, "", url.toString());
      }
      const res = await consultarCnhPublicaPorCpf(cleanCpf);
      setResultado(res);
      const count = Number(localStorage.getItem("detran_public_search_count") || "0") + 1;
      localStorage.setItem("detran_public_search_count", String(count)); setSearchCount(count);
    } catch (err: any) { setError(err.message || "Erro ao consultar banco de dados."); setResultado(null); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sbUrl = params.get("sb_url"); const sbKey = params.get("sb_key");
    if (sbUrl && sbKey) saveLocalSupabaseConfig(sbUrl, sbKey);
    const urlCpf = params.get("cpf") || initialCpf;
    if (urlCpf) {
      const clean = urlCpf.replace(/\D/g, "").slice(0, 11);
      if (clean.length >= 9) {
        setCpfInput(clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"));
        void handleBuscar(clean);
      }
    }
  }, [initialCpf]);

  const handleCopyShareLink = async () => {
    const cleanCpf = cpfInput.replace(/\D/g, ""); const shareUrl = getPublicShareUrl(cleanCpf);
    try { await navigator.clipboard.writeText(shareUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500); }
    catch { alert("Link direto: " + shareUrl); }
  };
  const currentPublicUrl = getPublicShareUrl(cpfInput);

  return (
    <div className="min-h-screen w-full bg-slate-900 bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-950 text-slate-100 flex flex-col justify-between font-sans pb-8">
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-700/60 sticky top-0 z-30 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center"><ShieldCheck className="w-6 h-6" /></div><div><div className="flex items-center gap-1.5"><h1 className="text-sm font-extrabold">DETRAN / PA</h1><span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded">Público</span></div><p className="text-[11px] text-slate-400">Consulta de CNH para Cidadão</p></div></div>
        <div className="flex items-center gap-1.5"><button onClick={handleInstallApp} className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs flex items-center gap-1.5 font-bold"><Download className="w-4 h-4" /><span className="hidden sm:inline">Instalar App</span></button><button onClick={() => setShowQrCodeModal(true)} className="p-2 bg-slate-800 text-slate-300 rounded-xl"><QrCode className="w-4 h-4" /></button>{onBackToLogin && <button onClick={onBackToLogin} className="px-2.5 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs flex items-center gap-1.5 font-semibold"><ArrowLeft className="w-4 h-4" />Login Servidor</button>}</div>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto p-4 flex flex-col justify-start space-y-5">
        <div className="bg-gradient-to-r from-blue-900/60 to-indigo-900/60 border border-blue-500/30 rounded-2xl p-4 space-y-2"><div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase"><Smartphone className="w-4 h-4" />Atendimento Rápido sem Login</div><p className="text-xs text-slate-200">Informe seu <strong className="text-white">CPF</strong> para verificar em tempo real o status da CNH.</p></div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-5 shadow-xl space-y-4"><form onSubmit={(e) => { e.preventDefault(); void handleBuscar(); }} className="space-y-3"><label className="block text-xs font-bold uppercase text-slate-300">Digite seu CPF *</label><div className="relative"><User className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" /><input type="text" inputMode="numeric" value={cpfInput} onChange={handleCpfChange} placeholder="000.000.000-00" className="w-full pl-11 pr-4 py-3 bg-slate-900 border-2 border-slate-600 focus:border-blue-500 rounded-2xl text-base font-mono font-bold text-white" />{cpfInput && <button type="button" onClick={() => { setCpfInput(""); setResultado(null); setError(null); }} className="absolute right-3 top-3 text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-lg">Limpar</button>}</div>{error && <div className="p-3 bg-rose-950 border border-rose-800 rounded-xl text-xs text-rose-200 font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}<button type="submit" disabled={loading || !cpfInput.trim()} className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 text-sm disabled:opacity-50">{loading ? <><RefreshCw className="w-5 h-5 animate-spin" />Consultando Banco de Dados...</> : <><Search className="w-5 h-5" />Consultar CNH</>}</button></form><div className="pt-3 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400"><div className="flex items-center gap-2"><Smartphone className="w-4 h-4 text-emerald-400" /><span>Consultas no App Público:</span></div><span className="px-2.5 py-1 bg-emerald-950 border border-emerald-700 text-emerald-300 font-extrabold rounded-lg">{searchCount} consultas</span></div></div>

        {resultado && <div className="space-y-4 animate-fadeIn">
          {resultado.statusDisponibilidade === "DISPONIVEL" && resultado.cnhEncontrada && <div className="bg-emerald-950/80 border-2 border-emerald-500/80 rounded-3xl p-5 space-y-4"><div className="flex items-center gap-3 border-b border-emerald-800 pb-3"><CheckCircle2 className="w-7 h-7 text-emerald-400" /><div><span className="bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full">CNH PRONTA</span><h2 className="text-lg font-black text-white">Disponível para Retirada!</h2></div></div><div className="p-3.5 bg-emerald-900/60 rounded-2xl flex justify-between"><div><span className="text-[11px] uppercase font-bold text-emerald-300 block">Número da Ordem</span><span className="text-2xl font-black font-mono">#{resultado.cnhEncontrada.ordem}</span></div><div className="text-right"><span className="text-[11px] uppercase font-bold text-emerald-300 block">Status Atual</span><span className="font-bold text-xs">Recebida no Balcão</span></div></div><div className="space-y-2.5 bg-slate-900/60 p-3.5 rounded-2xl text-xs"><p><User className="w-4 h-4 inline text-emerald-400" /> <span className="text-slate-400">Titular:</span> <strong className="text-white">{resultado.cnhEncontrada.nome}</strong></p><p><MapPin className="w-4 h-4 inline text-emerald-400" /> <span className="text-slate-400">Localização:</span> <strong className="text-emerald-300">{resultado.cnhEncontrada.gaveta || "Balcão principal"} {resultado.cnhEncontrada.reparticao ? `(${resultado.cnhEncontrada.reparticao})` : ""}</strong></p><p><Clock className="w-4 h-4 inline text-emerald-400" /> <span className="text-slate-400">Data de chegada:</span> <strong className="text-white font-mono">{formatDateTime(resultado.cnhEncontrada.data_movimento)}</strong></p></div><div className="p-3.5 bg-emerald-900/40 rounded-2xl text-xs"><p className="font-bold text-white"><Info className="w-4 h-4 inline text-emerald-400" /> Instruções:</p><ul className="list-disc list-inside text-[11px]"><li>Dirija-se ao setor de Atendimento e Protocolo.</li><li>Informe a <strong>Ordem #{resultado.cnhEncontrada.ordem}</strong>.</li><li>Apresente documento oficial com foto.</li></ul></div></div>}
          {resultado.statusDisponibilidade === "ENTREGUE" && resultado.cnhEncontrada && <div className="bg-blue-950/80 border-2 border-blue-500/80 rounded-3xl p-5 space-y-3"><div className="flex items-center gap-3"><CheckCircle2 className="w-6 h-6 text-blue-400" /><div><span className="bg-blue-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full">CNH ENTREGUE</span><h2 className="text-base font-extrabold text-white">Documento Já Retirado</h2></div></div><div className="p-3 bg-slate-900/60 rounded-2xl text-xs space-y-2"><p><strong className="text-slate-400">Titular:</strong> {resultado.cnhEncontrada.nome}</p><p><strong className="text-slate-400">Ordem:</strong> #{resultado.cnhEncontrada.ordem}</p>{resultado.cnhEncontrada.responsavel_nome && <p><strong className="text-slate-400">Retirado por:</strong> <span className="text-amber-300">{resultado.cnhEncontrada.responsavel_nome}</span></p>}<p><strong className="text-slate-400">Data:</strong> {formatDateTime(resultado.cnhEncontrada.data_movimento)}</p></div></div>}
          {resultado.statusDisponibilidade === "EM_PROCESSAMENTO" && resultado.cnhEncontrada && <div className="bg-amber-950/80 border-2 border-amber-500/80 rounded-3xl p-5 space-y-3"><div className="flex items-center gap-3"><Clock className="w-6 h-6 text-amber-400" /><div><span className="bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full">EM PROCESSAMENTO</span><h2 className="text-base font-extrabold text-white">Ainda não disponível para retirada</h2></div></div><p className="text-xs text-amber-200">A sua CNH foi remetida, mas ainda não deu entrada física no balcão de atendimento.</p><div className="p-3 bg-slate-900/60 rounded-2xl text-xs"><p><strong className="text-slate-400">Titular:</strong> {resultado.cnhEncontrada.nome}</p><p><strong className="text-slate-400">Situação:</strong> <span className="text-amber-300">{resultado.cnhEncontrada.situacao}</span></p></div></div>}
          {resultado.statusDisponibilidade === "NAO_ENCONTRADA" && <div className="bg-slate-800/90 border-2 border-slate-700 rounded-3xl p-5 text-center space-y-3"><Search className="w-6 h-6 mx-auto text-slate-400" /><h3 className="text-base font-extrabold text-white">Nenhum registro localizado</h3><p className="text-xs text-slate-400">Não encontramos uma CNH registrada para o CPF <strong className="font-mono text-slate-200">{formatCPF(resultado.cpfConsultado)}</strong>.</p></div>}
          <button type="button" onClick={() => void handleCopyShareLink()} className="w-full py-2.5 px-3 bg-slate-800 text-slate-200 font-semibold rounded-2xl border border-slate-700 text-xs flex items-center justify-center gap-2">{copiedLink ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" />Link Copiado!</> : <><Share2 className="w-4 h-4 text-blue-400" />Compartilhar este resultado</>}</button>
        </div>}
      </main>

      <footer className="text-center text-[10px] text-slate-500 space-y-1 pt-4"><p>© 2026 DETRAN/PA - Sistema de Protocolo e Atendimento de CNHs</p><p className="text-slate-600">Sessão pública mobile e segura</p></footer>

      {showQrCodeModal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"><div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-6 text-center space-y-4"><button onClick={() => setShowQrCodeModal(false)} className="absolute top-4 right-4">✕</button><QrCode className="w-6 h-6 mx-auto text-blue-400" /><h3 className="text-base font-bold">QR Code de Consulta</h3><p className="text-xs text-slate-400">Escaneie para abrir a consulta no celular:</p><div className="p-4 bg-white rounded-2xl inline-block"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentPublicUrl)}`} alt="QR Code Consulta CNH" className="w-48 h-48 mx-auto rounded-lg" /></div><p className="text-[10px] break-all bg-slate-950 p-2 rounded-xl">{currentPublicUrl}</p><button onClick={() => setShowQrCodeModal(false)} className="w-full py-2.5 bg-slate-800 text-white text-xs font-bold rounded-xl">Fechar</button></div></div>}

      {showInstallModal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85"><div className="bg-slate-900 border border-emerald-800 rounded-3xl max-w-md w-full p-6 text-left space-y-4 text-slate-200"><button onClick={() => setShowInstallModal(false)} className="absolute top-4 right-4">✕</button><div className="flex items-center gap-3"><Download className="w-6 h-6 text-emerald-400" /><div><h3 className="text-base font-extrabold">Instalar App no Dispositivo</h3><p className="text-xs text-emerald-400">Adicione o Portal do Cidadão à Tela Inicial</p></div></div><p className="text-xs text-slate-300">No Android/Chrome use o menu ⋮ e selecione “Instalar aplicativo”. No iPhone/Safari use Compartilhar → Adicionar à Tela de Início. No computador use o ícone de instalação do navegador.</p>{deferredPrompt && <button onClick={() => { setShowInstallModal(false); void handleInstallApp(); }} className="w-full py-3 bg-emerald-600 text-white font-extrabold text-xs rounded-xl">Instalar Agora Direto</button>}<button onClick={() => setShowInstallModal(false)} className="w-full py-2.5 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl">Entendi / Fechar</button></div></div>}
    </div>
  );
};
