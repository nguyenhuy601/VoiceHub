import { useEffect, useMemo, useState } from 'react';
import { User } from 'lucide-react';
import ForwardMessagePreview from '../Chat/ForwardMessagePreview';
import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchBar } from '../../features/search';

const MOTION_BTN =
  'motion-safe:transition-colors motion-reduce:transition-none';

/**
 * Chuyển tiếp tin DM tới một hoặc nhiều bạn bè.
 */
export default function ForwardToFriendModal({
  isOpen,
  onClose,
  friends = [],
  excludeFriendId = null,
  previewText = '',
  previewMessage = null,
  loading = false,
  submitting = false,
  onConfirm,
}) {
  const { t } = useAppStrings();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [note, setNote] = useState('');

  const rows = useMemo(() => {
    const ex = excludeFriendId != null ? String(excludeFriendId) : null;
    return friends.filter((f) => {
      const id = String(f.id ?? f._id ?? '');
      if (ex && id === ex) return false;
      return true;
    });
  }, [friends, excludeFriendId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((f) => String(f.name || '').toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setNote('');
    setSelected({});
  }, [isOpen]);

  const toggle = (id) => {
    const key = String(id);
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const handleSend = () => {
    if (!selectedIds.length) return;
    onConfirm?.({ friendIds: selectedIds, note: note.trim() });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('chat.forward.title')}
      size="md"
      layerClassName="z-[320]"
    >
      <p className="mb-3 text-sm text-muted-foreground">{t('chat.forward.recipientHint')}</p>

      <PageSearchBar
        className="mb-3"
        value={search}
        onChange={setSearch}
        placeholder={t('chat.forward.searchPlaceholder')}
        size="sm"
        id="forward-friend-search"
      />

      <div className="mb-3 max-h-52 overflow-y-auto rounded-xl border border-border bg-card">
        {loading && (
          <div className="p-4 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('chat.forward.empty')}
          </div>
        )}
        {!loading &&
          filtered.map((f, idx) => {
            const rawId = f.id ?? f._id;
            const idStr = rawId != null && rawId !== '' ? String(rawId) : '';
            const rowKey = f.listKey ?? (idStr || `fwd-friend-${idx}`);
            return (
              <label
                key={rowKey}
                className={`flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-muted ${MOTION_BTN}`}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
                  {typeof f.avatar === 'string' &&
                  (f.avatar.startsWith('http') || f.avatar.startsWith('/')) ? (
                    <img src={f.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">
                    {f.name || t('friendChat.friendFallback')}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={idStr ? !!selected[idStr] : false}
                  onChange={() => idStr && toggle(idStr)}
                  disabled={!idStr}
                  className="h-4 w-4 rounded border-border disabled:opacity-40"
                  aria-label={t('chat.forward.selectFriend', {
                    name: f.name || t('friendChat.friendFallback'),
                  })}
                />
              </label>
            );
          })}
      </div>

      <div className="mb-3 rounded-xl border border-dashed border-border bg-muted/40 p-3 text-sm text-foreground">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('chat.forward.previewLabel')}
        </div>
        {previewMessage ? (
          <ForwardMessagePreview message={previewMessage} t={t} />
        ) : (
          <p className="line-clamp-4 whitespace-pre-wrap break-words">
            {previewText || t('chat.forward.emptyPreview')}
          </p>
        )}
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="forward-note">
          {t('chat.forward.noteLabel')}
        </label>
        <input
          id="forward-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('chat.forward.notePlaceholder')}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onClose}
          className={`rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted ${MOTION_BTN}`}
        >
          {t('chat.forward.cancel')}
        </button>
        <button
          type="button"
          disabled={!selectedIds.length || loading || submitting}
          onClick={handleSend}
          className={`inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${MOTION_BTN}`}
        >
          {submitting ? t('chat.forward.sending') : t('chat.forward.confirm')}
        </button>
      </div>
    </Modal>
  );
}
