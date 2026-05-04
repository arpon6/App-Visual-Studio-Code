import { useEffect, useState } from 'react';

type AnalysisCut = {
  id: string;
  label: string;
  start: number;
  end: number;
  createdAt: string;
};

type AnalysisCutsMap = Record<string, AnalysisCut[]>;

type PreviousMatch = {
  opponent: string;
  result: string;
  date: string;
  status: string;
  score: string;
  videoUrl: string;
};

const TACTICAL_TITLES = [
  'ABP OFENSIVO', 'ABP DEFENSIVO', 'PRESIÓN ALTA', 'REPLIEGUE TOTAL',
  'REPLIEGUE INTERMEDIO', 'CONQUISTA ESPALDA Z 3', 'ATAQUE DE ÁREA ESTANDO',
  'ATAQUE DE ÁREA LLEGANDO', 'DEFENSA DE ÁREA ESTANDO', 'DEFENSA DE ÁREA LLEGANDO',
  'REINICIO Y CONSTRUCCIÓN Z 1-2', 'PROGRESIÓN JUEGO EXTERIOR Z 2-3',
  'PROGRESIÓN JUEGO INTERIOR Z 2-3', 'PRIORIZAR CONSERVAR TRAS ROBO Z 1',
  'PRIORIZAR FINALIZAR TRAS ROBO Z 4', 'PRIORIZAR PROGRESAR TRAS ROBO Z 2-3',
  'PRIORIZAR RECUPERAR TRAS PÉRDIDA Z 3-4', 'PRIORIZAR DEFENDER ESPACIO TRAS PÉRDIDA Z 2',
  'PRIORIZAR DEFENDER PORTERÍA TRAS PÉRDIDA Z 1',
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
  const [analysisCuts, setAnalysisCuts] = useState<AnalysisCutsMap>(() => {
    try { return JSON.parse(localStorage.getItem('analisis_cuts') || '{}'); }
    catch { return {}; }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'analisis_cuts') {
        try { setAnalysisCuts(JSON.parse(e.newValue || '{}')); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [matches, setMatches] = useState<PreviousMatch[]>(() => {
    try { return JSON.parse(localStorage.getItem('analisis_matches') || 'null') ?? previousMatches; }
    catch { return previousMatches; }
  });
  const [mainVideoUrl, setMainVideoUrl] = useState(() => localStorage.getItem('analisis_main_video') ?? '');
  const [mainOpponent, setMainOpponent] = useState(() => localStorage.getItem('analisis_main_opponent') ?? '');

  const sendToArchive = () => {
    if (!mainVideoUrl || !mainOpponent) return;
    const newMatch: PreviousMatch = {
      opponent: mainOpponent.toUpperCase(),
      result: '',
      date: new Date().toISOString().split('T')[0],
      status: 'Finalizado',
      score: '',
      videoUrl: toEmbedUrl(mainVideoUrl),
    };
    const updated = [newMatch, ...matches];
    setMatches(updated);
    localStorage.setItem('analisis_matches', JSON.stringify(updated));
    setMainVideoUrl('');
    setMainOpponent('');
    localStorage.removeItem('analisis_main_video');
    localStorage.removeItem('analisis_main_opponent');
  };

  const toEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
  };

  const getYouTubeId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return match ? match[1] : null;
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Revisa el rendimiento</small>
          <h1>Análisis de Partido</h1>
        </div>
      </div>

      <div className="card video-card" style={{ marginBottom: '1.5rem' }}>
        <div className="section-header">
          <h2>Partido Completo</h2>
        </div>
        <input
          type="text"
          placeholder="Rival (ej: VS UD LOGROÑÉS B)..."
          value={mainOpponent}
          onChange={e => { setMainOpponent(e.target.value); localStorage.setItem('analisis_main_opponent', e.target.value); }}
          style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#1a1a2e', color: '#fff' }}
        />
        <input
          type="text"
          placeholder="Pega aquí la URL de YouTube..."
          value={mainVideoUrl}
          onChange={e => { setMainVideoUrl(e.target.value); localStorage.setItem('analisis_main_video', e.target.value); }}
          style={{ width: '100%', marginBottom: '0.75rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#1a1a2e', color: '#fff' }}
        />
        {mainVideoUrl && (
          <div className="video-wrapper">
            <iframe
              title="Partido completo"
              src={toEmbedUrl(mainVideoUrl)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        <button
          type="button"
          onClick={sendToArchive}
          disabled={!mainVideoUrl || !mainOpponent}
          style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', background: mainVideoUrl && mainOpponent ? '#3b82f6' : '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: mainVideoUrl && mainOpponent ? 'pointer' : 'not-allowed', fontWeight: 600 }}
        >
          Enviar a partidos anteriores
        </button>
      </div>

      <div className="card analysis-card">
        <div className="section-header">
          <div>
            <h2>Cortes</h2>
            <small>Revisa los registros tácticos guardados en el último encuentro</small>
          </div>
          <span className="badge">{TACTICAL_TITLES.reduce((acc, t) => acc + (analysisCuts[t]?.length ?? 0), 0)} cortes</span>
        </div>

        <div className="accordion-list">
          {TACTICAL_TITLES.map((title, index) => {
            const cuts = analysisCuts[title] ?? [];
            return (
            <div className={`accordion-item ${activeCutIndex === index ? 'open' : ''}`} key={title}>
              <button type="button" className="accordion-button" onClick={() => setActiveCutIndex(activeCutIndex === index ? null : index)}>
                <div>
                  <strong>{title}</strong>
                  <small>{cuts.length} cortes guardados</small>
                </div>
                <span>{activeCutIndex === index ? '−' : '+'}</span>
              </button>
              {activeCutIndex === index && cuts.length > 0 && (
                <div style={{ padding: '0.75rem 1rem', display: 'grid', gap: '0.5rem' }}>
                  {cuts.map((cut) => (
                    <div key={cut.id} style={{ background: '#1a1a2e', borderRadius: '8px', padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span>{cut.label}</span>
                      <span style={{ color: '#7f96bc' }}>{cut.start}s → {cut.end}s</span>
                    </div>
                  ))}
                </div>
              )}
              {activeCutIndex === index && cuts.length === 0 && (
                <p style={{ padding: '0.5rem 1rem', color: '#7f96bc', fontSize: '0.85rem' }}>Sin cortes guardados.</p>
              )}
            </div>
            );
          })}
        </div>
      </div>

      <div className="card previous-matches-card">
          <div className="section-header">
            <div>
              <h2>Partidos anteriores</h2>
              <small>Selecciona un partido para ver el análisis</small>
            </div>
          </div>

          <div className="match-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {matches.map((match, index) => (
              <div key={index} style={{ background: '#1a1a2e', borderRadius: '8px', padding: '0.5rem' }}>
                <button
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
                <input
                  type="text"
                  placeholder="Nombre del rival..."
                  value={match.opponent}
                  onChange={e => {
                    const updated = [...matches];
                    updated[index] = { ...updated[index], opponent: e.target.value };
                    setMatches(updated);
                    localStorage.setItem('analisis_matches', JSON.stringify(updated));
                  }}
                  style={{ width: '100%', padding: '0.4rem 0.5rem', background: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', marginBottom: '0.25rem' }}
                />
                <input
                  type="text"
                  placeholder="URL YouTube del partido..."
                  value={match.videoUrl.includes('embed/') ? '' : match.videoUrl}
                  onChange={e => {
                    const updated = [...matches];
                    updated[index] = { ...updated[index], videoUrl: toEmbedUrl(e.target.value) };
                    setMatches(updated);
                    localStorage.setItem('analisis_matches', JSON.stringify(updated));
                  }}
                  style={{ width: '100%', padding: '0.4rem 0.5rem', background: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', marginBottom: '0.5rem' }}
                />
                {match.videoUrl && (() => {
                  const id = getYouTubeId(match.videoUrl);
                  return id ? (
                    <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noreferrer" style={{ display: 'block', position: 'relative', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                      <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt={match.opponent} style={{ width: '100%', display: 'block', borderRadius: '6px' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 48, height: 48, background: 'rgba(255,0,0,0.85)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ borderLeft: '18px solid #fff', borderTop: '11px solid transparent', borderBottom: '11px solid transparent', marginLeft: 5 }} />
                        </div>
                      </div>
                    </a>
                  ) : null;
                })()}
              </div>
            ))}
          </div>
      </div>
    </section>
  );
}

export default AnalisisDePartido;
