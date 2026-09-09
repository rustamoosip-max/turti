import { quoteDelivery } from "../lib/delivery.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const input = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const quote = await quoteDelivery(input);
    return res.status(200).json(quote);
  } catch (e) {
    const code = String(e?.message || "DELIVERY_ERROR");
    const status = code.includes("NOT_CONFIGURED") || code.includes("REQUIRED") ? 503 : 400;
    return res.status(status).json({
      ok: false,
      code,
      error: e?.publicMessage || "Не удалось рассчитать доставку. Проверьте город, адрес и настройки службы доставки.",
      provider: e?.provider || null
    });
  }
}
