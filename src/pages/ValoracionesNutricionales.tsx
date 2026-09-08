import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { usePlantilla } from '../lib/usePlantilla';
import './ValoracionesNutricionales.css';

const STAFF_ROLES = ['entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN'];

interface ValoracionRow {
  id: number;
  periodo: string;
  periodo_label: string;
  dorsal: number;
  jugador: string;
  edad: number | null;
  altura: number | null;
  peso: number | null;
  imc: number | null;
  grasa_pct: number | null;
  grasa_kg: number | null;
  grasa_visceral: number | null;
  musculo_pct: number | null;
  musculo_kg: number | null;
  met_basal: number | null;
  brazo: number | null;
  pecho: number | null;
  abdomen: number | null;
  gluteo: number | null;
  b_gluteo: number | null;
  pierna: number | null;
}

const METRICS: { key: keyof ValoracionRow; label: string }[] = [
  { key: 'edad', label: 'Edad' },
  { key: 'altura', label: 'Altura' },
  { key: 'peso', label: 'Peso' },
  { key: 'imc', label: 'IMC' },
  { key: 'grasa_pct', label: '% Grasa' },
  { key: 'grasa_kg', label: 'Kg Grasa' },
  { key: 'grasa_visceral', label: 'G. Visceral' },
  { key: 'musculo_pct', label: '% Músculo' },
  { key: 'musculo_kg', label: 'Kg Músculo' },
  { key: 'met_basal', label: 'Met. Basal' },
  { key: 'brazo', label: 'Brazo' },
  { key: 'pecho', label: 'Pecho' },
  { key: 'abdomen', label: 'Abdomen' },
  { key: 'gluteo', label: 'Glúteo' },
  { key: 'b_gluteo', label: 'B. Glúteo' },
  { key: 'pierna', label: 'Pierna' },
];

// Encabezados aceptados al pegar una tabla copiada de Excel (sin acentos, en mayúsculas)
const HEADER_ALIASES: Record<string, keyof ValoracionRow> = {
  JUGADOR: 'jugador',
  NOMBRE: 'jugador',
  DORSAL: 'dorsal',
  EDAD: 'edad',
  ALTURA: 'altura',
  PESO: 'peso',
  IMC: 'imc',
  GRASA: 'grasa_pct',
  KGGRASA: 'grasa_kg',
  GRASAVISCERAL: 'grasa_visceral',
  MUSCULO: 'musculo_pct',
  KGMUSCULO: 'musculo_kg',
  METBASAL: 'met_basal',
  BRAZO: 'brazo',
  PECHO: 'pecho',
  ABDOMEN: 'abdomen',
  GLUTEO: 'gluteo',
  BGLUTEO: 'b_gluteo',
  PIERNA: 'pierna',
};

function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function periodoLabelFromValue(periodo: string): string {
  const [year, month] = periodo.split('-').map(Number);
  if (!year || !month || !MONTH_NAMES[month - 1]) return periodo;
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function formatValue(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString().replace('.', ',');
}

interface ParsedImportRow {
  dorsal: number;
  jugador: string;
  values: Partial<Record<keyof ValoracionRow, number>>;
}

function parsePastedTable(text: string): { rows: ParsedImportRow[]; error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return { rows: [], error: 'Pega al menos una fila de cabecera y una de datos.' };

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headerCells = lines[0].split(delimiter);
  const columnMap: (keyof ValoracionRow | null)[] = headerCells.map((cell) => {
    const normalized = normalizeHeader(cell);
    return HEADER_ALIASES[normalized] || null;
  });

  if (!columnMap.includes('dorsal')) {
    return { rows: [], error: 'No se encontró la columna DORSAL en la cabecera pegada.' };
  }

  const rows: ParsedImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter);
    const values: Partial<Record<keyof ValoracionRow, number>> = {};
    let dorsal: number | null = null;
    let jugador = '';
    columnMap.forEach((key, col) => {
      if (!key) return;
      const raw = (cells[col] || '').trim().replace(',', '.');
      if (!raw) return;
      if (key === 'jugador') {
        jugador = raw;
        return;
      }
      const num = Number(raw);
      if (Number.isNaN(num)) return;
      if (key === 'dorsal') dorsal = num;
      else values[key] = num;
    });
    if (dorsal === null) continue;
    rows.push({ dorsal, jugador, values });
  }

  if (rows.length === 0) return { rows: [], error: 'No se han podido leer filas de datos válidas.' };
  return { rows, error: '' };
}

