import NavigationSidebar from './NavigationSidebar';

/**
 * Bố cục chuẩn 3 khung (dùng làm layout chính):
 * - Khung 1 (trái): Sidebar nav chỉ icon, cùng chiều cao với viewport.
 * - Khung 2 (giữa): Nội dung chính (Trung tâm điều khiển, v.v.), thanh trượt riêng khi nội dung dài.
 * - Khung 3 (phải, tùy chọn): Panel phụ (Trạng thái nhóm, sự kiện, v.v.), thanh trượt riêng.
 * Cả 3 khung cùng độ dài (h-screen), thanh cuộn chỉ hiện khi cần (scrollbar-overlay).
 */
const ThreeFrameLayout = ({
  left = <NavigationSidebar />,
  center,
  right = null,
  rightWidth = 'w-80',
}) => {
  return (
    <div className="h-screen flex overflow-hidden">
      {/* Khung 1: Sidebar (icon only) */}
      <div className="shrink-0 h-full">{left}</div>

      {/* Khung 2: Nội dung chính - cuộn riêng */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible scrollbar-overlay">
          {center}
        </div>
      </div>

      {/* Khung 3 (tùy chọn): Panel phải - cuộn riêng */}
      {right !== null && (
        <div className={`shrink-0 h-full flex flex-col overflow-hidden glass-strong border-l border-white/10 ${rightWidth}`}>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible scrollbar-overlay">
            {right}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreeFrameLayout;
