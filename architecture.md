# Architecture

This document describes how `dsh-plugin-project-management` works, how its
pieces fit together, and where it plugs into the DeepSeek Harness.

## Overview

The plugin lets an agent interview the user about a project and produce an
exportable timeline / Gantt chart (Word + Excel). The agent owns the loop: it
runs the conversation, decomposes features into tasks, and calls four small
tools. The scheduling math is deterministic; the model never computes dates by
hand.

```
┌──────────────────────────────────────────────────────────────┐
│ DeepSeek Harness (Cordis kernel)                              │
│  ctx.tools    ctx.skills        ctx.clientModules (future UI) │
└──────┬────────────┬───────────────────────────▲───────────────┘
       │            │                           │
┌──────▼────────────▼───────────────────────────┴───────────────┐
│ dsh-plugin-project-management                                  │
│  index.ts          → plugin entry (name / inject / apply)      │
│  web.ts            → project-state HTTP route (web pane)       │
│  skills/project-interview.ts → interview protocol (skill)      │
│  tools.ts          → 5 defineTool registrations                │
│  scheduler.ts      → deterministic scheduling engine           │
│  export.ts         → docx / xlsx builders                      │
│  state.ts          → .dsh-pm/project.json persistence          │
│  types.ts          → domain model (definition / timeline)      │
│  date.ts           → workday-aware date math                   │
│  client/           → browser half (rail button + composer pane)│
└────────────────────────────────────────────────────────────────┘
```

## Plugin anatomy

- The plugin is a Cordis plugin: a TS module exporting `name`, `inject`, and
  `apply(ctx)` (see [src/index.ts](src/index.ts)).
- `inject: ['tools']` — Cordis waits for the tool registry before `apply` runs.
- The `skills` service is optional; it is consumed via `ctx.get('skills')` and
  the interview skill is only registered when present.

## Components and responsibilities

| File | Responsibility |
|---|---|
| `src/index.ts` | Registers the five tools, the interview skill, the session-resume reminder, and the web route |
| `src/web.ts` | `GET /plugins/project-management/state` — serves the saved project state to the web pane |
| `src/tools.ts` | `defineTool` declarations: schemas, output renderers, `execute` bodies |
| `src/scheduler.ts` | Pure scheduling: dependencies, workdays, pins, critical path, feasibility |
| `src/export.ts` | Pure builders: Word (`docx`) and Excel (`exceljs`) |
| `src/state.ts` | Workspace persistence: `.dsh-pm/project.json` read/write |
| `src/types.ts` | `ProjectDefinition`, `Timeline`, `BudgetModel`, `Feature`, … |
| `src/date.ts` | ISO date math that skips weekends |
| `src/skills/project-interview.ts` | The `project-interview` skill body (markdown) |
| `src/client/*` | Browser half: rail button, composer pane, slot registration, bundle build |
| `scripts/build-client.mjs` | esbuild bundle in the harness client-module format (`lib/client.js`) |

The scheduler and exporters are **pure functions**; persistence happens in the
tools (`pm.project.define` / `pm.timeline.generate` / `pm.timeline.update`),
which write the workspace project file, and `pm.timeline.export`, which writes
the output file. Everything else has no side effects.

## Tool contracts

All tools use `defineTool` from `@deepseek-ai/dsh-tools`; `output.schema` is
`{ type: 'json' }` (lossless canonical value), and `output.render` converts the
canonical value into model-facing text that includes the full JSON the agent
needs to continue.

| Tool | Inputs | Behavior |
|---|---|---|
| `pm.project.define` | `definition` | Validates/normalizes the interview result into a canonical `ProjectDefinition`; persists it to the workspace; returns `{ definition, issues, statePath }` |
| `pm.timeline.generate` | `definition`, `tasks[]`, `hoursPerDay?` | Schedules the task breakdown; persists definition + timeline; returns `{ timeline, statePath }` |
| `pm.timeline.update` | `timeline`, `patches[]`, `definition?` | Applies patches (rename, deps, effort, agents, manual pins), re-schedules, persists; returns `{ timeline, skippedIds, statePath }` |
| `pm.project.load` | `cwd?` | Loads the saved project state; returns `{ state, loaded }` — the resume entry point |
| `pm.timeline.export` | `format`, `definition`, `timeline`, `path?` | Writes `.docx` or `.xlsx` and returns the absolute output path |

## Data model

### ProjectDefinition (produced by the interview)

```
ProjectDefinition
├── name, description
├── startDate / deadline        (ISO dates, optional)
├── milestones[]                (fixed dates)
├── budgetModel                 (agent budget per duration)
│   ├── kind: hours | cost | agents | custom
│   └── allocations[]: { period, amount, note }
├── features[]                  (id, title, priority, phase, effortDays, dependsOn)
├── constraints[] / notes
```

The budget model is intentionally open: the interview decides how the user
expresses it (hours per week, cost per month, parallel agents per phase, or a
custom unit). The scheduler only interprets it when the unit is unambiguous
(`hours` per `week`).

### Timeline (produced by the scheduler)

```
Timeline
├── startDate / endDate / deadline
├── feasible / conflicts[]      (deadline + budget feasibility)
├── criticalPath[]              (task ids)
├── tasks[]                     (id, phase, deps, effortDays, agents, start, end, critical, pinned)
├── phases[]                    (phase windows)
├── milestones[]                (phase completions + explicit milestones)
└── hoursPerDay
```

## Scheduler algorithm (`src/scheduler.ts`)

