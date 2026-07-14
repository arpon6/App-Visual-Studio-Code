import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { usePlantilla } from '../lib/usePlantilla';
import './Wellness.css';

interface WellnessResponse {
  id: string;
  player_id: string;
  event_date: string;
  event_type: string;
  rpe: number;
  animo: number;
  fisico: number;
  molestias: string | null;
  created_at: string;
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

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function weekStart(iso: string) {
  const d = new Date(iso);
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}

function monthStart(iso: string) {
  return iso.slice(0, 7) + '-01';
}

function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function addWeeks(iso: string, n: number) { return addDays(iso, n * 7); }
function addMonths(iso: string, n: number) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
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
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [rpe, setRpe] = useState(5);
  const [animo, setAnimo] = useState(5);
  const [fisico, setFisico] = useState(5);
  const [molestias, setMolestias] = useState('');
  const [saving, setSaving] = useState(false);
  const [alreadySent, setAlreadySent] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Cargar eventos del calendario desde localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('calendarEvents');
      if (raw) setCalEvents(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Evento de hoy (entrenamiento o partido)
  const todayEvent = useMemo(() => {
    const display = isoToDisplay(today);
    return calEvents.find(e => e.date === display && (e.type === 'entrenamiento' || e.type === 'partido'));
  }, [calEvents, today]);

  // Comprobar si ya respondió hoy
  useEffect(() => {
    if (!todayEvent) return;
    const loadExisting = async () => {
      setLoadingExisting(true);
      try {
        const { data } = await supabase
          .from('wellness_responses')
          .select('*')
          .eq('player_id', playerId)
          .eq('event_date', today)
          .maybeSingle();

        if (data) {
          const existing = data as WellnessResponse;
          setRpe(existing.rpe);
          setAnimo(existing.animo);
          setFisico(existing.fisico);
          setMolestias(existing.molestias || '');
          setAlreadySent(true);
        } else {
          setAlreadySent(false);
        }
      } finally {
        setLoadingExisting(false);
      }
    };

    void loadExisting();
  }, [playerId, today, todayEvent]);

  const handleSubmit = async () => {
    if (!todayEvent) return;
    setSaving(true);
    const { error } = await supabase.from('wellness_responses').upsert({
      player_id: playerId,
      event_date: today,
      event_type: todayEvent.type,
      rpe, animo, fisico,
      molestias: molestias.trim() || null,
    }, { onConflict: 'player_id,event_date' });
    setSaving(false);
    if (error) { setStatusMsg('Error al guardar. Inténtalo de nuevo.'); return; }
    setAlreadySent(true);
    setStatusMsg('');
  };

  const handleDelete = async () => {
    if (!todayEvent) return;
    setSaving(true);
    const { error } = await supabase
      .from('wellness_responses')
      .delete()
      .eq('player_id', playerId)
      .eq('event_date', today);
    setSaving(false);

    if (error) {
      setStatusMsg('Error al eliminar. Inténtalo de nuevo.');
      return;
    }

    setAlreadySent(false);
    setRpe(5);
    setAnimo(5);
    setFisico(5);
    setMolestias('');
    setStatusMsg('Respuesta eliminada. Puedes volver a enviarla.');
  };

  const dayName = new Date(today + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!todayEvent) {
    return (
      <div className="wellness-no-event card">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>No hay entrenamiento ni partido programado para hoy.</p>
        <small>El cuestionario estará disponible los días con evento en el calendario.</small>
      </div>
    );
  }

  return (
    <div className="wellness-two-col">
      <div className="card wellness-form-card">
        <div className="wellness-form-title">
          <div>
            <h2>CUESTIONARIO {todayEvent.type.toUpperCase()}</h2>
          </div>
          <div className="wellness-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
        </div>
        <p className="wellness-form-subtitle">{dayName.toUpperCase()}</p>
        {loadingExisting ? (
          <p className="wellness-response-hint">Cargando tu respuesta de hoy...</p>
        ) : alreadySent ? (
          <p className="wellness-response-hint success">Ya has enviado hoy. Puedes editar y guardar cambios o eliminar tu respuesta.</p>
        ) : null}

        {/* RPE */}
        <div className="wellness-slider-group">
          <div className="wellness-slider-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            ESFUERZO PERCIBIDO (RPE)
            <span className={`wellness-slider-value val-rpe`}>{rpe}</span>
          </div>
          <WellnessSlider value={rpe} onChange={setRpe} colorClass="rpe" labelMin="MUY SUAVE" labelMax="MÁXIMO" />
        </div>

        {/* Ánimo */}
        <div className="wellness-slider-group">
          <div className="wellness-slider-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
            ESTADO ANÍMICO TRAS {todayEvent.type.toUpperCase()}
            <span className="wellness-slider-value val-animo">{animo}</span>
          </div>
          <WellnessSlider value={animo} onChange={setAnimo} colorClass="animo" labelMin="MUY MAL" labelMax="EXCELENTE" />
        </div>

        {/* Físico */}
        <div className="wellness-slider-group">
          <div className="wellness-slider-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e676" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            ESTADO FÍSICO
            <span className="wellness-slider-value val-fisico">{fisico}</span>
          </div>
          <WellnessSlider value={fisico} onChange={setFisico} colorClass="fisico" labelMin="MUY FATIGADO" labelMax="PLENA FORMA" />
        </div>

        {/* Molestias */}
        <div className="wellness-slider-group">
          <div className="wellness-slider-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            MOLESTIAS O COMENTARIOS
          </div>
          <textarea
            className="wellness-textarea"
            placeholder="Escribe aquí si tienes alguna molestia física..."
            value={molestias}
            onChange={e => setMolestias(e.target.value)}
          />
        </div>

        {statusMsg && <p style={{ color: '#ff5252', fontSize: 13, marginBottom: 8 }}>{statusMsg}</p>}

        <div className="wellness-actions">
          <button className="wellness-submit" onClick={handleSubmit} disabled={saving || loadingExisting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            {saving ? 'GUARDANDO...' : alreadySent ? 'GUARDAR CAMBIOS' : 'ENVIAR CUESTIONARIO'}
          </button>
          {alreadySent && (
            <button className="wellness-delete" onClick={handleDelete} disabled={saving || loadingExisting}>
              ELIMINAR RESPUESTA
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
  const jugadores = usePlantilla();
  const [refDate, setRefDate] = useState(todayISO());
  const [responses, setResponses] = useState<WellnessResponse[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dashboardMsg, setDashboardMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const dayFrom = refDate;
  const dayTo = refDate;
  const weekFrom = weekStart(refDate);
  const weekTo = addDays(weekFrom, 6);
  const monthFrom = monthStart(refDate);
  const monthTo = addDays(addMonths(monthFrom, 1), -1);

  const weekLabel = `${isoToDisplay(weekFrom)} – ${isoToDisplay(weekTo)}`;
  const monthLabel = new Date(refDate + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  useEffect(() => {
    const loadResponses = async () => {
      const { data, error } = await supabase
        .from('wellness_responses')
        .select('*')
        .gte('event_date', monthFrom)
        .lte('event_date', monthTo);

      if (error) {
        setDashboardMsg({ type: 'error', text: 'No se pudieron cargar las respuestas de wellness.' });
        return;
      }

      setResponses((data as WellnessResponse[]) || []);
    };

    void loadResponses();
  }, [monthFrom, monthTo]);

  const navigate = (dir: 1 | -1) => setRefDate(d => addDays(d, dir));

  const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

  const dayResponses = useMemo(
    () => responses.filter(r => r.event_date >= dayFrom && r.event_date <= dayTo),
    [responses, dayFrom, dayTo],
  );

  const weekResponses = useMemo(
    () => responses.filter(r => r.event_date >= weekFrom && r.event_date <= weekTo),
    [responses, weekFrom, weekTo],
  );

  const monthResponses = responses;
  const playersById = useMemo(() => new Map(jugadores.map(j => [String(j.id), j.nombre])), [jugadores]);

  const handleDeleteResponse = async (responseId: string) => {
    const shouldDelete = window.confirm('¿Quieres eliminar esta respuesta de wellness? Esta acción no se puede deshacer.');
    if (!shouldDelete) return;

    setDeletingId(responseId);
    setDashboardMsg(null);

    const { error } = await supabase
      .from('wellness_responses')
      .delete()
      .eq('id', responseId);

    setDeletingId(null);

    if (error) {
      setDashboardMsg({ type: 'error', text: 'No se pudo eliminar la respuesta seleccionada.' });
      return;
    }

    setResponses(prev => prev.filter(response => response.id !== responseId));
    setDashboardMsg({ type: 'success', text: 'Respuesta eliminada correctamente.' });
  };

  const buildChartDataByPlayer = (rows: WellnessResponse[]) => {
    return jugadores
      .map(j => {
        const rs = rows.filter(r => String(r.player_id) === String(j.id));
        if (!rs.length) return null;
        return {
          label: j.nombre.split(' ')[0],
          rpe: avg(rs.map(r => r.rpe)),
          animo: avg(rs.map(r => r.animo)),
          fisico: avg(rs.map(r => r.fisico)),
        };
      })
      .filter(Boolean) as WellnessPoint[];
  };

  const dayChartData = useMemo(() => buildChartDataByPlayer(dayResponses), [dayResponses, jugadores]);
  const weekChartData = useMemo(() => buildChartDataByPlayer(weekResponses), [weekResponses, jugadores]);
  const monthChartData = useMemo(() => buildChartDataByPlayer(monthResponses), [monthResponses, jugadores]);

  const dayResponseRows = useMemo(() => {
    return [...dayResponses]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(response => ({
        ...response,
        jugador: playersById.get(String(response.player_id)) || String(response.player_id),
      }));
  }, [dayResponses, playersById]);

  const comentarios = useMemo(() => {
    return monthResponses
      .filter(r => Boolean(r.molestias && r.molestias.trim()))
      .sort((a, b) => b.event_date.localeCompare(a.event_date))
      .map(r => ({
        id: r.id,
        fecha: r.event_date,
        jugador: playersById.get(String(r.player_id)) || String(r.player_id),
        texto: r.molestias?.trim() || '',
      }));
  }, [jugadores, monthResponses]);

  return (
    <div className="wellness-page">
      {/* Controles */}
      <div className="wellness-header">
        <div>
          <div className="badge">WELLNESS</div>
          <h1>Cuestionario Wellness</h1>
          <small style={{ color: 'var(--text-muted)' }}>SEGUIMIENTO DE CARGA Y ESTADO DEL DEPORTISTA</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
            COMENTARIOS ESCRITOS
          </div>
          <div className="wellness-kpi-value">{comentarios.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <small>Detalle editable por fecha</small>
            <h2>Respuestas del día seleccionado</h2>
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
                  <th>TIPO</th>
                  <th>RPE</th>
                  <th>ÁNIMO</th>
                  <th>FÍSICO</th>
                  <th>COMENTARIO</th>
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
                    <td>{response.event_type}</td>
                    <td><span className="wellness-dot dot-rpe">{response.rpe}</span></td>
                    <td><span className="wellness-dot dot-animo">{response.animo}</span></td>
                    <td><span className="wellness-dot dot-fisico">{response.fisico}</span></td>
                    <td>
                      <span className="wellness-molestia">
                        {response.molestias?.trim() || 'Sin comentario'}
                      </span>
                    </td>
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

      {/* Tendencias temporales */}
      <div className="card">
        <div className="section-header">
          <div>
            <small>Promedios por jugador</small>
            <h2>Gráficos por día, semana y mes</h2>
          </div>
        </div>
        <div className="wellness-trends-grid">
          <div className="wellness-trend-card">
            <h3>Día {isoToDisplay(refDate)}</h3>
            {dayChartData.length ? <GroupedWellnessChart data={dayChartData} /> : <p className="wellness-empty-chart">No hay respuestas en este día.</p>}
          </div>
          <div className="wellness-trend-card">
            <h3>Semana {weekLabel}</h3>
            {weekChartData.length ? <GroupedWellnessChart data={weekChartData} /> : <p className="wellness-empty-chart">No hay respuestas en esta semana.</p>}
          </div>
          <div className="wellness-trend-card">
            <h3>Mes {monthLabel}</h3>
            {monthChartData.length ? <GroupedWellnessChart data={monthChartData} /> : <p className="wellness-empty-chart">No hay respuestas en este mes.</p>}
          </div>
        </div>
      </div>

      {/* Comentarios escritos */}
      <div className="card">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <small>Texto aportado por los jugadores</small>
            <h2>Comentarios y molestias del mes</h2>
          </div>
          <span className="wellness-responses-count">{comentarios.length} comentarios</span>
        </div>
        {comentarios.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>No hay comentarios escritos en este mes.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="wellness-table">
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th>JUGADOR</th>
                  <th>COMENTARIO / MOLESTIA</th>
                  <th>ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {comentarios.map(c => (
                  <tr key={c.id}>
                    <td>{isoToDisplay(c.fecha)}</td>
                    <td>
                      <div className="player-cell">
                        <div className="wellness-avatar">{String(c.jugador).charAt(0)}</div>
                        {String(c.jugador)}
                      </div>
                    </td>
                    <td><span className="wellness-molestia">{c.texto}</span></td>
                    <td>
                      <button
                        className="wellness-table-delete"
                        onClick={() => void handleDeleteResponse(c.id)}
                        disabled={deletingId === c.id}
                      >
                        {deletingId === c.id ? 'ELIMINANDO...' : 'ELIMINAR'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE RAÍZ
// ══════════════════════════════════════════════════════════════════════════
function Wellness() {
  const { user } = useAuth();
  const isJugador = user?.role === 'jugador';

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


  return (
    <section className="page-section">
      <WellnessDashboard />
    </section>
  );
}

export default Wellness;
