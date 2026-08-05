import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, User, Mail, Phone, Save, Loader2, Settings as SettingsIcon, ShieldCheck, Link2, Unlink, Camera, LogOut, BookOpen } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import { useChildStore } from '../store/useChildStore';
import EditChildModal from '../components/EditChildModal';
import AddChildModal from '../components/AddChildModal';
import { ChildAvatar } from '../components/ChildAvatar';
import PhoneChangeModal from '../components/PhoneChangeModal';
import ChangePinModal from '../components/ChangePinModal';
import { resolveImageUrl } from '../utils/courseImage';
import { getFamilyRoleLabel, normalizeFamilyRole } from '../utils/familyRoles';

const SettingsProfile = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { children, fetchChildren } = useChildStore();
  const [isEditChildOpen, setIsEditChildOpen] = useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<any>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    firstNameEn: '',
    lastNameEn: '',
    phone: '',
    email: '',
    displayName: '',
  });

  const [account, setAccount] = useState<{ phoneVerified: boolean; hasGoogleLinked: boolean } | null>(null);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const loadMe = async () => {
    try {
      const res = await apiClient.get('/auth/me');
      if (res.data.success) {
        const u = res.data.user;
        setFormData(f => ({ ...f, phone: u.phone || '', email: u.email || '', firstNameEn: u.firstNameEn || '', lastNameEn: u.lastNameEn || '' }));
        setAccount({ phoneVerified: u.phoneVerified, hasGoogleLinked: u.hasGoogleLinked });
        setAvatarUrl(u.avatarUrl || null);
      }
    } catch {
      // localStorage fallback below still populates the form
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post('/profiles/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success) {
        setAvatarUrl(res.data.url);
        const userJson = localStorage.getItem('mellow_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          localStorage.setItem('mellow_user', JSON.stringify({ ...user, avatarUrl: res.data.url }));
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Failed to upload photo.' : 'อัปโหลดรูปไม่สำเร็จ'));
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  useEffect(() => {
    const userJson = localStorage.getItem('mellow_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        firstNameEn: user.firstNameEn || '',
        lastNameEn: user.lastNameEn || '',
        phone: user.phone || '',
        email: user.email || '',
        displayName: user.displayName || '',
      });
    }
    loadMe();
  }, []);

  // Renders the Google Identity "Connect" button only when Google isn't
  // already linked — mirrors the same GSI init pattern used on Login.tsx.
  useEffect(() => {
    if (!account || account.hasGoogleLinked) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
    if (!clientId) return;

    let cancelled = false;
    const existingScript = document.getElementById('google-identity-script-settings');
    existingScript?.remove();
    const script = document.createElement('script');
    script.id = 'google-identity-script-settings';
    script.src = `https://accounts.google.com/gsi/client?hl=${lang === 'th' ? 'th' : 'en'}`;
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
      const google = (window as any).google;
      if (!google?.accounts?.id || !googleButtonRef.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => handleLinkGoogle(response.credential),
      });
      googleButtonRef.current.innerHTML = '';
      google.accounts.id.renderButton(googleButtonRef.current, { type: 'standard', theme: 'outline', size: 'large', width: 280, shape: 'pill' });
    };
    document.head.appendChild(script);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, lang]);

  const handleLinkGoogle = async (idToken: string) => {
    setGoogleBusy(true);
    setError('');
    try {
      const res = await apiClient.post('/auth/link-google', { idToken });
      if (res.data.success) {
        setSuccess(lang === 'en' ? 'Google account connected!' : 'เชื่อมต่อบัญชี Google เรียบร้อยแล้ว');
        if (res.data.email) setFormData(f => ({ ...f, email: f.email || res.data.email }));
        await loadMe();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Failed to connect Google account.' : 'ไม่สามารถเชื่อมต่อบัญชี Google ได้'));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    setGoogleBusy(true);
    setError('');
    try {
      await apiClient.post('/auth/unlink-google');
      setSuccess(lang === 'en' ? 'Google account disconnected.' : 'ยกเลิกการผูกบัญชี Google เรียบร้อยแล้ว');
      await loadMe();
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Failed to disconnect Google account.' : 'ไม่สามารถยกเลิกการผูกบัญชีได้'));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    const userJson = localStorage.getItem('mellow_user');
    if (!userJson) {
      setError(lang === 'en' ? 'User not found. Please log in.' : 'ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบ');
      setIsLoading(false);
      return;
    }

    const user = JSON.parse(userJson);

    try {
      // Call PUT /admin/users/:id endpoint to update profile
      const response = await apiClient.put(`/admin/users/${user.id}`, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        first_name_en: formData.firstNameEn,
        last_name_en: formData.lastNameEn,
        phone: formData.phone,
        email: formData.email,
        display_name: formData.displayName,
      });

      if (response.data.success) {
        // Update user details in localStorage
        const updatedUser = {
          ...user,
          firstName: formData.firstName,
          lastName: formData.lastName,
          firstNameEn: formData.firstNameEn,
          lastNameEn: formData.lastNameEn,
          phone: formData.phone,
          email: formData.email,
          displayName: formData.displayName,
        };
        localStorage.setItem('mellow_user', JSON.stringify(updatedUser));
        setSuccess(lang === 'en' ? 'Profile updated successfully!' : 'บันทึกข้อมูลเรียบร้อยแล้ว');
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Failed to update profile. Please try again.' : 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mellow-page-reading bg-[#fbfaf7]">
      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[17px] font-black tracking-tight leading-none">{lang === 'en' ? 'Parent Profile Settings' : 'ตั้งค่าข้อมูลผู้ปกครอง'}</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <main className="p-5">
        <div className="mellow-card bg-white shadow-xl relative overflow-hidden p-6 mb-6">
          <div className="flex flex-col items-center mb-6">
            <label className="relative w-24 h-24 cursor-pointer group block">
              <div className="w-24 h-24 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                {avatarUploading ? (
                  <Loader2 size={28} className="text-slate-400 animate-spin" />
                ) : avatarUrl ? (
                  <img src={resolveImageUrl(avatarUrl)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={40} className="text-slate-300" />
                )}
                {!avatarUploading && <div className="absolute inset-0 bg-black/0 group-active:bg-black/10 transition-colors rounded-full" />}
              </div>
              {!avatarUploading && (
                <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-mellow-purple text-white flex items-center justify-center shadow-lg border-2 border-white">
                  <Camera size={14} />
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={avatarUploading} />
            </label>
          </div>

          <h2 className="text-xl font-black text-slate-800 mb-6">{lang === 'en' ? 'Parent Information' : 'ข้อมูลผู้ปกครอง'}</h2>

          <form onSubmit={handleSave} className="space-y-4">
            {success && (
              <div className="p-4 bg-green-50 text-green-600 rounded-2xl text-xs font-bold border border-green-100 mb-4 text-center">
                {success}
              </div>
            )}
            {error && (
              <div className="p-4 bg-red-50 text-red-500 rounded-2xl text-xs font-bold border border-red-100 mb-4 text-center">
                {error}
              </div>
            )}

            {/* First Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">{lang === 'en' ? 'First Name' : 'ชื่อจริง'}</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">{lang === 'en' ? 'Last Name' : 'นามสกุล'}</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* English name — optional, filled in either here or by CRM staff; left blank for anyone registered before this field existed. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                  {lang === 'en' ? 'First Name (English)' : 'ชื่อจริง (อังกฤษ)'}
                </label>
                <input
                  type="text"
                  value={formData.firstNameEn}
                  onChange={(e) => setFormData({ ...formData, firstNameEn: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                  {lang === 'en' ? 'Last Name (English)' : 'นามสกุล (อังกฤษ)'}
                </label>
                <input
                  type="text"
                  value={formData.lastNameEn}
                  onChange={(e) => setFormData({ ...formData, lastNameEn: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                />
              </div>
            </div>

            {/* Display Name — shown on comments in the media feed; falls back to First Name if left blank. */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                {lang === 'en' ? 'Display Name' : 'ชื่อที่แสดง'}
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder={formData.firstName || (lang === 'en' ? 'Shown on comments' : 'ใช้แสดงตอนคอมเมนท์')}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                />
              </div>
            </div>

            {/* Phone — read-only here; changing it requires the OTP-verified flow */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1 flex items-center gap-1.5">
                {lang === 'en' ? 'Phone Number' : 'เบอร์โทรศัพท์'}
                {account?.phoneVerified && <ShieldCheck size={12} className="text-emerald-500" />}
              </label>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Phone size={18} />
                  </div>
                  <input
                    type="tel"
                    value={formData.phone}
                    readOnly
                    className="w-full pl-11 pr-4 py-3 bg-slate-100 border border-slate-100 rounded-xl font-bold text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsPhoneModalOpen(true)}
                  className="shrink-0 px-4 py-3 bg-mellow-purple/10 text-mellow-purple rounded-xl font-bold text-xs active:scale-95 transition-transform"
                >
                  {lang === 'en' ? 'Change' : 'เปลี่ยน'}
                </button>
              </div>
            </div>

            {/* Email — always optional */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                {lang === 'en' ? 'Email Address' : 'อีเมล'}
                <span className="normal-case font-medium text-slate-300 ml-1">({lang === 'en' ? 'optional' : 'ไม่บังคับ'})</span>
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mellow-btn-primary mt-6"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Save size={18} />
                  {lang === 'en' ? 'Save Changes' : 'บันทึกการเปลี่ยนแปลง'}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Account Security / Google Link */}
        <div className="mellow-card bg-white shadow-xl relative overflow-hidden p-6 mb-6">
          <h2 className="text-xl font-black text-slate-800 mb-1">{lang === 'en' ? 'Account & Security' : 'บัญชีและความปลอดภัย'}</h2>
          <p className="text-xs font-bold text-slate-400 mb-5">
            {lang === 'en' ? 'Manage how you sign in to Mellow Play.' : 'จัดการวิธีเข้าสู่ระบบบัญชี Mellow Play ของคุณ'}
          </p>

          <button
            type="button"
            onClick={() => setIsPinModalOpen(true)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl mb-3 active:scale-[0.98] transition-transform"
          >
            <span className="font-black text-slate-800 text-[15px]">{lang === 'en' ? 'Change PIN' : 'เปลี่ยน PIN'}</span>
            <span className="text-mellow-purple font-bold text-xs">{lang === 'en' ? 'Change' : 'เปลี่ยน'}</span>
          </button>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            {account?.hasGoogleLinked ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-800 text-[15px]">Google</h3>
                    <p className="text-xs font-bold text-emerald-600">{lang === 'en' ? 'Connected' : 'เชื่อมต่อแล้ว'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnlinkGoogle}
                  disabled={googleBusy || !account.phoneVerified}
                  title={!account.phoneVerified ? (lang === 'en' ? 'Verify your phone number first' : 'ต้องมีเบอร์โทรที่ยืนยันแล้วก่อน') : undefined}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-red-50 text-red-500 rounded-xl font-bold text-xs active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {googleBusy ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                  {lang === 'en' ? 'Disconnect' : 'ยกเลิกการผูก'}
                </button>
              </div>
            ) : (
              // No decorative Google icon here — the rendered GSI button
              // already carries its own Google branding, so pairing it with
              // our own "G" circle just duplicated the logo. A full-width
              // stacked layout also avoids the button overflowing a row
              // shared with a label block.
              <div>
                <p className="text-xs font-bold text-slate-500 mb-3 whitespace-nowrap">
                  {lang === 'en'
                    ? 'Connect Google for faster sign-in'
                    : 'เชื่อมต่อ Google เพื่อเข้าสู่ระบบเร็วขึ้น'}
                </p>
                <div ref={googleButtonRef} className={`flex justify-center ${googleBusy ? 'opacity-50 pointer-events-none' : ''}`} />
              </div>
            )}
          </div>
          {account?.hasGoogleLinked && !account.phoneVerified && (
            <p className="text-[12px] font-bold text-slate-400 mt-2 px-1 flex items-center gap-1">
              <Link2 size={11} />
              {lang === 'en'
                ? 'A verified phone number is required before you can disconnect Google.'
                : 'ต้องมีเบอร์โทรที่ยืนยันแล้วก่อน จึงจะสามารถยกเลิกการผูกบัญชี Google ได้'}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/settings/community-guidelines')}
          className="w-full flex items-center justify-between gap-2 p-4 bg-white shadow-xl rounded-[24px] mb-4 text-slate-700 font-black text-[15px] active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center gap-2">
            <BookOpen size={18} className="text-mellow-purple" />
            {lang === 'en' ? 'Community Guidelines' : 'แนวทางการใช้งานชุมชน'}
          </span>
          <ChevronRight size={18} className="text-slate-300" />
        </button>

        {/* Logout — used to live behind the sidebar's account dropdown; that
            menu is gone now (the gear icon links straight here), so this is
            the only place left to sign out from. */}
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('mellow_token');
            localStorage.removeItem('mellow_user');
            localStorage.removeItem('mellow_guest');
            navigate('/login');
          }}
          className="w-full flex items-center justify-center gap-2 p-4 bg-white shadow-xl rounded-[24px] mb-6 text-red-500 font-black text-[15px] active:scale-[0.98] transition-transform"
        >
          <LogOut size={18} />
          {lang === 'en' ? 'Logout' : 'ออกจากระบบ'}
        </button>

        {/* Children Settings Section */}
        {children.length > 0 && (
          <div className="mellow-card bg-white shadow-xl relative overflow-hidden p-6 mb-6">
            <h2 className="text-xl font-black text-slate-800 mb-6">{lang === 'en' ? 'Child Profiles' : 'ข้อมูลเด็ก'}</h2>
            <div className="space-y-4">
              {children.map((child) => (
                <div key={child.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <ChildAvatar avatarType={child.avatar} className="w-12 h-12 rounded-full ring-2 ring-white shadow-sm" />
                    <div>
                      <h3 className="font-black text-slate-800 text-[16px] leading-tight">{child.name}</h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
                        {child.relation ? (() => {
                          const { role, customText } = normalizeFamilyRole(child.relation);
                          return customText || getFamilyRoleLabel(role, lang);
                        })() : (lang === 'en' ? 'Child' : 'เด็ก')}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingChild({
                        id: child.id,
                        name: child.name,
                        nameEn: child.nameEn || '',
                        nickname: child.nickname || '',
                        dob: child.dob || '',
                        relation: child.relation || 'Child',
                        gender: child.gender || ''
                      });
                      setIsEditChildOpen(true);
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-mellow-purple hover:border-mellow-purple/30 hover:bg-mellow-purple/5 transition-colors shadow-sm"
                  >
                    <SettingsIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => setIsAddChildOpen(true)}
              className="mt-6 w-full py-3.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-600 transition-all flex items-center justify-center gap-2"
            >
              <User size={18} />
              {lang === 'en' ? 'Add Child' : 'เพิ่มข้อมูลเด็ก'}
            </button>
          </div>
        )}
      </main>

      <EditChildModal
        isOpen={isEditChildOpen}
        onClose={() => setIsEditChildOpen(false)}
        childInfo={editingChild}
      />

      <AddChildModal 
        isOpen={isAddChildOpen}
        onClose={() => setIsAddChildOpen(false)}
        onSuccess={async () => {
          setIsAddChildOpen(false);
          const userJson = localStorage.getItem('mellow_user');
          if (userJson) {
            const user = JSON.parse(userJson);
            await fetchChildren(user.id);
          }
        }}
      />

      <PhoneChangeModal
        isOpen={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
        onSuccess={(newPhone) => {
          setFormData(f => ({ ...f, phone: newPhone }));
          const userJson = localStorage.getItem('mellow_user');
          if (userJson) {
            const user = JSON.parse(userJson);
            localStorage.setItem('mellow_user', JSON.stringify({ ...user, phone: newPhone }));
          }
          setAccount(a => a ? { ...a, phoneVerified: true } : a);
          setSuccess(lang === 'en' ? 'Phone number updated!' : 'เปลี่ยนเบอร์โทรศัพท์เรียบร้อยแล้ว');
        }}
      />

      <ChangePinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          setIsPinModalOpen(false);
          setSuccess(lang === 'en' ? 'PIN changed successfully!' : 'เปลี่ยน PIN เรียบร้อยแล้ว');
        }}
      />
    </div>
  );
};

export default SettingsProfile;
