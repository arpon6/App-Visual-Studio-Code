import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface Player {
  id: number;
  name: string;
  number: number;
}

export interface FieldPlayer {
  slotId: number;
  x: number;
  y: number;
  player: Player | null;
}

export interface SavedState {
  formation: string;
  fieldPlayers: FieldPlayer[];
  substitutes: (Player | null)[];
}

export const STORAGE_KEY = 'tactical_board_state';
export const SUPABASE_PLAN_TITLE = 'alineacion_inicial';

export const FORMATIONS: Record<string, { label: string; positions: { x: number; y: number }[] }> = {
  '1-4-4-2': {
    label: '1-4-4-2',
    positions: [
      { x: 50, y: 88 },
      { x: 18, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 82, y: 70 },
      { x: 18, y: 50 }, { x: 38, y: 50 }, { x: 62, y: 50 }, { x: 82, y: 50 },
      { x: 35, y: 24 }, { x: 65, y: 24 },
    ],
  },
  '1-4-3-3': {
    label: '1-4-3-3',
    positions: [
      { x: 50, y: 88 },
      { x: 18, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 82, y: 70 },
      { x: 25, y: 48 }, { x: 50, y: 44 }, { x: 75, y: 48 },
      { x: 20, y: 18 }, { x: 50, y: 14 }, { x: 80, y: 18 },
    ],
  },
  '1-4-2-3-1': {
    label: '1-4-2-3-1',
    positions: [
      { x: 50, y: 88 },
      { x: 18, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 82, y: 70 },
      { x: 35, y: 55 }, { x: 65, y: 55 },
      { x: 18, y: 36 }, { x: 50, y: 33 }, { x: 82, y: 36 },
      { x: 50, y: 14 },
    ],
  },
  '1-3-5-2': {
    label: '1-3-5-2',
    positions: [
      { x: 50, y: 88 },
      { x: 25, y: 72 }, { x: 50, y: 72 }, { x: 75, y: 72 },
      { x: 10, y: 50 }, { x: 28, y: 48 }, { x: 50, y: 46 }, { x: 72, y: 48 }, { x: 90, y: 50 },
      { x: 35, y: 22 }, { x: 65, y: 22 },
    ],
  },
  '1-5-3-2': {
    label: '1-5-3-2',
    positions: [
      { x: 50, y: 88 },
      { x: 10, y: 68 }, { x: 28, y: 72 }, { x: 50, y: 74 }, { x: 72, y: 72 }, { x: 90, y: 68 },
      { x: 25, y: 48 }, { x: 50, y: 46 }, { x: 75, y: 48 },
      { x: 35, y: 22 }, { x: 65, y: 22 },
    ],
  },
  '1-4-5-1': {
    label: '1-4-5-1',
    positions: [
      { x: 50, y: 88 },
      { x: 18, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 82, y: 70 },
      { x: 10, y: 48 }, { x: 28, y: 46 }, { x: 50, y: 44 }, { x: 72, y: 46 }, { x: 90, y: 48 },
      { x: 50, y: 16 },
    ],
  },
};

