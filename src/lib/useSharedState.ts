import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

export function useSharedState<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.from('shared_state').select('value').eq('key', key).maybeSingle()
      .then(({ data }) => {
        if (data?.value !== undefined) setValue(data.value as T);
        setLoading(false);
      });
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
