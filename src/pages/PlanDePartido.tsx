function PlanDePartido() {
  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Organiza la táctica</small>
          <h1>Plan de Partido</h1>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-header">
            <h2>Estrategia principal</h2>
          </div>
          <div className="widget-box">
            <p>Formación 4-3-3 con presión alta y recuperación rápida en medio campo.</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#cdd4f1' }}>
              <li>Clave: mantener el balón y ataques rápidos por banda.</li>
              <li>Objetivo: 60% posesión.</li>
              <li>Marca especial a los mediocentros rivales.</li>
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <h2>Zona de impulso</h2>
          </div>
          <div className="widget-box">
            <p>Enfoque en jugadas a balón parado y cambios de ritmo con los extremos.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PlanDePartido;
