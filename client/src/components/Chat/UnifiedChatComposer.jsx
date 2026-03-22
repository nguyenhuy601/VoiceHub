import { useEffect, useMemo, useRef, useState } from 'react';

function UnifiedChatComposer({
  value = '',
  onChange,
  onSend,
  placeholder = 'Nhập tin nhắn...',
  disabled = false,
  sendDisabled = false,
  sendLabel = 'Gửi',
  plusItems = [],
  onOpenGift,
  onOpenGif,
  onOpenSticker,
  onOpenEmoji,
  onOpenApps,
  actionItems,
}) {
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusButtonRef = useRef(null);
  const plusMenuRef = useRef(null);

  const safePlusItems = useMemo(
    () => (Array.isArray(plusItems) ? plusItems.filter((item) => item && item.label) : []),
    [plusItems]
  );
  const resolvedActionItems = useMemo(() => {
    if (Array.isArray(actionItems)) {
      return actionItems.filter((item) => item && item.key);
    }
    return [
      { key: 'gift', title: 'Quà tặng', content: '🎁', onClick: onOpenGift, className: 'text-lg' },
      { key: 'gif', title: 'GIF', content: 'GIF', onClick: onOpenGif, className: 'px-1 text-[11px] font-bold min-w-8' },
      { key: 'sticker', title: 'Sticker', content: '😶‍🌫️', onClick: onOpenSticker, className: 'text-base' },
      { key: 'emoji', title: 'Emoji', content: '🙂', onClick: onOpenEmoji, className: 'text-lg' },
      { key: 'apps', title: 'Ứng dụng', content: '✳️', onClick: onOpenApps, className: 'text-base' },
    ];
  }, [actionItems, onOpenGift, onOpenGif, onOpenSticker, onOpenEmoji, onOpenApps]);

  useEffect(() => {
    if (!showPlusMenu) return undefined;

    const handleOutsideClick = (event) => {
      if (
        plusMenuRef.current &&
        !plusMenuRef.current.contains(event.target) &&
        plusButtonRef.current &&
        !plusButtonRef.current.contains(event.target)
      ) {
        setShowPlusMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showPlusMenu]);

  const handleSend = () => {
    if (disabled || sendDisabled) return;
    onSend?.();
  };

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-900/60 p-3.5">
      <div className="relative flex items-center gap-2 rounded-xl border border-slate-800 bg-[#040f2a] px-2 py-1.5">
        {safePlusItems.length > 0 && (
          <>
            <button
              ref={plusButtonRef}
              type="button"
              disabled={disabled}
              onClick={() => setShowPlusMenu((prev) => !prev)}
              className="h-9 w-9 rounded-lg text-2xl leading-none text-gray-200 transition hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-50"
              title="Thêm tiện ích"
            >
              +
            </button>

            {showPlusMenu && (
              <div
                ref={plusMenuRef}
                className="absolute bottom-[52px] left-0 z-30 w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
              >
                {safePlusItems.map((item) => (
                  <button
                    key={item.key || item.label}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onClick?.();
                      setShowPlusMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-base">{item.icon || '•'}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <input
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500 disabled:opacity-60"
        />

        <div className="flex items-center gap-1.5">
          {resolvedActionItems.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={disabled || item.disabled}
              onClick={item.onClick}
              className={`h-8 rounded-md text-gray-300 transition hover:bg-slate-800/70 hover:text-white disabled:opacity-50 ${
                item.className || 'w-8 text-base'
              }`}
              title={item.title || item.label || item.key}
            >
              {item.content}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || sendDisabled}
          className="ml-1 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendLabel}
        </button>
      </div>
    </div>
  );
}

export default UnifiedChatComposer;
