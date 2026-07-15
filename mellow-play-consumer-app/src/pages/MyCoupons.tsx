import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Ticket, CreditCard, AlertCircle } from 'lucide-react';
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
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

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
          window.open(res.data.paymentUrl, '_blank');
          setPaymentUrl(res.data.paymentUrl);
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
    <div className="min-h-screen bg-[#f4f7f6] pb-24 relative font-sans">
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

        {/* Owned coupons — prominent, shown first */}
        {selectedChild && (
          <div className="bg-white rounded-3xl p-5 mb-6 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              {lang === 'en' ? `${selectedChild.nickname || selectedChild.name}'s Tickets` : `ตั๋วของ ${selectedChild.nickname || selectedChild.name}`}
            </p>
            {(selectedChild.coupons || []).length === 0 ? (
              <p className="text-sm text-slate-400 font-bold py-2">
                {lang === 'en' ? 'No tickets yet' : 'ยังไม่มีตั๋วเรียน'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(selectedChild.coupons || []).map(c => (
                  <div key={c.id} className="flex items-center gap-2.5 p-3 rounded-2xl" style={{ backgroundColor: `${c.color}15` }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.color}30` }}>
                      <Ticket size={16} style={{ color: c.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-500 truncate">{c.name}</p>
                      <p className="text-xl font-black leading-none" style={{ color: c.color }}>{c.balance}</p>
                    </div>
                  </div>
                ))}
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
          <div className="text-center py-10 opacity-50">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-mellow-ink rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold">{lang === 'en' ? 'Loading...' : 'กำลังโหลด...'}</p>
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
      </main>

      {paymentUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden">
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
                onClick={() => setPaymentUrl(null)}
                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl text-[15px] font-black text-center active:scale-95 transition-all"
              >
                {lang === 'en' ? 'Close' : 'ปิด'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCoupons;
