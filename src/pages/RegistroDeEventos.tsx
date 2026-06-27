import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { usePlantilla } from '../lib/usePlantilla';
import './RegistroDeEventos.css';

const STORAGE_KEY = 'registro_eventos_data_v1';

const EVENT_OPTIONS = [
  'Ocasión rival',
  'Ocasión propia',
  'Recuperación',
  'Pérdida',
  'Regate',
  'Pase',
  'Tiro',
  'Despeje',
  'Duelo ganado',
  'Duelo perdido',
] as const;

const TIME_SLOTS = [
  { id: '0-10', label: '0-10', min: 1, max: 10 },
  { id: '11-20', label: '11-20', min: 11, max: 20 },
  { id: '21-30', label: '21-30', min: 21, max: 30 },
  { id: '31-40', label: '31-40', min: 31, max: 40 },
  { id: '41-50', label: '41-50', min: 41, max: 50 },
  { id: '51-60', label: '51-60', min: 51, max: 60 },
  { id: '61-70', label: '61-70', min: 61, max: 70 },
  { id: '71-80', label: '71-80', min: 71, max: 80 },
  { id: '81-90', label: '81-90', min: 81, max: 90 },
  { id: '91-100', label: '91-100', min: 91, max: 100 },
] as const;

type EventoTipo = typeof EVENT_OPTIONS[number];

type RegistroEvento = {
  id: string;
  zoneId: number;
  zoneLabel: string;
  eventType: EventoTipo;
  minute: number;
  timeSlot: string;
  playerId: string;
  playerName: string;
  createdAt: string;
};

type VideoMode = 'youtube' | 'local';

const ZONES = Array.from({ length: 18 }, (_, index) => {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;

  return {
    id: index + 1,
    label: `Z${index + 1}`,
    detail: `Fila ${row} · Columna ${column}`,
  };
});

const MINUTES = Array.from({ length: 100 }, (_, index) => index + 1);

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.85rem 1rem',
  borderRadius: '14px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(7, 16, 27, 0.88)',
  color: '#f5f7fb',
  fontSize: '0.95rem',
};

function getTimeSlot(minute: number) {
  return TIME_SLOTS.find((slot) => minute >= slot.min && minute <= slot.max)?.label ?? '0-10';
}

function getYoutubeEmbedUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return '';

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/i,
    /(?:youtu\.be\/)([\w-]{11})/i,
    /(?:youtube\.com\/embed\/)([\w-]{11})/i,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
  }

  return '';
}

