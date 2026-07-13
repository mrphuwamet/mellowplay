import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Phone, Mail, User, ChevronLeft, ChevronRight, MessageCircle, AlertCircle, EyeOff, Eye, Plus, ArrowRight, Trash2, Calendar, Users } from 'lucide-react';
import { Toast } from '../components/Toast';
import apiClient from '../utils/apiClient';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import PinInput from '../components/PinInput';
import { cleanNamePrefix } from '../utils/nameUtils';

interface ChildInput {
  name: string;
  nickname: string;
  gender: string;
  dob: string;
  relation: string;
  customRelation?: string;
}

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirect = searchParams.get('redirect');
  const { t, language } = useTranslation();
  
  // Form State
  const [step, setStep] = useState<'consent' | 'info' | 'otp' | 'pin' | 'children' | 'summary'>('consent');
  const [formData, setFormData] = useState({
    phone: '',
    firstName: '',
    lastName: '',
    password: '',
    email: '',
    lineId: '',
    address: '',
    pdpaConsent: false,
    marketingConsent: false,
    otp: ''
  });
  
  const [children, setChildren] = useState<ChildInput[]>([
    { firstName: '', lastName: '', nickname: '', gender: 'Boy', dob: '', relation: 'Mother', customRelation: '' }
  ]);
  
  const [prevPhone, setPrevPhone] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugOtp, setDebugOtp] = useState('');
  const [otpRef, setOtpRef] = useState('');
  
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create');
  
  const [resendTimer, setResendTimer] = useState(60);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'otp' && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Skip OTP if phone hasn't changed since last verification
    if (prevPhone && prevPhone === formData.phone) {
      setStep('pin');
      return;
    }
    
    if (step === 'otp' && resendTimer > 0) return; // Prevent spam

    setIsLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/request-otp', { phone: formData.phone, email: formData.email });
      if (response.data.success) {
        setFormData(prev => ({ ...prev, otp: '' }));
        setOtpRef(response.data.ref || '');
        setStep('otp');
        setResendTimer(60);
        if (response.data.debug_otp) {
          setDebugOtp(response.data.debug_otp);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.register.otpFailed);
      setFormData(prev => ({ ...prev, otp: '' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.otp.length !== 6) {
      setError(t.register.invalidOtp);
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const response = await apiClient.post('/auth/verify-otp', {
        phone: formData.phone,
        otp: formData.otp
      });
      
      if (response.data.success) {
        setPrevPhone(formData.phone);
        setStep('pin');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.register.invalidOtp);
      setFormData(prev => ({ ...prev, otp: '' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChild = () => {
    setChildren([...children, { firstName: '', lastName: '', nickname: '', gender: 'Boy', dob: '', relation: 'Mother', customRelation: '' }]);
  };

  const handleRemoveChild = (index: number) => {
    if (children.length > 1) {
      const newChildren = [...children];
      newChildren.splice(index, 1);
      setChildren(newChildren);
    }
  };

  const handleChildChange = (index: number, field: keyof ChildInput, value: string) => {
    const newChildren = [...children];
    newChildren[index][field] = value;
    setChildren(newChildren);
  };

  const handleNextToSummary = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if at least 1 child has firstName and dob
    const validChildren = children.filter(c => c.firstName && c.dob);
    
    if (validChildren.length === 0) {
      setError(t.register.fillAtLeastOneChild);
      return;
    }
    
    setError('');
    setStep('summary');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate pdpa consent
    if (!formData.pdpaConsent) {
      setError(t.register.pdpaConsent); // Simple fallback message
      return;
    }

    setIsLoading(true);
    setError('');

    const payload = {
      ...formData,
      children: children.filter(c => c.firstName && c.dob).map(c => ({
        ...c,
        name: `${cleanNamePrefix(c.firstName)} ${c.lastName ? cleanNamePrefix(c.lastName) : ''}`.trim(),
        relation: c.relation === 'Other' && c.customRelation ? c.customRelation : c.relation
      }))
    };

    try {
      const response = await apiClient.post('/auth/register', payload);
      if (response.data.success) {
        const loginUrl = '/login' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : '');
        navigate(loginUrl, { state: { message: 'Registration successful! Please login.' } });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.register.registerFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepInfo = () => (
    <form onSubmit={handleRequestOtp} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
         <div className="relative">
            <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.firstNameLabel}</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <User size={18} />
              </div>
              <input
                type="text"
                placeholder={t.register.firstName}
              value={formData.firstName}
              onChange={(e) => setFormData({...formData, firstName: e.target.value})}
              className="w-full pl-11 pr-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
              required
            />
          </div>
         </div>
         <div className="relative">
            <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.lastNameLabel}</label>
            <input
              type="text"
              placeholder={t.register.lastName}
              value={formData.lastName}
              onChange={(e) => setFormData({...formData, lastName: e.target.value})}
              className="w-full px-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
              required
            />
         </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.phoneLabel}</label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Phone size={20} />
          </div>
          <input
            type="tel"
            placeholder={t.register.phone}
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
            className="w-full pl-12 pr-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
            required
          />
        </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.emailLabel}</label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Mail size={20} />
          </div>
          <input
            type="email"
            placeholder={t.register.email}
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className="w-full pl-12 pr-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
            required
          />
        </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.lineIdLabel}</label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <MessageCircle size={20} />
          </div>
          <input
            type="text"
            placeholder={t.register.lineId}
            value={formData.lineId}
            onChange={(e) => setFormData({...formData, lineId: e.target.value})}
            className="w-full pl-12 pr-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.addressLabel}</label>
        <textarea
          placeholder={t.register.addressPlaceholder}
          value={formData.address}
          onChange={(e) => setFormData({...formData, address: e.target.value})}
          className="w-full px-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none resize-none"
          rows={3}
        />
      </div>



      <button type="submit" disabled={isLoading} className="w-full mellow-btn-primary mt-6">
        {isLoading ? <Loader2 className="animate-spin" /> : <>{t.register.nextStep} <ArrowRight size={20} /></>}
      </button>
    </form>
  );

  const renderStepOtp = () => (
    <form onSubmit={handleVerifyOtp} className="space-y-6">
      <div className="flex justify-center gap-2">
        <PinInput 
          length={6} 
          value={formData.otp} 
          onChange={(val) => setFormData({...formData, otp: val})} 
          type="text"
        />
      </div>

      {otpRef && (
        <div className="text-center text-sm font-black text-slate-600 bg-slate-50 border border-slate-100 py-3 rounded-2xl">
          {language === 'th' ? `รหัสอ้างอิง (Ref): ${otpRef}` : `Reference Code: ${otpRef}`}
        </div>
      )}

      {debugOtp && (
        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl text-center text-[14px] font-black uppercase tracking-widest">
           Debug OTP: {debugOtp}
        </div>
      )}

      <button type="submit" className="w-full mellow-btn-primary">
        {t.register.verifyNext} <ArrowRight size={20} />
      </button>

      <p className="text-center text-slate-400 text-xs font-bold mt-2">
        {resendTimer > 0 ? (
          <span>กรุณารอ {resendTimer} วินาที เพื่อส่งรหัสใหม่</span>
        ) : (
          <>
            {t.register.didntReceive}{' '}
            <button 
              type="button" 
              onClick={() => handleRequestOtp()} 
              className="text-mellow-purple underline font-black"
            >
              {t.register.resend}
            </button>
          </>
        )}
      </p>
    </form>
  );

  const renderStepPin = () => (
    <div className="space-y-6 mt-4">
      <PinInput 
        length={6} 
        value={pinStep === 'create' ? formData.password : confirmPassword} 
        onChange={(val) => {
          if (pinStep === 'create') {
            setFormData({...formData, password: val});
            if (val.length === 6) {
              setTimeout(() => setPinStep('confirm'), 300);
            }
          } else {
            setConfirmPassword(val);
            if (val.length === 6) {
              if (val === formData.password) {
                setTimeout(() => setStep('children'), 300);
              } else {
                setError(t.register.pinNotMatch);
                setConfirmPassword('');
                setPinStep('create');
                setFormData({...formData, password: ''});
              }
            }
          }
        }} 
      />

      <div className="flex justify-between items-center mt-6">
        <button 
          type="button" 
          onClick={() => {
            if (pinStep === 'confirm') {
              setPinStep('create');
              setConfirmPassword('');
              setFormData({...formData, password: ''});
            } else {
              setStep('info');
              setFormData({...formData, password: ''});
            }
          }} 
          className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft size={16} className="mr-1" /> ย้อนกลับ
        </button>
      </div>
    </div>
  );

  const renderStepChildren = () => (
    <form onSubmit={handleNextToSummary} className="space-y-6">
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {children.map((child, index) => (
          <div key={index} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 relative group">
            {children.length > 1 && (
              <button 
                type="button" 
                onClick={() => handleRemoveChild(index)}
                className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
              >
                <Trash2 size={16} />
              </button>
            )}
            
            <div className="mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-mellow-purple/10 text-mellow-purple flex items-center justify-center text-xs font-black">
                {index + 1}
              </div>
              <h3 className="font-black text-mellow-ink text-sm">{t.register.childInfo}</h3>
            </div>

            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.firstNameLabel}</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      placeholder={t.register.firstName}
                      value={child.firstName}
                      onChange={(e) => handleChildChange(index, 'firstName', e.target.value)}
                      className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    />
                  </div>
                </div>
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.lastNameLabel}</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      placeholder={t.register.lastName}
                      value={child.lastName}
                      onChange={(e) => handleChildChange(index, 'lastName', e.target.value)}
                      className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-mellow-purple/70 font-bold -mt-2">
                * {t.register.noTitlePrefix}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.nickname}</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      placeholder={t.register.nickname}
                      value={child.nickname}
                      onChange={(e) => handleChildChange(index, 'nickname', e.target.value)}
                      className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    />
                  </div>
                </div>
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">เพศ (Gender)</label>
                  <select
                    value={child.gender}
                    onChange={(e) => handleChildChange(index, 'gender', e.target.value)}
                    className="w-full px-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none appearance-none"
                  >
                    <option value="Boy">{t.register.genderBoy}</option>
                    <option value="Girl">{t.register.genderGirl}</option>
                    <option value="Other">{t.register.genderOther}</option>
                  </select>
                </div>
              </div>

              <div className="relative">
                <label className="text-xs font-bold text-slate-500 mb-1 block">วันเกิด (Date of Birth)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Calendar size={18} />
                  </div>
                  <input
                    type="date"
                    value={child.dob}
                    onChange={(e) => handleChildChange(index, 'dob', e.target.value)}
                    className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="relative">
                <label className="text-xs font-bold text-slate-500 mb-1 block">ความสัมพันธ์ (Relation)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Users size={18} />
                  </div>
                  <select
                    value={child.relation}
                    onChange={(e) => handleChildChange(index, 'relation', e.target.value)}
                    className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none appearance-none"
                  >
                    <option value="Father">{t.register.father}</option>
                    <option value="Mother">{t.register.mother}</option>
                    <option value="Relative">{t.register.relative}</option>
                    <option value="Other">{t.register.other}</option>
                  </select>
                </div>
              </div>

              {child.relation === 'Other' && (
                <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                  <input
                    type="text"
                    placeholder={t.register?.specifyRelation || 'Please specify relationship...'}
                    value={child.customRelation || ''}
                    onChange={(e) => handleChildChange(index, 'customRelation', e.target.value)}
                    className="w-full px-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    required
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button 
        type="button" 
        onClick={handleAddChild}
        className="w-full py-[14px] border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 font-bold text-sm hover:border-mellow-purple hover:text-mellow-purple transition-all"
      >
        <Plus size={18} /> {t.register.addChild}
      </button>

      <div className="mt-6">
        <button type="submit" disabled={isLoading} className="w-full mellow-btn-primary !mt-0">
          {t.register.nextStep} <ArrowRight size={20} />
        </button>
      </div>
    </form>
  );

  const renderStepConsent = () => (
    <form onSubmit={(e) => { e.preventDefault(); setStep('info'); }} className="space-y-6 flex flex-col flex-1 pb-6">
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex-1 min-h-[150px] max-h-[35vh] overflow-y-auto">
        <p className="text-xs text-slate-600 font-medium whitespace-pre-wrap leading-relaxed">
          {t.register.pdpaPolicyText}
        </p>
      </div>

      <div className="space-y-4">
        <label className="flex items-start gap-3 p-5 bg-slate-50 rounded-3xl border border-slate-100 cursor-pointer hover:border-mellow-purple/30 transition-all">
          <input 
            type="checkbox" 
            checked={formData.pdpaConsent}
            onChange={(e) => setFormData({...formData, pdpaConsent: e.target.checked})}
            className="mt-1 w-5 h-5 rounded border-slate-300 text-mellow-purple focus:ring-mellow-purple shrink-0"
            required
          />
          <span className="text-sm font-bold text-slate-600 leading-relaxed">{t.register.pdpaConsent}</span>
        </label>
        
        <label className="flex items-start gap-3 p-5 bg-slate-50 rounded-3xl border border-slate-100 cursor-pointer hover:border-mellow-purple/30 transition-all">
          <input 
            type="checkbox" 
            checked={formData.marketingConsent}
            onChange={(e) => setFormData({...formData, marketingConsent: e.target.checked})}
            className="mt-1 w-5 h-5 rounded border-slate-300 text-mellow-purple focus:ring-mellow-purple shrink-0"
          />
          <span className="text-sm font-bold text-slate-600 leading-relaxed">{t.register.marketingConsent}</span>
        </label>
      </div>

      <div className="mt-auto pt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setFormData({...formData, pdpaConsent: true, marketingConsent: true})}
          className="w-full text-sm font-bold text-mellow-purple hover:text-purple-700 bg-purple-50 py-4 rounded-[18px] transition-all"
        >
          {t.register.acceptAll}
        </button>

        <button type="submit" disabled={isLoading} className="w-full mellow-btn-primary">
          {isLoading ? <Loader2 className="animate-spin" /> : <>{t.register.nextStep} <ArrowRight size={20} /></>}
        </button>
      </div>
    </form>
  );

  const renderStepSummary = () => (
    <div className="flex flex-col flex-1 pb-6 space-y-6">
      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
        <h3 className="text-sm font-black text-slate-800 mb-3">{language === 'th' ? 'ข้อมูลผู้ปกครอง' : 'Parent Info'}</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.firstName}:</span> <span className="font-bold text-slate-800">{formData.firstName} {formData.lastName}</span></p>
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.phone}:</span> <span className="font-bold text-slate-800">{formData.phone}</span></p>
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.email}:</span> <span className="font-bold text-slate-800">{formData.email}</span></p>
        </div>
      </div>
      
      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
        <h3 className="text-sm font-black text-slate-800 mb-3">{language === 'th' ? 'ข้อมูลลูก' : 'Children Info'}</h3>
        <div className="space-y-4">
          {children.filter(c => c.firstName && c.dob).map((child, i) => (
            <div key={i} className="text-sm border-b border-slate-200 pb-2 last:border-0 last:pb-0">
              <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.firstName}:</span> <span className="font-bold text-slate-800">{child.firstName} {child.lastName} {child.nickname && `(${child.nickname})`}</span></p>
              <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.dateOfBirth}:</span> <span className="font-bold text-slate-800">{child.dob}</span></p>
              <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.relationship}:</span> <span className="font-bold text-slate-800">{child.relation === 'Other' ? child.customRelation : child.relation}</span></p>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-mellow-purple/5 p-4 rounded-2xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-mellow-purple/20 flex items-center justify-center text-mellow-purple shrink-0">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <p className="text-xs font-bold text-slate-600">{t.register.pdpaConsent}</p>
      </div>

      <div className="mt-auto pt-4">
        <button onClick={handleRegister} disabled={isLoading} className="w-full mellow-btn-primary">
          {isLoading ? <Loader2 className="animate-spin" /> : <>{t.register.complete} <ArrowRight size={20} /></>}
        </button>
      </div>
    </div>
  );

  const getStepTitle = () => {
    switch(step) {
      case 'info': return t.register.stepInfo;
      case 'otp': return t.register.stepOtp;
      case 'pin': return pinStep === 'create' ? t.register.stepPinCreate : t.register.stepPinConfirm;
      case 'children': return t.register.stepChildren;
      case 'consent': return t.register.stepConsent;
      case 'summary': return t.register.stepSummary;
      default: return '';
    }
  };

  const getStepDesc = () => {
    switch(step) {
      case 'info': return t.register.stepInfoDesc;
      case 'otp': return `${t.register.stepOtpDesc} ${formData.phone}`;
      case 'pin': return pinStep === 'create' ? t.register.stepPinCreateDesc : t.register.stepPinConfirmDesc;
      case 'children': return t.register.stepChildrenDesc;
      case 'consent': return t.register.stepConsentDesc;
      case 'summary': return t.register.stepSummaryDesc;
      default: return '';
    }
  };

  return (
    <div className="mellow-page flex flex-col px-8 bg-white">
      <header className="pt-10 mb-8 flex justify-between items-center">
        <button 
          onClick={() => {
            if (step === 'consent') {
              navigate('/login');
            } else if (step === 'info') {
              setStep('consent');
            } else if (step === 'otp') {
              setStep('info');
            } else if (step === 'pin') {
              setStep('info');
            } else if (step === 'children') {
              setPinStep('create');
              setFormData({...formData, password: ''});
              setStep('pin');
            } else if (step === 'summary') {
              setStep('children');
            }
          }} 
          className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <ChevronLeft size={24} />
        </button>
        <LanguageToggle />
      </header>

      <div className="text-center mb-10">
        <h1 className="text-2xl font-black text-mellow-ink">
          {getStepTitle()}
        </h1>
        <p className="text-slate-400 font-bold mt-2">
          {getStepDesc()}
        </p>
      </div>

      <Toast message={error || ''} type="error" onClose={() => setError('')} />

      <div className="flex-1 flex flex-col">
        {step === 'consent' && renderStepConsent()}
        {step === 'info' && renderStepInfo()}
        {step === 'otp' && renderStepOtp()}
        {step === 'pin' && renderStepPin()}
        {step === 'children' && renderStepChildren()}
        {step === 'summary' && renderStepSummary()}
      </div>

      <div className="mt-8 mb-4 text-center">
        <button 
          onClick={() => setShowCancelModal(true)}
          className="text-red-500 font-bold text-sm underline underline-offset-4 decoration-red-200 hover:decoration-red-500 transition-colors"
        >
          {t.register.cancelRegistration}
        </button>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowCancelModal(false)} />
          <div className="relative w-full max-w-xs bg-white rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{t.register.confirmCancelTitle}</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">{t.register.confirmCancelDesc}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-[14px] rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200"
              >
                {t.register.confirmCancelNo}
              </button>
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  navigate('/login');
                }}
                className="flex-1 py-[14px] rounded-xl font-bold text-white bg-red-500 hover:bg-red-600"
              >
                {t.register.confirmCancelYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;

