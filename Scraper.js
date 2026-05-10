/**
 * Kaihōua — NZ Supermarket Price Scraper
 * ────────────────────────────────────────────────────────
 * Fetches product prices from Woolworths NZ, Pak'nSave and
 * New World using their internal JSON APIs (same endpoints
 * their own websites use).
 *
 * Usage:
 *   node scraper.js --query "milk"
 *   node scraper.js --category dairy-eggs-fridge --pages 5
 *   node scraper.js --full   (scrapes all category pages)
 *
 * Requirements:
 *   npm install node-fetch@2 fs-extra
 *
 * Output:
 *   ./data/products.json   — merged & matched product list
 *   ./data/pak.json        — raw Pak'nSave results
 *   ./data/wool.json       — raw Woolworths results
 *   ./data/newworld.json   — raw New World results
 */

const fetch   = require('node-fetch');
const fs      = require('fs-extra');
const path    = require('path');

// ── CONFIG ──────────────────────────────────────────────
const CONFIG = {
  // Wellington stores — change these to your nearest store IDs
  // Find store IDs by visiting the supermarket site, selecting a store,
  // and watching the network request in DevTools for the storeId param.
  PAK_STORE:  'e3f6e4ba-04da-4f4a-b5e0-e61edce7e73e',  // Pak'nSave Kilbirnie
  WOOL_STORE: '4705',                                    // Woolworths Wellington City
  NW_STORE:   'dc4d7c3c-28a7-4e0a-9b74-bf7800fffe6f',  // New World Mt Victoria

  PAGE_SIZE: 48,
  DELAY_MS:  800,   // polite delay between requests
  OUTPUT:    './data',

  // Full category slugs to crawl for --full mode
  CATEGORIES: [
    'dairy-eggs-fridge',
    'bread-bakery',
    'meat-poultry-seafood',
    'fruit-vegetables',
    'pantry',
    'frozen',
    'drinks',
    'health-beauty',
    'household-pet',
    'baby',
  ],

  // User-agent to send (mimics a real browser)
  UA: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// ── UTILS ────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg) { console.log(`[${new Date().toISOString().substring(11,19)}] ${msg}`); }

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':      CONFIG.UA,
        'Accept':          'application/json',
        'x-requested-with':'XMLHttpRequest',
        ...opts.headers,
      },
      timeout: 15000,
      ...opts,
    });
    if (!res.ok) {
      log(`WARN ${res.status} for ${url.substring(0, 80)}…`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log(`ERR ${e.message} fetching ${url.substring(0, 80)}…`);
    return null;
  }
}

// ── WOOLWORTHS NZ ────────────────────────────────────────
/**
 * Woolworths NZ uses a public-ish search API:
 * GET /apis/ui/Search/products?searchTerm=TERM&storeId=ID&pageSize=N&page=N
 *
 * For category browsing:
 * GET /apis/ui/browse/category?categoryId=ID&storeId=ID&pageSize=N&page=N
 *
 * Find categoryId values by visiting woolworths.co.nz and watching network.
 */
async function fetchWoolworths(term, page = 1, pageSize = CONFIG.PAGE_SIZE) {
  const url = `https://www.woolworths.co.nz/apis/ui/Search/products?` +
    `searchTerm=${encodeURIComponent(term)}&pageSize=${pageSize}&page=${page}&storeId=${CONFIG.WOOL_STORE}`;

  log(`Woolworths: "${term}" page ${page}`);
  const data = await safeFetch(url);
  if (!data) return { items: [], total: 0 };

  const items = (data?.products?.items || []).map(p => ({
    source:    'woolworths',
    id:        String(p.sku || p.productId || ''),
    barcode:   String(p.barcode || ''),
    name:      p.name || p.displayName || '',
    brand:     p.brand || '',
    category:  (p.categories?.[0]?.name || '').toLowerCase(),
    image:     p.images?.[0]?.small || p.images?.[0]?.medium || '',
    price:     p.price?.originalPrice ?? p.price?.salePrice ?? null,
    salePrice: p.price?.salePrice ?? null,
    wasPrice:  p.price?.originalPrice ?? null,
    onSpecial: p.price?.isSpecial ?? false,
    saveAmount:p.price?.savePrice ?? null,
    unitPrice: p.size?.cupPrice ? `$${p.size.cupPrice}/${p.size.cupMeasure}` : '',
    size:      p.size?.volumeSize || '',
    inStock:   p.stockLevel !== 0,
    url:       `https://www.woolworths.co.nz/shop/productdetails?stockcode=${p.sku}`,
  }));

  return { items, total: data?.products?.totalItems || items.length };
}

