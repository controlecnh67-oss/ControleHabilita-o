/**
 * Serviço Centralizado de Sanitização e Integridade de Chaves Estrangeiras (FKs)
 * Previne falhas de constraint no PostgreSQL do Supabase (ex: geral_cnhs_usuario_id_fkey,
 * geral_cnhs_responsavel_id_fkey) sem nunca perder os dados de negócio (usuario_nome, responsavel_nome).
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { Usuario, Responsavel, GeralCNH, getPermissoesPadrao } from "../types";

export function toValidUUID(id?: string | null): string | null {
  if (!id || typeof id !== "string" || id.trim() === "") return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanId = id.trim();
  if (uuidRegex.test(cleanId)) return cleanId;

  if (cleanId === "admin") return "11111111-1111-1111-1111-111111111111";
  if (cleanId === "controlecnh" || cleanId === "controlecnh67") return "67676767-6767-6767-6767-676767676767";
  if (cleanId === "supervisor") return "22222222-2222-2222-2222-222222222222";
  if (cleanId === "operador") return "33333333-3333-3333-3333-333333333333";
  if (cleanId === "consulta") return "44444444-4444-4444-4444-444444444444";
  if (cleanId === "proprietario") return "a0000000-0000-0000-0000-000000000001";

  // Gerar um UUID v4 determinístico a partir de qualquer string (ex: "usr-01", "resp-02")
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = ((hash << 5) - hash) + cleanId.charCodeAt(i);
    hash |= 0;
  }
  const hexHash = Math.abs(hash).toString(16).padStart(8, "0");
  const safeStr = cleanId.replace(/[^a-f0-9]/gi, "").toLowerCase().padEnd(24, "0").substring(0, 24);
  return `${hexHash}-${safeStr.substring(0, 4)}-4${safeStr.substring(4, 7)}-8${safeStr.substring(7, 10)}-${safeStr.substring(10, 22)}`;
}

export function cleanFK(id?: string | null, validSet?: Set<string>): string | null {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return null;
  if (validSet && !validSet.has(trimmed)) return null;
  return trimmed;
}

// Cache em memória de IDs remotos válidos
let cachedValidRemoteUserIds: Set<string> | null = null;
let cachedValidRemoteRespIds: Set<string> | null = null;
let lastFkCacheTime = 0;

function getStoredLocalList<T>(key: string): T[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(`detran_cnh_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Retorna os conjuntos de IDs de usuários e responsáveis confirmados no banco de dados.
 */
export async function getValidRemoteFkCache(forceRefresh = false): Promise<{
  validUserIds: Set<string>;
  validRespIds: Set<string>;
}> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedValidRemoteUserIds &&
    cachedValidRemoteRespIds &&
    now - lastFkCacheTime < 60000
  ) {
    return {
      validUserIds: cachedValidRemoteUserIds,
      validRespIds: cachedValidRemoteRespIds
    };
  }

  const validUserIds = new Set<string>();
  const validRespIds = new Set<string>();

  // ID padrão canônico do proprietário
  validRespIds.add("a0000000-0000-0000-0000-000000000001");

  // Adiciona IDs locais válidos
  const localUsers = getStoredLocalList<Usuario>("usuarios");
  localUsers.forEach((u) => {
    if (u.id && u.id.includes("-")) validUserIds.add(u.id);
  });
  const localResp = getStoredLocalList<Responsavel>("responsaveis");
  localResp.forEach((r) => {
    if (r.id) validRespIds.add(r.id);
  });

  if (isSupabaseConfigured()) {
    try {
      const [uRes, rRes] = await Promise.all([
        supabase.from("usuarios").select("id").limit(2000),
        supabase.from("responsaveis").select("id").limit(5000)
      ]);
      uRes.data?.forEach((u: any) => validUserIds.add(u.id));
      rRes.data?.forEach((r: any) => validRespIds.add(r.id));
    } catch (e) {
      console.warn("Aviso ao buscar IDs remotos para validação de FKs:", e);
    }
  }

  cachedValidRemoteUserIds = validUserIds;
  cachedValidRemoteRespIds = validRespIds;
  lastFkCacheTime = now;

  return { validUserIds, validRespIds };
}

/**
 * Garante que os registros mestre de usuários e responsáveis básicos existam no Supabase
 * antes de enviar qualquer CNH, evitando erros de chave estrangeira (FK).
 */
