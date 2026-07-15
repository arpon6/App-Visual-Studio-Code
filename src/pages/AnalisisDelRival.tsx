import { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './PlanDePartido.css';
import './AnalisisDelRival.css';
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
};

type RivalGlobalState = {
  selectedTeam: string;
  teams: Record<string, RivalTeamData>;
};

type SectionKey = 'plantilla' | 'campos' | 'modelo' | 'abp';

const SHARED_STATE_KEY = 'analisis_rival_v1';
const DEFAULT_FORMATION = '1-4-4-2';

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
  };
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

  const currentTeamData = selectedTeam ? (teamsData[selectedTeam] ?? createDefaultTeamData()) : null;

  const rivalPlayers = useMemo<Player[]>(() => {
    if (!currentTeamData) return [];
    return currentTeamData.players
      .filter((row) => row.fullName.trim().length > 0)
      .map((row) => ({
        id: row.id,
        name: row.fullName.trim(),
        number: Number(row.number) || 0,
      }))
      .sort((a, b) => a.number - b.number);
  }, [currentTeamData]);

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
      const { data, error } = await supabase.from('shared_state').select('value').eq('key', SHARED_STATE_KEY).maybeSingle();
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
        .upsert({ key: SHARED_STATE_KEY, value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });

      setSaving(false);
      if (error) {
        console.error('Error guardando analisis del rival:', error);
        setSaveError('No se pudo guardar automaticamente.');
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 700);
  }, [selectedTeam, teamsData]);

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

  const updatePlayerRow = (rowId: number, field: keyof Omit<RivalPlayerRow, 'id'>, value: string) => {
    updateCurrentTeam((prev) => ({
      ...prev,
      players: prev.players.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    }));
  };

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
                    <small>Introduce jugadores, dorsal y caracteristicas clave</small>
                  </div>
                </div>
              </div>

              <div className="rival-table-wrap">
                <table className="list-table rival-players-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre y apellidos</th>
                      <th>Dorsal</th>
                      <th>Caracteristicas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentTeamData.players.map((row) => (
                      <tr key={row.id}>
                        <td>{row.id}</td>
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
                key={`${teamSlug}-abp-ofensivo`}
                title="ABP ofensivo rival"
                badge="D"
                storageKey={`rival_${teamSlug}_abp_ofensivo`}
                supabaseTitle={`rival_${teamSlug}_abp_ofensivo`}
                players={rivalPlayers}
              />
              <AbpSection
                key={`${teamSlug}-abp-defensivo`}
                title="ABP defensivo rival"
                badge="E"
                storageKey={`rival_${teamSlug}_abp_defensivo`}
                supabaseTitle={`rival_${teamSlug}_abp_defensivo`}
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