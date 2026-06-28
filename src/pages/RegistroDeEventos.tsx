import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { LEAGUE_TEAMS, MY_TEAM_NAME } from '../lib/leagueTeams';
import { supabase } from '../lib/supabaseClient';
import { usePlantilla } from '../lib/usePlantilla';
import './RegistroDeEventos.css';

const MATCH_KEY_PREFIX = 'registro_eventos_match_v1::';
const EVENTS_KEY = 'registro_eventos_custom_events_v1';

const DEFAULT_EVENTS = [
  'Ocasión rival',
  'Ocasión propia',
  'Recuperación',
  'Pérdida',
  'Regate',
  'Pase',
  'Tiro',
  'Despeje',
  'Duelo ganado',
  'Duelo perdido',
  'Gol a favor',
  'Gol en contra',
] as const;

const TIME_SLOTS = [
  { id: '0-10', label: '0-10', min: 1, max: 10 },
  { id: '11-20', label: '11-20', min: 11, max: 20 },
  { id: '21-30', label: '21-30', min: 21, max: 30 },
  { id: '31-40', label: '31-40', min: 31, max: 40 },
  { id: '41-50', label: '41-50', min: 41, max: 50 },
  { id: '51-60', label: '51-60', min: 51, max: 60 },
  { id: '61-70', label: '61-70', min: 61, max: 70 },
  { id: '71-80', label: '71-80', min: 71, max: 80 },
  { id: '81-90', label: '81-90', min: 81, max: 90 },
  { id: '91-100', label: '91-100', min: 91, max: 100 },
] as const;

type RegistroEvento = {
  id: string;
  zoneId: number;
  zoneLabel: string;
  eventType: string;
  minute: number;
  timeSlot: string;
  playerId: string;
  playerName: string;
  createdAt: string;
};

type MatchMeta = {
  id: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  updatedAt: string;
};

type MatchSnapshot = {
  meta: MatchMeta;
  youtubeUrl: string;
  records: RegistroEvento[];
};

type EditRecordState = {
  id: string;
  eventType: string;
  minute: number;
  playerId: string;
};

type VideoMode = 'youtube' | 'local';

const ZONES = Array.from({ length: 18 }, (_, index) => {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;

  return {
    id: index + 1,
    label: `Z${index + 1}`,
    detail: `Fila ${row} · Columna ${column}`,
  };
});

const MINUTES = Array.from({ length: 100 }, (_, index) => index + 1);

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.85rem 1rem',
  borderRadius: '14px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(7, 16, 27, 0.88)',
  color: '#f5f7fb',
  fontSize: '0.95rem',
};

function getTimeSlot(minute: number) {
  return TIME_SLOTS.find((slot) => minute >= slot.min && minute <= slot.max)?.label ?? '0-10';
}

function getYoutubeEmbedUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return '';

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/i,
    /(?:youtu\.be\/)([\w-]{11})/i,
    /(?:youtube\.com\/embed\/)([\w-]{11})/i,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
  }

  return '';
}

function normalizeId(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildMatchId(homeTeam: string, awayTeam: string, title: string) {
  const base = `${normalizeId(homeTeam)}-vs-${normalizeId(awayTeam)}`;
  const extra = normalizeId(title.trim());
  return extra ? `${base}-${extra}` : base;
}

function buildMatchTitle(homeTeam: string, awayTeam: string, title: string) {
  const trimmed = title.trim();
  return trimmed ? `${homeTeam} vs ${awayTeam} · ${trimmed}` : `${homeTeam} vs ${awayTeam}`;
}

function createEmptySnapshot(meta: MatchMeta): MatchSnapshot {
  return {
    meta,
    youtubeUrl: '',
    records: [],
  };
}

function parseSnapshot(id: string, value: unknown, fallbackUpdatedAt: string): MatchSnapshot | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<MatchSnapshot> & { meta?: Partial<MatchMeta> };
  const metaCandidate = candidate.meta;
  if (!metaCandidate?.homeTeam || !metaCandidate?.awayTeam) return null;

  const title = typeof metaCandidate.title === 'string'
    ? metaCandidate.title
    : buildMatchTitle(metaCandidate.homeTeam, metaCandidate.awayTeam, '');

  const meta: MatchMeta = {
    id,
    title,
    homeTeam: metaCandidate.homeTeam,
    awayTeam: metaCandidate.awayTeam,
    updatedAt: metaCandidate.updatedAt || fallbackUpdatedAt,
  };

  const records = Array.isArray(candidate.records) ? (candidate.records as RegistroEvento[]) : [];

  return {
    meta,
    youtubeUrl: typeof candidate.youtubeUrl === 'string' ? candidate.youtubeUrl : '',
    records,
  };
}

