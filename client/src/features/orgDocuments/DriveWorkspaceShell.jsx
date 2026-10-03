import { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Search,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { formatFileSize, resolveOrgFileOpenUrl, toDriveAttachmentRef } from './orgDocumentUtils';
import { getDriveFacetTheme } from './driveFacetTheme';
import { isStoredObjectAttachment } from '../projects/board/taskBoardAttachmentOpen';
import {
  DRIVE_PREVIEW_BASE_W,
  DRIVE_PREVIEW_MAX_W,
  DRIVE_PREVIEW_MIN_W,
  DRIVE_RAIL_BASE_W,
  DRIVE_RAIL_MAX_W,
  DRIVE_RAIL_MIN_W,
  DRIVE_VIEW_GRID,
  DRIVE_VIEW_LIST,
  loadDriveRailPrefs,
  saveDriveRailPrefs,
} from './driveLayoutPrefs';

function useLgViewport() {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLg(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isLg;
}

function FileRowIcon({ file, size = 'md' }) {
  const theme = getDriveFacetTheme(file.category);
  const Icon = theme.Icon || FileText;
  const box = size === 'lg' ? 'h-12 w-12 rounded-xl' : 'h-9 w-9 rounded-lg';
  const iconCls = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  const openUrl = resolveOrgFileOpenUrl(file);
  if (file.messageType === 'image' && openUrl) {
    return <img src={openUrl} alt="" className={`${box} shrink-0 object-cover`} />;
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-border bg-muted ${box} ${theme.iconClass}`}
    >
      <Icon className={iconCls} strokeWidth={1.75} />
    </div>
  );
}

/**
 * Một chrome Drive: rail location/facet + list + preview (kéo/tắt, persist).
 */
export default function DriveWorkspaceShell({
  title = '',
  scopeHint = '',
  files = [],
  loading = false,
  error = '',
  onReload,
  categoryMeta = [],
  countsByCategory = {},
  totalBytes = 0,
  activeCategory = 'all',
  onCategoryChange,
  query = '',
  onQueryChange,
  selectedFile = null,
  onSelectFile,
  onOpenFile,
  openingFile = false,
  onOpenInWorkspace,
  onBackToChat,
  emptyMessage = '',
}) {
  const { t } = useAppStrings();
  const isLg = useLgViewport();
  const prefsRef = useRef(null);
  if (!prefsRef.current) prefsRef.current = loadDriveRailPrefs();

  const [leftOpen, setLeftOpen] = useState(prefsRef.current.leftOpen);
  const [previewOpen, setPreviewOpen] = useState(prefsRef.current.previewOpen);
  const [leftWidth, setLeftWidth] = useState(prefsRef.current.leftWidth);
  const [previewWidth, setPreviewWidth] = useState(prefsRef.current.previewWidth);
  const [viewMode, setViewMode] = useState(prefsRef.current.viewMode || DRIVE_VIEW_LIST);
  const resizeRef = useRef(null);

  const persist = (patch) => {
    const next = saveDriveRailPrefs(patch);
    prefsRef.current = next;
    return next;
  };

  const handleLeftOpen = (next) => {
    setLeftOpen(next);
    persist({ leftOpen: next });
  };
  const handlePreviewOpen = (next) => {
    setPreviewOpen(next);
    persist({ previewOpen: next });
  };
  const handleViewMode = (next) => {
    const mode = next === DRIVE_VIEW_GRID ? DRIVE_VIEW_GRID : DRIVE_VIEW_LIST;
    setViewMode(mode);
    persist({ viewMode: mode });
  };

  /** Chọn file + đảm bảo panel xem trước mở (nếu đang tắt thì bấm file không thấy «Mở file»). */
  const handleSelectFile = (file) => {
    onSelectFile?.(file);
    if (!previewOpen) handlePreviewOpen(true);
  };

  const handleOpenSelected = (file) => {
    if (!file) return;
    onOpenFile?.(file);
  };

  useEffect(() => {
    const onMove = (e) => {
      const job = resizeRef.current;
      if (!job?.active) return;
      const delta = e.clientX - job.startX;
      if (job.side === 'left') {
        const w = Math.max(DRIVE_RAIL_MIN_W, Math.min(DRIVE_RAIL_MAX_W, job.startW + delta));
        job.currentW = w;
        setLeftWidth(w);
      } else {
        const w = Math.max(DRIVE_PREVIEW_MIN_W, Math.min(DRIVE_PREVIEW_MAX_W, job.startW - delta));
        job.currentW = w;
        setPreviewWidth(w);
      }
    };
    const onUp = () => {
      const job = resizeRef.current;
      if (!job?.active) return;
      resizeRef.current = null;
      if (job.side === 'left') persist({ leftWidth: job.currentW ?? leftWidth });
      else persist({ previewWidth: job.currentW ?? previewWidth });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [leftWidth, previewWidth]);

  const startResize = (side, startX, startW) => {
    resizeRef.current = { active: true, side, startX, startW };
  };

  const showLeft = leftOpen && (isLg || leftOpen);
  const showPreview = previewOpen && (isLg || previewOpen);
  const leftAsDrawer = leftOpen && !isLg;
  const previewAsDrawer = previewOpen && !isLg;
  const isGrid = viewMode === DRIVE_VIEW_GRID;

  const facetRail = (
    <div className="flex h-full min-h-0 flex-col">
      <p className="px-3 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {t('documents.driveFacetHeading')}
      </p>
      <nav className="scrollbar-overlay min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-label={t('documents.orgCategoryAria')}>
        {categoryMeta.map((c) => {
          const theme = getDriveFacetTheme(c.id);
          const Icon = theme.Icon;
          const count = c.id === 'all' ? files.length : countsByCategory[c.id] || 0;
          const active = activeCategory === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onCategoryChange?.(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition ${
                active ? theme.activeClass : 'border-transparent text-foreground hover:bg-muted'
              }`}
              title={c.hint || c.label}
            >
              <Icon className={`h-4 w-4 shrink-0 ${theme.iconClass}`} strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {count > 0 ? (
                <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );

  const fileList = (
    <ul className={isGrid ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4' : 'space-y-0.5'}>
      {files.map((file) => {
        const active = selectedFile?.id === file.id;
        if (isGrid) {
          return (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => handleSelectFile(file)}
                onDoubleClick={() => handleOpenSelected(file)}
                className={`flex h-full w-full flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                  active
                    ? 'border-primary/40 bg-primary/15 text-foreground'
                    : 'border-border/60 text-foreground hover:bg-muted'
                }`}
              >
                <FileRowIcon file={file} size="lg" />
                <span className="min-w-0 w-full">
                  <span className="block truncate text-xs font-semibold">{file.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    #{file.channelName}
                  </span>
                </span>
              </button>
            </li>
          );
        }
        return (
          <li key={file.id}>
            <button
              type="button"
              onClick={() => handleSelectFile(file)}
              onDoubleClick={() => handleOpenSelected(file)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                active
                  ? 'border-primary/40 bg-primary/15 text-foreground'
                  : 'border-transparent text-foreground hover:bg-muted'
              }`}
            >
              <FileRowIcon file={file} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold leading-snug">{file.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  #{file.channelName}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <FileText size={16} className="shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 basis-[10rem]">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="truncate text-[11px] text-muted-foreground">
            {files.length} {t('documents.orgStatTotal').toLowerCase()}
            {formatFileSize(totalBytes) ? ` · ${formatFileSize(totalBytes)}` : ''}
            {scopeHint ? ` · ${scopeHint}` : ''}
          </p>
        </div>

        <div className="relative min-w-[10rem] max-w-xs flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="drive-workspace-search"
            type="search"
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
            placeholder={t('documents.orgSearchPlaceholder')}
            aria-label={t('documents.searchAria')}
            className="h-8 w-full rounded-lg border border-border bg-input-background py-0 pl-8 pr-2.5 text-[0.75rem] text-foreground outline-none transition focus:border-primary"
          />
        </div>

        <div
          className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5"
          role="group"
          aria-label={t('documents.driveViewModeAria')}
        >
          <button
            type="button"
            onClick={() => handleViewMode(DRIVE_VIEW_LIST)}
            className={`rounded-md p-1.5 transition ${
              !isGrid ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            title={t('documents.driveViewList')}
            aria-label={t('documents.driveViewList')}
            aria-pressed={!isGrid}
          >
            <List size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => handleViewMode(DRIVE_VIEW_GRID)}
            className={`rounded-md p-1.5 transition ${
              isGrid ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            title={t('documents.driveViewGrid')}
            aria-label={t('documents.driveViewGrid')}
            aria-pressed={isGrid}
          >
            <LayoutGrid size={14} aria-hidden />
          </button>
        </div>

        {typeof onBackToChat === 'function' ? (
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-muted hover:text-primary"
            title={t('documents.driveBackToChat')}
            aria-label={t('documents.driveBackToChat')}
          >
            <MessageSquare size={14} aria-hidden />
            <span className="hidden sm:inline">{t('documents.driveBackToChat')}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => handleLeftOpen(!leftOpen)}
          className={`rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground ${
            leftOpen ? 'bg-muted text-primary' : ''
          }`}
          title={leftOpen ? t('documents.driveHideFacets') : t('documents.driveShowFacets')}
          aria-label={leftOpen ? t('documents.driveHideFacets') : t('documents.driveShowFacets')}
        >
          <PanelLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => handlePreviewOpen(!previewOpen)}
          className={`rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground ${
            previewOpen ? 'bg-muted text-primary' : ''
          }`}
          title={previewOpen ? t('documents.driveHidePreview') : t('documents.driveShowPreview')}
          aria-label={previewOpen ? t('documents.driveHidePreview') : t('documents.driveShowPreview')}
        >
          <PanelRight size={16} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {leftAsDrawer ? (
          <div className="fixed inset-0 z-[240] bg-black/40 lg:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default"
              aria-label={t('nav.close')}
              onClick={() => handleLeftOpen(false)}
            />
            <aside className="relative z-[1] flex h-full w-[min(100vw,320px)] flex-col border-r border-border bg-card">
              {facetRail}
            </aside>
          </div>
        ) : null}

        {showLeft && isLg ? (
          <aside
            className="relative hidden h-full shrink-0 flex-col border-r border-border bg-muted/40 lg:flex"
            style={{ width: leftWidth, minWidth: DRIVE_RAIL_MIN_W, maxWidth: DRIVE_RAIL_MAX_W }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={leftWidth}
              aria-valuemin={DRIVE_RAIL_MIN_W}
              aria-valuemax={DRIVE_RAIL_MAX_W}
              title={t('documents.driveResizeHint', { min: DRIVE_RAIL_MIN_W, max: DRIVE_RAIL_MAX_W })}
              className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none hover:bg-primary/20"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                startResize('left', e.clientX, leftWidth);
              }}
              onDoubleClick={() => {
                setLeftWidth(DRIVE_RAIL_BASE_W);
                persist({ leftWidth: DRIVE_RAIL_BASE_W });
              }}
            />
            {facetRail}
          </aside>
        ) : null}

        <div className="min-w-0 flex-1 overflow-y-auto p-2">
          {loading && files.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin opacity-70" />
              <p className="mt-2 text-xs">{t('documents.orgLoading')}</p>
            </div>
          ) : error && files.length === 0 ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
              <p className="text-xs text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => onReload?.()}
                className="mt-2 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
              >
                {t('documents.orgRetry')}
              </button>
            </div>
          ) : files.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {emptyMessage || t('documents.orgEmpty')}
            </p>
          ) : (
            fileList
          )}
        </div>

        {previewAsDrawer && selectedFile ? (
          <div className="fixed inset-0 z-[240] bg-black/40 lg:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default"
              aria-label={t('nav.close')}
              onClick={() => handlePreviewOpen(false)}
            />
            <aside className="absolute inset-y-0 right-0 z-[1] flex w-[min(100vw,360px)] flex-col border-l border-border bg-card p-4">
              <DrivePreviewBody
                file={selectedFile}
                onOpenFile={onOpenFile}
                onOpenInWorkspace={onOpenInWorkspace}
                openingFile={openingFile}
                t={t}
              />
            </aside>
          </div>
        ) : null}

        {showPreview && isLg ? (
          <aside
            className="relative hidden h-full shrink-0 flex-col overflow-y-auto border-l border-border bg-card p-4 lg:flex"
            style={{
              width: previewWidth,
              minWidth: DRIVE_PREVIEW_MIN_W,
              maxWidth: DRIVE_PREVIEW_MAX_W,
            }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={previewWidth}
              aria-valuemin={DRIVE_PREVIEW_MIN_W}
              aria-valuemax={DRIVE_PREVIEW_MAX_W}
              title={t('documents.driveResizeHint', {
                min: DRIVE_PREVIEW_MIN_W,
                max: DRIVE_PREVIEW_MAX_W,
              })}
              className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize touch-none hover:bg-primary/20"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                startResize('preview', e.clientX, previewWidth);
              }}
              onDoubleClick={() => {
                setPreviewWidth(DRIVE_PREVIEW_BASE_W);
                persist({ previewWidth: DRIVE_PREVIEW_BASE_W });
              }}
            />
            <DrivePreviewBody
              file={selectedFile}
              onOpenFile={onOpenFile}
              onOpenInWorkspace={onOpenInWorkspace}
              openingFile={openingFile}
              t={t}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function DrivePreviewBody({ file, onOpenFile, onOpenInWorkspace, openingFile = false, t }) {
  if (!file) {
    return (
      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center px-4 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
          <FileText className="h-5 w-5" aria-hidden />
        </div>
        <p className="text-sm font-medium text-foreground">{t('documents.orgPickFileHint')}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{t('documents.drivePreviewEmptyHint')}</p>
      </div>
    );
  }
  const openUrl = resolveOrgFileOpenUrl(file);
  const attachment = toDriveAttachmentRef(file);
  const canOpenStored = isStoredObjectAttachment(attachment);
  const canOpenDirect = Boolean(openUrl) || canOpenStored;
  const isImage =
    String(file.messageType || '').toLowerCase() === 'image' ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(file.name || ''));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <FileRowIcon file={file} size="lg" />
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold text-foreground">{file.name}</h4>
          <p className="text-xs text-muted-foreground">
            #{file.channelName}
            {formatFileSize(file.sizeBytes) ? ` · ${formatFileSize(file.sizeBytes)}` : ''}
          </p>
        </div>
      </div>

      {isImage && openUrl ? (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
          <img src={openUrl} alt={file.name} className="max-h-56 w-full object-contain" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenFile?.(file);
          }}
          disabled={openingFile}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
        >
          {openingFile ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" />
          )}
          {openingFile ? t('documents.orgOpeningFile') : t('documents.orgOpenFile')}
        </button>
        {file.roomId && onOpenInWorkspace ? (
          <button
            type="button"
            onClick={() => onOpenInWorkspace(file)}
            className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t('documents.orgOpenInChannel')}
          </button>
        ) : null}
      </div>
      {!canOpenDirect ? (
        <p className="text-[11px] text-muted-foreground">{t('documents.orgOpenFileUnavailable')}</p>
      ) : canOpenStored && !openUrl ? (
        <p className="text-[11px] text-muted-foreground">{t('documents.orgOpenFileStoredHint')}</p>
      ) : null}
    </div>
  );
}
