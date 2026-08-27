interface VercelRequest {
  method?: string;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => VercelResponse;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const isConfigured = !!process.env.WASENDER_API_KEY;
  return res.status(200).json({
    status: 'ok',
    wasenderConfigured: isConfigured,
    timestamp: new Date().toISOString()
  });
}
