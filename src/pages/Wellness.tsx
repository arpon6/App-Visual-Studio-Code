import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { usePlantilla } from '../lib/usePlantilla';
import './Wellness.css';

interface WellnessResponse {
  id: string;
  player_id: string;
  event_date: string;
  event_type: WellnessTestType;
  rpe: number | null;
  animo: number | null;
  fisico: number | null;
  molestias: string | null;
  created_at: string;
}

type WellnessTestType = 'pre_entrenamiento' | 'post_entrenamiento';

const WELLNESS_TEST_OPTIONS: { type: WellnessTestType; label: string; shortLabel: string }[] = [
  { type: 'pre_entrenamiento', label: 'PRE ENTRENAMIENTO', shortLabel: 'PRE' },
  { type: 'post_entrenamiento', label: 'POST ENTRENAMIENTO', shortLabel: 'POST' },
];

type WellnessStoredEntry = {
  animo?: number | null;
  fisico?: number | null;
  rpe?: number | null;
  comentario?: string | null;
  saved_at?: string;
};

type WellnessStoredPayload = {
  pre?: WellnessStoredEntry;
  post?: WellnessStoredEntry;
};

function getSupabaseProjectRef() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return 'No disponible';
  try {
    const host = new URL(supabaseUrl).hostname;
    return host.split('.')[0] || host;
  } catch {
    return 'URL no valida';
  }
}

function testTypeLabel(type: WellnessTestType) {
  return WELLNESS_TEST_OPTIONS.find(option => option.type === type)?.label || 'TEST';
}

function parseWellnessPayloadText(raw: string | null | undefined): WellnessStoredPayload {
  if (!raw || !raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as WellnessStoredPayload;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // fallback to legacy plain-text comments
  }

  return {};
}

function parseWellnessStoredPayload(response: WellnessResponse | null): WellnessStoredPayload {
  if (!response) return {};
  return parseWellnessPayloadText(response.molestias?.trim());
}

function buildWellnessStoredPayload(current: WellnessStoredPayload, type: WellnessTestType, values: { animo?: number | null; fisico?: number | null; rpe?: number | null; comentario?: string | null }) {
  const next: WellnessStoredPayload = { ...current };
  const entry: WellnessStoredEntry = {
    ...values,
    saved_at: new Date().toISOString(),
  };

  if (type === 'pre_entrenamiento') {
    next.pre = entry;
  } else {
    next.post = entry;
  }

  return next;
}

function getWellnessDisplayState(payload: WellnessStoredPayload, type: WellnessTestType) {
  const entry = type === 'pre_entrenamiento' ? payload.pre : payload.post;
  return {
    exists: Boolean(entry),
    animo: payload.pre?.animo ?? 3,
    fisico: payload.pre?.fisico ?? 3,
    rpe: payload.post?.rpe ?? 3,
    comentario: entry?.comentario || '',
  };
}

function serializeWellnessPayload(payload: WellnessStoredPayload) {
  return JSON.stringify(payload);
}

function hasStoredEntryForType(response: WellnessResponse, type: WellnessTestType) {
  const payload = parseWellnessStoredPayload(response);
  return type === 'pre_entrenamiento' ? Boolean(payload.pre) : Boolean(payload.post);
}

interface WellnessPoint {
  label: string;
  rpe: number;
  animo: number;
  fisico: number;
}

interface CalendarEvent {
  id: string;
  date: string; // DD/MM/YYYY
  type: string;
}

function parseLocalDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function weekStart(iso: string) {
  const d = parseLocalDate(iso);
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart(iso: string) {
  const [y, m] = iso.split('-');
  return `${y}-${String(Number(m)).padStart(2, '0')}-01`;
}

function addDays(iso: string, n: number) {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addWeeks(iso: string, n: number) { return addDays(iso, n * 7); }
function addMonths(iso: string, n: number) {
  const d = parseLocalDate(iso);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LOCAL_WELLNESS_STORAGE_KEY = 'wellness_local_responses';

type LocalWellnessRecord = {
  player_id: string;
  event_date: string;
  event_type: WellnessTestType;
  rpe: number | null;
  animo: number | null;
  fisico: number | null;
  molestias: string | null;
  updated_at: string;
};

type SyncResult = {
  ok: boolean;
  errorMessage?: string;
};

function readLocalWellnessResponses() {
  try {
    const raw = localStorage.getItem(LOCAL_WELLNESS_STORAGE_KEY);
    if (!raw) return [] as LocalWellnessRecord[];
    const parsed = JSON.parse(raw) as LocalWellnessRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as LocalWellnessRecord[];
  }
}

async function syncWellnessRecordToSupabase(record: LocalWellnessRecord): Promise<SyncResult> {
  try {
    const { error: deleteError } = await supabase
      .from('wellness_responses')
      .delete()
      .eq('player_id', record.player_id)
      .eq('event_date', record.event_date)
      .eq('event_type', record.event_type);

    if (deleteError) {
      console.error('No se pudo limpiar wellness duplicado en Supabase:', deleteError);
    }

    const { error: insertError } = await supabase
      .from('wellness_responses')
      .insert({
        player_id: record.player_id,
        event_date: record.event_date,
        event_type: record.event_type,
        rpe: record.rpe,
        animo: record.animo,
        fisico: record.fisico,
        molestias: record.molestias,
      });

    if (insertError) {
      console.error('No se pudo insertar wellness en Supabase:', insertError);
      return { ok: false, errorMessage: insertError.message || 'Error de Supabase al guardar' };
    }

    return { ok: true };
  } catch (err) {
    console.error('No se pudo sincronizar wellness con Supabase:', err);
    return { ok: false, errorMessage: err instanceof Error ? err.message : 'Fallo de red o permisos' };
  }
}

async function deleteWellnessRecordFromSupabase(playerId: string, eventDate: string, eventType: WellnessTestType): Promise<SyncResult> {
  try {
    const { error } = await supabase
      .from('wellness_responses')
      .delete()
      .match({
        player_id: playerId,
        event_date: eventDate,
        event_type: eventType,
      });

    if (error) {
      console.error('No se pudo eliminar wellness en Supabase:', error);
      return { ok: false, errorMessage: error.message || 'Error de Supabase al eliminar' };
    }

    return { ok: true };
  } catch (err) {
    console.error('No se pudo borrar wellness en Supabase:', err);
    return { ok: false, errorMessage: err instanceof Error ? err.message : 'Fallo de red o permisos' };
  }
}

async function syncAllLocalWellnessToSupabase() {
  const pending = readLocalWellnessResponses();
  if (!pending.length) return;

  for (const record of pending) {
    await syncWellnessRecordToSupabase(record);
  }
}

function writeLocalWellnessResponse(record: LocalWellnessRecord) {
  try {
    const existing = readLocalWellnessResponses();
    const filtered = existing.filter(item => !(item.player_id === record.player_id && item.event_date === record.event_date && item.event_type === record.event_type));
    filtered.push(record);
    localStorage.setItem(LOCAL_WELLNESS_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore localStorage write errors
  }
}

function deleteLocalWellnessResponse(playerId: string, eventDate: string, eventType: WellnessTestType) {
  try {
    const existing = readLocalWellnessResponses();
    const filtered = existing.filter(item => !(item.player_id === playerId && item.event_date === eventDate && item.event_type === eventType));
    localStorage.setItem(LOCAL_WELLNESS_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore localStorage delete errors
  }
}

function readLocalWellnessRecord(playerId: string, eventDate: string, eventType: WellnessTestType) {
  return readLocalWellnessResponses().find(item => item.player_id === playerId && item.event_date === eventDate && item.event_type === eventType) || null;
}

function buildLocalWellnessResponse(record: LocalWellnessRecord): WellnessResponse {
  return {
    id: `local-${record.player_id}-${record.event_date}-${record.event_type}`,
    player_id: record.player_id,
    event_date: record.event_date,
    event_type: record.event_type,
    rpe: record.rpe,
    animo: record.animo,
    fisico: record.fisico,
    molestias: record.molestias,
    created_at: record.updated_at,
  };
}

type WellnessSaveError = {
  name: string;
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  toJSON?: () => object;
} | null;

function isUniqueConstraintError(error: WellnessSaveError) {
  if (!error) return false;
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return error.code === '23505' || /duplicate key|unique constraint|violates unique/i.test(message);
}

// ── Slider con color dinámico ──────────────────────────────────────────────
function WellnessSlider({ value, onChange, min = 1, max = 10, colorClass, labelMin, labelMax }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; colorClass: string; labelMin: string; labelMax: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <>
      <input
        type="range" min={min} max={max} value={value}
        className={`wellness-slider ${colorClass}`}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={e => onChange(Number(e.target.value))}
      />
      <div className="wellness-slider-range"><span>{labelMin} ({min})</span><span>MÁXIMO ({max})</span></div>
    </>
  );
}

// ── Gráfico de barras SVG ──────────────────────────────────────────────────
function GroupedWellnessChart({ data }: { data: WellnessPoint[] }) {
  const W = 600; const H = 200; const PAD = { top: 20, bottom: 40, left: 30, right: 10 };
  const barW = 14; const groupGap = 40;
  const chartW = Math.max(W, data.length * (barW * 3 + groupGap + 10));
  const maxVal = 10;
  const yScale = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / maxVal);
  const colors = ['#f5c518', '#00e676', '#4fc3f7'];

  return (
    <div className="wellness-chart-wrap">
      <svg className="wellness-chart-svg" width={chartW} height={H} viewBox={`0 0 ${chartW} ${H}`}>
        {[0, 2, 4, 6, 8, 10].map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={chartW - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="#2a2d3e" strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(v) + 4} textAnchor="end" fontSize={9} fill="#8b8fa8">{v}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = PAD.left + i * (barW * 3 + groupGap);
          return (
            <g key={i}>
              {[d.rpe, d.fisico, d.animo].map((v, j) => (
                <rect key={j} x={x0 + j * (barW + 2)} y={yScale(v)} width={barW}
                  height={H - PAD.bottom - yScale(v)} fill={colors[j]} rx={3} opacity={.85} />
              ))}
              <text x={x0 + barW * 1.5} y={H - PAD.bottom + 14} textAnchor="middle" fontSize={10} fill="#8b8fa8">{d.label}</text>
            </g>
          );
        })}
        {/* Leyenda */}
        {['ESFUERZO', 'FÍSICO', 'ÁNIMO'].map((l, i) => (
          <g key={l} transform={`translate(${PAD.left + i * 90}, ${H - 8})`}>
            <rect width={10} height={10} fill={colors[i]} rx={2} />
            <text x={14} y={9} fontSize={9} fill="#8b8fa8">{l}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function CategoryAveragesChart({ data }: { data: { label: string; value: number; colorClass: string }[] }) {
  return (
    <div className="wellness-category-chart">
      {data.map(item => {
        const widthPct = `${Math.max(0, Math.min(100, (item.value / 10) * 100))}%`;
        return (
          <div className="wellness-category-row" key={item.label}>
            <div className="wellness-category-row-top">
              <span>{item.label}</span>
              <strong>{item.value > 0 ? item.value.toFixed(1) : '—'}</strong>
            </div>
            <div className="wellness-category-track">
              <div className={`wellness-category-fill ${item.colorClass}`} style={{ width: widthPct }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// VISTA JUGADOR
// ══════════════════════════════════════════════════════════════════════════
function WellnessJugador({ playerId }: { playerId: string }) {
  const today = todayISO();
  const supabaseProjectRef = getSupabaseProjectRef();
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [testType, setTestType] = useState<WellnessTestType>('pre_entrenamiento');
  const [rpe, setRpe] = useState(3);
  const [animo, setAnimo] = useState(3);
  const [fisico, setFisico] = useState(3);
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [alreadySent, setAlreadySent] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'error' | 'success'>('error');
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Cargar eventos del calendario desde localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('calendarEvents');
      if (raw) setCalEvents(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // El wellness solo está disponible cuando hay entrenamiento
  const hasTrainingToday = useMemo(() => {
    const display = isoToDisplay(today);
    return calEvents.some(e => e.date === display && e.type === 'entrenamiento');
  }, [calEvents, today]);

  useEffect(() => {
    void syncAllLocalWellnessToSupabase();
  }, []);

  useEffect(() => {
    if (!hasTrainingToday || !playerId) {
      setAlreadySent(false);
      setRpe(3);
      setAnimo(3);
      setFisico(3);
      setComentario('');
      return;
    }

    const loadExisting = async () => {
      setLoadingExisting(true);
      setStatusMsg('');
      try {
        const { data, error } = await supabase
          .from('wellness_responses')
          .select('*')
          .eq('player_id', playerId)
          .eq('event_date', today)
          .eq('event_type', testType)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const existing = data[0] as WellnessResponse;
          const payload = parseWellnessStoredPayload(existing);
          const entry = testType === 'pre_entrenamiento' ? payload.pre : payload.post;
          if (entry) {
            setRpe(testType === 'post_entrenamiento' ? (entry.rpe ?? 3) : 3);
            setAnimo(testType === 'pre_entrenamiento' ? (entry.animo ?? 3) : 3);
            setFisico(testType === 'pre_entrenamiento' ? (entry.fisico ?? 3) : 3);
            setComentario(entry.comentario?.trim() || '');
            setAlreadySent(true);
            return;
          }
        }

        const local = readLocalWellnessRecord(playerId, today, testType);
        if (local) {
          setRpe(testType === 'post_entrenamiento' ? (local.rpe ?? 3) : 3);
          setAnimo(testType === 'pre_entrenamiento' ? (local.animo ?? 3) : 3);
          setFisico(testType === 'pre_entrenamiento' ? (local.fisico ?? 3) : 3);
          setComentario(local.molestias?.trim() || '');
          setAlreadySent(true);
          return;
        }

        setAlreadySent(false);
        setRpe(3);
        setAnimo(3);
        setFisico(3);
        setComentario('');
      } catch (err) {
        console.error('Error cargando wellness:', err);
        const local = readLocalWellnessRecord(playerId, today, testType);
        if (local) {
          setRpe(testType === 'post_entrenamiento' ? (local.rpe ?? 3) : 3);
          setAnimo(testType === 'pre_entrenamiento' ? (local.animo ?? 3) : 3);
          setFisico(testType === 'pre_entrenamiento' ? (local.fisico ?? 3) : 3);
          setComentario(local.molestias?.trim() || '');
          setAlreadySent(true);
        } else {
          setAlreadySent(false);
          setRpe(3);
          setAnimo(3);
          setFisico(3);
          setComentario('');
        }
      } finally {
        setLoadingExisting(false);
      }
    };

    void loadExisting();
  }, [hasTrainingToday, playerId, testType, today]);

  const handleSubmit = async () => {
    if (!hasTrainingToday || !playerId) return;
    setSaving(true);
    setStatusMsg('');

    const localRecord: LocalWellnessRecord = {
      player_id: playerId,
      event_date: today,
      event_type: testType,
      rpe: testType === 'post_entrenamiento' ? rpe : null,
      animo: testType === 'pre_entrenamiento' ? animo : null,
      fisico: testType === 'pre_entrenamiento' ? fisico : null,
      molestias: serializeWellnessPayload(buildWellnessStoredPayload(parseWellnessPayloadText(null), testType, {
        animo: testType === 'pre_entrenamiento' ? animo : null,
        fisico: testType === 'pre_entrenamiento' ? fisico : null,
        rpe: testType === 'post_entrenamiento' ? rpe : null,
        comentario: comentario.trim() || null,
      })),
      updated_at: new Date().toISOString(),
    };

    writeLocalWellnessResponse(localRecord);
    const syncResult = await syncWellnessRecordToSupabase(localRecord);

    setAlreadySent(true);
    if (syncResult.ok) {
      setStatusType('success');
      setStatusMsg(`${testTypeLabel(testType)} guardado y sincronizado.`);
    } else {
      setStatusType('error');
      setStatusMsg(`Guardado local. Sin sincronizar: ${syncResult.errorMessage || 'revisa conexión o permisos de Supabase'}.`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!hasTrainingToday || !playerId) return;
    setSaving(true);
    setStatusMsg('');

    deleteLocalWellnessResponse(playerId, today, testType);
    const syncResult = await deleteWellnessRecordFromSupabase(playerId, today, testType);
    setAlreadySent(false);
    setRpe(3);
    setAnimo(3);
    setFisico(3);
    setComentario('');
    if (syncResult.ok) {
      setStatusType('success');
      setStatusMsg(`${testTypeLabel(testType)} eliminado y sincronizado.`);
    } else {
      setStatusType('error');
      setStatusMsg(`Eliminado local. Sin sincronizar: ${syncResult.errorMessage || 'revisa conexión o permisos de Supabase'}.`);
    }
    setSaving(false);
  };

  const dayName = new Date(today + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!hasTrainingToday) {
    return (
      <div className="wellness-no-event card">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>Hoy no hay entrenamiento programado.</p>
        <small>Los tests Pre/Post solo aparecen cuando el calendario tiene un evento de entrenamiento.</small>
      </div>
    );
  }

  return (
    <div className="wellness-two-col">
      <div className="card wellness-form-card">
        <div className="wellness-test-switch" role="tablist" aria-label="Tipo de test">
          {WELLNESS_TEST_OPTIONS.map(option => (
            <button
              key={option.type}
              type="button"
              className={testType === option.type ? 'active' : ''}
              onClick={() => setTestType(option.type)}
              disabled={saving || loadingExisting}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>
        <div className="wellness-form-title">
          <div>
            <h2>{testTypeLabel(testType)}</h2>
          </div>
          <div className="wellness-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
        </div>
        <p className="wellness-form-subtitle">{dayName.toUpperCase()}</p>
        <p className="wellness-response-hint">Proyecto Supabase: {supabaseProjectRef}</p>
        {loadingExisting ? (
          <p className="wellness-response-hint">Cargando tu respuesta de hoy...</p>
        ) : alreadySent ? (
          <p className="wellness-response-hint success">Ya has enviado tu {testTypeLabel(testType)} de hoy. Puedes editar o eliminar la respuesta.</p>
        ) : null}

        {testType === 'pre_entrenamiento' ? (
          <>
            <div className="wellness-slider-group">
              <div className="wellness-slider-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e676" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                ESTADO FÍSICO
                <span className="wellness-slider-value val-fisico">{fisico}</span>
              </div>
              <WellnessSlider value={fisico} onChange={setFisico} min={1} max={5} colorClass="fisico" labelMin="BAJO" labelMax="ÓPTIMO" />
            </div>

            <div className="wellness-slider-group">
              <div className="wellness-slider-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                ESTADO ANÍMICO
                <span className="wellness-slider-value val-animo">{animo}</span>
              </div>
              <WellnessSlider value={animo} onChange={setAnimo} min={1} max={5} colorClass="animo" labelMin="BAJO" labelMax="ÓPTIMO" />
            </div>
          </>
        ) : (
          <div className="wellness-slider-group">
            <div className="wellness-slider-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              ESFUERZO PERCIBIDO
              <span className="wellness-slider-value val-rpe">{rpe}</span>
            </div>
            <WellnessSlider value={rpe} onChange={setRpe} min={1} max={5} colorClass="rpe" labelMin="MUY SUAVE" labelMax="MUY ALTO" />
          </div>
        )}

        <div className="wellness-slider-group">
          <div className="wellness-slider-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            {testType === 'pre_entrenamiento' ? 'ACLARACIONES' : 'OBSERVACIÓN O MOLESTIA'}
          </div>
          <textarea
            className="wellness-textarea"
            placeholder={testType === 'pre_entrenamiento' ? 'Escribe cualquier aclaración previa al entrenamiento...' : 'Escribe cualquier observación o molestia tras el entrenamiento...'}
            value={comentario}
            onChange={e => setComentario(e.target.value)}
          />
        </div>

        {statusMsg && (
          <p style={{ color: statusType === 'error' ? '#ff7b7b' : '#9af5c3', fontSize: 13, marginBottom: 8 }}>
            {statusMsg}
          </p>
        )}

        <div className="wellness-actions">
          <button className="wellness-submit" onClick={handleSubmit} disabled={saving || loadingExisting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            {saving ? 'GUARDANDO...' : alreadySent ? 'GUARDAR CAMBIOS' : `ENVIAR ${WELLNESS_TEST_OPTIONS.find(option => option.type === testType)?.shortLabel}`}
          </button>
          {alreadySent && (
            <button className="wellness-delete" onClick={handleDelete} disabled={saving || loadingExisting}>
              ELIMINAR {WELLNESS_TEST_OPTIONS.find(option => option.type === testType)?.shortLabel}
            </button>
          )}
        </div>
      </div>

      <div className="wellness-info-card">
        <div className="wellness-info-section">
          <h4>IMPORTANCIA DEL WELLNESS</h4>
          <ul>
            <li>Ajustar la carga individual de entrenamiento.</li>
            <li>Prevenir lesiones por sobreentrenamiento.</li>
            <li>Monitorizar el estado anímico del grupo.</li>
            <li>Comunicar molestias de forma rápida.</li>
          </ul>
        </div>
        <div className="wellness-info-section wellness-aviso">
          <h4>⚠ AVISO DIRECTO</h4>
          <p>Si tienes una molestia aguda o dolor que te pueda impedir entrenar en condiciones óptimas, además de rellenar este formulario, avisa directamente al fisioterapeuta o preparador físico lo antes posible para facilitar la planificación del entrenamiento. Gracias.</p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// VISTA CUERPO TÉCNICO
// ══════════════════════════════════════════════════════════════════════════
function WellnessDashboard() {
  const { user } = useAuth();
  const jugadores = usePlantilla();
  const [refDate, setRefDate] = useState(todayISO());
  const [testType, setTestType] = useState<WellnessTestType>('pre_entrenamiento');
  const [responses, setResponses] = useState<WellnessResponse[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dashboardMsg, setDashboardMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const canSeeWeeklyRanking = user?.role === 'entrenador' || user?.role === 'preparador_fisico';

  const dayFrom = refDate;
  const dayTo = refDate;
  const weekFrom = weekStart(refDate);
  const weekTo = addDays(weekFrom, 6);
  const monthFrom = monthStart(refDate);
  const monthTo = addDays(addMonths(monthFrom, 1), -1);

  const weekLabel = `${isoToDisplay(weekFrom)} - ${isoToDisplay(weekTo)}`;
  const monthLabel = new Date(refDate + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  useEffect(() => {
    void syncAllLocalWellnessToSupabase();
  }, []);

  useEffect(() => {
    const loadResponses = async () => {
      const { data, error } = await supabase
        .from('wellness_responses')
        .select('*')
        .gte('event_date', monthFrom)
        .lte('event_date', monthTo);

      const remoteResponses = (data as WellnessResponse[]) || [];
      const localResponses = readLocalWellnessResponses()
        .filter(item => item.event_date >= monthFrom && item.event_date <= monthTo)
        .map(item => buildLocalWellnessResponse(item));

      const merged = new Map<string, WellnessResponse>();
      [...remoteResponses, ...localResponses].forEach(response => {
        const key = `${response.player_id}-${response.event_date}-${response.event_type}`;
        merged.set(key, response);
      });

      if (error) {
        setResponses([...merged.values()]);
        setDashboardMsg({ type: 'error', text: 'Se cargaron las respuestas guardadas localmente.' });
        return;
      }

      setResponses([...merged.values()]);
    };

    void loadResponses();
  }, [monthFrom, monthTo]);

  const navigate = (dir: 1 | -1) => setRefDate(d => addDays(d, dir));

  const responsesByType = useMemo(
    () => responses.filter(response => hasStoredEntryForType(response, testType)),
    [responses, testType],
  );

  const dayResponses = useMemo(
    () => responsesByType.filter(r => r.event_date >= dayFrom && r.event_date <= dayTo),
    [responsesByType, dayFrom, dayTo],
  );

  const weekResponses = useMemo(
    () => responsesByType.filter(r => r.event_date >= weekFrom && r.event_date <= weekTo),
    [responsesByType, weekFrom, weekTo],
  );

  const weeklyRankingRows = useMemo(() => {
    const weeklyCounts = new Map<string, number>();
    responses
      .filter(response => response.event_date >= weekFrom && response.event_date <= weekTo)
      .forEach(response => {
        const key = String(response.player_id);
        weeklyCounts.set(key, (weeklyCounts.get(key) || 0) + 1);
      });

    return jugadores
      .map(jugador => ({
        id: String(jugador.id),
        nombre: jugador.nombre,
        respuestas: weeklyCounts.get(String(jugador.id)) || 0,
      }))
      .sort((a, b) => {
        if (b.respuestas !== a.respuestas) return b.respuestas - a.respuestas;
        return a.nombre.localeCompare(b.nombre, 'es-ES');
      });
  }, [responses, weekFrom, weekTo, jugadores]);

  const monthResponses = responsesByType;
  const playersById = useMemo(() => new Map(jugadores.map(j => [String(j.id), j.nombre])), [jugadores]);

  const avgNullable = (arr: Array<number | null>) => {
    const valid = arr.filter((value): value is number => typeof value === 'number');
    return valid.length ? +(valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(1) : 0;
  };

  const avgFisicoMes = avgNullable(monthResponses.map(response => testType === 'pre_entrenamiento' ? response.fisico : null));
  const avgAnimoMes = avgNullable(monthResponses.map(response => testType === 'pre_entrenamiento' ? response.animo : null));
  const avgRpeMes = avgNullable(monthResponses.map(response => testType === 'post_entrenamiento' ? response.rpe : null));

  const handleDeleteResponse = async (responseId: string) => {
    const shouldDelete = window.confirm('¿Quieres eliminar esta respuesta de wellness? Esta acción no se puede deshacer.');
    if (!shouldDelete) return;

    const response = responses.find(item => item.id === responseId);
    if (!response) return;

    setDeletingId(responseId);
    setDashboardMsg(null);

    deleteLocalWellnessResponse(response.player_id, response.event_date, response.event_type);
    const syncResult = await deleteWellnessRecordFromSupabase(response.player_id, response.event_date, response.event_type);

    setResponses(prev => prev.filter(item => item.id !== responseId));
    setDeletingId(null);
    if (syncResult.ok) {
      setDashboardMsg({ type: 'success', text: 'Respuesta eliminada y sincronizada.' });
    } else {
      setDashboardMsg({ type: 'error', text: `Respuesta eliminada localmente, pero no sincronizada: ${syncResult.errorMessage || 'revisa conexión o permisos de Supabase'}.` });
    }
  };

  const dayResponseRows = useMemo(() => {
    return [...dayResponses]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(response => {
        const payload = parseWellnessStoredPayload(response);
        const displayState = getWellnessDisplayState(payload, testType);
        return {
          ...response,
          jugador: playersById.get(String(response.player_id)) || String(response.player_id),
          displayState,
        };
      });
  }, [dayResponses, playersById, testType]);

  return (
    <div className="wellness-page">
      {/* Controles */}
      <div className="wellness-header">
        <div>
          <div className="badge">WELLNESS</div>
          <h1>Cuestionario Wellness</h1>
          <small style={{ color: 'var(--text-muted)' }}>SEGUIMIENTO PRE Y POST DE CADA ENTRENAMIENTO</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="wellness-test-switch" role="tablist" aria-label="Filtro de test">
            {WELLNESS_TEST_OPTIONS.map(option => (
              <button
                key={option.type}
                type="button"
                className={testType === option.type ? 'active' : ''}
                onClick={() => setTestType(option.type)}
              >
                {option.shortLabel}
              </button>
            ))}
          </div>
          <div className="wellness-date-nav">
            <button onClick={() => navigate(-1)}>‹</button>
            <span>{isoToDisplay(refDate)}</span>
            <button onClick={() => navigate(1)}>›</button>
          </div>
        </div>
      </div>

      {dashboardMsg && (
        <p className={`wellness-dashboard-message ${dashboardMsg.type === 'error' ? 'error' : 'success'}`}>
          {dashboardMsg.text}
        </p>
      )}

      {/* KPIs */}
      <div className="wellness-kpi-row">
        <div className="wellness-kpi">
          <div className="wellness-kpi-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            RESPUESTAS DEL DÍA
          </div>
          <div className="wellness-kpi-value" style={{ color: '#f5c518' }}>{dayResponses.length}</div>
        </div>
        <div className="wellness-kpi">
          <div className="wellness-kpi-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
            RESPUESTAS DE LA SEMANA
          </div>
          <div className="wellness-kpi-value" style={{ color: '#4fc3f7' }}>{weekResponses.length}</div>
        </div>
        <div className="wellness-kpi">
          <div className="wellness-kpi-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00e676" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            RESPUESTAS DEL MES
          </div>
          <div className="wellness-kpi-value" style={{ color: '#00e676' }}>{monthResponses.length}</div>
        </div>
        <div className="wellness-kpi">
          <div className="wellness-kpi-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b8fa8" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
            {testType === 'pre_entrenamiento' ? 'PROMEDIO FÍSICO / ÁNIMO' : 'PROMEDIO ESFUERZO'}
          </div>
          <div className="wellness-kpi-value">
            {testType === 'pre_entrenamiento' ? `${avgFisicoMes || 0} / ${avgAnimoMes || 0}` : `${avgRpeMes || 0}`}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <small>Detalle editable por fecha</small>
            <h2>{testTypeLabel(testType)} del día seleccionado</h2>
          </div>
          <span className="wellness-responses-count">{dayResponseRows.length} respuestas</span>
        </div>
        {dayResponseRows.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>No hay respuestas registradas para este día.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="wellness-table">
              <thead>
                <tr>
                  <th>JUGADOR</th>
                  <th>FECHA</th>
                  {testType === 'pre_entrenamiento' ? (
                    <>
                      <th>ESTADO FÍSICO</th>
                      <th>ESTADO ANÍMICO</th>
                      <th>ACLARACIÓN</th>
                    </>
                  ) : (
                    <>
                      <th>ESFUERZO PERCIBIDO</th>
                      <th>OBSERVACIÓN / MOLESTIA</th>
                    </>
                  )}
                  <th>ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {dayResponseRows.map(response => (
                  <tr key={response.id}>
                    <td>
                      <div className="player-cell">
                        <div className="wellness-avatar">{String(response.jugador).charAt(0)}</div>
                        {String(response.jugador)}
                      </div>
                    </td>
                    <td>{isoToDisplay(response.event_date)}</td>
                    {testType === 'pre_entrenamiento' ? (
                      <>
                        <td><span className="wellness-dot dot-fisico">{response.displayState.fisico ?? '-'}</span></td>
                        <td><span className="wellness-dot dot-animo">{response.displayState.animo ?? '-'}</span></td>
                        <td><span className="wellness-molestia">{response.displayState.comentario?.trim() || 'Sin aclaración'}</span></td>
                      </>
                    ) : (
                      <>
                        <td><span className="wellness-dot dot-rpe">{response.displayState.rpe ?? '-'}</span></td>
                        <td><span className="wellness-molestia">{response.displayState.comentario?.trim() || 'Sin observación'}</span></td>
                      </>
                    )}
                    <td>
                      <button
                        className="wellness-table-delete"
                        onClick={() => void handleDeleteResponse(response.id)}
                        disabled={deletingId === response.id}
                      >
                        {deletingId === response.id ? 'ELIMINANDO...' : 'ELIMINAR'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canSeeWeeklyRanking && (
        <div className="card">
          <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <small>{weekLabel}</small>
              <h2>Clasificación de respuestas</h2>
            </div>
            <span className="wellness-responses-count">{weeklyRankingRows.length} jugadores</span>
          </div>
          {weeklyRankingRows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>No hay jugadores en plantilla.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="wellness-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>JUGADOR</th>
                    <th>RESPUESTAS (SEMANA)</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRankingRows.map((row, index) => (
                    <tr key={row.id}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="player-cell">
                          <div className="wellness-avatar">{String(row.nombre).charAt(0)}</div>
                          {row.nombre}
                        </div>
                      </td>
                      <td>{row.respuestas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE RAÍZ
// ══════════════════════════════════════════════════════════════════════════
function Wellness() {
  const { user } = useAuth();
  const isJugador = user?.role === 'jugador';
  const isStaff = Boolean(user?.role && ['entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN'].includes(user.role));

  if (isJugador) {
    // VERIFICA SI HAY player_id EN EL USUARIO
    if (!user || !user.player_id) {
      return (
        <section className="page-section">
          <p style={{ color: 'var(--text-muted)' }}>Tu cuenta de jugador no está vinculada a ningún jugador de la plantilla. Contacta con el administrador.</p>
        </section>
      );
    }
    return (
      <section className="page-section">
        <div className="page-title">
          <div>
            <div className="badge">WELLNESS</div>
            <h1>Cuestionario Wellness</h1>
            <small style={{ color: 'var(--text-muted)' }}>SEGUIMIENTO DE CARGA Y ESTADO DEL DEPORTISTA</small>
          </div>
        </div>
        {/* PASA EL player_id DEL USUARIO AL COMPONENTE */}
        <WellnessJugador playerId={String(user.player_id)} /> 
      </section>
    );
  }

  if (isStaff) {
    return (
      <section className="page-section">
        <WellnessDashboard />
      </section>
    );
  }

  return (
    <section className="page-section">
      <WellnessDashboard />
    </section>
  );
}

export default Wellness;
