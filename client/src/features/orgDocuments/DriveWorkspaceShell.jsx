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
  X,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import useModalA11y from '../../components/Shared/useModalA11y';
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
      <Icon className={iconCls} strokeWidth={1.75} aria-hidden />
    </div>
  );
}

const DRIVE_RESIZE_KEY_STEP = 16;

function DriveDrawer({ side, label, onClose, closeLabel, children }) {
  const panelRef = useRef(null);
  useModalA11y({ isOpen: true, onClose, containerRef: panelRef, initialFocusRef: panelRef });
  const isLeft = side === 'left';
  return (
    <div className="fixed inset-0 z-[240] bg-black/40 motion-safe:animate-fade-in-fast lg:hidden" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`absolute inset-y-0 z-[1] flex flex-col bg-card shadow-2xl outline-none motion-safe:animate-fade-in-fast ${
          isLeft
            ? 'left-0 w-[min(100vw,320px)] border-r border-border'
            : 'right-0 w-[min(100vw,360px)] overflow-y-auto border-l border-border p-4'
        }`}
      >
        {children}
      </aside>
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

  const handleSeparatorKeyDown = (side, event) => {
    const isLeftRail = side === 'left';
    const min = isLeftRail ? DRIVE_RAIL_MIN_W : DRIVE_PREVIEW_MIN_W;
    const max = isLeftRail ? DRIVE_RAIL_MAX_W : DRIVE_PREVIEW_MAX_W;
    const base = isLeftRail ? DRIVE_RAIL_BASE_W : DRIVE_PREVIEW_BASE_W;
    const current = isLeftRail ? leftWidth : previewWidth;
    // Rail trái giãn sang phải; preview bám mép phải nên giãn khi kéo sang trái.
    const growKey = isLeftRail ? 'ArrowRight' : 'ArrowLeft';
    const shrinkKey = isLeftRail ? 'ArrowLeft' : 'ArrowRight';
    let next;
    if (event.key === growKey) next = current + DRIVE_RESIZE_KEY_STEP;
    else if (event.key === shrinkKey) next = current - DRIVE_RESIZE_KEY_STEP;
    else if (event.key === 'Home') next = base;
    else return;
    event.preventDefault();
    const width = Math.max(min, Math.min(max, next));
    if (isLeftRail) {
      setLeftWidth(width);
      persist({ leftWidth: width });
    } else {
      setPreviewWidth(width);
      persist({ previewWidth: width });
    }
  };

  const hasQuery = Boolean(String(query || '').trim());

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
              aria-pressed={active}
              onClick={() => onCategoryChange?.(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                active ? theme.activeClass : 'border-transparent text-foreground hover:bg-muted'
              }`}
              title={c.hint || c.label}
            >
              <Icon className={`h-4 w-4 shrink-0 ${theme.iconClass}`} strokeWidth={1.75} aria-hidden />
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
                aria-pressed={active}
                onClick={() => handleSelectFile(file)}
                onDoubleClick={() => handleOpenSelected(file)}
                className={`flex h-full w-full flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
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
              aria-pressed={active}
              onClick={() => handleSelectFile(file)}
              onDoubleClick={() => handleOpenSelected(file)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
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
            maxLength={200}
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
            className={`rounded-md p-1.5 transition motion-reduce:transition-none ${
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
            className={`rounded-md p-1.5 transition motion-reduce:transition-none ${
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
          aria-pressed={leftOpen}
        >
          <PanelLeft size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => handlePreviewOpen(!previewOpen)}
          className={`rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground ${
            previewOpen ? 'bg-muted text-primary' : ''
          }`}
          title={previewOpen ? t('documents.driveHidePreview') : t('documents.driveShowPreview')}
          aria-label={previewOpen ? t('documents.driveHidePreview') : t('documents.driveShowPreview')}
          aria-pressed={previewOpen}
        >
          <PanelRight size={16} aria-hidden />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {leftAsDrawer ? (
          <DriveDrawer
            side="left"
            label={t('documents.driveFacetHeading')}
            closeLabel={t('nav.close')}
            onClose={() => handleLeftOpen(false)}
          >
            {facetRail}
          </DriveDrawer>
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
              aria-label={t('documents.driveResizeFacetsAria')}
              tabIndex={0}
              onKeyDown={(e) => handleSeparatorKeyDown('left', e)}
              title={t('documents.driveResizeHint', { min: DRIVE_RAIL_MIN_W, max: DRIVE_RAIL_MAX_W })}
              className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none outline-none transition-colors hover:bg-primary/20 focus-visible:bg-primary/30"
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
          {error && files.length > 0 ? (
            <div
              role="alert"
              className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={() => onReload?.()}
                aria-busy={loading}
                disabled={loading}
                className="shrink-0 rounded-md px-2 py-1 font-semibold transition-colors motion-reduce:transition-none hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-60"
              >
                {t('documents.orgRetry')}
              </button>
            </div>
          ) : null}
          {loading && files.length === 0 ? (
            <div role="status" className="flex flex-col items-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 motion-safe:animate-spin opacity-70" aria-hidden />
              <p className="mt-2 text-xs">{t('documents.orgLoading')}</p>
            </div>
          ) : error && files.length === 0 ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
              <p className="text-xs text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => onReload?.()}
                aria-busy={loading}
                disabled={loading}
                className="mt-2 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition motion-reduce:transition-none hover:opacity-90 disabled:opacity-60"
              >
                {t('documents.orgRetry')}
              </button>
            </div>
          ) : files.length === 0 && hasQuery ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center motion-safe:animate-fade-in-fast">
              <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="text-xs text-muted-foreground">{t('documents.driveNoResults', { query: query.trim() })}</p>
              <button
                type="button"
                onClick={() => onQueryChange?.('')}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                {t('documents.driveClearSearch')}
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
          <DriveDrawer
            side="right"
            label={selectedFile.name || t('documents.driveShowPreview')}
            closeLabel={t('nav.close')}
            onClose={() => handlePreviewOpen(false)}
          >
            <DrivePreviewBody
              file={selectedFile}
              onOpenFile={onOpenFile}
              onOpenInWorkspace={onOpenInWorkspace}
              openingFile={openingFile}
              t={t}
            />
          </DriveDrawer>
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
              aria-label={t('documents.driveResizePreviewAria')}
              tabIndex={0}
              onKeyDown={(e) => handleSeparatorKeyDown('preview', e)}
              className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize touch-none outline-none transition-colors hover:bg-primary/20 focus-visible:bg-primary/30"
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
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          )}
          {openingFile ? t('documents.orgOpeningFile') : t('documents.orgOpenFile')}
        </button>
        {file.roomId && onOpenInWorkspace ? (
          <button
            type="button"
            onClick={() => onOpenInWorkspace(file)}
            className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
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
