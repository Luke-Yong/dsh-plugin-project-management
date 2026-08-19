/** Project feature gathered during the interview. */
export interface Feature {
  id: string
  title: string
  description?: string
  /** MoSCoW priority. */
  priority: 'must' | 'should' | 'could' | 'wont'
  /** Optional phase the feature belongs to. */
  phase?: string
  /** Rough effort estimate in workdays (optional hint). */
  effortDays?: number
  /** Features this feature depends on. */
  dependsOn?: string[]
}

/** One line of an agent budget expressed per duration (decided during the interview). */
export interface BudgetAllocation {
  /** The duration, e.g. "week", "month", "build phase". */
  period: string
  amount: number
  note?: string
}

/** How the user expresses agent budget per duration. */
export interface BudgetModel {
  kind: 'hours' | 'cost' | 'agents' | 'custom'
  description?: string
  allocations?: BudgetAllocation[]
}

/** One access tier in the project-plan document (e.g. public / manager / admin). */
export interface ProjectTier {
  id: string
  name: string
  description?: string
}

export interface Milestone {
  name: string
  /** ISO date (YYYY-MM-DD). */
  date?: string
  note?: string
}

/**
 * Workday calendar options. `country` enables public-holiday lookup via the
 * rules-based `date-holidays` package; `holidays` adds project-specific days
 * off on top of it.
 */
export interface ProjectCalendar {
  /** ISO 3166-1 alpha-2 country code, e.g. "SG". */
  country?: string
  /** Extra holiday dates (YYYY-MM-DD) merged into the country calendar. */
  holidays?: string[]
}

/** Canonical project definition produced by the interview. */
export interface ProjectDefinition {
  name: string
  description?: string
  /** ISO date (YYYY-MM-DD). */
  startDate?: string
  /** ISO date (YYYY-MM-DD). */
  deadline?: string
  milestones?: Milestone[]
  budgetModel?: BudgetModel
  features: Feature[]
  constraints?: string[]
  notes?: string
  /** Access tiers for the project-plan document (default: single "Team"). */
  tiers?: ProjectTier[]
  /** Task owners (default: "Team"). */
  owners?: string[]
  /** Reporting cadence for the project-plan document (default "bi-weekly"). */
  reportingCadence?: string
  /** Sprint length in days (default 14). */
  sprintDays?: number
  /** Workday calendar: country for public holidays + extra days off. */
  calendar?: ProjectCalendar
}

/** A scheduled work package inside a timeline. */
export interface TimelineTask {
  id: string
  name: string
  phase: string
  featureId?: string
  dependsOn: string[]
  effortDays: number
  agents: number
  /** ISO date (YYYY-MM-DD), computed by the scheduler. */
  start: string
  /** ISO date (YYYY-MM-DD), computed by the scheduler. */
  end: string
  status: 'planned'
  /** Whether the dates were manually pinned instead of scheduled. */
  pinned?: boolean
  /** Whether the task lies on the critical path. */
  critical: boolean
  /** Optional access tier id for the project-plan document. */
  tier?: string
  /** Optional owner for the project-plan document. */
  owner?: string
}

export interface PhaseWindow {
  name: string
  /** ISO date (YYYY-MM-DD). */
  start: string
  /** ISO date (YYYY-MM-DD). */
  end: string
}

export interface TimelineMilestone {
  name: string
  /** ISO date (YYYY-MM-DD). */
  date: string
}

/** Output of pm_timeline_generate / pm_timeline_update. */
export interface Timeline {
  projectName: string
  /** ISO date (YYYY-MM-DD). */
  startDate: string
  /** ISO date (YYYY-MM-DD). */
  endDate: string
  /** ISO date (YYYY-MM-DD). */
  deadline?: string
  feasible: boolean
  conflicts: string[]
  criticalPath: string[]
  tasks: TimelineTask[]
  phases: PhaseWindow[]
  milestones: TimelineMilestone[]
  hoursPerDay: number
}
