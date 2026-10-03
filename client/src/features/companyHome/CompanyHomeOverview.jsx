import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  FileText,
  MessageCircle,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  FIGMA_DASH_AI_HERO,
  FIGMA_DASH_AI_HERO_GRID,
  FIGMA_DASH_AI_HERO_SUB,
  FIGMA_DASH_AI_HERO_TITLE,
  FIGMA_DASH_AI_STAT,
  FIGMA_DASH_AI_STAT_ICON,
  FIGMA_DASH_AI_STAT_STACK,
  FIGMA_DASH_INNER,
  FIGMA_DASH_LEVEL_1,
  FIGMA_DASH_LEVEL_2,
  FIGMA_DASH_PAGE,
  FIGMA_DASH_PANEL,
  FIGMA_DASH_PANEL_HEADER,
  FIGMA_DASH_PANEL_TITLE,
  FIGMA_DASH_PROGRESS_FILL,
  FIGMA_DASH_PROGRESS_TRACK,
  FIGMA_DASH_TWO_COL,
  FIGMA_DASH_WS_AVATAR,
  FIGMA_DASH_WS_ROW,
} from '../../components/Dashboard/figmaDashboardClasses';
import { METRIC_COLOR_MAP, getInitials } from '../../components/Dashboard/dashboardUiUtils';
import { useAppStrings } from '../../locales/appStrings';
import { buildCompanyChatPath } from '../../utils/suitePathUtils';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

/**
 * Department / team home — hero CTAs + scope + teams (khớp MENU CHÍNH).
 */
