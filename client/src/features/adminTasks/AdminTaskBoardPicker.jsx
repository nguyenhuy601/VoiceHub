import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminUserFormCard,
  adminInputClass,
  adminLabelClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import useAdminOrgBoards, {
  boardCodeOf,
  boardIdOf,
  boardTitleOf,
} from './useAdminOrgBoards';

/**
 * Searchable board picker — không bắt nhập ObjectId.
 */
export default function AdminTaskBoardPicker({
  orgId,
  boardId,
  onBoardIdChange,
  boards: boardsProp,
  loading: loadingProp,
}) {
  const { t } = useAppStrings();
  const hook = useAdminOrgBoards(boardsProp ? null : orgId);
  const boards = boardsProp || hook.boards;
  const loading = loadingProp ?? hook.loading;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => {
      const title = boardTitleOf(b).toLowerCase();
      const code = boardCodeOf(b).toLowerCase();
      const id = boardIdOf(b).toLowerCase();
      return title.includes(q) || code.includes(q) || id.includes(q);
    });
  }, [boards, query]);

  const selected = boards.find((b) => boardIdOf(b) === String(boardId || ''));

  return (
    <AdminUserFormCard title={t('adminTasks.pickBoard')} hint={t('adminTasks.pickBoardHint')}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminTasks.pickBoardPlaceholder')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
        <label className={adminLabelClass()}>
          {t('adminTasks.pickBoard')}
          <select
            className={adminInputClass()}
            value={String(boardId || '')}
            onChange={(e) => onBoardIdChange?.(e.target.value)}
            disabled={loading}
          >
            <option value="">{t('adminTasks.needBoard')}</option>
            {filtered.map((b) => {
              const id = boardIdOf(b);
              const code = boardCodeOf(b);
              return (
                <option key={id} value={id}>
                  {boardTitleOf(b)}
                  {code ? ` (${code})` : ''}
                </option>
              );
            })}
          </select>
        </label>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
        ) : null}
        {!loading && !filtered.length ? (
          <p className="text-sm text-muted-foreground">{t('adminTasks.pickBoardEmpty')}</p>
        ) : null}
        {selected ? (
          <p className="text-xs text-muted-foreground">
            {boardTitleOf(selected)}
            {boardCodeOf(selected) ? ` · ${boardCodeOf(selected)}` : ''}
          </p>
        ) : null}
      </div>
    </AdminUserFormCard>
  );
}
