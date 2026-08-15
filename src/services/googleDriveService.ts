import * as XLSX from "xlsx";
import {
  getGeralCNHs,
  getMemorandos,
  getCandidatosAll,
  getMapeamentos,
  getResponsaveis,
  getUsuarios,
  getHistoricoList,
  getAuditoriaList,
  getAcessosCidadaoLogs
} from "./db";
import { getOrgaoConfig } from "./orgaoService";

declare global {
  interface Window {
    google?: any;
  }
}

export interface GoogleDriveUser {
  id?: string;
  name: string;
  email: string;
  picture?: string;
}

export interface GoogleDriveBackupFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
  iconLink?: string;
}

export interface GoogleDriveBackupResult {
  id: string;
  success: boolean;
  timestamp: string;
  dateStr: string;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  files: GoogleDriveBackupFile[];
  totalRecords: number;
  error?: string;
}

export interface GoogleDriveConfig {
  clientId: string;
  autoBackupEnabled: boolean;
  formats: {
    excel: boolean;
    csv: boolean;
    json: boolean;
  };
  rootFolderName: string;
  lastBackupDate?: string;
  lastBackupTimestamp?: string;
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: "detran_gdrive_access_token",
  EXPIRES_AT: "detran_gdrive_token_expires_at",
  USER_PROFILE: "detran_gdrive_user_profile",
  CONFIG: "detran_gdrive_config",
  HISTORY: "detran_gdrive_backup_history"
};

const DEFAULT_CLIENT_ID =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) ||
  "";

const DEFAULT_CONFIG: GoogleDriveConfig = {
  clientId: DEFAULT_CLIENT_ID,
  autoBackupEnabled: true,
  formats: {
    excel: true,
    csv: true,
    json: true
  },
  rootFolderName: "DETRAN_PA_Backups"
};

// ============================================================================
// CONFIGURAÇÕES E ESTADO
// ============================================================================

export function getGoogleDriveConfig(): GoogleDriveConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (!stored) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      clientId: parsed.clientId || DEFAULT_CLIENT_ID,
      formats: {
        ...DEFAULT_CONFIG.formats,
        ...(parsed.formats || {})
      }
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveGoogleDriveConfig(cfg: Partial<GoogleDriveConfig>): GoogleDriveConfig {
  const current = getGoogleDriveConfig();
  const updated = { ...current, ...cfg };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(updated));
  }
  return updated;
}

export function getGoogleDriveAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const expiresAt = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
  if (!token || !expiresAt) return null;

  if (Date.now() > parseInt(expiresAt, 10)) {
    // Token expirado
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
    return null;
  }
  return token;
}

export function setGoogleDriveAccessToken(token: string, expiresInSeconds: number = 3600): void {
  if (typeof window === "undefined") return;
  const expiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt.toString());
}

export function getGoogleDriveUser(): GoogleDriveUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function isGoogleDriveConnected(): boolean {
  return !!getGoogleDriveAccessToken();
}

export function disconnectGoogleDrive(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
  localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
  window.dispatchEvent(new CustomEvent("detran_gdrive_auth_change", { detail: { connected: false } }));
}

// ============================================================================
// AUTENTICAÇÃO COM GOOGLE IDENTITY SERVICES (GSI)
// ============================================================================

export async function fetchGoogleUserProfile(token: string): Promise<GoogleDriveUser | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Falha ao obter perfil do Google");
    const data = await res.json();
    const user: GoogleDriveUser = {
      id: data.sub,
      name: data.name || data.email,
      email: data.email,
      picture: data.picture
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(user));
    }
    return user;
  } catch (e) {
    console.warn("Aviso ao buscar perfil do Google:", e);
    return null;
  }
}

export async function requestGoogleDriveAuth(customClientId?: string): Promise<{ success: boolean; token?: string; user?: GoogleDriveUser | null; error?: string }> {
  return new Promise((resolve) => {
    const cfg = getGoogleDriveConfig();
    const clientId = customClientId || cfg.clientId || DEFAULT_CLIENT_ID;

    // Verificar se o script GSI está carregado
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      // Tentar carregar dinamicamente se necessário
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initiateTokenFlow(clientId, resolve);
      };
      script.onerror = () => {
        resolve({
          success: false,
          error: "Não foi possível carregar o serviço de autenticação do Google (GSI). Verifique sua conexão com a internet."
        });
      };
      document.head.appendChild(script);
      return;
    }

    initiateTokenFlow(clientId, resolve);
  });
}

