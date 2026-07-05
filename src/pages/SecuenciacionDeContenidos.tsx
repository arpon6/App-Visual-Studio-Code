import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './Calendario.css';

const TEMPORADA_INICIO = '2026-07-30';
const TEMPORADA_FIN = '2027-06-01';

const CONTENIDOS_PREDEFINIDOS = [
  'Finalizar',
  'Evitar finalizar',
  'Progresar',
  'Evitar progresar',
  'Mantener',
  'Evitar mantener',
  'Reinicio y Construcción Z 1-2',
  'Progresión juego interior Z 2-3',
  'Progresión juego exterior Z 2-3',
  'Conquista espalda Z 3',
  'Ataque de área llegando',
  'Ataque de área estando',
  'Presión alta',
  'Repliegue intermedio',
  'Repliegue total',
  'Defensa de área llegando',
  'Defensa de área estando',
  'Priorizar finalizar tras robo Z 4',
  'Priorizar progresar tras robo Z 2-3',
  'Priorizar conservar tras robo Z 1',
  'Priorizar recuperar tras pérdida Z 3-4',
  'Priorizar defender espacio tras pérdida Z 2',
  'Priorizar defender portería tras pérdida Z 1',
  'ABP Ofensivo',
  'ABP Defensivo',
];

interface Event {
  id: string;
  date: string;
  type: 'entrenamiento' | 'partido';
  place: string;
  time?: string;
  rival?: string;
  matchType?: string;
}

interface SecuenciacionData {
  id: string;
  fecha: string;
  contenidos: string[];
  notas?: string;
}

interface ContenidoStats {
  contenido: string;
  mensual: number;
  temporada: number;
}

