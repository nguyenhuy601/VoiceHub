import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { canActAdmin } from '../config/rbacUiGrantMap';
import { useCompanyAdminAccess } from './useCompanyAdminAccess';
import { useGrantScopes } from './useGrantScopes';
import { useAppStrings } from '../locales/appStrings';

/**
 * Gate CTA/form suite `/app/admin` — SoT = navItemIsAllowed (maintain Nhà cung cấp + grantScopes).
 * @param {string} [orgIdProp] — mặc định org từ useCompanyAdminAccess
 */
export function useAdminActionGate(orgIdProp) {
  const { t } = useAppStrings();
  const { orgId: ctxOrgId, isSystemAdmin, grantsLoading: accessGrantsLoading } = useCompanyAdminAccess();
  const orgId = String(orgIdProp || ctxOrgId || '').trim();
  const { hasGrant, scopeOf, loading: scopesLoading } = useGrantScopes(orgId);
  const grantsLoading = Boolean(accessGrantsLoading || scopesLoading);

  const can = useCallback(
    (requiredGrant) =>
      canActAdmin(requiredGrant, {
        hasGrant,
        scopeOf,
        isSystemAdmin,
      }),
    [hasGrant, scopeOf, isSystemAdmin]
  );

  /** @returns {boolean} true nếu được phép tiếp tục */
  const assertOrToast = useCallback(
    (requiredGrant) => {
      if (can(requiredGrant)) return true;
      toast.error(t('adminOrg.grantDenied'));
      return false;
    },
    [can, t]
  );

  return {
    can,
    assertOrToast,
    grantsLoading,
    isSystemAdmin,
    orgId,
    hasGrant,
    scopeOf,
  };
}

export default useAdminActionGate;
