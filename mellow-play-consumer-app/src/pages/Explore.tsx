import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, BookOpen, Search, Filter, ArrowRight, Sparkles, Tv, Tent, GraduationCap, PartyPopper, X, ShoppingBag } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { resolveImageUrl } from '../utils/courseImage';
import { useCourseBookingStatus } from '../hooks/useCourseBookingStatus';
import { useCouponTypes } from '../hooks/useCouponTypes';
import { stripHtml } from '../utils/stripHtml';
import CourseCard from '../components/CourseCard';
import { CarouselNudgeButtons, useHorizontalCarousel } from '../components/CarouselNudgeButtons';
import ResponsiveModal from '../components/ResponsiveModal';

const Explore = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const { t, lang } = useTranslation();
  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;
  const { statusMap: courseBookingStatus, isLoading: isBookingStatusLoading } = useCourseBookingStatus(user?.id, selectedChild?.id);
  const couponTypes = useCouponTypes();

  const [courses, setCourses] = useState<any[]>([]);
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'classes' | 'events' | 'news' | 'media'>('all');
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [showShopSoon, setShowShopSoon] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get('/admin/courses'),
      apiClient.get('/news-feed'),
    ])
      .then(([coursesRes, newsRes]) => {
         if (coursesRes.data.success) setCourses(coursesRes.data.courses);
         if (newsRes.data.success) setNewsItems(newsRes.data.items);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // A course with only one-off (specific_date) calendar rules and no
  // recurring (day_of_week) rule is a single-occurrence event — once every
  // specific_date has passed, it's expired and shouldn't clutter discovery.
  // Recurring weekly classes never "expire" this way.
  const isCourseExpired = (course: any) => {
    if (!course.calendar_summary_json) return false;
    let rules: any[];
    try { rules = JSON.parse(course.calendar_summary_json); } catch { return false; }
    if (!rules || rules.length === 0) return false;
    const hasRecurring = rules.some(r => r.day_of_week !== null && r.day_of_week !== undefined);
    if (hasRecurring) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const hasFutureDate = rules.some(r => r.specific_date && new Date(r.specific_date) >= today);
    return !hasFutureDate;
  };

  const byNewest = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  // Extra classes lead the row (leftmost) since they're time-limited/special;
  // regular classes follow, each group still newest-first internally.
  const byExtraFirstThenNewest = (a: any, b: any) => (Number(!!b.is_extraclass) - Number(!!a.is_extraclass)) || byNewest(a, b);

  // Events get their own dedicated section/page below, and Services are
  // booked through their own "Book Service" entry point — both excluded
  // here to avoid double-listing them in the general Classes carousel.
  const allClasses = courses.filter(c => !c.is_event && !c.is_service && !isCourseExpired(c)).sort(byExtraFirstThenNewest);
  const eventsOnly = courses.filter(c => c.is_event && !isCourseExpired(c)).sort(byNewest);
  const newsOnly = newsItems.filter(n => n.type === 'news').sort(byNewest);
  const mediaOnly = newsItems.filter(n => n.type === 'media').sort(byNewest);

  const classesCarousel = useHorizontalCarousel(240, 16);
  const eventsCarousel = useHorizontalCarousel(240, 16);
  const newsCarousel = useHorizontalCarousel(240, 16);
  const mediaCarousel = useHorizontalCarousel(240, 16);

  const categories: { id: 'all' | 'classes' | 'events' | 'news' | 'media'; label: string; Icon: typeof Sparkles; iconColor: string; activeBg: string }[] = [
    { id: 'all', label: lang === 'en' ? 'All' : 'ทั้งหมด', Icon: Sparkles, iconColor: 'text-mellow-red', activeBg: 'bg-mellow-red border-mellow-red' },
    { id: 'classes', label: lang === 'en' ? 'Classes' : 'คลาส', Icon: GraduationCap, iconColor: 'text-mellow-green', activeBg: 'bg-mellow-green border-mellow-green' },
    { id: 'events', label: lang === 'en' ? 'Events' : 'กิจกรรม', Icon: PartyPopper, iconColor: 'text-mellow-purple', activeBg: 'bg-mellow-purple border-mellow-purple' },
    { id: 'news', label: lang === 'en' ? 'News' : 'ข่าวสาร', Icon: Tent, iconColor: 'text-mellow-blue', activeBg: 'bg-mellow-blue border-mellow-blue' },
    { id: 'media', label: lang === 'en' ? 'Fun Facts' : 'เรื่องน่ารู้', Icon: Tv, iconColor: 'text-mellow-purple', activeBg: 'bg-mellow-purple border-mellow-purple' },
  ];

  const renderCourseCardSkeletons = () => (
    <>
      {[0, 1, 2].map(i => (
        <div key={i} className="flex-shrink-0 w-[240px] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-pulse">
          <div className="aspect-[4/3] bg-slate-100" />
          <div className="p-3 space-y-2">
            <div className="h-3.5 w-3/4 bg-slate-100 rounded-full" />
            <div className="h-2.5 w-full bg-slate-100 rounded-full" />
            <div className="h-2.5 w-2/3 bg-slate-100 rounded-full" />
            <div className="h-8 w-full bg-slate-100 rounded-xl mt-2" />
          </div>
        </div>
      ))}
    </>
  );

  const renderNewsCard = (item: any) => {
    const imageUrl = resolveImageUrl(item.image_url);
    const title = lang === 'en' && item.title_en ? item.title_en : item.title;
    const content = lang === 'en' && item.content_en ? item.content_en : item.content;
    // Every card opens the full article page now, not just ones with a
    // video/link — a plain text announcement previously had no way to be
    // read in full, and this should feel like clicking into a real article.
    return (
      <div
        key={item.id}
        onClick={() => navigate(`/news/${item.id}`)}
        className="flex-shrink-0 w-[240px] snap-center bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform"
      >
        <div className="aspect-[16/9] bg-slate-100 relative overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6 opacity-30">
              <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
            </div>
          )}
          {item.video_url && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 bg-white/85 rounded-full flex items-center justify-center shadow-sm">
                <Play size={18} className="text-mellow-blue fill-mellow-blue ml-0.5" />
              </div>
            </div>
          )}
        </div>
        <div className="p-4">
          <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1 line-clamp-2">{title}</h4>
          {content && <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug">{stripHtml(content)}</p>}
        </div>
      </div>
    );
  };

  const getVideoEmbed = (url: string): { type: 'youtube' | 'direct'; src: string } => {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { type: 'youtube', src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1` };
    return { type: 'direct', src: url };
  };

  return (
    <div className="mellow-page bg-[#fbfaf7]">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
            <ChevronLeft size={24} className="mr-0.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5 truncate">{t.explore.title}</h1>
            <span className="text-[14px] font-bold text-mellow-yellow uppercase tracking-[0.2em]">{t.explore.subtitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowShopSoon(true)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
             <ShoppingBag size={18} className="text-slate-400" />
          </button>
          <button className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
             <Search size={20} className="text-slate-400" />
          </button>
          {/* md:+ the left sidebar has its own language toggle at the
              bottom, so this one is mobile-only to avoid a duplicate. */}
          <div className="md:hidden">
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="p-5">
        {/* Categories — fills full width evenly, no ragged trailing space.
            Stays 5 tiles at every breakpoint (an icon grid, not a content
            grid) but caps its own width on wide screens so tiles don't
            balloon as the page container grows. */}
        <div className="grid grid-cols-5 gap-2 pb-6 md:max-w-[560px]">
           {categories.map(cat => {
             const isActive = activeCategory === cat.id;
             return (
               <button
                 key={cat.id}
                 onClick={() => setActiveCategory(cat.id)}
                 className={`px-2 py-3 rounded-2xl border flex flex-col items-center justify-center gap-1 shadow-sm active:scale-95 transition-all ${
                   isActive ? cat.activeBg : 'bg-white border-mellow-line'
                 }`}
               >
                  <cat.Icon size={18} className={isActive ? 'text-white' : cat.iconColor} />
                  <b className={`text-[12px] font-black text-center leading-tight ${isActive ? 'text-white' : 'text-slate-700'}`}>{cat.label}</b>
               </button>
             );
           })}
        </div>

        {loading && (
          <>
            <section className="mb-8 animate-pulse">
              <div className="h-5 w-24 bg-slate-200 rounded-full mb-4" />
              <div className="flex gap-4 overflow-x-hidden pb-4 -mx-5 px-5">{renderCourseCardSkeletons()}</div>
            </section>
            <section className="mb-8 animate-pulse">
              <div className="h-5 w-20 bg-slate-200 rounded-full mb-4" />
              <div className="flex gap-4 overflow-x-hidden pb-4 -mx-5 px-5">{renderCourseCardSkeletons()}</div>
            </section>
          </>
        )}

        {/* Classes Section — merged (extra classes are flagged via the badge
            on the cover instead of a separate section); grows to the right
            as more classes are added, no artificial 5-item cap. */}
        {!loading && (activeCategory === 'all' || activeCategory === 'classes') && allClasses.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-center mb-4 px-1 gap-2">
                <h3 className="font-black text-lg leading-tight shrink-0">{lang === 'en' ? 'Classes' : 'คลาส'}</h3>
                <div className="flex items-center gap-3">
                  <CarouselNudgeButtons onScrollLeft={() => classesCarousel.scrollBy('left')} onScrollRight={() => classesCarousel.scrollBy('right')} />
                  <button onClick={() => navigate('/booking')} className="flex items-center gap-1 text-mellow-purple text-[13px] font-bold active:scale-95 transition-transform shrink-0">
                    {lang === 'en' ? 'View All' : 'ดูคลาสทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>

             <div ref={classesCarousel.ref} style={classesCarousel.containerStyle} className="flex items-stretch gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {isBookingStatusLoading ? renderCourseCardSkeletons() : allClasses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    bookingStatus={courseBookingStatus[course.id]}
                    lang={lang}
                    childCoupons={selectedChild?.coupons}
                    couponTypes={couponTypes}
                  />
                ))}
             </div>
          </section>
        )}

        {/* Events Section — separate from Classes since booking an event is
            its own dedicated flow (own page at /courses/event, see
            CourseList.tsx), not just another class category. */}
        {!loading && (activeCategory === 'all' || activeCategory === 'events') && eventsOnly.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-center mb-4 px-1 gap-2">
                <h3 className="font-black text-lg leading-tight shrink-0">{lang === 'en' ? 'Events' : 'กิจกรรม'}</h3>
                <div className="flex items-center gap-3">
                  <CarouselNudgeButtons onScrollLeft={() => eventsCarousel.scrollBy('left')} onScrollRight={() => eventsCarousel.scrollBy('right')} />
                  <button onClick={() => navigate('/event')} className="flex items-center gap-1 text-mellow-purple text-[13px] font-bold active:scale-95 transition-transform shrink-0">
                    {lang === 'en' ? 'View All' : 'ดูกิจกรรมทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>

             <div ref={eventsCarousel.ref} style={eventsCarousel.containerStyle} className="flex items-stretch gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {isBookingStatusLoading ? renderCourseCardSkeletons() : eventsOnly.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    bookingStatus={courseBookingStatus[course.id]}
                    lang={lang}
                    childCoupons={selectedChild?.coupons}
                    couponTypes={couponTypes}
                  />
                ))}
             </div>
          </section>
        )}

        {/* News Section */}
        {(activeCategory === 'all' || activeCategory === 'news') && newsOnly.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1 gap-2">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">{lang === 'en' ? 'News' : 'ข่าวสาร'}</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">{lang === 'en' ? 'Latest updates' : 'ข่าวสารล่าสุด'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <CarouselNudgeButtons onScrollLeft={() => newsCarousel.scrollBy('left')} onScrollRight={() => newsCarousel.scrollBy('right')} />
                  <button onClick={() => navigate('/news-feed/news')} className="flex items-center gap-1 text-mellow-purple text-[13px] font-bold active:scale-95 transition-transform">
                    {lang === 'en' ? 'View All' : 'ดูข่าวทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>
             <div ref={newsCarousel.ref} style={newsCarousel.containerStyle} className="flex items-stretch gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {newsOnly.map(item => renderNewsCard(item))}
             </div>
          </section>
        )}

        {/* Media ("เรื่องน่ารู้") Section */}
        {(activeCategory === 'all' || activeCategory === 'media') && mediaOnly.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1 gap-2">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">{lang === 'en' ? 'Fun Facts' : 'เรื่องน่ารู้'}</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">{lang === 'en' ? 'For kids & families' : 'เรื่องน่ารู้สำหรับเด็ก และครอบครัว'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <CarouselNudgeButtons onScrollLeft={() => mediaCarousel.scrollBy('left')} onScrollRight={() => mediaCarousel.scrollBy('right')} />
                  <button onClick={() => navigate('/news-feed/media')} className="flex items-center gap-1 text-mellow-purple text-[13px] font-bold active:scale-95 transition-transform">
                    {lang === 'en' ? 'View All' : 'ดูทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>
             <div ref={mediaCarousel.ref} style={mediaCarousel.containerStyle} className="flex items-stretch gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {mediaOnly.map(item => renderNewsCard(item))}
             </div>
          </section>
        )}

        {!loading && activeCategory !== 'all' && activeCategory !== 'classes' &&
          ((activeCategory === 'events' && eventsOnly.length === 0) ||
           (activeCategory === 'news' && newsOnly.length === 0) ||
           (activeCategory === 'media' && mediaOnly.length === 0)) && (
          <div className="text-center py-16 text-slate-400 font-bold">
            {lang === 'en' ? 'No content yet' : 'ยังไม่มีเนื้อหา'}
          </div>
        )}

      </main>

      {videoModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-5"
          onClick={() => setVideoModalUrl(null)}
        >
          <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setVideoModalUrl(null)}
              className="absolute -top-10 right-0 text-white/90 active:scale-90 transition-transform"
              aria-label="Close video"
            >
              <X size={28} />
            </button>
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
              {getVideoEmbed(videoModalUrl).type === 'youtube' ? (
                <iframe
                  src={getVideoEmbed(videoModalUrl).src}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={videoModalUrl} controls autoPlay className="w-full h-full" />
              )}
            </div>
          </div>
        </div>
      )}

      <ResponsiveModal isOpen={showShopSoon} onClose={() => setShowShopSoon(false)} variant="dialog" size="xs" className="text-center">
        <button onClick={() => setShowShopSoon(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
          <X size={16} />
        </button>
        <div className="w-16 h-16 rounded-full bg-mellow-purple/10 flex items-center justify-center mx-auto mb-4 relative">
          <ShoppingBag size={26} className="text-mellow-purple" />
          <Sparkles size={16} className="text-mellow-yellow absolute -top-1 -right-1" fill="currentColor" />
        </div>
        <h3 className="text-lg font-black text-slate-800 mb-2">
          {lang === 'en' ? 'Coming Soon' : 'เร็วๆ นี้'}
        </h3>
        <p className="text-sm font-bold text-slate-500 leading-relaxed">
          {lang === 'en'
            ? "A shop for Mellow Play merchandise and goodies is on the way!"
            : 'ร้านค้าสำหรับสินค้าและของที่ระลึกของ Mellow Play กำลังจะมาเร็วๆ นี้!'}
        </p>
      </ResponsiveModal>
    </div>
  );
};

export default Explore;
