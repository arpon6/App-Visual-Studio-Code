import type { TextOverlay } from '../pages/CreadorDeMontajes';

export type SavedClip = {
  id: string;
  type: 'video' | 'image';
  name: string;
  blob: Blob;
  duration: number;
  start: number;
  end: number;
  volume: number;
  muted: boolean;
  texts: TextOverlay[];
  thumbnail?: string;
};

export type SavedAudioTrack = {
  id: string;
  name: string;
  blob?: Blob;
  volume: number;
  startTime: number;
  duration: number;
  isVoiceOver?: boolean;
};

export type SavedProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
  totalDuration: number;
  clipsCount: number;
  clips: SavedClip[];
  audioTracks: SavedAudioTrack[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
  totalDuration: number;
  clipsCount: number;
};

const DB_NAME = 'mi_club_montajes_db_v1';
const STORE_NAME = 'projects';
const DB_VERSION = 1;
const LAST_PROJECT_KEY = 'mi_club_montaje_last_active_project_id';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllProjects(): Promise<ProjectSummary[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items: SavedProject[] = req.result || [];
        const summaries: ProjectSummary[] = items.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          thumbnail: p.thumbnail || p.clips?.[0]?.thumbnail,
          totalDuration: p.totalDuration || p.clips?.reduce((acc, c) => acc + (c.end - c.start), 0) || 0,
          clipsCount: p.clips?.length || 0,
        }));
        // Ordenar del más reciente al más antiguo
        summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(summaries);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Error al obtener proyectos de IndexedDB:', e);
    return [];
  }
}

export async function getProject(id: string): Promise<SavedProject | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error(`Error al cargar proyecto ${id} de IndexedDB:`, e);
    return null;
  }
}

export async function saveProjectToDB(project: SavedProject): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(project);
    tx.oncomplete = () => {
      setLastActiveProjectId(project.id);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      if (getLastActiveProjectId() === id) {
        localStorage.removeItem(LAST_PROJECT_KEY);
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function getLastActiveProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveProjectId(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {}
}
