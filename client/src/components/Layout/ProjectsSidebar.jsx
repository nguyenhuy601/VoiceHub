import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  List,
  MessageCircle,
  Plus,
  Settings,
  Users,
  GanttChart,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { useWorkspaceSuite, SUITE } from '../../context/WorkspaceSuiteContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useShellLayout } from '../../context/ShellLayoutContext';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import {
  FIGMA_SIDEBAR,
  FIGMA_SIDEBAR_COLLAPSED,
  FIGMA_SIDEBAR_EXPANDED,
  FIGMA_SIDEBAR_EXPAND_BTN,
  FIGMA_SIDEBAR_FOOTER,
  FIGMA_SIDEBAR_NAV,
  FIGMA_SIDEBAR_SECTION_LABEL,
  FIGMA_SIDEBAR_SUITE_STRIP,
  SUITE_COLORS,
  figmaNavItemBg,
  figmaNavItemClass,
} from './figmaShellClasses';
import {
  getProjectMenuGroupLabelKey,
  getProjectsPostSelectNavItems,
  getProjectsPreSelectNavItems,
  normalizeProjectModule,
  PROJECT_MENU_GROUPS,
} from '../../utils/suiteNavConfig';
import {
  boardQueryFromSearch,
  buildProjectsModulePath,
  buildProjectsNewPath,
  buildProjectsPickerPath,
  getDefaultPathForSuite,
  resolveProjectOrganizationId,
  writeStoredLastOrganizationId,
} from '../../utils/suitePathUtils';
import { fetchProjectHubProject } from '../../features/projects/hub/useProjectHubQueries';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { coerceDeliveryPhase } from '../../utils/projectPhaseNav';

const COLLAPSE_KEY = 'voicehub:sidebar-collapsed';

const MODULE_ICONS = {
  overview: LayoutDashboard,
  list: List,
  planning: FolderKanban,
  board: LayoutGrid,
  timeline: GanttChart,
  changeRequests: FileSpreadsheet,
  requirements: FileSpreadsheet,
  files: FileText,
  chat: MessageCircle,
  calendar: Calendar,
  documents: FileText,
  members: Users,
  activity: Activity,
  settings: Settings,
  picker: FolderKanban,
  new: Plus,
  customerDocuments: FileText,
  'customer-documents': FileText,
  analysisBg: FileSpreadsheet,
  'analysis-bg': FileSpreadsheet,
  analysisBr: FileSpreadsheet,
  'analysis-br': FileSpreadsheet,
  analysisBpm: FileSpreadsheet,
  'analysis-bpm': FileSpreadsheet,
  analysisFr: FileSpreadsheet,
  'analysis-fr': FileSpreadsheet,
  analysisUc: FileSpreadsheet,
  'analysis-uc': FileSpreadsheet,
  analysisNfr: FileSpreadsheet,
  'analysis-nfr': FileSpreadsheet,
  analysisScope: FileSpreadsheet,
  'analysis-scope': FileSpreadsheet,
  traceability: GanttChart,
  analysisReviews: Activity,
  'analysis-reviews': Activity,
  srsBaselines: FolderKanban,
  'srs-baselines': FolderKanban,
  deliveryPlanning: FolderKanban,
  'delivery-planning': FolderKanban,
  'planning-overview': LayoutDashboard,
  'planning-wbs': FolderKanban,
  'planning-architecture': Settings,
  'planning-resources': Users,
  'planning-dependencies': GanttChart,
  'planning-schedule': Calendar,
  'planning-milestones': Activity,
  'planning-releases': FolderKanban,
  'planning-risks': FileText,
  'planning-approval': Activity,
};

