require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { getEntries, appendEntries, getProduct, upsertProduct } = require('./sheets');

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Entries ────────────────────────────────────────────────────────────────────
app.get('/api/entries', async (_req, res) => {
  try {
    res.json(await getEntries());
  } catch (err) {
    console.error('GET /api/entries', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/entries', async (req, res) => {
  const { entries } = req.body ?? {};
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'body must contain a non-empty entries array' });
  }
  try {
    await appendEntries(entries);
    res.json({ ok: true, count: entries.length });
  } catch (err) {
    console.error('POST /api/entries', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Products ───────────────────────────────────────────────────────────────────
app.get('/api/products/:barcode', async (req, res) => {
  try {
    const name = await getProduct(req.params.barcode);
    if (!name) return res.status(404).json({ found: false });
    res.json({ found: true, name });
  } catch (err) {
    console.error('GET /api/products', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const { barcode, name } = req.body ?? {};
  if (!barcode || !name) {
    return res.status(400).json({ error: 'barcode and name are required' });
  }
  try {
    await upsertProduct(barcode, name);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/products', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Inventory API listening on port ${PORT}`));
