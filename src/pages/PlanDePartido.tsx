import { useState } from 'react';
import './PlanDePartido.css';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TacticalBoardContainer } from '../components/TacticalBoard';
import { AbpContainer } from '../components/AbpBoard';
import InstruccionesGenerales from '../components/InstruccionesGenerales';
import EnfrentamientoDeSistemas from '../components/EnfrentamientoDeSistemas';

type SectionKey = 'alineacion' | 'instrucciones' | 'abp' | 'enfrentamiento';

const SECTION_OPTIONS: { key: SectionKey; label: string }[] = [
  { key: 'alineacion', label: 'Alineación inicial' },
  { key: 'instrucciones', label: 'Instrucciones generales' },
  { key: 'abp', label: 'ABP' },
  { key: 'enfrentamiento', label: 'Enfrentamiento de sistemas' },
];

const DEFAULT_SECTION_SELECTION: Record<SectionKey, boolean> = {
  alineacion: true,
  instrucciones: true,
  abp: true,
  enfrentamiento: true,
};

function PlanDePartido() {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Record<SectionKey, boolean>>(DEFAULT_SECTION_SELECTION);

  const openExportDialog = () => {
    if (isExporting) return;
    setShowExportDialog(true);
  };

  const closeExportDialog = () => {
    if (isExporting) return;
    setShowExportDialog(false);
  };

  const toggleSection = (key: SectionKey) => {
    setSelectedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const createExportContainer = (sectionsToInclude: SectionKey[]) => {
    const source = document.querySelector('.plan-page') as HTMLElement | null;
    if (!source) return null;

    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelector('.title-actions')?.remove();
    clone.querySelectorAll('[data-export-section]').forEach(node => {
      const key = node.getAttribute('data-export-section') as SectionKey | null;
      if (key && !sectionsToInclude.includes(key)) {
        node.remove();
      }
    });

    const container = document.createElement('div');
    container.className = 'plan-export-container';
    container.appendChild(clone);
    document.body.appendChild(container);
    return container;
  };

  const handleExportPDF = async () => {
    const sectionsToInclude = SECTION_OPTIONS
      .filter(option => selectedSections[option.key])
      .map(option => option.key);

    if (sectionsToInclude.length === 0) {
      alert('Selecciona al menos un apartado para exportar.');
      return;
    }

    const element = createExportContainer(sectionsToInclude);
    if (!element || isExporting) return;

    setIsExporting(true);
    setShowExportDialog(false);

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#0c1622',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;

      let heightLeft = imgHeight;
      let y = margin;

      pdf.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight, undefined, 'FAST');
      heightLeft -= contentHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        y = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight, undefined, 'FAST');
        heightLeft -= contentHeight;
      }

      const dateTag = new Date().toISOString().slice(0, 10);
      pdf.save(`plan-de-partido-${dateTag}.pdf`);
    } catch (error) {
      console.error('Error al exportar PDF del plan de partido:', error);
      alert('No se pudo exportar el PDF. Inténtalo de nuevo.');
    } finally {
      element.remove();
      setIsExporting(false);
    }
  };

  return (
    <>
      <section className="page-section plan-page">
        <div className="page-title plan-title">
          <div>
            <small>Plan de Partido</small>
            <h1>Plan de Partido</h1>
          </div>
          <div className="title-actions">
            <button className="btn btn-primary" onClick={openExportDialog} disabled={isExporting}>
              {isExporting ? 'Generando PDF...' : 'Exportar PDF'}
            </button>
          </div>
        </div>

        <div className="card plan-card plan-card--heading" data-export-section="alineacion">
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

        <div data-export-section="instrucciones">
          <InstruccionesGenerales />
        </div>

        <div data-export-section="abp">
          <AbpContainer />
        </div>

        <div data-export-section="enfrentamiento">
          <EnfrentamientoDeSistemas />
        </div>
      </section>

      {showExportDialog && (
        <div className="export-modal-overlay" role="dialog" aria-modal="true" aria-label="Seleccionar apartados para PDF">
          <div className="export-modal">
            <h3>Selecciona los apartados para el PDF</h3>
            <div className="export-modal-options">
              {SECTION_OPTIONS.map(option => (
                <label key={option.key} className="export-option">
                  <input
                    type="checkbox"
                    checked={selectedSections[option.key]}
                    onChange={() => toggleSection(option.key)}
                    disabled={isExporting}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <div className="export-modal-actions">
              <button className="btn" onClick={closeExportDialog} disabled={isExporting}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleExportPDF} disabled={isExporting}>
                {isExporting ? 'Generando PDF...' : 'Generar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PlanDePartido;
