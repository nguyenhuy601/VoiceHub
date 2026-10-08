import { PROJECT_CATEGORIES, PROJECT_PRIORITIES } from '../../adminTasks/createProjectSeed';
import { buildProjectCodeBase } from '../../../utils/projectCodeGenerate';
import { intakeUi } from './intakeUi';
import IntakeSection from './IntakeSection';

export default function ProjectInformationSection({
  form,
  patchForm,
  fieldErrors,
  showErrors,
  sectionMeta,
  t,
}) {
  const category = form.category === 'customer' ? 'customer' : 'internal';
  const sectionStatus =
    sectionMeta?.hint === 'error' ? 'error' : sectionMeta?.complete ? 'complete' : 'pending';

  return (
    <IntakeSection
      index={2}
      sectionId="intake-section-information"
      title={t('adminTasks.intakeSectionInformation') || 'Project information'}
      status={sectionStatus}
      t={t}
    >
      <div className="space-y-4">
        <label className="block" id="intake-field-title">
          <span className={intakeUi.fieldLabel}>
            {t('adminTasks.createFieldTitle')}
            <span className="ml-0.5 text-destructive">*</span>
          </span>
          <input
            className={`${intakeUi.input} ${showErrors && fieldErrors.title ? intakeUi.inputError : ''}`}
            value={form.title}
            onChange={(e) => patchForm({ title: e.target.value })}
            placeholder={t('adminTasks.createFieldTitle')}
          />
          {showErrors && fieldErrors.title ? (
            <p className={intakeUi.fieldError}>{fieldErrors.title}</p>
          ) : null}
        </label>

        <label className="block">
          <span className={intakeUi.fieldLabel}>{t('adminTasks.createFieldCode')}</span>
          <input
            className={intakeUi.input}
            value={form.projectCode}
            onChange={(e) => patchForm({ projectCode: e.target.value })}
            placeholder={
              form.title?.trim()
                ? buildProjectCodeBase({ title: form.title })
                : t('adminTasks.createFieldCode')
            }
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={intakeUi.fieldLabel}>
              {t('adminTasks.wizardCategory') || 'Phân loại'}
            </span>
            <select
              className={intakeUi.select}
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
            <span className={intakeUi.fieldLabel}>
              {t('adminTasks.wizardPriority') || 'Ưu tiên'}
            </span>
            <select
              className={intakeUi.select}
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
          <label className="block" id="intake-field-customerName">
            <span className={intakeUi.fieldLabel}>
              {t('adminTasks.wizardCustomerName') || 'Khách hàng'}
              <span className="ml-0.5 text-destructive">*</span>
            </span>
            <input
              className={`${intakeUi.input} ${
                showErrors && fieldErrors.customerName ? intakeUi.inputError : ''
              }`}
              value={form.customerName || ''}
              onChange={(e) => patchForm({ customerName: e.target.value })}
            />
            {showErrors && fieldErrors.customerName ? (
              <p className={intakeUi.fieldError}>{fieldErrors.customerName}</p>
            ) : null}
          </label>
        ) : null}

        <label className="block">
          <span className={intakeUi.fieldLabel}>{t('adminTasks.createFieldDesc')}</span>
          <textarea
            className={intakeUi.textarea}
            rows={3}
            value={form.description}
            onChange={(e) => patchForm({ description: e.target.value })}
          />
        </label>

        <div id="intake-field-dateRange">
          <p className={intakeUi.fieldLabel}>
            {t('adminTasks.intakeTimeline') || 'Project timeline'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">
                {t('adminTasks.wizardStartDate') || 'Ngày bắt đầu'}
              </span>
              <input
                type="date"
                className={`${intakeUi.input} ${
                  showErrors && fieldErrors.dateRange ? intakeUi.inputError : ''
                }`}
                value={form.startDate || ''}
                onChange={(e) => patchForm({ startDate: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">
                {t('adminTasks.wizardDueDate') || 'Hạn'}
              </span>
              <input
                type="date"
                className={`${intakeUi.input} ${
                  showErrors && fieldErrors.dateRange ? intakeUi.inputError : ''
                }`}
                value={form.dueDate || ''}
                onChange={(e) => patchForm({ dueDate: e.target.value })}
              />
            </label>
          </div>
          {showErrors && fieldErrors.dateRange ? (
            <p className={intakeUi.fieldError}>{fieldErrors.dateRange}</p>
          ) : null}
        </div>
      </div>
    </IntakeSection>
  );
}
