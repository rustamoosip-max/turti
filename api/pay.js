import crypto from "node:crypto";
import { priceItems } from "../lib/catalog.js";
import { quoteDelivery } from "../lib/delivery.js";

function clean(v, max = 250) { return String(v || "").trim().slice(0, max); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const data = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      return res.status(503).json({ ok: false, code: "PAY_NOT_CONNECTED", error: "Онлайн-оплата пока не подключена." });
    }

    const priced = priceItems(data.items);
    const quote = await quoteDelivery({
      method: data.method,
      city: data.city,
      address: data.address,
      package: data.package
    });

    const total = priced.total + Number(quote.cost || 0);
    if (!(total > 0)) throw new Error("BAD_TOTAL");

    const orderId = `TURTI-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const idempotenceKey = crypto.randomUUID();
    const siteUrl = clean(process.env.PUBLIC_SITE_URL || "https://turti-compani.vercel.app", 200).replace(/\/$/, "");

    const receiptItems = priced.lines.map(line => ({
      description: line.label.slice(0, 128),
      quantity: String(line.qty),
      amount: { value: line.unitPrice.toFixed(2), currency: "RUB" },
      vat_code: 1,
      payment_mode: "full_payment",
      payment_subject: "commodity"
    }));
    if (quote.cost > 0) {
      receiptItems.push({
        description: "Доставка TURTI",
        quantity: "1",
        amount: { value: Number(quote.cost).toFixed(2), currency: "RUB" },
        vat_code: 1,
        payment_mode: "full_payment",
        payment_subject: "service"
      });
    }

    const body = {
      amount: { value: total.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: `${siteUrl}/?payment=return&order=${encodeURIComponent(orderId)}` },
      description: `Заказ ${orderId} — TURTI`,
      metadata: {
        order_id: orderId,
        delivery_method: data.method,
        delivery_city: clean(data.city, 100),
        delivery_cost: String(quote.cost || 0),
        delivery_provider: quote.provider || ""
      },
      receipt: {
        customer: {
          email: clean(data.email, 160) || undefined,
          phone: clean(data.phone, 30) || undefined
        },
        items: receiptItems
      }
    };
    if (!body.receipt.customer.email && !body.receipt.customer.phone) delete body.receipt;

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    const r = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": idempotenceKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const text = await r.text();
    let out = {};
    try { out = JSON.parse(text || "{}"); } catch (_) {}
    if (!r.ok) return res.status(502).json({ ok: false, code: "YOOKASSA_ERROR", error: out.description || "ЮKassa не создала оплату." });

    const paymentUrl = out.confirmation?.confirmation_url;
    if (!paymentUrl) return res.status(502).json({ ok: false, code: "YOOKASSA_NO_URL", error: "Не получена ссылка на оплату." });

    return res.status(200).json({
      ok: true,
      orderId,
      paymentId: out.id,
      paymentUrl,
      goods: priced.total,
      delivery: Number(quote.cost || 0),
      total,
      deliveryQuote: quote
    });
  } catch (e) {
    const code = String(e?.message || "PAY_ERROR");
    return res.status(400).json({ ok: false, code, error: "Не удалось подготовить оплату. Проверьте данные заказа и доставки." });
  }
}
