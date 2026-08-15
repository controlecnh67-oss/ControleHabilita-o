import React, { useState, useEffect } from "react";
import {
  Cloud,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Folder,
  FileSpreadsheet,
  FileText,
  FileJson,
  ShieldCheck,
  Settings,
  LogIn,
  LogOut,
  Calendar,
  Layers,
  ChevronRight,
  Clock,
  Download
} from "lucide-react";
import {
  getGoogleDriveConfig,
  saveGoogleDriveConfig,
  getGoogleDriveUser,
  isGoogleDriveConnected,
  requestGoogleDriveAuth,
  disconnectGoogleDrive,
  executeGoogleDriveBackup,
  getGoogleDriveBackupHistory,
  clearGoogleDriveHistory,
  GoogleDriveUser,
  GoogleDriveBackupResult,
  GoogleDriveConfig
} from "../services/googleDriveService";

export const GoogleDriveBackupCard: React.FC = () => {
  const [config, setConfig] = useState<GoogleDriveConfig>(getGoogleDriveConfig());
  const [user, setUser] = useState<GoogleDriveUser | null>(getGoogleDriveUser());
  const [isConnected, setIsConnected] = useState<boolean>(isGoogleDriveConnected());
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [progressStep, setProgressStep] = useState<{ current: number; total: number }>({ current: 0, total: 10 });
  const [lastResult, setLastResult] = useState<GoogleDriveBackupResult | null>(null);
  const [history, setHistory] = useState<GoogleDriveBackupResult[]>(getGoogleDriveBackupHistory());
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [customClientId, setCustomClientId] = useState<string>(config.clientId || "");
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshState = () => {
    setConfig(getGoogleDriveConfig());
    setUser(getGoogleDriveUser());
    setIsConnected(isGoogleDriveConnected());
    setHistory(getGoogleDriveBackupHistory());
  };

  useEffect(() => {
    refreshState();

    const handleAuthChange = () => {
      refreshState();
    };

    const handleBackupCompleted = (e: any) => {
      refreshState();
      if (e.detail) {
        setLastResult(e.detail);
      }
    };

    window.addEventListener("detran_gdrive_auth_change", handleAuthChange);
    window.addEventListener("detran_gdrive_backup_completed", handleBackupCompleted);

    return () => {
      window.removeEventListener("detran_gdrive_auth_change", handleAuthChange);
      window.removeEventListener("detran_gdrive_backup_completed", handleBackupCompleted);
    };
  }, []);

  const handleConnect = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await requestGoogleDriveAuth(customClientId);
      if (res.success) {
        setIsConnected(true);
        setUser(res.user || null);
        refreshState();
      } else {
        setAuthError(res.error || "Não foi possível autorizar o Google Drive.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Erro durante a conexão com o Google.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = () => {
    if (confirm("Deseja desconectar sua conta do Google Drive?")) {
      disconnectGoogleDrive();
      refreshState();
      setLastResult(null);
    }
  };

  const handleTriggerBackup = async () => {
    if (!isConnected) {
      alert("Por favor, conecte sua conta do Google Drive primeiro.");
      return;
    }

    setIsBackingUp(true);
    setProgressMsg("Iniciando processo de backup...");
    setProgressStep({ current: 1, total: 10 });
    setAuthError(null);

    try {
      const result = await executeGoogleDriveBackup((step, cur, tot) => {
        setProgressMsg(step);
        setProgressStep({ current: cur, total: tot });
      });

      setLastResult(result);
      refreshState();
    } catch (err: any) {
      setAuthError(`Erro ao realizar backup no Google Drive: ${err.message}`);
    } finally {
      setIsBackingUp(false);
      setProgressMsg("");
    }
  };

  const handleToggleAutoBackup = (enabled: boolean) => {
    const updated = saveGoogleDriveConfig({ autoBackupEnabled: enabled });
    setConfig(updated);
  };

  const handleToggleFormat = (formatKey: "excel" | "csv" | "json", val: boolean) => {
    const updated = saveGoogleDriveConfig({
      formats: {
        ...config.formats,
        [formatKey]: val
      }
    });
    setConfig(updated);
  };

  const handleSaveSettings = () => {
    const updated = saveGoogleDriveConfig({
      clientId: customClientId.trim()
    });
    setConfig(updated);
    setShowConfigModal(false);
  };

  const progressPercentage = Math.round((progressStep.current / progressStep.total) * 100);

  return (
    <div id="google-drive-backup-section" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-emerald-500 to-blue-500 p-0.5 shadow-sm">
            <div className="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center">
              <HardDrive className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Google Drive - Backup Diário em Nuvem
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${
                  isConnected
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                {isConnected ? "Google Drive Conectado" : "Desconectado"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gera e envia cópias diárias de segurança de todas as tabelas em formatos <strong>CSV (separados)</strong>, <strong>Excel (.xlsx multi-abas)</strong> e <strong>JSON</strong> diretamente para sua conta.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowConfigModal(true)}
            className="p-2 text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
            title="Configurações do Google Drive"
          >
            <Settings className="w-4 h-4" />
          </button>

          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Desconectar</span>
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isAuthenticating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isAuthenticating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              <span>{isAuthenticating ? "Conectando ao Google..." : "Conectar Google Drive"}</span>
            </button>
          )}
        </div>
      </div>

      {authError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{authError}</span>
        </div>
      )}

      {/* Main Grid: Info + Automation Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Conta Conectada e Status */}
        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
              Conta Vinculada
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>

          {isConnected && user ? (
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-center space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                Nenhuma conta Google conectada.
              </p>
              <button
                onClick={handleConnect}
                disabled={isAuthenticating}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Conectar Conta Google
              </button>
            </div>
          )}

          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <span>Pasta de Destino:</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                /{config.rootFolderName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Último Backup:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {config.lastBackupDate ? config.lastBackupDate : "Ainda não realizado"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Escopo de Segurança:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                drive.file (Acesso Seguro Restrito)
              </span>
            </div>
          </div>
        </div>

        {/* Coluna 2: Automação Diária e Formatos */}
        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
              Rotina & Formatos
            </span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>

          {/* Toggle Backup Diário Automático */}
          <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Backup Diário Automático</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Executa diariamente em segundo plano ao abrir o sistema
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoBackupEnabled}
                onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Seleção de Formatos */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Formatos a serem gerados:</p>
            <div className="grid grid-cols-3 gap-2">
              <label className={`flex items-center gap-1.5 p-2 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all ${
                config.formats.excel
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  : "bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800"
              }`}>
                <input
                  type="checkbox"
                  checked={config.formats.excel}
                  onChange={(e) => handleToggleFormat("excel", e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Excel (.xlsx)</span>
              </label>

              <label className={`flex items-center gap-1.5 p-2 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all ${
                config.formats.csv
                  ? "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                  : "bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800"
              }`}>
                <input
                  type="checkbox"
                  checked={config.formats.csv}
                  onChange={(e) => handleToggleFormat("csv", e.target.checked)}
                  className="rounded text-blue-600"
                />
                <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>CSVs (.csv)</span>
              </label>

              <label className={`flex items-center gap-1.5 p-2 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all ${
                config.formats.json
                  ? "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800"
                  : "bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800"
              }`}>
                <input
                  type="checkbox"
                  checked={config.formats.json}
                  onChange={(e) => handleToggleFormat("json", e.target.checked)}
                  className="rounded text-purple-600"
                />
                <FileJson className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>JSON (.json)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Coluna 3: Ação Manual e Execução */}
        <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-2xl border border-blue-800/60 p-5 flex flex-col justify-between space-y-4 shadow-md">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase text-blue-200 tracking-wider">
                Execução Instantânea
              </span>
              <Cloud className="w-5 h-5 text-blue-300 animate-pulse" />
            </div>
            <p className="text-xs text-blue-100/90 leading-relaxed">
              Exporta todas as CNHs, memorandos, usuários e histórico e envia diretamente para sua pasta organizada por data no Google Drive.
            </p>
          </div>

          <div className="space-y-3">
            {isBackingUp ? (
              <div className="space-y-2 bg-blue-950/60 p-3 rounded-xl border border-blue-700/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-blue-200 truncate">{progressMsg}</span>
                  <span className="font-mono font-bold text-white">{progressPercentage}%</span>
                </div>
                <div className="w-full bg-blue-900/60 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={handleTriggerBackup}
                disabled={isBackingUp || !isConnected}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Cloud className="w-4 h-4" />
                <span>Fazer Backup no Google Drive Agora</span>
              </button>
            )}

            {lastResult && lastResult.folderUrl && (
              <a
                href={lastResult.folderUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 border border-white/20"
              >
                <Folder className="w-3.5 h-3.5 text-amber-300" />
                <span>Abrir Pasta do Último Backup no Drive</span>
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Histórico Recente de Backups no Google Drive */}
      {history.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>Backups Salvos no Google Drive ({history.length})</span>
            </h3>
            <button
              onClick={() => {
                if (confirm("Limpar lista de histórico local do Google Drive? (Os arquivos no Drive não serão apagados)")) {
                  clearGoogleDriveHistory();
                  setHistory([]);
                }
              }}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
            >
              Limpar Histórico Local
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {history.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-amber-500" />
                    <span className="truncate max-w-[170px]">{item.folderName || item.dateStr}</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {item.files.length} arquivos
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{new Date(item.timestamp).toLocaleString("pt-BR")}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{item.totalRecords} registros</span>
                </div>

                {item.folderUrl && (
                  <a
                    href={item.folderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-1.5 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-300 font-semibold rounded-lg text-[11px] transition-all flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700"
                  >
                    <span>Ver Arquivos no Drive</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Configuração Avançada (Client ID e Pasta) */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-500" />
                Configurações da Integração Google Drive
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Google OAuth Client ID (Opcional):
                </label>
                <input
                  type="text"
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                  placeholder="ex: 123456789-abcdef.apps.googleusercontent.com"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500">
                  Se você configurou um Client ID personalizado no Google Cloud Console com escopo <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">https://www.googleapis.com/auth/drive.file</code>.
                </p>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-bold">🔒 Privacidade e Segurança:</p>
                <p className="text-[11px] leading-relaxed">
                  O sistema solicita apenas a permissão <strong>drive.file</strong>, permitindo criar e visualizar exclusivamente os arquivos de backup gerados pelo próprio DETRAN, sem acessar outros arquivos pessoais do seu Google Drive.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
