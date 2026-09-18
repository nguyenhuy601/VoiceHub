import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';

function emptyRole() {
  return { roleKey: '', title: '', count: 1, skillKeysText: '', effortHours: '', notes: '' };
}

/**
 * RULE-15 — Role / Skill / Effort editor trên RESOURCE.structured.
 */
export default function PlanningResourcePanel({ projectId, artifact, canEdit, onSaved }) {
  const { t } = useAppStrings();
  const artifactId = String(artifact?.id || artifact?._id || '');
  const [roles, setRoles] = useState([emptyRole()]);

  useEffect(() => {
    const raw = Array.isArray(artifact?.structured?.roles) ? artifact.structured.roles : [];
    if (!raw.length) {
      setRoles([emptyRole()]);
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
  }, [artifactId, artifact?.structured?.roles]);

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
      onSaved?.();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  if (!artifactId) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t('workspace.phase1ResourceRolesTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('workspace.phase1ResourceRolesHint')}</p>
        </div>
        {canEdit ? (
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {t('common.save')}
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {roles.map((role, idx) => (
          <div
            key={`role-${idx}`}
            className="grid gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-2 lg:grid-cols-6"
          >
            <input
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              placeholder={t('workspace.phase1RoleKey')}
              value={role.roleKey}
              disabled={!canEdit}
              onChange={(e) =>
                setRoles((prev) =>
                  prev.map((r, i) => (i === idx ? { ...r, roleKey: e.target.value } : r))
                )
              }
            />
            <input
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              placeholder={t('workspace.phase1RoleTitle')}
              value={role.title}
              disabled={!canEdit}
              onChange={(e) =>
                setRoles((prev) =>
                  prev.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r))
                )
              }
            />
            <input
              type="number"
              min={1}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              placeholder={t('workspace.phase1RoleCount')}
              value={role.count}
              disabled={!canEdit}
              onChange={(e) =>
                setRoles((prev) =>
                  prev.map((r, i) => (i === idx ? { ...r, count: e.target.value } : r))
                )
              }
            />
            <input
              className="rounded border border-border bg-background px-2 py-1 text-xs lg:col-span-2"
              placeholder={t('workspace.phase1RoleSkills')}
              value={role.skillKeysText}
              disabled={!canEdit}
              onChange={(e) =>
                setRoles((prev) =>
                  prev.map((r, i) => (i === idx ? { ...r, skillKeysText: e.target.value } : r))
                )
              }
            />
            <input
              type="number"
              min={0}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              placeholder={t('workspace.phase1RoleEffort')}
              value={role.effortHours}
              disabled={!canEdit}
              onChange={(e) =>
                setRoles((prev) =>
                  prev.map((r, i) => (i === idx ? { ...r, effortHours: e.target.value } : r))
                )
              }
            />
          </div>
        ))}
      </div>
      {canEdit ? (
        <button
          type="button"
          className="mt-2 rounded border border-border px-2 py-1 text-xs"
          onClick={() => setRoles((prev) => [...prev, emptyRole()])}
        >
          {t('workspace.phase1AddRoleRow')}
        </button>
      ) : null}
      {artifact?.structured?.totalEffortHours != null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('workspace.phase1TotalEffort', {
            hours: artifact.structured.totalEffortHours,
          })}
        </p>
      ) : null}
    </div>
  );
}
