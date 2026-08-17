const MS_PER_DAY = 86_400_000

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

/** Monday-Friday is considered a workday. */
export function isWorkday(date: Date): boolean {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

/** The first workday strictly after `date`. */
export function nextWorkday(date: Date): Date {
  let cursor = addDays(date, 1)
  while (!isWorkday(cursor)) cursor = addDays(cursor, 1)
  return cursor
}

/** Add `n` workdays strictly after `start`. */
export function addWorkdays(start: Date, n: number): Date {
  let cursor = start
  for (let i = 0; i < n; i++) cursor = nextWorkday(cursor)
  return cursor
}

/** The `n`-th workday strictly before `end` (moves backwards). */
export function subtractWorkdays(end: Date, n: number): Date {
  let cursor = end
  for (let i = 0; i < n; i++) cursor = previousWorkday(cursor)
  return cursor
}

/** The first workday strictly before `date`. */
export function previousWorkday(date: Date): Date {
  let cursor = addDays(date, -1)
  while (!isWorkday(cursor)) cursor = addDays(cursor, -1)
  return cursor
}

/** Number of workdays in the inclusive range [start, end]. */
export function workdayCountInclusive(start: Date, end: Date): number {
  let count = 0
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (isWorkday(cursor)) count++
  }
  return count
}

/** Whole calendar days from `a` to `b` (negative when `b` precedes `a`). */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

/** ISO workday dates in [start, end], inclusive. */
export function listWorkdays(start: Date, end: Date): string[] {
  const out: string[] = []
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (isWorkday(cursor)) out.push(toIso(cursor))
  }
  return out
}

export function todayIso(): string {
  return toIso(new Date())
}
