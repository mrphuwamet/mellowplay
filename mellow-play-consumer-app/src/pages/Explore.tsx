import { useState, useEffect, useMemo } from 'react';
import NewsFilterBar, { NewsKind } from '../components/NewsFilterBar';
import HashtagText from '../components/HashtagText';
import { hasHashtag, topHashtags } from '../utils/hashtags';
import { formatTime24, formatCustomDate } from '../utils/dateFormat';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Play, BookOpen, Search, Filter, ArrowRight, Sparkles, Tv, Tent, GraduationCap, PartyPopper, X, ShoppingBag, CalendarClock } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { resolveImageUrl } from '../utils/courseImage';
import { useCourseBookingStatus } from '../hooks/useCourseBookingStatus';
import { useCouponTypes } from '../hooks/useCouponTypes';
import CourseCard from '../components/CourseCard';
import { CarouselNudgeButtons, useHorizontalCarousel } from '../components/CarouselNudgeButtons';
import ResponsiveModal from '../components/ResponsiveModal';
import BookingDetailModal from '../components/BookingDetailModal';
import ChildAvatar from '../components/ChildAvatar';
import { getBookingPlace } from '../utils/bookingPlace';
import { getBookingPeopleLabel } from '../utils/bookingPeople';
import { stripHtml } from '../utils/stripHtml';

type ExploreCategory = 'all' | 'upcoming' | 'classes' | 'events' | 'news' | 'media';
const VALID_CATEGORIES: ExploreCategory[] = ['all', 'upcoming', 'classes', 'events', 'news', 'media'];

// Every carousel slide on this page shares one width: 1.5 cards per phone
// screen — one in full and half of the next peeking, so it's obvious there's
// more to scroll — paired with the carousels' gap-3 (the one 12px gap in
// view is what the calc subtracts). 2.5-per-screen was tried and reverted:
// the cards got too small to read. max-w keeps the slides at roughly the
// old fixed-card size on tablet/desktop, where 66% of the row would be huge.
const SLIDE_CARD_WIDTH = 'w-[calc(66.66%-8px)] min-w-[220px] max-w-[280px]';

