import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Gift, AlertCircle, Star } from 'lucide-react';
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

const Rewards = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const fetchChildren = useChildStore(state => state.fetchChildren);

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Get active coupon type based on old logic (or use coupons[0])
  const activeCoupon = selectedChild?.coupons?.[0];
  const balance = activeCoupon?.balance || 0;
  const totalEarned = activeCoupon?.total_earned || balance;
  const usedStamps = Math.max(0, totalEarned - balance);

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

  const handleRedeem = async (reward: Reward) => {
    if (!selectedChild?.id) return;
    if (balance < reward.stamp_cost) {
      setErrorMsg('ยอดแสตมป์สะสมไม่เพียงพอสำหรับการแลกรางวัลนี้');
      return;
    }

    if (confirm(`คุณต้องการใช้ ${reward.stamp_cost} แสตมป์ เพื่อแลก ${reward.name} ใช่หรือไม่?`)) {
      setSubmitting(true);
      setErrorMsg('');
      try {
        const response = await apiClient.post('/rewards/redeem', {
          childId: selectedChild.id,
          rewardId: reward.id
        });

        if (response.data.success) {
          const userJson = localStorage.getItem('mellow_user');
          if (userJson) {
            const user = JSON.parse(userJson);
            await fetchChildren(user.id);
          }
          setSuccessMsg(`แลกของรางวัลสำเร็จ! รหัสรับสิทธิ์ของคุณคือ: ${response.data.claimCode}`);
          fetchRewards(); // Refresh stock
        }
      } catch (err: any) {
        setErrorMsg(err.response?.data?.message || 'เกิดข้อผิดพลาดในการทำรายการ');
      } finally {
        setSubmitting(false);
      }
    }
  };

  // Generate Stamp Grid (30 slots)
  const renderStamps = () => {
    const slots = [];
    for (let i = 1; i <= 30; i++) {
      let status = 'empty';
      if (i <= usedStamps) status = 'used';
      else if (i <= totalEarned) status = 'available';

      let slotContent;
      if (status === 'used') {
        slotContent = (
          <div className="w-full h-full flex flex-col items-center justify-center opacity-40 grayscale">
            <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
               <Star size={20} className="text-white opacity-50" fill="currentColor" />
            </div>
            <span className="text-[10px] font-bold mt-1 text-slate-800">ใช้แล้ว</span>
          </div>
        );
      } else if (status === 'available') {
        slotContent = (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-mellow-ink rounded-full flex items-center justify-center relative shadow-lg transform hover:scale-105 transition-transform">
               <Star size={24} className="text-yellow-400" fill="currentColor" />
               <div className="absolute -bottom-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border border-white">NEW</div>
            </div>
          </div>
        );
      } else {
        slotContent = (
          <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
            <div className="w-10 h-10 bg-slate-200/50 rounded-full flex items-center justify-center border border-slate-300">
               {i === 30 ? <span className="text-[10px] font-bold text-mellow-purple">FREE</span> : <span className="text-sm font-bold text-slate-400">{i}</span>}
            </div>
          </div>
        );
      }

      slots.push(
        <div key={i} className="aspect-square flex items-center justify-center">
          {slotContent}
        </div>
      );
    }
    return slots;
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
        <div className="w-10" />
      </header>

      <main className="p-4">
        {/* User Profile Banner */}
        <div className="bg-gradient-to-r from-slate-100 to-slate-50 rounded-3xl p-5 shadow-sm mb-6 flex justify-between items-center">
           <div>
             <span className="text-sm font-bold text-slate-500">สถานะสมาชิก</span>
             <h2 className="text-xl font-black text-slate-800">{selectedChild?.name}</h2>
             <div className="mt-2 text-mellow-ink">
               <span className="text-xs font-bold opacity-70">ยอดแสตมป์สะสม:</span>
               <div className="text-3xl font-black">{totalEarned}</div>
             </div>
             <div className="mt-2 text-xs font-bold text-slate-500">
               ระดับสมาชิก <span className="text-mellow-purple">สมาชิกทั่วไป</span>
             </div>
           </div>
           <div className="text-center">
             <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-2 mx-auto border-4 border-white shadow-sm overflow-hidden">
                <Star size={36} className="text-orange-500" fill="currentColor" />
             </div>
             <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-1 rounded-full shadow-sm">สมาชิกทั่วไป</span>
           </div>
        </div>

        {/* Stamps Grid */}
        <div className="bg-white rounded-3xl p-5 shadow-sm mb-6">
          <div className="grid grid-cols-5 gap-y-4 gap-x-2">
            {renderStamps()}
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
                    disabled={submitting || balance < reward.stamp_cost}
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
    </div>
  );
};

export default Rewards;
