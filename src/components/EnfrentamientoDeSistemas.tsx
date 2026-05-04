import { useState, useEffect } from 'react';
import { FORMATIONS, STORAGE_KEY, FieldPlayer, Player } from './TacticalBoard';

// ── Tactical report engine ────────────────────────────────────────────────────

type Role = 'Portero' | 'Defensa' | 'Lateral' | 'Mediocentro' | 'Mediapunta' | 'Extremo' | 'Delantero';

interface SlotRole {
  slotId: number;
  role: Role;
}

// Assign a role to each slot based on formation and position
function getRoles(formation: string): SlotRole[] {
  const f = formation.replace('1-', '');
  const lines = f.split('-').map(Number);
  const roles: SlotRole[] = [{ slotId: 0, role: 'Portero' }];
  let slot = 1;
  lines.forEach((count, lineIdx) => {
    const total = lines.length;
    for (let i = 0; i < count; i++) {
      let role: Role;
      if (lineIdx === total - 1) role = 'Delantero';
      else if (lineIdx === 0) {
        role = count >= 5 ? (i === 0 || i === count - 1 ? 'Lateral' : 'Defensa') : (i === 0 || i === count - 1 ? 'Lateral' : 'Defensa');
      } else if (lineIdx === total - 2 && count <= 2) role = 'Mediapunta';
      else if (i === 0 || i === count - 1) role = 'Extremo';
      else role = 'Mediocentro';
      roles.push({ slotId: slot++, role });
    }
  });
  return roles;
}

interface MatchupAdvice {
  groupAdvice: string[];
  individualAdvice: Record<Role, string>;
}

const MATCHUP_DB: Record<string, Record<string, MatchupAdvice>> = {
  '4-4-2': {
    '4-3-3': {
      groupAdvice: [
        'El rival tiene superioridad numérica en el centro con 3 mediocampistas. Compacta el bloque medio y evita perder el balón en zonas centrales.',
        'Sus extremos son amenaza constante en transición. Los laterales deben estar atentos al repliegue.',
        'Aprovecha la superioridad en ataque (2 delanteros vs 4 defensas) con combinaciones rápidas entre los dos puntas.',
        'En fase defensiva, los dos medios interiores deben doblar sobre el pivote rival para neutralizar su salida de balón.',
      ],
      individualAdvice: {
        Portero: 'Sé el primer organizador del juego. Ante la presión alta del 4-3-3 rival, usa el juego largo cuando los centrales estén presionados.',
        Defensa: 'Mantén la línea alta para achicar espacios al delantero centro rival. Comunícate constantemente con el lateral para cubrir los desmarques en profundidad.',
        Lateral: 'Controla al extremo rival en tu banda. Cuando tengas el balón, sube con criterio pero asegúrate de tener cobertura antes de incorporarte.',
        Mediocentro: 'El rival tiene un pivote que distribuye. Presiona su recepción y evita que gire. Cuando tengamos el balón, busca el pase entre líneas hacia los delanteros.',
        Mediapunta: 'Ocupa los espacios entre el doble pivote rival. Eres el nexo entre el centro y los delanteros. Muévete para recibir de espaldas y girar.',
        Extremo: 'Fija al lateral rival y busca el uno contra uno. En fase defensiva, replégrate para ayudar a tu lateral ante el extremo contrario.',
        Delantero: 'Presiona al central que tiene el balón para forzar el juego largo. En ataque, busca la profundidad y el desmarque de ruptura entre los centrales rivales.',
      },
    },
    '4-2-3-1': {
      groupAdvice: [
        'El doble pivote rival bloquea el centro. Usa las bandas para progresar y busca centros al área.',
        'El mediapunta rival es el jugador más peligroso. Un mediocentro debe seguirle en todo momento.',
        'Con 2 delanteros podéis presionar el doble pivote rival en salida de balón.',
        'Aprovecha los espacios entre el mediapunta y los extremos rivales para filtrar pases entre líneas.',
      ],
      individualAdvice: {
        Portero: 'El rival juega con un solo delantero. Puedes arriesgar más en la salida de balón corta con los centrales.',
        Defensa: 'Vigila los desmarques del mediapunta rival que puede llegar desde segunda línea. No te adelantes en exceso.',
        Lateral: 'Los extremos del 4-2-3-1 son muy activos. Mantén posición defensiva y sube solo cuando tengas superioridad.',
        Mediocentro: 'Uno de los dos debe marcar al mediapunta rival. El otro cubre el espacio central. Rotad según la posición del balón.',
        Mediapunta: 'Busca los espacios entre el doble pivote y los extremos rivales. Eres clave para conectar con los delanteros.',
        Extremo: 'El lateral rival subirá menos por la presencia del extremo del 4-2-3-1. Aprovecha el espacio a tu espalda.',
        Delantero: 'Presiona a los dos pivotes rivales alternando con tu compañero. En ataque, busca la profundidad para estirar la defensa.',
      },
    },
    default: {
      groupAdvice: [
        'Mantén el bloque compacto en dos líneas de cuatro.',
        'Usa la amplitud de los extremos para estirar la defensa rival.',
        'Los dos delanteros deben presionar coordinadamente la salida de balón rival.',
        'En transición defensiva, los cuatro mediocampistas deben replegarse rápidamente.',
      ],
      individualAdvice: {
        Portero: 'Organiza la línea defensiva y sé el primer pase en la construcción desde atrás.',
        Defensa: 'Mantén la línea y comunícate con los laterales para evitar espacios entre líneas.',
        Lateral: 'Equilibra tu participación ofensiva con la responsabilidad defensiva en tu banda.',
        Mediocentro: 'Controla el ritmo del juego y protege la línea defensiva en las transiciones.',
        Mediapunta: 'Conecta el mediocampo con los delanteros buscando espacios entre líneas.',
        Extremo: 'Usa la amplitud para crear superioridades y generar centros al área.',
        Delantero: 'Presiona la salida de balón rival y busca la profundidad en ataque.',
      },
    },
  },
};

