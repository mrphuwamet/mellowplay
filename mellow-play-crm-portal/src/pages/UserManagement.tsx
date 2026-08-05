import { API_URL } from '../config';
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Paper, Typography, Box, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, Avatar, Button, IconButton, InputAdornment,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Alert, Grid, Divider, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Radio, RadioGroup, FormControlLabel, FormLabel, Tooltip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Visibility as ViewIcon,
  Save as SaveIcon,
  ArrowBack as BackIcon,
  Person as PersonIcon,
  ChildCare as ChildCareIcon,
  CardMembership as MembershipIcon,
  Security as SecurityIcon,
  LockReset as LockResetIcon,
  CameraAlt as CameraAltIcon,
  Add as AddIcon,
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
  VerifiedUser as ConsentIcon,
  History as HistoryIcon,
  WorkspacePremium as PremiumIcon,
  ArrowUpward as UpgradeIcon,
  Autorenew as RenewIcon,
  ArrowDownward as DowngradeIcon,
  EventBusy as ExpireIcon,
  FiberNew as NewIcon,
  LocalActivity as CouponIcon,
  CheckCircle as ActiveIcon,
  Search as SearchIcon,
  Translate as TranslateIcon,
} from '@mui/icons-material';
import axios from 'axios';
import ChildCouponManagement from './ChildCouponManagement';
import { ChildJourneyDialog } from '../components/ChildJourneyDialog';

const API_BASE = `${API_URL}/api/v1/admin`;
const COVER_GRADIENT = 'linear-gradient(135deg, #1a237e 0%, #1565c0 50%, #0288d1 100%)';

interface Child {
  id?: number;
  full_name: string;
  full_name_en?: string;
  nickname: string;
  gender: string;
  date_of_birth: string;
  relation?: string;
  avatar?: string;
  is_hd?: boolean;
  // Premium membership lives per-child now, not on the parent Users row —
  // only real (is_hd) children have a Children row to attach it to; CRM
  // walk-in children (User_CRM_Children) have no membership concept.
  membership_type?: string;
  membership_expires_at?: string | null;
}

interface User {
  id: string;
  phone: string;
  email: string;
  first_name: string;
  last_name: string;
  first_name_en?: string;
  last_name_en?: string;
  children_count: number;
  has_premium_child?: boolean;
  profile_image_url?: string;
  relationship?: string;
  line_id?: string;
  pdpa_consent?: boolean;
  marketing_consent?: boolean | null;
  application_date?: string;
  has_pending_reset?: boolean;
  reset_token_expires_at?: string;
  is_community_admin?: boolean;
}

interface UserCoupon {
  id: number;
  user_id: number;
  type_id: string;
  label: string;
  count: number;
  expires_at: string;
  note?: string;
  created_at: string;
}

interface MembershipHistoryEntry {
  id: number;
  action: 'new' | 'upgrade' | 'renew' | 'expire' | 'downgrade' | string;
  membership_type: string;
  started_at: string | null;
  expires_at: string | null;
  note?: string;
  created_by?: string;
  created_at: string;
}

const emptyForm = {
  first_name: '',
  last_name: '',
  first_name_en: '',
  last_name_en: '',
  phone: '',
  email: '',
  relationship: '',
  line_id: '',
  pdpa_consent: false,
  marketing_consent: '',
  application_date: '',
  profile_image_url: '',
  is_community_admin: false,
};

// Manual customer creation (staff-driven alternative to the consumer app's
// OTP self-registration) — deliberately just the parent-account fields;
// children get added afterward via the existing per-user "add child" flow.
const emptyCreateForm = {
  phone: '',
  password: '',
  prefix: '',
  first_name: '',
  last_name: '',
  first_name_en: '',
  last_name_en: '',
  dob: '',
  email: '',
  line_id: '',
  address: '',
};

const emptyChild: Child = {
  full_name: '',
  full_name_en: '',
  nickname: '',
  gender: '',
  date_of_birth: '',
  relation: '',
};

// Consumer app's own registration flow (Register.tsx) stores these exact
// capitalized strings on HD_Profiles.gender/.relation — matching them here
// isn't a style choice, it's required for a real customer's child data to
// render as anything other than a blank Select (mismatched value = MUI shows
// nothing selected).
const GENDERS = [
  { label: 'ชาย', value: 'Boy' },
  { label: 'หญิง', value: 'Girl' },
  { label: 'ไม่ระบุ', value: 'Not Specified' },
];

// Mirrors the consumer app's FAMILY_ROLE_OPTIONS exactly (utils/familyRoles.ts
// there — no shared package between the two apps, so this list is duplicated
// intentionally) — value AND Thai label both have to match, since this is the
// same free-text relation column either app can write to. Used for every
// family member (children included); RELATIONSHIPS below is the same list
// minus 'child', for the parent/account-holder's own "คุณคือ" field, exactly
// like the consumer app's PARENT_ROLE_OPTIONS.
const FAMILY_ROLE_OPTIONS = [
  { label: 'พ่อ', value: 'father' },
  { label: 'แม่', value: 'mother' },
  { label: 'ลูก', value: 'child' },
  { label: 'ลุง', value: 'uncle' },
  { label: 'ป้า', value: 'aunt' },
  { label: 'น้า', value: 'na' },
  { label: 'อา', value: 'aa' },
  { label: 'ปู่', value: 'grandfather_paternal' },
  { label: 'ย่า', value: 'grandmother_paternal' },
  { label: 'ตา', value: 'grandfather_maternal' },
  { label: 'ยาย', value: 'grandmother_maternal' },
  { label: 'อื่นๆ', value: 'other' },
];

const RELATIONSHIPS = FAMILY_ROLE_OPTIONS.filter(o => o.value !== 'child');

// Children.membership_type's DB default is 'standard' (see migration
// 0050_child_membership.sql) — membership moved here from Users, since
// Premium privileges apply per-child, not per parent account.
const MEMBERSHIP_TYPES = [
  { label: 'Standard', value: 'standard' },
  { label: 'Premium Member', value: 'premium' },
];

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; // 08X-XXX-XXXX
  if (d.length === 9)  return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;  // 02-XXX-XXXX
  return phone;
};

const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, mt: 1 }}>
    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {title}
    </Typography>
  </Box>
);

