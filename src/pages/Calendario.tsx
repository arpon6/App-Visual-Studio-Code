import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import './Calendario.css';

interface Event {
  id: string;
  date: string;
  type: 'partido' | 'entrenamiento' | 'cumpleaños' | 'otro';
  customType?: string;
  place: string;
  time?: string;
  description?: string;
  playerName?: string;
  pdfFile?: {
    name: string;
    data?: string;    // base64, si se subió como archivo
    url?: string;     // URL directa (Supabase Storage u otra)
  };
}

function Calendario() {


    const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const [currentDate, setCurrentDate] = useState(new Date(2026, 4, 1));
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [savedEvents, setSavedEvents] = useState<Event[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'partido' as 'partido' | 'entrenamiento' | 'otro',
    customType: '',
    place: '',
    time: '10:00',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Cargar eventos de Supabase
  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*');
    if (error) { console.error('Error loading events:', error); setLoaded(true); return; }
    const saved: Event[] = (data || []).map(r => ({
      id: r.id,
      date: r.date,
      type: r.type,
      customType: r.custom_type,
      place: r.place,
      time: r.time,
      description: r.description,
      pdfFile: r.pdf_url ? { name: r.pdf_name || 'documento.pdf', url: r.pdf_url } : undefined,
    }));
    setSavedEvents(saved);

    // Guardar los eventos en localStorage para que otras páginas los lean
    localStorage.setItem('calendarEvents', JSON.stringify(saved));

    loadBirthdayEvents(saved, currentDate.getFullYear());
    setLoaded(true);
  };

  const loadBirthdayEvents = async (baseEvents: Event[] = [], year: number = new Date().getFullYear()) => {
    try {
      const { data, error } = await supabase
        .from('plantilla')
        .select('first_name, last_name1, last_name2, birth_date');

      if (error) throw error;

      if (data) {
        const birthdayEvents: Event[] = data
          .filter(player => player.birth_date)
          .map(player => {
            const fullName = [player.first_name, player.last_name1, player.last_name2].filter(Boolean).join(' ');
            const birthDate = new Date(player.birth_date);
            const dateStr = `${String(birthDate.getDate()).padStart(2, '0')}/${String(birthDate.getMonth() + 1).padStart(2, '0')}/${year}`;
            return {
              id: `birthday-${fullName}-${year}`,
              date: dateStr,
              type: 'cumpleaños' as const,
              place: 'N/A',
              playerName: fullName,
              description: `Cumpleaños de ${fullName}`,
            };
          });

        // Combinar con eventos guardados, evitando duplicados
        const nonBirthday = baseEvents.filter(e => e.type !== 'cumpleaños');
        setEvents([...nonBirthday, ...birthdayEvents]);
      }
    } catch (error) {
      console.error('Error loading birthdays:', error);
    }
  };



  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return (day + 6) % 7; // 0=Lun, 1=Mar, ..., 6=Dom
  };

  const monthDays = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
    setCurrentDate(newDate);
    loadBirthdayEvents(savedEvents, newDate.getFullYear());
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
    setCurrentDate(newDate);
    loadBirthdayEvents(savedEvents, newDate.getFullYear());
  };

  const handleDayClick = (day: number, e: React.MouseEvent) => {
    if (isReadOnly) return;
    if ((e.target as HTMLElement).closest('.event-label')) return;
    const dateStr = `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
    setSelectedDate(dateStr);
    setFormData({ type: 'partido', customType: '', place: '', time: '10:00', description: '' });
    setSelectedFile(null);
    setPdfUrl('');
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
      console.log("Iniciando guardado de evento...");
    
      // Obtener la sesión manualmente para verificar autenticación
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Error: No tienes una sesión activa. Por favor, inicia sesión de nuevo.");
        return;
      }

      if (!selectedDate || !formData.place) {
        alert('Por favor, completa fecha y lugar');
        return;
      }

      if (formData.type === 'otro' && !formData.customType) {
        alert('Por favor, especifica el tipo de evento personalizado');
        return;
      }

      // 1. Lógica para subir archivo
      let finalPdfUrl = pdfUrl;
      let finalPdfName = selectedFile ? selectedFile.name : (pdfUrl ? pdfUrl.split('/').pop() || 'documento.pdf' : null);

      if (selectedFile) {
        console.log("Subiendo archivo al bucket...", selectedFile.name);
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
        const filePath = `eventos/${fileName}`;

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('documentos')
          .upload(filePath, selectedFile);

        if (uploadError) {
          console.error("Error al subir archivo a Storage:", uploadError);
          alert('Error al subir el archivo: ' + uploadError.message);
          return;
        }
      
        console.log("Archivo subido con éxito:", uploadData);

        const { data: urlData } = supabase.storage
          .from('documentos')
          .getPublicUrl(filePath);
        
        finalPdfUrl = urlData.publicUrl;
        console.log("URL pública obtenida:", finalPdfUrl);
      }

      // 2. Preparar el objeto para la base de datos
      const row = {
        date: selectedDate,
        type: formData.type,
        custom_type: formData.customType || null,
        place: formData.place,
        time: formData.time || null,
        description: formData.description || null,
        pdf_name: finalPdfName,
        pdf_url: finalPdfUrl,
        created_by: session.user.id,
      };

      console.log("Guardando evento en base de datos:", row);

      // 3. Guardar en la tabla
      let error;
      if (editingEventId) {
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update({ ...row, id: editingEventId })
          .eq('id', editingEventId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('calendar_events')
          .insert([row]);
        error = insertError;
      }

      if (error) {
        console.error('Error final al guardar en tabla calendar_events:', error);
        alert('Error al guardar el evento: ' + error.message);
        return;
      }
    
      console.log("Guardado completado exitosamente");
      await loadEvents();
      resetModal();
    };

  const resetModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setFormData({ type: 'partido', customType: '', place: '', time: '10:00', description: '' });
    setSelectedFile(null);
    setPdfUrl('');
    setEditingEventId(null);
  };

  const handleDeleteEvent = async (id: string) => {
    if (confirm('¿Deseas eliminar este evento?')) {
      await supabase.from('calendar_events').delete().eq('id', id);
      await loadEvents();
    }
  };

  const handleEditEvent = (event: Event) => {
    setSelectedDate(event.date);
    setFormData({
      type: event.type as 'partido' | 'entrenamiento' | 'otro',
      customType: event.customType || '',
      place: event.place,
      time: event.time || '10:00',
      description: event.description || '',
    });
    setSelectedFile(null);
    setPdfUrl(event.pdfFile?.url || '');
    setEditingEventId(event.id);
    setShowModal(true);
  };

  const openPDF = (event: Event) => {
    if (!event.pdfFile) return;
    const src = event.pdfFile.url || event.pdfFile.data;
    if (src) window.open(src, '_blank');
  };

  const getEventTypeLabel = (event: Event): string => {
    if (event.type === 'cumpleaños') {
      return 'Cumpleaños';
    }
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
  ) as (number | undefined)[];

  const getEventsForDay = (day: number | undefined) => {
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
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((day, idx) => {
              const dayEvents = getEventsForDay(day);
              return (
                <div
                  key={idx}
                  className={`calendar-day ${!day ? 'empty' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}
                  onClick={(e) => day && handleDayClick(day, e)}
                >
                  {day && (
                    <>
                      <div className="day-header">
                        <span className="day-number">{day}</span>
                        <span className="day-add-btn" onClick={(e) => { e.stopPropagation(); handleDayClick(day, e); }} title="Añadir evento">+</span>
                      </div>
                      {dayEvents.length > 0 && (
                        <div className="day-events-indicator">
                          {dayEvents.slice(0, 3).map(evt => (
                            <span
                              key={evt.id}
                              className={`event-label type-${evt.type}`}
                              onClick={(e) => { e.stopPropagation(); if (!isReadOnly && evt.type !== 'cumpleaños') handleEditEvent(evt); }}
                              title={evt.type !== 'cumpleaños' ? 'Clic para editar' : evt.description}
                            >
                              <span className="event-label-type">{getEventTypeLabel(evt)}</span>
                              {evt.type === 'cumpleaños' && evt.playerName && <span className="event-label-place">{evt.playerName}</span>}
                              {evt.time && evt.type !== 'cumpleaños' && <span className="event-label-time">{evt.time}</span>}
                              {evt.place && evt.type !== 'cumpleaños' && <span className="event-label-place">{evt.place}</span>}
                              {evt.pdfFile && <span className="event-label-pdf">📄</span>}
                            </span>
                          ))}
                          {dayEvents.length > 3 && <span className="more-events">+{dayEvents.length - 3}</span>}
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
                    <span className="event-date">{evt.date} {evt.time && `· ${evt.time}`}</span>
                  </div>
                  <div className="event-details">
                    <strong>{evt.place}</strong>
                    {evt.playerName && <p><em>📅 {evt.playerName}</em></p>}
                    {evt.description && <p>{evt.description}</p>}
                  </div>
                  <div className="event-actions">
                    {evt.pdfFile && (
                      <button className="action-btn pdf-btn" onClick={() => openPDF(evt)}>
                        📄 {evt.pdfFile.name}
                      </button>
                    )}
                    {!isReadOnly && evt.type !== 'cumpleaños' && (
                      <>
                        <button className="action-btn edit-btn" onClick={() => handleEditEvent(evt)}>✏️</button>
                        <button className="action-btn delete-btn" onClick={() => handleDeleteEvent(evt.id)}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal para Crear/Editar Evento */}
      {showModal && !isReadOnly && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingEventId ? 'Editar evento' : 'Crear evento 123'}</h2>
            
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

            <div className="form-row">
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
                <label htmlFor="time">Hora *</label>
                <select
                  id="time"
                  value={formData.time}
                  onChange={e => setFormData({ ...formData, time: e.target.value })}
                >
                  {Array.from({ length: 24 }).map((_, i) => {
                    const hour = String(i).padStart(2, '0');
                    return (
                      <option key={hour} value={`${hour}:00`}>
                        {hour}:00
                      </option>
                    );
                  })}
                  {Array.from({ length: 24 }).map((_, i) => {
                    const hour = String(i).padStart(2, '0');
                    return (
                      <option key={`${hour}:30`} value={`${hour}:30`}>
                        {hour}:30
                      </option>
                    );
                  })}
                </select>
              </div>
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
              <label htmlFor="pdfUrl">URL del documento (Supabase Storage u otra)</label>
              <input
                id="pdfUrl"
                type="url"
                value={pdfUrl}
                onChange={e => { setPdfUrl(e.target.value); setSelectedFile(null); }}
                placeholder="https://...supabase.co/storage/v1/object/public/documentos/archivo.pdf"
              />
            </div>
            <div className="form-group">
              <label htmlFor="pdf">O subir archivo PDF</label>
              <input
                id="pdf"
                type="file"
                accept=".pdf"
                onChange={e => { handleFileChange(e); setPdfUrl(''); }}
                disabled={!!pdfUrl}
              />
              {selectedFile && <p className="file-info">✓ {selectedFile.name}</p>}
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={resetModal}>Cancelar</button>
                            <button className="btn-save" onClick={() => { console.log("Botón clicado"); handleAddEvent(); }}>
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
