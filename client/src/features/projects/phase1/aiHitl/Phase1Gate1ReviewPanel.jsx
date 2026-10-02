import { useEffect, useMemo, useState } from 'react';

import Gate1SectionReviewTable from '../gate1/Gate1SectionReviewTable';
import Gate1MissingSectionPanel from '../gate1/Gate1MissingSectionPanel';

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
  summary = null,
  busy = false,
  t,
  onSubmit,
  onApprove,
  onClose,
  showClose = false,
  showActions = true,
  className = '',
}) {
  const underReview = packStatus === 'under_review';
  const showApprove = underReview && canApprove;
  const showSubmit = !underReview && canSubmit;

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
  const [decisions, setDecisions] = useState({});

  useEffect(() => {
    if (!active) return;
    setActiveSection((prev) => {
      if (prev && sectionTabs.some((tab) => tab.key === prev)) return prev;
      const withItems = sectionTabs.find(
        (tab) => (bySection[tab.key]?.length || tab.count || 0) > 0
      );
      return withItems?.key || sectionTabs[0]?.key || '';
    });
  }, [active, sectionTabs, bySection]);

  useEffect(() => {
    if (!active) setDecisions({});
  }, [active, summary?.reviewVersion]);

  const readyForGate1 = summary?.readyForGate1 !== false;
  const reviewComplete = Boolean(summary?.reviewComplete);
  const activeTab = sectionTabs.find((tab) => tab.key === activeSection) || null;
  const activeRows = bySection[activeSection] || [];
  const activeLabel = activeTab?.label || activeSection || '—';
  const activeMissing = Boolean(activeTab?.missing) || activeRows.length === 0;
  const totalArtifacts = sectionTabs.reduce((sum, tab) => sum + (Number(tab.count) || 0), 0);
  const missingCount = sectionTabs.filter(
    (tab) => tab.missing || !(bySection[tab.key]?.length || tab.count)
  ).length;

  const setDecision = (logicalId, patch) => {
    setDecisions((prev) => ({
      ...prev,
      [logicalId]: { ...(prev[logicalId] || {}), ...patch },
    }));
  };

  const handleSubmit = () => {
    if (typeof onSubmit === 'function') {
      onSubmit({ reviewDecisions: decisions, reviewVersion: summary?.reviewVersion });
    }
  };

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">
        {underReview && !canApprove
          ? labelOf(
              t,
              'requirements.phase1Gate1WaitingPo',
              'Đã gửi duyệt. Chờ PO duyệt để sang Phase 2.'
            )
          : labelOf(
              t,
              'requirements.phase1Gate1ModalHint',
              'BA quyết từng item (Accept/Edit/Reject). PO duyệt sau khi reviewComplete.'
            )}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>readyForGate1: {readyForGate1 ? 'true' : 'false'}</span>
        <span>reviewComplete: {reviewComplete ? 'true' : 'false'}</span>
        {missingCount > 0 ? (
          <span>
            {labelOf(t, 'requirements.phase1Gate1MissingTabs', '{count} section thiếu dữ liệu', {
              count: missingCount,
            })}
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
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  isActive
                    ? 'border-primary bg-primary/10 text-foreground'
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
          showSubmit={showSubmit}
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
              disabled={busy || !readyForGate1}
              onClick={handleSubmit}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {labelOf(t, 'requirements.understandingGate1Cta', 'Gửi duyệt Gate 1')}
            </button>
          ) : null}
          {showApprove ? (
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {labelOf(t, 'requirements.phase1ApproveCta', 'Duyệt Gate 1 (PO)')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
