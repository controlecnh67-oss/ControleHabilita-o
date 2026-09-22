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

    // 1. Tentar upload no bucket padrão 'app_images' (ou 'lotes')
    let targetBucket = "app_images";
    let uploadRes = await supabase.storage
      .from(targetBucket)
      .upload(storagePath, blob, {
        contentType,
        upsert: true,
        cacheControl: "3600"
      });

    // Se o bucket não existir, tenta criar ou usar fallback
    if (uploadRes.error && uploadRes.error.message?.toLowerCase().includes("bucket not found")) {
      try {
        console.log(`Bucket '${targetBucket}' não encontrado. Tentando criar...`);
        await supabase.storage.createBucket("app_images", { public: true });
        uploadRes = await supabase.storage
          .from(targetBucket)
          .upload(storagePath, blob, {
            contentType,
            upsert: true,
            cacheControl: "3600"
          });
      } catch (createErr) {
        console.warn("Não foi possível auto-criar bucket app_images:", createErr);
      }
    }

    let publicUrl: string | null = null;

    if (!uploadRes.error) {
      const { data: urlData } = supabase.storage
        .from(targetBucket)
        .getPublicUrl(storagePath);
      
      if (urlData?.publicUrl) {
        publicUrl = urlData.publicUrl;
        console.log(`✅ [Supabase Storage] Anexo do Lote ${loteId} enviado com sucesso:`, publicUrl);
      }
    } else {
      console.warn("Aviso ao fazer upload para o Supabase Storage:", uploadRes.error.message);
    }

    // 2. Redundância na tabela 'imagens_sync' (backup resiliente para garantir que nunca se perca)
    try {
      const isReasonableSize = blob.size <= 2 * 1024 * 1024; // Guarda base64 se <= 2MB
      const base64Data = isReasonableSize && typeof fileData === "string" && fileData.startsWith("data:")
        ? fileData
        : null;

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
    } catch (syncTableErr) {
      console.warn("Aviso ao gravar anexo na tabela imagens_sync:", syncTableErr);
    }

    return { publicUrl, error: uploadRes.error?.message };
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
