/**
 * C2 — Trích text PDF + map heuristic → draft capability fields.
 * Không tự verified; caller apply save_draft + source=cv_parse.
 */

const fs = require('fs');
const {
  SKILL_WHITELIST,
  normalizeSkillName,
  SUMMARY_MAX_LEN,
  YEARS_EXPERIENCE_MAX,
  MAX_SKILLS,
} = require('../constants/capabilityCatalog');

async function extractPdfText(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return String(data?.text || '').trim();
}

function inferYearsExperience(text) {
  const lower = String(text || '').toLowerCase();
  const patterns = [
    /(\d{1,2})\s*\+\s*(?:năm|nam|years?)/i,
    /(\d{1,2})\s*(?:năm|nam)\s*(?:kinh\s*nghiệm|kn|experience)/i,
    /(\d{1,2})\s*(?:years?)\s*(?:of\s+)?(?:experience|exp)/i,
    /experience\s*[:\-]?\s*(\d{1,2})\s*(?:years?|yrs?)/i,
  ];
  for (const re of patterns) {
    const m = lower.match(re) || text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= YEARS_EXPERIENCE_MAX) return n;
    }
  }
  return null;
}

function inferPositionCode(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(tech\s*lead|trưởng\s*nhóm\s*kỹ\s*thuật|team\s*lead)\b/.test(t)) return 'tl';
  if (/\b(project\s*manager|quản\s*lý\s*dự\s*án|\bpm\b)\b/.test(t)) return 'pm';
  if (/\b(business\s*analyst|\bba\b|phân\s*tích\s*nghiệp\s*vụ)\b/.test(t)) return 'ba';
  if (/\b(qa|tester|kiểm\s*thử|quality\s*assurance)\b/.test(t)) return 'qa';
  if (/\b(intern|thực\s*tập)\b/.test(t)) return 'intern';
  if (/\b(developer|software\s*engineer|lập\s*trình|backend|frontend|full[\s-]?stack)\b/.test(t)) {
    return 'dev';
  }
  return '';
}

function inferPrimaryDomain(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(devops|sre|kubernetes|ci\/cd|docker\s*compose)\b/.test(t) && !/\bfrontend\b/.test(t)) {
    return 'devops';
  }
  if (/\b(mobile|react\s*native|flutter|android|ios)\b/.test(t)) return 'mobile';
  if (/\b(qa|tester|selenium|playwright|cypress)\b/.test(t) && !/\bdeveloper\b/.test(t)) return 'qa';
  if (/\b(business\s*analyst|\bba\b|requirement)\b/.test(t)) return 'ba';
  if (/\b(full[\s-]?stack)\b/.test(t)) return 'fullstack';
  if (/\b(front[\s-]?end|react|vue|angular)\b/.test(t) && !/\bback[\s-]?end\b/.test(t)) return 'fe';
  if (/\b(back[\s-]?end|node\.?js|spring|django|nestjs|express)\b/.test(t)) return 'be';
  return '';
}

function extractSkillsFromText(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const found = [];
  const seen = new Set();

  // Whitelist dài trước để ".NET" / "Node.js" không bị cắt nhầm
  const sorted = [...SKILL_WHITELIST].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    // word-ish match
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i');
    if (re.test(lower) || lower.includes(key)) {
      const canonical = normalizeSkillName(name) || name;
      const ck = canonical.toLowerCase();
      if (!seen.has(ck)) {
        seen.add(ck);
        found.push({ name: canonical, level: 3 });
      }
    }
    if (found.length >= MAX_SKILLS) break;
  }
  return found;
}

function buildSummary(text) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.slice(0, SUMMARY_MAX_LEN);
}

const CV_PE_SECTION_RE =
  /(?:^|\n)\s*(experience|work\s*experience|projects?|project\s*experience|kinh\s*nghi[ệe]m|d[ựu]\s*án)\s*[:\-]?\s*\n/i;
const CV_PE_NEXT_SECTION_RE =
  /\n\s*(education|skills?|certifications?|học\s*vấn|kỹ\s*năng|summary|tóm\s*tắt)\s*[:\-]?\s*\n/i;
const CV_PE_MAX = 5;

/**
 * Heuristic: Experience/Projects blocks → suggested projectExperiences (never verified).
 * @param {string} text
 * @param {{ max?: number }} [opts]
 * @returns {Array<object>}
 */
