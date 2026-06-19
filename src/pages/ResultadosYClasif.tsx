import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_MATCH_TYPE, LEAGUE_TEAMS, MY_TEAM_NAME } from '../lib/leagueTeams';

interface Partido {
  id: string;
  jornada: number;
  fecha: string;
  equipo_local: string;
  goles_local: number;
  goles_visitante: number;
  equipo_visitante: string;
  competicion?: string;
  acta_url?: string;
}

interface ClasifRow {
  id: string;
  posicion: number;
  equipo: string;
  es_mi_equipo: boolean;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  pts: number;
}

const TEMPORADA = '2023-24';

const emptyPartido = (): Omit<Partido, 'id'> => ({
  jornada: 1,
  fecha: '',
  equipo_local: MY_TEAM_NAME,
  goles_local: 0,
  goles_visitante: 0,
  equipo_visitante: '',
  competicion: DEFAULT_MATCH_TYPE,
  acta_url: '',
});

function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isMyTeam(name: string): boolean {
  return normalizeTeamName(name) === normalizeTeamName(MY_TEAM_NAME);
}

function buildClasificacion(partidos: Partido[]): ClasifRow[] {
  const stats = new Map<string, Omit<ClasifRow, 'id' | 'posicion'>>();

  const ensureTeam = (team: string) => {
    const key = normalizeTeamName(team);
    if (!key) return null;
    if (!stats.has(key)) {
      stats.set(key, {
        equipo: team,
        es_mi_equipo: isMyTeam(team),
        pj: 0,
        g: 0,
        e: 0,
        p: 0,
        gf: 0,
        gc: 0,
        pts: 0,
      });
    }
    return key;
  };

  LEAGUE_TEAMS.forEach(team => ensureTeam(team));

  partidos.forEach(p => {
    const localKey = ensureTeam(p.equipo_local);
    const visitKey = ensureTeam(p.equipo_visitante);
    if (!localKey || !visitKey) return;

    const local = stats.get(localKey)!;
    const visit = stats.get(visitKey)!;

    local.pj += 1;
    visit.pj += 1;
    local.gf += p.goles_local;
    local.gc += p.goles_visitante;
    visit.gf += p.goles_visitante;
    visit.gc += p.goles_local;

    if (p.goles_local > p.goles_visitante) {
      local.g += 1;
      local.pts += 3;
      visit.p += 1;
    } else if (p.goles_local < p.goles_visitante) {
      visit.g += 1;
      visit.pts += 3;
      local.p += 1;
    } else {
      local.e += 1;
      visit.e += 1;
      local.pts += 1;
      visit.pts += 1;
    }
  });

  return Array.from(stats.values())
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const dgA = a.gf - a.gc;
      const dgB = b.gf - b.gc;
      if (dgB !== dgA) return dgB - dgA;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.equipo.localeCompare(b.equipo, 'es');
    })
    .map((row, idx) => ({
      ...row,
      id: `auto-${normalizeTeamName(row.equipo)}`,
      posicion: idx + 1,
    }));
}

function scoreColor(local: number, visitante: number, esMiEquipoLocal: boolean) {
  const gf = esMiEquipoLocal ? local : visitante;
  const gc = esMiEquipoLocal ? visitante : local;
  if (gf > gc) return '#16d67a';
  if (gf < gc) return '#f44242';
  return '#f4c842';
}

function posColor(pos: number) {
  if (pos === 1) return '#2d68ff';
  if (pos <= 3) return '#f4a742';
  if (pos >= 16) return '#f44242';
  return '#3a4a6a';
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(10,18,30,0.9)',
  color: '#fff',
  fontSize: '0.9rem',
  width: '100%',
};

