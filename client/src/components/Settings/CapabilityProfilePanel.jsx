import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GradientButton } from '../Shared';
import userService from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { mergeAuthUserFromProfile, unwrapApiData } from '../../utils/helpers';
import {
  FIGMA_SETTINGS_CARD,
  FIGMA_SETTINGS_INPUT,
} from './figmaSettingsClasses';
import {
  AVAILABILITY_VALUES,
  MAX_SKILLS,
  PRIMARY_DOMAINS,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_WHITELIST,
  SUMMARY_MAX_LEN,
  YEARS_EXPERIENCE_MAX,
  canSubmitCapability,
  capabilityFromApi,
  emptyCapabilityForm,
  toCapabilityPayload,
} from '../../constants/capabilityCatalog';

const STATUS_BADGE = {
  draft: 'bg-muted text-muted-foreground',
  pending_hr: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  verified: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-destructive/15 text-destructive',
};

function readJobTitle(profile) {
  return String(profile?.preferences?.jobTitle || profile?.jobTitle || '').trim();
}

/**
 * Form năng lực C1 — PATCH /users/me save_draft | submit.
 * Position = jobTitle công ty (SoT, read-only); không dùng positionCode.
 */
export default function CapabilityProfilePanel() {
  const { t } = useAppStrings();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => emptyCapabilityForm());
  const [jobTitle, setJobTitle] = useState('');
  const [status, setStatus] = useState('draft');
  const [capSource, setCapSource] = useState('manual');
  const [rejectReason, setRejectReason] = useState('');
  const [resourceStatus, setResourceStatus] = useState('verified');
  const [resourceRejectReason, setResourceRejectReason] = useState('');
  const [maxConcurrentProjects, setMaxConcurrentProjects] = useState(2);
  const [serverMaxConcurrentProjects, setServerMaxConcurrentProjects] = useState(2);
  const [cvFileName, setCvFileName] = useState('');
  const [skillToAdd, setSkillToAdd] = useState('');

  const availableSkills = useMemo(() => {
    const taken = new Set((form.skills || []).map((s) => s.name));
    return SKILL_WHITELIST.filter((name) => !taken.has(name));
  }, [form.skills]);

  const applyServerCapability = useCallback(
    (profile) => {
      const parsed = capabilityFromApi(profile?.capability);
      setForm({
        primaryDomain: parsed.primaryDomain,
        yearsExperience: parsed.yearsExperience,
        skills: parsed.skills,
        availability: parsed.availability,
        summary: parsed.summary,
        projectExperiences: parsed.projectExperiences || [],
      });
      setJobTitle(readJobTitle(profile));
      setStatus(parsed.verificationStatus || 'draft');
      setCapSource(parsed.source || 'manual');
      setRejectReason(parsed.rejectReason || '');
      setCvFileName(parsed.cvFileName || '');

      const rc = profile?.resourceConfig || {};
      const rcStatus = rc.verificationStatus || 'verified';
      setResourceStatus(rcStatus);
      setResourceRejectReason(rc.rejectReason || '');

      const max = Number(rc.maxConcurrentProjects);
      const nextMax = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 2;
      setMaxConcurrentProjects(nextMax);
      setServerMaxConcurrentProjects(nextMax);
      if (typeof updateUser === 'function' && profile) {
        updateUser(mergeAuthUserFromProfile(user, profile));
      }
    },
    [updateUser, user]
  );

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getMe();
      const profile = unwrapApiData(res) || res;
      applyServerCapability(profile);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('settingsCapability.loadFail') })
      );
    } finally {
      setLoading(false);
    }
  }, [t, applyServerCapability]);

  useEffect(() => {
    hydrate();
    // chỉ hydrate khi mount tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmExperience = async (evidenceBoardId) => {
    const boardId = String(evidenceBoardId || '').trim();
    if (saving || !boardId) return;
    setSaving(true);
    try {
      const res = await userService.updateProfile({
        capabilityAction: 'confirm_experience',
        evidenceBoardId: boardId,
      });
      const profile = unwrapApiData(res) || res;
      applyServerCapability(profile);
      toast.success(t('settingsCapability.confirmOk'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('settingsCapability.confirmFail') })
      );
    } finally {
      setSaving(false);
    }
  };

  const persist = async (capabilityAction) => {
    if (saving) return;
    if (capabilityAction === 'submit' && !canSubmitCapability(form, { jobTitle })) {
      toast.error(
        jobTitle
          ? t('settingsCapability.submitIncomplete')
          : t('settingsCapability.submitNeedJobTitle')
      );
      return;
    }
    setSaving(true);
    try {
      const payload = {
        capabilityAction,
        capability: toCapabilityPayload(form),
      };

      if (maxConcurrentProjects !== serverMaxConcurrentProjects) {
        payload.resourceConfigAction = 'save';
        payload.resourceConfig = { maxConcurrentProjects };
      }

      const res = await userService.updateProfile(payload);
      const profile = unwrapApiData(res) || res;
      applyServerCapability(profile);
      toast.success(
        capabilityAction === 'submit'
          ? t('settingsCapability.toastSubmitted')
          : t('settingsCapability.toastSaved')
      );
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('settingsCapability.saveFail') })
      );
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    const name = String(skillToAdd || '').trim();
    if (!name || !SKILL_WHITELIST.includes(name)) return;
    if ((form.skills || []).some((s) => s.name === name)) return;
    if ((form.skills || []).length >= MAX_SKILLS) {
      toast.error(t('settingsCapability.maxSkills', { n: MAX_SKILLS }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      skills: [...(prev.skills || []), { name, level: 3 }],
    }));
    setSkillToAdd('');
  };

  const removeSkill = (name) => {
    setForm((prev) => ({
      ...prev,
      skills: (prev.skills || []).filter((s) => s.name !== name),
    }));
  };

  const setSkillLevel = (name, level) => {
    const n = Math.min(SKILL_LEVEL_MAX, Math.max(SKILL_LEVEL_MIN, Number(level) || 3));
    setForm((prev) => ({
      ...prev,
      skills: (prev.skills || []).map((s) => (s.name === name ? { ...s, level: n } : s)),
    }));
  };

  const statusLabel = t(`settingsCapability.status.${status}`) || status;
  const badgeClass = STATUS_BADGE[status] || STATUS_BADGE.draft;
  const resourceStatusLabel = t(`settingsCapability.status.${resourceStatus}`) || resourceStatus;
  const resourceBadgeClass = STATUS_BADGE[resourceStatus] || STATUS_BADGE.verified;
  const submitOk = canSubmitCapability(form, { jobTitle });
  const excelLocked = capSource === 'excel_import' && status === 'verified';
  const roInput = excelLocked ? `${FIGMA_SETTINGS_INPUT} bg-muted/40` : FIGMA_SETTINGS_INPUT;

  if (loading) {
    return (
      <div className="max-w-xl">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="mb-1 font-display text-xl font-bold text-foreground">
          {t('settingsCapability.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settingsCapability.subtitle')}</p>
      </div>

      <div className={`${FIGMA_SETTINGS_CARD} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
            {statusLabel}
          </span>
          {status === 'pending_hr' ? (
            <span className="text-xs text-muted-foreground">{t('settingsCapability.pendingHint')}</span>
          ) : null}
          {excelLocked ? (
            <p className="basis-full text-xs text-muted-foreground">{t('settingsCapability.excelLockedHint')}</p>
          ) : null}

          <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${resourceBadgeClass}`}>
            Capacity: {resourceStatusLabel}
          </span>
        </div>

        {status === 'rejected' && rejectReason ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t('settingsCapability.rejectLabel')}: {rejectReason}
          </div>
        ) : null}

        {resourceStatus === 'rejected' && resourceRejectReason ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Capacity reject: {resourceRejectReason}
          </div>
        ) : null}

        {cvFileName ? (
          <p className="text-xs text-muted-foreground">
            {t('settingsCapability.cvFileLabel')}: {cvFileName}
          </p>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.position')}
          </label>
          <div
            className={`${FIGMA_SETTINGS_INPUT} flex items-center bg-muted/40 text-foreground`}
            aria-readonly="true"
          >
            {jobTitle || t('settingsCapability.jobTitleEmpty')}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('settingsCapability.jobTitleHint')}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.domain')}
          </label>
          <select
            className={roInput}
            value={form.primaryDomain}
            disabled={excelLocked || saving}
            onChange={(e) => setForm((p) => ({ ...p, primaryDomain: e.target.value }))}
          >
            <option value="">{t('settingsCapability.selectPlaceholder')}</option>
            {PRIMARY_DOMAINS.map((code) => (
              <option key={code} value={code}>
                {t(`settingsCapability.domains.${code}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.years')}
          </label>
          <input
            type="number"
            min={0}
            max={YEARS_EXPERIENCE_MAX}
            className={roInput}
            value={form.yearsExperience}
            disabled={excelLocked || saving}
            onChange={(e) => setForm((p) => ({ ...p, yearsExperience: e.target.value }))}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.skills')}
          </label>
          {excelLocked ? null : (
          <div className="mb-2 flex gap-2">
            <select
              className={FIGMA_SETTINGS_INPUT}
              value={skillToAdd}
              onChange={(e) => setSkillToAdd(e.target.value)}
            >
              <option value="">{t('settingsCapability.addSkillPlaceholder')}</option>
              {availableSkills.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <GradientButton type="button" variant="secondary" onClick={addSkill} disabled={!skillToAdd}>
              {t('settingsCapability.addSkill')}
            </GradientButton>
          </div>
          )}
          <ul className="space-y-2">
            {(form.skills || []).map((s) => (
              <li
                key={s.name}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                <span className="min-w-[7rem] flex-1 text-sm font-medium text-foreground">{s.name}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t('settingsCapability.level')}
                  <input
                    type="number"
                    min={SKILL_LEVEL_MIN}
                    max={SKILL_LEVEL_MAX}
                    className="h-8 w-14 rounded border border-border bg-background px-2 text-sm"
                    value={s.level}
                    disabled={excelLocked || saving}
                    onChange={(e) => setSkillLevel(s.name, e.target.value)}
                  />
                </label>
                {excelLocked ? null : (
                <button
                  type="button"
                  className="text-xs font-semibold text-destructive hover:underline"
                  onClick={() => removeSkill(s.name)}
                >
                  {t('settingsPage.delete')}
                </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.availability')}
          </label>
          <select
            className={roInput}
            value={form.availability}
            disabled={excelLocked || saving}
            onChange={(e) => setForm((p) => ({ ...p, availability: e.target.value }))}
          >
            {AVAILABILITY_VALUES.map((code) => (
              <option key={code} value={code}>
                {t(`settingsCapability.availabilityOptions.${code}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Số dự án tối đa đồng thời
          </label>
          <input
            type="number"
            min={1}
            max={20}
            className={FIGMA_SETTINGS_INPUT}
            value={maxConcurrentProjects}
            disabled={saving}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              const next = Math.floor(Math.min(20, Math.max(1, v)));
              setMaxConcurrentProjects(next);
            }}
          />
          {resourceStatus === 'pending_hr' ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{t('settingsCapability.pendingHint')}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.pastProjects')}
          </label>
          {(form.projectExperiences || []).length ? (
            <ul className="space-y-2">
              {(form.projectExperiences || []).map((p, idx) => (
                <li
                  key={`${p.evidenceBoardId || p.name}-${idx}`}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {p.name || '—'}
                        {p.year ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">({p.year})</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[p.role, p.work].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {p.status === 'suggested' ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                        {t('settingsCapability.experiencePending')}
                      </span>
                    ) : p.status === 'verified' ? (
                      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        {t('settingsCapability.experienceVerified')}
                      </span>
                    ) : null}
                  </div>
                  {p.status === 'suggested' && p.evidenceBoardId ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => confirmExperience(p.evidenceBoardId)}
                      className="mt-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      {t('settingsCapability.confirmExperience')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('settingsCapability.pastProjectsEmpty')}</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">{t('settingsCapability.pastProjectsHint')}</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.summary')}
          </label>
          <textarea
            rows={3}
            maxLength={SUMMARY_MAX_LEN}
            className={`${roInput} h-auto min-h-[80px] py-2`}
            value={form.summary}
            disabled={excelLocked || saving}
            onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
            placeholder={t('settingsCapability.summaryPlaceholder')}
          />
        </div>

        {excelLocked ? null : (
        <div className="flex flex-wrap gap-2 pt-1">
          <GradientButton
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => persist('save_draft')}
          >
            {saving ? t('common.saving') : t('settingsCapability.saveDraft')}
          </GradientButton>
          <GradientButton
            type="button"
            variant="primary"
            disabled={saving || !submitOk}
            onClick={() => persist('submit')}
          >
            {saving ? t('common.saving') : t('settingsCapability.submit')}
          </GradientButton>
        </div>
        )}
      </div>
    </div>
  );
}
