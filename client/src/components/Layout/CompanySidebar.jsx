import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import FigmaNavigationSidebar from './FigmaNavigationSidebar';
import CompanyContextSwitch from './CompanyContextSwitch';
import CompanyTeamPickerModal from './CompanyTeamPickerModal';
import { useSpace } from '../../context/SpaceContext';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import {
  COMPANY_SPACE_LEVEL,
  listMyTeamsFromShell,
  resolveDepartmentLabel,
  resolveTeamLabel,
  writeStoredCompanyTeamId,
} from '../../utils/companySpaceLevel';
import { buildCompanyHomePath } from '../../utils/suitePathUtils';

/** Company Space suite sidebar + L2 dept/team switch. */
export default function CompanySidebar({ landingDemo = false } = {}) {
  const space = useSpace();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);

  const organizationId = space?.organizationId || '';
  const departmentId = space?.departmentId || '';
  const teamId = space?.teamId || '';
  const level = space?.level || COMPANY_SPACE_LEVEL.DEPARTMENT;

  const shellQuery = useOrgShell(organizationId, { enabled: Boolean(organizationId) });
  const shell = shellQuery.data || null;

  const teams = useMemo(
    () => listMyTeamsFromShell(shell, departmentId),
    [shell, departmentId]
  );

  const departmentLabel = resolveDepartmentLabel(shell, departmentId);
  const teamLabel = resolveTeamLabel(shell, teamId);

  const patchSearch = useCallback(
    ({ nextTeamId = null, clearTeam = false } = {}) => {
      const next = new URLSearchParams(searchParams);
      if (organizationId) next.set('organizationId', organizationId);
      if (departmentId) next.set('departmentId', departmentId);
      if (clearTeam) {
        next.delete('teamId');
        writeStoredCompanyTeamId('');
      } else if (nextTeamId) {
        next.set('teamId', String(nextTeamId));
        writeStoredCompanyTeamId(nextTeamId);
      }
      const pathname =
        location.pathname.startsWith('/app/company')
          ? location.pathname
          : buildCompanyHomePath({ organizationId, departmentId }).split('?')[0];
      navigate({ pathname, search: `?${next.toString()}` });
    },
    [searchParams, organizationId, departmentId, location.pathname, navigate]
  );

  const onSelectDepartment = useCallback(() => {
    patchSearch({ clearTeam: true });
    setPickerOpen(false);
  }, [patchSearch]);

  const onSelectTeam = useCallback(
    (team) => {
      if (!team?.id) return;
      patchSearch({ nextTeamId: team.id });
      setPickerOpen(false);
    },
    [patchSearch]
  );

  return (
    <>
      <FigmaNavigationSidebar
        suite="company"
        landingDemo={landingDemo}
        contextSwitch={
          <CompanyContextSwitch
            level={level}
            departmentLabel={departmentLabel}
            teamLabel={teamLabel}
            onSelectDepartment={onSelectDepartment}
            onOpenTeamPicker={() => setPickerOpen(true)}
          />
        }
      />
      <CompanyTeamPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        teams={teams}
        selectedTeamId={teamId}
        onSelect={onSelectTeam}
      />
    </>
  );
}
