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
import { resolveHowPlanSummary } from './howPlanSummary';

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
};

function HowPlanSummaryBlock({ pack, t }) {
  const summary = resolveHowPlanSummary(pack);
  if (!summary.hasSummary) return null;
  const dc = summary.deadlineConflict;
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span>
        {labelOf(t, 'requirements.gate2CriticalPathDays', 'CP (ngày)')}:{' '}
        {summary.criticalPathDays == null ? '—' : summary.criticalPathDays}
      </span>
      <span>
        {labelOf(t, 'requirements.gate2ConflictCount', 'Conflicts')}: {summary.conflictCount}
      </span>
      <span>
        {labelOf(t, 'requirements.gate2UnassignedCount', 'Unassigned')}:{' '}
        {summary.unassignedCount}
      </span>
      {dc ? (
        <span className="font-medium text-amber-800 dark:text-amber-200">
          {labelOf(t, 'requirements.gate2Deadline', 'Deadline')}: {dc.deadline || '—'} ·{' '}
          {labelOf(t, 'requirements.gate2EstimatedEnd', 'Est. end')}: {dc.estimatedEnd || '—'}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Gate 2 Planning Review — same table UX as Gate1, PM→PO (BA→PM).
 */
export default function Phase2Gate2ReviewPanel({
  reviewView = 'waitingPm',
  howStatus = '',
  reviewLane = 'pm',
  rejectReason = '',
  busy = false,
  canPromote = false,
  pack = null,
  decisions: controlledDecisions = null,
  setDecision: controlledSetDecision = null,
  t,
  onPmSubmit,
  onPoApprove,
  onPoReject,
}) {
  const bundle = useMemo(() => buildGate2ProposalItems({ pack }), [pack]);
  const bySection = bundle.proposalBySection || {};
  const sectionTabs = bundle.proposalSections || [];

  const [activeSection, setActiveSection] = useState('');
  const [localDecisions, setLocalDecisions] = useState({});
  const seededReviewVersionRef = useRef(null);
  const isControlled =
    controlledDecisions != null && typeof controlledSetDecision === 'function';
  const decisions = isControlled ? controlledDecisions : localDecisions;

  useEffect(() => {
    setActiveSection((prev) => {
      if (prev && sectionTabs.some((tab) => tab.key === prev)) return prev;
      const withConflict = sectionTabs.find((tab) => tab.hasConflict || tab.conflictCount > 0);
      if (withConflict?.key) return withConflict.key;
      const withItems = sectionTabs.find((tab) => (bySection[tab.key]?.length || tab.count || 0) > 0);
      return withItems?.key || sectionTabs[0]?.key || '';
    });
  }, [sectionTabs, bySection]);

  useEffect(() => {
    if (isControlled) return;
    const version = bundle.reviewVersion ?? 0;
    if (seededReviewVersionRef.current === version) return;
    seededReviewVersionRef.current = version;
    setLocalDecisions({ ...(bundle.reviewDecisions || {}) });
  }, [bundle.reviewVersion, bundle.reviewDecisions, isControlled]);

  const decisionsComplete = useMemo(
    () => areGate2SectionDecisionsComplete(bySection, decisions),
    [bySection, decisions]
  );
  const pendingDecisionCount = useMemo(
    () => countGate2PendingDecisions(bySection, decisions),
    [bySection, decisions]
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

  if (reviewView === 'waitingPm') {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.gate2WaitingPm',
            'Chờ PM xác nhận kế hoạch trên tab Duyệt. (PO: đợi PM gửi — không chỉnh quyết định PM.)'
          )}
        </p>
        <HowPlanSummaryBlock pack={pack} t={t} />
      </div>
    );
  }

  if (reviewView === 'waitingPo') {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.gate2WaitingPo',
            'PM đã gửi duyệt. Chờ PO xác nhận Gate 2 & kích hoạt dự án.'
          )}
        </p>
        <HowPlanSummaryBlock pack={pack} t={t} />
      </div>
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

  const showPm = reviewView === 'showPmPanel';
  const showPo = reviewView === 'showPoPanel';
  const allowDecide = showPm;
  const decisionsOk = decisionsComplete;
  const activeTab = sectionTabs.find((tab) => tab.key === activeSection) || null;
  const activeRows = bySection[activeSection] || [];
  const activeLabel = activeTab?.label || activeSection || '—';
  const activeMissing = Boolean(activeTab?.missing) || activeRows.length === 0;
  const missingSections = sectionTabs.filter(
    (tab) => tab.missing || !(bySection[tab.key]?.length || tab.count)
  );
  const missingCount = missingSections.length;
  const conflictSectionCount = sectionTabs.filter(
    (tab) => tab.hasConflict || Number(tab.conflictCount) > 0
  ).length;
  const hasSoftWarnings = missingCount > 0 || conflictSectionCount > 0;

  const handlePmSubmit = () => {
    if (typeof onPmSubmit !== 'function') return;
    onPmSubmit({
      reviewDecisions: decisions,
      reviewVersion: bundle.reviewVersion,
      missingCount,
      conflictSectionCount,
      missingSectionKeys: missingSections.map((tab) => tab.key),
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
          : labelOf(
              t,
              'requirements.gate2PmHint',
              'PM quyết từng item (Accept/Edit/Reject). Gửi PO duyệt khi đủ quyết định.'
            )}
      </p>
      {showPo && bundle.activeSubmissionId ? (
        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
          <p className="font-medium">
            {labelOf(
              t,
              'requirements.gate2PmSubmissionBanner',
              'Bản PM đã gửi duyệt — xem quyết định từng section (chỉ đọc), rồi Duyệt hoặc Từ chối.'
            )}
          </p>
        </div>
      ) : null}
      {rejectReason ? (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200">
          {labelOf(t, 'requirements.gate2LastReject', 'PO từ chối lần trước')}: {rejectReason}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>phase_how: {howStatus || '—'}</span>
        <span>lane: {reviewLane || '—'}</span>
        {allowDecide && pendingDecisionCount > 0 ? (
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {labelOf(
              t,
              'requirements.phase1Gate1PendingDecisions',
              'Còn {count} dòng chưa quyết định (mọi section)',
              { count: pendingDecisionCount }
            )}
          </span>
        ) : null}
        {missingCount > 0 ? (
          <span>
            {labelOf(t, 'requirements.phase1Gate1MissingTabs', '{count} section thiếu dữ liệu', {
              count: missingCount,
            })}
          </span>
        ) : null}
        {conflictSectionCount > 0 ? (
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {labelOf(t, 'requirements.gate2ConflictSections', '{count} section có cảnh báo', {
              count: conflictSectionCount,
            })}
          </span>
        ) : null}
      </div>
      <HowPlanSummaryBlock pack={pack} t={t} />

      {sectionTabs.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sectionTabs.map((tab) => {
            const isMissing = Boolean(tab.missing) || !(bySection[tab.key]?.length || tab.count);
            const isActive = activeSection === tab.key;
            const hasConflict = Boolean(tab.hasConflict) || Number(tab.conflictCount) > 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  isActive
                    ? hasConflict
                      ? 'border-amber-600 bg-amber-500/20 text-foreground'
                      : 'border-primary bg-primary/10 text-foreground'
                    : hasConflict
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-100'
                      : isMissing
                        ? 'border-dashed border-border text-muted-foreground'
                        : 'border-border text-muted-foreground'
                }`}
              >
                {tab.label}
                {isMissing
                  ? ` · ${labelOf(t, 'requirements.phase1Gate1TabMissing', 'Thiếu')}`
                  : ` (${tab.count})`}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeSection && !activeMissing && activeRows.length ? (
        <Gate1SectionReviewTable
          section={activeSection}
          rows={activeRows}
          decisions={decisions}
          setDecision={setDecision}
          showSubmit={allowDecide}
          busy={busy}
          t={t}
          tableConfig={GATE2_TABLE_CONFIG}
        />
      ) : activeSection ? (
        <Gate1MissingSectionPanel
          sectionLabel={activeLabel}
          sectionKey={activeSection}
          status={activeTab?.missing ? 'NO_DATA' : 'EMPTY'}
          coverageReason={null}
          isCustomerRawIntake={false}
          t={t}
        />
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {showPm ? (
          <button
            type="button"
            disabled={busy || howStatus !== 'ready'}
            onClick={handlePmSubmit}
            title={
              !decisionsOk
                ? labelOf(
                    t,
                    'requirements.phase1Gate1ConfirmBlockedHint',
                    'Quyết định đủ mọi dòng ở tất cả section trước khi xác nhận duyệt'
                  )
                : hasSoftWarnings
                  ? labelOf(
                      t,
                      'requirements.gate2SoftWarnHint',
                      'Có section thiếu / cảnh báo — sẽ hỏi xác nhận khi gửi'
                    )
                  : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {labelOf(t, 'requirements.gate2PmSubmit', 'Gửi PO duyệt')}
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
