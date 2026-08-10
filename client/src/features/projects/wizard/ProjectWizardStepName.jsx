import { PROJECT_TYPES } from '../../adminTasks/createProjectSeed';
import { buildProjectCodeBase } from '../../../utils/projectCodeGenerate';
import { wizardUi } from './projectWizardUi';

export default function ProjectWizardStepName({ form, patchForm, t }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className={wizardUi.title}>
          {t('adminTasks.wizardNameTitle') || 'Đặt tên dự án'}
        </h1>
        <p className={wizardUi.subtitle}>
          {t('adminTasks.wizardNameHint') || 'Đặt tên và mô tả dự án. Bạn có thể đổi sau.'}
        </p>
      </div>

      <label className="block">
        <span className={wizardUi.fieldLabel}>{t('adminTasks.createFieldTitle')}</span>
        <input
          className={wizardUi.input}
          value={form.title}
          onChange={(e) => patchForm({ title: e.target.value })}
          placeholder={t('adminTasks.createFieldTitle')}
          autoFocus
        />
      </label>

      <label className="block">
        <span className={wizardUi.fieldLabel}>{t('adminTasks.createFieldDesc')}</span>
        <textarea
          className={wizardUi.textarea}
          rows={4}
          value={form.description}
          onChange={(e) => patchForm({ description: e.target.value })}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={wizardUi.fieldLabel}>
            {t('adminTasks.wizardProjectType') || 'Loại dự án'}
          </span>
          <select
            className={wizardUi.select}
            value={form.projectType}
            onChange={(e) => patchForm({ projectType: e.target.value })}
          >
            {PROJECT_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={wizardUi.fieldLabel}>{t('adminTasks.createFieldCode')}</span>
          <input
            className={wizardUi.input}
            value={form.projectCode}
            onChange={(e) => patchForm({ projectCode: e.target.value })}
            placeholder={
              form.title?.trim()
                ? buildProjectCodeBase({ title: form.title })
                : t('adminTasks.createFieldCode')
            }
          />
        </label>
      </div>
    </div>
  );
}
