import {
  Usuario,
  Responsavel,
  Memorando,
  Candidato,
  GeralCNH,
  HistoricoMovimentacao,
  Auditoria,
  MapeamentoLocalizacao,
  SituacaoGeral,
  AcaoAuditoria,
  AcessoCidadaoLog,
  MapaArquivoFisico,
  MapaGavetaItem,
  MapaReparticaoItem,
  getPermissoesPadrao,
  Declaracao,
  DeclaracaoItemCondutor,
  Lote,
  LoteInput
} from "../types";
import { getInitialChar, formatDateTime, normalizeSearch } from "../lib/utils";
import { supabase, isSupabaseConfigured } from "./supabase";
import * as XLSX from "xlsx";
import cnhSeedData from "../data/cnhSeedData.json";
import {
  dexieDb,
  saveLocalGeralCNH,
  saveLocalGeralCNHsBulk,
  deleteLocalGeralCNH,
  deleteLocalGeralCNHsBulk,
  getLocalGeralCNHs,
  syncGeralWithSupabase
} from "./dexieDb";
import { 
  uploadLogoToSupabaseStorage, 
  loadOrgaoConfigFromSupabase,
  getOrgaoConfig,
  saveOrgaoConfig
} from "./orgaoService";
import { trackEgress } from "./egressMonitorService";

// Verificação de credenciais Supabase reais via variáveis de ambiente VITE_ ou utilitário
export function isSupabaseConnected(): boolean {
  return isSupabaseConfigured();
}

// Disparar evento global de sincronização para atualizar todas as abas e componentes
export function notifyDataSync(type: string = "all", fromRemote: boolean = false) {
  invalidateSupabaseCache(type === "all" ? undefined : type);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("detran_sync_updated", { detail: { type, fromRemote, timestamp: Date.now() } }));
    if (!fromRemote && typeof (window as any).__detranBroadcastMutation === "function") {
      try {
        (window as any).__detranBroadcastMutation(type, "sync");
      } catch {}
    }
  }
}

export function cleanFK(id?: string | null, validSet?: Set<string>): string | null {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (trimmed === "") return null;
  if (validSet && !validSet.has(trimmed)) return null;
  return trimmed;
}

function toValidUUID(id?: string | null): string | null {
  if (!id || typeof id !== "string" || id.trim() === "") return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanId = id.trim();
  if (uuidRegex.test(cleanId)) return cleanId;

  if (cleanId === "admin") return "11111111-1111-1111-1111-111111111111";
  if (cleanId === "supervisor") return "22222222-2222-2222-2222-222222222222";
  if (cleanId === "operador") return "33333333-3333-3333-3333-333333333333";
  if (cleanId === "consulta") return "44444444-4444-4444-4444-444444444444";
  if (cleanId === "proprietario") return "e2335b1e-0000-4000-8000-000000000000";

  // Gerar um UUID v4 determinístico a partir de qualquer string (ex: "usr-01", "resp-02")
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = ((hash << 5) - hash) + cleanId.charCodeAt(i);
    hash |= 0;
  }
  const hexHash = Math.abs(hash).toString(16).padStart(8, "0");
  const safeStr = cleanId.replace(/[^a-f0-9]/gi, "").toLowerCase().padEnd(24, "0").substring(0, 24);
  return `${hexHash}-${safeStr.substring(0, 4)}-4${safeStr.substring(4, 7)}-8${safeStr.substring(7, 10)}-${safeStr.substring(10, 22)}`;
}

// ============================================================================
// DADOS DE SEMENTE (SEED DATA) PARA MODO LOCAL / DEMO IMEDIATO
// ============================================================================

const SEED_USUARIOS: Usuario[] = [
  {
    id: "51f76373",
    nome: "Kaio Lohandes Gomes de Melo",
    nome_curto: "Kaio",
    fone: "(67) 99111-2222",
    email: "kaio@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "kaio",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "a6708d10",
    nome: "Dabita de Oliveira Cardoso",
    nome_curto: "Dabita",
    fone: "(67) 99222-3333",
    email: "dabita@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "dabita",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "ba8dff5e",
    nome: "Amerson Gonçalves Bento",
    nome_curto: "Amerson",
    fone: "(67) 99333-4444",
    email: "amerson@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "amerson",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "33aa7d87",
    nome: "Regis Reginaldo",
    nome_curto: "Regis",
    fone: "(67) 99444-5555",
    email: "regis@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "regis",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "8bc1be25",
    nome: "Ivanilde Souza",
    nome_curto: "Ivanilde",
    fone: "(67) 99555-6666",
    email: "ivanilde@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "ivanilde",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "2837b0a8",
    nome: "Zedequias",
    nome_curto: "Zedequias",
    fone: "(67) 99666-7777",
    email: "zedequias@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "zedequias",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "33a4ab38",
    nome: "Deck",
    nome_curto: "Deck",
    fone: "(67) 99777-8888",
    email: "deck@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "deck",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "11111111-1111-1111-1111-111111111111",
    nome: "Carlos Eduardo Mendes (Administrador)",
    nome_curto: "Carlos Eduardo",
    fone: "(67) 99111-2222",
    email: "admin@detran.pa.gov.br",
    funcao: "Chefe de Setor de Protocolo",
    setor: "Protocolo Geral",
    login: "admin",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Administrador"),
    perfil: "Administrador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    nome: "Fernanda Souza Vasconcelos (Supervisora)",
    nome_curto: "Fernanda Souza",
    fone: "(67) 99222-3333",
    email: "supervisor@detran.pa.gov.br",
    funcao: "Supervisora de Operações",
    setor: "Atendimento CNH",
    login: "supervisor",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Supervisor"),
    perfil: "Supervisor",
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    nome: "Roberto Alves Pereira (Operador)",
    nome_curto: "Roberto Alves",
    fone: "(67) 99333-4444",
    email: "operador@detran.pa.gov.br",
    funcao: "Agente de Trânsito / Protocolista",
    setor: "Guichê de Entrega",
    login: "operador",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    nome: "Juliana Lima Rocha (Consulta)",
    nome_curto: "Juliana Lima",
    fone: "(67) 99444-5555",
    email: "consulta@detran.pa.gov.br",
    funcao: "Auditora de Controle Interno",
    setor: "Auditoria Geral",
    login: "consulta",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Consulta"),
    perfil: "Consulta",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    ativo: true
  }
];

const SEED_RESPONSAVEIS: Responsavel[] = [
  { id: "a0000000-0000-0000-0000-000000000001", nome: "PROPRIETÁRIO", tipo: "Titular", registro: "", cpf: "000.000.000-00", telefone: "(93) 00000-0000", observacao: "Registro padrão intransferível para entrega ao próprio titular da CNH", ativo: true, created_at: new Date(Date.now() - 60 * 86400000).toISOString() },
  { id: "d2b9952a", nome: "FRANCINEY DESPACHANTE", tipo: "Despachante", registro: "1522", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "f4f347f1", nome: "CLEONAR DESPCHANTE", tipo: "Despachante", registro: "4567", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "39de40af", nome: "BRIZOLA AUTO ESCOLA", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "384b2d8c", nome: "DARLAN DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "60c09b00", nome: "MARLISSON DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "33a90e11", nome: "NATIELE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "71396f81", nome: "JOÃO PULO R MARQUES", tipo: "Procurador", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "97d3ad5e", nome: "AUTO ESCOLA SANTANA", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "fa41cde8", nome: "ARY DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "402ee83c", nome: "BAMBAM DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "b9bfae57", nome: "MARIA EUNICE DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "1f3d321e", nome: "MOISES DESPACAHNTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "5c4f215f", nome: "GILMAR DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "772dfcfd", nome: "NEILA DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "56899764", nome: "KAIO LOHANDES", tipo: "Procurador", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "bb95cdf5", nome: "WALTER DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "1b5ecd73", nome: "ODON DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "ee175176", nome: "TULA DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "fa1481d9", nome: "ESPOSA", tipo: "Procurador", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "527d4682", nome: "ELIONAI DESPACHANTE", tipo: "Despachante", cpf: "67079733200", registro: "52", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "c1058daa", nome: "ANTONIO WELITON RODRIGUES", tipo: "Procurador", cpf: "51548496200", telefone: "XXXXXX", ativo: true, created_at: new Date().toISOString() },
  { id: "efd23bd9", nome: "NICE DESPACHANTE", tipo: "Despachante", cpf: "5555555", telefone: "555555", ativo: true, created_at: new Date().toISOString() },
  { id: "7345b45d", nome: "GUSTAVO HENRIQUE SENA", tipo: "Procurador", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "85415cb3", nome: "SOCORRO DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "2995c099", nome: "ADAO DA ROSA NETO", tipo: "Procurador", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "6fb3467c", nome: "EDCARLOS LOLO", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "68b5d3ce", nome: "FERNANDO DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "a84dc2b7", nome: "JULIMAR DESPACHANTE", tipo: "Despachante", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "6da4b403", nome: "ED CARLOS BRAGA DOS SANTOS", tipo: "Procurador", cpf: "57950040220", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "b7d9a27f", nome: "ANA CRISTINA CIRINO", tipo: "Procurador", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "9a185a18", nome: "JACKSON DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "54a9108e", nome: "DIEGO DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "9387e9c9", nome: "ADENIL DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "f785d235", nome: "LIDIANE FARIAS DA SILVA", cpf: "64639363249", telefone: "92991058775", ativo: true, created_at: new Date().toISOString() },
  { id: "458fc6d7", nome: "NICE DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "221601a6", nome: "AMOS OLIVEIRA DOS ANJOS", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "0db81080", nome: "REGIS", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "40fda483", nome: "leonardo", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "83147b46", nome: "LUCIVAN DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "cc2a44d9", nome: "MANOEL DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "9967d842", nome: "RONALDO DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "8e90b2b1", nome: "ROSA DOS SANTOS DA SILVA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "b1597c81", nome: "PIERRE DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "f8b761c2", nome: "LEONARDO F MORAIS", cpf: "04456813229", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "a08afa6e", nome: "RAMON STIVENSON SILVA BANDEIRA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "bd4309ca", nome: "NAIZA KM 70", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "461abe27", nome: "CARLOS ROBERTO CORDEIRO DE SOUZA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "1852a327", nome: "ALESSANDRO DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "42121784", nome: "VERA LUCIA GONCALVES TEIXEIRA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "868e33c3", nome: "WANDERLEIA DE SENA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "b8c3fb7f", nome: "GERALDO BIESEK", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "24553e1f", nome: "JEAN COMTRI", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "541e38dc", nome: "ANGELO SILVA DO NASCIMENTO NETO", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "7b906878", nome: "VALDIR AG DETRAN", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "dfc67cdf", nome: "IVANILDE S SOUZA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "f2e68384", nome: "EVANILDO", cpf: "30862111234", telefone: "93991522309", ativo: true, created_at: new Date().toISOString() },
  { id: "773b2b5e", nome: "DESPACHANTE BEZERRA", cpf: "04546542133", telefone: "9341286985", ativo: true, created_at: new Date().toISOString() },
  { id: "1f8d56b0", nome: "HELIO JUNIOR FERREIRA DA SILVA", cpf: "58896740215", telefone: "93991611255", ativo: true, created_at: new Date().toISOString() },
  { id: "bd613528", nome: "VAN DESPACHANTE", cpf: "64753808220", telefone: "93991523181", ativo: true, created_at: new Date().toISOString() },
  { id: "bedd6d31", nome: "MARIA DA SILVA SOUSA", cpf: "88281221372", telefone: "91999019284", ativo: true, created_at: new Date().toISOString() },
  { id: "bbfd243b", nome: "elisangela costa de souza", cpf: "40261735268", telefone: "93991230100", ativo: true, created_at: new Date().toISOString() },
  { id: "c600348a", nome: "ALDAMIRO DE SOUSA", cpf: "00581706269", telefone: "93991634132", ativo: true, created_at: new Date().toISOString() },
  { id: "2bace6d9", nome: "jamilson despachante", cpf: "98075829204", telefone: "93991380811", ativo: true, created_at: new Date().toISOString() },
  { id: "5054bcf2", nome: "flavio da conceicao silva", cpf: "99015560153", telefone: "9398420915091", ativo: true, created_at: new Date().toISOString() },
  { id: "bd2db3cb", nome: "BRUNO SA", cpf: "90619277220", telefone: "222222222", ativo: true, created_at: new Date().toISOString() },
  { id: "a6638725", nome: "NEILA DESPACHANTE", cpf: "64752186268", telefone: "93991841911", ativo: true, created_at: new Date().toISOString() },
  { id: "b9ace4bd", nome: "ANDREIA SOUZA DA CRUZ", cpf: "01421637243", telefone: "93991023212", ativo: true, created_at: new Date().toISOString() },
  { id: "8724bcf3", nome: "NEY PEREIRA DE SOUSA JUNIOR", cpf: "01268469289", telefone: "93991546577", ativo: true, created_at: new Date().toISOString() },
  { id: "853abea7", nome: "RENILDO MARTINS SANTOS", cpf: "28418838841", telefone: "93991395729", ativo: true, created_at: new Date().toISOString() },
  { id: "78a4531a", nome: "MARINTIA DUTRA OLIVEIRA", cpf: "02818939267", telefone: "979911720559", ativo: true, created_at: new Date().toISOString() },
  { id: "bf84ea0a", nome: "lazaro josevaldo dias moraes", cpf: "03255827264", telefone: "93991403019", ativo: true, created_at: new Date().toISOString() },
  { id: "77b81905", nome: "VALMIRA DE BRITO PASSOS BRASIL", cpf: "31107613272", telefone: "93991416828", ativo: true, created_at: new Date().toISOString() },
  { id: "4a72c6fa", nome: "maria de fatima barros morais", cpf: "63494388253", telefone: "93992292653", ativo: true, created_at: new Date().toISOString() },
  { id: "74346934", nome: "ELIS MATIAS DE SOUZA", cpf: "59588209404", telefone: "9399181343381", ativo: true, created_at: new Date().toISOString() },
  { id: "79d70e03", nome: "bruno cordeiro de moraes", cpf: "03911236298", telefone: "93991848502", ativo: true, created_at: new Date().toISOString() },
  { id: "2a61a311", nome: "silvio vieira da silva", cpf: "03019656257", telefone: "939911712267", ativo: true, created_at: new Date().toISOString() },
  { id: "75da89d6", nome: "EMANUEL AUTO ESCOLA", cpf: "4561.515613", telefone: "93991386008", ativo: true, created_at: new Date().toISOString() }
];

const SEED_MAPEAMENTO: MapeamentoLocalizacao[] = [
  { id: "m-a", inicial: "A", gaveta: "Gaveta 1", reparticao: "Repartição 1", ativo: true },
  { id: "m-b", inicial: "B", gaveta: "Gaveta 1", reparticao: "Repartição 2", ativo: true },
  { id: "m-c", inicial: "C", gaveta: "Gaveta 1", reparticao: "Repartição 3", ativo: true },
  { id: "m-d", inicial: "D", gaveta: "Gaveta 1", reparticao: "Repartição 4", ativo: true },
  { id: "m-e", inicial: "E", gaveta: "Gaveta 1", reparticao: "Repartição 5", ativo: true },
  { id: "m-f", inicial: "F", gaveta: "Gaveta 1", reparticao: "Repartição 6", ativo: true },
  { id: "m-g", inicial: "G", gaveta: "Gaveta 1", reparticao: "Repartição 7", ativo: true },
  { id: "m-h", inicial: "H", gaveta: "Gaveta 1", reparticao: "Repartição 8", ativo: true },
  { id: "m-i", inicial: "I", gaveta: "Gaveta 3", reparticao: "Repartição 1", ativo: true },
  { id: "m-j", inicial: "J", gaveta: "Gaveta 3", reparticao: "Repartição 2", ativo: true },
  { id: "m-k", inicial: "K", gaveta: "Gaveta 3", reparticao: "Repartição 3", ativo: true },
  { id: "m-l", inicial: "L", gaveta: "Gaveta 3", reparticao: "Repartição 4", ativo: true },
  { id: "m-m", inicial: "M", gaveta: "Gaveta 3", reparticao: "Repartição 6", ativo: true },
  { id: "m-n", inicial: "N", gaveta: "Gaveta 3", reparticao: "Repartição 7", ativo: true },
  { id: "m-o", inicial: "O", gaveta: "Gaveta 3", reparticao: "Repartição 8", ativo: true },
  { id: "m-p", inicial: "P", gaveta: "Gaveta 4", reparticao: "Repartição 1", ativo: true },
  { id: "m-q", inicial: "Q", gaveta: "Gaveta 4", reparticao: "Repartição 2", ativo: true },
  { id: "m-r", inicial: "R", gaveta: "Gaveta 4", reparticao: "Repartição 3", ativo: true },
  { id: "m-s", inicial: "S", gaveta: "Gaveta 4", reparticao: "Repartição 4", ativo: true },
  { id: "m-t", inicial: "T", gaveta: "Gaveta 4", reparticao: "Repartição 5", ativo: true },
  { id: "m-v", inicial: "V", gaveta: "Gaveta 4", reparticao: "Repartição 6", ativo: true },
  { id: "m-y", inicial: "Y", gaveta: "Gaveta 4", reparticao: "Repartição 7", ativo: true },
  { id: "m-z", inicial: "Z", gaveta: "Gaveta 4", reparticao: "Repartição 7", ativo: true },
  { id: "m-w", inicial: "W", gaveta: "Gaveta 4", reparticao: "Repartição 6", ativo: true },
];

const SEED_MEMORANDOS: Memorando[] = [
  {
    id: "memo-01",
    numero: "MEMO-2026/042",
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    remessa: "REM-001/ABRIL",
    status: "Remetido",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    remetido_em: new Date(Date.now() - 4 * 86400000).toISOString(),
    candidatos_count: 2
  },
  {
    id: "memo-02",
    numero: "MEMO-2026/043",
    usuario_id: "22222222-2222-2222-2222-222222222222",
    usuario_nome: "Fernanda Souza",
    remessa: "REM-002/ABRIL",
    status: "Remetido",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    remetido_em: new Date(Date.now() - 2 * 86400000).toISOString(),
    candidatos_count: 2
  },
  {
    id: "memo-03",
    numero: "MEMO-2026/044",
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    remessa: "REM-003/ABRIL",
    status: "Em elaboração",
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    candidatos_count: 3
  }
];

const SEED_CANDIDATOS: Candidato[] = [
  { id: "cand-01", memorando_id: "memo-03", numero: "01", nome: "Luciana Borges Ferreira", cpf: "555.666.777-88", pa: "100200301", telefone: "(67) 98111-2233", remessa: "REM-003/ABRIL", created_at: new Date().toISOString() },
  { id: "cand-02", memorando_id: "memo-03", numero: "02", nome: "Marcos Vinicius Santos", cpf: "666.777.888-99", pa: "100200302", telefone: "(67) 98222-3344", remessa: "REM-003/ABRIL", created_at: new Date().toISOString() },
  { id: "cand-03", memorando_id: "memo-03", numero: "03", nome: "Helena Maria de Souza", cpf: "777.888.999-00", pa: "100200303", telefone: "(67) 98333-4455", remessa: "REM-003/ABRIL", created_at: new Date().toISOString() }
];

const SEED_DECLARACOES: Declaracao[] = [
  {
    id: "decl-0109-2026",
    numero: "0109/2026",
    ano: 2026,
    data_emissao: "2026-09-14",
    procurador_nome: "REGINALDO DE SOUZA SANTOS",
    procurador_cpf: "36956201291",
    procurador_telefone: "93992912928",
    procurador_endereco: "Campo Verde, MT, 78840-000, Brasil",
    texto_declaracao: "Declaro, para fins administrativos, que recebi nesta agência, a Carteira Nacional de Habilitação, ou as Carteiras Nacionais de Habilitação, do(s) condutor(es) abaixo identificado(s), assumindo a responsabilidade por sua entrega ao(s) respectivo(s) destinatário(s).",
    condutores: [
      {
        item: 1,
        nome: "MAIARA AMORIM SANTOS",
        cpf: "02633555276",
        pa: "7849102"
      }
    ],
    cidade: "Itaituba",
    uf: "PA",
    gerente_nome: "Zedequias Carlos de Melo",
    gerente_cargo: "Gerente DETRAN",
    gerente_unidade: "ITAITUBA-PA",
    gerente_portaria: "Portaria 1.083/2025 - CCG",
    usuario_id: "admin",
    usuario_nome: "Agente DETRAN",
    created_at: "2026-09-14T11:31:23.000Z"
  }
];

const SEED_LOTES: Lote[] = [
  {
    id: "lote-seed-142",
    numero: 142,
    data_recebimento: "2026-09-10",
    documentos_impressos: 48,
    pdf_nome: "Lote_142_Remessa_Detran.pdf",
    pdf_tamanho: 245800,
    observacao: "Remessa oficial recebida da sede regional - Malote A",
    usuario_id: "admin",
    usuario_nome: "Agente DETRAN",
    created_at: "2026-09-10T10:15:00.000Z"
  },
  {
    id: "lote-seed-143",
    numero: 143,
    data_recebimento: "2026-09-12",
    documentos_impressos: 65,
    pdf_nome: "Lote_143_Expedicao_Capital.pdf",
    pdf_tamanho: 312400,
    observacao: "CNHs de primeira habilitação e renovações ordinárias",
    usuario_id: "admin",
    usuario_nome: "Agente DETRAN",
    created_at: "2026-09-12T14:30:00.000Z"
  },
  {
    id: "lote-seed-144",
    numero: 144,
    data_recebimento: "2026-09-14",
    documentos_impressos: 32,
    observacao: "Lote recebido nesta manhã via SEDEX / Malote postal",
    usuario_id: "admin",
    usuario_nome: "Agente DETRAN",
    created_at: "2026-09-14T09:00:00.000Z"
  }
];

const SEED_GERAL: GeralCNH[] = cnhSeedData as GeralCNH[];

const SEED_HISTORICO: HistoricoMovimentacao[] = [
  {
    id: "hist-01",
    geral_id: "cnh-03",
    geral_ordem: 3,
    geral_nome: "Carlos Alberto Albuquerque",
    situacao_anterior: "Remetida",
    situacao_nova: "Recebida",
    usuario_id: "22222222-2222-2222-2222-222222222222",
    usuario_nome: "Fernanda Souza",
    observacao: "CNH Recebida na Agência e alocada em Gaveta 1 Repartição 3",
    data_hora: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: "hist-02",
    geral_id: "cnh-05",
    geral_ordem: 5,
    geral_nome: "Eduardo Henrique Gonzaga",
    situacao_anterior: "Recebida",
    situacao_nova: "Entregue",
    responsavel_id: "00000000-0000-0000-0000-000000000001",
    responsavel_nome: "Proprietário",
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    observacao: "Retirada efetuada pelo titular no guichê",
    data_hora: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

const SEED_AUDITORIA: Auditoria[] = [
  {
    id: "aud-01",
    tabela: "memorandos",
    registro_id: "MEMO-2026/042",
    acao: "Remessa",
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    data_hora: new Date(Date.now() - 5 * 86400000).toISOString(),
    ip: "10.0.1.15",
    valores_novos: { status: "Remetido", total_cnhs: 2 }
  },
  {
    id: "aud-02",
    tabela: "geral",
    registro_id: "Ordem #3",
    acao: "Recebimento",
    usuario_id: "22222222-2222-2222-2222-222222222222",
    usuario_nome: "Fernanda Souza",
    data_hora: new Date(Date.now() - 2 * 86400000).toISOString(),
    ip: "10.0.1.20",
    valores_novos: { situacao: "Recebida", gaveta: "Gaveta 1", reparticao: "Repartição 3" }
  },
  {
    id: "aud-03",
    tabela: "geral",
    registro_id: "Ordem #5",
    acao: "Entrega",
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    data_hora: new Date(Date.now() - 1 * 86400000).toISOString(),
    ip: "10.0.1.15",
    valores_novos: { situacao: "Entregue", responsavel: "Proprietário" }
  }
];

// Store em memória para suportar grandes volumes (ex: >8000 CNHs) que excedem a cota de ~5MB do localStorage
const memoryStore: Record<string, any[]> = {};

// Suporte a IndexedDB nativo do navegador para persistência de grandes volumes offline
const DB_NAME = "DetranCNH_DB";
const STORE_NAME = "kv_store";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getIDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB não suportado neste ambiente"));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet(key: string, val: any): Promise<void> {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(val, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Aviso ao salvar no IndexedDB:", err);
  }
}

let isIdbInitialized = false;
export async function initStorage(force = false): Promise<void> {
  if (isIdbInitialized && !force) return;
  const keys = [
    "usuarios", "responsaveis", "memorandos", "candidatos", "geral", "historico", "auditoria", "mapeamento", "declaracoes", "lotes", "imagens",
    "deleted_memorandos", "deleted_candidatos", "deleted_geral", "deleted_responsaveis", "deleted_declaracoes", "deleted_lotes"
  ];
  for (const k of keys) {
    try {
      const idbVal = await idbGet<any[]>(`detran_cnh_${k}`);
      if (idbVal && Array.isArray(idbVal) && idbVal.length > 0) {
        memoryStore[k] = idbVal;
      }
    } catch (e) {
      console.warn(`Aviso ao carregar ${k} do IndexedDB:`, e);
    }
  }

  // Carregar também logs do cidadão se persistidos em IndexedDB
  try {
    const idbAcessos = await idbGet<any[]>("detran_acessos_cidadao_logs");
    if (idbAcessos && Array.isArray(idbAcessos) && idbAcessos.length > 0) {
      memoryStore["acessos_cidadao"] = idbAcessos;
    }
  } catch (e) {
    console.warn("Aviso ao carregar logs de cidadão do IndexedDB:", e);
  }

  isIdbInitialized = true;
}

// Helper para obter/salvar com cache em memória e IndexedDB + LocalStorage
export function getStoredList<T extends { id?: string }>(key: string, seed: T[]): T[] {
  const deletedIds = getDeletedIds(key);
  let list: T[] = [];

  if (memoryStore[key] && Array.isArray(memoryStore[key])) {
    list = memoryStore[key] as T[];
  } else {
    try {
      const storageKey = `detran_cnh_${key}`;
      const raw = localStorage.getItem(storageKey);

      if (!raw) {
        list = seed;
        memoryStore[key] = seed;
        saveStoredList(key, seed);
      } else {
        let parsed: T[] = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          list = seed;
          saveStoredList(key, list);
        } else {
          list = parsed;
          memoryStore[key] = parsed;
        }
      }
    } catch {
      list = seed;
      memoryStore[key] = seed;
    }
  }

  // Garantir remoção permanente de qualquer ID marcado como excluído
  if (deletedIds.size > 0) {
    return list.filter((item) => !item.id || !deletedIds.has(item.id));
  }
  return list;
}

export function saveStoredList<T>(key: string, data: T[]): void {
  memoryStore[key] = data;
  idbSet(`detran_cnh_${key}`, data).catch(() => {});
  try {
    localStorage.setItem(`detran_cnh_${key}`, JSON.stringify(data));
  } catch (err) {
    // Erro de cota excedida do localStorage ignorado graciosamente pois memoryStore + IndexedDB possuem os dados
  }
}

function getDeletedIds(key: string): Set<string> {
  const storeKey = `deleted_${key}`;
  if (memoryStore[storeKey] && Array.isArray(memoryStore[storeKey])) {
    return new Set(memoryStore[storeKey]);
  }

  try {
    const storageKey = `detran_cnh_deleted_${key}`;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryStore[storeKey] = parsed;
        return new Set(parsed);
      }
    }
  } catch {}
  return new Set();
}

function addDeletedId(key: string, id: string): void {
  if (!id) return;
  try {
    const set = getDeletedIds(key);
    set.add(id);
    const arr = Array.from(set);
    const storeKey = `deleted_${key}`;
    memoryStore[storeKey] = arr;

    const storageKey = `detran_cnh_deleted_${key}`;
    idbSet(storageKey, arr).catch(() => {});
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(arr));
    }
  } catch {}
}

export function resetDemoData(): void {
  for (const k of Object.keys(memoryStore)) {
    delete memoryStore[k];
  }
  const keys = ["usuarios", "responsaveis", "memorandos", "candidatos", "geral", "historico", "auditoria", "mapeamento", "declaracoes"];
  for (const k of keys) {
    idbSet(`detran_cnh_${k}`, null).catch(() => {});
  }
  localStorage.setItem("detran_cnh_usuarios", JSON.stringify(SEED_USUARIOS));
  localStorage.setItem("detran_cnh_responsaveis", JSON.stringify(SEED_RESPONSAVEIS));
  localStorage.setItem("detran_cnh_memorandos", JSON.stringify(SEED_MEMORANDOS));
  localStorage.setItem("detran_cnh_candidatos", JSON.stringify(SEED_CANDIDATOS));
  localStorage.setItem("detran_cnh_geral", JSON.stringify(SEED_GERAL));
  localStorage.setItem("detran_cnh_historico", JSON.stringify(SEED_HISTORICO));
  localStorage.setItem("detran_cnh_auditoria", JSON.stringify(SEED_AUDITORIA));
  localStorage.setItem("detran_cnh_mapeamento", JSON.stringify(SEED_MAPEAMENTO));
  localStorage.setItem("detran_cnh_declaracoes", JSON.stringify(SEED_DECLARACOES));
}

// Inicializar store local caso não exista
getStoredList("usuarios", SEED_USUARIOS);
getStoredList("responsaveis", SEED_RESPONSAVEIS);
getStoredList("memorandos", SEED_MEMORANDOS);
getStoredList("candidatos", SEED_CANDIDATOS);
getStoredList("geral", SEED_GERAL);
getStoredList("historico", SEED_HISTORICO);
getStoredList("auditoria", SEED_AUDITORIA);
getStoredList("mapeamento", SEED_MAPEAMENTO);
getStoredList("declaracoes", SEED_DECLARACOES);

// ============================================================================
// SERVIÇOS DE AUDITORIA E HISTÓRICO INTERNOS
// ==============================================================================

export async function logAuditoria(
  tabela: string,
  registro_id: string,
  acao: AcaoAuditoria,
  usuario_id: string,
  usuario_nome?: string,
  valores_anteriores?: any,
  valores_novos?: any
): Promise<void> {
  const list = getStoredList<Auditoria>("auditoria", SEED_AUDITORIA);
  const nova: Auditoria = {
    id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    tabela,
    registro_id: String(registro_id),
    acao,
    usuario_id,
    usuario_nome: usuario_nome || "Usuário do Sistema",
    data_hora: new Date().toISOString(),
    ip: "127.0.0.1",
    valores_anteriores: valores_anteriores || null,
    valores_novos: valores_novos || null
  };
  saveStoredList("auditoria", [nova, ...list]);
  notifyDataSync("auditoria");

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("auditoria").insert([{
        id: nova.id,
        tabela: nova.tabela,
        registro_id: nova.registro_id,
        acao: nova.acao,
        usuario_id: nova.usuario_id || null,
        usuario_nome: nova.usuario_nome,
        data_hora: nova.data_hora,
        ip: nova.ip,
        valores_anteriores: nova.valores_anteriores,
        valores_novos: nova.valores_novos
      }]);
    } catch (e) {
      console.warn("Aviso ao salvar auditoria no Supabase:", e);
    }
  }
}

export async function logHistorico(
  geral_id: string,
  geral_ordem: number,
  geral_nome: string,
  situacao_anterior: SituacaoGeral | null,
  situacao_nova: SituacaoGeral,
  usuario_id: string,
  usuario_nome: string,
  observacao?: string,
  responsavel_id?: string,
  responsavel_nome?: string,
  geral_cpf?: string
): Promise<void> {
  const list = getStoredList<HistoricoMovimentacao>("historico", SEED_HISTORICO);
  const novo: HistoricoMovimentacao = {
    id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    geral_id,
    geral_ordem,
    geral_nome,
    geral_cpf,
    situacao_anterior,
    situacao_nova,
    responsavel_id,
    responsavel_nome,
    usuario_id,
    usuario_nome,
    observacao,
    data_hora: new Date().toISOString()
  };
  saveStoredList("historico", [novo, ...list]);
  notifyDataSync("historico");

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("historico_movimentacoes").insert([{
        id: novo.id,
        geral_id: novo.geral_id,
        geral_ordem: novo.geral_ordem,
        geral_nome: novo.geral_nome,
        situacao_anterior: novo.situacao_anterior,
        situacao_nova: novo.situacao_nova,
        responsavel_id: novo.responsavel_id || null,
        responsavel_nome: novo.responsavel_nome || null,
        usuario_id: novo.usuario_id || null,
        usuario_nome: novo.usuario_nome || null,
        observacao: novo.observacao || null,
        data_hora: novo.data_hora
      }]);
    } catch (e) {
      console.warn("Aviso ao salvar histórico no Supabase:", e);
    }
  }
}

// ============================================================================
// MÓDULO DE MAPEAMENTO DE LOCALIZAÇÃO (Gaveta & Repartição)
// ============================================================================

export async function getMapeamentos(): Promise<MapeamentoLocalizacao[]> {
  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<MapeamentoLocalizacao>("mapeamento_localizacao", 1000, "inicial", true);
      if (data && Array.isArray(data)) {
        saveStoredList("mapeamento", data);
        return data;
      }
    } catch (err) {
      console.warn("Aviso ao buscar mapeamentos no Supabase:", err);
    }
  }
  return getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO).sort((a, b) =>
    a.inicial.localeCompare(b.inicial)
  );
}

export async function createMapeamento(
  inicial: string,
  gaveta: string,
  reparticao: string,
  userId: string = "admin",
  userNome: string = "Agente DETRAN"
): Promise<MapeamentoLocalizacao> {
  const list = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
  const letter = inicial.trim().toUpperCase();
  const existing = list.find((m) => m.inicial.toUpperCase() === letter);
  if (existing) {
    throw new Error(`O mapeamento para a inicial "${letter}" já existe.`);
  }
  const novo: MapeamentoLocalizacao = {
    id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    inicial: letter,
    gaveta: gaveta.trim(),
    reparticao: reparticao.trim(),
    ativo: true,
  };

  if (isSupabaseConfigured()) {
    try {
      const { data: inserted, error } = await supabase.from("mapeamento_localizacao").insert([novo]).select().single();
      if (!error && inserted) {
        const updatedList = [...list, inserted].sort((a, b) => a.inicial.localeCompare(b.inicial));
        saveStoredList("mapeamento", updatedList);
        notifyDataSync("mapeamento");
        await logAuditoria("mapeamento", inserted.id, "Inclusão", userId, userNome, null, inserted);
        return inserted as MapeamentoLocalizacao;
      }
    } catch (e) {
      console.warn("Aviso ao criar mapeamento no Supabase:", e);
    }
  }

  const updatedList = [...list, novo].sort((a, b) => a.inicial.localeCompare(b.inicial));
  saveStoredList("mapeamento", updatedList);
  notifyDataSync("mapeamento");
  await logAuditoria("mapeamento", novo.id, "Inclusão", userId, userNome, null, novo);
  return novo;
}

