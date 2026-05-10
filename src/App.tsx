import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Plantilla from './pages/Plantilla';
import Calendario from './pages/Calendario';
import PlanDePartido from './pages/PlanDePartido';
import AnalisisDePartido from './pages/AnalisisDePartido';
import CortadorDeVideo from './pages/CortadorDeVideo';
import CortadorDeVideoRival from './pages/CortadorDeVideoRival';
import DesarrolloIndividual from './pages/DesarrolloIndividual';
import Estadisticas from './pages/Estadisticas';
import ResultadosYClasif from './pages/ResultadosYClasif';
import RepositorioABP from './pages/RepositorioABP';
import OtrasInformaciones from './pages/OtrasInformaciones';
import Configuracion from './pages/Configuracion';
import GestionUsuarios from './pages/GestionUsuarios';
import Wellness from './pages/Wellness';
import './App.css';

const ALL_SECTIONS = [
  'Inicio', 'Plantilla', 'Calendario', 'Plan de Partido', 'Análisis de Partido',
  'Desarrollo Individual', 'Wellness', 'Estadísticas', 'Resultados y Clasif.', 'Repositorio ABP',
  'Editor de vídeo propio', 'Editor de vídeo rival', 'Otras Informaciones', 'Configuración',
  'Gestión de usuarios',
] as const;

type PageKey = typeof ALL_SECTIONS[number];

// Secciones visibles para jugadores
const PLAYER_SECTIONS: PageKey[] = [
  'Inicio', 'Calendario', 'Desarrollo Individual', 'Wellness', 'Resultados y Clasif.',
];

const PAGE_COMPONENTS: Record<PageKey, React.ReactNode> = {
  'Inicio': <Inicio />,
  'Plantilla': <Plantilla />,
  'Calendario': <Calendario />,
  'Plan de Partido': <PlanDePartido />,
  'Análisis de Partido': <AnalisisDePartido />,
  'Desarrollo Individual': <DesarrolloIndividual />,
  'Wellness': <Wellness />,
  'Estadísticas': <Estadisticas />,
  'Resultados y Clasif.': <ResultadosYClasif />,
  'Repositorio ABP': <RepositorioABP />,
  'Editor de vídeo propio': <CortadorDeVideo />,
  'Editor de vídeo rival': <CortadorDeVideoRival />,
  'Otras Informaciones': <OtrasInformaciones />,
  'Configuración': <Configuracion />,
  'Gestión de usuarios': <GestionUsuarios />,
};

function AppShell() {
  const { session, appUser, loading, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState<PageKey>(
    () => (localStorage.getItem('app_active_section') as PageKey) || 'Inicio'
  );
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => setFocusMode((e as CustomEvent).detail);
    window.addEventListener('cortador-focus-mode', handler);
    return () => window.removeEventListener('cortador-focus-mode', handler);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text, #f4f7ff)' }}>
        Cargando...
      </div>
    );
  }

  if (!session) return <Login />;

  // Si el usuario está autenticado pero no tiene registro en app_users (email no autorizado)
  if (!appUser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', color: 'var(--text, #f4f7ff)' }}>
        <p>Tu cuenta no está autorizada para acceder a esta aplicación.</p>
        <button className="secondary-button" onClick={signOut}>Cerrar sesión</button>
      </div>
    );
  }

  const staffSections = [...ALL_SECTIONS] as string[];
  const visibleSections = appUser.role === 'jugador' ? PLAYER_SECTIONS : staffSections;

  // Si la sección activa no está disponible para este rol, redirigir a Inicio
  const currentSection = visibleSections.includes(activeSection as PageKey)
    ? activeSection
    : 'Inicio';

  const handleSelect = (section: string) => {
    localStorage.setItem('app_active_section', section);
    setActiveSection(section as PageKey);
  };

  return (
    <div className={`app-shell${focusMode ? ' sidebar-hidden' : ''}`}>
      <Sidebar
        activeSection={currentSection}
        onSelect={handleSelect}
        sections={visibleSections as unknown as string[]}
        userEmail={appUser.email}
        onSignOut={signOut}
      />
      <main className="app-main">
        {ALL_SECTIONS.map(key => (
          <div key={key} style={{ display: currentSection === key ? 'contents' : 'none' }}>
            {PAGE_COMPONENTS[key]}
          </div>
        ))}
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
