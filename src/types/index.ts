import { z } from "zod";

export type PerfilUsuario = "Administrador" | "Supervisor" | "Operador" | "Consulta";
export type PerfilAcesso = PerfilUsuario;

export type NavTab = 
  | "dashboard" 
  | "geral" 
  | "candidatos"
  | "memorandos" 
  | "declaracao"
  | "acessos_cidadao"
  | "relatorios"
  | "responsaveis" 
  | "mapeamento" 
  | "historico" 
  | "auditoria" 
  | "usuarios"
  | "orgao"
  | "backup"
  | "monitoramento";

export function isTabAllowedForProfile(
  tab: NavTab, 
  perfil?: PerfilUsuario, 
  permissoes?: string[]
): boolean {
  if (!perfil) return false;

  // Administrador tem acesso irrestrito a todas as abas
  if (perfil === "Administrador") return true;

  // Se o servidor possui lista de permissões granulares explícita
  if (permissoes && Array.isArray(permissoes) && permissoes.length > 0) {
    if (tab === "dashboard") {
      return permissoes.includes("dashboard:visualizar");
    }
    if (tab === "geral") {
      return (
        permissoes.includes("geral:visualizar") ||
        permissoes.includes("cnh:receber") ||
        permissoes.includes("cnh:entregar") ||
        permissoes.includes("cnh:editar")
      );
    }
    if (tab === "candidatos") {
      return (
        permissoes.includes("candidatos:visualizar") ||
        permissoes.includes("geral:visualizar") ||
        permissoes.includes("memorandos:criar")
      );
    }
    if (tab === "memorandos") {
      return (
        permissoes.includes("memorandos:criar") ||
        permissoes.includes("memorandos:remeter")
      );
    }
    if (tab === "declaracao") {
      return (
        permissoes.includes("declaracao:gerenciar") ||
        permissoes.includes("declaracao:visualizar") ||
        permissoes.includes("cnh:entregar")
      );
    }
    if (tab === "acessos_cidadao") {
      return permissoes.includes("acessos_cidadao:visualizar");
    }
    if (tab === "relatorios") {
      return permissoes.includes("relatorios:visualizar");
    }
    if (tab === "responsaveis") {
      return permissoes.includes("responsaveis:gerenciar");
    }
    if (tab === "mapeamento") {
      return permissoes.includes("mapeamento:gerenciar");
    }
    if (tab === "historico") {
      return permissoes.includes("historico:visualizar");
    }
    if (tab === "auditoria") {
      return permissoes.includes("auditoria:visualizar");
    }
    if (tab === "usuarios") {
      return permissoes.includes("usuarios:gerenciar");
    }
    if (tab === "orgao") {
      return permissoes.includes("orgao:gerenciar");
    }
    if (tab === "backup") {
      return permissoes.includes("backup:gerenciar");
    }
    if (tab === "monitoramento") {
      return permissoes.includes("backup:gerenciar") || permissoes.includes("auditoria:visualizar");
    }
    return false;
  }

  // Fallback padrão se não houver array de permissões customizadas
  switch (perfil) {
    case "Supervisor":
      return ["dashboard", "geral", "candidatos", "memorandos", "declaracao", "acessos_cidadao", "relatorios", "responsaveis", "mapeamento", "historico", "auditoria", "orgao"].includes(tab);

    case "Operador":
      return ["dashboard", "geral", "candidatos", "memorandos", "declaracao", "acessos_cidadao", "relatorios", "responsaveis", "mapeamento"].includes(tab);

    case "Consulta":
      return ["dashboard", "geral", "candidatos", "declaracao", "acessos_cidadao", "relatorios", "historico", "auditoria"].includes(tab);

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
  isTab?: boolean;
}

export const PERMISSOES_SISTEMA: PermissaoItem[] = [
  // 1. Dashboard
  { 
    id: "dashboard:visualizar", 
    label: "Aba Dashboard (Painel)", 
    category: "Painel & Visão Geral", 
    description: "Permite acessar métricas, contadores de CNHs e gráficos operacionais",
    isTab: true
  },
  
  // 2. Protocolo Geral (CNHs)
  { 
    id: "geral:visualizar", 
    label: "Aba Protocolo Geral (CNHs)", 
    category: "Protocolo de CNHs", 
    description: "Permite visualizar, pesquisar e filtrar as CNHs do protocolo geral",
    isTab: true
  },
  { 
    id: "cnh:receber", 
    label: "Receber CNHs e Alocar Gavetas", 
    category: "Protocolo de CNHs", 
    description: "Permite dar entrada no protocolo, definir gaveta e repartição física" 
  },
  { 
    id: "cnh:entregar", 
    label: "Realizar Entrega de CNHs", 
    category: "Protocolo de CNHs", 
    description: "Permite registrar a entrega ao titular ou procurador credenciado" 
  },
  { 
    id: "cnh:editar", 
    label: "Editar / Excluir CNHs", 
    category: "Protocolo de CNHs", 
    description: "Permite modificar dados manuais ou remover registros de CNH do sistema" 
  },

  // 3. Memorandos e Candidatos
  { 
    id: "candidatos:visualizar", 
    label: "Aba Candidatos - Visualizar e Filtrar", 
    category: "Remessas e Memorandos", 
    description: "Permite acessar a aba Candidatos com métricas, busca avançada e tabela personalizada",
    isTab: true
  },
  { 
    id: "memorandos:criar", 
    label: "Aba Memorandos - Criar Remessas", 
    category: "Remessas e Memorandos", 
    description: "Permite acessar a aba e criar memorandos com lista de candidatos",
    isTab: true
  },
  { 
    id: "memorandos:remeter", 
    label: "Remeter e Finalizar Memorandos", 
    category: "Remessas e Memorandos", 
    description: "Permite enviar o memorando para o protocolo e converter candidatos em CNHs" 
  },

  // 4. Declaração de Retirada de CNH por Procurador
  { 
    id: "declaracao:gerenciar", 
    label: "Aba Declaração de Retirada", 
    category: "Atendimento & Cidadão", 
    description: "Permite emitir declarações oficiais de retirada de CNH por procuradores e gerar PDF",
    isTab: true
  },

  // 4. Consulta Cidadão (App)
  { 
    id: "acessos_cidadao:visualizar", 
    label: "Aba Consulta Cidadão (App)", 
    category: "Atendimento & Cidadão", 
    description: "Permite visualizar os acessos, consultas públicas e logs dos cidadãos",
    isTab: true
  },

  // 5. Relatórios Setoriais
  { 
    id: "relatorios:visualizar", 
    label: "Aba Relatórios Setoriais", 
    category: "Relatórios & Estatísticas", 
    description: "Permite gerar e exportar relatórios consolidados em PDF e planilhas",
    isTab: true
  },

  // 6. Responsáveis
  { 
    id: "responsaveis:gerenciar", 
    label: "Aba Responsáveis", 
    category: "Cadastros & Configurações", 
    description: "Permite cadastrar, editar e gerenciar responsáveis (Titular, Despachante e Procurador)",
    isTab: true
  },

  // 7. Mapeamento (A-Z)
  { 
    id: "mapeamento:gerenciar", 
    label: "Aba Mapeamento de Gavetas (A-Z)", 
    category: "Cadastros & Configurações", 
    description: "Permite configurar e alterar as gavetas padrão para cada inicial de nome",
    isTab: true
  },

  // 8. Histórico de Movimento
  { 
    id: "historico:visualizar", 
    label: "Aba Histórico de Movimento", 
    category: "Auditoria & Rastreabilidade", 
    description: "Permite consultar a trilha inalterável de movimentações de CNHs",
    isTab: true
  },

  // 9. Auditoria do Sistema
  { 
    id: "auditoria:visualizar", 
    label: "Aba Auditoria do Sistema", 
    category: "Auditoria & Rastreabilidade", 
    description: "Permite consultar logs de segurança, endereços IP e ações dos operadores",
    isTab: true
  },

  // 10. Gerenciar Usuários
  { 
    id: "usuarios:gerenciar", 
    label: "Aba Gerenciar Usuários", 
    category: "Administração do Sistema", 
    description: "Permite cadastrar servidores, redefinir senhas e atribuir permissões",
    isTab: true
  },

  // 11. Configuração do Órgão
  { 
    id: "orgao:gerenciar", 
    label: "Aba Configuração do Órgão", 
    category: "Administração do Sistema", 
    description: "Permite editar cabeçalhos oficiais, logotipo, timbres e dados da unidade",
    isTab: true
  },

  // 12. Backup e Sincronização
  { 
    id: "backup:gerenciar", 
    label: "Aba Backup e Sincronização", 
    category: "Administração do Sistema", 
    description: "Permite realizar backups, restaurar dados e sincronizar com nuvem/Supabase",
    isTab: true
  }
];

export function getPermissoesPadrao(perfil: PerfilUsuario): string[] {
  switch (perfil) {
    case "Administrador":
      return PERMISSOES_SISTEMA.map(p => p.id);
    case "Supervisor":
      return [
        "dashboard:visualizar",
        "geral:visualizar", "cnh:receber", "cnh:entregar", "cnh:editar",
        "memorandos:criar", "memorandos:remeter",
        "declaracao:gerenciar",
        "acessos_cidadao:visualizar",
        "relatorios:visualizar",
        "responsaveis:gerenciar",
        "mapeamento:gerenciar",
        "historico:visualizar",
        "auditoria:visualizar",
        "orgao:gerenciar"
      ];
    case "Operador":
      return [
        "dashboard:visualizar",
        "geral:visualizar", "cnh:receber", "cnh:entregar",
        "memorandos:criar", "memorandos:remeter",
        "declaracao:gerenciar",
        "acessos_cidadao:visualizar",
        "relatorios:visualizar",
        "responsaveis:gerenciar",
        "mapeamento:gerenciar"
      ];
    case "Consulta":
      return [
        "dashboard:visualizar",
        "geral:visualizar",
        "acessos_cidadao:visualizar",
        "relatorios:visualizar",
        "historico:visualizar",
        "auditoria:visualizar"
      ];
    default:
      return [];
  }
}

export type TipoResponsavel = "Titular" | "Despachante" | "Procurador";

export interface Responsavel {
  id: string;
  nome: string;
  tipo?: TipoResponsavel;
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
  remetido_em?: string;
  candidatos_count?: number;
}

export interface Candidato {
  id: string;
  memorando_id: string;
  numero?: string;
  nome: string;
  cpf: string;
  pa?: string; // Número identificador único de CNH (9 dígitos numéricos)
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
  pa?: string; // Número identificador único de CNH (9 dígitos numéricos)
  nome: string;
  cpf: string;
  telefone?: string;
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
  notificado_whatsapp?: boolean;
  notificado_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface HistoricoMovimentacao {
  id: string;
  geral_id: string;
  geral_ordem?: number;
  geral_nome?: string;
  geral_cpf?: string;
  situacao_anterior?: SituacaoGeral | null;
  situacao_nova: SituacaoGeral;
  responsavel_id?: string;
  responsavel_nome?: string;
  usuario_id: string;
  usuario_nome?: string;
  observacao?: string;
  data_hora: string;
}

export type AcaoAuditoria = "Inclusão" | "Alteração" | "Exclusão" | "Login" | "Logout" | "Remessa" | "Recebimento" | "Entrega" | "Reabertura";

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
  nome: z.string().min(2, "Nome ou Razão Social é obrigatório"),
  tipo: z.enum(["Titular", "Despachante", "Procurador"]).default("Despachante"),
  cpf: z.string()
    .min(1, "CPF ou CNPJ é obrigatório por padrão")
    .refine((val) => {
      const d = val.replace(/\D/g, "");
      return d.length === 11 || d.length === 14;
    }, "Informe um CPF válido (11 dígitos) ou CNPJ válido (14 dígitos)"),
  telefone: z.string()
    .min(1, "Telefone de contato é obrigatório por padrão")
    .refine((val) => {
      const d = val.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 11;
    }, "Informe um telefone válido com DDD (10 ou 11 dígitos)"),
  registro: z.string().optional(),
  observacao: z.string().optional(),
  ativo: z.boolean().default(true),
});

