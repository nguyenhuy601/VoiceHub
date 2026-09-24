/**
 * Resolve Planning dump/suggest assignee hints against org member directory.
 * Soft-validate: never blocks create — returns diff report for HITL.
 */

function norm(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function emailKey(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  return s.includes('@') ? s : '';
}

/**
 * @param {object} row — dump/suggest row with optional structured
 * @returns {string[]} raw hints (email / name / userId)
 */
function extractAssigneeHints(row = {}) {
  const structured = row.structured && typeof row.structured === 'object' ? row.structured : {};
  const keys = [
    'assigneeEmail',
    'assigneeName',
    'assignee',
    'ownerEmail',
    'owner',
    'email',
    'displayName',
    'assigneeUserId',
    'userId',
  ];
  const out = [];
  const seen = new Set();
  for (const key of keys) {
    const v = String(structured[key] ?? row[key] ?? '').trim();
    if (!v) continue;
    const k = norm(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/**
 * @param {Array<{ userId: string, email?: string, displayName?: string, username?: string }>} members
 */
function buildMemberDirectory(members = []) {
  const byEmail = new Map();
  const byName = new Map();
  const byId = new Map();
  for (const m of members) {
    const userId = String(m?.userId || '').trim();
    if (!userId) continue;
    const entry = {
      userId,
      email: String(m.email || '').trim(),
      displayName: String(m.displayName || m.username || '').trim(),
    };
    byId.set(userId, entry);
    const em = emailKey(entry.email);
    if (em) {
      if (!byEmail.has(em)) byEmail.set(em, []);
      byEmail.get(em).push(entry);
    }
    const name = norm(entry.displayName);
    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(entry);
    }
  }
  return { byEmail, byName, byId };
}

/**
 * @returns {{ status: 'matched'|'unresolved'|'ambiguous'|'empty', userId?: string, hint: string, candidates?: object[] }}
 */
function resolveHint(hint, directory) {
  const raw = String(hint || '').trim();
  if (!raw) return { status: 'empty', hint: '' };
  if (directory.byId.has(raw)) {
    return { status: 'matched', userId: raw, hint: raw };
  }
  const em = emailKey(raw);
  if (em && directory.byEmail.has(em)) {
    const hits = directory.byEmail.get(em);
    if (hits.length === 1) return { status: 'matched', userId: hits[0].userId, hint: raw };
    return { status: 'ambiguous', hint: raw, candidates: hits.slice(0, 5) };
  }
  const name = norm(raw);
  if (name && directory.byName.has(name)) {
    const hits = directory.byName.get(name);
    if (hits.length === 1) return { status: 'matched', userId: hits[0].userId, hint: raw };
    return { status: 'ambiguous', hint: raw, candidates: hits.slice(0, 5) };
  }
  return { status: 'unresolved', hint: raw };
}

/**
 * Apply first matched assignee onto structured; collect diff rows.
 * Mutates row.structured when matched.
 *
 * @returns {{ matched: object[], unresolved: object[], ambiguous: object[], applied: number }}
 */
function applyAssigneeResolution(rows = [], members = []) {
  const directory = buildMemberDirectory(members);
  const matched = [];
  const unresolved = [];
  const ambiguous = [];
  let applied = 0;

  for (const row of rows) {
    const hints = extractAssigneeHints(row);
    if (!hints.length) continue;
    const externalKey = String(row.externalKey || '').trim();
    const kind = String(row.kind || '').trim();
    let rowMatched = false;
    for (const hint of hints) {
      const result = resolveHint(hint, directory);
      if (result.status === 'matched') {
        if (!row.structured || typeof row.structured !== 'object') row.structured = {};
        row.structured.assigneeUserId = result.userId;
        row.structured.assigneeResolvedFrom = hint;
        matched.push({ externalKey, kind, hint, userId: result.userId });
        applied += 1;
        rowMatched = true;
        break;
      }
      if (result.status === 'ambiguous') {
        ambiguous.push({
          externalKey,
          kind,
          hint,
          candidateUserIds: (result.candidates || []).map((c) => c.userId),
        });
      } else if (result.status === 'unresolved') {
        unresolved.push({ externalKey, kind, hint });
      }
    }
    if (!rowMatched && hints.length && !ambiguous.some((a) => a.externalKey === externalKey)) {
      /* unresolved already recorded per hint */
    }
  }

  return {
    matched,
    unresolved,
    ambiguous,
    applied,
    summary: {
      matched: matched.length,
      unresolved: unresolved.length,
      ambiguous: ambiguous.length,
      applied,
    },
  };
}

/**
 * Soft report for Suggest HITL (no mutate required).
 */
function reportAssigneeHints(rows = [], members = []) {
  return applyAssigneeResolution(
    rows.map((r) => ({
      ...r,
      structured: { ...(r.structured && typeof r.structured === 'object' ? r.structured : {}) },
    })),
    members
  );
}

module.exports = {
  extractAssigneeHints,
  buildMemberDirectory,
  resolveHint,
  applyAssigneeResolution,
  reportAssigneeHints,
};
