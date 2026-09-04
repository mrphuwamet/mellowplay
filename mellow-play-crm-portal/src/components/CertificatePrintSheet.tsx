import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CONSUMER_APP_URL } from '../config';
import { CertField, CertValueMap, parseFields, fieldText } from '../utils/certificateLayout';
import { fontStack, ensureFontLoaded } from '../utils/certificateFonts';
import AutoFitText from './AutoFitText';

/**
 * A stack of certificates laid out for paper.
 *
 * Deliberately not a generated image. Rasterising turns a person's name — set
 * large in the middle of the page, which is the whole product — into pixels.
 * This renders ordinary elements and lets the browser print them as vectors,
 * the same choice the family-facing certificate page makes.
 *
 * Everything here is in real page units: the sheet is millimetres, type is
 * points, and every position is already a percentage of the page. So there is
 * no pixel canvas to scale and no conversion that could disagree with the
 * designer — at print time the page simply *is* the paper.
 *
 * Two callers: the designer's "พิมพ์ตัวอย่าง" and "พิมพ์ที่เลือก" on the booking
 * list. One component, because a preview that printed differently from the real
 * run would be worse than no preview at all.
 */

export interface PrintableCertificate {
  /** For the React key, and for naming the one that failed if one does. */
  id: number | string;
  template: {
    background_url?: string | null;
    page_width?: number | null;
    page_height?: number | null;
    fields_json?: string | null;
  } | null;
  values: CertValueMap;
  /** What the QR points at. Built from public_code when not given. */
  verifyUrl?: string;
}

const CertificatePage = ({ item }: { item: PrintableCertificate }) => {
  const pageW = Number(item.template?.page_width) || 297;
  const pageH = Number(item.template?.page_height) || 210;
  // A box switched off in the designer is left off the paper as well —
  // hiding it in one place and printing it in another is the worst of both.
  const fields = parseFields(item.template?.fields_json).filter(f => !f.hidden);
  const code = String(item.values.public_code ?? '').trim();
  const verifyUrl = item.verifyUrl || (code ? `${CONSUMER_APP_URL}/verify/${code}` : '');

  const renderField = (f: CertField) => {
    const common: React.CSSProperties = {
      position: 'absolute',
      left: `${f.x}%`,
      top: `${f.y}%`,
      width: `${f.w}%`,
      textAlign: f.align || 'center',
    };

    // A draft has no code yet, so it has nothing to point at. Leaving the
    // square blank is honest; printing a QR that leads nowhere is not.
    if (f.type === 'qr' && !verifyUrl) return null;

    if (f.type === 'qr') {
      // Drawn at a generous fixed resolution and scaled by CSS: an SVG QR keeps
      // its edges at any size, and the box is a percentage of the page like
      // every other field.
      return (
        <div key={f.id} style={{
          ...common,
          display: 'flex',
          justifyContent: f.align === 'left' ? 'flex-start' : f.align === 'right' ? 'flex-end' : 'center',
        }}>
          <QRCodeSVG
            value={verifyUrl} size={512} level="M"
            bgColor="transparent" fgColor={f.color || '#172038'}
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
      );
    }

    if (f.type === 'image') {
      /**
       * A signature is decorative here — nothing on the page needs to click
       * it — so the pointer passes straight through. That takes "Save image
       * as" and drag-to-desktop off the picture, which is what turns a
       * signature into a clean transparent PNG someone can paste onto another
       * document.
       *
       * Deterrence, not protection: a screenshot still works, and anyone
       * opening developer tools still gets the file. The only way to have no
       * liftable signature is to have no separate signature file — bake it
       * into the certificate background instead.
       */
      return f.value
        ? (
          <img
            key={f.id} src={f.value} alt="" draggable={false}
            style={{
              ...common, height: 'auto',
              pointerEvents: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        )
        : null;
    }

    const typeStyle: React.CSSProperties = {
      ...common,
      fontWeight: f.fontWeight || 400,
      color: f.color || '#172038',
      fontFamily: fontStack(f.fontFamily),
      lineHeight: 1.25,
      // A height makes the box something the text sits INSIDE — the only
      // reading under which vertical alignment means anything.
      ...(f.h ? {
        height: `${f.h}%`,
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: f.valign === 'top' ? 'flex-start' : f.valign === 'bottom' ? 'flex-end' : 'center',
      } : {}),
    };

    if (f.autoFit) {
      // Points converted here because AutoFitText measures in pixels, which is
      // what the browser lays out in whatever unit the page is written in.
      return (
        <AutoFitText
          key={f.id}
          text={fieldText(f, item.values)}
          fontSizePx={(f.fontSize || 16) * (96 / 72)}
          style={typeStyle}
          align={f.align || 'center'}
        />
      );
    }

    return (
      <div
        key={f.id}
        style={{
          ...typeStyle,
          // Points, straight onto paper — no pixels in between.
          fontSize: `${f.fontSize || 16}pt`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {fieldText(f, item.values)}
      </div>
    );
  };

  return (
    <div
      className="cert-page"
      style={{
        position: 'relative',
        width: `${pageW}mm`,
        height: `${pageH}mm`,
        background: '#fff',
        backgroundImage: item.template?.background_url ? `url(${item.template.background_url})` : undefined,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        overflow: 'hidden',
      }}
    >
      {fields.map(renderField)}
    </div>
  );
};

/**
 * Rendered into the CRM and revealed only by the print stylesheet, rather than
 * written into a popup window: a popup gets blocked, loses the app's Thai
 * fonts, and would need its own copy of the field renderer above.
 *
 * Portalled to <body> and not left where it is written. The stylesheet hides
 * the app by matching body's own children, and inside the React tree this
 * sheet sits under <div id="root"> — so that rule would hide the sheet's own
 * ancestor and print a blank page, however visible the sheet itself was.
 */
const CertificatePrintSheet = ({ items }: { items: PrintableCertificate[] }) => {
  // Fetched before the dialog opens, not after: a print that starts while a
  // font is still downloading prints the fallback.
  useEffect(() => {
    for (const item of items) {
      for (const f of parseFields(item.template?.fields_json)) ensureFontLoaded(f.fontFamily);
    }
  }, [items]);

  if (items.length === 0) return null;
  const first = items[0].template;
  const w = Number(first?.page_width) || 297;
  const h = Number(first?.page_height) || 210;

  return createPortal(
    <div id="certificate-print-root">
      <style>{`
        /* Off-screen rather than display:none.
         *
         * A hidden box has no width, and shrink-to-fit measures the width it
         * is given — so under display:none every auto-fitting name found that
         * nothing fitted and printed at the smallest size allowed. Positioned
         * away instead, the sheet is laid out for real and measures correctly,
         * while still being invisible and unclickable. */
        @media screen {
          #certificate-print-root {
            position: fixed;
            left: -200vw;
            top: 0;
            opacity: 0;
            pointer-events: none;
          }
        }
        @media print {
          /* Paper taken from the first certificate's template. A batch that
             mixes paper sizes still prints — the odd ones keep their own mm
             box inside this sheet. */
          @page { size: ${w}mm ${h}mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body > *:not(#certificate-print-root) { display: none !important; }
          #certificate-print-root { position: static; opacity: 1; display: block; }
          .cert-page {
            page-break-after: always;
            break-after: page;
            /* The artwork IS the certificate, not decoration — without this
               most browsers drop it and print the text onto blank paper. */
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .cert-page:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
      {items.map(item => <CertificatePage key={item.id} item={item} />)}
    </div>,
    document.body
  );
};

export default CertificatePrintSheet;
