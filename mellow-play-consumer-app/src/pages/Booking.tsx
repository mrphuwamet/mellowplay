import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, MapPin, Sparkles, CheckCircle, Ticket, BookOpen, AlertCircle, CreditCard, Tag, User, X, Smartphone, Wallet, QrCode, Search, Share2 } from 'lucide-react';
import ShareToLineButton from '../components/ShareToLineButton';
import { useChildStore } from '../store/useChildStore';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import ChildAvatar from '../components/ChildAvatar';
import AddChildModal from '../components/AddChildModal';
import alipayIcon from '../assets/payment-icon/alipay-icon-logo.png';
import mastercardIcon from '../assets/payment-icon/Mastercard-logo.svg.webp';
import promptpayIcon from '../assets/payment-icon/PromptPay-logo.png';
import visaIcon from '../assets/payment-icon/visa.png';
import wechatpayIcon from '../assets/payment-icon/wechat-pay-logo.png';
import shopeepayIcon from '../assets/payment-icon/shopeepay.png';
import truewalletIcon from '../assets/payment-icon/truewallet.webp';
import { getCourseView, type CourseImageViews } from '../utils/courseImage';
import { stripHtml } from '../utils/stripHtml';
import PosterCarousel, { type PosterImage } from '../components/PosterCarousel';

