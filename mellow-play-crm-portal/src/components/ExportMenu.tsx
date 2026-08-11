import React, { useState } from 'react';
import {
  Button, Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress, Snackbar, Alert,
} from '@mui/material';
import {
  Download as DownloadIcon,
  TableChart as CsvIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { downloadCsv, CsvCell } from '../utils/csvExport';

export interface CsvPayload {
  /** Without the .csv extension — downloadCsv adds it and sanitises the name. */
  fileName: string;
  headers: string[];
  rows: CsvCell[][];
}

export interface PdfTarget {
  /** Resolved at click time, so it can point at whichever tab is on screen. */
  getElement: () => HTMLElement | null;
  fileName: string;
  reportTitle: string;
  periodLabel?: string;
  branchLabel?: string;
}

/**
 * One export control for both formats.
 *
 * `csv` is a builder rather than a value: assembling rows for a few thousand
 * submissions on every render (just in case someone clicks) is wasted work, so
 * it runs only when the menu item is picked.
 */
const ExportMenu = ({
  csv, pdf, disabled = false, label = 'Export', variant = 'outlined',
}: {
  csv?: () => CsvPayload;
  pdf?: PdfTarget;
  disabled?: boolean;
  label?: string;
  variant?: 'text' | 'outlined' | 'contained';
}) => {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => setAnchor(null);

  const handleCsv = () => {
    close();
    if (!csv) return;
    try {
      const { fileName, headers, rows } = csv();
      downloadCsv(fileName, headers, rows);
    } catch (e: any) {
      setError(e?.message || 'ดาวน์โหลด CSV ไม่สำเร็จ');
    }
  };

  // html2canvas takes a visible moment on a long report, so the button shows a
  // spinner rather than looking like the click did nothing.
  const handlePdf = async () => {
    close();
    if (!pdf) return;
    const element = pdf.getElement();
    if (!element) {
      setError('ไม่พบส่วนที่จะแปลงเป็น PDF');
      return;
    }
    setBusy(true);
    try {
      // Loaded on click, not on import: jspdf + html2canvas are ~600kB and
      // this menu now sits on pages that never used to pull them in.
      const { exportDashboardPdf } = await import('../utils/pdfExport');
      await exportDashboardPdf({
        element,
        fileName: pdf.fileName.endsWith('.pdf') ? pdf.fileName : `${pdf.fileName}.pdf`,
        reportTitle: pdf.reportTitle,
        periodLabel: pdf.periodLabel ?? '-',
        branchLabel: pdf.branchLabel ?? '-',
      });
    } catch (e: any) {
      setError(e?.message || 'สร้าง PDF ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        startIcon={busy ? <CircularProgress size={16} /> : <DownloadIcon />}
        onClick={e => setAnchor(e.currentTarget)}
        disabled={disabled || busy || (!csv && !pdf)}
      >
        {label}
      </Button>

      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        {csv && (
          <MenuItem onClick={handleCsv}>
            <ListItemIcon><CsvIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="ดาวน์โหลด CSV" secondary="เปิดใน Excel / Google Sheets" />
          </MenuItem>
        )}
        {pdf && (
          <MenuItem onClick={handlePdf}>
            <ListItemIcon><PdfIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="ดาวน์โหลด PDF" secondary="ตามหน้าจอที่เห็นอยู่" />
          </MenuItem>
        )}
      </Menu>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: '100%' }}>{error}</Alert>
      </Snackbar>
    </>
  );
};

export default ExportMenu;
