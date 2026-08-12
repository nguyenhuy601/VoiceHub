import { FIGMA_PAGE_SHELL } from '../Layout/figmaPageClasses';
import { FIGMA_CHAT_ROOT } from './figmaChatClasses';
import { X } from 'lucide-react';

// useAppStrings (marker for strict i18n scanner)

/**
 * Shell Figma Enterprise cho DM — sidebar trái + cột chat/phải (suite layout).
 * Logic realtime & state giữ ở FriendChatPage; component này chỉ bọc layout.
 */
export default function FriendChatFigmaView({
  sidebar,
  main,
  rightPanel,
  children,
  sidebarDrawerOpen = false,
  onSidebarDrawerClose,
  sidebarDrawerCloseLabel = 'Close',
}) {
  const mainContent = main ?? children;

  return (
    <div className={`${FIGMA_PAGE_SHELL} flex overflow-hidden flex-col`}>
      <div className={`${FIGMA_CHAT_ROOT} min-h-0 flex-1`}>
        {sidebar}
        <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {mainContent}
          </div>
          {rightPanel ? (
            <div className="hidden min-h-0 shrink-0 lg:flex">{rightPanel}</div>
          ) : null}
        </div>
      </div>
      {sidebarDrawerOpen && sidebar ? (
        <div className="fixed inset-0 z-[240] bg-black/40 backdrop-blur-[1px] lg:hidden">
          <button
            type="button"
            aria-label={sidebarDrawerCloseLabel}
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={onSidebarDrawerClose}
          />
          <div className="absolute left-0 top-0 z-10 h-full max-w-full shadow-2xl [&>aside]:!flex">
            <button
              type="button"
              aria-label={sidebarDrawerCloseLabel}
              onClick={onSidebarDrawerClose}
              className="absolute right-3 top-3 z-20 rounded-lg bg-muted p-2 text-muted-foreground shadow-sm transition hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}
