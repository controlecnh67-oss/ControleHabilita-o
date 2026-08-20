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
  getPermissoesPadrao
} from "../types";
import { getInitialChar, formatDateTime } from "../lib/utils";
import { supabase, isSupabaseConfigured } from "./supabase";
import * as XLSX from "xlsx";
import cnhSeedData from "../data/cnhSeedData.json";
import {
  saveLocalGeralCNH,
  saveLocalGeralCNHsBulk,
  deleteLocalGeralCNH,
  deleteLocalGeralCNHsBulk,
  getLocalGeralCNHs,
  syncGeralWithSupabase
} from "./dexieDb";
import { uploadLogoToSupabaseStorage, loadOrgaoConfigFromSupabase } from "./orgaoService";

// Verificação de credenciais Supabase reais via variáveis de ambiente VITE_ ou utilitário
export function isSupabaseConnected(): boolean {
  return isSupabaseConfigured();
}

// Disparar evento global de sincronização para atualizar todas as abas e componentes
export function notifyDataSync(type: string = "all") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("detran_sync_updated", { detail: { type, timestamp: Date.now() } }));
  }
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
    nome: "Kaio",
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
    nome: "Dabita",
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
    nome: "Lohandes",
    nome_curto: "Lohandes",
    fone: "(67) 99333-4444",
    email: "lohandes@detran.pa.gov.br",
    funcao: "Agente de Trânsito",
    setor: "Atendimento CNH",
    login: "lohandes",
    senha: "detran@123",
    permissoes: getPermissoesPadrao("Operador"),
    perfil: "Operador",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    ativo: true
  },
  {
    id: "33aa7d87",
    nome: "Regis",
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
    nome: "Ivanilde",
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
  { id: "e2335b1e", nome: "PROPRIETÁRIO(A)", registro: "1", cpf: "", telefone: "", observacao: "Registro padrão para entrega ao próprio titular da CNH", ativo: true, created_at: new Date(Date.now() - 60 * 86400000).toISOString() },
  { id: "d2b9952a", nome: "FRANCINEY DESPACHANTE", registro: "1522", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "f4f347f1", nome: "CLEONAR DESPCHANTE", registro: "4567", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "39de40af", nome: "BRIZOLA AUTO ESCOLA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "384b2d8c", nome: "DARLAN DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "60c09b00", nome: "MARLISSON DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "33a90e11", nome: "NATIELE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "71396f81", nome: "JOÃO PULO R MARQUES", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "97d3ad5e", nome: "AUTO ESCOLA SANTANA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "fa41cde8", nome: "ARY DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "402ee83c", nome: "BAMBAM DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "b9bfae57", nome: "MARIA EUNICE DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "1f3d321e", nome: "MOISES DESPACAHNTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "5c4f215f", nome: "GILMAR DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "772dfcfd", nome: "NEILA DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "56899764", nome: "KAIO LOHANDES", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "bb95cdf5", nome: "WALTER DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "1b5ecd73", nome: "ODON DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "ee175176", nome: "TULA DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "fa1481d9", nome: "ESPOSA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "527d4682", nome: "ELIONAI DESPACHANTE", cpf: "67079733200", registro: "52", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "c1058daa", nome: "ANTONIO WELITON RODRIGUES", cpf: "51548496200", telefone: "XXXXXX", ativo: true, created_at: new Date().toISOString() },
  { id: "efd23bd9", nome: "NICE DESPACHANTE", cpf: "5555555", telefone: "555555", ativo: true, created_at: new Date().toISOString() },
  { id: "7345b45d", nome: "GUSTAVO HENRIQUE SENA", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "85415cb3", nome: "SOCORRO DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "2995c099", nome: "ADAO DA ROSA NETO", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "6fb3467c", nome: "EDCARLOS LOLO", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "68b5d3ce", nome: "FERNANDO DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "a84dc2b7", nome: "JULIMAR DESPACHANTE", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "6da4b403", nome: "ED CARLOS BRAGA DOS SANTOS", cpf: "57950040220", telefone: "", ativo: true, created_at: new Date().toISOString() },
  { id: "b7d9a27f", nome: "ANA CRISTINA CIRINO", cpf: "", telefone: "", ativo: true, created_at: new Date().toISOString() },
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
  { id: "cand-01", memorando_id: "memo-03", numero: "01", nome: "Luciana Borges Ferreira", cpf: "555.666.777-88", telefone: "(67) 98111-2233", remessa: "REM-003/ABRIL", created_at: new Date().toISOString() },
  { id: "cand-02", memorando_id: "memo-03", numero: "02", nome: "Marcos Vinicius Santos", cpf: "666.777.888-99", telefone: "(67) 98222-3344", remessa: "REM-003/ABRIL", created_at: new Date().toISOString() },
  { id: "cand-03", memorando_id: "memo-03", numero: "03", nome: "Helena Maria de Souza", cpf: "777.888.999-00", telefone: "(67) 98333-4455", remessa: "REM-003/ABRIL", created_at: new Date().toISOString() }
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
export async function initStorage(): Promise<void> {
  if (isIdbInitialized) return;
  const keys = [
    "usuarios", "responsaveis", "memorandos", "candidatos", "geral", "historico", "auditoria", "mapeamento",
    "deleted_memorandos", "deleted_candidatos", "deleted_geral", "deleted_responsaveis"
  ];
  for (const k of keys) {
    try {
      const idbVal = await idbGet<any[]>(`detran_cnh_${k}`);
      if (idbVal && Array.isArray(idbVal)) {
        memoryStore[k] = idbVal;
      }
    } catch (e) {
      console.warn(`Aviso ao carregar ${k} do IndexedDB:`, e);
    }
  }
  isIdbInitialized = true;
}

// Helper para obter/salvar com cache em memória e IndexedDB + LocalStorage
function getStoredList<T extends { id?: string }>(key: string, seed: T[]): T[] {
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

function saveStoredList<T>(key: string, data: T[]): void {
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
  const keys = ["usuarios", "responsaveis", "memorandos", "candidatos", "geral", "historico", "auditoria", "mapeamento"];
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

export async function getUsuarios(): Promise<Usuario[]> {
  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Usuario>("usuarios", 1000, "created_at", false);
      if (data && Array.isArray(data)) {
        const activeUsers = data.filter((u) => u.ativo !== false);
        saveStoredList("usuarios", activeUsers);
        return activeUsers;
      }
    } catch (err) {
      console.warn("Aviso ao buscar usuários do Supabase, caindo para local:", err);
    }
  }
  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  return localList.filter((u) => u.ativo !== false);
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

export async function deleteUsuario(id: string, adminId: string, adminNome: string): Promise<void> {
  const list = await getUsuarios();
  const target = list.find((u) => u.id === id);
  if (!target) return;
  if (target.login === "admin") {
    throw new Error("O Administrador principal não pode ser excluído.");
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from("usuarios").delete().eq("id", id);
      if (error) {
        console.warn("Aviso no Supabase ao deletar usuário (inativando para preservar integridade):", error.message);
        await supabase.from("usuarios").update({ ativo: false }).eq("id", id);
      }
    } catch (err: any) {
      console.warn("Falha ao deletar no Supabase, mantendo exclusão local:", err);
    }
  }

  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const filtrados = localList.filter((u) => u.id !== id);
  saveStoredList("usuarios", filtrados);
  notifyDataSync("usuarios");
  await logAuditoria("usuarios", target.login, "Exclusão", adminId, adminNome, target, null);
}

// ============================================================================
// MÓDULO DE RESPONSÁVEIS
// ============================================================================

export async function getResponsaveis(): Promise<Responsavel[]> {
  if (isSupabaseConfigured()) {
    try {
      const data = await fetchAllRowsFromSupabase<Responsavel>("responsaveis", 1000, "nome", true);
      if (data && Array.isArray(data)) {
        saveStoredList("responsaveis", data);
        return data;
      }
    } catch (err) {
      console.warn("Aviso ao buscar responsáveis no Supabase:", err);
    }
  }
  return getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS).sort((a, b) =>
    a.nome.localeCompare(b.nome)
  );
}

export async function createResponsavel(
  data: Omit<Responsavel, "id" | "created_at">,
  userId: string,
  userNome: string
): Promise<Responsavel> {
  const list = await getResponsaveis();
  const cleanNewCpf = data.cpf ? data.cpf.replace(/\D/g, "") : "";
  if (cleanNewCpf && list.some((r) => r.cpf && r.cpf.replace(/\D/g, "") === cleanNewCpf)) {
    throw new Error("Impedir CPF duplicado: Este CPF já está cadastrado como responsável.");
  }

  const newUuid = crypto.randomUUID();
  const novo: Responsavel = {
    ...data,
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
  if (ant.nome === "Proprietário" && data.nome && data.nome !== "Proprietário") {
    throw new Error("O registro Padrão 'Proprietário' não pode ser modificado no nome ou CPF.");
  }
  const atualizado = { ...ant, ...data };

  if (isSupabaseConfigured()) {
    try {
      const { data: updatedSup, error } = await supabase.from("responsaveis").update(data).eq("id", id).select().single();
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
  if (target.nome === "Proprietário" || target.cpf === "000.000.000-00") {
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
        const merged = [...validRemoteWithTelefone, ...localOnly];
        saveStoredList("candidatos", merged);
        return merged;
      }
    } catch (err) {
      console.warn("Aviso ao buscar candidatos no Supabase:", err);
    }
  }
  return getStoredList<Candidato>("candidatos", SEED_CANDIDATOS).filter(
    (c) => !deletedCandIds.has(c.id) && !deletedMemoIds.has(c.memorando_id)
  );
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
        const remoteIds = new Set(validRemote.map((d) => d.id));
        const localOnly = local.filter((m) => !remoteIds.has(m.id) && !deletedIds.has(m.id));
        const merged = [...validRemote, ...localOnly].filter((m) => !deletedIds.has(m.id));
        saveStoredList("memorandos", merged);
      }
    } catch (err) {
      console.warn("Aviso ao buscar memorandos no Supabase:", err);
    }
  }
  const list = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS).filter((m) => !deletedIds.has(m.id));
  const cands = await getCandidatosAll();
  return list.map((m) => ({
    ...m,
    candidatos_count: cands.filter((c) => c.memorando_id === m.id).length
  })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
  data: { numero: string; remessa?: string },
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
    created_at: new Date().toISOString(),
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
        await supabase.from("memorandos").update(safeData).eq("id", id);
      }
    } catch (err) {
      console.warn("Aviso ao atualizar memorando no Supabase:", err);
    }
  }

  saveStoredList("memorandos", list);
  notifyDataSync("memorandos");

  if (ant.status === "Remetido" && (data.numero || data.remessa !== undefined)) {
    const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
    let updatedGeral = false;
    geralList.forEach((cnh) => {
      if (cnh.memorando_id === id) {
        cnh.observacao = `Remetida via memorando ${atualizado.numero}${atualizado.remessa ? ` - Remessa ${atualizado.remessa}` : ""}`;
        updatedGeral = true;
      }
    });
    if (updatedGeral) saveStoredList("geral", geralList);
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
  memos[memoIndex] = { ...memo, status: "Remetido" };
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
  const now = new Date().toISOString();

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
      await supabase.from("memorandos").update({ status: "Remetido" }).eq("id", memorando_id);
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
  memos[memoIndex] = { ...memo, status: "Em elaboração" };
  saveStoredList("memorandos", memos);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("memorandos").update({ status: "Em elaboração" }).eq("id", memorando_id);
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

export async function getGeralCNHs(): Promise<GeralCNH[]> {
  await initStorage();
  let rawList: GeralCNH[] = await getLocalGeralCNHs();

  // Se o IndexedDB estiver totalmente vazio e o Supabase configurado, realiza a sincronização paginada inicial
  if (rawList.length === 0 && isSupabaseConfigured()) {
    try {
      await syncGeralWithSupabase(true);
      rawList = await getLocalGeralCNHs();
    } catch (err) {
      console.warn("Aviso ao sincronizar inicialmente com Supabase:", err);
    }
  }

  // Se ainda assim estiver vazio, carrega sementes estáticas
  if (rawList.length === 0) {
    rawList = getStoredList<GeralCNH>("geral", SEED_GERAL);
    if (rawList.length > 0) {
      saveLocalGeralCNHsBulk(rawList).catch(() => {});
    }
  }

  const seedByOrdem = new Map(SEED_GERAL.map((s) => [s.ordem, s]));
  const seedById = new Map(SEED_GERAL.map((s) => [s.id, s]));

  const list = rawList.map((c) => {
    const seed = seedByOrdem.get(c.ordem) || seedById.get(c.id);
    const dataMov = c.data_movimento || c.created_at || (c as any).criado_em || (seed ? seed.data_movimento : undefined);
    const usrId = c.usuario_id || (seed ? seed.usuario_id : undefined);
    const usrNome = c.usuario_nome || (seed ? seed.usuario_nome : undefined);

    return {
      ...c,
      data_movimento: dataMov,
      usuario_id: usrId,
      usuario_nome: usrNome
    };
  });

  const usuarios = await getUsuarios();
  const responsaveis = await getResponsaveis();
  const memorandos = await getMemorandos();
  const candidatos = await getCandidatosAll();

  return list.map((c) => {
    const usr = usuarios.find((u) => u.id === c.usuario_id);
    const resp = responsaveis.find(
      (r) =>
        r.id === c.responsavel_id ||
        r.id === c.responsavel_nome ||
        (r.nome && c.responsavel_nome && r.nome.trim().toLowerCase() === c.responsavel_nome.trim().toLowerCase()) ||
        (r.nome && c.responsavel_id && r.nome.trim().toLowerCase() === c.responsavel_id.trim().toLowerCase())
    );
    const memo = memorandos.find((m) => m.id === c.memorando_id);
    const cand = candidatos.find((cand) => cand.id === c.candidato_id);
    const seed = seedByOrdem.get(c.ordem) || seedById.get(c.id);

    let displayRespNome = resp ? resp.nome : c.responsavel_nome;
    if (displayRespNome) {
      const matchResp = responsaveis.find((r) => r.id === displayRespNome);
      if (matchResp) {
        displayRespNome = matchResp.nome;
      }
    }
    if ((!displayRespNome || displayRespNome === "-") && c.responsavel_id) {
      const matchResp = responsaveis.find((r) => r.id === c.responsavel_id);
      if (matchResp) {
        displayRespNome = matchResp.nome;
      }
    }

    const nomeCalculado = (c.nome && c.nome.trim() !== "")
      ? c.nome
      : (cand && cand.nome && cand.nome.trim() !== "" ? cand.nome : (seed ? seed.nome : ""));

    const cpfCalculado = (c.cpf && c.cpf.trim() !== "")
      ? c.cpf
      : (cand && cand.cpf && cand.cpf.trim() !== "" ? cand.cpf : (seed ? seed.cpf : ""));

    const telefoneCalculado = (c.telefone && c.telefone.trim() !== "")
      ? c.telefone
      : (cand && cand.telefone && cand.telefone.trim() !== "" ? cand.telefone : (seed ? seed.telefone : ""));

    return {
      ...c,
      nome: nomeCalculado,
      cpf: cpfCalculado,
      telefone: telefoneCalculado,
      usuario_nome: usr ? usr.nome_curto : c.usuario_nome || "Agente DETRAN",
      responsavel_id: resp ? resp.id : c.responsavel_id,
      responsavel_nome: displayRespNome && displayRespNome !== "-" ? displayRespNome : (c.responsavel_nome && !responsaveis.some(r => r.id === c.responsavel_nome) ? c.responsavel_nome : "-"),
      memorando_numero: memo ? memo.numero : (c.memorando_numero || undefined),
      remessa: memo ? (memo.remessa || memo.numero) : (c.remessa || undefined)
    };
  }).sort((a, b) => b.ordem - a.ordem);
}

// Interface e Função para Contador de Consultas Públicas Mobile por Cidadão
export function getPublicSearchCount(): number {
  if (typeof window === "undefined") return 120;
  const logs = getAcessosCidadaoLogs();
  const count = logs.length;
  try {
    localStorage.setItem("detran_public_search_count", count.toString());
  } catch {
    // ignore
  }
  return count;
}

export function incrementPublicSearchCount(): number {
  return getPublicSearchCount();
}

// ============================================================================
// LOGS DE ACESSO DO CIDADÃO PELO APLICATIVO E CONSULTA PÚBLICA
// ============================================================================

export function getAcessosCidadaoLogs(): AcessoCidadaoLog[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("detran_acessos_cidadao_logs");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  const seeded = generateSeedAcessosCidadaoLogs();
  if (typeof window !== "undefined") {
    localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(seeded));
  }
  return seeded;
}

