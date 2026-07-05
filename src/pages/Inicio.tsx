import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';
import { usePlantilla } from '../lib/usePlantilla';
import type { PageKey } from '../lib/appPages';
import type { UserRole } from '../lib/AuthContext';

type TablonMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  recipients: string[];
  sent?: boolean;
  createdAt: string;
};

type AppUserInfo = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  player_id: string | null;
};

type InicioProps = {
  quickAccessSections: PageKey[];
};

type RecipientBadge = {
  label: string;
  kind: 'group' | 'person';
};

function Inicio({ quickAccessSections }: InicioProps) {
  const { user } = useAuth();
  const jugadores = usePlantilla();

  // ── Badge ─────────────────────────────────────────────────────────────────
  const BADGE_URL_KEY = 'team_badge_url';
  const BADGE_STORAGE_KEY = 'team_badge_storage_path';
  const BADGE_STORAGE_PATH = 'team_badge.png';
  const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 30; // 30 days
  const [badgeUrl, setBadgeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const visibleQuickAccessSections = quickAccessSections.filter((section) => section !== 'Inicio');

  const ringSize = Math.min(760, Math.max(440, 300 + visibleQuickAccessSections.length * 26));
  const buttonWidth = Math.max(88, Math.min(132, 144 - visibleQuickAccessSections.length * 2));
  const centerSize = Math.max(110, Math.min(160, ringSize * 0.3));
  const radius = ringSize / 2 - Math.max(72, buttonWidth * 0.75);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: configs, error } = await supabase
          .from('shared_state')
          .select('key, value')
          .in('key', [BADGE_URL_KEY, BADGE_STORAGE_KEY]);

        console.debug('shared_state load result:', { configs, error });

        const configMap = (configs || []).reduce((acc: Record<string, string>, item: any) => {
          if (item?.key && item?.value) acc[item.key] = item.value;
          return acc;
        }, {} as Record<string, string>);

        if (configMap[BADGE_URL_KEY]) {
          setBadgeUrl(configMap[BADGE_URL_KEY]);
          try { localStorage.setItem('team_badge_url', configMap[BADGE_URL_KEY]); } catch {};
          return;
        }

        if (configMap[BADGE_STORAGE_KEY]) {
          const { data: signedData, error: signedErr } = await supabase.storage.from('fotos').createSignedUrl(configMap[BADGE_STORAGE_KEY], SIGNED_URL_EXPIRY);
          if (!signedErr && signedData?.signedUrl) {
            setBadgeUrl(signedData.signedUrl);
            try { localStorage.setItem('team_badge_url', signedData.signedUrl); } catch {};
            return;
          }
        }

        try {
          const cached = localStorage.getItem('team_badge_url');
          if (cached) {
            setBadgeUrl(cached);
            return;
          }
        } catch {}

        try {
          const { data: list, error: listErr } = await supabase.storage.from('fotos').list('', { limit: 500 });
          if (!listErr && Array.isArray(list) && list.length > 0) {
            const candidates = list.filter((f: any) => /escudo|badge|team|logo/i.test(f.name)).length ? list.filter((f: any) => /escudo|badge|team|logo/i.test(f.name)) : list;
            for (const entry of candidates) {
              try {
                const { data: signedData, error: signedErr } = await supabase.storage.from('fotos').createSignedUrl(entry.name, SIGNED_URL_EXPIRY);
                if (!signedErr && signedData?.signedUrl) {
                  setBadgeUrl(signedData.signedUrl);
                  try { localStorage.setItem('team_badge_url', signedData.signedUrl); } catch {};
                  return;
                }
              } catch (inner) {
                console.debug('Intento de obtener URL para escudo fallido en entry', entry.name, inner);
              }
            }
          }
        } catch (innerErr) {
          console.warn('No se pudo listar bucket para escudo:', innerErr);
        }

      } catch (err) {
        console.warn('No se pudo obtener escudo:', err);
      }
    };
    load();
  }, [user]);

  const saveBadgeUrl = async (url: string) => {
    setBadgeUrl(url);
    try {
      const { error } = await supabase
        .from('shared_state')
        .upsert({ key: BADGE_URL_KEY, value: url }, { onConflict: 'key' });
      if (error) console.error('Error saving badge URL:', error);
    } catch (err) {
      console.error('Error saving badge URL to Supabase:', err);
    }
  };

  const saveBadgeStoragePath = async (path: string, previewUrl?: string) => {
    if (previewUrl) setBadgeUrl(previewUrl);
    try {
      const { error } = await supabase
        .from('shared_state')
        .upsert({ key: BADGE_STORAGE_KEY, value: path }, { onConflict: 'key' });
      if (error) console.error('Error saving badge storage path:', error);
    } catch (err) {
      console.error('Error saving badge storage path to Supabase:', err);
    }
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    // only allow non-jugador roles to upload
    if (user?.role === 'jugador') {
      alert('No tienes permiso para cambiar el escudo.');
      return;
    }
    setUploading(true);
    try {
      const path = BADGE_STORAGE_PATH;
      const { error: uploadError } = await supabase.storage.from('fotos').upload(path, f, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data: signedData, error: signedErr } = await supabase.storage.from('fotos').createSignedUrl(path, SIGNED_URL_EXPIRY);
      if (signedErr || !signedData?.signedUrl) {
        const msg = signedErr?.message || 'No se pudo obtener URL firmada del escudo.';
        throw new Error(msg);
      }
      await saveBadgeStoragePath(path, signedData.signedUrl);
    } catch (err) {
      console.error('Error subiendo escudo', err);
      const msg = (err as any)?.message || String(err);
      if (msg.includes('row-level') || msg.includes('RLS') || msg.includes('policy')) {
        alert('Error subiendo escudo: no tienes permisos para modificar el bucket. Puedes indicar directamente la URL pública del escudo.');
      } else {
        alert('Error subiendo escudo: ' + msg);
      }
    } finally { setUploading(false); }
  };

  const [badgeUrlInput, setBadgeUrlInput] = useState('');
  const handleUseUrl = async () => {
    if (!badgeUrlInput) return;
    await saveBadgeUrl(badgeUrlInput);
    setBadgeUrlInput('');
    setShowUrlInput(false);
  };

  // ── Tablón ────────────────────────────────────────────────────────────────
  const [tablonMessages, setTablonMessages] = useSharedState<TablonMessage[]>('tablon_messages', []);
  const [msgText, setMsgText] = useState('');
  const [recipientType, setRecipientType] = useState<'all' | 'players_all' | 'staff' | 'users_select'>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserInfo[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const sendingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from('app_users')
      .select('id, email, username, role, player_id')
      .then(({ data }) => {
        if (data) {
          setAppUsers(
            data.map((u: any) => ({ ...u, player_id: u.player_id ? String(u.player_id) : null }))
          );
        }
        setUsersLoaded(true);
      });
  }, []);

  const staffUsers = appUsers.filter((u) => u.role !== 'jugador');

  const getUsersForMessage = (msg: TablonMessage): AppUserInfo[] => {
    const recipients = new Map<string, AppUserInfo>();

    const addUser = (u?: AppUserInfo) => {
      if (u?.email) recipients.set(u.id, u);
    };

    if (msg.recipients.includes('staff_admin')) {
      staffUsers.forEach(addUser);
    }

    if (msg.recipients.includes('all_players')) {
      appUsers.filter((u) => u.role === 'jugador').forEach(addUser);
    }

    msg.recipients.filter((r) => r.startsWith('player:')).forEach((r) => {
      const pid = r.replace('player:', '');
      const u = appUsers.find((x) => String(x.player_id) === String(pid));
      addUser(u);
    });

    msg.recipients.filter((r) => r.startsWith('user:')).forEach((r) => {
      const uid = r.replace('user:', '');
      const u = appUsers.find((x) => x.id === uid);
      addUser(u);
    });

    const senderEmail = appUsers.find((u) => u.id === msg.senderId)?.email;
    if (senderEmail) {
      recipients.forEach((u, id) => {
        if (u.email === senderEmail) recipients.delete(id);
      });
    }

    return Array.from(recipients.values());
  };

  const buildRecipients = (): string[] => {
    if (recipientType === 'all') return ['all_players', 'staff_admin'];
    if (recipientType === 'players_all') return ['all_players'];
    if (recipientType === 'staff') return ['staff_admin'];
    if (recipientType === 'users_select') return selectedUsers.map((id) => `user:${id}`);
    return [];
  };

  const getEmailsForMessage = (msg: TablonMessage): string[] => {
    const emails = new Set<string>();
    getUsersForMessage(msg).forEach((u) => { if (u.email) emails.add(u.email); });
    return Array.from(emails);
  };

  const sendTablonEmail = async (msg: TablonMessage): Promise<boolean> => {
    const emails = getEmailsForMessage(msg);
    if (emails.length === 0) return false;
    try {
      const resp = await fetch('/api/send-brevo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emails,
          subject: `Nuevo mensaje en el Tablón de ${msg.senderName}`,
          htmlContent: `<p><strong>${msg.senderName}</strong> ha publicado en el Tablón:</p><p>${msg.text.replace(/\n/g, '<br/>')}</p><p>Revisa la app para ver el mensaje completo.</p>`,
          textContent: `${msg.senderName} ha publicado en el Tablón:\n\n${msg.text}\n\nRevisa la app para ver el mensaje completo.`,
        }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!usersLoaded) return;
    const unsent = tablonMessages.filter((m) => !m.sent && !sendingIdsRef.current.has(m.id));
    if (unsent.length === 0) return;
    const process = async () => {
      for (const m of unsent) {
        sendingIdsRef.current.add(m.id);
        try {
          const sent = await sendTablonEmail(m);
          if (sent) {
            setTablonMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, sent: true } : x));
          }
        } finally {
          sendingIdsRef.current.delete(m.id);
        }
      }
    };
    process();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablonMessages, usersLoaded]);

  const handleSendTablon = () => {
    if (!msgText.trim() || !user) return;
    if (recipientType === 'users_select' && selectedUsers.length === 0) return;
    const recs = buildRecipients();
    const msg: TablonMessage = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      senderId: user.id,
      senderName: user.username,
      senderRole: user.role,
      text: msgText.trim(),
      recipients: recs,
      sent: false,
      createdAt: new Date().toISOString(),
    };
    setTablonMessages((prev) => [msg, ...prev]);
    setMsgText('');
    setSelectedUsers([]);
    setRecipientType('all');
  };

  const handleDeleteTablon = (id: string) => {
    if (!window.confirm('¿Eliminar este mensaje del tablón?')) return;
    setTablonMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const sortedMessages = [...tablonMessages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const formatRecipients = (recs: string[]): RecipientBadge[] => {
    const badges: RecipientBadge[] = [];

    if (recs.includes('all_players') && recs.includes('staff_admin')) {
      return [{ label: 'Toda la plantilla y cuerpo técnico', kind: 'group' }];
    }

    if (recs.includes('all_players')) {
      badges.push({ label: 'Todos los jugadores', kind: 'group' });
    }

    if (recs.includes('staff_admin')) {
      staffUsers.forEach((u) => {
        const roleLabel = u.role === 'entrenador'
          ? 'Entrenador'
          : u.role === 'preparador_fisico'
            ? 'Preparador físico'
            : u.role === 'directivo'
              ? 'Directivo'
              : 'Super admin';
        badges.push({ label: `${u.username} · ${roleLabel}`, kind: 'person' });
      });
    }

    const playerIds = recs.filter((r) => r.startsWith('player:')).map((r) => r.replace('player:', ''));
    playerIds.forEach((pid) => {
      const j = jugadores.find((x) => String(x.id) === String(pid));
      badges.push({ label: j ? j.nombre : `Jugador ${pid}`, kind: 'person' });
    });

    const userIds = recs.filter((r) => r.startsWith('user:')).map((r) => r.replace('user:', ''));
    userIds.forEach((uid) => {
      const u = appUsers.find((item) => item.id === uid);
      const roleLabel = u?.role === 'entrenador'
        ? 'Entrenador'
        : u?.role === 'preparador_fisico'
          ? 'Preparador físico'
          : u?.role === 'directivo'
            ? 'Directivo'
            : u?.role === 'SUPER_ADMIN'
              ? 'Super admin'
              : 'Usuario';
      badges.push({ label: u ? `${u.username} · ${roleLabel}` : uid, kind: 'person' });
    });

    return badges.length > 0 ? badges : [{ label: 'Sin destinatarios', kind: 'group' }];
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <div className="badge">TEMPORADA 26-27</div>
          <h1>SD Oyonesa</h1>
        </div>
      </div>

      <div>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-header">
            <div>
              <small>Panel principal</small>
              <h2>Bienvenido, {user?.username || 'entrenador'}</h2>
            </div>
          </div>
          <div className="widget-box" style={{ minHeight: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <div className="access-ring" style={{ position: 'relative', width: ringSize, height: ringSize }}>
              <div className="access-ring-center" style={{ position: 'absolute', inset: `calc(50% - ${centerSize / 2}px)` }}>
                {badgeUrl ? <img src={badgeUrl} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : <div style={{ color: '#7f96bc', fontSize: 18 }}>Escudo</div>}
              </div>
              {visibleQuickAccessSections.map((s, i) => {
                const angle = (i / visibleQuickAccessSections.length) * Math.PI * 2 - Math.PI / 2;
                const center = ringSize / 2;
                const x = center + Math.cos(angle) * radius;
                const y = center + Math.sin(angle) * radius;
                return (
                  <button
                    key={s}
                    type="button"
                    className="secondary-button access-ring-button"
                    style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', minWidth: buttonWidth, maxWidth: buttonWidth + 16, padding: '10px 12px', whiteSpace: 'normal', lineHeight: 1.1 }}
                    onClick={() => { localStorage.setItem('app_active_section', s); window.dispatchEvent(new CustomEvent('app-navigate', { detail: s })); }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            {user?.role !== 'jugador' && (
              <div className="badge-controls" style={{ width: '100%', display: 'grid', gap: 10, justifyItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', padding: '10px 14px', borderRadius: 14, cursor: 'pointer' }}>
                    <span>Seleccionar archivo</span>
                    <input type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                  </label>
                  {uploading && <div style={{ color: '#7f96bc', alignSelf: 'center' }}>Subiendo...</div>}
                  <button
                    type="button"
                    title="Cargar imagen desde URL"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7f96bc', fontSize: 18, padding: '8px', borderRadius: 8, lineHeight: 1 }}
                    onClick={() => setShowUrlInput((v) => !v)}
                  >
                    🔗
                  </button>
                </div>
                {showUrlInput && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                    <input
                      placeholder="Pegar URL pública del escudo"
                      style={{ width: 320, minWidth: 220, padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff' }}
                      value={badgeUrlInput}
                      onChange={(e) => setBadgeUrlInput(e.target.value)}
                    />
                    <button type="button" className="secondary-button" onClick={handleUseUrl}>Usar URL</button>
                  </div>
                )}
              </div>
            )}
            <div style={{ color: '#7f96bc' }}>Haz clic en un apartado para acceder rápidamente.</div>
          </div>
        </div>
      </div>

      {/* ── Tablón ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="section-header">
          <div>
            <small>Comunicaciones del equipo</small>
            <h2>Tablón</h2>
          </div>
        </div>

        {/* Formulario de nuevo mensaje */}
        <div style={{ padding: '0 0 1.2rem 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            placeholder="Escribe un mensaje para el equipo..."
            rows={3}
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box' }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 220px' }}>
              <label style={{ color: '#7f96bc', fontSize: 13 }}>Destinatarios</label>
              <select
                value={recipientType}
                onChange={(e) => { setRecipientType(e.target.value as typeof recipientType); setSelectedUsers([]); }}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 14 }}
              >
                <option value="all">Todos los usuarios</option>
                <option value="players_all">Jugadores</option>
                <option value="staff">Cuerpo técnico</option>
                <option value="users_select">Usuarios individuales...</option>
              </select>
            </div>

            {recipientType === 'users_select' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 260px' }}>
                <label style={{ color: '#7f96bc', fontSize: 13 }}>Selecciona usuarios</label>
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 10px', maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {appUsers.map((u) => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#d1dbe8' }}>
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(u.id)}
                        onChange={(e) => {
                          setSelectedUsers((prev) => e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id));
                        }}
                      />
                      <span>{u.username}</span>
                      <span style={{ fontSize: 11, color: '#7f96bc', marginLeft: 2 }}>{u.role === 'jugador' ? 'Jugador' : 'Técnico'}</span>
                    </label>
                  ))}
                  {appUsers.length === 0 && <span style={{ color: '#7f96bc', fontSize: 13 }}>Cargando usuarios...</span>}
                </div>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              className="primary-button"
              disabled={!msgText.trim() || (recipientType === 'users_select' && selectedUsers.length === 0)}
              onClick={handleSendTablon}
              style={{ minWidth: 140 }}
            >
              Publicar mensaje
            </button>
          </div>
        </div>

        {/* Lista de mensajes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sortedMessages.length === 0 && (
            <div style={{ color: '#7f96bc', fontSize: 14, textAlign: 'center', padding: '1.5rem 0' }}>No hay mensajes publicados aún.</div>
          )}
          {sortedMessages.map((msg) => (
            <div key={msg.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 16px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600, color: '#d1dbe8', fontSize: 14 }}>
                    {msg.senderName}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#7f96bc', background: 'rgba(127,150,188,0.12)', padding: '2px 7px', borderRadius: 6 }}>
                      {msg.senderRole === 'jugador' ? 'Jugador' : 'Cuerpo técnico'}
                    </span>
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#7f96bc' }}>
                    <span>
                      {new Date(msg.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#9fb5d8' }}>Destinatarios:</span>
                      {formatRecipients(msg.recipients).map((badge) => (
                        <span
                          key={badge.label}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: badge.kind === 'group' ? 'rgba(127,150,188,0.14)' : 'rgba(139,237,159,0.12)',
                            color: badge.kind === 'group' ? '#bfd0ea' : '#d8fee0',
                            border: '1px solid rgba(255,255,255,0.08)',
                            maxWidth: '100%',
                            lineHeight: 1.2,
                          }}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {(user?.role !== 'jugador' || user?.id === msg.senderId) && (
                  <button
                    type="button"
                    title="Eliminar mensaje"
                    onClick={() => handleDeleteTablon(msg.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7f96bc', fontSize: 16, padding: '2px 6px', borderRadius: 6, flexShrink: 0, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <p style={{ margin: 0, color: '#d1dbe8', fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{msg.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Inicio;
