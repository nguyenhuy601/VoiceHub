/**
 * Bọc vùng chat org + scroll container danh sách tin.
 */
export default function OrganizationChatView({
  children,
  scrollRef,
  onScroll,
  className = '',
}) {
  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-chat min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
      >
        {children}
      </div>
    </div>
  );
}
