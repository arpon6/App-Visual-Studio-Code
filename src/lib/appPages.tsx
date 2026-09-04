import type { ElementType } from 'react';
import type { UserRole } from './AuthContext';
import Inicio from '../pages/Inicio';
import Plantilla from '../pages/Plantilla';
import Calendario from '../pages/Calendario';
import PeriodoAdaptativo from '../pages/PeriodoAdaptativo';
import SecuenciacionDeContenidos from '../pages/SecuenciacionDeContenidos';
import GeneradorDeSesiones from '../pages/GeneradorDeSesiones';
import PlanDePartido from '../pages/PlanDePartido';
import AnalisisDelRival from '../pages/AnalisisDelRival';
import AnalisisDePartido from '../pages/AnalisisDePartido';
import CortadorDeVideo from '../pages/CortadorDeVideo';
import EditorDeImagenes from '../pages/EditorDeImagenes';
import CortadorDeVideoRival from '../pages/CortadorDeVideoRival';
import DesarrolloIndividual from '../pages/DesarrolloIndividual';
import Estadisticas from '../pages/Estadisticas';
import ResultadosYClasif from '../pages/ResultadosYClasif';
import RepositorioABP from '../pages/RepositorioABP';
import OtrasInformaciones from '../pages/OtrasInformaciones';
import GestionUsuarios from '../pages/GestionUsuarios';
import Wellness from '../pages/Wellness';
import RegistroDeEventos from '../pages/RegistroDeEventos';
import Champions from '../pages/Champions';

type AppPageDefinition = {
  key: string;
  component: ElementType;
  visibleTo: readonly UserRole[];
  showOnHome?: boolean;
};

const STAFF_ROLES = ['entrenador', 'preparador_fisico', 'directivo', 'SUPER_ADMIN'] as const;
const SHARED_ROLES = ['jugador', ...STAFF_ROLES] as const;
const RIVAL_ANALYSIS_ROLES = ['entrenador', 'directivo', 'SUPER_ADMIN'] as const;

export const APP_PAGES = [
  { key: 'Inicio', component: Inicio, visibleTo: SHARED_ROLES, showOnHome: false },
  { key: 'Plantilla', component: Plantilla, visibleTo: SHARED_ROLES },
  { key: 'Calendario', component: Calendario, visibleTo: SHARED_ROLES },
  { key: 'Periodo Adaptativo', component: PeriodoAdaptativo, visibleTo: [], showOnHome: false },
  { key: 'Secuenciación de contenidos', component: SecuenciacionDeContenidos, visibleTo: STAFF_ROLES },
  { key: 'Generador de sesiones', component: GeneradorDeSesiones, visibleTo: STAFF_ROLES },
  { key: 'Plan de Partido', component: PlanDePartido, visibleTo: STAFF_ROLES },
  { key: 'Análisis del rival', component: AnalisisDelRival, visibleTo: RIVAL_ANALYSIS_ROLES },
  { key: 'Desarrollo grupal', component: AnalisisDePartido, visibleTo: SHARED_ROLES },
  { key: 'Desarrollo Individual', component: DesarrolloIndividual, visibleTo: SHARED_ROLES },
  { key: 'Wellness', component: Wellness, visibleTo: SHARED_ROLES },
  { key: 'Champions', component: Champions, visibleTo: SHARED_ROLES },
  { key: 'Estadísticas', component: Estadisticas, visibleTo: SHARED_ROLES },
  { key: 'Resultados y Clasif.', component: ResultadosYClasif, visibleTo: SHARED_ROLES },
  { key: 'Repositorio ABP', component: RepositorioABP, visibleTo: SHARED_ROLES },
  { key: 'Editor de vídeo propio', component: CortadorDeVideo, visibleTo: STAFF_ROLES },
  { key: 'Editor de imágenes', component: EditorDeImagenes, visibleTo: SHARED_ROLES },
  { key: 'Editor de vídeo rival', component: CortadorDeVideoRival, visibleTo: STAFF_ROLES },
  { key: 'Otras Informaciones', component: OtrasInformaciones, visibleTo: SHARED_ROLES },
  { key: 'Registro de Eventos', component: RegistroDeEventos, visibleTo: STAFF_ROLES },
  { key: 'Gestión de usuarios', component: GestionUsuarios, visibleTo: STAFF_ROLES },
] as const satisfies readonly AppPageDefinition[];

export type PageKey = typeof APP_PAGES[number]['key'];

const typedPages: readonly AppPageDefinition[] = APP_PAGES;

export const APP_PAGE_KEYS = typedPages.map((page) => page.key as PageKey) as PageKey[];

export function isPageKey(value: string): value is PageKey {
  return APP_PAGE_KEYS.includes(value as PageKey);
}

export function getVisiblePageKeys(role: UserRole): PageKey[] {
  return typedPages.filter((page) => page.visibleTo.includes(role)).map((page) => page.key as PageKey);
}

export function getHomeShortcutKeys(role: UserRole): PageKey[] {
  return typedPages
    .filter((page) => page.key !== 'Inicio' && page.showOnHome !== false && page.visibleTo.includes(role))
    .map((page) => page.key as PageKey);
}