import { Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import ExcelJS from 'exceljs'
import { listWorkdays, parseDate, toIso } from './date.js'
import type { ProjectDefinition, Timeline } from './types.js'

/** Lowercase, dash-separated file stem from a project name. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

const PHASE_COLORS: string[] = [
  'FF4F81BD', // blue
  'FF70AD47', // green
  'FFFFC000', // amber
  'FF9E480E', // orange
  'FF7030A0', // purple
  'FF00A0C0', // teal
  'FFC0504D', // red
  'FF7F7F7F', // grey
]

function phaseColor(index: number): string {
  return PHASE_COLORS[index % PHASE_COLORS.length]!
}

// ---------------------------------------------------------------------------
// Word export
// ---------------------------------------------------------------------------

function textParagraph(text: string, opts: { bold?: boolean } = {}): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] })
}

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: 'E7E6E6' },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  })
}

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph(text)] })
}

/** Build a Word document: project summary, task schedule, milestones, budget. */
export async function buildDocx(definition: ProjectDefinition, timeline: Timeline): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []

  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(timeline.projectName)] }))
  if (definition.description) children.push(textParagraph(definition.description))

  children.push(textParagraph(`Timeline: ${timeline.startDate} → ${timeline.endDate}`, { bold: true }))
  children.push(textParagraph(`Feasible: ${timeline.feasible ? 'yes' : 'no'}`))
  if (timeline.deadline) children.push(textParagraph(`Deadline: ${timeline.deadline}`))
  if (timeline.criticalPath.length > 0) {
    children.push(textParagraph(`Critical path: ${timeline.criticalPath.join(' → ')}`))
  }
  for (const conflict of timeline.conflicts) {
    children.push(textParagraph(`• ${conflict}`))
  }
  if ((definition.constraints ?? []).length > 0) {
    children.push(textParagraph('Constraints:', { bold: true }))
    for (const constraint of definition.constraints!) children.push(textParagraph(`• ${constraint}`))
  }
  children.push(new Paragraph(''))

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Task Schedule')] }))
  const taskRows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('ID'),
        headerCell('Phase'),
        headerCell('Task'),
        headerCell('Depends On'),
        headerCell('Effort (d)'),
        headerCell('Agents'),
        headerCell('Start'),
        headerCell('End'),
        headerCell('Critical'),
      ],
    }),
  ]
  for (const task of timeline.tasks) {
    taskRows.push(
      new TableRow({
        children: [
          cell(task.id),
          cell(task.phase),
          cell(task.name),
          cell(task.dependsOn.join(', ')),
          cell(String(task.effortDays)),
          cell(String(task.agents)),
          cell(task.start),
          cell(task.end),
          cell(task.critical ? '✓' : ''),
        ],
      }),
    )
  }
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: taskRows }))
  children.push(new Paragraph(''))

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Milestones')] }))
  const milestoneRows: TableRow[] = [new TableRow({ children: [headerCell('Milestone'), headerCell('Date')] })]
  for (const milestone of timeline.milestones) {
    milestoneRows.push(new TableRow({ children: [cell(milestone.name), cell(milestone.date)] }))
  }
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: milestoneRows }))

  if (definition.budgetModel) {
    children.push(new Paragraph(''))
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Agent Budget')] }))
    children.push(textParagraph(`Kind: ${definition.budgetModel.kind}`))
    if (definition.budgetModel.description) children.push(textParagraph(definition.budgetModel.description))
    for (const allocation of definition.budgetModel.allocations ?? []) {
      children.push(textParagraph(`• ${allocation.amount} per ${allocation.period}${allocation.note ? ` — ${allocation.note}` : ''}`))
    }
  }

  const doc = new Document({
    sections: [{ children }],
  })
  return Packer.toBuffer(doc)
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

