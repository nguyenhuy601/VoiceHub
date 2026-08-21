import { useState } from 'react';
import RequirementExcelPreviewGrid from './RequirementExcelPreviewGrid';

function PreviewTreeNode({ node, depth = 0 }) {
  if (!node) return null;
  const hours = node.estimateHours;
  const skills = node.suggestedSkills || [];
  const roleKey = String(node.suggestedRoleKey || '').trim();
  const hasStaffing = (hours != null && hours > 0) || skills.length > 0 || Boolean(roleKey);
  return (
    <li className="text-sm">
      <div style={{ paddingLeft: depth * 12 }} className="flex flex-wrap items-center gap-1.5">
        <span>{node.name || node.externalId}</span>
        {hasStaffing ? (
          <span className="inline-flex flex-wrap gap-1">
            {hours != null && hours > 0 ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {hours}h
              </span>
            ) : null}
            {roleKey ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {roleKey}
              </span>
            ) : null}
            {skills.slice(0, 3).map((skill) => (
              <span
                key={`${node.externalId}-${skill}`}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {skill}
              </span>
            ))}
            {skills.length > 3 ? (
              <span className="text-[10px] text-muted-foreground">+{skills.length - 3}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      {(node.children || []).length > 0 ? (
        <ul className="mt-0.5 list-none pl-0">
          {node.children.map((child) => (
            <PreviewTreeNode key={child.externalId} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Dual tabs: Requirement Tree + Excel Preview.
 */
export default function RequirementPreviewTabs({
  fileName = '',
  valid = null,
  errorCount = 0,
  warningCount = 0,
  summary = null,
  previewTree = [],
  excelPreview = null,
  issues = [],
  labels = {},
  headerExtra = null,
}) {
  const [tab, setTab] = useState('tree');
  const sheetCount = excelPreview?.sheetCount ?? excelPreview?.sheets?.length ?? 0;
  const totalRows = excelPreview?.totalRows ?? 0;
  const displayName = fileName || excelPreview?.fileName || '—';

  const tabBtn = (id, label) => {
    const selected = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={
          selected
            ? 'border-b-2 border-primary px-3 py-2 text-sm font-semibold text-primary'
            : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground'
        }
      >
        {label}
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            <span className="truncate">{displayName}</span>
            {valid != null ? (
              <span
                className={
                  valid
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-destructive'
                }
              >
                {valid ? labels.parsedOk || '✓ Parsed' : labels.parsedFail || '✕ Invalid'}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {labels.meta
              ? labels.meta
                  .replace('{sheets}', String(sheetCount))
                  .replace('{rows}', String(totalRows))
              : `${sheetCount} sheets · ${totalRows} rows`}
            {summary ? (
              <span>
                {' '}
                · FR: {summary.functionalCount ?? 0} · NFR: {summary.nfrCount ?? 0} · Scope:{' '}
                {summary.scopeCount ?? 0}
              </span>
            ) : null}
            {errorCount || warningCount ? (
              <span>
                {' '}
                · {errorCount} errors, {warningCount} warnings
              </span>
            ) : null}
          </div>
        </div>
        {headerExtra}
      </div>

      <div className="flex gap-1 border-b border-border px-1">
        {tabBtn('tree', labels.tabTree || 'Requirement Tree')}
        {tabBtn('excel', labels.tabExcel || 'Excel Preview')}
      </div>

      {excelPreview?.derivedFromPack ? (
        <div className="border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {labels.derivedFromPackHint ||
            'View reconstructed from saved pack data (not the original Excel bytes).'}
        </div>
      ) : null}

      <div className="p-3">
        {tab === 'tree' ? (
          (previewTree || []).length > 0 ? (
            <ul className="list-none pl-0">
              {previewTree.map((node) => (
                <PreviewTreeNode key={node.externalId} node={node} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{labels.emptyTree || 'No requirement tree'}</p>
          )
        ) : (
          <RequirementExcelPreviewGrid
            excelPreview={excelPreview}
            issues={issues}
            searchPlaceholder={labels.searchPlaceholder}
            truncatedHint={labels.truncatedHint}
            emptyLabel={labels.emptyExcel || labels.noExcelPreview}
          />
        )}

        {(issues || []).length > 0 ? (
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            {(issues || []).slice(0, 12).map((issue, idx) => (
              <div
                key={`${issue.code}-${idx}`}
                className={
                  issue.severity === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'
                }
              >
                {issue.sheet ? `${issue.sheet}: ` : ''}
                {issue.row != null ? `R${issue.row} ` : ''}
                {issue.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { PreviewTreeNode };
