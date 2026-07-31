import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  MessageCircle,
  Mic,
  Users,
  Video,
} from 'lucide-react';
import {
  FIGMA_WS_SHELL_CONTENT,
  FIGMA_WS_SHELL_ROOT,
  FIGMA_WS_SHELL_SUB_HEADER,
  FIGMA_WS_SHELL_TAB_ACTIVE,
  FIGMA_WS_SHELL_TAB_BAR,
  FIGMA_WS_SHELL_TAB_BTN,
  FIGMA_WS_SHELL_TAB_INACTIVE,
} from './figmaWorkspaceClasses';
import { useAppStrings } from '../../locales/appStrings';

const TEAM_TAB_IDS = [
  { id: 'chat', icon: MessageCircle, labelKey: 'workspace.moduleChat' },
  { id: 'voice', icon: Mic, labelKey: 'workspace.moduleVoice' },
  { id: 'tasks', icon: ClipboardList, labelKey: 'workspace.moduleTask' },
  { id: 'documents', icon: FileText, labelKey: 'workspace.moduleDocs' },
];

const DEPT_TAB_IDS = [
  { id: 'announcement', icon: MessageCircle, labelKey: 'workspace.moduleAnnouncement' },
  { id: 'tasks', icon: ClipboardList, labelKey: 'workspace.moduleTask' },
  { id: 'members', icon: Users, labelKey: 'workspace.moduleMembers' },
  { id: 'documents', icon: FileText, labelKey: 'workspace.moduleDocs' },
  { id: 'calendar', icon: Calendar, labelKey: 'workspace.moduleCalendar' },
  { id: 'meetings', icon: Video, labelKey: 'workspace.moduleMeetings' },
];

function orgInitial(name) {
  const n = String(name || '').trim();
  return (n.charAt(0) || 'O').toUpperCase();
}

function scopeAccent(scope) {
  const color = scope?.color || scope?.gradStart || '#2563EB';
  return {
    color,
    initial: scope?.initial || orgInitial(scope?.name),
  };
}

/**
 * Org hub shell — team: chat|voice|tasks|documents;
 * dept: announcement|tasks|members|docs|calendar|meetings.
 */
export default function WorkspaceSlugFigmaShell({
  organizationName = '',
  activeTab = 'chat',
  showLanding = false,
  selectedTeam = null,
  selectedDepartment = null,
  /** Khi true (dept workspace, không team): dùng DEPT_TAB_IDS */
  departmentMode = false,
  /** Ẩn tab bar + breadcrumb (vd. tasks — ProjectHub tự có chrome) */
  hideChrome = false,
  locale = 'vi',
  onTabChange,
  onBackFromSubView,
  onModuleClick,
  teamGrid = null,
  children,
  className = '',
}) {
  const { t } = useAppStrings();
  const teamAccentInfo = scopeAccent(selectedTeam);
  const deptAccentInfo = scopeAccent(selectedDepartment);
  const TAB_IDS = departmentMode ? DEPT_TAB_IDS : TEAM_TAB_IDS;

  if (showLanding) {
    return (
      <div className={`${FIGMA_WS_SHELL_ROOT} ${className}`}>
        {teamGrid}
      </div>
    );
  }

  const inTeamContext = Boolean(selectedTeam?.name || selectedTeam?.id);
  const inDepartmentContext = Boolean(selectedDepartment?.name || selectedDepartment?.id);
  const inSubContext = inTeamContext || inDepartmentContext;
  const subScope = inTeamContext ? selectedTeam : selectedDepartment;
  const subAccent = inTeamContext ? teamAccentInfo : deptAccentInfo;

  const deptContextLabelKey = (() => {
    if (activeTab === 'tasks') return 'workspace.moduleTask';
    if (activeTab === 'members') return 'workspace.moduleMembers';
    if (activeTab === 'documents') return 'workspace.moduleDocs';
    if (activeTab === 'calendar') return 'workspace.moduleCalendar';
    if (activeTab === 'meetings') return 'workspace.moduleMeetings';
    return 'workspace.moduleAnnouncement';
  })();

  if (hideChrome) {
    return (
      <div className={`${FIGMA_WS_SHELL_ROOT} ${className}`}>
        <div className={FIGMA_WS_SHELL_CONTENT}>
          <div className="flex min-h-0 w-full flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${FIGMA_WS_SHELL_ROOT} ${className}`}>
      <nav className={FIGMA_WS_SHELL_TAB_BAR} aria-label={t('workspace.orgModulesAria')}>
        {TAB_IDS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange?.(tab.id)}
              className={`${FIGMA_WS_SHELL_TAB_BTN} ${
                active ? FIGMA_WS_SHELL_TAB_ACTIVE : FIGMA_WS_SHELL_TAB_INACTIVE
              }`}
            >
              <Icon size={14} />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {inSubContext ? (
        <div className={FIGMA_WS_SHELL_SUB_HEADER}>
          <button
            type="button"
            onClick={() => onBackFromSubView?.()}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft size={16} />
          </button>
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold text-white"
            style={{ background: subAccent.color }}
          >
            {inDepartmentContext ? (
              <Building2 size={13} className="text-white" />
            ) : (
              subAccent.initial
            )}
          </div>
          <span className="truncate text-sm font-bold text-foreground">{subScope.name}</span>
          <ChevronRight size={13} className="shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {departmentMode || (inDepartmentContext && !inTeamContext)
              ? t(deptContextLabelKey)
              : t(TAB_IDS.find((tab) => tab.id === activeTab)?.labelKey || 'workspace.moduleChat')}
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-surface px-4 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-sm font-bold text-white">
            {orgInitial(organizationName)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-foreground">{organizationName}</div>
            <div className="text-[0.6875rem] text-muted-foreground">
              {t('workspace.pickTeamModule')}
            </div>
          </div>
        </div>
      )}

      <div className={FIGMA_WS_SHELL_CONTENT}>
        <div className="flex min-h-0 w-full flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/** Re-export tab ids for OrganizationTeamGrid module buttons */
export { TEAM_TAB_IDS as WORKSPACE_SHELL_TABS, DEPT_TAB_IDS as DEPT_WORKSPACE_SHELL_TABS };