export async function updateMapeamento(
  id: string,
  gaveta: string,
  reparticao: string,
  userId: string = "admin",
  userNome: string = "Agente DETRAN"
): Promise<void> {
  const list = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
  const target = list.find((m) => m.id === id);
  if (!target) return;
  const atualizado = { ...target, gaveta, reparticao };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("mapeamento_localizacao").update({ gaveta, reparticao }).eq("id", id);
    } catch (e) {
      console.warn("Aviso ao atualizar mapeamento no Supabase:", e);
    }
  }

  const updated = list.map((m) => (m.id === id ? atualizado : m));
  saveStoredList("mapeamento", updated);
  notifyDataSync("mapeamento");
  await logAuditoria("mapeamento", target.id, "Alteração", userId, userNome, target, atualizado);
}

export async function deleteMapeamento(
  id: string,
  userId: string = "admin",
  userNome: string = "Agente DETRAN"
): Promise<void> {
  const list = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
  const target = list.find((m) => m.id === id);
  if (!target) return;

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("mapeamento_localizacao").delete().eq("id", id);
    } catch (e) {
      console.warn("Aviso ao deletar mapeamento no Supabase:", e);
    }
  }

  const updated = list.filter((m) => m.id !== id);
  saveStoredList("mapeamento", updated);
  notifyDataSync("mapeamento");
  await logAuditoria("mapeamento", target.id, "Exclusão", userId, userNome, target, null);
}

export async function findLocalizacaoPorNome(nome: string): Promise<{ gaveta: string; reparticao: string }> {
  const char = getInitialChar(nome);
  const list = await getMapeamentos();
  const mapeamento = list.find((m) => m.inicial.toUpperCase() === char && m.ativo);
  if (mapeamento) {
    return { gaveta: mapeamento.gaveta, reparticao: mapeamento.reparticao };
  }
  return { gaveta: "Vazio", reparticao: "Vazio" };
}

// ============================================================================
// MÓDULO DE USUÁRIOS
// ============================================================================

export function repairCorruptedUsuarios(users: Usuario[]): { users: Usuario[]; repairedCount: number } {
  let repairedCount = 0;
  const seedMap = new Map<string, Usuario>(SEED_USUARIOS.map((u) => [u.id, u]));

  const repaired = users.map((u) => {
    // Detecta e-mail corrompido com @detran.local ou login alterado para UUID sanitizado
    const isCorruptedEmail = !!(
      u.email &&
      u.email.endsWith("@detran.local") &&
      !["sistema@detran.local", "admin@detran.local"].includes(u.email)
    );
    const isCorruptedLogin = !!(
      u.login &&
      u.id &&
      u.login.toLowerCase() === u.id.toLowerCase().replace(/[^a-z0-9]/g, "")
    );

    if (isCorruptedEmail || isCorruptedLogin) {
      const seedUser = seedMap.get(u.id);
      if (seedUser) {
        repairedCount++;
        return {
          ...u,
          nome: seedUser.nome,
          nome_curto: seedUser.nome_curto || seedUser.nome,
          nome_completo: seedUser.nome,
          email: seedUser.email,
          login: seedUser.login,
          senha: u.senha && u.senha !== "detran@123" ? u.senha : seedUser.senha,
          perfil: seedUser.perfil || u.perfil || "Operador",
          permissoes: seedUser.permissoes || u.permissoes || getPermissoesPadrao("Operador")
        };
      } else {
        if (isCorruptedEmail) {
          repairedCount++;
          const cleanName = (u.nome_curto || u.nome || "usuario").toLowerCase().replace(/[^a-z0-9]/g, "");
          return {
            ...u,
            login: isCorruptedLogin ? cleanName : u.login,
            email: `${cleanName}@detran.pa.gov.br`
          };
        }
      }
    }
    return u;
  });

  return { users: repaired, repairedCount };
}

export async function getUsuarios(): Promise<Usuario[]> {
  const deletedIds = getDeletedIds("usuarios");

  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Usuario>("usuarios", 1000, "created_at", false);
      if (data && Array.isArray(data)) {
        const activeUsers = data.filter((u) => u.ativo !== false && !deletedIds.has(u.id));
        const { users: sanitizedUsers, repairedCount } = repairCorruptedUsuarios(activeUsers);
        saveStoredList("usuarios", sanitizedUsers);
        if (repairedCount > 0) {
          // Corrige imediatamente no Supabase para restaurar os e-mails e logins originais no banco remoto
          const payloadToFix = sanitizedUsers.map((u) => ({
            id: u.id,
            nome: u.nome,
            nome_curto: u.nome_curto || u.nome,
            email: u.email,
            login: u.login,
            senha: u.senha || "detran@123",
            perfil: u.perfil || "Operador",
            permissoes: u.permissoes || getPermissoesPadrao("Operador"),
            ativo: u.ativo !== false,
            created_at: u.created_at || new Date().toISOString()
          }));
          upsertInBatches("usuarios", payloadToFix, 100, "id").catch((e) =>
            console.warn("Erro ao atualizar usuários reparados no Supabase:", e)
          );
        }
        return sanitizedUsers;
      }
    } catch (err) {
      console.warn("Aviso ao buscar usuários do Supabase, caindo para local:", err);
    }
  }
  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const { users: sanitizedLocal, repairedCount: localRepaired } = repairCorruptedUsuarios(localList);
  if (localRepaired > 0) {
    saveStoredList("usuarios", sanitizedLocal);
  }
  return sanitizedLocal.filter((u) => u.ativo !== false && !deletedIds.has(u.id));
}

export async function createUsuario(data: Omit<Usuario, "id" | "created_at">, adminId: string, adminNome: string): Promise<Usuario> {
  const list = await getUsuarios();
  if (list.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
    throw new Error("Já existe um usuário com este e-mail.");
  }
  if (list.some((u) => u.login.toLowerCase() === data.login.toLowerCase())) {
    throw new Error("Já existe um usuário com este login.");
  }

  const newUuid = crypto.randomUUID();
  const novo: Usuario = {
    ...data,
    id: newUuid,
    senha: data.senha || "detran@123",
    permissoes: data.permissoes || getPermissoesPadrao(data.perfil),
    created_at: new Date().toISOString(),
    ativo: data.ativo !== false
  };

  if (isSupabaseConfigured()) {
    try {
      const userPayload = {
        id: novo.id,
        nome: novo.nome,
        nome_curto: novo.nome_curto,
        fone: novo.fone || null,
        email: novo.email,
        funcao: novo.funcao || null,
        setor: novo.setor || "Protocolo",
        login: novo.login,
        senha: novo.senha,
        permissoes: novo.permissoes,
        perfil: novo.perfil,
        ativo: novo.ativo,
        created_at: novo.created_at
      };

      const { data: inserted, error } = await supabase.from("usuarios").insert([userPayload]).select().single();
      if (error) {
        console.error("Erro do Supabase ao cadastrar usuário:", error);
        throw new Error(`Erro no Supabase: ${error.message}`);
      }
      if (inserted) {
        const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
        saveStoredList("usuarios", [inserted as Usuario, ...localList.filter(u => u.id !== inserted.id)]);
        notifyDataSync("usuarios");
        await logAuditoria("usuarios", inserted.login, "Inclusão", adminId, adminNome, null, { nome: inserted.nome, perfil: inserted.perfil });
        return inserted as Usuario;
      }
    } catch (err: any) {
      console.error("Falha ao salvar usuário no Supabase:", err);
      if (err.message && err.message.startsWith("Erro no Supabase")) {
        throw err;
      }
    }
  }

  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  saveStoredList("usuarios", [...localList, novo]);
  notifyDataSync("usuarios");
  await logAuditoria("usuarios", novo.login, "Inclusão", adminId, adminNome, null, { nome: novo.nome, perfil: novo.perfil });
  return novo;
}

export async function updateUsuario(id: string, data: Partial<Usuario>, adminId: string, adminNome: string): Promise<Usuario> {
  const list = await getUsuarios();
  const index = list.findIndex((u) => u.id === id);
  if (index === -1) throw new Error("Usuário não encontrado");
  const ant = list[index];
  const atualizado = { ...ant, ...data };

  if (isSupabaseConfigured()) {
    try {
      // Filtra apenas as colunas válidas que existem na tabela 'usuarios' do Supabase
      const allowedKeys = [
        "nome", "nome_curto", "fone", "email", "funcao", "setor",
        "login", "senha", "permissoes", "perfil", "ativo"
      ];
      const updatePayload: Record<string, any> = {};
      for (const key of allowedKeys) {
        if ((data as any)[key] !== undefined) {
          updatePayload[key] = (data as any)[key];
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        const { data: updatedSup, error } = await supabase
          .from("usuarios")
          .update(updatePayload)
          .eq("id", id)
          .select()
          .maybeSingle();

        if (error) {
          console.warn("Aviso do Supabase ao atualizar usuário:", error.message);
        } else if (updatedSup) {
          Object.assign(atualizado, updatedSup);
        }
      }
    } catch (err: any) {
      console.warn("Falha ao atualizar usuário no Supabase, mantendo dados locais:", err);
    }
  }

  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const lIndex = localList.findIndex((u) => u.id === id);
  if (lIndex !== -1) localList[lIndex] = atualizado;
  else localList.push(atualizado);
  saveStoredList("usuarios", localList);
  notifyDataSync("usuarios");

  await logAuditoria("usuarios", ant.login, "Alteração", adminId, adminNome, ant, atualizado);
  return atualizado;
}

export async function deleteUsuario(id: string, adminId?: string, adminNome?: string): Promise<void> {
  const list = await getUsuarios();
  const target = list.find((u) => u.id === id);

  if (target?.login === "admin") {
    throw new Error("O Administrador principal não pode ser excluído.");
  }

  // 1. Desvincula chaves estrangeiras no Supabase para permitir exclusão sem violação de FK
  if (isSupabaseConfigured()) {
    try {
      await supabase.from("geral_cnhs").update({ usuario_id: null }).eq("usuario_id", id);
      await supabase.from("memorandos").update({ usuario_id: null }).eq("usuario_id", id);
      await supabase.from("historico").update({ usuario_id: null }).eq("usuario_id", id);
      await supabase.from("candidatos").update({ usuario_id: null }).eq("usuario_id", id);

      const { error } = await supabase.from("usuarios").delete().eq("id", id);
      if (error) {
        console.warn("Aviso no Supabase ao deletar usuário (inativando para preservar integridade):", error.message);
        await supabase.from("usuarios").update({ ativo: false }).eq("id", id);
      }
    } catch (err: any) {
      console.warn("Falha ao deletar no Supabase, mantendo exclusão local:", err);
      try {
        await supabase.from("usuarios").update({ ativo: false }).eq("id", id);
      } catch {}
    }
  }

  // 2. Registra o ID nos eliminados permanentes (impede retorno via semente/cache)
  addDeletedId("usuarios", id);

  // 3. Atualiza memória e armazenamento local
  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const filtrados = localList.filter((u) => u.id !== id);
  saveStoredList("usuarios", filtrados);
  notifyDataSync("usuarios");

  // 4. Auditoria
  const effAdminId = adminId || "sistema";
  const effAdminNome = adminNome || "Administrador";
  await logAuditoria("usuarios", target ? target.login : id, "Exclusão", effAdminId, effAdminNome, target || null, null);
}

export async function restaurarCredenciaisOficiais(): Promise<{ count: number }> {
  const usuarios = await getUsuarios();
  const seedMap = new Map<string, Usuario>(SEED_USUARIOS.map((u) => [u.id, u]));
  let count = 0;
  const updatedList = usuarios.map((u) => {
    const seed = seedMap.get(u.id);
    if (seed) {
      count++;
      return {
        ...u,
        nome: seed.nome,
        nome_curto: seed.nome_curto || seed.nome,
        email: seed.email,
        login: seed.login,
        perfil: seed.perfil,
        permissoes: seed.permissoes,
        senha: u.senha && u.senha !== "detran@123" ? u.senha : seed.senha
      };
    }
    return u;
  });
  saveStoredList("usuarios", updatedList);
  if (isSupabaseConfigured()) {
    const payload = updatedList.map((u) => ({
      id: u.id,
      nome: u.nome,
      nome_curto: u.nome_curto || u.nome,
      email: u.email,
      login: u.login,
      senha: u.senha || "detran@123",
      perfil: u.perfil || "Operador",
      permissoes: u.permissoes || getPermissoesPadrao("Operador"),
      ativo: u.ativo !== false,
      created_at: u.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    await upsertInBatches("usuarios", payload, 100, "id");
  }
  notifyDataSync("usuarios");
  return { count };
}

// ============================================================================
// MÓDULO DE RESPONSÁVEIS
// ============================================================================
// RESPONSÁVEIS - DEDUPLICAÇÃO, VALIDAÇÃO E CRUD
// ============================================================================

export const CANONICAL_PROPRIETARIO_ID = "a0000000-0000-0000-0000-000000000001";

export function isProprietarioRecord(r?: { id?: string; nome?: string; cpf?: string } | null): boolean {
  if (!r) return false;
  const id = r.id || "";
  const nomeNorm = (r.nome || "").toLowerCase().trim();
  const cpfDigits = (r.cpf || "").replace(/\D/g, "");
  return (
    id === CANONICAL_PROPRIETARIO_ID ||
    id === "e2335b1e" ||
    nomeNorm === "proprietario" ||
    nomeNorm === "proprietário" ||
    nomeNorm === "proprietario(a)" ||
    nomeNorm === "proprietário(a)" ||
    r.cpf === "000.000.000-00" ||
    cpfDigits === "00000000000" ||
    cpfDigits === "00"
  );
}

export function deduplicateResponsaveisList(list: Responsavel[]): {
  cleaned: Responsavel[];
  duplicateIds: string[];
  idMap: Map<string, string>;
} {
  const duplicateIds: string[] = [];
  const idMap = new Map<string, string>();

  const proprietarioRecords = list.filter(isProprietarioRecord);
  const otherRecords = list.filter((r) => !isProprietarioRecord(r));

  // 1. Unificar todos os registros de Proprietário em um único registro canônico
  const canonicalProprietario: Responsavel = {
    id: CANONICAL_PROPRIETARIO_ID,
    nome: "PROPRIETÁRIO",
    tipo: "Titular",
    registro: "",
    cpf: "000.000.000-00",
    telefone: "(93) 00000-0000",
    observacao: "Registro padrão intransferível para entrega ao próprio titular da CNH",
    ativo: true,
    created_at: proprietarioRecords[0]?.created_at || new Date(Date.now() - 60 * 86400000).toISOString()
  };

  proprietarioRecords.forEach((r) => {
    if (r.id !== CANONICAL_PROPRIETARIO_ID) {
      duplicateIds.push(r.id);
      idMap.set(r.id, CANONICAL_PROPRIETARIO_ID);
    }
  });
  idMap.set("e2335b1e", CANONICAL_PROPRIETARIO_ID);

  // 2. Deduplicar e mesclar os demais responsáveis por Nome, CPF e Telefone (nomes sempre em caixa alta)
  const cleanedOthers: Responsavel[] = [];
  const seenCpfs = new Map<string, Responsavel>();
  const seenTels = new Map<string, Responsavel>();
  const seenNomes = new Map<string, Responsavel>();

  for (const item of otherRecords) {
    const uppercaseNome = (item.nome || "").trim().toUpperCase();
    const cleanCpf = (item.cpf || "").replace(/\D/g, "");
    const cleanTel = (item.telefone || "").replace(/\D/g, "");
    const cleanNome = normalizeSearch(uppercaseNome);

    // Infere ou padroniza o tipo
    let tipo: "Titular" | "Despachante" | "Procurador" = item.tipo || "Despachante";
    if (!item.tipo) {
      if (uppercaseNome.includes("PROCURADOR") || uppercaseNome.includes("PROCURAÇÃO") || uppercaseNome.includes("ESPOSA")) {
        tipo = "Procurador";
      } else {
        tipo = "Despachante";
      }
    }

    item.nome = uppercaseNome;
    item.tipo = tipo;

    const masterByNome = cleanNome ? seenNomes.get(cleanNome) : undefined;
    const masterByCpf = cleanCpf && (cleanCpf.length === 11 || cleanCpf.length === 14) ? seenCpfs.get(cleanCpf) : undefined;
    const masterByTel = cleanTel && cleanTel.length >= 10 ? seenTels.get(cleanTel) : undefined;

    const master = masterByNome || masterByCpf || masterByTel;

    if (master) {
      duplicateIds.push(item.id);
      idMap.set(item.id, master.id);
      if (!master.tipo && item.tipo) master.tipo = item.tipo;
      if (!master.observacao && item.observacao) master.observacao = item.observacao;
      if ((!master.telefone || master.telefone.length < 8) && item.telefone) master.telefone = item.telefone;
      if ((!master.cpf || master.cpf.length < 11) && item.cpf) master.cpf = item.cpf;
    } else {
      if (cleanCpf && (cleanCpf.length === 11 || cleanCpf.length === 14)) seenCpfs.set(cleanCpf, item);
      if (cleanTel && cleanTel.length >= 10) seenTels.set(cleanTel, item);
      if (cleanNome) seenNomes.set(cleanNome, item);
      cleanedOthers.push(item);
    }
  }

  const cleaned = [canonicalProprietario, ...cleanedOthers];
  return { cleaned, duplicateIds, idMap };
}

export const KNOWN_DESPACHANTE_ORDERS = new Map<number, { id: string; nome: string }>([
  [748, { id: "bb95cdf5", nome: "WALTER DESPACHANTE" }],
  [757, { id: "527d4682", nome: "ELIONAI DESPACHANTE" }],
  [762, { id: "5c4f215f", nome: "GILMAR DESPACHANTE" }],
  [769, { id: "ee175176", nome: "TULA DESPACHANTE" }],
  [770, { id: "39de40af", nome: "BRIZOLA AUTO ESCOLA" }],
  [782, { id: "0db81080", nome: "REGIS" }],
  [786, { id: "1f3d321e", nome: "MOISES DESPACAHNTE" }],
  [791, { id: "ee175176", nome: "TULA DESPACHANTE" }],
  [795, { id: "fa41cde8", nome: "ARY DESPACHANTE" }],
  [804, { id: "0db81080", nome: "REGIS" }],
  [811, { id: "fa41cde8", nome: "ARY DESPACHANTE" }],
  [813, { id: "ee175176", nome: "TULA DESPACHANTE" }],
  [817, { id: "868e33c3", nome: "WANDERLEIA DE SENA" }],
  [1356, { id: "ee175176", nome: "TULA DESPACHANTE" }],
  [1384, { id: "402ee83c", nome: "BAMBAM DESPACHANTE" }],
  [1387, { id: "fa1481d9", nome: "ESPOSA" }],
  [1424, { id: "2995c099", nome: "ADAO DA ROSA NETO" }],
  [1431, { id: "402ee83c", nome: "BAMBAM DESPACHANTE" }],
  [1442, { id: "b1597c81", nome: "PIERRE DESPACHANTE" }],
  [1449, { id: "ee175176", nome: "TULA DESPACHANTE" }],
  [1452, { id: "ee175176", nome: "TULA DESPACHANTE" }]
]);

export interface DuplicateGroupPreview {
  nome: string;
  master: Responsavel;
  duplicates: Responsavel[];
  reason: string;
  affectedCnhsCount: number;
}

export interface MergePreviewData {
  totalResponsaveis: number;
  remainingCount: number;
  duplicateGroups: DuplicateGroupPreview[];
  totalDuplicates: number;
  totalEntregues: number;
  cnhsWithDespachante: number;
  cnhsWithProprietario: number;
  isSupabaseConfigured: boolean;
}

/**
 * Realiza uma simulação/diagnóstico seguro sem alterar os dados, preparando os dados para o modal de checagem
 */
export async function previewMergeResponsaveis(): Promise<MergePreviewData> {
  const currentList = await getResponsaveis();
  const cnhs = await getLocalGeralCNHs();
  const totalEntregues = cnhs.filter((c) => c.situacao === "Entregue").length;

  const { cleaned, duplicateIds, idMap } = deduplicateResponsaveisList(currentList);

  const groupsByMasterId = new Map<string, DuplicateGroupPreview>();

  cleaned.forEach((master) => {
    groupsByMasterId.set(master.id, {
      nome: master.nome,
      master,
      duplicates: [],
      reason: isProprietarioRecord(master) ? "Titular / Proprietário Padrão" : "Nome / CPF / Telefone Idênticos",
      affectedCnhsCount: 0
    });
  });

  currentList.forEach((r) => {
    if (duplicateIds.includes(r.id)) {
      const masterId = idMap.get(r.id);
      if (masterId && groupsByMasterId.has(masterId)) {
        groupsByMasterId.get(masterId)!.duplicates.push(r);
      }
    }
  });

  cnhs.forEach((c) => {
    if (c.responsavel_id) {
      const canonical = idMap.get(c.responsavel_id) || c.responsavel_id;
      if (groupsByMasterId.has(canonical)) {
        groupsByMasterId.get(canonical)!.affectedCnhsCount++;
      }
    }
  });

  const duplicateGroups = Array.from(groupsByMasterId.values()).filter((g) => g.duplicates.length > 0);

  let cnhsWithDespachante = 0;
  let cnhsWithProprietario = 0;
  cnhs.forEach((c) => {
    if (c.situacao === "Entregue") {
      const rid = c.responsavel_id ? (idMap.get(c.responsavel_id) || c.responsavel_id) : "";
      if (rid && rid !== CANONICAL_PROPRIETARIO_ID && rid !== "e2335b1e") {
        cnhsWithDespachante++;
      } else {
        cnhsWithProprietario++;
      }
    }
  });

  return {
    totalResponsaveis: currentList.length,
    remainingCount: cleaned.length,
    duplicateGroups,
    totalDuplicates: duplicateIds.length,
    totalEntregues,
    cnhsWithDespachante,
    cnhsWithProprietario,
    isSupabaseConfigured: isSupabaseConfigured()
  };
}

/**
 * Restaura e sincroniza integralmente as informações de gaveta, repartição, responsavel_id e responsavel_nome no banco de dados e localmente
 */
export async function restoreResponsaveisInfoAndDatabase(
  onLog?: (msg: string) => void
): Promise<{
  restoredCnhsCount: number;
  proprietarioCnhsCount: number;
  despachanteCnhsCount: number;
  responsaveisCount: number;
  gavetasReparadasCount: number;
  cpfsReparadosCount: number;
  usuariosReparadosCount: number;
  supabaseSynced: boolean;
}> {
  const log = (m: string) => {
    if (onLog) onLog(m);
    console.log(`[RESTORE_DB] ${m}`);
  };

  log("Iniciando restauração integral dos dados anteriores: Gavetas, Repartições, Responsáveis e vínculos de CNHs...");

  // 1. Assegura lista canônica e completa de responsáveis (incorporando todos os registros originais da semente)
  let rawResp: Responsavel[] = [];
  if (isSupabaseConfigured()) {
    try {
      const supResp = await fetchAllRowsFromSupabase<Responsavel>("responsaveis", 1000, "nome", true);
      if (supResp && supResp.length > 0) rawResp = supResp;
    } catch {}
  }
  if (rawResp.length === 0) {
    rawResp = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  }

  // Mescla responsáveis da semente que possam ter sido excluídos acidentalmente
  const existingRespIds = new Set(rawResp.map((r) => r.id));
  const existingRespNames = new Set(rawResp.map((r) => normalizeSearch(r.nome)));
  for (const s of SEED_RESPONSAVEIS) {
    if (!existingRespIds.has(s.id) && !existingRespNames.has(normalizeSearch(s.nome))) {
      rawResp.push(s);
      existingRespIds.add(s.id);
      existingRespNames.add(normalizeSearch(s.nome));
    }
  }

  const { cleaned, idMap } = deduplicateResponsaveisList(rawResp);
  // Garante que o Proprietário canônico está na lista
  if (!cleaned.some((r) => r.id === CANONICAL_PROPRIETARIO_ID)) {
    cleaned.unshift({
      id: CANONICAL_PROPRIETARIO_ID,
      nome: "PROPRIETÁRIO",
      cpf: "000.000.000-00",
      tipo: "Titular",
      ativo: true,
      created_at: "2024-01-01T00:00:00Z"
    });
  }

  // Mapeamentos rápidos de responsáveis
  const respById = new Map<string, Responsavel>();
  const respByNorm = new Map<string, Responsavel>();
  cleaned.forEach((r) => {
    r.nome = r.nome.trim().toUpperCase();
    respById.set(r.id, r);
    const norm = normalizeSearch(r.nome);
    if (norm) respByNorm.set(norm, r);
  });

  saveStoredList("responsaveis", cleaned);

  // 2. Se Supabase estiver ativo, salva os responsáveis mestres PRIMEIRO para evitar violações de chave estrangeira
  let supabaseSynced = false;
  if (isSupabaseConfigured()) {
    try {
      log("Gravando responsáveis mestres no banco de dados Supabase...");
      const respPayloads = cleaned.map((r) => ({
        id: r.id,
        nome: r.nome,
        cpf: r.cpf || null,
        telefone: r.telefone || null,
        tipo: r.tipo || "Despachante",
        ativo: r.ativo !== false,
        created_at: r.created_at || new Date().toISOString()
      }));
      for (let i = 0; i < respPayloads.length; i += 100) {
        await supabase.from("responsaveis").upsert(respPayloads.slice(i, i + 100), { onConflict: "id" });
      }
      log(`Responsáveis mestres gravados com sucesso no Supabase (${cleaned.length} registros).`);
    } catch (sErr) {
      console.warn("Aviso ao sincronizar responsáveis no Supabase:", sErr);
    }
  }

  // 3. Lê CNHs e restaura integralmente Gaveta, Repartição, CPF, Usuário, Responsável e Vínculos
  log("Restaurando Gavetas, Repartições, CPFs, Usuários e Responsáveis em todas as CNHs...");
  const currentLocalCnhs = await getLocalGeralCNHs();
  const seedByOrdem = new Map(SEED_GERAL.map((s) => [s.ordem, s]));
  const seedById = new Map(SEED_GERAL.map((s) => [s.id, s]));
  const seedByNormNome = new Map(SEED_GERAL.map((s) => [normalizeSearch(s.nome), s]));

  // Mapa combinado de CNHs garantindo que todas as CNHs existam sem perda de campos
  const unifiedCnhsMap = new Map<number, GeralCNH>();
  
  // Primeiro coloca os dados da semente
  for (const s of SEED_GERAL) {
    unifiedCnhsMap.set(s.ordem, { ...s });
  }

  // Depois sobrepõe com registros locais existentes (preservando rigorosamente campos não-nulos)
  for (const c of currentLocalCnhs) {
    if (c.ordem) {
      const existing = unifiedCnhsMap.get(c.ordem);
      if (existing) {
        const preservedCpf = (c.cpf && c.cpf.trim() !== "") ? c.cpf : existing.cpf;
        const preservedUsrId = (c.usuario_id && c.usuario_id !== "sistema") ? c.usuario_id : existing.usuario_id;
        const preservedUsrNome = (c.usuario_nome && c.usuario_nome !== "Agente DETRAN" && c.usuario_nome !== "sistema" && c.usuario_nome !== "-")
          ? c.usuario_nome
          : existing.usuario_nome;
        const preservedGaveta = (c.gaveta && c.gaveta.trim() !== "") ? c.gaveta : existing.gaveta;
        const preservedReparticao = (c.reparticao && c.reparticao.trim() !== "") ? c.reparticao : existing.reparticao;

        unifiedCnhsMap.set(c.ordem, {
          ...existing,
          ...c,
          cpf: preservedCpf,
          usuario_id: preservedUsrId,
          usuario_nome: preservedUsrNome,
          gaveta: preservedGaveta,
          reparticao: preservedReparticao
        });
      } else {
        unifiedCnhsMap.set(c.ordem, c);
      }
    }
  }

  let restoredCnhsCount = 0;
  let gavetasReparadasCount = 0;
  let cpfsReparadosCount = 0;
  let usuariosReparadosCount = 0;
  let proprietarioCnhsCount = 0;
  let despachanteCnhsCount = 0;
  const now = new Date().toISOString();

  const cnhsToSave: GeralCNH[] = [];

  for (const c of Array.from(unifiedCnhsMap.values())) {
    const seed = seedByOrdem.get(c.ordem) || (c.id ? seedById.get(c.id) : undefined) || (c.nome ? seedByNormNome.get(normalizeSearch(c.nome)) : undefined);
    let modified = false;

    // --- RESTAURAÇÃO DE CPF ---
    const currentCpf = c.cpf && typeof c.cpf === "string" ? c.cpf.trim() : "";
    let targetCpf = currentCpf;
    if (!targetCpf && seed && seed.cpf && typeof seed.cpf === "string" && seed.cpf.trim() !== "") {
      targetCpf = seed.cpf.trim();
    }
    if (c.cpf !== targetCpf) {
      c.cpf = targetCpf;
      cpfsReparadosCount++;
      modified = true;
    }

    // --- RESTAURAÇÃO DE USUÁRIO / OPERADOR DETRAN ---
    const isPlaceholderUsrNome = !c.usuario_nome || c.usuario_nome === "Agente DETRAN" || c.usuario_nome === "sistema" || c.usuario_nome === "-";
    const isPlaceholderUsrId = !c.usuario_id || c.usuario_id === "sistema";

    let targetUsrId = isPlaceholderUsrId ? (seed && seed.usuario_id ? seed.usuario_id : c.usuario_id) : c.usuario_id;
    let targetUsrNome = isPlaceholderUsrNome ? (seed && seed.usuario_nome ? seed.usuario_nome : c.usuario_nome) : c.usuario_nome;

    if (c.usuario_id !== targetUsrId || c.usuario_nome !== targetUsrNome) {
      if (targetUsrNome && targetUsrNome !== c.usuario_nome) {
        usuariosReparadosCount++;
      }
      c.usuario_id = targetUsrId;
      c.usuario_nome = targetUsrNome;
      modified = true;
    }

    // --- RESTAURAÇÃO DE GAVETA E REPARTIÇÃO ---
    let targetGaveta = (c.gaveta && c.gaveta.trim() !== "") ? c.gaveta : (seed && seed.gaveta ? seed.gaveta : "");
    let targetReparticao = (c.reparticao && c.reparticao.trim() !== "") ? c.reparticao : (seed && seed.reparticao ? seed.reparticao : "");

    // Se a situação for "Recebida" e ainda estiver sem gaveta ou repartição, resolve pelo mapeamento físico
    if (c.situacao === "Recebida" && (!targetGaveta || !targetReparticao)) {
      const char = getInitialChar(c.nome || (seed ? seed.nome : ""));
      const m = SEED_MAPEAMENTO.find((item) => item.inicial.toUpperCase() === char && item.ativo !== false);
      if (m) {
        targetGaveta = targetGaveta || m.gaveta;
        targetReparticao = targetReparticao || m.reparticao;
      }
    }

    if (c.gaveta !== targetGaveta || c.reparticao !== targetReparticao) {
      c.gaveta = targetGaveta;
      c.reparticao = targetReparticao;
      gavetasReparadasCount++;
      modified = true;
    }

    // --- RESTAURAÇÃO DE RESPONSÁVEL (RESPONSAVEL_ID / RESPONSAVEL_NOME) ---
    if (c.situacao === "Entregue") {
      let targetId: string = CANONICAL_PROPRIETARIO_ID;
      let targetNome: string = "PROPRIETÁRIO";

      // Verifica se é uma das ordens conhecidas de despachante/procurador
      if (KNOWN_DESPACHANTE_ORDERS.has(c.ordem)) {
        const k = KNOWN_DESPACHANTE_ORDERS.get(c.ordem)!;
        targetId = k.id;
        targetNome = k.nome;
      } else if (seed && seed.responsavel_id && seed.responsavel_id !== CANONICAL_PROPRIETARIO_ID && seed.responsavel_id !== "e2335b1e") {
        targetId = seed.responsavel_id;
        targetNome = seed.responsavel_nome || "RESPONSÁVEL";
      } else if (seed && seed.responsavel_nome && !seed.responsavel_nome.toLowerCase().includes("propriet")) {
        targetNome = seed.responsavel_nome.toUpperCase();
        const normSeedR = normalizeSearch(targetNome);
        const matchSeed = respByNorm.get(normSeedR);
        if (matchSeed) targetId = matchSeed.id;
      } else if (c.responsavel_id && idMap.has(c.responsavel_id)) {
        const mappedId = idMap.get(c.responsavel_id)!;
        const master = respById.get(mappedId);
        targetId = mappedId;
        targetNome = master ? master.nome : (c.responsavel_nome || "RESPONSÁVEL");
      } else if (c.responsavel_id && respById.has(c.responsavel_id) && c.responsavel_id !== CANONICAL_PROPRIETARIO_ID && c.responsavel_id !== "e2335b1e") {
        const master = respById.get(c.responsavel_id)!;
        targetId = master.id;
        targetNome = master.nome;
      } else if (c.responsavel_nome && normalizeSearch(c.responsavel_nome)) {
        const normR = normalizeSearch(c.responsavel_nome);
        const matchByName = respByNorm.get(normR);
        if (matchByName && matchByName.id !== CANONICAL_PROPRIETARIO_ID) {
          targetId = matchByName.id;
          targetNome = matchByName.nome;
        } else {
          targetId = CANONICAL_PROPRIETARIO_ID;
          targetNome = "PROPRIETÁRIO";
        }
      }

      if (targetId === CANONICAL_PROPRIETARIO_ID) {
        proprietarioCnhsCount++;
      } else {
        despachanteCnhsCount++;
      }

      if (c.responsavel_id !== targetId || c.responsavel_nome !== targetNome) {
        c.responsavel_id = targetId;
        c.responsavel_nome = targetNome;
        modified = true;
      }
    } else {
      // Para CNHs Não-Entregues (Recebidas, Remetidas, Pendentes):
      // Se a semente original continha um responsável específico, restaura
      if (seed && (seed.responsavel_id || seed.responsavel_nome)) {
        if (c.responsavel_id !== seed.responsavel_id || c.responsavel_nome !== seed.responsavel_nome) {
          c.responsavel_id = seed.responsavel_id || null;
          c.responsavel_nome = seed.responsavel_nome || null;
          modified = true;
        }
      }
    }

    if (modified) {
      c.updated_at = now;
      restoredCnhsCount++;
    }

    cnhsToSave.push(c);
  }

  // 4. Salva localmente em Dexie e localStorage
  await dexieDb.geral.bulkPut(cnhsToSave);
  saveStoredList("geral", cnhsToSave);
  notifyDataSync("geral");
  notifyDataSync("responsaveis");

  // 5. Salva no Supabase geral_cnhs com todos os campos completos
  if (isSupabaseConfigured()) {
    log("Gravando CNHs com Gavetas, Repartições, CPFs, Usuários e Responsáveis no banco de dados Supabase...");
    try {
      const payloads = cnhsToSave.map((r) => ({
        id: r.id,
        ordem: r.ordem,
        nome: r.nome,
        cpf: r.cpf,
        telefone: r.telefone || null,
        gaveta: r.gaveta || "",
        reparticao: r.reparticao || "",
        situacao: r.situacao,
        responsavel_id: r.responsavel_id || null,
        responsavel_nome: r.responsavel_nome || null,
        data_movimento: r.data_movimento || null,
        usuario_id: r.usuario_id || null,
        usuario_nome: r.usuario_nome || null,
        memorando_numero: r.memorando_numero || null,
        remessa: r.remessa || null,
        observacao: r.observacao || null,
        created_at: r.created_at,
        updated_at: r.updated_at || now
      }));

      for (let i = 0; i < payloads.length; i += 100) {
        const chunk = payloads.slice(i, i + 100);
        const { error } = await supabase.from("geral_cnhs").upsert(chunk, { onConflict: "id" });
        if (error) {
          console.warn("Aviso ao salvar lote restaurado:", error.message);
          for (const item of chunk) {
            const single = await supabase.from("geral_cnhs").upsert([item], { onConflict: "id" });
            if (single.error) {
              const safeItem = { ...item, responsavel_id: null };
              await supabase.from("geral_cnhs").upsert([safeItem], { onConflict: "id" });
            }
          }
        }
      }
      supabaseSynced = true;
      log("Gravação de CNHs no Supabase concluída com sucesso!");
    } catch (supErr) {
      console.warn("Erro ao sincronizar geral_cnhs no Supabase durante restauração:", supErr);
    }
  }

  log(`Restauração concluída: ${cpfsReparadosCount} CPFs, ${usuariosReparadosCount} usuários e ${gavetasReparadasCount} Gavetas/Repartições recuperadas, ${restoredCnhsCount} CNHs atualizadas.`);

  return {
    restoredCnhsCount,
    proprietarioCnhsCount,
    despachanteCnhsCount,
    responsaveisCount: cleaned.length,
    gavetasReparadasCount,
    cpfsReparadosCount,
    usuariosReparadosCount,
    supabaseSynced
  };
}

let isDeduplicatingInProgress = false;

export async function deduplicateResponsaveis(
  onLog?: (msg: string) => void
): Promise<{
  removedCount: number;
  remainingCount: number;
  duplicateIds: string[];
  reassignedCnhsCount: number;
}> {
  if (isDeduplicatingInProgress) {
    return { removedCount: 0, remainingCount: 0, duplicateIds: [], reassignedCnhsCount: 0 };
  }
  isDeduplicatingInProgress = true;

  const log = (m: string) => {
    if (onLog) onLog(m);
  };

  try {
    log("Iniciando varredura e unificação segura de responsáveis...");
    let rawList: Responsavel[] = [];
    if (isSupabaseConfigured()) {
      try {
        const data = await fetchAllRowsFromSupabase<Responsavel>("responsaveis", 1000, "nome", true);
        if (data && Array.isArray(data)) rawList = data;
      } catch (err) {
        console.warn("Aviso ao buscar responsáveis no Supabase para deduplicação:", err);
      }
    }
    if (rawList.length === 0) {
      rawList = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
    }

    const { cleaned, duplicateIds, idMap } = deduplicateResponsaveisList(rawList);

    // Cria mapa de busca rápida por nome e ID dos responsáveis unificados
    const respByNormName = new Map<string, Responsavel>();
    const respById = new Map<string, Responsavel>();
    cleaned.forEach((r) => {
      r.nome = r.nome.trim().toUpperCase();
      respById.set(r.id, r);
      const norm = normalizeSearch(r.nome);
      if (norm) respByNormName.set(norm, r);
    });

    // 1. Salva localmente a lista limpa
    saveStoredList("responsaveis", cleaned);

    // PASSO CRÍTICO A: Salva primeiro os responsáveis mestres no Supabase
    // para que qualquer CNH possa apontar para eles sem violação de chave estrangeira
    if (isSupabaseConfigured()) {
      try {
        log("Sincronizando responsáveis mestres no banco de dados Supabase...");
        await supabase.from("responsaveis").upsert(cleaned, { onConflict: "id" });
      } catch (supErr: any) {
        console.warn("Erro ao sincronizar responsáveis mestres no Supabase:", supErr);
      }
    }

    // 2. Realinha as CNHs entregues no balcão garantindo preservação de responsavel_id, responsavel_nome, CPF e Usuário
    let reassignedCnhsCount = 0;
    const cnhs = await getLocalGeralCNHs();
    const updatedCnhs: GeralCNH[] = [];

    const seedByOrdem = new Map(SEED_GERAL.map((s) => [s.ordem, s]));
    const seedById = new Map(SEED_GERAL.map((s) => [s.id, s]));
    const seedByNormNome = new Map(SEED_GERAL.map((s) => [normalizeSearch(s.nome), s]));

    for (const c of cnhs) {
      const seed = seedByOrdem.get(c.ordem) || (c.id ? seedById.get(c.id) : undefined) || (c.nome ? seedByNormNome.get(normalizeSearch(c.nome)) : undefined);
      let modified = false;

      // PRESERVAÇÃO TOTAL: Assegura que CPF, Usuário, Gaveta e Repartição NUNCA sejam perdidos
      if ((!c.cpf || c.cpf.trim() === "") && seed && seed.cpf && seed.cpf.trim() !== "") {
        c.cpf = seed.cpf.trim();
        modified = true;
      }
      if ((!c.usuario_nome || c.usuario_nome === "Agente DETRAN" || c.usuario_nome === "sistema" || c.usuario_nome === "-") && seed && seed.usuario_nome) {
        c.usuario_nome = seed.usuario_nome;
        c.usuario_id = seed.usuario_id || c.usuario_id;
        modified = true;
      }
      if ((!c.gaveta || c.gaveta.trim() === "") && seed && seed.gaveta) {
        c.gaveta = seed.gaveta;
        modified = true;
      }
      if ((!c.reparticao || c.reparticao.trim() === "") && seed && seed.reparticao) {
        c.reparticao = seed.reparticao;
        modified = true;
      }

      if (c.situacao !== "Entregue") {
        if (modified) {
          updatedCnhs.push(c);
        }
        continue;
      }

      // Ordem específica de despachante
      if (KNOWN_DESPACHANTE_ORDERS.has(c.ordem)) {
        const k = KNOWN_DESPACHANTE_ORDERS.get(c.ordem)!;
        if (c.responsavel_id !== k.id || c.responsavel_nome !== k.nome) {
          c.responsavel_id = k.id;
          c.responsavel_nome = k.nome;
          modified = true;
        }
      } else if (c.responsavel_id && idMap.has(c.responsavel_id)) {
        // CNH apontando para ID duplicado que foi unificado
        const canonicalId = idMap.get(c.responsavel_id)!;
        c.responsavel_id = canonicalId;
        const masterResp = respById.get(canonicalId);
        if (masterResp) c.responsavel_nome = masterResp.nome;
        modified = true;
      } else if (
        c.responsavel_id &&
        respById.has(c.responsavel_id) &&
        c.responsavel_id !== CANONICAL_PROPRIETARIO_ID &&
        c.responsavel_id !== "e2335b1e"
      ) {
        const matchedById = respById.get(c.responsavel_id)!;
        if (c.responsavel_nome !== matchedById.nome) {
          c.responsavel_nome = matchedById.nome;
          modified = true;
        }
      } else {
        const cNorm = normalizeSearch(c.responsavel_nome || "");
        const matchedByNome = cNorm ? respByNormName.get(cNorm) : undefined;

        if (matchedByNome && matchedByNome.id !== CANONICAL_PROPRIETARIO_ID) {
          if (c.responsavel_id !== matchedByNome.id || c.responsavel_nome !== matchedByNome.nome) {
            c.responsavel_id = matchedByNome.id;
            c.responsavel_nome = matchedByNome.nome;
            modified = true;
          }
        } else {
          if (c.responsavel_id !== CANONICAL_PROPRIETARIO_ID || c.responsavel_nome !== "PROPRIETÁRIO") {
            c.responsavel_id = CANONICAL_PROPRIETARIO_ID;
            c.responsavel_nome = "PROPRIETÁRIO";
            modified = true;
          }
        }
      }

      if (modified) {
        reassignedCnhsCount++;
        updatedCnhs.push(c);
      }
    }

    // PASSO CRÍTICO B: Grava as CNHs atualizadas TANTO localmente QUANTO no Supabase ANTES de deletar qualquer duplicata
    if (updatedCnhs.length > 0) {
      await saveLocalGeralCNHsBulk(updatedCnhs, false); // false = grava também no Supabase!
      saveStoredList("geral", cnhs);
      notifyDataSync("geral");
      log(`${reassignedCnhsCount} CNH(s) atualizadas com sucesso no banco de dados.`);
    }

    // 3. Realinha declarações que apontavam para procuradores duplicados
    try {
      const decls = getStoredList<any>("declaracoes", []);
      let declsMod = false;
      decls.forEach((d) => {
        if (d.procurador_id && idMap.has(d.procurador_id)) {
          d.procurador_id = idMap.get(d.procurador_id)!;
          declsMod = true;
        }
      });
      if (declsMod) {
        saveStoredList("declaracoes", decls);
        notifyDataSync("declaracoes");
      }
    } catch {}

    // PASSO CRÍTICO C: Somente agora que todas as CNHs apontam para o ID mestre, remove as duplicatas obsoletas do Supabase
    if (isSupabaseConfigured() && duplicateIds.length > 0) {
      try {
        log(`Removendo ${duplicateIds.length} cadastro(s) duplicados obsoletos no Supabase...`);
        for (let i = 0; i < duplicateIds.length; i += 50) {
          const slice = duplicateIds.slice(i, i + 50);
          await supabase.from("responsaveis").delete().in("id", slice);
        }
        log("Cadastros duplicados obsoletos removidos com segurança.");
      } catch (supErr: any) {
        console.warn("Aviso ao deletar duplicatas no Supabase:", supErr);
      }
    }

    notifyDataSync("responsaveis");
    log(`Mesclagem concluída! ${duplicateIds.length} duplicatas eliminadas e dados preservados.`);

    return {
      removedCount: duplicateIds.length,
      remainingCount: cleaned.length,
      duplicateIds,
      reassignedCnhsCount
    };
  } finally {
    isDeduplicatingInProgress = false;
  }
}

/**
 * Mescla responsáveis por nome e reconcilia 100% as CNHs retiradas com as entregas no balcão
 */
export async function mergeResponsaveisByNome(
  onLog?: (msg: string) => void
): Promise<{
  removedCount: number;
  remainingCount: number;
  duplicateIds: string[];
  reassignedCnhsCount: number;
  totalEntreguesNoBalcao: number;
  totalRetiradasConsolidadas: number;
}> {
  const log = (m: string) => {
    if (onLog) onLog(m);
  };
  log("Iniciando mesclagem por nome e reconciliação de CNHs com o balcão...");
  const res = await deduplicateResponsaveis(onLog);

  const cnhs = await getLocalGeralCNHs();
  const totalEntreguesNoBalcao = cnhs.filter((c) => c.situacao === "Entregue").length;

  log(`Reconciliação finalizada! Total entregue no balcão: ${totalEntreguesNoBalcao}. CNHs realinhadas: ${res.reassignedCnhsCount}.`);

  return {
    ...res,
    totalEntreguesNoBalcao,
    totalRetiradasConsolidadas: totalEntreguesNoBalcao
  };
}

export async function getResponsaveis(): Promise<Responsavel[]> {
  let list: Responsavel[] = [];
  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Responsavel>("responsaveis", 1000, "nome", true);
      if (data && Array.isArray(data)) {
        list = data;
      }
    } catch (err) {
      console.warn("Aviso ao buscar responsáveis no Supabase:", err);
    }
  }

  if (list.length === 0) {
    list = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  }

  // Deduplicação não-destrutiva em memória (apenas para exibição limpa)
  const { cleaned } = deduplicateResponsaveisList(list);
  saveStoredList("responsaveis", cleaned);

  return cleaned.sort((a, b) =>
    a.id === CANONICAL_PROPRIETARIO_ID ? -1 : b.id === CANONICAL_PROPRIETARIO_ID ? 1 : a.nome.localeCompare(b.nome)
  );
}

export async function createResponsavel(
  data: Omit<Responsavel, "id" | "created_at">,
  userId: string,
  userNome: string
): Promise<Responsavel> {
  const list = await getResponsaveis();
  const cleanNewCpf = data.cpf ? data.cpf.replace(/\D/g, "") : "";
  const cleanNewTel = data.telefone ? data.telefone.replace(/\D/g, "") : "";
  const uppercaseNome = (data.nome || "").trim().toUpperCase();
  const normNome = normalizeSearch(uppercaseNome);

  // 1. Proibir duplicar o Proprietário padrão
  if (
    normNome === "proprietario" ||
    normNome === "proprietarioa" ||
    normNome === "titular" ||
    cleanNewCpf === "00000000000" ||
    cleanNewCpf === "00"
  ) {
    throw new Error("O registro padrão 'PROPRIETÁRIO' é reservado e único no sistema. Não é permitido criar duplicatas.");
  }

  // 2. CPF ou CNPJ obrigatório por padrão
  if (!cleanNewCpf || (cleanNewCpf.length !== 11 && cleanNewCpf.length !== 14)) {
    throw new Error("CPF ou CNPJ é obrigatório por padrão. Informe um CPF válido (11 dígitos) ou CNPJ válido (14 dígitos).");
  }

  // 3. Telefone obrigatório por padrão
  if (!cleanNewTel || cleanNewTel.length < 10 || cleanNewTel.length > 11) {
    throw new Error("Telefone de contato com DDD é obrigatório por padrão. Informe um número válido (10 ou 11 dígitos).");
  }

  // 4. Bloquear duplicidade rastreando pelo CPF
  const existingByCpf = list.find((r) => {
    if (isProprietarioRecord(r)) return false;
    const rCpf = (r.cpf || "").replace(/\D/g, "");
    return rCpf.length >= 11 && rCpf === cleanNewCpf;
  });
  if (existingByCpf) {
    throw new Error(`Impedir duplicidade: O CPF/CNPJ (${data.cpf}) já está cadastrado para o responsável "${existingByCpf.nome}".`);
  }

  // 5. Bloquear duplicidade rastreando pelo Telefone
  const existingByTel = list.find((r) => {
    if (isProprietarioRecord(r)) return false;
    const rTel = (r.telefone || "").replace(/\D/g, "");
    return rTel.length >= 10 && rTel === cleanNewTel;
  });
  if (existingByTel) {
    throw new Error(`Impedir duplicidade: O telefone (${data.telefone}) já está cadastrado para o responsável "${existingByTel.nome}".`);
  }

  // 6. Bloquear duplicidade por Nome exato normalizado
  const existingByName = list.find((r) => {
    if (isProprietarioRecord(r)) return false;
    return normalizeSearch(r.nome) === normNome;
  });
  if (existingByName) {
    throw new Error(`Impedir duplicidade: Já existe um responsável cadastrado com o nome "${existingByName.nome}".`);
  }

  const newUuid = crypto.randomUUID();
  const novo: Responsavel = {
    ...data,
    nome: uppercaseNome,
    tipo: data.tipo || (isProprietarioRecord(data) ? "Titular" : "Despachante"),
    id: newUuid,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    try {
      const { data: inserted, error } = await supabase.from("responsaveis").insert([novo]).select().single();
      if (error) {
        console.error("Erro no Supabase ao criar responsável:", error);
        throw new Error(`Erro no Supabase: ${error.message}`);
      }
      if (inserted) {
        const localList = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
        saveStoredList("responsaveis", [inserted as Responsavel, ...localList]);
        notifyDataSync("responsaveis");
        await logAuditoria("responsaveis", inserted.nome, "Inclusão", userId, userNome, null, inserted);
        return inserted as Responsavel;
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith("Erro no Supabase")) throw err;
    }
  }

  const localList = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  saveStoredList("responsaveis", [...localList, novo]);
  notifyDataSync("responsaveis");
  await logAuditoria("responsaveis", novo.nome, "Inclusão", userId, userNome, null, novo);
  return novo;
}

export async function updateResponsavel(
  id: string,
  data: Partial<Responsavel>,
  userId: string,
  userNome: string
): Promise<Responsavel> {
  const list = await getResponsaveis();
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) throw new Error("Responsável não encontrado");
  const ant = list[index];

  const isProp = isProprietarioRecord(ant);
  if (isProp && data.nome && normalizeSearch(data.nome) !== "proprietario") {
    throw new Error("O registro Padrão 'PROPRIETÁRIO' não pode ter seu nome modificado.");
  }

  const cleanNewCpf = data.cpf !== undefined ? data.cpf.replace(/\D/g, "") : (ant.cpf || "").replace(/\D/g, "");
  const cleanNewTel = data.telefone !== undefined ? data.telefone.replace(/\D/g, "") : (ant.telefone || "").replace(/\D/g, "");
  const updatedNome = data.nome !== undefined ? data.nome.trim().toUpperCase() : ant.nome.trim().toUpperCase();
  const normNome = normalizeSearch(updatedNome);

  if (!isProp) {
    if (!cleanNewCpf || (cleanNewCpf.length !== 11 && cleanNewCpf.length !== 14)) {
      throw new Error("CPF ou CNPJ é obrigatório por padrão (11 ou 14 dígitos).");
    }
    if (!cleanNewTel || cleanNewTel.length < 10 || cleanNewTel.length > 11) {
      throw new Error("Telefone de contato com DDD é obrigatório por padrão (10 ou 11 dígitos).");
    }

    const existingByCpf = list.find((r) => r.id !== id && !isProprietarioRecord(r) && (r.cpf || "").replace(/\D/g, "") === cleanNewCpf);
    if (existingByCpf) {
      throw new Error(`Impedir duplicidade: O CPF/CNPJ já está cadastrado para o responsável "${existingByCpf.nome}".`);
    }

    const existingByTel = list.find((r) => r.id !== id && !isProprietarioRecord(r) && (r.telefone || "").replace(/\D/g, "") === cleanNewTel);
    if (existingByTel) {
      throw new Error(`Impedir duplicidade: O telefone já está cadastrado para o responsável "${existingByTel.nome}".`);
    }

    const existingByName = list.find((r) => r.id !== id && !isProprietarioRecord(r) && normalizeSearch(r.nome) === normNome);
    if (existingByName) {
      throw new Error(`Impedir duplicidade: Já existe outro responsável cadastrado com o nome "${existingByName.nome}".`);
    }
  }

  const atualizado: Responsavel = {
    ...ant,
    ...data,
    nome: isProp ? "PROPRIETÁRIO" : updatedNome,
    tipo: isProp ? "Titular" : (data.tipo || ant.tipo || "Despachante"),
  };

  if (isSupabaseConfigured()) {
    try {
      const { data: updatedSup, error } = await supabase.from("responsaveis").update(atualizado).eq("id", id).select().single();
      if (!error && updatedSup) {
        const localList = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
        const lIndex = localList.findIndex((r) => r.id === id);
        if (lIndex !== -1) localList[lIndex] = updatedSup as Responsavel;
        saveStoredList("responsaveis", localList);
        notifyDataSync("responsaveis");
        await logAuditoria("responsaveis", ant.nome, "Alteração", userId, userNome, ant, updatedSup);
        return updatedSup as Responsavel;
      }
    } catch (e) {
      console.warn("Aviso ao atualizar responsável no Supabase:", e);
    }
  }

  const localList = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  const lIndex = localList.findIndex((r) => r.id === id);
  if (lIndex !== -1) localList[lIndex] = atualizado;
  saveStoredList("responsaveis", localList);
  notifyDataSync("responsaveis");
  await logAuditoria("responsaveis", ant.nome, "Alteração", userId, userNome, ant, atualizado);
  return atualizado;
}

export async function deleteResponsavel(id: string, userId: string, userNome: string): Promise<void> {
  const list = await getResponsaveis();
  const target = list.find((r) => r.id === id);
  if (!target) return;
  if (isProprietarioRecord(target)) {
    throw new Error("O registro Padrão 'Proprietário' não poderá ser excluído.");
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("responsaveis").delete().eq("id", id);
    } catch (e) {
      console.warn("Aviso ao deletar responsável no Supabase:", e);
    }
  }

  const localList = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  const filtrados = localList.filter((r) => r.id !== id);
  saveStoredList("responsaveis", filtrados);
  notifyDataSync("responsaveis");
  await logAuditoria("responsaveis", target.nome, "Exclusão", userId, userNome, target, null);
}

