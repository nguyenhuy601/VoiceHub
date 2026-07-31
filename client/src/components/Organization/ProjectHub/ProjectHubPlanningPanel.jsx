import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { formatHubDate } from './projectHubUtils';

const PLAN_SUBTABS = [
  { id: 'epics', labelKey: 'workspace.projectHubPlanEpics' },
  { id: 'backlog', labelKey: 'workspace.projectHubPlanBacklog' },
  { id: 'sprints', labelKey: 'workspace.projectHubPlanSprints' },
  { id: 'roadmap', labelKey: 'workspace.projectHubPlanRoadmap' },
];

/**
 * G3 — Planning tab: Epic / Backlog / Sprint / Roadmap items.
 */
export default function ProjectHubPlanningPanel({
  projectId = '',
  canManage = false,
  isDarkMode = false,
  locale = 'vi',
}) {
  const { t } = useAppStrings();
  const [sub, setSub] = useState('epics');
  const [items, setItems] = useState([]);
  const [backlog, setBacklog] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState('epic');
  const [sprintName, setSprintName] = useState('');
  const [reviewDraft, setReviewDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
  const cardCls = 'rounded-xl border border-border bg-surface px-3 py-2.5';

  const reload = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      setBacklog([]);
      setSprints([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [itemsRes, backlogRes, sprintsRes] = await Promise.all([
        projectAPI.listPlanningItems(projectId),
        projectAPI.listBacklog(projectId),
        projectAPI.listSprints(projectId),
      ]);
      setItems(itemsRes?.data?.data ?? itemsRes?.data ?? []);
      setBacklog(backlogRes?.data?.data ?? backlogRes?.data ?? []);
      setSprints(sprintsRes?.data?.data ?? sprintsRes?.data ?? []);
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanLoadFail') })
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const epics = useMemo(() => items.filter((i) => i.type === 'epic'), [items]);
  const roadmapItems = useMemo(
    () => items.filter((i) => ['roadmap', 'release', 'milestone', 'feature'].includes(i.type)),
    [items]
  );

  const createItem = async () => {
    if (!canManage || !title.trim() || busy) return;
    setBusy(true);
    try {
      await projectAPI.createPlanningItem(projectId, {
        type: itemType,
        title: title.trim(),
      });
      setTitle('');
      toast.success(t('workspace.projectHubPlanCreated'));
      await reload();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (itemId) => {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      await projectAPI.deletePlanningItem(projectId, itemId);
      await reload();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanDeleteFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const createSprint = async () => {
    if (!canManage || !sprintName.trim() || busy) return;
    setBusy(true);
    try {
      await projectAPI.createSprint(projectId, { name: sprintName.trim(), status: 'planned' });
      setSprintName('');
      toast.success(t('workspace.projectHubPlanSprintCreated'));
      await reload();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const closeSprintWithReview = async (sprintId) => {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      await projectAPI.patchSprint(projectId, sprintId, {
        status: 'closed',
        reviewNotes: reviewDraft[sprintId] || '',
      });
      toast.success(t('workspace.projectHubPlanSprintClosed'));
      await reload();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const linkEpic = async (taskId, epicId) => {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      await projectAPI.linkTaskPlanning(projectId, taskId, {
        epicId: epicId || null,
      });
      await reload();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanLinkFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={`px-4 py-8 text-center text-sm ${muted}`}>
        {t('workspace.projectHubPlanLoading')}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 pt-3">
        <h3 className={`text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabPlanning')}</h3>
        <p className={`mb-2 text-xs ${muted}`}>{t('workspace.projectHubPlanHint')}</p>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {PLAN_SUBTABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSub(tab.id)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                sub === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : isDarkMode
                    ? 'bg-white/5 text-slate-300'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {(sub === 'epics' || sub === 'roadmap') && canManage ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {sub === 'roadmap' ? (
              <select
                className={`${inputCls} mt-0 max-w-[140px]`}
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
              >
                <option value="roadmap">roadmap</option>
                <option value="release">release</option>
                <option value="milestone">milestone</option>
                <option value="feature">feature</option>
              </select>
            ) : null}
            <input
              className={`${inputCls} mt-0 min-w-[180px] flex-1`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                sub === 'epics'
                  ? t('workspace.projectHubPlanEpicPh')
                  : t('workspace.projectHubPlanItemPh')
              }
            />
            <button
              type="button"
              onClick={() => {
                if (sub === 'epics') setItemType('epic');
                createItem();
              }}
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              {t('workspace.projectHubPlanAdd')}
            </button>
          </div>
        ) : null}

        {sub === 'epics' ? (
          epics.length === 0 ? (
            <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
              {t('workspace.projectHubPlanEpicsEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {epics.map((epic) => (
                <li key={epic._id} className={cardCls}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`text-sm font-semibold ${titleCls}`}>{epic.title}</div>
                      <div className={`text-[11px] ${muted}`}>
                        {epic.status}
                        {epic.targetDate ? ` · ${formatHubDate(epic.targetDate, locale)}` : ''}
                      </div>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => removeItem(epic._id)}
                        className="text-[11px] text-destructive"
                      >
                        {t('workspace.projectHubPlanDelete')}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {sub === 'backlog' ? (
          backlog.length === 0 ? (
            <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
              {t('workspace.projectHubPlanBacklogEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {backlog.map((task) => (
                <li key={task._id} className={cardCls}>
                  <div className={`text-sm font-semibold ${titleCls}`}>{task.title}</div>
                  <div className={`mt-0.5 text-[11px] ${muted}`}>
                    {task.issueType || 'task'}
                    {task.priority ? ` · ${task.priority}` : ''}
                    {task.dueDate ? ` · ${formatHubDate(task.dueDate, locale)}` : ''}
                  </div>
                  {canManage && epics.length > 0 ? (
                    <select
                      className={`${inputCls} mt-2 max-w-xs`}
                      value={task.epicId ? String(task.epicId) : ''}
                      onChange={(e) => linkEpic(task._id, e.target.value)}
                    >
                      <option value="">{t('workspace.projectHubPlanNoEpic')}</option>
                      {epics.map((e) => (
                        <option key={e._id} value={String(e._id)}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}

        {sub === 'sprints' ? (
          <div className="space-y-3">
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${inputCls} mt-0 min-w-[180px] flex-1`}
                  value={sprintName}
                  onChange={(e) => setSprintName(e.target.value)}
                  placeholder={t('workspace.projectHubPlanSprintPh')}
                />
                <button
                  type="button"
                  onClick={createSprint}
                  disabled={busy}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  {t('workspace.projectHubPlanAddSprint')}
                </button>
              </div>
            ) : null}
            {sprints.length === 0 ? (
              <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
                {t('workspace.projectHubPlanSprintsEmpty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {sprints.map((s) => (
                  <li key={s._id} className={cardCls}>
                    <div className={`text-sm font-semibold ${titleCls}`}>{s.name}</div>
                    <div className={`text-[11px] ${muted}`}>
                      {s.status}
                      {s.startDate || s.endDate
                        ? ` · ${formatHubDate(s.startDate, locale)} → ${formatHubDate(s.endDate, locale)}`
                        : ''}
                    </div>
                    {s.goal ? <p className={`mt-1 text-xs ${muted}`}>{s.goal}</p> : null}
                    {s.reviewNotes ? (
                      <p className={`mt-1 text-xs ${titleCls}`}>
                        {t('workspace.projectHubPlanReview')}: {s.reviewNotes}
                      </p>
                    ) : null}
                    {canManage && s.status !== 'closed' ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className={`${inputCls} min-h-[56px]`}
                          placeholder={t('workspace.projectHubPlanReviewPh')}
                          value={reviewDraft[s._id] || ''}
                          onChange={(e) =>
                            setReviewDraft((d) => ({ ...d, [s._id]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => closeSprintWithReview(s._id)}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold"
                        >
                          {t('workspace.projectHubPlanCloseSprint')}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {sub === 'roadmap' ? (
          roadmapItems.length === 0 ? (
            <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
              {t('workspace.projectHubPlanRoadmapEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {roadmapItems.map((item) => (
                <li key={item._id} className={cardCls}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          isDarkMode ? 'bg-white/10' : 'bg-muted'
                        }`}
                      >
                        {item.type}
                      </span>
                      <span className={`text-sm font-semibold ${titleCls}`}>{item.title}</span>
                      <div className={`mt-0.5 text-[11px] ${muted}`}>
                        {item.status}
                        {item.targetDate ? ` · ${formatHubDate(item.targetDate, locale)}` : ''}
                      </div>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => removeItem(item._id)}
                        className="text-[11px] text-destructive"
                      >
                        {t('workspace.projectHubPlanDelete')}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
