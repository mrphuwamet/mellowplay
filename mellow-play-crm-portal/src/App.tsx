import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  Container,
  Dialog,
  DialogTitle,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  CircularProgress
} from '@mui/material';
import {
  AccessTime as OTIcon,
  AccountBalanceWallet as ExpenseIcon,
  EventAvailable as LeaveIcon,
  AutoStories as SkillsLibIcon,
  Badge as BadgeIcon,
  CalendarMonth as ScheduleIcon,
  Dashboard as DashboardIcon,
  EventNote as BookingIcon,
  ExpandLess,
  ExpandMore,
  HistoryEdu as ReportIcon,
  Logout as LogoutIcon,
  MonetizationOn as IncentiveIcon,
  Payments as PayoutIcon,
  People as PeopleIcon,
  PointOfSale as PosIcon,
  Security as SecurityIcon,
  Settings as SettingsIcon,
  Store as StoreIcon,
  SwapHoriz as SwitchIcon,
  AccountBalance as FinanceIcon,
  Inventory2 as PackageIcon,
  Campaign as CampaignMenuIcon,
  Storefront as ShopIcon,
  QueuePlayNext as QueueMenuIcon,
  MiscellaneousServices as ServiceMenuIcon,
  Inventory as ProductMenuIcon,
  Warehouse as StockMenuIcon,
  CardGiftcard as GiftMenuIcon,
  LocalActivity as TicketIcon,
  LocalOffer as PromoIcon,
  Feed as NewsFeedMenuIcon,
  Grade as StampImageMenuIcon,
} from '@mui/icons-material';
import logo from './assets/logo.svg';

import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import BookingManagement from './pages/BookingManagement';
import CrmUserManagement from './pages/CrmUserManagement';
import CourseManagement from './pages/CourseManagement';
import IncentiveTracking from './pages/IncentiveTracking';
import MySchedule from './pages/MySchedule';
import AttendanceManagement from './pages/AttendanceManagement';
import LeaveManagement from './pages/LeaveManagement';
import ExpenseAdvance from './pages/ExpenseAdvance';
import Payout from './pages/Payout';
import SystemSettings from './pages/SystemSettings';
import MyProfile from './pages/MyProfile';
import RolePermissionManagement from './pages/RolePermissionManagement';
import SkillsLibraryManagement from './pages/SkillsLibraryManagement';
import PackageManagement from './pages/PackageManagement';
import CampaignManagement from './pages/CampaignManagement';
import ServiceManagement from './pages/ServiceManagement';
import ProductManagement from './pages/ProductManagement';
import StockManagement from './pages/StockManagement';
import CalendarManagement from './pages/CalendarManagement';
import CouponManagement from './pages/CouponManagement';
import PromotionManagement from './pages/PromotionManagement';
import SaleCampaignManagement from './pages/SaleCampaignManagement';
import Reports from './pages/Reports';
import ClassBooking from './pages/ClassBooking';
import ServiceQueueBoard from './pages/ServiceQueueBoard';
import POSNew from './pages/POSNew';
import POSBookingView from './pages/POSBookingView';
import POSSalesHistory from './pages/POSSalesHistory';
import RedemptionManagement from './pages/RedemptionManagement';
import RewardsManagement from './pages/RewardsManagement';
import NewsFeedManagement from './pages/NewsFeedManagement';
import StampImageManagement from './pages/StampImageManagement';
import { SystemLogs } from './pages/SystemLogs';
import {
  canAccessFeature,
  FeatureKey,
  getRoleDisplayLabel,
  getRoleLabels,
  UserRole,
} from './utils/rolePermissions';

const drawerWidth = 280;

interface MenuItemConfig {
  text: string;
  path: string;
  icon: React.ReactNode;
  feature: FeatureKey;
}

interface MenuGroupConfig {
  type: 'group';
  label: string;
  icon: React.ReactNode;
  groupKey: string;
  children: MenuItemConfig[];
}

type MenuEntry = MenuItemConfig | MenuGroupConfig;

const AccessDenied = () => (
  <Alert severity="warning" sx={{ mt: 2 }}>
    คุณไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อ Super Admin
  </Alert>
);

