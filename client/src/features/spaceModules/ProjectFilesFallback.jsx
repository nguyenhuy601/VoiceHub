import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import OrganizationDocumentsWorkspacePanel from '../orgDocuments/OrganizationDocumentsWorkspacePanel';
import { useLibraryDocuments } from '../orgDocuments/useLibraryDocuments';

/**
 * Kho dự án — cùng Drive shell. Data library qua GET /documents?projectId= (D4).
 */
export default function ProjectFilesFallback({ projectId = '', organizationId = '' } = {}) {
  const { t } = useAppStrings();
  const pid = String(projectId || '').trim();
  const orgId = String(organizationId || '').trim();
  const libraryQuery = useLibraryDocuments({
    organizationId: orgId,
    projectId: pid,
    enabled: Boolean(pid),
  });
  const documentsError = libraryQuery.isError
    ? resolveApiErrorMessage(libraryQuery.error, { t, fallback: t('documents.loadFail') })
    : '';

  return (
    <div className="h-full min-h-0">
      <OrganizationDocumentsWorkspacePanel
        files={libraryQuery.files}
        loading={libraryQuery.isLoading}
        error={documentsError}
        onReload={() => libraryQuery.reload()}
        organizationId={orgId}
        projectId={pid}
        panelTitle={t('documents.driveTitleProject')}
        scopeHint={t('documents.driveHintProject')}
      />
    </div>
  );
}
