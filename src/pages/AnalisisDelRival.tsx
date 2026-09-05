import { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './PlanDePartido.css';
import './AnalisisDelRival.css';
import rivalPlayersCsv from '../../Base de datos de jugadores - Matriz.csv?raw';
import TacticalBoard, { FORMATIONS, type FieldPlayer, type Player } from '../components/TacticalBoard';
import { AbpSection } from '../components/AbpBoard';
import { LEAGUE_TEAMS, MY_TEAM_NAME } from '../lib/leagueTeams';
import { supabase } from '../lib/supabaseClient';

type RivalBoardState = {
  formation: string;
  fieldPlayers: FieldPlayer[];
};

type RivalPlayerRow = {
  id: number;
  specificPosition: string;
  fullName: string;
  number: string;
  traits: string;
};

type RivalTeamData = {
  players: RivalPlayerRow[];
  titular: RivalBoardState;
  others: RivalBoardState;
  strengths: string;
  weaknesses: string;
  sheetSynced?: boolean;
  sheetLastSync?: string | null;
};

type RivalGlobalState = {
  selectedTeam: string;
  teams: Record<string, RivalTeamData>;
};

type SectionKey = 'plantilla' | 'campos' | 'modelo' | 'abp';

const SHARED_STATE_KEY = 'analisis_rival_v1';
const SEASON_CONFIG_KEY = 'analisis_rival_active_season';
const DEFAULT_FORMATION = '1-4-4-2';
const GOOGLE_SHEET_ID = '1Psz7LtFGTR8rNPdge7BrN_k0r_78XscY3o6PuuR354E';
const GOOGLE_SHEET_GID = '0';
const SHEET_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const SECTION_OPTIONS: { key: SectionKey; label: string }[] = [
  { key: 'plantilla', label: 'Plantilla rival' },
  { key: 'campos', label: 'Posicionamiento en campo' },
  { key: 'modelo', label: 'Modelo de juego' },
  { key: 'abp', label: 'ABP' },
];

const DEFAULT_SECTION_SELECTION: Record<SectionKey, boolean> = {
  plantilla: true,
  campos: true,
  modelo: true,
  abp: true,
};

function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function slugifyTeamName(name: string): string {
  return normalizeTeamName(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sin_equipo';
}

function buildSeasonScopedKey(baseKey: string, season: string | null): string {
  const seasonSlug = season ? slugifyTeamName(season) : '';
  return seasonSlug ? `${baseKey}__${seasonSlug}` : baseKey;
}

function createFieldPlayers(formation: string): FieldPlayer[] {
  const base = FORMATIONS[formation]?.positions ?? FORMATIONS[DEFAULT_FORMATION].positions;
  return base.map((pos, idx) => ({
    slotId: idx,
    x: pos.x,
    y: pos.y,
    player: null,
  }));
}

function createDefaultPlayers(): RivalPlayerRow[] {
  return Array.from({ length: 18 }, (_, idx) => ({
    id: idx + 1,
    specificPosition: '',
    fullName: '',
    number: '',
    traits: '',
  }));
}

function createDefaultTeamData(): RivalTeamData {
  return {
    players: createDefaultPlayers(),
    titular: {
      formation: DEFAULT_FORMATION,
      fieldPlayers: createFieldPlayers(DEFAULT_FORMATION),
    },
    others: {
      formation: DEFAULT_FORMATION,
      fieldPlayers: createFieldPlayers(DEFAULT_FORMATION),
    },
    strengths: '',
    weaknesses: '',
    sheetSynced: false,
    sheetLastSync: null,
  };
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    const nextChar = raw[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  }

  return rows;
}

function looksLikeHeader(row: string[]): boolean {
  const joined = row.join(' ').toLowerCase();
  return joined.includes('jugador') || joined.includes('equipo') || joined.includes('dorsal') || joined.includes('caracter');
}

function buildGoogleSheetCsvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function mapSheetRowsToPlayersByTeam(raw: string, teamName: string): RivalPlayerRow[] {
  const rows = parseCsv(raw);
  const dataRows = looksLikeHeader(rows[0] || []) ? rows.slice(1) : rows;
  const normalizedTeam = normalizeTeamName(teamName);

  return dataRows
    .filter((row) => normalizeTeamName(row[2] || '') === normalizedTeam)
    .map((row, idx) => ({
      id: idx + 1,
      specificPosition: String(row[1] || '').trim(),
      fullName: String(row[3] || '').trim(),
      number: String(row[4] || '').trim(),
      traits: String(row[5] || '').trim(),
    }))
    .filter((row) => row.specificPosition || row.fullName || row.number || row.traits)
    .slice(0, 40);
}

function sortPlayersByNumber(rows: RivalPlayerRow[]): RivalPlayerRow[] {
  return [...rows].sort((a, b) => {
    const numA = Number(a.number);
    const numB = Number(b.number);
    const hasA = Number.isFinite(numA) && a.number.trim() !== '';
    const hasB = Number.isFinite(numB) && b.number.trim() !== '';

    if (hasA && hasB) return numA - numB;
    if (hasA) return -1;
    if (hasB) return 1;
    return a.fullName.localeCompare(b.fullName, 'es');
  });
}

function applyFormation(prev: FieldPlayer[], formation: string): FieldPlayer[] {
  const positions = FORMATIONS[formation]?.positions ?? FORMATIONS[DEFAULT_FORMATION].positions;
  return positions.map((pos, idx) => ({
    slotId: idx,
    x: pos.x,
    y: pos.y,
    player: prev[idx]?.player ?? null,
  }));
}

function sanitizeLoadedTeamData(input: Partial<RivalTeamData> | undefined): RivalTeamData {
  const fallback = createDefaultTeamData();
  const rawPlayers = Array.isArray(input?.players) ? input?.players : fallback.players;
  const players = rawPlayers.slice(0, 40).map((row, idx) => ({
    id: Number.isFinite(Number((row as RivalPlayerRow).id)) ? Number((row as RivalPlayerRow).id) : idx + 1,
    specificPosition: typeof (row as RivalPlayerRow).specificPosition === 'string' ? (row as RivalPlayerRow).specificPosition : '',
    fullName: typeof (row as RivalPlayerRow).fullName === 'string' ? (row as RivalPlayerRow).fullName : '',
    number: typeof (row as RivalPlayerRow).number === 'string' ? (row as RivalPlayerRow).number : '',
    traits: typeof (row as RivalPlayerRow).traits === 'string' ? (row as RivalPlayerRow).traits : '',
  }));

  const normalizeBoard = (board: Partial<RivalBoardState> | undefined): RivalBoardState => {
    const formation = typeof board?.formation === 'string' && FORMATIONS[board.formation] ? board.formation : DEFAULT_FORMATION;
    const defaultPositions = createFieldPlayers(formation);
    const loadedFieldPlayers = Array.isArray(board?.fieldPlayers) ? board.fieldPlayers : defaultPositions;
    const fieldPlayers = defaultPositions.map((base, idx) => {
      const loaded = loadedFieldPlayers[idx] as FieldPlayer | undefined;
      if (!loaded) return base;
      const safeX = Number.isFinite(Number(loaded.x)) ? Number(loaded.x) : base.x;
      const safeY = Number.isFinite(Number(loaded.y)) ? Number(loaded.y) : base.y;
      return {
        ...base,
        x: Math.min(97, Math.max(3, safeX)),
        y: Math.min(97, Math.max(3, safeY)),
        player: loaded.player ?? null,
      };
    });
    return { formation, fieldPlayers };
  };

  return {
    players: players.length > 0 ? players : fallback.players,
    titular: normalizeBoard(input?.titular),
    others: normalizeBoard(input?.others),
    strengths: typeof input?.strengths === 'string' ? input.strengths : '',
    weaknesses: typeof input?.weaknesses === 'string' ? input.weaknesses : '',
    sheetSynced: Boolean(input?.sheetSynced),
    sheetLastSync: typeof input?.sheetLastSync === 'string' ? input.sheetLastSync : null,
  };
}

function AnalisisDelRival() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [teamsData, setTeamsData] = useState<Record<string, RivalTeamData>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Record<SectionKey, boolean>>(DEFAULT_SECTION_SELECTION);
  const [activeSeason, setActiveSeason] = useState<string | null>(null);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [sheetSyncError, setSheetSyncError] = useState('');
  const [sheetSyncStatus, setSheetSyncStatus] = useState('');
  const [pushingSheet, setPushingSheet] = useState(false);
  const [sheetPushError, setSheetPushError] = useState('');
  const [sheetPushStatus, setSheetPushStatus] = useState('');

  const hydratedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableTeams = useMemo(
    () => LEAGUE_TEAMS.filter((team) => normalizeTeamName(team) !== normalizeTeamName(MY_TEAM_NAME)),
    []
  );

  const filteredTeams = useMemo(() => {
    const term = normalizeTeamName(teamFilter);
    if (!term) return availableTeams;
    return availableTeams.filter((team) => normalizeTeamName(team).includes(term));
  }, [availableTeams, teamFilter]);

  const sharedStateKey = useMemo(() => buildSeasonScopedKey(SHARED_STATE_KEY, activeSeason), [activeSeason]);

  const currentTeamData = selectedTeam ? (teamsData[selectedTeam] ?? createDefaultTeamData()) : null;
  const sortedPlayers = useMemo(
    () => sortPlayersByNumber(currentTeamData?.players ?? []),
    [currentTeamData?.players]
  );

  const rivalPlayers = useMemo<Player[]>(() => {
    if (!currentTeamData) return [];
    return sortedPlayers
      .filter((row) => row.fullName.trim().length > 0)
      .map((row) => ({
        id: row.id,
        name: row.fullName.trim(),
        number: Number(row.number) || 0,
      }))
      .sort((a, b) => a.number - b.number);
  }, [sortedPlayers]);

  const titularUsedIds = useMemo(
    () => new Set((currentTeamData?.titular.fieldPlayers || []).map((fp) => fp.player?.id).filter((id): id is number => id !== undefined)),
    [currentTeamData]
  );

  const othersUsedIds = useMemo(
    () => new Set((currentTeamData?.others.fieldPlayers || []).map((fp) => fp.player?.id).filter((id): id is number => id !== undefined)),
    [currentTeamData]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: seasonConfig, error: seasonError } = await supabase
        .from('shared_state')
        .select('value')
        .eq('key', SEASON_CONFIG_KEY)
        .maybeSingle();

      if (seasonError) {
        console.error('Error cargando temporada activa del analisis del rival:', seasonError);
      }

      const nextSeason = typeof seasonConfig?.value === 'string' && seasonConfig.value.trim().length > 0
        ? seasonConfig.value.trim()
        : null;

      setActiveSeason(nextSeason);

      const targetKey = buildSeasonScopedKey(SHARED_STATE_KEY, nextSeason);
      const { data, error } = await supabase.from('shared_state').select('value').eq('key', targetKey).maybeSingle();
      if (error) {
        console.error('Error cargando analisis del rival:', error);
        setLoading(false);
        hydratedRef.current = true;
        return;
      }

      if (data?.value && typeof data.value === 'object') {
        const loaded = data.value as Partial<RivalGlobalState>;
        const loadedTeamsRaw = loaded.teams && typeof loaded.teams === 'object' ? loaded.teams : {};
        const loadedTeams = Object.entries(loadedTeamsRaw).reduce<Record<string, RivalTeamData>>((acc, [team, value]) => {
          acc[team] = sanitizeLoadedTeamData(value as Partial<RivalTeamData>);
          return acc;
        }, {});
        setTeamsData(loadedTeams);

        const initialTeam =
          typeof loaded.selectedTeam === 'string' && availableTeams.includes(loaded.selectedTeam)
            ? loaded.selectedTeam
            : Object.keys(loadedTeams).find((team) => availableTeams.includes(team)) || '';

        setSelectedTeam(initialTeam);
        setTeamFilter(initialTeam);
      }

      setLoading(false);
      hydratedRef.current = true;
    };

    void load();
  }, [availableTeams]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    setSaved(false);
    setSaveError('');

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      const payload: RivalGlobalState = {
        selectedTeam,
        teams: teamsData,
      };
      const { error } = await supabase
        .from('shared_state')
        .upsert({ key: sharedStateKey, value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });

      setSaving(false);
      if (error) {
        console.error('Error guardando analisis del rival:', error);
        setSaveError('No se pudo guardar automaticamente.');
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 700);
  }, [selectedTeam, sharedStateKey, teamsData]);

  useEffect(() => {
    if (!selectedTeam) return;
    if (teamsData[selectedTeam]) return;
    setTeamsData((prev) => ({
      ...prev,
      [selectedTeam]: createDefaultTeamData(),
    }));
  }, [selectedTeam, teamsData]);

  useEffect(() => {
    if (!currentTeamData) return;
    const byId = new Map<number, Player>(rivalPlayers.map((p) => [p.id, p]));

    const syncBoard = (board: RivalBoardState) => {
      let changed = false;
      const nextFieldPlayers = board.fieldPlayers.map((fp) => {
        if (!fp.player) return fp;
        const updated = byId.get(fp.player.id) ?? null;
        if (updated !== fp.player) changed = true;
        return { ...fp, player: updated };
      });
      return changed ? { ...board, fieldPlayers: nextFieldPlayers } : board;
    };

    const nextTitular = syncBoard(currentTeamData.titular);
    const nextOthers = syncBoard(currentTeamData.others);
    if (nextTitular === currentTeamData.titular && nextOthers === currentTeamData.others) return;

    setTeamsData((prev) => ({
      ...prev,
      [selectedTeam]: {
        ...currentTeamData,
        titular: nextTitular,
        others: nextOthers,
      },
    }));
  }, [currentTeamData, rivalPlayers, selectedTeam]);

  const updateCurrentTeam = (updater: (prev: RivalTeamData) => RivalTeamData) => {
    if (!selectedTeam) return;
    setTeamsData((prev) => {
      const base = prev[selectedTeam] ?? createDefaultTeamData();
      return {
        ...prev,
        [selectedTeam]: updater(base),
      };
    });
  };

  const syncPlayersFromSheet = async (teamName: string, force = false) => {
    if (!teamName) return;

    setSyncingSheet(true);
    setSheetSyncError('');
    setSheetSyncStatus('Sincronizando hoja...');

    try {
      let players: RivalPlayerRow[] = [];

      try {
        const response = await fetch(`/api/rival-players-sheet?team=${encodeURIComponent(teamName)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (response.ok) {
          const result = await response.json();
          players = Array.isArray(result?.players) ? result.players as RivalPlayerRow[] : [];
        }
      } catch {
        // Fallback a lectura directa o respaldo local.
      }

      if (players.length === 0) {
        try {
          const directResponse = await fetch(buildGoogleSheetCsvUrl(GOOGLE_SHEET_ID, GOOGLE_SHEET_GID), {
            method: 'GET',
            cache: 'no-store',
          });

          if (directResponse.ok) {
            const raw = await directResponse.text();
            players = mapSheetRowsToPlayersByTeam(raw, teamName);
          }
        } catch {
          // Ultimo fallback abajo.
        }
      }

      if (players.length === 0) {
        players = mapSheetRowsToPlayersByTeam(rivalPlayersCsv, teamName);
      }

      if (players.length === 0) {
        throw new Error('No hay jugadores para ese equipo en la hoja ni en el respaldo local.');
      }

      const payload = JSON.stringify(players);

      setTeamsData((prev) => {
        const base = prev[teamName] ?? createDefaultTeamData();
        const currentPayload = JSON.stringify(base.players);

        if (!force && base.sheetSynced && currentPayload === payload) {
          return prev;
        }

        return {
          ...prev,
          [teamName]: {
            ...base,
            players,
            sheetSynced: true,
            sheetLastSync: new Date().toISOString(),
          },
        };
      });

      setSheetSyncStatus('Hoja sincronizada correctamente.');
    } catch (error) {
      console.error('Error sincronizando Google Sheet del analisis rival:', error);
      setSheetSyncError((error as Error).message || 'No se pudo sincronizar la hoja.');
      setSheetSyncStatus('');
    } finally {
      setSyncingSheet(false);
    }
  };

  const updatePlayerRow = (rowId: number, field: keyof Omit<RivalPlayerRow, 'id'>, value: string) => {
    updateCurrentTeam((prev) => ({
      ...prev,
      players: prev.players.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    }));
  };

  const pushPlayersToSheet = async () => {
    if (!selectedTeam || !currentTeamData) return;

    const players = currentTeamData.players.filter((row) => row.specificPosition || row.fullName || row.number || row.traits);
    if (players.length === 0) {
      setSheetPushError('No hay jugadores para enviar a Google Sheets.');
      setSheetPushStatus('');
      return;
    }

    setPushingSheet(true);
    setSheetPushError('');
    setSheetPushStatus('Volcando datos a Google Sheets...');

    try {
      const response = await fetch('/api/rival-players-sheet-write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team: selectedTeam,
          players,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(String(result?.error || 'No se pudo escribir en Google Sheets.'));
      }

      const remoteMode = String(result?.result?.mode || 'ok');
      const remoteRows = Number(result?.result?.updatedRows || players.length);
      setSheetPushStatus(`Google Sheets actualizado correctamente (${remoteRows} filas, modo ${remoteMode}).`);
      setTeamsData((prev) => ({
        ...prev,
        [selectedTeam]: {
          ...(prev[selectedTeam] ?? createDefaultTeamData()),
          players,
          sheetSynced: true,
          sheetLastSync: String(result?.syncedAt || new Date().toISOString()),
        },
      }));
    } catch (error) {
      console.error('Error escribiendo Google Sheet del analisis rival:', error);
      setSheetPushError((error as Error).message || 'No se pudo escribir en Google Sheets.');
      setSheetPushStatus('');
    } finally {
      setPushingSheet(false);
    }
  };

  useEffect(() => {
    if (!selectedTeam || !hydratedRef.current) return;

    void syncPlayersFromSheet(selectedTeam);

    const intervalId = window.setInterval(() => {
      void syncPlayersFromSheet(selectedTeam);
    }, SHEET_SYNC_INTERVAL_MS);

    const handleFocus = () => {
      void syncPlayersFromSheet(selectedTeam);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedTeam]);

  const handleSelectTeam = (team: string) => {
    setSelectedTeam(team);
    setTeamFilter(team);
  };

  const openExportDialog = () => {
    if (isExporting || !selectedTeam) return;
    setShowExportDialog(true);
  };

  const closeExportDialog = () => {
    if (isExporting) return;
    setShowExportDialog(false);
  };

  const toggleSection = (key: SectionKey) => {
    setSelectedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const createExportContainer = (sectionsToInclude: SectionKey[]) => {
    const source = document.querySelector('.rival-page') as HTMLElement | null;
    if (!source) return null;

    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelector('.title-actions')?.remove();
    clone.querySelector('.rival-selector-card')?.remove();
    clone.querySelectorAll('[data-export-section]').forEach((node) => {
      const key = node.getAttribute('data-export-section') as SectionKey | null;
      if (key && !sectionsToInclude.includes(key)) node.remove();
    });

    const headerNote = document.createElement('div');
    headerNote.className = 'rival-export-team';
    headerNote.textContent = `Equipo rival: ${selectedTeam}`;
    clone.prepend(headerNote);

    const container = document.createElement('div');
    container.className = 'plan-export-container';
    container.appendChild(clone);
    document.body.appendChild(container);
    return container;
  };

  const handleExportPDF = async () => {
    const sectionsToInclude = SECTION_OPTIONS.filter((option) => selectedSections[option.key]).map((option) => option.key);
    if (sectionsToInclude.length === 0) {
      alert('Selecciona al menos un apartado para exportar.');
      return;
    }

    const element = createExportContainer(sectionsToInclude);
    if (!element || isExporting) return;

    setIsExporting(true);
    setShowExportDialog(false);

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#0c1622',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;

      let heightLeft = imgHeight;
      let y = margin;

      pdf.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight, undefined, 'FAST');
      heightLeft -= contentHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        y = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight, undefined, 'FAST');
        heightLeft -= contentHeight;
      }

      const dateTag = new Date().toISOString().slice(0, 10);
      pdf.save(`analisis-rival-${slugifyTeamName(selectedTeam)}-${dateTag}.pdf`);
    } catch (error) {
      console.error('Error al exportar PDF del analisis del rival:', error);
      alert('No se pudo exportar el PDF. Intentalo de nuevo.');
    } finally {
      element.remove();
      setIsExporting(false);
    }
  };

  const teamSlug = selectedTeam ? slugifyTeamName(selectedTeam) : 'sin_equipo';
  const seasonSlug = activeSeason ? slugifyTeamName(activeSeason) : '';
  const seasonalTeamPrefix = seasonSlug ? `rival_${seasonSlug}_${teamSlug}` : `rival_${teamSlug}`;

  if (loading) {
    return (
      <section className="page-section rival-page">
        <div className="card plan-card rival-loading">Cargando analisis del rival...</div>
      </section>
    );
  }

  return (
    <>
      <section className="page-section rival-page">
        <div className="page-title plan-title">
          <div>
            <small>Scouting y preparacion del partido</small>
            <h1>Analisis del rival</h1>
            {activeSeason && <p className="rival-season-label">Temporada activa: {activeSeason}</p>}
          </div>
          <div className="title-actions">
            {saving && <span className="tb-status tb-status--saving">Guardando...</span>}
            {saved && <span className="tb-status tb-status--saved">✓ Guardado</span>}
            {saveError && <span className="rival-save-error">{saveError}</span>}
            <button className="btn btn-primary" onClick={openExportDialog} disabled={isExporting || !selectedTeam}>
              {isExporting ? 'Generando PDF...' : 'Exportar PDF'}
            </button>
          </div>
        </div>

        <div className="card plan-card rival-selector-card">
          <div className="section-header card-header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="section-badge section-badge--green">R</span>
              <div>
                <h2>Seleccion de equipo rival</h2>
                <small>Busca y filtra entre equipos de liga</small>
              </div>
            </div>
            <div className="rival-sync-box">
              <span className="rival-sync-caption">Fuente: Google Sheets, columnas D, E y F</span>
              <div className="rival-sync-actions">
                <button
                  className="btn"
                  onClick={() => void syncPlayersFromSheet(selectedTeam, true)}
                  disabled={!selectedTeam || syncingSheet}
                >
                  {syncingSheet ? 'Sincronizando...' : 'Resincronizar'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => void pushPlayersToSheet()}
                  disabled={!selectedTeam || pushingSheet}
                >
                  {pushingSheet ? 'Guardando...' : 'Guardar en Google Sheets'}
                </button>
              </div>
            </div>
          </div>

          <div className="rival-selector-grid">
            <label className="rival-field">
              <span>Buscar equipo</span>
              <input
                type="text"
                placeholder="Escribe para filtrar..."
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
              />
            </label>

            <label className="rival-field">
              <span>Equipo rival</span>
              <select
                value={selectedTeam}
                onChange={(e) => handleSelectTeam(e.target.value)}
              >
                <option value="">Selecciona un equipo...</option>
                {filteredTeams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(sheetSyncStatus || sheetSyncError || currentTeamData?.sheetLastSync) && (
            <div className="rival-sync-status-row">
              {sheetSyncStatus && <span className="rival-sync-ok">{sheetSyncStatus}</span>}
              {sheetSyncError && <span className="rival-sync-error">{sheetSyncError} Comparte la hoja en modo lectura publica o publicala como CSV.</span>}
              {currentTeamData?.sheetLastSync && (
                <span className="rival-sync-meta">
                  Ultima sincronizacion: {new Date(currentTeamData.sheetLastSync).toLocaleString('es-ES')}
                </span>
              )}
            </div>
          )}

          {(sheetPushStatus || sheetPushError) && (
            <div className="rival-sync-status-row">
              {sheetPushStatus && <span className="rival-sync-ok">{sheetPushStatus}</span>}
              {sheetPushError && <span className="rival-sync-error">{sheetPushError}</span>}
            </div>
          )}
        </div>

        {!selectedTeam && (
          <div className="card plan-card rival-empty-state">
            Selecciona un equipo rival para empezar el analisis.
          </div>
        )}

        {selectedTeam && currentTeamData && (
          <>
            <div className="card plan-card" data-export-section="plantilla">
              <div className="section-header card-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="section-badge">A</span>
                  <div>
                    <h2>Plantilla rival</h2>
                    <small>Edicion bidireccional con Google Sheets: puedes sincronizar entrada y salida</small>
                  </div>
                </div>
              </div>

              <div className="rival-table-wrap">
                <table className="list-table rival-players-table">
                  <thead>
                    <tr>
                      <th>Posición específica</th>
                      <th>Nombre y apellidos</th>
                      <th>Dorsal</th>
                      <th>Caracteristicas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="text"
                            value={row.specificPosition}
                            onChange={(e) => updatePlayerRow(row.id, 'specificPosition', e.target.value)}
                            placeholder="P, DC, LD..."
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.fullName}
                            onChange={(e) => updatePlayerRow(row.id, 'fullName', e.target.value)}
                            placeholder="Nombre del jugador"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.number}
                            onChange={(e) => updatePlayerRow(row.id, 'number', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                            placeholder="00"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.traits}
                            onChange={(e) => updatePlayerRow(row.id, 'traits', e.target.value)}
                            placeholder="Perfil, pierna, rol, comportamiento..."
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card plan-card" data-export-section="campos">
              <div className="section-header card-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="section-badge">B</span>
                  <div>
                    <h2>Posicionamiento en campo</h2>
                    <small>Selecciona jugadores y muevelos en cada escenario</small>
                  </div>
                </div>
              </div>

              <div className="rival-boards-grid">
                <div className="rival-board-block">
                  <h3>Posible alineacion titular</h3>
                  <TacticalBoard
                    players={rivalPlayers}
                    fieldPlayers={currentTeamData.titular.fieldPlayers}
                    formation={currentTeamData.titular.formation}
                    saving={saving}
                    saved={saved}
                    onFieldPlayersChange={(fieldPlayers) => {
                      updateCurrentTeam((prev) => ({
                        ...prev,
                        titular: { ...prev.titular, fieldPlayers },
                      }));
                    }}
                    onFormationChange={(formation) => {
                      updateCurrentTeam((prev) => ({
                        ...prev,
                        titular: {
                          formation,
                          fieldPlayers: applyFormation(prev.titular.fieldPlayers, formation),
                        },
                      }));
                    }}
                    usedIds={titularUsedIds}
                  />
                </div>

                <div className="rival-board-block">
                  <h3>Otros jugadores</h3>
                  <TacticalBoard
                    players={rivalPlayers}
                    fieldPlayers={currentTeamData.others.fieldPlayers}
                    formation={currentTeamData.others.formation}
                    saving={saving}
                    saved={saved}
                    onFieldPlayersChange={(fieldPlayers) => {
                      updateCurrentTeam((prev) => ({
                        ...prev,
                        others: { ...prev.others, fieldPlayers },
                      }));
                    }}
                    onFormationChange={(formation) => {
                      updateCurrentTeam((prev) => ({
                        ...prev,
                        others: {
                          formation,
                          fieldPlayers: applyFormation(prev.others.fieldPlayers, formation),
                        },
                      }));
                    }}
                    usedIds={othersUsedIds}
                  />
                </div>
              </div>
            </div>

            <div className="card plan-card" data-export-section="modelo">
              <div className="section-header card-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="section-badge">C</span>
                  <div>
                    <h2>Modelo de juego</h2>
                    <small>Ideas basicas del rival para preparar el partido</small>
                  </div>
                </div>
              </div>

              <div className="rival-model-grid">
                <div className="rival-model-card rival-model-card--strengths">
                  <h3>Puntos fuertes</h3>
                  <textarea
                    value={currentTeamData.strengths}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentTeam((prev) => ({ ...prev, strengths: value }));
                    }}
                    placeholder="Salidas, patrones ofensivos, amenazas por banda, ABP ofensivo..."
                  />
                </div>

                <div className="rival-model-card rival-model-card--weaknesses">
                  <h3>Puntos debiles</h3>
                  <textarea
                    value={currentTeamData.weaknesses}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentTeam((prev) => ({ ...prev, weaknesses: value }));
                    }}
                    placeholder="Espacios concedidos, errores recurrentes, debilidad en transicion..."
                  />
                </div>
              </div>
            </div>

            <div data-export-section="abp">
              <AbpSection
                key={`${seasonalTeamPrefix}-abp-ofensivo`}
                title="ABP ofensivo rival"
                badge="D"
                storageKey={`${seasonalTeamPrefix}_abp_ofensivo`}
                supabaseTitle={`${seasonalTeamPrefix}_abp_ofensivo`}
                players={rivalPlayers}
              />
              <AbpSection
                key={`${seasonalTeamPrefix}-abp-defensivo`}
                title="ABP defensivo rival"
                badge="E"
                storageKey={`${seasonalTeamPrefix}_abp_defensivo`}
                supabaseTitle={`${seasonalTeamPrefix}_abp_defensivo`}
                players={rivalPlayers}
              />
            </div>
          </>
        )}
      </section>

      {showExportDialog && (
        <div className="export-modal-overlay" role="dialog" aria-modal="true" aria-label="Seleccionar apartados para PDF">
          <div className="export-modal">
            <h3>Selecciona los apartados para el PDF</h3>
            <div className="export-modal-options">
              {SECTION_OPTIONS.map((option) => (
                <label key={option.key} className="export-option">
                  <input
                    type="checkbox"
                    checked={selectedSections[option.key]}
                    onChange={() => toggleSection(option.key)}
                    disabled={isExporting}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <div className="export-modal-actions">
              <button className="btn" onClick={closeExportDialog} disabled={isExporting}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleExportPDF} disabled={isExporting}>
                {isExporting ? 'Generando PDF...' : 'Generar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AnalisisDelRival;