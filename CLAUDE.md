# my-inventory

A barcode-scanning inventory app with Google Sheets as the primary data store.
Two deployable pieces: a static single-page web app and a small Node.js API.

---

## Repo structure

```
my-inventory/
├── docs/                        GitHub Pages static site
│   └── index.html               Complete single-file web app (no build step)
├── api/                         Node.js/Express API service
│   ├── index.js                 Express server — route definitions
│   ├── sheets.js                All Google Sheets API logic
│   ├── package.json
│   └── .env.example             Template for required environment variables
├── google-apps-script/
│   └── Code.gs                  Legacy fallback — paste into Google Apps Script
│                                editor if not using the Node.js API
└── .gitignore                   Excludes api/node_modules and api/.env
```

---

## How the pieces connect

```
iPhone browser (docs/index.html)
        │
        │  JSON over HTTPS (full CORS)
        ▼
Node.js API (api/)               deployed on Render or similar
        │
        │  Google Sheets API v4 — service account auth
        ▼
Google Spreadsheet               two tabs: Inventory, Products
```

The web app also falls back to **localStorage** when the API is unreachable,
and to the **Google Apps Script** URL (fire-and-forget) when no API URL is set.

---

## Web app (docs/index.html)

Intentionally a **single HTML file with no build step**. Do not introduce a
bundler, framework, or npm dependencies. All logic is vanilla JS in a `<script>`
tag at the bottom of the file.

### Runtime configuration (stored in localStorage)

| Key | Purpose |
|---|---|
| `inv_api_url` | Base URL of the deployed Node.js API |
| `inv_sheets_url` | Google Apps Script URL (fallback only) |
| `inv_products` | JSON object `{ barcode: name }` — local product cache |
| `inv_entries` | JSON array of inventory entries — local write-through cache |

### Product lookup chain (on each barcode scan)

1. `inv_products` in localStorage — fastest, no network
2. `GET /api/products/:barcode` — checks Sheets Products tab
3. Open Food Facts public API — `world.openfoodfacts.org`
4. Prompt the user to type the name manually

Once a name is found or entered it is written to both localStorage and
`POST /api/products` so it is cached in both places.

### Inventory save flow

Every save writes to localStorage immediately (so the UI never blocks), then
fires `POST /api/entries` + `POST /api/products` to the API in the background.
If the API call fails the entry is still in localStorage and can be pushed later.

### Sync / Refresh button (Inventory tab)

- **API URL configured**: button reads "Refresh" — calls `GET /api/entries`
  and re-renders from the live Sheet data
- **No API URL, Apps Script URL set**: button reads "Sync to Sheets" —
  fire-and-forget POST with `mode: no-cors`
- **Neither set**: redirects the user to Settings

---

## API (api/)

### Environment variables (copy .env.example → .env)

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_EMAIL` | `client_email` field in the service account JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` field — keep the `\n` escape sequences |
| `SPREADSHEET_ID` | From the Google Sheet URL: `.../spreadsheets/d/SPREADSHEET_ID/edit` |
| `ALLOWED_ORIGIN` | Optional — set to `https://yourname.github.io` in production |
| `PORT` | Defaults to 3000 |

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/entries` | All inventory rows from Sheets (tab: Inventory, A2:E) |
| POST | `/api/entries` | Append `{ entries: [...] }` to Sheets |
| GET | `/api/products/:barcode` | Look up product name (tab: Products, A2:B) |
| POST | `/api/products` | Upsert `{ barcode, name }` — updates in place or appends |

### Google Sheets tab structure

**Inventory** tab — columns A–E:
`ID | Barcode | Product Name | Quantity | Timestamp`

**Products** tab — columns A–B:
`Barcode | Product Name`

Headers are written automatically by `ensureHeaders()` on first write.
The service account must have **Editor** access to the spreadsheet.

### Running locally

```bash
cd api
cp .env.example .env        # fill in your credentials
npm install
npm run dev                 # uses node --watch
```

Test the health endpoint: `curl http://localhost:3000/health`

---

## Deployment

### GitHub Pages (docs/)

Push to GitHub. In the repo: **Settings → Pages → Branch: master,
Folder: /docs → Save**.

The site is served from `docs/index.html` with no build step.

### Render (api/)

1. Connect the GitHub repo to Render as a **Web Service**
2. Set **Root Directory** to `api`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add the four environment variables in the Render dashboard

The free tier spins down after inactivity — first request after idle takes
~30 seconds. Acceptable for a prototype; upgrade if it becomes annoying.

---

## Companion native app

A separate Expo (React Native) iOS app lives at `../inventory-scanner/`.
It shares the same Google Sheets backend via the same API.
It is not part of this repo.

---

## Key decisions to preserve

- **No build step for the web app.** The single-file approach makes GitHub Pages
  deployment trivial and removes all dependency management from the frontend.
- **localStorage as write-through cache.** Saves are never blocked by network.
  The API is best-effort; the local copy is always authoritative for writes.
- **Two Sheet tabs, not one.** Keeping product names in a separate Products tab
  means the Inventory tab is a clean append-only log with no deduplication logic.
- **Service account auth, not OAuth.** A service account key in env vars is
  simpler to deploy and doesn't require user consent flows for a single-owner app.
