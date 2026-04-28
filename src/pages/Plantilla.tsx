import { useState } from 'react';

const players = [
  {
    name: 'Sergio López',
    position: 'Portero',
    age: 24,
    dorsal: 1,
    photo: 'https://via.placeholder.com/150',
    birthDate: '2000-05-15',
    residence: 'Madrid, España',
    height: '1.85 m',
    weight: '80 kg'
  },
  {
    name: 'Álvaro Pinto',
    position: 'Defensa',
    age: 27,
    dorsal: 4,
    photo: 'https://via.placeholder.com/150',
    birthDate: '1997-03-22',
    residence: 'Barcelona, España',
    height: '1.78 m',
    weight: '75 kg'
  },
  {
    name: 'Cristian M.',
    position: 'Centrocampista',
    age: 22,
    dorsal: 8,
    photo: 'https://via.placeholder.com/150',
    birthDate: '2002-11-10',
    residence: 'Valencia, España',
    height: '1.75 m',
    weight: '70 kg'
  },
  {
    name: 'Víctor Molina',
    position: 'Delantero',
    age: 25,
    dorsal: 9,
    photo: 'https://via.placeholder.com/150',
    birthDate: '1999-07-05',
    residence: 'Sevilla, España',
    height: '1.82 m',
    weight: '78 kg'
  },
  {
    name: 'Daniel Castro',
    position: 'Lateral',
    age: 23,
    dorsal: 2,
    photo: 'https://via.placeholder.com/150',
    birthDate: '2001-01-30',
    residence: 'Bilbao, España',
    height: '1.80 m',
    weight: '76 kg'
  },
];

function Plantilla() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  if (selectedPlayer) {
    return (
      <section className="page-section">
        <div className="page-title">
          <div>
            <small>Equipo activo</small>
            <h1>{selectedPlayer.name}</h1>
          </div>
          <button onClick={() => setSelectedPlayer(null)}>Volver</button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <img src={selectedPlayer.photo} alt={selectedPlayer.name} style={{ width: '150px', height: '150px', borderRadius: '8px' }} />
            <div>
              <h2>{selectedPlayer.name}</h2>
              <p><strong>Dorsal:</strong> {selectedPlayer.dorsal}</p>
              <p><strong>Posición:</strong> {selectedPlayer.position}</p>
              <p><strong>Edad:</strong> {selectedPlayer.age}</p>
              <p><strong>Fecha de nacimiento:</strong> {selectedPlayer.birthDate}</p>
              <p><strong>Lugar de residencia:</strong> {selectedPlayer.residence}</p>
              <p><strong>Altura:</strong> {selectedPlayer.height}</p>
              <p><strong>Peso:</strong> {selectedPlayer.weight}</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Equipo activo</small>
          <h1>Plantilla</h1>
        </div>
      </div>

      <div className="grid-3">
        {players.map((player) => (
          <div key={player.name} className="card" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setSelectedPlayer(player)}>
            <img src={player.photo} alt={player.name} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }} />
            <h3>{player.name}</h3>
            <p>Dorsal: {player.dorsal}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Plantilla;
