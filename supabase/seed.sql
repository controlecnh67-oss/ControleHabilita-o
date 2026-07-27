-- ==============================================================================
-- SEED DATA - SISTEMA DE CONTROLE DE CNH - DETRAN
-- Dados iniciais para execução e testes do sistema
-- ==============================================================================

-- 1. RESPONSÁVEIS - Inserção obrigatória do registro padrão "Proprietário"
INSERT INTO public.responsaveis (id, nome, cpf, telefone, observacao, ativo)
VALUES 
('00000000-0000-0000-0000-000000000001', 'Proprietário', '000.000.000-00', '(00) 00000-0000', 'Registro padrão intransferível para entrega ao próprio titular da CNH', true),
('00000000-0000-0000-0000-000000000002', 'Centro de Formação de Condutores - CFC Modelo', '12.345.678/0001-90', '(67) 3321-4500', 'Responsável cadastrado por procuração do CFC para retirada em lote', true),
('00000000-0000-0000-0000-000000000003', 'Dr. Marcos Silva Procurações', '111.222.333-44', '(67) 99988-7766', 'Despachante oficial credenciado no DETRAN/MS', true)
ON CONFLICT (cpf) DO NOTHING;

-- 2. USUÁRIOS INICIAIS (4 Perfis de Teste para avaliação)
INSERT INTO public.usuarios (id, nome, nome_curto, fone, email, funcao, setor, login, perfil, ativo)
VALUES 
('11111111-1111-1111-1111-111111111111', 'Carlos Eduardo Mendes (Administrador)', 'Carlos Eduardo', '(67) 99111-2222', 'admin@detran.ms.gov.br', 'Chefe de Setor de Protocolo', 'Protocolo Geral', 'admin', 'Administrador', true),
('22222222-2222-2222-2222-222222222222', 'Fernanda Souza Vasconcelos (Supervisora)', 'Fernanda Souza', '(67) 99222-3333', 'supervisor@detran.ms.gov.br', 'Supervisora de Operações', 'Atendimento CNH', 'supervisor', 'Supervisor', true),
('33333333-3333-3333-3333-333333333333', 'Roberto Alves Pereira (Operador)', 'Roberto Alves', '(67) 99333-4444', 'operador@detran.ms.gov.br', 'Agente de Trânsito / Protocolista', 'Guichê de Entrega', 'operador', 'Operador', true),
('44444444-4444-4444-4444-444444444444', 'Juliana Lima Rocha (Consulta)', 'Juliana Lima', '(67) 99444-5555', 'consulta@detran.ms.gov.br', 'Auditora de Controle Interno', 'Auditoria Geral', 'consulta', 'Consulta', true)
ON CONFLICT (email) DO NOTHING;

-- 3. MAPEAMENTO DE LOCALIZAÇÃO (Gavetas e Repartições A-Z)
INSERT INTO public.mapeamento_localizacao (inicial, gaveta, reparticao, ativo)
VALUES 
('A', 'Gaveta 1', 'Repartição 1', true),
('B', 'Gaveta 1', 'Repartição 2', true),
('C', 'Gaveta 1', 'Repartição 3', true),
('D', 'Gaveta 1', 'Repartição 4', true),
('E', 'Gaveta 1', 'Repartição 5', true),
('F', 'Gaveta 1', 'Repartição 6', true),
('G', 'Gaveta 1', 'Repartição 7', true),
('H', 'Gaveta 1', 'Repartição 8', true),
('I', 'Gaveta 3', 'Repartição 1', true),
('J', 'Gaveta 3', 'Repartição 2', true),
('K', 'Gaveta 3', 'Repartição 3', true),
('L', 'Gaveta 3', 'Repartição 4', true),
('M', 'Gaveta 3', 'Repartição 6', true),
('N', 'Gaveta 3', 'Repartição 7', true),
('O', 'Gaveta 3', 'Repartição 8', true),
('P', 'Gaveta 4', 'Repartição 1', true),
('Q', 'Gaveta 4', 'Repartição 2', true),
('R', 'Gaveta 4', 'Repartição 3', true),
('S', 'Gaveta 4', 'Repartição 4', true),
('T', 'Gaveta 4', 'Repartição 5', true),
('V', 'Gaveta 4', 'Repartição 6', true),
('Y', 'Gaveta 4', 'Repartição 7', true),
('Z', 'Gaveta 4', 'Repartição 7', true),
('W', 'Gaveta 4', 'Repartição 6', true)
ON CONFLICT (inicial) DO UPDATE SET 
    gaveta = EXCLUDED.gaveta,
    reparticao = EXCLUDED.reparticao;

