/**
 * Read-only HOW run results on Monitor — visible to BA / PO / PM (no Gate2 decisions).
 * Reuses buildGate2ProposalItems + Gate2 column config.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildGate2ProposalItems } from '../buildGate2ProposalItems';
import {
  GATE2_SCROLL_PAGE_SIZE,
  GATE2_TABLE_BODY_HEIGHT_CLASS,
  getGate2ColumnsForSection,
  getGate2RowId,
} from '../gate2/gate2SectionTableConfig';
import Gate2SprintScopePanel from '../gate2/Gate2SprintScopePanel';
import { useProjectMemberNames } from '../planning/useProjectMemberNames';
import { shouldShowHowMonitorResults } from './howMonitorResultsVisibility';
import HowPlanSummaryChips from './HowPlanSummaryChips';
import HitlSectionTabList from './HitlSectionTabList';
import DependencyFlowPanel from '../gate2/DependencyFlowPanel';
import QualityReviewPanel from '../gate2/QualityReviewPanel';

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

export { shouldShowHowMonitorResults };

function sectionHasIssue(tab, bySection) {
  if (!tab) return false;
  const isMissing = Boolean(tab.missing) || !(bySection[tab.key]?.length || tab.count);
  const hasConflict = Boolean(tab.hasConflict) || Number(tab.conflictCount) > 0;
  return isMissing || hasConflict;
}

function ReadOnlyResultsTable({ section, rows, t, headerTone = 'ok', onOpenSprintScope = null }) {
  const columns = useMemo(
    () => getGate2ColumnsForSection(section, { onOpenSprintScope }),
    [section, onOpenSprintScope]
  );
  const [visibleCount, setVisibleCount] = useState(GATE2_SCROLL_PAGE_SIZE);
  const sentinelRef = useRef(null);
  const scrollRootRef = useRef(null);
  const isWarnHeader = headerTone === 'warn';

  useEffect(() => {
    setVisibleCount(GATE2_SCROLL_PAGE_SIZE);
  }, [section]);

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const hasMore = visibleCount < rows.length;

  useEffect(() => {
    if (!hasMore) return undefined;
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + GATE2_SCROLL_PAGE_SIZE, rows.length));
        }
      },
      { root, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, rows.length, section, visibleCount]);

  if (!rows.length) return null;

  const theadClass = isWarnHeader
    ? 'sticky top-0 z-[1] border-b border-amber-600/40 bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-50'
    : 'sticky top-0 z-[1] border-b border-emerald-600/40 bg-emerald-100 text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-50';

  return (
    <div className="mt-3 space-y-2">
      <div
        ref={scrollRootRef}
        className={`${GATE2_TABLE_BODY_HEIGHT_CLASS} overflow-auto rounded-md border bg-card text-foreground shadow-sm overscroll-contain ${
          isWarnHeader ? 'border-amber-600/40' : 'border-emerald-600/40'
        }`}
      >
        <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
          <thead className={theadClass}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-2 py-1.5 text-xs font-semibold"
                  style={{ minWidth: col.minPx || 64 }}
                >
                  {labelOf(t, col.headerKey, col.headerFallback)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const id = getGate2RowId(row, index);
              const status = String(row.status || '').toUpperCase();
              const warn =
                status === 'CRITICAL' ||
                status === 'BLOCKING' ||
                status === 'OVERLOAD' ||
                status === 'UNASSIGNED';
              return (
                <tr
                  key={`${id}-${index}`}
                  className={`border-t border-border ${warn ? 'bg-amber-500/10' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="max-w-[16rem] px-2 py-1.5 align-top text-foreground">
                      <span className="break-words">
                        {typeof col.render === 'function'
                          ? col.render(row, t, { decision: null })
                          : row[col.field] || '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasMore ? <div ref={sentinelRef} className="h-4 w-full" aria-hidden /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {labelOf(t, 'requirements.phase1Gate1Showing', 'Đang hiện')} {visibleRows.length}/
          {rows.length}
        </span>
        {hasMore ? (
          <button
            type="button"
            className="rounded border border-border px-2 py-1 hover:bg-muted/50"
            onClick={() =>
              setVisibleCount((n) => Math.min(n + GATE2_SCROLL_PAGE_SIZE, rows.length))
            }
          >
            {labelOf(t, 'common.loadMore', 'Tải thêm')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function emptySectionCopy(section, pack, t) {
  const container = pack?.aiAnalysis || pack?.container || pack || {};
  const depSection = container?.analyses?.dependency || {};
  const depMeta = depSection.meta || {};
  const depSource = String(depMeta.source || '').trim();
  const analysisStatus = String(
    depSection.analysisStatus || depMeta.analysisStatus || ''
  )
    .trim()
    .toUpperCase();
  if (section === 'dependencies') {
    if (analysisStatus === 'COMPLETE_NO_EDGES') {
      return labelOf(
        t,
        'requirements.aiHitlMonitorResultsEmptyDepsComplete',
        'Đã phân tích phụ thuộc: LLM kết luận không có cạnh hỗ trợ (COMPLETE_NO_EDGES). Schedule có thể chạy với DAG rỗng.'
      );
    }
    if (analysisStatus === 'SKIPPED' || depSource === 'llm_skipped') {
      return labelOf(
        t,
        'requirements.aiHitlMonitorResultsEmptyDepsSkipped',
        'Phụ thuộc: LLM tắt (SKIPPED) — chưa phân tích. Bật LLM và chạy lại HOW; Schedule chưa sẵn sàng.'
      );
    }
    if (analysisStatus === 'FAILED' || depSource === 'llm_failed') {
      return labelOf(
        t,
        'requirements.aiHitlMonitorResultsEmptyDepsFailed',
        'Phụ thuộc: phân tích thất bại (FAILED / timeout). Không đồng nghĩa “không có phụ thuộc”. Chạy lại HOW.'
      );
    }
    if (
      analysisStatus === 'SEMANTIC_INCOMPLETE' ||
      depSource === 'semantic_incomplete'
    ) {
      return labelOf(
        t,
        'requirements.aiHitlMonitorResultsEmptyDepsSemantic',
        'Phụ thuộc trống: thiếu WBS leaf (SEMANTIC_INCOMPLETE). Sửa WbsTool rồi chạy lại HOW.'
      );
    }
    if (analysisStatus === 'INCOMPLETE' || analysisStatus === 'PARTIAL' || analysisStatus === 'INVALID') {
      return labelOf(
        t,
        'requirements.aiHitlMonitorResultsEmptyDepsPartial',
        'Phụ thuộc: phân tích chưa đủ để lên lịch (INCOMPLETE/PARTIAL/INVALID). Xem banner / câu hỏi mở trên tab này.'
      );
    }
    if (Number(depMeta.llmCalls) === 0 && !analysisStatus) {
      return labelOf(
        t,
        'requirements.aiHitlMonitorResultsEmptyDepsSemantic',
        'Phụ thuộc trống: DependencyTool fail-closed (semantic_incomplete / chưa gọi LLM). Thường do WbsTool lỗi trước đó hoặc chưa có leaf task lúc chạy. Chạy lại HOW sau khi WBS ổn.'
      );
    }
    return labelOf(
      t,
      'requirements.aiHitlMonitorResultsEmptyDeps',
      'Chưa có cạnh phụ thuộc từ lần chạy HOW (LLM không đề xuất hoặc bị reject).'
    );
  }
  if (section === 'assignments') {
    return labelOf(
      t,
      'requirements.aiHitlMonitorResultsEmptyAssignments',
      'Chưa có phân công/ngày trên leaf. Chạy HOW (ScheduleTool) — ngày bắt đầu/kết thúc nằm trên tab Phân công.'
    );
  }
  return labelOf(
    t,
    'requirements.aiHitlMonitorResultsEmptySection',
    'Section này chưa có dữ liệu (Gate1 rollup hoặc lần chạy HOW).'
  );
}

function EmptySectionPanel({ section, pack, t }) {
  return (
    <div
      className={`mt-3 flex ${GATE2_TABLE_BODY_HEIGHT_CLASS} flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-3 text-center`}
    >
      <p className="text-xs text-muted-foreground">{emptySectionCopy(section, pack, t)}</p>
    </div>
  );
}

/**
 * Monitor HOW results — read-only; no role gate (BA / PO / PM).
 */
