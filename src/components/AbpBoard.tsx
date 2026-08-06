import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Player, PlayerSelectorModal } from './TacticalBoard';
import bloqueoIcon from '../../bloqueo.png';

// ── Types ────────────────────────────────────────────────────────────────────

type Tool = 'move' | 'focus' | 'arrow-player' | 'arrow-ball' | 'block';

interface AbpPlayer {
  id: string;
  x: number;
  y: number;
  player: Player | null;
  isGk?: boolean;
}

interface Arrow {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  type: 'player' | 'ball';
}

interface Focus {
  id: string;
  x: number;
  y: number;
}

interface Block {
  id: string;
  x: number;
  y: number;
}

interface AbpBoardState {
  name: string;
  players: AbpPlayer[];
  arrows: Arrow[];
  focuses: Focus[];
  blocks: Block[];
  videoUrl: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId = '';
    if (u.hostname.includes('youtu.be')) {
      videoId = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v') || '';
    }
    if (!videoId) return null;
    const start = u.searchParams.get('t') || '';
    return `https://www.youtube.com/embed/${videoId}${start ? `?start=${start}` : ''}`;
  } catch {
    return null;
  }
}

function defaultBoard(name: string): AbpBoardState {
  return {
    name,
    players: [
      { id: uid(), x: 50, y: 92, player: null, isGk: true },
      { id: uid(), x: 20, y: 75, player: null },
      { id: uid(), x: 40, y: 75, player: null },
      { id: uid(), x: 60, y: 75, player: null },
      { id: uid(), x: 80, y: 75, player: null },
      { id: uid(), x: 20, y: 55, player: null },
      { id: uid(), x: 40, y: 55, player: null },
      { id: uid(), x: 60, y: 55, player: null },
      { id: uid(), x: 80, y: 55, player: null },
      { id: uid(), x: 35, y: 28, player: null },
      { id: uid(), x: 65, y: 28, player: null },
    ],
    arrows: [],
    focuses: [],
    blocks: [],
    videoUrl: '',
  };
}

function normalizeBoard(board: Partial<AbpBoardState>): AbpBoardState {
  return {
    name: typeof board.name === 'string' && board.name.trim() ? board.name : 'Sin nombre',
    players: Array.isArray(board.players) ? board.players : defaultBoard('Pizarra 1').players,
    arrows: Array.isArray(board.arrows) ? board.arrows : [],
    focuses: Array.isArray(board.focuses) ? board.focuses : [],
    blocks: Array.isArray(board.blocks) ? board.blocks : [],
    videoUrl: typeof board.videoUrl === 'string' ? board.videoUrl : '',
  };
}

function normalizeBoards(boards: unknown): AbpBoardState[] {
  if (!Array.isArray(boards) || boards.length === 0) return [defaultBoard('Pizarra 1')];
  return boards.map((board) => normalizeBoard(board as Partial<AbpBoardState>));
}

function loadBoards(storageKey: string): AbpBoardState[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0)
        return normalizeBoards(parsed);
    }
  } catch { /* ignorar */ }
  return [defaultBoard('Pizarra 1')];
}

async function fetchBoards(storageTitle: string): Promise<AbpBoardState[] | null> {
  const { data } = await supabase.from('match_plans').select('tactics').eq('title', storageTitle).maybeSingle();
  if (!data?.tactics || !Array.isArray(data.tactics)) return null;
  return normalizeBoards(data.tactics);
}

// ── Half-field SVG ───────────────────────────────────────────────────────────

function HalfFieldLines() {
  return (
    <svg className="tb-field-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
      <line x1="5" y1="97" x2="95" y2="97" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" />
      <line x1="5" y1="3" x2="5" y2="97" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      <line x1="95" y1="3" x2="95" y2="97" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      <line x1="5" y1="3" x2="95" y2="3" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      <rect x="22" y="72" width="56" height="25" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" />
      <rect x="36" y="87" width="28" height="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      <circle cx="50" cy="83" r="0.9" fill="rgba(255,255,255,0.35)" />
      <path d="M 32 72 A 18 18 0 0 1 68 72" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
      <rect x="41" y="97" width="18" height="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" />
    </svg>
  );
}

