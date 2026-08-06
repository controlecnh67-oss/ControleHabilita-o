import { idbGet, idbSet } from "./db";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface OrgaoConfig {
  governo: string;            // ex: "GOVERNO DO ESTADO DO PARÁ"
  secretaria: string;         // ex: "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA"
  orgao: string;              // ex: "DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ"
  sigla: string;              // ex: "DETRAN/PA"
  origem_padrao: string;       // ex: "DA AGÊNCIA DO DETRAN DE ITAITUBA-PA"
  destino_padrao: string;      // ex: "PARA AGÊNCIA DO DETRAN DE SANTARÉM-PA"
  cidade_uf: string;          // ex: "Itaituba - PA"
  telefone: string;           // ex: "(91) 3214-0000"
  email: string;              // ex: "protocolo@detran.pa.gov.br"
  endereco: string;           // ex: "Av. Rodovia BR 316, Km 03 - Pará"
  subtitulo_relatorio: string;// ex: "COORDENADORIA DE HABILITAÇÃO & PROTOCOLO GERAL DE CNHs"
  logo: string;               // base64 data URL ou string vazia
}

export const DEFAULT_ORGAO_CONFIG: OrgaoConfig = {
  governo: "GOVERNO DO ESTADO DO PARÁ",
  secretaria: "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA",
  orgao: "DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ",
  sigla: "DETRAN/PA",
  origem_padrao: "DA AGÊNCIA DO DETRAN DE ITAITUBA-PA",
  destino_padrao: "PARA AGÊNCIA DO DETRAN DE SANTARÉM-PA",
  cidade_uf: "Itaituba - PA",
  telefone: "(91) 3214-0000",
  email: "protocolo@detran.pa.gov.br",
  endereco: "Av. Rodovia BR 316, Km 03 - Belém / PA",
  subtitulo_relatorio: "COORDENADORIA DE HABILITAÇÃO & PROTOCOLO GERAL DE CNHs",
  logo: "",
};

const STORAGE_KEY = "detran_orgao_config";

let memoryConfig: OrgaoConfig | null = null;

export function getOrgaoConfig(): OrgaoConfig {
  if (memoryConfig) {
    return memoryConfig;
  }
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryConfig = { ...DEFAULT_ORGAO_CONFIG, ...parsed };
      return memoryConfig!;
    }
  } catch (e) {
    console.warn("Erro ao ler orgaoConfig do localStorage:", e);
  }
  memoryConfig = { ...DEFAULT_ORGAO_CONFIG };
  return memoryConfig;
}

export async function saveOrgaoConfig(config: OrgaoConfig): Promise<void> {
  memoryConfig = config;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
    await idbSet(STORAGE_KEY, config).catch(() => {});
  } catch (e) {
    console.error("Erro ao salvar orgaoConfig:", e);
  }

  // Tenta sincronizar a configuração e a logomarca no Supabase
  if (isSupabaseConfigured()) {
    try {
      await supabase.from("orgao_config").upsert({
        id: "default",
        governo: config.governo,
        secretaria: config.secretaria,
        orgao: config.orgao,
        sigla: config.sigla,
        origem_padrao: config.origem_padrao,
        destino_padrao: config.destino_padrao,
        cidade_uf: config.cidade_uf,
        telefone: config.telefone,
        email: config.email,
        endereco: config.endereco,
        subtitulo_relatorio: config.subtitulo_relatorio,
        logo: config.logo,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });
    } catch (supErr) {
      console.warn("Aviso ao salvar orgaoConfig no Supabase:", supErr);
    }
  }

  // Atualiza também o favicon e ícone do app/atalho PWA
  updateAppFavicon(config.logo);
}

