import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  CircleDashed,
  FlaskConical,
  Lock,
  XCircle,
} from 'lucide-react';
import Modal from '../../../components/Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import { tcResultBadgeClass } from './phase3HubUiTokens';

function normalizeResult(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * Popup: TC detail + Pass / Fail / Open bug (SoT Phase 3 HITL).
 * Soft-blue header; tên TC trong body (không dùng title TC làm H1 — tránh "j").
 */
export default function ProjectHubTcDetailModal({
  open,
  testCase = null,
  workItemLabel = '',
  workItemDone = false,
  busy = false,
  canExecute = false,
  onClose,
  onPass,
  onFail,
  onOpenBug,
}) {
  const { t } = useAppStrings();
  if (!open || !testCase) return null;

  const lastResult = normalizeResult(testCase.lastResult);
  const hasBug = Boolean(testCase.linkedBugId);
  const linkedBugTitle = String(testCase.linkedBugTitle || '').trim();
  const needsRetest = Boolean(testCase.needsRetest);
  const bugOpen = Boolean(testCase.linkedBugOpen);
  const showOpenBug = lastResult === 'fail' && !hasBug && !workItemDone;
  const tcTitle = String(testCase.title || '').trim() || '—';
  const tcCode = String(testCase.code || '').trim() || '—';
  const externalKey = String(testCase.externalKey || '').trim();

  let BadgeIcon = CircleDashed;
  let badgeLabel = t('workspace.phaseQaResultNone');
  let badgeKey = 'none';
  if (lastResult === 'pass') {
    BadgeIcon = CheckCircle2;
    badgeLabel = t('workspace.phaseQaResultPass');
    badgeKey = 'pass';
  } else if (lastResult === 'fail') {
    BadgeIcon = XCircle;
    badgeLabel = t('workspace.phaseQaResultFail');
    badgeKey = 'fail';
  }

  const btnBase =
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50';

  const headerTitle = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#91CAFF] bg-white text-[#1677FF] shadow-sm dark:border-slate-600 dark:bg-slate-900">
        <FlaskConical className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#1677FF]/90 dark:text-sky-300">
          {t('workspace.phaseQaDetailTitle')}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-[#91CAFF]/80 bg-white/90 px-1.5 py-px font-mono text-[11px] font-semibold text-[#1677FF] dark:border-slate-600 dark:bg-slate-900 dark:text-sky-300">
            {tcCode}
          </span>
          <span className={`inline-flex items-center gap-1 ${tcResultBadgeClass(badgeKey)}`}>
            <BadgeIcon className="h-3 w-3" aria-hidden />
            {badgeLabel}
          </span>
        </span>
      </span>
    </span>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        className={`${btnBase} border border-[#D9D9D9] bg-white text-[#595959] hover:bg-[#FAFAFA]`}
        onClick={onClose}
        disabled={busy}
      >
        {t('common.close')}
      </button>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {workItemDone ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {t('workspace.phaseQaLockedWhenDone')}
          </span>
        ) : null}
        {canExecute && !workItemDone ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPass?.()}
              className={`${btnBase} border border-emerald-500/35 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200`}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {t('workspace.phaseQaPass')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onFail?.()}
              className={`${btnBase} border border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/15`}
            >
              <XCircle className="h-4 w-4" aria-hidden />
              {t('workspace.phaseQaFail')}
            </button>
          </>
        ) : null}
        {showOpenBug ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenBug?.()}
            className={`${btnBase} bg-[#1677FF] text-white shadow-sm hover:bg-[#0958D9]`}
          >
            <Bug className="h-4 w-4" aria-hidden />
            {t('workspace.phaseQaOpenBug')}
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={headerTitle}
      size="sm"
      footer={footer}
      closable={!busy}
      headerClassName="items-start border-[#C9DFF0] bg-[#E8F4FC] dark:border-slate-700 dark:bg-slate-800/80"
      titleClassName="min-w-0 flex-1 pr-2 text-base font-normal sm:text-base"
      bodyClassName="space-y-3 px-5 py-4"
      panelClassName="max-w-lg"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">
          {t('workspace.phaseQaFieldTitle')}
        </p>
        <p className="mt-1 break-words text-base font-semibold leading-snug text-[#262626] dark:text-white">
          {tcTitle}
        </p>
      </div>

      <dl className="grid gap-2.5 rounded-xl border border-[#E8E8E8] bg-[#FAFAFA] p-3.5 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900/50">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">
            {t('workspace.phaseQaFieldCode')}
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-medium text-[#262626] dark:text-slate-100">
            {tcCode}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">
            {t('workspace.phaseQaFieldExternalKey')}
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-medium text-[#262626] dark:text-slate-100">
            {externalKey || '—'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">
            {t('workspace.phaseQaFieldWorkItem')}
          </dt>
          <dd className="mt-0.5 text-sm font-medium leading-snug text-[#262626] dark:text-slate-100">
            {workItemLabel || '—'}
          </dd>
        </div>
        {hasBug ? (
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">
              {needsRetest
                ? t('workspace.phaseQaNeedsRetestBadge')
                : bugOpen
                  ? t('workspace.phaseQaBugOpenBadge')
                  : t('workspace.phaseQaBugLinked')}
            </dt>
            <dd className="mt-0.5 inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-primary">
              <Bug className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {linkedBugTitle || t('workspace.phaseQaBugLinked')}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>

      {needsRetest && !workItemDone ? (
        <div
          role="status"
          className="flex gap-2.5 rounded-xl border border-amber-400/45 bg-amber-50 px-3 py-2.5 dark:border-amber-500/35 dark:bg-amber-950/40"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="min-w-0 text-[12px] leading-relaxed text-amber-950 dark:text-amber-100">
            <p className="font-semibold">{t('workspace.phaseQaNeedsRetestTitle')}</p>
            <p className="mt-0.5">
              {t('workspace.phaseQaNeedsRetestBody', {
                bug: linkedBugTitle || t('workspace.phaseQaBugLinked'),
              })}
            </p>
          </div>
        </div>
      ) : null}

      {bugOpen && !needsRetest && !workItemDone ? (
        <div
          role="status"
          className="flex gap-2.5 rounded-xl border border-sky-400/40 bg-sky-50 px-3 py-2.5 dark:border-sky-500/30 dark:bg-sky-950/40"
        >
          <Bug className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
          <p className="text-[12px] leading-relaxed text-sky-950 dark:text-sky-100">
            {t('workspace.phaseQaBugOpenBody')}
          </p>
        </div>
      ) : null}

      {lastResult === 'fail' && !hasBug && !workItemDone ? (
        <div
          role="status"
          className="flex gap-2.5 rounded-xl border border-amber-400/40 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-950/40"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p className="text-[12px] leading-relaxed text-amber-950 dark:text-amber-100">
            {t('workspace.phaseQaExecuteFailNeedOpenBug')}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
