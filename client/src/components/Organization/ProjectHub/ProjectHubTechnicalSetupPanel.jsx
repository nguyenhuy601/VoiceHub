import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

function emptyForm() {
  return {
    repository: { url: '', provider: '', defaultBranch: 'main' },
    stack: { languages: '', frameworks: '', databases: '' },
    environments: [{ key: 'dev', name: 'Dev', url: '' }],
    infrastructure: { notes: '', cloudProvider: '' },
    cicd: { provider: '', pipelineUrl: '', notes: '' },
    deployment: { strategy: '', target: '', notes: '' },
    completedAt: null,
  };
}

function listToCsv(arr) {
  return (Array.isArray(arr) ? arr : []).join(', ');
}

function csvToList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function fromApi(data) {
  const d = data || {};
  return {
    repository: {
      url: d.repository?.url || '',
      provider: d.repository?.provider || '',
      defaultBranch: d.repository?.defaultBranch || 'main',
    },
    stack: {
      languages: listToCsv(d.stack?.languages),
      frameworks: listToCsv(d.stack?.frameworks),
      databases: listToCsv(d.stack?.databases),
    },
    environments:
      Array.isArray(d.environments) && d.environments.length
        ? d.environments.map((e) => ({
            key: e.key || 'custom',
            name: e.name || '',
            url: e.url || '',
          }))
        : [{ key: 'dev', name: 'Dev', url: '' }],
    infrastructure: {
      notes: d.infrastructure?.notes || '',
      cloudProvider: d.infrastructure?.cloudProvider || '',
    },
    cicd: {
      provider: d.cicd?.provider || '',
      pipelineUrl: d.cicd?.pipelineUrl || '',
      notes: d.cicd?.notes || '',
    },
    deployment: {
      strategy: d.deployment?.strategy || '',
      target: d.deployment?.target || '',
      notes: d.deployment?.notes || '',
    },
    completedAt: d.completedAt || null,
  };
}

function toPayload(form) {
  return {
    repository: form.repository,
    stack: {
      languages: csvToList(form.stack.languages),
      frameworks: csvToList(form.stack.frameworks),
      databases: csvToList(form.stack.databases),
    },
    environments: form.environments,
    infrastructure: form.infrastructure,
    cicd: form.cicd,
    deployment: form.deployment,
  };
}

/**
 * G2 — Technical Setup form trong Project Hub.
 */
