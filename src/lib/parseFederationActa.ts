import { LEAGUE_TEAMS } from './leagueTeams';

export interface ActaPdfTextItem {
  str: string;
  x: number;
  y: number;
}

export interface ActaPdfPlayer {
  id: string;
  dorsal: number;
  nombre: string;
}

export interface ParsedActaPdfPlayer extends ActaPdfPlayer {
  titular: boolean;
  goles: number;
  tarjetas: number;
  minutos: number;
}

export interface ParsedActaPdf {
  fecha: string;
  rival: string;
  resultado: string;
  competicion: string;
  jugadores: ParsedActaPdfPlayer[];
}

interface TextRow {
  y: number;
  items: ActaPdfTextItem[];
  text: string;
}

interface PlayerEvent {
  player: ActaPdfPlayer;
  minute: number | null;
  text: string;
  y: number;
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const formatLabel = (value: string) => value
  .toLocaleLowerCase('es')
  .replace(/(^|\s|\()\p{L}/gu, (letter) => letter.toLocaleUpperCase('es'));

const getRows = (items: ActaPdfTextItem[]): TextRow[] => {
  const sorted = items
    .filter((item) => item.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextRow[] = [];

  sorted.forEach((item) => {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (row) {
      row.items.push(item);
      row.text = row.items.sort((a, b) => a.x - b.x).map((entry) => entry.str.trim()).join(' ');
    } else {
      rows.push({ y: item.y, items: [item], text: item.str.trim() });
    }
  });

  return rows.sort((a, b) => b.y - a.y);
};

const matchPlayer = (text: string, players: ActaPdfPlayer[]): ActaPdfPlayer | undefined => {
  const words = new Set(normalize(text.replace(/\([^)]*\)/g, '')).split(' '));
  return players.find((player) => {
    const nameParts = normalize(player.nombre).split(' ').filter(Boolean);
    return nameParts.length >= 2 && nameParts.every((part) => words.has(part));
  });
};

const getPlayerEvent = (
  item: ActaPdfTextItem,
  players: ActaPdfPlayer[],
): PlayerEvent | undefined => {
  const player = matchPlayer(item.str, players);
  if (!player) return undefined;
  const minuteMatch = item.str.match(/\((\d{1,3})\s*['’′]?\)/);

  return {
    player,
    minute: minuteMatch ? Number(minuteMatch[1]) : null,
    text: item.str,
    y: item.y,
  };
};

const getHeaderRows = (rows: TextRow[], header: string) =>
  rows.flatMap((row) => row.items
    .filter((item) => normalize(item.str) === normalize(header))
    .map((item) => ({ x: item.x, y: item.y })));

export function parseFederationActa(
  items: ActaPdfTextItem[],
  pageWidth: number,
  players: ActaPdfPlayer[],
): ParsedActaPdf | null {
  const rows = getRows(items);
  const text = rows.map((row) => row.text).join(' ');
  const normalizedText = normalize(text);
  const dateMatch = text.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})\b/);
  const competitionMatch = text.match(/((?:primera|segunda|tercera)\s+federaci[oó]n(?:\s*\([^)]*\))?)/i);
  const titleRows = getHeaderRows(rows, 'TITULARES');
  const goalHeaderY = getHeaderRows(rows, 'GOLES').at(0)?.y;
  const substituteRows = getHeaderRows(rows, 'SUPLENTES');
  const technicalRows = getHeaderRows(rows, 'CUERPO TÉCNICO');
  const midPoint = pageWidth / 2;

  if (!dateMatch || titleRows.length < 2 || substituteRows.length < 2) return null;

  const leftTitle = titleRows.find((item) => item.x < midPoint);
  const rightTitle = titleRows.find((item) => item.x >= midPoint);
  const leftSubs = substituteRows.find((item) => item.x < midPoint);
  const rightSubs = substituteRows.find((item) => item.x >= midPoint);
  if (!leftTitle || !rightTitle || !leftSubs || !rightSubs) return null;

  const teams = items
    .filter((item) => LEAGUE_TEAMS.some((team) => normalize(team) === normalize(item.str)))
    .sort((a, b) => b.y - a.y)
    .slice(0, 2);
  if (teams.length < 2) return null;

  const leftTeam = teams.find((team) => team.x < midPoint);
  const rightTeam = teams.find((team) => team.x >= midPoint);
  if (!leftTeam || !rightTeam) return null;

  const rosterEndY = Math.max(...technicalRows.map((item) => item.y), 0);
  const rosterStartY = Math.min(leftTitle.y, rightTitle.y);
  const playersBySide = new Map<'left' | 'right', Set<string>>([
    ['left', new Set()],
    ['right', new Set()],
  ]);

  items.forEach((item) => {
    if (item.y >= rosterStartY || (rosterEndY > 0 && item.y <= rosterEndY)) return;
    const player = matchPlayer(item.str, players);
    if (!player) return;
    const side = item.x < midPoint - 50 ? 'left' : item.x > midPoint + 50 ? 'right' : undefined;
    if (!side) return;
    playersBySide.get(side)?.add(player.id);
  });

  const ownSide = playersBySide.get('left')!.size >= playersBySide.get('right')!.size ? 'left' : 'right';
  const ownTeam = ownSide === 'left' ? leftTeam : rightTeam;
  const rivalTeam = ownSide === 'left' ? rightTeam : leftTeam;
  const ownTitle = ownSide === 'left' ? leftTitle : rightTitle;
  const ownSubs = ownSide === 'left' ? leftSubs : rightSubs;
  const ownX = ownSide === 'left'
    ? (item: ActaPdfTextItem) => item.x < midPoint - 50
    : (item: ActaPdfTextItem) => item.x > midPoint + 50;

  if (playersBySide.get(ownSide)!.size < 7) return null;

  const scoreRow = rows.find((row) =>
    Math.abs(row.y - ownTitle.y) <= 4 && /\b(\d{1,2})\s*-\s*(\d{1,2})\b/.test(row.text));
  const score = scoreRow?.text.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/);
  if (!score) return null;

