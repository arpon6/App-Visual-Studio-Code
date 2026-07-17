type Req = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (payload: unknown) => unknown;
  };
};

type RivalPlayerRow = {
  id: number;
  fullName: string;
  number: string;
  traits: string;
};

const DEFAULT_SHEET_ID = '1Psz7LtFGTR8rNPdge7BrN_k0r_78XscY3o6PuuR354E';
const DEFAULT_SHEET_GID = '0';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

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
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  }

  return rows;
}

function looksLikeHeader(row: string[]): boolean {
  const joined = row.join(' ').toLowerCase();
  return joined.includes('jugador') || joined.includes('equipo') || joined.includes('dorsal') || joined.includes('caracter');
}

function buildSheetCsvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const teamParam = req.query?.team;
  const team = Array.isArray(teamParam) ? teamParam[0] : teamParam;
  if (!team || !String(team).trim()) {
    return res.status(400).json({ error: 'Missing team parameter' });
  }

  const sheetId = process.env.RIVAL_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetGid = process.env.RIVAL_SHEET_GID || DEFAULT_SHEET_GID;
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
    const rows = parseCsv(raw);
    const dataRows = looksLikeHeader(rows[0] || []) ? rows.slice(1) : rows;
    const target = normalize(String(team));

    const players: RivalPlayerRow[] = dataRows
      .filter((row) => normalize(row[2] || '') === target)
      .map((row, idx) => ({
        id: idx + 1,
        fullName: String(row[3] || '').trim(),
        number: String(row[4] || '').trim(),
        traits: String(row[5] || '').trim(),
      }))
      .filter((row) => row.fullName || row.number || row.traits)
      .slice(0, 40);

    return res.status(200).json({
      ok: true,
      team: String(team),
      count: players.length,
      players,
      source: 'google-sheet',
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