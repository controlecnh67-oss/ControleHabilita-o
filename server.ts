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

      let lastError = null;
      let responseData = null;

      for (const endpoint of endpoints) {
        try {
          const apiRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              to: cleanPhone,
              text: text,
              phone: cleanPhone,
              message: text
            })
          });

          if (apiRes.ok) {
            responseData = await apiRes.json();
            return res.json({ success: true, data: responseData, endpoint });
          } else {
            const errText = await apiRes.text();
            lastError = `HTTP ${apiRes.status}: ${errText}`;
          }
        } catch (e: any) {
          lastError = e.message;
        }
      }

      return res.status(500).json({
        success: false,
        error: lastError || "Falha de comunicação com os servidores da Wasender API."
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
