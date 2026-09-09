import { cdekPvz } from "../lib/delivery.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const provider = String(req.query?.provider || "cdek").toLowerCase();
    const city = String(req.query?.city || "").trim();
    if (!city) return res.status(400).json({ ok: false, code: "CITY_REQUIRED", error: "Укажите город" });

    if (provider === "cdek") {
      const data = await cdekPvz(city);
      return res.status(200).json({ ok: true, provider: "cdek", city: data.city, points: data.points });
    }

    if (provider === "ozon") {
      return res.status(503).json({
        ok: false,
        code: "OZON_ONBOARDING_REQUIRED",
        error: "Ozon ПВЗ подключим после получения интеграционного доступа Ozon для TURTI."
      });
    }

    return res.status(400).json({ ok: false, code: "BAD_PROVIDER", error: "Неизвестная служба доставки" });
  } catch (e) {
    const code = String(e?.message || "PVZ_ERROR");
    const status = code.includes("NOT_CONFIGURED") || code.includes("REQUIRED") ? 503 : 400;
    return res.status(status).json({ ok: false, code, error: "Не удалось получить пункты выдачи." });
  }
}
