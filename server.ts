import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Rota de API para envio de mensagens via Wasender API
  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { phone, text } = req.body;
      if (!phone || !text) {
        return res.status(400).json({ success: false, error: "Telefone e mensagem são obrigatórios." });
      }

      // Formatando número de telefone para apenas dígitos
      let cleanPhone = String(phone).replace(/\D/g, "");
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        cleanPhone = `55${cleanPhone}`;
      }

      const apiKey = process.env.WASENDER_API_KEY || "5024d94704689c8a194cad62b9d33fa6bb130cfb4aae1b5df09a6d6362736166";

      // Testar endpoints documentados da Wasender API
      const endpoints = [
        "https://www.wasenderapi.com/api/send-message",
        "https://wasenderapi.com/api/send-message",
        "https://wasenderapi.com/api/v1/messages/send-text-message"
      ];

      // Variantes de payload aceitas em APIs Wasender
      const payloadVariants = [
        { to: cleanPhone, text: text },
        { phone: cleanPhone, message: text },
        { receiver: cleanPhone, message: text }
      ];

      let lastError = "";

      for (const endpoint of endpoints) {
        for (const bodyPayload of payloadVariants) {
          try {
            const apiRes = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
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
            const isSuccess = apiRes.ok && 
              responseData && 
              responseData.success !== false && 
              responseData.status !== false && 
              responseData.status !== "error" && 
              !responseData.error;

            if (isSuccess) {
              return res.json({ success: true, data: responseData, endpoint });
            } else {
              lastError = responseData.message || responseData.error || responseData.msg || resText || `HTTP ${apiRes.status}`;
            }
          } catch (e: any) {
            lastError = e.message;
          }
        }
      }

      // Traduz e formata erros conhecidos para mensagens claras ao usuário
      let userFriendlyError = lastError;
      if (lastError.toLowerCase().includes("session is not connected") || lastError.toLowerCase().includes("connect your session")) {
        userFriendlyError = "Sua sessão do WhatsApp não está conectada no Wasender API. Por favor, acesse o painel da Wasender e conecte sua sessão do WhatsApp.";
      } else if (lastError.toLowerCase().includes("invalid api key") || lastError.toLowerCase().includes("unauthorized")) {
        userFriendlyError = "Chave de API do Wasender inválida ou não autorizada. Verifique suas credenciais em WASENDER_API_KEY.";
      }

      return res.status(400).json({
        success: false,
        error: userFriendlyError || "Falha de comunicação com os servidores da Wasender API."
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Middleware do Vite em ambiente de desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server rodando com sucesso em http://0.0.0.0:${PORT}`);
  });
}

startServer();
