const players = [
  { name: 'Sergio López', progress: 'Fuerza +8%', task: 'Mejorar salida de balón' },
  { name: 'Álvaro Pinto', progress: 'Visión +12%', task: 'Trabajo de marcaje' },
  { name: 'Cristian M.', progress: 'Control +10%', task: 'Movimientos en zona media' },
];

function DesarrolloIndividual() {
  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Seguimiento personal</small>
          <h1>Desarrollo Individual</h1>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Estado de los jugadores</h2>
        </div>
        <table className="list-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Progreso</th>
              <th>Tarea</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.name}>
                <td>{player.name}</td>
                <td>{player.progress}</td>
                <td>{player.task}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default DesarrolloIndividual;
