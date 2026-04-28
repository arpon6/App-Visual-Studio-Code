const standings = [
  { position: 1, team: 'Mi Club', points: 42 },
  { position: 2, team: 'Escuela Norte', points: 38 },
  { position: 3, team: 'Deportivo Sur', points: 34 },
];

function ResultadosYClasif() {
  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Balance del torneo</small>
          <h1>Resultados y Clasif.</h1>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-header">
            <h2>Últimos resultados</h2>
          </div>
          <table className="list-table">
            <thead>
              <tr>
                <th>Partido</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Mi Club vs Atlético Juvenil</td>
                <td>3-1</td>
              </tr>
              <tr>
                <td>Mi Club vs Deportivo Norte</td>
                <td>1-2</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-header">
            <h2>Clasificación</h2>
          </div>
          <table className="list-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Equipo</th>
                <th>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.team}>
                  <td>{row.position}</td>
                  <td>{row.team}</td>
                  <td>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default ResultadosYClasif;
