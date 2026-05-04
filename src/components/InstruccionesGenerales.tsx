import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Player {
  id: number;
  name: string;
  number: number;
}

const STORAGE_KEY = 'instrucciones_generales';
const SUPABASE_TITLE = 'instrucciones_generales';

function isLegacyFormat(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed[0]?.type !== undefined;
  } catch {
    return false;
  }
}

function legacyToText(raw: string): string {
  try {
    const tokens = JSON.parse(raw);
    return tokens.map((t: any) =>
      t.type === 'mention' ? `@[${t.player.name}]` : t.value
    ).join('');
  } catch {
    return '';
  }
}

function renderContent(el: HTMLDivElement, text: string) {
  el.innerHTML = '';
  const parts = text.split(/(@\[[^\]]+\])/g);
  parts.forEach(part => {
    const match = part.match(/^@\[(.+)\]$/);
    if (match) {
      const span = document.createElement('span');
      span.className = 'ig-mention-inline';
      span.contentEditable = 'false';
      span.dataset.mention = match[1];
      span.textContent = `@${match[1]}`;
      el.appendChild(span);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}

function serializeContent(el: HTMLDivElement): string {
  let result = '';
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if ((node as HTMLElement).dataset?.mention) {
      result += `@[${(node as HTMLElement).dataset.mention}]`;
    } else {
      result += (node as HTMLElement).textContent;
    }
  });
  return result;
}

export default function InstruccionesGenerales() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentLoaded = useRef(false);

  // 1. Cargar jugadores
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

  // 2. Renderizar contenido guardado una vez que el editor existe
  //    (no depende de players porque las menciones son solo texto)
  useEffect(() => {
    if (contentLoaded.current || !editorRef.current) return;
    contentLoaded.current = true;

    let raw = localStorage.getItem(STORAGE_KEY);

    // Migrar formato antiguo (array de tokens JSON)
    if (raw && isLegacyFormat(raw)) {
      raw = legacyToText(raw);
      localStorage.setItem(STORAGE_KEY, raw);
    }

    if (raw) {
      renderContent(editorRef.current, raw);
      return;
    }

    // Fallback: cargar desde Supabase
    supabase.from('match_plans').select('tactics').eq('title', SUPABASE_TITLE).maybeSingle()
      .then(({ data }) => {
        if (!editorRef.current) return;
        let text = '';
        if (typeof data?.tactics === 'string') {
          text = data.tactics;
        } else if (Array.isArray(data?.tactics)) {
          text = legacyToText(JSON.stringify(data.tactics));
        }
        if (text) {
          renderContent(editorRef.current, text);
          localStorage.setItem(STORAGE_KEY, text);
        }
      });
  }, []);

  const persist = useCallback((text: string) => {
    localStorage.setItem(STORAGE_KEY, text);
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      const { data } = await supabase.from('match_plans').select('id').eq('title', SUPABASE_TITLE).maybeSingle();
      if (data?.id) {
        await supabase.from('match_plans').update({ tactics: text }).eq('id', data.id);
      } else {
        await supabase.from('match_plans').insert({ title: SUPABASE_TITLE, tactics: text });
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 1500);
  }, []);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setMentionQuery(null); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setMentionQuery(null); persist(serializeContent(el)); return; }

    const text = node.textContent || '';
    const offset = range.startOffset;
    const atPos = text.lastIndexOf('@', offset - 1);

    if (atPos !== -1) {
      setMentionQuery(text.slice(atPos + 1, offset));
    } else {
      setMentionQuery(null);
    }

    persist(serializeContent(el));
  };

  const insertMention = (player: Player) => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent || '';
    const offset = range.startOffset;
    const atPos = text.lastIndexOf('@', offset - 1);
    if (atPos === -1) return;

    // Borrar desde @ hasta cursor
    const del = document.createRange();
    del.setStart(node, atPos);
    del.setEnd(node, offset);
    del.deleteContents();

    // Insertar span de mención
    const span = document.createElement('span');
    span.className = 'ig-mention-inline';
    span.contentEditable = 'false';
    span.dataset.mention = player.name;
    span.textContent = `@${player.name}`;
    sel.getRangeAt(0).insertNode(span);

    // Espacio después y mover cursor
    const space = document.createTextNode('\u00a0');
    span.after(space);
    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setMentionQuery(null);
    persist(serializeContent(el));
  };

  const filteredPlayers = mentionQuery !== null
    ? players.filter(p =>
        p.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        String(p.number).includes(mentionQuery)
      )
    : [];

  return (
    <div className="card plan-card">
      <div className="section-header card-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="section-badge section-badge--green">B</span>
          <div>
            <h2>Instrucciones generales</h2>
            <small>Escribe @ para mencionar a un jugador</small>
          </div>
        </div>
        <div className="tb-save-status">
          {saving && <span className="tb-status tb-status--saving">Guardando…</span>}
          {saved && <span className="tb-status tb-status--saved">✓ Guardado</span>}
        </div>
      </div>

      <div className="ig-editor-wrap">
        <div
          ref={editorRef}
          className="ig-editor-content"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={e => { if (e.key === 'Escape') setMentionQuery(null); }}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          data-placeholder="Escribe las instrucciones del partido… Usa @ para mencionar jugadores"
        />

        {mentionQuery !== null && (
          <div className="ig-mention-dropdown">
            {filteredPlayers.length === 0
              ? <div className="ig-mention-empty">Sin resultados</div>
              : filteredPlayers.map(p => (
                  <div
                    key={p.id}
                    className="ig-mention-option"
                    onMouseDown={e => { e.preventDefault(); insertMention(p); }}
                  >
                    <span className="ig-mention-num">{p.number}</span>
                    {p.name}
                  </div>
                ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
