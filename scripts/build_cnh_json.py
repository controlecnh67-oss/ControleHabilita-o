import re, json, glob, os

def parse_date(date_str):
    if not date_str:
        return ""
    parts = date_str.split("/")
    if len(parts) == 3:
        day, month, year = parts
        return f"{year}-{month.zfill(2)}-{day.zfill(2)}T12:00:00.000Z"
    return date_str

user_map_id_to_name = {
    "51f76373": "Kaio",
    "a6708d10": "Dabita",
    "ba8dff5e": "Lohandes",
    "33aa7d87": "Regis",
    "8bc1be25": "Ivanilde",
    "2837b0a8": "Zedequias",
    "33a4ab38": "Deck"
}

user_map_name_to_id = {
    "kaio": "51f76373",
    "dabita": "a6708d10",
    "lohandes": "ba8dff5e",
    "amerson": "ba8dff5e",
    "regis": "33aa7d87",
    "ivanilde": "8bc1be25",
    "zedequias": "2837b0a8",
    "deck": "33a4ab38"
}

def parse_line(line):
    line = line.strip()
    if not line or line.startswith("==") or line.startswith("ordem"):
        return None
    
    m_start = re.match(r"^(\d+)\s+(.+)$", line)
    if not m_start:
        return None
    
    ordem = int(m_start.group(1))
    rest = m_start.group(2).strip()
    
    status_match = re.search(r"\b(ENTREGUE|RECEBIDA|PENDENTE|REMETIDA)\b", rest)
    if not status_match:
        return None
    
    status_str = status_match.group(1)
    status_idx = status_match.start()
    
    before_status = rest[:status_idx].strip()
    after_status = rest[status_idx + len(status_str):].strip()
    
    cpf_match = re.search(r"(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11}|\d{10})", before_status)
    gaveta = ""
    reparticao = ""
    
    if cpf_match:
        cpf = cpf_match.group(1)
        nome = before_status[:cpf_match.start()].strip()
        after_cpf = before_status[cpf_match.end():].strip()
        parts = after_cpf.split()
        if len(parts) >= 2:
            gaveta = parts[0]
            reparticao = parts[1]
        elif len(parts) == 1:
            gaveta = parts[0]
    else:
        cpf = ""
        nome = before_status.strip()
        
    data_movimento = ""
    usuario_id = ""
    usuario_nome = ""
    responsavel_id = ""
    responsavel_nome = ""
    
    # Check for responsavel hex ID or description in after_status before date or after date
    date_match = re.search(r"(\d{2}/\d{2}/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)", after_status)
    if date_match:
        data_movimento = date_match.group(1)
        before_date = after_status[:date_match.start()].strip()
        after_date = after_status[date_match.end():].strip()
        
        # Check responsavel in before_date
        resp_match = re.search(r"\b([0-9a-f]{8})\b", before_date, re.IGNORECASE)
        if resp_match:
            responsavel_id = resp_match.group(1)
            responsavel_nome = before_date[resp_match.end():].strip()
        else:
            responsavel_nome = before_date
            
        # Check user in after_date
        uid_match = re.search(r"\b([0-9a-f]{8}|PA\d+|PID)\b", after_date, re.IGNORECASE)
        if uid_match:
            usuario_id = uid_match.group(1)
            usuario_nome = after_date[uid_match.end():].strip()
        else:
            if after_date:
                usuario_nome = after_date
    else:
        # No date match
        resp_match = re.search(r"\b([0-9a-f]{8})\b", after_status, re.IGNORECASE)
        if resp_match:
            responsavel_id = resp_match.group(1)
            responsavel_nome = after_status[resp_match.end():].strip()
        else:
            responsavel_nome = after_status.strip()
            
    if usuario_id and not usuario_nome:
        usuario_nome = user_map_id_to_name.get(usuario_id.lower(), usuario_id)
    elif usuario_nome and not usuario_id:
        usuario_id = user_map_name_to_id.get(usuario_nome.lower(), "")
        
    iso_date = parse_date(data_movimento)
    
    return {
        "id": f"cnh-{ordem:04d}",
        "ordem": ordem,
        "nome": nome,
        "cpf": cpf,
        "gaveta": gaveta,
        "reparticao": reparticao,
        "situacao": status_str.capitalize(),
        "responsavel_id": responsavel_id or None,
        "responsavel_nome": responsavel_nome or None,
        "data_movimento": iso_date or "2026-03-01T12:00:00.000Z",
        "usuario_id": usuario_id or None,
        "usuario_nome": usuario_nome or None,
        "observacao": "",
        "created_at": iso_date or "2026-03-01T12:00:00.000Z"
    }

