import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import Modal from '../../../../components/Shared/Modal';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import PlanningGanttPanel from './PlanningGanttPanel';
import {
  assigneeLabel,
  getStructured,
  isWbsLeaf,
  suggestEndDateFromEffort,
  suggestEndDateBlockReason,
} from './staffingPipelineModel';
import { useProjectMemberNames } from './useProjectMemberNames';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const INPUT =
  'mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60';

/**
 * Step 5 — Schedule BĐ/KT HITL (+ light Gantt). No CPM.
 */
export default function PlanningResourcesScheduleStaffingPanel({ projectId }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const canEdit = Boolean(capabilities.canEditPlanning);
  const nameByUserId = useProjectMemberNames(projectId);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({ startDate: '', endDate: '' });
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [suggestNote, setSuggestNote] = useState('');

  const wbsQ = useQuery({
    queryKey: ['planningArtifacts', projectId, 'WBS'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'WBS' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const leaves = useMemo(() => {
    const list = Array.isArray(wbsQ.data) ? wbsQ.data : [];
    return list.filter((a) => isWbsLeaf(a, list));
  }, [wbsQ.data]);

  const selected = useMemo(
    () => leaves.find((a) => String(a._id || a.id) === String(selectedId || '')) || null,
    [leaves, selectedId]
  );

  const openLeaf = (a) => {
    setSelectedId(String(a._id || a.id));
    const st = getStructured(a);
    setSuggestNote('');
    setDraft({
      startDate: String(st.startDate || a.startDate || '').slice(0, 10),
      endDate: String(st.endDate || a.endDate || '').slice(0, 10),
    });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const structured = {
        ...getStructured(selected),
        startDate: draft.startDate || undefined,
        endDate: draft.endDate || undefined,
      };
      if (!structured.startDate) delete structured.startDate;
      if (!structured.endDate) delete structured.endDate;
      return unwrap(
        await planningAPI.updateArtifact(projectId, selected._id || selected.id, {
          structured,
          startDate: draft.startDate || null,
          endDate: draft.endDate || null,
        })
      );
    },
    onSuccess: () => {
      setFieldError('');
      toast.success(t('common.saved'));
      queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId, 'WBS'] });
    },
    onMutate: () => setFieldError(''),
    onError: (err) => {
      const message = resolveApiErrorMessage(err, { t });
      setFieldError(message);
      toast.error(message);
    },
  });

  const suggestEnd = () => {
    if (!selected) return;
    const st = getStructured(selected);
    const hours = st.effortHours;
    const notes = [];
    if (suggestEndDateBlockReason(draft.startDate, 8) === 'missing_start') {
      notes.push(t('workspace.phase1StaffingSuggestNeedStart'));
    }
    if (!(Number(hours) > 0)) {
      notes.push(t('workspace.phase1StaffingSuggestNeedEffort'));
    }
    if (notes.length) {
      setSuggestNote(notes.join(' '));
      return;
    }
    const end = suggestEndDateFromEffort(draft.startDate, hours);
    if (!end) {
      setSuggestNote(t('workspace.phase1StaffingSuggestNeedStart'));
      return;
    }
    setDraft((d) => ({ ...d, endDate: end }));
    setSuggestNote(
      t('workspace.phase1StaffingSuggestFilled', {
        date: end,
        hours: Number(hours),
      })
    );
  };

  const ganttRows = useMemo(
    () =>
      leaves.map((a) => {
        const st = getStructured(a);
        const assignee = assigneeLabel(st, nameByUserId);
        return {
          ...a,
          title: assignee ? `${a.title || '—'} · ${assignee}` : a.title,
          structured: {
            ...st,
            startDate: st.startDate || a.startDate,
            endDate: st.endDate || a.endDate,
          },
        };
      }),
    [leaves, nameByUserId]
  );

  return (
    <div className="space-y-4">
      {fieldError ? (
        <p className="text-sm text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}
      <div className="rounded-2xl border border-border bg-gradient-to-r from-violet-50 via-background to-background p-3 shadow-sm dark:from-violet-950/20 dark:via-surface dark:to-surface">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/20 dark:text-violet-200">
              {t('workspace.phase1StaffingLeafCount', { count: leaves.length })}
            </span>
            {selected ? (
              <span className="rounded-full border border-border bg-background px-2.5 py-1">
                {selected.title}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium"
              onClick={() => setTimelineOpen(true)}
            >
              {t('workspace.phase1PlanningViewTimeline')}
            </button>
            <Link
              to={buildPhase1ModulePath(projectId, 'planning/schedule')}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('workspace.phase1StaffingOpenSiblingSchedule')}
            </Link>
          </div>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {leaves.map((a) => {
          const id = String(a._id || a.id);
          const st = getStructured(a);
          return (
            <li key={id}>
              <button
                type="button"
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:bg-muted/30"
                onClick={() => openLeaf(a)}
              >
                <span className="line-clamp-2 text-sm font-medium">{a.title || '—'}</span>
                <span className="text-[11px] text-muted-foreground">
                  {String(st.startDate || '—').slice(0, 10)} → {String(st.endDate || '—').slice(0, 10)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.externalKey || t('workspace.phaseNavPlanningResourcesSchedule')}
        size="lg"
      >
        {selected ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {selected.externalKey || 'WBS'}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-foreground">{selected.title}</h3>
                </div>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('workspace.phaseNavPlanningResourcesSchedule')}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[11px]">
                  <span className="text-muted-foreground">{t('workspace.phase1StaffingStartDate')}</span>
                  <input
                    type="date"
                    className={INPUT}
                    value={draft.startDate}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                  />
                </label>
                <label className="block text-[11px]">
                  <span className="text-muted-foreground">{t('workspace.phase1StaffingEndDate')}</span>
                  <input
                    type="date"
                    className={INPUT}
                    value={draft.endDate}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {Number(getStructured(selected).effortHours) > 0
                  ? t('workspace.phase1StaffingSuggestHours', {
                      hours: Number(getStructured(selected).effortHours),
                    })
                  : t('workspace.phase1StaffingSuggestNeedEffort')}
              </p>
              {suggestNote ? (
                <p className="text-[11px] text-foreground" role="status">
                  {suggestNote}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-muted/40"
                      onClick={suggestEnd}
                    >
                      {t('workspace.phase1StaffingSuggestEnd')}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
                      disabled={saveMut.isPending}
                      onClick={() => saveMut.mutate()}
                    >
                      {t('common.save')}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        title={t('workspace.phase1GanttTitle')}
        size="xl"
      >
        <PlanningGanttPanel artifacts={ganttRows} kind="WBS" forceExpanded />
      </Modal>
    </div>
  );
}
