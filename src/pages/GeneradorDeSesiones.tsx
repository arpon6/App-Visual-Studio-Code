import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../lib/AuthContext';
import './Calendario.css';
import tareasMatrixCsv from '../../Copia de Tareas entrenamiento - Matriz.csv?raw';

interface MatrixTask {
  tipoTarea: string;
  intencion: string;
  socioestructura: string;
  nombre: string;
  enlaceImagen: string;
  imagen: string;
  video: string;
  descripcion: string;
}

interface Tarea {
  id: number;
  tiempo: string;
  tipoTarea: string;
  intencion: string;
  socioestructura: string;
  nombre: string;
  descripcion: string;
  espacio: string;
  agrupacion: string;
  enlaceImagen: string;
  imagen: string;
  video: string;
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    const nextChar = raw[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) rows.push(currentRow);
  }

  return rows;
}

function parseTaskMatrix(raw: string): MatrixTask[] {
  const rows = parseCsv(raw);
  const [, ...dataRows] = rows;

  return dataRows
    .map(row => ({
      tipoTarea: row[0] ?? '',
      intencion: row[1] ?? '',
      socioestructura: row[2] ?? '',
      nombre: row[3] ?? '',
      enlaceImagen: row[4] ?? '',
      imagen: row[5] ?? '',
      video: row[6] ?? '',
      descripcion: row[7] ?? ''
    }))
    .filter(row => row.tipoTarea || row.intencion || row.socioestructura || row.nombre || row.descripcion);
}

const LOCAL_TASK_MATRIX = parseTaskMatrix(tareasMatrixCsv);
const TASK_MATRIX_SYNC_INTERVAL_MS = 60 * 1000;

function uniqueValues(rows: MatrixTask[], key: keyof Pick<MatrixTask, 'tipoTarea' | 'intencion' | 'socioestructura' | 'nombre'>): string[] {
  return [...new Set(rows.map(row => row[key]).filter(Boolean))];
}

function normalizeTarea(input: Tarea, matrix: MatrixTask[]): Tarea {
  const next = { ...input };

  const tipos = uniqueValues(matrix, 'tipoTarea');
  if (next.tipoTarea && !tipos.includes(next.tipoTarea)) next.tipoTarea = '';

  let rows = next.tipoTarea ? matrix.filter(row => row.tipoTarea === next.tipoTarea) : matrix;

  const intenciones = uniqueValues(rows, 'intencion');
  if (next.intencion && !intenciones.includes(next.intencion)) {
    next.intencion = '';
  } else if (!next.intencion && intenciones.length === 1) {
    next.intencion = intenciones[0];
  }

  rows = next.intencion ? rows.filter(row => row.intencion === next.intencion) : rows;

  const socioestructuras = uniqueValues(rows, 'socioestructura');
  if (next.socioestructura && !socioestructuras.includes(next.socioestructura)) {
    next.socioestructura = '';
  } else if (!next.socioestructura && socioestructuras.length === 1) {
    next.socioestructura = socioestructuras[0];
  }

  rows = next.socioestructura ? rows.filter(row => row.socioestructura === next.socioestructura) : rows;

  const nombres = uniqueValues(rows, 'nombre');
  if (next.nombre && !nombres.includes(next.nombre)) {
    next.nombre = '';
  } else if (!next.nombre && nombres.length === 1) {
    next.nombre = nombres[0];
  }

  rows = next.nombre ? rows.filter(row => row.nombre === next.nombre) : rows;

  const matchedRow = rows.length === 1 ? rows[0] : null;
  if (matchedRow) {
    next.tipoTarea = matchedRow.tipoTarea;
    next.intencion = matchedRow.intencion;
    next.socioestructura = matchedRow.socioestructura;
    next.nombre = matchedRow.nombre;
    next.descripcion = matchedRow.descripcion;
    next.enlaceImagen = matchedRow.enlaceImagen;
    next.imagen = matchedRow.imagen;
    next.video = matchedRow.video;
  } else if (!next.nombre) {
    next.descripcion = '';
    next.enlaceImagen = '';
    next.imagen = '';
    next.video = '';
  }

  return next;
}

