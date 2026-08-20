import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildProjectData, fromJourneyDocument, isJourneyDocument, type JourneyDocument } from './project-plan.js'
import type { ProjectDefinition, Timeline } from './types.js'

/**
 * Durable per-workspace project record stored at
 * `<workspace>/data/project_management/project_data.json` — the project-plan
 * document schema consumed by `templates/gantt.html` (via `/api/project-plan`),
 * with the plugin's round-trip state embedded under `_dsh`.
 */
export interface ProjectState {
  definition: ProjectDefinition
  timeline?: Timeline
  updatedAt: string
}

/** Absolute path of the project data file for a workspace directory. */
export function projectStatePath(cwd: string): string {
  return join(cwd, 'data', 'project_management', 'project_data.json')
}

function parseState(raw: unknown): ProjectState | undefined {
  if (isJourneyDocument(raw)) {
    if (raw._dsh !== undefined) {
      const state: ProjectState = {
        definition: raw._dsh.definition,
        timeline: raw._dsh.timeline,
        updatedAt: raw._dsh.updatedAt,
      }
      // The journey document's top-level tasks are the shared data file a
      // user may hand-edit. Merge their progress into the plugin state so
      // manual updates show up in the UI and survive the next save.
      return mergeJourneyProgress(state, raw)
    }
    return fromJourneyDocument(raw)
  }
  return raw as ProjectState
}

/**
 * Copy `progress` from the journey document's top-level tasks into the
 * `_dsh` timeline (matched by task id). Values outside 0-100 are clamped.
 */
function mergeJourneyProgress(state: ProjectState, raw: JourneyDocument): ProjectState {
  if (state.timeline === undefined || raw.tasks === undefined) return state
  const progressById = new Map<string, number>()
  for (const task of raw.tasks) {
    if (typeof task.progress === 'number' && Number.isFinite(task.progress)) {
      progressById.set(task.id, Math.min(100, Math.max(0, task.progress)))
    }
  }
  if (progressById.size === 0) return state
  const tasks = state.timeline.tasks.map((task) => {
    const progress = progressById.get(task.id)
    return progress !== undefined && progress !== task.progress ? { ...task, progress } : task
  })
  return { ...state, timeline: { ...state.timeline, tasks } }
}

async function readStateFile(path: string): Promise<ProjectState | undefined> {
  try {
    const text = await readFile(path, 'utf8')
    return parseState(JSON.parse(text))
  } catch {
    return undefined
  }
}

function readStateFileSync(path: string): ProjectState | undefined {
  try {
    const text = readFileSync(path, 'utf8')
    return parseState(JSON.parse(text))
  } catch {
    return undefined
  }
}

/** Read the project data file, or `undefined` when absent or malformed. */
export async function loadProject(cwd: string): Promise<ProjectState | undefined> {
  const state = await readStateFile(projectStatePath(cwd))
  if (state !== undefined) return state
  // Legacy fallback: the earlier `.dsh-pm/project.json` location.
  return readStateFile(join(cwd, '.dsh-pm', 'project.json'))
}

/** Synchronous variant used by prompt providers (small file, best-effort). */
export function loadProjectSync(cwd: string): ProjectState | undefined {
  const state = readStateFileSync(projectStatePath(cwd))
  if (state !== undefined) return state
  return readStateFileSync(join(cwd, '.dsh-pm', 'project.json'))
}

/** Write the project-plan document atomically; returns the absolute path. */
export async function saveProject(cwd: string, state: ProjectState): Promise<string> {
  const path = projectStatePath(cwd)
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  const document = buildProjectData(state.definition, state.timeline, state.updatedAt)
  await writeFile(tmp, JSON.stringify(document, null, 2), 'utf8')
  await rename(tmp, path)
  return path
}
