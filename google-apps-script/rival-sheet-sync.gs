const SYNC_SECRET = 'mi-club-rival-sync-2026-7hG9K2pLQ4xN8mZ';
const SHEET_NAME = 'Hoja 1';
const TEAM_COLUMN = 3;
const PLAYER_COLUMN = 4;
const NUMBER_COLUMN = 5;
const TRAITS_COLUMN = 6;

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');

    if (payload.secret !== SYNC_SECRET) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (payload.action !== 'upsertTeamPlayers') {
      return jsonResponse({ ok: false, error: 'Unsupported action' }, 400);
    }

    const team = String(payload.team || '').trim();
    const players = Array.isArray(payload.players) ? payload.players : [];

    if (!team) {
      return jsonResponse({ ok: false, error: 'Missing team' }, 400);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME) || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const lastRow = Math.max(sheet.getLastRow(), 1);
    const lastColumn = Math.max(sheet.getLastColumn(), 6);
    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();

    const teamRows = [];
    for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (normalize(values[rowIndex][TEAM_COLUMN - 1]) === normalize(team)) {
        teamRows.push(rowIndex + 1);
      }
    }

    const normalizedPlayers = players
      .map((row) => ({
        fullName: String(row.fullName || '').trim(),
        number: String(row.number || '').trim(),
        traits: String(row.traits || '').trim(),
      }))
      .filter((row) => row.fullName || row.number || row.traits);

    if (teamRows.length === 0) {
      normalizedPlayers.forEach((row) => {
        sheet.appendRow(['', '', team, row.fullName, row.number, row.traits]);
      });

      return jsonResponse({ ok: true, team: team, updatedRows: normalizedPlayers.length, mode: 'append' }, 200);
    }

    const rowsToUse = Math.max(teamRows.length, normalizedPlayers.length);

    for (let index = 0; index < rowsToUse; index++) {
      const targetRow = teamRows[index];
      const player = normalizedPlayers[index] || { fullName: '', number: '', traits: '' };

      if (targetRow) {
        sheet.getRange(targetRow, TEAM_COLUMN).setValue(team);
        sheet.getRange(targetRow, PLAYER_COLUMN).setValue(player.fullName);
        sheet.getRange(targetRow, NUMBER_COLUMN).setValue(player.number);
        sheet.getRange(targetRow, TRAITS_COLUMN).setValue(player.traits);
      } else {
        sheet.appendRow(['', '', team, player.fullName, player.number, player.traits]);
      }
    }

    return jsonResponse({ ok: true, team: team, updatedRows: normalizedPlayers.length, mode: 'upsert' }, 200);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 500);
  }
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function jsonResponse(payload, status) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...payload, status: status }))
    .setMimeType(ContentService.MimeType.JSON);
}