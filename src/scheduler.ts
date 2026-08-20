import type { HolidaySet } from './date.js'
import {
  addWorkdays,
  diffDays,
  isWorkday,
  nextWorkday,
  parseDate,
  previousWorkday,
  subtractWorkdays,
  toIso,
  todayIso,
  workdayCountInclusive,
} from './date.js'
import type { ProjectDefinition, Timeline, TimelineMilestone, TimelineTask } from './types.js'

/** A task as passed to the scheduler by the agent. */
export interface TaskInput {
  id: string
  name: string
  phase: string
  dependsOn?: string[]
  effortDays: number
  agents?: number
  /** Manual start override (ISO date). Kept as-is by the scheduler. */
  pinnedStart?: string
  /** Manual end override (ISO date). Kept as-is by the scheduler. */
  pinnedEnd?: string
  /** Completion percentage (0-100); preserved through re-scheduling. */
  progress?: number
  /** Optional access tier id for the project-plan document. */
  tier?: string
  /** Optional owner for the project-plan document. */
  owner?: string
}

interface Resolved {
  start: Date
  end: Date
}

/**
 * Deterministic scheduling: topological pass over dependencies, workday-aware
 * dating, critical-path detection, and deadline/budget feasibility checks.
 * The agent decomposes features into tasks; this function only does the math.
 */
