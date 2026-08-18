/**
 * Ô header grid — handle kéo mép phải khi cột resizable.
 */
export default function ResizableTableHeader({
  column,
  onResizeStart,
  children,
  className = '',
}) {
  const resizable = column?.resizable !== false;
  return (
    <div className={`relative flex min-w-0 items-center border-r border-border ${className}`}>
      <div className="min-w-0 flex-1 truncate pr-1">{children}</div>
      {resizable ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={column?.resizeAria || 'Resize column'}
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize rounded-sm hover:bg-primary/40"
          onPointerDown={(e) => onResizeStart?.(column.id, e)}
        />
      ) : null}
    </div>
  );
}
