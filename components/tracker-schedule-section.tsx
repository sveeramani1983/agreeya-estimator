"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  differenceInDays,
  eachMonthOfInterval,
  startOfMonth,
  format,
  parseISO,
} from "date-fns"
import { Lock, Calendar } from "lucide-react"
import type { SchedulePhase } from "@/lib/actions"

// ── Constants (mirrors schedule-workspace.tsx) ────────────────────────────────

const GANTT_HEADER_H = 32
const GANTT_ROW_H = 36
const GANTT_BAR_H = 22
const GANTT_LABEL_W = 160

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return format(parseISO(iso), "MMM d, yyyy")
}

function computeProjectBounds(phases: SchedulePhase[]) {
  if (phases.length === 0) {
    const today = new Date()
    return { start: today, end: new Date(today.getTime() + 84 * 86400000) }
  }
  const starts = phases.map(p => parseISO(p.start_date))
  const ends   = phases.map(p => parseISO(p.end_date))
  return {
    start: starts.reduce((a, b) => (a < b ? a : b)),
    end:   ends.reduce((a, b)   => (a > b ? a : b)),
  }
}

// ── Read-only Gantt SVG ───────────────────────────────────────────────────────

interface GanttSVGProps {
  phases: SchedulePhase[]
  dayW: number
  onTooltip: (t: { x: number; y: number; title: string; sub: string } | null) => void
}

