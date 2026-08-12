import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/**
 * Menu ... trên hàng issue — hiện chỉ Delete.
 */
export default function ProjectHubIssueMoreMenu({
  canDelete = false,
  disabled = false,
  onDelete,
  t,
  isDarkMode = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!canDelete) return null;

  const menuCls = isDarkMode
    ? 'border-border bg-background text-foreground shadow-xl'
    : 'border-border bg-surface text-foreground shadow-xl';

  return (
    <div ref={rootRef} className={`relative shrink-0 ${open ? 'z-20' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('workspace.projectHubBacklogMoreAria')}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute right-0 z-30 mt-1 min-w-[140px] rounded-lg border py-1 ${menuCls}`}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-2 text-left text-sm font-semibold text-destructive hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete?.();
            }}
          >
            {t('workspace.projectHubBacklogDeleteIssue')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
