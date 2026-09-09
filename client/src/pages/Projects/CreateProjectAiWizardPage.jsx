import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import CreateProjectAiWizard from '../../features/projects/aiWizard/CreateProjectAiWizard';
import {
  buildCollaborateProjectHubPath,
  buildCollaborateProjectsPath,
} from '../../utils/suitePathUtils';
import { useAppStrings } from '../../locales/appStrings';
import { wizardUi } from '../../features/projects/wizard/projectWizardUi';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Full-viewport AI create-project page (no suite sidebar).
 * Route: /app/collaborate/projects/new-ai?organizationId=
 * Back / cancel → danh sách dự án (Projects Landing), không phải workspaces.
 */
export default function CreateProjectAiWizardPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  const organizationId = String(params.get('organizationId') || params.get('orgId') || '').trim();

  const cancelTarget = buildCollaborateProjectsPath(organizationId);
  const backLabel = t('adminTasks.wizardBackToAdmin') || 'Back to projects';

  const onCancel = () => navigate(cancelTarget);

  const onCreated = (result) => {
    if (organizationId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.listAll(organizationId),
      });
    }
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
        <Link to={buildCollaborateProjectsPath()} className={wizardUi.link}>
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <CreateProjectAiWizard
      organizationId={organizationId}
      backLabel={backLabel}
      onCancel={onCancel}
      onCreated={onCreated}
    />
  );
}
