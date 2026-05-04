import './PlanDePartido.css';
import { TacticalBoardContainer } from '../components/TacticalBoard';
import { AbpContainer } from '../components/AbpBoard';
import InstruccionesGenerales from '../components/InstruccionesGenerales';
import EnfrentamientoDeSistemas from '../components/EnfrentamientoDeSistemas';

function PlanDePartido() {
  return (
    <section className="page-section plan-page">
      <div className="page-title plan-title">
        <div>
          <small>Plan de Partido</small>
          <h1>Plan de Partido</h1>
        </div>
        <div className="title-actions">
          <button className="btn btn-primary">Exportar PDF</button>
        </div>
      </div>

      <div className="card plan-card plan-card--heading">
        <div className="section-header card-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="section-badge section-badge--green">A</span>
            <div>
              <h2>Alineación inicial</h2>
              <small>Sistema y posicionamiento base</small>
            </div>
          </div>
        </div>
        <TacticalBoardContainer />
      </div>

      <InstruccionesGenerales />

      <AbpContainer />

      <EnfrentamientoDeSistemas />

    </section>
  );
}

export default PlanDePartido;
