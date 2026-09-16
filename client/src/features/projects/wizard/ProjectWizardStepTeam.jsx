import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { projectAPI } from '../../../services/api/projectAPI';
import { isWorkloadFull, isWorkloadPartial } from '../../../utils/wizardRelatedDeptMembers';
import { wizardUi } from './projectWizardUi';
import {
  INTAKE_LEAD_ROLE_KEYS,
  INTAKE_LEAD_LABEL_KEYS,
  ROLE_SUGGEST_PAGE_SIZE,
  emptyIntakeSlots,
} from './projectWizardIntakeRoles';
import { useRoleSuggestColumn } from './useRoleSuggestColumn';

/** Bước roster luôn chỉ gợi ý thành viên dưới 100% allocation. */
const FIT_AVAILABLE = true;

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function reasonLabel(reason, t) {
  if (reason === 'position_preferred') return t('adminTasks.wizardSuggestReasonPosition');
  if (reason === 'cv_verified') return t('adminTasks.wizardSuggestReasonCv');
  if (reason === 'prior_role') return t('adminTasks.wizardSuggestReasonPrior');
  return '';
}

function loadBarWidth(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}

function CandidateLoad({ item, t }) {
  const pct = Number(item.allocatedPct);
  const rounded = Number.isFinite(pct) ? Math.round(pct) : 0;
  const full = isWorkloadFull(item);
  const partial = isWorkloadPartial(item);
  const label = full
    ? t('adminTasks.wizardMemberFullLoad', { pct: rounded })
    : partial
      ? t('adminTasks.wizardMemberPartialLoad', { pct: rounded })
      : t('adminTasks.wizardMemberAvailableLoad', { pct: rounded });
  const barClass = full ? 'bg-destructive' : partial ? 'bg-primary' : 'bg-muted-foreground/40';
  return (
    <div className="mt-2">
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${barClass}`} style={{ width: `${loadBarWidth(rounded)}%` }} />
      </div>
      <p className={`mt-1 text-[11px] leading-snug ${full ? 'text-destructive' : 'text-muted-foreground'}`}>
        {label}
      </p>
    </div>
  );
}

function CandidateRow({ item, selected, onSelect, t }) {
  const reasons = Array.isArray(item.suggestReasons) ? item.suggestReasons : [];
  const years = item.yearsExperience;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={selected ? wizardUi.statusCardActive : wizardUi.statusCard}
    >
      <p className="text-sm font-medium text-foreground">{item.displayName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {item.jobTitle || t('adminTasks.wizardSuggestNoTitle')}
        {years != null ? ` · ${t('adminTasks.wizardSuggestYears', { n: years })}` : ''}
      </p>
      <CandidateLoad item={item} t={t} />
      {reasons.length ? (
        <p className="mt-1 flex flex-wrap gap-1">
          {reasons.map((r) => {
            const label = reasonLabel(r, t);
            if (!label) return null;
            return (
              <span
                key={r}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {label}
              </span>
            );
          })}
        </p>
      ) : null}
    </button>
  );
}

function RoleSuggestColumn({
  orgId,
  roleKey,
  initialItems,
  initialHasMore,
  selectedId,
  onPick,
  t,
}) {
  const { items, hasMore, loadingMore, fetchMore } = useRoleSuggestColumn({
    orgId,
    roleKey,
    initialItems,
    initialHasMore,
    enabled: Boolean(orgId),
    fitAvailable: FIT_AVAILABLE,
  });
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) fetchMore();
      },
      { root, rootMargin: '48px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, fetchMore, items.length]);

  return (
    <div className="flex max-h-[min(56vh,32rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/20">
      <p className="shrink-0 border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
        {t(INTAKE_LEAD_LABEL_KEYS[roleKey])}
      </p>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain p-3"
      >
        {items.map((item) => (
          <CandidateRow
            key={item.userId}
            item={item}
            selected={String(item.userId) === selectedId}
            onSelect={() => onPick(roleKey, item)}
            t={t}
          />
        ))}
        {!items.length ? (
          <p className="text-xs text-muted-foreground">{t('adminTasks.wizardSuggestEmpty')}</p>
        ) : null}
        {hasMore ? <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden /> : null}
        {loadingMore ? (
          <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function ProjectWizardStepTeam({
  orgId,
  form,
  setIntakeSlot,
  t,
}) {
  const roleKeysParam = INTAKE_LEAD_ROLE_KEYS.join(',');
  const slots = { ...emptyIntakeSlots(), ...(form.intakeSlots || {}) };

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.roleSuggestPool(orgId, roleKeysParam, {
      limit: ROLE_SUGGEST_PAGE_SIZE,
      offset: 0,
      fitAvailable: FIT_AVAILABLE,
    }),
    queryFn: async () => {
      const params = {
        view: 'roleSuggest',
        projectRoleKeys: roleKeysParam,
        limit: ROLE_SUGGEST_PAGE_SIZE,
        offset: 0,
        fitAvailable: 1,
      };
      const res = await projectAPI.listOrgResourcePool(orgId, params, {
        skipPermissionDeniedToast: true,
      });
      return unwrap(res);
    },
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });

  const byRole = data?.byRole || {};
  const hasMoreByRole = data?.paging?.hasMoreByRole || {};

  const onPick = (roleKey, item) => {
    const currentId = String(slots[roleKey]?.userId || '');
    if (currentId && currentId === String(item.userId || '')) {
      setIntakeSlot(roleKey, null);
      return;
    }
    setIntakeSlot(roleKey, {
      userId: item.userId,
      displayName: item.displayName,
      jobTitle: item.jobTitle,
    });
  };

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h3 className="text-base font-semibold text-foreground">
          {t('adminTasks.wizardStepTeamBring') || t('adminTasks.wizardStepTeam')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('adminTasks.wizardStepTeamHint')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('adminTasks.wizardIntakeDualOk')}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t('adminTasks.wizardSuggestFitAvailable')}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
      {isError ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.wizardSuggestLoadFail')}</p>
      ) : null}

      {!isLoading ? (
        <div className="grid min-h-0 gap-3 md:grid-cols-3">
          {INTAKE_LEAD_ROLE_KEYS.map((roleKey) => (
            <RoleSuggestColumn
              key={`${orgId}-${roleKey}`}
              orgId={orgId}
              roleKey={roleKey}
              initialItems={Array.isArray(byRole[roleKey]) ? byRole[roleKey] : []}
              initialHasMore={Boolean(hasMoreByRole[roleKey])}
              selectedId={String(slots[roleKey]?.userId || '')}
              onPick={onPick}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
