import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { WireTimelineTask } from './contracts.js'
import { BRAND, hexToRgba, phaseColor } from './colors.js'

/**
 * Minimal client-side Gantt derived from `ProjectStateWire.timeline`.
 * Pure JSX/inline styles — no chart library. Mirrors the zoom model of the
 * reference `templates/gantt.html`: pixels-per-day density with Day / Week /
 * Month / Year zoom, a two-tier month/day ruler, phase bands, task bars
 * (colored per phase, critical path outlined), milestone diamonds, a "today"
 * line and horizontal scroll when the timeline is wider than the container.
 */

export type ZoomLevel = 'day' | 'week' | 'month' | 'year'

export const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'month', 'year']
export const ZOOM_LABEL: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
}

/** Pixels per day at each zoom level (matches gantt.html). */
const PX_PER_DAY: Record<ZoomLevel, number> = { day: 26, week: 9, month: 3.4, year: 1.2 }

export interface GanttTimeline {
  startDate: string
  endDate: string
  tasks: WireTimelineTask[]
  phases?: { name: string; start: string; end: string }[]
  milestones?: { name: string; date: string }[]
}

export interface GanttChartProps {
  timeline: GanttTimeline
  /** Name column width in px. */
  nameWidth?: number
  /** Cap the chart height so long timelines scroll vertically instead of growing. */
  maxHeight?: number
}

const NAME_W = 150
const ROW_H = 24
const FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif'
const DAY_MS = 86_400_000

function parseIso(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface TickRange {
  left: number
  width: number
  label: string
  strong: boolean
}

function shortMonth(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

function monthRanges(start: Date, end: Date, px: number, labelOf: (d: Date) => string): TickRange[] {
  const ranges: TickRange[] = []
  let c = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  let guard = 0
  while (c.getTime() <= end.getTime() && guard < 120) {
    const next = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1))
    const from = c.getTime() < start.getTime() ? start : c
    const to = Math.min(next.getTime() - 1, end.getTime())
    ranges.push({
      left: Math.round(diffDays(start, from) * px),
      width: Math.round((diffDays(from, new Date(to)) + 1) * px),
      label: labelOf(c),
      strong: false,
    })
    c = next
    guard++
  }
  return ranges
}

function weekRanges(start: Date, end: Date, px: number): TickRange[] {
  const ranges: TickRange[] = []
  const offset = (start.getUTCDay() + 6) % 7 // days since Monday
  const firstMonday = new Date(start.getTime() - offset * DAY_MS)
  let w = new Date(firstMonday.getTime())
  let guard = 0
  while (w.getTime() <= end.getTime() && guard < 200) {
    const from = w.getTime() < start.getTime() ? start : w
    const to = Math.min(w.getTime() + 6 * DAY_MS, end.getTime())
    ranges.push({
      left: Math.round(diffDays(start, from) * px),
      width: Math.round((diffDays(from, new Date(to)) + 1) * px),
      label: `${from.getUTCMonth() + 1}/${from.getUTCDate()}`,
      strong: true,
    })
    w = new Date(w.getTime() + 7 * DAY_MS)
    guard++
  }
  return ranges
}

function dayRanges(start: Date, totalDays: number, px: number): TickRange[] {
  const ranges: TickRange[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS)
    ranges.push({
      left: Math.round(i * px),
      width: Math.max(1, Math.round(px)),
      label: String(d.getUTCDate()),
      strong: d.getUTCDay() === 1,
    })
  }
  return ranges
}

function yearRanges(start: Date, end: Date, px: number): TickRange[] {
  const ranges: TickRange[] = []
  let c = new Date(Date.UTC(start.getUTCFullYear(), 0, 1))
  let guard = 0
  while (c.getTime() <= end.getTime() && guard < 50) {
    const next = new Date(Date.UTC(c.getUTCFullYear() + 1, 0, 1))
    const from = c.getTime() < start.getTime() ? start : c
    const to = Math.min(next.getTime() - 1, end.getTime())
    ranges.push({
      left: Math.round(diffDays(start, from) * px),
      width: Math.round((diffDays(from, new Date(to)) + 1) * px),
      label: String(c.getUTCFullYear()),
      strong: true,
    })
    c = next
    guard++
  }
  return ranges
}

function buildTicks(
  zoom: ZoomLevel,
  start: Date,
  end: Date,
  totalDays: number,
  px: number,
): { coarse: TickRange[]; fine: TickRange[] } {
  switch (zoom) {
    case 'day':
      return { coarse: weekRanges(start, end, px), fine: dayRanges(start, totalDays, px) }
    case 'week':
      return { coarse: monthRanges(start, end, px, (d) => `${shortMonth(d)} ${d.getUTCFullYear()}`), fine: weekRanges(start, end, px) }
    case 'month':
      return { coarse: monthRanges(start, end, px, (d) => `${shortMonth(d)} ${d.getUTCFullYear()}`), fine: [] }
    case 'year':
      return { coarse: yearRanges(start, end, px), fine: monthRanges(start, end, px, shortMonth) }
  }
}

