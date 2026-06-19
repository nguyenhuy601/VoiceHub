import { Building2, ChevronRight, Plus, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_DASH_ACTION_BTN,
  FIGMA_DASH_ACTION_BTN_DASHED,
  FIGMA_DASH_ACTION_BTN_PRIMARY,
  FIGMA_DASH_LINK_BTN,
  FIGMA_DASH_PANEL,
  FIGMA_DASH_PANEL_HEADER,
  FIGMA_DASH_PANEL_TITLE,
  FIGMA_DASH_WS_AVATAR,
  FIGMA_DASH_WS_ROW,
} from './figmaDashboardClasses';

export default function DashboardWorkspacesPanel({
  workspaces,
  addFriendLabel,
  onViewAll,
  onWorkspaceClick,
  onCreateWorkspace,
  onAddFriend,
}) {
  const { t } = useAppStrings();

  return (
    <div className={FIGMA_DASH_PANEL}>
      <div className={FIGMA_DASH_PANEL_HEADER}>
        <div className={FIGMA_DASH_PANEL_TITLE}>
          <Building2 size={15} className="text-success" />
          {t('dashboard.workspacesTitle')}
        </div>
        <button type="button" className={FIGMA_DASH_LINK_BTN} onClick={onViewAll}>
          {t('dashboard.viewAllShort')} <ChevronRight size={12} />
        </button>
      </div>
      <div className="flex flex-col gap-[7px]">
        {workspaces.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
            {t('dashboard.emptyWorkspaces')}
          </p>
        ) : (
          workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => onWorkspaceClick?.(ws)}
              className={FIGMA_DASH_WS_ROW}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${ws.color}40`;
                e.currentTarget.style.background = `${ws.color}06`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.background = 'var(--background)';
              }}
            >
              <div
                className={FIGMA_DASH_WS_AVATAR}
                style={{
                  background: `linear-gradient(135deg, ${ws.color} 0%, ${ws.color}CC 100%)`,
                  boxShadow: `0 2px 6px ${ws.color}25`,
                }}
              >
                {ws.initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] font-semibold text-foreground">{ws.name}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[0.6875rem] text-muted-foreground">{ws.desc}</span>
                  <span className="flex items-center gap-0.5 text-[0.6875rem] text-muted-foreground">
                    <Users size={9} />
                    {ws.members}
                  </span>
                </div>
              </div>
              {ws.unread > 0 ? (
                <span className="shrink-0 rounded-full bg-primary px-[7px] py-0.5 text-[0.625rem] font-bold text-white">
                  {ws.unread}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onCreateWorkspace}
        className={`${FIGMA_DASH_ACTION_BTN} ${FIGMA_DASH_ACTION_BTN_DASHED}`}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#2563EB';
          e.currentTarget.style.color = '#2563EB';
          e.currentTarget.style.background = 'rgba(37,99,235,0.04)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.color = 'var(--muted-foreground)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Plus size={13} />
        {t('dashboard.createWorkspaceBtn')}
      </button>
      <button
        type="button"
        onClick={onAddFriend}
        className={`${FIGMA_DASH_ACTION_BTN} ${FIGMA_DASH_ACTION_BTN_PRIMARY}`}
      >
        <Users size={13} />
        {addFriendLabel}
      </button>
    </div>
  );
}
