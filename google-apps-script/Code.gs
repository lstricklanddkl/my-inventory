/**
 * Inventory Scanner — Google Apps Script receiver
 *
 * Setup:
 *   1. Open a Google Sheet, then Extensions → Apps Script
 *   2. Replace any existing code with this file
 *   3. Click Deploy → New deployment → Web App
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   4. Copy the /exec URL and paste it into the app Settings screen
 *
 * The script appends all entries on each sync.
 * Duplicate rows are fine for an audit trail; filter/pivot in Sheets as needed.
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    if (!Array.isArray(data.entries) || data.entries.length === 0) {
      return jsonResponse({ status: 'ok', count: 0 });
    }

    // Write header row if the sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Barcode', 'Product Name', 'Quantity', 'Timestamp', 'Synced At']);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    }

    const syncedAt = new Date().toISOString();
    const rows = data.entries.map(entry => [
      entry.barcode,
      entry.name,
      entry.qty,
      entry.timestamp,
      syncedAt,
    ]);

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);

    return jsonResponse({ status: 'ok', count: rows.length });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
