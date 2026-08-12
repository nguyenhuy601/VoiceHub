/** Huy: Kanban phân cấp vai trò theo tier (priority) — kéo thả cột cập nhật priority. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  TIER_ORDER,
  groupRolesByPriority,
  moveRoleInColumns,
  normalizeRoleDisplayName,
  normalizeRoleId,
  prioritiesFromColumns,
  tierMeta,
} from '../../utils/adminRbacUtils';

function DroppableColumn({ id, children, className = '' }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] rounded-xl transition-[box-shadow] ${className} ${
        isOver ? 'ring-2 ring-red-500/40 ring-offset-2 ring-offset-background' : ''
      }`}
    >
      {children}
    </div>
  );
}

function DraggableRoleCard({ role, children }) {
  const id = normalizeRoleId(role);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { role },
  });
  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-30' : ''}>
      <div {...listeners} {...attributes} className="touch-none outline-none">
        {children}
      </div>
    </div>
  );
}

function RoleCardBody({ role }) {
  const id = normalizeRoleId(role);
  return (
    <Link
      to={`/app/admin/rbac/edit?roleId=${encodeURIComponent(id)}`}
      className="block rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground no-underline shadow-sm transition hover:bg-muted/40 hover:no-underline"
      draggable={false}
    >
      {normalizeRoleDisplayName(role.name)}
    </Link>
  );
}

export default function RolesHierarchyPanel({ orgId }) {
  const { t } = useAppStrings();
  const { systemRoles, loading, loadRoles } = useAdminRoles(orgId);
  const [columns, setColumns] = useState(() => groupRolesByPriority([]));
  const [activeRole, setActiveRole] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setColumns(groupRolesByPriority(systemRoles));
  }, [systemRoles]);

  const tiers = useMemo(() => tierMeta(t), [t]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const persistPriorities = useCallback(
    async (nextColumns) => {
      if (!orgId) return;
      const updates = prioritiesFromColumns(nextColumns);
      const changed = updates.filter((row) => {
        const prev = systemRoles.find((r) => normalizeRoleId(r) === String(row.id));
        return prev && Number(prev.priority) !== Number(row.priority);
      });
      if (!changed.length) return;
      setSaving(true);
      try {
        await Promise.all(
          changed.map(({ id, priority }) =>
            roleAPI.updateRole(id, {
              priority,
              serverId: orgId,
              organizationId: orgId,
            })
          )
        );
        toast.success(t('adminRbac.hierarchySaved'));
        await loadRoles();
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.hierarchySaveFail') }));
        setColumns(groupRolesByPriority(systemRoles));
      } finally {
        setSaving(false);
      }
    },
    [orgId, systemRoles, loadRoles, t]
  );

  const onDragStart = (event) => {
    const role = event.active?.data?.current?.role;
    setActiveRole(role || null);
  };

  const onDragEnd = async (event) => {
    setActiveRole(null);
    const activeId = String(event.active?.id || '');
    const overId = String(event.over?.id || '');
    if (!activeId || !overId || activeId === overId) return;
    const next = moveRoleInColumns(columns, activeId, overId);
    if (!next) return;
    setColumns(next);
    await persistPriorities(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('adminDomains.rbac.hierarchy')}</h2>
          <p className="text-sm text-muted-foreground">{t('adminRbac.hierarchyHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/admin/rbac/roles"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            {t('adminDomains.rbac.roles')}
          </Link>
          <Link
            to="/app/admin/rbac/create"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            {t('adminDomains.rbac.create')}
          </Link>
        </div>
      </div>

      {saving ? (
        <p className="text-xs text-muted-foreground">{t('common.saving')}</p>
      ) : null}

      {loading && !systemRoles.length ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveRole(null)}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {TIER_ORDER.map((tierId) => {
              const meta = tiers.find((row) => row.id === tierId) || { title: tierId, hint: '' };
              const list = columns[tierId] || [];
              return (
                <DroppableColumn
                  key={tierId}
                  id={tierId}
                  className={`border border-border bg-muted/20 p-3 ${meta.border || ''}`}
                >
                  <div className="mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {meta.title}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.hint}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t('adminRbac.hierarchyCount', { n: list.length })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {list.map((role) => (
                      <DraggableRoleCard key={normalizeRoleId(role)} role={role}>
                        <RoleCardBody role={role} />
                      </DraggableRoleCard>
                    ))}
                    {!list.length ? (
                      <p className="rounded-lg border border-dashed border-border/70 px-2 py-6 text-center text-xs text-muted-foreground">
                        {t('adminRbac.hierarchyEmptyCol')}
                      </p>
                    ) : null}
                  </div>
                </DroppableColumn>
              );
            })}
          </div>
          <DragOverlay>
            {activeRole ? (
              <div className="w-[240px] opacity-95 shadow-lg">
                <RoleCardBody role={activeRole} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