export const MemorandoSchema = z.object({
  numero: z.string().min(1, "Número do memorando obrigatório (ex: MEMO-2026/045)"),
  remessa: z.string().optional(),
  status: z.enum(["Em elaboração", "Remetido"]).default("Em elaboração"),
  created_at: z.string().optional(),
  remetido_em: z.string().optional().nullable(),
});

export const CandidatoSchema = z.object({
  numero: z.string().optional(),
  nome: z.string().min(3, "Nome do candidato obrigatório"),
  cpf: z.string().min(14, "CPF incompleto").max(14, "CPF inválido"),
  pa: z.string().min(9, "O PA deve ter exatamente 9 dígitos").max(9, "O PA deve ter exatamente 9 dígitos").regex(/^\d{9}$/, "O PA deve conter exatamente 9 dígitos numéricos"),
  telefone: z.string().optional(),
  remessa: z.string().optional(),
});

export const CadastroManualCNHSchema = z.object({
  nome: z.string().min(3, "Nome completo do titular da CNH"),
  cpf: z.string().min(14, "CPF incompleto").max(14, "CPF inválido"),
  pa: z.string().optional(),
  situacao: z.enum(["Remetida", "Recebida", "Pendente", "Entregue"]).default("Recebida"),
  observacao: z.string().optional(),
});

