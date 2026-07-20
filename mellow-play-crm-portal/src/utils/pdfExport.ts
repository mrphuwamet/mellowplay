import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import axios from 'axios';
import { API_URL } from '../config';

interface PdfExportOptions {
  element: HTMLElement;
  fileName: string;
  reportTitle: string;
  periodLabel: string;
  branchLabel: string;
}

// Shared header/footer/pagination logic for dashboard PDF exports (e.g. the
// Sales report) so every export looks consistent — only the captured
// element + labels differ.
export const exportDashboardPdf = async ({ element, fileName, reportTitle, periodLabel, branchLabel }: PdfExportOptions) => {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;

  const userJson = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;

  const headerHeight = 90;
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Mellow Play', margin, margin);
  pdf.setFontSize(13);
  pdf.text(reportTitle, margin, margin + 20);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100);
  pdf.text(`ช่วงเวลา: ${periodLabel}`, margin, margin + 38);
  pdf.text(`สาขา: ${branchLabel}`, margin, margin + 52);
  pdf.text(
    `ผู้ Export: ${currentUser?.name || currentUser?.username || '-'}  |  วันที่ Export: ${new Date().toLocaleString('th-TH')}`,
    margin,
    margin + 66,
  );
  pdf.setDrawColor(230);
  pdf.line(margin, margin + headerHeight - 12, pageWidth - margin, margin + headerHeight - 12);

  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = margin + headerHeight;

  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - position;

  while (heightLeft > 0) {
    pdf.addPage();
    position = heightLeft - imgHeight;
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text('Mellow Play CRM — เอกสารนี้สร้างโดยระบบอัตโนมัติ', margin, pageHeight - 20);
    pdf.text(`หน้า ${p}/${pageCount}`, pageWidth - margin - 40, pageHeight - 20);
  }

  pdf.save(fileName);

  try {
    const token = localStorage.getItem('crm_token');
    await axios.post(
      `${API_URL}/api/v1/admin/audit-log`,
      {
        action: 'export_pdf',
        reportTitle,
        fileName,
        exportedBy: currentUser?.username || currentUser?.name,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    // Audit-log endpoint may not exist yet on the backend — the PDF itself
    // already saved successfully, so this is best-effort and non-blocking.
  }
};
