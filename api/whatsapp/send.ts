interface VercelRequest {
  method?: string;
  body?: any;
  query?: Record<string, string | string[]>;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => VercelResponse;
  setHeader: (name: string, value: string) => VercelResponse;
  end: () => VercelResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configuração de CORS para requisições do frontend
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Utilize POST.' });
  }

  try {
    const { phone, text } = req.body || {};
    if (!phone || !text) {
      return res.status(400).json({ success: false, error: 'Telefone e mensagem são obrigatórios.' });
    }

    // Formatando número de telefone para apenas dígitos
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    const apiKey = process.env.WASENDER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Chave de API do Wasender não configurada no servidor Vercel (WASENDER_API_KEY).'
      });
    }

    // Testar endpoints documentados da Wasender API
    const endpoints = [
      'https://www.wasenderapi.com/api/send-message',
      'https://wasenderapi.com/api/send-message',
      'https://wasenderapi.com/api/v1/messages/send-text-message'
    ];

    // Variantes de payload aceitas em APIs Wasender
    const payloadVariants = [
      { to: cleanPhone, text: text },
      { phone: cleanPhone, message: text },
      { receiver: cleanPhone, message: text }
    ];

    let lastError = '';

    for (const endpoint of endpoints) {
      for (const bodyPayload of payloadVariants) {
        try {
          const apiRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyPayload)
          });

          const resText = await apiRes.text();
          let responseData: any = {};
          try {
            responseData = JSON.parse(resText);
          } catch (e) {
            responseData = { message: resText };
          }

          // Verifica se a API respondeu 200/OK E não reportou erro dentro do JSON retornado
          const isSuccess =
            apiRes.ok &&
            responseData &&
            responseData.success !== false &&
            responseData.status !== false &&
            responseData.status !== 'error' &&
            !responseData.error;

          if (isSuccess) {
            return res.status(200).json({ success: true, data: responseData, endpoint });
          } else {
            lastError =
              responseData.message ||
              responseData.error ||
              responseData.msg ||
              resText ||
              `HTTP ${apiRes.status}`;
          }
        } catch (e: any) {
          lastError = e.message;
        }
      }
    }

    // Traduz e formata erros conhecidos para mensagens claras ao usuário
    let userFriendlyError = lastError;
    if (
      lastError.toLowerCase().includes('session is not connected') ||
      lastError.toLowerCase().includes('connect your session')
    ) {
      userFriendlyError =
        'Sua sessão do WhatsApp não está conectada no Wasender API. Por favor, acesse o painel da Wasender e conecte sua sessão do WhatsApp.';
    } else if (
      lastError.toLowerCase().includes('invalid api key') ||
      lastError.toLowerCase().includes('unauthorized')
    ) {
      userFriendlyError =
        'Chave de API do Wasender inválida ou não autorizada. Verifique suas credenciais em WASENDER_API_KEY no painel da Vercel.';
    }

    return res.status(400).json({
      success: false,
      error: userFriendlyError || 'Falha de comunicação com os servidores da Wasender API.'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Erro interno no servidor.' });
  }
}
