/**
 * Vertical sortable list for admin role catalogs (@dnd-kit).
 * Header + rows share one CSS grid (including grip column) so columns stay aligned.
 */
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { reorderIds } from '../../utils/adminSortOrder';

/** Default: grip | key | label | meta | actions */
export const ADMIN_ROLE_LIST_GRID =
  'grid-cols-[2rem_minmax(6.5rem,1.15fr)_minmax(5.5rem,1fr)_minmax(5.5rem,1.25fr)_minmax(9.5rem,11.5rem)]';

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="text-muted-foreground">
      <circle cx="5" cy="4" r="1.2" fill="currentColor" />
      <circle cx="11" cy="4" r="1.2" fill="currentColor" />
      <circle cx="5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="11" cy="8" r="1.2" fill="currentColor" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="11" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function SortableRow({ id, disabled, gridClassName, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid items-start gap-x-2 gap-y-1 border-b border-border/50 bg-background py-2.5 ${gridClassName}`}
    >
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Drag to reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      {children}
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array<{ _id?: string, id?: string }>} props.items
 * @param {(item: object) => React.ReactNode} props.renderCells — cell nodes after the grip column
 * @param {React.ReactNode} [props.headerCells] — header cells after grip spacer (same column count)
 * @param {(orderedIds: string[]) => void | Promise<void>} props.onReorder
 * @param {boolean} [props.disabled]
 * @param {string} [props.emptyLabel]
 * @param {string} [props.className]
 * @param {string} [props.gridClassName]
 */
export default function AdminSortableRoleList({
  items,
  renderCells,
  headerCells = null,
  onReorder,
  disabled = false,
  emptyLabel = '',
  className = '',
  gridClassName = ADMIN_ROLE_LIST_GRID,
}) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ids = useMemo(
    () => (items || []).map((row) => String(row._id || row.id)).filter(Boolean),
    [items]
  );

  const byId = useMemo(() => {
    const map = new Map();
    for (const row of items || []) {
      map.set(String(row._id || row.id), row);
    }
    return map;
  }, [items]);

  const activeItem = activeId ? byId.get(String(activeId)) : null;

  if (!(items || []).length) {
    return emptyLabel ? <p className="px-1 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p> : null;
  }

  return (
    <div className={`min-w-0 overflow-x-auto ${className}`}>
      <div className="min-w-[36rem]">
        {headerCells ? (
          <div
            className={`mb-1 grid items-end gap-x-2 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${gridClassName}`}
          >
            <span aria-hidden className="block h-4 w-8" />
            {headerCells}
          </div>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveId(String(event.active.id))}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={async (event) => {
            setActiveId(null);
            if (disabled) return;
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = ids.indexOf(String(active.id));
            const newIndex = ids.indexOf(String(over.id));
            if (oldIndex < 0 || newIndex < 0) return;
            const nextIds = reorderIds(ids, oldIndex, newIndex);
            await onReorder?.(nextIds);
          }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {ids.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              return (
                <SortableRow key={id} id={id} disabled={disabled} gridClassName={gridClassName}>
                  {renderCells(item)}
                </SortableRow>
              );
            })}
          </SortableContext>
          <DragOverlay>
            {activeItem ? (
              <div
                className={`rounded-lg border border-border bg-card px-2 py-2 text-sm shadow-lg opacity-95 grid items-center gap-x-2 ${gridClassName}`}
              >
                <span className="flex h-8 w-8 items-center justify-center opacity-50">
                  <GripIcon />
                </span>
                {renderCells(activeItem)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
