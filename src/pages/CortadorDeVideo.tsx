import { useEffect, useMemo, useRef, useState } from 'react';
import './CortadorDeVideo.css';
import { usePlantilla } from '../lib/usePlantilla';
import { useSharedState } from '../lib/useSharedState';
import { supabase } from '../lib/supabaseClient';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Category = { id: string; label: string; shortcut: string };
type Annotation = any;
type Cut = { id: string; categoryId: string; label: string; start: number; end: number; createdAt: string; player_id?: string | null; player_ids?: string[] | null; annotations?: Annotation[] };
type SavedState = { videoMode: VideoMode };

const getCutPlayerIds = (cut: Cut): string[] | null => {
  if (cut.player_ids && cut.player_ids.length > 0) return cut.player_ids;
  if (cut.player_id) return [cut.player_id];
  return null;
};
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

function parseDuration(input: string): number {
  if (!input) return 0;
  input = input.trim();
  if (/^\d+$/.test(input)) return Number(input);
  const parts = input.split(':').map(p => p.trim()).filter(Boolean).map(Number).reverse();
  let secs = 0;
  if (parts[0]) secs += parts[0];
  if (parts[1]) secs += parts[1] * 60;
  if (parts[2]) secs += parts[2] * 3600;
  return secs;
}

function loadState(): SavedState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {} as SavedState; }
}

type MatchInfo = { id: string; name: string; createdAt: string };

const MATCHES_KEY = 'cortador_propio_matches';
const ACTIVE_MATCH_LOCAL_KEY = 'cortador_propio_active_match_id';

function loadActiveMatchId(): string {
  try { return localStorage.getItem(ACTIVE_MATCH_LOCAL_KEY) || ''; } catch { return ''; }
}

