import { useCallback, useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';
import { capabilityFromApi } from '../../constants/capabilityCatalog';
import {
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from './adminUserPanelUi';

const STATUS_BADGE = {
  draft: 'bg-muted text-muted-foreground',
  pending_hr: 'bg-warning-bg text-warning',
  verified: 'bg-success-bg text-success',
  rejected: 'bg-error-bg text-destructive',
};

const REJECT_REASON_MAX = 500;

const HINT_BOX_CLASS = 'rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground';
const REJECTED_BOX_CLASS = 'rounded-lg border border-destructive bg-error-bg px-3 py-2 text-destructive';

function readResourceConfig(profile) {
  const rc = profile?.resourceConfig && typeof profile.resourceConfig === 'object' ? profile.resourceConfig : {};
  const max = Number(rc.maxConcurrentProjects);
  return {
    maxConcurrentProjects: Number.isFinite(max) && max >= 1 ? Math.floor(max) : 2,
    verificationStatus: String(rc.verificationStatus || 'verified'),
    rejectReason: String(rc.rejectReason || ''),
  };
}

/**
 * Company admin xem capability + capacity; chỉ HR (canReview) verify/reject (C1 — chuẩn vàng).
 */
export default function CapabilityReviewPanel({
  orgId,
  userId,
  canReview = false,
  canConfirmExperience = false,
  onStatusChange,
}) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [capability, setCapability] = useState(null);
  const [resourceConfig, setResourceConfig] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rcRejectOpen, setRcRejectOpen] = useState(false);
  const [rcRejectReason, setRcRejectReason] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const fieldId = useId();
  const rejectReasonId = `${fieldId}-reject`;
  const rcRejectReasonId = `${fieldId}-rc-reject`;

  // Tránh loop: parent truyền onStatusChange inline → không đưa vào deps của load.
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await adminUserAPI.getProfile(orgId, userId);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      const parsed = capabilityFromApi(data?.capability);
      setCapability(parsed);
      setResourceConfig(readResourceConfig(data));
      setJobTitle(String(data?.preferences?.jobTitle || data?.jobTitle || '').trim());
      onStatusChangeRef.current?.(parsed.verificationStatus || 'draft');
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t: tRef.current,
          fallback: tRef.current('adminUsers.capabilityLoadFail'),
        })
      );
      setCapability(null);
      setResourceConfig(null);
      setJobTitle('');
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const applyProfile = (data) => {
    const parsed = capabilityFromApi(data?.capability);
    setCapability(parsed);
    setResourceConfig(readResourceConfig(data));
    onStatusChange?.(parsed.verificationStatus);
  };

  const confirmExperience = async (evidenceBoardId) => {
    if (!canConfirmExperience || acting || !orgId || !userId) return;
    const boardId = String(evidenceBoardId || '').trim();
    if (!boardId) return;
    setActing(true);
    try {
      const res = await adminUserAPI.confirmExperience(orgId, userId, boardId);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      applyProfile(data);
      toast.success(t('settingsCapability.confirmOk'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('settingsCapability.confirmFail') })
      );
    } finally {
      setActing(false);
    }
  };

  const verify = async () => {
    if (!canReview || acting || !orgId || !userId) return;
    setActing(true);
    try {
      const res = await adminUserAPI.verifyCapability(orgId, userId);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      applyProfile(data);
      setRejectOpen(false);
      setRejectReason('');
      toast.success(t('adminUsers.capabilityVerified'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminUsers.capabilityActionFail') })
      );
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!canReview || acting || !orgId || !userId) return;
    const reason = String(rejectReason || '').trim();
    if (!reason) {
      toast.error(t('adminUsers.capabilityRejectNeedReason'));
      return;
    }
    setActing(true);
    try {
      const res = await adminUserAPI.rejectCapability(orgId, userId, reason);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      applyProfile(data);
      setRejectOpen(false);
      setRejectReason('');
      toast.success(t('adminUsers.capabilityRejected'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminUsers.capabilityActionFail') })
      );
    } finally {
      setActing(false);
    }
  };

  const verifyResource = async () => {
    if (!canReview || acting || !orgId || !userId) return;
    setActing(true);
    try {
      const res = await adminUserAPI.verifyResourceConfig(orgId, userId);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      applyProfile(data);
      setRcRejectOpen(false);
      setRcRejectReason('');
      toast.success(t('adminUsers.resourceConfigVerified'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminUsers.resourceConfigActionFail') })
      );
    } finally {
      setActing(false);
    }
  };

  const rejectResource = async () => {
    if (!canReview || acting || !orgId || !userId) return;
    const reason = String(rcRejectReason || '').trim();
    if (!reason) {
      toast.error(t('adminUsers.capabilityRejectNeedReason'));
      return;
    }
    setActing(true);
    try {
      const res = await adminUserAPI.rejectResourceConfig(orgId, userId, reason);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      applyProfile(data);
      setRcRejectOpen(false);
      setRcRejectReason('');
      toast.success(t('adminUsers.resourceConfigRejected'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminUsers.resourceConfigActionFail') })
      );
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={t('common.loading')}>
        {Array.from({ length: 4 }, (_, idx) => (
          <div key={idx} className="h-10 rounded-lg bg-muted motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive bg-error-bg px-3 py-2 text-xs text-destructive"
      >
        <span>{t('adminUsers.capabilityLoadFail')}</span>
        <button type="button" onClick={load} className={adminSecondaryBtnClass('px-2.5 py-1 text-xs')}>
          {t('adminUsers.listRetry')}
        </button>
      </div>
    );
  }

  if (!capability) {
    return (
      <p className="text-sm text-muted-foreground">{t('adminUsers.capabilityEmpty')}</p>
    );
  }

  const status = capability.verificationStatus || 'draft';
  const pending = status === 'pending_hr';
  const badgeClass = STATUS_BADGE[status] || STATUS_BADGE.draft;

  const rcStatus = resourceConfig?.verificationStatus || 'verified';
  const rcPending = rcStatus === 'pending_hr';
  const rcBadge = STATUS_BADGE[rcStatus] || STATUS_BADGE.verified;

  return (
    <div className="space-y-6 text-sm" aria-busy={acting}>
      <section className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('adminUsers.tabCapability')}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
            {t(`settingsCapability.status.${status}`)}
          </span>
          {pending ? (
            <span className="text-xs text-muted-foreground">{t('adminUsers.capabilityPendingHint')}</span>
          ) : null}
        </div>

        {pending && !canReview ? (
          <p className={HINT_BOX_CLASS}>
            {t('adminUsers.capabilityHrOnlyHint')}
          </p>
        ) : null}

        {!jobTitle && !capability.skills?.length ? (
          <p className="text-muted-foreground">{t('adminUsers.capabilityEmpty')}</p>
        ) : (
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t('settingsCapability.position')}</dt>
              <dd className="font-medium">{jobTitle || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('settingsCapability.domain')}</dt>
              <dd className="font-medium">
                {capability.primaryDomain
                  ? t(`settingsCapability.domains.${capability.primaryDomain}`)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('settingsCapability.years')}</dt>
              <dd className="font-medium">
                {capability.yearsExperience === '' || capability.yearsExperience == null
                  ? '—'
                  : capability.yearsExperience}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('settingsCapability.skills')}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {(capability.skills || []).length ? (
                  capability.skills.map((s) => (
                    <span
                      key={s.name}
                      className="inline-flex rounded-full border border-border bg-background px-2.5 py-0.5 text-xs"
                    >
                      {s.name}
                      <span className="ml-1 text-muted-foreground">L{s.level}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('settingsCapability.availability')}</dt>
              <dd className="font-medium">
                {t(`settingsCapability.availabilityOptions.${capability.availability}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('settingsCapability.pastProjects')}</dt>
              <dd className="mt-1 space-y-2">
                {(capability.projectExperiences || []).length ? (
                  capability.projectExperiences.map((p, idx) => (
                    <div
                      key={`${p.evidenceBoardId || p.name}-${idx}`}
                      className="rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
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
                          <span className="rounded-md bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
                            {t('settingsCapability.experiencePending')}
                          </span>
                        ) : p.status === 'verified' ? (
                          <span className="rounded-md bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">
                            {t('settingsCapability.experienceVerified')}
                          </span>
                        ) : null}
                      </div>
                      {canConfirmExperience && p.status === 'suggested' && p.evidenceBoardId ? (
                        <button
                          type="button"
                          disabled={acting}
                          onClick={() => confirmExperience(p.evidenceBoardId)}
                          className="mt-2 rounded text-xs font-semibold text-primary transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                        >
                          {t('settingsCapability.confirmExperience')}
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <span className="text-muted-foreground">{t('settingsCapability.pastProjectsEmpty')}</span>
                )}
              </dd>
            </div>
            {capability.summary ? (
              <div>
                <dt className="text-xs text-muted-foreground">{t('settingsCapability.summary')}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{capability.summary}</dd>
              </div>
            ) : null}
            {capability.cvFileName ? (
              <div>
                <dt className="text-xs text-muted-foreground">{t('settingsCapability.cvFileLabel')}</dt>
                <dd className="font-medium">{capability.cvFileName}</dd>
              </div>
            ) : null}
            {status === 'rejected' && capability.rejectReason ? (
              <div className={REJECTED_BOX_CLASS}>
                {t('settingsCapability.rejectLabel')}: {capability.rejectReason}
              </div>
            ) : null}
          </dl>
        )}

        {canReview && pending && (capability.skills || []).length > 0
        && !(capability.projectExperiences || []).some((p) => p.status === 'verified')
        && !capability.cvFileName ? (
          <p className="rounded-lg border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
            {t('adminUsers.capabilityNoEvidenceWarn')}
          </p>
        ) : null}

        {canReview && pending ? (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={verify}
                className={adminPrimaryBtnClass()}
              >
                {acting ? t('common.saving') : t('adminUsers.capabilityVerify')}
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => setRejectOpen((v) => !v)}
                aria-expanded={rejectOpen}
                aria-controls={rejectReasonId}
                className={adminSecondaryBtnClass()}
              >
                {t('adminUsers.capabilityReject')}
              </button>
            </div>
            {rejectOpen ? (
              <div className="space-y-2 motion-safe:animate-fade-in-fast">
                <label htmlFor={rejectReasonId} className={adminLabelClass()}>
                  {t('adminUsers.capabilityRejectReason')}
                </label>
                <textarea
                  id={rejectReasonId}
                  rows={3}
                  required
                  maxLength={REJECT_REASON_MAX}
                  className={`${adminInputClass()} min-h-[72px]`}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t('adminUsers.capabilityRejectPlaceholder')}
                />
                <button
                  type="button"
                  disabled={acting || !rejectReason.trim()}
                  onClick={reject}
                  className={adminDangerBtnClass()}
                >
                  {acting ? t('common.saving') : t('adminUsers.capabilityRejectConfirm')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {canReview && !pending && status !== 'draft' ? (
          <p className="text-xs text-muted-foreground">{t('adminUsers.capabilityNoAction')}</p>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-border pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('adminUsers.resourceConfigTitle')}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${rcBadge}`}>
            {t(`settingsCapability.status.${rcStatus}`)}
          </span>
          {rcPending ? (
            <span className="text-xs text-muted-foreground">{t('adminUsers.resourceConfigPendingHint')}</span>
          ) : null}
        </div>
        <dl className="space-y-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t('adminUsers.resourceConfigMax')}</dt>
            <dd className="font-medium">{resourceConfig?.maxConcurrentProjects ?? 2}</dd>
          </div>
          {rcStatus === 'rejected' && resourceConfig?.rejectReason ? (
            <div className={REJECTED_BOX_CLASS}>
              {t('settingsCapability.rejectLabel')}: {resourceConfig.rejectReason}
            </div>
          ) : null}
        </dl>

        {rcPending && !canReview ? (
          <p className={HINT_BOX_CLASS}>
            {t('adminUsers.capabilityHrOnlyHint')}
          </p>
        ) : null}

        {canReview && rcPending ? (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={verifyResource}
                className={adminPrimaryBtnClass()}
              >
                {acting ? t('common.saving') : t('adminUsers.resourceConfigVerify')}
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => setRcRejectOpen((v) => !v)}
                aria-expanded={rcRejectOpen}
                aria-controls={rcRejectReasonId}
                className={adminSecondaryBtnClass()}
              >
                {t('adminUsers.resourceConfigReject')}
              </button>
            </div>
            {rcRejectOpen ? (
              <div className="space-y-2 motion-safe:animate-fade-in-fast">
                <label htmlFor={rcRejectReasonId} className={adminLabelClass()}>
                  {t('adminUsers.capabilityRejectReason')}
                </label>
                <textarea
                  id={rcRejectReasonId}
                  rows={3}
                  required
                  maxLength={REJECT_REASON_MAX}
                  className={`${adminInputClass()} min-h-[72px]`}
                  value={rcRejectReason}
                  onChange={(e) => setRcRejectReason(e.target.value)}
                  placeholder={t('adminUsers.resourceConfigRejectPlaceholder')}
                />
                <button
                  type="button"
                  disabled={acting || !rcRejectReason.trim()}
                  onClick={rejectResource}
                  className={adminDangerBtnClass()}
                >
                  {acting ? t('common.saving') : t('adminUsers.capabilityRejectConfirm')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