function extractProjectExperiencesFromText(text, { max = CV_PE_MAX } = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return [];

  let body = raw;
  const sectionMatch = raw.match(CV_PE_SECTION_RE);
  if (sectionMatch && sectionMatch.index != null) {
    const start = sectionMatch.index + sectionMatch[0].length;
    const rest = raw.slice(start);
    const nextIdx = rest.search(CV_PE_NEXT_SECTION_RE);
    body = nextIdx >= 0 ? rest.slice(0, nextIdx) : rest;
  }

  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 12);
  const out = [];
  const seen = new Set();

  for (const block of blocks) {
    if (out.length >= max) break;
    const lines = block
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const header = lines[0];
    // Skip skill-only lines when no dedicated section matched
    if (!sectionMatch && /^(skills?|kỹ\s*năng)\b/i.test(header)) continue;

    const yearMatch = block.match(/\b((?:19|20)\d{2})\b/);
    let year;
    if (yearMatch) {
      const y = Number(yearMatch[1]);
      if (Number.isFinite(y) && y >= 1970 && y <= 2100) year = y;
    }

    let name = '';
    let role = '';
    const parts = header.split(/\s+[—–\-|]\s+/);
    if (parts.length >= 2) {
      name = parts[0].replace(/\s*\(?\d{4}.*$/, '').trim();
      role = parts[1].replace(/\s*\(?\d{4}.*$/, '').trim();
    } else {
      const atMatch = header.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atMatch) {
        role = atMatch[1].replace(/\s*\(?\d{4}.*$/, '').trim();
        name = atMatch[2].replace(/\s*\(?\d{4}.*$/, '').trim();
      } else {
        name = header.replace(/\s*\(?\d{4}.*$/, '').trim().slice(0, 120);
        role = 'contributor';
      }
    }
    if (!name && !role) continue;
    if (!name) name = String(role).slice(0, 80);
    if (!role) role = 'contributor';

    const work =
      lines.slice(1).join(' ').trim().slice(0, 300) ||
      header.replace(/\s*\(?\d{4}.*$/, '').trim().slice(0, 300);
    if (!work) continue;

    const key = `${name.toLowerCase()}|${role.toLowerCase()}|${year || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const row = {
      name: String(name).slice(0, 120),
      role: String(role).slice(0, 64),
      work: String(work).slice(0, 300),
      source: 'cv_parse',
      status: 'suggested',
    };
    if (year != null) row.year = year;
    out.push(row);
  }

  return out;
}

/**
 * @param {string} text
 * @returns {{ primaryDomain: string, yearsExperience: number|null, skills: object[], summary: string, availability: string, projectExperiences: object[] }}
 */
function mapTextToCapabilityFields(text) {
  const skills = extractSkillsFromText(text);
  const projectExperiences = extractProjectExperiencesFromText(text);
  return {
    primaryDomain: inferPrimaryDomain(text),
    yearsExperience: inferYearsExperience(text),
    skills,
    summary: buildSummary(text),
    availability: 'available',
    projectExperiences,
  };
}

/**
 * @param {string} filePath
 * @returns {Promise<{ ok: true, text: string, fields: object, parseNote?: string } | { ok: false, errorCode: string, message: string }>}
 */
async function parseCvFileToFields(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, errorCode: 'CV_FILE_MISSING', message: 'CV file not found' };
  }
  let text = '';
  try {
    text = await extractPdfText(filePath);
  } catch (err) {
    return {
      ok: false,
      errorCode: 'CV_PARSE_FAILED',
      message: err?.message || 'Could not parse PDF',
    };
  }
  if (!text || text.length < 20) {
    return {
      ok: true,
      text: text || '',
      fields: mapTextToCapabilityFields(''),
      parseNote: 'empty_or_scanned',
    };
  }
  return {
    ok: true,
    text,
    fields: mapTextToCapabilityFields(text),
    parseNote: text.length < 80 ? 'low_text' : 'ok',
  };
}

module.exports = {
  extractPdfText,
  inferYearsExperience,
  inferPositionCode,
  inferPrimaryDomain,
  extractSkillsFromText,
  extractProjectExperiencesFromText,
  mapTextToCapabilityFields,
  parseCvFileToFields,
};
