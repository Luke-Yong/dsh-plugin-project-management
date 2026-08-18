import { addDays, diffDays, parseDate, toIso, workdayCountInclusive } from './date.js'
import type { ProjectDefinition, Timeline } from './types.js'

/**
 * The project-plan document schema consumed by `templates/gantt.html`
 * (served as-is by the host app's `/api/project-plan` endpoint). The plugin
 * writes this shape to `<workspace>/data/project_management/project_data.json`
 * and embeds its own round-trip state under `_dsh` (ignored by the renderer).
 */

/** Brand palette used by the gantt layout. */
const PHASE_COLORS = ['#ae852d', '#e1251b', '#53575a'] as const

export interface JourneyProject {
  name: string
  description: string
  start_date: string
  end_date: string
  duration_months: number
  reporting_cadence: string
  sprint_days: number
}

export interface JourneyTier {
  id: string
  name: string
  description?: string
}

export interface JourneyPhase {
  id: string
  name: string
  sprints: [number, number]
  color: string
}

export interface JourneyTask {
  id: string
  name: string
  phase: string
  tier: string
  sprint: number
  start: string
  end: string
  progress: number
  dependencies: string[]
  owner: string
}

export interface JourneyMilestone {
  id: string
  name: string
  date: string
  kind: 'phase' | 'report'
}

export interface JourneySprint {
  number: number
  name: string
  theme: string
  start: string
  end: string
  deliverables: string[]
}

export interface JourneyDocument {
  project: JourneyProject
  user_tiers: JourneyTier[]
  phases: JourneyPhase[]
  tasks: JourneyTask[]
  milestones: JourneyMilestone[]
  sprints: JourneySprint[]
  /** Plugin-owned round-trip state; the gantt renderer ignores it. */
  _dsh?: { definition: ProjectDefinition; timeline?: Timeline; updatedAt: string }
}

const DEFAULT_TIER: JourneyTier = { id: 'team', name: 'Team' }
const DEFAULT_OWNER = 'Team'

function buildSprints(startIso: string, endIso: string, sprintDays: number): JourneySprint[] {
  const sprints: JourneySprint[] = []
  let cursor = parseDate(startIso)
  const end = parseDate(endIso)
  let number = 1
  while (cursor <= end) {
    const clamped = (() => {
      const candidate = addDays(cursor, sprintDays - 1)
      return candidate > end ? new Date(end) : candidate
    })()
    sprints.push({
      number,
      name: `Sprint ${number}`,
      theme: '',
      start: toIso(cursor),
      end: toIso(clamped),
      deliverables: [],
    })
    cursor = addDays(clamped, 1)
    number++
  }
  return sprints
}

function sprintNumberFor(dateIso: string, sprints: JourneySprint[]): number {
  const date = parseDate(dateIso)
  for (const sprint of sprints) {
    if (date >= parseDate(sprint.start) && date <= parseDate(sprint.end)) return sprint.number
  }
  return sprints[0]?.number ?? 1
}

