import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { mapLegacyAdminTabToPath, buildCommunicateChannelsPath } from '../../utils/suitePathUtils';
import { readSingleOrgModeFlag } from '../../utils/singleCompanyMode';

const unwrap = (payload) => payload?.data ?? payload;

const SETTINGS_TAB_TO_ADMIN = {
  general: 'general',
  join: 'policy',
  security: 'security',
  structure: 'structure',
  roles: 'roles',
};

/**
 * Cài đặt workspace full màn hình: sidebar app + 2 cột (mục | nội dung) trong OrganizationSettingsPanel.
 * Đường dẫn: /app/collaborate/organizations/:orgId/settings?tab=join
 * Single-org: redirect sang /app/admin
 */
export default function OrganizationSettingsPage() {
  const { t } = useAppStrings();
  const shell = `flex h-[100dvh] overflow-hidden ${FIGMA_PAGE_SHELL} text-foreground`;
  const mutedTextCls = 'text-muted-foreground';
  const { orgId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = searchParams.get('tab') || undefined;
  const singleOrg = readSingleOrgModeFlag();

  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const organizationHomePath = orgId
    ? `${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(orgId)}`
    : '/app/collaborate/workspaces';

  useEffect(() => {
    if (singleOrg) return undefined;
    let cancelled = false;
    (async () => {
      if (!orgId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const payload = await organizationAPI.getOrganization(orgId);
        const data = unwrap(payload);
        const o = data?.data ?? data;
        if (!cancelled) setOrganization(o || null);
      } catch {
        if (!cancelled) setOrganization(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, singleOrg]);

  if (singleOrg) {
    const mapped = SETTINGS_TAB_TO_ADMIN[initialTab] || initialTab || 'overview';
    return <Navigate to={mapLegacyAdminTabToPath(mapped)} replace />;
  }

  const handleOrganizationUpdated = () => {
    if (!orgId) return;
    organizationAPI
      .getOrganization(orgId)
      .then((payload) => {
        const data = unwrap(payload);
        const o = data?.data ?? data;
        if (o) setOrganization(o);
      })
      .catch(() => {});
  };

  if (!orgId) {
    return (
      <div className={shell}>
        <main className={`flex flex-1 items-center justify-center ${mutedTextCls}`}>
          {t('organizationSettings.missingOrgId')}
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={shell}>
        <main className={`flex flex-1 items-center justify-center ${mutedTextCls}`}>
          {t('organizationSettings.loading')}
        </main>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className={shell}>
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className={mutedTextCls}>{t('organizationSettings.notFound')}</p>
          <button
            type="button"
            onClick={() => navigate('/app/collaborate/workspaces')}
            className="text-primary hover:underline"
          >
            {t('organizationSettings.backOrgs')}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className={shell}>
      <OrganizationSettingsPanel
        suiteLayout
        organization={organization}
        initialTab={initialTab}
        onBack={() => navigate(organizationHomePath)}
        onOrganizationUpdated={handleOrganizationUpdated}
        onOrganizationDeleted={() => navigate('/app/collaborate/workspaces')}
      />
    </div>
  );
}
