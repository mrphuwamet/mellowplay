import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  EmojiEvents as TrophyIcon,
  Storefront as SalesIcon,
  CheckCircle as DoneIcon,
  RadioButtonUnchecked as TodoIcon,
  OpenInNew as LinkIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

// ─── Types (mirror the real backend shapes — see hrRepository.getMyIncentiveSummary) ──

interface Payout {
  id: number;
  incentive: number;
  ot_hours: number;
  ot_rate: number;
  expense: number;
  total: number;
  status: 'pending' | 'paid';
  paid_at: string | null;
}

interface Staff {
  salary: number | null;
  employment_type: 'monthly' | 'daily' | null;
  role: string;
}

interface Campaign {
  id: number;
  name: string;
  type: 'sales' | 'teaching_hours';
  target_value: number;
  bonus_type: 'fixed' | 'percent';
  bonus_value: number;
  month: number;
  year: number;
  progress: number;
}

const TH_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];

const CAMPAIGN_TYPE_CONFIG: Record<Campaign['type'], { label: string; unit: string; color: string }> = {
  sales:          { label: 'ยอดขาย',     unit: 'บาท',  color: '#7c3aed' },
  teaching_hours: { label: 'จำนวนคลาสที่สอน', unit: 'ครั้ง',  color: '#0284c7' },
};

// ─── Component ────────────────────────────────────────────────────────────────

