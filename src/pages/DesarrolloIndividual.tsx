import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';
import { usePlantilla } from '../lib/usePlantilla';
import { supabase } from '../lib/supabaseClient';

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

interface ChatMessage {
  id: string;
  senderName: string;
  text: string;
  recipients: string[];
  relatedCutId: string;
  createdAt: string;
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
  const [mainVideoUrl] = useSharedState<string>('analisis_main_video', '');
  const [analysisChat, setAnalysisChat] = useSharedState<ChatMessage[]>('analisis_chat', []);
  const [cutMessageText, setCutMessageText] = useState('');

  const allCortes = useMemo(
    () => [
      ...(Array.isArray(analysisCuts) ? analysisCuts : []),
      ...(Array.isArray(analysisCutsRival) ? analysisCutsRival : []),
    ],
    [analysisCuts, analysisCutsRival],
  );

  const visibleCortes = useMemo(() => {
    if (!user) return [];
    if (user.role === 'jugador' && user.player_id) {
      const playerId = String(user.player_id);
      return allCortes.filter((cut) => {
        const ids = getCutPlayerIds(cut);
        return ids?.includes(playerId);
      });
    }
    return allCortes;
  }, [allCortes, user]);

  const cortesByCategory = useMemo(() => {
    return TACTICAL_CATEGORIES.reduce<Record<string, VideoCorte[]>>((acc, category) => {
      acc[category.id] = visibleCortes.filter((cut) => cut.categoryId === category.id);
      return acc;
    }, {});
  }, [visibleCortes]);

  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data } = await supabase
          .from('app_users')
          .select('id, email, username, role, player_id');
        if (data) setUsers(data as any[]);
      } catch (err) {
        console.warn('Error loading app_users:', err);
      }
    };
    loadUsers();
  }, []);

  const getPlayerNames = (cut: VideoCorte) => {
    const ids = getCutPlayerIds(cut);
    if (!ids) return 'Toda la plantilla';
    return ids.map((id) => {
      const pj = jugadores.find((j) => j.id === id);
      if (pj) return pj.nombre;
      const fromUsers = users.find((u: any) => String(u.player_id) === String(id));
      if (fromUsers) return fromUsers.username || `Jugador ${id}`;
      return `Jugador ${id}`;
    }).join(', ');
  };

  const toEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
  };

  const getCutEmbedUrl = (cut: VideoCorte) => {
    const embed = mainVideoUrl ? toEmbedUrl(mainVideoUrl) : undefined;
    if (!embed) return undefined;
    return `${embed}?start=${Math.floor(cut.start)}&end=${Math.floor(cut.end)}&rel=0&autoplay=0`;
  };

  const visibleChatMessages = useMemo(() => {
    if (!user) return [];
    if (user.role === 'jugador' && user.player_id) {
      return analysisChat.filter((message) => {
        if (message.recipients.includes('all_players')) return true;
        return message.recipients.includes(`player:${user.player_id}`);
      });
    }
    return analysisChat;
  }, [analysisChat, user]);

  const sendCutMessageFor = (cutId: string, cut: VideoCorte) => {
    if (!user || !cutMessageText.trim()) return;
    const recipients = getCutPlayerIds(cut)?.length
      ? ['staff_admin', ...getCutPlayerIds(cut)!.map((id) => `player:${id}`)]
      : ['staff_admin', 'all_players'];
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${cutId}`,
      senderName: user.username || 'Usuario',
      text: cutMessageText.trim(),
      recipients,
      relatedCutId: cutId,
      createdAt: new Date().toISOString(),
    };
    setAnalysisChat([newMessage, ...analysisChat]);
    setCutMessageText('');
  };

  const cortesCount = visibleCortes.length;

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Desarrollo por jugador</small>
          <h1>Desarrollo Individual</h1>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div>
            <h2>Cortes asignados</h2>
            <small style={{ color: '#7f96bc' }}>
              {user?.role === 'jugador'
                ? 'Solo los cortes asignados a tu número aparecen aquí.'
                : 'Aquí se muestran los cortes asignados a jugadores específicos.'}
            </small>
          </div>
          <span className="badge">{cortesCount} cortes</span>
        </div>

        {cortesCount === 0 ? (
          <p style={{ color: '#7f96bc', padding: '16px 0' }}>
            No hay cortes asignados para este jugador.
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

                  <div style={{ display: 'grid', gap: 12 }}>
                    {categoryCuts.map((corte) => {
                      const embedUrl = getCutEmbedUrl(corte);
                      const messages = visibleChatMessages.filter((msg) => msg.relatedCutId === corte.id);
                      return (
                        <div key={corte.id} style={{ background: '#131b2f', borderRadius: 10, padding: '1rem', display: 'grid', gap: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                              <strong>{corte.label}</strong>
                              <div style={{ color: '#7f96bc', fontSize: '0.9rem' }}>
                                {formatDuration(corte.start)} → {formatDuration(corte.end)}
                              </div>
                              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{getPlayerNames(corte)}</div>
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{corte.source === 'rival' ? 'Vídeo rival' : 'Vídeo propio'}</div>
                          </div>

                          {embedUrl ? (
                            <div style={{ borderRadius: 12, overflow: 'hidden', background: '#0b1220' }}>
                              <iframe
                                title={`Corte ${corte.id}`}
                                src={embedUrl}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ width: '100%', minHeight: 260, border: 'none' }}
                              />
                            </div>
                          ) : (
                            <div style={{ color: '#9ca3af' }}>No hay vídeo disponible para este corte.</div>
                          )}

                          <div style={{ display: 'grid', gap: 10 }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                              <label style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Mensajes del corte</label>
                              {messages.length === 0 ? (
                                <div style={{ color: '#94a3b8' }}>No hay mensajes todavía.</div>
                              ) : (
                                <div style={{ display: 'grid', gap: 8 }}>
                                  {messages.map((message) => (
                                    <div key={message.id} style={{ background: '#0f172a', borderRadius: 10, padding: '0.8rem', display: 'grid', gap: 4 }}>
                                      <div style={{ fontSize: '0.85rem', color: '#e2e8f0' }}><strong>{message.senderName}</strong></div>
                                      <div style={{ color: '#cbd5e1' }}>{message.text}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(message.createdAt).toLocaleString()}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'grid', gap: 8 }}>
                              <textarea
                                value={cutMessageText}
                                onChange={(e) => setCutMessageText(e.target.value)}
                                placeholder="Escribe un mensaje sobre este corte..."
                                rows={3}
                                style={{ width: '100%', minHeight: 90, background: '#020617', border: '1px solid #334155', borderRadius: 10, color: '#fff', padding: '0.9rem' }}
                              />
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => sendCutMessageFor(corte.id, corte)}
                                disabled={!cutMessageText.trim()}
                              >
                                Enviar mensaje
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
