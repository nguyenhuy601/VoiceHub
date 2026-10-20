import { useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { hasAnyAdminNavGrant } from '../config/rbacUiGrantMap';
import { useGrantScopes } from './useGrantScopes';
import { readSingleOrgModeFlag } from '../utils/singleCompanyMode';

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

  const isSystemAdmin = systemRole === 'admin';
  const isOrgOwnerOrAdmin = FULL_ACCESS_ROLES.has(myOrgRole);
  const { hasGrant, scopeOf, loading: grantsLoading, error: grantsError } = useGrantScopes(orgId);
  const canAccessHub = isSystemAdmin || hasAnyAdminNavGrant(hasGrant, scopeOf);
  // Chỉ systemRole=admin mở đủ UI admin. Quản trị khác (owner/HR/…) siết theo grantScopes.
  const isFullAccess = isSystemAdmin;

  return {
    isSingleCompany,
    isSystemAdmin,
    systemRole,
    canAccessHub,
    isFullAccess,
    grantsLoading,
    grantsError,
    isOrgOwnerOrAdmin,
    myOrgRole,
    orgId,
  };
}

export default useCompanyAdminAccess;
