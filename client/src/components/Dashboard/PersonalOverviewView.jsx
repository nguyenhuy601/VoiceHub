import { useMemo } from 'react';
import {
  Building2,
  ChevronRight,
  FolderKanban,
  MapPin,
  Shield,
  Users,
} from 'lucide-react';
import UserAvatar from '../Shared/UserAvatar';
import { useAppStrings } from '../../locales/appStrings';
import { usePersonalOverviewData } from '../../features/personalOverview/usePersonalOverviewData';
import {
  labelForMembershipRole,
  labelForProjectRoleKey,
} from '../../features/personalOverview/personalOverviewUtils';
import { FIGMA_DASH_INNER, FIGMA_DASH_PAGE } from './figmaDashboardClasses';

function SectionCard({ title, hint, children, delayMs = 0, className = '' }) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface p-4 shadow-sm transition-[opacity,transform,box-shadow,border-color] duration-300 ease-out motion-reduce:transition-none motion-safe:animate-[povFadeIn_0.35s_ease-out_both] sm:p-5 ${className}`}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-label={title}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-[0.9375rem]">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted motion-reduce:animate-none ${className}`}
      aria-hidden
    />
  );
}

function PersonalOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="loading">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <SkeletonBlock className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-48 max-w-full" />
            <SkeletonBlock className="h-3.5 w-64 max-w-full" />
            <SkeletonBlock className="h-3.5 w-40 max-w-full" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SkeletonBlock className="h-36 w-full rounded-xl" />
        <SkeletonBlock className="h-36 w-full rounded-xl" />
      </div>
      <SkeletonBlock className="h-48 w-full rounded-xl" />
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-foreground">{value || '—'}</div>
      </div>
    </div>
  );
}

/**
 * Tổng quan cá nhân — enterprise layout (suite /app/me/dashboard).
 */
