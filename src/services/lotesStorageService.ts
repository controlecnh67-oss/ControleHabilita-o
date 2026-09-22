import { supabase, isSupabaseConfigured } from "./supabase";
import { Lote } from "../types";

/**
 * Converte Data URL (Base64) em objeto Blob binário de forma otimizada
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const contentType = mimeMatch ? mimeMatch[1] : "application/pdf";
    const byteString = atob(parts[1]);
    const byteNumbers = new Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteNumbers[i] = byteString.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  } catch (err) {
    console.error("Erro ao converter dataUrl para Blob:", err);
    return new Blob([], { type: "application/pdf" });
  }
}

/**
 * Sanitiza o nome do arquivo para compatibilidade com o Supabase Storage
 */
function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Substitui caracteres especiais por underline
    .toLowerCase();
}

/**
 * Faz o upload de um anexo (PDF ou imagem) de Lote para o Supabase Storage
 * e garante gravação com fallback na tabela de redundância imagens_sync.
 */
export async function uploadLoteAnexoToSupabase(
  loteId: string,
  fileName: string,
  fileData: string | Blob,
  fileSize?: number
): Promise<{ publicUrl: string | null; error?: string }> {
  // Se já for uma URL HTTP/HTTPS (já hospedado no Supabase Storage ou nuvem), retorna diretamente
  if (typeof fileData === "string" && (fileData.startsWith("http://") || fileData.startsWith("https://"))) {
    return { publicUrl: fileData };
  }

  if (!isSupabaseConfigured()) {
    console.warn("Supabase não configurado. Mantendo anexo no armazenamento local.");
    return { publicUrl: null };
  }

  try {
    let blob: Blob;
    if (typeof fileData === "string") {
      if (fileData.startsWith("data:")) {
        blob = dataUrlToBlob(fileData);
      } else {
        return { publicUrl: null, error: "Formato de anexo inválido" };
      }
    } else {
      blob = fileData;
    }

    const cleanName = sanitizeFileName(fileName || "anexo_lote.pdf");
    const uniqueFileName = `${Date.now()}_${cleanName}`;
    const storagePath = `lotes/${loteId}/${uniqueFileName}`;
    const contentType = blob.type || "application/pdf";

    // 1. Tentar upload nos buckets conhecidos (app_images, lotes, documentos, public, arquivos)
    const candidateBuckets = ["app_images", "lotes", "documentos", "public", "arquivos"];
    let publicUrl: string | null = null;
    let lastUploadError: string | undefined;

    // Se possível, descobre os buckets existentes
    try {
      const { data: existingBuckets } = await supabase.storage.listBuckets();
      if (existingBuckets && existingBuckets.length > 0) {
        for (const b of existingBuckets) {
          if (!candidateBuckets.includes(b.name)) {
            candidateBuckets.push(b.name);
          }
        }
      }
    } catch {}

    for (const targetBucket of candidateBuckets) {
      try {
        const uploadRes = await supabase.storage
          .from(targetBucket)
          .upload(storagePath, blob, {
            contentType,
            upsert: true,
            cacheControl: "3600"
          });

        if (!uploadRes.error) {
          const { data: urlData } = supabase.storage
            .from(targetBucket)
            .getPublicUrl(storagePath);

          if (urlData?.publicUrl) {
            publicUrl = urlData.publicUrl;
            console.log(`✅ [Supabase Storage] Anexo do Lote ${loteId} enviado com sucesso no bucket '${targetBucket}':`, publicUrl);
            break;
          }
        } else {
          lastUploadError = uploadRes.error.message;
        }
      } catch (bucketErr: any) {
        lastUploadError = bucketErr?.message;
      }
    }

    // 2. Redundância na tabela 'imagens_sync' (backup garantido para caso o storage esteja restrito)
    try {
      // Gera ou obtém base64 se disponível
      let base64Data: string | null = null;
      if (typeof fileData === "string" && fileData.startsWith("data:")) {
        // Guarda no banco até 5MB
        if (fileData.length <= 7 * 1024 * 1024) {
          base64Data = fileData;
        }
      }

      await supabase.from("imagens_sync").upsert({
        id: `lote_${loteId}`,
        tabela_ref: "lotes",
        registro_id: loteId,
        nome: fileName || cleanName,
        tipo: contentType,
        tamanho: fileSize || blob.size,
        dados_base64: base64Data,
        url_publica: publicUrl || null,
        created_at: new Date().toISOString()
      }, { onConflict: "id" });
      console.log(`✅ [imagens_sync] Backup do anexo do lote ${loteId} registrado no banco de dados.`);
    } catch (syncTableErr) {
      console.warn("Aviso ao gravar anexo na tabela imagens_sync:", syncTableErr);
    }

    return { publicUrl, error: publicUrl ? undefined : lastUploadError };
  } catch (err: any) {
    console.error("Erro inesperado no upload do anexo do lote:", err);
    return { publicUrl: null, error: err?.message || "Erro inesperado no upload" };
  }
}

/**
 * Varre lotes existentes para sincronizar anexos pendentes que ainda estejam apenas em Base64 local
 */
export async function syncPendingLoteAnexosToSupabase(
  lotes: Lote[],
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  if (!isSupabaseConfigured() || !Array.isArray(lotes) || lotes.length === 0) {
    return 0;
  }

  const pendentes = lotes.filter(
    (l) => l.pdf_url && typeof l.pdf_url === "string" && l.pdf_url.startsWith("data:")
  );

  if (pendentes.length === 0) return 0;

  let migrados = 0;
  for (let i = 0; i < pendentes.length; i++) {
    const lote = pendentes[i];
    try {
      const uploadResult = await uploadLoteAnexoToSupabase(
        lote.id,
        lote.pdf_nome || `Lote_${lote.numero}.pdf`,
        lote.pdf_url!,
        lote.pdf_tamanho
      );

      if (uploadResult.publicUrl) {
        // Atualiza o registro no Supabase com a URL pública
        await supabase.from("lotes").update({
          pdf_url: uploadResult.publicUrl,
          updated_at: new Date().toISOString()
        }).eq("id", lote.id);

        lote.pdf_url = uploadResult.publicUrl;
        migrados++;
      }
    } catch (e) {
      console.warn(`Erro ao migrar anexo do lote #${lote.numero}:`, e);
    }
    if (onProgress) onProgress(i + 1, pendentes.length);
  }

  return migrados;
}

/**
 * Resolve a URL do PDF do lote recuperando do Storage ou do backup resiliente imagens_sync se necessário
 */
export async function resolveLotePdfUrl(lote: Lote): Promise<string | undefined> {
  if (lote.pdf_url && (lote.pdf_url.startsWith("http") || lote.pdf_url.startsWith("data:"))) {
    return lote.pdf_url;
  }

  if (!isSupabaseConfigured() || !lote.id) {
    return lote.pdf_url;
  }

  try {
    // 1. Tenta recuperar da tabela imagens_sync
    const { data: syncRow } = await supabase
      .from("imagens_sync")
      .select("url_publica, dados_base64")
      .or(`registro_id.eq.${lote.id},id.eq.lote_${lote.id}`)
      .limit(1)
      .maybeSingle();

    if (syncRow?.url_publica) {
      return syncRow.url_publica;
    }
    if (syncRow?.dados_base64) {
      return syncRow.dados_base64;
    }
  } catch (err) {
    console.warn("Aviso ao resolver anexo de lote via imagens_sync:", err);
  }

  return lote.pdf_url;
}