const wrap: CSSProperties = {
  border: `1px solid ${BRAND.line}`,
  borderRadius: '8px',
  background: BRAND.bandA,
  overflow: 'hidden',
}

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 8px',
  borderBottom: `1px solid ${BRAND.line}`,
}

const seg: CSSProperties = {
  display: 'inline-flex',
  border: `1px solid ${BRAND.line}`,
  borderRadius: '6px',
  overflow: 'hidden',
}

const segButton: CSSProperties = {
  font: 'inherit',
  fontSize: 11,
  padding: '2px 10px',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: BRAND.primary,
}

const segActive: CSSProperties = { background: BRAND.primary, color: '#fff' }

const scroll: CSSProperties = {
  overflow: 'auto',
  padding: '8px',
}

const row: CSSProperties = {
  display: 'flex',
  fontSize: FONT,
  color: BRAND.ink,
  borderBottom: `1px solid ${BRAND.line}`,
}

/** Sticky name cell that stays visible while the timeline scrolls horizontally. */
function NameCell({ width, background, title, children }: {
  width: number
  background: string
  title?: string
  children: ReactNode
}): ReactElement {
  return (
    <div
      title={title}
      style={{
        position: 'sticky',
        left: 0,
        zIndex: 4,
        flex: `0 0 ${width}px`,
        padding: '0 8px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: `${ROW_H}px`,
        background,
        borderRight: `1px solid ${BRAND.line}`,
      }}
    >
      {children}
    </div>
  )
}

