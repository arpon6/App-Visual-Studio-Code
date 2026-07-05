import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';
import './EditorDeImagenes.css';

type Point = { x: number; y: number };
type Tool = 'arrow' | 'line' | 'rect' | 'circle' | 'free' | 'text' | 'badge' | 'erase';

type BaseAnnotation = {
  id: string;
  color: string;
  fill: string;
  width: number;
  opacity: number;
};

type LineAnnotation = BaseAnnotation & {
  kind: 'arrow' | 'line';
  from: Point;
  to: Point;
};

type ShapeAnnotation = BaseAnnotation & {
  kind: 'rect' | 'circle';
  from: Point;
  to: Point;
};

type FreeAnnotation = BaseAnnotation & {
  kind: 'free';
  points: Point[];
};

type TextAnnotation = BaseAnnotation & {
  kind: 'text' | 'badge';
  at: Point;
  text: string;
};

type Annotation = LineAnnotation | ShapeAnnotation | FreeAnnotation | TextAnnotation;

type EditorState = {
  background: string | null;
  annotations: Annotation[];
  updatedBy: string | null;
  updatedAt: string | null;
};

type Draft =
  | { kind: 'arrow' | 'line' | 'rect' | 'circle'; from: Point; to: Point }
  | { kind: 'free'; points: Point[] }
  | null;

const DEFAULT_STATE: EditorState = {
  background: null,
  annotations: [],
  updatedBy: null,
  updatedAt: null,
};

const EDITOR_ROLES = new Set(['entrenador', 'directivo']);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function annotationCenter(annotation: Annotation): Point {
  if ('at' in annotation) return annotation.at;
  if ('points' in annotation) {
    const first = annotation.points[0] || { x: 0.5, y: 0.5 };
    const last = annotation.points[annotation.points.length - 1] || first;
    return { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  }
  return {
    x: (annotation.from.x + annotation.to.x) / 2,
    y: (annotation.from.y + annotation.to.y) / 2,
  };
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = Math.max(10, width * 4);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 7),
    to.y - headLength * Math.sin(angle - Math.PI / 7),
  );
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 7),
    to.y - headLength * Math.sin(angle + Math.PI / 7),
  );
  ctx.closePath();
  ctx.fill();
}

