import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Forward,
  MessageCircle,
  Trash2,
  X,
} from 'lucide-react';
import { downloadToDisk, guessNameFromUrl, saveFileWithPicker } from './ChatFileAttachment';
import ChatAttachmentContextMenu from './ChatAttachmentContextMenu';
import { useAppStrings } from '../../locales/appStrings';
import { buildMediaAttachmentMenuItems } from '../../utils/buildAttachmentMenuItems';
import useModalA11y from '../Shared/useModalA11y';

const MOTION_BTN =
  'motion-safe:transition-colors motion-reduce:transition-none';

/**
 * Lightbox xem ảnh/video — toolbar gọn; chuột phải mở menu đầy đủ.
 */
export default function ChatMediaViewer({
  items = [],
  initialIndex = 0,
  onClose,
  messages = [],
  currentUserId,
  onAttachmentAction,
}) {
  const { t } = useAppStrings();
  const titleId = useId();
  const [index, setIndex] = useState(initialIndex);
  const [ctxMenu, setCtxMenu] = useState(null);
  const open = Boolean(items.length);

  useModalA11y({ isOpen: open, onClose });

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex, items]);

  const messageById = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const id = m?._id || m?.id;
      if (id != null) map.set(String(id), m);
    }
    return map;
  }, [messages]);

  const item = items[index];
  const url = item?.url;
  const isVideo = item?.kind === 'video';
  const msg = item?.id ? messageById.get(String(item.id)) : null;
  const canDelete =
    msg &&
    currentUserId &&
    String(msg.senderId?._id || msg.senderId || '') === String(currentUserId);

  const runAction = useCallback(
    (action, payload) => {
      onAttachmentAction?.(action, payload);
    },
    [onAttachmentAction]
  );

  const menuItems = useMemo(() => {
    if (!item) return [];
    return buildMediaAttachmentMenuItems({
      item,
      message: msg,
      canDelete,
      t,
      onAction: runAction,
    });
  }, [item, msg, canDelete, t, runAction]);

  const openContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const goPrev = useCallback(() => {
    setIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
  }, [items.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (items.length ? (i + 1) % items.length : 0));
  }, [items.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, goPrev, goNext]);

  if (!items.length || !url) return null;

  const fileName = guessNameFromUrl(url) || (isVideo ? 'video.mp4' : 'image.jpg');
  const toolBtn = `flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-[11px] text-primary-foreground/90 hover:bg-primary-foreground/10 disabled:opacity-40 ${MOTION_BTN}`;
  const payload = { messageId: item.id, url, message: msg, name: fileName };

  return (
    <>
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-background/95 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 text-foreground">
          <span id={titleId} className="text-sm text-muted-foreground">
            {t('chat.mediaViewer.title')} · {index + 1} / {items.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title={t('friendChat.downloadFile')}
              onClick={() => downloadToDisk(url, fileName)}
              className={`rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted ${MOTION_BTN}`}
            >
              <Download className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              {t('friendChat.downloadFile')}
            </button>
            <button
              type="button"
              title={t('friendChat.saveFile')}
              onClick={() => saveFileWithPicker(url, fileName)}
              className={`rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted ${MOTION_BTN}`}
            >
              {t('friendChat.saveFile')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg p-2 text-foreground hover:bg-muted ${MOTION_BTN}`}
              aria-label={t('chat.mediaViewer.close')}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40 px-14"
          onContextMenu={openContextMenu}
        >
          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className={`absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card p-2 text-foreground shadow-sm hover:bg-muted ${MOTION_BTN}`}
                aria-label={t('chat.mediaViewer.prev')}
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goNext}
                className={`absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card p-2 text-foreground shadow-sm hover:bg-muted ${MOTION_BTN}`}
                aria-label={t('chat.mediaViewer.next')}
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            </>
          )}
          {isVideo ? (
            <video src={url} controls className="max-h-[70vh] max-w-full rounded-lg" />
          ) : (
            <img
              src={url}
              alt={t('chat.mediaViewer.imageAlt', { name: fileName })}
              className="max-h-[70vh] max-w-full object-contain"
            />
          )}
        </div>

        <div
          className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-card px-4 py-3 text-foreground"
          aria-label={t('chat.mediaViewer.toolbar')}
        >
          {!isVideo && (
            <button type="button" className={toolBtn} onClick={() => runAction('copy', payload)}>
              <Copy className="h-5 w-5" aria-hidden />
              <span>{t('friendChat.mediaCopy')}</span>
            </button>
          )}
          <button type="button" className={toolBtn} onClick={() => runAction('share', payload)}>
            <Forward className="h-5 w-5" aria-hidden />
            <span>{t('friendChat.mediaShare')}</span>
          </button>
          <button
            type="button"
            className={toolBtn}
            onClick={() => runAction('saveDevice', payload)}
          >
            <Download className="h-5 w-5" aria-hidden />
            <span>{t('friendChat.mediaSaveDevice')}</span>
          </button>
          <button
            type="button"
            className={toolBtn}
            onClick={() => runAction('jumpToMessage', { messageId: item.id })}
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            <span>{t('friendChat.jumpToMessage')}</span>
          </button>
          {canDelete && (
            <button type="button" className={toolBtn} onClick={() => runAction('delete', payload)}>
              <Trash2 className="h-5 w-5" aria-hidden />
              <span>{t('friendChat.mediaDeleteForMe')}</span>
            </button>
          )}
        </div>
      </div>

      <ChatAttachmentContextMenu
        open={Boolean(ctxMenu)}
        x={ctxMenu?.x}
        y={ctxMenu?.y}
        items={menuItems}
        onClose={() => setCtxMenu(null)}
      />
    </>
  );
}
