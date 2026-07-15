export type UserRole = string;

export type FeatureKey =
  | 'dashboard'
  | 'crm_users'
  | 'consumer_users'
  | 'courses'
  | 'my_schedule'
  | 'incentives'
  | 'attendance'
  | 'leave_requests'
  | 'leave_approval'
  | 'expense_advance'
  | 'payout'
  | 'bookings'
  | 'settings'
  | 'permissions'
  | 'profile'
  | 'pos_dashboard'
  | 'skills_library'
  | 'packages'
  | 'campaign_bonus'
  | 'services'
  | 'products'
  | 'stock'
  | 'news_feed'
  | 'stamp_images';

export type RolePermissionConfig = Record<UserRole, Record<FeatureKey, boolean>>;

const STORAGE_KEY = 'crm-role-permissions-v1';
const ROLE_LABELS_STORAGE_KEY = 'crm-role-labels-v1';

const defaultPermissionTemplate: Record<FeatureKey, boolean> = {
  dashboard: true,
  crm_users: false,
  consumer_users: false,
  courses: false,
  my_schedule: false,
  incentives: false,
  attendance: false,
  leave_requests: false,
  leave_approval: false,
  expense_advance: false,
  payout: false,
  bookings: false,
  settings: false,
  permissions: false,
  profile: true,
  pos_dashboard: false,
  skills_library: false,
  packages: false,
  campaign_bonus: false,
  services: false,
  products: false,
  stock: false,
  news_feed: false,
  stamp_images: false,
};

const defaultPermissions: RolePermissionConfig = {
  super_admin: {
    dashboard: true,
    crm_users: true,
    consumer_users: true,
    courses: true,
    my_schedule: true,
    incentives: true,
    attendance: true,
    leave_requests: true,
    leave_approval: true,
    expense_advance: true,
    payout: true,
    bookings: true,
    settings: true,
    permissions: true,
    profile: true,
    pos_dashboard: true,
    skills_library: true,
    packages: true,
    campaign_bonus: true,
    services: true,
    products: true,
    stock: true,
    news_feed: true,
    stamp_images: true,
  },
  operator: {
    dashboard: true,
    crm_users: false,
    consumer_users: false,
    courses: true,
    my_schedule: false,
    incentives: false,
    attendance: true,
    leave_requests: true,
    leave_approval: true,
    expense_advance: true,
    payout: false,
    bookings: true,
    settings: true,
    permissions: false,
    profile: true,
    pos_dashboard: true,
    skills_library: false,
    packages: false,
    campaign_bonus: true,
    services: true,
    products: true,
    stock: true,
    news_feed: true,
    stamp_images: false,
  },
  play_facilitator: {
    dashboard: true,
    crm_users: false,
    consumer_users: false,
    courses: false,
    my_schedule: true,
    incentives: true,
    attendance: true,
    leave_requests: true,
    leave_approval: false,
    expense_advance: true,
    payout: false,
    bookings: true,
    settings: false,
    permissions: false,
    profile: true,
    pos_dashboard: false,
    skills_library: false,
    packages: false,
    campaign_bonus: false,
    services: false,
    products: false,
    stock: false,
    news_feed: false,
    stamp_images: false,
  },
};

const defaultRoleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  operator: 'Operator',
  play_facilitator: 'Play Facilitator',
};