/** Build the project-plan document from the plugin's definition + timeline. */
export function buildProjectData(
  definition: ProjectDefinition,
  timeline: Timeline | undefined,
  updatedAt: string,
): JourneyDocument {
  const sprintDays = definition.sprintDays ?? 14
  const startDate = timeline?.startDate ?? definition.startDate ?? definition.deadline ?? new Date().toISOString().slice(0, 10)
  // The project end is the later of the deadline and the scheduled end — a
  // timeline with slack must not truncate the sprint calendar.
  const endDate = toIso(
    [definition.deadline, timeline?.endDate]
      .filter((value): value is string => typeof value === 'string')
      .map(parseDate)
      .reduce((latest, candidate) => (candidate > latest ? candidate : latest), parseDate(startDate)),
  )

  const tiers = definition.tiers !== undefined && definition.tiers.length > 0
    ? definition.tiers.map((tier) => ({ id: tier.id, name: tier.name, description: tier.description }))
    : [DEFAULT_TIER]
  const defaultTier = tiers[0]!.id
  const owners = definition.owners !== undefined && definition.owners.length > 0 ? definition.owners : [DEFAULT_OWNER]
  const defaultOwner = owners[0]!

  const sprints = buildSprints(startDate, endDate, sprintDays)

  const phases: JourneyPhase[] = (timeline?.phases ?? []).map((phase, index) => ({
    id: `p${index + 1}`,
    name: phase.name,
    sprints: [sprintNumberFor(phase.start, sprints), sprintNumberFor(phase.end, sprints)] as [number, number],
    color: PHASE_COLORS[index % PHASE_COLORS.length]!,
  }))
  const phaseIdByName = new Map(phases.map((phase) => [phase.name, phase.id]))

  const tasks: JourneyTask[] = (timeline?.tasks ?? []).map((task) => ({
    id: task.id,
    name: task.name,
    phase: phaseIdByName.get(task.phase) ?? phases[0]?.id ?? 'p1',
    tier: task.tier ?? defaultTier,
    sprint: sprintNumberFor(task.start, sprints),
    start: task.start,
    end: task.end,
    progress: 0,
    dependencies: task.dependsOn,
    owner: task.owner ?? defaultOwner,
  }))

  const milestones: JourneyMilestone[] = (timeline?.milestones ?? []).map((milestone, index) => ({
    id: `M${index + 1}`,
    name: milestone.name,
    date: milestone.date,
    kind: 'phase' as const,
  }))

  return {
    project: {
      name: definition.name,
      description: definition.description ?? '',
      start_date: startDate,
      end_date: endDate,
      duration_months: Math.max(1, Math.round(diffDays(parseDate(startDate), parseDate(endDate)) / 30.44)),
      reporting_cadence: definition.reportingCadence ?? 'bi-weekly',
      sprint_days: sprintDays,
    },
    user_tiers: tiers,
    phases,
    tasks,
    milestones,
    sprints,
    _dsh: { definition, timeline, updatedAt },
  }
}

/** Reverse-map a journey document (without a usable `_dsh`) back into ProjectState. */
export function fromJourneyDocument(raw: JourneyDocument): {
  definition: ProjectDefinition
  timeline: Timeline
  updatedAt: string
} {
  const project = raw.project
  const tiers = raw.user_tiers ?? []
  const owners = [...new Set(raw.tasks.map((task) => task.owner).filter(Boolean))]
  const sprintByNumber = new Map(raw.sprints.map((sprint) => [sprint.number, sprint]))

  const phaseDates = (phaseId: string): { start: string; end: string } => {
    const phase = raw.phases.find((p) => p.id === phaseId)
    if (phase === undefined) return { start: project.start_date, end: project.end_date }
    const fromSprint = sprintByNumber.get(phase.sprints[0])
    const toSprint = sprintByNumber.get(phase.sprints[1])
    return { start: fromSprint?.start ?? project.start_date, end: toSprint?.end ?? project.end_date }
  }

  const definition: ProjectDefinition = {
    name: project.name,
    description: project.description,
    startDate: project.start_date,
    deadline: project.end_date,
    milestones: raw.milestones.filter((m) => m.kind !== 'report').map((m) => ({ name: m.name, date: m.date })),
    features: [],
    tiers: tiers.length > 0 ? tiers.map((t) => ({ id: t.id, name: t.name, description: t.description })) : undefined,
    owners: owners.length > 0 ? owners : undefined,
    reportingCadence: project.reporting_cadence,
    sprintDays: project.sprint_days,
  }

  const timeline: Timeline = {
    projectName: project.name,
    startDate: project.start_date,
    endDate: project.end_date,
    deadline: project.end_date,
    feasible: true,
    conflicts: [],
    criticalPath: [],
    tasks: raw.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      phase: raw.phases.find((p) => p.id === task.phase)?.name ?? task.phase,
      dependsOn: task.dependencies,
      effortDays: Math.max(1, workdayCountInclusive(parseDate(task.start), parseDate(task.end))),
      agents: 1,
      start: task.start,
      end: task.end,
      status: 'planned',
      critical: false,
      tier: task.tier,
      owner: task.owner,
    })),
    phases: raw.phases.map((phase) => {
      const dates = phaseDates(phase.id)
      return { name: phase.name, start: dates.start, end: dates.end }
    }),
    milestones: raw.milestones.map((m) => ({ name: m.name, date: m.date })),
    hoursPerDay: 8,
  }

  return { definition, timeline, updatedAt: raw._dsh?.updatedAt ?? new Date().toISOString() }
}

/** Whether a parsed JSON value looks like a journey project-plan document. */
export function isJourneyDocument(raw: unknown): raw is JourneyDocument {
  if (typeof raw !== 'object' || raw === null) return false
  const record = raw as Record<string, unknown>
  return typeof record.project === 'object' && record.project !== null && Array.isArray(record.tasks)
}