files = sorted(glob.glob("/tmp/ocr_chunks/*.txt") + glob.glob("/tmp/all_ocr.txt"))
seen_ordems = set()
cnhs = []

for filepath in files:
    if not os.path.exists(filepath):
        continue
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            item = parse_line(line)
            if item and item["ordem"] not in seen_ordems:
                seen_ordems.add(item["ordem"])
                cnhs.append(item)

cnhs.sort(key=lambda x: x["ordem"])

os.makedirs("src/data", exist_ok=True)
out_path = "src/data/cnhSeedData.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(cnhs, f, ensure_ascii=False, indent=2)

print(f"Generated {len(cnhs)} CNH records in {out_path}")

# Build SQL file for Supabase
os.makedirs("supabase", exist_ok=True)
sql_out_path = "supabase/populate_geral_cnhs.sql"

def sql_str(val):
    if val is None or val == "":
        return "NULL"
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

sql_lines = [
    "-- ============================================================================",
    "-- POVOAMENTO DA TABELA GERAL_CNHS NO SUPABASE (POSTGRESQL)",
    f"-- Total de registros inseridos: {len(cnhs)}",
    "-- ============================================================================",
    "",
    "-- Garante que a tabela exista antes de inserir os dados",
    "CREATE TABLE IF NOT EXISTS geral_cnhs (",
    "  id TEXT PRIMARY KEY,",
    "  ordem INTEGER NOT NULL,",
    "  memorando_id TEXT,",
    "  candidato_id TEXT,",
    "  nome TEXT NOT NULL,",
    "  cpf TEXT NOT NULL,",
    "  gaveta TEXT,",
    "  reparticao TEXT,",
    "  situacao TEXT NOT NULL DEFAULT 'Recebida',",
    "  responsavel_id TEXT,",
    "  responsavel_nome TEXT,",
    "  data_movimento TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),",
    "  usuario_id TEXT,",
    "  usuario_nome TEXT,",
    "  memorando_numero TEXT,",
    "  remessa TEXT,",
    "  observacao TEXT,",
    "  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())",
    ");",
    ""
]

batch_size = 100
for i in range(0, len(cnhs), batch_size):
    chunk = cnhs[i:i + batch_size]
    values_list = []
    for c in chunk:
        val_str = f"({sql_str(c['id'])}, {c['ordem']}, {sql_str(c['nome'])}, {sql_str(c['cpf'])}, {sql_str(c['gaveta'])}, {sql_str(c['reparticao'])}, {sql_str(c['situacao'])}, {sql_str(c['responsavel_id'])}, {sql_str(c['responsavel_nome'])}, {sql_str(c['data_movimento'])}, {sql_str(c['usuario_id'])}, {sql_str(c['usuario_nome'])}, {sql_str(c['observacao'])}, {sql_str(c['created_at'])})"
        values_list.append(val_str)
    
    sql_lines.append("INSERT INTO geral_cnhs (id, ordem, nome, cpf, gaveta, reparticao, situacao, responsavel_id, responsavel_nome, data_movimento, usuario_id, usuario_nome, observacao, created_at)")
    sql_lines.append("VALUES\n" + ",\n".join(values_list))
    sql_lines.append("ON CONFLICT (id) DO UPDATE SET")
    sql_lines.append("  ordem = EXCLUDED.ordem,")
    sql_lines.append("  nome = EXCLUDED.nome,")
    sql_lines.append("  cpf = EXCLUDED.cpf,")
    sql_lines.append("  gaveta = EXCLUDED.gaveta,")
    sql_lines.append("  reparticao = EXCLUDED.reparticao,")
    sql_lines.append("  situacao = EXCLUDED.situacao,")
    sql_lines.append("  responsavel_id = EXCLUDED.responsavel_id,")
    sql_lines.append("  responsavel_nome = EXCLUDED.responsavel_nome,")
    sql_lines.append("  data_movimento = EXCLUDED.data_movimento,")
    sql_lines.append("  usuario_id = EXCLUDED.usuario_id,")
    sql_lines.append("  usuario_nome = EXCLUDED.usuario_nome,")
    sql_lines.append("  observacao = EXCLUDED.observacao;\n")

with open(sql_out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(sql_lines))

print(f"Generated SQL script in {sql_out_path}")
