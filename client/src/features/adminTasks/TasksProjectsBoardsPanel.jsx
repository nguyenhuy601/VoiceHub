import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { taskAPI } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildCollaborateProjectsNewPath } from '../../utils/suitePathUtils';
import useAdminOrgBoards, {
  boardCodeOf,
  boardIdOf,
  boardTitleOf,
} from './useAdminOrgBoards';

const SCOPE_TYPE_I18N = {
  organization: 'adminTasks.scopeCompany',
  department: 'adminTasks.scopeDepartment',
  team: 'adminTasks.scopeTeam',
  division: 'adminTasks.scopeDivision',
};

function boardScopeId(board) {
  return String(board?.scopeId || board?.teamId || '').trim();
}

function scopeLabel(board, t) {
  const type = String(board?.scopeType || '').trim().toLowerCase();
  if (!type) return '—';
  if (type === 'organization') {
    const translated = t(SCOPE_TYPE_I18N.organization);
    if (translated && translated !== SCOPE_TYPE_I18N.organization) return translated;
    return type;
  }
  const named = String(board?.scopeName || board?.departmentName || board?.teamName || '').trim();
  if (named) return named;
  const key = SCOPE_TYPE_I18N[type];
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return type;
}

export default function TasksProjectsBoardsPanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { boards, loading, loadBoards } = useAdminOrgBoards(orgId);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => {
      return (
        boardTitleOf(b).toLowerCase().includes(q) ||
        boardCodeOf(b).toLowerCase().includes(q) ||
        boardIdOf(b).toLowerCase().includes(q)
      );
    });
  }, [boards, query]);

  const archiveBoard = async (board) => {
    const id = boardIdOf(board);
    const name = boardTitleOf(board);
    if (!id || busyId) return;
    if (!window.confirm(t('adminTasks.boardsArchiveConfirm', { name }))) return;
    setBusyId(id);
    try {
      await taskAPI.archiveBoard(id, { organizationId: orgId });
      toast.success(t('adminTasks.boardsArchived'));
      await loadBoards();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.boardsArchiveFail') }));
    } finally {
      setBusyId('');
    }
  };

  const openCreate = () => {
    const id = String(orgId || '').trim();
    if (!id) {
      toast.error(t('organizations.selectOrgFirst') || 'Chọn organization trước.');
      return;
    }
    navigate(buildCollaborateProjectsNewPath(id, { from: 'admin' }));
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.projects.overview')} hint={t('adminTasks.boardsHint')} wide>
      <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="relative min-w-[12rem] max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('adminTasks.boardsSearch')}
                className={`${adminInputClass()} pl-9`}
              />
            </div>
            <button
              type="button"
              className={adminPrimaryBtnClass('inline-flex items-center gap-1.5')}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              {t('adminTasks.createOpen')}
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {loading ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">{t('adminTasks.colTitle')}</th>
                        <th className="px-4 py-3">{t('adminTasks.colCode')}</th>
                        <th className="px-4 py-3">{t('adminTasks.colScope')}</th>
                        <th className="px-4 py-3">{t('adminTasks.colActions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((board) => {
                        const id = boardIdOf(board);
                        return (
                          <tr key={id} className="border-b border-border/50 transition hover:bg-muted/20">
                            <td className="px-4 py-3 font-medium text-foreground">{boardTitleOf(board)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{boardCodeOf(board) || '—'}</td>
                            <td
                              className="px-4 py-3 text-muted-foreground"
                              title={boardScopeId(board) || undefined}
                            >
                              {scopeLabel(board, t)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  to={`/app/admin/projects/settings?boardId=${encodeURIComponent(id)}`}
                                  className={adminSecondaryBtnClass('!px-3 !py-1.5 text-xs')}
                                >
                                  {t('adminDomains.projects.settings')}
                                </Link>
                                <Link
                                  to={`/app/admin/projects/project-team?boardId=${encodeURIComponent(id)}`}
                                  className={adminSecondaryBtnClass('!px-3 !py-1.5 text-xs')}
                                >
                                  {t('adminTasks.openTeam')}
                                </Link>
                                <Link
                                  to={`/app/admin/projects/delegation?boardId=${encodeURIComponent(id)}`}
                                  className={adminSecondaryBtnClass('!px-3 !py-1.5 text-xs')}
                                >
                                  {t('adminTasks.openDelegation')}
                                </Link>
                                <button
                                  type="button"
                                  className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')}
                                  disabled={busyId === id}
                                  onClick={() => archiveBoard(board)}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                  {t('adminTasks.archive')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 p-3 md:hidden">
                  {filtered.map((board) => {
                    const id = boardIdOf(board);
                    return (
                      <div key={id} className="rounded-lg border border-border p-3">
                        <div className="font-medium">{boardTitleOf(board)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {boardCodeOf(board) || '—'} ·{' '}
                          <span title={boardScopeId(board) || undefined}>{scopeLabel(board, t)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link
                            to={`/app/admin/projects/settings?boardId=${encodeURIComponent(id)}`}
                            className={adminSecondaryBtnClass('!px-3 !py-1.5 text-xs')}
                          >
                            {t('adminDomains.projects.settings')}
                          </Link>
                          <Link
                            to={`/app/admin/projects/project-team?boardId=${encodeURIComponent(id)}`}
                            className={adminSecondaryBtnClass('!px-3 !py-1.5 text-xs')}
                          >
                            {t('adminTasks.openTeam')}
                          </Link>
                          <button
                            type="button"
                            className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')}
                            disabled={busyId === id}
                            onClick={() => archiveBoard(board)}
                          >
                            {t('adminTasks.archive')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!filtered.length ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground">{t('adminTasks.boardsEmpty')}</p>
                ) : null}
              </>
            )}
          </div>
        </>
    </AdminUserPanelShell>
  );
}
