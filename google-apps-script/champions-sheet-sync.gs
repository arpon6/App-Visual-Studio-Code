const SYNC_SECRET = 'mi-club-champions-sync-2026-9tR3kQ7wZ1pL5xB';
const SHEET_NAME = 'Hoja 1';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');

    if (payload.secret !== SYNC_SECRET) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (payload.action !== 'setCell') {
      return jsonResponse({ ok: false, error: 'Unsupported action' }, 400);
    }

    const row = Number(payload.row);
    const col = Number(payload.col);
    const value = payload.value === undefined || payload.value === null ? '' : payload.value;

    if (!Number.isFinite(row) || row < 1 || !Number.isFinite(col) || col < 1) {
      return jsonResponse({ ok: false, error: 'Invalid row/col' }, 400);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME) || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    sheet.getRange(row, col).setValue(value);

    return jsonResponse({ ok: true, row: row, col: col }, 200);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 500);
  }
}

function jsonResponse(payload, status) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...payload, status: status }))
    .setMimeType(ContentService.MimeType.JSON);
}
