import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useSharedState } from '../lib/useSharedState';
import './EditorDeImagenes.css';

type Point = { x: number; y: number };
type Tool = 'move' | 'scale' | 'arrow' | 'line' | 'rect' | 'circle' | 'free' | 'text' | 'badge' | 'erase';

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

type EditorBoard = {
  id: string;
  name: string;
  background: string | null;
  annotations: Annotation[];
};

type EditorState = {
  boards: EditorBoard[];
  activeBoardId: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

type Draft =
  | { kind: 'arrow' | 'line' | 'rect' | 'circle'; from: Point; to: Point }
  | { kind: 'free'; points: Point[] }
  | null;

const EDITOR_ROLES = new Set(['entrenador', 'directivo']);
const MIN_SCALE = 0.2;
const MAX_SCALE = 6;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function newBoard(name = 'Edicion 1'): EditorBoard {
  return {
    id: uid(),
    name,
    background: null,
    annotations: [],
  };
}

const DEFAULT_STATE: EditorState = {
  boards: [newBoard()],
  activeBoardId: null,
  updatedBy: null,
  updatedAt: null,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function cloneAnnotation(annotation: Annotation): Annotation {
  return JSON.parse(JSON.stringify(annotation)) as Annotation;
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

function normalizeState(raw: unknown): EditorState {
  const candidate = raw as Partial<EditorState & { background?: string | null; annotations?: Annotation[] }> | null;
  if (candidate && Array.isArray(candidate.boards) && candidate.boards.length > 0) {
    const boards = candidate.boards.map((board, index) => ({
      id: board.id || uid(),
      name: board.name || `Edicion ${index + 1}`,
      background: board.background || null,
      annotations: Array.isArray(board.annotations) ? board.annotations : [],
    }));
    const activeBoardId = boards.some((board) => board.id === candidate.activeBoardId)
      ? (candidate.activeBoardId as string)
      : boards[0].id;
    return {
      boards,
      activeBoardId,
      updatedBy: candidate.updatedBy || null,
      updatedAt: candidate.updatedAt || null,
    };
  }

  const legacyBoard: EditorBoard = {
    id: uid(),
    name: 'Edicion 1',
    background: candidate?.background || null,
    annotations: Array.isArray(candidate?.annotations) ? candidate.annotations : [],
  };

  return {
    boards: [legacyBoard],
    activeBoardId: legacyBoard.id,
    updatedBy: candidate?.updatedBy || null,
    updatedAt: candidate?.updatedAt || null,
  };
}

function translatePoint(point: Point, dx: number, dy: number): Point {
  return { x: clamp01(point.x + dx), y: clamp01(point.y + dy) };
}

function scalePoint(point: Point, origin: Point, factor: number): Point {
  return {
    x: clamp01(origin.x + (point.x - origin.x) * factor),
    y: clamp01(origin.y + (point.y - origin.y) * factor),
  };
}

function translateAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if ('at' in annotation) return { ...annotation, at: translatePoint(annotation.at, dx, dy) };
  if ('points' in annotation) return { ...annotation, points: annotation.points.map((point) => translatePoint(point, dx, dy)) };
  return { ...annotation, from: translatePoint(annotation.from, dx, dy), to: translatePoint(annotation.to, dx, dy) };
}

function scaleAnnotation(annotation: Annotation, origin: Point, factor: number): Annotation {
  const bounded = Math.max(MIN_SCALE, Math.min(MAX_SCALE, factor));
  if ('at' in annotation) {
    return {
      ...annotation,
      at: scalePoint(annotation.at, origin, bounded),
      width: Math.max(1, Math.round(annotation.width * bounded)),
    };
  }
  if ('points' in annotation) {
    return {
      ...annotation,
      points: annotation.points.map((point) => scalePoint(point, origin, bounded)),
      width: Math.max(1, Math.round(annotation.width * bounded)),
    };
  }
  return {
    ...annotation,
    from: scalePoint(annotation.from, origin, bounded),
    to: scalePoint(annotation.to, origin, bounded),
    width: Math.max(1, Math.round(annotation.width * bounded)),
  };
}

function distance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function findNearestAnnotationIndex(point: Point, annotations: Annotation[]): number {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  annotations.forEach((annotation, index) => {
    const center = annotationCenter(annotation);
    const dist = distance(center, point);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestIndex = index;
    }
  });

  return nearestDistance <= 0.14 ? nearestIndex : -1;
}

function drawArrow(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, width: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = Math.max(10, width * 4);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 7), to.y - headLength * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 7), to.y - headLength * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation, width: number, height: number) {
  const px = (point: Point) => ({ x: point.x * width, y: point.y * height });

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, annotation.opacity));
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