export default function ValoracionesNutricionales() {
  const { user } = useAuth();
  const jugadores = usePlantilla();
  const isStaff = Boolean(user?.role && STAFF_ROLES.includes(user.role));

  const [rows, setRows] = useState<ValoracionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importPeriodo, setImportPeriodo] = useState('');
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('valoraciones_nutricionales')
      .select('*')
      .order('periodo', { ascending: true })
      .order('dorsal', { ascending: true });
    if (fetchError) {
      setError('No se pudieron cargar las valoraciones nutricionales.');
    } else {
      setError('');
      setRows((data as ValoracionRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchRows();
  }, []);

  const propioDorsal = useMemo(() => {
    if (!user?.player_id) return null;
    const jugador = jugadores.find((j) => j.id === user.player_id);
    return jugador?.dorsal ?? null;
  }, [jugadores, user?.player_id]);

  const visibleRows = useMemo(() => {
    if (isStaff) return rows;
    if (propioDorsal === null) return [];
    return rows.filter((row) => row.dorsal === propioDorsal);
  }, [rows, isStaff, propioDorsal]);

  const periodos = useMemo(() => {
    const seen = new Map<string, string>();
    visibleRows.forEach((row) => {
      if (!seen.has(row.periodo)) seen.set(row.periodo, row.periodo_label);
    });
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleRows]);

  const jugadoresList = useMemo(() => {
    const map = new Map<number, string>();
    visibleRows.forEach((row) => {
      map.set(row.dorsal, row.jugador);
    });
    return Array.from(map.entries())
      .map(([dorsal, jugador]) => ({ dorsal, jugador }))
      .sort((a, b) => a.dorsal - b.dorsal);
  }, [visibleRows]);

  const cellByPeriodoAndDorsal = useMemo(() => {
    const map = new Map<string, ValoracionRow>();
    visibleRows.forEach((row) => {
      map.set(`${row.periodo}__${row.dorsal}`, row);
    });
    return map;
  }, [visibleRows]);

  const handleImport = async () => {
    if (!importPeriodo) {
      setImportStatus('Selecciona antes el mes al que corresponden los datos.');
      return;
    }
    const { rows: parsedRows, error: parseError } = parsePastedTable(importText);
    if (parseError) {
      setImportStatus(parseError);
      return;
    }

    setImporting(true);
    setImportStatus('Importando...');
    try {
      const periodoLabel = periodoLabelFromValue(importPeriodo);
      const dorsalToNombre = new Map(jugadores.map((j) => [j.dorsal, j.nombre]));
      const payload = parsedRows.map((row) => ({
        periodo: importPeriodo,
        periodo_label: periodoLabel,
        dorsal: row.dorsal,
        jugador: row.jugador || dorsalToNombre.get(row.dorsal) || `Dorsal ${row.dorsal}`,
        ...row.values,
      }));

      const { error: upsertError } = await supabase
        .from('valoraciones_nutricionales')
        .upsert(payload, { onConflict: 'periodo,dorsal' });

      if (upsertError) {
        setImportStatus(`Error al guardar: ${upsertError.message}`);
      } else {
        setImportStatus(`Importados ${payload.length} jugadores para ${periodoLabel}.`);
        setImportText('');
        await fetchRows();
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Control físico</small>
          <h1>Valoraciones nutricionales</h1>
        </div>
        {isStaff && (
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="vn-toggle-import-btn"
              onClick={() => setShowImport((v) => !v)}
            >
              {showImport ? 'Cerrar importación' : '+ Importar mes'}
            </button>
          </div>
        )}
      </div>

      {isStaff && showImport && (
        <div className="card vn-import-card">
          <h3>Importar un nuevo mes</h3>
          <p className="vn-import-help">
            Copia en Excel la tabla completa (incluida la fila de cabecera con JUGADOR, DORSAL, EDAD, ALTURA, PESO,
            IMC, % GRASA, Kg GRASA, GRASA VISCERAL, % MÚSCULO, Kg MÚSCULO, MET. BASAL, BRAZO, PECHO, ABDOMEN,
            GLÚTEO, B. GLÚTEO, PIERNA) y pégala aquí abajo.
          </p>
          <div className="vn-import-controls">
            <label>
              Mes de los datos
              <input
                type="month"
                value={importPeriodo}
                onChange={(e) => setImportPeriodo(e.target.value)}
              />
            </label>
          </div>
          <textarea
            className="vn-import-textarea"
            placeholder="Pega aquí la tabla copiada de Excel..."
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
          />
          <div className="vn-import-actions">
            <button type="button" onClick={() => void handleImport()} disabled={importing}>
              {importing ? 'Importando...' : 'Importar'}
            </button>
            {importStatus && <span className="vn-import-status">{importStatus}</span>}
          </div>
        </div>
      )}

      <div className="card vn-table-card">
        {loading && <p className="vn-status">Cargando valoraciones...</p>}
        {!loading && error && <p className="vn-status vn-status-error">{error}</p>}
        {!loading && !error && periodos.length === 0 && (
          <p className="vn-status">Todavía no hay valoraciones nutricionales registradas.</p>
        )}
        {!loading && !error && periodos.length > 0 && (
          <div className="vn-table-wrapper">
            <table className="vn-table">
              <thead>
                <tr>
                  <th className="vn-col-fixed" rowSpan={2}>Jugador</th>
                  <th className="vn-col-fixed vn-col-dorsal" rowSpan={2}>Dorsal</th>
                  {periodos.map(([periodo, label]) => (
                    <th key={periodo} colSpan={METRICS.length} className="vn-periodo-header">
                      {label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {periodos.map(([periodo]) =>
                    METRICS.map((metric) => (
                      <th key={`${periodo}-${metric.key}`}>{metric.label}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {jugadoresList.map(({ dorsal, jugador }) => (
                  <tr key={dorsal}>
                    <td className="vn-col-fixed">{jugador}</td>
                    <td className="vn-col-fixed vn-col-dorsal">{dorsal}</td>
                    {periodos.map(([periodo]) => {
                      const row = cellByPeriodoAndDorsal.get(`${periodo}__${dorsal}`);
                      return METRICS.map((metric) => (
                        <td key={`${periodo}-${dorsal}-${metric.key}`}>
                          {row ? formatValue(row[metric.key] as number | null) : '—'}
                        </td>
                      ));
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
