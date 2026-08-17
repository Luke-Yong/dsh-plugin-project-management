/** Registration shape accepted by the optional `skills` service (`ctx.get('skills').register`). */
export interface SkillRegistrationLike {
  name: string
  description: string
  whenToUse?: string
  content: string
}

const content = `# Project Interview

Run a conversational interview to define a project before building its timeline.
Capture the answers in a structured \`ProjectDefinition\` and drive the timeline
tools. Ask ONE question at a time, confirm each answer, and keep it conversational
— do not interrogate.

## When to use
- The user asks for a project timeline, Gantt chart, or schedule and the project is not yet defined.
- The user wants to explore scope, timeline, or agent-budget trade-offs before committing.

## Protocol

### 1. Features
- What must the project deliver? For each feature capture:
  - a short \`title\`
  - an optional \`description\`
  - priority: \`must\` | \`should\` | \`could\` | \`wont\` (MoSCoW)
  - a rough \`effortDays\` hint in workdays — only when the user can estimate
  - any other feature it \`dependsOn\` (by feature id)
- Give every feature a short lowercase \`id\` (e.g. \`auth\`, \`billing\`).
- Group features into \`phase\`s when the user suggests them (e.g. "foundation", "core", "polish").

### 2. Timeline
- Desired \`startDate\` (ISO YYYY-MM-DD) or "as soon as possible".
- Any hard \`deadline\`.
- Fixed \`milestones\` (demo day, launch, sign-off) with dates.

### 3. Agent budget per duration
Ask how the user wants to express agent budget per duration. Offer examples:
- \`hours\`: "about 40 agent-hours per week"
- \`cost\`: "up to $X per month"
- \`agents\`: "2 parallel agents during the build phase"
- \`custom\`: any other unit they prefer
Record BOTH the unit and the period (per week / per month / per phase) in
\`budgetModel.allocations\` ({ "period": "week", "amount": 40 }).

### 4. Constraints & risks
Teams, approvals, holidays, dependencies on other projects — anything that
changes dates or effort. Record in \`constraints\`.

## Finish
When the definition is complete, call \`pm.project.define\` with the full definition:

\`\`\`json
{
  "name": "My Project",
  "description": "One paragraph.",
  "startDate": "2026-09-01",
  "deadline": "2026-12-15",
  "milestones": [{ "name": "Launch", "date": "2026-12-15" }],
  "budgetModel": {
    "kind": "hours",
    "allocations": [{ "period": "week", "amount": 40 }]
  },
  "features": [
    { "id": "auth", "title": "User login", "priority": "must", "phase": "foundation", "effortDays": 3 }
  ],
  "constraints": ["Single reviewer for UI changes"]
}
\`\`\`

Then:
1. Decompose features into \`tasks\` — each with \`id\`, \`name\`, \`phase\`, optional
   \`dependsOn\` (task ids), \`effortDays\`, and optional \`agents\` (parallelism).
2. Call \`pm.timeline.generate\` with the definition and tasks.
3. Review the returned timeline. If \`feasible\` is false or conflicts exist, discuss
   trade-offs with the user (reduce scope, add agents, extend deadline) and adjust.
4. Apply adjustments with \`pm.timeline.update\`, then export with \`pm.timeline.export\`
   (\`format\`: \`docx\` or \`xlsx\`).`

/** The project-interview skill contributed by this plugin. */
export const PROJECT_INTERVIEW_SKILL: SkillRegistrationLike = {
  name: 'project-interview',
  description:
    'Run a structured interview to define a project (features, timeline, agent budget) before generating a Gantt timeline.',
  whenToUse: 'Use when the user wants a project timeline or Gantt chart and the project is not yet defined.',
  content,
}
