import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import useRequirementAccess from '../../hooks/useRequirementAccess';
import { shouldShowCollaborateRequirementsNavForUser } from '../../utils/collaborateRequirementsNav';
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

  // UI entry by Position; action flags from access API (permission).
  const allowedByPosition = shouldShowCollaborateRequirementsNavForUser(user);
  const { access, loading, loaded } = useRequirementAccess(allowedByPosition ? orgId : '');

  if (!orgId) {
    return (
      <div
        className={`flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center ${FIGMA_PAGE_SHELL}`}
      >
        <p className="text-muted-foreground">{t('requirements.noOrg')}</p>
      </div>
    );
  }

  if (!allowedByPosition) {
    return (
      <div
        className={`flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center ${FIGMA_PAGE_SHELL}`}
      >
        <p className="text-muted-foreground">{t('requirements.noAccess')}</p>
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

  // Deep-link / Position OK nhưng không có quyền xem dữ liệu → empty.
  if (!access.canView) {
    return (
      <div
        className={`flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center ${FIGMA_PAGE_SHELL}`}
      >
        <p className="text-muted-foreground">{t('requirements.noAccess')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background/75 backdrop-blur-sm dark:bg-background/65">
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5">
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
