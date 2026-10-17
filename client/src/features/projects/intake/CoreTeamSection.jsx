import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Circle } from 'lucide-react';
import { queryKeys } from '../../../lib/queryKeys';
import { projectAPI } from '../../../services/api/projectAPI';
import { PROJECT_ROLE_LABELS } from '../../../utils/roleTaxonomy';
import { isWorkloadFull, isWorkloadPartial } from '../../../utils/wizardRelatedDeptMembers';
import {
  ROLE_SUGGEST_PAGE_SIZE,
  countAssignedGateSlots,
  gateRoleKeys,
  positionHintsForRole,
} from '../wizard/projectWizardIntakeRoles';
import { useRoleSuggestColumn } from '../wizard/useRoleSuggestColumn';
import { wizardUi } from '../wizard/projectWizardUi';
import { intakeUi } from './intakeUi';
import IntakeSection from './IntakeSection';

const FIT_AVAILABLE = true;
const HIDDEN_ROLE_KEYS = new Set(['observer', 'watcher', 'intern', 'reviewer']);

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function roleLabel(role) {
  const key = String(role?.key || '').trim().toLowerCase();
  const raw = String(role?.label || PROJECT_ROLE_LABELS[key] || key).trim();
  return raw.replace(/^Dự án —\s*/i, '').replace(/^Project Role —\s*/i, '');
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
    enabled: Boolean(orgId && roleKey),
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
              {item.positionName || t('adminTasks.wizardSuggestNoPosition')}
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
  processKey,
  roleKey,
  label,
  slot,
  fieldError,
  showErrors,
  expanded,
  onToggle,
  onRemove,
  orgId,
  pool,
  hasMoreByRole,
  onPick,
  t,
}) {
  const assigned = Boolean(slot?.userId);
  const hints = positionHintsForRole(roleKey);

  return (
    <div
      id={`intake-field-${processKey}-${roleKey}`}
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
          <p className="mt-1 text-xs text-muted-foreground">
            {hints.length
              ? t('adminTasks.intakePositionHint', { positions: hints.join(', ') })
              : t('adminTasks.intakePositionUnmapped')}
          </p>
          {assigned ? (
            <>
              <p className="mt-1 text-sm text-foreground">{slot.displayName || slot.userId}</p>
              {slot.positionName ? (
                <p className="text-xs text-muted-foreground">{slot.positionName}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t('adminTasks.intakeRoleNotAssigned')}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className={intakeUi.secondaryBtn} onClick={onRemove}>
            {t('adminTasks.intakeRemoveRole')}
          </button>
          <button type="button" className={intakeUi.secondaryBtn} onClick={onToggle}>
            {assigned ? t('adminTasks.intakeRoleChange') : t('adminTasks.intakeRoleAssign')}
          </button>
        </div>
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

function GateGroup({
  index,
  sectionId,
  processKey,
  title,
  subtitle,
  sectionMeta,
  slots,
  catalogRoles,
  labelByKey,
  orgId,
  pool,
  hasMoreByRole,
  fieldErrors,
  showErrors,
  onAddRole,
  onRemoveRole,
  onPick,
  t,
}) {
  const [openRole, setOpenRole] = useState('');
  const [draftRole, setDraftRole] = useState('');
  const selectedKeys = gateRoleKeys({ [processKey]: slots }, processKey);
  const available = catalogRoles.filter((role) => !selectedKeys.includes(String(role.key || '').toLowerCase()));
  const assigned = countAssignedGateSlots({ [processKey]: slots }, processKey);
  const sectionStatus =
    sectionMeta?.hint === 'error' ? 'error' : sectionMeta?.complete ? 'complete' : 'partial';
  const processError = fieldErrors[processKey];

  return (
    <IntakeSection
      index={index}
      sectionId={sectionId}
      title={title}
      subtitle={subtitle}
      status={sectionStatus}
      statusDetail={assigned ? String(assigned) : ''}
      t={t}
    >
      <p className="text-xs text-muted-foreground">{t('adminTasks.wizardIntakeDualOk')}</p>
      <div id={`intake-field-${processKey}`} className="space-y-3">
        {selectedKeys.map((roleKey) => (
          <RoleCard
            key={`${processKey}-${roleKey}`}
            processKey={processKey}
            roleKey={roleKey}
            label={labelByKey.get(roleKey) || PROJECT_ROLE_LABELS[roleKey] || roleKey}
            slot={slots[roleKey]}
            fieldError={fieldErrors[`${processKey}:${roleKey}`]}
            showErrors={showErrors}
            expanded={openRole === roleKey}
            onToggle={() => setOpenRole((prev) => (prev === roleKey ? '' : roleKey))}
            onRemove={() => onRemoveRole(processKey, roleKey)}
            orgId={orgId}
            pool={pool}
            hasMoreByRole={hasMoreByRole}
            onPick={(item) => onPick(processKey, roleKey, item)}
            t={t}
          />
        ))}
        {!selectedKeys.length ? (
          <p className="text-xs text-muted-foreground">{t('adminTasks.intakeNoRolesYet')}</p>
        ) : null}
      </div>
      {showErrors && processError ? <p className={intakeUi.fieldError}>{processError}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`intake-add-role-${processKey}`}>
          {t('adminTasks.intakePickRole')}
        </label>
        <select
          id={`intake-add-role-${processKey}`}
          className={intakeUi.select}
          value={draftRole}
          onChange={(event) => setDraftRole(event.target.value)}
        >
          <option value="">{t('adminTasks.intakePickRole')}</option>
          {available.map((role) => (
            <option key={role.key} value={role.key}>
              {roleLabel(role, t)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={intakeUi.secondaryBtn}
          disabled={!draftRole}
          onClick={() => {
            onAddRole(processKey, draftRole);
            setDraftRole('');
            setOpenRole(String(draftRole).toLowerCase());
          }}
        >
          {t('adminTasks.intakeAddRole')}
        </button>
      </div>
    </IntakeSection>
  );
}

export default function CoreTeamSection({
  orgId,
  form,
  catalogRoles = [],
  addGateRole,
  removeGateRole,
  setGateAssignee,
  fieldErrors,
  showErrors,
  sectionMeta,
  t,
}) {
  const roles = useMemo(() => {
    const list = (Array.isArray(catalogRoles) ? catalogRoles : [])
      .map((role) => ({
        ...role,
        key: String(role?.key || '').trim().toLowerCase(),
      }))
      .filter((role) => role.key && !HIDDEN_ROLE_KEYS.has(role.key));
    list.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    return list;
  }, [catalogRoles]);

  const labelByKey = useMemo(() => {
    const map = new Map();
    for (const role of roles) map.set(role.key, roleLabel(role, t));
    return map;
  }, [roles, t]);

  const whatSlots = form.gateSlots?.what || {};
  const howSlots = form.gateSlots?.how || {};
  const roleKeysParam = [...new Set([...Object.keys(whatSlots), ...Object.keys(howSlots)])].join(',');

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
    enabled: Boolean(orgId && roleKeysParam),
    staleTime: 60_000,
  });

  const byRole = data?.byRole || {};
  const hasMoreByRole = data?.paging?.hasMoreByRole || {};

  return (
    <>
      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {isError ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.wizardSuggestLoadFail')}</p>
      ) : null}
      <GateGroup
        index={3}
        sectionId="intake-section-analysis-team"
        processKey="what"
        title={t('adminTasks.intakeSectionAnalysisTeam')}
        subtitle={t('adminTasks.intakeSectionAnalysisTeamHint')}
        sectionMeta={sectionMeta?.analysisTeam}
        slots={whatSlots}
        catalogRoles={roles}
        labelByKey={labelByKey}
        orgId={orgId}
        pool={byRole}
        hasMoreByRole={hasMoreByRole}
        fieldErrors={fieldErrors}
        showErrors={showErrors}
        onAddRole={addGateRole}
        onRemoveRole={removeGateRole}
        onPick={setGateAssignee}
        t={t}
      />
      <GateGroup
        index={4}
        sectionId="intake-section-planning-team"
        processKey="how"
        title={t('adminTasks.intakeSectionPlanningTeam')}
        subtitle={t('adminTasks.intakeSectionPlanningTeamHint')}
        sectionMeta={sectionMeta?.planningTeam}
        slots={howSlots}
        catalogRoles={roles}
        labelByKey={labelByKey}
        orgId={orgId}
        pool={byRole}
        hasMoreByRole={hasMoreByRole}
        fieldErrors={fieldErrors}
        showErrors={showErrors}
        onAddRole={addGateRole}
        onRemoveRole={removeGateRole}
        onPick={setGateAssignee}
        t={t}
      />
    </>
  );
}
