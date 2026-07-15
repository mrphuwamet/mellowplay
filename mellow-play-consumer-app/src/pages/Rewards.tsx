import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Gift, AlertCircle, Star, ChevronLeft as ArrowLeft, ChevronRight as ArrowRight, History, X, Crown, Medal } from 'lucide-react';
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

const PAGE_SIZE = 15; // 3 rows x 5 cols

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

  const handleRedeem = async (reward: Reward) => {
    if (!selectedChild?.id) return;
    if (availableCount < reward.stamp_cost) {
      setErrorMsg(lang === 'en' ? 'Not enough stamps for this reward' : 'ยอดแสตมป์สะสมไม่เพียงพอสำหรับการแลกรางวัลนี้');
      return;
    }

    if (confirm(lang === 'en'
      ? `Use ${reward.stamp_cost} stamps to redeem ${reward.name}?`
      : `คุณต้องการใช้ ${reward.stamp_cost} แสตมป์ เพื่อแลก ${reward.name} ใช่หรือไม่?`)) {
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
      }
    }
  };

  const totalCount = stamps.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const currentPageCells = useMemo(() => {
    const endIdx = totalCount - pageIndex * PAGE_SIZE;
    const startIdx = Math.max(0, endIdx - PAGE_SIZE);
    const real = stamps.slice(startIdx, endIdx);
    const padCount = PAGE_SIZE - real.length;
    return [...Array(padCount).fill(null), ...real];
  }, [stamps, pageIndex, totalCount]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

  const renderStampCell = (stamp: Stamp | null, i: number) => {
    if (!stamp) {
      return (
        <div key={`empty-${i}`} className="aspect-square flex items-center justify-center">
          <div className="w-11 h-11 rounded-full border-2 border-dashed border-slate-200" />
        </div>
      );
    }

    const isMasked = stamp.status !== 'available';
    return (
      <div key={stamp.id} className="aspect-square flex flex-col items-center justify-center">
        <div className={`relative w-12 h-12 rounded-full flex items-center justify-center shadow-sm overflow-hidden ${isMasked ? 'grayscale opacity-50' : ''}`}
          style={{ backgroundColor: stamp.image_url ? 'transparent' : '#1e1b2e' }}
        >
          {stamp.image_url ? (
            <img src={stamp.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Star size={22} className="text-yellow-400" fill="currentColor" />
          )}
        </div>
        {isMasked && (
          <span className="text-[9px] font-black mt-1 text-slate-400">
            {stamp.status === 'used' ? (lang === 'en' ? 'Used' : 'ใช้แล้ว') : (lang === 'en' ? 'Expired' : 'หมดอายุ')}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f4f7f6] pb-24 relative font-sans">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">Mellow Reward Store</h1>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">แลกรับของรางวัล</span>
        </div>
        <button onClick={openHistory} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <History size={18} />
        </button>
      </header>

      <main className="p-4">
        {/* User Profile Banner */}
        <div className="bg-gradient-to-r from-slate-100 to-slate-50 rounded-3xl p-5 shadow-sm mb-6 flex justify-between items-center">
           <div>
             <span className="text-sm font-bold text-slate-500">{selectedChild?.name}</span>
             <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mt-1">
               {lang === 'en' ? 'Stamps available to redeem' : 'แสตมป์ที่แลกได้'}
             </h2>
             <div className="text-4xl font-black text-mellow-ink mt-1">{availableCount}</div>

             {!isPremium && nearestExpiryDate && expiringSoonCount > 0 && (
               <div className="mt-2 text-xs font-bold text-amber-600 bg-amber-50 inline-block px-2.5 py-1 rounded-full">
                 {lang === 'en'
                   ? `${expiringSoonCount} expiring on ${formatDate(nearestExpiryDate)}`
                   : `${expiringSoonCount} ดวงจะหมดอายุวันที่ ${formatDate(nearestExpiryDate)}`}
               </div>
             )}
           </div>
           <div className="text-center">
             <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 mx-auto border-4 border-white shadow-sm overflow-hidden ${isPremium ? 'bg-gradient-to-br from-amber-400 to-yellow-500' : 'bg-emerald-100'}`}>
                {isPremium ? <Crown size={28} className="text-white" /> : <Medal size={28} className="text-emerald-600" />}
             </div>
             <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-1 rounded-full shadow-sm">
               {isPremium ? 'Premium' : (lang === 'en' ? 'Regular' : 'สมาชิกทั่วไป')}
             </span>
           </div>
        </div>

        {/* Stamps Grid */}
        <div className="bg-white rounded-3xl p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setPageIndex(p => Math.min(pageCount - 1, p + 1))}
              disabled={pageIndex >= pageCount - 1}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-transform"
            >
              <ArrowLeft size={16} />
            </button>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
              {totalCount === 0 ? (lang === 'en' ? 'No stamps yet' : 'ยังไม่มีแสตมป์') : `${pageCount - pageIndex} / ${pageCount}`}
            </span>
            <button
              onClick={() => setPageIndex(p => Math.max(0, p - 1))}
              disabled={pageIndex <= 0}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-transform"
            >
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-5 gap-y-4 gap-x-2">
            {currentPageCells.map((s, i) => renderStampCell(s, i))}
          </div>
        </div>

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
        <h3 className="text-lg font-black text-slate-800 mb-4 px-2">ของรางวัลที่แลกได้</h3>

        {loading ? (
          <div className="text-center py-10 opacity-50">
             <div className="w-8 h-8 border-4 border-slate-200 border-t-mellow-ink rounded-full animate-spin mx-auto mb-3" />
             <p className="text-sm font-bold">กำลังโหลด...</p>
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
                    onClick={() => handleRedeem(reward)}
                    disabled={submitting || availableCount < reward.stamp_cost}
                    className="px-3 py-1.5 bg-mellow-ink text-white text-[10px] font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-transform"
                  >
                    แลกเลย
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

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
