type Req = {
  method?: string;
  body?: {
    team?: string;
    players?: Array<{
      id?: number;
      specificPosition?: string;
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
        specificPosition: String(row?.specificPosition || '').trim(),
        fullName: String(row?.fullName || '').trim(),
        number: String(row?.number || '').trim(),
        traits: String(row?.traits || '').trim(),
      }))
      .filter((row) => row.specificPosition || row.fullName || row.number || row.traits)
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
    const requestBody = JSON.stringify({
      secret: syncSecret,
      action: 'upsertTeamPlayers',
      team,
      players,
    });

    // Google Apps Script /exec can issue redirects. Some runtimes may turn POST into GET
    // when auto-following redirects, which drops body and causes Unauthorized.
    const firstResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
      redirect: 'manual',
    });

    // Apps Script often responds with redirect after executing the script.
    // In that case, treat it as success to avoid false negatives and duplicate writes.
    if ([301, 302, 303, 307, 308].includes(firstResponse.status)) {
      return res.status(200).json({
        ok: true,
        team,
        players: players.length,
        syncedAt: new Date().toISOString(),
        result: {
          ok: true,
          mode: 'redirect-ack',
          status: firstResponse.status,
        },
      });
    }

    const response = firstResponse;

    const raw = await response.text();
    let payload: unknown = raw;
    let parsedPayload: Record<string, unknown> | null = null;

    try {
      payload = JSON.parse(raw);
      if (payload && typeof payload === 'object') {
        parsedPayload = payload as Record<string, unknown>;
      }
    } catch {
      // Keep raw body.
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Google Apps Script write failed',
        details: payload,
      });
    }

    // Google Apps Script web apps usually return HTTP 200 even for logical errors.
    if (parsedPayload && parsedPayload.ok === false) {
      return res.status(502).json({
        error: String(parsedPayload.error || 'Google Apps Script logical error'),
        details: parsedPayload,
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