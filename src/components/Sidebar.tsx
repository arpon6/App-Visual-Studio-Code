import './Sidebar.css';
import type { PageKey } from '../lib/appPages';

type SidebarProps = {
  activeSection: PageKey;
  onSelect: (section: PageKey) => void;
  sections: PageKey[];
  userEmail?: string;
  onSignOut?: () => void;
  notificationCounts?: Partial<Record<PageKey, number>>;
};

function Sidebar({ activeSection, onSelect, sections, userEmail, onSignOut, notificationCounts = {} }: SidebarProps) {
  return (
    <aside className="sidebar-shell card">
      <div className="sidebar-brand">
        <div className="brand-mark">SDO</div>
        <div>
          <h2>SD Oyonesa</h2>
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
            {notificationCounts[section] ? <span className="sidebar-notification-count">{notificationCounts[section]}</span> : null}
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
