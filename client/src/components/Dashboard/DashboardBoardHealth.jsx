import { useMemo } from 'react';
import { AlertTriangle, LayoutDashboard } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { boardRag } from '../../utils/boardRag';
import {
  FIGMA_DASH_CARD,
  FIGMA_DASH_LINK_BTN,
  FIGMA_DASH_SECTION_TITLE,
  FIGMA_DASH_SECTION_TITLE_ROW,
} from './figmaDashboardClasses';
import { useDashCompactLayout } from './useDashCompactLayout';

const RAG_DOT = {
  red: 'bg-destructive',
  amber: 'bg-warning',
  green: 'bg-success',
};

const RAG_BAR = {
  red: 'bg-destructive',
  amber: 'bg-warning',
  green: 'bg-primary',
};

const RAG_RANK = { red: 0, amber: 1, green: 2 };
const MOBILE_BOARD_LIMIT = 3;

function sortBoardsByRag(rows) {
  return [...rows].sort((a, b) => {
    const ra = RAG_RANK[boardRag(a).rag] ?? 2;
    const rb = RAG_RANK[boardRag(b).rag] ?? 2;
    if (ra !== rb) return ra - rb;
    return (Number(b.overdue) || 0) - (Number(a.overdue) || 0);
  });
}

/** Primary label: tên dự án (map FE/BE), tránh hiện «Main». */
function resolveBoardHealthPrimaryTitle(board, labels) {
  const projectTitle = String(board?.projectTitle || '').trim();
  if (projectTitle) return projectTitle;
  const name = String(board?.name || board?.title || '').trim();
  if (name && !/^main$/i.test(name)) return name;
  if (board?.enrichmentFailed) return labels.unresolved;
  return labels.untitled;
}

function resolveBoardHealthMetaLine(board) {
  const code = String(board?.projectCode || '').trim();
  const boardName = String(board?.name || board?.title || '').trim();
  const projectTitle = String(board?.projectTitle || '').trim();
  const parts = [];
  if (code) parts.push(code);
  if (boardName && !/^main$/i.test(boardName) && boardName !== projectTitle) {
    parts.push(boardName);
  }
  return parts.join(' · ');
}

export default function DashboardBoardHealth({ boards = [], onBoardClick, onViewAll }) {
  const { t } = useAppStrings();
  const compact = useDashCompactLayout();
  const rows = Array.isArray(boards) ? boards : [];
  const visible = useMemo(() => {
    const list = Array.isArray(boards) ? boards : [];
    if (!compact) return list;
    return sortBoardsByRag(list).slice(0, MOBILE_BOARD_LIMIT);
  }, [compact, boards]);

  if (!rows.length) return null;

  const showViewAll = compact && rows.length > visible.length;
  const untitledLabel = t('dashboard.boardHealthUntitled');
  const unresolvedLabel = t('dashboard.boardHealthUnresolvedTitle');
  const openHint = t('dashboard.boardHealthOpenHint');
  const titleLabels = { untitled: untitledLabel, unresolved: unresolvedLabel };

  return (
    <div className={`${FIGMA_DASH_CARD} p-4 sm:p-5`}>
      <div className={FIGMA_DASH_SECTION_TITLE_ROW}>
        <div className={FIGMA_DASH_SECTION_TITLE}>
          <LayoutDashboard size={15} className="text-primary" aria-hidden />
          {t('dashboard.boardHealthTitle')}
        </div>
        {showViewAll ? (
          <button type="button" className={FIGMA_DASH_LINK_BTN} onClick={() => onViewAll?.()}>
            {t('dashboard.viewAllShort')}
          </button>
        ) : (
          <span className="hidden text-[0.6875rem] text-muted-foreground lg:inline">
            {t('dashboard.boardHealthSub')}
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-2.5">
        {visible.map((board) => {
          const total = Math.max(1, Number(board.total) || 0);
          const donePct = Math.min(100, Math.round(((Number(board.done) || 0) / total) * 100));
          const overdue = Number(board.overdue) || 0;
          const { rag } = boardRag(board);
          const ragLabel =
            rag === 'red'
              ? t('dashboard.boardRagRed')
              : rag === 'amber'
                ? t('dashboard.boardRagAmber')
                : t('dashboard.boardRagGreen');
          const primaryTitle = resolveBoardHealthPrimaryTitle(board, titleLabels);
          const metaLine = resolveBoardHealthMetaLine(board);
          const rowKey = String(board.id || board._id || board.projectId || primaryTitle);

          return (
            <li key={rowKey}>
              <button
                type="button"
                title={openHint}
                aria-label={`${openHint}: ${primaryTitle}`}
                onClick={() => onBoardClick?.(board)}
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-left transition hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RAG_DOT[rag] || RAG_DOT.green}`}
                      title={ragLabel}
                      aria-label={ragLabel}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] font-semibold text-foreground">
                        {primaryTitle}
                      </span>
                      {metaLine ? (
                        <span className="mt-0.5 block truncate text-[0.625rem] text-muted-foreground">
                          {metaLine}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {overdue > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-bold text-destructive">
                      <AlertTriangle size={12} aria-hidden />
                      {t('dashboard.boardHealthOverdue', { n: overdue })}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[0.6875rem] font-medium text-muted-foreground">
                      {rag === 'amber'
                        ? ragLabel
                        : t('dashboard.boardHealthDonePct', { n: donePct })}
                    </span>
                  )}
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/60"
                  role="progressbar"
                  aria-valuenow={donePct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('dashboard.boardHealthDonePct', { n: donePct })}
                >
                  <div
                    className={`h-full rounded-full transition-[width] ${RAG_BAR[rag] || RAG_BAR.green}`}
                    style={{ width: `${donePct}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[0.625rem] text-muted-foreground">
                  {t('dashboard.boardHealthCounts', {
                    open: board.open ?? 0,
                    done: board.done ?? 0,
                    total: board.total ?? 0,
                  })}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
