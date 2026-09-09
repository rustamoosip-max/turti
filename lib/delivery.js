// TURTI — серверный слой доставки.
// Никаких секретов в браузере: ключи берём только из Vercel Environment Variables.

const CDEK_API = "https://api.cdek.ru/v2";
const YANDEX_API = "https://b2b.taxi.yandex.net";

function cleanText(v, max = 220) {
  return String(v || "").trim().slice(0, max);
}

export function isMakhachkala(city) {
  const c = cleanText(city).toLowerCase().replace(/^г\.?\s*/, "");
  return c === "махачкала" || c.startsWith("махачкала,");
}

export function validatePackage(pkg) {
  const p = {
    weightKg: Number(pkg?.weightKg),
    lengthCm: Number(pkg?.lengthCm),
    widthCm: Number(pkg?.widthCm),
    heightCm: Number(pkg?.heightCm)
  };
  if (!(p.weightKg > 0 && p.weightKg <= 30)) throw new Error("PACKAGE_WEIGHT_REQUIRED");
  for (const k of ["lengthCm", "widthCm", "heightCm"]) {
    if (!(p[k] > 0 && p[k] <= 150)) throw new Error("PACKAGE_DIMS_REQUIRED");
  }
  return p;
}

async function jsonOrError(r, provider) {
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text.slice(0, 500) }; }
  if (!r.ok) {
    const err = new Error(`${provider}_HTTP_${r.status}`);
    err.provider = provider;
    err.detail = data;
    throw err;
  }
  return data;
}

async function cdekToken() {
  const id = process.env.CDEK_CLIENT_ID;
  const secret = process.env.CDEK_CLIENT_SECRET;
  if (!id || !secret) throw new Error("CDEK_NOT_CONFIGURED");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret
  });
  const r = await fetch(`${CDEK_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const d = await jsonOrError(r, "CDEK_AUTH");
  if (!d.access_token) throw new Error("CDEK_AUTH_FAILED");
  return d.access_token;
}

async function cdekCityCode(token, city) {
  const q = encodeURIComponent(cleanText(city, 100));
  const r = await fetch(`${CDEK_API}/location/cities?country_codes=RU&city=${q}&size=20`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const list = await jsonOrError(r, "CDEK_CITY");
  if (!Array.isArray(list) || !list.length) throw new Error("CDEK_CITY_NOT_FOUND");
  const target = cleanText(city).toLowerCase();
  const exact = list.find(x => String(x.city || "").toLowerCase() === target);
  const found = exact || list[0];
  return { code: found.code, city: found.city, region: found.region, countryCode: found.country_code || "RU" };
}

export async function cdekPvz(city) {
  const token = await cdekToken();
  const loc = await cdekCityCode(token, city);
  const r = await fetch(`${CDEK_API}/deliverypoints?city_code=${encodeURIComponent(loc.code)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const list = await jsonOrError(r, "CDEK_PVZ");
  const points = (Array.isArray(list) ? list : []).map(p => ({
    provider: "cdek",
    code: p.code,
    name: p.name || p.code,
    address: p.location?.address_full || p.location?.address || "",
    lat: Number(p.location?.latitude),
    lon: Number(p.location?.longitude),
    worktime: p.work_time || "",
    type: p.type || "PVZ"
  })).filter(p => p.code && p.address);
  return { city: loc, points };
}

function chooseCdekTariff(tariffs, method) {
  const allowedModes = method === "cdek_pvz" ? new Set([2, 4]) : new Set([1, 3]);
  const candidates = (Array.isArray(tariffs) ? tariffs : [])
    .filter(t => allowedModes.has(Number(t.delivery_mode)) && Number(t.delivery_sum) >= 0)
    .sort((a, b) => Number(a.delivery_sum) - Number(b.delivery_sum));
  if (!candidates.length) throw new Error("CDEK_TARIFF_NOT_FOUND");
  return candidates[0];
}

export async function cdekQuote({ method, city, package: packageInput }) {
  if (!cleanText(city)) throw new Error("CITY_REQUIRED");
  const pkg = validatePackage(packageInput);
  const token = await cdekToken();
  const fromCode = process.env.CDEK_FROM_CITY_CODE
    ? Number(process.env.CDEK_FROM_CITY_CODE)
    : (await cdekCityCode(token, process.env.TURTI_PICKUP_CITY || "Махачкала")).code;
  const to = await cdekCityCode(token, city);

  const r = await fetch(`${CDEK_API}/calculator/tarifflist`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: 1,
      currency: 1,
      from_location: { code: fromCode },
      to_location: { code: to.code },
      packages: [{
        weight: Math.ceil(pkg.weightKg * 1000),
        length: Math.ceil(pkg.lengthCm),
        width: Math.ceil(pkg.widthCm),
        height: Math.ceil(pkg.heightCm)
      }]
    })
  });
  const d = await jsonOrError(r, "CDEK_QUOTE");
  const tariff = chooseCdekTariff(d.tariff_codes, method);
  return {
    ok: true,
    provider: "cdek",
    method,
    cost: Math.ceil(Number(tariff.delivery_sum)),
    currency: "RUB",
    tariffCode: tariff.tariff_code,
    tariffName: tariff.tariff_name,
    deliveryMode: Number(tariff.delivery_mode),
    periodMin: tariff.period_min ?? null,
    periodMax: tariff.period_max ?? null,
    cityCode: to.code,
    sellerHandoff: Number(tariff.delivery_mode) === 4 || Number(tariff.delivery_mode) === 3 ? "dropoff" : "courier_pickup"
  };
}

