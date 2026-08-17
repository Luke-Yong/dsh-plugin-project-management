import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { buildDocx, buildXlsx, slugify } from './export.js'
import { schedule, type TaskInput } from './scheduler.js'
import type { ProjectDefinition, Timeline } from './types.js'

// ---------------------------------------------------------------------------
// Schema DSL constants (required: true keeps literal typing for arg inference)
// ---------------------------------------------------------------------------

const featureSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true, description: 'Short feature id, e.g. auth' },
    title: { type: 'string', required: true, description: 'Feature title' },
    description: { type: 'string' },
    priority: { type: 'string', enum: ['must', 'should', 'could', 'wont'] as const, required: true },
    phase: { type: 'string', description: 'Optional phase the feature belongs to' },
    effortDays: { type: 'number', description: 'Rough effort in workdays' },
    dependsOn: { type: 'array', items: { type: 'string' }, description: 'Feature ids this feature depends on' },
  },
} as const

const definitionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', required: true, description: 'Project name' },
    description: { type: 'string' },
    startDate: { type: 'string', description: 'Planned start (YYYY-MM-DD)' },
    deadline: { type: 'string', description: 'Hard deadline (YYYY-MM-DD)' },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          date: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    budgetModel: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['hours', 'cost', 'agents', 'custom'] as const, required: true },
        description: { type: 'string' },
        allocations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              period: { type: 'string', required: true },
              amount: { type: 'number', required: true },
              note: { type: 'string' },
            },
          },
        },
      },
    },
    features: {
      type: 'array',
      items: featureSchema,
      required: true,
      description: 'Features gathered during the interview',
    },
    constraints: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
} as const

const taskSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    phase: { type: 'string', required: true },
    dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task ids that must finish first' },
    effortDays: { type: 'number', required: true, description: 'Effort in workdays' },
    agents: { type: 'integer', description: 'Parallel agents assigned (default 1)' },
    pinnedStart: { type: 'string', description: 'Manual start override (YYYY-MM-DD)' },
    pinnedEnd: { type: 'string', description: 'Manual end override (YYYY-MM-DD)' },
  },
} as const

const patchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true, description: 'Task id to patch' },
    name: { type: 'string' },
    phase: { type: 'string' },
    dependsOn: { type: 'array', items: { type: 'string' } },
    effortDays: { type: 'number' },
    agents: { type: 'integer' },
    pinnedStart: { type: 'string' },
    pinnedEnd: { type: 'string' },
    clearPins: { type: 'boolean', description: 'Remove manual date pins so the task is re-scheduled' },
  },
} as const

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderTimeline(timeline: Timeline): string {
  const lines = [
    `Timeline generated for "${timeline.projectName}".`,
    `Span: ${timeline.startDate} → ${timeline.endDate} (${timeline.tasks.length} tasks, ${timeline.phases.length} phases).`,
    `Feasible: ${timeline.feasible ? 'yes' : 'no'}.`,
  ]
  for (const conflict of timeline.conflicts) lines.push(`Conflict: ${conflict}`)
  if (timeline.criticalPath.length > 0) {
    lines.push(`Critical path: ${timeline.criticalPath.join(' → ')}`)
  }
  lines.push('')
  lines.push('Canonical timeline JSON (pass this to pm.timeline.update / pm.timeline.export):')
  lines.push(JSON.stringify(timeline, null, 2))
  return lines.join('\n')
}