export async function fetchAcessosCidadaoLogs(): Promise<AcessoCidadaoLog[]> {
  const local = getAcessosCidadaoLogs();
  if (!isSupabaseConfigured()) {
    return local;
  }
  try {
    const { data, error } = await supabase
      .from("acessos_cidadao")
      .select("*")
      .order("data_hora", { ascending: false })
      .limit(500);

    if (!error && data && data.length > 0) {
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
      if (typeof window !== "undefined") {
        localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(merged.slice(0, 500)));
      }
      return merged;
    }
  } catch (e) {
    console.warn("Aviso ao sincronizar acessos do cidadão do Supabase:", e);
  }
  return local;
}

export function registrarAcessoCidadaoLog(logData: Omit<AcessoCidadaoLog, "id" | "data_hora">): AcessoCidadaoLog {
  const currentLogs = getAcessosCidadaoLogs();
  const maxNum = currentLogs.reduce((max, l) => Math.max(max, l.numero || 0), currentLogs.length);
  const newLog: AcessoCidadaoLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    numero: maxNum + 1,
    data_hora: new Date().toISOString(),
    ...logData
  };
  const updated = [newLog, ...currentLogs];
  if (typeof window !== "undefined") {
    localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(updated.slice(0, 500)));
  }
  incrementPublicSearchCount();

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

