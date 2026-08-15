import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ChevronLeft, Calendar, MapPin, Award, MessageCircleHeart, Play, X, Sparkles } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import { resolveImageUrl } from '../utils/courseImage';
import { formatCustomDate } from '../utils/dateFormat';
import { getBookingPlace } from '../utils/bookingPlace';

const ReportDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookingId } = useParams<{ bookingId: string }>();
  const { lang } = useTranslation();
  const bookingFromState = (location.state as any)?.booking;

  const [progress, setProgress] = useState<any | null | undefined>(undefined);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    apiClient.get(`/journey/progress-by-booking/${bookingId}`)
      .then(res => setProgress(res.data.success ? res.data.progress : null))
      .catch(() => setProgress(null));
  }, [bookingId]);

  let skills: (string | { th: string; en: string; type?: 'achievement' | 'indicator' })[] = [];
  try {
    if (progress?.skills_learned) {
      skills = typeof progress.skills_learned === 'string' ? JSON.parse(progress.skills_learned) : progress.skills_learned;
    }
  } catch {
    skills = [];
  }
  const skillLabel = (s: string | { th: string; en: string }) => {
    if (typeof s === 'string') return s;
    return (lang === 'en' ? s.en : s.th) || s.th || s.en;
  };

  // Course-level "skills" vs. per-report "today's highlight" share one flat
  // array with a type tag; legacy entries (or plain strings) predate the
  // tag and default to skills.
  const skillItems = skills.filter(s => typeof s === 'string' || s.type !== 'indicator');
  const indicatorItems = skills.filter(s => typeof s !== 'string' && s.type === 'indicator');

  if (progress === undefined) {
    return (
      <div className="mellow-page-reading bg-[#fbfaf7] min-h-screen pb-10 animate-pulse">
        <div className="h-[64px] px-5 bg-white/80 border-b border-black/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
          <div className="h-4 w-32 bg-slate-200 rounded-full" />
        </div>
        <div className="p-5 space-y-5">
          <div className="flex gap-4 items-start bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <div className="w-20 h-20 rounded-2xl bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-3/4 bg-slate-200 rounded-full" />
              <div className="h-3 w-1/2 bg-slate-100 rounded-full" />
              <div className="h-3 w-1/3 bg-slate-100 rounded-full" />
            </div>
          </div>
          <div className="h-16 bg-slate-100 rounded-3xl" />
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-2">
            <div className="h-3 w-20 bg-slate-100 rounded-full" />
            <div className="flex gap-1.5">
              <div className="h-6 w-16 bg-slate-100 rounded-full" />
              <div className="h-6 w-20 bg-slate-100 rounded-full" />
            </div>
          </div>
          <div className="h-24 bg-slate-100 rounded-3xl" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[0, 1].map(i => <div key={i} className="aspect-square rounded-2xl bg-slate-200" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mellow-page-reading bg-[#fbfaf7] min-h-screen pb-10">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[17px] font-black tracking-tight">{lang === 'en' ? 'Full Report' : 'รายงานฉบับเต็ม'}</h1>
      </header>

      <div className="p-5 space-y-5">
        {bookingFromState && (
          <div className="flex gap-4 items-start bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            {bookingFromState.course_thumbnail ? (
              <img src={resolveImageUrl(bookingFromState.course_thumbnail)} alt={bookingFromState.course_name} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                <Calendar size={32} className="text-blue-300" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-slate-800 text-[16px] leading-tight mb-2">{bookingFromState.course_name}</h3>
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Calendar size={14} />
                <span className="text-xs font-medium">{formatCustomDate(bookingFromState.scheduled_at, lang, 'full')}</span>
              </div>
              {getBookingPlace(bookingFromState) && (
                <div className="flex items-center gap-2 text-slate-500">
                  <MapPin size={14} />
                  <span className="text-xs font-medium">{getBookingPlace(bookingFromState)!.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {progress === null ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
            <p className="text-sm font-bold text-slate-400">{lang === 'en' ? 'Report not found' : 'ไม่พบรายงานนี้'}</p>
          </div>
        ) : (
          <>
            {progress.node_title && (
              <div className="flex items-center gap-3 bg-mellow-blue/5 border border-mellow-blue/10 rounded-3xl p-4">
                <div className="w-10 h-10 rounded-full bg-mellow-blue/10 flex items-center justify-center shrink-0 text-mellow-blue">
                  <Award size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-black text-mellow-blue uppercase tracking-widest">{lang === 'en' ? 'Achievement' : 'ความสำเร็จ'}</p>
                  <p className="text-sm font-bold text-slate-800">{progress.node_title}</p>
                </div>
              </div>
            )}

            {skillItems.length > 0 && (
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                <p className="text-[12px] font-black text-mellow-purple uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Award size={13} />
                  {lang === 'en' ? 'Skills' : 'ทักษะที่ได้รับ'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {skillItems.map((s, i) => (
                    <span key={i} className="px-3 py-1.5 bg-mellow-purple/10 text-mellow-purple text-[13px] font-black rounded-full">
                      {skillLabel(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {indicatorItems.length > 0 && (
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                <p className="text-[12px] font-black text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Sparkles size={13} />
                  {lang === 'en' ? "Today's Highlight" : 'สิ่งที่โดดเด่นในวันนี้'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {indicatorItems.map((s, i) => (
                    <span key={i} className="px-3 py-1.5 bg-amber-50 text-amber-600 text-[13px] font-black rounded-full">
                      {skillLabel(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-mellow-purple/5 border border-mellow-purple/10 rounded-3xl p-4">
              <p className="text-[12px] font-black text-mellow-purple uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <MessageCircleHeart size={14} />
                {lang === 'en' ? "Facilitator's Note" : 'บันทึกจากคุณครู'}
              </p>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {progress.teacher_comment || (lang === 'en' ? 'No notes yet' : 'ไม่มีบันทึกคุณครู')}
              </p>
            </div>

            {progress.media && progress.media.length > 0 && (
              <div>
                <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
                  {lang === 'en' ? 'Photos & Videos' : 'รูปภาพและวีดีโอ'}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {progress.media.map((m: any, i: number) => (
                    <div
                      key={i}
                      onClick={() => setLightbox({ url: resolveImageUrl(m.url), type: m.type })}
                      className="relative aspect-square rounded-2xl overflow-hidden bg-slate-200 shadow-sm active:scale-95 transition-transform cursor-pointer"
                    >
                      {m.type === 'video' ? (
                        <video src={resolveImageUrl(m.url)} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={resolveImageUrl(m.url)} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                      {m.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-10 h-10 bg-white/85 rounded-full flex items-center justify-center shadow-sm">
                            <Play size={18} className="text-mellow-blue fill-mellow-blue ml-0.5" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-mellow-ink/95 flex items-center justify-center p-5 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div className="relative w-full max-w-[400px] md:max-w-[600px] lg:max-w-[720px]" onClick={e => e.stopPropagation()}>
            {lightbox.type === 'video' ? (
              <video src={lightbox.url} controls autoPlay className="w-full rounded-[32px] shadow-2xl" />
            ) : (
              <img src={lightbox.url} alt="" className="w-full rounded-[32px] shadow-2xl" />
            )}
            <button onClick={() => setLightbox(null)} className="absolute -top-12 right-0 text-white">
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportDetail;
