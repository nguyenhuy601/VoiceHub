import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  MessageCircle,
  Timer,
  Users,
} from 'lucide-react';

export const METRIC_ICON_MAP = {
  org: Building2,
  tasks: CheckCircle2,
  friends: Users,
  notify: Bell,
  comms: MessageCircle,
  personnel: Users,
  ontime: CheckCircle2,
  response: Timer,
  overdue: AlertTriangle,
  dueWeek: CalendarClock,
  myOpen: ListTodo,
  open: FolderKanban,
};

export const METRIC_COLOR_MAP = {
  org: { color: '#2563EB', bg: 'rgba(37,99,235,0.08)' },
  tasks: { color: '#F97316', bg: 'rgba(249,115,22,0.08)' },
  friends: { color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  notify: { color: '#06B6D4', bg: 'rgba(6,182,212,0.08)' },
  comms: { color: '#2563EB', bg: 'rgba(37,99,235,0.08)' },
  personnel: { color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  ontime: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
  response: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  overdue: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
  dueWeek: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  myOpen: { color: '#2563EB', bg: 'rgba(37,99,235,0.08)' },
  open: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
};

export function hashColorForSeed(seed) {
  const palette = ['#2563EB', '#10B981', '#06B6D4', '#8B5CF6', '#F59E0B', '#EF4444'];
  const text = String(seed || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function dayKeyFromDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildProductivity30D(activityDailyMap, locale, meetingsDailyMap = {}) {
  const rows = [];
  const LOCALE_TAG_EN = 'en-US';
  const LOCALE_TAG_VI = 'vi-VN';
  const dateLocale = locale === 'en' ? LOCALE_TAG_EN : LOCALE_TAG_VI;
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = dayKeyFromDate(d);
    const bucket = activityDailyMap?.[key] || { tasks: 0, messages: 0 };
    rows.push({
      day: d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'numeric' }),
      tasks: Number(bucket.tasks) || 0,
      messages: Number(bucket.messages) || 0,
      meetings: Number(meetingsDailyMap?.[key]) || Number(bucket.meetings) || 0,
    });
  }
  return rows;
}

export function buildProductivityTrends(productivity30d) {
  const half = Math.floor(productivity30d.length / 2);
  const first = productivity30d.slice(0, half);
  const second = productivity30d.slice(half);
  const sum = (rows, key) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  const pct = (a, b) => {
    if (!b) return a > 0 ? '+100%' : '0%';
    const delta = Math.round(((a - b) / b) * 100);
    return `${delta >= 0 ? '+' : ''}${delta}%`;
  };
  return {
    tasks: pct(sum(second, 'tasks'), sum(first, 'tasks')),
    messages: pct(sum(second, 'messages'), sum(first, 'messages')),
    meetings: pct(sum(second, 'meetings'), sum(first, 'meetings')),
  };
}
