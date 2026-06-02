import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';

function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await signIn(username, password);
    if (!success) setError(true);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '24px',
      background: 'var(--bg, #0f1117)', color: 'var(--text, #f4f7ff)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0 }}>Mi Club App</h1>
        <p style={{ opacity: 0.6, marginTop: '8px' }}>Introduce tus credenciales</p>
      </div>
      
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '300px' }}>
        <input 
          placeholder="Usuario" 
          value={username} 
          onChange={e => setUsername(e.target.value)}
          style={{ padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#1c1f26', color: '#fff' }}
        />
        <input 
          type="password"
          placeholder="Contraseña" 
          value={password} 
          onChange={e => setPassword(e.target.value)}
          style={{ padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#1c1f26', color: '#fff' }}
        />
        {error && <p style={{ color: '#f44242', fontSize: '0.8rem', textAlign: 'center' }}>Credenciales incorrectas</p>}
        <button type="submit" className="primary-button" style={{ padding: '12px' }}>
          Entrar
        </button>
      </form>
    </div>
  );
}

export default Login;