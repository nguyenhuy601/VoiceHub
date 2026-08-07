import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useOrganizationsMy } from '../../hooks/queries/useOrganizationsMy';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import userService from '../../services/userService';
import { getResolvedBearerToken } from '../../utils/tokenStorage';
import {
  filterMyProjects,
  mergePersonalOrgRoles,
  resolvePlacementFromShell,
} from './personalOverviewUtils';

function unwrapList(payload) {
  const raw = payload?.data?.data ?? payload?.data ?? payload;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.projects)) return raw.projects;
  return [];
}

function resolveOrgId(company, orgs) {
  const fromCompany = String(company?.id || company?._id || company?.organizationId || '').trim();
  if (fromCompany) return fromCompany;
  const first = Array.isArray(orgs) ? orgs[0] : null;
  return String(first?._id || first?.id || first?.organizationId || '').trim();
}

/**
 * Loads personal overview: profile, placement, org roles (from shell), my projects.
 * Không gọi /org-role-assignments (admin-only → 403 với member).
 */
export function usePersonalOverviewData({ enabled = true } = {}) {
  const { t } = useAppStrings();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { company } = useWorkspace();
  const orgsQuery = useOrganizationsMy({ enabled });
  const orgs = orgsQuery.data || [];
  const orgId = resolveOrgId(company, orgs);
  const authReady = Boolean(getResolvedBearerToken());
  const userId = String(user?.userId || user?._id || user?.id || '').trim();
  const ready = enabled && !authLoading && isAuthenticated && authReady;

  const shellQuery = useOrgShell(orgId, { enabled: ready && Boolean(orgId) });

  const profileQuery = useQuery({
    queryKey: ['personalOverview', 'profile', userId],
    queryFn: async () => {
      const res = await userService.getMe();
      return res?.data?.data ?? res?.data ?? res;
    },
    enabled: ready && Boolean(userId),
    staleTime: 60_000,
    retry: 1,
  });

  const projectsQuery = useQuery({
    queryKey: ['personalOverview', 'projects', orgId, userId],
    queryFn: async () => {
      const res = await projectAPI.list({ organizationId: orgId });
      return unwrapList(res);
    },
    enabled: ready && Boolean(orgId) && Boolean(userId),
    staleTime: 60_000,
    retry: 1,
  });

  const shell = shellQuery.data || null;
  const profile = profileQuery.data || null;

  const placement = useMemo(
    () => resolvePlacementFromShell(shell, userId),
    [shell, userId]
  );

  const shellOrgRoles = useMemo(() => {
    const rows = shell?.organization?.myOrganizationRoles;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      roleKey: String(r?.roleKey || r?.key || '').trim(),
      roleLabel: String(r?.roleLabel || r?.label || '').trim(),
      label: String(r?.roleLabel || r?.label || '').trim(),
    })).filter((r) => r.roleKey);
  }, [shell]);

  const orgRoles = useMemo(
    () =>
      mergePersonalOrgRoles({
        assignments: shellOrgRoles,
        structureRoles: placement.structureRoles || [],
        t,
      }),
    [shellOrgRoles, placement.structureRoles, t]
  );

  const myProjects = useMemo(
    () => filterMyProjects(projectsQuery.data || []),
    [projectsQuery.data]
  );

  const orgMeta = useMemo(() => {
    const fromShell = shell?.organization || {};
    const matched = (Array.isArray(orgs) ? orgs : []).find(
      (o) => String(o._id || o.id) === orgId
    );
    return {
      orgId,
      orgName:
        String(fromShell.name || matched?.name || company?.name || '').trim() || '—',
      membershipRole:
        String(fromShell.myRole || matched?.myRole || matched?.role || '').trim() || '',
      myStructureRole: String(matched?.myStructureRole || '').trim() || '',
    };
  }, [shell, orgs, orgId, company]);

  const displayProfile = useMemo(() => {
    const jobTitle = String(
      profile?.preferences?.jobTitle ||
        profile?.jobTitle ||
        user?.preferences?.jobTitle ||
        user?.jobTitle ||
        ''
    ).trim();
    const displayName =
      profile?.displayName ||
      profile?.fullName ||
      user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.username ||
      '—';
    const email = String(profile?.email || user?.email || '').trim();
    const avatar = profile?.avatar || user?.avatar || null;
    return { displayName, email, jobTitle, avatar, userId };
  }, [profile, user, userId]);

  const loading =
    ready &&
    (orgsQuery.isLoading ||
      (Boolean(orgId) && shellQuery.isLoading) ||
      profileQuery.isLoading ||
      (Boolean(orgId) && projectsQuery.isLoading));

  return {
    loading,
    orgId,
    displayProfile,
    orgMeta,
    placement,
    orgRoles,
    myProjects,
    errors: {
      shell: shellQuery.isError,
      assignments: false,
      projects: projectsQuery.isError,
      profile: profileQuery.isError,
    },
  };
}

export default usePersonalOverviewData;
