import { z } from "zod";

export type PerfilUsuario = "Administrador" | "Supervisor" | "Operador" | "Consulta";
export type PerfilAcesso = PerfilUsuario;

export type NavTab = 
  | "dashboard" 
  | "geral" 
  | "memorandos" 
  | "responsaveis" 
  | "mapeamento" 
  | "historico" 
  | "auditoria" 
  | "usuarios"
  | "backup";

export function isTabAllowedForProfile(
  tab: NavTab, 
  perfil?: PerfilUsuario, 
  permissoes?: string[]
): boolean {
  if (!perfil) return false;

  if (perfil === "Administrador") return true;

  // Se a aba for "memorandos" (Memorandos e Remessas): libera se tiver a permissão de criar ou remeter memorandos
  if (tab === "memorandos") {
    if (permissoes && Array.isArray(permissoes)) {
      if (permissoes.includes("memorandos:criar") || permissoes.includes("memorandos:remeter")) {
        return true;
      }
    }
    const defPerms = getPermissoesPadrao(perfil);
    if (defPerms.includes("memorandos:criar") || defPerms.includes("memorandos:remeter")) {
      return true;
    }
    return ["Administrador", "Supervisor", "Operador"].includes(perfil);
  }

  // Se permissões forem fornecidas explicitamente, verifica autorizações para as outras abas
  if (permissoes && Array.isArray(permissoes) && permissoes.length > 0) {
    if (tab === "geral" && (permissoes.includes("cnh:receber") || permissoes.includes("cnh:entregar") || permissoes.includes("cnh:editar"))) {
      return true;
    }
    if (tab === "mapeamento" && permissoes.includes("mapeamento:gerenciar")) {
      return true;
    }
    if (tab === "responsaveis" && permissoes.includes("responsaveis:gerenciar")) {
      return true;
    }
    if (tab === "usuarios" && permissoes.includes("usuarios:gerenciar")) {
      return true;
    }
    if (tab === "auditoria" && permissoes.includes("auditoria:visualizar")) {
      return true;
    }
    if (tab === "dashboard" || tab === "historico") {
      return true;
    }
    if (tab === "backup") {
      return perfil === "Administrador";
    }
  }

  switch (perfil) {
    case "Supervisor":
      return ["dashboard", "geral", "memorandos", "responsaveis", "mapeamento", "historico", "auditoria"].includes(tab);

    case "Operador":
      return ["dashboard", "geral", "memorandos", "responsaveis", "mapeamento"].includes(tab);

    case "Consulta":
      return ["dashboard", "geral", "historico", "auditoria"].includes(tab);

    default:
      return false;
  }
}

export interface Usuario {
  id: string;
  nome: string;
  nome_completo?: string;
  nome_curto: string;
  cpf?: string;
  fone?: string;
  email: string;
  funcao?: string;
  setor?: string;
  login: string;
  senha?: string; // Somente referência Auth ou temporária
  permissoes?: string[]; // Permissões granulares
  perfil: PerfilUsuario;
  created_at: string;
  ativo?: boolean;
}

export interface PermissaoItem {
  id: string;
  label: string;
  category: string;
  description: string;
}

export const PERMISSOES_SISTEMA: PermissaoItem[] = [
  { id: "memorandos:criar", label: "Elaborar Memorandos e Remessas", category: "Remessas e Memorandos", description: "Permite criar novos memorandos, adicionar ou remover candidatos da remessa" },
  { id: "memorandos:remeter", label: "Remeter e Finalizar Memorandos", category: "Remessas e Memorandos", description: "Permite enviar o memorando para o protocolo e converter candidatos em CNHs" },
  { id: "cnh:receber", label: "Receber CNHs e Alocar Gavetas", category: "Controle de CNHs", description: "Permite dar entrada no protocolo, definir gaveta e repartição física" },
  { id: "cnh:entregar", label: "Realizar Entrega de CNHs", category: "Controle de CNHs", description: "Permite registrar a entrega ao titular ou procurador credenciado" },
  { id: "cnh:editar", label: "Editar / Excluir CNHs", category: "Controle de CNHs", description: "Permite modificar dados manuais ou remover registros de CNH do sistema" },
  { id: "mapeamento:gerenciar", label: "Mapeamento de Gavetas (A a Z)", category: "Configurações", description: "Permite configurar e alterar as gavetas padrão para cada inicial de nome" },
  { id: "responsaveis:gerenciar", label: "Cadastrar Responsáveis e Procuradores", category: "Configurações", description: "Permite adicionar, editar e desativar despachantes e CFCs" },
  { id: "usuarios:gerenciar", label: "Gerenciar Servidores e Credenciais", category: "Administração", description: "Permite cadastrar usuários, redefinir senhas temporárias e atribuir permissões" },
  { id: "auditoria:visualizar", label: "Acessar Trilha de Auditoria Geral", category: "Administração", description: "Permite consultar logs de segurança, acessos, endereços IP e histórico de ações" }
];