export function schedule(
  definition: ProjectDefinition,
  tasks: TaskInput[],
  hoursPerDay = 8,
  holidays?: HolidaySet,
): Timeline {
  const conflicts: string[] = []
  const byId = new Map<string, TaskInput>(tasks.map((t) => [t.id, t]))
  const knownIds = new Set(tasks.map((t) => t.id))

  // Reference checks for unknown dependencies.
  for (const t of tasks) {
    for (const dep of t.dependsOn ?? []) {
      if (!knownIds.has(dep)) {
        conflicts.push(`Task "${t.id}" depends on unknown task "${dep}".`)
      }
    }
  }

  const resolved = new Map<string, Resolved>()
  const resolutionOrder: string[] = []

  // Pinned tasks resolve first so dependents can anchor on them.
  for (const t of tasks) {
    if (t.pinnedStart && t.pinnedEnd) {
      resolved.set(t.id, { start: parseDate(t.pinnedStart), end: parseDate(t.pinnedEnd) })
      resolutionOrder.push(t.id)
    }
  }

  const projectStart = definition.startDate ? parseDate(definition.startDate) : parseDate(todayIso())

  // Kahn-style topological resolution.
  let progress = true
  while (progress) {
    progress = false
    for (const t of tasks) {
      if (resolved.has(t.id)) continue
      const deps = (t.dependsOn ?? []).filter((d) => knownIds.has(d))
      if (deps.some((d) => !resolved.has(d))) continue // cycle or not ready yet

      let start: Date
      if (t.pinnedStart) {
        start = parseDate(t.pinnedStart)
      } else if (deps.length > 0) {
        const latest = new Date(Math.max(...deps.map((d) => resolved.get(d)!.end.getTime())))
        start = nextWorkday(latest, holidays)
      } else {
        start = isWorkday(projectStart, holidays) ? new Date(projectStart) : nextWorkday(projectStart, holidays)
      }
      const end = t.pinnedEnd
        ? parseDate(t.pinnedEnd)
        : addWorkdays(start, Math.max(0, Math.ceil(t.effortDays / Math.max(1, t.agents ?? 1)) - 1), holidays)
      resolved.set(t.id, { start, end })
      resolutionOrder.push(t.id)
      progress = true
    }
  }

  // Anything still unresolved is part of a dependency cycle.
  for (const t of tasks) {
    if (!resolved.has(t.id)) {
      conflicts.push(`Task "${t.id}" is part of a dependency cycle.`)
      resolved.set(t.id, { start: projectStart, end: projectStart })
    }
  }

  // Critical path: proper backward pass. For each follower, its latest start is
  // its latest end minus its workday duration; a predecessor's latest end is the
  // workday immediately before the earliest follower start.
  const dependents = new Map<string, string[]>()
  for (const t of tasks) {
    for (const dep of t.dependsOn ?? []) {
      if (knownIds.has(dep)) dependents.set(dep, [...(dependents.get(dep) ?? []), t.id])
    }
  }
  const overallEnd = tasks.length > 0
    ? new Date(Math.max(...[...resolved.values()].map((r) => r.end.getTime())))
    : new Date(projectStart)
  const latestEnd = new Map<string, Date>()
  for (const id of [...resolutionOrder].reverse()) {
    const t = byId.get(id)!
    const followers = dependents.get(id) ?? []
    let latest: Date
    if (followers.length === 0) {
      latest = new Date(overallEnd)
    } else {
      const latestStarts = followers.map((f) => {
        const end = latestEnd.get(f)!
        const duration = workdayCountInclusive(resolved.get(f)!.start, end, holidays)
        return subtractWorkdays(end, duration - 1, holidays)
      })
      latest = previousWorkday(new Date(Math.min(...latestStarts.map((d) => d.getTime()))), holidays)
    }
    latestEnd.set(id, latest)
  }
  const criticalIds = new Set<string>()
  for (const t of tasks) {
    const { end } = resolved.get(t.id)!
    if (diffDays(end, latestEnd.get(t.id)!) === 0) criticalIds.add(t.id)
  }
  const criticalPath = tasks.filter((t) => criticalIds.has(t.id)).map((t) => t.id)

  const timelineTasks: TimelineTask[] = tasks.map((t) => {
    const { start, end } = resolved.get(t.id)!
    return {
      id: t.id,
      name: t.name,
      phase: t.phase,
      dependsOn: t.dependsOn ?? [],
      effortDays: t.effortDays,
      agents: Math.max(1, t.agents ?? 1),
      start: toIso(start),
      end: toIso(end),
      status: 'planned',
      progress: t.progress ?? 0,
      pinned: Boolean(t.pinnedStart || t.pinnedEnd),
      critical: criticalIds.has(t.id),
      tier: t.tier,
      owner: t.owner,
    }
  })

  const phaseNames = [...new Set(tasks.map((t) => t.phase))]
  const phases = phaseNames
    .map((name) => {
      const inPhase = timelineTasks.filter((t) => t.phase === name)
      const start = Math.min(...inPhase.map((t) => parseDate(t.start).getTime()))
      const end = Math.max(...inPhase.map((t) => parseDate(t.end).getTime()))
      return { name, start: toIso(new Date(start)), end: toIso(new Date(end)) }
    })
    .sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())

  const endDate = toIso(overallEnd)
  if (definition.deadline) {
    if (parseDate(endDate) > parseDate(definition.deadline)) {
      conflicts.push(`Timeline ends ${endDate}, after the deadline ${definition.deadline}.`)
    }
  }

  // Budget sanity check when the user budgets in agent-hours.
  if (definition.budgetModel?.kind === 'hours') {
    const totalEffortHours = tasks.reduce((sum, t) => sum + t.effortDays, 0) * hoursPerDay
    const allocations = definition.budgetModel.allocations ?? []
    const period = allocations.length > 0 && allocations.every((a) => a.period === allocations[0]!.period)
      ? allocations[0]!.period
      : undefined
    if (period === 'week') {
      const spanDays = diffDays(projectStart, overallEnd) + 1
      const weeklyEffort = spanDays > 0 ? (totalEffortHours / spanDays) * 7 : totalEffortHours
      const weeklyAllocated = allocations.reduce((sum, a) => sum + a.amount, 0)
      if (weeklyAllocated > 0 && weeklyEffort > weeklyAllocated) {
        conflicts.push(
          `Estimated effort averages ${Math.round(weeklyEffort)}h/week, above the allocated ${weeklyAllocated}h/week.`,
        )
      }
    } else {
      const allocatedHours = allocations.reduce((sum, a) => sum + a.amount, 0)
      if (allocatedHours > 0 && totalEffortHours > allocatedHours) {
        conflicts.push(`Total estimated effort (${totalEffortHours}h) exceeds the allocated agent budget (${allocatedHours}h).`)
      }
    }
  }

  const milestones: TimelineMilestone[] = []
  for (const phase of phases) {
    milestones.push({ name: `${phase.name} complete`, date: phase.end })
  }
  for (const m of definition.milestones ?? []) {
    if (m.date) milestones.push({ name: m.name, date: m.date })
  }

  return {
    projectName: definition.name,
    startDate: toIso(projectStart),
    endDate,
    deadline: definition.deadline,
    feasible: conflicts.length === 0,
    conflicts,
    criticalPath,
    tasks: timelineTasks,
    phases,
    milestones,
    hoursPerDay,
  }
}
