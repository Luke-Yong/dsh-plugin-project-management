import Holidays from 'date-holidays'
import { parseDate } from './date.js'

/**
 * Public-holiday dates (ISO, YYYY-MM-DD) for a country across [startIso,
 * endIso], computed with the rules-based `date-holidays` package. It handles
 * fixed and lunar/moving holidays (Chinese New Year, Eid, Deepavali…) year
 * after year with no manual tables. Leap years are a non-issue: `date.js`
 * runs on JS `Date` calendar arithmetic.
 *
 * Unknown country codes yield an empty set (weekends still apply). `extra`
 * dates are merged in for project-specific days off. All dates fall within
 * the requested span, so the set is small and cheap to thread through the
 * scheduler.
 */
export function buildHolidaySet(
  country: string | undefined,
  startIso: string,
  endIso: string,
  extra?: readonly string[],
): Set<string> {
  const set = new Set<string>(extra ?? [])
  if (country === undefined || country === '') return set
  try {
    const holidays = new Holidays(country)
    const startYear = parseDate(startIso).getFullYear()
    const endYear = parseDate(endIso).getFullYear()
    for (let year = startYear; year <= endYear; year++) {
      for (const item of holidays.getHolidays(year)) {
        if (item.type !== 'public') continue
        const iso = String(item.date).slice(0, 10)
        if (iso >= startIso && iso <= endIso) set.add(iso)
      }
    }
  } catch {
    // Unknown country or data error — fall back to weekends only.
  }
  return set
}
