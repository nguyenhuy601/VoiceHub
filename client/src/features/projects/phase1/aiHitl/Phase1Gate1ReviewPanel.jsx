import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Gate1SectionReviewTable from '../gate1/Gate1SectionReviewTable';
import Gate1FrBacklogSubpanel from '../gate1/Gate1FrBacklogSubpanel';
import Gate1MissingSectionPanel from '../gate1/Gate1MissingSectionPanel';
import HitlSectionTabList from './HitlSectionTabList';
import {
  areGate1SectionDecisionsComplete,
  countGate1PendingDecisions,
  getGate1RowId,
  seedGate1EditedPayload,
  getGate1ColumnsForSection,
} from '../gate1/gate1SectionTableConfig';
import {
  areGate1CreateRowsReady,
  buildGate1AddedRow,
  isGate1SectionAddable,
  mergeGate1SectionRows,
  nextGate1LogicalId,
} from '../gate1/gate1AddRow';
import GateAChecksPanel, {
  listMissingSectionRows,
} from '../../../requirements/GateAChecksPanel';
import { sectionHasUnresolvedIntegrityIssues } from '../gate1/resolveConflictAmbiguityUi';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value && value !== key) return value;
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
    });
    map[key][map[key].length - 1].sectionLabel = row.sectionLabel || key;
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
  clearDecision: controlledClearDecision = null,
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
  // Stuck recover: under_review nhưng mất GateSubmission ACTIVE → BA phải submit lại
  const needsBaResubmit =
    underReview && Boolean(canSubmit) && !canApprove && !activeSubmissionId;
  // Row actions (checkbox + Accept/Edit/Reject) — BA panel only; SoD: approver never gets BA CTA
  const allowDecide =
    Boolean(canSubmit) &&
    !canApprove &&
    (reviewLaneView === 'showBaPanel' ||
      needsBaResubmit ||
      (!reviewLaneView &&
        (packStatus === 'draft' ||
          packStatus === 'approved' ||
          packStatus === 'changes_requested' ||
          underReview)));
  // Footer «Xác nhận duyệt» for BA only
  const showSubmit = allowDecide;

  const serverBySection = useMemo(() => bySectionFromSummary(summary), [summary]);
  const [addedRows, setAddedRows] = useState([]);
  const addedSeedVersionRef = useRef(null);

  // Clear local BA-added drafts when reviewVersion / pack review epoch changes
  useEffect(() => {
    if (!active) {
      setAddedRows([]);
      addedSeedVersionRef.current = null;
      return;
    }
    const version = summary?.reviewVersion ?? 0;
    if (addedSeedVersionRef.current === version) return;
    addedSeedVersionRef.current = version;
    setAddedRows([]);
  }, [active, summary?.reviewVersion]);

  const bySection = useMemo(() => {
    const merged = {};
    const keys = new Set([
      ...Object.keys(serverBySection || {}),
      ...addedRows.map((r) => String(r.section || '').trim()).filter(Boolean),
    ]);
    for (const key of keys) {
      merged[key] = mergeGate1SectionRows(serverBySection[key] || [], addedRows, key);
    }
    return merged;
  }, [serverBySection, addedRows]);

  const sectionTabs = useMemo(() => {
    const base =
      Array.isArray(summary?.proposalSections) && summary.proposalSections.length
        ? summary.proposalSections
        : Object.entries(serverBySection).map(([key, rows]) => ({
            key,
            label: rows[0]?.sectionLabel || key,
            count: rows.length,
            missing: !rows.length,
          }));
    return base.map((tab) => {
      const mergedCount = bySection[tab.key]?.length || 0;
      return {
        ...tab,
        count: mergedCount,
        missing: mergedCount === 0,
      };
    });
  }, [summary, serverBySection, bySection]);

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
    // only reseed when reviewVersion changes
  }, [active, summary?.reviewVersion, isControlled]);

  const readyForGate1 = summary?.readyForGate1 !== false;
  const decisionsComplete = useMemo(
    () => areGate1SectionDecisionsComplete(bySection, decisions),
    [bySection, decisions]
  );
  const createRowsReady = useMemo(
    () => areGate1CreateRowsReady(bySection, decisions, getGate1RowId),
    [bySection, decisions]
  );
  const pendingDecisionCount = useMemo(
    () => countGate1PendingDecisions(bySection, decisions),
    [bySection, decisions]
  );
  const canConfirmSubmit = readyForGate1 && decisionsComplete && createRowsReady;
  const gateAWarnSections = useMemo(() => {
    const checks = Array.isArray(summary?.gateA?.checks) ? summary.gateA.checks : [];
    const missingCheck = checks.find((c) => c?.id === 'missing_sections');
    const rows = listMissingSectionRows(missingCheck?.detail);
    return new Set(rows.map((r) => r.section));
  }, [summary?.gateA]);

  const sectionHasIssue = (tab) => {
    if (!tab) return false;
    const rows = bySection[tab.key] || [];
    const isMissing = Boolean(tab.missing) || !(rows.length || tab.count);
    // Re-check vs current edits — không giữ icon theo snapshot integrity cũ
    const hasConflict = sectionHasUnresolvedIntegrityIssues(
      rows,
      decisions,
      getGate1RowId
    );
    return isMissing || hasConflict || gateAWarnSections.has(tab.key);
  };

  const activeTab = sectionTabs.find((tab) => tab.key === activeSection) || null;
  const activeRows = bySection[activeSection] || [];
  const activeLabel = activeTab?.label || activeSection || '—';
  const sectionAddable = isGate1SectionAddable(activeSection);
  const showAddableTable =
    Boolean(activeSection) &&
    (activeRows.length > 0 || (allowDecide && sectionAddable));
  const activeMissing =
    !showAddableTable &&
    (Boolean(activeTab?.missing) || activeRows.length === 0);
  const activeHasIssue = sectionHasIssue(activeTab);

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

  const clearDecision = useCallback(
    (logicalId) => {
      const id = String(logicalId || '').trim();
      if (!id) return;
      if (isControlled && typeof controlledClearDecision === 'function') {
        controlledClearDecision(id);
        return;
      }
      setLocalDecisions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [isControlled, controlledClearDecision]
  );

  const handleAddRow = useCallback(
    (sectionKey) => {
      const sec = String(sectionKey || activeSection || '').trim();
      if (!allowDecide || !isGate1SectionAddable(sec)) return;
      const existing = mergeGate1SectionRows(serverBySection[sec] || [], addedRows, sec);
      const logicalId = nextGate1LogicalId(sec, existing);
      const row = buildGate1AddedRow({ section: sec, logicalId });
      const columns = getGate1ColumnsForSection(sec);
      setAddedRows((prev) => [...prev, row]);
      setDecision(logicalId, {
        action: 'create',
        section: sec,
        editedPayload: seedGate1EditedPayload(row, columns),
      });
    },
    [allowDecide, activeSection, serverBySection, addedRows, setDecision]
  );

  const handleRemoveAddedRow = useCallback(
    (logicalId) => {
      const id = String(logicalId || '').trim();
      if (!id) return;
      setAddedRows((prev) => prev.filter((r) => String(r.logicalId || r.id) !== id));
      clearDecision(id);
    },
    [clearDecision]
  );

  const handleSubmit = () => {
    if (typeof onSubmit !== 'function') return;
    if (!areGate1SectionDecisionsComplete(bySection, decisions)) return;
    if (!areGate1CreateRowsReady(bySection, decisions, getGate1RowId)) return;
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
          : needsBaResubmit
            ? labelOf(
                t,
                'requirements.phase1Gate1SubmitMissingSubmission',
                'BA submit chưa ghi nhận GateSubmission — thử «Xác nhận duyệt» lại trước khi PO duyệt.'
              )
          : underReview && !canApprove
            ? labelOf(
                t,
                'requirements.phase1Gate1WaitingPo',
                'Đã gửi duyệt. Chờ PO duyệt để sang Phase 2.'
              )
            : ''}
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
      {summary?.gateA ||
      (showSubmit && pendingDecisionCount > 0) ||
      summary?.poReapprovalRequired ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {summary?.gateA ? <GateAChecksPanel gateA={summary.gateA} t={t} /> : null}
          {showSubmit && pendingDecisionCount > 0 ? (
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {labelOf(
                t,
                'requirements.phase1Gate1PendingDecisions',
                'Còn {count} dòng chưa quyết định (mọi section)',
                { count: pendingDecisionCount }
              )}
            </span>
          ) : null}
          {summary?.poReapprovalRequired ? (
            <span className="text-xs font-medium text-foreground">
              {labelOf(t, 'requirements.phase1Gate1PoReapproval', 'Cần PO duyệt lại (mục nhạy cảm)')}
            </span>
          ) : null}
        </div>
      ) : null}

      <HitlSectionTabList
        tabs={sectionTabs}
        activeKey={activeSection}
        onSelect={setActiveSection}
        tabHasIssue={sectionHasIssue}
        t={t}
        ariaLabel={labelOf(
          t,
          'requirements.phase1Gate1SectionTabsAria',
          'Các section Gate 1'
        )}
      />

      {showAddableTable ? (
        <Gate1SectionReviewTable
          section={activeSection}
          rows={activeRows}
          decisions={decisions}
          setDecision={setDecision}
          showSubmit={allowDecide}
          busy={busy}
          t={t}
          headerTone={activeHasIssue ? 'warn' : 'ok'}
          canAddRow={allowDecide && sectionAddable}
          onAddRow={handleAddRow}
          onRemoveAddedRow={handleRemoveAddedRow}
        />
      ) : summary?.done && activeSection && activeMissing ? (
        <Gate1MissingSectionPanel
          sectionLabel={activeLabel}
          sectionKey={activeSection}
          status={activeTab?.status || 'NO_DATA'}
          coverageReason={activeTab?.coverageReason || null}
          isCustomerRawIntake={Boolean(summary?.isCustomerRawIntake)}
          t={t}
        />
      ) : null}

      {activeSection === 'functionalRequirements' ? (
        <Gate1FrBacklogSubpanel
          rows={bySection.backlogStructure || []}
          decisions={decisions}
          setDecision={setDecision}
          showSubmit={allowDecide}
          busy={busy}
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
                  : !createRowsReady
                    ? labelOf(
                        t,
                        'requirements.phase1Gate1CreateTitleRequired',
                        'Điền tiêu đề cho dòng BA vừa thêm trước khi xác nhận duyệt'
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