function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation, width: number, height: number) {
  const px = (point: Point) => ({ x: point.x * width, y: point.y * height });
  const alpha = Math.max(0.05, Math.min(1, annotation.opacity));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.fill;
  ctx.lineWidth = annotation.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (annotation.kind === 'line' || annotation.kind === 'arrow') {
    const from = px(annotation.from);
    const to = px(annotation.to);
    if (annotation.kind === 'line') {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = annotation.color;
      drawArrow(ctx, from, to, annotation.width);
    }
    ctx.restore();
    return;
  }

  if (annotation.kind === 'rect') {
    const from = px(annotation.from);
    const to = px(annotation.to);
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    return;
  }

  if (annotation.kind === 'circle') {
    const from = px(annotation.from);
    const to = px(annotation.to);
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;
    const rx = Math.abs(to.x - from.x) / 2;
    const ry = Math.abs(to.y - from.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (annotation.kind === 'free') {
    if (annotation.points.length < 2) {
      ctx.restore();
      return;
    }
    const first = px(annotation.points[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < annotation.points.length; i += 1) {
      const point = px(annotation.points[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (annotation.kind === 'text') {
    const at = px(annotation.at);
    ctx.fillStyle = annotation.color;
    ctx.font = `${Math.max(16, annotation.width * 4)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(annotation.text, at.x, at.y);
    ctx.restore();
    return;
  }

  if (annotation.kind !== 'badge') {
    ctx.restore();
    return;
  }

  const at = px(annotation.at);
  const radius = Math.max(14, annotation.width * 3);
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = annotation.color;
  ctx.stroke();
  ctx.fillStyle = annotation.color;
  ctx.font = `${Math.max(14, radius)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(annotation.text, at.x, at.y + 1);
  ctx.restore();
}

function EditorDeImagenes() {
  const { user } = useAuth();
  const canEdit = !!user && EDITOR_ROLES.has(user.role);

  const [sharedState, setSharedState, loadingShared] = useSharedState<EditorState>('editor_imagenes_state', DEFAULT_STATE);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [tool, setTool] = useState<Tool>('arrow');
  const [primaryColor, setPrimaryColor] = useState('#dd145f');
  const [fillColor, setFillColor] = useState('rgba(23,48,122,0.22)');
  const [width, setWidth] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState<Draft>(null);

  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });
  const [isPointerDown, setIsPointerDown] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const annotations = sharedState.annotations || [];

  const applySharedState = (next: EditorState) => {
    setSharedState({
      ...next,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.username ?? null,
    });
  };

  const setAnnotations = (next: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
    const resolved = typeof next === 'function' ? (next as (prev: Annotation[]) => Annotation[])(annotations) : next;
    applySharedState({ ...sharedState, annotations: resolved });
  };

  useEffect(() => {
    setImageUrlInput(sharedState.background || '');
  }, [sharedState.background]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      imageRef.current = image;
      const containerWidth = containerRef.current?.clientWidth || 1280;
      const maxWidth = Math.max(360, Math.min(containerWidth, 1280));
      const ratio = image.height > 0 ? image.width / image.height : 16 / 9;
      const nextWidth = maxWidth;
      const nextHeight = Math.round(nextWidth / ratio);
      setCanvasSize({ width: nextWidth, height: nextHeight });
    };
    image.onerror = () => {
      imageRef.current = null;
      setStatus('No se pudo cargar la imagen. Revisa la URL o selecciona un archivo valido.');
    };

    if (sharedState.background) {
      image.src = sharedState.background;
    } else {
      imageRef.current = null;
      setCanvasSize({ width: 1280, height: 720 });
    }
  }, [sharedState.background]);

  useEffect(() => {
    const onResize = () => {
      if (!imageRef.current) return;
      const containerWidth = containerRef.current?.clientWidth || 1280;
      const maxWidth = Math.max(360, Math.min(containerWidth, 1280));
      const ratio = imageRef.current.height > 0 ? imageRef.current.width / imageRef.current.height : 16 / 9;
      setCanvasSize({ width: maxWidth, height: Math.round(maxWidth / ratio) });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const drawAll = useMemo(
    () => () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (imageRef.current) {
        ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#0a1322';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      for (const annotation of annotations) {
        drawAnnotation(ctx, annotation, canvas.width, canvas.height);
      }

      if (draft) {
        const preview: Annotation | null =
          draft.kind === 'free'
            ? {
                id: 'draft',
                kind: 'free',
                points: draft.points,
                color: primaryColor,
                fill: fillColor,
                width,
                opacity,
              }
            : {
                id: 'draft',
                kind: draft.kind,
                from: draft.from,
                to: draft.to,
                color: primaryColor,
                fill: fillColor,
                width,
                opacity,
              };

        if (preview) drawAnnotation(ctx, preview, canvas.width, canvas.height);
      }
    },
    [annotations, draft, fillColor, opacity, primaryColor, width],
  );

  useEffect(() => {
    drawAll();
  }, [drawAll, canvasSize]);

  const getPointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);
    return { x, y };
  };

  const removeNearestAnnotation = (point: Point) => {
    if (!annotations.length) return;
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    annotations.forEach((annotation, index) => {
      const center = annotationCenter(annotation);
      const dx = center.x - point.x;
      const dy = center.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex >= 0 && nearestDistance <= 0.12) {
      setAnnotations((prev) => prev.filter((_, index) => index !== nearestIndex));
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit || loadingShared) return;
    const point = getPointFromEvent(event);

    if (tool === 'erase') {
      removeNearestAnnotation(point);
      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Texto', '');
      if (!text || !text.trim()) return;
      setAnnotations((prev) => [
        ...prev,
        {
          id: uid(),
          kind: 'text',
          at: point,
          text: text.trim(),
          color: primaryColor,
          fill: fillColor,
          width,
          opacity,
        },
      ]);
      return;
    }

    if (tool === 'badge') {
      const text = window.prompt('Dorsal / etiqueta', '10');
      if (!text || !text.trim()) return;
      setAnnotations((prev) => [
        ...prev,
        {
          id: uid(),
          kind: 'badge',
          at: point,
          text: text.trim(),
          color: primaryColor,
          fill: fillColor,
          width,
          opacity,
        },
      ]);
      return;
    }

    if (tool === 'free') {
      setDraft({ kind: 'free', points: [point] });
    } else {
      setDraft({ kind: tool, from: point, to: point });
    }

    setIsPointerDown(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDown || !draft || !canEdit) return;
    const point = getPointFromEvent(event);

    if (draft.kind === 'free') {
      setDraft((prev) => {
        if (!prev || prev.kind !== 'free') return prev;
        return { kind: 'free', points: [...prev.points, point] };
      });
      return;
    }

    setDraft((prev) => {
      if (!prev || prev.kind === 'free') return prev;
      return { ...prev, to: point };
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDown || !draft || !canEdit) return;

    if (draft.kind === 'free') {
      if (draft.points.length > 1) {
        setAnnotations((prev) => [
          ...prev,
          {
            id: uid(),
            kind: 'free',
            points: draft.points,
            color: primaryColor,
            fill: fillColor,
            width,
            opacity,
          },
        ]);
      }
    } else {
      setAnnotations((prev) => [
        ...prev,
        {
          id: uid(),
          kind: draft.kind,
          from: draft.from,
          to: draft.to,
          color: primaryColor,
          fill: fillColor,
          width,
          opacity,
        },
      ]);
    }

    setDraft(null);
    setIsPointerDown(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      applySharedState({
        ...sharedState,
        background: dataUrl,
      });
      setStatus(`Imagen cargada: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const applyImageUrl = () => {
    if (!canEdit) return;
    const next = imageUrlInput.trim();
    if (!next) return;
    applySharedState({
      ...sharedState,
      background: next,
    });
    setStatus('Imagen actualizada desde URL.');
  };

  const undo = () => {
    if (!canEdit) return;
    setAnnotations((prev) => prev.slice(0, -1));
  };

  const clearAll = () => {
    if (!canEdit) return;
    const confirmed = window.confirm('Se eliminaran todas las marcas de la imagen.');
    if (!confirmed) return;
    setAnnotations([]);
  };

  const clearBackground = () => {
    if (!canEdit) return;
    const confirmed = window.confirm('Se eliminara la imagen de fondo compartida.');
    if (!confirmed) return;
    applySharedState({
      ...sharedState,
      background: null,
      annotations: [],
    });
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `editor-imagenes-${Date.now()}.png`;
      link.click();
    } catch {
      setStatus('No se pudo exportar PNG. Si la imagen viene de una URL externa, verifica CORS.');
    }
  };

  const addDorsal = (value: number) => {
    if (!canEdit) return;
    setTool('badge');
    setStatus(`Herramienta dorsal activa: ${value}. Haz clic en el lienzo para colocarlo.`);
  };

  const lastUpdateText = sharedState.updatedAt
    ? new Date(sharedState.updatedAt).toLocaleString('es-ES')
    : null;

  return (
    <section className="page-section editor-imagenes-page">
      <div className="page-title">
        <div>
          <small>Analisis visual</small>
          <h1>Editor de imagenes</h1>
        </div>
      </div>

      <div className="card editor-imagenes-controls">
        <div className="editor-imagenes-row">
          <label>
            URL de imagen
            <input
              type="text"
              value={imageUrlInput}
              onChange={(event) => setImageUrlInput(event.target.value)}
              placeholder="https://..."
              disabled={!canEdit}
            />
          </label>
          <button type="button" onClick={applyImageUrl} disabled={!canEdit}>Cargar URL</button>
          <label className="file-upload-btn">
            Cargar archivo
            <input type="file" accept="image/*" onChange={handleFileUpload} disabled={!canEdit} />
          </label>
        </div>

        <div className="editor-imagenes-row editor-imagenes-style-row">
          <label>
            Color principal
            <input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} disabled={!canEdit} />
          </label>
          <label>
            Relleno
            <input type="text" value={fillColor} onChange={(event) => setFillColor(event.target.value)} disabled={!canEdit} />
          </label>
          <label>
            Grosor {width}
            <input type="range" min={1} max={16} value={width} onChange={(event) => setWidth(Number(event.target.value))} disabled={!canEdit} />
          </label>
          <label>
            Transparencia {Math.round(opacity * 100)}%
            <input type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(event) => setOpacity(Number(event.target.value) / 100)} disabled={!canEdit} />
          </label>
        </div>

        <div className="editor-imagenes-row editor-imagenes-tools-row">
          {([
            ['arrow', 'Flecha'],
            ['line', 'Linea'],
            ['free', 'Libre'],
            ['rect', 'Rectangulo'],
            ['circle', 'Circulo'],
            ['text', 'Texto'],
            ['badge', 'Etiqueta'],
            ['erase', 'Borrar'],
          ] as [Tool, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tool === value ? 'active' : ''}
              onClick={() => setTool(value)}
              disabled={!canEdit}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="editor-imagenes-row editor-imagenes-dorsales-row">
          <span>Dorsales:</span>
          {Array.from({ length: 11 }, (_, index) => index + 1).map((number) => (
            <button key={number} type="button" onClick={() => addDorsal(number)} disabled={!canEdit}>{number}</button>
          ))}
        </div>

        <div className="editor-imagenes-row editor-imagenes-actions-row">
          <button type="button" onClick={undo} disabled={!canEdit || annotations.length === 0}>Deshacer</button>
          <button type="button" onClick={clearAll} disabled={!canEdit || annotations.length === 0}>Limpiar</button>
          <button type="button" onClick={clearBackground} disabled={!canEdit || !sharedState.background}>Quitar fondo</button>
          <button type="button" onClick={exportPng}>Exportar PNG</button>
        </div>

        {!canEdit && (
          <p className="editor-imagenes-readonly-msg">
            Vista de solo lectura. Solo los roles entrenador y directivo pueden editar.
          </p>
        )}

        {(status || lastUpdateText) && (
          <p className="editor-imagenes-status">
            {status}
            {status && lastUpdateText ? ' - ' : ''}
            {lastUpdateText ? `Ultima actualizacion: ${lastUpdateText}${sharedState.updatedBy ? ` por ${sharedState.updatedBy}` : ''}` : ''}
          </p>
        )}
      </div>

      <div className="card editor-imagenes-canvas-card" ref={containerRef}>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="editor-imagenes-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {!sharedState.background && (
          <div className="editor-imagenes-empty-state">
            <strong>Sin imagen cargada</strong>
            <span>
              {canEdit
                ? 'Carga una imagen por URL o archivo para comenzar a editar.'
                : 'Esperando que un entrenador o directivo publique una imagen.'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export default EditorDeImagenes;
