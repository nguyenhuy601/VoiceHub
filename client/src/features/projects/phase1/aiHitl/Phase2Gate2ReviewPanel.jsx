import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2, Send, CheckCircle2, XCircle } from 'lucide-react';
import { projectAPI } from '../../../../services/api/projectAPI';
import { localizedProjectRoleLabel } from '../../../../utils/projectRoleLocale';
import { ConfirmDialog } from '../../../../components/Shared';
import Gate1SectionReviewTable from '../gate1/Gate1SectionReviewTable';
import Gate1MissingSectionPanel from '../gate1/Gate1MissingSectionPanel';
import {
  GATE2_SCROLL_PAGE_SIZE,
  areGate2SectionDecisionsComplete,
  countGate2PendingDecisions,
  getGate2ColumnsForSection,
  getGate2FieldValue,
  getGate2RowId,
  patchGate2EditedPayload,
  seedGate2EditedPayload,
} from '../gate2/gate2SectionTableConfig';
import Gate2SprintScopePanel from '../gate2/Gate2SprintScopePanel';
import Gate2TcDetailPanel from '../gate2/Gate2TcDetailPanel';
import AssignmentScheduleDetailDrawer from '../gate2/AssignmentScheduleDetailDrawer';
import { withRecalcSprintDecision } from '../gate2/recalcSprintAllocationClient';
import {
  assignmentsNeedScheduleRefresh,
  enrichAssignmentRowsWithSchedule,
  isScheduleDirtyField,
} from '../gate2/assignmentScheduleTrust';
import { buildGate2ProposalItems } from '../buildGate2ProposalItems';
import { useProjectMemberNames } from '../planning/useProjectMemberNames';
import HowPlanSummaryChips from './HowPlanSummaryChips';
import HitlSectionTabList from './HitlSectionTabList';
import Gate2ConsolidationPanel from './Gate2ConsolidationPanel';
import HowMonitorResultsPanel from './HowMonitorResultsPanel';
import { shouldShowHowMonitorResults } from './howMonitorResultsVisibility';
import DependencyFlowPanel from '../gate2/DependencyFlowPanel';
import {
  assignmentSelectOptions,
  fillUnassignedWithReadyPeople,
  patchAssignmentCatalogValue,
} from '../gate2/assignmentCatalogEdit';

function resolveAiContainer(pack) {
  if (pack?.aiAnalysis && typeof pack.aiAnalysis === 'object') return pack.aiAnalysis;
  return pack && typeof pack === 'object' ? pack : {};
}

function dependencyEmptySoftHintKey(pack) {
  const dep = resolveAiContainer(pack)?.analyses?.dependency || {};
  const st = String(dep.analysisStatus || dep.meta?.analysisStatus || '')
    .trim()
    .toUpperCase();
  if (st === 'COMPLETE_NO_EDGES') return 'requirements.aiHitlMonitorResultsEmptyDepsComplete';
  if (st === 'SKIPPED') return 'requirements.aiHitlMonitorResultsEmptyDepsSkipped';
  if (st === 'FAILED') return 'requirements.aiHitlMonitorResultsEmptyDepsFailed';
  if (st === 'SEMANTIC_INCOMPLETE') return 'requirements.aiHitlMonitorResultsEmptyDepsSemantic';
  if (st === 'INCOMPLETE' || st === 'PARTIAL' || st === 'INVALID') {
    return 'requirements.aiHitlMonitorResultsEmptyDepsPartial';
  }
  return 'requirements.aiHitlMonitorResultsEmptyDeps';
}

function unwrapPool(res) {
  return res?.data?.data ?? res?.data ?? res;
}
const ROLE_LABEL = {
  po: 'PO',
  tech: 'Tech Lead',
  pm: 'PM',
  product_owner: 'PO',
  tech_lead: 'Tech Lead',
  project_manager: 'PM',
  business_analyst: 'BA',
  qa: 'QA',
  tester: 'Tester',
};

function resolvePackRefId(raw) {
  if (raw && typeof raw === 'object') return String(raw._id || raw.id || '').trim();
  return String(raw || '').trim();
}

function resolvePackProjectId(pack) {
  return resolvePackRefId(pack?.projectId);
}

