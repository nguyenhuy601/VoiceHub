import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../../../../components/Shared/Modal';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { modulePathForArtifactKind } from './artifactRelated';
import { kindAccentCardClass, kindChipClass } from '../shared/phase1UiTokens';
import {
  artifactRowId,
  buildBpmToBrPairs,
  buildBrToBgPairs,
  buildCrAnalysisRows,
  buildNfrToFrPairs,
  buildScopeCrRows,
  isTcDeepLinkPhase,
  listImplementsPeersForArtifact,
  listNfrMissingFr,
} from './traceabilityHubModel';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function groupPeersByKind(peers = []) {
  const map = new Map();
  for (const p of peers) {
    const k = String(p.kind || 'OTHER').toUpperCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Trace hub — section cards open a modal (không dump toàn bộ ma trận lên trang).
 */
export default function TraceabilityPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { project, capabilities } = useProjectCapabilities(projectId);
  const deliveryPhase = String(project?.deliveryPhase || '').trim();
  const tcLinkEnabled = isTcDeepLinkPhase(deliveryPhase);
  const [openSection, setOpenSection] = useState(null);
  const [activeCrId, setActiveCrId] = useState('');

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

  const { data: catalog = [] } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'ALL'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const byKind = useMemo(() => {
    const map = { FR: [], UC: [], BR: [], BG: [], BPM: [], NFR: [], SCOPE: [] };
    for (const row of catalog) {
      const k = String(row.kind || '').toUpperCase();
      if (map[k]) map[k].push(row);
    }
    return map;
  }, [catalog]);

  const catalogById = useMemo(() => {
    const map = new Map();
    for (const row of catalog) {
      const id = artifactRowId(row);
      if (id) map.set(id, row);
    }
    return map;
  }, [catalog]);

  const crRows = useMemo(() => buildCrAnalysisRows(catalog), [catalog]);
  const brBgPairs = useMemo(
    () => buildBrToBgPairs({ brs: byKind.BR, bgs: byKind.BG, links }),
    [byKind.BR, byKind.BG, links]
  );
  const bpmBrPairs = useMemo(
    () => buildBpmToBrPairs({ bpms: byKind.BPM, brs: byKind.BR, links }),
    [byKind.BPM, byKind.BR, links]
  );
  const nfrFrPairs = useMemo(
    () => buildNfrToFrPairs({ nfrs: byKind.NFR, frs: byKind.FR, links }),
    [byKind.NFR, byKind.FR, links]
  );
  const scopeRows = useMemo(() => buildScopeCrRows(byKind.SCOPE), [byKind.SCOPE]);
  const nfrMissingFr = useMemo(
    () => listNfrMissingFr({ nfrs: byKind.NFR, frs: byKind.FR, links }),
    [byKind.NFR, byKind.FR, links]
  );

  const gapCount =
    (gaps?.frMissingUc || []).length +
    (gaps?.brMissingBg || []).length +
    (gaps?.frMissingCr || []).length +
    (gaps?.bpmMissingBr || []).length +
    nfrMissingFr.length;

  const openArtifact = useCallback(
    (kind, id) => {
      const artifactId = String(id || '').trim();
      const moduleSeg = modulePathForArtifactKind(kind);
      if (!artifactId || !moduleSeg || !projectId) return;
      setOpenSection(null);
      navigate(buildPhase1ModulePath(projectId, moduleSeg, { artifact: artifactId }));
    },
    [navigate, projectId]
  );

  const openTcForUc = useCallback(
    (ucExternalKey) => {
      const key = String(ucExternalKey || '').trim();
      if (!key || !projectId || !tcLinkEnabled) return;
      setOpenSection(null);
      navigate(buildPhase1ModulePath(projectId, 'planning/test-cases', { sourceUcKey: key }));
    },
    [navigate, projectId, tcLinkEnabled]
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

  const canLink =
    (capabilities.canEditAnalysis || capabilities.canImportAnalysis) && !readOnly;

  const renderPeerButton = (kind, id, label, extra = null) => (
    <button
      type="button"
      className="inline-flex flex-wrap items-center gap-1 text-left text-sm hover:underline disabled:no-underline disabled:opacity-70"
      disabled={!id}
      onClick={() => openArtifact(kind, id)}
    >
      {kind ? <span className={kindChipClass(kind)}>{kind}</span> : null}
      {label}
      {extra}
    </button>
  );

  const sections = useMemo(
    () => [
      {
        id: 'gaps',
        title: t('workspace.phase1Gaps'),
        hint: t('workspace.phase1TraceGapsCardHint'),
        count: gapCount,
        tone: gapCount > 0 ? 'warn' : 'ok',
      },
      {
        id: 'cr',
        title: t('workspace.phase1CrToAnalysis'),
        hint: t('workspace.phase1CrToAnalysisHint'),
        count: crRows.length,
        tone: 'neutral',
      },
      {
        id: 'brBg',
        title: t('workspace.phase1BrToBg'),
        hint: t('workspace.phase1TraceOpenGroupHint'),
        count: brBgPairs.length,
        tone: 'neutral',
      },
      {
        id: 'bpmBr',
        title: t('workspace.phase1BpmToBr'),
        hint: t('workspace.phase1TraceOpenGroupHint'),
        count: bpmBrPairs.length,
        tone: 'neutral',
      },
      {
        id: 'frUc',
        title: t('workspace.phase1FrToUc'),
        hint: t('workspace.phase1TraceOpenGroupHint'),
        count: byKind.FR.length,
        tone: 'neutral',
      },
      {
        id: 'nfrFr',
        title: t('workspace.phase1NfrToFr'),
        hint: t('workspace.phase1NfrToFrHint'),
        count: nfrFrPairs.length,
        tone: 'neutral',
      },
      {
        id: 'scope',
        title: t('workspace.phase1ScopeTrace'),
        hint: t('workspace.phase1ScopeTraceHint'),
        count: scopeRows.length,
        tone: 'neutral',
      },
    ],
    [
      t,
      gapCount,
      crRows.length,
      brBgPairs.length,
      bpmBrPairs.length,
      byKind.FR.length,
      nfrFrPairs.length,
      scopeRows.length,
    ]
  );

  const sectionTitle = sections.find((s) => s.id === openSection)?.title || '';

  const activeCrRow = useMemo(
    () => crRows.find((r) => r.crId === activeCrId) || null,
    [crRows, activeCrId]
  );

  const closeModal = () => {
    setOpenSection(null);
    setActiveCrId('');
  };

  const openSectionModal = (id) => {
    setActiveCrId('');
    setOpenSection(id);
    if (id === 'cr' && crRows[0]?.crId) setActiveCrId(crRows[0].crId);
  };

  const toneClass = (tone) => {
    if (tone === 'warn') return 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60';
    if (tone === 'ok') return 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50';
    return 'border-border bg-surface hover:border-primary/40 hover:bg-muted/30';
  };

  const renderGapsBody = () => (
    <ul className="space-y-1.5 text-sm">
      {(gaps?.frMissingUc || []).map((g) => {
        const id = artifactRowId(g);
        return (
          <li key={`uc-${id || g.externalKey}`}>
            <button
              type="button"
              className="text-left hover:underline disabled:opacity-70"
              disabled={!id}
              onClick={() => openArtifact('FR', id)}
            >
              {t('workspace.phase1GapFrMissingUc', { key: g.externalKey, title: g.title })}
            </button>
          </li>
        );
      })}
      {(gaps?.brMissingBg || []).map((g) => {
        const id = artifactRowId(g);
        return (
          <li key={`bg-${id || g.externalKey}`}>
            <button
              type="button"
              className="text-left hover:underline disabled:opacity-70"
              disabled={!id}
              onClick={() => openArtifact('BR', id)}
            >
              {t('workspace.phase1GapBrMissingBg', { key: g.externalKey, title: g.title })}
            </button>
          </li>
        );
      })}
      {(gaps?.frMissingCr || []).map((g) => {
        const id = artifactRowId(g);
        return (
          <li key={`cr-${id || g.externalKey}`}>
            <button
              type="button"
              className="text-left hover:underline disabled:opacity-70"
              disabled={!id}
              onClick={() => openArtifact('FR', id)}
            >
              {t('workspace.phase1GapFrMissingCr', { key: g.externalKey, title: g.title })}
            </button>
          </li>
        );
      })}
      {(gaps?.bpmMissingBr || []).map((g) => {
        const id = artifactRowId(g);
        return (
          <li key={`bpm-${id || g.externalKey}`}>
            <button
              type="button"
              className="text-left hover:underline disabled:opacity-70"
              disabled={!id}
              onClick={() => openArtifact('BPM', id)}
            >
              {t('workspace.phase1GapBpmMissingBr', { key: g.externalKey, title: g.title })}
            </button>
          </li>
        );
      })}
      {nfrMissingFr.map((g) => {
        const id = artifactRowId(g);
        return (
          <li key={`nfr-${id || g.externalKey}`} className="text-muted-foreground">
            <button
              type="button"
              className="text-left hover:underline disabled:opacity-70"
              disabled={!id}
              onClick={() => openArtifact('NFR', id)}
            >
              {t('workspace.phase1GapNfrMissingFrWarn', { key: g.externalKey, title: g.title })}
            </button>
          </li>
        );
      })}
      {gapCount === 0 ? (
        <li className="text-muted-foreground">{t('workspace.phase1NoGaps')}</li>
      ) : null}
    </ul>
  );

  const renderCrBody = () => {
    if (!crRows.length) {
      return <p className="text-sm text-muted-foreground">{t('workspace.phase1CrToAnalysisEmpty')}</p>;
    }
    return (
      <div className="flex min-h-0 flex-col gap-3 sm:flex-row">
        <div className="flex max-h-[50vh] w-full shrink-0 flex-col gap-1.5 overflow-y-auto sm:w-44">
          {crRows.map((row) => (
            <button
              key={row.crId}
              type="button"
              className={`rounded-lg border px-2.5 py-2 text-left font-mono text-xs transition ${
                activeCrId === row.crId
                  ? 'border-primary bg-primary/10 font-semibold text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40'
              }`}
              onClick={() => setActiveCrId(row.crId)}
            >
              <span className="block">{row.crId}</span>
              <span className="mt-0.5 block text-[10px] font-sans font-normal opacity-80">
                {t('workspace.phase1TraceItemsCount', { count: row.peers.length })}
              </span>
            </button>
          ))}
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {activeCrRow ? (
            <div className="space-y-3">
              <p className="font-mono text-sm font-semibold">{activeCrRow.crId}</p>
              {groupPeersByKind(activeCrRow.peers).map(([kind, peers]) => (
                <div key={kind} className="rounded-lg border border-border/80 p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={kindChipClass(kind)}>{kind}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {t('workspace.phase1TraceItemsCount', { count: peers.length })}
                    </span>
                  </div>
                  <ul className="space-y-1 text-muted-foreground">
                    {peers.map((p) => (
                      <li key={`${activeCrRow.crId}-${p.id || p.externalKey}`}>
                        {renderPeerButton(
                          p.kind,
                          p.id,
                          `${p.externalKey || p.id} — ${p.title || t('workspace.phase1RelatedNoTitle')}`
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('workspace.phase1TracePickCr')}</p>
          )}
        </div>
      </div>
    );
  };

  const renderBrBgBody = () => (
    <ul className="space-y-3">
      {brBgPairs.map((pair) => {
        const brId = artifactRowId(pair.br);
        const bgId = pair.bg ? artifactRowId(pair.bg) : '';
        return (
          <li key={brId} className={kindAccentCardClass('BR')}>
            {renderPeerButton(
              'BR',
              brId,
              `${pair.br.externalKey} — ${pair.br.title || t('workspace.phase1RelatedNoTitle')}`
            )}
            <div className="mt-1 pl-2 text-sm text-muted-foreground">
              {pair.bg
                ? renderPeerButton(
                    'BG',
                    bgId,
                    `${pair.bg.externalKey} — ${pair.bg.title || t('workspace.phase1RelatedNoTitle')}`,
                    pair.linkType || pair.source ? (
                      <span className="ml-1 text-[10px] opacity-70">
                        · {pair.linkType || pair.source}
                      </span>
                    ) : null
                  )
                : t('workspace.phase1UnresolvedKey', { key: pair.unresolvedBgKey })}
            </div>
            {canLink && byKind.BG.length && !pair.bg ? (
              <select
                className="mt-2 rounded border border-border bg-background px-2 py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const bgTarget = e.target.value;
                  e.target.value = '';
                  if (!bgTarget) return;
                  linkMut.mutate({
                    fromArtifactId: brId,
                    toArtifactId: bgTarget,
                    linkType: 'derives',
                  });
                }}
              >
                <option value="">{t('workspace.phase1LinkBg')}</option>
                {byKind.BG.map((bg) => (
                  <option key={artifactRowId(bg)} value={artifactRowId(bg)}>
                    {bg.externalKey} — {bg.title}
                  </option>
                ))}
              </select>
            ) : null}
          </li>
        );
      })}
      {!brBgPairs.length ? (
        <li className="text-sm text-muted-foreground">{t('workspace.phase1BrToBgEmpty')}</li>
      ) : null}
    </ul>
  );

  const renderBpmBrBody = () => (
    <ul className="space-y-2">
      {bpmBrPairs.map((pair) => {
        const bpmId = artifactRowId(pair.bpm);
        return (
          <li key={bpmId} className={kindAccentCardClass('BPM')}>
            {renderPeerButton(
              'BPM',
              bpmId,
              `${pair.bpm.externalKey} — ${pair.bpm.title || t('workspace.phase1RelatedNoTitle')}`
            )}
            <div className="mt-1 pl-2 text-sm text-muted-foreground">
              {pair.br
                ? renderPeerButton(
                    'BR',
                    artifactRowId(pair.br),
                    `${pair.br.externalKey} — ${pair.br.title || t('workspace.phase1RelatedNoTitle')}`,
                    <span className="ml-1 text-[10px] opacity-70">
                      · {pair.linkType || pair.source}
                    </span>
                  )
                : t('workspace.phase1UnresolvedKey', { key: pair.unresolvedBrKey })}
            </div>
          </li>
        );
      })}
      {!bpmBrPairs.length ? (
        <li className="text-sm text-muted-foreground">{t('workspace.phase1BpmToBrEmpty')}</li>
      ) : null}
    </ul>
  );

  const renderFrUcBody = () => (
    <ul className="space-y-3">
      {byKind.FR.map((fr) => {
        const frId = artifactRowId(fr);
        const linked = listImplementsPeersForArtifact(frId, links, catalogById);
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
              {linked.map(({ link, peerId, peer }) => {
                const linkId = artifactRowId(link);
                const peerKind = String(peer?.kind || 'UC').toUpperCase();
                const label = peer
                  ? `${peer.externalKey || peerId} — ${peer.title || t('workspace.phase1RelatedNoTitle')}`
                  : peerId;
                return (
                  <li key={linkId || `${peerId}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {renderPeerButton(
                        peerKind,
                        peerId,
                        label,
                        link.linkType ? (
                          <span className="ml-1 text-[10px] opacity-70">· {link.linkType}</span>
                        ) : null
                      )}
                      {peerKind === 'UC' && peer?.externalKey ? (
                        <button
                          type="button"
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-40"
                          disabled={!tcLinkEnabled}
                          title={
                            tcLinkEnabled
                              ? t('workspace.phase1TraceOpenTc')
                              : t('workspace.phase1TraceOpenTcDisabled')
                          }
                          onClick={() => openTcForUc(peer.externalKey)}
                        >
                          {t('workspace.phase1TraceOpenTc')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {!linked.length ? <li>{t('workspace.phase1NoLinks')}</li> : null}
            </ul>
            {canLink && byKind.UC.length ? (
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
                {byKind.UC.map((u) => (
                  <option key={artifactRowId(u)} value={artifactRowId(u)}>
                    {u.externalKey} — {u.title}
                  </option>
                ))}
              </select>
            ) : null}
          </li>
        );
      })}
      {!byKind.FR.length ? (
        <li className="text-sm text-muted-foreground">{t('workspace.phase1TraceNoFr')}</li>
      ) : null}
    </ul>
  );

  const renderNfrFrBody = () => (
    <ul className="space-y-2">
      {nfrFrPairs.map((pair) => {
        const nfrId = artifactRowId(pair.nfr);
        return (
          <li key={nfrId} className={kindAccentCardClass('NFR')}>
            {renderPeerButton(
              'NFR',
              nfrId,
              `${pair.nfr.externalKey} — ${pair.nfr.title || t('workspace.phase1RelatedNoTitle')}`
            )}
            <div className="mt-1 pl-2 text-sm text-muted-foreground">
              {pair.fr
                ? renderPeerButton(
                    'FR',
                    artifactRowId(pair.fr),
                    `${pair.fr.externalKey} — ${pair.fr.title || t('workspace.phase1RelatedNoTitle')}`,
                    <span className="ml-1 text-[10px] opacity-70">
                      · {pair.linkType || 'constrains'}
                    </span>
                  )
                : t('workspace.phase1UnresolvedKey', { key: pair.unresolvedFrKey })}
            </div>
          </li>
        );
      })}
      {!nfrFrPairs.length ? (
        <li className="text-sm text-muted-foreground">{t('workspace.phase1NfrToFrEmpty')}</li>
      ) : null}
    </ul>
  );

  const renderScopeBody = () => (
    <ul className="space-y-2">
      {scopeRows.map((row) => {
        const sid = artifactRowId(row.scope);
        return (
          <li key={sid} className={kindAccentCardClass('SCOPE')}>
            {renderPeerButton(
              'SCOPE',
              sid,
              `${row.scope.externalKey} — ${row.scope.title || t('workspace.phase1RelatedNoTitle')}`
            )}
            <p className="mt-0.5 pl-2 text-[11px] text-muted-foreground">
              {row.scopeType ? `${row.scopeType} · ` : null}
              {row.crIds.length ? row.crIds.join(', ') : t('workspace.phase1ScopeNoCr')}
            </p>
          </li>
        );
      })}
      {!scopeRows.length ? (
        <li className="text-sm text-muted-foreground">{t('workspace.phase1ScopeTraceEmpty')}</li>
      ) : null}
    </ul>
  );

  const modalBody = (() => {
    switch (openSection) {
      case 'gaps':
        return renderGapsBody();
      case 'cr':
        return renderCrBody();
      case 'brBg':
        return renderBrBgBody();
      case 'bpmBr':
        return renderBpmBrBody();
      case 'frUc':
        return renderFrUcBody();
      case 'nfrFr':
        return renderNfrFrBody();
      case 'scope':
        return renderScopeBody();
      default:
        return null;
    }
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-semibold">{t('workspace.phaseNavTraceability')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1TraceHubHint')}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t('workspace.phase1TraceChainHint')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            className={`flex min-h-[7.5rem] flex-col rounded-xl border p-4 text-left shadow-sm transition ${toneClass(sec.tone)}`}
            onClick={() => openSectionModal(sec.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{sec.title}</h2>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${
                  sec.tone === 'warn'
                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {t('workspace.phase1TraceItemsCount', { count: sec.count })}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 flex-1 text-[11px] text-muted-foreground">{sec.hint}</p>
            <span className="mt-3 text-[11px] font-medium text-primary">
              {t('workspace.phase1TraceOpenGroup')} →
            </span>
          </button>
        ))}
      </div>

      <Modal
        isOpen={Boolean(openSection)}
        onClose={closeModal}
        title={sectionTitle}
        size={openSection === 'cr' || openSection === 'frUc' ? 'lg' : 'md'}
      >
        {modalBody}
      </Modal>
    </div>
  );
}
