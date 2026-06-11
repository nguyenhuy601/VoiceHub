import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { organizationAPI } from '../../services/api/organizationAPI';
import { unwrapApiData } from '../../utils/helpers';
import { legacyWorkspaceTabToSuitePath, parseLegacyWorkspacePath } from '../../utils/suitePathUtils';
import { findOrgBySlug, workspacePayloadFromOrg } from '../../utils/orgListUtils';
import BrandPageLoader from '../Shared/BrandPageLoader';
import { useOrganizationsMy } from '../../hooks/queries';

/**
 * Redirect /w/:slug/:tab → suite route; resolve org và set activeWorkspace.
 */
const LegacyWorkspaceRedirect = () => {
  const { setActiveWorkspace } = useWorkspace();
  const { data: orgs = [] } = useOrganizationsMy();
  const [target, setTarget] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parsed = parseLegacyWorkspacePath(window.location.pathname);
      if (!parsed?.slug) {
        if (!cancelled) {
          setTarget('/app/collaborate/workspaces');
          setLoading(false);
        }
        return;
      }

      let org = findOrgBySlug(orgs, parsed.slug);
      if (!org) {
        try {
          const res = await organizationAPI.getWorkspaceBySlug(parsed.slug);
          const raw = unwrapApiData(res);
          org = raw?.data ?? raw;
        } catch {
          org = null;
        }
      }

      const orgId = String(org?._id || org?.id || '').trim();
      if (org) setActiveWorkspace(workspacePayloadFromOrg(org));

      if (!cancelled) {
        setTarget(legacyWorkspaceTabToSuitePath(parsed.tab, orgId));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgs, setActiveWorkspace]);

  if (loading) return <BrandPageLoader />;
  return <Navigate to={target || '/app/collaborate/workspaces'} replace />;
};

export default LegacyWorkspaceRedirect;