function initiateTokenFlow(clientId: string, resolve: (res: { success: boolean; token?: string; user?: GoogleDriveUser | null; error?: string }) => void) {
  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId || "GOOGLE_CLIENT_ID",
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
      callback: async (response: any) => {
        if (response.error) {
          resolve({
            success: false,
            error: response.error_description || response.error || "Autorização cancelada pelo usuário."
          });
          return;
        }

        if (response.access_token) {
          const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
          setGoogleDriveAccessToken(response.access_token, expiresIn);
          const user = await fetchGoogleUserProfile(response.access_token);
          
          window.dispatchEvent(new CustomEvent("detran_gdrive_auth_change", { detail: { connected: true, user } }));

          resolve({
            success: true,
            token: response.access_token,
            user
          });
        } else {
          resolve({
            success: false,
            error: "Nenhum token de acesso foi retornado pelo Google."
          });
        }
      }
    });

    // Abrir janela de consentimento do Google
    tokenClient.requestAccessToken({ prompt: "consent" });
  } catch (err: any) {
    resolve({
      success: false,
      error: err.message || "Erro ao inicializar o fluxo de autenticação do Google."
    });
  }
}

// ============================================================================
// OPERAÇÕES DO GOOGLE DRIVE API (v3)
// ============================================================================

async function driveApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getGoogleDriveAccessToken();
  if (!token) {
    throw new Error("Não autenticado no Google Drive. Conecte sua conta do Google.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || `Erro Google Drive HTTP ${res.status}`;
    if (res.status === 401) {
      disconnectGoogleDrive();
      throw new Error("Sua sessão do Google expirou. Por favor, conecte o Google Drive novamente.");
    }
    throw new Error(message);
  }

  return res.json();
}

// Localizar ou criar a pasta raiz no Google Drive
export async function getOrCreateDriveFolder(folderName: string, parentFolderId?: string): Promise<string> {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const listRes = await driveApiRequest(`files?q=${encodeURIComponent(query)}&fields=files(id, name)`);
  if (listRes.files && listRes.files.length > 0) {
    return listRes.files[0].id;
  }

  // Criar pasta se não existir
  const metadata: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const createRes = await driveApiRequest("files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata)
  });

  return createRes.id;
}

