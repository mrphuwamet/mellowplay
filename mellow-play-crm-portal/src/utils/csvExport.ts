export type CsvCell = string | number | null | undefined;

// Windows forbids these in a file name; a form or report titled "Pre/Post test"
// would otherwise produce a download the browser silently renames or drops.
const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'export';

/**
 * The one place CSV downloads are built.
 *
 * The leading BOM is the whole point of sharing this: without it Excel on
 * Windows reads a UTF-8 CSV as the system codepage and every Thai column comes
 * out as mojibake. Two of the three hand-rolled exports this replaces were
 * missing it. CRLF for the same reason — it is what Excel expects.
 */
export const downloadCsv = (fileName: string, headers: string[], rows: CsvCell[][]) => {
  const escape = (cell: CsvCell) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(fileName)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
