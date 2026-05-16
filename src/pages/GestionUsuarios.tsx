import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

interface AllowedEmail {
  email: string;
  created_at: string;
}

interface AppUserRow {
  id: string;
  email: string;
  username: string;
  role: 'jugador' | 'cuerpo_tecnico' | 'SUPER_ADMIN';
  player_id: string | null;
  password?: string | null;
}

interface PlantillaPlayer {
  id: string;
  first_name: string;
  last_name1: string;
}

function GestionUsuarios() {
  const { user } = useAuth();
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserRow[]>([]);
  const [players, setPlayers] = useState<PlantillaPlayer[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [editingPasswordForUserId, setEditingPasswordForUserId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    console.log("Usuario actual:", user);
    if (user?.role !== 'cuerpo_tecnico' && user?.role !== 'SUPER_ADMIN') {
      console.log("Acceso denegado: El rol no es cuerpo_tecnico ni SUPER_ADMIN");
      return;
    }
    fetchData();
  }, [user]);

  async function fetchData() {
    console.log("Iniciando fetchData...");
    const [{ data: emails, error: e1 }, { data: users, error: e2 }, { data: plantilla, error: e3 }] = await Promise.all([
      supabase.from('allowed_emails').select('email, created_at').order('created_at'),
      supabase.from('app_users').select('id, email, username, role, player_id, password'),
      supabase.from('plantilla').select('id, first_name, last_name1'),
    ]);
    
    if (e1 || e2 || e3) console.error("Errores en fetchData:", { e1, e2, e3 });
    
    console.log("Usuarios cargados:", users);
    if (emails) setAllowedEmails(emails);
    if (users) setAppUsers(users);
    if (plantilla) setPlayers(plantilla);
  }

  async function addEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    const { error } = await supabase.from('allowed_emails').insert({ email });
    if (error) { setMsg(`Error: ${error.message}`); return; }
    setNewEmail('');
    setMsg(`${email} añadido a la lista.`);
    fetchData();
  }

  async function removeEmail(email: string) {
    await supabase.from('allowed_emails').delete().eq('email', email);
    setMsg(`${email} eliminado.`);
    fetchData();
  }

  async function updateUser(userId: string, field: 'role' | 'player_id' | 'password' | 'username', value: string | null) {
    const { error } = await supabase.from('app_users').update({ [field]: value }).eq('id', userId);
    if (error) console.error("Error actualizando usuario:", error);
    setAppUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value } : u));
    if (field === 'password') {
      setEditingPasswordForUserId(null);
      setPasswordInput('');
    }
  }

  // Permitimos cuerpo_tecnico O SUPER_ADMIN
  if (user?.role !== 'cuerpo_tecnico' && user?.role !== 'SUPER_ADMIN') {
    return <div style={{ padding: '20px' }}>No tienes permisos para ver esta sección. Tu rol es: {user?.role}</div>;
  }

  return (
    <section className="page-section">
      <div className="page-title">
        <h1>Gestión de usuarios</h1>
      </div>

      <div className="card">
        <h2>Usuarios registrados</h2>
        <table className="list-table">
          <thead>
            <tr><th>Username</th><th>Rol</th><th>Contraseña</th><th></th></tr>
          </thead>
          <tbody>
            {appUsers.map(u => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <select value={u.role} onChange={e => updateUser(u.id, 'role', e.target.value as any)}>
                    <option value="jugador">Jugador</option>
                    <option value="cuerpo_tecnico">Cuerpo técnico</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                </td>
                <td>
                  {editingPasswordForUserId === u.id ? (
                    <input type="text" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} />
                  ) : '********'}
                </td>
                <td>
                  {editingPasswordForUserId === u.id ? (
                    <button onClick={() => updateUser(u.id, 'password', passwordInput)}>Guardar</button>
                  ) : (
                    <button onClick={() => { setEditingPasswordForUserId(u.id); setPasswordInput(''); }}>Cambiar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default GestionUsuarios;