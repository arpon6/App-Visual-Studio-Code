import { useState } from 'react';
import './PlanDePartido.css';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TacticalBoardContainer } from '../components/TacticalBoard';
import { AbpContainer } from '../components/AbpBoard';
import InstruccionesGenerales from '../components/InstruccionesGenerales';
import EnfrentamientoDeSistemas from '../components/EnfrentamientoDeSistemas';

function PlanDePartido() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    const element = document.querySelector('.plan-page') as HTMLElement | null;
    if (!element || isExporting) return;

    setIsExporting(true);

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
      setIsExporting(false);
    }
  };

  return (
    <section className="page-section plan-page">
      <div className="page-title plan-title">
        <div>
          <small>Plan de Partido</small>
          <h1>Plan de Partido</h1>
        </div>
        <div className="title-actions">
          <button className="btn btn-primary" onClick={handleExportPDF} disabled={isExporting}>
            {isExporting ? 'Generando PDF...' : 'Exportar PDF'}
          </button>
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