const PinDialog = ({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => void;
}) => {
  const [digits, setDigits] = useState('');
  const [shake, setShake] = useState(false);

  const handleDigit = (d: string) => {
    if (digits.length < 5) setDigits((p) => p + d);
  };
  const handleBack = () => setDigits((p) => p.slice(0, -1));

  const handleConfirm = () => {
    if (digits.length !== 5) return;
    onConfirm(digits);
  };

  React.useEffect(() => {
    if (!open) setDigits('');
  }, [open]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  React.useEffect(() => {
    // expose shake trigger to parent via custom event
    const handler = () => { setDigits(''); triggerShake(); };
    window.addEventListener('pin-wrong', handler);
    return () => window.removeEventListener('pin-wrong', handler);
  }, []);

  const numPad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" PaperProps={{ sx: { borderRadius: 4, p: 1 } }}>
      <DialogTitle sx={{ textAlign: 'center', fontWeight: 800, pb: 0 }}>
        ยืนยันตัวตนเพื่อเข้าโหมด CRM
      </DialogTitle>
      <Box sx={{ px: 4, pt: 1, pb: 0, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">กรอก PIN 5 หลัก</Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 1.5,
          pt: 3,
          pb: 2,
          animation: shake ? 'pinShake 0.4s ease' : 'none',
          '@keyframes pinShake': {
            '0%,100%': { transform: 'translateX(0)' },
            '20%,60%': { transform: 'translateX(-8px)' },
            '40%,80%': { transform: 'translateX(8px)' },
          },
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid',
              borderColor: i < digits.length ? 'primary.main' : 'grey.400',
              bgcolor: i < digits.length ? 'primary.main' : 'transparent',
              transition: 'all 0.15s',
            }}
          />
        ))}
      </Box>
      <Box sx={{ px: 4, pb: 3 }}>
        {numPad.map((row, ri) => (
          <Box key={ri} sx={{ display: 'flex', gap: 1.5, mb: 1.5, justifyContent: 'center' }}>
            {row.map((key, ki) => (
              <Button
                key={ki}
                variant={key === '' ? 'text' : 'outlined'}
                disabled={key === ''}
                onClick={() => {
                  if (key === '⌫') handleBack();
                  else handleDigit(key);
                }}
                sx={{
                  width: 64,
                  height: 64,
                  fontSize: key === '⌫' ? '1.3rem' : '1.4rem',
                  fontWeight: 700,
                  borderRadius: 3,
                  minWidth: 0,
                  visibility: key === '' ? 'hidden' : 'visible',
                }}
              >
                {key}
              </Button>
            ))}
          </Box>
        ))}
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={digits.length !== 5}
          onClick={handleConfirm}
          sx={{ mt: 1, borderRadius: 3, fontWeight: 800, py: 1.5 }}
        >
          ยืนยัน
        </Button>
        <Button fullWidth onClick={onClose} sx={{ mt: 1, borderRadius: 3, fontWeight: 700 }}>
          ยกเลิก
        </Button>
      </Box>
    </Dialog>
  );
};

