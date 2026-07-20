import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Ticket, CreditCard, AlertCircle, ArrowLeftRight, X, Check } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';

interface PackageCoupon {
  typeId: string;
  quantity: number;
}

interface Package {
  id: number;
  name: string;
  description: string;
  price: number;
  coupons: PackageCoupon[];
}

interface CouponType {
  id: number;
  name: string;
  color: string;
}

const MyCoupons = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const { children, selectedChildId, selectChild } = useChildStore();

  const [packages, setPackages] = useState<Package[]>([]);
  const [couponTypes, setCouponTypes] = useState<CouponType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [transferType, setTransferType] = useState<CouponType | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [transferQty, setTransferQty] = useState(1);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState(false);

  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;
  const selectedChild = children.find(c => c.id === selectedChildId);

  useEffect(() => {
    Promise.all([
      apiClient.get('/packages'),
      apiClient.get('/admin/coupon-types'),
    ])
      .then(([pkgRes, typeRes]) => {
        if (pkgRes.data.success) setPackages(pkgRes.data.packages);
        if (typeRes.data.success) setCouponTypes(typeRes.data.couponTypes);
      })
      .catch(err => console.error('Failed to load packages:', err))
      .finally(() => setLoading(false));
  }, []);

  const typeName = (typeId: string) => couponTypes.find(t => String(t.id) === String(typeId))?.name || typeId;
  const typeColor = (typeId: string) => couponTypes.find(t => String(t.id) === String(typeId))?.color || '#A78BFA';

  const siblings = children.filter(c => c.id !== selectedChildId);

  const openTransfer = (type: CouponType) => {
    setTransferType(type);
    setTransferTargetId(siblings[0]?.id ?? null);
    setTransferQty(1);
    setTransferError('');
    setTransferSuccess(false);
  };

  const closeTransfer = () => setTransferType(null);

  const handleTransfer = async () => {
    if (!selectedChild || !transferType || !transferTargetId) return;
    setTransferSubmitting(true);
    setTransferError('');
    try {
      const res = await apiClient.post('/profiles/coupons/transfer', {
        fromChildId: selectedChild.id,
        toChildId: transferTargetId,
        couponTypeId: transferType.id,
        quantity: transferQty,
      });
      if (res.data.success) {
        setTransferSuccess(true);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setTransferError(res.data.message || (lang === 'en' ? 'Transfer failed' : 'โอนคูปองไม่สำเร็จ'));
      }
    } catch (err: any) {
      setTransferError(err.response?.data?.message || (lang === 'en' ? 'Transfer failed' : 'โอนคูปองไม่สำเร็จ'));
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleBuy = async (pkg: Package) => {
    if (!selectedChild) {
      setErrorMsg(lang === 'en' ? 'Please select a child first' : 'กรุณาเลือกโปรไฟล์เด็กก่อน');
      return;
    }
    setSubmittingId(pkg.id);
    setErrorMsg('');
    try {
      const res = await apiClient.post(`/packages/${pkg.id}/purchase`, {
        childId: selectedChild.id,
        userId: user?.id,
      });
      if (res.data.success) {
        if (res.data.paymentUrl) {
          // Same-tab redirect rather than window.open(_blank) — one
          // continuous flow with no second tab to find/manage; Beam's own
          // redirectUrl brings the user back once payment completes.
          window.location.href = res.data.paymentUrl;
        } else {
          navigate(`/package-purchase-success?purchaseId=${res.data.id}`);
        }
      } else {
        setErrorMsg(res.data.message || (lang === 'en' ? 'Something went wrong' : 'เกิดข้อผิดพลาด'));
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || (lang === 'en' ? 'Something went wrong' : 'เกิดข้อผิดพลาด'));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f6] pb-24 relative font-sans max-w-[430px] mx-auto md:max-w-[680px] lg:max-w-[900px] xl:max-w-[1100px]">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">
            {lang === 'en' ? 'My Coupons' : 'คูปองของฉัน'}
          </h1>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            {lang === 'en' ? 'Tickets & Packages' : 'ตั๋วเรียนและแพ็คเกจ'}
          </span>
        </div>
        <div className="w-10" />
      </header>

      <main className="p-4">
        {/* Wallet content stays at a reading width even on wide screens —
            these are full-width detail cards (title+price+tags+button),
            not square catalog tiles, so a multi-column grid would squeeze
            them rather than help. */}
        <div className="md:max-w-[640px] lg:max-w-[820px] md:mx-auto">
        {/* Child selector */}
        {children.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            {children.map(c => (
              <button
                key={c.id}
                onClick={() => selectChild(c.id)}
                className={`px-4 py-2 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${
                  selectedChildId === c.id ? 'bg-mellow-purple text-white shadow-md' : 'bg-white text-slate-500 border border-slate-100'
                }`}
              >
                {c.nickname || c.name}
              </button>
            ))}
          </div>
        )}

        {/* Owned coupons — every coupon type that exists in the system is
            listed, even ones this child has 0 of (previously a type with no
            balance row just silently disappeared instead of showing 0). */}
        {selectedChild && (
          <div className="bg-white rounded-3xl p-5 mb-6 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              {lang === 'en' ? `${selectedChild.nickname || selectedChild.name}'s Tickets` : `คูปองของ ${selectedChild.nickname || selectedChild.name}`}
            </p>
            {couponTypes.length === 0 ? (
              <p className="text-sm text-slate-400 font-bold py-2">
                {lang === 'en' ? 'No coupon types configured yet' : 'ยังไม่มีประเภทคูปองในระบบ'}
              </p>
            ) : (
              <div className="space-y-3">
                {couponTypes.map(t => {
                  const owned = (selectedChild.coupons || []).find(c => c.id === t.id);
                  const balance = owned?.balance ?? 0;
                  return (
                    <div key={t.id} className="flex items-center gap-3.5 p-3.5 rounded-2xl" style={{ backgroundColor: `${t.color}15` }}>
                      <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}30` }}>
                        <Ticket size={34} style={{ color: t.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-3xl font-black leading-none" style={{ color: balance > 0 ? t.color : '#cbd5e1' }}>{balance}</p>
                        <p className="text-[12px] font-bold text-slate-500 truncate mt-1">{t.name}</p>
                      </div>
                      {siblings.length > 0 && balance > 0 && (
                        <button
                          onClick={() => openTransfer(t)}
                          className="shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                          style={{ color: t.color }}
                          aria-label={lang === 'en' ? 'Transfer to sibling' : 'โอนให้พี่น้อง'}
                        >
                          <ArrowLeftRight size={18} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 text-sm font-bold border border-red-100">
            <AlertCircle size={20} />
            {errorMsg}
          </div>
        )}

        <h3 className="text-sm font-black text-slate-700 mb-3 px-1 uppercase tracking-widest">
          {lang === 'en' ? 'Buy More Tickets' : 'แพ็คเกจให้เลือกซื้อ'}
        </h3>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-1/2 bg-slate-200 rounded-full" />
                    <div className="h-3 w-3/4 bg-slate-100 rounded-full" />
                  </div>
                  <div className="h-5 w-14 bg-slate-200 rounded-full shrink-0" />
                </div>
                <div className="h-6 w-24 bg-slate-100 rounded-full" />
                <div className="h-11 w-full bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="text-center py-10 text-sm font-bold text-slate-400">
            {lang === 'en' ? 'No packages available right now' : 'ยังไม่มีแพ็คเกจให้ซื้อในตอนนี้'}
          </div>
        ) : (
          <div className="space-y-3">
            {packages.map(pkg => (
              <div key={pkg.id} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-black text-slate-800">{pkg.name}</h3>
                    {pkg.description && <p className="text-xs text-slate-500 font-medium mt-0.5">{pkg.description}</p>}
                  </div>
                  <span className="text-xl font-black text-mellow-red shrink-0">
                    {pkg.price > 0 ? `฿${pkg.price.toLocaleString()}` : (lang === 'en' ? 'Free' : 'ฟรี')}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {pkg.coupons.filter(c => c.quantity > 0).map((c, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                      style={{ backgroundColor: `${typeColor(c.typeId)}20`, color: typeColor(c.typeId) }}
                    >
                      <Ticket size={12} />
                      {typeName(c.typeId)} x{c.quantity}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleBuy(pkg)}
                  disabled={submittingId === pkg.id}
                  className="w-full py-3 bg-mellow-purple text-white rounded-xl font-black text-sm disabled:opacity-50 active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                  <CreditCard size={16} />
                  {submittingId === pkg.id ? (lang === 'en' ? 'Processing...' : 'กำลังดำเนินการ...') : (lang === 'en' ? 'Buy Now' : 'ซื้อเลย')}
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
      </main>

      {transferType && selectedChild && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-5" onClick={closeTransfer}>
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <h3 className="font-black text-slate-800">
                {lang === 'en' ? `Transfer ${transferType.name}` : `โอน${transferType.name}`}
              </h3>
              <button onClick={closeTransfer} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
                <X size={16} />
              </button>
            </div>

            {transferSuccess ? (
              <div className="p-8 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <Check size={28} className="text-green-600" />
                </div>
                <p className="font-black text-slate-800">
                  {lang === 'en' ? 'Transfer complete!' : 'โอนคูปองสำเร็จ!'}
                </p>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {lang === 'en' ? `From ${selectedChild.nickname || selectedChild.name} to:` : `จาก ${selectedChild.nickname || selectedChild.name} ไปยัง:`}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {siblings.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setTransferTargetId(s.id)}
                      className={`px-4 py-2 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${
                        transferTargetId === s.id ? 'bg-mellow-purple text-white shadow-md' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {s.nickname || s.name}
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {lang === 'en' ? 'Quantity' : 'จำนวน'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setTransferQty(q => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-lg active:scale-90 transition-transform"
                    >
                      −
                    </button>
                    <span className="text-2xl font-black w-10 text-center">{transferQty}</span>
                    <button
                      onClick={() => {
                        const owned = (selectedChild.coupons || []).find(c => c.id === transferType.id);
                        const max = owned?.balance ?? 0;
                        setTransferQty(q => Math.min(max, q + 1));
                      }}
                      className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-lg active:scale-90 transition-transform"
                    >
                      +
                    </button>
                  </div>
                </div>

                {transferError && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-xs font-bold border border-red-100">
                    <AlertCircle size={16} />
                    {transferError}
                  </div>
                )}

                <button
                  onClick={handleTransfer}
                  disabled={transferSubmitting || !transferTargetId}
                  className="w-full py-3.5 bg-mellow-purple text-white rounded-xl font-black text-sm disabled:opacity-50 active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                  <ArrowLeftRight size={16} />
                  {transferSubmitting ? (lang === 'en' ? 'Transferring...' : 'กำลังโอน...') : (lang === 'en' ? 'Confirm Transfer' : 'ยืนยันการโอน')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCoupons;