export const permissionFeatureLabels: Record<FeatureKey, string> = {
  dashboard: 'แดชบอร์ด',
  crm_users: 'จัดการผู้ใช้ CRM',
  consumer_users: 'จัดการผู้ใช้งาน',
  courses: 'จัดการข้อมูลคลาส',
  my_schedule: 'ตารางสอนของฉัน',
  incentives: 'ข้อมูลรายได้ (Incentive)',
  attendance: 'บันทึกวันทำงาน / OT',
  leave_requests: 'ระบบลางาน',
  leave_approval: 'อนุมัติวันลา / OT (Manager)',
  expense_advance: 'เบิกเงินสำรองจ่าย',
  payout: 'ระบบ Payout',
  bookings: 'รายการจองคลาสเรียน',
  settings: 'ตั้งค่าระบบ',
  permissions: 'จัดการสิทธิ์ (Role Permissions)',
  profile: 'โปรไฟล์ของฉัน',
  pos_dashboard: 'POS Dashboard',
  skills_library: 'จัดการ Skills & ตัวชี้วัด',
  packages: 'จัดการแพ็คเกจ',
  campaign_bonus: 'จัดการโบนัสแคมเปญ',
  services: 'จัดการบริการ',
  products: 'จัดการรายการสินค้า',
  stock: 'จัดการสต๊อก',
  news_feed: 'จัดการฟีดข่าวสาร/สื่อความรู้',
  stamp_images: 'จัดการรูปแสตมป์',
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const getDefaultPermissions = (): RolePermissionConfig =>
  clone(defaultPermissions);

export const getDefaultRoleLabels = (): Record<string, string> =>
  clone(defaultRoleLabels);

export const normalizeRoleKey = (rawRole: string): string =>
  rawRole
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const formatRoleLabel = (role: string): string =>
  role
    .split('_')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');

const getEmptyPermissionSet = (): Record<FeatureKey, boolean> =>
  clone(defaultPermissionTemplate);

export const getRolePermissionsConfig = (): RolePermissionConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultPermissions();
    const parsed = JSON.parse(raw) as Record<string, Partial<Record<FeatureKey, boolean>>>;
    const merged: RolePermissionConfig = getDefaultPermissions();

    Object.entries(parsed || {}).forEach(([role, permissions]) => {
      const roleKey = normalizeRoleKey(role);
      if (!roleKey) return;
      const base = defaultPermissions[roleKey] || getEmptyPermissionSet();
      merged[roleKey] = {
        ...base,
        ...(permissions || {}),
      };
    });

    return merged;
  } catch {
    return getDefaultPermissions();
  }
};

export const saveRolePermissionsConfig = (config: RolePermissionConfig) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const getRoleLabels = (): Record<string, string> => {
  const merged = getDefaultRoleLabels();
  const config = getRolePermissionsConfig();

  try {
    const raw = localStorage.getItem(ROLE_LABELS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      Object.entries(parsed || {}).forEach(([role, label]) => {
        const roleKey = normalizeRoleKey(role);
        if (!roleKey) return;
        merged[roleKey] = String(label || '').trim() || formatRoleLabel(roleKey);
      });
    }
  } catch {
    // Ignore malformed label storage and use defaults.
  }

  Object.keys(config).forEach((role) => {
    if (!merged[role]) {
      merged[role] = formatRoleLabel(role);
    }
  });

  return merged;
};

export const saveRoleLabels = (labels: Record<string, string>) => {
  localStorage.setItem(ROLE_LABELS_STORAGE_KEY, JSON.stringify(labels));
};

export const getRoleKeys = (
  config: RolePermissionConfig = getRolePermissionsConfig(),
  labels: Record<string, string> = getRoleLabels(),
): string[] => {
  const allKeys = new Set<string>([...Object.keys(config), ...Object.keys(labels)]);
  const pinnedOrder = ['super_admin', 'operator', 'play_facilitator'];

  const pinned = pinnedOrder.filter((key) => allKeys.has(key));
  const rest = Array.from(allKeys)
    .filter((key) => !pinnedOrder.includes(key))
    .sort((a, b) => a.localeCompare(b));

  return [...pinned, ...rest];
};

export const getRoleDisplayLabel = (
  role: string,
  labels: Record<string, string> = getRoleLabels(),
): string => {
  return labels[role] || formatRoleLabel(role);
};

export const addRoleToConfig = (
  config: RolePermissionConfig,
  role: string,
): RolePermissionConfig => {
  if (config[role]) return config;
  return {
    ...config,
    [role]: getEmptyPermissionSet(),
  };
};

export const canAccessFeature = (role: UserRole, feature: FeatureKey): boolean => {
  const config = getRolePermissionsConfig();
  return Boolean(config[role]?.[feature]);
};
