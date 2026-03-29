export async function ocr(b64, mt) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system:
          'Receipt parser. Return ONLY valid JSON: {"amount":number_or_null,"merchant":"string","date":"MM/DD"}. amount=total KRW integer. merchant=Korean store name or "알 수 없음". date=MM/DD or null.',
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
              { type: "text", text: "총 결제금액, 가맹점명, 결제일자 추출" },
            ],
          },
        ],
      }),
    });
    const d = await r.json();
    const t = d.content?.find((b) => b.type === "text")?.text || "{}";
    return JSON.parse(t.replace(/```json|```/g, "").trim());
  } catch {
    return { amount: null, merchant: "알 수 없음", date: null };
  }
}
