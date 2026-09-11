import { Link } from 'react-router-dom';
import { Building2, Calendar, FileText, MessageCircle, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { useSpace } from '../../context/SpaceContext';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import {
  COMPANY_SPACE_LEVEL,
  listMyTeamsFromShell,
  resolveDepartmentLabel,
  resolveTeamLabel,
} from '../../utils/companySpaceLevel';
import {
  buildCompanyCalendarPath,
  buildCompanyChatPath,
  buildCompanyDocumentsPath,
  buildCompanyWorkspacePath,
} from '../../utils/suitePathUtils';
import {
  FIGMA_PAGE_INNER,
  FIGMA_PAGE_SHELL,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
  FIGMA_PAGE_CARD_PAD,
} from '../../components/Layout/figmaPageClasses';

/** Trang chủ phòng ban (hoặc team khi level=team). */
export default function DepartmentHomePage() {
  const { t } = useAppStrings();
  const space = useSpace();
  const organizationId = space?.organizationId || '';
  const departmentId = space?.departmentId || '';
  const teamId = space?.teamId || '';
  const level = space?.level || COMPANY_SPACE_LEVEL.DEPARTMENT;
  const isTeam = level === COMPANY_SPACE_LEVEL.TEAM && Boolean(teamId);

  const shellQuery = useOrgShell(organizationId, { enabled: Boolean(organizationId) });
  const shell = shellQuery.data || null;

  const deptName = resolveDepartmentLabel(shell, departmentId) || t('nav.companyHome');
  const teamName = resolveTeamLabel(shell, teamId);
  const myTeams = listMyTeamsFromShell(shell, departmentId);

  const title = isTeam ? teamName || t('nav.companyLevelTeam') : deptName;
  const subtitle = isTeam
    ? t('nav.companyHomeTeamSub', { department: deptName })
    : t('nav.companyHomeDeptSub');

  const chatPath = buildCompanyChatPath(organizationId, {
    departmentId,
    teamId: isTeam ? teamId : '',
    // Dept: same announcement channel as sidebar Hội thoại; chat module shows message UI directly.
    tab: isTeam ? 'chat' : 'announcement',
  });
  const docsPath = buildCompanyDocumentsPath(organizationId, {
    departmentId,
    teamId: isTeam ? teamId : '',
  });
  const calPath = buildCompanyCalendarPath(organizationId, { departmentId });
  const workspacesPath = buildCompanyWorkspacePath({ organizationId, departmentId });

  if (shellQuery.isLoading) {
    return (
      <div className={FIGMA_PAGE_SHELL}>
        <div className={FIGMA_PAGE_INNER}>
          <p className={FIGMA_PAGE_SUBTITLE}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!departmentId) {
    return (
      <div className={FIGMA_PAGE_SHELL}>
        <div className={FIGMA_PAGE_INNER}>
          <h1 className={FIGMA_PAGE_TITLE}>{t('nav.companyHome')}</h1>
          <p className={FIGMA_PAGE_SUBTITLE}>{t('nav.companyHomeNoDepartment')}</p>
          <Link
            to={workspacesPath}
            className="mt-3 inline-flex w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t('nav.companyWorkspaces')}
          </Link>
        </div>
      </div>
    );
  }

  const quickLinks = [
    {
      key: 'chat',
      to: chatPath,
      icon: MessageCircle,
      label: t('nav.messages'),
      hint: isTeam ? t('nav.companyQuickChatTeam') : t('nav.companyQuickChatDept'),
    },
    {
      key: 'documents',
      to: docsPath,
      icon: FileText,
      label: t('nav.documents'),
      hint: t('nav.companyQuickDocs'),
    },
    {
      key: 'calendar',
      to: calPath,
      icon: Calendar,
      label: t('nav.calendar'),
      hint: t('nav.companyQuickCalendar'),
    },
  ];

  return (
    <div className={FIGMA_PAGE_SHELL}>
      <div className={FIGMA_PAGE_INNER}>
        <header className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            {isTeam ? <Users size={22} /> : <Building2 size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className={FIGMA_PAGE_TITLE}>{title}</h1>
            <p className={FIGMA_PAGE_SUBTITLE}>{subtitle}</p>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} to={item.to} className={`${FIGMA_PAGE_CARD_PAD} block no-underline`}>
                <div className="flex items-center gap-2 text-foreground">
                  <Icon size={16} className="text-primary" />
                  <span className="text-sm font-semibold">{item.label}</span>
                </div>
                <p className="mt-1.5 m-0 text-xs text-muted-foreground">{item.hint}</p>
              </Link>
            );
          })}
        </section>

        {!isTeam && myTeams.length > 0 ? (
          <section className={FIGMA_PAGE_CARD_PAD}>
            <h2 className="m-0 text-sm font-semibold text-foreground">
              {t('nav.companyHomeTeamsHeading')}
            </h2>
            <ul className="mt-2 m-0 list-none space-y-1 p-0">
              {myTeams.map((team) => (
                <li key={team.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users size={14} className="shrink-0 text-primary" />
                  <span className="truncate text-foreground">{team.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 m-0 text-xs text-muted-foreground">
              {t('nav.companyHomeTeamsHint')}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
