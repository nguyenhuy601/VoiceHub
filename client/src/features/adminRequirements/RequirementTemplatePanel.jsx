import { useState } from 'react';
import {
  AdminHubTablist,
  AdminHubTabPanel,
  useAdminHubTabIds,
} from '../../components/Admin/AdminHubTablist';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import useRequirementAccess from '../../hooks/useRequirementAccess';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import RequirementImportWorkspace from '../requirements/RequirementImportWorkspace';
import RequirementAccessPolicyPanel from './RequirementAccessPolicyPanel';

export default function RequirementTemplatePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const { access, loading, loaded, reload, isError, error } = useRequirementAccess(orgId);
  const [headerActions, setHeaderActions] = useState(null);
  const [activeTab, setActiveTab] = useState('import');
  const idPrefix = useAdminHubTabIds();

  const tabs = [
    { id: 'import', label: t('adminDomains.requirements.tabImport') },
    { id: 'access', label: t('adminDomains.requirements.tabAccessPolicy') },
  ];

  let body;
  if (!orgId || loading || !loaded) {
    body = <AdminListSkeleton rows={4} />;
  } else if (isError) {
    body = (
      <AdminLoadErrorState
        message={resolveApiErrorMessage(error, {
          t,
          fallback: t('adminDomains.requirements.accessLoadFail'),
        })}
        onRetry={reload}
        disabled={loading}
      />
    );
  } else {
    body = (
      <>
        <AdminHubTablist
          idPrefix={idPrefix}
          label={t('adminDomains.requirements.title')}
          tabs={tabs}
          activeTab={activeTab}
          onSelect={setActiveTab}
          className="mb-4"
        />
        <AdminHubTabPanel idPrefix={idPrefix} tabs={tabs} activeTab={activeTab}>
          {activeTab === 'import' ? (
            <RequirementImportWorkspace
              orgId={orgId}
              variant="admin"
              canSubmit={access.canSubmit}
              canApprove={access.canApprove}
              canCreateFromPack={access.canCreateFromPack}
              canRunAiPlanning={access.canRunAiPlanning}
              setHeaderActions={setHeaderActions}
            />
          ) : (
            <RequirementAccessPolicyPanel orgId={orgId} />
          )}
        </AdminHubTabPanel>
      </>
    );
  }

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.requirements.title')}
      hint={t('adminDomains.requirements.subtitle')}
      actions={activeTab === 'import' && !isError ? headerActions : null}
    >
      {body}
    </AdminUserPanelShell>
  );
}