// ============================================================================
// MÓDULO DE MEMORANDOS & CANDIDATOS
// ============================================================================

export async function getCandidatosAll(): Promise<Candidato[]> {
  const deletedMemoIds = getDeletedIds("memorandos");
  const deletedCandIds = getDeletedIds("candidatos");

  let rawCands: Candidato[] = [];

  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Candidato>("candidatos", 1000, "created_at", false);
      if (data && Array.isArray(data)) {
        const validRemote = data.filter((c) => !deletedCandIds.has(c.id) && !deletedMemoIds.has(c.memorando_id));
        const local = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS).filter(
          (c) => !deletedCandIds.has(c.id) && !deletedMemoIds.has(c.memorando_id)
        );
        const remoteIds = new Set(validRemote.map((d) => d.id));
        const localOnly = local.filter((c) => !remoteIds.has(c.id));
        const localMap = new Map(local.map((l) => [l.id, l]));
        const validRemoteWithTelefone = validRemote.map((r) => {
          const loc = localMap.get(r.id);
          return {
            ...r,
            telefone: (r.telefone && r.telefone.trim() !== "") ? r.telefone : (loc?.telefone || "")
          };
        });
        rawCands = [...validRemoteWithTelefone, ...localOnly];
        saveStoredList("candidatos", rawCands);
      }
    } catch (err) {
      console.warn("Aviso ao buscar candidatos no Supabase:", err);
    }
  }

  if (rawCands.length === 0) {
    rawCands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS).filter(
      (c) => !deletedCandIds.has(c.id) && !deletedMemoIds.has(c.memorando_id)
    );
  }

  // Deduplicação estrita de candidatos por ID único para visão geral da tabela filha
  const seenIds = new Set<string>();
  const deduplicated: Candidato[] = [];
  for (const c of rawCands) {
    if (!c.id || seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    deduplicated.push(c);
  }

  return deduplicated;
}

export async function getMemorandos(): Promise<Memorando[]> {
  const deletedIds = getDeletedIds("memorandos");

  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Memorando>("memorandos", 1000, "created_at", false);
      if (data && Array.isArray(data)) {
        const validRemote: Memorando[] = [];
        for (const m of data) {
          if (deletedIds.has(m.id)) {
            // Deleção síncrona no Supabase para garantir remoção caso o registro persista na nuvem
            try {
              await supabase.from("geral_cnhs").delete().eq("memorando_id", m.id);
              await supabase.from("candidatos").delete().eq("memorando_id", m.id);
              await supabase.from("memorandos").delete().eq("id", m.id);
            } catch (e) {
              console.warn("Aviso ao excluir no Supabase memorando deletado:", e);
            }
          } else {
            validRemote.push(m);
          }
        }
        const local = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS).filter((m) => !deletedIds.has(m.id));
        const localMap = new Map(local.map((m) => [m.id, m]));
        const validRemoteMerged = validRemote.map((rem) => {
          const loc = localMap.get(rem.id);
          return {
            ...rem,
            remetido_em: rem.remetido_em || loc?.remetido_em
          };
        });
        const remoteIds = new Set(validRemote.map((d) => d.id));
        const localOnly = local.filter((m) => !remoteIds.has(m.id) && !deletedIds.has(m.id));
        const merged = [...validRemoteMerged, ...localOnly].filter((m) => !deletedIds.has(m.id));
        saveStoredList("memorandos", merged);
      }
    } catch (err) {
      console.warn("Aviso ao buscar memorandos no Supabase:", err);
    }
  }
  const list = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS).filter((m) => !deletedIds.has(m.id));
  const cands = await getCandidatosAll();
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
  return list.map((m) => {
    let remetidoData = m.remetido_em;
    if (m.status === "Remetido" && !remetidoData) {
      const matchGeral = geralList.find(
        (g) => g.memorando_id === m.id || 
               (g.observacao && g.observacao.includes(m.numero)) ||
               (m.remessa && g.remessa === m.remessa)
      );
      remetidoData = matchGeral?.data_movimento || matchGeral?.created_at || m.created_at;
    }
    return {
      ...m,
      remetido_em: remetidoData,
      candidatos_count: cands.filter((c) => c.memorando_id === m.id).length
    };
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getCandidatosByMemorando(memorando_id: string): Promise<Candidato[]> {
  const deletedCandIds = getDeletedIds("candidatos");
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from("candidatos")
        .select("*")
        .eq("memorando_id", memorando_id);
      if (!error && data && Array.isArray(data)) {
        const validRemote = data.filter((c) => !deletedCandIds.has(c.id));
        const localAll = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
        const remoteIds = new Set(validRemote.map((c) => c.id));
        const otherCands = localAll.filter((c) => c.memorando_id !== memorando_id && !deletedCandIds.has(c.id));
        const localThisMemo = localAll.filter((c) => c.memorando_id === memorando_id && !deletedCandIds.has(c.id) && !remoteIds.has(c.id));
        const merged = [...otherCands, ...validRemote, ...localThisMemo];
        saveStoredList("candidatos", merged);
        return [...validRemote, ...localThisMemo].sort((a, b) => (parseInt(a.numero || "0", 10) - parseInt(b.numero || "0", 10)));
      }
    } catch (err) {
      console.warn("Aviso ao buscar candidatos por memorando no Supabase:", err);
    }
  }
  const cands = await getCandidatosAll();
  return cands
    .filter((c) => c.memorando_id === memorando_id)
    .sort((a, b) => (parseInt(a.numero || "0", 10) - parseInt(b.numero || "0", 10)));
}

export async function createMemorando(
  data: { numero: string; remessa?: string; created_at?: string },
  userId: string,
  userNome: string
): Promise<Memorando> {
  const list = await getMemorandos();
  if (list.some((m) => m.numero.trim().toLowerCase() === data.numero.trim().toLowerCase())) {
    throw new Error("Já existe um memorando com este número.");
  }

  const memoId = typeof crypto !== "undefined" && crypto.randomUUID 
    ? crypto.randomUUID() 
    : (toValidUUID(`memo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`) || `memo-${Date.now()}`);

  let novo: Memorando = {
    id: memoId,
    numero: data.numero.trim(),
    usuario_id: userId,
    usuario_nome: userNome,
    remessa: data.remessa ? data.remessa.trim() : "",
    status: "Em elaboração",
    created_at: data.created_at || new Date().toISOString(),
    candidatos_count: 0
  };

  if (isSupabaseConfigured()) {
    try {
      const payload: any = {
        id: novo.id,
        numero: novo.numero,
        remessa: novo.remessa || null,
        status: novo.status,
        candidatos_count: 0,
        created_at: novo.created_at
      };

      if (novo.usuario_nome) payload.usuario_nome = novo.usuario_nome;
      if (novo.usuario_id) payload.usuario_id = novo.usuario_id;

      const { data: inserted, error } = await supabase
        .from("memorandos")
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.warn("Aviso no Supabase ao criar memorando, tentando envio seguro:", error.message);
        // Fallback: tentar sem colunas opcionais ou foreign keys restritivas
        const safePayload: any = {
          id: novo.id,
          numero: novo.numero,
          remessa: novo.remessa || null,
          status: novo.status,
          created_at: novo.created_at
        };
        if (novo.usuario_nome) safePayload.usuario_nome = novo.usuario_nome;

        const { data: insertedSafe, error: errorSafe } = await supabase
          .from("memorandos")
          .insert([safePayload])
          .select()
          .single();

        if (errorSafe) {
          console.error("Erro no Supabase ao salvar memorando:", errorSafe);
        } else if (insertedSafe) {
          novo = { ...novo, ...insertedSafe };
        }
      } else if (inserted) {
        novo = { ...novo, ...inserted };
      }
    } catch (err) {
      console.warn("Aviso ao criar memorando no Supabase:", err);
    }
  }

  saveStoredList("memorandos", [novo, ...list.filter((m) => m.id !== novo.id)]);
  notifyDataSync("memorandos");
  await logAuditoria("memorandos", novo.numero, "Inclusão", userId, userNome, null, novo);
  return novo;
}

export async function updateMemorando(
  id: string,
  data: Partial<Memorando>,
  userId: string,
  userNome: string
): Promise<Memorando> {
  const list = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const index = list.findIndex((m) => m.id === id);
  if (index === -1) throw new Error("Memorando não encontrado");
  const ant = list[index];
  const atualizado = { ...ant, ...data };
  list[index] = atualizado;

  if (isSupabaseConfigured()) {
    try {
      const updateData: any = { ...data };
      delete updateData.candidatos_count; // coluna computada
      const { error } = await supabase.from("memorandos").update(updateData).eq("id", id);
      if (error) {
        console.warn("Aviso ao atualizar memorando no Supabase:", error.message);
        const safeData: any = {};
        if (data.numero !== undefined) safeData.numero = data.numero;
        if (data.remessa !== undefined) safeData.remessa = data.remessa;
        if (data.status !== undefined) safeData.status = data.status;
        if (data.created_at !== undefined) safeData.created_at = data.created_at;
        if (data.remetido_em !== undefined) safeData.remetido_em = data.remetido_em;
        await supabase.from("memorandos").update(safeData).eq("id", id);
      }
    } catch (err) {
      console.warn("Aviso ao atualizar memorando no Supabase:", err);
    }
  }

  saveStoredList("memorandos", list);
  notifyDataSync("memorandos");

  if (ant.status === "Remetido") {
    const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
    let updatedGeral = false;
    const cnhsToUpdateSupabase: GeralCNH[] = [];
    geralList.forEach((cnh) => {
      if (cnh.memorando_id === id || (cnh.observacao && cnh.observacao.includes(ant.numero))) {
        if (data.numero || data.remessa !== undefined) {
          cnh.observacao = `Remetida via memorando ${atualizado.numero}${atualizado.remessa ? ` - Remessa ${atualizado.remessa}` : ""}`;
          cnh.memorando_numero = atualizado.numero;
          cnh.remessa = atualizado.remessa || atualizado.numero;
        }
        if (data.remetido_em) {
          cnh.data_movimento = data.remetido_em;
        }
        cnhsToUpdateSupabase.push(cnh);
        updatedGeral = true;
      }
    });
    if (updatedGeral) {
      saveStoredList("geral", geralList);
      await saveLocalGeralCNHsBulk(cnhsToUpdateSupabase);
      if (isSupabaseConfigured() && cnhsToUpdateSupabase.length > 0) {
        try {
          await supabase.from("geral_cnhs").upsert(cnhsToUpdateSupabase, { onConflict: "id" });
        } catch (e) {
          console.warn("Aviso ao atualizar cnhs do memorando no Supabase:", e);
        }
      }
    }
  }

  await logAuditoria("memorandos", ant.numero, "Alteração", userId, userNome, ant, atualizado);
  return atualizado;
}

export async function deleteMemorando(id: string, userId: string, userNome: string): Promise<void> {
  addDeletedId("memorandos", id);

  const list = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const target = list.find((m) => m.id === id);

  // Mark candidates of this memorando as deleted
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  const candsToRemove = cands.filter((c) => c.memorando_id === id);
  for (const c of candsToRemove) {
    addDeletedId("candidatos", c.id);
  }

  // Handle geral CNHs linked to this memorando (both local/Dexie and Supabase)
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
  const cnhsLinked = geralList.filter((g) => g.memorando_id === id);
  const cnhIdsToDelete = cnhsLinked.map((g) => g.id);

  if (cnhIdsToDelete.length > 0) {
    try {
      await deleteLocalGeralCNHsBulk(cnhIdsToDelete);
    } catch (e) {
      console.warn("Aviso ao remover CNHs do IndexedDB ao deletar memorando:", e);
    }
    const filtradosGeral = geralList.filter((g) => g.memorando_id !== id);
    saveStoredList("geral", filtradosGeral);
  }

  if (isSupabaseConfigured()) {
    try {
      // 1. Delete or un-link geral_cnhs in Supabase referencing this memorando first
      await supabase.from("geral_cnhs").delete().eq("memorando_id", id);
      await supabase.from("geral_cnhs").update({ memorando_id: null }).eq("memorando_id", id);

      // 2. Delete candidatos from Supabase
      await supabase.from("candidatos").delete().eq("memorando_id", id);

      // 3. Delete memorando from Supabase
      const { error } = await supabase.from("memorandos").delete().eq("id", id);
      if (error) {
        console.warn("Aviso ao excluir memorando no Supabase:", error.message);
      }
    } catch (e) {
      console.warn("Aviso ao deletar memorando no Supabase:", e);
    }
  }

  const filtradosCands = cands.filter((c) => c.memorando_id !== id && !getDeletedIds("candidatos").has(c.id));
  saveStoredList("candidatos", filtradosCands);

  const filtrados = list.filter((m) => m.id !== id && !getDeletedIds("memorandos").has(m.id));
  saveStoredList("memorandos", filtrados);
  notifyDataSync("memorandos");

  if (target) {
    await logAuditoria("memorandos", target.numero, "Exclusão", userId, userNome, target, null);
  }
}

