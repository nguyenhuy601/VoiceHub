/**
 * Accordion / submenu open-close — CSS grid-rows (không đo height JS).
 * Dùng cho menu suite sidebar (Projects parents, Admin sections, …).
 */
export default function NavCollapse({ open, children, className = '', id }) {
  return (
    <div
      id={id}
      className={`vh-nav-collapse vh-motion-respect ${className}`.trim()}
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
    >
      <div className="vh-nav-collapse-inner">
        <div className="vh-nav-collapse-content">{children}</div>
      </div>
    </div>
  );
}
