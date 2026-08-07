import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_MATCH_TYPE, LEAGUE_TEAMS, MY_TEAM_NAME } from '../lib/leagueTeams';
import { CALENDARIO_LIGA_2026_27 } from '../lib/leagueFixtures';

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

const TEMPORADA = '2026-27';
const SCORE_PENDING = -1;

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

function isOyonesa(name: string): boolean {
  return normalizeTeamName(name) === normalizeTeamName('Oyonesa');
}

function hasPlayedScore(p: Partido): boolean {
  return Number.isInteger(p.goles_local) && Number.isInteger(p.goles_visitante) && p.goles_local >= 0 && p.goles_visitante >= 0;
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
    if (!hasPlayedScore(p)) return;

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
  if (local < 0 || visitante < 0) return '#7f96bc';
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
  const [detalleGolesLocal, setDetalleGolesLocal] = useState('');
  const [detalleGolesVisitante, setDetalleGolesVisitante] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const { data: p } = await supabase.from('resultados_partidos').select('*').order('jornada').order('fecha');
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

  const handleGenerarLigaDesdeCalendario = async () => {
    if (!confirm('Se van a generar todos los partidos de liga desde el documento Calendario. Solo se anadiran los que falten. Continuar?')) return;

    setSaving(true);
    const { data: existing } = await supabase
      .from('resultados_partidos')
      .select('jornada, fecha, equipo_local, equipo_visitante, competicion');

    const existingKeys = new Set(
      (existing || []).map((p: any) => {
        const comp = normalizeTeamName(p.competicion || DEFAULT_MATCH_TYPE);
        return `${p.jornada}|${p.fecha}|${normalizeTeamName(p.equipo_local)}|${normalizeTeamName(p.equipo_visitante)}|${comp}`;
      })
    );

    const rowsToInsert = CALENDARIO_LIGA_2026_27
      .filter(f => {
        const key = `${f.jornada}|${f.fecha}|${normalizeTeamName(f.equipo_local)}|${normalizeTeamName(f.equipo_visitante)}|${normalizeTeamName(DEFAULT_MATCH_TYPE)}`;
        return !existingKeys.has(key);
      })
      .map(f => ({
        jornada: f.jornada,
        fecha: f.fecha,
        equipo_local: f.equipo_local,
        equipo_visitante: f.equipo_visitante,
        goles_local: SCORE_PENDING,
        goles_visitante: SCORE_PENDING,
        competicion: DEFAULT_MATCH_TYPE,
      }));

    if (rowsToInsert.length > 0) {
      await supabase.from('resultados_partidos').insert(rowsToInsert);
    }

    await fetchAll();
    setSaving(false);
    alert(rowsToInsert.length > 0 ? `Se han generado ${rowsToInsert.length} partidos de liga.` : 'Ya estaban generados todos los partidos de liga.');
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

  const handleGuardarResultadoDetalle = async () => {
    if (!detalle) return;

    const local = Number(detalleGolesLocal);
    const visitante = Number(detalleGolesVisitante);
    if (!Number.isInteger(local) || !Number.isInteger(visitante) || local < 0 || visitante < 0) {
      alert('Introduce un marcador valido (numeros enteros >= 0).');
      return;
    }

    setSaving(true);
    await supabase
      .from('resultados_partidos')
      .update({ goles_local: local, goles_visitante: visitante })
      .eq('id', detalle.id);

    setDetalle({ ...detalle, goles_local: local, goles_visitante: visitante });
    await fetchAll();
    setSaving(false);
  };

  const handleEliminarResultadoDetalle = async () => {
    if (!detalle) return;
    if (!confirm('Se eliminara el resultado guardado de este partido y dejara de contar en la clasificacion. Continuar?')) return;

    setSaving(true);
    await supabase
      .from('resultados_partidos')
      .update({ goles_local: SCORE_PENDING, goles_visitante: SCORE_PENDING })
      .eq('id', detalle.id);

    setDetalle({ ...detalle, goles_local: SCORE_PENDING, goles_visitante: SCORE_PENDING });
    setDetalleGolesLocal('');
    setDetalleGolesVisitante('');
    await fetchAll();
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
            onClick={handleGenerarLigaDesdeCalendario}
            disabled={saving}
            style={{
              marginLeft: 'auto',
              padding: '8px 16px',
              borderRadius: '10px',
              background: saving ? '#555' : '#16d67a',
              color: '#071119',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.84rem',
            }}
          >
            Generar liga
          </button>
        )}
        {!isReadOnly && tab === 'resultados' && (
          <button
            onClick={() => setShowAddPartido(v => !v)}
            style={{
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
              No hay partidos. Pulsa "Generar liga" para crear el calendario completo.
            </div>
          )}

          {partidos.map(p => {
            const miLocal = esMiEquipoLocal(p);
            const color = scoreColor(p.goles_local, p.goles_visitante, miLocal);
            const esPartidoOyonesa = isOyonesa(p.equipo_local) || isOyonesa(p.equipo_visitante);
            const esOyonesaLocal = isOyonesa(p.equipo_local);
            const esOyonesaVisitante = isOyonesa(p.equipo_visitante);
            return (
              <div
                key={p.id}
                className="card"
                style={{
                  padding: '18px 20px',
                  display: 'grid',
                  gap: '12px',
                  border: esPartidoOyonesa ? '1px solid rgba(244,166,66,0.45)' : undefined,
                  background: esPartidoOyonesa ? 'linear-gradient(135deg, rgba(244,166,66,0.16), rgba(10,18,30,0.96))' : undefined,
                  boxShadow: esPartidoOyonesa ? '0 0 0 1px rgba(244,166,66,0.18), 0 10px 24px rgba(244,166,66,0.14)' : undefined,
                }}
              >
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

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {esPartidoOyonesa && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: 'rgba(244,166,66,0.2)',
                        color: '#ffd08a',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      ★ Oyonesa
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: esOyonesaLocal ? '#ffd08a' : '#cdd4f1',
                      fontWeight: esOyonesaLocal ? 800 : 400,
                      textAlign: 'center',
                      textTransform: 'uppercase',
                    }}
                  >
                    {p.equipo_local}
                  </div>

                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color, letterSpacing: '0.05em', textAlign: 'center', minWidth: '70px' }}>
                    {hasPlayedScore(p) ? `${p.goles_local}-${p.goles_visitante}` : '---'}
                  </div>

                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: esOyonesaVisitante ? '#ffd08a' : '#cdd4f1',
                      fontWeight: esOyonesaVisitante ? 800 : 400,
                      textAlign: 'center',
                      textTransform: 'uppercase',
                    }}
                  >
                    {p.equipo_visitante}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDetalle(p);
                    setDetalleGolesLocal(hasPlayedScore(p) ? String(p.goles_local) : '');
                    setDetalleGolesVisitante(hasPlayedScore(p) ? String(p.goles_visitante) : '');
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
              {clasif.map(row => {
                const esOyonesaRow = isOyonesa(row.equipo);
                return (
                  <tr
                    key={row.id}
                    style={{
                      background: esOyonesaRow ? 'rgba(244,166,66,0.12)' : undefined,
                    }}
                  >
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
                      fontWeight: esOyonesaRow ? 700 : 400,
                      color: esOyonesaRow ? '#ffd08a' : '#fff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      fontSize: '0.88rem',
                    }}
                  >
                    {row.equipo}
                    {esOyonesaRow && (
                      <span style={{ marginLeft: '8px', color: '#ffd08a', fontSize: '0.78rem' }}>★</span>
                    )}
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
                        background: esOyonesaRow ? 'rgba(244,166,66,0.22)' : 'rgba(255,255,255,0.07)',
                        color: esOyonesaRow ? '#ffd08a' : '#fff',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                      }}
                    >
                      {row.pts}
                    </span>
                  </td>
                </tr>
                );
              })}
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
                  {detalle.equipo_local} {hasPlayedScore(detalle) ? `${detalle.goles_local}-${detalle.goles_visitante}` : '---'} {detalle.equipo_visitante}
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
                <p style={{ margin: 0, fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>Resultado del partido</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    value={detalleGolesLocal}
                    onChange={e => setDetalleGolesLocal(e.target.value)}
                    placeholder="Local"
                    style={inputStyle}
                  />
                  <span style={{ color: '#7f96bc', fontWeight: 700, textAlign: 'center' }}>-</span>
                  <input
                    type="number"
                    min={0}
                    value={detalleGolesVisitante}
                    onChange={e => setDetalleGolesVisitante(e.target.value)}
                    placeholder="Visitante"
                    style={inputStyle}
                  />
                  <button
                    onClick={handleGuardarResultadoDetalle}
                    disabled={saving}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: saving ? '#555' : '#16d67a',
                      color: '#071119',
                      fontWeight: 700,
                      border: 'none',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    Guardar
                  </button>
                </div>
                <button
                  onClick={handleEliminarResultadoDetalle}
                  disabled={saving || !hasPlayedScore(detalle)}
                  style={{
                    justifySelf: 'start',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: saving || !hasPlayedScore(detalle) ? 'rgba(127,150,188,0.18)' : 'rgba(244,66,66,0.12)',
                    color: saving || !hasPlayedScore(detalle) ? '#8ba0c2' : '#f44242',
                    border: saving || !hasPlayedScore(detalle) ? '1px solid rgba(127,150,188,0.28)' : '1px solid rgba(244,66,66,0.25)',
                    cursor: saving || !hasPlayedScore(detalle) ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                  }}
                >
                  Eliminar resultado
                </button>
              </div>
            )}

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
