import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import './Calendario.css'; // Reutilizamos estilos base del calendario

interface Event {
  id: string;
  date: string;
  type: 'entrenamiento';
  place: string;
  time?: string;
}

interface Contenido {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria?: string;
}

interface SecuenciacionData {
  id: string;
  fecha: string;
  contenidos: string[]; // Array de contenidos (IDs o textos personalizados)
  notas?: string;
}

function SecuenciacionDeContenidos() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';

  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [events, setEvents] = useState<Event[]>([]);
  const [contenidos, setContenidos] = useState<Contenido[]>([]);
  const [secuenciaciones, setSecuenciaciones] = useState<SecuenciacionData[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Estados del modal
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedContenidos, setSelectedContenidos] = useState<string[]>([]);
  const [notas, setNotas] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Estado para el autocomplete
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadEvents(), loadContenidos(), loadSecuenciaciones()]);
    setLoaded(true);
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, date, type, place, time')
      .eq('type', 'entrenamiento');

    if (error) {
      console.error('Error loading events:', error);
      return;
    }

    const calendarEvents: Event[] = (data || []).map(r => ({
      id: r.id,
      date: r.date,
      type: r.type,
      place: r.place,
      time: r.time,
    }));

    setEvents(calendarEvents);
  };

  const loadContenidos = async () => {
    const { data, error } = await supabase
      .from('contenidos')
      .select('id, nombre, descripcion, categoria')
      .order('nombre');

    if (error) {
      console.error('Error loading contenidos:', error);
      return;
    }

    setContenidos(data || []);
  };

  const loadSecuenciaciones = async () => {
    const { data, error } = await supabase
      .from('secuenciacion_contenidos')
      .select('*')
      .order('fecha');

    if (error) {
      console.error('Error loading secuenciaciones:', error);
      return;
    }

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

  const handlePrevMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const getEventForDay = (day: number | undefined) => {
    if (!day) return null;
    const dateStr = `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
    return events.find(evt => evt.date === dateStr);
  };

  const getSecuenciacionForDay = (day: number | undefined) => {
    if (!day) return null;
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return secuenciaciones.find(sec => sec.fecha === dateStr);
  };

  const handleDayClick = (day: number) => {
    const event = getEventForDay(day);
    if (!event) return;

    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = secuenciaciones.find(sec => sec.fecha === dateStr);

    setSelectedDate(dateStr);
    setSelectedContenidos(existing?.contenidos || []);
    setNotas(existing?.notas || '');
    setEditingId(existing?.id || null);
    setInputValue('');
    setShowModal(true);
  };

  const handleAddContenido = (contenido: Contenido | string) => {
    const newItem = typeof contenido === 'string' ? contenido : contenido.id;
    if (!selectedContenidos.includes(newItem)) {
      setSelectedContenidos([...selectedContenidos, newItem]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleRemoveContenido = (index: number) => {
    setSelectedContenidos(selectedContenidos.filter((_, i) => i !== index));
  };

  const handleSaveSecuenciacion = async () => {
    if (!selectedDate) return;

    const row = {
      fecha: selectedDate,
      contenidos: selectedContenidos,
      notas: notas || null,
    };

    try {
      if (editingId) {
        await supabase
          .from('secuenciacion_contenidos')
          .update(row)
          .eq('id', editingId);
      } else {
        await supabase
          .from('secuenciacion_contenidos')
          .insert([row]);
      }
      await loadSecuenciaciones();
      resetModal();
    } catch (error) {
      console.error('Error saving secuenciacion:', error);
      alert('Error al guardar la secuenciación');
    }
  };

  const handleDeleteSecuenciacion = async () => {
    if (!editingId) return;
    if (!confirm('¿Deseas eliminar esta secuenciación?')) return;

    try {
      await supabase
        .from('secuenciacion_contenidos')
        .delete()
        .eq('id', editingId);
      await loadSecuenciaciones();
      resetModal();
    } catch (error) {
      console.error('Error deleting secuenciacion:', error);
      alert('Error al eliminar la secuenciación');
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setSelectedContenidos([]);
    setNotas('');
    setEditingId(null);
    setInputValue('');
    setShowSuggestions(false);
  };

  const getContenidoName = (id: string): string => {
    const contenido = contenidos.find(c => c.id === id);
    return contenido ? contenido.nombre : id;
  };

  // Filtrar sugerencias según el input
  const suggestions = inputValue.trim() === '' 
    ? []
    : contenidos.filter(c => 
        !selectedContenidos.includes(c.id) &&
        c.nombre.toLowerCase().includes(inputValue.toLowerCase())
      );

  const calendarDays = Array.from({ length: firstDay }).concat(
    Array.from({ length: monthDays }, (_, i) => i + 1)
  ) as (number | undefined)[];

  if (!loaded) {
    return <div className="page-section">Cargando...</div>;
  }

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Planificación del entrenamiento</small>
          <h1>Secuenciación de contenidos</h1>
        </div>
      </div>

      <div className="calendar-container">
        {/* Calendario Visual */}
        <div className="card calendar-card">
          <div className="calendar-header">
            <button className="nav-btn" onClick={handlePrevMonth}>←</button>
            <h2 className="month-label">{monthName}</h2>
            <button className="nav-btn" onClick={handleNextMonth}>→</button>
          </div>

          <div className="calendar-weekdays">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((day, idx) => {
              const event = getEventForDay(day);
              const secuenciacion = getSecuenciacionForDay(day);
              const hasContent = secuenciacion && secuenciacion.contenidos.length > 0;

              return (
                <div
                  key={idx}
                  className={`calendar-day ${!day ? 'empty' : ''} ${event ? 'has-events' : ''}`}
                  onClick={() => day && event && handleDayClick(day)}
                  style={{ cursor: event ? 'pointer' : 'default' }}
                >
                  {day && (
                    <>
                      <div className="day-header">
                        <span className="day-number">{day}</span>
                        {event && (
                          <span 
                            className="day-add-btn" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleDayClick(day); 
                            }} 
                            title="Editar contenidos"
                          >
                            📝
                          </span>
                        )}
                      </div>
                      {event && (
                        <div className="day-events-indicator">
                          <span className="event-label type-entrenamiento">
                            <span className="event-label-type">Entrenamiento</span>
                            {event.time && <span className="event-label-time">{event.time}</span>}
                          </span>
                        </div>
                      )}
                      {hasContent && (
                        <div style={{ 
                          fontSize: '0.7rem', 
                          color: 'var(--accent, #0ea5e9)', 
                          marginTop: '4px',
                          textAlign: 'center',
                          fontWeight: 'bold'
                        }}>
                          {secuenciacion.contenidos.length} contenido{secuenciacion.contenidos.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel de Resumen */}
        <div className="card events-list-card">
          <div className="section-header">
            <h2>Entrenamientos con contenidos</h2>
          </div>
          <div className="events-list">
            {secuenciaciones.length === 0 ? (
              <p className="no-events">No hay contenidos secuenciados aún</p>
            ) : (
              secuenciaciones
                .filter(sec => {
                  const eventDate = new Date(sec.fecha);
                  const eventMonth = eventDate.getMonth();
                  const eventYear = eventDate.getFullYear();
                  const currentMonth = currentDate.getMonth();
                  const currentYear = currentDate.getFullYear();
                  return eventMonth === currentMonth && eventYear === currentYear;
                })
                .map(sec => (
                  <div key={sec.id} className="event-item">
                    <div className="event-header">
                      <span className="event-date">{new Date(sec.fecha).toLocaleDateString('es-ES', { 
                        weekday: 'short', 
                        year: 'numeric', 
                        month: 'numeric', 
                        day: 'numeric' 
                      })}</span>
                    </div>
                    <div className="event-details">
                      <p><strong>Contenidos ({sec.contenidos.length}):</strong></p>
                      <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                        {sec.contenidos.map((contenido, idx) => (
                          <li key={idx}>{getContenidoName(contenido)}</li>
                        ))}
                      </ul>
                      {sec.notas && <p style={{ marginTop: '8px', fontStyle: 'italic' }}><strong>Notas:</strong> {sec.notas}</p>}
                    </div>
                    {!isReadOnly && (
                      <div className="event-actions">
                        <button className="action-btn edit-btn" onClick={() => {
                          setSelectedDate(sec.fecha);
                          setSelectedContenidos(sec.contenidos);
                          setNotas(sec.notas || '');
                          setEditingId(sec.id);
                          setInputValue('');
                          setShowModal(true);
                        }}>✏️</button>
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Modal para editar contenidos */}
      {showModal && !isReadOnly && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingId ? 'Editar contenidos' : 'Agregar contenidos'}</h2>

            <div className="form-group">
              <label>Fecha: <strong>{new Date(selectedDate!).toLocaleDateString('es-ES', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</strong></label>
            </div>

            {/* Autocomplete para contenidos */}
            <div className="form-group">
              <label htmlFor="contenido-input">Selecciona o escribe un contenido</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="contenido-input"
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Escribe para buscar o crea uno nuevo..."
                  style={{ width: '100%' }}
                />
                
                {showSuggestions && (inputValue.trim() !== '' || suggestions.length > 0) && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--background-secondary, #1a1a2e)',
                    border: '1px solid var(--border, #333)',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    marginTop: '4px'
                  }}>
                    {suggestions.length > 0 ? (
                      suggestions.map(contenido => (
                        <div
                          key={contenido.id}
                          onClick={() => handleAddContenido(contenido)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border, #333)'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--background, #0f0f23)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <strong>{contenido.nombre}</strong>
                          {contenido.descripcion && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #999)', margin: '4px 0 0 0' }}>
                              {contenido.descripcion}
                            </p>
                          )}
                        </div>
                      ))
                    ) : null}
                    
                    {inputValue.trim() !== '' && suggestions.length === 0 && (
                      <div
                        onClick={() => handleAddContenido(inputValue.trim())}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          color: 'var(--accent, #0ea5e9)',
                          fontWeight: 'bold'
                        }}
                      >
                        + Crear: "{inputValue.trim()}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Lista de contenidos seleccionados */}
            {selectedContenidos.length > 0 && (
              <div className="form-group">
                <label>Contenidos seleccionados ({selectedContenidos.length})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {selectedContenidos.map((contenido, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: 'var(--accent, #0ea5e9)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}
                    >
                      <span>{getContenidoName(contenido)}</span>
                      <button
                        onClick={() => handleRemoveContenido(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          padding: 0
                        }}
                      >
                        ×
                      </button>
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
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Detalles adicionales del entrenamiento..."
                rows={3}
              />
            </div>

            {/* Botones de acción */}
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