export async function addCandidato(
  memorando_id: string,
  data: Omit<Candidato, "id" | "memorando_id" | "created_at">,
  userId: string,
  userNome: string
): Promise<Candidato> {
  const memos = await getMemorandos();
  const memo = memos.find((m) => m.id === memorando_id);
  if (!memo) throw new Error("Memorando não encontrado");
  if (memo.status !== "Em elaboração") {
    throw new Error("Este memorando já foi remetido. Não é possível adicionar novos candidatos.");
  }
  if (memo.usuario_id && memo.usuario_id !== userId) {
    throw new Error(`Apenas o usuário responsável (${memo.usuario_nome || "autor"}) que está elaborando este memorando pode adicionar candidatos.`);
  }

  const cands = await getCandidatosAll();
  const candsDoMemo = cands.filter((c) => c.memorando_id === memorando_id);
  const cleanNewCpf = (data.cpf || "").replace(/\D/g, "");
  const cleanNewNome = (data.nome || "").trim().toLowerCase();

  if (cleanNewCpf.length >= 11) {
    const dupCpf = candsDoMemo.find((c) => (c.cpf || "").replace(/\D/g, "") === cleanNewCpf);
    if (dupCpf) {
      throw new Error(`O candidato com CPF ${dupCpf.cpf} ("${dupCpf.nome}") já foi adicionado a este memorando.`);
    }
  }

  if (cleanNewNome) {
    const dupNome = candsDoMemo.find((c) => (c.nome || "").trim().toLowerCase() === cleanNewNome);
    if (dupNome) {
      throw new Error(`O candidato "${dupNome.nome}" já consta na lista deste memorando.`);
    }
  }

  const candId = typeof crypto !== "undefined" && crypto.randomUUID 
    ? crypto.randomUUID() 
    : (toValidUUID(`cand-${memorando_id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`) || `cand-${Date.now()}`);

  let novo: Candidato = {
    ...data,
    id: candId,
    memorando_id,
    remessa: memo.remessa || "",
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    try {
      const candPayload: any = {
        id: novo.id,
        memorando_id: novo.memorando_id,
        numero: novo.numero || null,
        nome: novo.nome,
        cpf: novo.cpf,
        pa: novo.pa || null,
        telefone: novo.telefone || null,
        remessa: novo.remessa || null,
        created_at: novo.created_at
      };

      const { data: inserted, error } = await supabase.from("candidatos").insert([candPayload]).select().single();
      if (error) {
        console.warn("Aviso ao adicionar candidato no Supabase, tentando seguro:", error.message);
        const minPayload: any = {
          id: novo.id,
          memorando_id: novo.memorando_id,
          nome: novo.nome,
          cpf: novo.cpf
        };
        if (novo.numero) minPayload.numero = novo.numero;
        if (novo.pa) minPayload.pa = novo.pa;
        if (novo.telefone) minPayload.telefone = novo.telefone;
        if (novo.remessa) minPayload.remessa = novo.remessa;

        const { data: insertedMin, error: errorMin } = await supabase.from("candidatos").insert([minPayload]).select().single();
        if (!errorMin && insertedMin) {
          novo = { ...novo, ...insertedMin };
        }
      } else if (inserted) {
        novo = { ...novo, ...inserted };
      }
    } catch (err) {
      console.warn("Aviso ao adicionar candidato no Supabase:", err);
    }
  }

  saveStoredList("candidatos", [...cands.filter((c) => c.id !== novo.id), novo]);

  const newCount = candsDoMemo.length + 1;
  memo.candidatos_count = newCount;
  saveStoredList("memorandos", memos);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("memorandos").update({ candidatos_count: newCount }).eq("id", memorando_id);
    } catch {
      // ignore
    }
  }

  notifyDataSync("candidatos");
  await logAuditoria("candidatos", `${novo.nome} (${memo.numero})`, "Inclusão", userId, userNome, null, novo);
  return novo;
}

export async function deleteCandidato(id: string, userId: string, userNome: string): Promise<void> {
  addDeletedId("candidatos", id);
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  const target = cands.find((c) => c.id === id);
  if (!target) return;
  const memos = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const memo = memos.find((m) => m.id === target.memorando_id);
  if (memo && memo.status !== "Em elaboração") {
    throw new Error("Não é possível remover candidato de um memorando remetido.");
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("candidatos").delete().eq("id", id);
    } catch (e) {
      console.warn("Aviso ao deletar candidato no Supabase:", e);
    }
  }

  const filtrados = cands.filter((c) => c.id !== id);
  saveStoredList("candidatos", filtrados);

  if (memo) {
    const newCount = Math.max(0, (memo.candidatos_count || 1) - 1);
    memo.candidatos_count = newCount;
    saveStoredList("memorandos", memos);
    if (isSupabaseConfigured()) {
      try {
        await supabase.from("memorandos").update({ candidatos_count: newCount }).eq("id", memo.id);
      } catch {
        // ignore
      }
    }
  }

  notifyDataSync("candidatos");
  await logAuditoria("candidatos", target.nome, "Exclusão", userId, userNome, target, null);
}

export async function updateCandidato(
  id: string,
  data: Partial<Omit<Candidato, "id" | "memorando_id" | "created_at">>,
  userId: string,
  userNome: string
): Promise<Candidato> {
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  const index = cands.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("Candidato não encontrado");
  const target = cands[index];
  const memos = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const memo = memos.find((m) => m.id === target.memorando_id);
  if (memo && memo.status !== "Em elaboração") {
    throw new Error("Não é possível editar candidato de um memorando remetido.");
  }

  // Verificar se a edição causa duplicidade no mesmo memorando
  const candsDoMemo = cands.filter((c) => c.memorando_id === target.memorando_id && c.id !== id);
  const cleanNewCpf = ((data.cpf !== undefined ? data.cpf : target.cpf) || "").replace(/\D/g, "");
  const cleanNewNome = ((data.nome !== undefined ? data.nome : target.nome) || "").trim().toLowerCase();

  if (cleanNewCpf.length >= 11) {
    const dupCpf = candsDoMemo.find((c) => (c.cpf || "").replace(/\D/g, "") === cleanNewCpf);
    if (dupCpf) {
      throw new Error(`Outro candidato com CPF ${dupCpf.cpf} ("${dupCpf.nome}") já existe neste memorando.`);
    }
  }

  if (cleanNewNome) {
    const dupNome = candsDoMemo.find((c) => (c.nome || "").trim().toLowerCase() === cleanNewNome);
    if (dupNome) {
      throw new Error(`Outro candidato com o nome "${dupNome.nome}" já existe neste memorando.`);
    }
  }

  const atualizado = { ...target, ...data };

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from("candidatos").update(data).eq("id", id);
      if (error) console.error("Erro no Supabase ao atualizar candidato:", error);
    } catch (err) {
      console.warn("Aviso ao atualizar candidato no Supabase:", err);
    }
  }

  cands[index] = atualizado;
  saveStoredList("candidatos", cands);
  notifyDataSync("candidatos");
  await logAuditoria("candidatos", atualizado.nome, "Alteração", userId, userNome, target, atualizado);
  return atualizado;
}

export async function remeterMemorando(memorando_id: string, userId: string, userNome: string): Promise<number> {
  const memos = await getMemorandos();
  const memoIndex = memos.findIndex((m) => m.id === memorando_id);
  if (memoIndex === -1) throw new Error("Memorando não encontrado");
  const memo = memos[memoIndex];
  if (memo.status !== "Em elaboração") {
    throw new Error("Impedir remessa duplicada: Este memorando já encontra-se " + memo.status);
  }

  const cands = await getCandidatosByMemorando(memorando_id);
  if (cands.length === 0) {
    throw new Error("Não é possível remeter um memorando sem nenhum candidato cadastrado.");
  }

  // 1. Atualizar status do memorando imediatamente para 'Remetido' para evitar concorrência
  const now = new Date().toISOString();
  memos[memoIndex] = { ...memo, status: "Remetido", remetido_em: now };
  saveStoredList("memorandos", memos);

  // 2. Buscar Geral CNHs atuais e remover registros anteriores deste memorando se houver
  const geralListAtual = await getGeralCNHs();
  const cnhsAntigas = geralListAtual.filter((c) => c.memorando_id === memorando_id);
  const idsAntigos = cnhsAntigas.map((c) => c.id);

  if (idsAntigos.length > 0) {
    await deleteLocalGeralCNHsBulk(idsAntigos);
  }

  const semAtuais = geralListAtual.filter((c) => c.memorando_id !== memorando_id);
  
  let maxOrdem = semAtuais.reduce((acc, curr) => Math.max(acc, curr.ordem || 0), 0);

  const novasCNHs: GeralCNH[] = [];
  let seq = 0;
  for (const cand of cands) {
    maxOrdem++;
    seq++;
    const uniqueId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : (toValidUUID(`cnh-memo-${memo.id.replace(/\W/g, "")}-${cand.id.replace(/\W/g, "")}-${Date.now()}-${seq}`) || `cnh-${Date.now()}-${seq}`);

    const novaCNH: GeralCNH = {
      id: uniqueId,
      ordem: maxOrdem,
      memorando_id: memo.id,
      candidato_id: cand.id,
      pa: cand.pa || "",
      nome: cand.nome || "Candidato sem nome",
      cpf: cand.cpf || "",
      telefone: cand.telefone || "",
      gaveta: "",
      reparticao: "",
      situacao: "Remetida",
      data_movimento: now,
      usuario_id: userId,
      usuario_nome: userNome,
      memorando_numero: memo.numero,
      remessa: memo.remessa || memo.numero,
      observacao: `Remetida via memorando ${memo.numero}${memo.remessa ? ` - Remessa ${memo.remessa}` : ""}`,
      created_at: now
    };
    novasCNHs.push(novaCNH);
    await logHistorico(novaCNH.id, novaCNH.ordem, novaCNH.nome, null, "Remetida", userId, userNome, `Memorando ${memo.numero}`, undefined, undefined, novaCNH.cpf);
  }

  saveStoredList("geral", [...semAtuais, ...novasCNHs]);
  await saveLocalGeralCNHsBulk(novasCNHs);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("memorandos").update({ status: "Remetido", remetido_em: now }).eq("id", memorando_id);
      if (idsAntigos.length > 0) {
        await supabase.from("geral_cnhs").delete().eq("memorando_id", memorando_id);
      }
      await supabase.from("geral_cnhs").upsert(novasCNHs, { onConflict: "id" });
    } catch (e) {
      console.warn("Aviso ao remeter memorando no Supabase:", e);
    }
  }

  notifyDataSync("memorandos");
  notifyDataSync("geral");
  await logAuditoria("memorandos", memo.numero, "Remessa", userId, userNome, { status: "Em elaboração" }, { status: "Remetido", total_remetidas: novasCNHs.length });
  return novasCNHs.length;
}

export async function reabrirMemorando(memorando_id: string, userId: string, userNome: string): Promise<number> {
  const memos = await getMemorandos();
  const memoIndex = memos.findIndex((m) => m.id === memorando_id);
  if (memoIndex === -1) throw new Error("Memorando não encontrado");
  const memo = memos[memoIndex];

  // 1. Buscar CNHs remetidas no Geral deste memorando
  const geralList = await getGeralCNHs();
  const cnhsDoMemo = geralList.filter((c) => c.memorando_id === memorando_id);
  const idsParaRemover = cnhsDoMemo.map((c) => c.id);

  if (idsParaRemover.length > 0) {
    const novaGeral = geralList.filter((c) => c.memorando_id !== memorando_id);
    saveStoredList("geral", novaGeral);
    await deleteLocalGeralCNHsBulk(idsParaRemover);
  }

  // 2. Alterar status do memorando para "Em elaboração"
  memos[memoIndex] = { ...memo, status: "Em elaboração", remetido_em: undefined };
  saveStoredList("memorandos", memos);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("memorandos").update({ status: "Em elaboração", remetido_em: null }).eq("id", memorando_id);
      if (idsParaRemover.length > 0) {
        await supabase.from("geral_cnhs").delete().eq("memorando_id", memorando_id);
      }
    } catch (e) {
      console.warn("Aviso ao reabrir memorando no Supabase:", e);
    }
  }

  notifyDataSync("memorandos");
  notifyDataSync("geral");
  await logAuditoria(
    "memorandos",
    memo.numero,
    "Reabertura",
    userId,
    userNome,
    { status: memo.status },
    { status: "Em elaboração", cnhs_removidas: idsParaRemover.length }
  );

  return idsParaRemover.length;
}

// ============================================================================
// MÓDULO GERAL (Tabela Principal de CNHs - PROTOCOLO)
// ============================================================================

export async function sincronizarDataMovimentoComCriacao(): Promise<number> {
  const list = getStoredList<GeralCNH>("geral", SEED_GERAL);
  let updatedCount = 0;

  const listCorrigida = list.map((c) => {
    const dataCriacao = c.created_at || (c as any).criado_em || c.data_movimento;
    if (dataCriacao && (c.data_movimento !== dataCriacao || !c.created_at)) {
      updatedCount++;
      return {
        ...c,
        data_movimento: dataCriacao,
        created_at: dataCriacao
      };
    }
    return c;
  });

  if (updatedCount > 0) {
    saveStoredList("geral", listCorrigida);
  }

  if (isSupabaseConfigured() && listCorrigida.length > 0) {
    try {
      const payload = listCorrigida.map((g) => ({
        id: g.id,
        data_movimento: g.created_at || g.data_movimento,
        created_at: g.created_at || g.data_movimento
      }));
      for (let i = 0; i < payload.length; i += 100) {
        const batch = payload.slice(i, i + 100);
        await supabase.from("geral_cnhs").upsert(batch, { onConflict: "id" });
      }
    } catch (err) {
      console.error("Erro ao sincronizar datas de criação/movimentação no Supabase:", err);
    }
  }

  return updatedCount;
}

// ============================================================================
// DECLARAÇÃO DE RETIRADA DE CNH POR PROCURADOR / RESPONSÁVEL
// ============================================================================

export async function getDeclaracoes(): Promise<Declaracao[]> {
  await initStorage();
  const deletedIds = getDeletedIds("declaracoes");

  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Declaracao>("declaracoes", 1000, "created_at", false);
      if (data && Array.isArray(data)) {
        const validRemote: Declaracao[] = [];
        for (const d of data) {
          if (deletedIds.has(d.id)) {
            try {
              await supabase.from("declaracoes").delete().eq("id", d.id);
            } catch (e) {
              console.warn("Aviso ao excluir declaracao remota:", e);
            }
          } else {
            validRemote.push(d);
          }
        }
        const local = getStoredList<Declaracao>("declaracoes", SEED_DECLARACOES).filter((d) => !deletedIds.has(d.id));
        const remoteIds = new Set(validRemote.map((d) => d.id));
        const localOnly = local.filter((d) => !remoteIds.has(d.id) && !deletedIds.has(d.id));
        const merged = [...validRemote, ...localOnly].filter((d) => !deletedIds.has(d.id));
        saveStoredList("declaracoes", merged);
      }
    } catch (err) {
      console.warn("Aviso ao buscar declaracoes no Supabase:", err);
    }
  }

  const list = getStoredList<Declaracao>("declaracoes", SEED_DECLARACOES).filter((d) => !deletedIds.has(d.id));
  return list.sort((a, b) => new Date(b.created_at || b.data_emissao).getTime() - new Date(a.created_at || a.data_emissao).getTime());
}

export async function getNextDeclaracaoNumero(anoParam?: number): Promise<string> {
  const ano = anoParam || new Date().getFullYear();
  const declaracoes = await getDeclaracoes();
  
  let maxSeq = 0;
  for (const d of declaracoes) {
    if (d.ano === ano || (d.numero && d.numero.endsWith(`/${ano}`))) {
      const match = d.numero.match(/^(\d+)\//);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  // Se a última for 0109/2026, a próxima sugerida será 0110/2026
  const nextSeq = maxSeq + 1;
  const seqFormatted = String(nextSeq).padStart(4, "0");
  return `${seqFormatted}/${ano}`;
}

export async function createDeclaracao(
  data: Omit<Declaracao, "id" | "created_at" | "updated_at">,
  userId: string,
  userNome: string
): Promise<Declaracao> {
  await initStorage();
  const list = await getDeclaracoes();

  const numeroLimpo = data.numero.trim();
  if (list.some((d) => d.numero.toLowerCase() === numeroLimpo.toLowerCase())) {
    throw new Error(`Já existe uma declaração com o número "${numeroLimpo}".`);
  }

  const declId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `decl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const now = new Date().toISOString();
  const nova: Declaracao = {
    ...data,
    id: declId,
    numero: numeroLimpo,
    ano: data.ano || new Date().getFullYear(),
    created_at: now,
    usuario_id: userId,
    usuario_nome: userNome,
  };

  if (isSupabaseConfigured()) {
    try {
      let declPayload: any = { ...nova };
      let { error } = await supabase.from("declaracoes").insert([declPayload]);
      if (error && (error.message?.includes("procurador_telefone") || error.message?.includes("procurador_fone") || error.message?.includes("column"))) {
        if (declPayload.procurador_telefone) {
          declPayload.procurador_fone = declPayload.procurador_telefone;
          delete declPayload.procurador_telefone;
        }
        const retry = await supabase.from("declaracoes").insert([declPayload]);
        error = retry.error;
      }
      if (error) {
        console.warn("Aviso ao salvar declaração no Supabase (será mantido localmente):", error.message);
      }
    } catch (e) {
      console.warn("Erro ao salvar declaração no Supabase:", e);
    }
  }

  saveStoredList("declaracoes", [nova, ...list.filter((d) => d.id !== nova.id)]);
  notifyDataSync("declaracoes");

  await logAuditoria(
    "declaracoes",
    nova.numero,
    "Inclusão",
    userId,
    userNome,
    null,
    {
      numero: nova.numero,
      procurador: nova.procurador_nome,
      qtd_condutores: nova.condutores.length
    }
  );

  return nova;
}

export async function updateDeclaracao(
  id: string,
  data: Partial<Declaracao>,
  userId: string,
  userNome: string
): Promise<Declaracao> {
  await initStorage();
  const list = getStoredList<Declaracao>("declaracoes", SEED_DECLARACOES);
  const index = list.findIndex((d) => d.id === id);
  if (index === -1) throw new Error("Declaração não encontrada");
  const ant = list[index];

  const atualizado: Declaracao = {
    ...ant,
    ...data,
    updated_at: new Date().toISOString()
  };

  list[index] = atualizado;

  if (isSupabaseConfigured()) {
    try {
      let declPayload: any = { ...atualizado };
      let { error } = await supabase.from("declaracoes").update(declPayload).eq("id", id);
      if (error && (error.message?.includes("procurador_telefone") || error.message?.includes("procurador_fone") || error.message?.includes("column"))) {
        if (declPayload.procurador_telefone) {
          declPayload.procurador_fone = declPayload.procurador_telefone;
          delete declPayload.procurador_telefone;
        }
        const retry = await supabase.from("declaracoes").update(declPayload).eq("id", id);
        error = retry.error;
      }
      if (error) {
        console.warn("Aviso ao atualizar declaração no Supabase:", error.message);
      }
    } catch (e) {
      console.warn("Aviso ao atualizar declaração no Supabase:", e);
    }
  }

  saveStoredList("declaracoes", list);
  notifyDataSync("declaracoes");

  await logAuditoria("declaracoes", atualizado.numero, "Alteração", userId, userNome, ant, atualizado);
  return atualizado;
}

export async function deleteDeclaracao(id: string, userId: string, userNome: string): Promise<void> {
  await initStorage();
  const list = getStoredList<Declaracao>("declaracoes", SEED_DECLARACOES);
  const target = list.find((d) => d.id === id);

  addDeletedId("declaracoes", id);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("declaracoes").delete().eq("id", id);
    } catch (e) {
      console.warn("Aviso ao deletar declaração no Supabase:", e);
    }
  }

  const filtrados = list.filter((d) => d.id !== id);
  saveStoredList("declaracoes", filtrados);
  notifyDataSync("declaracoes");

  if (target) {
    await logAuditoria("declaracoes", target.numero, "Exclusão", userId, userNome, target, null);
  }
}

// ============================================================================
// CONTROLE DE LOTES DE CNHS (SUB-ABA PROTOCOLO GERAL)
// ============================================================================

export async function getLotes(): Promise<Lote[]> {
  await initStorage();
  const deletedIds = getDeletedIds("lotes");

  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Lote>("lotes", 1000, "data_recebimento", false);
      if (data && Array.isArray(data)) {
        const validRemote: Lote[] = [];
        for (const l of data) {
          if (deletedIds.has(l.id)) {
            try {
              await supabase.from("lotes").delete().eq("id", l.id);
            } catch (e) {
              console.warn("Aviso ao excluir lote remoto:", e);
            }
          } else {
            validRemote.push(l);
          }
        }
        const local = getStoredList<Lote>("lotes", SEED_LOTES).filter((l) => !deletedIds.has(l.id));
        const remoteIds = new Set(validRemote.map((l) => l.id));
        const localOnly = local.filter((l) => !remoteIds.has(l.id) && !deletedIds.has(l.id));
        const merged = [...validRemote, ...localOnly].filter((l) => !deletedIds.has(l.id));
        saveStoredList("lotes", merged);
        try {
          if (dexieDb.lotes) {
            await dexieDb.lotes.bulkPut(merged);
          }
        } catch {}
      }
    } catch (err) {
      console.warn("Aviso ao buscar lotes no Supabase:", err);
    }
  }

  const list = getStoredList<Lote>("lotes", SEED_LOTES).filter((l) => !deletedIds.has(l.id));
  return list.sort((a, b) => {
    if (b.numero !== a.numero) return b.numero - a.numero;
    return new Date(b.data_recebimento || b.created_at).getTime() - new Date(a.data_recebimento || a.created_at).getTime();
  });
}

export async function getLoteById(id: string): Promise<Lote | null> {
  const lotes = await getLotes();
  return lotes.find((l) => l.id === id) || null;
}

export async function getNextLoteNumero(): Promise<number> {
  const lotes = await getLotes();
  if (lotes.length === 0) return 1;
  const maxNum = Math.max(...lotes.map((l) => Number(l.numero) || 0));
  return maxNum > 0 ? maxNum + 1 : 1;
}

export async function createLote(
  data: LoteInput,
  userId: string,
  userNome: string
): Promise<Lote> {
  await initStorage();
  const list = await getLotes();

  const num = Number(data.numero);
  if (isNaN(num) || num <= 0) {
    throw new Error("O número do Lote deve ser um valor numérico positivo.");
  }

  if (list.some((l) => Number(l.numero) === num)) {
    throw new Error(`Já existe um Lote cadastrado com o número ${num}.`);
  }

  const docCount = Number(data.documentos_impressos);
  if (isNaN(docCount) || docCount < 0) {
    throw new Error("A quantidade de documentos impressos deve ser um número maior ou igual a zero.");
  }

  const loteId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `lote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const now = new Date().toISOString();
  const novo: Lote = {
    id: loteId,
    numero: num,
    data_recebimento: data.data_recebimento || now.split("T")[0],
    documentos_impressos: docCount,
    pdf_nome: data.pdf_nome || undefined,
    pdf_tamanho: data.pdf_tamanho || undefined,
    pdf_url: data.pdf_url || undefined,
    observacao: data.observacao?.trim() || undefined,
    usuario_id: userId,
    usuario_nome: userNome,
    created_at: now,
    updated_at: now
  };

  if (isSupabaseConfigured()) {
    try {
      let lotePayload: any = { ...novo };
      let { error } = await supabase.from("lotes").insert([lotePayload]);
      if (error && (error.message?.includes("pdf_tamanho") || error.message?.includes("column"))) {
        delete lotePayload.pdf_tamanho;
        const retry = await supabase.from("lotes").insert([lotePayload]);
        error = retry.error;
      }
      if (error) {
        console.warn("Aviso ao salvar lote no Supabase (mantido localmente):", error.message);
      }
    } catch (e) {
      console.warn("Erro ao inserir lote no Supabase:", e);
    }
  }

  saveStoredList("lotes", [novo, ...list.filter((l) => l.id !== novo.id)]);
  try {
    if (dexieDb.lotes) {
      await dexieDb.lotes.put(novo);
    }
  } catch {}
  notifyDataSync("lotes");

  await logAuditoria(
    "lotes",
    String(novo.numero),
    "Inclusão",
    userId,
    userNome,
    null,
    {
      numero: novo.numero,
      data_recebimento: novo.data_recebimento,
      documentos_impressos: novo.documentos_impressos,
      possui_pdf: !!novo.pdf_url
    }
  );

  return novo;
}

export async function updateLote(
  id: string,
  data: Partial<LoteInput>,
  userId: string,
  userNome: string
): Promise<Lote> {
  await initStorage();
  const list = getStoredList<Lote>("lotes", SEED_LOTES);
  const index = list.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("Lote não encontrado");
  const ant = list[index];

  if (data.numero !== undefined) {
    const num = Number(data.numero);
    if (isNaN(num) || num <= 0) {
      throw new Error("O número do Lote deve ser um valor numérico positivo.");
    }
    if (list.some((l) => l.id !== id && Number(l.numero) === num)) {
      throw new Error(`Já existe outro Lote cadastrado com o número ${num}.`);
    }
  }

  const atualizado: Lote = {
    ...ant,
    ...data,
    numero: data.numero !== undefined ? Number(data.numero) : ant.numero,
    documentos_impressos: data.documentos_impressos !== undefined ? Number(data.documentos_impressos) : ant.documentos_impressos,
    updated_at: new Date().toISOString()
  };

  list[index] = atualizado;

  if (isSupabaseConfigured()) {
    try {
      let updatePayload: any = { ...atualizado };
      let { error } = await supabase.from("lotes").update(updatePayload).eq("id", id);
      if (error && (error.message?.includes("pdf_tamanho") || error.message?.includes("column"))) {
        delete updatePayload.pdf_tamanho;
        const retry = await supabase.from("lotes").update(updatePayload).eq("id", id);
        error = retry.error;
      }
      if (error) {
        console.warn("Aviso ao atualizar lote no Supabase:", error.message);
      }
    } catch (e) {
      console.warn("Erro ao atualizar lote no Supabase:", e);
    }
  }

  saveStoredList("lotes", list);
  try {
    if (dexieDb.lotes) {
      await dexieDb.lotes.put(atualizado);
    }
  } catch {}
  notifyDataSync("lotes");

  await logAuditoria("lotes", String(atualizado.numero), "Alteração", userId, userNome, ant, atualizado);
  return atualizado;
}

export async function deleteLote(id: string, userId: string, userNome: string): Promise<void> {
  await initStorage();
  const list = getStoredList<Lote>("lotes", SEED_LOTES);
  const target = list.find((l) => l.id === id);

  addDeletedId("lotes", id);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("lotes").delete().eq("id", id);
    } catch (e) {
      console.warn("Aviso ao deletar lote no Supabase:", e);
    }
  }

  const filtrados = list.filter((l) => l.id !== id);
  saveStoredList("lotes", filtrados);
  try {
    if (dexieDb.lotes) {
      await dexieDb.lotes.delete(id);
    }
  } catch {}
  notifyDataSync("lotes");

  if (target) {
    await logAuditoria("lotes", String(target.numero), "Exclusão", userId, userNome, target, null);
  }
}

export async function getGeralCNHs(): Promise<GeralCNH[]> {
  await initStorage();
  let rawList: GeralCNH[] = await getLocalGeralCNHs();

  // Se o Supabase estiver configurado:
  if (isSupabaseConfigured()) {
    if (rawList.length === 0) {
      // Primeira carga: sincronização paginada completa
      try {
        await syncGeralWithSupabase(true);
        rawList = await getLocalGeralCNHs();
      } catch (err) {
        console.warn("Aviso ao sincronizar inicialmente com Supabase:", err);
      }
    } else {
      // Em segundo plano (não bloqueia UI): busca alterações/recebimentos recentes de outras máquinas
      syncGeralWithSupabase(false).catch((err) => {
        console.warn("Aviso na sincronização delta em segundo plano:", err);
      });
    }
  }

  // Se ainda assim estiver vazio, carrega sementes estáticas
  if (rawList.length === 0) {
    rawList = getStoredList<GeralCNH>("geral", SEED_GERAL);
    if (rawList.length > 0) {
      saveLocalGeralCNHsBulk(rawList).catch(() => {});
    }
  }

  // Deduplicar CNHs por ID único e assegurar ordem numérica estritamente única para cada CNH
  const seenCnhIds = new Set<string>();
  const seenCnhOrdens = new Set<number>();
  let currentMaxOrdem = rawList.reduce((max, item) => Math.max(max, item.ordem || 0), 0);

  const cleanRawList: GeralCNH[] = [];
  for (const c of rawList) {
    if (!c.id || seenCnhIds.has(c.id)) continue;
    seenCnhIds.add(c.id);

    let finalOrdem = c.ordem;
    if (!finalOrdem || isNaN(finalOrdem) || seenCnhOrdens.has(finalOrdem)) {
      currentMaxOrdem++;
      finalOrdem = currentMaxOrdem;
    }
    seenCnhOrdens.add(finalOrdem);

    cleanRawList.push({
      ...c,
      ordem: finalOrdem
    });
  }

  const seedByOrdem = new Map(SEED_GERAL.map((s) => [s.ordem, s]));
  const seedById = new Map(SEED_GERAL.map((s) => [s.id, s]));
  const seedByNormNome = new Map(SEED_GERAL.map((s) => [normalizeSearch(s.nome), s]));

  const recordsToHeal: GeralCNH[] = [];

  const list = cleanRawList.map((c) => {
    const seed = seedByOrdem.get(c.ordem) || seedById.get(c.id) || (c.nome ? seedByNormNome.get(normalizeSearch(c.nome)) : undefined);
    const dataMov = c.data_movimento || c.created_at || (c as any).criado_em || (seed ? seed.data_movimento : undefined);
    
    const usrId = (c.usuario_id && c.usuario_id !== "sistema") ? c.usuario_id : (seed ? seed.usuario_id : c.usuario_id);
    const usrNome = (c.usuario_nome && c.usuario_nome !== "Agente DETRAN" && c.usuario_nome !== "sistema" && c.usuario_nome !== "-")
      ? c.usuario_nome
      : (seed ? seed.usuario_nome : c.usuario_nome);

    const cpf = (c.cpf && c.cpf.trim() !== "") ? c.cpf.trim() : (seed && seed.cpf ? seed.cpf.trim() : c.cpf);
    const gaveta = (c.gaveta && c.gaveta.trim() !== "") ? c.gaveta.trim() : (seed && seed.gaveta ? seed.gaveta.trim() : c.gaveta);
    const reparticao = (c.reparticao && c.reparticao.trim() !== "") ? c.reparticao.trim() : (seed && seed.reparticao ? seed.reparticao.trim() : c.reparticao);

    if (
      (c.cpf !== cpf && cpf) ||
      (c.usuario_nome !== usrNome && usrNome) ||
      (c.gaveta !== gaveta && gaveta) ||
      (c.reparticao !== reparticao && reparticao)
    ) {
      recordsToHeal.push({
        ...c,
        cpf,
        usuario_id: usrId,
        usuario_nome: usrNome,
        gaveta,
        reparticao
      });
    }

    return {
      ...c,
      cpf,
      gaveta,
      reparticao,
      data_movimento: dataMov,
      usuario_id: usrId,
      usuario_nome: usrNome
    };
  });

  if (recordsToHeal.length > 0) {
    saveLocalGeralCNHsBulk(recordsToHeal, false).catch(() => {});
  }

  const usuarios = await getUsuarios();
  const responsaveis = await getResponsaveis();
  const memorandos = await getMemorandos();
  const candidatos = await getCandidatosAll();

  return list.map((c) => {
    const usr = usuarios.find((u) => u.id === c.usuario_id);
    const seed = seedByOrdem.get(c.ordem) || seedById.get(c.id) || (c.nome ? seedByNormNome.get(normalizeSearch(c.nome)) : undefined);

    let effectiveRespId = c.responsavel_id;
    let effectiveRespNome = c.responsavel_nome;

    // Se o registro perdeu o vínculo original com o despachante/procurador ou foi sobrescrito para Proprietário, restaura da semente original
    if (
      seed &&
      seed.responsavel_id &&
      seed.responsavel_id !== CANONICAL_PROPRIETARIO_ID &&
      seed.responsavel_id !== "e2335b1e" &&
      (!effectiveRespId || effectiveRespId === CANONICAL_PROPRIETARIO_ID || effectiveRespId === "e2335b1e")
    ) {
      effectiveRespId = seed.responsavel_id;
      if (seed.responsavel_nome && !seed.responsavel_nome.toLowerCase().includes("propriet")) {
        effectiveRespNome = seed.responsavel_nome.toUpperCase();
      }
    }

    const resp = responsaveis.find(
      (r) =>
        r.id === effectiveRespId ||
        r.id === effectiveRespNome ||
        (r.nome && effectiveRespNome && r.nome.trim().toLowerCase() === effectiveRespNome.trim().toLowerCase()) ||
        (r.nome && effectiveRespId && r.nome.trim().toLowerCase() === effectiveRespId.trim().toLowerCase())
    );
    const memo = memorandos.find((m) => m.id === c.memorando_id);
    const cand = candidatos.find((cand) => cand.id === c.candidato_id);

    let displayRespNome = resp ? resp.nome : effectiveRespNome;
    if (displayRespNome) {
      const matchResp = responsaveis.find((r) => r.id === displayRespNome);
      if (matchResp) {
        displayRespNome = matchResp.nome;
      }
    }
    if ((!displayRespNome || displayRespNome === "-") && effectiveRespId) {
      const matchResp = responsaveis.find((r) => r.id === effectiveRespId);
      if (matchResp) {
        displayRespNome = matchResp.nome;
      }
    }

    const nomeCalculado = (c.nome && c.nome.trim() !== "")
      ? c.nome
      : (cand && cand.nome && cand.nome.trim() !== "" ? cand.nome : (seed ? seed.nome : ""));

    const cpfCalculado = (c.cpf && c.cpf.trim() !== "")
      ? c.cpf
      : (cand && cand.cpf && cand.cpf.trim() !== "" ? cand.cpf : (seed && seed.cpf ? seed.cpf : ""));

    const telefoneCalculado = (c.telefone && c.telefone.trim() !== "")
      ? c.telefone
      : (cand && cand.telefone && cand.telefone.trim() !== "" ? cand.telefone : (seed ? seed.telefone : ""));

    // Resolução de gaveta e repartição garantindo que nunca fiquem vazias
    let effectiveGaveta = (c.gaveta && c.gaveta.trim() !== "") ? c.gaveta : (seed && seed.gaveta ? seed.gaveta : "");
    let effectiveReparticao = (c.reparticao && c.reparticao.trim() !== "") ? c.reparticao : (seed && seed.reparticao ? seed.reparticao : "");

    if (c.situacao === "Recebida" && (!effectiveGaveta || !effectiveReparticao)) {
      const char = getInitialChar(nomeCalculado || c.nome || (seed ? seed.nome : ""));
      const m = SEED_MAPEAMENTO.find((item) => item.inicial.toUpperCase() === char && item.ativo !== false);
      if (m) {
        effectiveGaveta = effectiveGaveta || m.gaveta;
        effectiveReparticao = effectiveReparticao || m.reparticao;
      }
    }

    let displayUsrNome = c.usuario_nome;
    if (!displayUsrNome || displayUsrNome === "Agente DETRAN" || displayUsrNome === "sistema" || displayUsrNome === "-") {
      if (seed && seed.usuario_nome) {
        displayUsrNome = seed.usuario_nome;
      }
    }
    if (usr) {
      displayUsrNome = usr.nome || usr.nome_curto || displayUsrNome;
    }
    if (!displayUsrNome || displayUsrNome === "-") {
      displayUsrNome = c.situacao === "Entregue" ? "Agente DETRAN" : "-";
    }

    return {
      ...c,
      gaveta: effectiveGaveta,
      reparticao: effectiveReparticao,
      nome: nomeCalculado,
      cpf: cpfCalculado,
      telefone: telefoneCalculado,
      usuario_nome: displayUsrNome,
      responsavel_id: resp ? resp.id : effectiveRespId,
      responsavel_nome: displayRespNome && displayRespNome !== "-" ? displayRespNome : (effectiveRespNome && !responsaveis.some(r => r.id === effectiveRespNome) ? effectiveRespNome : "-"),
      memorando_numero: memo ? memo.numero : (c.memorando_numero || undefined),
      remessa: memo ? (memo.remessa || memo.numero) : (c.remessa || undefined)
    };
  }).sort((a, b) => b.ordem - a.ordem);
}

// Interface e Função para Contador de Consultas Públicas Mobile por Cidadão
export function getPublicSearchCount(): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem("detran_public_search_count");
  if (stored) {
    const val = parseInt(stored, 10);
    if (!isNaN(val) && val >= 0) return val;
  }
  return getMaxAcessoCidadaoNumero();
}

