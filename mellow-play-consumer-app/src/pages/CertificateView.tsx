import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../utils/apiClient';
import {
  CertField, CertTemplate, parseFields, ptToPx, fieldText, formatCertDate,
} from '../utils/certificateLayout';
import { fontStack, ensureFontLoaded } from '../utils/certificateFonts';
import html2canvas from 'html2canvas';
import AutoFitText from '../components/AutoFitText';

/**
 * One certificate, as a page you can read and as a page you can print.
 *
 * Deliberately not a generated image. html2canvas — which this project already
 * uses for the tournament sheets — rasterises: type becomes pixels. A
 * certificate is a person's name set large in the middle of a page, so crisp
 * text is the whole product. Printing an ordinary web page through the
 * browser's own "Save as PDF" keeps the type as vectors, needs no library, and
 * gets the paper size right from an @page rule.
 *
 * No login. A certificate is meant to be shown to people who have no account
 * here, and the code in the URL is the only credential there is.
 */

const PAGE_ID = 'cert-page';

const CertificateView: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [cert, setCert] = useState<any>(null);
  const [template, setTemplate] = useState<CertTemplate | null>(null);
  // The page is drawn at whatever width the screen allows and printed at the
  // real paper size; both read the same percentages, so one measurement is all
  // the difference between them.
  const [renderWidth, setRenderWidth] = useState(900);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!code) { setState('missing'); return; }
    let cancelled = false;
    apiClient.get(`/certificates/${encodeURIComponent(code)}`)
      .then(res => {
        if (cancelled) return;
        if (!res.data.success) { setState('missing'); return; }
        setCert(res.data.certificate);
        setTemplate(res.data.template);
        setState('ok');
      })
      .catch(() => { if (!cancelled) setState('missing'); });
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    const measure = () => setRenderWidth(Math.min(window.innerWidth - 32, 1000));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /**
   * The template names the typeface; this page has to go and get it, or a
   * certificate designed in Kanit reaches the family in whatever their phone
   * happens to default to.
   *
   * ABOVE the early returns below, with every other hook. It sat under them,
   * which meant this page called one more hook once the certificate had loaded
   * than it did while loading — and React refuses to continue, so the page went
   * blank at the exact moment the data arrived.
   */
  useEffect(() => {
    for (const f of parseFields(template?.fields_json)) ensureFontLoaded(f.fontFamily);
  }, [template?.fields_json]);

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-slate-400">กำลังเปิดเกียรติบัตร...</div>;
  }

  if (state === 'missing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-sm p-6 text-center space-y-2">
          <h1 className="text-[19px] font-black text-slate-800">ไม่พบเกียรติบัตรนี้</h1>
          <p className="text-sm font-medium text-slate-500 leading-relaxed">
            ลิงก์อาจพิมพ์ผิด หรือเกียรติบัตรถูกยกเลิกไปแล้ว กรุณาติดต่อเจ้าหน้าที่
          </p>
        </div>
      </div>
    );
  }

  const pageW = template?.page_width || 297;
  const pageH = template?.page_height || 210;
  // Hidden boxes are hidden here too — see CertField.hidden.
  const fields = parseFields(template?.fields_json).filter(f => !f.hidden);
  const height = renderWidth * (pageH / pageW);
  // The page is drawn at renderWidth pixels; the sheet is pageW millimetres.
  // 96/25.4 is pixels per millimetre in CSS, so this is the one factor that
  // takes the whole drawing from the screen to the paper.
  const printScale = (pageW * (96 / 25.4)) / renderWidth;
  const verifyUrl = `${window.location.origin}/verify/${cert.public_code}`;

  // The whole frozen map, so a template may print any answer from the
  // registration form. Dates are formatted inside fieldText now, not here —
  // formatting one of them early would double-format it.
  const data: Record<string, string> = {
    recipient_name: cert.recipient_name,
    course_name: cert.course_name,
    event_date: cert.event_date,
    serial: cert.serial,
    public_code: cert.public_code,
    ...(cert.values || {}),
  };

  /**
   * The certificate as a PNG of exactly what is on screen.
   *
   * Asked for because the printed sheet did not match the preview, and an
   * image cannot disagree with itself: it is a photograph of the very pixels
   * the person is looking at. It is also what most people actually want — a
   * file to keep and send, rather than a print dialog.
   *
   * Three times the screen size, so a 900px preview saves at about 2700px —
   * enough to print at A4 without going soft. The background is served with
   * CORS open, so the canvas is not tainted and this can be read back.
   */
  const downloadImage = async () => {
    const node = document.getElementById(PAGE_ID);
    if (!node) return;
    setSaving(true);
    setSaveError('');
    try {
      // Web fonts have to have arrived, or the capture is of the fallback.
      const fonts = (document as any).fonts;
      if (fonts?.ready) await fonts.ready;

      const canvas = await html2canvas(node, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${cert.serial || cert.public_code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setSaveError('บันทึกรูปไม่สำเร็จ — ลองใช้ปุ่มพิมพ์แทนได้ค่ะ');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: CertField) => {
    const common: React.CSSProperties = {
      position: 'absolute',
      left: `${f.x}%`,
      top: `${f.y}%`,
      width: `${f.w}%`,
      textAlign: f.align || 'center',
    };

    if (f.type === 'qr') {
      // Sized from the field's own width so it scales with the page like
      // everything else, rather than being a fixed pixel square that grows
      // wrong when the page does.
      const px = Math.max(40, (f.w / 100) * renderWidth);
      return (
        <div key={f.id} style={{ ...common, display: 'flex', justifyContent: f.align === 'left' ? 'flex-start' : f.align === 'right' ? 'flex-end' : 'center' }}>
          <QRCodeSVG value={verifyUrl} size={px} level="M" bgColor="transparent" fgColor={f.color || '#172038'} />
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
      lineHeight: 1.25,
      fontFamily: fontStack(f.fontFamily),
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
      return (
        <AutoFitText
          key={f.id}
          text={fieldText(f, data)}
          fontSizePx={ptToPx(f.fontSize || 16, pageW, renderWidth)}
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
          fontSize: ptToPx(f.fontSize || 16, pageW, renderWidth),
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {fieldText(f, data)}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center gap-4 py-6 px-4 print:bg-white print:p-0 print:gap-0">
      {/* @page carries the real paper size, so the browser's own Save as PDF
          produces the right sheet without anyone choosing a size. */}
      <style>{`
        @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          /*
           * SCALED, not resized.
           *
           * The page is laid out at a pixel width and its type is sized from
           * that width. Re-declaring the box in millimetres for print left the
           * type at its screen size inside a much larger sheet, so everything
           * printed smaller than it looked — which is why the printout did not
           * match the preview. Scaling the whole thing by one factor takes the
           * text, the images and the positions along together.
           */
          #${PAGE_ID} {
            transform: scale(${printScale});
            transform-origin: top left;
            box-shadow: none !important;
            border-radius: 0 !important;
            break-inside: avoid;
          }
          /* The scaled box still occupies its original size in the layout, so
             the wrapper is pinned to the sheet and the overflow trimmed. */
          #${PAGE_ID}-wrap {
            width: ${pageW}mm;
            height: ${pageH}mm;
            overflow: hidden;
          }
        }
      `}</style>

      {cert.revoked && (
        <div className="no-print w-full max-w-[1000px] px-4 py-3 rounded-2xl bg-red-50 text-mellow-red text-sm font-bold text-center">
          เกียรติบัตรฉบับนี้ถูกยกเลิกแล้ว
        </div>
      )}

      <div id={`${PAGE_ID}-wrap`}>
      <div
        id={PAGE_ID}
        style={{
          position: 'relative',
          width: renderWidth,
          height,
          background: '#fff',
          backgroundImage: template?.background_url ? `url(${template.background_url})` : undefined,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        }}
        className="rounded-xl shadow-lg overflow-hidden"
      >
        {fields.map(renderField)}
      </div>
      </div>

      <div className="no-print flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void downloadImage()}
            disabled={saving}
            className="px-6 py-3 bg-mellow-purple text-white rounded-2xl text-sm font-black active:scale-95 transition-transform disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึกรูป...' : 'ดาวน์โหลดเป็นรูป'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-6 py-3 bg-white text-mellow-purple border-2 border-mellow-purple rounded-2xl text-sm font-black active:scale-95 transition-transform"
          >
            พิมพ์ / บันทึก PDF
          </button>
        </div>
        <p className="text-[12px] font-medium text-slate-400 text-center max-w-xs leading-relaxed">
          {saveError || 'ดาวน์โหลดเป็นรูปจะได้ไฟล์ตรงกับที่เห็นบนหน้าจอ · พิมพ์ให้เลือกปลายทางเป็น “บันทึกเป็น PDF” เพื่อเก็บไฟล์'}
        </p>
      </div>
    </div>
  );
};

export default CertificateView;
