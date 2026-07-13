import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Calendar, BookOpen, Search, Filter, ArrowRight, Sparkles, Tv, Tent, GraduationCap } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { formatCalendarSummary } from '../utils/calendarUtils';

const Explore = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const { t } = useTranslation();

  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/admin/courses')
      .then(res => {
         if (res.data.success) {
            setCourses(res.data.courses);
         }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const extraClasses = courses.filter(c => c.is_extraclass);
  const regularClasses = courses.filter(c => !c.is_extraclass);

  const categories = [
    { id: 'extra', label: 'คลาสพิเศษ', icon: <Sparkles size={18} className="text-mellow-yellow" /> },
    { id: 'regular', label: 'คลาสปกติ', icon: <GraduationCap size={18} className="text-mellow-green" /> },
    { id: 'news', label: 'ข่าวสาร', icon: <Tent size={18} className="text-mellow-blue" /> },
    { id: 'media', label: 'สื่อความรู้', icon: <Tv size={18} className="text-mellow-purple" /> },
  ];



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
        {/* Categories Scroller */}
        <div className="flex gap-3 flex-wrap justify-start pb-6">
           {categories.map(cat => (
             <button key={cat.id} className="flex-shrink-0 px-5 py-3 rounded-2xl bg-white border border-mellow-line flex items-center gap-2 shadow-sm active:scale-95 transition-all">
                {cat.icon}
                <b className="text-[14px] font-black">{cat.label}</b>
             </button>
           ))}
        </div>

        {/* Extra Classes Section */}
        {extraClasses.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">Extra Classes</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">คลาสกิจกรรมพิเศษ</p>
                </div>
             </div>
             
             <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                {extraClasses.slice(0, 5).map(course => (
                  <div key={course.id} onClick={() => navigate(`/course/${course.id}`)} className="flex-shrink-0 w-[240px] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform">
                     <div className="h-40 bg-slate-100 relative">
                        {course.thumbnail_url ? (
                          <img src={course.thumbnail_url} alt={course.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-6 opacity-30">
                             <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
                          </div>
                        )}
                        <div className="absolute top-2 left-2 px-2 py-1 bg-white/90 backdrop-blur rounded-lg text-[10px] font-black uppercase text-mellow-yellow-dark shadow-sm">
                          {course.category_name}
                        </div>
                     </div>
                     <div className="p-4">
                        <h4 className="font-black text-[16px] text-slate-800 leading-tight mb-2 truncate">{course.name}</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                           {course.age_min && course.age_max && (
                             <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                               {course.age_min}-{course.age_max} ปี
                             </span>
                           )}
                           <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                             ฿{course.original_price?.toLocaleString() || 0}
                           </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 border-t border-slate-100 pt-3">
                           <Calendar size={14} className="text-slate-400" /> 
                           <span>{course.calendar_id ? formatCalendarSummary(course.calendar_summary_json) : 'รอประกาศวัน'}</span>
                        </div>
                     </div>
                  </div>
                ))}
                
                <div onClick={() => navigate('/courses/extra')} className="flex-shrink-0 w-[120px] bg-slate-50 rounded-3xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform border border-slate-200">
                   <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2">
                     <ArrowRight size={20} className="text-slate-600" />
                   </div>
                   <span className="text-[13px] font-black text-slate-600">ดูเพิ่มเติม</span>
                </div>
             </div>
          </section>
        )}

        {/* Regular Classes Section */}
        {regularClasses.length > 0 && (
          <section className="mb-8">
             <div className="flex justify-between items-end mb-4 px-1">
                <div>
                   <h3 className="font-black text-lg leading-tight uppercase tracking-tight">Regular Classes</h3>
                   <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">คลาสเรียนทั่วไป</p>
                </div>
             </div>
             
             <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                {regularClasses.slice(0, 5).map(course => (
                  <div key={course.id} onClick={() => navigate(`/course/${course.id}`)} className="flex-shrink-0 w-[240px] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform">
                     <div className="h-40 bg-slate-100 relative">
                        {course.thumbnail_url ? (
                          <img src={course.thumbnail_url} alt={course.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-6 opacity-30">
                             <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
                          </div>
                        )}
                        <div className="absolute top-2 left-2 px-2 py-1 bg-white/90 backdrop-blur rounded-lg text-[10px] font-black uppercase text-mellow-green-dark shadow-sm">
                          {course.category_name}
                        </div>
                     </div>
                     <div className="p-4">
                        <h4 className="font-black text-[16px] text-slate-800 leading-tight mb-2 truncate">{course.name}</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                           {course.age_min && course.age_max && (
                             <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                               {course.age_min}-{course.age_max} ปี
                             </span>
                           )}
                           <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                             ฿{course.original_price?.toLocaleString() || 0}
                           </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 border-t border-slate-100 pt-3">
                           <Calendar size={14} className="text-slate-400" /> 
                           <span>{course.calendar_id ? formatCalendarSummary(course.calendar_summary_json) : 'รอประกาศวัน'}</span>
                        </div>
                     </div>
                  </div>
                ))}
                
                <div onClick={() => navigate('/courses/regular')} className="flex-shrink-0 w-[120px] bg-slate-50 rounded-3xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform border border-slate-200">
                   <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2">
                     <ArrowRight size={20} className="text-slate-600" />
                   </div>
                   <span className="text-[13px] font-black text-slate-600">ดูเพิ่มเติม</span>
                </div>
             </div>
          </section>
        )}

      </main>
    </div>
  );
};

export default Explore;
