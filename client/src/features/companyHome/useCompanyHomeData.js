import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import { useSpace } from '../../context/SpaceContext';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import { useOrganizationDocumentsOverview } from '../../hooks/queries/useOrganizationDocumentsOverview';
import { filterOrgFilesByScope } from '../orgDocuments/orgDocumentUtils';
import { COMPANY_SPACE_LEVEL } from '../../utils/companySpaceLevel';
import {
  buildCompanyChatPath,
  buildCompanyDocumentsPath,
  buildCompanyWorkspacePath,
} from '../../utils/suitePathUtils';
import {
  buildCompanyHomeViewModel,
  countScopedHomeDocuments,
} from './companyHomeMetrics';

/**
 * Aggregate company home data from existing hooks (no new API).
 * Modules mirror getCompanyNavItems (chat + documents only).
 */
export function useCompanyHomeData() {
  const { t } = useAppStrings();
  const space = useSpace();
  const organizationId = space?.organizationId || '';
  const departmentId = space?.departmentId || '';
  const teamId = space?.teamId || '';
  const level = space?.level || COMPANY_SPACE_LEVEL.DEPARTMENT;
  const isTeamLevel = level === COMPANY_SPACE_LEVEL.TEAM && Boolean(teamId);

  const shellQuery = useOrgShell(organizationId, { enabled: Boolean(organizationId) });
  const docsQuery = useOrganizationDocumentsOverview(organizationId, {
    enabled: Boolean(organizationId) && Boolean(departmentId),
  });

  const labels = useMemo(
    () => ({
      homeFallback: t('nav.companyHome'),
      teamFallback: t('nav.companyLevelTeam'),
      deptSub: t('nav.companyHomeDeptSub'),
      teamSub: (dept) => t('nav.companyHomeTeamSub', { department: dept }),
      pulseTeams: t('nav.companyHomePulseTeams'),
      pulseDocs: t('nav.companyHomePulseDocs'),
      distTeams: t('nav.companyHomeDistTeams'),
      distDocs: t('nav.companyHomeDistDocs'),
    }),
    [t]
  );

  const documentCount = useMemo(() => {
    if (!docsQuery.isSuccess) return null;
    return countScopedHomeDocuments(
      docsQuery.files || [],
      {
        departmentId,
        teamId: isTeamLevel ? teamId : '',
      },
      filterOrgFilesByScope
    );
  }, [docsQuery.isSuccess, docsQuery.files, departmentId, teamId, isTeamLevel]);

  const viewModel = useMemo(
    () =>
      buildCompanyHomeViewModel({
        shell: shellQuery.data || null,
        departmentId,
        teamId,
        level,
        documentCount,
        labels,
      }),
    [shellQuery.data, departmentId, teamId, level, documentCount, labels]
  );

  const paths = useMemo(() => {
    const chatPath = buildCompanyChatPath(organizationId, {
      departmentId,
      teamId: isTeamLevel ? teamId : '',
      tab: isTeamLevel ? 'chat' : 'announcement',
    });
    const docsPath = buildCompanyDocumentsPath(organizationId, {
      departmentId,
      teamId: isTeamLevel ? teamId : '',
    });
    const workspacesPath = buildCompanyWorkspacePath({ organizationId, departmentId });
    return { chatPath, docsPath, workspacesPath };
  }, [organizationId, departmentId, teamId, isTeamLevel]);

  return {
    organizationId,
    departmentId,
    teamId,
    level,
    shellQuery,
    docsQuery,
    viewModel,
    paths,
    refetchAll: () => {
      shellQuery.refetch();
      if (departmentId) docsQuery.refetch();
    },
  };
}
