import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Eye,
  File,
  FilePlus,
  FileText,
  FolderOpen,
  Grid3X3,
  List,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import DocumentOcrProgressBar from './DocumentOcrProgressBar';
import { hasBackendCapability } from '../../config/backendCapabilities';
import {
  FIGMA_DOC_GRID_CARD,
  FIGMA_DOC_HEADER,
  FIGMA_DOC_ICON,
  FIGMA_DOC_PAGE,
} from './figmaDocumentsClasses';
import {
  DOC_TYPE_ICON,
  docTypeColor,
  docTypeLabel,
  formatRelativeVi,
  sortDocuments,
} from './documentsUiUtils';

const SORT_OPTION_KEYS = {
  modified: 'documents.figmaSortModified',
  name: 'documents.figmaSortName',
  size: 'documents.figmaSortSize',
  type: 'documents.figmaSortType',
};

const DOCUMENT_OCR_ENABLED = hasBackendCapability('documentOcrProcessing');

function DocRowActions({ doc, t, onView, onDownload, onShare, onDelete, onStar }) {
  const [hovered, setHovered] = useState(false);
  const Icon = DOC_TYPE_ICON[doc.docType] || File;
  const color = doc.color || docTypeColor(doc.docType);

  return (
    <div
      className="overflow-hidden rounded-[11px] border border-border bg-surface shadow-xs transition hover:shadow-md"
      style={{
        borderColor: hovered ? `${color}40` : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex cursor-pointer items-center gap-3.5 px-4 py-3"
        onClick={() => onView?.(doc)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onView?.(doc);
          }
        }}
      >
      <div
        className={FIGMA_DOC_ICON}
        style={{ background: `${color}14`, borderColor: `${color}20` }}
      >
        <Icon size={18} style={{ color }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{doc.name}</span>
          {DOCUMENT_OCR_ENABLED && doc.ocrStatus === 'done' && (
            <span className="shrink-0 rounded-full border border-success/20 bg-success/10 px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-wide text-success">
              OCR ✓
            </span>
          )}
          {DOCUMENT_OCR_ENABLED && doc.ocrStatus === 'processing' && (
            <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-wide text-primary">
              {t('documents.badgeAiProcessing')}
            </span>
          )}
          {doc.shared && (
            <span className="shrink-0 rounded-full border border-info/20 bg-info/10 px-1.5 py-0.5 text-[0.5625rem] font-bold text-info">
              {t('documents.badgeShared')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span
            className="rounded px-1.5 py-0.5 text-[0.625rem] font-semibold"
            style={{ background: `${color}14`, color }}
          >
            {docTypeLabel(doc.docType, { t, locale: doc.locale })}
          </span>
          <span className="text-[0.6875rem]">{doc.size}</span>
          <span className="flex items-center gap-1 text-[0.6875rem]">
            <Clock size={10} />
            {t('documents.modifiedPrefix')} {doc.modifiedRelative || doc.modified}
          </span>
        </div>
      </div>

      <div
        className={`flex items-center gap-0.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}
      >
        {[
          { Icon: Eye, title: t('documents.actionView'), action: () => onView?.(doc) },
          { Icon: Download, title: t('documents.actionDownload'), action: () => onDownload?.(doc) },
          onShare ? { Icon: Share2, title: t('documents.actionShare'), action: () => onShare?.(doc) } : null,
        ].filter(Boolean).map(({ Icon: ActionIcon, title, action }) => (
          <button
            key={title}
            type="button"
            title={title}
            onClick={(e) => {
              e.stopPropagation();
              action();
            }}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-primary"
          >
            <ActionIcon size={13} />
          </button>
        ))}
        <button
          type="button"
          title={t('documents.delete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(doc);
          }}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {onStar && (
        <button
          type="button"
          title={doc.starred ? t('documents.starRemove') : t('documents.starAdd')}
          onClick={(e) => {
            e.stopPropagation();
            onStar?.(doc);
          }}
          className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md transition ${
            doc.starred ? 'text-warning' : 'text-muted-foreground hover:text-warning'
          }`}
        >
          <Star size={14} fill={doc.starred ? 'currentColor' : 'none'} />
        </button>
      )}
      </div>

      {DOCUMENT_OCR_ENABLED && doc.ocrStatus === 'processing' && (
        <div className="px-4 pb-3.5">
          <DocumentOcrProgressBar progress={doc.ocrProgress} />
        </div>
      )}
    </div>
  );
}

export default function DocumentsFigmaView({
  documents = [],
  documentsLoading = false,
  locale = 'vi',
  t,
  onView,
  onDownload,
  onShare,
  onDelete,
  onStar,
  onUploadClick,
  onUploadFiles,
  emptyLabel,
  loadingLabel,
}) {
  const uploadRef = useRef(null);
  const canUpload = Boolean(onUploadFiles || onUploadClick);
  const [viewMode, setViewMode] = useState('list');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortKey, setSortKey] = useState('modified');
  const [showSort, setShowSort] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const sortLabel = useMemo(() => {
    const key = SORT_OPTION_KEYS[sortKey] || SORT_OPTION_KEYS.modified;
    return t?.(key) || key;
  }, [sortKey, t]);

  const sortOptions = useMemo(
    () =>
      Object.entries(SORT_OPTION_KEYS).map(([id, key]) => ({
        id,
        label: t?.(key) || id,
      })),
    [t]
  );

  const processingCount = useMemo(
    () => (DOCUMENT_OCR_ENABLED ? documents.filter((d) => d.ocrStatus === 'processing').length : 0),
    [documents]
  );

  const filtered = useMemo(() => {
    let list = [...documents];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) => String(d.name || '').toLowerCase().includes(q));
    if (activeFilter === 'starred') list = list.filter((d) => d.starred);
    if (activeFilter === 'shared') list = list.filter((d) => d.shared);
    if (DOCUMENT_OCR_ENABLED && activeFilter === 'ocr') list = list.filter((d) => d.ocrStatus === 'processing');
    return sortDocuments(list, sortKey);
  }, [documents, search, activeFilter, sortKey]);

  const filterChips = useMemo(
    () => [
      { key: 'all', label: t('documents.listFilterAll'), count: documents.length },
      {
        key: 'starred',
        label: t('documents.listFilterStarred'),
        count: documents.filter((d) => d.starred).length,
      },
      {
        key: 'shared',
        label: t('documents.listFilterShared'),
        count: documents.filter((d) => d.shared).length,
      },
      DOCUMENT_OCR_ENABLED
        ? { key: 'ocr', label: t('documents.badgeAiProcessing'), count: processingCount }
        : null,
    ].filter(Boolean),
    [documents, processingCount, t]
  );

  const triggerUpload = () => {
    if (!canUpload) return;
    if (onUploadFiles) uploadRef.current?.click();
    else onUploadClick?.();
  };

  useEffect(() => {
    if (!DOCUMENT_OCR_ENABLED && activeFilter === 'ocr') {
      setActiveFilter('all');
    }
  }, [activeFilter]);

  useEffect(() => {
    if (!showSort) return undefined;
    const close = () => setShowSort(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showSort]);

  return (
    <div className={FIGMA_DOC_PAGE}>
      <header className={`${FIGMA_DOC_HEADER} flex h-14 items-center gap-2.5 px-6 shadow-xs`}>
        <div className="flex shrink-0 items-center gap-2">
          <FileText size={15} className="text-primary" />
          <h4 className="m-0 text-sm font-semibold text-foreground">
            {t('documents.title')}
          </h4>
        </div>

        <div className="relative max-w-[360px] flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('documents.searchPlaceholder')}
            className="h-[34px] w-full rounded-lg border border-border bg-input-background pl-[30px] pr-2.5 text-[0.8125rem] text-foreground outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/10"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSort((v) => !v);
              }}
              className="flex h-[34px] items-center gap-1.5 rounded-lg border-none bg-muted px-3 text-[0.8125rem] text-muted-foreground transition hover:bg-accent hover:text-primary"
            >
              {sortLabel} <ChevronDown size={13} />
            </button>
            {showSort && (
              <div
                className="absolute right-0 top-[38px] z-30 min-w-[180px] animate-scale-in rounded-[10px] border border-border bg-surface-overlay p-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {sortOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSortKey(opt.id);
                      setShowSort(false);
                    }}
                    className={`w-full rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] ${
                      sortKey === opt.id
                        ? 'bg-accent font-semibold text-primary'
                        : 'font-normal text-foreground hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
            {[
              ['list', List],
              ['grid', Grid3X3],
            ].map(([mode, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`flex h-7 w-7 items-center justify-center rounded-md border-none transition ${
                  viewMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>

          {canUpload && (
            <>
              <button
                type="button"
                onClick={triggerUpload}
                className="flex h-[34px] items-center gap-1.5 rounded-lg border-none bg-gradient-to-br from-primary to-primary-hover px-3.5 text-[0.8125rem] font-semibold text-primary-foreground shadow-primary/35 transition hover:shadow-md"
              >
                <Upload size={13} />
                {t('documents.upload')}
              </button>
              <input
                ref={uploadRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) onUploadFiles?.(files);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-4 px-6 py-5">
        {DOCUMENT_OCR_ENABLED && processingCount > 0 && (
          <div className="flex items-center gap-3.5 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/7 to-info/5 px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-info shadow-md shadow-primary/40">
              <Sparkles size={17} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-primary">{t('documents.ocrBannerTitle')}</div>
              <div className="text-[0.8125rem] text-muted-foreground">
                {t('documents.ocrBannerDesc', { n: processingCount })}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition ${
                activeFilter === key
                  ? 'border-primary/35 bg-primary/8 text-primary'
                  : 'border-border bg-surface text-muted-foreground hover:border-primary/25 hover:text-foreground'
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold ${
                  activeFilter === key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {t('documents.docCount', { n: filtered.length })}
          </span>
        </div>

        {canUpload && (
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files || []);
              if (files.length) onUploadFiles?.(files);
              else triggerUpload();
            }}
            onClick={triggerUpload}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerUpload();
              }
            }}
            className={`flex cursor-pointer items-center gap-3.5 rounded-xl border-2 border-dashed px-5 py-3.5 transition ${
              dragOver
                ? 'border-primary bg-primary/6'
                : 'border-border-strong hover:border-primary/40 hover:bg-primary/3'
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FilePlus size={17} className="text-primary" />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">
                {t('documents.dropzoneTitle')}{' '}
                <span className="font-semibold text-primary">{t('documents.dropzoneBrowse')}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {DOCUMENT_OCR_ENABLED ? t('documents.dropzoneHintOcr') : t('documents.dropzoneHint')}
              </div>
            </div>
          </div>
        )}

        {documentsLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {loadingLabel || t('documents.orgLoading')}
          </p>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-muted opacity-60">
              <FolderOpen size={26} className="text-muted-foreground" />
            </div>
            <p className="mb-1.5 font-medium text-foreground">{t('documents.emptyNotFound')}</p>
            <p className="text-sm text-muted-foreground">
              {search ? t('documents.emptyTryKeyword') : emptyLabel || t('documents.personalEmpty')}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="flex flex-col gap-1.5">
            {filtered.map((doc) => (
              <DocRowActions
                key={doc.id}
                doc={doc}
                t={t}
                onView={onView}
                onDownload={onDownload}
                onShare={onShare}
                onDelete={onDelete}
                onStar={onStar}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {filtered.map((doc) => {
              const Icon = DOC_TYPE_ICON[doc.docType] || File;
              const color = doc.color || docTypeColor(doc.docType);
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onView?.(doc)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onView?.(doc);
                    }
                  }}
                  className={`${FIGMA_DOC_GRID_CARD} relative cursor-pointer`}
                  style={{ borderColor: undefined }}
                >
                  {doc.starred && (
                    <Star
                      size={12}
                      className="absolute right-3 top-3 text-warning"
                      fill="currentColor"
                    />
                  )}
                  <div
                    className="mb-3 flex h-11 w-11 items-center justify-center rounded-[11px] border"
                    style={{ background: `${color}14`, borderColor: `${color}20` }}
                  >
                    <Icon size={22} style={{ color }} />
                  </div>
                  <div className="mb-1 truncate text-[0.8125rem] font-medium text-foreground">
                    {doc.name}
                  </div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[0.5625rem] font-bold"
                      style={{ background: `${color}14`, color }}
                    >
                      {docTypeLabel(doc.docType, { t, locale: doc.locale })}
                    </span>
                    <span className="text-[0.6875rem] text-muted-foreground">{doc.size}</span>
                  </div>
                  {DOCUMENT_OCR_ENABLED && doc.ocrStatus === 'processing' && (
                    <div className="h-1 overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-info"
                        style={{ width: `${Math.min(doc.ocrProgress || 0, 99)}%` }}
                      />
                    </div>
                  )}
                  {DOCUMENT_OCR_ENABLED && doc.ocrStatus === 'done' && (
                    <span className="inline-flex items-center gap-1 text-[0.625rem] font-semibold text-success">
                      <CheckCircle2 size={10} /> OCR
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
