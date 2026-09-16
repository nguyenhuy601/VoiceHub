import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import SuiteShellLayout from './SuiteShellLayout';
import CompanySidebar from './CompanySidebar';
import { SpaceProvider, SPACE_KIND } from '../../context/SpaceContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import { readStoredLastOrganizationId } from '../../utils/suitePathUtils';
import {
  COMPANY_SPACE_LEVEL,
  isCompanyStructureReadyForTeamCheck,
  isValidCompanyTeamId,
  readStoredCompanyTeamId,
  resolveCompanySpaceLevel,
  resolveMyDepartmentId,
} from '../../utils/companySpaceLevel';

/** Company suite shell + SpaceContext (org + dept + optional team). */
export default function CompanySuiteLayout() {
  const { company, activeWorkspace } = useWorkspace();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const organizationId = useMemo(
    () =>
      String(
        searchParams.get('organizationId') ||
          activeWorkspace?._id ||
          activeWorkspace?.id ||
          company?.id ||
          company?._id ||
          readStoredLastOrganizationId() ||
          ''
      ).trim(),
    [searchParams, activeWorkspace, company]
  );

  const shellQuery = useOrgShell(organizationId, { enabled: Boolean(organizationId) });
  const shell = shellQuery.data || null;

  const departmentId = useMemo(() => {
    const fromUrl = String(searchParams.get('departmentId') || '').trim();
    const fromShell = resolveMyDepartmentId(shell);
    return fromUrl || fromShell || '';
  }, [searchParams, shell]);

  const teamIdFromUrl = String(searchParams.get('teamId') || '').trim();

  const resolved = useMemo(
    () =>
      resolveCompanySpaceLevel({
        shell,
        departmentId,
        teamIdFromUrl,
        teamIdFromStorage: readStoredCompanyTeamId(),
        preferTeam: false,
      }),
    [shell, departmentId, teamIdFromUrl]
  );

  const spaceDeptId = resolved.departmentId || departmentId;
  const structureReady = isCompanyStructureReadyForTeamCheck(shell, spaceDeptId);
  const holdUrlTeam =
    Boolean(teamIdFromUrl) &&
    !resolved.teamId &&
    (shellQuery.isLoading || !shell || !structureReady);
  const spaceTeamId = resolved.teamId || (holdUrlTeam ? teamIdFromUrl : '');
  const spaceLevel = spaceTeamId
    ? COMPANY_SPACE_LEVEL.TEAM
    : resolved.level;

  useEffect(() => {
    if (!organizationId || !spaceDeptId || shellQuery.isLoading || !shell) return;
    const currentDept = String(searchParams.get('departmentId') || '').trim();
    const currentTeam = String(searchParams.get('teamId') || '').trim();
    const hasOrgQuery = Boolean(searchParams.get('organizationId') || searchParams.get('orgId'));
    const wantTeam =
      spaceLevel === COMPANY_SPACE_LEVEL.TEAM ? String(spaceTeamId || '').trim() : '';
    const teamOk =
      spaceLevel !== COMPANY_SPACE_LEVEL.TEAM ? !currentTeam : currentTeam === wantTeam;
    if (currentDept === spaceDeptId && teamOk && !hasOrgQuery) return;

    const next = new URLSearchParams(searchParams);
    next.delete('organizationId');
    next.delete('orgId');
    next.set('departmentId', spaceDeptId);
    if (spaceLevel !== COMPANY_SPACE_LEVEL.TEAM) {
      next.delete('teamId');
    } else if (wantTeam) {
      next.set('teamId', wantTeam);
    }
    const qs = next.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
  }, [
    organizationId,
    spaceDeptId,
    spaceLevel,
    spaceTeamId,
    searchParams,
    location.pathname,
    navigate,
    shell,
    shellQuery.isLoading,
    structureReady,
    teamIdFromUrl,
  ]);

  return (
    <SpaceProvider
      kind={SPACE_KIND.COMPANY}
      organizationId={organizationId}
      departmentId={spaceDeptId}
      teamId={spaceTeamId}
      level={spaceLevel}
    >
      <SuiteShellLayout sidebar={<CompanySidebar />} />
    </SpaceProvider>
  );
}