export async function loadOrgaoConfigFromSupabase(): Promise<OrgaoConfig | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase.from("orgao_config").select("*").eq("id", "default").single();
    if (error || !data) return null;
    const config: OrgaoConfig = {
      governo: data.governo || DEFAULT_ORGAO_CONFIG.governo,
      secretaria: data.secretaria || DEFAULT_ORGAO_CONFIG.secretaria,
      orgao: data.orgao || DEFAULT_ORGAO_CONFIG.orgao,
      sigla: data.sigla || DEFAULT_ORGAO_CONFIG.sigla,
      origem_padrao: data.origem_padrao || DEFAULT_ORGAO_CONFIG.origem_padrao,
      destino_padrao: data.destino_padrao || DEFAULT_ORGAO_CONFIG.destino_padrao,
      cidade_uf: data.cidade_uf || DEFAULT_ORGAO_CONFIG.cidade_uf,
      telefone: data.telefone || DEFAULT_ORGAO_CONFIG.telefone,
      email: data.email || DEFAULT_ORGAO_CONFIG.email,
      endereco: data.endereco || DEFAULT_ORGAO_CONFIG.endereco,
      subtitulo_relatorio: data.subtitulo_relatorio || DEFAULT_ORGAO_CONFIG.subtitulo_relatorio,
      logo: data.logo || "",
    };
    memoryConfig = config;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
    await idbSet(STORAGE_KEY, config).catch(() => {});
    updateAppFavicon(config.logo);
    return config;
  } catch (err) {
    console.warn("Erro ao carregar orgao_config do Supabase:", err);
    return null;
  }
}

export async function resetOrgaoConfig(): Promise<OrgaoConfig> {
  await saveOrgaoConfig(DEFAULT_ORGAO_CONFIG);
  return DEFAULT_ORGAO_CONFIG;
}

/**
 * Atualiza dinamicamente o favicon e ícone do atalho PWA/mobile com a imagem da logomarca do órgão
 */
export function updateAppFavicon(logoBase64: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const href = logoBase64 && logoBase64.trim() ? logoBase64 : "/favicon.ico";

  // 1. Atualizar ou criar <link rel="icon">
  let favicon = document.getElementById("app-favicon") as HTMLLinkElement | null;
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.id = "app-favicon";
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = href;

  // 2. Atualizar ou criar <link rel="apple-touch-icon"> para iOS e atalhos de tela inicial
  let appleIcon = document.getElementById("app-apple-icon") as HTMLLinkElement | null;
  if (!appleIcon) {
    appleIcon = document.createElement("link");
    appleIcon.id = "app-apple-icon";
    appleIcon.rel = "apple-touch-icon";
    document.head.appendChild(appleIcon);
  }
  appleIcon.href = href;

  // 3. Manifest dinâmico para PWA e Atalhos do navegador (Android/Windows)
  if (logoBase64 && logoBase64.startsWith("data:image/")) {
    let manifestLink = document.getElementById("app-dynamic-manifest") as HTMLLinkElement | null;
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.id = "app-dynamic-manifest";
      manifestLink.rel = "manifest";
      document.head.appendChild(manifestLink);
    }
    const manifestObj = {
      name: "DETRAN Protocolo CNH",
      short_name: "DETRAN CNH",
      description: "Sistema de Controle de Protocolo de CNHs",
      start_url: "/",
      display: "standalone",
      background_color: "#0f172a",
      theme_color: "#2563eb",
      icons: [
        {
          src: logoBase64,
          sizes: "192x192 512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    };
    try {
      const blob = new Blob([JSON.stringify(manifestObj)], { type: "application/json" });
      manifestLink.href = URL.createObjectURL(blob);
    } catch (err) {
      console.warn("Erro ao gerar blob de manifest PWA:", err);
    }
  }
}

/**
 * Helper para desenhar a logo do órgão nos arquivos PDF gerados via jsPDF
 */
export function addPDFHeaderLogo(doc: any, x: number = 14, y: number = 8, w: number = 18, h: number = 18): boolean {
  const cfg = getOrgaoConfig();
  if (!cfg.logo || !cfg.logo.startsWith("data:image/")) return false;

  try {
    let format = "PNG";
    if (cfg.logo.includes("image/jpeg") || cfg.logo.includes("image/jpg")) format = "JPEG";
    else if (cfg.logo.includes("image/webp")) format = "WEBP";

    doc.addImage(cfg.logo, format, x, y, w, h);
    return true;
  } catch (err) {
    console.warn("Não foi possível renderizar a logo no PDF:", err);
    return false;
  }
}

// Inicialização automática do favicon se já houver logo salva
if (typeof window !== "undefined") {
  setTimeout(() => {
    try {
      const cfg = getOrgaoConfig();
      if (cfg.logo) {
        updateAppFavicon(cfg.logo);
      }
    } catch (e) {
      // Ignora erro inicial
    }
  }, 100);
}
