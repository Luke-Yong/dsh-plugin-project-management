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

export interface Milestone {
  name: string
  /** ISO date (YYYY-MM-DD). */
  date?: string
  note?: string
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

/** Output of pm.timeline.generate / pm.timeline.update. */
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
