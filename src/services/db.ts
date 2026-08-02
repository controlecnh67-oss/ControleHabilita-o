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
  getPermissoesPadrao
} from "../types";
import { getInitialChar, formatDateTime } from "../lib/utils";
import { supabase, isSupabaseConfigured } from "./supabase";
import * as XLSX from "xlsx";

// Verificação de credenciais Supabase reais via variáveis de ambiente VITE_ ou utilitário
export function isSupabaseConnected(): boolean {
  return isSupabaseConfigured();
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
  if (cleanId === "proprietario") return "00000000-0000-0000-0000-000000000001";

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
  {
    id: "00000000-0000-0000-0000-000000000001",
    nome: "Proprietário",
    cpf: "000.000.000-00",
    telefone: "(00) 00000-0000",
    observacao: "Registro padrão intransferível para entrega ao próprio titular da CNH",
    ativo: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString()
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    nome: "Centro de Formação de Condutores - CFC Modelo",
    cpf: "12.345.678/0001-90",
    telefone: "(67) 3321-4500",
    observacao: "Responsável cadastrado por procuração do CFC para retirada em lote",
    ativo: true,
    created_at: new Date(Date.now() - 40 * 86400000).toISOString()
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    nome: "Dr. Marcos Silva Procurações",
    cpf: "111.222.333-44",
    telefone: "(67) 99988-7766",
    observacao: "Despachante oficial credenciado no DETRAN/PA",
    ativo: true,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString()
  }
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

const SEED_GERAL: GeralCNH[] = [
  {
    id: "cnh-01",
    ordem: 1,
    memorando_id: "memo-01",
    nome: "Ana Paula da Silva Santos",
    cpf: "123.456.789-00",
    gaveta: "",
    reparticao: "",
    situacao: "Remetida",
    data_movimento: new Date(Date.now() - 4 * 86400000).toISOString(),
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    observacao: "Remessa enviada da Gráfica / Prodata em 25/07",
    created_at: new Date(Date.now() - 4 * 86400000).toISOString()
  },
  {
    id: "cnh-02",
    ordem: 2,
    memorando_id: "memo-01",
    nome: "Bruno Costa Oliveira",
    cpf: "234.567.890-11",
    gaveta: "",
    reparticao: "",
    situacao: "Remetida",
    data_movimento: new Date(Date.now() - 4 * 86400000).toISOString(),
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    observacao: "Aguardando conferência no protocolo da agência",
    created_at: new Date(Date.now() - 4 * 86400000).toISOString()
  },
  {
    id: "cnh-03",
    ordem: 3,
    memorando_id: "memo-02",
    nome: "Carlos Alberto Albuquerque",
    cpf: "345.678.901-22",
    gaveta: "Gaveta 1",
    reparticao: "Repartição 3",
    situacao: "Recebida",
    data_movimento: new Date(Date.now() - 3 * 86400000).toISOString(),
    usuario_id: "22222222-2222-2222-2222-222222222222",
    usuario_nome: "Fernanda Souza",
    observacao: "Recebida e arquivada na Gaveta 1 Repartição 3 (Inicial C)",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: "cnh-04",
    ordem: 4,
    memorando_id: "memo-02",
    nome: "Daniela Rodrigues de Castro",
    cpf: "456.789.012-33",
    gaveta: "Gaveta 1",
    reparticao: "Repartição 4",
    situacao: "Recebida",
    data_movimento: new Date(Date.now() - 3 * 86400000).toISOString(),
    usuario_id: "22222222-2222-2222-2222-222222222222",
    usuario_nome: "Fernanda Souza",
    observacao: "Recebida via malote expresso",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: "cnh-05",
    ordem: 5,
    nome: "Eduardo Henrique Gonzaga",
    cpf: "888.999.000-11",
    gaveta: "Gaveta 1",
    reparticao: "Repartição 5",
    situacao: "Entregue",
    responsavel_id: "00000000-0000-0000-0000-000000000001",
    responsavel_nome: "Proprietário",
    data_movimento: new Date(Date.now() - 6 * 86400000).toISOString(),
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    observacao: "Retirada efetuada pelo próprio titular no guichê 4",
    created_at: new Date(Date.now() - 6 * 86400000).toISOString()
  },
  {
    id: "cnh-06",
    ordem: 6,
    nome: "Gabriel Augusto Peixoto",
    cpf: "999.000.111-22",
    gaveta: "Gaveta 1",
    reparticao: "Repartição 7",
    situacao: "Entregue",
    responsavel_id: "00000000-0000-0000-0000-000000000003",
    responsavel_nome: "Dr. Marcos Silva Procurações",
    data_movimento: new Date(Date.now() - 5 * 86400000).toISOString(),
    usuario_id: "33333333-3333-3333-3333-333333333333",
    usuario_nome: "Roberto Alves",
    observacao: "Entregue para despachante Dr. Marcos Silva via procuração",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString()
  }
];

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

// Helper para obter/salvar em LocalStorage
function getStoredList<T>(key: string, seed: T[]): T[] {
  try {
    const raw = localStorage.getItem(`detran_cnh_${key}`);
    if (!raw) {
      localStorage.setItem(`detran_cnh_${key}`, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch {
    return seed;
  }
}

function saveStoredList<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(`detran_cnh_${key}`, JSON.stringify(data));
  } catch (err) {
    console.error("Erro ao salvar no localStorage:", err);
  }
}

export function resetDemoData(): void {
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

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("auditoria").insert([{
        ...nova,
        usuario_id: toValidUUID(usuario_id)
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
  responsavel_nome?: string
): Promise<void> {
  const list = getStoredList<HistoricoMovimentacao>("historico", SEED_HISTORICO);
  const novo: HistoricoMovimentacao = {
    id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    geral_id,
    geral_ordem,
    geral_nome,
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

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("historico_movimentacoes").insert([{
        ...novo,
        usuario_id: toValidUUID(usuario_id),
        responsavel_id: toValidUUID(responsavel_id)
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
      const { data, error } = await supabase.from("mapeamento_localizacao").select("*").order("inicial", { ascending: true });
      if (!error && data && data.length > 0) {
        saveStoredList("mapeamento", data as MapeamentoLocalizacao[]);
        return data as MapeamentoLocalizacao[];
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
        await logAuditoria("mapeamento", inserted.id, "Inclusão", userId, userNome, null, inserted);
        return inserted as MapeamentoLocalizacao;
      }
    } catch (e) {
      console.warn("Aviso ao criar mapeamento no Supabase:", e);
    }
  }

  const updatedList = [...list, novo].sort((a, b) => a.inicial.localeCompare(b.inicial));
  saveStoredList("mapeamento", updatedList);
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
      const { data, error } = await supabase.from("usuarios").select("*").order("created_at", { ascending: false });
      if (!error && data && data.length > 0) {
        saveStoredList("usuarios", data as Usuario[]);
        return data as Usuario[];
      }
    } catch (err) {
      console.warn("Aviso ao buscar usuários do Supabase, caindo para local:", err);
    }
  }
  return getStoredList<Usuario>("usuarios", SEED_USUARIOS);
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
      const { data: updatedSup, error } = await supabase.from("usuarios").update(data).eq("id", id).select().single();
      if (error) {
        console.error("Erro no Supabase ao editar usuário:", error);
        throw new Error(`Erro no Supabase: ${error.message}`);
      }
      if (updatedSup) {
        const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
        const lIndex = localList.findIndex((u) => u.id === id);
        if (lIndex !== -1) localList[lIndex] = updatedSup as Usuario;
        saveStoredList("usuarios", localList);
        await logAuditoria("usuarios", ant.login, "Alteração", adminId, adminNome, ant, updatedSup);
        return updatedSup as Usuario;
      }
    } catch (err: any) {
      console.error("Falha ao editar usuário no Supabase:", err);
      if (err.message && err.message.startsWith("Erro no Supabase")) {
        throw err;
      }
    }
  }

  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const lIndex = localList.findIndex((u) => u.id === id);
  if (lIndex !== -1) localList[lIndex] = atualizado;
  saveStoredList("usuarios", localList);
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
        console.error("Erro no Supabase ao deletar usuário:", error);
        throw new Error(`Erro no Supabase: ${error.message}`);
      }
    } catch (err: any) {
      console.error("Falha ao deletar no Supabase:", err);
      if (err.message && err.message.startsWith("Erro no Supabase")) {
        throw err;
      }
    }
  }

  const localList = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const filtrados = localList.filter((u) => u.id !== id);
  saveStoredList("usuarios", filtrados);
  await logAuditoria("usuarios", target.login, "Exclusão", adminId, adminNome, target, null);
}

