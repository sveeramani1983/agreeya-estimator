"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  parseISO,
  differenceInDays,
  addDays,
  addWeeks,
  eachMonthOfInterval,
  startOfMonth,
  format,
} from "date-fns"
import { v4 as uuidv4 } from "uuid"
import {
  GripVertical,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Users,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  Info,
  Calendar,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

import {
  type Phase,
  type PhaseTemplate,
  type PhaseTemplatePhase,
  type CoverageWarning,
  type ResourceGanttData,
  type Project,
} from "@/lib/types"
import { saveProjectPhases } from "@/lib/actions"

// ── Constants ─────────────────────────────────────────────────────────────────

const PREDEFINED_PHASE_GROUPS: { group: string; options: string[] }[] = [
  {
    group: "Discovery & Planning",
    options: [
      "Discovery & Assessment",
      "Requirements Gathering",
      "Stakeholder Workshops",
      "Business Analysis",
      "Fit-Gap Analysis",
      "Feasibility Study",
      "Project Kickoff",
    ],
  },
  {
    group: "Design & Architecture",
    options: [
      "Technical Design",
      "Solution Architecture",
      "System Architecture",
      "Information Architecture & Design",
      "UX Research",
      "UX / UI Design",
      "API Design & Contracts",
    ],
  },
  {
    group: "Development",
    options: [
      "Development",
      "Frontend Development",
      "Backend Development",
      "Full-Stack Development",
      "Mobile Development (iOS)",
      "Mobile Development (Android)",
      "API Development",
      "Component Development",
    ],
  },
  {
    group: "Data",
    options: [
      "Data Migration",
      "Data Architecture & Modeling",
      "ETL / Pipeline Development",
      "Data Quality & Validation",
      "Dashboard & Visualization Build",
      "Data Discovery & Profiling",
    ],
  },
  {
    group: "Integration",
    options: [
      "Integration Development",
      "System Integration",
      "Third-Party Integration",
      "Middleware Configuration",
      "Integration Testing",
    ],
  },
  {
    group: "Testing & QA",
    options: [
      "Testing & QA",
      "Unit Testing",
      "System Testing",
      "Performance & Load Testing",
      "Security Testing",
      "User Acceptance Testing (UAT)",
      "End-to-End Testing",
      "Regression Testing",
    ],
  },
  {
    group: "Deployment & Go-Live",
    options: [
      "Deployment & Go-Live",
      "Production Cutover",
      "Environment Setup & Configuration",
      "Infrastructure Setup",
      "Cloud Migration",
    ],
  },
  {
    group: "Post Go-Live",
    options: [
      "Warranty & Hypercare",
      "Support & Stabilisation",
      "Training & Handover",
      "Knowledge Transfer",
      "Documentation",
      "Hypercare",
    ],
  },
  {
    group: "Project Management",
    options: [
      "Project Management",
      "Change Management",
      "Risk Management",
      "Governance & Reporting",
    ],
  },
]

const ALL_PREDEFINED = PREDEFINED_PHASE_GROUPS.flatMap(g => g.options)

const PHASE_COLORS = [
  "#2563EB", "#7C3AED", "#059669", "#D97706",
  "#DC2626", "#0891B2", "#9333EA", "#16A34A",
]

const DAY_WIDTH: Record<"week" | "month" | "quarter", number> = {
  week: 20,
  month: 4,
  quarter: 1.5,
}

const GANTT_HEADER_H = 32
const GANTT_ROW_H = 40
const GANTT_BAR_H = 24
const GANTT_LABEL_W = 190
const RESOURCE_ROW_H = 36
const RESOURCE_BAR_MAX_H = 22

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleWorkspaceProps {
  projectId: string
  project: Project
  initialPhases: Phase[]
  templates: PhaseTemplate[]
  ganttData: ResourceGanttData
  coverageWarnings: CoverageWarning[]
}

interface TooltipState {
  x: number
  y: number
  title: string
  sub: string
}

interface EditDraft {
  name: string
  start_date: string
  end_date: string
  color: string
  notes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return format(parseISO(iso), "MMM d, yyyy")
}

function weeksBetween(start: string, end: string) {
  return Math.round((differenceInDays(parseISO(end), parseISO(start)) + 1) / 7)
}

function clampedDayWidth(phases: Phase[], zoom: "week" | "month" | "quarter") {
  return DAY_WIDTH[zoom]
}

function computeProjectBounds(phases: Phase[]) {
  if (phases.length === 0) {
    const today = new Date()
    return { start: today, end: addWeeks(today, 12) }
  }
  const starts = phases.map(p => parseISO(p.start_date))
  const ends   = phases.map(p => parseISO(p.end_date))
  return {
    start: starts.reduce((a, b) => (a < b ? a : b)),
    end:   ends.reduce((a, b) => (a > b ? a : b)),
  }
}

// ── PhaseNameCombobox ─────────────────────────────────────────────────────────

function PhaseNameCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const query = value.toLowerCase().trim()

  const filteredGroups = query === ""
    ? PREDEFINED_PHASE_GROUPS
    : PREDEFINED_PHASE_GROUPS
        .map(g => ({
          ...g,
          options: g.options.filter(o => o.toLowerCase().includes(query)),
        }))
        .filter(g => g.options.length > 0)

  const totalMatches = filteredGroups.reduce((n, g) => n + g.options.length, 0)
  const exactMatch = ALL_PREDEFINED.some(o => o.toLowerCase() === query)
  const showCustomOption = value.trim() !== "" && !exactMatch

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={e => { e.target.select(); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === "Escape") setOpen(false)
          if (e.key === "Enter") setOpen(false)
        }}
        placeholder="Search or type a phase name…"
        autoComplete="off"
        spellCheck={false}
        className="w-full px-2.5 py-1.5 rounded-md text-sm border outline-none"
        style={{
          backgroundColor: "var(--bg-input)",
          borderColor: open ? "var(--accent-blue)" : "var(--border-primary)",
          color: "var(--text-primary)",
        }}
      />

      {open && (totalMatches > 0 || showCustomOption) && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded-lg border shadow-2xl overflow-hidden"
          style={{
            top: "100%",
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-primary)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {filteredGroups.map(group => (
            <div key={group.group}>
              <div
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }}
              >
                {group.group}
              </div>
              {group.options.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange(opt); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{
                    color: opt === value ? "var(--accent-blue)" : "var(--text-primary)",
                    backgroundColor: opt === value ? "color-mix(in srgb, var(--accent-blue) 10%, var(--bg-card))" : "transparent",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-card-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = opt === value ? "color-mix(in srgb, var(--accent-blue) 10%, var(--bg-card))" : "transparent")}
                >
                  {opt}
                </button>
              ))}
            </div>
          ))}

          {/* Custom option */}
          {showCustomOption && (
            <div>
              {totalMatches > 0 && (
                <div
                  className="mx-3 my-1 border-t"
                  style={{ borderColor: "var(--border-primary)" }}
                />
              )}
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setOpen(false)}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-card-hover)")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Plus className="h-3 w-3 shrink-0" style={{ color: "var(--accent-blue)" }} />
                <span>
                  Use{" "}
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    &ldquo;{value}&rdquo;
                  </span>{" "}
                  as custom phase
                </span>
              </button>
            </div>
          )}

          {/* No matches at all */}
          {totalMatches === 0 && !showCustomOption && (
            <div
              className="px-3 py-3 text-sm text-center"
              style={{ color: "var(--text-muted)" }}
            >
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SortablePhaseCard ─────────────────────────────────────────────────────────

interface SortablePhaseCardProps {
  phase: Phase
  index: number
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
  onSave: (draft: EditDraft) => void
  onCancel: () => void
}

function SortablePhaseCard({
  phase, index, isEditing, onEdit, onDelete, onSave, onCancel,
}: SortablePhaseCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: phase.id })

  const [draft, setDraft] = useState<EditDraft>({
    name: phase.name,
    start_date: phase.start_date,
    end_date: phase.end_date,
    color: phase.color,
    notes: phase.notes ?? "",
  })
  const handleEdit = () => {
    setDraft({
      name: phase.name,
      start_date: phase.start_date,
      end_date: phase.end_date,
      color: phase.color,
      notes: phase.notes ?? "",
    })
    onEdit()
  }

  const durationWks = weeksBetween(
    isEditing ? draft.start_date : phase.start_date,
    isEditing ? draft.end_date   : phase.end_date,
  )

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-primary)",
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: "0.5rem",
        overflow: "hidden",
      }}
    >
      <div>
        {/* Collapsed row */}
        {!isEditing && (
          <div className="flex items-center gap-2 p-3">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:opacity-70 shrink-0"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: phase.color }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {phase.name}
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {fmtDate(phase.start_date)} → {fmtDate(phase.end_date)}{" "}
                <span className="opacity-60">({durationWks}w)</span>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleEdit}
                className="p-1.5 rounded hover:opacity-70 transition-opacity"
                style={{ color: "var(--text-secondary)" }}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded hover:opacity-70 transition-opacity"
                style={{ color: "var(--text-secondary)" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Expanded edit form */}
        {isEditing && (
          <div className="p-3 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Phase Name
              </label>
              <PhaseNameCombobox
                value={draft.name}
                onChange={name => setDraft(d => ({ ...d, name }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                  Start Date
                </label>
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 rounded-md text-sm border outline-none"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                    colorScheme: "dark",
                  }}
                  value={draft.start_date}
                  onChange={e => setDraft(d => ({ ...d, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                  End Date
                </label>
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 rounded-md text-sm border outline-none"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                    colorScheme: "dark",
                  }}
                  value={draft.end_date}
                  onChange={e => setDraft(d => ({ ...d, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Duration:
              </span>
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {weeksBetween(draft.start_date, draft.end_date)} weeks
              </span>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Color
              </label>
              <div className="flex gap-1.5">
                {PHASE_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setDraft(d => ({ ...d, color }))}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      outline: draft.color === color ? "2px solid var(--text-primary)" : "2px solid transparent",
                      outlineOffset: "2px",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Notes (optional)
              </label>
              <input
                className="w-full px-2.5 py-1.5 rounded-md text-sm border outline-none"
                style={{
                  backgroundColor: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
                placeholder="Optional notes…"
                value={draft.notes}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onSave(draft)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: "var(--accent-blue)" }}
              >
                <Check className="h-3 w-3" /> Save
              </button>
              <button
                onClick={onCancel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border"
                style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── PhaseGanttSVG ─────────────────────────────────────────────────────────────

interface PhaseGanttSVGProps {
  phases: Phase[]
  zoom: "week" | "month" | "quarter"
  onTooltip: (t: TooltipState | null) => void
}

function PhaseGanttSVG({ phases, zoom, onTooltip }: PhaseGanttSVGProps) {
  const dayW = DAY_WIDTH[zoom]
  const { start: projectStart, end: projectEnd } = computeProjectBounds(phases)
  const totalDays = differenceInDays(projectEnd, projectStart) + 7
  const svgW = Math.max(totalDays * dayW, 400)
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
  function barW(start: string, end: string) {
    return Math.max(4, (differenceInDays(parseISO(end), parseISO(start)) + 1) * dayW)
  }

  if (phases.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-48 text-sm rounded-lg border"
        style={{ color: "var(--text-secondary)", borderColor: "var(--border-primary)", backgroundColor: "var(--bg-card)" }}
      >
        <Calendar className="h-8 w-8 mb-2 opacity-40" />
        <p>Add phases to see the Gantt chart</p>
      </div>
    )
  }

  return (
    <svg
      width={svgW}
      height={svgH}
      style={{ display: "block", minWidth: svgW }}
    >
      {/* Month header background */}
      <rect x={0} y={0} width={svgW} height={GANTT_HEADER_H}
        fill="var(--bg-primary)" />

      {/* Month columns */}
      {months.map((month, mi) => {
        const x = differenceInDays(startOfMonth(month), projectStart) * dayW
        const nextMonth = mi < months.length - 1 ? months[mi + 1] : null
        const w = nextMonth
          ? differenceInDays(startOfMonth(nextMonth), startOfMonth(month)) * dayW
          : (differenceInDays(projectEnd, startOfMonth(month)) + 7) * dayW
        return (
          <g key={mi}>
            <text
              x={x + 8}
              y={GANTT_HEADER_H - 8}
              fontSize={10}
              fontWeight={600}
              fill="var(--text-secondary)"
              style={{ userSelect: "none" }}
            >
              {format(month, "MMM yyyy")}
            </text>
            <line
              x1={x} y1={0} x2={x} y2={svgH}
              stroke="var(--border-primary)" strokeWidth={1} opacity={0.6}
            />
          </g>
        )
      })}

      {/* Row backgrounds alternating */}
      {phases.map((_, i) => (
        <rect
          key={i}
          x={0}
          y={GANTT_HEADER_H + i * GANTT_ROW_H}
          width={svgW}
          height={GANTT_ROW_H}
          fill={i % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)"}
          opacity={0.5}
        />
      ))}

      {/* Phase bars */}
      {phases.map((phase, i) => {
        const x = barX(phase.start_date)
        const w = barW(phase.start_date, phase.end_date)
        const y = GANTT_HEADER_H + i * GANTT_ROW_H + (GANTT_ROW_H - GANTT_BAR_H) / 2
        const wks = weeksBetween(phase.start_date, phase.end_date)
        return (
          <g key={phase.id}>
            <rect
              x={x} y={y} width={w} height={GANTT_BAR_H}
              rx={4} ry={4}
              fill={phase.color}
              fillOpacity={0.85}
              style={{ cursor: "pointer" }}
              onMouseEnter={e =>
                onTooltip({
                  x: e.clientX, y: e.clientY,
                  title: phase.name,
                  sub: `${fmtDate(phase.start_date)} → ${fmtDate(phase.end_date)}  ·  ${wks}w`,
                })
              }
              onMouseLeave={() => onTooltip(null)}
            />
            {w > 60 && (
              <text
                x={x + 8}
                y={y + GANTT_BAR_H / 2 + 4}
                fontSize={10}
                fontWeight={600}
                fill="white"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {phase.name.length > Math.floor(w / 7) ? phase.name.slice(0, Math.floor(w / 7) - 1) + "…" : phase.name}
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
            stroke="var(--text-danger)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text x={todayX + 4} y={12} fontSize={9} fill="var(--text-danger)" fontWeight={700}>
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

// ── ResourceGanttSVG ──────────────────────────────────────────────────────────

interface ResourceGanttSVGProps {
  ganttData: ResourceGanttData
  phases: Phase[]
  zoom: "week" | "month" | "quarter"
  onTooltip: (t: TooltipState | null) => void
}

function ResourceGanttSVG({ ganttData, phases, zoom, onTooltip }: ResourceGanttSVGProps) {
  const { resources, loading } = ganttData
  const dayW = DAY_WIDTH[zoom]
  const { start: projectStart, end: projectEnd } = computeProjectBounds(phases)
  const totalDays = differenceInDays(projectEnd, projectStart) + 7
  const svgW = Math.max(totalDays * dayW, 400)
  const svgH = GANTT_HEADER_H + resources.length * RESOURCE_ROW_H + 8

  const months = phases.length > 0
    ? eachMonthOfInterval({ start: projectStart, end: projectEnd })
    : []

  const today = new Date()
  const todayX = differenceInDays(today, projectStart) * dayW
  const showToday = todayX >= 0 && todayX <= svgW

  if (resources.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-48 text-sm rounded-lg border"
        style={{ color: "var(--text-secondary)", borderColor: "var(--border-primary)", backgroundColor: "var(--bg-card)" }}
      >
        <Users className="h-8 w-8 mb-2 opacity-40" />
        <p>No resources assigned to this project yet</p>
      </div>
    )
  }

  return (
    <svg width={svgW} height={svgH} style={{ display: "block", minWidth: svgW }}>
      <rect x={0} y={0} width={svgW} height={GANTT_HEADER_H} fill="var(--bg-primary)" />

      {months.map((month, mi) => {
        const x = differenceInDays(startOfMonth(month), projectStart) * dayW
        return (
          <g key={mi}>
            <text x={x + 8} y={GANTT_HEADER_H - 8} fontSize={10} fontWeight={600}
              fill="var(--text-secondary)" style={{ userSelect: "none" }}>
              {format(month, "MMM yyyy")}
            </text>
            <line x1={x} y1={0} x2={x} y2={svgH}
              stroke="var(--border-primary)" strokeWidth={1} opacity={0.6} />
          </g>
        )
      })}

      {resources.map((res, ri) => {
        const rowY = GANTT_HEADER_H + ri * RESOURCE_ROW_H
        const resLoading = loading.filter(l => l.resource_id === res.id)
        const isOnsite = (res as any).location !== "offshore"

        return (
          <g key={res.id}>
            <rect x={0} y={rowY} width={svgW} height={RESOURCE_ROW_H}
              fill={ri % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)"} opacity={0.5} />

            {resLoading.map((l, li) => {
              const labelDate = l.period_label.length === 10
                ? parseISO(l.period_label)
                : parseISO(l.period_label + "-01")
              const periodX = differenceInDays(labelDate, projectStart) * dayW
              if (periodX < 0 || periodX > svgW) return null

              const periodW = l.period_label.length === 10 ? 7 * dayW : 30 * dayW
              const barH = Math.max(4, (l.hours / 40) * RESOURCE_BAR_MAX_H)
              const barY = rowY + RESOURCE_ROW_H - barH - 4

              return (
                <rect
                  key={li}
                  x={periodX} y={barY}
                  width={Math.max(periodW - 2, 2)} height={barH}
                  rx={2} ry={2}
                  fill={isOnsite ? "#2563EB" : "#059669"}
                  fillOpacity={0.8}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={e =>
                    onTooltip({
                      x: e.clientX, y: e.clientY,
                      title: `${res.name}`,
                      sub: `${l.period_label}  ·  ${l.hours}h`,
                    })
                  }
                  onMouseLeave={() => onTooltip(null)}
                />
              )
            })}
          </g>
        )
      })}

      {showToday && (
        <g>
          <line x1={todayX} y1={0} x2={todayX} y2={svgH}
            stroke="var(--text-danger)" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={todayX + 4} y={12} fontSize={9} fill="var(--text-danger)" fontWeight={700}>Today</text>
        </g>
      )}

      <line x1={0} y1={GANTT_HEADER_H} x2={svgW} y2={GANTT_HEADER_H}
        stroke="var(--border-primary)" strokeWidth={1} />
    </svg>
  )
}

// ── LoadTemplateModal ─────────────────────────────────────────────────────────

interface LoadTemplateModalProps {
  open: boolean
  templates: PhaseTemplate[]
  currentPhaseCount: number
  onClose: () => void
  onLoad: (phases: Phase[]) => void
}

function LoadTemplateModal({ open, templates, currentPhaseCount, onClose, onLoad }: LoadTemplateModalProps) {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? "")
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"))

  const selected = templates.find(t => t.id === selectedId)
  const templatePhases: PhaseTemplatePhase[] = selected
    ? JSON.parse(selected.phases_json)
    : []

  const totalWeeks = templatePhases.length > 0
    ? Math.max(...templatePhases.map(p => p.offsetWeeks + p.durationWeeks))
    : 0

  function handleLoad() {
    const anchor = parseISO(startDate)
    const phases: Phase[] = templatePhases.map((tp, i) => {
      const s = addWeeks(anchor, tp.offsetWeeks)
      const e = addDays(addWeeks(anchor, tp.offsetWeeks + tp.durationWeeks), -1)
      return {
        id: uuidv4(),
        project_id: "",
        name: tp.name,
        start_date: format(s, "yyyy-MM-dd"),
        end_date: format(e, "yyyy-MM-dd"),
        color: tp.color,
        sort_order: i,
        notes: null,
        created_at: new Date().toISOString(),
      }
    })
    onLoad(phases)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-primary)" }}
      >
        {/* Header */}
        <div className="p-5 border-b" style={{ borderColor: "var(--border-primary)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            Load Phase Template
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Select an engagement type to pre-fill phases
          </p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Template selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Engagement Type
            </label>
            <select
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-input)",
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
              }}
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.template_name}</option>
              ))}
            </select>
          </div>

          {/* Start date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Project Start Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-input)",
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
                colorScheme: "dark",
              }}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          {/* Phase preview */}
          {templatePhases.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Phases Preview ({templatePhases.length} phases · {totalWeeks} weeks total)
              </label>
              <div
                className="rounded-lg border max-h-48 overflow-y-auto"
                style={{ borderColor: "var(--border-primary)" }}
              >
                {templatePhases.map((tp, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 border-b last:border-0"
                    style={{ borderColor: "var(--border-primary)" }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tp.color }} />
                    <span className="text-sm flex-1" style={{ color: "var(--text-primary)" }}>{tp.name}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{tp.durationWeeks}w</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning if replacing */}
          {currentPhaseCount > 0 && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: "color-mix(in srgb, var(--text-warning) 12%, var(--bg-card))",
                border: "1px solid var(--text-warning)",
                color: "var(--text-warning)",
              }}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              This will replace your current {currentPhaseCount} phase{currentPhaseCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 p-4 border-t"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            Load Template
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ScheduleWorkspace (main export) ──────────────────────────────────────────

export function ScheduleWorkspace({
  projectId,
  project,
  initialPhases,
  templates,
  ganttData,
  coverageWarnings,
}: ScheduleWorkspaceProps) {
  const [phases, setPhases] = useState<Phase[]>(initialPhases)
  const [activeView, setActiveView] = useState<"phase" | "resource">("phase")
  const [zoom, setZoom] = useState<"week" | "month" | "quarter">("month")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [warningsOpen, setWarningsOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // DnD setup
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function persistPhases(updated: Phase[]) {
    setSaving(true)
    try {
      await saveProjectPhases(projectId, updated)
    } catch {
      toast.error("Failed to save phases")
    } finally {
      setSaving(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!active || !over || active.id === over.id) return
    setPhases(prev => {
      const oldIdx = prev.findIndex(p => p.id === active.id)
      const newIdx = prev.findIndex(p => p.id === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx).map((p, i) => ({ ...p, sort_order: i }))
      persistPhases(reordered)
      return reordered
    })
  }

  function handleAddPhase() {
    const today = new Date()
    const lastPhase = phases[phases.length - 1]
    const startDate = lastPhase ? format(addDays(parseISO(lastPhase.end_date), 1), "yyyy-MM-dd") : format(today, "yyyy-MM-dd")
    const endDate = format(addWeeks(parseISO(startDate), 2), "yyyy-MM-dd")
    const color = PHASE_COLORS[phases.length % PHASE_COLORS.length]

    const newPhase: Phase = {
      id: uuidv4(),
      project_id: projectId,
      name: `Phase ${phases.length + 1}`,
      start_date: startDate,
      end_date: endDate,
      color,
      sort_order: phases.length,
      notes: null,
      created_at: new Date().toISOString(),
    }
    const updated = [...phases, newPhase]
    setPhases(updated)
    setEditingId(newPhase.id)
    persistPhases(updated)
  }

  function handleSavePhase(id: string, draft: EditDraft) {
    const updated = phases.map(p =>
      p.id === id
        ? { ...p, name: draft.name, start_date: draft.start_date, end_date: draft.end_date, color: draft.color, notes: draft.notes || null }
        : p
    )
    setPhases(updated)
    setEditingId(null)
    persistPhases(updated)
  }

  function handleDeletePhase(id: string) {
    const updated = phases.filter(p => p.id !== id).map((p, i) => ({ ...p, sort_order: i }))
    setPhases(updated)
    if (editingId === id) setEditingId(null)
    persistPhases(updated)
  }

  async function handleLoadTemplate(templatePhases: Phase[]) {
    const withProjectId = templatePhases.map(p => ({ ...p, project_id: projectId }))
    setPhases(withProjectId)
    setShowTemplateModal(false)
    setEditingId(null)
    setSaving(true)
    try {
      await saveProjectPhases(projectId, withProjectId)
      toast.success("Template loaded")
    } catch {
      toast.error("Failed to save phases")
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPng() {
    const el = document.getElementById("gantt-chart-export")
    if (!el) { toast.error("Gantt chart not found"); return }
    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(el, { backgroundColor: "#111827", scale: 2, useCORS: true })
      const link = document.createElement("a")
      link.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}_schedule.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
      toast.success("Schedule exported")
    } catch {
      toast.error("Export failed")
    }
  }

  // Phase summary stats
  const { start: projStart, end: projEnd } = computeProjectBounds(phases)
  const totalProjectWeeks = phases.length > 0 ? Math.ceil((differenceInDays(projEnd, projStart) + 1) / 7) : 0

  // Overlap detection
  const hasOverlaps = useMemo(() => {
    for (let i = 0; i < phases.length; i++) {
      for (let j = i + 1; j < phases.length; j++) {
        if (parseISO(phases[i].start_date) <= parseISO(phases[j].end_date) &&
            parseISO(phases[j].start_date) <= parseISO(phases[i].end_date)) {
          return true
        }
      }
    }
    return false
  }, [phases])

  const zoomLevels: ("week" | "month" | "quarter")[] = ["week", "month", "quarter"]

  // Phase name labels for gantt left column
  const { start: ganttProjStart } = computeProjectBounds(phases)

  return (
    <div className="flex flex-col gap-4 pb-8" style={{ color: "var(--text-primary)" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Project Schedule</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Define project phases and visualize the timeline
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {saving && (
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Saving…</span>
          )}
          <button
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "var(--border-primary)", color: "var(--text-primary)", backgroundColor: "var(--bg-card)" }}
          >
            <Calendar className="h-4 w-4" />
            Load Template
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          <button
            onClick={handleExportPng}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "var(--border-primary)", color: "var(--text-primary)", backgroundColor: "var(--bg-card)" }}
          >
            <ImageIcon className="h-4 w-4" />
            Export PNG
          </button>
        </div>
      </div>

      {/* ── Coverage Warnings ───────────────────────────────────────────────── */}
      {coverageWarnings.length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            border: "1px solid var(--text-warning)",
            backgroundColor: "color-mix(in srgb, var(--text-warning) 8%, var(--bg-card))",
          }}
        >
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
            style={{ color: "var(--text-warning)" }}
            onClick={() => setWarningsOpen(o => !o)}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {coverageWarnings.length} Coverage Warning{coverageWarnings.length !== 1 ? "s" : ""}
            </span>
            {warningsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {warningsOpen && (
            <div className="px-4 pb-3 space-y-1.5">
              {coverageWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-warning)" }}>
                  <span className="mt-0.5">•</span>
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Two-panel layout ────────────────────────────────────────────────── */}
      <div className="flex gap-4 min-h-0" style={{ alignItems: "flex-start" }}>

        {/* Left panel — Phase definitions (40%) */}
        <div
          className="rounded-xl border overflow-hidden shrink-0"
          style={{
            width: "38%",
            minWidth: 280,
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-primary)",
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Phases {phases.length > 0 && <span className="opacity-50">({phases.length})</span>}
            </span>
            <button
              onClick={handleAddPhase}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ backgroundColor: "var(--accent-blue)" }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Phase
            </button>
          </div>

          {/* Phase list */}
          <div className="p-3 space-y-2">
            {phases.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-12 text-sm text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                <Calendar className="h-8 w-8 mb-2 opacity-40" />
                <p className="font-medium">No phases yet</p>
                <p className="text-xs mt-1 opacity-70">Click "Add Phase" or load a template</p>
              </div>
            ) : (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <SortableContext items={phases} strategy={verticalListSortingStrategy}>
                  {phases.map((phase, i) => (
                    <SortablePhaseCard
                      key={phase.id}
                      phase={phase}
                      index={i}
                      isEditing={editingId === phase.id}
                      onEdit={() => setEditingId(phase.id)}
                      onDelete={() => handleDeletePhase(phase.id)}
                      onSave={draft => handleSavePhase(phase.id, draft)}
                      onCancel={() => setEditingId(null)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Phase summary */}
          {phases.length > 0 && (
            <div
              className="border-t px-4 py-3 space-y-1.5"
              style={{ borderColor: "var(--border-primary)" }}
            >
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-secondary)" }}>Total Phases</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{phases.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-secondary)" }}>Project Start</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{format(projStart, "MMM d, yyyy")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-secondary)" }}>Project End</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{format(projEnd, "MMM d, yyyy")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-secondary)" }}>Total Duration</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{totalProjectWeeks} weeks</span>
              </div>
              {hasOverlaps && (
                <div
                  className="flex items-center gap-1.5 text-xs mt-2 pt-2 border-t"
                  style={{ color: "var(--text-secondary)", borderColor: "var(--border-primary)" }}
                >
                  <Info className="h-3 w-3 shrink-0" />
                  Some phases overlap — normal for parallel workstreams
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel — Gantt (60%) */}
        <div
          className="rounded-xl border overflow-hidden flex-1 min-w-0"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-primary)" }}
        >
          {/* Gantt toolbar */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b gap-3 flex-wrap"
            style={{ borderColor: "var(--border-primary)", backgroundColor: "var(--bg-primary)" }}
          >
            {/* View toggle */}
            <div
              className="flex rounded-lg overflow-hidden border"
              style={{ borderColor: "var(--border-primary)" }}
            >
              {[
                { id: "phase" as const, icon: <BarChart2 className="h-3.5 w-3.5" />, label: "Phase Gantt" },
                { id: "resource" as const, icon: <Users className="h-3.5 w-3.5" />, label: "Resource Gantt" },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setActiveView(v.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: activeView === v.id ? "var(--accent-blue)" : "transparent",
                    color: activeView === v.id ? "white" : "var(--text-secondary)",
                  }}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const idx = zoomLevels.indexOf(zoom)
                  if (idx > 0) setZoom(zoomLevels[idx - 1])
                }}
                disabled={zoom === "week"}
                className="p-1.5 rounded border disabled:opacity-30"
                style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {zoomLevels.map(z => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className="px-2 py-1 rounded text-xs font-medium border"
                  style={{
                    backgroundColor: zoom === z ? "var(--accent-blue)" : "transparent",
                    borderColor: "var(--border-primary)",
                    color: zoom === z ? "white" : "var(--text-secondary)",
                  }}
                >
                  {z.charAt(0).toUpperCase() + z.slice(1)}
                </button>
              ))}
              <button
                onClick={() => {
                  const idx = zoomLevels.indexOf(zoom)
                  if (idx < zoomLevels.length - 1) setZoom(zoomLevels[idx + 1])
                }}
                disabled={zoom === "quarter"}
                className="p-1.5 rounded border disabled:opacity-30"
                style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Gantt body — fixed label column + scrollable SVG */}
          <div id="gantt-chart-export" className="flex" style={{ backgroundColor: "var(--bg-card)" }}>
            {/* Fixed label column */}
            {activeView === "phase" && phases.length > 0 && (
              <div
                className="shrink-0 border-r"
                style={{
                  width: GANTT_LABEL_W,
                  borderColor: "var(--border-primary)",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                {/* Header spacer */}
                <div
                  className="border-b"
                  style={{
                    height: GANTT_HEADER_H,
                    borderColor: "var(--border-primary)",
                    backgroundColor: "var(--bg-primary)",
                  }}
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
                      className="text-xs font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                      title={phase.name}
                    >
                      {phase.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeView === "resource" && ganttData.resources.length > 0 && (
              <div
                className="shrink-0 border-r"
                style={{
                  width: GANTT_LABEL_W,
                  borderColor: "var(--border-primary)",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                <div
                  className="border-b"
                  style={{ height: GANTT_HEADER_H, borderColor: "var(--border-primary)", backgroundColor: "var(--bg-primary)" }}
                />
                {ganttData.resources.map((res, i) => (
                  <div
                    key={res.id}
                    className="flex flex-col justify-center px-3"
                    style={{
                      height: RESOURCE_ROW_H,
                      backgroundColor: i % 2 === 0 ? "var(--bg-secondary)" : "var(--bg-card)",
                    }}
                  >
                    <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{res.name}</span>
                    <span className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>{res.role}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Scrollable SVG area */}
            <div className="overflow-x-auto flex-1 min-w-0">
              {activeView === "phase" ? (
                <PhaseGanttSVG phases={phases} zoom={zoom} onTooltip={setTooltip} />
              ) : (
                <ResourceGanttSVG ganttData={ganttData} phases={phases} zoom={zoom} onTooltip={setTooltip} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating Tooltip ────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 40,
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-primary)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <p className="font-semibold">{tooltip.title}</p>
          <p style={{ color: "var(--text-secondary)" }}>{tooltip.sub}</p>
        </div>
      )}

      {/* ── Load Template Modal ──────────────────────────────────────────────── */}
      <LoadTemplateModal
        open={showTemplateModal}
        templates={templates}
        currentPhaseCount={phases.length}
        onClose={() => setShowTemplateModal(false)}
        onLoad={handleLoadTemplate}
      />
    </div>
  )
}
