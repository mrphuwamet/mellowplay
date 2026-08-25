import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Gift, AlertCircle, Star, History, X, Check, Lock, User, Award } from 'lucide-react';
import { getCourseDetailPath } from '../utils/courseLinks';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import ResponsiveModal from '../components/ResponsiveModal';
import { isPremiumChild } from '../utils/membership';

interface Reward {
  id: number;
  name: string;
  description: string;
  image_url: string;
  stamp_cost: number;
  stock: number;
}

interface Stamp {
  id: number;
  position: number;
  image_url: string | null;
  accent_color: string | null;
  earned_at: string;
  course_id: number | null;
  course_name?: string;
  visit_number: number | null;
  show_visit_number: boolean;
  design_name?: string | null;
}

interface BadgeTier {
  tier: number;
  name: string;
  description: string | null;
  image_url: string | null;
  accent_color: string | null;
  count: number;
  unlocked: boolean;
  awards: { id: number; course_name?: string; awarded_at: string; note?: string | null }[];
}

interface Redemption {
  id: number;
  reward_name: string;
  stamp_cost: number;
  claim_code: string;
  status: string;
  created_at: string;
}

// Medal colours used until someone uploads artwork: gold, silver, bronze.
const TIER_FALLBACK: Record<number, string> = { 1: '#f2b418', 2: '#a8b3c1', 3: '#c98a5e' };
// How many items the child has not joined yet are shown as empty slots. Enough
// to read as "there is more to collect", few enough not to bury what they have.
const SUGGESTION_LIMIT = 6;
// Brand CI colors, cycled by stamp position when no custom stamp image is set.
const STAMP_CI_COLORS = ['#7452d6', '#2273d9', '#21a45b', '#f7aa16', '#ef4f55', '#f6a800'];
// Wavy "stamp seal" outline (12-petal ring) shared by the clip-path (real
// stamps) and the dashed-outline SVG stroke (empty/future stamp slots) —
// a plain CSS border can't follow a clip-path, so empty slots need this
// same path drawn as an actual stroked <path> instead.
const STAMP_SCALLOP_PATH = 'M0.9,0.5 A0.13,0.13 0 0 1 0.8464,0.7 A0.13,0.13 0 0 1 0.7,0.8464 A0.13,0.13 0 0 1 0.5,0.9 A0.13,0.13 0 0 1 0.3,0.8464 A0.13,0.13 0 0 1 0.1536,0.7 A0.13,0.13 0 0 1 0.1,0.5 A0.13,0.13 0 0 1 0.1536,0.3 A0.13,0.13 0 0 1 0.3,0.1536 A0.13,0.13 0 0 1 0.5,0.1 A0.13,0.13 0 0 1 0.7,0.1536 A0.13,0.13 0 0 1 0.8464,0.3 A0.13,0.13 0 0 1 0.9,0.5 Z';

