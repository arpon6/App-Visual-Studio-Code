import { useEffect, useMemo, useRef, useState } from 'react';
import './CortadorDeVideo.css';
import { usePlantilla } from '../lib/usePlantilla';
import { useSharedState } from '../lib/useSharedState';
// Asegúrate de que estas interfaces y tipos existan o adáptalas si son diferentes
interface Player {
  id: string | number; // Permitimos string o number para el ID del jugador
  name: string;
  number: number;
}
type Category = { id: string; label: string; shortcut: string };
// El tipo Cut debe coincidir con lo que espera AnalisisDePartido
type Cut = {
  id: string;
  categoryId: string; // Clave de la categoría (ej: 'abp-ofensivo')
  label: string;      // Descripción del corte
  start: number;      // Tiempo de inicio en segundos
  end: number;        // Tiempo de fin en segundos
  createdAt: string;
  player_id?: string | null; // Para asignar un jugador
};
type AnalysisCutsMap = Record<string, Cut[]>; // Clave: categoryId, Valor: Array de Cortes
type VideoMode = 'url' | 'file';
const STORAGE_KEY = 'analisis_main_video'; // Clave compartida para el vídeo
const SHARED_CUTS_KEY = 'analisis_cuts';    // Clave compartida para los cortes
const SHARED_CATEGORIES_KEY = 'cortador_propio_categories'; // Esta clave se queda local para categorías
const IDB_NAME = 'mi_club_video_propio';
const IDB_STORE = 'files';
const IDB_KEY = 'local_video';
const EXAMPLE_VIDEO_ID = 'M7lc1UVf-VE';
const TACTICAL_TITLES = [
  'ABP OFENSIVO', 'ABP DEFENSIVO', 'PRESIÓN ALTA', 'REPLIEGUE TOTAL',
  'REPLIEGUE INTERMEDIO', 'CONQUISTA ESPALDA Z 3', 'ATAQUE DE ÁREA ESTANDO',
  'ATAQUE DE ÁREA LLEGANDO', 'DEFENSA DE ÁREA ESTANDO', 'DEFENSA DE ÁREA LLEGANDO',
  'REINICIO Y CONSTRUCCIÓN Z 1-2', 'PROGRESIÓN JUEGO EXTERIOR Z 2-3',
  'PROGRESIÓN JUEGO INTERIOR Z 2-3', 'PRIORIZAR CONSERVAR TRAS ROBO Z 1',
  'PRIORIZAR FINALIZAR TRAS ROBO Z 4', 'PRIORIZAR PROGRESAR TRAS ROBO Z 2-3',
  'PRIORIZAR RECUPERAR TRAS PÉRDIDA Z 3-4', 'PRIORIZAR DEFENDER ESPACIO TRAS PÉRDIDA Z 2',
  'PRIORIZAR DEFENDER PORTERÍA TRAS PÉRDIDA Z 1',
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
  const jugadores = usePlantilla();
  // Claves compartidas con AnalisisDePartido
  const [sharedVideoUrl, setSharedVideoUrl] = useSharedState<string>(STORAGE_KEY, '');
  const [sharedCuts, setSharedCuts] = useSharedState<Record<string, Cut[]>>(SHARED_CUTS_KEY, {});
  // Las categorías se manejan localmente o se cargan si no existen
  const [categories, setCategoriesState] = useSharedState<Category[]>(SHARED_CATEGORIES_KEY, DEFAULT_CATEGORIES);
  
  const [videoMode, setVideoMode] = useState<VideoMode>(saved.videoMode || 'url');
  const [videoUrl, setVideoUrlState] = useState<string>('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [cuts, setCutsState] = useState<Cut[]>([]); // Cortes locales para edición en este componente
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [playerError, setPlayerError] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(DEFAULT_CATEGORIES[0]?.id || ''); // Inicializar con la primera categoría o vacía
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [editingShortcutValue, setEditingShortcutValue] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastKnownTimeRef = useRef<number>(0);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  // Refs para mantener siempre el estado más reciente de categorías y cortes
  const categoriesRef = useRef(categories);
  const cutsRef = useRef(cuts);
  const playerReadyRef = useRef(false); // Ref para estado de carga del reproductor

  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { cutsRef.current = cuts; }, [cuts]);
  useEffect(() => { playerReadyRef.current = playerReady; }, [playerReady]);

  // Cargar estado inicial de shared states
  useEffect(() => {
    if (sharedVideoUrl) {
      setVideoUrlState(sharedVideoUrl);
      const id = extractYouTubeVideoId(sharedVideoUrl);
      if (id) setVideoId(id);
    }
    if (sharedCuts && Object.keys(sharedCuts).length > 0) {
      // Convertir el objeto de cortes a un array plano para el estado local
      const allCuts: Cut[] = Object.entries(sharedCuts).flatMap(([catId, catCuts]) =>
        catCuts.map(cut => ({ ...cut, categoryId: catId })) // Asegurar que categoryId esté en cada corte
      );
      setCutsState(allCuts);
    }
    if (sharedCategories.length) {
      setCategoriesState(sharedCategories);
      setSelectedCategoryId(sharedCategories[0]?.id || ''); // Establecer la primera categoría seleccionada
    }
  }, [sharedVideoUrl, sharedCuts, sharedCategories]);

  const setVideoUrl = (v: string) => { setVideoUrlState(v); setSharedVideoUrl(v); };
  
  // Función para actualizar cortes locales y compartidos
  const setCuts = (newCuts: Cut[]) => {
    setCutsState(newCuts); // Actualiza el estado local
    // Actualiza el estado compartido (analisis_cuts)
    setSharedCuts(prevShared => {
      // Necesitamos saber la categoría activa para actualizar correctamente
      if (!selectedCategoryId) {
        console.error("No se pudo determinar la categoría activa para guardar cortes.");
        return prevShared;
      }
      return {
        ...prevShared,
        [selectedCategoryId]: newCuts.filter(cut => cut.categoryId === selectedCategoryId) // Guarda solo los cortes de la categoría activa
      };
    });
    setStatusMessage(`Cortes actualizados.`);
  };

  const setCategories = (fn: Category[] | ((prev: Category[]) => Category[])) => {
    setCategoriesState(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      setSharedCategories(next); // Guarda las categorías compartidas
      // Actualiza la categoría seleccionada si la actual se elimina o cambia
      if (next.length > 0 && !next.some(c => c.id === selectedCategoryId)) {
        setSelectedCategoryId(next[0].id);
      } else if (next.length === 0) {
        setSelectedCategoryId('');
      }
      return next;
    });
  };

  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [playerReady, setPlayerError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { cutsRef.current = cuts; }, [cuts]);
  useEffect(() => { playerReadyRef.current = playerReady; }, [playerReady]);

  const groupedCuts = useMemo(() => {
    const grouped: Record<string, Cut[]> = {};
    cuts.forEach(cut => {
      if (!grouped[cut.categoryId]) grouped[cut.categoryId] = [];
      grouped[cut.categoryId].push(cut);
    });
    // Asegurarse de que todas las categorías existan en el resultado, incluso si no tienen cortes
    categories.forEach(cat => {
      if (!grouped[cat.id]) grouped[cat.id] = [];
    });
    return grouped;
  }, [categories, cuts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ videoMode, videoUrl: videoUrlState, categories })); // Guarda también videoMode y categories
  }, [videoMode, videoUrlState, categories]);

  useEffect(() => {
    if (videoMode !== 'file') return;
    loadFileFromIDB().then((file) => {
      if (!file) return;
      const src = URL.createObjectURL(file);
      setLocalVideoSrc(src);
      setPlayerReady(true); // Asumimos que el vídeo local está listo
      setStatusMessage(`Vídeo cargado: ${file.name}`);
    });
  }, [videoMode]);

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
            setStatusMessage('Vídeo cargado. Usa los atajos o pulsa una categoría.');
          },
          onError: (event: { data: number }) => {
            if (!mounted) return;
            const msgs: Record<number, string> = { 2: 'ID de vídeo no válido.', 100: 'El vídeo no está disponible.', 101: 'Reproducción restringida.', 150: 'Reproducción restringida.' };
            const msg = msgs[event.data] || 'No se pudo reproducir el vídeo.';
            setPlayerReady(false);
            setPlayerError(`${msg} (Código ${event.data})`);
            setStatusMessage(`${msg} (Código ${event.data})`);
          },
        },
      });
    }).catch((err) => {
      if (!mounted) return;
      setPlayerError('No se pudo cargar el reproductor de YouTube.');
      setStatusMessage('Error al cargar YouTube API.');
      console.error("YouTube API Error:", err);
    });
    return () => { mounted = false; ytPlayerRef.current?.destroy?.(); };
  }, [videoId, videoMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoMode === 'file' && localVideoRef.current) {
        lastKnownTimeRef.current = localVideoRef.current.currentTime;
      } else if (ytPlayerRef.current && playerReadyRef.current) {
        const t = ytPlayerRef.current.getCurrentTime?.();
        if (t != null && !Number.isNaN(t)) lastKnownTimeRef.current = t;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [videoMode, playerReady]);

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
      e.stopPropagation(); // Detener la propagación del evento
      createCutForCategory(category.id); // Llama a la función que crea el corte
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [categories, createCutForCategory]); // Asegurarse que dependa de las categorías y la función

  const createCutForCategory = (categoryId: string) => {
    const category = categoriesRef.current.find((c) => c.id === categoryId);
    if (!category) return;
    const time = videoMode === 'file' && localVideoRef.current
      ? localVideoRef.current.currentTime
      : ytPlayerRef.current?.getCurrentTime?.();
    const currentTime = (time != null && !Number.isNaN(time)) ? time : lastKnownTimeRef.current;
    const end = Math.floor(currentTime);
    const start = Math.max(0, end - 20);
    const cut: Cut = {
      id: `${categoryId}-${Date.now()}`,
      categoryId: categoryId,
      label: `${category.label} · ${new Date(currentTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      start, end,
      createdAt: new Date().toISOString(),
      player_id: null,
    };
    setCuts((prev) => {
      const updatedCuts = [cut, ...prev];
      // Actualizar el estado compartido directamente
      setSharedCuts(prevShared => {
        return {
          ...prevShared,
          [categoryId]: updatedCuts.filter(c => c.categoryId === categoryId) // Guarda solo los cortes de esta categoría
        };
      });
      return updatedCuts;
    });
    setStatusMessage(`Corte guardado en ${category.label}: ${start}s → ${end}s`);
  };

  const handleAssignPlayer = (cutId: string, playerId: string | null) => {
    setCutsState(prev => {
      let targetCategoryId: string | null = null;
      let updatedCuts = [...prev]; // Copiar el array
      
      // Buscar la categoría y el corte para actualizar
      for (const cat of categoriesRef.current) {
        const cutIndex = updatedCuts.findIndex(c => c.id === cutId && c.categoryId === cat.id);
        if (cutIndex !== -1) {
          targetCategoryId = cat.id;
          const cutToUpdate = updatedCuts[cutIndex];
          updatedCuts[cutIndex] = { ...cutToUpdate, player_id: playerId ? String(playerId) : null };
          break; // Encontrado, salir del bucle
        }
      }

      if (targetCategoryId) {
        // Actualizar el estado compartido
        setSharedCuts(prevShared => ({
          ...prevShared,
          [targetCategoryId]: updatedCuts.filter(c => c.categoryId === targetCategoryId)
        }));
      }
      return updatedCuts; // Devolver el array local actualizado
    });
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
    setVideoUrl(url);
    setVideoId(EXAMPLE_VIDEO_ID);
    setPlayerReady(false);
    setPlayerError('');
    setStatusMessage('Cargando vídeo de prueba...');
  };

  const handleAddCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    const newCat: Category = { id: label.toLowerCase().replace(/\s+/g, '-'), label, shortcut: '' };
    setCategories((prev) => [...prev, newCat]);
    setSharedCategories([...categories, newCat]); // También guardar en compartido
    setSelectedCategoryId(newCat.id);
    setNewCategoryLabel('');
    setStatusMessage(`Categoría creada: ${label}`);
  };

  const handleShortcutSave = (categoryId: string, value: string) => {
    const conflict = categories.find((c) => c.id !== categoryId && c.shortcut === value && value !== '');
    if (conflict) { setStatusMessage(`El atajo «${value}» ya está en uso por «${conflict.label}».`); return; }
    setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, shortcut: value } : c));
    setSharedCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, shortcut: value } : c)); // Actualizar compartido
    setEditingShortcutId(null);
    setStatusMessage(value ? `Atajo «${value}» asignado.` : 'Atajo eliminado.');
  };

  const handleDeleteCut = (cut: Cut, categoryLabel: string) => {
    const categoryId = cut.categoryId;
    setCuts((prev) => {
      const updatedLocal = prev.filter((c) => c.id !== cut.id);
      // Actualizar compartido
      setSharedCuts(prevShared => {
        return {
          ...prevShared,
          [categoryId]: updatedLocal.filter(c => c.categoryId === categoryId)
        };
      });
      setStatusMessage(`Corte borrado de ${categoryLabel}.`);
      return updatedLocal;
    });
  };

  const handlePlayCut = (cut: Cut) => {
    if (videoMode === 'file' && localVideoRef.current) {
      localVideoRef.current.currentTime = cut.start;
      localVideoRef.current.play();
      setStatusMessage(`Reproduciendo corte: ${cut.start}s → ${cut.end}s`);
      return;
    }
    if (!ytPlayerRef.current || !playerReadyRef.current) { setStatusMessage('Carga primero un vídeo para reproducir el corte.'); return; }
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
              <button type="button" className={videoMode === 'url' ? 'primary-button' : 'secondary-button'} onClick={() => { setVideoMode('url'); setLocalVideoSrc(null); setVideoId(null); ytPlayerRef.current?.destroy?.(); }}>URL de YouTube</button>
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
                  <button
                    type="button"
                    key={cat.id}
                    className="fullscreen-cut-btn"
                    onClick={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      createCutForCategory(cat.id);
                    }}
                  >
                    <span className="fsc-label">{cat.label}</span>
                    {cat.shortcut && (
                      <small
                        className="shortcut-label"
                        title="Haz clic para editar el atajo"
                        onClick={(e) => { e.stopPropagation(); setEditingShortcutId(cat.id); setEditingShortcutValue(cat.shortcut); }}
                      >
                        {cat.shortcut || 'sin atajo · editar'}
                      </small>
                    )}
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
                        if (['Escape', 'Enter'].includes(e.key)) {
                          e.preventDefault(); e.stopPropagation();
                          if (e.key === 'Escape') { setEditingShortcutId(null); return; }
                          handleShortcutSave(category.id, editingShortcutValue);
                          return;
                        }
                        if (['Backspace', 'Delete'].includes(e.key)) {
                          e.preventDefault(); e.stopPropagation();
                          setEditingShortcutValue('');
                          handleShortcutSave(category.id, '');
                          return;
                        }
                        const combo = normalizeKey(e.nativeEvent);
                        if (combo && (e.ctrlKey || e.altKey)) {
                          e.preventDefault(); e.stopPropagation();
                          setEditingShortcutValue(combo);
                          handleShortcutSave(category.id, combo);
                        }
                      }}
                      onBlur={() => setEditingShortcutId(null)} // Guarda al perder el foco
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
          {Object.entries(groupedCuts).map(([categoryId, categoryCuts]) => {
            const category = categories.find(c => c.id === categoryId);
            if (!category) return null;
            return (
              <div key={categoryId} className="cut-group">
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
                          <select
                            value={cut.player_id ?? ''}
                            onChange={e => handleAssignPlayer(cut.id, e.target.value || null)}
                            title="Asignar a jugador"
                          >
                            <option value="">Toda la plantilla</option>
                            {jugadores.map(j => (
                              <option key={j.id as string | number} value={String(j.id)}>{j.name}</option>
                            ))}
                          </select>
                          <button type="button" className="secondary-button" onClick={() => handlePlayCut(cut)}>Reproducir</button>
                          <button type="button" className="delete-button" onClick={() => handleDeleteCut(cut, category.label)}>Borrar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
