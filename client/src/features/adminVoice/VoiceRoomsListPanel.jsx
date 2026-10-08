import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
  adminManageLinkClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminVoiceRooms from '../../hooks/useAdminVoiceRooms';
import { adminQueryHubLink } from '../../utils/adminHubLinks';

const VOICE_MANAGE_ROOMS = '/app/admin/voice/manage-rooms';

function roomId(ch) {
  return String(ch._id || ch.id);
}

export default function VoiceRoomsListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { voiceRooms, loading, error, loadRooms } = useAdminVoiceRooms(orgId);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return voiceRooms;
    return voiceRooms.filter((ch) => {
      const name = String(ch.name || '').toLowerCase();
      const scope = String(ch._scopeName || '').toLowerCase();
      const id = String(ch._id || ch.id || '').toLowerCase();
      return name.includes(q) || scope.includes(q) || id.includes(q);
    });
  }, [voiceRooms, query]);

  const manageLink = (ch) => (
    <Link to={adminQueryHubLink(VOICE_MANAGE_ROOMS, { roomId: roomId(ch) })} className={adminManageLinkClass()}>
      {t('adminDomains.voice.manageRooms')}
    </Link>
  );

  return (
    <AdminUserPanelShell
      title={t('adminDomains.voice.rooms')}
      hint={t('adminVoice.roomsHint')}
      wide
      actions={
        <Link to={VOICE_MANAGE_ROOMS} className={adminSecondaryBtnClass()}>
          {t('adminDomains.voice.manageRooms')}
        </Link>
      }
    >
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminVoice.searchRoom')}
            aria-label={t('adminVoice.searchRoom')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <AdminDenseTableCard>
        {loading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : error ? (
          <div className="space-y-3 px-4 py-6">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadRooms()}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <AdminDenseTableScroll>
            <AdminDenseMobileList
              items={filtered}
              getKey={roomId}
              ariaLabel={t('adminDomains.voice.rooms')}
              renderTitle={(ch) => ch.name || '—'}
              renderMeta={(ch) => ch._scopeName || '—'}
              renderActions={manageLink}
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-4 py-3">{t('adminVoice.colRoom')}</th>
                  <th className="px-4 py-3">{t('adminVoice.colScope')}</th>
                  <th className="px-4 py-3">{t('adminVoice.colId')}</th>
                  <th className="px-4 py-3">{t('adminVoice.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ch) => {
                  const id = roomId(ch);
                  return (
                    <tr key={id} className={adminDenseRowClass()}>
                      <td className="px-4 py-3 font-medium text-foreground">{ch.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ch._scopeName || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{id}</td>
                      <td className="px-4 py-3">{manageLink(ch)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {voiceRooms.length ? t('adminVoice.noRoomsMatch') : t('adminVoice.noRooms')}
              </p>
            ) : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </AdminUserPanelShell>
  );
}
