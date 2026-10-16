/**
 * Agile WBS display names — Epic → Feature → Story → Work Package → Task.
 * RULE: Feature ≠ FR; Story = FR value once; WP = area package; Task = deliverable.
 * Never promote LLM leaf titles to Story; never double-prefix (UI: UI: …).
 */

const WBS_CONTAINER_LEVELS = Object.freeze([
  'epic',
  'feature',
  'story',
  'work_package',
]);

const WP_AREA_LABELS = Object.freeze({
  frontend: 'UI',
  backend: 'API',
  api: 'API',
  auth: 'Auth API',
  database: 'Database',
  qa: 'End-to-end Verification',
  design: 'Design',
  infrastructure: 'Infrastructure',
  infra: 'Infrastructure',
  security: 'Security',
  deployment: 'Deploy',
  management: 'Planning',
  analysis: 'Analysis',
  external: 'Integration',
});

const AREA_TASK_PREFIX = Object.freeze({
  frontend: 'UI',
  backend: 'Backend',
  database: 'DB',
  api: 'API',
  auth: 'Auth',
  qa: 'QA',
  design: 'Design',
  infrastructure: 'Infra',
  infra: 'Infra',
  security: 'Security',
  deployment: 'Deploy',
  management: 'Plan',
  analysis: 'Analyze',
  external: 'Integrate',
});

const AREA_ROLE_HINT = Object.freeze({
  frontend: 'frontend_developer',
  backend: 'backend_developer',
  database: 'backend_developer',
  api: 'backend_developer',
  auth: 'backend_developer',
  infrastructure: 'devops_engineer',
  infra: 'devops_engineer',
  external: 'backend_developer',
  security: 'backend_developer',
  deployment: 'devops_engineer',
  qa: 'qa_engineer',
  design: 'ui_ux_designer',
  management: 'project_manager',
  analysis: 'business_analyst',
});

const AREA_PREFIX_RE = new RegExp(
  `^(${Object.values(AREA_TASK_PREFIX)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')}|Implement)\\s*:\\s*`,
  'i'
);

function normalizeNameKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function namesEqual(a, b) {
  const left = normalizeNameKey(a);
  const right = normalizeNameKey(b);
  return Boolean(left) && left === right;
}

function stripAreaPrefix(raw) {
  let s = String(raw || '').trim();
  // Peel repeated prefixes: "UI: UI: foo" → "foo"
  for (let i = 0; i < 4; i += 1) {
    if (!AREA_PREFIX_RE.test(s)) break;
    s = s.replace(AREA_PREFIX_RE, '').trim();
  }
  return s;
}

function hasAreaPrefix(raw) {
  return AREA_PREFIX_RE.test(String(raw || '').trim());
}

function looksLikeTechnicalLeafTitle(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (hasAreaPrefix(s)) return true;
  // Short English engineering verbs often used as leaf titles by LLM
  return /^(implement|build|add|create|write|verify|test|integrate|validate|fix)\b/i.test(s);
}

/**
 * Feature = product capability — never clone FR/story title.
 */
function resolveFeatureDisplayName({
  feature = '',
  featureName = '',
  featureLabel = '',
  capabilityName = '',
  frName = '',
  moduleName = 'General',
} = {}) {
  const fr = String(frName || '').trim();
  const explicit = String(feature || featureName || featureLabel || '').trim();
  if (explicit && !namesEqual(explicit, fr) && !looksLikeTechnicalLeafTitle(explicit)) {
    return explicit;
  }

  const cap = String(capabilityName || '').trim();
  if (cap && !namesEqual(cap, fr) && !looksLikeTechnicalLeafTitle(cap)) return cap;

  const mod = String(moduleName || 'General').trim() || 'General';
  if (mod && !namesEqual(mod, fr) && !/^general$/i.test(mod)) return mod;
  return `Capabilities — ${mod}`;
}

/**
 * Story = FR value PBI only. Never use LLM leaf / technical title as Story.
 */
function resolveStoryDisplayName({ frName = '', frId = '', fallback = '' } = {}) {
  const fr = String(frName || '').trim();
  if (fr && !looksLikeTechnicalLeafTitle(fr)) return fr;
  if (frId) return String(frId).trim();
  const fb = String(fallback || '').trim();
  if (fb && !looksLikeTechnicalLeafTitle(fb)) return fb;
  return frId ? String(frId) : 'User story';
}

/**
 * Task = technical deliverable under Story.
 * Keep distinct leaf names; strip duplicate area prefixes; only prefix when leaf copied Story/FR.
 */
function resolveTaskDisplayName({
  leafName = '',
  storyName = '',
  area = 'backend',
  index = null,
} = {}) {
  const leafRaw = String(leafName || '').trim();
  const story = String(storyName || '').trim();
  const leafStripped = stripAreaPrefix(leafRaw) || leafRaw;
  const storyStripped = stripAreaPrefix(story) || story;

  const prefix = AREA_TASK_PREFIX[String(area || '').toLowerCase()] || 'Implement';

  // Leaf already a distinct technical title (with or without prefix)
  if (
    leafRaw &&
    !namesEqual(leafRaw, story) &&
    !namesEqual(leafStripped, storyStripped) &&
    !namesEqual(leafStripped, story)
  ) {
    if (hasAreaPrefix(leafRaw)) {
      // Keep leaf's own prefix; only collapse "UI: UI: x" → "UI: x"
      const m = String(leafRaw).trim().match(AREA_PREFIX_RE);
      const kept = (m && m[1]) || prefix;
      return `${kept}: ${leafStripped}`.slice(0, 120);
    }
    return leafRaw.slice(0, 120);
  }

  const base = leafStripped || storyStripped || 'work item';
  const suffix = index != null && Number(index) > 0 ? ` (${Number(index) + 1})` : '';
  return `${prefix}: ${base}${suffix}`.slice(0, 120);
}

