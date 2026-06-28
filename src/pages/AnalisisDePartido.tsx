import { useEffect, useMemo, useRef, useState, ChangeEvent } from 'react';
import { useAuth, UserRole } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';
import { supabase } from '../lib/supabaseClient';
import { usePlantilla } from '../lib/usePlantilla';

type AnalysisCut = {
  id: string;
  categoryId: string;
  label: string;
  start: number;
  end: number;
  createdAt: string;
  player_id?: string | null;
  player_ids?: string[] | null;
};

type AnalysisCutsMap = Record<string, AnalysisCut[]>;

const getCutPlayerIds = (cut: AnalysisCut): string[] | null => {
  if (cut.player_ids && cut.player_ids.length > 0) return cut.player_ids;
  if (cut.player_id) return [cut.player_id];
  return null;
};

const getCutPlayerRecipientIds = (cut: AnalysisCut): string[] | null => {
  const ids = getCutPlayerIds(cut);
  return ids && ids.length > 0 ? ids : null;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  recipients: string[];
  relatedCutId?: string | null;
  sent?: boolean;
  createdAt: string;
};

type AppUserInfo = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  player_id: string | null;
};

type PreviousMatch = {
  opponent: string;
  result: string;
  date: string;
  status: string;
  score: string;
  videoUrl: string;
};

