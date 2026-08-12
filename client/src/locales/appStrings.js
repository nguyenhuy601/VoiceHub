import { useCallback, useMemo } from 'react';
import { useLocale } from '../context/LocaleContext';
import { STRINGS, createTranslator, getStrings } from './buildStrings';

export { STRINGS, createTranslator, getStrings };

export function useAppStrings() {
  const { locale, toggleLocale, setLocale } = useLocale();
  const dict = useMemo(() => getStrings(locale), [locale]);

  const t = useCallback((path, vars) => createTranslator(locale)(path, vars), [locale]);

  return { t, locale, toggleLocale, setLocale, dict };
}
