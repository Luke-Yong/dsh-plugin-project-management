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

The `prepare` script builds both halves automatically, so GitHub installs
(`npm install github:<user>/dsh-plugin-project-management`) work without
committing `dist/`/`lib/` (they are gitignored). `./package.json` is exported
for tooling that needs the `dsh.client` manifest.

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

The plugin ships a browser half that adds a **Project** tab to the
conversation header's view tabs (the `conversation.view` slot — the same
mechanism ui-trajectory uses). Selecting it shows the project management pane:

- project name, description, and last-updated time;
- timeline span, task count, and feasibility;
- phases, critical path, milestones, and open conflicts;
- the agent budget model.

The pane reads the saved project state for the current session from
`/plugins/project-management/state` (server resolves the session cwd and reads
`.dsh-pm/project.json`). No harness patch is required — the tab works with the
stock web app.

## Flow

1. The agent interviews you (features, deadline, milestones, agent budget per
   duration).
2. It calls `pm.project.define` to lock in and persist the definition.
3. It decomposes features into tasks and calls `pm.timeline.generate`.
4. It reviews feasibility with you and adjusts via `pm.timeline.update`.
5. It exports with `pm.timeline.export` (`format: docx | xlsx`).

## Persistence & session resume

- The definition and timeline are saved to `<workspace>/data/project_management/project_data.json`
  in the project-plan schema used by `templates/gantt.html` (project, tiers,
  phases, tasks, milestones, sprints — plus a `_dsh` block for plugin
  round-trip state). Layout follows the Project-Journey Planner example:
   `data/project_management/project_data.json` consumed by `templates/gantt.html`.
- On a new session in the same workspace, the plugin injects a reminder into
  the model context when a timeline exists, telling the agent about the saved
  plan and its conflicts; the agent then calls `pm.project.load` to continue.
- Writes are atomic (temp file + rename). A legacy `.dsh-pm/project.json` is
  read as a fallback for backward compatibility.

## Notes / MVP limitations

- A single project per workspace.
- Weekends (Sat/Sun) are skipped; a future version can expose a configurable
  workweek and holidays.

## Roadmap

- Custom Web UI Gantt view via `presentCall` / `presentResult`.
- Multi-project and live agent-budget tracking.
