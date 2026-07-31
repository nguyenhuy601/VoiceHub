import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';
import { capabilityFromApi } from '../../constants/capabilityCatalog';
import {
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from './adminUserPanelUi';

const STATUS_BADGE = {
  draft: 'bg-muted text-muted-foreground',
  pending_hr: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  verified: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-destructive/15 text-destructive',
};

/**
 * Company admin xem capability; chỉ HR (canReview) verify/reject (C1 — chuẩn vàng).
 */
export default function CapabilityReviewPanel({
  orgId,
  userId,
  canReview = false,
  onStatusChange,
}) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [capability, setCapability] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);
    try {
      const res = await adminUserAPI.getProfile(orgId, userId);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      const parsed = capabilityFromApi(data?.capability);
      setCapability(parsed);
      setJobTitle(String(data?.preferences?.jobTitle || data?.jobTitle || '').trim());
      onStatusChange?.(parsed.verificationStatus || 'draft');
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminUsers.capabilityLoadFail') })
      );
      setCapability(null);
      setJobTitle('');
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, t, onStatusChange]);

  useEffect(() => {
    load();
  }, [load]);

  const verify = async () => {
    if (!canReview || acting || !orgId || !userId) return;
    setActing(true);
    try {
      const res = await adminUserAPI.verifyCapability(orgId, userId);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      const parsed = capabilityFromApi(data?.capability);
      setCapability(parsed);
      setRejectOpen(false);
      setRejectReason('');
      onStatusChange?.(parsed.verificationStatus);
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
      const parsed = capabilityFromApi(data?.capability);
      setCapability(parsed);
      setRejectOpen(false);
      setRejectReason('');
      onStatusChange?.(parsed.verificationStatus);
      toast.success(t('adminUsers.capabilityRejected'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminUsers.capabilityActionFail') })
      );
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  if (!capability) {
    return (
      <p className="text-sm text-muted-foreground">{t('adminUsers.capabilityEmpty')}</p>
    );
  }

  const status = capability.verificationStatus || 'draft';
  const pending = status === 'pending_hr';
  const badgeClass = STATUS_BADGE[status] || STATUS_BADGE.draft;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
          {t(`settingsCapability.status.${status}`)}
        </span>
        {pending ? (
          <span className="text-xs text-muted-foreground">{t('adminUsers.capabilityPendingHint')}</span>
        ) : null}
      </div>

      {pending && !canReview ? (
        <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
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
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
              {t('settingsCapability.rejectLabel')}: {capability.rejectReason}
            </div>
          ) : null}
        </dl>
      )}

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
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/40 disabled:opacity-50"
            >
              {t('adminUsers.capabilityReject')}
            </button>
          </div>
          {rejectOpen ? (
            <div className="space-y-2">
              <label className={adminLabelClass()}>{t('adminUsers.capabilityRejectReason')}</label>
              <textarea
                rows={3}
                className={`${adminInputClass()} min-h-[72px]`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('adminUsers.capabilityRejectPlaceholder')}
              />
              <button
                type="button"
                disabled={acting}
                onClick={reject}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:opacity-50"
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
    </div>
  );
}
