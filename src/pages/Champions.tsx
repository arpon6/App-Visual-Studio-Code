import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import type { UserRole } from '../lib/AuthContext';
import './Champions.css';

const SYNC_INTERVAL_MS = 60000;
const EDIT_ROLES: UserRole[] = ['entrenador', 'SUPER_ADMIN'];

interface ChampionsApiResponse {
  ok?: boolean;
  rows?: string[][];
  syncedAt?: string;
  error?: string;
}

interface DateColumn {
  col: number;
  label: string;
  day: number;
  month: number;
}

const WEEKDAY_DATE_RE = /(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)\s*(\d{1,2})\/(\d{1,2})/i;
const DATE_ONLY_RE = /(\d{1,2})\/(\d{1,2})(?!\d)/;

function detectDateColumns(headerRows: string[][]): DateColumn[] {
  const found = new Map<number, DateColumn>();
  headerRows.forEach((row) => {
    row.forEach((cell, col) => {
      if (col < 2 || found.has(col)) return;
      const text = String(cell || '').trim();
      if (!text) return;
      const weekdayMatch = text.match(WEEKDAY_DATE_RE);
      const match = weekdayMatch || text.match(DATE_ONLY_RE);
      if (match) {
        const day = Number(weekdayMatch ? weekdayMatch[2] : match[1]);
        const month = Number(weekdayMatch ? weekdayMatch[3] : match[2]);
        if (Number.isFinite(day) && Number.isFinite(month)) {
          found.set(col, { col, label: text, day, month });
        }
      }
    });
  });
  return Array.from(found.values()).sort((a, b) => a.col - b.col);
}

function findTotalColumns(headerRows: string[][]): number[] {
  const cols = new Set<number>();
  headerRows.forEach((row) => {
    row.forEach((cell, col) => {
      if (col < 2) return;
      if (/total/i.test(String(cell || ''))) cols.add(col);
    });
  });
  return Array.from(cols).sort((a, b) => a - b);
}

function findHeaderRowCount(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const first = String(rows[i]?.[0] || '').trim();
    if (/^\d+$/.test(first)) return i;
  }
  return Math.min(rows.length, 1);
}

function findDataRowEnd(rows: string[][], start: number): number {
  let end = start - 1;
  for (let i = start; i < rows.length; i++) {
    const first = String(rows[i]?.[0] || '').trim();
    if (/^\d+$/.test(first)) end = i;
    else break;
  }
  return end;
}

