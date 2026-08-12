import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import UserAvatar from '../Shared/UserAvatar';
import { useAppStrings } from '../../locales/appStrings';
import { loadCompanyColleagues } from './loadCompanyColleagues';
import {
  FIGMA_CHAT_ADD_FRIEND_BACKDROP,
  FIGMA_CHAT_ADD_FRIEND_CLOSE,
  FIGMA_CHAT_ADD_FRIEND_HEADER,
  FIGMA_CHAT_ADD_FRIEND_OVERLAY,
  FIGMA_CHAT_ADD_FRIEND_PANEL,
  FIGMA_CHAT_ADD_FRIEND_SEARCH_INPUT,
  FIGMA_CHAT_ADD_FRIEND_SUBTITLE,
  FIGMA_CHAT_ADD_FRIEND_TITLE,
  FIGMA_CHAT_INVITES_EMPTY,
} from './figmaChatClasses';

/**
 * Modal doanh nghiệp: tìm đồng nghiệp cùng phòng → mở chat 1-1 (không lời mời kết bạn).
 * Tên/email/avatar hydrate qua enrichMembershipsWithProfiles.
 */
export default function NewColleagueDmModal({
  isOpen,
  onClose,
  orgId,
  currentUserId,
  onSelectColleague,
}) {
  const { t } = useAppStrings();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [emptyReason, setEmptyReason] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const oid = String(orgId || '').trim();
    if (!oid) {
      setRows([]);
      setEmptyReason('none');
      setLoadError(true);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const result = await loadCompanyColleagues(oid, currentUserId, {
        fallback: t('friendChat.friendDefault'),
      });
      setRows(result.colleagues || []);
      setEmptyReason(result.emptyReason);
    } catch {
      setRows([]);
      setEmptyReason('none');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [orgId, currentUserId, t]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setQ('');
    load();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((m) => {
      const hay = `${m.displayName} ${m.email}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  if (!isOpen) return null;

  const emptyMessage =
    emptyReason === 'no_department'
      ? t('friendChat.colleaguesNoDepartment')
      : t('friendChat.colleaguesEmpty');

  return (
    <div className={FIGMA_CHAT_ADD_FRIEND_OVERLAY} role="presentation">
      <button
        type="button"
        className={FIGMA_CHAT_ADD_FRIEND_BACKDROP}
        aria-label={t('nav.cancel')}
        onClick={onClose}
      />
      <div
        className={FIGMA_CHAT_ADD_FRIEND_PANEL}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-colleague-dm-title"
      >
        <div className={FIGMA_CHAT_ADD_FRIEND_HEADER}>
          <div>
            <h2 id="new-colleague-dm-title" className={FIGMA_CHAT_ADD_FRIEND_TITLE}>
              {t('friendChat.newDmTitle')}
            </h2>
            <p className={FIGMA_CHAT_ADD_FRIEND_SUBTITLE}>{t('friendChat.newDmSubtitle')}</p>
          </div>
          <button
            type="button"
            className={FIGMA_CHAT_ADD_FRIEND_CLOSE}
            onClick={onClose}
            aria-label={t('nav.cancel')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="relative px-4 pb-3">
          <Search
            className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('friendChat.newDmSearchPh')}
            className={`${FIGMA_CHAT_ADD_FRIEND_SEARCH_INPUT} pl-9`}
            autoFocus
          />
        </div>

        <div className="max-h-[min(420px,55vh)] overflow-y-auto px-2 pb-4">
          {loading ? (
            <p className={FIGMA_CHAT_INVITES_EMPTY}>{t('friendChat.loadingColleagues')}</p>
          ) : loadError ? (
            <p className={FIGMA_CHAT_INVITES_EMPTY}>{t('friendChat.colleaguesLoadFail')}</p>
          ) : filtered.length === 0 ? (
            <p className={FIGMA_CHAT_INVITES_EMPTY}>{emptyMessage}</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted/60"
                    onClick={() => {
                      onSelectColleague?.(m);
                      onClose?.();
                    }}
                  >
                    <UserAvatar
                      avatar={m.avatar}
                      userId={m.userId}
                      name={m.displayName}
                      size="md"
                      ringClassName="border border-border bg-muted"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {m.displayName}
                      </span>
                      {m.email ? (
                        <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-primary">
                      {t('friendChat.newDmAction')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
