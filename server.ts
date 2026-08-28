import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Aumentar o limite do corpo da requisição para suportar uploads de imagens e PDFs em base64
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Inicialização do cliente Gemini AI no servidor
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Chave de API do Gemini não configurada no servidor (GEMINI_API_KEY).");
    }
    return new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // Endpoint de Escaneamento OCR de Lista de CNHs (PDF ou Imagem)
  app.post("/api/ocr/cnh-list", async (req, res) => {
    try {
      const { fileData, mimeType, fileName } = req.body;

      if (!fileData || !mimeType) {
        return res.status(400).json({
          success: false,
          error: "Dados do arquivo e tipo MIME são obrigatórios para o escaneamento OCR.",
        });
      }

      // Remover prefixo data URL se enviado (ex: data:image/png;base64,...)
      let cleanBase64 = fileData;
      if (cleanBase64.includes(",")) {
        cleanBase64 = cleanBase64.split(",")[1];
      }

      const ai = getGeminiClient();

      const promptText = `Você é um perito em digitalização, OCR e conferência de relatórios, relações e documentos do DETRAN.
Analise com extrema precisão este documento (imagem ou PDF) contendo uma lista/tabela/relação/memorando de CNHs recebidas ou emitidas.

Objetivo:
Extraia todos os condutores/cidadãos listados no documento.

Regras de Extração:
1. 'nome': Nome completo da pessoa exatamente como consta no documento, em letras maiúsculas.
2. 'cpf': CPF do titular com 11 dígitos (formatado como 000.000.000-00 ou números). Se o documento não trouxer CPF para aquele registro, retorne string vazia "".
3. 'remessa': Número da remessa, memorando ou lote associado àquela linha, se houver (ex: "01/2026", "2026001", "12").
4. 'observacao': Qualquer observação adicional relevante que conste na linha ou cabeçalho daquele registro (ex: "2ª Via", "Renovação", "Definitiva", "Protocolo 12345").

Retorne a lista com TODOS os nomes identificados. Não omita nenhum nome presente na lista.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: promptText,
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "Lista de registros de condutores e CNHs extraídos do documento",
            items: {
              type: Type.OBJECT,
              properties: {
                nome: {
                  type: Type.STRING,
                  description: "Nome completo do condutor / titular",
                },
                cpf: {
                  type: Type.STRING,
                  description: "CPF do titular (ex: 000.000.000-00 ou 11 dígitos)",
                },
                remessa: {
                  type: Type.STRING,
                  description: "Número da remessa ou memorando se visível",
                },
                observacao: {
                  type: Type.STRING,
                  description: "Observações ou categoria anotada no documento",
                },
              },
              required: ["nome"],
            },
          },
        },
      });

      let rawText = response.text ? response.text.trim() : "[]";
      if (rawText.startsWith("```")) {
        rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      }

      let extractedItems: Array<{
        nome: string;
        cpf?: string;
        remessa?: string;
        observacao?: string;
      }> = [];

      try {
        extractedItems = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("Erro ao analisar JSON retornado pelo Gemini:", rawText);
        return res.status(500).json({
          success: false,
          error: "O modelo de IA não retornou os dados no formato esperado. Tente novamente com uma imagem ou PDF mais nítido.",
          raw: rawText,
        });
      }

      if (!Array.isArray(extractedItems)) {
        extractedItems = [];
      }

      // Sanitizar dados extraídos
      const sanitized = extractedItems
        .filter((item) => item && typeof item.nome === "string" && item.nome.trim().length > 1)
        .map((item) => ({
          nome: item.nome.trim().toUpperCase(),
          cpf: item.cpf ? item.cpf.trim() : "",
          remessa: item.remessa ? item.remessa.trim() : "",
          observacao: item.observacao ? item.observacao.trim() : "",
        }));

      return res.json({
        success: true,
        count: sanitized.length,
        items: sanitized,
        fileName: fileName || "documento",
      });
    } catch (err: any) {
      console.error("Erro no OCR com Gemini:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Erro ao processar o documento via OCR.",
      });
    }
  });

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

      const apiKey = process.env.WASENDER_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: "Chave de API do Wasender não configurada no servidor (WASENDER_API_KEY)."
        });
      }

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
