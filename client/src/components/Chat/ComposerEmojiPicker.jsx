import { useMemo, useState } from 'react';
import {
  CHAT_GIF_ITEMS,
  CHAT_STICKER_ITEMS,
  filterChatMediaItems,
} from '../../utils/chatGifStickerCatalog';
import { prefetchChatMediaFile } from '../../utils/chatGifStickerSend';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { shellNavRailBackdrop } from '../../theme/shellTheme';
import { useAppStrings } from '../../locales/appStrings';

function MediaGrid({ items, onPick, emptyLabel, cols = 4 }) {
  const colClass =
    cols === 5 ? 'grid-cols-5' : cols === 6 ? 'grid-cols-6' : 'grid-cols-4';

  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-foreground-secondary">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={`grid ${colClass} gap-2`}>
      {items.map((item) => {
        const thumb = item.previewUrl || item.url;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onPick?.(item)}
            onMouseEnter={() => prefetchChatMediaFile(item)}
            onFocus={() => prefetchChatMediaFile(item)}
            className="group flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-muted p-1.5 transition duration-150 hover:border-primary/40 hover:bg-primary/10"
          >
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              width={72}
              height={72}
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                if (thumb !== item.url && item.url) {
                  e.currentTarget.src = item.url;
                  return;
                }
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="mt-1 w-full truncate text-center text-xs text-foreground-secondary group-hover:text-foreground">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Panel chọn emoji / ảnh động / sticker cho composer chat.
 */
export default function ComposerEmojiPicker({
  open = false,
  onClose,
  onPick,
  onPickMedia,
  activeTab = 'emoji',
  onTabChange,
  search = '',
  onSearchChange,
  mediaLoading = false,
}) {
  const { t } = useAppStrings();
  const [localSendingId, setLocalSendingId] = useState('');

  const filteredEmojis = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return COMPOSER_EMOJI_LIST;
    return COMPOSER_EMOJI_LIST.filter((emoji) => emoji.includes(q));
  }, [search]);

  const filteredGifs = useMemo(
    () => filterChatMediaItems(CHAT_GIF_ITEMS, search),
    [search]
  );

  const filteredStickers = useMemo(
    () => filterChatMediaItems(CHAT_STICKER_ITEMS, search),
    [search]
  );

  if (!open) return null;

  const tabs = [
    { id: 'gif', label: t('orgPanel.gifTab'), activeClass: 'bg-info/20 text-info ring-1 ring-info/35' },
    {
      id: 'sticker',
      label: t('orgPanel.stickerTab'),
      activeClass: 'bg-warning/15 text-warning ring-1 ring-warning/35',
    },
    {
      id: 'emoji',
      label: t('orgPanel.emojiTab'),
      activeClass: 'bg-primary/15 text-primary ring-1 ring-primary/35',
    },
  ];

  const searchPlaceholder =
    activeTab === 'gif'
      ? t('orgPanel.gifSearchPh')
      : activeTab === 'sticker'
        ? t('orgPanel.stickerSearchPh')
        : t('orgPanel.emojiSearchPh');

  const handleMediaPick = async (item) => {
    if (!onPickMedia || mediaLoading || localSendingId) return;
    setLocalSendingId(item.id);
    try {
      await onPickMedia(item);
    } finally {
      setLocalSendingId('');
    }
  };

  const busy = Boolean(mediaLoading || localSendingId);

  return (
    <>
      <button
        type="button"
        aria-label={t('orgPanel.closeEmoji')}
        onClick={onClose}
        className={`${shellNavRailBackdrop} z-40 cursor-default bg-black/30`}
      />
      <div className="fixed bottom-24 right-4 z-50 h-[min(420px,calc(100vh-8rem))] w-[min(520px,calc(100vw-2rem))] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange?.(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition duration-150 ${
                activeTab === tab.id
                  ? tab.activeClass
                  : 'text-foreground-secondary hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="border-b border-border px-4 py-3">
          <input
            value={search}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full rounded-xl border border-border bg-input-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <div className="relative h-[calc(100%-126px)] overflow-y-auto p-3 scrollbar-overlay">
          {activeTab === 'gif' ? (
            <MediaGrid
              items={filteredGifs}
              onPick={handleMediaPick}
              emptyLabel={t('orgPanel.gifNoMatch')}
              cols={5}
            />
          ) : activeTab === 'sticker' ? (
            <MediaGrid
              items={filteredStickers}
              onPick={handleMediaPick}
              emptyLabel={t('orgPanel.stickerNoMatch')}
              cols={6}
            />
          ) : (
            <div className="grid grid-cols-9 gap-2">
              {filteredEmojis.map((emoji, idx) => (
                <button
                  key={`${emoji}-${idx}`}
                  type="button"
                  onClick={() => onPick?.(emoji)}
                  className="h-11 rounded-lg bg-muted text-2xl transition hover:bg-primary/15"
                >
                  {emoji}
                </button>
              ))}
              {filteredEmojis.length === 0 && (
                <div className="col-span-9 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('orgPanel.emojiNoMatch')}
                </div>
              )}
            </div>
          )}
          {busy && activeTab !== 'emoji' ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-border bg-surface/95 px-3 py-2 text-center text-xs font-medium text-foreground shadow-md">
              {t('orgPanel.mediaSending')}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
