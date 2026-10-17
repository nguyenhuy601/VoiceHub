import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, CheckCircle2, XCircle } from 'lucide-react';
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
import { buildGate2ProposalItems } from '../buildGate2ProposalItems';
import { useProjectMemberNames } from '../planning/useProjectMemberNames';
import HowPlanSummaryChips from './HowPlanSummaryChips';
import HitlSectionTabList from './HitlSectionTabList';
import Gate2ConsolidationPanel from './Gate2ConsolidationPanel';
import { GATE2_DOMAIN_FOCUS_KEY, sectionsForTrack } from './gate2ReviewOwnership.js';

function resolvePackProjectId(pack) {
  const raw = pack?.projectId;
  if (raw && typeof raw === 'object') return String(raw._id || raw.id || '').trim();
  return String(raw || '').trim();
}

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value && value !== key) return value;
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
  /** WBS / Tasks: collapse work packages (or stories) — click to expand tasks. */
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
  const nameByUserId = useProjectMemberNames(projectId);
  const bundle = useMemo(
    () => buildGate2ProposalItems({ pack, nameByUserId, t }),
    [pack, nameByUserId, t]
  );
  const bySection = bundle.proposalBySection || {};
  const sectionTabs = bundle.proposalSections || [];

  const [activeSection, setActiveSection] = useState('');
  const [activeTrack, setActiveTrack] = useState('');
  const [localDecisions, setLocalDecisions] = useState({});
  const seededReviewVersionRef = useRef(null);
  const isControlled =
    controlledDecisions != null && typeof controlledSetDecision === 'function';
  const decisions = isControlled ? controlledDecisions : localDecisions;

  useEffect(() => {
    setActiveTrack((prev) => (parallelTracks.includes(prev) ? prev : parallelTracks[0] || ''));
  }, [parallelTracks]);

  const ownedSectionKeys = useMemo(
    () => (reviewView === 'showParallel' && activeTrack ? sectionsForTrack(activeTrack) : null),
    [reviewView, activeTrack]
  );
  const visibleTabs = useMemo(() => {
    if (!ownedSectionKeys?.length) return sectionTabs;
    return sectionTabs.filter((tab) => ownedSectionKeys.includes(tab.key));
  }, [sectionTabs, ownedSectionKeys]);
  const scopedBySection = useMemo(() => {
    if (!ownedSectionKeys?.length) return bySection;
    const next = {};
    for (const key of ownedSectionKeys) next[key] = bySection[key] || [];
    return next;
  }, [bySection, ownedSectionKeys]);

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

  const decisionsComplete = useMemo(
    () => areGate2SectionDecisionsComplete(scopedBySection, decisions),
    [scopedBySection, decisions]
  );
  const pendingDecisionCount = useMemo(
    () => countGate2PendingDecisions(scopedBySection, decisions),
    [scopedBySection, decisions]
  );

  const setDecision = (logicalId, patch) => {
    if (isControlled) {
      controlledSetDecision(logicalId, patch);
      return;
    }
    setLocalDecisions((prev) => ({
      ...prev,
      [logicalId]: { ...(prev[logicalId] || {}), ...patch },
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
          'Đang chờ các phần còn lại: PO (scope), Tech Lead (kỹ thuật), PM (tiến độ).'
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
      <div>
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.gate2LaneDone',
            'Gate 2 đã duyệt xong. Có thể kích hoạt / tiếp tục delivery.'
          )}
        </p>
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
              {labelOf(t, 'requirements.promoteProjectRetry', 'Kích hoạt / tiếp tục delivery')}
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
  const activeRows = bySection[activeSection] || [];
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

  const handleTrackSubmit = () => {
    if (typeof onTrackSubmit !== 'function' || !activeTrack) return;
    onTrackSubmit({
      track: activeTrack,
      reviewDecisions: decisions,
      reviewVersion: bundle.reviewVersion,
      decisionsComplete: decisionsOk,
      hasSoftWarnings: hasSoftWarnings || !decisionsOk,
    });
  };

  const handlePoApprove = () => {
    if (typeof onPoApprove !== 'function') return;
    onPoApprove({
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
      <p className="text-sm text-muted-foreground">
        {showPo
          ? labelOf(
              t,
              'requirements.gate2PoHint',
              'PO xem lại bản PM đã xác nhận — Duyệt để kích hoạt, hoặc Từ chối để trả về PM.'
            )
          : ''}
      </p>
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
              {track === 'po' ? 'PO' : track === 'tech' ? 'Tech Lead' : 'PM'}
            </button>
          ))}
        </div>
      ) : null}
      {showParallel && activeTrack ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {labelOf(
            t,
            GATE2_DOMAIN_FOCUS_KEY[activeTrack],
            activeTrack === 'po'
              ? 'Scope, priority, business value'
              : activeTrack === 'tech'
                ? 'Architecture, technical WBS, effort, risk'
                : 'Timeline, capacity, budget, feasibility'
          )}
        </p>
      ) : null}
      {showConsolidation || showChangeConfirm ? (
        <Gate2ConsolidationPanel
          mode={showChangeConfirm ? 'confirm' : 'consolidate'}
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
        <Gate1SectionReviewTable
          section={activeSection}
          rows={activeRows}
          decisions={decisions}
          setDecision={setDecision}
          showSubmit={allowDecide}
          busy={busy}
          t={t}
          headerTone={activeHasIssue ? 'warn' : 'ok'}
          tableConfig={GATE2_TABLE_CONFIG}
        />
      ) : activeSection ? (
        <Gate1MissingSectionPanel
          sectionLabel={activeLabel}
          sectionKey={activeSection}
          status={activeTab?.missing ? 'NO_DATA' : 'EMPTY'}
          coverageReason={null}
          isCustomerRawIntake={false}
          softHintKey="requirements.gate2MissingSoftHint"
          softHintFallback="Chưa có đề xuất AI cho section này — chạy HOW trên Monitor hoặc bổ sung tay."
          t={t}
        />
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
            {labelOf(t, 'requirements.gate2TrackSubmit', 'Xác nhận phần của tôi')}
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
                ? labelOf(t, 'requirements.promoteProjectRetry', 'Thử kích hoạt lại')
                : labelOf(t, 'requirements.gate2PoApprove', 'Duyệt Gate 2 & kích hoạt')}
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
    </div>
  );
}
