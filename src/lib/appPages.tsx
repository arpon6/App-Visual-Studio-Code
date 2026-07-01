import type { ElementType } from 'react';
import type { UserRole } from './AuthContext';
import Inicio from '../pages/Inicio';
import Plantilla from '../pages/Plantilla';
import Calendario from '../pages/Calendario';
import PeriodoAdaptativo from '../pages/PeriodoAdaptativo';
import SecuenciacionDeContenidos from '../pages/SecuenciacionDeContenidos';
import GeneradorDeSesiones from '../pages/GeneradorDeSesiones';
import PlanDePartido from '../pages/PlanDePartido';
import AnalisisDePartido from '../pages/AnalisisDePartido';
import CortadorDeVideo from '../pages/CortadorDeVideo';
import CortadorDeVideoRival from '../pages/CortadorDeVideoRival';
import DesarrolloIndividual from '../pages/DesarrolloIndividual';
import Estadisticas from '../pages/Estadisticas';
import ResultadosYClasif from '../pages/ResultadosYClasif';
import RepositorioABP from '../pages/RepositorioABP';
import OtrasInformaciones from '../pages/OtrasInformaciones';
import GestionUsuarios from '../pages/GestionUsuarios';
import Wellness from '../pages/Wellness';
import RegistroDeEventos from '../pages/RegistroDeEventos';

type AppPageDefinition = {
  key: string;
  component: ElementType;
  visibleTo: readonly UserRole[];
  showOnHome?: boolean;
};

export const APP_PAGES = [
  { key: 'Inicio', component: Inicio, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const, showOnHome: false },
  { key: 'Plantilla', component: Plantilla, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Calendario', component: Calendario, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Periodo Adaptativo', component: PeriodoAdaptativo, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Secuenciación de contenidos', component: SecuenciacionDeContenidos, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Generador de sesiones', component: GeneradorDeSesiones, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Plan de Partido', component: PlanDePartido, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Desarrollo grupal', component: AnalisisDePartido, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Desarrollo Individual', component: DesarrolloIndividual, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Wellness', component: Wellness, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Estadísticas', component: Estadisticas, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Resultados y Clasif.', component: ResultadosYClasif, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Repositorio ABP', component: RepositorioABP, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Editor de vídeo propio', component: CortadorDeVideo, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Editor de vídeo rival', component: CortadorDeVideoRival, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Otras Informaciones', component: OtrasInformaciones, visibleTo: ['jugador', 'cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Registro de Eventos', component: RegistroDeEventos, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
  { key: 'Gestión de usuarios', component: GestionUsuarios, visibleTo: ['cuerpo_tecnico', 'SUPER_ADMIN'] as const },
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