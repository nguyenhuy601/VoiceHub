import { useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { getVisibleAdminDomains } from '../config/adminDomainsConfig';
import { hasAnyAdminNavGrant } from '../config/rbacUiGrantMap';
import { resolveAdminSuiteNavPersona } from '../config/adminSuiteNavPersona';
import { useGrantScopes } from './useGrantScopes';
import { readSingleOrgModeFlag } from '../utils/singleCompanyMode';

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
  const { hasGrant, scopeOf, loading: grantsLoading, error: grantsError } = useGrantScopes(orgId);
  const canAccessHub =
    isSystemAdmin || hasAnyAdminNavGrant(hasGrant, scopeOf, getVisibleAdminDomains());
  const isFullAccess = false;
  const adminSuiteNav = useMemo(
    () => resolveAdminSuiteNavPersona({ isSystemAdmin, hasGrant, scopeOf }),
    [isSystemAdmin, hasGrant, scopeOf]
  );

  return {
    isSingleCompany,
    isSystemAdmin,
    systemRole,
    canAccessHub,
    isFullAccess,
    grantsLoading,
    grantsError,
    myOrgRole,
    orgId,
    adminSuiteNav,
  };
}

export default useCompanyAdminAccess;
