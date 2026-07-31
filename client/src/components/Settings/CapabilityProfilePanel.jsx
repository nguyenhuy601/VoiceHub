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
  const [rejectReason, setRejectReason] = useState('');
  const [cvFileName, setCvFileName] = useState('');
  const [uploadingCv, setUploadingCv] = useState(false);
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
      });
      setJobTitle(readJobTitle(profile));
      setStatus(parsed.verificationStatus || 'draft');
      setRejectReason(parsed.rejectReason || '');
      setCvFileName(parsed.cvFileName || '');
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

  const handleCvUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingCv || saving) return;
    const name = String(file.name || '').toLowerCase();
    if (!name.endsWith('.pdf')) {
      toast.error(t('settingsCapability.cvPdfOnly'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('settingsCapability.cvTooLarge'));
      return;
    }
    setUploadingCv(true);
    try {
      const res = await userService.uploadCapabilityCv(file);
      const body = res?.data ?? res;
      const profile = unwrapApiData(body) || body?.data || body;
      applyServerCapability(profile);
      const note = body?.meta?.parseNote || res?.meta?.parseNote;
      if (note === 'empty_or_scanned' || note === 'low_text') {
        toast(t('settingsCapability.cvParseWeak'), { icon: '⚠️' });
      } else {
        toast.success(t('settingsCapability.cvParseOk'));
      }
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('settingsCapability.cvUploadFail') })
      );
    } finally {
      setUploadingCv(false);
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
      const res = await userService.updateProfile({
        capabilityAction,
        capability: toCapabilityPayload(form),
      });
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
  const submitOk = canSubmitCapability(form, { jobTitle });

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
        </div>

        {status === 'rejected' && rejectReason ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t('settingsCapability.rejectLabel')}: {rejectReason}
          </div>
        ) : null}

        <div className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-3">
          <p className="mb-2 text-sm font-medium text-foreground">{t('settingsCapability.cvUploadTitle')}</p>
          <p className="mb-3 text-xs text-muted-foreground">{t('settingsCapability.cvUploadHint')}</p>
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={uploadingCv || saving}
              onChange={handleCvUpload}
            />
            <span className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {uploadingCv ? t('settingsCapability.cvUploading') : t('settingsCapability.cvUploadBtn')}
            </span>
          </label>
          {cvFileName ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('settingsCapability.cvFileLabel')}: {cvFileName}
            </p>
          ) : null}
        </div>

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
            className={FIGMA_SETTINGS_INPUT}
            value={form.primaryDomain}
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
            className={FIGMA_SETTINGS_INPUT}
            value={form.yearsExperience}
            onChange={(e) => setForm((p) => ({ ...p, yearsExperience: e.target.value }))}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.skills')}
          </label>
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
                    onChange={(e) => setSkillLevel(s.name, e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="text-xs font-semibold text-destructive hover:underline"
                  onClick={() => removeSkill(s.name)}
                >
                  {t('settingsPage.delete')}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settingsCapability.availability')}
          </label>
          <select
            className={FIGMA_SETTINGS_INPUT}
            value={form.availability}
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
            {t('settingsCapability.summary')}
          </label>
          <textarea
            rows={3}
            maxLength={SUMMARY_MAX_LEN}
            className={`${FIGMA_SETTINGS_INPUT} h-auto min-h-[80px] py-2`}
            value={form.summary}
            onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
            placeholder={t('settingsCapability.summaryPlaceholder')}
          />
        </div>

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
      </div>
    </div>
  );
}