function CortadorDeVideo() {
  const jugadores = usePlantilla();
  const [matches, setMatches] = useSharedState<MatchInfo[]>(MATCHES_KEY, []);
  const [activeMatchId, setActiveMatchId] = useState<string>(loadActiveMatchId);
  const [newMatchName, setNewMatchName] = useState('');
  const [renamingMatchId, setRenamingMatchId] = useState<string | null>(null);
  const [renameMatchValue, setRenameMatchValue] = useState('');

  const videoStateKey = activeMatchId ? `analisis_main_video_match_${activeMatchId}` : 'analisis_main_video';
  const cutsStateKey = activeMatchId ? `analisis_cuts_match_${activeMatchId}` : 'analisis_cuts';
  // Refs siempre actualizadas: cualquier closure obsoleta (p.ej. un listener registrado antes de
  // cambiar de partido) debe guardar en el partido REALMENTE activo, nunca en el de cuando se creó
  // esa closure. Por eso persistCuts/persistVideoUrl leen `.current` en vez de recibir la key por parametro.
  const cutsStateKeyRef = useRef(cutsStateKey);
  cutsStateKeyRef.current = cutsStateKey;
  const videoStateKeyRef = useRef(videoStateKey);
  videoStateKeyRef.current = videoStateKey;

  const [sharedCategories, setSharedCategories, loadingCats] = useSharedState<Category[]>('cortador_propio_categories', DEFAULT_CATEGORIES);

  // Debounce independiente por key (en vez de reutilizar el ref interno de useSharedState, que es
  // compartido entre partidos al ser la misma instancia de hook) para que un guardado pendiente de
  // un partido nunca cancele ni se mezcle con el de otro.
  const saveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persistValue = (key: string, value: unknown) => {
    if (saveTimeoutsRef.current[key]) clearTimeout(saveTimeoutsRef.current[key]);
    saveTimeoutsRef.current[key] = setTimeout(() => {
      delete saveTimeoutsRef.current[key];
      supabase.from('shared_state')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .then(({ error }) => { if (error) console.error('shared_state upsert error:', key, error); });
    }, 500);
  };

  const saved = useMemo(loadState, []);
  const [videoMode, setVideoMode] = useState<VideoMode>(saved.videoMode || 'url');
  const [videoUrl, setVideoUrlState] = useState<string>('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [categories, setCategoriesState] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [cuts, setCutsState] = useState<Cut[]>([]);

  // Se hace fetch directo (en vez de depender del valor leido por useSharedState) para evitar
  // condiciones de carrera al cambiar de partido: useSharedState no resetea su valor de forma
  // sincronizada con el cambio de key, así que un partido nuevo podía heredar momentáneamente
  // los cortes del partido anterior.
  useEffect(() => {
    let cancelled = false;
    setCutsState([]);
    setVideoUrlState('');
    setVideoId(null);

    Promise.all([
      supabase.from('shared_state').select('value').eq('key', videoStateKey).maybeSingle(),
      supabase.from('shared_state').select('value').eq('key', cutsStateKey).maybeSingle(),
    ]).then(([videoRes, cutsRes]) => {
      if (cancelled) return;
      const url = typeof videoRes.data?.value === 'string' ? videoRes.data.value : '';
      setVideoUrlState(url);
      setVideoId(url ? extractYouTubeVideoId(url) : null);
      setCutsState(Array.isArray(cutsRes.data?.value) ? (cutsRes.data.value as Cut[]) : []);
    });

    return () => { cancelled = true; };
  }, [videoStateKey, cutsStateKey]);

  useEffect(() => {
    if (!loadingCats && sharedCategories.length) setCategoriesState(sharedCategories);
  }, [loadingCats, sharedCategories]);

  const handleSelectMatch = (id: string) => {
    setActiveMatchId(id);
    try { localStorage.setItem(ACTIVE_MATCH_LOCAL_KEY, id); } catch { /* ignore */ }
  };

  const handleCreateMatch = () => {
    const name = newMatchName.trim();
    if (!name) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newMatch: MatchInfo = { id, name, createdAt: new Date().toISOString() };
    setMatches((prev) => [newMatch, ...prev]);
    setNewMatchName('');
    handleSelectMatch(id);
  };

  const handleDeleteMatch = (id: string) => {
    const match = matches.find((m) => m.id === id);
    if (!match) return;
    const confirmed = window.confirm(`¿Eliminar el partido «${match.name}» de la lista? (los cortes guardados no se podrán volver a abrir desde el desplegable)`);
    if (!confirmed) return;
    setMatches((prev) => prev.filter((m) => m.id !== id));
    if (activeMatchId === id) handleSelectMatch('');
  };

  const handleStartRenameMatch = (id: string) => {
    const match = matches.find((m) => m.id === id);
    if (!match) return;
    setRenamingMatchId(id);
    setRenameMatchValue(match.name);
  };

  const handleCancelRenameMatch = () => {
    setRenamingMatchId(null);
    setRenameMatchValue('');
  };

  const handleSaveRenameMatch = () => {
    const name = renameMatchValue.trim();
    if (!name || !renamingMatchId) { handleCancelRenameMatch(); return; }
    const id = renamingMatchId;
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)));
    handleCancelRenameMatch();
  };

  const setVideoUrl = (v: string) => { setVideoUrlState(v); persistValue(videoStateKeyRef.current, v); };
  const setCuts = (fn: Cut[] | ((prev: Cut[]) => Cut[])) => {
    setCutsState(prev => {
      const next = typeof fn === 'function' ? (fn as (prev: Cut[]) => Cut[])(prev) : fn;
      persistValue(cutsStateKeyRef.current, next);
      return next;
    });
  };
  // Referencia siempre actualizada: el listener de atajos de teclado solo se vuelve a registrar
  // cuando cambia videoMode, así que debe leer setCuts/cutName por ref para no escribir cortes
  // en la key del partido anterior tras cambiar de partido sin tocar el modo de vídeo.
  const setCutsRef = useRef(setCuts);
  setCutsRef.current = setCuts;
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
  const [tempAnnotation, setTempAnnotation] = useState<any>(null);
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState<number | null>(null);
  const [editingCutId, setEditingCutId] = useState<string | null>(null);
  const [editStartValue, setEditStartValue] = useState<number | null>(null);
  const [editEndValue, setEditEndValue] = useState<number | null>(null);
  const [cutName, setCutName] = useState('');
  const cutNameRef = useRef(cutName);
  cutNameRef.current = cutName;
  const [fullscreenPreviewId, setFullscreenPreviewId] = useState<string | null>(null);
  const [playingCutId, setPlayingCutId] = useState<string | null>(null);
  const [cutPlayToken, setCutPlayToken] = useState<Record<string, number>>({});
  const [playbackRate, setPlaybackRate] = useState(1);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeCutRef = useRef<Cut | null>(null);

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

  const seekBy = (delta: number) => {
    const cur = videoMode === 'file' && localVideoRef.current
      ? localVideoRef.current.currentTime
      : (ytPlayerRef.current?.getCurrentTime?.() ?? lastKnownTimeRef.current);
    seekToTime(Math.max(0, (cur || 0) + delta));
  };

  const changePlaybackRate = (rate: number) => {
    const nextRate = playbackRate === rate ? 1 : rate;
    setPlaybackRate(nextRate);
    if (localVideoRef.current) localVideoRef.current.playbackRate = nextRate;
  };

  // Canvas drawing for annotations (simple implementation)
  // helper: hit-test annotations (returns index or -1)
  const hitTest = (x: number, y: number) => {
    for (let i = editingAnnotations.length - 1; i >= 0; i--) {
      const a = editingAnnotations[i];
      if (a.type === 'spot') {
        const dx = x - a.x; const dy = y - a.y;
        if (Math.sqrt(dx*dx + dy*dy) <= 24) return i;
      } else if (a.type === 'arrow' || a.type === 'arrow-dashed') {
        // distance to segment
        const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
        const A = x - x1, B = y - y1, C = x2 - x1, D = y2 - y1;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }
        const dx = x - xx; const dy = y - yy;
        if (Math.sqrt(dx*dx + dy*dy) <= 8) return i;
      } else if (a.type === 'text') {
        const dx = x - a.x; const dy = y - a.y;
        if (Math.sqrt(dx*dx + dy*dy) <= 16) return i;
      }
    }
    return -1;
  };

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
    // draw temporary annotation if present
    if (tempAnnotation) {
      const a = tempAnnotation;
      if (a.type === 'arrow' || a.type === 'arrow-dashed') {
        ctx.beginPath(); ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2; if (a.type === 'arrow-dashed') ctx.setLineDash([6,4]);
        ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke(); ctx.setLineDash([]);
      } else if (a.type === 'spot') {
        ctx.beginPath(); ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2; ctx.arc(a.x, a.y, 20, 0, Math.PI*2); ctx.stroke();
      }
    }
    // highlight selection
    if (selectedAnnotationIndex != null) {
      const s = editingAnnotations[selectedAnnotationIndex];
      if (s) {
        ctx.beginPath(); ctx.strokeStyle = '#ff66aa'; ctx.lineWidth = 2;
        if (s.type === 'spot') ctx.arc(s.x, s.y, 28, 0, Math.PI*2);
        else if (s.type === 'text') ctx.rect(s.x - 6, s.y - 16, 120, 22);
        else if (s.type === 'arrow' || s.type === 'arrow-dashed') ctx.rect(Math.min(s.x1, s.x2)-6, Math.min(s.y1, s.y2)-6, Math.abs(s.x2-s.x1)+12, Math.abs(s.y2-s.y1)+12);
        ctx.stroke();
      }
    }
  }, [editingAnnotations, tempAnnotation, selectedAnnotationIndex]);

  // pointer event handlers for canvas to allow dragging arrows
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    if (annotationMode === 'none') {
      const idx = hitTest(x, y);
      setSelectedAnnotationIndex(idx >= 0 ? idx : null);
      return;
    }
    if (annotationMode === 'spot') {
      setEditingAnnotations(a => [...a, { type: 'spot', x, y }]);
      return;
    }
    if (annotationMode === 'text') {
      const txt = prompt('Texto de anotación (breve):');
      if (txt) setEditingAnnotations(a => [...a, { type: 'text', x, y, text: txt }]);
      return;
    }
    if (annotationMode === 'arrow' || annotationMode === 'arrow-dashed') {
      annotationTempRef.current = { type: annotationMode, x1: x, y1: y, x2: x, y2: y };
      setTempAnnotation({ ...annotationTempRef.current });
      try { (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); } catch {}
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!annotationTempRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    annotationTempRef.current.x2 = e.clientX - rect.left;
    annotationTempRef.current.y2 = e.clientY - rect.top;
    setTempAnnotation({ ...annotationTempRef.current });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!annotationTempRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    setEditingAnnotations(a => [...a, { type: annotationTempRef.current.type, x1: annotationTempRef.current.x1, y1: annotationTempRef.current.y1, x2: x, y2: y }]);
    annotationTempRef.current = null;
    setTempAnnotation(null);
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {}
  };

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
      // Atajos de navegación: Ctrl+Alt+/  −20s | Ctrl+Alt+-  −10s | Ctrl+Alt++  +10s | Ctrl+Alt+*  +20s
      if (e.ctrlKey && e.altKey) {
        const seekDeltas: Record<string, number> = { '/': -20, '-': -10, '+': 10, '*': 20 };
        const delta = seekDeltas[e.key];
        if (delta !== undefined) {
          e.preventDefault();
          const cur = localVideoRef.current
            ? localVideoRef.current.currentTime
            : (ytPlayerRef.current?.getCurrentTime?.() ?? lastKnownTimeRef.current ?? 0);
          const newTime = Math.max(0, (cur || 0) + delta);
          if (localVideoRef.current) {
            localVideoRef.current.currentTime = newTime;
          } else if (ytPlayerRef.current) {
            ytPlayerRef.current.seekTo(newTime, true);
          }
          return;
        }
      }
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
        label: cutNameRef.current.trim() || `${category.label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        start, end,
        createdAt: new Date().toISOString(),
        player_id: null,
        player_ids: null,
      };
      setCutsRef.current((prev) => [cut, ...prev]);
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
      player_ids: null,
    };

    setCuts(prev => [cut, ...prev]);
    setStatusMessage(`Corte guardado en ${category.label}: ${formatDuration(start)} → ${formatDuration(end)}`);
    setCutName('');
  };

  const handleAssignPlayers = (cutId: string, playerIds: string[] | null) => {
    setCuts(prev => prev.map(c => c.id === cutId ? {
      ...c,
      player_ids: playerIds,
      player_id: playerIds && playerIds.length === 1 ? playerIds[0] : null,
    } : c));
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
    if (fullscreenPreviewId === cut.id) setFullscreenPreviewId(null);
  };

  const getVideoDuration = () => {
    if (videoMode === 'file' && localVideoRef.current) return localVideoRef.current.duration || 0;
    if (ytPlayerRef.current && typeof ytPlayerRef.current.getDuration === 'function') return ytPlayerRef.current.getDuration() || 0;
    return 0;
  };

  useEffect(() => {
    if (!playingCutId) return;
    const cut = cuts.find((c) => c.id === playingCutId);
    if (!cut) return;

    const checkEnd = () => {
      let currentTime: number | null = null;
      if (videoMode === 'file' && localVideoRef.current) {
        currentTime = localVideoRef.current.currentTime;
      } else if (ytPlayerRef.current?.getCurrentTime) {
        const t = ytPlayerRef.current.getCurrentTime();
        currentTime = typeof t === 'number' && !Number.isNaN(t) ? t : null;
      }
      if (currentTime == null) return;
      if (currentTime >= cut.end - 0.1) {
        if (videoMode === 'file' && localVideoRef.current) {
          localVideoRef.current.pause();
        } else if (ytPlayerRef.current?.pauseVideo) {
          ytPlayerRef.current.pauseVideo();
        }
        setPlayingCutId(null);
        activeCutRef.current = null;
      }
    };

    const interval = window.setInterval(checkEnd, 200);
    return () => window.clearInterval(interval);
  }, [playingCutId, videoMode, cuts]);

  const handlePreviewTimeUpdate = (cut: Cut) => (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const target = e.currentTarget;
    if (target.currentTime >= cut.end - 0.1) {
      target.pause();
      setPlayingCutId(null);
    }
  };

  const handlePlayCut = (cut: Cut) => {
    activeCutRef.current = cut;
    setPlayingCutId(cut.id);
    // fuerza el remontaje del elemento de vista previa aunque sea el mismo corte recién terminado
    setCutPlayToken((prev) => ({ ...prev, [cut.id]: (prev[cut.id] || 0) + 1 }));
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

  const activePreviewCut = cuts.find(c => c.id === fullscreenPreviewId);

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

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="section-header">
          <div>
            <small>Partido</small>
            <h2>Selecciona de qué partido son estos cortes</h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={activeMatchId}
            onChange={(e) => handleSelectMatch(e.target.value)}
            style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', minWidth: 220 }}
          >
            <option value="">General (sin partido)</option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>{match.name}</option>
            ))}
          </select>
          {activeMatchId && renamingMatchId !== activeMatchId && (
            <>
              <button type="button" className="secondary-button" onClick={() => handleStartRenameMatch(activeMatchId)}>
                Renombrar partido
              </button>
              <button type="button" className="secondary-button" onClick={() => handleDeleteMatch(activeMatchId)}>
                Eliminar partido
              </button>
            </>
          )}
          {activeMatchId && renamingMatchId === activeMatchId && (
            <>
              <input
                type="text"
                autoFocus
                value={renameMatchValue}
                onChange={(e) => setRenameMatchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRenameMatch();
                  if (e.key === 'Escape') handleCancelRenameMatch();
                }}
                style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', minWidth: 200 }}
              />
              <button type="button" className="primary-button" onClick={handleSaveRenameMatch} disabled={!renameMatchValue.trim()}>
                Guardar
              </button>
              <button type="button" className="secondary-button" onClick={handleCancelRenameMatch}>
                Cancelar
              </button>
            </>
          )}
          <input
            type="text"
            placeholder="Nombre del nuevo partido..."
            value={newMatchName}
            onChange={(e) => setNewMatchName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateMatch(); }}
            style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', flex: '1 1 220px', minWidth: 200 }}
          />
          <button type="button" className="primary-button" onClick={handleCreateMatch} disabled={!newMatchName.trim()}>
            + Nuevo partido
          </button>
        </div>
        <p className="empty-text" style={{ marginTop: 8 }}>
          {activeMatchId
            ? `Estás guardando cortes del partido «${matches.find((m) => m.id === activeMatchId)?.name || ''}».`
            : 'Estás guardando cortes en «General (sin partido)». Crea un partido para separar los cortes de otros encuentros.'}
        </p>
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
            <div style={{ display: 'grid', gap: 8 }}>
              <input type="file" accept="video/*" onChange={handleFileChange} style={{ color: '#f4f7ff' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" placeholder="URL pública (ej. Supabase) https://..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} style={{ flex: 1, padding: '0.45rem', borderRadius: 8, border: '1px solid #334155', background: '#081025', color: '#fff' }} />
                <button type="button" className="secondary-button" onClick={() => {
                  if (!videoUrl) { setStatusMessage('Introduce una URL válida.'); return; }
                  setLocalVideoSrc(videoUrl);
                  setPlayerReady(true);
                  setStatusMessage('Vídeo cargado desde URL.');
                }}>Cargar desde URL</button>
              </div>
            </div>
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
            <>
              <div className="seek-controls">
                <button type="button" className="seek-btn" onClick={() => seekBy(-20)} title="Retroceder 20s">⏪ −20s</button>
                <button type="button" className="seek-btn" onClick={() => seekBy(-10)} title="Retroceder 10s">◀ −10s</button>
                <button type="button" className="seek-btn" onClick={() => seekBy(10)} title="Avanzar 10s">+10s ▶</button>
                <button type="button" className="seek-btn" onClick={() => seekBy(20)} title="Avanzar 20s">+20s ⏩</button>
                <button type="button" className={`seek-btn${playbackRate === 1.5 ? ' active' : ''}`} onClick={() => changePlaybackRate(1.5)} title="Ver a velocidad 1,5x (vuelve a pulsar para restaurar)">1,5x</button>
                <button type="button" className={`seek-btn${playbackRate === 2 ? ' active' : ''}`} onClick={() => changePlaybackRate(2)} title="Ver a velocidad 2x (vuelve a pulsar para restaurar)">2x</button>
              </div>
              <button type="button" className="fullscreen-btn" onClick={toggleFullscreen} title="Pantalla completa">
                {isFullscreen ? '✕ Salir' : '⛶ Pantalla completa'}
              </button>
            </>
          )}
          {isFullscreen && (
            <>
              <div className="fullscreen-seek-controls" aria-label="Controles de navegación rápida en pantalla completa">
                <button type="button" className="fullscreen-seek-btn" onClick={() => seekBy(-20)} title="Retroceder 20 segundos">⏪ -20s</button>
                <button type="button" className="fullscreen-seek-btn" onClick={() => seekBy(-10)} title="Retroceder 10 segundos">◀ -10s</button>
                <button type="button" className="fullscreen-seek-btn" onClick={() => seekBy(10)} title="Avanzar 10 segundos">+10s ▶</button>
                <button type="button" className="fullscreen-seek-btn" onClick={() => seekBy(20)} title="Avanzar 20 segundos">+20s ⏩</button>
                <button type="button" className={`fullscreen-seek-btn${playbackRate === 1.5 ? ' active' : ''}`} onClick={() => changePlaybackRate(1.5)} title="Ver a velocidad 1,5x (vuelve a pulsar para restaurar)">1,5x</button>
                <button type="button" className={`fullscreen-seek-btn${playbackRate === 2 ? ' active' : ''}`} onClick={() => changePlaybackRate(2)} title="Ver a velocidad 2x (vuelve a pulsar para restaurar)">2x</button>
              </div>
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
            </>
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
                            onClick={() => handlePlayCut(cut)}
                            style={{ padding: 0, minWidth: 180, minHeight: 100, borderRadius: 12, overflow: 'hidden', position: 'relative', textAlign: 'left' }}
                          >
                            {videoMode === 'url' && videoId ? (
                              <img
                                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                                alt="Miniatura del corte"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{ width: '100%', height: '100%', background: '#0b1220' }} />
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

                      </div>
                      <div className="cut-item-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handlePlayCut(cut)}
                        >
                          Reproducir corte
                        </button>
                        <div style={{ minWidth: 240, display: 'grid', gap: 6 }}>
                          <label style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Asignar a jugador(es)</label>
                          <select
                            multiple
                            size={Math.min(6, jugadores.length || 4)}
                            value={getCutPlayerIds(cut) || []}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions).map((option) => option.value);
                              handleAssignPlayers(cut.id, selected.length > 0 ? selected : null);
                            }}
                            title="Selecciona jugador(es)"
                            style={{ minWidth: 240, background: '#111827', border: '1px solid #334155', borderRadius: 8, color: '#fff', padding: '0.75rem', minHeight: 120, appearance: 'none' }}
                          >
                            {jugadores.map((j: any) => (
                              <option key={j.id} value={j.id}>{j.nombre}</option>
                            ))}
                          </select>
                          <button type="button" className="secondary-button" style={{ width: '100%' }} onClick={() => handleAssignPlayers(cut.id, null)}>
                            Toda la plantilla
                          </button>
                        </div>
                        <button type="button" className="secondary-button" onClick={() => { setEditingCutId(cut.id); setEditStartValue(cut.start); setEditEndValue(cut.end); setEditingAnnotations(cut.annotations || []); }}>Editar</button>
                        <button type="button" className="delete-button" onClick={() => handleDeleteCut(cut, category.label)}>Borrar</button>
                      </div>
                      {playingCutId === cut.id && (
                        <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', background: '#0b1220' }}>
                          {videoMode === 'file' && localVideoSrc ? (
                            <video
                              key={`preview-${cut.id}-${cutPlayToken[cut.id] || 0}`}
                              src={localVideoSrc}
                              controls
                              autoPlay
                              onLoadedMetadata={(e) => { e.currentTarget.currentTime = cut.start; }}
                              onTimeUpdate={handlePreviewTimeUpdate(cut)}
                              style={{ width: '100%', display: 'block' }}
                            />
                          ) : videoMode === 'url' && videoId ? (
                            <iframe
                              key={`iframe-${cut.id}-${cutPlayToken[cut.id] || 0}`}
                              title={`Corte ${cut.id}`}
                              src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(cut.start)}&end=${Math.floor(cut.end)}&autoplay=1&rel=0`}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              style={{ width: '100%', height: 260, border: 'none' }}
                            />
                          ) : (
                            <div style={{ padding: 12, color: '#9ca3af' }}>No hay vídeo cargado para mostrar este corte.</div>
                          )}
                        </div>
                      )}
                    </div>
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
                          <label style={{ color: '#fff', minWidth: 70 }}>Inicio</label>
                          <input type="text" value={formatDuration(start)} onChange={(e) => setEditStartValue(parseDuration(e.target.value))} style={{ width: 120 }} />
                          <label style={{ color: '#fff', minWidth: 50 }}>Fin</label>
                          <input type="text" value={formatDuration(end)} onChange={(e) => setEditEndValue(parseDuration(e.target.value))} style={{ width: 120 }} />
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
                              setFullscreenPreviewId(null);
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
