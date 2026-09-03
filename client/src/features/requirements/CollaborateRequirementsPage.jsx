import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { FIGMA_PAGE_INNER, FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import useRequirementAccess from '../../hooks/useRequirementAccess';
import RequirementImportWorkspace from './RequirementImportWorkspace';

export default function CollaborateRequirementsPage() {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const { activeWorkspace, company } = useWorkspace();
  const orgId = String(
    activeWorkspace?._id ||
      activeWorkspace?.id ||
      company?.id ||
      company?._id ||
      user?.organizationId ||
      user?.activeOrganizationId ||
      user?.companyId ||
      ''
  ).trim();

  const { access, loading, loaded } = useRequirementAccess(orgId);

  if (!orgId) {
    return (
      <div
        className={`flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center ${FIGMA_PAGE_SHELL}`}
      >
        <p className="text-muted-foreground">{t('requirements.noOrg')}</p>
      </div>
    );
  }

  if (!loaded || loading) {
    return (
      <div className={`flex h-[100dvh] items-center justify-center ${FIGMA_PAGE_SHELL}`}>
        <BrandPageLoader />
      </div>
    );
  }

  const canUsePage =
    access.canView &&
    (access.showCollaborateNav || access.canImport || access.canApprove || access.canSubmit);

  if (!canUsePage) {
    return (
      <div
        className={`flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center ${FIGMA_PAGE_SHELL}`}
      >
        <p className="text-muted-foreground">{t('requirements.noAccess')}</p>
      </div>
    );
  }

  return (
    <div className={FIGMA_PAGE_SHELL}>
      <div className={FIGMA_PAGE_INNER}>
        <RequirementImportWorkspace
          orgId={orgId}
          variant="collaborate"
          canSubmit={access.canSubmit}
          canApprove={access.canApprove}
          canCreateFromPack={access.canCreateFromPack}
          canRunAiPlanning={access.canRunAiPlanning}
        />
      </div>
    </div>
  );
}
