import {
  AlarmClock,
  AtSign,
  BellRing,
  FileText,
  Inbox,
  ListTodo,
  MessageCircle,
  Sparkles,
  UserPlus,
  Video,
} from 'lucide-react';

/**
 * Visual language Inbox — học Slack Activity (icon theo loại + semantic color),
 * dùng token VoiceHub (primary / success / warning / destructive / info / ai).
 */

const VISUAL = {
  needsAction: {
    Icon: ListTodo,
    color: 'text-warning',
    bg: 'bg-warning/15',
    border: 'border-warning/30',
    activeBg: 'bg-warning text-white',
    activeIdle: 'hover:bg-warning/10 hover:text-warning',
    accent: 'bg-warning',
    chipActive: 'bg-warning text-white shadow-sm shadow-warning/25',
    unreadTint: 'bg-warning/[0.06] hover:bg-warning/[0.1]',
  },
  all: {
    Icon: Inbox,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/25',
    activeBg: 'bg-primary text-primary-foreground',
    activeIdle: 'hover:bg-primary/10 hover:text-primary',
    accent: 'bg-primary',
    chipActive: 'bg-primary text-primary-foreground shadow-sm',
    unreadTint: 'bg-primary/[0.04] hover:bg-primary/[0.07]',
  },
  unread: {
    Icon: BellRing,
    color: 'text-info',
    bg: 'bg-info/15',
    border: 'border-info/30',
    activeBg: 'bg-info text-white',
    activeIdle: 'hover:bg-info/10 hover:text-info',
    accent: 'bg-info',
    chipActive: 'bg-info text-white shadow-sm shadow-info/25',
    unreadTint: 'bg-info/[0.06] hover:bg-info/[0.1]',
  },
  friend: {
    Icon: UserPlus,
    color: 'text-success',
    bg: 'bg-success/15',
    border: 'border-success/30',
    accent: 'bg-success',
    chipActive: 'bg-success text-white shadow-sm shadow-success/25',
    unreadTint: 'bg-success/[0.06] hover:bg-success/[0.1]',
  },
  mention: {
    Icon: AtSign,
    color: 'text-destructive',
    bg: 'bg-destructive/12',
    border: 'border-destructive/30',
    accent: 'bg-destructive',
    chipActive: 'bg-destructive text-destructive-foreground shadow-sm',
    unreadTint: 'bg-destructive/[0.06] hover:bg-destructive/[0.1]',
  },
  message: {
    Icon: MessageCircle,
    color: 'text-success',
    bg: 'bg-success/12',
    border: 'border-success/25',
    accent: 'bg-success',
    chipActive: 'bg-success text-white shadow-sm shadow-success/25',
    unreadTint: 'bg-success/[0.05] hover:bg-success/[0.09]',
  },
  meeting: {
    Icon: Video,
    color: 'text-warning',
    bg: 'bg-warning/15',
    border: 'border-warning/30',
    accent: 'bg-warning',
    chipActive: 'bg-warning text-white shadow-sm shadow-warning/25',
    unreadTint: 'bg-warning/[0.06] hover:bg-warning/[0.1]',
  },
  task: {
    Icon: ListTodo,
    color: 'text-primary',
    bg: 'bg-primary/12',
    border: 'border-primary/30',
    accent: 'bg-primary',
    chipActive: 'bg-primary text-primary-foreground shadow-sm',
    unreadTint: 'bg-primary/[0.05] hover:bg-primary/[0.09]',
  },
  deadline: {
    Icon: AlarmClock,
    color: 'text-error',
    bg: 'bg-error/12',
    border: 'border-error/30',
    accent: 'bg-error',
    chipActive: 'bg-error text-white shadow-sm shadow-error/25',
    unreadTint: 'bg-error/[0.07] hover:bg-error/[0.12]',
  },
  file: {
    Icon: FileText,
    color: 'text-info',
    bg: 'bg-info/12',
    border: 'border-info/30',
    accent: 'bg-info',
    chipActive: 'bg-info text-white shadow-sm shadow-info/25',
    unreadTint: 'bg-info/[0.05] hover:bg-info/[0.09]',
  },
  system: {
    Icon: Sparkles,
    color: 'text-ai',
    bg: 'bg-ai/12',
    border: 'border-ai/30',
    accent: 'bg-ai',
    chipActive: 'bg-ai text-ai-foreground shadow-sm',
    unreadTint: 'bg-ai/[0.06] hover:bg-ai/[0.1]',
  },
  typeAll: {
    Icon: Inbox,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
    accent: 'bg-primary',
    chipActive: 'bg-primary text-primary-foreground shadow-sm',
    unreadTint: 'bg-primary/[0.04] hover:bg-primary/[0.07]',
  },
};

export function getPrimaryFilterVisual(id) {
  if (id === 'needsAction') return VISUAL.needsAction;
  if (id === 'unread') return VISUAL.unread;
  return VISUAL.all;
}

export function getTypeFilterVisual(id) {
  if (id === 'all') return VISUAL.typeAll;
  return VISUAL[id] || VISUAL.typeAll;
}

/**
 * @param {{ type?: string, rawType?: string, data?: object, title?: string }|null|undefined} notif
 */
export function resolveNotificationVisual(notif) {
  const raw = String(notif?.rawType || notif?.type || 'system');
  const ui = String(notif?.type || '').trim().toLowerCase();
  const kind = String(notif?.data?.kind || '').trim().toLowerCase();
  const title = String(notif?.title || '');

  if (raw === 'friend_request' || raw === 'friend_accepted' || ui === 'friend') {
    return VISUAL.friend;
  }
  if (raw === 'voice_room_invite' || raw === 'voice_invite' || ui === 'meeting') {
    return VISUAL.meeting;
  }
  if (ui === 'deadline' || kind === 'task_due_soon' || kind === 'task_overdue') {
    return VISUAL.deadline;
  }
  if (ui === 'task' || raw === 'task_assigned' || raw === 'task_completed') {
    return VISUAL.task;
  }
  if (ui === 'mention') return VISUAL.mention;
  if (ui === 'message' || raw === 'message') return VISUAL.message;
  if (ui === 'file' || raw === 'document') return VISUAL.file;
  if (raw.includes('ai') || kind === 'ai_proposal_pending' || title.includes('VoiceHubAI')) {
    return VISUAL.system;
  }
  if (ui === 'system' || raw === 'system') return VISUAL.system;
  return VISUAL[ui] || VISUAL.system;
}

export { VISUAL as NOTIFICATION_VISUAL };
