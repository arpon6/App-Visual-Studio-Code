function AnalisisDePartido() {
  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Revisa el rendimiento</small>
          <h1>Análisis de Partido</h1>
        </div>
      </div>

      <div className="grid-3">
        <div className="widget-box">
          <h2>Posesión</h2>
          <p>58%</p>
        </div>
        <div className="widget-box">
          <h2>Tiros</h2>
          <p>14</p>
        </div>
        <div className="widget-box">
          <h2>Entradas</h2>
          <p>26</p>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Comparativa clave</h2>
        </div>
        <div className="chart-placeholder">
          <p style={{ color: '#7f96bc', margin: 0 }}>Resumen de datos tácticos del último partido.</p>
        </div>
      </div>
    </section>
  );
}

export default AnalisisDePartido;
