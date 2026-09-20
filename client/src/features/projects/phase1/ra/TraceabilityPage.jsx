import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { modulePathForArtifactKind } from './artifactRelated';
import { kindAccentCardClass, kindChipClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function rowId(row) {
  return String(row?.id || row?._id || '').trim();
}

/**
 * Trace hub — gaps + FR↔UC links.
 * Wave G4: click FR/UC/gap → deep-link analysis-{kind}?artifact= (detail + Related pane).
 */
export default function TraceabilityPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);

  const { data: gaps } = useQuery({
    queryKey: ['projectAnalysisGaps', String(projectId || '')],
    queryFn: async () => unwrap(await analysisAPI.getGaps(projectId)),
    enabled: Boolean(projectId),
  });

  const { data: links = [] } = useQuery({
    queryKey: ['analysisTraceLinks', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listTraceLinks(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: frs = [] } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'FR'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId, { kind: 'FR' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: ucs = [] } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'UC'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId, { kind: 'UC' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const catalogById = useMemo(() => {
    const map = new Map();
    for (const row of [...frs, ...ucs]) {
      const id = rowId(row);
      if (id) map.set(id, row);
    }
    return map;
  }, [frs, ucs]);

  const openArtifact = useCallback(
    (kind, id) => {
      const artifactId = String(id || '').trim();
      const moduleSeg = modulePathForArtifactKind(kind);
      if (!artifactId || !moduleSeg || !projectId) return;
      navigate(buildPhase1ModulePath(projectId, moduleSeg, { artifact: artifactId }));
    },
    [navigate, projectId]
  );

  const linkMut = useMutation({
    mutationFn: (body) => analysisAPI.createTraceLink(projectId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisTraceLinks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1LinkCreated'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const canLink = capabilities.canEditAnalysis && !readOnly;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-semibold">{t('workspace.phaseNavTraceability')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1TraceHubHint')}</p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <h2 className="text-sm font-semibold">{t('workspace.phase1Gaps')}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(gaps?.frMissingUc || []).map((g) => {
            const id = rowId(g);
            return (
              <li key={id || g.externalKey}>
                <button
                  type="button"
                  className="text-left hover:underline disabled:no-underline disabled:opacity-70"
                  disabled={!id}
                  onClick={() => openArtifact('FR', id)}
                >
                  {t('workspace.phase1GapFrMissingUc', {
                    key: g.externalKey,
                    title: g.title,
                  })}
                </button>
              </li>
            );
          })}
          {(gaps?.brMissingBg || []).map((g) => {
            const id = rowId(g);
            return (
              <li key={id || g.externalKey}>
                <button
                  type="button"
                  className="text-left hover:underline disabled:no-underline disabled:opacity-70"
                  disabled={!id}
                  onClick={() => openArtifact('BR', id)}
                >
                  {t('workspace.phase1GapBrMissingBg', {
                    key: g.externalKey,
                    title: g.title,
                  })}
                </button>
              </li>
            );
          })}
          {!gaps?.frMissingUc?.length && !gaps?.brMissingBg?.length ? (
            <li className="text-muted-foreground">{t('workspace.phase1NoGaps')}</li>
          ) : null}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">{t('workspace.phase1FrToUc')}</h2>
        <ul className="mt-3 space-y-3">
          {frs.map((fr) => {
            const frId = rowId(fr);
            const linked = links.filter(
              (l) =>
                l.linkType === 'implements' &&
                (String(l.toArtifactId) === frId || String(l.fromArtifactId) === frId)
            );
            return (
              <li key={frId} className={kindAccentCardClass('FR')}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-1.5 text-left font-medium hover:underline"
                  onClick={() => openArtifact('FR', frId)}
                >
                  <span className={kindChipClass('FR')}>FR</span>
                  <span className="font-mono text-xs text-muted-foreground">{fr.externalKey}</span>{' '}
                  {fr.title}
                </button>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {linked.map((l) => {
                    const linkId = rowId(l);
                    const from = String(l.fromArtifactId || '');
                    const to = String(l.toArtifactId || '');
                    const peerId = from === frId ? to : from;
                    const peer = catalogById.get(peerId);
                    const peerKind = String(peer?.kind || (from === frId ? 'UC' : 'FR')).toUpperCase();
                    const label = peer
                      ? `${peer.externalKey || peerId} — ${peer.title || t('workspace.phase1RelatedNoTitle')}`
                      : peerId;
                    return (
                      <li key={linkId || `${from}-${to}`}>
                        <button
                          type="button"
                          className="inline-flex flex-wrap items-center gap-1 text-left text-sm hover:underline disabled:no-underline disabled:opacity-70"
                          disabled={!peerId}
                          onClick={() => openArtifact(peerKind, peerId)}
                        >
                          {peerKind ? <span className={kindChipClass(peerKind)}>{peerKind}</span> : null}
                          {label}
                          {l.linkType ? (
                            <span className="ml-1 text-[10px] opacity-70">· {l.linkType}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                  {!linked.length ? <li>{t('workspace.phase1NoLinks')}</li> : null}
                </ul>
                {canLink && ucs.length ? (
                  <select
                    className="mt-2 rounded border border-border bg-background px-2 py-1 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      const ucId = e.target.value;
                      e.target.value = '';
                      if (!ucId) return;
                      linkMut.mutate({
                        fromArtifactId: ucId,
                        toArtifactId: frId,
                        linkType: 'implements',
                      });
                    }}
                  >
                    <option value="">{t('workspace.phase1LinkUc')}</option>
                    {ucs.map((u) => (
                      <option key={rowId(u)} value={rowId(u)}>
                        {u.externalKey} — {u.title}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            );
          })}
          {!frs.length ? (
            <li className="text-sm text-muted-foreground">{t('workspace.phase1TraceNoFr')}</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
