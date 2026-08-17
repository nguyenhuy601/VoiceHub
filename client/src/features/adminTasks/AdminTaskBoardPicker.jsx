import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminUserFormCard,
  adminInputClass,
  adminLabelClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import projectAPI from '../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { boardIdOf, boardTitleOf } from './useAdminOrgBoards';

function unwrapList(payload) {
  const data = unwrapTaskApiPayload(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.projects)) return data.projects;
  if (Array.isArray(data?.boards)) return data.boards;
  return [];
}

function projectIdOf(project) {
  return String(project?.projectId || project?._id || project?.id || '').trim();
}

function projectTitleOf(project) {
  return String(project?.title || project?.name || 'Untitled').trim();
}

function projectCodeOf(project) {
  return String(project?.projectCode || '').trim();
}

function boardsOfProject(project) {
  if (Array.isArray(project?.boards)) {
    return project.boards.filter((b) => b && b.isActive !== false);
  }
  return [];
}

function optionMatchesQuery(option, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    option.label.toLowerCase().includes(q) ||
    String(option.id || '').toLowerCase().includes(q) ||
    String(option.title || '').toLowerCase().includes(q)
  );
}

/**
 * Select-only ARIA combobox: một ô lọc + listbox, không lưu free-text.
 */
function FilterCombobox({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  emptyLabel,
  needLabel,
}) {
  const reactId = useId();
  const inputId = `${reactId}-input`;
  const listId = `${reactId}-listbox`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((o) => o.id === value);
  const filtered = useMemo(
    () => options.filter((o) => optionMatchesQuery(o, query)),
    [options, query]
  );

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const commit = (nextId) => {
    onChange(nextId);
    setOpen(false);
    setQuery('');
  };

  const openList = () => {
    const idx = options.findIndex((o) => o.id === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
    setQuery('');
  };

  const onKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const hit = filtered[activeIndex];
      if (hit) commit(hit.id);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const activeOption = open ? filtered[activeIndex] : null;
  const activeDescendant = activeOption ? `${listId}-opt-${activeOption.id || 'none'}` : undefined;

  return (
    <div ref={rootRef} className="relative">
      <label className={adminLabelClass()} htmlFor={inputId}>
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          autoComplete="off"
          disabled={disabled}
          className={`${adminInputClass()} pl-9`}
          placeholder={open && selected ? selected.label : placeholder || needLabel}
          value={open ? query : selected?.label || ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            openList();
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {filtered.map((option, index) => {
            const optId = `${listId}-opt-${option.id || 'none'}`;
            const isActive = index === activeIndex;
            const isSelected = option.id === value;
            return (
              <li
                key={optId}
                id={optId}
                role="option"
                aria-selected={isSelected}
                title={option.title || undefined}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  isActive ? 'bg-muted/60' : ''
                } ${isSelected ? 'font-medium text-foreground' : 'text-foreground'}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option.id);
                }}
              >
                {option.label}
              </li>
            );
          })}
          {!filtered.length ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
              {emptyLabel}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Cascade picker: Project → Board (boardId callback cho API board-scoped).
 */
export default function AdminTaskBoardPicker({
  orgId,
  boardId,
  onBoardIdChange,
  onProjectIdChange,
  boards: _boardsProp,
  loading: loadingProp,
}) {
  void _boardsProp;
  const { t } = useAppStrings();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [boards, setBoards] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);

  const loading = loadingProp ?? (loadingProjects || loadingBoards);

  useEffect(() => {
    if (typeof onProjectIdChange === 'function') {
      onProjectIdChange(String(projectId || '').trim());
    }
  }, [projectId, onProjectIdChange]);

  // Khi boardId / org đổi — resolve lại project từ deep-link.
  useEffect(() => {
    setDeepLinkResolved(false);
  }, [boardId, orgId]);

  useEffect(() => {
    const oid = String(orgId || '').trim();
    if (!oid) {
      setProjects([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoadingProjects(true);
      try {
        const res = await projectAPI.list({ organizationId: oid });
        if (!cancelled) setProjects(unwrapList(res));
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Deep-link: boardId → projectId (nested boards, else org board list)
  useEffect(() => {
    const bid = String(boardId || '').trim();
    if (!bid || deepLinkResolved) return undefined;
    if (!projects.length && loadingProjects) return undefined;

    for (const p of projects) {
      const match = boardsOfProject(p).find((b) => boardIdOf(b) === bid);
      if (match) {
        setProjectId(projectIdOf(p));
        setDeepLinkResolved(true);
        return undefined;
      }
    }

    const oid = String(orgId || '').trim();
    if (!oid) {
      setDeepLinkResolved(true);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoards({ organizationId: oid });
        const orgBoards = unwrapList(res);
        const hit = orgBoards.find((b) => boardIdOf(b) === bid);
        const pid = String(hit?.projectId || '').trim();
        if (!cancelled && pid) setProjectId(pid);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDeepLinkResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, projects, loadingProjects, orgId, deepLinkResolved]);

  // Load boards when project changes
  useEffect(() => {
    const pid = String(projectId || '').trim();
    if (!pid) {
      setBoards([]);
      return undefined;
    }
    const fromList = boardsOfProject(projects.find((p) => projectIdOf(p) === pid));
    if (fromList.length) {
      setBoards(fromList);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoadingBoards(true);
      try {
        const res = await projectAPI.listBoards(pid, orgId);
        const list = unwrapList(res).filter((b) => b && b.isActive !== false);
        if (!cancelled) setBoards(list);
      } catch {
        if (!cancelled) setBoards([]);
      } finally {
        if (!cancelled) setLoadingBoards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, projects, orgId]);

  // Clear board if it no longer belongs to selected project
  useEffect(() => {
    const bid = String(boardId || '').trim();
    const pid = String(projectId || '').trim();
    if (!bid || !pid || !boards.length) return;
    const stillThere = boards.some((b) => boardIdOf(b) === bid);
    if (!stillThere) onBoardIdChange?.('');
  }, [boards, boardId, projectId, onBoardIdChange]);

  const selectedProject = projects.find((p) => projectIdOf(p) === String(projectId || ''));
  const selectedBoard = boards.find((b) => boardIdOf(b) === String(boardId || ''));

  const projectOptions = useMemo(
    () =>
      projects.map((p) => {
        const id = projectIdOf(p);
        const code = projectCodeOf(p);
        return {
          id,
          label: code ? `${projectTitleOf(p)} (${code})` : projectTitleOf(p),
          title: id,
        };
      }),
    [projects]
  );

  const boardOptions = useMemo(
    () =>
      boards.map((b) => {
        const id = boardIdOf(b);
        return { id, label: boardTitleOf(b), title: id };
      }),
    [boards]
  );

  const onProjectChange = (nextProjectId) => {
    setProjectId(nextProjectId);
    setDeepLinkResolved(true);
    if (boardId) onBoardIdChange?.('');
  };

  const onBoardChange = (nextBoardId) => {
    onBoardIdChange?.(nextBoardId);
  };

  return (
    <AdminUserFormCard title={t('adminTasks.pickProject')} hint={t('adminTasks.pickBoardHint')}>
      <div className="space-y-4">
        <FilterCombobox
          label={t('adminTasks.pickProject')}
          value={String(projectId || '')}
          options={projectOptions}
          onChange={onProjectChange}
          disabled={loadingProjects}
          placeholder={t('adminTasks.pickProjectPlaceholder')}
          emptyLabel={t('adminTasks.pickProjectEmpty')}
          needLabel={t('adminTasks.needProject')}
        />

        <FilterCombobox
          key={String(projectId || 'none')}
          label={t('adminTasks.pickBoard')}
          value={String(boardId || '')}
          options={boardOptions}
          onChange={onBoardChange}
          disabled={!projectId || loadingBoards}
          placeholder={t('adminTasks.pickBoardPlaceholder')}
          emptyLabel={t('adminTasks.pickBoardEmpty')}
          needLabel={t('adminTasks.needBoard')}
        />

        {loading ? <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p> : null}

        {selectedProject || selectedBoard ? (
          <p className="text-xs text-muted-foreground">
            {selectedProject ? projectTitleOf(selectedProject) : null}
            {selectedProject && selectedBoard ? ' · ' : null}
            {selectedBoard ? boardTitleOf(selectedBoard) : null}
          </p>
        ) : null}
      </div>
    </AdminUserFormCard>
  );
}
