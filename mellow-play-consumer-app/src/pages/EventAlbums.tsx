import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Images, Loader2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import { formatCustomDate } from '../utils/dateFormat';

interface AlbumRow {
  id: number; name: string; description?: string | null;
  /** Every round the album covers. Empty means the whole activity. */
  rounds?: { slot_date: string; slot_start_time?: string | null }[];
  cover_photo_url?: string | null; course_name: string; photo_count: number; created_at: string;
}

/**
 * อัลบั้มรูปกิจกรรม — the albums this family can open. The server already
 * filters to courses with a non-cancelled booking, so an empty list simply
 * means no attended activity has published its photos yet.
 */
/**
 * The dates an album covers, in a line under its name.
 *
 * A shoot spans several rounds, so this has to survive being a list. One round
 * reads in full; several collapse to the span, because a family is placing the
 * album in time, not auditing its timetable — and a card that wraps to four
 * lines of dates buries the album's own name.
 */
const roundsText = (rounds: { slot_date: string; slot_start_time?: string | null }[] | undefined, lang: 'th' | 'en') => {
  if (!rounds || rounds.length === 0) return '';
  const time = (t?: string | null) => (t ? ` ${String(t).slice(0, 5)} น.` : '');
  if (rounds.length === 1) {
    return ` · ${formatCustomDate(rounds[0].slot_date, lang, 'full')}${time(rounds[0].slot_start_time)}`;
  }
  const dates = Array.from(new Set(rounds.map(r => r.slot_date))).sort();
  // Several rounds on ONE day: name the day, then the times.
  if (dates.length === 1) {
    const times = rounds.map(r => String(r.slot_start_time || '').slice(0, 5)).filter(Boolean).sort();
    return ` · ${formatCustomDate(dates[0], lang, 'full')}${times.length ? ` ${times.join(', ')} น.` : ''}`;
  }
  return ` · ${formatCustomDate(dates[0], lang, 'full')} – ${formatCustomDate(dates[dates.length - 1], lang, 'full')}`;
};

const EventAlbums: React.FC = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const t = (th: string, en: string) => (lang === 'en' ? en : th);
  const [albums, setAlbums] = useState<AlbumRow[] | null>(null);

  useEffect(() => {
    apiClient.get('/event-albums')
      .then(res => setAlbums(res.data.success ? res.data.albums : []))
      .catch(() => setAlbums([]));
  }, []);

  return (
    <div className="pb-24 min-h-screen bg-[#fbfaf7]">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div>
          <h1 className="text-[17px] font-black tracking-tight leading-none mb-0.5">{t('อัลบั้มกิจกรรม', 'Event Albums')}</h1>
          <span className="text-[13px] font-bold text-mellow-blue uppercase tracking-[0.15em]">
            {t('ภาพจากกิจกรรมที่เข้าร่วม', 'Photos from your activities')}
          </span>
        </div>
      </header>

      <main className="p-5 space-y-4">
        {albums === null ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-mellow-purple" /></div>
        ) : albums.length === 0 ? (
          <div className="text-center py-16">
            <Images size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400 leading-relaxed px-8">
              {t('ยังไม่มีอัลบั้ม — อัลบั้มจะปรากฏหลังจากกิจกรรมที่คุณจองเผยแพร่รูปภาพ',
                 'No albums yet — albums appear after an activity you booked publishes its photos')}
            </p>
          </div>
        ) : (
          albums.map(a => (
            <button
              key={a.id}
              onClick={() => navigate(`/event-albums/${a.id}`)}
              className="w-full text-left bg-white rounded-3xl shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div className="w-full aspect-[2/1] bg-slate-100">
                {a.cover_photo_url
                  ? <img src={a.cover_photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Images size={36} className="text-slate-300" /></div>}
              </div>
              <div className="p-4">
                <p className="text-[16px] font-black text-slate-800 leading-snug">{a.name}</p>
                <p className="text-xs font-bold text-slate-500 mt-0.5">
                  {a.course_name}
                  {roundsText(a.rounds, lang)}
                </p>
                <p className="text-[11px] font-bold text-mellow-purple mt-1">{a.photo_count} {t('รูป', 'photos')}</p>
              </div>
            </button>
          ))
        )}
      </main>
    </div>
  );
};

export default EventAlbums;
