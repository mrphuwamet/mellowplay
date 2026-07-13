import React from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/ui/logo.svg';

interface CourseCardProps {
  course: any;
}

const CourseCard: React.FC<CourseCardProps> = ({ course }) => {
  const navigate = useNavigate();

  return (
    <div 
      onClick={() => navigate(`/course/${course.id}`)} 
      className="flex-shrink-0 w-64 mellow-card bg-white p-3 rounded-2xl shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer"
    >
      {course.thumbnail_url ? (
        <div className="w-full h-32 rounded-xl bg-slate-100 mb-3">
          <img src={course.thumbnail_url} alt={course.name} className="w-full h-full object-cover rounded-xl" />
        </div>
      ) : (
        <div className="w-full h-32 rounded-xl bg-mellow-purple-soft flex items-center justify-center p-4 mb-3 opacity-40">
          <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
        </div>
      )}
      <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1 line-clamp-1">{course.name}</h4>
      <div className="flex gap-2">
        <span className="px-2 py-0.5 bg-mellow-purple/20 text-mellow-purple rounded text-[10px] font-black uppercase">
          {course.category_name}
        </span>
        {course.age_min && course.age_max && (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-black uppercase">
            {course.age_min}-{course.age_max} YRS
          </span>
        )}
      </div>
    </div>
  );
};

export default CourseCard;
