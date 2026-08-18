# dsh-plugin-project-management

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
interviews the user about a project, generates a project timeline / Gantt chart,
and exports it as **Word** or **Excel**.

The agent owns the loop: it runs a structured interview (via the
`project-interview` skill), decomposes features into tasks, and uses five tools
to validate, schedule, adjust, persist, and export. The scheduling math is
deterministic. The project (definition + timeline) is persisted to a workspace
project file (`.dsh-pm/project.json`) so it survives across sessions, and the
plugin reminds the agent about an existing timeline on session resume.

## Tools

| Tool | Purpose |
|---|---|
| `pm.project.define` | Validate/normalize the interview result into a canonical `ProjectDefinition` (features, priorities, dates, milestones, agent budget per duration, constraints); persists it |
| `pm.timeline.generate` | Deterministic scheduler: dependency-aware, workday-aware dating, critical path, deadline + budget feasibility checks; persists definition + timeline |
| `pm.timeline.update` | Patch tasks (rename, dependencies, effort, agents, manual date pins), re-schedule, and persist |
| `pm.project.load` | Load the saved project (definition + timeline) from `.dsh-pm/project.json` — use when resuming a session |
| `pm.timeline.export` | Write `.docx` (summary, task schedule, milestones, budget) or `.xlsx` (Summary, Tasks, colored Gantt sheet) |

## Skill

- `project-interview` — the conversational interview protocol: features →
  priorities → timeline/milestones → **agent budget per duration** (hours /
  cost / agents / custom, with a period) → constraints.

## Install

Build the plugin (server + browser bundle), then load it with a Cordis overlay
patch:

```sh
npm install
npm run build       # tsc server → dist/, esbuild client → lib/client.js
```

From a DeepSeek Harness checkout:

```sh
pnpm dsh web --patch /absolute/path/to/dsh-plugin-project-management/cordis.yml
```

The plugin package must be resolvable from the config tree's baseUrl — install
or `pnpm link` it into the harness checkout (it is a dependency of the cordis.yml
package, per the client-modules resolution rule).

Open `http://127.0.0.1:3080` and ask, for example:

> Plan a timeline for my mobile app and export it as both Word and Excel.

## Web UI

The plugin ships a browser half that mounts into the web GUI:

- A **Project** button in the sidebar section header, and
- a **project management pane** inside the composer stack (below the input).

The pane reads the saved project state for the current session from
`/plugins/project-management/state` and shows name, span, feasibility, critical
path, and conflicts; the rail button toggles it.

The rail button needs one small harness patch (the section header is internal
to `ui-workspace`): see [patches/ui-workspace.sidebar-header-actions.md](patches/ui-workspace.sidebar-header-actions.md).
Without the patch, the pane still works (it renders when toggled from any
surface that calls it); the stock harness just has no button wired to it yet.

## Flow

1. The agent interviews you (features, deadline, milestones, agent budget per
   duration).
2. It calls `pm.project.define` to lock in and persist the definition.
3. It decomposes features into tasks and calls `pm.timeline.generate`.
4. It reviews feasibility with you and adjusts via `pm.timeline.update`.
5. It exports with `pm.timeline.export` (`format: docx | xlsx`).

## Persistence & session resume

- The definition and timeline are saved to `<workspace>/.dsh-pm/project.json`
  (the workspace is the session `cwd`).
- On a new session in the same workspace, the plugin injects a reminder into
  the model context when a timeline exists, telling the agent about the saved
  plan and its conflicts; the agent then calls `pm.project.load` to continue.
- Writes are atomic (temp file + rename).

## Notes / MVP limitations

- A single project per workspace.
- Weekends (Sat/Sun) are skipped; a future version can expose a configurable
  workweek and holidays.

## Roadmap

- Custom Web UI Gantt view via `presentCall` / `presentResult`.
- Multi-project and live agent-budget tracking.