interface Branch { id: number; name: string; location: string; address?: string; }
interface Course { id: number; name: string; description: string; is_little_junior_enabled: number; is_junior_enabled: number; thumbnail_url?: string; image_views?: CourseImageViews; poster_images?: PosterImage[]; is_extraclass?: number; original_price?: number; calendar_id?: number; age_min?: number; age_max?: number; category_name?: string; }
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
  return `${years} ${t.booking?.year || 'ขวบ'} ${months > 0 ? `${months} ${t.booking?.month || 'เดือน'}` : ''}`;
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
  const [selectedChildren, setSelectedChildren] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedDateObj, setSelectedDateObj] = useState<UpcomingDate | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'coupon'|'promptpay'|'credit_card'|'wallet'|null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [promoErrorModal, setPromoErrorModal] = useState('');
  const [notes, setNotes] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [duplicateError, setDuplicateError] = useState<{message: string; error_code: string} | null>(null);
  const [successBooking, setSuccessBooking] = useState<any>(null);
  const [courseCoupons, setCourseCoupons] = useState<any[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [pendingBookingIds, setPendingBookingIds] = useState<number[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseAgeFilter, setCourseAgeFilter] = useState<'all' | '3-6' | '7-9' | 'custom'>('all');
  const [customAgeMin, setCustomAgeMin] = useState<number | ''>('');
  const [customAgeMax, setCustomAgeMax] = useState<number | ''>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [childCourseStatus, setChildCourseStatus] = useState<Record<number, 'upcoming' | 'completed'>>({});

  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    courses.forEach(c => {
      if (c.category_name) cats.add(c.category_name);
    });
    return Array.from(cats);
  }, [courses]);

  const filteredCourses = React.useMemo(() => {
    return courses.filter(course => {
      if (courseSearch.trim()) {
        const q = courseSearch.toLowerCase();
        const matchName = course.name?.toLowerCase().includes(q);
        const matchDesc = course.description?.toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      
      const cMin = course.age_min ?? 0;
      const cMax = course.age_max ?? 99;
      if (courseAgeFilter === '3-6') {
        if (cMax < 3 || cMin > 6) return false;
      } else if (courseAgeFilter === '7-9') {
        if (cMax < 7 || cMin > 9) return false;
      } else if (courseAgeFilter === 'custom') {
        const userMin = customAgeMin !== '' ? Number(customAgeMin) : 0;
        const userMax = customAgeMax !== '' ? Number(customAgeMax) : 99;
        if (cMax < userMin || cMin > userMax) return false;
      }

      if (selectedCategory !== 'all') {
        if (course.category_name !== selectedCategory) return false;
      }

      return true;
    });
  }, [courses, courseSearch, courseAgeFilter, customAgeMin, customAgeMax, selectedCategory]);

  useEffect(() => {
    if (children.length > 0 && selectedChildren.length === 0) {
      const activeChild = children.find(c => c.id === selectedChildId) || children[0];
      setSelectedChildren([activeChild]);
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
              setCurrentStepIndex(1);
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

  // Step Logic
  const hasBranch = !(selectedCourse?.is_extraclass || branches.length <= 1);
  const flowSteps = ['course', 'child'];
  if (hasBranch) flowSteps.push('branch');
  flowSteps.push('date', 'payment');
  
  // Lazy-init straight to the child step when arriving with a pre-selected
  // course (e.g. "Book Now" from a course card) — otherwise the course-list
  // step renders for one frame before the async fetch below jumps forward.
  const [currentStepIndex, setCurrentStepIndex] = useState(() => preSelectedCourseId ? 1 : 0);
  const currentStep = flowSteps[currentStepIndex];

  // Auto skip branch
  useEffect(() => {
    if (selectedCourse && branches.length > 0) {
      if (!hasBranch && !selectedBranch) {
        setSelectedBranch(branches[0]);
      }
    }
  }, [selectedCourse, branches, hasBranch]);

  // Per-child status for THIS course, so Step 2 can disable children who
  // can't book it: already registered (upcoming), or already attended on a
  // non-repeatable course. Attended-but-repeatable stays selectable, just badged.
  useEffect(() => {
    if (!selectedCourse) {
      setChildCourseStatus({});
      return;
    }
    const userJson = localStorage.getItem('mellow_user');
    const userId = userJson ? JSON.parse(userJson).id : null;
    if (!userId) return;

    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const [historyRes, upcomingRes] = await Promise.all([
          apiClient.get(`/profiles/bookings/history?userId=${userId}`),
          apiClient.get(`/profiles/bookings/upcoming?userId=${userId}`),
        ]);
        if (cancelled) return;
        const map: Record<number, 'upcoming' | 'completed'> = {};
        if (historyRes.data.success) {
          for (const b of historyRes.data.bookings) {
            if (b.course_id === selectedCourse.id) map[b.child_id] = 'completed';
          }
        }
        if (upcomingRes.data.success) {
          for (const b of upcomingRes.data.bookings) {
            if (b.course_id === selectedCourse.id) map[b.child_id] = 'upcoming';
          }
        }
        setChildCourseStatus(map);
      } catch (err) {
        console.error('Failed to fetch child course status:', err);
      }
    };
    fetchStatus();
    return () => { cancelled = true; };
  }, [selectedCourse]);

  useEffect(() => {
    if (!selectedCourse) {
      setCourseCoupons([]);
      return;
    }
    const fetchCourseCoupons = async () => {
      try {
        const response = await apiClient.get(`/admin/courses/${selectedCourse.id}/coupons`);
        if (response.data.success) {
          setCourseCoupons(response.data.courseCoupons);
        }
      } catch (err) {
        console.error('Failed to fetch course coupons:', err);
      }
    };
    fetchCourseCoupons();
  }, [selectedCourse]);

  useEffect(() => {
    const fetchUpcoming = async () => {
      if (!selectedCourse) return;
      if (!selectedBranch && !selectedCourse.is_extraclass) return;

      setUpcomingDates([]);
      setSelectedDateObj(null);
      setSelectedSlot(null);

      // A course with no calendar bound has no real schedule at all — it
      // must show zero slots, not silently borrow calendar #1's.
      if (!selectedCourse.calendar_id) return;

      try {
        const response = await apiClient.get('/admin/calendar-slots/upcoming', {
          params: {
            calendarId: selectedCourse.calendar_id,
            branchId: selectedBranch?.id
          }
        });
        if (response.data.success) {
          const formatted = response.data.upcoming.map((ud: any) => {
            const isFull = ud.slots.every((s: any) => s.available === 0);
            return { ...ud, isFull };
          });
          setUpcomingDates(formatted);
          
          // Auto select first available date
          const firstAvailable = formatted.find((d: any) => !d.isFull);
          if (firstAvailable) {
            setSelectedDateObj(firstAvailable);
          } else if (formatted.length > 0) {
            setSelectedDateObj(formatted[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch upcoming dates:', err);
      }
    };
    fetchUpcoming();
  }, [selectedCourse?.id, selectedBranch?.id, selectedCourse?.is_extraclass, selectedCourse?.calendar_id]);

  const currentYear = new Date().getFullYear();
  const birthYear = selectedChildren[0]?.birth_date ? new Date(selectedChildren[0].birth_date).getFullYear() : 2020;
  const childAge = currentYear - birthYear;
  const ageGroup = childAge < 4 ? 'little_junior' : 'junior';
  const stampBalance = selectedChildren.length > 0 ? selectedChildren.reduce((sum, child) => sum + (ageGroup === 'little_junior' ? (child.littleJuniorBalance ?? 0) : (child.juniorBalance ?? 0)), 0) : 0;

  const coursePrice = selectedCourse?.original_price || 0;
  const campaignDiscount = (selectedCourse as any)?.active_campaign_discount_amount || 0;
  const priceAfterCampaign = Math.max(0, coursePrice - campaignDiscount);
  const totalPrice = Math.max(0, (priceAfterCampaign * selectedChildren.length) - promoDiscount);
  const isFreeBooking = totalPrice === 0;

  const handleBookingSubmit = async () => {
    if (selectedChildren.length === 0 || !selectedCourse) {
      setErrorMsg(t.booking?.fillAllInfo || 'กรุณากรอกข้อมูลให้ครบถ้วน');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    if (!selectedCourse.is_extraclass && (!selectedDateObj || !selectedSlot)) {
      setErrorMsg(t.booking?.fillAllInfo || 'กรุณากรอกข้อมูลให้ครบถ้วน');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    
    if (paymentMethod === null && !isFreeBooking) {
      setErrorMsg('กรุณาเลือกวิธีชำระเงิน');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    if (paymentMethod === 'coupon') {
      if (!selectedCoupon) {
        setErrorMsg('กรุณาเลือกคูปองที่ต้องการใช้');
        setTimeout(() => setErrorMsg(''), 3000);
        return;
      }
      const selectedCourseCoupon = courseCoupons.find(cc => cc.id === selectedCoupon);
      if (!selectedCourseCoupon) {
        setErrorMsg(t.booking?.insufficientStamps || 'ยอดคูปองไม่เพียงพอ');
        setTimeout(() => setErrorMsg(''), 3000);
        return;
      }
      for (const child of selectedChildren) {
        const childCoupon = child?.coupons?.find((c: any) => c.id === selectedCoupon);
        if (!childCoupon || childCoupon.balance < selectedCourseCoupon.quantity_required) {
          setErrorMsg(`ยอดคูปองของ ${child.nickname || child.name} ไม่เพียงพอ`);
          setTimeout(() => setErrorMsg(''), 3000);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const scheduledAt = `${selectedDateObj.date} ${selectedSlot.startTime}`;
      const response = await apiClient.post('/admin/bookings', {
        childIds: selectedChildren.map(c => c.id),
        courseId: selectedCourse.id,
        branchId: selectedBranch?.id || null,
        scheduledAt,
        ageGroup,
        calendarId: selectedCourse.calendar_id,
        slotDate: selectedDateObj.date,
        slotStartTime: selectedSlot.startTime,
        paymentStatus: isFreeBooking ? 'paid' : (paymentMethod === 'coupon' ? 'prepaid' : 'pending_payment'),
        paymentMethod: isFreeBooking ? 'free' : paymentMethod,
        couponTypeId: paymentMethod === 'coupon' ? selectedCoupon : null,
        promoCode: promoCode || null,
        status: isFreeBooking ? 'confirmed' : (paymentMethod === 'coupon' ? 'confirmed' : 'pending_payment'),
        notes
      });

      if (response.data.success) {
        if (response.data.paymentUrl) {
           window.open(response.data.paymentUrl, '_blank');
           setPaymentUrl(response.data.paymentUrl);
           setPendingBookingIds(response.data.bookingIds || [response.data.id]);
           return;
        }

        setSuccessBooking({
          id: response.data.id,
          childName: selectedChildren.map(c => c.nickname || c.name).join(', '),
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
      if (err.response?.data?.error_code === 'DUPLICATE_BOOKING' || err.response?.data?.error_code === 'EXTRA_CLASS_LIMIT') {
        setDuplicateError({
          message: err.response.data.message,
          error_code: err.response.data.error_code
        });
      } else {
        setErrorMsg(err.response?.data?.message || t.booking?.bookingError || 'เกิดข้อผิดพลาดในการส่งข้อมูลการจอง');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setIsApplyingPromo(true);
    try {
      const price = selectedCourse?.original_price || 0;
      const response = await apiClient.get(`/promotions/validate?code=${promoCode}&price=${price}`);
      if (response.data.success) {
        setPromoDiscount(response.data.discountAmount);
      } else {
        setPromoErrorModal(response.data.message || 'ไม่พบโค้ด หรือ โค้ดหมดอายุ');
        setPromoCode('');
        setPromoDiscount(0);
      }
    } catch (err: any) {
      setPromoErrorModal(err.response?.data?.message || 'ไม่พบโค้ด หรือ โค้ดหมดอายุ');
      setPromoCode('');
      setPromoDiscount(0);
    } finally {
      setIsApplyingPromo(false);
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
              // If we are on step 1 (which means course is preselected and we skipped step 0),
              // going back should take us to the previous page in history.
              if (currentStepIndex === 1 && preSelectedCourseId) {
                 navigate(-1);
              } else {
                setCurrentStepIndex(currentStepIndex - 1);
              }
            } else {
              navigate(selectedCourse ? `/course/${selectedCourse.id}` : -1);
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
          <div className="w-20 h-20 rounded-full bg-mellow-green/10 flex items-center justify-center text-mellow-green mb-6">
            <CheckCircle size={56} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 text-center mb-2">{t.booking?.bookingSuccess || 'ยืนยันการจองสำเร็จ!'}</h2>
          <p className="text-slate-500 font-bold text-[14px] text-center mb-6">{t.booking?.bookingSuccessDesc || 'คูปองของคุณถูกหักออก 1 สแตมป์เรียบร้อยแล้ว'}</p>
          <div className="w-full mellow-card bg-white p-5 border border-slate-100 shadow-xl rounded-[28px] mb-4 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-mellow-green/10 to-mellow-blue/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3">
                <span className="text-slate-400 text-xs font-black uppercase tracking-wider">{t.booking?.bookingId || 'รหัสการจอง'}</span>
                <span className="text-mellow-purple font-black text-sm">#BK-{successBooking.id}</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">{t.booking?.childInClass || 'เด็กผู้เข้าคลาส'}</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.childName}</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-bold block mb-0.5">{t.booking?.course || 'Class'}</span>
                <span className="text-slate-700 font-black text-sm">{successBooking.courseName}</span>
              </div>
              {(!selectedCourse?.is_extraclass || selectedCourse?.location) && (
                <div>
                  <span className="text-slate-400 text-xs font-bold block mb-1 flex items-center gap-1">
                    <MapPin size={11} className="text-orange-400" />
                    {lang === 'en' ? 'Location' : 'สถานที่'}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-700 font-black text-sm">
                      {selectedCourse?.is_extraclass ? selectedCourse.location : (successBooking.branchName || 'Mellow Play (Little Walk Pattaya)')}
                    </span>
                    <a
                      href={selectedCourse?.location_link || "https://www.google.com/maps/search/?api=1&query=Mellow+Play+Pattaya"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-3 py-1 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-[11px] font-black transition-colors"
                    >
                      {lang === 'en' ? 'Map' : 'เส้นทาง'}
                    </a>
                  </div>
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
          </div>
          <p className="text-[11px] font-bold text-slate-400 text-center mb-8 px-4 leading-relaxed">
            📸 {lang === 'en' ? 'Please screenshot this screen for easy reference.' : 'โปรดแคปหน้าจอนี้ไว้เพื่อดูข้อมูลอย่างง่าย'}
          </p>
          <ShareToLineButton
            text={
              lang === 'en'
                ? `Booked ${successBooking.courseName} for ${successBooking.childName} on ${successBooking.date} ${successBooking.time}. Booking #BK-${successBooking.id}`
                : `จองคลาส ${successBooking.courseName} ให้ ${successBooking.childName} วันที่ ${successBooking.date} เวลา ${successBooking.time} น. เรียบร้อยแล้ว รหัสการจอง #BK-${successBooking.id}`
            }
            label={
              <span className="flex items-center justify-center gap-2">
                <Share2 size={16} /> {lang === 'en' ? 'Share to LINE' : 'แชร์ไป LINE'}
              </span>
            }
            className="w-full py-3.5 mb-3 bg-[#06C755]/10 text-[#06C755] rounded-2xl text-sm font-black uppercase tracking-wider active:scale-95 transition-transform"
          />
          <button onClick={() => navigate('/')} className="w-full py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg shadow-mellow-purple/20 active:scale-95 transition-transform">
            {t.booking?.backToHome || 'กลับสู่หน้าหลัก'}
          </button>
        </main>
      ) : (
        <main className="p-5">
          <div className="flex items-center justify-between mb-6 px-2">
            {flowSteps.map((stepStr, idx) => (
              <React.Fragment key={idx}>
                <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-black text-sm transition-all ${currentStepIndex === idx ? 'bg-mellow-purple text-white ring-4 ring-mellow-purple/10' : currentStepIndex > idx ? 'bg-mellow-purple/20 text-mellow-purple' : 'bg-white text-slate-300 border border-slate-100'}`}>
                  {stepStr === 'course' ? <BookOpen size={16} /> :
                   stepStr === 'child' ? <User size={16} /> :
                   stepStr === 'branch' ? <MapPin size={16} /> :
                   stepStr === 'date' ? <Calendar size={16} /> :
                   stepStr === 'payment' ? <CreditCard size={16} /> : idx + 1}
                </div>
                {idx < flowSteps.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded ${currentStepIndex > idx ? 'bg-mellow-purple/30' : 'bg-slate-100'}`} />}
              </React.Fragment>
            ))}
          </div>

          {/* Summary Box */}
          {currentStepIndex > 0 && (
             <div className="mb-6 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-3">
               {selectedCourse && (
                 <div className="flex gap-3">
                   <div className="w-8 h-8 mt-1 rounded-full bg-mellow-purple/10 flex items-center justify-center text-mellow-purple shrink-0">
                     <BookOpen size={14} />
                   </div>
                   <div className="flex-1">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CLASS</p>
                     <div className="flex items-start justify-between gap-2">
                       <div>
                         <p className="text-sm font-black text-slate-800">{selectedCourse.name}</p>
                         <p className="text-xs font-bold text-slate-500 mt-1 line-clamp-2">
                           {stripHtml(selectedCourse.description || '')}
                         </p>
                       </div>
                        <button 
                          onClick={() => setIsCourseModalOpen(true)}
                          className="text-xs font-black text-mellow-purple bg-mellow-purple/10 px-3 py-1.5 rounded-xl shrink-0"
                        >
                          รายละเอียด
                        </button>
                     </div>
                   </div>
                 </div>
               )}
                {selectedChildren.length > 0 && currentStepIndex > 1 && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0 mt-0.5">
                      <User size={14} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{lang === 'en' ? 'Class Attendees' : 'เด็กผู้เข้าคลาส'}</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedChildren.map(c => (
                          <div key={c.id} className="flex flex-col items-center gap-1">
                            <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-sm ring-2 ring-mellow-purple/20">
                              <ChildAvatar avatarType={c.avatar} className="w-10 h-10" />
                            </div>
                            <span className="text-[10px] font-black text-slate-700 max-w-[44px] truncate text-center">{c.nickname || c.name.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
               {currentStep === 'payment' && (
                 <>
                   <div className="h-px bg-slate-100 my-3" />
                   <div className="space-y-3">
                     <h4 className="text-sm font-black text-slate-800">{lang === 'en' ? 'Order Summary' : 'สรุปยอดชำระเงิน'}</h4>
                     <div className="flex justify-between text-sm font-bold text-slate-600">
                       <span>{lang === 'en' ? 'Price' : 'ราคา'}</span>
                       <span>{selectedCourse?.original_price?.toLocaleString() || 0} ฿</span>
                     </div>
                     <div className="flex justify-between text-sm font-bold text-slate-600">
                       <span>{lang === 'en' ? 'Number of Children' : 'จำนวนเด็ก'}</span>
                       <span>{selectedChildren.length} {lang === 'en' ? 'Person' : 'คน'}</span>
                     </div>
                     {selectedCourse?.active_campaign_discount_amount > 0 && (
                       <div className="flex justify-between text-sm font-bold text-slate-600">
                         <span>{selectedCourse.active_campaign_label || (lang === 'en' ? 'Special Discount' : 'ส่วนลดแคมเปญ')}</span>
                         <span className="text-mellow-red">- {(selectedCourse.active_campaign_discount_amount * selectedChildren.length).toLocaleString()} ฿</span>
                       </div>
                     )}
                     <div className="flex justify-between text-sm font-bold text-slate-600 items-center">
                       <span>{lang === 'en' ? 'Discount Code' : 'โค้ดส่วนลด'}</span>
                       <div className="flex gap-2 w-1/2">
                         <input
                           type="text"
                           value={promoCode}
                           onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                           placeholder={lang === 'en' ? 'Enter Code' : 'กรอกโค้ดที่นี่'}
                           className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase w-full"
                         />
                         <button 
                           onClick={handleApplyPromo}
                           disabled={isApplyingPromo || !promoCode.trim()}
                           className="px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg disabled:opacity-50 whitespace-nowrap"
                         >
                           {isApplyingPromo ? '...' : (lang === 'en' ? 'Apply' : 'ใช้โค้ด')}
                         </button>
                       </div>
                     </div>
                     <div className="flex justify-between text-sm font-bold text-slate-600">
                       <span>{lang === 'en' ? 'Promo Discount' : 'ส่วนลดโค้ด'}</span>
                       <span className="text-mellow-green">{promoDiscount > 0 ? `- ${promoDiscount.toLocaleString()} ฿` : '- 0 ฿'}</span>
                     </div>
                     <div className="h-px bg-slate-100 my-2" />
                     <div className="flex justify-between items-center text-base font-black text-slate-700">
                       <span>{lang === 'en' ? 'Total' : 'ยอดที่ต้องชำระ'}</span>
                       <span className="text-2xl font-black text-mellow-purple">{totalPrice.toLocaleString()} ฿</span>
                     </div>
                   </div>
                 </>
               )}
             </div>
          )}

          {currentStep === 'course' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">{t.booking?.stepCourse || 'เลือกคลาส'}</h3>

              {/* Search & Filter Bar */}
              <div className="space-y-3">
                {/* Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    placeholder={lang === 'en' ? 'Search class name...' : 'ค้นหาชื่อคลาสเรียน...'}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all"
                  />
                  <div className="absolute left-3.5 top-3.5 text-slate-400">
                    <Search size={16} />
                  </div>
                </div>

                {/* Category Filter Chips */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{lang === 'en' ? 'Categories' : 'หมวดหมู่คลาส'}</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all ${
                        selectedCategory === 'all' 
                          ? 'bg-mellow-purple text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {lang === 'en' ? 'All' : 'ทั้งหมด'}
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all ${
                          selectedCategory === cat 
                            ? 'bg-mellow-purple text-white shadow-sm' 
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Age Filter Chips */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{lang === 'en' ? 'Age Group' : 'ช่วงอายุ'}</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                    {[
                      { key: 'all', label_th: 'ทั้งหมด', label_en: 'All' },
                      { key: '3-6', label_th: '3 - 6 ปี', label_en: '3 - 6 yrs' },
                      { key: '7-9', label_th: '7 - 9+ ปี', label_en: '7 - 9+ yrs' },
                      { key: 'custom', label_th: 'กำหนดเอง', label_en: 'Custom' }
                    ].map((filter) => {
                      const active = courseAgeFilter === filter.key;
                      return (
                        <button
                          key={filter.key}
                          onClick={() => setCourseAgeFilter(filter.key as any)}
                          className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all ${
                            active 
                              ? 'bg-mellow-purple text-white shadow-sm' 
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {lang === 'en' ? filter.label_en : filter.label_th}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Age Range Inputs */}
                  {courseAgeFilter === 'custom' && (
                    <div className="flex items-center gap-2 mt-2 p-2 bg-slate-50 border border-slate-100 rounded-xl animate-in slide-in-from-top-2 duration-200">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={customAgeMin}
                        onChange={(e) => setCustomAgeMin(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Min (ปี)"
                        className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-center focus:outline-none focus:border-mellow-purple"
                      />
                      <span className="text-slate-400 text-xs font-bold">-</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={customAgeMax}
                        onChange={(e) => setCustomAgeMax(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Max (ปี)"
                        className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-center focus:outline-none focus:border-mellow-purple"
                      />
                      <span className="text-slate-500 text-xs font-bold">{lang === 'en' ? 'yrs' : 'ปี'}</span>
                    </div>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 gap-3 animate-pulse">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="rounded-2xl border border-slate-100 bg-white overflow-hidden flex items-stretch">
                      <div className="w-[95px] shrink-0 bg-slate-200" />
                      <div className="flex-1 p-3 space-y-2">
                        <div className="h-3.5 w-3/4 bg-slate-200 rounded-full" />
                        <div className="h-2.5 w-full bg-slate-100 rounded-full" />
                        <div className="h-2.5 w-1/2 bg-slate-100 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredCourses.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 font-bold text-xs">
                      {lang === 'en' ? 'No classes found matching search criteria' : 'ไม่พบคลาสเรียนที่ตรงกับเงื่อนไขการค้นหา'}
                    </div>
                  ) : (
                    filteredCourses.map(course => {
                      const view = getCourseView(course, 'square');
                      return (
                      <div
                        key={course.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${selectedCourse?.id === course.id ? 'border-mellow-purple ring-2 ring-mellow-purple/10 bg-white' : 'bg-white border-slate-100'}`}
                      >
                        {/* Main clickable area */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => { setSelectedCourse(course); setCurrentStepIndex(currentStepIndex + 1); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedCourse(course); setCurrentStepIndex(currentStepIndex + 1); } }}
                          className="w-full text-left flex gap-0 active:scale-[0.99] transition-transform items-stretch cursor-pointer"
                        >
                          {/* Thumbnail Container */}
                          <div className="w-[95px] shrink-0 bg-slate-100 relative self-stretch overflow-hidden">
                            {view.url
                              ? <img src={view.url} style={view.style} className="absolute inset-0 w-full h-full object-cover" alt={course.name} />
                              : <div className="absolute inset-0 w-full h-full flex items-center justify-center text-slate-300 bg-gradient-to-br from-slate-100 to-slate-200"><BookOpen size={28}/></div>
                            }
                            {/* Category Tag overlaying the top-left */}
                            {course.category_name && (
                              <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-[2px] text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 origin-top-left shadow-sm">
                                {course.category_name}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 p-3 flex flex-col gap-1.5 min-w-0">
                            <p className="text-[13px] font-black text-slate-800 leading-tight line-clamp-1">{course.name}</p>
                            <p className="text-[11px] text-slate-500 font-medium line-clamp-2 leading-snug">{stripHtml(course.description || '')}</p>
                            {/* Price row + Detail button */}
                            <div className="mt-auto pt-1 flex items-end justify-between gap-2">
                              <div>
                                {(course as any).active_campaign_discount_amount > 0 ? (
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-[15px] font-black text-mellow-purple leading-none">
                                      {((course.original_price || 0) - (course as any).active_campaign_discount_amount).toLocaleString()} ฿
                                    </span>
                                    <span className="text-[10px] text-slate-400 line-through font-medium">
                                      {course.original_price?.toLocaleString()} ฿
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[15px] font-black text-mellow-purple">
                                    {course.original_price ? `${course.original_price.toLocaleString()} ฿` : <span className="text-slate-400 text-[12px]">ฟรี</span>}
                                  </span>
                                )}
                                {(course as any).active_campaign_label && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Tag size={10} className="text-mellow-purple shrink-0" />
                                    <span className="text-[10px] font-bold text-mellow-purple truncate">{(course as any).active_campaign_label}</span>
                                  </div>
                                )}
                              </div>

                              {/* Detail + Book pill buttons — bottom right */}
                              <div className="shrink-0 flex items-center gap-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedCourse(course); setIsCourseModalOpen(true); }}
                                  className="px-3 py-1 bg-mellow-purple/10 text-mellow-purple text-[11px] font-bold rounded-full hover:bg-mellow-purple/20 active:scale-95 transition-all"
                                >
                                  {lang === 'en' ? 'Detail' : 'รายละเอียด'}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedCourse(course); setCurrentStepIndex(currentStepIndex + 1); }}
                                  className="px-3 py-1 bg-mellow-purple text-white text-[11px] font-bold rounded-full hover:bg-mellow-purple/90 active:scale-95 transition-all"
                                >
                                  {lang === 'en' ? 'Book' : 'จองคลาส'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
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
                  const isSelected = selectedChildren.some(c => c.id === child.id);
                  const status = childCourseStatus[child.id];
                  const isNonRepeatableTaken = status === 'completed' && !selectedCourse?.allow_repeat;
                  const isDisabled = status === 'upcoming' || isNonRepeatableTaken;
                  const statusLabel = status === 'upcoming'
                    ? (lang === 'en' ? 'Registered' : 'ลงทะเบียนแล้ว')
                    : status === 'completed'
                      ? (lang === 'en' ? 'Already Attended' : 'เคยเข้าร่วมแล้ว')
                      : null;
                  return (
                    <button key={child.id} disabled={isDisabled} onClick={() => {
                      if (isDisabled) return;
                      setSelectedChildren(prev => {
                        if (prev.some(c => c.id === child.id)) return prev.filter(c => c.id !== child.id);
                        return [...prev, child];
                      });
                    }} className={`relative p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all ${
                      isDisabled ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed' : isSelected ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 opacity-70'
                    }`}>
                      {statusLabel && (
                        <span className={`absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide shadow-sm ${
                          status === 'upcoming' ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white'
                        }`}>
                          {statusLabel}
                        </span>
                      )}
                      <div className="flex justify-between items-start w-full">
                        <ChildAvatar avatarType={child.avatar} className="w-12 h-12" />
                        {!isDisabled && (
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-mellow-purple border-mellow-purple text-white' : 'border-slate-200'}`}>
                            {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                          </div>
                        )}
                      </div>
                      <div>
                        <b className="text-[15px] font-black text-slate-800 block leading-tight">{child.nickname || child.name.split(' ')[0]}</b>
                        <p className="text-[11px] text-slate-500 font-medium truncate">{child.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">{calculateAge(child.birth_date, t)}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {child.coupons && child.coupons.filter((c: any) => c.balance > 0).map((coupon: any) => (
                          <div key={coupon.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-black self-start" style={{ backgroundColor: `${coupon.color}15`, color: coupon.color }}>
                            {coupon.icon_url ? (
                              <img src={coupon.icon_url} alt={coupon.name} className="w-3 h-3 object-contain" />
                            ) : (
                              <Ticket size={12} />
                            )}
                            {coupon.balance} {coupon.name}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button disabled={selectedChildren.length === 0} onClick={() => setCurrentStepIndex(currentStepIndex + 1)} className="w-full mt-6 py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 transition-all">
                {t.booking?.nextStep || 'ขั้นตอนถัดไป'}
              </button>
            </div>
          )}

          {currentStep === 'branch' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">{t.booking?.stepBranch || 'เลือกสาขา'}</h3>
              <div className="space-y-2">
                {branches.map(branch => (
                  <button key={branch.id} onClick={() => setSelectedBranch(branch)} className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${selectedBranch?.id === branch.id ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100'}`}>
                    <div className={`p-2 rounded-xl mt-0.5 ${selectedBranch?.id === branch.id ? 'bg-mellow-purple/10 text-mellow-purple' : 'bg-slate-100 text-slate-400'}`}><MapPin size={18} /></div>
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
                          className={`shrink-0 w-[72px] h-[84px] rounded-[20px] border flex flex-col items-center justify-center transition-all relative overflow-hidden ${ud.isFull ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed' : selectedDateObj?.date === ud.date ? 'bg-mellow-purple border-mellow-purple text-white shadow-lg shadow-mellow-purple/20' : 'bg-white border-slate-100 text-slate-400'}`}
                        >
                          {ud.isFull && (
                             <div className="absolute inset-0 bg-black/5 flex items-center justify-center z-10">
                               <div className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-sm transform -rotate-12 border border-white shadow-sm uppercase tracking-widest">{t.booking?.full || 'เต็ม'}</div>
                             </div>
                          )}
                          <span className="text-[11px] font-bold uppercase tracking-wider mb-1 relative z-0">{dayName}</span>
                          <b className={`text-2xl font-black relative z-0 ${selectedDateObj?.date === ud.date ? 'text-white' : 'text-slate-700'}`}>{dayNum}</b>
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
                      <button key={slot.startTime} disabled={slot.available === 0} onClick={() => { setSelectedSlot(slot); setCurrentStepIndex(currentStepIndex + 1); }} className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${slot.available === 0 ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed' : selectedSlot?.startTime === slot.startTime ? 'bg-mellow-purple/5 border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 hover:border-mellow-purple/30'}`}>
                        <div className="flex flex-col gap-1.5 relative z-10">
                          <span className="text-lg font-black text-slate-700 block">{slot.startTime}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full self-start ${slot.available === 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                            {slot.available === 0 ? (t.booking?.full || 'เต็มแล้ว') : `${t.booking?.availableSeats || 'ว่าง'} ${slot.available} ${t.booking?.seats || 'ที่'}`}
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
              <h3 className="text-lg font-black text-slate-800">
                {isFreeBooking 
                  ? (lang === 'en' ? 'Confirm Booking Details' : 'ยืนยันรายละเอียดการจอง')
                  : (t.booking?.stepPayment || 'เลือกวิธีชำระเงิน')}
              </h3>
              
              {isFreeBooking ? (
                <div className="p-6 rounded-3xl bg-green-50 border border-green-100 flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                    <CheckCircle size={28} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-green-900 mb-1">
                      {lang === 'en' ? 'Free Booking' : 'จองคลาสโดยไม่มีค่าใช้จ่าย'}
                    </h4>
                    <p className="text-xs text-green-700 font-bold leading-relaxed">
                      {lang === 'en' 
                        ? 'The total amount after discounts is 0 ฿. You can confirm the booking immediately without selecting a payment method.' 
                        : 'ยอดชำระเงินทั้งหมดหลังหักส่วนลดคือ 0 ฿ คุณสามารถกดปุ่มจองคลาสเรียนด้านล่างเพื่อยืนยันการจองได้ทันทีโดยไม่ต้องระบุวิธีชำระเงิน'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {courseCoupons.map((cc) => {
                    const childCoupon = selectedChild?.coupons?.find((c) => c.id === cc.id);
                    const balance = childCoupon?.balance || 0;
                    const isSelected = paymentMethod === 'coupon' && selectedCoupon === cc.id;
                    const hasEnough = balance >= cc.quantity_required;
                    
                    return (
                      <button 
                        key={cc.id}
                        disabled={!hasEnough}
                        onClick={() => { setPaymentMethod('coupon'); setSelectedCoupon(cc.id); }}
                        className={`w-full p-5 rounded-2xl border-2 text-left flex items-center gap-4 transition-all ${isSelected ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : !hasEnough ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`} style={isSelected ? { backgroundColor: cc.color, shadowColor: `${cc.color}40` } : {}}>
                          {cc.icon_url ? <img src={cc.icon_url} className="w-6 h-6 object-contain" /> : <Ticket size={24} />}
                        </div>
                        <div className="flex-1">
                          <b className="text-sm font-black text-slate-800 block mb-0.5">{t.booking?.useCoupon || 'ใช้คูปอง'} {cc.name}</b>
                          <p className="text-[12px] text-slate-500 font-bold">{t.booking?.deduct || 'หัก'} {cc.quantity_required} {t.booking?.couponUnit || 'ใบ'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-xs font-black px-2 py-1 rounded-lg ${hasEnough ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                            {t.booking?.have || 'มี'} {balance}
                          </span>
                        </div>
                      </button>
                    );
                  })}

                  <button 
                    onClick={() => setPaymentMethod('promptpay')}
                    className={`w-full p-4 rounded-2xl border-2 text-left flex items-center gap-4 transition-all ${paymentMethod === 'promptpay' ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : 'bg-white border-slate-100'}`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${paymentMethod === 'promptpay' ? 'bg-mellow-purple text-white shadow-lg shadow-mellow-purple/30' : 'bg-slate-100 text-slate-400'}`}>
                      <QrCode size={24} />
                    </div>
                    <div className="flex-1">
                      <b className="text-[15px] font-black text-slate-800 block mb-1">QR PromptPay</b>
                      <img src={promptpayIcon} alt="PromptPay" className="h-4 object-contain" />
                    </div>
                  </button>

                  <button 
                    onClick={() => setPaymentMethod('credit_card')}
                    className={`w-full p-4 rounded-2xl border-2 text-left flex items-center gap-4 transition-all ${paymentMethod === 'credit_card' ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : 'bg-white border-slate-100'}`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${paymentMethod === 'credit_card' ? 'bg-mellow-purple text-white shadow-lg shadow-mellow-purple/30' : 'bg-slate-100 text-slate-400'}`}>
                      <CreditCard size={24} />
                    </div>
                    <div className="flex-1">
                      <b className="text-[15px] font-black text-slate-800 block mb-1">Credit/Debit Card</b>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <img src={visaIcon} alt="VISA" className="h-4 object-contain" />
                        <img src={mastercardIcon} alt="Mastercard" className="h-4 object-contain" />
                      </div>
                    </div>
                  </button>

                  <button 
                    onClick={() => setPaymentMethod('wallet')}
                    className={`w-full p-4 rounded-2xl border-2 text-left flex items-center gap-4 transition-all ${paymentMethod === 'wallet' ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : 'bg-white border-slate-100'}`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${paymentMethod === 'wallet' ? 'bg-mellow-purple text-white shadow-lg shadow-mellow-purple/30' : 'bg-slate-100 text-slate-400'}`}>
                      <Wallet size={24} />
                    </div>
                    <div className="flex-1">
                      <b className="text-[15px] font-black text-slate-800 block mb-1">Wallet</b>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <img src={truewalletIcon} alt="TrueMoney Wallet" className="h-4 object-contain" />
                        <img src={shopeepayIcon} alt="ShopeePay" className="h-4 object-contain" />
                        <img src={wechatpayIcon} alt="WeChat Pay" className="h-4 object-contain" />
                        <img src={alipayIcon} alt="Alipay" className="h-4 object-contain" />
                      </div>
                    </div>
                  </button>
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
          <div className="bg-white rounded-[32px] w-[calc(100vw-48px)] max-w-sm max-h-[80vh] overflow-y-auto relative z-10 animate-in slide-in-from-bottom-8 duration-300">
            {selectedCourse.poster_images && selectedCourse.poster_images.length > 0 ? (
              <PosterCarousel images={selectedCourse.poster_images} alt={selectedCourse.name} className="w-full" rounded="rounded-t-[32px]" />
            ) : getCourseView(selectedCourse, 'card').url && (
               <div className="w-full h-48 rounded-t-[32px] overflow-hidden">
                 <img src={getCourseView(selectedCourse, 'card').url} style={getCourseView(selectedCourse, 'card').style} className="w-full h-full object-cover" />
               </div>
            )}
            <button onClick={() => setIsCourseModalOpen(false)} className="absolute top-4 right-4 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md">
              <X size={18} />
            </button>
            <div className="p-6 space-y-4">
              <div>
                 <h2 className="text-xl font-black text-slate-800 leading-tight mb-2">{selectedCourse.name}</h2>
                 
                 <div className="flex items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl mb-4 border border-slate-100">
                   <div className="flex items-center gap-2 min-w-0">
                     <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center shrink-0">
                       <MapPin size={16} />
                     </div>
                     <div className="min-w-0">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">{lang === 'en' ? 'Location' : 'สถานที่จัดคลาส'}</p>
                       <p className="text-xs font-black text-slate-700">{selectedCourse.is_extraclass ? (selectedCourse.location || (lang === 'en' ? 'Pending Location' : 'รอยืนยันสถานที่')) : 'Mellow Play (Little Walk Pattaya)'}</p>
                     </div>
                   </div>
                   {(!selectedCourse.is_extraclass || selectedCourse.location_link) && (
                     <a 
                       href={selectedCourse.location_link || "https://www.google.com/maps/search/?api=1&query=Mellow+Play+Pattaya"} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="flex items-center gap-1 px-4 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-black transition-colors whitespace-nowrap shrink-0"
                     >
                       {lang === 'en' ? 'Map' : 'เส้นทาง'}
                     </a>
                   )}
                 </div>

                 <div
                   className="prose-news whitespace-pre-wrap text-sm text-slate-600 leading-relaxed"
                   dangerouslySetInnerHTML={{ __html: selectedCourse.description || '' }}
                 />

                 {/* Skills — same full, uncollapsed list as the course detail page,
                     skills only (never the internal "indicator"/ตัวชี้วัด entries). */}
                 {(() => {
                   let achievementSkills: { th: string; en?: string }[] = [];
                   try { achievementSkills = (selectedCourse as any).achievement_skills_json ? JSON.parse((selectedCourse as any).achievement_skills_json) : []; } catch { /* ignore malformed json */ }
                   return achievementSkills.length > 0 && (
                     <div className="mt-4">
                       <h3 className="text-[13px] font-black text-slate-800 mb-2">
                         {lang === 'en' ? "Skills You'll Gain from This Class:" : 'ทักษะที่จะได้รับจากคลาสนี้:'}
                       </h3>
                       <div className="flex flex-wrap gap-2">
                         {achievementSkills.map((skill, i) => (
                           <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mellow-purple/10 text-mellow-purple rounded-full text-[12px] font-bold">
                             <Sparkles size={12} />
                             {lang === 'en' && skill.en ? skill.en : skill.th}
                           </span>
                         ))}
                       </div>
                     </div>
                   );
                 })()}
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
          <button disabled={isSubmitting} onClick={handleBookingSubmit} className="w-full h-[60px] bg-mellow-purple text-white rounded-2xl text-[15px] font-black uppercase tracking-widest shadow-xl shadow-mellow-purple/30 flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98] transition-all">
             {isFreeBooking
               ? (lang === 'en' ? 'Confirm Booking' : 'จองคลาสเรียน')
               : (paymentMethod === 'coupon'
                 ? (t.booking?.confirmStamp || 'ยืนยันการจองด้วยคูปอง')
                 : (lang === 'en' ? `Pay ${totalPrice.toLocaleString()} ฿` : `ชำระ ${totalPrice.toLocaleString()} บาท`))}
          </button>
        </div>
      )}

      {/* Top Error Notification */}
      {errorMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-sm px-5 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-red-500/95 backdrop-blur-md text-white px-5 py-4 rounded-2xl flex items-center gap-3 shadow-2xl shadow-red-500/20 border border-red-400/50">
            <AlertCircle size={20} className="shrink-0" />
            <span className="font-bold text-sm leading-tight flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="p-1 shrink-0 bg-black/10 rounded-full hover:bg-black/20 transition-colors">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}

      <AddChildModal isOpen={isAddChildOpen} onClose={() => setIsAddChildOpen(false)} />
      
      {/* Promo Error Modal */}
      {promoErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPromoErrorModal('')} />
          <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-5">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 text-center mb-2">ไม่สามารถใช้โค้ดได้</h3>
            <p className="text-sm text-slate-500 font-bold text-center mb-6">{promoErrorModal}</p>
            <button onClick={() => setPromoErrorModal('')} className="w-full py-4 bg-slate-100 text-slate-700 font-black rounded-2xl active:scale-95 transition-transform">
              ตกลง
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Booking Error Modal */}
      {duplicateError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl relative overflow-hidden animate-slide-up">
            <button 
              onClick={() => setDuplicateError(null)}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <X size={18} />
            </button>
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
              <AlertCircle className="text-mellow-red" size={32} />
            </div>
            <h3 className="text-[19px] font-black text-slate-800 text-center mb-2 leading-tight">
              {duplicateError.error_code === 'EXTRA_CLASS_LIMIT' 
                ? (lang === 'en' ? 'Limit Exceeded' : 'ไม่สามารถจองได้')
                : (lang === 'en' ? 'Already Registered' : 'จองคลาสนี้ไปแล้ว')}
            </h3>
            <p className="text-[15px] font-medium text-slate-500 text-center mb-6 leading-relaxed">
              {duplicateError.message}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDuplicateError(null)}
                className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl active:scale-[0.98] transition-all"
              >
                {lang === 'en' ? 'Close' : 'ปิด'}
              </button>
              <button 
                onClick={() => navigate('/journey')}
                className="flex-1 py-3.5 bg-mellow-purple text-white font-bold rounded-xl active:scale-[0.98] transition-all"
              >
                {lang === 'en' ? 'View History' : 'ดูประวัติการจอง'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Pending Modal */}
      {paymentUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden">
            {/* Header pulse */}
            <div className="bg-gradient-to-br from-mellow-purple to-purple-600 p-6 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-3 relative">
                <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
                <CreditCard size={30} className="text-white relative z-10" />
              </div>
              <h3 className="text-white font-black text-lg text-center">
                {lang === 'en' ? 'Payment Window Opened' : 'เปิดหน้าชำระเงินแล้ว'}
              </h3>
              <p className="text-white/80 text-sm text-center mt-1">
                {lang === 'en' ? 'Complete the payment in the new tab' : 'กรุณาชำระเงินในแท็บที่เปิดขึ้น'}
              </p>
            </div>
            {/* Actions */}
            <div className="p-5 flex flex-col gap-3">
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-4 bg-mellow-purple text-white rounded-2xl text-[15px] font-black text-center active:scale-95 transition-all shadow-lg shadow-mellow-purple/25 block"
              >
                {lang === 'en' ? 'Open Payment Link Again' : 'เปิดลิ้งชำระเงินใหม่'}
              </a>
              <button
                onClick={async () => {
                  // Cancel all pending bookings
                  for (const id of pendingBookingIds) {
                    try { await apiClient.delete(`/admin/bookings/${id}`); } catch {/* ignore */}
                  }
                  setPaymentUrl(null);
                  setPendingBookingIds([]);
                  setIsSubmitting(false);
                  setErrorMsg('');
                }}
                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl text-[15px] font-black text-center active:scale-95 transition-all"
              >
                {lang === 'en' ? 'Cancel / Edit Order' : 'ยกเลิก / แก้ไขรายการ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Booking;
