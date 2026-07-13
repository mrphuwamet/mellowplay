const fs = require('fs');
const targetFile = 'c:/Users/mrphu/mellow-play/repos/mellow-play-consumer-app/src/pages/Booking.tsx';

let newContent = `import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, MapPin, Sparkles, CheckCircle, Ticket, BookOpen, AlertCircle, CreditCard, Tag } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import ChildAvatar from '../components/ChildAvatar';
import AddChildModal from '../components/AddChildModal';

interface Branch { id: number; name: string; location: string; address?: string; }
interface Course { id: number; name: string; description: string; is_little_junior_enabled: number; is_junior_enabled: number; thumbnail_url?: string; is_extraclass?: number; original_price?: number; }
interface TimeSlot { ruleId: number; startTime: string; endTime: string; maxCapacity: number; booked: number; available: number; }
interface UpcomingDate { date: string; slots: TimeSlot[]; isFull: boolean; }

const Booking = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedCourseId = searchParams.get('courseId');
  const { t, lang } = useTranslation();
  
  const children = useChildStore(state => state.children);
  const selectedChildId = useChildStore(state => state.selectedChildId);
  const fetchChildren = useChildStore(state => state.fetchChildren);

  const [step, setStep] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [upcomingDates, setUpcomingDates] = useState<UpcomingDate[]>([]);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  
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
            if (found) {
              setSelectedCourse(found);
              setStep(2); // Auto skip course selection
            }
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

  useEffect(() => {
    const fetchUpcoming = async () => {
      if (!selectedCourse || step < 4) return;
      if (!selectedBranch && !selectedCourse.is_extraclass) return;
      
      setUpcomingDates([]);
      setSelectedDateObj(null);
      setSelectedSlot(null);
      try {
        const response = await apiClient.get('/admin/calendar-slots/upcoming', {
          params: {
            calendarId: 1, // mapping later
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
  }, [selectedBranch, selectedCourse, step]);

  const currentYear = new Date().getFullYear();
  const birthYear = selectedChild?.birth_date ? new Date(selectedChild.birth_date).getFullYear() : 2020;
  const age = currentYear - birthYear;
  const ageGroup = age < 4 ? 'little_junior' : 'junior';
  const stampBalance = ageGroup === 'little_junior' ? (selectedChild?.littleJuniorBalance ?? 0) : (selectedChild?.juniorBalance ?? 0);

  const handleNextStep = (nextStep: number) => {
    if (nextStep === 3) {
      if (selectedCourse?.is_extraclass || branches.length <= 1) {
        if (branches.length === 1) setSelectedBranch(branches[0]);
        setStep(4);
        return;
      }
    }
    setStep(nextStep);
  };

  const handleBookingSubmit = async () => {
    if (!selectedChild || !selectedCourse || !selectedDateObj || !selectedSlot) {
      setErrorMsg('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    if (paymentMethod === 'stamp' && stampBalance <= 0) {
      setErrorMsg('ยอดคูปองสแตมป์ไม่เพียงพอ');
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
        calendarId: 1,
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
           // Mock redirect to payment gateway
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
      setErrorMsg(err.response?.data?.message || 'เกิดข้อผิดพลาดในการส่งข้อมูลการจอง');
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
            } else if (step > 1) {
              if (step === 4 && (selectedCourse?.is_extraclass || branches.length <= 1)) {
                setStep(2);
              } else {
                setStep(step - 1);
              }
            } else {
              navigate(-1);
            }
          }} 
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform"
        >
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[16px] font-black tracking-tight text-mellow-ink">จองคลาสเรียน</h1>
        <div className="w-10" />
      </header>

      {successBooking ? (
        <main className="p-5 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-20 h-20 rounded-full bg-mellow-green/10 flex items-center justify-center text-mellow-green mb-6 animate-bounce">
            <CheckCircle size={56} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 text-center mb-2">ยืนยันการจองสำเร็จ!</h2>
          <p className="text-slate-500 font-bold text-[14px] text-center mb-6">คูปองของคุณถูกหักออก 1 สแตมป์เรียบร้อยแล้ว</p>
          <div className="w-full mellow-card bg-white p-5 border border-slate-100 shadow-xl rounded-[28px] space-y-4 mb-8">
            <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3">
              <span className="text-slate-400 text-xs font-black uppercase tracking-wider">รหัสการจอง</span>
              <span className="text-mellow-purple font-black text-sm">#BK-{successBooking.id}</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs font-bold block mb-0.5">เด็กผู้เข้าเรียน</span>
              <span className="text-slate-700 font-black text-sm">{successBooking.childName}</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs font-bold block mb-0.5">Class</span>
              <span className="text-slate-700 font-black text-sm">{successBooking.courseName}</span>
            </div>
            {selectedBranch && (
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">สาขา</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.branchName}</span>
              </div>
            )}
            <div className="flex items-center gap-6">
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">วันที่</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.date}</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">เวลา</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.time} น.</span>
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/')} className="w-full py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg shadow-mellow-purple/20 active:scale-95 transition-transform">
            กลับสู่หน้าหลัก
          </button>
        </main>
      ) : (
        <main className="p-5">
          <div className="flex items-center justify-between mb-8 px-2">
            {[1, 2, 3, 4, 5].map(idx => (
              <React.Fragment key={idx}>
                <div className={\`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-black text-sm transition-all \${step === idx ? 'bg-mellow-purple text-white ring-4 ring-mellow-purple/10' : step > idx ? 'bg-mellow-purple/20 text-mellow-purple' : 'bg-white text-slate-300 border border-slate-100'}\`}>
                  {idx}
                </div>
                {idx < 5 && <div className={\`flex-1 h-0.5 mx-1 rounded \${step > idx ? 'bg-mellow-purple/30' : 'bg-slate-100'}\`} />}
              </React.Fragment>
            ))}
          </div>

          {selectedCourse && step > 1 && (
            <div className="mb-6 p-4 rounded-2xl bg-mellow-purple/5 border border-mellow-purple/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mellow-purple/10 flex items-center justify-center text-mellow-purple shrink-0">
                <BookOpen size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-mellow-purple uppercase tracking-wider">คลาสที่เลือก</p>
                <p className="text-sm font-black text-slate-800">{selectedCourse.name}</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-black text-slate-800">1. เลือกคลาส</h3>
              {isLoading ? (
                <div className="h-32 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-mellow-purple border-t-transparent rounded-full" /></div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {courses.map(course => (
                    <button
                      key={course.id}
                      onClick={() => { setSelectedCourse(course); handleNextStep(2); }}
                      className={\`p-4 rounded-2xl border text-left flex items-start gap-4 transition-all \${selectedCourse?.id === course.id ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100'}\`}
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                         {course.thumbnail_url ? <img src={course.thumbnail_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><BookOpen size={24}/></div>}
                      </div>
                      <div>
                        <b className="text-sm font-black text-slate-700 block mb-1">{course.name}</b>
                        <p className="text-xs text-slate-500 font-medium line-clamp-2">{course.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-black text-slate-800">2. เลือกผู้เรียน</h3>
                <button onClick={() => setIsAddChildOpen(true)} className="text-mellow-purple text-sm font-bold flex items-center gap-1 active:scale-95 transition-transform">
                  <div className="w-5 h-5 rounded-full bg-mellow-purple/10 flex items-center justify-center"><Sparkles size={12} /></div>เพิ่มผู้เรียน
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {children.map(child => {
                  const cAge = currentYear - (child.birth_date ? new Date(child.birth_date).getFullYear() : 2020);
                  const cAgeGroup = cAge < 4 ? 'little_junior' : 'junior';
                  const cStamps = cAgeGroup === 'little_junior' ? child.littleJuniorBalance : child.juniorBalance;
                  return (
                    <button key={child.id} onClick={() => setSelectedChild(child)} className={\`p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all \${selectedChild?.id === child.id ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 opacity-70'}\`}>
                      <ChildAvatar avatarType={child.avatar} className="w-12 h-12" />
                      <div>
                        <b className="text-sm font-black text-slate-700 block">{child.name}</b>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cAgeGroup === 'little_junior' ? 'Little Junior' : 'Junior'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-50 text-mellow-yellow rounded-lg text-xs font-black self-start mt-1">
                        <Ticket size={12} /> {cStamps} Stamps
                      </div>
                    </button>
                  );
                })}
              </div>
              <button disabled={!selectedChild} onClick={() => handleNextStep(3)} className="w-full mt-6 py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 transition-all">
                ขั้นตอนถัดไป
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-black text-slate-800">3. เลือกสาขา</h3>
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
              <button disabled={!selectedBranch} onClick={() => handleNextStep(4)} className="w-full mt-6 py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 transition-all">
                ขั้นตอนถัดไป
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-slate-800 mb-3">4. เลือกวันที่</h3>
                <div className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar">
                  {upcomingDates.length === 0 ? (
                    <div className="w-full text-center py-8 text-slate-400 font-medium">ไม่พบรอบเรียนในขณะนี้</div>
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
                               <div className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-sm transform -rotate-12 border border-white shadow-sm uppercase tracking-widest">เต็ม</div>
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
                  <h3 className="text-lg font-black text-slate-800 mb-3">5. เลือกรอบเวลา</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedDateObj.slots.map(slot => (
                      <button key={slot.startTime} disabled={slot.available === 0} onClick={() => { setSelectedSlot(slot); handleNextStep(5); }} className={\`p-4 rounded-2xl border text-left transition-all relative overflow-hidden \${slot.available === 0 ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed' : selectedSlot?.startTime === slot.startTime ? 'bg-mellow-purple/5 border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 hover:border-mellow-purple/30'}\`}>
                        <div className="flex flex-col gap-1.5 relative z-10">
                          <span className="text-lg font-black text-slate-700 block">{slot.startTime}</span>
                          <span className={\`text-[10px] font-bold px-2 py-0.5 rounded-full self-start \${slot.available === 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}\`}>
                            {slot.available === 0 ? 'เต็มแล้ว' : \`ว่าง \${slot.available} ที่\`}
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

          {step === 5 && (
            <div className="space-y-6 pb-32 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">เลือกวิธีชำระเงิน</h3>
              
              <div className="space-y-3">
                <button 
                  onClick={() => setPaymentMethod('stamp')}
                  className={\`w-full p-5 rounded-2xl border-2 text-left flex items-center gap-4 transition-all \${paymentMethod === 'stamp' ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : 'bg-white border-slate-100'}\`}
                >
                  <div className={\`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 \${paymentMethod === 'stamp' ? 'bg-mellow-purple text-white shadow-lg shadow-mellow-purple/30' : 'bg-slate-100 text-slate-400'}\`}>
                    <Ticket size={24} />
                  </div>
                  <div className="flex-1">
                    <b className="text-sm font-black text-slate-800 block mb-0.5">ใช้แสตมป์คลาสเรียน</b>
                    <p className="text-[12px] text-slate-500 font-bold">หัก 1 แสตมป์จากแพ็กเกจของคุณ</p>
                  </div>
                  <div className="text-right">
                    <span className={\`text-xs font-black px-2 py-1 rounded-lg \${stampBalance > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}\`}>
                      มี {stampBalance} ดวง
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
                    <b className="text-sm font-black text-slate-800 block mb-0.5">ชำระเงิน (Beam)</b>
                    <p className="text-[12px] text-slate-500 font-bold">บัตรเครดิต, พร้อมเพย์</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-mellow-purple">{selectedCourse?.original_price?.toLocaleString() || 0}฿</span>
                  </div>
                </button>
              </div>

              {paymentMethod === 'cash' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5"><Tag size={14}/> โค้ดส่วนลด (Promo Code)</label>
                  <div className="flex gap-2">
                    <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="กรอกโค้ดส่วนลด" className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold uppercase" />
                    {/* The apply logic will be handled by backend during checkout for now, or we can add an apply endpoint later */}
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      )}

      {/* Fixed Bottom Action */}
      {!successBooking && step === 5 && (
        <div className="fixed bottom-[84px] left-1/2 -translate-x-1/2 w-full max-w-sm px-5 animate-in slide-in-from-bottom-4 duration-300 z-40">
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-100 text-red-500 p-3 rounded-xl flex items-start gap-2 text-sm font-bold shadow-lg">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <button disabled={isSubmitting || (paymentMethod === 'stamp' && stampBalance <= 0)} onClick={handleBookingSubmit} className="w-full h-[60px] bg-mellow-purple text-white rounded-2xl text-[15px] font-black uppercase tracking-widest shadow-xl shadow-mellow-purple/30 flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98] transition-all">
             {paymentMethod === 'stamp' ? 'ยืนยันการจอง 1 สแตมป์' : 'ไปหน้าชำระเงิน'}
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