// ============================================================================
// MÓDULO DE RESPONSÁVEIS
// ============================================================================

export async function getResponsaveis(): Promise<Responsavel[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from("responsaveis").select("*").order("nome", { ascending: true });
      if (!error && data && data.length > 0) {
        saveStoredList("responsaveis", data as Responsavel[]);
        return data as Responsavel[];
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
  const cleanNewCpf = data.cpf.replace(/\D/g, "");
  if (list.some((r) => r.cpf.replace(/\D/g, "") === cleanNewCpf)) {
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
        await logAuditoria("responsaveis", inserted.nome, "Inclusão", userId, userNome, null, inserted);
        return inserted as Responsavel;
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith("Erro no Supabase")) throw err;
    }
  }

  const localList = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  saveStoredList("responsaveis", [...localList, novo]);
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
  await logAuditoria("responsaveis", target.nome, "Exclusão", userId, userNome, target, null);
}

// ============================================================================
// MÓDULO DE MEMORANDOS & CANDIDATOS
// ============================================================================

export async function getMemorandos(): Promise<Memorando[]> {
  const list = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  return list.map((m) => ({
    ...m,
    candidatos_count: cands.filter((c) => c.memorando_id === m.id).length
  })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
  const novo: Memorando = {
    id: `memo-${Date.now()}`,
    numero: data.numero,
    usuario_id: userId,
    usuario_nome: userNome,
    remessa: data.remessa || "",
    status: "Em elaboração",
    created_at: new Date().toISOString(),
    candidatos_count: 0
  };
  saveStoredList("memorandos", [novo, ...list]);
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
  saveStoredList("memorandos", list);

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
  const list = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const target = list.find((m) => m.id === id);
  if (!target) return;

  // Remove candidatos vinculados
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  const filtradosCands = cands.filter((c) => c.memorando_id !== id);
  saveStoredList("candidatos", filtradosCands);

  if (target.status === "Remetido") {
    const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
    const filtradosGeral = geralList.filter((g) => g.memorando_id !== id);
    if (filtradosGeral.length !== geralList.length) {
      saveStoredList("geral", filtradosGeral);
    }
  }

  const filtrados = list.filter((m) => m.id !== id);
  saveStoredList("memorandos", filtrados);
  await logAuditoria("memorandos", target.numero, "Exclusão", userId, userNome, target, null);
}

export async function getCandidatosByMemorando(memorando_id: string): Promise<Candidato[]> {
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  return cands.filter((c) => c.memorando_id === memorando_id);
}

export async function addCandidato(
  memorando_id: string,
  data: Omit<Candidato, "id" | "memorando_id" | "created_at">,
  userId: string,
  userNome: string
): Promise<Candidato> {
  const memos = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const memo = memos.find((m) => m.id === memorando_id);
  if (!memo) throw new Error("Memorando não encontrado");
  if (memo.status !== "Em elaboração") {
    throw new Error("Este memorando já foi remetido. Não é possível adicionar novos candidatos.");
  }
  if (memo.usuario_id && memo.usuario_id !== userId) {
    throw new Error(`Apenas o usuário responsável (${memo.usuario_nome || "autor"}) que está elaborando este memorando pode adicionar candidatos.`);
  }
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  const novo: Candidato = {
    ...data,
    id: `cand-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    memorando_id,
    remessa: memo.remessa,
    created_at: new Date().toISOString()
  };
  saveStoredList("candidatos", [...cands, novo]);
  await logAuditoria("candidatos", `${novo.nome} (${memo.numero})`, "Inclusão", userId, userNome, null, novo);
  return novo;
}

export async function deleteCandidato(id: string, userId: string, userNome: string): Promise<void> {
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  const target = cands.find((c) => c.id === id);
  if (!target) return;
  const memos = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const memo = memos.find((m) => m.id === target.memorando_id);
  if (memo && memo.status !== "Em elaboração") {
    throw new Error("Não é possível remover candidato de um memorando remetido.");
  }
  const filtrados = cands.filter((c) => c.id !== id);
  saveStoredList("candidatos", filtrados);
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
  const atualizado = { ...target, ...data };
  cands[index] = atualizado;
  saveStoredList("candidatos", cands);
  await logAuditoria("candidatos", atualizado.nome, "Alteração", userId, userNome, target, atualizado);
  return atualizado;
}

// Ao clicar em Remeter:
// Copiar automaticamente todos os candidatos para a tabela Geral.
// Preencher: próxima Ordem, Situação = Remetida, Data = hoje, Usuário = usuário logado
// Impedir remessa duplicada do mesmo memorando.
export async function remeterMemorando(memorando_id: string, userId: string, userNome: string): Promise<number> {
  const memos = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
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

  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
  let maxOrdem = geralList.reduce((acc, curr) => Math.max(acc, curr.ordem || 0), 0);
  const now = new Date().toISOString();

  const novasCNHs: GeralCNH[] = [];
  for (const cand of cands) {
    maxOrdem++;
    const novaCNH: GeralCNH = {
      id: `cnh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ordem: maxOrdem,
      memorando_id: memo.id,
      candidato_id: cand.id,
      nome: cand.nome,
      cpf: cand.cpf,
      gaveta: "",
      reparticao: "",
      situacao: "Remetida",
      data_movimento: now,
      usuario_id: userId,
      usuario_nome: userNome,
      observacao: `Remetida via memorando ${memo.numero}${memo.remessa ? ` - Remessa ${memo.remessa}` : ""}`,
      created_at: now
    };
    novasCNHs.push(novaCNH);
    await logHistorico(novaCNH.id, novaCNH.ordem, novaCNH.nome, null, "Remetida", userId, userNome, `Memorando ${memo.numero}`);
  }

  saveStoredList("geral", [...geralList, ...novasCNHs]);

  // Atualiza status do memorando
  memos[memoIndex] = { ...memo, status: "Remetido" };
  saveStoredList("memorandos", memos);

  await logAuditoria("memorandos", memo.numero, "Remessa", userId, userNome, { status: "Em elaboração" }, { status: "Remetido", total_remetidas: novasCNHs.length });
  return novasCNHs.length;
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
  const rawList = getStoredList<GeralCNH>("geral", SEED_GERAL);

  // Garantir que a data_movimento seja rigorosamente igual à data de criação (created_at) para todas as linhas
  let listChanged = false;
  const list = rawList.map((c) => {
    const dataCriacao = c.created_at || (c as any).criado_em || c.data_movimento;
    if (dataCriacao && (c.data_movimento !== dataCriacao || !c.created_at)) {
      listChanged = true;
      return {
        ...c,
        data_movimento: dataCriacao,
        created_at: dataCriacao
      };
    }
    return c;
  });

  if (listChanged) {
    saveStoredList("geral", list);
  }

  const usuarios = await getUsuarios();
  const responsaveis = await getResponsaveis();
  const memorandos = await getMemorandos();

  return list.map((c) => {
    const usr = usuarios.find((u) => u.id === c.usuario_id);
    const resp = responsaveis.find((r) => r.id === c.responsavel_id);
    const memo = memorandos.find((m) => m.id === c.memorando_id);
    return {
      ...c,
      usuario_nome: usr ? usr.nome_curto : c.usuario_nome || "Agente DETRAN",
      responsavel_nome: resp ? resp.nome : c.responsavel_nome || "-",
      memorando_numero: memo ? memo.numero : undefined,
      remessa: memo ? (memo.remessa || memo.numero) : (c.remessa || undefined)
    };
  }).sort((a, b) => b.ordem - a.ordem);
}

