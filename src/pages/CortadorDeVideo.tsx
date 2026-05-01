import { useEffect, useMemo, useRef, useState } from 'react';
import './CortadorDeVideo.css';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Category = {
  id: string;
  label: string;
  shortcut: string;
};

type Cut = {
  id: string;
  categoryId: string;
  label: string;
  start: number;
  end: number;
  createdAt: string;
};

type SavedState = {
  videoUrl: string;
  categories: Category[];
  cuts: Cut[];
};

const STORAGE_KEY = 'mi_club_cortador_video_v1';
const EXAMPLE_VIDEO_ID = 'M7lc1UVf-VE';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'ataque', label: 'Ataque', shortcut: '1' },
  { id: 'defensa', label: 'Defensa', shortcut: '2' },
  { id: 'transicion', label: 'Transición', shortcut: '3' },
  { id: 'otros', label: 'Otros', shortcut: '4' },
];

function parseYouTubeVideoId(url: string) {
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) {
      window.onYouTubeIframeAPIReady = () => resolve();
      return;
    }

    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.body.appendChild(script);
  });
}

function CortadorDeVideo() {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(DEFAULT_CATEGORIES[0].id);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);

  const groupedCuts = useMemo(() => {
    return categories.map((category) => ({
      category,
      cuts: cuts.filter((cut) => cut.categoryId === category.id),
    }));
  }, [categories, cuts]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed: SavedState = JSON.parse(saved);
      setVideoUrl(parsed.videoUrl || '');
      setCategories(parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES);
      setCuts(parsed.cuts || []);
      const storedId = parseYouTubeVideoId(parsed.videoUrl || '');
      if (storedId) {
        setVideoId(storedId);
      }
    } catch {
      // ignore invalid localStorage state
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        videoUrl,
        categories,
        cuts,
      }),
    );
  }, [videoUrl, categories, cuts]);

  useEffect(() => {
    if (!videoId || !playerRef.current) {
      return;
    }

    let mounted = true;

    const createPlayer = () => {
      const container = playerRef.current;
      if (!container) return;

      container.innerHTML = '';
      if (ytPlayerRef.current?.destroy) {
        ytPlayerRef.current.destroy();
      }

      ytPlayerRef.current = new window.YT.Player(container, {
        videoId,
        width: '100%',
        height: '360',
        playerVars: {
          controls: 1,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
          enablejsapi: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (!mounted) return;
            setPlayerReady(true);
            setPlayerError('');
            setStatusMessage('Vídeo cargado. Presiona un botón o usa Ctrl+Alt+[1-9] para cortar.');
          },
          onError: (event: { data: number }) => {
            if (!mounted) return;
            let errorText = 'No se pudo reproducir el vídeo.';
            if (event.data === 2) {
              errorText = 'ID de vídeo no válido.';
            } else if (event.data === 100) {
              errorText = 'El vídeo no está disponible.';
            } else if (event.data === 101 || event.data === 150) {
              errorText = 'El propietario del vídeo ha restringido la reproducción en otros sitios.';
            }
            setPlayerReady(false);
            setPlayerError(`${errorText} (Código de error ${event.data})`);
            setStatusMessage(`${errorText} (Código de error ${event.data})`);
          },
        },
      });
    };

    loadYouTubeApi()
      .then(() => {
        if (!mounted) return;
        setPlayerReady(false);
        setPlayerError('');
        createPlayer();
      })
      .catch(() => {
        if (!mounted) return;
        setPlayerError('No se pudo cargar el reproductor de YouTube.');
        setStatusMessage('Error al cargar el reproductor de YouTube.');
      });

    return () => {
      mounted = false;
    };
  }, [videoId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey) {
        const category = categories.find((item) => item.shortcut === event.key);
        if (category) {
          event.preventDefault();
          createCutForCategory(category.id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [categories, playerReady, videoId, cuts]);

  useEffect(() => {
    return () => {
      if (ytPlayerRef.current?.destroy) {
        ytPlayerRef.current.destroy();
      }
    };
  }, []);

  const handleLoadVideo = () => {
    const id = parseYouTubeVideoId(videoUrl);
    if (!id) {
      setStatusMessage('Introduce una URL de YouTube válida.');
      setVideoId(null);
      setPlayerError('');
      return;
    }

    setVideoId(id);
    setPlayerReady(false);
    setPlayerError('');
    setStatusMessage('Cargando vídeo...');
  };

  const handleLoadExampleVideo = () => {
    const exampleUrl = `https://www.youtube.com/watch?v=${EXAMPLE_VIDEO_ID}`;
    setVideoUrl(exampleUrl);
    setVideoId(EXAMPLE_VIDEO_ID);
    setPlayerReady(false);
    setPlayerError('');
    setStatusMessage('Cargando vídeo de prueba...');
  };

  const createCutForCategory = (categoryId: string) => {
    if (!ytPlayerRef.current || !playerReady) {
      setStatusMessage('Espera a que el vídeo esté listo, o carga uno primero.');
      return;
    }

    const currentTime = ytPlayerRef.current.getCurrentTime?.();
    if (currentTime == null || Number.isNaN(currentTime)) {
      setStatusMessage('No se pudo leer el tiempo actual del vídeo.');
      return;
    }

    const end = Math.floor(currentTime);
    const start = Math.max(0, end - 20);
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;

    const cutLabel = `${category.label} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const nextCut: Cut = {
      id: `${categoryId}-${Date.now()}`,
      categoryId,
      label: cutLabel,
      start,
      end,
      createdAt: new Date().toISOString(),
    };

    setCuts((prev) => [nextCut, ...prev]);
    setStatusMessage(`Corte guardado en ${category.label}: ${start}s → ${end}s`);
  };

  const handleAddCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    const nextShortcut = String(categories.length < 9 ? categories.length + 1 : '');
    const newCategory: Category = {
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      shortcut: nextShortcut,
    };

    setCategories((prev) => [...prev, newCategory]);
    setSelectedCategoryId(newCategory.id);
    setNewCategoryLabel('');
    setStatusMessage(`Categoría creada: ${label}${nextShortcut ? ` (Ctrl+Alt+${nextShortcut})` : ''}`);
  };

  const handlePlayCut = (cut: Cut) => {
    if (!ytPlayerRef.current || !playerReady) {
      setStatusMessage('Carga primero un vídeo para reproducir el corte.');
      return;
    }
    ytPlayerRef.current.seekTo(cut.start, true);
    ytPlayerRef.current.playVideo();
    setStatusMessage(`Reproduciendo corte: ${cut.start}s → ${cut.end}s`);
  };

  return (
    <section className="page-section cortador-video-page">
      <div className="page-title">
        <div>
          <div className="badge">HERRAMIENTA</div>
          <h1>Cortador de vídeo</h1>
        </div>
      </div>

      <div className="card cortador-card">
        <div className="section-header">
          <div>
            <small>URL de YouTube</small>
            <h2>Inserta el vídeo que quieras cortar</h2>
          </div>
        </div>

        <div className="video-form">
          <input
            type="text"
            value={videoUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            onChange={(event) => setVideoUrl(event.target.value)}
          />
          <div className="video-form-actions">
            <button className="primary-button" type="button" onClick={handleLoadVideo}>
              Cargar vídeo
            </button>
            <button className="secondary-button" type="button" onClick={handleLoadExampleVideo}>
              Cargar vídeo de prueba
            </button>
          </div>
        </div>

        <div className="video-wrapper">
          {!videoId && (
            <div className="video-placeholder">
              <p>Introduce una URL de YouTube y pulsa «Cargar vídeo».</p>
            </div>
          )}

          {videoId && !playerError && (
            <div ref={playerRef} className="video-embed" />
          )}

          {videoId && playerError && (
            <div className="video-error-fallback">
              <p>{playerError}</p>
              <p>
                El vídeo puede estar bloqueado para reproducirse en sitios externos.
              </p>
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                Ver vídeo en YouTube
              </a>
            </div>
          )}
        </div>

        <div className="video-helpers">
          <p>
            Usa los botones para crear y clasificar cortes. Pulsa <strong>Ctrl+Alt+[1-9]</strong> para guardar los últimos 20 segundos en la categoría correspondiente.
          </p>
          {statusMessage && <p className="status-text">{statusMessage}</p>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-header">
            <div>
              <small>Categorías</small>
              <h2>Botonera de clasificación</h2>
            </div>
          </div>

          <div className="category-toolbar">
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={
                  category.id === selectedCategoryId
                    ? 'category-button selected'
                    : 'category-button'
                }
                onClick={() => setSelectedCategoryId(category.id)}
              >
                <span>{category.label}</span>
                <small>{category.shortcut ? `Ctrl+Alt+${category.shortcut}` : 'sin atajo'}</small>
              </button>
            ))}
          </div>

          <div className="category-add">
            <input
              type="text"
              placeholder="Nueva categoría"
              value={newCategoryLabel}
              onChange={(event) => setNewCategoryLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleAddCategory();
                }
              }}
            />
            <button type="button" className="secondary-button" onClick={handleAddCategory}>
              Añadir categoría
            </button>
          </div>

          <div className="section-footer">
            <button
              type="button"
              className="primary-button"
              onClick={() => createCutForCategory(selectedCategoryId)}
            >
              Guardar corte en {categories.find((item) => item.id === selectedCategoryId)?.label || 'categoría'}
            </button>
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
                        <button type="button" className="secondary-button" onClick={() => handlePlayCut(cut)}>
                          Reproducir
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CortadorDeVideo;
