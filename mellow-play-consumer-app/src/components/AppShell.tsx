import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Map, Star, Camera, Compass, CalendarDays, Newspaper as HomeIcon, Lock, User, Users, Calendar, Heart, Ticket, Settings as SettingsIcon, ArrowRightLeft, Cake, MessageCircle, ChevronDown, ChevronRight, LayoutGrid, X, LogOut, Globe, Pencil } from 'lucide-react';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import { useChildStore } from '../store/useChildStore';
import GuestUnlockModal from './GuestUnlockModal';
import ChildAvatar from './ChildAvatar';
import ResponsiveModal from './ResponsiveModal';
import AddChildModal from './AddChildModal';
import EditChildModal from './EditChildModal';
import BirthdayModal from './BirthdayModal';
import { resolveImageUrl } from '../utils/courseImage';
import { FAMILY_ROLE_OPTIONS, normalizeFamilyRole } from '../utils/familyRoles';
import logo from '../assets/ui/logo.svg';

// A soft pastel per family role so the sidebar's "who is this" badge reads
// at a glance instead of every role blurring into one same-color pill.
const ROLE_BADGE_COLORS: Record<string, string> = {
  father: 'bg-sky-100 text-sky-600',
  mother: 'bg-rose-100 text-rose-600',
  child: 'bg-mellow-purple/10 text-mellow-purple',
  uncle: 'bg-amber-100 text-amber-600',
  aunt: 'bg-amber-100 text-amber-600',
  na: 'bg-teal-100 text-teal-600',
  aa: 'bg-teal-100 text-teal-600',
  grandfather_paternal: 'bg-indigo-100 text-indigo-600',
  grandfather_maternal: 'bg-indigo-100 text-indigo-600',
  grandmother_paternal: 'bg-orange-100 text-orange-600',
  grandmother_maternal: 'bg-orange-100 text-orange-600',
  other: 'bg-slate-100 text-slate-500',
};

const NAV_PATHS = ['/', '/journey', '/album', '/explore', '/rewards'];
// Only genuine pre-login/onboarding screens keep the old centered-card,
// no-sidebar treatment — every other route (Booking, CourseDetail,
// SettingsProfile, MyCoupons, NewsDetail, etc.) now keeps the persistent
// left sidebar too, matching the 5 tab pages, instead of switching to a
// completely different shell.
const AUTH_FLOW_PATHS = ['/login', '/register', '/forgot-password'];

interface AppShellProps {
  children: React.ReactNode;
}

