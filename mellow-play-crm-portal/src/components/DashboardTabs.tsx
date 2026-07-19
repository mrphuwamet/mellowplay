import React from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { canAccessFeature, FeatureKey } from '../utils/rolePermissions';

const TABS: { label: string; path: string; feature: FeatureKey }[] = [
  { label: 'ภาพรวม', path: '/crm/dashboard/overview', feature: 'dashboard' },
  { label: 'ยอดขายและรายได้', path: '/crm/dashboard/sales', feature: 'dashboard_sales' },
  { label: 'สปอนเซอร์', path: '/crm/dashboard/sponsorship', feature: 'dashboard_sponsorship' },
];

const DashboardTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const userJson = localStorage.getItem('crm_user');
  const role = userJson ? JSON.parse(userJson).role : '';

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.path === location.pathname));

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
      <Tabs
        value={activeIndex}
        onChange={(_, i) => {
          const target = TABS[i];
          if (canAccessFeature(role, target.feature)) navigate(target.path);
        }}
        variant="scrollable"
        scrollButtons="auto"
      >
        {TABS.map((t) => {
          const allowed = canAccessFeature(role, t.feature);
          // MUI's Tabs clones each direct child and injects Tab-only props
          // (indicator, textColor, etc.) — wrapping a disabled Tab in a
          // Tooltip+span breaks that cloning and spams DOM prop warnings, so
          // the "locked" look is done with a lock icon + muted opacity + a
          // native `title` attribute instead of an actual Tooltip.
          return (
            <Tab
              key={t.path}
              label={t.label}
              icon={!allowed ? <LockIcon sx={{ fontSize: 15 }} /> : undefined}
              iconPosition="end"
              title={!allowed ? 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้' : undefined}
              sx={{
                fontWeight: 700,
                textTransform: 'none',
                minHeight: 48,
                opacity: allowed ? 1 : 0.5,
                cursor: allowed ? 'pointer' : 'not-allowed',
              }}
            />
          );
        })}
      </Tabs>
    </Box>
  );
};

export default DashboardTabs;
