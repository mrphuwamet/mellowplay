import { API_URL } from '../config';
import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Grid, TextField, Button,
  InputAdornment, IconButton, Card, CardContent,
  Divider, Chip, Stack, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, Switch, FormControlLabel,
  Radio, RadioGroup, FormControl, FormLabel, Select, MenuItem, InputLabel,
  Avatar, Paper,
} from '@mui/material';
import {
  Search as SearchIcon,
  ArrowBack as BackIcon,
  Add as AddIcon,
  AccountBalanceWallet as WalletIcon,
  AccessTime as TimeIcon,
  ChevronRight as NextIcon,
  ChevronLeft as PrevIcon,
  CheckCircle as CheckIcon,
  Person as PersonIcon,
  Groups as StaffIcon,
  Inventory2 as PackageIcon,
  WorkspacePremium as PremiumIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

// POS_PACKAGES and COUPON_TYPES_POS will be fetched dynamically

const PKG_STEPS = ['เลือกแพ็คเกจ', 'ข้อมูลลูกค้า', 'ชำระเงิน'];

const CATEGORY_PALETTE = [
  { bg: '#ede9fe', border: '#7c3aed', text: '#7c3aed', avatar: '#7c3aed' },
  { bg: '#e0f2fe', border: '#0284c7', text: '#0284c7', avatar: '#0284c7' },
  { bg: '#dcfce7', border: '#16a34a', text: '#16a34a', avatar: '#16a34a' },
  { bg: '#fef9c3', border: '#ca8a04', text: '#b45309', avatar: '#ca8a04' },
  { bg: '#fee2e2', border: '#dc2626', text: '#dc2626', avatar: '#dc2626' },
  { bg: '#fce7f3', border: '#db2777', text: '#db2777', avatar: '#db2777' },
  { bg: '#ccfbf1', border: '#0d9488', text: '#0d9488', avatar: '#0d9488' },
  { bg: '#ffedd5', border: '#ea580c', text: '#ea580c', avatar: '#ea580c' },
];

const STEPS = ['เวลาเรียน', 'ข้อมูลลูกค้า', 'พนักงาน', 'ชำระเงิน'];

interface Child {
  id: string;
  name: string;
  birth_date: string;
  little_junior_balance: number;
  junior_balance: number;
}
interface Member {
  id: string;
  phone: string;
  first_name: string;
  last_name: string;
  children: Child[];
}

const StepIndicator = ({ step }: { step: number }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
    {STEPS.map((label, i) => (
      <React.Fragment key={i}>
        <Box sx={{ textAlign: 'center', minWidth: 56 }}>
          <Box
            sx={{
              width: 32, height: 32, borderRadius: '50%', mx: 'auto', mb: 0.5,
              bgcolor: i < step ? 'success.main' : i === step ? 'primary.main' : '#e2e8f0',
              color: i <= step ? 'white' : 'text.disabled',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 800, transition: 'all 0.2s',
            }}
          >
            {i < step ? <CheckIcon sx={{ fontSize: 16 }} /> : i + 1}
          </Box>
          <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: i === step ? 800 : 500, color: i === step ? 'primary.main' : 'text.secondary', display: 'block' }}>
            {label}
          </Typography>
        </Box>
        {i < STEPS.length - 1 && (
          <Box sx={{ flex: 1, height: 2, bgcolor: i < step ? 'success.main' : '#e2e8f0', mx: 0.5, mt: -2, transition: 'all 0.2s' }} />
        )}
      </React.Fragment>
    ))}
  </Box>
);

