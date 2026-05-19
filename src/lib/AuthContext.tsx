import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export type UserRole = 'jugador' | 'cuerpo_tecnico' | 'SUPER_ADMIN';

interface AppUser {
  id: string;
  username: string;
  role: UserRole;
  player_id?: string | null;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('app_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Error parsing user from localStorage:", e);
        localStorage.removeItem('app_user');
      }
    }
    setLoading(false);
  }, []);

  async function signIn(username: string, password: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, role, password, player_id')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (error) {
      console.error("Error en la consulta de login:", error);
      return false;
    }

    if (!data) {
      console.warn("No se encontró usuario con esas credenciales");
      return false;
    }

    // Validar vinculación si es jugador
    if (data.role === 'jugador' && !data.player_id) {
      alert('Tu cuenta de jugador no está vinculada a ningún jugador de la plantilla. Contacta con el administrador.');
      return false;
    }


    // Asegurarse de que player_id se incluya en el estado 'user'
    const userDataToSave = {
      id: data.id,
      username: data.username,
      role: data.role,
      player_id: data.player_id != null ? String(data.player_id) : null,
    };

    setUser(userDataToSave);
    console.log("Usuario guardado en AuthContext:", userDataToSave);
    localStorage.setItem('app_user', JSON.stringify(userDataToSave));
    return true;
  }

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('app_user');
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}