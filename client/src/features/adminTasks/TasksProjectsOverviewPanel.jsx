import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useOrgProjectsList from '../../hooks/useOrgProjectsList';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { formatHubProjectStatus } from '../projects/hub/projectHubUtils';

import { filterAdminProjects } from './filterAdminProjects';

const SCROLL_PAGE_SIZE = 20;

const PROJECT_STATUS_FILTER_OPTIONS = [
  'draft',
  'ready',
  'in_development',
  'qa_uat',
  'release_handover',
  'on_hold',
  'closed',
];

const SCOPE_TYPE_I18N = {
  organization: 'adminTasks.scopeCompany',
  department: 'adminTasks.scopeDepartment',
  team: 'adminTasks.scopeTeam',
  division: 'adminTasks.scopeDivision',
};

function projectIdOf(project) {
  return String(project?._id || project?.projectId || project?.id || '').trim();
}

function projectTitleOf(project) {
  return String(project?.title || project?.name || '').trim() || 'Untitled';
}

function projectCodeOf(project) {
  return String(project?.projectCode || '').trim();
}

function projectStatusOf(project) {
  return String(project?.status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function projectBoardIdOf(project) {
  const fromDefault = String(project?.defaultBoardId || '').trim();
  if (fromDefault) return fromDefault;
  const boards = Array.isArray(project?.boards) ? project.boards : [];
  const first = boards.find((b) => b && b.isActive !== false) || boards[0];
  return String(first?._id || first?.id || '').trim();
}

function projectScopeId(project) {
  return String(project?.scopeId || project?.teamId || '').trim();
}

function scopeLabel(project, t) {
  const type = String(project?.scopeType || '').trim().toLowerCase();
  if (!type) return '—';
  if (type === 'organization') {
    const translated = t(SCOPE_TYPE_I18N.organization);
    if (translated && translated !== SCOPE_TYPE_I18N.organization) return translated;
    return type;
  }
  const named = String(project?.scopeName || project?.departmentName || project?.teamName || '').trim();
  if (named) return named;
  const key = SCOPE_TYPE_I18N[type];
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return type;
}

function statusLabel(project, t) {
  const raw = projectStatusOf(project);
  if (!raw) return '—';
  return formatHubProjectStatus(raw, t) || raw;
}

function ProjectActionLinks({ boardId, busy, onArchive, t }) {
  const hasBoard = Boolean(boardId);
  const linkClass = adminSecondaryBtnClass('!px-3 !py-1.5 text-xs');
  return (
    <div className="flex flex-wrap gap-2">
      {hasBoard ? (
        <>
          <Link
            to={`/app/admin/projects/settings?boardId=${encodeURIComponent(boardId)}`}
            className={linkClass}
          >
            {t('adminDomains.projects.settings')}
          </Link>
          <Link
            to={`/app/admin/projects/project-team?boardId=${encodeURIComponent(boardId)}`}
            className={linkClass}
          >
            {t('adminTasks.openTeam')}
          </Link>
          <Link
            to={`/app/admin/projects/delegation?boardId=${encodeURIComponent(boardId)}`}
            className={linkClass}
          >
            {t('adminTasks.openDelegation')}
          </Link>
        </>
      ) : null}
      <button
        type="button"
        className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')}
        disabled={busy}
        onClick={onArchive}
      >
        <Archive className="h-3.5 w-3.5" />
        {t('adminTasks.archive')}
      </button>
    </div>
  );
}

export default function TasksProjectsOverviewPanel({ orgId }) {
  const { t } = useAppStrings();
  const { projects, loading, reload } = useOrgProjectsList(orgId, { view: '' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState('');
  const [visibleCount, setVisibleCount] = useState(SCROLL_PAGE_SIZE);
  const scrollRootRef = useRef(null);
  const sentinelRef = useRef(null);

  const filtered = useMemo(
    () => filterAdminProjects(projects, { q: query, status: statusFilter }),
    [projects, query, statusFilter]
  );

  useEffect(() => {
    setVisibleCount(SCROLL_PAGE_SIZE);
  }, [query, statusFilter, projects.length]);

  const visibleRows = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    if (!hasMore) return undefined;
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + SCROLL_PAGE_SIZE, filtered.length));
        }
      },
      { root, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, filtered.length, visibleCount]);

  const archiveProject = async (project) => {
    const id = projectIdOf(project);
    const name = projectTitleOf(project);
    if (!id || busyId) return;
    if (!window.confirm(t('adminTasks.projectsArchiveConfirm', { name }))) return;
    setBusyId(id);
    try {
      await projectAPI.archive(id);
      toast.success(t('adminTasks.projectsArchived'));
      await reload();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.projectsArchiveFail') })
      );
    } finally {
      setBusyId('');
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.overview')}
      hint={t('adminTasks.projectsOverviewHint')}
      wide
    >
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
          <div className="min-w-[11rem] max-w-xs flex-1 sm:flex-none">
            <label className="sr-only" htmlFor="admin-projects-status-filter">
              {t('adminTasks.colProjectStatus')}
            </label>
            <select
              id="admin-projects-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={adminInputClass()}
            >
              <option value="">{t('adminTasks.statusFilterAll')}</option>
              {PROJECT_STATUS_FILTER_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {formatHubProjectStatus(status, t) || status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {loading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
          ) : (
            <>
              <div
                ref={scrollRootRef}
                className="hidden max-h-[min(32rem,calc(100dvh-16rem))] overflow-auto md:block"
              >
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 z-[1] border-b border-border bg-muted/90 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                      <th className="px-4 py-3">{t('adminTasks.colTitle')}</th>
                      <th className="px-4 py-3">{t('adminTasks.colCode')}</th>
                      <th className="px-4 py-3">{t('adminTasks.colScope')}</th>
                      <th className="px-4 py-3">{t('adminTasks.colProjectStatus')}</th>
                      <th className="px-4 py-3">{t('adminTasks.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((project) => {
                      const id = projectIdOf(project);
                      const boardId = projectBoardIdOf(project);
                      return (
                        <tr
                          key={id}
                          className="border-b border-border/50 transition hover:bg-muted/20"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            {projectTitleOf(project)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {projectCodeOf(project) || '—'}
                          </td>
                          <td
                            className="px-4 py-3 text-muted-foreground"
                            title={projectScopeId(project) || undefined}
                          >
                            {scopeLabel(project, t)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {statusLabel(project, t)}
                          </td>
                          <td className="px-4 py-3">
                            <ProjectActionLinks
                              boardId={boardId}
                              busy={busyId === id}
                              onArchive={() => archiveProject(project)}
                              t={t}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hasMore ? (
                  <div
                    ref={sentinelRef}
                    className="px-4 py-3 text-center text-xs text-muted-foreground"
                  >
                    {t('common.loadMore')}
                  </div>
                ) : null}
              </div>

              <div
                className="max-h-[min(32rem,calc(100dvh-16rem))] space-y-3 overflow-auto p-3 md:hidden"
              >
                {visibleRows.map((project) => {
                  const id = projectIdOf(project);
                  const boardId = projectBoardIdOf(project);
                  return (
                    <div key={id} className="rounded-lg border border-border p-3">
                      <div className="font-medium">{projectTitleOf(project)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {projectCodeOf(project) || '—'} ·{' '}
                        <span title={projectScopeId(project) || undefined}>
                          {scopeLabel(project, t)}
                        </span>{' '}
                        · {statusLabel(project, t)}
                      </div>
                      <div className="mt-2">
                        <ProjectActionLinks
                          boardId={boardId}
                          busy={busyId === id}
                          onArchive={() => archiveProject(project)}
                          t={t}
                        />
                      </div>
                    </div>
                  );
                })}
                {hasMore ? (
                  <button
                    type="button"
                    className={`${adminSecondaryBtnClass()} w-full text-xs`}
                    onClick={() =>
                      setVisibleCount((n) => Math.min(n + SCROLL_PAGE_SIZE, filtered.length))
                    }
                  >
                    {t('common.loadMore')}
                  </button>
                ) : null}
              </div>

              {!filtered.length ? (
                <p className="px-4 py-8 text-sm text-muted-foreground">
                  {t('adminTasks.projectsEmpty')}
                </p>
              ) : null}
            </>
          )}
        </div>
      </>
    </AdminUserPanelShell>
  );
}