export default function PersonalOverviewView({ onNavigate }) {
  const { t } = useAppStrings();
  const {
    loading,
    displayProfile,
    orgMeta,
    placement,
    orgRoles,
    myProjects,
    errors,
  } = usePersonalOverviewData();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = displayProfile.displayName || '';
    if (hour >= 5 && hour < 11) return t('dashboard.greetingMorning', { name });
    if (hour >= 11 && hour < 13) return t('dashboard.greetingNoon', { name });
    if (hour >= 13 && hour < 17) return t('dashboard.greetingAfternoon', { name });
    if (hour >= 17 && hour < 22) return t('dashboard.greetingEvening', { name });
    return t('dashboard.greetingLate', { name });
  }, [displayProfile.displayName, t]);

  const openProject = (project) => {
    const pid = project?.projectId;
    if (!pid || !onNavigate) return;
    onNavigate(
      `/app/collaborate/workspaces?projectId=${encodeURIComponent(pid)}${
        orgMeta.orgId ? `&organizationId=${encodeURIComponent(orgMeta.orgId)}` : ''
      }`
    );
  };

  return (
    <div className={FIGMA_DASH_PAGE}>
      <style>{`
        @keyframes povFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes povFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
      <div className={FIGMA_DASH_INNER}>
        <div className="mb-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('dashboard.personalPageEyebrow')}
          </p>
          <h1 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {t('dashboard.personalPageTitle')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('dashboard.personalPageHint')}
          </p>
        </div>

        {loading ? (
          <PersonalOverviewSkeleton />
        ) : (
          <div className="flex flex-col gap-4">
            <section
              className="rounded-xl border border-border bg-surface p-4 shadow-sm transition-[opacity,transform] duration-300 motion-safe:animate-[povFadeIn_0.35s_ease-out_both] sm:p-5"
              style={{ animationDelay: '0ms' }}
              aria-label={t('dashboard.personalProfileTitle')}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                <UserAvatar
                  avatar={displayProfile.avatar}
                  userId={displayProfile.userId}
                  name={displayProfile.displayName}
                  size="lg"
                  className="h-14 w-14 shrink-0 text-base"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{greeting}</p>
                  <h2 className="mt-0.5 truncate text-lg font-semibold text-foreground sm:text-xl">
                    {displayProfile.displayName}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {displayProfile.email ? <span className="truncate">{displayProfile.email}</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Building2 size={13} className="shrink-0" aria-hidden />
                    <span className="font-medium text-foreground">{orgMeta.orgName}</span>
                    {orgMeta.membershipRole ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {labelForMembershipRole(orgMeta.membershipRole, t)}
                          {orgMeta.myStructureRole
                            ? ` · ${orgMeta.myStructureRole}`
                            : ''}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate?.('/app/me/settings')}
                  className="inline-flex h-10 min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {t('dashboard.personalOpenSettings')}
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>
              {errors.profile ? (
                <p className="mt-3 text-xs text-destructive">{t('dashboard.personalProfileError')}</p>
              ) : null}
            </section>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SectionCard
                title={t('dashboard.personalPlacementTitle')}
                hint={t('dashboard.personalPlacementHint')}
                delayMs={60}
              >
                {errors.shell ? (
                  <p className="text-sm text-destructive">{t('dashboard.personalPlacementError')}</p>
                ) : !placement.departmentId && !placement.teamId ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-center">
                    <p className="text-sm text-muted-foreground">{t('dashboard.personalPlacementEmpty')}</p>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('/app/collaborate/workspaces')}
                      className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {t('dashboard.personalGoWorkspaces')}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    <MetaRow
                      icon={MapPin}
                      label={t('dashboard.personalDepartment')}
                      value={placement.departmentName || t('dashboard.personalUnassigned')}
                    />
                    <MetaRow
                      icon={Users}
                      label={t('dashboard.personalTeam')}
                      value={placement.teamName || t('dashboard.personalUnassigned')}
                    />
                    {placement.divisionName ? (
                      <MetaRow
                        icon={Building2}
                        label={t('dashboard.personalDivision')}
                        value={placement.divisionName}
                      />
                    ) : null}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title={t('dashboard.personalOrgRolesTitle')}
                hint={t('dashboard.personalOrgRolesHint')}
                delayMs={120}
              >
                {errors.assignments && !orgRoles.length ? (
                  <p className="text-sm text-muted-foreground">{t('dashboard.personalOrgRolesError')}</p>
                ) : !orgRoles.length ? (
                  <p className="text-sm text-muted-foreground">{t('dashboard.personalOrgRolesEmpty')}</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {orgRoles.map((role) => (
                      <li
                        key={role.id}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-foreground"
                      >
                        <Shield size={12} className="shrink-0 text-primary" aria-hidden />
                        <span className="truncate">{role.label}</span>
                        {role.scopeName ? (
                          <span className="truncate text-muted-foreground">· {role.scopeName}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            <SectionCard
              title={t('dashboard.personalProjectsTitle')}
              hint={t('dashboard.personalProjectsHint')}
              delayMs={180}
            >
              {errors.projects ? (
                <p className="text-sm text-destructive">{t('dashboard.personalProjectsError')}</p>
              ) : !myProjects.length ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-6 text-center">
                  <FolderKanban className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm text-muted-foreground">{t('dashboard.personalProjectsEmpty')}</p>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('/app/collaborate/workspaces')}
                    className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {t('dashboard.personalGoWorkspaces')}
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {myProjects.map((project) => (
                    <li key={project.projectId}>
                      <button
                        type="button"
                        onClick={() => openProject(project)}
                        className="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-[background-color,box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:hover:translate-y-0"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <FolderKanban size={18} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                            {project.title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {project.projectCode ? <span>{project.projectCode}</span> : null}
                            {project.projectRoleKeys.length ? (
                              <span className="truncate">
                                {project.projectRoleKeys.map(labelForProjectRoleKey).join(', ')}
                              </span>
                            ) : (
                              <span>{t('dashboard.personalProjectMember')}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-muted-foreground opacity-60 transition group-hover:opacity-100 group-hover:text-primary"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}
