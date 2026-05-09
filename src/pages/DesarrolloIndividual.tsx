import { useAuth } from '../lib/AuthContext';

// Tipo de corte guardado por los editores de vídeo
// player_id: null = toda la plantilla, uuid = jugador concreto
interface VideoCorte {
  id: string;
  categoryId: string;
  label: string;
  start: number;
  end: number;
  createdAt: string;
  player_id?: string | null;
  source?: 'propio' | 'rival';
}

function loadCortes(storageKey: string, source: 'propio' | 'rival'): VideoCorte[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return Object.values(stored).flat().map((c: any) => ({ ...c, source })) as VideoCorte[];
  } catch {
    return [];
  }
}

function DesarrolloIndividual() {
  const { appUser } = useAuth();

  const allCortes = [
    ...loadCortes('analisis_cuts', 'propio'),
    ...loadCortes('analisis_cuts_rival', 'rival'),
  ];

  // Jugadores ven solo sus cortes o los de toda la plantilla (player_id null)
  // Cuerpo técnico ve todos
  const cortes = appUser?.role === 'jugador'
    ? allCortes.filter(c => c.player_id == null || c.player_id === appUser.player_id)
    : allCortes;

  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <small>Seguimiento personal</small>
          <h1>Desarrollo Individual</h1>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Cortes de vídeo asignados</h2>
          {appUser?.role === 'jugador' && (
            <small style={{ color: '#7f96bc' }}>Mostrando solo tus cortes y los del equipo</small>
          )}
        </div>

        {cortes.length === 0 ? (
          <p style={{ color: '#7f96bc', padding: '16px 0' }}>
            No hay cortes de vídeo asignados todavía.
          </p>
        ) : (
          <table className="list-table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Tiempo</th>
                <th>Origen</th>
                <th>Asignado a</th>
              </tr>
            </thead>
            <tbody>
              {cortes.map(corte => (
                <tr key={corte.id}>
                  <td>{corte.label}</td>
                  <td>{corte.start}s → {corte.end}s</td>
                  <td>{corte.source === 'rival' ? 'Vídeo rival' : 'Vídeo propio'}</td>
                  <td>{corte.player_id ? 'Individual' : 'Toda la plantilla'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default DesarrolloIndividual;
