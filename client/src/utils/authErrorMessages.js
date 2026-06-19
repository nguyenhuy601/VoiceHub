import { createTranslator } from '../locales/buildStrings.js';
import { readStoredLocale } from './localeFormat.js';

/**
 * Map thông báo phiên JWT từ server sang chuỗi thân thiện theo locale.
 */
export function mapAuthSessionMessageForLogout(_serverMessage, locale) {
  const t = createTranslator(locale || readStoredLocale());
  return t('authSession.sessionExpired');
}
