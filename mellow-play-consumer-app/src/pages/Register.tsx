import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Phone, Mail, User, ChevronLeft, MessageCircle, AlertCircle, Plus, ArrowRight } from 'lucide-react';
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
import ResponsiveModal from '../components/ResponsiveModal';
import FamilyMemberFields, { emptyFamilyMemberFormValue, type FamilyMemberFormValue } from '../components/FamilyMemberFields';
import { FAMILY_ROLE_OPTIONS, PARENT_ROLE_OPTIONS, OTHER_FAMILY_ROLE } from '../utils/familyRoles';

const ddmmyyyyToISO = (value: string) => {
  const [d, m, y] = value.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

type FamilyStepView = 'grid' | 'form' | 'list';

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirect = searchParams.get('redirect');
  const { t, lang } = useTranslation();
  const fetchChildren = useChildStore(state => state.fetchChildren);

  // Form State
  const [step, setStep] = useState<'consent' | 'info' | 'otp' | 'pin' | 'family' | 'summary'>('consent');
  const [formData, setFormData] = useState({
    phone: '',
    prefix: '',
    firstName: '',
    lastName: '',
    relationship: '',
    customRelationship: '',
    dob: '',
    password: '',
    email: '',
    lineId: '',
    address: '',
    pdpaConsent: false,
    marketingConsent: false,
    otp: ''
  });

  const [fieldErrors, setFieldErrors] = useState<{
    prefix?: string; firstName?: string; lastName?: string; phone?: string; email?: string; customRelationship?: string;
  }>({});
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState(false);

  const [prevPhone, setPrevPhone] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [otpRef, setOtpRef] = useState('');

  const [confirmPassword, setConfirmPassword] = useState('');
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create');

  const [resendTimer, setResendTimer] = useState(60);

  // The account itself is created right after PIN confirm (see
  // handlePinConfirmed) — everything from here on (family members) is added
  // to an already-real, already-logged-in account via the same endpoint
  // AddChildModal uses. This is what makes an abandoned signup resumable:
  // if someone drops off before adding anyone, they already have a working
  // account and just log back in.
  const [familyStepView, setFamilyStepView] = useState<FamilyStepView>('grid');
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberFormValue[]>([]);
  const [memberForm, setMemberForm] = useState<FamilyMemberFormValue>(emptyFamilyMemberFormValue());
  const [memberFormErrors, setMemberFormErrors] = useState<Partial<Record<'firstName' | 'lastName' | 'nickname' | 'dob' | 'customRole', string>>>({});
  const [isSavingMember, setIsSavingMember] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
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
    if (formData.relationship === OTHER_FAMILY_ROLE && !formData.customRelationship.trim()) {
      errs.customRelationship = t.register.requiredRelation;
    }
    if (!formData.phone.trim()) {
      errs.phone = t.register.requiredPhone;
    } else if (formData.phone.replace(/\D/g, '').length !== 10) {
      // Thai mobile numbers are always 10 digits — catches typos/missing
      // digits here instead of only failing later when OTP send/verify
      // rejects a malformed number with a much less specific error.
      errs.phone = lang === 'en' ? 'Phone number must be 10 digits' : 'เบอร์โทรศัพท์ต้องมี 10 หลัก';
    }
    if (!formData.email.trim()) errs.email = t.register.requiredEmail;

    setFieldErrors(errs);

    const isValid = Object.keys(errs).length === 0;

    if (!isValid) {
      // Scroll to the first invalid field so an error at the very top of
      // the form is visible even if the user was scrolled further down.
      for (const key of ['prefix', 'firstName', 'lastName', 'customRelationship', 'phone', 'email'] as const) {
        if (errs[key]) {
          document.getElementById(`reg-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
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
          // The account may already be a real, fully-working one that this
          // person just abandoned before adding family members — send them
          // to login instead of leaving them stuck at a dead-end error.
          setPhoneAlreadyRegistered(true);
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

  // Fires the moment the PIN is confirmed — the account is created here,
  // right in the middle of the flow, not at the very end. Family members
  // added afterward each land on an already-real account via the same
  // endpoint AddChildModal uses.
  const handlePinConfirmed = async (pin: string) => {
    setIsLoading(true);
    setError('');

    const payload = {
      ...formData,
      password: pin,
      dob: formData.dob ? ddmmyyyyToISO(formData.dob) : '',
      relationship: formData.relationship === OTHER_FAMILY_ROLE && formData.customRelationship
        ? formData.customRelationship
        : formData.relationship,
      children: [],
    };

    try {
      const response = await apiClient.post('/auth/register', payload);
      if (response.data.success) {
        if (response.data.duplicateWarning) setWarning(response.data.duplicateWarning);
        try {
          const loginRes = await apiClient.post('/auth/login', { login: formData.phone, password: pin });
          if (loginRes.data.success) {
            localStorage.setItem('mellow_token', loginRes.data.token);
            localStorage.setItem('mellow_user', JSON.stringify(loginRes.data.user));
            localStorage.removeItem('mellow_guest');
            await fetchChildren(loginRes.data.user.id);
            setStep('family');
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
      setPinStep('create');
      setConfirmPassword('');
      setFormData(prev => ({ ...prev, password: '' }));
    } finally {
      setIsLoading(false);
    }
  };

  const startAddingRole = (role: string) => {
    setMemberForm(emptyFamilyMemberFormValue(role));
    setMemberFormErrors({});
    setFamilyStepView('form');
  };

  const validateMemberForm = (m: FamilyMemberFormValue) => {
    const e: typeof memberFormErrors = {};
    if (!m.firstName.trim()) e.firstName = t.register.requiredFirstName;
    if (!m.lastName.trim()) e.lastName = t.register.requiredLastName;
    if (!m.nickname.trim()) e.nickname = t.register.requiredNickname;
    if (!m.dob) e.dob = t.register.requiredDob;
    if (m.role === OTHER_FAMILY_ROLE && !m.customRole.trim()) e.customRole = t.register.requiredRelation;
    return e;
  };

  const handleSaveFamilyMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateMemberForm(memberForm);
    setMemberFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsSavingMember(true);
    setError('');
    try {
      const payload = {
        name: `${cleanNamePrefix(memberForm.firstName)} ${memberForm.lastName ? cleanNamePrefix(memberForm.lastName) : ''}`.trim(),
        nickname: memberForm.nickname,
        gender: memberForm.gender,
        dob: ddmmyyyyToISO(memberForm.dob),
        relation: memberForm.role === OTHER_FAMILY_ROLE && memberForm.customRole ? memberForm.customRole : memberForm.role,
      };
      const response = await apiClient.post('/profiles/children', payload);
      if (response.data.success) {
        if (response.data.duplicateWarning) setWarning(response.data.duplicateWarning);
        setFamilyMembers(prev => [...prev, memberForm]);
        const userJson = localStorage.getItem('mellow_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          await fetchChildren(user.id);
        }
        setFamilyStepView('list');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t.register.registerFailed);
    } finally {
      setIsSavingMember(false);
    }
  };

  const renderStepInfo = () => (
    <form onSubmit={handleRequestOtp} noValidate className="space-y-4 mt-2">
      <h3 className="font-black text-mellow-ink text-lg">{t.register.parentInfoTitle}</h3>

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
        <label className="text-xs font-bold text-slate-500 mb-1 block">{lang === 'en' ? 'You are...' : 'คุณคือ...'}</label>
        <select
          value={formData.relationship}
          onChange={(e) => setFormData({...formData, relationship: e.target.value})}
          className="w-full px-4 py-[14px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
        >
          <option value="">{lang === 'en' ? 'Select relationship' : 'เลือกความสัมพันธ์'}</option>
          {PARENT_ROLE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{lang === 'en' ? o.labelEn : o.labelTh}</option>
          ))}
        </select>
        {formData.relationship === OTHER_FAMILY_ROLE && (
          <div className="mt-2">
            <FieldHint message={fieldErrors.customRelationship} />
            <input
              id="reg-customRelationship"
              type="text"
              placeholder={t.register?.specifyRelation || 'Please specify relationship...'}
              value={formData.customRelationship}
              onChange={(e) => { setFormData({...formData, customRelationship: e.target.value}); setFieldErrors(prev => ({...prev, customRelationship: undefined})); }}
              className={`w-full px-4 py-[14px] bg-slate-50 border rounded-2xl font-bold text-sm focus:outline-none ${errClass(fieldErrors.customRelationship)}`}
            />
          </div>
        )}
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
              onChange={(e) => { setFormData({...formData, phone: e.target.value}); setFieldErrors(prev => ({...prev, phone: undefined})); setPhoneAlreadyRegistered(false); }}
              className={`w-full pl-12 pr-4 py-[14px] bg-slate-50 border rounded-2xl font-bold text-sm focus:outline-none ${errClass(fieldErrors.phone)}`}
            />
          </div>
        </div>
        {phoneAlreadyRegistered && (
          <button
            type="button"
            onClick={() => navigate(`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`)}
            className="mt-2 text-xs font-black text-mellow-purple underline underline-offset-2"
          >
            {lang === 'en' ? 'Go to login' : 'ไปเข้าสู่ระบบ'}
          </button>
        )}
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
      <p className="text-center text-slate-300 text-[12px] font-bold">
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
                setTimeout(() => handlePinConfirmed(val), 300);
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
          disabled={isLoading}
        >
          <ChevronLeft size={16} className="mr-1" /> {t.register.back}
        </button>
        {isLoading && <Loader2 size={18} className="animate-spin text-mellow-purple" />}
      </div>
    </div>
  );

  const renderStepConsent = () => (
    <form onSubmit={(e) => { e.preventDefault(); setStep('info'); }} className="space-y-6 flex flex-col flex-1 pb-6">
      {/* Arriving here mid-booking (guest gate redirected them) should read
          as one continuous errand, not a detour into an unrelated signup
          flow — so say so, instead of a generic registration screen. */}
      {redirect && (redirect.includes('booking') || redirect.includes('/class/')) && (
        <div className="bg-mellow-purple/10 text-mellow-purple text-xs font-bold rounded-2xl px-4 py-3 text-center">
          {lang === 'en'
            ? "You're almost there — finish this to continue your booking."
            : 'อีกไม่กี่ขั้นตอนก็จะลงทะเบียนสำเร็จ'}
        </div>
      )}
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
        <button type="submit" disabled={isLoading} className="w-full mellow-btn-primary">
          {isLoading ? <Loader2 className="animate-spin" /> : <>{t.register.nextStep} <ArrowRight size={20} /></>}
        </button>
      </div>
    </form>
  );

  const renderStepFamily = () => {
    if (familyStepView === 'form') {
      return (
        <form onSubmit={handleSaveFamilyMember} className="space-y-4 flex flex-col flex-1 pb-6">
          <FamilyMemberFields value={memberForm} onChange={setMemberForm} errors={memberFormErrors} />
          <div className="mt-auto pt-4 flex flex-col gap-3">
            <button type="submit" disabled={isSavingMember} className="w-full mellow-btn-primary">
              {isSavingMember ? <Loader2 className="animate-spin" /> : <>{t.common?.save || (lang === 'th' ? 'บันทึก' : 'Save')} <ArrowRight size={20} /></>}
            </button>
            <button
              type="button"
              onClick={() => setFamilyStepView(familyMembers.length > 0 ? 'list' : 'grid')}
              className="w-full text-center text-sm font-bold text-slate-400 hover:text-slate-500"
            >
              {t.register.back}
            </button>
          </div>
        </form>
      );
    }

    if (familyStepView === 'list') {
      return (
        <div className="flex flex-col flex-1 pb-6">
          <div className="space-y-3">
            {familyMembers.map((m, i) => {
              const roleOpt = FAMILY_ROLE_OPTIONS.find(o => o.value === m.role);
              return (
                <div key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-mellow-purple/10 text-mellow-purple flex items-center justify-center shrink-0">
                    {roleOpt && <roleOpt.icon size={20} />}
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm">{m.nickname || m.firstName}</p>
                    <p className="text-xs font-bold text-slate-400">
                      {m.role === OTHER_FAMILY_ROLE ? m.customRole : (lang === 'en' ? roleOpt?.labelEn : roleOpt?.labelTh)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setFamilyStepView('grid')}
            className="w-full mt-4 py-[14px] border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 font-bold text-sm hover:border-mellow-purple hover:text-mellow-purple transition-all"
          >
            <Plus size={18} /> {lang === 'en' ? 'Add another family member' : 'เพิ่มสมาชิกคนอื่นๆ'}
          </button>

          <div className="mt-auto pt-6">
            <button type="button" onClick={() => setStep('summary')} className="w-full mellow-btn-primary">
              {t.register.nextStep} <ArrowRight size={20} />
            </button>
          </div>
        </div>
      );
    }

    // 'grid' — the hero hint view: shown first (zero members yet) and again
    // whenever "add another family member" is tapped from the list.
    return (
      <div className="flex flex-col flex-1 pb-6">
        <p className="text-sm font-bold text-slate-500 text-center mb-5">
          {familyMembers.length === 0
            ? (lang === 'en' ? 'Add your family members — for faster booking next time' : 'เพิ่มสมาชิกในครอบครัวของคุณ (เพื่อความสะดวกในการกรอกข้อมูลครั้งถัดไป)')
            : (lang === 'en' ? 'Who else would you like to add?' : 'อยากเพิ่มใครอีก?')}
        </p>
        <div className="grid grid-cols-4 gap-3">
          {FAMILY_ROLE_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => startAddingRole(o.value)}
              className="flex flex-col items-center justify-center gap-1.5 py-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-mellow-purple/30 hover:bg-mellow-purple/5 active:scale-95 transition-all"
            >
              <o.icon size={26} className="text-mellow-purple" />
              <span className="text-[12px] font-bold text-slate-600 text-center">{lang === 'en' ? o.labelEn : o.labelTh}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-6 flex flex-col gap-3">
          {familyMembers.length > 0 && (
            <button
              type="button"
              onClick={() => setFamilyStepView('list')}
              className="w-full text-center text-sm font-bold text-slate-400 hover:text-slate-500"
            >
              {lang === 'en' ? 'Back to list' : 'กลับไปดูรายชื่อ'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setStep('summary')}
            className="w-full text-center text-sm font-bold text-slate-400 hover:text-slate-500"
          >
            {t.register.skip}
          </button>
        </div>
      </div>
    );
  };

  const renderStepSummary = () => (
    <div className="flex flex-col flex-1 pb-6 space-y-6">
      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
        <h3 className="text-lg font-black text-slate-800 mb-3">{t.register.parentInfoTitle}</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.firstName}:</span> <span className="font-bold text-slate-800">{formData.prefix} {formData.firstName} {formData.lastName}</span></p>
          {formData.relationship && (() => {
            const roleOpt = FAMILY_ROLE_OPTIONS.find(o => o.value === formData.relationship);
            const roleLabel = formData.relationship === OTHER_FAMILY_ROLE
              ? formData.customRelationship
              : (roleOpt ? (lang === 'en' ? roleOpt.labelEn : roleOpt.labelTh) : formData.relationship);
            return (
              <p className="flex items-center gap-1">
                <span className="text-slate-500 font-bold w-28 inline-block">{lang === 'en' ? 'Role' : 'สถานะ'}:</span>
                {roleOpt && <roleOpt.icon size={16} className="text-mellow-purple" />}
                <span className="font-bold text-slate-800">{roleLabel}</span>
              </p>
            );
          })()}
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.phone}:</span> <span className="font-bold text-slate-800">{formData.phone}</span></p>
          <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.email}:</span> <span className="font-bold text-slate-800">{formData.email}</span></p>
        </div>
      </div>

      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
        <h3 className="text-lg font-black text-slate-800 mb-3">{lang === 'en' ? 'Family Members' : 'สมาชิกในครอบครัว'}</h3>
        {familyMembers.length === 0 ? (
          <p className="text-sm font-bold text-slate-400">{lang === 'en' ? 'None added yet — you can add more anytime from Settings.' : 'ยังไม่ได้เพิ่มสมาชิก — เพิ่มได้ภายหลังจากหน้าตั้งค่า'}</p>
        ) : (
          <div className="space-y-4">
            {familyMembers.map((m, i) => {
              const roleOpt = FAMILY_ROLE_OPTIONS.find(o => o.value === m.role);
              const roleLabel = m.role === OTHER_FAMILY_ROLE ? m.customRole : (lang === 'en' ? roleOpt?.labelEn : roleOpt?.labelTh);
              return (
                <div key={i} className="text-sm border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                  <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.firstName}:</span> <span className="font-bold text-slate-800">{m.firstName} {m.lastName} {m.nickname && `(${m.nickname})`}</span></p>
                  <p><span className="text-slate-500 font-bold w-28 inline-block">{t.register.dateOfBirth}:</span> <span className="font-bold text-slate-800">{formatCustomDate(ddmmyyyyToISO(m.dob), lang, 'full')}</span></p>
                  <p className="flex items-center gap-1">
                    <span className="text-slate-500 font-bold w-28 inline-block">{lang === 'en' ? 'Role' : 'สถานะ'}:</span>
                    {roleOpt && <roleOpt.icon size={16} className="text-mellow-purple" />}
                    <span className="font-bold text-slate-800">{roleLabel}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto pt-4">
        <button
          onClick={() => navigate(redirect ? decodeURIComponent(redirect) : '/', { replace: true })}
          className="w-full mellow-btn-primary"
        >
          {t.register.complete} <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );

  const getStepTitle = () => {
    switch(step) {
      case 'info': return t.register.stepInfo;
      case 'otp': return t.register.stepOtp;
      case 'pin': return pinStep === 'create' ? t.register.stepPinCreate : t.register.stepPinConfirm;
      case 'family': return t.register.stepFamily;
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
      case 'family': return t.register.stepFamilyDesc;
      case 'consent': return t.register.stepConsentDesc;
      case 'summary': return t.register.stepSummaryDesc;
      default: return '';
    }
  };

  // The consent, info, and family steps are all long/content-heavy — the
  // full-size header used by the shorter steps pushed content below the
  // fold on smaller phones. All three get the compact header (logo up top,
  // no description line); the rest of the steps are unaffected.
  const useCompactHeader = step === 'consent' || step === 'info' || step === 'family';

  // Once the account exists (from 'family' onward), there's nothing
  // meaningful for "back" to undo — hide it there rather than pretend
  // stepping back rewinds account creation. 'summary' still allows
  // returning to 'family' to add more people.
  const canGoBack = step !== 'family';

  return (
    <div className="mellow-flow-page flex flex-col px-8 bg-white">
      <header className={`flex justify-between items-center ${useCompactHeader ? 'pt-4 mb-2' : 'pt-10 mb-8'}`}>
        {canGoBack ? (
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
              } else if (step === 'summary') {
                setFamilyStepView(familyMembers.length > 0 ? 'list' : 'grid');
                setStep('family');
              }
            }}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-all shrink-0"
          >
            <ChevronLeft size={24} />
          </button>
        ) : (
          <div className="w-10 h-10 shrink-0" />
        )}
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
      <Toast message={warning || ''} type="warning" onClose={() => setWarning('')} />

      <div className="flex-1 flex flex-col">
        {step === 'consent' && renderStepConsent()}
        {step === 'info' && renderStepInfo()}
        {step === 'otp' && renderStepOtp()}
        {step === 'pin' && renderStepPin()}
        {step === 'family' && renderStepFamily()}
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

      <ResponsiveModal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} variant="dialog" size="xs" className="text-center">
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
      </ResponsiveModal>
    </div>
  );
};

export default Register;
