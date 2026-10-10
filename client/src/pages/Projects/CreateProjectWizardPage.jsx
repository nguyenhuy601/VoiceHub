import { useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import CreateProjectWizard from '../../features/projects/CreateProjectWizard';
import { taskAPI } from '../../services/api/taskAPI';
import {
  buildProjectsModulePath,
  buildProjectsAiHitlPath,
  buildProjectsPickerPath,
  buildCollaborateRequirementsPath,
  readStoredLastOrganizationId,
} from '../../utils/suitePathUtils';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppStrings } from '../../locales/appStrings';
import { wizardUi } from '../../features/projects/wizard/projectWizardUi';
import { queryKeys } from '../../lib/queryKeys';
import useTaskWorkspaceScope from '../../hooks/useTaskWorkspaceScope';

/**
 * Full-viewport create-project page (no suite sidebar).
 * Route: /app/projects/new — org from WorkspaceContext (single-company).
 * Wave1 B: no startWhat dialog — Overview uses Understanding prepare.
 */
export default function CreateProjectWizardPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { company, activeWorkspace, lastOrganizationId } = useWorkspace();
  const deniedToastRef = useRef(false);

  const organizationId = useMemo(() => {
    const fromQuery = String(params.get('organizationId') || params.get('orgId') || '').trim();
    if (fromQuery) return fromQuery;
    return String(
      company?.id ||
        company?._id ||
        activeWorkspace?._id ||
        activeWorkspace?.id ||
        lastOrganizationId ||
        readStoredLastOrganizationId() ||
        ''
    ).trim();
  }, [params, company, activeWorkspace, lastOrganizationId]);

  const { canCreateProjectCapability, loading: scopeLoading } =
    useTaskWorkspaceScope(organizationId);

  const briefId = String(params.get('briefId') || '').trim();
  const projectsPickerPath = buildProjectsPickerPath();

  const initialValues = useMemo(() => {
    const title = String(params.get('title') || '').trim();
    const description = String(params.get('description') || '').trim();
    const projectCode = String(params.get('projectCode') || '').trim();
    const analysisMode = String(params.get('analysisMode') || '').trim().toLowerCase();
    const mode = analysisMode === 'ai' || analysisMode === 'manual' ? analysisMode : '';
    if (!title && !description && !projectCode && !mode) return null;
    return {
      title,
      description,
      projectCode,
      body: description,
      ...(mode ? { analysisMode: mode } : {}),
    };
  }, [params]);

  useEffect(() => {
    if (!organizationId || scopeLoading || canCreateProjectCapability) return;
    if (deniedToastRef.current) return;
    deniedToastRef.current = true;
    toast.error(t('taskBoard.createProjectDenied'));
  }, [organizationId, scopeLoading, canCreateProjectCapability, t]);

  const onCancel = () => navigate(projectsPickerPath);

  const goPhase1Overview = ({ projectId, boardId, packId }) => {
    navigate(
      buildProjectsModulePath(projectId, 'overview', {
        boardId,
        ...(packId ? { packId } : {}),
      }),
      { replace: true }
    );
  };

  const goAiHitl = ({ projectId, boardId, packId }) => {
    navigate(
      buildProjectsAiHitlPath(projectId, {
        boardId,
        ...(packId ? { packId } : {}),
        startWhat: '1',
      }),
      { replace: true }
    );
  };

  const onCreated = async (result) => {
    if (result?._hitlIncomplete && !result?.projectId) {
      return;
    }

    const packId = String(result?.packId || result?.pack?._id || '').trim();
    const boardId = String(result?.defaultBoardId || result?.board?._id || '').trim();
    const projectId = String(result?.projectId || result?._id || '').trim();
    const analysisMode = String(result?.analysisMode || '').trim().toLowerCase();

    // Navigate first so overlay stays until this page unmounts (no wizard flash).
    if (projectId && analysisMode === 'ai') {
      goAiHitl({ projectId, boardId, packId });
    } else if (projectId) {
      goPhase1Overview({ projectId, boardId, packId });
    } else if (packId) {
      navigate(buildCollaborateRequirementsPath(organizationId, { packId }), { replace: true });
    } else {
      navigate(projectsPickerPath, { replace: true });
    }

    if (organizationId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.listAll(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.requirements?.packs?.(organizationId) || ['requirements', organizationId],
      });
    }

    if (briefId && boardId) {
      try {
        await taskAPI.acceptProjectBrief(briefId, { boardId });
      } catch {
        toast.error(t('taskBoard.briefAcceptFail') || 'Không liên kết được brief với board.');
      }
    }
  };

  if (!organizationId) {
    return (
      <div className={wizardUi.emptyPage}>
        <p className="text-sm text-muted-foreground">
          {t('organizations.selectOrgFirst') || 'Chọn organization trước khi tạo dự án.'}
        </p>
        <Link to={projectsPickerPath} className={wizardUi.link}>
          {t('adminTasks.wizardBackToHub') || 'Back to workspaces'}
        </Link>
      </div>
    );
  }

  if (scopeLoading) {
    return (
      <div className={wizardUi.emptyPage}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!canCreateProjectCapability) {
    return <Navigate to={projectsPickerPath} replace />;
  }

  return (
    <CreateProjectWizard
      organizationId={organizationId}
      variant="collaborate"
      initialValues={initialValues}
      resetKey={`${organizationId}-${briefId || 'x'}`}
      scopeLabel="ORG"
      backLabel={t('adminTasks.wizardBackToHub') || 'Back to workspaces'}
      onCancel={onCancel}
      onCreated={onCreated}
    />
  );
}
