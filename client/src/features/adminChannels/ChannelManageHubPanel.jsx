import { useCallback, useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminRbacOpsHubShell from '../../components/admin/AdminRbacOpsHubShell';
import AdminComingSoonEmbed from '../../components/admin/AdminComingSoonEmbed';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import useAdminChannels from '../../hooks/useAdminChannels';

const TAB_EDIT = 'edit';
const TAB_MEMBERS = 'members';
const TAB_VISIBILITY = 'visibility';
const TAB_TRANSFER = 'transfer';
const TAB_ARCHIVE = 'archive';
const TAB_RESTORE = 'restore';

export default function ChannelManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { channels, loading, error, loadChannels } = useAdminChannels(orgId);

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.channels.edit') },
      { id: TAB_MEMBERS, label: t('adminDomains.channels.members') },
      { id: TAB_VISIBILITY, label: t('adminDomains.channels.visibility') },
      { id: TAB_TRANSFER, label: t('adminDomains.channels.transfer') },
      { id: TAB_ARCHIVE, label: t('adminDomains.channels.archive') },
      { id: TAB_RESTORE, label: t('adminDomains.channels.restore') },
    ],
    [t]
  );

  const renderPicker = useCallback(
    () => (
      <AdminOrgUnitPicker
        items={channels}
        loading={loading}
        error={error}
        onRetry={() => loadChannels()}
        paramKey="channelId"
        title={t('adminChannels.pickerTitle')}
        hint={t('adminChannels.pickerHint')}
        subtitleFn={(row) => row._scopeName || row.type || ''}
      />
    ),
    [channels, loading, error, loadChannels, t]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.channels.manageHub')}
      hint={t('adminChannels.manageHubHint')}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      renderPicker={renderPicker}
    >
      {({ activeTab }) => (
        <AdminComingSoonEmbed
          title={tabs.find((tab) => tab.id === activeTab)?.label || t('adminDomains.channels.manageHub')}
          hint={t('adminChannels.tabComingSoonHint')}
        />
      )}
    </AdminRbacOpsHubShell>
  );
}
