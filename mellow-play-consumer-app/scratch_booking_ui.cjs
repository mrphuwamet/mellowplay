const fs = require('fs');
const targetFile = 'c:/Users/mrphu/mellow-play/repos/mellow-play-consumer-app/src/pages/Booking.tsx';

const newContent = `import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, MapPin, Sparkles, CheckCircle, Ticket, BookOpen, AlertCircle, CreditCard, Tag, User, X } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import ChildAvatar from '../components/ChildAvatar';
import AddChildModal from '../components/AddChildModal';

interface Branch { id: number; name: string; location: string; address?: string; }
interface Course { id: number; name: string; description: string; is_little_junior_enabled: number; is_junior_enabled: number; thumbnail_url?: string; is_extraclass?: number; original_price?: number; calendar_id?: number; }
interface TimeSlot { ruleId: number; startTime: string; endTime: string; maxCapacity: number; booked: number; available: number; }
interface UpcomingDate { date: string; slots: TimeSlot[]; isFull: boolean; }

const calculateAge = (birthDateString: string, t: any) => {
  if (!birthDateString) return '';
  const birthDate = new Date(birthDateString);
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
    years--;
    months += 12;
  }
  if (today.getDate() < birthDate.getDate()) {
    months--;
    if (months < 0) months = 11;
  }
  return \`\${years} \${t.booking?.year || 'ขวบ'} \${months > 0 ? \`\${months} \${t.booking?.month || 'เดือน'}\` : ''}\`;
};

const Booking = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedCourseId = searchParams.get('courseId');
  const { t, lang } = useTranslation();
  
  const children = useChildStore(state => state.children);
  const selectedChildId = useChildStore(state => state.selectedChildId);
  const fetchChildren = useChildStore(state => state.fetchChildren);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [upcomingDates, setUpcomingDates] = useState<UpcomingDate[]>([]);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  
  // Selected values
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedDateObj, setSelectedDateObj] = useState<UpcomingDate | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'stamp'|'cash'>('stamp');
  const [promoCode, setPromoCode] = useState('');
  const [notes, setNotes] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successBooking, setSuccessBooking] = useState<any>(null);

  useEffect(() => {
    if (children.length > 0 && !selectedChild) {
      const activeChild = children.find(c => c.id === selectedChildId) || children[0];
      setSelectedChild(activeChild);
    }
  }, [children, selectedChildId]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [branchesRes, coursesRes] = await Promise.all([
          apiClient.get('/admin/branches'),
          apiClient.get('/admin/courses')
        ]);
        if (branchesRes.data.success) {
          setBranches(branchesRes.data.branches);
        }
        if (coursesRes.data.success) {
          const fetchedCourses = coursesRes.data.courses;
          setCourses(fetchedCourses);
          if (preSelectedCourseId) {
            const found = fetchedCourses.find((c: Course) => c.id === parseInt(preSelectedCourseId));
            if (found) setSelectedCourse(found);
          }
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Step Logic
  const hasBranch = !(selectedCourse?.is_extraclass || branches.length <= 1);
  const flowSteps = ['course', 'child'];
  if (hasBranch) flowSteps.push('branch');
  flowSteps.push('date', 'payment');
  
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = flowSteps[currentStepIndex];

  // Auto skip branch
  useEffect(() => {
    if (selectedCourse && branches.length > 0) {
      if (!hasBranch && !selectedBranch) {
        setSelectedBranch(branches[0]);
      }
    }
  }, [selectedCourse, branches, hasBranch]);

  useEffect(() => {
    const fetchUpcoming = async () => {
      if (!selectedCourse || currentStepIndex < flowSteps.indexOf('date')) return;
      if (!selectedBranch && !selectedCourse.is_extraclass) return;
      
      setUpcomingDates([]);
      setSelectedDateObj(null);
      setSelectedSlot(null);
      try {
        const response = await apiClient.get('/admin/calendar-slots/upcoming', {
          params: {
            calendarId: selectedCourse.calendar_id || 1,
            branchId: selectedBranch?.id
          }
        });
        if (response.data.success) {
          const formatted = response.data.upcoming.map((ud: any) => {
            const isFull = ud.slots.every((s: any) => s.available === 0);
            return { ...ud, isFull };
          });
          setUpcomingDates(formatted);
        }
      } catch (err) {
        console.error('Failed to fetch upcoming dates:', err);
      }
    };
    fetchUpcoming();
  }, [selectedBranch, selectedCourse, currentStepIndex]);

  const currentYear = new Date().getFullYear();
  const birthYear = selectedChild?.birth_date ? new Date(selectedChild.birth_date).getFullYear() : 2020;
  const childAge = currentYear - birthYear;
  const ageGroup = childAge < 4 ? 'little_junior' : 'junior';
  const stampBalance = ageGroup === 'little_junior' ? (selectedChild?.littleJuniorBalance ?? 0) : (selectedChild?.juniorBalance ?? 0);

  const handleBookingSubmit = async () => {
    if (!selectedChild || !selectedCourse || !selectedDateObj || !selectedSlot) {
      setErrorMsg(t.booking?.fillAllInfo || 'กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    if (paymentMethod === 'stamp' && stampBalance <= 0) {
      setErrorMsg(t.booking?.insufficientStamps || 'ยอดคูปองสแตมป์ไม่เพียงพอ');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const scheduledAt = \`\${selectedDateObj.date} \${selectedSlot.startTime}\`;
      const response = await apiClient.post('/admin/bookings', {
        childId: selectedChild.id,
        courseId: selectedCourse.id,
        branchId: selectedBranch?.id || null,
        scheduledAt,
        ageGroup,
        calendarId: selectedCourse.calendar_id || 1,
        slotDate: selectedDateObj.date,
        slotStartTime: selectedSlot.startTime,
        paymentStatus: paymentMethod === 'stamp' ? 'prepaid' : 'pending_payment',
        paymentMethod: paymentMethod,
        promoCode: promoCode || null,
        status: paymentMethod === 'stamp' ? 'confirmed' : 'pending_payment',
        notes
      });

      if (response.data.success) {
        if (response.data.paymentUrl) {
           window.location.href = response.data.paymentUrl;
           return;
        }

        setSuccessBooking({
          id: response.data.id,
          childName: selectedChild.name,
          courseName: selectedCourse.name,
          branchName: selectedBranch?.name || 'นอกสถานที่',
          date: selectedDateObj.date,
          time: selectedSlot.startTime
        });
        
        const userJson = localStorage.getItem('mellow_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          fetchChildren(user.id);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || t.booking?.bookingError || 'เกิดข้อผิดพลาดในการส่งข้อมูลการจอง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] pb-32 relative">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button 
          onClick={() => {
            if (successBooking) {
              navigate('/');
            } else if (currentStepIndex > 0) {
              setCurrentStepIndex(currentStepIndex - 1);
            } else {
              navigate(-1);
            }
          }} 
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform"
        >
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[16px] font-black tracking-tight text-mellow-ink">{t.booking?.title || 'จองคลาสเรียน'}</h1>
        <div className="w-10" />
      </header>

      {successBooking ? (
        <main className="p-5 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-20 h-20 rounded-full bg-mellow-green/10 flex items-center justify-center text-mellow-green mb-6 animate-bounce">
            <CheckCircle size={56} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 text-center mb-2">{t.booking?.bookingSuccess || 'ยืนยันการจองสำเร็จ!'}</h2>
          <p className="text-slate-500 font-bold text-[14px] text-center mb-6">{t.booking?.bookingSuccessDesc || 'คูปองของคุณถูกหักออก 1 สแตมป์เรียบร้อยแล้ว'}</p>
          <div className="w-full mellow-card bg-white p-5 border border-slate-100 shadow-xl rounded-[28px] space-y-4 mb-8">
            <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3">
              <span className="text-slate-400 text-xs font-black uppercase tracking-wider">{t.booking?.bookingId || 'รหัสการจอง'}</span>
              <span className="text-mellow-purple font-black text-sm">#BK-{successBooking.id}</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs font-bold block mb-0.5">{t.booking?.childInClass || 'เด็กผู้เข้าเรียน'}</span>
              <span className="text-slate-700 font-black text-sm">{successBooking.childName}</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs font-bold block mb-0.5">{t.booking?.course || 'Class'}</span>
              <span className="text-slate-700 font-black text-sm">{successBooking.courseName}</span>
            </div>
            {selectedBranch && (
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">{t.booking?.branch || 'สาขา'}</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.branchName}</span>
              </div>
            )}
            <div className="flex items-center gap-6">
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">{t.booking?.date || 'วันที่'}</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.date}</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">{t.booking?.time || 'เวลา'}</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.time} น.</span>
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/')} className="w-full py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg shadow-mellow-purple/20 active:scale-95 transition-transform">
            {t.booking?.backToHome || 'กลับสู่หน้าหลัก'}
          </button>
        </main>
      ) : (
        <main className="p-5">
          <div className="flex items-center justify-between mb-6 px-2">
            {flowSteps.map((stepStr, idx) => (
              <React.Fragment key={idx}>
                <div className={\`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-black text-sm transition-all \${currentStepIndex === idx ? 'bg-mellow-purple text-white ring-4 ring-mellow-purple/10' : currentStepIndex > idx ? 'bg-mellow-purple/20 text-mellow-purple' : 'bg-white text-slate-300 border border-slate-100'}\`}>
                  {idx + 1}
                </div>
                {idx < flowSteps.length - 1 && <div className={\`flex-1 h-0.5 mx-1 rounded \${currentStepIndex > idx ? 'bg-mellow-purple/30' : 'bg-slate-100'}\`} />}
              </React.Fragment>
            ))}
          </div>

          {/* Summary Box */}
          {currentStepIndex > 0 && (
             <div className="mb-6 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-3">
               {selectedCourse && (
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-mellow-purple/10 flex items-center justify-center text-mellow-purple shrink-0">
                     <BookOpen size={14} />
                   </div>
                   <div className="flex-1">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.booking?.course || 'คลาสเรียน'}</p>
                     <p className="text-xs font-black text-slate-800 line-clamp-1">{selectedCourse.name}</p>
                   </div>
                 </div>
               )}
               {selectedChild && currentStepIndex > 1 && (
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                     <User size={14} />
                   </div>
                   <div className="flex-1">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.booking?.childInClass || 'ผู้เรียน'}</p>
                     <p className="text-xs font-black text-slate-800 line-clamp-1">{selectedChild.nickname || selectedChild.name}</p>
                   </div>
                 </div>
               )}
               {selectedBranch && hasBranch && currentStepIndex > 2 && (
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 shrink-0">
                     <MapPin size={14} />
                   </div>
                   <div className="flex-1">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.booking?.branch || 'สาขา'}</p>
                     <p className="text-xs font-black text-slate-800 line-clamp-1">{selectedBranch.name}</p>
                   </div>
                 </div>
               )}
             </div>
          )}

          {currentStep === 'course' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">{t.booking?.stepCourse || 'เลือกคลาส'}</h3>
              {isLoading ? (
                <div className="h-32 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-mellow-purple border-t-transparent rounded-full" /></div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {courses.map(course => (
                    <div key={course.id} className={\`p-4 rounded-2xl border text-left flex flex-col gap-3 transition-all \${selectedCourse?.id === course.id ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100'}\`}>
                      <div className="flex gap-4 cursor-pointer" onClick={() => { setSelectedCourse(course); setCurrentStepIndex(currentStepIndex + 1); }}>
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                           {course.thumbnail_url ? <img src={course.thumbnail_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><BookOpen size={24}/></div>}
                        </div>
                        <div className="flex-1">
                          <b className="text-sm font-black text-slate-700 block mb-1">{course.name}</b>
                          <p className="text-xs text-slate-500 font-medium line-clamp-2">{course.description}</p>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedCourse(course); setIsCourseModalOpen(true); }}
                        className="text-[11px] font-bold text-mellow-purple underline self-start"
                      >
                        {t.booking?.viewAllDetails || 'ดูรายละเอียดทั้งหมด'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 'child' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-black text-slate-800">{t.booking?.stepChild || 'เลือกผู้เรียน'}</h3>
                <button onClick={() => setIsAddChildOpen(true)} className="text-mellow-purple text-sm font-bold flex items-center gap-1 active:scale-95 transition-transform">
                  <div className="w-5 h-5 rounded-full bg-mellow-purple/10 flex items-center justify-center"><Sparkles size={12} /></div>{t.booking?.addChild || 'เพิ่มผู้เรียน'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {children.map(child => {
                  const cAgeGrp = (currentYear - (child.birth_date ? new Date(child.birth_date).getFullYear() : 2020)) < 4 ? 'little_junior' : 'junior';
                  const cStamps = cAgeGrp === 'little_junior' ? child.littleJuniorBalance : child.juniorBalance;
                  return (
                    <button key={child.id} onClick={() => setSelectedChild(child)} className={\`p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all \${selectedChild?.id === child.id ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 opacity-70'}\`}>
                      <ChildAvatar avatarType={child.avatar} className="w-12 h-12" />
                      <div>
                        <b className="text-[15px] font-black text-slate-800 block leading-tight">{child.nickname || child.name.split(' ')[0]}</b>
                        <p className="text-[11px] text-slate-500 font-medium truncate">{child.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">{calculateAge(child.birth_date, t)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-50 text-mellow-yellow rounded-lg text-xs font-black self-start mt-1">
                        <Ticket size={12} /> {cStamps} {t.booking?.stamps || 'Stamps'}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button disabled={!selectedChild} onClick={() => setCurrentStepIndex(currentStepIndex + 1)} className="w-full mt-6 py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 transition-all">
                {t.booking?.nextStep || 'ขั้นตอนถัดไป'}
              </button>
            </div>
          )}

          {currentStep === 'branch' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">{t.booking?.stepBranch || 'เลือกสาขา'}</h3>
              <div className="space-y-2">
                {branches.map(branch => (
                  <button key={branch.id} onClick={() => setSelectedBranch(branch)} className={\`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all \${selectedBranch?.id === branch.id ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100'}\`}>
                    <div className={\`p-2 rounded-xl mt-0.5 \${selectedBranch?.id === branch.id ? 'bg-mellow-purple/10 text-mellow-purple' : 'bg-slate-100 text-slate-400'}\`}><MapPin size={18} /></div>
                    <div>
                      <b className="text-sm font-black text-slate-700 block">{branch.name}</b>
                      <p className="text-[12px] text-slate-400 font-bold leading-snug mt-0.5">{branch.location}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button disabled={!selectedBranch} onClick={() => setCurrentStepIndex(currentStepIndex + 1)} className="w-full mt-6 py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 transition-all">
                {t.booking?.nextStep || 'ขั้นตอนถัดไป'}
              </button>
            </div>
          )}

          {currentStep === 'date' && (
            <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h3 className="text-lg font-black text-slate-800 mb-3">{t.booking?.stepDate || 'เลือกวันที่'}</h3>
                <div className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar">
                  {upcomingDates.length === 0 ? (
                    <div className="w-full text-center py-8 text-slate-400 font-medium">{t.booking?.noClasses || 'ไม่พบรอบเรียนในขณะนี้'}</div>
                  ) : (
                    upcomingDates.map(ud => {
                      const d = new Date(ud.date);
                      const dayName = d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { weekday: 'short' });
                      const dayNum = d.getDate();
                      return (
                        <button 
                          key={ud.date} 
                          disabled={ud.isFull}
                          onClick={() => { setSelectedDateObj(ud); setSelectedSlot(null); }} 
                          className={\`shrink-0 w-[72px] h-[84px] rounded-[20px] border flex flex-col items-center justify-center transition-all relative overflow-hidden \${ud.isFull ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed' : selectedDateObj?.date === ud.date ? 'bg-mellow-purple border-mellow-purple text-white shadow-lg shadow-mellow-purple/20' : 'bg-white border-slate-100 text-slate-400'}\`}
                        >
                          {ud.isFull && (
                             <div className="absolute inset-0 bg-black/5 flex items-center justify-center z-10">
                               <div className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-sm transform -rotate-12 border border-white shadow-sm uppercase tracking-widest">{t.booking?.full || 'เต็ม'}</div>
                             </div>
                          )}
                          <span className="text-[11px] font-bold uppercase tracking-wider mb-1 relative z-0">{dayName}</span>
                          <b className={\`text-2xl font-black relative z-0 \${selectedDateObj?.date === ud.date ? 'text-white' : 'text-slate-700'}\`}>{dayNum}</b>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {selectedDateObj && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h3 className="text-lg font-black text-slate-800 mb-3">{t.booking?.stepTime || 'เลือกรอบเวลา'}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedDateObj.slots.map(slot => (
                      <button key={slot.startTime} disabled={slot.available === 0} onClick={() => { setSelectedSlot(slot); setCurrentStepIndex(currentStepIndex + 1); }} className={\`p-4 rounded-2xl border text-left transition-all relative overflow-hidden \${slot.available === 0 ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed' : selectedSlot?.startTime === slot.startTime ? 'bg-mellow-purple/5 border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 hover:border-mellow-purple/30'}\`}>
                        <div className="flex flex-col gap-1.5 relative z-10">
                          <span className="text-lg font-black text-slate-700 block">{slot.startTime}</span>
                          <span className={\`text-[10px] font-bold px-2 py-0.5 rounded-full self-start \${slot.available === 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}\`}>
                            {slot.available === 0 ? (t.booking?.full || 'เต็มแล้ว') : \`\${t.booking?.availableSeats || 'ว่าง'} \${slot.available} \${t.booking?.seats || 'ที่'}\`}
                          </span>
                        </div>
                        <Clock size={40} className="absolute -right-2 -bottom-2 text-slate-100 opacity-50 z-0" strokeWidth={1} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 'payment' && (
            <div className="space-y-6 pb-32 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">{t.booking?.stepPayment || 'เลือกวิธีชำระเงิน'}</h3>
              
              <div className="space-y-3">
                <button 
                  onClick={() => setPaymentMethod('stamp')}
                  className={\`w-full p-5 rounded-2xl border-2 text-left flex items-center gap-4 transition-all \${paymentMethod === 'stamp' ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : 'bg-white border-slate-100'}\`}
                >
                  <div className={\`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 \${paymentMethod === 'stamp' ? 'bg-mellow-purple text-white shadow-lg shadow-mellow-purple/30' : 'bg-slate-100 text-slate-400'}\`}>
                    <Ticket size={24} />
                  </div>
                  <div className="flex-1">
                    <b className="text-sm font-black text-slate-800 block mb-0.5">{t.booking?.stampPayment || 'ใช้แสตมป์คลาสเรียน'}</b>
                    <p className="text-[12px] text-slate-500 font-bold">{t.booking?.stampDeduct || 'หัก 1 แสตมป์จากแพ็กเกจ'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={\`text-xs font-black px-2 py-1 rounded-lg \${stampBalance > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}\`}>
                      {t.booking?.haveStamps || 'มี'} {stampBalance}
                    </span>
                  </div>
                </button>

                <button 
                  onClick={() => setPaymentMethod('cash')}
                  className={\`w-full p-5 rounded-2xl border-2 text-left flex items-center gap-4 transition-all \${paymentMethod === 'cash' ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : 'bg-white border-slate-100'}\`}
                >
                  <div className={\`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 \${paymentMethod === 'cash' ? 'bg-mellow-purple text-white shadow-lg shadow-mellow-purple/30' : 'bg-slate-100 text-slate-400'}\`}>
                    <CreditCard size={24} />
                  </div>
                  <div className="flex-1">
                    <b className="text-sm font-black text-slate-800 block mb-0.5">{t.booking?.cashPayment || 'ชำระเงิน (Beam)'}</b>
                    <p className="text-[12px] text-slate-500 font-bold">{t.booking?.cashDesc || 'บัตรเครดิต, พร้อมเพย์'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-mellow-purple">{selectedCourse?.original_price?.toLocaleString() || 0}฿</span>
                  </div>
                </button>
              </div>

              {paymentMethod === 'cash' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5"><Tag size={14}/> {t.booking?.promoCode || 'โค้ดส่วนลด (Promo Code)'}</label>
                  <div className="flex gap-2">
                    <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder={t.booking?.promoPlaceholder || 'กรอกโค้ดส่วนลด'} className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold uppercase" />
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      )}

      {/* Course Details Modal */}
      {isCourseModalOpen && selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCourseModalOpen(false)} />
          <div className="bg-white rounded-[32px] w-full max-w-md max-h-[80vh] overflow-y-auto relative z-10 animate-in slide-in-from-bottom-8 duration-300">
            {selectedCourse.thumbnail_url && (
               <img src={selectedCourse.thumbnail_url} className="w-full h-48 object-cover rounded-t-[32px]" />
            )}
            <button onClick={() => setIsCourseModalOpen(false)} className="absolute top-4 right-4 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md">
              <X size={18} />
            </button>
            <div className="p-6 space-y-4">
              <div>
                 <h2 className="text-xl font-black text-slate-800 leading-tight mb-2">{selectedCourse.name}</h2>
                 <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{selectedCourse.description}</p>
              </div>
              <button onClick={() => setIsCourseModalOpen(false)} className="w-full py-4 bg-slate-100 text-slate-700 font-black rounded-2xl active:scale-95 transition-transform">
                 {t.booking?.closeWindow || 'ปิดหน้าต่าง'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Action */}
      {!successBooking && currentStep === 'payment' && (
        <div className="fixed bottom-[84px] left-1/2 -translate-x-1/2 w-full max-w-sm px-5 animate-in slide-in-from-bottom-4 duration-300 z-40">
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-100 text-red-500 p-3 rounded-xl flex items-start gap-2 text-sm font-bold shadow-lg">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <button disabled={isSubmitting || (paymentMethod === 'stamp' && stampBalance <= 0)} onClick={handleBookingSubmit} className="w-full h-[60px] bg-mellow-purple text-white rounded-2xl text-[15px] font-black uppercase tracking-widest shadow-xl shadow-mellow-purple/30 flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98] transition-all">
             {paymentMethod === 'stamp' ? (t.booking?.confirmStamp || 'ยืนยันการจอง 1 สแตมป์') : (t.booking?.confirmCash || 'ไปหน้าชำระเงิน')}
          </button>
        </div>
      )}

      <AddChildModal isOpen={isAddChildOpen} onClose={() => setIsAddChildOpen(false)} />
    </div>
  );
};
export default Booking;
`;
fs.writeFileSync(targetFile, newContent);
