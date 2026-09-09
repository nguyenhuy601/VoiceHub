import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function slugKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32);
}

function SortableCatalogRow({
  row,
  idx,
  disabled,
  deleteAria,
  cannotDeleteLast,
  rowsLength,
  onLabelChange,
  onDelete,
}) {
  const id = String(row.key || idx);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2">
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded border border-border px-1.5 py-1 text-xs text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="w-28 shrink-0 truncate font-mono text-xs text-muted-foreground" title={row.key}>
        {row.key}
      </span>
      <input
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        value={row.label || ''}
        disabled={disabled}
        onChange={(e) => onLabelChange(idx, e.target.value)}
      />
      <button
        type="button"
        className="shrink-0 rounded-md border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive disabled:opacity-40"
        disabled={disabled || (cannotDeleteLast && rowsLength <= 1)}
        aria-label={deleteAria}
        onClick={() => onDelete(idx)}
      >
        ×
      </button>
    </li>
  );
}

/**
 * Danh sách key/label: sửa label (key cố định), kéo dọc sắp xếp, xóa/thêm dòng.
 */
export default function CatalogKeyLabelEditor({
  items = [],
  disabled = false,
  addKeyPh = 'key',
  addLabelPh = 'Label',
  addText = 'Add',
  emptyText = '',
  deleteAria = 'Delete',
  cannotDeleteLast = true,
  onChange,
}) {
  const [draftKey, setDraftKey] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const rows = Array.isArray(items) ? items : [];
  const sortableIds = rows.map((r, i) => String(r.key || i));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const emit = (next) => onChange?.(next);

  const addRow = () => {
    const key = slugKey(draftKey);
    if (!key || disabled) return;
    if (rows.some((r) => String(r.key) === key)) return;
    emit([...rows, { key, label: String(draftLabel || key).trim() || key }]);
    setDraftKey('');
    setDraftLabel('');
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id || disabled) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    emit(arrayMove(rows, oldIndex, newIndex));
  };

  return (
    <div className="space-y-2">
      {rows.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {rows.map((row, idx) => (
                <SortableCatalogRow
                  key={row.key || idx}
                  row={row}
                  idx={idx}
                  disabled={disabled}
                  deleteAria={deleteAria}
                  cannotDeleteLast={cannotDeleteLast}
                  rowsLength={rows.length}
                  onLabelChange={(i, label) => {
                    const next = rows.map((r, j) => (j === i ? { ...r, label } : r));
                    emit(next);
                  }}
                  onDelete={(i) => emit(rows.filter((_, j) => j !== i))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : emptyText ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <input
          className="w-28 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary"
          value={draftKey}
          disabled={disabled}
          placeholder={addKeyPh}
          onChange={(e) => setDraftKey(slugKey(e.target.value) || e.target.value.toLowerCase())}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData?.getData('text') || '';
            setDraftKey(slugKey(text));
          }}
        />
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          value={draftLabel}
          disabled={disabled}
          placeholder={addLabelPh}
          onChange={(e) => setDraftLabel(e.target.value)}
        />
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
          disabled={disabled || !slugKey(draftKey)}
          onClick={addRow}
        >
          {addText}
        </button>
      </div>
    </div>
  );
}
