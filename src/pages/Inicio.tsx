import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function Inicio() {
  const [badgeUrl, setBadgeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // Try to load a previously uploaded badge at path 'team_badge.png'
    const load = async () => {
      try {
        const { data } = supabase.storage.from('fotos').getPublicUrl('team_badge.png');
        if (data && data.publicUrl) setBadgeUrl(data.publicUrl);
      } catch (err) {
        console.warn('No se pudo obtener escudo:', err);
      }
    };
    load();
  }, []);

  const handleFile = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    try {
      // upload to 'fotos/team_badge.png' (overwrite)
      const path = 'team_badge.png';
      await supabase.storage.from('fotos').remove([path]);
      const { error: uploadError } = await supabase.storage.from('fotos').upload(path, f, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('fotos').getPublicUrl(path);
      if (data && data.publicUrl) setBadgeUrl(data.publicUrl);
    } catch (err) {
      console.error('Error subiendo escudo', err);
      alert('Error subiendo escudo: ' + String(err));
    } finally { setUploading(false); }
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
          <div className="widget-box" style={{ minHeight: '320px', display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 520, height: 320, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', alignItems: 'center', justifyItems: 'center', gap: 8 }}>
              {['Inicio','Plantilla','Calendario','Plan de Partido','Análisis de Partido','Editor de vídeo propio','Editor de vídeo rival','Estadísticas'].map((s, i) => {
                // positions around center: map to cells except center (1,1)
                const cells = [0,1,2,3,5,6,7,8];
                const cellIndex = cells[i];
                const row = Math.floor(cellIndex / 3);
                const col = cellIndex % 3;
                return (
                  <div key={s} style={{ gridColumn: col + 1, gridRow: row + 1 }}>
                    <button type="button" className="secondary-button" onClick={() => { localStorage.setItem('app_active_section', s); window.dispatchEvent(new CustomEvent('app-navigate', { detail: s })); }}>{s}</button>
                  </div>
                );
              })}
              <div style={{ gridColumn: 2, gridRow: 2, display: 'grid', placeItems: 'center' }}>
                <div style={{ width: 160, height: 160, borderRadius: 160, background: '#081025', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  {badgeUrl ? <img src={badgeUrl} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ color: '#7f96bc' }}>Escudo</div>}
                </div>
                <div style={{ marginTop: 8 }}>
                  <input type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
                  {uploading && <div style={{ color: '#7f96bc' }}>Subiendo...</div>}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, color: '#7f96bc' }}>Haz clic en un apartado para acceder rápidamente.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Inicio;
