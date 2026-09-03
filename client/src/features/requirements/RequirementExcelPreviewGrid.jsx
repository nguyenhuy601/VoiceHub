import { useEffect, useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import {
  listIssueSheetNames,
  rowsWithIssues,
  sheetLevelIssues,
  issuesForRow,
  issuesForCell,
  formatRowIssueHints,
} from '../../utils/requirementIssueHints';

function severityClass(severity, kind = 'row') {
  if (severity === 'error') {
    return kind === 'cell'
      ? 'bg-destructive/25 ring-1 ring-inset ring-destructive/40'
      : 'bg-destructive/10';
  }
  if (severity === 'warning') {
    return kind === 'cell'
      ? 'bg-amber-500/25 ring-1 ring-inset ring-amber-500/40'
      : 'bg-amber-500/10';
  }
  if (severity === 'info') {
    return kind === 'cell'
      ? 'bg-emerald-500/20 ring-1 ring-inset ring-emerald-500/35'
      : 'bg-emerald-500/10';
  }
  return '';
}

function buildIssueIndexLegacy(issues, sheetName, headerCells) {
  const byRow = new Map();
  const byCell = new Map();
  const headerNorm = (headerCells || []).map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  );

  for (const issue of issues || []) {
    if (!issue) continue;
    const issueSheet = String(issue.sheet || '').trim();
    if (
      issueSheet &&
      sheetName &&
      issueSheet.toLowerCase().replace(/\s+/g, ' ') !==
        String(sheetName || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
    ) {
      continue;
    }
    const row = Number(issue.row);
    if (!Number.isFinite(row) || row < 1) continue;
    const severity =
      issue.severity === 'warning' ? 'warning' : issue.severity === 'info' ? 'info' : 'error';
    const prev = byRow.get(row);
    if (
      !prev ||
      (prev === 'info' && (severity === 'warning' || severity === 'error')) ||
      (prev === 'warning' && severity === 'error')
    ) {
      byRow.set(row, severity);
    }
    const colName = String(issue.column || '').trim();
    if (colName) {
      const colIdx = headerNorm.indexOf(
        colName.toLowerCase().replace(/\s+/g, ' ')
      );
      if (colIdx >= 0) {
        const key = `${row}:${colIdx}`;
        const prevCell = byCell.get(key);
        if (
          !prevCell ||
          (prevCell === 'info' && (severity === 'warning' || severity === 'error')) ||
          (prevCell === 'warning' && severity === 'error')
        ) {
          byCell.set(key, severity);
        }
      }
    }
  }
  return { byRow, byCell };
}

/**
 * Issue-only spreadsheet view — chỉ sheet/dòng có lỗi hoặc warning.
 */
export default function RequirementExcelPreviewGrid({
  excelPreview = null,
  issues = [],
  severityFilter = 'error',
  emptyLabel = 'No Excel preview',
  labels = {},
  className = '',
}) {
  const { t } = useAppStrings();
  const issueSheetNames = useMemo(
    () => listIssueSheetNames(issues, excelPreview, severityFilter),
    [issues, excelPreview, severityFilter]
  );

  const [activeSheet, setActiveSheet] = useState('');

  useEffect(() => {
    if (!issueSheetNames.length) {
      setActiveSheet('');
      return;
    }
    setActiveSheet((prev) => (issueSheetNames.includes(prev) ? prev : issueSheetNames[0]));
  }, [issueSheetNames.join('\0')]);

  const sheets = Array.isArray(excelPreview?.sheets) ? excelPreview.sheets : [];
  const sheet =
    activeSheet === '_file'
      ? null
      : sheets.find((s) => s.name === activeSheet) || null;

  const headerCells = sheet?.rows?.[0]?.cells || [];
  const filteredIssues = useMemo(
    () =>
      (issues || []).filter((i) => {
        if (severityFilter === 'info') return i?.severity === 'info';
        if (severityFilter === 'warning') return i?.severity === 'warning';
        return i?.severity !== 'warning' && i?.severity !== 'info';
      }),
    [issues, severityFilter]
  );

  const { byRow, byCell } = useMemo(
    () => buildIssueIndexLegacy(filteredIssues, sheet?.name, headerCells),
    [filteredIssues, sheet?.name, headerCells]
  );

  const issueRowNumbers = useMemo(() => {
    if (!sheet?.name) return new Set();
    return rowsWithIssues(filteredIssues, sheet.name, severityFilter);
  }, [filteredIssues, sheet?.name, severityFilter]);

  const sheetBannerIssues = useMemo(() => {
    if (!sheet?.name) return [];
    return sheetLevelIssues(filteredIssues, sheet.name, severityFilter);
  }, [filteredIssues, sheet?.name, severityFilter]);

  const fileLevelIssues = useMemo(
    () => sheetLevelIssues(filteredIssues, '_file', severityFilter),
    [filteredIssues, severityFilter]
  );

  const bodyRows = useMemo(() => {
    if (!sheet?.rows?.length) return [];
    return sheet.rows.filter(
      (row) => row.rowNumber > 1 && issueRowNumbers.has(row.rowNumber)
    );
  }, [sheet, issueRowNumbers]);

  const fixHintLabel = labels.fixHintColumn || t('requirements.fixHintColumn');
  const sheetBannerLabel = labels.sheetIssueBanner || t('requirements.sheetIssueBanner');
  const noIssuesOnSheetLabel = labels.noIssuesOnSheet || t('requirements.noIssuesOnSheet');

  if (!issueSheetNames.length) {
    return (
      <div className={`flex h-full items-start ${className}`.trim()}>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  const renderSheetBanner = (bannerIssues) =>
    bannerIssues.length > 0 ? (
      <div
        className={`space-y-2 rounded-md border px-3 py-2 text-xs ${
          severityFilter === 'error'
            ? 'border-destructive/30 bg-destructive/5'
            : severityFilter === 'info'
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
        }`}
      >
        <p
          className={`font-semibold ${
            severityFilter === 'error'
              ? 'text-destructive'
              : severityFilter === 'info'
                ? 'text-emerald-800 dark:text-emerald-200'
                : 'text-amber-800 dark:text-amber-200'
          }`}
        >
          {sheetBannerLabel}
        </p>
        {formatRowIssueHints(bannerIssues, t).map((line) => (
          <div
            key={line.code}
            className={
              severityFilter === 'error'
                ? 'text-destructive'
                : severityFilter === 'info'
                  ? 'text-emerald-800 dark:text-emerald-200'
                  : 'text-amber-800 dark:text-amber-200'
            }
          >
            {line.message ? <p>{line.message}</p> : null}
            {line.hint ? <p className="mt-0.5 text-muted-foreground">{line.hint}</p> : null}
          </div>
        ))}
      </div>
    ) : null;

  const renderFileLevel = () =>
    activeSheet === '_file' ? (
      <div className="space-y-2">
        {fileLevelIssues.map((issue, idx) => {
          const hints = formatRowIssueHints([issue], t);
          const line = hints[0] || {};
          return (
            <div
              key={`${issue.code}-${idx}`}
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              {line.message ? <p>{line.message}</p> : null}
              {line.hint ? <p className="mt-0.5 text-muted-foreground">{line.hint}</p> : null}
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 ${className}`.trim()}>
      <div className="flex max-w-full flex-wrap gap-1 overflow-x-auto">
        {issueSheetNames.map((name) => {
          const selected = activeSheet === name;
          const displayName = name === '_file' ? labels.fileLevelSheet || 'File' : name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setActiveSheet(name)}
              className={
                selected
                  ? 'rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary'
                  : 'rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground'
              }
            >
              {displayName}
            </button>
          );
        })}
      </div>

      {activeSheet === '_file' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{renderFileLevel()}</div>
      ) : (
        <>
          {renderSheetBanner(sheetBannerIssues)}
          {!sheet ? (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          ) : bodyRows.length === 0 && sheetBannerIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">{noIssuesOnSheetLabel}</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="sticky left-0 z-20 border-b border-border bg-muted px-2 py-1.5 font-semibold text-muted-foreground">
                      #
                    </th>
                    {headerCells.map((cell, colIdx) => (
                      <th
                        key={`h-${colIdx}`}
                        className="whitespace-nowrap border-b border-border px-2 py-1.5 font-semibold text-foreground"
                      >
                        {cell || `Col ${colIdx + 1}`}
                      </th>
                    ))}
                    <th className="min-w-[12rem] border-b border-border bg-muted px-2 py-1.5 font-semibold text-foreground">
                      {fixHintLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row) => {
                    const rowSev = byRow.get(row.rowNumber);
                    const rowIssues = issuesForRow(
                      filteredIssues,
                      sheet.name,
                      row.rowNumber,
                      severityFilter
                    );
                    const hintLines = formatRowIssueHints(rowIssues, t);
                    return (
                      <tr
                        key={row.rowNumber}
                        className={`${rowSev ? severityClass(rowSev, 'row') : ''} odd:bg-background even:bg-muted/20`}
                      >
                        <td className="sticky left-0 z-[1] border-b border-border/60 bg-inherit px-2 py-1 font-mono text-muted-foreground">
                          {row.rowNumber}
                        </td>
                        {(row.cells || []).map((cell, colIdx) => {
                          const cellIssues = issuesForCell(
                            filteredIssues,
                            sheet.name,
                            row.rowNumber,
                            colIdx,
                            headerCells,
                            severityFilter
                          );
                          const cellSev =
                            byCell.get(`${row.rowNumber}:${colIdx}`) ||
                            (cellIssues.length ? rowSev : null);
                          const tooltip = cellIssues.length
                            ? cellIssues
                                .map((i) => {
                                  const h = formatRowIssueHints([i], t)[0];
                                  return [i.message, h?.hint].filter(Boolean).join('\n');
                                })
                                .join('\n\n')
                            : String(cell || '');
                          return (
                            <td
                              key={`${row.rowNumber}-${colIdx}`}
                              className={`max-w-[16rem] truncate border-b border-border/60 px-2 py-1 text-foreground ${
                                cellSev ? severityClass(cellSev, 'cell') : ''
                              }`}
                              title={tooltip}
                            >
                              {cell || ''}
                            </td>
                          );
                        })}
                        <td className="max-w-[18rem] border-b border-border/60 px-2 py-1 align-top text-foreground">
                          <ul className="list-none space-y-1.5 pl-0">
                            {hintLines.map((line) => (
                              <li key={line.code}>
                                {line.message ? (
                                  <p
                                    className={
                                      rowSev === 'error'
                                        ? 'font-medium text-destructive'
                                        : rowSev === 'info'
                                          ? 'font-medium text-emerald-800 dark:text-emerald-200'
                                          : 'font-medium text-amber-800 dark:text-amber-200'
                                    }
                                  >
                                    {line.message}
                                  </p>
                                ) : null}
                                {line.hint ? (
                                  <p className="text-muted-foreground">{line.hint}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { buildIssueIndexLegacy as buildIssueIndex };
