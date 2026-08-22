import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import UserAvatar from '../../../components/Shared/UserAvatar';
import {
  buildOverallocFormula,
  formatMemberEstimateHours,
  formatMemberOpenStatusLabel,
  listMemberOpenCards,
  resolveAllocationBarTone,
  resolveOverallocExplainKind,
} from './projectHubUtils';
import { isLocallyOverallocated, toDateInput } from './AllocationSegmentsEditor';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function readHttpStatus(err) {
  const n = Number(err?.status ?? err?.response?.status ?? err?.data?.status);
  return Number.isFinite(n) ? n : null;
}

/** Map explain kind → i18n key (workspace.*). */
function overallocReasonKey(kind) {
  switch (kind) {
    case 'local_segments':
      return 'workspace.projectHubOverWhyReasonLocal';
    case 'multi_project':
      return 'workspace.projectHubOverWhyBeMultiProject';
    case 'peers_forbidden':
      return 'workspace.projectHubOverWhyReasonPeersForbidden';
    case 'peers_error':
      return 'workspace.projectHubOverWhyReasonPeersError';
    case 'timeline_over_no_peers':
      return 'workspace.projectHubOverWhyReasonNoPeersListed';
    case 'stale_member_flag':
      return 'workspace.projectHubOverWhyReasonStale';
    case 'member_over_loading':
      return 'workspace.projectHubOverWhyReasonLoading';
    default:
      return 'workspace.projectHubOverWhyBeMultiProject';
  }
}

function formatAllocDateLabel(value) {
  const raw = toDateInput(value);
  if (!raw) return '?';
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function shortRoleLabel(label, key = '') {
  const raw = String(label || key || '').trim();
  if (!raw) return key || '—';
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || raw;
}

function toFinitePct(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Lấy % Planned Allocation từ member / peer project (không suy từ Work). */
function resolveAllocationPct(source) {
  if (!source || typeof source !== 'object') return null;
  const direct =
    toFinitePct(source.allocationPct) ?? toFinitePct(source.currentAllocationPct);
  if (direct != null) return direct;
  const segs = Array.isArray(source.allocations) ? source.allocations : [];
  if (!segs.length) return null;
  return toFinitePct(segs[0]?.allocationPct);
}

function formatAllocSegmentLabel(seg) {
  const pct = toFinitePct(seg?.allocationPct);
  const a = formatAllocDateLabel(seg?.startDate);
  const b = seg?.endDate ? formatAllocDateLabel(seg.endDate) : '…';
  const pctPart = pct != null ? `${pct}%` : '?%';
  return `${pctPart} (${a}→${b})`;
}

/** Khoảng ngày segment đầu (provenance PM đã lưu). */
function resolveAllocationRangeLabel(source) {
  const segs = Array.isArray(source?.allocations) ? source.allocations : [];
  if (!segs.length) return '';
  const a = formatAllocDateLabel(segs[0]?.startDate);
  const b = segs[0]?.endDate ? formatAllocDateLabel(segs[0].endDate) : '…';
  return `${a}→${b}`;
}

function formatProjectLabel(code = '', title = '', fallback = '') {
  const c = String(code || '').trim();
  const name = String(title || '').trim();
  const joined = [c, name].filter(Boolean).join(' — ');
  return joined || fallback || '—';
}

function allocationBarFillClass(tone, isDarkMode) {
  if (tone === 'over') return 'bg-red-500';
  if (tone === 'high') return isDarkMode ? 'bg-amber-400' : 'bg-amber-500';
  if (tone === 'ok') return isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500';
  return isDarkMode ? 'bg-slate-500' : 'bg-muted-foreground/40';
}

function allocationBarValueClass(tone, valueCls) {
  if (tone === 'over') return 'text-red-400';
  if (tone === 'high') return 'text-amber-400';
  if (tone === 'ok') return 'text-emerald-400';
  return valueCls;
}

/**
 * Progress bar Planned % theo 3 cấp (ok / high / over).
 * Không tô theo allocationStatus người (đa dự án) — badge BE tách riêng.
 */
function AllocationPctBar({
  pct = null,
  label = '',
  isDarkMode = false,
  muted,
  valueCls,
  t,
  compact = false,
  hideSegmentOverBadge = false,
}) {
  const hasPct = pct != null && Number.isFinite(pct);
  const safePct = hasPct ? Math.max(0, pct) : 0;
  const fillPct = Math.min(100, safePct);
  const tone = resolveAllocationBarTone(hasPct ? safePct : null);
  const showSegmentOverBadge = hasPct && safePct > 100 && !hideSegmentOverBadge;
  const trackCls = isDarkMode ? 'bg-slate-700/80' : 'bg-muted';
  const fillCls = allocationBarFillClass(tone, isDarkMode);
  const pctCls = allocationBarValueClass(tone, valueCls);

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {(label || hasPct) && (
        <div className="flex items-baseline justify-between gap-2">
          {label ? (
            <p className={`min-w-0 truncate text-xs font-medium ${valueCls}`}>{label}</p>
          ) : (
            <span />
          )}
          <span className={`shrink-0 tabular-nums text-xs font-semibold ${pctCls}`}>
            {hasPct ? `${Math.round(safePct * 10) / 10}%` : t('workspace.projectHubAllocBarNoPct')}
          </span>
        </div>
      )}
      <div
        className={`h-2 w-full overflow-hidden rounded-full ${trackCls}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasPct ? Math.round(fillPct) : 0}
        aria-label={
          hasPct
            ? t('workspace.projectHubAllocBarAria', { pct: Math.round(safePct * 10) / 10 })
            : t('workspace.projectHubAllocBarNoPct')
        }
        title={t('workspace.projectHubAllocBarTrackHint')}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${fillCls}`}
          style={{ width: hasPct ? `${fillPct}%` : '0%' }}
        />
      </div>
      {showSegmentOverBadge ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
          {t('workspace.projectHubPulseOverBadge')}
          {` · ${Math.round((safePct - 100) * 10) / 10}%+`}
        </p>
      ) : null}
      {!hasPct && !label ? (
        <p className={`text-[11px] ${muted}`}>{t('workspace.projectHubPulsePlannedEmpty')}</p>
      ) : null}
    </div>
  );
}