export default function Champions() {
  const { user } = useAuth();
  const canEdit = Boolean(user?.role && EDIT_ROLES.includes(user.role));

  const [rows, setRows] = useState<string[][]>([]);
  const [status, setStatus] = useState('Sincronizando tabla Champions...');
  const [error, setError] = useState('');
  const [blockOffset, setBlockOffset] = useState<number | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);

  useEffect(() => {
    editingRef.current = editingKey;
  }, [editingKey]);

  useEffect(() => {
    let alive = true;

    const sync = async () => {
      if (editingRef.current) return;
      try {
        const response = await fetch('/api/champions-sheet', { method: 'GET', cache: 'no-store' });
        const payload = await response.json() as ChampionsApiResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(String(payload.error || 'No se pudo leer la hoja Champions.'));
        }
        if (!alive) return;
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setError('');
        setStatus(`Sincronizado. Última actualización: ${new Date(payload.syncedAt || Date.now()).toLocaleTimeString()}`);
      } catch (err) {
        if (!alive) return;
        setError((err as Error).message || 'No se pudo sincronizar la tabla Champions.');
      }
    };

    void sync();
    const intervalId = window.setInterval(() => {
      void sync();
    }, SYNC_INTERVAL_MS);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const headerRowCount = useMemo(() => findHeaderRowCount(rows), [rows]);
  const headerRows = useMemo(() => rows.slice(0, headerRowCount), [rows, headerRowCount]);
  const dataEnd = useMemo(() => findDataRowEnd(rows, headerRowCount), [rows, headerRowCount]);
  const dataRows = useMemo(() => rows.slice(headerRowCount, dataEnd + 1), [rows, headerRowCount, dataEnd]);
  const footerRows = useMemo(() => rows.slice(dataEnd + 1), [rows, dataEnd]);

  const dateColumns = useMemo(() => detectDateColumns(headerRows), [headerRows]);
  const totalColumns = useMemo(() => findTotalColumns(headerRows), [headerRows]);

  const lastDataColumn = useMemo(() => {
    let max = 1;
    rows.forEach((row) => {
      if (row.length - 1 > max) max = row.length - 1;
    });
    return max;
  }, [rows]);

  const currentBlockIndex = useMemo(() => {
    if (dateColumns.length === 0) return -1;
    const today = new Date();
    const year = today.getFullYear();
    let bestIdx = 0;
    let bestDiff = Infinity;
    let hasPastOrToday = false;
    dateColumns.forEach((dc, idx) => {
      const d = new Date(year, dc.month - 1, dc.day);
      const diff = d.getTime() - today.getTime();
      if (diff <= 0 && Math.abs(diff) < bestDiff) {
        bestDiff = Math.abs(diff);
        bestIdx = idx;
        hasPastOrToday = true;
      }
    });
    return hasPastOrToday ? bestIdx : 0;
  }, [dateColumns]);

  const activeBlockIndex = blockOffset !== null
    ? Math.min(Math.max(blockOffset, 0), Math.max(dateColumns.length - 1, 0))
    : currentBlockIndex;

  const blockRange = useMemo(() => {
    if (activeBlockIndex < 0 || dateColumns.length === 0) return null;
    const start = dateColumns[activeBlockIndex].col;
    const nextDateCol = dateColumns[activeBlockIndex + 1]?.col;
    const totalBeforeNext = totalColumns.find((c) => c > start && (nextDateCol === undefined || c < nextDateCol));
    let end = nextDateCol !== undefined ? nextDateCol - 1 : lastDataColumn;
    if (totalBeforeNext !== undefined && totalBeforeNext - 1 < end) end = totalBeforeNext - 1;
    return { start, end };
  }, [activeBlockIndex, dateColumns, totalColumns, lastDataColumn]);

  const visibleColumns = useMemo(() => {
    const cols = [0, 1];
    if (blockRange) {
      for (let c = blockRange.start; c <= blockRange.end; c++) cols.push(c);
    }
    totalColumns.forEach((c) => {
      if (!cols.includes(c)) cols.push(c);
    });
    return cols;
  }, [blockRange, totalColumns]);

  const handleCellClick = (sheetRow: number, sheetCol: number, currentValue: string) => {
    if (!canEdit) return;
    setEditingKey(`${sheetRow}-${sheetCol}`);
    setEditingValue(currentValue);
  };

  const commitEdit = async (sheetRow: number, sheetCol: number, rowArrayIndex: number, colIndex: number) => {
    const key = `${sheetRow}-${sheetCol}`;
    if (editingRef.current !== key) return;
    const value = editingValue;
    setEditingKey(null);

    setRows((prev) => {
      const next = prev.map((r) => r.slice());
      if (next[rowArrayIndex]) {
        while (next[rowArrayIndex].length <= colIndex) next[rowArrayIndex].push('');
        next[rowArrayIndex][colIndex] = value;
      }
      return next;
    });

    setSavingKey(key);
    try {
      const response = await fetch('/api/champions-sheet-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: sheetRow, col: sheetCol, value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'No se pudo guardar el cambio.'));
      }
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar el cambio en Google Sheets.');
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  };

  const activeLabel = dateColumns[activeBlockIndex]?.label || '—';

  return (
    <div className="champions-container">
      <div className="card champions-card">
        <div className="champions-header">
          <h2>🏆 Champions</h2>
          <div className="champions-nav">
            <button
              type="button"
              className="nav-btn"
              onClick={() => setBlockOffset(Math.max(activeBlockIndex - 1, 0))}
              disabled={dateColumns.length === 0 || activeBlockIndex <= 0}
            >
              ◀ Anterior
            </button>
            <span className="champions-block-label">{activeLabel}</span>
            <button
              type="button"
              className="nav-btn"
              onClick={() => setBlockOffset(Math.min(activeBlockIndex + 1, dateColumns.length - 1))}
              disabled={dateColumns.length === 0 || activeBlockIndex >= dateColumns.length - 1}
            >
              Siguiente ▶
            </button>
            {blockOffset !== null && (
              <button type="button" className="nav-btn champions-today-btn" onClick={() => setBlockOffset(null)}>
                Ir al día actual
              </button>
            )}
          </div>
        </div>

        <p className={`champions-status ${error ? 'champions-status-error' : ''}`}>{error || status}</p>

        <div className="champions-table-wrapper">
          <table className="champions-table">
            <thead>
              {headerRows.map((row, hIdx) => (
                <tr key={`h-${hIdx}`}>
                  {visibleColumns.map((col) => (
                    <th key={col} className={col < 2 ? 'champions-col-fixed' : ''}>{row[col] || ''}</th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {dataRows.map((row, i) => {
                const absoluteIndex = headerRowCount + i;
                const sheetRow = absoluteIndex + 1;
                return (
                  <tr key={`d-${absoluteIndex}`}>
                    {visibleColumns.map((col) => {
                      const value = row[col] || '';
                      if (col < 2) {
                        return <td key={col} className="champions-col-fixed">{value}</td>;
                      }
                      const sheetCol = col + 1;
                      const cellKey = `${sheetRow}-${sheetCol}`;
                      const isEditing = editingKey === cellKey;
                      return (
                        <td
                          key={col}
                          className={`champions-cell ${canEdit ? 'champions-cell-editable' : ''} ${savingKey === cellKey ? 'champions-cell-saving' : ''}`}
                          onClick={() => !isEditing && handleCellClick(sheetRow, sheetCol, value)}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => commitEdit(sheetRow, sheetCol, absoluteIndex, col)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setEditingKey(null);
                              }}
                            />
                          ) : (value || '\u00A0')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {footerRows.map((row, i) => {
                const absoluteIndex = dataEnd + 1 + i;
                return (
                  <tr key={`f-${absoluteIndex}`} className="champions-footer-row">
                    {visibleColumns.map((col) => (
                      <td key={col} className={col < 2 ? 'champions-col-fixed' : ''}>{row[col] || ''}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!canEdit && <p className="champions-hint">Solo el cuerpo técnico puede editar los valores de esta tabla.</p>}
        {rows.length === 0 && !error && <p className="champions-hint">Cargando datos de la hoja Champions...</p>}
      </div>
    </div>
  );
}
