import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar } from 'lucide-react';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { formatCalendarSummary } from '../utils/calendarUtils';

const CourseList = () => {
  const navigate = useNavigate();
  const { type } = useParams<{ type: string }>();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/admin/courses')
      .then(res => {
         if (res.data.success) {
            let all = res.data.courses || [];
            if (type === 'extra') all = all.filter((c: any) => c.is_extraclass);
            else if (type === 'regular') all = all.filter((c: any) => !c.is_extraclass);
            setCourses(all);
         }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [type]);

  const title = type === 'extra' ? 'คลาสกิจกรรมพิเศษ' : type === 'regular' ? 'คลาสเรียนทั่วไป' : 'คลาสทั้งหมด';

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen">
      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">{title}</h1>
        <div className="w-10 h-10" />
      </header>

      <main className="p-5">
        {loading ? (
          <div className="flex justify-center p-10"><div className="w-6 h-6 border-2 border-mellow-yellow border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courses.map(course => (
              <div key={course.id} onClick={() => navigate(`/course/${course.id}`)} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform flex flex-col">
                 <div className="h-48 bg-slate-100 relative">
                    {course.thumbnail_url ? (
                      <img src={course.thumbnail_url} alt={course.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-8 opacity-30">
                         <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
                      </div>
                    )}
                    <div className={`absolute top-3 left-3 px-3 py-1.5 bg-white/90 backdrop-blur rounded-xl text-[12px] font-black uppercase shadow-sm ${course.is_extraclass ? 'text-mellow-yellow-dark' : 'text-mellow-green-dark'}`}>
                      {course.category_name}
                    </div>
                 </div>
                 <div className="p-5 flex flex-col flex-1">
                    <h4 className="font-black text-[18px] text-slate-800 leading-tight mb-2">{course.name}</h4>
                    {course.name_en && <p className="text-[13px] text-slate-400 font-bold mb-3">{course.name_en}</p>}
                    
                    <div className="flex flex-wrap gap-2 mb-4 mt-auto">
                       {course.age_min && course.age_max && (
                         <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[12px] font-bold">
                           {course.age_min}-{course.age_max} ปี
                         </span>
                       )}
                       <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[12px] font-bold">
                         ฿{course.original_price?.toLocaleString() || 0}
                       </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-[13px] font-bold text-slate-500 border-t border-slate-100 pt-4">
                       <Calendar size={16} className="text-slate-400" /> 
                       <span>{course.calendar_id ? formatCalendarSummary(course.calendar_summary_json) : 'รอประกาศวัน'}</span>
                    </div>
                 </div>
              </div>
            ))}
            
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
