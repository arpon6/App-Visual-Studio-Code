import { useState, useEffect } from 'react';
import './Calendario.css';

interface Event {
  id: string;
  date: string;
  type: 'partido' | 'entrenamiento' | 'otro';
  customType?: string;
  place: string;
  description?: string;
  pdfFile?: {
    name: string;
    data: string;
  };
}

function Calendario() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 4, 1));
  const [events, setEvents] = useState<Event[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'partido' as 'partido' | 'entrenamiento' | 'otro',
    customType: '',
    place: '',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Cargar eventos del localStorage
  useEffect(() => {
    const saved = localStorage.getItem('calendarEvents');
    if (saved) {
      try {
        setEvents(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading events:', e);
      }
    }
  }, []);

  // Guardar eventos en localStorage
  useEffect(() => {
    localStorage.setItem('calendarEvents', JSON.stringify(events));
  }, [events]);

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const monthDays = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
    setSelectedDate(dateStr);
    setFormData({ type: 'partido', customType: '', place: '', description: '' });
    setSelectedFile(null);
    setEditingEventId(null);
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    } else {
      alert('Por favor, selecciona un archivo PDF válido');
    }
  };

  const handleAddEvent = async () => {
    if (!selectedDate || !formData.place) {
      alert('Por favor, completa fecha y lugar');
      return;
    }

    if (formData.type === 'otro' && !formData.customType) {
      alert('Por favor, especifica el tipo de evento personalizado');
      return;
    }

    const newEvent: Event = {
      id: editingEventId || Date.now().toString(),
      date: selectedDate,
      type: formData.type,
      customType: formData.customType,
      place: formData.place,
      description: formData.description,
    };

    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        newEvent.pdfFile = {
          name: selectedFile.name,
          data: e.target?.result as string,
        };

        if (editingEventId) {
          setEvents(events.map(evt => evt.id === editingEventId ? newEvent : evt));
        } else {
          setEvents([...events, newEvent]);
        }

        resetModal();
      };
      reader.readAsDataURL(selectedFile);
    } else {
      if (editingEventId) {
        setEvents(events.map(evt => evt.id === editingEventId ? newEvent : evt));
      } else {
        setEvents([...events, newEvent]);
      }
      resetModal();
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setFormData({ type: 'partido', customType: '', place: '', description: '' });
    setSelectedFile(null);
    setEditingEventId(null);
  };

  const handleDeleteEvent = (id: string) => {
    if (confirm('¿Deseas eliminar este evento?')) {
      setEvents(events.filter(evt => evt.id !== id));
    }
  };

  const handleEditEvent = (event: Event) => {
    setSelectedDate(event.date);
    setFormData({
      type: event.type,
      customType: event.customType || '',
      place: event.place,
      description: event.description || '',
    });
    setEditingEventId(event.id);
    setShowModal(true);
  };

  const downloadPDF = (event: Event) => {
    if (event.pdfFile) {
      const link = document.createElement('a');
      link.href = event.pdfFile.data;
      link.download = event.pdfFile.name;
      link.click();
    }
  };

  const getEventTypeLabel = (event: Event): string => {
    if (event.type === 'otro' && event.customType) {
      return event.customType;
    }
    return event.type.charAt(0).toUpperCase() + event.type.slice(1);
  };

  const getEventsBetweenDates = (startDate: Date, endDate: Date): Event[] => {
    return events.filter(event => {
      const parts = event.date.split('/');
      const eventDate = new Date(
        parseInt(parts[2]),
        parseInt(parts[1]) - 1,
        parseInt(parts[0])
      );
      return eventDate >= startDate && eventDate <= endDate;
    });
  };

  const upcomingEvents = getEventsBetweenDates(
    new Date(),
    new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000)
  ).sort((a, b) => {
    const dateA = new Date(a.date.split('/').reverse().join('-'));
    const dateB = new Date(b.date.split('/').reverse().join('-'));
    return dateA.getTime() - dateB.getTime();
  });

  const calendarDays = Array.from({ length: firstDay }).concat(
    Array.from({ length: monthDays }, (_, i) => i + 1)
  );

  const getEventsForDay = (day: number | null) => {
    if (!day) return [];
    const dateStr = `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
    return events.filter(evt => evt.date === dateStr);
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Gestión de eventos</small>
          <h1>Calendario</h1>
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
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((day, idx) => {
              const dayEvents = getEventsForDay(day as number | null);
              return (
                <div
                  key={idx}
                  className={`calendar-day ${!day ? 'empty' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}
                  onClick={() => day && handleDayClick(day as number)}
                >
                  {day && (
                    <>
                      <span className="day-number">{day}</span>
                      {dayEvents.length > 0 && (
                        <div className="day-events-indicator">
                          {dayEvents.slice(0, 2).map(evt => (
                            <span key={evt.id} className={`event-dot type-${evt.type}`}></span>
                          ))}
                          {dayEvents.length > 2 && <span className="more-events">+{dayEvents.length - 2}</span>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Lista de Eventos Próximos */}
        <div className="card events-list-card">
          <div className="section-header">
            <h2>Próximos eventos (30 días)</h2>
          </div>
          <div className="events-list">
            {upcomingEvents.length === 0 ? (
              <p className="no-events">No hay eventos próximos</p>
            ) : (
              upcomingEvents.map(evt => (
                <div key={evt.id} className="event-item">
                  <div className="event-header">
                    <span className={`event-type type-${evt.type}`}>{getEventTypeLabel(evt)}</span>
                    <span className="event-date">{evt.date}</span>
                  </div>
                  <div className="event-details">
                    <strong>{evt.place}</strong>
                    {evt.description && <p>{evt.description}</p>}
                  </div>
                  <div className="event-actions">
                    {evt.pdfFile && (
                      <button className="action-btn pdf-btn" onClick={() => downloadPDF(evt)}>
                        📄 {evt.pdfFile.name}
                      </button>
                    )}
                    <button className="action-btn edit-btn" onClick={() => handleEditEvent(evt)}>✏️</button>
                    <button className="action-btn delete-btn" onClick={() => handleDeleteEvent(evt.id)}>🗑️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal para Crear/Editar Evento */}
      {showModal && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingEventId ? 'Editar evento' : 'Crear evento'}</h2>
            
            <div className="form-group">
              <label>Fecha: <strong>{selectedDate}</strong></label>
            </div>

            <div className="form-group">
              <label htmlFor="type">Tipo de evento *</label>
              <select
                id="type"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as 'partido' | 'entrenamiento' | 'otro' })}
              >
                <option value="partido">Partido</option>
                <option value="entrenamiento">Entrenamiento</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            {formData.type === 'otro' && (
              <div className="form-group">
                <label htmlFor="customType">Especificar tipo *</label>
                <input
                  id="customType"
                  type="text"
                  value={formData.customType}
                  onChange={e => setFormData({ ...formData, customType: e.target.value })}
                  placeholder="Ej: Reunión, Revisión médica, etc."
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="place">Lugar *</label>
              <input
                id="place"
                type="text"
                value={formData.place}
                onChange={e => setFormData({ ...formData, place: e.target.value })}
                placeholder="Ej: Estadio Municipal, Cancha 3, etc."
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Descripción (opcional)</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Notas adicionales..."
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="pdf">Adjuntar PDF (opcional)</label>
              <input
                id="pdf"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
              />
              {selectedFile && <p className="file-info">✓ {selectedFile.name}</p>}
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={resetModal}>Cancelar</button>
              <button className="btn-save" onClick={handleAddEvent}>
                {editingEventId ? 'Actualizar' : 'Crear'} Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default Calendario;
