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


// The site's own palette. A printed bracket that goes on a wall beside the
// banners should look like it came from the same place they did.
const CI = {
  ink: '#172038',
  muted: '#6c7280',
  line: '#eef0f5',
  paper: '#ffffff',
  bg: '#fbfaf7',
  purple: '#7452d6',
  purpleSoft: '#f4efff',
  red: '#ef4f55',
  redSoft: '#fff0f1',
  yellow: '#f7aa16',
  yellowSoft: '#fff7df',
  green: '#21a45b',
  greenSoft: '#effaf3',
  blue: '#2273d9',
  blueSoft: '#eef6ff',
};

const RANK_STYLE: Record<number, { bg: string; fg: string; label: string }> = {
  1: { bg: '#f7aa16', fg: '#ffffff', label: 'อันดับ 1' },
  2: { bg: '#a8b3c1', fg: '#ffffff', label: 'อันดับ 2' },
  3: { bg: '#c98a5e', fg: '#ffffff', label: 'อันดับ 3' },
};

export interface PrintEntry {
  label: string;
  subLabel?: string | null;
  rank?: number | null;
}

export interface PrintHeat {
  name: string;
  when?: string | null;
  note?: string | null;
  advance?: number | null;
  entries: PrintEntry[];
}

export interface PrintStage {
  label: string;
  isFinal: boolean;
  heats: PrintHeat[];
}

export type BracketOrientation = 'horizontal' | 'vertical';

export interface BracketPrintOptions {
  title: string;
  subtitle: string;
  stages: PrintStage[];
  /** Results sheets print the placings; a draw sheet prints blank lines. */
  withResults: boolean;
  /**
   * 'horizontal' reads left to right, a column per round. 'vertical' stacks the
   * rounds top to bottom — the first round widest, narrowing to the final: an
   * upside-down pyramid, which is how a bracket is usually drawn on a wall.
   */
  orientation: BracketOrientation;
}

// Every measurement the chart is laid out with. Fixed rather than left to the
// browser because the connector lines are drawn from arithmetic on these
// numbers — a card whose real height disagreed with the maths would have a line
// pointing at nothing.
const CHART = {
  cardWidth: 250,
  gap: 96,          // between rounds: room for the elbow of a connector
  headerHeight: 30, // the round's pill
  cardHeader: 34,
  cardMeta: 15,
  entryRow: 20,
  entrySub: 13,
  blankRow: 22,
  notePad: 22,
  cardPadding: 20,
  minCardGap: 18,
};

const cardHeight = (heat: PrintHeat, withResults: boolean): number => {
  const rows = heat.entries.length > 0
    ? heat.entries.reduce((n, e) => n + CHART.entryRow + (e.subLabel ? CHART.entrySub : 0), 0)
    : Math.max(2, 3) * CHART.blankRow;
  const meta = (heat.when || heat.advance) ? CHART.cardMeta : 0;
  const note = heat.note ? CHART.notePad + 12 : 0;
  void withResults;
  return CHART.cardHeader + meta + rows + note + CHART.cardPadding;
};

/**
 * Where every card sits, and every line between them.
 *
 * Positions are computed rather than left to a flex container so the connectors
 * can be real lines: each round's cards are spread evenly along the cross axis,
 * which is what gives a bracket its shape, and a line runs from each card to
 * the card its winners feed — the same mapping the advance action uses.
 */
