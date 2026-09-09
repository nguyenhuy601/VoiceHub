/** UI role metadata — port từ figma AuthContext ROLE_META (client display only). */
import { hasBackendCapability } from './backendCapabilities';

export const ROLE_ORDER = ['guest', 'personal', 'member', 'manager', 'owner', 'admin'];

export const ROLE_META = {
  admin: {
    label: 'Quản trị viên hệ thống',
    labelEn: 'System Admin',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.12)',
    navSuites: ['communicate', 'collaborate', 'me'],
    canManageOrg: true,
    canManageMembers: true,
    canViewBilling: true,
    canViewAudit: true,
    canViewRBAC: true,
    canCreateWorkspace: true,
    isManagerOrAbove: true,
    showFullDashboard: true,
  },
  owner: {
    label: 'Chủ sở hữu tổ chức',
    labelEn: 'Organization Owner',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
    navSuites: ['communicate', 'collaborate', 'me'],
    canManageOrg: true,
    canManageMembers: true,
    canViewBilling: true,
    canViewAudit: true,
    canViewRBAC: true,
    canCreateWorkspace: true,
    isManagerOrAbove: true,
    showFullDashboard: true,
  },
  manager: {
    label: 'Quản lý phòng ban',
    labelEn: 'Department Manager',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.12)',
    navSuites: ['communicate', 'collaborate', 'me'],
    canManageOrg: false,
    canManageMembers: true,
    canViewBilling: false,
    canViewAudit: false,
    canViewRBAC: false,
    canCreateWorkspace: true,
    isManagerOrAbove: true,
    showFullDashboard: true,
  },
  member: {
    label: 'Thành viên tổ chức',
    labelEn: 'Organization Member',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.12)',
    navSuites: ['communicate', 'collaborate', 'me'],
    canManageOrg: false,
    canManageMembers: false,
    canViewBilling: false,
    canViewAudit: false,
    canViewRBAC: false,
    canCreateWorkspace: false,
    isManagerOrAbove: false,
    showFullDashboard: true,
  },
  personal: {
    label: 'Người dùng cá nhân',
    labelEn: 'Personal User',
    color: '#2563EB',
    bg: 'rgba(37,99,235,0.12)',
    navSuites: ['communicate', 'me'],
    canManageOrg: false,
    canManageMembers: false,
    canViewBilling: false,
    canViewAudit: false,
    canViewRBAC: false,
    canCreateWorkspace: false,
    isManagerOrAbove: false,
    showFullDashboard: false,
  },
  guest: {
    label: 'Khách / Đối tác',
    labelEn: 'Guest',
    color: '#9CA3AF',
    bg: 'rgba(156,163,175,0.12)',
    navSuites: ['communicate', 'me'],
    canManageOrg: false,
    canManageMembers: false,
    canViewBilling: false,
    canViewAudit: false,
    canViewRBAC: false,
    canCreateWorkspace: false,
    isManagerOrAbove: false,
    showFullDashboard: false,
  },
};

export const SETTINGS_TABS_BY_ROLE = [
  { id: 'profile', label: 'Hồ sơ', minRole: 'guest' },
  { id: 'overview', label: 'Tổng quan', minRole: 'guest' },
  { id: 'capability', label: 'Năng lực', minRole: 'guest' },
  { id: 'appearance', label: 'Giao diện', minRole: 'guest' },
  { id: 'notifications', label: 'Thông báo', minRole: 'guest' },
  { id: 'security', label: 'Bảo mật', minRole: 'personal' },
  { id: 'organization', label: 'Tổ chức', minRole: 'manager' },
  { id: 'rbac', label: 'Vai trò & RBAC', minRole: 'manager' },
  { id: 'api', label: 'API Keys', minRole: 'manager', capability: 'apiKeys' },
];

export function roleRank(role) {
  const idx = ROLE_ORDER.indexOf(String(role || 'member').toLowerCase());
  return idx >= 0 ? idx : ROLE_ORDER.indexOf('member');
}

export function roleAtLeast(userRole, minRole) {
  return roleRank(userRole) >= roleRank(minRole);
}

export function getRoleMeta(role) {
  const key = String(role || 'member').toLowerCase();
  return ROLE_META[key] || ROLE_META.member;
}

export function settingsTabsForRole(role) {
  return SETTINGS_TABS_BY_ROLE.filter(
    (tab) => roleAtLeast(role, tab.minRole) && (!tab.capability || hasBackendCapability(tab.capability))
  );
}

export function allowedSuitesForRole(role) {
  return getRoleMeta(role).navSuites;
}