function SecuenciacionDeContenidos() {
  const { user } = useAuth();

  // Jugadores no tienen acceso — esto es solo por si alguien llega directamente
  if (user?.role === 'jugador') {
    return <div className="page-section">No tienes acceso a esta sección.</div>;
  }

  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [events, setEvents] = useState<Event[]>([]);
  const [secuenciaciones, setSecuenciaciones] = useState<SecuenciacionData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedContenidos, setSelectedContenidos] = useState<string[]>([]);
  const [notas, setNotas] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [customInput, setCustomInput] = useState('');
  const [contenidoSearchTerm, setContenidoSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadEvents(), loadSecuenciaciones()]);
    setLoaded(true);
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, date, type, place, time, rival, match_type')
      .in('type', ['entrenamiento', 'partido']);

    if (error) { console.error('Error loading events:', error); return; }

    setEvents((data || []).map(r => ({
      id: r.id,
      date: r.date,
      type: r.type,
      place: r.place,
      time: r.time,
      rival: r.rival,
      matchType: r.match_type,
    })));
  };

  const loadSecuenciaciones = async () => {
    const { data, error } = await supabase
      .from('secuenciacion_contenidos')
      .select('*')
      .order('fecha');

    if (error) { console.error('Error loading secuenciaciones:', error); return; }

    setSecuenciaciones(
      data?.map(row => ({
        id: row.id,
        fecha: row.fecha,
        contenidos: row.contenidos || [],
        notas: row.notas,
      })) || []
    );
  };

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return (day + 6) % 7;
  };

  const monthDays = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  const secuenciacionesTemporada = useMemo(
    () => secuenciaciones.filter(sec => sec.fecha >= TEMPORADA_INICIO && sec.fecha <= TEMPORADA_FIN),
    [secuenciaciones]
  );

  const secuenciacionesMes = useMemo(
    () => secuenciacionesTemporada.filter(sec => {
      const [year, month] = sec.fecha.split('-').map(Number);
      return year === currentYear && month === currentMonth;
    }),
    [secuenciacionesTemporada, currentYear, currentMonth]
  );

  const contenidosStats = useMemo<ContenidoStats[]>(() => {
    const mensualMap = new Map<string, number>();
    const temporadaMap = new Map<string, number>();

    secuenciacionesTemporada.forEach(sec => {
      sec.contenidos.forEach(contenido => {
        temporadaMap.set(contenido, (temporadaMap.get(contenido) || 0) + 1);
      });
    });

    secuenciacionesMes.forEach(sec => {
      sec.contenidos.forEach(contenido => {
        mensualMap.set(contenido, (mensualMap.get(contenido) || 0) + 1);
      });
    });

    const contenidosUnicos = new Set<string>([
      ...temporadaMap.keys(),
      ...mensualMap.keys(),
    ]);

    return Array.from(contenidosUnicos)
      .map(contenido => ({
        contenido,
        mensual: mensualMap.get(contenido) || 0,
        temporada: temporadaMap.get(contenido) || 0,
      }))
      .sort((a, b) => {
        if (b.temporada !== a.temporada) return b.temporada - a.temporada;
        if (b.mensual !== a.mensual) return b.mensual - a.mensual;
        return a.contenido.localeCompare(b.contenido, 'es-ES');
      });
  }, [secuenciacionesTemporada, secuenciacionesMes]);

  const totalMes = contenidosStats.reduce((acc, item) => acc + item.mensual, 0);
  const totalTemporada = contenidosStats.reduce((acc, item) => acc + item.temporada, 0);
  const maxMensual = Math.max(...contenidosStats.map(item => item.mensual), 1);
  const maxTemporada = Math.max(...contenidosStats.map(item => item.temporada), 1);
  const topMensual = contenidosStats.filter(item => item.mensual > 0).slice(0, 10);
  const topTemporada = contenidosStats.filter(item => item.temporada > 0).slice(0, 10);

  const contenidosDisponibles = useMemo(() => {
    const todos = [
      ...CONTENIDOS_PREDEFINIDOS,
      ...secuenciaciones.flatMap(sec => sec.contenidos || []),
      ...selectedContenidos,
    ];

    const unicos = new Map<string, string>();
    todos.forEach(contenido => {
      const limpio = (contenido || '').trim();
      if (!limpio) return;
      const key = limpio.toLocaleLowerCase('es-ES');
      if (!unicos.has(key)) {
        unicos.set(key, limpio);
      }
    });

    return Array.from(unicos.values()).sort((a, b) => a.localeCompare(b, 'es-ES'));
  }, [secuenciaciones, selectedContenidos]);

  const contenidosFiltrados = useMemo(() => {
    const term = contenidoSearchTerm.trim().toLocaleLowerCase('es-ES');
    if (!term) return contenidosDisponibles;
    return contenidosDisponibles.filter(c => c.toLocaleLowerCase('es-ES').includes(term));
  }, [contenidosDisponibles, contenidoSearchTerm]);

  const getEventsForDay = (day: number | undefined) => {
    if (!day) return null;
    const dateStr = `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
    return events.filter(evt => evt.date === dateStr);
  };

  const getSecuenciacionForDay = (day: number | undefined) => {
    if (!day) return null;
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return secuenciaciones.find(sec => sec.fecha === dateStr);
  };

  const handleDayClick = (day: number) => {
    const dayEvents = getEventsForDay(day);
    if (!dayEvents?.length) return;

    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = secuenciaciones.find(sec => sec.fecha === dateStr);

    setSelectedDate(dateStr);
    setSelectedContenidos(existing?.contenidos || []);
    setNotas(existing?.notas || '');
    setEditingId(existing?.id || null);
    setCustomInput('');
    setContenidoSearchTerm('');
    setShowModal(true);
  };

  const handleExportPDF = async () => {
    const element = document.querySelector('.calendar-card') as HTMLElement;
    if (!element || isExporting) return;

    setIsExporting(true);

    try {
      const nombreMes = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      const canvas = await html2canvas(element, {
        backgroundColor: '#0c1622',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgW = pageW;
      const imgH = imgW / ratio;
      const offsetY = imgH < pageH ? (pageH - imgH) / 2 : 0;

      pdf.addImage(imgData, 'PNG', 0, offsetY, imgW, imgH);
      pdf.save(`Secuenciacion_${nombreMes}.pdf`);
    } catch (error) {
      console.error('Error exportando PDF de secuenciación:', error);
      alert('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectContenido = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) return;
    if (!selectedContenidos.includes(value)) {
      setSelectedContenidos([...selectedContenidos, value]);
    }
    e.target.value = '';
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!selectedContenidos.includes(trimmed)) {
      setSelectedContenidos([...selectedContenidos, trimmed]);
    }
    setCustomInput('');
  };

  const handleRemoveContenido = (index: number) => {
    setSelectedContenidos(selectedContenidos.filter((_, i) => i !== index));
  };

  const handleMoveContenido = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selectedContenidos.length) return;

    const updated = [...selectedContenidos];
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    setSelectedContenidos(updated);
  };

  const handleSaveSecuenciacion = async () => {
    if (!selectedDate) return;

    const row = {
      fecha: selectedDate,
      contenidos: selectedContenidos,
      notas: notas || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('secuenciacion_contenidos').update(row).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('secuenciacion_contenidos').insert([row]));
    }

    if (error) {
      console.error('Error saving secuenciacion:', error);
      alert('Error al guardar: ' + error.message);
      return;
    }

    await loadSecuenciaciones();
    resetModal();
  };

  const handleDeleteSecuenciacion = async () => {
    if (!editingId) return;
    if (!confirm('¿Deseas eliminar esta secuenciación?')) return;

    const { error } = await supabase.from('secuenciacion_contenidos').delete().eq('id', editingId);
    if (error) {
      console.error('Error deleting secuenciacion:', error);
      alert('Error al eliminar: ' + error.message);
      return;
    }
    await loadSecuenciaciones();
    resetModal();
  };

  const resetModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setSelectedContenidos([]);
    setNotas('');
    setEditingId(null);
    setCustomInput('');
    setContenidoSearchTerm('');
  };

  const calendarDays = Array.from({ length: firstDay }).concat(
    Array.from({ length: monthDays }, (_, i) => i + 1)
  ) as (number | undefined)[];

  if (!loaded) return <div className="page-section">Cargando...</div>;

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Planificación del entrenamiento</small>
          <h1>Secuenciación de contenidos</h1>
        </div>
      </div>

      <div className="calendar-container">
        <div className="card calendar-card">
          <div className="calendar-header">
            <button className="nav-btn" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}>←</button>
            <h2 className="month-label">{monthName}</h2>
            <button className="nav-btn" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}>→</button>
            <button
              className="nav-btn export-btn"
              onClick={handleExportPDF}
              title="Descargar PDF del mes"
              disabled={isExporting}
            >
              {isExporting ? 'Generando PDF...' : '⬇ PDF'}
            </button>
          </div>

          <div className="calendar-weekdays">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((day, idx) => {
              const dayEvents = getEventsForDay(day);
              const hasEvents = !!dayEvents?.length;
              const partido = dayEvents?.find(evt => evt.type === 'partido');
              const entrenamiento = dayEvents?.find(evt => evt.type === 'entrenamiento');
              const secuenciacion = getSecuenciacionForDay(day);
              const hasContent = secuenciacion && secuenciacion.contenidos.length > 0;

              return (
                <div
                  key={idx}
                  className={`calendar-day ${!day ? 'empty' : ''} ${hasEvents ? 'has-events' : ''}`}
                  onClick={() => day && hasEvents && handleDayClick(day)}
                  style={{ cursor: hasEvents ? 'pointer' : 'default' }}
                >
                  {day && (
                    <>
                      <div className="day-header">
                        <span className="day-number">{day}</span>
                        {hasEvents && (
                          <span
                            className="day-add-btn"
                            onClick={(e) => { e.stopPropagation(); handleDayClick(day); }}
                            title="Editar contenidos"
                          >
                            📝
                          </span>
                        )}
                      </div>
                      {hasEvents && (
                        <div className="day-events-indicator">
                          {hasContent ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                              {secuenciacion.contenidos.map((c, i) => (
                                <span key={i} style={{
                                  fontSize: '0.6rem',
                                  background: 'rgba(144,244,174,0.15)',
                                  color: '#90f4ae',
                                  borderRadius: '3px',
                                  padding: '2px 4px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  display: 'block'
                                }}>{c}</span>
                              ))}
                            </div>
                          ) : (
                            <>
                              {partido && (
                                <span className="event-label type-partido">
                                  <span className="event-label-type">Partido</span>
                                  {partido.matchType && <span className="event-label-meta">{partido.matchType}</span>}
                                  {partido.rival && <span className="event-label-rival">vs {partido.rival}</span>}
                                  {partido.time && <span className="event-label-time">{partido.time}</span>}
                                </span>
                              )}
                              {entrenamiento && (
                                <span className="event-label type-entrenamiento">
                                  <span className="event-label-type">Entrenamiento</span>
                                  {entrenamiento.time && <span className="event-label-time">{entrenamiento.time}</span>}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card events-list-card">
          <div className="section-header">
            <h2>Eventos con contenidos</h2>
          </div>
          <div className="events-list">
            {secuenciaciones.length === 0 ? (
              <p className="no-events">No hay contenidos secuenciados aún</p>
            ) : (
              secuenciaciones
                .filter(sec => {
                  const d = new Date(sec.fecha);
                  return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
                })
                .map(sec => (
                  <div key={sec.id} className="event-item">
                    {(() => {
                      const [year, month, day] = sec.fecha.split('-');
                      const dateCalendar = `${day}/${month}/${year}`;
                      const linkedEvents = events.filter(evt => evt.date === dateCalendar);
                      const tipos = linkedEvents.length > 0
                        ? linkedEvents.map(evt => evt.type === 'partido' ? 'Partido' : 'Entrenamiento').join(' + ')
                        : 'Sin evento en calendario';
                      return (
                        <div className="event-header">
                          <span className="event-date">{new Date(sec.fecha).toLocaleDateString('es-ES', {
                            weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric'
                          })}</span>
                          <span className="event-type type-entrenamiento">{tipos}</span>
                        </div>
                      );
                    })()}
                    <div className="event-details">
                      <p><strong>Contenidos ({sec.contenidos.length}):</strong></p>
                      <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                        {sec.contenidos.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                      {sec.notas && <p style={{ marginTop: '8px', fontStyle: 'italic' }}><strong>Notas:</strong> {sec.notas}</p>}
                    </div>
                    <div className="event-actions">
                      <button className="action-btn edit-btn" onClick={() => {
                        setSelectedDate(sec.fecha);
                        setSelectedContenidos(sec.contenidos);
                        setNotas(sec.notas || '');
                        setEditingId(sec.id);
                        setCustomInput('');
                        setContenidoSearchTerm('');
                        setShowModal(true);
                      }}>✏️</button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      <div className="card secuenciacion-stats-card">
        <div className="section-header">
          <h2>Resumen de contenidos</h2>
          <p className="stats-subtitle">
            Vista mensual ({monthName}) y acumulada de temporada ({new Date(TEMPORADA_INICIO).toLocaleDateString('es-ES')} - {new Date(TEMPORADA_FIN).toLocaleDateString('es-ES')})
          </p>
        </div>

        {contenidosStats.length === 0 ? (
          <p className="no-events">Todavía no hay contenidos dentro del rango de temporada.</p>
        ) : (
          <>
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Contenido</th>
                    <th>Mes actual</th>
                    <th>Temporada</th>
                  </tr>
                </thead>
                <tbody>
                  {contenidosStats.map(item => (
                    <tr key={item.contenido}>
                      <td>{item.contenido}</td>
                      <td>{item.mensual}</td>
                      <td>{item.temporada}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{totalMes}</td>
                    <td>{totalTemporada}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="stats-charts-grid">
              <div className="stats-chart-card">
                <h3>Top contenidos del mes</h3>
                {topMensual.length === 0 ? (
                  <p className="no-events">Sin contenidos en este mes.</p>
                ) : (
                  <div className="bars-list">
                    {topMensual.map(item => (
                      <div key={`mes-${item.contenido}`} className="bar-row">
                        <span className="bar-label" title={item.contenido}>{item.contenido}</span>
                        <div className="bar-track">
                          <div className="bar-fill mensual" style={{ width: `${(item.mensual / maxMensual) * 100}%` }} />
                        </div>
                        <span className="bar-value">{item.mensual}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="stats-chart-card">
                <h3>Top contenidos de temporada</h3>
                {topTemporada.length === 0 ? (
                  <p className="no-events">Sin contenidos en temporada.</p>
                ) : (
                  <div className="bars-list">
                    {topTemporada.map(item => (
                      <div key={`temporada-${item.contenido}`} className="bar-row">
                        <span className="bar-label" title={item.contenido}>{item.contenido}</span>
                        <div className="bar-track">
                          <div className="bar-fill temporada" style={{ width: `${(item.temporada / maxTemporada) * 100}%` }} />
                        </div>
                        <span className="bar-value">{item.temporada}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingId ? 'Editar contenidos' : 'Agregar contenidos'}</h2>

            <div className="form-group">
              <label>Fecha: <strong>{new Date(selectedDate!).toLocaleDateString('es-ES', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
              })}</strong></label>
            </div>

            {/* Selector predefinido */}
            <div className="form-group">
              <label htmlFor="contenido-select">Añadir contenido de la lista</label>
              <input
                type="text"
                value={contenidoSearchTerm}
                onChange={e => setContenidoSearchTerm(e.target.value)}
                placeholder="Escribe para filtrar contenidos..."
              />
              <select id="contenido-select" onChange={handleSelectContenido} defaultValue="">
                <option value="" disabled>Selecciona un contenido...</option>
                {contenidosFiltrados.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {contenidoSearchTerm.trim() && (
                <small className="contenido-filter-count">
                  {contenidosFiltrados.length} resultado{contenidosFiltrados.length === 1 ? '' : 's'}
                </small>
              )}
            </div>

            {/* Contenido personalizado */}
            <div className="form-group">
              <label htmlFor="custom-contenido">O escribe un contenido personalizado</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="custom-contenido"
                  type="text"
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
                  placeholder="Escribe y pulsa Añadir..."
                  style={{ flex: 1 }}
                />
                <button className="btn-save" onClick={handleAddCustom} style={{ whiteSpace: 'nowrap' }}>
                  Añadir
                </button>
              </div>
            </div>

            {/* Contenidos seleccionados */}
            {selectedContenidos.length > 0 && (
              <div className="form-group">
                <label>Contenidos seleccionados ({selectedContenidos.length})</label>
                <div className="selected-contenidos-list">
                  {selectedContenidos.map((c, idx) => (
                    <div
                      key={idx}
                      className="selected-contenido-item"
                    >
                      <span className="selected-contenido-order">{idx + 1}.</span>
                      <span className="selected-contenido-text">{c}</span>
                      <div className="selected-contenido-actions">
                        <button
                          type="button"
                          onClick={() => handleMoveContenido(idx, 'up')}
                          disabled={idx === 0}
                          className="selected-contenido-btn"
                          title="Subir"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveContenido(idx, 'down')}
                          disabled={idx === selectedContenidos.length - 1}
                          className="selected-contenido-btn"
                          title="Bajar"
                        >
                          ↓
                        </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveContenido(idx)}
                        className="selected-contenido-btn remove"
                        title="Eliminar"
                      >
                        ×
                      </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notas */}
            <div className="form-group">
              <label htmlFor="notas">Notas (opcional)</label>
              <textarea
                id="notas"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Detalles adicionales del entrenamiento..."
                rows={3}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={resetModal}>Cancelar</button>
              {editingId && (
                <button
                  className="btn-cancel"
                  onClick={handleDeleteSecuenciacion}
                  style={{ backgroundColor: '#ef4444' }}
                >
                  Eliminar
                </button>
              )}
              <button className="btn-save" onClick={handleSaveSecuenciacion}>
                {editingId ? 'Actualizar' : 'Guardar'} Secuenciación
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SecuenciacionDeContenidos;
