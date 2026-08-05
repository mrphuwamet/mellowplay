import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, MapPin, Sparkles, CheckCircle, Ticket, BookOpen, AlertCircle, CreditCard, Tag, User, Users, X, Smartphone, Wallet, QrCode, Search, Share2, ArrowRight, ClipboardList } from 'lucide-react';
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
import { getAttributedTag } from '../utils/tagAttribution';
import { isCourseEnded, isRegistrationClosed } from '../utils/calendarUtils';
import { getCourseDetailPath } from '../utils/courseLinks';
import logo from '../assets/ui/logo.svg';
import PosterCarousel, { type PosterImage } from '../components/PosterCarousel';
import { SkillIcon } from '../utils/skillIcons';
import ResponsiveModal from '../components/ResponsiveModal';
import { useCouponTypes, getPrimaryCouponRequirement } from '../hooks/useCouponTypes';
import DynamicRegistrationForm from '../components/DynamicRegistrationForm';

interface Branch { id: number; name: string; location: string; address?: string; }
interface Course { id: number; name: string; description: string; is_little_junior_enabled: number; is_junior_enabled: number; thumbnail_url?: string; image_views?: CourseImageViews; poster_images?: PosterImage[]; is_extraclass?: number; is_event?: number; is_service?: number; original_price?: number; calendar_id?: number; age_min?: number; age_max?: number; category_name?: string; location?: string; location_link?: string; active_campaign_discount_amount?: number; active_campaign_label?: string; allow_repeat?: number; registration_form_id?: number | null; registration_close_at?: string | null; }
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

const formatDuration = (timeStr: string, lang: string) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hrs = parseInt(h, 10);
  const mins = parseInt(m, 10);
  let result = '';
  if (hrs > 0) result += lang === 'en' ? `${hrs} hr ` : `${hrs} ชม. `;
  if (mins > 0) result += lang === 'en' ? `${mins} mins` : `${mins} นาที`;
  return result.trim() || timeStr;
};

