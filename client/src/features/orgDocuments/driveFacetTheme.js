import {
  FolderOpen,
  Library,
  Megaphone,
  MessageSquare,
  Mic,
  Image as ImageIcon,
  Paperclip,
  Phone,
} from 'lucide-react';

/** Facet nguồn → icon Lucide + token màu (design system). */
export const DRIVE_FACET_THEME = {
  all: {
    Icon: FolderOpen,
    iconClass: 'text-foreground',
    chipClass: 'bg-muted text-foreground',
    activeClass: 'bg-primary/15 text-primary border-primary/40',
  },
  shared: {
    Icon: Paperclip,
    iconClass: 'text-info',
    chipClass: 'bg-info/10 text-info',
    activeClass: 'bg-info/15 text-info border-info/40',
  },
  channel_chat: {
    Icon: MessageSquare,
    iconClass: 'text-primary',
    chipClass: 'bg-primary/10 text-primary',
    activeClass: 'bg-primary/15 text-primary border-primary/40',
  },
  channel_voice: {
    Icon: Mic,
    iconClass: 'text-warning',
    chipClass: 'bg-warning/10 text-warning',
    activeClass: 'bg-warning/15 text-warning border-warning/40',
  },
  voice_meeting: {
    Icon: Phone,
    iconClass: 'text-accent-foreground',
    chipClass: 'bg-accent text-accent-foreground',
    activeClass: 'bg-accent text-accent-foreground border-border',
  },
  announcement: {
    Icon: Megaphone,
    iconClass: 'text-warning',
    chipClass: 'bg-warning/10 text-warning',
    activeClass: 'bg-warning/15 text-warning border-warning/40',
  },
  library: {
    Icon: Library,
    iconClass: 'text-info',
    chipClass: 'bg-info/10 text-info',
    activeClass: 'bg-info/15 text-info border-info/40',
  },
  image: {
    Icon: ImageIcon,
    iconClass: 'text-success',
    chipClass: 'bg-success/10 text-success',
    activeClass: 'bg-success/15 text-success border-success/40',
  },
};

export function getDriveFacetTheme(facetId) {
  return DRIVE_FACET_THEME[facetId] || DRIVE_FACET_THEME.all;
}
