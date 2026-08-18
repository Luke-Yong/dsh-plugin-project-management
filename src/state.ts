import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildProjectData, fromJourneyDocument, isJourneyDocument } from './project-plan.js'
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
      return {
        definition: raw._dsh.definition,
        timeline: raw._dsh.timeline,
        updatedAt: raw._dsh.updatedAt,
      }
    }
    return fromJourneyDocument(raw)
  }
  return raw as ProjectState
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
