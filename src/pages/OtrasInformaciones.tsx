import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

interface Documento {
  id: string;
  title: string;
  file_name: string;
  public_url: string;
  created_at: string;
}

function OtrasInformaciones() {
  const { appUser } = useAuth();
  const isReadOnly = appUser?.role === 'jugador';
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
    </section>
  );
}

export default OtrasInformaciones;