export const EntregaCNHSchema = z.object({
  tipo_retirante: z.enum(["proprietario", "outro"]),
  responsavel_id: z.string().optional(),
  observacao: z.string().optional(),
});

export interface AcessoCidadaoLog {
  id: string;
  numero?: number;
  data_hora: string;
  cpf: string;
  nome_titular?: string;
  situacao: "Recebida" | "Remetida" | "Entregue" | "Pendente" | "Não Encontrada";
  resultado_status: "DISPONIVEL" | "ENTREGUE" | "EM_PROCESSAMENTO" | "NAO_ENCONTRADA";
  canal: "App Android" | "App iOS" | "PWA Web Mobile" | "QR Code Totem" | "Web Browser";
  dispositivo?: string;
  cidade_origem?: string;
  ip_mascarado?: string;
}

// Interfaces para o Mapa Visual de Gavetas e Repartições Físicas (4 Gavetas x 8 Repartições)
export interface MapaReparticaoItem {
  numero: number;
  nome: string;
  total: number;
  iniciais: string[];
  percentualGaveta: number;
  percentualTotal: number;
}

export interface MapaGavetaItem {
  numero: number;
  nome: string;
  total: number;
  percentualTotal: number;
  reparticoes: MapaReparticaoItem[];
}

export interface MapaArquivoFisico {
  totalFisico: number;
  gavetas: MapaGavetaItem[];
  outrasNaoAlocadas: number;
  reparticoesComCNH: number;
  totalCompartimentos: number; // 32
  gavetaMaiorVolume: { numero: number; nome: string; total: number } | null;
}