function NavItem({ item, collapsed, suiteColor, isActive }) {
  const Icon = item.icon || LayoutDashboard;
  const locked = Boolean(item.locked);
  const content = (
    <>
      {isActive && !locked && (
        <span
          className="absolute bottom-[18%] left-0 top-[18%] w-[3px] rounded-r-sm"
          style={{ background: suiteColor, boxShadow: `0 0 8px ${suiteColor}88` }}
        />
      )}
      <Icon size={15} className="shrink-0" style={{ color: isActive && !locked ? suiteColor : undefined }} />
      {!collapsed && (
        <span
          className="min-w-0 flex-1 text-left whitespace-nowrap text-[0.8125rem] tracking-tight"
          style={{
            fontWeight: isActive && !locked ? 500 : 400,
            color: locked ? 'rgba(255,255,255,0.28)' : isActive ? '#E2E8F0' : undefined,
          }}
        >
          {item.label}
        </span>
      )}
    </>
  );
  const className = figmaNavItemClass(isActive && !locked, suiteColor, collapsed);
  const style = figmaNavItemBg(isActive && !locked, suiteColor);
  if (locked) {
    return (
      <div
        className="group relative block cursor-not-allowed opacity-60"
        title={item.lockHint || item.label}
      >
        <div className={className} style={style}>
          {content}
        </div>
      </div>
    );
  }
  return (
    <Link to={item.path} className="group relative block" title={collapsed ? item.label : undefined}>
      <div className={className} style={style}>
        {content}
      </div>
    </Link>
  );
}