function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/file\/d\/([^/]+)/i);
  return match?.[1] ?? null;
}

function toDrivePreviewUrl(url: string): string {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : url;
}

function toDriveThumbnailUrl(url: string): string {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : url;
}

function valueOrDash(value: string): string {
  const clean = value.trim();
  return clean || '-';
}

type MatrixApiResponse = {
  ok: boolean;
  source?: string;
  count?: number;
  tasks?: MatrixTask[];
  syncedAt?: string;
  error?: string;
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MOMENTOS_SEMANA = ['+1', '+2', '+3', '-3', '-2', '-1'];
const HORAS: string[] = [];
for (let h = 6; h <= 23; h++) {
  HORAS.push(`${String(h).padStart(2,'0')}:00`);
  HORAS.push(`${String(h).padStart(2,'0')}:30`);
}
const CAMPOS = ['Oion Arena'];
const MICROCICLOS = Array.from({ length: 40 }, (_, i) => i + 1);

const emptyTarea = (id: number): Tarea => ({
  id,
  tiempo: '',
  tipoTarea: '',
  intencion: '',
  socioestructura: '',
  nombre: '',
  descripcion: '',
  espacio: '',
  agrupacion: '',
  enlaceImagen: '',
  imagen: '',
  video: ''
});

function SearchableSelect({ options, value, onChange, placeholder, disabled = false }: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => options.filter(o => o.toLowerCase().includes(filter.toLowerCase())), [options, filter]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={open ? filter : value}
        disabled={disabled}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setFilter('');
        }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onChange={e => setFilter(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', background: disabled ? 'rgba(24,36,58,0.45)' : 'rgba(24,36,58,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: disabled ? '#7f96bc' : '#cdd4f1', fontSize: '0.88rem', boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'text' }}
      />
      {open && !disabled && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(12,22,34,0.98)', border: '1px solid rgba(144,244,174,0.3)', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', zIndex: 100 }}>
          {filtered.map(o => (
            <div key={o} onMouseDown={() => { onChange(o); setOpen(false); }} style={{ padding: '7px 10px', cursor: 'pointer', color: '#cdd4f1', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(144,244,174,0.1)') }
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent') }
            >{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function TareaRow({ tarea, index, matrix, onChange, onRemove }: {
  tarea: Tarea; index: number;
  matrix: MatrixTask[];
  onChange: (id: number, patch: Partial<Tarea>) => void;
  onRemove: (id: number) => void;
}) {
  const tipos = useMemo(() => uniqueValues(matrix, 'tipoTarea'), [matrix]);
  const intenciones = useMemo(
    () => uniqueValues(
      tarea.tipoTarea ? matrix.filter(row => row.tipoTarea === tarea.tipoTarea) : matrix,
      'intencion'
    ),
    [matrix, tarea.tipoTarea]
  );
  const socioestructuras = useMemo(
    () => uniqueValues(
      matrix.filter(row =>
        (!tarea.tipoTarea || row.tipoTarea === tarea.tipoTarea) &&
        (!tarea.intencion || row.intencion === tarea.intencion)
      ),
      'socioestructura'
    ),
    [matrix, tarea.tipoTarea, tarea.intencion]
  );
  const nombres = useMemo(
    () => uniqueValues(
      matrix.filter(row =>
        (!tarea.tipoTarea || row.tipoTarea === tarea.tipoTarea) &&
        (!tarea.intencion || row.intencion === tarea.intencion) &&
        (!tarea.socioestructura || row.socioestructura === tarea.socioestructura)
      ),
      'nombre'
    ),
    [matrix, tarea.tipoTarea, tarea.intencion, tarea.socioestructura]
  );

  const cell: React.CSSProperties = { padding: '6px 4px', verticalAlign: 'top' };
  const input: React.CSSProperties = { width: '100%', padding: '6px 8px', background: 'rgba(24,36,58,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '5px', color: '#cdd4f1', fontSize: '0.82rem', boxSizing: 'border-box' };
  const sel: React.CSSProperties = { ...input, cursor: 'pointer' };
  const imagePreviewUrl = tarea.imagen ? tarea.imagen : (tarea.enlaceImagen ? toDriveThumbnailUrl(tarea.enlaceImagen) : '');
  const imageLink = tarea.imagen || tarea.enlaceImagen;
  const videoPreviewUrl = tarea.video ? toDrivePreviewUrl(tarea.video) : '';

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <td style={{ ...cell, textAlign: 'center', color: '#90f4ae', fontWeight: 700, fontSize: '0.9rem', width: '30px' }}>{index + 1}</td>
      <td style={{ ...cell, width: '90px' }}>
        <input style={input} value={tarea.tiempo} onChange={e => onChange(tarea.id, { tiempo: e.target.value })} placeholder="ej. 15'" />
      </td>
      <td style={{ ...cell, minWidth: '180px' }}>
        <select style={sel} value={tarea.tipoTarea} onChange={e => onChange(tarea.id, { tipoTarea: e.target.value, intencion: '', socioestructura: '', nombre: '' })}>
          <option value="">-- Tipo de tarea --</option>
          {tipos.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
        </select>
      </td>
      <td style={{ ...cell, minWidth: '180px' }}>
        <select style={sel} value={tarea.intencion} onChange={e => onChange(tarea.id, { intencion: e.target.value, socioestructura: '', nombre: '' })}>
          <option value="">-- Intención --</option>
          {intenciones.map(intencion => <option key={intencion} value={intencion}>{intencion}</option>)}
        </select>
      </td>
      <td style={{ ...cell, minWidth: '120px' }}>
        <select style={sel} value={tarea.socioestructura} onChange={e => onChange(tarea.id, { socioestructura: e.target.value, nombre: '' })}>
          <option value="">-- Socioestructura --</option>
          {socioestructuras.map(socioestructura => <option key={socioestructura} value={socioestructura}>{socioestructura}</option>)}
        </select>
      </td>
      <td style={{ ...cell, minWidth: '240px' }}>
        <SearchableSelect
          options={nombres}
          value={tarea.nombre}
          onChange={nombre => onChange(tarea.id, { nombre })}
          placeholder="Seleccionar tarea..."
          disabled={nombres.length === 0}
        />
      </td>
      <td style={{ ...cell, minWidth: '280px' }}>
        <textarea style={{ ...input, resize: 'vertical', minHeight: '72px' }} value={tarea.descripcion} onChange={e => onChange(tarea.id, { descripcion: e.target.value })} placeholder="Descripción..." />
      </td>
      <td style={{ ...cell, minWidth: '140px' }}>
        <input style={input} value={tarea.espacio} onChange={e => onChange(tarea.id, { espacio: e.target.value })} placeholder="Espacio..." />
      </td>
      <td style={{ ...cell, minWidth: '140px' }}>
        <input style={input} value={tarea.agrupacion} onChange={e => onChange(tarea.id, { agrupacion: e.target.value })} placeholder="Agrupación..." />
      </td>
      <td style={{ ...cell, minWidth: '260px' }}>
        {!tarea.nombre && <span style={{ color: '#7f96bc', fontSize: '0.8rem' }}>Selecciona una tarea para ver multimedia</span>}

        {tarea.nombre && !imageLink && !tarea.video && (
          <span style={{ color: '#7f96bc', fontSize: '0.8rem' }}>Esta tarea no tiene imagen ni vídeo en la matriz</span>
        )}

        {tarea.nombre && (imageLink || tarea.video) && (
          <div style={{ display: 'grid', gap: '8px' }}>
            {imageLink && (
              <div style={{ display: 'grid', gap: '6px' }}>
                {imagePreviewUrl && (
                  <img
                    src={imagePreviewUrl}
                    alt={`Imagen de ${tarea.nombre}`}
                    style={{ width: '100%', maxWidth: '220px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                )}
                <a href={imageLink} target="_blank" rel="noreferrer" style={{ color: '#90f4ae', fontSize: '0.8rem' }}>
                  Ver imagen
                </a>
              </div>
            )}

            {tarea.video && (
              <div style={{ display: 'grid', gap: '6px' }}>
                {videoPreviewUrl && (
                  <iframe
                    title={`Video de ${tarea.nombre}`}
                    src={videoPreviewUrl}
                    style={{ width: '100%', maxWidth: '220px', minHeight: '125px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}
                    allow="autoplay"
                  />
                )}
                <a href={tarea.video} target="_blank" rel="noreferrer" style={{ color: '#90f4ae', fontSize: '0.8rem' }}>
                  Ver vídeo
                </a>
              </div>
            )}
          </div>
        )}
      </td>
      <td style={{ ...cell, width: '36px', textAlign: 'center' }}>
        <button onClick={() => onRemove(tarea.id)} title="Eliminar tarea" style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 4px' }}>×</button>
      </td>
    </tr>
  );
}

function GeneradorDeSesiones() {
  const { user } = useAuth();
  if (user?.role === 'jugador') return <div className="page-section">No tienes acceso a esta sección.</div>;

  const [taskMatrix, setTaskMatrix] = useState<MatrixTask[]>(LOCAL_TASK_MATRIX);
  const [matrixStatus, setMatrixStatus] = useState('Sincronizando matriz...');
  const [matrixError, setMatrixError] = useState('');

  const [mes, setMes] = useState('');
  const [momentoSemana, setMomentoSemana] = useState('');
  const [hora, setHora] = useState('');
  const [campo, setCampo] = useState('');
  const [campoCustom, setCampoCustom] = useState('');
  const [microciclo, setMicrociclo] = useState('');
  const [contenidosFoco, setContenidosFoco] = useState('');
  const [numJugadores, setNumJugadores] = useState('');
  const [jugadoresAusentes, setJugadoresAusentes] = useState('');
  const [tareas, setTareas] = useState<Tarea[]>([emptyTarea(1)]);
  const [nextId, setNextId] = useState(2);

  useEffect(() => {
    let alive = true;

    const syncMatrix = async () => {
      try {
        const response = await fetch('/api/sessions-task-matrix', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({} as MatrixApiResponse));
          throw new Error(String(payload?.error || 'No se pudo leer la matriz remota.'));
        }

        const payload = await response.json() as MatrixApiResponse;
        const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
        if (tasks.length === 0) throw new Error('La hoja se ha leido, pero no tiene filas utiles.');

        if (!alive) return;
        setTaskMatrix(tasks);
        setMatrixError('');
        setMatrixStatus(`Matriz sincronizada (${tasks.length} tareas). Ultima actualizacion: ${new Date(payload.syncedAt || Date.now()).toLocaleTimeString()}`);
      } catch (error) {
        if (!alive) return;
        setMatrixError((error as Error).message || 'No se pudo sincronizar la matriz.');
        setMatrixStatus(`Usando respaldo local (${LOCAL_TASK_MATRIX.length} tareas).`);
      }
    };

    void syncMatrix();
    const intervalId = window.setInterval(() => {
      void syncMatrix();
    }, TASK_MATRIX_SYNC_INTERVAL_MS);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setTareas(prev => prev.map(t => normalizeTarea(t, taskMatrix)));
  }, [taskMatrix]);

  const handleAddTarea = () => {
    setTareas(prev => [...prev, emptyTarea(nextId)]);
    setNextId(prev => prev + 1);
  };

  const handleRemoveTarea = (id: number) => {
    setTareas(prev => prev.filter(t => t.id !== id));
  };

  const handleChangeTarea = (id: number, patch: Partial<Tarea>) => {
    setTareas(prev => prev.map(t => t.id === id ? normalizeTarea({ ...t, ...patch }, taskMatrix) : t));
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const textWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (spaceNeeded: number) => {
      if (y + spaceNeeded > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const addWrappedText = (text: string, size = 10, lineGap = 14) => {
      const lines = doc.splitTextToSize(text, textWidth);
      doc.setFontSize(size);
      lines.forEach((line: string) => {
        ensureSpace(lineGap);
        doc.text(line, margin, y);
        y += lineGap;
      });
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Sesion de entrenamiento', margin, y);
    y += 24;

    doc.setFont('helvetica', 'normal');
    addWrappedText(`Mes: ${valueOrDash(mes)} | Momento semana: ${valueOrDash(momentoSemana)} | Hora: ${valueOrDash(hora)}`);
    addWrappedText(`Campo: ${valueOrDash(campoFinal)} | Microciclo: ${valueOrDash(microciclo)}`);
    addWrappedText(`Numero de jugadores: ${valueOrDash(numJugadores)} | Jugadores ausentes: ${valueOrDash(jugadoresAusentes)}`);
    y += 6;

    doc.setFont('helvetica', 'bold');
    addWrappedText('Contenidos foco:', 11);
    doc.setFont('helvetica', 'normal');
    addWrappedText(valueOrDash(contenidosFoco), 10);
    y += 8;

    doc.setFont('helvetica', 'bold');
    addWrappedText('Tareas de la sesion', 13);
    doc.setFont('helvetica', 'normal');

    if (tareas.length === 0) {
      addWrappedText('No hay tareas registradas.');
    }

    tareas.forEach((tarea, index) => {
      y += 4;
      ensureSpace(18);
      doc.setFont('helvetica', 'bold');
      addWrappedText(`${index + 1}. ${valueOrDash(tarea.nombre)}`, 11);
      doc.setFont('helvetica', 'normal');
      addWrappedText(`Tiempo: ${valueOrDash(tarea.tiempo)} | Espacio: ${valueOrDash(tarea.espacio)} | Agrupacion: ${valueOrDash(tarea.agrupacion)}`);
      addWrappedText(`Tipo de tarea: ${valueOrDash(tarea.tipoTarea)} | Intencion: ${valueOrDash(tarea.intencion)} | Socioestructura: ${valueOrDash(tarea.socioestructura)}`);
      addWrappedText(`Descripcion: ${valueOrDash(tarea.descripcion)}`);
      if (tarea.imagen || tarea.enlaceImagen) addWrappedText(`Imagen: ${tarea.imagen || tarea.enlaceImagen}`);
      if (tarea.video) addWrappedText(`Video: ${tarea.video}`);
      y += 4;
    });

    const fileName = `sesion-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  };

  const campoFinal = campo === 'otro' ? campoCustom : campo;

  const headerStyle: React.CSSProperties = { color: '#90f4ae', fontSize: '0.82rem', fontWeight: 600, padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid rgba(144,244,174,0.3)', whiteSpace: 'nowrap' };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Planificación del entrenamiento</small>
          <h1>Generador de sesiones</h1>
        </div>
        <button className="nav-btn export-btn" onClick={handleExportPdf}>📄 Exportar PDF</button>
      </div>

      {/* ── CABECERA DE LA FICHA ─────────────────────────────────── */}
      <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
        <h3 style={{ color: '#ffffff', marginBottom: '18px', fontSize: '1rem' }}>📋 Datos generales de la sesión</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
          {/* Mes */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Mes</label>
            <select value={mes} onChange={e => setMes(e.target.value)}>
              <option value="">-- Mes --</option>
              {MESES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Momento de la semana */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Momento semana</label>
            <select value={momentoSemana} onChange={e => setMomentoSemana(e.target.value)}>
              <option value="">-- Día --</option>
              {MOMENTOS_SEMANA.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Hora */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Hora</label>
            <select value={hora} onChange={e => setHora(e.target.value)}>
              <option value="">-- Hora --</option>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Campo */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Campo</label>
            <select value={campo} onChange={e => setCampo(e.target.value)}>
              <option value="">-- Campo --</option>
              {CAMPOS.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="otro">Otro...</option>
            </select>
          </div>

          {campo === 'otro' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre del campo</label>
              <input type="text" value={campoCustom} onChange={e => setCampoCustom(e.target.value)} placeholder="Escribe el campo..." />
            </div>
          )}

          {/* Microciclo */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Microciclo nº</label>
            <select value={microciclo} onChange={e => setMicrociclo(e.target.value)}>
              <option value="">-- Nº --</option>
              {MICROCICLOS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Nº Jugadores */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nº jugadores</label>
            <input type="text" value={numJugadores} onChange={e => setNumJugadores(e.target.value)} placeholder="ej. 18" />
          </div>

          {/* Jugadores ausentes */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Jugadores ausentes</label>
            <input type="text" value={jugadoresAusentes} onChange={e => setJugadoresAusentes(e.target.value)} placeholder="Nombres..." />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '14px', marginBottom: 0 }}>
          <label>Contenidos foco</label>
          <textarea rows={4} value={contenidosFoco} onChange={e => setContenidosFoco(e.target.value)} placeholder="Escribe aquí los contenidos foco de la sesión..." />
        </div>

        {/* Resumen rápido */}
        {(mes || momentoSemana || hora || campoFinal || microciclo) && (
          <div style={{ marginTop: '16px', padding: '10px 14px', background: 'rgba(144,244,174,0.07)', border: '1px solid rgba(144,244,174,0.2)', borderRadius: '8px', color: '#90f4ae', fontSize: '0.88rem', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {mes && <span>📅 <strong>{mes}</strong></span>}
            {momentoSemana && <span>📆 Día <strong>{momentoSemana}</strong></span>}
            {hora && <span>🕐 <strong>{hora}</strong></span>}
            {campoFinal && <span>📍 <strong>{campoFinal}</strong></span>}
            {microciclo && <span>🔢 Microciclo <strong>{microciclo}</strong></span>}
            {numJugadores && <span>👥 <strong>{numJugadores}</strong> jugadores</span>}
          </div>
        )}
      </div>

      {/* ── TABLA DE TAREAS ──────────────────────────────────────── */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: '#ffffff', margin: 0, fontSize: '1rem' }}>⚽ Tareas de la sesión</h3>
          <button className="btn-save" onClick={handleAddTarea} style={{ padding: '8px 18px', fontSize: '0.88rem' }}>+ Añadir tarea</button>
        </div>

        <div style={{ marginBottom: '14px', color: '#7f96bc', fontSize: '0.84rem' }}>
          Los desplegables se alimentan del archivo de matriz. Cada selección filtra la siguiente y, si solo queda una opción posible, la fila se completa automáticamente.
        </div>

        <div style={{ marginBottom: '14px', color: matrixError ? '#ff9d9d' : '#90f4ae', fontSize: '0.8rem' }}>
          {matrixError ? `${matrixStatus} Error: ${matrixError}` : matrixStatus}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(24,36,58,0.8)' }}>
                <th style={{ ...headerStyle, width: '30px' }}>#</th>
                <th style={headerStyle}>Tiempo</th>
                <th style={headerStyle}>Tipo de tarea</th>
                <th style={headerStyle}>Intención</th>
                <th style={headerStyle}>Socioestructura</th>
                <th style={headerStyle}>Nombre de la tarea</th>
                <th style={headerStyle}>Descripción</th>
                <th style={headerStyle}>Espacio</th>
                <th style={headerStyle}>Agrupación</th>
                <th style={headerStyle}>Multimedia</th>
                <th style={{ ...headerStyle, width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {tareas.map((tarea, idx) => (
                <TareaRow
                  key={tarea.id}
                  tarea={tarea}
                  index={idx}
                  matrix={taskMatrix}
                  onChange={handleChangeTarea}
                  onRemove={handleRemoveTarea}
                />
              ))}
            </tbody>
          </table>
        </div>

        {tareas.length === 0 && (
          <p style={{ color: '#7f96bc', textAlign: 'center', padding: '30px 0' }}>No hay tareas. Pulsa "+ Añadir tarea" para comenzar.</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '10px' }}>
          <button className="nav-btn" onClick={handleAddTarea}>+ Añadir tarea</button>
          <button className="btn-save" onClick={handleExportPdf}>📄 Exportar PDF</button>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .sidebar-shell, .page-title button, .btn-save, .nav-btn { display: none !important; }
          .app-main { margin: 0 !important; }
          .card { border: 1px solid #ccc !important; background: white !important; color: #000 !important; }
          body, .page-section { background: white !important; color: #000 !important; }
          table { font-size: 0.75rem; }
        }
      `}</style>
    </section>
  );
}

export default GeneradorDeSesiones;
