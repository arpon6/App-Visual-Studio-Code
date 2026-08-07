import './Sidebar.css';
import type { PageKey } from '../lib/appPages';

type ThemeMode = 'dark' | 'light';

type SidebarProps = {
  activeSection: PageKey;
  onSelect: (section: PageKey) => void;
  sections: PageKey[];
  userEmail?: string;
  onSignOut?: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

function Sidebar({ activeSection, onSelect, sections, userEmail, onSignOut, theme, onToggleTheme }: SidebarProps) {
  const isDarkTheme = theme === 'dark';

  return (
    <aside className="sidebar-shell card">
      <div className="sidebar-brand">
        <div className="brand-mark">SDO</div>
        <div>
          <h2>SD Oyonesa</h2>
        </div>
      </div>

      <button
        type="button"
        className="sidebar-theme-toggle"
        onClick={onToggleTheme}
        aria-label={isDarkTheme ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        title={isDarkTheme ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      >
        <span>
          {isDarkTheme ? 'Tema oscuro' : 'Tema claro'}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {isDarkTheme ? (
            <path d="M12 2.75a1 1 0 0 1 1 1V5.5a1 1 0 1 1-2 0V3.75a1 1 0 0 1 1-1Zm0 12.75a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7Zm0 2a5.5 5.5 0 1 1 0-11a5.5 5.5 0 0 1 0 11Zm8.25-5.5a1 1 0 0 1-1-1 1 1 0 0 1 1-1h1.75a1 1 0 1 1 0 2H20.25Zm-18.25 0a1 1 0 1 1 0-2H3.75a1 1 0 1 1 0 2H2Zm15.66-6.41a1 1 0 0 1-1.41-1.41l1.24-1.24a1 1 0 0 1 1.41 1.41l-1.24 1.24Zm-12.31 12.3a1 1 0 0 1-1.41-1.41l1.24-1.24a1 1 0 1 1 1.41 1.41l-1.24 1.24Zm0-12.3L4.35 5.35A1 1 0 0 1 5.76 3.94L7 5.18a1 1 0 1 1-1.41 1.41Zm12.31 12.3-1.24-1.24a1 1 0 1 1 1.41-1.41l1.24 1.24a1 1 0 0 1-1.41 1.41ZM12 18.5a1 1 0 0 1 1 1v1.75a1 1 0 1 1-2 0V19.5a1 1 0 0 1 1-1Z" />
          ) : (
            <path d="M13.6 2.55a1 1 0 0 1 .38 1.85A7.5 7.5 0 1 0 19.6 9.7a1 1 0 0 1 1.84.76A9.5 9.5 0 1 1 13.6 2.55Z" />
          )}
        </svg>
      </button>

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

      {userEmail && (
        <div className="sidebar-user">
          <small title={userEmail}>{userEmail}</small>
          {onSignOut && (
            <button type="button" className="sidebar-signout" onClick={onSignOut}>
              Cerrar sesión
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
