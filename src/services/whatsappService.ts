export interface SendWhatsAppResult {
  success: boolean;
  endpoint?: string;
  data?: any;
  error?: string;
}

/**
 * Envia mensagem de texto diretamente via Wasender API
 */
export async function sendWhatsAppMessageAPI(phone: string, text: string): Promise<SendWhatsAppResult> {
  try {
    const response = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phone, text })
    });

    const result = await response.json();
    if (response.ok && result.success) {
      return { success: true, endpoint: result.endpoint, data: result.data };
    } else {
      return {
        success: false,
        error: result.error || `Erro ${response.status}: Falha ao enviar mensagem via Wasender API`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Erro de conexão com o servidor de envio"
    };
  }
}

/**
 * Gera link direto para abrir no WhatsApp Web ou aplicativo mobile
 */
export function buildWhatsAppWebUrl(phone: string, text: string): string {
  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone) {
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
