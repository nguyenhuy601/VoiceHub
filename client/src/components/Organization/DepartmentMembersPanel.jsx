import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import UserAvatar from '../Shared/UserAvatar';

function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value._id || value.id || value.userId || '');
  return String(value);
}

function displayName(person) {
  if (!person || typeof person !== 'object') return '';
  return (
    person.displayName ||
    person.name ||
    person.fullName ||
    person.username ||
    person.email ||
    ''
  );
}

/**
 * Thành viên phòng ban — People Graph Department.members (+ head).
 */
export default function DepartmentMembersPanel({
  department = null,
  orgMembers = [],
  isDarkMode = false,
}) {
  const { t } = useAppStrings();
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const title = isDarkMode ? 'text-white' : 'text-foreground';

  const rows = useMemo(() => {
    const byId = new Map();
    (orgMembers || []).forEach((m) => {
      const id = asId(m?.user || m);
      if (id) byId.set(id, m);
    });

    const ids = new Set();
    const headId = asId(department?.head);
    if (headId) ids.add(headId);
    (department?.members || []).forEach((m) => {
      const id = asId(m);
      if (id) ids.add(id);
    });

    return [...ids].map((id) => {
      const membership = byId.get(id);
      const user = membership?.user && typeof membership.user === 'object' ? membership.user : null;
      const fromDept =
        typeof department?.head === 'object' && asId(department.head) === id
          ? department.head
          : (department?.members || []).find((m) => asId(m) === id);
      const person = user || (fromDept && typeof fromDept === 'object' ? fromDept : null);
      return {
        id,
        name: displayName(person) || id.slice(-6),
        role: headId === id ? 'head' : String(membership?.role || 'member').toLowerCase(),
        avatarUrl: person?.avatarUrl || person?.avatar || '',
      };
    });
  }, [department, orgMembers]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Users size={18} className="text-primary" />
        <h3 className={`text-sm font-bold ${title}`}>{t('workspace.moduleMembers')}</h3>
        <span className={`text-xs ${muted}`}>({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
          {t('workspace.deptMembersEmpty')}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <UserAvatar
                name={row.name}
                avatar={row.avatarUrl || undefined}
                userId={row.id}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-semibold ${title}`}>{row.name}</div>
                <div className={`text-[0.65rem] uppercase tracking-wide ${muted}`}>
                  {row.role === 'head'
                    ? t('workspace.deptRoleHead')
                    : row.role === 'owner' || row.role === 'admin'
                      ? t(`workspace.role${row.role === 'owner' ? 'Owner' : 'Admin'}Vi`)
                      : t('workspace.roleMemberVi')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
