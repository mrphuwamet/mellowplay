import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Phone, Mail, User, ChevronLeft, ChevronRight, MessageCircle, AlertCircle, EyeOff, Eye, Plus, ArrowRight, Trash2 } from 'lucide-react';
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
  const { t } = useTranslation();
  
  // Form State
  const [step, setStep] = useState<'info' | 'otp' | 'pin' | 'children' | 'consent'>('info');
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
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugOtp, setDebugOtp] = useState('');
  
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
    if (step === 'otp' && resendTimer > 0) return; // Prevent spam

    setIsLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/request-otp', { phone: formData.phone, email: formData.email });
      if (response.data.success) {
        setFormData(prev => ({ ...prev, otp: '' }));
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

  const handleNextToConsent = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if any child has partial information
    const filledChildren = children.filter(c => c.firstName || c.lastName || c.nickname || c.dob);
    const invalidChild = filledChildren.find(c => !c.firstName || !c.lastName || !c.nickname || !c.gender || !c.dob || !c.relation || (c.relation === 'Other' && !c.customRelation));
    
    if (invalidChild) {
      setError(t.register.fillChildInfo);
      return;
    }
    
    // If no children are filled, we just proceed. We will filter empty ones out during submit.
    setError('');
    setStep('consent');
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
      children: children.filter(c => c.firstName && c.lastName && c.dob).map(c => ({
        ...c,
        name: `${cleanNamePrefix(c.firstName)} ${cleanNamePrefix(c.lastName)}`.trim(),
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
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
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
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
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
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
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
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
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
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.addressLabel}</label>
        <textarea
          placeholder={t.register.addressPlaceholder}
          value={formData.address}
          onChange={(e) => setFormData({...formData, address: e.target.value})}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none resize-none"
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
            } else {
              setStep('otp');
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
    <form onSubmit={handleNextToConsent} className="space-y-6">
      <div className="text-center">
        <p className="text-sm font-bold text-slate-500">(คุณสามารถข้ามขั้นตอนนี้และเพิ่มข้อมูลลูกภายหลังได้)</p>
      </div>
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
                  <label className="text-xs font-bold text-slate-500 mb-1 block">ชื่อ (First Name)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      placeholder="ชื่อจริง"
                      value={child.firstName}
                      onChange={(e) => handleChildChange(index, 'firstName', e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    />
                  </div>
                </div>
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">นามสกุล (Last Name)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      placeholder="นามสกุล"
                      value={child.lastName}
                      onChange={(e) => handleChildChange(index, 'lastName', e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-mellow-purple/70 font-bold -mt-2">
                * {lang === 'th' ? 'ไม่ต้องระบุคำนำหน้าชื่อ (เช่น ด.ช., ด.ญ.)' : 'No title prefix needed (e.g. Master, Miss)'}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">ชื่อเล่น (Nickname)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      placeholder={t.register.nickname}
                      value={child.nickname}
                      onChange={(e) => handleChildChange(index, 'nickname', e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    />
                  </div>
                </div>
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">เพศ (Gender)</label>
                  <select
                    value={child.gender}
                    onChange={(e) => handleChildChange(index, 'gender', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none appearance-none"
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
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
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
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none appearance-none"
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
                    className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
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
        className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 font-bold text-sm hover:border-mellow-purple hover:text-mellow-purple transition-all"
      >
        <Plus size={18} /> {t.register.addChild}
      </button>

      <div className="flex gap-3 mt-6">
        <button 
          type="button" 
          onClick={() => {
            setChildren([]);
            setStep('consent');
          }}
          className="w-1/3 py-4 rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center"
        >
          {t.register.skip}
        </button>
        <button type="submit" disabled={isLoading} className="w-2/3 mellow-btn-primary !mt-0">
          {t.register.nextStep} <ArrowRight size={20} />
        </button>
      </div>
    </form>
  );

  const renderStepConsent = () => (
    <form onSubmit={handleRegister} className="space-y-6 flex flex-col flex-1 pb-6">
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
          {isLoading ? <Loader2 className="animate-spin" /> : <>{t.register.complete} <ArrowRight size={20} /></>}
        </button>
      </div>
    </form>
  );

  const getStepTitle = () => {
    switch(step) {
      case 'info': return t.register.stepInfo;
      case 'otp': return t.register.stepOtp;
      case 'pin': return pinStep === 'create' ? t.register.stepPinCreate : t.register.stepPinConfirm;
      case 'children': return t.register.stepChildren;
      case 'consent': return t.register.stepConsent;
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
      default: return '';
    }
  };

  return (
    <div className="mellow-page flex flex-col px-8 bg-white">
      <header className="pt-10 mb-8 flex justify-between items-center">
        <button 
          onClick={() => {
            if (step === 'info') {
              navigate(-1);
            } else {
              navigate('/login');
            }
          }} 
          className={`h-10 px-3 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-all shrink-0 ${step === 'info' ? 'w-10' : ''}`}
        >
          {step === 'info' ? (
            <ChevronLeft size={24} />
          ) : (
            <span className="text-sm font-bold text-slate-500 px-1">ยกเลิก</span>
          )}
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
        {step === 'info' && renderStepInfo()}
        {step === 'otp' && renderStepOtp()}
        {step === 'pin' && renderStepPin()}
        {step === 'children' && renderStepChildren()}
        {step === 'consent' && renderStepConsent()}
      </div>

      {step === 'info' && (
        <p className="text-center mt-8 text-slate-400 text-sm font-bold">
          {t.register.hasAccount} <span onClick={() => navigate('/login')} className="text-mellow-purple cursor-pointer underline">{t.register.loginLink}</span>
        </p>
      )}
    </div>
  );
};

export default Register;
