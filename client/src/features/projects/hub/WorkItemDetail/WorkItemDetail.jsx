import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import OtOverrideConfirmModal from '../../../../features/adminTasks/OtOverrideConfirmModal';
import {
  FIGMA_ORG_MEMBER_PANEL_HEAD,
  FIGMA_ORG_MEMBER_PANEL_TITLE,
} from '../../../../components/Organization/figmaOrganizationClasses';
import ProjectHubIssueTypeBadge from '../ProjectHubIssueTypeBadge';
import { displayIssueKey } from '../projectHubUtils';
import { WorkItemDetailProvider, useWorkItemDetail } from './WorkItemDetailContext';
import OverviewTab from './OverviewTab';
import DescriptionTab from './DescriptionTab';
import ChildrenTab from './ChildrenTab';
import ActivityTab from './ActivityTab';
import AttachmentsTab from './AttachmentsTab';
import WorklogTab from './WorklogTab';
import ApprovalsTab from './ApprovalsTab';

const TAB_COMPONENTS = {
  overview: OverviewTab,
  description: DescriptionTab,
  children: ChildrenTab,
  activity: ActivityTab,
  attachments: AttachmentsTab,
  worklog: WorklogTab,
  approvals: ApprovalsTab,
};

function WorkItemDetailHeader() {
  const {
    workItem,
    issueId,
    workType,
    projectCode,
    title,
    setTitle,
    isPlanning,
    saving,
    save,
    onClose,
    t,
    listTitle,
  } = useWorkItemDetail();

  const rawType = String(workType || workItem?.issueType || workItem?.type || 'task').toLowerCase();

  return (
    <header className={FIGMA_ORG_MEMBER_PANEL_HEAD}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <ProjectHubIssueTypeBadge
            type={rawType === 'feature' ? 'feature' : rawType}
            variant="icon"
          />
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">
            {displayIssueKey(projectCode, issueId)}
          </span>
          {listTitle ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {listTitle}
            </span>
          ) : null}
        </div>
        {isPlanning ? (
          <h3 className={`${FIGMA_ORG_MEMBER_PANEL_TITLE} mt-1 truncate`}>
            {workItem?.title || ''}
          </h3>
        ) : (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const next = title.trim();
              if (next && next !== String(workItem?.title || '')) void save({ title: next });
            }}
            disabled={saving}
            className={`${FIGMA_ORG_MEMBER_PANEL_TITLE} mt-1 w-full border-0 bg-transparent outline-none`}
            aria-label={t('workspace.projectHubWorkFieldTitle')}
          />
        )}
      </div>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:text-foreground"
        onClick={onClose}
        aria-label={t('workspace.projectHubWorkDrawerClose')}
      >
        <X size={18} aria-hidden />
      </button>
    </header>
  );
}

function WorkItemDetailTabs() {
  const { visibleTabs, activeTab, setActiveTab, t } = useWorkItemDetail();
  return (
    <div
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2"
      role="tablist"
      aria-label={t('workspace.projectHubWorkDetails')}
    >
      {visibleTabs.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={activeTab === item.id}
          onClick={() => setActiveTab(item.id)}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
            activeTab === item.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
}

function WorkItemDetailBody() {
  const { activeTab, visibleTabs } = useWorkItemDetail();
  const ids = visibleTabs.map((t) => t.id);
  const tabId = ids.includes(activeTab) ? activeTab : ids[0] || 'overview';
  const Comp = TAB_COMPONENTS[tabId] || OverviewTab;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-overlay">
      <Comp />
    </div>
  );
}

function HoursOverrideHost() {
  const {
    hoursWarn,
    setHoursWarn,
    setPendingPatch,
    confirmHoursOverride,
    saving,
    t,
    buildHoursWarnMessage,
    assigneeId,
    assignableMembers,
    workItem,
  } = useWorkItemDetail();

  const hoursAssigneeName =
    workItem?.assigneeName ||
    (assignableMembers || []).find((m) => String(m.userId) === String(assigneeId))?.displayName ||
    '';

  return (
    <OtOverrideConfirmModal
      isOpen={Boolean(hoursWarn)}
      onClose={() => {
        setHoursWarn(null);
        setPendingPatch(null);
      }}
      onConfirm={confirmHoursOverride}
      busy={saving}
      title={t('taskBoard.hoursOverrideTitle')}
      confirmText={t('taskBoard.hoursOverrideConfirm')}
      cancelText={t('taskBoard.cancelAria')}
      rationaleLabel={t('taskBoard.hoursOverrideRationale')}
      rationalePlaceholder={t('taskBoard.hoursOverridePlaceholder')}
      rationaleRequiredText={t('taskBoard.hoursOverrideNeedReason')}
      message={buildHoursWarnMessage(hoursWarn, t, hoursAssigneeName)}
    />
  );
}

function WorkItemDetailInner({ chrome = 'modal', drawerLayout = 'embedded' }) {
  const { open, onClose, workItem, t, issueId } = useWorkItemDetail();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !issueId) return null;

  const panel = (
    <>
      <WorkItemDetailHeader />
      <WorkItemDetailTabs />
      <WorkItemDetailBody />
      <HoursOverrideHost />
    </>
  );

  if (chrome === 'drawer') {
    const asideCls =
      drawerLayout === 'overlay'
        ? 'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-surface shadow-lg'
        : 'fixed inset-y-0 right-0 z-40 flex h-full min-h-0 w-full shrink-0 animate-slide-in-right flex-col overflow-hidden border-l border-border bg-surface sm:relative sm:z-auto sm:max-w-md';

    return (
      <>
        <button
          type="button"
          className={`fixed inset-0 z-30 bg-black/40 ${drawerLayout === 'overlay' ? '' : 'sm:hidden'}`}
          aria-label={t('workspace.projectHubWorkDrawerClose')}
          onClick={onClose}
        />
        <aside
          className={asideCls}
          role="dialog"
          aria-modal="true"
          aria-label={workItem?.title || t('workspace.projectHubWorkDetails')}
        >
          {panel}
        </aside>
      </>
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10070] bg-black/60" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-[10071] flex max-h-[92vh] w-[min(768px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={workItem?.title || t('workspace.projectHubWorkDetails')}
      >
        {panel}
      </div>
    </>,
    document.body
  );
}

/**
 * Work item detail thống nhất — Board/List (modal) và Backlog/CR (drawer).
 */
export default function WorkItemDetail({
  open = false,
  chrome = 'modal',
  drawerLayout = 'embedded',
  workItem = null,
  ...providerProps
}) {
  if (!open || !workItem) return null;

  return (
    <WorkItemDetailProvider open={open} workItem={workItem} {...providerProps}>
      <WorkItemDetailInner chrome={chrome} drawerLayout={drawerLayout} />
    </WorkItemDetailProvider>
  );
}
