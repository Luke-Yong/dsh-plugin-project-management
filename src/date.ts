const MS_PER_DAY = 86_400_000

/**
 * Calendar extras threaded through the workday math. Dates are ISO strings
 * (YYYY-MM-DD) excluded from workdays — e.g. public holidays resolved from
 * `date-holidays` via `src/holidays.ts`.
 */
export type HolidaySet = ReadonlySet<string>

/** Parse an ISO date (YYYY-MM-DD) as a local-midnight Date. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** Format a Date as an ISO date (YYYY-MM-DD). */
export function toIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/**
 * Monday-Friday is a workday, unless the date is a holiday. Leap years and
 * month/year rollovers are handled by JS `Date` calendar arithmetic.
 */
export function isWorkday(date: Date, holidays?: HolidaySet): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  return holidays === undefined || holidays.size === 0 || !holidays.has(toIso(date))
}

/** The first workday strictly after `date`. */
export function nextWorkday(date: Date, holidays?: HolidaySet): Date {
  let cursor = addDays(date, 1)
  while (!isWorkday(cursor, holidays)) cursor = addDays(cursor, 1)
  return cursor
}

/** Add `n` workdays strictly after `start`. */
export function addWorkdays(start: Date, n: number, holidays?: HolidaySet): Date {
  let cursor = start
  for (let i = 0; i < n; i++) cursor = nextWorkday(cursor, holidays)
  return cursor
}

/** The `n`-th workday strictly before `end` (moves backwards). */
export function subtractWorkdays(end: Date, n: number, holidays?: HolidaySet): Date {
  let cursor = end
  for (let i = 0; i < n; i++) cursor = previousWorkday(cursor, holidays)
  return cursor
}

/** The first workday strictly before `date`. */
export function previousWorkday(date: Date, holidays?: HolidaySet): Date {
  let cursor = addDays(date, -1)
  while (!isWorkday(cursor, holidays)) cursor = addDays(cursor, -1)
  return cursor
}

/** Number of workdays in the inclusive range [start, end]. */
export function workdayCountInclusive(start: Date, end: Date, holidays?: HolidaySet): number {
  let count = 0
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (isWorkday(cursor, holidays)) count++
  }
  return count
}

/** Whole calendar days from `a` to `b` (negative when `b` precedes `a`). */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

/** ISO workday dates in [start, end], inclusive. */
export function listWorkdays(start: Date, end: Date, holidays?: HolidaySet): string[] {
  const out: string[] = []
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (isWorkday(cursor, holidays)) out.push(toIso(cursor))
  }
  return out
}

export function todayIso(): string {
  return toIso(new Date())
}
