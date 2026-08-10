import { useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import CreateProjectWizard from '../../features/projects/CreateProjectWizard';
import { taskAPI } from '../../services/api/taskAPI';
import { buildCollaborateTasksPath } from '../../utils/suitePathUtils';
import { useAppStrings } from '../../locales/appStrings';
import { wizardUi } from '../../features/projects/wizard/projectWizardUi';

/**
 * Full-viewport create-project page (no suite sidebar).
 * Routes: /app/collaborate/projects/new?organizationId=
 *         /app/admin/projects/create?organizationId=
 */
export default function CreateProjectWizardPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const organizationId = String(params.get('organizationId') || params.get('orgId') || '').trim();
  const briefId = String(params.get('briefId') || '').trim();
  const fromParam = String(params.get('from') || '').trim().toLowerCase();
  const isAdmin =
    fromParam === 'admin' || String(location.pathname || '').startsWith('/app/admin/projects/create');

  const initialValues = useMemo(() => {
    const title = String(params.get('title') || '').trim();
    const description = String(params.get('description') || '').trim();
    const projectCode = String(params.get('projectCode') || '').trim();
    if (!title && !description && !projectCode) return null;
    return { title, description, projectCode, body: description };
  }, [params]);

  const cancelTarget = isAdmin
    ? '/app/admin/projects/boards'
    : organizationId
      ? `/app/collaborate/workspaces?organizationId=${encodeURIComponent(organizationId)}`
      : '/app/collaborate/workspaces';

  const onCancel = () => navigate(cancelTarget);

  const onCreated = async (result) => {
    const boardId = String(result?.defaultBoardId || result?.board?._id || result?._id || '').trim();
    const projectId = String(result?.projectId || result?._id || '').trim();

    if (briefId && boardId) {
      try {
        await taskAPI.acceptProjectBrief(briefId, { boardId });
      } catch {
        toast.error(t('taskBoard.briefAcceptFail') || 'Không liên kết được brief với board.');
      }
    }

    if (isAdmin) {
      navigate(
        boardId
          ? `/app/admin/projects/settings?boardId=${encodeURIComponent(boardId)}`
          : '/app/admin/projects/boards'
      );
      return;
    }
    if (organizationId) {
      navigate(buildCollaborateTasksPath(organizationId, { boardId, projectId }));
      return;
    }
    navigate('/app/collaborate/workspaces');
  };

  if (!organizationId) {
    return (
      <div className={wizardUi.emptyPage}>
        <p className="text-sm text-muted-foreground">
          {t('organizations.selectOrgFirst') || 'Chọn organization trước khi tạo dự án.'}
        </p>
        <Link
          to={isAdmin ? '/app/admin/projects/boards' : '/app/collaborate/workspaces'}
          className={wizardUi.link}
        >
          {isAdmin
            ? t('adminTasks.wizardBackToAdmin') || 'Back to projects'
            : t('adminTasks.wizardBackToHub') || 'Back to workspaces'}
        </Link>
      </div>
    );
  }

  return (
    <CreateProjectWizard
      organizationId={organizationId}
      variant={isAdmin ? 'admin' : 'collaborate'}
      initialValues={initialValues}
      resetKey={`${organizationId}-${briefId || 'x'}`}
      scopeLabel="ORG"
      backLabel={
        isAdmin
          ? t('adminTasks.wizardBackToAdmin') || 'Back to projects'
          : t('adminTasks.wizardBackToHub') || 'Back to workspaces'
      }
      onCancel={onCancel}
      onCreated={onCreated}
    />
  );
}
