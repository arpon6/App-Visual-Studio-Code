import { useState, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import './Calendario.css';

// ─── MATRIZ DE TAREAS (columnas A-H) ───────────────────────────────────────
// A: Tipo de tarea | B: Intención | C: Socioestructura | D: Nombre
// E: Enlace Imagen | F: Imagen | G: Vídeo | H: Descripción
const MATRIZ: {
  momento: string; submomento: string; nombre: string; descripcion: string;
  objetivo: string; tipo: string; jugadores: string; duracion: string;
}[] = [
  // FASE OFENSIVA
  { momento: 'Fase Ofensiva', submomento: 'Finalizar', nombre: 'Definición 1vs1 portero', descripcion: 'El atacante enfrenta al portero en situación de 1vs1 para finalizar', objetivo: 'Mejorar la toma de decisión ante portero', tipo: 'Finalización', jugadores: '2-4', duracion: '8-10 min' },
  { momento: 'Fase Ofensiva', submomento: 'Finalizar', nombre: 'Combinación y remate', descripcion: 'Combinación en el último tercio con centro y remate', objetivo: 'Asociación en zona de finalización', tipo: 'Finalización', jugadores: '4-6', duracion: '10-12 min' },
  { momento: 'Fase Ofensiva', submomento: 'Progresar', nombre: 'Progresión por bandas', descripcion: 'Uso de los extremos para progresar hacia zona ofensiva', objetivo: 'Amplitud y verticalidad ofensiva', tipo: 'Posesión dirigida', jugadores: '6-10', duracion: '12-15 min' },
  { momento: 'Fase Ofensiva', submomento: 'Progresar', nombre: 'Progresión interior', descripcion: 'Combinaciones interiores para superar líneas', objetivo: 'Juego entre líneas y movilidad interior', tipo: 'Posesión dirigida', jugadores: '6-10', duracion: '12-15 min' },
  { momento: 'Fase Ofensiva', submomento: 'Construir', nombre: 'Salida de balón 3-2', descripcion: 'Construcción desde atrás en superioridad 3vs2', objetivo: 'Salida limpia bajo presión', tipo: 'Rondo/posesión', jugadores: '5-7', duracion: '10-12 min' },
  { momento: 'Fase Ofensiva', submomento: 'Construir', nombre: 'Construcción Z1-Z2', descripcion: 'Transporte del balón desde zona 1 a zona 2', objetivo: 'Organización en fase de construcción', tipo: 'Posición', jugadores: '8-11', duracion: '15-20 min' },
  { momento: 'Fase Ofensiva', submomento: 'Mantener', nombre: 'Rondo 5vs2', descripcion: 'Rondo clásico con presión interior', objetivo: 'Conservación y circulación rápida', tipo: 'Rondo/posesión', jugadores: '7', duracion: '8-10 min' },
  { momento: 'Fase Ofensiva', submomento: 'Mantener', nombre: 'Posesión 7vs7 con porterías', descripcion: 'Posesión en campo reducido con transiciones', objetivo: 'Mantener el balón bajo presión', tipo: 'Juego reducido', jugadores: '14', duracion: '20-25 min' },
  // FASE DEFENSIVA
  { momento: 'Fase Defensiva', submomento: 'Presión alta', nombre: 'Pressing 4-4-2 alto', descripcion: 'Presión organizada desde la delantera en zona rival', objetivo: 'Recuperación alta del balón', tipo: 'Organización defensiva', jugadores: '10-11', duracion: '15-20 min' },
  { momento: 'Fase Defensiva', submomento: 'Presión alta', nombre: 'Trampa al lateral', descripcion: 'Presión coordinada para forzar el pase al lateral y robar', objetivo: 'Provocar pérdida en zona alta', tipo: 'Organización defensiva', jugadores: '8-10', duracion: '12-15 min' },
  { momento: 'Fase Defensiva', submomento: 'Repliegue intermedio', nombre: 'Bloque medio 4-4-2', descripcion: 'Organización defensiva en bloque medio', objetivo: 'Compacidad y control de espacios intermedios', tipo: 'Organización defensiva', jugadores: '10-11', duracion: '15-20 min' },
  { momento: 'Fase Defensiva', submomento: 'Repliegue total', nombre: 'Bloque bajo y salida', descripcion: 'Defensa profunda con salida rápida en transición', objetivo: 'Solidez defensiva y contragolpe', tipo: 'Organización defensiva', jugadores: '10-11', duracion: '15-20 min' },
  { momento: 'Fase Defensiva', submomento: 'Defender área', nombre: 'Defensa de centros', descripcion: 'Organización para defender centros laterales', objetivo: 'Cobertura de área en balón parado', tipo: 'Organización defensiva', jugadores: '8-11', duracion: '12-15 min' },
  // TRANSICIÓN OFENSIVA
  { momento: 'Transición Ofensiva', submomento: 'Contragolpe', nombre: 'Contragolpe 3vs2', descripcion: 'Salida rápida en superioridad numérica tras robo', objetivo: 'Verticalidad y velocidad en transición', tipo: 'Juego reducido', jugadores: '5-7', duracion: '12-15 min' },
  { momento: 'Transición Ofensiva', submomento: 'Contragolpe', nombre: 'Contragolpe 2vs1', descripcion: 'Definición rápida en 2vs1 tras robo', objetivo: 'Decisión en superioridad inmediata', tipo: 'Finalización', jugadores: '3-5', duracion: '8-10 min' },
  { momento: 'Transición Ofensiva', submomento: 'Juego directo', nombre: 'Balón largo al espacio', descripcion: 'Pase largo para aprovechar la espalda de la defensa', objetivo: 'Profundidad y ruptura de líneas', tipo: 'Técnica-táctica', jugadores: '6-10', duracion: '12-15 min' },
  // TRANSICIÓN DEFENSIVA
  { momento: 'Transición Defensiva', submomento: 'Recuperación tras pérdida', nombre: 'Pressing inmediato Z4', descripcion: 'Presión tras pérdida en zona ofensiva', objetivo: 'Recuperación alta inmediata', tipo: 'Organización defensiva', jugadores: '6-10', duracion: '12-15 min' },
  { momento: 'Transición Defensiva', submomento: 'Recuperación tras pérdida', nombre: 'Repliegue rápido', descripcion: 'Vuelta organizada a posición defensiva tras pérdida', objetivo: 'Evitar el contragolpe rival', tipo: 'Organización defensiva', jugadores: '10-11', duracion: '15-20 min' },
  // BALÓN PARADO
  { momento: 'Balón Parado', submomento: 'ABP Ofensivo', nombre: 'Córner ofensivo zona 1', descripcion: 'Estrategia de córner con bloqueos y llegadas', objetivo: 'Generar ocasiones en ABP ofensivo', tipo: 'Balón parado', jugadores: '8-11', duracion: '10-12 min' },
  { momento: 'Balón Parado', submomento: 'ABP Ofensivo', nombre: 'Falta lateral en 3ª zona', descripcion: 'Estrategia de falta lateral con segunda jugada', objetivo: 'Finalización en ABP lateral', tipo: 'Balón parado', jugadores: '8-11', duracion: '10-12 min' },
  { momento: 'Balón Parado', submomento: 'ABP Defensivo', nombre: 'Defensa de córner en zona', descripcion: 'Defensa zonal en córner rival', objetivo: 'Cubrir zonas y evitar el remate', tipo: 'Balón parado', jugadores: '8-11', duracion: '10-12 min' },
  { momento: 'Balón Parado', submomento: 'ABP Defensivo', nombre: 'Defensa de falta directa', descripcion: 'Organización de la barrera y cobertura de portero', objetivo: 'Seguridad en falta directa rival', tipo: 'Balón parado', jugadores: '8-11', duracion: '8-10 min' },
  // FÍSICO-TÉCNICO
  { momento: 'Físico-Técnico', submomento: 'Calentamiento', nombre: 'Calentamiento con balón', descripcion: 'Activación dinámica con posesión y movimientos', objetivo: 'Preparación física y cognitiva', tipo: 'Calentamiento', jugadores: 'Todo el grupo', duracion: '10-15 min' },
  { momento: 'Físico-Técnico', submomento: 'Calentamiento', nombre: 'Rondo de activación', descripcion: 'Rondo 4vs1 para activar toque y concentración', objetivo: 'Activación técnica inicial', tipo: 'Calentamiento', jugadores: '5-10', duracion: '8-10 min' },
  { momento: 'Físico-Técnico', submomento: 'Técnica individual', nombre: 'Conducción y cambio de ritmo', descripcion: 'Circuito de conducciones con obstáculos', objetivo: 'Control del balón en carrera', tipo: 'Técnica individual', jugadores: 'Individual', duracion: '8-10 min' },
  { momento: 'Físico-Técnico', submomento: 'Técnica individual', nombre: 'Pase y recepción orientada', descripcion: 'Ejercicio de pase corto y recepción con giro', objetivo: 'Primer toque y orientación del cuerpo', tipo: 'Técnica individual', jugadores: '2-4', duracion: '10-12 min' },
  { momento: 'Físico-Técnico', submomento: 'Físico', nombre: 'Trabajo de aceleración', descripcion: 'Series cortas de sprint con balón', objetivo: 'Velocidad de arranque', tipo: 'Físico', jugadores: 'Individual', duracion: '8-10 min' },
  { momento: 'Físico-Técnico', submomento: 'Físico', nombre: 'Resistencia aeróbica con balón', descripcion: 'Juego de posesión largo con alta intensidad', objetivo: 'Resistencia y toma de decisiones en fatiga', tipo: 'Físico', jugadores: '10-14', duracion: '20-25 min' },
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MOMENTOS_SEMANA = ['+1','+2','+3','-3','-2','-1'];
const HORAS: string[] = [];
for (let h = 6; h <= 23; h++) {
  HORAS.push(`${String(h).padStart(2,'0')}:00`);
  HORAS.push(`${String(h).padStart(2,'0')}:30`);
}
const CAMPOS = ['Oion Arena'];
const MICROCICLOS = Array.from({ length: 40 }, (_, i) => i + 1);

interface Tarea {
  id: number;
  tiempo: string;
  momento: string;
  submomento: string;
  tareaFiltro: string;
  nombre: string;
  descripcion: string;
  objetivo: string;
  tipo: string;
  jugadores: string;
  duracion: string;
  notas: string;
}

const emptyTarea = (id: number): Tarea => ({
  id, tiempo: '', momento: '', submomento: '', tareaFiltro: '',
  nombre: '', descripcion: '', objetivo: '', tipo: '', jugadores: '', duracion: '', notas: '',
});

function SearchableSelect({ options, value, onChange, placeholder }: {
  options: string[]; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => options.filter(o => o.toLowerCase().includes(filter.toLowerCase())), [options, filter]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={open ? filter : value}
        onFocus={() => { setOpen(true); setFilter(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onChange={e => setFilter(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', background: 'rgba(24,36,58,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#cdd4f1', fontSize: '0.88rem', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
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

function TareaRow({ tarea, index, onChange, onRemove }: {
  tarea: Tarea; index: number;
  onChange: (id: number, field: keyof Tarea, val: string) => void;
  onRemove: (id: number) => void;
}) {
  const momentos = useMemo(() => [...new Set(MATRIZ.map(m => m.momento))], []);
  const submomentos = useMemo(() =>
    tarea.momento ? [...new Set(MATRIZ.filter(m => m.momento === tarea.momento).map(m => m.submomento))] : [...new Set(MATRIZ.map(m => m.submomento))],
    [tarea.momento]);
  const tareasDisp = useMemo(() =>
    MATRIZ.filter(m => (!tarea.momento || m.momento === tarea.momento) && (!tarea.submomento || m.submomento === tarea.submomento)),
    [tarea.momento, tarea.submomento]);

  const handleSelectTarea = (nombre: string) => {
    const found = MATRIZ.find(m => m.nombre === nombre);
    if (!found) { onChange(tarea.id, 'tareaFiltro', nombre); return; }
    onChange(tarea.id, 'tareaFiltro', nombre);
    onChange(tarea.id, 'nombre', found.nombre);
    onChange(tarea.id, 'descripcion', found.descripcion);
    onChange(tarea.id, 'objetivo', found.objetivo);
    onChange(tarea.id, 'tipo', found.tipo);
    onChange(tarea.id, 'jugadores', found.jugadores);
    onChange(tarea.id, 'duracion', found.duracion);
  };

  const cell: React.CSSProperties = { padding: '6px 4px', verticalAlign: 'top' };
  const input: React.CSSProperties = { width: '100%', padding: '6px 8px', background: 'rgba(24,36,58,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '5px', color: '#cdd4f1', fontSize: '0.82rem', boxSizing: 'border-box' };
  const sel: React.CSSProperties = { ...input, cursor: 'pointer' };

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <td style={{ ...cell, textAlign: 'center', color: '#90f4ae', fontWeight: 700, fontSize: '0.9rem', width: '30px' }}>{index + 1}</td>
      <td style={{ ...cell, width: '80px' }}>
        <input style={input} value={tarea.tiempo} onChange={e => onChange(tarea.id, 'tiempo', e.target.value)} placeholder="ej. 15'" />
      </td>
      <td style={{ ...cell, width: '130px' }}>
        <select style={sel} value={tarea.momento} onChange={e => { onChange(tarea.id, 'momento', e.target.value); onChange(tarea.id, 'submomento', ''); onChange(tarea.id, 'tareaFiltro', ''); }}>
          <option value="">-- Momento --</option>
          {momentos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </td>
      <td style={{ ...cell, width: '140px' }}>
        <select style={sel} value={tarea.submomento} onChange={e => { onChange(tarea.id, 'submomento', e.target.value); onChange(tarea.id, 'tareaFiltro', ''); }}>
          <option value="">-- Submomento --</option>
          {submomentos.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{ ...cell, minWidth: '180px' }}>
        <SearchableSelect
          options={tareasDisp.map(t => t.nombre)}
          value={tarea.tareaFiltro}
          onChange={handleSelectTarea}
          placeholder="Buscar tarea..."
        />
      </td>
      <td style={{ ...cell, minWidth: '160px' }}>
        <input style={input} value={tarea.nombre} onChange={e => onChange(tarea.id, 'nombre', e.target.value)} placeholder="Nombre tarea..." />
      </td>
      <td style={{ ...cell, minWidth: '180px' }}>
        <textarea style={{ ...input, resize: 'vertical', minHeight: '52px' }} value={tarea.descripcion} onChange={e => onChange(tarea.id, 'descripcion', e.target.value)} placeholder="Descripción..." />
      </td>
      <td style={{ ...cell, minWidth: '160px' }}>
        <textarea style={{ ...input, resize: 'vertical', minHeight: '52px' }} value={tarea.objetivo} onChange={e => onChange(tarea.id, 'objetivo', e.target.value)} placeholder="Objetivo..." />
      </td>
      <td style={{ ...cell, width: '110px' }}>
        <input style={input} value={tarea.tipo} onChange={e => onChange(tarea.id, 'tipo', e.target.value)} placeholder="Tipo..." />
      </td>
      <td style={{ ...cell, width: '90px' }}>
        <input style={input} value={tarea.jugadores} onChange={e => onChange(tarea.id, 'jugadores', e.target.value)} placeholder="Nº jug..." />
      </td>
      <td style={{ ...cell, width: '90px' }}>
        <input style={input} value={tarea.duracion} onChange={e => onChange(tarea.id, 'duracion', e.target.value)} placeholder="Durac..." />
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

  const [mes, setMes] = useState('');
  const [momentoSemana, setMomentoSemana] = useState('');
  const [hora, setHora] = useState('');
  const [campo, setCampo] = useState('');
  const [campoCustom, setCampoCustom] = useState('');
  const [microciclo, setMicrociclo] = useState('');
  const [objConBalon, setObjConBalon] = useState('');
  const [objSinBalon, setObjSinBalon] = useState('');
  const [otrosObjetivos, setOtrosObjetivos] = useState('');
  const [numJugadores, setNumJugadores] = useState('');
  const [jugadoresAusentes, setJugadoresAusentes] = useState('');
  const [tareas, setTareas] = useState<Tarea[]>([emptyTarea(1)]);
  const [nextId, setNextId] = useState(2);
  const [printed, setPrinted] = useState(false);

  const handleAddTarea = () => {
    setTareas(prev => [...prev, emptyTarea(nextId)]);
    setNextId(n => n + 1);
  };

  const handleRemoveTarea = (id: number) => {
    setTareas(prev => prev.filter(t => t.id !== id));
  };

  const handleChangeTarea = (id: number, field: keyof Tarea, val: string) => {
    setTareas(prev => prev.map(t => t.id === id ? { ...t, [field]: val } : t));
  };

  const handlePrint = () => {
    setPrinted(true);
    setTimeout(() => { window.print(); setPrinted(false); }, 100);
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
        <button className="nav-btn export-btn" onClick={handlePrint}>🖨️ Imprimir / PDF</button>
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

        {/* Objetivos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px', marginTop: '14px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Objetivos momentos con balón</label>
            <textarea rows={3} value={objConBalon} onChange={e => setObjConBalon(e.target.value)} placeholder="Describe los objetivos con balón..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Objetivos momentos sin balón</label>
            <textarea rows={3} value={objSinBalon} onChange={e => setObjSinBalon(e.target.value)} placeholder="Describe los objetivos sin balón..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Otros objetivos</label>
            <textarea rows={3} value={otrosObjetivos} onChange={e => setOtrosObjetivos(e.target.value)} placeholder="Físicos, actitudinales..." />
          </div>
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

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(24,36,58,0.8)' }}>
                <th style={{ ...headerStyle, width: '30px' }}>#</th>
                <th style={headerStyle}>Tiempo</th>
                <th style={headerStyle}>Momento</th>
                <th style={headerStyle}>Submomento</th>
                <th style={headerStyle}>Buscar tarea</th>
                <th style={headerStyle}>Nombre tarea</th>
                <th style={headerStyle}>Descripción</th>
                <th style={headerStyle}>Objetivo</th>
                <th style={headerStyle}>Tipo</th>
                <th style={headerStyle}>Jugadores</th>
                <th style={headerStyle}>Duración</th>
                <th style={{ ...headerStyle, width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {tareas.map((tarea, idx) => (
                <TareaRow
                  key={tarea.id}
                  tarea={tarea}
                  index={idx}
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
          <button className="btn-save" onClick={handlePrint}>🖨️ Imprimir / PDF</button>
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
