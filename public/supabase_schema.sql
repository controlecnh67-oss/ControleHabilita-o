-- ============================================================================
-- SCRIPT DE INTEGRAÇÃO E SEED - SUPABASE (POSTGRESQL)
-- Sistema de Controle de Fluxo de CNHs - DETRAN/PA
-- ============================================================================
-- Instruções:
-- 1. Acesse o painel do seu projeto no Supabase (https://supabase.com).
-- 2. No menu lateral esquerdo, clique em "SQL Editor".
-- 3. Clique em "New query" e cole todo o conteúdo deste arquivo.
-- 4. Clique em "Run" para criar as tabelas, políticas RLS e popular os dados iniciais.
-- ============================================================================

-- 1. REMOÇÃO DE TABELAS ANTIGAS (SE EXISTIREM) PARA GARANTIR INSTALAÇÃO LIMPA
DROP TABLE IF EXISTS auditoria CASCADE;
DROP TABLE IF EXISTS historico_movimentacoes CASCADE;
DROP TABLE IF EXISTS geral_cnhs CASCADE;
DROP TABLE IF EXISTS candidatos CASCADE;
DROP TABLE IF EXISTS memorandos CASCADE;
DROP TABLE IF EXISTS mapeamento_localizacao CASCADE;
DROP TABLE IF EXISTS responsaveis CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- 2. CRIAÇÃO DAS TABELAS

-- Tabela de Usuários / Operadores do Sistema
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nome_curto TEXT NOT NULL,
  fone TEXT,
  email TEXT UNIQUE NOT NULL,
  funcao TEXT,
  setor TEXT DEFAULT 'Protocolo',
  login TEXT UNIQUE NOT NULL,
  senha TEXT DEFAULT 'detran@123',
  permissoes JSONB DEFAULT '["memorandos:criar", "memorandos:remeter", "cnh:receber", "cnh:entregar", "cnh:editar", "mapeamento:gerenciar", "responsaveis:gerenciar", "usuarios:gerenciar", "auditoria:visualizar"]'::jsonb,
  perfil TEXT NOT NULL CHECK (perfil IN ('Administrador', 'Supervisor', 'Operador', 'Consulta')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tabela de Responsáveis / Procuradores / Titulares
CREATE TABLE responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  telefone TEXT,
  observacao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tabela de Mapeamento de Localização (Letra Inicial -> Gaveta e Repartição)
CREATE TABLE mapeamento_localizacao (
  id TEXT PRIMARY KEY,
  inicial TEXT UNIQUE NOT NULL,
  gaveta TEXT NOT NULL,
  reparticao TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true
);

-- Tabela de Memorandos e Remessas
CREATE TABLE memorandos (
  id TEXT PRIMARY KEY,
  numero TEXT UNIQUE NOT NULL,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  remessa TEXT,
  status TEXT NOT NULL DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração', 'Remetido')),
  candidatos_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tabela de Candidatos vinculados aos Memorandos
CREATE TABLE candidatos (
  id TEXT PRIMARY KEY,
  memorando_id TEXT REFERENCES memorandos(id) ON DELETE CASCADE,
  numero TEXT,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  telefone TEXT,
  remessa TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tabela Geral de CNHs (Protocolo e Gavetas)
CREATE TABLE geral_cnhs (
  id TEXT PRIMARY KEY,
  ordem INTEGER NOT NULL,
  memorando_id TEXT REFERENCES memorandos(id) ON DELETE SET NULL,
  candidato_id TEXT REFERENCES candidatos(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  gaveta TEXT,
  reparticao TEXT,
  situacao TEXT NOT NULL DEFAULT 'Recebida' CHECK (situacao IN ('Remetida', 'Recebida', 'Pendente', 'Entregue')),
  responsavel_id UUID REFERENCES responsaveis(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  data_movimento TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  memorando_numero TEXT,
  remessa TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tabela de Histórico de Movimentações (Trilha de Auditoria das CNHs)
CREATE TABLE historico_movimentacoes (
  id TEXT PRIMARY KEY,
  geral_id TEXT REFERENCES geral_cnhs(id) ON DELETE CASCADE,
  geral_ordem INTEGER,
  geral_nome TEXT,
  situacao_anterior TEXT CHECK (situacao_anterior IN ('Remetida', 'Recebida', 'Pendente', 'Entregue') OR situacao_anterior IS NULL),
  situacao_nova TEXT NOT NULL CHECK (situacao_nova IN ('Remetida', 'Recebida', 'Pendente', 'Entregue')),
  responsavel_id UUID REFERENCES responsaveis(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  observacao TEXT,
  data_hora TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tabela de Registros de Auditoria do Sistema
CREATE TABLE auditoria (
  id TEXT PRIMARY KEY,
  tabela TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  data_hora TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  ip TEXT,
  valores_anteriores JSONB,
  valores_novos JSONB
);

-- ============================================================================
-- 3. CONFIGURAÇÃO DE SEGURANÇA POR LINHA (ROW LEVEL SECURITY - RLS)
-- ============================================================================
-- Habilitamos o RLS e criamos políticas de acesso público para permitir o uso imediato pela aplicação frontend

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapeamento_localizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE memorandos ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE geral_cnhs ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso total em usuarios" ON usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total em responsaveis" ON responsaveis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total em mapeamento_localizacao" ON mapeamento_localizacao FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total em memorandos" ON memorandos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total em candidatos" ON candidatos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total em geral_cnhs" ON geral_cnhs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total em historico_movimentacoes" ON historico_movimentacoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total em auditoria" ON auditoria FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. INSERÇÃO DOS DADOS INICIAIS (POPULAÇÃO / SEED DATA)
-- ============================================================================

-- Inserir Usuários
INSERT INTO usuarios (id, nome, nome_curto, fone, email, funcao, setor, login, perfil, created_at, ativo) VALUES
('11111111-1111-1111-1111-111111111111', 'Carlos Eduardo Mendes (Administrador)', 'Carlos Eduardo', '(67) 99111-2222', 'admin@detran.pa.gov.br', 'Chefe de Setor de Protocolo', 'Protocolo Geral', 'admin', 'Administrador', NOW() - INTERVAL '30 days', true),
('22222222-2222-2222-2222-222222222222', 'Fernanda Souza Vasconcelos (Supervisora)', 'Fernanda Souza', '(67) 99222-3333', 'supervisor@detran.pa.gov.br', 'Supervisora de Operações', 'Atendimento CNH', 'supervisor', 'Supervisor', NOW() - INTERVAL '25 days', true),
('33333333-3333-3333-3333-333333333333', 'Roberto Alves Pereira (Operador)', 'Roberto Alves', '(67) 99333-4444', 'operador@detran.pa.gov.br', 'Agente de Trânsito / Protocolista', 'Guichê de Entrega', 'operador', 'Operador', NOW() - INTERVAL '15 days', true),
('44444444-4444-4444-4444-444444444444', 'Juliana Lima Rocha (Consulta)', 'Juliana Lima', '(67) 99444-5555', 'consulta@detran.pa.gov.br', 'Auditora de Controle Interno', 'Auditoria Geral', 'consulta', 'Consulta', NOW() - INTERVAL '10 days', true);

-- Inserir Responsáveis / Procuradores
INSERT INTO responsaveis (id, nome, cpf, telefone, observacao, ativo, created_at) VALUES
('00000000-0000-0000-0000-000000000001', 'Proprietário', '000.000.000-00', '(00) 00000-0000', 'Registro padrão intransferível para entrega ao próprio titular da CNH', true, NOW() - INTERVAL '60 days'),
('00000000-0000-0000-0000-000000000002', 'Centro de Formação de Condutores - CFC Modelo', '12.345.678/0001-90', '(67) 3321-4500', 'Responsável cadastrado por procuração do CFC para retirada em lote', true, NOW() - INTERVAL '40 days'),
('00000000-0000-0000-0000-000000000003', 'Dr. Marcos Silva Procurações', '111.222.333-44', '(67) 99988-7766', 'Despachante oficial credenciado no DETRAN/PA', true, NOW() - INTERVAL '20 days');

-- Inserir Mapeamento de Localização (A a Z)
INSERT INTO mapeamento_localizacao (id, inicial, gaveta, reparticao, ativo) VALUES
('m-a', 'A', 'Gaveta 1', 'Repartição 1', true),
('m-b', 'B', 'Gaveta 1', 'Repartição 2', true),
('m-c', 'C', 'Gaveta 1', 'Repartição 3', true),
('m-d', 'D', 'Gaveta 1', 'Repartição 4', true),
('m-e', 'E', 'Gaveta 1', 'Repartição 5', true),
('m-f', 'F', 'Gaveta 1', 'Repartição 6', true),
('m-g', 'G', 'Gaveta 1', 'Repartição 7', true),
('m-h', 'H', 'Gaveta 1', 'Repartição 8', true),
('m-i', 'I', 'Gaveta 3', 'Repartição 1', true),
('m-j', 'J', 'Gaveta 3', 'Repartição 2', true),
('m-k', 'K', 'Gaveta 3', 'Repartição 3', true),
('m-l', 'L', 'Gaveta 3', 'Repartição 4', true),
('m-m', 'M', 'Gaveta 3', 'Repartição 6', true),
('m-n', 'N', 'Gaveta 3', 'Repartição 7', true),
('m-o', 'O', 'Gaveta 3', 'Repartição 8', true),
('m-p', 'P', 'Gaveta 4', 'Repartição 1', true),
('m-q', 'Q', 'Gaveta 4', 'Repartição 2', true),
('m-r', 'R', 'Gaveta 4', 'Repartição 3', true),
('m-s', 'S', 'Gaveta 4', 'Repartição 4', true),
('m-t', 'T', 'Gaveta 4', 'Repartição 5', true),
('m-v', 'V', 'Gaveta 4', 'Repartição 6', true),
('m-y', 'Y', 'Gaveta 4', 'Repartição 7', true),
('m-z', 'Z', 'Gaveta 4', 'Repartição 7', true),
('m-w', 'W', 'Gaveta 4', 'Repartição 6', true);

-- Inserir Memorandos
INSERT INTO memorandos (id, numero, usuario_id, usuario_nome, remessa, status, created_at, candidatos_count) VALUES
('memo-01', 'MEMO-2026/042', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', 'REM-001/ABRIL', 'Remetido', NOW() - INTERVAL '5 days', 2),
('memo-02', 'MEMO-2026/043', '22222222-2222-2222-2222-222222222222', 'Fernanda Souza', 'REM-002/ABRIL', 'Remetido', NOW() - INTERVAL '3 days', 2),
('memo-03', 'MEMO-2026/044', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', 'REM-003/ABRIL', 'Em elaboração', NOW() - INTERVAL '1 day', 3);

-- Inserir Candidatos
INSERT INTO candidatos (id, memorando_id, numero, nome, cpf, telefone, remessa, created_at) VALUES
('cand-01', 'memo-03', '01', 'Luciana Borges Ferreira', '555.666.777-88', '(67) 98111-2233', 'REM-003/ABRIL', NOW()),
('cand-02', 'memo-03', '02', 'Marcos Vinicius Santos', '666.777.888-99', '(67) 98222-3344', 'REM-003/ABRIL', NOW()),
('cand-03', 'memo-03', '03', 'Helena Maria de Souza', '777.888.999-00', '(67) 98333-4455', 'REM-003/ABRIL', NOW());

-- Inserir Tela Geral de CNHs
INSERT INTO geral_cnhs (id, ordem, memorando_id, candidato_id, nome, cpf, gaveta, reparticao, situacao, responsavel_id, responsavel_nome, data_movimento, usuario_id, usuario_nome, memorando_numero, remessa, observacao, created_at) VALUES
('cnh-01', 1, 'memo-01', NULL, 'Ana Paula da Silva Santos', '123.456.789-00', '', '', 'Remetida', NULL, NULL, NOW() - INTERVAL '4 days', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', 'MEMO-2026/042', 'REM-001/ABRIL', 'Remessa enviada da Gráfica / Prodata em 25/07', NOW() - INTERVAL '4 days'),
('cnh-02', 2, 'memo-01', NULL, 'Bruno Costa Oliveira', '234.567.890-11', '', '', 'Remetida', NULL, NULL, NOW() - INTERVAL '4 days', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', 'MEMO-2026/042', 'REM-001/ABRIL', 'Aguardando conferência no protocolo da agência', NOW() - INTERVAL '4 days'),
('cnh-03', 3, 'memo-02', NULL, 'Carlos Alberto Albuquerque', '345.678.901-22', 'Gaveta 1', 'Repartição 3', 'Recebida', NULL, NULL, NOW() - INTERVAL '2 days', '22222222-2222-2222-2222-222222222222', 'Fernanda Souza', 'MEMO-2026/043', 'REM-002/ABRIL', 'Recebida e arquivada na Gaveta 1 Repartição 3 (Inicial C)', NOW() - INTERVAL '3 days'),
('cnh-04', 4, 'memo-02', NULL, 'Daniela Rodrigues de Castro', '456.789.012-33', 'Gaveta 1', 'Repartição 4', 'Recebida', NULL, NULL, NOW() - INTERVAL '2 days', '22222222-2222-2222-2222-222222222222', 'Fernanda Souza', 'MEMO-2026/043', 'REM-002/ABRIL', 'Recebida via malote expresso', NOW() - INTERVAL '3 days'),
('cnh-05', 5, NULL, NULL, 'Eduardo Henrique Gonzaga', '888.999.000-11', 'Gaveta 1', 'Repartição 5', 'Entregue', '00000000-0000-0000-0000-000000000001', 'Proprietário', NOW() - INTERVAL '1 day', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', NULL, NULL, 'Retirada efetuada pelo próprio titular no guichê 4', NOW() - INTERVAL '6 days'),
('cnh-06', 6, NULL, NULL, 'Gabriel Augusto Peixoto', '999.000.111-22', 'Gaveta 1', 'Repartição 7', 'Entregue', '00000000-0000-0000-0000-000000000003', 'Dr. Marcos Silva Procurações', NOW() - INTERVAL '1 hour', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', NULL, NULL, 'Entregue para despachante Dr. Marcos Silva via procuração', NOW() - INTERVAL '5 days');

-- Inserir Histórico de Movimentações
INSERT INTO historico_movimentacoes (id, geral_id, geral_ordem, geral_nome, situacao_anterior, situacao_nova, responsavel_id, responsavel_nome, usuario_id, usuario_nome, observacao, data_hora) VALUES
('hist-01', 'cnh-03', 3, 'Carlos Alberto Albuquerque', 'Remetida', 'Recebida', NULL, NULL, '22222222-2222-2222-2222-222222222222', 'Fernanda Souza', 'CNH Recebida na Agência e alocada em Gaveta 1 Repartição 3', NOW() - INTERVAL '2 days'),
('hist-02', 'cnh-05', 5, 'Eduardo Henrique Gonzaga', 'Recebida', 'Entregue', '00000000-0000-0000-0000-000000000001', 'Proprietário', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', 'Retirada efetuada pelo titular no guichê', NOW() - INTERVAL '1 day');

-- Inserir Registros de Auditoria
INSERT INTO auditoria (id, tabela, registro_id, acao, usuario_id, usuario_nome, data_hora, ip, valores_anteriores, valores_novos) VALUES
('aud-01', 'memorandos', 'MEMO-2026/042', 'Remessa', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', NOW() - INTERVAL '5 days', '10.0.1.15', NULL, '{"status": "Remetido", "total_cnhs": 2}'::jsonb),
('aud-02', 'geral', 'Ordem #3', 'Recebimento', '22222222-2222-2222-2222-222222222222', 'Fernanda Souza', NOW() - INTERVAL '2 days', '10.0.1.20', NULL, '{"situacao": "Recebida", "gaveta": "Gaveta 1", "reparticao": "Repartição 3"}'::jsonb),
('aud-03', 'geral', 'Ordem #5', 'Entrega', '33333333-3333-3333-3333-333333333333', 'Roberto Alves', NOW() - INTERVAL '1 day', '10.0.1.15', NULL, '{"situacao": "Entregue", "responsavel": "Proprietário"}'::jsonb);

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
