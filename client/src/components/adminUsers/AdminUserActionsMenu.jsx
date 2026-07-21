import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { memberUserId } from '../../utils/adminUserUtils';

const MENU_WIDTH = 220;
const GAP = 4;
const SAFE_TOP = 8;
const SAFE_BOTTOM = 8;
const MENU_HEIGHT_ESTIMATE = 400;

/**
 * Chỉ dùng top + maxHeight (không dùng bottom) để overflow-y scroll luôn hoạt động.
 * Giữa màn hình: chọn phía nhiều chỗ hơn; luôn kẹp trong viewport.
 */
function computeMenuPos(btnRect, menuH, menuW = MENU_WIDTH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const natural = Math.max(menuH || MENU_HEIGHT_ESTIMATE, 120);

  let left = btnRect.right - menuW;
  left = Math.max(SAFE_TOP, Math.min(left, vw - menuW - SAFE_TOP));

  const spaceBelow = Math.max(0, vh - SAFE_BOTTOM - (btnRect.bottom + GAP));
  const spaceAbove = Math.max(0, btnRect.top - GAP - SAFE_TOP);

  // Đủ chỗ dưới → dưới; không đủ dưới nhưng đủ trên → trên; không đủ cả hai → phía rộng hơn
  let placeAbove = false;
  if (spaceBelow >= natural) placeAbove = false;
  else if (spaceAbove >= natural) placeAbove = true;
  else placeAbove = spaceAbove > spaceBelow;

  const available = placeAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(120, Math.min(natural, available));

  let top;
  if (placeAbove) {
    top = btnRect.top - GAP - maxHeight;
  } else {
    top = btnRect.bottom + GAP;
  }

  // Kẹp chặt trong viewport — tránh phần trên/dưới bị cắt ngoài hộp (mất scroll)
  top = Math.min(top, vh - SAFE_BOTTOM - maxHeight);
  top = Math.max(SAFE_TOP, top);

  return {
    top,
    left,
    maxHeight,
    placement: placeAbove ? 'above' : 'below',
  };
}

/**
 * Menu "..." gom thao tác admin theo nhóm.
 */
export default function AdminUserActionsMenu({ member, onViewDetail, onRequestDelete }) {
  const { t } = useAppStrings();
  const userId = memberUserId(member);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 320 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const placeMenu = () => {
    if (!btnRef.current || !menuRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;

    // Đo chiều cao nội dung thật (tạm bỏ giới hạn)
    const prevMax = menuEl.style.maxHeight;
    menuEl.style.maxHeight = 'none';
    const naturalH = Math.max(menuEl.scrollHeight, MENU_HEIGHT_ESTIMATE);
    menuEl.style.maxHeight = prevMax;

    setPos(computeMenuPos(rect, naturalH, menuEl.offsetWidth || MENU_WIDTH));
    setReady(true);
  };

  useLayoutEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    placeMenu();
    const onReposition = () => placeMenu();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!btnRef.current) return;
    if (open) {
      setOpen(false);
      setReady(false);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    setPos(computeMenuPos(rect, MENU_HEIGHT_ESTIMATE));
    setReady(false);
    setOpen(true);
  };

  const q = `?userId=${encodeURIComponent(userId)}`;

  const ItemLink = ({ to, children, danger }) => (
    <Link
      to={to}
      className={`block px-3 py-2 text-sm transition hover:bg-muted/60 ${
        danger ? 'font-medium text-red-600 dark:text-red-400' : 'text-foreground'
      }`}
      onClick={() => setOpen(false)}
    >
      {children}
    </Link>
  );

  const ItemButton = ({ onClick, children, danger }) => (
    <button
      type="button"
      className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-muted/60 ${
        danger ? 'font-medium text-red-600 dark:text-red-400' : 'text-foreground'
      }`}
      onClick={() => {
        setOpen(false);
        onClick?.();
      }}
    >
      {children}
    </button>
  );

  const Group = ({ label, children }) => (
    <div className="border-t border-border/70 py-1 first:border-t-0">
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={t('adminUsers.moreActions')}
        aria-label={t('adminUsers.moreActions')}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/50 hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[10040] w-[220px] overscroll-contain rounded-xl border border-border bg-card py-1 shadow-xl"
              style={{
                top: pos.top,
                left: pos.left,
                maxHeight: pos.maxHeight,
                overflowY: 'auto',
                visibility: ready ? 'visible' : 'hidden',
                pointerEvents: ready ? 'auto' : 'none',
              }}
            >
              <Group label={t('adminUsers.menuGroupInfo')}>
                <ItemButton onClick={() => onViewDetail?.(member)}>{t('adminUsers.viewDetail')}</ItemButton>
                <ItemLink to={`/app/admin/users/edit${q}`}>{t('adminUsers.editInfo')}</ItemLink>
              </Group>
              <Group label={t('adminUsers.menuGroupAccount')}>
                <ItemLink to={`/app/admin/accounts/detail${q}`}>{t('adminDomains.accounts.detail')}</ItemLink>
                <ItemLink to={`/app/admin/accounts/lock${q}`}>{t('adminDomains.accounts.lock')}</ItemLink>
                <ItemLink to={`/app/admin/accounts/reset-password${q}`}>
                  {t('adminDomains.accounts.resetPassword')}
                </ItemLink>
                <ItemLink to={`/app/admin/accounts/force-password${q}`}>
                  {t('adminDomains.accounts.forcePassword')}
                </ItemLink>
              </Group>
              <Group label={t('adminUsers.menuGroupAccess')}>
                <ItemLink to={`/app/admin/rbac/assign${q}`}>{t('adminUsers.assignRole')}</ItemLink>
                <ItemLink to={`/app/admin/users/assign-org${q}`}>
                  {t('adminDomains.users.assignOrg')}
                </ItemLink>
              </Group>
              <Group label={t('adminUsers.menuGroupSecurity')}>
                <ItemLink to={`/app/admin/accounts/login-history${q}`}>
                  {t('adminDomains.accounts.loginHistory')}
                </ItemLink>
              </Group>
              <Group label={t('adminUsers.menuGroupDanger')}>
                <ItemButton danger onClick={() => onRequestDelete?.(member)}>
                  {t('adminDomains.users.delete')}
                </ItemButton>
              </Group>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
