/**
 * Detect hours capacity soft warning from task-service PATCH/POST card (409).
 */
export function isHoursSoftWarning(errorLike) {
  const data = errorLike?.data || errorLike?.response?.data || {};
  const code = String(data?.errorCode || data?.code || '').trim();
  const status = errorLike?.status || errorLike?.response?.status || null;
  return code === 'HOURS_SOFT_WARNING' || (status === 409 && code.includes('HOURS_SOFT'));
}

export function buildHoursWarnMessage(meta, t, name) {
  const who = name || '';
  const parts = [];
  for (const row of meta?.daily || []) {
    const weekdayKey = `taskBoard.hoursWeekday${row.weekday || ''}`;
    const weekday = t(weekdayKey);
    parts.push(
      t('taskBoard.hoursDailyWarn', {
        weekday: weekday === weekdayKey ? row.weekday : weekday,
        name: who,
        hours: row.hours,
        overBy: row.overBy,
      })
    );
  }
  for (const row of meta?.weekly || []) {
    parts.push(t('taskBoard.hoursWeeklyWarn', { name: who, hours: row.hours }));
  }
  return parts.filter(Boolean).join(' ') || meta?.message || '';
}

export function readHoursSoftWarningMeta(errorLike) {
  const data = errorLike?.data || errorLike?.response?.data || {};
  const daily = data?.daily ?? data?.extra?.daily ?? [];
  const weekly = data?.weekly ?? data?.extra?.weekly ?? [];
  return {
    daily: Array.isArray(daily) ? daily : [],
    weekly: Array.isArray(weekly) ? weekly : [],
    assigneeId: data?.assigneeId ?? data?.extra?.assigneeId ?? null,
    message: data?.messageUser || data?.message || '',
  };
}
