/**
 * Gate 2 parallel ownership — mỗi role chỉ review phần mình.
 * PO: scope, priority, business value
 * Tech Lead: technical WBS, effort, risk
 * PM: timeline, schedule, budget, feasibility
 */

const GATE2_TRACKS = Object.freeze(['po', 'tech', 'pm']);

const GATE2_DOMAIN_SECTIONS = Object.freeze({
  po: Object.freeze(['scope']),
  tech: Object.freeze(['tasks', 'risks', 'quality']),
  pm: Object.freeze([
    'releases',
    'dependencies',
    'assignments',
    'deploy',
  ]),
});

const GATE2_DOMAIN_FOCUS = Object.freeze({
  po: 'Scope, priority, business value',
  tech: 'Technical WBS, effort, risk',
  pm: 'Timeline, schedule, budget, feasibility',
});

const TRACK_PERMISSION = Object.freeze({
  po: 'planning:po_review',
  tech: 'planning:tech_review',
  pm: 'planning:pm_review',
});

function sectionsForTrack(track) {
  const key = String(track || '').trim().toLowerCase();
  return GATE2_DOMAIN_SECTIONS[key] ? [...GATE2_DOMAIN_SECTIONS[key]] : [];
}

function trackForSection(sectionKey) {
  const key = String(sectionKey || '').trim().toLowerCase();
  for (const track of GATE2_TRACKS) {
    if (GATE2_DOMAIN_SECTIONS[track].includes(key)) return track;
  }
  return '';
}

module.exports = {
  GATE2_TRACKS,
  GATE2_DOMAIN_SECTIONS,
  GATE2_DOMAIN_FOCUS,
  TRACK_PERMISSION,
  sectionsForTrack,
  trackForSection,
};