// ── PAK'NSAVE (Foodstuffs North Island) ─────────────────
/**
 * Pak'nSave uses the Foodstuffs CommonApi:
 * GET /CommonApi/Store/GetProducts?storeId=ID&term=TERM&size=N&page=N
 *
 * The same API works for New World (different base URL + store ID).
 *
 * To find your local store ID:
 * 1. Go to paknsave.co.nz → "Select store"
 * 2. Open DevTools → Network
 * 3. Look for requests to /CommonApi/Store/ — storeId is in the URL or body
 */
async function fetchFoodstuffs(baseUrl, storeId, term, page = 1, pageSize = CONFIG.PAGE_SIZE) {
  const url = `${baseUrl}/CommonApi/Store/GetProducts?` +
    `storeId=${storeId}&term=${encodeURIComponent(term)}&size=${pageSize}&page=${page}`;

  const data = await safeFetch(url);
  if (!data) return { items: [], total: 0 };

  // Foodstuffs API returns different shapes depending on version — handle both
  const rawItems = data?.products || data?.SearchResults || data?.Products || [];
  const source   = baseUrl.includes('paknsave') ? 'paknsave' : 'newworld';

  const items = rawItems.map(p => ({
    source,
    id:        String(p.ProductId || p.Sku || p.Id || ''),
    barcode:   String(p.Barcode || ''),
    name:      [p.ProductBrand, p.ProductName].filter(Boolean).join(' ') || p.Name || '',
    brand:     p.ProductBrand || p.Brand || '',
    category:  (p.CategoryName || p.Category || '').toLowerCase(),
    image:     p.ProductImage || (p.Images || [])[0] || '',
    price:     p.PricePerItem ?? p.Price ?? null,
    salePrice: p.PromotionPrice ?? p.SalePrice ?? null,
    wasPrice:  p.WasPrice ?? p.OriginalPrice ?? null,
    onSpecial: !!(p.IsOnPromotion || p.IsOnSpecial || (p.PromotionPrice && p.PromotionPrice < p.Price)),
    saveAmount:p.Savings ?? null,
    unitPrice: p.UnitPrice || '',
    size:      p.PackageSize || p.Size || '',
    inStock:   p.InStock !== false,
    url:       `${baseUrl}/shop/product-details/${p.ProductId}`,
  }));

  return { items, total: data?.TotalCount || data?.totalCount || items.length };
}

async function fetchPakNSave(term, page = 1) {
  log(`Pak'nSave: "${term}" page ${page}`);
  return fetchFoodstuffs('https://www.paknsave.co.nz', CONFIG.PAK_STORE, term, page);
}

async function fetchNewWorld(term, page = 1) {
  log(`New World: "${term}" page ${page}`);
  return fetchFoodstuffs('https://www.newworld.co.nz', CONFIG.NW_STORE, term, page);
}

// ── MULTI-PAGE FETCH ─────────────────────────────────────
async function fetchAllPages(fetchFn, term, maxPages = 5) {
  const all = [];
  let page = 1, total = Infinity;

  while (page <= maxPages && all.length < total) {
    const { items, total: t } = await fetchFn(term, page);
    if (!items.length) break;
    all.push(...items);
    total = t;
    page++;
    if (page <= maxPages && all.length < total) await sleep(CONFIG.DELAY_MS);
  }

  return all;
}

