const fs = require('fs');
let content = fs.readFileSync('src/pages/Home.tsx', 'utf8');

// Add the useEffect hook right after `const isMembershipInactive = membershipStatus === 'inactive';`
const useEffectCode = `  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const coursesReq = apiClient.get('/admin/courses');
        const progressReq = (!isGuest && currentChild?.id) ? apiClient.get(\`/journey/progress/\${currentChild.id}\`) : Promise.resolve({ data: { success: false } });
        
        const [coursesRes, progressRes] = await Promise.all([coursesReq, progressReq]);
        
        if (coursesRes.data.success) {
          setRecommendedCourses(coursesRes.data.courses.filter((c: any) => c.is_recommended === 1 || c.is_recommended === true));
        }
        
        if (progressRes.data.success && progressRes.data.progressData?.records?.length > 0) {
          setLatestClass(progressRes.data.progressData.records[0]);
        }
      } catch (err) {
        console.error('Failed to fetch home data:', err);
      }
    };
    fetchData();
  }, [currentChild?.id, isGuest]);

`;

if (!content.includes('const coursesReq = apiClient.get')) {
  content = content.replace("const isMembershipInactive = membershipStatus === 'inactive';", "const isMembershipInactive = membershipStatus === 'inactive';\n\n" + useEffectCode);
}

// Replace everything from {/* Report Display Section */} to {/* Decorative element */}
const replaceStart = "{/* Report Display Section */}";
const replaceEnd = "{/* Decorative element */}";

const startIdx = content.indexOf(replaceStart);
const endIdx = content.indexOf(replaceEnd);

if (startIdx !== -1 && endIdx !== -1) {
  const newSection = `{/* Recommended Classes Section */}
        {recommendedCourses.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-700 mb-3 px-1 uppercase tracking-widest">
              {t.home.recommendedClasses}
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-5 px-5">
              {recommendedCourses.map((course) => (
                <div key={course.id} onClick={() => navigate(\`/course/\${course.id}\`)} className="flex-shrink-0 w-64 mellow-card bg-white p-3 rounded-2xl shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer">
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
              ))}
            </div>
          </div>
        )}

        {/* Latest Class Section */}
          <h3 className="text-sm font-black text-slate-700 mb-4 px-2">{t.home.latestClass}</h3>
        <div className="mb-6 relative">
           {isGuest && renderLockedOverlay(
            t.home.joinToSeeSkills,
             t.home.registerBtn,
             () => navigate('/register')
           )}
          <div className={\`mellow-card bg-white/85 border border-white p-6 shadow-sm relative overflow-hidden transition-all \${isGuest ? 'blur-[2px]' : ''}\`}>
             {latestClass ? (
               <div className="flex items-center gap-4">
                 <div className="w-14 h-14 rounded-2xl bg-mellow-blue/10 flex items-center justify-center text-mellow-blue flex-shrink-0">
                   <Medal size={28} />
                 </div>
                 <div>
                   <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1">{latestClass.node_name || 'คลาสเรียน'}</h4>
                   <p className="text-xs text-slate-500 font-bold mb-2">
                     {new Date(latestClass.achieved_at).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                       year: 'numeric', month: 'long', day: 'numeric'
                     })}
                   </p>
                   <button onClick={() => navigate('/roadmap')} className="text-xs font-black text-mellow-blue uppercase tracking-widest flex items-center gap-1 active:scale-95 transition-transform">
                     ดูความสำเร็จทั้งหมด <ChevronRight size={14} />
                   </button>
                 </div>
               </div>
             ) : (
               <div className="text-center py-4">
                 <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                   <Medal size={24} />
                 </div>
                 <h4 className="font-black text-sm text-slate-700 mb-1">ยังไม่มีประวัติการเรียน</h4>
                 <p className="text-xs text-slate-400 font-bold">เข้าเรียนคลาสแรกเพื่อเริ่มต้นสะสมความสำเร็จ</p>
                 <button onClick={() => navigate('/explore')} className="mt-4 text-xs font-black text-mellow-purple bg-mellow-purple/10 px-4 py-2 rounded-xl uppercase tracking-widest active:scale-95 transition-transform">
                   ค้นหาคลาสเรียน
                 </button>
               </div>
             )}
          </div>
        </div>

        `;
  
  content = content.substring(0, startIdx) + newSection + content.substring(endIdx);
}

fs.writeFileSync('src/pages/Home.tsx', content);