function layoutChart(stages: PrintStage[], orientation: BracketOrientation, withResults: boolean) {
  const heights = stages.map(stage => stage.heats.map(h => cardHeight(h, withResults)));
  const vertical = orientation === 'vertical';

  // The cross axis has to fit the widest round with no overlap; every other
  // round then spreads its cards across the same span, which is what makes the
  // rounds converge.
  const crossSpan = vertical
    ? Math.max(...stages.map(s => s.heats.length)) * (CHART.cardWidth + CHART.minCardGap)
    : Math.max(...stages.map((s, si) => s.heats.length * (Math.max(...heights[si]) + CHART.minCardGap)));

  const boxes = stages.map((stage, si) => stage.heats.map((heat, hi) => {
    const centre = crossSpan * ((hi + 0.5) / stage.heats.length);
    const h = heights[si][hi];
    if (vertical) {
      const rowTop = stages.slice(0, si).reduce(
        (y, s, i) => y + CHART.headerHeight + Math.max(...heights[i]) + CHART.gap, 0,
      );
      return { x: centre - CHART.cardWidth / 2, y: rowTop + CHART.headerHeight, w: CHART.cardWidth, h };
    }
    return {
      x: si * (CHART.cardWidth + CHART.gap),
      y: CHART.headerHeight + centre - h / 2,
      w: CHART.cardWidth,
      h,
    };
  }));

  // Winner j of heat i lands in next-round heat i+j — the rule the board and
  // the advance action already follow, so the printed lines are the real route.
  const links: string[] = [];
  for (let si = 0; si < stages.length - 1; si++) {
    const next = stages[si + 1];
    stages[si].heats.forEach((heat, hi) => {
      const advance = heat.advance ?? 1;
      const targets = new Set<number>();
      for (let j = 0; j < advance; j++) targets.add((hi + j) % next.heats.length);
      const from = boxes[si][hi];
      targets.forEach(t => {
        const to = boxes[si + 1][t];
        if (vertical) {
          const x1 = from.x + from.w / 2;
          const y1 = from.y + from.h;
          const x2 = to.x + to.w / 2;
          const y2 = to.y;
          const mid = y1 + (y2 - y1) / 2;
          links.push(`M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`);
        } else {
          const x1 = from.x + from.w;
          const y1 = from.y + from.h / 2;
          const x2 = to.x;
          const y2 = to.y + to.h / 2;
          const mid = x1 + (x2 - x1) / 2;
          links.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
        }
      });
    });
  }

  const width = vertical
    ? crossSpan
    : stages.length * CHART.cardWidth + (stages.length - 1) * CHART.gap;
  const height = vertical
    ? stages.reduce((y, _s, i) => y + CHART.headerHeight + Math.max(...heights[i]) + CHART.gap, 0) - CHART.gap
    : CHART.headerHeight + crossSpan;

  return { boxes, links, width, height };
}

/**
 * The bracket as a chart, with the rounds joined by lines.
 *
 * Absolutely positioned from the layout above rather than flowed, because a
 * flowed layout cannot say where a card ended up and so cannot have a line
 * drawn to it. The lines are one SVG behind the cards.
 */