// ── PRODUCT MATCHING ─────────────────────────────────────
function normalise(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordSimilarity(a, b) {
  const wa = new Set(normalise(a).split(' ').filter(w => w.length > 2));
  const wb = new Set(normalise(b).split(' ').filter(w => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  wa.forEach(w => { if (wb.has(w)) inter++; });
  return inter / Math.max(wa.size, wb.size);
}

function matchProducts(pakList, woolList, nwList) {
  const matched = [];
  const usedWool = new Set();
  const usedNW   = new Set();

  for (const p of pakList) {
    const g = { name: p.name, brand: p.brand, category: p.category, pak: p, wool: null, nw: null };

    // 1) Barcode match (most reliable)
    if (p.barcode && p.barcode !== '0') {
      const wm = woolList.find(w => w.barcode === p.barcode && !usedWool.has(w.id));
      if (wm) { g.wool = wm; usedWool.add(wm.id); }
      const nm = nwList.find(n => n.barcode === p.barcode && !usedNW.has(n.id));
      if (nm) { g.nw = nm; usedNW.add(nm.id); }
    }

    // 2) Fuzzy name match
    if (!g.wool) {
      let best = null, bestScore = 0;
      for (const w of woolList) {
        if (usedWool.has(w.id)) continue;
        const s = wordSimilarity(p.name, w.name);
        if (s > bestScore && s >= 0.6) { bestScore = s; best = w; }
      }
      if (best) { g.wool = best; usedWool.add(best.id); }
    }
    if (!g.nw) {
      let best = null, bestScore = 0;
      for (const n of nwList) {
        if (usedNW.has(n.id)) continue;
        const s = wordSimilarity(p.name, n.name);
        if (s > bestScore && s >= 0.6) { bestScore = s; best = n; }
      }
      if (best) { g.nw = best; usedNW.add(best.id); }
    }

    matched.push(g);
  }

  // Unmatched Woolworths items
  for (const w of woolList) {
    if (usedWool.has(w.id)) continue;
    const g = { name: w.name, brand: w.brand, category: w.category, pak: null, wool: w, nw: null };
    const nm = nwList.find(n => !usedNW.has(n.id) && (
      (n.barcode && n.barcode === w.barcode) || wordSimilarity(n.name, w.name) >= 0.6
    ));
    if (nm) { g.nw = nm; usedNW.add(nm.id); }
    matched.push(g);
  }

  // Unmatched New World items
  for (const n of nwList) {
    if (!usedNW.has(n.id))
      matched.push({ name: n.name, brand: n.brand, category: n.category, pak: null, wool: null, nw: n });
  }

  return matched;
}

// ── CLI MAIN ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const query    = args.includes('--query')    ? args[args.indexOf('--query') + 1]    : null;
  const category = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
  const fullMode = args.includes('--full');
  const pages    = args.includes('--pages')    ? parseInt(args[args.indexOf('--pages') + 1]) : 3;

  if (!query && !category && !fullMode) {
    console.log('Usage:');
    console.log('  node scraper.js --query "milk"');
    console.log('  node scraper.js --category dairy-eggs-fridge --pages 5');
    console.log('  node scraper.js --full');
    process.exit(0);
  }

  await fs.ensureDir(CONFIG.OUTPUT);

  const terms = fullMode ? CONFIG.CATEGORIES
              : category  ? [category]
              : [query];

  let allPak = [], allWool = [], allNW = [];

  for (const term of terms) {
    log(`\n── Fetching: "${term}" ──`);

    const [pakRes, woolRes, nwRes] = await Promise.allSettled([
      fetchAllPages(fetchPakNSave,                              term, pages),
      fetchAllPages(fetchWoolworths,                            term, pages),
      fetchAllPages((t, p) => fetchNewWorld(t, p),             term, pages),
    ]);

    const pak  = pakRes.status  === 'fulfilled' ? pakRes.value  : [];
    const wool = woolRes.status === 'fulfilled' ? woolRes.value : [];
    const nw   = nwRes.status   === 'fulfilled' ? nwRes.value   : [];

    log(`  Pak'nSave: ${pak.length} | Woolworths: ${wool.length} | New World: ${nw.length}`);

    allPak  = [...allPak,  ...pak];
    allWool = [...allWool, ...wool];
    allNW   = [...allNW,   ...nw];

    if (terms.length > 1) await sleep(CONFIG.DELAY_MS * 2);
  }

  // Deduplicate by ID within each store
  const dedup = arr => {
    const seen = new Set();
    return arr.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  };
  allPak  = dedup(allPak);
  allWool = dedup(allWool);
  allNW   = dedup(allNW);

  log(`\n── Matching products across stores ──`);
  const matched = matchProducts(allPak, allWool, allNW);
  log(`Matched ${matched.length} product groups`);

  // Stats
  const withAllThree  = matched.filter(g => g.pak && g.wool && g.nw).length;
  const withTwoStores = matched.filter(g => [g.pak, g.wool, g.nw].filter(Boolean).length === 2).length;
  const specials      = matched.filter(g => g.pak?.onSpecial || g.wool?.onSpecial || g.nw?.onSpecial).length;
  log(`All 3 stores: ${withAllThree} | 2 stores: ${withTwoStores} | On special: ${specials}`);

  // Write output
  await fs.writeJson(path.join(CONFIG.OUTPUT, 'pak.json'),      allPak,   { spaces: 2 });
  await fs.writeJson(path.join(CONFIG.OUTPUT, 'woolworths.json'),allWool, { spaces: 2 });
  await fs.writeJson(path.join(CONFIG.OUTPUT, 'newworld.json'), allNW,    { spaces: 2 });
  await fs.writeJson(path.join(CONFIG.OUTPUT, 'products.json'), matched,  { spaces: 2 });

  log(`\n── Output written to ${CONFIG.OUTPUT}/ ──`);
  log(`pak.json: ${allPak.length} products`);
  log(`woolworths.json: ${allWool.length} products`);
  log(`newworld.json: ${allNW.length} products`);
  log(`products.json: ${matched.length} matched groups`);
}

main().catch(e => { console.error(e); process.exit(1); });