export async function ensureBaseEntitiesSynced(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    // 1. Assegura que os usuários padrão existam no Supabase com IDs válidos
    const localUsers = getStoredLocalList<Usuario>("usuarios");
    const validUuidUsers = localUsers.filter((u) => u.id && u.id.includes("-"));
    if (validUuidUsers.length > 0) {
      const userPayloads = validUuidUsers.map((u) => ({
        id: u.id,
        nome: u.nome,
        nome_curto: u.nome_curto || u.nome,
        fone: u.fone || null,
        email: u.email,
        funcao: u.funcao || null,
        setor: u.setor || "Protocolo",
        login: u.login,
        perfil: u.perfil || "Operador",
        permissoes: u.permissoes || getPermissoesPadrao(u.perfil || "Operador"),
        ativo: u.ativo !== false,
        created_at: u.created_at || new Date().toISOString()
      }));
      await supabase.from("usuarios").upsert(userPayloads, { onConflict: "id" });
    }

    // 2. Assegura que o registro canônico PROPRIETÁRIO e responsáveis básicos existam no Supabase
    const canonicalProprietario = {
      id: "a0000000-0000-0000-0000-000000000001",
      nome: "PROPRIETÁRIO",
      cpf: "000.000.000-00",
      telefone: "(93) 00000-0000",
      observacao: "Registro padrão intransferível para entrega ao próprio titular da CNH",
      ativo: true,
      created_at: new Date(Date.now() - 60 * 86400000).toISOString()
    };

    const localResp = getStoredLocalList<Responsavel>("responsaveis");
    const respMap = new Map<string, any>();
    respMap.set(canonicalProprietario.id, canonicalProprietario);
    localResp.forEach((r) => {
      if (r.id) {
        respMap.set(r.id, {
          id: r.id,
          nome: r.nome ? r.nome.trim() : "",
          cpf: r.cpf ? r.cpf.trim() : "",
          telefone: r.telefone ? r.telefone.trim() : "",
          observacao: r.observacao ? r.observacao.trim() : "",
          ativo: r.ativo !== false,
          created_at: r.created_at || new Date().toISOString()
        });
      }
    });

    const safeRespPayloads = Array.from(respMap.values()).slice(0, 50);
    await supabase.from("responsaveis").upsert(safeRespPayloads, { onConflict: "id" });

    // Atualiza cache de FKs
    await getValidRemoteFkCache(true);
  } catch (err) {
    console.warn("Aviso ao auto-provisionar entidades base no Supabase:", err);
  }
}

/**
 * Sanitiza o payload de uma CNH para envio ao Supabase, garantindo que
 * nenhuma chave estrangeira (usuario_id, responsavel_id, etc.) viole constraints no PostgreSQL,
 * preservando 100% dos nomes (usuario_nome, responsavel_nome) e dados de negócio.
 */
export function sanitizeGeralCnhForSupabase(
  r: GeralCNH,
  validUserIds?: Set<string>,
  validRespIds?: Set<string>
) {
  let safeUserId: string | null = null;
  if (r.usuario_id && typeof r.usuario_id === "string") {
    const rawId = r.usuario_id.trim();
    if (validUserIds && validUserIds.has(rawId)) {
      safeUserId = rawId;
    } else {
      // Tenta mapear por login ou nome conhecido
      const localUsers = getStoredLocalList<Usuario>("usuarios");
      const match = localUsers.find(
        (u) => u.id === rawId || u.login.toLowerCase() === rawId.toLowerCase() || u.nome === r.usuario_nome
      );
      if (match && validUserIds && validUserIds.has(match.id)) {
        safeUserId = match.id;
      } else {
        // FK não existente no Supabase: usa null para não violar geral_cnhs_usuario_id_fkey
        safeUserId = null;
      }
    }
  }

  let safeRespId: string | null = null;
  if (r.responsavel_id && typeof r.responsavel_id === "string") {
    const rawResp = r.responsavel_id.trim();
    if (validRespIds && validRespIds.has(rawResp)) {
      safeRespId = rawResp;
    } else if (r.responsavel_nome === "PROPRIETÁRIO" || rawResp === "a0000000-0000-0000-0000-000000000001") {
      safeRespId = "a0000000-0000-0000-0000-000000000001";
    } else {
      safeRespId = null;
    }
  }

  return {
    id: r.id,
    ordem: Number(r.ordem) || 0,
    pa: r.pa || null,
    nome: (r.nome || "").trim().toUpperCase(),
    cpf: r.cpf || "",
    telefone: r.telefone || null,
    gaveta: r.gaveta || "",
    reparticao: r.reparticao || "",
    situacao: r.situacao,
    responsavel_id: safeRespId,
    responsavel_nome: r.responsavel_nome || null,
    data_movimento: r.data_movimento || new Date().toISOString(),
    usuario_id: safeUserId,
    usuario_nome: r.usuario_nome || null,
    memorando_numero: r.memorando_numero || null,
    remessa: r.remessa || null,
    lote: r.lote || null,
    observacao: r.observacao || null,
    memorando_id: r.memorando_id ? (toValidUUID(r.memorando_id) || null) : null,
    candidato_id: r.candidato_id ? (toValidUUID(r.candidato_id) || null) : null,
    created_at: r.created_at || new Date().toISOString(),
    updated_at: r.updated_at || new Date().toISOString()
  };
}
