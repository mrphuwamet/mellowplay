import { API_URL } from '../config';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import {
  ShoppingCart as CartIcon, Add as AddIcon, Remove as RemoveIcon,
  Delete as DeleteIcon, Search as SearchIcon, Person as MemberIcon,
  LocalOffer as CouponIcon, Percent as DiscountIcon, Print as PrintIcon,
  CheckCircle as PaidIcon, Category as CategoryIcon,
  Pending as PendingIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1/admin`;

interface CartItem {
  id: string;
  itemType: 'class' | 'service' | 'product' | 'package';
  itemId: number;
  itemName: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  salesStaffId?: number | null;
  salesStaffName?: string | null;
  serviceStaffId?: number | null;
  serviceStaffName?: string | null;
}

const formatBaht = (n: number) => n.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 });

// Epson ePOS SDK helper
const printReceipt = async (order: any, printerIp: string) => {
  const printerUrl = `https://${printerIp}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
  const lines = [
    '================================',
    '        Mellow Play Store       ',
    '================================',
    `Order: ${order.order_number}`,
    `Date : ${new Date().toLocaleString('th-TH')}`,
    '--------------------------------',
    ...(order.items ?? []).map((i: any) =>
      `${i.item_name.substring(0, 20).padEnd(20)} x${i.quantity}  ${formatBaht(i.total)}`
    ),
    '--------------------------------',
    `Subtotal : ${formatBaht(order.subtotal)}`,
    order.discount_amount > 0 ? `Discount : -${formatBaht(order.discount_amount)}` : '',
    `TOTAL    : ${formatBaht(order.total)}`,
    `Payment  : ${order.payment_method ?? ''}`,
    '================================',
    '        ขอบคุณที่ใช้บริการ       ',
    '================================',
  ].filter(Boolean);

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
  <text lang="th"/>
  ${lines.map(l => `<text>${l}&#10;</text>`).join('\n')}
  <feed unit="5"/>
  <cut type="feed"/>
</epos-print>`;

  try {
    await fetch(printerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' },
      body: `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
          ${xml}
        </epos-print></s:Body></s:Envelope>`,
    });
  } catch {
    // Fallback: browser print
    const w = window.open('', '_blank', 'width=400,height=600');
    if (w) {
      w.document.write(`<pre style="font-family:monospace;font-size:12px">${lines.join('\n')}</pre>`);
      w.print(); w.close();
    }
  }
};

const POSNew: React.FC = () => {
  const currentUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const [tab, setTab] = useState(0); // 0=items 1=cart
  const [catTab, setCatTab] = useState<'service' | 'product' | 'package' | 'class' | 'pending'>('service');

  // Data
  const [services, setServices] = useState<any[]>([]);
  const [serviceCategories, setServiceCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pending booking from booking view (navigated)
  const [pendingBooking, setPendingBooking] = useState<any>(null);

  // Staff picker dialog
  const [staffList, setStaffList]             = useState<any[]>([]);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [staffPickerItem, setStaffPickerItem] = useState<Omit<CartItem,'id'|'quantity'|'discountAmount'|'salesStaffId'|'salesStaffName'|'serviceStaffId'|'serviceStaffName'> | null>(null);
  const [pickerSalesId, setPickerSalesId]     = useState('');
  const [pickerServiceId, setPickerServiceId] = useState('');

  // Pending-payment bookings list (shown in tab)
  const [pendingList, setPendingList]       = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Member
  const [memberPhone, setMemberPhone] = useState('');
  const [member, setMember] = useState<any>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [customerName, setCustomerName] = useState('');

  // Discount & Coupon
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [couponCode, setCouponCode] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'credit_card' | 'other'>('cash');
  const [paymentOtherNote, setPaymentOtherNote] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  // Printer settings
  const printerIp = localStorage.getItem('printer_ip') || '192.168.1.100';

  // Top-up (stamp/coupon balance) — separate from cart checkout since it's
  // a direct balance credit, not a sellable line item.
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupChildId, setTopupChildId] = useState('');
  const [topupItemType, setTopupItemType] = useState<'little_junior' | 'junior'>('junior');
  const [topupQuantity, setTopupQuantity] = useState(1);
  const [topupAmount, setTopupAmount] = useState(0);
  const [topupProcessing, setTopupProcessing] = useState(false);

  // Search
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/services`).then(r => setServices(r.data.services ?? [])),
      axios.get(`${API_BASE}/service-categories`).then(r => setServiceCategories(r.data.categories ?? [])),
      axios.get(`${API_BASE}/products`).then(r => setProducts(r.data.products ?? [])),
      axios.get(`${API_BASE}/packages`).then(r => setPackages(r.data.packages ?? [])),
      axios.get(`${API_BASE}/courses`).then(r => setCourses(r.data.courses ?? [])),
      axios.get(`${API_BASE}/crm-users`).then(r => setStaffList(r.data.users ?? [])),
    ]).finally(() => setLoading(false));
  }, []);

  // Auto-load booking from sessionStorage (navigated from POSBookingView)
  useEffect(() => {
    const raw = sessionStorage.getItem('pos_pending_booking');
    if (!raw) return;
    try {
      const bk = JSON.parse(raw);
      sessionStorage.removeItem('pos_pending_booking');
      setPendingBooking(bk);
      setCart([{
        id:             `booking-${bk.bookingId}`,
        itemType:       'class',
        itemId:         bk.courseId,
        itemName:       `${bk.courseName} (จอง #${bk.bookingId})`,
        unitPrice:      bk.price,
        quantity:       1,
        discountAmount: 0,
      }]);
      if (bk.childName && bk.childName !== '(ลูกค้าทั่วไป)') setCustomerName(bk.childName);
      setIsGuest(true);
      setTab(1);
    } catch { sessionStorage.removeItem('pos_pending_booking'); }
  }, []);

  const fetchPendingList = async () => {
    setPendingLoading(true);
    try {
      const branchId = currentUser.selectedBranchId;
      const params = new URLSearchParams({ pendingPayment: '1' });
      if (branchId) params.set('branchId', String(branchId));
      const res = await axios.get(`${API_BASE}/bookings?${params}`);
      setPendingList(res.data.bookings ?? []);
    } finally { setPendingLoading(false); }
  };

  useEffect(() => {
    if (catTab === 'pending') fetchPendingList();
  }, [catTab]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discountAmount), 0), [cart]);
  const discountAmount = discountType === 'percent' ? Math.round(subtotal * discountValue / 100) : discountValue;
  const total = Math.max(0, subtotal - discountAmount);

  const addToCart = (item: Omit<CartItem, 'id' | 'quantity' | 'discountAmount'>) => {
    const id = `${item.itemType}-${item.itemId}`;
    setCart(prev => {
      const existing = prev.find(c => c.id === id);
      if (existing) return prev.map(c => c.id === id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, id, quantity: 1, discountAmount: 0 }];
    });
    setTab(1);
  };

  const openStaffPicker = (item: Omit<CartItem, 'id' | 'quantity' | 'discountAmount' | 'salesStaffId' | 'salesStaffName' | 'serviceStaffId' | 'serviceStaffName'>) => {
    setStaffPickerItem(item);
    setPickerSalesId('');
    setPickerServiceId('');
    setStaffPickerOpen(true);
  };

  const confirmStaffPicker = () => {
    if (!staffPickerItem) return;
    const salesStaff   = staffList.find(s => String(s.id) === pickerSalesId);
    const serviceStaff = staffList.find(s => String(s.id) === pickerServiceId);
    addToCart({
      ...staffPickerItem,
      salesStaffId:    salesStaff?.id   ?? null,
      salesStaffName:  salesStaff?.full_name  ?? null,
      serviceStaffId:  serviceStaff?.id  ?? null,
      serviceStaffName:serviceStaff?.full_name ?? null,
    });
    setStaffPickerOpen(false);
    setStaffPickerItem(null);
  };

  const loadBookingToCart = (bk: any) => {
    setPendingBooking({ bookingId: bk.id, courseId: bk.course_id, courseName: bk.course_name, price: bk.original_price ?? 0, childName: bk.child_name, scheduledAt: bk.scheduled_at });
    setCart([{
      id:             `booking-${bk.id}`,
      itemType:       'class',
      itemId:         bk.course_id,
      itemName:       `${bk.course_name} (จอง #${bk.id})`,
      unitPrice:      bk.original_price ?? 0,
      quantity:       1,
      discountAmount: 0,
    }]);
    if (bk.child_name && bk.child_name !== '(ลูกค้าทั่วไป)') setCustomerName(bk.child_name);
    setIsGuest(true);
    setTab(1);
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));
  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) { removeFromCart(id); return; }
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: qty } : c));
  };

  const lookupMember = async () => {
    if (!memberPhone) return;
    setMemberLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/pos/lookup-member`, { phone: memberPhone });
      if (res.data.success) { setMember(res.data.member); setCustomerName(`${res.data.member.first_name} ${res.data.member.last_name}`); setIsGuest(false); }
    } catch { alert('ไม่พบสมาชิก'); }
    finally { setMemberLoading(false); }
  };

  const openTopup = () => {
    setTopupChildId(member?.children?.[0]?.id ? String(member.children[0].id) : '');
    setTopupItemType('junior');
    setTopupQuantity(1);
    setTopupAmount(0);
    setTopupOpen(true);
  };

  const handleTopup = async () => {
    if (!member || !topupChildId || topupQuantity <= 0) return;
    setTopupProcessing(true);
    try {
      await axios.post(`${API_BASE}/pos/topup`, {
        branchId: currentUser.selectedBranchId ?? 1,
        userId: member.id,
        childId: parseInt(topupChildId),
        itemType: topupItemType,
        quantity: topupQuantity,
        amount: topupAmount,
        paymentMethod,
      });
      setTopupOpen(false);
      // Refresh member balances
      const res = await axios.post(`${API_BASE}/pos/lookup-member`, { phone: member.phone });
      if (res.data.success) setMember(res.data.member);
    } catch (e: any) {
      alert(e.response?.data?.message || 'เติมคูปองไม่สำเร็จ');
    } finally {
      setTopupProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      const res = await axios.post(`${API_BASE}/orders`, {
        branchId: currentUser.selectedBranchId ?? 1,
        userId: member?.id ?? null,
        customerName: isGuest ? customerName || 'Walk-in' : customerName,
        customerPhone: member?.phone ?? memberPhone ?? null,
        discountAmount,
        couponCode: couponCode || null,
        paymentMethod: paymentMethod === 'other' ? (paymentOtherNote || 'other') : paymentMethod,
        paymentStatus: 'paid',
        createdBy: currentUser.id,
        items: cart.map(c => ({
          itemType: c.itemType,
          itemId: c.itemId,
          itemName: c.itemName,
          unitPrice: c.unitPrice,
          quantity: c.quantity,
          discountAmount: c.discountAmount,
          total: c.unitPrice * c.quantity - c.discountAmount,
          meta: (c.salesStaffId || c.serviceStaffId) ? {
            salesStaffId:    c.salesStaffId    ?? null,
            salesStaffName:  c.salesStaffName  ?? null,
            serviceStaffId:  c.serviceStaffId  ?? null,
            serviceStaffName:c.serviceStaffName ?? null,
          } : undefined,
        })),
      });
      const order = res.data.order;
      setCompletedOrder(order);
      setCheckoutOpen(false);
      setSuccessOpen(true);

      // If came from a booking, link it back
      if (pendingBooking?.bookingId && order?.id) {
        const pm = paymentMethod === 'other' ? (paymentOtherNote || 'other') : paymentMethod;
        await axios.post(`${API_BASE}/bookings/${pendingBooking.bookingId}/pay`, {
          paymentMethod: pm,
          orderId: order.id,
        }).catch(() => {/* non-critical */});
        setPendingBooking(null);
      }

      // Print
      if (order) await printReceipt(order, printerIp);
      // Reset
      setCart([]);
      setMember(null);
      setMemberPhone('');
      setCustomerName('');
      setDiscountValue(0);
      setDiscountType('fixed');
      setCouponCode('');
      setPaymentMethod('cash');
      setPaymentOtherNote('');
      setIsGuest(false);
      setTab(0);
    } catch (e: any) { alert(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
    finally { setProcessing(false); }
  };

  const filtered = (list: any[], nameKey = 'name') =>
    searchQ ? list.filter(i => i[nameKey]?.toLowerCase().includes(searchQ.toLowerCase())) : list;

  const ItemCard = ({ item, type, price, label }: { item: any; type: CartItem['itemType']; price: number; label?: string }) => {
    const needsStaff = type === 'class' || type === 'service';
    const handleClick = () => {
      if (needsStaff) {
        openStaffPicker({ itemType: type, itemId: item.id, itemName: item.name, unitPrice: price });
      } else {
        addToCart({ itemType: type, itemId: item.id, itemName: item.name, unitPrice: price });
      }
    };
    return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' }, transition: 'all 0.15s' }}
      onClick={handleClick}>
      <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.3 }}>{item.name}</Typography>
      {label && <Typography variant="caption" color="text.secondary">{label}</Typography>}
      <Typography variant="body2" color="primary.main" fontWeight={800} sx={{ mt: 0.5 }}>{formatBaht(price)}</Typography>
    </Paper>
    );
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: 'calc(100vh - 100px)' }}>
      {/* Pending booking banner */}
      {pendingBooking && (
        <Alert
          severity="info"
          icon={<PaidIcon />}
          sx={{ borderRadius: 2, py: 0.75, fontWeight: 700 }}
          action={
            <Button size="small" color="inherit" onClick={() => { setPendingBooking(null); setCart([]); }}>
              ยกเลิก
            </Button>
          }
        >
          กำลังชำระการจอง #{pendingBooking.bookingId} · {pendingBooking.courseName}
          {pendingBooking.childName && pendingBooking.childName !== '(ลูกค้าทั่วไป)' && ` · ${pendingBooking.childName}`}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden' }}>
      {/* Left: Items */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField size="small" placeholder="ค้นหาสินค้า / บริการ..." fullWidth
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
        </Box>
        <Tabs value={catTab} onChange={(_, v) => setCatTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="บริการ" value="service" />
          <Tab label="สินค้า" value="product" />
          <Tab label="แพ็คเกจ" value="package" />
          <Tab label="คลาสเรียน" value="class" />
          <Tab
            value="pending"
            label={
              <Badge badgeContent={pendingList.length || null} color="error" max={99}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PendingIcon sx={{ fontSize: 16 }} />
                  รอชำระ
                </Box>
              </Badge>
            }
            sx={{ color: 'warning.main', '&.Mui-selected': { color: 'warning.dark' } }}
          />
        </Tabs>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <Grid container spacing={1.5}>
            {catTab === 'service' && filtered(services).map(s => (
              <Grid item xs={6} sm={4} key={s.id}>
                <ItemCard item={s} type="service" price={s.price} label={serviceCategories.find(c => c.id === s.category_id)?.name} />
              </Grid>
            ))}
            {catTab === 'product' && filtered(products).map(p => (
              <Grid item xs={6} sm={4} key={p.id}>
                <ItemCard item={p} type="product" price={p.sell_price} label={`สต๊อก: ${p.current_stock}`} />
              </Grid>
            ))}
            {catTab === 'package' && filtered(packages).map(p => (
              <Grid item xs={6} sm={4} key={p.id}>
                <ItemCard item={p} type="package" price={p.price} label={p.description} />
              </Grid>
            ))}
            {catTab === 'class' && filtered(courses).map(c => (
              <Grid item xs={6} sm={4} key={c.id}>
                <ItemCard item={c} type="class" price={c.original_price ?? 0} label={c.category_name} />
              </Grid>
            ))}
          </Grid>

          {/* Pending payment tab */}
          {catTab === 'pending' && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
                <Button size="small" startIcon={<RefreshIcon />} onClick={fetchPendingList} disabled={pendingLoading} sx={{ fontWeight: 700 }}>
                  รีเฟรช
                </Button>
              </Box>
              {pendingLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
              ) : pendingList.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <PaidIcon sx={{ fontSize: 48, color: 'success.light', mb: 1 }} />
                  <Typography color="text.secondary" fontWeight={600}>ไม่มีรายการรอชำระ</Typography>
                </Box>
              ) : (
                <Stack spacing={1.5}>
                  {pendingList.map(bk => {
                    const dt = new Date(bk.scheduled_at);
                    const dateStr = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
                    const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <Paper
                        key={bk.id}
                        variant="outlined"
                        onClick={() => loadBookingToCart(bk)}
                        sx={{
                          p: 1.75, borderRadius: 2, cursor: 'pointer', borderColor: 'warning.light',
                          bgcolor: 'rgba(245,158,11,0.03)',
                          '&:hover': { borderColor: 'warning.main', bgcolor: 'rgba(245,158,11,0.07)', transform: 'translateY(-1px)' },
                          transition: 'all 0.15s',
                        }}
                      >
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={800} noWrap>{bk.course_name}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {bk.child_name} · {dateStr} {timeStr} น.
                            </Typography>
                            <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }} alignItems="center">
                              <Chip
                                label={bk.status === 'pending' ? 'รอดำเนินการ' : (bk.status === 'confirmed' || bk.status === 'confirmed_paid') ? 'ชำระแล้ว' : bk.status}
                                size="small"
                                color={(bk.status === 'confirmed' || bk.status === 'confirmed_paid') ? 'info' : 'default'}
                                sx={{ fontWeight: 700, fontSize: '10px', height: 18 }}
                              />
                              <Chip
                                label="ยังไม่ชำระ"
                                size="small"
                                color="warning"
                                sx={{ fontWeight: 700, fontSize: '10px', height: 18 }}
                              />
                            </Stack>
                          </Box>
                          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                            <Typography variant="body1" fontWeight={800} color="primary.main">
                              ฿{Number(bk.original_price ?? 0).toLocaleString()}
                            </Typography>
                            <Button size="small" variant="contained" color="warning" sx={{ mt: 0.5, fontWeight: 800, fontSize: '11px', borderRadius: 2 }}>
                              เรียกชำระ
                            </Button>
                          </Box>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Right: Cart */}
      <Paper sx={{ width: 420, minWidth: 420, borderRadius: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Cart header */}
        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CartIcon />
            <Typography fontWeight={800}>ตะกร้า ({cart.length} รายการ)</Typography>
          </Box>
        </Box>

        {/* Member */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField size="small" placeholder="เบอร์สมาชิก" fullWidth value={memberPhone}
              onChange={(e) => setMemberPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupMember()}
              InputProps={{ startAdornment: <InputAdornment position="start"><MemberIcon fontSize="small" /></InputAdornment> }} />
            <Button size="small" variant="outlined" onClick={lookupMember} disabled={memberLoading} sx={{ borderRadius: 2, minWidth: 60 }}>
              {memberLoading ? <CircularProgress size={14} /> : 'ค้นหา'}
            </Button>
          </Box>
          {member && (
            <Box>
              <Alert severity="success" sx={{ py: 0 }}>
                <Typography variant="caption" fontWeight={700}>{member.first_name} {member.last_name}</Typography>
              </Alert>
              <Button size="small" startIcon={<CouponIcon fontSize="small" />} onClick={openTopup}
                disabled={!member.children?.length} sx={{ mt: 0.5, borderRadius: 2 }}>
                เติมคูปอง
              </Button>
            </Box>
          )}
          {!member && (
            <TextField size="small" placeholder="ชื่อลูกค้า (Guest)" fullWidth value={customerName}
              onChange={(e) => setCustomerName(e.target.value)} />
          )}
        </Box>

        {/* Cart items */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
          {cart.length === 0 && (
            <Typography color="text.disabled" sx={{ textAlign: 'center', mt: 4 }}>ยังไม่มีรายการ</Typography>
          )}
          {cart.map(item => (
            <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap>{item.itemName}</Typography>
                <Typography variant="caption" color="text.secondary">{formatBaht(item.unitPrice)} / ชิ้น</Typography>
                {(item.salesStaffName || item.serviceStaffName) && (
                  <Box sx={{ mt: 0.25 }}>
                    {item.salesStaffName && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        ขาย: {item.salesStaffName}
                      </Typography>
                    )}
                    {item.serviceStaffName && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        ปฏิบัติงาน: {item.serviceStaffName}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={() => updateQty(item.id, item.quantity - 1)}><RemoveIcon fontSize="small" /></IconButton>
                <Typography variant="body2" fontWeight={700} sx={{ minWidth: 20, textAlign: 'center' }}>{item.quantity}</Typography>
                <IconButton size="small" onClick={() => updateQty(item.id, item.quantity + 1)}><AddIcon fontSize="small" /></IconButton>
              </Box>
              <Typography variant="body2" fontWeight={800} sx={{ minWidth: 70, textAlign: 'right' }}>
                {formatBaht(item.unitPrice * item.quantity)}
              </Typography>
              <IconButton size="small" color="error" onClick={() => removeFromCart(item.id)}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
        </Box>

        {/* Summary */}
        <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          {/* Coupon code */}
          <TextField size="small" placeholder="โค้ดส่วนลด" fullWidth sx={{ mb: 1 }} value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><CouponIcon fontSize="small" /></InputAdornment> }} />
          {/* Discount */}
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>ส่วนลด</Typography>
            <Box sx={{ display: 'flex', borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden', mb: 1 }}>
              <Box onClick={() => setDiscountType('fixed')}
                sx={{ flex: 1, py: 1, textAlign: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                  bgcolor: discountType === 'fixed' ? 'primary.main' : 'transparent',
                  color: discountType === 'fixed' ? 'white' : 'text.secondary',
                  transition: 'all 0.15s', '&:hover': { bgcolor: discountType === 'fixed' ? 'primary.dark' : 'grey.100' } }}>
                จำนวนเงิน (฿)
              </Box>
              <Box onClick={() => setDiscountType('percent')}
                sx={{ flex: 1, py: 1, textAlign: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                  borderLeft: '1px solid', borderColor: 'divider',
                  bgcolor: discountType === 'percent' ? 'primary.main' : 'transparent',
                  color: discountType === 'percent' ? 'white' : 'text.secondary',
                  transition: 'all 0.15s', '&:hover': { bgcolor: discountType === 'percent' ? 'primary.dark' : 'grey.100' } }}>
                เปอร์เซ็นต์ (%)
              </Box>
            </Box>
            <TextField size="small" type="number" fullWidth
              placeholder={discountType === 'percent' ? 'กรอก % เช่น 10' : 'กรอกจำนวนเงิน เช่น 50'}
              value={discountValue || ''}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
              inputProps={{ min: 0, max: discountType === 'percent' ? 100 : undefined }}
              InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="body2" fontWeight={700} color="primary">{discountType === 'percent' ? '%' : '฿'}</Typography></InputAdornment> }} />
            {discountValue > 0 && (
              <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
                ลด {discountType === 'percent' ? `${discountValue}% = ` : ''}{formatBaht(discountAmount)}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">ราคารวม</Typography>
            <Typography variant="body2">{formatBaht(subtotal)}</Typography>
          </Box>
          {discountAmount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="error.main">ส่วนลด</Typography>
              <Typography variant="body2" color="error.main">-{formatBaht(discountAmount)}</Typography>
            </Box>
          )}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography fontWeight={800}>ยอดรวมสุทธิ</Typography>
            <Typography fontWeight={800} color="primary.main" variant="h6">{formatBaht(total)}</Typography>
          </Box>
          {/* Payment method — เลือกตั้งแต่แรก */}
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>วิธีชำระเงิน</Typography>
          <Box sx={{ display: 'flex', borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden', mb: paymentMethod === 'other' ? 1 : 1.5 }}>
            {([['cash','เงินสด'],['transfer','โอนเงิน'],['credit_card','บัตร'],['other','อื่นๆ']] as [string,string][]).map(([val, label], i) => (
              <Box key={val} onClick={() => setPaymentMethod(val as any)}
                sx={{ flex: 1, py: 1, textAlign: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem',
                  borderLeft: i > 0 ? '1px solid' : 'none', borderColor: 'divider',
                  bgcolor: paymentMethod === val ? 'primary.main' : 'transparent',
                  color: paymentMethod === val ? 'white' : 'text.secondary',
                  transition: 'all 0.15s', '&:hover': { bgcolor: paymentMethod === val ? 'primary.dark' : 'grey.100' } }}>
                {label}
              </Box>
            ))}
          </Box>
          {paymentMethod === 'other' && (
            <TextField size="small" fullWidth placeholder="ระบุช่องทางชำระ เช่น QR Code, เชื่อเครดิต..." sx={{ mb: 1.5 }}
              value={paymentOtherNote} onChange={(e) => setPaymentOtherNote(e.target.value)} />
          )}
          <Button fullWidth variant="contained" size="large" disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)} sx={{ borderRadius: 3, fontWeight: 800, py: 1.5 }}>
            ชำระเงิน {cart.length > 0 ? formatBaht(total) : ''}
          </Button>
        </Box>
      </Paper>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการชำระเงิน</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary">วิธีชำระเงิน: <strong>
              {paymentMethod === 'cash' ? 'เงินสด' : paymentMethod === 'transfer' ? 'โอนเงิน' : paymentMethod === 'credit_card' ? 'บัตรเครดิต/เดบิต' : paymentOtherNote || 'อื่นๆ'}
            </strong></Typography>
          </Box>
          <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2 }}>
            {cart.map(i => (
              <Box key={i.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">{i.itemName} x{i.quantity}</Typography>
                <Typography variant="body2">{formatBaht(i.unitPrice * i.quantity)}</Typography>
              </Box>
            ))}
            {discountAmount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="body2" color="error">ส่วนลด</Typography>
                <Typography variant="body2" color="error">-{formatBaht(discountAmount)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography fontWeight={800}>รวมทั้งหมด</Typography>
              <Typography fontWeight={800} color="primary.main">{formatBaht(total)}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCheckoutOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" color="success" onClick={handleCheckout} disabled={processing} sx={{ borderRadius: 3, fontWeight: 800 }}>
            {processing ? <CircularProgress size={20} /> : `ยืนยัน ${formatBaht(total)}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successOpen} onClose={() => setSuccessOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogContent sx={{ textAlign: 'center', pt: 4, pb: 3 }}>
          <PaidIcon sx={{ fontSize: 64, color: 'success.main', mb: 1 }} />
          <Typography variant="h6" fontWeight={800}>ชำระเงินสำเร็จ!</Typography>
          <Typography color="text.secondary">Order: {completedOrder?.order_number}</Typography>
          <Typography variant="h5" fontWeight={800} color="primary.main" sx={{ mt: 1 }}>{formatBaht(completedOrder?.total ?? 0)}</Typography>
          <Button variant="outlined" startIcon={<PrintIcon />} sx={{ mt: 2, borderRadius: 3 }}
            onClick={() => completedOrder && printReceipt(completedOrder, printerIp)}>
            พิมพ์ใบเสร็จอีกครั้ง
          </Button>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'center' }}>
          <Button variant="contained" onClick={() => setSuccessOpen(false)} sx={{ borderRadius: 3, fontWeight: 700 }}>
            ปิด
          </Button>
        </DialogActions>
      </Dialog>

      {/* Staff Picker Dialog */}
      <Dialog open={staffPickerOpen} onClose={() => setStaffPickerOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>เลือกพนักงาน</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {staffPickerItem && (
            <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 2, mb: 2 }}>
              <Typography variant="body2" fontWeight={700}>{staffPickerItem.itemName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {staffPickerItem.itemType === 'class' ? 'คลาสเรียน' : 'บริการ'} · {formatBaht(staffPickerItem.unitPrice)}
              </Typography>
            </Box>
          )}
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>พนักงานขาย</InputLabel>
              <Select value={pickerSalesId} label="พนักงานขาย" onChange={e => setPickerSalesId(e.target.value)}>
                <MenuItem value=""><em>— ไม่ระบุ —</em></MenuItem>
                {staffList.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.full_name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>{staffPickerItem?.itemType === 'class' ? 'ครู / Facilitator' : 'พนักงานปฏิบัติงาน'}</InputLabel>
              <Select value={pickerServiceId} label={staffPickerItem?.itemType === 'class' ? 'ครู / Facilitator' : 'พนักงานปฏิบัติงาน'} onChange={e => setPickerServiceId(e.target.value)}>
                <MenuItem value=""><em>— ไม่ระบุ —</em></MenuItem>
                {staffList.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.full_name}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStaffPickerOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={confirmStaffPicker} sx={{ fontWeight: 800, borderRadius: 2 }}>
            เพิ่มในตะกร้า
          </Button>
        </DialogActions>
      </Dialog>

      {/* Top-up Dialog */}
      <Dialog open={topupOpen} onClose={() => setTopupOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>เติมคูปอง / สแตมป์สะสม</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>เด็ก</InputLabel>
              <Select value={topupChildId} label="เด็ก" onChange={e => setTopupChildId(e.target.value)}>
                {(member?.children ?? []).map((ch: any) => (
                  <MenuItem key={ch.id} value={String(ch.id)}>
                    {ch.name} (Little Junior: {ch.little_junior_balance} / Junior: {ch.junior_balance})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>ประเภท</InputLabel>
              <Select value={topupItemType} label="ประเภท" onChange={e => setTopupItemType(e.target.value as 'little_junior' | 'junior')}>
                <MenuItem value="little_junior">Little Junior</MenuItem>
                <MenuItem value="junior">Junior</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" type="number" label="จำนวนที่เติม" fullWidth value={topupQuantity}
              onChange={e => setTopupQuantity(parseInt(e.target.value) || 0)} />
            <TextField size="small" type="number" label="ยอดชำระ (บาท)" fullWidth value={topupAmount}
              onChange={e => setTopupAmount(parseFloat(e.target.value) || 0)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTopupOpen(false)}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleTopup} disabled={topupProcessing || !topupChildId}
            sx={{ fontWeight: 800, borderRadius: 2 }}>
            {topupProcessing ? <CircularProgress size={16} /> : 'ยืนยันการเติม'}
          </Button>
        </DialogActions>
      </Dialog>

      </Box> {/* end inner flex row */}
    </Box>
  );
};

export default POSNew;