function getAdvice(myFormation: string, rivalFormation: string): MatchupAdvice {
  const myKey = myFormation.replace('1-', '');
  const rivalKey = rivalFormation.replace('1-', '');
  return (
    MATCHUP_DB[myKey]?.[rivalKey] ||
    MATCHUP_DB[myKey]?.['default'] || {
      groupAdvice: [
        `Con ${myFormation} vs ${rivalFormation}, busca superioridades en las bandas y compacta el centro.`,
        'Presiona la salida de balón rival en bloque medio-alto.',
        'En transición, prioriza la recuperación posicional antes de atacar.',
        'Aprovecha los espacios que deja el sistema rival en las transiciones defensivas.',
      ],
      individualAdvice: {
        Portero: 'Organiza la línea y sé el primer eslabón en la construcción desde atrás.',
        Defensa: 'Mantén la línea defensiva y anticipa los desmarques en profundidad.',
        Lateral: 'Equilibra tu participación ofensiva con la cobertura defensiva.',
        Mediocentro: 'Controla el juego y protege la línea defensiva.',
        Mediapunta: 'Busca espacios entre líneas para conectar con los delanteros.',
        Extremo: 'Usa la amplitud y el uno contra uno para generar peligro.',
        Delantero: 'Presiona la salida rival y busca la profundidad.',
      },
    }
  );
}

// ── Dual field visualization ─────────────────────────────────────────────────

