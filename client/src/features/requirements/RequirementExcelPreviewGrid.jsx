import { useEffect, useMemo, useState } from 'react';

function normalizeHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildIssueIndex(issues, sheetName, headerCells) {
  const byRow = new Map();
  const byCell = new Map();
  const headerNorm = (headerCells || []).map(normalizeHeader);

  for (const issue of issues || []) {
    if (!issue) continue;
    const issueSheet = String(issue.sheet || '').trim();
    if (issueSheet && sheetName && normalizeHeader(issueSheet) !== normalizeHeader(sheetName)) {
      continue;
    }
    const row = Number(issue.row);
    if (!Number.isFinite(row) || row < 1) continue;
    const severity = issue.severity === 'error' ? 'error' : 'warning';
    const prev = byRow.get(row);
    if (!prev || (prev === 'warning' && severity === 'error')) {
      byRow.set(row, severity);
    }
    const colName = String(issue.column || '').trim();
    if (colName) {
      const colIdx = headerNorm.indexOf(normalizeHeader(colName));
      if (colIdx >= 0) {
        const key = `${row}:${colIdx}`;
        const prevCell = byCell.get(key);
        if (!prevCell || (prevCell === 'warning' && severity === 'error')) {
          byCell.set(key, severity);
        }
      }
    }
  }
  return { byRow, byCell };
}

function severityClass(severity, kind = 'row') {
  if (severity === 'error') {
    return kind === 'cell' ? 'bg-destructive/20' : 'bg-destructive/10';
  }
  if (severity === 'warning') {
    return kind === 'cell' ? 'bg-amber-500/20' : 'bg-amber-500/10';
  }
  return '';
}

/**
 * Read-only spreadsheet viewer for requirement Excel preview snapshot.
 */
export default function RequirementExcelPreviewGrid({
  excelPreview = null,
  issues = [],
  searchPlaceholder = 'Search…',
  truncatedHint = '',
  emptyLabel = 'No Excel preview',
}) {
  const sheets = Array.isArray(excelPreview?.sheets) ? excelPreview.sheets : [];
  const sheetNamesKey = sheets.map((s) => s.name).join('\0');
  const [activeSheet, setActiveSheet] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!sheets.length) {
      setActiveSheet('');
      return;
    }
    setActiveSheet((prev) => (sheets.some((s) => s.name === prev) ? prev : sheets[0].name));
    // sheetNamesKey: reset when preview sheets change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional key
  }, [sheetNamesKey]);

  const sheet = sheets.find((s) => s.name === activeSheet) || sheets[0] || null;

  const headerCells = sheet?.rows?.[0]?.cells || [];
  const { byRow, byCell } = useMemo(
    () => buildIssueIndex(issues, sheet?.name, headerCells),
    [issues, sheet?.name, headerCells]
  );

  const q = searchQuery.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    const rows = sheet?.rows || [];
    if (!q) return rows;
    return rows.filter((row, idx) => {
      if (idx === 0) return true;
      return (row.cells || []).some((c) => String(c || '').toLowerCase().includes(q));
    });
  }, [sheet, q]);

  if (!sheets.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full flex-wrap gap-1 overflow-x-auto">
          {sheets.map((s) => {
            const selected = (sheet?.name || '') === s.name;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => setActiveSheet(s.name)}
                className={
                  selected
                    ? 'rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary'
                    : 'rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground'
                }
              >
                {s.name}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="ml-auto h-8 min-w-[10rem] flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground"
        />
      </div>
      {sheet?.truncated && truncatedHint ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{truncatedHint}</p>
      ) : null}
      <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="sticky left-0 z-20 border-b border-border bg-muted px-2 py-1.5 font-semibold text-muted-foreground">
                #
              </th>
              {(visibleRows[0]?.cells || headerCells).map((cell, colIdx) => (
                <th
                  key={`h-${colIdx}`}
                  className="whitespace-nowrap border-b border-border px-2 py-1.5 font-semibold text-foreground"
                >
                  {cell || `Col ${colIdx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.slice(1).map((row) => {
              const rowSev = byRow.get(row.rowNumber);
              return (
                <tr
                  key={row.rowNumber}
                  className={`${rowSev ? severityClass(rowSev, 'row') : ''} odd:bg-background even:bg-muted/20`}
                >
                  <td className="sticky left-0 z-[1] border-b border-border/60 bg-inherit px-2 py-1 font-mono text-muted-foreground">
                    {row.rowNumber}
                  </td>
                  {(row.cells || []).map((cell, colIdx) => {
                    const cellSev = byCell.get(`${row.rowNumber}:${colIdx}`);
                    return (
                      <td
                        key={`${row.rowNumber}-${colIdx}`}
                        className={`max-w-[16rem] truncate border-b border-border/60 px-2 py-1 text-foreground ${
                          cellSev ? severityClass(cellSev, 'cell') : ''
                        }`}
                        title={String(cell || '')}
                      >
                        {cell || ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
