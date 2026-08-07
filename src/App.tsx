import { useEffect, useRef, useState, type ComponentType } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import { APP_PAGE_KEYS, APP_PAGES, getHomeShortcutKeys, getVisiblePageKeys, isPageKey, type PageKey } from './lib/appPages';
import './App.css';

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'app_theme';

function AppShell() {
  const { user, loading, signOut } = useAuth();
  const mainRef = useRef<HTMLElement | null>(null);
  
  // LOG DE DEPURACIÓN
  useEffect(() => {
    console.log("Usuario actual en AppShell:", user);
  }, [user]);

  const [activeSection, setActiveSection] = useState<PageKey>(
    () => {
      const savedSection = localStorage.getItem('app_active_section');
      return savedSection && isPageKey(savedSection) ? savedSection : 'Inicio';
    }
  );
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Si el almacenamiento no está disponible, seguimos con el tema en memoria.
    }
  }, [theme]);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 1080px)').matches) return;
    mainRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [activeSection]);

  useEffect(() => {
    const handler = (e: Event) => setFocusMode((e as CustomEvent).detail);
    window.addEventListener('cortador-focus-mode', handler);
    return () => window.removeEventListener('cortador-focus-mode', handler);
  }, []);

  // Listen to app-wide navigation events (from infographic in Inicio)
  useEffect(() => {
    const nav = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | undefined;
      if (detail && isPageKey(detail)) {
        localStorage.setItem('app_active_section', detail);
        setActiveSection(detail);
      }
    };
    window.addEventListener('app-navigate', nav as EventListener);
    return () => window.removeEventListener('app-navigate', nav as EventListener);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text, #f4f7ff)' }}>
        Cargando...
      </div>
    );
  }

  if (!user) return <Login />;

  const visibleSections = getVisiblePageKeys(user.role);
  const homeShortcutSections = getHomeShortcutKeys(user.role);

  const currentSection = visibleSections.includes(activeSection)
    ? activeSection
    : 'Inicio';

  const handleSelect = (section: string) => {
    localStorage.setItem('app_active_section', section);
    setActiveSection(section as PageKey);
  };

  const handleToggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className={`app-shell${focusMode ? ' sidebar-hidden' : ''}`}>
      <Sidebar
        activeSection={currentSection}
        onSelect={handleSelect}
        sections={visibleSections}
        userEmail={user.username}
        onSignOut={signOut}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
      <main ref={mainRef} className="app-main">
        {currentSection !== 'Inicio' && (
          <button
            type="button"
            className="back-to-home-btn"
            onClick={() => handleSelect('Inicio')}
            aria-label="Volver a Inicio"
            title="Volver a Inicio"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 3.5 3 11h2v9.5h5.5V15h3v5.5H19V11h2L12 3.5Z" />
            </svg>
          </button>
        )}
        {APP_PAGES.map((page) => {
          const PageComponent = page.component as ComponentType<{ quickAccessSections?: PageKey[] }>;

          return (
            <div key={page.key} style={{ display: currentSection === page.key ? 'contents' : 'none' }}>
              {page.key === 'Inicio'
                ? <PageComponent quickAccessSections={homeShortcutSections} />
                : <PageComponent />}
            </div>
          );
        })}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;