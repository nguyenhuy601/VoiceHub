import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import projectAPI from '../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import ProjectHubChangeRequestsPanel from '../projects/hub/ProjectHubChangeRequestsPanel';
import { resolveHubCapabilities } from '../projects/hub/hubCaps';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrapProject(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Admin — Change Requests theo project (reuse Hub panel; không list org-wide).
 * Chỉ vỏ trang: picker, caps fail-closed, trạng thái tải.
 */
export default function TasksChangeRequestsPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const { isDarkMode } = useTheme();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [projectId, setProjectId] = useState('');
  const [projectRow, setProjectRow] = useState(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [boardCards, setBoardCards] = useState([]);
  const [boardCardsError, setBoardCardsError] = useState('');

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const onProjectIdChange = useCallback((id) => {
    setProjectId(String(id || '').trim());
  }, []);

  const loadProject = useCallback(async () => {
    const pid = String(projectId || '').trim();
    if (!pid) {
      setProjectRow(null);
      setProjectError('');
      setProjectLoading(false);
      return;
    }
    setProjectLoading(true);
    setProjectError('');
    setProjectRow(null);
    try {
      const res = await projectAPI.get(pid);
      setProjectRow(unwrapProject(res));
    } catch (error) {
      setProjectRow(null);
      setProjectError(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.crProjectLoadFail') })
      );
    } finally {
      setProjectLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const hubCaps = useMemo(
    () => resolveHubCapabilities(projectRow, { canManageFallback: false }),
    [projectRow]
  );
  const canCreate = Boolean(projectRow && hubCaps.canCreateChangeRequest);
  const canUpdate = Boolean(projectRow && hubCaps.canUpdateChangeRequest);
  const canDelete = Boolean(projectRow && hubCaps.canDeleteChangeRequest);
  const projectCode = String(projectRow?.projectCode || '').trim();

  const loadBoardCards = useCallback(async () => {
    const bid = String(boardId || '').trim();
    if (!bid) {
      setBoardCards([]);
      setBoardCardsError('');
      return;
    }
    try {
      const res = await taskAPI.getBoardDetail(bid, { organizationId: orgId });
      const data = unwrapTaskApiPayload(res);
      const list = Array.isArray(data?.cards)
        ? data.cards
        : Array.isArray(data?.tasks)
          ? data.tasks
          : [];
      setBoardCards(list.filter((c) => c?.isActive !== false));
      setBoardCardsError('');
    } catch (error) {
      setBoardCards([]);
      setBoardCardsError(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageLoadFail') })
      );
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    void loadBoardCards();
  }, [loadBoardCards]);

  let projectBody;
  if (!projectId) {
    projectBody = <AdminEmptyState message={t('adminTasks.crPickProject')} />;
  } else if (projectLoading) {
    projectBody = <AdminListSkeleton rows={6} />;
  } else if (projectError) {
    projectBody = (
      <AdminLoadErrorState message={projectError} onRetry={loadProject} disabled={projectLoading} />
    );
  } else {
    projectBody = (
      <div className="min-h-[24rem] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {boardCardsError ? (
          <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {boardCardsError}
          </p>
        ) : null}
        <ProjectHubChangeRequestsPanel
          key={projectId}
          projectId={projectId}
          listActive
          isDarkMode={isDarkMode}
          locale={locale}
          projectCode={projectCode}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          boardCards={boardCards}
          onRefreshBoard={boardId ? loadBoardCards : null}
        />
      </div>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.changeRequests')}
      hint={t('adminTasks.crHint')}
      wide
    >
      <AdminTaskBoardPicker
        orgId={orgId}
        boardId={boardId}
        onBoardIdChange={setBoardId}
        onProjectIdChange={onProjectIdChange}
      />
      {projectBody}
    </AdminUserPanelShell>
  );
}