function roleKeyForArea(area = 'backend') {
  return AREA_ROLE_HINT[String(area || '').toLowerCase()] || 'backend_developer';
}

function isWbsContainerLevel(level) {
  return WBS_CONTAINER_LEVELS.includes(String(level || '').toLowerCase());
}

/**
 * Work Package label under a Story — e.g. "Authentication — API", "Authentication — UI".
 * Matches FR-LOGIN example WP-01 Authentication API / WP-02 Login UI / WP-03 E2E.
 */
function resolveWorkPackageDisplayName({
  area = 'backend',
  featureName = '',
  moduleName = '',
  storyName = '',
} = {}) {
  const areaKey = String(area || 'backend').toLowerCase();
  const part = WP_AREA_LABELS[areaKey] || 'Work';
  const scope = String(featureName || moduleName || '').trim();
  if (scope && !/^capabilities\b/i.test(scope) && !looksLikeTechnicalLeafTitle(scope)) {
    return `${scope} — ${part}`.slice(0, 120);
  }
  // Fall back to short WP label (avoid cloning Story/FR title onto WP)
  const story = String(storyName || '').trim();
  if (story && !looksLikeTechnicalLeafTitle(story) && story.length <= 40) {
    return `${story} — ${part}`.slice(0, 120);
  }
  return `WP — ${part}`.slice(0, 120);
}

/**
 * Containers (epic/feature/story/work_package) get effortHours = sum(children).
 * Leaves keep their own effort. Mutates a shallow-copied list.
 */
function applyContainerEffortRollup(nodes = []) {
  const list = (Array.isArray(nodes) ? nodes : []).map((n) => ({ ...n }));
  const byId = new Map(list.map((n) => [String(n.id), n]));
  const childrenOf = new Map();

  for (const n of list) {
    const level = String(n.level || '');
    if (level !== 'task') {
      n.effortSeedHours = 0;
      n.effortHours = 0;
      if (level === 'work_package' && !n.suggestedRoleKey) {
        n.suggestedRoleKey = roleKeyForArea(n.area);
      }
    } else {
      const h =
        n.effortHours != null
          ? Number(n.effortHours)
          : n.effortSeedHours != null
            ? Number(n.effortSeedHours)
            : 0;
      const hours = Number.isFinite(h) && h > 0 ? h : 0;
      n.effortSeedHours = hours || n.effortSeedHours || 0;
      n.effortHours = hours || n.effortHours || 0;
      if (!n.suggestedRoleKey) n.suggestedRoleKey = roleKeyForArea(n.area);
    }
    const pid = n.parentId != null ? String(n.parentId) : null;
    if (!pid) continue;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid).push(String(n.id));
  }

  // Post-order: leaves first via DFS from roots
  const visiting = new Set();
  function sumSubtree(id) {
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = byId.get(id);
    if (!node) return 0;
    const kids = childrenOf.get(id) || [];
    if (!kids.length) {
      return String(node.level) === 'task' ? Number(node.effortHours) || 0 : 0;
    }
    let total = 0;
    for (const kid of kids) total += sumSubtree(kid);
    if (isWbsContainerLevel(node.level)) {
      node.effortHours = total;
      node.effortSeedHours = total;
    }
    return String(node.level) === 'task' ? Number(node.effortHours) || 0 : total;
  }

  for (const n of list) {
    if (n.parentId == null) sumSubtree(String(n.id));
  }
  return list;
}

/**
 * Ensure no child keeps the exact same display title as its parent.
 */
function dedupeChildTitlesAgainstParents(nodes = []) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map((n) => [String(n.id), n]));

  return list.map((n) => {
    const parent = n.parentId != null ? byId.get(String(n.parentId)) : null;
    if (!parent || !namesEqual(n.name, parent.name)) return n;

    const level = String(n.level || '');
    if (level === 'feature') {
      return {
        ...n,
        name: resolveFeatureDisplayName({
          frName: parent.name,
          moduleName: parent.name,
        }),
      };
    }
    if (level === 'task') {
      return {
        ...n,
        name: resolveTaskDisplayName({
          leafName: n.name,
          storyName: parent.name,
          area: n.area || 'backend',
        }),
      };
    }
    if (level === 'story') {
      const base = String(n.name || 'Story').trim() || 'Story';
      if (looksLikeTechnicalLeafTitle(base)) {
        return { ...n, name: resolveStoryDisplayName({ frId: n.id, frName: '' }) };
      }
      return { ...n, name: `${base} (story)`.slice(0, 120) };
    }
    if (level === 'work_package') {
      return {
        ...n,
        name: resolveWorkPackageDisplayName({
          area: n.area || 'backend',
          featureName: parent.name,
          storyName: parent.name,
        }),
      };
    }
    return n;
  });
}

module.exports = {
  AREA_TASK_PREFIX,
  AREA_ROLE_HINT,
  WP_AREA_LABELS,
  WBS_CONTAINER_LEVELS,
  normalizeNameKey,
  namesEqual,
  stripAreaPrefix,
  hasAreaPrefix,
  looksLikeTechnicalLeafTitle,
  resolveFeatureDisplayName,
  resolveStoryDisplayName,
  resolveWorkPackageDisplayName,
  resolveTaskDisplayName,
  roleKeyForArea,
  isWbsContainerLevel,
  applyContainerEffortRollup,
  dedupeChildTitlesAgainstParents,
};
