// TURTI — серверный каталог для безопасного расчёта оплаты.
// Цены дублируют текущий index.html. Клиентская сумма никогда не считается доверенной.

export const PRODUCT_PRICES = {
  "flax-black": { name: "Чёрный лён", prices: { 250: 349, 450: 590, 1000: 1190 } },
  "flax-seeds": { name: "Чёрный лён с семечками", prices: { 250: 379, 450: 650, 1000: 1290 } },
  "flax-white": { name: "Белый лён", prices: { 250: 349, 450: 590, 1000: 1190 } },
  "flax-mix": { name: "Ассорти со льном", prices: { 250: 399, 450: 690, 1000: 1390 } },
  "peanut": { name: "Арахисовый", prices: { 250: 379, 450: 690, 1000: 1390 } },
  "pistachio": { name: "Фисташковый", prices: { 250: 1490, 450: 2590, 1000: 5490 } },
  "almond": { name: "Миндальный", prices: { 250: 449, 450: 790, 1000: 1590 } },
  "cashew": { name: "Кешью", prices: { 250: 699, 450: 1199, 1000: 2390 } },
  "almond-cashew": { name: "Миндаль с кешью", prices: { 250: 549, 450: 950, 1000: 1890 } },
  "three-nuts": { name: "Три ореха", prices: { 250: 549, 450: 950, 1000: 1890 } },
  "hazelnut": { name: "Фундук", prices: { 250: 749, 450: 1290, 1000: 2590 } },
  "hazelnut-cocoa": { name: "Фундук Какао-бобы", prices: { 250: 799, 450: 1390, 1000: 2790 } },
  "walnut": { name: "Грецкий орех", prices: { 250: 629, 450: 1090, 1000: 2190 } },
  "sesame": { name: "Кунжут", prices: { 250: 399, 450: 690, 1000: 1390 } },
  "hemp": { name: "Конопля", prices: { 250: 449, 450: 790, 1000: 1590 } },
  "thistle": { name: "Расторопша", prices: { 250: 349, 450: 590, 1000: 1190 } }
};

export const COLLECTION_PRICES = {
  "col-intro": { name: "Первое знакомство", price: 1490 },
  "col-fav": { name: "Любимые вкусы", price: 2390 },
  "col-nuts": { name: "Ореховая коллекция", price: 1890 },
  "col-nature": { name: "Сила природы", price: 1690 },
  "col-full": { name: "Коллекция TURTI", price: 3490 }
};

export function priceItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("EMPTY_CART");
  if (items.length > 30) throw new Error("TOO_MANY_LINES");

  let total = 0;
  const lines = items.map((row) => {
    const key = String(row?.key || "");
    const qty = Number(row?.qty || 0);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw new Error("BAD_QTY");

    if (key.startsWith("col-")) {
      const c = COLLECTION_PRICES[key];
      if (!c) throw new Error("UNKNOWN_ITEM");
      const sum = c.price * qty;
      total += sum;
      return { key, qty, label: `Набор «${c.name}»`, unitPrice: c.price, sum };
    }

    const [id, sizeRaw] = key.split("|");
    const size = Number(sizeRaw);
    const p = PRODUCT_PRICES[id];
    const unitPrice = p?.prices?.[size];
    if (!p || !unitPrice) throw new Error("UNKNOWN_ITEM");
    const sum = unitPrice * qty;
    total += sum;
    return { key, qty, label: `${p.name} ${size === 1000 ? "1 кг" : size + " г"}`, unitPrice, sum };
  });

  return { lines, total };
}
