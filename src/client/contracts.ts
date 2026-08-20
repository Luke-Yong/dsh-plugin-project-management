import type { ReactNode } from 'react'

/**
 * Structural contracts for the harness browser surface. Real types come from
 * `@deepseek-ai/dsh-client-ui-slots` / `@deepseek-ai/dsh-client-runtime` inside
 * the harness; these mirror the parts this plugin uses, so the client half
 * typechecks standalone (the ui-conversation chain is not npm-publishable yet).
 */

/** The slot registry (`ctx.slots`). */
export interface SlotsLike {
  /** Register after the target slot is declared; returns a disposer. */
  inject(name: string, registration: () => () => void): () => void
  /** One composition API call: contribute a component into a declared slot. */
  register(input: SlotRegisterInput, component: (props: any) => ReactNode): () => void
}

export interface SlotRegisterInput {
  name: string
  /** Stable entry id (view tabs and list entries are keyed by id). */
  id?: string
  order?: number
  /** Tab label thunk (evaluated per render, so it follows the locale). */
  label?: () => string
  /** Business face: session slots receive the current session id. */
  inject?: (sessionId: string | undefined) => unknown
}

/** Structural view of the client root context. */
export interface ClientContextLike {
  effect(fn: () => void | (() => void), label?: string): void
  slots: SlotsLike
}

/** A scheduled task as delivered on the state wire. */
export interface WireTimelineTask {
  id: string
  name: string
  phase: string
  start: string
  end: string
  critical?: boolean
  owner?: string
  /** Completion percentage (0-100). */
  progress?: number
}

/** A manual timeline adjustment committed from the client surface. */
export interface TaskDateUpdate {
  id: string
  start?: string
  end?: string
  name?: string
  owner?: string
}

/** Wire shape of `GET /plugins/project-management/state`. */
export interface ProjectStateWire {
  definition: {
    name: string
    description?: string
    features?: unknown[]
    budgetModel?: { kind: string } | undefined
  }
  timeline?: {
    startDate: string
    endDate: string
    feasible: boolean
    conflicts: string[]
    criticalPath?: string[]
    tasks: WireTimelineTask[]
    phases?: { name: string; start: string; end: string }[]
    milestones?: { name: string; date: string }[]
  }
  updatedAt: string
}
