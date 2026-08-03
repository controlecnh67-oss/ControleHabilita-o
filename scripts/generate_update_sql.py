import json, os

def sql_str(val):
    if val is None or val == "":
        return "NULL"
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

with open("src/data/cnhSeedData.json", "r", encoding="utf-8") as f:
    cnhs = json.load(f)

sql_lines = [
    "-- ============================================================================",
    "-- SCRIPT SQL PARA O EDITOR DO SUPABASE",
    "-- Atualiza as colunas data_movimento / data_movimentacao, usuario_id e usuario_nome",
    "-- conforme a tabela de usuarios / operadores do sistema e os registros das CNHs",
    "-- ============================================================================",
    "",
    "-- 1. Garante que a tabela 'usuarios' tenha os cadastros e a coluna 'nome_completo'",
    "CREATE TABLE IF NOT EXISTS usuarios (",
    "  id TEXT PRIMARY KEY,",
    "  nome TEXT NOT NULL,",
    "  nome_completo TEXT,",
    "  ativo BOOLEAN DEFAULT true,",
    "  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())",
    ");",
    "",
    "DO $$",
    "BEGIN",
    "    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='nome_completo') THEN",
    "        ALTER TABLE usuarios ADD COLUMN nome_completo TEXT;",
    "    END IF;",
    "END $$;",
    "",
    "INSERT INTO usuarios (id, nome, nome_completo, ativo)",
    "VALUES",
    "  ('ba8dff5e', 'Amerson', 'Amerson Gonçalves Bento', true),",
    "  ('2837b0a8', 'Zedequias', 'Zedequias Carlos de Melo', true),",
    "  ('8bc1be25', 'Ivanilde', 'Ivanilde Souza', true),",
    "  ('51f76373', 'Kaio', 'Kaio Lohandes Gomes de Melo', true),",
    "  ('33a4ab38', 'Deck', 'Deck Melo', true),",
    "  ('a6708d10', 'Dabita', 'Dabita de Oliveira Cardoso', true),",
    "  ('33aa7d87', 'Regis', 'Regis Reginaldo', true),",
    "  ('33aa7bs56', 'Fernando', 'Fernado Color', true),",
    "  ('a2940ebb', 'Zedquias', 'Zedquias Melo', true)",
    "ON CONFLICT (id) DO UPDATE SET",
    "  nome_completo = EXCLUDED.nome_completo,",
    "  nome = EXCLUDED.nome;",
    "",
    "-- 2. Garante que as colunas data_movimento e data_movimentacao existam na tabela geral_cnhs",
    "DO $$",
    "BEGIN",
    "    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='geral_cnhs' AND column_name='data_movimentacao') THEN",
    "        ALTER TABLE geral_cnhs ADD COLUMN data_movimentacao TIMESTAMPTZ;",
    "    END IF;",
    "    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='geral_cnhs' AND column_name='data_movimento') THEN",
    "        ALTER TABLE geral_cnhs ADD COLUMN data_movimento TIMESTAMPTZ;",
    "    END IF;",
    "END $$;",
    "",
    "-- 3. Atualizacao direta do nome completo do usuario em geral_cnhs com base no usuario_id",
    "UPDATE geral_cnhs SET usuario_nome = 'Amerson Gonçalves Bento' WHERE LOWER(usuario_id) = 'ba8dff5e';",
    "UPDATE geral_cnhs SET usuario_nome = 'Zedequias Carlos de Melo' WHERE LOWER(usuario_id) = '2837b0a8';",
    "UPDATE geral_cnhs SET usuario_nome = 'Ivanilde Souza' WHERE LOWER(usuario_id) = '8bc1be25';",
    "UPDATE geral_cnhs SET usuario_nome = 'Kaio Lohandes Gomes de Melo' WHERE LOWER(usuario_id) = '51f76373';",
    "UPDATE geral_cnhs SET usuario_nome = 'Deck Melo' WHERE LOWER(usuario_id) = '33a4ab38';",
    "UPDATE geral_cnhs SET usuario_nome = 'Dabita de Oliveira Cardoso' WHERE LOWER(usuario_id) = 'a6708d10';",
    "UPDATE geral_cnhs SET usuario_nome = 'Regis Reginaldo' WHERE LOWER(usuario_id) = '33aa7d87';",
    "UPDATE geral_cnhs SET usuario_nome = 'Fernado Color' WHERE LOWER(usuario_id) = '33aa7bs56';",
    "UPDATE geral_cnhs SET usuario_nome = 'Zedquias Melo' WHERE LOWER(usuario_id) = 'a2940ebb';",
    "",
    "-- 4. Atualiza em lote os dados de data_movimento/data_movimentacao, usuario_id e usuario_nome de cada CNH",
]

# Create batch updates
batch_size = 100
for i in range(0, len(cnhs), batch_size):
    chunk = cnhs[i:i + batch_size]
    rows = []
    for c in chunk:
        dt = c.get('data_movimento') or c.get('created_at') or '2026-03-01T12:00:00.000Z'
        uid = c.get('usuario_id')
        unome = c.get('usuario_nome')
        rows.append(f"  ({sql_str(c['id'])}, {sql_str(dt)}::timestamptz, {sql_str(uid)}, {sql_str(unome)})")
    
    sql_lines.append("UPDATE geral_cnhs AS g")
    sql_lines.append("SET")
    sql_lines.append("  data_movimento = v.data_mov,")
    sql_lines.append("  data_movimentacao = v.data_mov,")
    sql_lines.append("  usuario_id = COALESCE(v.uid, g.usuario_id),")
    sql_lines.append("  usuario_nome = COALESCE(v.unome, g.usuario_nome)")
    sql_lines.append("FROM (VALUES")
    sql_lines.append(",\n".join(rows))
    sql_lines.append(") AS v(cnh_id, data_mov, uid, unome)")
    sql_lines.append("WHERE g.id = v.cnh_id;\n")

sql_lines.extend([
    "-- 5. Sincroniza data_movimento com data_movimentacao se uma delas estiver nula",
    "UPDATE geral_cnhs SET data_movimentacao = data_movimento WHERE data_movimentacao IS NULL AND data_movimento IS NOT NULL;",
    "UPDATE geral_cnhs SET data_movimento = data_movimentacao WHERE data_movimento IS NULL AND data_movimentacao IS NOT NULL;",
    "",
    "-- 6. Atualiza usuario_nome trazendo o nome_completo da tabela de usuarios",
    "UPDATE geral_cnhs g",
    "SET usuario_nome = u.nome_completo",
    "FROM usuarios u",
    "WHERE LOWER(g.usuario_id) = LOWER(u.id);",
    "",
    "-- 7. Consulta de verificacao dos primeiros registros atualizados",
    "SELECT id, ordem, nome, data_movimento, data_movimentacao, usuario_id, usuario_nome FROM geral_cnhs WHERE usuario_id IS NOT NULL ORDER BY ordem ASC LIMIT 15;"
])

os.makedirs("supabase", exist_ok=True)
sql_out_path = "supabase/update_usuarios_data_movimento.sql"
with open(sql_out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(sql_lines))

print(f"Generated {sql_out_path} with {len(sql_lines)} lines.")