export default function HowMonitorResultsPanel({ pack = null, t }) {
  const projectId = resolvePackProjectId(pack);
  const nameByUserId = useProjectMemberNames(projectId, resolvePackOrgId(pack));
  const bundle = useMemo(
    () => buildGate2ProposalItems({ pack, nameByUserId, t }),
    [pack, nameByUserId, t]
  );
  const bySection = bundle.proposalBySection || {};
  const sectionTabs = bundle.proposalSections || [];
  const hasRows = (bundle.items || []).length > 0;

  const [activeSection, setActiveSection] = useState('');
  const [sprintScopeRow, setSprintScopeRow] = useState(null);
  const openSprintScope = useCallback((row) => setSprintScopeRow(row), []);

  useEffect(() => {
    setActiveSection((prev) => {
      if (prev && sectionTabs.some((tab) => tab.key === prev)) return prev;
      const withConflict = sectionTabs.find((tab) => tab.hasConflict || tab.conflictCount > 0);
      if (withConflict?.key) return withConflict.key;
      const withItems = sectionTabs.find((tab) => (bySection[tab.key]?.length || tab.count || 0) > 0);
      return withItems?.key || sectionTabs[0]?.key || '';
    });
  }, [sectionTabs, bySection]);

  if (!hasRows) return null;

  const activeRows = bySection[activeSection] || [];
  const activeTab = sectionTabs.find((tab) => tab.key === activeSection);
  const activeMissing = Boolean(activeTab?.missing) || activeRows.length === 0;
  const activeHasIssue = sectionHasIssue(activeTab, bySection);

  return (
    <section
      className="rounded-md border border-border bg-card px-3 py-3"
      aria-label={labelOf(t, 'requirements.aiHitlMonitorResultsTitle', 'Kết quả chạy HOW')}
    >
      <h3 className="text-sm font-semibold text-foreground">
        {labelOf(t, 'requirements.aiHitlMonitorResultsTitle', 'Kết quả chạy HOW')}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {labelOf(
          t,
          'requirements.aiHitlMonitorResultsHint',
          'Bảng kết quả kế hoạch (scope, WBS, phụ thuộc, phân công, lịch, sprint/release, rủi ro/assumptions, quality) — gồm rollup Gate1 + HOW. BA / PO / PM đều xem được. Duyệt quyết định ở tab Duyệt.'
        )}
      </p>

      <HowPlanSummaryChips pack={pack} t={t} />

      <HitlSectionTabList
        tabs={sectionTabs}
        activeKey={activeSection}
        onSelect={setActiveSection}
        tabHasIssue={(tab) => sectionHasIssue(tab, bySection)}
        t={t}
        ariaLabel={labelOf(
          t,
          'requirements.aiHitlMonitorHowSectionTabsAria',
          'Các section HOW'
        )}
      />

      {activeSection === 'quality' ? (
        <QualityReviewPanel pack={pack} rows={activeRows} t={t} />
      ) : !activeMissing && activeRows.length ? (
        <>
          {activeSection === 'dependencies' ? (
            <DependencyFlowPanel pack={pack} rows={activeRows} t={t} />
          ) : null}
          <ReadOnlyResultsTable
            section={activeSection}
            rows={activeRows}
            t={t}
            headerTone={activeHasIssue ? 'warn' : 'ok'}
            onOpenSprintScope={openSprintScope}
          />
          <Gate2SprintScopePanel
            row={sprintScopeRow}
            onClose={() => setSprintScopeRow(null)}
            t={t}
          />
        </>
      ) : activeSection ? (
        <>
          {activeSection === 'dependencies' ? (
            <DependencyFlowPanel pack={pack} rows={[]} t={t} />
          ) : null}
          <EmptySectionPanel section={activeSection} pack={pack} t={t} />
        </>
      ) : null}
    </section>
  );
}
