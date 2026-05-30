import { useEffect, useMemo, useRef, useState } from 'react';
import './CortadorDeVideo.css';
import { usePlantilla } from '../lib/usePlantilla';
import { useSharedState } from '../lib/useSharedState';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Category = { id: string; label: string; shortcut: string };
type Annotation = any;
type Cut = { id: string; categoryId: string; label: string; start: number; end: number; createdAt: string; player_id?: string | null; annotations?: Annotation[] };
type SavedState = { videoMode: VideoMode };
type VideoMode = 'url' | 'file';

const STORAGE_KEY = 'mi_club_cortador_video_v1';
const IDB_NAME = 'mi_club_video_propio';
const IDB_STORE = 'files';
const IDB_KEY = 'local_video';
const EXAMPLE_VIDEO_ID = 'M7lc1UVf-VE';

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

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${String(hrs)}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function loadState(): SavedState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {} as SavedState; }
}

function CortadorDeVideo() {
  const jugadores = usePlantilla();
  const [sharedVideoUrl, setSharedVideoUrl, loadingUrl] = useSharedState<string>('analisis_main_video', '');
  const [sharedCuts, setSharedCuts, loadingCuts] = useSharedState<Cut[]>('analisis_cuts', []);
  const [sharedCategories, setSharedCategories, loadingCats] = useSharedState<Category[]>('cortador_propio_categories', DEFAULT_CATEGORIES);
  const sharedLoading = loadingUrl || loadingCuts || loadingCats;

  const saved = useMemo(loadState, []);
  const [videoMode, setVideoMode] = useState<VideoMode>(saved.videoMode || 'url');
  const [videoUrl, setVideoUrlState] = useState<string>('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [categories, setCategoriesState] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [cuts, setCutsState] = useState<Cut[]>([]);

  const sharedLoadedRef = useRef(false);
  useEffect(() => {
    if (sharedLoading || sharedLoadedRef.current) return;
    sharedLoadedRef.current = true;
    if (sharedVideoUrl) {
      setVideoUrlState(sharedVideoUrl);
      const id = extractYouTubeVideoId(sharedVideoUrl);
      if (id) setVideoId(id);
    }
    if (sharedCuts.length) setCutsState(sharedCuts);
    if (sharedCategories.length) setCategoriesState(sharedCategories);
  }, [sharedLoading, sharedVideoUrl, sharedCuts, sharedCategories]);

  const setVideoUrl = (v: string) => { setVideoUrlState(v); setSharedVideoUrl(v); };
  const setCuts = (fn: Cut[] | ((prev: Cut[]) => Cut[])) => {
    setCutsState(prev => {
      const next = typeof fn === 'function' ? (fn as (prev: Cut[]) => Cut[])(prev) : fn;
      setSharedCuts(next);
      return next;
    });
  };
  const setCategories = (fn: Category[] | ((prev: Category[]) => Category[])) => {
    setCategoriesState(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      setSharedCategories(next);
      return next;
    });
  };

  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(DEFAULT_CATEGORIES[0].id);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [editingShortcutValue, setEditingShortcutValue] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [fullscreenTime, setFullscreenTime] = useState(0);
  const [fullscreenDuration, setFullscreenDuration] = useState(0);

  // Annotations while editing
  const [editingAnnotations, setEditingAnnotations] = useState<Annotation[]>([]);
  const [annotationMode, setAnnotationMode] = useState<'none'|'spot'|'arrow'|'arrow-dashed'|'text'>('none');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotationTempRef = useRef<any>(null);
  const [editingCutId, setEditingCutId] = useState<string | null>(null);
  const [editStartValue, setEditStartValue] = useState<number | null>(null);
  const [editEndValue, setEditEndValue] = useState<number | null>(null);
  const [cutName, setCutName] = useState('');
  const [previewCutId, setPreviewCutId] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const playerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastKnownTimeRef = useRef<number>(0);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  const categoriesRef = useRef(categories);
  const playerReadyRef = useRef(playerReady);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { playerReadyRef.current = playerReady; }, [playerReady]);

  const groupedCuts = useMemo(() =>
    categories.map((category) => ({ category, cuts: cuts.filter((c) => c.categoryId === category.id) })),
    [categories, cuts]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ videoMode }));
  }, [videoMode]);

  useEffect(() => {
    if (saved.videoMode !== 'file') return;
    loadFileFromIDB().then((file) => {
      if (!file) return;
      const src = URL.createObjectURL(file);
      setLocalVideoSrc(src);
      setPlayerReady(true);
      setStatusMessage(`Vídeo cargado: ${file.name}`);
    });
  }, []);

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
  }, [videoId, videoMode]);

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

  // Update fullscreen time/duration when entering fullscreen
  useEffect(() => {
    let mounted = true;
    if (!isFullscreen) return;
    const update = () => {
      if (!mounted) return;
      const dur = getVideoDuration();
      const cur = videoMode === 'file' && localVideoRef.current ? localVideoRef.current.currentTime : (ytPlayerRef.current?.getCurrentTime?.() ?? lastKnownTimeRef.current);
      setFullscreenDuration(dur);
      setFullscreenTime(cur || 0);
    };
    update();
    const iv = setInterval(update, 300);
    return () => { mounted = false; clearInterval(iv); };
  }, [isFullscreen, videoMode]);

  const seekToTime = (t: number) => {
    if (videoMode === 'file' && localVideoRef.current) {
      localVideoRef.current.currentTime = t;
      return;
    }
    if (ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(t, true);
    }
  };

  // Canvas drawing for annotations (simple implementation)
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = cvs.clientWidth * dpr;
    cvs.height = cvs.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    // clear
    ctx.clearRect(0, 0, cvs.clientWidth, cvs.clientHeight);
    // draw annotations
    editingAnnotations.forEach((a) => {
      if (a.type === 'spot') {
        ctx.beginPath(); ctx.strokeStyle = '#00ff8d'; ctx.lineWidth = 2; ctx.arc(a.x, a.y, 24, 0, Math.PI * 2); ctx.stroke();
      } else if (a.type === 'arrow' || a.type === 'arrow-dashed') {
        ctx.beginPath(); ctx.strokeStyle = '#00ff8d'; ctx.lineWidth = 3; if (a.type === 'arrow-dashed') ctx.setLineDash([8,6]);
        ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke(); ctx.setLineDash([]);
        // arrow head
        const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
        ctx.beginPath(); ctx.fillStyle = '#00ff8d'; ctx.moveTo(a.x2, a.y2); ctx.lineTo(a.x2 - 12*Math.cos(ang - 0.3), a.y2 - 12*Math.sin(ang - 0.3)); ctx.lineTo(a.x2 - 12*Math.cos(ang + 0.3), a.y2 - 12*Math.sin(ang + 0.3)); ctx.fill();
      } else if (a.type === 'text') {
        ctx.fillStyle = '#00ff8d'; ctx.font = '14px sans-serif'; ctx.fillText(a.text || '', a.x, a.y);
      }
    });
  }, [editingAnnotations]);

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
        label: cutName.trim() || `${category.label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        start, end,
        createdAt: new Date().toISOString(),
        player_id: null,
      };
      setCuts((prev) => [cut, ...prev]);
      setStatusMessage(`Corte guardado en ${category.label}: ${formatDuration(start)} → ${formatDuration(end)}`);
      setCutName('');
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoMode]);

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
      categoryId: categoryId,
      label: cutName.trim() || `${category.label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      start,
      end,
      createdAt: new Date().toISOString(),
      player_id: null,
    };

    setCuts(prev => [cut, ...prev]);
    setStatusMessage(`Corte guardado en ${category.label}: ${formatDuration(start)} → ${formatDuration(end)}`);
    setCutName('');
  };

  const handleAssignPlayer = (cutId: string, playerId: string | null) => {
    setCuts(prev => prev.map(c => c.id === cutId ? { ...c, player_id: playerId } : c));
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

  const handleDeleteCut = (cut: Cut, _categoryLabel: string) => {
    setCuts((prev) => prev.filter((c) => c.id !== cut.id));
  };

  const getVideoDuration = () => {
    if (videoMode === 'file' && localVideoRef.current) return localVideoRef.current.duration || 0;
    if (ytPlayerRef.current && typeof ytPlayerRef.current.getDuration === 'function') return ytPlayerRef.current.getDuration() || 0;
    return 0;
  };

  const handlePlayCut = (cut: Cut) => {
    if (videoMode === 'file' && localVideoRef.current) {
      localVideoRef.current.currentTime = cut.start;
      localVideoRef.current.play();
      setStatusMessage(`Reproduciendo corte: ${formatDuration(cut.start)} → ${formatDuration(cut.end)}`);
      return;
    }
    if (!ytPlayerRef.current || !playerReady) { setStatusMessage('Carga primero un vídeo para reproducir el corte.'); return; }
    ytPlayerRef.current.seekTo(cut.start, true);
    ytPlayerRef.current.playVideo();
    setStatusMessage(`Reproduciendo corte: ${formatDuration(cut.start)} → ${formatDuration(cut.end)}`);
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
              <div className="fullscreen-timeline" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: '#fff', fontSize: 12 }}>{formatDuration(fullscreenTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, fullscreenDuration)}
                  step={0.1}
                  value={Math.max(0, Math.min(fullscreenTime, fullscreenDuration || 0))}
                  onChange={(e) => seekToTime(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ color: '#fff', fontSize: 12 }}>{formatDuration(fullscreenDuration)}</span>
              </div>
              {categories.map((cat) => (
                <button key={cat.id} type="button" className="fullscreen-cut-btn" onClick={() => createCutForCategory(cat.id)} style={{ padding: '6px 8px', fontSize: '12px', minWidth: 100 }}>
                  <span className="fsc-label">{cat.label}</span>
                  {cat.shortcut && <span className="fsc-shortcut">{cat.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="video-form" style={{ marginTop: 12 }}>
          <label style={{ color: '#d1d5db', marginBottom: 6 }}>Nombre del corte</label>
          <input
            type="text"
            value={cutName}
            placeholder="Pon un nombre descriptivo al corte..."
            onChange={(e) => setCutName(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc' }}
          />
        </div>
        <div className="video-helpers">
          <p>Pulsa cualquier categoría de la botonera para guardar un corte. El nombre se conservará y aparecerá como miniatura.</p>
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
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setPreviewCutId(previewCutId === cut.id ? null : cut.id)}
                            style={{ padding: 0, minWidth: 180, minHeight: 100, borderRadius: 12, overflow: 'hidden', position: 'relative', textAlign: 'left' }}
                          >
                            {videoMode === 'url' && videoId ? (
                              <img
                                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                                alt="Miniatura del corte"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827', color: '#9ca3af' }}>
                                <span>Vídeo local</span>
                              </div>
                            )}
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ width: 42, height: 42, background: 'rgba(0,0,0,0.6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ color: '#fff', fontSize: 18, marginLeft: 3 }}>▶</span>
                              </div>
                            </div>
                          </button>
                          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '0.35rem' }}>
                            <input
                              type="text"
                              value={cut.label}
                              onChange={(e) => setCuts((prev) => prev.map((c) => c.id === cut.id ? { ...c, label: e.target.value } : c))}
                              style={{ width: '100%', background: '#111827', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem', color: '#fff' }}
                            />
                            <p style={{ margin: 0 }}>{formatDuration(cut.start)} → {formatDuration(cut.end)}</p>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <strong style={{ color: '#fff' }}>Anotar:</strong>
                            <button type="button" className={annotationMode === 'spot' ? 'primary-button' : 'secondary-button'} onClick={() => setAnnotationMode(annotationMode === 'spot' ? 'none' : 'spot')}>Foco</button>
                            <button type="button" className={annotationMode === 'arrow' ? 'primary-button' : 'secondary-button'} onClick={() => setAnnotationMode(annotationMode === 'arrow' ? 'none' : 'arrow')}>Flecha</button>
                            <button type="button" className={annotationMode === 'arrow-dashed' ? 'primary-button' : 'secondary-button'} onClick={() => setAnnotationMode(annotationMode === 'arrow-dashed' ? 'none' : 'arrow-dashed')}>Flecha discont.</button>
                            <button type="button" className={annotationMode === 'text' ? 'primary-button' : 'secondary-button'} onClick={() => setAnnotationMode(annotationMode === 'text' ? 'none' : 'text')}>Texto</button>
                            <button type="button" className="secondary-button" onClick={() => setEditingAnnotations([])}>Borrar anotaciones</button>
                          </div>
                          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#071025' }}>
                            <canvas ref={canvasRef} style={{ width: '100%', height: 180, display: 'block', cursor: annotationMode === 'none' ? 'default' : 'crosshair' }} onClick={(e) => {
                              if (annotationMode === 'none') return;
                              const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const y = e.clientY - rect.top;
                              if (annotationMode === 'spot') {
                                setEditingAnnotations(a => [...a, { type: 'spot', x, y }]);
                              } else if (annotationMode === 'text') {
                                const txt = prompt('Texto de anotación (breve):');
                                if (txt) setEditingAnnotations(a => [...a, { type: 'text', x, y, text: txt }]);
                              } else if (annotationMode === 'arrow' || annotationMode === 'arrow-dashed') {
                                if (!annotationTempRef.current) {
                                  annotationTempRef.current = { x1: x, y1: y };
                                } else {
                                  const start = annotationTempRef.current;
                                  setEditingAnnotations(a => [...a, { type: annotationMode, x1: start.x1, y1: start.y1, x2: x, y2: y }]);
                                  annotationTempRef.current = null;
                                }
                              }
                            }} />
                          </div>
                        </div>
                      </div>
                      <div className="cut-item-actions">
                        <button type="button" className="secondary-button" onClick={() => setPreviewCutId(previewCutId === cut.id ? null : cut.id)}>
                          {previewCutId === cut.id ? 'Ocultar vista previa' : 'Ver corte'}
                        </button>
                        <select
                          value={cut.player_id ?? ''}
                          onChange={e => handleAssignPlayer(cut.id, e.target.value || null)}
                          title="Asignar a jugador"
                        >
                          <option value="">Toda la plantilla</option>
                          {jugadores.map((j: any) => (
                            <option key={j.id} value={j.id}>{j.nombre}</option>
                          ))}
                        </select>
                        <button type="button" className="secondary-button" onClick={() => handlePlayCut(cut)}>Reproducir</button>
                        <button type="button" className="secondary-button" onClick={() => { setEditingCutId(cut.id); setEditStartValue(cut.start); setEditEndValue(cut.end); setEditingAnnotations(cut.annotations || []); }}>Editar</button>
                        <button type="button" className="delete-button" onClick={() => handleDeleteCut(cut, category.label)}>Borrar</button>
                      </div>                      {previewCutId === cut.id && (
                        <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', background: '#0b1220', padding: 10 }}>
                          {videoMode === 'url' && videoId && (
                            <iframe
                              title={`Preview ${cut.id}`}
                              src={`${extractYouTubeVideoId(videoUrl) ? `https://www.youtube.com/embed/${extractYouTubeVideoId(videoUrl)}?start=${Math.floor(cut.start)}&end=${Math.floor(cut.end)}&rel=0` : ''}`}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              style={{ width: '100%', height: 200, borderRadius: 8 }}
                            />
                          )}
                          {videoMode === 'file' && localVideoSrc && (
                            <video
                              ref={previewVideoRef}
                              src={localVideoSrc}
                              controls
                              onLoadedMetadata={() => {
                                if (previewVideoRef.current) previewVideoRef.current.currentTime = cut.start;
                              }}
                              style={{ width: '100%', display: 'block', borderRadius: 8 }}
                            />
                          )}
                        </div>
                      )}                    </div>
                  ))}
                </div>
              )}

              {editingCutId && (
                (() => {
                  const c = cuts.find((x) => x.id === editingCutId);
                  if (!c) return null;
                  const duration = getVideoDuration() || Math.max(c.end + 5, 60);
                  const min = 0;
                  const max = Math.ceil(duration);
                  const start = editStartValue ?? c.start;
                  const end = editEndValue ?? c.end;
                  return (
                    <div style={{ marginTop: 8, padding: '0.5rem', background: '#0f172a', borderRadius: 8 }}>
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ color: '#fff', minWidth: 70 }}>Inicio (s)</label>
                          <input type="number" value={start} onChange={(e) => setEditStartValue(Number(e.target.value) || 0)} style={{ width: 100 }} />
                          <label style={{ color: '#fff', minWidth: 50 }}>Fin (s)</label>
                          <input type="number" value={end} onChange={(e) => setEditEndValue(Number(e.target.value) || 0)} style={{ width: 100 }} />
                        </div>

                        <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Arrastra las barras para ajustar Inico/Fin (doble control).</div>

                        <div className="timeline-editor" style={{ display: 'grid', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#d1d5db', fontSize: '0.95rem' }}>
                            <span>Inicio: {formatDuration(start)}</span>
                            <span>Fin: {formatDuration(end)}</span>
                          </div>
                          <input type="range" min={min} max={max} step={0.1} value={start} onChange={(e) => {
                            const v = Number(e.target.value);
                            const newStart = Math.min(v, (editEndValue ?? end) - 0.5);
                            setEditStartValue(Number(newStart.toFixed(2)));
                          }} />
                          <input type="range" min={min} max={max} step={0.1} value={end} onChange={(e) => {
                            const v = Number(e.target.value);
                            const newEnd = Math.max(v, (editStartValue ?? start) + 0.5);
                            setEditEndValue(Number(newEnd.toFixed(2)));
                          }} />
                        </div>

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" className="primary-button" onClick={() => {
                            if (editStartValue == null || editEndValue == null) return;
                            const s = Math.max(0, Math.min(editStartValue, editEndValue - 0.1));
                            const e = Math.max(s + 0.1, editEndValue);
                            const editedId = editingCutId;
                            setCuts(prev => prev.map(x => x.id === editedId ? { ...x, start: Number(s.toFixed(2)), end: Number(e.toFixed(2)), annotations: editingAnnotations } : x));
                            setEditingCutId(null); setEditStartValue(null); setEditEndValue(null);
                            // refresh preview immediately
                            if (editedId) {
                              setPreviewCutId(null);
                              setTimeout(() => setPreviewCutId(editedId), 50);
                            }
                          }}>Guardar</button>
                          <button type="button" className="secondary-button" onClick={() => { setEditingCutId(null); setEditStartValue(null); setEditEndValue(null); }}>Cancelar</button>
                          <button type="button" className="secondary-button" onClick={() => {
                            // Play preview between start and end
                            if (videoMode === 'file' && localVideoRef.current) {
                              localVideoRef.current.currentTime = start;
                              localVideoRef.current.play();
                              setStatusMessage(`Vista previa: ${formatDuration(start)} → ${formatDuration(end)}`);
                              const t = setTimeout(() => { localVideoRef.current?.pause(); clearTimeout(t); }, Math.max(1000, (end - start) * 1000));
                              return;
                            }
                            if (ytPlayerRef.current && playerReady) {
                              ytPlayerRef.current.seekTo(start, true);
                              ytPlayerRef.current.playVideo();
                              setStatusMessage(`Vista previa: ${formatDuration(start)} → ${formatDuration(end)}`);
                              const t2 = setTimeout(() => { ytPlayerRef.current.pauseVideo?.(); clearTimeout(t2); }, Math.max(1000, (end - start) * 1000));
                            }
                          }}>Vista previa</button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

export default CortadorDeVideo;
