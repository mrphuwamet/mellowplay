import React from 'react';
import { useChildStore } from '../store/useChildStore';
import { ChevronRight, FileText, Lock, Medal, Ticket, Calendar, MessageCircle, Facebook, User, AlertCircle, Loader2, MapPin, Clock, Crown, ArrowRightLeft, Cake, Pencil, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import AnimatedClouds from '../components/AnimatedClouds';
import CourseCard from '../components/CourseCard';
import ResponsiveModal from '../components/ResponsiveModal';
import { useCouponTypes } from '../hooks/useCouponTypes';
import AddChildModal from '../components/AddChildModal';
import AvatarPickerModal from '../components/AvatarPickerModal';
import BookingDetailModal from '../components/BookingDetailModal';
import ChildAvatar from '../components/ChildAvatar';
import BirthdayModal from '../components/BirthdayModal';
import CommunityPostComposer from '../components/CommunityPostComposer';
import CommunityPostCard from '../components/CommunityPostCard';
import FloatingPopover from '../components/FloatingPopover';
import logo from '../assets/ui/logo.svg';
import defaultAvatar from '../assets/ui/default-avatar.svg';
import apiClient from '../utils/apiClient';
import { useCourseBookingStatus } from '../hooks/useCourseBookingStatus';
import { BOOKING_STATUS_META } from '../utils/bookingStatus';
import { resolveImageUrl, getCourseView } from '../utils/courseImage';
import { isPremiumChild } from '../utils/membership';
import { stripHtml } from '../utils/stripHtml';
import { trackCourseView } from '../utils/analytics';

const COMMUNITY_PAGE_SIZE = 10;

const Home = () => {
  const { children, selectedChildId, isLoading: isStoreLoading, selectChild } = useChildStore();
  const navigate = useNavigate();
  const { t, lang, setLang } = useTranslation();
  const couponTypes = useCouponTypes();
  const [isAddChildOpen, setIsAddChildOpen] = React.useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = React.useState(false);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = React.useState(false);
  const [isBirthdayModalOpen, setIsBirthdayModalOpen] = React.useState(false);
  const [recommendedCourses, setRecommendedCourses] = React.useState<any[]>([]);
  const [recentHistory, setRecentHistory] = React.useState<any[]>([]);
  const [pendingBookings, setPendingBookings] = React.useState<any[]>([]);
  const [upcomingClasses, setUpcomingClasses] = React.useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = React.useState<any | null>(null);
  const [isCancelling, setIsCancelling] = React.useState<number | null>(null);
  const [cancelBookingId, setCancelBookingId] = React.useState<number | null>(null);
  const [isDataLoading, setIsDataLoading] = React.useState(true);
  const [communityPosts, setCommunityPosts] = React.useState<any[]>([]);
  const [communityLoading, setCommunityLoading] = React.useState(true);
  const [communityLoadingMore, setCommunityLoadingMore] = React.useState(false);
  const [communityHasMore, setCommunityHasMore] = React.useState(true);
  const communitySentinelRef = React.useRef<HTMLDivElement>(null);
  // Both read inside the IntersectionObserver's callback below without being
  // effect dependencies — see the comment on that effect for why.
  const communityPostsRef = React.useRef(communityPosts);
  communityPostsRef.current = communityPosts;
  const communityLoadingMoreRef = React.useRef(false);
  const [newsItems, setNewsItems] = React.useState<any[]>([]);
  const [ads, setAds] = React.useState<any[]>([]);

  // Tracks which card is currently snapped/most-visible in the right
  // sidebar's Recommended Classes row, so the rest can be blurred.
  const recommendedSidebarScrollRef = React.useRef<HTMLDivElement>(null);
  const [activeRecommendedSidebarId, setActiveRecommendedSidebarId] = React.useState<number | null>(null);

  React.useEffect(() => {
    const container = recommendedSidebarScrollRef.current;
    if (!container || recommendedCourses.length === 0) return;
    const cards = Array.from(container.querySelectorAll('[data-course-card-id]')) as HTMLElement[];
    if (cards.length === 0) return;

    setActiveRecommendedSidebarId(prev => prev ?? recommendedCourses[0].id);

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          ratios.set((entry.target as HTMLElement).dataset.courseCardId!, entry.intersectionRatio);
        });
        let bestId: string | null = null;
        let bestRatio = 0;
        ratios.forEach((ratio, id) => {
          if (ratio > bestRatio) { bestRatio = ratio; bestId = id; }
        });
        if (bestId) setActiveRecommendedSidebarId(Number(bestId));
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    cards.forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [recommendedCourses]);

  const isGuest = localStorage.getItem('mellow_guest') === 'true';
  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;

  // Sticky-shrinking composer — the full composer stays in normal flow;
  // once it scrolls out of view (tracked via IntersectionObserver against
  // the real viewport, so this works regardless of which ancestor is
  // actually the scrolling element at a given breakpoint), a compact bar
  // fades in pinned to the top of the feed. Clicking it opens a floating
  // popover (FloatingPopover, a portal-based floating panel) with a
  // second, independent composer instance anchored at the compact bar.
  // A callback ref instead of a plain useRef — the composer wrapper node
  // gets unmounted/remounted at least once (React 18 StrictMode's dev-only
  // mount→unmount→remount cycle, possibly also real conditional re-renders
  // elsewhere in this component), and a plain ref captured once in an
  // effect with a stale-by-then closure kept observing the OLD, detached
  // node forever — it never intersects anything again, permanently pinning
  // the compact bar "on". A callback ref re-fires on every attach/detach,
  // so the effect below always re-observes whichever node is current.
  const [fullComposerEl, setFullComposerEl] = React.useState<HTMLDivElement | null>(null);
  const fullComposerRef = React.useCallback((node: HTMLDivElement | null) => setFullComposerEl(node), []);
  const compactComposerBarRef = React.useRef<HTMLButtonElement>(null);
  const [isComposerScrolledPast, setIsComposerScrolledPast] = React.useState(false);
  const [isComposerPopoverOpen, setIsComposerPopoverOpen] = React.useState(false);

  React.useEffect(() => {
    if (!fullComposerEl || isGuest) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsComposerScrolledPast(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(fullComposerEl);
    return () => observer.disconnect();
  }, [fullComposerEl, isGuest]);

  const selectedChild = children.find(c => c.id === selectedChildId);

  // Dummy data for guest mode
  const guestChild = {
    id: 'guest',
    name: t.common.guestMode,
    avatar: '',
    level: 1,
    hd_type: 'The Builder',
    nickname: undefined as string | undefined,
    dob: undefined as string | undefined,
    coupons: undefined as any[] | undefined,
  };

  const currentChild = isGuest ? guestChild : selectedChild;
  const isPremium = isPremiumChild(currentChild);
  const { statusMap: courseBookingStatus, isLoading: isBookingStatusLoading } = useCourseBookingStatus(user?.id, currentChild?.id);

  // A one-time (non-repeatable) course the child already took/booked has
  // nothing left to "recommend" — CourseCard would just render it disabled
  // anyway, so drop it before it ever reaches the recommended carousel or
  // the feed's mixed-in course suggestions instead of cluttering both with
  // cards nobody can act on. Repeatable courses still surface normally.
  const visibleRecommendedCourses = React.useMemo(
    () => recommendedCourses.filter((c: any) => !(courseBookingStatus[c.id] && !c.allow_repeat)),
    [recommendedCourses, courseBookingStatus]
  );

  // Real, persisted like/comment state for the feed's course-recommendation
  // cards (Course_Likes/Course_Comments) — kept at this level rather than
  // inside renderFeedInsertCard since that's a plain render function, not a
  // component, so it can't hold its own hooks.
  const [courseEngagement, setCourseEngagement] = React.useState<Record<number, { likeCount: number; commentCount: number; isLiked: boolean }>>({});
  const [openCommentsCourseId, setOpenCommentsCourseId] = React.useState<number | null>(null);
  const [courseComments, setCourseComments] = React.useState<Record<number, any[] | undefined>>({});
  const [commentDraft, setCommentDraft] = React.useState('');
  const [commentSubmitting, setCommentSubmitting] = React.useState(false);

  React.useEffect(() => {
    const courseIds = visibleRecommendedCourses.slice(0, 6).map((c: any) => c.id);
    if (courseIds.length === 0) return;
    apiClient.get('/courses/engagement', { params: { ids: courseIds.join(',') } })
      .then(res => { if (res.data.success) setCourseEngagement(res.data.engagement || {}); })
      .catch(() => {});
  }, [visibleRecommendedCourses]);

  const handleToggleCourseLike = async (courseId: number) => {
    if (isGuest || !user?.id) { navigate('/login'); return; }
    const current = courseEngagement[courseId] || { likeCount: 0, commentCount: 0, isLiked: false };
    const optimistic = { ...current, isLiked: !current.isLiked, likeCount: current.likeCount + (current.isLiked ? -1 : 1) };
    setCourseEngagement(prev => ({ ...prev, [courseId]: optimistic }));
    try {
      await apiClient.post(`/courses/${courseId}/like`);
    } catch {
      setCourseEngagement(prev => ({ ...prev, [courseId]: current }));
    }
  };

  const loadCourseComments = async (courseId: number) => {
    if (openCommentsCourseId === courseId) { setOpenCommentsCourseId(null); return; }
    setOpenCommentsCourseId(courseId);
    setCommentDraft('');
    if (courseComments[courseId] !== undefined) return;
    try {
      const res = await apiClient.get(`/courses/${courseId}/comments`);
      setCourseComments(prev => ({ ...prev, [courseId]: res.data.success ? res.data.comments : [] }));
    } catch {
      setCourseComments(prev => ({ ...prev, [courseId]: [] }));
    }
  };

  const handleSubmitCourseComment = async (courseId: number) => {
    if (!commentDraft.trim()) return;
    if (isGuest || !user?.id) { navigate('/login'); return; }
    setCommentSubmitting(true);
    try {
      await apiClient.post(`/courses/${courseId}/comments`, { comment: commentDraft.trim() });
      setCommentDraft('');
      const res = await apiClient.get(`/courses/${courseId}/comments`);
      if (res.data.success) setCourseComments(prev => ({ ...prev, [courseId]: res.data.comments }));
      setCourseEngagement(prev => {
        const current = prev[courseId] || { likeCount: 0, commentCount: 0, isLiked: false };
        return { ...prev, [courseId]: { ...current, commentCount: current.commentCount + 1 } };
      });
    } catch {
      /* keep typed text so the user can retry */
    } finally {
      setCommentSubmitting(false);
    }
  };

  React.useEffect(() => {
    const fetchData = async () => {
      setIsDataLoading(true);
      try {
        const coursesReq = apiClient.get('/admin/courses');
        const historyReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/history?userId=${user.id}`) : Promise.resolve({ data: { success: false } });
        const pendingReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/pending?userId=${user.id}`) : Promise.resolve({ data: { success: false } });
        const upcomingReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/upcoming?userId=${user.id}`) : Promise.resolve({ data: { success: false } });

        const [coursesRes, historyRes, pendingRes, upcomingRes] = await Promise.all([coursesReq, historyReq, pendingReq, upcomingReq]);

        if (coursesRes.data.success) {
          const recommended = coursesRes.data.courses.filter((c: any) => c.is_recommended === 1 || c.is_recommended === true);
          // Courses the child has never taken surface before ones they've
          // already completed, so "recommended" doesn't just repeat history.
          const takenIds = new Set(
            historyRes.data.success
              ? (currentChild ? historyRes.data.bookings.filter((b: any) => b.child_id === currentChild.id) : historyRes.data.bookings).map((b: any) => b.course_id)
              : []
          );
          const sortedRecommended = [...recommended].sort((a: any, b: any) => Number(takenIds.has(a.id)) - Number(takenIds.has(b.id)));
          setRecommendedCourses(sortedRecommended);
        }

        if (historyRes.data.success) {
          const bookings = currentChild ? historyRes.data.bookings.filter((b: any) => b.child_id === currentChild.id) : historyRes.data.bookings;
          const sorted = [...bookings].sort((a: any, b: any) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
          setRecentHistory(sorted.slice(0, 5));
        }

        if (pendingRes.data.success) {
          const bookings = pendingRes.data.bookings || [];
          setPendingBookings(currentChild ? bookings.filter((b: any) => b.child_id === currentChild.id) : bookings);
        }

        if (upcomingRes.data.success) {
          // Unlike history/pending above, upcoming classes span ALL of the
          // parent's children at once (not filtered to currentChild) — the
          // API (getUpcomingBookings) is already parent-scoped and each
          // booking carries its own child_nickname/child_avatar, which the
          // card badge below uses to show whose class it is.
          setUpcomingClasses(upcomingRes.data.bookings || []);
        }
      } catch (err) {
        console.error('Failed to fetch home data:', err);
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchData();
  }, [currentChild?.id, isGuest]);

  React.useEffect(() => {
    apiClient.get('/community/posts', { params: { limit: COMMUNITY_PAGE_SIZE, offset: 0 } })
      .then(res => {
        if (res.data.success) {
          setCommunityPosts(res.data.posts);
          setCommunityHasMore(res.data.posts.length === COMMUNITY_PAGE_SIZE);
        }
      })
      .catch(() => {})
      .finally(() => setCommunityLoading(false));
  }, []);

  // Feed of Stories has no real posts yet for most families — pulling in a
  // few random courses/news items (same data Explore already shows) keeps
  // it from reading as dead/empty in the meantime.
  React.useEffect(() => {
    apiClient.get('/news-feed')
      .then(res => { if (res.data.success) setNewsItems(res.data.items || []); })
      .catch(() => {});
  }, []);

  // CRM-authored promo cards (a class/news article the business wants to
  // push) — mixed into the feed the same way as course/news suggestions,
  // just labeled "โฆษณา" instead of "คลาสแนะนำ"/"จากหน้าสำรวจ". Also shown as
  // a separate rotating widget in the right sidebar (renderAdsSidebar below)
  // — an additional placement, not a replacement for the feed one.
  React.useEffect(() => {
    apiClient.get('/ads/active')
      .then(res => { if (res.data.success) setAds(res.data.ads || []); })
      .catch(() => {});
  }, []);

  const [adSidebarIndex, setAdSidebarIndex] = React.useState(0);
  React.useEffect(() => {
    if (ads.length <= 1) return;
    const id = setInterval(() => setAdSidebarIndex(prev => (prev + 1) % ads.length), 5000);
    return () => clearInterval(id);
  }, [ads.length]);

  // Feed inserts — mobile no longer has fixed Upcoming/Recommended/History
  // sections above the feed; their content instead blends into the feed
  // itself alongside Explore/news suggestions, matching how a real social
  // feed mixes content instead of stacking separate labeled sections.
  const feedInserts = React.useMemo(() => {
    const courseItems = visibleRecommendedCourses.slice(0, 6).map((c: any) => ({
      kind: 'course' as const, id: c.id, title: c.name, image: c.thumbnail_url, course: c,
    }));
    const newsAsItems = newsItems.slice(0, 10).map((n: any) => ({
      kind: 'news' as const, id: n.id, title: (lang === 'en' && n.title_en) ? n.title_en : n.title, image: n.image_url, newsType: n.type,
    }));
    const historyItems = recentHistory.slice(0, 3).map((b: any) => ({
      kind: 'history' as const, id: b.id, title: b.course_name || (lang === 'en' ? 'Class' : 'คลาสเรียน'), image: undefined, booking: b,
    }));
    const adItems = ads.map((a: any) => ({
      kind: 'ad' as const, id: a.id, title: a.caption || a.targetTitle || a.title, image: a.imageUrl,
      adTargetType: a.targetType, adTargetId: a.targetId,
    }));
    // 'upcoming' bookings no longer get randomly mixed in here — they're
    // now always pinned first (mobile: renderUpcomingClassesMobile, desktop:
    // the sidebar), so including them here too would just show the same
    // booking twice.
    const combined = [...courseItems, ...historyItems, ...newsAsItems, ...adItems];
    return [...combined].sort(() => Math.random() - 0.5).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRecommendedCourses, newsItems.length, upcomingClasses.length, recentHistory.length, ads.length, lang]);

  const renderFeedInsertCard = (item: { kind: 'course' | 'news' | 'upcoming' | 'history' | 'ad'; id: number; title: string; image?: string; newsType?: string; booking?: any; adTargetType?: 'course' | 'news'; adTargetId?: number; course?: any }) => {
    const isBookingCard = item.kind === 'upcoming' || item.kind === 'history';
    const handleClick = () => {
      if (isBookingCard) { setSelectedBooking(item.booking); return; }
      if (item.kind === 'ad') {
        apiClient.post(`/ads/${item.id}/click`).catch(() => {});
        navigate(item.adTargetType === 'course' ? `/class/${item.adTargetId}` : `/news/${item.adTargetId}`);
        return;
      }
      navigate(item.kind === 'course' ? `/class/${item.id}` : `/news/${item.id}`);
    };
    const eyebrow = item.kind === 'course' ? (lang === 'en' ? 'Suggested Class' : 'คลาสแนะนำ')
      : item.kind === 'upcoming' ? (lang === 'en' ? 'Upcoming Activity' : 'กิจกรรมที่กำลังจะมาถึง')
      : item.kind === 'history' ? (lang === 'en' ? 'Recent Class' : 'ประวัติการเรียน')
      : item.kind === 'ad' ? (lang === 'en' ? 'Sponsored' : 'โฆษณา')
      : (lang === 'en' ? 'From Explore' : 'จากหน้าสำรวจ');
    const ctaLabel = item.kind === 'course' ? (lang === 'en' ? 'View class' : 'ดูรายละเอียดคลาส')
      : item.kind === 'ad' ? (lang === 'en' ? 'Learn more' : 'ดูเพิ่มเติม')
      : isBookingCard ? (lang === 'en' ? 'View booking' : 'ดูรายละเอียดการจอง')
      : (lang === 'en' ? 'Read more' : 'อ่านต่อ');
    const statusMeta = isBookingCard && item.booking?.status ? BOOKING_STATUS_META[item.booking.status] : undefined;

    // Same one-time-booked check CourseCard/CourseDetail use — a recommended
    // course card gets a real "จองเลย" button, so it has to respect the same
    // "already taken and non-repeatable" gate they do instead of always
    // linking to a booking flow that would just reject it.
    const course = item.course;
    // The 'card' view is the same curated focal point/zoom every other card
    // placement (CourseCard, Explore) uses — without this the feed showed
    // the raw thumbnail's center crop instead of whatever staff configured.
    const courseView = item.kind === 'course' && course ? getCourseView(course, 'card') : null;
    const shortDescription = item.kind === 'course' && course
      ? (course.short_description || stripHtml(course.description || ''))
      : undefined;
    const bookingStatus = item.kind === 'course' && course ? courseBookingStatus[course.id] : undefined;
    const isOneTimeBooked = !!bookingStatus && !course?.allow_repeat;
    const bookLabel = isOneTimeBooked
      ? (bookingStatus === 'upcoming' ? (lang === 'en' ? 'Registered' : 'ลงทะเบียนแล้ว') : (lang === 'en' ? 'Already Taken' : 'เคยเรียนแล้ว'))
      // "จอง" (book) for a class/service, "ลงทะเบียน" (register) for an
      // event — matches the booking flow's own header wording per type
      // (จองคลาสเรียน/จองบริการ vs ลงทะเบียนกิจกรรม).
      : (course?.is_event ? (lang === 'en' ? 'Register Now' : 'ลงทะเบียนเลย') : (lang === 'en' ? 'Book Now' : 'จองเลย'));
    const handleBook = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isOneTimeBooked || !course) return;
      trackCourseView(course.id);
      navigate(`/booking?courseId=${course.id}`);
    };

    // Styled to read as a post FROM Mellow Play in the feed (same card
    // shell/header/footer rhythm as CommunityPostCard) instead of the old
    // compact horizontal thumbnail strip, which visually clashed with real
    // posts around it.
    return (
      <div
        key={`insert-${item.kind}-${item.id}`}
        onClick={handleClick}
        className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 cursor-pointer active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-mellow-purple/10 flex items-center justify-center shrink-0 overflow-hidden">
            {isBookingCard ? <Calendar size={18} className="text-mellow-purple" /> : <img src={logo} alt="" className="w-5 h-5 object-contain" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black text-slate-800 leading-tight truncate">Mellow Play</p>
            <p className="text-[12px] text-mellow-purple font-black uppercase tracking-widest">{eyebrow}</p>
          </div>
          {statusMeta && (
            <span className={`shrink-0 px-2 py-1 rounded-full text-[11px] font-black ${statusMeta.bg} ${statusMeta.fg}`}>
              {lang === 'en' ? statusMeta.en : statusMeta.th}
            </span>
          )}
        </div>

        <h4 className="text-[16px] font-black text-slate-800 leading-snug mt-3 line-clamp-2">{item.title}</h4>
        {shortDescription && (
          <p className="text-[14px] text-slate-500 leading-snug mt-1 line-clamp-2">{shortDescription}</p>
        )}
        {isBookingCard && item.booking?.scheduled_at && (
          <p className="text-[13px] text-slate-400 font-bold mt-0.5">
            {new Date(item.booking.scheduled_at).toLocaleDateString()}
            {item.kind === 'upcoming' && children.length > 1 && item.booking?.child_nickname && ` · ${item.booking.child_nickname}`}
          </p>
        )}

        {item.image ? (
          <div className="mt-3 rounded-2xl overflow-hidden bg-slate-50">
            <img
              src={courseView ? courseView.url : resolveImageUrl(item.image)}
              alt={item.title}
              loading="lazy"
              style={courseView?.style}
              className="w-full max-h-[260px] object-cover"
            />
          </div>
        ) : !isBookingCard && (
          <div className="mt-3 rounded-2xl bg-slate-50 aspect-[16/9] flex items-center justify-center">
            <img src={logo} alt="" className="w-16 h-16 object-contain opacity-20 filter grayscale" />
          </div>
        )}

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100">
          <button onClick={handleClick} className="flex items-center gap-1.5 text-mellow-purple active:scale-95 transition-transform">
            <span className="text-sm font-black">{ctaLabel}</span>
            <ChevronRight size={16} />
          </button>
          {item.kind === 'course' && (
            <button
              onClick={handleBook}
              disabled={isOneTimeBooked}
              className={`ml-auto px-4 py-2 rounded-xl text-[14px] font-black active:scale-95 transition-transform ${
                isOneTimeBooked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-mellow-purple text-white'
              }`}
            >
              {bookLabel}
            </button>
          )}
        </div>

        {item.kind === 'course' && (() => {
          const engagement = courseEngagement[course.id] || { likeCount: 0, commentCount: 0, isLiked: false };
          const commentsForCourse = courseComments[course.id];
          const commentsAreOpen = openCommentsCourseId === course.id;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => handleToggleCourseLike(course.id)} className="flex items-center gap-1.5 active:scale-95 transition-transform">
                  <Heart size={18} className={engagement.isLiked ? 'text-red-500' : 'text-slate-400'} fill={engagement.isLiked ? 'currentColor' : 'none'} />
                  <span className="text-sm font-black text-slate-600">{engagement.likeCount}</span>
                </button>
                <button onClick={() => loadCourseComments(course.id)} className="flex items-center gap-1.5 active:scale-95 transition-transform">
                  <MessageCircle size={18} className="text-slate-400" />
                  <span className="text-sm font-black text-slate-600">{engagement.commentCount}</span>
                </button>
              </div>

              {commentsAreOpen && (
                <div className="mt-3 space-y-3">
                  {commentsForCourse === undefined ? (
                    <div className="flex justify-center py-3">
                      <div className="w-5 h-5 border-2 border-slate-200 border-t-mellow-purple rounded-full animate-spin" />
                    </div>
                  ) : commentsForCourse.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs font-bold py-2">
                      {lang === 'en' ? 'No comments yet — be the first!' : 'ยังไม่มีคอมเมนท์ เป็นคนแรกเลย!'}
                    </p>
                  ) : commentsForCourse.map((c: any) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {c.avatar_url ? (
                          <img src={resolveImageUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[12px] font-black text-slate-400">{c.display_name?.[0] || '?'}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 bg-slate-50 rounded-2xl px-3 py-2">
                        <p className="text-[13px] font-black text-slate-700">{c.display_name}</p>
                        <p className="text-[14px] text-slate-600 leading-snug whitespace-pre-wrap">{c.comment_text}</p>
                      </div>
                    </div>
                  ))}

                  {!isGuest && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={commentDraft}
                        onChange={e => setCommentDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !commentSubmitting) handleSubmitCourseComment(course.id); }}
                        placeholder={lang === 'en' ? 'Write a comment...' : 'แสดงความคิดเห็น...'}
                        className="flex-1 min-w-0 px-3.5 py-2 bg-slate-50 rounded-full text-[14px] font-medium focus:outline-none"
                      />
                      <button
                        onClick={() => handleSubmitCourseComment(course.id)}
                        disabled={commentSubmitting || !commentDraft.trim()}
                        className="shrink-0 w-9 h-9 rounded-full bg-mellow-purple text-white flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  React.useEffect(() => {
    if (!communityHasMore || communityLoading) return;
    const el = communitySentinelRef.current;
    if (!el) return;
    // communityLoadingMore/communityPosts.length are deliberately NOT deps —
    // both used to be, which meant every completed fetch (loadingMore
    // false→true→false) recreated this observer. A freshly-created
    // IntersectionObserver always fires its callback once immediately with
    // the CURRENT intersection state, and on a short/sparse feed the
    // sentinel is still within the 400px rootMargin right after appending a
    // page — so each fetch's completion immediately triggered the next one,
    // an unthrottled loop that only stopped once real posts ran out. Reading
    // both through refs keeps the callback's guard/offset fresh without
    // tearing down and rebuilding the observer on every page load.
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !communityLoadingMoreRef.current) {
        communityLoadingMoreRef.current = true;
        setCommunityLoadingMore(true);
        apiClient.get('/community/posts', { params: { limit: COMMUNITY_PAGE_SIZE, offset: communityPostsRef.current.length } })
          .then(res => {
            if (res.data.success) {
              setCommunityPosts(prev => [...prev, ...res.data.posts]);
              setCommunityHasMore(res.data.posts.length === COMMUNITY_PAGE_SIZE);
            }
          })
          .catch(() => {})
          .finally(() => {
            communityLoadingMoreRef.current = false;
            setCommunityLoadingMore(false);
          });
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [communityHasMore, communityLoading]);

  const handleCommunityPostCreated = (post: any) => {
    setCommunityPosts(prev => [post, ...prev]);
  };
  const handleCommunityPostUpdate = (postId: number, patch: Record<string, any>) => {
    setCommunityPosts(prev => prev.map(p => p.id === postId ? { ...p, ...patch } : p));
  };
  const handleCommunityPostDeleted = (postId: number) => {
    setCommunityPosts(prev => prev.filter(p => p.id !== postId));
  };

  if (isStoreLoading && children.length === 0 && !isGuest) {
    // Skeleton instead of a spinner — mirrors the feed's real shape
    // (composer + post cards) so the page doesn't visually "reset" once
    // the real content pops in.
    return (
      <div className="mellow-page min-h-screen px-5 pt-5 md:max-w-[640px] lg:max-w-[820px] md:mx-auto">
        <div className="h-8 w-32 bg-slate-200/70 rounded-full animate-pulse mb-6 lg:hidden" />
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 animate-pulse mb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 shrink-0" />
            <div className="flex-1 h-11 bg-slate-50 rounded-2xl" />
          </div>
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 animate-pulse mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 bg-slate-100 rounded-full" />
                <div className="h-2.5 w-1/4 bg-slate-100 rounded-full" />
              </div>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full mb-2" />
            <div className="h-3 w-2/3 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  const renderLockedOverlay = (message: string, actionLabel: string, action: () => void) => (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px] rounded-[24px] p-4 text-center">
      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg mb-3">
        <Lock size={20} className="text-mellow-purple" />
      </div>
      <p className="text-[15px] font-black text-mellow-ink uppercase tracking-tight mb-3 px-4">{message}</p>
      <button
        onClick={action}
        className="px-4 py-2 bg-mellow-purple text-white text-[15px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-all"
      >
        {actionLabel}
      </button>
      {/* Someone already registered but browsing as a guest (logged out)
          needs a way back in too — not everyone hitting this wall is new. */}
      <button
        onClick={() => navigate('/login')}
        className="mt-2 text-[13px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
      >
        {lang === 'en' ? 'Already have an account? Login' : 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ'}
      </button>
    </div>
  );

  const calculateAge = (dobStr?: string) => {
    if (!dobStr) return '';
    const diff = Date.now() - new Date(dobStr).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const renderProfileSwitcherModal = () => (
    <ResponsiveModal isOpen={isProfileSwitcherOpen} onClose={() => setIsProfileSwitcherOpen(false)} variant="dialog" size="xs">
        <h3 className="text-lg font-black text-slate-800 text-center mb-4 uppercase tracking-wider">{lang === 'en' ? 'Switch Profile' : 'สลับโปรไฟล์'}</h3>
        <div className="flex flex-col gap-3">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => { selectChild(child.id); setIsProfileSwitcherOpen(false); }}
              className={`flex items-center gap-4 p-3 rounded-2xl transition-all ${selectedChildId === child.id ? 'bg-mellow-purple/10 border border-mellow-purple/30' : 'hover:bg-slate-50 border border-transparent'}`}
            >
              <ChildAvatar avatarType={child.avatar} className="w-12 h-12 flex-shrink-0" />
              <div className="flex flex-col items-start text-left">
                <span className="text-[17px] font-bold text-slate-700 leading-tight">
                  {child.nickname || child.name}
                </span>
                {child.nickname && (
                  <span className="text-[14px] font-medium text-slate-500">
                    {child.name}
                  </span>
                )}
              </div>
            </button>
          ))}
          <button
            onClick={() => { setIsProfileSwitcherOpen(false); setIsAddChildOpen(true); }}
            className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 border border-dashed border-slate-300 transition-all text-slate-500 hover:text-slate-700"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <span className="text-2xl font-black">+</span>
            </div>
            <span className="text-[17px] font-bold">{lang === 'en' ? 'Add New' : 'เพิ่มโปรไฟล์ใหม่'}</span>
          </button>
        </div>
    </ResponsiveModal>
  );

  const confirmCancelBooking = async () => {
    if (!cancelBookingId) return;
    setIsCancelling(cancelBookingId);
    try {
      const res = await apiClient.post(`/profiles/bookings/${cancelBookingId}/cancel`, { userId: user?.id });
      if (res.data.success) {
        setPendingBookings(prev => prev.filter(b => b.id !== cancelBookingId));
      }
    } catch (err) {
      console.error('Failed to cancel booking:', err);
    }
    setIsCancelling(null);
    setCancelBookingId(null);
  };

  // Extracted so the same markup can render twice — once inline for the
  // mobile/tablet-portrait single-column flow (wrapped `lg:hidden`), once in
  // the new `lg:`+ right sidebar (wrapped `hidden lg:...`) — mirroring this
  // file's existing "duplicate element, toggle visibility per breakpoint"
  // pattern already used for the logo.
  // Compact horizontal-slide variant for the right sidebar — the sidebar
  // column is a fixed height, so a tall vertical list would either overflow
  // (forcing an internal scrollbar that cuts a card off mid-way, which reads
  // as "broken") or get clipped. Sliding sideways instead keeps every card
  // fully visible; same data/cards as renderUpcomingClasses, just laid out
  // as a snap-scrolling row instead of a vertical stack.
  const renderUpcomingClassesSidebar = () => (
    <div>
      <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest">
        {lang === 'en' ? 'Upcoming Activities' : 'กิจกรรมที่กำลังจะมาถึง'}
      </h3>

      {isDataLoading ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {[0, 1].map(i => (
            <div key={i} className="shrink-0 w-[240px] min-h-[260px] bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col animate-pulse">
              <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 mb-3" />
              <div className="h-3.5 w-4/5 bg-slate-100 rounded-full mb-2" />
              <div className="h-2.5 w-3/5 bg-slate-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : upcomingClasses.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1 [mask-image:linear-gradient(to_right,black_85%,transparent_100%)]">
          {upcomingClasses.map(booking => (
            <div
              key={booking.id}
              onClick={() => setSelectedBooking(booking)}
              className="shrink-0 w-[240px] min-h-[260px] snap-start bg-white rounded-2xl p-3 shadow-sm border border-slate-100 relative hover:z-10 cursor-pointer hover:shadow-md transition-all active:scale-[0.98] flex flex-col"
            >
              <div className="relative mb-3">
                {booking.course_thumbnail ? (
                  <img src={booking.course_thumbnail} alt={booking.course_name} loading="lazy" className="w-full aspect-[4/3] rounded-xl object-cover" />
                ) : (
                  <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 flex items-center justify-center">
                    <Calendar size={28} className="text-slate-400" />
                  </div>
                )}
                {/* Whose class this is — only needed once there's more than
                    one child to disambiguate, since this list now spans all
                    of the parent's children instead of just the selected one. */}
                {children.length > 1 && booking.child_nickname && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full pl-0.5 pr-2 py-0.5 shadow-sm">
                    <ChildAvatar avatarType={booking.child_avatar} className="w-5 h-5" />
                    <span className="text-[11px] font-black text-slate-700">{booking.child_nickname}</span>
                  </div>
                )}
              </div>
              <h4 className="font-bold text-slate-800 text-[14px] line-clamp-2">{booking.course_name}</h4>
              <p className="text-[12px] font-medium text-slate-500 mt-1.5">
                {new Date(booking.scheduled_at).toLocaleDateString()}
                <br />
                {new Date(booking.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="flex items-center gap-1 mt-auto pt-2">
                <MapPin size={11} className="text-mellow-purple shrink-0" />
                <span className="text-[11px] font-medium text-slate-500 truncate">{booking.branch_name}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/60 backdrop-blur-sm rounded-[24px] p-5 min-h-[130px] flex flex-col items-center justify-center text-center border border-white/80 shadow-sm">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-2">
            <Calendar size={18} className="text-blue-400" />
          </div>
          <p className="text-[14px] font-bold text-slate-600">
            {lang === 'en' ? 'No upcoming activities' : 'ยังไม่มีกิจกรรมที่จะถึง'}
          </p>
        </div>
      )}
    </div>
  );

  // Mobile/tablet gets its own prominent, pinned-first version instead of
  // just being one of several kinds randomly mixed into feedInserts below —
  // an actual upcoming class is time-sensitive in a way a course suggestion
  // or old history entry isn't, so it needs to be seen first, not stumbled
  // into a few scrolls down. Desktop already has this via the right sidebar
  // (renderUpcomingClassesSidebar), so this is lg:hidden.
  const getCountdownLabel = (scheduledAt: string) => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date(scheduledAt)) - startOfDay(new Date())) / 86400000);
    if (diffDays <= 0) return lang === 'en' ? 'Today' : 'วันนี้';
    if (diffDays === 1) return lang === 'en' ? 'Tomorrow' : 'พรุ่งนี้';
    return lang === 'en' ? `In ${diffDays} days` : `อีก ${diffDays} วัน`;
  };
  const renderUpcomingClassesMobile = () => {
    if (isDataLoading || upcomingClasses.length === 0) return null;
    return (
      <div className="lg:hidden mb-5">
        <div
          className={`flex gap-3 pb-1 ${upcomingClasses.length > 1 ? 'overflow-x-auto scrollbar-hide snap-x snap-mandatory [mask-image:linear-gradient(to_right,black_92%,transparent_100%)]' : ''}`}
        >
          {upcomingClasses.map(booking => {
            const dt = new Date(booking.scheduled_at);
            const hasValidDate = !isNaN(dt.getTime());
            return (
              <div
                key={booking.id}
                onClick={() => setSelectedBooking(booking)}
                className={`shrink-0 ${upcomingClasses.length > 1 ? 'w-[280px] snap-center' : 'w-full'} rounded-3xl overflow-hidden shadow-lg border-2 border-mellow-purple/30 bg-white cursor-pointer active:scale-[0.98] transition-transform`}
              >
                <div className="h-1.5 bg-gradient-to-r from-mellow-purple to-mellow-blue" />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded-full text-[12px] font-black uppercase tracking-widest bg-mellow-purple text-white shrink-0">
                      {hasValidDate ? getCountdownLabel(booking.scheduled_at) : (lang === 'en' ? 'Upcoming' : 'กำลังจะถึง')}
                    </span>
                    {children.length > 1 && booking.child_nickname && (
                      <div className="flex items-center gap-1 bg-slate-50 rounded-full pl-0.5 pr-2 py-0.5 min-w-0">
                        <ChildAvatar avatarType={booking.child_avatar} className="w-5 h-5 shrink-0" />
                        <span className="text-[11px] font-black text-slate-700 truncate">{booking.child_nickname}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-14 h-14 rounded-2xl bg-mellow-purple/10 flex flex-col items-center justify-center">
                      <span className="text-[11px] font-black text-mellow-purple uppercase leading-none">
                        {hasValidDate ? dt.toLocaleDateString(lang === 'en' ? 'en-US' : 'th-TH', { month: 'short' }) : '-'}
                      </span>
                      <span className="text-[20px] font-black text-mellow-purple leading-none mt-1">
                        {hasValidDate ? dt.getDate() : '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-black text-slate-800 text-[15px] leading-tight line-clamp-2">{booking.course_name}</h4>
                      <p className="text-[13px] font-bold text-slate-500 mt-1">
                        {hasValidDate ? `${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} น.` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRecentHistorySidebar = () => (
    <div>
      <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest">{t.home.latestClass || 'ประวัติการเรียนล่าสุด'}</h3>
      <div className="relative">
        {isGuest && renderLockedOverlay(
          t.home.joinToSeeSkills,
          t.home.registerBtn,
          () => navigate('/register')
        )}
        <div className={isGuest ? 'blur-[2px]' : ''}>
          {isDataLoading ? (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
              {[0, 1].map(i => (
                <div key={i} className="shrink-0 w-[240px] min-h-[260px] bg-white rounded-2xl border border-slate-100 p-4 flex flex-col animate-pulse">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 mb-3" />
                  <div className="h-3 w-4/5 bg-slate-100 rounded-full mb-2" />
                  <div className="h-2.5 w-3/5 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : recentHistory.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1 [mask-image:linear-gradient(to_right,black_85%,transparent_100%)]">
              {recentHistory.map((item, i) => {
                const itemDate = new Date(item.scheduled_at);
                const dateLocale = lang === 'en' ? 'en-US' : 'th-TH';
                return (
                  <button
                    key={item.id ?? i}
                    onClick={() => setSelectedBooking(item)}
                    className="shrink-0 w-[240px] min-h-[260px] snap-start bg-white rounded-2xl border border-slate-100 p-4 relative hover:z-10 flex flex-col text-left active:scale-[0.98] transition-transform shadow-sm hover:shadow-md"
                  >
                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-mellow-blue/10 shrink-0">
                      <span className="text-[9px] font-black uppercase leading-none text-mellow-blue">
                        {itemDate.toLocaleDateString(dateLocale, { month: 'short' })}
                      </span>
                      <span className="text-lg font-black leading-tight text-mellow-blue">
                        {itemDate.getDate()}
                      </span>
                    </div>
                    <h4 className="font-black text-[14px] text-slate-800 leading-tight mt-3 line-clamp-2">{item.course_name || 'คลาสเรียน'}</h4>
                    {BOOKING_STATUS_META[item.status] && (
                      <span className={`self-start mt-2 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${BOOKING_STATUS_META[item.status].bg} ${BOOKING_STATUS_META[item.status].fg}`}>
                        {lang === 'en' ? BOOKING_STATUS_META[item.status].en : BOOKING_STATUS_META[item.status].th}
                      </span>
                    )}
                    <p className="text-[11px] text-slate-500 font-bold mt-auto pt-2 truncate">{item.branch_name}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-white/85 border border-white rounded-[24px] p-5 min-h-[260px] flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-2">
                <Medal size={18} />
              </div>
              <p className="text-[13px] font-bold text-slate-500">ยังไม่มีประวัติการเรียน</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Sidebar variant — same cards, no bleed-to-viewport-edge padding trick
  // (the aside has no ambient horizontal padding to cancel out). Nudge
  // buttons scroll recommendedSidebarScrollRef directly (not via
  // useHorizontalCarousel — that hook's own ref belongs to the mobile-flow
  // carousel) since a plain mouse (no trackpad/touch) can't drag-scroll an
  // overflow-x-auto div at all.
  const scrollRecommendedSidebar = (dir: 'left' | 'right') => {
    recommendedSidebarScrollRef.current?.scrollBy({ left: dir === 'left' ? -260 : 260, behavior: 'smooth' });
  };
  const renderRecommendedClassesSidebar = () => (
    (isDataLoading || isBookingStatusLoading) ? (
      <div>
        <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest">{lang === 'en' ? 'Recommended Classes' : 'คลาสแนะนำ'}</h3>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {[0, 1].map(i => (
            <div key={i} className="flex-shrink-0 w-[240px] bg-white p-3 rounded-3xl shadow-sm border border-slate-100 animate-pulse">
              <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 mb-3" />
              <div className="h-3.5 w-3/4 bg-slate-100 rounded-full mb-2" />
              <div className="h-2.5 w-full bg-slate-100 rounded-full mb-1" />
            </div>
          ))}
        </div>
      </div>
    ) : visibleRecommendedCourses.length > 0 ? (
      <div>
        <div className="flex justify-between items-center mb-3 gap-2">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">{lang === 'en' ? 'Recommended Classes' : 'คลาสแนะนำ'}</h3>
          <div className="flex items-center gap-2 shrink-0">
            {visibleRecommendedCourses.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => scrollRecommendedSidebar('left')}
                  aria-label={lang === 'en' ? 'Scroll left' : 'เลื่อนซ้าย'}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 active:scale-90 transition-all"
                >
                  <ChevronRight size={13} className="rotate-180" />
                </button>
                <button
                  onClick={() => scrollRecommendedSidebar('right')}
                  aria-label={lang === 'en' ? 'Scroll right' : 'เลื่อนขวา'}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 active:scale-90 transition-all"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
            <button onClick={() => navigate('/booking')} className="flex items-center gap-1 text-mellow-purple text-[13px] font-bold active:scale-95 transition-transform shrink-0">
              {lang === 'en' ? 'View All' : 'ดูทั้งหมด'}
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
        <div
          ref={recommendedSidebarScrollRef}
          className="flex items-stretch gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1 [mask-image:linear-gradient(to_right,black_85%,transparent_100%)]"
        >
          {visibleRecommendedCourses.map((course) => (
            <div
              key={course.id}
              data-course-card-id={course.id}
              className={`snap-center transition-all duration-300 ${
                activeRecommendedSidebarId !== null && activeRecommendedSidebarId !== course.id ? 'blur-[1.5px] opacity-50 scale-[0.96]' : ''
              }`}
            >
              <CourseCard course={course} bookingStatus={courseBookingStatus[course.id]} lang={lang} childCoupons={!isGuest ? currentChild?.coupons : undefined} couponTypes={couponTypes} />
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  // Rotating ad widget for the right sidebar — auto-advances every 5s
  // (adSidebarIndex/timer declared near the ads fetch above), click still
  // goes through the same tracking endpoint the feed-mixed-in ad cards use.
  const renderAdsSidebar = () => {
    if (ads.length === 0) return null;
    const ad = ads[adSidebarIndex % ads.length];
    const handleAdClick = () => {
      apiClient.post(`/ads/${ad.id}/click`).catch(() => {});
      navigate(ad.targetType === 'course' ? `/class/${ad.targetId}` : `/news/${ad.targetId}`);
    };
    return (
      <div>
        <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest">
          {lang === 'en' ? 'Sponsored' : 'โฆษณา'}
        </h3>
        <div
          onClick={handleAdClick}
          className="relative rounded-2xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer active:scale-[0.98] transition-transform bg-white aspect-[4/3]"
        >
          {ad.imageUrl ? (
            <img src={resolveImageUrl(ad.imageUrl)} alt={ad.title || ''} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              <img src={logo} alt="" className="w-10 h-10 object-contain opacity-30 filter grayscale" />
            </div>
          )}
          {(ad.caption || ad.targetTitle) && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="text-white text-[13px] font-bold line-clamp-2">{ad.caption || ad.targetTitle}</p>
            </div>
          )}
        </div>
        {ads.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {ads.map((_, i) => (
              <button
                key={i}
                onClick={() => setAdSidebarIndex(i)}
                aria-label={`${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === adSidebarIndex ? 'w-5 bg-mellow-purple' : 'w-1.5 bg-slate-200'}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-200 via-blue-100 to-cyan-50 pb-28 lg:pb-0 relative overflow-hidden lg:flex lg:flex-col lg:h-screen">
      {isProfileSwitcherOpen && renderProfileSwitcherModal()}
      {/* Background (sky gradient + clouds) bleeds the full width of
          whatever space AppShell gives this page (i.e. everything right of
          the left nav sidebar) — only the actual content below is capped to
          a comfortable reading/dashboard width and centered within that. */}
      <AnimatedClouds />

      {/* At lg:+, the feed area and the right sidebar are split into their
          own flex row spanning the full width AppShell gives this page — the
          right sidebar is sized to match the left nav sidebar (240px) and
          stays flush against the true right edge, instead of being confined
          inside the feed's own max-width column (which would leave a gap on
          very wide screens once the feed hit its xl:max-w cap). */}
      <div className="lg:flex lg:flex-1 lg:min-h-0">
      <div className="lg:flex-1 lg:min-w-0 lg:flex lg:flex-col lg:min-h-0">
      <div className="max-w-[430px] mx-auto md:max-w-[680px] lg:max-w-[900px] xl:max-w-[1100px] lg:flex lg:flex-col lg:flex-1 lg:min-h-0 lg:mx-auto lg:w-full">
      {/* At lg:+ both the logo (below) and the pill (sign-up/booking/
          language, also covered by the sidebar) are hidden, so the header
          itself collapses to nothing there instead of reserving a visibly
          empty strip of unused space above the feed. */}
      <header className="px-5 pt-5 pb-4 lg:hidden relative z-30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 px-4 py-3">
            <img src={logo} alt="Mellow Play" className="h-8" />
          </div>

          {/* md:+ the left sidebar already covers sign-up/login (profile
              card + Menu), Booking, and the language toggle, so this whole
              pill is mobile-only to avoid duplicating all three. */}
          <div className="relative z-30 md:hidden">
            <div className="flex items-center gap-2 rounded-[28px] border border-white/40 bg-white/55 backdrop-blur-xl shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] p-2">
              {isGuest && (
                <button
                  onClick={() => navigate('/register')}
                  className="px-3 py-2 bg-mellow-purple/10 rounded-full text-[15px] font-black text-mellow-purple uppercase tracking-wider"
                >
                  {t.common.signUp}
                </button>
              )}

              <button
                onClick={() => navigate('/booking')}
                className="flex items-center gap-1.5 h-10 px-3 rounded-full bg-slate-100 text-orange-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] border border-slate-200 active:scale-95 transition-all"
              >
                <Calendar size={16} />
                <span className="text-[14px] font-black whitespace-nowrap">{lang === 'en' ? 'Book Class' : 'จองคลาส'}</span>
              </button>
              <LanguageToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="px-5 pb-6 lg:pb-0 relative z-10 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
        {/* At lg:+, this whole feed scrolls independently of the left nav
            sidebar and the right sidebar (a separate sibling column now,
            outside this max-width wrapper — see below); below lg: it's
            inert and everything renders in its original stacked order,
            unchanged. */}
        <div className="lg:h-full lg:overflow-y-auto">
        {/* Profile/quick-access/upcoming-classes section stays at a reading
            width even on wide screens — the recommended-classes carousel
            below uses the full page width instead, so it can show more
            cards per row as the viewport widens. */}
        <div className="md:max-w-[640px] lg:max-w-none md:mx-auto">
        {/* md:+ this is already covered by the profile card in AppShell's
            left sidebar (icon-only at md:, full detail at lg:), so it's
            mobile-only here to avoid showing the same identity twice. */}
        <div className="md:hidden rounded-[32px] p-6 mb-6 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.5)] relative overflow-hidden border border-white/60 bg-white/75 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/35 to-sky-100/80" />

          {/* Top Right Actions */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            {isGuest ? (
              <div className="bg-mellow-purple text-white px-3 py-1 text-[13px] font-black uppercase rounded-xl">
                {t.common.guestMode}
              </div>
            ) : (
              children.length > 1 && (
                <button
                  onClick={() => setIsProfileSwitcherOpen(true)}
                  className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all active:scale-95"
                >
                  <ArrowRightLeft size={16} />
                </button>
              )
            )}
          </div>

          {/* Parent-centric: the parent's own identity is primary here
              (avatar + name, tapping goes to their profile settings); the
              currently-selected child is a secondary chip underneath —
              tapping it opens the switcher (or Add Child if there isn't
              one yet), same as the old avatar button used to. */}
          <div className="relative z-10 flex items-center gap-4 mt-2">
            <div className="flex-shrink-0">
              {isGuest ? (
                <div className="w-20 h-20 rounded-[28px] bg-slate-200 flex items-center justify-center shadow-lg ring-4 ring-white/60 overflow-hidden">
                  <img src={defaultAvatar} alt="Guest" className="w-12 h-12 opacity-60 grayscale brightness-50" />
                </div>
              ) : (
                <button
                  onClick={() => navigate('/settings/profile')}
                  className="relative block transition-transform active:scale-95"
                >
                  <div className="w-20 h-20 rounded-[28px] overflow-hidden shadow-lg ring-4 ring-white/60 bg-slate-200 flex items-center justify-center">
                    {user?.avatarUrl ? (
                      <img src={resolveImageUrl(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={32} className="text-slate-400" />
                    )}
                  </div>
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black uppercase text-slate-400 mb-1">
                {t.home.greeting}
              </p>
              {isGuest ? (
                <button onClick={() => navigate('/login')} className="block text-[22px] leading-none font-black text-mellow-purple underline decoration-2 underline-offset-4 mb-2">
                  {lang === 'en' ? 'Login' : 'เข้าสู่ระบบ'}
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="block text-[18px] leading-tight font-black text-slate-800 truncate">
                    {user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || (lang === 'en' ? 'Parent' : 'ผู้ปกครอง')}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => currentChild ? setIsProfileSwitcherOpen(true) : setIsAddChildOpen(true)}
                      className="flex items-center gap-1.5 self-start active:opacity-70 transition-opacity"
                    >
                      {currentChild ? (
                        <>
                          <ChildAvatar avatarType={currentChild.avatar} className="w-6 h-6" />
                          <span className="text-[14px] font-bold text-slate-500">{currentChild.nickname || currentChild.name}</span>
                        </>
                      ) : (
                        <span className="text-[14px] font-black text-mellow-purple underline decoration-2 underline-offset-2">
                          {lang === 'th' ? '+ เพิ่มข้อมูลเด็ก' : '+ Add My Child'}
                        </span>
                      )}
                    </button>
                    {currentChild && (
                      <button
                        onClick={() => setIsAvatarPickerOpen(true)}
                        className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
                      >
                        <Pencil size={10} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>

                  {currentChild && (
                    <div className="flex flex-wrap items-center gap-2">
                      {currentChild.dob && (
                        <button
                          onClick={() => setIsBirthdayModalOpen(true)}
                          className="inline-flex items-center gap-1 text-[12px] font-black bg-sky-100 text-sky-600 px-2.5 py-1 rounded-full shadow-sm active:scale-95 transition-transform"
                        >
                          <Cake size={12} strokeWidth={2.5} />
                          {calculateAge(currentChild.dob)} {lang === 'en' ? 'yrs' : (Number(calculateAge(currentChild.dob)) < 15 ? 'ขวบ' : 'ปี')}
                        </button>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[12px] font-black px-2.5 py-1 rounded-full shadow-sm ${
                        isPremium
                          ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white'
                          : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {isPremium ? <Crown size={12} strokeWidth={2.5} /> : <Medal size={12} strokeWidth={2.5} />}
                        {isPremium ? 'Premium' : 'Regular'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {pendingBookings.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-700 mb-3 px-2 uppercase tracking-widest">
              {lang === 'en' ? 'Pending Approval' : 'รอการอนุมัติ'}
            </h3>
            <div className="space-y-3">
              {pendingBookings.map(booking => (
                <div key={booking.id} className="bg-white/80 border border-white p-4 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <p className="font-bold text-sm text-slate-800">{booking.course_name}</p>
                    <p className="text-xs text-slate-500">{new Date(booking.scheduled_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => setCancelBookingId(booking.id)}
                    className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg"
                  >
                    {lang === 'en' ? 'Cancel' : 'ยกเลิก'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>

        <div className="md:max-w-[640px] lg:max-w-[820px] md:mx-auto mt-8 lg:mt-0 px-5 md:px-0">
          <h3 className="text-sm font-black text-slate-700 mb-4 px-2 md:px-0 uppercase tracking-widest">
            {lang === 'en' ? 'Story Feed' : 'ฟีดเรื่องราว'}
          </h3>

          {renderUpcomingClassesMobile()}

          {isGuest ? (
            <div className="mellow-card bg-white/85 border border-white p-6 text-center shadow-sm">
              <p className="text-[15px] font-black text-slate-600 mb-3">
                {lang === 'en' ? 'Log in to post and join the conversation' : 'เข้าสู่ระบบเพื่อโพสต์และร่วมพูดคุยในฟีดเรื่องราว'}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => navigate('/register')}
                  className="px-4 py-2 bg-mellow-purple text-white text-[15px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                >
                  {t.home.registerBtn}
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 bg-slate-100 text-slate-600 text-[15px] font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all"
                >
                  {t.common.login}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Compact bar — zero-height/invisible until the full composer
                  below scrolls out of view, then fades in pinned to the top
                  of the feed's scroll area (sticky resolves against
                  whichever ancestor is actually scrolling at this
                  breakpoint, so this needs no per-breakpoint JS). */}
              <div
                className={`sticky top-0 z-20 transition-all duration-300 overflow-hidden ${
                  isComposerScrolledPast ? 'max-h-20 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0 pointer-events-none'
                }`}
              >
                <button
                  ref={compactComposerBarRef}
                  onClick={() => setIsComposerPopoverOpen(true)}
                  className="w-full flex items-center gap-3 bg-white/80 backdrop-blur-xl border border-slate-100 rounded-2xl px-4 py-2.5 shadow-sm opacity-70 hover:opacity-100 transition-opacity text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {user?.avatarUrl ? (
                      <img src={resolveImageUrl(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-black text-slate-400">{(user?.displayName || user?.firstName)?.[0] || '?'}</span>
                    )}
                  </div>
                  <span className="text-[14px] font-medium text-slate-400 flex-1 truncate">
                    {lang === 'en' ? 'Share your story...' : 'แชร์เรื่องราวของคุณ...'}
                  </span>
                </button>
              </div>

              <div className="mb-4" ref={fullComposerRef}>
                <CommunityPostComposer onPostCreated={handleCommunityPostCreated} />
              </div>

              <FloatingPopover isOpen={isComposerPopoverOpen} onClose={() => setIsComposerPopoverOpen(false)} anchorRef={compactComposerBarRef} width={420}>
                <CommunityPostComposer
                  onPostCreated={(post) => {
                    handleCommunityPostCreated(post);
                    setIsComposerPopoverOpen(false);
                  }}
                />
              </FloatingPopover>
            </>
          )}

          <div className="flex flex-col gap-4 mt-4">
            {communityLoading ? (
              [0, 1].map(i => (
                <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 bg-slate-100 rounded-full" />
                      <div className="h-2.5 w-1/4 bg-slate-100 rounded-full" />
                    </div>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full mb-2" />
                  <div className="h-3 w-2/3 bg-slate-100 rounded-full" />
                </div>
              ))
            ) : communityPosts.length === 0 ? (
              <>
                {feedInserts.map(renderFeedInsertCard)}
              </>
            ) : (
              (() => {
                // A blended insert (upcoming/recommended/history/explore)
                // every 2 real posts so the feed never reads as dead, and so
                // that content the old fixed sections used to carry still
                // surfaces without crowding out actual posts.
                const items: React.ReactNode[] = [];
                let insertIdx = 0;
                communityPosts.forEach((post, i) => {
                  items.push(
                    <CommunityPostCard
                      key={post.id}
                      post={post}
                      onUpdate={handleCommunityPostUpdate}
                      onDeleted={handleCommunityPostDeleted}
                    />
                  );
                  if ((i + 1) % 2 === 0 && insertIdx < feedInserts.length) {
                    items.push(renderFeedInsertCard(feedInserts[insertIdx++]));
                  }
                });
                return items;
              })()
            )}

            {communityHasMore && !communityLoading && (
              <div ref={communitySentinelRef}>
                {communityLoadingMore && (
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 animate-pulse mt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/3 bg-slate-100 rounded-full" />
                        <div className="h-2.5 w-1/4 bg-slate-100 rounded-full" />
                      </div>
                    </div>
                    <div className="h-3 w-full bg-slate-100 rounded-full mb-2" />
                    <div className="h-3 w-2/3 bg-slate-100 rounded-full" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </main>
      </div>
      </div>

      {/* Right sidebar — a sibling of the feed area (not nested inside its
          max-width column), sized to match the left nav sidebar and flush
          against the true right edge regardless of how wide the feed's own
          column gets. Scrolls independently of both the feed and the left
          sidebar. */}
      {/* bg-white/50 dims the animated clouds specifically behind this
          sidebar (they're a shared full-width background layer) without
          touching their opacity in the feed area, which wasn't complained
          about. */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[300px] xl:w-[320px] lg:shrink-0 lg:gap-6 lg:h-full lg:overflow-y-auto lg:px-4 lg:py-8 lg:bg-white/50 lg:relative lg:z-10">
        {renderUpcomingClassesSidebar()}
        {renderRecommendedClassesSidebar()}
        {renderAdsSidebar()}
        {renderRecentHistorySidebar()}
      </aside>
      </div>

      <AddChildModal
        isOpen={isAddChildOpen}
        onClose={() => setIsAddChildOpen(false)}
      />

      <AvatarPickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        currentAvatar={currentChild?.avatar || ''}
        childId={typeof currentChild?.id === 'number' ? currentChild.id : undefined}
        customPhotoUrl={!isGuest ? (currentChild as any)?.customPhotoUrl : undefined}
        onSelect={async (avatarId: string) => {
          if (!currentChild || currentChild.id === 'guest' || typeof currentChild.id !== 'number') return;
          const { updateAvatar } = useChildStore.getState();
          await updateAvatar(currentChild.id, avatarId);
        }}
        onPhotoUploaded={(url) => {
          if (!currentChild || currentChild.id === 'guest' || typeof currentChild.id !== 'number') return;
          useChildStore.getState().setCustomPhotoUrl(currentChild.id, url);
        }}
        onDeletePhoto={async () => {
          if (!currentChild || currentChild.id === 'guest' || typeof currentChild.id !== 'number') return;
          await useChildStore.getState().deletePhoto(currentChild.id);
        }}
      />

      {selectedBooking && (
        <BookingDetailModal
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          booking={selectedBooking}
        />
      )}

      {currentChild?.dob && (
        <BirthdayModal
          isOpen={isBirthdayModalOpen}
          onClose={() => setIsBirthdayModalOpen(false)}
          name={currentChild.nickname || currentChild.name}
          dob={currentChild.dob}
        />
      )}

      <ResponsiveModal isOpen={!!cancelBookingId} onClose={() => !isCancelling && setCancelBookingId(null)} variant="dialog" size="xs" className="text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{lang === 'en' ? 'Cancel Booking' : 'ยกเลิกการจอง'}</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">
              {lang === 'en' ? 'Are you sure you want to cancel this booking?' : 'คุณแน่ใจหรือไม่ที่จะยกเลิกการจองนี้?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelBookingId(null)}
                disabled={isCancelling === cancelBookingId}
                className="flex-1 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
              >
                {lang === 'en' ? 'No, Keep it' : 'ไม่, กลับไป'}
              </button>
              <button
                onClick={() => confirmCancelBooking()}
                disabled={isCancelling === cancelBookingId}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {isCancelling === cancelBookingId ? <Loader2 size={16} className="animate-spin" /> : (lang === 'en' ? 'Yes, Cancel' : 'ใช่, ยกเลิก')}
              </button>
            </div>
      </ResponsiveModal>
    </div>
  );
};

export default Home;
