import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Calendar, MapPin, CheckCircle, BookOpen, Search, Filter, ArrowRight, Sparkles, Tv, Tent, GraduationCap, X } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { formatCalendarSummary } from '../utils/calendarUtils';
import { getCourseView, resolveImageUrl } from '../utils/courseImage';
import { trackCourseView } from '../utils/analytics';
import { useCourseBookingStatus } from '../hooks/useCourseBookingStatus';
import TicketRequirementRow from '../components/TicketRequirementRow';

const Explore = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const { t, lang } = useTranslation();
  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;
  const { statusMap: courseBookingStatus, isLoading: isBookingStatusLoading } = useCourseBookingStatus(user?.id, selectedChild?.id);

  const [courses, setCourses] = useState<any[]>([]);
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'classes' | 'news' | 'media'>('all');
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);

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

  const extraClasses = courses.filter(c => c.is_extraclass);
  const regularClasses = courses.filter(c => !c.is_extraclass);
  const newsOnly = newsItems.filter(n => n.type === 'news');
  const mediaOnly = newsItems.filter(n => n.type === 'media');

  const categories: { id: 'all' | 'classes' | 'news' | 'media'; label: string; Icon: typeof Sparkles; iconColor: string; activeBg: string }[] = [
    { id: 'all', label: lang === 'en' ? 'All' : 'ทั้งหมด', Icon: Sparkles, iconColor: 'text-mellow-red', activeBg: 'bg-mellow-red border-mellow-red' },
    { id: 'classes', label: lang === 'en' ? 'Classes' : 'คลาส', Icon: GraduationCap, iconColor: 'text-mellow-green', activeBg: 'bg-mellow-green border-mellow-green' },
    { id: 'news', label: lang === 'en' ? 'News' : 'ข่าวสาร', Icon: Tent, iconColor: 'text-mellow-blue', activeBg: 'bg-mellow-blue border-mellow-blue' },
    { id: 'media', label: lang === 'en' ? 'Media' : 'สื่อความรู้', Icon: Tv, iconColor: 'text-mellow-purple', activeBg: 'bg-mellow-purple border-mellow-purple' },
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

  const renderCourseCard = (course: any, tagColorClass: string) => {
    const view = getCourseView(course, 'card');
    const bookingStatus = courseBookingStatus[course.id];
    const isOneTimeBooked = !!bookingStatus && !course.allow_repeat;
    const statusLabel = bookingStatus === 'upcoming'
      ? (lang === 'en' ? 'Registered' : 'ลงทะเบียนแล้ว')
      : (lang === 'en' ? 'Already Taken' : 'เคยเรียนแล้ว');

    const discountAmount = course.active_campaign_discount_amount || 0;
    const discountedPrice = Math.max(0, (course.original_price || 0) - discountAmount);
    const discountPercent = discountAmount > 0 && course.original_price
      ? Math.round((discountAmount / course.original_price) * 100)
      : 0;

    return (
      <div key={course.id} onClick={() => navigate(`/course/${course.id}`)} className="flex-shrink-0 w-[240px] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform">
         <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
            {view.url ? (
              <img src={view.url} alt={course.name} style={view.style} className={`w-full h-full object-cover ${isOneTimeBooked ? 'grayscale-[40%]' : ''}`} />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-6 opacity-30">
                 <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
              </div>
            )}
            <div className={`absolute top-2 left-2 px-2 py-1 bg-white/90 backdrop-blur rounded-lg text-[10px] font-black uppercase ${tagColorClass} shadow-sm`}>
              {course.category_name}
            </div>
            {bookingStatus && (
              <div className={`absolute top-2 right-2 text-white text-[9px] font-black px-2 py-1 rounded-full shadow-sm flex items-center gap-1 ${isOneTimeBooked ? 'bg-slate-400' : 'bg-emerald-500'}`}>
                <CheckCircle size={9} />
                {statusLabel}
              </div>
            )}
         </div>
         <div className="p-4">
            <h4 className="font-black text-[16px] text-slate-800 leading-tight mb-1 truncate">{course.name}</h4>
            <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug mb-2">
              {course.short_description || course.description}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
               {course.age_min && course.age_max && (
                 <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                   {course.age_min}-{course.age_max} ปี
                 </span>
               )}
            </div>
            {course.original_price != null && (
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  {discountAmount > 0 && (
                    <span className="text-[11px] text-slate-400 font-bold line-through shrink-0">
                      ฿{course.original_price.toLocaleString()}
                    </span>
                  )}
                  <span className="text-[16px] font-black text-mellow-red tracking-tight leading-none shrink-0">
                    ฿{discountedPrice.toLocaleString()}
                  </span>
                </div>
                {discountPercent > 0 && (
                  <span className="px-1.5 py-0.5 bg-mellow-red/10 text-mellow-red text-[10px] font-black rounded shrink-0">
                    -{discountPercent}%
                  </span>
                )}
              </div>
            )}
            <TicketRequirementRow course={course} childCoupons={selectedChild?.coupons} lang={lang} />
            <div className="space-y-1 mb-3 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
                 <Calendar size={14} className="text-slate-400 shrink-0" />
                 <span className="truncate">{course.calendar_id ? formatCalendarSummary(course.calendar_summary_json) : 'รอประกาศวัน'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
                 <MapPin size={14} className="text-slate-400 shrink-0" />
                 <span className="truncate">{course.is_extraclass ? (course.location || 'รอยืนยันสถานที่') : 'Mellow Play (Little Walk Pattaya)'}</span>
              </div>
            </div>
            <button
              disabled={isOneTimeBooked}
              onClick={(e) => {
                e.stopPropagation();
                if (isOneTimeBooked) navigate(`/course/${course.id}`);
                else { trackCourseView(course.id); navigate(`/booking?courseId=${course.id}`); }
              }}
              className={`w-full py-2 text-[12px] font-bold rounded-xl transition-all ${
                isOneTimeBooked
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-mellow-purple text-white active:scale-95'
              }`}
            >
              {isOneTimeBooked ? statusLabel : (lang === 'en' ? 'Book Now' : 'จองเพิ่ม')}
            </button>
         </div>
      </div>
    );
  };

  const renderNewsCard = (item: any) => {
    const imageUrl = resolveImageUrl(item.image_url);
    const title = lang === 'en' && item.title_en ? item.title_en : item.title;
    const content = lang === 'en' && item.content_en ? item.content_en : item.content;
    const isClickable = !!(item.video_url || item.link_url);
    const handleClick = () => {
      if (item.video_url) setVideoModalUrl(item.video_url);
      else if (item.link_url) window.open(item.link_url, '_blank', 'noopener,noreferrer');
    };
    return (
      <div
        key={item.id}
        onClick={handleClick}
        className={`flex-shrink-0 w-[240px] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden ${isClickable ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
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
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-10 h-10 bg-white/85 rounded-full flex items-center justify-center">
                <Play size={18} className="text-mellow-blue fill-mellow-blue ml-0.5" />
              </div>
            </div>
          )}
        </div>
        <div className="p-4">
          <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1 line-clamp-2">{title}</h4>
          {content && <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug">{content}</p>}
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
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 w-max">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">{t.explore.title}</h1>
          <span className="text-[14px] font-bold text-mellow-yellow uppercase tracking-[0.2em]">{t.explore.subtitle}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
             <Search size={20} className="text-slate-400" />
          </button>
          <LanguageToggle />
        </div>
      </header>

      <main className="p-5">
        {/* Categories — fills full width evenly, no ragged trailing space */}
        <div className="grid grid-cols-4 gap-2 pb-6">
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

        {/* Extra Classes Section */}
        {(activeCategory === 'all' || activeCategory === 'classes') && extraClasses.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">Extra Classes</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">คลาสกิจกรรมพิเศษ</p>
                </div>
             </div>
             
             <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                {isBookingStatusLoading ? renderCourseCardSkeletons() : extraClasses.slice(0, 5).map(course => renderCourseCard(course, 'text-mellow-yellow-dark'))}

                {!isBookingStatusLoading && extraClasses.length > 5 && (
                  <div onClick={() => navigate('/courses/extra')} className="flex-shrink-0 w-[120px] bg-slate-50 rounded-3xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform border border-slate-200">
                     <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2">
                       <ArrowRight size={20} className="text-slate-600" />
                     </div>
                     <span className="text-[13px] font-black text-slate-600">ดูเพิ่มเติม</span>
                  </div>
                )}
             </div>
          </section>
        )}

        {/* Regular Classes Section */}
        {(activeCategory === 'all' || activeCategory === 'classes') && regularClasses.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">Regular Classes</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">คลาสเรียนทั่วไป</p>
                </div>
             </div>
             
             <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                {isBookingStatusLoading ? renderCourseCardSkeletons() : regularClasses.slice(0, 5).map(course => renderCourseCard(course, 'text-mellow-green-dark'))}

                {!isBookingStatusLoading && regularClasses.length > 5 && (
                  <div onClick={() => navigate('/courses/regular')} className="flex-shrink-0 w-[120px] bg-slate-50 rounded-3xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform border border-slate-200">
                     <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2">
                       <ArrowRight size={20} className="text-slate-600" />
                     </div>
                     <span className="text-[13px] font-black text-slate-600">ดูเพิ่มเติม</span>
                  </div>
                )}
             </div>
          </section>
        )}

        {/* News Section */}
        {(activeCategory === 'all' || activeCategory === 'news') && newsOnly.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">{lang === 'en' ? 'News' : 'ข่าวสาร'}</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">{lang === 'en' ? 'Latest updates' : 'ข่าวสารล่าสุด'}</p>
                </div>
             </div>
             <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                {newsOnly.map(item => renderNewsCard(item))}
             </div>
          </section>
        )}

        {/* Media Section */}
        {(activeCategory === 'all' || activeCategory === 'media') && mediaOnly.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">{lang === 'en' ? 'Media' : 'สื่อความรู้'}</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">{lang === 'en' ? 'Learning resources' : 'สื่อสำหรับผู้ปกครอง'}</p>
                </div>
             </div>
             <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                {mediaOnly.map(item => renderNewsCard(item))}
             </div>
          </section>
        )}

        {!loading && activeCategory !== 'all' && activeCategory !== 'classes' &&
          ((activeCategory === 'news' && newsOnly.length === 0) || (activeCategory === 'media' && mediaOnly.length === 0)) && (
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
    </div>
  );
};

export default Explore;
