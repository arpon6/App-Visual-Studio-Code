function Inicio() {
  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <div className="badge">TEMPORADA 2025/26</div>
          <h1>Mi Club PRO</h1>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-header">
            <div>
              <small>Panel principal</small>
              <h2>Bienvenido, entrenador</h2>
            </div>
            <span className="badge">AUTO</span>
          </div>
          <div className="widget-box" style={{ minHeight: '260px', display: 'grid', placeItems: 'center' }}>
            <p style={{ margin: 0, color: '#7f96bc' }}>
              Aquí puedes gestionar plantilla, calendario, análisis y estadísticas del equipo.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <div>
              <small>Notificaciones y actividad</small>
              <h2>Últimos avisos</h2>
            </div>
          </div>
          <div className="notification-item">
            <strong>Error notificación staff</strong>
            <p>
              Fallo al avisar a javi...@gmail.com: You can only send testing emails to your own email address.
            </p>
            <small>13:40</small>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Inicio;
