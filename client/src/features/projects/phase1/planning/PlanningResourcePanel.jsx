/**
 * RULE-15 — Role / Skill / Effort editor on RESOURCE.structured.
 * Collapsed summary + expandable role cards (declutter list page).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { kindChipClass, statusBadgeClass, formatPhase1StatusLabel } from '../shared/phase1UiTokens';

function emptyRole() {
  return { roleKey: '', title: '', count: 1, skillKeysText: '', effortHours: '', notes: '' };
}

function roleSummaryLine(role) {
  const key = String(role.roleKey || '').trim() || '—';
  const title = String(role.title || '').trim();
  const count = Number(role.count) || 1;
  const hours = role.effortHours === '' || role.effortHours == null ? null : Number(role.effortHours);
  const parts = [`${key}${title && title !== key ? ` · ${title}` : ''}`, `×${count}`];
  if (Number.isFinite(hours)) parts.push(`${hours}h`);
  return parts.join(' · ');
}

function RoleCard({ role, idx, canEdit, expanded, onToggle, onChange, onRemove, canRemove, t }) {
  return (
    <li className="overflow-hidden rounded-xl border border-border/70 bg-surface shadow-sm">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/25"
        onClick={() => onToggle(idx)}
        aria-expanded={expanded}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{roleSummaryLine(role)}</span>
          {!expanded && role.skillKeysText ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {role.skillKeysText}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-border/60 bg-muted/10 px-3 py-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[11px]">
              <span className="text-muted-foreground">{t('workspace.phase1RoleKey')}</span>
              <input
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
                value={role.roleKey}
                disabled={!canEdit}
                onChange={(e) => onChange(idx, { roleKey: e.target.value })}
              />
            </label>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">{t('workspace.phase1RoleTitle')}</span>
              <input
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
                value={role.title}
                disabled={!canEdit}
                onChange={(e) => onChange(idx, { title: e.target.value })}
              />
            </label>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">{t('workspace.phase1RoleCount')}</span>
              <input
                type="number"
                min={1}
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
                value={role.count}
                disabled={!canEdit}
                onChange={(e) => onChange(idx, { count: e.target.value })}
              />
            </label>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">{t('workspace.phase1RoleEffort')}</span>
              <input
                type="number"
                min={0}
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
                value={role.effortHours}
                disabled={!canEdit}
                onChange={(e) => onChange(idx, { effortHours: e.target.value })}
              />
            </label>
            <label className="block text-[11px] sm:col-span-2">
              <span className="text-muted-foreground">{t('workspace.phase1RoleSkills')}</span>
              <input
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
                value={role.skillKeysText}
                disabled={!canEdit}
                placeholder={t('workspace.phase1PlanningFieldSkillKeysPh')}
                onChange={(e) => onChange(idx, { skillKeysText: e.target.value })}
              />
            </label>
            <label className="block text-[11px] sm:col-span-2">
              <span className="text-muted-foreground">{t('workspace.phase1RoleNotes')}</span>
              <input
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
                value={role.notes}
                disabled={!canEdit}
                onChange={(e) => onChange(idx, { notes: e.target.value })}
              />
            </label>
          </div>
          {canEdit && canRemove ? (
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40"
              onClick={() => onRemove(idx)}
            >
              {t('workspace.phase1RemoveRoleRow')}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function PlanningResourcePanel({ projectId, artifact, canEdit, onSaved }) {
  const { t } = useAppStrings();
  const artifactId = String(artifact?.id || artifact?._id || '');
  const [panelOpen, setPanelOpen] = useState(false);
  const [openRoleIdx, setOpenRoleIdx] = useState(null);
  const [roles, setRoles] = useState([emptyRole()]);

  useEffect(() => {
    const raw = Array.isArray(artifact?.structured?.roles) ? artifact.structured.roles : [];
    if (!raw.length) {
      setRoles([emptyRole()]);
      setOpenRoleIdx(null);
      return;
    }
    setRoles(
      raw.map((r) => ({
        roleKey: r.roleKey || '',
        title: r.title || '',
        count: r.count || 1,
        skillKeysText: Array.isArray(r.skillKeys) ? r.skillKeys.join(', ') : '',
        effortHours: r.effortHours != null ? String(r.effortHours) : '',
        notes: r.notes || '',
      }))
    );
    setOpenRoleIdx(null);
  }, [artifactId, artifact?.structured?.roles]);

  const filledRoles = useMemo(
    () => roles.filter((r) => String(r.roleKey || '').trim()),
    [roles]
  );

  const totalEffort = useMemo(() => {
    if (artifact?.structured?.totalEffortHours != null) {
      return Number(artifact.structured.totalEffortHours);
    }
    return filledRoles.reduce((sum, r) => {
      const h = Number(r.effortHours);
      const c = Number(r.count) || 1;
      return sum + (Number.isFinite(h) ? h * c : 0);
    }, 0);
  }, [artifact?.structured?.totalEffortHours, filledRoles]);

  const summaryLine = t('workspace.phase1ResourceRolesSummary', {
    count: filledRoles.length,
    hours: totalEffort,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const structured = {
        ...(artifact?.structured && typeof artifact.structured === 'object'
          ? artifact.structured
          : {}),
        roles: roles
          .filter((r) => r.roleKey.trim())
          .map((r) => ({
            roleKey: r.roleKey.trim(),
            title: r.title.trim() || r.roleKey.trim(),
            count: Number(r.count) || 1,
            skillKeys: r.skillKeysText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            effortHours: r.effortHours === '' ? null : Number(r.effortHours),
            notes: r.notes,
          })),
      };
      return planningAPI.updateArtifact(projectId, artifactId, { structured });
    },
    onSuccess: () => {
      toast.success(t('workspace.phase1ResourceRolesSaved'));
      setPanelOpen(false);
      setOpenRoleIdx(null);
      onSaved?.();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  if (!artifactId) return null;

  const patchRole = (idx, patch) => {
    setRoles((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
        >
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            {t('workspace.phase1ResourceRolesTitle')}
            <span className={kindChipClass('RESOURCE')}>RESOURCE</span>
            <span className={statusBadgeClass(artifact?.status)}>
              {formatPhase1StatusLabel(artifact?.status, t)}
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{summaryLine}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {panelOpen && canEdit ? (
            <button
              type="button"
              className="rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {t('common.save')}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-[11px]"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen
              ? t('workspace.phase1ResourceRolesCollapse')
              : t('workspace.phase1ResourceRolesExpand')}
          </button>
        </div>
      </div>

      {panelOpen ? (
        <div className="space-y-3 px-3 py-3">
          <p className="text-[11px] text-muted-foreground">{t('workspace.phase1ResourceRolesHint')}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {roles.map((role, idx) => (
              <RoleCard
                key={`role-${idx}`}
                role={role}
                idx={idx}
                canEdit={canEdit}
                expanded={openRoleIdx === idx}
                onToggle={(i) => setOpenRoleIdx((cur) => (cur === i ? null : i))}
                onChange={patchRole}
                onRemove={(i) => {
                  setRoles((prev) => prev.filter((_, j) => j !== i));
                  setOpenRoleIdx(null);
                }}
                canRemove={roles.length > 1}
                t={t}
              />
            ))}
          </ul>
          {canEdit ? (
            <button
              type="button"
              className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted/40"
              onClick={() => {
                setRoles((prev) => [...prev, emptyRole()]);
                setOpenRoleIdx(roles.length);
              }}
            >
              {t('workspace.phase1AddRoleRow')}
            </button>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {t('workspace.phase1TotalEffort', { hours: totalEffort })}
          </p>
        </div>
      ) : null}
    </section>
  );
}