// Interfaces para Declaração de Retirada de CNH por Procurador / Responsável
export interface DeclaracaoItemCondutor {
  item: number;
  ordem?: number | string;
  cnh_id?: string;
  nome: string;
  cpf: string;
  pa?: string;
  situacao?: string;
  gaveta?: string;
  reparticao?: string;
  data_movimento?: string;
}

export interface Declaracao {
  id: string;
  numero: string;             // ex: "0109/2026"
  ano: number;                // ex: 2026
  data_emissao: string;       // "2026-09-14"
  procurador_id?: string;     // id do Responsavel cadastrado
  procurador_nome: string;    // ex: "REGINALDO DE SOUZA SANTOS"
  procurador_cpf: string;     // ex: "36956201291"
  procurador_telefone?: string; // ex: "93992912928"
  procurador_endereco?: string; // ex: "Campo Verde, MT, 78840-000, Brasil"
  texto_declaracao: string;   // Texto legal padrão
  condutores: DeclaracaoItemCondutor[];
  cidade: string;             // ex: "Itaituba"
  uf: string;                 // ex: "PA"
  gerente_nome?: string;      // ex: "Zedequias Carlos de Melo"
  gerente_cargo?: string;     // ex: "Gerente DETRAN"
  gerente_unidade?: string;   // ex: "ITAITUBA-PA"
  gerente_portaria?: string;  // ex: "Portaria 1.083/2025 - CCG"
  observacao?: string;
  usuario_id: string;
  usuario_nome: string;
  created_at: string;
  updated_at?: string;
}

// Interfaces para Controle de Lotes (Sub-aba do Protocolo Geral)
export interface Lote {
  id: string;
  numero: number;                    // Lote (número)
  data_recebimento: string;          // Data de Recebimento (YYYY-MM-DD)
  documentos_impressos: number;      // Documentos Impressos (número)
  pdf_nome?: string;                 // Nome do arquivo PDF anexado
  pdf_tamanho?: number;              // Tamanho em bytes do PDF
  pdf_url?: string;                  // Base64 Data URL ou URL remota
  observacao?: string;               // Observação sobre o lote
  usuario_id?: string;               // ID do operador
  usuario_nome?: string;             // Nome do operador
  created_at: string;
  updated_at?: string;
}

export interface LoteInput {
  numero: number;
  data_recebimento: string;
  documentos_impressos: number;
  pdf_nome?: string;
  pdf_tamanho?: number;
  pdf_url?: string;
  observacao?: string;
}

