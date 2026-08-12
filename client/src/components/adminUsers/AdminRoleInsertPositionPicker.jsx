/**
 * Radio list: choose where a new role appears relative to existing catalog rows.
 */
import { adminLabelClass } from './adminUserPanelUi';

/**
 * @typedef {{ place: 'start'|'end'|'after', afterRoleId?: string }} InsertPlaceValue
 */

/**
 * @param {object} props
 * @param {Array<{ _id?: string, id?: string, key?: string, label?: string, isSystem?: boolean }>} props.roles
 * @param {InsertPlaceValue} props.value
 * @param {(next: InsertPlaceValue) => void} props.onChange
 * @param {string} [props.title]
 * @param {string} [props.hint]
 * @param {string} [props.startLabel]
 * @param {string} [props.endLabel]
 * @param {string} [props.afterPrefix]
 * @param {boolean} [props.loading]
 * @param {string} [props.emptyLabel]
 * @param {string} [props.previewLabel] — optional ghost row for the role being created
 */
export default function AdminRoleInsertPositionPicker({
  roles,
  value,
  onChange,
  title,
  hint,
  startLabel = 'Đầu danh sách',
  endLabel = 'Cuối danh sách',
  afterPrefix = 'Sau',
  loading = false,
  emptyLabel = '',
  previewLabel = '',
}) {
  const sorted = [...(roles || [])].sort(
    (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
  );
  const place = value?.place || 'end';
  const afterRoleId = String(value?.afterRoleId || '');

  const optionClass = (active) =>
    `flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
      active ? 'border-red-500/50 bg-red-500/5' : 'border-border hover:bg-muted/40'
    }`;

  if (loading) {
    return (
      <div className="mb-4">
        {title ? <p className={adminLabelClass()}>{title}</p> : null}
        <p className="text-sm text-muted-foreground">…</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {title ? <p className={`${adminLabelClass()} mb-2`}>{title}</p> : null}
      {hint ? <p className="mb-2 text-xs text-muted-foreground">{hint}</p> : null}

      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
        <label className={optionClass(place === 'start')}>
          <input
            type="radio"
            className="mt-1"
            name="role-insert-place"
            checked={place === 'start'}
            onChange={() => onChange({ place: 'start' })}
          />
          <span>
            <span className="font-medium">{startLabel}</span>
            {previewLabel && place === 'start' ? (
              <span className="mt-0.5 block text-xs text-red-600">→ {previewLabel}</span>
            ) : null}
          </span>
        </label>

        {sorted.map((role) => {
          const id = String(role._id || role.id);
          const active = place === 'after' && afterRoleId === id;
          return (
            <label key={id} className={optionClass(active)}>
              <input
                type="radio"
                className="mt-1"
                name="role-insert-place"
                checked={active}
                onChange={() => onChange({ place: 'after', afterRoleId: id })}
              />
              <span className="min-w-0">
                <span className="font-medium">
                  {afterPrefix}: {role.label || role.key}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {role.key}
                  {role.isSystem ? ' · System' : ''}
                </span>
                {previewLabel && active ? (
                  <span className="mt-0.5 block text-xs text-red-600">→ {previewLabel}</span>
                ) : null}
              </span>
            </label>
          );
        })}

        {!sorted.length && emptyLabel ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        ) : null}

        <label className={optionClass(place === 'end')}>
          <input
            type="radio"
            className="mt-1"
            name="role-insert-place"
            checked={place === 'end'}
            onChange={() => onChange({ place: 'end' })}
          />
          <span>
            <span className="font-medium">{endLabel}</span>
            {previewLabel && place === 'end' ? (
              <span className="mt-0.5 block text-xs text-red-600">→ {previewLabel}</span>
            ) : null}
          </span>
        </label>
      </div>
    </div>
  );
}
