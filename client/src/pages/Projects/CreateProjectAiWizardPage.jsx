import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useEffect, useRef } from 'react';
import CreateProjectAiWizard from '../../features/projects/aiWizard/CreateProjectAiWizard';
import {
  buildCollaborateProjectsPath,
  buildProjectsModulePath,
  buildProjectsPickerPath,
} from '../../utils/suitePathUtils';
import { useAppStrings } from '../../locales/appStrings';
import { wizardUi } from '../../features/projects/wizard/projectWizardUi';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Phase 2 Option B — AI SRS on an existing Phase 1 project.
 * Route: /app/projects/new-ai?organizationId=&projectId=&packId=
 * Without projectId → redirect picker (Pack is SRS, not create birth).
 */
export default function CreateProjectAiWizardPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const hintedRef = useRef(false);

  const organizationId = String(params.get('organizationId') || params.get('orgId') || '').trim();
  const projectId = String(params.get('projectId') || '').trim();
  const packId = String(params.get('packId') || '').trim();

  useEffect(() => {
    if (projectId || hintedRef.current) return;
    hintedRef.current = true;
    toast(t('workspace.phase2AiNeedsProject') || 'AI từ Excel SRS chạy trên dự án Phase 1 đã sẵn sàng gate — không tạo dự án mới.');
  }, [projectId, t]);

  if (!organizationId) {
    return (
      <div className={wizardUi.emptyPage}>
        <p className="text-sm text-muted-foreground">
          {t('organizations.selectOrgFirst') || 'Chọn organization trước khi tạo dự án.'}
        </p>
        <Link to={buildCollaborateProjectsPath()} className={wizardUi.link}>
          {t('adminTasks.wizardBackToAdmin') || 'Back to projects'}
        </Link>
      </div>
    );
  }

  if (!projectId) {
    return <Navigate to={buildProjectsPickerPath(organizationId)} replace />;
  }

  const cancelTarget = buildProjectsModulePath(projectId, 'overview', { organizationId });
  const backLabel = t('workspace.phase2AiBackToProject') || 'Back to project';

  const onCancel = () => navigate(cancelTarget);

  const onCreated = (result) => {
    if (organizationId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.listAll(organizationId),
      });
    }
    const pid = String(
      result?.projectId || result?.project?._id || projectId || ''
    ).trim();
    const boardId = String(
      result?.defaultBoardId ||
        result?.project?.defaultBoardId ||
        result?.boardId ||
        ''
    ).trim();
    navigate(
      buildProjectsModulePath(pid, 'overview', {
        organizationId,
        boardId,
      })
    );
  };

  return (
    <CreateProjectAiWizard
      organizationId={organizationId}
      existingProjectId={projectId}
      initialPackId={packId}
      backLabel={backLabel}
      onCancel={onCancel}
      onCreated={onCreated}
    />
  );
}
