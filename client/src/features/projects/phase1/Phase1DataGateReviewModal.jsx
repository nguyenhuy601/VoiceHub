import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../../../components/Shared/Modal';

const PAGE_SIZE = 20;
const SCROLL_GAP = 40;

const QUALITY = [
  ['missingActor', 'requirements.phase1QualityMissingActor', 'Thiếu actor'],
  ['missingAc', 'requirements.phase1QualityMissingAc', 'Thiếu AC'],
  ['thinText', 'requirements.phase1QualityThinText', 'Mô tả mỏng'],
  ['ambiguous', 'requirements.phase1QualityAmbiguous', 'Mơ hồ'],
  ['duplicate', 'requirements.phase1QualityDuplicate', 'Trùng'],
  ['crossModule', 'requirements.phase1QualityCrossModule', 'Xuyên module'],
];

const COLUMNS = [
  ['frId', 'requirements.phase1ColFr', 'FR'],
  ['title', 'requirements.phase1ColTitle', 'Tiêu đề'],
  ['description', 'requirements.phase1ColDescription', 'Mô tả'],
  ['actors', 'requirements.phase1ColActors', 'Actor'],
  ['actions', 'requirements.phase1ColActions', 'Hành động'],
  ['objects', 'requirements.phase1ColObjects', 'Đối tượng'],
  ['fields', 'requirements.phase1ColFields', 'Trường'],
  ['flags', 'requirements.phase1ColFlags', 'Cờ'],
  ['candidate', 'requirements.phase1ColCandidate', 'Candidate'],
];

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

function countLabel(t, key, fallback, count) {
  return labelOf(t, key, fallback, { count: Number(count) || 0 });
}

function cellText(row, key, t) {
  if (key === 'candidate') {
    return row.candidate
      ? labelOf(t, 'requirements.phase1CandidateYes', 'Có')
      : labelOf(t, 'requirements.phase1CandidateNo', 'Không');
  }
  const value = row[key];
  if (Array.isArray(value)) return value.join(', ');
  return value ? String(value) : '';
}

export default function Phase1DataGateReviewModal({
  open,
  preview,
  busy = false,
  t,
  onLoadPage,
  onPass,
  onReject,
}) {
  const data = preview || {};
  const quality = data.quality || {};
  const [rows, setRows] = useState([]);
  const [rowTotal, setRowTotal] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);
  const scrollerRef = useRef(null);
  const offsetRef = useRef(0);
  const totalRef = useRef(0);
  const loadingRef = useRef(false);

  const appendPage = useCallback(
    async (offset) => {
      if (typeof onLoadPage !== 'function' || loadingRef.current) return;
      if (offset > 0 && offset >= totalRef.current) return;
      loadingRef.current = true;
      setLoadingPage(true);
      try {
        const page = await onLoadPage({ offset, limit: PAGE_SIZE });
        const next = Array.isArray(page?.rows) ? page.rows : [];
        const total = Number(page?.rowTotal);
        if (Number.isFinite(total)) {
          totalRef.current = total;
          setRowTotal(total);
        }
        setRows((prev) => (offset === 0 ? next : [...prev, ...next]));
        offsetRef.current = offset + next.length;
        if (!next.length && offset > 0) {
          offsetRef.current = totalRef.current;
        }
      } finally {
        loadingRef.current = false;
        setLoadingPage(false);
      }
    },
    [onLoadPage]
  );

  useEffect(() => {
    if (!open) {
      setRows([]);
      setRowTotal(0);
      offsetRef.current = 0;
      totalRef.current = 0;
      return undefined;
    }
    const seedTotal = Number(preview?.rowTotal) || 0;
    totalRef.current = seedTotal;
    setRowTotal(seedTotal);
    appendPage(0);
    return undefined;
  }, [open, appendPage, preview?.rowTotal]);

  const onScroll = useCallback(() => {
    const node = scrollerRef.current;
    if (!node || loadingRef.current) return;
    if (offsetRef.current >= totalRef.current) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining <= SCROLL_GAP) appendPage(offsetRef.current);
  }, [appendPage]);

  return (
    <Modal
      isOpen={open}
      onClose={() => {}}
      closable={false}
      size="lg"
      title={labelOf(t, 'requirements.phase1DataGateTitle', 'Review dữ liệu sau bước 2')}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
          >
            {labelOf(t, 'requirements.phase1DataGateReject', 'Reject — dừng')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onPass}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {labelOf(t, 'requirements.phase1DataGatePass', 'Pass — chạy tiếp')}
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        {labelOf(
          t,
          'requirements.phase1DataGateHint',
          'Pass để chạy Semantic Fetch. Reject dừng lần chạy; bạn có thể sửa artifact rồi chạy lại.'
        )}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <li>{countLabel(t, 'requirements.phase1DataGateFr', '{count} FR', data.frCount)}</li>
        <li>{countLabel(t, 'requirements.phase1DataGateCandidates', '{count} candidate', data.candidateCount)}</li>
        <li>{countLabel(t, 'requirements.phase1DataGateDuplicates', '{count} trùng', data.duplicateCount)}</li>
        <li>{countLabel(t, 'requirements.phase1DataGateSkipped', '{count} bỏ qua LLM', data.skippedCount)}</li>
      </ul>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {QUALITY.map(([key, i18nKey, fallback]) => (
          <li key={key} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
            {labelOf(t, i18nKey, fallback)}: {Number(quality[key]) || 0}
          </li>
        ))}
      </ul>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="mt-3 max-h-[min(40vh,20rem)] overflow-y-auto rounded-md border border-border"
      >
        <table className="w-full min-w-[48rem] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {COLUMNS.map(([key, i18nKey, fallback]) => (
                <th key={key} className="px-2 py-1.5 font-medium text-foreground">
                  {labelOf(t, i18nKey, fallback)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.frId || 'fr'}-${index}`} className="border-t border-border">
                {COLUMNS.map(([key]) => (
                  <td key={key} className="max-w-[12rem] px-2 py-1 align-top text-foreground">
                    {cellText(row, key, t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loadingPage ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {rows.length}/{rowTotal}
      </p>
    </Modal>
  );
}