const Explore = () => {
  const navigate = useNavigate();
  // Lets a direct link (e.g. /explore/upcoming, for marketing/notification
  // deep-links) open straight into that tab — an invalid/absent segment
  // just falls back to "all", same as visiting /explore itself.
  const { category: categoryParam } = useParams<{ category?: string }>();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const children = useChildStore(state => state.children);
  const { t, lang } = useTranslation();
  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;
  const { statusMap: courseBookingStatus, isLoading: isBookingStatusLoading } = useCourseBookingStatus(user?.id, selectedChild?.id);
  const couponTypes = useCouponTypes();

  const [courses, setCourses] = useState<any[]>([]);
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ExploreCategory>(
    VALID_CATEGORIES.includes(categoryParam as ExploreCategory) ? (categoryParam as ExploreCategory) : 'all'
  );
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [showShopSoon, setShowShopSoon] = useState(false);
  // When each course next runs, so the catalogue can be ordered by "soonest"
  // rather than by when it was added — which is the order a person browsing
  // actually wants and the one the page did not have.
  const [nextRoundByCourse, setNextRoundByCourse] = useState<Record<number, string>>({});
  const [newsKind, setNewsKind] = useState<NewsKind>('all');
  const [newsQuery, setNewsQuery] = useState('');
  // Seeded from the URL so a tag tapped inside an article lands here already
  // filtered, and so a filtered view can be shared or reached with Back.
  const [activeTag, setActiveTag] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('tag'));

  // Kept in the URL so the filter survives a refresh and can be shared.
  // replaceState rather than a push: filtering is not a place in history, and
  // Back should leave Explore rather than step through every tag tried.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTag) params.set('tag', activeTag); else params.delete('tag');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [activeTag]);

  useEffect(() => {
    Promise.all([
      apiClient.get('/admin/courses'),
      apiClient.get('/news-feed'),
      apiClient.get('/admin/calendar-slots/courses-with-rounds'),
    ])
      .then(([coursesRes, newsRes, roundsRes]) => {
         if (coursesRes.data.success) setCourses(coursesRes.data.courses);
         if (newsRes.data.success) setNewsItems(newsRes.data.items);
         // A missing map just means the catalogue falls back to newest-first.
         // The ordering is a courtesy and must never hold the page up.
         if (roundsRes.data?.success) setNextRoundByCourse(roundsRes.data.nextRoundByCourse || {});
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // The "กำลังมาถึง" tab is the parent's own upcoming bookings (things
  // already registered for), same data Home.tsx's upcoming-activities
  // sidebar uses — not a general browse-all-events discovery feed.
  useEffect(() => {
    if (!user?.id) { setUpcomingBookings([]); return; }
    apiClient.get(`/profiles/bookings/upcoming?userId=${user.id}`)
      .then(res => { if (res.data.success) setUpcomingBookings(res.data.bookings || []); })
      .catch(err => console.error(err));
  }, [user?.id]);

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

  /**
   * Soonest first, and anything with no date at all last.
   *
   * Not "newest first": a class added to the catalogue this morning that next
   * runs in December is less use to someone browsing than one running on
   * Saturday. Courses with no upcoming round sink rather than disappear —
   * they are still real things to read about, just not things to plan around.
   */
  const bySoonest = (a: any, b: any) => {
    const da = nextRoundByCourse[a.id];
    const db = nextRoundByCourse[b.id];
    if (da && db) return da.localeCompare(db) || byNewest(a, b);
    if (da) return -1;
    if (db) return 1;
    return byNewest(a, b);
  };
  // Events get their own dedicated section/page below, and Services are
  // booked through their own "Book Service" entry point — both excluded
  // here to avoid double-listing them in the general Classes carousel.
  // Extra classes still lead — they are time-limited and that is the point of
  // them — but within each group it is soonest-first now, not newest-first.
  const byExtraFirstThenSoonest = (a: any, b: any) =>
    (Number(!!b.is_extraclass) - Number(!!a.is_extraclass)) || bySoonest(a, b);

  const allClasses = courses.filter(c => !c.is_event && !c.is_service && !isCourseExpired(c)).sort(byExtraFirstThenSoonest);
  const eventsOnly = courses.filter(c => c.is_event && !isCourseExpired(c)).sort(bySoonest);

  // News stays newest-first: for an announcement, recency IS the relevance.
  const newsSorted = useMemo(() => [...newsItems].sort(byNewest), [newsItems]);

  const newsTags = useMemo(
    () => topHashtags(newsSorted.flatMap(n => [n.content, n.content_en, n.title, n.title_en])),
    [newsSorted]
  );

  const filteredNews = useMemo(() => {
    const q = newsQuery.trim().toLowerCase();
    return newsSorted.filter(n => {
      if (newsKind !== 'all' && n.type !== newsKind) return false;
      // Title as well as body: a tag in the headline is still a tag.
      if (activeTag && !(hasHashtag(n.content, activeTag) || hasHashtag(n.content_en, activeTag)
        || hasHashtag(n.title, activeTag) || hasHashtag(n.title_en, activeTag))) return false;
      if (!q) return true;
      return [n.title, n.title_en, n.content, n.content_en]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [newsSorted, newsKind, activeTag, newsQuery]);

  const newsOnly = filteredNews.filter(n => n.type === 'news');
  const mediaOnly = filteredNews.filter(n => n.type === 'media');

  const classesCarousel = useHorizontalCarousel(240, 16);
  const eventsCarousel = useHorizontalCarousel(240, 16);
  const upcomingCarousel = useHorizontalCarousel(240, 16);
  const newsCarousel = useHorizontalCarousel(240, 16);
  const mediaCarousel = useHorizontalCarousel(240, 16);

  const categories: { id: ExploreCategory; label: string; Icon: typeof Sparkles; iconColor: string; activeBg: string }[] = [
    { id: 'all', label: lang === 'en' ? 'All' : 'ทั้งหมด', Icon: Sparkles, iconColor: 'text-mellow-red', activeBg: 'bg-mellow-red border-mellow-red' },
    { id: 'upcoming', label: lang === 'en' ? 'Upcoming' : 'กำลังมาถึง', Icon: CalendarClock, iconColor: 'text-mellow-yellow', activeBg: 'bg-mellow-yellow border-mellow-yellow' },
    { id: 'classes', label: lang === 'en' ? 'Classes' : 'คลาส', Icon: GraduationCap, iconColor: 'text-mellow-green', activeBg: 'bg-mellow-green border-mellow-green' },
    { id: 'events', label: lang === 'en' ? 'Events' : 'กิจกรรม', Icon: PartyPopper, iconColor: 'text-mellow-purple', activeBg: 'bg-mellow-purple border-mellow-purple' },
    { id: 'news', label: lang === 'en' ? 'News' : 'ข่าวสาร', Icon: Tent, iconColor: 'text-mellow-blue', activeBg: 'bg-mellow-blue border-mellow-blue' },
    { id: 'media', label: lang === 'en' ? 'Fun Facts' : 'เรื่องน่ารู้', Icon: Tv, iconColor: 'text-mellow-purple', activeBg: 'bg-mellow-purple border-mellow-purple' },
  ];

  const renderCourseCardSkeletons = () => (
    <>
      {[0, 1, 2].map(i => (
        <div key={i} className={`flex-shrink-0 ${SLIDE_CARD_WIDTH} bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-pulse`}>
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

  // Poster-style card, ticket-site proportions: the image is the card, the
  // text under it is just enough to identify the item — a two-line title and
  // the date. No excerpt: the article's own page is one tap away, and a body
  // preview is what used to stretch a single card past a full screen. Sized
  // so a phone shows about three cards per screen, like a ticket listing —
  // that's also why the whole card opens the article, not just ones with a
  // video/link.
  const renderNewsCard = (item: any) => {
    const imageUrl = resolveImageUrl(item.image_url);
    const title = lang === 'en' && item.title_en ? item.title_en : item.title;
    const content = lang === 'en' && item.content_en ? item.content_en : item.content;
    return (
      <div
        key={item.id}
        onClick={() => navigate(`/news/${item.id}`)}
        className={`flex-shrink-0 ${SLIDE_CARD_WIDTH} snap-start bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform`}
      >
        <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4 opacity-30">
              <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
            </div>
          )}
          {item.video_url && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 bg-white/85 rounded-full flex items-center justify-center shadow-sm">
                <Play size={14} className="text-mellow-blue fill-mellow-blue ml-0.5" />
              </div>
            </div>
          )}
        </div>
        <div className="p-2.5">
          <h4 className="font-black text-[13px] text-slate-800 leading-snug line-clamp-2 min-h-[2.4em]">
            <HashtagText text={title} onTagClick={tag => { setActiveTag(tag); setNewsKind('all'); }} />
          </h4>
          {/* Five lines of the body, hard-clamped — enough to know what the
              story is, never enough to stretch one card past the screen.
              stripHtml first: tags are found in the text, and a "#" inside
              markup is not one. */}
          {content && (
            <p className="text-[12px] text-slate-500 line-clamp-5 leading-snug mt-1">
              <HashtagText text={stripHtml(content)} onTagClick={tag => { setActiveTag(tag); setNewsKind('all'); }} />
            </p>
          )}
          {item.created_at && (
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              {formatCustomDate(item.created_at, lang as 'th' | 'en', 'short')}
            </p>
          )}
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
            <h1 className="text-[17px] font-black tracking-tight leading-none mb-0.5 truncate">{t.explore.title}</h1>
            <span className="text-[15px] font-bold text-mellow-yellow uppercase tracking-[0.2em]">{t.explore.subtitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowShopSoon(true)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
             <ShoppingBag size={18} className="text-slate-400" />
          </button>
          {/* This button had no handler at all — it looked like a control
              and did nothing. It opens the full catalogue with its search box
              focused, rather than growing a second search UI here. */}
          <button onClick={() => navigate('/courses/all?focus=1')}
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
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
        {/* Categories — 3 per row on a phone, where six across would be
            unreadably narrow, and one single row from md up, where two rows
            of three left a wide band of empty space beside them and made the
            filters look like a block of content rather than a menu. */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 pb-6">
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
                  <b className={`text-[13px] font-black text-center leading-tight ${isActive ? 'text-white' : 'text-slate-700'}`}>{cat.label}</b>
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

        {/* Upcoming Section — the parent's own bookings coming up soon
            (same data/endpoint as Home's upcoming-activities sidebar), not
            a general browse-all-events feed. Shown first (above Classes)
            since it's meant as a quick-access highlight. Guests/logged-out
            visitors have none of these, so the section just stays hidden. */}
        {!loading && (activeCategory === 'all' || activeCategory === 'upcoming') && upcomingBookings.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-center mb-4 px-1 gap-2">
                <h3 className="font-black text-lg leading-tight shrink-0">{lang === 'en' ? 'Upcoming' : 'กำลังมาถึง'}</h3>
                <CarouselNudgeButtons onScrollLeft={() => upcomingCarousel.scrollBy('left')} onScrollRight={() => upcomingCarousel.scrollBy('right')} />
             </div>

             <div ref={upcomingCarousel.ref} style={upcomingCarousel.containerStyle} className="flex items-stretch gap-3 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {upcomingBookings.map(booking => (
                  <div
                    key={booking.id}
                    onClick={() => setSelectedBooking(booking)}
                    className={`shrink-0 ${SLIDE_CARD_WIDTH} snap-center bg-white rounded-2xl p-3 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-all active:scale-[0.98] flex flex-col`}
                  >
                    <div className="relative mb-3">
                      {booking.course_thumbnail ? (
                        <img src={booking.course_thumbnail} alt={booking.course_name} loading="lazy" className="w-full aspect-[4/3] rounded-xl object-cover" />
                      ) : (
                        <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 flex items-center justify-center">
                          <BookOpen size={28} className="text-slate-400" />
                        </div>
                      )}
                      {children.length > 1 && getBookingPeopleLabel(booking) && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full pl-0.5 pr-2 py-0.5 shadow-sm">
                          <ChildAvatar avatarType={booking.child_avatar} className="w-5 h-5" />
                          <span className="text-[11px] font-black text-slate-700">{getBookingPeopleLabel(booking)}</span>
                        </div>
                      )}
                    </div>
                    <h4 className="font-bold text-slate-800 text-[14px] line-clamp-2">{booking.course_name}</h4>
                    <p className="text-[12px] font-medium text-slate-500 mt-1.5">
                      {new Date(booking.scheduled_at).toLocaleDateString()}
                      {' · '}
                      {formatTime24(booking.scheduled_at, lang)}
                    </p>
                    {getBookingPlace(booking) && (
                      <p className="text-[11px] font-medium text-slate-500 truncate mt-auto pt-2">{getBookingPlace(booking)!.name}</p>
                    )}
                  </div>
                ))}
             </div>
          </section>
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
                  <button onClick={() => navigate('/booking')} className="flex items-center gap-1 text-mellow-purple text-[14px] font-bold active:scale-95 transition-transform shrink-0">
                    {lang === 'en' ? 'View All' : 'ดูคลาสทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>

             <div ref={classesCarousel.ref} style={classesCarousel.containerStyle} className="flex items-stretch gap-3 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {isBookingStatusLoading ? renderCourseCardSkeletons() : allClasses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    bookingStatus={courseBookingStatus[course.id]}
                    lang={lang}
                    childCoupons={selectedChild?.coupons}
                    couponTypes={couponTypes}
                    sizeClassName={SLIDE_CARD_WIDTH}
                    descriptionLines={5}
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
                  <button onClick={() => navigate('/event')} className="flex items-center gap-1 text-mellow-purple text-[14px] font-bold active:scale-95 transition-transform shrink-0">
                    {lang === 'en' ? 'View All' : 'ดูกิจกรรมทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>

             <div ref={eventsCarousel.ref} style={eventsCarousel.containerStyle} className="flex items-stretch gap-3 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {isBookingStatusLoading ? renderCourseCardSkeletons() : eventsOnly.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    bookingStatus={courseBookingStatus[course.id]}
                    lang={lang}
                    childCoupons={selectedChild?.coupons}
                    couponTypes={couponTypes}
                    sizeClassName={SLIDE_CARD_WIDTH}
                    descriptionLines={5}
                  />
                ))}
             </div>
          </section>
        )}

        {/* News Section */}
        {(activeCategory === 'all' || activeCategory === 'news' || activeCategory === 'media') && newsSorted.length > 0 && (
          <section className="mb-5">
            <NewsFilterBar
              kind={newsKind} onKind={setNewsKind}
              query={newsQuery} onQuery={setNewsQuery}
              tags={newsTags} activeTag={activeTag} onTag={setActiveTag}
              resultCount={filteredNews.length}
              lang={lang as 'th' | 'en'}
            />
          </section>
        )}

        {(activeCategory === 'all' || activeCategory === 'news') && newsOnly.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1 gap-2">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">{lang === 'en' ? 'News' : 'ข่าวสาร'}</h3>
                   <p className="text-[15px] text-slate-400 font-bold uppercase tracking-widest">{lang === 'en' ? 'Latest updates' : 'ข่าวสารล่าสุด'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <CarouselNudgeButtons onScrollLeft={() => newsCarousel.scrollBy('left')} onScrollRight={() => newsCarousel.scrollBy('right')} />
                  <button onClick={() => navigate('/news-feed/news')} className="flex items-center gap-1 text-mellow-purple text-[14px] font-bold active:scale-95 transition-transform">
                    {lang === 'en' ? 'View All' : 'ดูข่าวทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>
             <div ref={newsCarousel.ref} style={newsCarousel.containerStyle} className="flex items-stretch gap-3 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
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
                   <p className="text-[15px] text-slate-400 font-bold uppercase tracking-widest">{lang === 'en' ? 'For kids & families' : 'เรื่องน่ารู้สำหรับเด็ก และครอบครัว'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <CarouselNudgeButtons onScrollLeft={() => mediaCarousel.scrollBy('left')} onScrollRight={() => mediaCarousel.scrollBy('right')} />
                  <button onClick={() => navigate('/news-feed/media')} className="flex items-center gap-1 text-mellow-purple text-[14px] font-bold active:scale-95 transition-transform">
                    {lang === 'en' ? 'View All' : 'ดูทั้งหมด'}
                    <ArrowRight size={14} />
                  </button>
                </div>
             </div>
             <div ref={mediaCarousel.ref} style={mediaCarousel.containerStyle} className="flex items-stretch gap-3 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide scroll-smooth snap-x snap-mandatory">
                {mediaOnly.map(item => renderNewsCard(item))}
             </div>
          </section>
        )}

        {!loading && activeCategory !== 'all' && activeCategory !== 'classes' &&
          ((activeCategory === 'upcoming' && upcomingBookings.length === 0) ||
           (activeCategory === 'events' && eventsOnly.length === 0) ||
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

      {selectedBooking && (
        <BookingDetailModal
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          booking={selectedBooking}
        />
      )}
    </div>
  );
};

export default Explore;