const IncentiveTracking: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const now = new Date();
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    if (!currentUser?.id) { setLoading(false); return; }
    setLoading(true);
    axios.get(`${API_BASE}/incentive-summary`, {
      params: { crmUserId: currentUser.id, month: selectedMonth, year: selectedYear },
    })
      .then(res => {
        setStaff(res.data.staff ?? null);
        setPayout(res.data.payout ?? null);
        setCampaigns(res.data.campaigns ?? []);
      })
      .finally(() => setLoading(false));
  }, [selectedMonth, selectedYear]);

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedYear(y => y - 1); setSelectedMonth(12); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    const atCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
    if (atCurrent) return;
    if (selectedMonth === 12) { setSelectedYear(y => y + 1); setSelectedMonth(1); }
    else setSelectedMonth(m => m + 1);
  };
  const isAtCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  const base = staff?.salary ?? 0;
  const commissionTotal = payout?.total ?? 0;

  const campaignBonusTotal = campaigns.reduce((sum, c) => {
    if (c.progress < c.target_value) return sum;
    return c.bonus_type === 'fixed' ? sum + c.bonus_value : sum + (c.target_value * c.bonus_value / 100);
  }, 0);

  const totalIncome = base + commissionTotal + campaignBonusTotal;

  const statusChip = !payout
    ? { label: 'ยังไม่สร้างรอบจ่าย', color: 'default' as const }
    : payout.status === 'paid'
      ? { label: 'จ่ายแล้ว', color: 'success' as const }
      : { label: 'รอการจ่าย', color: 'warning' as const };

  const IncomeRow = ({ label, amount, sub, icon, color = 'text.primary' }: {
    label: string; amount: number; sub?: string; icon?: React.ReactNode; color?: string;
  }) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', py: 1.75, px: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {icon && <Box sx={{ color, mt: 0.25, display: 'flex', flexShrink: 0 }}>{icon}</Box>}
        <Box>
          <Typography variant="body1" fontWeight={600}>{label}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
      </Box>
      <Typography variant="body1" fontWeight={700} color={color}>
        {amount > 0 ? `+฿${amount.toLocaleString()}` : '—'}
      </Typography>
    </Box>
  );

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WalletIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>ข้อมูลรายได้ (Incentive)</Typography>
            <Typography variant="body2" color="text.secondary">รายได้จากรอบจ่ายและแคมเปญโบนัสของคุณ</Typography>
          </Box>
        </Box>
        <Button
          variant="outlined" size="small" endIcon={<LinkIcon />}
          onClick={() => navigate('/crm/campaign-bonus')}
          sx={{ borderRadius: 3, fontWeight: 700 }}
        >
          จัดการแคมเปญโบนัส
        </Button>
      </Box>

      {/* Month navigator */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton size="small" onClick={prevMonth}><PrevIcon /></IconButton>
        <Typography variant="h6" fontWeight={800} sx={{ flex: 1, textAlign: 'center' }}>
          {TH_MONTHS[selectedMonth - 1]} {selectedYear + 543}
        </Typography>
        <IconButton size="small" onClick={nextMonth} disabled={isAtCurrentMonth}><NextIcon /></IconButton>
        {!isAtCurrentMonth && (
          <Button size="small" variant="outlined"
            onClick={() => { setSelectedYear(now.getFullYear()); setSelectedMonth(now.getMonth() + 1); }}
            sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
            เดือนนี้
          </Button>
        )}
      </Box>

      {/* Status */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
        <Chip label={statusChip.label} color={statusChip.color} size="small" sx={{ fontWeight: 700 }} />
        {payout?.status === 'paid' && payout.paid_at && (
          <Typography variant="caption" color="text.secondary">จ่ายวันที่ {payout.paid_at}</Typography>
        )}
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'ฐานเงินเดือน',  value: base, color: '#7c3aed', sub: staff?.employment_type === 'daily' ? 'รายวัน' : 'รายเดือน' },
          { label: 'ค่าคอมมิชชัน + เบิกจ่าย', value: commissionTotal, color: '#0284c7', sub: payout ? 'จากรอบจ่ายนี้' : 'ยังไม่มีรอบจ่าย' },
          { label: 'โบนัสแคมเปญ',   value: campaignBonusTotal, color: '#059669', sub: `${campaigns.length} แคมเปญ` },
        ].map(({ label, value, color, sub }) => (
          <Grid item xs={4} key={label}>
            <Paper sx={{ p: 2, borderRadius: 3, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block' }}>{label}</Typography>
              <Typography variant="h6" fontWeight={900} sx={{ color, mt: 0.25 }}>฿{value.toLocaleString()}</Typography>
              <Typography variant="caption" color="text.secondary">{sub}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Income breakdown */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ px: 3, pt: 2.5, pb: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={800}>รายละเอียดรายได้</Typography>
        </Box>
        <Box sx={{ px: 3 }}>

          {/* Base */}
          <IncomeRow
            icon={<WalletIcon sx={{ fontSize: 20 }} />}
            label={staff?.employment_type === 'daily' ? 'ค่าจ้างรายวัน' : 'เงินเดือน (รายเดือน)'}
            amount={base} color="#7c3aed"
          />
          <Divider />

          {/* Commission + expense */}
          <Box sx={{ py: 1.75, px: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <SalesIcon sx={{ fontSize: 20, color: '#0284c7' }} />
              <Typography variant="body1" fontWeight={600}>ค่าคอมมิชชัน + เบิกจ่าย</Typography>
              <Typography variant="body1" fontWeight={700} color="#0284c7" sx={{ ml: 'auto' }}>
                {commissionTotal > 0 ? `+฿${commissionTotal.toLocaleString()}` : '—'}
              </Typography>
            </Box>
            {payout ? (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4.5, mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">ค่าคอมมิชชันจากยอดขาย/สอน</Typography>
                  <Typography variant="caption" fontWeight={700}>฿{payout.incentive.toLocaleString()}</Typography>
                </Box>
                {payout.ot_hours > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4.5, mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">OT ({payout.ot_hours} ชม. × ฿{payout.ot_rate})</Typography>
                    <Typography variant="caption" fontWeight={700}>฿{(payout.ot_hours * payout.ot_rate).toLocaleString()}</Typography>
                  </Box>
                )}
                {payout.expense > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4.5 }}>
                    <Typography variant="caption" color="text.secondary">เบิกล่วงหน้าที่อนุมัติ</Typography>
                    <Typography variant="caption" fontWeight={700}>฿{payout.expense.toLocaleString()}</Typography>
                  </Box>
                )}
              </>
            ) : (
              <Typography variant="caption" color="text.disabled" sx={{ pl: 4.5 }}>ยังไม่มีการสร้างรอบจ่ายสำหรับเดือนนี้</Typography>
            )}
          </Box>
          <Divider />

          {/* Campaign bonus */}
          <Box sx={{ py: 1.75, px: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: campaigns.length > 0 ? 1 : 0 }}>
              <TrophyIcon sx={{ fontSize: 20, color: '#059669' }} />
              <Typography variant="body1" fontWeight={600}>โบนัสแคมเปญ</Typography>
              <Typography variant="body1" fontWeight={700} color="#059669" sx={{ ml: 'auto' }}>
                {campaignBonusTotal > 0 ? `+฿${campaignBonusTotal.toLocaleString()}` : '—'}
              </Typography>
            </Box>
            {campaigns.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ pl: 4.5 }}>ไม่มีแคมเปญในเดือนนี้</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 4.5 }}>
                {campaigns.map(c => {
                  const achieved  = c.progress >= c.target_value;
                  const pct       = c.target_value > 0 ? Math.min((c.progress / c.target_value) * 100, 100) : 0;
                  const cfg       = CAMPAIGN_TYPE_CONFIG[c.type];
                  const bonusDisp = c.bonus_type === 'fixed' ? `฿${c.bonus_value.toLocaleString()}` : `${c.bonus_value}% ของยอด`;
                  return (
                    <Box key={c.id}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {achieved
                            ? <DoneIcon sx={{ fontSize: 14, color: 'success.main' }} />
                            : <TodoIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          }
                          <Typography variant="caption" fontWeight={700}>{c.name}</Typography>
                        </Box>
                        <Typography variant="caption" fontWeight={700} color={achieved ? 'success.main' : 'text.secondary'}>
                          {achieved ? bonusDisp : '฿0'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate" value={pct}
                          color={achieved ? 'success' : 'primary'}
                          sx={{ flex: 1, height: 6, borderRadius: 99 }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>
                          {c.progress.toLocaleString()} / {c.target_value.toLocaleString()} {cfg.unit}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
          <Divider />

          {/* Total */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2, px: 0.5 }}>
            <Typography variant="subtitle1" fontWeight={800} color="primary.main">รวมรายได้สุทธิ</Typography>
            <Typography variant="h5" fontWeight={900} color="primary.main">฿{totalIncome.toLocaleString()}</Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default IncentiveTracking;
