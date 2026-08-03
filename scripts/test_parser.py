import re, json, glob

def parse_line(line):
    line = line.strip()
    if not line or line.startswith("==") or line.startswith("ordem"):
        return None
    
    # regex for line starting with integer
    m_start = re.match(r"^(\d+)\s+(.+)$", line)
    if not m_start:
        return None
    
    ordem = int(m_start.group(1))
    rest = m_start.group(2).strip()
    
    # Look for status: ENTREGUE, RECEBIDA, PENDENTE, REMETIDA
    status_match = re.search(r"\b(ENTREGUE|RECEBIDA|PENDENTE|REMETIDA)\b", rest)
    if not status_match:
        return None
    
    status_str = status_match.group(1)
    status_idx = status_match.start()
    
    before_status = rest[:status_idx].strip()
    after_status = rest[status_idx + len(status_str):].strip()
    
    # Before status has: nome [cpf]
    cpf_match = re.search(r"(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11}|\d{10})", before_status)
    if cpf_match:
        cpf = cpf_match.group(1)
        nome = before_status[:cpf_match.start()].strip()
    else:
        cpf = ""
        nome = before_status.strip()
        
    # After status has: [data_movimento] [usuario_id] [usuario_nome]
    data_movimento = ""
    usuario_id = ""
    usuario_nome = ""
    
    date_match = re.search(r"(\d{2}/\d{2}/\d{4})", after_status)
    if date_match:
        data_movimento = date_match.group(1)
        after_date = after_status[date_match.end():].strip()
    else:
        after_date = after_status.strip()
        
    # User ID is usually 8 hex chars like 51f76373 or a6708d10 or 33a4ab38 or PA30...
    uid_match = re.search(r"\b([0-9a-f]{8}|PA\d+|PID)\b", after_date, re.IGNORECASE)
    if uid_match:
        usuario_id = uid_match.group(1)
        usuario_nome = after_date[uid_match.end():].strip()
    else:
        if after_date:
            usuario_nome = after_date
            
    # Map user_nome to user_id if missing or vice versa
    user_map_id_to_name = {
        "51f76373": "Kaio",
        "a6708d10": "Dabita",
        "ba8dff5e": "Lohandes",
        "33aa7d87": "Regis",
        "8bc1be25": "Ivanilde",
        "2837b0a8": "Zedequias",
        "33a4ab38": "Deck"
    }
    user_map_name_to_id = {v.lower(): k for k, v in user_map_id_to_name.items()}
    user_map_name_to_id["kaio"] = "51f76373"
    user_map_name_to_id["dabita"] = "a6708d10"
    user_map_name_to_id["lohandes"] = "ba8dff5e"
    user_map_name_to_id["amerson"] = "ba8dff5e"
    user_map_name_to_id["regis"] = "33aa7d87"
    user_map_name_to_id["ivanilde"] = "8bc1be25"
    user_map_name_to_id["zedequias"] = "2837b0a8"
    user_map_name_to_id["deck"] = "33a4ab38"

    if usuario_id and not usuario_nome:
        usuario_nome = user_map_id_to_name.get(usuario_id.lower(), usuario_id)
    elif usuario_nome and not usuario_id:
        usuario_id = user_map_name_to_id.get(usuario_nome.lower(), "")
        
    return {
        "ordem": ordem,
        "nome": nome,
        "cpf": cpf,
        "situacao": status_str.capitalize(),
        "data_movimento": data_movimento,
        "usuario_id": usuario_id,
        "usuario_nome": usuario_nome
    }

parsed = []
with open("/tmp/ocr_chunks/chunk1.txt", "r", encoding="utf-8") as f:
    for line in f:
        item = parse_line(line)
        if item:
            parsed.append(item)

print(f"Parsed {len(parsed)} items from chunk1")
print("Sample parsed items:")
for p in parsed[:10]:
    print(p)
