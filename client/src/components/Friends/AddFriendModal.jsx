import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { GlassCard, GradientButton } from '../Shared';
import UserAvatar from '../Shared/UserAvatar';
import friendService from '../../services/friendService';
import { markFriendNotificationsResolved } from '../../services/notificationSync';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_CHAT_ADD_FRIEND_BACKDROP,
  FIGMA_CHAT_ADD_FRIEND_CLOSE,
  FIGMA_CHAT_ADD_FRIEND_HEADER,
  FIGMA_CHAT_ADD_FRIEND_OVERLAY,
  FIGMA_CHAT_ADD_FRIEND_PANEL,
  FIGMA_CHAT_ADD_FRIEND_SEARCH_INPUT,
  FIGMA_CHAT_ADD_FRIEND_SECTION,
  FIGMA_CHAT_ADD_FRIEND_SUBTITLE,
  FIGMA_CHAT_ADD_FRIEND_TITLE,
  FIGMA_CHAT_INVITE_ACCEPT_BTN,
  FIGMA_CHAT_INVITE_ACTIONS,
  FIGMA_CHAT_INVITE_CARD,
  FIGMA_CHAT_INVITE_REJECT_BTN,
  FIGMA_CHAT_INVITES_EMPTY,
  FIGMA_CHAT_INVITES_SECTION_TITLE,
} from '../Chat/figmaChatClasses';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrapApiPayload(res) {
  if (res == null) return null;
  return res.data !== undefined ? res.data : res;
}

/**
 * Modal căn giữa màn hình: tìm bạn theo SĐT, gửi lời mời, lời mời đến.
 */
