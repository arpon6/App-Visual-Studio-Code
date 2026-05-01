import { useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import Inicio from './pages/Inicio';
import Plantilla from './pages/Plantilla';
import Calendario from './pages/Calendario';
import PlanDePartido from './pages/PlanDePartido';
import AnalisisDePartido from './pages/AnalisisDePartido';
import CortadorDeVideo from './pages/CortadorDeVideo';
import DesarrolloIndividual from './pages/DesarrolloIndividual';
import Estadisticas from './pages/Estadisticas';
import ResultadosYClasif from './pages/ResultadosYClasif';
import RepositorioABP from './pages/RepositorioABP';
import OtrasInformaciones from './pages/OtrasInformaciones';
import Configuracion from './pages/Configuracion';
import './App.css';

const pages = {
  Inicio: <Inicio />,
  Plantilla: <Plantilla />,
  Calendario: <Calendario />,
  'Plan de Partido': <PlanDePartido />,
  'Análisis de Partido': <AnalisisDePartido />,
  'Desarrollo Individual': <DesarrolloIndividual />,
  Estadísticas: <Estadisticas />,
  'Resultados y Clasif.': <ResultadosYClasif />,
  'Repositorio ABP': <RepositorioABP />,
  'Cortador de vídeo': <CortadorDeVideo />,
  'Otras Informaciones': <OtrasInformaciones />,
  Configuración: <Configuracion />,
};

function App() {
  const [activeSection, setActiveSection] = useState('Inicio');
  const pageContent = useMemo(() => pages[activeSection as keyof typeof pages], [activeSection]);

  return (
    <div className="app-shell">
      <Sidebar activeSection={activeSection} onSelect={setActiveSection} />
      <main className="app-main">
        {pageContent}
      </main>
    </div>
  );
}

export default App;
