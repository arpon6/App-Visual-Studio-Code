import { useEffect, useMemo, useRef, useState } from 'react';
import './CortadorDeVideo.css';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Category = { id: string; label: string; shortcut: string };
type Cut = { id: string; categoryId: string; label: string; start: number; end: number; createdAt: string };
type SavedState = { videoUrl: string; categories: Category[]; cuts: Cut[] };
type VideoMode = 'url' | 'file';

const STORAGE_KEY = 'mi_club_cortador_video_v1';
const IDB_NAME = 'mi_club_video_propio';
const IDB_STORE = 'files';
const IDB_KEY = 'local_video';
const EXAMPLE_VIDEO_ID = 'M7lc1UVf-VE';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFileToIDB(file: File) {
  const db = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(file, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFileFromIDB(): Promise<File | null> {
  const db = await openIDB();
  return new Promise((resolve) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'abp-ofensivo', label: 'ABP OFENSIVO', shortcut: 'Ctrl+Alt+1' },
  { id: 'abp-defensivo', label: 'ABP DEFENSIVO', shortcut: 'Ctrl+Alt+2' },
  { id: 'presion-alta', label: 'PRESIÓN ALTA', shortcut: 'Ctrl+Alt+3' },
  { id: 'repliegue-total', label: 'REPLIEGUE TOTAL', shortcut: 'Ctrl+Alt+4' },
  { id: 'repliegue-intermedio', label: 'REPLIEGUE INTERMEDIO', shortcut: 'Ctrl+Alt+5' },
  { id: 'conquista-espalda-z3', label: 'CONQUISTA ESPALDA Z 3', shortcut: 'Ctrl+Alt+6' },
  { id: 'ataque-area-estando', label: 'ATAQUE DE ÁREA ESTANDO', shortcut: 'Ctrl+Alt+7' },
  { id: 'ataque-area-llegando', label: 'ATAQUE DE ÁREA LLEGANDO', shortcut: 'Ctrl+Alt+8' },
  { id: 'defensa-area-estando', label: 'DEFENSA DE ÁREA ESTANDO', shortcut: 'Ctrl+Alt+9' },
  { id: 'defensa-area-llegando', label: 'DEFENSA DE ÁREA LLEGANDO', shortcut: '' },
  { id: 'reinicio-construccion-z12', label: 'REINICIO Y CONSTRUCCIÓN Z 1-2', shortcut: '' },
  { id: 'progresion-exterior-z23', label: 'PROGRESIÓN JUEGO EXTERIOR Z 2-3', shortcut: '' },
  { id: 'progresion-interior-z23', label: 'PROGRESIÓN JUEGO INTERIOR Z 2-3', shortcut: '' },
  { id: 'conservar-tras-robo-z1', label: 'PRIORIZAR CONSERVAR TRAS ROBO Z 1', shortcut: '' },
  { id: 'finalizar-tras-robo-z4', label: 'PRIORIZAR FINALIZAR TRAS ROBO Z 4', shortcut: '' },
  { id: 'progresar-tras-robo-z23', label: 'PRIORIZAR PROGRESAR TRAS ROBO Z 2-3', shortcut: '' },
  { id: 'recuperar-tras-perdida-z34', label: 'PRIORIZAR RECUPERAR TRAS PÉRDIDA Z 3-4', shortcut: '' },
  { id: 'defender-espacio-z2', label: 'PRIORIZAR DEFENDER ESPACIO TRAS PÉRDIDA Z 2', shortcut: '' },
  { id: 'defender-porteria-z1', label: 'PRIORIZAR DEFENDER PORTERÍA TRAS PÉRDIDA Z 1', shortcut: '' },
];

function normalizeKey(e: KeyboardEvent): string {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return '';
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join('+');
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) { resolve(); return; }
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) { window.onYouTubeIframeAPIReady = () => resolve(); return; }
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.body.appendChild(script);
  });
}

function loadState(): SavedState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {} as SavedState; }
}

