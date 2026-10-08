import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradientButton } from '../Shared';
import authService from '../../services/authService';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { notify } from '../../utils/appToast';

const MOTION = 'motion-safe:transition-colors motion-reduce:transition-none';

export default function ProfileChangePasswordModal({
  isOpen,
  email,
  onBack,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/40 motion-safe:transition-colors motion-reduce:transition-none';

  const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const headingClass = 'text-foreground';
  const mutedClass = 'text-muted-foreground';
  const shellClass = 'w-full max-w-md rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl';
  const ghostBtn = `rounded-xl px-4 py-2 text-sm font-medium text-foreground hover:bg-muted ${MOTION}`;

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword.trim()) {
      notify.error(t('profileModal.pwErrCurrent'));
      return;
    }
    if (newPassword.length < 8) {
      notify.error(t('profileModal.pwErrNewMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      notify.error(t('profileModal.pwErrConfirm'));
      return;
    }
    try {
      setSaving(true);
      await authService.changePassword(currentPassword, newPassword);
      notify.success(t('profileModal.pwOk'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onBack?.();
    } catch (err) {
      notify.error(resolveApiErrorMessage(err, { t, fallback: t('profileModal.pwFail') }));
    } finally {
      setSaving(false);
    }
  };

  const handleForgot = () => {
    onBack?.();
    const q = email ? `?email=${encodeURIComponent(email)}` : '';
    navigate(`/forgot-password${q}`);
  };

  return (
    <div
      className="absolute inset-0 z-[100002] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-change-password-title"
    >
      <form className={shellClass} onSubmit={handleSubmit}>
        <h3 id="profile-change-password-title" className={`mb-1 text-lg font-bold ${headingClass}`}>
          {t('profileModal.changePasswordTitle')}
        </h3>
        <p className={`mb-5 text-sm ${mutedClass}`}>{t('profileModal.changePasswordSub')}</p>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t('profileModal.pwCurrent')}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('profileModal.pwNew')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('profileModal.pwConfirm')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={ghostBtn} onClick={onBack}>
            {t('profileModal.pwBack')}
          </button>
          <button type="button" className={`text-sm font-semibold text-primary hover:underline ${MOTION}`} onClick={handleForgot}>
            {t('profileModal.pwForgot')}
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={ghostBtn} onClick={onBack} disabled={saving}>
            {t('nav.cancel')}
          </button>
          <GradientButton
            type="submit"
            variant="primary"
            disabled={saving}
            aria-busy={saving}
            className={MOTION}
          >
            {saving ? t('profileModal.saving') : t('profileModal.pwSubmit')}
          </GradientButton>
        </div>
      </form>
    </div>
  );
}
