import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar } from 'lucide-react';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { formatCalendarSummary } from '../utils/calendarUtils';
import { getCourseView } from '../utils/courseImage';

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
          <div className="flex flex-col gap-4 animate-pulse">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex w-full">
                <div className="w-28 h-28 bg-slate-200 shrink-0" />
                <div className="flex-1 min-w-0 p-4 space-y-2">
                  <div className="h-4 w-3/4 bg-slate-200 rounded-full" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded-full" />
                  <div className="h-3 w-2/3 bg-slate-100 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {courses.map(course => {
              const view = getCourseView(course, 'card');
              return (
              <div key={course.id} onClick={() => navigate(`/course/${course.id}`)} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform flex w-full">
                 <div className="w-32 sm:w-40 shrink-0 aspect-square bg-slate-100 relative overflow-hidden">
                    {view.url ? (
                      <img src={view.url} alt={course.name} style={view.style} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-6 opacity-30">
                         <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
                      </div>
                    )}
                    <div className={`absolute top-2 left-2 px-2 py-1 bg-white/90 backdrop-blur rounded-lg text-[10px] font-black uppercase shadow-sm ${course.is_extraclass ? 'text-mellow-yellow-dark' : 'text-mellow-green-dark'}`}>
                      {course.category_name}
                    </div>
                 </div>
                 <div className="flex-1 min-w-0 p-4 flex flex-col">
                    <h4 className="font-black text-[16px] text-slate-800 leading-tight">{course.name}</h4>
                    {course.name_en && <p className="text-[12px] text-slate-400 font-bold truncate">{course.name_en}</p>}

                    <div className="flex flex-wrap gap-2 mt-2">
                       {course.age_min && course.age_max && (
                         <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                           {course.age_min}-{course.age_max} ปี
                         </span>
                       )}
                       <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                         ฿{course.original_price?.toLocaleString() || 0}
                       </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 border-t border-slate-100 mt-auto pt-2">
                       <Calendar size={14} className="text-slate-400 shrink-0" />
                       <span className="truncate">{course.calendar_id ? formatCalendarSummary(course.calendar_summary_json) : 'รอประกาศวัน'}</span>
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
