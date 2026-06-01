import React, { useState, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
  Star as DiligenceIcon,
  Storefront as SalesIcon,
  CheckCircle as DoneIcon,
  RadioButtonUnchecked as TodoIcon,
  OpenInNew as LinkIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignType = 'sales' | 'teaching_hours';

interface Campaign {
  id: number;
  name: string;
  type: CampaignType;
  targetValue: number;
  bonusAmount: number;
  bonusType: 'fixed' | 'percent';
  month: number;
  year: number;
  active: boolean;
}

interface MonthIncome {
  base: number;
  employeeType: 'monthly' | 'daily';
  workDays?: number;
  dailyRate?: number;
  salesComm: number;
  salesCommCount: number;
  salesCommRate: string;
  teacherComm: number;
  teacherCommCount: number;
  teacherCommRate: string;
  diligence: number;
  diligenceReason: string;
  paid: boolean;
  paidDate?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TH_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];
const TH_MONTHS_SHORT = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.',
];

const CAMPAIGN_TYPE_CONFIG: Record<CampaignType, { label: string; unit: string; color: string }> = {
  sales:          { label: 'ยอดขาย',     unit: 'บาท',  color: '#7c3aed' },
  teaching_hours: { label: 'ชั่วโมงสอน', unit: 'ชม.',  color: '#0284c7' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPayPeriod(year: number, month: number) {
  const end   = new Date(year, month - 1, 25);
  const start = new Date(year, month - 2, 26);
  const fmt   = (d: Date) => `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
  return { label: `${fmt(start)} – ${fmt(end)}` };
}

function getPeriodStatus(year: number, month: number, paid: boolean): 'ongoing' | 'awaiting' | 'paid' {
  if (paid) return 'paid';
  const today   = new Date();
  const payDate = new Date(year, month - 1, 25);
  if (today.getFullYear() === year && today.getMonth() + 1 === month && today <= payDate) return 'ongoing';
  return 'awaiting';
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_INCOME: Record<string, MonthIncome> = {
  '2026-5': {
    base: 15000, employeeType: 'monthly',
    salesComm: 750,  salesCommCount: 5, salesCommRate: '฿150/package',
    teacherComm: 1200, teacherCommCount: 6, teacherCommRate: '฿200/session',
    diligence: 500, diligenceReason: 'มาตรงเวลาทุกวัน ไม่ขาดงาน',
    paid: false,
  },
  '2026-4': {
    base: 15000, employeeType: 'monthly',
    salesComm: 450,  salesCommCount: 3, salesCommRate: '฿150/package',
    teacherComm: 1000, teacherCommCount: 5, teacherCommRate: '฿200/session',
    diligence: 500, diligenceReason: 'มาตรงเวลาทุกวัน ไม่ขาดงาน',
    paid: true, paidDate: '25 เม.ย. 2569',
  },
  '2026-3': {
    base: 15000, employeeType: 'monthly',
    salesComm: 300,  salesCommCount: 2, salesCommRate: '฿150/package',
    teacherComm: 800,  teacherCommCount: 4, teacherCommRate: '฿200/session',
    diligence: 0, diligenceReason: 'มาสาย 2 ครั้ง',
    paid: true, paidDate: '25 มี.ค. 2569',
  },
  '2026-2': {
    base: 15000, employeeType: 'monthly',
    salesComm: 600,  salesCommCount: 4, salesCommRate: '฿150/package',
    teacherComm: 1400, teacherCommCount: 7, teacherCommRate: '฿200/session',
    diligence: 500, diligenceReason: 'มาตรงเวลาทุกวัน ไม่ขาดงาน',
    paid: true, paidDate: '25 ก.พ. 2569',
  },
};

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: 1, name: 'เป้าสอน พ.ค. 2569', type: 'teaching_hours', targetValue: 20, bonusAmount: 800, bonusType: 'fixed', month: 5, year: 2026, active: true },
  { id: 2, name: 'แคมเปญยอดขาย พ.ค. 2569', type: 'sales', targetValue: 50000, bonusAmount: 5, bonusType: 'percent', month: 5, year: 2026, active: true },
  { id: 3, name: 'ยอดขาย เม.ย. 2569', type: 'sales', targetValue: 30000, bonusAmount: 600, bonusType: 'fixed', month: 4, year: 2026, active: true },
];

const MOCK_CAMPAIGN_PROGRESS: Record<number, number> = {
  1: 22,
  2: 38000,
  3: 5,
};

// ─── Component ────────────────────────────────────────────────────────────────

const IncentiveTracking: React.FC = () => {
  const navigate = useNavigate();
  const now = new Date();
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

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

  // Derive income
  const incomeKey = `${selectedYear}-${selectedMonth}`;
  const income: MonthIncome = MOCK_INCOME[incomeKey] ?? {
    base: 15000, employeeType: 'monthly',
    salesComm: 0, salesCommCount: 0, salesCommRate: '฿150/package',
    teacherComm: 0, teacherCommCount: 0, teacherCommRate: '฿200/session',
    diligence: 0, diligenceReason: 'ยังไม่มีข้อมูล',
    paid: false,
  };

  const { label: periodLabel } = getPayPeriod(selectedYear, selectedMonth);
  const periodStatus = getPeriodStatus(selectedYear, selectedMonth, income.paid);

  // Active campaigns for the selected month
  const activeCampaigns = useMemo(() =>
    MOCK_CAMPAIGNS.filter(c => c.active && c.year === selectedYear && c.month === selectedMonth),
  [selectedYear, selectedMonth]);

  const campaignBonusTotal = useMemo(() => activeCampaigns.reduce((sum, c) => {
    const progress = MOCK_CAMPAIGN_PROGRESS[c.id] ?? 0;
    if (progress < c.targetValue) return sum;
    return c.bonusType === 'fixed' ? sum + c.bonusAmount : sum + (c.targetValue * c.bonusAmount / 100);
  }, 0), [activeCampaigns]);

  const totalIncome = income.base + income.salesComm + income.teacherComm + income.diligence + campaignBonusTotal;

  const statusChip = {
    ongoing:  { label: 'กำลังดำเนินอยู่', color: 'info'    as const },
    awaiting: { label: 'รอการจ่าย',        color: 'warning' as const },
    paid:     { label: 'จ่ายแล้ว',          color: 'success' as const },
  }[periodStatus];

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

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WalletIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>ข้อมูลรายได้ (Incentive)</Typography>
            <Typography variant="body2" color="text.secondary">คำนวณรายได้รอบวันที่ 25 ของทุกเดือน</Typography>
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

      {/* Pay period + status */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
        <Typography variant="body2" color="text.secondary">รอบ: {periodLabel}</Typography>
        <Chip label={statusChip.label} color={statusChip.color} size="small" sx={{ fontWeight: 700 }} />
        {income.paid && income.paidDate && (
          <Typography variant="caption" color="text.secondary">จ่ายวันที่ {income.paidDate}</Typography>
        )}
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'ฐานเงินเดือน',  value: income.base,                                       color: '#7c3aed', sub: income.employeeType === 'daily' ? `${income.workDays} วัน × ฿${income.dailyRate}` : 'รายเดือน' },
          { label: 'ค่าคอมมิชชัน', value: income.salesComm + income.teacherComm,             color: '#0284c7', sub: 'ขาย + สอน' },
          { label: 'โบนัสขยัน',     value: income.diligence,                                  color: '#d97706', sub: income.diligence > 0 ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์' },
          { label: 'โบนัสแคมเปญ',   value: campaignBonusTotal,                                color: '#059669', sub: `${activeCampaigns.length} แคมเปญ` },
        ].map(({ label, value, color, sub }) => (
          <Grid item xs={6} sm={3} key={label}>
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
            label={income.employeeType === 'monthly' ? 'เงินเดือน (รายเดือน)' : `ค่าจ้างรายวัน × ${income.workDays} วัน`}
            sub={income.employeeType === 'daily' ? `฿${income.dailyRate?.toLocaleString()}/วัน` : undefined}
            amount={income.base} color="#7c3aed"
          />
          <Divider />

          {/* Commission */}
          <Box sx={{ py: 1.75, px: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <SalesIcon sx={{ fontSize: 20, color: '#0284c7' }} />
              <Typography variant="body1" fontWeight={600}>ค่าคอมมิชชัน</Typography>
              <Typography variant="body1" fontWeight={700} color="#0284c7" sx={{ ml: 'auto' }}>
                {income.salesComm + income.teacherComm > 0 ? `+฿${(income.salesComm + income.teacherComm).toLocaleString()}` : '—'}
              </Typography>
            </Box>
            {income.salesComm > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4.5, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  พนักงานขาย ({income.salesCommCount} รายการ × {income.salesCommRate})
                </Typography>
                <Typography variant="caption" fontWeight={700}>฿{income.salesComm.toLocaleString()}</Typography>
              </Box>
            )}
            {income.teacherComm > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 4.5 }}>
                <Typography variant="caption" color="text.secondary">
                  ครูสอน ({income.teacherCommCount} session × {income.teacherCommRate})
                </Typography>
                <Typography variant="caption" fontWeight={700}>฿{income.teacherComm.toLocaleString()}</Typography>
              </Box>
            )}
            {income.salesComm === 0 && income.teacherComm === 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ pl: 4.5 }}>ยังไม่มีรายการ</Typography>
            )}
          </Box>
          <Divider />

          {/* Diligence bonus */}
          <IncomeRow
            icon={<DiligenceIcon sx={{ fontSize: 20 }} />}
            label="โบนัสขยัน"
            sub={income.diligenceReason}
            amount={income.diligence} color="#d97706"
          />
          <Divider />

          {/* Campaign bonus */}
          <Box sx={{ py: 1.75, px: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: activeCampaigns.length > 0 ? 1 : 0 }}>
              <TrophyIcon sx={{ fontSize: 20, color: '#059669' }} />
              <Typography variant="body1" fontWeight={600}>โบนัสแคมเปญ</Typography>
              <Typography variant="body1" fontWeight={700} color="#059669" sx={{ ml: 'auto' }}>
                {campaignBonusTotal > 0 ? `+฿${campaignBonusTotal.toLocaleString()}` : '—'}
              </Typography>
            </Box>
            {activeCampaigns.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ pl: 4.5 }}>ไม่มีแคมเปญในเดือนนี้</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 4.5 }}>
                {activeCampaigns.map(c => {
                  const progress  = MOCK_CAMPAIGN_PROGRESS[c.id] ?? 0;
                  const achieved  = progress >= c.targetValue;
                  const pct       = Math.min((progress / c.targetValue) * 100, 100);
                  const cfg       = CAMPAIGN_TYPE_CONFIG[c.type];
                  const bonusDisp = c.bonusType === 'fixed' ? `฿${c.bonusAmount.toLocaleString()}` : `${c.bonusAmount}% ของยอด`;
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
                          {progress.toLocaleString()} / {c.targetValue.toLocaleString()} {cfg.unit}
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
