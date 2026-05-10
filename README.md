# Kaihōua — NZ Grocery Price Comparison

A working replica of Grocer.co.nz that fetches **live prices** from Woolworths NZ, Pak'nSave and New World using the same internal JSON APIs their own websites use.

---

## How it works

When you browse `woolworths.co.nz` or `paknsave.co.nz`, your browser makes calls to internal REST APIs that return JSON product data — prices, specials, unit prices, stock status. These are not officially public APIs, but they are unauthenticated and used by the websites themselves.

| Store | API endpoint |
|-------|-------------|
| Woolworths NZ | `woolworths.co.nz/apis/ui/Search/products?searchTerm=…&storeId=…` |
| Pak'nSave | `paknsave.co.nz/CommonApi/Store/GetProducts?storeId=…&term=…` |
| New World | `newworld.co.nz/CommonApi/Store/GetProducts?storeId=…&term=…` |

The product matching engine uses **barcode/EAN matching** first (most reliable), then falls back to **fuzzy word similarity** to link the same product across stores.

---

## Files

- `index.html` — Complete frontend app. Open directly in a browser. Uses `corsproxy.io` to bypass CORS restrictions so API calls work client-side.
- `scraper.js` — Node.js backend scraper. Runs on your machine or a server, saves results to JSON files.
- `README.md` — This file.

---

## Using the frontend (`index.html`)

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari)
2. Type a product name (e.g. "milk", "chicken breast", "baked beans") and press Search
3. Results are fetched live from all three stores and matched together

**Note:** The frontend uses `corsproxy.io` as a CORS proxy. For a production deployment, replace this with your own backend API (see scraper below).

---

## Using the backend scraper (`scraper.js`)

### Setup

```bash
mkdir kaihōua && cd kaihōua
npm init -y
npm install node-fetch@2 fs-extra
# Copy scraper.js into this folder
```

### Run

```bash
# Search for a specific product
node scraper.js --query "milk"

# Scrape a full category (3 pages per store = ~150 products)
node scraper.js --category dairy-eggs-fridge --pages 3

# Full crawl of all categories (takes ~5-10 minutes, be polite!)
node scraper.js --full
```

### Output

Results are saved to `./data/`:
- `pak.json` — raw Pak'nSave products
- `woolworths.json` — raw Woolworths products
- `newworld.json` — raw New World products
- `products.json` — matched & merged product groups (the main output)

---

## Finding your local store IDs

The default store IDs are Wellington-area stores. To use your local stores:

1. Open the supermarket's website and select your store
2. Open DevTools (F12) → Network tab
3. Search for any product and look for requests to `/CommonApi/` or `/apis/ui/`
4. The `storeId` parameter in the URL is your store's ID
5. Update `CONFIG.PAK_STORE`, `CONFIG.WOOL_STORE`, `CONFIG.NW_STORE` in `scraper.js`

---

## Building a proper backend (production)

To avoid CORS proxies and rate limits, build a small API server:

```
┌─────────────┐        ┌──────────────────┐       ┌────────────────┐
│  Browser    │──────▶ │  Your API server │──────▶│ Supermarket    │
│  index.html │◀────── │  (Node/Express)  │◀───── │ internal APIs  │
└─────────────┘        └──────────────────┘       └────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  PostgreSQL  │  (price history)
                        └──────────────┘
```

Suggested stack:
- **Node.js + Express** — API server
- **node-cron** — run scraper.js nightly at 2am
- **PostgreSQL or SQLite** — store price history
- **Vercel / Railway / Render** — free hosting tier

---

## Legal context

The Commerce Commission's 2022 *Market Study into the Retail Grocery Sector* specifically recommended that supermarkets "co-operate with existing or potential price comparison services in New Zealand." Grocer.co.nz has been operating since 2022 and supermarkets have not taken action against it.

This tool is for informational purposes. Prices may vary by store location. Always verify prices in-store.
