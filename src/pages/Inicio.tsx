import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

function Inicio() {
  const { user } = useAuth();
  const [badgeUrl, setBadgeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        // Intenta cargar de Supabase primero (compartido entre perfiles)
        const { data: configs, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'team_badge_url')
          .maybeSingle();

        console.debug('app_config load result:', { configs, error });

        if (configs && configs.value) {
          setBadgeUrl(configs.value);
          try { localStorage.setItem('team_badge_url', configs.value); } catch {};
          return;
        }

        // fallback: check localStorage before listing bucket
        try {
          const cached = localStorage.getItem('team_badge_url');
          if (cached) {
            setBadgeUrl(cached);
            return;
          }
        } catch {}

        // Si no hay en la base de datos, intenta desde Storage con el nombre estándar
        try {
          const publicObj = supabase.storage.from('fotos').getPublicUrl('team_badge.png');
          if (publicObj?.data?.publicUrl) {
            setBadgeUrl(publicObj.data.publicUrl);
            try { localStorage.setItem('team_badge_url', publicObj.data.publicUrl); } catch {};
            return;
          }

          // Si no existe 'team_badge.png', intenta listar el bucket y usar la primera coincidencia razonable
          const { data: list, error: listErr } = await supabase.storage.from('fotos').list('', { limit: 500 });
          if (!listErr && Array.isArray(list) && list.length > 0) {
            // Buscar archivo que contenga 'escudo' o 'badge' primero, si no, pruebo todos hasta encontrar uno accesible
            const candidates = list.filter((f: any) => /escudo|badge|team|logo/i.test(f.name)).length ? list.filter((f: any) => /escudo|badge|team|logo/i.test(f.name)) : list;
            for (const entry of candidates) {
              try {
                // Primero intento publicUrl
                const { data: p } = supabase.storage.from('fotos').getPublicUrl(entry.name);
                if (p?.publicUrl) {
                  setBadgeUrl(p.publicUrl);
                  try { localStorage.setItem('team_badge_url', p.publicUrl); } catch {};
                  return;
                }
                // Si no es público, intento crear una URL firmada temporal
                const expires = 60 * 60 * 24 * 7; // 7 días
                const { data: signedData, error: signedErr } = await supabase.storage.from('fotos').createSignedUrl(entry.name, expires);
                if (!signedErr && signedData?.signedUrl) {
                  setBadgeUrl(signedData.signedUrl);
                  try { localStorage.setItem('team_badge_url', signedData.signedUrl); } catch {};
                  return;
                }
              } catch (inner) {
                // seguir con siguiente candidato
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
  }, []);

  const saveBadgeUrl = async (url: string) => {
    setBadgeUrl(url);
    // Guarda en Supabase para que sea accesible desde cualquier perfil
    try {
      const { error } = await supabase
        .from('app_config')
        .upsert({ key: 'team_badge_url', value: url }, { onConflict: 'key' });
      if (error) console.error('Error saving badge:', error);
    } catch (err) {
      console.error('Error saving badge to Supabase:', err);
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
      // upload to 'fotos/team_badge.png' (overwrite)
      const path = 'team_badge.png';
      // try to upload (use upsert=true). Avoid removing first to not trigger RLS for some roles.
      const { error: uploadError } = await supabase.storage.from('fotos').upload(path, f, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('fotos').getPublicUrl(path);
      if (data && data.publicUrl) saveBadgeUrl(data.publicUrl);
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
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <div className="badge">TEMPORADA 2025/26</div>
          <h1>Mi Club PRO</h1>
        </div>
      </div>

      <div>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-header">
            <div>
              <small>Panel principal</small>
              <h2>Bienvenido, entrenador</h2>
            </div>
            <span className="badge">AUTO</span>
          </div>
          <div className="widget-box" style={{ minHeight: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <div className="access-ring" style={{ position: 'relative', width: 520, height: 520 }}>
              <div className="access-ring-center" style={{ position: 'absolute', inset: 'calc(50% - 120px)' }}>
                {badgeUrl ? <img src={badgeUrl} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : <div style={{ color: '#7f96bc', fontSize: 18 }}>Escudo</div>}
              </div>
              {['Inicio','Plantilla','Calendario','Plan de Partido','Desarrollo grupal','Editor de vídeo propio','Editor de vídeo rival','Estadísticas'].map((s, i) => {
                const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
                const radius = 210;
                const x = 260 + Math.cos(angle) * radius;
                const y = 260 + Math.sin(angle) * radius;
                return (
                  <button
                    key={s}
                    type="button"
                    className="secondary-button access-ring-button"
                    style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', minWidth: 120, padding: '10px 12px' }}
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
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                  <input
                    placeholder="Pegar URL pública del escudo"
                    style={{ width: 320, minWidth: 220, padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff' }}
                    value={badgeUrlInput}
                    onChange={(e) => setBadgeUrlInput(e.target.value)}
                  />
                  <button type="button" className="secondary-button" onClick={handleUseUrl}>Usar URL</button>
                </div>
              </div>
            )}
            <div style={{ color: '#7f96bc' }}>Haz clic en un apartado para acceder rápidamente.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Inicio;
