from pathlib import Path


def replace_optional(text, old, new):
    return text.replace(old, new)


idx = Path("index.html")
text = idx.read_text(encoding="utf-8")

# 12 visible flavors after Rustam's requested cleanup.
text = replace_optional(text, "16 вкусов, доставка по России.", "12 вкусов, доставка по России.")
text = replace_optional(text, "16 вкусов.</p>", "12 вкусов.</p>")
text = replace_optional(text, "Все урбечи · 16 вкусов →", "Все урбечи · 12 вкусов →")
text = replace_optional(text, '<span class="eyebrow">16 вкусов</span>', '<span class="eyebrow">12 вкусов</span>')

# Rename, do not redesign the product.
text = replace_optional(text, "Ассорти три ореха", "Три ореха")

old_hits = 'const HITS = ["hazelnut-cocoa", "almond", "peanut", "pistachio", "cashew"];'
new_hits = '''const HITS = ["hazelnut-cocoa", "almond", "peanut", "cashew"];
    const HIDDEN_PRODUCTS = new Set(["flax-seeds", "thistle", "pistachio", "walnut"]);
    const ACTIVE_COLLECTION_IDS = new Set(["col-intro", "col-nuts"]);'''
if old_hits in text:
    text = text.replace(old_hits, new_hits)
elif "const HIDDEN_PRODUCTS" not in text:
    raise SystemExit("HITS anchor not found; refusing unsafe edit")

text = replace_optional(
    text,
    'const CAT_NUTS = ["hazelnut-cocoa","pistachio","almond","cashew","peanut","hazelnut","walnut","almond-cashew","three-nuts"];',
    'const CAT_NUTS = ["hazelnut-cocoa","almond","cashew","peanut","hazelnut","almond-cashew","three-nuts"];',
)
text = replace_optional(
    text,
    'const CAT_SEEDS = ["sesame","hemp","flax-black","flax-white","flax-seeds","flax-mix","thistle"];',
    'const CAT_SEEDS = ["sesame","hemp","flax-black","flax-white","flax-mix"];',
)

# Only show sets that consist entirely of currently sold flavors.
text = replace_optional(
    text,
    'Object.entries(COLLECTIONS).map(([cid, c]) => `',
    'Object.entries(COLLECTIONS).filter(([cid]) => ACTIVE_COLLECTION_IDS.has(cid)).map(([cid, c]) => `',
)

# Similar products, wholesale selector and search also respect the active catalog.
text = replace_optional(
    text,
    'Object.keys(PRODUCTS).filter(x => x !== id && PRODUCTS[x].group === p.group).slice(0, 3);',
    'Object.keys(PRODUCTS).filter(x => x !== id && !HIDDEN_PRODUCTS.has(x) && PRODUCTS[x].group === p.group).slice(0, 3);',
)
text = replace_optional(
    text,
    '${Object.keys(PRODUCTS).map(id => `',
    '${Object.keys(PRODUCTS).filter(id => !HIDDEN_PRODUCTS.has(id)).map(id => `',
)
text = replace_optional(
    text,
    '''const found = Object.keys(PRODUCTS).filter(id =>
        !query || PRODUCTS[id].name.toLowerCase().includes(query) || PRODUCTS[id].ing.toLowerCase().includes(query)
      );''',
    '''const found = Object.keys(PRODUCTS).filter(id => !HIDDEN_PRODUCTS.has(id)).filter(id =>
        !query || PRODUCTS[id].name.toLowerCase().includes(query) || PRODUCTS[id].ing.toLowerCase().includes(query)
      );''',
)
text = replace_optional(text, '«миндаль», «лён», «фисташка»', '«миндаль», «лён», «кешью»')

# Old browser carts should not keep removed standalone flavors or hidden sets visible.
old_get_cart = 'function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; } }'
new_get_cart = '''function getCart() {
      try {
        const c = JSON.parse(localStorage.getItem(CART_KEY)) || {};
        Object.keys(c).forEach(k => {
          if (k.startsWith("col-") && !ACTIVE_COLLECTION_IDS.has(k)) delete c[k];
          else if (!k.startsWith("col-") && HIDDEN_PRODUCTS.has(k.split("|")[0])) delete c[k];
        });
        return c;
      } catch (e) { return {}; }
    }'''
text = replace_optional(text, old_get_cart, new_get_cart)

# 25+ years positioning. Also remove old wording if it exists in another active revision.
for old, new in [
    ("40+ лет", "25+ лет"),
    ("40 лет", "25+ лет"),
    ("сорока лет", "25 лет"),
    ("Сорока лет", "25 лет"),
]:
    text = text.replace(old, new)

text = replace_optional(
    text,
    '<div><strong>Камень</strong><span>ручной помол</span></div>',
    '<div><strong>25+</strong><span>лет опыта</span></div>',
)
old_story = "Высоко в горах Дагестана стоит наша мельница. Больше века горная река вращает каменные жернова — медленно, без нагрева, перетирая орех в живую пасту."
new_story = "Уже более 25 лет мы занимаемся урбечом в Дагестане. Высоко в горах стоит наша мельница, где горная река вращает каменные жернова — медленно, без нагрева, перетирая орех в живую пасту."
text = replace_optional(text, old_story, new_story)

required = [
    'const HIDDEN_PRODUCTS = new Set(["flax-seeds", "thistle", "pistachio", "walnut"]);',
    'name: "Три ореха"',
    'Все урбечи · 12 вкусов →',
    '<strong>25+</strong><span>лет опыта</span>',
]
missing = [x for x in required if x not in text]
if missing:
    raise SystemExit("Safety checks failed: " + repr(missing))

idx.write_text(text, encoding="utf-8")

# About page.
about = Path("about.html")
if about.exists():
    a = about.read_text(encoding="utf-8")
    for old, new in [
        ("40+ лет", "25+ лет"),
        ("40 лет", "25+ лет"),
        ("сорока лет", "25 лет"),
        ("25 лет производства", "25+ лет производства"),
    ]:
        a = a.replace(old, new)
    about.write_text(a, encoding="utf-8")

# Keep payment/server naming aligned with the storefront.
cat = Path("lib/catalog.js")
if cat.exists():
    c = cat.read_text(encoding="utf-8").replace("Ассорти три ореха", "Три ореха")
    cat.write_text(c, encoding="utf-8")

print("TURTI content refresh applied safely")
