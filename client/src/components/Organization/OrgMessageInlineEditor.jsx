import { useEffect, useRef, useState } from 'react';
import { Loader2, Smile } from 'lucide-react';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { CHAT_MESSAGE_MAX_LENGTH } from '../../utils/chatComposerLimits';
import { shellNavRailBackdrop } from '../../theme/shellTheme';
import { useAppStrings } from '../../locales/appStrings';

const LINK_CLASS =
  'font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60';
const ICON_BTN_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40 motion-reduce:transition-none';

/**
 * Chỉnh sửa tin nhắn trực tiếp trên dòng (Discord-like).
 */
export default function OrgMessageInlineEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving = false,
  escapeHint,
  enterHint,
  cancelLabel,
  saveLabel,
}) {
  const { t } = useAppStrings();
  const inputRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const escapeHintText = escapeHint || t('friendChat.editEscape');
  const enterHintText = enterHint || t('friendChat.editEnter');
  const cancelText = cancelLabel || t('friendChat.editCancel');
  const saveText = saveLabel || t('friendChat.editSave');

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = String(value || '').length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="w-full min-w-0 space-y-1">
      <div className="relative flex items-end gap-1 rounded-lg border border-border bg-muted px-2 py-1 transition-colors focus-within:border-primary/40">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!saving) onSave?.();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              if (emojiOpen) {
                setEmojiOpen(false);
                return;
              }
              onCancel?.();
            }
          }}
          rows={1}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          disabled={saving}
          className="max-h-40 min-h-[34px] flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          aria-label={t('friendChat.editMessageAria')}
        />
        <div className="relative shrink-0 self-end pb-1">
          <button
            type="button"
            title={t('friendChat.emojiTab')}
            aria-label={t('friendChat.emojiTab')}
            aria-expanded={emojiOpen}
            disabled={saving}
            onClick={() => setEmojiOpen((v) => !v)}
            className={ICON_BTN_CLASS}
          >
            <Smile className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          {emojiOpen && (
            <>
              <button
                type="button"
                aria-label={t('friendChat.closeEmoji')}
                className={`${shellNavRailBackdrop} z-[60] cursor-default bg-transparent`}
                onClick={() => setEmojiOpen(false)}
              />
              <div
                role="group"
                aria-label={t('friendChat.emojiTab')}
                className="absolute bottom-full right-0 z-[70] mb-1 grid max-h-36 w-52 grid-cols-8 gap-0.5 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-lg motion-safe:animate-fade-in-fast"
              >
                {COMPOSER_EMOJI_LIST.slice(0, 48).map((em) => (
                  <button
                    key={em}
                    type="button"
                    aria-label={em}
                    className="flex h-8 items-center justify-center rounded text-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => {
                      onChange(`${value || ''}${em}`);
                      setEmojiOpen(false);
                      inputRef.current?.focus();
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {escapeHintText}{' '}
        <button type="button" className={LINK_CLASS} onClick={onCancel} disabled={saving}>
          {cancelText}
        </button>
        <span className="mx-1 opacity-60" aria-hidden>
          ·
        </span>
        {enterHintText}{' '}
        <button
          type="button"
          className={`${LINK_CLASS} inline-flex items-center gap-1`}
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : null}
          {saveText}
        </button>
      </p>
    </div>
  );
}
