import { PROJECT_TYPES, PROJECT_CATEGORIES, PROJECT_PRIORITIES } from '../../adminTasks/createProjectSeed';
import { buildProjectCodeBase } from '../../../utils/projectCodeGenerate';
import { wizardUi } from './projectWizardUi';

/** Step Identity — Phase 1 project birth (no board setup). */
export default function ProjectWizardStepName({ form, patchForm, t }) {
  const category = form.category === 'customer' ? 'customer' : 'internal';

  return (
    <div className="space-y-5">
      <div>
        <h1 className={wizardUi.title}>
          {t('adminTasks.wizardIdentityTitle')}
        </h1>
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
          rows={3}
          value={form.description}
          onChange={(e) => patchForm({ description: e.target.value })}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={wizardUi.fieldLabel}>
            {t('adminTasks.wizardProjectType')}
          </span>
          <select
            className={wizardUi.select}
            value={form.projectType}
            onChange={(e) => patchForm({ projectType: e.target.value })}
          >
            {PROJECT_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`workspace.projectHubProjectType_${v}`)}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={wizardUi.fieldLabel}>{t('adminTasks.wizardCategory')}</span>
          <select
            className={wizardUi.select}
            value={category}
            onChange={(e) => patchForm({ category: e.target.value })}
          >
            {PROJECT_CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {t(`workspace.projectHubCategory_${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={wizardUi.fieldLabel}>{t('adminTasks.wizardPriority')}</span>
          <select
            className={wizardUi.select}
            value={form.priority || 'medium'}
            onChange={(e) => patchForm({ priority: e.target.value })}
          >
            {PROJECT_PRIORITIES.map((v) => (
              <option key={v} value={v}>
                {t(`workspace.projectHubProjectPriority_${v}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {category === 'customer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={wizardUi.fieldLabel}>
              {t('adminTasks.wizardCustomerName')}
            </span>
            <input
              className={wizardUi.input}
              value={form.customerName || ''}
              onChange={(e) => patchForm({ customerName: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={wizardUi.fieldLabel}>
              {t('adminTasks.wizardCustomerCompany')}
            </span>
            <input
              className={wizardUi.input}
              value={form.customerCompany || ''}
              onChange={(e) => patchForm({ customerCompany: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={wizardUi.fieldLabel}>{t('adminTasks.wizardStartDate')}</span>
          <input
            type="date"
            className={wizardUi.input}
            value={form.startDate || ''}
            onChange={(e) => patchForm({ startDate: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={wizardUi.fieldLabel}>{t('adminTasks.wizardDueDate')}</span>
          <input
            type="date"
            className={wizardUi.input}
            value={form.dueDate || ''}
            onChange={(e) => patchForm({ dueDate: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
