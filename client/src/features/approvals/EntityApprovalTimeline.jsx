import { useCallback, useEffect, useState } from 'react';
import { projectAPI } from '../../services/api/projectAPI';
import { useAppStrings } from '../../locales/appStrings';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Lịch sử ApprovalRequest cho một entity (task / stub MR|Release).
 */
export default function EntityApprovalTimeline({
  entityType = 'task',
  entityId = '',
  isDarkMode = false,
}) {
  const { t } = useAppStrings();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await projectAPI.listEntityApprovals(entityType, entityId);
      const data = unwrap(res);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!entityId) return null;

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const border = isDarkMode ? 'border-white/10' : 'border-slate-200';

  return (
    <div className={`mt-4 rounded-lg border ${border} p-3`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('approvals.historyTitle')}</h4>
        <button type="button" className={`text-[11px] font-semibold ${muted}`} onClick={load}>
          {loading ? '…' : t('common.refresh') || 'Refresh'}
        </button>
      </div>
      {!rows.length ? (
        <p className={`text-xs ${muted}`}>{t('approvals.historyEmpty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((req) => {
            const steps = Array.isArray(req.stepsSnapshot) ? req.stepsSnapshot : [];
            const decisions = Array.isArray(req.decisions) ? req.decisions : [];
            return (
              <li key={String(req._id)} className={`rounded-md border ${border} px-2.5 py-2`}>
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-semibold">
                    {req.policyKey || 'approval'} · {req.status}
                  </span>
                  <span className={muted}>
                    {req.fromStatus || '—'} → {req.toStatus || '—'}
                  </span>
                </div>
                <ol className="mt-2 space-y-1">
                  {steps.map((step, idx) => {
                    const dec = decisions.find((d) => Number(d.stepIndex) === idx);
                    const isCurrent = req.status === 'pending' && Number(req.currentStep) === idx;
                    return (
                      <li
                        key={`${req._id}-${idx}`}
                        className={`text-[11px] ${isCurrent ? 'font-semibold text-amber-600 dark:text-amber-300' : muted}`}
                      >
                        {idx + 1}. {step.roleKey || step.approverType || '—'}
                        {dec
                          ? ` — ${dec.decision}${dec.comment ? `: ${dec.comment}` : ''}`
                          : isCurrent
                            ? ` — ${t('approvals.waitingStep')}`
                            : ''}
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
