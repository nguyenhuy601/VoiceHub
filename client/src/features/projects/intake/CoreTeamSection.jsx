import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Circle } from 'lucide-react';
import { queryKeys } from '../../../lib/queryKeys';
import { projectAPI } from '../../../services/api/projectAPI';
import { isWorkloadFull, isWorkloadPartial } from '../../../utils/wizardRelatedDeptMembers';
import {
  INTAKE_LEAD_ROLE_KEYS,
  INTAKE_LEAD_LABEL_KEYS,
  ROLE_SUGGEST_PAGE_SIZE,
  emptyIntakeSlots,
} from '../wizard/projectWizardIntakeRoles';
import { useRoleSuggestColumn } from '../wizard/useRoleSuggestColumn';
import { wizardUi } from '../wizard/projectWizardUi';
import { intakeUi } from './intakeUi';
import IntakeSection from './IntakeSection';

const FIT_AVAILABLE = true;

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
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
  const width = Math.min(100, Math.max(0, rounded));
  return (
    <div className="mt-2">
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${barClass}`} style={{ width: `${width}%` }} />
      </div>
      <p className={`mt-1 text-[11px] ${full ? 'text-destructive' : 'text-muted-foreground'}`}>
        {label}
      </p>
    </div>
  );
}

function PickerList({ orgId, roleKey, initialItems, initialHasMore, selectedId, onPick, t }) {
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
    <div
      ref={scrollRef}
      className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2"
    >
      {items.map((item) => {
        const selected = String(item.userId) === selectedId;
        return (
          <button
            key={item.userId}
            type="button"
            onClick={() => onPick(item)}
            className={selected ? wizardUi.statusCardActive : wizardUi.statusCard}
          >
            <p className="text-sm font-medium text-foreground">{item.displayName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.jobTitle || t('adminTasks.wizardSuggestNoTitle')}
            </p>
            <CandidateLoad item={item} t={t} />
          </button>
        );
      })}
      {!items.length ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">{t('adminTasks.wizardSuggestEmpty')}</p>
      ) : null}
      {hasMore ? <div ref={sentinelRef} className="h-3" aria-hidden /> : null}
      {loadingMore ? <p className="text-xs text-muted-foreground">{t('common.loading')}</p> : null}
    </div>
  );
}

function RoleCard({
  roleKey,
  slot,
  fieldError,
  showErrors,
  expanded,
  onToggle,
  orgId,
  pool,
  hasMoreByRole,
  onPick,
  t,
}) {
  const assigned = Boolean(slot?.userId);
  const label = t(INTAKE_LEAD_LABEL_KEYS[roleKey]);

  return (
    <div
      id={`intake-field-${roleKey}`}
      className={`${intakeUi.roleCard} ${expanded ? intakeUi.roleCardOpen : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {assigned ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {label}
          </p>
          {assigned ? (
            <>
              <p className="mt-1 text-sm text-foreground">{slot.displayName || slot.userId}</p>
              {slot.jobTitle ? (
                <p className="text-xs text-muted-foreground">{slot.jobTitle}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('adminTasks.intakeRoleNotAssigned') || 'Chưa gán — chọn thành viên'}
            </p>
          )}
        </div>
        <button type="button" className={intakeUi.secondaryBtn} onClick={onToggle}>
          {assigned
            ? t('adminTasks.intakeRoleChange') || 'Đổi'
            : t('adminTasks.intakeRoleAssign') || 'Gán'}
        </button>
      </div>
      {showErrors && fieldError ? <p className={`mt-2 ${intakeUi.fieldError}`}>{fieldError}</p> : null}
      {expanded ? (
        <PickerList
          orgId={orgId}
          roleKey={roleKey}
          initialItems={Array.isArray(pool?.[roleKey]) ? pool[roleKey] : []}
          initialHasMore={Boolean(hasMoreByRole?.[roleKey])}
          selectedId={String(slot?.userId || '')}
          onPick={onPick}
          t={t}
        />
      ) : null}
    </div>
  );
}

export default function CoreTeamSection({
  orgId,
  form,
  setIntakeSlot,
  fieldErrors,
  showErrors,
  sectionMeta,
  t,
}) {
  const [openRole, setOpenRole] = useState('');
  const slots = { ...emptyIntakeSlots(), ...(form.intakeSlots || {}) };
  const roleKeysParam = INTAKE_LEAD_ROLE_KEYS.join(',');

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.roleSuggestPool(orgId, roleKeysParam, {
      limit: ROLE_SUGGEST_PAGE_SIZE,
      offset: 0,
      fitAvailable: FIT_AVAILABLE,
    }),
    queryFn: async () => {
      const res = await projectAPI.listOrgResourcePool(
        orgId,
        {
          view: 'roleSuggest',
          projectRoleKeys: roleKeysParam,
          limit: ROLE_SUGGEST_PAGE_SIZE,
          offset: 0,
          fitAvailable: 1,
        },
        { skipPermissionDeniedToast: true }
      );
      return unwrap(res);
    },
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });

  const byRole = data?.byRole || {};
  const hasMoreByRole = data?.paging?.hasMoreByRole || {};

  const sectionStatus =
    sectionMeta?.hint === 'error' ? 'error' : sectionMeta?.complete ? 'complete' : 'partial';
  const statusDetail =
    sectionMeta?.assigned != null && sectionMeta.assigned < 3
      ? `${sectionMeta.assigned} / 3`
      : '';

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
    setOpenRole('');
  };

  return (
    <IntakeSection
      index={3}
      sectionId="intake-section-team"
      title={t('adminTasks.intakeSectionTeam') || 'Core team'}
      subtitle={t('adminTasks.wizardStepTeamHint')}
      status={sectionStatus}
      statusDetail={statusDetail}
      t={t}
    >
      <p className="text-xs text-muted-foreground">{t('adminTasks.wizardIntakeDualOk')}</p>
      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {isError ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.wizardSuggestLoadFail')}</p>
      ) : null}
      <div className="space-y-3">
        {INTAKE_LEAD_ROLE_KEYS.map((roleKey) => (
          <RoleCard
            key={roleKey}
            roleKey={roleKey}
            slot={slots[roleKey]}
            fieldError={fieldErrors[roleKey]}
            showErrors={showErrors}
            expanded={openRole === roleKey}
            onToggle={() => setOpenRole((prev) => (prev === roleKey ? '' : roleKey))}
            orgId={orgId}
            pool={byRole}
            hasMoreByRole={hasMoreByRole}
            onPick={(item) => onPick(roleKey, item)}
            t={t}
          />
        ))}
      </div>
    </IntakeSection>
  );
}