  const goalsAtHalfTime = Number(score[1]);
  const goalsAway = Number(score[2]);
  const date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  const result: ParsedActaPdf = {
    fecha: date,
    rival: formatLabel(rivalTeam.str.trim()),
    resultado: `${goalsAtHalfTime}-${goalsAway}`,
    competicion: competitionMatch ? formatLabel(competitionMatch[1].trim()) : '',
    jugadores: players.map((player) => ({
      ...player,
      titular: false,
      goles: 0,
      tarjetas: 0,
      minutos: 0,
    })),
  };
  const parsedPlayers = new Map(result.jugadores.map((player) => [player.id, player]));
  const ownTechnicalY = technicalRows
    .filter((item) => ownX({ x: item.x, y: item.y, str: '' }))
    .sort((a, b) => b.y - a.y)[0]?.y ?? 0;
  const substitutes = new Set(items
    .filter((item) => ownX(item) && item.y < ownSubs.y && item.y > ownTechnicalY)
    .flatMap((item) => {
      const player = matchPlayer(item.str, players);
      return player ? [player.id] : [];
    }));
  const starterEndY = goalHeaderY === undefined
    ? Math.min(leftSubs.y, rightSubs.y)
    : goalHeaderY - 25;
  const starterStartY = Math.min(leftTitle.y, rightTitle.y);

  items.forEach((item) => {
    if (!ownX(item) || item.y >= starterStartY || item.y < starterEndY) return;
    const player = matchPlayer(item.str, players);
    const parsedPlayer = player ? parsedPlayers.get(player.id) : undefined;
    if (parsedPlayer && !substitutes.has(parsedPlayer.id)) {
      parsedPlayer.titular = true;
      parsedPlayer.minutos = 90;
    }
  });

  const substitutionHeader = getHeaderRows(rows, 'SUSTITUCIONES')
    .find((item) => ownX({ x: item.x, y: item.y, str: '' }));
  const cardHeader = getHeaderRows(rows, 'TARJETAS')
    .filter((item) => ownX({ x: item.x, y: item.y, str: '' }))
    .sort((a, b) => b.y - a.y)[0];

  if (substitutionHeader && cardHeader) {
    const substitutions = items
      .filter((item) => ownX(item) && item.y < substitutionHeader.y && item.y > cardHeader.y)
      .map((item) => getPlayerEvent(item, players))
      .filter((event): event is PlayerEvent => Boolean(event))
      .sort((a, b) => b.y - a.y);

    for (let index = 0; index + 1 < substitutions.length; index += 2) {
      const first = substitutions[index];
      const second = substitutions[index + 1];
      const outgoing = first.minute !== null ? first : second.minute !== null ? second : undefined;
      if (!outgoing || outgoing.minute === null || outgoing.minute > 120) continue;
      const incoming = outgoing === first ? second : first;
      const outgoingPlayer = parsedPlayers.get(outgoing.player.id);
      const incomingPlayer = parsedPlayers.get(incoming.player.id);
      if (outgoingPlayer?.titular) outgoingPlayer.minutos = outgoing.minute;
      if (incomingPlayer) {
        incomingPlayer.titular = false;
        incomingPlayer.minutos = Math.max(0, 90 - outgoing.minute);
      }
    }
  }

  if (cardHeader) {
    items
      .filter((item) => ownX(item) && item.y < cardHeader.y)
      .forEach((item) => {
        const event = getPlayerEvent(item, players);
        if (!event) return;
        const parsedPlayer = parsedPlayers.get(event.player.id);
        if (!parsedPlayer) return;
        parsedPlayer.tarjetas += /roja|expulsi[oó]n/i.test(event.text) ? 2 : 1;
      });
  }

  const goalLines = rows
    .filter((row) => goalHeaderY !== undefined && row.y < goalHeaderY)
    .flatMap((row) => [...row.text.matchAll(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/g)]
      .map((match) => {
        const scorer = rows
          .flatMap((eventRow) => eventRow.items.map((item) => ({ item, y: eventRow.y })))
          .filter(({ item, y }) => Math.abs(y - row.y) <= 4 && /\(\d{1,3}\s*['’′]?\)/.test(item.str))
          .sort((a, b) => Math.abs(a.y - row.y) - Math.abs(b.y - row.y))[0];
        return {
          left: Number(match[1]),
          right: Number(match[2]),
          y: row.y,
          player: scorer ? matchPlayer(scorer.item.str, players) : undefined,
          text: scorer?.item.str ?? '',
        };
      }))
    .sort((a, b) => b.y - a.y);

  let previousScore = { left: 0, right: 0 };
  goalLines.forEach((event) => {
    const ownScoreNow = ownSide === 'left' ? event.left : event.right;
    const ownScoreBefore = ownSide === 'left' ? previousScore.left : previousScore.right;
    if (ownScoreNow > ownScoreBefore && event.player) {
      const player = parsedPlayers.get(event.player.id);
      if (player && !/propia puerta|p\.?\s*p\.?/i.test(event.text)) player.goles += 1;
    }
    previousScore = { left: event.left, right: event.right };
  });

  if (!normalizedText.includes(normalize(ownTeam.str)) || !normalizedText.includes(normalize(rivalTeam.str))) {
    return null;
  }

  return result;
}