1. **Reference checks** — unknown dependency ids are reported as conflicts.
2. **Pins first** — tasks with explicit `pinnedStart`/`pinnedEnd` resolve first
   so dependents can anchor on them.
3. **Topological resolution** — Kahn-style forward pass. A task starts on the
   workday after its latest dependency ends (or at the project start); its end
   is `start + ceil(effortDays / agents) - 1` workdays. Unresolvable tasks are
   dependency cycles and become conflicts.
4. **Critical path** — backward pass over the resolution order: a follower's
   latest start is its latest end minus its workday duration; a predecessor's
   latest end is the workday before the earliest follower start. Tasks with
   zero slack (`actualEnd == latestEnd`) are critical.
5. **Feasibility** — timeline end after the deadline → conflict. For
   `hours` budgets: per-week effort (`effortHours / spanDays * 7`) is compared
   against the weekly allocation; non-week periods fall back to a total check.

Weekends (Sat/Sun) are skipped everywhere; the workweek is not yet configurable.

## Export pipeline (`src/export.ts`)

Both builders consume the same `definition` + `timeline`:

- **Word** (`docx`): title + summary, constraints, task schedule table
  (ID / phase / task / deps / effort / agents / start / end / critical),
  milestones table, and an agent-budget section.
- **Excel** (`exceljs`): a `Summary` sheet (key-value + conflicts), a `Tasks`
  sheet (same columns as Word), and a `Gantt` sheet — one column per workday,
  one row per task, with phase-colored bar cells and gold milestone markers.

`pm.timeline.export` resolves relative paths against the harness process cwd
(`process.cwd()`) and writes the file with `node:fs/promises`.

## Interview flow (agent-owned)

The `project-interview` skill gives the agent the protocol — one question at a
time: features → priorities → timeline/milestones → **agent budget per
duration** → constraints. When the definition is complete the agent calls
`pm.project.define`, decomposes features into tasks, calls
`pm.timeline.generate`, reviews feasibility with the user, adjusts via
`pm.timeline.update`, then exports via `pm.timeline.export`.

## Storage model

**The timeline is stored in a workspace project file: `<cwd>/.dsh-pm/project.json`.**

- The workspace directory is resolved from the executing agent's session
  (`agent.session.header.cwd`, set when the session was created), falling back
  to `process.cwd()` for headless/direct calls.
- `pm.project.define` writes the definition; `pm.timeline.generate` and
  `pm.timeline.update` write the definition + timeline. Writes are atomic
  (write-to-temp then rename).
- The file survives across sessions: a new session in the same workspace can
  call `pm.project.load` to pull the definition and timeline back into the
  conversation.
- The harness session log remains the record of *what the model did* (every
  tool call, argument, and result); the project file is the record of *what the
  project is* (the current canonical state). They complement each other.

## Session resume reminder

`src/index.ts` registers a dynamic prompt context
(`ctx.systemPrompt.context`, name `project-management-timeline`) if the
system-prompt service is available. On every prompt assembly it resolves the
session `cwd`, reads `.dsh-pm/project.json` (synchronously, best-effort), and
if a **timeline exists** it injects a short user-role reminder:

- project name, span, task count, and feasibility;
- each open conflict;
- an instruction to advise the user about conflicts (reduce scope / add agents
  / extend the deadline);
- a pointer to `pm.project.load` to continue the saved plan.

If no timeline exists (or no cwd is available) the provider returns empty text
and nothing is injected. Because the harness materializes prompt contexts as
durable snapshots only when they change, the reminder is not re-injected on
every turn.

## Web UI (browser half)

The plugin ships a **client module** that mounts into the harness web GUI
through the slot system (declared `dsh.client` in `package.json`, bundle at
`exports["./client"]`):

- **Rail button** → `sidebar.workspaces.header.actions` (root-scoped list
  slot). The slot is declared by the ui-workspace harness patch (see
  `patches/ui-workspace.sidebar-header-actions.md` — the section header is
  internal to `WorkspaceBrowser`, so it has no public slot yet).
- **Project management pane** → `conversation.input.dock` (order 10, between
  the todo strip at 0 and the queue at 20), rendered inside the composer
  stack. The button and the pane share a tiny module store, so the button
  toggles the pane.
- **Data** → the pane fetches `GET /plugins/project-management/state?session=…`
  (registered by `src/web.ts` on `ctx.webServer`); the server resolves the
  session cwd via `ctx.sessions` and reads `.dsh-pm/project.json`.

The bundle is built by `scripts/build-client.mjs` (esbuild) into the harness
client-module format: a closure factory registered through
`window.__ModuleLoader__.load({ id, factory })`, with platform modules
(`react`, `@deepseek-ai/dsh-client-ui-slots`, …) left external to the loader's
module table. The client code is structurally typed — the ui-conversation
client packages are not npm-publishable yet, so their real types can't be
installed standalone.

Two further UI surfaces remain available for a richer Gantt later:

- **Tool-result presenters** (`presentCall` / `presentResult`) render inline
  cards in the agent console/trajectory; presenters must be pure and derived
  from the canonical value.
- **`conversation.view`** adds a full conversation view tab (e.g. a
  drag-to-reschedule Gantt).

## Known limitations / roadmap

- The rail button requires the ui-workspace harness patch (patches/); the pane
  and data route work with the stock harness.
- A single project per workspace (one `.dsh-pm/project.json`).
- Weekend-only workweek; no holidays or configurable calendar.
- The pane is a read-only summary dock (no drag-to-reschedule yet).
- Multi-project and live agent-budget tracking are out of scope for the MVP.