const TACTICAL_CATEGORIES: { id: string; label: string }[] = [
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
  const { user } = useAuth();
  const jugadores = usePlantilla();
  const getPlayerName = (playerId: string | null | undefined): string => {
    if (!playerId) return 'Sin asignar';
    const player = jugadores.find((j) => j.id === playerId);
    if (player) return player.nombre;
    const user = users.find((u) => u.player_id === playerId);
    return user?.username || `Jugador ${playerId}`;
  };
  const [users, setUsers] = useState<AppUserInfo[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const isReadOnly = user?.role === 'jugador';
  const [activeCutIndex, setActiveCutIndex] = useState<number | null>(0);
  const [analysisCutsRaw] = useSharedState<AnalysisCut[] | Record<string, AnalysisCut[]>>('analisis_cuts', []);
  const [chatMessages, setChatMessages] = useSharedState<ChatMessage[]>('analisis_chat', []);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [matches, setMatchesState] = useSharedState<PreviousMatch[]>('analisis_matches', previousMatches);
  const [mainVideoUrl, setMainVideoUrlState] = useSharedState<string>('analisis_main_video', '');
  const [mainOpponent, setMainOpponentState] = useSharedState<string>('analisis_main_opponent', '');
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [selectedPlayerRecipients, setSelectedPlayerRecipients] = useState<string[]>([]);
  const [brevoStatus, setBrevoStatus] = useState('');
  const [sendingBrevo, setSendingBrevo] = useState(false);
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);
  const [cutMessageText, setCutMessageText] = useState('');
  const [playingCut, setPlayingCut] = useState<AnalysisCut | null>(null);
  const [playingEmbedUrl, setPlayingEmbedUrl] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const sendingMessageIdsRef = useRef<Set<string>>(new Set());

  const setMatches = (val: PreviousMatch[]) => setMatchesState(val);
  const setMainVideoUrl = (val: string) => setMainVideoUrlState(val);
  const setMainOpponent = (val: string) => setMainOpponentState(val);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data } = await supabase
          .from('app_users')
          .select('id, email, username, role, player_id');
        if (data) setUsers(data as AppUserInfo[]);
      } finally {
        setUsersLoaded(true);
      }
    };

    loadUsers();
  }, []);

  const allCuts = useMemo<AnalysisCut[]>(() => {
    return Array.isArray(analysisCutsRaw)
      ? analysisCutsRaw
      : Object.values(analysisCutsRaw).flat();
  }, [analysisCutsRaw]);

  const visibleCuts = useMemo<AnalysisCut[]>(() => {
    return allCuts.filter((cut) => {
      const ids = getCutPlayerIds(cut);
      return !ids;
    });
  }, [allCuts]);

  const analysisCuts = useMemo<AnalysisCutsMap>(() => {
    return visibleCuts.reduce<AnalysisCutsMap>((map, cut) => {
      const key = TACTICAL_CATEGORIES.some((cat) => cat.id === cut.categoryId)
        ? cut.categoryId
        : 'otros';
      map[key] = [...(map[key] || []), cut];
      return map;
    }, {});
  }, [visibleCuts]);

  const involvedPlayerIds = useMemo(() => {
    return Array.from(new Set(allCuts
      .map((cut) => getCutPlayerIds(cut))
      .flat()
      .filter((id): id is string => !!id)));
  }, [allCuts]);

  const involvedPlayers = useMemo(() => {
    return involvedPlayerIds
      .map((playerId) => ({
        id: playerId,
        name: getPlayerName(playerId),
        email: users.find((u) => u.player_id === playerId)?.email || '',
      }))
      .filter((p) => p.email || true);
  }, [involvedPlayerIds, jugadores, users]);

  const staffAdmins = useMemo(() => {
    return users.filter((u) => u.role === 'cuerpo_tecnico' || u.role === 'SUPER_ADMIN');
  }, [users]);

  const visibleChatMessages = useMemo(() => {
    if (user?.role === 'cuerpo_tecnico' || user?.role === 'SUPER_ADMIN') {
      return chatMessages;
    }
    if (user?.role === 'jugador' && user.player_id) {
      return chatMessages.filter((message) =>
        message.recipients.includes(`player:${user.player_id}`) || message.recipients.includes('all_players')
      );
    }
    return [];
  }, [chatMessages, user]);

  const sendChatMessage = (relatedCutId?: string | null) => {
    const text = messageText.trim();
    if (!text || !user) return;

    const recipientIds = selectedPlayerRecipients.length > 0
      ? selectedPlayerRecipients
      : involvedPlayerIds.length > 0
        ? involvedPlayerIds
        : users.filter((u) => u.role === 'jugador' && u.player_id).map((u) => String(u.player_id));

    const recipients = ['staff_admin', ...recipientIds.map((id) => `player:${id}`)];

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: user.id,
      senderName: user.username,
      senderRole: user.role,
      text,
      recipients,
      relatedCutId: relatedCutId ?? undefined,
      sent: false,
      createdAt: new Date().toISOString(),
    };

    setChatMessages((prev) => [message, ...prev]);
    setMessageText('');
    setSelectedPlayerRecipients([]);
  };

  const canDeleteMessage = (message: ChatMessage) => {
    if (!user) return false;
    if (user.role === 'cuerpo_tecnico' || user.role === 'SUPER_ADMIN') return true;
    return message.senderId === user.id;
  };

  const deleteMessage = (messageId: string) => {
    const confirmed = window.confirm('¿Seguro que quieres eliminar este mensaje?');
    if (!confirmed) return;
    setChatMessages((prev) => prev.filter((message) => message.id !== messageId));
  };

    const sendCutMessageFor = (cutId: string, cutPlayerIds?: string[] | null) => {
      const text = cutMessageText.trim();
      if (!text || !user) return;

      const recipients = cutPlayerIds && cutPlayerIds.length > 0
        ? ['staff_admin', ...cutPlayerIds.map((id) => `player:${id}`)]
        : ['staff_admin', 'all_players'];

      const message: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: user.id,
        senderName: user.username,
        senderRole: user.role,
        text,
        recipients,
        relatedCutId: cutId,
        sent: false,
        createdAt: new Date().toISOString(),
      };

      setChatMessages((prev) => [message, ...prev]);
      setCutMessageText('');
      setOpenConversationId(cutId);
    };

  const sendBrevoEmailForMessage = async (m: ChatMessage): Promise<boolean> => {
    const recs = getMessageRecipientsEmails(m);
    if (recs.length === 0) {
      setBrevoStatus('No hay destinatarios con email para este mensaje.');
      console.warn('No hay destinatarios con email para enviar este mensaje', {
        messageId: m.id,
        recipients: m.recipients,
        relatedCutId: m.relatedCutId,
      });
      return false;
    }

    try {
      const subject = m.relatedCutId ? `Nuevo mensaje en corte de partido de ${m.senderName}` : `Nuevo mensaje interno de ${m.senderName}`;
      const response = await fetch('/api/send-brevo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recs,
          subject,
          htmlContent: `<p>${m.text.replace(/\n/g, '<br/>')}</p><p>Revisa la app para ver el mensaje completo.</p>`,
          textContent: m.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        setBrevoStatus(`Error enviando correo: ${response.status} ${body}`);
        console.error('Error enviando email Brevo:', response.status, body);
        return false;
      }

      return true;
    } catch (err) {
      setBrevoStatus(`Error enviando Brevo: ${err}`);
      console.error('Error enviando Brevo', err);
      return false;
    }
  };

  useEffect(() => {
    if (!usersLoaded) return;

    const processUnsentMessages = async () => {
      const unsent = chatMessages.filter((m) => !m.sent && !sendingMessageIdsRef.current.has(m.id));
      if (unsent.length === 0) return;

      for (const m of unsent) {
        sendingMessageIdsRef.current.add(m.id);
        try {
          const sent = await sendBrevoEmailForMessage(m);
          if (sent) {
            setChatMessages((prev) => prev.map((cm) => cm.id === m.id ? { ...cm, sent: true } : cm));
          }
        } finally {
          sendingMessageIdsRef.current.delete(m.id);
        }
      }
    };

    processUnsentMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, users, staffAdmins, usersLoaded]);

  // moved getPlayerName earlier to avoid temporal-dead-zone at runtime

  const sendBrevoNotification = async () => {
    const recipients = [
      ...new Set([
        ...staffAdmins.map((u) => u.email),
        ...involvedPlayers.map((p) => p.email).filter(Boolean),
      ]),
    ].filter(Boolean) as string[];

    if (recipients.length === 0) {
      setBrevoStatus('No hay destinatarios configurados para Brevo.');
      return;
    }

    setSendingBrevo(true);
    setBrevoStatus('Enviando notificación...');

    try {
      const messageText = visibleChatMessages.length > 0
        ? visibleChatMessages[0].text
        : 'Se ha publicado una nueva conversación en Desarrollo grupal.';

      const template = `Se ha generado una conversación en Desarrollo grupal. Revisa la app para ver los mensajes completos.\n\nMensaje principal:\n${messageText}`;

      const response = await fetch('/api/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipients,
          subject: 'Notificación interna de Desarrollo grupal',
          htmlContent: `<p>${template.replace(/\n/g, '<br/>')}</p>`,
          textContent: template,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        setBrevoStatus(`Error Brevo: ${response.status} ${body}`);
      } else {
        setBrevoStatus('Notificación enviada correctamente por Brevo.');
      }
    } catch (error) {
      setBrevoStatus(`Error enviando Brevo: ${error}`);
    } finally {
      setSendingBrevo(false);
    }
  };

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
    setMatchesState([newMatch, ...matches]);
    setMainVideoUrlState('');
    setMainOpponentState('');
  };

  const deleteArchivedMatch = (matchIndex: number) => {
    const matchToDelete = matches[matchIndex];
    if (!matchToDelete) return;

    const confirmed = window.confirm(`¿Seguro que quieres eliminar el partido ${matchToDelete.opponent}?`);
    if (!confirmed) return;

    const nextMatches = matches.filter((_, index) => index !== matchIndex);
    setMatches(nextMatches);
    setSelectedMatchIndex((currentIndex) => {
      if (nextMatches.length === 0) return 0;
      if (currentIndex === matchIndex) return Math.min(matchIndex, nextMatches.length - 1);
      if (currentIndex > matchIndex) return currentIndex - 1;
      return Math.min(currentIndex, nextMatches.length - 1);
    });
  };

  const toEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
  };

  const getYouTubeId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return match ? match[1] : null;
  };

  const formatDuration = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return [hrs, mins, secs]
      .map((value, index) => index === 0 ? String(value).padStart(2, '0') : String(value).padStart(2, '0'))
      .join(':');
  };

  const getCutEmbedUrl = (cut: AnalysisCut) => {
    const source = mainVideoUrl || matches[selectedMatchIndex]?.videoUrl || '';
    const embed = toEmbedUrl(source);
    if (!embed) return undefined;
    return `${embed}?start=${Math.floor(cut.start)}&end=${Math.floor(cut.end)}&rel=0&autoplay=0`;
  };

  const getYouTubeWatchUrl = (url: string) => {
    const id = getYouTubeId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
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

  const downloadCut = async (cut: AnalysisCut) => {
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
    if (visibleCuts.length === 0) {
      alert('No hay cortes para descargar.');
      return;
    }
    setExporting(true);
    try {
      for (const cut of visibleCuts) {
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
    setMainVideoUrl('');
  };

  useEffect(() => {
    return () => {
      if (localVideoSrc) URL.revokeObjectURL(localVideoSrc);
    };
  }, [localVideoSrc]);

  const getMessageRecipientsEmails = (message: ChatMessage) => {
    const recipients = new Set<string>();

    if (message.recipients.includes('staff_admin')) {
      staffAdmins.forEach((u) => { if (u.email) recipients.add(u.email); });
    }

    if (message.recipients.includes('all_players')) {
      let playerIds: string[] | null = null;
      if (message.relatedCutId) {
        const relatedCut = allCuts.find((c) => c.id === message.relatedCutId);
        if (relatedCut) playerIds = getCutPlayerIds(relatedCut);
      }
      if (playerIds && playerIds.length > 0) {
        playerIds.forEach((pId) => {
          const user = users.find((u) => u.player_id === pId && u.email);
          if (user) recipients.add(user.email);
        });
      } else {
        users.filter((u) => u.role === 'jugador' && u.email).forEach((u) => recipients.add(u.email));
      }
    }

    message.recipients.filter((r) => r.startsWith('player:')).forEach((r) => {
      const pid = r.replace('player:', '');
      const u = users.find((x) => String(x.player_id) === String(pid));
      if (u?.email) recipients.add(u.email);
    });

    const senderEmail = users.find((u) => u.id === message.senderId)?.email;
    if (senderEmail) recipients.delete(senderEmail);

    return Array.from(recipients);
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Revisa el rendimiento</small>
          <h1>Desarrollo grupal</h1>
        </div>
      </div>

      <div className="card video-card" style={{ marginBottom: '1.5rem' }}>
        <div className="section-header">
          <h2>Partido Completo</h2>
        </div>
        {!isReadOnly && (
          <>
            <input
              type="text"
              placeholder="Rival (ej: VS UD LOGROÑÉS B)..."
              value={mainOpponent}
              onChange={e => setMainOpponent(e.target.value)}
              style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#1a1a2e', color: '#fff' }}
            />
            <input
              type="text"
              placeholder="Pega aquí la URL de YouTube..."
              value={mainVideoUrl}
              onChange={e => setMainVideoUrl(e.target.value)}
              style={{ width: '100%', marginBottom: '0.75rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #444', background: '#1a1a2e', color: '#fff' }}
            />
            <input
              type="file"
              accept="video/*"
              onChange={handleLocalVideoFileChange}
              style={{ width: '100%', marginBottom: '0.75rem', padding: '0.4rem', borderRadius: '6px', border: '1px solid #444', background: '#1a1a2e', color: '#fff' }}
            />
          </>
        )}
        {localVideoSrc && (
          <div className="video-wrapper" style={{ marginBottom: '1rem' }}>
            <video ref={localVideoRef} src={localVideoSrc} controls style={{ width: '100%' }} />
          </div>
        )}
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
        {!isReadOnly && (
          <button
            type="button"
            onClick={sendToArchive}
            disabled={!mainVideoUrl || !mainOpponent}
            style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', background: mainVideoUrl && mainOpponent ? '#3b82f6' : '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: mainVideoUrl && mainOpponent ? 'pointer' : 'not-allowed', fontWeight: 600 }}
          >
            Enviar a partidos anteriores
          </button>
        )}
      </div>

      <div className="card analysis-card">
        <div className="section-header">
          <div>
            <h2>Cortes</h2>
            <small>Revisa los registros tácticos guardados en el último encuentro</small>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={downloadAllCuts}
              disabled={exporting || !localVideoSrc || visibleCuts.length === 0}
            >
              Descargar todos
            </button>
            <span className="badge">{TACTICAL_CATEGORIES.reduce((acc, cat) => acc + (analysisCuts[cat.id]?.length ?? 0), 0)} cortes</span>
          </div>
        </div>

        <div className="accordion-list">
          {TACTICAL_CATEGORIES.map((category, index) => {
            const cuts = analysisCuts[category.id] ?? [];
            return (
              <div className={`accordion-item ${activeCutIndex === index ? 'open' : ''}`} key={category.id}>
                <button type="button" className="accordion-button" onClick={() => setActiveCutIndex(activeCutIndex === index ? null : index)}>
                  <div>
                    <strong>{category.label}</strong>
                    <small>{cuts.length} cortes guardados</small>
                  </div>
                  <span>{activeCutIndex === index ? '−' : '+'}</span>
                </button>
                {activeCutIndex === index && cuts.length > 0 && (
                  <div style={{ padding: '0.75rem 1rem', display: 'grid', gap: '0.5rem' }}>
                    {cuts.map((cut) => {
                      const cutMessages = visibleChatMessages.filter((m) => m.relatedCutId === cut.id);
                      return (
                        <div key={cut.id} style={{ background: '#1a1a2e', borderRadius: '8px', padding: '0.5rem 0.75rem', display: 'grid', gap: '0.75rem', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                            <div>
                              <strong>{cut.label}</strong>
                              <div style={{ color: '#7f96bc', fontSize: '0.9rem' }}>{formatDuration(cut.start)} → {formatDuration(cut.end)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button type="button" className="secondary-button" onClick={() => {
                                const source = mainVideoUrl || (matches[selectedMatchIndex] && matches[selectedMatchIndex].videoUrl) || '';
                                const embed = toEmbedUrl(source);
                                if (!embed) { alert('No hay vídeo asociado a este análisis.'); return; }
                                const src = `${embed}?start=${Math.floor(cut.start)}&end=${Math.floor(cut.end)}&autoplay=1&rel=0`;
                                setPlayingEmbedUrl(src);
                                setPlayingCut(cut);
                              }}>
                                Reproducir corte
                              </button>
                              <button type="button" className="secondary-button" onClick={() => downloadCut(cut)} disabled={exporting || !localVideoSrc}>
                                Descargar MP4
                              </button>
                            </div>
                          </div>

                          {getCutEmbedUrl(cut) ? (
                            <div style={{ borderRadius: 10, overflow: 'hidden', background: '#0b1220' }}>
                              <iframe
                                title={`Corte directo ${cut.id}`}
                                src={getCutEmbedUrl(cut)}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ width: '100%', height: 260, border: 'none' }}
                              />
                            </div>
                          ) : (
                            <div style={{ color: '#9ca3af' }}>No hay vídeo completo asociado para reproducir este corte.</div>
                          )}

                          <div style={{ background: '#0b1220', padding: '0.75rem', borderRadius: '8px' }}>
                            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: '0.5rem' }}>
                              {cutMessages.length === 0 ? (
                                <small style={{ color: '#9ca3af' }}>No hay mensajes para este corte.</small>
                              ) : (
                                cutMessages.map((m) => (
                                  <div key={m.id} style={{ padding: '0.4rem', borderRadius: '6px', background: '#071025' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <strong style={{ color: '#f8fafc' }}>{m.senderName}</strong>
                                        {canDeleteMessage(m) && (
                                          <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => deleteMessage(m.id)}
                                            style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem', background: '#7f1d1d', borderColor: '#b91c1c', color: '#fff' }}
                                          >
                                            Eliminar
                                          </button>
                                        )}
                                      </div>
                                      <small style={{ color: '#9ca3af' }}>{new Date(m.createdAt).toLocaleString()}</small>
                                    </div>
                                    <div style={{ color: '#d1d5db', marginTop: 6 }}>{m.text}</div>
                                  </div>
                                ))
                              )}
                            </div>

                            <div style={{ marginTop: '0.75rem' }}>
                              <textarea value={cutMessageText} onChange={(e) => setCutMessageText(e.target.value)} placeholder="Escribe un mensaje para este corte..." rows={3} style={{ width: '100%', borderRadius: 8, padding: '0.5rem', background: '#081025', color: '#fff', border: '1px solid #1f2937' }} />
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <button type="button" className="primary-button" onClick={() => sendCutMessageFor(cut.id, getCutPlayerIds(cut))}>
                                  Enviar a destinatarios
                                </button>
                                <button type="button" className="secondary-button" onClick={() => { setCutMessageText(''); }}>
                                  Limpiar
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                {!isReadOnly && (
                  <>
                    <input
                      type="text"
                      placeholder="Nombre del rival..."
                      value={match.opponent}
                      onChange={e => {
                        const updated = [...matches];
                        updated[index] = { ...updated[index], opponent: e.target.value };
                        setMatches(updated);
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
                      }}
                      style={{ width: '100%', padding: '0.4rem 0.5rem', background: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', marginBottom: '0.5rem' }}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => deleteArchivedMatch(index)}
                      style={{ width: '100%', marginBottom: '0.5rem', background: '#7f1d1d', borderColor: '#b91c1c', color: '#fff' }}
                    >
                      Eliminar partido
                    </button>
                  </>
                )}
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
      {playingCut && playingEmbedUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ width: '92%', maxWidth: 980, background: '#000', padding: 12, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ color: '#fff' }}>{playingCut.label}</strong>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="secondary-button" onClick={() => { setPlayingCut(null); setPlayingEmbedUrl(null); }}>Cerrar</button>
              </div>
            </div>
            <div style={{ position: 'relative', paddingTop: '56.25%' }}>
              <iframe title={`Corte ${playingCut.id}`} src={playingEmbedUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AnalisisDePartido;