function normalizeDefinition(raw: ProjectDefinition): { definition: ProjectDefinition; issues: string[] } {
  const issues: string[] = []
  const definition: ProjectDefinition = {
    ...raw,
    features: (raw.features ?? []).map((f) => ({ ...f, dependsOn: f.dependsOn ?? [] })),
    milestones: raw.milestones?.map((m) => ({ ...m })) ?? [],
    budgetModel: raw.budgetModel
      ? { ...raw.budgetModel, allocations: raw.budgetModel.allocations?.map((a) => ({ ...a })) ?? [] }
      : undefined,
    constraints: raw.constraints ?? [],
  }

  if (!definition.name || definition.name.trim() === '') issues.push('Missing project name.')
  if (definition.features.length === 0) issues.push('No features defined yet — run the project interview first.')
  if (!definition.startDate) issues.push('No start date — scheduling will default to today.')
  if (!definition.deadline) issues.push('No deadline — feasibility cannot be checked against one.')
  if (definition.startDate && definition.deadline && definition.startDate > definition.deadline) {
    issues.push('startDate is after deadline.')
  }

  const seen = new Set<string>()
  for (const feature of definition.features) {
    if (seen.has(feature.id)) issues.push(`Duplicate feature id "${feature.id}".`)
    seen.add(feature.id)
    for (const dep of feature.dependsOn ?? []) {
      if (!seen.has(dep) && !definition.features.some((f) => f.id === dep)) {
        issues.push(`Feature "${feature.id}" depends on unknown feature "${dep}".`)
      }
    }
  }
  return { definition, issues }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** pm.project.define — validate/normalize the interview result into a canonical definition. */
export const defineProjectTool = defineTool({
  name: 'pm.project.define',
  description:
    'Validate and normalize a project definition produced by the interview. Returns the canonical definition plus a list of issues (missing fields, bad dates, unknown dependencies). Call this once the interview has gathered features, timeline and budget.',
  parameters: {
    definition: { ...definitionSchema, required: true },
  },
  output: {
    schema: { type: 'json' },
    render: (_args, value) => {
      const { definition, issues } = value as unknown as { definition: ProjectDefinition; issues: string[] }
      const lines = [
        `Definition accepted for "${definition.name}".`,
        `${definition.features.length} feature(s), ${definition.milestones?.length ?? 0} milestone(s).`,
      ]
      for (const issue of issues) lines.push(`Issue: ${issue}`)
      lines.push('')
      lines.push('Canonical definition JSON:')
      lines.push(JSON.stringify(definition, null, 2))
      return [{ type: 'text', text: lines.join('\n') }]
    },
  },
  isConcurrencySafe: () => true,
  async execute(args) {
    return normalizeDefinition(args.definition as ProjectDefinition) as unknown as JsonValue
  },
})

/** pm.timeline.generate — deterministic scheduling of a task breakdown against a definition. */
export const generateTimelineTool = defineTool({
  name: 'pm.timeline.generate',
  description:
    'Schedule tasks into a workday-aware timeline. The agent decomposes features into tasks; this tool computes dates from dependencies and effort, detects the critical path, and reports feasibility conflicts against the deadline and agent budget.',
  parameters: {
    definition: definitionSchema,
    tasks: { type: 'array', items: taskSchema, required: true, description: 'Task breakdown to schedule' },
    hoursPerDay: { type: 'integer', description: 'Agent-hours per workday used for budget checks (default 8)' },
  },
  output: {
    schema: { type: 'json' },
    render: (_args, value) => [{ type: 'text', text: renderTimeline(value as unknown as Timeline) }],
  },
  isConcurrencySafe: () => true,
 async execute(args) {
    const timeline = schedule(
      args.definition as ProjectDefinition,
      args.tasks as TaskInput[],
      args.hoursPerDay ?? 8,
    )
    return { timeline } as unknown as JsonValue
  },
})

/** pm.timeline.update — apply patches to a timeline and re-schedule. */
export const updateTimelineTool = defineTool({
  name: 'pm.timeline.update',
  description:
    'Apply patches (renames, dependency changes, effort/agent changes, manual date pins) to a timeline and re-run the scheduler. Returns the updated timeline. Use it to review and adjust a generated timeline with the user.',
  parameters: {
    timeline: { type: 'json', required: true, description: 'The current timeline JSON from pm.timeline.generate' },
    patches: { type: 'array', items: patchSchema, required: true, description: 'Task patches to apply' },
    definition: { type: 'json', description: 'Optional project definition, to keep deadline/budget feasibility checks' },
  },
  output: {
    schema: { type: 'json' },
    render: (_args, value) => {
      const { timeline, skippedIds } = value as unknown as { timeline: Timeline; skippedIds: string[] }
      const text = renderTimeline(timeline)
      const skipped = skippedIds.length > 0 ? `\nSkipped unknown task ids: ${skippedIds.join(', ')}` : ''
      return [{ type: 'text', text: `${text}${skipped}` }]
    },
  },
  isConcurrencySafe: () => true,
  async execute(args) {
    const timeline = args.timeline as unknown as Timeline
    const definition = args.definition as unknown as ProjectDefinition | undefined
    const skippedIds: string[] = []

    const inputs: TaskInput[] = timeline.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      phase: t.phase,
      dependsOn: t.dependsOn,
      effortDays: t.effortDays,
      agents: t.agents,
      pinnedStart: t.pinned ? t.start : undefined,
      pinnedEnd: t.pinned ? t.end : undefined,
    }))
    const byId = new Map(inputs.map((t) => [t.id, t]))

    for (const patch of args.patches) {
      const input = byId.get(patch.id)
      if (!input) {
        skippedIds.push(patch.id)
        continue
      }
      if (patch.name !== undefined) input.name = patch.name
      if (patch.phase !== undefined) input.phase = patch.phase
      if (patch.dependsOn !== undefined) input.dependsOn = patch.dependsOn
      if (patch.effortDays !== undefined) input.effortDays = patch.effortDays
      if (patch.agents !== undefined) input.agents = patch.agents
      if (patch.clearPins) {
        input.pinnedStart = undefined
        input.pinnedEnd = undefined
      }
      if (patch.pinnedStart !== undefined) input.pinnedStart = patch.pinnedStart
      if (patch.pinnedEnd !== undefined) input.pinnedEnd = patch.pinnedEnd
    }

    const scheduled = schedule(
      {
        name: timeline.projectName,
        startDate: timeline.startDate,
        deadline: timeline.deadline,
        milestones: definition?.milestones,
        budgetModel: definition?.budgetModel,
        features: definition?.features ?? [],
      },
      inputs,
      timeline.hoursPerDay,
    )
    return { timeline: scheduled, skippedIds } as unknown as JsonValue
  },
})

