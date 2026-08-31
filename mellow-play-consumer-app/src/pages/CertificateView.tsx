import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../utils/apiClient';
import {
  CertField, CertTemplate, parseFields, ptToPx, fieldText, formatCertDate,
} from '../utils/certificateLayout';
import { fontStack, ensureFontLoaded } from '../utils/certificateFonts';
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
  // The template names the typeface; this page has to go and get it, or a
  // certificate designed in Kanit reaches the family in whatever their phone
  // happens to default to.
  useEffect(() => { for (const f of fields) ensureFontLoaded(f.fontFamily); }, [template?.fields_json]);
  const height = renderWidth * (pageH / pageW);
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
      return f.value
        ? <img key={f.id} src={f.value} alt="" style={{ ...common, height: 'auto' }} />
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
          multiline={!!f.h}
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
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          #${PAGE_ID} {
            width: ${pageW}mm !important;
            height: ${pageH}mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            break-inside: avoid;
          }
        }
      `}</style>

      {cert.revoked && (
        <div className="no-print w-full max-w-[1000px] px-4 py-3 rounded-2xl bg-red-50 text-mellow-red text-sm font-bold text-center">
          เกียรติบัตรฉบับนี้ถูกยกเลิกแล้ว
        </div>
      )}

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

      <div className="no-print flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-6 py-3 bg-mellow-purple text-white rounded-2xl text-sm font-black active:scale-95 transition-transform"
        >
          บันทึกเป็น PDF / พิมพ์
        </button>
        <p className="text-[12px] font-medium text-slate-400 text-center max-w-xs leading-relaxed">
          ในหน้าต่างพิมพ์ เลือกปลายทางเป็น “บันทึกเป็น PDF” เพื่อเก็บไฟล์ไว้
        </p>
      </div>
    </div>
  );
};

export default CertificateView;
