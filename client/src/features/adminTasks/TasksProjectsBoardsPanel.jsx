import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, MoreHorizontal, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
  adminManageLinkClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import { taskAPI } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import useAdminOrgBoards, {
  boardCodeOf,
  boardIdOf,
  boardTitleOf,
} from './useAdminOrgBoards';

const SEARCH_MAX_LENGTH = 100;

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

function BoardRowMenu({ id, board, busyId, onArchive, t, open, onToggle }) {
  return (
    <div className="relative inline-flex items-center gap-1">
      <Link
        to={`/app/admin/projects/settings?boardId=${encodeURIComponent(id)}`}
        className={adminManageLinkClass()}
      >
        {t('adminDomains.projects.settings')}
      </Link>
      <button
        type="button"
        className="rounded border border-border px-2 py-0.5 text-xs transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('adminTasks.moreActionsAria')}
        onClick={onToggle}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-border bg-card py-1 shadow-md">
          <Link
            to={`/app/admin/projects/project-team?boardId=${encodeURIComponent(id)}`}
            className="block px-3 py-1.5 text-xs hover:bg-muted"
            onClick={onToggle}
          >
            {t('adminTasks.openTeam')}
          </Link>
          <Link
            to={`/app/admin/projects/delegation?boardId=${encodeURIComponent(id)}`}
            className="block px-3 py-1.5 text-xs hover:bg-muted"
            onClick={onToggle}
          >
            {t('adminTasks.openDelegation')}
          </Link>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted disabled:opacity-50"
            disabled={Boolean(busyId)}
            aria-busy={busyId === id}
            onClick={() => {
              onToggle();
              onArchive(board);
            }}
          >
            {busyId === id ? <AdminBusySpinner busy /> : <Archive className="h-3.5 w-3.5" aria-hidden />}
            {t('adminTasks.archive')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function TasksProjectsBoardsPanel({ orgId }) {
  const { t } = useAppStrings();
  const { boards, loading, error, loadBoards } = useAdminOrgBoards(orgId);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [menuOpenId, setMenuOpenId] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);

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

  const loadError =
    error != null
      ? resolveApiErrorMessage(error, { t, fallback: t('adminTasks.boardsLoadFail') })
      : '';

  const requestArchive = (board) => {
    if (!boardIdOf(board) || busyId) return;
    setArchiveTarget(board);
  };

  const archiveBoard = async (board) => {
    const id = boardIdOf(board);
    if (!id || busyId) return;
    setBusyId(id);
    try {
      await taskAPI.archiveBoard(id, { organizationId: orgId });
      toast.success(t('adminTasks.boardsArchived'));
      await loadBoards();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('adminTasks.boardsArchiveFail') }));
    } finally {
      setBusyId('');
    }
  };

  const toggleMenu = (id) => {
    setMenuOpenId((prev) => (prev === id ? '' : id));
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.projects.overview')} hint={t('adminTasks.boardsHint')} wide>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="relative min-w-[12rem] max-w-md flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminTasks.boardsSearch')}
            aria-label={t('adminTasks.boardsSearch')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <AdminDenseTableCard>
        {loading && !boards.length && !loadError ? (
          <AdminListSkeleton rows={5} className="p-4" />
        ) : loadError ? (
          <AdminLoadErrorState
            className="px-4 py-6"
            message={loadError}
            disabled={loading}
            onRetry={() => loadBoards().catch(() => {})}
          />
        ) : (
          <>
            <AdminDenseTableScroll className="hidden md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
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
                      <tr key={id} className={adminDenseRowClass()}>
                        <td className="px-4 py-3 font-medium text-foreground">{boardTitleOf(board)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{boardCodeOf(board) || '—'}</td>
                        <td
                          className="px-4 py-3 text-muted-foreground"
                          title={boardScopeId(board) || undefined}
                        >
                          {scopeLabel(board, t)}
                        </td>
                        <td className="px-4 py-3">
                          <BoardRowMenu
                            id={id}
                            board={board}
                            busyId={busyId}
                            onArchive={requestArchive}
                            t={t}
                            open={menuOpenId === id}
                            onToggle={() => toggleMenu(id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminDenseTableScroll>

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
                    <div className="mt-2">
                      <BoardRowMenu
                        id={id}
                        board={board}
                        busyId={busyId}
                        onArchive={requestArchive}
                        t={t}
                        open={menuOpenId === id}
                        onToggle={() => toggleMenu(id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {!filtered.length ? (
              <AdminEmptyState message={t('adminTasks.boardsEmpty')} />
            ) : null}
          </>
        )}
      </AdminDenseTableCard>
      <ConfirmDialog
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveBoard(archiveTarget)}
        variant="danger"
        title={t('adminTasks.confirmTitle')}
        message={t('adminTasks.boardsArchiveConfirm', { name: archiveTarget ? boardTitleOf(archiveTarget) : '' })}
        confirmText={t('adminTasks.archive')}
        cancelText={t('adminTasks.cancel')}
      />
    </AdminUserPanelShell>
  );
}
