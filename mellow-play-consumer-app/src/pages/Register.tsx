import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Lock, ArrowRight, Loader2, User, ChevronLeft, Calendar, Users, Plus, Trash2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';

interface ChildInput {
  name: string;
  dob: string;
  relation: string;
}

const Register = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Form State
  const [step, setStep] = useState<'info' | 'otp' | 'children'>('info');
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
    firstName: '',
    lastName: '',
    otp: ''
  });
  
  const [children, setChildren] = useState<ChildInput[]>([
    { name: '', dob: '', relation: 'Mother' }
  ]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugOtp, setDebugOtp] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/request-otp', { phone: formData.phone });
      if (response.data.success) {
        setStep('otp');
        if (response.data.debug_otp) {
          setDebugOtp(response.data.debug_otp);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.register.otpFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.otp.length === 6) {
      setStep('children');
    } else {
      setError(t.register.invalidOtp);
    }
  };

  const handleAddChild = () => {
    setChildren([...children, { name: '', dob: '', relation: 'Mother' }]);
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate children
    const invalidChild = children.find(c => !c.name || !c.dob || !c.relation);
    if (invalidChild) {
      setError(t.register.fillChildInfo);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/register', {
        ...formData,
        children
      });
      if (response.data.success) {
        navigate('/login', { state: { message: 'Registration successful! Please login.' } });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.register.registerFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepInfo = () => (
    <form onSubmit={handleRequestOtp} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
         <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <User size={18} />
            </div>
            <input
              type="text"
              placeholder={t.register.firstName}
              value={formData.firstName}
              onChange={(e) => setFormData({...formData, firstName: e.target.value})}
              className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
              required
            />
         </div>
         <input
            type="text"
            placeholder={t.register.lastName}
            value={formData.lastName}
            onChange={(e) => setFormData({...formData, lastName: e.target.value})}
            className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
            required
          />
      </div>

      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          <Phone size={20} />
        </div>
        <input
          type="tel"
          placeholder={t.register.phone}
          value={formData.phone}
          onChange={(e) => setFormData({...formData, phone: e.target.value})}
          className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
          required
        />
      </div>

      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          <Lock size={20} />
        </div>
        <input
          type="password"
          placeholder={t.register.password}
          value={formData.password}
          onChange={(e) => setFormData({...formData, password: e.target.value})}
          className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
          required
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
         <input
            type="text"
            maxLength={6}
            placeholder="000000"
            value={formData.otp}
            onChange={(e) => setFormData({...formData, otp: e.target.value})}
            className="w-full max-w-[200px] text-center tracking-[1em] text-2xl font-black py-4 bg-slate-50 border-2 border-mellow-purple/20 rounded-2xl focus:border-mellow-purple focus:outline-none transition-all"
            required
            autoFocus
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

      <p className="text-center text-slate-400 text-xs font-bold">
        {t.register.didntReceive} <span className="text-mellow-purple underline">{t.register.resend}</span>
      </p>
    </form>
  );

  const renderStepChildren = () => (
    <form onSubmit={handleRegister} className="space-y-6">
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

            <div className="space-y-3">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  placeholder={t.register.childName}
                  value={child.name}
                  onChange={(e) => handleChildChange(index, 'name', e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Calendar size={18} />
                </div>
                <input
                  type="date"
                  value={child.dob}
                  onChange={(e) => handleChildChange(index, 'dob', e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Users size={18} />
                </div>
                <select
                  value={child.relation}
                  onChange={(e) => handleChildChange(index, 'relation', e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none appearance-none"
                  required
                >
                  <option value="Father">{t.register.father}</option>
                  <option value="Mother">{t.register.mother}</option>
                  <option value="Relative">{t.register.relative}</option>
                  <option value="Other">{t.register.other}</option>
                </select>
              </div>
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

      <button type="submit" disabled={isLoading} className="w-full mellow-btn-primary mt-4">
        {isLoading ? <Loader2 className="animate-spin" /> : <>{t.register.complete} <ArrowRight size={20} /></>}
      </button>
    </form>
  );

  const getStepTitle = () => {
    switch(step) {
      case 'info': return t.register.stepInfo;
      case 'otp': return t.register.stepOtp;
      case 'children': return t.register.stepChildren;
      default: return '';
    }
  };

  const getStepDesc = () => {
    switch(step) {
      case 'info': return t.register.stepInfoDesc;
      case 'otp': return `${t.register.stepOtpDesc} ${formData.phone}`;
      case 'children': return t.register.stepChildrenDesc;
      default: return '';
    }
  };

  return (
    <div className="mellow-page flex flex-col px-8 bg-white">
      <header className="pt-10 mb-8">
        <button 
          onClick={() => {
            if (step === 'otp') setStep('info');
            else if (step === 'children') setStep('otp');
            else navigate('/login');
          }} 
          className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-all"
        >
          <ChevronLeft size={24} />
        </button>
      </header>

      <div className="text-center mb-10">
        <h1 className="text-2xl font-black text-mellow-ink">
          {getStepTitle()}
        </h1>
        <p className="text-slate-400 font-bold mt-2">
          {getStepDesc()}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-500 rounded-2xl text-xs font-bold border border-red-100 text-center animate-shake">
          {error}
        </div>
      )}

      {step === 'info' && renderStepInfo()}
      {step === 'otp' && renderStepOtp()}
      {step === 'children' && renderStepChildren()}
      
      {step !== 'children' && (
        <p className="text-center mt-8 text-slate-400 text-sm font-bold">
          {t.register.hasAccount} <span onClick={() => navigate('/login')} className="text-mellow-purple cursor-pointer underline">{t.register.loginLink}</span>
        </p>
      )}
    </div>
  );
};

export default Register;