function resolvePackOrgId(pack) {
  return resolvePackRefId(pack?.organizationId || pack?.orgId);
}

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

const GATE2_TABLE_CONFIG = {
  getColumnsForSection: getGate2ColumnsForSection,
  getFieldValue: getGate2FieldValue,
  getRowId: getGate2RowId,
  seedEditedPayload: seedGate2EditedPayload,
  patchEditedPayload: patchGate2EditedPayload,
  scrollPageSize: GATE2_SCROLL_PAGE_SIZE,
  storageKeyPrefix: 'gate2-review-cols-v2',
  /** WBS / Tasks: tree collapse enabled; default expanded so Task level is visible. */
  wbsTreeCollapse: true,
};

/**
 * Gate 2 — review song song theo phần, rồi PM tổng hợp, PO duyệt cuối.
 */
export default function Phase2Gate2ReviewPanel({
  reviewView = 'waitingParallel',
  howStatus = '',
  reviewLane: _reviewLane = 'parallel',
  rejectReason = '',
  busy = false,
  canPromote = false,
  pack = null,
  decisions: controlledDecisions = null,
  setDecision: controlledSetDecision = null,
  t,
  parallelTracks = [],
  proposals = [],
  onTrackSubmit,
  onRefreshSchedule = null,
  onProposeChange,
  onDecideChange,
  onKeepOriginal,
  onEscalate,
  onResolveEscalation,
  onPmConfirmPlan,
  onPoApprove,
  onPoReject,
}) {
  const projectId = resolvePackProjectId(pack);
  const nameByUserId = useProjectMemberNames(projectId, resolvePackOrgId(pack));
  const bundle = useMemo(
    () => buildGate2ProposalItems({ pack, nameByUserId, t }),
    [pack, nameByUserId, t]
  );
  const bySection = bundle.proposalBySection || {};
  const sectionTabs = bundle.proposalSections || [];

  const [activeSection, setActiveSection] = useState('');
  const [activeTrack, setActiveTrack] = useState('');
  const [localDecisions, setLocalDecisions] = useState({});
  const [sprintScopeRow, setSprintScopeRow] = useState(null);
  const [tcDetailRow, setTcDetailRow] = useState(null);
  const [scheduleDetailRow, setScheduleDetailRow] = useState(null);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [dirtySubmitOpen, setDirtySubmitOpen] = useState(false);
  const awaitingScheduleRefreshRef = useRef(false);
  const openSprintScope = useCallback((row) => setSprintScopeRow(row), []);
  const openTcDetail = useCallback((row) => setTcDetailRow(row), []);
  const openScheduleDetail = useCallback((row) => setScheduleDetailRow(row), []);
  const seededReviewVersionRef = useRef(null);
  const isControlled =
    controlledDecisions != null && typeof controlledSetDecision === 'function';
  const decisions = isControlled ? controlledDecisions : localDecisions;

  useEffect(() => {
    setActiveTrack((prev) => (parallelTracks.includes(prev) ? prev : parallelTracks[0] || ''));
  }, [parallelTracks]);

  const visibleTabs = sectionTabs;
  const scopedBySection = bySection;

  useEffect(() => {
    setActiveSection((prev) => {
      if (prev && visibleTabs.some((tab) => tab.key === prev)) return prev;
      const withConflict = visibleTabs.find((tab) => tab.hasConflict || tab.conflictCount > 0);
      if (withConflict?.key) return withConflict.key;
      const withItems = visibleTabs.find((tab) => (bySection[tab.key]?.length || tab.count || 0) > 0);
      return withItems?.key || visibleTabs[0]?.key || '';
    });
  }, [visibleTabs, bySection]);

  useEffect(() => {
    if (isControlled) return;
    const version = bundle.reviewVersion ?? 0;
    if (seededReviewVersionRef.current === version) return;
    seededReviewVersionRef.current = version;
    setLocalDecisions({ ...(bundle.reviewDecisions || {}) });
  }, [bundle.reviewVersion, bundle.reviewDecisions, isControlled]);

  useEffect(() => {
    const status = String(howStatus || '').toLowerCase();
    if (!awaitingScheduleRefreshRef.current) return;
    if (status === 'ready' || status === 'confirmed') {
      awaitingScheduleRefreshRef.current = false;
      setScheduleDirty(false);
    }
  }, [howStatus]);

  const decisionsComplete = useMemo(
    () => areGate2SectionDecisionsComplete(scopedBySection, decisions),
    [scopedBySection, decisions]
  );
  const pendingDecisionCount = useMemo(
    () => countGate2PendingDecisions(scopedBySection, decisions),
    [scopedBySection, decisions]
  );
  const orgId = resolvePackOrgId(pack);
  const catalogEnabled = reviewView === 'showParallel' && Boolean(orgId);
  const roleCatalogQ = useQuery({
    queryKey: ['roleCatalog', orgId, 'gate2Assignment'],
    queryFn: async () => {
      const raw = unwrapPool(await projectAPI.listRoleCatalog(orgId));
      if (Array.isArray(raw)) return raw;
      return Array.isArray(raw?.roles) ? raw.roles : [];
    },
    enabled: catalogEnabled,
    staleTime: 60_000,
  });
  const assignmentRoleKeys = useMemo(() => {
    if (!catalogEnabled) return [];
    const keys = new Set();
    for (const row of bySection.assignments || []) {
      const key = String(row?.suggestedRoleKey || '').trim().toLowerCase();
      if (key) keys.add(key);
    }
    for (const decision of Object.values(decisions || {})) {
      const key = String(decision?.editedPayload?.suggestedRoleKey || '').trim().toLowerCase();
      if (key) keys.add(key);
    }
    return [...keys];
  }, [catalogEnabled, bySection, decisions]);
  const peopleQueries = useQueries({
    queries: assignmentRoleKeys.map((roleKey) => ({
      queryKey: ['staffingMatch', orgId, projectId, roleKey, 'gate2Assignment'],
      queryFn: async () => {
        const raw = unwrapPool(
          await projectAPI.listOrgResourcePool(
            orgId,
            {
              view: 'staffingMatch',
              projectId,
              projectRoleKeys: roleKey,
              limit: 50,
              offset: 0,
            },
            { skipPermissionDeniedToast: true }
          )
        );
        const rows = Array.isArray(raw?.byRole?.[roleKey]) ? raw.byRole[roleKey] : [];
        return rows
          .map((row) => {
            const score = Number(row?.score);
            const available = Number(row?.availableHours);
            return {
              userId: String(row?.userId || row?.id || '').trim(),
              displayName: String(row?.displayName || row?.fullName || row?.email || '').trim(),
              score: Number.isFinite(score) ? score : null,
              availableHours: Number.isFinite(available) ? available : null,
            };
          })
          .filter((row) => row.userId && row.displayName);
      },
      enabled: catalogEnabled && Boolean(projectId && roleKey),
      staleTime: 60_000,
    })),
  });
  const peopleByRole = useMemo(() => {
    const map = {};
    assignmentRoleKeys.forEach((roleKey, index) => {
      const rows = peopleQueries[index]?.data;
      if (Array.isArray(rows)) map[roleKey] = rows;
    });
    return map;
  }, [assignmentRoleKeys, peopleQueries]);
  const roleOptions = useMemo(() => {
    const roles = Array.isArray(roleCatalogQ.data) ? roleCatalogQ.data : [];
    return roles
      .map((role) => {
        const key = String(role?.key || '').trim();
        if (!key) return null;
        const label = localizedProjectRoleLabel(key, role.label || role.name || key, t);
        const text = String(label || key)
          .replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '')
          .trim();
        return { value: key.toLowerCase(), label: text || key };
      })
      .filter(Boolean);
  }, [roleCatalogQ.data, t]);
  const assignmentTableConfig = useMemo(
    () => ({
      ...GATE2_TABLE_CONFIG,
      getColumnsForSection: (section) =>
        getGate2ColumnsForSection(section, {
          onOpenSprintScope: openSprintScope,
          onOpenScheduleDetail: openScheduleDetail,
          onOpenTcDetail: openTcDetail,
        }),
      getSelectOptions: (row, col, payload) =>
        assignmentSelectOptions({
          row,
          field: col?.field,
          payload,
          roleOptions,
          peopleByRole,
        }),
      patchCatalogValue: (row, col, prev, value) =>
        patchAssignmentCatalogValue(row, col?.field, prev, value, { peopleByRole }),
    }),
    [roleOptions, peopleByRole, openSprintScope, openScheduleDetail, openTcDetail]
  );
  const assignmentPoolFailed = peopleQueries.some((query) => query.isError);

  const setDecision = (logicalId, patch) => {
    const row =
      (bySection.releases || []).find(
        (item, index) => getGate2RowId(item, index) === String(logicalId)
      ) ||
      (bundle.items || []).find(
        (item, index) => getGate2RowId(item, index) === String(logicalId)
      );
    const nextPatch = withRecalcSprintDecision(row, patch, pack);
    const edited = nextPatch?.editedPayload;
    if (edited && typeof edited === 'object') {
      const dirtyHit = Object.keys(edited).some((field) => isScheduleDirtyField(field));
      if (dirtyHit && String(row?.section || '') === 'assignments') {
        setScheduleDirty(true);
      }
    }
    if (isControlled) {
      controlledSetDecision(logicalId, nextPatch);
      return;
    }
    setLocalDecisions((prev) => ({
      ...prev,
      [logicalId]: { ...(prev[logicalId] || {}), ...nextPatch },
    }));
  };

  if (reviewView === 'howPending') {
    return (
      <p className="text-sm text-muted-foreground">
        {labelOf(
          t,
          'requirements.gate2HowPending',
          'Chờ AI Planning (HOW) xong trên tab Monitor — sau đó PM gửi duyệt Gate 2.'
        )}
      </p>
    );
  }

  if (reviewView === 'waitingParallel' || reviewView === 'waitingPm' || reviewView === 'waitingTech') {
    return (
      <p className="text-sm text-muted-foreground">
        {labelOf(
          t,
          'requirements.gate2WaitingParallel',
          'Đang chờ các vai trò đã chọn review toàn bộ kế hoạch.'
        )}
      </p>
    );
  }

  if (reviewView === 'waitingConsolidation') {
    return (
      <p className="text-sm text-muted-foreground">
        {labelOf(
          t,
          'requirements.gate2WaitingConsolidation',
          'Đã đủ review song song. Chờ PM tổng hợp xung đột rồi gửi PO xác nhận cuối.'
        )}
      </p>
    );
  }

  if (reviewView === 'waitingPo') {
    return (
      <p className="text-sm text-muted-foreground">
        {labelOf(
          t,
          'requirements.gate2WaitingPo',
          'PM đã gửi bản tổng hợp. Chờ PO xác nhận cuối Gate 2.'
        )}
      </p>
    );
  }

  if (reviewView === 'done') {
    const packStatus = String(pack?.status || '').toLowerCase();
    const alreadyLinked = packStatus === 'project_linked';
    const showActivate = !alreadyLinked && typeof onPoApprove === 'function';
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.gate2LaneDone',
            'Gate 2 đã duyệt xong. Có thể kích hoạt / tiếp tục delivery.'
          )}
        </p>
        {shouldShowHowMonitorResults(pack) ? (
          <HowMonitorResultsPanel pack={pack} t={t} />
        ) : null}
        {alreadyLinked ? (
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
            {labelOf(
              t,
              'requirements.gate2AlreadyPromoted',
              'Dự án đã gắn delivery (project_linked). Mở board Phase 2 để tiếp tục.'
            )}
          </p>
        ) : null}
        {showActivate ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onPoApprove({
                  activateOnly: true,
                  forceApprove: true,
                  hasSoftWarnings: true,
                  canPromote,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/40 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {labelOf(t, 'requirements.gate2PromotePhase2', 'Chuyển sang phase 2')}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const showParallel = reviewView === 'showParallel';
  const showConsolidation = reviewView === 'showConsolidation';
  const showChangeConfirm = reviewView === 'showChangeConfirm';
  const showPo = reviewView === 'showPoPanel';
  const allowDecide = showParallel;
  const decisionsOk = decisionsComplete;
  const activeTab = visibleTabs.find((tab) => tab.key === activeSection) || null;
  const sourceRows = bySection[activeSection] || [];
  let activeRows =
    activeSection === 'assignments'
      ? fillUnassignedWithReadyPeople(sourceRows, peopleByRole)
      : sourceRows;
  if (activeSection === 'assignments' && scheduleDirty) {
    activeRows = enrichAssignmentRowsWithSchedule(activeRows, resolveAiContainer(pack), {
      scheduleDirty: true,
    });
  }
  if (activeSection === 'quality') {
    activeRows = activeRows.filter((row) => row?.recordKind !== 'test_strategy');
  }
  const activeLabel = activeTab?.label || activeSection || '—';
  const activeMissing = Boolean(activeTab?.missing) || activeRows.length === 0;
  const sectionHasIssue = (tab) => {
    if (!tab) return false;
    const isMissing = Boolean(tab.missing) || !(bySection[tab.key]?.length || tab.count);
    const hasConflict = Boolean(tab.hasConflict) || Number(tab.conflictCount) > 0;
    return isMissing || hasConflict;
  };
  const activeHasIssue = sectionHasIssue(activeTab);
  const missingSections = visibleTabs.filter(
    (tab) => tab.missing || !(bySection[tab.key]?.length || tab.count)
  );
  const missingCount = missingSections.length;
  const conflictSectionCount = visibleTabs.filter(
    (tab) => tab.hasConflict || Number(tab.conflictCount) > 0
  ).length;
  const hasSoftWarnings = missingCount > 0 || conflictSectionCount > 0;

  const submitTrack = () => {
    if (typeof onTrackSubmit !== 'function' || !activeTrack) return;
    onTrackSubmit({
      track: activeTrack,
      reviewDecisions: decisions,
      reviewVersion: bundle.reviewVersion,
      decisionsComplete: decisionsOk,
      hasSoftWarnings: hasSoftWarnings || !decisionsOk || scheduleDirty,
      scheduleDirty,
    });
  };

  const handleTrackSubmit = () => {
    if (typeof onTrackSubmit !== 'function' || !activeTrack) return;
    if (scheduleDirty) {
      setDirtySubmitOpen(true);
      return;
    }
    submitTrack();
  };

  const handleRefreshSchedule = () => {
    if (typeof onRefreshSchedule !== 'function') return;
    awaitingScheduleRefreshRef.current = true;
    void onRefreshSchedule();
  };

  const handlePoApprove = () => {
    if (typeof onPoApprove !== 'function') return;
    onPoApprove({
      activateOnly: howStatus === 'confirmed',
      missingCount,
      conflictSectionCount,
      missingSectionKeys: missingSections.map((tab) => tab.key),
      missingSectionLabels: missingSections.map((tab) => tab.label || tab.key),
      hasSoftWarnings,
      canPromote,
    });
  };

  return (
    <div>
      {showPo ? (
        <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
          <p className="font-medium">
            {labelOf(
              t,
              'requirements.gate2FinalBanner',
              'Bản PM đã tổng hợp — PO xem và xác nhận cuối, hoặc từ chối để trả PM tổng hợp.'
            )}
          </p>
        </div>
      ) : null}
      {rejectReason ? (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200">
          {labelOf(t, 'requirements.gate2LastReject', 'PO từ chối lần trước')}: {rejectReason}
        </p>
      ) : null}
      {allowDecide && pendingDecisionCount > 0 ? (
        <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
          {labelOf(
            t,
            'requirements.phase1Gate1PendingDecisions',
            'Còn {count} dòng chưa quyết định',
            { count: pendingDecisionCount }
          )}
        </p>
      ) : null}
      {showParallel && parallelTracks.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {parallelTracks.map((track) => (
            <button
              key={track}
              type="button"
              onClick={() => setActiveTrack(track)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                track === activeTrack
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {ROLE_LABEL[track] || track}
            </button>
          ))}
        </div>
      ) : null}
      {showParallel && activeTrack ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {labelOf(
            t,
            'requirements.gate2ReviewAllSections',
            `${ROLE_LABEL[activeTrack] || activeTrack} review toàn bộ kế hoạch, không chia section.`
          )}
        </p>
      ) : null}
      {showConsolidation || showChangeConfirm ? (
        <Gate2ConsolidationPanel
          mode={showChangeConfirm ? 'confirm' : 'consolidate'}
          assignSections={false}
          proposals={proposals}
          busy={busy}
          t={t}
          onPropose={onProposeChange}
          onDecide={onDecideChange}
          onKeepOriginal={onKeepOriginal}
          onEscalate={onEscalate}
          onResolveEscalation={onResolveEscalation}
          onConfirmPlan={onPmConfirmPlan}
        />
      ) : null}
      <HowPlanSummaryChips pack={pack} t={t} />

      <HitlSectionTabList
        tabs={visibleTabs}
        activeKey={activeSection}
        onSelect={setActiveSection}
        tabHasIssue={sectionHasIssue}
        t={t}
        ariaLabel={labelOf(t, 'requirements.aiHitlMonitorHowSectionTabsAria', 'Các section HOW')}
      />

      {activeSection && !activeMissing && activeRows.length ? (
        <>
          {activeSection === 'quality' ? (
            <p className="mb-2 text-xs text-muted-foreground">
              {labelOf(
                t,
                'requirements.qualityReviewListHint',
                'Chờ duyệt là trạng thái rà soát. Chưa chạy nghĩa là chưa thực thi. Ready không có nghĩa là đã kiểm thử thành công.'
              )}
            </p>
          ) : null}
          {activeSection === 'dependencies' ? (
            <DependencyFlowPanel pack={pack} rows={activeRows} t={t} />
          ) : null}
          {activeSection === 'assignments' && allowDecide ? (
            <p className="mb-2 text-xs text-muted-foreground">
              {roleCatalogQ.isError
                ? labelOf(
                    t,
                    'requirements.gate2AssignCatalogError',
                    'Không tải được danh mục vai trò. Chọn lại khi danh mục sẵn sàng.'
                  )
                : labelOf(
                    t,
                    'requirements.gate2AssignPickHint',
                    'Đổi vai trò và nhân sự bằng danh sách của hệ thống. Ngày bắt đầu/kết thúc nằm trên cùng bảng (Lịch đã gộp). Giá trị gõ tay không được ghi.'
                  )}
              {assignmentPoolFailed
                ? ` ${labelOf(
                    t,
                    'requirements.gate2AssignPoolError',
                    'Một phần danh sách nhân sự chưa tải được — vẫn chọn được người đã có trong gợi ý của đúng vai trò.'
                  )}`
                : ''}
            </p>
          ) : null}
          {activeSection === 'assignments' &&
          (scheduleDirty ||
            assignmentsNeedScheduleRefresh(resolveAiContainer(pack), sourceRows) ||
            activeRows.some((r) => r.scheduleDerived)) ? (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              <p>
                {scheduleDirty
                  ? labelOf(
                      t,
                      'requirements.gate2ScheduleDirtyBanner',
                      'Đã đổi phân công/ngày — lịch có thể lệch. Bấm Cập nhật lịch để chạy lại ScheduleTool.'
                    )
                  : labelOf(
                      t,
                      'requirements.gate2ScheduleMissingBanner',
                      'Pack chưa có resource.schedule (chỉ có phân công). Ngày đang hiện tạm từ effort — bấm Cập nhật lịch để ScheduleTool ghi lịch thật.'
                    )}
              </p>
              {typeof onRefreshSchedule === 'function' ? (
                <button
                  type="button"
                  disabled={busy || String(howStatus).toLowerCase() === 'pending'}
                  onClick={handleRefreshSchedule}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-600/40 bg-background px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CalendarClock className="h-3.5 w-3.5" />
                  )}
                  {labelOf(t, 'requirements.gate2ScheduleRefreshCta', 'Cập nhật lịch')}
                </button>
              ) : null}
            </div>
          ) : null}
          <Gate1SectionReviewTable
            section={activeSection}
            rows={activeRows}
            decisions={decisions}
            setDecision={setDecision}
            showSubmit={allowDecide}
            busy={busy}
            t={t}
            headerTone={activeHasIssue || scheduleDirty ? 'warn' : 'ok'}
            tableConfig={assignmentTableConfig}
          />
          <Gate2SprintScopePanel
            row={sprintScopeRow}
            onClose={() => setSprintScopeRow(null)}
            t={t}
          />
          <Gate2TcDetailPanel
            row={tcDetailRow}
            onClose={() => setTcDetailRow(null)}
            t={t}
          />
          <AssignmentScheduleDetailDrawer
            row={scheduleDetailRow}
            pack={pack}
            onClose={() => setScheduleDetailRow(null)}
            t={t}
          />
        </>
      ) : activeSection ? (
        <>
          {activeSection === 'dependencies' ? (
            <DependencyFlowPanel pack={pack} rows={[]} t={t} />
          ) : null}
          <Gate1MissingSectionPanel
            sectionLabel={activeLabel}
            sectionKey={activeSection}
            status={activeTab?.missing ? 'NO_DATA' : 'EMPTY'}
            coverageReason={activeTab?.coverageReason || null}
            isCustomerRawIntake={false}
            softHintKey={
              activeSection === 'assignments'
                ? 'requirements.gate2AssignMissingSoftHint'
                : activeSection === 'dependencies'
                  ? dependencyEmptySoftHintKey(pack)
                  : 'requirements.gate2MissingSoftHint'
            }
            softHintFallback={
              activeSection === 'assignments'
                ? 'Chưa có phân công/ngày — chạy HOW (ScheduleTool) trên Monitor hoặc bổ sung tay.'
                : activeSection === 'dependencies'
                  ? 'Chưa có cạnh phụ thuộc từ lần chạy HOW — xem banner trạng thái phân tích (nếu có).'
                  : 'Chưa có đề xuất AI cho section này — chạy HOW trên Monitor hoặc bổ sung tay.'
            }
            t={t}
          />
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {showParallel ? (
          <button
            type="button"
            disabled={busy || howStatus !== 'ready' || !activeTrack}
            onClick={handleTrackSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {labelOf(t, 'requirements.gate2TrackSubmit', 'Xác nhận review')}
          </button>
        ) : null}
        {showPo ? (
          <>
            <button
              type="button"
              disabled={busy || (howStatus !== 'ready' && howStatus !== 'confirmed')}
              onClick={handlePoApprove}
              title={
                hasSoftWarnings
                  ? labelOf(
                      t,
                      'requirements.gate2SoftWarnHint',
                      'Có section thiếu / cảnh báo — sẽ hỏi xác nhận khi duyệt'
                    )
                  : !canPromote
                    ? labelOf(
                        t,
                        'requirements.gate2PromotePermHint',
                        'Cần quyền PO (planning) hoặc tạo dự án từ pack để kích hoạt board'
                      )
                    : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/40 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {howStatus === 'confirmed'
                ? labelOf(t, 'requirements.gate2PromotePhase2', 'Chuyển sang phase 2')
                : labelOf(t, 'requirements.gate2PoApprove', 'Duyệt Gate 2')}
            </button>
            {howStatus !== 'confirmed' ? (
              <button
                type="button"
                disabled={busy}
                onClick={onPoReject}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-40"
              >
                <XCircle className="h-4 w-4" />
                {labelOf(t, 'requirements.gate2PoReject', 'Từ chối — trả PM')}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={dirtySubmitOpen}
        onClose={() => setDirtySubmitOpen(false)}
        onConfirm={() => {
          setDirtySubmitOpen(false);
          submitTrack();
        }}
        title={labelOf(t, 'requirements.gate2ScheduleDirtySubmitTitle', 'Lịch chưa cập nhật')}
        message={labelOf(
          t,
          'requirements.gate2ScheduleDirtySubmitMessage',
          'Bạn đã đổi phân công/ngày nhưng chưa Cập nhật lịch. Vẫn gửi duyệt với lịch có thể lệch?'
        )}
        confirmText={labelOf(t, 'requirements.gate2ScheduleDirtySubmitConfirm', 'Vẫn gửi')}
        cancelText={labelOf(t, 'common.cancel', 'Hủy')}
        variant="default"
      />
    </div>
  );
}
