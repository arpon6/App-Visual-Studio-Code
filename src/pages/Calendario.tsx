import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_MATCH_TYPE, LEAGUE_TEAMS } from '../lib/leagueTeams';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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
  rival?: string;
  jornada?: string;
  matchType?: string;
  trainingGroup?: TrainingGroup;
  pdfFile?: {
    name: string;
    data?: string;
    url?: string;
  };
}

const TRAINING_GROUP_OPTIONS = ['G1', 'G2', 'G3', 'G4'] as const;
type TrainingGroup = typeof TRAINING_GROUP_OPTIONS[number];
type TrainingGroupsByDate = Record<string, TrainingGroup>;

const EMPTY_FORM = {
  type: 'partido' as 'partido' | 'entrenamiento' | 'otro',
  customType: '',
  place: '',
  time: '10:00',
  description: '',
  rival: '',
  rivalCustom: '',
  jornada: '-',
  matchType: DEFAULT_MATCH_TYPE,
};

const normalizeEventType = (value: string | null | undefined): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const parseBirthDateParts = (value: string | null | undefined): { day: number; month: number } | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month };
    }
    return null;
  }

  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month };
    }
    return null;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return { day: parsed.getDate(), month: parsed.getMonth() + 1 };
  }

  return null;
};

const parseCalendarDateParts = (value: string | null | undefined): { day: number; month: number; year: number } | null => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { day, month, year };
};

