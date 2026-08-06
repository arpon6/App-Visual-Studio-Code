import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Player } from '../components/TacticalBoard';
import { AbpSection } from '../components/AbpBoard';
import { useAuth } from '../lib/AuthContext';

function RepositorioABP() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const [players, setPlayers] = useState<Player[]>([]);
  const [offensiveType, setOffensiveType] = useState<'corner' | 'falta_lateral' | 'falta_frontal'>('corner');
  const [defensiveType, setDefensiveType] = useState<'corner' | 'falta_lateral' | 'falta_frontal'>('corner');

  const playTypeOptions: { key: 'corner' | 'falta_lateral' | 'falta_frontal'; label: string }[] = [
    { key: 'corner', label: 'Córner' },
    { key: 'falta_lateral', label: 'Falta lateral' },
    { key: 'falta_frontal', label: 'Falta frontal' },
  ];

  const getTypedKey = (baseKey: string, type: 'corner' | 'falta_lateral' | 'falta_frontal') => {
    if (type === 'corner') return baseKey;
    return `${baseKey}_${type}`;
  };

  const getTypeLabel = (type: 'corner' | 'falta_lateral' | 'falta_frontal') => {
    const found = playTypeOptions.find(option => option.key === type);
    return found ? found.label : 'Córner';
  };

  const onOffensiveTypeChange = (value: string) => {
    if (value === 'corner' || value === 'falta_lateral' || value === 'falta_frontal') {
      setOffensiveType(value);
    }
  };

  const onDefensiveTypeChange = (value: string) => {
    if (value === 'corner' || value === 'falta_lateral' || value === 'falta_frontal') {
      setDefensiveType(value);
    }
  };

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

      <div className="abp-type-select-row" style={{ marginTop: '6px' }}>
        <label className="abp-type-select-label" htmlFor="abp-repo-offensive-type">Tipo de jugada ofensiva</label>
        <select
          id="abp-repo-offensive-type"
          className="abp-type-select"
          value={offensiveType}
          onChange={e => onOffensiveTypeChange(e.target.value)}
        >
          {playTypeOptions.map(option => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </div>

      <AbpSection
        key={`abp_repo_ofensivo_${offensiveType}`}
        title={`Jugadas ofensivas · ${getTypeLabel(offensiveType)}`}
        badge="A"
        storageKey={getTypedKey('abp_repo_ofensivo', offensiveType)}
        supabaseTitle={getTypedKey('abp_repo_ofensivo', offensiveType)}
        players={players}
        readOnly={isReadOnly}
      />

      <div className="abp-type-select-row" style={{ marginTop: '6px' }}>
        <label className="abp-type-select-label" htmlFor="abp-repo-defensive-type">Tipo de jugada defensiva</label>
        <select
          id="abp-repo-defensive-type"
          className="abp-type-select"
          value={defensiveType}
          onChange={e => onDefensiveTypeChange(e.target.value)}
        >
          {playTypeOptions.map(option => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </div>

      <AbpSection
        key={`abp_repo_defensivo_${defensiveType}`}
        title={`Jugadas defensivas · ${getTypeLabel(defensiveType)}`}
        badge="B"
        storageKey={getTypedKey('abp_repo_defensivo', defensiveType)}
        supabaseTitle={getTypedKey('abp_repo_defensivo', defensiveType)}
        players={players}
        readOnly={isReadOnly}
      />
    </section>
  );
}

export default RepositorioABP;
