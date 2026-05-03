import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Player {
  name: string;
  position: string;
  age: number | string;
  dorsal: number;
  photo: string;
  birthDate: string;
  residence: string;
  height: string;
  weight: string;
}

function Plantilla() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('plantilla')
        .select('*');

      setLoading(false);

      if (error) {
        setFetchError('No se han podido cargar los jugadores. Revisa la tabla plantilla en Supabase.');
        return;
      }

      if (!data || data.length === 0) {
        setFetchError('No hay jugadores en la tabla plantilla.');
        return;
      }

      const mappedPlayers: Player[] = (data as any[]).map(player => ({
        name: [player.first_name, player.last_name1, player.last_name2].filter(Boolean).join(' '),
        position: player.position || 'Sin posición',
        age: calculateAge(player.birth_date),
        dorsal: player.number || 0,
        photo: player.photo || 'https://via.placeholder.com/150',
        birthDate: player.birth_date || 'No especificado',
        residence: player.residence || 'No especificado',
        height: player.stats?.height ? `${player.stats.height} cm` : 'No especificado',
        weight: player.stats?.weight ? `${player.stats.weight} kg` : 'No especificado'
      }));

      const order: Record<string, number> = { 'Portero': 0, 'Defensa': 1, 'Centrocampista': 2, 'Delantero': 3 };
      mappedPlayers.sort((a, b) => (order[a.position] ?? 99) - (order[b.position] ?? 99));
      setPlayers(mappedPlayers);
    };

    fetchPlayers();
  }, []);

  const calculateAge = (birthDate: string): number | string => {
    if (!birthDate) return 'No especificado';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

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

      {loading && <p>Cargando jugadores...</p>}
      {fetchError && <p>{fetchError}</p>}

      <div className="grid-3">
        {players.map((player) => (
          <div key={`${player.name}-${player.dorsal}`} className="card" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setSelectedPlayer(player)}>
            <img src={player.photo} alt={player.name} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }} />
            <h3>{player.name}</h3>
            <p>Dorsal: {player.dorsal}</p>
            <p>{player.position}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Plantilla;