function ResultadosYClasif() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const [tab, setTab] = useState<'resultados' | 'clasificacion'>('resultados');
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [clasif, setClasif] = useState<ClasifRow[]>([]);
  const [detalle, setDetalle] = useState<Partido | null>(null);
  const [showAddPartido, setShowAddPartido] = useState(false);
  const [formPartido, setFormPartido] = useState(emptyPartido());
  const [saving, setSaving] = useState(false);
  const [actaFile, setActaFile] = useState<File | null>(null);
  const [actaUrl, setActaUrl] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const { data: p } = await supabase.from('resultados_partidos').select('*').order('jornada');
    const partidosData = (p || []).map((row: any) => ({
      ...row,
      competicion: row.competicion || DEFAULT_MATCH_TYPE,
    }));
    setPartidos(partidosData);
    setClasif(buildClasificacion(partidosData));
  };

  const handleGuardarPartido = async () => {
    if (!formPartido.fecha || !formPartido.equipo_local || !formPartido.equipo_visitante) return;
    if (normalizeTeamName(formPartido.equipo_local) === normalizeTeamName(formPartido.equipo_visitante)) return;

    setSaving(true);
    let acta_url = formPartido.acta_url || '';

    if (actaFile) {
      const ext = actaFile.name.split('.').pop();
      const path = `actas/${Date.now()}.${ext}`;
      const { data: up } = await supabase.storage.from('actas').upload(path, actaFile, { upsert: true });
      if (up) {
        const { data: pub } = supabase.storage.from('actas').getPublicUrl(path);
        acta_url = pub.publicUrl;
      }
    }

    await supabase.from('resultados_partidos').insert({
      ...formPartido,
      competicion: DEFAULT_MATCH_TYPE,
      acta_url,
    });

    await fetchAll();
    setShowAddPartido(false);
    setFormPartido(emptyPartido());
    setActaFile(null);
    setActaUrl('');
    setUploadMsg('');
    setSaving(false);
  };

  const handleEliminarPartido = async (id: string) => {
    await supabase.from('resultados_partidos').delete().eq('id', id);
    await fetchAll();
    setDetalle(null);
  };

  const handleResetAll = async () => {
    if (!confirm('Se eliminaran todos los resultados introducidos y la clasificacion se reiniciara. Continuar?')) return;
    setSaving(true);
    await supabase.from('resultados_partidos').delete().not('id', 'is', null);
    setPartidos([]);
    setClasif(buildClasificacion([]));
    setDetalle(null);
    setShowAddPartido(false);
    setFormPartido(emptyPartido());
    setActaFile(null);
    setActaUrl('');
    setUploadMsg('');
    setSaving(false);
  };

  const handleSubirActaDetalle = async () => {
    if (!detalle || !actaFile) return;
    setSaving(true);
    setUploadMsg('');
    const ext = actaFile.name.split('.').pop();
    const path = `actas/${detalle.id}.${ext}`;
    const { data: up } = await supabase.storage.from('actas').upload(path, actaFile, { upsert: true });
    if (up) {
      const { data: pub } = supabase.storage.from('actas').getPublicUrl(path);
      await supabase.from('resultados_partidos').update({ acta_url: pub.publicUrl }).eq('id', detalle.id);
      setDetalle({ ...detalle, acta_url: pub.publicUrl });
      setUploadMsg('Acta subida correctamente.');
      await fetchAll();
    } else {
      setUploadMsg('Error al subir el archivo.');
    }
    setActaFile(null);
    setSaving(false);
  };

  const esMiEquipoLocal = (p: Partido) => isMyTeam(p.equipo_local);

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Temporada {TEMPORADA}</small>
          <h1>Resultados y Clasif.</h1>
        </div>
        {!isReadOnly && (
          <button
            onClick={handleResetAll}
            disabled={saving}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '12px',
              background: 'rgba(244,66,66,0.12)',
              color: '#ff9b9b',
              border: '1px solid rgba(244,66,66,0.28)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.88rem',
              fontWeight: 700,
            }}
          >
            Resetear todo
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        {(['resultados', 'clasificacion'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 22px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: tab === t ? '#16d67a' : 'rgba(255,255,255,0.06)',
              color: tab === t ? '#071119' : '#7f96bc',
            }}
          >
            {t === 'resultados' ? 'Resultados' : 'Clasificacion'}
          </button>
        ))}
        {!isReadOnly && tab === 'resultados' && (
          <button
            onClick={() => setShowAddPartido(v => !v)}
            style={{
              marginLeft: 'auto',
              padding: '8px 18px',
              borderRadius: '10px',
              background: '#2d68ff',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
            }}
          >
            + Anadir
          </button>
        )}
      </div>

      {!isReadOnly && tab === 'resultados' && showAddPartido && (
        <div className="card" style={{ padding: '22px', display: 'grid', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Nuevo partido</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            {([
              ['Jornada', 'jornada', 'number'],
              ['Fecha', 'fecha', 'date'],
              ['Goles local', 'goles_local', 'number'],
              ['Goles visitante', 'goles_visitante', 'number'],
            ] as const).map(([label, field, type]) => (
              <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
                {label}
                <input
                  type={type}
                  value={(formPartido as any)[field]}
                  onChange={e => setFormPartido(f => ({ ...f, [field]: parseInt(e.target.value, 10) || (type === 'number' ? 0 : e.target.value) }))}
                  style={inputStyle}
                />
              </label>
            ))}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Equipo local
              <select
                value={formPartido.equipo_local}
                onChange={e => setFormPartido(f => ({ ...f, equipo_local: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Seleccionar equipo</option>
                {LEAGUE_TEAMS.map(team => (
                  <option key={`local-${team}`} value={team}>{team}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Equipo visitante
              <select
                value={formPartido.equipo_visitante}
                onChange={e => setFormPartido(f => ({ ...f, equipo_visitante: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Seleccionar equipo</option>
                {LEAGUE_TEAMS.map(team => (
                  <option key={`visitante-${team}`} value={team}>{team}</option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
            Acta del partido (PDF, imagen, txt)
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.html"
                style={{ display: 'none' }}
                onChange={e => setActaFile(e.target.files?.[0] || null)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.07)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                {actaFile ? actaFile.name : 'Seleccionar archivo'}
              </button>
              <span style={{ color: '#7f96bc', fontSize: '0.8rem' }}>o pega URL:</span>
              <input
                type="text"
                value={actaUrl}
                onChange={e => {
                  setActaUrl(e.target.value);
                  setFormPartido(f => ({ ...f, acta_url: e.target.value }));
                }}
                placeholder="https://..."
                style={{ ...inputStyle, width: '220px' }}
              />
            </div>
          </label>

          {normalizeTeamName(formPartido.equipo_local) === normalizeTeamName(formPartido.equipo_visitante) && (
            <div style={{ color: '#f44242', fontSize: '0.82rem' }}>
              El equipo local y visitante no pueden ser el mismo.
            </div>
          )}

          <button
            onClick={handleGuardarPartido}
            disabled={
              saving ||
              !formPartido.fecha ||
              !formPartido.equipo_local ||
              !formPartido.equipo_visitante ||
              normalizeTeamName(formPartido.equipo_local) === normalizeTeamName(formPartido.equipo_visitante)
            }
            style={{
              justifySelf: 'start',
              padding: '9px 22px',
              borderRadius: '10px',
              background: saving ? '#555' : '#16d67a',
              color: '#071119',
              fontWeight: 700,
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Guardando...' : 'Guardar partido'}
          </button>
        </div>
      )}

      {tab === 'resultados' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '16px' }}>
          {partidos.length === 0 && (
            <div style={{ gridColumn: '1/-1', color: '#7f96bc', textAlign: 'center', padding: '40px' }}>
              No hay partidos. Pulsa "+ Anadir" para registrar resultados.
            </div>
          )}

          {partidos.map(p => {
            const miLocal = esMiEquipoLocal(p);
            const color = scoreColor(p.goles_local, p.goles_visitante, miLocal);
            return (
              <div key={p.id} className="card" style={{ padding: '18px 20px', display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7f96bc', fontSize: '0.8rem' }}>
                    {p.fecha
                      ? new Date(p.fecha).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '-'}
                  </span>
                  <span
                    style={{
                      padding: '3px 12px',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.06)',
                      color: '#7f96bc',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                    }}
                  >
                    JORNADA {p.jornada}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#cdd4f1', textAlign: 'center', textTransform: 'uppercase' }}>
                    {p.equipo_local}
                  </div>

                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color, letterSpacing: '0.05em', textAlign: 'center', minWidth: '70px' }}>
                    {p.goles_local}-{p.goles_visitante}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#cdd4f1', textAlign: 'center', textTransform: 'uppercase' }}>
                    {p.equipo_visitante}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDetalle(p);
                    setActaFile(null);
                    setUploadMsg('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#16d67a',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textAlign: 'left',
                    padding: '4px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  DETALLES &gt;
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'clasificacion' && (
        <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
          <table className="list-table" style={{ minWidth: '640px' }}>
            <thead>
              <tr>
                {['POS', 'EQUIPO', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'PTS'].map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === 'EQUIPO' ? 'left' : 'center',
                      color: '#7f96bc',
                      fontSize: '0.78rem',
                      letterSpacing: '0.06em',
                      padding: '14px 16px',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clasif.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: '#7f96bc', padding: '40px' }}>
                    Sin datos.
                  </td>
                </tr>
              )}
              {clasif.map(row => (
                <tr key={row.id} style={{ background: row.es_mi_equipo ? 'rgba(22,214,122,0.06)' : undefined }}>
                  <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: posColor(row.posicion),
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}
                    >
                      {row.posicion}
                    </span>
                  </td>
                  <td
                    style={{
                      fontWeight: row.es_mi_equipo ? 700 : 400,
                      color: row.es_mi_equipo ? '#16d67a' : '#fff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      fontSize: '0.88rem',
                    }}
                  >
                    {row.equipo}
                  </td>
                  {[row.pj, row.g, row.e, row.p, row.gf, row.gc].map((v, i) => (
                    <td key={i} style={{ textAlign: 'center', color: i === 1 ? '#4a9eff' : '#cdd4f1' }}>
                      {v}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        height: '28px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.07)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                      }}
                    >
                      {row.pts}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <div
          onClick={() => setDetalle(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ width: '100%', maxWidth: '520px', padding: '28px', display: 'grid', gap: '18px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ color: '#7f96bc', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  JORNADA {detalle.jornada}
                </span>
                <h2 style={{ margin: '4px 0 0', fontSize: '1.1rem' }}>
                  {detalle.equipo_local} {detalle.goles_local}-{detalle.goles_visitante} {detalle.equipo_visitante}
                </h2>
                <span style={{ color: '#7f96bc', fontSize: '0.82rem' }}>
                  {detalle.fecha
                    ? new Date(detalle.fecha).toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })
                    : ''}
                  {` · ${DEFAULT_MATCH_TYPE}`}
                </span>
              </div>
              <button
                onClick={() => setDetalle(null)}
                style={{ background: 'none', border: 'none', color: '#7f96bc', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {detalle.acta_url && (
              <a
                href={detalle.acta_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  background: 'rgba(45,104,255,0.15)',
                  color: '#4a9eff',
                  border: '1px solid rgba(45,104,255,0.3)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Ver acta del partido
              </a>
            )}

            <div
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '16px',
                display: 'grid',
                gap: '12px',
                background: 'rgba(10,18,30,0.6)',
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                {detalle.acta_url ? 'Reemplazar acta' : 'Cargar acta del partido'}
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.html"
                  style={{ display: 'none' }}
                  onChange={e => setActaFile(e.target.files?.[0] || null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.07)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  {actaFile ? actaFile.name : 'Seleccionar archivo'}
                </button>
                <button
                  onClick={handleSubirActaDetalle}
                  disabled={!actaFile || saving}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: actaFile && !saving ? '#16d67a' : '#555',
                    color: '#071119',
                    fontWeight: 700,
                    border: 'none',
                    cursor: actaFile && !saving ? 'pointer' : 'not-allowed',
                    fontSize: '0.82rem',
                  }}
                >
                  {saving ? 'Subiendo...' : 'Subir acta'}
                </button>
              </div>
              {uploadMsg && (
                <p style={{ margin: 0, fontSize: '0.82rem', color: uploadMsg.includes('correctamente') ? '#90f4ae' : '#f4c842' }}>
                  {uploadMsg}
                </p>
              )}
            </div>

            {!isReadOnly && (
              <button
                onClick={() => {
                  if (confirm('Eliminar este partido?')) handleEliminarPartido(detalle.id);
                }}
                style={{
                  justifySelf: 'start',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'rgba(244,66,66,0.12)',
                  color: '#f44242',
                  border: '1px solid rgba(244,66,66,0.25)',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                Eliminar partido
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default ResultadosYClasif;
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_MATCH_TYPE, LEAGUE_TEAMS, MY_TEAM_NAME } from '../lib/leagueTeams';

interface Partido {
  id: string;
  jornada: number;
  fecha: string;
  equipo_local: string;
  siglas_local: string;
  goles_local: number;
  goles_visitante: number;
  equipo_visitante: string;
  siglas_visitante: string;
  competicion?: string;
  acta_url?: string;
}

interface ClasifRow {
  id: string;
  posicion: number;
  equipo: string;
  es_mi_equipo: boolean;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  pts: number;
}

const partidosBase: Omit<Partido, 'id'>[] = [
  { jornada: 1, fecha: '2023-09-10', equipo_local: 'CD VAREA', siglas_local: 'CD', goles_local: 2, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 2, fecha: '2023-09-17', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 1, goles_visitante: 1, equipo_visitante: 'RACING RIOJA', siglas_visitante: 'RA' },
  { jornada: 3, fecha: '2023-09-24', equipo_local: 'CD VIANES', siglas_local: 'CD', goles_local: 1, goles_visitante: 1, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 4, fecha: '2023-10-01', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'PENA BALSAMAISO CF', siglas_visitante: 'PE' },
  { jornada: 5, fecha: '2023-10-08', equipo_local: 'CD TEDEON', siglas_local: 'CD', goles_local: 0, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 6, fecha: '2023-10-13', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 0, goles_visitante: 1, equipo_visitante: 'CD CALAHORRA B', siglas_visitante: 'CD' },
  { jornada: 7, fecha: '2023-10-22', equipo_local: 'ATLETICO RIVER EBRO', siglas_local: 'AT', goles_local: 2, goles_visitante: 1, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 8, fecha: '2023-10-29', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'CASALARREINA CF', siglas_visitante: 'CA' },
  { jornada: 9, fecha: '2023-11-05', equipo_local: 'CD BERCEO', siglas_local: 'CD', goles_local: 0, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 10, fecha: '2023-11-12', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 1, goles_visitante: 1, equipo_visitante: 'COMILLAS CF', siglas_visitante: 'CO' },
  { jornada: 11, fecha: '2023-11-19', equipo_local: 'SD OYONESA', siglas_local: 'SD', goles_local: 1, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 12, fecha: '2023-11-26', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 2, goles_visitante: 0, equipo_visitante: 'UD LOGRONES B', siglas_visitante: 'UD' },
  { jornada: 13, fecha: '2023-12-03', equipo_local: 'CD ALBERITE', siglas_local: 'CD', goles_local: 0, goles_visitante: 1, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 14, fecha: '2023-12-10', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 0, goles_visitante: 4, equipo_visitante: 'CD LA CALZADA', siglas_visitante: 'CD' },
  { jornada: 15, fecha: '2024-01-07', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 0, goles_visitante: 1, equipo_visitante: 'CD ANGUIANO', siglas_visitante: 'CD' },
  { jornada: 16, fecha: '2024-01-14', equipo_local: 'CD ALFARO', siglas_local: 'CD', goles_local: 2, goles_visitante: 1, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 17, fecha: '2024-01-21', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 3, goles_visitante: 1, equipo_visitante: 'HARO DEPORTIVO', siglas_visitante: 'HA' },
  { jornada: 18, fecha: '2024-01-28', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 2, goles_visitante: 3, equipo_visitante: 'CD VAREA', siglas_visitante: 'CD' },
  { jornada: 19, fecha: '2024-02-04', equipo_local: 'RACING RIOJA', siglas_local: 'RA', goles_local: 2, goles_visitante: 4, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 20, fecha: '2024-02-09', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 0, goles_visitante: 3, equipo_visitante: 'CD VIANES', siglas_visitante: 'CD' },
  { jornada: 21, fecha: '2024-02-18', equipo_local: 'PENA BALSAMAISO CF', siglas_local: 'PE', goles_local: 0, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 22, fecha: '2024-02-25', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 4, goles_visitante: 0, equipo_visitante: 'CD TEDEON', siglas_visitante: 'CD' },
  { jornada: 23, fecha: '2024-03-03', equipo_local: 'CD CALAHORRA B', siglas_local: 'CD', goles_local: 4, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 24, fecha: '2024-03-10', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 3, goles_visitante: 3, equipo_visitante: 'ATLETICO RIVER EBRO', siglas_visitante: 'AT' },
  { jornada: 25, fecha: '2024-03-17', equipo_local: 'CASALARREINA CF', siglas_local: 'CA', goles_local: 1, goles_visitante: 1, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 26, fecha: '2024-03-24', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'CD BERCEO', siglas_visitante: 'CD' },
  { jornada: 27, fecha: '2024-03-28', equipo_local: 'COMILLAS CF', siglas_local: 'CO', goles_local: 0, goles_visitante: 2, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 28, fecha: '2024-04-07', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'SD OYONESA', siglas_visitante: 'SD' },
  { jornada: 29, fecha: '2024-04-14', equipo_local: 'UD LOGRONES B', siglas_local: 'UD', goles_local: 4, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 30, fecha: '2024-04-21', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 2, goles_visitante: 2, equipo_visitante: 'CD ALBERITE', siglas_visitante: 'CD' },
  { jornada: 31, fecha: '2024-04-27', equipo_local: 'CD LA CALZADA', siglas_local: 'CD', goles_local: 1, goles_visitante: 2, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 32, fecha: '2024-05-01', equipo_local: 'CD ANGUIANO', siglas_local: 'CD', goles_local: 3, goles_visitante: 1, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
  { jornada: 33, fecha: '2024-05-05', equipo_local: 'CD ARNEDO', siglas_local: 'AR', goles_local: 0, goles_visitante: 2, equipo_visitante: 'CD ALFARO', siglas_visitante: 'CD' },
  { jornada: 34, fecha: '2024-05-12', equipo_local: 'HARO DEPORTIVO', siglas_local: 'HA', goles_local: 3, goles_visitante: 0, equipo_visitante: 'CD ARNEDO', siglas_visitante: 'AR' },
];

const emptyPartido = (): Omit<Partido, 'id'> => ({
  jornada: 1,
  fecha: '',
  equipo_local: MY_TEAM_NAME,
  siglas_local: 'ARN',
  goles_local: 0,
  goles_visitante: 0,
  equipo_visitante: '',
  siglas_visitante: '',
  competicion: DEFAULT_MATCH_TYPE,
  acta_url: '',
});

function normalizeName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function getTeamAbbr(team: string) {
  const stopWords = new Set(['CD', 'CF', 'UD', 'SD', 'DE', 'DEL', 'LA', 'EL', 'B']);
  const parts = team
    .split(/\s+/)
    .map(p => normalizeName(p))
    .filter(p => p && !stopWords.has(p));

  if (parts.length === 0) return normalizeName(team).slice(0, 3);
  if (parts.length === 1) return parts[0].slice(0, 3);

  return parts.slice(0, 3).map(p => p[0]).join('').slice(0, 3);
}

function scoreColor(local: number, visitante: number, esMiEquipoLocal: boolean) {
  const gf = esMiEquipoLocal ? local : visitante;
  const gc = esMiEquipoLocal ? visitante : local;
  if (gf > gc) return '#16d67a';
  if (gf < gc) return '#f44242';
  return '#f4c842';
}

function posColor(pos: number) {
  if (pos === 1) return '#2d68ff';
  if (pos <= 3) return '#f4a742';
  if (pos >= 16) return '#f44242';
  return '#3a4a6a';
}

function buildClasificacion(partidos: Partido[]): Omit<ClasifRow, 'id'>[] {
  const stats = new Map<string, Omit<ClasifRow, 'id' | 'posicion' | 'es_mi_equipo'>>();

  for (const team of LEAGUE_TEAMS) {
    stats.set(team, {
      equipo: team,
      pj: 0,
      g: 0,
      e: 0,
      p: 0,
      gf: 0,
      gc: 0,
      pts: 0,
    });
  }

  const ensure = (team: string) => {
    if (!stats.has(team)) {
      stats.set(team, { equipo: team, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 });
    }
    return stats.get(team)!;
  };

  partidos.forEach(p => {
    const local = ensure(p.equipo_local);
    const visitante = ensure(p.equipo_visitante);

    local.pj += 1;
    visitante.pj += 1;

    local.gf += p.goles_local;
    local.gc += p.goles_visitante;
    visitante.gf += p.goles_visitante;
    visitante.gc += p.goles_local;

    if (p.goles_local > p.goles_visitante) {
      local.g += 1;
      local.pts += 3;
      visitante.p += 1;
    } else if (p.goles_local < p.goles_visitante) {
      visitante.g += 1;
      visitante.pts += 3;
      local.p += 1;
    } else {
      local.e += 1;
      visitante.e += 1;
      local.pts += 1;
      visitante.pts += 1;
    }
  });

  return Array.from(stats.values())
    .sort((a, b) => {
      const diffPts = b.pts - a.pts;
      if (diffPts !== 0) return diffPts;
      const diffGd = (b.gf - b.gc) - (a.gf - a.gc);
      if (diffGd !== 0) return diffGd;
      const diffGf = b.gf - a.gf;
      if (diffGf !== 0) return diffGf;
      return a.equipo.localeCompare(b.equipo, 'es');
    })
    .map((row, idx) => ({
      ...row,
      posicion: idx + 1,
      es_mi_equipo: normalizeName(row.equipo).includes(normalizeName(MY_TEAM_NAME)),
    }));
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(10,18,30,0.9)',
  color: '#fff',
  fontSize: '0.9rem',
  width: '100%',
};

function ResultadosYClasif() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const [tab, setTab] = useState<'resultados' | 'clasificacion'>('resultados');
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [clasif, setClasif] = useState<ClasifRow[]>([]);
  const [detalle, setDetalle] = useState<Partido | null>(null);
  const [showAddPartido, setShowAddPartido] = useState(false);
  const [formPartido, setFormPartido] = useState(emptyPartido());
  const [saving, setSaving] = useState(false);
  const [actaFile, setActaFile] = useState<File | null>(null);
  const [actaUrl, setActaUrl] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const { data } = await supabase.from('resultados_partidos').select('*').order('jornada');
    const savedPartidos = (data || []) as Partido[];

    const baseIds = partidosBase.map((_, i) => `base-${i}`);
    const supabaseJornadas = new Set(savedPartidos.map((x: Partido) => x.jornada));
    const baseFiltered = partidosBase
      .filter(pb => !supabaseJornadas.has(pb.jornada))
      .map((pb, i) => ({ ...pb, id: baseIds[i] }));

    const allPartidos = [...baseFiltered, ...savedPartidos].sort((a, b) => a.jornada - b.jornada);
    setPartidos(allPartidos);

    const autoClasif = buildClasificacion(savedPartidos).map((row, i) => ({
      ...row,
      id: `auto-${i}-${normalizeName(row.equipo)}`,
    }));
    setClasif(autoClasif);
  };

  const handleGuardarPartido = async () => {
    if (!formPartido.fecha || !formPartido.equipo_local || !formPartido.equipo_visitante) return;

    setSaving(true);
    let acta_url = formPartido.acta_url || '';

    if (actaFile) {
      const ext = actaFile.name.split('.').pop();
      const path = `actas/${Date.now()}.${ext}`;
      const { data: up } = await supabase.storage.from('actas').upload(path, actaFile, { upsert: true });
      if (up) {
        const { data: pub } = supabase.storage.from('actas').getPublicUrl(path);
        acta_url = pub.publicUrl;
      }
    }

    await supabase.from('resultados_partidos').insert({
      ...formPartido,
      siglas_local: getTeamAbbr(formPartido.equipo_local),
      siglas_visitante: getTeamAbbr(formPartido.equipo_visitante),
      competicion: DEFAULT_MATCH_TYPE,
      acta_url,
    });

    await fetchAll();
    setShowAddPartido(false);
    setFormPartido(emptyPartido());
    setActaFile(null);
    setActaUrl('');
    setUploadMsg('');
    setSaving(false);
  };

  const handleEliminarPartido = async (id: string) => {
    if (!id.startsWith('base-')) await supabase.from('resultados_partidos').delete().eq('id', id);
    await fetchAll();
    setDetalle(null);
  };

  const handleResetTodo = async () => {
    if (!confirm('Esto eliminará todos los resultados introducidos manualmente y reiniciará la clasificación. ¿Continuar?')) return;

    setSaving(true);
    await Promise.all([
      supabase.from('resultados_partidos').delete().not('id', 'is', null),
      supabase.from('clasificacion').delete().not('id', 'is', null),
    ]);
    await fetchAll();
    setDetalle(null);
    setShowAddPartido(false);
    setFormPartido(emptyPartido());
    setSaving(false);
  };

  const handleSubirActaDetalle = async () => {
    if (!detalle || !actaFile) return;

    setSaving(true);
    setUploadMsg('');
    const ext = actaFile.name.split('.').pop();
    const path = `actas/${detalle.id.startsWith('base-') ? `base-j${detalle.jornada}` : detalle.id}.${ext}`;
    const { data: up } = await supabase.storage.from('actas').upload(path, actaFile, { upsert: true });

    if (up) {
      const { data: pub } = supabase.storage.from('actas').getPublicUrl(path);
      if (detalle.id.startsWith('base-')) {
        const { data: nuevo } = await supabase
          .from('resultados_partidos')
          .insert({
            ...detalle,
            id: undefined,
            siglas_local: getTeamAbbr(detalle.equipo_local),
            siglas_visitante: getTeamAbbr(detalle.equipo_visitante),
            competicion: detalle.competicion || DEFAULT_MATCH_TYPE,
            acta_url: pub.publicUrl,
          })
          .select()
          .maybeSingle();
        if (nuevo) setDetalle({ ...detalle, id: nuevo.id, acta_url: pub.publicUrl });
      } else {
        await supabase.from('resultados_partidos').update({ acta_url: pub.publicUrl }).eq('id', detalle.id);
        setDetalle({ ...detalle, acta_url: pub.publicUrl });
      }
      setUploadMsg('Acta subida correctamente.');
      await fetchAll();
    } else {
      setUploadMsg('Error al subir el archivo.');
    }

    setActaFile(null);
    setSaving(false);
  };

  const esMiEquipoLocal = (p: Partido) => normalizeName(p.equipo_local).includes(normalizeName(MY_TEAM_NAME));

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Temporada 2023-24</small>
          <h1>Resultados y Clasif.</h1>
        </div>
        <button
          title="Proximamente: sincronizacion con BeSoccer"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', color: '#7f96bc', border: '1px solid rgba(255,255,255,0.1)', cursor: 'not-allowed', fontSize: '0.88rem' }}
        >
          Sincronizar datos
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        {(['resultados', 'clasificacion'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 22px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: tab === t ? '#16d67a' : 'rgba(255,255,255,0.06)',
              color: tab === t ? '#071119' : '#7f96bc',
            }}
          >
            {t === 'resultados' ? 'Resultados' : 'Clasificacion'}
          </button>
        ))}

        {!isReadOnly && tab === 'resultados' && (
          <>
            <button
              onClick={() => setShowAddPartido(v => !v)}
              style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: '10px', background: '#2d68ff', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
            >
              + Anadir
            </button>
            <button
              onClick={handleResetTodo}
              disabled={saving}
              style={{ padding: '8px 18px', borderRadius: '10px', background: 'rgba(244,66,66,0.16)', color: '#f8a8a8', border: '1px solid rgba(244,66,66,0.35)', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
            >
              Resetear todo
            </button>
          </>
        )}
      </div>

      {!isReadOnly && tab === 'resultados' && showAddPartido && (
        <div className="card" style={{ padding: '22px', display: 'grid', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Nuevo partido</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Jornada
              <input
                type="number"
                value={formPartido.jornada}
                onChange={e => setFormPartido(f => ({ ...f, jornada: parseInt(e.target.value, 10) || 1 }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Fecha
              <input
                type="date"
                value={formPartido.fecha}
                onChange={e => setFormPartido(f => ({ ...f, fecha: e.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Equipo local
              <select
                value={formPartido.equipo_local}
                onChange={e => setFormPartido(f => ({ ...f, equipo_local: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Seleccionar equipo</option>
                {LEAGUE_TEAMS.map(team => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Equipo visitante
              <select
                value={formPartido.equipo_visitante}
                onChange={e => setFormPartido(f => ({ ...f, equipo_visitante: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Seleccionar equipo</option>
                {LEAGUE_TEAMS.map(team => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Goles local
              <input
                type="number"
                value={formPartido.goles_local}
                onChange={e => setFormPartido(f => ({ ...f, goles_local: parseInt(e.target.value, 10) || 0 }))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
              Goles visitante
              <input
                type="number"
                value={formPartido.goles_visitante}
                onChange={e => setFormPartido(f => ({ ...f, goles_visitante: parseInt(e.target.value, 10) || 0 }))}
                style={inputStyle}
              />
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
            Acta del partido (PDF, imagen, txt)
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.html" style={{ display: 'none' }} onChange={e => setActaFile(e.target.files?.[0] || null)} />
              <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: '0.82rem' }}>
                {actaFile ? actaFile.name : 'Seleccionar archivo'}
              </button>
              <span style={{ color: '#7f96bc', fontSize: '0.8rem' }}>o pega URL:</span>
              <input
                type="text"
                value={actaUrl}
                onChange={e => {
                  setActaUrl(e.target.value);
                  setFormPartido(f => ({ ...f, acta_url: e.target.value }));
                }}
                placeholder="https://..."
                style={{ ...inputStyle, width: '220px' }}
              />
            </div>
          </label>

          <button
            onClick={handleGuardarPartido}
            disabled={saving || !formPartido.fecha || !formPartido.equipo_local || !formPartido.equipo_visitante || formPartido.equipo_local === formPartido.equipo_visitante}
            style={{ justifySelf: 'start', padding: '9px 22px', borderRadius: '10px', background: saving ? '#555' : '#16d67a', color: '#071119', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Guardando...' : 'Guardar partido'}
          </button>
        </div>
      )}

      {tab === 'resultados' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '16px' }}>
          {partidos.length === 0 && (
            <div style={{ gridColumn: '1/-1', color: '#7f96bc', textAlign: 'center', padding: '40px' }}>
              No hay partidos. Pulsa "+ Anadir" para registrar resultados.
            </div>
          )}

          {partidos.map(p => {
            const miLocal = esMiEquipoLocal(p);
            const color = scoreColor(p.goles_local, p.goles_visitante, miLocal);
            return (
              <div key={p.id} className="card" style={{ padding: '18px 20px', display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7f96bc', fontSize: '0.8rem' }}>
                    {p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                  </span>
                  <span style={{ padding: '3px 12px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: '#7f96bc', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                    JORNADA {p.jornada}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#cdd4f1' }}>
                      {getTeamAbbr(p.equipo_local)}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#7f96bc', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{p.equipo_local}</span>
                  </div>

                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color, letterSpacing: '0.05em', textAlign: 'center', minWidth: '70px' }}>
                    {p.goles_local}-{p.goles_visitante}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#cdd4f1' }}>
                      {getTeamAbbr(p.equipo_visitante)}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#7f96bc', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{p.equipo_visitante}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDetalle(p);
                    setActaFile(null);
                    setUploadMsg('');
                  }}
                  style={{ background: 'none', border: 'none', color: '#16d67a', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'left', padding: '4px 0 0' }}
                >
                  DETALLES &gt;
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'clasificacion' && (
        <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
          <table className="list-table" style={{ minWidth: '640px' }}>
            <thead>
              <tr>
                {['POS', 'EQUIPO', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'PTS'].map(h => (
                  <th key={h} style={{ textAlign: h === 'EQUIPO' ? 'left' : 'center', color: '#7f96bc', fontSize: '0.78rem', letterSpacing: '0.06em', padding: '14px 16px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clasif.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#7f96bc', padding: '40px' }}>Sin datos de resultados para generar clasificacion.</td></tr>
              )}
              {clasif.map(row => (
                <tr key={row.id} style={{ background: row.es_mi_equipo ? 'rgba(22,214,122,0.06)' : undefined }}>
                  <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: posColor(row.posicion), color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>
                      {row.posicion}
                    </span>
                  </td>
                  <td style={{ fontWeight: row.es_mi_equipo ? 700 : 400, color: row.es_mi_equipo ? '#16d67a' : '#fff', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.88rem' }}>
                    {row.equipo}
                  </td>
                  {[row.pj, row.g, row.e, row.p, row.gf, row.gc].map((v, i) => (
                    <td key={i} style={{ textAlign: 'center', color: i === 1 ? '#4a9eff' : '#cdd4f1' }}>{v}</td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '28px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>
                      {row.pts}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <div
          onClick={() => setDetalle(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ width: '100%', maxWidth: '520px', padding: '28px', display: 'grid', gap: '18px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ color: '#7f96bc', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em' }}>JORNADA {detalle.jornada}</span>
                <h2 style={{ margin: '4px 0 0', fontSize: '1.1rem' }}>
                  {detalle.equipo_local} {detalle.goles_local}-{detalle.goles_visitante} {detalle.equipo_visitante}
                </h2>
                <span style={{ color: '#7f96bc', fontSize: '0.82rem' }}>
                  {detalle.fecha ? new Date(detalle.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : ''}
                  {` · ${detalle.competicion || DEFAULT_MATCH_TYPE}`}
                </span>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', color: '#7f96bc', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>x</button>
            </div>

            {detalle.acta_url && (
              <a
                href={detalle.acta_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: 'rgba(45,104,255,0.15)', color: '#4a9eff', border: '1px solid rgba(45,104,255,0.3)', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}
              >
                Ver acta del partido
              </a>
            )}

            <div style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '16px', display: 'grid', gap: '12px', background: 'rgba(10,18,30,0.6)' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                {detalle.acta_url ? 'Reemplazar acta' : 'Cargar acta del partido'}
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.html" style={{ display: 'none' }} onChange={e => setActaFile(e.target.files?.[0] || null)} />
                <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: '0.82rem' }}>
                  {actaFile ? actaFile.name : 'Seleccionar archivo'}
                </button>
                <button
                  onClick={handleSubirActaDetalle}
                  disabled={!actaFile || saving}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: actaFile && !saving ? '#16d67a' : '#555', color: '#071119', fontWeight: 700, border: 'none', cursor: actaFile && !saving ? 'pointer' : 'not-allowed', fontSize: '0.82rem' }}
                >
                  {saving ? 'Subiendo...' : 'Subir acta'}
                </button>
              </div>
              {uploadMsg && <p style={{ margin: 0, fontSize: '0.82rem', color: uploadMsg.startsWith('Acta') ? '#90f4ae' : '#f4c842' }}>{uploadMsg}</p>}
            </div>

            <button
              onClick={() => {
                if (confirm('Eliminar este partido?')) handleEliminarPartido(detalle.id);
              }}
              style={{ justifySelf: 'start', padding: '8px 16px', borderRadius: '8px', background: 'rgba(244,66,66,0.12)', color: '#f44242', border: '1px solid rgba(244,66,66,0.25)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Eliminar partido
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default ResultadosYClasif;
