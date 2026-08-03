-- ============================================================================
-- SCRIPT COMPLETO E CORRIGIDO PARA O EDITOR DE SQL DO SUPABASE
-- 1. Garante a tabela 'responsaveis' com colunas validas (sem a coluna 'tipo')
-- 2. Popula/Atualiza a tabela 'responsaveis' para evitar erro de Chave Estrangeira (23503)
-- 3. Transfere os IDs de 'responsavel_nome' para 'responsavel_id' em 'geral_cnhs'
-- 4. Traz os nomes atualizados da tabela 'responsaveis' para 'responsavel_nome'
-- ============================================================================

-- 1. Criar a tabela 'responsaveis' caso nao exista
CREATE TABLE IF NOT EXISTS responsaveis (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Inserir/Atualizar todos os Responsáveis para evitar Foreign Key Violations
INSERT INTO responsaveis (id, nome, cpf, telefone, observacao, ativo)
VALUES
  ('e2335b1e', 'PROPRIETÁRIO(A)', '', '', 'Registro padrão para entrega ao próprio titular da CNH', true),
  ('d2b9952a', 'FRANCINEY DESPACHANTE', '', '', '', true),
  ('f4f347f1', 'CLEONAR DESPCHANTE', '', '', '', true),
  ('39de40af', 'BRIZOLA AUTO ESCOLA', '', '', '', true),
  ('384b2d8c', 'DARLAN DESPACHANTE', '', '', '', true),
  ('60c09b00', 'MARLISSON DESPACHANTE', '', '', '', true),
  ('33a90e11', 'NATIELE', '', '', '', true),
  ('71396f81', 'JOÃO PULO R MARQUES', '', '', '', true),
  ('97d3ad5e', 'AUTO ESCOLA SANTANA', '', '', '', true),
  ('fa41cde8', 'ARY DESPACHANTE', '', '', '', true),
  ('402ee83c', 'BAMBAM DESPACHANTE', '', '', '', true),
  ('b9bfae57', 'MARIA EUNICE DESPACHANTE', '', '', '', true),
  ('1f3d321e', 'MOISES DESPACAHNTE', '', '', '', true),
  ('5c4f215f', 'GILMAR DESPACHANTE', '', '', '', true),
  ('772dfcfd', 'NEILA DESPACHANTE', '', '', '', true),
  ('56899764', 'KAIO LOHANDES', '', '', '', true),
  ('bb95cdf5', 'WALTER DESPACHANTE', '', '', '', true),
  ('1b5ecd73', 'ODON DESPACHANTE', '', '', '', true),
  ('ee175176', 'TULA DESPACHANTE', '', '', '', true),
  ('fa1481d9', 'ESPOSA', '', '', '', true),
  ('527d4682', 'ELIONAI DESPACHANTE', '67079733200', '', '', true),
  ('c1058daa', 'ANTONIO WELITON RODRIGUES', '51548496200', 'XXXXXX', '', true),
  ('efd23bd9', 'NICE DESPACHANTE', '5555555', '555555', '', true),
  ('7345b45d', 'GUSTAVO HENRIQUE SENA', '', '', '', true),
  ('85415cb3', 'SOCORRO DESPACHANTE', '', '', '', true),
  ('2995c099', 'ADAO DA ROSA NETO', '', '', '', true),
  ('6fb3467c', 'EDCARLOS LOLO', '', '', '', true),
  ('68b5d3ce', 'FERNANDO DESPACHANTE', '', '', '', true),
  ('a84dc2b7', 'JULIMAR DESPACHANTE', '', '', '', true),
  ('6da4b403', 'ED CARLOS BRAGA DOS SANTOS', '57950040220', '', '', true),
  ('b7d9a27f', 'ANA CRISTINA CIRINO', '', '', '', true),
  ('9a185a18', 'JACKSON DESPACHANTE', '', '', '', true),
  ('54a9108e', 'DIEGO DESPACHANTE', '', '', '', true),
  ('9387e9c9', 'ADENIL DESPACHANTE', '', '', '', true),
  ('f785d235', 'LIDIANE FARIAS DA SILVA', '64639363249', '92991058775', '', true),
  ('458fc6d7', 'NICE DESPACHANTE', '', '', '', true),
  ('221601a6', 'AMOS OLIVEIRA DOS ANJOS', '', '', '', true),
  ('0db81080', 'REGIS', '', '', '', true),
  ('40fda483', 'leonardo', '', '', '', true),
  ('83147b46', 'LUCIVAN DESPACHANTE', '', '', '', true),
  ('cc2a44d9', 'MANOEL DESPACHANTE', '', '', '', true),
  ('9967d842', 'RONALDO DESPACHANTE', '', '', '', true),
  ('8e90b2b1', 'ROSA DOS SANTOS DA SILVA', '', '', '', true),
  ('b1597c81', 'PIERRE DESPACHANTE', '', '', '', true),
  ('f8b761c2', 'LEONARDO F MORAIS', '04456813229', '', '', true),
  ('a08afa6e', 'RAMON STIVENSON SILVA BANDEIRA', '', '', '', true),
  ('bd4309ca', 'NAIZA KM 70', '', '', '', true),
  ('461abe27', 'CARLOS ROBERTO CORDEIRO DE SOUZA', '', '', '', true),
  ('1852a327', 'ALESSANDRO DESPACHANTE', '', '', '', true),
  ('42121784', 'VERA LUCIA GONCALVES TEIXEIRA', '', '', '', true),
  ('868e33c3', 'WANDERLEIA DE SENA', '', '', '', true),
  ('b8c3fb7f', 'GERALDO BIESEK', '', '', '', true),
  ('24553e1f', 'JEAN COMTRI', '', '', '', true),
  ('541e38dc', 'ANGELO SILVA DO NASCIMENTO NETO', '', '', '', true),
  ('7b906878', 'VALDIR AG DETRAN', '', '', '', true),
  ('dfc67cdf', 'IVANILDE S SOUZA', '', '', '', true),
  ('f2e68384', 'EVANILDO', '30862111234', '93991522309', '', true),
  ('773b2b5e', 'DESPACHANTE BEZERRA', '04546542133', '9341286985', '', true),
  ('1f8d56b0', 'HELIO JUNIOR FERREIRA DA SILVA', '58896740215', '93991611255', '', true),
  ('bd613528', 'VAN DESPACHANTE', '64753808220', '93991523181', '', true),
  ('bedd6d31', 'MARIA DA SILVA SOUSA', '88281221372', '91999019284', '', true),
  ('bbfd243b', 'elisangela costa de souza', '40261735268', '93991230100', '', true),
  ('c600348a', 'ALDAMIRO DE SOUSA', '00581706269', '93991634132', '', true),
  ('2bace6d9', 'jamilson despachante', '98075829204', '93991380811', '', true),
  ('5054bcf2', 'flavio da conceicao silva', '99015560153', '9398420915091', '', true),
  ('bd2db3cb', 'BRUNO SA', '90619277220', '222222222', '', true),
  ('a6638725', 'NEILA DESPACHANTE', '64752186268', '93991841911', '', true),
  ('b9ace4bd', 'ANDREIA SOUZA DA CRUZ', '01421637243', '93991023212', '', true),
  ('8724bcf3', 'NEY PEREIRA DE SOUSA JUNIOR', '01268469289', '93991546577', '', true),
  ('853abea7', 'RENILDO MARTINS SANTOS', '28418838841', '93991395729', '', true),
  ('78a4531a', 'MARINTIA DUTRA OLIVEIRA', '02818939267', '979911720559', '', true),
  ('bf84ea0a', 'lazaro josevaldo dias moraes', '03255827264', '93991403019', '', true),
  ('77b81905', 'VALMIRA DE BRITO PASSOS BRASIL', '31107613272', '93991416828', '', true),
  ('4a72c6fa', 'maria de fatima barros morais', '63494388253', '93992292653', '', true),
  ('74346934', 'ELIS MATIAS DE SOUZA', '59588209404', '9399181343381', '', true),
  ('79d70e03', 'bruno cordeiro de moraes', '03911236298', '93991848502', '', true),
  ('2a61a311', 'silvio vieira da silva', '03019656257', '939911712267', '', true),
  ('75da89d6', 'EMANUEL AUTO ESCOLA', '4561.515613', '93991386008', '', true)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  cpf = EXCLUDED.cpf,
  telefone = EXCLUDED.telefone,
  observacao = EXCLUDED.observacao;

-- 3. Transferir o ID que estava na coluna responsavel_nome para responsavel_id
UPDATE geral_cnhs
SET responsavel_id = LOWER(responsavel_nome)
WHERE (responsavel_nome ~* '^[0-9a-f]{8}$')
  AND (responsavel_id IS NULL OR responsavel_id = '' OR responsavel_id = responsavel_nome);

-- 4. Trazer o nome atualizado da tabela 'responsaveis' para a coluna 'responsavel_nome'
UPDATE geral_cnhs g
SET responsavel_nome = r.nome
FROM responsaveis r
WHERE LOWER(g.responsavel_id) = LOWER(r.id);

-- 5. Verificar resultado
SELECT id, ordem, nome, responsavel_id, responsavel_nome FROM geral_cnhs WHERE responsavel_id IS NOT NULL LIMIT 10;