import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
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
import './App.css';

const PAGE_KEYS = [
  'Inicio', 'Plantilla', 'Calendario', 'Plan de Partido', 'Análisis de Partido',
  'Desarrollo Individual', 'Estadísticas', 'Resultados y Clasif.', 'Repositorio ABP',
  'Editor de vídeo propio', 'Editor de vídeo rival', 'Otras Informaciones', 'Configuración',
] as const;

type PageKey = typeof PAGE_KEYS[number];

const PAGE_COMPONENTS: Record<PageKey, React.ReactNode> = {
  'Inicio': <Inicio />,
  'Plantilla': <Plantilla />,
  'Calendario': <Calendario />,
  'Plan de Partido': <PlanDePartido />,
  'Análisis de Partido': <AnalisisDePartido />,
  'Desarrollo Individual': <DesarrolloIndividual />,
  'Estadísticas': <Estadisticas />,
  'Resultados y Clasif.': <ResultadosYClasif />,
  'Repositorio ABP': <RepositorioABP />,
  'Editor de vídeo propio': <CortadorDeVideo />,
  'Editor de vídeo rival': <CortadorDeVideoRival />,
  'Otras Informaciones': <OtrasInformaciones />,
  'Configuración': <Configuracion />,
};

function App() {
  const [activeSection, setActiveSection] = useState<PageKey>(
    () => (localStorage.getItem('app_active_section') as PageKey) || 'Inicio'
  );
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => setFocusMode((e as CustomEvent).detail);
    window.addEventListener('cortador-focus-mode', handler);
    return () => window.removeEventListener('cortador-focus-mode', handler);
  }, []);

  const handleSelect = (section: string) => {
    localStorage.setItem('app_active_section', section);
    setActiveSection(section as PageKey);
  };

  return (
    <div className={`app-shell${focusMode ? ' sidebar-hidden' : ''}`}>
      <Sidebar activeSection={activeSection} onSelect={handleSelect} />
      <main className="app-main">
        {PAGE_KEYS.map(key => (
          <div key={key} style={{ display: activeSection === key ? 'contents' : 'none' }}>
            {PAGE_COMPONENTS[key]}
          </div>
        ))}
      </main>
    </div>
  );
}

export default App;