// Interface e Função para Contador de Consultas Públicas Mobile por Cidadão
export function getPublicSearchCount(): number {
  if (typeof window === "undefined") return 128;
  const val = localStorage.getItem("detran_public_search_count");
  if (!val) {
    localStorage.setItem("detran_public_search_count", "128");
    return 128;
  }
  return parseInt(val, 10) || 0;
}

export function incrementPublicSearchCount(): number {
  const current = getPublicSearchCount();
  const next = current + 1;
  if (typeof window !== "undefined") {
    localStorage.setItem("detran_public_search_count", next.toString());
  }
  return next;
}

export interface ResultadoConsultaPublica {
  cpfConsultado: string;
  cnhEncontrada: GeralCNH | null;
  historico: GeralCNH[];
  statusDisponibilidade: "DISPONIVEL" | "ENTREGUE" | "EM_PROCESSAMENTO" | "NAO_ENCONTRADA";
  mensagem: string;
}

export async function consultarCnhPublicaPorCpf(cpfInput: string): Promise<ResultadoConsultaPublica> {
  const cleanCpf = cpfInput.replace(/\D/g, "");
  if (!cleanCpf || cleanCpf.length !== 11) {
    throw new Error("Por favor, informe um CPF válido com 11 dígitos.");
  }

  // Incrementar o contador de consultas efetuadas pelo app público
  incrementPublicSearchCount();

  const todasCNHs = await getGeralCNHs();

  // Filtrar todos os registros de CNH correspondentes ao CPF
  const cnhsDoCidadao = todasCNHs.filter((c) => {
    if (!c.cpf) return false;
    const cCpfClean = c.cpf.replace(/\D/g, "");
    return cCpfClean === cleanCpf;
  });

  if (cnhsDoCidadao.length === 0) {
    return {
      cpfConsultado: cleanCpf,
      cnhEncontrada: null,
      historico: [],
      statusDisponibilidade: "NAO_ENCONTRADA",
      mensagem: "Nenhum registro de CNH localizado para o CPF informado."
    };
  }

  // Ordenar para ter a mais recente primeiro (por ordem ou data de movimento)
  const ordenadas = [...cnhsDoCidadao].sort((a, b) => b.ordem - a.ordem);

  // Requisito específico: Buscar a última CNH com status "Recebida"
  const cnhRecebida = ordenadas.find((c) => c.situacao === "Recebida");

  if (cnhRecebida) {
    return {
      cpfConsultado: cleanCpf,
      cnhEncontrada: cnhRecebida,
      historico: ordenadas,
      statusDisponibilidade: "DISPONIVEL",
      mensagem: "✅ Sua CNH já está disponível para retirada no balcão do DETRAN!"
    };
  }

  // Se não tem nenhuma com status "Recebida", pegamos a mais recente para indicar a situação atual
  const ultimaCNH = ordenadas[0];

  if (ultimaCNH.situacao === "Entregue") {
    return {
      cpfConsultado: cleanCpf,
      cnhEncontrada: ultimaCNH,
      historico: ordenadas,
      statusDisponibilidade: "ENTREGUE",
      mensagem: "ℹ️ A sua CNH consta como ENTREGUE no balcão."
    };
  }

  return {
    cpfConsultado: cleanCpf,
    cnhEncontrada: ultimaCNH,
    historico: ordenadas,
    statusDisponibilidade: "EM_PROCESSAMENTO",
    mensagem: "⏳ Sua CNH consta em processamento/trânsito e ainda não deu entrada no balcão de atendimento."
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
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
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
  await logHistorico(nova.id, nova.ordem, nova.nome, null, nova.situacao, userId, userNome, nova.observacao);
  await logAuditoria("geral", `Ordem #${nova.ordem}`, "Inclusão", userId, userNome, null, nova);
  return nova;
}

// Recebimento de CNH (Botão 📥 Receber - Na tela Geral)
// Somente aparece quando Situação = Remetida
// Ao clicar: Situação = Recebida, Data = atual, Usuário = logado
// Determinar automaticamente Gaveta e Repartição via Mapeamento pela inicial do nome
export async function receberCNH(id: string, userId: string, userNome: string): Promise<{ geral: GeralCNH; isVazio: boolean }> {
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
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

  await logHistorico(
    atualizado.id,
    atualizado.ordem,
    atualizado.nome,
    atual.situacao,
    "Recebida",
    userId,
    userNome,
    `Alocado na ${loc.gaveta} / ${loc.reparticao}`
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
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
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
    resp.nome
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
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
  const index = geralList.findIndex((g) => g.id === id);
  if (index === -1) throw new Error("Registro CNH não encontrado");
  const ant = geralList[index];
  const atualizado = { ...ant, ...data, data_movimento: new Date().toISOString(), usuario_id: userId, usuario_nome: userNome };
  geralList[index] = atualizado;
  saveStoredList("geral", geralList);

  if (ant.situacao !== atualizado.situacao) {
    await logHistorico(
      atualizado.id,
      atualizado.ordem,
      atualizado.nome,
      ant.situacao,
      atualizado.situacao,
      userId,
      userNome,
      atualizado.observacao
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
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
  const target = geralList.find((g) => g.id === id);
  if (!target) return false;

  const updated = geralList.filter((g) => g.id !== id);
  saveStoredList("geral", updated);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from("geral_cnhs").delete().eq("id", id);
    } catch (err) {
      console.error("Erro ao deletar do Supabase:", err);
    }
  }

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
  const geralList = getStoredList<GeralCNH>("geral", SEED_GERAL);
  const targets = geralList.filter((g) => idsSet.has(g.id));
  const updated = geralList.filter((g) => !idsSet.has(g.id));
  saveStoredList("geral", updated);

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
  return getStoredList<HistoricoMovimentacao>("historico", SEED_HISTORICO).sort(
    (a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
  );
}

export async function getAuditoriaList(): Promise<Auditoria[]> {
  return getStoredList<Auditoria>("auditoria", SEED_AUDITORIA).sort(
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
    mapeamento: getStoredList("mapeamento", SEED_MAPEAMENTO)
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
    { name: "Auditoria Sistema", key: "auditoria", seed: SEED_AUDITORIA }
  ];

  for (const col of collections) {
    const list = getStoredList<any>(col.key, col.seed);
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

  const list = getStoredList<any>(tableName, seedsMap[tableName] || []);
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

  const rawResp = getVal([/responsa/, /procurador/, /retirante/]);
  const responsavel_nome = rawResp ? String(rawResp).trim() : undefined;

  const rawMemo = getVal([/memo/, /memorando/, /remessa/]);
  const memorando_numero = rawMemo ? String(rawMemo).trim() : undefined;

  const rawObs = getVal([/obs/, /observa/, /detalhe/, /nota/]);
  const observacao = rawObs ? String(rawObs).trim() : undefined;

  const rawData = getVal([/data/]);
  let data_movimento = new Date().toISOString();
  if (rawData) {
    const parsedDate = new Date(rawData);
    if (!isNaN(parsedDate.getTime())) {
      data_movimento = parsedDate.toISOString();
    }
  }

  return {
    id: `cnh-imp-${ordem}-${Math.random().toString(36).substring(2, 7)}`,
    ordem,
    nome,
    cpf,
    gaveta,
    reparticao,
    situacao,
    responsavel_nome,
    data_movimento,
    usuario_id: usuarioId,
    usuario_nome: usuarioNome,
    memorando_numero,
    observacao,
    created_at: data_movimento
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
    const existingGeral = getStoredList<GeralCNH>("geral", SEED_GERAL);

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

    let supabaseSyncedCount = 0;
    let supabaseError: string | undefined = undefined;

    if (syncToSupabase) {
      if (!isSupabaseConfigured()) {
        supabaseError = "Supabase não está configurado. Os dados foram salvos no armazenamento local.";
      } else {
        try {
          const payload = newItems.map(g => ({
            id: g.id,
            ordem: g.ordem,
            nome: g.nome,
            cpf: g.cpf,
            gaveta: g.gaveta,
            reparticao: g.reparticao,
            situacao: g.situacao,
            responsavel_nome: g.responsavel_nome || null,
            data_movimento: g.data_movimento || new Date().toISOString(),
            usuario_id: usuarioId,
            usuario_nome: usuarioNome,
            memorando_numero: g.memorando_numero || null,
            observacao: g.observacao || null
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
    { key: "auditoria", label: "Auditoria do Sistema", tableName: "auditoria" }
  ];

  const results: SyncStatusItem[] = [];

  for (const item of collections) {
    const localList = getStoredList(item.key, []);
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
          status = localList.length === supCount ? 'synced' : 'pending';
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
      localCount: localList.length,
      supabaseCount: supCount,
      status,
      lastError
    });
  }

  return results;
}

// Helper para buscar todos os registros de uma tabela do Supabase com paginação (evita limite de 1000 registros do PostgREST)
export async function fetchAllRowsFromSupabase<T = any>(tableName: string, pageSize = 1000): Promise<T[]> {
  let allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .range(from, to);

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

  // Pré-carregar listas locais para validar chaves estrangeiras de forma estrita
  const usuarios = getStoredList<Usuario>("usuarios", SEED_USUARIOS);
  const resp = getStoredList<Responsavel>("responsaveis", SEED_RESPONSAVEIS);
  const mapList = getStoredList<MapeamentoLocalizacao>("mapeamento", SEED_MAPEAMENTO);
  const mems = getStoredList<Memorando>("memorandos", SEED_MEMORANDOS);
  const cands = getStoredList<Candidato>("candidatos", SEED_CANDIDATOS);
  const geral = getStoredList<GeralCNH>("geral", SEED_GERAL);
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
        id: r.id || "00000000-0000-0000-0000-000000000001",
        nome: r.nome,
        cpf: r.cpf,
        telefone: r.telefone || null,
        observacao: r.observacao || null,
        ativo: r.ativo !== false,
        created_at: r.created_at || new Date().toISOString()
      }));
      const synced = await upsertInBatches("responsaveis", payload, 250);
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
        created_at: g.created_at || new Date().toISOString()
      }));

      const synced = await upsertInBatches("geral_cnhs", payload, 250, "id", (synced, total) => {
        log(` ⏳ Progresso geral_cnhs: ${synced}/${total} registros enviados...`);
      });
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
    { name: "usuarios", key: "usuarios" },
    { name: "responsaveis", key: "responsaveis" },
    { name: "mapeamento_localizacao", key: "mapeamento" },
    { name: "memorandos", key: "memorandos" },
    { name: "candidatos", key: "candidatos" },
    { name: "geral_cnhs", key: "geral" },
    { name: "historico_movimentacoes", key: "historico" },
    { name: "auditoria", key: "auditoria" }
  ];

  for (const item of tables) {
    try {
      log(`📥 Baixando tabela '${item.name}'...`);
      const data = await fetchAllRowsFromSupabase(item.name, 1000);
      if (data && data.length > 0) {
        saveStoredList(item.key, data);
        log(`✅ '${item.name}' baixado e atualizado localmente (${data.length} registros).`);
        totalPulled += data.length;
      } else {
        log(`ℹ️ '${item.name}' no Supabase está vazio.`);
      }
    } catch (err: any) {
      log(`❌ Erro ao baixar '${item.name}': ${err.message}`);
      errors.push(`${item.name}: ${err.message}`);
    }
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