function buildStats(records: RegistroEvento[], eventOptions: string[]) {
  const zoneCounts = new Map<number, number>();
  records.forEach((record) => {
    zoneCounts.set(record.zoneId, (zoneCounts.get(record.zoneId) ?? 0) + 1);
  });

  const eventCounts = eventOptions.map((eventType) => ({
    label: eventType,
    value: records.filter((record) => record.eventType === eventType).length,
  }));

  const timeSlotCounts = TIME_SLOTS.map((slot) => ({
    label: slot.label,
    value: records.filter((record) => record.timeSlot === slot.label).length,
  }));

  const playerCountsMap = new Map<string, number>();
  records.forEach((record) => {
    const label = record.playerName?.trim() || 'Sin jugador';
    playerCountsMap.set(label, (playerCountsMap.get(label) ?? 0) + 1);
  });

  const playerCounts = [...playerCountsMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

  const matrix = eventOptions.map((eventType) => {
    const cells = TIME_SLOTS.map((slot) => {
      const counts = new Map<string, number>();
      records
        .filter((record) => record.eventType === eventType && record.timeSlot === slot.label)
        .forEach((record) => {
          const label = record.playerName?.trim() || 'Sin jugador';
          counts.set(label, (counts.get(label) ?? 0) + 1);
        });

      const players = [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([playerName, value]) => `${playerName} (${value})`);

      return {
        slot: slot.label,
        players,
      };
    });

    return { eventType, cells };
  });

  const eventTimeMatrix = eventOptions.map((eventType) => {
    const countsBySlot = TIME_SLOTS.map((slot) => records.filter(
      (record) => record.eventType === eventType && record.timeSlot === slot.label
    ).length);

    return {
      eventType,
      countsBySlot,
      total: countsBySlot.reduce((acc, current) => acc + current, 0),
    };
  });

  const playerNames = [...new Set(records.map((record) => record.playerName?.trim() || 'Sin jugador'))]
    .sort((left, right) => {
      const leftCount = records.filter((record) => (record.playerName?.trim() || 'Sin jugador') === left).length;
      const rightCount = records.filter((record) => (record.playerName?.trim() || 'Sin jugador') === right).length;
      return rightCount - leftCount || left.localeCompare(right);
    });

  const eventPlayerMatrix = eventOptions.map((eventType) => {
    const countsByPlayer = playerNames.map(
      (playerName) => records.filter((record) => record.eventType === eventType && (record.playerName?.trim() || 'Sin jugador') === playerName).length
    );

    return {
      eventType,
      countsByPlayer,
      total: countsByPlayer.reduce((acc, current) => acc + current, 0),
    };
  });

  const maxZoneCount = Math.max(1, ...zoneCounts.values());
  const maxEventCount = Math.max(1, ...eventCounts.map((item) => item.value));
  const maxTimeSlotCount = Math.max(1, ...timeSlotCounts.map((item) => item.value));
  const maxPlayerCount = Math.max(1, ...playerCounts.map((item) => item.value));
  const maxEventTimeCell = Math.max(1, ...eventTimeMatrix.flatMap((row) => row.countsBySlot));
  const maxEventPlayerCell = Math.max(1, ...eventPlayerMatrix.flatMap((row) => row.countsByPlayer));

  return {
    zoneCounts,
    eventCounts,
    timeSlotCounts,
    playerCounts,
    matrix,
    eventTimeMatrix,
    eventPlayerMatrix,
    playerNames,
    maxZoneCount,
    maxEventCount,
    maxTimeSlotCount,
    maxPlayerCount,
    maxEventTimeCell,
    maxEventPlayerCell,
  };
}

function MatrixTable({ matrix }: { matrix: ReturnType<typeof buildStats>['matrix'] }) {
  return (
    <div className="registro-table-wrapper">
      <table className="registro-matrix-table">
        <thead>
          <tr>
            <th>Evento</th>
            {TIME_SLOTS.map((slot) => (
              <th key={slot.id}>{slot.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.eventType}>
              <th>{row.eventType}</th>
              {row.cells.map((cell) => (
                <td key={`${row.eventType}-${cell.slot}`}>
                  {cell.players.length > 0 ? (
                    <div className="registro-cell-list">
                      {cell.players.map((player) => (
                        <span key={player} className="registro-cell-item">
                          {player}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="registro-empty-cell">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartsPanel({ stats }: { stats: ReturnType<typeof buildStats> }) {
  return (
    <div className="registro-charts-grid">
      <section className="registro-chart-block">
        <h3>Frecuencia por evento</h3>
        <div className="registro-bar-list">
          {stats.eventCounts.map((item) => (
            <div key={item.label} className="registro-bar-row">
              <span>{item.label}</span>
              <div className="registro-bar-track">
                <div className="registro-bar-fill" style={{ width: `${(item.value / stats.maxEventCount) * 100}%` }} />
              </div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="registro-chart-block">
        <h3>Frecuencia por tramo</h3>
        <div className="registro-bar-list compact">
          {stats.timeSlotCounts.map((item) => (
            <div key={item.label} className="registro-bar-row">
              <span>{item.label}</span>
              <div className="registro-bar-track">
                <div className="registro-bar-fill time" style={{ width: `${(item.value / stats.maxTimeSlotCount) * 100}%` }} />
              </div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="registro-chart-block">
        <h3>Participación por jugador</h3>
        <div className="registro-bar-list compact">
          {(stats.playerCounts.length > 0 ? stats.playerCounts : [{ label: 'Sin datos', value: 0 }]).map((item) => (
            <div key={item.label} className="registro-bar-row">
              <span>{item.label}</span>
              <div className="registro-bar-track">
                <div className="registro-bar-fill player" style={{ width: `${(item.value / stats.maxPlayerCount) * 100}%` }} />
              </div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="registro-chart-block">
        <h3>Mapa de calor por zonas</h3>
        <div className="registro-mini-pitch">
          {ZONES.map((zone) => {
            const count = stats.zoneCounts.get(zone.id) ?? 0;
            const opacity = 0.12 + (count / stats.maxZoneCount) * 0.88;

            return (
              <div
                key={`mini-${zone.id}`}
                className="registro-mini-zone"
                style={{ background: `rgba(144, 244, 174, ${opacity})` }}
              >
                <span>{zone.label}</span>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SeasonEventTimeHeatmap({ stats }: { stats: ReturnType<typeof buildStats> }) {
  return (
    <div className="registro-table-wrapper">
      <table className="registro-heatmap-table">
        <thead>
          <tr>
            <th>Evento</th>
            {TIME_SLOTS.map((slot) => (
              <th key={`slot-${slot.id}`}>{slot.label}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {stats.eventTimeMatrix.map((row) => (
            <tr key={`evt-slot-${row.eventType}`}>
              <th>{row.eventType}</th>
              {row.countsBySlot.map((count, index) => (
                <td
                  key={`${row.eventType}-${TIME_SLOTS[index].id}`}
                  style={{ background: `rgba(79, 195, 247, ${(count / stats.maxEventTimeCell) * 0.8})` }}
                >
                  {count}
                </td>
              ))}
              <td><strong>{row.total}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeasonEventPlayerHeatmap({ stats }: { stats: ReturnType<typeof buildStats> }) {
  const visiblePlayers = stats.playerNames.slice(0, 12);

  return (
    <div className="registro-table-wrapper">
      <table className="registro-heatmap-table">
        <thead>
          <tr>
            <th>Evento</th>
            {visiblePlayers.map((player) => (
              <th key={`player-${player}`}>{player}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {stats.eventPlayerMatrix.map((row) => (
            <tr key={`evt-player-${row.eventType}`}>
              <th>{row.eventType}</th>
              {visiblePlayers.map((playerName, index) => {
                const realIndex = stats.playerNames.indexOf(playerName);
                const count = row.countsByPlayer[realIndex] ?? 0;

                return (
                  <td
                    key={`${row.eventType}-${playerName}`}
                    style={{ background: `rgba(144, 244, 174, ${(count / stats.maxEventPlayerCell) * 0.8})` }}
                  >
                    {count}
                  </td>
                );
              })}
              <td><strong>{row.total}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      {stats.playerNames.length > visiblePlayers.length ? (
        <p className="registro-info">Se muestran los 12 jugadores con más acciones acumuladas.</p>
      ) : null}
    </div>
  );
}

function RegistroDeEventos() {
  const jugadores = usePlantilla();
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [matchTitleInput, setMatchTitleInput] = useState('');
  const [homeTeamInput, setHomeTeamInput] = useState(MY_TEAM_NAME);
  const [awayTeamInput, setAwayTeamInput] = useState(LEAGUE_TEAMS.find((team) => team !== MY_TEAM_NAME) || LEAGUE_TEAMS[0]);
  const [snapshots, setSnapshots] = useState<Record<string, MatchSnapshot>>({});
  const [customEvents, setCustomEvents] = useState<string[]>([]);
  const [newEventInput, setNewEventInput] = useState('');
  const [videoMode, setVideoMode] = useState<VideoMode>('youtube');
  const [localVideoUrl, setLocalVideoUrl] = useState('');
  const [localVideoName, setLocalVideoName] = useState('');
  const [activeZoneId, setActiveZoneId] = useState<number | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [selectedMinute, setSelectedMinute] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [editingRecord, setEditingRecord] = useState<EditRecordState | null>(null);
  const [error, setError] = useState('');

  const eventOptions = useMemo(
    () => [...new Set([...DEFAULT_EVENTS, ...customEvents.map((item) => item.trim()).filter(Boolean)])],
    [customEvents]
  );

  useEffect(() => {
    const loadState = async () => {
      setLoading(true);

      const [matchesResult, eventsResult] = await Promise.all([
        supabase
          .from('shared_state')
          .select('key, value, updated_at')
          .like('key', `${MATCH_KEY_PREFIX}%`),
        supabase
          .from('shared_state')
          .select('value')
          .eq('key', EVENTS_KEY)
          .maybeSingle(),
      ]);

      if (matchesResult.error) {
        console.error('Error cargando partidos de registro de eventos:', matchesResult.error);
        setStatusMsg('No se pudieron cargar los partidos guardados.');
      } else {
        const nextSnapshots: Record<string, MatchSnapshot> = {};
        (matchesResult.data || []).forEach((row) => {
          const key = String(row.key || '');
          if (!key.startsWith(MATCH_KEY_PREFIX)) return;
          const id = key.slice(MATCH_KEY_PREFIX.length);
          const parsed = parseSnapshot(id, row.value, row.updated_at || new Date().toISOString());
          if (parsed) nextSnapshots[id] = parsed;
        });

        setSnapshots(nextSnapshots);
        const sorted = Object.values(nextSnapshots).sort(
          (left, right) => new Date(right.meta.updatedAt).getTime() - new Date(left.meta.updatedAt).getTime()
        );
        if (sorted[0]) setSelectedMatchId(sorted[0].meta.id);
      }

      if (!eventsResult.error && eventsResult.data?.value && typeof eventsResult.data.value === 'object') {
        const parsed = eventsResult.data.value as { items?: string[] };
        setCustomEvents(Array.isArray(parsed.items) ? parsed.items.filter((item) => item && typeof item === 'string') : []);
      }

      setLoading(false);
    };

    void loadState();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void supabase
        .from('shared_state')
        .upsert(
          { key: EVENTS_KEY, value: { items: customEvents }, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
        .then(({ error: saveError }) => {
          if (saveError) console.error('Error guardando eventos personalizados:', saveError);
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [customEvents]);

  useEffect(() => {
    if (!selectedMatchId) return;
    const snapshot = snapshots[selectedMatchId];
    if (!snapshot) return;

    const timer = setTimeout(() => {
      void supabase
        .from('shared_state')
        .upsert(
          {
            key: `${MATCH_KEY_PREFIX}${selectedMatchId}`,
            value: snapshot,
            updated_at: snapshot.meta.updatedAt,
          },
          { onConflict: 'key' }
        )
        .then(({ error: saveError }) => {
          if (saveError) {
            console.error('Error guardando partido de registro:', saveError);
            setStatusMsg('No se pudo guardar automáticamente.');
          }
        });
    }, 600);

    return () => clearTimeout(timer);
  }, [selectedMatchId, snapshots]);

  useEffect(() => {
    setSelectedEvents((current) => current.filter((eventName) => eventOptions.includes(eventName)));
  }, [eventOptions]);

  const matches = useMemo(
    () => Object.values(snapshots).sort(
      (left, right) => new Date(right.meta.updatedAt).getTime() - new Date(left.meta.updatedAt).getTime()
    ),
    [snapshots]
  );

  const currentSnapshot = selectedMatchId ? snapshots[selectedMatchId] : undefined;
  const records = currentSnapshot?.records || [];
  const youtubeUrl = currentSnapshot?.youtubeUrl || '';

  const seasonRecords = useMemo(
    () => Object.values(snapshots).flatMap((snapshot) => snapshot.records),
    [snapshots]
  );

  const currentStats = useMemo(() => buildStats(records, eventOptions), [records, eventOptions]);
  const seasonStats = useMemo(() => buildStats(seasonRecords, eventOptions), [seasonRecords, eventOptions]);

  const upsertCurrentSnapshot = (updater: (current: MatchSnapshot) => MatchSnapshot) => {
    if (!selectedMatchId) return;

    setSnapshots((previous) => {
      const current = previous[selectedMatchId] || createEmptySnapshot({
        id: selectedMatchId,
        homeTeam: homeTeamInput,
        awayTeam: awayTeamInput,
        title: buildMatchTitle(homeTeamInput, awayTeamInput, matchTitleInput),
        updatedAt: new Date().toISOString(),
      });

      const next = updater(current);

      return {
        ...previous,
        [selectedMatchId]: {
          ...next,
          meta: {
            ...next.meta,
            id: selectedMatchId,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const handleCreateOrLoadMatch = () => {
    if (homeTeamInput === awayTeamInput) {
      setError('El equipo local y el visitante deben ser distintos.');
      return;
    }

    const matchId = buildMatchId(homeTeamInput, awayTeamInput, matchTitleInput);
    const composedTitle = buildMatchTitle(homeTeamInput, awayTeamInput, matchTitleInput);
    const now = new Date().toISOString();

    setSnapshots((previous) => {
      if (previous[matchId]) return previous;

      return {
        ...previous,
        [matchId]: createEmptySnapshot({
          id: matchId,
          title: composedTitle,
          homeTeam: homeTeamInput,
          awayTeam: awayTeamInput,
          updatedAt: now,
        }),
      };
    });

    setSelectedMatchId(matchId);
    setError('');
    setStatusMsg('Partido activo listo para registrar eventos.');
  };

  const handleDeleteCurrentMatch = async () => {
    if (!selectedMatchId) {
      setError('Selecciona un partido para eliminar.');
      return;
    }

    const toDelete = snapshots[selectedMatchId];
    if (!toDelete) return;

    const accepted = window.confirm(`Se eliminará el partido ${toDelete.meta.title}. Esta acción no se puede deshacer.`);
    if (!accepted) return;

    const targetKey = `${MATCH_KEY_PREFIX}${selectedMatchId}`;
    const nextSelectedId = matches.find((match) => match.meta.id !== selectedMatchId)?.meta.id || '';

    setSnapshots((previous) => {
      const next = { ...previous };
      delete next[selectedMatchId];
      return next;
    });
    setSelectedMatchId(nextSelectedId);
    setActiveZoneId(null);
    setSelectedEvents([]);

    const { error: deleteError } = await supabase.from('shared_state').delete().eq('key', targetKey);
    if (deleteError) {
      console.error('Error eliminando partido guardado:', deleteError);
      setStatusMsg('Se quitó en memoria, pero no se pudo borrar en base de datos.');
      return;
    }

    setStatusMsg('Partido eliminado correctamente. Tablas y gráficos acumulados actualizados.');
  };

  const handleSelectStoredMatch = (matchId: string) => {
    setSelectedMatchId(matchId);
    setActiveZoneId(null);
    setSelectedEvents([]);
    setError('');
  };

  useEffect(() => {
    if (!currentSnapshot) return;

    setHomeTeamInput(currentSnapshot.meta.homeTeam);
    setAwayTeamInput(currentSnapshot.meta.awayTeam);
    const rawTitle = currentSnapshot.meta.title.includes('·')
      ? currentSnapshot.meta.title.split('·').slice(1).join('·').trim()
      : '';
    setMatchTitleInput(rawTitle);
  }, [currentSnapshot?.meta.id]);

  const updateMatchMetadata = () => {
    if (!selectedMatchId) {
      setError('Crea o selecciona un partido antes de guardar datos.');
      return;
    }

    if (homeTeamInput === awayTeamInput) {
      setError('El equipo local y el visitante deben ser distintos.');
      return;
    }

    upsertCurrentSnapshot((current) => ({
      ...current,
      meta: {
        ...current.meta,
        title: buildMatchTitle(homeTeamInput, awayTeamInput, matchTitleInput),
        homeTeam: homeTeamInput,
        awayTeam: awayTeamInput,
        updatedAt: new Date().toISOString(),
      },
    }));
    setError('');
    setStatusMsg('Datos del partido actualizados.');
  };

  const handleAddCustomEvent = () => {
    const nextEvent = newEventInput.trim();
    if (!nextEvent) {
      setError('Escribe un nombre de evento para añadirlo.');
      return;
    }

    const exists = [...DEFAULT_EVENTS, ...customEvents].some(
      (eventName) => eventName.toLowerCase() === nextEvent.toLowerCase()
    );
    if (exists) {
      setError('Ese evento ya existe en la lista.');
      return;
    }

    setCustomEvents((current) => [...current, nextEvent]);
    setNewEventInput('');
    setError('');
    setStatusMsg(`Evento "${nextEvent}" añadido.`);
  };

  useEffect(() => {
    if (!selectedPlayerId) return;
    if (!selectedPlayerId || jugadores.some((jugador) => String(jugador.id) === selectedPlayerId)) return;
    setSelectedPlayerId('');
  }, [jugadores, selectedPlayerId]);

  useEffect(() => {
    return () => {
      if (localVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  const activeZone = useMemo(
    () => ZONES.find((zone) => zone.id === activeZoneId) ?? null,
    [activeZoneId]
  );

  const youtubeEmbedUrl = useMemo(() => getYoutubeEmbedUrl(youtubeUrl), [youtubeUrl]);

  const handleVideoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setVideoMode('local');
    setLocalVideoName(file.name);
    setLocalVideoUrl((currentUrl) => {
      if (currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }

      return URL.createObjectURL(file);
    });
  };

  const toggleEvent = (eventType: string) => {
    setSelectedEvents((current) => {
      if (current.includes(eventType)) {
        return current.filter((value) => value !== eventType);
      }
      return [...current, eventType];
    });
  };

  const handleSaveRecord = () => {
    if (!selectedMatchId) {
      setError('Primero crea o selecciona un partido.');
      return;
    }

    if (!activeZone) {
      setError('Selecciona una zona del campo.');
      return;
    }

    if (selectedEvents.length === 0) {
      setError('Selecciona al menos un evento.');
      return;
    }

    const player = selectedPlayerId
      ? jugadores.find((item) => String(item.id) === selectedPlayerId)
      : null;

    if (selectedPlayerId && !player) {
      setError('Selecciona un jugador válido.');
      return;
    }

    const createdAt = new Date().toISOString();
    const timeSlot = getTimeSlot(selectedMinute);
    const nextRecords = selectedEvents.map((eventType, index) => ({
      id: `${createdAt}-${activeZone.id}-${eventType}-${index}`,
      zoneId: activeZone.id,
      zoneLabel: activeZone.label,
      eventType,
      minute: selectedMinute,
      timeSlot,
      playerId: player ? String(player.id) : '',
      playerName: player?.nombre || '',
      createdAt,
    } satisfies RegistroEvento));

    upsertCurrentSnapshot((current) => ({
      ...current,
      records: [...nextRecords, ...current.records],
    }));

    setSelectedEvents([]);
    setError('');
    setActiveZoneId(null);
    setStatusMsg('Registro guardado correctamente.');
  };

  const handleClearRecords = () => {
    if (!selectedMatchId) return;
    upsertCurrentSnapshot((current) => ({ ...current, records: [] }));
    setError('');
    setStatusMsg('Se han limpiado los registros del partido activo.');
  };

  const handleDeleteRecord = (recordId: string) => {
    if (!selectedMatchId) return;

    upsertCurrentSnapshot((current) => ({
      ...current,
      records: current.records.filter((record) => record.id !== recordId),
    }));
    if (editingRecord?.id === recordId) {
      setEditingRecord(null);
    }
    setStatusMsg('Evento eliminado del partido activo.');
  };

  const handleStartEditRecord = (record: RegistroEvento) => {
    setEditingRecord({
      id: record.id,
      eventType: record.eventType,
      minute: record.minute,
      playerId: String(record.playerId),
    });
    setError('');
  };

  const handleSaveEditRecord = () => {
    if (!editingRecord || !selectedMatchId) return;

    const player = editingRecord.playerId
      ? jugadores.find((item) => String(item.id) === String(editingRecord.playerId))
      : null;

    if (editingRecord.playerId && !player) {
      setError('Selecciona un jugador válido para la edición.');
      return;
    }

    if (!eventOptions.includes(editingRecord.eventType)) {
      setError('Selecciona un evento válido para la edición.');
      return;
    }

    if (editingRecord.minute < 1 || editingRecord.minute > 100) {
      setError('El minuto debe estar entre 1 y 100.');
      return;
    }

    upsertCurrentSnapshot((current) => ({
      ...current,
      records: current.records.map((record) => {
        if (record.id !== editingRecord.id) return record;

        return {
          ...record,
          eventType: editingRecord.eventType,
          minute: editingRecord.minute,
          timeSlot: getTimeSlot(editingRecord.minute),
          playerId: player ? String(player.id) : '',
          playerName: player?.nombre || '',
        };
      }),
    }));

    setEditingRecord(null);
    setError('');
    setStatusMsg('Evento editado correctamente.');
  };

  const handleCancelEditRecord = () => {
    setEditingRecord(null);
    setError('');
  };

  return (
    <section className="page-section registro-eventos-page">
      <div className="page-title">
        <div>
          <h1>Registro de Eventos</h1>
          <p className="registro-eventos-intro">
            Vincula acciones del partido con vídeo, zona del campo, minuto y jugador para generar una matriz de análisis y gráficos automáticos.
          </p>
        </div>
      </div>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Partido analizado</h2>
            <small>Selecciona local, visitante y nombre del análisis para guardar y retomar en cualquier momento</small>
          </div>
          <span className="badge">{matches.length} partidos guardados</span>
        </div>

        <div className="registro-match-grid">
          <label className="registro-field-label">
            <span>Equipo local</span>
            <select value={homeTeamInput} onChange={(event) => setHomeTeamInput(event.target.value)} style={inputStyle}>
              {LEAGUE_TEAMS.map((team) => (
                <option key={`home-${team}`} value={team}>{team}</option>
              ))}
            </select>
          </label>

          <label className="registro-field-label">
            <span>Equipo visitante</span>
            <select value={awayTeamInput} onChange={(event) => setAwayTeamInput(event.target.value)} style={inputStyle}>
              {LEAGUE_TEAMS.map((team) => (
                <option key={`away-${team}`} value={team}>{team}</option>
              ))}
            </select>
          </label>

          <label className="registro-field-label registro-field-wide">
            <span>Título libre del análisis</span>
            <input
              type="text"
              value={matchTitleInput}
              onChange={(event) => setMatchTitleInput(event.target.value)}
              placeholder="Ej: Jornada 12, 1ª parte"
              style={inputStyle}
            />
          </label>
        </div>

        <div className="registro-panel-actions">
          <button type="button" className="registro-primary-btn" onClick={handleCreateOrLoadMatch}>
            Crear o abrir partido
          </button>
          <button type="button" className="registro-secondary-btn" onClick={updateMatchMetadata}>
            Actualizar datos del partido activo
          </button>
          <button type="button" className="registro-danger-btn" onClick={handleDeleteCurrentMatch}>
            Eliminar partido activo
          </button>
        </div>

        <div className="registro-stored-match-row">
          <label className="registro-field-label registro-field-wide">
            <span>Partidos guardados</span>
            <select
              value={selectedMatchId}
              onChange={(event) => handleSelectStoredMatch(event.target.value)}
              style={inputStyle}
            >
              {!selectedMatchId ? <option value="">Selecciona un partido</option> : null}
              {matches.map((match) => (
                <option key={match.meta.id} value={match.meta.id}>
                  {match.meta.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? <p className="registro-info">Cargando partidos...</p> : null}
        {statusMsg ? <p className="registro-info">{statusMsg}</p> : null}
      </article>

      <div className="registro-eventos-layout">
        <article className="card registro-card registro-video-card">
          <div className="section-header">
            <div>
              <h2>Vídeo</h2>
              <small>YouTube embebido o archivo local</small>
            </div>
            <span className="badge">{records.length} registros</span>
          </div>

          <div className="registro-source-toggle">
            <button
              type="button"
              className={videoMode === 'youtube' ? 'registro-source-btn active' : 'registro-source-btn'}
              onClick={() => setVideoMode('youtube')}
            >
              YouTube
            </button>
            <button
              type="button"
              className={videoMode === 'local' ? 'registro-source-btn active' : 'registro-source-btn'}
              onClick={() => setVideoMode('local')}
            >
              Vídeo local
            </button>
          </div>

          <div className="registro-controls-stack">
            <label className="registro-field-label">
              <span>Fuente del vídeo</span>
              {videoMode === 'youtube' ? (
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(event) => upsertCurrentSnapshot((current) => ({ ...current, youtubeUrl: event.target.value }))}
                  placeholder="Pega aquí la URL de YouTube"
                  style={inputStyle}
                />
              ) : (
                <div className="registro-local-upload">
                  <input type="file" accept="video/*" onChange={handleVideoFileChange} style={inputStyle} />
                  <small>{localVideoName || 'Selecciona un archivo de vídeo de tu ordenador'}</small>
                </div>
              )}
            </label>
          </div>

          <div className="registro-video-stage">
            {videoMode === 'youtube' && youtubeEmbedUrl ? (
              <iframe
                src={youtubeEmbedUrl}
                title="Vídeo de YouTube"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : null}

            {videoMode === 'local' && localVideoUrl ? (
              <video src={localVideoUrl} controls preload="metadata" />
            ) : null}

            {((videoMode === 'youtube' && !youtubeEmbedUrl) || (videoMode === 'local' && !localVideoUrl)) && (
              <div className="registro-video-placeholder">
                <strong>Vídeo no cargado</strong>
                <p>
                  {videoMode === 'youtube'
                    ? 'Introduce una URL válida de YouTube para embeber el análisis.'
                    : 'Carga un archivo de vídeo local para empezar a registrar acciones.'}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="card registro-card registro-pitch-card">
          <div className="section-header">
            <div>
              <h2>Campo dividido en 18 zonas</h2>
              <small>Pulsa una zona para registrar uno o varios eventos</small>
            </div>
            <button type="button" className="registro-clear-btn" onClick={handleClearRecords}>
              Limpiar registros
            </button>
          </div>

          <div className="registro-pitch-wrapper">
            <div className="registro-pitch-markings" aria-hidden="true">
              <span className="pitch-midline" />
              <span className="pitch-center-circle" />
              <span className="pitch-box pitch-box-top" />
              <span className="pitch-box pitch-box-bottom" />
            </div>

            <div className="registro-pitch-grid">
              {ZONES.map((zone) => {
                const count = currentStats.zoneCounts.get(zone.id) ?? 0;
                const intensity = count / currentStats.maxZoneCount;

                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={zone.id === activeZoneId ? 'registro-zone active' : 'registro-zone'}
                    style={{
                      background: `linear-gradient(180deg, rgba(32, 95, 54, ${0.38 + intensity * 0.34}), rgba(15, 54, 32, ${0.72 + intensity * 0.16}))`,
                    }}
                    onClick={() => {
                      setActiveZoneId(zone.id);
                      setError('');
                    }}
                  >
                    <span>{zone.label}</span>
                    <small>{zone.detail}</small>
                    <strong>{count}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="registro-legend-row">
            <span className="registro-legend-pill">Cada clic abre el panel de registro</span>
            <span className="registro-legend-pill">El contador de cada zona actúa como mapa de calor</span>
          </div>

          <div className="registro-editor-panel">
            <div>
              <h3>{activeZone ? `Registrar en ${activeZone.label}` : 'Selecciona una zona'}</h3>
              <p>
                {activeZone
                  ? `${activeZone.detail}. Puedes marcar varios eventos para el mismo minuto y jugador.`
                  : 'La zona elegida te abrirá este panel con eventos, minuto y jugador.'}
              </p>
            </div>

            <div className="registro-custom-event-row">
              <input
                type="text"
                value={newEventInput}
                onChange={(event) => setNewEventInput(event.target.value)}
                placeholder="Añadir nuevo evento personalizado"
                style={inputStyle}
              />
              <button type="button" className="registro-secondary-btn" onClick={handleAddCustomEvent}>
                Añadir evento
              </button>
            </div>

            <div className="registro-events-grid">
              {eventOptions.map((eventType) => {
                const checked = selectedEvents.includes(eventType);

                return (
                  <label key={eventType} className={checked ? 'registro-event-chip active' : 'registro-event-chip'}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEvent(eventType)}
                    />
                    <span>{eventType}</span>
                  </label>
                );
              })}
            </div>

            <div className="registro-form-grid">
              <label className="registro-field-label">
                <span>Minuto</span>
                <select value={selectedMinute} onChange={(event) => setSelectedMinute(Number(event.target.value))} style={inputStyle}>
                  {MINUTES.map((minute) => (
                    <option key={minute} value={minute}>
                      {minute}
                    </option>
                  ))}
                </select>
              </label>

              <label className="registro-field-label">
                <span>Jugador</span>
                <select value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} style={inputStyle}>
                  <option value="">Sin jugador</option>
                  {jugadores.length === 0 ? <option value="">Sin plantilla cargada</option> : null}
                  {jugadores.map((jugador) => (
                    <option key={jugador.id} value={String(jugador.id)}>
                      {jugador.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <p className="registro-error">{error}</p> : null}

            <div className="registro-panel-actions">
              <button type="button" className="registro-primary-btn" onClick={handleSaveRecord}>
                Guardar registro
              </button>
              <button type="button" className="registro-secondary-btn" onClick={() => setActiveZoneId(null)}>
                Cerrar panel
              </button>
            </div>
          </div>
        </article>
      </div>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Tabla de triple entrada (partido actual)</h2>
            <small>Evento por tramo temporal, con jugadores implicados en cada celda del partido seleccionado</small>
          </div>
        </div>
        <MatrixTable matrix={currentStats.matrix} />
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Gráficos (partido actual)</h2>
            <small>Lectura rápida por evento, tramo, jugador y zona del partido activo</small>
          </div>
        </div>
        <ChartsPanel stats={currentStats} />
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Tabla de triple entrada (acumulado temporada)</h2>
            <small>Datos agregados de todos los partidos guardados en la temporada</small>
          </div>
          <span className="badge">{seasonRecords.length} eventos acumulados</span>
        </div>
        <MatrixTable matrix={seasonStats.matrix} />
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Gráficos (acumulado temporada)</h2>
            <small>Resumen global por evento, tramo temporal, jugador y zonas</small>
          </div>
        </div>
        <ChartsPanel stats={seasonStats} />
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Acumulado temporada: evento por franja de tiempo</h2>
            <small>Mapa de intensidad con el total de cada acción en cada tramo de 10 minutos</small>
          </div>
        </div>
        <SeasonEventTimeHeatmap stats={seasonStats} />
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Acumulado temporada: evento por jugador</h2>
            <small>Mapa de intensidad del total de cada evento por jugador</small>
          </div>
        </div>
        <SeasonEventPlayerHeatmap stats={seasonStats} />
      </article>

      <article className="card registro-card">
        <div className="section-header">
          <div>
            <h2>Detalle de registros</h2>
            <small>Vista cronológica de todas las acciones del partido activo</small>
          </div>
        </div>

        <div className="registro-table-wrapper">
          <table className="list-table registro-detail-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Minuto</th>
                <th>Tramo</th>
                <th>Jugador</th>
                <th>Zona</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      {editingRecord?.id === record.id ? (
                        <select
                          value={editingRecord.eventType}
                          onChange={(event) => setEditingRecord((current) => current ? { ...current, eventType: event.target.value } : null)}
                          className="registro-table-select"
                        >
                          {eventOptions.map((eventType) => (
                            <option key={`edit-event-${eventType}`} value={eventType}>{eventType}</option>
                          ))}
                        </select>
                      ) : record.eventType}
                    </td>
                    <td>
                      {editingRecord?.id === record.id ? (
                        <select
                          value={editingRecord.minute}
                          onChange={(event) => setEditingRecord((current) => current ? { ...current, minute: Number(event.target.value) } : null)}
                          className="registro-table-select"
                        >
                          {MINUTES.map((minute) => (
                            <option key={`edit-minute-${minute}`} value={minute}>{minute}</option>
                          ))}
                        </select>
                      ) : record.minute}
                    </td>
                    <td>{editingRecord?.id === record.id ? getTimeSlot(editingRecord.minute) : record.timeSlot}</td>
                    <td>
                      {editingRecord?.id === record.id ? (
                        <select
                          value={editingRecord.playerId}
                          onChange={(event) => setEditingRecord((current) => current ? { ...current, playerId: event.target.value } : null)}
                          className="registro-table-select"
                        >
                          <option value="">Sin jugador</option>
                          {jugadores.map((jugador) => (
                            <option key={`edit-player-${jugador.id}`} value={String(jugador.id)}>{jugador.nombre}</option>
                          ))}
                        </select>
                      ) : (record.playerName || 'Sin jugador')}
                    </td>
                    <td>{record.zoneLabel}</td>
                    <td>
                      <div className="registro-row-actions">
                        {editingRecord?.id === record.id ? (
                          <>
                            <button type="button" className="registro-row-btn save" onClick={handleSaveEditRecord}>
                              Guardar
                            </button>
                            <button type="button" className="registro-row-btn" onClick={handleCancelEditRecord}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="registro-row-btn" onClick={() => handleStartEditRecord(record)}>
                              Editar
                            </button>
                            <button type="button" className="registro-row-btn danger" onClick={() => handleDeleteRecord(record.id)}>
                              Borrar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="registro-empty-row">
                    Todavía no hay acciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default RegistroDeEventos;