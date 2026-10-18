import { VH_MOTION_BTN, VH_MOTION_ROW } from '../../motion/classes';

/**
 * Khung bảng/list admin dày — scroll trong card (sticky thead bên trong children).
 */
export function AdminDenseTableCard({ children, className = '' }) {
  return (
    <div
      className={`flex max-h-[calc(100dvh-12rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/** Vùng cuộn dọc (+ ngang nếu bảng rộng) trong AdminDenseTableCard. */
export function AdminDenseTableScroll({ children, className = '', ...rest }) {
  return (
    <div {...rest} className={`min-h-0 flex-1 overflow-auto ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Danh sách thẻ thay bảng dày trên màn hẹp (< md). Bảng desktop bọc `hidden md:block`.
 */
export function AdminDenseMobileList({
  items = [],
  getKey,
  renderTitle,
  renderMeta,
  renderActions,
  onSelect,
  selectedKey,
  ariaLabel,
}) {
  return (
    <ul className="space-y-2 p-3 md:hidden" aria-label={ariaLabel}>
      {items.map((item) => {
        const key = getKey(item);
        const isSelected = selectedKey != null && String(selectedKey) === String(key);
        const body = (
          <>
            <div className="min-w-0 truncate text-sm font-medium text-foreground">{renderTitle(item)}</div>
            {renderMeta ? (
              <div className="mt-1 text-xs text-muted-foreground">{renderMeta(item)}</div>
            ) : null}
          </>
        );
        return (
          <li
            key={key}
            className={`rounded-lg border bg-card p-3 ${VH_MOTION_ROW} ${
              isSelected ? 'border-primary' : 'border-border'
            }`}
          >
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-pressed={selectedKey !== undefined ? isSelected : undefined}
                className="block w-full min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </button>
            ) : (
              body
            )}
            {renderActions ? <div className="mt-2 flex flex-wrap gap-2">{renderActions(item)}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Shell + form card dùng chung cho các màn admin Users (enterprise).
 */
export function AdminUserPanelShell({ title, hint, actions, children, wide = false, fillHeight = false }) {
  return (
    <div
      className={`mx-auto flex w-full flex-col ${fillHeight ? 'min-h-0 flex-1' : ''} ${
        wide ? 'max-w-[1400px]' : 'max-w-5xl'
      } ${fillHeight ? 'gap-4' : 'space-y-5'}`}
    >
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className={fillHeight ? 'min-h-0 flex-1' : undefined}>{children}</div>
    </div>
  );
}

/** Màu lấy từ token theo theme; caller cũ vẫn truyền `isDarkMode` (bỏ qua). */
export function AdminUserFormCard({ title, hint, children, danger = false }) {
  return (
    <div
      className={`rounded-xl border bg-card p-5 shadow-sm ${danger ? 'border-destructive' : 'border-border'}`}
    >
      {title ? <h3 className="text-base font-semibold text-foreground">{title}</h3> : null}
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className={title || hint ? 'mt-4' : ''}>{children}</div>
    </div>
  );
}

const ADMIN_BTN_BASE = `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${VH_MOTION_BTN}`;

export function adminPrimaryBtnClass(extra = '') {
  return `${ADMIN_BTN_BASE} bg-primary font-semibold text-primary-foreground shadow-sm hover:brightness-110 ${extra}`;
}

/** Tham số thứ hai (`isDarkMode`) giữ cho caller cũ, không còn dùng. */
export function adminSecondaryBtnClass(extra = '') {
  return `${ADMIN_BTN_BASE} border border-border bg-card font-medium text-foreground shadow-sm hover:bg-muted ${extra}`;
}

export function adminDangerBtnClass(extra = '') {
  return `${ADMIN_BTN_BASE} border border-destructive bg-card font-semibold text-destructive hover:bg-muted ${extra}`;
}

export function adminInputClass(extra = '') {
  return `w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors duration-[var(--vh-motion-base)] ease-[var(--vh-motion-ease)] motion-reduce:transition-none focus:ring-2 focus:ring-ring focus-visible:ring-2 focus-visible:ring-ring ${extra}`;
}

/** List/table row — hover bg via Enterprise Motion SoT. */
export function adminHoverRowClass(extra = '') {
  return `hover:bg-muted ${VH_MOTION_ROW} ${extra}`.trim();
}

/** Filter select / compact toolbar control. */
export function adminFilterSelectClass(extra = '') {
  return `w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors duration-[var(--vh-motion-base)] ease-[var(--vh-motion-ease)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${extra}`.trim();
}

/** Pager / icon toolbar button. */
export function adminListIconBtnClass(extra = '') {
  return `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${VH_MOTION_BTN} ${extra}`.trim();
}

/** xs bordered action (matrix, boards, voice admin). */
export function adminCompactBtnClass(extra = '') {
  return `rounded border border-border px-2 py-0.5 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${VH_MOTION_BTN} ${extra}`.trim();
}

export function adminLabelClass() {
  return 'mb-1.5 block text-xs font-medium text-muted-foreground';
}

/** Wave 1 PD — primary Manage deep-link (micro-motion + reduced-motion). */
export function adminManageLinkClass(extra = '') {
  return `inline-flex items-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${VH_MOTION_BTN} ${extra}`.trim();
}

/** Dense table row hover — Enterprise Motion SoT. */
export function adminDenseRowClass(extra = '') {
  return `border-b border-border ${VH_MOTION_ROW} ${extra}`.trim();
}
