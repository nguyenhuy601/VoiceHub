import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { useAppStrings } from '../../locales/appStrings';
import useRequirementAccess from '../../hooks/useRequirementAccess';
import RequirementImportWorkspace from '../requirements/RequirementImportWorkspace';

export default function RequirementTemplatePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const { access, loading, loaded } = useRequirementAccess(orgId);

  const body =
    !orgId || !loaded || loading ? (
      <div className="flex justify-center py-10">
        <BrandPageLoader />
      </div>
    ) : (
      <RequirementImportWorkspace
        orgId={orgId}
        variant="admin"
        canSubmit={false}
        canApprove={access.canApprove}
        canCreateFromPack={access.canCreateFromPack}
        canRunAiPlanning={access.canRunAiPlanning}
      />
    );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.requirements.title')}
      hint={t('adminDomains.requirements.subtitle')}
    >
      {body}
    </AdminUserPanelShell>
  );
}
