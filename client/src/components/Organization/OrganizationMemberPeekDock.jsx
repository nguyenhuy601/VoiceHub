import { useState, useRef, useCallback, cloneElement, Children, isValidElement } from 'react';

/**
 * Panel thành viên tách khỏi sidebar tổ chức: mặc định thu (~40px) có nhãn "Danh sách thành viên",
 * hover mở rộng (w-80). Luôn nằm bên trái cột bubble tổ chức cố định.
 * Khi menu chuột phải (portal) đang mở, không thu panel theo mouseLeave để người dùng còn bấm được mục;
 * khi đóng menu mà chuột không còn trên panel thì thu lại. Khi panel thu, sidebar đóng menu.
 */
function OrganizationMemberPeekDock({ children }) {
  const [open, setOpen] = useState(false);
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const dockRef = useRef(null);

  const handleMemberMenuClosed = useCallback(() => {
    requestAnimationFrame(() => {
      if (dockRef.current && !dockRef.current.matches(':hover')) {
        setOpen(false);
      }
    });
  }, []);

  const child = Children.only(children);
  const injected =
    isValidElement(child) &&
    cloneElement(child, {
      memberDockOpen: open,
      onMemberMenuOpenChange: setMemberMenuOpen,
      onMemberMenuClosed: handleMemberMenuClosed,
    });

  return (
    <div
      ref={dockRef}
      className={`relative h-full shrink-0 overflow-hidden border-l border-white/[0.06] bg-[#0a0c12] transition-[width] duration-300 ease-out ${
        open ? 'w-96' : 'w-10'
      }`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!memberMenuOpen) setOpen(false);
      }}
      title={open ? undefined : 'Danh sách thành viên — đưa chuột vào để mở'}
    >
      <div className="flex h-full w-96 min-w-[384px] flex-row">
        <div className="flex w-10 shrink-0 flex-col items-center border-r border-white/10 bg-violet-950/30 px-1 py-3">
          <span
            className="select-none text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-gray-200 [writing-mode:vertical-rl] rotate-180"
            aria-hidden
          >
            Danh sách thành viên
          </span>
          <span className="mt-2 text-sm text-cyan-400/90" aria-hidden title="Mở rộng">
            ⟨
          </span>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{injected || children}</div>
      </div>
    </div>
  );
}

export default OrganizationMemberPeekDock;