export default function ProjectsSidebar({ landingDemo = false } = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showSuitePicker, setShowSuitePicker] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const { navigateToSuite } = useWorkspaceSuite();
  const { mobileNavOpen, closeMobileNav } = useShellLayout();
  const { canAccessHub, isSystemAdmin } = useCompanyAdminAccess();
  const showAdminSuite = canAccessHub && !isSystemAdmin;
  const { projectId: projectIdParam, module: moduleParam, planningModule } = useParams();
  const [searchParams] = useSearchParams();
  const { company, activeWorkspace } = useWorkspace();

  const projectId = String(projectIdParam || '').trim();
  const activeModule = planningModule
    ? `planning-${String(planningModule).toLowerCase()}`
    : normalizeProjectModule(moduleParam || '');

  const { data: projectRow } = useQuery({
    queryKey: queryKeys.projectHub.project(projectId),
    queryFn: () => fetchProjectHubProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const workspaceOrgId = String(
    activeWorkspace?._id || company?.id || company?._id || ''
  ).trim();
  const orgId = resolveProjectOrganizationId({
    search: searchParams,
    projectRow,
    workspaceOrgId,
  });

  useEffect(() => {
    if (orgId) writeStoredLastOrganizationId(orgId);
  }, [orgId]);

  // Do not assume development while loading — that flashes Phase 2 menu for Phase 1 projects.
  const projectTitle = projectRow
    ? String(projectRow?.title || projectRow?.name || '').trim()
    : '';
  const deliveryPhase = projectRow ? coerceDeliveryPhase(projectRow.deliveryPhase) : null;
  const projectCapabilities = projectRow?.capabilities || null;

  const suiteColor = SUITE_COLORS.projects || '#8B5CF6';
  const suiteLabels = {
    label: t('nav.suite.projects.label'),
    sublabel: t('nav.suite.projects.sublabel'),
  };

  useEffect(() => {
    closeMobileNav();
  }, [location.pathname, closeMobileNav]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved) setCollapsed(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    if (next) setShowSuitePicker(false);
  };

  const preItems = useMemo(() => {
    return getProjectsPreSelectNavItems().map((item) => ({
      ...item,
      label: t(item.labelKey),
      icon: MODULE_ICONS[item.key] || FolderKanban,
      path:
        item.key === 'new'
          ? buildProjectsNewPath(orgId, { from: 'sidebar' })
          : buildProjectsPickerPath(orgId),
    }));
  }, [orgId, t]);

  const boardId = boardQueryFromSearch(searchParams);

  const postItems = useMemo(() => {
    if (!projectId || !projectRow || deliveryPhase == null) return [];
    return getProjectsPostSelectNavItems(projectId, {
      deliveryPhase,
      capabilities: projectCapabilities,
    }).map((item) => ({
      ...item,
      label: t(item.labelKey),
      lockHint: item.lockHintKey ? t(item.lockHintKey) : '',
      icon: MODULE_ICONS[item.key] || MODULE_ICONS[item.module] || LayoutDashboard,
      path: item.pathSeg
        ? `/app/projects/${encodeURIComponent(projectId)}/${item.pathSeg}${
            boardId ? `?boardId=${encodeURIComponent(boardId)}` : ''
          }`
        : buildProjectsModulePath(projectId, item.module, {
            boardId,
          }),
    }));
  }, [projectId, orgId, boardId, t, deliveryPhase, projectCapabilities, projectRow]);

  const groupedPost = useMemo(() => {
    const groups = [
      PROJECT_MENU_GROUPS.PHASE1_RA,
      PROJECT_MENU_GROUPS.PHASE1_PLANNING,
      PROJECT_MENU_GROUPS.WORK,
      PROJECT_MENU_GROUPS.COLLAB,
      PROJECT_MENU_GROUPS.OPS,
    ];
    return groups
      .map((group) => ({
        group,
        label: t(getProjectMenuGroupLabelKey(group)),
        items: postItems.filter((i) => i.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [postItems, t]);

  const allowedSuites = useMemo(() => {
    const base = ['communicate', 'company', 'projects', 'me'];
    if (showAdminSuite) return ['communicate', 'company', 'projects', 'admin', 'me'];
    return base;
  }, [showAdminSuite]);

  const railCollapsed = collapsed && !mobileNavOpen;
  const widthClass = railCollapsed ? FIGMA_SIDEBAR_COLLAPSED : FIGMA_SIDEBAR_EXPANDED;
  const sidebarTranslate = mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';


  const isItemActive = (item) => {
    if (!projectId) {
      if (item.key === 'picker') {
        return location.pathname === '/app/projects' || location.pathname === '/app/projects/';
      }
      if (item.key === 'new') return location.pathname.startsWith('/app/projects/new');
      return false;
    }
    if (item.pathSeg && item.pathSeg.includes('/')) {
      return location.pathname.includes(`/${item.pathSeg}`);
    }
    return item.module === activeModule;
  };

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-[240] bg-black/50 lg:hidden"
          onClick={closeMobileNav}
        />
      ) : null}
      <div
        id="voicehub-mobile-nav"
        role={mobileNavOpen ? 'dialog' : undefined}
        aria-modal={mobileNavOpen ? true : undefined}
        aria-label={t('nav.mainMenu')}
        className={`${FIGMA_SIDEBAR} ${widthClass} fixed inset-y-0 left-0 z-[250] transform transition-transform duration-200 ease-enterprise lg:relative lg:z-30 lg:translate-x-0 ${sidebarTranslate}`}
      >
        <div className={`relative ${FIGMA_SIDEBAR_SUITE_STRIP}`}>
          <div
            className={`flex w-full items-center gap-1.5 ${railCollapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'}`}
          >
            {!railCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowSuitePicker((s) => !s)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 transition"
                  style={{
                    background: showSuitePicker ? `${suiteColor}28` : `${suiteColor}18`,
                    borderColor: `${suiteColor}${showSuitePicker ? '44' : '22'}`,
                  }}
                  title={t('nav.switchSuite')}
                >
                  <div className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: suiteColor }} />
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.6875rem] font-bold uppercase tracking-wider"
                    style={{ color: suiteColor }}
                  >
                    {suiteLabels.label}
                  </span>
                  <ChevronsRight
                    size={10}
                    className="shrink-0 opacity-70"
                    style={{ color: suiteColor, transform: showSuitePicker ? 'rotate(90deg)' : 'none' }}
                  />
                </button>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="hidden shrink-0 rounded-[5px] border-none bg-transparent p-0.5 text-white/30 transition hover:text-white/70 lg:inline-flex"
                  title={t('nav.collapseSidebar')}
                  aria-label={t('nav.collapseSidebar')}
                >
                  <ChevronsLeft size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={toggleCollapsed}
                title={t('nav.expandSidebar')}
                aria-label={t('nav.expandSidebar')}
                className={FIGMA_SIDEBAR_EXPAND_BTN}
                style={{
                  background: `${suiteColor}18`,
                  borderColor: `${suiteColor}44`,
                  color: suiteColor,
                }}
              >
                <ChevronsRight size={14} strokeWidth={2.25} />
              </button>
            )}
          </div>

          {showSuitePicker && !railCollapsed && (
            <div className="absolute left-2 right-2 top-[calc(100%+4px)] z-[200] animate-scale-in overflow-hidden rounded-xl border border-white/10 bg-[#0D0D1A] shadow-2xl">
              <div className="px-2.5 pb-1 pt-2 text-[0.575rem] font-bold uppercase tracking-widest text-white/25">
                {t('nav.chooseSpace')}
              </div>
              {allowedSuites.map((sId) => {
                const isCurrent = sId === 'projects';
                const labels = {
                  label: t(`nav.suite.${sId}.label`),
                  sublabel: t(`nav.suite.${sId}.sublabel`),
                };
                const sc = SUITE_COLORS[sId] || suiteColor;
                const suiteMap = {
                  communicate: SUITE.COMMUNICATE,
                  company: SUITE.COMPANY,
                  projects: SUITE.PROJECTS,
                  me: SUITE.ME,
                  admin: SUITE.ADMIN,
                };
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => {
                      navigateToSuite(suiteMap[sId], { path: getDefaultPathForSuite(suiteMap[sId]) });
                      setShowSuitePicker(false);
                    }}
                    className="flex w-full items-center gap-2.5 border-none px-3 py-2 text-left transition"
                    style={{
                      background: isCurrent ? `${sc}18` : 'transparent',
                      borderLeft: `3px solid ${isCurrent ? sc : 'transparent'}`,
                    }}
                  >
                    <div
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: sc, boxShadow: isCurrent ? `0 0 6px ${sc}` : 'none' }}
                    />
                    <div>
                      <div
                        className="text-[0.7812rem]"
                        style={{
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? sc : 'rgba(255,255,255,0.6)',
                        }}
                      >
                        {labels.label}
                      </div>
                      <div className="text-[0.625rem] text-white/25">{labels.sublabel}</div>
                    </div>
                  </button>
                );
              })}
              <div className="h-1.5" />
            </div>
          )}
        </div>

        {projectId && !railCollapsed ? (
          <div className="shrink-0 border-b border-sidebar-border px-2.5 py-2">
            <p className="truncate text-[0.6875rem] font-bold text-white/80">
              {projectTitle || t('workspace.projectHubUntitled')}
            </p>
            <button
              type="button"
              onClick={() => navigate(buildProjectsPickerPath(orgId))}
              className="mt-1 inline-flex items-center gap-1 text-[0.625rem] font-semibold text-white/40 transition hover:text-white/70"
            >
              <ArrowLeftRight size={10} />
              {t('nav.projectsSwitch')}
            </button>
          </div>
        ) : null}

        {!railCollapsed && (
          <div className={FIGMA_SIDEBAR_SECTION_LABEL}>
            {projectId ? t('nav.mainMenu') : t('nav.projectsPick')}
          </div>
        )}

        <nav className={FIGMA_SIDEBAR_NAV}>
          {!projectId
            ? preItems.map((item) => (
                <NavItem
                  key={item.key}
                  item={item}
                  collapsed={railCollapsed}
                  suiteColor={suiteColor}
                  isActive={isItemActive(item)}
                />
              ))
            : groupedPost.map((section) => (
                <div key={section.group} className="mb-1">
                  {!railCollapsed && section.label ? (
                    <div className="px-2.5 pb-0.5 pt-2 text-[0.55rem] font-bold uppercase tracking-wider text-white/25">
                      {section.label}
                    </div>
                  ) : null}
                  {section.items.map((item) => (
                    <NavItem
                      key={item.key}
                      item={item}
                      collapsed={railCollapsed}
                      suiteColor={suiteColor}
                      isActive={isItemActive(item)}
                    />
                  ))}
                </div>
              ))}
        </nav>

        <div className={FIGMA_SIDEBAR_FOOTER} />
      </div>
    </>
  );
}
