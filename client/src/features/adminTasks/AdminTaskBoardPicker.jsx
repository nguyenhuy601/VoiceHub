import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminUserFormCard,
  adminInputClass,
  adminLabelClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import projectAPI from '../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { boardIdOf, boardTitleOf } from './useAdminOrgBoards';

function unwrapList(payload) {
  const body = payload?.data ?? payload;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.projects)) return body.projects;
  if (Array.isArray(body?.boards)) return body.boards;
  return [];
}

function unwrapBoardsPayload(payload) {
  const data = unwrapTaskApiPayload(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.boards)) return data.boards;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function projectIdOf(project) {
  return String(project?.projectId || project?._id || project?.id || '').trim();
}

function projectTitleOf(project) {
  return String(project?.title || project?.name || 'Untitled').trim();
}

function projectCodeOf(project) {
  return String(project?.projectCode || '').trim();
}

function boardsOfProject(project) {
  if (Array.isArray(project?.boards)) {
    return project.boards.filter((b) => b && b.isActive !== false);
  }
  return [];
}

/**
 * Cascade picker: Project → Board (boardId callback cho API board-scoped).
 */
export default function AdminTaskBoardPicker({
  orgId,
  boardId,
  onBoardIdChange,
  onProjectIdChange,
  boards: _boardsProp,
  loading: loadingProp,
}) {
  void _boardsProp;
  const { t } = useAppStrings();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [boards, setBoards] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [boardQuery, setBoardQuery] = useState('');
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);

  const loading = loadingProp ?? (loadingProjects || loadingBoards);

  useEffect(() => {
    if (typeof onProjectIdChange === 'function') {
      onProjectIdChange(String(projectId || '').trim());
    }
  }, [projectId, onProjectIdChange]);

  // Khi boardId / org đổi — resolve lại project từ deep-link.
  useEffect(() => {
    setDeepLinkResolved(false);
  }, [boardId, orgId]);

  useEffect(() => {
    const oid = String(orgId || '').trim();
    if (!oid) {
      setProjects([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoadingProjects(true);
      try {
        const res = await projectAPI.list({ organizationId: oid });
        if (!cancelled) setProjects(unwrapList(res));
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Deep-link: boardId → projectId (nested boards, else org board list)
  useEffect(() => {
    const bid = String(boardId || '').trim();
    if (!bid || deepLinkResolved) return undefined;
    if (!projects.length && loadingProjects) return undefined;

    for (const p of projects) {
      const match = boardsOfProject(p).find((b) => boardIdOf(b) === bid);
      if (match) {
        setProjectId(projectIdOf(p));
        setDeepLinkResolved(true);
        return undefined;
      }
    }

    const oid = String(orgId || '').trim();
    if (!oid) {
      setDeepLinkResolved(true);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoards({ organizationId: oid });
        const orgBoards = unwrapBoardsPayload(res);
        const hit = orgBoards.find((b) => boardIdOf(b) === bid);
        const pid = String(hit?.projectId || '').trim();
        if (!cancelled && pid) setProjectId(pid);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDeepLinkResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, projects, loadingProjects, orgId, deepLinkResolved]);

  // Load boards when project changes
  useEffect(() => {
    const pid = String(projectId || '').trim();
    if (!pid) {
      setBoards([]);
      return undefined;
    }
    const fromList = boardsOfProject(projects.find((p) => projectIdOf(p) === pid));
    if (fromList.length) {
      setBoards(fromList);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoadingBoards(true);
      try {
        const res = await projectAPI.listBoards(pid, orgId);
        const list = unwrapList(res).filter((b) => b && b.isActive !== false);
        if (!cancelled) setBoards(list);
      } catch {
        if (!cancelled) setBoards([]);
      } finally {
        if (!cancelled) setLoadingBoards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, projects, orgId]);

  // Clear board if it no longer belongs to selected project
  useEffect(() => {
    const bid = String(boardId || '').trim();
    const pid = String(projectId || '').trim();
    if (!bid || !pid || !boards.length) return;
    const stillThere = boards.some((b) => boardIdOf(b) === bid);
    if (!stillThere) onBoardIdChange?.('');
  }, [boards, boardId, projectId, onBoardIdChange]);

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const title = projectTitleOf(p).toLowerCase();
      const code = projectCodeOf(p).toLowerCase();
      const id = projectIdOf(p).toLowerCase();
      return title.includes(q) || code.includes(q) || id.includes(q);
    });
  }, [projects, projectQuery]);

  const filteredBoards = useMemo(() => {
    const q = boardQuery.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => {
      const title = boardTitleOf(b).toLowerCase();
      const id = boardIdOf(b).toLowerCase();
      return title.includes(q) || id.includes(q);
    });
  }, [boards, boardQuery]);

  const selectedProject = projects.find((p) => projectIdOf(p) === String(projectId || ''));
  const selectedBoard = boards.find((b) => boardIdOf(b) === String(boardId || ''));

  const onProjectChange = (nextProjectId) => {
    setProjectId(nextProjectId);
    setBoardQuery('');
    setDeepLinkResolved(true);
    if (boardId) onBoardIdChange?.('');
  };

  const onBoardChange = (nextBoardId) => {
    onBoardIdChange?.(nextBoardId);
  };

  return (
    <AdminUserFormCard title={t('adminTasks.pickProject')} hint={t('adminTasks.pickBoardHint')}>
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder={t('adminTasks.pickProjectPlaceholder')}
              className={`${adminInputClass()} pl-9`}
            />
          </div>
          <label className={adminLabelClass()}>
            {t('adminTasks.pickProject')}
            <select
              className={adminInputClass()}
              value={String(projectId || '')}
              onChange={(e) => onProjectChange(e.target.value)}
              disabled={loadingProjects}
            >
              <option value="">{t('adminTasks.needProject')}</option>
              {filteredProjects.map((p) => {
                const id = projectIdOf(p);
                const code = projectCodeOf(p);
                return (
                  <option key={id} value={id}>
                    {projectTitleOf(p)}
                    {code ? ` (${code})` : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {!loadingProjects && !filteredProjects.length ? (
            <p className="text-sm text-muted-foreground">{t('adminTasks.pickProjectEmpty')}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={boardQuery}
              onChange={(e) => setBoardQuery(e.target.value)}
              placeholder={t('adminTasks.pickBoardPlaceholder')}
              className={`${adminInputClass()} pl-9`}
              disabled={!projectId}
            />
          </div>
          <label className={adminLabelClass()}>
            {t('adminTasks.pickBoard')}
            <select
              className={adminInputClass()}
              value={String(boardId || '')}
              onChange={(e) => onBoardChange(e.target.value)}
              disabled={!projectId || loading}
            >
              <option value="">{t('adminTasks.needBoard')}</option>
              {filteredBoards.map((b) => {
                const id = boardIdOf(b);
                return (
                  <option key={id} value={id}>
                    {boardTitleOf(b)}
                  </option>
                );
              })}
            </select>
          </label>
          {projectId && !loading && !filteredBoards.length ? (
            <p className="text-sm text-muted-foreground">{t('adminTasks.pickBoardEmpty')}</p>
          ) : null}
        </div>

        {loading ? <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p> : null}

        {selectedProject || selectedBoard ? (
          <p className="text-xs text-muted-foreground">
            {selectedProject ? projectTitleOf(selectedProject) : null}
            {selectedProject && selectedBoard ? ' · ' : null}
            {selectedBoard ? boardTitleOf(selectedBoard) : null}
          </p>
        ) : null}
      </div>
    </AdminUserFormCard>
  );
}
