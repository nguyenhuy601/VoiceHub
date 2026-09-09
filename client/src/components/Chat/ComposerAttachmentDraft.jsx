import { FileText, X } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { resolveComposerFileDisplayName } from '../../utils/composerAttachmentUtils';

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * File/ảnh đính kèm trong composer — preview trước khi bấm Gửi (Zalo / ClickUp style).
 */
export default function ComposerAttachmentDraft({
  file,
  previewUrl = null,
  isDarkMode = true,
  onRemove,
  disabled = false,
}) {
  const { t } = useAppStrings();
  if (!file) return null;

  const isImage = Boolean(previewUrl);
  const panelCls = isDarkMode
    ? 'border-white/10 bg-white/[0.04]'
    : 'border-slate-200 bg-slate-50';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const titleCls = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const displayName = resolveComposerFileDisplayName(file, t);

  return (
    <div className={`mb-2 rounded-xl border p-2 ${panelCls}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>
          {t('chat.composerAttachmentLabel')}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={`rounded-md p-1 transition hover:bg-white/10 disabled:opacity-40 ${mutedCls}`}
          aria-label={t('chat.composerAttachmentRemove')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-start gap-2">
        {isImage ? (
          <img
            src={previewUrl}
            alt={displayName}
            className="h-16 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
          />
        ) : (
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border ${
              isDarkMode ? 'border-white/10 bg-white/[0.06]' : 'border-slate-200 bg-white'
            }`}
          >
            <FileText className={`h-7 w-7 ${mutedCls}`} strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className={`truncate text-sm font-medium ${titleCls}`} title={displayName}>
            {displayName}
          </p>
          <p className={`text-xs ${mutedCls}`}>{formatFileSize(file.size)}</p>
          <p className={`mt-1 text-[11px] leading-snug ${mutedCls}`}>{t('chat.composerAttachmentHint')}</p>
        </div>
      </div>
    </div>
  );
}
