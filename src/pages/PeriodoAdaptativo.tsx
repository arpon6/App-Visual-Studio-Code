import { useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';
import './PeriodoAdaptativo.css';

type PdfData = {
  name: string;
  url: string;
};

type VideoItem = {
  title: string;
  url: string;
};

type PeriodoAdaptativoData = {
  pdf: PdfData | null;
  videos: VideoItem[];
};

const DEFAULT_DATA: PeriodoAdaptativoData = {
  pdf: null,
  videos: [
    { title: 'Video 1', url: '' },
    { title: 'Video 2', url: '' },
    { title: 'Video 3', url: '' },
    { title: 'Video 4', url: '' },
  ],
};

const SHARED_KEY = 'periodo_adaptativo_data';

function getYouTubeEmbedUrl(rawUrl: string): string {
  if (!rawUrl.trim()) return '';

  try {
    const parsed = new URL(rawUrl.trim());

    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }

    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;

      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedId = parts[0] === 'embed' ? parts[1] : '';
      return embedId ? `https://www.youtube.com/embed/${embedId}` : '';
    }

    return '';
  } catch {
    return '';
  }
}

function PeriodoAdaptativo() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const [data, setData, loading] = useSharedState<PeriodoAdaptativoData>(SHARED_KEY, DEFAULT_DATA);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const safeData = useMemo<PeriodoAdaptativoData>(() => {
    const base = data && typeof data === 'object' ? data : DEFAULT_DATA;
    const videos = Array.isArray(base.videos) ? base.videos.slice(0, 4) : [];

    while (videos.length < 4) {
      videos.push({ title: `Video ${videos.length + 1}`, url: '' });
    }

    return {
      pdf: base.pdf ?? null,
      videos,
    };
  }, [data]);

  const handleUploadPdf = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Selecciona un PDF antes de subirlo.');
      return;
    }

    if (file.type !== 'application/pdf') {
      setError('El archivo debe ser un PDF válido.');
      return;
    }

    setError('');
    setUploading(true);

    const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
    const path = `periodo-adaptativo/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from('documentos').upload(path, file, { upsert: true });

    if (uploadError) {
      setError(`No se pudo subir el PDF: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path);

    setData((prev) => ({
      ...((prev && typeof prev === 'object') ? prev : DEFAULT_DATA),
      pdf: {
        name: file.name,
        url: urlData.publicUrl,
      },
    }));

    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
  };

  const updateVideo = (index: number, field: keyof VideoItem, value: string) => {
    setData((prev) => {
      const current = (prev && typeof prev === 'object') ? prev : DEFAULT_DATA;
      const nextVideos = Array.isArray(current.videos) ? [...current.videos] : [...DEFAULT_DATA.videos];

      while (nextVideos.length < 4) {
        nextVideos.push({ title: `Video ${nextVideos.length + 1}`, url: '' });
      }

      nextVideos[index] = {
        ...nextVideos[index],
        [field]: value,
      };

      return {
        ...current,
        videos: nextVideos.slice(0, 4),
      };
    });
  };

  const currentPdf = safeData.pdf;

  return (
    <section className="page-section periodo-adaptativo-page">
      <div className="page-title">
        <div>
          <small>Planificación común</small>
          <h1>Periodo Adaptativo</h1>
        </div>
      </div>

      <div className="card periodo-card">
        <div className="section-header">
          <h2>Explicación del trabajo</h2>
        </div>

        {!isReadOnly && (
          <div className="pdf-upload-row">
            <input ref={fileRef} type="file" accept="application/pdf" />
            <button type="button" onClick={handleUploadPdf} disabled={uploading}>
              {uploading ? 'Subiendo...' : 'Subir PDF'}
            </button>
          </div>
        )}

        {error ? <p className="periodo-error">{error}</p> : null}

        {!loading && !currentPdf ? (
          <p className="periodo-empty">Todavía no hay PDF subido.</p>
        ) : null}

        {currentPdf ? (
          <div className="pdf-viewer-wrap">
            <div className="pdf-actions">
              <span>{currentPdf.name}</span>
              <div className="pdf-actions-buttons">
                <a href={currentPdf.url} target="_blank" rel="noopener noreferrer">
                  <button type="button">Abrir</button>
                </a>
                <a href={currentPdf.url} download={currentPdf.name}>
                  <button type="button">Descargar</button>
                </a>
              </div>
            </div>
            <iframe
              title="Explicación del trabajo PDF"
              src={currentPdf.url}
              className="periodo-pdf-frame"
            />
          </div>
        ) : null}
      </div>

      {safeData.videos.map((video, index) => {
        const embedUrl = getYouTubeEmbedUrl(video.url);
        return (
          <div key={`periodo-video-${index}`} className="card periodo-video-card">
            {!isReadOnly ? (
              <div className="video-fields">
                <input
                  type="text"
                  value={video.title}
                  onChange={(event) => updateVideo(index, 'title', event.target.value)}
                  placeholder={`Título del video ${index + 1}`}
                />
                <input
                  type="url"
                  value={video.url}
                  onChange={(event) => updateVideo(index, 'url', event.target.value)}
                  placeholder="Pega aquí la URL de YouTube"
                />
              </div>
            ) : (
              <h3 className="video-title">{video.title || `Video ${index + 1}`}</h3>
            )}

            {!isReadOnly ? <h3 className="video-title">{video.title || `Video ${index + 1}`}</h3> : null}

            {embedUrl ? (
              <div className="periodo-video-frame-wrap">
                <iframe
                  src={embedUrl}
                  title={video.title || `Video ${index + 1}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  className="periodo-video-frame"
                />
              </div>
            ) : (
              <div className="periodo-video-placeholder">
                Pega una URL válida de YouTube para mostrar este video.
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default PeriodoAdaptativo;
