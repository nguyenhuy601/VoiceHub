import { mergeDeep } from './mergeDeep.js';
import { extraStrings } from './appStrings.extra.js';
import { pageStrings } from './appStrings.pages.js';
import { STRINGS_BASE } from './appStrings.base.js';

export const STRINGS = {
  vi: mergeDeep(mergeDeep(STRINGS_BASE.vi, extraStrings.vi), pageStrings.vi),
  en: mergeDeep(mergeDeep(STRINGS_BASE.en, extraStrings.en), pageStrings.en),
};

export function getPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

export function getStrings(locale) {
  return STRINGS[locale] || STRINGS.vi;
}

/** Translator không cần React — dùng trong services/api layer. */
export function createTranslator(locale) {
  const dict = getStrings(locale);
  return (path, vars) => {
    let s = getPath(dict, path);
    if (s == null) s = getPath(STRINGS.vi, path);
    if (s == null) return path;
    if (vars && typeof s === 'string') {
      return s.replace(/\{(\w+)\}/g, (_, k) =>
        vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''
      );
    }
    return s;
  };
}
