import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';

interface PlantillaJugador {
  id: string;
  dorsal: number;
  nombre: string;
  posicion: string;
}

interface EstadisticasLinea {
  pj: number;
  pt: number;
  goles: number;
  tarjetas: number;
  minutos: number;
}

type AjustesManuales = Record<string, EstadisticasLinea>;

interface EstadisticaActaLinea {
  dorsal: number;
  nombre: string;
  titular: boolean;
  goles: number;
  tarjetas: number;
  minutos: number;
}

interface ActaPartido {
  id: string;
  fecha: string;
  rival: string;
  resultado: string | null;
  competicion: string | null;
  estadisticas_actas?: EstadisticaActaLinea[];
}

const posicionOrder: Record<string, number> = {
  Portero: 0,
  Defensa: 1,
  Centrocampista: 2,
  Delantero: 3,
};

const posicionColor: Record<string, string> = {
  Portero: '#4a9eff', Defensa: '#90f4ae', Centrocampista: '#f4c842', Delantero: '#f47c42',
};

const inputStyle = {
  padding: '8px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(10,18,30,0.9)', color: '#fff', fontSize: '0.9rem', width: '100%',
};

const smallInputStyle = {
  width: '54px', textAlign: 'center' as const, padding: '4px',
  borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(10,18,30,0.9)', color: '#fff',
};

interface ActaJugador {
  playerId: string;
  dorsal: number; nombre: string; titular: boolean;
  goles: number; tarjetas: number; minutos: number;
}

interface ActaForm {
  fecha: string; rival: string; resultado: string; competicion: string;
  jugadores: ActaJugador[];
}

const statsEnCero = (): EstadisticasLinea => ({ pj: 0, pt: 0, goles: 0, tarjetas: 0, minutos: 0 });

const getPlayerKey = (id: string) => String(id);

const createActaJugadores = (players: PlantillaJugador[]): ActaJugador[] =>
  players.map(p => ({
    playerId: p.id,
    dorsal: p.dorsal,
    nombre: p.nombre,
    titular: false,
    goles: 0,
    tarjetas: 0,
    minutos: 0,
  }));

const mergeActaJugadores = (players: PlantillaJugador[], current: ActaJugador[]): ActaJugador[] => {
  const byId = new Map(current.map(j => [j.playerId, j]));
  return players.map((p) => {
    const prev = byId.get(p.id);
    return {
      playerId: p.id,
      dorsal: p.dorsal,
      nombre: p.nombre,
      titular: prev?.titular ?? false,
      goles: prev?.goles ?? 0,
      tarjetas: prev?.tarjetas ?? 0,
      minutos: prev?.minutos ?? 0,
    };
  });
};