export async function yandexQuote({ city, address, package: packageInput }) {
  if (!isMakhachkala(city)) throw new Error("YANDEX_LOCAL_ONLY");
  const destination = cleanText(address);
  if (!destination) throw new Error("ADDRESS_REQUIRED");
  const pickup = cleanText(process.env.TURTI_PICKUP_ADDRESS);
  const token = process.env.YANDEX_DELIVERY_TOKEN;
  if (!pickup) throw new Error("TURTI_PICKUP_ADDRESS_REQUIRED");
  if (!token) throw new Error("YANDEX_NOT_CONFIGURED");
  const pkg = validatePackage(packageInput);

  const r = await fetch(`${YANDEX_API}/b2b/cargo/integration/v2/check-price`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "ru",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      items: [{
        size: {
          length: pkg.lengthCm / 100,
          width: pkg.widthCm / 100,
          height: pkg.heightCm / 100
        },
        weight: pkg.weightKg,
        quantity: 1,
        pickup_point: 1,
        dropoff_point: 2,
        age_restricted: false
      }],
      route_points: [
        { id: 1, fullname: pickup, country: "Россия", city: "Махачкала" },
        { id: 2, fullname: destination, country: "Россия", city: "Махачкала" }
      ],
      requirements: { taxi_class: "courier" },
      skip_door_to_door: false
    })
  });
  const d = await jsonOrError(r, "YANDEX_QUOTE");
  const cost = Number(d.price);
  if (!Number.isFinite(cost) || cost < 0) throw new Error("YANDEX_BAD_PRICE");
  return {
    ok: true,
    provider: "yandex",
    method: "yandex",
    cost: Math.ceil(cost),
    currency: d.currency_rules?.code || "RUB",
    etaMinutes: Number(d.eta) || null,
    distanceMeters: Number(d.distance_meters) || null
  };
}

export async function quoteDelivery(input = {}) {
  const method = cleanText(input.method, 40);
  const city = cleanText(input.city, 100);

  if (method === "pickup") {
    if (!isMakhachkala(city)) throw new Error("PICKUP_MAKHACHKALA_ONLY");
    return { ok: true, provider: "turti", method: "pickup", cost: 0, currency: "RUB", label: "Самовывоз TURTI" };
  }
  if (method === "yandex") return yandexQuote(input);
  if (method === "cdek_pvz" || method === "cdek_courier") return cdekQuote(input);
  if (method === "ozon") {
    const err = new Error("OZON_ONBOARDING_REQUIRED");
    err.publicMessage = "Ozon Доставка будет включена после подключения TURTI к Ozon Pay / Ozon Доставке и получения интеграционных данных.";
    throw err;
  }
  throw new Error("DELIVERY_METHOD_REQUIRED");
}