export default function CompanyHomeOverview({
  viewModel,
  organizationId,
  departmentId,
  paths,
  onRetry,
  isError,
  error,
}) {
  const { t } = useAppStrings();
  const { isTeam, title, subtitle, pulse, distribution, myTeams, docsKnown, documentDisplay, teamCount } =
    viewModel;

  const heroTip = isTeam ? t('nav.companyHomeHeroTipTeam') : t('nav.companyHomeHeroTipDept');

  return (
    <div className={FIGMA_DASH_PAGE}>
      <div className={FIGMA_DASH_INNER}>
        {isError ? (
          <div className={`${FIGMA_DASH_PANEL} flex flex-wrap items-center gap-3`} role="alert">
            <p className="m-0 flex-1 text-sm text-muted-foreground">
              {resolveApiErrorMessage(error, t('nav.companyHomeError'))}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              <RefreshCw size={14} aria-hidden />
              {t('nav.companyHomeRetry')}
            </button>
          </div>
        ) : null}

        <section className={FIGMA_DASH_LEVEL_1} aria-label={t('nav.companyHomeAriaOverview')}>
          <div className={FIGMA_DASH_AI_HERO}>
            <div className="pointer-events-none absolute -right-10 -top-[60px] h-[240px] w-[240px] rounded-full bg-primary/10 blur-2xl" />
            <div className="pointer-events-none absolute bottom-[-40px] left-[30%] h-[180px] w-[180px] rounded-full bg-success/10 blur-2xl" />
            <div className={FIGMA_DASH_AI_HERO_GRID}>
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface/70 px-2.5 py-1 text-[0.6875rem] font-semibold text-muted-foreground">
                  {isTeam ? (
                    <Users size={13} className="text-primary" aria-hidden />
                  ) : (
                    <Building2 size={13} className="text-primary" aria-hidden />
                  )}
                  {isTeam ? t('nav.companyLevelTeam') : t('nav.companyLevelDepartment')}
                </div>
                <h1 className={FIGMA_DASH_AI_HERO_TITLE}>{title}</h1>
                <p className={FIGMA_DASH_AI_HERO_SUB}>{subtitle}</p>
                <p className="mb-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{heroTip}</p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={paths.chatPath}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground no-underline shadow-sm transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <MessageCircle size={16} aria-hidden />
                    {t('nav.companyHomeOpenChat')}
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                  <Link
                    to={paths.docsPath}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground no-underline transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  >
                    <FileText size={16} aria-hidden />
                    {t('nav.documents')}
                  </Link>
                </div>
              </div>
              <div className={FIGMA_DASH_AI_STAT_STACK} aria-label={t('nav.companyHomeAriaKpi')}>
                {pulse.map((chip) => {
                  const tone =
                    chip.key === 'docs'
                      ? { wrap: 'bg-primary/15', icon: 'text-primary', value: 'text-primary' }
                      : { wrap: 'bg-success/15', icon: 'text-success', value: 'text-success' };
                  const Icon = chip.key === 'docs' ? FileText : Users;
                  return (
                    <div key={chip.key} className={FIGMA_DASH_AI_STAT}>
                      <div className={`${FIGMA_DASH_AI_STAT_ICON} ${tone.wrap}`}>
                        <Icon size={14} className={tone.icon} aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-base font-bold leading-none ${tone.value}`}>
                          {chip.value}
                        </div>
                        <div className="mt-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          {chip.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className={FIGMA_DASH_LEVEL_2} aria-label={t('nav.companyHomeAriaActions')}>
          <div className={FIGMA_DASH_TWO_COL}>
            <div className={FIGMA_DASH_PANEL}>
              <div className={FIGMA_DASH_PANEL_HEADER}>
                <h2 className={FIGMA_DASH_PANEL_TITLE}>{t('nav.companyHomeScopeChartTitle')}</h2>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-bold text-primary">
                  {t('nav.companyHomeScopeLive')}
                </span>
              </div>
              <p className="m-0 mb-4 text-xs leading-relaxed text-muted-foreground">
                {t('nav.companyHomeScopeChartSub')}
              </p>
              <ul className="m-0 list-none space-y-4 p-0">
                {distribution.map((row) => {
                  const pct = row.unknown
                    ? 0
                    : Math.round((Number(row.value) / Math.max(Number(row.max) || 1, 1)) * 100);
                  const barColor =
                    row.key === 'docs' ? METRIC_COLOR_MAP.open.color : METRIC_COLOR_MAP.friends.color;
                  return (
                    <li key={row.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-foreground">{row.label}</span>
                        <span className="tabular-nums font-bold text-foreground">
                          {row.unknown ? '—' : row.value}
                        </span>
                      </div>
                      <div className={`${FIGMA_DASH_PROGRESS_TRACK} h-2`} aria-hidden={row.unknown}>
                        <div
                          className={FIGMA_DASH_PROGRESS_FILL}
                          style={{
                            width: `${row.unknown ? 0 : Math.max(pct, row.value > 0 ? 8 : 0)}%`,
                            background: barColor,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
                <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-center">
                  <div className="text-lg font-bold tabular-nums text-foreground">{teamCount}</div>
                  <div className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('nav.companyHomePulseTeams')}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-center">
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {docsKnown ? documentDisplay : '—'}
                  </div>
                  <div className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('nav.companyHomePulseDocs')}
                  </div>
                </div>
              </div>
            </div>

            <div className={FIGMA_DASH_PANEL}>
              <div className={FIGMA_DASH_PANEL_HEADER}>
                <h2 className={FIGMA_DASH_PANEL_TITLE}>
                  <Users size={15} className="text-primary" aria-hidden />
                  {t('nav.companyHomeTeamsHeading')}
                </h2>
                <span className="text-xs font-semibold text-muted-foreground">{myTeams.length}</span>
              </div>
              {myTeams.length === 0 ? (
                <p className="m-0 rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-xs text-muted-foreground">
                  {t('nav.companyHomeTeamsEmpty')}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {myTeams.map((team) => (
                    <li key={team.id}>
                      <Link
                        to={buildCompanyChatPath(organizationId, {
                          departmentId,
                          teamId: team.id,
                          tab: 'chat',
                        })}
                        className={`${FIGMA_DASH_WS_ROW} no-underline`}
                      >
                        <span
                          className={FIGMA_DASH_WS_AVATAR}
                          style={{ background: METRIC_COLOR_MAP.friends.color }}
                          aria-hidden
                        >
                          {getInitials(team.name).slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {team.name}
                          </div>
                          <div className="truncate text-[0.6875rem] text-muted-foreground">
                            {t('nav.companyHomeTeamOpenChat')}
                          </div>
                        </div>
                        <ArrowRight
                          size={14}
                          className="shrink-0 text-muted-foreground/60"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 m-0 text-xs text-muted-foreground">{t('nav.companyHomeTeamsHint')}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