export function PlayerSelectorModal({
  players,
  usedIds,
  onSelect,
  onClose,
  title,
}: {
  players: Player[];
  usedIds: Set<number>;
  onSelect: (p: Player) => void;
  onClose: () => void;
  title: string;
}) {
  const [search, setSearch] = useState('');
  const filtered = players.filter(p => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || String(p.number).includes(q);
  });
  return (
    <div className="tb-selector-overlay" onClick={onClose}>
      <div className="tb-selector" onClick={e => e.stopPropagation()}>
        <div className="tb-selector-header">
          <span>{title}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="tb-selector-search">
          <input
            autoFocus
            type="text"
            placeholder="Buscar por nombre o número…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="tb-selector-list">
          {players.length === 0 && (
            <p style={{ color: '#a1b0d6', padding: '12px' }}>No hay jugadores en la plantilla.</p>
          )}
          {filtered.map(p => (
            <div
              key={p.id}
              className={`tb-selector-item${usedIds.has(p.id) ? ' tb-selector-item--used' : ''}`}
              onClick={() => onSelect(p)}
            >
              <span className="tb-selector-num">{p.number}</span>
              <span>{p.name}</span>
              {usedIds.has(p.id) && <span className="tb-selector-tag">En uso</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TacticalBoardProps {
  players: Player[];
  fieldPlayers: FieldPlayer[];
  formation: string;
  saving: boolean;
  saved: boolean;
  onFieldPlayersChange: (fps: FieldPlayer[]) => void;
  onFormationChange: (f: string) => void;
  usedIds: Set<number>;
}

export default function TacticalBoard({
  players,
  fieldPlayers,
  formation,
  saving,
  saved,
  onFieldPlayersChange,
  onFormationChange,
  usedIds,
}: TacticalBoardProps) {
  const [selectingSlot, setSelectingSlot] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);

  const changeFormation = (key: string) => {
    const positions = FORMATIONS[key].positions;
    const next: FieldPlayer[] = positions.map((pos, i) => ({
      slotId: i, x: pos.x, y: pos.y,
      player: fieldPlayers[i]?.player ?? null,
    }));
    onFormationChange(key);
    onFieldPlayersChange(next);
  };

  const handleSlotClick = (slotId: number) => {
    if (dragMoved.current) return;
    setSelectingSlot(slotId);
  };

  const assignPlayer = (player: Player) => {
    if (selectingSlot === null) return;
    const next = fieldPlayers.map(fp => {
      if (fp.player?.id === player.id) return { ...fp, player: null };
      if (fp.slotId === selectingSlot) return { ...fp, player };
      return fp;
    });
    onFieldPlayersChange(next);
    setSelectingSlot(null);
  };

  const removePlayer = (e: React.MouseEvent, slotId: number) => {
    e.stopPropagation();
    onFieldPlayersChange(fieldPlayers.map(fp => fp.slotId === slotId ? { ...fp, player: null } : fp));
  };

  const startDrag = (e: React.MouseEvent | React.TouchEvent, slotId: number) => {
    e.stopPropagation();
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const fp = fieldPlayers.find(f => f.slotId === slotId);
    if (!fp) return;
    dragOffset.current = {
      x: clientX - rect.left - (fp.x / 100) * rect.width,
      y: clientY - rect.top - (fp.y / 100) * rect.height,
    };
    dragMoved.current = false;
    setDragging(slotId);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const x = Math.min(97, Math.max(3, ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100));
    const y = Math.min(97, Math.max(3, ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100));
    dragMoved.current = true;
    onFieldPlayersChange(fieldPlayers.map(fp => fp.slotId === dragging ? { ...fp, x, y } : fp));
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (dragging === null) return;
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const x = Math.min(97, Math.max(3, ((e.touches[0].clientX - rect.left - dragOffset.current.x) / rect.width) * 100));
    const y = Math.min(97, Math.max(3, ((e.touches[0].clientY - rect.top - dragOffset.current.y) / rect.height) * 100));
    dragMoved.current = true;
    onFieldPlayersChange(fieldPlayers.map(fp => fp.slotId === dragging ? { ...fp, x, y } : fp));
  };

  const stopDrag = () => { setDragging(null); };

  return (
    <div className="tb-wrapper">
      <div className="tb-top-bar">
        <div className="tb-formation-bar">
          {Object.keys(FORMATIONS).map(key => (
            <button
              key={key}
              className={`tb-formation-btn${formation === key ? ' active' : ''}`}
              onClick={() => changeFormation(key)}
            >
              {FORMATIONS[key].label}
            </button>
          ))}
        </div>
        <div className="tb-save-status">
          {saving && <span className="tb-status tb-status--saving">Guardando…</span>}
          {saved && <span className="tb-status tb-status--saved">✓ Guardado</span>}
        </div>
      </div>

      <div
        className="tb-field"
        ref={fieldRef}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchMove={onTouchMove}
        onTouchEnd={stopDrag}
      >
        <svg className="tb-field-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="5" y="3" width="90" height="94" rx="1" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.3)" />
          <rect x="22" y="3" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          <rect x="36" y="3" width="28" height="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          <rect x="22" y="79" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          <rect x="36" y="89" width="28" height="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          <circle cx="50" cy="14" r="0.8" fill="rgba(255,255,255,0.25)" />
          <circle cx="50" cy="86" r="0.8" fill="rgba(255,255,255,0.25)" />
        </svg>

        {fieldPlayers.map((fp) => (
          <div
            key={fp.slotId}
            className={`tb-player${fp.slotId === 0 ? ' tb-gk' : ''}${fp.player ? ' tb-player--filled' : ''}${selectingSlot === fp.slotId ? ' tb-player--selecting' : ''}`}
            style={{ left: `${fp.x}%`, top: `${fp.y}%` }}
            onClick={() => handleSlotClick(fp.slotId)}
            onMouseDown={(e) => startDrag(e, fp.slotId)}
            onTouchStart={(e) => startDrag(e, fp.slotId)}
          >
            <div className="tb-player-circle">
              {fp.player ? fp.player.number : '+'}
            </div>
            <div className="tb-player-name">
              {fp.player ? fp.player.name.split(' ')[0] : (fp.slotId === 0 ? 'POR' : 'Vacío')}
            </div>
            {fp.player && (
              <button className="tb-player-remove" onClick={(e) => removePlayer(e, fp.slotId)}>✕</button>
            )}
          </div>
        ))}
      </div>

      {selectingSlot !== null && (
        <PlayerSelectorModal
          players={players}
          usedIds={usedIds}
          onSelect={assignPlayer}
          onClose={() => setSelectingSlot(null)}
          title={`Seleccionar jugador — ${selectingSlot === 0 ? 'Portero' : `Slot ${selectingSlot}`}`}
        />
      )}
    </div>
  );
}

// ── Mini Tactical Board ──────────────────────────────────────────────────────

interface MiniState {
  formation: string;
  fieldPlayers: FieldPlayer[];
}

function loadMiniState(storageKey: string): MiniState {
  try {
    const local = localStorage.getItem(storageKey);
    if (local) {
      const parsed: MiniState = JSON.parse(local);
      if (parsed.formation && FORMATIONS[parsed.formation] && parsed.fieldPlayers?.length > 0)
        return parsed;
    }
  } catch { /* ignorar */ }
  const defaultFormation = '1-4-4-2';
  return {
    formation: defaultFormation,
    fieldPlayers: FORMATIONS[defaultFormation].positions.map((pos, i) => ({
      slotId: i, x: pos.x, y: pos.y, player: null,
    })),
  };
}

interface MiniTacticalBoardProps {
  title: string;
  storageKey: string;
  supabaseTitle: string;
  players: Player[];
}

export function MiniTacticalBoard({ title, storageKey, supabaseTitle, players }: MiniTacticalBoardProps) {
  const initial = loadMiniState(storageKey);
  const [formation, setFormation] = useState(initial.formation);
  const [fieldPlayers, setFieldPlayers] = useState<FieldPlayer[]>(initial.fieldPlayers);
  const [selectingSlot, setSelectingSlot] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (localStorage.getItem(storageKey)) return;
    supabase.from('match_plans').select('tactics').eq('title', supabaseTitle).maybeSingle()
      .then(({ data }) => {
        if (data?.tactics) {
          const t = data.tactics as MiniState;
          if (t.formation && FORMATIONS[t.formation] && t.fieldPlayers?.length > 0) {
            setFormation(t.formation);
            setFieldPlayers(t.fieldPlayers);
            localStorage.setItem(storageKey, JSON.stringify(t));
          }
        }
      });
  }, [storageKey, supabaseTitle]);

  const persist = useCallback((f: string, fps: FieldPlayer[]) => {
    const state: MiniState = { formation: f, fieldPlayers: fps };
    localStorage.setItem(storageKey, JSON.stringify(state));
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      const { data } = await supabase.from('match_plans').select('id').eq('title', supabaseTitle).maybeSingle();
      if (data?.id) {
        await supabase.from('match_plans').update({ tactics: state }).eq('id', data.id);
      } else {
        await supabase.from('match_plans').insert({ title: supabaseTitle, tactics: state });
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 1500);
  }, [storageKey, supabaseTitle]);

  const changeFormation = (key: string) => {
    const positions = FORMATIONS[key].positions;
    const next: FieldPlayer[] = positions.map((pos, i) => ({
      slotId: i, x: pos.x, y: pos.y, player: fieldPlayers[i]?.player ?? null,
    }));
    setFormation(key);
    setFieldPlayers(next);
    persist(key, next);
  };

  const handleSlotClick = (slotId: number) => {
    if (dragMoved.current) return;
    setSelectingSlot(slotId);
  };

  const assignPlayer = (player: Player) => {
    if (selectingSlot === null) return;
    const next = fieldPlayers.map(fp => {
      if (fp.player?.id === player.id) return { ...fp, player: null };
      if (fp.slotId === selectingSlot) return { ...fp, player };
      return fp;
    });
    setFieldPlayers(next);
    setSelectingSlot(null);
    persist(formation, next);
  };

  const removePlayer = (e: React.MouseEvent, slotId: number) => {
    e.stopPropagation();
    const next = fieldPlayers.map(fp => fp.slotId === slotId ? { ...fp, player: null } : fp);
    setFieldPlayers(next);
    persist(formation, next);
  };

  const startDrag = (e: React.MouseEvent | React.TouchEvent, slotId: number) => {
    e.stopPropagation();
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const fp = fieldPlayers.find(f => f.slotId === slotId);
    if (!fp) return;
    dragOffset.current = {
      x: clientX - rect.left - (fp.x / 100) * rect.width,
      y: clientY - rect.top - (fp.y / 100) * rect.height,
    };
    dragMoved.current = false;
    setDragging(slotId);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const x = Math.min(97, Math.max(3, ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100));
    const y = Math.min(97, Math.max(3, ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100));
    dragMoved.current = true;
    setFieldPlayers(prev => prev.map(fp => fp.slotId === dragging ? { ...fp, x, y } : fp));
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (dragging === null) return;
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const x = Math.min(97, Math.max(3, ((e.touches[0].clientX - rect.left - dragOffset.current.x) / rect.width) * 100));
    const y = Math.min(97, Math.max(3, ((e.touches[0].clientY - rect.top - dragOffset.current.y) / rect.height) * 100));
    dragMoved.current = true;
    setFieldPlayers(prev => prev.map(fp => fp.slotId === dragging ? { ...fp, x, y } : fp));
  };

  const stopDrag = () => {
    if (dragging !== null) {
      if (dragMoved.current) persist(formation, fieldPlayers);
      setDragging(null);
    }
  };

  const usedIds = new Set(fieldPlayers.map(fp => fp.player?.id).filter((id): id is number => id !== undefined));

  return (
    <div className="mini-board">
      <div className="mini-board-header">
        <span className="mini-board-title">{title}</span>
        <div className="mini-formation-bar">
          {Object.keys(FORMATIONS).map(key => (
            <button
              key={key}
              className={`tb-formation-btn${formation === key ? ' active' : ''}`}
              onClick={() => changeFormation(key)}
            >
              {FORMATIONS[key].label}
            </button>
          ))}
        </div>
        <div className="tb-save-status">
          {saving && <span className="tb-status tb-status--saving">Guardando…</span>}
          {saved && <span className="tb-status tb-status--saved">✓ Guardado</span>}
        </div>
      </div>

      <div
        className="tb-field mini-field"
        ref={fieldRef}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchMove={onTouchMove}
        onTouchEnd={stopDrag}
      >
        <svg className="tb-field-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="5" y="3" width="90" height="94" rx="1" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.3)" />
          <rect x="22" y="3" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          <rect x="36" y="3" width="28" height="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          <rect x="22" y="79" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          <rect x="36" y="89" width="28" height="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          <circle cx="50" cy="14" r="0.8" fill="rgba(255,255,255,0.25)" />
          <circle cx="50" cy="86" r="0.8" fill="rgba(255,255,255,0.25)" />
        </svg>

        {fieldPlayers.map((fp) => (
          <div
            key={fp.slotId}
            className={`tb-player tb-player--mini${fp.slotId === 0 ? ' tb-gk' : ''}${fp.player ? ' tb-player--filled' : ''}${selectingSlot === fp.slotId ? ' tb-player--selecting' : ''}`}
            style={{ left: `${fp.x}%`, top: `${fp.y}%` }}
            onClick={() => handleSlotClick(fp.slotId)}
            onMouseDown={(e) => startDrag(e, fp.slotId)}
            onTouchStart={(e) => startDrag(e, fp.slotId)}
          >
            <div className="tb-player-circle">
              {fp.player ? fp.player.number : '+'}
            </div>
            <div className="tb-player-name">
              {fp.player ? fp.player.name.split(' ')[0] : ''}
            </div>
            {fp.player && (
              <button className="tb-player-remove" onClick={(e) => removePlayer(e, fp.slotId)}>✕</button>
            )}
          </div>
        ))}
      </div>

      {selectingSlot !== null && (
        <PlayerSelectorModal
          players={players}
          usedIds={usedIds}
          onSelect={assignPlayer}
          onClose={() => setSelectingSlot(null)}
          title={`${title} — ${selectingSlot === 0 ? 'Portero' : `Slot ${selectingSlot}`}`}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const NUM_SUBSTITUTES = 7;

function loadInitialState(): SavedState {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      const parsed: SavedState = JSON.parse(local);
      if (parsed.formation && FORMATIONS[parsed.formation] && parsed.fieldPlayers?.length > 0) {
        return {
          ...parsed,
          substitutes: parsed.substitutes ?? Array(NUM_SUBSTITUTES).fill(null),
        };
      }
    }
  } catch { /* ignorar */ }
  const defaultFormation = '1-4-4-2';
  return {
    formation: defaultFormation,
    fieldPlayers: FORMATIONS[defaultFormation].positions.map((pos, i) => ({
      slotId: i, x: pos.x, y: pos.y, player: null,
    })),
    substitutes: Array(NUM_SUBSTITUTES).fill(null),
  };
}

export function TacticalBoardContainer() {
  const initial = loadInitialState();
  const [players, setPlayers] = useState<Player[]>([]);
  const [formation, setFormation] = useState(initial.formation);
  const [fieldPlayers, setFieldPlayers] = useState<FieldPlayer[]>(initial.fieldPlayers);
  const [substitutes, setSubstitutes] = useState<(Player | null)[]>(initial.substitutes);
  const [selectingSub, setSelectingSub] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    supabase
      .from('match_plans').select('tactics').eq('title', SUPABASE_PLAN_TITLE).maybeSingle()
      .then(({ data }) => {
        if (data?.tactics) {
          const t = data.tactics as SavedState;
          if (t.formation && FORMATIONS[t.formation] && t.fieldPlayers?.length > 0) {
            setFormation(t.formation);
            setFieldPlayers(t.fieldPlayers);
            setSubstitutes(t.substitutes ?? Array(NUM_SUBSTITUTES).fill(null));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
          }
        }
      });
  }, []);

  const persist = useCallback((f: string, fps: FieldPlayer[], subs: (Player | null)[]) => {
    const state: SavedState = { formation: f, fieldPlayers: fps, substitutes: subs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      const { data } = await supabase.from('match_plans').select('id').eq('title', SUPABASE_PLAN_TITLE).maybeSingle();
      if (data?.id) {
        await supabase.from('match_plans').update({ tactics: state }).eq('id', data.id);
      } else {
        await supabase.from('match_plans').insert({ title: SUPABASE_PLAN_TITLE, tactics: state });
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 1500);
  }, []);

  const handleFieldPlayersChange = (fps: FieldPlayer[]) => {
    setFieldPlayers(fps);
    persist(formation, fps, substitutes);
  };

  const handleFormationChange = (f: string) => {
    setFormation(f);
  };

  const assignSub = (player: Player) => {
    if (selectingSub === null) return;
    const next = substitutes.map((s, i) => {
      if (s?.id === player.id) return null;
      if (i === selectingSub) return player;
      return s;
    });
    setSubstitutes(next);
    setSelectingSub(null);
    persist(formation, fieldPlayers, next);
  };

  const removeSub = (i: number) => {
    const next = substitutes.map((s, idx) => idx === i ? null : s);
    setSubstitutes(next);
    persist(formation, fieldPlayers, next);
  };

  // IDs en uso en titulares + suplentes
  const fieldIds = new Set(fieldPlayers.map(fp => fp.player?.id).filter((id): id is number => id !== undefined));
  const subIds = new Set(substitutes.map(s => s?.id).filter((id): id is number => id !== undefined));
  const allUsedIds = new Set([...fieldIds, ...subIds]);

  return (
    <>
      <TacticalBoard
        players={players}
        fieldPlayers={fieldPlayers}
        formation={formation}
        saving={saving}
        saved={saved}
        onFieldPlayersChange={handleFieldPlayersChange}
        onFormationChange={(f) => {
          const positions = FORMATIONS[f].positions;
          const next: FieldPlayer[] = positions.map((pos, i) => ({
            slotId: i, x: pos.x, y: pos.y,
            player: fieldPlayers[i]?.player ?? null,
          }));
          setFormation(f);
          setFieldPlayers(next);
          persist(f, next, substitutes);
        }}
        usedIds={allUsedIds}
      />

      {/* Suplentes */}
      <div className="subs-section">
        <div className="subs-header">
          <span className="section-badge">B</span>
          <div>
            <h2>Suplentes</h2>
            <small>Jugadores disponibles en el banquillo</small>
          </div>
          {saving && <span className="tb-status tb-status--saving" style={{ marginLeft: 'auto' }}>Guardando…</span>}
          {saved && <span className="tb-status tb-status--saved" style={{ marginLeft: 'auto' }}>✓ Guardado</span>}
        </div>
        <div className="subs-grid">
          {substitutes.map((sub, i) => (
            <div
              key={i}
              className={`sub-slot${sub ? ' sub-slot--filled' : ''}`}
              onClick={() => setSelectingSub(i)}
            >
              {sub ? (
                <>
                  <div className="sub-number">{sub.number}</div>
                  <div className="sub-name">{sub.name.split(' ')[0]}</div>
                  <button className="sub-remove" onClick={e => { e.stopPropagation(); removeSub(i); }}>✕</button>
                </>
              ) : (
                <div className="sub-empty">+</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectingSub !== null && (
        <PlayerSelectorModal
          players={players}
          usedIds={allUsedIds}
          onSelect={assignSub}
          onClose={() => setSelectingSub(null)}
          title={`Suplente — Slot ${selectingSub + 1}`}
        />
      )}

      {/* Pizarras tácticas */}
      <div className="mini-boards-row">
        <MiniTacticalBoard
          title="Transformación en ataque"
          storageKey="mini_board_ataque"
          supabaseTitle="mini_transformacion_ataque"
          players={players}
        />
        <MiniTacticalBoard
          title="Bloque alto"
          storageKey="mini_board_bloque_alto"
          supabaseTitle="mini_bloque_alto"
          players={players}
        />
        <MiniTacticalBoard
          title="Bloque bajo"
          storageKey="mini_board_bloque_bajo"
          supabaseTitle="mini_bloque_bajo"
          players={players}
        />
      </div>
    </>
  );
}
