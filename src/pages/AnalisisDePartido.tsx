import { useState } from 'react';

type TacticalCut = {
  title: string;
  saved: number;
  description: string;
};

type PreviousMatch = {
  opponent: string;
  result: string;
  date: string;
  status: string;
  score: string;
  videoUrl: string;
};

const tacticalCuts: TacticalCut[] = [
  { title: 'ABP OFENSIVO', saved: 2, description: 'Cortes ofensivos y progresiones en campo contrario que generaron superioridad numérica.' },
  { title: 'ABP DEFENSIVO', saved: 1, description: 'Cortes defensivos claves para recuperar balón en zona de riesgo.' },
  { title: 'PRESIÓN ALTA', saved: 0, description: 'Presión alta mantenida en la salida del rival para forzar errores.' },
  { title: 'REPLIEGUE TOTAL', saved: 0, description: 'Compactación defensiva tras pérdida y control del espacio propio.' },
  { title: 'CONQUISTA ESPALDA Z-3', saved: 0, description: 'Recuperaciones en zona 3 con transición rápida al contraataque.' },
];

const previousMatches: PreviousMatch[] = [
  {
    opponent: 'VS UD LOGROÑÉS B',
    result: '4-0',
    date: '2024-04-14',
    status: 'Finalizado',
    score: '4-0',
    videoUrl: 'https://www.youtube.com/embed/fVm28-cNLM0',
  },
  {
    opponent: 'VS CLUB RIVERO',
    result: '2-1',
    date: '2024-04-08',
    status: 'Finalizado',
    score: '2-1',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
];

function AnalisisDePartido() {
  const [activeCutIndex, setActiveCutIndex] = useState<number | null>(0);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const selectedMatch = previousMatches[selectedMatchIndex];

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Revisa el rendimiento</small>
          <h1>Análisis de Partido</h1>
        </div>
      </div>

      <div className="grid-3 analysis-stats">
        <div className="widget-box">
          <h2>Posesión</h2>
          <p>58%</p>
        </div>
        <div className="widget-box">
          <h2>Tiros</h2>
          <p>14</p>
        </div>
        <div className="widget-box">
          <h2>Entradas</h2>
          <p>26</p>
        </div>
      </div>

      <div className="card analysis-card">
        <div className="section-header">
          <div>
            <h2>Cortes</h2>
            <small>Revisa los registros tácticos guardados en el último encuentro</small>
          </div>
          <span className="badge">{tacticalCuts.length} cortes</span>
        </div>

        <div className="accordion-list">
          {tacticalCuts.map((cut, index) => (
            <div className={`accordion-item ${activeCutIndex === index ? 'open' : ''}`} key={cut.title}>
              <button type="button" className="accordion-button" onClick={() => setActiveCutIndex(activeCutIndex === index ? null : index)}>
                <div>
                  <strong>{cut.title}</strong>
                  <small>{cut.saved} cortes guardados</small>
                </div>
                <span>{activeCutIndex === index ? '−' : '+'}</span>
              </button>

              <div className="accordion-content">
                <p>{cut.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card video-card">
          <div className="section-header">
            <div>
              <h2>Partido completo</h2>
              <small>Vídeo íntegro del encuentro seleccionado</small>
            </div>
          </div>

          <div className="video-wrapper">
            <iframe
              title="Partido completo"
              src={selectedMatch.videoUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          <div className="match-summary">
            <div>
              <strong>{selectedMatch.opponent}</strong>
              <p>{selectedMatch.status} · {selectedMatch.date}</p>
            </div>
            <div className="match-score">{selectedMatch.score}</div>
          </div>
        </div>

        <div className="card previous-matches-card">
          <div className="section-header">
            <div>
              <h2>Partidos anteriores</h2>
              <small>Selecciona un partido para ver el análisis</small>
            </div>
          </div>

          <div className="match-list">
            {previousMatches.map((match, index) => (
              <button
                key={match.opponent}
                type="button"
                className={`match-list-item ${selectedMatchIndex === index ? 'active' : ''}`}
                onClick={() => setSelectedMatchIndex(index)}
              >
                <div>
                  <span>{match.status}</span>
                  <strong>{match.opponent}</strong>
                  <small>{match.date}</small>
                </div>
                <div className="match-score">{match.score}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AnalisisDePartido;
