import { useState } from 'react';
import { createPortal } from 'react-dom';

const DepartmentBubbleRail = ({
  organizations = [],
  selectedOrganizationId,
  viewMode = 'home',
  onSelectOrganization,
  onOpenWorkspace,
  onOpenHome,
  onEditOrganization,
  onInviteOrganization,
  onLeaveOrganization,
  onCreateOrganization,
  invitationCount = 0,
  /** Sau lần tải danh sách tổ chức đầu tiên (để không hiện nhầm “chưa tham gia” trước khi API trả). */
  organizationsLoaded = false,
}) => {
  const orderedOrganizations = [...organizations].reverse();

  const [tooltip, setTooltip] = useState({
    show: false,
    name: '',
    onlineCount: 0,
    x: 0,
    y: 0,
  });
  const [dropdown, setDropdown] = useState({
    show: false,
    orgId: null,
    x: 0,
    y: 0,
  });

  const handleEnter = (event, organization) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      show: true,
      name: organization.name || 'To chuc',
      onlineCount: organization.onlineMembers || organization.onlineCount || 0,
      x: rect.left - 14,
      y: rect.top + rect.height / 2,
    });
  };

  const handleLeave = () => {
    setTooltip((prev) => ({ ...prev, show: false }));
  };

  const handleAvatarClick = (_event, organization) => {
    onSelectOrganization?.(organization._id);
    onOpenWorkspace?.(organization._id);
  };

  const handleAvatarContextMenu = (event, organization) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDropdown({
      show: true,
      orgId: organization._id,
      x: rect.left - 12,
      y: rect.bottom + 8,
    });
  };

  const tooltipPortal =
    tooltip.show &&
    createPortal(
      <div
        className="fixed z-[9999] rounded-lg border border-white/10 bg-gray-700 px-3 py-2 text-sm text-white shadow-xl pointer-events-none"
        style={{
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-100%, -50%)',
        }}
      >
        <div className="font-semibold">{tooltip.name}</div>
        <div className="mt-0.5 text-xs text-cyan-200">Online: {tooltip.onlineCount}</div>
        <span
          className="absolute left-full top-1/2 h-0 w-0 -translate-y-1/2 border-[6px] border-solid border-transparent border-l-gray-700"
          aria-hidden
        />
      </div>,
      document.body
    );

  const dropdownOrg =
    dropdown.show && dropdown.orgId
      ? organizations.find((o) => String(o._id) === String(dropdown.orgId))
      : null;
  const isOrgOwner = String(dropdownOrg?.myRole || '').toLowerCase() === 'owner';

  const dropdownPortal =
    dropdown.show &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[9997]"
          onClick={() => setDropdown((prev) => ({ ...prev, show: false }))}
        />
        <div
          className="fixed z-[9998] w-48 rounded-xl border border-white/10 bg-gray-900/95 p-2 shadow-2xl"
          style={{
            left: dropdown.x,
            top: dropdown.y,
            transform: 'translateX(-100%)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              onEditOrganization?.(dropdown.orgId);
              setDropdown((prev) => ({ ...prev, show: false }));
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
          >
            Cài đặt tổ chức
          </button>
          <button
            type="button"
            onClick={() => {
              onInviteOrganization?.(dropdown.orgId);
              setDropdown((prev) => ({ ...prev, show: false }));
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
          >
            Mời tham gia tổ chức
          </button>
          {!isOrgOwner && (
            <button
              type="button"
              onClick={() => {
                const id = dropdown.orgId;
                setDropdown((prev) => ({ ...prev, show: false }));
                onLeaveOrganization?.(id);
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/15"
            >
              Thoát tổ chức
            </button>
          )}
        </div>
      </>,
      document.body
    );

  return (
    <div className="h-full w-24 border-l border-white/10 bg-black/10 px-3 py-4">
      <div className="mb-4 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Tổ chức
        {invitationCount > 0 && (
          <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {invitationCount}
          </span>
        )}
      </div>

      <div className="scrollbar-overlay flex h-[calc(100%-1.75rem)] flex-col items-center gap-3 overflow-y-auto">
        <button
          type="button"
          onClick={onOpenHome}
          title="Trang chủ tổ chức"
          className={`group relative flex h-11 w-11 items-center justify-center rounded-full border transition ${
            viewMode === 'home'
              ? 'border-cyan-400/80 bg-cyan-500/20 shadow-[0_0_16px_rgba(34,211,238,0.28)]'
              : 'border-white/20 bg-white/5 text-white hover:border-white/35 hover:bg-white/10'
          }`}
        >
          <span className="text-lg leading-none">⌂</span>
        </button>

        <button
          type="button"
          onClick={onCreateOrganization}
          title="Tạo tổ chức"
          className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition hover:border-white/35 hover:bg-white/10"
        >
          <span className="text-2xl leading-none">+</span>
        </button>

        {organizationsLoaded && organizations.length === 0 && (
          <div className="px-1 text-center text-[11px] leading-snug text-gray-500">
            Chưa tham gia tổ chức nào
          </div>
        )}

        {orderedOrganizations.map((organization) => {
          const isActive = organization._id === selectedOrganizationId;
          return (
            <button
              key={organization._id}
              type="button"
              title={organization.name}
              onMouseEnter={(event) => handleEnter(event, organization)}
              onMouseLeave={handleLeave}
              onClick={(event) => handleAvatarClick(event, organization)}
              onContextMenu={(event) => handleAvatarContextMenu(event, organization)}
              className={`group relative flex h-11 w-11 items-center justify-center rounded-full border transition ${
                isActive && viewMode === 'workspace'
                  ? 'border-cyan-400/80 bg-cyan-500/20 shadow-[0_0_16px_rgba(34,211,238,0.28)]'
                  : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10'
              }`}
            >
              <span className="text-sm font-bold text-white uppercase">
                {(organization.name || 'O').charAt(0)}
              </span>
            </button>
          );
        })}
      </div>
      {tooltipPortal}
      {dropdownPortal}
    </div>
  );
};

export default DepartmentBubbleRail;