const Booking = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedCourseId = searchParams.get('courseId');
  const { t, lang } = useTranslation();
  
  const children = useChildStore(state => state.children);
  const fetchChildren = useChildStore(state => state.fetchChildren);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [upcomingDates, setUpcomingDates] = useState<UpcomingDate[]>([]);
  const [isLoadingDates, setIsLoadingDates] = useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [modalUpcomingSlots, setModalUpcomingSlots] = useState<{ date: string; slots: TimeSlot[] }[]>([]);
  const [modalShowAllSlots, setModalShowAllSlots] = useState(false);
  const couponTypes = useCouponTypes();
  
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
  const [registrationForm, setRegistrationForm] = useState<any>(null);
  const [formAnswers, setFormAnswers] = useState<Record<string, any>>({});
  const [courseSearch, setCourseSearch] = useState('');
  const [courseAgeFilter, setCourseAgeFilter] = useState<'all' | '3-6' | '7-9' | 'custom'>('all');
  const [customAgeMin, setCustomAgeMin] = useState<number | ''>('');
  const [customAgeMax, setCustomAgeMax] = useState<number | ''>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [childCourseStatus, setChildCourseStatus] = useState<Record<number, 'upcoming' | 'completed'>>({});

  // Book Class / Book Service / Book Event are three distinct entry points
  // into this exact same wizard — same steps, same screens ("ยึดตามการจอง
  // คลาส"), but each browses its own course pool via a real is_event/
  // is_service flag (not a category-name guess) so they stay clearly
  // separate systems ("แยกระบบกันชัดเจน") rather than one blended list.
  const bookingType: 'class' | 'service' | 'event' =
    searchParams.get('type') === 'event' ? 'event' :
    searchParams.get('type') === 'service' ? 'service' :
    'class';

  const coursePoolMatches = (course: Course) =>
    bookingType === 'event' ? !!course.is_event :
    bookingType === 'service' ? !!course.is_service :
    !course.is_event && !course.is_service;

  // The one visible difference between the three systems — everything else
  // (progress steps, cards, payment screen) is the exact same component.
  const bookingTypeTitle = bookingType === 'event'
    ? (lang === 'en' ? 'Book Event' : 'จองกิจกรรม')
    : bookingType === 'service'
      ? (lang === 'en' ? 'Book Service' : 'จองบริการ')
      : (t.booking?.title || 'จองคลาสเรียน');
  const stepCourseTitle = bookingType === 'event'
    ? (lang === 'en' ? 'Choose an Event' : 'เลือกกิจกรรม')
    : bookingType === 'service'
      ? (lang === 'en' ? 'Choose a Service' : 'เลือกบริการ')
      : (t.booking?.stepCourse || 'เลือกคลาส');
  // Kept as one shared constant (not per-bookingType wording) so every
  // mention of the book action stays in sync if this ever changes again.
  const bookActionLabel = lang === 'en' ? 'Register' : 'ลงทะเบียน';

  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    courses.forEach(c => {
      // Keep in sync with filteredCourses' own pool split below — otherwise
      // a category shows up as a chip with nothing ever matching it here.
      if (c.category_name && coursePoolMatches(c)) cats.add(c.category_name);
    });
    return Array.from(cats);
  }, [courses, bookingType]);

  const filteredCourses = React.useMemo(() => {
    return courses.filter(course => {
      if (!coursePoolMatches(course)) return false;

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
  }, [courses, courseSearch, courseAgeFilter, customAgeMin, customAgeMax, selectedCategory, bookingType]);

  // Only auto-pick when there's exactly one child to pick from — with 2+
  // kids this silently pre-ticked whichever child was "active" in the app
  // switcher, so tapping a *different* child (to book them instead) just
  // added them to the selection instead of replacing it, since the child
  // step is a multi-select (tap toggles membership, it doesn't replace the
  // array). That looked like "the first child's data tags along even though
  // I never ticked them." With one child there's no ambiguity to introduce.
  useEffect(() => {
    if (children.length === 1 && selectedChildren.length === 0) {
      setSelectedChildren([children[0]]);
    }
  }, [children]);

  // A promo code's discount is banked as a flat baht amount validated
  // against the course that was selected when "Apply" was pressed. If the
  // user backs out and picks a *different* course without leaving this page,
  // that stale amount stayed applied and the payment step showed a total
  // that no longer matched what the backend would actually charge. Payment
  // method/coupon selection is course-specific too (coupon balance & prices
  // differ per course), so all four reset together whenever the course changes.
  useEffect(() => {
    setPromoCode('');
    setPromoDiscount(0);
    setPaymentMethod(null);
    setSelectedCoupon(null);
  }, [selectedCourse?.id]);

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
              // A guest stays on step 0 (course browsing) with the gate
              // modal already shown by the mount-time effect above — only a
              // real session actually advances to the child step.
              if (!isGuest) setCurrentStepIndex(1);
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
  const hasBranch = !(selectedCourse?.is_extraclass || selectedCourse?.is_event || branches.length <= 1);
  // A family_member_picker (role 'child') on the assigned form takes over
  // child selection entirely — the separate 'child' step would just be
  // asking the same question twice through two different UIs.
  const formChildPickerField = registrationForm?.fields?.find((f: any) => {
    if (f.type !== 'family_member_picker') return false;
    try { return JSON.parse(f.config_json || '{}').role === 'child'; } catch { return false; }
  });
  const formHasChildPicker = !!formChildPickerField;
  const flowSteps = ['course'];
  if (!formHasChildPicker) flowSteps.push('child');
  if (registrationForm) flowSteps.push('registrationForm');
  if (hasBranch) flowSteps.push('branch');
  flowSteps.push('date', 'payment');

  // Guests could browse straight through the whole flow and only hit a wall
  // at final submit (or not even then) — gate as soon as they try to move
  // past course browsing, whether by picking a course card or arriving via
  // a preSelectedCourseId deep link (which skips straight to the child step).
  // Checked up front (before the step-index state below) so the gate can
  // apply to the very first render — a guest should never see the tab
  // indicator flash forward to "child" before the modal appears.
  const isGuest = localStorage.getItem('mellow_guest') === 'true';
  const [showGuestModal, setShowGuestModal] = useState(false);

  // The account holder themselves, for the registration form's adult-role
  // family_member_picker — they're a family member too, just never a row in
  // the Children-backed roster (see DynamicRegistrationForm's mainAccount prop).
  const mainAccount = useMemo(() => {
    const userJson = localStorage.getItem('mellow_user');
    if (!userJson) return undefined;
    const user = JSON.parse(userJson);
    const name = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (!name) return undefined;
    return { name, nickname: user.firstName, avatar: user.avatarUrl };
  }, []);

  // Lazy-init straight to the child step when arriving with a pre-selected
  // course (e.g. "Book Now" from a course card) — otherwise the course-list
  // step renders for one frame before the async fetch below jumps forward.
  // A guest instead stays on step 0 with the gate modal shown on top of it.
  const [currentStepIndex, setCurrentStepIndex] = useState(() => (preSelectedCourseId && !isGuest) ? 1 : 0);
  const currentStep = flowSteps[currentStepIndex];

  useEffect(() => {
    if (preSelectedCourseId && isGuest) {
      setShowGuestModal(true);
    }
    // Only needs to run once on mount for the deep-link case — course
    // selection elsewhere is gated directly at the click handler instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every "advance past course browsing" action funnels through here so the
  // guest gate is checked synchronously, before currentStepIndex ever
  // changes — this is what keeps the tab indicator from flashing forward.
  const goToChildStep = (course: Course | null) => {
    if (!course) return;
    setSelectedCourse(course);
    if (isGuest) {
      setShowGuestModal(true);
      return;
    }
    // Index 1 is always the step right after course browsing — 'child' or
    // 'registrationForm', whichever applies — so this stays correct even if
    // the form fetch (which decides formHasChildPicker) hasn't resolved yet.
    setCurrentStepIndex(1);
  };

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

  // Whatever custom registration form the CRM assigned to this course (or
  // null — most courses have none). Answers reset alongside it since a
  // different course means a different form (or no form at all).
  useEffect(() => {
    setFormAnswers({});
    if (!selectedCourse?.registration_form_id) {
      setRegistrationForm(null);
      return;
    }
    let cancelled = false;
    apiClient.get(`/admin/courses/${selectedCourse.id}/registration-form`)
      .then(res => { if (!cancelled) setRegistrationForm(res.data.success ? res.data.form : null); })
      .catch(() => { if (!cancelled) setRegistrationForm(null); });
    return () => { cancelled = true; };
  }, [selectedCourse?.id, selectedCourse?.registration_form_id]);

  // Informational schedule for the course-preview modal — unlike the
  // booking-flow's own upcomingDates effect below, this isn't gated on a
  // branch being picked yet (the modal opens before that step), so it
  // fetches independently, same call CourseDetail.tsx's full page makes.
  useEffect(() => {
    setModalShowAllSlots(false);
    if (!isCourseModalOpen || !selectedCourse?.calendar_id) {
      setModalUpcomingSlots([]);
      return;
    }
    let cancelled = false;
    apiClient.get('/admin/calendar-slots/upcoming', { params: { calendarId: selectedCourse.calendar_id } })
      .then(res => { if (!cancelled && res.data.success) setModalUpcomingSlots(res.data.upcoming || []); })
      .catch(() => { if (!cancelled) setModalUpcomingSlots([]); });
    return () => { cancelled = true; };
  }, [isCourseModalOpen, selectedCourse?.calendar_id]);

  useEffect(() => {
    const fetchUpcoming = async () => {
      setIsLoadingDates(false);
      if (!selectedCourse) return;
      if (!selectedBranch && !selectedCourse.is_extraclass && !selectedCourse.is_event) return;

      setUpcomingDates([]);
      setSelectedDateObj(null);
      setSelectedSlot(null);

      // A course with no calendar bound has no real schedule at all — it
      // must show zero slots, not silently borrow calendar #1's.
      if (!selectedCourse.calendar_id) return;

      setIsLoadingDates(true);
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
      } finally {
        setIsLoadingDates(false);
      }
    };
    fetchUpcoming();
  }, [selectedCourse?.id, selectedBranch?.id, selectedCourse?.is_extraclass, selectedCourse?.is_event, selectedCourse?.calendar_id]);

  const currentYear = new Date().getFullYear();
  const birthYear = selectedChildren[0]?.birth_date ? new Date(selectedChildren[0].birth_date).getFullYear() : 2020;
  const childAge = currentYear - birthYear;
  const ageGroup = childAge < 4 ? 'little_junior' : 'junior';
  const stampBalance = selectedChildren.length > 0 ? selectedChildren.reduce((sum, child) => sum + (ageGroup === 'little_junior' ? (child.littleJuniorBalance ?? 0) : (child.juniorBalance ?? 0)), 0) : 0;

  const coursePrice = selectedCourse?.original_price || 0;
  const campaignDiscount = (selectedCourse as any)?.active_campaign_discount_amount || 0;
  const priceAfterCampaign = Math.max(0, coursePrice - campaignDiscount);
  // promoDiscount is a per-child amount (validated against a single child's
  // priceAfterCampaign below), so it must scale with headcount just like the
  // campaign discount does — otherwise a 100% code only ever wipes out the
  // equivalent of one child's price no matter how many are selected.
  const totalPrice = Math.max(0, (priceAfterCampaign - promoDiscount) * selectedChildren.length);
  const isFreeBooking = totalPrice === 0;

  const handleBookingSubmit = async () => {
    if (selectedChildren.length === 0 || !selectedCourse) {
      setErrorMsg(t.booking?.fillAllInfo || 'กรุณากรอกข้อมูลให้ครบถ้วน');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    if (!selectedCourse.is_extraclass && !selectedCourse.is_event && (!selectedDateObj || !selectedSlot)) {
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
        notes,
        sponsorTag: getAttributedTag(),
        formId: registrationForm?.id,
        formAnswers: registrationForm ? formAnswers : undefined,
      });

      if (response.data.success) {
        if (response.data.paymentUrl) {
           // Same-tab redirect rather than window.open(_blank) — one
           // continuous flow with no second tab to find/manage, and Beam's
           // own redirectUrl brings the user straight back to
           // /booking-success once payment completes.
           window.location.href = response.data.paymentUrl;
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
      const errorCode = err.response?.data?.error_code;
      if (errorCode === 'DUPLICATE_BOOKING' || errorCode === 'EXTRA_CLASS_LIMIT' || errorCode === 'DUPLICATE_FAMILY_BOOKING' || errorCode === 'DUPLICATE_FORM_SUBMISSION') {
        setDuplicateError({
          message: err.response.data.message,
          error_code: errorCode
        });
      } else if (errorCode === 'SLOT_FULL') {
        // Someone else took the seat between the date-step fetch and this
        // submit — send the user back to re-pick a slot instead of leaving
        // them stuck on the payment step with a stale, already-full one.
        setErrorMsg(err.response?.data?.message || 'ขออภัย รอบเวลานี้เต็มแล้ว กรุณาเลือกรอบเวลาอื่น');
        setTimeout(() => setErrorMsg(''), 4000);
        setSelectedSlot(null);
        setCurrentStepIndex(flowSteps.indexOf('date'));
        if (selectedCourse?.calendar_id) {
          apiClient.get('/admin/calendar-slots/upcoming', {
            params: { calendarId: selectedCourse.calendar_id, branchId: selectedBranch?.id }
          }).then(res => {
            if (res.data.success) {
              const formatted = res.data.upcoming.map((ud: any) => ({ ...ud, isFull: ud.slots.every((s: any) => s.available === 0) }));
              setUpcomingDates(formatted);
            }
          }).catch(() => { /* best-effort refresh */ });
        }
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
      // Validate against the per-child price after campaign discount (not
      // raw original_price) so this preview matches what the backend
      // actually charges when a campaign and promo code are stacked.
      const price = priceAfterCampaign;
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

  // mellow-page (not a hand-rolled max-width) so AppShell's
  // .mellow-shell-frame:has(> .mellow-page) rule actually widens to match —
  // without a recognized page-width class there, the frame silently falls
  // back to its 520px default no matter how wide this div's own classes
  // claim to grow, leaving visible empty gutters on desktop.
  return (
    <div className="mellow-page pb-32">
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
            } else if (selectedCourse) {
              navigate(`/class/${selectedCourse.id}`);
            } else {
              navigate(-1);
            }
          }} 
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform"
        >
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[17px] font-black tracking-tight text-mellow-ink">{bookingTypeTitle}</h1>
        <div className="w-10" />
      </header>

      {successBooking ? (
        <main className="p-5 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-20 h-20 rounded-full bg-mellow-green/10 flex items-center justify-center text-mellow-green mb-6">
            <CheckCircle size={56} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 text-center mb-6">{t.booking?.bookingSuccess || 'ยืนยันการจองสำเร็จ!'}</h2>
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
              {((!selectedCourse?.is_extraclass && !selectedCourse?.is_event) || selectedCourse?.location) && (
                <div>
                  <span className="text-slate-400 text-xs font-bold block mb-1 flex items-center gap-1">
                    <MapPin size={11} className="text-orange-400" />
                    {lang === 'en' ? 'Location' : 'สถานที่'}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-700 font-black text-sm">
                      {(selectedCourse?.is_extraclass || selectedCourse?.is_event) ? selectedCourse.location : (successBooking.branchName || 'Mellow Play (Little Walk Pattaya)')}
                    </span>
                    <a
                      href={selectedCourse?.location_link || "https://www.google.com/maps/search/?api=1&query=Mellow+Play+Pattaya"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-3 py-1 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-[12px] font-black transition-colors"
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
          <p className="text-[12px] font-bold text-slate-400 text-center mb-8 px-4 leading-relaxed">
            📸 {lang === 'en' ? 'Please screenshot this screen for easy reference.' : 'โปรดแคปหน้าจอนี้ไว้เพื่อดูข้อมูลอย่างง่าย'}
          </p>
          <ShareToLineButton
            text={
              lang === 'en'
                ? `Booked ${successBooking.courseName} for ${successBooking.childName} on ${successBooking.date} ${successBooking.time}. Booking #BK-${successBooking.id}`
                : `${bookActionLabel} ${successBooking.courseName} ให้ ${successBooking.childName} วันที่ ${successBooking.date} เวลา ${successBooking.time} น. เรียบร้อยแล้ว รหัสการจอง #BK-${successBooking.id}`
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
                   stepStr === 'registrationForm' ? <ClipboardList size={16} /> :
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
                     <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CLASS</p>
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
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{lang === 'en' ? 'Class Attendees' : 'เด็กผู้เข้าคลาส'}</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedChildren.map(c => (
                          <div key={c.id} className="flex flex-col items-center gap-1">
                            <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-sm ring-2 ring-mellow-purple/20">
                              <ChildAvatar avatarType={c.avatar} className="w-10 h-10" />
                            </div>
                            <span className="text-[11px] font-black text-slate-700 max-w-[44px] truncate text-center">{c.nickname || c.name.split(' ')[0]}</span>
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
                     {selectedDateObj && selectedSlot && (
                       <div className="flex justify-between text-sm font-bold text-slate-600">
                         <span>{lang === 'en' ? 'Session' : 'รอบที่จอง'}</span>
                         <span className="text-slate-800 text-right">
                           {new Date(selectedDateObj.date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · {selectedSlot.startTime} น.
                         </span>
                       </div>
                     )}
                     {registrationForm && (registrationForm.fields || [])
                       .filter((f: any) => f.type !== 'heading')
                       .map((f: any) => {
                         const raw = formAnswers[f.field_key];
                         const display = Array.isArray(raw) ? raw.join(', ') : (raw != null ? String(raw).trim() : '');
                         if (!display) return null;
                         return (
                           <div key={f.field_key} className="flex justify-between text-sm font-bold text-slate-600 gap-3">
                             <span className="shrink-0">{f.label}</span>
                             <span className="text-slate-800 text-right">{display}</span>
                           </div>
                         );
                       })}
                     <div className="flex justify-between text-sm font-bold text-slate-600">
                       <span>{lang === 'en' ? 'Price' : 'ราคา'}</span>
                       <span>{selectedCourse?.original_price ? `${selectedCourse.original_price.toLocaleString()} ฿` : (lang === 'en' ? 'Free' : 'ฟรี')}</span>
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
                       <span className="text-mellow-green">{promoDiscount > 0 ? `- ${(promoDiscount * selectedChildren.length).toLocaleString()} ฿` : '- 0 ฿'}</span>
                     </div>
                     <div className="h-px bg-slate-100 my-2" />
                     <div className="flex justify-between items-center text-base font-black text-slate-700">
                       <span>{lang === 'en' ? 'Total' : 'ยอดที่ต้องชำระ'}</span>
                       <span className="text-2xl font-black text-mellow-purple">{totalPrice > 0 ? `${totalPrice.toLocaleString()} ฿` : (lang === 'en' ? 'Free' : 'ฟรี')}</span>
                     </div>
                   </div>
                 </>
               )}
             </div>
          )}

          {currentStep === 'course' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">{stepCourseTitle}</h3>

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

                {/* Category + Age filters — one continuous horizontally
                    scrolling row instead of two stacked blocks, with small
                    inline labels and a divider marking where each group starts. */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{lang === 'en' ? 'Category' : 'หมวดหมู่'}</span>
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-black whitespace-nowrap transition-all shrink-0 ${
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
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-black whitespace-nowrap transition-all shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-mellow-purple text-white shadow-sm'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}

                  <span className="w-px h-4 bg-slate-200 shrink-0 mx-1" />

                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{lang === 'en' ? 'Age' : 'อายุ'}</span>
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
                        className={`px-3.5 py-1.5 rounded-xl text-[12px] font-black whitespace-nowrap transition-all shrink-0 ${
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
                  <div className="flex items-center justify-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:border-mellow-purple transition-colors">
                      <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">Min</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={customAgeMin}
                        onChange={(e) => setCustomAgeMin(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0"
                        className="w-10 text-xs font-black text-slate-800 text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    <span className="text-slate-300 font-black">–</span>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:border-mellow-purple transition-colors">
                      <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">Max</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={customAgeMax}
                        onChange={(e) => setCustomAgeMax(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="99"
                        className="w-10 text-xs font-black text-slate-800 text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    <span className="text-slate-500 text-xs font-bold shrink-0">{lang === 'en' ? 'yrs' : 'ปี'}</span>
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-pulse">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="rounded-3xl border border-slate-100 bg-white overflow-hidden">
                      <div className="aspect-[4/3] bg-slate-200" />
                      <div className="p-3 space-y-2">
                        <div className="h-3.5 w-3/4 bg-slate-200 rounded-full" />
                        <div className="h-2.5 w-full bg-slate-100 rounded-full" />
                        <div className="h-2.5 w-1/2 bg-slate-100 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredCourses.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-slate-400 font-bold text-xs">
                      {lang === 'en' ? 'No classes found matching search criteria' : 'ไม่พบคลาสเรียนที่ตรงกับเงื่อนไขการค้นหา'}
                    </div>
                  ) : (
                    filteredCourses.map(course => {
                      const view = getCourseView(course, 'card');
                      const ended = isCourseEnded(course);
                      const closed = isRegistrationClosed(course);
                      const disabled = ended || closed;
                      return (
                      <div
                        key={course.id}
                        role="button"
                        tabIndex={0}
                        // Tapping the card itself always goes to the course's
                        // real detail page first (same as everywhere else in
                        // the app) — only the dedicated Register pill below
                        // jumps straight into the booking wizard, and that
                        // one alone respects disabled (ended/closed).
                        onClick={() => navigate(getCourseDetailPath(course))}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(getCourseDetailPath(course)); }}
                        className={`rounded-3xl border transition-all overflow-hidden flex flex-col active:scale-[0.98] cursor-pointer ${disabled ? 'opacity-80' : ''} ${selectedCourse?.id === course.id ? 'border-mellow-purple ring-2 ring-mellow-purple/10 bg-white' : 'bg-white border-slate-100'}`}
                      >
                        {/* Cover image */}
                        <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                          {view.url
                            ? <img src={view.url} style={view.style} className={`w-full h-full object-cover ${disabled ? 'grayscale-[40%]' : ''}`} alt={course.name} />
                            : <div className="w-full h-full flex items-center justify-center text-slate-300 bg-gradient-to-br from-slate-100 to-slate-200"><BookOpen size={28}/></div>
                          }
                          {course.category_name && (
                            <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm text-mellow-purple">
                              {course.category_name}
                            </div>
                          )}
                          {disabled && (
                            <div className="absolute top-2 right-2 bg-slate-400 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-sm">
                              {ended ? (lang === 'en' ? 'Ended' : 'จบแล้ว') : (lang === 'en' ? 'Registration Closed' : 'ปิดรับลงทะเบียน')}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-3 flex flex-col gap-1.5 min-w-0">
                          <p className="text-[14px] font-black text-slate-800 leading-tight line-clamp-1">{course.name}</p>
                          <p className="text-[12px] text-slate-500 font-medium line-clamp-2 leading-snug">{stripHtml(course.description || '')}</p>

                          <div className="mt-auto pt-1">
                            {(course as any).active_campaign_discount_amount > 0 ? (
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[16px] font-black text-mellow-purple leading-none">
                                  {(() => {
                                    const discounted = (course.original_price || 0) - (course as any).active_campaign_discount_amount;
                                    return discounted > 0 ? `${discounted.toLocaleString()} ฿` : (lang === 'en' ? 'Free' : 'ฟรี');
                                  })()}
                                </span>
                                <span className="text-[11px] text-slate-400 line-through font-medium">
                                  {course.original_price?.toLocaleString()} ฿
                                </span>
                              </div>
                            ) : (
                              <span className="text-[16px] font-black text-mellow-purple">
                                {course.original_price ? `${course.original_price.toLocaleString()} ฿` : <span className="text-slate-400 text-[13px]">ฟรี</span>}
                              </span>
                            )}
                            {(course as any).active_campaign_label && (
                              <div className="flex items-center gap-1 mt-1">
                                <Tag size={10} className="text-mellow-purple shrink-0" />
                                <span className="text-[11px] font-bold text-mellow-purple truncate">{(course as any).active_campaign_label}</span>
                              </div>
                            )}

                            {/* Register pill — the card itself already goes
                                to the detail page on tap (see the card's own
                                onClick above), so there's no separate Detail
                                button here to duplicate that. */}
                            <div className="mt-2">
                              <button
                                disabled={disabled}
                                onClick={(e) => { e.stopPropagation(); if (!disabled) goToChildStep(course); }}
                                className={`w-full px-3 py-1.5 text-[12px] font-bold rounded-full transition-all text-center ${
                                  disabled
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-mellow-purple text-white hover:bg-mellow-purple/90 active:scale-95'
                                }`}
                              >
                                {disabled ? (ended ? (lang === 'en' ? 'Ended' : 'จบแล้ว') : (lang === 'en' ? 'Closed' : 'ปิดรับ')) : bookActionLabel}
                              </button>
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
                <h3 className="text-lg font-black text-slate-800">{bookingType === 'event' ? (lang === 'en' ? 'Choose the child attending' : 'เลือกเด็กที่เข้าร่วม (เลือกได้ 1 คน)') : (t.booking?.stepChild || 'เลือกผู้เรียน')}</h3>
                <button onClick={() => setIsAddChildOpen(true)} className="text-mellow-purple text-sm font-bold flex items-center gap-1 active:scale-95 transition-transform">
                  <div className="w-5 h-5 rounded-full bg-mellow-purple/10 flex items-center justify-center"><Sparkles size={12} /></div>{t.booking?.addChild || 'เพิ่มผู้เรียน'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
                      // Events are 1 child per booking (see bookingType) —
                      // picking a child replaces the selection instead of
                      // adding to it, unlike Class/Service which allow
                      // booking several children into the same session.
                      if (bookingType === 'event') {
                        setSelectedChildren([child]);
                        return;
                      }
                      setSelectedChildren(prev => {
                        if (prev.some(c => c.id === child.id)) return prev.filter(c => c.id !== child.id);
                        return [...prev, child];
                      });
                    }} className={`relative p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all ${
                      isDisabled ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed' : isSelected ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 opacity-70'
                    }`}>
                      {statusLabel && (
                        <span className={`absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide shadow-sm ${
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
                        <b className="text-[16px] font-black text-slate-800 block leading-tight">{child.nickname || child.name.split(' ')[0]}</b>
                        <p className="text-[12px] text-slate-500 font-medium truncate">{child.name}</p>
                        <p className="text-[11px] font-bold text-slate-400 mt-0.5">{calculateAge(child.dob, t)}</p>
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
              {/* Also disabled while branches/courses are still loading —
                  whether a branch step even exists depends on branches.length,
                  so advancing before that resolves could jump straight into
                  what a moment later becomes a different step. */}
              <button disabled={selectedChildren.length === 0 || isLoading} onClick={() => setCurrentStepIndex(currentStepIndex + 1)} className="w-full mt-6 py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 transition-all">
                {t.booking?.nextStep || 'ขั้นตอนถัดไป'}
              </button>
            </div>
          )}

          {currentStep === 'registrationForm' && registrationForm && (
            <DynamicRegistrationForm
              form={registrationForm}
              answers={formAnswers}
              onChange={(key, value) => setFormAnswers(prev => ({ ...prev, [key]: value }))}
              roster={children}
              onBack={() => setCurrentStepIndex(currentStepIndex - 1)}
              onNext={() => setCurrentStepIndex(currentStepIndex + 1)}
              lang={lang}
              childPickerMode={bookingType === 'event' ? 'single' : 'multi'}
              selectedChildIds={formHasChildPicker ? selectedChildren.map(c => c.id) : undefined}
              onChildSelectionChange={formHasChildPicker ? (ids) => setSelectedChildren(ids.map(id => children.find(c => c.id === id)).filter(Boolean)) : undefined}
              onAddFamilyMember={() => setIsAddChildOpen(true)}
              mainAccount={mainAccount}
            />
          )}

          {currentStep === 'branch' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-black text-slate-800">{t.booking?.stepBranch || 'เลือกสาขา'}</h3>
              <div className="space-y-2">
                {isLoading ? (
                  [0, 1].map(i => (
                    <div key={i} className="w-full h-[68px] rounded-2xl bg-slate-100 animate-pulse" />
                  ))
                ) : branches.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 font-medium text-sm">
                    {lang === 'en' ? 'No branches available right now' : 'ไม่พบสาขาให้เลือกในขณะนี้'}
                  </div>
                ) : (
                  branches.map(branch => (
                    <button key={branch.id} onClick={() => setSelectedBranch(branch)} className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${selectedBranch?.id === branch.id ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100'}`}>
                      <div className={`p-2 rounded-xl mt-0.5 ${selectedBranch?.id === branch.id ? 'bg-mellow-purple/10 text-mellow-purple' : 'bg-slate-100 text-slate-400'}`}><MapPin size={18} /></div>
                      <div>
                        <b className="text-sm font-black text-slate-700 block">{branch.name}</b>
                        <p className="text-[13px] text-slate-400 font-bold leading-snug mt-0.5">{branch.location}</p>
                      </div>
                    </button>
                  ))
                )}
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
                  {isLoadingDates ? (
                    [0, 1, 2, 3].map(i => (
                      <div key={i} className="shrink-0 w-[72px] h-[84px] rounded-[20px] bg-slate-100 animate-pulse" />
                    ))
                  ) : upcomingDates.length === 0 ? (
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
                               <div className="bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-sm transform -rotate-12 border border-white shadow-sm uppercase tracking-widest">{t.booking?.full || 'เต็ม'}</div>
                             </div>
                          )}
                          <span className="text-[12px] font-bold uppercase tracking-wider mb-1 relative z-0">{dayName}</span>
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
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {selectedDateObj.slots.map(slot => (
                      <button key={slot.startTime} disabled={slot.available === 0} onClick={() => { setSelectedSlot(slot); setCurrentStepIndex(currentStepIndex + 1); }} className={`p-[5px] rounded-2xl border text-left transition-all relative overflow-hidden ${slot.available === 0 ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed' : selectedSlot?.startTime === slot.startTime ? 'bg-mellow-purple/5 border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100 hover:border-mellow-purple/30'}`}>
                        <div className="flex items-center justify-between gap-2 relative z-10">
                          <span className="text-xl font-black text-slate-700">{slot.startTime}</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${slot.available === 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                            {slot.available === 0 ? (t.booking?.full || 'เต็มแล้ว') : (
                              <>
                                {t.booking?.availableSeats || 'ว่าง'} {slot.available}
                                <Users size={13} strokeWidth={2.5} />
                              </>
                            )}
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
                      {lang === 'en' ? 'Free Booking' : `${bookActionLabel}โดยไม่มีค่าใช้จ่าย`}
                    </h4>
                    <p className="text-xs text-green-700 font-bold leading-relaxed">
                      {lang === 'en'
                        ? 'The total amount after discounts is 0 ฿. You can confirm the booking immediately without selecting a payment method.'
                        : `ยอดชำระเงินทั้งหมดหลังหักส่วนลดคือ 0 ฿ คุณสามารถกดปุ่ม${bookActionLabel}ด้านล่างเพื่อยืนยันการจองได้ทันทีโดยไม่ต้องระบุวิธีชำระเงิน`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {courseCoupons.map((cc) => {
                    // Every selected child spends this coupon type individually
                    // at booking time (see backend createBooking), so the option
                    // is only really usable when EACH of them has enough — not
                    // just whichever child happens to be first in the array.
                    // Showing the lowest balance surfaces the actual bottleneck.
                    const balances = selectedChildren.map(child => child?.coupons?.find((c: any) => c.id === cc.id)?.balance || 0);
                    const balance = balances.length > 0 ? Math.min(...balances) : 0;
                    const isSelected = paymentMethod === 'coupon' && selectedCoupon === cc.id;
                    const hasEnough = balance >= cc.quantity_required;

                    return (
                      <button 
                        key={cc.id}
                        disabled={!hasEnough}
                        onClick={() => { setPaymentMethod('coupon'); setSelectedCoupon(cc.id); }}
                        className={`w-full p-5 rounded-2xl border-2 text-left flex items-center gap-4 transition-all ${isSelected ? 'bg-white border-mellow-purple ring-4 ring-mellow-purple/10' : !hasEnough ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`} style={isSelected ? { backgroundColor: cc.color, boxShadow: `0 10px 15px -3px ${cc.color}40` } : {}}>
                          {cc.icon_url ? <img src={cc.icon_url} className="w-6 h-6 object-contain" /> : <Ticket size={24} />}
                        </div>
                        <div className="flex-1">
                          <b className="text-sm font-black text-slate-800 block mb-0.5">{t.booking?.useCoupon || 'ใช้คูปอง'} {cc.name}</b>
                          <p className="text-[13px] text-slate-500 font-bold">{t.booking?.deduct || 'หัก'} {cc.quantity_required} {t.booking?.couponUnit || 'ใบ'}</p>
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
                      <b className="text-[16px] font-black text-slate-800 block mb-1">QR PromptPay</b>
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
                      <b className="text-[16px] font-black text-slate-800 block mb-1">Credit/Debit Card</b>
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
                      <b className="text-[16px] font-black text-slate-800 block mb-1">Wallet</b>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCourseModalOpen(false)} />
          {/* Widescreen frame — wider still on md/lg with a 16:9-ish landscape
              shape (instead of a tall portrait card) sized to roughly the
              page's normal content width, not full-screen. The Book Now bar
              below sits outside the scrolling content so it stays pinned to
              the bottom of the modal instead of scrolling away. */}
          <div className="relative z-10 bg-white rounded-[32px] w-[calc(100vw-40px)] max-w-sm md:max-w-2xl lg:max-w-4xl h-[calc(100vh-40px)] md:h-[85vh] md:max-h-[calc(100vh-80px)] overflow-hidden animate-in zoom-in-95 duration-300">
            <button onClick={() => setIsCourseModalOpen(false)} className="absolute top-4 right-4 z-20 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md">
              <X size={18} />
            </button>
            <div className="w-full h-full overflow-y-auto rounded-[32px] pb-24">
              {/* First section — priority order name > price > short description
                  > at-a-glance facts, poster shrunk down to the left instead of
                  a full-width hero image. */}
              <div className="p-7 flex gap-5">
                <div className="w-28 md:w-36 lg:w-40 shrink-0">
                  {selectedCourse.poster_images && selectedCourse.poster_images.length > 0 ? (
                    <PosterCarousel images={selectedCourse.poster_images} alt={selectedCourse.name} className="w-full" rounded="rounded-2xl" autoPlayMs={0} />
                  ) : getCourseView(selectedCourse, 'card').url ? (
                    <div className="w-full aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100">
                      <img src={getCourseView(selectedCourse, 'card').url} style={getCourseView(selectedCourse, 'card').style} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full aspect-[4/5] rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
                      <BookOpen size={28} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {selectedCourse.category_name && (
                    <span className={`inline-block text-[12px] font-black uppercase tracking-wide mb-1.5 ${selectedCourse.is_event ? 'text-mellow-purple' : selectedCourse.is_service ? 'text-mellow-blue' : selectedCourse.is_extraclass ? 'text-mellow-yellow-dark' : 'text-mellow-green-dark'}`}>
                      {selectedCourse.category_name}
                    </span>
                  )}
                  <h2 className="text-lg md:text-xl font-black text-slate-800 leading-tight mb-1.5">{selectedCourse.name}</h2>

                  {(() => {
                    const campaignDiscount = (selectedCourse as any).active_campaign_discount_amount || 0;
                    const priceAfterDiscount = Math.max(0, (selectedCourse.original_price || 0) - campaignDiscount);
                    const couponReq = getPrimaryCouponRequirement(selectedCourse, couponTypes);
                    return (
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2">
                        <span className="text-[20px] font-black text-mellow-red tracking-tight leading-none">
                          {selectedCourse.original_price ? `฿${priceAfterDiscount.toLocaleString()}` : (lang === 'en' ? 'Free' : 'ฟรี')}
                        </span>
                        {campaignDiscount > 0 && (
                          <span className="text-xs text-slate-400 font-bold line-through">฿{selectedCourse.original_price?.toLocaleString()}</span>
                        )}
                        {couponReq && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-500">
                            {lang === 'en' ? 'or' : 'หรือ'}
                            <span className="font-black text-slate-700">{couponReq.count}</span>
                            <Ticket size={12} style={{ color: couponReq.color }} />
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {(() => {
                    const short = stripHtml((selectedCourse as any).short_description || selectedCourse.description || '');
                    return short && (
                      <p className="text-[13px] text-slate-500 font-medium leading-snug line-clamp-2 mb-2.5">{short}</p>
                    );
                  })()}

                  {/* Quick facts — duration, location, age */}
                  <div className="flex flex-wrap gap-2">
                    {(selectedCourse as any).duration && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[14px] font-bold text-slate-600">
                        <Clock size={14} className="text-mellow-purple-dark shrink-0" />
                        {formatDuration((selectedCourse as any).duration, lang)}
                      </span>
                    )}
                    <a
                      href={selectedCourse.location_link || "https://www.google.com/maps/search/?api=1&query=Mellow+Play+Pattaya"}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[14px] font-bold text-slate-600"
                    >
                      <MapPin size={14} className="text-orange-500 shrink-0" />
                      {(selectedCourse.is_extraclass || selectedCourse.is_event) ? (selectedCourse.location || (lang === 'en' ? 'Pending Location' : 'รอยืนยันสถานที่')) : 'Mellow Play (Little Walk Pattaya)'}
                    </a>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-[14px] font-bold text-slate-600">
                      <Users size={14} className="text-mellow-blue-dark shrink-0" />
                      {selectedCourse.age_min}-{selectedCourse.age_max} {lang === 'en' ? 'yrs' : 'ปี'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-2 space-y-4">
                {/* Skills — same full, uncollapsed list as the course detail page,
                    skills only (never the internal "indicator"/ตัวชี้วัด entries). */}
                {(() => {
                  let achievementSkills: { th: string; en?: string; icon?: string }[] = [];
                  try { achievementSkills = (selectedCourse as any).achievement_skills_json ? JSON.parse((selectedCourse as any).achievement_skills_json) : []; } catch { /* ignore malformed json */ }
                  return achievementSkills.length > 0 && (
                    <div>
                      <h3 className="text-[14px] font-black text-slate-800 mb-2">
                        {lang === 'en' ? "Skills You'll Gain from This Class:" : 'ทักษะที่จะได้รับจากคลาสนี้:'}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {achievementSkills.map((skill, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mellow-purple/10 text-mellow-purple rounded-full text-[13px] font-bold">
                            <SkillIcon iconKey={skill.icon} size={12} />
                            {lang === 'en' && skill.en ? skill.en : skill.th}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {selectedCourse.description && (
                  <div>
                    <h3 className="text-[16px] font-black text-slate-800 mb-2">{lang === 'en' ? 'Class Description' : 'รายละเอียดคลาส'}</h3>
                    <div
                      className="prose-news whitespace-pre-wrap text-sm text-slate-600 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selectedCourse.description || '' }}
                    />
                  </div>
                )}

                {/* Upcoming Schedule — same section as CourseDetail.tsx, fetched
                    independently of the booking-flow's own branch-gated slots. */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-mellow-green-soft text-mellow-green-dark flex items-center justify-center">
                      <Calendar size={14} />
                    </div>
                    <h3 className="text-[16px] font-black text-slate-800">{lang === 'en' ? 'Upcoming Schedule' : 'รอบกิจกรรมที่กำลังจะมาถึง'}</h3>
                  </div>
                  {selectedCourse.calendar_id ? (
                    modalUpcomingSlots.length > 0 ? (
                      <div className="space-y-3">
                        {(modalShowAllSlots ? modalUpcomingSlots : modalUpcomingSlots.slice(0, 5)).map((day, i) => {
                          const displayDate = new Date(day.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
                          return (
                            <div key={i} className="py-2.5 border-b border-slate-100 last:border-0 last:pb-0">
                              <h4 className="text-[14px] font-bold text-slate-800 mb-2">{displayDate}</h4>
                              <div className="grid grid-cols-1 gap-2">
                                {day.slots.map((slot, j) => {
                                  const isFull = slot.available <= 0;
                                  return (
                                    <div key={j} className={`flex items-center justify-between p-2.5 rounded-xl border ${isFull ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
                                      <div className="flex items-center gap-2">
                                        <Clock size={14} className={isFull ? 'text-slate-400' : 'text-slate-600'} />
                                        <span className={`text-[14px] font-bold ${isFull ? 'text-slate-500' : 'text-slate-700'}`}>
                                          {slot.startTime} - {slot.endTime}
                                        </span>
                                      </div>
                                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[14px] font-black ${isFull ? 'bg-red-50 text-red-600' : 'bg-mellow-green-soft text-mellow-green-dark'}`}>
                                        {isFull ? (lang === 'en' ? 'Full' : 'เต็มแล้ว') : (
                                          <>{lang === 'en' ? `${slot.available} left` : `ว่าง ${slot.available}`}<Users size={12} strokeWidth={2.5} /></>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {modalUpcomingSlots.length > 5 && !modalShowAllSlots && (
                          <button
                            onClick={() => setModalShowAllSlots(true)}
                            className="w-full py-2.5 mt-1 flex items-center justify-center gap-2 text-[14px] font-bold text-mellow-blue bg-mellow-blue-soft/30 hover:bg-mellow-blue-soft rounded-xl transition-colors"
                          >
                            {lang === 'en' ? 'View more dates' : 'ดูรอบกิจกรรมเพิ่มเติม'}
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[14px] text-slate-400 font-bold">{lang === 'en' ? 'Pending schedule announcement' : 'รอประกาศตารางกิจกรรม'}</p>
                    )
                  ) : (
                    <p className="text-[14px] text-slate-400 font-bold">{lang === 'en' ? 'Please contact us for available times' : 'กรุณาติดต่อเจ้าหน้าที่เพื่อสอบถามรอบเวลา'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Persistent Book Now CTA — pinned to the bottom of the modal
                frame (outside the scrolling content) instead of a plain close
                button; same action as the course card's own "Book" button. */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-xl border-t border-slate-100">
              <button
                onClick={() => { setIsCourseModalOpen(false); goToChildStep(selectedCourse); }}
                className="w-full h-[52px] bg-mellow-ink text-white rounded-2xl font-black text-[16px] shadow-lg shadow-black/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                {lang === 'en' ? 'Book Now' : 'จองเลย'}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Action */}
      {!successBooking && currentStep === 'payment' && (
        <div className="fixed bottom-[84px] left-1/2 -translate-x-1/2 w-full max-w-sm md:max-w-md lg:max-w-lg px-5 animate-in slide-in-from-bottom-4 duration-300 z-40">
          <button disabled={isSubmitting} onClick={handleBookingSubmit} className="w-full h-[60px] bg-mellow-purple text-white rounded-2xl text-[16px] font-black uppercase tracking-widest shadow-xl shadow-mellow-purple/30 flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98] transition-all">
             {isFreeBooking
               ? bookActionLabel
               : (paymentMethod === 'coupon'
                 ? (t.booking?.confirmStamp || 'ยืนยันการจองด้วยคูปอง')
                 : (lang === 'en' ? `Pay ${totalPrice.toLocaleString()} ฿` : `ชำระ ${totalPrice.toLocaleString()} บาท`))}
          </button>
        </div>
      )}

      {/* Top Error Notification */}
      {errorMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-sm md:max-w-md lg:max-w-lg px-5 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
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

      {/* Guest Gate — same question-style pattern as CourseDetail.tsx,
          triggered here instead by the step advancing (covers both picking a
          course card and arriving via a preSelectedCourseId deep link).
          Framed as "have you signed up before?" with two equal paths rather
          than a single "go register" CTA, so booking reads as one continuous
          errand regardless of which path the parent is on. */}
      <ResponsiveModal
        isOpen={showGuestModal}
        onClose={() => { setShowGuestModal(false); setCurrentStepIndex(0); navigate('/booking', { replace: true }); }}
        variant="dialog"
        size="sm"
        className="text-center"
      >
            <img src={logo} alt="Mellow Play" className="h-9 mx-auto mb-4" />
            <h3 className="text-[20px] font-black text-slate-800 mb-2">
              {lang === 'en' ? 'Have you signed up with Mellow Play before?' : 'เคยเป็นสมาชิก Mellow Play ไหม?'}
            </h3>
            <p className="text-[15px] text-slate-500 font-medium mb-6">
              {lang === 'en'
                ? `Just one more step to book ${selectedCourse ? `"${selectedCourse.name}"` : 'this class'} — pick whichever applies to you.`
                : `อีกนิดเดียวก็จะจอง${selectedCourse ? `"${selectedCourse.name}"` : 'คลาสนี้'}ได้แล้ว เลือกข้อที่ตรงกับคุณได้เลย`}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowGuestModal(false);
                  const redirectTo = selectedCourse ? `/booking?courseId=${selectedCourse.id}` : '/booking';
                  navigate(`/register?redirect=${encodeURIComponent(redirectTo)}`);
                }}
                className="h-[48px] bg-mellow-ink text-white rounded-2xl font-bold text-[16px] shadow-lg shadow-black/10 active:scale-95 transition-transform"
              >
                {lang === 'en' ? 'Not yet — Sign up' : 'ยังไม่มี — สมัครเลย'}
              </button>
              <button
                onClick={() => {
                  setShowGuestModal(false);
                  const redirectTo = selectedCourse ? `/booking?courseId=${selectedCourse.id}` : '/booking';
                  navigate(`/login?redirect=${encodeURIComponent(redirectTo)}`);
                }}
                className="h-[48px] bg-slate-100 text-slate-700 rounded-2xl font-bold text-[16px] active:scale-95 transition-transform"
              >
                {lang === 'en' ? 'Yes — Login' : 'มีแล้ว — เข้าสู่ระบบ'}
              </button>
            </div>
            <button
              onClick={() => { setShowGuestModal(false); setCurrentStepIndex(0); navigate('/booking', { replace: true }); }}
              className="w-full mt-3 text-[14px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              {lang === 'en' ? 'Back' : 'ย้อนกลับ'}
            </button>
      </ResponsiveModal>

      {/* Promo Error Modal */}
      <ResponsiveModal isOpen={!!promoErrorModal} onClose={() => setPromoErrorModal('')} variant="dialog" size="sm" className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-5">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 text-center mb-2">ไม่สามารถใช้โค้ดได้</h3>
            <p className="text-sm text-slate-500 font-bold text-center mb-6">{promoErrorModal}</p>
            <button onClick={() => setPromoErrorModal('')} className="w-full py-4 bg-slate-100 text-slate-700 font-black rounded-2xl active:scale-95 transition-transform">
              ตกลง
            </button>
      </ResponsiveModal>

      {/* Duplicate Booking Error Modal */}
      <ResponsiveModal isOpen={!!duplicateError} onClose={() => setDuplicateError(null)} variant="dialog" size="sm">
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
              {duplicateError?.error_code === 'EXTRA_CLASS_LIMIT'
                ? (lang === 'en' ? 'Limit Exceeded' : 'ไม่สามารถจองได้')
                : duplicateError?.error_code === 'DUPLICATE_FAMILY_BOOKING'
                  ? (lang === 'en' ? 'Already Registered (Family)' : 'ครอบครัวนี้ลงทะเบียนไปแล้ว')
                  : (lang === 'en' ? 'Already Registered' : 'จองคลาสนี้ไปแล้ว')}
            </h3>
            <p className="text-[16px] font-medium text-slate-500 text-center mb-6 leading-relaxed">
              {duplicateError?.message}
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
      </ResponsiveModal>

    </div>
  );
};

export default Booking;
