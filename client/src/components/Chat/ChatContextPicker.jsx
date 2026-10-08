import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { projectAPI } from '../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload, unwrapTaskBoardDetailPayload } from '../../services/api/taskAPI';
import { displayIssueKey } from '../../features/projects/hub/projectHubUtils';

const PICKER_TABS = [
  { id: 'work', labelKey: 'chat.contextPicker.tabWork' },
  { id: 'cr', labelKey: 'chat.contextPicker.tabCr' },
  { id: 'project', labelKey: 'chat.contextPicker.tabProject' },
];

const MAX_PROJECTS = 8;
const MAX_ITEMS = 40;
const MOTION_BTN =
  'motion-safe:transition-colors motion-reduce:transition-none';

function projectRowId(row) {
  return String(row?.projectId || row?._id || '').trim();
}

function matchesQuery(haystack, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return String(haystack || '').toLowerCase().includes(q);
}

function cardsFromBoardDetail(detail) {
  if (Array.isArray(detail?.cards) && detail.cards.length) return detail.cards;
  const lists = Array.isArray(detail?.lists) ? detail.lists : [];
  return lists.flatMap((list) => (Array.isArray(list?.cards) ? list.cards : []));
}

/**
 * Composer picker: Work / CR / Project (Call). List nhẹ — không fetch full preview.
 */
