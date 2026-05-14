"use client"

import { format, parseISO, differenceInDays } from "date-fns"
import { Activity } from "lucide-react"

import { BurnRateChart } from "@/components/burn-rate-chart"
import { AccuracyChart } from "@/components/accuracy-chart"
import { Project, WBSComponentWithActual, PeriodCost, ProjectLifecycleStatus } from "@/lib/types"

interface ProjectHealthProps {
  project: Project
  wbsComponents: WBSComponentWithActual[]
  burnRateData: PeriodCost[]
  quotedPrice: number
}

type HealthStatus = "on_track" | "at_risk" | "over_budget"

const BANNER: Record<HealthStatus, { bg: string; text: string; label: string }> = {
  on_track:    { bg: "bg-green-900/20 border-green-800/50",  text: "text-green-300",  label: "🟢 On Track — burn rate within budget and actuals within estimate" },
  at_risk:     { bg: "bg-amber-900/20 border-amber-800/50",  text: "text-amber-300",  label: "🟡 At Risk — burn rate approaching budget or actuals slightly over estimate" },
  over_budget: { bg: "bg-red-900/20   border-red-800/50",    text: "text-red-300",    label: "🔴 Over Budget — actuals exceeding estimate or burn rate past budget" },
}

const LIFECYCLE_BADGE: Record<ProjectLifecycleStatus, { bg: string; text: string }> = {
  not_started: { bg: "bg-gray-100",   text: "text-gray-600"  },
  in_progress: { bg: "bg-blue-100",   text: "text-blue-700"  },
  on_hold:     { bg: "bg-amber-100",  text: "text-amber-700" },
  completed:   { bg: "bg-green-100",  text: "text-green-700" },
}

const LIFECYCLE_LABELS: Record<ProjectLifecycleStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold:     "On Hold",
  completed:   "Completed",
}

function ScheduleCard({ project }: { project: Project }) {
  const start = project.project_start_date
  const end   = project.project_target_end_date
  if (!start || !end) return null

  const startDate = parseISO(start)
  const endDate   = parseISO(end)
  const today     = new Date()
  const total     = differenceInDays(endDate, startDate)
  const elapsed   = differenceInDays(today, startDate)
  const progressPct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0
  const daysRemaining = differenceInDays(endDate, today)
  const isOverdue = daysRemaining < 0

  return (
    <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Schedule Reference</p>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Start</p>
          <p className="font-medium text-foreground">{format(startDate, "MMM d, yyyy")}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Target End</p>
          <p className="font-medium text-foreground">{format(endDate, "MMM d, yyyy")}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Remaining</p>
          <p className={`font-semibold ${isOverdue ? "text-red-400" : "text-foreground"}`}>
            {isOverdue ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{Math.round(progressPct)}% elapsed</span>
          <span>{total} day{total !== 1 ? "s" : ""} total</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#1E2D45] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isOverdue ? "bg-red-500" : "bg-blue-500"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function ProjectHealth({ project, wbsComponents, burnRateData, quotedPrice }: ProjectHealthProps) {
  // Only visible when estimate is Won
  if (project.status !== "won") return null

  const ps: ProjectLifecycleStatus = project.project_status ?? "not_started"

  // Not Started — muted placeholder
  if (ps === "not_started") {
    return (
      <div className="max-w-4xl mx-auto mt-8 rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-10 text-center print:hidden">
        <Activity className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="font-semibold text-muted-foreground">Project Health · Not Started</p>
        <p className="text-xs text-muted-foreground mt-1">
          Set Project Status to <strong className="text-foreground">In Progress</strong> to begin tracking burn rate, actuals, and delivery health.
        </p>
      </div>
    )
  }

  const isArchived = ps === "on_hold" || ps === "completed"

  // Health derivation
  const lastCumulative = burnRateData.length > 0 ? burnRateData[burnRateData.length - 1].cumulative : 0
  const burnPct = quotedPrice > 0 ? (lastCumulative / quotedPrice) * 100 : 0
  const burnHealth: HealthStatus = burnPct <= 85 ? "on_track" : burnPct <= 100 ? "at_risk" : "over_budget"

  const withActuals = wbsComponents.filter(c => c.actual_hours != null && c.base_hours > 0)
  const hasActuals  = withActuals.length > 0
  let accuracyHealth: HealthStatus = "on_track"
  if (hasActuals) {
    const totalEst = withActuals.reduce((s, c) => s + c.base_hours, 0)
    const totalAct = withActuals.reduce((s, c) => s + (c.actual_hours ?? 0), 0)
    const pct = totalEst > 0 ? (totalAct / totalEst) * 100 : 0
    accuracyHealth = pct <= 100 ? "on_track" : pct <= 120 ? "at_risk" : "over_budget"
  }

  const overall: HealthStatus = isArchived ? "on_track"
    : [burnHealth, accuracyHealth].includes("over_budget") ? "over_budget"
    : [burnHealth, accuracyHealth].includes("at_risk") ? "at_risk"
    : "on_track"

  const badge = LIFECYCLE_BADGE[ps]
  const banner = BANNER[overall]

  return (
    <div className={`max-w-4xl mx-auto mt-8 space-y-6 print:hidden ${isArchived ? "opacity-80" : ""}`}>
      {/* Section header */}
      <div className="flex items-center gap-3 border-b border-[#1E2D45] pb-3">
        <Activity className="h-5 w-5 text-primary shrink-0" />
        <h2 className="text-xl font-bold text-foreground">Project Health</h2>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}>
          {LIFECYCLE_LABELS[ps]}
        </span>
        {isArchived && (
          <span className="text-xs text-muted-foreground ml-1">(read-only)</span>
        )}
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${banner.bg}`}>
        <p className={`text-sm font-semibold ${banner.text}`}>{banner.label}</p>
      </div>

      {/* Schedule reference card */}
      <ScheduleCard project={project} />

      {/* Burn Rate & Cash Flow */}
      {burnRateData.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Burn Rate & Cash Flow</p>
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <BurnRateChart data={burnRateData} quotedPrice={isArchived ? undefined : quotedPrice} />
          </div>
        </div>
      )}

      {/* Estimation Accuracy */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estimation Accuracy</p>
        <AccuracyChart components={wbsComponents} />
      </div>
    </div>
  )
}
