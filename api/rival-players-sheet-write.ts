type Req = {
  method?: string;
  body?: {
    team?: string;
    players?: Array<{
      id?: number;
      fullName?: string;
      number?: string;
      traits?: string;
    }>;
  };
};

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (payload: unknown) => unknown;
  };
};

function normalizePlayerRows(input: Req['body']['players']) {
  return Array.isArray(input)
    ? input
      .map((row, idx) => ({
        id: Number.isFinite(Number(row?.id)) ? Number(row?.id) : idx + 1,
        fullName: String(row?.fullName || '').trim(),
        number: String(row?.number || '').trim(),
        traits: String(row?.traits || '').trim(),
      }))
      .filter((row) => row.fullName || row.number || row.traits)
    : [];
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const scriptUrl = process.env.RIVAL_SHEET_WRITE_URL;
  const syncSecret = process.env.RIVAL_SHEET_SYNC_SECRET || '';

  if (!scriptUrl) {
    return res.status(500).json({ error: 'RIVAL_SHEET_WRITE_URL is not configured' });
  }

  const team = String(req.body?.team || '').trim();
  const players = normalizePlayerRows(req.body?.players);

  if (!team) {
    return res.status(400).json({ error: 'Missing team' });
  }

  if (players.length === 0) {
    return res.status(400).json({ error: 'No players to sync' });
  }

  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: syncSecret,
        action: 'upsertTeamPlayers',
        team,
        players,
      }),
    });

    const raw = await response.text();
    let payload: unknown = raw;

    try {
      payload = JSON.parse(raw);
    } catch {
      // Keep raw body.
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Google Apps Script write failed',
        details: payload,
      });
    }

    return res.status(200).json({
      ok: true,
      team,
      players: players.length,
      syncedAt: new Date().toISOString(),
      result: payload,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Unexpected error writing Google Sheet',
      details: String(error),
    });
  }
}