type BoardCanvasProps = {
  board: EditorBoard;
  isActive: boolean;
  canEdit: boolean;
  loadingShared: boolean;
  tool: Tool;
  primaryColor: string;
  fillColor: string;
  width: number;
  opacity: number;
  onActivate: () => void;
  onUpdateAnnotations: (next: Annotation[] | ((prev: Annotation[]) => Annotation[])) => void;
  onSetStatus: (msg: string) => void;
  onRegisterCanvas: (canvas: HTMLCanvasElement | null) => void;
};

function BoardCanvasEditor({
  board,
  isActive,
  canEdit,
  loadingShared,
  tool,
  primaryColor,
  fillColor,
  width,
  opacity,
  onActivate,
  onUpdateAnnotations,
  onSetStatus,
  onRegisterCanvas,
}: BoardCanvasProps) {
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });
  const [draft, setDraft] = useState<Draft>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const interactionRef = useRef<{
    mode: 'move' | 'scale';
    index: number;
    startPoint: Point;
    origin: Point;
    snapshot: Annotation;
  } | null>(null);

  useEffect(() => {
    onRegisterCanvas(canvasRef.current);
    return () => onRegisterCanvas(null);
  }, [onRegisterCanvas]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      imageRef.current = image;
      const containerWidth = containerRef.current?.clientWidth || 1280;
      const maxWidth = Math.max(360, Math.min(containerWidth, 1280));
      const ratio = image.height > 0 ? image.width / image.height : 16 / 9;
      setCanvasSize({ width: maxWidth, height: Math.round(maxWidth / ratio) });
    };
    image.onerror = () => {
      imageRef.current = null;
      onSetStatus('No se pudo cargar una imagen en una de las ediciones.');
    };

    if (board.background) {
      image.src = board.background;
    } else {
      imageRef.current = null;
      setCanvasSize({ width: 1280, height: 720 });
    }
  }, [board.background, onSetStatus]);

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

      for (const annotation of board.annotations) {
        drawAnnotation(ctx, annotation, canvas.width, canvas.height);
      }

      if (selectedIndex != null && board.annotations[selectedIndex]) {
        const center = annotationCenter(board.annotations[selectedIndex]);
        ctx.save();
        ctx.strokeStyle = '#9cf5bf';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(center.x * canvas.width, center.y * canvas.height, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (draft) {
        const preview: Annotation = draft.kind === 'free'
          ? { id: 'draft', kind: 'free', points: draft.points, color: primaryColor, fill: fillColor, width, opacity }
          : { id: 'draft', kind: draft.kind, from: draft.from, to: draft.to, color: primaryColor, fill: fillColor, width, opacity };
        drawAnnotation(ctx, preview, canvas.width, canvas.height);
      }
    },
    [board.annotations, draft, fillColor, opacity, primaryColor, selectedIndex, width],
  );

  useEffect(() => {
    drawAll();
  }, [drawAll, canvasSize]);

  const getPointFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const getPointFromDrop = (event: React.DragEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    onActivate();
    if (!canEdit || loadingShared) return;
    const point = getPointFromPointer(event);

    if (tool === 'erase') {
      const nearest = findNearestAnnotationIndex(point, board.annotations);
      if (nearest >= 0) {
        onUpdateAnnotations((prev) => prev.filter((_, index) => index !== nearest));
        setSelectedIndex(null);
      }
      return;
    }

    if (tool === 'move' || tool === 'scale') {
      const nearest = findNearestAnnotationIndex(point, board.annotations);
      if (nearest < 0) return;
      const target = board.annotations[nearest];
      setSelectedIndex(nearest);
      interactionRef.current = {
        mode: tool,
        index: nearest,
        startPoint: point,
        origin: annotationCenter(target),
        snapshot: cloneAnnotation(target),
      };
      setIsPointerDown(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }
      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Texto', '');
      if (!text || !text.trim()) return;
      onUpdateAnnotations((prev) => [
        ...prev,
        { id: uid(), kind: 'text', at: point, text: text.trim(), color: primaryColor, fill: fillColor, width, opacity },
      ]);
      return;
    }

    if (tool === 'badge') {
      const text = window.prompt('Numero', '10');
      if (!text || !text.trim()) return;
      onUpdateAnnotations((prev) => [
        ...prev,
        { id: uid(), kind: 'badge', at: point, text: text.trim(), color: primaryColor, fill: fillColor, width, opacity },
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
    if (!isPointerDown || !canEdit) return;
    const point = getPointFromPointer(event);

    if (interactionRef.current) {
      const interaction = interactionRef.current;
      if (interaction.mode === 'move') {
        const dx = point.x - interaction.startPoint.x;
        const dy = point.y - interaction.startPoint.y;
        onUpdateAnnotations((prev) => prev.map((item, index) => (
          index === interaction.index ? translateAnnotation(interaction.snapshot, dx, dy) : item
        )));
        return;
      }

      const baseDistance = distance(interaction.startPoint, interaction.origin);
      const currentDistance = distance(point, interaction.origin);
      const factor = baseDistance < 0.0001 ? 1 : currentDistance / baseDistance;
      onUpdateAnnotations((prev) => prev.map((item, index) => (
        index === interaction.index ? scaleAnnotation(interaction.snapshot, interaction.origin, factor) : item
      )));
      return;
    }

    if (!draft) return;
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
    if (!isPointerDown || !canEdit) return;

    if (interactionRef.current) {
      interactionRef.current = null;
      setIsPointerDown(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
      return;
    }

    if (draft) {
      if (draft.kind === 'free') {
        if (draft.points.length > 1) {
          onUpdateAnnotations((prev) => [
            ...prev,
            { id: uid(), kind: 'free', points: draft.points, color: primaryColor, fill: fillColor, width, opacity },
          ]);
        }
      } else {
        onUpdateAnnotations((prev) => [
          ...prev,
          { id: uid(), kind: draft.kind, from: draft.from, to: draft.to, color: primaryColor, fill: fillColor, width, opacity },
        ]);
      }
    }

    setDraft(null);
    setIsPointerDown(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLCanvasElement>) => {
    if (!canEdit) return;
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLCanvasElement>) => {
    if (!canEdit) return;
    const droppedValue = event.dataTransfer.getData('text/editor-number');
    if (!droppedValue) return;
    event.preventDefault();
    const point = getPointFromDrop(event);
    onActivate();
    onUpdateAnnotations((prev) => [
      ...prev,
      { id: uid(), kind: 'badge', at: point, text: droppedValue, color: primaryColor, fill: fillColor, width, opacity },
    ]);
  };

  return (
    <div className={isActive ? 'editor-board-canvas active' : 'editor-board-canvas'} ref={containerRef}>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="editor-imagenes-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
      {!board.background && (
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
  );
}

function EditorDeImagenes() {
  const { user } = useAuth();
  const canEdit = !!user && EDITOR_ROLES.has(user.role);

  const [sharedRawState, setSharedRawState, loadingShared] = useSharedState<EditorState>('editor_imagenes_state', DEFAULT_STATE);
  const sharedState = useMemo(() => normalizeState(sharedRawState), [sharedRawState]);

  const [imageUrlInput, setImageUrlInput] = useState('');
  const [tool, setTool] = useState<Tool>('arrow');
  const [primaryColor, setPrimaryColor] = useState('#dd145f');
  const [fillColor, setFillColor] = useState('rgba(23,48,122,0.22)');
  const [width, setWidth] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [status, setStatus] = useState('');
  const [zoomedBoardId, setZoomedBoardId] = useState<string | null>(null);

  const canvasRegistry = useRef<Record<string, HTMLCanvasElement | null>>({});

  const boards = sharedState.boards;
  const activeBoard = boards.find((board) => board.id === sharedState.activeBoardId) || boards[0];
  const activeBoardId = activeBoard?.id || null;
  const orderedBoards = activeBoardId
    ? [
        ...boards.filter((board) => board.id === activeBoardId),
        ...boards.filter((board) => board.id !== activeBoardId),
      ]
    : boards;
  // Los jugadores solo deben ver las ediciones que ya tienen una imagen publicada.
  const displayBoards = canEdit ? orderedBoards : boards.filter((board) => !!board.background);
  const zoomedBoard = zoomedBoardId ? boards.find((board) => board.id === zoomedBoardId) || null : null;

  const applySharedState = (next: EditorState) => {
    setSharedRawState({
      ...next,
      activeBoardId: next.activeBoardId || next.boards[0]?.id || null,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.username ?? null,
    });
  };

  const updateBoardById = (boardId: string, updater: (board: EditorBoard) => EditorBoard) => {
    applySharedState({
      ...sharedState,
      boards: sharedState.boards.map((board) => (board.id === boardId ? updater(board) : board)),
    });
  };

  const updateActiveBoard = (updater: (board: EditorBoard) => EditorBoard) => {
    if (!activeBoardId) return;
    updateBoardById(activeBoardId, updater);
  };

  useEffect(() => {
    setImageUrlInput(activeBoard?.background || '');
  }, [activeBoardId]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit || !activeBoard) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      updateActiveBoard((board) => ({ ...board, background: dataUrl }));
      setStatus(`Imagen cargada en ${activeBoard.name}: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const applyImageUrl = () => {
    if (!canEdit || !activeBoard) return;
    const next = imageUrlInput.trim();
    if (!next) return;
    updateActiveBoard((board) => ({ ...board, background: next }));
    setStatus(`Imagen actualizada en ${activeBoard.name}.`);
  };

  const undo = () => {
    if (!canEdit) return;
    updateActiveBoard((board) => ({ ...board, annotations: board.annotations.slice(0, -1) }));
  };

  const clearAll = () => {
    if (!canEdit) return;
    const confirmed = window.confirm('Se eliminaran todas las marcas de la edicion activa.');
    if (!confirmed) return;
    updateActiveBoard((board) => ({ ...board, annotations: [] }));
  };

  const clearImage = () => {
    if (!canEdit) return;
    const confirmed = window.confirm('Se eliminara la imagen de la edicion activa.');
    if (!confirmed) return;
    updateActiveBoard((board) => ({ ...board, background: null, annotations: [] }));
  };

  const exportPng = () => {
    if (!activeBoardId) return;
    const canvas = canvasRegistry.current[activeBoardId];
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${(activeBoard?.name || 'editor-imagenes').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
      link.click();
    } catch {
      setStatus('No se pudo exportar PNG. Si la imagen viene de una URL externa, verifica CORS.');
    }
  };

  const downloadBoardImage = (boardId: string, name: string) => {
    const canvas = canvasRegistry.current[boardId];
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
      link.click();
    } catch {
      setStatus('No se pudo descargar la imagen. Si viene de una URL externa, verifica CORS.');
    }
  };

  const openZoom = (boardId: string) => setZoomedBoardId(boardId);
  const closeZoom = () => setZoomedBoardId(null);

  const duplicateBoard = () => {
    if (!canEdit || !activeBoard) return;
    const duplicated: EditorBoard = {
      id: uid(),
      name: `${activeBoard.name} copia ${boards.length + 1}`,
      background: activeBoard.background,
      annotations: activeBoard.annotations.map((annotation) => ({ ...cloneAnnotation(annotation), id: uid() })),
    };

    applySharedState({
      ...sharedState,
      boards: [...boards, duplicated],
      activeBoardId: duplicated.id,
    });
    setStatus('Edicion duplicada. Baja para verla debajo de la anterior.');
  };

  const removeBoard = (boardId: string) => {
    if (!canEdit || boards.length <= 1) return;
    const confirmed = window.confirm('Se eliminara esta edicion.');
    if (!confirmed) return;

    const nextBoards = boards.filter((board) => board.id !== boardId);
    const nextActive = sharedState.activeBoardId === boardId ? nextBoards[0]?.id || null : sharedState.activeBoardId;
    applySharedState({ ...sharedState, boards: nextBoards, activeBoardId: nextActive });
  };

  const renameBoard = (boardId: string, nextName: string) => {
    if (!canEdit) return;
    applySharedState({
      ...sharedState,
      boards: boards.map((board) => (board.id === boardId ? { ...board, name: nextName || 'Edicion sin nombre' } : board)),
    });
  };

  const setActiveBoard = (boardId: string) => {
    applySharedState({ ...sharedState, activeBoardId: boardId });
  };

  const handleNumberDragStart = (event: React.DragEvent<HTMLButtonElement>, value: number) => {
    if (!canEdit) return;
    event.dataTransfer.setData('text/editor-number', String(value));
    event.dataTransfer.effectAllowed = 'copy';
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

      {canEdit && (
        <div className="card editor-imagenes-controls">
          <div className="editor-imagenes-row">
            <label>
              URL de imagen ({activeBoard?.name || 'Sin seleccion'})
              <input
                type="text"
                value={imageUrlInput}
                onChange={(event) => setImageUrlInput(event.target.value)}
                placeholder="https://..."
                disabled={!canEdit}
              />
            </label>
            <button type="button" onClick={applyImageUrl} disabled={!canEdit || !activeBoard}>Cargar URL</button>
            <label className="file-upload-btn">
              Cargar archivo
              <input type="file" accept="image/*" onChange={handleFileUpload} disabled={!canEdit || !activeBoard} />
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
              ['move', 'Mover'],
              ['scale', 'Escalar'],
              ['arrow', 'Flecha'],
              ['line', 'Linea'],
              ['free', 'Libre'],
              ['rect', 'Rectangulo'],
              ['circle', 'Circulo'],
              ['text', 'Texto'],
              ['badge', 'Numero'],
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
            <span>1-11:</span>
            {Array.from({ length: 11 }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                draggable={canEdit}
                onDragStart={(event) => handleNumberDragStart(event, number)}
                disabled={!canEdit}
              >
                {number}
              </button>
            ))}
            <small>Arrastra un numero al lienzo que quieras editar.</small>
          </div>

          <div className="editor-imagenes-row editor-imagenes-actions-row">
            <button type="button" onClick={undo} disabled={!canEdit || !activeBoard || activeBoard.annotations.length === 0}>Deshacer</button>
            <button type="button" onClick={clearAll} disabled={!canEdit || !activeBoard || activeBoard.annotations.length === 0}>Limpiar</button>
            <button type="button" onClick={clearImage} disabled={!canEdit || !activeBoard || !activeBoard.background}>Quitar imagen</button>
            <button type="button" onClick={exportPng} disabled={!activeBoard}>Exportar PNG</button>
            <button type="button" onClick={duplicateBoard} disabled={!canEdit || !activeBoard}>Duplicar edicion actual</button>
          </div>

          {(status || lastUpdateText) && (
            <p className="editor-imagenes-status">
              {status}
              {status && lastUpdateText ? ' - ' : ''}
              {lastUpdateText ? `Ultima actualizacion: ${lastUpdateText}${sharedState.updatedBy ? ` por ${sharedState.updatedBy}` : ''}` : ''}
            </p>
          )}
        </div>
      )}

      {!canEdit && (
        <div className="card editor-imagenes-controls">
          <p className="editor-imagenes-readonly-msg">
            Vista de solo lectura. Aqui veras las imagenes que los entrenadores han publicado. Puedes ampliarlas y descargarlas.
          </p>
        </div>
      )}

      <div className="editor-imagenes-stacked">
        {canEdit && displayBoards.map((board) => {
          const boardNumber = boards.findIndex((item) => item.id === board.id) + 1;

          return (
          <div key={board.id} className="card editor-board-block">
            <div className="section-header editor-board-block-header">
              <h2>Edicion {boardNumber}</h2>
              <div className="editor-board-inline-actions">
                <button type="button" onClick={() => setActiveBoard(board.id)}>
                  {board.id === activeBoardId ? 'Activa' : 'Activar'}
                </button>
                <button type="button" onClick={() => removeBoard(board.id)} disabled={!canEdit || boards.length === 1}>Eliminar</button>
              </div>
            </div>

            <div className="editor-board-meta-row">
              <input
                type="text"
                value={board.name}
                disabled={!canEdit}
                onChange={(event) => renameBoard(board.id, event.target.value)}
              />
              <small>{board.annotations.length} marcas</small>
            </div>

            <BoardCanvasEditor
              board={board}
              isActive={board.id === activeBoardId}
              canEdit={canEdit}
              loadingShared={loadingShared}
              tool={tool}
              primaryColor={primaryColor}
              fillColor={fillColor}
              width={width}
              opacity={opacity}
              onActivate={() => setActiveBoard(board.id)}
              onUpdateAnnotations={(next) => {
                updateBoardById(board.id, (prevBoard) => {
                  const resolved = typeof next === 'function'
                    ? (next as (prev: Annotation[]) => Annotation[])(prevBoard.annotations)
                    : next;
                  return { ...prevBoard, annotations: resolved };
                });
              }}
              onSetStatus={setStatus}
              onRegisterCanvas={(canvas) => {
                canvasRegistry.current[board.id] = canvas;
              }}
            />
          </div>
          );
        })}

        {!canEdit && displayBoards.length === 0 && (
          <div className="card editor-board-block">
            <p className="editor-imagenes-readonly-msg">
              Todavia no hay imagenes publicadas por el cuerpo tecnico.
            </p>
          </div>
        )}

        {!canEdit && displayBoards.map((board) => (
          <div key={board.id} className="card editor-board-block">
            <div className="section-header editor-board-block-header">
              <h2>{board.name}</h2>
              <div className="editor-board-inline-actions">
                <button type="button" onClick={() => openZoom(board.id)}>Ampliar</button>
                <button type="button" onClick={() => downloadBoardImage(board.id, board.name)}>Descargar</button>
              </div>
            </div>

            <BoardCanvasEditor
              board={board}
              isActive={false}
              canEdit={false}
              loadingShared={loadingShared}
              tool={tool}
              primaryColor={primaryColor}
              fillColor={fillColor}
              width={width}
              opacity={opacity}
              onActivate={() => {}}
              onUpdateAnnotations={() => {}}
              onSetStatus={setStatus}
              onRegisterCanvas={(canvas) => {
                canvasRegistry.current[board.id] = canvas;
              }}
            />
          </div>
        ))}
      </div>

      {zoomedBoard && (
        <div className="editor-imagenes-lightbox" role="dialog" aria-modal="true" onClick={closeZoom}>
          <div className="editor-imagenes-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <div className="editor-imagenes-lightbox-header">
              <strong>{zoomedBoard.name}</strong>
              <div className="editor-board-inline-actions">
                <button type="button" onClick={() => downloadBoardImage(zoomedBoard.id, zoomedBoard.name)}>Descargar</button>
                <button type="button" onClick={closeZoom}>Cerrar</button>
              </div>
            </div>
            <img
              src={canvasRegistry.current[zoomedBoard.id]?.toDataURL('image/png') || zoomedBoard.background || ''}
              alt={zoomedBoard.name}
              className="editor-imagenes-lightbox-img"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default EditorDeImagenes;
