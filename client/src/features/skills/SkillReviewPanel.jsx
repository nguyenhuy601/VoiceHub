import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Pencil, X } from 'lucide-react';

import GradientButton from '../../components/Shared/GradientButton';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { requirementAPI } from '../../services/api/requirementAPI';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function SkillReviewPanel({
  orgId,
  skills = [],
  onChanged,
  compact = false,
  canReview = false,
}) {
  const { t } = useAppStrings();
  const [busyId, setBusyId] = useState('');
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');

  const pendingSkills = (skills || []).filter((s) => String(s.status || '').toUpperCase() === 'PENDING');

  if (!pendingSkills.length) return null;

  const review = async (skillId, action, payload = {}) => {
    if (!orgId || !skillId || busyId) return;
    setBusyId(skillId);
    try {
      await requirementAPI.reviewSkill(orgId, skillId, { action, ...payload });
      toast.success(t('requirements.skillReviewSuccess'));
      setEditId('');
      onChanged?.();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('requirements.skillReviewFail') }));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col rounded-xl border border-amber-500/30 bg-amber-500/5 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t('requirements.newSkillsDetectedTitle', { count: pendingSkills.length })}
        </h3>
      </div>
      {!canReview ? (
        <p className="mt-2 shrink-0 text-xs text-muted-foreground">{t('requirements.skillReviewReadOnlyHint')}</p>
      ) : null}
      <div
        className={`mt-3 min-h-0 flex-1 overflow-auto scrollbar-overlay ${
          compact ? '' : 'max-h-[min(50vh,28rem)]'
        }`}
      >
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-2 py-1 font-medium">{t('requirements.newSkillsColSkill')}</th>
              <th className="px-2 py-1 font-medium">{t('requirements.newSkillsColSuggested')}</th>
              <th className="px-2 py-1 font-medium">{t('requirements.newSkillsColStatus')}</th>
              {canReview ? (
                <th className="px-2 py-1 font-medium">{t('requirements.newSkillsColActions')}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {pendingSkills.map((skill) => {
              const skillId = String(skill.skillId || skill._id || '');
              const isEditing = editId === skillId;
              return (
                <tr key={skillId || skill.input} className="border-t border-border/60">
                  <td className="px-2 py-2 font-medium text-foreground">{skill.input || skill.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {skill.suggestedCanonical || skill.name}
                  </td>
                  <td className="px-2 py-2">
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-200">
                      {skill.status || 'PENDING'}
                    </span>
                  </td>
                  {canReview ? (
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="min-w-[8rem] rounded border border-border bg-background px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              disabled={busyId === skillId}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:bg-muted/40"
                              onClick={() => review(skillId, 'edit', { name: editName })}
                            >
                              <Check className="h-3 w-3" />
                              {t('requirements.skillReviewSave')}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:bg-muted/40"
                              onClick={() => setEditId('')}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <GradientButton
                              variant="shell"
                              disabled={busyId === skillId}
                              onClick={() => review(skillId, 'accept')}
                              className="px-2 py-1 text-[11px]"
                            >
                              {t('requirements.skillReviewAccept')}
                            </GradientButton>
                            <button
                              type="button"
                              disabled={busyId === skillId}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:bg-muted/40"
                              onClick={() => {
                                setEditId(skillId);
                                setEditName(skill.suggestedCanonical || skill.name || '');
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                              {t('requirements.skillReviewEdit')}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === skillId}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-destructive hover:bg-destructive/10"
                              onClick={() => review(skillId, 'reject')}
                            >
                              {t('requirements.skillReviewReject')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function fetchPendingSkills(orgId, { status = 'PENDING', limit = 100 } = {}) {
  const res = await requirementAPI.listSkills(orgId, { status, limit });
  const data = unwrap(res);
  return data?.items || [];
}