function ArrowDefs() {
  return (
    <defs>
      <marker id="abp-arrow-ball" markerWidth="8" markerHeight="8" refX="7.1" refY="4" orient="auto">
        <path d="M0,0.7 L0,7.3 L8,4 z" fill="#3dffba" />
      </marker>
      <marker id="abp-arrow-player" markerWidth="8" markerHeight="8" refX="7.1" refY="4" orient="auto">
        <path d="M0,0.7 L0,7.3 L8,4 z" fill="#3d99ff" />
      </marker>
    </defs>
  );
}

// ── Single ABP Board ─────────────────────────────────────────────────────────

interface SingleBoardProps {
  board: AbpBoardState;
  allPlayers: Player[];
  onChange: (b: AbpBoardState) => void;
  readOnly?: boolean;
}

function SingleAbpBoard({ board, allPlayers, onChange, readOnly }: SingleBoardProps) {
  const [tool, setTool] = useState<Tool>('move');
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFocusId, setDraggingFocusId] = useState<string | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [drawingArrow, setDrawingArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [editingVideo, setEditingVideo] = useState(false);
  const [videoInput, setVideoInput] = useState(board.videoUrl);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const touchDragTimerRef = useRef<number | null>(null);
  const touchDragPendingIdRef = useRef<string | null>(null);

  const getRelPos = (clientX: number, clientY: number) => {
    const rect = fieldRef.current!.getBoundingClientRect();
    return {
      x: Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(97, Math.max(3, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const onFieldMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    if (target !== fieldRef.current && target.closest('.abp-player, .abp-focus, .abp-block-handle')) return;
    if (tool === 'focus') {
      onChange({ ...board, focuses: [...board.focuses, { id: uid(), ...getRelPos(e.clientX, e.clientY) }] });
    } else if (tool === 'block') {
      onChange({ ...board, blocks: [...board.blocks, { id: uid(), ...getRelPos(e.clientX, e.clientY) }] });
    } else if (tool === 'arrow-player' || tool === 'arrow-ball') {
      const pos = getRelPos(e.clientX, e.clientY);
      setDrawingArrow({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
    }
  };

  const getClientPoint = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      const touch = e.touches[0];
      return { clientX: touch.clientX, clientY: touch.clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const onFieldMouseMove = (e: React.MouseEvent) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (draggingId) {
      const x = Math.min(97, Math.max(3, ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100));
      const y = Math.min(97, Math.max(3, ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100));
      dragMoved.current = true;
      onChange({ ...board, players: board.players.map(p => p.id === draggingId ? { ...p, x, y } : p) });
      return;
    }
    if (draggingFocusId) {
      const x = Math.min(97, Math.max(3, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(97, Math.max(3, ((e.clientY - rect.top) / rect.height) * 100));
      onChange({ ...board, focuses: board.focuses.map(f => f.id === draggingFocusId ? { ...f, x, y } : f) });
      return;
    }
    if (draggingBlockId) {
      const x = Math.min(97, Math.max(3, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(97, Math.max(3, ((e.clientY - rect.top) / rect.height) * 100));
      onChange({ ...board, blocks: board.blocks.map(b => b.id === draggingBlockId ? { ...b, x, y } : b) });
      return;
    }
    if (drawingArrow) {
      const pos = getRelPos(e.clientX, e.clientY);
      setDrawingArrow(a => a ? { ...a, x2: pos.x, y2: pos.y } : null);
    }
  };

  const onFieldTouchMove = (e: React.TouchEvent) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();

    if (touchDragTimerRef.current !== null) {
      window.clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }

    if (touchDragPendingIdRef.current) {
      setDraggingId(touchDragPendingIdRef.current);
      touchDragPendingIdRef.current = null;
    }

    const { clientX, clientY } = getClientPoint(e);

    if (draggingId) {
      const x = Math.min(97, Math.max(3, ((clientX - rect.left - dragOffset.current.x) / rect.width) * 100));
      const y = Math.min(97, Math.max(3, ((clientY - rect.top - dragOffset.current.y) / rect.height) * 100));
      dragMoved.current = true;
      onChange({ ...board, players: board.players.map(p => p.id === draggingId ? { ...p, x, y } : p) });
      return;
    }
    if (draggingFocusId) {
      const x = Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.min(97, Math.max(3, ((clientY - rect.top) / rect.height) * 100));
      onChange({ ...board, focuses: board.focuses.map(f => f.id === draggingFocusId ? { ...f, x, y } : f) });
      return;
    }
    if (draggingBlockId) {
      const x = Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.min(97, Math.max(3, ((clientY - rect.top) / rect.height) * 100));
      onChange({ ...board, blocks: board.blocks.map(b => b.id === draggingBlockId ? { ...b, x, y } : b) });
    }
  };

  const onFieldMouseUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (touchDragTimerRef.current !== null) {
      window.clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }
    touchDragPendingIdRef.current = null;

    const point = getClientPoint(e);
    if (drawingArrow) {
      const pos = getRelPos(point.clientX, point.clientY);
      const dx = pos.x - drawingArrow.x1, dy = pos.y - drawingArrow.y1;
      if (Math.sqrt(dx * dx + dy * dy) > 3) {
        onChange({
          ...board,
          arrows: [...board.arrows, {
            id: uid(),
            x1: drawingArrow.x1, y1: drawingArrow.y1,
            x2: pos.x, y2: pos.y,
            type: tool === 'arrow-ball' ? 'ball' : 'player',
          }],
        });
      }
      setDrawingArrow(null);
    }
    setDraggingId(null);
    setDraggingFocusId(null);
    setDraggingBlockId(null);
  };

  const startPlayerDrag = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    if (tool !== 'move') return;
    e.stopPropagation();
    const rect = fieldRef.current!.getBoundingClientRect();
    const p = board.players.find(p => p.id === id)!;
    const { clientX, clientY } = getClientPoint(e);
    dragOffset.current = {
      x: clientX - rect.left - (p.x / 100) * rect.width,
      y: clientY - rect.top - (p.y / 100) * rect.height,
    };
    dragMoved.current = false;

    if ('touches' in e) {
      if (touchDragTimerRef.current !== null) {
        window.clearTimeout(touchDragTimerRef.current);
      }
      touchDragPendingIdRef.current = id;
      touchDragTimerRef.current = window.setTimeout(() => {
        if (touchDragPendingIdRef.current === id) {
          setDraggingId(id);
          touchDragPendingIdRef.current = null;
        }
        touchDragTimerRef.current = null;
      }, 35);
      return;
    }

    setDraggingId(id);
  };

  const handlePlayerClick = (id: string) => {
    if (dragMoved.current) return;
    if (tool === 'move') setSelectingId(id);
  };

  const assignPlayer = (player: Player) => {
    if (!selectingId) return;
    onChange({
      ...board,
      players: board.players.map(p => {
        if (p.player?.id === player.id) return { ...p, player: null };
        if (p.id === selectingId) return { ...p, player };
        return p;
      }),
    });
    setSelectingId(null);
  };

  const removeAbpPlayer = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onChange({ ...board, players: board.players.map(p => p.id === id ? { ...p, player: null } : p) });
  };

  const saveVideo = () => {
    onChange({ ...board, videoUrl: videoInput.trim() });
    setEditingVideo(false);
  };

  const usedIds = new Set(board.players.map(p => p.player?.id).filter((id): id is number => id !== undefined));
  const embedUrl = getYoutubeEmbedUrl(board.videoUrl);

  const tools: { key: Tool; label: string; title: string; iconSrc?: string }[] = [
    { key: 'move',         label: '↖',  title: 'Mover jugador' },
    { key: 'focus',        label: '◎',  title: 'Foco (zona destino)' },
    { key: 'arrow-player', label: '⤳',  title: 'Flecha jugador' },
    { key: 'arrow-ball',   label: '→',  title: 'Flecha balón' },
    { key: 'block',        label: 'Bloq.', title: 'Bloqueo', iconSrc: bloqueoIcon },
  ];

  return (
    <div className="abp-board">
      {/* Nombre de la jugada */}
      <div className="abp-play-name">
        {!readOnly && editingBoardName ? (
          <input
            className="abp-play-name-input"
            autoFocus
            value={board.name}
            onChange={e => onChange({ ...board, name: e.target.value })}
            onBlur={() => setEditingBoardName(false)}
            onKeyDown={e => e.key === 'Enter' && setEditingBoardName(false)}
          />
        ) : (
          <span className="abp-play-name-text" onClick={() => !readOnly && setEditingBoardName(true)}>
            {board.name || 'Sin nombre'}
            {!readOnly && <span className="abp-play-name-edit">✎</span>}
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="abp-toolbar">
          {tools.map(t => (
            <button
              key={t.key}
              title={t.title}
              className={`abp-tool-btn${tool === t.key ? ' active' : ''}`}
              onClick={() => setTool(t.key)}
            >
              {t.iconSrc ? (
                <img src={t.iconSrc} alt={t.title} className="abp-tool-icon" />
              ) : (
                t.label
              )}
              <span className="abp-tool-label">{t.title}</span>
            </button>
          ))}
          <button
            className="abp-tool-btn abp-tool-clear"
            onClick={() => onChange({ ...board, arrows: [], focuses: [], blocks: [] })}
          >
            ✕ Limpiar
          </button>
        </div>
      )}

      <div
        className="tb-field abp-field"
        ref={fieldRef}
        onMouseDown={onFieldMouseDown}
        onMouseMove={onFieldMouseMove}
        onMouseUp={onFieldMouseUp}
        onMouseLeave={onFieldMouseUp}
        onTouchMove={onFieldTouchMove}
        onTouchEnd={onFieldMouseUp}
        onTouchCancel={onFieldMouseUp}
      >
        <HalfFieldLines />

        <svg className="abp-svg-layer" viewBox="0 0 100 100" preserveAspectRatio="none">

          {/* Focos */}
          {board.focuses.map(f => (
            <circle key={f.id} cx={f.x} cy={f.y} r="6"
              fill="rgba(255,220,0,0.18)" stroke="#ffd700" strokeWidth="0.8" strokeDasharray="2 1"
            />
          ))}

          {/* Bloqueos */}
          {board.blocks.map(b => (
            <image
              key={b.id}
              href={bloqueoIcon}
              x={b.x - 3.5}
              y={b.y - 3.5}
              width="7"
              height="7"
              preserveAspectRatio="xMidYMid meet"
            />
          ))}

        </svg>

        <svg className="abp-svg-layer abp-svg-layer--arrows" viewBox="0 0 100 100" preserveAspectRatio="none">
          <ArrowDefs />

          {/* Flechas */}
          {board.arrows.map(a => (
            <line key={a.id}
              x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
              stroke={a.type === 'ball' ? '#3dffba' : '#3d99ff'}
              strokeWidth="0.65"
              strokeLinecap="round"
              strokeDasharray={a.type === 'player' ? '2.4 1.7' : undefined}
              markerEnd={`url(#abp-arrow-${a.type})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onChange({ ...board, arrows: board.arrows.filter(x => x.id !== a.id) })}
            />
          ))}

          {drawingArrow && (
            <line
              x1={drawingArrow.x1} y1={drawingArrow.y1}
              x2={drawingArrow.x2} y2={drawingArrow.y2}
              stroke={tool === 'arrow-ball' ? '#3dffba' : '#3d99ff'}
              strokeWidth="0.65"
              strokeLinecap="round"
              strokeDasharray={tool === 'arrow-player' ? '2.4 1.7' : undefined}
              markerEnd={`url(#abp-arrow-${tool === 'arrow-ball' ? 'ball' : 'player'})`}
              opacity="0.65" pointerEvents="none"
            />
          )}
        </svg>

        {/* Drag handles para focos */}
        {board.focuses.map(f => (
          <div key={f.id} className="abp-focus"
            style={{ left: `${f.x}%`, top: `${f.y}%` }}
            onMouseDown={e => { e.stopPropagation(); setDraggingFocusId(f.id); }}
            onClick={e => e.stopPropagation()}
          >
            <button className="abp-focus-remove"
              onClick={e => { e.stopPropagation(); onChange({ ...board, focuses: board.focuses.filter(x => x.id !== f.id) }); }}>✕</button>
          </div>
        ))}

        {/* Drag handles para bloqueos */}
        {board.blocks.map(b => (
          <div key={b.id} className="abp-block-handle"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            onMouseDown={e => { e.stopPropagation(); setDraggingBlockId(b.id); }}
            onClick={e => e.stopPropagation()}
          >
            <button className="abp-focus-remove"
              onClick={e => { e.stopPropagation(); onChange({ ...board, blocks: board.blocks.filter(x => x.id !== b.id) }); }}>✕</button>
          </div>
        ))}

        {/* Jugadores */}
        {board.players.map(p => (
          <div
            key={p.id}
            className={`tb-player tb-player--mini abp-player${p.isGk ? ' abp-gk' : ''}${p.player ? ' tb-player--filled' : ''}${selectingId === p.id ? ' tb-player--selecting' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onMouseDown={e => startPlayerDrag(e, p.id)}
            onTouchStart={e => startPlayerDrag(e, p.id)}
            onClick={() => handlePlayerClick(p.id)}
          >
            <div className="tb-player-circle">{p.player ? p.player.number : '+'}</div>
            <div className="tb-player-name">{p.player ? p.player.name.split(' ')[0] : (p.isGk ? 'POR' : '')}</div>
            {p.player && <button className="tb-player-remove" onClick={e => removeAbpPlayer(e, p.id)}>✕</button>}
          </div>
        ))}
      </div>

      {/* Vídeo de referencia */}
      <div className="abp-video-section">
        <div className="abp-video-header">
          <span className="abp-video-label">🎬 Animación / referencia en vídeo</span>
          {!readOnly && (
            <button className="abp-tool-btn" onClick={() => { setVideoInput(board.videoUrl); setEditingVideo(v => !v); }}>
              {editingVideo ? 'Cancelar' : (board.videoUrl ? '✎ Cambiar' : '+ Añadir vídeo')}
            </button>
          )}
        </div>
        {editingVideo && (
          <div className="abp-video-input-row">
            <input
              className="abp-video-input"
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={videoInput}
              onChange={e => setVideoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveVideo()}
              autoFocus
            />
            <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={saveVideo}>Guardar</button>
            {board.videoUrl && (
              <button className="abp-tool-btn abp-tool-clear" onClick={() => { onChange({ ...board, videoUrl: '' }); setEditingVideo(false); }}>
                ✕ Quitar
              </button>
            )}
          </div>
        )}
        {embedUrl && !editingVideo && (
          <div className="abp-video-embed">
            <iframe
              src={embedUrl}
              title="Referencia táctica"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </div>

      {selectingId !== null && (
        <PlayerSelectorModal
          players={allPlayers}
          usedIds={usedIds}
          onSelect={assignPlayer}
          onClose={() => setSelectingId(null)}
          title={`Seleccionar jugador${board.players.find(p => p.id === selectingId)?.isGk ? ' — Portero' : ''}`}
        />
      )}
    </div>
  );
}

// ── ABP Section ───────────────────────────────────────────────────────────────

interface AbpSectionProps {
  title: string;
  badge: string;
  storageKey: string;
  supabaseTitle: string;
  players: Player[];
  readOnly?: boolean;
}

// ── Repository picker modal ───────────────────────────────────────────────────

interface RepoPickerProps {
  repoStorageKeys: string[];
  onImport: (board: AbpBoardState) => void;
  onClose: () => void;
}

function RepoPicker({ repoStorageKeys, onImport, onClose }: RepoPickerProps) {
  const repoBoards: AbpBoardState[] = repoStorageKeys.flatMap(k => loadBoards(k));
  return (
    <div className="tb-selector-overlay" onClick={onClose}>
      <div className="tb-selector" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
        <div className="tb-selector-header">
          <span>Cargar del repositorio</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="tb-selector-list">
          {repoBoards.length === 0 && (
            <p style={{ color: '#a1b0d6', padding: '16px' }}>No hay jugadas en el repositorio.</p>
          )}
          {repoBoards.map((b, i) => (
            <div key={i} className="tb-selector-item" onClick={() => { onImport(b); onClose(); }}>
              <span className="tb-selector-num" style={{ fontSize: '1rem' }}>📋</span>
              <div>
                <div style={{ fontWeight: 700, color: '#cdd4f1' }}>{b.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#a1b0d6', marginTop: 2 }}>
                  {b.players.filter(p => p.player).length} jugadores · {b.arrows.length} flechas
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AbpSection({ title, badge, storageKey, supabaseTitle, players, repoStorageKeys, readOnly }: AbpSectionProps & { repoStorageKeys?: string[]; readOnly?: boolean }) {
  const [boards, setBoards] = useState<AbpBoardState[]>(() => loadBoards(storageKey));
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const syncFromRemote = async () => {
      const remoteBoards = await fetchBoards(supabaseTitle);
      if (!isMounted || !remoteBoards) return;
      setBoards(remoteBoards);
      localStorage.setItem(storageKey, JSON.stringify(remoteBoards));
    };

    void syncFromRemote();

    const channel = supabase
      .channel(`abp_repo_sync_${supabaseTitle}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_plans', filter: `title=eq.${supabaseTitle}` }, () => {
        void syncFromRemote();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [storageKey, supabaseTitle]);

  const persist = useCallback((next: AbpBoardState[]) => {
    const normalized = normalizeBoards(next);
    setBoards(normalized);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      const { data } = await supabase.from('match_plans').select('id').eq('title', supabaseTitle).maybeSingle();
      if (data?.id) {
        await supabase.from('match_plans').update({ tactics: normalized }).eq('id', data.id);
      } else {
        await supabase.from('match_plans').insert({ title: supabaseTitle, tactics: normalized });
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 1500);
  }, [storageKey, supabaseTitle]);

  const updateBoard = (idx: number, b: AbpBoardState) => {
    const next = boards.map((old, i) => i === idx ? b : old);
    setBoards(next);
    persist(next);
  };

  const addBoard = () => {
    const next = [...boards, defaultBoard(`Pizarra ${boards.length + 1}`)];
    setBoards(next);
    setActiveIdx(next.length - 1);
    persist(next);
  };

  const removeBoard = (idx: number) => {
    if (boards.length === 1) return;
    const next = boards.filter((_, i) => i !== idx);
    setBoards(next);
    setActiveIdx(Math.min(activeIdx, next.length - 1));
    persist(next);
  };

  const renameBoard = (idx: number, name: string) => {
    const next = boards.map((b, i) => i === idx ? { ...b, name } : b);
    setBoards(next);
    persist(next);
  };

  const moveBoard = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= boards.length) return;

    const next = [...boards];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];

    const nextActiveIdx =
      activeIdx === idx
        ? targetIdx
        : activeIdx === targetIdx
          ? idx
          : activeIdx;

    setBoards(next);
    setActiveIdx(nextActiveIdx);
    persist(next);
  };

  const importFromRepo = (board: AbpBoardState) => {
    const imported = { ...board, name: board.name + ' (importada)' };
    const next = [...boards, imported];
    setBoards(next);
    setActiveIdx(next.length - 1);
    persist(next);
  };

  const saveToRepo = (repoKey: string) => {
    const current = boards[activeIdx];
    const existing = loadBoards(repoKey);
    const alreadyExists = existing.some(b => b.name === current.name);
    const toSave = alreadyExists
      ? existing.map(b => b.name === current.name ? { ...current } : b)
      : [...existing, { ...current }];
    localStorage.setItem(repoKey, JSON.stringify(toSave));
    // Sincronizar con Supabase
    const supabaseKey = repoKey === 'abp_repo_ofensivo' ? 'abp_repo_ofensivo' : 'abp_repo_defensivo';
    supabase.from('match_plans').select('id').eq('title', supabaseKey).maybeSingle().then(({ data }) => {
      if (data?.id) {
        supabase.from('match_plans').update({ tactics: toSave }).eq('id', data.id);
      } else {
        supabase.from('match_plans').insert({ title: supabaseKey, tactics: toSave });
      }
    });
    setSavedToRepo(true);
    setTimeout(() => setSavedToRepo(false), 2000);
  };

  const [savedToRepo, setSavedToRepo] = useState(false);
  const [showRepoMenu, setShowRepoMenu] = useState(false);

  return (
    <div className="card plan-card">
      <div className="section-header card-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="section-badge">{badge}</span>
          <div>
            <h2>{title}</h2>
            <small>Pizarras estratégicas de balón parado</small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && <span className="tb-status tb-status--saving">Guardando…</span>}
          {saved && <span className="tb-status tb-status--saved">✓ Guardado</span>}
          {!readOnly && repoStorageKeys && repoStorageKeys.length > 0 && (
            <button className="btn" onClick={() => setShowRepoPicker(true)}>📂 Del repositorio</button>
          )}
          {!readOnly && repoStorageKeys && repoStorageKeys.length > 0 && (
            <div className="abp-repo-save-wrap">
              <button
                className={`btn${savedToRepo ? ' abp-repo-saved' : ''}`}
                onClick={() => setShowRepoMenu(v => !v)}
              >
                {savedToRepo ? '✓ Guardado' : '📤 Guardar en repositorio'}
              </button>
              {showRepoMenu && (
                <div className="abp-repo-menu" onMouseLeave={() => setShowRepoMenu(false)}>
                  <button onClick={() => { saveToRepo('abp_repo_ofensivo'); setShowRepoMenu(false); }}>Jugadas ofensivas</button>
                  <button onClick={() => { saveToRepo('abp_repo_defensivo'); setShowRepoMenu(false); }}>Jugadas defensivas</button>
                </div>
              )}
            </div>
          )}
          {!readOnly && <button className="btn" onClick={addBoard}>+ Nueva pizarra</button>}
        </div>
      </div>

      <div className="abp-tabs">
        {boards.map((b, i) => (
          <div key={i} className={`abp-tab${activeIdx === i ? ' active' : ''}`} onClick={() => setActiveIdx(i)}>
            {!readOnly && boards.length > 1 && (
              <div className="abp-tab-actions" onClick={e => e.stopPropagation()}>
                <button
                  className="abp-tab-move"
                  title="Mover jugada a la izquierda"
                  aria-label="Mover jugada a la izquierda"
                  disabled={i === 0}
                  onClick={() => moveBoard(i, -1)}
                >
                  ◀
                </button>
                <button
                  className="abp-tab-move"
                  title="Mover jugada a la derecha"
                  aria-label="Mover jugada a la derecha"
                  disabled={i === boards.length - 1}
                  onClick={() => moveBoard(i, 1)}
                >
                  ▶
                </button>
              </div>
            )}
            {!readOnly && editingName === i ? (
              <input
                className="abp-tab-input" autoFocus value={b.name}
                onChange={e => renameBoard(i, e.target.value)}
                onBlur={() => setEditingName(null)}
                onKeyDown={e => e.key === 'Enter' && setEditingName(null)}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span onDoubleClick={e => { if (readOnly) return; e.stopPropagation(); setEditingName(i); }}>{b.name}</span>
            )}
            {!readOnly && boards.length > 1 && (
              <button className="abp-tab-remove" onClick={e => { e.stopPropagation(); removeBoard(i); }}>✕</button>
            )}
          </div>
        ))}
      </div>

      <SingleAbpBoard
        board={boards[activeIdx]}
        allPlayers={players}
        onChange={b => updateBoard(activeIdx, b)}
        readOnly={readOnly}
      />

      {showRepoPicker && repoStorageKeys && (
        <RepoPicker
          repoStorageKeys={repoStorageKeys}
          onImport={importFromRepo}
          onClose={() => setShowRepoPicker(false)}
        />
      )}
    </div>
  );
}

// ── AbpContainer ──────────────────────────────────────────────────────────────

export function AbpContainer() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [offensiveType, setOffensiveType] = useState<'corner' | 'falta_lateral' | 'falta_frontal'>('corner');
  const [defensiveType, setDefensiveType] = useState<'corner' | 'falta_lateral' | 'falta_frontal'>('corner');

  const playTypeOptions: { key: 'corner' | 'falta_lateral' | 'falta_frontal'; label: string }[] = [
    { key: 'corner', label: 'Córner' },
    { key: 'falta_lateral', label: 'Falta lateral' },
    { key: 'falta_frontal', label: 'Falta frontal' },
  ];

  const getTypedKey = (baseKey: string, type: 'corner' | 'falta_lateral' | 'falta_frontal') => {
    if (type === 'corner') return baseKey;
    return `${baseKey}_${type}`;
  };

  const getTypeLabel = (type: 'corner' | 'falta_lateral' | 'falta_frontal') => {
    const found = playTypeOptions.find(option => option.key === type);
    return found ? found.label : 'Córner';
  };

  const onOffensiveTypeChange = (value: string) => {
    if (value === 'corner' || value === 'falta_lateral' || value === 'falta_frontal') {
      setOffensiveType(value);
    }
  };

  const onDefensiveTypeChange = (value: string) => {
    if (value === 'corner' || value === 'falta_lateral' || value === 'falta_frontal') {
      setDefensiveType(value);
    }
  };

  useEffect(() => {
    supabase.from('plantilla').select('number, first_name, last_name1').then(({ data }) => {
      if (!data) return;
      const mapped: Player[] = data.map((p: any, i: number) => ({
        id: i,
        name: [p.first_name, p.last_name1].filter(Boolean).join(' '),
        number: p.number || 0,
      }));
      mapped.sort((a, b) => a.number - b.number);
      setPlayers(mapped);
    });
  }, []);

  return (
    <>
      <div className="abp-type-wrap">
        <div className="abp-type-select-row">
          <label className="abp-type-select-label" htmlFor="abp-offensive-type">Tipo de jugada ofensiva</label>
          <select
            id="abp-offensive-type"
            className="abp-type-select"
            value={offensiveType}
            onChange={e => onOffensiveTypeChange(e.target.value)}
          >
            {playTypeOptions.map(option => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
        <AbpSection
          key={`abp_ofensivo_${offensiveType}`}
          title={`ABP Ofensivo · ${getTypeLabel(offensiveType)}`}
          badge="B"
          storageKey={getTypedKey('abp_ofensivo', offensiveType)}
          supabaseTitle={getTypedKey('abp_ofensivo', offensiveType)}
          players={players}
          repoStorageKeys={['abp_repo_ofensivo', 'abp_repo_defensivo']}
        />
      </div>

      <div className="abp-type-wrap">
        <div className="abp-type-select-row">
          <label className="abp-type-select-label" htmlFor="abp-defensive-type">Tipo de jugada defensiva</label>
          <select
            id="abp-defensive-type"
            className="abp-type-select"
            value={defensiveType}
            onChange={e => onDefensiveTypeChange(e.target.value)}
          >
            {playTypeOptions.map(option => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
        <AbpSection
          key={`abp_defensivo_${defensiveType}`}
          title={`ABP Defensivo · ${getTypeLabel(defensiveType)}`}
          badge="C"
          storageKey={getTypedKey('abp_defensivo', defensiveType)}
          supabaseTitle={getTypedKey('abp_defensivo', defensiveType)}
          players={players}
          repoStorageKeys={['abp_repo_ofensivo', 'abp_repo_defensivo']}
        />
      </div>
    </>
  );
}
