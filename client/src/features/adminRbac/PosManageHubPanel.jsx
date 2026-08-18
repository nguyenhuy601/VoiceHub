import { useCallback, useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminRbacOpsHubShell from '../../components/admin/AdminRbacOpsHubShell';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { AdminUserFormCard } from '../../components/adminUsers/adminUserPanelUi';
import PosAssignPanel from '../adminOrgStructure/PosAssignPanel';
import PosEditPanel from '../adminOrgStructure/PosEditPanel';
import PosDisablePanel from '../adminOrgStructure/PosDisablePanel';

const TAB_ASSIGN = 'assign';
const TAB_EDIT = 'edit';
const TAB_DISABLE = 'disable';

export default function PosManageHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_ASSIGN, label: t('adminDomains.rbac.posAssign') },
      { id: TAB_EDIT, label: t('adminDomains.rbac.posEdit') },
      { id: TAB_DISABLE, label: t('adminDomains.rbac.posDisable') },
    ],
    [t]
  );

  const renderPicker = useCallback(
    (activeTab) => {
      if (activeTab === TAB_ASSIGN) {
        return <AdminUserPicker orgId={orgId} hint={t('adminOrg.posAssignUserHint')} />;
      }
      return (
        <AdminUserFormCard title={t('adminOrg.posHubPickerTitle')} hint={t('adminOrg.posHubNoPickerHint')}>
          <p className="text-sm text-muted-foreground">{t('adminOrg.posHubNoPickerBody')}</p>
        </AdminUserFormCard>
      );
    },
    [orgId, t]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.rbac.posManageHub')}
      hint={t('adminOrg.posManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_ASSIGN}
      renderPicker={renderPicker}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_ASSIGN ? <PosAssignPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_EDIT ? <PosEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DISABLE ? <PosDisablePanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminRbacOpsHubShell>
  );
}
