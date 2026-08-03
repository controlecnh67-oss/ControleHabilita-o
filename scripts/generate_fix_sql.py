import re, json

# Read db.ts seed responsaveis
db_resps = []
with open("src/services/db.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Parse SEED_RESPONSAVEIS array from db.ts
match = re.search(r"const SEED_RESPONSAVEIS: Responsavel\[\] = \[(.*?)\];", content, re.DOTALL)
if match:
    block = match.group(1)
    # Extract object literals
    items = re.findall(r"\{\s*id:\s*\"([^\"]+)\",\s*nome:\s*\"([^\"]+)\"(?:,\s*registro:\s*\"([^\"]*)\")?(?:,\s*cpf:\s*\"([^\"]*)\")?(?:,\s*telefone:\s*\"([^\"]*)\")?(?:,\s*observacao:\s*\"([^\"]*)\")?", block)
    for it in items:
        rid, nome, registro, cpf, tel, obs = it
        db_resps.append({
            "id": rid.lower(),
            "nome": nome,
            "cpf": cpf or "",
            "telefone": tel or "",
            "observacao": obs or ""
        })

print(f"Parsed {len(db_resps)} responsaveis from db.ts")

sql_lines = [
    "-- ============================================================================",
    "-- SCRIPT COMPLETO E CORRIGIDO PARA O EDITOR DE SQL DO SUPABASE",
    "-- 1. Garante a tabela 'responsaveis' com colunas validas (sem a coluna 'tipo')",
    "-- 2. Popula/Atualiza a tabela 'responsaveis' para evitar erro de Chave Estrangeira (23503)",
    "-- 3. Transfere os IDs de 'responsavel_nome' para 'responsavel_id' em 'geral_cnhs'",
    "-- 4. Traz os nomes atualizados da tabela 'responsaveis' para 'responsavel_nome'",
    "-- ============================================================================",
    "",
    "-- 1. Criar a tabela 'responsaveis' caso nao exista",
    "CREATE TABLE IF NOT EXISTS responsaveis (",
    "  id TEXT PRIMARY KEY,",
    "  nome TEXT NOT NULL,",
    "  cpf TEXT DEFAULT '',",
    "  telefone TEXT DEFAULT '',",
    "  observacao TEXT DEFAULT '',",
    "  ativo BOOLEAN DEFAULT true,",
    "  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())",
    ");",
    "",
    "-- 2. Inserir/Atualizar todos os Responsáveis para evitar Foreign Key Violations",
    "INSERT INTO responsaveis (id, nome, cpf, telefone, observacao, ativo)",
    "VALUES"
]

val_rows = []
for r in db_resps:
    nome_esc = r['nome'].replace("'", "''")
    cpf_esc = r['cpf'].replace("'", "''")
    tel_esc = r['telefone'].replace("'", "''")
    obs_esc = r['observacao'].replace("'", "''")
    val_rows.append(f"  ('{r['id']}', '{nome_esc}', '{cpf_esc}', '{tel_esc}', '{obs_esc}', true)")

sql_lines.append(",\n".join(val_rows))
sql_lines.append("ON CONFLICT (id) DO UPDATE SET")
sql_lines.append("  nome = EXCLUDED.nome,")
sql_lines.append("  cpf = EXCLUDED.cpf,")
sql_lines.append("  telefone = EXCLUDED.telefone,")
sql_lines.append("  observacao = EXCLUDED.observacao;")
sql_lines.append("")

sql_lines.extend([
    "-- 3. Transferir o ID que estava na coluna responsavel_nome para responsavel_id",
    "UPDATE geral_cnhs",
    "SET responsavel_id = LOWER(responsavel_nome)",
    "WHERE (responsavel_nome ~* '^[0-9a-f]{8}$')",
    "  AND (responsavel_id IS NULL OR responsavel_id = '' OR responsavel_id = responsavel_nome);",
    "",
    "-- 4. Trazer o nome atualizado da tabela 'responsaveis' para a coluna 'responsavel_nome'",
    "UPDATE geral_cnhs g",
    "SET responsavel_nome = r.nome",
    "FROM responsaveis r",
    "WHERE LOWER(g.responsavel_id) = LOWER(r.id);",
    "",
    "-- 5. Verificar resultado",
    "SELECT id, ordem, nome, responsavel_id, responsavel_nome FROM geral_cnhs WHERE responsavel_id IS NOT NULL LIMIT 10;"
])

with open("supabase/fix_responsaveis.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(sql_lines))

print("Created /supabase/fix_responsaveis.sql successfully.")
