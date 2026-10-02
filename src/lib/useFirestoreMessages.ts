import { useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { firestore } from './firebaseClient';

// Mismo interfaz que useSharedState ([valor, setValor]) pero respaldado por Firestore (un documento
// por mensaje) en vez de un array JSON en Supabase; evita releer/reescribir el historial completo
// y quita del todo esta carga de la cuota de Supabase.
export function useFirestoreMessages<T extends { id: string; createdAt: string }>(
  collectionName: string,
  limitCount = 300
): [T[], (val: T[] | ((prev: T[]) => T[])) => void] {
  const [messages, setMessagesState] = useState<T[]>([]);
  const messagesRef = useRef<T[]>([]);

  useEffect(() => {
    const q = query(collection(firestore, collectionName), orderBy('createdAt', 'desc'), limit(limitCount));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as T));
      messagesRef.current = next;
      setMessagesState(next);
    });
    return () => unsubscribe();
  }, [collectionName, limitCount]);

  const setMessages = (val: T[] | ((prev: T[]) => T[])) => {
    const prev = messagesRef.current;
    const next = typeof val === 'function' ? (val as (prev: T[]) => T[])(prev) : val;
    messagesRef.current = next;
    setMessagesState(next);

    const prevById = new Map(prev.map((m) => [m.id, m]));
    const nextIds = new Set(next.map((m) => m.id));

    prev.forEach((m) => {
      if (!nextIds.has(m.id)) void deleteDoc(doc(firestore, collectionName, m.id));
    });

    next.forEach((m) => {
      const previous = prevById.get(m.id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(m)) {
        const { id, ...rest } = m;
        void setDoc(doc(firestore, collectionName, id), rest, { merge: true });
      }
    });
  };

  return [messages, setMessages];
}