const AppContent = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPosMode, setIsPosMode] = useState(false);
  const [permissionTick, setPermissionTick] = useState(0);
  const [roleLabelsMap, setRoleLabelsMap] = useState<Record<string, string>>(getRoleLabels());
  const [crmUnlocked, setCrmUnlocked] = useState(false);
  const financePaths = ['/crm/incentives', '/crm/attendance', '/crm/leave', '/crm/expense-advance', '/crm/payout', '/crm/campaign-bonus'];
  const shopPaths   = ['/crm/services', '/crm/products', '/crm/stock'];
  const [financeGroupOpen, setFinanceGroupOpen] = useState(() =>
    financePaths.some((p) => window.location.pathname === p)
  );
  const [shopGroupOpen, setShopGroupOpen] = useState(() =>
    shopPaths.some((p) => window.location.pathname === p)
  );
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (financePaths.some((p) => location.pathname === p)) setFinanceGroupOpen(true);
    if (shopPaths.some((p) => location.pathname === p)) setShopGroupOpen(true);
  }, [location.pathname]);

  useEffect(() => {
    const userJson = localStorage.getItem('crm_user');
    const token = localStorage.getItem('crm_token');
    
    if (userJson && token) {
      setCurrentUser(JSON.parse(userJson));
      // Detect mode from URL if possible
      if (location.pathname.startsWith('/pos')) setIsPosMode(true);
      else if (location.pathname.startsWith('/crm')) setIsPosMode(false);
    } else if (location.pathname !== '/login') {
      navigate('/login');
    }
    setLoading(false);
  }, [location.pathname, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setCurrentUser(null);
    navigate('/login');
  };

  const isDarkMode = !isPosMode;

  useEffect(() => {
    const handlePermissionUpdated = () => {
      setPermissionTick((prev) => prev + 1);
      setRoleLabelsMap(getRoleLabels());
    };
    window.addEventListener('permissions-updated', handlePermissionUpdated);
    return () => window.removeEventListener('permissions-updated', handlePermissionUpdated);
  }, []);

  const hasPermission = (feature: FeatureKey) => {
    void permissionTick;
    if (!currentUser) return false;
    return canAccessFeature(currentUser.role, feature);
  };

  const financeChildren: MenuItemConfig[] = useMemo(() => {
    const all: MenuItemConfig[] = [
      { text: 'ตารางงานของฉัน', icon: <ScheduleIcon />, path: '/crm/my-schedule', feature: 'my_schedule' },
      { text: 'ข้อมูลรายได้ (Incentive)', icon: <IncentiveIcon />, path: '/crm/incentives', feature: 'incentives' },
      { text: 'บันทึกวันทำงาน / OT', icon: <OTIcon />, path: '/crm/attendance', feature: 'attendance' },
      { text: 'ระบบลางาน', icon: <LeaveIcon />, path: '/crm/leave', feature: 'leave_requests' },
      { text: 'เบิกเงินสำรองจ่าย', icon: <ExpenseIcon />, path: '/crm/expense-advance', feature: 'expense_advance' },
      { text: 'ระบบ Payout', icon: <PayoutIcon />, path: '/crm/payout', feature: 'payout' },
      { text: 'โบนัสแคมเปญ', icon: <CampaignMenuIcon />, path: '/crm/campaign-bonus', feature: 'campaign_bonus' },
    ];
    return all.filter((item) => hasPermission(item.feature));
  }, [permissionTick, currentUser]);

  const menuEntries = useMemo((): MenuEntry[] => {
    if (!currentUser) return [];
    if (isPosMode) {
      const posItems: MenuItemConfig[] = [
        { text: 'ระบบขาย (POS)',     icon: <PosIcon />,       path: '/pos',               feature: 'pos_dashboard' },
        { text: 'จองคลาสเรียน',      icon: <BookingIcon />,   path: '/pos/class-booking', feature: 'pos_dashboard' },
        { text: 'จองคิวบริการ',       icon: <QueueMenuIcon />, path: '/pos/service-queue', feature: 'pos_dashboard' },
        { text: 'ดูรายการจอง',        icon: <ScheduleIcon />,  path: '/pos/bookings',      feature: 'pos_dashboard' },
        { text: 'ประวัติการขาย',      icon: <StoreIcon />,     path: '/pos/sales-history', feature: 'pos_dashboard' },
      ];
      return posItems.filter((item) => hasPermission(item.feature));
    }

    const flatItems: MenuEntry[] = [
      { text: 'แดชบอร์ด', icon: <DashboardIcon />, path: '/crm', feature: 'dashboard' },
      { text: 'จัดการพนักงาน', icon: <BadgeIcon />, path: '/crm/staff', feature: 'crm_users' },
      { text: 'จัดการผู้ใช้งาน', icon: <PeopleIcon />, path: '/crm/parents', feature: 'consumer_users' },
      { text: 'จัดการข้อมูลคลาส', icon: <ReportIcon />, path: '/crm/courses', feature: 'courses' },
      { text: 'จัดการแพ็คเกจ', icon: <PackageIcon />, path: '/crm/packages', feature: 'packages' },
      { text: 'จัดการคูปอง', icon: <TicketIcon />, path: '/crm/coupons', feature: 'packages' },
      { text: 'จัดการโปรโมชัน', icon: <PromoIcon />, path: '/crm/promotions', feature: 'packages' },
      { text: 'จัดการแคมเปญลดราคา', icon: <CampaignMenuIcon />, path: '/crm/sale-campaigns', feature: 'packages' },
      { text: 'รายการจองคลาสเรียน', icon: <BookingIcon />, path: '/crm/bookings', feature: 'bookings' },
      { text: 'รายการแลกของรางวัล', icon: <GiftMenuIcon />, path: '/crm/redemptions', feature: 'bookings' },
      { text: 'จัดการของรางวัล', icon: <GiftMenuIcon />, path: '/crm/rewards', feature: 'bookings' },
      { text: 'จัดการปฏิทิน',        icon: <ScheduleIcon />, path: '/crm/calendars', feature: 'settings' },
      { text: 'จัดการฟีดข่าวสาร', icon: <NewsFeedMenuIcon />, path: '/crm/news-feed', feature: 'news_feed' },
      { text: 'จัดการรูปแสตมป์', icon: <StampImageMenuIcon />, path: '/crm/stamp-images', feature: 'stamp_images' },
    ];

    const filtered = flatItems.filter((e) => {
      const item = e as MenuItemConfig;
      return hasPermission(item.feature);
    });

    // Shop group
    const shopChildrenAll: MenuItemConfig[] = [
      { text: 'จัดการบริการ',        icon: <ServiceMenuIcon />, path: '/crm/services', feature: 'services' },
      { text: 'จัดการรายการสินค้า',  icon: <ProductMenuIcon />, path: '/crm/products', feature: 'products' },
      { text: 'จัดการสต๊อก',         icon: <StockMenuIcon />,   path: '/crm/stock',    feature: 'stock'    },
    ];
    const shopChildren = shopChildrenAll.filter(item => hasPermission(item.feature));
    if (shopChildren.length > 0) {
      filtered.push({
        type: 'group',
        label: 'สินค้าและบริการ',
        icon: <ShopIcon />,
        groupKey: 'shop',
        children: shopChildren,
      } as MenuGroupConfig);
    }

    if (financeChildren.length > 0) {
      filtered.push({
        type: 'group',
        label: 'การเงิน',
        icon: <FinanceIcon />,
        groupKey: 'finance',
        children: financeChildren,
      } as MenuGroupConfig);
    }

    const bottomItems: MenuItemConfig[] = [
      { text: 'รายงาน', icon: <ReportIcon />, path: '/crm/reports', feature: 'dashboard' },
      { text: 'ตั้งค่าระบบและสาขา', icon: <SettingsIcon />, path: '/crm/settings', feature: 'settings' },
      { text: 'จัดการสิทธิ์เข้าถึง', icon: <SecurityIcon />, path: '/crm/permissions', feature: 'permissions' },
      { text: 'System Logs', icon: <SecurityIcon />, path: '/crm/system-logs', feature: 'settings' },
    ];
    bottomItems.filter((item) => hasPermission(item.feature)).forEach((item) => filtered.push(item));

    return filtered;
  }, [isPosMode, permissionTick, currentUser, financeChildren]);

  const getRoleInfo = (role: string) => {
    switch (role) {
      case 'super_admin':
        return { label: getRoleDisplayLabel(role, roleLabelsMap), color: 'error' };
      case 'play_facilitator':
        return { label: getRoleDisplayLabel(role, roleLabelsMap), color: 'success' };
      case 'operator':
        return { label: getRoleDisplayLabel(role, roleLabelsMap), color: 'info' };
      default:
        return { label: getRoleDisplayLabel(role, roleLabelsMap), color: 'default' };
    }
  };

  const protect = (feature: FeatureKey, element: React.ReactNode) =>
    hasPermission(feature) ? element : <AccessDenied />;

  const roleInfo = getRoleInfo(currentUser?.role || '');

  const drawer = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isDarkMode ? '#1e293b' : 'white',
        color: isDarkMode ? 'white' : 'text.primary',
        transition: 'all 0.3s',
      }}
    >
      <Box sx={{ px: 3, py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <img src={logo} alt="Mellow Play" style={{ height: 48, filter: isDarkMode ? 'brightness(0) invert(1)' : 'none' }} />
        <Typography
          variant="h6"
          color={isDarkMode ? 'inherit' : 'primary'}
          sx={{ fontWeight: 500, fontSize: '1.15rem', letterSpacing: '-0.01em', textAlign: 'center' }}
        >
          {isPosMode ? 'Mellow Play POS' : 'Mellow Play CRM'}
        </Typography>
      </Box>

      <Box sx={{ px: 2, pb: 2 }}>
        <Box
          onClick={() => navigate('/profile')}
          sx={{
            px: 1.5,
            py: 1,
            bgcolor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(116, 82, 214, 0.04)',
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(116, 82, 214, 0.08)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 1.5,
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              bgcolor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(116, 82, 214, 0.08)',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(116, 82, 214, 0.2)',
            },
          }}
        >
          <Avatar
            sx={{ bgcolor: isDarkMode ? 'secondary.main' : 'primary.main', width: 34, height: 34, fontSize: '0.95rem', fontWeight: 500, flexShrink: 0 }}
          >
            {currentUser?.fullName?.[0] || currentUser?.name?.[0] || 'A'}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, lineHeight: 1.3, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {currentUser?.fullName || currentUser?.name || 'Admin'}
            </Typography>
            <Chip
              label={roleInfo.label}
              color={roleInfo.color as any}
              size="small"
              sx={{ fontWeight: 700, fontSize: '9px', height: 16, mt: 0.3, '& .MuiChip-label': { px: 0.75 } }}
            />
            {(currentUser?.role === 'super_admin' || currentUser?.selectedBranchName) && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 700, color: 'primary.main' }}>
                สาขา: {currentUser?.role === 'super_admin' ? 'ทุกสาขา' : currentUser?.selectedBranchName}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      <Divider sx={{ mx: 2, opacity: 0.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'divider' }} />

      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          mt: 2,
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: 4 },
          '&::-webkit-scrollbar-thumb:hover': { background: 'rgba(255,255,255,0.4)' },
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        }}
      >
        <List>
          {menuEntries.map((entry) => {
            if ((entry as MenuGroupConfig).type === 'group') {
              const group = entry as MenuGroupConfig;
              const isChildActive = group.children.some((c) => location.pathname === c.path);
              return (
                <React.Fragment key={group.groupKey}>
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={() => {
                        if (group.groupKey === 'finance') setFinanceGroupOpen((o) => !o);
                        else if (group.groupKey === 'shop') setShopGroupOpen((o) => !o);
                      }}
                      sx={{
                        ml: 0,
                        mr: 1.5,
                        mb: 0.5,
                        pl: 4,
                        borderRadius: '0 24px 24px 0',
                        color: isChildActive
                          ? (isDarkMode ? 'white' : 'primary.main')
                          : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'text.primary'),
                        bgcolor: isChildActive
                          ? (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(116,82,214,0.06)')
                          : 'transparent',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{group.icon}</ListItemIcon>
                      <ListItemText primary={group.label} primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }} />
                      {(group.groupKey === 'finance' ? financeGroupOpen : shopGroupOpen)
                        ? <ExpandLess sx={{ fontSize: 18 }} />
                        : <ExpandMore sx={{ fontSize: 18 }} />}
                    </ListItemButton>
                  </ListItem>
                  <Collapse in={group.groupKey === 'finance' ? financeGroupOpen : shopGroupOpen} timeout="auto" unmountOnExit>
                    <List disablePadding>
                      {group.children.map((child) => (
                        <ListItem key={child.text} disablePadding>
                          <ListItemButton
                            onClick={() => navigate(child.path)}
                            selected={location.pathname === child.path}
                            sx={{
                              ml: 0,
                              mr: 1.5,
                              mb: 0.5,
                              pl: 7,
                              borderRadius: '0 24px 24px 0',
                              color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'text.primary',
                              '&.Mui-selected': {
                                backgroundColor: isDarkMode ? 'secondary.main' : 'primary.light',
                                color: 'white',
                                '& .MuiListItemIcon-root': { color: 'white' },
                                '&:hover': { backgroundColor: isDarkMode ? 'secondary.dark' : 'primary.main' },
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 34, color: 'inherit', fontSize: '1rem' }}>{child.icon}</ListItemIcon>
                            <ListItemText primary={child.text} primaryTypographyProps={{ fontWeight: 500, fontSize: '0.8rem' }} />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </React.Fragment>
              );
            }

            const item = entry as MenuItemConfig;
            return (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  selected={location.pathname === item.path}
                  sx={{
                    ml: 0,
                    mr: 1.5,
                    mb: 0.5,
                    pl: 4,
                    borderRadius: '0 24px 24px 0',
                    color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'text.primary',
                    '&.Mui-selected': {
                      backgroundColor: isDarkMode ? 'secondary.main' : 'primary.light',
                      color: 'white',
                      '& .MuiListItemIcon-root': { color: 'white' },
                      '&:hover': { backgroundColor: isDarkMode ? 'secondary.dark' : 'primary.main' },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 500, fontSize: '0.875rem' }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          variant="contained"
          color={isDarkMode ? 'secondary' : 'primary'}
          startIcon={<SwitchIcon />}
          onClick={() => {
            if (isPosMode) {
              setIsPosMode(false);
              navigate('/crm');
            } else {
              setCrmUnlocked(false);
              setIsPosMode(true);
              navigate('/pos');
            }
          }}
          sx={{ borderRadius: 3, py: 1, fontWeight: 800, fontSize: '12px' }}
        >
          {isPosMode ? 'สลับไปโหมด CRM' : 'สลับไปโหมด POS'}
        </Button>
      </Box>

      <Divider sx={{ mx: 2, opacity: 0.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'divider' }} />

      <List sx={{ pb: 2 }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              ml: 0,
              mr: 1.5,
              pl: 4,
              borderRadius: '0 24px 24px 0',
              color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'text.primary',
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="ออกจากระบบ" primaryTypographyProps={{ fontWeight: 500, fontSize: '0.875rem' }} />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  const handlePinConfirm = (pin: string) => {
    const userId = currentUser?.id;
    const storedPin = localStorage.getItem(`crm_pin_${userId}`) || '00000';
    if (pin === storedPin) {
      setCrmUnlocked(true);
    } else {
      window.dispatchEvent(new Event('pin-wrong'));
    }
  };

  const handlePinCancel = () => {
    setIsPosMode(true);
    navigate('/pos');
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;
  if (!currentUser && location.pathname !== '/login') return null;

  if (location.pathname === '/login') {
    return <Routes><Route path="/login" element={<Login />} /></Routes>;
  }

  const needsPin = !isPosMode && !crmUnlocked;

  return (
    <>
      {/* ── Blurred layout — pointer-events disabled until PIN is confirmed ── */}
      <Box
        sx={{
          display: 'flex',
          bgcolor: isDarkMode ? '#f1f5f9' : '#f8fafc',
          minHeight: '100vh',
          transition: 'filter 0.3s, background-color 0.3s',
          filter: needsPin ? 'blur(8px)' : 'none',
          pointerEvents: needsPin ? 'none' : 'auto',
          userSelect: needsPin ? 'none' : 'auto',
        }}
      >
        <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
                borderRight: isDarkMode ? 'none' : '1px solid #f1f3f9',
                borderRadius: '0 24px 24px 0',
                boxShadow: isDarkMode ? '10px 0 30px rgba(0,0,0,0.1)' : '5px 0 20px rgba(0,0,0,0.02)',
              },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>

        <Box component="main" sx={{ flexGrow: 1, p: 4, width: { sm: `calc(100% - ${drawerWidth}px)` } }}>
          <Container maxWidth={isPosMode ? false : 'xl'}>
            {/* ── Routes only render after PIN unlock — prevents any API calls ── */}
            {!needsPin && (
          <Routes>
            {/* Root Redirect */}
            <Route path="/" element={<Navigate to={isPosMode ? "/pos" : "/crm"} replace />} />
            
            {/* POS Routes */}
            <Route path="/pos"                element={protect('pos_dashboard', <POSNew />)} />
            <Route path="/pos/class-booking"  element={protect('pos_dashboard', <ClassBooking />)} />
            <Route path="/pos/service-queue"  element={protect('pos_dashboard', <ServiceQueueBoard />)} />
            <Route path="/pos/bookings"        element={protect('pos_dashboard', <POSBookingView />)} />
            <Route path="/pos/sales-history"   element={protect('pos_dashboard', <POSSalesHistory />)} />
            
            {/* CRM Routes */}
            <Route path="/crm" element={protect('dashboard', <Dashboard />)} />
            <Route path="/crm/staff" element={protect('crm_users', <CrmUserManagement />)} />
            <Route path="/crm/parents" element={protect('consumer_users', <UserManagement currentUserRole={currentUser?.role} />)} />
            <Route path="/crm/courses" element={protect('courses', <CourseManagement />)} />
            <Route path="/crm/packages" element={protect('packages', <PackageManagement />)} />
            <Route path="/crm/users" element={protect('crm_users', <CrmUserManagement />)} />
            <Route path="/crm/redemptions" element={protect('bookings', <RedemptionManagement />)} />
            <Route path="/crm/rewards" element={protect('bookings', <RewardsManagement />)} />
            <Route path="/crm/bookings" element={protect('bookings', <BookingManagement />)} />
            <Route path="/crm/my-schedule" element={protect('my_schedule', <MySchedule />)} />
            <Route path="/crm/class-booking" element={<Navigate to="/pos/class-booking" replace />} />
            <Route path="/crm/service-queue" element={<Navigate to="/pos/service-queue" replace />} />
            <Route path="/crm/incentives" element={protect('incentives', <IncentiveTracking />)} />
            <Route path="/crm/attendance" element={protect('attendance', <AttendanceManagement canApprove={hasPermission('leave_approval')} />)} />
            <Route path="/crm/leave" element={protect('leave_requests', <LeaveManagement canApprove={hasPermission('leave_approval')} isAdmin={hasPermission('settings')} />)} />
            <Route path="/crm/expense-advance" element={protect('expense_advance', <ExpenseAdvance />)} />
            <Route path="/crm/payout" element={protect('payout', <Payout />)} />
            <Route path="/crm/campaign-bonus" element={protect('campaign_bonus', <CampaignManagement />)} />
            <Route path="/crm/services" element={protect('services', <ServiceManagement />)} />
            <Route path="/crm/products" element={protect('products', <ProductManagement />)} />
            <Route path="/crm/stock"    element={protect('stock',    <StockManagement />)} />
            <Route path="/crm/settings" element={protect('settings', <SystemSettings />)} />
            <Route path="/crm/permissions" element={protect('permissions', <RolePermissionManagement currentUserRole={currentUser?.role} />)} />
            <Route path="/crm/system-logs" element={protect('settings', <SystemLogs />)} />
            <Route path="/crm/skills-library"  element={protect('skills_library', <SkillsLibraryManagement currentUserRole={currentUser?.role} />)} />
            <Route path="/crm/reports"         element={protect('dashboard', <Reports />)} />
            <Route path="/crm/calendars"       element={protect('settings', <CalendarManagement />)} />
            <Route path="/crm/news-feed"       element={protect('news_feed', <NewsFeedManagement />)} />
            <Route path="/crm/stamp-images"    element={protect('stamp_images', <StampImageManagement />)} />
            <Route path="/crm/coupons"         element={protect('packages', <CouponManagement />)} />
            <Route path="/crm/promotions"      element={protect('packages', <PromotionManagement />)} />
            <Route path="/crm/sale-campaigns"  element={protect('packages', <SaleCampaignManagement />)} />
            <Route path="/crm/class-booking"   element={protect('bookings', <ClassBooking />)} />
            <Route path="/crm/service-queue"   element={protect('services', <ServiceQueueBoard />)} />
            
            {/* Shared Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={protect('profile', <MyProfile />)} />
          </Routes>
            )}
          </Container>
        </Box>
      </Box>

      {/* ── PIN dialog — renders via portal outside the blurred box ── */}
      <PinDialog
        open={needsPin}
        onClose={handlePinCancel}
        onConfirm={handlePinConfirm}
      />
    </>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
