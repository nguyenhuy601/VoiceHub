import {
  Bell,
  Building2,
  FileStack,
  FolderKanban,
  MessagesSquare,
  Settings2,
  Video,
} from 'lucide-react';

/** Lucide icon component for system permission category keys. */
export function domainIconForKey(key) {
  const k = String(key || '').toLowerCase();
  if (k === 'system') return Settings2;
  if (k === 'organization') return Building2;
  if (k === 'project') return FolderKanban;
  if (k === 'communication') return MessagesSquare;
  if (k === 'meeting') return Video;
  if (k === 'file') return FileStack;
  if (k === 'notification') return Bell;
  return FolderKanban;
}