/**
 * Accordion — giải thích vì sao quá phân bổ (Planned %, không phải Việc/Σh).
 * Giáo dục mặc định thu gọn; công thức FE không phủ nhận BE overallocated.
 */
function OverallocWhyAccordion({
  open,
  onToggle,
  currentLabel,
  currentPct,
  currentRangeLabel = '',
  peerRows,
  beConfirmedOver = false,
  reasonHint = '',
  canManage,
  onEdit,
  isDarkMode,
  muted,
  valueCls,
  t,
}) {
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const formulaId = 'project-hub-overalloc-formula';
  const guideId = 'project-hub-overalloc-guide';
  const faqId = 'project-hub-overalloc-faq';
  const layersId = 'project-hub-overalloc-layers';
  const panelCls = isDarkMode
    ? 'border-red-500/30 bg-red-500/10'
    : 'border-red-500/25 bg-red-500/5';
  const formulaBoxCls = isDarkMode
    ? 'border-red-500/25 bg-slate-950/40'
    : 'border-red-500/20 bg-background/80';
  const subBtnCls =
    'inline-flex w-full items-center justify-between gap-1 rounded-md border border-red-500/35 px-2 py-1.5 text-left text-[11px] font-semibold text-red-400 hover:bg-red-500/10';

  const formula = useMemo(
    () =>
      buildOverallocFormula({
        currentLabel,
        currentPct,
        currentRangeLabel,
        peerRows,
      }),
    [currentLabel, currentPct, currentRangeLabel, peerRows]
  );
  const knownSum = formula.knownSum;
  const feIncompleteVsBe = beConfirmedOver && !formula.exceedsThreshold;

  const faqItems = [
    { q: 'workspace.projectHubOverWhyFaqQ1', a: 'workspace.projectHubOverWhyFaqA1' },
    { q: 'workspace.projectHubOverWhyFaqQ2', a: 'workspace.projectHubOverWhyFaqA2' },
    { q: 'workspace.projectHubOverWhyFaqQ3', a: 'workspace.projectHubOverWhyFaqA3' },
    { q: 'workspace.projectHubOverWhyFaqQ4', a: 'workspace.projectHubOverWhyFaqA4' },
  ];
  const guideSteps = [
    'workspace.projectHubOverWhyGuide1',
    'workspace.projectHubOverWhyGuide2',
    'workspace.projectHubOverWhyGuide3',
    'workspace.projectHubOverWhyGuide4',
    'workspace.projectHubOverWhyGuide5',
  ];

  return (
    <div className={`mt-3 overflow-hidden rounded-lg border ${panelCls}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="text-xs font-semibold text-red-400">
          {t('workspace.projectHubOverWhyTitle')}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-red-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          className={`space-y-3 border-t px-3 py-3 text-[11px] leading-snug ${
            isDarkMode ? 'border-red-500/20' : 'border-red-500/15'
          }`}
        >
          <p className={valueCls}>{t('workspace.projectHubOverWhyFormula')}</p>
          <p className={muted}>{t('workspace.projectHubOverWhyNotWork')}</p>
          {beConfirmedOver && reasonHint ? (
            <p className="font-semibold text-red-400">{reasonHint}</p>
          ) : null}

          <div>
            <button
              type="button"
              className={subBtnCls}
              aria-expanded={layersOpen}
              aria-controls={layersId}
              onClick={() => setLayersOpen((v) => !v)}
            >
              <span>
                {layersOpen
                  ? t('workspace.projectHubOverWhyLayersHide')
                  : t('workspace.projectHubOverWhyLayersBtn')}
              </span>
              <ChevronDown
                size={14}
                className={`shrink-0 transition-transform ${layersOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {layersOpen ? (
              <div
                id={layersId}
                role="region"
                className={`mt-2 rounded-md border px-2.5 py-2 ${formulaBoxCls}`}
              >
                <p className={`mb-1.5 font-semibold uppercase tracking-wide ${muted}`}>
                  {t('workspace.projectHubOverWhyLayersTitle')}
                </p>
                <ul className={`list-disc space-y-1 pl-4 ${valueCls}`}>
                  <li>{t('workspace.projectHubOverWhyLayerPm')}</li>
                  <li>{t('workspace.projectHubOverWhyLayerFe')}</li>
                  <li>{t('workspace.projectHubOverWhyLayerBe')}</li>
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-red-500/35 px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/10"
              aria-expanded={formulaOpen}
              aria-controls={formulaId}
              onClick={() => setFormulaOpen((v) => !v)}
            >
              {formulaOpen
                ? t('workspace.projectHubOverWhyFormulaHide')
                : t('workspace.projectHubOverWhyFormulaBtn')}
              <ChevronDown
                size={14}
                className={`transition-transform ${formulaOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {formulaOpen ? (
              <div
                id={formulaId}
                role="region"
                aria-label={t('workspace.projectHubOverWhyFormulaEqTitle')}
                className={`mt-2 space-y-2 rounded-md border px-2.5 py-2 ${formulaBoxCls}`}
              >
                <p className={`font-semibold uppercase tracking-wide ${muted}`}>
                  {t('workspace.projectHubOverWhyFormulaEqTitle')}
                </p>
                <p className={muted}>{t('workspace.projectHubOverWhyFormulaSourceHint')}</p>
                {formula.terms.length ? (
                  <ul className="space-y-2">
                    {formula.terms.map((term, idx) => (
                      <li key={term.key} className="space-y-0.5">
                        <div className="flex items-baseline justify-between gap-2 tabular-nums">
                          <span className={`min-w-0 truncate ${valueCls}`}>
                            <span className={`mr-1.5 inline-block w-3 text-center ${muted}`}>
                              {idx === 0 ? '' : '+'}
                            </span>
                            {term.label}
                          </span>
                          <span className={`shrink-0 font-semibold ${valueCls}`}>{term.pct}%</span>
                        </div>
                        <p className={`pl-4 ${muted}`}>
                          {t('workspace.projectHubOverWhyTermSource')}
                        </p>
                        <p className={`pl-4 ${muted}`}>
                          {term.rangeLabel
                            ? t('workspace.projectHubOverWhyTermRange', {
                                range: term.rangeLabel,
                              })
                            : t('workspace.projectHubOverWhyTermRangeUnknown')}
                        </p>
                      </li>
                    ))}
                    <li
                      className={`space-y-0.5 border-t pt-1.5 ${
                        isDarkMode ? 'border-red-500/20' : 'border-red-500/15'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2 tabular-nums">
                        <span className={`font-semibold ${valueCls}`}>
                          {t('workspace.projectHubOverWhyFormulaTotal')}
                        </span>
                        <span
                          className={`shrink-0 font-bold ${
                            formula.exceedsThreshold ? 'text-red-400' : valueCls
                          }`}
                        >
                          {formula.knownSum}%
                        </span>
                      </div>
                      <p className={muted}>{t('workspace.projectHubOverWhyFormulaTotalHint')}</p>
                    </li>
                    <li className="flex items-baseline justify-between gap-2 tabular-nums">
                      <span className={muted}>
                        {t('workspace.projectHubOverWhyFormulaThreshold')}
                      </span>
                      <span className={`shrink-0 font-semibold ${valueCls}`}>
                        {formula.threshold}%
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className={muted}>{t('workspace.projectHubOverWhyFormulaEmpty')}</p>
                )}
                {formula.excluded.length ? (
                  <ul className={`space-y-0.5 ${muted}`}>
                    {formula.excluded.map((row) => (
                      <li key={row.key} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate">{row.label}</span>
                        <span className="shrink-0">{t('workspace.projectHubOverWhyNoPct')}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {formula.terms.length ? (
                  <div className="space-y-1">
                    {formula.exceedsThreshold ? (
                      <>
                        <p className="font-semibold text-red-400">
                          {t('workspace.projectHubOverWhyFormulaVerdictOver', {
                            sum: formula.knownSum,
                            threshold: formula.threshold,
                          })}
                        </p>
                        <p className="font-semibold text-red-400">
                          {t('workspace.projectHubOverWhyFormulaBeStatus')}
                        </p>
                      </>
                    ) : feIncompleteVsBe ? (
                      <>
                        <p className="font-semibold text-red-400">
                          {t('workspace.projectHubOverWhyFormulaVerdictIncomplete', {
                            sum: formula.knownSum,
                            threshold: formula.threshold,
                          })}
                        </p>
                        <p className="font-semibold text-red-400">
                          {t('workspace.projectHubOverWhyFormulaBeStatus')}
                        </p>
                      </>
                    ) : (
                      <p className={`font-semibold ${valueCls}`}>
                        {t('workspace.projectHubOverWhyFormulaVerdictOk', {
                          sum: formula.knownSum,
                          threshold: formula.threshold,
                        })}
                      </p>
                    )}
                  </div>
                ) : beConfirmedOver ? (
                  <p className="font-semibold text-red-400">
                    {t('workspace.projectHubOverWhyFormulaBeStatus')}
                  </p>
                ) : null}
                {knownSum > 0 ? (
                  <p className={muted}>
                    {t('workspace.projectHubOverWhySumHint', { sum: knownSum })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <button
              type="button"
              className={subBtnCls}
              aria-expanded={guideOpen}
              aria-controls={guideId}
              onClick={() => setGuideOpen((v) => !v)}
            >
              <span>
                {guideOpen
                  ? t('workspace.projectHubOverWhyGuideHide')
                  : t('workspace.projectHubOverWhyGuideBtn')}
              </span>
              <ChevronDown
                size={14}
                className={`shrink-0 transition-transform ${guideOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {guideOpen ? (
              <div
                id={guideId}
                role="region"
                aria-label={t('workspace.projectHubOverWhyGuideTitle')}
                className={`mt-2 space-y-2 rounded-md border px-2.5 py-2 ${formulaBoxCls}`}
              >
                <p className={`font-semibold uppercase tracking-wide ${muted}`}>
                  {t('workspace.projectHubOverWhyGuideTitle')}
                </p>
                <ol className={`list-decimal space-y-1.5 pl-4 ${valueCls}`}>
                  {guideSteps.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>

          <div>
            <button
              type="button"
              className={subBtnCls}
              aria-expanded={faqOpen}
              aria-controls={faqId}
              onClick={() => setFaqOpen((v) => !v)}
            >
              <span>
                {faqOpen
                  ? t('workspace.projectHubOverWhyFaqHide')
                  : t('workspace.projectHubOverWhyFaqBtn')}
              </span>
              <ChevronDown
                size={14}
                className={`shrink-0 transition-transform ${faqOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {faqOpen ? (
              <div
                id={faqId}
                role="region"
                aria-label={t('workspace.projectHubOverWhyFaqTitle')}
                className={`mt-2 space-y-3 rounded-md border px-2.5 py-2 ${formulaBoxCls}`}
              >
                <p className={`font-semibold uppercase tracking-wide ${muted}`}>
                  {t('workspace.projectHubOverWhyFaqTitle')}
                </p>
                <div className={`space-y-1.5 ${valueCls}`}>
                  <p className={`font-semibold ${muted}`}>
                    {t('workspace.projectHubOverWhyExampleTitle')}
                  </p>
                  <p>{t('workspace.projectHubOverWhyExampleOk')}</p>
                  <p className="text-red-400">{t('workspace.projectHubOverWhyExampleOver')}</p>
                </div>
                <ul className="space-y-2.5">
                  {faqItems.map((item) => (
                    <li key={item.q} className="space-y-0.5">
                      <p className={`font-semibold ${valueCls}`}>{t(item.q)}</p>
                      <p className={muted}>{t(item.a)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <p className={`mb-1 font-semibold uppercase tracking-wide ${muted}`}>
              {t('workspace.projectHubOverWhyThisProject')}
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`min-w-0 truncate ${valueCls}`}>{currentLabel}</span>
              <span className={`shrink-0 tabular-nums font-semibold ${valueCls}`}>
                {currentPct != null
                  ? `${currentPct}%`
                  : t('workspace.projectHubOverWhyNoPct')}
              </span>
            </div>
            {currentPct != null ? (
              <p className={`mt-0.5 ${muted}`}>
                {currentRangeLabel
                  ? t('workspace.projectHubOverWhyTermRange', { range: currentRangeLabel })
                  : t('workspace.projectHubOverWhyTermRangeUnknown')}
              </p>
            ) : null}
          </div>

          {(peerRows || []).length ? (
            <div>
              <p className={`mb-1 font-semibold uppercase tracking-wide ${muted}`}>
                {t('workspace.projectHubOverWhyPeer')}
              </p>
              <ul className="space-y-1.5">
                {peerRows.map((row) => (
                  <li key={row.key} className="space-y-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`min-w-0 truncate ${valueCls}`}>{row.label}</span>
                      <span
                        className={`shrink-0 tabular-nums font-semibold ${
                          row.pct != null && row.pct > 100
                            ? 'text-red-400'
                            : row.pct != null
                              ? valueCls
                              : muted
                        }`}
                      >
                        {row.pct != null
                          ? `${row.pct}%`
                          : t('workspace.projectHubOverWhyNoPct')}
                      </span>
                    </div>
                    {row.pct != null ? (
                      <p className={muted}>
                        {row.rangeLabel
                          ? t('workspace.projectHubOverWhyTermRange', { range: row.rangeLabel })
                          : t('workspace.projectHubOverWhyTermRangeUnknown')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!formulaOpen && knownSum > 0 ? (
            <p className={muted}>{t('workspace.projectHubOverWhySumHint', { sum: knownSum })}</p>
          ) : null}

          <div>
            <p className={`mb-1 font-semibold uppercase tracking-wide ${muted}`}>
              {t('workspace.projectHubOverWhyActionsTitle')}
            </p>
            <ol className={`list-decimal space-y-1 pl-4 ${valueCls}`}>
              <li>{t('workspace.projectHubOverWhyAction1')}</li>
              <li>{t('workspace.projectHubOverWhyAction2')}</li>
              <li>{t('workspace.projectHubOverWhyAction3')}</li>
            </ol>
          </div>

          {canManage && onEdit ? (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={onEdit}
            >
              {t('workspace.projectHubOverWhyEdit')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Drawer People Pulse — chi tiết 1 thành viên (R2).
 * Không phải Resource Planner.
 */
export default function ProjectHubMemberDetailDrawer({
  open = false,
  member = null,
  organizationId = '',
  projectId = '',
  projectTitle = '',
  projectCode = '',
  boardCards = [],
  boardLists = [],
  roleLabelByKey = null,
  actualVisible = false,
  canManage = false,
  isDarkMode = false,
  onClose = null,
  onEdit = null,
  onOpenList = null,
  onOpenWorkItem = null,
}) {
  const { t } = useAppStrings();
  const muted = isDarkMode ? 'text-slate-300' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const valueCls = isDarkMode ? 'text-slate-100' : 'text-foreground';
  const [peerProjects, setPeerProjects] = useState([]);
  const [peersLoad, setPeersLoad] = useState('idle');
  const [timelineStatus, setTimelineStatus] = useState(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const memberId = String(member?.id || '').trim();
  const projectIdStr = String(projectId || '').trim();
  const orgId = String(organizationId || '').trim();

  useEffect(() => {
    if (!open || !memberId || !orgId) {
      setPeerProjects([]);
      setPeersLoad('idle');
      setTimelineStatus(null);
      return undefined;
    }
    let cancelled = false;
    setPeersLoad('loading');
    setTimelineStatus(null);
    (async () => {
      try {
        const res = await projectAPI.getUserAllocations(orgId, memberId, {
          skipPermissionDeniedToast: true,
        });
        const data = unwrap(res);
        if (cancelled) return;
        const status = String(data?.allocationStatus || '').toLowerCase();
        setTimelineStatus(status === 'overallocated' || status === 'ok' ? status : null);
        setPeerProjects(
          (Array.isArray(data?.projects) ? data.projects : []).filter(
            (p) => String(p.projectId) !== projectIdStr
          )
        );
        setPeersLoad('ok');
      } catch (err) {
        if (cancelled) return;
        setPeerProjects([]);
        setTimelineStatus(null);
        setPeersLoad(readHttpStatus(err) === 403 ? 'forbidden' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, memberId, orgId, projectIdStr]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setWhyOpen(false);
  }, [open, memberId]);

  const openWorks = useMemo(
    () => listMemberOpenCards(boardCards, boardLists, memberId),
    [boardCards, boardLists, memberId]
  );

  const currentSegments = useMemo(() => {
    const segs = Array.isArray(member?.allocations) ? member.allocations : [];
    return segs
      .map((s) => ({
        key: `${s.startDate || ''}-${s.endDate || ''}-${s.allocationPct ?? ''}`,
        pct: toFinitePct(s.allocationPct),
        label: formatAllocSegmentLabel(s),
      }))
      .filter((s) => s.pct != null || s.label);
  }, [member?.allocations]);

  const currentPct = useMemo(() => resolveAllocationPct(member), [member]);
  const currentRangeLabel = useMemo(
    () => resolveAllocationRangeLabel(member),
    [member]
  );
  const memberOver = String(member?.allocationStatus || '').toLowerCase() === 'overallocated';
  const localSegmentsOver = useMemo(() => {
    const segs = Array.isArray(member?.allocations) ? member.allocations : [];
    return isLocallyOverallocated(
      segs.map((s) => ({
        startDate: toDateInput(s.startDate),
        endDate: toDateInput(s.endDate),
        allocationPct: s.allocationPct,
      }))
    );
  }, [member?.allocations]);

  const estimateLabel = formatMemberEstimateHours(member?.estimateHours);
  const actualLabel =
    actualVisible && member?.actualHours != null
      ? formatMemberEstimateHours(member.actualHours) || '0'
      : null;

  const currentProjectLabel = useMemo(
    () =>
      formatProjectLabel(
        projectCode,
        projectTitle,
        t('workspace.projectHubOverWhyThisProject')
      ),
    [projectCode, projectTitle, t]
  );

  const peerBars = useMemo(
    () =>
      (peerProjects || []).map((p) => {
        const code = String(p.projectCode || p.code || '').trim();
        const title = String(p.title || p.projectTitle || '').trim();
        const label = formatProjectLabel(code, title);
        const pct = resolveAllocationPct(p);
        const over = String(p.allocationStatus || '').toLowerCase() === 'overallocated';
        const hasSegs = Array.isArray(p.allocations) && p.allocations.length > 0;
        return {
          key: String(p.projectId || code || title),
          label,
          pct,
          over,
          rangeLabel: resolveAllocationRangeLabel(p),
          hasPlan: hasSegs || pct != null,
        };
      }),
    [peerProjects]
  );

  const peerCountWithPct = useMemo(
    () => peerBars.filter((p) => p.pct != null && Number(p.pct) > 0).length,
    [peerBars]
  );

  const explainKind = useMemo(
    () =>
      resolveOverallocExplainKind({
        memberOver,
        timelineStatus,
        peersLoad,
        peerCountWithPct,
        localSegmentsOver,
      }),
    [memberOver, timelineStatus, peersLoad, peerCountWithPct, localSegmentsOver]
  );

  const showOverBadge =
    explainKind !== 'none' ||
    memberOver ||
    timelineStatus === 'overallocated' ||
    localSegmentsOver;
  const reasonHint =
    explainKind !== 'none' ? t(overallocReasonKey(explainKind)) : '';
  const isOver = showOverBadge;

  if (!open || !member) return null;

  const roleLabels = (member.roles || []).map(
    (rk) => roleLabelByKey?.get?.(rk) || shortRoleLabel('', rk)
  );

  const openEdit = () => {
    onEdit?.(member);
    onClose?.();
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label={t('workspace.projectHubMemberDrawerClose')}
        onClick={() => onClose?.()}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('workspace.projectHubMemberDrawerTitle')}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <UserAvatar
              name={member.name}
              avatar={member.avatar || undefined}
              userId={member.id}
              size="md"
            />
            <div className="min-w-0">
              <h3 className={`truncate text-base font-bold ${titleCls}`}>{member.name}</h3>
              <p className={`mt-0.5 text-xs ${muted}`}>
                {roleLabels.length ? roleLabels.join(' · ') : t('workspace.roleMemberVi')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={
              isDarkMode
                ? 'rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
            }
            aria-label={t('workspace.projectHubMemberDrawerClose')}
            onClick={() => onClose?.()}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section>
            <h4 className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
              {t('workspace.projectHubPulsePlanned')}
            </h4>
            <div className="mt-2 space-y-3">
              {currentSegments.length ? (
                currentSegments.map((seg) => (
                  <AllocationPctBar
                    key={seg.key}
                    pct={seg.pct}
                    label={seg.label}
                    isDarkMode={isDarkMode}
                    muted={muted}
                    valueCls={valueCls}
                    t={t}
                    hideSegmentOverBadge={isOver}
                  />
                ))
              ) : (
                <AllocationPctBar
                  pct={currentPct}
                  isDarkMode={isDarkMode}
                  muted={muted}
                  valueCls={valueCls}
                  t={t}
                  hideSegmentOverBadge={isOver}
                />
              )}
            </div>
            {isOver ? (
              <>
                <p
                  className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-red-400"
                  title={t('workspace.projectHubPulseOverBadgeHint')}
                >
                  {t('workspace.projectHubPulseOverBadge')}
                </p>
                {reasonHint ? (
                  <p className={`mt-0.5 text-[10px] leading-snug ${muted}`}>{reasonHint}</p>
                ) : null}
                <OverallocWhyAccordion
                  open={whyOpen}
                  onToggle={() => setWhyOpen((v) => !v)}
                  currentLabel={currentProjectLabel}
                  currentPct={currentPct}
                  currentRangeLabel={currentRangeLabel}
                  peerRows={peerBars}
                  beConfirmedOver
                  reasonHint={reasonHint}
                  canManage={canManage}
                  onEdit={canManage && onEdit ? openEdit : null}
                  isDarkMode={isDarkMode}
                  muted={muted}
                  valueCls={valueCls}
                  t={t}
                />
              </>
            ) : null}
          </section>

          <section>
            <h4 className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
              {t('workspace.projectHubPulseWork')}
            </h4>
            <p className={`mt-1 text-sm ${valueCls}`}>
              {t('workspace.projectHubPulseWorkOpen', { n: Number(member.openCount) || 0 })}
              {estimateLabel
                ? ` · ${t('workspace.projectHubPulseEstimate', { h: estimateLabel })}`
                : ''}
            </p>
            {openWorks.length ? (
              <ul className="mt-2 space-y-1.5">
                {openWorks.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      className={
                        isDarkMode
                          ? 'flex w-full flex-col rounded-lg border border-slate-600 bg-slate-900/50 px-2.5 py-2 text-left hover:border-primary/40'
                          : 'flex w-full flex-col rounded-lg border border-border bg-background px-2.5 py-2 text-left hover:border-primary/40'
                      }
                      onClick={() => onOpenWorkItem?.(w.card)}
                      disabled={!onOpenWorkItem}
                    >
                      <span className={`truncate text-sm font-medium ${valueCls}`}>{w.title}</span>
                      <span className={`mt-0.5 text-[11px] ${muted}`}>
                        {formatMemberOpenStatusLabel(w.statusBucket, w.statusLabel, t)}
                        {w.estimateHours != null ? ` · ${w.estimateHours}h` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-2 text-sm ${muted}`}>{t('workspace.projectHubMemberDrawerWorkEmpty')}</p>
            )}
            {onOpenList ? (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-primary hover:underline"
                onClick={() => onOpenList()}
              >
                {t('workspace.projectHubMemberDrawerOpenList')}
              </button>
            ) : null}
          </section>

          {actualVisible ? (
            <section>
              <h4 className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
                {t('workspace.projectHubPulseActual')}
              </h4>
              <p
                className={`mt-1 text-sm ${valueCls}`}
                title={t('workspace.projectHubPulseActualHint')}
              >
                {t('workspace.projectHubPulseActualHours', { h: actualLabel ?? '0' })}
              </p>
            </section>
          ) : null}

          <section>
            <h4 className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
              {t('workspace.projectHubAllocTimeline')}
            </h4>
            {peersLoad === 'loading' ? (
              <p className={`mt-1 text-sm ${muted}`} role="status">
                {t('workspace.projectHubMemberDrawerPeersLoading')}
              </p>
            ) : peersLoad === 'forbidden' ? (
              <p className={`mt-1 text-sm ${muted}`}>
                {t('workspace.projectHubMemberDrawerPeersForbidden')}
              </p>
            ) : peersLoad === 'error' ? (
              <p className={`mt-1 text-sm ${muted}`}>
                {t('workspace.projectHubMemberDrawerPeersError')}
              </p>
            ) : peerBars.length ? (
              <ul className="mt-2 space-y-3">
                {peerBars.map((p) => (
                  <li key={p.key}>
                    <AllocationPctBar
                      pct={p.pct}
                      label={p.label}
                      isDarkMode={isDarkMode}
                      muted={muted}
                      valueCls={valueCls}
                      t={t}
                      compact
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-1 text-sm ${muted}`}>
                {t('workspace.projectHubMemberDrawerPeersEmpty')}
              </p>
            )}
            {peersLoad === 'ok' && timelineStatus ? (
              <p className={`mt-2 text-[10px] leading-snug ${muted}`}>
                {timelineStatus === 'overallocated'
                  ? t('workspace.projectHubMemberDrawerTimelineOver')
                  : t('workspace.projectHubMemberDrawerTimelineOk')}
              </p>
            ) : null}
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
          {canManage && onEdit ? (
            <button
              type="button"
              className={
                isDarkMode
                  ? 'rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800/80'
                  : 'rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40'
              }
              onClick={openEdit}
            >
              {t('workspace.projectHubMembersSetRoles')}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            onClick={() => onClose?.()}
          >
            {t('workspace.projectHubMemberDrawerClose')}
          </button>
        </footer>
      </aside>
    </>
  );
}
