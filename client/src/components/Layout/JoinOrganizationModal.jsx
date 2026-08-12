import { useState } from 'react';
import { Building2, Link2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShellLayout } from '../../context/ShellLayoutContext';
import { useOrganizationsMy } from '../../hooks/queries';
import { orgRecordId } from '../../utils/orgListUtils';
import { useAppStrings } from '../../locales/appStrings';

function extractInvitePayloadFromInput(raw) {
  if (!raw) return { orgId: '', token: '' };
  const input = raw.trim();
  if (!input) return { orgId: '', token: '' };
  try {
    const url = new URL(input);
    return {
      orgId: url.searchParams.get('orgId') || url.searchParams.get('inviteOrgId') || '',
      token: url.searchParams.get('inviteToken') || '',
    };
  } catch {
    const tokenRaw =
      (input.includes('inviteToken=') && input.split('inviteToken=')[1]?.split('&')[0]) || '';
    const token = tokenRaw ? decodeURIComponent(tokenRaw) : '';
    const orgIdRaw =
      (input.includes('orgId=') && input.split('orgId=')[1]?.split('&')[0]) ||
      (input.includes('inviteOrgId=') && input.split('inviteOrgId=')[1]?.split('&')[0]) ||
      '';
    const orgId = orgIdRaw ? decodeURIComponent(orgIdRaw) : '';
    return { orgId, token };
  }
}

const ORG_COLORS = ['#10B981', '#8B5CF6', '#2563EB', '#F59E0B', '#06B6D4'];

export default function JoinOrganizationModal() {
  const { joinModalOpen, closeJoinModal } = useShellLayout();
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [joinTab, setJoinTab] = useState('code');
  const [joinCode, setJoinCode] = useState('');
  const { data: myOrgs = [] } = useOrganizationsMy({ enabled: joinModalOpen });

  if (!joinModalOpen) return null;

  const handleJoinByCode = () => {
    const { orgId, token } = extractInvitePayloadFromInput(joinCode);
    if (!orgId || !token) {
      toast.error(t('workspace.joinInvalidLink'));
      return;
    }
    const params = new URLSearchParams({ inviteOrgId: orgId, inviteToken: token });
    closeJoinModal();
    setJoinCode('');
    navigate(`/app/collaborate/workspaces?${params.toString()}`);
  };

  const handleBrowseJoin = (org) => {
    const id = orgRecordId(org);
    if (!id) return;
    closeJoinModal();
    navigate(`/app/collaborate/join/${encodeURIComponent(id)}`);
  };

  const browseOrgs = myOrgs.filter((o) => String(o?.visibility || o?.type || '').toLowerCase() === 'public');

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={closeJoinModal}
      role="presentation"
    >
      <div
        className="w-[min(440px,calc(100vw-2rem))] max-w-[92vw] animate-scale-in overflow-hidden rounded-[18px] border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-primary to-primary-hover">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-foreground">{t('workspace.joinOrg')}</div>
            <div className="text-[0.7812rem] text-muted-foreground">{t('workspace.joinOrgDesc')}</div>
          </div>
          <button
            type="button"
            onClick={closeJoinModal}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] border-none bg-muted text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex border-b border-border">
          {[
            { id: 'code', label: t('workspace.joinTabCode') },
            { id: 'browse', label: t('workspace.joinTabBrowse') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setJoinTab(tab.id)}
              className={`flex-1 border-none bg-transparent py-2.5 text-[0.8125rem] transition ${
                joinTab === tab.id
                  ? '-mb-px border-b-2 border-primary font-semibold text-primary'
                  : 'font-normal text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-5">
          {joinTab === 'code' ? (
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-[0.8125rem] font-medium text-foreground">
                  {t('workspace.joinFieldLabel')}
                </label>
                <div className="relative">
                  <Link2
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder={t('workspace.joinPlaceholder')}
                    className="h-[42px] w-full rounded-[9px] border border-border bg-muted pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{t('workspace.joinContactAdmin')}</p>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={closeJoinModal}
                  className="h-10 flex-1 rounded-[9px] border-none bg-muted text-sm font-medium text-foreground"
                >
                  {t('workspace.joinCancel')}
                </button>
                <button
                  type="button"
                  onClick={handleJoinByCode}
                  className="h-10 flex-1 rounded-[9px] border-none bg-gradient-to-br from-primary to-primary-hover text-sm font-semibold text-primary-foreground shadow-md"
                >
                  {t('workspace.joinNow')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[0.8125rem] text-muted-foreground">{t('workspace.joinBrowseIntro')}</p>
              {browseOrgs.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-4 text-center text-sm text-muted-foreground">
                  {t('workspace.joinNoPublic')}
                </p>
              ) : (
                browseOrgs.map((org, idx) => {
                  const color = ORG_COLORS[idx % ORG_COLORS.length];
                  const name = org.name || org.title || 'Organization';
                  const members = org.memberCount ?? org.membersCount ?? 0;
                  return (
                    <div
                      key={orgRecordId(org)}
                      className="flex items-center gap-3 rounded-[10px] border border-border bg-background p-3"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
                        style={{ background: `${color}20` }}
                      >
                        <Building2 size={16} style={{ color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">{name}</div>
                        <div className="text-xs text-muted-foreground">
                          {members} {t('workspace.joinMembers')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBrowseJoin(org)}
                        className="shrink-0 rounded-[7px] border px-3 py-1 text-xs font-semibold transition hover:text-white"
                        style={{
                          background: `${color}15`,
                          color,
                          borderColor: `${color}30`,
                        }}
                      >
                        {t('workspace.join')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
