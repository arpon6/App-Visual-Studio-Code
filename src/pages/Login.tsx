import { useAuth } from '../lib/AuthContext';

function Login() {
  const { signInWithGoogle } = useAuth();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '24px',
      background: 'var(--bg, #0f1117)', color: 'var(--text, #f4f7ff)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', fontWeight: 700, marginBottom: '8px' }}>FC</div>
        <h1 style={{ margin: 0 }}>Mi Club</h1>
        <p style={{ opacity: 0.6, marginTop: '8px' }}>Accede con tu cuenta de Google autorizada</p>
      </div>
      <button
        className="primary-button"
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 24px', fontSize: '16px' }}
        onClick={signInWithGoogle}
      >
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.6 5.1C9.8 39.8 16.4 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.5 35.8 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
        </svg>
        Iniciar sesión con Google
      </button>
    </div>
  );
}

export default Login;