const Rewards = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const familyMembers = useChildStore(state => state.children);
  const selectChild = useChildStore(state => state.selectChild);

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [badgeTiers, setBadgeTiers] = useState<BadgeTier[]>([]);
  const [openCourses, setOpenCourses] = useState<any[]>([]);
  // Points are what rewards cost. Kept apart from the stamp collection on
  // purpose: redeeming spends points, and the stamps stay lit.
  const [availableCount, setAvailableCount] = useState(0);
  const [expiringSoonCount, setExpiringSoonCount] = useState(0);
  const [nearestExpiryDate, setNearestExpiryDate] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pageBackgrounds, setPageBackgrounds] = useState<{ page_number: number; image_url: string }[]>([]);

  const isPremium = isPremiumChild(selectedChild);

  const fetchStamps = async () => {
    if (!selectedChild?.id) return;
    try {
      const [res, badgeRes] = await Promise.all([
        apiClient.get(`/children/${selectedChild.id}/stamps`),
        apiClient.get(`/children/${selectedChild.id}/badges`).catch(() => null),
      ]);
      if (res.data.success) {
        setStamps(res.data.stamps);
        setAvailableCount(res.data.pointsBalance ?? res.data.availableCount);
        setExpiringSoonCount(res.data.expiringSoonCount);
        setNearestExpiryDate(res.data.nearestExpiryDate);
      }
      if (badgeRes?.data?.success) setBadgeTiers(badgeRes.data.tiers);
    } catch (err) {
      console.error('Failed to fetch stamps:', err);
    }
  };

  const fetchRewards = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/rewards');
      if (response.data.success) {
        setRewards(response.data.rewards);
      }
    } catch (err) {
      console.error('Failed to fetch rewards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRewards();
    // Used for the "not collected yet" slots — the reason to come back.
    apiClient.get('/admin/courses')
      .then(res => { if (res.data.success) setOpenCourses(res.data.courses || []); })
      .catch(() => {});
    apiClient.get('/stamp-page-backgrounds')
      .then(res => { if (res.data.success) setPageBackgrounds(res.data.backgrounds); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChild?.id]);

  const openHistory = async () => {
    setHistoryOpen(true);
    if (!selectedChild?.id) return;
    setHistoryLoading(true);
    try {
      const res = await apiClient.get(`/redemptions/child/${selectedChild.id}`);
      if (res.data.success) setHistory(res.data.redemptions);
    } catch (err) {
      console.error('Failed to fetch redemption history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const [confirmReward, setConfirmReward] = useState<Reward | null>(null);

  const promptRedeem = (reward: Reward) => {
    if (!selectedChild?.id) return;
    if (availableCount < reward.stamp_cost) {
      setErrorMsg(lang === 'en' ? 'Not enough points for this reward' : 'แต้มสะสมไม่พอสำหรับการแลกรางวัลนี้');
      return;
    }
    setConfirmReward(reward);
  };

  const handleRedeem = async (reward: Reward) => {
    if (!selectedChild?.id) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const response = await apiClient.post('/rewards/redeem', {
        childId: selectedChild.id,
        rewardId: reward.id
      });

      if (response.data.success) {
        setSuccessMsg(lang === 'en'
          ? `Redeemed successfully! Your claim code: ${response.data.claimCode}`
          : `แลกของรางวัลสำเร็จ! รหัสรับสิทธิ์ของคุณคือ: ${response.data.claimCode}`);
        fetchRewards();
        fetchStamps();
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || (lang === 'en' ? 'Something went wrong' : 'เกิดข้อผิดพลาดในการทำรายการ'));
    } finally {
      setSubmitting(false);
      setConfirmReward(null);
    }
  };

  const totalCount = stamps.length;
  const badgeCount = badgeTiers.reduce((n, t) => n + t.count, 0);

  // Items this child has never joined. They are the point of showing a
  // collection at all: an empty slot with a name on it is an invitation, where
  // a page of grey circles was just padding.
  const suggestions = useMemo(() => {
    const joined = new Set(stamps.map(st => st.course_id).filter(Boolean));
    return openCourses
      .filter((c: any) => !joined.has(c.id))
      .slice(0, SUGGESTION_LIMIT);
  }, [stamps, openCourses]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

  // One earned stamp: the item's own artwork, its name underneath, and "#2"
  // when the design says to show which visit it was.
  const renderStampCell = (stamp: Stamp) => (
    <div key={stamp.id} className="flex flex-col items-center text-center">
      <div className="relative w-16 h-16">
        <div
          className="w-16 h-16 flex items-center justify-center shadow-sm overflow-hidden"
          style={{
            backgroundColor: stamp.image_url ? 'transparent' : (stamp.accent_color || STAMP_CI_COLORS[(stamp.position - 1) % STAMP_CI_COLORS.length]),
            clipPath: 'url(#stampScallop)',
          }}
        >
          {stamp.image_url
            ? <img src={stamp.image_url} alt="" className="w-full h-full object-cover" />
            : <Star size={28} className="text-white" fill="currentColor" />}
        </div>
        {/* Sits on a non-clipped sibling so the round parent's
            overflow-hidden doesn't cut the corner off this badge. */}
        {stamp.show_visit_number && stamp.visit_number ? (
          <span className="absolute -bottom-1.5 -right-1.5 min-w-[26px] h-[26px] px-[5px] rounded-full bg-white text-mellow-ink text-[13px] font-black flex items-center justify-center shadow-md border border-slate-100 leading-none">
            #{stamp.visit_number}
          </span>
        ) : (
          <span className="absolute -bottom-1.5 -right-1.5 w-[22px] h-[22px] rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md border-2 border-white">
            <Check size={12} strokeWidth={4} />
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] font-bold text-slate-600 leading-tight line-clamp-2 w-[84px]">
        {stamp.course_name || stamp.design_name || ''}
      </p>
    </div>
  );

  // An item not joined yet. Tapping it goes to the item, which is the whole
  // reason these slots are here.
  const renderEmptySlot = (course: any) => (
    <div
      key={`open-${course.id}`}
      onClick={() => navigate(getCourseDetailPath(course))}
      className="flex flex-col items-center text-center cursor-pointer active:scale-95 transition-transform"
    >
      <div className="relative w-16 h-16 flex items-center justify-center">
        {/* A plain CSS border can't follow clip-path, so the dashed
            "future stamp" outline is drawn as an actual stroked path
            instead, tracing the same wavy shape as real stamps. */}
        <svg viewBox="0 0 1 1" className="w-14 h-14">
          <path d={STAMP_SCALLOP_PATH} fill="none" stroke="#cbd5e1" strokeWidth="0.025" strokeDasharray="0.035 0.03" strokeLinecap="round" />
        </svg>
        <Lock size={16} className="absolute text-slate-300" />
      </div>
      <p className="mt-2 text-[11px] font-bold text-slate-400 leading-tight line-clamp-2 w-[84px]">{course.name}</p>
    </div>
  );

  const renderBadge = (t: BadgeTier) => (
    <div key={t.tier} className="flex flex-col items-center text-center">
      <div
        className={`w-[76px] h-[76px] rounded-full flex items-center justify-center overflow-hidden shadow-sm relative ${t.unlocked ? '' : 'bg-slate-100'}`}
        style={t.unlocked && !t.image_url ? { backgroundColor: t.accent_color || TIER_FALLBACK[t.tier] } : undefined}
      >
        {t.unlocked && t.image_url
          ? <img src={t.image_url} alt="" className="w-full h-full object-cover" />
          : t.unlocked
            ? <span className="text-white text-3xl font-black">{t.tier}</span>
            : <>
                <span className="text-slate-300 text-3xl font-black">{t.tier}</span>
                <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <Lock size={11} className="text-slate-400" />
                </span>
              </>}
        {t.unlocked && t.count > 1 && (
          <span className="absolute -top-0 -right-0 min-w-[22px] h-[22px] px-1 rounded-full bg-mellow-ink text-white text-[11px] font-black flex items-center justify-center border-2 border-white">
            {t.count}
          </span>
        )}
      </div>
      <p className={`mt-2 text-[12px] font-black ${t.unlocked ? 'text-slate-700' : 'text-slate-400'}`}>{t.name}</p>
      {t.unlocked && t.awards[0]?.course_name && (
        <p className="text-[10px] font-bold text-slate-400 leading-tight line-clamp-2 w-[92px]">{t.awards[0].course_name}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f7f6] pb-24 relative font-sans max-w-[430px] mx-auto md:max-w-[680px] lg:max-w-none lg:mx-0 lg:w-full">
      {/* Shared clip-path def for the wavy/scalloped "stamp seal" edge — a
          ring of 12 rounded petal-bumps instead of a smooth circle, evoking
          a real stamp's perforated cut without boxing it into a square.
          Defined once, referenced by every stamp cell via
          clip-path: url(#stampScallop). objectBoundingBox units make it
          scale to whatever box size it's applied to. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <clipPath id="stampScallop" clipPathUnits="objectBoundingBox">
            <path d={STAMP_SCALLOP_PATH} />
          </clipPath>
        </defs>
      </svg>
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center">
          <h1 className="text-[17px] font-black tracking-tight leading-none mb-0.5">Mellow Reward Store</h1>
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">
            {lang === 'en' ? 'Redeem Rewards' : 'แลกรับของรางวัล'}
          </span>
        </div>
        <button onClick={openHistory} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <History size={18} />
        </button>
      </header>

      <main className="p-4">
        {/* One column on a phone, the whole width on a desktop — the stamp
            grid is the thing that benefits, since more columns means fewer
            rows of scrolling to see a collection. */}
        <div className="max-w-lg mx-auto md:max-w-[640px] lg:max-w-none lg:w-full">
        {/* Whose collection this is. Stamps and medals belong to one child, so
            a family with more than one needs to switch here rather than leave
            the page to do it. One member: nothing to choose, nothing shown. */}
        {familyMembers.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
            {familyMembers.map(member => {
              const active = member.id === selectedChild?.id;
              return (
                <button
                  key={member.id}
                  onClick={() => selectChild(member.id)}
                  className={`shrink-0 flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border transition-colors ${
                    active
                      ? 'bg-mellow-ink text-white border-transparent'
                      : 'bg-white text-slate-600 border-slate-200 active:scale-95'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center overflow-hidden ${active ? 'bg-white/20' : 'bg-slate-100'}`}>
                    {member.customPhotoUrl || (member.avatar || '').startsWith('http')
                      ? <img src={member.customPhotoUrl || member.avatar} alt="" className="w-full h-full object-cover" />
                      : <User size={14} className={active ? 'text-white' : 'text-slate-400'} />}
                  </span>
                  <span className="text-[13px] font-black whitespace-nowrap">{member.nickname || member.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* User Profile Banner */}
        <div className="bg-gradient-to-r from-slate-100 to-slate-50 rounded-3xl p-4 shadow-sm mb-6">
          <div className="flex justify-between items-center">
             <div className="min-w-0">
               {selectedChild?.nickname && (
                 <p className="text-2xl font-black text-slate-800 leading-tight truncate">{selectedChild.nickname}</p>
               )}
               <div className="flex items-center gap-1.5 mt-1">
                 <span className="text-xs font-bold text-slate-500 truncate">{selectedChild?.name}</span>
                 {/* Membership tier is a product-name label, not translated copy. */}
                 <span className={`shrink-0 text-xs font-black px-1.5 py-0.5 rounded-full ${isPremium ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                   {isPremium ? 'Premium' : 'Regular'}
                 </span>
               </div>
               {!isPremium && nearestExpiryDate && expiringSoonCount > 0 && (
                 <p className="mt-1 text-[12px] font-bold text-slate-400">
                   {lang === 'en'
                     ? `${expiringSoonCount} ${expiringSoonCount === 1 ? 'point' : 'points'} expiring on ${formatDate(nearestExpiryDate)}`
                     : `มีแต้ม ${expiringSoonCount} แต้ม จะหมดอายุวันที่ ${formatDate(nearestExpiryDate)}`}
                 </p>
               )}
             </div>
             {/* The most prominent element on the page — everything else
                 (name, membership) is secondary to "how many stamps do I have". */}
             <div
               className={`w-24 h-24 flex flex-col items-center justify-center shadow-lg shrink-0 ${isPremium ? 'bg-gradient-to-br from-amber-400 to-yellow-500' : 'bg-emerald-100'}`}
               style={{ clipPath: 'url(#stampScallop)' }}
             >
               <span className={`text-[10px] font-black uppercase tracking-widest ${isPremium ? 'text-white/90' : 'text-emerald-600'}`}>
                 {lang === 'en' ? 'Available' : 'พร้อมแลก'}
               </span>
               <span
                 className={`text-3xl font-black leading-tight ${isPremium ? 'text-white' : 'text-emerald-700'}`}
                 style={{ WebkitTextStroke: '0.6px currentColor' }}
               >
                 {availableCount}
               </span>
               <span className={`text-[10px] font-black uppercase tracking-widest ${isPremium ? 'text-white/90' : 'text-emerald-600'}`}>
                 {lang === 'en' ? 'points' : 'แต้ม'}
               </span>
             </div>
          </div>
        </div>

        {/* A — the collection. Grouped by what the child joined rather than by
            position, because "which events have I been to" is the thing worth
            showing; a page of numbered circles said nothing about any of them.
            The CRM-uploaded page background still backs the card.

            Hidden until the first stamp is earned: a card of locked slots on a
            brand-new account is a wall of things you have not done, and the
            gap it is meant to advertise only reads as a gap once something
            fills part of it. */}
        {totalCount > 0 && (() => {
          const pageBg = pageBackgrounds.find(b => b.page_number === 1);
          return (
            <div
              className={`rounded-3xl p-5 shadow-sm mb-6 ${pageBg ? 'bg-cover bg-center' : 'bg-white'}`}
              style={pageBg ? { backgroundImage: `url(${pageBg.image_url})` } : undefined}
            >
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-[15px] font-black text-slate-800">
                  {lang === 'en' ? 'My Stamp Collection' : 'แสตมป์ที่สะสมไว้'}
                </h3>
                <span className="text-[12px] font-black text-slate-400">
                  {totalCount} {lang === 'en' ? 'stamps' : 'ดวง'}
                </span>
              </div>

              {/* Earned first, then the ones still to collect. The dimmed slots
                  carry the activity's name and are tappable — a collection
                  shows its gaps, it does not need a caption explaining them. */}
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-y-5 gap-x-3">
                {stamps.map(st => renderStampCell(st))}
                {suggestions.map(course => renderEmptySlot(course))}
              </div>
            </div>
          );
        })()}

        {/* B — medals. All three tiers show once at least one is won, because
            the locked ones are what make the unlocked one mean something. Held
            back entirely until then: three grey circles on a new account
            advertise a competition most families are not in. */}
        {badgeCount > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-sm mb-6">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-[15px] font-black text-slate-800">
              {lang === 'en' ? 'Winner Badges' : 'เหรียญรางวัล'}
            </h3>
            <span className="text-[12px] font-black text-slate-400">
              {badgeTiers.reduce((n, t) => n + t.count, 0)} {lang === 'en' ? 'earned' : 'เหรียญ'}
            </span>
          </div>
          <div className="flex items-start justify-center gap-6">
            {(badgeTiers.length > 0 ? badgeTiers : [1, 2, 3].map(tier => ({
              tier, name: `อันดับ ${tier}`, description: null, image_url: null,
              accent_color: null, count: 0, unlocked: false, awards: [],
            }))).map(t => renderBadge(t as BadgeTier))}
          </div>
        </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 text-sm font-bold border border-red-100">
            <AlertCircle size={20} />
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-2xl flex items-center gap-3 text-sm font-bold border border-green-100">
            <Gift size={20} />
            {successMsg}
          </div>
        )}
        </div>

        {/* Rewards Catalog — a content-card grid (photo + name + price +
            button), so unlike the icon-tile grids above it scales up to
            more columns as the page container widens. */}
        <h3 className="text-lg font-black text-slate-800 mb-4 px-2">{lang === 'en' ? 'Available Rewards' : 'ของรางวัลที่แลกได้'}</h3>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-pulse">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-3xl p-3 shadow-sm border border-slate-100">
                <div className="aspect-square bg-slate-100 rounded-2xl mb-3" />
                <div className="h-3.5 w-3/4 bg-slate-200 rounded-full mb-2" />
                <div className="h-2.5 w-full bg-slate-100 rounded-full mb-3" />
                <div className="h-6 w-full bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {rewards.map(reward => (
              <div key={reward.id} className="bg-white rounded-3xl p-3 shadow-sm flex flex-col relative overflow-hidden border border-slate-100">
                <div className="aspect-square bg-slate-50 rounded-2xl mb-3 overflow-hidden flex items-center justify-center">
                   {reward.image_url ? (
                     <img src={reward.image_url} alt={reward.name} className="w-full h-full object-cover" />
                   ) : (
                     <Gift size={32} className="text-slate-300" />
                   )}
                </div>
                <h4 className="font-bold text-slate-800 text-sm leading-tight mb-1">{reward.name}</h4>
                <p className="text-[11px] text-slate-500 line-clamp-2 mb-3">{reward.description}</p>
                <div className="mt-auto pt-2 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-mellow-purple font-black">
                    <span className="text-sm">{reward.stamp_cost}</span>
                    <span className="text-[11px]">{lang === 'en' ? 'pts' : 'แต้ม'}</span>
                  </div>
                  <button
                    onClick={() => promptRedeem(reward)}
                    disabled={submitting || availableCount < reward.stamp_cost}
                    className="px-3 py-1.5 bg-mellow-ink text-white text-[11px] font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-transform"
                  >
                    {lang === 'en' ? 'Redeem' : 'แลกเลย'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <ResponsiveModal isOpen={!!confirmReward} onClose={() => !submitting && setConfirmReward(null)} variant="dialog" size="xs" className="text-center">
        {confirmReward && (
          <>
            {!submitting && (
              <button onClick={() => setConfirmReward(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
                <X size={16} />
              </button>
            )}
            <div className="w-16 h-16 rounded-full bg-mellow-purple/10 flex items-center justify-center mx-auto mb-4">
              <Gift size={26} className="text-mellow-purple" />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">
              {lang === 'en' ? 'Confirm Redemption' : 'ยืนยันการแลกของรางวัล'}
            </h3>
            <p className="text-sm font-bold text-slate-500 leading-relaxed mb-1">
              {lang === 'en'
                ? `Use ${confirmReward.stamp_cost} points to redeem:`
                : `ใช้ ${confirmReward.stamp_cost} แต้ม เพื่อแลก:`}
            </p>
            <p className="text-base font-black text-slate-800 mb-6">{confirmReward.name}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReward(null)}
                disabled={submitting}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
              >
                {lang === 'en' ? 'Cancel' : 'ยกเลิก'}
              </button>
              <button
                onClick={() => handleRedeem(confirmReward)}
                disabled={submitting}
                className="flex-1 py-3 bg-mellow-ink text-white rounded-xl font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
              >
                {submitting ? (lang === 'en' ? 'Redeeming...' : 'กำลังแลก...') : (lang === 'en' ? 'Confirm' : 'ยืนยัน')}
              </button>
            </div>
          </>
        )}
      </ResponsiveModal>

      <ResponsiveModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} variant="sheet" size="sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">{lang === 'en' ? 'Redemption History' : 'ประวัติการแลก'}</h3>
              <button onClick={() => setHistoryOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            {historyLoading ? (
              <div className="text-center py-8 opacity-50 text-sm font-bold">{lang === 'en' ? 'Loading...' : 'กำลังโหลด...'}</div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-sm font-bold text-slate-400">{lang === 'en' ? 'No redemptions yet' : 'ยังไม่มีประวัติการแลก'}</div>
            ) : (
              <div className="space-y-2">
                {history.map(r => (
                  <div key={r.id} className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-slate-800">{r.reward_name}</p>
                      <p className="text-[12px] text-slate-400 font-bold">{formatDate(r.created_at)} • {r.claim_code}</p>
                    </div>
                    <span className="text-mellow-purple font-black text-sm">-{r.stamp_cost}</span>
                  </div>
                ))}
              </div>
            )}
      </ResponsiveModal>

      {/* Certificates live on their own page rather than as a fourth section
          here: a certificate is a full sheet, and stacking several under the
          stamps would bury both. This is the door to them. */}
      <div className="px-4 pb-6">
        <button
          type="button"
          onClick={() => navigate('/my-certificates')}
          className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Award size={20} className="text-amber-500" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[15px] font-black text-slate-800">เกียรติบัตรของฉัน</p>
            <p className="text-[12px] font-medium text-slate-400">ดู ดาวน์โหลด และแชร์ให้คนอื่นดูได้</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 shrink-0" />
        </button>
      </div>
    </div>
  );
};

export default Rewards;