function CortadorDeVideo() {
  const saved = useMemo(loadState, []);

  const [videoMode, setVideoMode] = useState<VideoMode>('url');
  const [videoUrl, setVideoUrl] = useState<string>(saved.videoUrl || '');
  const [videoId, setVideoId] = useState<string | null>(() => extractYouTubeVideoId(saved.videoUrl || ''));
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>(() => {
    const c = saved.categories;
    if (!c?.length) return DEFAULT_CATEGORIES;
    return c.map((cat: Category) => ({ ...cat, shortcut: cat.shortcut.includes('+') ? cat.shortcut : '' }));
  });
  const [cuts, setCuts] = useState<Cut[]>(saved.cuts || []);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(DEFAULT_CATEGORIES[0].id);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [editingShortcutValue, setEditingShortcutValue] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const playerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastKnownTimeRef = useRef<number>(0);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  // Keep refs always up to date so event listeners never have stale closures
  const categoriesRef = useRef(categories);
  const cutsRef = useRef(cuts);
  const playerReadyRef = useRef(playerReady);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { cutsRef.current = cuts; }, [cuts]);
  useEffect(() => { playerReadyRef.current = playerReady; }, [playerReady]);

  const groupedCuts = useMemo(() =>
    categories.map((category) => ({ category, cuts: cuts.filter((c) => c.categoryId === category.id) })),
    [categories, cuts]
  );

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ videoUrl, categories, cuts }));
  }, [videoUrl, categories, cuts]);

  // Load persisted local video from IndexedDB on mount
  useEffect(() => {
    loadFileFromIDB().then((file) => {
      if (!file) return;
      const src = URL.createObjectURL(file);
      setLocalVideoSrc(src);
      setVideoMode('file');
      setPlayerReady(true);
      setStatusMessage(`Vídeo cargado: ${file.name}`);
    });
  }, []);

  // Create YouTube player
  useEffect(() => {
    if (!videoId || !playerRef.current || videoMode !== 'url') return;
    let mounted = true;
    loadYouTubeApi().then(() => {
      if (!mounted || !playerRef.current) return;
      playerRef.current.innerHTML = '';
      ytPlayerRef.current?.destroy?.();
      ytPlayerRef.current = new window.YT.Player(playerRef.current, {
        videoId,
        width: '100%',
        height: '360',
        playerVars: { controls: 1, modestbranding: 1, rel: 0, origin: window.location.origin, enablejsapi: 1, playsinline: 1 },
        events: {
          onReady: () => {
            if (!mounted) return;
            setPlayerReady(true);
            setPlayerError('');
            setStatusMessage('Vídeo cargado. Usa los atajos asignados o pulsa el botón de cada categoría para guardar un corte.');
          },
          onError: (event: { data: number }) => {
            if (!mounted) return;
            const msgs: Record<number, string> = { 2: 'ID de vídeo no válido.', 100: 'El vídeo no está disponible.', 101: 'Reproducción restringida en sitios externos.', 150: 'Reproducción restringida en sitios externos.' };
            const msg = msgs[event.data] || 'No se pudo reproducir el vídeo.';
            setPlayerReady(false);
            setPlayerError(`${msg} (Código ${event.data})`);
            setStatusMessage(`${msg} (Código ${event.data})`);
          },
        },
      });
    }).catch(() => {
      if (!mounted) return;
      setPlayerError('No se pudo cargar el reproductor de YouTube.');
    });
    return () => { mounted = false; };
  }, [videoId]);

  // Poll current time every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoMode === 'file' && localVideoRef.current) {
        lastKnownTimeRef.current = localVideoRef.current.currentTime;
      } else {
        const t = ytPlayerRef.current?.getCurrentTime?.();
        if (t != null && !Number.isNaN(t)) lastKnownTimeRef.current = t;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [videoMode]);

  // Fullscreen detection
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const toggleFullscreen = () => {
    const el = videoContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.() ?? (el as any).webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.altKey) return;
      const combo = normalizeKey(e);
      if (!combo) return;
      const category = categoriesRef.current.find((c) => c.shortcut === combo);
      if (!category) return;
      e.preventDefault();
      const time = videoMode === 'file' && localVideoRef.current
        ? localVideoRef.current.currentTime
        : (() => { const t = ytPlayerRef.current?.getCurrentTime?.(); return (t != null && !Number.isNaN(t)) ? t : lastKnownTimeRef.current; })();
      const end = Math.floor(time);
      const start = Math.max(0, end - 20);
      const cut: Cut = {
        id: `${category.id}-${Date.now()}`,
        categoryId: category.id,
        label: `${category.label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        start, end,
        createdAt: new Date().toISOString(),
      };
      setCuts((prev) => {
        const updated = [cut, ...prev];
        try {
          const stored = JSON.parse(localStorage.getItem('analisis_cuts') || '{}');
          stored[category.label] = [cut, ...(stored[category.label] || [])];
          localStorage.setItem('analisis_cuts', JSON.stringify(stored));
        } catch { /* ignore */ }
        return updated;
      });
      setStatusMessage(`Corte guardado en ${category.label}: ${start}s → ${end}s`);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoMode]);

  // Cleanup player on unmount
  useEffect(() => () => { ytPlayerRef.current?.destroy?.(); }, []);

  const createCutForCategory = (categoryId: string) => {
    const category = categoriesRef.current.find((c) => c.id === categoryId);
    if (!category) return;
    const time = videoMode === 'file' && localVideoRef.current
      ? localVideoRef.current.currentTime
      : (() => { const t = ytPlayerRef.current?.getCurrentTime?.(); return (t != null && !Number.isNaN(t)) ? t : lastKnownTimeRef.current; })();
    const end = Math.floor(time);
    const start = Math.max(0, end - 20);
    const cut: Cut = {
      id: `${categoryId}-${Date.now()}`,
      categoryId,
      label: `${category.label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      start, end,
      createdAt: new Date().toISOString(),
    };
    setCuts((prev) => {
      const updated = [cut, ...prev];
      try {
        const stored = JSON.parse(localStorage.getItem('analisis_cuts') || '{}');
        stored[category.label] = [cut, ...(stored[category.label] || [])];
        localStorage.setItem('analisis_cuts', JSON.stringify(stored));
      } catch { /* ignore */ }
      return updated;
    });
    setStatusMessage(`Corte guardado en ${category.label}: ${start}s → ${end}s`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localVideoSrc) URL.revokeObjectURL(localVideoSrc);
    const src = URL.createObjectURL(file);
    setLocalVideoSrc(src);
    setPlayerReady(true);
    setStatusMessage(`Vídeo cargado: ${file.name}`);
    saveFileToIDB(file);
  };

  const handleLoadVideo = () => {
    const id = extractYouTubeVideoId(videoUrl);
    if (!id) { setStatusMessage('Introduce una URL de YouTube válida.'); setVideoId(null); setPlayerError(''); return; }
    setVideoId(id); setPlayerReady(false); setPlayerError(''); setStatusMessage('Cargando vídeo...');
  };

  const handleLoadExampleVideo = () => {
    const url = `https://www.youtube.com/watch?v=${EXAMPLE_VIDEO_ID}`;
    setVideoUrl(url); setVideoId(EXAMPLE_VIDEO_ID); setPlayerReady(false); setPlayerError(''); setStatusMessage('Cargando vídeo de prueba...');
  };

  const handleAddCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    const newCat: Category = { id: label.toLowerCase().replace(/\s+/g, '-'), label, shortcut: '' };
    setCategories((prev) => [...prev, newCat]);
    setSelectedCategoryId(newCat.id);
    setNewCategoryLabel('');
    setStatusMessage(`Categoría creada: ${label}`);
  };

  const handleShortcutSave = (categoryId: string, value: string) => {
    const conflict = categories.find((c) => c.id !== categoryId && c.shortcut === value && value !== '');
    if (conflict) { setStatusMessage(`El atajo «${value}» ya está en uso por «${conflict.label}».`); return; }
    setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, shortcut: value } : c));
    setEditingShortcutId(null);
    setStatusMessage(value ? `Atajo «${value}» asignado.` : 'Atajo eliminado.');
  };

  const handleDeleteCut = (cut: Cut, categoryLabel: string) => {
    setCuts((prev) => prev.filter((c) => c.id !== cut.id));
    try {
      const stored = JSON.parse(localStorage.getItem('analisis_cuts') || '{}');
      if (stored[categoryLabel]) {
        stored[categoryLabel] = stored[categoryLabel].filter((c: Cut) => c.id !== cut.id);
        localStorage.setItem('analisis_cuts', JSON.stringify(stored));
      }
    } catch { /* ignore */ }
  };

  const handlePlayCut = (cut: Cut) => {
    if (videoMode === 'file' && localVideoRef.current) {
      localVideoRef.current.currentTime = cut.start;
      localVideoRef.current.play();
      setStatusMessage(`Reproduciendo corte: ${cut.start}s → ${cut.end}s`);
      return;
    }
    if (!ytPlayerRef.current || !playerReady) { setStatusMessage('Carga primero un vídeo para reproducir el corte.'); return; }
    ytPlayerRef.current.seekTo(cut.start, true);
    ytPlayerRef.current.playVideo();
    setStatusMessage(`Reproduciendo corte: ${cut.start}s → ${cut.end}s`);
  };

  return (
    <section className={`page-section cortador-video-page${focusMode ? ' focus-mode' : ''}`}>
      <div className="page-title">
        <div>
          <div className="badge">HERRAMIENTA</div>
          <h1>Editor de vídeo propio</h1>
        </div>
        <button type="button" className={focusMode ? 'primary-button focus-toggle' : 'secondary-button focus-toggle'} onClick={() => {
          const next = !focusMode;
          setFocusMode(next);
          window.dispatchEvent(new CustomEvent('cortador-focus-mode', { detail: next }));
        }}>
          {focusMode ? '✕ Salir del modo foco' : '⛶ Modo foco'}
        </button>
      </div>

      <div className="editor-main-grid">
        <div className="card cortador-card">
        <div className="section-header">
          <div>
            <small>Vídeo propio</small>
            <h2>Inserta el vídeo que quieras cortar</h2>
          </div>
        </div>
        <div className="video-form">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
            <button type="button" className={videoMode === 'url' ? 'primary-button' : 'secondary-button'} onClick={() => { setVideoMode('url'); setLocalVideoSrc(null); }}>URL de YouTube</button>
            <button type="button" className={videoMode === 'file' ? 'primary-button' : 'secondary-button'} onClick={() => { setVideoMode('file'); setVideoId(null); ytPlayerRef.current?.destroy?.(); }}>Archivo local</button>
          </div>
          {videoMode === 'url' ? (
            <>
              <input type="text" value={videoUrl} placeholder="https://www.youtube.com/watch?v=..." onChange={(e) => setVideoUrl(e.target.value)} />
              <div className="video-form-actions">
                <button className="primary-button" type="button" onClick={handleLoadVideo}>Cargar vídeo</button>
                <button className="secondary-button" type="button" onClick={handleLoadExampleVideo}>Cargar vídeo de prueba</button>
              </div>
            </>
          ) : (
            <input type="file" accept="video/*" onChange={handleFileChange} style={{ color: '#f4f7ff' }} />
          )}
        </div>
        <div className="video-wrapper" ref={videoContainerRef}>
          {videoMode === 'url' && !videoId && <div className="video-placeholder"><p>Introduce una URL de YouTube y pulsa «Cargar vídeo».</p></div>}
          {videoMode === 'url' && videoId && !playerError && <div ref={playerRef} className="video-embed" />}
          {videoMode === 'url' && videoId && playerError && (
            <div className="video-error-fallback">
              <p>{playerError}</p>
              <p>El vídeo puede estar bloqueado para reproducirse en sitios externos.</p>
              <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">Ver vídeo en YouTube</a>
            </div>
          )}
          {videoMode === 'file' && !localVideoSrc && <div className="video-placeholder"><p>Selecciona un archivo de vídeo para cargarlo.</p></div>}
          {videoMode === 'file' && localVideoSrc && (
            <video ref={localVideoRef} src={localVideoSrc} controls style={{ width: '100%', display: 'block' }} />
          )}
          {(videoId || localVideoSrc) && (
            <button type="button" className="fullscreen-btn" onClick={toggleFullscreen} title="Pantalla completa">
              {isFullscreen ? '✕ Salir' : '⛶ Pantalla completa'}
            </button>
          )}
          {isFullscreen && (
            <div className="fullscreen-overlay">
              {categories.map((cat) => (
                <button key={cat.id} type="button" className="fullscreen-cut-btn" onClick={() => createCutForCategory(cat.id)}>
                  <span className="fsc-label">{cat.label}</span>
                  {cat.shortcut && <span className="fsc-shortcut">{cat.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="video-helpers">
          <p>Pulsa cualquier categoría de la botonera para guardar un corte de los últimos 20 segundos, o usa los atajos de teclado asignados.</p>
          {statusMessage && <p className="status-text">{statusMessage}</p>}
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div>
            <small>Categorías</small>
            <h2>Botonera</h2>
          </div>
        </div>
        <div className="category-toolbar">
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={category.id === selectedCategoryId ? 'category-button selected' : 'category-button'}
              onClick={() => { setSelectedCategoryId(category.id); createCutForCategory(category.id); }}
            >
              <span>{category.label}</span>
              {editingShortcutId === category.id ? (
                <div className="shortcut-edit" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    readOnly
                    placeholder="Ctrl/Alt + tecla..."
                    value={editingShortcutValue}
                    onKeyDown={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      if (e.key === 'Escape') { setEditingShortcutId(null); return; }
                      if (e.key === 'Backspace' || e.key === 'Delete') { handleShortcutSave(category.id, ''); return; }
                      const combo = normalizeKey(e.nativeEvent);
                      if (combo && (e.ctrlKey || e.altKey)) { setEditingShortcutValue(combo); handleShortcutSave(category.id, combo); }
                    }}
                  />
                </div>
              ) : (
                <small
                  className="shortcut-label"
                  title="Haz clic para editar el atajo"
                  onClick={(e) => { e.stopPropagation(); setEditingShortcutId(category.id); setEditingShortcutValue(category.shortcut); }}
                >
                  {category.shortcut || 'sin atajo · editar'}
                </small>
              )}
            </button>
          ))}
        </div>
        <div className="category-add">
          <input
            type="text"
            placeholder="Nueva categoría"
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
          />
          <button type="button" className="secondary-button" onClick={handleAddCategory}>Añadir categoría</button>
        </div>
      </div>
      </div>

      <div className="card cortes-card">
        <div className="section-header">
          <div>
            <small>Cortes guardados</small>
            <h2>Historial por categoría</h2>
          </div>
        </div>
        <div className="cuts-list">
          {groupedCuts.map(({ category, cuts: categoryCuts }) => (
            <div key={category.id} className="cut-group">
              <div className="cut-group-header">
                <h3>{category.label}</h3>
                <span className="badge">{categoryCuts.length}</span>
              </div>
              {categoryCuts.length === 0 ? (
                <p className="empty-text">No hay cortes guardados en esta categoría.</p>
              ) : (
                <div className="cut-items">
                  {categoryCuts.map((cut) => (
                    <div key={cut.id} className="cut-item">
                      <div>
                        <strong>{cut.label}</strong>
                        <p>{cut.start}s → {cut.end}s</p>
                      </div>
                      <div className="cut-item-actions">
                        <button type="button" className="secondary-button" onClick={() => handlePlayCut(cut)}>Reproducir</button>
                        <button type="button" className="delete-button" onClick={() => handleDeleteCut(cut, category.label)}>Borrar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

export default CortadorDeVideo;