export default function ChatContextPicker({
  open = false,
  isDarkMode: _isDarkMode = true,
  t,
  projects = [],
  loadingProjects = false,
  apiCtx = null,
  onSelectProject,
  onSelectRef,
}) {
  const titleId = useId();
  const tablistId = useId();
  const [tab, setTab] = useState('work');
  const [query, setQuery] = useState('');
  const [workItems, setWorkItems] = useState([]);
  const [crItems, setCrItems] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const loadCatalog = useCallback(async () => {
    const rows = (Array.isArray(projects) ? projects : []).slice(0, MAX_PROJECTS);
    if (!rows.length) {
      setWorkItems([]);
      setCrItems([]);
      return;
    }
    setLoadingCatalog(true);
    try {
      const workSettled = await Promise.allSettled(
        rows.map(async (row) => {
          const projectId = projectRowId(row);
          const boardId = String(row.defaultBoardId || '').trim();
          const projectCode = String(row.projectCode || '').trim();
          const projectName = String(row.name || row.title || '').trim();
          if (!projectId || !boardId) return [];
          const res = await taskAPI.getBoardDetail(boardId, { ...(apiCtx || {}), includeCards: true });
          const detail = unwrapTaskBoardDetailPayload(res);
          return cardsFromBoardDetail(detail)
            .map((card) => {
              const id = String(card?._id || card?.id || '').trim();
              if (!id) return null;
              const label = displayIssueKey(projectCode, id);
              return {
                kind: 'task',
                id,
                projectId,
                label,
                title: String(card.title || ''),
                issueType: String(card.issueType || 'task'),
                status: String(card.status || ''),
                projectName,
              };
            })
            .filter(Boolean)
            .slice(0, MAX_ITEMS);
        })
      );
      const crSettled = await Promise.allSettled(
        rows.map(async (row) => {
          const projectId = projectRowId(row);
          const projectName = String(row.name || row.title || '').trim();
          if (!projectId) return [];
          const res = await projectAPI.listChangeRequests(projectId, { size: 30 });
          const payload = unwrapTaskApiPayload(res);
          const items = Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload)
              ? payload
              : [];
          return items
            .map((cr) => {
              const id = String(cr?._id || cr?.id || '').trim();
              if (!id) return null;
              const label = String(cr.code || '').trim() || id;
              return {
                kind: 'change_request',
                id,
                projectId,
                label,
                title: String(cr.title || ''),
                status: String(cr.status || ''),
                projectName,
              };
            })
            .filter(Boolean);
        })
      );
      setWorkItems(workSettled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).slice(0, MAX_ITEMS));
      setCrItems(crSettled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).slice(0, MAX_ITEMS));
    } finally {
      setLoadingCatalog(false);
    }
  }, [projects, apiCtx]);

  useEffect(() => {
    if (!open) return undefined;
    void loadCatalog();
    return undefined;
  }, [open, loadCatalog]);

  const filteredWork = useMemo(
    () =>
      workItems.filter(
        (item) =>
          matchesQuery(item.label, query) ||
          matchesQuery(item.title, query) ||
          matchesQuery(item.issueType, query) ||
          matchesQuery(item.projectName, query)
      ),
    [workItems, query]
  );
  const filteredCr = useMemo(
    () =>
      crItems.filter(
        (item) =>
          matchesQuery(item.label, query) ||
          matchesQuery(item.title, query) ||
          matchesQuery(item.projectName, query)
      ),
    [crItems, query]
  );
  const filteredProjects = useMemo(
    () =>
      (Array.isArray(projects) ? projects : []).filter((row) =>
        matchesQuery(row.name || row.title || row.projectCode, query)
      ),
    [projects, query]
  );

  if (!open) return null;

  const itemCls = `flex w-full flex-col px-3 py-2 text-left text-sm text-foreground hover:bg-muted ${MOTION_BTN}`;

  return (
    <div
      className="absolute bottom-full left-0 z-40 mb-1 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
      role="dialog"
      aria-labelledby={titleId}
    >
      <div
        id={titleId}
        className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {t('chat.contextPicker.title')}
      </div>
      <div
        id={tablistId}
        role="tablist"
        aria-label={t('chat.contextPicker.tabsLabel')}
        className="flex border-b border-border px-1"
      >
        {PICKER_TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`${tablistId}-${item.id}`}
              className={`flex-1 px-2 py-1.5 text-[11px] font-semibold ${MOTION_BTN} ${
                selected ? 'text-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>
      <div className="px-2 py-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('chat.contextPicker.searchPlaceholder')}
          aria-label={t('chat.contextPicker.searchPlaceholder')}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div
        className="max-h-44 overflow-y-auto"
        role="tabpanel"
        aria-labelledby={`${tablistId}-${tab}`}
      >
        {tab === 'project' ? (
          loadingProjects ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {t('chat.contextPicker.loading')}
            </div>
          ) : filteredProjects.length ? (
            <ul role="listbox" aria-label={t('chat.contextPicker.tabProject')}>
              {filteredProjects.map((row) => {
                const pid = projectRowId(row);
                if (!pid) return null;
                return (
                  <li key={pid} role="option">
                    <button
                      type="button"
                      className={itemCls}
                      onClick={() =>
                        onSelectProject?.({
                          _id: pid,
                          projectId: pid,
                          name: row.name || row.title || pid,
                          projectCode: row.projectCode || '',
                          defaultBoardId: row.defaultBoardId || '',
                        })
                      }
                    >
                      <span className="truncate font-medium">{row.name || row.title || pid}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {t('chat.contextPicker.empty')}
            </div>
          )
        ) : null}
        {tab === 'work' ? (
          loadingCatalog ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {t('chat.contextPicker.loading')}
            </div>
          ) : filteredWork.length ? (
            <ul role="listbox" aria-label={t('chat.contextPicker.tabWork')}>
              {filteredWork.map((item) => (
                <li key={`${item.projectId}-${item.id}`} role="option">
                  <button type="button" className={itemCls} onClick={() => onSelectRef?.(item)}>
                    <span className="font-mono text-[11px] font-semibold">{item.label}</span>
                    <span className="truncate text-muted-foreground">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {t('chat.contextPicker.empty')}
            </div>
          )
        ) : null}
        {tab === 'cr' ? (
          loadingCatalog ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {t('chat.contextPicker.loading')}
            </div>
          ) : filteredCr.length ? (
            <ul role="listbox" aria-label={t('chat.contextPicker.tabCr')}>
              {filteredCr.map((item) => (
                <li key={`${item.projectId}-${item.id}`} role="option">
                  <button type="button" className={itemCls} onClick={() => onSelectRef?.(item)}>
                    <span className="font-mono text-[11px] font-semibold">{item.label}</span>
                    <span className="truncate text-muted-foreground">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {t('chat.contextPicker.empty')}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
