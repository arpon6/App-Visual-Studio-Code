import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

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

const MI_EQUIPO = 'CD ARNEDO';

const partidosBase: Omit<Partido, 'id'>[] = [
  { jornada: 1,  fecha: '2023-09-10', equipo_local: 'CD VAREA',           siglas_local: 'CD', goles_local: 2, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 2,  fecha: '2023-09-17', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 1, goles_visitante: 1, equipo_visitante: 'RACING RIOJA',       siglas_visitante: 'RA' },
  { jornada: 3,  fecha: '2023-09-24', equipo_local: 'CD VIANÉS',          siglas_local: 'CD', goles_local: 1, goles_visitante: 1, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 4,  fecha: '2023-10-01', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'PEÑA BALSAMAISO CF', siglas_visitante: 'PE' },
  { jornada: 5,  fecha: '2023-10-08', equipo_local: 'CD TEDEÓN',          siglas_local: 'CD', goles_local: 0, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 6,  fecha: '2023-10-13', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 0, goles_visitante: 1, equipo_visitante: 'CD CALAHORRA B',    siglas_visitante: 'CD' },
  { jornada: 7,  fecha: '2023-10-22', equipo_local: 'ATLÉTICO RIVER EBRO',siglas_local: 'AT', goles_local: 2, goles_visitante: 1, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 8,  fecha: '2023-10-29', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'CASALARREINA CF',   siglas_visitante: 'CA' },
  { jornada: 9,  fecha: '2023-11-05', equipo_local: 'CD BERCEO',          siglas_local: 'CD', goles_local: 0, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 10, fecha: '2023-11-12', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 1, goles_visitante: 1, equipo_visitante: 'COMILLAS CF',       siglas_visitante: 'CO' },
  { jornada: 11, fecha: '2023-11-19', equipo_local: 'SD OYONESA',         siglas_local: 'SD', goles_local: 1, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 12, fecha: '2023-11-26', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 2, goles_visitante: 0, equipo_visitante: 'UD LOGROÑÉS B',     siglas_visitante: 'UD' },
  { jornada: 13, fecha: '2023-12-03', equipo_local: 'CD ALBERITE',        siglas_local: 'CD', goles_local: 0, goles_visitante: 1, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 14, fecha: '2023-12-10', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 0, goles_visitante: 4, equipo_visitante: 'CD LA CALZADA',    siglas_visitante: 'CD' },
  { jornada: 15, fecha: '2024-01-07', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 0, goles_visitante: 1, equipo_visitante: 'CD ANGUIANO',      siglas_visitante: 'CD' },
  { jornada: 16, fecha: '2024-01-14', equipo_local: 'CD ALFARO',          siglas_local: 'CD', goles_local: 2, goles_visitante: 1, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 17, fecha: '2024-01-21', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 3, goles_visitante: 1, equipo_visitante: 'HARO DEPORTIVO',    siglas_visitante: 'HA' },
  { jornada: 18, fecha: '2024-01-28', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 2, goles_visitante: 3, equipo_visitante: 'CD VAREA',          siglas_visitante: 'CD' },
  { jornada: 19, fecha: '2024-02-04', equipo_local: 'RACING RIOJA',       siglas_local: 'RA', goles_local: 2, goles_visitante: 4, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 20, fecha: '2024-02-09', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 0, goles_visitante: 3, equipo_visitante: 'CD VIANÉS',         siglas_visitante: 'CD' },
  { jornada: 21, fecha: '2024-02-18', equipo_local: 'PEÑA BALSAMAISO CF', siglas_local: 'PE', goles_local: 0, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 22, fecha: '2024-02-25', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 4, goles_visitante: 0, equipo_visitante: 'CD TEDEÓN',         siglas_visitante: 'CD' },
  { jornada: 23, fecha: '2024-03-03', equipo_local: 'CD CALAHORRA B',     siglas_local: 'CD', goles_local: 4, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 24, fecha: '2024-03-10', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 3, goles_visitante: 3, equipo_visitante: 'ATLÉTICO RIVER EBRO',siglas_visitante: 'AT' },
  { jornada: 25, fecha: '2024-03-17', equipo_local: 'CASALARREINA CF',    siglas_local: 'CA', goles_local: 1, goles_visitante: 1, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 26, fecha: '2024-03-24', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'CD BERCEO',         siglas_visitante: 'CD' },
  { jornada: 27, fecha: '2024-03-28', equipo_local: 'COMILLAS CF',        siglas_local: 'CO', goles_local: 0, goles_visitante: 2, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 28, fecha: '2024-04-07', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 1, goles_visitante: 0, equipo_visitante: 'SD OYONESA',        siglas_visitante: 'SD' },
  { jornada: 29, fecha: '2024-04-14', equipo_local: 'UD LOGROÑÉS B',      siglas_local: 'UD', goles_local: 4, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 30, fecha: '2024-04-21', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 2, goles_visitante: 2, equipo_visitante: 'CD ALBERITE',       siglas_visitante: 'CD' },
  { jornada: 31, fecha: '2024-04-27', equipo_local: 'CD LA CALZADA',      siglas_local: 'CD', goles_local: 1, goles_visitante: 2, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 32, fecha: '2024-05-01', equipo_local: 'CD ANGUIANO',        siglas_local: 'CD', goles_local: 3, goles_visitante: 1, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
  { jornada: 33, fecha: '2024-05-05', equipo_local: 'CD ARNEDO',          siglas_local: 'AR', goles_local: 0, goles_visitante: 2, equipo_visitante: 'CD ALFARO',         siglas_visitante: 'CD' },
  { jornada: 34, fecha: '2024-05-12', equipo_local: 'HARO DEPORTIVO',     siglas_local: 'HA', goles_local: 3, goles_visitante: 0, equipo_visitante: 'CD ARNEDO',         siglas_visitante: 'AR' },
];

const clasificacionBase: Omit<ClasifRow, 'id'>[] = [
  { posicion: 1,  equipo: 'UD LOGROÑÉS PROMESAS "B"', es_mi_equipo: false, pj: 34, g: 23, e: 7,  p: 4,  gf: 67, gc: 19,  pts: 76 },
  { posicion: 2,  equipo: 'ALFARO',                   es_mi_equipo: false, pj: 34, g: 23, e: 7,  p: 4,  gf: 80, gc: 36,  pts: 76 },
  { posicion: 3,  equipo: 'CALAHORRA "B"',            es_mi_equipo: false, pj: 34, g: 20, e: 7,  p: 7,  gf: 70, gc: 34,  pts: 67 },
  { posicion: 4,  equipo: 'ANGUIANO',                 es_mi_equipo: false, pj: 34, g: 19, e: 8,  p: 7,  gf: 69, gc: 41,  pts: 65 },
  { posicion: 5,  equipo: 'VAREA',                    es_mi_equipo: false, pj: 34, g: 18, e: 7,  p: 9,  gf: 59, gc: 31,  pts: 61 },
  { posicion: 6,  equipo: 'OYONESA',                  es_mi_equipo: false, pj: 34, g: 17, e: 7,  p: 10, gf: 46, gc: 28,  pts: 58 },
  { posicion: 7,  equipo: 'CASALARREINA',             es_mi_equipo: false, pj: 34, g: 15, e: 10, p: 9,  gf: 57, gc: 49,  pts: 55 },
  { posicion: 8,  equipo: 'LA CALZADA',               es_mi_equipo: false, pj: 34, g: 13, e: 9,  p: 12, gf: 52, gc: 43,  pts: 48 },
  { posicion: 9,  equipo: 'BERCEO',                   es_mi_equipo: false, pj: 34, g: 13, e: 8,  p: 13, gf: 43, gc: 44,  pts: 47 },
  { posicion: 10, equipo: 'CD ARNEDO',                es_mi_equipo: true,  pj: 34, g: 11, e: 9,  p: 14, gf: 36, gc: 48,  pts: 42 },
  { posicion: 11, equipo: 'PEÑA BALSAMAISO',          es_mi_equipo: false, pj: 34, g: 12, e: 6,  p: 16, gf: 51, gc: 62,  pts: 42 },
  { posicion: 12, equipo: 'RACING RIOJA',             es_mi_equipo: false, pj: 34, g: 11, e: 6,  p: 17, gf: 37, gc: 55,  pts: 39 },
  { posicion: 13, equipo: 'RIVER EBRO',               es_mi_equipo: false, pj: 34, g: 10, e: 8,  p: 16, gf: 40, gc: 50,  pts: 38 },
  { posicion: 14, equipo: 'VIANES',                   es_mi_equipo: false, pj: 34, g: 9,  e: 6,  p: 19, gf: 30, gc: 62,  pts: 33 },
  { posicion: 15, equipo: 'HARO',                     es_mi_equipo: false, pj: 34, g: 8,  e: 7,  p: 19, gf: 38, gc: 50,  pts: 31 },
  { posicion: 16, equipo: 'TEDEÓN',                   es_mi_equipo: false, pj: 34, g: 8,  e: 6,  p: 20, gf: 25, gc: 61,  pts: 30 },
  { posicion: 17, equipo: 'COMILLAS',                 es_mi_equipo: false, pj: 34, g: 3,  e: 15, p: 16, gf: 38, gc: 59,  pts: 24 },
  { posicion: 18, equipo: 'ALBERITE',                 es_mi_equipo: false, pj: 34, g: 4,  e: 5,  p: 25, gf: 37, gc: 103, pts: 17 },
];

const emptyPartido = (): Omit<Partido, 'id'> => ({
  jornada: 1, fecha: '', equipo_local: MI_EQUIPO, siglas_local: 'AR',
  goles_local: 0, goles_visitante: 0, equipo_visitante: '', siglas_visitante: '',
  competicion: '', acta_url: '',
});

const emptyClasif = (): Omit<ClasifRow, 'id'> => ({
  posicion: 1, equipo: '', es_mi_equipo: false,
  pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0,
});

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
  padding: '8px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(10,18,30,0.9)', color: '#fff', fontSize: '0.9rem', width: '100%',
};