export async function fetchPublicSearchCount(): Promise<number> {
  if (isSupabaseConfigured()) {
    try {
      // 1. Busca o maior número sequencial registrado na tabela acessos_cidadao do Supabase
      const { data: maxRow, error: maxErr } = await supabase
        .from("acessos_cidadao")
        .select("numero")
        .order("numero", { ascending: false })
        .limit(1);

      if (!maxErr && Array.isArray(maxRow) && maxRow.length > 0 && typeof maxRow[0]?.numero === "number") {
        const supMax = maxRow[0].numero;
        const currentLocalMax = getMaxAcessoCidadaoNumero();
        const absoluteMax = Math.max(supMax, currentLocalMax);
        if (typeof window !== "undefined") {
          localStorage.setItem("detran_acessos_cidadao_max_numero", absoluteMax.toString());
          localStorage.setItem("detran_public_search_count", absoluteMax.toString());
        }
        return absoluteMax;
      }

      // Fallback para contagem total de linhas
      const { count, error } = await supabase
        .from("acessos_cidadao")
        .select("*", { count: "exact", head: true });

      if (!error && typeof count === "number") {
        const currentLocalMax = getMaxAcessoCidadaoNumero();
        const absoluteMax = Math.max(count, currentLocalMax);
        if (typeof window !== "undefined") {
          localStorage.setItem("detran_acessos_cidadao_max_numero", absoluteMax.toString());
          localStorage.setItem("detran_public_search_count", absoluteMax.toString());
        }
        return absoluteMax;
      }
    } catch (err) {
      console.warn("Aviso ao buscar contagem exata de acessos do Supabase:", err);
    }
  }

  // Fallback para logs locais/sincronizados
  const count = getMaxAcessoCidadaoNumero();
  if (typeof window !== "undefined") {
    localStorage.setItem("detran_public_search_count", count.toString());
  }
  return count;
}

export function incrementPublicSearchCount(): number {
  if (typeof window === "undefined") return 0;
  const current = getMaxAcessoCidadaoNumero();
  const next = current + 1;
  try {
    localStorage.setItem("detran_acessos_cidadao_max_numero", next.toString());
    localStorage.setItem("detran_public_search_count", next.toString());
  } catch {}
  notifyDataSync("acessos_cidadao");
  return next;
}

// ============================================================================
// LOGS DE ACESSO DO CIDADÃO PELO APLICATIVO E CONSULTA PÚBLICA
// ============================================================================

/**
 * Retorna o maior número sequencial já atribuído a uma consulta de cidadão
 */
export function getMaxAcessoCidadaoNumero(): number {
  let max = 0;
  if (typeof window !== "undefined") {
    const storedMax = localStorage.getItem("detran_acessos_cidadao_max_numero");
    if (storedMax) {
      const val = parseInt(storedMax, 10);
      if (!isNaN(val) && val > max) max = val;
    }
    const countStored = localStorage.getItem("detran_public_search_count");
    if (countStored) {
      const val = parseInt(countStored, 10);
      if (!isNaN(val) && val > max) max = val;
    }
  }

  const logs = getAcessosCidadaoLogs();
  for (const log of logs) {
    if (typeof log.numero === "number" && !isNaN(log.numero) && log.numero > max) {
      max = log.numero;
    }
  }

  // Se nenhum log existir ou for novo, sincroniza com o tamanho do seed
  if (max === 0 && logs.length > 0) {
    max = logs.length;
  }

  return max;
}

export function getAcessosCidadaoLogs(): AcessoCidadaoLog[] {
  if (memoryStore["acessos_cidadao"] && Array.isArray(memoryStore["acessos_cidadao"]) && memoryStore["acessos_cidadao"].length > 0) {
    return memoryStore["acessos_cidadao"] as AcessoCidadaoLog[];
  }
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("detran_acessos_cidadao_logs");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryStore["acessos_cidadao"] = parsed;
        return parsed;
      }
    } catch {
      // fallback
    }
  }

  const seeded = generateSeedAcessosCidadaoLogs();
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(seeded));
    } catch {}
    const maxSeed = seeded.reduce((m, s) => Math.max(m, s.numero || 0), seeded.length);
    localStorage.setItem("detran_acessos_cidadao_max_numero", maxSeed.toString());
    localStorage.setItem("detran_public_search_count", maxSeed.toString());
  }
  memoryStore["acessos_cidadao"] = seeded;
  return seeded;
}

export async function fetchAcessosCidadaoLogs(): Promise<AcessoCidadaoLog[]> {
  const local = getAcessosCidadaoLogs();
  if (!isSupabaseConfigured()) {
    return local;
  }
  try {
    const data = await fetchAllRowsFromSupabase<AcessoCidadaoLog>("acessos_cidadao", 1000, "data_hora", false);

    if (data && data.length > 0) {
      const map = new Map<string, AcessoCidadaoLog>();
      data.forEach((d: any) => map.set(d.id, d));
      local.forEach((l) => {
        if (!map.has(l.id)) {
          map.set(l.id, l);
        }
      });
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
      );

      // Deduplicação semântica automática para que o usuário NUNCA veja múltiplos registros do mesmo dispositivo/CPF no mesmo horário
      const deduplicated: AcessoCidadaoLog[] = [];
      const seenTimeMap = new Map<string, number>();
      const DEDUP_WINDOW = 3 * 60 * 1000;

      for (const item of merged) {
        const cleanCpf = (item.cpf || "").replace(/\D/g, "");
        const t = new Date(item.data_hora).getTime();
        const deviceKey = (item.dispositivo || "").toLowerCase().trim();
        
        // Chave por CPF se houver CPF, ou por dispositivo
        const primaryKey = cleanCpf.length >= 9 ? `cpf_${cleanCpf}` : `dev_${deviceKey}`;
        const lastT = seenTimeMap.get(primaryKey);

        if (lastT !== undefined && Math.abs(t - lastT) < DEDUP_WINDOW) {
          // Ignora registro repetido no mesmo horário
          continue;
        }

        // Também valida se o mesmo dispositivo acessou no mesmo segundo
        if (deviceKey && deviceKey !== "navegador web / mobile") {
          const devLastT = seenTimeMap.get(`dev_${deviceKey}`);
          if (devLastT !== undefined && Math.abs(t - devLastT) < 30 * 1000) {
            continue;
          }
          seenTimeMap.set(`dev_${deviceKey}`, t);
        }

        seenTimeMap.set(primaryKey, t);
        deduplicated.push(item);
      }

      // Encontra o maior número presente na base
      let highestNum = 0;
      deduplicated.forEach((item) => {
        if (typeof item.numero === "number" && !isNaN(item.numero) && item.numero > highestNum) {
          highestNum = item.numero;
        }
      });

      if (typeof window !== "undefined") {
        if (highestNum > 0) {
          const currentStored = parseInt(localStorage.getItem("detran_acessos_cidadao_max_numero") || "0", 10);
          const absoluteMax = Math.max(highestNum, currentStored);
          localStorage.setItem("detran_acessos_cidadao_max_numero", absoluteMax.toString());
          localStorage.setItem("detran_public_search_count", absoluteMax.toString());
        }
        localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(deduplicated.slice(0, 1000)));
      }
      return deduplicated;
    }
  } catch (e) {
    console.warn("Aviso ao sincronizar acessos do cidadão do Supabase:", e);
  }
  return local;
}

// Identificador único persistente do dispositivo do usuário (para isolar logs e evitar duplicidades)
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem("detran_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).substring(2, 7) + Date.now().toString(36).substring(4, 8);
      localStorage.setItem("detran_device_id", id);
    }
    return id;
  } catch {
    return "dev_default";
  }
}

// Detecção precisa do modelo / plataforma / navegador do dispositivo do cidadão
export function detectUserDevice(): string {
  if (typeof window === "undefined" || !navigator) return "Navegador Web";
  const ua = navigator.userAgent || "";
  let platform = "Navegador Web";

  if (/android/i.test(ua)) {
    platform = "Android (Mobile)";
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    platform = "Apple iOS (Mobile)";
  } else if (/windows/i.test(ua)) {
    platform = "Windows PC";
  } else if (/macintosh|mac os x/i.test(ua)) {
    platform = "Mac OS";
  } else if (/linux/i.test(ua)) {
    platform = "Linux";
  }

  let browser = "";
  if (/edg/i.test(ua)) {
    browser = "Edge";
  } else if (/chrome|crios/i.test(ua) && !/opr/i.test(ua)) {
    browser = "Chrome";
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = "Safari";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  }

  const devTag = getOrCreateDeviceId().slice(0, 8);
  return browser ? `${platform} • ${browser} [${devTag}]` : `${platform} [${devTag}]`;
}

// Memória em tempo de execução para prevenir inserções simultâneas assíncronas do mesmo CPF ou dispositivo
const recentLogTimestampsPerCpf = new Map<string, number>();
const recentLogTimestampsPerDevice = new Map<string, number>();

export function registrarAcessoCidadaoLog(logData: Omit<AcessoCidadaoLog, "id" | "data_hora">): AcessoCidadaoLog {
  const cleanCpfDigits = (logData.cpf || "").replace(/\D/g, "");
  const now = Date.now();
  const DEDUPLICATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutos de janela anti-duplicação por CPF
  const DEVICE_DEDUP_WINDOW_MS = 30 * 1000;     // 30 segundos de janela por dispositivo físico

  // Garante que o dispositivo venha identificado com hardware/navegador real, e não com string genérica
  const rawDisp = logData.dispositivo || "";
  const resolvedDispositivo = (!rawDisp || rawDisp === "Navegador Web / Mobile") ? detectUserDevice() : rawDisp;
  const currentDeviceId = getOrCreateDeviceId();

  // 1. Verificação em memória para requisições concorrentes disparadas em rajada (ex: duplo-toque na tela)
  if (cleanCpfDigits.length >= 9) {
    const lastTimestamp = recentLogTimestampsPerCpf.get(cleanCpfDigits);
    if (lastTimestamp && (now - lastTimestamp) < DEDUPLICATION_WINDOW_MS) {
      const existingLogs = getAcessosCidadaoLogs();
      const match = existingLogs.find(l => (l.cpf || "").replace(/\D/g, "") === cleanCpfDigits);
      if (match) {
        return match;
      }
    }
  }

  // Verificação por dispositivo em memória
  const lastDeviceTime = recentLogTimestampsPerDevice.get(currentDeviceId);
  if (lastDeviceTime && (now - lastDeviceTime) < DEVICE_DEDUP_WINDOW_MS) {
    const existingLogs = getAcessosCidadaoLogs();
    if (existingLogs.length > 0) {
      const match = existingLogs.find(l => {
        const lCpf = (l.cpf || "").replace(/\D/g, "");
        return lCpf === cleanCpfDigits;
      });
      if (match) return match;
    }
  }

  const currentLogs = getAcessosCidadaoLogs();

  // 2. Verificação no histórico persistido: evita registros duplicados para o mesmo CPF dentro de 5 minutos
  if (cleanCpfDigits.length >= 9) {
    const existingRecent = currentLogs.find((l) => {
      const lCpf = (l.cpf || "").replace(/\D/g, "");
      if (lCpf !== cleanCpfDigits) return false;
      const logTime = new Date(l.data_hora).getTime();
      return Math.abs(now - logTime) < DEDUPLICATION_WINDOW_MS;
    });

    if (existingRecent) {
      recentLogTimestampsPerCpf.set(cleanCpfDigits, now);
      recentLogTimestampsPerDevice.set(currentDeviceId, now);
      return existingRecent;
    }
  }

  // Registra timestamps para travar rajadas concorrentes
  if (cleanCpfDigits.length >= 9) {
    recentLogTimestampsPerCpf.set(cleanCpfDigits, now);
  }
  recentLogTimestampsPerDevice.set(currentDeviceId, now);

  const currentMax = getMaxAcessoCidadaoNumero();
  const nextNumero = currentMax + 1;

  // Gerar ID como UUID padrão para total conformidade com o PostgreSQL do Supabase
  const logUuid = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : (toValidUUID(`log-${Date.now()}-${Math.random()}`) || "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12));

  const newLog: AcessoCidadaoLog = {
    id: logUuid,
    numero: nextNumero,
    data_hora: new Date().toISOString(),
    ...logData,
    dispositivo: resolvedDispositivo
  };
  const updated = [newLog, ...currentLogs];
  if (typeof window !== "undefined") {
    localStorage.setItem("detran_acessos_cidadao_max_numero", nextNumero.toString());
    localStorage.setItem("detran_public_search_count", nextNumero.toString());
    localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(updated.slice(0, 1000)));
  }

  // Enviar para Supabase em segundo plano se configurado
  if (isSupabaseConfigured()) {
    (async () => {
      try {
        await supabase.from("acessos_cidadao").insert([{
          id: newLog.id,
          numero: newLog.numero,
          data_hora: newLog.data_hora,
          cpf: newLog.cpf,
          nome_titular: newLog.nome_titular || null,
          situacao: newLog.situacao,
          resultado_status: newLog.resultado_status,
          canal: newLog.canal,
          dispositivo: newLog.dispositivo || null,
          cidade_origem: newLog.cidade_origem || null,
          ip_mascarado: newLog.ip_mascarado || null
        }]);
      } catch {
        // Tabela acessos_cidadao pode ainda não estar criada no Supabase
      }
    })();
  }

  notifyDataSync("acessos_cidadao");
  return newLog;
}

/**
 * Identifica e remove registros duplicados de acesso do cidadão ocorridos
 * para o mesmo CPF ou mesmo dispositivo em intervalo inferior a 3 minutos.
 */
export async function consolidarAcessosCidadaoDuplicados(): Promise<{ removidos: number; restantes: number }> {
  const allLogs = getAcessosCidadaoLogs();
  if (!allLogs || allLogs.length === 0) {
    return { removidos: 0, restantes: 0 };
  }

  // Ordena cronologicamente crescente para manter o registro original mais antigo
  const sorted = [...allLogs].sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());

  const mantidos: AcessoCidadaoLog[] = [];
  const idsParaRemover: string[] = [];
  const THREE_MINUTES = 3 * 60 * 1000;

  for (const log of sorted) {
    const cleanCpf = (log.cpf || "").replace(/\D/g, "");
    const logTime = new Date(log.data_hora).getTime();
    const logDisp = (log.dispositivo || "").toLowerCase().trim();

    // Busca se já temos um registro mantido para o mesmo CPF ou mesmo dispositivo dentro da janela
    const duplicateOf = mantidos.find((m) => {
      const mTime = new Date(m.data_hora).getTime();
      if (Math.abs(logTime - mTime) > THREE_MINUTES) return false;

      const mCpf = (m.cpf || "").replace(/\D/g, "");
      if (cleanCpf && mCpf && mCpf === cleanCpf) return true;

      const mDisp = (m.dispositivo || "").toLowerCase().trim();
      if (logDisp && mDisp && logDisp === mDisp && Math.abs(logTime - mTime) < 30 * 1000) {
        return true;
      }
      return false;
    });

    if (duplicateOf) {
      idsParaRemover.push(log.id);
    } else {
      mantidos.push(log);
    }
  }

  if (idsParaRemover.length > 0) {
    // Reordena os mantidos em ordem cronológica decrescente (mais recente primeiro)
    mantidos.sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());

    if (typeof window !== "undefined") {
      localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(mantidos.slice(0, 1000)));
      const maxNum = mantidos.reduce((max, l) => Math.max(max, l.numero || 0), mantidos.length);
      localStorage.setItem("detran_acessos_cidadao_max_numero", maxNum.toString());
      localStorage.setItem("detran_public_search_count", maxNum.toString());
    }

    if (isSupabaseConfigured()) {
      try {
        for (let i = 0; i < idsParaRemover.length; i += 50) {
          const batch = idsParaRemover.slice(i, i + 50);
          await supabase.from("acessos_cidadao").delete().in("id", batch);
        }
      } catch (err) {
        console.warn("Aviso ao deletar duplicatas do Supabase:", err);
      }
    }

    notifyDataSync("acessos_cidadao");
  }

  return { removidos: idsParaRemover.length, restantes: mantidos.length };
}

function generateSeedAcessosCidadaoLogs(): AcessoCidadaoLog[] {
  const nomesSample = [
    { nome: "ABDIS BRITO DOS SANTOS", cpf: "045.181.162-32", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ABEDIAS DA SILVA LEAL", cpf: "792.633.802-87", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ABEL DE SOUSA ARAUJO", cpf: "042.898.372-39", situacao: "Remetida", status: "EM_PROCESSAMENTO" },
    { nome: "ABIDIAS PACHECO NUNES", cpf: "717.244.602-00", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ABIMAEL DE BRITO LIBORIO", cpf: "706.503.232-97", situacao: "Entregue", status: "ENTREGUE" },
    { nome: "ABIMAEL REGO MORAES", cpf: "029.001.052-77", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ABIMAEL SOUSA", cpf: "019.964.462-40", situacao: "Pendente", status: "EM_PROCESSAMENTO" },
    { nome: "ABRAAO CORREA LIMA", cpf: "043.521.803-43", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ABRAAO DA SILVA GOMES", cpf: "046.824.702-56", situacao: "Entregue", status: "ENTREGUE" },
    { nome: "ACICLEIA PEREIRA SILVA", cpf: "006.878.212-82", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ACIR FAGUNDES DE OLIVEIRA", cpf: "834.656.189-04", situacao: "Remetida", status: "EM_PROCESSAMENTO" },
    { nome: "ACLEI CIRINO DE OLIVEIRA SANTOS", cpf: "044.179.016-00", situacao: "Pendente", status: "EM_PROCESSAMENTO" },
    { nome: "ADAILSON BORGES GOMES", cpf: "034.863.472-25", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ADAILSON MARTINS SOUZA", cpf: "702.345.582-53", situacao: "Entregue", status: "ENTREGUE" },
    { nome: "ADAILTON SANTOS CAMPELO", cpf: "056.268.833-12", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ADAISE DA SILVA LIMA", cpf: "033.526.552-94", situacao: "Remetida", status: "EM_PROCESSAMENTO" },
    { nome: "ADALBERTO PEREIRA SOARES", cpf: "032.727.622-30", situacao: "Recebida", status: "DISPONIVEL" },
    { nome: "ADALBERTO VIANA AVINTE", cpf: "739.181.992-15", situacao: "Entregue", status: "ENTREGUE" },
    { nome: "ADALTO GERALDO ALENCAR", cpf: "495.902.512-34", situacao: "Não Encontrada", status: "NAO_ENCONTRADA" },
  ];

  const canais: ("App Android" | "App iOS" | "PWA Web Mobile" | "QR Code Totem" | "Web Browser")[] = [
    "App Android", "App Android", "App iOS", "PWA Web Mobile", "QR Code Totem", "Web Browser"
  ];

  const dispositivos = [
    "Samsung Galaxy S23", "iPhone 14 Pro", "Motorola Edge 40", "Xiaomi Redmi Note 12",
    "iPhone 13", "Chrome Mobile (Android)", "Safari Mobile (iOS)", "Totem DETRAN Sede"
  ];

  const cidades = [
    "Belém", "Ananindeua", "Marituba", "Santarém", "Castanhal", "Paragominas", "Altamira", "Marabá", "Tucuruí"
  ];

  const now = new Date();
  const logs: AcessoCidadaoLog[] = [];

  for (let i = 0; i < 120; i++) {
    const item = nomesSample[i % nomesSample.length];
    const canal = canais[i % canais.length];
    const disp = dispositivos[i % dispositivos.length];
    const cidade = cidades[i % cidades.length];

    let hoursAgo = 0;
    if (i < 35) {
      hoursAgo = Math.floor(Math.random() * 12);
    } else if (i < 60) {
      hoursAgo = 24 + Math.floor(Math.random() * 20);
    } else if (i < 90) {
      hoursAgo = (2 + Math.floor(Math.random() * 5)) * 24 + Math.floor(Math.random() * 20);
    } else {
      hoursAgo = (8 + Math.floor(Math.random() * 32)) * 24 + Math.floor(Math.random() * 20);
    }

    const logDate = new Date(now.getTime() - hoursAgo * 3600 * 1000);

    logs.push({
      id: `seed-log-${i + 1}`,
      data_hora: logDate.toISOString(),
      cpf: item.cpf,
      nome_titular: item.nome,
      situacao: item.situacao as any,
      resultado_status: item.status as any,
      canal: canal,
      dispositivo: disp,
      cidade_origem: cidade,
      ip_mascarado: `177.136.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}`
    });
  }

  // Sort chronologically ascending to assign sequence number 1..N
  logs.sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
  logs.forEach((log, idx) => {
    log.numero = idx + 1;
  });

  return logs.sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
}

export interface ResultadoConsultaPublica {
  cpfConsultado: string;
  cnhEncontrada: GeralCNH | null;
  historico: GeralCNH[];
  statusDisponibilidade: "DISPONIVEL" | "ENTREGUE" | "EM_PROCESSAMENTO" | "NAO_ENCONTRADA";
  mensagem: string;
  possuiDuplicatas?: boolean;
}

/**
 * Ordena registros de CNH do mesmo CPF/candidato priorizando:
 * 1. Data da atualização da situação mais recente (data_movimento, updated_at, created_at)
 * 2. Maior número de ordem (#) como critério de desempate ou prioridade sequencial
 * Isso garante que quando há duplicatas de uma CNH/CPF, o cidadão sempre visualize o registro mais atualizado.
 */
export function parseDateToTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  if (val instanceof Date) return val.getTime();
  const str = String(val).trim();
  if (!str) return 0;

  // Formato ISO direto ou padrão Date
  const directTs = new Date(str).getTime();
  if (!isNaN(directTs)) return directTs;

  // Formato brasileiro DD/MM/YYYY ou DD/MM/YYYY HH:mm:ss
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const hours = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
    const minutes = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    const seconds = brMatch[6] ? parseInt(brMatch[6], 10) : 0;
    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return 0;
}

export function sortCNHsByRecency(records: GeralCNH[]): GeralCNH[] {
  return [...records].sort((a, b) => {
    const getLatestTime = (item: GeralCNH) => {
      const tsMovimento = parseDateToTimestamp(item.data_movimento);
      const tsUpdated = parseDateToTimestamp(item.updated_at);
      const tsCreated = parseDateToTimestamp(item.created_at);
      return Math.max(tsMovimento, tsUpdated, tsCreated);
    };

    const timeA = getLatestTime(a);
    const timeB = getLatestTime(b);

    // Se houver diferença temporal perceptível (mais de 1 segundo), a data de atualização mais recente vence
    if (Math.abs(timeA - timeB) > 1000) {
      return timeB - timeA;
    }

    // Se as datas forem idênticas ou muito próximas, o maior número de ordem (#) prevalece
    const ordemA = Number(a.ordem) || 0;
    const ordemB = Number(b.ordem) || 0;
    if (ordemA !== ordemB) {
      return ordemB - ordemA;
    }

    return timeB - timeA;
  });
}

function matchCpfDigits(recordCpf: string | undefined | null, targetClean: string): boolean {
  if (!recordCpf) return false;
  const cClean = recordCpf.replace(/\D/g, "");
  if (!cClean) return false;
  const targetPad = targetClean.padStart(11, "0");
  const cPad = cClean.padStart(11, "0");
  const targetUnp = targetClean.replace(/^0+/, "");
  const cUnp = cClean.replace(/^0+/, "");

  return (
    cClean === targetClean ||
    cPad === targetPad ||
    (targetUnp.length >= 7 && cUnp === targetUnp) ||
    (cClean.length >= 9 && targetClean.endsWith(cClean)) ||
    (targetClean.length >= 9 && cClean.endsWith(targetClean))
  );
}

const inFlightConsultas = new Map<string, Promise<ResultadoConsultaPublica>>();

export async function consultarCnhPublicaPorCpf(cpfInput: string): Promise<ResultadoConsultaPublica> {
  const cleanCpf = cpfInput.replace(/\D/g, "");
  if (!cleanCpf || cleanCpf.length < 9) {
    throw new Error("Por favor, informe um CPF válido para realizar a consulta.");
  }

  // Previne execuções concorrentes simultâneas disparadas em rajada pelo mesmo dispositivo
  const existingInFlight = inFlightConsultas.get(cleanCpf);
  if (existingInFlight) {
    return existingInFlight;
  }

  const queryPromise = (async (): Promise<ResultadoConsultaPublica> => {
    const pad11 = (val: string) => val.replace(/\D/g, "").padStart(11, "0");
    const searchPad = pad11(cleanCpf);
    const unpaddedCpf = cleanCpf.replace(/^0+/, "");
    const formattedCpf = cleanCpf.length === 11 
      ? `${cleanCpf.slice(0, 3)}.${cleanCpf.slice(3, 6)}.${cleanCpf.slice(6, 9)}-${cleanCpf.slice(9)}`
      : (searchPad.length === 11 ? `${searchPad.slice(0, 3)}.${searchPad.slice(3, 6)}.${searchPad.slice(6, 9)}-${searchPad.slice(9)}` : cleanCpf);

    const cnhsMap = new Map<string, GeralCNH>();

  // 1. BUSCA DIRETA E INSTANTÂNEA NO BANCO DE DADOS SUPABASE
  if (isSupabaseConfigured()) {
    try {
      const cpfFilters = [
        `cpf.eq.${cleanCpf}`,
        `cpf.eq.${searchPad}`,
        `cpf.eq.${formattedCpf}`,
        `cpf.ilike.%${cleanCpf}%`,
        `cpf.ilike.%${searchPad}%`
      ];
      if (unpaddedCpf.length >= 7) {
        cpfFilters.push(`cpf.ilike.%${unpaddedCpf}%`);
      }

      // Consulta direta pelo CPF na tabela geral_cnhs do Supabase
      const { data: supData, error: supError } = await supabase
        .from("geral_cnhs")
        .select("*")
        .or(cpfFilters.join(","));

      if (!supError && Array.isArray(supData) && supData.length > 0) {
        supData.forEach((row: any) => {
          const norm = row.id ? (row as GeralCNH) : { ...row, id: `cnh-${row.ordem}` };
          cnhsMap.set(norm.id || `ordem-${norm.ordem}`, norm);
        });
      } else {
        // Fallback para caso a tabela remota esteja nomeada como 'geral'
        const { data: supDataGeral, error: supErrorGeral } = await supabase
          .from("geral")
          .select("*")
          .or(cpfFilters.join(","));

        if (!supErrorGeral && Array.isArray(supDataGeral) && supDataGeral.length > 0) {
          supDataGeral.forEach((row: any) => {
            const norm = row.id ? (row as GeralCNH) : { ...row, id: `cnh-${row.ordem}` };
            cnhsMap.set(norm.id || `ordem-${norm.ordem}`, norm);
          });
        }
      }
    } catch (err) {
      console.warn("Aviso ao buscar diretamente no Supabase por CPF:", err);
    }
  }

  // 2. BUSCA NO INDEXEDDB LOCAL (DEXIE) E NO LOCALSTORAGE
  try {
    const dexieList = await getLocalGeralCNHs();
    if (dexieList && dexieList.length > 0) {
      dexieList.forEach((c) => {
        if (matchCpfDigits(c.cpf, cleanCpf)) {
          cnhsMap.set(c.id || `ordem-${c.ordem}`, c);
        }
      });
    }
  } catch (err) {
    console.warn("Aviso ao buscar CNHs no IndexedDB:", err);
  }

  try {
    const localList = getStoredList<GeralCNH>("geral", SEED_GERAL);
    if (localList && localList.length > 0) {
      localList.forEach((c) => {
        if (matchCpfDigits(c.cpf, cleanCpf)) {
          cnhsMap.set(c.id || `ordem-${c.ordem}`, c);
        }
      });
    }
  } catch (e) {
    console.warn("Aviso ao filtrar CNH local:", e);
  }

  let cnhsDoCidadao: GeralCNH[] = Array.from(cnhsMap.values());

  // 3. SE NÃO ENCONTROU EM CNHs, VERIFICA NA TABELA DE CANDIDATOS DO SUPABASE / LOCAL
  if (cnhsDoCidadao.length === 0) {
    let candEncontrado: any = null;

    if (isSupabaseConfigured()) {
      try {
        const cpfFilters = [
          `cpf.eq.${cleanCpf}`,
          `cpf.eq.${searchPad}`,
          `cpf.eq.${formattedCpf}`,
          `cpf.ilike.%${cleanCpf}%`,
          `cpf.ilike.%${searchPad}%`
        ];
        const { data: candSup, error: candError } = await supabase
          .from("candidatos")
          .select("*")
          .or(cpfFilters.join(","))
          .limit(1);

        if (!candError && candSup && candSup.length > 0) {
          candEncontrado = candSup[0];
        }
      } catch (err) {
        console.warn("Aviso ao buscar candidato no Supabase:", err);
      }
    }

    if (!candEncontrado) {
      try {
        const rawCands = typeof localStorage !== "undefined" ? localStorage.getItem("detran_candidatos") : null;
        let candsList: any[] = [];
        if (rawCands) {
          try {
            candsList = JSON.parse(rawCands);
          } catch {}
        }
        if (!candsList || candsList.length === 0) {
          candsList = SEED_CANDIDATOS;
        }

        candEncontrado = candsList.find((cand) => matchCpfDigits(cand.cpf, cleanCpf));
      } catch (e) {
        console.warn("Aviso ao buscar em candidatos locais:", e);
      }
    }

    if (candEncontrado) {
      const cnhVirtual: GeralCNH = {
        id: `virtual-cand-${candEncontrado.id}`,
        ordem: 0,
        memorando_id: candEncontrado.memorando_id,
        candidato_id: candEncontrado.id,
        nome: candEncontrado.nome,
        cpf: candEncontrado.cpf,
        telefone: candEncontrado.telefone || "",
        gaveta: "",
        reparticao: "",
        situacao: "Remetida",
        responsavel_id: undefined,
        responsavel_nome: undefined,
        data_movimento: candEncontrado.created_at || new Date().toISOString(),
        usuario_id: "sistema",
        usuario_nome: "Sistema DETRAN",
        remessa: candEncontrado.remessa || "",
        observacao: "Processo cadastrado em memorando de envio.",
        created_at: candEncontrado.created_at || new Date().toISOString()
      };

      registrarAcessoCidadaoLog({
        cpf: cleanCpf,
        nome_titular: candEncontrado.nome,
        situacao: "Remetida",
        resultado_status: "EM_PROCESSAMENTO",
        canal: "App Android",
        dispositivo: detectUserDevice(),
        cidade_origem: "Belém"
      });

      return {
        cpfConsultado: cleanCpf,
        cnhEncontrada: cnhVirtual,
        historico: [cnhVirtual],
        statusDisponibilidade: "EM_PROCESSAMENTO",
        mensagem: "⏳ Sua CNH consta em processamento/trânsito (Memorando em trânsito) e ainda não deu entrada no balcão de atendimento.",
        possuiDuplicatas: false
      };
    }

    // Se realmente não foi localizada
    registrarAcessoCidadaoLog({
      cpf: cleanCpf,
      situacao: "Não Encontrada",
      resultado_status: "NAO_ENCONTRADA",
      canal: "App Android",
      dispositivo: detectUserDevice(),
      cidade_origem: "Belém"
    });

    return {
      cpfConsultado: cleanCpf,
      cnhEncontrada: null,
      historico: [],
      statusDisponibilidade: "NAO_ENCONTRADA",
      mensagem: "Nenhum registro de CNH localizado para o CPF informado.",
      possuiDuplicatas: false
    };
  }

  // 4. PROCESSAR E SELECIONAR O REGISTRO MAIS RECENTE (MAIOR NÚMERO DE ORDEM OU DATA DE ATUALIZAÇÃO MAIS RECENTE)
  const ordenadas = sortCNHsByRecency(cnhsDoCidadao);

  // Resolver localização (gaveta/reparticao) se estiver vazia e a situação for "Recebida"
  for (const cnh of ordenadas) {
    if (cnh.situacao === "Recebida" && (!cnh.gaveta || !cnh.reparticao) && cnh.nome) {
      try {
        const loc = await findLocalizacaoPorNome(cnh.nome);
        if (loc) {
          cnh.gaveta = cnh.gaveta || loc.gaveta;
          cnh.reparticao = cnh.reparticao || loc.reparticao;
        }
      } catch {}
    }
  }

  // O registro ativo/principal é sempre o registro mais recente no tempo ou de maior ordem
  const cnhMaisRecente = ordenadas[0];

  if (cnhMaisRecente.situacao === "Recebida") {
    registrarAcessoCidadaoLog({
      cpf: cleanCpf,
      nome_titular: cnhMaisRecente.nome,
      situacao: "Recebida",
      resultado_status: "DISPONIVEL",
      canal: "App Android",
      dispositivo: detectUserDevice(),
      cidade_origem: "Belém"
    });
    return {
      cpfConsultado: cleanCpf,
      cnhEncontrada: cnhMaisRecente,
      historico: ordenadas,
      statusDisponibilidade: "DISPONIVEL",
      mensagem: "✅ Sua CNH já está disponível para retirada no balcão do DETRAN!",
      possuiDuplicatas: ordenadas.length > 1
    };
  }

  if (cnhMaisRecente.situacao === "Entregue") {
    registrarAcessoCidadaoLog({
      cpf: cleanCpf,
      nome_titular: cnhMaisRecente.nome,
      situacao: "Entregue",
      resultado_status: "ENTREGUE",
      canal: "App Android",
      dispositivo: detectUserDevice(),
      cidade_origem: "Belém"
    });
    return {
      cpfConsultado: cleanCpf,
      cnhEncontrada: cnhMaisRecente,
      historico: ordenadas,
      statusDisponibilidade: "ENTREGUE",
      mensagem: "ℹ️ A sua CNH consta como ENTREGUE no balcão.",
      possuiDuplicatas: ordenadas.length > 1
    };
  }

  registrarAcessoCidadaoLog({
    cpf: cleanCpf,
    nome_titular: cnhMaisRecente.nome,
    situacao: (cnhMaisRecente.situacao as any) || "Pendente",
    resultado_status: "EM_PROCESSAMENTO",
    canal: "App Android",
    dispositivo: detectUserDevice(),
    cidade_origem: "Belém"
  });

    return {
      cpfConsultado: cleanCpf,
      cnhEncontrada: cnhMaisRecente,
      historico: ordenadas,
      statusDisponibilidade: "EM_PROCESSAMENTO",
      mensagem: "⏳ Sua CNH consta em processamento/trânsito e ainda não deu entrada no balcão de atendimento.",
      possuiDuplicatas: ordenadas.length > 1
    };
  })();

  inFlightConsultas.set(cleanCpf, queryPromise);
  try {
    return await queryPromise;
  } finally {
    inFlightConsultas.delete(cleanCpf);
  }
}

// Cadastro Manual de CNH no Protocolo (Botão ➕ Cadastro Manual)
export async function createGeralManual(
  data: {
    nome: string;
    cpf: string;
    pa?: string;
    situacao: SituacaoGeral;
    observacao?: string;
  },
  userId: string,
  userNome: string
): Promise<GeralCNH> {
  const geralList = await getGeralCNHs();
  const maxOrdem = geralList.reduce((acc, curr) => Math.max(acc, curr.ordem || 0), 0) + 1;
  const now = new Date().toISOString();

  let gaveta = "";
  let reparticao = "";

  // Se cadastrar como Recebida, calcular automaticamente Gaveta e Repartição conforme o mapeamento
  if (data.situacao === "Recebida") {
    const loc = await findLocalizacaoPorNome(data.nome);
    gaveta = loc.gaveta;
    reparticao = loc.reparticao;
  }

  const uniqueId = typeof crypto !== "undefined" && crypto.randomUUID 
    ? crypto.randomUUID() 
    : (toValidUUID(`cnh-manual-${Date.now()}-${Math.random()}`) || `cnh-manual-${Date.now()}`);

  const nova: GeralCNH = {
    id: uniqueId,
    ordem: maxOrdem,
    pa: data.pa ? data.pa.trim() : undefined,
    nome: data.nome.trim(),
    cpf: data.cpf.trim(),
    gaveta,
    reparticao,
    situacao: data.situacao,
    data_movimento: now,
    usuario_id: userId,
    usuario_nome: userNome,
    observacao: data.observacao || "Cadastro manual efetuado no balcão de protocolo",
    created_at: now
  };

  saveStoredList("geral", [nova, ...geralList]);
  await Promise.all([
    saveLocalGeralCNH(nova),
    logHistorico(nova.id, nova.ordem, nova.nome, null, nova.situacao, userId, userNome, nova.observacao, undefined, undefined, nova.cpf),
    logAuditoria("geral", `Ordem #${nova.ordem}`, "Inclusão", userId, userNome, null, nova)
  ]);
  return nova;
}

// Recebimento de CNH (Botão 📥 Receber - Na tela Geral)
// Somente aparece quando Situação = Remetida
// Ao clicar: Situação = Recebida, Data = atual, Usuário = logado
// Determinar automaticamente Gaveta e Repartição via Mapeamento pela inicial do nome
export async function receberCNH(id: string, userId: string, userNome: string): Promise<{ geral: GeralCNH; isVazio: boolean }> {
  const geralList = await getGeralCNHs();
  const index = geralList.findIndex((g) => g.id === id);
  if (index === -1) throw new Error("Registro CNH não encontrado no protocolo");
  const atual = geralList[index];
  if (atual.situacao !== "Remetida" && atual.situacao !== "Pendente") {
    throw new Error("Apenas CNHs com situação 'Remetida' ou 'Pendente' podem ser recebidas no protocolo.");
  }

  const loc = await findLocalizacaoPorNome(atual.nome);
  const isVazio = loc.gaveta === "Vazio" || loc.reparticao === "Vazio";
  const now = new Date().toISOString();

  const atualizado: GeralCNH = {
    ...atual,
    situacao: "Recebida",
    gaveta: loc.gaveta,
    reparticao: loc.reparticao,
    data_movimento: now,
    usuario_id: userId,
    usuario_nome: userNome,
    observacao: `${atual.observacao ? atual.observacao + " | " : ""}Recebida no protocolo - Alocada em ${loc.gaveta} ${loc.reparticao}`
  };

  geralList[index] = atualizado;
  saveStoredList("geral", geralList);
  await saveLocalGeralCNH(atualizado);

  await logHistorico(
    atualizado.id,
    atualizado.ordem,
    atualizado.nome,
    atual.situacao,
    "Recebida",
    userId,
    userNome,
    `Alocado na ${loc.gaveta} / ${loc.reparticao}`,
    undefined,
    undefined,
    atualizado.cpf
  );

  await logAuditoria("geral", `Ordem #${atualizado.ordem}`, "Recebimento", userId, userNome, { situacao: atual.situacao }, { situacao: "Recebida", gaveta: loc.gaveta, reparticao: loc.reparticao });

  return { geral: atualizado, isVazio };
}

// Recebimento em Lote de CNHs (utilizado pelo Escaneamento OCR e ações em massa)
export async function receberCNHsBulk(
  items: Array<{ id: string; observacaoExtra?: string }>,
  userId: string,
  userNome: string
): Promise<{ updatedCount: number; updatedCNHs: GeralCNH[] }> {
  if (!items || items.length === 0) return { updatedCount: 0, updatedCNHs: [] };

  const geralList = await getGeralCNHs();
  const idMap = new Map<string, string | undefined>();
  items.forEach((item) => idMap.set(item.id, item.observacaoExtra));

  const now = new Date().toISOString();
  const updatedCNHs: GeralCNH[] = [];

  for (let i = 0; i < geralList.length; i++) {
    const cnh = geralList[i];
    if (idMap.has(cnh.id)) {
      const extraObs = idMap.get(cnh.id);
      const loc = await findLocalizacaoPorNome(cnh.nome);
      const oldSituacao = cnh.situacao;

      const atualizado: GeralCNH = {
        ...cnh,
        situacao: "Recebida",
        gaveta: loc.gaveta,
        reparticao: loc.reparticao,
        data_movimento: now,
        usuario_id: userId,
        usuario_nome: userNome,
        observacao: `${cnh.observacao ? cnh.observacao + " | " : ""}${extraObs ? extraObs + " - " : ""}Recebida no protocolo - Alocada em ${loc.gaveta} ${loc.reparticao}`
      };

      geralList[i] = atualizado;
      updatedCNHs.push(atualizado);

      await logHistorico(
        atualizado.id,
        atualizado.ordem,
        atualizado.nome,
        oldSituacao,
        "Recebida",
        userId,
        userNome,
        `Recebimento via OCR - Alocado na ${loc.gaveta} / ${loc.reparticao}`,
        undefined,
        undefined,
        atualizado.cpf
      );

      await logAuditoria(
        "geral",
        `Ordem #${atualizado.ordem}`,
        "Recebimento",
        userId,
        userNome,
        { situacao: oldSituacao },
        { situacao: "Recebida", gaveta: loc.gaveta, reparticao: loc.reparticao }
      );
    }
  }

  if (updatedCNHs.length > 0) {
    saveStoredList("geral", geralList);
    await saveLocalGeralCNHsBulk(updatedCNHs);
    notifyDataSync("geral");
  }

  return { updatedCount: updatedCNHs.length, updatedCNHs };
}

// Entrega de CNH (Botão 📤 Entregar - Na tela Geral)
// Somente disponível quando Situação = Recebida (ou Pendente)
// Grava: Situação = Entregue, Responsável, Data, Usuário Logado
export async function entregarCNH(
  id: string,
  responsavel_id: string,
  observacaoEntrega: string | undefined,
  userId: string,
  userNome: string
): Promise<GeralCNH> {
  const geralList = await getGeralCNHs();
  const index = geralList.findIndex((g) => g.id === id);
  if (index === -1) throw new Error("Registro CNH não encontrado");
  const atual = geralList[index];
  if (atual.situacao !== "Recebida" && atual.situacao !== "Pendente") {
    throw new Error("Apenas CNHs Recebidas ou Pendentes podem ser entregues aos titulares ou responsáveis.");
  }

  const responsaveis = await getResponsaveis();
  const resp = responsaveis.find((r) => r.id === responsavel_id);
  if (!resp) throw new Error("Responsável pela retirada não identificado");

  const now = new Date().toISOString();
  const atualizado: GeralCNH = {
    ...atual,
    situacao: "Entregue",
    responsavel_id: resp.id,
    responsavel_nome: resp.nome,
    data_movimento: now,
    usuario_id: userId,
    usuario_nome: userNome,
    observacao: `${atual.observacao ? atual.observacao + " | " : ""}Entregue para: ${resp.nome}${observacaoEntrega ? ` (${observacaoEntrega})` : ""}`
  };

  geralList[index] = atualizado;
  saveStoredList("geral", geralList);

  // Executa gravações em paralelo (Dexie/Supabase, histórico e auditoria)
  await Promise.all([
    saveLocalGeralCNH(atualizado),
    logHistorico(
      atualizado.id,
      atualizado.ordem,
      atualizado.nome,
      atual.situacao,
      "Entregue",
      userId,
      userNome,
      `Retirado por ${resp.nome}${observacaoEntrega ? ` - ${observacaoEntrega}` : ""}`,
      resp.id,
      resp.nome,
      atualizado.cpf
    ),
    logAuditoria(
      "geral",
      `Ordem #${atualizado.ordem}`,
      "Entrega",
      userId,
      userNome,
      { situacao: atual.situacao },
      { situacao: "Entregue", responsavel_nome: resp.nome, data_entrega: now }
    )
  ]);

  return atualizado;
}

// Alteração de situação para "Pendente" ou edição geral do registro
export async function updateGeralCNH(
  id: string,
  data: Partial<GeralCNH>,
  userId: string,
  userNome: string
): Promise<GeralCNH> {
  const geralList = await getGeralCNHs();
  const index = geralList.findIndex((g) => g.id === id);
  if (index === -1) throw new Error("Registro CNH não encontrado");
  const ant = geralList[index];
  const atualizado = { ...ant, ...data, data_movimento: new Date().toISOString(), usuario_id: userId, usuario_nome: userNome };
  geralList[index] = atualizado;
  saveStoredList("geral", geralList);
  await saveLocalGeralCNH(atualizado);

  // Se a CNH possui candidato_id associado, sincronizar também na lista de candidatos do memorando
  if (atualizado.candidato_id) {
    try {
      const cands = await getCandidatosAll();
      const candIndex = cands.findIndex((c) => c.id === atualizado.candidato_id);
      if (candIndex !== -1) {
        const candUpdated = { ...cands[candIndex] };
        if (data.nome !== undefined) candUpdated.nome = data.nome;
        if (data.cpf !== undefined) candUpdated.cpf = data.cpf;
        if (data.telefone !== undefined) candUpdated.telefone = data.telefone;
        cands[candIndex] = candUpdated;
        saveStoredList("candidatos", cands);
      }
    } catch (e) {
      console.warn("Aviso ao atualizar candidato vinculado no QuickEdit:", e);
    }
  }

  if (ant.situacao !== atualizado.situacao) {
    await logHistorico(
      atualizado.id,
      atualizado.ordem,
      atualizado.nome,
      ant.situacao,
      atualizado.situacao,
      userId,
      userNome,
      atualizado.observacao,
      undefined,
      undefined,
      atualizado.cpf
    );
  } else if (ant.nome !== atualizado.nome || ant.cpf !== atualizado.cpf) {
    const alteracoes: string[] = [];
    if (ant.nome !== atualizado.nome) alteracoes.push(`Nome alterado de "${ant.nome}" para "${atualizado.nome}"`);
    if (ant.cpf !== atualizado.cpf) alteracoes.push(`CPF alterado de "${ant.cpf || "não informado"}" para "${atualizado.cpf || "não informado"}"`);
    await logHistorico(
      atualizado.id,
      atualizado.ordem,
      atualizado.nome,
      atualizado.situacao,
      atualizado.situacao,
      userId,
      userNome,
      alteracoes.join(" • "),
      undefined,
      undefined,
      atualizado.cpf
    );
  }

  await logAuditoria("geral", `Ordem #${ant.ordem}`, "Alteração", userId, userNome, ant, atualizado);
  return atualizado;
}

// Exclusão de registro CNH individual
export async function deleteGeralCNH(
  id: string,
  userId: string,
  userNome: string
): Promise<boolean> {
  const geralList = await getGeralCNHs();
  const target = geralList.find((g) => g.id === id);
  if (!target) return false;

  const updated = geralList.filter((g) => g.id !== id);
  saveStoredList("geral", updated);
  await deleteLocalGeralCNH(id);

  await logAuditoria(
    "geral",
    `Ordem #${target.ordem}`,
    "Exclusão",
    userId,
    userNome,
    target,
    null
  );

  return true;
}

// Exclusão em massa de registros CNH
export async function deleteMultipleGeralCNHs(
  ids: string[],
  userId: string,
  userNome: string
): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const idsSet = new Set(ids);
  const geralList = await getGeralCNHs();
  const targets = geralList.filter((g) => idsSet.has(g.id));
  const updated = geralList.filter((g) => !idsSet.has(g.id));
  saveStoredList("geral", updated);
  await deleteLocalGeralCNHsBulk(ids);

  if (isSupabaseConfigured()) {
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        await supabase.from("geral_cnhs").delete().in("id", batch);
      }
    } catch (err) {
      console.error("Erro ao deletar em massa do Supabase:", err);
    }
  }

  await logAuditoria(
    "geral",
    `Exclusão em massa (${ids.length} registros)`,
    "Exclusão",
    userId,
    userNome,
    { count: ids.length, ids },
    null
  );

  return targets.length;
}

// ============================================================================
// MÓDULOS DE HISTÓRICO E AUDITORIA (CONSULTA)
// ============================================================================

export async function getHistoricoList(): Promise<HistoricoMovimentacao[]> {
  const localList = getStoredList<HistoricoMovimentacao>("historico", SEED_HISTORICO);
  let mergedMap = new Map<string, HistoricoMovimentacao>();
  localList.forEach((h) => mergedMap.set(h.id, h));

  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<HistoricoMovimentacao>("historico_movimentacoes", 1000, "data_hora", false);
      if (data && data.length > 0) {
        data.forEach((h) => mergedMap.set(h.id, h));
        saveStoredList("historico", Array.from(mergedMap.values()));
      }
    } catch (err) {
      console.warn("Aviso ao buscar histórico no Supabase:", err);
    }
  }

  let list: HistoricoMovimentacao[] = Array.from(mergedMap.values());

  // Garantir que todos os registros da tabela Geral possuem seu evento inicial no histórico
  try {
    let geralList = await getLocalGeralCNHs();
    if (!geralList || geralList.length === 0) {
      geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
    }
    const mapGeralToCpf = new Map<string, string>();
    geralList.forEach((g) => {
      if (g.cpf) mapGeralToCpf.set(g.id, g.cpf);
    });

    // Enriquecer registros existentes com geral_cpf se não tiverem
    list.forEach((item) => {
      if (!item.geral_cpf && mapGeralToCpf.has(item.geral_id)) {
        item.geral_cpf = mapGeralToCpf.get(item.geral_id);
      }
    });

    const knownGeralIds = new Set(list.map((h) => h.geral_id));
    const autoList: HistoricoMovimentacao[] = [];

    for (const g of geralList) {
      if (!knownGeralIds.has(g.id)) {
        autoList.push({
          id: `hist-auto-${g.id}`,
          geral_id: g.id,
          geral_ordem: g.ordem,
          geral_nome: g.nome,
          geral_cpf: g.cpf,
          situacao_anterior: null,
          situacao_nova: g.situacao || "Remetida",
          responsavel_id: g.responsavel_id || undefined,
          responsavel_nome: g.responsavel_nome || undefined,
          usuario_id: g.usuario_id || "sistema",
          usuario_nome: g.usuario_nome || "Sistema DETRAN",
          observacao: g.observacao || "Cadastro inicial no protocolo",
          data_hora: g.data_movimento || g.created_at || new Date().toISOString()
        });
      }
    }

    if (autoList.length > 0) {
      list = [...list, ...autoList];
      saveStoredList("historico", list);
    }
  } catch (e) {
    console.warn("Aviso ao sincronizar histórico automático com Geral:", e);
  }

  return list.sort(
    (a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
  );
}

export async function getAuditoriaList(): Promise<Auditoria[]> {
  const localList = getStoredList<Auditoria>("auditoria", SEED_AUDITORIA);
  const mergedMap = new Map<string, Auditoria>();
  localList.forEach((a) => mergedMap.set(a.id, a));

  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Auditoria>("auditoria", 1000, "data_hora", false);
      if (data && data.length > 0) {
        data.forEach((a) => mergedMap.set(a.id, a));
        const combined = Array.from(mergedMap.values());
        saveStoredList("auditoria", combined);
        return combined.sort(
          (a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
        );
      }
    } catch (err) {
      console.warn("Aviso ao buscar auditoria no Supabase:", err);
    }
  }
  return Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
  );
}

