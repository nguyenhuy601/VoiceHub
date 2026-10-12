import { mergeDeep } from './mergeDeep.js';
import { extraStrings } from './appStrings.extra.js';
import { pageStrings } from './appStrings.pages.js';
import { adminDomainStrings } from './adminDomains.strings.js';
import { gapStrings } from './appStrings.gaps.js';
import { STRINGS_BASE } from './appStrings.base.js';

export const STRINGS = {
  vi: mergeDeep(mergeDeep(mergeDeep(mergeDeep(STRINGS_BASE.vi, extraStrings.vi), pageStrings.vi), adminDomainStrings.vi), gapStrings.vi),
  en: mergeDeep(mergeDeep(mergeDeep(mergeDeep(STRINGS_BASE.en, extraStrings.en), pageStrings.en), adminDomainStrings.en), gapStrings.en),
};

export function getPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

export function getStrings(locale) {
  return STRINGS[locale] || STRINGS.vi;
}

/**
 * Translator không cần React — dùng trong services/api layer.
 * Locale `en` không fallback sang từ điển `vi` (thiếu khóa thì trả path).
 */
export function createTranslator(locale) {
  const dict = getStrings(locale);
  const allowViFallback = locale !== 'en';
  return (path, vars) => {
    let s = getPath(dict, path);
    if (s == null && allowViFallback) s = getPath(STRINGS.vi, path);
    if (s == null) return path;
    if (vars && typeof s === 'string') {
      return s.replace(/\{(\w+)\}/g, (_, k) =>
        vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''
      );
    }
    return s;
  };
}