function ResultadosYClasif() {
  const [tab, setTab] = useState<'resultados' | 'clasificacion'>('resultados');
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [clasif, setClasif] = useState<ClasifRow[]>([]);
  const [detalle, setDetalle] = useState<Partido | null>(null);
  const [showAddPartido, setShowAddPartido] = useState(false);
  const [showAddClasif, setShowAddClasif] = useState(false);
  const [formPartido, setFormPartido] = useState(emptyPartido());
  const [formClasif, setFormClasif] = useState(emptyClasif());
  const [saving, setSaving] = useState(false);
  const [actaFile, setActaFile] = useState<File | null>(null);
  const [actaUrl, setActaUrl] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('resultados_partidos').select('*').order('jornada'),
      supabase.from('clasificacion').select('*').order('posicion'),
    ]);
    // Fusionar base estática con datos de Supabase (los de Supabase tienen prioridad)
    const baseIds = partidosBase.map((_, i) => `base-${i}`);
    const supabaseJornadas = new Set((p || []).map((x: Partido) => x.jornada));
    const baseFiltered = partidosBase
      .filter(pb => !supabaseJornadas.has(pb.jornada))
      .map((pb, i) => ({ ...pb, id: baseIds[i] }));
    const allPartidos = [...baseFiltered, ...(p || [])].sort((a, b) => a.jornada - b.jornada);
    setPartidos(allPartidos);

    const supabasePos = new Set((c || []).map((x: ClasifRow) => x.posicion));
    const baseClasifFiltered = clasificacionBase
      .filter(cb => !supabasePos.has(cb.posicion))
      .map((cb, i) => ({ ...cb, id: `base-c-${i}` }));
    const allClasif = [...baseClasifFiltered, ...(c || [])].sort((a, b) => a.posicion - b.posicion);
    setClasif(allClasif);
  };

  const handleGuardarPartido = async () => {
    if (!formPartido.fecha || !formPartido.equipo_visitante) return;
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

    await supabase.from('resultados_partidos').insert({ ...formPartido, acta_url });
    await fetchAll();
    setShowAddPartido(false);
    setFormPartido(emptyPartido());
    setActaFile(null);
    setActaUrl('');
    setUploadMsg('');
    setSaving(false);
  };

  const handleGuardarClasif = async () => {
    if (!formClasif.equipo) return;
    setSaving(true);
    await supabase.from('clasificacion').insert({ ...formClasif, temporada: '2023-24' });
    await fetchAll();
    setShowAddClasif(false);
    setFormClasif(emptyClasif());
    setSaving(false);
  };

  const handleEliminarPartido = async (id: string) => {
    if (!id.startsWith('base-')) await supabase.from('resultados_partidos').delete().eq('id', id);
    await fetchAll();
    setDetalle(null);
  };

  const handleEliminarClasif = async (id: string) => {
    if (!id.startsWith('base-')) await supabase.from('clasificacion').delete().eq('id', id);
    await fetchAll();
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
      // Si es un partido base, insertarlo primero en Supabase
      if (detalle.id.startsWith('base-')) {
        const { data: nuevo } = await supabase.from('resultados_partidos')
          .insert({ ...detalle, id: undefined, acta_url: pub.publicUrl })
          .select().single();
        if (nuevo) setDetalle({ ...detalle, id: nuevo.id, acta_url: pub.publicUrl });
      } else {
        await supabase.from('resultados_partidos').update({ acta_url: pub.publicUrl }).eq('id', detalle.id);
        setDetalle({ ...detalle, acta_url: pub.publicUrl });
      }
      setUploadMsg('✓ Acta subida correctamente.');
      await fetchAll();
    } else {
      setUploadMsg('⚠ Error al subir el archivo.');
    }
    setActaFile(null);
    setSaving(false);
  };

  const esMiEquipoLocal = (p: Partido) =>
    p.equipo_local.toUpperCase().includes('ARNEDO') || p.siglas_local === 'AR';

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Temporada 2023-24</small>
          <h1>Resultados y Clasif.</h1>
        </div>
        {/* Botón sincronizar — preparado para BeSoccer */}
        <button
          title="Próximamente: sincronización con BeSoccer"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', color: '#7f96bc', border: '1px solid rgba(255,255,255,0.1)', cursor: 'not-allowed', fontSize: '0.88rem' }}
        >
          ↻ Sincronizar datos
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        {(['resultados', 'clasificacion'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em',
              background: tab === t ? '#16d67a' : 'rgba(255,255,255,0.06)',
              color: tab === t ? '#071119' : '#7f96bc',
            }}
          >
            {t === 'resultados' ? 'Resultados' : 'Clasificación'}
          </button>
        ))}
        <button
          onClick={() => tab === 'resultados' ? setShowAddPartido(v => !v) : setShowAddClasif(v => !v)}
          style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: '10px', background: '#2d68ff', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
        >
          + Añadir
        </button>
      </div>

      {/* Formulario añadir partido */}
      {tab === 'resultados' && showAddPartido && (
        <div className="card" style={{ padding: '22px', display: 'grid', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Nuevo partido</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            {([
              ['Jornada', 'jornada', 'number'],
              ['Fecha', 'fecha', 'date'],
              ['Equipo local', 'equipo_local', 'text'],
              ['Siglas local', 'siglas_local', 'text'],
              ['Goles local', 'goles_local', 'number'],
              ['Goles visitante', 'goles_visitante', 'number'],
              ['Equipo visitante', 'equipo_visitante', 'text'],
              ['Siglas visitante', 'siglas_visitante', 'text'],
              ['Competición', 'competicion', 'text'],
            ] as const).map(([label, field, type]) => (
              <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
                {label}
                <input
                  type={type}
                  value={(formPartido as any)[field]}
                  onChange={e => setFormPartido(f => ({ ...f, [field]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
                  style={inputStyle}
                />
              </label>
            ))}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
            Acta del partido (PDF, imagen, txt)
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.html" style={{ display: 'none' }} onChange={e => setActaFile(e.target.files?.[0] || null)} />
              <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: '0.82rem' }}>
                📎 {actaFile ? actaFile.name : 'Seleccionar archivo'}
              </button>
              <span style={{ color: '#7f96bc', fontSize: '0.8rem' }}>o pega URL:</span>
              <input type="text" value={actaUrl} onChange={e => { setActaUrl(e.target.value); setFormPartido(f => ({ ...f, acta_url: e.target.value })); }} placeholder="https://..." style={{ ...inputStyle, width: '220px' }} />
            </div>
          </label>
          <button
            onClick={handleGuardarPartido}
            disabled={saving || !formPartido.fecha || !formPartido.equipo_visitante}
            style={{ justifySelf: 'start', padding: '9px 22px', borderRadius: '10px', background: saving ? '#555' : '#16d67a', color: '#071119', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Guardando...' : 'Guardar partido'}
          </button>
        </div>
      )}

      {/* Formulario añadir clasificación */}
      {tab === 'clasificacion' && showAddClasif && (
        <div className="card" style={{ padding: '22px', display: 'grid', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Añadir equipo a clasificación</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            {([
              ['Posición', 'posicion', 'number'],
              ['Equipo', 'equipo', 'text'],
              ['PJ', 'pj', 'number'],
              ['G', 'g', 'number'],
              ['E', 'e', 'number'],
              ['P', 'p', 'number'],
              ['GF', 'gf', 'number'],
              ['GC', 'gc', 'number'],
              ['PTS', 'pts', 'number'],
            ] as const).map(([label, field, type]) => (
              <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc' }}>
                {label}
                <input
                  type={type}
                  value={(formClasif as any)[field]}
                  onChange={e => setFormClasif(f => ({ ...f, [field]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
                  style={inputStyle}
                />
              </label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem', color: '#7f96bc', justifyContent: 'flex-end' }}>
              Mi equipo
              <input type="checkbox" checked={formClasif.es_mi_equipo} onChange={e => setFormClasif(f => ({ ...f, es_mi_equipo: e.target.checked }))} style={{ width: '20px', height: '20px' }} />
            </label>
          </div>
          <button
            onClick={handleGuardarClasif}
            disabled={saving || !formClasif.equipo}
            style={{ justifySelf: 'start', padding: '9px 22px', borderRadius: '10px', background: saving ? '#555' : '#16d67a', color: '#071119', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      {/* RESULTADOS */}
      {tab === 'resultados' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '16px' }}>
          {partidos.length === 0 && (
            <div style={{ gridColumn: '1/-1', color: '#7f96bc', textAlign: 'center', padding: '40px' }}>
              No hay partidos. Pulsa "+ Añadir" para registrar resultados.
            </div>
          )}
          {partidos.map(p => {
            const miLocal = esMiEquipoLocal(p);
            const color = scoreColor(p.goles_local, p.goles_visitante, miLocal);
            return (
              <div key={p.id} className="card" style={{ padding: '18px 20px', display: 'grid', gap: '12px' }}>
                {/* Cabecera */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7f96bc', fontSize: '0.8rem' }}>
                    <span style={{ color: '#16d67a' }}>📅</span>
                    {p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                  </span>
                  <span style={{ padding: '3px 12px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: '#7f96bc', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                    JORNADA {p.jornada}
                  </span>
                </div>

                {/* Equipos + marcador */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px' }}>
                  {/* Local */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#cdd4f1' }}>
                      {p.siglas_local}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#7f96bc', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{p.equipo_local}</span>
                  </div>

                  {/* Marcador */}
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color, letterSpacing: '0.05em', textAlign: 'center', minWidth: '70px' }}>
                    {p.goles_local}-{p.goles_visitante}
                  </div>

                  {/* Visitante */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#cdd4f1' }}>
                      {p.siglas_visitante}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#7f96bc', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{p.equipo_visitante}</span>
                  </div>
                </div>

                {/* Detalles */}
                <button
                  onClick={() => { setDetalle(p); setActaFile(null); setUploadMsg(''); }}
                  style={{ background: 'none', border: 'none', color: '#16d67a', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'left', padding: '4px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  DETALLES &gt;
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* CLASIFICACIÓN */}
      {tab === 'clasificacion' && (
        <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
          <table className="list-table" style={{ minWidth: '640px' }}>
            <thead>
              <tr>
                {['POS', 'EQUIPO', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'PTS'].map(h => (
                  <th key={h} style={{ textAlign: h === 'EQUIPO' ? 'left' : 'center', color: '#7f96bc', fontSize: '0.78rem', letterSpacing: '0.06em', padding: '14px 16px' }}>{h}</th>
                ))}
                <th style={{ width: '40px' }} />
              </tr>
            </thead>
            <tbody>
              {clasif.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: '#7f96bc', padding: '40px' }}>Sin datos. Pulsa "+ Añadir".</td></tr>
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
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => handleEliminarClasif(row.id)} style={{ background: 'none', border: 'none', color: '#f44242', cursor: 'pointer', fontSize: '0.9rem' }} title="Eliminar">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DETALLES */}
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
                  {detalle.competicion ? ` · ${detalle.competicion}` : ''}
                </span>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', color: '#7f96bc', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>

            {/* Acta existente */}
            {detalle.acta_url && (
              <a href={detalle.acta_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: 'rgba(45,104,255,0.15)', color: '#4a9eff', border: '1px solid rgba(45,104,255,0.3)', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}>
                📄 Ver acta del partido
              </a>
            )}

            {/* Subir acta */}
            <div style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '16px', display: 'grid', gap: '12px', background: 'rgba(10,18,30,0.6)' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                {detalle.acta_url ? 'Reemplazar acta' : 'Cargar acta del partido'}
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.html" style={{ display: 'none' }} onChange={e => setActaFile(e.target.files?.[0] || null)} />
                <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: '0.82rem' }}>
                  📎 {actaFile ? actaFile.name : 'Seleccionar archivo'}
                </button>
                <button
                  onClick={handleSubirActaDetalle}
                  disabled={!actaFile || saving}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: actaFile && !saving ? '#16d67a' : '#555', color: '#071119', fontWeight: 700, border: 'none', cursor: actaFile && !saving ? 'pointer' : 'not-allowed', fontSize: '0.82rem' }}
                >
                  {saving ? 'Subiendo...' : 'Subir acta'}
                </button>
              </div>
              {uploadMsg && <p style={{ margin: 0, fontSize: '0.82rem', color: uploadMsg.startsWith('✓') ? '#90f4ae' : '#f4c842' }}>{uploadMsg}</p>}
            </div>

            <button
              onClick={() => { if (confirm('¿Eliminar este partido?')) handleEliminarPartido(detalle.id); }}
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
