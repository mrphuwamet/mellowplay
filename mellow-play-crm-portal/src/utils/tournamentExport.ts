import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Printing a competition.
 *
 * Four documents come out of the same data, because four different people need
 * it: the start list goes to whoever calls entrants to the line, the chart goes
 * on the wall, the results chart is the same wall after the racing, and the
 * results table is what gets filed.
 *
 * Three formats, and the choice is about what happens next to the file — PDF to
 * print, DOC to edit before printing, XLSX to sort and total. A chart has no
 * XLSX form; it is a picture, and a spreadsheet of one would be a lie.
 */

export type ExportTemplate = 'start_list' | 'chart' | 'chart_results' | 'results';
export type ExportFormat = 'pdf' | 'doc' | 'xlsx';

// Windows forbids these in a file name; a bracket called "รุ่น 3-4 ปี / ชาย"
// would otherwise produce a download the browser silently renames or drops.
const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'tournament';

export interface ExportTable {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
}

/**
 * A table as a Word document.
 *
 * Word opens an HTML file with a .doc extension and treats it as editable — no
 * library, no binary format to get wrong, and the person who wanted "เผื่อแก้ไข
 * ต่อ" can just type into it. The charset meta is what keeps Thai intact.
 */
function downloadDoc(fileName: string, bodyHtml: string) {
  const html = `<!DOCTYPE html><html xmlns:w="urn:schemas-microsoft-com:office:word"><head>`
    + `<meta charset="utf-8">`
    + `<style>
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 14px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #555; font-size: 12px; margin: 0 0 16px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; }
        img { max-width: 100%; }
      </style></head><body>${bodyHtml}</body></html>`;

  const blob = new Blob([`﻿${html}`], { type: 'application/msword;charset=utf-8' });
  triggerDownload(blob, `${safeFileName(fileName)}.doc`);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function tableHtml(table: ExportTable): string {
  const head = table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const body = table.rows
    .map(r => `<tr>${r.map(cell => `<td>${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`)
    .join('');
  return `<h1>${escapeHtml(table.title)}</h1><p class="sub">${escapeHtml(table.subtitle)}</p>`
    + `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

export function exportTableXlsx(table: ExportTable) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [table.title],
    [table.subtitle],
    [],
    table.headers,
    ...table.rows,
  ]);
  // Column widths from the content: a start list is mostly names and phone
  // numbers, and the default width cuts every one of them off.
  sheet['!cols'] = table.headers.map((h, i) => ({
    wch: Math.min(48, Math.max(
      h.length + 2,
      ...table.rows.map(r => String(r[i] ?? '').length + 2),
    )),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  XLSX.writeFile(book, `${safeFileName(table.title)}.xlsx`);
}

export function exportTableDoc(table: ExportTable) {
  downloadDoc(table.title, tableHtml(table));
}

/**
 * A table as PDF, drawn rather than rasterised.
 *
 * jsPDF's built-in fonts have no Thai glyphs, so the text is laid out in a
 * hidden DOM node and captured — the same trick the sales report uses, and the
 * only one that renders Thai without shipping a font file for every weight.
 */
export async function exportTablePdf(table: ExportTable) {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;background:#fff;padding:24px;'
    + "font-family:'Sarabun',Tahoma,sans-serif;";
  holder.innerHTML = tableHtml(table);
  document.body.appendChild(holder);
  try {
    await captureToPdf(holder, table.title, 'p');
  } finally {
    document.body.removeChild(holder);
  }
}

/** The bracket itself, captured from the screen. */
export async function exportElementPdf(element: HTMLElement, title: string) {
  await captureToPdf(element, title, 'l');
}

export async function exportElementDoc(element: HTMLElement, title: string) {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
  downloadDoc(title, `<h1>${escapeHtml(title)}</h1><img src="${canvas.toDataURL('image/png')}" />`);
}

async function captureToPdf(element: HTMLElement, title: string, orientation: 'p' | 'l') {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;

  const usableWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  // A long start list is taller than one page: the same image is placed once
  // per page, shifted up, which is how jsPDF paginates a single capture.
  let remaining = imgHeight;
  let offset = 0;
  while (remaining > 0) {
    pdf.addImage(imgData, 'PNG', margin, margin - offset, usableWidth, imgHeight);
    remaining -= pageHeight - margin * 2;
    offset += pageHeight - margin * 2;
    if (remaining > 0) pdf.addPage();
  }
  pdf.save(`${safeFileName(title)}.pdf`);
}
