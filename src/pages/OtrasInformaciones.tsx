import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { usePlantilla } from '../lib/usePlantilla';
import { useSharedState } from '../lib/useSharedState';

interface Documento {
  id: string;
  title: string;
  file_name: string;
  public_url: string;
  created_at: string;
}

const GRUPOS_COLS = ['Grupo 1', 'Grupo 2', 'Grupo 3', 'Grupo 4'] as const;
const FILAS_POR_GRUPO = 5; // número de filas (slots) por grupo
type GruposMaterial = Record<string, (string | null)[]>; // grupo -> array de ids de jugador

function OtrasInformaciones() {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'jugador';
  const jugadores = usePlantilla();
  const [gruposMaterial, setGruposMaterial, loadingGrupos] = useSharedState<GruposMaterial>(
    'otras_info_grupos_material',
    Object.fromEntries(GRUPOS_COLS.map(g => [g, Array(FILAS_POR_GRUPO).fill(null)])),
  );
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [titulo, setTitulo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocumentos = async () => {
    const { data } = await supabase
      .from('other_information')
      .select('id, title, file_name, public_url, created_at')
      .not('public_url', 'is', null)
      .order('created_at', { ascending: false });
    if (data) setDocumentos(data as Documento[]);
  };

  useEffect(() => { fetchDocumentos(); }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Selecciona un archivo.');
    if (!titulo.trim()) return setError('Escribe un título para el documento.');
    setError(null);
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${file.name}`;

    const { error: storageError } = await supabase.storage
      .from('documentos')
      .upload(path, file);

    if (storageError) {
      setError('Error al subir el archivo: ' + storageError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path);

    await supabase.from('other_information').insert({
      title: titulo.trim(),
      file_name: file.name,
      storage_path: path,
      public_url: urlData.publicUrl,
      category: 'documento',
    });

    setTitulo('');
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
    fetchDocumentos();
  };

  const handleDelete = async (doc: Documento) => {
    const path = doc.public_url.split('/documentos/')[1];
    await supabase.storage.from('documentos').remove([path]);
    await supabase.from('other_information').delete().eq('id', doc.id);
    setDocumentos(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleGrupoChange = (grupo: string, idx: number, value: string | null) => {
    setGruposMaterial(prev => ({
      ...prev,
      [grupo]: prev[grupo].map((v, i) => (i === idx ? value : v)),
    }));
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Comunicados y novedades</small>
          <h1>Otras Informaciones</h1>
        </div>
      </div>

      {!isReadOnly && (
        <div className="card">
          <div className="section-header">
            <h2>Subir documento</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
            <input
              type="text"
              placeholder="Título del documento"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
            />
            {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
            <button onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Subiendo...' : 'Subir documento'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-header">
          <h2>Documentos disponibles</h2>
        </div>
        {documentos.length === 0 ? (
          <p>No hay documentos subidos.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {documentos.map(doc => (
              <li key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
                <div>
                  <strong>{doc.title}</strong>
                  <br />
                  <small style={{ color: '#888' }}>{doc.file_name}</small>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={doc.public_url} target="_blank" rel="noopener noreferrer">
                    <button>Abrir</button>
                  </a>
                  {!isReadOnly && (
                    <button onClick={() => handleDelete(doc)} style={{ background: '#e53e3e', color: 'white' }}>
                      Eliminar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <div className="section-header">
          <h2>Grupos de material</h2>
        </div>
        {loadingGrupos ? (
          <p>Cargando...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
              <thead>
                <tr>
                  {GRUPOS_COLS.map(g => (
                    <th
                      key={g}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        color: '#7f96bc',
                        fontSize: '0.82rem',
                        letterSpacing: '0.06em',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {g.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: FILAS_POR_GRUPO }).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {GRUPOS_COLS.map(g => {
                      const val = gruposMaterial[g]?.[rowIdx] ?? null;
                      const jugador = jugadores.find(j => j.id === val);
                      return (
                        <td
                          key={g}
                          style={{
                            padding: '6px 10px',
                            textAlign: 'center',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          {isReadOnly ? (
                            <span style={{ fontSize: '0.88rem', color: val ? '#fff' : '#555' }}>
                              {jugador ? jugador.nombre : '—'}
                            </span>
                          ) : (
                            <select
                              value={val ?? ''}
                              onChange={e => handleGrupoChange(g, rowIdx, e.target.value || null)}
                              style={{
                                width: '100%',
                                background: '#1a2133',
                                color: val ? '#fff' : '#7f96bc',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                padding: '5px 8px',
                                fontSize: '0.85rem',
                              }}
                            >
                              <option value="">— Sin asignar —</option>
                              {jugadores.map(j => (
                                <option key={j.id} value={j.id}>{j.nombre}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      );
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

export default OtrasInformaciones;
