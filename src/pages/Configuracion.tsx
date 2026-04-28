function Configuracion() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Ajustes del club</small>
          <h1>Configuración</h1>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Perfil</h2>
        </div>
        <div className="widget-box">
          <p>Nombre del club: Mi Club</p>
          <p>Entrenador: Javier Sagrario</p>
          <p>Modalidad: Fútbol base</p>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Conexión Supabase</h2>
        </div>
        <div className="widget-box">
          <p>
            Estado: <strong>{isSupabaseConfigured ? 'Configurado' : 'No configurado'}</strong>
          </p>
          <p>URL: {supabaseUrl ?? 'No definida'}</p>
          <p>Anon key: {supabaseAnonKey ? 'Definida' : 'No definida'}</p>
        </div>
      </div>
    </section>
  );
}

export default Configuracion;
