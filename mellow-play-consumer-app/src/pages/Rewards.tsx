import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Gift, AlertCircle, Star, ChevronLeft as ArrowLeft, ChevronRight as ArrowRight, History, X } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';

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
  status: 'available' | 'used' | 'expired';
  image_url: string | null;
  expires_at: string | null;
  course_name?: string;
}

interface Redemption {
  id: number;
  reward_name: string;
  stamp_cost: number;
  claim_code: string;
  status: string;
  created_at: string;
}

const PAGE_SIZE = 12; // 3 rows x 4 cols
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

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [expiringSoonCount, setExpiringSoonCount] = useState(0);
  const [nearestExpiryDate, setNearestExpiryDate] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0); // 0 = latest page

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pageBackgrounds, setPageBackgrounds] = useState<{ page_number: number; image_url: string }[]>([]);

  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;
  const membershipStatus = user?.membershipStatus || 'inactive';
  const isPremium = membershipStatus === 'premium';

  const fetchStamps = async () => {
    if (!selectedChild?.id) return;
    try {
      const res = await apiClient.get(`/children/${selectedChild.id}/stamps`);
      if (res.data.success) {
        setStamps(res.data.stamps);
        setAvailableCount(res.data.availableCount);
        setExpiringSoonCount(res.data.expiringSoonCount);
        setNearestExpiryDate(res.data.nearestExpiryDate);
        setPageIndex(0);
      }
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
      setErrorMsg(lang === 'en' ? 'Not enough stamps for this reward' : 'ยอดแสตมป์สะสมไม่เพียงพอสำหรับการแลกรางวัลนี้');
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
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const currentPageCells = useMemo(() => {
    const endIdx = totalCount - pageIndex * PAGE_SIZE;
    const startIdx = Math.max(0, endIdx - PAGE_SIZE);
    const real = stamps.slice(startIdx, endIdx);
    const padCount = PAGE_SIZE - real.length;
    // Real stamps read left-to-right, top-to-bottom like a normal stamp
    // card; empty slots trail at the end instead of leading.
    return [...real, ...Array(padCount).fill(null)];
  }, [stamps, pageIndex, totalCount]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

  const renderStampCell = (stamp: Stamp | null, i: number) => {
    if (!stamp) {
      return (
        // Same two-level wrapper (outer auto-size flex + inner fixed
        // w-16 h-16) as a real stamp cell below, so every cell in the row
        // has an identical bounding box and lines up exactly regardless of
        // which cells are empty vs. filled.
        <div key={`empty-${i}`} className="flex items-center justify-center">
          <div className="relative w-16 h-16 flex items-center justify-center">
            {/* A plain CSS border can't follow clip-path, so the dashed
                "future stamp" outline is drawn as an actual stroked path
                instead, tracing the same wavy shape as real stamps. */}
            <svg viewBox="0 0 1 1" className="w-14 h-14">
              <path d={STAMP_SCALLOP_PATH} fill="none" stroke="#cbd5e1" strokeWidth="0.025" strokeDasharray="0.035 0.03" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      );
    }

    const isMasked = stamp.status !== 'available';
    const ciColor = STAMP_CI_COLORS[(stamp.position - 1) % STAMP_CI_COLORS.length];
    return (
      <div key={stamp.id} className="flex items-center justify-center">
        <div className="relative w-16 h-16">
          <div className={`w-16 h-16 flex items-center justify-center shadow-sm overflow-hidden ${isMasked ? 'grayscale' : ''}`}
            style={{ backgroundColor: stamp.image_url ? 'transparent' : ciColor, clipPath: 'url(#stampScallop)' }}
          >
            {stamp.image_url ? (
              <img src={stamp.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Star size={28} className="text-white" fill="currentColor" />
            )}
          </div>
          {/* "Used"/"Expired" reads as an ink stamp mark punched directly
              onto the stamp itself, instead of a caption underneath. */}
          {isMasked && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="text-[9px] font-black text-white border-[1.5px] border-white px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-black/50"
                style={{ transform: 'rotate(-16deg)' }}
              >
                {stamp.status === 'used' ? (lang === 'en' ? 'Used' : 'ใช้แล้ว') : (lang === 'en' ? 'Expired' : 'หมดอายุ')}
              </span>
            </div>
          )}
          {/* Sits on a non-clipped sibling so the round parent's
              overflow-hidden doesn't cut the corner off this badge. */}
          <span className="absolute -bottom-1.5 -right-1.5 min-w-[26px] h-[26px] px-[5px] rounded-full bg-white text-mellow-ink text-[14px] font-black flex items-center justify-center shadow-md border border-slate-100 leading-none">
            {stamp.position}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f4f7f6] pb-24 relative font-sans">
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
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">Mellow Reward Store</h1>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            {lang === 'en' ? 'Redeem Rewards' : 'แลกรับของรางวัล'}
          </span>
        </div>
        <button onClick={openHistory} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <History size={18} />
        </button>
      </header>

      <main className="p-4">
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
                 <p className="mt-1 text-[11px] font-bold text-slate-400">
                   {lang === 'en'
                     ? `${expiringSoonCount} ${expiringSoonCount === 1 ? 'stamp' : 'stamps'} expiring on ${formatDate(nearestExpiryDate)}`
                     : `มีแสตมป์ ${expiringSoonCount} ดวง จะหมดอายุวันที่ ${formatDate(nearestExpiryDate)}`}
                 </p>
               )}
             </div>
             {/* The most prominent element on the page — everything else
                 (name, membership) is secondary to "how many stamps do I have". */}
             <div
               className={`w-24 h-24 flex flex-col items-center justify-center shadow-lg shrink-0 ${isPremium ? 'bg-gradient-to-br from-amber-400 to-yellow-500' : 'bg-emerald-100'}`}
               style={{ clipPath: 'url(#stampScallop)' }}
             >
               <span className={`text-[9px] font-black uppercase tracking-widest ${isPremium ? 'text-white/90' : 'text-emerald-600'}`}>
                 {lang === 'en' ? 'Available' : 'พร้อมแลก'}
               </span>
               <span
                 className={`text-3xl font-black leading-tight ${isPremium ? 'text-white' : 'text-emerald-700'}`}
                 style={{ WebkitTextStroke: '0.6px currentColor' }}
               >
                 {availableCount}
               </span>
               <span className={`text-[9px] font-black uppercase tracking-widest ${isPremium ? 'text-white/90' : 'text-emerald-600'}`}>
                 {lang === 'en' ? 'stamps' : 'แสตมป์'}
               </span>
             </div>
          </div>
        </div>

        {/* Stamps Grid — page_number matches the "N / total" label shown
            below, so a CRM-uploaded background swaps in per page. */}
        {(() => {
          const currentPageNumber = pageCount - pageIndex;
          const pageBg = pageBackgrounds.find(b => b.page_number === currentPageNumber);
          return (
            <div
              className={`rounded-3xl p-5 shadow-sm mb-6 ${pageBg ? 'bg-cover bg-center' : 'bg-white'}`}
              style={pageBg ? { backgroundImage: `url(${pageBg.image_url})` } : undefined}
            >
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setPageIndex(p => Math.min(pageCount - 1, p + 1))}
                  disabled={pageIndex >= pageCount - 1}
                  className={`w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-20 active:scale-90 transition-transform ${pageBg ? 'bg-white/80 backdrop-blur-sm' : 'bg-slate-100'}`}
                >
                  <ArrowLeft size={16} />
                </button>
                <span className={`text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${pageBg ? 'bg-white/80 backdrop-blur-sm text-slate-500' : 'text-slate-400'}`}>
                  {totalCount === 0 ? (lang === 'en' ? 'No stamps yet' : 'ยังไม่มีแสตมป์') : `${currentPageNumber} / ${pageCount}`}
                </span>
                <button
                  onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                  disabled={pageIndex <= 0}
                  className={`w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-20 active:scale-90 transition-transform ${pageBg ? 'bg-white/80 backdrop-blur-sm' : 'bg-slate-100'}`}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-y-5 gap-x-3">
                {currentPageCells.map((s, i) => renderStampCell(s, i))}
              </div>
            </div>
          );
        })()}

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

        {/* Rewards Catalog */}
        <h3 className="text-lg font-black text-slate-800 mb-4 px-2">{lang === 'en' ? 'Available Rewards' : 'ของรางวัลที่แลกได้'}</h3>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 animate-pulse">
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
          <div className="grid grid-cols-2 gap-3">
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
                <p className="text-[10px] text-slate-500 line-clamp-2 mb-3">{reward.description}</p>
                <div className="mt-auto pt-2 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-mellow-purple font-black">
                    <span className="text-sm">{reward.stamp_cost}</span>
                    <span className="text-[10px]">ดวง</span>
                  </div>
                  <button
                    onClick={() => promptRedeem(reward)}
                    disabled={submitting || availableCount < reward.stamp_cost}
                    className="px-3 py-1.5 bg-mellow-ink text-white text-[10px] font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-transform"
                  >
                    {lang === 'en' ? 'Redeem' : 'แลกเลย'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {confirmReward && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm" onClick={() => !submitting && setConfirmReward(null)}>
          <div className="relative w-full max-w-xs bg-white rounded-[28px] p-6 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
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
                ? `Use ${confirmReward.stamp_cost} stamps to redeem:`
                : `ใช้ ${confirmReward.stamp_cost} แสตมป์ เพื่อแลก:`}
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
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setHistoryOpen(false)}>
          <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                      <p className="text-[11px] text-slate-400 font-bold">{formatDate(r.created_at)} • {r.claim_code}</p>
                    </div>
                    <span className="text-mellow-purple font-black text-sm">-{r.stamp_cost}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Rewards;