export async function consultarCnhPublicaPorCpf(cpfInput: string): Promise<ResultadoConsultaPublica> {
  const cleanCpf = cpfInput.replace(/\D/g, "");
  if (!cleanCpf || cleanCpf.length < 9) {
    throw new Error("Por favor, informe um CPF válido para realizar a consulta.");
  }

  // Incrementar o contador de consultas efetuadas pelo app público
  incrementPublicSearchCount();

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
        observacao: "Processo cadastrado em memorando de envio.",
        created_at: candEncontrado.created_at || new Date().toISOString()
      };

      registrarAcessoCidadaoLog({
        cpf: cleanCpf,
        nome_titular: candEncontrado.nome,
        situacao: "Remetida",
        resultado_status: "EM_PROCESSAMENTO",
        canal: "App Android",
        dispositivo: "Navegador Web / Mobile",
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
      dispositivo: "Navegador Web / Mobile",
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
      dispositivo: "Navegador Web / Mobile",
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
      dispositivo: "Navegador Web / Mobile",
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
    dispositivo: "Navegador Web / Mobile",
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
}

// Cadastro Manual de CNH no Protocolo (Botão ➕ Cadastro Manual)
export async function createGeralManual(
  data: {
    nome: string;
    cpf: string;
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

  const nova: GeralCNH = {
    id: `cnh-manual-${Date.now()}`,
    ordem: maxOrdem,
    nome: data.nome,
    cpf: data.cpf,
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
  await saveLocalGeralCNH(nova);
  await logHistorico(nova.id, nova.ordem, nova.nome, null, nova.situacao, userId, userNome, nova.observacao, undefined, undefined, nova.cpf);
  await logAuditoria("geral", `Ordem #${nova.ordem}`, "Inclusão", userId, userNome, null, nova);
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
  await saveLocalGeralCNH(atualizado);

  await logHistorico(
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
  );

  await logAuditoria(
    "geral",
    `Ordem #${atualizado.ordem}`,
    "Entrega",
    userId,
    userNome,
    { situacao: atual.situacao },
    { situacao: "Entregue", responsavel_nome: resp.nome, data_entrega: now }
  );

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

  // Gráfico por Gaveta
  const gavetasMap: Record<string, number> = {};
  geral.forEach((g) => {
    const gav = g.gaveta && g.gaveta.trim() ? g.gaveta : "Sem Gaveta / Em Trânsito";
    gavetasMap[gav] = (gavetasMap[gav] || 0) + 1;
  });
  const chartGaveta = Object.entries(gavetasMap).map(([name, quantidade]) => ({ name, quantidade })).sort((a, b) => b.quantidade - a.quantidade);

  // Gráfico por Repartição
  const reparticoesMap: Record<string, number> = {};
  geral.forEach((g) => {
    const rep = g.reparticao && g.reparticao.trim() ? g.reparticao : "Pendente Alocação";
    reparticoesMap[rep] = (reparticoesMap[rep] || 0) + 1;
  });
  const chartReparticao = Object.entries(reparticoesMap).map(([name, quantidade]) => ({ name, quantidade })).sort((a, b) => b.quantidade - a.quantidade);

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
    chartMensal
  };
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
          // 1. Auto-upsert any responsaveis from spreadsheet to Supabase table "responsaveis"
          const respItemsToUpsert = new Map<string, string>();
          newItems.forEach(g => {
            if (g.responsavel_id) {
              respItemsToUpsert.set(g.responsavel_id, g.responsavel_nome || `Responsável ${g.responsavel_id}`);
            }
          });
          if (respItemsToUpsert.size > 0) {
            const respPayload = Array.from(respItemsToUpsert.entries()).map(([rid, rnome]) => ({
              id: rid,
              nome: rnome,
              ativo: true
            }));
            await supabase.from("responsaveis").upsert(respPayload, { onConflict: "id" });
          }

          // 2. Auto-upsert any usuarios from spreadsheet to Supabase table "usuarios"
          const userItemsToUpsert = new Map<string, string>();
          newItems.forEach(g => {
            if (g.usuario_id) {
              userItemsToUpsert.set(g.usuario_id, g.usuario_nome || `Usuário ${g.usuario_id}`);
            }
          });
          if (userItemsToUpsert.size > 0) {
            const userPayload = Array.from(userItemsToUpsert.entries()).map(([uid, unome]) => ({
              id: uid,
              nome: unome.split(" ")[0],
              nome_completo: unome,
              ativo: true
            }));
            await supabase.from("usuarios").upsert(userPayload, { onConflict: "id" });
          }

          // 3. Upsert into geral_cnhs with exact columns from spreadsheet
          const payload = newItems.map(g => ({
            id: g.id,
            ordem: g.ordem,
            nome: g.nome,
            cpf: g.cpf,
            gaveta: g.gaveta || "",
            reparticao: g.reparticao || "",
            situacao: g.situacao,
            responsavel_id: g.responsavel_id || null,
            responsavel_nome: g.responsavel_nome || null,
            data_movimento: g.data_movimento || new Date().toISOString(),
            usuario_id: g.usuario_id || null,
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
  const collections = [
    { key: "usuarios", label: "Usuários do Sistema", tableName: "usuarios" },
    { key: "responsaveis", label: "Responsáveis e CFCs", tableName: "responsaveis" },
    { key: "mapeamento", label: "Mapeamento (A-Z)", tableName: "mapeamento_localizacao" },
    { key: "memorandos", label: "Memorandos e Remessas", tableName: "memorandos" },
    { key: "candidatos", label: "Candidatos Vinculados", tableName: "candidatos" },
    { key: "geral", label: "Protocolo Geral CNHs", tableName: "geral_cnhs" },
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
      localCount = getAcessosCidadaoLogs().length;
    } else if (item.key === "orgao") {
      localCount = 1;
    } else if (item.key === "imagens") {
      localCount = 0;
    } else {
      localCount = getStoredList(item.key, []).length;
    }

    let supCount: number | null = null;
    let status: 'synced' | 'pending' | 'error' | 'not_configured' = 'not_configured';
    let lastError: string | undefined = undefined;

    if (isSupabaseConfigured()) {
      try {
        const { count, error } = await supabase
          .from(item.tableName)
          .select("*", { count: "exact", head: true });
        if (!error && count !== null) {
          supCount = count;
          status = localCount === supCount ? 'synced' : 'pending';
        } else if (error) {
          status = 'error';
          if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema')) {
            lastError = `Tabela '${item.tableName}' não criada no Supabase. Execute o script SQL no editor Supabase.`;
          } else {
            lastError = error.message;
          }
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

// Helper para buscar todos os registros de uma tabela do Supabase com paginação (evita limite de 1000 registros do PostgREST)
export async function fetchAllRowsFromSupabase<T = any>(
  tableName: string, 
  pageSize = 1000,
  orderColumn?: string,
  ascending = true
): Promise<T[]> {
  let allRows: T[] = [];
  let from = 0;
  let hasMore = true;

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
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    } else {
      hasMore = false;
    }
  }

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
  let count = 0;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    const { error } = await supabase.from(tableName).upsert(batch, { onConflict });
    if (error) {
      throw error;
    }
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

  // Pré-carregar listas locais para validar chaves estrangeiras de forma estrita
  const usuarios = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const resp = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  const mapList = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
  const mems = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS).filter((m) => !deletedMemoIds.has(m.id));
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS).filter(
    (c) => !deletedCandIds.has(c.id) && !deletedMemoIds.has(c.memorando_id)
  );
  const geral = memoryStore["geral"] && memoryStore["geral"].length > 0 ? memoryStore["geral"] : await getGeralCNHs();
  const hist = getStoredList<HistoricoMovimentacao>("historico", SEED_HISTORICO);
  const aud = getStoredList<Auditoria>("auditoria", SEED_AUDITORIA);

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
      // Auto-upsert missing responsaveis into Supabase
      const respMapToUpsert = new Map<string, string>();
      geral.forEach(g => {
        if (g.responsavel_id) {
          respMapToUpsert.set(g.responsavel_id, g.responsavel_nome || `Responsável ${g.responsavel_id}`);
        }
      });
      if (respMapToUpsert.size > 0) {
        const respBatch = Array.from(respMapToUpsert.entries()).map(([rid, rnome]) => ({
          id: rid,
          nome: rnome,
          cpf: "000.000.000-00",
          ativo: true
        }));
        await upsertInBatches("responsaveis", respBatch, 250, "id");
        respBatch.forEach(r => validRespIds.add(r.id));
      }

      // Auto-upsert missing usuarios into Supabase
      const userMapToUpsert = new Map<string, string>();
      geral.forEach(g => {
        if (g.usuario_id) {
          userMapToUpsert.set(g.usuario_id, g.usuario_nome || `Usuário ${g.usuario_id}`);
        }
      });
      if (userMapToUpsert.size > 0) {
        const userBatch = Array.from(userMapToUpsert.entries()).map(([uid, unome]) => {
          const cleanName = unome.split(" ")[0] || unome || "Operador";
          const sanitized = uid.toLowerCase().replace(/[^a-z0-9]/g, "_");
          return {
            id: uid,
            nome: cleanName,
            nome_curto: cleanName,
            nome_completo: unome,
            email: `${sanitized}@detran.local`,
            login: sanitized,
            perfil: "Operador",
            ativo: true
          };
        });
        await upsertInBatches("usuarios", userBatch, 250, "id");
        userBatch.forEach(u => validUserIds.add(u.id));
      }

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
        created_at: g.created_at || new Date().toISOString()
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
          id: h.id || `hist-${h.geral_id}-${Math.random().toString(36).substring(2, 7)}`,
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
        id: a.id || `aud-${a.registro_id}-${Math.random().toString(36).substring(2, 7)}`,
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
    { name: "acessos_cidadao", key: "acessos_cidadao", orderCol: "data_hora", asc: false }
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
          // Atualiza tanto localStorage quanto IndexedDB
          saveStoredList("geral", filteredData);
          await saveLocalGeralCNHsBulk(filteredData);
        } else if (item.key === "acessos_cidadao") {
          if (typeof window !== "undefined") {
            localStorage.setItem("detran_acessos_cidadao_logs", JSON.stringify(filteredData.slice(0, 500)));
          }
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

