import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Definición única de UserRole
export type UserRole = 'jugador' | 'cuerpo_tecnico' | 'SUPER_ADMIN';

interface AppUser {
  id: string;
  username: string; // Ahora usamos username para el login
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
    // Intenta cargar el usuario desde localStorage al iniciar la app
    const savedUser = localStorage.getItem('app_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Error parsing user from localStorage:", e);
        localStorage.removeItem('app_user'); // Limpia si los datos están corruptos
      }
    }
    setLoading(false);
  }, []);

  async function signIn(username: string, password: string): Promise<boolean> {
    // Realiza la consulta a tu tabla 'app_users'
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, role, player_id') // Asegúrate que estas columnas existan en tu tabla app_users
      .eq('username', username)
      .eq('password', password)
      .maybeSingle(); // Usa maybeSingle por si el usuario no existe

    if (error) {
      console.error("Error en la consulta de login:", error);
      return false;
    }

    if (!data) {
      // Si no se encontró el usuario con esas credenciales
      return false;
    }

    // Usuario encontrado, guarda la información y actualiza el estado
    setUser(data);
    localStorage.setItem('app_user', JSON.stringify(data));
    return true;
  }

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('app_user');
    // Recargar la página asegura que todos los componentes se reinicien con el estado de logout
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