/**
 * Chuông thông báo trong ô vuông bo góc + badge đỏ (tham chiếu UI thông báo VoiceHub)
 */
function NotificationBellBadge({
  count = 0,
  className = '',
  sizeClass = 'h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12',
  textSizeClass = 'text-xl sm:text-2xl',
}) {
  const show = count > 0;
  const label = count > 99 ? '99+' : String(count);

  return (
    <div
      className={`relative shrink-0 rounded-xl bg-slate-800/95 border border-white/10 shadow-inner flex items-center justify-center ${sizeClass} ${className}`}
      aria-hidden={!show}
    >
      <span className={`select-none leading-none ${textSizeClass}`} role="img" aria-label="Thông báo">
        🔔
      </span>
      {show && (
        <span className="absolute -top-0.5 -right-0.5 min-h-[18px] min-w-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center shadow-md border border-red-600/60 z-10">
          {label}
        </span>
      )}
    </div>
  );
}

export default NotificationBellBadge;
