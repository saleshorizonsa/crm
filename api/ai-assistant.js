// Vercel serverless proxy — keeps the API key server-side and avoids CORS.
export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[ai-assistant] VITE_ANTHROPIC_API_KEY is not set");
    return res.status(500).json({ error: "AI service not configured" });
  }

  const { system, messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: system || "",
        messages,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("[ai-assistant] Anthropic error:", upstream.status, data);
      return res.status(upstream.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("[ai-assistant] Fetch error:", err);
    return res.status(500).json({ error: "Failed to reach AI service" });
  }
}