export function GanttChart({ timeline, nameWidth = NAME_W, maxHeight }: GanttChartProps): ReactElement {
  const [zoom, setZoom] = useState<ZoomLevel>('week')

  const start = parseIso(timeline.startDate)
  const end = parseIso(timeline.endDate)
  const totalDays = Math.max(1, diffDays(start, end) + 1)
  const px = PX_PER_DAY[zoom]
  const timelineW = Math.ceil(totalDays * px)
  const ticks = buildTicks(zoom, start, end, totalDays, px)
  const rulerH = 16 + (ticks.fine.length > 0 ? 12 : 0)

  const phaseIndex = new Map<string, number>()
  timeline.phases?.forEach((phase, index) => {
    if (!phaseIndex.has(phase.name)) phaseIndex.set(phase.name, index)
  })

  const bars = timeline.tasks.map((task) => {
    const taskStart = parseIso(task.start)
    const taskEnd = parseIso(task.end)
    const leftPx = Math.max(0, Math.round(diffDays(start, taskStart) * px))
    const rawWidth = Math.max(3, Math.round((diffDays(taskStart, taskEnd) + 1) * px))
    return {
      task,
      leftPx,
      widthPx: Math.max(3, Math.min(timelineW - leftPx, rawWidth)),
      color: phaseColor(phaseIndex.get(task.phase) ?? 0),
    }
  })

  const today = todayIso()
  const todayLeft = Math.round(diffDays(start, parseIso(today)) * px)
  const showToday = todayLeft >= 0 && todayLeft <= timelineW

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <span style={{ fontSize: 11, color: BRAND.muted, fontWeight: 600 }}>Zoom</span>
        <div style={seg} role="group" aria-label="Timeline zoom">
          {ZOOM_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoom(level)}
              style={zoom === level ? { ...segButton, ...segActive } : segButton}
            >
              {ZOOM_LABEL[level]}
            </button>
          ))}
        </div>
      </div>

      <div style={maxHeight !== undefined ? { ...scroll, maxHeight } : scroll}>
        <div style={{ width: nameWidth + timelineW, minWidth: nameWidth + 400 }}>
          {/* Ruler header */}
          <div style={{ ...row, background: BRAND.bandA, borderBottom: `2px solid ${BRAND.line}` }}>
            <NameCell width={nameWidth} background={BRAND.bandA}>Task</NameCell>
            <div style={{ position: 'relative', flex: 1, height: rulerH }}>
              {ticks.coarse.map((tick, index) => (
                <div
                  key={`c${index}`}
                  title={tick.label}
                  style={{
                    position: 'absolute',
                    left: tick.left,
                    width: Math.max(tick.width, 2),
                    top: 0,
                    height: 16,
                    paddingLeft: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    color: BRAND.ink,
                    lineHeight: '16px',
                    borderLeft: `1px solid ${BRAND.line}`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tick.label}
                </div>
              ))}
              {ticks.fine.map((tick, index) => (
                <div
                  key={`f${index}`}
                  title={tick.label}
                  style={{
                    position: 'absolute',
                    left: tick.left,
                    width: Math.max(tick.width, 2),
                    top: 16,
                    height: 12,
                    paddingLeft: 3,
                    fontSize: 9,
                    fontWeight: tick.strong ? 700 : 400,
                    color: tick.strong ? BRAND.ink : BRAND.muted,
                    lineHeight: '12px',
                    borderLeft: `1px solid ${hexToRgba(BRAND.ink, 0.1)}`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
          </div>

          {/* Phase bands */}
          {timeline.phases !== undefined && timeline.phases.length > 0 && (
            <div style={{ ...row, background: BRAND.bandB }}>
              <NameCell width={nameWidth} background={BRAND.bandB}>Phases</NameCell>
              <div style={{ position: 'relative', flex: 1, height: ROW_H }}>
                {timeline.phases.map((phase, index) => {
                  const phaseStart = parseIso(phase.start)
                  const phaseEnd = parseIso(phase.end)
                  const leftPx = Math.max(0, Math.round(diffDays(start, phaseStart) * px))
                  const rawWidth = Math.max(1, Math.round((diffDays(phaseStart, phaseEnd) + 1) * px))
                  const widthPx = Math.max(1, Math.min(timelineW - leftPx, rawWidth))
                  const color = phaseColor(index)
                  return (
                    <div
                      key={phase.name}
                      title={phase.name}
                      style={{
                        position: 'absolute',
                        left: leftPx,
                        width: widthPx,
                        top: 1,
                        bottom: 1,
                        borderRadius: 4,
                        background: hexToRgba(color, 0.16),
                        borderLeft: `3px solid ${color}`,
                        color,
                        fontWeight: 600,
                        fontSize: 10,
                        lineHeight: `${ROW_H - 2}px`,
                        paddingLeft: 5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {widthPx >= 40 ? phase.name : ''}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Task rows */}
          <div style={{ position: 'relative' }}>
            {bars.map(({ task, leftPx, widthPx, color }, index) => {
              const bg = index % 2 === 0 ? BRAND.bandA : BRAND.bandB
              return (
                <div key={task.id} style={{ ...row, background: bg }}>
                  <NameCell width={nameWidth} background={bg} title={task.name}>{task.name}</NameCell>
                  <div style={{ position: 'relative', flex: 1, height: ROW_H }}>
                    <div
                      title={`${task.name} (${task.start} → ${task.end})`}
                      style={{
                        position: 'absolute',
                        left: leftPx,
                        width: widthPx,
                        top: 3,
                        bottom: 3,
                        borderRadius: 4,
                        background: color,
                        color: '#fff',
                        fontSize: 10,
                        lineHeight: `${ROW_H - 6}px`,
                        paddingLeft: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        zIndex: 2,
                        boxShadow: task.critical ? `0 0 0 2px ${BRAND.ink}` : '0 1px 2px rgba(41, 42, 45, 0.25)',
                      }}
                    >
                      {widthPx >= 36 ? task.name : ''}
                    </div>
                  </div>
                </div>
              )
            })}

            {bars.length === 0 && (
              <div style={{ ...row, color: BRAND.muted, justifyContent: 'center', padding: '8px 0' }}>
                No tasks scheduled yet.
              </div>
            )}

            {/* Gridlines */}
            <div
              style={{
                position: 'absolute',
                left: nameWidth,
                top: 0,
                bottom: 0,
                width: timelineW,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {ticks.fine.map((tick, index) => (
                <div
                  key={`g${index}`}
                  style={{ position: 'absolute', left: tick.left, top: 0, bottom: 0, width: 1, background: hexToRgba(BRAND.ink, 0.08) }}
                />
              ))}
              {ticks.coarse.map((tick, index) => (
                <div
                  key={`G${index}`}
                  style={{ position: 'absolute', left: tick.left, top: 0, bottom: 0, width: 1, background: BRAND.line }}
                />
              ))}
            </div>

            {/* Milestone diamonds */}
            {timeline.milestones !== undefined && timeline.milestones.map((milestone) => {
              const leftPx = Math.round(diffDays(start, parseIso(milestone.date)) * px)
              if (leftPx < 0 || leftPx > timelineW) return null
              return (
                <div
                  key={`${milestone.name}-${milestone.date}`}
                  title={`${milestone.date} — ${milestone.name}`}
                  style={{
                    position: 'absolute',
                    left: nameWidth + leftPx - 5,
                    top: 6,
                    width: 10,
                    height: 10,
                    background: BRAND.primaryDark,
                    border: '1px solid #fff',
                    transform: 'rotate(45deg)',
                    borderRadius: 2,
                    boxShadow: '0 1px 2px rgba(41, 42, 45, 0.3)',
                    zIndex: 2,
                  }}
                />
              )
            })}

            {/* Today line */}
            {showToday && (
              <div
                title={`Today (${today})`}
                style={{
                  position: 'absolute',
                  left: nameWidth + todayLeft - 1,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: BRAND.danger,
                  zIndex: 3,
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '8px 4px 0', fontSize: 11, color: BRAND.muted }}>
            {timeline.phases?.map((phase, index) => (
              <span key={phase.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 8, borderRadius: 2, background: phaseColor(index), display: 'inline-block' }} />
                {phase.name}
              </span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 8, borderRadius: 2, background: BRAND.ink, display: 'inline-block' }} />
              Critical
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, background: BRAND.primaryDark, transform: 'rotate(45deg)', borderRadius: 1, display: 'inline-block' }} />
              Milestone
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 0, borderLeft: `2px solid ${BRAND.danger}`, height: 10, display: 'inline-block' }} />
              Today
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
