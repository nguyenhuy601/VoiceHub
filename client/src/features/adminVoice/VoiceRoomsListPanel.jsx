import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import useAdminVoiceRooms from '../../hooks/useAdminVoiceRooms';

export default function VoiceRoomsListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { voiceRooms, loading } = useAdminVoiceRooms(orgId);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('adminDomains.voice.rooms')}</h2>
          <p className="text-sm text-muted-foreground">{t('adminVoice.roomsHint')}</p>
        </div>
        <Link
          to="/app/admin/voice/manage-rooms"
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
        >
          {t('adminDomains.voice.manageRooms')}
        </Link>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminVoice.searchRoom')}
        className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="overflow-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t('adminVoice.colRoom')}</th>
              <th className="px-3 py-2">{t('adminVoice.colScope')}</th>
              <th className="px-3 py-2">{t('adminVoice.colId')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ch) => {
              const id = String(ch._id || ch.id);
              return (
                <tr key={id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{ch.name || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{ch._scopeName || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{id}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading ? <p className="px-3 py-4 text-sm text-muted-foreground">{t('common.loading')}</p> : null}
        {!loading && !filtered.length ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminVoice.noRooms')}</p>
        ) : null}
      </div>
    </div>
  );
}