const UserManagement = ({ currentUserRole }: { currentUserRole?: string }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isEditing, setIsEditing] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [children, setChildren] = useState<Child[]>([]);
  const [fetchingUser, setFetchingUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [translatingField, setTranslatingField] = useState<'first_name' | 'last_name' | null>(null);

  const translateNameField = async (field: 'first_name' | 'last_name') => {
    const sourceText = form[field];
    if (!sourceText?.trim()) return;
    setTranslatingField(field);
    try {
      const res = await axios.post(`${API_BASE}/translate`, { text: sourceText, from: 'th', to: 'en' });
      if (res.data.success) {
        const enField = field === 'first_name' ? 'first_name_en' : 'last_name_en';
        setForm((f: any) => ({ ...f, [enField]: res.data.translatedText }));
      } else {
        setError(res.data.message || 'แปลภาษาไม่สำเร็จ');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'แปลภาษาไม่สำเร็จ');
    } finally {
      setTranslatingField(null);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState('');

  // Child photo — uploads immediately on pick (unlike the parent's own
  // photo above, which stages a File and only uploads on Save) because it
  // targets a different, already-existing endpoint keyed by child id
  // (profileController.uploadAvatar) rather than something bundled into
  // this form's own save payload.
  const childFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingChildIndex, setUploadingChildIndex] = useState<number | null>(null);
  const [childPhotoUploading, setChildPhotoUploading] = useState(false);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [generatedResetLink, setGeneratedResetLink] = useState('');

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [membershipHistory, setMembershipHistory] = useState<MembershipHistoryEntry[]>([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [journeyChildId, setJourneyChildId] = useState<number | null>(null);
  const [journeyChildName, setJourneyChildName] = useState<string>('');
  
  const [couponChildId, setCouponChildId] = useState<number | null>(null);
  const [couponChildName, setCouponChildName] = useState<string>('');

  // Coupon management
  const [coupons, setCoupons] = useState<UserCoupon[]>([]);
  const [couponSaving, setCouponSaving] = useState(false);
  const [showAddCoupon, setShowAddCoupon] = useState(false);
  const [newCoupon, setNewCoupon] = useState({ typeId: '', count: 1, expiresAt: '', note: '' });
  const [editingCoupon, setEditingCoupon] = useState<UserCoupon | null>(null);
  
  const [couponTypes, setCouponTypes] = useState<any[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchCouponTypes();
  }, []);

  // Deep-link from the Children Directory's "จัดการ" button
  // (?openUserId=123) — jumps straight into that parent's edit view instead
  // of making staff search for them again in this list. Waits for `users`
  // since openEdit's fallback path needs the row from this list if the
  // detail fetch below ever fails.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openUserId = searchParams.get('openUserId');
    if (!openUserId || users.length === 0) return;
    const target = users.find(u => String(u.id) === openUserId);
    if (target) openEdit(target, false);
    setSearchParams(prev => { prev.delete('openUserId'); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, searchParams]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/users`);
      if (res.data.success) setUsers(res.data.users);
    } catch (e) { console.error('Failed to fetch users', e); }
    finally { setLoading(false); }
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateForm(emptyCreateForm);
    setCreateError(null);
  };

  const handleCreateUser = async () => {
    if (!createForm.phone.trim() || !createForm.password.trim() || !createForm.first_name.trim() || !createForm.last_name.trim()) {
      setCreateError('กรุณากรอกเบอร์โทร, รหัส PIN, ชื่อ และนามสกุลให้ครบ');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      await axios.post(`${API_BASE}/users`, {
        phone: createForm.phone.trim(),
        password: createForm.password.trim(),
        prefix: createForm.prefix || undefined,
        firstName: createForm.first_name.trim(),
        lastName: createForm.last_name.trim(),
        firstNameEn: createForm.first_name_en.trim() || undefined,
        lastNameEn: createForm.last_name_en.trim() || undefined,
        dob: createForm.dob || undefined,
        email: createForm.email.trim() || undefined,
        lineId: createForm.line_id.trim() || undefined,
        address: createForm.address.trim() || undefined,
      });
      closeCreate();
      setSuccessMsg('เพิ่มลูกค้าใหม่สำเร็จ');
      fetchUsers();
    } catch (e: any) {
      setCreateError(e?.response?.data?.message || 'ไม่สามารถเพิ่มลูกค้าได้');
    } finally {
      setCreateSaving(false);
    }
  };

  const fetchCouponTypes = async () => {
    try {
      const res = await axios.get(`${API_BASE}/coupon-types`);
      if (res.data.success) {
        setCouponTypes(res.data.couponTypes);
        if (res.data.couponTypes.length > 0) {
          setNewCoupon(prev => ({ ...prev, typeId: String(res.data.couponTypes[0].id) }));
        }
      }
    } catch (e) { console.error('Failed to fetch coupon types', e); }
  };

  const clearImageState = () => {
    if (profileImagePreview.startsWith('blob:')) URL.revokeObjectURL(profileImagePreview);
    setProfileImageFile(null);
    setProfileImagePreview('');
  };

  const handleClose = () => {
    clearImageState();
    setIsEditing(false);
    setEditUser(null);
    setForm(emptyForm);
    setChildren([]);
    setCoupons([]);
    setShowAddCoupon(false);
    setEditingCoupon(null);
    setError(null);
  };

  const openEdit = async (user: User, viewOnly = false) => {
    clearImageState();
    setEditUser(user);
    setProfileImagePreview(user.profile_image_url || '');
    setReadOnly(viewOnly);
    setIsEditing(true);
    setFetchingUser(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/users/${user.id}`);
      const d = res.data.user || {};
      setForm({
        first_name: d.first_name ?? user.first_name ?? '',
        last_name: d.last_name ?? user.last_name ?? '',
        first_name_en: d.first_name_en ?? user.first_name_en ?? '',
        last_name_en: d.last_name_en ?? user.last_name_en ?? '',
        phone: d.phone ?? user.phone ?? '',
        email: d.email ?? user.email ?? '',
        relationship: d.relationship ?? '',
        line_id: d.line_id ?? '',
        pdpa_consent: d.pdpa_consent ?? false,
        // D1/SQLite has no real boolean — marketing_consent comes back as
        // integer 0/1, not JS true/false, so String(1) === "1" never matched
        // the RadioGroup's "true"/"false" values and the field always
        // rendered with neither option selected. Coerce through truthiness first.
        marketing_consent: d.marketing_consent == null ? '' : (d.marketing_consent ? 'true' : 'false'),
        application_date: d.application_date ? d.application_date.substring(0, 10) : '',
        profile_image_url: d.profile_image_url ?? '',
        is_community_admin: Boolean(d.is_community_admin),
      });
      setCoupons(d.coupons ?? []);
      setShowAddCoupon(false);
      setNewCoupon({ typeId: 'blue', count: 1, expiresAt: '', note: '' });
      setChildren((d.children ?? []).map((c: any) => ({
        id: c.id,
        full_name: c.full_name ?? '',
        full_name_en: c.full_name_en ?? '',
        nickname: c.nickname ?? '',
        gender: c.gender ?? '',
        date_of_birth: c.date_of_birth ? c.date_of_birth.substring(0, 10) : '',
        relation: c.relation ?? '',
        avatar: c.avatar ?? '',
        is_hd: Boolean(c.is_hd),
        membership_type: c.membership_type ?? 'standard',
        membership_expires_at: c.membership_expires_at ? c.membership_expires_at.substring(0, 10) : '',
      })));
    } catch {
      setForm({
        first_name: user.first_name ?? '',
        last_name: user.last_name ?? '',
        first_name_en: user.first_name_en ?? '',
        last_name_en: user.last_name_en ?? '',
        phone: user.phone ?? '',
        email: user.email ?? '',
        relationship: '',
        line_id: '',
        pdpa_consent: false,
        marketing_consent: '',
        application_date: '',
        profile_image_url: '',
        is_community_admin: Boolean(user.is_community_admin),
      });
      setChildren([]);
    } finally {
      setFetchingUser(false);
    }
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (profileImagePreview.startsWith('blob:')) URL.revokeObjectURL(profileImagePreview);
    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const addChild = () => setChildren(prev => [...prev, { ...emptyChild }]);
  const removeChild = (index: number) => setChildren(prev => prev.filter((_, i) => i !== index));
  const updateChild = (index: number, field: keyof Child, value: string) =>
    setChildren(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));

  const triggerChildPhotoUpload = (index: number) => {
    setUploadingChildIndex(index);
    childFileInputRef.current?.click();
  };

  const handleChildPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const index = uploadingChildIndex;
    e.target.value = '';
    const child = index != null ? children[index] : null;
    if (!file || !child?.id) return;
    setChildPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API_URL}/api/v1/profiles/${child.id}/upload-avatar`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.success) updateChild(index!, 'avatar', data.url);
    } catch (e: any) {
      alert('อัปโหลดรูปไม่สำเร็จ: ' + (e.response?.data?.message || e.message));
    } finally {
      setChildPhotoUploading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('กรุณากรอกชื่อและนามสกุล');
      return;
    }
    if (!form.phone.trim()) {
      setError('กรุณากรอกเบอร์โทรศัพท์');
      return;
    }
    if (children.some(c => !c.full_name.trim())) {
      setError('กรุณากรอกชื่อ-นามสกุลของสมาชิกในครอบครัวทุกคนให้ครบถ้วน');
      return;
    }
    if (children.some(c => c.is_hd && c.membership_type === 'premium' && !c.membership_expires_at)) {
      setError('กรุณาระบุวันหมดอายุสมาชิก Premium ของสมาชิกทุกคนที่เป็น Premium');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        pdpa_consent: Boolean(form.pdpa_consent),
        is_community_admin: Boolean(form.is_community_admin),
        marketing_consent: form.marketing_consent === '' ? null : form.marketing_consent === 'true',
        children: children.filter(c => !c.is_hd).map(c => ({ ...c, date_of_birth: c.date_of_birth || null })),
      };
      await axios.put(`${API_BASE}/users/${editUser!.id}`, payload);
      if (profileImageFile) {
        const fd = new FormData();
        fd.append('avatar', profileImageFile);
        await axios.post(`${API_BASE}/users/${editUser!.id}/upload-avatar`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      // HD-registered children (is_hd) live outside the CRM's own
      // User_CRM_Children table (User.children payload above only touches
      // that one) — persist their nickname/gender/relation/membership edits
      // separately.
      await Promise.all(
        children.filter(c => c.is_hd && c.id).map(c =>
          axios.put(`${API_BASE}/children/${c.id}`, {
            nickname: c.nickname, gender: c.gender, relation: c.relation || null,
            name_en: c.full_name_en || null,
            membership_type: c.membership_type ?? 'standard',
            membership_expires_at: c.membership_type === 'premium' ? c.membership_expires_at : null,
          })
        )
      );
      handleClose();
      fetchUsers();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    if (!editUser) return;
    setHistoryDialogOpen(true);
    setFetchingHistory(true);
    try {
      const res = await axios.get(`${API_BASE}/users/${editUser.id}/membership-history`);
      setMembershipHistory(res.data.history || []);
    } catch {
      setMembershipHistory([]);
    } finally {
      setFetchingHistory(false);
    }
  };

  const getHistoryActionChip = (action: string) => {
    switch (action) {
      case 'upgrade':   return <Chip icon={<UpgradeIcon />}   label="อัปเกรด Premium"  size="small" color="warning" sx={{ fontWeight: 700 }} />;
      case 'renew':     return <Chip icon={<RenewIcon />}     label="ต่ออายุ"           size="small" color="success" sx={{ fontWeight: 700 }} />;
      case 'expire':    return <Chip icon={<ExpireIcon />}    label="หมดอายุ"           size="small" color="error"   sx={{ fontWeight: 700 }} />;
      case 'downgrade': return <Chip icon={<DowngradeIcon />} label="ดาวน์เกรด"         size="small"                 sx={{ fontWeight: 700 }} />;
      case 'new':       return <Chip icon={<NewIcon />}       label="สมัครสมาชิกใหม่"  size="small" color="primary" sx={{ fontWeight: 700 }} />;
      default:          return <Chip label={action || 'ไม่ระบุ'} size="small" variant="outlined" />;
    }
  };

  const handleAddCoupon = async () => {
    if (!editUser || !newCoupon.expiresAt) return;
    const typeInfo = couponTypes.find(t => t.id === newCoupon.typeId);
    setCouponSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/users/${editUser.id}/coupons`, {
        type_id:    newCoupon.typeId,
        label:      typeInfo?.name ?? newCoupon.typeId,
        count:      newCoupon.count,
        expires_at: newCoupon.expiresAt,
        note:       newCoupon.note || undefined,
      });
      setCoupons(prev => [...prev, {
        id: res.data.id, user_id: Number(editUser.id),
        type_id: newCoupon.typeId, label: typeInfo?.name ?? newCoupon.typeId,
        count: newCoupon.count, expires_at: newCoupon.expiresAt,
        note: newCoupon.note || undefined, created_at: new Date().toISOString(),
      }]);
      setNewCoupon({ typeId: 'blue', count: 1, expiresAt: '', note: '' });
      setShowAddCoupon(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ไม่สามารถเพิ่มคูปองได้');
    } finally {
      setCouponSaving(false);
    }
  };

  const handleSaveCouponEdit = async () => {
    if (!editingCoupon) return;
    setCouponSaving(true);
    try {
      await axios.put(`${API_BASE}/users/${editUser!.id}/coupons/${editingCoupon.id}`, {
        count:      editingCoupon.count,
        expires_at: editingCoupon.expires_at,
        note:       editingCoupon.note,
      });
      setCoupons(prev => prev.map(c => c.id === editingCoupon.id ? { ...editingCoupon } : c));
      setEditingCoupon(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ไม่สามารถแก้ไขคูปองได้');
    } finally {
      setCouponSaving(false);
    }
  };

  const handleDeleteCoupon = async (couponId: number) => {
    if (!editUser) return;
    try {
      await axios.delete(`${API_BASE}/users/${editUser.id}/coupons/${couponId}`);
      setCoupons(prev => prev.filter(c => c.id !== couponId));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ไม่สามารถลบคูปองได้');
    }
  };

  const getCouponStatus = (expiresAt: string) => {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: `หมดอายุ ${Math.abs(days)} วันที่แล้ว`, color: 'error' as const };
    if (days === 0) return { label: 'หมดอายุวันนี้', color: 'error' as const };
    if (days <= 14) return { label: `เหลือ ${days} วัน`, color: 'warning' as const };
    return { label: `เหลือ ${days} วัน`, color: 'success' as const };
  };

  const confirmReset = async () => {
    if (!editUser) return;
    setResetting(true);
    try {
      const res = await axios.post(`${API_BASE}/users/${editUser.id}/reset-password`);
      setResetDialogOpen(false);
      const expiresAt = res.data.expires_at;
      const resetLink = res.data.reset_link;
      
      if (resetLink) {
        setGeneratedResetLink(resetLink);
      } else {
        const expiryNote = expiresAt
          ? ` · ลิงก์หมดอายุ ${new Date(expiresAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`
          : '';
        setSuccessMsg(`ส่งลิงก์ไปยัง ${editUser.email} แล้ว${expiryNote} — รหัสผ่านเดิมยังใช้งานได้จนกว่าจะรีเซ็ตสำเร็จ`);
      }

      setEditUser(prev => prev
        ? { ...prev, has_pending_reset: true, reset_token_expires_at: expiresAt ?? prev.reset_token_expires_at }
        : null
      );
      setUsers(prev => prev.map(u => u.id === editUser.id
        ? { ...u, has_pending_reset: true, reset_token_expires_at: expiresAt ?? u.reset_token_expires_at }
        : u
      ));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่');
      setResetDialogOpen(false);
    } finally {
      setResetting(false);
    }
  };

  const handleRevokeReset = async () => {
    if (!editUser) return;
    setRevoking(true);
    try {
      await axios.delete(`${API_BASE}/users/${editUser.id}/reset-token`);
      setSuccessMsg('ยกเลิกคำขอรีเซ็ตรหัสผ่านเรียบร้อยแล้ว — รหัสผ่านเดิมยังคงใช้งานได้ตามปกติ');
      setEditUser(prev => prev ? { ...prev, has_pending_reset: false, reset_token_expires_at: undefined } : null);
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, has_pending_reset: false } : u));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ไม่สามารถยกเลิกการรีเซ็ตได้');
    } finally {
      setRevoking(false);
    }
  };

  // Membership is per-child now — this just flags whether ANY of this
  // parent's children currently has an active Premium membership (see
  // has_premium_child, computed server-side in adminRepository.getAllUsers).
  // Per-child detail is in the child cards inside the edit view.
  const getMembershipChip = (user: User) =>
    user.has_premium_child
      ? <Chip icon={<PremiumIcon sx={{ fontSize: '14px !important' }} />} label="มีลูก Premium" size="small" color="warning" sx={{ fontWeight: 800 }} />
      : <Chip label="สมาชิกทั่วไป" size="small" variant="outlined" />;

  // Hard super_admin guard — protect() in App.tsx also blocks, this is defense-in-depth
  if (currentUserRole && currentUserRole !== 'super_admin') {
    return <Alert severity="warning" sx={{ mt: 2 }}>คุณไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อ Super Admin</Alert>;
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  // ─── Edit / View form ─────────────────────────────────────────────────────────
  if (isEditing) {
    const displayName = [form.first_name, form.last_name].filter(Boolean).join(' ') || 'ผู้ใช้งาน';

    return (
      <Box sx={{ pb: 12 }}>
        {/* Cover + Profile header */}
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
          <Box sx={{ height: 200, background: COVER_GRADIENT, position: 'relative', overflow: 'hidden' }}>
            {/* Decorative circles */}
            <Box sx={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', top: -100, right: 80 }} />
            <Box sx={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.07)', bottom: -60, right: 280 }} />
            <Box sx={{ position: 'absolute', width: 80,  height: 80,  borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', top: 24,   right: 40 }} />
            <Box sx={{ position: 'absolute', width: 40,  height: 40,  borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.10)', bottom: 32, left: '45%' }} />
            <IconButton
              onClick={handleClose}
              sx={{ position: 'absolute', top: 16, left: 16, bgcolor: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(8px)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
            >
              <BackIcon />
            </IconButton>
            <Chip
              label={readOnly ? 'ข้อมูลผู้ใช้งาน' : 'แก้ไขข้อมูล'}
              size="small"
              sx={{ position: 'absolute', top: 20, right: 20, bgcolor: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(8px)', fontWeight: 700, border: '1px solid rgba(255,255,255,0.2)' }}
            />
          </Box>

          <Box sx={{ px: 3, pb: 2.5, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            <Box sx={{ position: 'relative', mt: '-52px', flexShrink: 0 }}>
              <Avatar
                src={profileImagePreview || undefined}
                sx={{ width: 96, height: 96, border: '4px solid white', fontSize: 36, fontWeight: 800, bgcolor: 'primary.main', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
              >
                {form.first_name?.[0]?.toUpperCase() || 'U'}
              </Avatar>
              {!readOnly && (
                <IconButton
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  title="เปลี่ยนรูปโปรไฟล์"
                  sx={{ position: 'absolute', bottom: 2, right: 2, bgcolor: 'white', boxShadow: 2, width: 28, height: 28, '&:hover': { bgcolor: 'grey.100' } }}
                >
                  <CameraAltIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleProfileImageChange} />
              <input ref={childFileInputRef} type="file" accept="image/*" hidden onChange={handleChildPhotoChange} />
            </Box>
            <Box sx={{ pb: 0.5, flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>{displayName}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="body2" color="text.secondary">{form.phone ? formatPhone(form.phone) : (form.email || '-')}</Typography>
                {children.length > 0 && (
                  <Chip
                    label={`${children.length} คน`}
                    size="small"
                    icon={<ChildCareIcon sx={{ fontSize: '14px !important' }} />}
                    variant="outlined"
                  />
                )}
              </Box>
            </Box>
          </Box>
        </Paper>

        {error    && <Alert severity="error"   onClose={() => setError(null)}      sx={{ mb: 3 }}>{error}</Alert>}
        {successMsg && <Alert severity="success" onClose={() => setSuccessMsg(null)} sx={{ mb: 3 }}>{successMsg}</Alert>}

        {fetchingUser ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
        ) : (
          <Grid container spacing={3}>
            {/* ── Left column ──────────────────────────────────────── */}
            <Grid item xs={12} md={8}>

              {/* Children */}
              <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: 'primary.main', display: 'flex' }}><ChildCareIcon /></Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      ข้อมูลสมาชิกครอบครัว{children.length > 0 ? ` (${children.length} คน)` : ''}
                    </Typography>
                  </Box>
                  {!readOnly && (
                    <Button size="small" startIcon={<AddIcon />} onClick={addChild} variant="outlined" sx={{ borderRadius: 2 }}>
                      เพิ่มสมาชิกครอบครัว
                    </Button>
                  )}
                </Box>

                {children.length === 0 ? (
                  <Box sx={{ border: '2px dashed', borderColor: 'divider', borderRadius: 2, py: 5, textAlign: 'center' }}>
                    <ChildCareIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.disabled">
                      {readOnly ? 'ไม่มีข้อมูลสมาชิกครอบครัว' : 'กดปุ่ม "เพิ่มสมาชิกครอบครัว" เพื่อเริ่มต้น'}
                    </Typography>
                  </Box>
                ) : (
                  children.map((child, index) => (
                    <Box key={index}>
                      {index > 0 && <Divider sx={{ my: 2 }} />}
                      <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ position: 'relative' }}>
                              <Avatar src={child.avatar || undefined} sx={{ width: 26, height: 26, bgcolor: 'primary.main', fontSize: '0.75rem', fontWeight: 800 }}>
                                {index + 1}
                              </Avatar>
                              {!readOnly && child.id && (
                                <IconButton
                                  size="small"
                                  onClick={() => triggerChildPhotoUpload(index)}
                                  title="เปลี่ยนรูป"
                                  disabled={childPhotoUploading}
                                  sx={{ position: 'absolute', bottom: -6, right: -6, bgcolor: 'white', boxShadow: 1, width: 18, height: 18, '&:hover': { bgcolor: 'grey.100' } }}
                                >
                                  <CameraAltIcon sx={{ fontSize: 10 }} />
                                </IconButton>
                              )}
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              สมาชิกคนที่ {index + 1}
                              {child.full_name && (
                                <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                                  {' '}— {child.full_name}{child.nickname ? ` (${child.nickname})` : ''}
                                </Box>
                              )}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            {readOnly && child.id && (
                              <>
                                <Button
                                  size="small"
                                  startIcon={<HistoryIcon />}
                                  variant="outlined"
                                  sx={{ borderRadius: 2 }}
                                  onClick={() => {
                                    setJourneyChildId(child.id!);
                                    setJourneyChildName(child.full_name || child.nickname || 'นักเรียน');
                                  }}
                                >
                                  ประวัติการเรียน
                                </Button>
                                <Button
                                  size="small"
                                  startIcon={<CouponIcon />}
                                  variant="outlined"
                                  sx={{ borderRadius: 2 }}
                                  onClick={() => {
                                    setCouponChildId(child.id!);
                                    setCouponChildName(child.full_name || child.nickname || 'นักเรียน');
                                  }}
                                >
                                  จัดการคูปอง
                                </Button>
                              </>
                            )}
                            {!readOnly && (
                              <IconButton size="small" onClick={() => removeChild(index)} sx={{ color: 'error.main' }}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        </Box>
                        <Grid container spacing={1.5}>
                          {/* Split into first/last for entry, same as every other name
                              field in this app — still stored as one joined `full_name`
                              column underneath (User_CRM_Children/HD_Profiles have no
                              separate columns), so each field's onChange re-joins with
                              whatever's currently in the other half. */}
                          <Grid item xs={12} sm={6}>
                            <TextField
                              label={`ชื่อ ${child.is_hd ? '(ลงทะเบียนผ่านแอป)' : '*'}`} fullWidth size="small"
                              value={(child.full_name || '').split(' ')[0] || ''}
                              onChange={e => {
                                if (readOnly || child.is_hd) return;
                                const lastName = (child.full_name || '').split(' ').slice(1).join(' ');
                                updateChild(index, 'full_name', `${e.target.value} ${lastName}`.trim());
                              }}
                              InputProps={{ readOnly: readOnly || child.is_hd }}
                              disabled={child.is_hd}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              label={`นามสกุล ${child.is_hd ? '(ลงทะเบียนผ่านแอป)' : '*'}`} fullWidth size="small"
                              value={(child.full_name || '').split(' ').slice(1).join(' ')}
                              onChange={e => {
                                if (readOnly || child.is_hd) return;
                                const firstName = (child.full_name || '').split(' ')[0] || '';
                                updateChild(index, 'full_name', `${firstName} ${e.target.value}`.trim());
                              }}
                              InputProps={{ readOnly: readOnly || child.is_hd }}
                              disabled={child.is_hd}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              label="ชื่อเล่น" fullWidth size="small"
                              value={child.nickname}
                              onChange={e => !readOnly && updateChild(index, 'nickname', e.target.value)}
                              InputProps={{ readOnly }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small">
                              <InputLabel>เพศ</InputLabel>
                              <Select
                                value={child.gender} label="เพศ"
                                onChange={e => !readOnly && updateChild(index, 'gender', e.target.value)}
                                inputProps={{ readOnly }}
                              >
                                {GENDERS.map(g => <MenuItem key={g.value} value={g.value}>{g.label}</MenuItem>)}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              label={`วัน/เดือน/ปีเกิด ${child.is_hd ? '(ลงทะเบียนผ่านแอป)' : ''}`} fullWidth size="small" type="date"
                              value={child.date_of_birth}
                              onChange={e => !readOnly && !child.is_hd && updateChild(index, 'date_of_birth', e.target.value)}
                              InputLabelProps={{ shrink: true }}
                              InputProps={{ readOnly: readOnly || child.is_hd }}
                              disabled={child.is_hd}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small">
                              <InputLabel>คุณคือ...</InputLabel>
                              <Select
                                value={child.relation || ''} label="คุณคือ..."
                                onChange={e => !readOnly && updateChild(index, 'relation', e.target.value)}
                                inputProps={{ readOnly }}
                              >
                                {FAMILY_ROLE_OPTIONS.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                              </Select>
                            </FormControl>
                          </Grid>
                          {/* Premium membership is per-child — only real
                              (is_hd) children have a Children row to attach
                              it to; CRM-created walk-in children have no
                              membership concept. */}
                          {child.is_hd && (
                            <>
                              <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                  <InputLabel>ประเภทสมาชิก</InputLabel>
                                  <Select
                                    value={child.membership_type || 'standard'} label="ประเภทสมาชิก"
                                    onChange={e => !readOnly && setChildren(prev => prev.map((c, i) => i === index ? {
                                      ...c,
                                      membership_type: e.target.value,
                                      membership_expires_at: e.target.value === 'standard' ? '' : c.membership_expires_at,
                                    } : c))}
                                    inputProps={{ readOnly }}
                                  >
                                    {MEMBERSHIP_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                                  </Select>
                                </FormControl>
                              </Grid>
                              {child.membership_type === 'premium' && (
                                <Grid item xs={12} sm={6}>
                                  <TextField
                                    label="วันหมดอายุสมาชิก Premium *" fullWidth size="small" type="date"
                                    value={child.membership_expires_at || ''}
                                    onChange={e => !readOnly && updateChild(index, 'membership_expires_at', e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    InputProps={{ readOnly }}
                                  />
                                </Grid>
                              )}
                            </>
                          )}
                        </Grid>
                      </Box>
                    </Box>
                  ))
                )}
              </Paper>

              {/* Parent / Guardian info */}
              <Paper sx={{ p: 3, borderRadius: 3 }}>
                <SectionHeader icon={<PersonIcon />} title="ข้อมูลผู้ปกครอง" />
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField label="ชื่อ *" fullWidth value={form.first_name}
                      onChange={e => !readOnly && setForm({ ...form, first_name: e.target.value })}
                      InputProps={{ readOnly }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="นามสกุล *" fullWidth value={form.last_name}
                      onChange={e => !readOnly && setForm({ ...form, last_name: e.target.value })}
                      InputProps={{ readOnly }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ position: 'relative' }}>
                      <TextField label="First Name (English)" fullWidth value={form.first_name_en}
                        onChange={e => !readOnly && setForm({ ...form, first_name_en: e.target.value })}
                        InputProps={{ readOnly }} />
                      {!readOnly && (
                        <Tooltip title="แปลจากภาษาไทยอัตโนมัติ">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => translateNameField('first_name')}
                              disabled={translatingField === 'first_name' || !form.first_name?.trim()}
                              sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}
                            >
                              {translatingField === 'first_name' ? <CircularProgress size={16} /> : <TranslateIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ position: 'relative' }}>
                      <TextField label="Last Name (English)" fullWidth value={form.last_name_en}
                        onChange={e => !readOnly && setForm({ ...form, last_name_en: e.target.value })}
                        InputProps={{ readOnly }} />
                      {!readOnly && (
                        <Tooltip title="แปลจากภาษาไทยอัตโนมัติ">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => translateNameField('last_name')}
                              disabled={translatingField === 'last_name' || !form.last_name?.trim()}
                              sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}
                            >
                              {translatingField === 'last_name' ? <CircularProgress size={16} /> : <TranslateIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>คุณคือ...</InputLabel>
                      <Select value={form.relationship} label="คุณคือ..."
                        onChange={e => !readOnly && setForm({ ...form, relationship: e.target.value })}
                        inputProps={{ readOnly }}>
                        {RELATIONSHIPS.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="เบอร์โทรติดต่อ *" fullWidth value={form.phone}
                      onChange={e => !readOnly && setForm({ ...form, phone: e.target.value })}
                      InputProps={{ readOnly }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="อีเมล" fullWidth value={form.email}
                      onChange={e => !readOnly && setForm({ ...form, email: e.target.value })}
                      InputProps={{ readOnly }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="Line ID (ไม่บังคับ)" fullWidth value={form.line_id}
                      onChange={e => !readOnly && setForm({ ...form, line_id: e.target.value })}
                      InputProps={{ readOnly }} />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* ── Right column ─────────────────────────────────────── */}
            <Grid item xs={12} md={4}>

              {/* Consent */}
              <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
                <SectionHeader icon={<ConsentIcon />} title="ความยินยอม" />

                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ pr: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>PDPA</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                        การคุ้มครองข้อมูลส่วนบุคคล
                      </Typography>
                    </Box>
                    <Switch
                      checked={Boolean(form.pdpa_consent)}
                      onChange={e => !readOnly && setForm({ ...form, pdpa_consent: e.target.checked })}
                      disabled={readOnly}
                      size="small"
                      color="primary"
                    />
                  </Box>
                  {form.pdpa_consent && (
                    <Chip label="ยอมรับแล้ว" size="small" color="success" sx={{ mt: 1 }} />
                  )}
                </Box>

                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ pr: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Community Admin</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                        อนุญาตให้แนบรูปภาพในโพสต์ชุมชนได้
                      </Typography>
                    </Box>
                    <Switch
                      checked={Boolean(form.is_community_admin)}
                      onChange={e => !readOnly && setForm({ ...form, is_community_admin: e.target.checked })}
                      disabled={readOnly}
                      size="small"
                      color="primary"
                    />
                  </Box>
                  {form.is_community_admin && (
                    <Chip label="Community Admin" size="small" color="success" sx={{ mt: 1 }} />
                  )}
                </Box>

                <FormControl component="fieldset">
                  <FormLabel component="legend" sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                    การรับสื่อการตลาด
                  </FormLabel>
                  <RadioGroup
                    row
                    value={form.marketing_consent}
                    onChange={e => !readOnly && setForm({ ...form, marketing_consent: e.target.value })}
                  >
                    <FormControlLabel value="true"  control={<Radio size="small" disabled={readOnly} />} label="ยินยอม" />
                    <FormControlLabel value="false" control={<Radio size="small" disabled={readOnly} />} label="ไม่ยินยอม" />
                  </RadioGroup>
                </FormControl>
              </Paper>

              {/* Registration — Premium membership itself moved to a
                  per-child editor in each child's card above (see MEMBERSHIP_TYPES),
                  since it's no longer a parent-account-level concept. */}
              <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, mt: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: 'primary.main', display: 'flex' }}><MembershipIcon /></Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>ข้อมูลการสมัคร</Typography>
                  </Box>
                  <Button size="small" startIcon={<HistoryIcon />} onClick={openHistory} variant="outlined" sx={{ borderRadius: 2 }}>
                    ดูประวัติ
                  </Button>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      label="วันที่สมัครสมาชิก" fullWidth type="date"
                      value={form.application_date}
                      onChange={e => !readOnly && setForm({ ...form, application_date: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      InputProps={{ readOnly }}
                    />
                  </Grid>
                </Grid>
              </Paper>

              {/* Security */}
              <Paper sx={{ p: 3, borderRadius: 3 }}>
                <SectionHeader icon={<SecurityIcon />} title="ความปลอดภัย" />

                {editUser?.has_pending_reset && (
                  <Box sx={{ border: '1px solid', borderColor: 'warning.main', borderRadius: 2, p: 1.5, mb: 2, bgcolor: 'rgba(255,152,0,0.06)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip label="รอรีเซ็ต" size="small" color="warning" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.dark' }}>มีคำขอค้างอยู่</Typography>
                    </Box>
                    {editUser.reset_token_expires_at && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        ลิงก์หมดอายุ: {new Date(editUser.reset_token_expires_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      รหัสผ่านเดิมยังใช้งานได้อยู่
                    </Typography>
                  </Box>
                )}

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของผู้ใช้งาน
                </Typography>
                <Button
                  variant="outlined" color="warning" fullWidth
                  startIcon={<LockResetIcon />}
                  onClick={() => setResetDialogOpen(true)}
                  sx={{ borderRadius: 2, mb: editUser?.has_pending_reset ? 1 : 0 }}
                >
                  {editUser?.has_pending_reset ? 'ส่งลิงก์ใหม่อีกครั้ง' : 'รีเซ็ตรหัสผ่าน'}
                </Button>
                {editUser?.has_pending_reset && (
                  <Button
                    variant="text" color="error" fullWidth size="small"
                    onClick={handleRevokeReset} disabled={revoking}
                    sx={{ borderRadius: 2 }}
                  >
                    {revoking ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอรีเซ็ต'}
                  </Button>
                )}
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* ── Coupon section (full width) ── */}
        {!fetchingUser && (
          <Grid container spacing={3} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <Paper sx={{ p: 3, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: 'primary.main', display: 'flex' }}><CouponIcon /></Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      คูปองของผู้ใช้งาน
                      {coupons.length > 0 && (
                        <Box component="span" sx={{ ml: 1, fontWeight: 400, color: 'text.secondary', textTransform: 'none', letterSpacing: 0 }}>
                          ({coupons.length} รายการ)
                        </Box>
                      )}
                    </Typography>
                  </Box>
                  {!readOnly && (
                    <Button size="small" startIcon={<AddIcon />} variant="outlined" sx={{ borderRadius: 2 }}
                      onClick={() => { setShowAddCoupon(true); setEditingCoupon(null); }}>
                      เพิ่มคูปอง
                    </Button>
                  )}
                </Box>

                {/* Coupon table */}
                {coupons.length === 0 && !showAddCoupon ? (
                  <Box sx={{ py: 4, textAlign: 'center', border: '2px dashed', borderColor: 'divider', borderRadius: 2 }}>
                    <CouponIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 0.5 }} />
                    <Typography variant="body2" color="text.disabled">ยังไม่มีคูปอง</Typography>
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f9fafb' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>ประเภทคูปอง</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="center">จำนวน</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>วันหมดอายุ</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                          {!readOnly && <TableCell sx={{ fontWeight: 700 }} align="center">จัดการ</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {coupons.map(coupon => {
                          const typeInfo = couponTypes.find(t => t.id === coupon.type_id);
                          const status = getCouponStatus(coupon.expires_at);
                          const isEditing = editingCoupon?.id === coupon.id;
                          return (
                            <TableRow key={coupon.id} hover sx={{ bgcolor: isEditing ? 'action.hover' : undefined }}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: typeInfo?.color ?? '#888', flexShrink: 0 }} />
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{coupon.label}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="center">
                                {isEditing ? (
                                  <TextField
                                    type="number" size="small" sx={{ width: 70 }}
                                    value={editingCoupon!.count}
                                    onChange={e => setEditingCoupon({ ...editingCoupon!, count: Math.max(1, parseInt(e.target.value) || 1) })}
                                    inputProps={{ min: 1 }}
                                  />
                                ) : (
                                  <Chip label={coupon.count} size="small" variant="outlined" sx={{ fontWeight: 700, minWidth: 36 }} />
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <TextField
                                    type="date" size="small"
                                    value={editingCoupon!.expires_at.substring(0, 10)}
                                    onChange={e => setEditingCoupon({ ...editingCoupon!, expires_at: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                  />
                                ) : (
                                  <Typography variant="body2">
                                    {new Date(coupon.expires_at).toLocaleDateString('th-TH')}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                <Chip label={status.label} size="small" color={status.color} sx={{ fontWeight: 700 }} />
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <TextField
                                    size="small" placeholder="หมายเหตุ"
                                    value={editingCoupon!.note ?? ''}
                                    onChange={e => setEditingCoupon({ ...editingCoupon!, note: e.target.value })}
                                    sx={{ minWidth: 120 }}
                                  />
                                ) : (
                                  <Typography variant="caption" color="text.secondary">{coupon.note || '-'}</Typography>
                                )}
                              </TableCell>
                              {!readOnly && (
                                <TableCell align="center">
                                  {isEditing ? (
                                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                      <Button size="small" variant="contained" onClick={handleSaveCouponEdit} disabled={couponSaving} sx={{ borderRadius: 2, minWidth: 0, px: 1.5 }}>
                                        {couponSaving ? <CircularProgress size={14} color="inherit" /> : <ActiveIcon fontSize="small" />}
                                      </Button>
                                      <Button size="small" variant="outlined" onClick={() => setEditingCoupon(null)} sx={{ borderRadius: 2, minWidth: 0, px: 1.5 }}>ยกเลิก</Button>
                                    </Box>
                                  ) : (
                                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                      <IconButton size="small" color="primary" onClick={() => { setEditingCoupon({ ...coupon }); setShowAddCoupon(false); }}>
                                        <EditIcon fontSize="small" />
                                      </IconButton>
                                      <IconButton size="small" color="error" onClick={() => handleDeleteCoupon(coupon.id)}>
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </Box>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}

                        {/* Inline add form row */}
                        {showAddCoupon && !readOnly && (
                          <TableRow sx={{ bgcolor: 'primary.50' }}>
                            <TableCell>
                              <FormControl size="small" sx={{ minWidth: 160 }}>
                                <Select value={newCoupon.typeId} onChange={e => setNewCoupon({ ...newCoupon, typeId: e.target.value })}>
                                  {couponTypes.map(t => (
                                    <MenuItem key={t.id} value={String(t.id)}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {t.icon_url ? (
                                          <img src={t.icon_url} alt="icon" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                                        ) : (
                                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.color }} />
                                        )}
                                        {t.name}
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell align="center">
                              <TextField
                                type="number" size="small" sx={{ width: 70 }}
                                value={newCoupon.count}
                                onChange={e => setNewCoupon({ ...newCoupon, count: Math.max(1, parseInt(e.target.value) || 1) })}
                                inputProps={{ min: 1 }}
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                type="date" size="small" required
                                value={newCoupon.expiresAt}
                                onChange={e => setNewCoupon({ ...newCoupon, expiresAt: e.target.value })}
                                InputLabelProps={{ shrink: true }}
                              />
                            </TableCell>
                            <TableCell>
                              {newCoupon.expiresAt && (
                                <Chip label={getCouponStatus(newCoupon.expiresAt).label} size="small" color={getCouponStatus(newCoupon.expiresAt).color} />
                              )}
                            </TableCell>
                            <TableCell>
                              <TextField size="small" placeholder="หมายเหตุ (ไม่บังคับ)"
                                value={newCoupon.note}
                                onChange={e => setNewCoupon({ ...newCoupon, note: e.target.value })}
                                sx={{ minWidth: 120 }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <Button size="small" variant="contained" onClick={handleAddCoupon}
                                  disabled={couponSaving || !newCoupon.expiresAt} sx={{ borderRadius: 2, minWidth: 0, px: 1.5 }}>
                                  {couponSaving ? <CircularProgress size={14} color="inherit" /> : <AddIcon fontSize="small" />}
                                </Button>
                                <Button size="small" variant="outlined" onClick={() => setShowAddCoupon(false)} sx={{ borderRadius: 2, minWidth: 0, px: 1.5 }}>ยกเลิก</Button>
                              </Box>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            </Grid>
          </Grid>
        )}

        {!readOnly && !fetchingUser && (
          <Box sx={{ position: 'fixed', bottom: 32, right: 32, display: 'flex', gap: 2 }}>
            <Button
              variant="contained" size="large"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={handleSave} disabled={saving}
              sx={{ borderRadius: 10, px: 4 }}
            >
              {saving ? 'บันทึก...' : 'บันทึกข้อมูล'}
            </Button>
            <Button variant="outlined" size="large" onClick={handleClose} sx={{ borderRadius: 10, bgcolor: 'white' }}>
              ยกเลิก
            </Button>
          </Box>
        )}

        {/* Membership History Dialog */}
        <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
            <Box sx={{ bgcolor: 'warning.main', borderRadius: 2, p: 0.75, display: 'flex', color: 'white' }}>
              <PremiumIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>ประวัติสมาชิก Premium</Typography>
              <Typography variant="caption" color="text.secondary">
                {[form.first_name, form.last_name].filter(Boolean).join(' ') || editUser?.email}
              </Typography>
            </Box>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 0, minHeight: 260 }}>
            {fetchingHistory ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : membershipHistory.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">ไม่พบประวัติการเป็นสมาชิก</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f9fafb' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>วันที่ทำรายการ</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>รายการ</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>วันที่เริ่มต้น</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>วันที่หมดอายุ</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>บันทึกโดย</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>หมายเหตุ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {membershipHistory.map((entry) => (
                      <TableRow key={entry.id} hover>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(entry.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(entry.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </TableCell>
                        <TableCell>{getHistoryActionChip(entry.action)}</TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {entry.started_at ? new Date(entry.started_at).toLocaleDateString('th-TH') : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {entry.expires_at ? new Date(entry.expires_at).toLocaleDateString('th-TH') : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{entry.created_by || '-'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 180, wordBreak: 'break-word' }}>
                            {entry.note || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setHistoryDialogOpen(false)} variant="outlined">ปิด</Button>
          </DialogActions>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={resetDialogOpen} onClose={() => !resetting && setResetDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockResetIcon color="warning" /> รีเซ็ตรหัสผ่าน
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมล:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>{editUser?.email}</Typography>
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'info.50', borderRadius: 2, border: '1px solid', borderColor: 'info.200' }}>
              <Typography variant="caption" color="info.dark" sx={{ display: 'block', lineHeight: 1.6 }}>
                ℹ️ รหัสผ่านเดิมจะยังคงใช้งานได้ตามปกติ จนกว่าผู้ใช้จะกดลิงก์และตั้งรหัสใหม่สำเร็จ
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button onClick={() => setResetDialogOpen(false)} variant="outlined" disabled={resetting}>ยกเลิก</Button>
            <Button
              onClick={confirmReset} variant="contained" color="warning" disabled={resetting}
              startIcon={resetting ? <CircularProgress size={16} color="inherit" /> : <LockResetIcon />}
            >
              {resetting ? 'กำลังส่ง...' : 'ส่งอีเมล'}
            </Button>
          </DialogActions>
        </Dialog>

        <ChildJourneyDialog
          open={!!journeyChildId}
          onClose={() => { setJourneyChildId(null); setJourneyChildName(''); }}
          childId={journeyChildId}
          childName={journeyChildName}
        />
      </Box>
    );
  }

  // ─── Table / List view ────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  });
  const pagedUsers = filteredUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>จัดการผู้ใช้งาน</Typography>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          เพิ่มลูกค้า
        </Button>
      </Box>

      {successMsg && <Alert severity="success" onClose={() => setSuccessMsg(null)} sx={{ mb: 3 }}>{successMsg}</Alert>}
      {error      && <Alert severity="error"   onClose={() => setError(null)}      sx={{ mb: 3 }}>{error}</Alert>}

      <TextField
        placeholder="ค้นหาชื่อ, เบอร์โทร, อีเมล หรือรหัสผู้ใช้..."
        size="small"
        fullWidth
        value={searchQuery}
        onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
        sx={{ mb: 2, bgcolor: 'white' }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }}
      />

      <TableContainer component={Paper} sx={{ boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f9fafb' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>ชื่อผู้ใช้งาน</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ข้อมูลติดต่อ</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>ประเภทสมาชิก</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800 }}>จำนวนบุตร</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800 }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                  <Typography variant="body2" color="text.secondary">
                    {searchQuery ? 'ไม่พบผู้ใช้งานที่ตรงกับการค้นหา' : 'ไม่พบข้อมูลผู้ใช้งาน'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : pagedUsers.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar src={user.profile_image_url || undefined} sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
                      {!user.profile_image_url && (user.first_name?.[0] || 'U')}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{user.first_name} {user.last_name}</Typography>
                      {user.has_pending_reset
                        ? <Chip label="รอรีเซ็ตรหัส" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.6rem', height: 16, mt: 0.25 }} />
                        : <Typography variant="caption" color="text.secondary">รหัส: {user.id}</Typography>
                      }
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatPhone(user.phone)}</Typography>
                  <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                </TableCell>
                <TableCell>{getMembershipChip(user)}</TableCell>
                <TableCell align="center">
                  <Chip label={user.children_count} variant="outlined" size="small" />
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => openEdit(user, true)}>
                    <ViewIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => openEdit(user, false)} sx={{ color: 'primary.main' }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredUsers.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="แถวต่อหน้า"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
        />
      </TableContainer>
      {couponChildId && (
        <ChildCouponManagement
          childId={couponChildId}
          childName={couponChildName}
          open={Boolean(couponChildId)}
          onClose={() => setCouponChildId(null)}
        />
      )}

      {/* Reset Link Dialog */}
      <Dialog open={!!generatedResetLink} onClose={() => setGeneratedResetLink('')} maxWidth="sm" fullWidth>
        <DialogTitle>ลิงก์รีเซ็ตรหัสผ่าน</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            คุณสามารถคัดลอกลิงก์ด้านล่างและส่งให้ผู้ใช้งานเพื่อรีเซ็ตรหัสผ่านได้โดยตรง:
          </Typography>
          <TextField
            fullWidth
            value={generatedResetLink}
            InputProps={{ readOnly: true }}
            size="small"
            onClick={(e) => {
              const target = e.target as HTMLInputElement;
              target.select();
              navigator.clipboard.writeText(generatedResetLink);
              setSuccessMsg('คัดลอกลิงก์แล้ว');
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGeneratedResetLink('')}>ปิด</Button>
          <Button
            variant="contained"
            onClick={() => {
              navigator.clipboard.writeText(generatedResetLink);
              setSuccessMsg('คัดลอกลิงก์แล้ว');
              setGeneratedResetLink('');
            }}
          >
            คัดลอกลิงก์
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Customer Dialog — manual creation, bypassing OTP self-registration */}
      <Dialog open={createOpen} onClose={closeCreate} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>เพิ่มลูกค้าใหม่</DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            สร้างบัญชีลูกค้าโดยตรงจากหลังบ้าน (ไม่ต้องยืนยัน OTP) — ใช้เมื่อลูกค้าสมัครเองผ่านแอปไม่ได้ เช่น SMS ส่งไม่สำเร็จ
            หลังสร้างแล้วสามารถเพิ่มข้อมูลบุตรได้จากหน้าแก้ไขผู้ใช้งาน และลูกค้าสามารถใช้เบอร์โทร + PIN ที่ตั้งไว้ล็อกอินได้ทันที
          </Typography>
          {createError && <Alert severity="error" onClose={() => setCreateError(null)} sx={{ mb: 2 }}>{createError}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <FormControl fullWidth>
                <InputLabel>คำนำหน้า</InputLabel>
                <Select
                  label="คำนำหน้า"
                  value={createForm.prefix}
                  onChange={(e) => setCreateForm({ ...createForm, prefix: e.target.value })}
                >
                  <MenuItem value="">-</MenuItem>
                  <MenuItem value="นาย">นาย</MenuItem>
                  <MenuItem value="นาง">นาง</MenuItem>
                  <MenuItem value="นางสาว">นางสาว</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={8}>
              <TextField label="เบอร์โทรศัพท์ *" fullWidth value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="ชื่อจริง *" fullWidth value={createForm.first_name} onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="นามสกุล *" fullWidth value={createForm.last_name} onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="First Name (English)" fullWidth value={createForm.first_name_en} onChange={(e) => setCreateForm({ ...createForm, first_name_en: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Last Name (English)" fullWidth value={createForm.last_name_en} onChange={(e) => setCreateForm({ ...createForm, last_name_en: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="PIN เข้าสู่ระบบ *"
                fullWidth
                type="text"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                helperText="ลูกค้าใช้เบอร์โทร + PIN นี้ล็อกอิน (แนะนำ 6 หลัก) เปลี่ยนภายหลังได้จาก 'ลืมรหัสผ่าน'"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="วันเกิด (ผู้ปกครอง)" fullWidth type="date" InputLabelProps={{ shrink: true }}
                value={createForm.dob} onChange={(e) => setCreateForm({ ...createForm, dob: e.target.value })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField label="อีเมล" fullWidth value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="LINE ID" fullWidth value={createForm.line_id} onChange={(e) => setCreateForm({ ...createForm, line_id: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="ที่อยู่" fullWidth multiline rows={2} value={createForm.address} onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={closeCreate} disabled={createSaving}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleCreateUser} disabled={createSaving} sx={{ borderRadius: 2, fontWeight: 700 }}>
            {createSaving ? <CircularProgress size={18} sx={{ color: 'white' }} /> : 'สร้างบัญชี'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;