/** Build an Excel workbook: Summary, Tasks, and a Gantt sheet with colored bars. */
export async function buildXlsx(definition: ProjectDefinition, timeline: Timeline): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  // --- Summary -------------------------------------------------------------
  const summary = workbook.addWorksheet('Summary')
  const summaryRows: [string, string][] = [
    ['Project', timeline.projectName],
    ['Timeline', `${timeline.startDate} → ${timeline.endDate}`],
    ['Feasible', timeline.feasible ? 'yes' : 'no'],
  ]
  if (timeline.deadline) summaryRows.push(['Deadline', timeline.deadline])
  if (timeline.criticalPath.length > 0) summaryRows.push(['Critical path', timeline.criticalPath.join(' → ')])
  for (const conflict of timeline.conflicts) summaryRows.push(['Conflict', conflict])
  summaryRows.push(['Phases', timeline.phases.map((p) => `${p.name} (${p.start}→${p.end})`).join('\n')])
  if (definition.budgetModel) {
    summaryRows.push(['Budget kind', definition.budgetModel.kind])
    summaryRows.push([
      'Budget',
      (definition.budgetModel.allocations ?? [])
        .map((a) => `${a.amount} per ${a.period}${a.note ? ` — ${a.note}` : ''}`)
        .join('\n'),
    ])
  }
  summaryRows.push(['Milestones', timeline.milestones.map((m) => `${m.date} ${m.name}`).join('\n')])
  summaryRows.forEach(([label, value], index) => {
    const labelCell = summary.getCell(`A${index + 1}`)
    labelCell.value = label
    labelCell.font = { bold: true }
    const valueCell = summary.getCell(`B${index + 1}`)
    valueCell.value = value
    valueCell.alignment = { wrapText: true }
  })
  summary.getColumn(1).width = 18
  summary.getColumn(2).width = 80

  // --- Tasks ---------------------------------------------------------------
  const tasks = workbook.addWorksheet('Tasks')
  tasks.columns = [
    { header: 'ID', key: 'id', width: 12 },
    { header: 'Phase', key: 'phase', width: 16 },
    { header: 'Task', key: 'name', width: 36 },
    { header: 'Depends On', key: 'dependsOn', width: 16 },
    { header: 'Effort (d)', key: 'effortDays', width: 10 },
    { header: 'Agents', key: 'agents', width: 8 },
    { header: 'Start', key: 'start', width: 12 },
    { header: 'End', key: 'end', width: 12 },
    { header: 'Critical', key: 'critical', width: 9 },
  ]
  for (const task of timeline.tasks) {
    tasks.addRow({
      id: task.id,
      phase: task.phase,
      name: task.name,
      dependsOn: task.dependsOn.join(', '),
      effortDays: task.effortDays,
      agents: task.agents,
      start: task.start,
      end: task.end,
      critical: task.critical ? '✓' : '',
    })
  }
  tasks.getRow(1).font = { bold: true }
  tasks.views = [{ state: 'frozen', ySplit: 1 }]

  // --- Gantt ---------------------------------------------------------------
  const gantt = workbook.addWorksheet('Gantt')
  const dateColumns = listWorkdays(parseDate(timeline.startDate), parseDate(timeline.endDate))
  gantt.getCell('A1').value = 'Task'
  gantt.getCell('A1').font = { bold: true }
  dateColumns.forEach((iso, i) => {
    const cellRef = gantt.getCell(1, i + 2)
    cellRef.value = toIso(parseDate(iso)).slice(5) // MM-DD
    cellRef.font = { bold: true, size: 9 }
  })
  gantt.getColumn(1).width = 40
  for (let i = 0; i < dateColumns.length; i++) {
    gantt.getColumn(i + 2).width = 5
  }

  const phaseIndex = new Map<string, number>()
  timeline.phases.forEach((phase, index) => phaseIndex.set(phase.name, index))

  const dateToCol = new Map<string, number>()
  dateColumns.forEach((iso, i) => dateToCol.set(iso, i + 2))

  timeline.tasks.forEach((task, rowIndex) => {
    const row = rowIndex + 2
    const nameCell = gantt.getCell(row, 1)
    nameCell.value = `${task.phase} / ${task.name}`
    nameCell.font = { size: 9 }
    const color = phaseColor(phaseIndex.get(task.phase) ?? 0)
    for (let col = 1; col <= dateColumns.length; col++) {
      const iso = dateColumns[col - 1]!
      if (iso >= task.start && iso <= task.end) {
        const cell = gantt.getCell(row, col + 1)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
      }
    }
    // Start/end date labels in the first and last bar cells.
    const startCell = gantt.getCell(row, dateToCol.get(task.start)!)
    if (startCell) startCell.value = task.start.slice(5)
    const endCell = gantt.getCell(row, dateToCol.get(task.end)!)
    if (endCell) endCell.value = task.end.slice(5)
    if (startCell && endCell) {
      startCell.font = { size: 8, color: { argb: 'FFFFFFFF' } }
      endCell.font = { size: 8, color: { argb: 'FFFFFFFF' } }
    }
  })

  // Milestone markers in a distinct colour.
  const milestoneRow = timeline.tasks.length + 2
  const milestoneCell = gantt.getCell(milestoneRow, 1)
  milestoneCell.value = 'Milestones'
  milestoneCell.font = { bold: true, size: 9 }
  for (const milestone of timeline.milestones) {
    const col = dateToCol.get(milestone.date)
    if (col === undefined) continue
    const cell = gantt.getCell(milestoneRow, col)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFAE852D' } } // gold
    cell.value = milestone.name
    cell.font = { size: 8, color: { argb: 'FFFFFFFF' } }
  }

  gantt.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]

  const raw = await workbook.xlsx.writeBuffer()
  if (Buffer.isBuffer(raw)) return raw
  return Buffer.from(raw as ArrayBuffer)
}
