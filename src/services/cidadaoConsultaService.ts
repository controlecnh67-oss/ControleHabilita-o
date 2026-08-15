import { GeralCNH } from "../types";
import { supabase, isSupabaseConfigured } from "./supabase";
import type { ResultadoConsultaPublica } from "./db";

const normalizeCpf = (value: string) => value.replace(/\D/g, "");

export async function consultarCnhPublicaPorCpf(cpfInput: string): Promise<ResultadoConsultaPublica> {
  const cpf = normalizeCpf(cpfInput);
  if (!cpf || cpf.length < 9) throw new Error("Por favor, informe um CPF válido para realizar a consulta.");

  if (!isSupabaseConfigured()) {
    throw new Error("Consulta pública indisponível: o banco de dados não está configurado.");
  }

  const { data, error } = await supabase.rpc("consulta_cnh_publica", { p_cpf: cpf });
  if (error) throw new Error(`Não foi possível consultar a CNH: ${error.message}`);

  const registros = ((data || []) as any[]).map((item) => item as GeralCNH);
  const ordenadas = [...registros].sort((a, b) => {
    const ordemDiff = (b.ordem || 0) - (a.ordem || 0);
    if (ordemDiff !== 0) return ordemDiff;
    return new Date(b.updated_at || b.data_movimento || b.created_at || 0).getTime() - new Date(a.updated_at || a.data_movimento || a.created_at || 0).getTime();
  });

  const latest = ordenadas[0];
  const recebida = ordenadas.find((c) => c.situacao === "Recebida");

  if (!latest) {
    await registrarConsulta(cpf, undefined, "Não Encontrada", "NAO_ENCONTRADA");
    return {
      cpfConsultado: cpf,
      cnhEncontrada: null,
      historico: [],
      statusDisponibilidade: "NAO_ENCONTRADA",
      mensagem: "Nenhum registro de CNH localizado para o CPF informado."
    };
  }

  if (recebida) {
    await registrarConsulta(cpf, recebida.nome, "Recebida", "DISPONIVEL");
    return {
      cpfConsultado: cpf,
      cnhEncontrada: recebida,
      historico: ordenadas,
      statusDisponibilidade: "DISPONIVEL",
      mensagem: "✅ Sua CNH já está disponível para retirada no balcão do DETRAN!"
    };
  }

  if (latest.situacao === "Entregue") {
    await registrarConsulta(cpf, latest.nome, "Entregue", "ENTREGUE");
    return {
      cpfConsultado: cpf,
      cnhEncontrada: latest,
      historico: ordenadas,
      statusDisponibilidade: "ENTREGUE",
      mensagem: "ℹ️ A sua CNH consta como ENTREGUE no balcão."
    };
  }

  await registrarConsulta(cpf, latest.nome, latest.situacao || "Pendente", "EM_PROCESSAMENTO");
  return {
    cpfConsultado: cpf,
    cnhEncontrada: latest,
    historico: ordenadas,
    statusDisponibilidade: "EM_PROCESSAMENTO",
    mensagem: "⏳ Sua CNH consta em processamento/trânsito e ainda não deu entrada no balcão de atendimento."
  };
}

async function registrarConsulta(
  cpf: string,
  nome: string | undefined,
  situacao: string,
  resultadoStatus: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc("registrar_acesso_cidadao", {
      p_id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      p_numero: null,
      p_data_hora: new Date().toISOString(),
      p_cpf: cpf,
      p_nome_titular: nome || null,
      p_situacao: situacao,
      p_resultado_status: resultadoStatus,
      p_canal: "Web Browser",
      p_dispositivo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 250) : null,
      p_cidade_origem: null,
      p_ip_mascarado: null
    });
    if (error) console.warn("Aviso ao registrar consulta pública:", error.message);
  } catch (error) {
    console.warn("Aviso ao registrar consulta pública:", error);
  }
}
