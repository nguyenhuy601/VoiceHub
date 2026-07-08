import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import { organizationAPI } from '../../services/api/organizationAPI';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useAppStrings } from '../../locales/appStrings';

const unwrap = (payload) => payload?.data ?? payload;

const CompanyAdminContext = createContext(null);

export function useCompanyAdminContext() {
  const ctx = useContext(CompanyAdminContext);
  if (!ctx) {
    throw new Error('useCompanyAdminContext must be used within CompanyAdminLayout');
  }
  return ctx;
}

export default function CompanyAdminLayout() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { canAccessHub, isFullAccess, orgId } = useCompanyAdminAccess();

  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);

  const refreshOrganization = useCallback(async () => {
    if (!orgId) return null;
    const payload = await organizationAPI.getOrganization(orgId);
    const data = unwrap(payload);
    const org = data?.data ?? data;
    if (org) setOrganization(org);
    return org || null;
  }, [orgId]);

  const refreshStats = useCallback(async () => {
    if (!orgId) return;
    try {
      const [joinRes, membersRes] = await Promise.all([
        organizationAPI.getJoinApplicationsToReview(),
        organizationAPI.getMembersWithRoles(orgId),
      ]);
      const joinData = unwrap(joinRes);
      const joinList = Array.isArray(joinData) ? joinData : joinData?.data || [];
      const filteredJoin = joinList.filter(
        (a) => String(a.organizationId || a.organization?._id || '') === String(orgId)
      );
      const membersData = unwrap(membersRes);
      const members = membersData?.data?.members || membersData?.members || membersData;
      setPendingJoinCount(filteredJoin.length);
      setMemberCount(Array.isArray(members) ? members.length : 0);
    } catch {
      setPendingJoinCount(0);
      setMemberCount(0);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const org = await refreshOrganization();
        if (!cancelled && !org) setOrganization(null);
      } catch {
        if (!cancelled) setOrganization(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, refreshOrganization]);

  useEffect(() => {
    if (!orgId || !canAccessHub) return undefined;
    refreshStats();
    return undefined;
  }, [orgId, canAccessHub, refreshStats]);

  const contextValue = useMemo(
    () => ({
      orgId,
      organization,
      isFullAccess,
      pendingJoinCount,
      memberCount,
      refreshOrganization,
      refreshStats,
    }),
    [orgId, organization, isFullAccess, pendingJoinCount, memberCount, refreshOrganization, refreshStats]
  );

  if (!canAccessHub) {
    return <Navigate to="/app/collaborate/workspaces" replace />;
  }

  if (!orgId) {
    return (
      <div className={`flex h-[100dvh] items-center justify-center ${FIGMA_PAGE_SHELL}`}>
        <p className="text-muted-foreground">{t('companyAdmin.missingCompany')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex h-[100dvh] items-center justify-center ${FIGMA_PAGE_SHELL}`}>
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className={`flex h-[100dvh] flex-col items-center justify-center gap-3 ${FIGMA_PAGE_SHELL}`}>
        <p className="text-muted-foreground">{t('organizationSettings.notFound')}</p>
        <button type="button" className="text-primary hover:underline" onClick={() => navigate('/app/collaborate/workspaces')}>
          {t('companyAdmin.backToWork')}
        </button>
      </div>
    );
  }

  return (
    <CompanyAdminContext.Provider value={contextValue}>
      <div className={`flex h-[100dvh] flex-col overflow-hidden ${FIGMA_PAGE_SHELL} text-foreground`}>
        <header className="shrink-0 border-b border-border bg-card/40 px-4 py-4 md:px-8">
          <h1 className="text-xl font-bold">{t('companyAdmin.title')}</h1>
          <p className="text-sm text-muted-foreground">{organization.name}</p>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </CompanyAdminContext.Provider>
  );
}
