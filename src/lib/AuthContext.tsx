import { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export type UserRole = 'jugador' | 'cuerpo_tecnico' | 'SUPER_ADMIN';

interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  player_id: string | null;
}

interface AuthContextValue {
  session: Session | null;
  appUser: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) fetchAppUser(data.session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchAppUser(session.user.id);
      else { setAppUser(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchAppUser(userId: string) {
    console.log('fetchAppUser userId:', userId);
    const { data, error } = await supabase
      .from('usuarios')
      .select('auth_id, email, role, playerId')
      .eq('auth_id', userId)
      .single();
    console.log('usuarios data:', data, 'error:', error);
    if (data) {
      setAppUser({ id: data.auth_id, email: data.email, role: data.role, player_id: data.playerId ?? null });
    } else {
      setAppUser(null);
    }
    setLoading(false);
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, appUser, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