export function getPermissoesPadrao(perfil: PerfilUsuario): string[] {
  switch (perfil) {
    case "Administrador":
      return PERMISSOES_SISTEMA.map(p => p.id);
    case "Supervisor":
      return [
        "memorandos:criar", "memorandos:remeter",
        "cnh:receber", "cnh:entregar", "cnh:editar",
        "mapeamento:gerenciar", "responsaveis:gerenciar",
        "auditoria:visualizar"
      ];
    case "Operador":
      return [
        "memorandos:criar", "memorandos:remeter",
        "cnh:receber", "cnh:entregar"
      ];
    case "Consulta":
      return ["auditoria:visualizar"];
    default:
      return [];
  }
}

export interface Responsavel {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  registro?: string;
  observacao?: string;
  ativo: boolean;
  created_at: string;
}

export type StatusMemorando = "Em elaboração" | "Remetido";

export interface Memorando {
  id: string;
  numero: string;
  usuario_id: string;
  usuario_nome?: string;
  remessa?: string;
  status: StatusMemorando;
  created_at: string;
  candidatos_count?: number;
}

export interface Candidato {
  id: string;
  memorando_id: string;
  numero?: string;
  nome: string;
  cpf: string;
  telefone?: string;
  remessa?: string;
  created_at: string;
}

export type SituacaoGeral = "Remetida" | "Recebida" | "Pendente" | "Entregue";

export interface GeralCNH {
  id: string;
  ordem: number;
  memorando_id?: string;
  candidato_id?: string;
  nome: string;
  cpf: string;
  gaveta: string;
  reparticao: string;
  situacao: SituacaoGeral;
  responsavel_id?: string;
  responsavel_nome?: string;
  data_movimento: string;
  usuario_id: string;
  usuario_nome?: string;
  memorando_numero?: string;
  remessa?: string;
  observacao?: string;
  created_at: string;
  updated_at?: string;
}

export interface HistoricoMovimentacao {
  id: string;
  geral_id: string;
  geral_ordem?: number;
  geral_nome?: string;
  situacao_anterior?: SituacaoGeral | null;
  situacao_nova: SituacaoGeral;
  responsavel_id?: string;
  responsavel_nome?: string;
  usuario_id: string;
  usuario_nome?: string;
  observacao?: string;
  data_hora: string;
}

export type AcaoAuditoria = "Inclusão" | "Alteração" | "Exclusão" | "Login" | "Logout" | "Remessa" | "Recebimento" | "Entrega";

export interface Auditoria {
  id: string;
  tabela: string;
  registro_id: string;
  acao: AcaoAuditoria;
  usuario_id: string;
  usuario_nome?: string;
  data_hora: string;
  ip: string;
  valores_anteriores?: Record<string, any> | null;
  valores_novos?: Record<string, any> | null;
}
export type RegistroAuditoria = Auditoria;

export interface MapeamentoLocalizacao {
  id: string;
  inicial: string;
  gaveta: string;
  reparticao: string;
  ativo: boolean;
}

// Zod Schemas para Formulários

export const UsuarioSchema = z.object({
  nome: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  nome_curto: z.string().min(2, "Nome curto é obrigatório"),
  email: z.string().email("E-mail inválido"),
  fone: z.string().optional(),
  funcao: z.string().optional(),
  setor: z.string().default("Protocolo"),
  login: z.string().min(3, "Login deve ter pelo menos 3 caracteres"),
  senha: z.string().optional(),
  permissoes: z.array(z.string()).optional(),
  perfil: z.enum(["Administrador", "Supervisor", "Operador", "Consulta"]),
});

export const ResponsavelSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  registro: z.string().optional(),
  observacao: z.string().optional(),
  ativo: z.boolean().default(true),
});

export const MemorandoSchema = z.object({
  numero: z.string().min(1, "Número do memorando obrigatório (ex: MEMO-2026/045)"),
  remessa: z.string().optional(),
  status: z.enum(["Em elaboração", "Remetido"]).default("Em elaboração"),
});

export const CandidatoSchema = z.object({
  numero: z.string().optional(),
  nome: z.string().min(3, "Nome do candidato obrigatório"),
  cpf: z.string().min(14, "CPF incompleto").max(14, "CPF inválido"),
  telefone: z.string().optional(),
  remessa: z.string().optional(),
});

export const CadastroManualCNHSchema = z.object({
  nome: z.string().min(3, "Nome completo do titular da CNH"),
  cpf: z.string().min(14, "CPF incompleto").max(14, "CPF inválido"),
  situacao: z.enum(["Remetida", "Recebida", "Pendente", "Entregue"]).default("Recebida"),
  observacao: z.string().optional(),
});

export const EntregaCNHSchema = z.object({
  tipo_retirante: z.enum(["proprietario", "outro"]),
  responsavel_id: z.string().optional(),
  observacao: z.string().optional(),
});
