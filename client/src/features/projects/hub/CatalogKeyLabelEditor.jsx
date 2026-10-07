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
import {
  adminDangerBtnClass,
  adminInputClass,
  adminSecondaryBtnClass,
} from '../../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../../components/Shared';
import { useAppStrings } from '../../../locales/appStrings';

const KEY_MAX_LENGTH = 32;
const LABEL_MAX_LENGTH = 100;

export function slugKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, KEY_MAX_LENGTH);
}

function SortableCatalogRow({
  row,
  idx,
  disabled,
  deleteAria,
  reorderAria,
  labelAria,
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
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 motion-reduce:!transition-none ${
        isDragging ? 'opacity-[0.55] motion-reduce:opacity-100' : ''
      }`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded border border-border px-1.5 py-1 text-xs text-muted-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground"
        disabled={disabled}
        aria-label={reorderAria}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="w-28 shrink-0 truncate font-mono text-xs text-muted-foreground" title={row.key}>
        {row.key}
      </span>
      <input
        className={adminInputClass('!w-auto min-w-0 flex-1 !px-2 !py-1.5')}
        value={row.label || ''}
        maxLength={LABEL_MAX_LENGTH}
        disabled={disabled}
        aria-label={labelAria}
        onChange={(e) => onLabelChange(idx, e.target.value)}
      />
      <button
        type="button"
        className={adminDangerBtnClass('shrink-0 !px-2 !py-1 text-xs')}
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
 * Placeholder / nhãn nút do parent truyền; mặc định lấy từ i18n.
 */
export default function CatalogKeyLabelEditor({
  items = [],
  disabled = false,
  addKeyPh = 'key',
  addLabelPh = 'Label',
  addText,
  emptyText = '',
  deleteAria,
  cannotDeleteLast = true,
  onChange,
}) {
  const { t } = useAppStrings();
  const [draftKey, setDraftKey] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState(-1);
  const rows = Array.isArray(items) ? items : [];
  const sortableIds = rows.map((r, i) => String(r.key || i));
  const pendingDeleteRow = pendingDeleteIdx >= 0 ? rows[pendingDeleteIdx] : null;
  const resolvedAddText = addText || t('adminTasks.catalogAdd');
  const resolvedDeleteAria = deleteAria || t('adminTasks.catalogDelete');

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
                  deleteAria={resolvedDeleteAria}
                  reorderAria={t('adminTasks.catalogReorderAria', { key: row.key })}
                  labelAria={t('adminTasks.catalogLabelAria', { key: row.key })}
                  cannotDeleteLast={cannotDeleteLast}
                  rowsLength={rows.length}
                  onLabelChange={(i, label) => {
                    const next = rows.map((r, j) => (j === i ? { ...r, label } : r));
                    emit(next);
                  }}
                  onDelete={setPendingDeleteIdx}
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
          className={adminInputClass('!w-28 !px-2 !py-1.5 font-mono text-xs')}
          value={draftKey}
          maxLength={KEY_MAX_LENGTH}
          disabled={disabled}
          placeholder={addKeyPh}
          aria-label={t('adminTasks.catalogNewKeyAria')}
          onChange={(e) => setDraftKey(slugKey(e.target.value) || e.target.value.toLowerCase())}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData?.getData('text') || '';
            setDraftKey(slugKey(text));
          }}
        />
        <input
          className={adminInputClass('!w-auto min-w-0 flex-1 !px-2 !py-1.5')}
          value={draftLabel}
          maxLength={LABEL_MAX_LENGTH}
          disabled={disabled}
          placeholder={addLabelPh}
          aria-label={t('adminTasks.catalogNewLabelAria')}
          onChange={(e) => setDraftLabel(e.target.value)}
        />
        <button
          type="button"
          className={adminSecondaryBtnClass('!px-3 !py-1.5 text-xs font-semibold')}
          disabled={disabled || !slugKey(draftKey)}
          onClick={addRow}
        >
          {resolvedAddText}
        </button>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteRow)}
        onClose={() => setPendingDeleteIdx(-1)}
        onConfirm={() => emit(rows.filter((_, j) => j !== pendingDeleteIdx))}
        title={t('adminTasks.confirmTitle')}
        message={t('adminTasks.catalogDeleteConfirm', { key: pendingDeleteRow?.key || '' })}
        confirmText={t('adminTasks.delete')}
        cancelText={t('adminTasks.cancel')}
        variant="danger"
      />
    </div>
  );
}
