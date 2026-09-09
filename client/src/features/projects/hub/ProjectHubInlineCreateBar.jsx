import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import { isBoardCreateType, isPlanningCreateType } from './projectWorkTypes';

const LABEL_KEYS = {
  epic: 'workspace.projectHubIssueTypeEpic',
  feature: 'workspace.projectHubIssueTypeFeature',
  story: 'workspace.projectHubIssueTypeStory',
  task: 'workspace.projectHubIssueTypeTask',
  bug: 'workspace.projectHubIssueTypeBug',
  subtask: 'workspace.projectHubIssueTypeSubtask',
};

function badgeTypeFor(typeId) {
  const id = String(typeId || '').toLowerCase();
  if (id === 'feature' || id === 'subtask') return id;
  if (id === 'epic' || id === 'story' || id === 'bug' || id === 'task') return id;
  return 'task';
}

/**
 * Thanh tạo work item — menu type phẳng (không thụt cấp).
 */
export default function ProjectHubInlineCreateBar({
  allowedTypes = [],
  hasBoardColumn = false,
  busy = false,
  initialOpen = false,
  menuPlacement = 'down',
  placeholderKey = '',
  onCreate,
  onManageTypes = null,
  t,
}) {
  const types = (allowedTypes || [])
    .map((x) => String(x || '').toLowerCase())
    .filter((x, i, arr) => x && arr.indexOf(x) === i);
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [menuOpen, setMenuOpen] = useState(false);
  const [issueType, setIssueType] = useState(types[0] || 'story');
  const [title, setTitle] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, [initialOpen]);

  useEffect(() => {
    if (!types.includes(issueType) && types[0]) setIssueType(types[0]);
  }, [types, issueType]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  if (!types.length) return null;

  const activeType = types.includes(issueType) ? issueType : types[0];
  const needsBoard = isBoardCreateType(activeType) || activeType === 'subtask';
  const canSubmit = Boolean(title.trim()) && !busy && (!needsBoard || hasBoardColumn);
  const typeLabel = (key) => t(LABEL_KEYS[key] || LABEL_KEYS.task);
  const openUp = menuPlacement === 'up';

  const placeholder = (() => {
    if (placeholderKey) return t(placeholderKey);
    if (isPlanningCreateType(activeType)) return t('workspace.projectHubBacklogCreatePlanningPh');
    if (activeType === 'subtask') return t('workspace.projectHubBacklogCreateSubtaskPh');
    return t('workspace.projectHubListCreatePh');
  })();

  const submit = () => {
    const text = title.trim();
    const typeToCreate = String(activeType || '').toLowerCase();
    if (!text || busy || !typeToCreate) return;
    if (needsBoard && !hasBoardColumn) return;
    onCreate?.(typeToCreate, text);
    setTitle('');
    setOpen(false);
    setMenuOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="mt-1 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {t('workspace.projectHubBacklogCreate')}
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-background p-2 sm:flex-row sm:items-center">
      {needsBoard && !hasBoardColumn ? (
        <p className="text-xs text-muted-foreground">{t('workspace.projectHubPlanNoBoardForStory')}</p>
      ) : (
        <>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-primary/60 px-1.5 py-1"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              aria-label={t('workspace.projectHubBacklogTypeMenuAria')}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <ProjectHubIssueTypeBadge
                type={badgeTypeFor(activeType)}
                variant="icon"
                label={typeLabel(activeType)}
              />
              {openUp ? (
                <ChevronUp size={12} className="text-muted-foreground" aria-hidden />
              ) : (
                <ChevronDown size={12} className="text-muted-foreground" aria-hidden />
              )}
            </button>
            {menuOpen ? (
              <ul
                role="listbox"
                className={`absolute z-40 min-w-[11rem] rounded-lg border border-border bg-surface py-1 shadow-lg ${
                  openUp ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}
              >
                {types.map((tp) => {
                  const selected = tp === activeType;
                  return (
                    <li key={tp} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        className={`relative flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted ${
                          selected ? 'bg-muted/80' : ''
                        }`}
                        onClick={() => {
                          setIssueType(tp);
                          setMenuOpen(false);
                        }}
                      >
                        {selected ? (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" aria-hidden />
                        ) : null}
                        <ProjectHubIssueTypeBadge
                          type={badgeTypeFor(tp)}
                          variant="icon"
                          label={typeLabel(tp)}
                        />
                        <span className="text-foreground">{typeLabel(tp)}</span>
                      </button>
                    </li>
                  );
                })}
                {onManageTypes ? (
                  <>
                    <li className="my-1 border-t border-border" aria-hidden />
                    <li>
                      <button
                        type="button"
                        className="w-full px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setMenuOpen(false);
                          onManageTypes();
                        }}
                      >
                        {t('workspace.projectHubListManageWorkTypes')}
                      </button>
                    </li>
                  </>
                ) : null}
              </ul>
            ) : null}
          </div>
          <input
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                setOpen(false);
                setTitle('');
                setMenuOpen(false);
              }
            }}
          />
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {t('workspace.projectHubPlanAdd')}
          </button>
        </>
      )}
    </div>
  );
}
