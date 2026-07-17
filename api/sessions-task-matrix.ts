type Req = {
  method?: string;
};

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (payload: unknown) => unknown;
  };
};

type MatrixTask = {
  tipoTarea: string;
  intencion: string;
  socioestructura: string;
  nombre: string;
  enlaceImagen: string;
  imagen: string;
  video: string;
  descripcion: string;
};

const DEFAULT_SHEET_ID = '1ywS0iSqbNEdlgoWakn_EvggFdqIGDXnkLVOd-1sMR6s';
const DEFAULT_SHEET_NAME = 'Matriz';
const DEFAULT_RANGE = 'A:H';

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
  return joined.includes('tipo') || joined.includes('intencion') || joined.includes('socioestructura') || joined.includes('nombre') || joined.includes('descripcion');
}

function buildGoogleSheetCsvUrl(sheetId: string, sheetName: string, range: string): string {
  const params = new URLSearchParams({
    tqx: 'out:csv',
    sheet: sheetName,
    range,
  });

  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
}

function mapRowsToTasks(rows: string[][]): MatrixTask[] {
  const dataRows = looksLikeHeader(rows[0] || []) ? rows.slice(1) : rows;

  return dataRows
    .map((row) => ({
      tipoTarea: String(row[0] || '').trim(),
      intencion: String(row[1] || '').trim(),
      socioestructura: String(row[2] || '').trim(),
      nombre: String(row[3] || '').trim(),
      enlaceImagen: String(row[4] || '').trim(),
      imagen: String(row[5] || '').trim(),
      video: String(row[6] || '').trim(),
      descripcion: String(row[7] || '').trim(),
    }))
    .filter((row) => row.tipoTarea || row.intencion || row.socioestructura || row.nombre || row.descripcion);
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sheetId = process.env.SESSION_GENERATOR_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetName = process.env.SESSION_GENERATOR_SHEET_NAME || DEFAULT_SHEET_NAME;
  const range = process.env.SESSION_GENERATOR_SHEET_RANGE || DEFAULT_RANGE;
  const url = buildGoogleSheetCsvUrl(sheetId, sheetName, range);

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
    const tasks = mapRowsToTasks(rows);

    return res.status(200).json({
      ok: true,
      source: 'google-sheet',
      count: tasks.length,
      tasks,
      sheetId,
      sheetName,
      range,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Unexpected error reading Google Sheet',
      details: String(error),
    });
  }
}
