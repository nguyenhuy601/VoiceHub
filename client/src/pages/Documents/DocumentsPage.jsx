import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import OrganizationDocumentsWorkspacePanel from '../../features/orgDocuments/OrganizationDocumentsWorkspacePanel';
import { useLibraryDocuments } from '../../features/orgDocuments/useLibraryDocuments';

function DocumentsPage({ spaceOrganizationId = '' } = {}) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const organizationId = String(
    spaceOrganizationId ||
      searchParams.get('organizationId') ||
      searchParams.get('orgId') ||
      ''
  ).trim();
  const libraryQuery = useLibraryDocuments({ organizationId });
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
        organizationId={organizationId}
      />
    </div>
  );
}

export default DocumentsPage;
