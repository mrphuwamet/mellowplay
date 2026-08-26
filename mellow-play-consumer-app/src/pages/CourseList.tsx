import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Calendar, Search, X } from 'lucide-react';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { formatCalendarSummary, isCourseEnded, isRegistrationClosed } from '../utils/calendarUtils';
import { getCourseView } from '../utils/courseImage';
import { getCourseDetailPath } from '../utils/courseLinks';
import { stripHtml } from '../utils/stripHtml';

// Mounted two ways: /courses/:type (type comes from the URL, e.g. "extra"/
// "regular") and /event (a dedicated top-level route — events aren't a class
// sub-type from the user's perspective, so they get their own path instead
// of living under /courses/*; the `type` prop hardcodes it here).
const CourseList = ({ type: typeProp }: { type?: string } = {}) => {
  const navigate = useNavigate();
  const { type: typeParam } = useParams<{ type: string }>();
  const type = typeProp ?? typeParam;
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // The list was the whole catalogue with no way through it — for a parent
  // after one class by name, that is a scroll, not a search. ?q= is in the URL
  // so a search survives a reload and can be linked to (Explore's search
  // button lands here).
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const setQuery = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('q', next); else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  // When each course next runs — same map Explore uses — so the catalogue
  // can lead with whatever is happening soonest. A missing map just means
  // the ordering falls back to newest-first; it must never hold the page up.
  const [nextRoundByCourse, setNextRoundByCourse] = useState<Record<number, string>>({});

  useEffect(() => {
    Promise.all([
      apiClient.get('/admin/courses'),
      apiClient.get('/admin/calendar-slots/courses-with-rounds').catch(() => ({ data: {} as any })),
    ])
      .then(([res, roundsRes]) => {
         if (res.data.success) {
            let all = res.data.courses || [];
            if (type === 'extra') all = all.filter((c: any) => c.is_extraclass);
            else if (type === 'regular') all = all.filter((c: any) => !c.is_extraclass && !c.is_event && !c.is_service);
            else if (type === 'event') all = all.filter((c: any) => c.is_event);
            else if (type === 'service') all = all.filter((c: any) => c.is_service);
            setCourses(all);
         }
         if (roundsRes.data?.success) setNextRoundByCourse(roundsRes.data.nextRoundByCourse || {});
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [type]);

  // A finished course's place in time is its LAST run date — that's what
  // "ended, newest first" orders by (falling back to when it was added, for
  // courses that never had a date at all).
  const lastSpecificDate = (course: any): string | null => {
    try {
      const rules = JSON.parse(course.calendar_summary_json || '[]');
      const dates = rules
        .filter((r: any) => (r.day_of_week === null || r.day_of_week === 'null') && r.specific_date)
        .map((r: any) => r.specific_date as string)
        .sort();
      return dates.length ? dates[dates.length - 1] : null;
    } catch { return null; }
  };

  // Soonest happening first; anything already over sinks to the end, most
  // recently finished first — the catalogue reads "what can I still join"
  // down into "what just happened".
  const sortedCourses = useMemo(() => {
    const byNewest = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const upcoming: any[] = [];
    const done: any[] = [];
    for (const c of courses) (isCourseEnded(c) ? done : upcoming).push(c);
    upcoming.sort((a, b) => {
      const da = nextRoundByCourse[a.id];
      const db = nextRoundByCourse[b.id];
      if (da && db) return da.localeCompare(db) || byNewest(a, b);
      if (da) return -1;
      if (db) return 1;
      return byNewest(a, b);
    });
    done.sort((a, b) => {
      const la = lastSpecificDate(a) ?? '';
      const lb = lastSpecificDate(b) ?? '';
      return lb.localeCompare(la) || byNewest(a, b);
    });
    return [...upcoming, ...done];
  }, [courses, nextRoundByCourse]);

  // Name and description, both languages, so searching in Thai finds a
  // class whose title is English and the other way round.
  const normalised = query.trim().toLowerCase();
  const visibleCourses = normalised
    ? sortedCourses.filter(c => [c.name, c.name_en, c.description, c.description_en]
        .some(v => (v || '').toLowerCase().includes(normalised)))
    : sortedCourses;

  const title = type === 'extra' ? 'คลาสกิจกรรมพิเศษ' : type === 'regular' ? 'คลาสเรียนทั่วไป' : type === 'event' ? 'กิจกรรม / Events' : type === 'service' ? 'บริการ / Services' : 'คลาสทั้งหมด';

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen">
      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[17px] font-black tracking-tight leading-none mb-0.5">{title}</h1>
        <div className="w-10 h-10" />
      </header>

      <main className="p-5">
        <div className="relative mb-4">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            autoFocus={searchParams.get('focus') === '1'}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อคลาสหรือกิจกรรม..."
            className="w-full h-12 pl-11 pr-11 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium outline-none focus:border-mellow-purple transition-colors"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
              <X size={14} />
            </button>
          )}
        </div>

        {!loading && visibleCourses.length === 0 && (
          <p className="text-center text-sm font-bold text-slate-400 py-12">
            {normalised ? `ไม่พบรายการที่ตรงกับ "${query}"` : 'ยังไม่มีรายการในหมวดนี้'}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col gap-4 animate-pulse md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex w-full md:flex-col">
                <div className="w-40 h-40 md:w-full md:h-40 bg-slate-200 shrink-0" />
                <div className="flex-1 min-w-0 p-4 space-y-2">
                  <div className="h-4 w-3/4 bg-slate-200 rounded-full" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded-full" />
                  <div className="h-3 w-2/3 bg-slate-100 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {visibleCourses.map(course => {
              const view = getCourseView(course, 'card');
              const shortDescription = (course.short_description || stripHtml(course.description || '')).trim();
              const ended = isCourseEnded(course);
              const closed = isRegistrationClosed(course);
              return (
              <div key={course.id} onClick={() => navigate(getCourseDetailPath(course))} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform flex w-full md:flex-col">
                 <div className="w-40 sm:w-48 md:w-full shrink-0 aspect-square md:aspect-[4/3] bg-slate-100 relative overflow-hidden">
                    {view.url ? (
                      <img src={view.url} alt={course.name} style={view.style} className={`w-full h-full object-cover ${(ended || closed) ? 'grayscale-[40%]' : ''}`} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-6 opacity-30">
                         <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
                      </div>
                    )}
                    {/* Bottom-left, matching the booking flow's picker: these
                        covers carry their own title art across the top. */}
                    <div className={`absolute bottom-2 left-2 px-2 py-1 bg-white/90 backdrop-blur rounded-lg text-[11px] font-black uppercase shadow-sm ${course.is_event ? 'text-mellow-purple' : course.is_service ? 'text-mellow-blue' : course.is_extraclass ? 'text-mellow-yellow-dark' : 'text-mellow-green-dark'}`}>
                      {course.category_name}
                    </div>
                    {(ended || closed) && (
                      <div className="absolute top-2 right-2 bg-slate-400 text-white text-[11px] font-black px-2 py-1 rounded-full shadow-sm">
                        {ended ? 'จบแล้ว' : 'ปิดรับลงทะเบียน'}
                      </div>
                    )}
                 </div>
                 <div className="flex-1 min-w-0 p-4 flex flex-col">
                    {/* Clamped so a two-line name does not make its card taller
                        than the rest of the row — that uneven bottom edge was
                        the "padding" that looked wrong. */}
                    <h4 className="font-black text-[16px] text-slate-800 leading-tight line-clamp-2 min-h-[2.5rem]">{course.name}</h4>
                    {course.name_en && <p className="text-[13px] text-slate-400 font-bold truncate">{course.name_en}</p>}
                    {/* The one-line pitch the card was missing: a name and a
                        price say what it costs but not what it is. */}
                    {shortDescription && (
                      <p className="text-[13px] text-slate-500 leading-snug mt-1.5 line-clamp-2">{shortDescription}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3 mb-1">
                       {course.age_min && course.age_max && (
                         <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[12px] font-bold">
                           {course.age_min}-{course.age_max} ปี
                         </span>
                       )}
                       <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[12px] font-bold">
                         {course.original_price ? `฿${course.original_price.toLocaleString()}` : 'ฟรี'}
                       </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-500 border-t border-slate-100 mt-auto pt-3">
                       <Calendar size={14} className="text-slate-400 shrink-0" />
                       <span className="truncate">{ended ? 'จบแล้ว' : formatCalendarSummary(course.calendar_summary_json)}</span>
                    </div>
                 </div>
              </div>
              );
            })}

            {courses.length === 0 && (
              <div className="text-center py-12 text-slate-400 font-bold">ไม่มีคลาสในหมวดหมู่นี้</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CourseList;
