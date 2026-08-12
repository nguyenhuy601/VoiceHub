import { PROJECT_TYPES } from '../../adminTasks/createProjectSeed';

export default function ProjectWizardStepInfo({ form, patchForm, variant = 'collaborate', t }) {
  const isAdmin = variant === 'admin';
  const label = isAdmin
    ? 'mb-1 block text-xs font-medium text-muted-foreground'
    : 'mb-1 block text-xs font-medium text-white/70';
  const input = isAdmin
    ? 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30'
    : 'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#5865F2]';
  const area = `${input} resize-y min-h-[88px]`;

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`text-base font-semibold ${isAdmin ? 'text-foreground' : 'text-white'}`}>
          {t('adminTasks.wizardStepInfo') || 'Project Info'}
        </h3>
        <p className={`mt-1 text-sm ${isAdmin ? 'text-muted-foreground' : 'text-white/60'}`}>
          {t('adminTasks.wizardStepInfoHint') || 'Tên, mô tả và loại dự án.'}
        </p>
      </div>

      <label className="block">
        <span className={label}>{t('adminTasks.createFieldTitle')}</span>
        <input
          className={input}
          value={form.title}
          onChange={(e) => patchForm({ title: e.target.value })}
          placeholder={t('adminTasks.createFieldTitle')}
          required
          autoFocus
        />
      </label>

      <label className="block">
        <span className={label}>{t('adminTasks.createFieldDesc')}</span>
        <textarea
          className={area}
          rows={4}
          value={form.description}
          onChange={(e) => patchForm({ description: e.target.value })}
          placeholder={t('adminTasks.createFieldDesc')}
        />
      </label>

      <label className="block">
        <span className={label}>{t('adminTasks.wizardProjectType') || 'Loại dự án'}</span>
        <select
          className={input}
          value={form.projectType}
          onChange={(e) => patchForm({ projectType: e.target.value })}
        >
          {PROJECT_TYPES.map((v) => (
            <option key={v} value={v} className={isAdmin ? undefined : 'bg-slate-900'}>
              {v}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
