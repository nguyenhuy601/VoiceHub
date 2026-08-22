import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CreateProjectAiWizard from '../../features/projects/aiWizard/CreateProjectAiWizard';
import { buildCollaborateProjectHubPath } from '../../utils/suitePathUtils';
import { useAppStrings } from '../../locales/appStrings';
import { wizardUi } from '../../features/projects/wizard/projectWizardUi';

/**
 * Full-viewport AI create-project page (no suite sidebar).
 * Route: /app/collaborate/projects/new-ai?organizationId=
 */
export default function CreateProjectAiWizardPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const organizationId = String(params.get('organizationId') || params.get('orgId') || '').trim();

  const cancelTarget = organizationId
    ? `/app/collaborate/workspaces?organizationId=${encodeURIComponent(organizationId)}`
    : '/app/collaborate/workspaces';

  const onCancel = () => navigate(cancelTarget);

  const onCreated = (result) => {
    const project = result?.project || result;
    const projectId = String(project?._id || project?.projectId || result?.projectId || '').trim();
    const boardId = String(
      project?.defaultBoardId || result?.defaultBoardId || project?.boards?.[0]?._id || ''
    ).trim();
    if (organizationId && projectId) {
      navigate(buildCollaborateProjectHubPath(projectId, { organizationId, boardId }));
      return;
    }
    navigate(cancelTarget);
  };

  if (!organizationId) {
    return (
      <div className={wizardUi.emptyPage}>
        <p className="text-sm text-muted-foreground">
          {t('organizations.selectOrgFirst') || 'Chọn organization trước khi tạo dự án.'}
        </p>
        <Link to="/app/collaborate/workspaces" className={wizardUi.link}>
          {t('adminTasks.wizardBackToHub') || 'Back to workspaces'}
        </Link>
      </div>
    );
  }

  return (
    <CreateProjectAiWizard
      organizationId={organizationId}
      backLabel={t('adminTasks.wizardBackToHub') || 'Back to workspaces'}
      onCancel={onCancel}
      onCreated={onCreated}
    />
  );
}
