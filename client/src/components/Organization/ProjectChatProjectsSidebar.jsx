import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Megaphone, Users } from 'lucide-react';
import {
  groupProjectChannelsByProject,
  projectChannelDisplayLabel,
  splitChatVoiceChannels,
} from '../../utils/orgChannelScope';
import { channelUnreadCount } from './organizationStructureTheme';
import { FIGMA_ORG_STRUCTURE_SCROLL } from './figmaOrganizationClasses';

function kindIcon(kind) {
  const k = String(kind || '');
  if (k === 'announcement') return Megaphone;
  if (k === 'cross_team' || k === 'team') return Users;
  return Hash;
}

/**
 * Cây CHAT · PROJECTS — tách khỏi OrganizationWorkspaceStructureSidebar.
 */
export default function ProjectChatProjectsSidebar({
  isDarkMode,
  t,
  projectChannels = [],
  channelPermissionMatrix = {},
  selectedChannelId,
  onSelectChannel,
  fillHeight = false,
}) {
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());

  const groups = useMemo(() => groupProjectChannelsByProject(projectChannels), [projectChannels]);

  const getChannelPerm = (channelId) => {
    const row = channelPermissionMatrix?.[String(channelId)] || null;
    const canSee = Boolean(row?.canSee ?? row?.canRead);
    return {
      canSee,
      canRead: Boolean(row?.canRead),
    };
  };

  const toggleProject = (projectId) => {
    const id = String(projectId);
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!groups.length) return null;

  const sectionLabel = t('orgPanel.chatProjectsSection');
  const textMuted = isDarkMode ? 'text-[#9CA3AF]' : 'text-slate-500';
  const textActive = isDarkMode ? 'text-[#F3F4F6]' : 'text-slate-900';
  const rowHover = isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100';
  const rowActive = isDarkMode ? 'bg-indigo-500/15 text-indigo-200' : 'bg-indigo-50 text-indigo-900';

  return (
    <div className={fillHeight ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0 border-b border-border/60 pb-2'}>
      <div className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${textMuted}`}>
        {sectionLabel}
      </div>
      <div className={`${fillHeight ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-52 overflow-y-auto'} ${FIGMA_ORG_STRUCTURE_SCROLL}`}>
        {groups.map((group) => {
          const pid = String(group.projectId);
          const expanded = expandedProjectIds.has(pid) || groups.length === 1;
          const visibleChannels = (group.channels || []).filter((ch) => {
            const perm = getChannelPerm(ch._id);
            return perm.canSee || perm.canRead;
          });
          const { chat } = splitChatVoiceChannels(visibleChannels);
          if (!chat.length) return null;

          return (
            <div key={pid} className="px-1">
              <button
                type="button"
                onClick={() => toggleProject(pid)}
                className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-semibold ${textActive} ${rowHover}`}
              >
                {expanded ? (
                  <ChevronDown size={14} className="shrink-0 opacity-70" aria-hidden />
                ) : (
                  <ChevronRight size={14} className="shrink-0 opacity-70" aria-hidden />
                )}
                <span className="truncate">{group.projectName}</span>
              </button>
              {expanded ? (
                <div className="ml-2 border-l border-border/50 pl-1">
                  {chat.map((ch) => {
                    const cid = String(ch._id);
                    const selected = String(selectedChannelId) === cid;
                    const label = projectChannelDisplayLabel(ch, t);
                    const Icon = kindIcon(ch.projectChannelKind);
                    const unread = channelUnreadCount(ch);
                    const isTeam = String(ch.projectChannelKind || '') === 'team';
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => onSelectChannel?.(cid)}
                        className={`group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                          selected ? rowActive : `${textMuted} ${rowHover}`
                        }`}
                        title={
                          isTeam
                            ? `${group.projectName} · ${label}`
                            : `${group.projectName} · #${label}`
                        }
                      >
                        <Icon size={14} className="shrink-0 opacity-80" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {isTeam ? label : `#${label}`}
                        </span>
                        {unread > 0 ? (
                          <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
