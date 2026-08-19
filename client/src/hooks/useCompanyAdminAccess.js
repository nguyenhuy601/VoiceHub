import { useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { readSingleOrgModeFlag } from '../utils/singleCompanyMode';

const HUB_ROLES = new Set(['owner', 'admin', 'hr']);
const FULL_ACCESS_ROLES = new Set(['owner', 'admin']);

export function useCompanyAdminAccess() {
  const { company, activeWorkspace, lastOrganizationId, singleOrgMode } = useWorkspace();
  const { user } = useAuth();
  const isSingleCompany = Boolean(singleOrgMode || readSingleOrgModeFlag());

  const myOrgRole = useMemo(
    () => String(company?.myRole || activeWorkspace?.myRole || 'member').toLowerCase(),
    [company?.myRole, activeWorkspace?.myRole]
  );

  const orgId = useMemo(
    () =>
      String(
        company?.id || company?._id || activeWorkspace?._id || activeWorkspace?.id || lastOrganizationId || ''
      ).trim(),
    [company?.id, company?._id, activeWorkspace?._id, activeWorkspace?.id, lastOrganizationId]
  );

  // Chỉ lấy systemRole từ JWT/bootstrap — không fallback sang user.role (dễ nhầm org role).
  const systemRole = useMemo(
    () => String(user?.systemRole || '').trim().toLowerCase(),
    [user?.systemRole]
  );

  // systemRole=admin: vào app quản trị hệ thống ngay cả khi org chưa hydrate.
  // owner|admin|hr org: hub công ty khi đã có orgId.
  const isSystemAdmin = systemRole === 'admin';
  const isOrgOwnerOrAdmin = FULL_ACCESS_ROLES.has(myOrgRole);
  const canAccessHub = isSystemAdmin || (Boolean(orgId) && HUB_ROLES.has(myOrgRole));
  const isFullAccess = isSystemAdmin || isOrgOwnerOrAdmin;
  /** HR / owner / admin: xếp phòng-team (People Ops). */
  const canManagePlacement = isSystemAdmin || isFullAccess || myOrgRole === 'hr';
  /** Chỉ owner/admin/system: tạo-xóa cấu trúc org. */
  const canManageStructure = isFullAccess;
  /** Chuẩn vàng: chỉ orgRole HR xác minh/từ chối hồ sơ năng lực (CV). */
  const canVerifyCapability = myOrgRole === 'hr';

  return {
    isSingleCompany,
    isSystemAdmin,
    systemRole,
    canAccessHub,
    isFullAccess,
    isOrgOwnerOrAdmin,
    canManagePlacement,
    canManageStructure,
    canVerifyCapability,
    myOrgRole,
    orgId,
  };
}

export default useCompanyAdminAccess;