const POSDashboard = () => {
  const userJson = localStorage.getItem('crm_user');
  const currentUser = userJson ? JSON.parse(userJson) : null;
  const branchId = currentUser?.selectedBranchId;
  const branchName = currentUser?.selectedBranchName;

  // Navigation
  const [viewMode, setViewMode] = useState<'categories' | 'courses'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string } | null>(null);

  // Data
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [couponTypes, setCouponTypes] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Course detail
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [courseDetailOpen, setCourseDetailOpen] = useState(false);

  // Booking dialog
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(0);
  const [processing, setProcessing] = useState(false);

  // Step 0 – time
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('');

  // Step 1 – customer
  const [isGuest, setIsGuest] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);

  // Step 2 – staff
  const [salesStaffId, setSalesStaffId] = useState('');
  const [teachingStaffId, setTeachingStaffId] = useState('');

  // Step 3 – payment
  const [payNow, setPayNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'credit_card'>('cash');

  // Package sale
  const [pkgSaleOpen, setPkgSaleOpen] = useState(false);
  const [pkgStep, setPkgStep] = useState(0);
  const [selectedPkg, setSelectedPkg] = useState<any | null>(null);
  const [pkgProcessing, setPkgProcessing] = useState(false);

  useEffect(() => {
    const fetchInitial = async () => {
      setDataLoading(true);
      try {
        const [coursesRes, staffRes, couponTypesRes, packagesRes] = await Promise.all([
          axios.get(`${API_BASE}/courses`),
          axios.get(`${API_BASE}/crm-users`).catch(() => ({ data: { users: [] } })),
          axios.get(`${API_BASE}/coupon-types`).catch(() => ({ data: { couponTypes: [] } })),
          axios.get(`${API_BASE}/packages`).catch(() => ({ data: { packages: [] } })),
        ]);
        if (coursesRes.data.success) setAllCourses(coursesRes.data.courses);
        if (staffRes.data.users) setStaffList(staffRes.data.users);
        if (couponTypesRes.data.success) {
          setCouponTypes(couponTypesRes.data.couponTypes.map((c: any) => ({
            id: String(c.id),
            label: c.name,
            color: c.color,
            icon_url: c.icon_url,
            bg: `${c.color}20` // simple hex opacity
          })));
        }
        if (packagesRes.data.success) {
          setPackages(packagesRes.data.packages.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            price: p.price,
            coupons: p.coupons ?? [],
            premiumDays: p.premium_days ?? 0,
            sellerCommission: { type: p.seller_commission_type ?? 'percent', value: String(p.seller_commission_value ?? '') },
            active: Boolean(p.active),
          })).filter((p: any) => p.active));
        }
      } catch (e) { console.error(e); }
      finally { setDataLoading(false); }
    };
    fetchInitial();
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    allCourses.forEach(c => {
      if (c.category_id == null) return;
      const key = String(c.category_id);
      const existing = map.get(key);
      map.set(key, { name: c.category_name || 'ไม่มีหมวดหมู่', count: (existing?.count ?? 0) + 1 });
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [allCourses]);

  const filteredCourses = useMemo(() => {
    if (!selectedCategory) return allCourses;
    return allCourses.filter(c => String(c.category_id) === selectedCategory.id);
  }, [allCourses, selectedCategory]);

  const activeChild = member?.children.find(c => c.id === selectedChildId);

  const handleSearchMember = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchPhone) return;
    setMemberLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/pos/lookup-member`, { phone: searchPhone });
      if (res.data.success) {
        setMember(res.data.member);
        if (res.data.member.children.length > 0) setSelectedChildId(res.data.member.children[0].id);
      }
    } catch { alert('ไม่พบข้อมูลสมาชิก'); }
    finally { setMemberLoading(false); }
  };

  const openBooking = (course: any) => {
    setSelectedCourse(course);
    setCourseDetailOpen(false);
    setBookingStep(0);
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setSelectedTime('');
    setIsGuest(false);
    setMember(null);
    setSearchPhone('');
    setSelectedChildId('');
    setSalesStaffId('');
    setTeachingStaffId('');
    setPayNow(true);
    setPaymentMethod('cash');
    setBookingOpen(true);
  };

  const handleConfirmBooking = async () => {
    if (!selectedTime || !selectedCourse) return;
    setProcessing(true);
    try {
      await axios.post(`${API_BASE}/pos/process-sale`, {
        userId: member?.id || null,
        childId: selectedChildId || null,
        branchId,
        date: selectedDate,
        startTime: selectedTime,
        courseId: selectedCourse.id,
        isGuest,
        paymentMethod: payNow ? paymentMethod : 'later',
        salesStaffId: salesStaffId || null,
        teachingStaffId: teachingStaffId || null,
      });
      alert('บันทึกการจองสำเร็จ');
      setBookingOpen(false);
    } catch (e: any) { alert(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
    finally { setProcessing(false); }
  };

  const openPkgSale = () => {
    setSelectedPkg(null);
    setPkgStep(0);
    setIsGuest(false);
    setMember(null);
    setSearchPhone('');
    setSelectedChildId('');
    setSalesStaffId('');
    setPayNow(true);
    setPaymentMethod('cash');
    setPkgSaleOpen(true);
  };

  const handleConfirmPkgSale = async () => {
    if (!selectedPkg) return;
    setPkgProcessing(true);
    try {
      await axios.post(`${API_BASE}/pos/process-package-sale`, {
        packageId: selectedPkg.id,
        userId: member?.id || null,
        branchId,
        isGuest,
        paymentMethod: payNow ? paymentMethod : 'later',
        salesStaffId: salesStaffId || null,
      });
      alert(`บันทึกการซื้อแพ็คเกจ "${selectedPkg.name}" สำเร็จ`);
      setPkgSaleOpen(false);
    } catch (e: any) { alert(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
    finally { setPkgProcessing(false); }
  };

  const canGoNext = () => {
    if (bookingStep === 0) return !!selectedDate && !!selectedTime;
    if (bookingStep === 1) return isGuest || (!!member && !!selectedChildId);
    if (bookingStep === 2) return true;
    return true;
  };

  // ─── CATEGORY GRID ──────────────────────────────────────────────────────
  const CategoryView = () => (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
        POS & Booking{branchName ? ` — ${branchName}` : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        เลือกหมวดหมู่สินค้า / คลาสเรียน
      </Typography>

      {/* Package sale shortcut */}
      <Card
        onClick={openPkgSale}
        sx={{
          cursor: 'pointer', borderRadius: 3, mb: 4,
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
          color: 'white', border: 'none',
          transition: 'transform 0.15s, box-shadow 0.15s',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(124,58,237,0.35)' },
        }}
      >
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '16px !important' }}>
          <PackageIcon sx={{ fontSize: 36 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={800}>ซื้อแพ็คเกจ</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              {POS_PACKAGES.length} แพ็คเกจ — คูปอง + สมาชิก Premium
            </Typography>
          </Box>
          <NextIcon />
        </CardContent>
      </Card>

      {dataLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      ) : categories.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 3 }}>ยังไม่มีข้อมูลสินค้า/คลาส — กรุณาเพิ่มข้อมูลในระบบ CRM ก่อน</Alert>
      ) : (
        <Grid container spacing={3}>
          {categories.map((cat, idx) => {
            const palette = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
            return (
              <Grid item xs={12} sm={6} md={4} key={cat.id}>
                <Card
                  onClick={() => { setSelectedCategory(cat); setViewMode('courses'); }}
                  sx={{
                    cursor: 'pointer', borderRadius: 4, border: '2px solid', borderColor: palette.border,
                    bgcolor: palette.bg, transition: 'all 0.18s',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: `0 12px 30px ${palette.border}33` },
                    minHeight: 130,
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Avatar sx={{ bgcolor: palette.avatar, width: 48, height: 48, mb: 2, fontSize: '1.3rem', fontWeight: 800 }}>
                      {cat.name[0]}
                    </Avatar>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: palette.text, lineHeight: 1.3 }}>
                      {cat.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: palette.text, opacity: 0.7, mt: 0.5 }}>
                      {cat.count} คลาส
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );

  // ─── COURSE LIST ─────────────────────────────────────────────────────────
  const CoursesView = () => (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <IconButton onClick={() => setViewMode('categories')} sx={{ bgcolor: '#f1f5f9' }}>
          <BackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{selectedCategory?.name}</Typography>
          <Typography variant="body2" color="text.secondary">{filteredCourses.length} คลาส</Typography>
        </Box>
      </Box>
      <Grid container spacing={3}>
        {filteredCourses.map(course => (
          <Grid item xs={12} sm={6} md={4} key={course.id}>
            <Card variant="outlined" sx={{ borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column', '&:hover': { borderColor: 'primary.main', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' } }}>
              <CardContent sx={{ p: 3, flexGrow: 1 }}>
                <Chip label={course.category_name} size="small" variant="outlined" sx={{ mb: 1.5, fontWeight: 700, fontSize: '10px' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5, lineHeight: 1.3 }}>{course.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{course.code}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 0.5 }}>
                  {course.duration && (
                    <Chip icon={<TimeIcon sx={{ fontSize: 12 }} />} label={`${course.duration} ชม.`} size="small" sx={{ fontWeight: 700, height: 22, fontSize: '10px' }} />
                  )}
                  {course.original_price != null && (
                    <Chip label={`฿${course.original_price}`} size="small" color="success" variant="outlined" sx={{ fontWeight: 700, height: 22, fontSize: '10px' }} />
                  )}
                </Stack>
              </CardContent>
              <Box sx={{ px: 3, pb: 3 }}>
                <Button
                  fullWidth variant="contained" endIcon={<NextIcon />}
                  onClick={() => { setSelectedCourse(course); setCourseDetailOpen(true); }}
                  sx={{ borderRadius: 3, fontWeight: 800 }}
                >
                  ดูรายละเอียด
                </Button>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );

  // ─── BOOKING STEP CONTENT ────────────────────────────────────────────────
  const renderStep = () => {
    if (bookingStep === 0) return (
      <Stack spacing={3}>
        <TextField
          label="วันที่เรียน" type="date" fullWidth value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="เวลาเริ่มเรียน" type="time" fullWidth value={selectedTime}
          onChange={e => setSelectedTime(e.target.value)}
          InputLabelProps={{ shrink: true }}
          helperText="เลือกเวลาได้อิสระ"
        />
      </Stack>
    );

    if (bookingStep === 1) return (
      <Box>
        <FormControlLabel
          control={<Switch checked={isGuest} onChange={e => { setIsGuest(e.target.checked); if (e.target.checked) setMember(null); }} />}
          label={<Typography sx={{ fontWeight: 700 }}>ลูกค้าทั่วไป (Guest)</Typography>}
          sx={{ mb: 2 }}
        />
        {!isGuest && (
          <Stack spacing={2}>
            <form onSubmit={handleSearchMember}>
              <TextField
                fullWidth label="เบอร์โทรศัพท์" value={searchPhone}
                onChange={e => setSearchPhone(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton type="submit" size="small">
                        {memberLoading ? <CircularProgress size={16} /> : <SearchIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </form>
            {member && (
              <>
                <Alert severity="success" sx={{ borderRadius: 2 }}>
                  พบสมาชิก: <strong>{member.first_name} {member.last_name}</strong>
                </Alert>
                <FormControl fullWidth>
                  <InputLabel>เลือกเด็ก</InputLabel>
                  <Select value={selectedChildId} label="เลือกเด็ก" onChange={e => setSelectedChildId(e.target.value)}>
                    {member.children.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
                {activeChild && (
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: '#f8fafc' }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>คูปองคงเหลือ</Typography>
                    <Grid container spacing={1} sx={{ mt: 0.5 }}>
                      <Grid item xs={6}>
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                          <Typography variant="h6" sx={{ fontWeight: 900 }}>{activeChild.little_junior_balance}</Typography>
                          <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: 700 }}>Little Junior</Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'white', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                          <Typography variant="h6" sx={{ fontWeight: 900 }}>{activeChild.junior_balance}</Typography>
                          <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: 700 }}>Junior</Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Paper>
                )}
              </>
            )}
          </Stack>
        )}
        {isGuest && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>จะบันทึกเป็น Walk-in Guest — ชำระเงินสดหน้าร้าน</Alert>
        )}
      </Box>
    );

    if (bookingStep === 2) return (
      <Stack spacing={3}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon fontSize="small" color="primary" /> พนักงานขาย
          </Typography>
          <FormControl fullWidth>
            <InputLabel>เลือกพนักงานขาย</InputLabel>
            <Select value={salesStaffId} label="เลือกพนักงานขาย" onChange={e => setSalesStaffId(e.target.value)}>
              <MenuItem value="">— ไม่ระบุ —</MenuItem>
              {staffList.map(s => <MenuItem key={s.id} value={s.id}>{s.fullName || s.name || s.username}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <StaffIcon fontSize="small" color="secondary" /> พนักงานสอน
          </Typography>
          <FormControl fullWidth>
            <InputLabel>เลือกพนักงานสอน</InputLabel>
            <Select value={teachingStaffId} label="เลือกพนักงานสอน" onChange={e => setTeachingStaffId(e.target.value)}>
              <MenuItem value="">— ไม่ระบุ —</MenuItem>
              {staffList.map(s => <MenuItem key={s.id} value={s.id}>{s.fullName || s.name || s.username}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        {staffList.length === 0 && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>ไม่พบข้อมูลพนักงาน — สามารถข้ามขั้นตอนนี้ได้</Alert>
        )}
      </Stack>
    );

    if (bookingStep === 3) return (
      <Stack spacing={3}>
        {/* Summary */}
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: '#f8fafc' }}>
          <Typography variant="caption" sx={{ fontWeight: 900, color: 'primary.main', display: 'block', mb: 1 }}>สรุปรายการ</Typography>
          <Stack spacing={0.75}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">คลาส</Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCourse?.name}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">วันที่และเวลา</Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedDate} เวลา {selectedTime} น.</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">ลูกค้า</Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {isGuest ? 'Guest' : `${member?.first_name} (${activeChild?.name})`}
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {/* Payment type */}
        <FormControl>
          <FormLabel sx={{ fontWeight: 800, mb: 1 }}>การชำระเงิน</FormLabel>
          <RadioGroup value={payNow ? 'now' : 'later'} onChange={e => setPayNow(e.target.value === 'now')}>
            <FormControlLabel value="now" control={<Radio />} label={<Typography sx={{ fontWeight: 700 }}>ชำระเงินทันที</Typography>} />
            <FormControlLabel value="later" control={<Radio />} label={<Typography sx={{ fontWeight: 700 }}>ชำระภายหลัง</Typography>} />
          </RadioGroup>
        </FormControl>

        {payNow && (
          <FormControl fullWidth>
            <InputLabel>วิธีชำระเงิน</InputLabel>
            <Select value={paymentMethod} label="วิธีชำระเงิน" onChange={e => setPaymentMethod(e.target.value as any)}>
              <MenuItem value="cash">เงินสด</MenuItem>
              <MenuItem value="transfer">โอนเงิน (Mobile Banking)</MenuItem>
              <MenuItem value="credit_card">บัตรเครดิต (EDC)</MenuItem>
            </Select>
          </FormControl>
        )}
      </Stack>
    );
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <Box sx={{ pb: 8 }}>
      {viewMode === 'categories' ? <CategoryView /> : <CoursesView />}

      {/* COURSE DETAIL DIALOG */}
      <Dialog open={courseDetailOpen} onClose={() => setCourseDetailOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{selectedCourse?.name}</DialogTitle>
        <DialogContent dividers>
          {selectedCourse && (
            <Stack spacing={3}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={selectedCourse.category_name} color="primary" size="small" sx={{ fontWeight: 700 }} />
                <Chip label={selectedCourse.code} variant="outlined" size="small" sx={{ fontWeight: 700 }} />
              </Box>

              {selectedCourse.description && (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary', display: 'block', mb: 0.5 }}>คำอธิบาย</Typography>
                  <Typography variant="body2" sx={{ lineHeight: 1.7 }}>{selectedCourse.description}</Typography>
                </Box>
              )}

              <Divider />

              <Grid container spacing={2}>
                {selectedCourse.duration && (
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary', display: 'block', mb: 0.5 }}>ระยะเวลา</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{selectedCourse.duration} ชม.</Typography>
                  </Grid>
                )}
                {selectedCourse.original_price != null && (
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary', display: 'block', mb: 0.5 }}>ราคาปกติ</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>฿{selectedCourse.original_price}</Typography>
                  </Grid>
                )}
                {selectedCourse.premium_price != null && (
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: 'primary.main', display: 'block', mb: 0.5 }}>ราคา Premium</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>฿{selectedCourse.premium_price}</Typography>
                  </Grid>
                )}
                {selectedCourse.age_min != null && (
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary', display: 'block', mb: 0.5 }}>ช่วงอายุ</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{selectedCourse.age_min}–{selectedCourse.age_max} ปี</Typography>
                  </Grid>
                )}
              </Grid>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => setCourseDetailOpen(false)} variant="outlined" sx={{ borderRadius: 3, fontWeight: 700 }}>ปิด</Button>
          <Button variant="contained" endIcon={<NextIcon />} onClick={() => openBooking(selectedCourse)} sx={{ borderRadius: 3, fontWeight: 800, px: 3 }}>
            จองคลาสนี้
          </Button>
        </DialogActions>
      </Dialog>

      {/* BOOKING DIALOG */}
      <Dialog open={bookingOpen} onClose={() => setBookingOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          จอง — {selectedCourse?.name}
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 3 }}>
          <StepIndicator step={bookingStep} />
          {renderStep()}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button
            startIcon={<PrevIcon />}
            onClick={() => setBookingStep(s => s - 1)}
            disabled={bookingStep === 0}
            variant="outlined"
            sx={{ borderRadius: 3, fontWeight: 700 }}
          >
            ย้อนกลับ
          </Button>
          <Box sx={{ flex: 1 }} />
          {bookingStep < STEPS.length - 1 ? (
            <Button
              variant="contained"
              endIcon={<NextIcon />}
              disabled={!canGoNext()}
              onClick={() => setBookingStep(s => s + 1)}
              sx={{ borderRadius: 3, fontWeight: 800, px: 3 }}
            >
              ถัดไป
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              endIcon={processing ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
              disabled={processing}
              onClick={handleConfirmBooking}
              sx={{ borderRadius: 3, fontWeight: 800, px: 3 }}
            >
              ยืนยันการจอง
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* PACKAGE SALE DIALOG */}
      <Dialog open={pkgSaleOpen} onClose={() => setPkgSaleOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>ซื้อแพ็คเกจ</DialogTitle>
        <DialogContent dividers sx={{ pt: 3 }}>
          {/* PKG step indicator — separate from STEPS constant */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            {PKG_STEPS.map((label, i) => (
              <React.Fragment key={i}>
                <Box sx={{ textAlign: 'center', minWidth: 56 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', mx: 'auto', mb: 0.5, bgcolor: i < pkgStep ? 'success.main' : i === pkgStep ? 'primary.main' : '#e2e8f0', color: i <= pkgStep ? 'white' : 'text.disabled', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, transition: 'all 0.2s' }}>
                    {i < pkgStep ? <CheckIcon sx={{ fontSize: 16 }} /> : i + 1}
                  </Box>
                  <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: i === pkgStep ? 800 : 500, color: i === pkgStep ? 'primary.main' : 'text.secondary', display: 'block' }}>
                    {label}
                  </Typography>
                </Box>
                {i < PKG_STEPS.length - 1 && <Box sx={{ flex: 1, height: 2, bgcolor: i < pkgStep ? 'success.main' : '#e2e8f0', mx: 0.5, mt: -2, transition: 'all 0.2s' }} />}
              </React.Fragment>
            ))}
          </Box>

          {/* Step 0: Package selection */}
          {pkgStep === 0 && (
            <Stack spacing={2}>
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  onClick={() => setSelectedPkg(pkg)}
                  variant="outlined"
                  sx={{
                    cursor: 'pointer', borderRadius: 3, p: 0,
                    border: '2px solid',
                    borderColor: selectedPkg?.id === pkg.id ? 'primary.main' : 'divider',
                    bgcolor: selectedPkg?.id === pkg.id ? 'primary.50' : 'background.paper',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={800}>{pkg.name}</Typography>
                      <Typography variant="h6" fontWeight={900} color="primary.main">฿{pkg.price.toLocaleString()}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{pkg.description}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                      {pkg.coupons.filter((c: any) => c.quantity > 0).map((c: any) => {
                        const ct = couponTypes.find((t) => String(t.id) === String(c.typeId));
                        if (!ct) return null;
                        return (
                          <Chip 
                            key={c.typeId} 
                            size="small" 
                            label={`${ct.label} ×${c.quantity}`}
                            icon={ct.icon_url ? <img src={ct.icon_url} alt="icon" style={{width: 14, height: 14, objectFit: 'contain', marginLeft: 4}} /> : undefined}
                            sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: ct.bg, color: ct.color, border: `1px solid ${ct.color}` }} 
                          />
                        );
                      })}
                      {pkg.premiumDays > 0 && (
                        <Chip size="small" icon={<PremiumIcon sx={{ fontSize: 14, color: '#f59e0b !important' }} />}
                          label={`Premium ${pkg.premiumDays} วัน`}
                          sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: '#fffbeb', color: '#b45309', border: '1px solid #f59e0b' }} />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}

          {/* Step 1: Customer lookup (reuse booking logic) */}
          {pkgStep === 1 && renderStep()}

          {/* Step 2: Payment */}
          {pkgStep === 2 && selectedPkg && (
            <Stack spacing={3}>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: '#f8fafc' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1.5 }}>สรุปการซื้อ</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">แพ็คเกจ</Typography>
                  <Typography variant="body2" fontWeight={800}>{selectedPkg.name}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">ลูกค้า</Typography>
                  <Typography variant="body2" fontWeight={800}>
                    {isGuest ? 'Guest' : `${member?.first_name} ${member?.last_name}`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">ราคา</Typography>
                  <Typography variant="h6" fontWeight={900} color="primary.main">฿{selectedPkg.price.toLocaleString()}</Typography>
                </Box>
                {selectedPkg.premiumDays > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    <PremiumIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
                    <Typography variant="caption" fontWeight={700} color="#b45309">ลูกค้าจะได้รับ Premium {selectedPkg.premiumDays} วัน</Typography>
                  </Box>
                )}
              </Paper>
              <FormControl>
                <FormLabel sx={{ fontWeight: 800, mb: 1 }}>การชำระเงิน</FormLabel>
                <RadioGroup value={payNow ? 'now' : 'later'} onChange={e => setPayNow(e.target.value === 'now')}>
                  <FormControlLabel value="now" control={<Radio />} label={<Typography sx={{ fontWeight: 700 }}>ชำระเงินทันที</Typography>} />
                  <FormControlLabel value="later" control={<Radio />} label={<Typography sx={{ fontWeight: 700 }}>ชำระภายหลัง</Typography>} />
                </RadioGroup>
              </FormControl>
              {payNow && (
                <FormControl fullWidth>
                  <InputLabel>วิธีชำระเงิน</InputLabel>
                  <Select value={paymentMethod} label="วิธีชำระเงิน" onChange={e => setPaymentMethod(e.target.value as any)}>
                    <MenuItem value="cash">เงินสด</MenuItem>
                    <MenuItem value="transfer">โอนเงิน (Mobile Banking)</MenuItem>
                    <MenuItem value="credit_card">บัตรเครดิต (EDC)</MenuItem>
                  </Select>
                </FormControl>
              )}
              <FormControl fullWidth>
                <InputLabel>พนักงานขาย (ถ้ามี)</InputLabel>
                <Select value={salesStaffId} label="พนักงานขาย (ถ้ามี)" onChange={e => setSalesStaffId(e.target.value)}>
                  <MenuItem value=""><em>ไม่ระบุ</em></MenuItem>
                  {staffList.map((s: any) => <MenuItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button startIcon={<PrevIcon />} onClick={() => setPkgStep(s => s - 1)} disabled={pkgStep === 0} variant="outlined" sx={{ borderRadius: 3, fontWeight: 700 }}>
            ย้อนกลับ
          </Button>
          <Box sx={{ flex: 1 }} />
          {pkgStep < PKG_STEPS.length - 1 ? (
            <Button
              variant="contained" endIcon={<NextIcon />}
              disabled={pkgStep === 0 ? !selectedPkg : (pkgStep === 1 ? !(isGuest || (!!member && !!selectedChildId)) : false)}
              onClick={() => {
                if (pkgStep === 1) {
                  // skip child requirement for package sale — just need member or guest
                  if (!isGuest && !member) return;
                }
                setPkgStep(s => s + 1);
              }}
              sx={{ borderRadius: 3, fontWeight: 800, px: 3 }}
            >
              ถัดไป
            </Button>
          ) : (
            <Button
              variant="contained" color="success"
              endIcon={pkgProcessing ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
              disabled={pkgProcessing}
              onClick={handleConfirmPkgSale}
              sx={{ borderRadius: 3, fontWeight: 800, px: 3 }}
            >
              ยืนยันการซื้อ
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default POSDashboard;
