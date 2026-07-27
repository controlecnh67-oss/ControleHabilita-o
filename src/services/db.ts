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

// Verificação de credenciais Supabase reais via variáveis de ambiente VITE_
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL;
const SUPABASE_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConnected = Boolean(SUPABASE_URL && SUPABASE_KEY);

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
    data_movimento: new Date(Date.now() - 2 * 86400000).toISOString(),
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
    data_movimento: new Date(Date.now() - 2 * 86400000).toISOString(),
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
    data_movimento: new Date(Date.now() - 1 * 86400000).toISOString(),
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
    data_movimento: new Date(Date.now() - 3600000).toISOString(),
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
}

// ============================================================================
// MÓDULO DE MAPEAMENTO DE LOCALIZAÇÃO (Gaveta & Repartição)
// ============================================================================

export async function getMapeamentos(): Promise<MapeamentoLocalizacao[]> {
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
  const novo: Usuario = {
    ...data,
    id: `usr-${Date.now()}`,
    senha: data.senha || "detran@123",
    permissoes: data.permissoes || getPermissoesPadrao(data.perfil),
    created_at: new Date().toISOString(),
    ativo: true
  };
  saveStoredList("usuarios", [...list, novo]);
  await logAuditoria("usuarios", novo.login, "Inclusão", adminId, adminNome, null, { nome: novo.nome, perfil: novo.perfil });
  return novo;
}

export async function updateUsuario(id: string, data: Partial<Usuario>, adminId: string, adminNome: string): Promise<Usuario> {
  const list = await getUsuarios();
  const index = list.findIndex((u) => u.id === id);
  if (index === -1) throw new Error("Usuário não encontrado");
  const ant = list[index];
  const atualizado = { ...ant, ...data };
  list[index] = atualizado;
  saveStoredList("usuarios", list);
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
  const filtrados = list.filter((u) => u.id !== id);
  saveStoredList("usuarios", filtrados);
  await logAuditoria("usuarios", target.login, "Exclusão", adminId, adminNome, target, null);
}

// ============================================================================
// MÓDULO DE RESPONSÁVEIS
// ============================================================================

export async function getResponsaveis(): Promise<Responsavel[]> {
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
  const novo: Responsavel = {
    ...data,
    id: `resp-${Date.now()}`,
    created_at: new Date().toISOString()
  };
  saveStoredList("responsaveis", [...list, novo]);
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
  list[index] = atualizado;
  saveStoredList("responsaveis", list);
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
  const filtrados = list.filter((r) => r.id !== id);
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

export async function getGeralCNHs(): Promise<GeralCNH[]> {
  const list = getStoredList<GeralCNH>("geral", SEED_GERAL);
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
      usuarios: usuarios.length
    },
    chartSituacao,
    chartGaveta,
    chartReparticao,
    chartMensal
  };
}
