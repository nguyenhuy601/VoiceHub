/**
 * Inline Role / Skill / Effort rows for RESOURCE create/edit form (RULE-15).
 */
export function emptyPlanningRoleDraft() {
  return { roleKey: '', title: '', count: 1, skillKeysText: '', effortHours: '', notes: '' };
}

export function rolesDraftFromStructured(structured) {
  const raw = Array.isArray(structured?.roles) ? structured.roles : [];
  if (!raw.length) return [emptyPlanningRoleDraft()];
  return raw.map((r) => ({
    roleKey: r.roleKey || '',
    title: r.title || '',
    count: r.count != null ? r.count : 1,
    skillKeysText: Array.isArray(r.skillKeys) ? r.skillKeys.join(', ') : '',
    effortHours: r.effortHours != null ? String(r.effortHours) : '',
    notes: r.notes || '',
  }));
}

export function rolesDraftToStructured(rolesDraft = []) {
  return (Array.isArray(rolesDraft) ? rolesDraft : [])
    .filter((r) => String(r?.roleKey || '').trim())
    .map((r) => ({
      roleKey: String(r.roleKey).trim(),
      title: String(r.title || r.roleKey).trim() || String(r.roleKey).trim(),
      count: Math.max(1, Number(r.count) || 1),
      skillKeys: String(r.skillKeysText || '')
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      effortHours: r.effortHours === '' || r.effortHours == null ? null : Number(r.effortHours),
      notes: String(r.notes || '').trim(),
    }));
}

export default function PlanningRolesFormSection({
  rolesDraft,
  setRolesDraft,
  disabled = false,
  t,
}) {
  const updateRow = (idx, patch) => {
    setRolesDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/15 p-2.5">
      <div>
        <p className="text-xs font-semibold text-foreground">
          {t('workspace.phase1PlanningFieldRoles')}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t('workspace.phase1PlanningRolesFormHint')}
        </p>
      </div>
      {(rolesDraft?.length ? rolesDraft : [emptyPlanningRoleDraft()]).map((role, idx) => (
        <div
          key={`role-form-${idx}`}
          className="grid gap-1.5 rounded-md border border-border/50 bg-surface p-2 sm:grid-cols-2"
        >
          <label className="block text-[11px]">
            <span className="text-muted-foreground">{t('workspace.phase1RoleKey')} *</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
              value={role.roleKey}
              disabled={disabled}
              onChange={(e) => updateRow(idx, { roleKey: e.target.value })}
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">{t('workspace.phase1RoleTitle')}</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
              value={role.title}
              disabled={disabled}
              onChange={(e) => updateRow(idx, { title: e.target.value })}
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">{t('workspace.phase1RoleCount')}</span>
            <input
              type="number"
              min={1}
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
              value={role.count}
              disabled={disabled}
              onChange={(e) => updateRow(idx, { count: e.target.value })}
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">{t('workspace.phase1RoleEffort')}</span>
            <input
              type="number"
              min={0}
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
              value={role.effortHours}
              disabled={disabled}
              onChange={(e) => updateRow(idx, { effortHours: e.target.value })}
            />
          </label>
          <label className="block text-[11px] sm:col-span-2">
            <span className="text-muted-foreground">{t('workspace.phase1RoleSkills')}</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
              value={role.skillKeysText}
              disabled={disabled}
              placeholder={t('workspace.phase1PlanningFieldSkillKeysPh')}
              onChange={(e) => updateRow(idx, { skillKeysText: e.target.value })}
            />
          </label>
          <label className="block text-[11px] sm:col-span-2">
            <span className="text-muted-foreground">{t('workspace.phase1RoleNotes')}</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
              value={role.notes}
              disabled={disabled}
              onChange={(e) => updateRow(idx, { notes: e.target.value })}
            />
          </label>
          {!disabled && rolesDraft.length > 1 ? (
            <button
              type="button"
              className="justify-self-start rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
              onClick={() => setRolesDraft((prev) => prev.filter((_, i) => i !== idx))}
            >
              {t('workspace.phase1RemoveRoleRow')}
            </button>
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-xs"
          onClick={() => setRolesDraft((prev) => [...(prev || []), emptyPlanningRoleDraft()])}
        >
          {t('workspace.phase1AddRoleRow')}
        </button>
      ) : null}
    </div>
  );
}
