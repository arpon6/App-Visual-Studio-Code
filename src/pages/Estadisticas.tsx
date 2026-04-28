function Estadisticas() {
  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Indicadores del equipo</small>
          <h1>Estadísticas</h1>
        </div>
      </div>

      <div className="grid-3">
        <div className="widget-box">
          <h2>Goles</h2>
          <p>42</p>
        </div>
        <div className="widget-box">
          <h2>Asistencias</h2>
          <p>28</p>
        </div>
        <div className="widget-box">
          <h2>Tarjetas</h2>
          <p>12</p>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Rendimiento por tramo</h2>
        </div>
        <div className="chart-placeholder">
          <p style={{ color: '#7f96bc', margin: 0 }}>Datos de posesión, ataque y defensa por periodos.</p>
        </div>
      </div>
    </section>
  );
}

export default Estadisticas;
