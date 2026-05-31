import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  TextField,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  RestartAlt as ResetIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import {
  addRoleToConfig,
  FeatureKey,
  getDefaultPermissions,
  getDefaultRoleLabels,
  getRoleDisplayLabel,
  getRoleKeys,
  getRoleLabels,
  getRolePermissionsConfig,
  normalizeRoleKey,
  permissionFeatureLabels,
  RolePermissionConfig,
  saveRoleLabels,
  saveRolePermissionsConfig,
  UserRole,
} from '../utils/rolePermissions';

interface Props {
  currentUserRole: UserRole;
}

const featureKeys: FeatureKey[] = [
  'dashboard',
  'crm_users',
  'consumer_users',
  'courses',
  'my_schedule',
  'incentives',
  'bookings',
  'settings',
  'permissions',
  'profile',
  'pos_dashboard',
];

const RolePermissionManagement = ({ currentUserRole }: Props) => {
  const [config, setConfig] = useState<RolePermissionConfig>(getRolePermissionsConfig());
  const [labels, setLabels] = useState<Record<string, string>>(getRoleLabels());
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);

  const isSuperAdmin = currentUserRole === 'super_admin';
  const roleKeys = useMemo(() => getRoleKeys(config, labels), [config, labels]);

  const getRoleColor = (role: string) => {
    if (role === 'super_admin') return 'error' as const;
    if (role === 'operator') return 'info' as const;
    if (role === 'play_facilitator') return 'success' as const;
    return 'default' as const;
  };

  const togglePermission = (role: string, feature: FeatureKey) => {
    if (!isSuperAdmin) return;
    if (role === 'super_admin') return; // Super Admin always has full access
    setConfig((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [feature]: !prev[role][feature],
      },
    }));
  };

  const handleAddRole = () => {
    if (!isSuperAdmin) return;
    setFormError(null);
    setFormInfo(null);

    const normalizedRole = normalizeRoleKey(newRoleKey);
    if (!normalizedRole) {
      setFormError('กรุณากรอก Role Key (อังกฤษ/ตัวเลข/underscore)');
      return;
    }

    if (config[normalizedRole]) {
      setFormError(`Role "${normalizedRole}" มีอยู่แล้ว`);
      return;
    }

    const displayLabel = newRoleLabel.trim() || normalizedRole.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    setConfig((prev) => addRoleToConfig(prev, normalizedRole));
    setLabels((prev) => ({ ...prev, [normalizedRole]: displayLabel }));
    setNewRoleKey('');
    setNewRoleLabel('');
    setFormInfo(`เพิ่ม Role "${displayLabel}" แล้ว กรุณากดบันทึกสิทธิ์`);
  };

  const handleSave = () => {
    saveRolePermissionsConfig(config);
    saveRoleLabels(labels);
    setSaved(true);
    window.dispatchEvent(new Event('permissions-updated'));
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    const defaults = getDefaultPermissions();
    const defaultLabels = getDefaultRoleLabels();
    setConfig(defaults);
    setLabels(defaultLabels);
    saveRolePermissionsConfig(defaults);
    saveRoleLabels(defaultLabels);
    window.dispatchEvent(new Event('permissions-updated'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon color="primary" /> จัดการสิทธิ์ตาม Role
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            ปรับสิทธิ์การเข้าถึงฟีเจอร์ต่างๆ ของแต่ละ Role ได้จากหน้านี้
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.2 }}>
          <Button variant="outlined" startIcon={<ResetIcon />} onClick={handleReset} disabled={!isSuperAdmin}>
            รีเซ็ตค่าเริ่มต้น
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={!isSuperAdmin}>
            บันทึกสิทธิ์
          </Button>
        </Box>
      </Box>

      {saved && <Alert severity="success" sx={{ mb: 2.5 }}>บันทึกสิทธิ์เรียบร้อยแล้ว</Alert>}
      {formInfo && <Alert severity="info" sx={{ mb: 2.5 }}>{formInfo}</Alert>}
      {formError && <Alert severity="error" sx={{ mb: 2.5 }}>{formError}</Alert>}

      {!isSuperAdmin && (
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          เฉพาะ Super Admin เท่านั้นที่สามารถแก้ไขสิทธิ์ได้ ขณะนี้แสดงผลแบบ Read Only
        </Alert>
      )}

      <Paper sx={{ p: 2.5, borderRadius: 4, mb: 2.5, boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>เพิ่ม Role ใหม่</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Role Key (เช่น branch_manager)"
            value={newRoleKey}
            onChange={(e) => setNewRoleKey(e.target.value)}
            disabled={!isSuperAdmin}
            sx={{ minWidth: 280 }}
          />
          <TextField
            size="small"
            label="ชื่อที่แสดงผล"
            value={newRoleLabel}
            onChange={(e) => setNewRoleLabel(e.target.value)}
            disabled={!isSuperAdmin}
            sx={{ minWidth: 260 }}
          />
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddRole}
            disabled={!isSuperAdmin}
          >
            เพิ่ม Role
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 4, boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell sx={{ fontWeight: 800, minWidth: 280 }}>ฟีเจอร์</TableCell>
              {roleKeys.map((role) => (
                <TableCell key={role} align="center" sx={{ fontWeight: 800 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                    <Chip label={getRoleDisplayLabel(role, labels)} size="small" color={getRoleColor(role)} sx={{ fontWeight: 700 }} />
                    {role === 'super_admin' && (
                      <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700, fontSize: '9px' }}>เข้าถึงได้ทั้งหมด</Typography>
                    )}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {featureKeys.map((feature) => (
              <TableRow key={feature} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {permissionFeatureLabels[feature]}
                  </Typography>
                </TableCell>
                {roleKeys.map((role) => (
                  <TableCell key={`${feature}-${role}`} align="center">
                    {role === 'super_admin' ? (
                      <Tooltip title="Super Admin เข้าถึงได้ทุกฟีเจอร์เสมอ">
                        <span>
                          <Switch checked disabled sx={{ '& .MuiSwitch-switchBase.Mui-checked.Mui-disabled': { color: 'success.main' }, '& .MuiSwitch-switchBase.Mui-checked.Mui-disabled + .MuiSwitch-track': { bgcolor: 'success.light', opacity: 0.5 } }} />
                        </span>
                      </Tooltip>
                    ) : (
                      <Switch
                        checked={Boolean(config[role]?.[feature])}
                        onChange={() => togglePermission(role, feature)}
                        disabled={!isSuperAdmin}
                      />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default RolePermissionManagement;