// Intenta extraer datos de jugadores del texto del acta
function parsearTextoActa(texto: string, jugadores: ActaJugador[]): ActaJugador[] {
  const resultado = jugadores.map(j => ({ ...j }));
  const lineas = texto.split('\n');

  resultado.forEach(j => {
    // Busca el apellido principal del jugador en el texto
    const apellido = j.nombre.split(' ').slice(1).join(' ').toLowerCase();
    const nombre = j.nombre.toLowerCase();

    for (const linea of lineas) {
      const l = linea.toLowerCase();
      if (!l.includes(apellido) && !l.includes(nombre)) continue;

      // Titular: si aparece en alineación inicial (busca patrones comunes de actas RFEF)
      if (/titular|alineaci[oó]n|once|inicial/i.test(linea)) j.titular = true;

      // Minutos jugados: busca patrones como "90'", "45'", "(67)", "67 min"
      const minMatch = linea.match(/\b(\d{1,3})['\u2019\u2032]|\((\d{1,3})\)|(\d{1,3})\s*min/i);
      if (minMatch) {
        const min = parseInt(minMatch[1] || minMatch[2] || minMatch[3]);
        if (min > 0 && min <= 120) j.minutos = min;
      }

      // Goles: busca "gol", número de goles junto al nombre
      if (/gol/i.test(linea)) {
        const golMatch = linea.match(/(\d+)\s*gol|gol[^a-z]*(\d+)/i);
        j.goles += golMatch ? parseInt(golMatch[1] || golMatch[2]) : 1;
      }

      // Tarjetas
      if (/amarilla|yellow/i.test(linea)) j.tarjetas += 1;
      if (/roja|red card|expuls/i.test(linea)) j.tarjetas += 2;
    }
  });

  return resultado;
}

function Estadisticas() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const [actas, setActas] = useState<ActaPartido[]>([]);
  const [players, setPlayers] = useState<PlantillaJugador[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState('');
  const [urlActa, setUrlActa] = useState('');
  const [manualStats, setManualStats] = useSharedState<AjustesManuales>('estadisticas_ajustes_manuales', {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ActaForm>({
    fecha: '', rival: '', resultado: '', competicion: '',
    jugadores: [],
  });

  useEffect(() => {
    fetchActas();
    fetchPlayers();

    const channel = supabase
      .channel('estadisticas_plantilla_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plantilla' }, () => {
        fetchPlayers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchActas = async () => {
    const { data } = await supabase.from('actas_partidos').select('*, estadisticas_actas(*)');
    setActas(data || []);
  };

  const fetchPlayers = async () => {
    setLoadingPlayers(true);
    const { data } = await supabase
      .from('plantilla')
      .select('id, number, first_name, last_name1, last_name2, position');

    const mapped: PlantillaJugador[] = ((data || []) as any[])
      .map((p) => ({
        id: String(p.id),
        dorsal: Number(p.number) || 0,
        nombre: [p.first_name, p.last_name1, p.last_name2].filter(Boolean).join(' ') || 'Sin nombre',
        posicion: p.position || 'Sin posicion',
      }))
      .sort((a, b) => {
        const byPos = (posicionOrder[a.posicion] ?? 99) - (posicionOrder[b.posicion] ?? 99);
        if (byPos !== 0) return byPos;
        return a.dorsal - b.dorsal;
      });

    setPlayers(mapped);
    setForm((prev) => ({ ...prev, jugadores: mergeActaJugadores(mapped, prev.jugadores) }));
    setLoadingPlayers(false);
  };

  const statsFinales = useMemo(() => {
    return players.map((player) => {
      let pjActas = 0;
      let ptActas = 0;
      let golesActas = 0;
      let tarjetasActas = 0;
      let minutosActas = 0;

      actas.forEach((acta) => {
        const linea = acta.estadisticas_actas?.find((e) => {
          const mismoDorsal = e.dorsal === player.dorsal;
          const mismoNombre = e.nombre?.trim().toLowerCase() === player.nombre.trim().toLowerCase();
          return mismoDorsal || mismoNombre;
        });

        if (linea) {
          pjActas += 1;
          if (linea.titular) ptActas += 1;
          golesActas += linea.goles || 0;
          tarjetasActas += linea.tarjetas || 0;
          minutosActas += linea.minutos || 0;
        }
      });

      const ajuste = manualStats[getPlayerKey(player.id)] || statsEnCero();
      return {
        ...player,
        pj: pjActas + (ajuste.pj || 0),
        pt: ptActas + (ajuste.pt || 0),
        goles: golesActas + (ajuste.goles || 0),
        tarjetas: tarjetasActas + (ajuste.tarjetas || 0),
        minutos: minutosActas + (ajuste.minutos || 0),
      };
    });
  }, [actas, manualStats, players]);

  const handleManualStatChange = (playerId: string, field: keyof EstadisticasLinea, value: number) => {
    setManualStats((prev) => {
      const key = getPlayerKey(playerId);
      const current = prev[key] || statsEnCero();
      return {
        ...prev,
        [key]: {
          ...current,
          [field]: Math.max(0, Number.isFinite(value) ? value : 0),
        },
      };
    });
  };

  const resetManualStats = () => {
    const confirmReset = window.confirm('Esto pondra los ajustes manuales en 0 para todos los jugadores. Continuar?');
    if (!confirmReset) return;
    setManualStats({});
  };

  const toggleForm = () => {
    setShowForm((prev) => {
      const next = !prev;
      if (next) {
        setForm({
          fecha: '',
          rival: '',
          resultado: '',
          competicion: '',
          jugadores: createActaJugadores(players),
        });
        setUrlActa('');
        setParseMsg('');
      }
      return next;
    });
  };

  const handleJugadorChange = (idx: number, field: keyof ActaJugador, value: any) => {
    setForm(f => {
      const jugadores = [...f.jugadores];
      jugadores[idx] = { ...jugadores[idx], [field]: value };
      return { ...f, jugadores };
    });
  };

  const aplicarParser = (texto: string) => {
    const jugadoresParseados = parsearTextoActa(texto, form.jugadores);
    const conDatos = jugadoresParseados.filter(j => j.titular || j.goles > 0 || j.tarjetas > 0 || j.minutos > 0);
    setForm(f => ({ ...f, jugadores: jugadoresParseados }));
    setParseMsg(conDatos.length > 0
      ? `✓ Se han detectado datos para ${conDatos.length} jugador${conDatos.length > 1 ? 'es' : ''}. Revisa y ajusta si es necesario.`
      : '⚠ No se han podido extraer datos automáticamente. Rellena la tabla manualmente.');
  };

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseMsg('');
    try {
      // Lectura de texto plano (TXT, CSV, HTML)
      if (file.type === 'text/plain' || file.type === 'text/html' || file.type === 'text/csv' || file.name.endsWith('.txt')) {
        const texto = await file.text();
        aplicarParser(texto);
      } else {
        // Para PDF e imágenes: extraemos el texto que el navegador puede leer del nombre + aviso
        setParseMsg('⚠ Para PDF e imágenes la extracción automática no está disponible en el navegador. Copia el texto del acta en el campo URL/texto y pulsa "Extraer datos".');
      }
    } catch {
      setParseMsg('Error al leer el archivo.');
    }
    setParsing(false);
  };

  const handleUrl = async () => {
    if (!urlActa.trim()) return;
    setParsing(true);
    setParseMsg('');
    try {
      // Si es texto pegado directamente (no URL), parsear directamente
      if (!urlActa.startsWith('http')) {
        aplicarParser(urlActa);
        setParsing(false);
        return;
      }
      // Intento de fetch de la URL como texto
      const res = await fetch(urlActa);
      const texto = await res.text();
      // Eliminar etiquetas HTML si las hay
      const sinHtml = texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      aplicarParser(sinHtml);
    } catch {
      setParseMsg('⚠ No se pudo acceder a la URL (CORS). Copia y pega el texto del acta directamente en el campo y pulsa "Extraer datos".');
    }
    setParsing(false);
  };

  const handleGuardar = async () => {
    if (!form.fecha || !form.rival) return;
    setSaving(true);
    const { data: acta, error } = await supabase
      .from('actas_partidos')
      .insert({ fecha: form.fecha, rival: form.rival, resultado: form.resultado, competicion: form.competicion })
      .select().maybeSingle();

    if (!error && acta) {
      const lineas = form.jugadores
        .filter(j => j.titular || j.goles > 0 || j.tarjetas > 0 || j.minutos > 0)
        .map(j => ({ acta_id: acta.id, dorsal: j.dorsal, nombre: j.nombre, titular: j.titular, goles: j.goles, tarjetas: j.tarjetas, minutos: j.minutos }));
      if (lineas.length > 0) await supabase.from('estadisticas_actas').insert(lineas);
      await fetchActas();
      setShowForm(false);
      setUrlActa('');
      setParseMsg('');
      setForm({ fecha: '', rival: '', resultado: '', competicion: '', jugadores: createActaJugadores(players) });
    }
    setSaving(false);
  };

  const handleEliminarActa = async (id: string) => {
    await supabase.from('actas_partidos').delete().eq('id', id);
    await fetchActas();
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Temporada 2023-24</small>
          <h1>Estadísticas</h1>
        </div>
        <button
          onClick={toggleForm}
          style={{ marginLeft: 'auto', padding: '10px 20px', borderRadius: '12px', background: '#16d67a', color: '#071119', fontWeight: 700, border: 'none', cursor: 'pointer', display: isReadOnly ? 'none' : undefined }}
        >
          {showForm ? 'Cancelar' : '+ Cargar acta'}
        </button>
      </div>

      {loadingPlayers && <div className="card" style={{ padding: '16px' }}>Cargando plantilla...</div>}

      {!loadingPlayers && players.length === 0 && (
        <div className="card" style={{ padding: '16px' }}>
          No hay jugadores en plantilla. Anade jugadores para ver y cargar estadisticas.
        </div>
      )}

      {showForm && !isReadOnly && (
        <div className="card" style={{ padding: '24px', display: 'grid', gap: '20px' }}>
          <h2 style={{ margin: 0 }}>Nueva acta de partido</h2>

          {/* Datos del partido */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {([['Fecha', 'fecha', 'date'], ['Rival', 'rival', 'text'], ['Resultado', 'resultado', 'text'], ['Competición', 'competicion', 'text']] as const).map(([label, field, type]) => (
              <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#7f96bc' }}>
                {label}
                <input type={type} value={(form as any)[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={inputStyle} />
              </label>
            ))}
          </div>

          {/* Carga automática */}
          <div style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '18px', display: 'grid', gap: '14px', background: 'rgba(10,18,30,0.6)' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#fff' }}>Extracción automática <span style={{ fontWeight: 400, color: '#7f96bc', fontSize: '0.85rem' }}>(opcional)</span></p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#7f96bc' }}>
                URL del acta o pega el texto directamente
                <textarea
                  value={urlActa}
                  onChange={e => setUrlActa(e.target.value)}
                  rows={2}
                  placeholder="https://... o pega aquí el texto del acta"
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </label>
              <button
                onClick={handleUrl}
                disabled={parsing || !urlActa.trim()}
                style={{ padding: '10px 16px', borderRadius: '10px', background: '#2d68ff', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {parsing ? '...' : 'Extraer datos'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#7f96bc', fontSize: '0.85rem' }}>O sube un archivo (.txt, .html):</span>
              <input ref={fileRef} type="file" accept=".txt,.html,.csv" style={{ display: 'none' }} onChange={handleArchivo} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
                style={{ padding: '8px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Seleccionar archivo
              </button>
            </div>

            {parseMsg && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: parseMsg.startsWith('✓') ? '#90f4ae' : '#f4c842' }}>{parseMsg}</p>
            )}
          </div>

          {/* Tabla manual */}
          <div style={{ overflowX: 'auto' }}>
            <table className="list-table" style={{ minWidth: '640px' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jugador</th>
                  <th style={{ textAlign: 'center' }}>Titular</th>
                  <th style={{ textAlign: 'center' }}>Goles</th>
                  <th style={{ textAlign: 'center' }}>Tarjetas</th>
                  <th style={{ textAlign: 'center' }}>Min.</th>
                </tr>
              </thead>
              <tbody>
                {form.jugadores.map((j, idx) => (
                  <tr key={j.playerId}>
                    <td style={{ color: '#7f96bc' }}>{j.dorsal}</td>
                    <td style={{ color: '#fff' }}>{j.nombre}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={j.titular} onChange={e => handleJugadorChange(idx, 'titular', e.target.checked)} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} max={20} value={j.goles} onChange={e => handleJugadorChange(idx, 'goles', parseInt(e.target.value) || 0)} style={smallInputStyle} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} max={3} value={j.tarjetas} onChange={e => handleJugadorChange(idx, 'tarjetas', parseInt(e.target.value) || 0)} style={smallInputStyle} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} max={120} value={j.minutos} onChange={e => handleJugadorChange(idx, 'minutos', parseInt(e.target.value) || 0)} style={smallInputStyle} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleGuardar}
            disabled={saving || !form.fecha || !form.rival}
            style={{ justifySelf: 'start', padding: '10px 24px', borderRadius: '12px', background: saving ? '#555' : '#16d67a', color: '#071119', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Guardando...' : 'Guardar acta'}
          </button>
        </div>
      )}

      {!isReadOnly && players.length > 0 && (
        <div className="card" style={{ padding: '24px', overflowX: 'auto' }}>
          <div className="section-header" style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Ajuste manual de estadisticas</h2>
            <button
              onClick={resetManualStats}
              style={{ padding: '8px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}
            >
              Poner ajustes a 0
            </button>
          </div>
          <p style={{ marginTop: 0, color: '#7f96bc', fontSize: '0.9rem' }}>
            Puedes sumar datos manuales si aun no hay actas o quieres corregir algun valor.
          </p>
          <table className="list-table" style={{ minWidth: '700px' }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th style={{ textAlign: 'center' }}>PJ</th>
                <th style={{ textAlign: 'center' }}>PT</th>
                <th style={{ textAlign: 'center' }}>Goles</th>
                <th style={{ textAlign: 'center' }}>Tarjetas</th>
                <th style={{ textAlign: 'center' }}>Min.</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const ajuste = manualStats[getPlayerKey(p.id)] || statsEnCero();
                return (
                  <tr key={p.id}>
                    <td style={{ color: '#7f96bc', width: '40px' }}>{p.dorsal}</td>
                    <td style={{ color: '#fff' }}>{p.nombre}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} value={ajuste.pj} onChange={(e) => handleManualStatChange(p.id, 'pj', parseInt(e.target.value, 10) || 0)} style={smallInputStyle} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} value={ajuste.pt} onChange={(e) => handleManualStatChange(p.id, 'pt', parseInt(e.target.value, 10) || 0)} style={smallInputStyle} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} value={ajuste.goles} onChange={(e) => handleManualStatChange(p.id, 'goles', parseInt(e.target.value, 10) || 0)} style={smallInputStyle} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} value={ajuste.tarjetas} onChange={(e) => handleManualStatChange(p.id, 'tarjetas', parseInt(e.target.value, 10) || 0)} style={smallInputStyle} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" min={0} value={ajuste.minutos} onChange={(e) => handleManualStatChange(p.id, 'minutos', parseInt(e.target.value, 10) || 0)} style={smallInputStyle} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {actas.length > 0 && (
        <div className="card" style={{ padding: '24px' }}>
          <div className="section-header" style={{ marginBottom: '14px' }}>
            <h2>Actas cargadas ({actas.length})</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {actas.map(acta => (
              <div key={acta.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(10,18,30,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ color: '#fff', fontSize: '0.9rem' }}>{acta.fecha} · <strong>{acta.rival}</strong>{acta.resultado ? ` · ${acta.resultado}` : ''}</span>
                <button onClick={() => handleEliminarActa(acta.id)} style={{ background: 'none', border: 'none', color: '#f44242', cursor: 'pointer', fontSize: '1rem' }} title="Eliminar acta">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '24px', overflowX: 'auto' }}>
        <div className="section-header" style={{ marginBottom: '18px' }}>
          <h2>Estadisticas individuales</h2>
          <small>
            Temporada actual: todo parte en 0
            {actas.length > 0 ? ` + ${actas.length} acta${actas.length > 1 ? 's' : ''} cargada${actas.length > 1 ? 's' : ''}` : ''}
          </small>
        </div>
        <table className="list-table" style={{ minWidth: '700px' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Posición</th>
              <th style={{ textAlign: 'center' }}>PJ</th>
              <th style={{ textAlign: 'center' }}>PT</th>
              <th style={{ textAlign: 'center' }}>Goles</th>
              <th style={{ textAlign: 'center' }}>Tarjetas</th>
              <th style={{ textAlign: 'center' }}>Min.</th>
            </tr>
          </thead>
          <tbody>
            {statsFinales.map((p) => (
              <tr key={p.id}>
                <td style={{ color: '#7f96bc', width: '40px' }}>{p.dorsal}</td>
                <td style={{ fontWeight: 600, color: '#fff' }}>{p.nombre}</td>
                <td>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, background: `${(posicionColor[p.posicion] || '#7f96bc')}22`, color: posicionColor[p.posicion] || '#7f96bc', border: `1px solid ${(posicionColor[p.posicion] || '#7f96bc')}55` }}>
                    {p.posicion}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>{p.pj}</td>
                <td style={{ textAlign: 'center', color: '#7f96bc' }}>{p.pt}</td>
                <td style={{ textAlign: 'center', color: p.goles > 0 ? '#90f4ae' : '#cdd4f1', fontWeight: p.goles > 0 ? 700 : 400 }}>{p.goles}</td>
                <td style={{ textAlign: 'center', color: p.tarjetas > 0 ? '#f4c842' : '#cdd4f1' }}>{p.tarjetas}</td>
                <td style={{ textAlign: 'center', color: '#7f96bc' }}>{p.minutos}'</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default Estadisticas;
