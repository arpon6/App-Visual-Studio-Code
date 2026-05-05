import './Sidebar.css';

type SidebarProps = {
  activeSection: string;
  onSelect: (section: string) => void;
};

const sections = [
  'Inicio',
  'Plantilla',
  'Calendario',
  'Plan de Partido',
  'Análisis de Partido',
  'Desarrollo Individual',
  'Estadísticas',
  'Resultados y Clasif.',
  'Repositorio ABP',
  'Editor de vídeo propio',
  'Editor de vídeo rival',
  'Otras Informaciones',
  'Configuración',
];

function Sidebar({ activeSection, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar-shell card">
      <div className="sidebar-brand">
        <div className="brand-mark">FC</div>
        <div>
          <h2>Mi Club</h2>
          <small>VERSIÓN 2.4.0 • PRO</small>
        </div>
      </div>

      <nav className="sidebar-nav">
        {sections.map((section) => (
          <button
            key={section}
            type="button"
            className={section === activeSection ? 'sidebar-item active' : 'sidebar-item'}
            onClick={() => onSelect(section)}
          >
            {section}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
