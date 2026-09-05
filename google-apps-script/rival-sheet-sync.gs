const SYNC_SECRET = 'mi-club-rival-sync-2026-7hG9K2pLQ4xN8mZ';
const SHEET_NAME = 'Hoja 1';
const TEAM_COLUMN = 3;
const SPECIFIC_POSITION_COLUMN = 2;
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
    const teamEntries = [];
    for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (normalize(values[rowIndex][TEAM_COLUMN - 1]) === normalize(team)) {
        const rowNumber = rowIndex + 1;
        const playerName = String(values[rowIndex][PLAYER_COLUMN - 1] || '').trim();
        const playerNumber = String(values[rowIndex][NUMBER_COLUMN - 1] || '').trim();

        teamRows.push(rowNumber);
        teamEntries.push({
          rowNumber: rowNumber,
          nameNorm: normalize(playerName),
          numberNorm: normalize(playerNumber),
        });
      }
    }

    const normalizedPlayers = players
      .map((row) => ({
        specificPosition: String(row.specificPosition || '').trim(),
        fullName: String(row.fullName || '').trim(),
        number: String(row.number || '').trim(),
        traits: String(row.traits || '').trim(),
      }))
      .filter((row) => row.specificPosition || row.fullName || row.number || row.traits);

    if (teamRows.length === 0) {
      normalizedPlayers.forEach((row) => {
        sheet.appendRow(['', row.specificPosition, team, row.fullName, row.number, row.traits]);
      });

      return jsonResponse({ ok: true, team: team, updatedRows: normalizedPlayers.length, mode: 'append' }, 200);
    }

    const usedRows = {};
    const rowsByNameAndNumber = {};
    const rowsByName = {};
    const rowsByNumber = {};
    const emptyRows = [];

    teamEntries.forEach((entry) => {
      const hasName = Boolean(entry.nameNorm);
      const hasNumber = Boolean(entry.numberNorm);

      if (hasName && hasNumber) {
        rowsByNameAndNumber[`${entry.nameNorm}__${entry.numberNorm}`] = entry.rowNumber;
      }
      if (hasName && !rowsByName[entry.nameNorm]) {
        rowsByName[entry.nameNorm] = entry.rowNumber;
      }
      if (hasNumber && !rowsByNumber[entry.numberNorm]) {
        rowsByNumber[entry.numberNorm] = entry.rowNumber;
      }
      if (!hasName && !hasNumber) {
        emptyRows.push(entry.rowNumber);
      }
    });

    const takeEmptyRow = () => {
      while (emptyRows.length > 0) {
        const rowNumber = emptyRows.shift();
        if (!usedRows[rowNumber]) return rowNumber;
      }
      return null;
    };

    normalizedPlayers.forEach((player) => {
      const nameNorm = normalize(player.fullName);
      const numberNorm = normalize(player.number);

      let targetRow = null;
      const compositeKey = `${nameNorm}__${numberNorm}`;

      if (nameNorm && numberNorm && rowsByNameAndNumber[compositeKey] && !usedRows[rowsByNameAndNumber[compositeKey]]) {
        targetRow = rowsByNameAndNumber[compositeKey];
      } else if (nameNorm && rowsByName[nameNorm] && !usedRows[rowsByName[nameNorm]]) {
        targetRow = rowsByName[nameNorm];
      } else if (numberNorm && rowsByNumber[numberNorm] && !usedRows[rowsByNumber[numberNorm]]) {
        targetRow = rowsByNumber[numberNorm];
      } else {
        targetRow = takeEmptyRow();
      }

      if (targetRow) {
        usedRows[targetRow] = true;
        sheet.getRange(targetRow, TEAM_COLUMN).setValue(team);
        sheet.getRange(targetRow, SPECIFIC_POSITION_COLUMN).setValue(player.specificPosition);
        sheet.getRange(targetRow, PLAYER_COLUMN).setValue(player.fullName);
        sheet.getRange(targetRow, NUMBER_COLUMN).setValue(player.number);
        sheet.getRange(targetRow, TRAITS_COLUMN).setValue(player.traits);
      } else {
        sheet.appendRow(['', player.specificPosition, team, player.fullName, player.number, player.traits]);
      }
    });

    return jsonResponse({ ok: true, team: team, updatedRows: normalizedPlayers.length, mode: 'upsert-by-player' }, 200);
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