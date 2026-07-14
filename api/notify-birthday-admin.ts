import { createClient } from '@supabase/supabase-js';

type Req = {
  method?: string;
  headers?: Record<string, string | undefined>;
};

type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (payload: unknown) => unknown;
  };
};

const TZ = 'Europe/Madrid';

function getMadridParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function buildFullName(player: Record<string, unknown>): string {
  const fields = [
    String(player.first_name ?? '').trim(),
    String(player.last_name1 ?? '').trim(),
    String(player.last_name2 ?? '').trim(),
  ].filter(Boolean);

  return fields.join(' ').trim();
}

function monthDayFromISO(isoDate: string): string | null {
  const value = String(isoDate || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[2]}-${match[3]}`;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized cron call' });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.VITE_BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.VITE_BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || process.env.VITE_BREVO_SENDER_NAME || 'Mi Club';

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }
  if (!brevoApiKey || !senderEmail) {
    return res.status(500).json({ error: 'Missing Brevo server credentials' });
  }

  const now = new Date();
  const madrid = getMadridParts(now);

  // Ejecutamos el cron cada hora y solo enviamos exactamente a las 08:00 de Madrid.
  if (!(madrid.hour === '08' && madrid.minute === '00')) {
    return res.status(200).json({ ok: true, skipped: 'Not 08:00 in Europe/Madrid', at: madrid });
  }

  const todayIso = `${madrid.year}-${madrid.month}-${madrid.day}`;
  const todayMonthDay = `${madrid.month}-${madrid.day}`;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: lockData, error: lockError } = await supabase
    .from('birthday_email_notifications')
    .insert([{ notification_date: todayIso }])
    .select('notification_date')
    .maybeSingle();

  if (lockError) {
    if (String(lockError.message || '').toLowerCase().includes('duplicate key')) {
      return res.status(200).json({ ok: true, skipped: 'Already sent today', date: todayIso });
    }
    return res.status(500).json({ error: 'Failed notification lock', details: lockError.message });
  }

  if (!lockData) {
    return res.status(200).json({ ok: true, skipped: 'Already processed today', date: todayIso });
  }

  const { data: players, error: playersError } = await supabase
    .from('plantilla')
    .select('id, first_name, last_name1, last_name2, birth_date')
    .not('birth_date', 'is', null);

  if (playersError) {
    return res.status(500).json({ error: 'Failed loading birthdays', details: playersError.message });
  }

  const birthdayPlayers = (players || [])
    .filter((p) => monthDayFromISO(String((p as Record<string, unknown>).birth_date ?? '')) === todayMonthDay)
    .map((p) => ({
      id: (p as Record<string, unknown>).id,
      fullName: buildFullName(p as Record<string, unknown>) || 'Jugador sin nombre',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));

  if (birthdayPlayers.length === 0) {
    await supabase
      .from('birthday_email_notifications')
      .update({
        sent_at: new Date().toISOString(),
        admins_count: 0,
        birthdays_count: 0,
        status: 'no_birthdays',
      })
      .eq('notification_date', todayIso);

    return res.status(200).json({ ok: true, message: 'No hay cumpleaños hoy', date: todayIso });
  }

  const { data: admins, error: adminsError } = await supabase
    .from('app_users')
    .select('email, role')
    .in('role', ['SUPER_ADMIN', 'admin'])
    .not('email', 'is', null);

  if (adminsError) {
    return res.status(500).json({ error: 'Failed loading admin users', details: adminsError.message });
  }

  const to = Array.from(new Set((admins || [])
    .map((u) => String((u as Record<string, unknown>).email || '').trim())
    .filter(Boolean)));

  if (to.length === 0) {
    await supabase
      .from('birthday_email_notifications')
      .update({
        sent_at: new Date().toISOString(),
        admins_count: 0,
        birthdays_count: birthdayPlayers.length,
        status: 'no_admin_emails',
      })
      .eq('notification_date', todayIso);

    return res.status(200).json({ ok: true, message: 'Sin correos admin para notificar', date: todayIso });
  }

  const dateText = `${madrid.day}/${madrid.month}/${madrid.year}`;
  const listHtml = birthdayPlayers.map((p) => `<li>${p.fullName}</li>`).join('');
  const listText = birthdayPlayers.map((p) => `- ${p.fullName}`).join('\n');

  const subject = `Cumpleaños hoy (${dateText})`;
  const htmlContent = `
    <h2>Recordatorio de cumpleaños</h2>
    <p>Hoy (${dateText}) hay <strong>${birthdayPlayers.length}</strong> cumpleaños en el calendario:</p>
    <ul>${listHtml}</ul>
    <p>Mensaje automático enviado a las 08:00 (hora Madrid).</p>
  `;
  const textContent = `Recordatorio de cumpleaños\n\nHoy (${dateText}) hay ${birthdayPlayers.length} cumpleaños en el calendario:\n${listText}\n\nMensaje automático enviado a las 08:00 (hora Madrid).`;

  const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': brevoApiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: to.map((email) => ({ email })),
      subject,
      htmlContent,
      textContent,
    }),
  });

  const emailBody = await emailResponse.text();
  if (!emailResponse.ok) {
    await supabase
      .from('birthday_email_notifications')
      .update({
        sent_at: new Date().toISOString(),
        admins_count: to.length,
        birthdays_count: birthdayPlayers.length,
        status: 'send_error',
        error_message: emailBody.slice(0, 1000),
      })
      .eq('notification_date', todayIso);

    return res.status(emailResponse.status).json({ error: 'Brevo error', details: emailBody });
  }

  await supabase
    .from('birthday_email_notifications')
    .update({
      sent_at: new Date().toISOString(),
      admins_count: to.length,
      birthdays_count: birthdayPlayers.length,
      status: 'sent',
      payload: {
        date: todayIso,
        recipients: to,
        birthdays: birthdayPlayers.map((p) => p.fullName),
      },
    })
    .eq('notification_date', todayIso);

  return res.status(200).json({
    ok: true,
    date: todayIso,
    sentTo: to.length,
    birthdays: birthdayPlayers.length,
  });
}
