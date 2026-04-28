import { useState } from 'react';
import './PlanDePartido.css';

const formations = ['1-4-4-2', '1-4-3-3', '1-3-4-2', '1-5-2-1'];
const substitutes = [
  { number: 13, name: 'Rubén' },
  { number: 26, name: 'Darín' },
  { number: 14, name: 'Diego' },
  { number: 18, name: 'Guillermo' },
  { number: 19, name: 'David' },
  { number: 20, name: 'Samuel' },
  { number: 6, name: 'Sergio' },
];

function PlanDePartido() {
  const [formation, setFormation] = useState(formations[0]);
  const [opponentFormation, setOpponentFormation] = useState(formations[1]);

  return (
    <section className="page-section plan-page">
      <div className="page-title plan-title">
        <div>
          <small>Plan de Partido</small>
          <h1>Plan de Partido</h1>
        </div>
        <div className="title-actions">
          <button className="btn btn-primary">Exportar PDF</button>
        </div>
      </div>

      <div className="card plan-card plan-card--heading">
        <div className="section-header card-header-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className="section-badge section-badge--green">A</span>
              <div>
                <h2>Alineación inicial</h2>
                <small>Sistema y posicionamiento base</small>
              </div>
            </div>
          </div>
          <div className="tactical-controls">
            <div className="data-pill">
              <strong>{formation}</strong> Mi sistema
            </div>
            <div className="data-pill">
              <strong>{opponentFormation}</strong> Sistema rival
            </div>
            <select
              className="select-compact"
              value={formation}
              onChange={(event) => setFormation(event.target.value)}
            >
              {formations.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="lineup-board">
          <div className="lineup-schematic">
            <div className="lineup-row">
              <div className="player-node goalkeeper">1</div>
              <span className="player-node subtle">Adrián G.</span>
            </div>
            <div className="lineup-row">
              <div className="player-node">4</div>
              <div className="player-node">5</div>
              <div className="player-node">22</div>
            </div>
            <div className="lineup-row">
              <div className="player-node">21</div>
              <div className="player-node">11</div>
              <div className="player-node">5</div>
              <div className="player-node">2</div>
            </div>
            <div className="lineup-row">
              <div className="player-node">17</div>
              <div className="player-node">10</div>
            </div>
          </div>
        </div>
      </div>

      <div className="plan-grid plan-grid-2">
        <div className="card plan-card">
          <div className="section-header">
            <div>
              <span className="section-badge">B</span>
              <h2>Convocatoria y suplentes</h2>
              <small>Jugadores disponibles en el banquillo</small>
            </div>
          </div>
          <div className="plan-grid plan-grid-4" style={{ marginTop: 18 }}>
            {substitutes.map((player) => (
              <div key={player.number} className="substitute-card">
                <div className="substitute-number">{player.number}</div>
                <div className="substitute-name">{player.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card plan-card">
          <div className="section-header">
            <div>
              <span className="section-badge">C</span>
              <h2>ABP Ofensivo</h2>
              <small>Pizarras estratégicas de balón parado</small>
            </div>
            <button className="btn">+ Nueva pizarra</button>
          </div>
          <div className="tactical-board" style={{ minHeight: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <strong style={{ color: '#cdd4f1' }}>Córner punto penalti</strong>
              <div className="tactical-controls">
                <span className="status-pill status-pill--blue">Biblioteca</span>
                <span className="status-pill status-pill--yellow">Guardar</span>
                <span className="status-pill status-pill--red">Foco</span>
              </div>
            </div>
            <div className="lineup-schematic" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="player-node subtle">+</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card plan-card">
        <div className="section-header card-header-row">
          <div>
            <span className="section-badge">D</span>
            <h2>ABP Defensivo</h2>
            <small>Pizarras estratégicas de balón parado</small>
          </div>
          <button className="btn">+ Nueva pizarra</button>
        </div>
        <div className="tactical-board" style={{ minHeight: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <strong style={{ color: '#cdd4f1' }}>Marcaje hombre</strong>
            <div className="tactical-controls">
              <span className="status-pill status-pill--blue">Biblioteca</span>
              <span className="status-pill status-pill--yellow">Flecha</span>
              <span className="status-pill status-pill--red">Jugador</span>
            </div>
          </div>
          <div className="lineup-schematic" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="player-node subtle">+</div>
            ))}
          </div>
        </div>
      </div>

      <div className="card plan-card">
        <div className="section-header card-header-row">
          <div>
            <h2>Enfrentamiento de sistemas</h2>
            <small>Análisis predictivo vs oponente</small>
          </div>
          <div className="data-pill">
            <strong>{formation}</strong> vs <strong>{opponentFormation}</strong>
          </div>
        </div>
        <div className="plan-grid plan-grid-2" style={{ marginTop: 18 }}>
          <div className="system-board">
            <strong style={{ color: '#cdd4f1', marginBottom: 14, display: 'block' }}>Mi sistema</strong>
            <div className="lineup-schematic" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
              {Array.from({ length: 11 }).map((_, index) => (
                <div key={index} className="player-node subtle">•</div>
              ))}
            </div>
          </div>
          <div className="system-board">
            <strong style={{ color: '#cdd4f1', marginBottom: 14, display: 'block' }}>Informe general</strong>
            <div className="section-note">
              Enfoca la salida corta y mantén vigilancia preventiva en bandas largas a la espalda de la zaga. Usa la estructura 1-4-4-2 para dominar el medio campo y protege la línea defensiva ante transiciones rápidas.
            </div>
          </div>
        </div>
      </div>

      <div className="card plan-card">
        <div className="section-header">
          <div>
            <h2>Referencias tácticas</h2>
            <small>Notas estratégicas y material de vídeo</small>
          </div>
        </div>
        <div className="section-note" style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: '#90f4ae', marginBottom: 12 }}>Referencia en vídeo</p>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>https://youtube.com/watch?v=d7w5Hf9Gwdo</pre>
        </div>
        <div className="section-note" style={{ marginTop: 18 }}>
          "Cerrar directo en el que tres jugadores parten del punto de penalti y realizan un movimiento de arrastre hacia el primer palo (también están pendientes de si el centro se queda corto). Tras ello, en el segundo palo se produce un bloqueo de un jugador al defensor de su compañero para que realice una carrera semicircular hacia el punto de penalti y remate desde ahí. Después de realizar el bloqueo se ocupa la zona del segundo palo por si el remate queda largo."
        </div>
      </div>
    </section>
  );
}

export default PlanDePartido;