// Wraps every route. Below `md:` this renders byte-identical to the original
// single-phone-column app (every new class here is md:/lg:-prefixed, so it's
// inert at mobile widths). At `md:` and up, every page except the pre-login
// auth flow gets the persistent left sidebar; the 5 tab pages additionally
// get the mobile bottom bar, and everything else keeps its own existing
// mobile layout unchanged (no bottom bar was ever added there).
const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, lang, setLang } = useTranslation();
  const { children: kids, selectedChildId, selectChild } = useChildStore();
  const isGuest = localStorage.getItem('mellow_guest') === 'true';
  const isAuthFlow = AUTH_FLOW_PATHS.includes(location.pathname);
  const showBottomNav = NAV_PATHS.includes(location.pathname);
  // The feed lays itself out as a full-height row — a scrolling column beside a
  // scrolling sidebar — so at lg: it owns its own scrolling. Letting the shell
  // scroll as well puts a second bar at the far right of the window, past the
  // sidebar, scrolling the two columns together.
  const ownsScrolling = location.pathname === '/';
  const [lockedNavFeature, setLockedNavFeature] = React.useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isBookingMenuOpen, setIsBookingMenuOpen] = React.useState(false);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = React.useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = React.useState(false);
  const [isEditChildOpen, setIsEditChildOpen] = React.useState(false);
  const [editingChild, setEditingChild] = React.useState<any>(null);
  const [isBirthdayModalOpen, setIsBirthdayModalOpen] = React.useState(false);
  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;

  const selectedChild = kids.find(c => c.id === selectedChildId);

  const calculateAge = (dobStr?: string) => {
    if (!dobStr) return '';
    const diff = Date.now() - new Date(dobStr).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const guardedNav = (e: React.MouseEvent, label: string) => {
    if (isGuest) {
      e.preventDefault();
      setLockedNavFeature(label);
    }
  };

  if (isAuthFlow) {
    // The frame's own max-width varies by page (a narrow auth card vs. a
    // wide reading/dashboard page) — as a flex item with no width of its
    // own it would otherwise shrink-wrap to content and never reach
    // whichever page-width class's cap actually applies, regardless of
    // that class's max-width. md:w-full forces it to a definite width the
    // .mellow-shell-frame:has(...) rules in index.css can then cap
    // correctly based on which width class the page inside actually uses.
    // Login specifically is capped to a fixed height with no internal
    // scroll at all (requested directly) — Register/ForgotPassword keep
    // the scroll-if-needed behavior since their longer forms haven't been
    // checked against a hard viewport cap.
    const isLoginPage = location.pathname === '/login';
    return (
      <div className="min-h-screen md:flex md:items-center md:justify-center md:bg-[#f4f2ee]">
        <div className={`mellow-shell-frame max-w-[430px] mx-auto md:max-w-none md:w-full min-h-screen md:min-h-0 relative shadow-2xl md:rounded-[32px] md:my-10 overflow-hidden bg-[#fbfaf7] ${isLoginPage ? 'h-screen md:h-[calc(100vh-80px)]' : 'md:max-h-[92vh] md:overflow-y-auto'}`}>
          {children}
        </div>
      </div>
    );
  }

  // Ordered per request so the mobile menu grid reads, 4 tiles per row:
  //   row 1: สำรวจ > ฟีดข่าว > รู้จักลูกของฉัน > เส้นทาง
  //   row 2: คลาส > กิจกรรม > บริการอื่นๆ > กิจกรรมที่จะมาถึง
  //   row 3: อัลบั้ม > รางวัล > คูปองของฉัน > ติดต่อเรา
  // The desktop sidebar renders these same two arrays vertically (with the
  // booking trio between them), so both surfaces stay in one order.
  // Booking is rendered separately below (a คลาส / กิจกรรม / บริการอื่นๆ
  // sub-menu at lg:, a plain link at md:) instead of living in this array.
  // `menuLabel` is a mobile-grid-only override — the one place a label needs
  // its own line-break (กิจกรรม\nที่จะมาถึง); the sidebar keeps `label`.
  const beforeBookingItems: { to: string; Icon: typeof HomeIcon; label: string; menuLabel?: string; color: string; guarded: boolean; comingSoon?: boolean }[] = [
    { to: '/explore', Icon: Compass, label: t.nav.explore, color: 'text-mellow-yellow', guarded: false },
    { to: '/', Icon: HomeIcon, label: t.nav.home, color: 'text-mellow-red', guarded: false },
    { to: '/know-my-child', Icon: Heart, label: t.home.quickAccess.knowMyChild, color: 'text-mellow-red', guarded: false, comingSoon: true },
    { to: '/journey', Icon: Map, label: t.nav.journey, color: 'text-mellow-purple', guarded: true },
  ];
  const afterBookingItems: { to: string; Icon: typeof HomeIcon; label: string; menuLabel?: string; color: string; guarded: boolean; comingSoon?: boolean }[] = [
    { to: '/upcoming', Icon: CalendarDays, label: lang === 'en' ? 'Upcoming' : 'กิจกรรมที่จะมาถึง', menuLabel: lang === 'en' ? 'Upcoming' : 'กิจกรรม\nที่จะมาถึง', color: 'text-orange-500', guarded: true },
    { to: '/album', Icon: Camera, label: t.nav.album, color: 'text-mellow-blue', guarded: true },
    { to: '/rewards', Icon: Star, label: t.nav.rewards, color: 'text-mellow-green', guarded: true },
    { to: '/my-coupons', Icon: Ticket, label: t.home.quickAccess.myCoupons, color: 'text-pink-500', guarded: true },
    { to: '/contact', Icon: MessageCircle, label: t.home.quickAccess.contactUs, color: 'text-teal-500', guarded: false },
  ];

  // forceLabel: the desktop rail only shows labels from lg: up (md: is
  // icon-only); the mobile drawer below reuses this same renderer but
  // always has room for labels regardless of viewport, so it passes true
  // to skip that lg:-gated hiding.
  const renderSidebarLink = ({ to, Icon, label, color, guarded, comingSoon }: typeof beforeBookingItems[number], forceLabel = false, onNavigate?: () => void) => {
    const active = !comingSoon && location.pathname === to;
    return (
      <Link
        key={to}
        to={comingSoon ? location.pathname : to}
        onClick={(e) => {
          if (comingSoon) { e.preventDefault(); return; }
          if (guarded) { guardedNav(e, label); if (isGuest) return; }
          onNavigate?.();
        }}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors relative ${
          comingSoon ? 'text-slate-300 cursor-default' : active ? `${color} bg-black/[0.03]` : 'text-slate-400 hover:bg-black/[0.03]'
        }`}
      >
        <div className="relative shrink-0">
          <Icon size={22} />
          {guarded && isGuest && (
            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center">
              <Lock size={9} className="text-slate-600" strokeWidth={3} />
            </div>
          )}
        </div>
        <span className={`${forceLabel ? '' : 'hidden lg:inline'} text-[15px] font-black tracking-tight`}>{label}</span>
      </Link>
    );
  };

  const renderProfileSwitcherModal = () => (
    <ResponsiveModal isOpen={isProfileSwitcherOpen} onClose={() => setIsProfileSwitcherOpen(false)} variant="dialog" size="lg">
      <h3 className="text-xl font-black text-slate-800 text-center mb-5 uppercase tracking-wider">{lang === 'en' ? 'Family Members' : 'สมาชิกในครอบครัว'}</h3>
      <div className="flex flex-col gap-3">
        {/* The account holder themselves — display-only, just here so the
            modal really shows everyone the family-member count promises.
            Their own info is edited from Settings, not from here. */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50">
          <div className="w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-white shadow-sm bg-slate-200 flex items-center justify-center shrink-0">
            {user?.avatarUrl ? (
              <img src={resolveImageUrl(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={24} className="text-slate-400" />
            )}
          </div>
          <div className="flex flex-col items-start text-left min-w-0">
            <span className="text-[19px] font-bold text-slate-700 leading-tight truncate">
              {user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || (lang === 'en' ? 'Parent' : 'ผู้ปกครอง')}
            </span>
            <span className="text-[13px] font-black text-mellow-purple uppercase tracking-wide">
              {lang === 'en' ? 'Main Account' : 'บัญชีหลัก'}
            </span>
          </div>
        </div>

        {/* Every field (name, nickname, dob, gender, role) is editable here —
            tapping a member opens their full edit form, not just the avatar
            picker; the pencil next to it is only a shortcut straight to the
            photo. Tapping no longer changes which profile is "active"
            elsewhere in the app (Booking/Journey pick their own person via
            their own filters now) — this is purely a family directory. */}
        {kids.map(child => {
          const { role, customText } = normalizeFamilyRole(child.relation);
          const roleOption = FAMILY_ROLE_OPTIONS.find(o => o.value === role);
          const roleLabel = customText || (roleOption ? (lang === 'en' ? roleOption.labelEn : roleOption.labelTh) : '');
          const age = child.dob ? calculateAge(child.dob) : null;
          return (
            <button
              key={child.id}
              onClick={() => {
                setEditingChild({
                  id: child.id,
                  name: child.name,
                  nameEn: child.nameEn || '',
                  nickname: child.nickname || '',
                  dob: child.dob || '',
                  relation: child.relation || 'Child',
                  gender: child.gender || '',
                  avatar: child.avatar,
                  customPhotoUrl: child.customPhotoUrl,
                });
                setIsEditChildOpen(true);
                setIsProfileSwitcherOpen(false);
              }}
              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 border border-transparent transition-all text-left w-full"
            >
              <ChildAvatar avatarType={child.avatar} className="w-14 h-14 flex-shrink-0" />
              <div className="flex flex-col items-start text-left min-w-0 flex-1">
                <span className="text-[19px] font-bold text-slate-700 leading-tight truncate">{child.nickname || child.name}</span>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {child.relation && (
                    <span className={`inline-flex items-center gap-1 text-[12px] font-black px-2.5 py-1 rounded-full ${ROLE_BADGE_COLORS[role] || ROLE_BADGE_COLORS.other}`}>
                      {roleOption && <roleOption.icon size={11} strokeWidth={2.5} />}
                      {roleLabel}
                    </span>
                  )}
                  {age != null && role === 'child' && (
                    <span className="inline-flex items-center gap-1 text-[12px] font-black bg-sky-100 text-sky-600 px-2.5 py-1 rounded-full">
                      <Cake size={11} strokeWidth={2.5} />
                      {age} {lang === 'en' ? 'yrs' : (Number(age) < 15 ? 'ขวบ' : 'ปี')}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        <button
          onClick={() => { setIsProfileSwitcherOpen(false); isGuest ? setLockedNavFeature('เพิ่มสมาชิกในครอบครัว') : setIsAddChildOpen(true); }}
          className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 border border-dashed border-slate-300 transition-all text-slate-500 hover:text-slate-700"
        >
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <span className="text-2xl font-black">+</span>
          </div>
          <span className="text-[19px] font-bold">{lang === 'en' ? 'Add Member' : 'เพิ่มสมาชิก'}</span>
        </button>
      </div>
    </ResponsiveModal>
  );

  // Mobile menu — below md: there's no persistent sidebar at all (only the
  // 5-tab bottom bar), so everything the desktop sidebar carries (Booking,
  // Know My Child, My Coupons, Contact Us, Settings...) was only reachable
  // via a deep link. This surfaces that same content as a bottom sheet
  // (ResponsiveModal's existing "sheet" variant — reads like the footer
  // growing taller) with every item laid out as an icon+label grid tile
  // instead of a tall list, so it fits within the sheet's max-height.
  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const mobileMenuTiles: (typeof beforeBookingItems[number])[] = [
    ...beforeBookingItems,
    { to: '/booking', Icon: Calendar, label: lang === 'en' ? 'Classes' : 'คลาส', color: 'text-orange-500', guarded: false },
    { to: '/booking?type=event', Icon: Calendar, label: lang === 'en' ? 'Events' : 'กิจกรรม', color: 'text-orange-500', guarded: false },
    { to: '/booking?type=service', Icon: Calendar, label: lang === 'en' ? 'Other Services' : 'บริการอื่นๆ', color: 'text-orange-500', guarded: false },
    ...afterBookingItems,
  ];

  const renderMobileMenuTile = ({ to, Icon, label, menuLabel, color, guarded, comingSoon }: typeof mobileMenuTiles[number]) => {
    const active = !comingSoon && location.pathname === to;
    return (
      <Link
        key={to + label}
        to={comingSoon ? location.pathname : to}
        onClick={(e) => {
          if (comingSoon) { e.preventDefault(); return; }
          if (guarded) { guardedNav(e, label); if (isGuest) return; }
          closeMobileMenu();
        }}
        className={`relative flex flex-col items-center justify-center gap-2 py-4 rounded-2xl transition-colors ${
          comingSoon ? 'text-slate-300' : active ? `${color} bg-black/[0.04]` : 'text-slate-500 bg-slate-50 active:bg-black/[0.05]'
        }`}
      >
        <div className="relative shrink-0">
          <Icon size={22} />
          {guarded && isGuest && (
            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center">
              <Lock size={9} className="text-slate-600" strokeWidth={3} />
            </div>
          )}
        </div>
        <span className="text-[12px] font-black tracking-tight text-center leading-tight px-1 whitespace-pre-line">{menuLabel ?? label}</span>
      </Link>
    );
  };

  const renderMobileMenu = () => (
    <ResponsiveModal isOpen={isMobileMenuOpen} onClose={closeMobileMenu} variant="sheet" size="md" className="md:hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-black text-slate-800">{t.home.menuTitle || (lang === 'en' ? 'Menu' : 'เมนู')}</h3>
        <button onClick={closeMobileMenu} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform">
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 mb-4">
        <button
          onClick={() => { if (isGuest) return; closeMobileMenu(); navigate('/settings/profile'); }}
          className="shrink-0 active:scale-95 transition-transform"
        >
          {isGuest ? (
            <div className="w-11 h-11 rounded-2xl bg-slate-200 flex items-center justify-center ring-2 ring-white shadow-sm">
              <User size={18} className="text-slate-400" />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-white shadow-sm bg-slate-200 flex items-center justify-center">
              {user?.avatarUrl ? (
                <img src={resolveImageUrl(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={18} className="text-slate-400" />
              )}
            </div>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase text-slate-400 mb-0.5">{t.home.greeting}</p>
          {isGuest ? (
            <button onClick={() => { closeMobileMenu(); navigate('/login'); }} className="text-[15px] font-black text-mellow-purple underline decoration-2 underline-offset-2 truncate">
              {lang === 'en' ? 'Login' : 'เข้าสู่ระบบ'}
            </button>
          ) : (
            <>
              <p className="text-[15px] font-black text-slate-800 truncate">
                {user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || (lang === 'en' ? 'Parent' : 'ผู้ปกครอง')}
              </p>
              <button
                onClick={() => { closeMobileMenu(); selectedChild ? setIsProfileSwitcherOpen(true) : setIsAddChildOpen(true); }}
                className="text-[12px] font-bold text-slate-400 truncate active:opacity-70 transition-opacity"
              >
                {selectedChild ? (selectedChild.nickname || selectedChild.name) : (lang === 'th' ? '+ เพิ่มข้อมูลเด็ก' : '+ Add My Child')}
              </button>
            </>
          )}
        </div>
        {!isGuest && kids.length > 1 && (
          <button
            onClick={() => { setIsProfileSwitcherOpen(true); closeMobileMenu(); }}
            className="shrink-0 w-9 h-9 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95 transition-all"
          >
            <ArrowRightLeft size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {mobileMenuTiles.map(renderMobileMenuTile)}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
        <Link
          to="/settings/profile"
          onClick={closeMobileMenu}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-2xl text-slate-500 bg-slate-50 active:bg-black/[0.05] transition-colors"
        >
          <SettingsIcon size={18} className="shrink-0" />
          <span className="text-[14px] font-black tracking-tight truncate">{t.common.settings}</span>
        </Link>
        <LanguageToggle />
      </div>
    </ResponsiveModal>
  );

  return (
    <div className="md:flex md:h-screen md:overflow-hidden bg-[#fbfaf7]">
      {/* Sidebar nav — mirrors the bottom nav's links/guest-lock behavior,
          icon-only at md:, icon+label from lg: up where there's room. Pinned
          to the full viewport height (md:h-screen) and scrolling on its own
          (md:overflow-y-auto) rather than with the page, so it stays put —
          and so the language toggle at the bottom (mt-auto) actually sits at
          the bottom of the viewport, not just after the last nav item. */}
      <aside className="hidden md:flex md:flex-col md:w-[84px] lg:w-[240px] md:shrink-0 md:h-screen md:overflow-y-auto md:py-5 md:px-3 lg:px-5 md:gap-1 md:shadow-[6px_0_24px_-12px_rgba(15,23,42,0.12)] md:z-10">
        <div className="hidden lg:flex lg:justify-center px-3 mb-4">
          <img src={logo} alt="Mellow Play" className="h-9" />
        </div>

        {/* Main profile — parent-centric: the PARENT's own identity is
            primary (avatar + name, tapping goes to their profile settings),
            the currently selected child is a secondary chip underneath
            (tapping switches, or opens Add Child if there isn't one yet;
            the small pencil opens the avatar picker for that child). Full
            "welcome card" detail (greeting, age, membership badge) only
            fits at lg:+; md: shows just the avatar, matching how nav
            labels also only appear at lg:. Account actions (Settings/LINE
            OA/Facebook/Logout) live behind the separate gear icon further
            down instead of here. */}
        <div className="hidden lg:block mb-3">
          <div className="rounded-3xl p-4 bg-white/70 border border-white/80 shadow-sm relative">
            <button
              onClick={() => !isGuest && navigate('/settings/profile')}
              className="block mb-2.5 active:scale-95 transition-transform"
            >
              {isGuest ? (
                <div className="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center ring-2 ring-white shadow-sm">
                  <User size={22} className="text-slate-400" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-white shadow-sm bg-slate-200 flex items-center justify-center">
                  {user?.avatarUrl ? (
                    <img src={resolveImageUrl(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={22} className="text-slate-400" />
                  )}
                </div>
              )}
            </button>
            {isGuest ? (
              <>
                <p className="text-[11px] font-black uppercase text-slate-400 mb-0.5">{t.home.greeting}</p>
                <button
                  onClick={() => navigate('/login')}
                  className="text-left block w-full text-[16px] font-black leading-tight truncate text-mellow-purple underline decoration-2 underline-offset-2"
                >
                  {lang === 'en' ? 'Login' : 'เข้าสู่ระบบ'}
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] font-black uppercase text-slate-400 mb-0.5">{lang === 'en' ? 'Family' : 'ครอบครัว'}</p>
                <span className="text-[16px] font-black text-slate-800 leading-tight truncate block mb-2.5">
                  {user?.lastName
                    ? (lang === 'en' ? `The ${user.lastName} Family` : `ครอบครัว ${user.lastName}`)
                    : (lang === 'en' ? 'My Family' : 'ครอบครัวของฉัน')}
                </span>
                <button
                  onClick={() => setIsProfileSwitcherOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all"
                >
                  <Users size={15} className="text-mellow-purple shrink-0" />
                  <span className="text-[13px] font-black text-slate-700 flex-1 text-left">
                    {lang === 'en' ? `${kids.length + 1} family members` : `สมาชิกครอบครัว ${kids.length + 1} คน`}
                  </span>
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="lg:hidden mb-1">
          <button
            onClick={() => !isGuest && (kids.length > 1 ? setIsProfileSwitcherOpen(true) : !selectedChild && setIsAddChildOpen(true))}
            className="w-full flex items-center justify-center px-3 py-2.5 rounded-2xl hover:bg-black/[0.03] transition-colors"
          >
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center ring-2 ring-white shadow-sm">
              {!isGuest && selectedChild ? (
                <ChildAvatar avatarType={selectedChild.avatar} className="w-full h-full" />
              ) : (
                <User size={18} className="text-slate-300" />
              )}
            </div>
          </button>
        </div>

        {beforeBookingItems.map(item => renderSidebarLink(item))}

        {/* Booking — plain icon link at md: (icon-only rail has no room for
            a submenu); becomes an expandable Book Class / Book Service /
            Book Event sub-menu at lg: where labels fit. All three lead to
            the exact same Booking wizard (Booking.tsx) — Book Service and
            Book Event just pass a `type` param that switches which course
            pool Step 1 browses (is_service / is_event, see bookingType
            there) — same screens throughout, but each stays a clearly
            separate entry point/system. */}
        <Link
          to="/booking"
          className={`lg:hidden flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${
            location.pathname === '/booking' ? 'text-orange-500 bg-black/[0.03]' : 'text-slate-400 hover:bg-black/[0.03]'
          }`}
        >
          <Calendar size={22} />
        </Link>
        <div className="hidden lg:block">
          <button
            onClick={() => setIsBookingMenuOpen(o => !o)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${
              location.pathname === '/booking' ? 'text-orange-500 bg-black/[0.03]' : 'text-slate-400 hover:bg-black/[0.03]'
            }`}
          >
            <Calendar size={22} className="shrink-0" />
            <span className="text-[15px] font-black tracking-tight flex-1 text-left">{t.home.quickAccess.booking}</span>
            <ChevronDown size={14} className={`shrink-0 transition-transform ${isBookingMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {isBookingMenuOpen && (
            // ml matches the icon's width (not the icon+gap indent used
            // elsewhere) so these sub-items' text lines up with the regular
            // menu items' label text above/below, not with their icons.
            <div className="ml-[22px] mt-1 mb-1 flex flex-col gap-1 border-l border-slate-100 pl-3">
              <Link
                to="/booking"
                onClick={() => setIsBookingMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-[14px] font-bold text-slate-500 hover:bg-black/[0.03] hover:text-slate-700 transition-colors"
              >
                {lang === 'en' ? 'Classes' : 'คลาส'}
              </Link>
              <Link
                to="/booking?type=event"
                onClick={() => setIsBookingMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-[14px] font-bold text-slate-500 hover:bg-black/[0.03] hover:text-slate-700 transition-colors"
              >
                {lang === 'en' ? 'Events' : 'กิจกรรม'}
              </Link>
              <Link
                to="/booking?type=service"
                onClick={() => setIsBookingMenuOpen(false)}
                className="px-3 py-2 rounded-xl text-[14px] font-bold text-slate-500 hover:bg-black/[0.03] hover:text-slate-700 transition-colors"
              >
                {lang === 'en' ? 'Other Services' : 'บริการอื่นๆ'}
              </Link>
            </div>
          )}
        </div>

        {afterBookingItems.map(item => renderSidebarLink(item))}

        {/* Settings/Language/Logout — same row shape as the nav links above
            (gap-3 px-3 py-2.5) so everything lines up in one column instead
            of Settings+Language sharing a cramped flex row with their own
            narrower padding. Wrapped together so mt-auto pushes the whole
            group to the bottom as a unit, not just the first element. */}
        <div className="mt-auto">
          <div className="my-2 mx-3 border-t border-slate-100" />

          <Link
            to="/settings/profile"
            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-slate-400 hover:bg-black/[0.03] transition-colors"
          >
            <SettingsIcon size={22} className="shrink-0" />
            <span className="hidden lg:inline text-[15px] font-black tracking-tight">{t.common.settings}</span>
          </Link>

          <button
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-slate-400 hover:bg-black/[0.03] transition-colors"
          >
            <Globe size={22} className="shrink-0" />
            <span className="hidden lg:inline text-[15px] font-black tracking-tight">{lang === 'th' ? 'English' : 'ภาษาไทย'}</span>
          </button>

          {!isGuest && (
            <button
              onClick={() => {
                localStorage.removeItem('mellow_token');
                localStorage.removeItem('mellow_user');
                localStorage.removeItem('mellow_guest');
                navigate('/login');
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-red-400 hover:bg-red-50 transition-colors"
            >
              <LogOut size={22} className="shrink-0" />
              <span className="hidden lg:inline text-[15px] font-black tracking-tight">{lang === 'en' ? 'Logout' : 'ออกจากระบบ'}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Content area: the 5 tab pages manage their own max-width directly
          on their own root element (see Home/Roadmap/Album's own classes),
          so this wrapper just flexes to fill the remaining space. Every
          other page still relies on the `.mellow-shell-frame:has(...)`
          rules in index.css to pick up its own width — that class has to
          stay on this wrapper for those pages, unchanged from before, now
          just sitting next to the sidebar instead of centered alone. */}
      <div className={`${showBottomNav ? 'max-w-[430px] md:max-w-none' : 'mellow-shell-frame max-w-[430px] mx-auto md:max-w-none md:w-full'} md:flex-1 md:min-w-0 mx-auto md:mx-auto min-h-screen md:h-screen bg-[#fbfaf7] relative shadow-2xl md:shadow-none overflow-hidden md:overflow-y-auto ${ownsScrolling ? 'lg:overflow-hidden' : ''}`}>
        {children}

        {/* Shared Bottom Navigation — mobile only, and only on the 5 tab
            pages; the sidebar takes over from md: either way. */}
        {showBottomNav && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-24 bg-white/90 backdrop-blur-xl rounded-t-[40px] shadow-[0_-15px_40px_-20px_rgba(0,0,0,0.15)] border-t border-white/40 flex justify-around items-center px-3 z-20 md:hidden">
            <Link to="/" className={`flex flex-col items-center gap-1.5 transition-all active:scale-90 ${location.pathname === '/' ? 'text-mellow-red' : 'text-slate-400'}`}>
              <HomeIcon size={24} />
              <span className="text-[15px] font-black tracking-tighter">{t.nav.home}</span>
            </Link>
            <Link to="/journey" onClick={e => guardedNav(e, t.nav.journey)} className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/journey' ? 'text-mellow-purple' : 'text-slate-400'}`}>
              <div className="relative">
                <Map size={24} />
                {isGuest && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center">
                    <Lock size={9} className="text-slate-600" strokeWidth={3} />
                  </div>
                )}
              </div>
              <span className="text-[15px] font-black tracking-tighter">{t.nav.journey}</span>
            </Link>
            {/* Album moved into the "all menu" grid below — this slot is now
                the entry point to everything else the sidebar carries on
                desktop (Booking, Know My Child, Album, Contact Us, Settings...). */}
            <button onClick={() => setIsMobileMenuOpen(true)} className="flex flex-col items-center gap-1 transition-all active:scale-90 text-mellow-blue">
              <LayoutGrid size={24} />
              <span className="text-[15px] font-black tracking-tighter">{lang === 'en' ? 'Menu' : 'เมนู'}</span>
            </button>
            <Link to="/explore" className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/explore' ? 'text-mellow-yellow' : 'text-slate-400'}`}>
              <Compass size={24} />
              <span className="text-[15px] font-black tracking-tighter">{t.nav.explore}</span>
            </Link>
            <Link to="/rewards" onClick={e => guardedNav(e, t.nav.rewards)} className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${location.pathname === '/rewards' ? 'text-mellow-green' : 'text-slate-400'}`}>
              <div className="relative">
                <Star size={24} />
                {isGuest && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center">
                    <Lock size={9} className="text-slate-600" strokeWidth={3} />
                  </div>
                )}
              </div>
              <span className="text-[15px] font-black tracking-tighter">{t.nav.rewards}</span>
            </Link>
          </nav>
        )}
      </div>

      {isMobileMenuOpen && renderMobileMenu()}

      {isProfileSwitcherOpen && renderProfileSwitcherModal()}

      <AddChildModal isOpen={isAddChildOpen} onClose={() => setIsAddChildOpen(false)} />

      <EditChildModal
        isOpen={isEditChildOpen}
        onClose={() => setIsEditChildOpen(false)}
        childInfo={editingChild}
      />

      {/* Family members' avatar editing now lives inside EditChildModal
          itself (opened above) — this component no longer needs its own
          picker trigger for them. Home.tsx keeps its own separate instance
          for the currently-selected child's quick-access avatar. */}

      {selectedChild?.dob && (
        <BirthdayModal
          isOpen={isBirthdayModalOpen}
          onClose={() => setIsBirthdayModalOpen(false)}
          name={selectedChild.nickname || selectedChild.name}
          dob={selectedChild.dob}
        />
      )}

      <GuestUnlockModal
        isOpen={!!lockedNavFeature}
        onClose={() => setLockedNavFeature(null)}
        featureLabel={lockedNavFeature || ''}
      />
    </div>
  );
};

export default AppShell;
