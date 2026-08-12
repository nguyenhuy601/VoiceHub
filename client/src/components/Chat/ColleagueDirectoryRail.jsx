import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import UserAvatar from '../Shared/UserAvatar';
import { useAppStrings } from '../../locales/appStrings';
import { loadCompanyColleagues } from './loadCompanyColleagues';
import {
  FIGMA_CHAT_RAIL_ITEM,
  FIGMA_CHAT_RAIL_ITEM_ACTIVE,
  FIGMA_CHAT_RAIL_NAME,
  FIGMA_CHAT_RAIL_PREVIEW,
  FIGMA_CHAT_SIDEBAR_LIST,
  FIGMA_CHAT_SIDEBAR_SEARCH,
  FIGMA_CHAT_SIDEBAR_SEARCH_WRAP,
} from './figmaChatClasses';

/**
 * Rail tab Đồng nghiệp — browse cùng phòng ban, bấm → mở DM.
 * Tên/email/avatar hydrate qua enrichMembershipsWithProfiles.
 */
export default function ColleagueDirectoryRail({
  orgId,
  currentUserId,
  selectedUserId,
  onlineUsers,
  onSelectColleague,
}) {
  const { t } = useAppStrings();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [emptyReason, setEmptyReason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const oid = String(orgId || '').trim();
    if (!oid) {
      setRows([]);
      setEmptyReason('none');
      setLoadError(true);
      setLoading(false);
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
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((m) => {
      const hay = `${m.displayName} ${m.email}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const onlineSet = useMemo(() => {
    if (!onlineUsers) return new Set();
    if (onlineUsers instanceof Set) return onlineUsers;
    if (Array.isArray(onlineUsers)) return new Set(onlineUsers.map(String));
    if (typeof onlineUsers === 'object') return new Set(Object.keys(onlineUsers));
    return new Set();
  }, [onlineUsers]);

  const emptyMessage =
    emptyReason === 'no_department'
      ? t('friendChat.colleaguesNoDepartment')
      : t('friendChat.colleaguesEmpty');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={FIGMA_CHAT_SIDEBAR_SEARCH_WRAP}>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('friendChat.newDmSearchPh')}
          aria-label={t('friendChat.newDmSearchPh')}
          className={FIGMA_CHAT_SIDEBAR_SEARCH}
        />
      </div>
      <div className={FIGMA_CHAT_SIDEBAR_LIST}>
        {loading ? (
          <p className="px-3.5 py-4 text-center text-xs text-muted-foreground">
            {t('friendChat.loadingColleagues')}
          </p>
        ) : loadError ? (
          <p className="px-3.5 py-4 text-center text-xs text-muted-foreground">
            {t('friendChat.colleaguesLoadFail')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3.5 py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          filtered.map((m) => {
            const active = String(selectedUserId || '') === String(m.userId);
            const online = onlineSet.has(String(m.userId));
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => onSelectColleague?.(m)}
                className={`${FIGMA_CHAT_RAIL_ITEM} ${active ? FIGMA_CHAT_RAIL_ITEM_ACTIVE : ''}`}
                title={m.displayName}
              >
                <UserAvatar
                  avatar={m.avatar}
                  userId={m.userId}
                  name={m.displayName}
                  size="md"
                  showOnline
                  status={online ? 'online' : 'offline'}
                  ringClassName="border border-border bg-muted shadow-inner"
                />
                <div className="min-w-0 flex-1">
                  <div className={FIGMA_CHAT_RAIL_NAME}>{m.displayName}</div>
                  <p className={FIGMA_CHAT_RAIL_PREVIEW}>
                    {m.email ? m.email : t('friendChat.directoryPeerSubtitle')}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
