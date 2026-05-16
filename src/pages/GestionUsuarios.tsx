import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

interface AllowedEmail {
  email: string;
  created_at: string;
}

interface AppUserRow {
  id: string;
  email: string; // Mantengo email por si acaso, aunque el login usa username
  username: string; // Añadimos username
  role: 'jugador' | 'cuerpo_tecnico';
  player_id: string | null;
  password?: string | null; // Añadimos la columna password
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
    if (user?.role !== 'cuerpo_tecnico') return;
    fetchData();
  }, [user]);

  async function fetchData() {
    const [{ data: emails }, { data: users }, { data: plantilla }] = await Promise.all([
      supabase.from('allowed_emails').select('email, created_at').order('created_at'),
      supabase.from('app_users').select('id, email, username, role, player_id, password'), // Asegúrate de pedir 'username' y 'password'
      supabase.from('plantilla').select('id, first_name, last_name1'),
    ]);
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
    // Si es password, hay que hashearla (idealmente) o guardarla en texto plano si el login lo espera así
    const updateData: any = { [field]: value };
    // if (field === 'password' && value) { /* Aquí iría el hasheo de contraseña */ }

    await supabase.from('app_users').update(updateData).eq('id', userId);
    setAppUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value } : u));
    if (field === 'password') {
      setEditingPasswordForUserId(null); // Cerrar la edición de contraseña
      setPasswordInput('');
    }
  }

  // Comprobamos 'user?.role' en lugar de 'appUser?.role'
  if (user?.role !== 'cuerpo_tecnico') return null;

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Administración</small>
          <h1>Gestión de usuarios</h1>
        </div>
      </div>

      {/* Lista blanca de correos */}
      <div className="card">
        <div className="section-header">
          <h2>Correos autorizados</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
          />
          <button className="primary-button" onClick={addEmail}>Añadir</button>
        </div>
        {msg && <p style={{ color: '#09e67f', marginBottom: '12px' }}>{msg}</p>}
        <table className="list-table">
          <thead>
            <tr><th>Correo</th><th>Añadido</th><th></th></tr>
          </thead>
          <tbody>
            {allowedEmails.map(e => (
              <tr key={e.email}>
                <td>{e.email}</td>
                <td>{new Date(e.created_at).toLocaleDateString('es-ES')}</td>
                <td>
                  <button className="delete-button" onClick={() => removeEmail(e.email)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Usuarios registrados */}
      <div className="card">
        <div className="section-header">
          <h2>Usuarios registrados</h2>
        </div>
        <table className="list-table">
          <thead>
            <tr><th>Username</th><th>Correo</th><th>Rol</th><th>Jugador vinculado</th><th>Contraseña</th><th></th></tr>
          </thead>
          <tbody>
            {appUsers.map(u => (
              <tr key={u.id}>
                {/* Campo Username */}
                <td>
                  {editingPasswordForUserId === u.id ? (
                    <input type="text" value={u.username || ''} onChange={e => updateUser(u.id, 'username', e.target.value)} />
                  ) : (
                    u.username
                  )}
                </td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={e => updateUser(u.id, 'role', e.target.value)}
                  >
                    <option value="jugador">Jugador</option>
                    <option value="cuerpo_tecnico">Cuerpo técnico</option>
                  </select>
                </td>
                <td>
                  <select
                    value={u.player_id ?? ''}
                    onChange={e => updateUser(u.id, 'player_id', e.target.value || null)}
                  >
                    <option value="">— Sin vincular —</option>
                    {players.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name1}
                      </option>
                    ))}
                  </select>
                </td>
                {/* Campo Contraseña */}
                <td>
                  {editingPasswordForUserId === u.id ? (
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      placeholder="Nueva contraseña"
                    />
                  ) : (
                    <span>********</span>
                  )}
                </td>
                <td>
                  {editingPasswordForUserId === u.id ? (
                    <button onClick={() => updateUser(u.id, 'password', passwordInput || null)}>Guardar</button>
                  ) : (
                    <button onClick={() => { setEditingPasswordForUserId(u.id); setPasswordInput(u.password || ''); }}>Cambiar</button>
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