function DualField({ myFormation, myPlayers, rivalFormation }: {
  myFormation: string;
  myPlayers: FieldPlayer[];
  rivalFormation: string;
}) {
  const myPositions = FORMATIONS[myFormation]?.positions ?? [];
  const rivalPositions = FORMATIONS[rivalFormation]?.positions ?? [];

  // Rival positions are mirrored vertically (they attack from top)
  const rivalMirrored = rivalPositions.map(p => ({ x: p.x, y: 100 - p.y }));

  return (
    <div className="ef-field-wrap">
      <svg className="tb-field-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Campo completo — mismas referencias que alineación inicial */}
        <rect x="5" y="3" width="90" height="94" rx="1" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.3)" />
        <rect x="22" y="79" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
        <rect x="36" y="89" width="28" height="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <circle cx="50" cy="86" r="0.8" fill="rgba(255,255,255,0.25)" />
        <rect x="22" y="3" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
        <rect x="36" y="3" width="28" height="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <circle cx="50" cy="14" r="0.8" fill="rgba(255,255,255,0.25)" />

        {/* Jugadores rivales (rojo, espejados arriba) */}
        {rivalMirrored.map((pos, i) => (
          <g key={`r-${i}`}>
            <circle cx={pos.x} cy={pos.y} r="3.8"
              fill="rgba(255,80,80,0.2)" stroke="#ff5050" strokeWidth="0.7" />
            <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize="2.6" fill="#ffaaaa" fontWeight="bold">{i + 1}</text>
          </g>
        ))}

        {/* Jugadores propios (azul/dorado, posiciones reales de la alineación) */}
        {myPlayers.map((fp) => {
          const pos = myPositions[fp.slotId];
          if (!pos) return null;
          const hasPlayer = fp.player != null;
          const label = hasPlayer ? String(fp.player!.number) : '+';
          const isGk = fp.slotId === 0;
          return (
            <g key={`m-${fp.slotId}`}>
              <circle
                cx={fp.x} cy={fp.y} r="3.8"
                fill={isGk ? 'rgba(255,171,0,0.25)' : 'rgba(61,153,255,0.25)'}
                stroke={isGk ? '#ffab00' : '#3d99ff'}
                strokeWidth="0.7"
              />
              <text x={fp.x} y={fp.y + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize="2.6" fill={isGk ? '#ffdb9a' : '#a8d4ff'} fontWeight="bold">
                {label}
              </text>
              {hasPlayer && (
                <text x={fp.x} y={fp.y + 6} textAnchor="middle"
                  fontSize="2" fill="rgba(200,220,255,0.8)">
                  {fp.player!.name.split(' ')[0].slice(0, 8)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="ef-field-legend">
        <span className="ef-legend-item ef-legend-my">● Mi equipo</span>
        <span className="ef-legend-item ef-legend-rival">● Rival</span>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const RIVAL_STORAGE_KEY = 'enfrentamiento_rival_formation';

export default function EnfrentamientoDeSistemas() {
  const [myFormation, setMyFormation] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).formation || '1-4-4-2';
    } catch { /* ignorar */ }
    return '1-4-4-2';
  });
  const [myPlayers, setMyPlayers] = useState<FieldPlayer[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).fieldPlayers || [];
    } catch { /* ignorar */ }
    return [];
  });
  const [rivalFormation, setRivalFormation] = useState(
    () => localStorage.getItem(RIVAL_STORAGE_KEY) || '1-4-3-3'
  );

  // Refrescar si cambia la alineación en otra parte de la app (mismo tab)
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.formation) setMyFormation(parsed.formation);
        if (parsed.fieldPlayers) setMyPlayers(parsed.fieldPlayers);
      } catch { /* ignorar */ }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleRivalChange = (f: string) => {
    setRivalFormation(f);
    localStorage.setItem(RIVAL_STORAGE_KEY, f);
  };

  const advice = getAdvice(myFormation, rivalFormation);
  const roles = getRoles(myFormation);

  // Jugadores con nombre asignado
  const assignedPlayers = myPlayers
    .filter(fp => fp.player !== null)
    .map(fp => ({
      player: fp.player as Player,
      role: roles.find(r => r.slotId === fp.slotId)?.role ?? 'Mediocentro',
    }));

  return (
    <div className="card plan-card">
      <div className="section-header card-header-row">
        <div>
          <h2>Enfrentamiento de sistemas</h2>
          <small>Análisis táctico predictivo vs oponente</small>
        </div>
        <div className="ef-badges">
          <span className="data-pill"><strong>{myFormation}</strong> Mi sistema</span>
          <span style={{ color: '#a1b0d6', fontSize: '1.1rem' }}>vs</span>
          <span className="data-pill"><strong>{rivalFormation}</strong> Sistema rival</span>
        </div>
      </div>

      {/* Selector formación rival */}
      <div className="ef-rival-selector">
        <span className="ef-label">Sistema rival previsto:</span>
        <div className="tb-formation-bar">
          {Object.keys(FORMATIONS).map(key => (
            <button
              key={key}
              className={`tb-formation-btn${rivalFormation === key ? ' active' : ''}`}
              onClick={() => handleRivalChange(key)}
            >
              {FORMATIONS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Pizarra dual */}
      <DualField myFormation={myFormation} myPlayers={myPlayers} rivalFormation={rivalFormation} />

      {/* Informe grupal */}
      <div className="ef-section">
        <div className="ef-section-title">📋 Aspectos tácticos grupales</div>
        <ul className="ef-advice-list">
          {advice.groupAdvice.map((tip, i) => (
            <li key={i} className="ef-advice-item">
              <span className="ef-advice-dot" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* Instrucciones individuales */}
      <div className="ef-section">
        <div className="ef-section-title">👤 Instrucciones individuales</div>
        {assignedPlayers.length === 0 ? (
          <p className="ef-empty">Asigna jugadores en la alineación inicial para ver instrucciones individuales.</p>
        ) : (
          <div className="ef-players-grid">
            {assignedPlayers.map(({ player, role }) => (
              <div key={player.id} className="ef-player-card">
                <div className="ef-player-header">
                  <span className="ef-player-num">{player.number}</span>
                  <div>
                    <div className="ef-player-name">{player.name}</div>
                    <div className="ef-player-role">{role}</div>
                  </div>
                </div>
                <p className="ef-player-advice">{advice.individualAdvice[role]}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