export function buildBracketChartHtml(opts: BracketPrintOptions): string {
  const { title, subtitle, stages, withResults, orientation } = opts;
  const vertical = orientation === 'vertical';
  const { boxes, links, width, height } = layoutChart(stages, orientation, withResults);

  const entryRow = (e: PrintEntry, i: number): string => {
    const rank = withResults && e.rank && RANK_STYLE[e.rank] ? RANK_STYLE[e.rank] : null;
    const marker = rank
      ? `<span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:8px;background:${rank.bg};color:${rank.fg};font-size:9.5px;font-weight:800;">${e.rank}</span>`
      : `<span style="display:inline-block;width:16px;color:${CI.muted};font-size:9.5px;font-weight:700;">${i + 1}.</span>`;
    // No wrapping inside a card: the card's height is arithmetic that the
    // connector lines depend on, and a name that wrapped would move the line.
    return `<div style="height:${CHART.entryRow}px;line-height:${CHART.entryRow}px;display:flex;gap:5px;align-items:center;">
      ${marker}
      <span style="flex:1;min-width:0;font-size:11px;font-weight:700;color:${CI.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.label)}</span>
    </div>${e.subLabel ? `<div style="height:${CHART.entrySub}px;line-height:${CHART.entrySub}px;margin-left:21px;font-size:9px;color:${CI.muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.subLabel)}</div>` : ''}`;
  };

  const blanks = (): string => Array.from({ length: 3 }, () =>
    `<div style="height:${CHART.blankRow}px;border-bottom:1px dashed ${CI.line};"></div>`).join('');

  const cards = stages.map((stage, si) => stage.heats.map((heat, hi) => {
    const box = boxes[si][hi];
    const meta = [heat.when, heat.advance ? `ผ่าน ${heat.advance}` : null].filter(Boolean).join(' · ');
    const accent = stage.isFinal ? CI.yellow : CI.purple;
    return `<div style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;
      box-sizing:border-box;background:${CI.paper};border:1.5px solid ${CI.line};border-top:4px solid ${accent};
      border-radius:12px;padding:8px 10px;overflow:hidden;">
      <div style="height:${CHART.cardHeader - 12}px;line-height:${CHART.cardHeader - 12}px;font-size:12px;font-weight:800;color:${CI.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(heat.name)}</div>
      ${meta ? `<div style="height:${CHART.cardMeta}px;line-height:${CHART.cardMeta}px;font-size:9px;color:${CI.muted};">${escapeHtml(meta)}</div>` : ''}
      ${heat.entries.length > 0 ? heat.entries.map(entryRow).join('') : blanks()}
      ${heat.note ? `<div style="margin-top:4px;height:${CHART.notePad}px;line-height:${CHART.notePad}px;padding:0 6px;border-radius:6px;background:${CI.yellowSoft};color:#7a5300;font-size:8.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(heat.note)}</div>` : ''}
    </div>`;
  }).join('')).join('');

  // One pill per round, sitting at the head of its column or its row.
  const headers = stages.map((stage, si) => {
    const first = boxes[si][0];
    const last = boxes[si][boxes[si].length - 1];
    const style = vertical
      ? `left:0;top:${first.y - CHART.headerHeight}px;width:${width}px;`
      : `left:${first.x}px;top:0;width:${CHART.cardWidth}px;`;
    void last;
    const bg = stage.isFinal ? CI.yellow : CI.purpleSoft;
    const fg = stage.isFinal ? '#ffffff' : CI.purple;
    return `<div style="position:absolute;${style}height:${CHART.headerHeight - 8}px;line-height:${CHART.headerHeight - 8}px;
      background:${bg};color:${fg};border-radius:999px;text-align:center;font-size:11px;font-weight:800;">
      ${stage.isFinal ? '🏆 ' : ''}${escapeHtml(stage.label)}
    </div>`;
  }).join('');

  return `<div style="font-family:'Sarabun',Tahoma,sans-serif;color:${CI.ink};background:${CI.paper};padding:18px;">
    <div style="border-bottom:3px solid ${CI.purple};padding-bottom:10px;margin-bottom:16px;">
      <div style="font-size:19px;font-weight:900;letter-spacing:-0.3px;">${escapeHtml(title)}</div>
      <div style="font-size:11px;color:${CI.muted};margin-top:2px;">${escapeHtml(subtitle)}</div>
    </div>
    <div style="position:relative;width:${width}px;height:${height}px;">
      <svg width="${width}" height="${height}" style="position:absolute;left:0;top:0;overflow:visible;">
        ${links.map(d => `<path d="${d}" fill="none" stroke="${CI.purple}" stroke-width="1.5" stroke-opacity="0.45" />`).join('')}
      </svg>
      ${headers}
      ${cards}
    </div>
    <div style="margin-top:16px;padding-top:8px;border-top:1px solid ${CI.line};font-size:9.5px;color:${CI.muted};text-align:right;">
      Mellow Play
    </div>
  </div>`;
}

/**
 * The bracket as a printable sheet.
 *
 * Built from the data rather than photographed off the screen: a screenshot
 * carries every edit and delete button with it, splits wherever the viewport
 * happened to end, and hands someone a picture of software instead of a start
 * list. This is laid out for paper — columns per round, the site's colours, and
 * nothing on it that anybody could try to click.
 */
export function buildBracketHtml(opts: BracketPrintOptions): string {
  const { title, subtitle, stages, withResults } = opts;

  const entryRow = (e: PrintEntry, i: number): string => {
    const rank = withResults && e.rank && RANK_STYLE[e.rank] ? RANK_STYLE[e.rank] : null;
    const marker = rank
      ? `<span style="display:inline-block;min-width:18px;height:18px;line-height:18px;text-align:center;border-radius:9px;background:${rank.bg};color:${rank.fg};font-size:10px;font-weight:800;margin-right:6px;">${e.rank}</span>`
      : `<span style="display:inline-block;min-width:18px;color:${CI.muted};font-size:10px;font-weight:700;margin-right:6px;">${i + 1}.</span>`;
    const sub = e.subLabel
      ? `<div style="color:${CI.muted};font-size:9.5px;margin-left:24px;line-height:1.35;">${escapeHtml(e.subLabel)}</div>`
      : '';
    return `<div style="padding:5px 8px;border-radius:8px;background:${rank ? CI.yellowSoft : CI.bg};margin-bottom:4px;">
      <div style="font-size:11.5px;font-weight:700;color:${CI.ink};line-height:1.35;">${marker}${escapeHtml(e.label)}</div>
      ${sub}
    </div>`;
  };

  // An empty box on a draw sheet gets ruled lines, so the day can be run with a
  // pen when the wifi is down — which is the situation a printout is for.
  const blankRows = (count: number): string => Array.from({ length: Math.max(2, count) }, () =>
    `<div style="height:22px;border-bottom:1px dashed ${CI.line};margin-bottom:4px;"></div>`).join('');

  const heatCard = (heat: PrintHeat): string => {
    const meta = [heat.when, heat.advance ? `ผ่าน ${heat.advance}` : null].filter(Boolean).join(' · ');
    const body = heat.entries.length > 0
      ? heat.entries.map(entryRow).join('')
      : blankRows(3);
    const note = heat.note
      ? `<div style="margin-top:6px;padding:5px 8px;border-radius:8px;background:${CI.yellowSoft};color:#7a5300;font-size:9.5px;white-space:pre-wrap;line-height:1.4;">${escapeHtml(heat.note)}</div>`
      : '';
    return `<div style="border:1.5px solid ${CI.line};border-radius:14px;padding:10px;background:${CI.paper};margin-bottom:12px;break-inside:avoid;">
      <div style="font-size:12.5px;font-weight:800;color:${CI.ink};">${escapeHtml(heat.name)}</div>
      ${meta ? `<div style="font-size:9.5px;color:${CI.muted};margin-bottom:6px;">${escapeHtml(meta)}</div>` : '<div style="height:6px;"></div>'}
      ${body}
      ${note}
    </div>`;
  };

  const stageColumn = (stage: PrintStage): string => {
    const header = stage.isFinal
      ? `<div style="background:${CI.yellow};color:#fff;border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:800;margin-bottom:10px;text-align:center;">🏆 ${escapeHtml(stage.label)}</div>`
      : `<div style="background:${CI.purpleSoft};color:${CI.purple};border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:800;margin-bottom:10px;text-align:center;">${escapeHtml(stage.label)}</div>`;
    return `<td style="vertical-align:top;padding:0 10px;width:${Math.floor(100 / Math.max(1, stages.length))}%;">
      ${header}${stage.heats.map(heatCard).join('')}
    </td>`;
  };

  // A table, not flexbox: Word understands tables, and this same markup is what
  // the .doc export hands it.
  return `<div style="font-family:'Sarabun',Tahoma,sans-serif;color:${CI.ink};background:${CI.paper};padding:18px 14px;">
    <div style="border-bottom:3px solid ${CI.purple};padding-bottom:10px;margin-bottom:14px;">
      <div style="font-size:19px;font-weight:900;letter-spacing:-0.3px;">${escapeHtml(title)}</div>
      <div style="font-size:11px;color:${CI.muted};margin-top:2px;">${escapeHtml(subtitle)}</div>
    </div>
    <table style="width:100%;border-collapse:separate;border-spacing:0;"><tr>${stages.map(stageColumn).join('')}</tr></table>
    <div style="margin-top:14px;padding-top:8px;border-top:1px solid ${CI.line};font-size:9.5px;color:${CI.muted};text-align:right;">
      Mellow Play
    </div>
  </div>`;
}

/** The printable bracket as a PDF: the chart, with its connector lines. */
export async function exportBracketPdf(opts: BracketPrintOptions) {
  const holder = document.createElement('div');
  // Sized to the chart rather than to a fixed width — captureToPdf scales the
  // capture onto the page, so the layout keeps its proportions either way.
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;display:inline-block;background:#fff;';
  holder.innerHTML = buildBracketChartHtml(opts);
  document.body.appendChild(holder);
  try {
    // A pyramid is taller than it is wide, and columns are wider than tall.
    await captureToPdf(holder, opts.title, opts.orientation === 'vertical' ? 'p' : 'l');
  } finally {
    document.body.removeChild(holder);
  }
}

/**
 * The same rounds as an editable Word document.
 *
 * Deliberately the table layout, not the chart: Word cannot be trusted with
 * absolute positioning or an SVG overlay, and someone asking for .doc wants to
 * retype a name rather than to reproduce a diagram.
 */
export function exportBracketDoc(opts: BracketPrintOptions) {
  downloadDoc(opts.title, buildBracketHtml(opts));
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
