import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import ProjectHubChangeRequestsPanel from '../../components/Organization/ProjectHub/ProjectHubChangeRequestsPanel';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import projectAPI from '../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrapProject(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Admin — Change Requests theo project (reuse Hub panel; không list org-wide).
 */
export default function TasksChangeRequestsPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const { isDarkMode } = useTheme();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [projectId, setProjectId] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [boardCards, setBoardCards] = useState([]);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const onProjectIdChange = useCallback((id) => {
    setProjectId(String(id || '').trim());
  }, []);

  useEffect(() => {
    const pid = String(projectId || '').trim();
    if (!pid) {
      setProjectCode('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.get(pid);
        const data = unwrapProject(res);
        if (!cancelled) setProjectCode(String(data?.projectCode || '').trim());
      } catch {
        if (!cancelled) setProjectCode('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const loadBoardCards = useCallback(async () => {
    const bid = String(boardId || '').trim();
    if (!bid) {
      setBoardCards([]);
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
    } catch (error) {
      setBoardCards([]);
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageLoadFail') }));
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    void loadBoardCards();
  }, [loadBoardCards]);

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

      {!projectId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.crPickProject')}</p>
      ) : (
        <div className="min-h-[24rem] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ProjectHubChangeRequestsPanel
            key={projectId}
            projectId={projectId}
            listActive
            isDarkMode={isDarkMode}
            locale={locale}
            projectCode={projectCode}
            canCreate
            canUpdate
            canDelete
            boardCards={boardCards}
            onRefreshBoard={boardId ? loadBoardCards : null}
          />
        </div>
      )}
    </AdminUserPanelShell>
  );
}
