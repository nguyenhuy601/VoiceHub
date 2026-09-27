import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../../../../components/Shared/Modal';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import PlanningResourcePanel from './PlanningResourcePanel';
import {
  assessEffortReadiness,
  effortDelta,
  getStructured,
  hoursToManday,
  isWbsLeaf,
} from './staffingPipelineModel';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const INPUT =
  'mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60';

/**
 * Step 2 — Effort Estimation (2a description · 2b role/skill · 2c hours/manday).
 */
export default function PlanningResourcesEffortPanel({ projectId }) {
  const { t } = useAppStrings();
  const [fieldError, setFieldError] = useState('');
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const canEdit = Boolean(capabilities.canEditPlanning);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);

  const wbsQ = useQuery({
    queryKey: ['planningArtifacts', projectId, 'WBS'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'WBS' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const resQ = useQuery({
    queryKey: ['planningArtifacts', projectId, 'RESOURCE'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'RESOURCE' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const leaves = useMemo(() => {
    const list = Array.isArray(wbsQ.data) ? wbsQ.data : [];
    return list.filter((a) => isWbsLeaf(a, list));
  }, [wbsQ.data]);

  const delta = useMemo(
    () => effortDelta(wbsQ.data || [], resQ.data || []),
    [wbsQ.data, resQ.data]
  );

  const selected = useMemo(
    () => leaves.find((a) => String(a._id || a.id) === String(selectedId || '')) || null,
    [leaves, selectedId]
  );

  const openLeaf = (a) => {
    const id = String(a._id || a.id);
    setSelectedId(id);
    const st = getStructured(a);
    setDraft({
      title: String(a.title || ''),
      notes: String(st.notes || a.summary || ''),
      roleKey: String(st.roleKey || ''),
      skillKeysText: Array.isArray(st.skillKeys) ? st.skillKeys.join(', ') : '',
      effortHours: st.effortHours != null && Number.isFinite(Number(st.effortHours))
        ? String(st.effortHours)
        : '',
    });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selected || !draft) return;
      const rawEffort = draft.effortHours;
      const effortHours =
        rawEffort === '' || rawEffort == null
          ? undefined
          : Number.isFinite(Number(rawEffort))
            ? Number(rawEffort)
            : rawEffort;
      const skillKeys = draft.skillKeysText
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const structured = {
        ...getStructured(selected),
        notes: draft.notes.trim(),
        roleKey: draft.roleKey.trim(),
        skillKeys,
      };
      if (effortHours === undefined) delete structured.effortHours;
      else structured.effortHours = effortHours;
      return unwrap(
        await planningAPI.updateArtifact(projectId, selected._id || selected.id, {
          title: draft.title.trim() || selected.title,
          structured,
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

  const readiness = selected && draft
    ? assessEffortReadiness({
        title: draft.title,
        structured: {
          notes: draft.notes,
          roleKey: draft.roleKey,
          skillKeys: draft.skillKeysText.split(/[,;]+/).map((s) => s.trim()).filter(Boolean),
          effortHours: draft.effortHours === '' ? null : Number(draft.effortHours),
        },
      })
    : null;

  const mandayDisplay =
    draft && draft.effortHours !== '' && Number.isFinite(Number(draft.effortHours))
      ? hoursToManday(Number(draft.effortHours))
      : null;

  const primaryResource = Array.isArray(resQ.data) && resQ.data.length ? resQ.data[0] : null;

  return (
    <div className="space-y-3">
      {fieldError ? (
        <p className="text-sm text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}
      <div className="rounded-2xl border border-border bg-gradient-to-r from-amber-50 via-background to-background p-3 shadow-sm dark:from-amber-950/20 dark:via-surface dark:to-surface">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
            {t('workspace.phase1StaffingLeafCount', { count: leaves.length })}
          </span>
          {delta.warn ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-100">
              {t('workspace.phase1StaffingDeltaShort', { delta: delta.deltaHours ?? 0 })}
            </span>
          ) : (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-200">
              {t('workspace.phase1StaffingBalanced')}
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t('workspace.phase1StaffingEffortIntro')}</p>
      {delta.warn ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {t('workspace.phase1StaffingEffortDeltaWarn', {
            wbs: delta.wbsSum,
            resource: delta.resourceSum,
            delta: delta.deltaHours,
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('workspace.phase1StaffingEffortDeltaOk', {
            wbs: delta.wbsSum,
            resource: delta.resourceSum,
          })}
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {leaves.map((a) => {
          const id = String(a._id || a.id);
          const r = assessEffortReadiness(a);
          return (
            <li key={id}>
              <button
                type="button"
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:bg-muted/30"
                onClick={() => openLeaf(a)}
              >
                <span className="line-clamp-2 text-sm font-medium text-foreground">{a.title || '—'}</span>
                <span className="text-[11px] text-muted-foreground">
                  {[
                    r.hasDescription ? '2a✓' : '2a·',
                    r.hasRoleOrSkill ? '2b✓' : '2b·',
                    r.hasEffort ? `2c ${r.effortHours}h / ${r.manday}d` : '2c·',
                  ].join('  ')}
                </span>
              </button>
            </li>
          );
        })}
        {!leaves.length && !wbsQ.isLoading ? (
          <li className="rounded-xl border border-dashed border-border bg-muted/15 px-3 py-6 text-center text-xs text-muted-foreground sm:col-span-2">
            {t('workspace.phase1StaffingWbsEmpty')}
          </li>
        ) : null}
      </ul>

      <Modal
        isOpen={Boolean(selected && draft)}
        onClose={() => {
          setSelectedId(null);
          setDraft(null);
        }}
        title={selected?.externalKey || t('workspace.phaseNavPlanningResourcesEffort')}
        size="lg"
      >
        {selected && draft ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {selected.externalKey || 'WBS'}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-foreground">{selected.title || '—'}</h3>
                </div>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('workspace.phaseNavPlanningResourcesEffort')}
                </span>
              </div>

              <section className="rounded-xl border border-border bg-background p-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  2a · {t('workspace.phase1StaffingStep2a')}
                </h3>
                <label className="mt-2 block text-[11px]">
                  <span className="text-muted-foreground">{t('common.title')}</span>
                  <input
                    className={INPUT}
                    value={draft.title}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </label>
                <label className="mt-2 block text-[11px]">
                  <span className="text-muted-foreground">{t('workspace.phase1StaffingNotes')}</span>
                  <textarea
                    className={`${INPUT} min-h-[4rem]`}
                    value={draft.notes}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  />
                </label>
              </section>
              <section className="rounded-xl border border-border bg-background p-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  2b · {t('workspace.phase1StaffingStep2b')}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px]">
                    <span className="text-muted-foreground">{t('workspace.phase1RoleKey')}</span>
                    <input
                      className={INPUT}
                      value={draft.roleKey}
                      disabled={!canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, roleKey: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[11px]">
                    <span className="text-muted-foreground">{t('workspace.phase1StaffingSkills')}</span>
                    <input
                      className={INPUT}
                      value={draft.skillKeysText}
                      disabled={!canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, skillKeysText: e.target.value }))}
                      placeholder="react, node, …"
                    />
                  </label>
                </div>
              </section>
              <section className="rounded-xl border border-border bg-background p-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  2c · {t('workspace.phase1StaffingStep2c')}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px]">
                    <span className="text-muted-foreground">{t('workspace.phase1StaffingEffortHours')}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className={INPUT}
                      value={draft.effortHours}
                      disabled={!canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, effortHours: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[11px]">
                    <span className="text-muted-foreground">{t('workspace.phase1StaffingManday')}</span>
                    <input className={INPUT} value={mandayDisplay ?? '—'} readOnly disabled />
                  </label>
                </div>
                {readiness ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {readiness.readyForMatch
                      ? t('workspace.phase1StaffingReadyForMatch')
                      : t('workspace.phase1StaffingNotReadyForMatch')}
                  </p>
                ) : null}
              </section>
              {canEdit ? (
                <button
                  type="button"
                  className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
                  disabled={saveMut.isPending}
                  onClick={() => saveMut.mutate()}
                >
                  {t('common.save')}
                </button>
              ) : null}
            </div>
        ) : null}
      </Modal>

      {primaryResource ? (
        <details className="rounded-xl border border-border bg-surface p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('workspace.phase1StaffingResourceRoles')}
          </summary>
          <div className="mt-3">
            <PlanningResourcePanel
              projectId={projectId}
              artifact={primaryResource}
              canEdit={canEdit}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
