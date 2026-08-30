import { useEffect, useRef, useState } from 'react';
import type { UserRole } from './AuthContext';
import { supabase } from './supabaseClient';

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

type SharedStateRow = {
  key: string;
  value: unknown;
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
    const loadNotifications = async () => {
      const [{ data: stateRows }, { data: calendarRows }, { data: responseRows }] = await Promise.all([
        supabase.from('shared_state').select('key, value').in('key', ['tablon_messages', 'analisis_chat']),
        supabase.from('calendar_events').select('date, type'),
        user.role === 'jugador' && user.player_id
          ? supabase.from('wellness_responses').select('event_type, molestias').eq('player_id', String(user.player_id)).eq('event_date', todayISO())
          : Promise.resolve({ data: [] }),
      ]);

      if (cancelled) return;

      const rows = (stateRows || []) as SharedStateRow[];
      const messages = rows.flatMap((row) => {
        const values = Array.isArray(row.value) ? row.value as Message[] : [];
        const section: 'Inicio' | 'Desarrollo Individual' = row.key === 'tablon_messages' ? 'Inicio' : 'Desarrollo Individual';
        return values.filter((message) => isRecipient(message, user)).map((message) => ({ message, section }));
      });

      const currentMessageIds = new Set(messages.map(({ message }) => message.id));
      const newMessages = previousIdsRef.current
        ? messages.filter(({ message }) => !previousIdsRef.current!.has(message.id))
        : [];
      previousIdsRef.current = currentMessageIds;

      const messageNotifications = newMessages.map(({ message, section }) => ({
        id: `message-${message.id}`,
        section,
        title: `Nuevo mensaje de ${message.senderName}`,
        detail: message.text,
      }));

      const hasTraining = (calendarRows || []).some((event: { date: string; type: string }) => event.date === todayDisplay() && event.type === 'entrenamiento');
      const hasMatch = (calendarRows || []).some((event: { date: string; type: string }) => event.date === todayDisplay() && event.type === 'partido');
      const responses = (responseRows || []) as Array<{ event_type?: string; molestias?: string | null }>;
      const wellnessNotifications: AppNotification[] = [];

      if (user.role === 'jugador' && user.player_id && hasTraining) {
        if (!responses.some((response) => responseHasType(response, 'pre_entrenamiento'))) {
          wellnessNotifications.push({ id: 'wellness-pre', section: 'Wellness', title: 'Wellness pendiente', detail: 'Completa el cuestionario PRE de hoy.' });
        }
        if (!responses.some((response) => responseHasType(response, 'post_entrenamiento'))) {
          wellnessNotifications.push({ id: 'wellness-post', section: 'Wellness', title: 'Wellness pendiente', detail: 'Completa el cuestionario POST de hoy.' });
        }
      }
      if (user.role === 'jugador' && user.player_id && hasMatch && !responses.some((response) => responseHasType(response, 'partido'))) {
        wellnessNotifications.push({ id: 'wellness-match', section: 'Wellness', title: 'Wellness pendiente', detail: 'Completa el formulario de partido de hoy.' });
      }

      setNotifications((previous) => [...messageNotifications, ...wellnessNotifications, ...previous.filter((item) => item.id.startsWith('message-'))].slice(0, 8));
    };

    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 30000);
    const channel = supabase.channel(`app-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_state' }, () => void loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wellness_responses' }, () => void loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => void loadNotifications())
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const dismissNotification = (id: string) => setNotifications((previous) => previous.filter((item) => item.id !== id));
  return { notifications, dismissNotification };
}