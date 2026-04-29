const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const INV_RANGE   = 'Inventory!A:E';
const PROD_RANGE  = 'Products!A:B';
const INV_HEADERS  = [['ID', 'Barcode', 'Product Name', 'Quantity', 'Timestamp']];
const PROD_HEADERS = [['Barcode', 'Product Name']];

function buildClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function firstCell(client, range) {
  try {
    const res = await client.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    return res.data.values?.[0]?.[0] ?? null;
  } catch {
    return null;
  }
}

async function ensureHeaders(client) {
  const [invHeader, prodHeader] = await Promise.all([
    firstCell(client, 'Inventory!A1'),
    firstCell(client, 'Products!A1'),
  ]);
  const writes = [];
  if (!invHeader) {
    writes.push(client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Inventory!A1',
      valueInputOption: 'RAW',
      requestBody: { values: INV_HEADERS },
    }));
  }
  if (!prodHeader) {
    writes.push(client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A1',
      valueInputOption: 'RAW',
      requestBody: { values: PROD_HEADERS },
    }));
  }
  if (writes.length) await Promise.all(writes);
}

// ── Entries ────────────────────────────────────────────────────────────────────

async function getEntries() {
  const client = buildClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Inventory!A2:E',
  });
  return (res.data.values || []).map(([id, barcode, name, qty, timestamp]) => ({
    id,
    barcode,
    name,
    qty: Number(qty),
    timestamp,
  }));
}

async function appendEntries(entries) {
  const client = buildClient();
  await ensureHeaders(client);
  const rows = entries.map(e => [
    e.id ?? Date.now(),
    e.barcode,
    e.name,
    e.qty,
    e.timestamp ?? new Date().toISOString(),
  ]);
  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: INV_RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ── Products ───────────────────────────────────────────────────────────────────

async function getProduct(barcode) {
  const client = buildClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Products!A2:B',
  });
  const row = (res.data.values || []).find(r => r[0] === barcode);
  return row ? row[1] : null;
}

async function upsertProduct(barcode, name) {
  const client = buildClient();
  await ensureHeaders(client);

  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Products!A:A',
  });
  const column = (res.data.values || []).map(r => r[0]);
  const rowIndex = column.indexOf(barcode); // 0-based; row 0 is header

  if (rowIndex < 1) {
    // Not found (or found in header row) — append
    await client.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: PROD_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[barcode, name]] },
    });
  } else {
    // Update in place (rowIndex is 0-based, Sheets rows are 1-based)
    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Products!A${rowIndex + 1}:B${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[barcode, name]] },
    });
  }
}

module.exports = { getEntries, appendEntries, getProduct, upsertProduct };
