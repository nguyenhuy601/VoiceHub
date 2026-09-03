import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import AdminCompanyRealtimeSync from '../../components/admin/AdminCompanyRealtimeSync';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import useOrganizationDetail from '../../hooks/useOrganizationDetail';
import { useAppStrings } from '../../locales/appStrings';
import {
  fetchAdminMembers,
  getAdminMembersCount,
  subscribeAdminMembers,
} from '../../stores/adminMembersStore';

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

  const {
    organization,
    loading,
    reload: refreshOrganization,
  } = useOrganizationDetail(orgId, { enabled: Boolean(orgId) });

  const [memberCount, setMemberCount] = useState(0);

  const refreshStats = useCallback(async () => {
    if (!orgId) return;
    await fetchAdminMembers(orgId, { showError: false }).catch(() => null);
    setMemberCount(getAdminMembersCount(orgId));
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !canAccessHub) return undefined;
    fetchAdminMembers(orgId, { showError: false }).catch(() => null);
    const syncCount = () => {
      const next = getAdminMembersCount(orgId);
      setMemberCount((prev) => (prev === next ? prev : next));
    };
    syncCount();
    const unsub = subscribeAdminMembers(orgId, syncCount);
    return unsub;
  }, [orgId, canAccessHub]);

  const contextValue = useMemo(
    () => ({
      orgId,
      organization,
      isFullAccess,
      memberCount,
      refreshOrganization,
      refreshStats,
    }),
    [orgId, organization, isFullAccess, memberCount, refreshOrganization, refreshStats]
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
      <AdminCompanyRealtimeSync />
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