function ReadOnlyGanttSVG({ phases, dayW, onTooltip }: GanttSVGProps) {
  const { start: projectStart, end: projectEnd } = computeProjectBounds(phases)
  const totalDays = differenceInDays(projectEnd, projectStart) + 7
  const svgW = Math.max(totalDays * dayW, 300)
  const svgH = GANTT_HEADER_H + phases.length * GANTT_ROW_H + 8

  const months = phases.length > 0
    ? eachMonthOfInterval({ start: projectStart, end: projectEnd })
    : []

  const today = new Date()
  const todayX = differenceInDays(today, projectStart) * dayW
  const showToday = todayX >= 0 && todayX <= svgW

  function barX(iso: string) {
    return Math.max(0, differenceInDays(parseISO(iso), projectStart) * dayW)
  }
  function barW(s: string, e: string) {
    return Math.max(4, (differenceInDays(parseISO(e), parseISO(s)) + 1) * dayW)
  }

  return (
    <svg width={svgW} height={svgH} style={{ display: "block", minWidth: svgW }}>
      {/* Header background */}
      <rect x={0} y={0} width={svgW} height={GANTT_HEADER_H} fill="var(--bg-primary)" />

      {/* Month columns */}
      {months.map((month, mi) => {
        const x = differenceInDays(startOfMonth(month), projectStart) * dayW
        return (
          <g key={mi}>
            <text
              x={x + 6} y={GANTT_HEADER_H - 8}
              fontSize={9} fontWeight={600}
              fill="var(--text-secondary)"
              style={{ userSelect: "none" }}
            >
              {format(month, "MMM yyyy")}
            </text>
            <line
              x1={x} y1={0} x2={x} y2={svgH}
              stroke="var(--border-primary)" strokeWidth={1} opacity={0.5}
            />
          </g>
        )
      })}

      {/* Row backgrounds */}
      {phases.map((_, i) => (
        <rect
          key={i}
          x={0} y={GANTT_HEADER_H + i * GANTT_ROW_H}
          width={svgW} height={GANTT_ROW_H}
          fill={i % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)"}
          opacity={0.5}
        />
      ))}

      {/* Phase bars */}
      {phases.map((phase, i) => {
        const x = barX(phase.start_date)
        const w = barW(phase.start_date, phase.end_date)
        const y = GANTT_HEADER_H + i * GANTT_ROW_H + (GANTT_ROW_H - GANTT_BAR_H) / 2
        const opacity = phase.status === "complete" ? 0.55 : phase.status === "upcoming" ? 0.4 : 0.9
        return (
          <g key={phase.id}>
            <rect
              x={x} y={y} width={w} height={GANTT_BAR_H}
              rx={3} ry={3}
              fill={phase.color}
              fillOpacity={opacity}
              style={{ cursor: "pointer" }}
              onMouseEnter={e =>
                onTooltip({
                  x: e.clientX, y: e.clientY,
                  title: phase.name,
                  sub: `${fmtDate(phase.start_date)} → ${fmtDate(phase.end_date)} · ${phase.progressPercent}% elapsed`,
                })
              }
              onMouseLeave={() => onTooltip(null)}
            />
            {/* Progress fill overlay for active phases */}
            {phase.status === "active" && phase.progressPercent > 0 && (
              <rect
                x={x} y={y}
                width={Math.max(0, w * phase.progressPercent / 100)}
                height={GANTT_BAR_H}
                rx={3} ry={3}
                fill={phase.color}
                fillOpacity={0.95}
                style={{ pointerEvents: "none" }}
              />
            )}
            {w > 50 && (
              <text
                x={x + 6} y={y + GANTT_BAR_H / 2 + 4}
                fontSize={9} fontWeight={600} fill="white"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {phase.name.length > Math.floor(w / 6)
                  ? phase.name.slice(0, Math.floor(w / 6) - 1) + "…"
                  : phase.name}
              </text>
            )}
          </g>
        )
      })}

      {/* Today line */}
      {showToday && (
        <g>
          <line
            x1={todayX} y1={0} x2={todayX} y2={svgH}
            stroke="var(--text-danger)" strokeWidth={1.5} strokeDasharray="4 3"
          />
          <text x={todayX + 3} y={11} fontSize={8} fill="var(--text-danger)" fontWeight={700}>
            Today
          </text>
        </g>
      )}

      {/* Header bottom border */}
      <line
        x1={0} y1={GANTT_HEADER_H} x2={svgW} y2={GANTT_HEADER_H}
        stroke="var(--border-primary)" strokeWidth={1}
      />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  phases: SchedulePhase[]
  estimatorProjectId: string
}

export function TrackerScheduleSection({ phases, estimatorProjectId }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; sub: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dayW, setDayW] = useState(4)

  // Auto-fit: compute pixels-per-day to fill available width
  useEffect(() => {
    if (!containerRef.current || phases.length === 0) return

    const measure = () => {
      if (!containerRef.current) return
      const { start, end } = computeProjectBounds(phases)
      const projectDays = Math.max(1, differenceInDays(end, start) + 1)
      const containerW = containerRef.current.clientWidth
      const availableW = containerW - GANTT_LABEL_W - 2
      if (availableW > 0) {
        const computed = availableW / projectDays
        setDayW(Math.max(1.5, Math.min(20, computed)))
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [phases])

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (phases.length === 0) {
    return (
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2D45]">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Project Schedule</p>
          </div>
          <span className="text-xs text-muted-foreground">Read-only — edit in Estimator</span>
        </div>
        <div className="p-8 text-center space-y-3">
          <Calendar className="h-7 w-7 mx-auto text-muted-foreground opacity-30" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No schedule defined</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add phases in the Estimator to see the project schedule here.
            </p>
          </div>
          <Link
            href={`/projects/${estimatorProjectId}/schedule`}
            className="inline-block text-xs text-primary hover:underline"
          >
            Open Schedule in Estimator →
          </Link>
        </div>
      </div>
    )
  }

  // ── Full view ───────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2D45]">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Project Schedule</p>
        </div>
        <span className="text-xs text-muted-foreground">Read-only — edit in Estimator</span>
      </div>

      {/* Phase status table */}
      <div className="overflow-x-auto border-b border-[#1E2D45]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1E2D45]" style={{ backgroundColor: "var(--bg-secondary)" }}>
              {["Phase", "Planned End", "Status", "Progress"].map(h => (
                <th
                  key={h}
                  className="px-4 py-2 text-left font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {phases.map((phase, i) => {
              const today = new Date().toISOString().split("T")[0]
              const daysToEnd = differenceInDays(parseISO(phase.end_date), parseISO(today))
              const isWarning = phase.status === "active" && daysToEnd >= 0 && daysToEnd <= 5
              const isOverdue  = phase.status === "active" && daysToEnd < 0

              return (
                <tr
                  key={phase.id}
                  className="border-b border-[#1E2D45]/40 transition-colors"
                  style={{ backgroundColor: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-card-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)")}
                >
                  {/* Phase name */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: phase.color }}
                      />
                      <span
                        className="font-medium truncate max-w-[200px]"
                        style={{ color: "var(--text-primary)" }}
                        title={phase.name}
                      >
                        {phase.name}
                      </span>
                    </div>
                  </td>

                  {/* Planned end */}
                  <td className="px-4 py-2.5" style={{ color: isOverdue ? "var(--text-danger)" : "var(--text-secondary)" }}>
                    {fmtDate(phase.end_date)}
                    {isOverdue && <span className="ml-1 text-[10px]">({Math.abs(daysToEnd)}d overdue)</span>}
                    {isWarning && <span className="ml-1 text-[10px] text-amber-400">({daysToEnd}d left)</span>}
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-2.5">
                    {phase.status === "complete" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-900/40 text-green-300 border border-green-800/50">
                        ✅ Complete
                      </span>
                    )}
                    {phase.status === "active" && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isOverdue ? "bg-red-900/40 text-red-300 border-red-800/50" : isWarning ? "bg-amber-900/40 text-amber-300 border-amber-800/50" : "bg-blue-900/40 text-blue-300 border-blue-800/50"}`}>
                        🔄 In Progress
                      </span>
                    )}
                    {phase.status === "upcoming" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1E2D45]/60 text-muted-foreground border border-[#1E2D45]">
                        ⏳ Upcoming
                      </span>
                    )}
                  </td>

                  {/* Progress bar + % */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-24 h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--border-primary)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${phase.progressPercent}%`,
                            backgroundColor: phase.status === "complete"
                              ? "#10B981"
                              : phase.color,
                          }}
                        />
                      </div>
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {phase.progressPercent}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Read-only Gantt */}
      <div ref={containerRef} className="flex" style={{ backgroundColor: "var(--bg-card)" }}>
        {/* Fixed label column */}
        <div
          className="shrink-0 border-r"
          style={{
            width: GANTT_LABEL_W,
            borderColor: "var(--border-primary)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          {/* Header spacer aligned with SVG header */}
          <div
            style={{ height: GANTT_HEADER_H, backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border-primary)" }}
          />
          {phases.map((phase, i) => (
            <div
              key={phase.id}
              className="flex items-center gap-2 px-3"
              style={{
                height: GANTT_ROW_H,
                backgroundColor: i % 2 === 0 ? "var(--bg-secondary)" : "var(--bg-card)",
              }}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
              <span
                className="text-[11px] font-medium truncate"
                style={{ color: "var(--text-primary)" }}
                title={phase.name}
              >
                {phase.name}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable SVG area */}
        <div className="overflow-x-auto flex-1 min-w-0">
          <ReadOnlyGanttSVG phases={phases} dayW={dayW} onTooltip={setTooltip} />
        </div>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-2xl"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 44,
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-primary)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          <p className="font-semibold">{tooltip.title}</p>
          <p style={{ color: "var(--text-secondary)" }} className="mt-0.5">{tooltip.sub}</p>
        </div>
      )}
    </div>
  )
}
