import { useEffect, useMemo, useRef, useState } from 'react';

import Gate1SectionReviewTable from '../gate1/Gate1SectionReviewTable';
import Gate1MissingSectionPanel from '../gate1/Gate1MissingSectionPanel';
import {
  areGate1SectionDecisionsComplete,
  countGate1PendingDecisions,
} from '../gate1/gate1SectionTableConfig';
import GateAChecksPanel from '../../../requirements/GateAChecksPanel';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

function bySectionFromSummary(summary) {
  if (summary?.proposalBySection && typeof summary.proposalBySection === 'object') {
    return summary.proposalBySection;
  }
  const map = {};
  const items = Array.isArray(summary?.proposalItems)
    ? summary.proposalItems
    : Array.isArray(summary?.reviewItems)
      ? summary.reviewItems
      : [];
  for (const row of items) {
    const key = row.section || 'functionalRequirements';
    if (!map[key]) map[key] = [];
    map[key].push({
      ...row,
      logicalId: row.logicalId || row.id,
      sectionLabel: row.sectionLabel || key,
    });
  }
  return map;
}

/**
 * Gate1 Analysis Review body — reusable in modal or AI HITL page.
 */
export default function Phase1Gate1ReviewPanel({
  active = true,
  packStatus = '',
  canSubmit = false,
  canApprove = false,
  reviewLaneView = '',
  summary = null,
  busy = false,
  /** Controlled decisions from parent (AI HITL page) — survives remount */
  decisions: controlledDecisions = null,
  setDecision: controlledSetDecision = null,
  t,
  onSubmit,
  onApprove,
  onReject,
  onClose,
  showClose = false,
  showActions = true,
  className = '',
}) {
  const underReview = packStatus === 'under_review';
  // Sequential lane: PO final Confirm/Reject only on po lane — never reuse BA CTA
  const showApprove =
    Boolean(canApprove) &&
    (reviewLaneView === 'showPoPanel' ||
      (!reviewLaneView && underReview));
  const activeSubmissionId = summary?.activeSubmissionId || null;
  // Row actions (checkbox + Accept/Edit/Reject) — BA panel only; SoD: approver never gets BA CTA
  const allowDecide =
    Boolean(canSubmit) &&
    !canApprove &&
    (reviewLaneView === 'showBaPanel' ||
      (!reviewLaneView &&
        (packStatus === 'draft' ||
          packStatus === 'approved' ||
          packStatus === 'changes_requested' ||
          (underReview && Boolean(activeSubmissionId)))));
  // Footer «Xác nhận duyệt» for BA only
  const showSubmit = allowDecide;

  const bySection = useMemo(() => bySectionFromSummary(summary), [summary]);
  const sectionTabs = useMemo(() => {
    if (Array.isArray(summary?.proposalSections) && summary.proposalSections.length) {
      return summary.proposalSections;
    }
    return Object.entries(bySection).map(([key, rows]) => ({
      key,
      label: rows[0]?.sectionLabel || key,
      count: rows.length,
      missing: !rows.length,
    }));
  }, [summary, bySection]);

  const [activeSection, setActiveSection] = useState('');
  const [localDecisions, setLocalDecisions] = useState({});
  const seededReviewVersionRef = useRef(null);
  const isControlled =
    controlledDecisions != null && typeof controlledSetDecision === 'function';
  const decisions = isControlled ? controlledDecisions : localDecisions;

  useEffect(() => {
    if (!active) return;
    setActiveSection((prev) => {
      if (prev && sectionTabs.some((tab) => tab.key === prev)) return prev;
      const withConflict = sectionTabs.find((tab) => tab.hasConflict || tab.conflictCount > 0);
      if (withConflict?.key) return withConflict.key;
      const withItems = sectionTabs.find(
        (tab) => (bySection[tab.key]?.length || tab.count || 0) > 0
      );
      return withItems?.key || sectionTabs[0]?.key || '';
    });
  }, [active, sectionTabs, bySection]);

  // Uncontrolled: seed from server once per reviewVersion
  useEffect(() => {
    if (isControlled) return;
    if (!active) {
      setLocalDecisions({});
      seededReviewVersionRef.current = null;
      return;
    }
    const version = summary?.reviewVersion ?? 0;
    if (seededReviewVersionRef.current === version) return;
    seededReviewVersionRef.current = version;
    const fromServer =
      summary?.reviewDecisions && typeof summary.reviewDecisions === 'object'
        ? summary.reviewDecisions
        : {};
    setLocalDecisions({ ...fromServer });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reseed when reviewVersion changes
  }, [active, summary?.reviewVersion, isControlled]);

  const readyForGate1 = summary?.readyForGate1 !== false;
  const reviewComplete = Boolean(summary?.reviewComplete);
  const decisionsComplete = useMemo(
    () => areGate1SectionDecisionsComplete(bySection, decisions),
    [bySection, decisions]
  );
  const pendingDecisionCount = useMemo(
    () => countGate1PendingDecisions(bySection, decisions),
    [bySection, decisions]
  );
  const canConfirmSubmit = readyForGate1 && decisionsComplete;
  const conflictGate = summary?.conflictAmbiguity || null;
  const conflictBlocking = Array.isArray(conflictGate?.blocking) ? conflictGate.blocking : [];
  const conflictOpen = Boolean(conflictGate && conflictGate.passed === false && conflictBlocking.length);
  const activeTab = sectionTabs.find((tab) => tab.key === activeSection) || null;
  const activeRows = bySection[activeSection] || [];
  const activeLabel = activeTab?.label || activeSection || '—';
  const activeMissing = Boolean(activeTab?.missing) || activeRows.length === 0;
  const totalArtifacts = sectionTabs.reduce((sum, tab) => sum + (Number(tab.count) || 0), 0);
  const missingCount = sectionTabs.filter(
    (tab) => tab.missing || !(bySection[tab.key]?.length || tab.count)
  ).length;
  const conflictSectionCount = sectionTabs.filter(
    (tab) => tab.hasConflict || Number(tab.conflictCount) > 0
  ).length;

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

  const handleSubmit = () => {
    if (typeof onSubmit !== 'function') return;
    if (!areGate1SectionDecisionsComplete(bySection, decisions)) return;
    const expectedRevisionIds = { ...(summary?.expectedRevisionIds || {}) };
    for (const [logicalId, d] of Object.entries(decisions)) {
      if (d?.revisionId) expectedRevisionIds[logicalId] = String(d.revisionId);
    }
    onSubmit({
      reviewDecisions: decisions,
      reviewVersion: summary?.reviewVersion,
      expectedRevisionIds,
      withdrawSubmissionId: underReview && activeSubmissionId ? activeSubmissionId : null,
    });
  };

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">
        {reviewLaneView === 'showPoPanel' || (underReview && canApprove)
          ? labelOf(
              t,
              'requirements.phase1Gate1PoHint',
              'PO xem lại bản BA đã xác nhận — Xác nhận để sang Phase How, hoặc Từ chối để trả về BA.'
            )
          : underReview && !canApprove
            ? labelOf(
                t,
                'requirements.phase1Gate1WaitingPo',
                'Đã gửi duyệt. Chờ PO duyệt để sang Phase 2.'
              )
            : labelOf(
                t,
                'requirements.phase1Gate1ModalHint',
                'BA quyết từng item (Accept/Edit/Reject). Xác nhận duyệt để chuyển PO.'
              )}
      </p>
      {reviewLaneView === 'showPoPanel' && activeSubmissionId ? (
        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
          <p className="font-medium">
            {labelOf(
              t,
              'requirements.phase1Gate1BaSubmissionBanner',
              'Bản BA đã gửi duyệt — xem quyết định từng section (chỉ đọc), rồi Xác nhận hoặc Từ chối.'
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            {labelOf(t, 'requirements.phase1Gate1SubmissionId', 'Submission')}:{' '}
            {activeSubmissionId}
            {summary?.activeReviewId
              ? ` · ${labelOf(t, 'requirements.phase1Gate1ReviewId', 'Review')}: ${summary.activeReviewId}`
              : ''}
          </p>
        </div>
      ) : null}
      {summary?.gateA ? (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {labelOf(t, 'requirements.gateAPanelTitle', 'Gate A — chất lượng requirement')}
          </p>
          <GateAChecksPanel gateA={summary.gateA} t={t} />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>readyForGate1: {readyForGate1 ? 'true' : 'false'}</span>
        <span>reviewComplete: {reviewComplete ? 'true' : 'false'}</span>
        {showSubmit && pendingDecisionCount > 0 ? (
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
        {conflictOpen ? (
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {labelOf(
              t,
              'requirements.phase1Gate1IntegrityMeta',
              'Integrity: {count} lỗi cấu trúc · {sections} phần',
              { count: conflictBlocking.length, sections: conflictSectionCount || 1 }
            )}
          </span>
        ) : null}
        {summary?.poReapprovalRequired ? (
          <span className="font-medium text-foreground">
            {labelOf(t, 'requirements.phase1Gate1PoReapproval', 'Cần PO duyệt lại (mục nhạy cảm)')}
          </span>
        ) : null}
      </div>

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
                {hasConflict
                  ? ` · ${labelOf(t, 'requirements.phase1Gate1TabIntegrity', 'Integrity')} ${
                      tab.conflictCount || ''
                    }`
                  : ''}
              </button>
            );
          })}
        </div>
      ) : null}

      {summary?.done ? (
        <ul className="mt-3 space-y-1 text-sm text-foreground">
          <li>
            {labelOf(t, 'requirements.phase1Seeded', 'Đã seed {count} artifacts', {
              count: totalArtifacts || summary.g4RequirementCount || 0,
            })}
          </li>
          <li>
            {labelOf(t, 'requirements.phase1Citations', '{count} citations', {
              count: summary.citationCount || 0,
            })}
          </li>
        </ul>
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
        />
      ) : summary?.done && activeSection ? (
        <Gate1MissingSectionPanel
          sectionLabel={activeLabel}
          sectionKey={activeSection}
          status={activeTab?.status || 'NO_DATA'}
          coverageReason={activeTab?.coverageReason || null}
          isCustomerRawIntake={Boolean(summary?.isCustomerRawIntake)}
          t={t}
        />
      ) : null}

      {showActions ? (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {showClose && typeof onClose === 'function' ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              {labelOf(t, 'common.close', 'Đóng')}
            </button>
          ) : null}
          {showSubmit ? (
            <button
              type="button"
              disabled={busy || !canConfirmSubmit}
              onClick={handleSubmit}
              title={
                !decisionsComplete
                  ? labelOf(
                      t,
                      'requirements.phase1Gate1ConfirmBlockedHint',
                      'Quyết định đủ mọi dòng ở tất cả section trước khi xác nhận duyệt'
                    )
                  : !readyForGate1
                    ? labelOf(
                        t,
                        'requirements.phase1Gate1NotReadyHint',
                        'Chưa sẵn sàng Gate 1 (readyForGate1=false)'
                      )
                    : undefined
              }
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {labelOf(t, 'requirements.phase1Gate1ConfirmCta', 'Xác nhận duyệt')}
            </button>
          ) : null}
          {showApprove ? (
            <>
              {typeof onReject === 'function' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onReject}
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-40"
                >
                  {labelOf(t, 'requirements.phase1Gate1PoRejectCta', 'Từ chối')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={onApprove}
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {labelOf(t, 'requirements.phase1Gate1PoConfirmCta', 'Xác nhận')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