// ============================================================================
// ESTATÍSTICAS PARA DASHBOARD INICIAL
// ============================================================================

export async function getDashboardStats() {
  const geral = await getGeralCNHs();
  const memorandos = await getMemorandos();
  const usuarios = await getUsuarios();

  const totalGeral = geral.length;
  const remetidas = geral.filter((g) => g.situacao === "Remetida").length;
  const recebidas = geral.filter((g) => g.situacao === "Recebida").length;
  const pendentes = geral.filter((g) => g.situacao === "Pendente").length;
  const entregues = geral.filter((g) => g.situacao === "Entregue").length;

  // Gráfico por Situação
  const chartSituacao = [
    { name: "Remetidas", valor: remetidas, color: "#f59e0b" }, // Amber
    { name: "Recebidas", valor: recebidas, color: "#3b82f6" }, // Blue
    { name: "Pendentes", valor: pendentes, color: "#ef4444" }, // Red
    { name: "Entregues", valor: entregues, color: "#10b981" }  // Green
  ];

  // Gráficos de Alocação Física (Gaveta e Repartição)
  // Contar exclusivamente CNHs com situação "Recebida" para apurar o estoque físico real nas gavetas e repartições
  const cnhsRecebidas = geral.filter((g) => g.situacao === "Recebida");

  // Helper functions para parser seguro de números de gaveta e repartição
  const parseGavetaNum = (val?: string): number | null => {
    if (!val) return null;
    const m = String(val).match(/(\d+)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 4 ? n : null;
  };

  const parseReparticaoNum = (val?: string): number | null => {
    if (!val) return null;
    const m = String(val).match(/(\d+)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 8 ? n : null;
  };

  // Carregar mapeamentos atuais para vincular as iniciais alfabéticas a cada repartição das gavetas
  const mapeamentosLista = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
  const iniciaisPorCompartimento: Record<string, string[]> = {};
  mapeamentosLista.forEach((m) => {
    if (m.ativo === false) return;
    const gNum = parseGavetaNum(m.gaveta);
    const rNum = parseReparticaoNum(m.reparticao);
    if (gNum && rNum && m.inicial) {
      const key = `${gNum}-${rNum}`;
      iniciaisPorCompartimento[key] = iniciaisPorCompartimento[key] || [];
      const letter = m.inicial.trim().toUpperCase();
      if (!iniciaisPorCompartimento[key].includes(letter)) {
        iniciaisPorCompartimento[key].push(letter);
      }
    }
  });
  Object.keys(iniciaisPorCompartimento).forEach((k) => {
    iniciaisPorCompartimento[k].sort();
  });

  // Matriz 4 Gavetas x 8 Repartições (32 compartimentos físicos)
  const matrixCounts: Record<number, Record<number, number>> = {
    1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
    2: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
    3: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
    4: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 }
  };

  let outrasNaoAlocadas = 0;

  // Mapear cada CNH com status "Recebida"
  cnhsRecebidas.forEach((c) => {
    let gNum = parseGavetaNum(c.gaveta);
    let rNum = parseReparticaoNum(c.reparticao);

    // Se faltar gaveta ou repartição, resolve dinamicamente pela inicial do titular da CNH
    if ((!gNum || !rNum) && c.nome) {
      const char = getInitialChar(c.nome);
      const found = mapeamentosLista.find((m) => m.inicial.toUpperCase() === char && m.ativo !== false);
      if (found) {
        if (!gNum) gNum = parseGavetaNum(found.gaveta);
        if (!rNum) rNum = parseReparticaoNum(found.reparticao);
      }
    }

    if (gNum && gNum >= 1 && gNum <= 4 && rNum && rNum >= 1 && rNum <= 8) {
      matrixCounts[gNum][rNum]++;
    } else {
      outrasNaoAlocadas++;
    }
  });

  const totalFisico = cnhsRecebidas.length;
  let reparticoesComCNH = 0;

  const gavetasArquivo: MapaGavetaItem[] = [1, 2, 3, 4].map((g) => {
    let totalGaveta = 0;
    const reparticoes: MapaReparticaoItem[] = [1, 2, 3, 4, 5, 6, 7, 8].map((r) => {
      const qtd = matrixCounts[g][r];
      totalGaveta += qtd;
      if (qtd > 0) reparticoesComCNH++;
      const iniciais = iniciaisPorCompartimento[`${g}-${r}`] || [];
      return {
        numero: r,
        nome: `Repartição ${r}`,
        total: qtd,
        iniciais,
        percentualGaveta: 0,
        percentualTotal: totalFisico > 0 ? Math.round((qtd / totalFisico) * 1000) / 10 : 0
      };
    });

    // Atualizar percentual relativo da gaveta
    reparticoes.forEach((rep) => {
      rep.percentualGaveta = totalGaveta > 0 ? Math.round((rep.total / totalGaveta) * 1000) / 10 : 0;
    });

    return {
      numero: g,
      nome: `Gaveta ${g}`,
      total: totalGaveta,
      percentualTotal: totalFisico > 0 ? Math.round((totalGaveta / totalFisico) * 1000) / 10 : 0,
      reparticoes
    };
  });

  const gavetaMaiorVolume = [...gavetasArquivo].sort((a, b) => b.total - a.total)[0] || null;

  const mapaArquivoFisico: MapaArquivoFisico = {
    totalFisico,
    gavetas: gavetasArquivo,
    outrasNaoAlocadas,
    reparticoesComCNH,
    totalCompartimentos: 32,
    gavetaMaiorVolume: gavetaMaiorVolume && gavetaMaiorVolume.total > 0
      ? { numero: gavetaMaiorVolume.numero, nome: gavetaMaiorVolume.nome, total: gavetaMaiorVolume.total }
      : null
  };

  // Gráfico por Gaveta (apenas CNHs com status "Recebida")
  const chartGaveta = gavetasArquivo.map((gav) => ({
    name: gav.nome,
    quantidade: gav.total
  }));

  // Gráfico por Repartição (acumulado das 8 repartições somando todas as gavetas)
  const chartReparticao = [1, 2, 3, 4, 5, 6, 7, 8].map((r) => {
    const totalRep = gavetasArquivo.reduce((acc, gav) => acc + (gav.reparticoes[r - 1]?.total || 0), 0);
    return {
      name: `Repartição ${r}`,
      quantidade: totalRep
    };
  });

  // Movimentação Mensal (Últimos meses simulados com base nas datas)
  const mensalMap: Record<string, { remessas: number; entregas: number }> = {
    "Mar/26": { remessas: Math.max(12, totalGeral * 2), entregas: Math.max(10, entregues * 3) },
    "Abr/26": { remessas: Math.max(18, totalGeral + 4), entregas: Math.max(15, entregues + 2) },
    "Mai/26": { remessas: Math.max(22, remetidas + recebidas + 8), entregas: Math.max(20, entregues + 5) },
    "Jun/26": { remessas: Math.max(28, totalGeral + 6), entregas: Math.max(25, entregues + 8) },
    "Jul/26": { remessas: totalGeral, entregas: entregues }
  };
  const chartMensal = Object.entries(mensalMap).map(([mes, dados]) => ({
    mes,
    Remessas: dados.remessas,
    Entregas: dados.entregas
  }));

  return {
    cards: {
      totalGeral,
      remetidas,
      recebidas,
      pendentes,
      entregues,
      memorandos: memorandos.length,
      usuarios: usuarios.length,
      consultasPublicas: getPublicSearchCount()
    },
    chartSituacao,
    chartGaveta,
    chartReparticao,
    chartMensal,
    mapaArquivoFisico
  };
}

/**
 * Retorna os dados estruturados do Mapa do Arquivo Físico (4 Gavetas x 8 Repartições)
 * com as CNHs em estoque físico (Situação: "Recebida").
 */
export async function getMapaArquivoFisico(): Promise<MapaArquivoFisico> {
  const stats = await getDashboardStats();
  return stats.mapaArquivoFisico;
}

// ============================================================================
// SERVIÇOS DE BACKUP, RESTAURAÇÃO E SINCRONIZAÇÃO COM SUPABASE
// ============================================================================

export function exportDatabaseJSON(): string {
  const data = {
    app: "DETRAN-PA Protocolo CNH",
    version: "2.4.0",
    exported_at: new Date().toISOString(),
    usuarios: getStoredList("usuarios", SEED_USUARIOS),
    responsaveis: getStoredList("responsaveis", SEED_RESPONSAVEIS),
    memorandos: getStoredList("memorandos", SEED_MEMORANDOS),
    candidatos: getStoredList("candidatos", SEED_CANDIDATOS),
    geral: getStoredList("geral", SEED_GERAL),
    lotes: getStoredList("lotes", SEED_LOTES),
    declaracoes: getStoredList("declaracoes", []),
    historico: getStoredList("historico", SEED_HISTORICO),
    auditoria: getStoredList("auditoria", SEED_AUDITORIA),
    mapeamento: getStoredList("mapeamento", SEED_MAPEAMENTO),
    acessos_cidadao: getAcessosCidadaoLogs()
  };
  return JSON.stringify(data, null, 2);
}

export function exportDatabaseExcel(): void {
  const wb = XLSX.utils.book_new();

  const collections = [
    { name: "Usuários", key: "usuarios", seed: SEED_USUARIOS },
    { name: "Responsáveis e CFCs", key: "responsaveis", seed: SEED_RESPONSAVEIS },
    { name: "Mapeamento A-Z", key: "mapeamento", seed: SEED_MAPEAMENTO },
    { name: "Memorandos", key: "memorandos", seed: SEED_MEMORANDOS },
    { name: "Candidatos", key: "candidatos", seed: SEED_CANDIDATOS },
    { name: "Protocolo Geral CNHs", key: "geral", seed: SEED_GERAL },
    { name: "Lotes de CNHs", key: "lotes", seed: SEED_LOTES },
    { name: "Declarações Emitidas", key: "declaracoes", seed: [] },
    { name: "Histórico Movimentos", key: "historico", seed: SEED_HISTORICO },
    { name: "Auditoria Sistema", key: "auditoria", seed: SEED_AUDITORIA },
    { name: "Consultas Cidadão", key: "acessos_cidadao", seed: [] }
  ];

  for (const col of collections) {
    const list = col.key === "acessos_cidadao" ? getAcessosCidadaoLogs() : getStoredList<any>(col.key, col.seed);
    const formattedData = list.map((item: any) => {
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

    const ws = XLSX.utils.json_to_sheet(formattedData.length > 0 ? formattedData : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, col.name.substring(0, 31));
  }

  const dateStr = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `backup_detran_protocolo_${dateStr}.xlsx`);
}

export function exportTableExcel(tableName: string, label: string): void {
  const seedsMap: Record<string, any[]> = {
    usuarios: SEED_USUARIOS,
    responsaveis: SEED_RESPONSAVEIS,
    mapeamento: SEED_MAPEAMENTO,
    memorandos: SEED_MEMORANDOS,
    candidatos: SEED_CANDIDATOS,
    geral: SEED_GERAL,
    lotes: SEED_LOTES,
    declaracoes: [],
    historico: SEED_HISTORICO,
    auditoria: SEED_AUDITORIA
  };

  const list = tableName === "acessos_cidadao" ? getAcessosCidadaoLogs() : getStoredList<any>(tableName, seedsMap[tableName] || []);
  const formattedData = list.map((item: any) => {
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

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(formattedData.length > 0 ? formattedData : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, label.substring(0, 31));

  const dateStr = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `${tableName}_detran_${dateStr}.xlsx`);
}

export function importDatabaseJSON(jsonContent: string): { success: boolean; message: string; counts: Record<string, number> } {
  try {
    const data = JSON.parse(jsonContent);
    if (!data || typeof data !== "object") {
      throw new Error("Formato de arquivo JSON inválido.");
    }

    const counts: Record<string, number> = {};

    if (Array.isArray(data.usuarios)) {
      saveStoredList("usuarios", data.usuarios);
      counts.usuarios = data.usuarios.length;
    }
    if (Array.isArray(data.responsaveis)) {
      saveStoredList("responsaveis", data.responsaveis);
      counts.responsaveis = data.responsaveis.length;
    }
    if (Array.isArray(data.memorandos)) {
      saveStoredList("memorandos", data.memorandos);
      counts.memorandos = data.memorandos.length;
    }
    if (Array.isArray(data.candidatos)) {
      saveStoredList("candidatos", data.candidatos);
      counts.candidatos = data.candidatos.length;
    }
    if (Array.isArray(data.geral)) {
      saveStoredList("geral", data.geral);
      counts.geral = data.geral.length;
    }
    if (Array.isArray(data.lotes)) {
      saveStoredList("lotes", data.lotes);
      try {
        if (dexieDb.lotes) dexieDb.lotes.bulkPut(data.lotes);
      } catch {}
      counts.lotes = data.lotes.length;
    }
    if (Array.isArray(data.declaracoes)) {
      saveStoredList("declaracoes", data.declaracoes);
      counts.declaracoes = data.declaracoes.length;
    }
    if (Array.isArray(data.historico)) {
      saveStoredList("historico", data.historico);
      counts.historico = data.historico.length;
    }
    if (Array.isArray(data.auditoria)) {
      saveStoredList("auditoria", data.auditoria);
      counts.auditoria = data.auditoria.length;
    }
    if (Array.isArray(data.mapeamento)) {
      saveStoredList("mapeamento", data.mapeamento);
      counts.mapeamento = data.mapeamento.length;
    }
    if (Array.isArray(data.acessos_cidadao)) {
      if (typeof window !== "undefined") {
        localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(data.acessos_cidadao));
      }
      counts.acessos_cidadao = data.acessos_cidadao.length;
    }

    return {
      success: true,
      message: "Backup restaurado com sucesso para o armazenamento local!",
      counts
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Erro desconhecido ao restaurar arquivo JSON.",
      counts: {}
    };
  }
}

export interface SpreadsheetImportOptions {
  syncToSupabase?: boolean;
  mode?: "merge" | "replace";
  usuarioId?: string;
  usuarioNome?: string;
}

export interface SpreadsheetImportSummary {
  success: boolean;
  message: string;
  importedCount: number;
  totalRowsProcessed: number;
  tableName: string;
  supabaseSyncedCount?: number;
  supabaseError?: string;
}

function parseSpreadsheetDate(raw: any): string {
  if (raw === undefined || raw === null || raw === "") {
    return new Date().toISOString();
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString();
  }

  if (typeof raw === "number") {
    try {
      const dateObj = XLSX.SSF ? XLSX.SSF.parse_date_code(raw) : null;
      if (dateObj) {
        const d = new Date(Date.UTC(dateObj.y, dateObj.m - 1, dateObj.d, dateObj.H || 12, dateObj.M || 0, dateObj.S || 0));
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    } catch (_) {}
    const jsDate = new Date(Math.round((raw - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate.toISOString();
  }

  const str = String(raw).trim();
  if (!str) return new Date().toISOString();

  // Match DD/MM/YYYY HH:mm:ss or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 12;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(Date.UTC(year, month, day, hour, min, sec));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function mapSpreadsheetRowToGeralCNH(
  row: Record<string, any>,
  index: number,
  maxOrdem: number,
  mapeamento: MapeamentoLocalizacao[],
  usuarioId: string,
  usuarioNome: string
): GeralCNH | null {
  const keys = Object.keys(row);
  const getVal = (patterns: RegExp[]): any => {
    for (const key of keys) {
      const cleanKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      for (const pattern of patterns) {
        if (pattern.test(cleanKey)) {
          return row[key];
        }
      }
    }
    return undefined;
  };

  const rawNome = getVal([/nome/, /candidato/, /titular/, /aluno/]);
  if (!rawNome || String(rawNome).trim() === "") {
    return null;
  }

  const nome = String(rawNome).trim().toUpperCase();

  const rawCpf = getVal([/cpf/, /doc/, /documento/]);
  let cpf = rawCpf ? String(rawCpf).replace(/\D/g, "") : "";
  if (cpf.length > 11) cpf = cpf.slice(0, 11);

  const rawOrdem = getVal([/ordem/, /num/, /numero/, /nº/, /posicao/, /pos/]);
  let ordem = parseInt(String(rawOrdem), 10);
  if (isNaN(ordem) || ordem <= 0) {
    ordem = maxOrdem + index + 1;
  }

  const rawGaveta = getVal([/gaveta/, /local/, /caixa/, /pasta/]);
  let gaveta = rawGaveta ? String(rawGaveta).trim() : "";

  const rawReparticao = getVal([/reparti/, /setor/, /unidade/, /depto/]);
  let reparticao = rawReparticao ? String(rawReparticao).trim() : "";

  if (!gaveta || !reparticao) {
    const initial = nome.charAt(0).toUpperCase();
    const mapMatch = mapeamento.find(m => m.inicial.toUpperCase() === initial);
    if (mapMatch) {
      if (!gaveta) gaveta = mapMatch.gaveta;
      if (!reparticao) reparticao = mapMatch.reparticao;
    } else {
      if (!gaveta) gaveta = "G-01";
      if (!reparticao) reparticao = "Protocolo Geral";
    }
  }

  const rawSituacao = getVal([/situa/, /status/, /estado/]);
  let situacao: SituacaoGeral = "Recebida";
  if (rawSituacao) {
    const sitStr = String(rawSituacao).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (sitStr.includes("entre")) situacao = "Entregue";
    else if (sitStr.includes("reme")) situacao = "Remetida";
    else if (sitStr.includes("pend")) situacao = "Pendente";
    else if (sitStr.includes("receb")) situacao = "Recebida";
  }

  const rawId = getVal([/^id$/, /^cnh_id$/, /^id_cnh$/]);
  const id = (rawId && String(rawId).trim() !== "")
    ? String(rawId).trim()
    : `cnh-imp-${ordem}-${Math.random().toString(36).substring(2, 7)}`;

  // Responsável (id e nome)
  const rawRespId = getVal([/^responsavel_id$/, /responsavel_id/, /id_responsavel/, /id_resp/]);
  const rawRespNome = getVal([/^responsavel_nome$/, /responsavel_nome/, /nome_responsavel/]);
  const rawRespGeneric = getVal([/^responsavel$/, /procurador/, /retirante/]);

  let responsavel_id: string | undefined = rawRespId ? String(rawRespId).trim() : undefined;
  let responsavel_nome: string | undefined = rawRespNome ? String(rawRespNome).trim() : undefined;

  if (!responsavel_id && !responsavel_nome && rawRespGeneric) {
    const gStr = String(rawRespGeneric).trim();
    if (/^[0-9a-fA-F]{8}$/.test(gStr)) {
      responsavel_id = gStr.toLowerCase();
    } else {
      responsavel_nome = gStr;
    }
  }

  if (responsavel_nome && /^[0-9a-fA-F]{8}$/.test(responsavel_nome) && (!responsavel_id || responsavel_id === responsavel_nome)) {
    responsavel_id = responsavel_nome.toLowerCase();
    responsavel_nome = undefined;
  }

  if (responsavel_id) {
    responsavel_id = responsavel_id.toLowerCase();
    if (!responsavel_nome) {
      if (responsavel_id === "e2335b1e") {
        responsavel_nome = "PROPRIETÁRIO(A)";
      } else {
        const found = SEED_RESPONSAVEIS.find(r => r.id.toLowerCase() === responsavel_id);
        if (found) responsavel_nome = found.nome;
      }
    }
  }

  // Data de Movimentação
  const rawDataMov = getVal([/^data_movimentacao$/, /^data_movimento$/, /^data_mov$/, /data_movim/, /^data$/]);
  const data_movimento = parseSpreadsheetDate(rawDataMov);

  // Usuário (id e nome)
  const rawUserId = getVal([/^usuario_id$/, /usuario_id/, /id_usuario/, /user_id/]);
  const rawUserNome = getVal([/^usuario_nome$/, /usuario_nome/, /nome_usuario/, /operador/]);

  let usuario_id: string = rawUserId ? String(rawUserId).trim() : usuarioId;
  let usuario_nome: string = rawUserNome ? String(rawUserNome).trim() : usuarioNome;

  const knownUsers: Record<string, { id: string; nome: string }> = {
    "ba8dff5e": { id: "ba8dff5e", nome: "Amerson Gonçalves Bento" },
    "2837b0a8": { id: "2837b0a8", nome: "Zedequias Carlos de Melo" },
    "8bc1be25": { id: "8bc1be25", nome: "Ivanilde Souza" },
    "51f76373": { id: "51f76373", nome: "Kaio Lohandes Gomes de Melo" },
    "33a4ab38": { id: "33a4ab38", nome: "Deck Melo" },
    "a6708d10": { id: "a6708d10", nome: "Dabita de Oliveira Cardoso" },
    "33aa7d87": { id: "33aa7d87", nome: "Regis Reginaldo" },
    "33aa7bs56": { id: "33aa7bs56", nome: "Fernado Color" },
    "a2940ebb": { id: "a2940ebb", nome: "Zedquias Melo" }
  };

  if (usuario_id && knownUsers[usuario_id.toLowerCase()]) {
    usuario_id = usuario_id.toLowerCase();
    if (!rawUserNome) {
      usuario_nome = knownUsers[usuario_id].nome;
    }
  } else if (usuario_nome) {
    const uLower = usuario_nome.toLowerCase();
    for (const [idKey, uObj] of Object.entries(knownUsers)) {
      if (uLower.includes(uObj.nome.split(" ")[0].toLowerCase())) {
        usuario_id = idKey;
        usuario_nome = uObj.nome;
        break;
      }
    }
  }

  const rawMemo = getVal([/^memorando_numero$/, /^memorando$/, /memo/]);
  const memorando_numero = rawMemo ? String(rawMemo).trim() : undefined;

  const rawRemessa = getVal([/^remessa$/]);
  const remessa = rawRemessa ? String(rawRemessa).trim() : undefined;

  const rawObs = getVal([/^observacao$/, /observa/, /obs/, /nota/]);
  const observacao = rawObs ? String(rawObs).trim() : undefined;

  const rawCreated = getVal([/^created_at$/]);
  const created_at = rawCreated ? parseSpreadsheetDate(rawCreated) : data_movimento;

  return {
    id,
    ordem,
    nome,
    cpf,
    gaveta,
    reparticao,
    situacao,
    responsavel_id,
    responsavel_nome,
    data_movimento,
    usuario_id,
    usuario_nome,
    memorando_numero,
    remessa,
    observacao,
    created_at
  };
}

export async function importSpreadsheetData(
  fileBuffer: ArrayBuffer,
  options: SpreadsheetImportOptions = {}
): Promise<SpreadsheetImportSummary> {
  const {
    syncToSupabase = false,
    mode = "merge",
    usuarioId = "11111111-1111-1111-1111-111111111111",
    usuarioNome = "Operador do Sistema"
  } = options;

  try {
    const workbook = XLSX.read(fileBuffer, { type: "array" });
    if (!workbook || workbook.SheetNames.length === 0) {
      throw new Error("Arquivo CSV ou Excel vazio ou inválido.");
    }

    const mapeamento = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
    const existingGeral = await getGeralCNHs();

    const maxOrdem = existingGeral.reduce((max, item) => Math.max(max, item.ordem || 0), 0);

    let sheetName = workbook.SheetNames[0];
    const geralSheetMatch = workbook.SheetNames.find(s => 
      /geral|cnh|protocolo|candidato/i.test(s)
    );
    if (geralSheetMatch) {
      sheetName = geralSheetMatch;
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (rawRows.length === 0) {
      throw new Error(`A aba '${sheetName}' da planilha não contém dados ou linhas de cabeçalho.`);
    }

    const newItems: GeralCNH[] = [];

    rawRows.forEach((row, idx) => {
      const item = mapSpreadsheetRowToGeralCNH(row, idx, maxOrdem, mapeamento, usuarioId, usuarioNome);
      if (item) {
        newItems.push(item);
      }
    });

    if (newItems.length === 0) {
      throw new Error("Nenhuma linha com nome de candidato válido foi identificada na planilha.");
    }

    let finalGeralList: GeralCNH[];
    if (mode === "replace") {
      finalGeralList = newItems;
    } else {
      const existingMap = new Map<string, GeralCNH>();
      existingGeral.forEach(g => {
        const key = g.cpf ? `cpf:${g.cpf}` : `ordem:${g.ordem}`;
        existingMap.set(key, g);
      });

      newItems.forEach(newItem => {
        const key = newItem.cpf ? `cpf:${newItem.cpf}` : `ordem:${newItem.ordem}`;
        if (existingMap.has(key)) {
          const old = existingMap.get(key)!;
          existingMap.set(key, { ...newItem, id: old.id });
        } else {
          existingMap.set(key, newItem);
        }
      });

      finalGeralList = Array.from(existingMap.values()).sort((a, b) => a.ordem - b.ordem);
    }

    saveStoredList("geral", finalGeralList);
    await saveLocalGeralCNHsBulk(finalGeralList);

    let supabaseSyncedCount = 0;
    let supabaseError: string | undefined = undefined;

    if (syncToSupabase) {
      if (!isSupabaseConfigured()) {
        supabaseError = "Supabase não está configurado. Os dados foram salvos no armazenamento local.";
      } else {
        try {
          // Validação segura de chaves estrangeiras sem corromper usuários ou responsáveis existentes
          const existingUsuarios = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
          const validUserSet = new Set(existingUsuarios.map(u => u.id));
          const existingResponsaveis = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
          const validRespSet = new Set(existingResponsaveis.map(r => r.id));

          // Upsert into geral_cnhs with exact columns from spreadsheet
          const payload = newItems.map(g => ({
            id: g.id,
            ordem: g.ordem,
            nome: g.nome,
            cpf: g.cpf,
            gaveta: g.gaveta || "",
            reparticao: g.reparticao || "",
            situacao: g.situacao,
            responsavel_id: (g.responsavel_id && validRespSet.has(g.responsavel_id)) ? g.responsavel_id : null,
            responsavel_nome: g.responsavel_nome || null,
            data_movimento: g.data_movimento || new Date().toISOString(),
            usuario_id: (g.usuario_id && validUserSet.has(g.usuario_id)) ? g.usuario_id : null,
            usuario_nome: g.usuario_nome || null,
            memorando_numero: g.memorando_numero || null,
            remessa: g.remessa || null,
            observacao: g.observacao || null,
            created_at: g.created_at || g.data_movimento || new Date().toISOString()
          }));

          const batchSize = 100;
          for (let i = 0; i < payload.length; i += batchSize) {
            const batch = payload.slice(i, i + batchSize);
            const { error } = await supabase.from("geral_cnhs").upsert(batch, { onConflict: "id" });
            if (error) {
              throw error;
            }
            supabaseSyncedCount += batch.length;
          }
        } catch (err: any) {
          supabaseError = `Erro ao enviar para o Supabase: ${err.message}`;
        }
      }
    }

    return {
      success: true,
      message: `${newItems.length} registros da planilha foram importados com sucesso!`,
      importedCount: newItems.length,
      totalRowsProcessed: rawRows.length,
      tableName: "geral_cnhs",
      supabaseSyncedCount,
      supabaseError
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Erro ao processar planilha CSV ou Excel.",
      importedCount: 0,
      totalRowsProcessed: 0,
      tableName: "geral_cnhs"
    };
  }
}

export interface SyncStatusItem {
  key: string;
  label: string;
  tableName: string;
  localCount: number;
  supabaseCount: number | null;
  status: 'synced' | 'pending' | 'error' | 'not_configured';
  lastError?: string;
}

export async function checkSyncStatus(): Promise<SyncStatusItem[]> {
  await initStorage();

  const collections = [
    { key: "usuarios", label: "Usuários do Sistema", tableName: "usuarios" },
    { key: "responsaveis", label: "Responsáveis e CFCs", tableName: "responsaveis" },
    { key: "mapeamento", label: "Mapeamento (A-Z)", tableName: "mapeamento_localizacao" },
    { key: "memorandos", label: "Memorandos e Remessas", tableName: "memorandos" },
    { key: "candidatos", label: "Candidatos Vinculados", tableName: "candidatos" },
    { key: "geral", label: "Protocolo Geral CNHs", tableName: "geral_cnhs" },
    { key: "lotes", label: "Lotes de CNHs (Protocolo)", tableName: "lotes" },
    { key: "declaracoes", label: "Declarações Emitidas", tableName: "declaracoes" },
    { key: "historico", label: "Histórico de Movimento", tableName: "historico_movimentacoes" },
    { key: "auditoria", label: "Auditoria do Sistema", tableName: "auditoria" },
    { key: "acessos_cidadao", label: "Consultas do Cidadão (Logs)", tableName: "acessos_cidadao" },
    { key: "orgao", label: "Configuração e Logomarca do Órgão", tableName: "orgao_config" },
    { key: "imagens", label: "Imagens e Anexos Sincronizados", tableName: "imagens_sync" }
  ];

  const results: SyncStatusItem[] = [];

  for (const item of collections) {
    let localCount = 0;
    if (item.key === "acessos_cidadao") {
      const logs = getAcessosCidadaoLogs();
      const idbLogs = await idbGet<any[]>("detran_acessos_cidadao_logs");
      localCount = Math.max(logs.length, idbLogs && Array.isArray(idbLogs) ? idbLogs.length : 0);
    } else if (item.key === "orgao") {
      localCount = 1;
    } else if (item.key === "imagens") {
      const cfg = getOrgaoConfig();
      const localImgs = getStoredList<any>("imagens", []);
      localCount = Math.max(localImgs.length, cfg?.logo ? 1 : 0);
    } else if (item.key === "lotes") {
      try {
        if (dexieDb.lotes) {
          localCount = await dexieDb.lotes.count();
        } else {
          localCount = getStoredList("lotes", []).length;
        }
      } catch {
        localCount = getStoredList("lotes", []).length;
      }
    } else if (item.key === "declaracoes") {
      const deletedDeclIds = getDeletedIds("declaracoes");
      localCount = getStoredList<Declaracao>("declaracoes", []).filter(d => !deletedDeclIds.has(d.id)).length;
    } else if (item.key === "geral") {
      try {
        localCount = await dexieDb.geral.count();
      } catch {
        localCount = getStoredList(item.key, []).length;
      }
    } else if (item.key === "historico") {
      const memList = memoryStore["historico"] && Array.isArray(memoryStore["historico"]) ? memoryStore["historico"].length : 0;
      const idbHist = await idbGet<any[]>("detran_cnh_historico");
      const idbLen = idbHist && Array.isArray(idbHist) ? idbHist.length : 0;
      const storedLen = getStoredList("historico", []).length;
      localCount = Math.max(memList, idbLen, storedLen);
    } else if (item.key === "auditoria") {
      const memList = memoryStore["auditoria"] && Array.isArray(memoryStore["auditoria"]) ? memoryStore["auditoria"].length : 0;
      const idbAud = await idbGet<any[]>("detran_cnh_auditoria");
      const idbLen = idbAud && Array.isArray(idbAud) ? idbAud.length : 0;
      const storedLen = getStoredList("auditoria", []).length;
      localCount = Math.max(memList, idbLen, storedLen);
    } else {
      localCount = getStoredList(item.key, []).length;
    }

    let supCount: number | null = null;
    let status: 'synced' | 'pending' | 'error' | 'not_configured' = 'not_configured';
    let lastError: string | undefined = undefined;

    if (isSupabaseConfigured()) {
      try {
        let count: number | null = null;
        let error: any = null;

        // 1. Tenta consulta HEAD rápida
        const headRes = await supabase
          .from(item.tableName)
          .select("*", { count: "exact", head: true });
        
        count = headRes.count;
        error = headRes.error;

        // 2. Se HEAD retornar count nulo sem erro explícito (típico de PostgREST ou proxies que descartam Content-Range no HEAD),
        // faz consulta fallback com limit 1
        if (!error && count === null) {
          const limitRes = await supabase
            .from(item.tableName)
            .select(item.tableName === "orgao_config" ? "id" : "id", { count: "exact" })
            .limit(1);
          
          if (limitRes.error && limitRes.error.message?.includes("id")) {
            const fallbackStar = await supabase.from(item.tableName).select("*", { count: "exact" }).limit(1);
            count = fallbackStar.count;
            error = fallbackStar.error;
          } else {
            count = limitRes.count;
            error = limitRes.error;
          }
        }

        if (!error && count !== null) {
          supCount = count;
          status = localCount === supCount ? 'synced' : 'pending';
        } else if (error) {
          status = 'error';
          if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema')) {
            lastError = `Tabela '${item.tableName}' não criada no Supabase. Execute o script SQL no editor Supabase.`;
          } else if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy') || error.message?.includes('denied')) {
            lastError = `Acesso restrito (RLS) em '${item.tableName}'. Habilite as políticas públicas ou permissões no Supabase.`;
          } else {
            lastError = error.message;
          }
        } else {
          // Se não houve erro mas a contagem retornou nula, a tabela existe e está vazia
          supCount = 0;
          status = localCount === 0 ? 'synced' : 'pending';
        }
      } catch (err: any) {
        status = 'error';
        lastError = err.message || "Erro ao conectar no Supabase";
      }
    }

    results.push({
      key: item.key,
      label: item.label,
      tableName: item.tableName,
      localCount,
      supabaseCount: supCount,
      status,
      lastError
    });
  }

  return results;
}

// Cache em memória com TTL inteligente para tabelas relacionais do Supabase (Zero Egress desnecessário)
interface SupabaseCacheEntry<T> {
  data: T[];
  cachedAt: number;
}
const supabaseTableCache = new Map<string, SupabaseCacheEntry<any>>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos de validade por padrão

export function invalidateSupabaseCache(tableName?: string) {
  if (tableName) {
    for (const key of supabaseTableCache.keys()) {
      if (key.startsWith(tableName)) {
        supabaseTableCache.delete(key);
      }
    }
  } else {
    supabaseTableCache.clear();
  }
}

// Helper para buscar todos os registros de uma tabela do Supabase com paginação (evita limite de 1000 registros do PostgREST)
export async function fetchAllRowsFromSupabase<T = any>(
  tableName: string, 
  pageSize = 1000,
  orderColumn?: string,
  ascending = true,
  forceRefresh = false
): Promise<T[]> {
  const cacheKey = `${tableName}:${orderColumn || ""}:${ascending}`;
  const now = Date.now();
  const cached = supabaseTableCache.get(cacheKey);

  if (!forceRefresh && cached && (now - cached.cachedAt < CACHE_TTL_MS)) {
    trackEgress(tableName, "SELECT", 0, true, 0, `Cache Hit: ${cached.data.length} registros obtidos da memória local`);
    return cached.data;
  }

  const reqStart = Date.now();
  let allRows: T[] = [];
  let from = 0;
  let hasMore = true;
  let totalBytes = 0;

  while (hasMore) {
    const to = from + pageSize - 1;
    let query = supabase.from(tableName).select("*");
    if (orderColumn) {
      query = query.order(orderColumn, { ascending });
    }
    const { data, error } = await query.range(from, to);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allRows = allRows.concat(data as T[]);
      const chunkBytes = JSON.stringify(data).length;
      totalBytes += chunkBytes;

      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    } else {
      hasMore = false;
    }
  }

  const duration = Date.now() - reqStart;
  trackEgress(tableName, "SELECT", totalBytes || 120, false, duration, `Download de ${allRows.length} linhas do Supabase`);

  supabaseTableCache.set(cacheKey, {
    data: allRows,
    cachedAt: now
  });

  return allRows;
}

// Helper para enviar registros ao Supabase em lotes (evita erro de Payload Too Large)
async function upsertInBatches(
  tableName: string, 
  payload: any[], 
  batchSize = 250, 
  onConflict = "id",
  onProgress?: (synced: number, total: number) => void
): Promise<number> {
  invalidateSupabaseCache(tableName);
  let count = 0;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    const reqStart = Date.now();
    const { error } = await supabase.from(tableName).upsert(batch, { onConflict });
    const duration = Date.now() - reqStart;

    if (error) {
      console.warn(`Aviso no upsert em '${tableName}': ${error.message}. Iniciando recuperação...`);
      let recovered = false;

      // Recuperação 1: Detecção automática de coluna ausente na tabela remota do Supabase (ex: pdf_tamanho, procurador_telefone)
      const missingColMatch = error.message?.match(/Could not find the '([^']+)' column/i);
      if (missingColMatch && missingColMatch[1]) {
        const missingCol = missingColMatch[1];
        console.warn(`Adaptando payload para '${tableName}': removendo coluna ausente '${missingCol}' e tentando novamente...`);
        const adaptedBatch = batch.map((item: any) => {
          const copy = { ...item };
          delete copy[missingCol];
          // Caso específico: se for procurador_telefone ausente, tentar procurador_fone se ainda não estiver definido
          if (missingCol === "procurador_telefone" && item.procurador_telefone && !copy.procurador_fone) {
            copy.procurador_fone = item.procurador_telefone;
          }
          return copy;
        });
        const { error: adaptErr } = await supabase.from(tableName).upsert(adaptedBatch, { onConflict });
        if (!adaptErr) {
          count += adaptedBatch.length;
          recovered = true;
          if (onProgress) onProgress(count, payload.length);
          continue;
        }
      }

      // Recuperação 2: Se for lotes e houver erro de coluna ou pdf_tamanho
      if (tableName === "lotes" && !recovered) {
        const cleanLotes = batch.map((item: any) => {
          const copy = { ...item };
          delete copy.pdf_tamanho;
          return copy;
        });
        const { error: loteErr } = await supabase.from(tableName).upsert(cleanLotes, { onConflict });
        if (!loteErr) {
          count += cleanLotes.length;
          recovered = true;
          if (onProgress) onProgress(count, payload.length);
          continue;
        }
      }

      // Recuperação 3: Se for declaracoes e houver erro de telefone ou condutores
      if (tableName === "declaracoes" && !recovered) {
        const cleanDecl = batch.map((item: any) => {
          const copy = { ...item };
          if (copy.procurador_telefone && !copy.procurador_fone) {
            copy.procurador_fone = copy.procurador_telefone;
          }
          delete copy.procurador_telefone;
          return copy;
        });
        const { error: declErr } = await supabase.from(tableName).upsert(cleanDecl, { onConflict });
        if (!declErr) {
          count += cleanDecl.length;
          recovered = true;
          if (onProgress) onProgress(count, payload.length);
          continue;
        }
      }

      // Recuperação 4: Se for geral_cnhs, auto-provisiona responsáveis faltantes antes de recorrer a safeBatch
      if (tableName === "geral_cnhs") {
        const respIds = Array.from(new Set(batch.filter((c: any) => c.responsavel_id).map((c: any) => c.responsavel_id)));
        if (respIds.length > 0) {
          try {
            const respUpserts = respIds.map((rid: string) => {
              const sample = batch.find((c: any) => c.responsavel_id === rid);
              return {
                id: rid,
                nome: sample?.responsavel_nome || (rid === CANONICAL_PROPRIETARIO_ID ? "PROPRIETÁRIO" : "RESPONSÁVEL"),
                ativo: true
              };
            });
            await supabase.from("responsaveis").upsert(respUpserts, { onConflict: "id" });
            const { error: retryErr } = await supabase.from(tableName).upsert(batch, { onConflict });
            if (!retryErr) {
              count += batch.length;
              recovered = true;
              if (onProgress) onProgress(count, payload.length);
              continue;
            }
          } catch {}
        }

        const safeBatch = batch.map((item: any) => ({
          ...item,
          responsavel_id: null,
          usuario_id: null,
          memorando_id: null,
          candidato_id: null
        }));
        const { error: safeErr } = await supabase.from(tableName).upsert(safeBatch, { onConflict });
        if (!safeErr) {
          count += safeBatch.length;
          recovered = true;
          if (onProgress) onProgress(count, payload.length);
          continue;
        }
      } else if (tableName === "historico_movimentacoes") {
        const safeBatch = batch.map((item: any) => ({
          ...item,
          responsavel_id: null,
          usuario_id: null
        }));
        const { error: safeErr } = await supabase.from(tableName).upsert(safeBatch, { onConflict });
        if (!safeErr) {
          count += safeBatch.length;
          recovered = true;
          if (onProgress) onProgress(count, payload.length);
          continue;
        }
      }

      // Recuperação 5: Inserção item a item para isolar registros problemáticos sem abortar a sincronização
      if (!recovered) {
        for (const singleItem of batch) {
          try {
            let { error: singleErr } = await supabase.from(tableName).upsert([singleItem], { onConflict });
            if (singleErr) {
              // Tenta limpar campos extras
              const itemCopy = { ...singleItem };
              if (tableName === "lotes") delete itemCopy.pdf_tamanho;
              if (tableName === "declaracoes") {
                if (itemCopy.procurador_telefone) itemCopy.procurador_fone = itemCopy.procurador_telefone;
                delete itemCopy.procurador_telefone;
              }
              const retrySingle = await supabase.from(tableName).upsert([itemCopy], { onConflict });
              singleErr = retrySingle.error;
            }
            if (!singleErr) {
              count++;
            } else {
              console.warn(`Item descartado em '${tableName}':`, singleErr.message);
            }
          } catch {}
        }
        if (onProgress) onProgress(count, payload.length);
        continue;
      }
    }
    const batchBytes = JSON.stringify(batch).length;
    trackEgress(tableName, "BATCH_UPSERT", batchBytes, false, duration, `Lote de ${batch.length} registros enviados para ${tableName}`);
    count += batch.length;
    if (onProgress) {
      onProgress(count, payload.length);
    }
  }
  return count;
}

export async function syncLocalToSupabase(
  onLog?: (log: string) => void
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não está configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
  }

  const errors: string[] = [];
  let totalSynced = 0;

  const log = (msg: string) => {
    if (onLog) onLog(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  log("🚀 Iniciando sincronização do Armazenamento Local para o Supabase (com envio em lotes)...");

  const deletedMemoIds = getDeletedIds("memorandos");
  const deletedCandIds = getDeletedIds("candidatos");
  const deletedLoteIds = getDeletedIds("lotes");
  const deletedDeclIds = getDeletedIds("declaracoes");

  // Purge any deleted items from Supabase if present
  if (deletedMemoIds.size > 0 && isSupabaseConfigured()) {
    for (const dId of deletedMemoIds) {
      try {
        await supabase.from("geral_cnhs").delete().eq("memorando_id", dId);
        await supabase.from("geral_cnhs").update({ memorando_id: null }).eq("memorando_id", dId);
        await supabase.from("candidatos").delete().eq("memorando_id", dId);
        await supabase.from("memorandos").delete().eq("id", dId);
      } catch (e) {}
    }
  }

  if (deletedLoteIds.size > 0 && isSupabaseConfigured()) {
    for (const dId of deletedLoteIds) {
      try {
        await supabase.from("lotes").delete().eq("id", dId);
      } catch (e) {}
    }
  }

  if (deletedDeclIds.size > 0 && isSupabaseConfigured()) {
    for (const dId of deletedDeclIds) {
      try {
        await supabase.from("declaracoes").delete().eq("id", dId);
      } catch (e) {}
    }
  }

  await initStorage();

  // Pré-carregar listas locais para validar chaves estrangeiras de forma estrita
  const rawUsuarios = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const { users: usuarios, repairedCount } = repairCorruptedUsuarios(rawUsuarios);
  if (repairedCount > 0) {
    saveStoredList("usuarios", usuarios);
    log(`🛠️ Reparados ${repairedCount} usuário(s) com dados legítimos antes da sincronização.`);
  }
  const resp = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  const mapList = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
  const mems = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS).filter((m) => !deletedMemoIds.has(m.id));
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS).filter(
    (c) => !deletedCandIds.has(c.id) && !deletedMemoIds.has(c.memorando_id)
  );
  const geral = memoryStore["geral"] && memoryStore["geral"].length > 0 ? memoryStore["geral"] : await getGeralCNHs();
  
  const idbHist = await idbGet<HistoricoMovimentacao[]>("detran_cnh_historico");
  const localHist = getStoredList<HistoricoMovimentacao>("historico", SEED_HISTORICO);
  const hist = (idbHist && idbHist.length > localHist.length) ? idbHist : localHist;

  const idbAud = await idbGet<Auditoria[]>("detran_cnh_auditoria");
  const localAud = getStoredList<Auditoria>("auditoria", SEED_AUDITORIA);
  const aud = (idbAud && idbAud.length > localAud.length) ? idbAud : localAud;

  const validUserIds = new Set(usuarios.map(u => u.id));
  const validRespIds = new Set(resp.map(r => r.id));
  const validMemoIds = new Set(mems.map(m => m.id));
  const validCandIds = new Set(cands.map(c => c.id));
  const validGeralIds = new Set(geral.map(g => g.id));

  const cleanFK = (id?: string | null, validSet?: Set<string>): string | null => {
    if (!id || typeof id !== "string") return null;
    const trimmed = id.trim();
    if (trimmed === "") return null;
    if (validSet && !validSet.has(trimmed)) return null;
    return trimmed;
  };

  // 1. Usuarios
  try {
    log("📦 Sincronizando tabela 'usuarios'...");
    if (usuarios.length > 0) {
      const payload = usuarios.map(u => ({
        id: u.id || "11111111-1111-1111-1111-111111111111",
        nome: u.nome,
        nome_curto: u.nome_curto,
        fone: u.fone || null,
        email: u.email,
        funcao: u.funcao || null,
        setor: u.setor || "Protocolo",
        login: u.login,
        senha: u.senha || "detran@123",
        permissoes: u.permissoes,
        perfil: u.perfil,
        ativo: u.ativo !== false,
        created_at: u.created_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("usuarios", payload, 250);
      payload.forEach(u => validUserIds.add(u.id));
      log(`✅ Tabela 'usuarios' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'usuarios': ${err.message}`);
    errors.push(`usuarios: ${err.message}`);
  }

  // 2. Responsaveis
  try {
    log("📦 Sincronizando tabela 'responsaveis'...");
    if (resp.length > 0) {
      const payload = resp.map(r => ({
        id: r.id || "e2335b1e",
        nome: r.nome,
        cpf: r.cpf || "",
        telefone: r.telefone || null,
        registro: r.registro || null,
        observacao: r.observacao || null,
        ativo: r.ativo !== false,
        created_at: r.created_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("responsaveis", payload, 250);
      payload.forEach(r => validRespIds.add(r.id));
      log(`✅ Tabela 'responsaveis' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'responsaveis': ${err.message}`);
    errors.push(`responsaveis: ${err.message}`);
  }

  // 3. Mapeamento
  try {
    log("📦 Sincronizando tabela 'mapeamento_localizacao'...");
    if (mapList.length > 0) {
      const payload = mapList.map(m => ({
        id: m.id || `map-${(m.inicial || "A").toLowerCase()}`,
        inicial: m.inicial,
        gaveta: m.gaveta,
        reparticao: m.reparticao,
        ativo: m.ativo !== false
      }));
      const synced = await upsertInBatches("mapeamento_localizacao", payload, 250);
      log(`✅ Tabela 'mapeamento_localizacao' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'mapeamento_localizacao': ${err.message}`);
    errors.push(`mapeamento: ${err.message}`);
  }

  // 4. Memorandos
  try {
    log("📦 Sincronizando tabela 'memorandos'...");
    if (mems.length > 0) {
      const payload = mems.map(m => ({
        id: m.id || `memo-${m.numero}`,
        numero: m.numero,
        status: m.status,
        usuario_id: cleanFK(m.usuario_id, validUserIds),
        usuario_nome: m.usuario_nome || null,
        remessa: m.remessa || null,
        candidatos_count: m.candidatos_count || 0,
        created_at: m.created_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("memorandos", payload, 250);
      log(`✅ Tabela 'memorandos' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'memorandos': ${err.message}`);
    errors.push(`memorandos: ${err.message}`);
  }

  // 5. Candidatos
  try {
    log("📦 Sincronizando tabela 'candidatos'...");
    if (cands.length > 0) {
      const payload = cands.map(c => ({
        id: c.id || `cand-${c.memorando_id}-${c.numero || "01"}`,
        memorando_id: cleanFK(c.memorando_id, validMemoIds),
        numero: c.numero || null,
        nome: c.nome,
        cpf: c.cpf,
        telefone: c.telefone || null,
        remessa: c.remessa || null,
        created_at: c.created_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("candidatos", payload, 250);
      log(`✅ Tabela 'candidatos' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'candidatos': ${err.message}`);
    errors.push(`candidatos: ${err.message}`);
  }

  // 6. Geral CNHs
  try {
    log(`📦 Sincronizando tabela 'geral_cnhs' (${geral.length} registros em lotes de 250)...`);
    if (geral.length > 0) {
      const payload = geral.map(g => ({
        id: g.id || `cnh-${g.ordem}`,
        ordem: g.ordem,
        memorando_id: cleanFK(g.memorando_id, validMemoIds),
        candidato_id: cleanFK(g.candidato_id, validCandIds),
        nome: g.nome,
        cpf: g.cpf,
        gaveta: g.gaveta || "",
        reparticao: g.reparticao || "",
        situacao: g.situacao,
        responsavel_id: cleanFK(g.responsavel_id, validRespIds),
        responsavel_nome: g.responsavel_nome || null,
        data_movimento: g.data_movimento || new Date().toISOString(),
        usuario_id: cleanFK(g.usuario_id, validUserIds),
        usuario_nome: g.usuario_nome || null,
        memorando_numero: g.memorando_numero || null,
        remessa: g.remessa || null,
        observacao: g.observacao || null,
        created_at: g.created_at || new Date().toISOString(),
        updated_at: g.updated_at || g.data_movimento || new Date().toISOString()
      }));

      const synced = await upsertInBatches("geral_cnhs", payload, 250, "id", (synced, total) => {
        log(` ⏳ Progresso geral_cnhs: ${synced}/${total} registros enviados...`);
      });
      payload.forEach(g => validGeralIds.add(g.id));
      log(`✅ Tabela 'geral_cnhs' sincronizada totalmente (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'geral_cnhs': ${err.message}`);
    errors.push(`geral_cnhs: ${err.message}`);
  }

  // 7. Histórico
  try {
    log("📦 Sincronizando tabela 'historico_movimentacoes'...");
    if (hist.length > 0) {
      const payload = hist
        .map(h => ({
          id: toValidUUID(h.id) || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : (toValidUUID(`hist-${h.geral_id}-${Math.random()}`) || "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12))),
          geral_id: cleanFK(h.geral_id, validGeralIds),
          geral_ordem: h.geral_ordem || null,
          geral_nome: h.geral_nome || null,
          situacao_anterior: h.situacao_anterior || null,
          situacao_nova: h.situacao_nova,
          responsavel_id: cleanFK(h.responsavel_id, validRespIds),
          responsavel_nome: h.responsavel_nome || null,
          usuario_id: cleanFK(h.usuario_id, validUserIds),
          usuario_nome: h.usuario_nome || null,
          observacao: h.observacao || null,
          data_hora: h.data_hora || new Date().toISOString()
        }))
        .filter(h => h.geral_id !== null); // Apenas registros de histórico com CNH existente

      if (payload.length > 0) {
        const synced = await upsertInBatches("historico_movimentacoes", payload, 250);
        log(`✅ Tabela 'historico_movimentacoes' sincronizada (${synced} registros).`);
        totalSynced += synced;
      } else {
        log("ℹ️ Tabela 'historico_movimentacoes' sem registros elegíveis.");
      }
    }
  } catch (err: any) {
    log(`❌ Erro em 'historico_movimentacoes': ${err.message}`);
    errors.push(`historico: ${err.message}`);
  }

  // 8. Auditoria
  try {
    log("📦 Sincronizando tabela 'auditoria'...");
    if (aud.length > 0) {
      const payload = aud.map(a => ({
        id: toValidUUID(a.id) || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : (toValidUUID(`aud-${a.registro_id}-${Math.random()}`) || "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12))),
        tabela: a.tabela,
        registro_id: a.registro_id,
        acao: a.acao,
        usuario_id: cleanFK(a.usuario_id, validUserIds),
        usuario_nome: a.usuario_nome,
        data_hora: a.data_hora || new Date().toISOString(),
        ip: a.ip || "127.0.0.1",
        valores_anteriores: a.valores_anteriores || null,
        valores_novos: a.valores_novos || null
      }));
      const synced = await upsertInBatches("auditoria", payload, 250);
      log(`✅ Tabela 'auditoria' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'auditoria': ${err.message}`);
    errors.push(`auditoria: ${err.message}`);
  }

  // 9. Consultas do Cidadão (Logs de Acesso)
  try {
    const acessosLogs = getAcessosCidadaoLogs();
    if (acessosLogs.length > 0) {
      log(`📦 Sincronizando 'acessos_cidadao' (${acessosLogs.length} registros de consultas do cidadão)...`);
      const payload = acessosLogs.map(a => ({
        id: a.id,
        numero: a.numero,
        data_hora: a.data_hora || new Date().toISOString(),
        cpf: a.cpf,
        nome_titular: a.nome_titular || null,
        situacao: a.situacao,
        resultado_status: a.resultado_status,
        canal: a.canal,
        dispositivo: a.dispositivo || null,
        cidade_origem: a.cidade_origem || null,
        ip_mascarado: a.ip_mascarado || null
      }));
      const synced = await upsertInBatches("acessos_cidadao", payload, 250);
      log(`✅ Tabela 'acessos_cidadao' sincronizada com sucesso (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'acessos_cidadao': ${err.message}. Verifique se a tabela foi criada no Supabase com as colunas corretas.`);
    errors.push(`acessos_cidadao: ${err.message}`);
  }

  // 10. Configuração do Órgão e Logomarca
  try {
    log("📦 Sincronizando 'orgao_config' (Dados institucionais e Logomarca)...");
    let cfg: any = {};
    try {
      const cfgRaw = typeof localStorage !== "undefined" ? localStorage.getItem("detran_orgao_config") : null;
      if (cfgRaw) cfg = JSON.parse(cfgRaw);
    } catch (e) {}

    let logoUrl = cfg.logo || "";
    if (logoUrl && logoUrl.startsWith("data:image/")) {
      try {
        const uploadedUrl = await uploadLogoToSupabaseStorage(logoUrl);
        if (uploadedUrl) {
          logoUrl = uploadedUrl;
          cfg.logo = logoUrl;
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("detran_orgao_config", JSON.stringify(cfg));
          }
        }
      } catch (err) {}
    }

    const payload = [{
      id: "default",
      governo: cfg.governo || "GOVERNO DO ESTADO DO PARÁ",
      secretaria: cfg.secretaria || "SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA",
      orgao: cfg.orgao || "AGÊNCIA DE ITAITUBA",
      sigla: cfg.sigla || "AGÊNCIA ITAITUBA",
      origem_padrao: cfg.origem_padrao || "DA AGÊNCIA DO DETRAN DE ITAITUBA-PA",
      destino_padrao: cfg.destino_padrao || "PARA AGÊNCIA DO DETRAN DE SANTARÉM-PA",
      cidade_uf: cfg.cidade_uf || "Itaituba - PA",
      telefone: cfg.telefone || "(91) 3214-0000",
      email: cfg.email || "protocolo@detran.pa.gov.br",
      endereco: cfg.endereco || "Av. Rodovia BR 316, Km 03 - Belém / PA",
      subtitulo_relatorio: cfg.subtitulo_relatorio || "COORDENADORIA DE HABILITAÇÃO & PROTOCOLO GERAL DE CNHs",
      logo: logoUrl,
      updated_at: new Date().toISOString()
    }];
    const synced = await upsertInBatches("orgao_config", payload, 100);
    log(`✅ Tabela 'orgao_config' e Logomarca sincronizadas com sucesso.`);
    totalSynced += synced;
  } catch (err: any) {
    log(`ℹ️ Aviso em 'orgao_config': ${err.message}`);
  }

  // 11. Sincronizar Lotes de CNHs
  try {
    const lotesList = await getLotes();
    const activeLotes = lotesList.filter(l => !deletedLoteIds.has(l.id));
    if (activeLotes.length > 0) {
      log("📦 Sincronizando tabela 'lotes'...");
      const payload = activeLotes.map(l => ({
        id: l.id,
        numero: Number(l.numero) || 0,
        data_recebimento: l.data_recebimento ? l.data_recebimento.split("T")[0] : new Date().toISOString().split("T")[0],
        documentos_impressos: Number(l.documentos_impressos) || 0,
        pdf_nome: l.pdf_nome || null,
        pdf_url: l.pdf_url || null,
        pdf_tamanho: l.pdf_tamanho !== undefined ? l.pdf_tamanho : null,
        observacao: l.observacao || null,
        usuario_id: l.usuario_id || null,
        usuario_nome: l.usuario_nome || null,
        created_at: l.created_at || new Date().toISOString(),
        updated_at: l.updated_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("lotes", payload, 50);
      log(`✅ Tabela 'lotes' sincronizada (${synced} registros).`);
      totalSynced += synced;
    } else {
      log("ℹ️ Tabela 'lotes' local não possui registros para enviar.");
    }
  } catch (err: any) {
    log(`❌ Erro em 'lotes': ${err.message}`);
    errors.push(`lotes: ${err.message}`);
  }

  // 12. Sincronizar Declarações
  try {
    const declaracoesList = getStoredList<Declaracao>("declaracoes", []);
    const activeDecl = declaracoesList.filter(d => !deletedDeclIds.has(d.id));
    if (activeDecl.length > 0) {
      log("📦 Sincronizando tabela 'declaracoes'...");
      const payload = activeDecl.map(d => ({
        id: d.id,
        numero: d.numero,
        ano: Number(d.ano) || new Date().getFullYear(),
        data_emissao: d.data_emissao || new Date().toISOString().split("T")[0],
        procurador_id: d.procurador_id || null,
        procurador_nome: d.procurador_nome,
        procurador_cpf: d.procurador_cpf,
        procurador_telefone: d.procurador_telefone || null,
        procurador_endereco: d.procurador_endereco || null,
        texto_declaracao: d.texto_declaracao,
        condutores: d.condutores,
        cidade: d.cidade || "Itaituba",
        uf: d.uf || "PA",
        gerente_nome: d.gerente_nome || null,
        gerente_cargo: d.gerente_cargo || null,
        gerente_unidade: d.gerente_unidade || null,
        gerente_portaria: d.gerente_portaria || null,
        observacao: d.observacao || null,
        usuario_id: d.usuario_id || null,
        usuario_nome: d.usuario_nome || null,
        created_at: d.created_at || new Date().toISOString(),
        updated_at: d.updated_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("declaracoes", payload, 100);
      log(`✅ Tabela 'declaracoes' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`❌ Erro em 'declaracoes': ${err.message}`);
    errors.push(`declaracoes: ${err.message}`);
  }

  // 13. Sincronizar Imagens e Anexos (Logomarca Oficial e Anexos)
  try {
    const cfg = getOrgaoConfig();
    const storedImgs = getStoredList<any>("imagens", []);
    const imgPayload: any[] = [...storedImgs];
    if (cfg && cfg.logo && !imgPayload.some(img => img.id === "logo_orgao")) {
      imgPayload.push({
        id: "logo_orgao",
        tabela_ref: "orgao_config",
        registro_id: "default",
        nome: "Logomarca Oficial DETRAN",
        tipo: "logo",
        dados_base64: cfg.logo.startsWith("data:image/") ? cfg.logo : null,
        url_publica: cfg.logo.startsWith("http") ? cfg.logo : null,
        created_at: new Date().toISOString()
      });
    }
    if (imgPayload.length > 0) {
      log(`📦 Sincronizando 'imagens_sync' (${imgPayload.length} registro(s))...`);
      const payload = imgPayload.map(img => ({
        id: img.id || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `img-${Date.now()}`),
        tabela_ref: img.tabela_ref || "orgao_config",
        registro_id: img.registro_id || "default",
        nome: img.nome || "Anexo",
        tipo: img.tipo || "imagem",
        tamanho: img.tamanho || (img.dados_base64 ? img.dados_base64.length : null),
        dados_base64: img.dados_base64 || null,
        url_publica: img.url_publica || null,
        usuario_id: cleanFK(img.usuario_id, validUserIds),
        created_at: img.created_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("imagens_sync", payload, 25);
      log(`✅ Tabela 'imagens_sync' sincronizada (${synced} registros).`);
      totalSynced += synced;
    }
  } catch (err: any) {
    log(`ℹ️ Aviso em 'imagens_sync': ${err.message}`);
  }

  if (errors.length === 0) {
    log("✨ Sincronização Local -> Supabase concluída com sucesso total!");
  } else {
    log(`⚠️ Sincronização concluída com ${errors.length} aviso(s)/erro(s).`);
  }

  return {
    success: errors.length === 0,
    syncedCount: totalSynced,
    errors
  };
}

export async function syncSupabaseToLocal(
  onLog?: (log: string) => void
): Promise<{ success: boolean; pulledCount: number; errors: string[] }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não está configurado.");
  }

  const errors: string[] = [];
  let totalPulled = 0;

  const log = (msg: string) => {
    if (onLog) onLog(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  log("🚀 Baixando todos os dados do Supabase para o Armazenamento Local (com paginação sem limite)...");

  const tables = [
    { name: "usuarios", key: "usuarios", orderCol: "id", asc: true },
    { name: "responsaveis", key: "responsaveis", orderCol: "id", asc: true },
    { name: "mapeamento_localizacao", key: "mapeamento", orderCol: "id", asc: true },
    { name: "memorandos", key: "memorandos", orderCol: "id", asc: true },
    { name: "candidatos", key: "candidatos", orderCol: "id", asc: true },
    { name: "geral_cnhs", key: "geral", orderCol: "ordem", asc: false },
    { name: "historico_movimentacoes", key: "historico", orderCol: "data_hora", asc: false },
    { name: "auditoria", key: "auditoria", orderCol: "data_hora", asc: false },
    { name: "acessos_cidadao", key: "acessos_cidadao", orderCol: "data_hora", asc: false },
    { name: "lotes", key: "lotes", orderCol: "data_recebimento", asc: false },
    { name: "declaracoes", key: "declaracoes", orderCol: "created_at", asc: false },
    { name: "imagens_sync", key: "imagens", orderCol: "created_at", asc: false }
  ];

  for (const item of tables) {
    try {
      log(`📥 Baixando tabela '${item.name}'...`);
      const data = await fetchAllRowsFromSupabase(item.name, 1000, item.orderCol, item.asc);
      if (data && data.length > 0) {
        let filteredData = data;
        if (item.key === "memorandos") {
          const deletedMemoSet = getDeletedIds("memorandos");
          filteredData = data.filter((m: any) => !deletedMemoSet.has(m.id));
        } else if (item.key === "candidatos") {
          const deletedCandSet = getDeletedIds("candidatos");
          const deletedMemoSet = getDeletedIds("memorandos");
          filteredData = data.filter((c: any) => !deletedCandSet.has(c.id) && !deletedMemoSet.has(c.memorando_id));
        }
        
        if (item.key === "geral") {
          // Atualiza tanto localStorage quanto IndexedDB sem disparar re-upload em loop
          saveStoredList("geral", filteredData);
          await saveLocalGeralCNHsBulk(filteredData, true);
        } else if (item.key === "lotes") {
          const deletedLoteSet = getDeletedIds("lotes");
          filteredData = data.filter((l: any) => !deletedLoteSet.has(l.id));
          saveStoredList("lotes", filteredData);
          try {
            if (dexieDb.lotes) {
              await dexieDb.lotes.clear();
              await dexieDb.lotes.bulkPut(filteredData);
            }
          } catch (e) {
            console.warn("Erro ao salvar lotes no Dexie:", e);
          }
          notifyDataSync("lotes");
        } else if (item.key === "declaracoes") {
          const deletedDeclSet = getDeletedIds("declaracoes");
          filteredData = data.filter((d: any) => !deletedDeclSet.has(d.id));
          saveStoredList("declaracoes", filteredData);
          notifyDataSync("declaracoes");
        } else if (item.key === "acessos_cidadao") {
          memoryStore["acessos_cidadao"] = filteredData;
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(filteredData.slice(0, 1000)));
            } catch {}
            idbSet("detran_acessos_cidadao_logs", filteredData).catch(() => {});
          }
        } else if (item.key === "historico") {
          saveStoredList("historico", filteredData);
          idbSet("detran_cnh_historico", filteredData).catch(() => {});
          notifyDataSync("historico");
        } else if (item.key === "auditoria") {
          saveStoredList("auditoria", filteredData);
          idbSet("detran_cnh_auditoria", filteredData).catch(() => {});
          notifyDataSync("auditoria");
        } else if (item.key === "imagens") {
          saveStoredList("imagens", filteredData);
          const logoItem = filteredData.find((img: any) => img.id === "logo_orgao" || img.tipo === "logo");
          if (logoItem && (logoItem.dados_base64 || logoItem.url_publica)) {
            const curCfg = getOrgaoConfig();
            if (curCfg && !curCfg.logo) {
              curCfg.logo = logoItem.url_publica || logoItem.dados_base64;
              saveOrgaoConfig(curCfg);
            }
          }
        } else if (item.key === "usuarios") {
          const { users: sanitizedUsers, repairedCount } = repairCorruptedUsuarios(filteredData);
          saveStoredList("usuarios", sanitizedUsers);
          if (repairedCount > 0) {
            log(`🛠️ Restauradas credenciais de ${repairedCount} usuário(s) que estavam com e-mail/login alterados.`);
            const payloadToFix = sanitizedUsers.map((u) => ({
              id: u.id,
              nome: u.nome,
              nome_curto: u.nome_curto || u.nome,
              email: u.email,
              login: u.login,
              senha: u.senha || "detran@123",
              perfil: u.perfil || "Operador",
              permissoes: u.permissoes || getPermissoesPadrao("Operador"),
              ativo: u.ativo !== false,
              created_at: u.created_at || new Date().toISOString()
            }));
            upsertInBatches("usuarios", payloadToFix, 100, "id").catch((e) =>
              console.warn("Erro ao atualizar usuários reparados no Supabase:", e)
            );
          }
          notifyDataSync("usuarios");
        } else if (item.key === "responsaveis") {
          const sanitizedResp = filteredData.map((r: any) => ({
            ...r,
            cpf: r.cpf === "000.000.000-00" ? "" : (r.cpf || "")
          }));
          saveStoredList("responsaveis", sanitizedResp);
          notifyDataSync("responsaveis");
        } else {
          saveStoredList(item.key, filteredData);
        }

        log(`✅ '${item.name}' baixado e atualizado localmente (${filteredData.length} registros).`);
        totalPulled += filteredData.length;
      } else {
        log(`ℹ️ '${item.name}' no Supabase está vazio.`);
      }
    } catch (err: any) {
      log(`❌ Erro ao baixar '${item.name}': ${err.message}`);
      errors.push(`${item.name}: ${err.message}`);
    }
  }

  // Baixar orgao_config
  try {
    log("📥 Baixando 'orgao_config' e Logomarca do Supabase...");
    const loadedConfig = await loadOrgaoConfigFromSupabase();
    if (loadedConfig) {
      log("✅ 'orgao_config' e Logomarca atualizadas no cache local!");
      totalPulled += 1;
    }
  } catch (err: any) {
    log(`ℹ️ Aviso ao baixar 'orgao_config': ${err.message}`);
  }

  log("✨ Processo de download do Supabase concluído!");
  return {
    success: errors.length === 0,
    pulledCount: totalPulled,
    errors
  };
}

// Sincronização Bidirecional Completa (Envia locais e depois Baixa todos do Supabase unificados)
export async function syncBiDirectional(
  onLog?: (log: string) => void
): Promise<{ success: boolean; totalCount: number; errors: string[] }> {
  const log = (msg: string) => {
    if (onLog) onLog(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  log("🔄 INICIANDO SINCRONIZAÇÃO BIDIRECIONAL COMPLETA (UNIFICAÇÃO DE DADOS)...");
  
  // Passo 1: Enviar todos os dados locais para o Supabase via upsert em lotes
  const pushRes = await syncLocalToSupabase(onLog);

  // Passo 2: Baixar a totalidade dos dados do Supabase com paginação completa
  const pullRes = await syncSupabaseToLocal(onLog);

  const errors = [...pushRes.errors, ...pullRes.errors];
  log("🎉 UNIFICAÇÃO BIDIRECIONAL CONCLUÍDA! Ambos os bancos estão 100% alinhados.");

  return {
    success: errors.length === 0,
    totalCount: pullRes.pulledCount,
    errors
  };
}

// Sincronização pontual de uma única tabela selecionada
export async function syncSingleTable(
  tableKey: string,
  onLog?: (msg: string) => void
): Promise<{ success: boolean; message: string; localCount: number; remoteCount: number }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não está configurado.");
  }
  const log = (m: string) => {
    if (onLog) onLog(`[${new Date().toLocaleTimeString()}] ${m}`);
  };

  await initStorage(true);

  const tableMap: Record<string, { tableName: string; orderCol?: string; asc?: boolean }> = {
    usuarios: { tableName: "usuarios", orderCol: "id", asc: true },
    responsaveis: { tableName: "responsaveis", orderCol: "id", asc: true },
    mapeamento: { tableName: "mapeamento_localizacao", orderCol: "id", asc: true },
    memorandos: { tableName: "memorandos", orderCol: "id", asc: true },
    candidatos: { tableName: "candidatos", orderCol: "id", asc: true },
    geral: { tableName: "geral_cnhs", orderCol: "ordem", asc: false },
    lotes: { tableName: "lotes", orderCol: "data_recebimento", asc: false },
    declaracoes: { tableName: "declaracoes", orderCol: "created_at", asc: false },
    historico: { tableName: "historico_movimentacoes", orderCol: "data_hora", asc: false },
    auditoria: { tableName: "auditoria", orderCol: "data_hora", asc: false },
    acessos_cidadao: { tableName: "acessos_cidadao", orderCol: "data_hora", asc: false },
    orgao: { tableName: "orgao_config" },
    imagens: { tableName: "imagens_sync", orderCol: "created_at", asc: false }
  };

  const info = tableMap[tableKey];
  if (!info) {
    throw new Error(`Tabela '${tableKey}' não reconhecida.`);
  }

  log(`🚀 Iniciando sincronização individual da tabela '${info.tableName}'...`);

  // PASSO 1: Enviar local para Supabase
  if (tableKey === "usuarios") {
    const usuarios = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
    if (usuarios.length > 0) {
      log(`📦 Enviando ${usuarios.length} usuários para o Supabase...`);
      const payload = usuarios.map(u => ({
        id: u.id || "11111111-1111-1111-1111-111111111111",
        nome: u.nome,
        nome_curto: u.nome_curto,
        fone: u.fone || null,
        email: u.email,
        funcao: u.funcao || null,
        setor: u.setor || "Protocolo",
        login: u.login,
        senha: u.senha || "detran@123",
        permissoes: u.permissoes,
        perfil: u.perfil,
        ativo: u.ativo !== false,
        created_at: u.created_at || new Date().toISOString()
      }));
      await upsertInBatches("usuarios", payload, 250);
      log(`✅ Usuários enviados com sucesso.`);
    }
  } else if (tableKey === "responsaveis") {
    const resp = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
    if (resp.length > 0) {
      log(`📦 Enviando ${resp.length} responsáveis para o Supabase...`);
      const payload = resp.map(r => ({
        id: r.id || "e2335b1e",
        nome: r.nome,
        cpf: r.cpf || "",
        telefone: r.telefone || null,
        registro: r.registro || null,
        observacao: r.observacao || null,
        ativo: r.ativo !== false,
        created_at: r.created_at || new Date().toISOString()
      }));
      await upsertInBatches("responsaveis", payload, 250);
      log(`✅ Responsáveis enviados com sucesso.`);
    }
  } else if (tableKey === "mapeamento") {
    const mapList = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
    if (mapList.length > 0) {
      log(`📦 Enviando ${mapList.length} mapeamentos para o Supabase...`);
      const payload = mapList.map(m => ({
        id: m.id || `map-${(m.inicial || "A").toLowerCase()}`,
        inicial: m.inicial,
        gaveta: m.gaveta,
        reparticao: m.reparticao,
        ativo: m.ativo !== false
      }));
      await upsertInBatches("mapeamento_localizacao", payload, 250);
      log(`✅ Mapeamento enviado com sucesso.`);
    }
  } else if (tableKey === "memorandos") {
    const deletedMemoIds = getDeletedIds("memorandos");
    const mems = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS).filter(m => !deletedMemoIds.has(m.id));
    const validUserIds = new Set((getStoredList<Usuario>("usuarios", SEED_USUARIOS)).map(u => u.id));
    if (mems.length > 0) {
      log(`📦 Enviando ${mems.length} memorandos para o Supabase...`);
      const payload = mems.map(m => ({
        id: m.id || `memo-${m.numero}`,
        numero: m.numero,
        status: m.status,
        usuario_id: cleanFK(m.usuario_id, validUserIds),
        usuario_nome: m.usuario_nome || null,
        remessa: m.remessa || null,
        candidatos_count: m.candidatos_count || 0,
        created_at: m.created_at || new Date().toISOString()
      }));
      await upsertInBatches("memorandos", payload, 250);
      log(`✅ Memorandos enviados com sucesso.`);
    }
  } else if (tableKey === "candidatos") {
    const deletedCandIds = getDeletedIds("candidatos");
    const deletedMemoIds = getDeletedIds("memorandos");
    const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS).filter(
      c => !deletedCandIds.has(c.id) && !deletedMemoIds.has(c.memorando_id)
    );
    const mems = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
    const validMemoIds = new Set(mems.map(m => m.id));
    if (cands.length > 0) {
      log(`📦 Enviando ${cands.length} candidatos para o Supabase...`);
      const payload = cands.map(c => ({
        id: c.id || `cand-${c.memorando_id}-${c.numero || "01"}`,
        memorando_id: cleanFK(c.memorando_id, validMemoIds),
        numero: c.numero || null,
        nome: c.nome,
        cpf: c.cpf,
        telefone: c.telefone || null,
        remessa: c.remessa || null,
        created_at: c.created_at || new Date().toISOString()
      }));
      await upsertInBatches("candidatos", payload, 250);
      log(`✅ Candidatos enviados com sucesso.`);
    }
  } else if (tableKey === "geral") {
    const geral = memoryStore["geral"] && memoryStore["geral"].length > 0 ? memoryStore["geral"] : await getGeralCNHs();
    const validMemoIds = new Set((getStoredList<Memorando>("memorandos", SEED_MEMORANDOS)).map(m => m.id));
    const validCandIds = new Set((getStoredList<Candidato>("candidatos", SEED_CANDIDATOS)).map(c => c.id));
    const validUserIds = new Set((getStoredList<Usuario>("usuarios", SEED_USUARIOS)).map(u => u.id));
    const validRespIds = new Set((getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS)).map(r => r.id));
    if (geral.length > 0) {
      log(`📦 Enviando ${geral.length} registros de CNHs para o Supabase...`);
      const payload = geral.map(g => ({
        id: g.id || `cnh-${g.ordem}`,
        ordem: g.ordem,
        memorando_id: cleanFK(g.memorando_id, validMemoIds),
        candidato_id: cleanFK(g.candidato_id, validCandIds),
        nome: g.nome,
        cpf: g.cpf,
        gaveta: g.gaveta || "",
        reparticao: g.reparticao || "",
        situacao: g.situacao,
        responsavel_id: cleanFK(g.responsavel_id, validRespIds),
        responsavel_nome: g.responsavel_nome || null,
        data_movimento: g.data_movimento || new Date().toISOString(),
        usuario_id: cleanFK(g.usuario_id, validUserIds),
        usuario_nome: g.usuario_nome || null,
        memorando_numero: g.memorando_numero || null,
        remessa: g.remessa || null,
        observacao: g.observacao || null,
        created_at: g.created_at || new Date().toISOString(),
        updated_at: g.updated_at || g.data_movimento || new Date().toISOString()
      }));
      await upsertInBatches("geral_cnhs", payload, 250);
      log(`✅ Registros de CNHs enviados com sucesso.`);
    }
  } else if (tableKey === "lotes") {
    const lotesList = await getLotes();
    const deletedLoteIds = getDeletedIds("lotes");
    const activeLotes = lotesList.filter(l => !deletedLoteIds.has(l.id));
    if (activeLotes.length > 0) {
      log(`📦 Enviando ${activeLotes.length} lotes para o Supabase...`);
      const payload = activeLotes.map(l => ({
        id: l.id,
        numero: Number(l.numero) || 0,
        data_recebimento: l.data_recebimento ? l.data_recebimento.split("T")[0] : new Date().toISOString().split("T")[0],
        documentos_impressos: Number(l.documentos_impressos) || 0,
        pdf_nome: l.pdf_nome || null,
        pdf_url: l.pdf_url || null,
        pdf_tamanho: l.pdf_tamanho !== undefined ? l.pdf_tamanho : null,
        observacao: l.observacao || null,
        usuario_id: l.usuario_id || null,
        usuario_nome: l.usuario_nome || null,
        created_at: l.created_at || new Date().toISOString(),
        updated_at: l.updated_at || new Date().toISOString()
      }));
      await upsertInBatches("lotes", payload, 50);
      log(`✅ Lotes enviados com sucesso.`);
    }
  } else if (tableKey === "declaracoes") {
    const declList = getStoredList<Declaracao>("declaracoes", []);
    const deletedDeclIds = getDeletedIds("declaracoes");
    const activeDecl = declList.filter(d => !deletedDeclIds.has(d.id));
    if (activeDecl.length > 0) {
      log(`📦 Enviando ${activeDecl.length} declarações para o Supabase...`);
      const payload = activeDecl.map(d => ({
        id: d.id,
        numero: d.numero,
        ano: Number(d.ano) || new Date().getFullYear(),
        data_emissao: d.data_emissao || new Date().toISOString().split("T")[0],
        procurador_id: d.procurador_id || null,
        procurador_nome: d.procurador_nome,
        procurador_cpf: d.procurador_cpf,
        procurador_telefone: d.procurador_telefone || null,
        procurador_endereco: d.procurador_endereco || null,
        texto_declaracao: d.texto_declaracao,
        condutores: d.condutores,
        cidade: d.cidade || "Itaituba",
        uf: d.uf || "PA",
        gerente_nome: d.gerente_nome || null,
        gerente_cargo: d.gerente_cargo || null,
        gerente_unidade: d.gerente_unidade || null,
        gerente_portaria: d.gerente_portaria || null,
        observacao: d.observacao || null,
        usuario_id: d.usuario_id || null,
        usuario_nome: d.usuario_nome || null,
        created_at: d.created_at || new Date().toISOString(),
        updated_at: d.updated_at || new Date().toISOString()
      }));
      await upsertInBatches("declaracoes", payload, 50);
      log(`✅ Declarações enviadas com sucesso.`);
    }
  } else if (tableKey === "historico") {
    const idbHist = await idbGet<HistoricoMovimentacao[]>("detran_cnh_historico");
    const localHist = getStoredList<HistoricoMovimentacao>("historico", SEED_HISTORICO);
    const hist = (idbHist && idbHist.length > localHist.length) ? idbHist : localHist;
    const geral = memoryStore["geral"] && memoryStore["geral"].length > 0 ? memoryStore["geral"] : await getGeralCNHs();
    const validGeralIds = new Set(geral.map(g => g.id));
    const validUserIds = new Set((getStoredList<Usuario>("usuarios", SEED_USUARIOS)).map(u => u.id));
    const validRespIds = new Set((getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS)).map(r => r.id));
    if (hist.length > 0) {
      log(`📦 Enviando ${hist.length} movimentações de histórico para o Supabase...`);
      const payload = hist.map(h => ({
        id: toValidUUID(h.id) || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : (toValidUUID(`hist-${h.geral_id}-${Math.random()}`) || "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12))),
        geral_id: cleanFK(h.geral_id, validGeralIds),
        geral_ordem: h.geral_ordem || null,
        geral_nome: h.geral_nome || null,
        situacao_anterior: h.situacao_anterior || null,
        situacao_nova: h.situacao_nova,
        responsavel_id: cleanFK(h.responsavel_id, validRespIds),
        responsavel_nome: h.responsavel_nome || null,
        usuario_id: cleanFK(h.usuario_id, validUserIds),
        usuario_nome: h.usuario_nome || null,
        observacao: h.observacao || null,
        data_hora: h.data_hora || new Date().toISOString()
      })).filter(h => h.geral_id !== null);
      await upsertInBatches("historico_movimentacoes", payload, 250);
      log(`✅ Histórico enviado com sucesso.`);
    }
  } else if (tableKey === "auditoria") {
    const idbAud = await idbGet<Auditoria[]>("detran_cnh_auditoria");
    const localAud = getStoredList<Auditoria>("auditoria", SEED_AUDITORIA);
    const aud = (idbAud && idbAud.length > localAud.length) ? idbAud : localAud;
    const validUserIds = new Set((getStoredList<Usuario>("usuarios", SEED_USUARIOS)).map(u => u.id));
    if (aud.length > 0) {
      log(`📦 Enviando ${aud.length} registros de auditoria para o Supabase...`);
      const payload = aud.map(a => ({
        id: toValidUUID(a.id) || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : (toValidUUID(`aud-${a.registro_id}-${Math.random()}`) || "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12))),
        tabela: a.tabela,
        registro_id: a.registro_id || "",
        acao: a.acao,
        usuario_id: cleanFK(a.usuario_id, validUserIds),
        usuario_nome: a.usuario_nome || null,
        dados_antigos: (a as any).dados_antigos ? JSON.stringify((a as any).dados_antigos) : (a.valores_anteriores ? JSON.stringify(a.valores_anteriores) : null),
        dados_novos: (a as any).dados_novos ? JSON.stringify((a as any).dados_novos) : (a.valores_novos ? JSON.stringify(a.valores_novos) : null),
        data_hora: a.data_hora || new Date().toISOString()
      }));
      await upsertInBatches("auditoria", payload, 250);
      log(`✅ Auditoria enviada com sucesso.`);
    }
  } else if (tableKey === "orgao") {
    log("📦 Sincronizando dados institucionais do órgão...");
    const cfg: any = getOrgaoConfig() || {};
    const payload = [{
      id: "default",
      governo: cfg.governo || "GOVERNO DO ESTADO DO PARÁ",
      secretaria: cfg.secretaria || "SECRETARIA DE ESTADO DE SEGURQUIA PÚBLICA",
      orgao: cfg.orgao || "AGÊNCIA DE ITAITUBA",
      sigla: cfg.sigla || "AGÊNCIA ITAITUBA",
      origem_padrao: cfg.origem_padrao || "DA AGÊNCIA DO DETRAN DE ITAITUBA-PA",
      destino_padrao: cfg.destino_padrao || "PARA AGÊNCIA DO DETRAN DE SANTARÉM-PA",
      cidade_uf: cfg.cidade_uf || "Itaituba - PA",
      telefone: cfg.telefone || "(91) 3214-0000",
      email: cfg.email || "protocolo@detran.pa.gov.br",
      endereco: cfg.endereco || "Av. Rodovia BR 316, Km 03 - Belém / PA",
      subtitulo_relatorio: cfg.subtitulo_relatorio || "COORDENADORIA DE HABILITAÇÃO & PROTOCOLO GERAL DE CNHs",
      logo: cfg.logo || "",
      updated_at: new Date().toISOString()
    }];
    await upsertInBatches("orgao_config", payload, 10);
  } else if (tableKey === "imagens") {
    const cfg = getOrgaoConfig();
    const storedImgs = getStoredList<any>("imagens", []);
    const imgPayload: any[] = [...storedImgs];
    if (cfg && cfg.logo && !imgPayload.some(img => img.id === "logo_orgao")) {
      imgPayload.push({
        id: "logo_orgao",
        tabela_ref: "orgao_config",
        registro_id: "default",
        nome: "Logomarca Oficial DETRAN",
        tipo: "logo",
        dados_base64: cfg.logo.startsWith("data:image/") ? cfg.logo : null,
        url_publica: cfg.logo.startsWith("http") ? cfg.logo : null,
        created_at: new Date().toISOString()
      });
    }
    if (imgPayload.length > 0) {
      log(`📦 Enviando ${imgPayload.length} imagem(ns) / anexo(s) para o Supabase...`);
      await upsertInBatches("imagens_sync", imgPayload, 20);
    }
  } else if (tableKey === "acessos_cidadao") {
    const logs = getAcessosCidadaoLogs();
    if (logs.length > 0) {
      log(`📦 Enviando ${logs.length} logs de cidadão para o Supabase...`);
      await upsertInBatches("acessos_cidadao", logs, 200);
    }
  }

  // PASSO 2: Baixar do Supabase e sincronizar localmente
  log(`📥 Baixando versão consolidada de '${info.tableName}' do Supabase...`);
  const remoteData = await fetchAllRowsFromSupabase(info.tableName, 1000, info.orderCol, info.asc, true);

  if (tableKey === "lotes") {
    const deletedLoteSet = getDeletedIds("lotes");
    const filtered = (remoteData || []).filter((l: any) => !deletedLoteSet.has(l.id));
    saveStoredList("lotes", filtered);
    if (dexieDb.lotes) {
      await dexieDb.lotes.clear();
      await dexieDb.lotes.bulkPut(filtered);
    }
    notifyDataSync("lotes");
  } else if (tableKey === "memorandos") {
    const deletedMemoSet = getDeletedIds("memorandos");
    const filtered = (remoteData || []).filter((m: any) => !deletedMemoSet.has(m.id));
    saveStoredList("memorandos", filtered);
    notifyDataSync("memorandos");
  } else if (tableKey === "candidatos") {
    const deletedCandSet = getDeletedIds("candidatos");
    const filtered = (remoteData || []).filter((c: any) => !deletedCandSet.has(c.id));
    saveStoredList("candidatos", filtered);
    notifyDataSync("candidatos");
  } else if (tableKey === "declaracoes") {
    const deletedDeclSet = getDeletedIds("declaracoes");
    const filtered = (remoteData || []).filter((d: any) => !deletedDeclSet.has(d.id));
    saveStoredList("declaracoes", filtered);
    notifyDataSync("declaracoes");
  } else if (tableKey === "orgao") {
    await loadOrgaoConfigFromSupabase();
  } else if (tableKey === "imagens") {
    saveStoredList("imagens", remoteData || []);
    const logoItem = (remoteData || []).find((img: any) => img.id === "logo_orgao" || img.tipo === "logo");
    if (logoItem && (logoItem.dados_base64 || logoItem.url_publica)) {
      const curCfg = getOrgaoConfig();
      if (curCfg && !curCfg.logo) {
        curCfg.logo = logoItem.url_publica || logoItem.dados_base64;
        saveOrgaoConfig(curCfg);
      }
    }
  } else if (tableKey === "acessos_cidadao") {
    memoryStore["acessos_cidadao"] = remoteData || [];
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify((remoteData || []).slice(0, 1000)));
      } catch {}
      idbSet("detran_acessos_cidadao_logs", remoteData || []).catch(() => {});
    }
  } else if (tableKey === "historico") {
    saveStoredList("historico", remoteData || []);
    await idbSet("detran_cnh_historico", remoteData || []);
    notifyDataSync("historico");
  } else if (tableKey === "auditoria") {
    saveStoredList("auditoria", remoteData || []);
    await idbSet("detran_cnh_auditoria", remoteData || []);
    notifyDataSync("auditoria");
  } else if (tableKey === "geral") {
    saveStoredList("geral", remoteData || []);
    await saveLocalGeralCNHsBulk(remoteData || [], true);
  } else {
    saveStoredList(tableKey, remoteData || []);
    notifyDataSync(tableKey);
  }

  const finalRemoteCount = (remoteData || []).length;
  let finalLocalCount = finalRemoteCount;
  if (tableKey === "lotes" && dexieDb.lotes) {
    finalLocalCount = await dexieDb.lotes.count();
  } else if (tableKey === "geral") {
    finalLocalCount = await dexieDb.geral.count();
  } else if (tableKey === "memorandos") {
    finalLocalCount = getStoredList("memorandos", []).length;
  } else if (tableKey === "candidatos") {
    finalLocalCount = getStoredList("candidatos", []).length;
  } else if (tableKey === "historico") {
    finalLocalCount = (await idbGet<any[]>("detran_cnh_historico"))?.length || getStoredList("historico", []).length;
  } else if (tableKey === "auditoria") {
    finalLocalCount = (await idbGet<any[]>("detran_cnh_auditoria"))?.length || getStoredList("auditoria", []).length;
  }

  log(`🎉 Sincronização de '${info.tableName}' finalizada: Local (${finalLocalCount}) = Supabase (${finalRemoteCount}).`);

  return {
    success: true,
    message: `Tabela '${info.tableName}' sincronizada com sucesso.`,
    localCount: finalLocalCount,
    remoteCount: finalRemoteCount
  };
}