const getAutoTrainingGroupForDate = (date: string | null | undefined): TrainingGroup | null => {
  const parts = parseCalendarDateParts(date);
  if (!parts) return null;

  const currentYear = new Date().getFullYear();
  const seasonYear = parts.month >= 9 ? parts.year : parts.year - 1;
  if (seasonYear < currentYear) return null;

  const seasonStart = new Date(seasonYear, 8, 1);
  const eventDate = new Date(parts.year, parts.month - 1, parts.day);
  const diffDays = Math.floor((eventDate.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;

  return TRAINING_GROUP_OPTIONS[Math.floor(diffDays / 7) % TRAINING_GROUP_OPTIONS.length];
};

const getEffectiveTrainingGroupForDate = (date: string, manualGroup?: TrainingGroup | null): TrainingGroup | null => {
  return manualGroup || getAutoTrainingGroupForDate(date);
};

function Calendario() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [savedEvents, setSavedEvents] = useState<Event[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [trainingGroupsByDate, setTrainingGroupsByDate] = useState<TrainingGroupsByDate>({});

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
      rival: r.rival,
      jornada: r.jornada,
      matchType: r.match_type,
      trainingGroup: typeof r.training_group === 'string' && TRAINING_GROUP_OPTIONS.includes(r.training_group as TrainingGroup)
        ? (r.training_group as TrainingGroup)
        : undefined,
      pdfFile: r.pdf_url ? { name: r.pdf_name || 'documento.pdf', url: r.pdf_url } : undefined,
    }));

    const groupsByDate = saved.reduce<TrainingGroupsByDate>((acc, event) => {
      if (event.type === 'entrenamiento' && event.trainingGroup) {
        acc[event.date] = event.trainingGroup;
      }
      return acc;
    }, {});

    setTrainingGroupsByDate(groupsByDate);
    setSavedEvents(saved);
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
          .reduce<Event[]>((acc, player) => {
            const fullName = [player.first_name, player.last_name1, player.last_name2].filter(Boolean).join(' ');
            const birthParts = parseBirthDateParts(player.birth_date);
            if (!birthParts) return acc;

            const dateStr = `${String(birthParts.day).padStart(2, '0')}/${String(birthParts.month).padStart(2, '0')}/${year}`;
            acc.push({
              id: `birthday-${fullName}-${year}`,
              date: dateStr,
              type: 'cumpleaños',
              place: 'N/A',
              playerName: fullName,
              description: `Cumpleaños de ${fullName}`,
            });
            return acc;
          }, []);
        const nonBirthday = baseEvents.filter(e => normalizeEventType(e.type) !== 'cumpleanos');
        setEvents([...nonBirthday, ...birthdayEvents]);
      }
    } catch (error) {
      console.error('Error loading birthdays:', error);
    }
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
    setFormData(EMPTY_FORM);
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
    if (!user) {
      alert('Error: No tienes una sesión activa. Por favor, inicia sesión de nuevo.');
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

    let finalPdfUrl = pdfUrl;
    let finalPdfName = selectedFile ? selectedFile.name : (pdfUrl ? pdfUrl.split('/').pop() || 'documento.pdf' : null);

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const filePath = `eventos/${fileName}`;
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('documentos')
        .upload(filePath, selectedFile);
      if (uploadError) {
        alert('Error al subir el archivo: ' + uploadError.message);
        return;
      }
      console.log('Archivo subido con éxito:', uploadData);
      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
      finalPdfUrl = urlData.publicUrl;
    }

    const finalRival = formData.rival === '__custom__' ? formData.rivalCustom : formData.rival;

    const row = {
      date: selectedDate,
      type: formData.type,
      custom_type: formData.customType || null,
      place: formData.place,
      time: formData.time || null,
      description: formData.description || null,
      rival: formData.type === 'partido' ? (finalRival || null) : null,
      jornada: formData.type === 'partido' ? (formData.jornada || null) : null,
      match_type: formData.type === 'partido' ? (formData.matchType || null) : null,
      training_group: formData.type === 'entrenamiento'
        ? (trainingGroupsByDate[selectedDate] || getAutoTrainingGroupForDate(selectedDate) || null)
        : null,
      pdf_name: finalPdfName,
      pdf_url: finalPdfUrl,
      created_by: user.id,
    };

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
      alert('Error al guardar el evento: ' + error.message);
      return;
    }
    await loadEvents();
    resetModal();
  };

  const resetModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setFormData(EMPTY_FORM);
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
    const rivalIsCustom = !!event.rival && !LEAGUE_TEAMS.includes(event.rival) && event.rival !== 'Por determinar';
    setFormData({
      type: event.type as 'partido' | 'entrenamiento' | 'otro',
      customType: event.customType || '',
      place: event.place,
      time: event.time || '10:00',
      description: event.description || '',
      rival: rivalIsCustom ? '__custom__' : (event.rival || ''),
      rivalCustom: rivalIsCustom ? (event.rival || '') : '',
      jornada: event.jornada || '-',
      matchType: event.matchType || DEFAULT_MATCH_TYPE,
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
    if (event.type === 'cumpleaños') return 'Cumpleaños';
    if (event.type === 'otro' && event.customType) return event.customType;
    return event.type.charAt(0).toUpperCase() + event.type.slice(1);
  };

  const getEventsBetweenDates = (startDate: Date, endDate: Date): Event[] => {
    return events.filter(event => {
      const parts = event.date.split('/');
      const eventDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
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

  const getDateStrForDay = (day: number) => (
    `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`
  );

  const getEventsForDay = (day: number | undefined) => {
    if (!day) return [];
    const dateStr = getDateStrForDay(day);
    return events.filter(evt => evt.date === dateStr);
  };

  const handleTrainingGroupChange = async (date: string, group: string) => {
    if (isReadOnly) return;

    const trainingGroup = group && TRAINING_GROUP_OPTIONS.includes(group as TrainingGroup)
      ? (group as TrainingGroup)
      : null;

    const prevValue = trainingGroupsByDate[date];
    setTrainingGroupsByDate(prev => {
      const next = { ...prev };
      if (!trainingGroup) {
        delete next[date];
      } else {
        next[date] = trainingGroup;
      }
      return next;
    });

    const { error } = await supabase
      .from('calendar_events')
      .update({ training_group: trainingGroup })
      .eq('date', date)
      .eq('type', 'entrenamiento');

    if (error) {
      setTrainingGroupsByDate(prev => {
        const next = { ...prev };
        if (!prevValue) {
          delete next[date];
        } else {
          next[date] = prevValue;
        }
        return next;
      });
      alert('No se pudo guardar el grupo en la nube. Aplica la migración SQL de training_group y vuelve a intentar.');
    }
  };

  const handleExportPDF = async () => {
    const nombre = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const element = document.querySelector('.calendar-card') as HTMLElement;
    if (!element) return;

    element.classList.add('exporting-pdf');
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));

    try {
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
      pdf.save(`Calendario_${nombre}.pdf`);
    } finally {
      element.classList.remove('exporting-pdf');
    }
  };

  if (!loaded) return null;

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
            <button className="nav-btn export-btn" onClick={handleExportPDF} title="Descargar PDF del mes">⬇ PDF</button>
          </div>

          <div className="calendar-weekdays">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((day, idx) => {
              const dayEvents = getEventsForDay(day);
              const dateStr = day ? getDateStrForDay(day) : '';
              const hasTrainingEvent = dayEvents.some(evt => evt.type === 'entrenamiento');
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
                            >
                              <span className="event-label-body"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (evt.pdfFile) {
                                    openPDF(evt);
                                  } else if (!isReadOnly && evt.type !== 'cumpleaños') {
                                    handleEditEvent(evt);
                                  }
                                }}
                                title={evt.type !== 'cumpleaños' ? (evt.pdfFile ? 'Clic para abrir documento' : 'Clic para editar') : evt.description}
                              >
                                <span className="event-label-type">{getEventTypeLabel(evt)}</span>
                                {evt.type === 'partido' && evt.matchType && <span className="event-label-meta">{evt.matchType}</span>}
                                {evt.type === 'partido' && evt.rival && <span className="event-label-rival">vs {evt.rival}</span>}
                                {evt.type === 'cumpleaños' && evt.playerName && <span className="event-label-place">{evt.playerName}</span>}
                                {evt.time && evt.type !== 'cumpleaños' && <span className="event-label-time">{evt.time}</span>}
                                {evt.place && evt.type !== 'cumpleaños' && <span className="event-label-place">{evt.place}</span>}
                                {evt.pdfFile && <span className="event-label-pdf">📄</span>}
                              </span>
                              {!isReadOnly && evt.type !== 'cumpleaños' && (
                                <span
                                  className="event-label-delete"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteEvent(evt.id); }}
                                  title="Eliminar evento"
                                >✕</span>
                              )}
                            </span>
                          ))}
                          {dayEvents.length > 3 && <span className="more-events">+{dayEvents.length - 3}</span>}
                        </div>
                      )}
                      {hasTrainingEvent && (
                        <div className="training-group-row" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="training-group-select"
                            value={getEffectiveTrainingGroupForDate(dateStr, trainingGroupsByDate[dateStr]) || ''}
                            onChange={(e) => handleTrainingGroupChange(dateStr, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={isReadOnly}
                            title="Seleccionar grupo de entrenamiento"
                          >
                            <option value="">-</option>
                            {TRAINING_GROUP_OPTIONS.map(group => (
                              <option key={group} value={group}>{group}</option>
                            ))}
                          </select>
                          <span className="training-group-display">
                            {getEffectiveTrainingGroupForDate(dateStr, trainingGroupsByDate[dateStr]) || '-'}
                          </span>
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
                    {evt.type === 'partido' && evt.rival && <p>⚔️ <strong>Rival:</strong> {evt.rival}</p>}
                    {evt.type === 'entrenamiento' && getEffectiveTrainingGroupForDate(evt.date, trainingGroupsByDate[evt.date]) && <p><strong>{getEffectiveTrainingGroupForDate(evt.date, trainingGroupsByDate[evt.date])}</strong></p>}
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
                        <button className="action-btn edit-btn" onClick={() => handleEditEvent(evt)}>✏️ Editar</button>
                        <button className="action-btn delete-btn" onClick={() => handleDeleteEvent(evt.id)}>🗑️ Eliminar</button>
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

            {formData.type === 'partido' && (
              <>
                <div className="form-group">
                  <label htmlFor="rival">Rival</label>
                  <select
                    id="rival"
                    value={formData.rival}
                    onChange={e => setFormData({ ...formData, rival: e.target.value, rivalCustom: '' })}
                  >
                    <option value="">-- Seleccionar rival --</option>
                    {LEAGUE_TEAMS.map(r => <option key={r} value={r}>{r}</option>)}
                    <option value="__custom__">Otro (escribir nombre)</option>
                    <option value="Por determinar">Por determinar</option>
                  </select>
                </div>
                {formData.rival === '__custom__' && (
                  <div className="form-group">
                    <label htmlFor="rivalCustom">Nombre del rival</label>
                    <input
                      id="rivalCustom"
                      type="text"
                      value={formData.rivalCustom}
                      onChange={e => setFormData({ ...formData, rivalCustom: e.target.value })}
                      placeholder="Escribe el nombre del equipo"
                    />
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="matchType">Tipo de partido</label>
                    <select
                      id="matchType"
                      value={formData.matchType}
                      onChange={e => setFormData({ ...formData, matchType: e.target.value })}
                    >
                      <option value="Liga">Liga</option>
                      <option value="Copa Federación">Copa Federación</option>
                      <option value="Amistoso">Amistoso</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="jornada">Jornada</label>
                    <select
                      id="jornada"
                      value={formData.jornada}
                      onChange={e => setFormData({ ...formData, jornada: e.target.value })}
                    >
                      <option value="-">-</option>
                      {Array.from({ length: 34 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={String(n)}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="place">Lugar *</label>
                <input
                  id="place"
                  type="text"
                  value={formData.place === 'Por determinar' ? '' : formData.place}
                  onChange={e => setFormData({ ...formData, place: e.target.value })}
                  placeholder="Ej: Estadio Municipal, Cancha 3..."
                  disabled={formData.place === 'Por determinar'}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cdd4f1', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.place === 'Por determinar'}
                    onChange={e => setFormData({ ...formData, place: e.target.checked ? 'Por determinar' : '' })}
                  />
                  Por determinar
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="time">Hora *</label>
                <select
                  id="time"
                  value={formData.time}
                  onChange={e => setFormData({ ...formData, time: e.target.value })}
                >
                  <option value="Por determinar">Por determinar</option>
                  {Array.from({ length: 24 }).flatMap((_, i) => {
                    const hour = String(i).padStart(2, '0');
                    return [
                      <option key={`${hour}:00`} value={`${hour}:00`}>{hour}:00</option>,
                      <option key={`${hour}:30`} value={`${hour}:30`}>{hour}:30</option>,
                    ];
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
