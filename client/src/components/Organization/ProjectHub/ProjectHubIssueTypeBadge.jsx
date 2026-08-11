import { Bookmark, Bug, CheckSquare, Cpu, SquareStack, Zap } from 'lucide-react';
import { normalizeIssueType } from './projectHubUtils';

const CHIP_CLASS = {
  epic: 'bg-primary/15 text-primary',
  feature: 'bg-success/15 text-success',
  story: 'bg-primary/10 text-primary',
  bug: 'bg-destructive/15 text-destructive',
  task: 'bg-muted text-muted-foreground',
  subtask: 'bg-muted text-muted-foreground',
};

const ICON_CLASS = {
  epic: 'text-primary',
  feature: 'text-success',
  story: 'text-primary',
  bug: 'text-destructive',
  task: 'text-muted-foreground',
  subtask: 'text-muted-foreground',
};

const ICONS = {
  epic: Zap,
  feature: Cpu,
  story: Bookmark,
  bug: Bug,
  task: CheckSquare,
  subtask: SquareStack,
};

function resolveBadgeType(type) {
  const raw = String(type || 'task').toLowerCase();
  if (raw === 'feature' || raw === 'subtask') return raw;
  return normalizeIssueType(type);
}

/**
 * Chip hoặc icon loại work item (Epic / Feature / Story / Task / Bug / Sub-task).
 */
export default function ProjectHubIssueTypeBadge({ type = 'task', label, variant = 'chip' }) {
  const key = resolveBadgeType(type);
  if (variant === 'icon') {
    const Icon = ICONS[key] || ICONS.task;
    return (
      <span className={`inline-flex shrink-0 ${ICON_CLASS[key] || ICON_CLASS.task}`} title={label || key}>
        <Icon size={14} aria-hidden />
        <span className="sr-only">{label || key}</span>
      </span>
    );
  }
  const cls = CHIP_CLASS[key] || CHIP_CLASS.task;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {label || key}
    </span>
  );
}
