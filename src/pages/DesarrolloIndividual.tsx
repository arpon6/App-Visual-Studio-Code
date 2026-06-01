import { useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';
import { usePlantilla } from '../lib/usePlantilla';

interface VideoCorte {
  id: string;
  categoryId: string;
  label: string;
  start: number;
  end: number;
  createdAt: string;
  player_id?: string | null;
  player_ids?: string[] | null;
  source?: 'propio' | 'rival';
}

const TACTICAL_CATEGORIES = [
  { id: 'abp-ofensivo', label: 'ABP OFENSIVO' },
  { id: 'abp-defensivo', label: 'ABP DEFENSIVO' },
  { id: 'presion-alta', label: 'PRESIÓN ALTA' },
  { id: 'repliegue-total', label: 'REPLIEGUE TOTAL' },
  { id: 'repliegue-intermedio', label: 'REPLIEGUE INTERMEDIO' },
  { id: 'conquista-espalda-z3', label: 'CONQUISTA ESPALDA Z 3' },
  { id: 'ataque-area-estando', label: 'ATAQUE DE ÁREA ESTANDO' },
  { id: 'ataque-area-llegando', label: 'ATAQUE DE ÁREA LLEGANDO' },
  { id: 'defensa-area-estando', label: 'DEFENSA DE ÁREA ESTANDO' },
  { id: 'defensa-area-llegando', label: 'DEFENSA DE ÁREA LLEGANDO' },
  { id: 'reinicio-construccion-z12', label: 'REINICIO Y CONSTRUCCIÓN Z 1-2' },
  { id: 'progresion-exterior-z23', label: 'PROGRESIÓN JUEGO EXTERIOR Z 2-3' },
  { id: 'progresion-interior-z23', label: 'PROGRESIÓN JUEGO INTERIOR Z 2-3' },
  { id: 'conservar-tras-robo-z1', label: 'PRIORIZAR CONSERVAR TRAS ROBO Z 1' },
  { id: 'finalizar-tras-robo-z4', label: 'PRIORIZAR FINALIZAR TRAS ROBO Z 4' },
  { id: 'progresar-tras-robo-z23', label: 'PRIORIZAR PROGRESAR TRAS ROBO Z 2-3' },
  { id: 'recuperar-tras-perdida-z34', label: 'PRIORIZAR RECUPERAR TRAS PÉRDIDA Z 3-4' },
  { id: 'defender-espacio-z2', label: 'PRIORIZAR DEFENDER ESPACIO TRAS PÉRDIDA Z 2' },
  { id: 'defender-porteria-z1', label: 'PRIORIZAR DEFENDER PORTERÍA TRAS PÉRDIDA Z 1' },
];

const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${String(hrs)}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getCutPlayerIds = (cut: VideoCorte): string[] | null => {
  if (cut.player_ids && cut.player_ids.length > 0) return cut.player_ids;
  if (cut.player_id) return [cut.player_id];
  return null;
};

function DesarrolloIndividual() {
  const { user } = useAuth();
  const jugadores = usePlantilla();
  const [analysisCuts] = useSharedState<VideoCorte[]>('analisis_cuts', []);
  const [analysisCutsRival] = useSharedState<VideoCorte[]>('analisis_cuts_rival', []);

  const allCortes = useMemo(() => [
    ...(Array.isArray(analysisCuts) ? analysisCuts : []),
    ...(Array.isArray(analysisCutsRival) ? analysisCutsRival : []),
  ], [analysisCuts, analysisCutsRival]);

  const isVisibleCut = (cut: VideoCorte) => {
    const assigned = getCutPlayerIds(cut);
    if (!assigned) return true;
    return user?.player_id != null && assigned.includes(user.player_id);
  };

  const cortes = user?.role === 'jugador'
    ? allCortes.filter(isVisibleCut)
    : allCortes;

  const cortesByCategory = useMemo(() => {
    return TACTICAL_CATEGORIES.reduce<Record<string, VideoCorte[]>>((acc, category) => {
      acc[category.id] = cortes.filter((cut) => cut.categoryId === category.id);
      return acc;
    }, {});
  }, [cortes]);

  const getPlayerNames = (cut: VideoCorte) => {
    const ids = getCutPlayerIds(cut);
    if (!ids) return 'Toda la plantilla';
    return ids.map((id) => jugadores.find((j) => j.id === id)?.nombre || `Jugador ${id}`).join(', ');
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Seguimiento personal</small>
          <h1>Desarrollo Individual</h1>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div>
            <h2>Cortes de vídeo asignados</h2>
            {user?.role === 'jugador' && (
              <small style={{ color: '#7f96bc' }}>Mostrando solo tus cortes y los del equipo</small>
            )}
          </div>
          <span className="badge">{cortes.length} cortes</span>
        </div>

        {cortes.length === 0 ? (
          <p style={{ color: '#7f96bc', padding: '16px 0' }}>
            No hay cortes de vídeo asignados todavía.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {TACTICAL_CATEGORIES.map((category) => {
              const categoryCuts = cortesByCategory[category.id] || [];
              if (categoryCuts.length === 0) return null;
              return (
                <div key={category.id} style={{ background: '#0f172a', borderRadius: 12, padding: '1rem', display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <strong>{category.label}</strong>
                    <span className="badge">{categoryCuts.length}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {categoryCuts.map((corte) => (
                      <div key={corte.id} style={{ background: '#131b2f', borderRadius: 10, padding: '0.8rem', display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <strong>{corte.label}</strong>
                            <div style={{ color: '#7f96bc', fontSize: '0.9rem' }}>{formatDuration(corte.start)} → {formatDuration(corte.end)}</div>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{corte.source === 'rival' ? 'Vídeo rival' : 'Vídeo propio'}</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, color: '#cbd5e1', fontSize: '0.85rem' }}>
                          <span>{getPlayerNames(corte)}</span>
                          <span>{new Date(corte.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default DesarrolloIndividual;