// Upload multipart para o Google Drive
async function uploadFileToDrive(
  name: string,
  mimeType: string,
  content: Blob | string | ArrayBuffer,
  folderId?: string
): Promise<GoogleDriveBackupFile> {
  const token = getGoogleDriveAccessToken();
  if (!token) throw new Error("Google Drive não está autenticado.");

  const metadata: any = {
    name,
    mimeType
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  let bodyBlob: Blob;
  let fileBlob: Blob;

  if (content instanceof Blob) {
    fileBlob = content;
  } else if (typeof content === "string") {
    fileBlob = new Blob([content], { type: mimeType });
  } else {
    fileBlob = new Blob([content], { type: mimeType });
  }

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileHeaderPart = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  bodyBlob = new Blob([metadataPart, fileHeaderPart, fileBlob, closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`
  });

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,iconLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: bodyBlob
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro ao enviar arquivo para o Google Drive: HTTP ${res.status}`);
  }

  const fileData = await res.json();
  return {
    id: fileData.id,
    name: fileData.name,
    mimeType: fileData.mimeType,
    size: fileData.size ? parseInt(fileData.size, 10) : fileBlob.size,
    webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
    iconLink: fileData.iconLink
  };
}

// ============================================================================
// GERAÇÃO DOS ARQUIVOS DE BACKUP (EXCEL, CSV E JSON)
// ============================================================================

export interface ExtractedDatabaseData {
  geral: any[];
  memorandos: any[];
  candidatos: any[];
  mapeamento: any[];
  responsaveis: any[];
  usuarios: any[];
  historico: any[];
  auditoria: any[];
  acessos_cidadao: any[];
  orgao: any;
  totalRecords: number;
}

export async function fetchAllDatabaseTables(): Promise<ExtractedDatabaseData> {
  const [
    geral,
    memorandos,
    candidatos,
    mapeamento,
    responsaveis,
    usuarios,
    historico,
    auditoria,
    acessos_cidadao,
    orgao
  ] = await Promise.all([
    getGeralCNHs(),
    getMemorandos(),
    getCandidatosAll(),
    getMapeamentos(),
    getResponsaveis(),
    getUsuarios(),
    getHistoricoList(),
    getAuditoriaList(),
    Promise.resolve(getAcessosCidadaoLogs()),
    Promise.resolve(getOrgaoConfig())
  ]);

  const totalRecords =
    geral.length +
    memorandos.length +
    candidatos.length +
    mapeamento.length +
    responsaveis.length +
    usuarios.length +
    historico.length +
    auditoria.length +
    acessos_cidadao.length;

  return {
    geral,
    memorandos,
    candidatos,
    mapeamento,
    responsaveis,
    usuarios,
    historico,
    auditoria,
    acessos_cidadao,
    orgao,
    totalRecords
  };
}

// Gera arquivo Excel Multi-Abas
export function generateBackupExcelBlob(data: ExtractedDatabaseData): Blob {
  const wb = XLSX.utils.book_new();

  const collections = [
    { name: "Protocolo Geral CNHs", data: data.geral },
    { name: "Memorandos", data: data.memorandos },
    { name: "Candidatos", data: data.candidatos },
    { name: "Mapeamento Gavetas AZ", data: data.mapeamento },
    { name: "Responsaveis e CFCs", data: data.responsaveis },
    { name: "Usuarios Sistema", data: data.usuarios },
    { name: "Historico Movimentos", data: data.historico },
    { name: "Auditoria Sistema", data: data.auditoria },
    { name: "Consultas Cidadao Logs", data: data.acessos_cidadao }
  ];

  for (const col of collections) {
    const formattedRows = (col.data || []).map((item: any) => {
      const copy: Record<string, any> = {};
      for (const k in item) {
        if (typeof item[k] === "object" && item[k] !== null) {
          copy[k] = JSON.stringify(item[k]);
        } else {
          copy[k] = item[k];
        }
      }
      return copy;
    });

    const ws = XLSX.utils.json_to_sheet(formattedRows.length > 0 ? formattedRows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, col.name.substring(0, 31));
  }

  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

// Gera conteúdo CSV formatado em UTF-8 com BOM
export function generateTableCSVBlob(records: any[]): Blob {
  if (!records || records.length === 0) {
    return new Blob(["\uFEFF"], { type: "text/csv;charset=utf-8;" });
  }

  const formattedRows = records.map((item: any) => {
    const copy: Record<string, any> = {};
    for (const k in item) {
      if (typeof item[k] === "object" && item[k] !== null) {
        copy[k] = JSON.stringify(item[k]);
      } else {
        copy[k] = item[k];
      }
    }
    return copy;
  });

  const ws = XLSX.utils.json_to_sheet(formattedRows);
  const csvContent = XLSX.utils.sheet_to_csv(ws, { FS: ";" }); // Usa ponto e vírgula para compatibilidade perfeita com Excel BR
  return new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
}

// Gera arquivo JSON estruturado
export function generateBackupJSONBlob(data: ExtractedDatabaseData): Blob {
  const payload = {
    detran_system_version: "2.5",
    export_type: "google_drive_daily_backup",
    exported_at: new Date().toISOString(),
    total_records: data.totalRecords,
    tables: {
      geral_cnhs: data.geral,
      memorandos: data.memorandos,
      candidatos: data.candidatos,
      mapeamento_localizacao: data.mapeamento,
      responsaveis: data.responsaveis,
      usuarios: data.usuarios,
      historico_movimentacoes: data.historico,
      auditoria: data.auditoria,
      acessos_cidadao: data.acessos_cidadao,
      orgao_config: data.orgao
    }
  };

  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

// ============================================================================
// EXECUÇÃO DO BACKUP NO GOOGLE DRIVE
// ============================================================================

export async function executeGoogleDriveBackup(
  onProgress?: (step: string, current: number, total: number) => void
): Promise<GoogleDriveBackupResult> {
  const token = getGoogleDriveAccessToken();
  if (!token) {
    throw new Error("Não autenticado no Google Drive. Conecte sua conta antes de continuar.");
  }

  const config = getGoogleDriveConfig();
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = `${String(now.getHours()).padStart(2, "0")}h${String(now.getMinutes()).padStart(2, "0")}`;
  const folderName = `Backup_DETRAN_${dateStr}_${timeStr}`;

  onProgress?.("Coletando todas as tabelas do sistema...", 1, 10);
  const dbData = await fetchAllDatabaseTables();

  onProgress?.("Localizando/Criando pasta raiz no Google Drive...", 2, 10);
  const rootFolderId = await getOrCreateDriveFolder(config.rootFolderName || "DETRAN_PA_Backups");

  onProgress?.(`Criando pasta diária '${folderName}' no Google Drive...`, 3, 10);
  const dailyFolderId = await getOrCreateDriveFolder(folderName, rootFolderId);

  const uploadedFiles: GoogleDriveBackupFile[] = [];
  let stepsDone = 3;
  const totalSteps = 10;

  // 1. Enviar Planilha Consolidada Excel (.xlsx)
  if (config.formats.excel) {
    onProgress?.("Gerando e enviando Planilha Consolidada Excel (.xlsx)...", ++stepsDone, totalSteps);
    const excelBlob = generateBackupExcelBlob(dbData);
    const excelFileName = `DETRAN_Backup_Completo_${dateStr}.xlsx`;
    const uploadedExcel = await uploadFileToDrive(
      excelFileName,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      excelBlob,
      dailyFolderId
    );
    uploadedFiles.push(uploadedExcel);
  }

  // 2. Enviar Arquivos Individuais em CSV (.csv)
  if (config.formats.csv) {
    onProgress?.("Gerando e enviando tabelas em formato CSV...", ++stepsDone, totalSteps);
    const tablesToCsv = [
      { name: `01_Protocolo_Geral_CNHs_${dateStr}.csv`, data: dbData.geral },
      { name: `02_Memorandos_${dateStr}.csv`, data: dbData.memorandos },
      { name: `03_Candidatos_${dateStr}.csv`, data: dbData.candidatos },
      { name: `04_Mapeamento_Gavetas_${dateStr}.csv`, data: dbData.mapeamento },
      { name: `05_Responsaveis_CFCs_${dateStr}.csv`, data: dbData.responsaveis },
      { name: `06_Usuarios_Sistema_${dateStr}.csv`, data: dbData.usuarios },
      { name: `07_Historico_Movimentacoes_${dateStr}.csv`, data: dbData.historico },
      { name: `08_Auditoria_Sistema_${dateStr}.csv`, data: dbData.auditoria },
      { name: `09_Consultas_Cidadao_Logs_${dateStr}.csv`, data: dbData.acessos_cidadao }
    ];

    for (const item of tablesToCsv) {
      const csvBlob = generateTableCSVBlob(item.data);
      const uploadedCsv = await uploadFileToDrive(item.name, "text/csv", csvBlob, dailyFolderId);
      uploadedFiles.push(uploadedCsv);
    }
  }

  // 3. Enviar Arquivo JSON Completo (.json)
  if (config.formats.json) {
    onProgress?.("Gerando e enviando Dump Estruturado JSON (.json)...", ++stepsDone, totalSteps);
    const jsonBlob = generateBackupJSONBlob(dbData);
    const jsonFileName = `DETRAN_Backup_Estruturado_${dateStr}.json`;
    const uploadedJson = await uploadFileToDrive(jsonFileName, "application/json", jsonBlob, dailyFolderId);
    uploadedFiles.push(uploadedJson);
  }

  onProgress?.("Finalizando e registrando histórico de backup...", totalSteps, totalSteps);

  const folderUrl = `https://drive.google.com/drive/folders/${dailyFolderId}`;
  const result: GoogleDriveBackupResult = {
    id: `gdrive-bkp-${Date.now()}`,
    success: true,
    timestamp: now.toISOString(),
    dateStr,
    folderId: dailyFolderId,
    folderName,
    folderUrl,
    files: uploadedFiles,
    totalRecords: dbData.totalRecords
  };

  // Salvar no histórico
  saveBackupToHistory(result);

  // Atualizar data do último backup
  saveGoogleDriveConfig({
    lastBackupDate: dateStr,
    lastBackupTimestamp: now.toISOString()
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("detran_gdrive_backup_completed", { detail: result }));
  }

  return result;
}

// ============================================================================
// HISTÓRICO DE BACKUPS
// ============================================================================

export function getGoogleDriveBackupHistory(): GoogleDriveBackupResult[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveBackupToHistory(item: GoogleDriveBackupResult): void {
  if (typeof window === "undefined") return;
  const history = getGoogleDriveBackupHistory();
  const updated = [item, ...history.filter((h) => h.id !== item.id)].slice(0, 25);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
}

export function clearGoogleDriveHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.HISTORY);
}

// ============================================================================
// ROTINA DE BACKUP AUTOMÁTICO DIÁRIO
// ============================================================================

export async function checkAndRunDailyGoogleDriveBackup(
  onLog?: (msg: string) => void
): Promise<GoogleDriveBackupResult | null> {
  const config = getGoogleDriveConfig();
  if (!config.autoBackupEnabled) return null;
  if (!isGoogleDriveConnected()) return null;

  const todayStr = new Date().toISOString().split("T")[0];
  if (config.lastBackupDate === todayStr) {
    // Backup de hoje já foi realizado
    return null;
  }

  try {
    onLog?.(`Iniciando rotina de Backup Automático Diário para o Google Drive (${todayStr})...`);
    const result = await executeGoogleDriveBackup((step) => {
      onLog?.(`[Google Drive Auto-Backup] ${step}`);
    });
    onLog?.(`✅ Backup automático concluído no Google Drive! ${result.files.length} arquivos salvos na pasta '${result.folderName}'.`);
    return result;
  } catch (err: any) {
    onLog?.(`⚠️ Falha no backup automático do Google Drive: ${err.message}`);
    console.warn("Erro no backup automático diário:", err);
    return null;
  }
}
