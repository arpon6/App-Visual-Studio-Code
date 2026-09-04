type Req = {
  method?: string;
};

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (payload: unknown) => unknown;
  };
};

const DEFAULT_SHEET_ID = '1-vQrP1nuHA-uYfXKnbUy_maahUARXIu3RRS0RrwTuTs';
const DEFAULT_SHEET_GID = '0';
const MAX_ROWS = 400;
const MAX_COLS = 300;

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    const nextChar = raw[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function buildSheetCsvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function trimGrid(rows: string[][]): string[][] {
  // Drop fully-empty trailing rows/columns so the grid returned to the client is compact.
  let lastRow = -1;
  let lastCol = -1;

  for (let r = 0; r < rows.length && r < MAX_ROWS; r++) {
    for (let c = 0; c < rows[r].length && c < MAX_COLS; c++) {
      if (String(rows[r][c] || '').trim() !== '') {
        if (r > lastRow) lastRow = r;
        if (c > lastCol) lastCol = c;
      }
    }
  }

  if (lastRow < 0 || lastCol < 0) return [];

  return rows.slice(0, lastRow + 1).map((row) => {
    const trimmed = row.slice(0, lastCol + 1);
    while (trimmed.length < lastCol + 1) trimmed.push('');
    return trimmed.map((cell) => String(cell ?? ''));
  });
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sheetId = process.env.CHAMPIONS_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetGid = process.env.CHAMPIONS_SHEET_GID || DEFAULT_SHEET_GID;
  const url = buildSheetCsvUrl(sheetId, sheetGid);

  try {
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: 'Could not read Google Sheet export',
        details: body.slice(0, 400),
      });
    }

    const raw = await response.text();
    const rows = trimGrid(parseCsv(raw));

    return res.status(200).json({
      ok: true,
      source: 'google-sheet',
      rows,
      rowCount: rows.length,
      colCount: rows[0]?.length || 0,
      sheetId,
      gid: sheetGid,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Unexpected error reading Google Sheet',
      details: String(error),
    });
  }
}
