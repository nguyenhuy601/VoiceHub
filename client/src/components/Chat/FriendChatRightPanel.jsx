import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderOpen,
  Forward,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import { meetingAPI } from '../../services/api/meetingAPI';
import { fetchMutualOrganizations } from '../../utils/mutualOrganizations';
import UserAvatar from '../Shared/UserAvatar';
import Modal from '../Shared/Modal';
import ChatAttachmentContextMenu from './ChatAttachmentContextMenu';
import { isAvatarImageUrl } from '../../utils/avatarDisplay';
import { buildMediaAttachmentMenuItems } from '../../utils/buildAttachmentMenuItems';
import { fileTypeBadge, formatFileSize } from '../../utils/chatFileDisplay';
import {
  getFileHotDisplayDays,
  partitionHotChatFiles,
} from '../../utils/chatFileHotWindow';
import { buildCollaborateDocumentsPath } from '../../utils/suitePathUtils';
import {
  formatDmEventWhen,
  getDmRemindersForFriend,
} from '../../utils/dmCalendarReminders';

function formatShortDate(iso, localeTag) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(localeTag === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

const GRID_PREVIEW = 8;
const MOTION_BTN =
  'motion-safe:transition-colors motion-reduce:transition-none';

/**
 * Sidebar phải — Thông tin hội thoại (chuẩn Zalo).
 */
export default function FriendChatRightPanel({
  friend,
  messages = [],
  attachments,
  currentUserId,
  onClose,
  onBlock,
  isBlocked = false,
  onOpenProfile,
  onOpenMediaAt,
  onViewAllMedia,
  onAttachmentAction,
  onOpenCalendarForFriend,
  onOpenMutualOrganization,
}) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [openMedia, setOpenMedia] = useState(true);
  const [openFiles, setOpenFiles] = useState(true);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [fileMoreId, setFileMoreId] = useState(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [mutualOpen, setMutualOpen] = useState(false);
  const [peerReminders, setPeerReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [mutualOrgs, setMutualOrgs] = useState({
    loading: false,
    count: 0,
    organizations: [],
  });

  const { mediaItems = [], files = [] } = attachments || {};
  const gridMedia = mediaItems.slice(0, GRID_PREVIEW);
  const hotDisplayDays = getFileHotDisplayDays();
  const { hot: hotFiles, archivedCount: archivedFilesCount } = useMemo(
    () => partitionHotChatFiles(files, { hotDays: hotDisplayDays }),
    [files, hotDisplayDays]
  );

  const messageById = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const id = m?._id || m?.id;
      if (id != null) map.set(String(id), m);
    }
    return map;
  }, [messages]);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  const openMediaMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const msg = messageById.get(String(item.id));
    const canDelete =
      msg &&
      currentUserId &&
      String(msg.senderId?._id || msg.senderId || '') === String(currentUserId);

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildMediaAttachmentMenuItems({
        item,
        message: msg,
        canDelete,
        t,
        onAction: onAttachmentAction,
      }),
    });
  };

  const openFileMenu = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    const msg = messageById.get(String(file.id));
    const canDelete =
      msg &&
      currentUserId &&
      String(msg.senderId?._id || msg.senderId || '') === String(currentUserId);

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'open',
          label: t('friendChat.openFile'),
          icon: <FolderOpen className="h-4 w-4" aria-hidden />,
          onClick: () => onAttachmentAction?.('open', { url: file.url }),
        },
        {
          id: 'share',
          label: t('friendChat.mediaShare'),
          icon: <Forward className="h-4 w-4" aria-hidden />,
          onClick: () => onAttachmentAction?.('share', { messageId: file.id, message: msg }),
        },
        {
          id: 'jump',
          label: t('friendChat.jumpToMessage'),
          icon: <MessageCircle className="h-4 w-4" aria-hidden />,
          onClick: () => onAttachmentAction?.('jumpToMessage', { messageId: file.id }),
        },
        {
          id: 'save',
          label: t('friendChat.mediaSaveDevice'),
          icon: <Save className="h-4 w-4" aria-hidden />,
          onClick: () =>
            onAttachmentAction?.('saveDevice', {
              messageId: file.id,
              url: file.url,
              name: file.name,
            }),
        },
        {
          id: 'delete',
          label: t('friendChat.mediaDeleteForMe'),
          icon: <Trash2 className="h-4 w-4" aria-hidden />,
          danger: true,
          disabled: !canDelete,
          onClick: () => onAttachmentAction?.('delete', { messageId: file.id, message: msg }),
        },
      ],
    });
  };

  const shell =
    'flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-l border-border bg-surface text-foreground';
  const hairlineB = 'border-b border-border';
  const hairlineT = 'border-t border-border';
  const titleMain = 'text-foreground';
  const labelMuted = 'text-foreground-secondary';
  const sectionBtn = `flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-muted/70 ${MOTION_BTN}`;
  const thumbBg = 'bg-muted';
  const quickRow = `flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted/70 ${MOTION_BTN}`;
  const actionCircle = `flex flex-col items-center gap-1.5 rounded-xl p-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground ${MOTION_BTN}`;

  const renderFileRow = (f) => {
    const mime = f.fileMeta?.mimeType || '';
    const badge = fileTypeBadge(f.name, mime);
    const sizeLabel = formatFileSize(f.fileMeta?.byteSize);
    const msg = messageById.get(String(f.id));
    const showActions = fileMoreId === String(f.id);

    return (
      <div
        key={f.id}
        className={`group px-3 py-2 hover:bg-muted/60 ${MOTION_BTN}`}
        onMouseEnter={() => setFileMoreId(String(f.id))}
        onMouseLeave={() => setFileMoreId(null)}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground ${badge.bg}`}
            onClick={() => f.url && onAttachmentAction?.('open', { url: f.url })}
            onContextMenu={(e) => openFileMenu(e, f)}
          >
            {badge.letter}
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => f.url && onAttachmentAction?.('open', { url: f.url })}
            onContextMenu={(e) => openFileMenu(e, f)}
          >
            <div className={`truncate text-sm font-semibold ${titleMain}`}>{f.name}</div>
            <div className={`mt-0.5 flex items-center gap-1.5 text-xs ${labelMuted}`}>
              {sizeLabel}
              {f.url && <Check className="h-3.5 w-3.5 text-success" strokeWidth={2.5} aria-hidden />}
            </div>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className={`text-xs tabular-nums ${labelMuted}`}>{formatShortDate(f.at, locale)}</span>
            {showActions && f.url && (
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-md">
              <button
                type="button"
                title={t('friendChat.openFile')}
                aria-label={t('friendChat.openFile')}
                onClick={() => onAttachmentAction?.('open', { url: f.url })}
                className={`rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${MOTION_BTN}`}
              >
                <FolderOpen className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                title={t('friendChat.mediaShare')}
                aria-label={t('friendChat.mediaShare')}
                onClick={() => onAttachmentAction?.('share', { messageId: f.id, message: msg })}
                className={`rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${MOTION_BTN}`}
              >
                <Forward className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                title={t('friendChat.moreActions')}
                aria-label={t('friendChat.moreActions')}
                onClick={(e) => openFileMenu(e, f)}
                className={`rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${MOTION_BTN}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const friendId = friend?.id != null ? String(friend.id) : '';

  const loadMutualOrgs = useCallback(
    (force = false) => {
      if (!friendId) {
        setMutualOrgs({ loading: false, count: 0, organizations: [] });
        return undefined;
      }
      let cancelled = false;
      setMutualOrgs((prev) => ({ ...prev, loading: true }));
      fetchMutualOrganizations(friendId, { force })
        .then((data) => {
          if (cancelled) return;
          const organizations = Array.isArray(data?.organizations) ? data.organizations : [];
          setMutualOrgs({
            loading: false,
            count: Number(data?.count ?? organizations.length) || 0,
            organizations,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setMutualOrgs({ loading: false, count: 0, organizations: [] });
          }
        });
      return () => {
        cancelled = true;
      };
    },
    [friendId]
  );

  useEffect(() => {
    const cleanup = loadMutualOrgs(false);
    return cleanup;
  }, [loadMutualOrgs]);

  const openDocumentsKho = useCallback(() => {
    const firstOrgId = String(mutualOrgs.organizations?.[0]?._id || '').trim();
    navigate(buildCollaborateDocumentsPath(firstOrgId));
  }, [mutualOrgs.organizations, navigate]);

  useEffect(() => {
    if (!friendId || !remindersOpen) return undefined;
    let cancelled = false;
    setRemindersLoading(true);
    const local = getDmRemindersForFriend(friendId, friend?.name || '');
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 120);

    meetingAPI
      .getMeetings({ startFrom: from.toISOString(), startTo: to.toISOString() })
      .then((res) => {
        if (cancelled) return;
        const body = res?.data ?? res;
        const data = body?.data ?? body;
        const meetings = Array.isArray(data?.meetings) ? data.meetings : [];
        const peerMeetings = meetings
          .filter((m) =>
            (m.participants || []).some(
              (p) => String(p.userId || p._id || p) === friendId
            )
          )
          .map((m) => ({
            id: m._id || m.id,
            title: m.title || t('calendar.tabEvent'),
            type: 'meeting',
            source: 'api',
            startAt: m.startTime,
            _startAt: m.startTime ? new Date(m.startTime) : null,
          }));
        const merged = [...local, ...peerMeetings].sort((a, b) => {
          const ta = a._startAt?.getTime?.() ?? (a.startAt ? new Date(a.startAt).getTime() : 0);
          const tb = b._startAt?.getTime?.() ?? (b.startAt ? new Date(b.startAt).getTime() : 0);
          return ta - tb;
        });
        setPeerReminders(merged);
      })
      .catch(() => {
        if (!cancelled) setPeerReminders(local);
      })
      .finally(() => {
        if (!cancelled) setRemindersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [friendId, friend?.name, remindersOpen, t]);

  const openRemindersModal = () => {
    const local = getDmRemindersForFriend(friendId, friend?.name || '');
    setPeerReminders(local);
    setRemindersOpen(true);
  };

  if (!friend) return null;

  return (
    <aside className={shell}>
      <div className={`relative shrink-0 px-4 py-3 text-center ${hairlineB}`}>
        <h3 className={`text-sm font-bold ${titleMain}`}>{t('friendChat.profileTitle')}</h3>
        {typeof onClose === 'function' ? (
          <button
            type="button"
            onClick={onClose}
            className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${MOTION_BTN}`}
            aria-label={t('chat.rightPanel.close')}
            title={t('chat.rightPanel.close')}
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
        <div className="flex flex-col items-center px-4 pb-4 pt-3">
          <UserAvatar
            avatar={friend.avatar}
            userId={friend.userId || friend.id || friend._id}
            name={friend.name}
            size="xl"
            onClick={onOpenProfile}
            showOnline
            status={friend.status}
            cacheBust={friend.avatar || undefined}
            ringClassName="ring-4 ring-primary/20 shadow-lg"
            title={t('friendChat.profileTitle')}
          />
          <button
            type="button"
            onClick={onOpenProfile}
            className={`mt-3 text-base font-bold hover:underline ${titleMain}`}
          >
            {friend.name}
          </button>

          <div className="mt-4 flex w-full justify-center">
            <button type="button" onClick={onBlock} className={actionCircle}>
              <Ban className="h-5 w-5" aria-hidden />
              <span>{isBlocked ? t('friendChat.unblockUser') : t('friendChat.blockUser')}</span>
            </button>
          </div>
        </div>

        <div className={hairlineT}>
          <button type="button" className={quickRow} onClick={openRemindersModal}>
            <Clock className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
            <span className="min-w-0 flex-1">{t('friendChat.remindersList')}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </button>
        </div>

        <section className={hairlineT}>
          <button
            type="button"
            onClick={() => setOpenMedia((o) => !o)}
            className={sectionBtn}
            aria-expanded={openMedia}
          >
            {t('chat.rightPanel.mediaSection')}
            {openMedia ? (
              <ChevronDown className={`h-4 w-4 ${labelMuted}`} aria-hidden />
            ) : (
              <ChevronRight className={`h-4 w-4 ${labelMuted}`} aria-hidden />
            )}
          </button>
          {openMedia && (
            <div className="px-4 pb-3">
              {mediaItems.length === 0 ? (
                <p className={`py-2 text-xs ${labelMuted}`}>{t('friendChat.mediaEmpty')}</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {gridMedia.map((img, idx) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => onOpenMediaAt?.(idx)}
                        onContextMenu={(e) => openMediaMenu(e, img)}
                        className={`aspect-square overflow-hidden rounded-md ${thumbBg} hover:opacity-90 ${MOTION_BTN}`}
                      >
                        {isAvatarImageUrl(img.preview || img.url) ? (
                          img.kind === 'video' ? (
                            <video src={img.url} className="h-full w-full object-cover" muted />
                          ) : (
                            <img src={img.preview || img.url} alt="" className="h-full w-full object-cover" />
                          )
                        ) : (
                          <span className="flex h-full items-center justify-center text-muted-foreground">
                            {img.kind === 'video' ? (
                              <Video className="h-5 w-5" aria-hidden />
                            ) : (
                              <ImageIcon className="h-5 w-5" aria-hidden />
                            )}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onViewAllMedia}
                    className={`mt-3 w-full rounded-lg bg-muted py-2.5 text-center text-sm font-medium text-foreground hover:bg-muted/80 ${MOTION_BTN}`}
                  >
                    {t('friendChat.viewAllMedia')}
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <section className={hairlineT}>
          <button
            type="button"
            onClick={() => setOpenFiles((o) => !o)}
            className={sectionBtn}
            aria-expanded={openFiles}
          >
            {t('chat.rightPanel.filesSection')}
            {openFiles ? (
              <ChevronDown className={`h-4 w-4 ${labelMuted}`} aria-hidden />
            ) : (
              <ChevronRight className={`h-4 w-4 ${labelMuted}`} aria-hidden />
            )}
          </button>
          {openFiles && (
            <div className="pb-3">
              {files.length === 0 ? (
                <p className={`px-4 py-2 text-xs ${labelMuted}`}>{t('friendChat.filesEmpty')}</p>
              ) : hotFiles.length === 0 ? (
                <p className={`px-4 py-2 text-xs ${labelMuted}`}>
                  {t('friendChat.filesHotEmpty', { days: hotDisplayDays })}
                </p>
              ) : (
                hotFiles.map((f) => renderFileRow(f))
              )}
              {(archivedFilesCount > 0 || files.length > 0) && (
                <button
                  type="button"
                  onClick={openDocumentsKho}
                  className={`mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center justify-center gap-1.5 rounded-lg bg-muted py-2 text-xs font-semibold text-foreground hover:bg-muted/80 ${MOTION_BTN}`}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {archivedFilesCount > 0
                    ? t('friendChat.filesSearchArchive', { count: archivedFilesCount })
                    : t('friendChat.filesOpenKho')}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <ChatAttachmentContextMenu
        open={Boolean(ctxMenu)}
        x={ctxMenu?.x}
        y={ctxMenu?.y}
        items={ctxMenu?.items || []}
        onClose={closeMenu}
      />

      <Modal
        isOpen={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        title={t('friendChat.remindersList')}
        size="md"
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setRemindersOpen(false);
              onOpenCalendarForFriend?.({ prefillType: 'reminder' });
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 ${MOTION_BTN}`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('friendChat.remindersAdd')}
          </button>
          {remindersLoading ? (
            <div className={`flex justify-center py-8 ${labelMuted}`}>
              <Loader2 className="h-6 w-6 motion-safe:animate-spin motion-reduce:animate-none" />
            </div>
          ) : peerReminders.length === 0 ? (
            <p className={`py-6 text-center text-sm ${labelMuted}`}>{t('friendChat.remindersEmpty')}</p>
          ) : (
            <ul className="max-h-[min(50vh,360px)] space-y-2 overflow-y-auto">
              {peerReminders.map((ev) => (
                <li key={`${ev.source || 'local'}-${ev.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setRemindersOpen(false);
                      onOpenCalendarForFriend?.({ highlightEventId: ev.id });
                    }}
                    className={`flex w-full flex-col rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-muted ${MOTION_BTN}`}
                  >
                    <span className={`text-sm font-semibold ${titleMain}`}>{ev.title}</span>
                    <span className={`mt-0.5 text-xs ${labelMuted}`}>
                      {formatDmEventWhen(ev, locale)}
                      {ev.type === 'meeting' && ev.source === 'api' ? ' · Meeting' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={mutualOpen}
        onClose={() => setMutualOpen(false)}
        title={t('friendChat.mutualGroups', { count: mutualOrgs.count })}
        size="md"
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            disabled={mutualOrgs.loading}
            onClick={() => loadMutualOrgs(true)}
            className={`rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80 disabled:opacity-50 ${MOTION_BTN}`}
          >
            {t('friendChat.mutualOrgsRefresh')}
          </button>
        </div>
        {mutualOrgs.loading ? (
          <div className={`flex justify-center py-10 ${labelMuted}`}>
            <Loader2 className="h-6 w-6 motion-safe:animate-spin motion-reduce:animate-none" />
          </div>
        ) : mutualOrgs.organizations.length === 0 ? (
          <p className={`py-8 text-center text-sm ${labelMuted}`}>{t('friendChat.mutualGroupsEmpty')}</p>
        ) : (
          <ul className="max-h-[min(50vh,400px)] space-y-2 overflow-y-auto">
            {mutualOrgs.organizations.map((org) => (
              <li key={String(org._id)}>
                <button
                  type="button"
                  onClick={() => {
                    setMutualOpen(false);
                    onOpenMutualOrganization?.(org);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left hover:bg-muted ${MOTION_BTN}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                    {(org.name || 'O').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-semibold ${titleMain}`}>{org.name}</div>
                    {org.myRole && (
                      <div className={`truncate text-xs ${labelMuted}`}>
                        {t('friendChat.mutualGroupsOpen')} · {org.myRole}
                      </div>
                    )}
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 ${labelMuted}`} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </aside>
  );
}
