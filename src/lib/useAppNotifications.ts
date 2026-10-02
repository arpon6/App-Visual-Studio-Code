import { useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { UserRole } from './AuthContext';
import { supabase } from './supabaseClient';
import { firestore } from './firebaseClient';

type AppUser = {
  id: string;
  role: UserRole;
  player_id?: string | null;
};

type Message = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  recipients: string[];
  createdAt: string;
};

export type AppNotification = {
  id: string;
  section: 'Inicio' | 'Desarrollo Individual' | 'Desarrollo grupal' | 'Wellness';
  title: string;
  detail: string;
};

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayDisplay() {
  const date = new Date();
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function isRecipient(message: Message, user: AppUser) {
  if (message.senderId === user.id) return false;
  if (message.recipients.includes(`user:${user.id}`)) return true;
  if (user.role === 'jugador') {
    return message.recipients.includes('all_players') || Boolean(user.player_id && message.recipients.includes(`player:${user.player_id}`));
  }
  return message.recipients.includes('staff_admin');
}

function responseHasType(response: { event_type?: string; molestias?: string | null }, type: string) {
  if (response.event_type === type) return true;
  try {
    const payload = JSON.parse(response.molestias || '{}') as Record<string, unknown>;
    return type === 'pre_entrenamiento' ? Boolean(payload.pre) : type === 'post_entrenamiento' ? Boolean(payload.post) : Boolean(payload.partido);
  } catch {
    return false;
  }
}

export function useAppNotifications(user: AppUser | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const previousIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      previousIdsRef.current = null;
      return;
    }

    let cancelled = false;
    const isJugador = user.role === 'jugador' && Boolean(user.player_id);

    // Wellness/calendario siguen en Supabase (ya acotados a hoy y al propio jugador); solo aplica a rol jugador.
    const loadWellness = async () => {
      const [{ data: calendarRows }, { data: responseRows }] = await Promise.all([
        isJugador
          ? supabase.from('calendar_events').select('date, type').eq('date', todayDisplay())
          : Promise.resolve({ data: [] }),
        isJugador
          ? supabase.from('wellness_responses').select('event_type, molestias').eq('player_id', String(user.player_id)).eq('event_date', todayISO())
          : Promise.resolve({ data: [] }),
      ]);

      if (cancelled) return;

      const hasTraining = (calendarRows || []).some((event: { date: string; type: string }) => event.date === todayDisplay() && event.type === 'entrenamiento');
      const hasMatch = (calendarRows || []).some((event: { date: string; type: string }) => event.date === todayDisplay() && event.type === 'partido');
      const responses = (responseRows || []) as Array<{ event_type?: string; molestias?: string | null }>;
      const wellnessNotifications: AppNotification[] = [];

      if (isJugador && hasTraining) {
        if (!responses.some((response) => responseHasType(response, 'pre_entrenamiento'))) {
          wellnessNotifications.push({ id: 'wellness-pre', section: 'Wellness', title: 'Wellness pendiente', detail: 'Completa el cuestionario PRE de hoy.' });
        }
        if (!responses.some((response) => responseHasType(response, 'post_entrenamiento'))) {
          wellnessNotifications.push({ id: 'wellness-post', section: 'Wellness', title: 'Wellness pendiente', detail: 'Completa el cuestionario POST de hoy.' });
        }
      }
      if (isJugador && hasMatch && !responses.some((response) => responseHasType(response, 'partido'))) {
        wellnessNotifications.push({ id: 'wellness-match', section: 'Wellness', title: 'Wellness pendiente', detail: 'Completa el formulario de partido de hoy.' });
      }

      setNotifications((previous) => [...previous.filter((item) => item.id.startsWith('message-')), ...wellnessNotifications].slice(0, 8));
    };

    void loadWellness();
    const wellnessInterval = window.setInterval(() => void loadWellness(), 300000);
    const wellnessChannel = isJugador
      ? supabase.channel(`app-notifications-wellness-${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'wellness_responses', filter: `player_id=eq.${user.player_id}` }, () => void loadWellness())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => void loadWellness())
          .subscribe()
      : null;

    // Mensajes (tablon/chat) via Firestore en tiempo real: ya no consumen cuota de Supabase.
    let tablonMessages: Message[] = [];
    let chatMessages: Message[] = [];
    const recomputeMessageNotifications = () => {
      const combined = [
        ...tablonMessages.filter((m) => isRecipient(m, user)).map((message) => ({ message, section: 'Inicio' as const })),
        ...chatMessages.filter((m) => isRecipient(m, user)).map((message) => ({ message, section: 'Desarrollo Individual' as const })),
      ];
      const currentIds = new Set(combined.map(({ message }) => message.id));
      const newOnes = previousIdsRef.current ? combined.filter(({ message }) => !previousIdsRef.current!.has(message.id)) : [];
      previousIdsRef.current = currentIds;
      if (newOnes.length === 0) return;
      const messageNotifications = newOnes.map(({ message, section }) => ({
        id: `message-${message.id}`,
        section,
        title: `Nuevo mensaje de ${message.senderName}`,
        detail: message.text,
      }));
      setNotifications((previous) => [...messageNotifications, ...previous].slice(0, 8));
    };

    const tablonQuery = query(collection(firestore, 'tablon_messages'), orderBy('createdAt', 'desc'), limit(50));
    const chatQuery = query(collection(firestore, 'analisis_chat'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribeTablon = onSnapshot(tablonQuery, (snapshot) => {
      tablonMessages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      recomputeMessageNotifications();
    });
    const unsubscribeChat = onSnapshot(chatQuery, (snapshot) => {
      chatMessages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      recomputeMessageNotifications();
    });

    return () => {
      cancelled = true;
      window.clearInterval(wellnessInterval);
      if (wellnessChannel) void supabase.removeChannel(wellnessChannel);
      unsubscribeTablon();
      unsubscribeChat();
    };
  }, [user]);

  const dismissNotification = (id: string) => setNotifications((previous) => previous.filter((item) => item.id !== id));
  return { notifications, dismissNotification };
}