import { useMemo, useState, useEffect, useRef, ChangeEvent } from 'react';
import { useAuth, UserRole } from '../lib/AuthContext';
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
  senderId?: string;
  senderName: string;
  senderRole?: UserRole;
  text: string;
  recipients: string[];
  relatedCutId: string;
  sent?: boolean;
  createdAt: string;
}

interface AppUserInfo {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  player_id: string | null;
}

type MatchInfo = { id: string; name: string; createdAt: string };

const MATCHES_KEY = 'cortador_propio_matches';

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

const STAFF_MESSAGE_ROLES: UserRole[] = ['entrenador', 'SUPER_ADMIN'];

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
  const [matches] = useSharedState<MatchInfo[]>(MATCHES_KEY, []);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('all');
  const [matchCutsMap, setMatchCutsMap] = useState<Record<string, VideoCorte[]>>({});
  const [matchVideoMap, setMatchVideoMap] = useState<Record<string, string>>({});
  const [analysisCutsRival] = useSharedState<VideoCorte[]>('analisis_cuts_rival', []);
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [analysisChat, setAnalysisChat] = useSharedState<ChatMessage[]>('analisis_chat', []);
  const [cutMessageText, setCutMessageText] = useState('');
  const [playTokens, setPlayTokens] = useState<Record<string, number>>({});
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const loadCutsByMatch = async () => {
      const [{ data: cutRows }, { data: videoRows }] = await Promise.all([
        supabase.from('shared_state').select('key, value').like('key', 'analisis_cuts%'),
        supabase.from('shared_state').select('key, value').like('key', 'analisis_main_video%'),
      ]);

      const cutsMap: Record<string, VideoCorte[]> = {};
      (cutRows || []).forEach((row) => {
        if (row.key === 'analisis_cuts') {
          cutsMap.general = Array.isArray(row.value) ? row.value as VideoCorte[] : [];
        } else if (row.key.startsWith('analisis_cuts_match_')) {
          const matchId = row.key.slice('analisis_cuts_match_'.length);
          cutsMap[matchId] = Array.isArray(row.value) ? row.value as VideoCorte[] : [];
        }
      });

      const videoMap: Record<string, string> = {};
      (videoRows || []).forEach((row) => {
        if (row.key === 'analisis_main_video') {
          videoMap.general = typeof row.value === 'string' ? row.value : '';
        } else if (row.key.startsWith('analisis_main_video_match_')) {
          const matchId = row.key.slice('analisis_main_video_match_'.length);
          videoMap[matchId] = typeof row.value === 'string' ? row.value : '';
        }
      });

      setMatchCutsMap(cutsMap);
      setMatchVideoMap(videoMap);
    };

    loadCutsByMatch();
  }, []);

  const activeVideoUrl = selectedMatchId === 'all' ? (matchVideoMap.general || '') : (matchVideoMap[selectedMatchId] || '');

  const allCortes = useMemo(() => {
    const scoped = selectedMatchId === 'all'
      ? Object.values(matchCutsMap).flat()
      : (matchCutsMap[selectedMatchId] || []);
    const rival = selectedMatchId === 'all' ? (Array.isArray(analysisCutsRival) ? analysisCutsRival : []) : [];
    return [...scoped, ...rival];
  }, [matchCutsMap, selectedMatchId, analysisCutsRival]);

  const visibleCortes = useMemo(() => {
    if (!user) return [];
    if (user.role === 'jugador' && user.player_id) {
      const playerId = String(user.player_id);
      return allCortes.filter((cut) => {
        const ids = getCutPlayerIds(cut);
        return ids?.includes(playerId);
      });
    }
    if (user.role === 'entrenador') {
      return allCortes.filter((cut) => {
        const ids = getCutPlayerIds(cut);
        return !!ids?.length;
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

  const [users, setUsers] = useState<AppUserInfo[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const sendingMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data } = await supabase
          .from('app_users')
          .select('id, email, username, role, player_id');
        if (data) setUsers(data as AppUserInfo[]);
      } catch (err) {
        console.warn('Error loading app_users:', err);
      } finally {
        setUsersLoaded(true);
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
      const fromUsers = users.find((u) => String(u.player_id) === String(id));
      if (fromUsers) return fromUsers.username || `Jugador ${id}`;
      return `Jugador ${id}`;
    }).join(', ');
  };

  const staffAdmins = useMemo(() => {
    return users.filter((u) => STAFF_MESSAGE_ROLES.includes(u.role));
  }, [users]);

  const canUseDevelopmentMessaging = useMemo(() => {
    if (!user) return false;
    if (user.role === 'jugador') return true;
    return STAFF_MESSAGE_ROLES.includes(user.role);
  }, [user]);

  const toEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
  };

  const getCutEmbedUrl = (cut: VideoCorte, autoplay: boolean) => {
    const embed = activeVideoUrl ? toEmbedUrl(activeVideoUrl) : undefined;
    if (!embed) return undefined;
    return `${embed}?start=${Math.floor(cut.start)}&end=${Math.floor(cut.end)}&rel=0&autoplay=${autoplay ? 1 : 0}`;
  };

  const getYouTubeWatchUrl = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : url;
  };

  const getMp4MimeType = () => {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
  };

  const captureSegmentToMp4 = async (start: number, end: number): Promise<Blob> => {
    if (!localVideoRef.current) throw new Error('Carga un vídeo local para exportar el corte.');
    const video = localVideoRef.current;
    const mimeType = getMp4MimeType();
    if (!mimeType) throw new Error('Tu navegador no soporta grabación MP4.');

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      try {
        video.currentTime = start;
      } catch (error) {
        video.removeEventListener('seeked', onSeeked);
        reject(error);
      }
    });

    const previousMuted = video.muted;
    video.muted = true;
    const stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const stopPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = (event) => reject(event.error || new Error('Error al grabar el vídeo.'));
    });

    recorder.start(200);
    await video.play().catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, Math.max(300, (end - start) * 1000 + 400)));
    video.pause();
    video.muted = previousMuted;
    recorder.stop();

    return stopPromise;
  };

  const downloadVideoBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadCut = async (cut: VideoCorte) => {
    if (!localVideoSrc) {
      alert('Carga un vídeo local para exportar cortes en MP4.');
      return;
    }
    setExporting(true);
    try {
      const blob = await captureSegmentToMp4(cut.start, cut.end);
      downloadVideoBlob(`corte-${cut.id}.mp4`, blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error exportando el corte en MP4.';
      alert(message);
    } finally {
      setExporting(false);
    }
  };

  const downloadAllCuts = async () => {
    if (!localVideoSrc) {
      alert('Carga un vídeo local para exportar los cortes en MP4.');
      return;
    }
    if (visibleCortes.length === 0) {
      alert('No hay cortes para descargar.');
      return;
    }
    setExporting(true);
    try {
      for (const cut of visibleCortes) {
        const blob = await captureSegmentToMp4(cut.start, cut.end);
        downloadVideoBlob(`corte-${cut.id}.mp4`, blob);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error exportando los cortes en MP4.';
      alert(message);
    } finally {
      setExporting(false);
    }
  };

  const handleLocalVideoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (localVideoSrc) URL.revokeObjectURL(localVideoSrc);
    const src = URL.createObjectURL(file);
    setLocalVideoFile(file);
    setLocalVideoSrc(src);
  };

  useEffect(() => {
    return () => {
      if (localVideoSrc) URL.revokeObjectURL(localVideoSrc);
    };
  }, [localVideoSrc]);

  const visibleChatMessages = useMemo(() => {
    if (!user) return [];
    if (!canUseDevelopmentMessaging) return [];
    if (user.role === 'jugador' && user.player_id) {
      return analysisChat.filter((message) => {
        if (message.recipients.includes('all_players')) return true;
        return message.recipients.includes(`player:${user.player_id}`);
      });
    }
    return analysisChat;
  }, [analysisChat, canUseDevelopmentMessaging, user]);

  const sendCutMessageFor = (cutId: string, cut: VideoCorte) => {
    if (!user || !canUseDevelopmentMessaging || !cutMessageText.trim()) return;
    const recipients = getCutPlayerIds(cut)?.length
      ? ['staff_admin', ...getCutPlayerIds(cut)!.map((id) => `player:${id}`)]
      : ['staff_admin', 'all_players'];
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${cutId}`,
      senderId: user.id,
      senderName: user.username || 'Usuario',
      senderRole: user.role,
      text: cutMessageText.trim(),
      recipients,
      relatedCutId: cutId,
      sent: false,
      createdAt: new Date().toISOString(),
    };
    setAnalysisChat([newMessage, ...analysisChat]);
    setCutMessageText('');
  };

  const canDeleteMessage = (message: ChatMessage) => {
    if (!user) return false;
    if (STAFF_MESSAGE_ROLES.includes(user.role)) return true;
    return message.senderId === user.id;
  };

  const deleteMessage = (messageId: string) => {
    const confirmed = window.confirm('¿Seguro que quieres eliminar este mensaje?');
    if (!confirmed) return;
    setAnalysisChat((prev) => prev.filter((message) => message.id !== messageId));
  };

  const getMessageRecipientsEmails = (message: ChatMessage) => {
    const recipients = new Set<string>();

    if (message.recipients.includes('staff_admin')) {
      staffAdmins.forEach((u) => {
        if (u.email) recipients.add(u.email);
      });
    }

    if (message.recipients.includes('all_players')) {
      let playerIds: string[] | null = null;
      if (message.relatedCutId) {
        const relatedCut = allCortes.find((c) => c.id === message.relatedCutId);
        if (relatedCut) playerIds = getCutPlayerIds(relatedCut);
      }

      if (playerIds && playerIds.length > 0) {
        playerIds.forEach((playerId) => {
          const target = users.find((u) => String(u.player_id) === String(playerId));
          if (target?.email) recipients.add(target.email);
        });
      } else {
        users
          .filter((u) => u.role === 'jugador' && u.email)
          .forEach((u) => recipients.add(u.email));
      }
    }

    message.recipients
      .filter((r) => r.startsWith('player:'))
      .forEach((recipient) => {
        const playerId = recipient.replace('player:', '');
        const target = users.find((u) => String(u.player_id) === String(playerId));
        if (target?.email) recipients.add(target.email);
      });

    if (message.senderId) {
      const senderEmail = users.find((u) => u.id === message.senderId)?.email;
      if (senderEmail) recipients.delete(senderEmail);
    }

    return Array.from(recipients);
  };

  const sendBrevoEmailForMessage = async (message: ChatMessage): Promise<boolean> => {
    const recs = getMessageRecipientsEmails(message);
    if (recs.length === 0) {
      console.warn('No hay destinatarios con email para enviar este mensaje', {
        messageId: message.id,
        recipients: message.recipients,
        relatedCutId: message.relatedCutId,
      });
      return false;
    }

    try {
      const subject = message.relatedCutId
        ? `Nuevo mensaje en corte de ${message.senderName}`
        : `Nuevo mensaje interno de ${message.senderName}`;

      const response = await fetch('/api/send-brevo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recs,
          subject,
          htmlContent: `<p>${message.text.replace(/\n/g, '<br/>')}</p><p>Revisa la app para ver el mensaje completo.</p>`,
          textContent: message.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('Error enviando email Brevo:', response.status, body);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error enviando Brevo', error);
      return false;
    }
  };

  useEffect(() => {
    if (!usersLoaded) return;

    const processUnsentMessages = async () => {
      const unsent = analysisChat.filter((m) => !m.sent && !sendingMessageIdsRef.current.has(m.id));
      if (unsent.length === 0) return;

      for (const message of unsent) {
        sendingMessageIdsRef.current.add(message.id);
        try {
          const sent = await sendBrevoEmailForMessage(message);
          if (sent) {
            setAnalysisChat((prev) => prev.map((m) => (m.id === message.id ? { ...m, sent: true } : m)));
          }
        } finally {
          sendingMessageIdsRef.current.delete(message.id);
        }
      }
    };

    processUnsentMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisChat, users, staffAdmins, usersLoaded]);

  const cortesCount = visibleCortes.length;

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Desarrollo por jugador</small>
          <h1>Desarrollo Individual</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="section-header">
          <div>
            <h2>Vídeo local para MP4</h2>
            <small style={{ color: '#7f96bc' }}>Carga un vídeo local para exportar los cortes a MP4.</small>
          </div>
        </div>
        <input
          type="file"
          accept="video/*"
          onChange={handleLocalVideoFileChange}
          style={{ width: '100%', marginBottom: '0.75rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#1a1a2e', color: '#fff' }}
        />
        {localVideoSrc && (
          <video ref={localVideoRef} src={localVideoSrc} controls style={{ width: '100%', borderRadius: 10, background: '#000' }} />
        )}
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc' }}
            >
              <option value="all">Todos los partidos</option>
              <option value="general">General (sin partido)</option>
              {matches.map((match) => (
                <option key={match.id} value={match.id}>{match.name}</option>
              ))}
            </select>
            <button type="button" className="secondary-button" onClick={downloadAllCuts} disabled={exporting || !localVideoSrc || visibleCortes.length === 0}>
              Descargar todos
            </button>
            <span className="badge">{cortesCount} cortes</span>
          </div>
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
                      const playToken = playTokens[corte.id] || 0;
                      const embedUrl = getCutEmbedUrl(corte, playToken > 0);
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
                                key={`${corte.id}-${playToken}`}
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

                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={!embedUrl}
                              onClick={() => setPlayTokens((prev) => ({ ...prev, [corte.id]: (prev[corte.id] || 0) + 1 }))}
                            >
                              Reproducir corte
                            </button>
                            <button type="button" className="secondary-button" onClick={() => downloadCut(corte)} disabled={exporting || !localVideoSrc}>
                              Descargar MP4
                            </button>
                          </div>

                          <div style={{ display: 'grid', gap: 10 }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                              <label style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Mensajes del corte</label>
                              {!canUseDevelopmentMessaging ? (
                                <div style={{ color: '#94a3b8' }}>Este rol no recibe mensajes en Desarrollo Individual.</div>
                              ) : messages.length === 0 ? (
                                <div style={{ color: '#94a3b8' }}>No hay mensajes todavía.</div>
                              ) : (
                                <div style={{ display: 'grid', gap: 8 }}>
                                  {messages.map((message) => (
                                    <div key={message.id} style={{ background: '#0f172a', borderRadius: 10, padding: '0.8rem', display: 'grid', gap: 4 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                        <div style={{ fontSize: '0.85rem', color: '#e2e8f0' }}><strong>{message.senderName}</strong></div>
                                        {canDeleteMessage(message) && (
                                          <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => deleteMessage(message.id)}
                                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', background: '#7f1d1d', borderColor: '#b91c1c', color: '#fff' }}
                                          >
                                            Eliminar
                                          </button>
                                        )}
                                      </div>
                                      <div style={{ color: '#cbd5e1' }}>{message.text}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(message.createdAt).toLocaleString()}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {canUseDevelopmentMessaging && (
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
                            )}
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