export default function ProjectHubTechnicalSetupPanel({
  projectId = '',
  canManage = false,
  isDarkMode = false,
  projectStatus = '',
  onCompleted,
}) {
  const { t } = useAppStrings();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
  const sectionCls = 'rounded-xl border border-border bg-surface p-4';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await projectAPI.getTechnicalSetup(projectId);
        const data = res?.data?.data ?? res?.data ?? null;
        if (!cancelled) setForm(fromApi(data));
      } catch {
        if (!cancelled) setForm(emptyForm());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const setRepo = (key, value) =>
    setForm((f) => ({ ...f, repository: { ...f.repository, [key]: value } }));
  const setStack = (key, value) =>
    setForm((f) => ({ ...f, stack: { ...f.stack, [key]: value } }));
  const setInfra = (key, value) =>
    setForm((f) => ({ ...f, infrastructure: { ...f.infrastructure, [key]: value } }));
  const setCicd = (key, value) =>
    setForm((f) => ({ ...f, cicd: { ...f.cicd, [key]: value } }));
  const setDeploy = (key, value) =>
    setForm((f) => ({ ...f, deployment: { ...f.deployment, [key]: value } }));

  const updateEnv = (index, key, value) => {
    setForm((f) => {
      const environments = f.environments.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      );
      return { ...f, environments };
    });
  };

  const addEnv = () => {
    setForm((f) => ({
      ...f,
      environments: [...f.environments, { key: 'custom', name: '', url: '' }],
    }));
  };

  const removeEnv = (index) => {
    setForm((f) => ({
      ...f,
      environments: f.environments.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canManage || saving || !projectId) return;
    setSaving(true);
    try {
      const res = await projectAPI.putTechnicalSetup(projectId, toPayload(form));
      const data = res?.data?.data ?? res?.data;
      setForm(fromApi(data));
      toast.success(t('workspace.projectHubSetupSaved'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubSetupSaveFail') })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!canManage || completing || !projectId) return;
    setCompleting(true);
    try {
      await projectAPI.putTechnicalSetup(projectId, toPayload(form));
      const res = await projectAPI.completeTechnicalSetup(projectId);
      const data = res?.data?.data ?? res?.data;
      if (data?.technicalSetup) setForm(fromApi(data.technicalSetup));
      toast.success(t('workspace.projectHubSetupCompleted'));
      onCompleted?.(data?.status || 'ready_for_planning');
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubSetupCompleteFail') })
      );
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className={`px-4 py-8 text-center text-sm ${muted}`}>
        {t('workspace.projectHubSetupLoading')}
      </div>
    );
  }

  return (
    <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className={`text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabSetup')}</h3>
          <p className={`text-xs ${muted}`}>{t('workspace.projectHubSetupHint')}</p>
          {form.completedAt || projectStatus === 'ready_for_planning' ? (
            <p className="mt-1 text-[11px] font-semibold text-emerald-600">
              {t('workspace.projectHubSetupDoneBadge')}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
            >
              {saving ? '…' : t('workspace.projectHubSetupSave')}
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              {completing ? '…' : t('workspace.projectHubSetupComplete')}
            </button>
          </div>
        ) : null}
      </div>

      {!canManage ? (
        <p className={`mb-3 text-xs ${muted}`}>{t('workspace.projectHubSetupDenied')}</p>
      ) : null}

      <form onSubmit={handleSave} className="space-y-3">
        <section className={sectionCls}>
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubSetupRepo')}
          </p>
          <label className={`block text-xs ${muted}`}>
            URL
            <input
              className={inputCls}
              value={form.repository.url}
              onChange={(e) => setRepo('url', e.target.value)}
              disabled={!canManage}
              placeholder="https://github.com/org/repo"
            />
          </label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={`block text-xs ${muted}`}>
              Provider
              <input
                className={inputCls}
                value={form.repository.provider}
                onChange={(e) => setRepo('provider', e.target.value)}
                disabled={!canManage}
                placeholder="github / gitlab"
              />
            </label>
            <label className={`block text-xs ${muted}`}>
              Default branch
              <input
                className={inputCls}
                value={form.repository.defaultBranch}
                onChange={(e) => setRepo('defaultBranch', e.target.value)}
                disabled={!canManage}
              />
            </label>
          </div>
        </section>

        <section className={sectionCls}>
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubSetupStack')}
          </p>
          <label className={`block text-xs ${muted}`}>
            Languages (comma)
            <input
              className={inputCls}
              value={form.stack.languages}
              onChange={(e) => setStack('languages', e.target.value)}
              disabled={!canManage}
            />
          </label>
          <label className={`mt-2 block text-xs ${muted}`}>
            Frameworks
            <input
              className={inputCls}
              value={form.stack.frameworks}
              onChange={(e) => setStack('frameworks', e.target.value)}
              disabled={!canManage}
            />
          </label>
          <label className={`mt-2 block text-xs ${muted}`}>
            Databases
            <input
              className={inputCls}
              value={form.stack.databases}
              onChange={(e) => setStack('databases', e.target.value)}
              disabled={!canManage}
            />
          </label>
        </section>

        <section className={sectionCls}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
              {t('workspace.projectHubSetupEnvs')}
            </p>
            {canManage ? (
              <button
                type="button"
                onClick={addEnv}
                className="text-[11px] font-semibold text-primary"
              >
                + Env
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            {form.environments.map((env, index) => (
              <div key={`env-${index}`} className="grid gap-2 sm:grid-cols-[100px_1fr_1fr_auto]">
                <select
                  className={inputCls}
                  value={env.key}
                  onChange={(e) => updateEnv(index, 'key', e.target.value)}
                  disabled={!canManage}
                >
                  <option value="dev">dev</option>
                  <option value="staging">staging</option>
                  <option value="prod">prod</option>
                  <option value="custom">custom</option>
                </select>
                <input
                  className={inputCls}
                  value={env.name}
                  onChange={(e) => updateEnv(index, 'name', e.target.value)}
                  disabled={!canManage}
                  placeholder="Name"
                />
                <input
                  className={inputCls}
                  value={env.url}
                  onChange={(e) => updateEnv(index, 'url', e.target.value)}
                  disabled={!canManage}
                  placeholder="https://…"
                />
                {canManage && form.environments.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeEnv(index)}
                    className="text-xs text-destructive"
                  >
                    ×
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className={sectionCls}>
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubSetupInfra')}
          </p>
          <label className={`block text-xs ${muted}`}>
            Cloud
            <input
              className={inputCls}
              value={form.infrastructure.cloudProvider}
              onChange={(e) => setInfra('cloudProvider', e.target.value)}
              disabled={!canManage}
            />
          </label>
          <label className={`mt-2 block text-xs ${muted}`}>
            Notes
            <textarea
              className={`${inputCls} min-h-[72px]`}
              value={form.infrastructure.notes}
              onChange={(e) => setInfra('notes', e.target.value)}
              disabled={!canManage}
            />
          </label>
        </section>

        <section className={sectionCls}>
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubSetupCicd')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`block text-xs ${muted}`}>
              Provider
              <input
                className={inputCls}
                value={form.cicd.provider}
                onChange={(e) => setCicd('provider', e.target.value)}
                disabled={!canManage}
              />
            </label>
            <label className={`block text-xs ${muted}`}>
              Pipeline URL
              <input
                className={inputCls}
                value={form.cicd.pipelineUrl}
                onChange={(e) => setCicd('pipelineUrl', e.target.value)}
                disabled={!canManage}
              />
            </label>
          </div>
          <label className={`mt-2 block text-xs ${muted}`}>
            Notes
            <textarea
              className={`${inputCls} min-h-[64px]`}
              value={form.cicd.notes}
              onChange={(e) => setCicd('notes', e.target.value)}
              disabled={!canManage}
            />
          </label>
        </section>

        <section className={sectionCls}>
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubSetupDeploy')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`block text-xs ${muted}`}>
              Strategy
              <input
                className={inputCls}
                value={form.deployment.strategy}
                onChange={(e) => setDeploy('strategy', e.target.value)}
                disabled={!canManage}
                placeholder="rolling / blue-green"
              />
            </label>
            <label className={`block text-xs ${muted}`}>
              Target
              <input
                className={inputCls}
                value={form.deployment.target}
                onChange={(e) => setDeploy('target', e.target.value)}
                disabled={!canManage}
              />
            </label>
          </div>
          <label className={`mt-2 block text-xs ${muted}`}>
            Notes
            <textarea
              className={`${inputCls} min-h-[64px]`}
              value={form.deployment.notes}
              onChange={(e) => setDeploy('notes', e.target.value)}
              disabled={!canManage}
            />
          </label>
        </section>
      </form>
    </div>
  );
}
