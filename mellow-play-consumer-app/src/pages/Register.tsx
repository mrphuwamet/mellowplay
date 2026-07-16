import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Phone, Mail, User, ChevronLeft, ChevronRight, MessageCircle, AlertCircle, EyeOff, Eye, Plus, ArrowRight, Trash2, Users, Camera } from 'lucide-react';
import { Toast } from '../components/Toast';
import apiClient from '../utils/apiClient';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import PinInput from '../components/PinInput';
import PinPad from '../components/PinPad';
import DateField from '../components/DateField';
import FieldHint from '../components/FieldHint';
import { cleanNamePrefix } from '../utils/nameUtils';
import logo from '../assets/ui/logo.svg';
import { TH } from 'country-flag-icons/react/3x2';
import { formatCustomDate } from '../utils/dateFormat';
import { getOtpErrorMessage } from '../utils/otpError';
import { useChildStore } from '../store/useChildStore';

const ddmmyyyyToISO = (value: string) => {
  const [d, m, y] = value.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

interface ChildInput {
  firstName: string;
  lastName: string;
  nickname: string;
  gender: string;
  dob: string;
  relation: string;
  customRelation?: string;
}

interface ChildFieldErrors {
  firstName?: string;
  lastName?: string;
  nickname?: string;
  gender?: string;
  dob?: string;
  customRelation?: string;
}

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirect = searchParams.get('redirect');
  const { t, lang } = useTranslation();
  const fetchChildren = useChildStore(state => state.fetchChildren);

  // Form State
  const [step, setStep] = useState<'consent' | 'info' | 'otp' | 'pin' | 'avatar' | 'summary'>('consent');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    phone: '',
    prefix: '',
    firstName: '',
    lastName: '',
    dob: '',
    password: '',
    email: '',
    lineId: '',
    address: '',
    pdpaConsent: false,
    marketingConsent: false,
    otp: ''
  });

  const [children, setChildren] = useState<ChildInput[]>([
    { firstName: '', lastName: '', nickname: '', gender: '', dob: '', relation: '', customRelation: '' }
  ]);

  const [fieldErrors, setFieldErrors] = useState<{
    prefix?: string; firstName?: string; lastName?: string; phone?: string; email?: string;
  }>({});
  const [childErrors, setChildErrors] = useState<ChildFieldErrors[]>([]);

  const [prevPhone, setPrevPhone] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [childToRemove, setChildToRemove] = useState<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
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

  // Red border/ring on whichever fields currently have an error, so the
  // problem is visible right on the input, not just in the floating hint.
  const errClass = (hasErr?: string) => hasErr ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-100';

  const validateInfoStep = () => {
    const errs: typeof fieldErrors = {};
    if (!formData.prefix) errs.prefix = t.register.requiredPrefix;
    if (!formData.firstName.trim()) errs.firstName = t.register.requiredFirstName;
    if (!formData.lastName.trim()) errs.lastName = t.register.requiredLastName;
    if (!formData.phone.trim()) {
      errs.phone = t.register.requiredPhone;
    } else if (formData.phone.replace(/\D/g, '').length !== 10) {
      // Thai mobile numbers are always 10 digits — catches typos/missing
      // digits here instead of only failing later when OTP send/verify
      // rejects a malformed number with a much less specific error.
      errs.phone = lang === 'en' ? 'Phone number must be 10 digits' : 'เบอร์โทรศัพท์ต้องมี 10 หลัก';
    }
    if (!formData.email.trim()) errs.email = t.register.requiredEmail;

    const cErrs: ChildFieldErrors[] = children.map((c) => {
      const e: ChildFieldErrors = {};
      if (!c.firstName.trim()) e.firstName = t.register.requiredFirstName;
      if (!c.lastName.trim()) e.lastName = t.register.requiredLastName;
      if (!c.nickname.trim()) e.nickname = t.register.requiredNickname;
      if (!c.gender) e.gender = t.register.requiredGender;
      if (!c.dob) e.dob = t.register.requiredDob;
      if (c.relation === 'Other' && !(c.customRelation || '').trim()) e.customRelation = t.register.requiredRelation;
      return e;
    });

    setFieldErrors(errs);
    setChildErrors(cErrs);

    const isValid = Object.keys(errs).length === 0 && !cErrs.some((e) => Object.keys(e).length > 0);

    if (!isValid) {
      // Scroll to the first invalid field, in on-screen order (parent
      // fields, then each child in turn) — otherwise an error at the very
      // top of a long form (e.g. missing prefix) is invisible if the user
      // was scrolled down filling in a child's details.
      let targetId: string | null = null;
      for (const key of ['prefix', 'firstName', 'lastName', 'phone', 'email'] as const) {
        if (errs[key]) { targetId = `reg-${key}`; break; }
      }
      if (!targetId) {
        outer: for (let i = 0; i < cErrs.length; i++) {
          for (const key of ['firstName', 'lastName', 'nickname', 'gender', 'dob', 'customRelation'] as const) {
            if (cErrs[i][key]) { targetId = `reg-child-${i}-${key}`; break outer; }
          }
        }
      }
      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    return isValid;
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validateInfoStep()) {
      return;
    }
    setError('');

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

        // otpRequired is false when OTP verification is switched off
        // system-wide (CRM > System Settings) — no code was ever sent, so
        // skip straight to PIN setup instead of showing an OTP screen.
        if (response.data.otpRequired === false) {
          setPrevPhone(formData.phone);
          setStep('pin');
          return;
        }

        setStep('otp');
        setResendTimer(60);
      }
    } catch (err: any) {
      // A duplicate phone/email is a validation problem with a specific
      // field, not a generic system error — pin it to that field as a
      // persistent hint (cleared once the user edits the field, same as
      // every other field error) and scroll to it, instead of a toast that
      // auto-dismisses and leaves no indication of which input is wrong.
      const status = err?.response?.status;
      const backendMessage = err?.response?.data?.message;
      if (status && status < 500 && backendMessage) {
        const isPhoneIssue = backendMessage.includes('เบอร์โทรศัพท์') || /phone/i.test(backendMessage);
        const isEmailIssue = backendMessage.includes('อีเมล') || /email/i.test(backendMessage);
        if (isPhoneIssue) {
          setFieldErrors(prev => ({ ...prev, phone: backendMessage }));
          document.getElementById('reg-phone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (isEmailIssue) {
          setFieldErrors(prev => ({ ...prev, email: backendMessage }));
          document.getElementById('reg-email')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          setError(backendMessage);
        }
      } else {
        setError(getOtpErrorMessage(err, lang, t.register.otpFailed));
      }
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
      setError(getOtpErrorMessage(err, lang, t.register.invalidOtp));
      setFormData(prev => ({ ...prev, otp: '' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChild = () => {
    setChildren([...children, { firstName: '', lastName: '', nickname: '', gender: '', dob: '', relation: '', customRelation: '' }]);
    setChildErrors((prev) => [...prev, {}]);
  };

  const handleRemoveChild = (index: number) => {
    if (children.length > 1) {
      const newChildren = [...children];
      newChildren.splice(index, 1);
      setChildren(newChildren);
      setChildErrors((prev) => {
        const newErrs = [...prev];
        newErrs.splice(index, 1);
        return newErrs;
      });
    }
  };

  const handleChildChange = (index: number, field: keyof ChildInput, value: string) => {
    const newChildren = [...children];
    newChildren[index][field] = value;
    setChildren(newChildren);

    setChildErrors((prev) => {
      if (!prev[index]?.[field as keyof ChildFieldErrors]) return prev;
      const newErrs = [...prev];
      newErrs[index] = { ...newErrs[index], [field]: undefined };
      return newErrs;
    });
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
      dob: formData.dob ? ddmmyyyyToISO(formData.dob) : '',
      children: children.filter(c => c.firstName && c.dob).map(c => ({
        ...c,
        dob: ddmmyyyyToISO(c.dob),
        name: `${cleanNamePrefix(c.firstName)} ${c.lastName ? cleanNamePrefix(c.lastName) : ''}`.trim(),
        relation: c.relation === 'Other' && c.customRelation ? c.customRelation : c.relation
      }))
    };

    try {
      const response = await apiClient.post('/auth/register', payload);
      if (response.data.success) {
        // Registration itself doesn't return a session token, so log in
        // immediately with the credentials just created — this is what lets
        // the user skip the login screen entirely instead of re-entering
        // their phone + PIN right after already typing it into this form.
        try {
          const loginRes = await apiClient.post('/auth/login', { login: formData.phone, password: formData.password });
          if (loginRes.data.success) {
            if (avatarFile) {
              try {
                const fd = new FormData();
                fd.append('file', avatarFile);
                await apiClient.post('/profiles/avatar', fd, {
                  headers: { Authorization: `Bearer ${loginRes.data.token}`, 'Content-Type': 'multipart/form-data' },
                });
              } catch (avatarErr) {
                // Never block the auto-login flow — the user can always set
                // an avatar later from Settings.
                console.error('Avatar upload during registration failed:', avatarErr);
              }
            }

            localStorage.setItem('mellow_token', loginRes.data.token);
            localStorage.setItem('mellow_user', JSON.stringify(loginRes.data.user));
            localStorage.removeItem('mellow_guest');
            await fetchChildren(loginRes.data.user.id);

            // Preserve the original intent — e.g. someone who hit Register
            // mid-booking (redirect=/booking?courseId=5) lands right back on
            // that class instead of a generic home screen.
            navigate(redirect ? decodeURIComponent(redirect) : '/', { replace: true });
            return;
          }
        } catch (autoLoginErr) {
          console.error('Auto-login after registration failed:', autoLoginErr);
        }

        // Auto-login didn't work (rare) — fall back to the old flow so
        // registration success is never blocked by this convenience step.
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
    <form onSubmit={handleRequestOtp} noValidate className="space-y-4 mt-2">
      <h3 className="font-black text-mellow-ink text-sm">{t.register.parentInfoTitle}</h3>

      <div className="flex gap-3">
         <div className="relative shrink-0 w-[130px]">
            <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.prefixLabel}</label>
            <FieldHint message={fieldErrors.prefix} />
            <select
              id="reg-prefix"
              value={formData.prefix}
              onChange={(e) => { setFormData({...formData, prefix: e.target.value}); setFieldErrors(prev => ({...prev, prefix: undefined})); }}
              className={`w-full px-3 py-[14px] bg-slate-50 border rounded-2xl font-bold text-sm focus:outline-none ${errClass(fieldErrors.prefix)}`}
            >
              <option value="" disabled>{t.register.selectTitle}</option>
              <option value="นาย">{t.register.prefixMr}</option>
              <option value="นาง">{t.register.prefixMrs}</option>
              <option value="นางสาว">{t.register.prefixMiss}</option>
            </select>
         </div>
         <div className="relative flex-1">
            <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.firstNameLabel}</label>
            <FieldHint message={fieldErrors.firstName} />
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <User size={18} />
              </div>
              <input
                id="reg-firstName"
                type="text"
                placeholder={t.register.firstName}
              value={formData.firstName}
              onChange={(e) => { setFormData({...formData, firstName: e.target.value}); setFieldErrors(prev => ({...prev, firstName: undefined})); }}
              className={`w-full pl-11 pr-4 py-[14px] bg-slate-50 border rounded-2xl font-bold text-sm focus:outline-none ${errClass(fieldErrors.firstName)}`}
            />
          </div>
         </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.lastNameLabel}</label>
        <FieldHint message={fieldErrors.lastName} />
        <input
          id="reg-lastName"
          type="text"
          placeholder={t.register.lastName}
          value={formData.lastName}
          onChange={(e) => { setFormData({...formData, lastName: e.target.value}); setFieldErrors(prev => ({...prev, lastName: undefined})); }}
          className={`w-full px-4 py-[14px] bg-slate-50 border rounded-2xl font-bold text-sm focus:outline-none ${errClass(fieldErrors.lastName)}`}
        />
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.parentDobLabel}{t.register.optionalSuffix}</label>
        <DateField
          value={formData.dob}
          onChange={(v) => setFormData({...formData, dob: v})}
          placeholder={t.register.dobPlaceholder}
          className="w-full pl-12 pr-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
        />
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.phoneLabel}</label>
        <FieldHint message={fieldErrors.phone} />
        <div className="flex gap-2">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-500">
            <TH className="w-5 h-auto rounded-[2px]" />
            {t.register.phoneCountryCode}
          </div>
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Phone size={20} />
            </div>
            <input
              id="reg-phone"
              type="tel"
              placeholder={t.register.phone}
              value={formData.phone}
              onChange={(e) => { setFormData({...formData, phone: e.target.value}); setFieldErrors(prev => ({...prev, phone: undefined})); }}
              className={`w-full pl-12 pr-4 py-[14px] bg-slate-50 border rounded-2xl font-bold text-sm focus:outline-none ${errClass(fieldErrors.phone)}`}
            />
          </div>
        </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.emailLabel}</label>
        <FieldHint message={fieldErrors.email} />
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Mail size={20} />
          </div>
          <input
            id="reg-email"
            type="email"
            placeholder={t.register.email}
            value={formData.email}
            onChange={(e) => { setFormData({...formData, email: e.target.value}); setFieldErrors(prev => ({...prev, email: undefined})); }}
            className={`w-full pl-12 pr-4 py-[14px] bg-slate-50 border rounded-2xl font-bold text-sm focus:outline-none ${errClass(fieldErrors.email)}`}
          />
        </div>
      </div>

      <div className="relative">
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.lineIdLabel}{t.register.optionalSuffix}</label>
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
        <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.addressLabel}{t.register.optionalSuffix}</label>
        <textarea
          placeholder={t.register.addressPlaceholder}
          value={formData.address}
          onChange={(e) => setFormData({...formData, address: e.target.value})}
          className="w-full px-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none resize-none"
          rows={3}
        />
      </div>

      <h3 className="font-black text-mellow-ink text-sm pt-2">{t.register.childrenInfoTitle}</h3>

      <div className="space-y-4">
        {children.map((child, index) => (
          <div key={index} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 relative group">
            {children.length > 1 && (
              <button
                type="button"
                onClick={() => setChildToRemove(index)}
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
                  <FieldHint message={childErrors[index]?.firstName} />
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      id={`reg-child-${index}-firstName`}
                      type="text"
                      placeholder={t.register.firstName}
                      value={child.firstName}
                      onChange={(e) => handleChildChange(index, 'firstName', e.target.value)}
                      className={`w-full pl-11 pr-4 py-[14px] bg-white border rounded-xl font-bold text-sm focus:outline-none ${errClass(childErrors[index]?.firstName)}`}
                    />
                  </div>
                </div>
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.lastNameLabel}</label>
                  <FieldHint message={childErrors[index]?.lastName} />
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      id={`reg-child-${index}-lastName`}
                      type="text"
                      placeholder={t.register.lastName}
                      value={child.lastName}
                      onChange={(e) => handleChildChange(index, 'lastName', e.target.value)}
                      className={`w-full pl-11 pr-4 py-[14px] bg-white border rounded-xl font-bold text-sm focus:outline-none ${errClass(childErrors[index]?.lastName)}`}
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
                  <FieldHint message={childErrors[index]?.nickname} />
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      id={`reg-child-${index}-nickname`}
                      type="text"
                      placeholder={t.register.nickname}
                      value={child.nickname}
                      onChange={(e) => handleChildChange(index, 'nickname', e.target.value)}
                      className={`w-full pl-11 pr-4 py-[14px] bg-white border rounded-xl font-bold text-sm focus:outline-none ${errClass(childErrors[index]?.nickname)}`}
                    />
                  </div>
                </div>
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.genderLabel}</label>
                  <FieldHint message={childErrors[index]?.gender} />
                  <select
                    id={`reg-child-${index}-gender`}
                    value={child.gender}
                    onChange={(e) => handleChildChange(index, 'gender', e.target.value)}
                    className={`w-full px-4 py-[14px] bg-white border rounded-xl font-bold text-sm focus:outline-none ${errClass(childErrors[index]?.gender)}`}
                  >
                    <option value="" disabled>{t.register.selectGender}</option>
                    <option value="Boy">{t.register.genderBoy}</option>
                    <option value="Girl">{t.register.genderGirl}</option>
                    <option value="Other">{t.register.genderOther}</option>
                  </select>
                </div>
              </div>

              <div className="relative" id={`reg-child-${index}-dob`}>
                <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.dateOfBirth}</label>
                <FieldHint message={childErrors[index]?.dob} />
                <DateField
                  value={child.dob}
                  onChange={(v) => handleChildChange(index, 'dob', v)}
                  placeholder={t.register.dobPlaceholder}
                  className={`w-full pl-11 pr-4 py-[14px] bg-white border rounded-xl font-bold text-sm focus:outline-none ${errClass(childErrors[index]?.dob)}`}
                  iconSize={18}
                />
              </div>

              <div className="relative">
                <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.relationship}{t.register.optionalSuffix}</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Users size={18} />
                  </div>
                  <select
                    value={child.relation}
                    onChange={(e) => handleChildChange(index, 'relation', e.target.value)}
                    className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                  >
                    <option value="">{t.register.notSpecified}</option>
                    <option value="Father">{t.register.father}</option>
                    <option value="Mother">{t.register.mother}</option>
                    <option value="Relative">{t.register.relative}</option>
                    <option value="Other">{t.register.other}</option>
                  </select>
                </div>
              </div>

              {child.relation === 'Other' && (
                <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                  <FieldHint message={childErrors[index]?.customRelation} />
                  <input
                    id={`reg-child-${index}-customRelation`}
                    type="text"
                    placeholder={t.register?.specifyRelation || 'Please specify relationship...'}
                    value={child.customRelation || ''}
                    onChange={(e) => handleChildChange(index, 'customRelation', e.target.value)}
                    className={`w-full px-4 py-[14px] bg-white border rounded-xl font-bold text-sm focus:outline-none ${errClass(childErrors[index]?.customRelation)}`}
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
          {t.register.referenceCode}: {otpRef}
        </div>
      )}

      <button type="submit" className="w-full mellow-btn-primary">
        {t.register.verifyNext} <ArrowRight size={20} />
      </button>

      <p className="text-center text-slate-400 text-xs font-bold mt-2">
        {resendTimer > 0 ? (
          <span>{t.register.resendWaitLabel.replace('{{seconds}}', String(resendTimer))}</span>
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
      <p className="text-center text-slate-300 text-[11px] font-bold">
        {lang === 'en' ? 'Still not receiving it? Contact admin via LINE: @mellowplay' : 'หากไม่ได้รับ OTP กรุณาติดต่อผู้ดูแล LINE: @mellowplay'}
      </p>
    </form>
  );

  const renderStepPin = () => (
    <div className="space-y-6 mt-4">
      <PinPad
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
                setTimeout(() => setStep('avatar'), 300);
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
          <ChevronLeft size={16} className="mr-1" /> {t.register.back}
        </button>
      </div>
    </div>
  );

  const renderStepAvatar = () => (
    <div className="flex flex-col flex-1 pb-6">
      <div className="flex flex-col items-center mt-4 mb-8">
        <label className="relative w-32 h-32 cursor-pointer group block">
          <div className="w-32 h-32 rounded-full bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={56} className="text-slate-300" />
            )}
            <div className="absolute inset-0 bg-black/0 group-active:bg-black/10 transition-colors rounded-full" />
          </div>
          <div className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-mellow-purple text-white flex items-center justify-center shadow-lg border-2 border-white">
            <Camera size={16} />
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setAvatarFile(file);
              setAvatarPreview(URL.createObjectURL(file));
            }}
          />
        </label>
        {avatarPreview && (
          <button
            type="button"
            onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
            className="mt-3 text-xs font-bold text-slate-400 underline underline-offset-4"
          >
            {t.register.removePhoto}
          </button>
        )}
      </div>

      <div className="mt-auto pt-4 flex flex-col gap-3">
        {avatarPreview ? (
          <button type="button" onClick={() => setStep('summary')} className="w-full mellow-btn-primary">
            {t.register.nextStep} <ArrowRight size={20} />
          </button>
        ) : (
          <button type="button" onClick={() => setStep('summary')} className="w-full mellow-btn-primary">
            {t.register.skipForNow} <ArrowRight size={20} />
          </button>
        )}
      </div>
    </div>
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
        <h3 className="text-sm font-black text-slate-800 mb-3">{t.register.parentInfoTitle}</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.firstName}:</span> <span className="font-bold text-slate-800">{formData.prefix} {formData.firstName} {formData.lastName}</span></p>
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.parentDobLabel}:</span> <span className="font-bold text-slate-800">{formatCustomDate(ddmmyyyyToISO(formData.dob), lang, 'full')}</span></p>
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.phone}:</span> <span className="font-bold text-slate-800">{formData.phone}</span></p>
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.email}:</span> <span className="font-bold text-slate-800">{formData.email}</span></p>
        </div>
      </div>
      
      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
        <h3 className="text-sm font-black text-slate-800 mb-3">{t.register.childrenInfoTitle}</h3>
        <div className="space-y-4">
          {children.filter(c => c.firstName && c.dob).map((child, i) => (
            <div key={i} className="text-sm border-b border-slate-200 pb-2 last:border-0 last:pb-0">
              <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.firstName}:</span> <span className="font-bold text-slate-800">{child.firstName} {child.lastName} {child.nickname && `(${child.nickname})`}</span></p>
              <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.dateOfBirth}:</span> <span className="font-bold text-slate-800">{formatCustomDate(ddmmyyyyToISO(child.dob), lang, 'full')}</span></p>
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
      case 'avatar': return t.register.stepAvatar;
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
      case 'avatar': return t.register.stepAvatarDesc;
      case 'consent': return t.register.stepConsentDesc;
      case 'summary': return t.register.stepSummaryDesc;
      default: return '';
    }
  };

  // The consent (terms/PDPA) and info (parent + children details) steps are
  // both long, content-heavy forms — the full-size header used by the
  // shorter steps pushed content below the fold on smaller phones. Both get
  // the compact header (logo up top, no description line); the rest of the
  // steps are unaffected.
  const useCompactHeader = step === 'consent' || step === 'info';

  return (
    <div className="mellow-page flex flex-col px-8 bg-white">
      <header className={`flex justify-between items-center ${useCompactHeader ? 'pt-4 mb-2' : 'pt-10 mb-8'}`}>
        <button
          onClick={() => {
            if (step === 'consent') {
              // A guest who tapped "Register" from a course/feature they
              // were looking at, then changes their mind here, expects Back
              // to return them there — not to a login screen they never
              // asked for.
              navigate(-1);
            } else if (step === 'info') {
              setStep('consent');
            } else if (step === 'otp') {
              setStep('info');
            } else if (step === 'pin') {
              setStep('info');
            } else if (step === 'avatar') {
              setPinStep('create');
              setFormData({...formData, password: ''});
              setStep('pin');
            } else if (step === 'summary') {
              setStep('avatar');
            }
          }} 
          className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <ChevronLeft size={24} />
        </button>
        <LanguageToggle />
      </header>

      {useCompactHeader ? (
        <div className="text-center mb-3">
          <img src={logo} alt="Mellow Play" className="h-7 mx-auto mb-2" />
          <h1 className="text-base font-black text-mellow-ink">
            {getStepTitle()}
          </h1>
        </div>
      ) : (
        <div className="text-center mb-10">
          <img src={logo} alt="Mellow Play" className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-mellow-ink">
            {getStepTitle()}
          </h1>
          <p className="text-slate-400 font-bold mt-2">
            {getStepDesc()}
          </p>
        </div>
      )}

      <Toast message={error || ''} type="error" onClose={() => setError('')} />

      <div className="flex-1 flex flex-col">
        {step === 'consent' && renderStepConsent()}
        {step === 'info' && renderStepInfo()}
        {step === 'otp' && renderStepOtp()}
        {step === 'pin' && renderStepPin()}
        {step === 'avatar' && renderStepAvatar()}
        {step === 'summary' && renderStepSummary()}
      </div>

      <div className="mt-8 mb-4 text-center">
        <button 
          onClick={() => setShowCancelModal(true)}
          className="text-slate-400 font-bold text-sm underline underline-offset-4 decoration-slate-200 hover:text-slate-500 hover:decoration-slate-400 transition-colors"
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

      {childToRemove !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setChildToRemove(null)} />
          <div className="relative w-full max-w-xs bg-white rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{t.register.removeChildTitle}</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">{t.register.removeChildDesc}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setChildToRemove(null)}
                className="flex-1 py-[14px] rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200"
              >
                {t.register.removeChildCancel}
              </button>
              <button
                onClick={() => {
                  handleRemoveChild(childToRemove);
                  setChildToRemove(null);
                }}
                className="flex-1 py-[14px] rounded-xl font-bold text-white bg-red-500 hover:bg-red-600"
              >
                {t.register.removeChildConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;