export default function AddFriendModal({ isOpen, onClose, onFriendlistChanged }) {
  const { t } = useAppStrings();
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [searching, setSearching] = useState(false);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await friendService.getPendingRequests();
      const inner = unwrapApiPayload(res);
      const arr = Array.isArray(inner) ? inner : Array.isArray(inner?.data) ? inner.data : [];
      setPending(arr);
    } catch {
      setPending([]);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    loadPending();
    setSearchPhone('');
    setSearchResult(null);
  }, [isOpen, loadPending]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSearch = async () => {
    if (!searchPhone.trim()) {
      toast.error(t('friends.toastPhoneRequired'));
      return;
    }
    setSearching(true);
    setSearchResult(null);
    try {
      const resp = await friendService.searchByPhone(searchPhone.trim());
      const user = unwrapApiPayload(resp);
      if (user && (user._id || user.userId || user.phone)) {
        setSearchResult(user);
      } else {
        toast(t('friends.toastSearchNone'), { icon: 'ℹ️' });
      }
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friends.toastSearchErr') }));
    } finally {
      setSearching(false);
    }
  };

  const targetUserId = (user) => String(user?.userId || user?._id || '').trim();

  const sendFriendRequest = async (userId) => {
    if (!userId) {
      toast.error(t('friends.errUserUnknown'));
      return;
    }
    try {
      await friendService.sendRequest(userId);
      toast.success(t('friends.toastRequestSent'));
      setSearchResult(null);
      setSearchPhone('');
      onFriendlistChanged?.();
      await loadPending();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friends.toastSendFail') }));
    }
  };

  const pendingRequesterProfile = (row) => {
    const candidates = [row?.requester, row?.fromUser, row?.userId];
    for (const c of candidates) {
      if (c && typeof c === 'object') return c;
    }
    return null;
  };

  const pendingRequesterId = (row) => {
    const profile = pendingRequesterProfile(row);
    if (profile) {
      return String(profile.userId || profile._id || profile.id || '').trim();
    }
    if (typeof row?.userId === 'string') return row.userId.trim();
    return String(row?.requester || '').trim();
  };

  const acceptRequest = async (row) => {
    const requestId = row?._id || row?.id;
    const friendId = pendingRequesterId(row);
    try {
      if (friendId) await friendService.acceptFriend(friendId);
      else await friendService.acceptRequest(requestId);
      if (friendId) await markFriendNotificationsResolved(friendId);
      toast.success(t('friendChat.pendingAcceptOk'));
      onFriendlistChanged?.();
      await loadPending();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friends.toastGenericErr') }));
    }
  };

  const rejectRequest = async (row) => {
    const requestId = row?._id || row?.id;
    const friendId = pendingRequesterId(row);
    try {
      if (friendId) await friendService.rejectFriend(friendId);
      else await friendService.rejectRequest(requestId);
      if (friendId) await markFriendNotificationsResolved(friendId);
      toast.success(t('friendChat.pendingRejectOk'));
      onFriendlistChanged?.();
      await loadPending();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friends.toastGenericErr') }));
    }
  };

  const blockRequestUser = async (row) => {
    const friendId = pendingRequesterId(row);
    if (!friendId) {
      toast.error(t('friends.errUserUnknown'));
      return;
    }
    try {
      await friendService.blockFriend(friendId);
      toast.success(t('friendChat.blockOk'));
      onFriendlistChanged?.();
      await loadPending();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.blockFail') }));
    }
  };

  const relationshipLabel = (rel) => {
    if (!rel?.status) return null;
    const s = String(rel.status).toLowerCase();
    if (s === 'accepted' || s === 'friends') return t('friends.relFriends');
    if (s === 'pending') return t('friends.relPending');
    if (s === 'blocked') return t('friends.relBlocked');
    if (s === 'dissolving') return t('friends.relDissolving');
    return rel.status;
  };

  const canSendRequest = (user) => {
    const id = targetUserId(user);
    if (!id) return false;
    const rel = user?.relationship;
    if (!rel) return true;
    const st = String(rel.status || '').toLowerCase();
    if (st === 'accepted' || st === 'friends') return false;
    if (st === 'pending') return false;
    if (st === 'dissolving') return false;
    return true;
  };

  const defaultUserName = t('chat.defaultUserName');

  if (!isOpen) return null;

  return (
    <div
      className={FIGMA_CHAT_ADD_FRIEND_OVERLAY}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-friend-title"
    >
      <button
        type="button"
        className={FIGMA_CHAT_ADD_FRIEND_BACKDROP}
        aria-label={t('nav.close')}
        onClick={onClose}
      />

      <div className={FIGMA_CHAT_ADD_FRIEND_PANEL} onClick={(e) => e.stopPropagation()}>
        <header className={FIGMA_CHAT_ADD_FRIEND_HEADER}>
          <div className="min-w-0">
            <h1 id="add-friend-title" className={FIGMA_CHAT_ADD_FRIEND_TITLE}>
              {t('friends.addFriendModalTitle')}
            </h1>
            <p className={FIGMA_CHAT_ADD_FRIEND_SUBTITLE}>{t('friends.addFriendModalSubtitle')}</p>
          </div>
          <button type="button" onClick={onClose} className={FIGMA_CHAT_ADD_FRIEND_CLOSE}>
            {t('nav.close')}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 scrollbar-overlay">
          <div className="space-y-6">
            <section>
              <h2 className={FIGMA_CHAT_ADD_FRIEND_SECTION}>{t('friends.searchSection')}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={t('friends.phonePlaceholder')}
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className={FIGMA_CHAT_ADD_FRIEND_SEARCH_INPUT}
                />
                <GradientButton
                  variant="primary"
                  type="button"
                  className="px-5 py-3"
                  disabled={searching}
                  onClick={handleSearch}
                >
                  {searching ? '…' : t('friends.searchBtn')}
                </GradientButton>
              </div>

              {searchResult && (
                <GlassCard className={`mt-4 ${FIGMA_CHAT_INVITE_CARD}`}>
                  <div className="flex flex-wrap items-center gap-4">
                    <UserAvatar
                      avatar={searchResult.avatar}
                      userId={targetUserId(searchResult)}
                      name={
                        searchResult.displayName ||
                        searchResult.name ||
                        searchResult.username ||
                        defaultUserName
                      }
                      size="profile"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-bold text-foreground">
                        {searchResult.displayName ||
                          searchResult.name ||
                          searchResult.username ||
                          defaultUserName}
                      </h3>
                      {searchResult.phone && (
                        <div className="text-sm text-muted-foreground">{searchResult.phone}</div>
                      )}
                      {searchResult.relationship && (
                        <div className="mt-1 text-xs text-primary">{relationshipLabel(searchResult.relationship)}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canSendRequest(searchResult) ? (
                        <GradientButton
                          variant="primary"
                          type="button"
                          onClick={() => sendFriendRequest(targetUserId(searchResult))}
                        >
                          {t('friends.sendInvite')}
                        </GradientButton>
                      ) : (
                        <span className="px-2 py-2 text-sm text-gray-500">{t('friends.cannotSendInvite')}</span>
                      )}
                    </div>
                  </div>
                </GlassCard>
              )}
            </section>

            <section>
              <h2 className={FIGMA_CHAT_INVITES_SECTION_TITLE}>
                {t('friends.incomingRequests')}
                {loadingPending ? (
                  <span className="ml-2 font-normal normal-case text-muted-foreground">
                    {t('friendChat.loadingRail')}
                  </span>
                ) : (
                  <span className="ml-2 font-normal normal-case text-primary">({pending.length})</span>
                )}
              </h2>
              {pending.length === 0 && !loadingPending ? (
                <p className={FIGMA_CHAT_INVITES_EMPTY}>{t('friends.noPendingRequests')}</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((row) => {
                    const req = pendingRequesterProfile(row) || {};
                    const name =
                      req.displayName ||
                      req.name ||
                      req.username ||
                      (req.email ? String(req.email).split('@')[0] : defaultUserName);
                    const rid = row._id || row.id || pendingRequesterId(row);
                    return (
                      <GlassCard key={String(rid)} className={FIGMA_CHAT_INVITE_CARD}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <UserAvatar
                            avatar={req.avatar}
                            userId={pendingRequesterId(row)}
                            name={name}
                            size="lg"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-foreground">{name}</div>
                            <div className="text-xs text-muted-foreground">
                              {t('friendChat.pendingWantsFriend')}
                            </div>
                          </div>
                          <div className={`grid w-full grid-cols-3 gap-2 sm:w-auto ${FIGMA_CHAT_INVITE_ACTIONS}`}>
                            <button
                              type="button"
                              className={`${FIGMA_CHAT_INVITE_ACCEPT_BTN} justify-center px-3 py-2 text-sm`}
                              onClick={() => acceptRequest(row)}
                            >
                              {t('friends.accept')}
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectRequest(row)}
                              className={`${FIGMA_CHAT_INVITE_REJECT_BTN} px-3 py-2 text-sm`}
                            >
                              {t('friends.reject')}
                            </button>
                            <button
                              type="button"
                              onClick={() => blockRequestUser(row)}
                              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/20"
                            >
                              {t('friends.block')}
                            </button>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

    </div>
  );
}
