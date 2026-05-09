import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Player } from '../components/TacticalBoard';
import { AbpSection } from '../components/AbpBoard';
import { useAuth } from '../lib/AuthContext';

function RepositorioABP() {
  const { appUser } = useAuth();
  const isReadOnly = appUser?.role === 'jugador';
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    supabase.from('plantilla').select('number, first_name, last_name1').then(({ data }) => {
      if (!data) return;
      const mapped: Player[] = data.map((p: any, i: number) => ({
        id: i,
        name: [p.first_name, p.last_name1].filter(Boolean).join(' '),
        number: p.number || 0,
      }));
      mapped.sort((a, b) => a.number - b.number);
      setPlayers(mapped);
    });
  }, []);

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Documentación y metodología</small>
          <h1>Repositorio ABP</h1>
        </div>
      </div>

      <AbpSection
        title="Jugadas ofensivas"
        badge="A"
        storageKey="abp_repo_ofensivo"
        supabaseTitle="abp_repo_ofensivo"
        players={players}
        readOnly={isReadOnly}
      />
      <AbpSection
        title="Jugadas defensivas"
        badge="B"
        storageKey="abp_repo_defensivo"
        supabaseTitle="abp_repo_defensivo"
        players={players}
        readOnly={isReadOnly}
      />
    </section>
  );
}

export default RepositorioABP;