function RegistroDeEventos() {
  const jugadores = usePlantilla();
  const [videoMode, setVideoMode] = useState<VideoMode>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [localVideoUrl, setLocalVideoUrl] = useState('');
  const [localVideoName, setLocalVideoName] = useState('');
  const [activeZoneId, setActiveZoneId] = useState<number | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<EventoTipo[]>([]);
  const [selectedMinute, setSelectedMinute] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [records, setRecords] = useState<RegistroEvento[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as RegistroEvento[];
      if (Array.isArray(parsed)) {
        setRecords(parsed);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    if (!selectedPlayerId && jugadores[0]?.id) {
      setSelectedPlayerId(jugadores[0].id);
    }
  }, [jugadores, selectedPlayerId]);

  useEffect(() => {
    return () => {
      if (localVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  const activeZone = useMemo(
    () => ZONES.find((zone) => zone.id === activeZoneId) ?? null,
    [activeZoneId]
  );

  const youtubeEmbedUrl = useMemo(() => getYoutubeEmbedUrl(youtubeUrl), [youtubeUrl]);

  const zoneCounts = useMemo(() => {
    const counts = new Map<number, number>();

    records.forEach((record) => {
      counts.set(record.zoneId, (counts.get(record.zoneId) ?? 0) + 1);
    });

    return counts;
  }, [records]);

  const eventCounts = useMemo(() => {
    return EVENT_OPTIONS.map((eventType) => ({
      label: eventType,
      value: records.filter((record) => record.eventType === eventType).length,
    }));
  }, [records]);

  const timeSlotCounts = useMemo(() => {
    return TIME_SLOTS.map((slot) => ({
      label: slot.label,
      value: records.filter((record) => record.timeSlot === slot.label).length,
    }));
  }, [records]);

  const playerCounts = useMemo(() => {
    const counts = new Map<string, number>();

    records.forEach((record) => {
      counts.set(record.playerName, (counts.get(record.playerName) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  }, [records]);

  const matrix = useMemo(() => {
    return EVENT_OPTIONS.map((eventType) => {
      const cells = TIME_SLOTS.map((slot) => {
        const counts = new Map<string, number>();

        records
          .filter((record) => record.eventType === eventType && record.timeSlot === slot.label)
          .forEach((record) => {
            counts.set(record.playerName, (counts.get(record.playerName) ?? 0) + 1);
          });

        const players = [...counts.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([playerName, value]) => `${playerName} (${value})`);

        return {
          slot: slot.label,
          total: players.length,
          players,
        };
      });

      return { eventType, cells };
    });
  }, [records]);

  const maxZoneCount = useMemo(() => Math.max(1, ...zoneCounts.values()), [zoneCounts]);

  const maxEventCount = useMemo(() => Math.max(1, ...eventCounts.map((item) => item.value)), [eventCounts]);
  const maxTimeSlotCount = useMemo(() => Math.max(1, ...timeSlotCounts.map((item) => item.value)), [timeSlotCounts]);
  const maxPlayerCount = useMemo(() => Math.max(1, ...playerCounts.map((item) => item.value)), [playerCounts]);

  const handleVideoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setVideoMode('local');
    setLocalVideoName(file.name);
    setLocalVideoUrl((currentUrl) => {
      if (currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }

      return URL.createObjectURL(file);
    });
  };

  const toggleEvent = (eventType: EventoTipo) => {
    setSelectedEvents((current) => {
      if (current.includes(eventType)) {
        return current.filter((value) => value !== eventType);
      }

      return [...current, eventType];
    });
  };

  const handleSaveRecord = () => {
    if (!activeZone) {
      setError('Selecciona una zona del campo.');
      return;
    }

    if (selectedEvents.length === 0) {
      setError('Selecciona al menos un evento.');
      return;
    }

    const player = jugadores.find((item) => item.id === selectedPlayerId);
    if (!player) {
      setError('Selecciona un jugador válido.');
      return;
    }

    const createdAt = new Date().toISOString();
    const timeSlot = getTimeSlot(selectedMinute);
    const nextRecords = selectedEvents.map((eventType, index) => ({
      id: `${createdAt}-${activeZone.id}-${eventType}-${index}`,
      zoneId: activeZone.id,
      zoneLabel: activeZone.label,
      eventType,
      minute: selectedMinute,
      timeSlot,
      playerId: player.id,
      playerName: player.nombre,
      createdAt,
    } satisfies RegistroEvento));

    setRecords((current) => [
      ...nextRecords,
      ...current,
    ]);
    setSelectedEvents([]);
    setError('');
    setActiveZoneId(null);
  };

  const handleClearRecords = () => {
    setRecords([]);
    setError('');
  };

  return (
    <section className="page-section registro-eventos-page">
      <div className="page-title">
        <div>
          <h1>Registro de Eventos</h1>
          <p className="registro-eventos-intro">
            Vincula acciones del partido con vídeo, zona del campo, minuto y jugador para generar una matriz de análisis y gráficos automáticos.
          </p>
        </div>
      </div>

      <div className="registro-eventos-layout">
        <article className="card registro-card registro-video-card">
          <div className="section-header">
            <div>
              <h2>Vídeo</h2>
              <small>YouTube embebido o archivo local</small>
            </div>
            <span className="badge">{records.length} registros</span>
          </div>

          <div className="registro-source-toggle">
            <button
              type="button"
              className={videoMode === 'youtube' ? 'registro-source-btn active' : 'registro-source-btn'}
              onClick={() => setVideoMode('youtube')}
            >
              YouTube
            </button>
            <button
              type="button"
              className={videoMode === 'local' ? 'registro-source-btn active' : 'registro-source-btn'}
              onClick={() => setVideoMode('local')}
            >
              Vídeo local
            </button>
          </div>

          <div className="registro-controls-stack">
            <label className="registro-field-label">
              <span>Fuente del vídeo</span>
              {videoMode === 'youtube' ? (
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  placeholder="Pega aquí la URL de YouTube"
                  style={inputStyle}
                />
              ) : (
                <div className="registro-local-upload">
                  <input type="file" accept="video/*" onChange={handleVideoFileChange} style={inputStyle} />
                  <small>{localVideoName || 'Selecciona un archivo de vídeo de tu ordenador'}</small>
                </div>
              )}
            </label>
          </div>

          <div className="registro-video-stage">
            {videoMode === 'youtube' && youtubeEmbedUrl ? (
              <iframe
                src={youtubeEmbedUrl}
                title="Vídeo de YouTube"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : null}

            {videoMode === 'local' && localVideoUrl ? (
              <video src={localVideoUrl} controls preload="metadata" />
            ) : null}

            {((videoMode === 'youtube' && !youtubeEmbedUrl) || (videoMode === 'local' && !localVideoUrl)) && (
              <div className="registro-video-placeholder">
                <strong>Vídeo no cargado</strong>
                <p>
                  {videoMode === 'youtube'
                    ? 'Introduce una URL válida de YouTube para embeber el análisis.'
                    : 'Carga un archivo de vídeo local para empezar a registrar acciones.'}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="card registro-card registro-pitch-card">
          <div className="section-header">
            <div>
              <h2>Campo dividido en 18 zonas</h2>
              <small>Pulsa una zona para registrar uno o varios eventos</small>
            </div>
            <button type="button" className="registro-clear-btn" onClick={handleClearRecords}>
              Limpiar registros
            </button>
          </div>

          <div className="registro-pitch-wrapper">
            <div className="registro-pitch-markings" aria-hidden="true">
              <span className="pitch-midline" />
              <span className="pitch-center-circle" />
              <span className="pitch-box pitch-box-top" />
              <span className="pitch-box pitch-box-bottom" />
            </div>

            <div className="registro-pitch-grid">
              {ZONES.map((zone) => {
                const count = zoneCounts.get(zone.id) ?? 0;
                const intensity = count / maxZoneCount;

                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={zone.id === activeZoneId ? 'registro-zone active' : 'registro-zone'}
                    style={{
                      background: `linear-gradient(180deg, rgba(32, 95, 54, ${0.38 + intensity * 0.34}), rgba(15, 54, 32, ${0.72 + intensity * 0.16}))`,
                    }}
                    onClick={() => {
                      setActiveZoneId(zone.id);
                      setError('');
                    }}
                  >
                    <span>{zone.label}</span>
                    <small>{zone.detail}</small>
                    <strong>{count}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="registro-legend-row">
            <span className="registro-legend-pill">Cada clic abre el panel de registro</span>
            <span className="registro-legend-pill">El contador de cada zona actúa como mapa de calor</span>
          </div>

          <div className="registro-editor-panel">
            <div>
              <h3>{activeZone ? `Registrar en ${activeZone.label}` : 'Selecciona una zona'}</h3>
              <p>
                {activeZone
                  ? `${activeZone.detail}. Puedes marcar varios eventos para el mismo minuto y jugador.`
                  : 'La zona elegida te abrirá este panel con eventos, minuto y jugador.'}
              </p>
            </div>

            <div className="registro-events-grid">
              {EVENT_OPTIONS.map((eventType) => {
                const checked = selectedEvents.includes(eventType);

                return (
                  <label key={eventType} className={checked ? 'registro-event-chip active' : 'registro-event-chip'}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEvent(eventType)}
                    />
                    <span>{eventType}</span>
                  </label>
                );
              })}
            </div>

            <div className="registro-form-grid">
              <label className="registro-field-label">
                <span>Minuto</span>
                <select value={selectedMinute} onChange={(event) => setSelectedMinute(Number(event.target.value))} style={inputStyle}>
                  {MINUTES.map((minute) => (
                    <option key={minute} value={minute}>
                      {minute}
                    </option>
                  ))}
                </select>
              </label>

              <label className="registro-field-label">
                <span>Jugador</span>
                <select value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} style={inputStyle}>
                  {jugadores.length === 0 ? <option value="">Sin plantilla cargada</option> : null}
                  {jugadores.map((jugador) => (
                    <option key={jugador.id} value={jugador.id}>
                      {jugador.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <p className="registro-error">{error}</p> : null}

            <div className="registro-panel-actions">
              <button type="button" className="registro-primary-btn" onClick={handleSaveRecord}>
                Guardar registro
              </button>
              <button type="button" className="registro-secondary-btn" onClick={() => setActiveZoneId(null)}>
                Cerrar panel
              </button>
            </div>
          </div>
        </article>
      </div>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Tabla de triple entrada</h2>
            <small>Evento por tramo temporal, con jugadores implicados en cada celda</small>
          </div>
        </div>

        <div className="registro-table-wrapper">
          <table className="registro-matrix-table">
            <thead>
              <tr>
                <th>Evento</th>
                {TIME_SLOTS.map((slot) => (
                  <th key={slot.id}>{slot.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.eventType}>
                  <th>{row.eventType}</th>
                  {row.cells.map((cell) => (
                    <td key={`${row.eventType}-${cell.slot}`}>
                      {cell.players.length > 0 ? (
                        <div className="registro-cell-list">
                          {cell.players.map((player) => (
                            <span key={player} className="registro-cell-item">
                              {player}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="registro-empty-cell">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Gráficos</h2>
            <small>Lectura rápida por evento, tramo, jugador y zona</small>
          </div>
        </div>

        <div className="registro-charts-grid">
          <section className="registro-chart-block">
            <h3>Frecuencia por evento</h3>
            <div className="registro-bar-list">
              {eventCounts.map((item) => (
                <div key={item.label} className="registro-bar-row">
                  <span>{item.label}</span>
                  <div className="registro-bar-track">
                    <div className="registro-bar-fill" style={{ width: `${(item.value / maxEventCount) * 100}%` }} />
                  </div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="registro-chart-block">
            <h3>Frecuencia por tramo</h3>
            <div className="registro-bar-list compact">
              {timeSlotCounts.map((item) => (
                <div key={item.label} className="registro-bar-row">
                  <span>{item.label}</span>
                  <div className="registro-bar-track">
                    <div className="registro-bar-fill time" style={{ width: `${(item.value / maxTimeSlotCount) * 100}%` }} />
                  </div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="registro-chart-block">
            <h3>Participación por jugador</h3>
            <div className="registro-bar-list compact">
              {(playerCounts.length > 0 ? playerCounts : [{ label: 'Sin datos', value: 0 }]).map((item) => (
                <div key={item.label} className="registro-bar-row">
                  <span>{item.label}</span>
                  <div className="registro-bar-track">
                    <div className="registro-bar-fill player" style={{ width: `${(item.value / maxPlayerCount) * 100}%` }} />
                  </div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="registro-chart-block">
            <h3>Mapa de calor por zonas</h3>
            <div className="registro-mini-pitch">
              {ZONES.map((zone) => {
                const count = zoneCounts.get(zone.id) ?? 0;
                const opacity = 0.12 + (count / maxZoneCount) * 0.88;

                return (
                  <div
                    key={`mini-${zone.id}`}
                    className="registro-mini-zone"
                    style={{ background: `rgba(144, 244, 174, ${opacity})` }}
                  >
                    <span>{zone.label}</span>
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Detalle de registros</h2>
            <small>Vista cronológica de todas las acciones guardadas</small>
          </div>
        </div>

        <div className="registro-table-wrapper">
          <table className="list-table registro-detail-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Minuto</th>
                <th>Tramo</th>
                <th>Jugador</th>
                <th>Zona</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.eventType}</td>
                    <td>{record.minute}</td>
                    <td>{record.timeSlot}</td>
                    <td>{record.playerName}</td>
                    <td>{record.zoneLabel}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="registro-empty-row">
                    Todavía no hay acciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default RegistroDeEventos;