/** pm.timeline.export — write the timeline as a Word or Excel file. */
export const exportTimelineTool = defineTool({
  name: 'pm.timeline.export',
  description:
    'Export a timeline to a Word document (.docx: summary, task schedule, milestones, budget) or an Excel workbook (.xlsx: Summary, Tasks, and a colored Gantt sheet). Writes the file and returns its path.',
  parameters: {
    format: { type: 'string', enum: ['docx', 'xlsx'] as const, required: true, description: 'Export format' },
    definition: { type: 'json', required: true, description: 'The project definition' },
    timeline: { type: 'json', required: true, description: 'The timeline to export' },
    path: {
      type: 'string',
      description: 'Output path (absolute, or relative to the harness cwd). Defaults to ./<project-slug>.<ext>',
    },
  },
  output: {
    schema: { type: 'json' },
    render: (_args, value) => {
      const result = value as unknown as { path: string; format: string; sizeBytes: number }
      return [{
        type: 'text',
        text: `Exported ${result.format.toUpperCase()} timeline to ${result.path} (${result.sizeBytes} bytes).`,
      }]
    },
  },
  async execute(args) {
    const definition = args.definition as unknown as ProjectDefinition
    const timeline = args.timeline as unknown as Timeline
    const buffer = args.format === 'docx'
      ? await buildDocx(definition, timeline)
      : await buildXlsx(definition, timeline)
    const filename = args.path ?? `${slugify(timeline.projectName)}.${args.format}`
    const target = isAbsolute(filename) ? filename : resolve(process.cwd(), filename)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, buffer)
    return { path: target, format: args.format, sizeBytes: buffer.length }
  },
})
