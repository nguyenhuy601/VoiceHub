import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  FIGMA_WS_SHELL_CONTENT,
  FIGMA_WS_SHELL_ROOT,
  FIGMA_WS_SHELL_SUB_HEADER,
} from './figmaOrganizationClasses';
import { useAppStrings } from '../../locales/appStrings';

const TEAM_TAB_IDS = [
  { id: 'chat', labelKey: 'workspace.moduleChat' },
  { id: 'voice', labelKey: 'workspace.moduleVoice' },
  { id: 'tasks', labelKey: 'workspace.moduleTask' },
  { id: 'documents', labelKey: 'workspace.moduleDocs' },
];

const DEPT_TAB_IDS = [
  { id: 'announcement', labelKey: 'workspace.moduleAnnouncement' },
  { id: 'tasks', labelKey: 'workspace.moduleTask' },
  { id: 'members', labelKey: 'workspace.moduleMembers' },
  { id: 'documents', labelKey: 'workspace.moduleDocs' },
  { id: 'calendar', labelKey: 'workspace.moduleCalendar' },
  { id: 'meetings', labelKey: 'workspace.moduleMeetings' },
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
 * Org hub shell — breadcrumb + back; module chọn từ card team/dept, không dùng tab bar.
 */
export default function OrganizationHubShell({
  organizationName = '',
  activeTab = 'chat',
  showLanding = false,
  selectedTeam = null,
  selectedDepartment = null,
  /** Khi true (dept workspace, không team): dùng DEPT_TAB_IDS */
  departmentMode = false,
  /** Ẩn breadcrumb (vd. tasks — ProjectHub tự có chrome) */
  hideChrome = false,
  locale = 'vi',
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
      {inSubContext ? (
        <div className={FIGMA_WS_SHELL_SUB_HEADER}>
          <button
            type="button"
            onClick={() => onBackFromSubView?.()}
            className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            aria-label={
              inTeamContext ? t('workspace.backToWork') : t('workspace.backToDepartments')
            }
          >
            <ChevronLeft size={18} />
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
