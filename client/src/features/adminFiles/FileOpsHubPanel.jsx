import { useCallback, useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminRbacOpsHubShell from '../../components/admin/AdminRbacOpsHubShell';
import AdminComingSoonEmbed from '../../components/admin/AdminComingSoonEmbed';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import useAdminDocuments from '../../hooks/useAdminDocuments';

const TAB_RESTORE = 'restore';
const TAB_EXPORT = 'export';
const TAB_DELETE = 'delete';

export default function FileOpsHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { documents, loading, error, loadDocuments } = useAdminDocuments(orgId);

  const tabs = useMemo(
    () => [
      { id: TAB_RESTORE, label: t('adminDomains.files.restore') },
      { id: TAB_EXPORT, label: t('adminDomains.files.export') },
      { id: TAB_DELETE, label: t('adminDomains.files.delete') },
    ],
    [t]
  );

  const renderPicker = useCallback(
    () => (
      <AdminOrgUnitPicker
        items={documents}
        loading={loading}
        error={error}
        onRetry={() => loadDocuments()}
        paramKey="fileId"
        title={t('adminFiles.pickerTitle')}
        hint={t('adminFiles.pickerHint')}
        subtitleFn={(row) => row.mimeType || ''}
      />
    ),
    [documents, loading, error, loadDocuments, t]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.files.opsHub')}
      hint={t('adminFiles.opsHubHint')}
      tabs={tabs}
      defaultTab={TAB_RESTORE}
      renderPicker={renderPicker}
    >
      {({ activeTab }) => (
        <AdminComingSoonEmbed
          title={tabs.find((tab) => tab.id === activeTab)?.label || t('adminDomains.files.opsHub')}
          hint={t('adminFiles.tabComingSoonHint')}
        />
      )}
    </AdminRbacOpsHubShell>
  );
}
