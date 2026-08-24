import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export interface PlantillaJugador {
  id: string;
  nombre: string;
  posicion: string;
}

export function usePlantilla() {
  const [jugadores, setJugadores] = useState<PlantillaJugador[]>([]);

  useEffect(() => {
    supabase
      .from('plantilla')
      .select('id, first_name, last_name1, position')
      .then(({ data }) => {
        if (data) {
          setJugadores(data.map(p => ({
            id: String(p.id),
            nombre: [p.first_name, p.last_name1].filter(Boolean).join(' '),
            posicion: p.position || '',
          })));
        }
      });
  }, []);

  return jugadores;
}