-- 4. MEMORANDOS DE EXEMPLO
INSERT INTO public.memorandos (id, numero, usuario_id, remessa, status)
VALUES 
('a1a1a1a1-1111-1111-1111-111111111111', 'MEMO-2026/042', '33333333-3333-3333-3333-333333333333', 'REM-001/ABRIL', 'Remetido'),
('b2b2b2b2-2222-2222-2222-222222222222', 'MEMO-2026/043', '22222222-2222-2222-2222-222222222222', 'REM-002/ABRIL', 'Recebido'),
('c3c3c3c3-3333-3333-3333-333333333333', 'MEMO-2026/044', '33333333-3333-3333-3333-333333333333', 'REM-003/ABRIL', 'Em elaboração');

-- 5. CANDIDATOS NO MEMORANDO EM ELABORAÇÃO
INSERT INTO public.candidatos (id, memorando_id, numero, nome, cpf, telefone, remessa)
VALUES 
('d4d4d4d4-4444-4444-4444-444444444444', 'c3c3c3c3-3333-3333-3333-333333333333', '101', 'Luciana Borges Ferreira', '555.666.777-88', '(67) 98111-2233', 'REM-003/ABRIL'),
('e5e5e5e5-5555-5555-5555-555555555555', 'c3c3c3c3-3333-3333-3333-333333333333', '102', 'Marcos Vinicius Santos', '666.777.888-99', '(67) 98222-3344', 'REM-003/ABRIL'),
('f6f6f6f6-6666-6666-6666-666666666666', 'c3c3c3c3-3333-3333-3333-333333333333', '103', 'Helena Maria de Souza', '777.888.999-00', '(67) 98333-4455', 'REM-003/ABRIL');

-- 6. TABELA GERAL (CNHs EM MOVIMENTAÇÃO NO DETRAN)
INSERT INTO public.geral (id, ordem, memorando_id, nome, cpf, gaveta, reparticao, situacao, responsavel_id, usuario_id, observacao)
VALUES 
('g7g7g7g7-7777-7777-7777-777777777777', 1, 'a1a1a1a1-1111-1111-1111-111111111111', 'Ana Paula da Silva Santos', '123.456.789-00', '', '', 'Remetida', NULL, '33333333-3333-3333-3333-333333333333', 'Remessa enviada da Gráfica / Prodata em 25/07'),
('h8h8h8h8-8888-8888-8888-888888888888', 2, 'a1a1a1a1-1111-1111-1111-111111111111', 'Bruno Costa Oliveira', '234.567.890-11', '', '', 'Remetida', NULL, '33333333-3333-3333-3333-333333333333', 'Aguardando conferência no protocolo da agência'),
('i9i9i9i9-9999-9999-9999-999999999999', 3, 'b2b2b2b2-2222-2222-2222-222222222222', 'Carlos Alberto Albuquerque', '345.678.901-22', 'Gaveta 1', 'Repartição 3', 'Recebida', NULL, '22222222-2222-2222-2222-222222222222', 'Recebida e arquivada na Gaveta 1 Repartição 3 (Inicial C)'),
('j0j0j0j0-0000-0000-0000-000000000000', 4, 'b2b2b2b2-2222-2222-2222-222222222222', 'Daniela Rodrigues de Castro', '456.789.012-33', 'Gaveta 1', 'Repartição 4', 'Recebida', NULL, '22222222-2222-2222-2222-222222222222', 'Recebida via malote expresso'),
('k1k1k1k1-1111-1111-1111-111111111111', 5, NULL, 'Eduardo Henrique Gonzaga', '888.999.000-11', 'Gaveta 1', 'Repartição 5', 'Entregue', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Retirada efetuada pelo próprio titular no guichê 4'),
('l2l2l2l2-2222-2222-2222-222222222222', 6, NULL, 'Gabriel Augusto Peixoto', '999.000.111-22', 'Gaveta 1', 'Repartição 7', 'Entregue', '00000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Entregue para despachante Dr. Marcos Silva via procuração');
