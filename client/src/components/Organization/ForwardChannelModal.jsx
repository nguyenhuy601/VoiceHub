import { useEffect, useId, useMemo, useState } from 'react';
import { Hash, Send } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { channelNameToDisplaySlug, displayDepartmentName } from '../../utils/orgEntityDisplay';
import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchBar } from '../../features/search';
import {
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../adminUsers/adminUserPanelUi';
import { AdminBusySpinner } from '../adminUsers/adminPanelStates';

const FORWARD_NOTE_MAX = 500;

/**
 * Chuyển tiếp tin tới một hoặc nhiều kênh chat (theo phòng ban).
 * `targets`: mỗi phòng ban có danh sách kênh chat (không voice).
 */
export default function ForwardChannelModal({
  isOpen,
  onClose,
  organizationName = '',
  targets = [],
  /** { channelId: true } */
  initialSelected = {},
  previewText = '',
  loading = false,
  onConfirm,
}) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const { isDarkMode } = useTheme();
  const fieldId = useId();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => ({ ...initialSelected }));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setNote('');
    setSelected({});
    setSending(false);
  }, [isOpen]);

  const flatRows = useMemo(() => {
    const rows = [];
    for (const dept of targets) {
      const chans = Array.isArray(dept.channels) ? dept.channels : [];
      for (const ch of chans) {
        if (ch.type === 'voice') continue;
        rows.push({
          key: `${dept.departmentId}:${ch._id}`,
          departmentId: dept.departmentId,
          departmentName: displayDepartmentName(dept.departmentName, locale),
          channelId: String(ch._id),
          channelName: channelNameToDisplaySlug(ch.name || 'chat', locale),
        });
      }
    }
    return rows;
  }, [targets, locale]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flatRows;
    return flatRows.filter(
      (r) =>
        r.channelName.toLowerCase().includes(q) ||
        r.departmentName.toLowerCase().includes(q)
    );
  }, [flatRows, search]);

  const toggle = (channelId) => {
    const id = String(channelId);
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const handleSend = async () => {
    if (!selectedIds.length || sending) return;
    setSending(true);
    try {
      await onConfirm?.({ channelIds: selectedIds, note: note.trim() });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closable={!sending}
      title={t('taskBoard.forwardTitle')}
      size="md"
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t('taskBoard.forwardDesc', {
          org: organizationName
            ? t('taskBoard.forwardDescOrg', { name: organizationName })
            : '',
        })}
      </p>

      <PageSearchBar
        className="mb-3"
        value={search}
        onChange={setSearch}
        placeholder={t('searchUi.searchAria')}
        isDarkMode={isDarkMode}
        size="sm"
        id="forward-channel-search"
      />

      <fieldset
        className="mb-3 max-h-52 overflow-y-auto rounded-xl border border-border bg-muted/40"
        aria-busy={loading}
        disabled={sending}
      >
        <legend className="sr-only">{t('taskBoard.forwardTargetsLegend')}</legend>
        {loading && (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <AdminBusySpinner busy />
            {t('taskBoard.loadingChannels')}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">{t('taskBoard.noMatchingChannels')}</div>
        )}
        {!loading &&
          filtered.map((row) => {
            const checkboxId = `${fieldId}-ch-${row.channelId}`;
            const isChecked = !!selected[row.channelId];
            return (
              <label
                key={row.key}
                htmlFor={checkboxId}
                className={`flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors duration-150 last:border-0 hover:bg-muted motion-reduce:transition-none ${
                  isChecked ? 'bg-primary/10' : ''
                }`}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Hash className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground"># {row.channelName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{row.departmentName}</span>
                </span>
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(row.channelId)}
                  className="h-4 w-4 rounded border-border accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            );
          })}
      </fieldset>

      <div className="mb-3 rounded-xl border border-dashed border-border bg-muted/40 p-3 text-sm text-foreground">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('taskBoard.preview')}
        </div>
        <p className="line-clamp-4 whitespace-pre-wrap break-words">{previewText || '—'}</p>
      </div>

      <div className="mb-4">
        <label htmlFor={`${fieldId}-note`} className={adminLabelClass()}>
          {t('taskBoard.optionalNote')}
        </label>
        <input
          id={`${fieldId}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('taskBoard.optionalNote')}
          maxLength={FORWARD_NOTE_MAX}
          disabled={sending}
          className={adminInputClass()}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button type="button" onClick={onClose} disabled={sending} className={adminSecondaryBtnClass()}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!selectedIds.length || loading || sending}
          aria-busy={sending}
          onClick={handleSend}
          className={adminPrimaryBtnClass()}
        >
          {sending ? <AdminBusySpinner busy /> : <Send className="h-4 w-4" aria-hidden />}
          {t('taskBoard.sendForward')}
          {selectedIds.length > 0 ? (
            <span className="rounded-full bg-primary-foreground/20 px-1.5 text-xs">{selectedIds.length}</span>
          ) : null}
        </button>
      </div>
    </Modal>
  );
}
