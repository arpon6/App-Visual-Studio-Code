import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

export function useSharedState<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Se guarda en un ref porque no debe disparar el efecto de carga al cambiar entre renders.
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('shared_state').select('value').eq('key', key).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // Si la key no existe todavia (p.ej. partido nuevo), hay que volver al valor por defecto
        // en vez de dejar el valor de la key anterior.
        setValue(data?.value !== undefined ? (data.value as T) : defaultValueRef.current);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [key]);

  const set = (val: T | ((prev: T) => T)) => {
    const nextValue = typeof val === 'function'
      ? (val as (prev: T) => T)(value)
      : val;

    setValue(nextValue);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      supabase.from('shared_state')
        .upsert({ key, value: nextValue, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .then(({ error }) => {
          if (error) console.error('shared_state upsert error:', key, error);
          else console.log('shared_state saved:', key);
        });
    }, 500);
  };

  return [value, set, loading];
}
