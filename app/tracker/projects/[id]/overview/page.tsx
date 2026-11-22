import { getProject, getTrackerProject, getPeriodBurns, getHealthSnapshots, getChangeRequests, getTrackerSchedule, getBillingMilestones } from "@/lib/actions"
import { getComponentHealthSummary } from "@/lib/tracker-actions"
import { notFound } from "next/navigation"
import { differenceInDays, parseISO, format } from "date-fns"
import { Activity, AlertTriangle, CheckCircle, CreditCard, DollarSign, GitPullRequest, Layers, LayoutList } from "lucide-react"
import Link from "next/link"
import { TrackerScheduleSection } from "@/components/tracker-schedule-section"

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

function BudgetHealthBadge({ burnPct }: { burnPct: number }) {
  if (burnPct > 100) return <span className="inline-flex items-center gap-1 text-red-400 text-sm font-semibold"><AlertTriangle className="h-4 w-4" /> Over Budget</span>
  if (burnPct > 85)  return <span className="inline-flex items-center gap-1 text-amber-400 text-sm font-semibold"><AlertTriangle className="h-4 w-4" /> At Risk</span>
  return <span className="inline-flex items-center gap-1 text-green-400 text-sm font-semibold"><CheckCircle className="h-4 w-4" /> On Track</span>
}

export default async function TrackerOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, trackerProject] = await Promise.all([getProject(id), getTrackerProject(id)])
  if (!project || !trackerProject) notFound()

  const [periodBurns, snapshots, changeRequests, schedulePhases, componentHealth, billingMilestones] = await Promise.all([
    getPeriodBurns(trackerProject.id),
    getHealthSnapshots(trackerProject.id),
    getChangeRequests(trackerProject.id),
    getTrackerSchedule(id),
    getComponentHealthSummary(trackerProject.id, id),
    getBillingMilestones(id),
  ])

  // Financial KPIs
  const blendedRate = (trackerProject.baseline_total_hours ?? 0) > 0
    ? (trackerProject.baseline_total_cost ?? 0) / (trackerProject.baseline_total_hours ?? 1) : 0
  const totalActual = periodBurns.filter(b => b.is_submitted).reduce((s, b) => s + b.total_hours, 0) * blendedRate
  const baseline = trackerProject.baseline_total_cost || 0
  const remaining = Math.max(0, baseline - totalActual)
  const burnPct = pct(totalActual, baseline)

  // Billing KPIs
  const totalContract = trackerProject.baseline_total_cost || 0
  const billingInvoiced = billingMilestones
    .filter(m => m.invoice_status === 'invoiced' || m.invoice_status === 'overdue' || m.invoice_status === 'paid')
    .reduce((s, m) => s + m.amount, 0)
  const billingCollected = billingMilestones
    .filter(m => m.invoice_status === 'paid')
    .reduce((s, m) => s + m.amount, 0)
  const billingOverdue = billingMilestones.filter(m => {
    if (m.invoice_status !== 'invoiced') return false
    if (!m.planned_date) return false
    const due = new Date(m.planned_date + "T12:00:00")
    due.setDate(due.getDate() + (m.payment_terms ?? 30))
    return new Date() > due
  })
  const nextUnpaid = billingMilestones.find(m => m.invoice_status === 'not_invoiced' && m.planned_date)

  // Date-based milestone alerts (not yet invoiced, past or near planned/revised date)
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const milestoneDateAlerts = billingMilestones.filter(m => {
    if (m.invoice_status === 'invoiced' || m.invoice_status === 'paid') return false
    const planned = m.planned_date ? new Date(m.planned_date) : null
    if (!planned) return false
    const revised = (m as any).revised_date ? new Date((m as any).revised_date) : null
    if (revised && todayMidnight > revised) return true
    if (!revised && todayMidnight > planned) return true
    const activeDate = revised ?? planned
    return activeDate.getTime() - todayMidnight.getTime() <= sevenDaysMs
  })
  const milestoneOverdueCount = milestoneDateAlerts.filter(m => {
    const planned = m.planned_date ? new Date(m.planned_date) : null
    if (!planned) return false
    const revised = (m as any).revised_date ? new Date((m as any).revised_date) : null
    if (revised && todayMidnight > revised) return true
    if (!revised && todayMidnight > planned) return true
    return false
  }).length
  const milestoneAtRiskCount = milestoneDateAlerts.length - milestoneOverdueCount

  const latestSnapshot = snapshots[0]
  const openChanges = changeRequests.filter(c => c.status === "open")
  const approvedChangesCost = changeRequests.filter(c => c.status === "approved").reduce((s, c) => s + (c.impact_cost || 0), 0)

  // Schedule KPIs (high-level start/end from project fields)
  let daysRemaining: number | null = null
  let isOverdue = false
  let progressPct = 0
  if (project.project_start_date && project.project_target_end_date) {
    try {
      daysRemaining = differenceInDays(parseISO(project.project_target_end_date), new Date())
      isOverdue = daysRemaining < 0
      const total   = differenceInDays(parseISO(project.project_target_end_date), parseISO(project.project_start_date))
      const elapsed = differenceInDays(new Date(), parseISO(project.project_start_date))
      progressPct = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0
    } catch {}
  }

  // Phase Progress tile ──────────────────────────────────────────────────────
  const totalPhases = schedulePhases.length
  const activePhase = schedulePhases.find(p => p.status === "active")
  const completedCount = schedulePhases.filter(p => p.status === "complete").length

  let phaseValue = "—"
  let phaseSub   = "No phases defined"
  let phaseColor = "text-muted-foreground"

  if (totalPhases > 0) {
    if (activePhase) {
      const activeIdx = schedulePhases.indexOf(activePhase) + 1
      phaseValue = `${activeIdx} of ${totalPhases}`
      phaseSub   = activePhase.name
      const today    = new Date().toISOString().split("T")[0]
      const daysLeft = differenceInDays(parseISO(activePhase.end_date), parseISO(today))
      phaseColor = daysLeft < 0 ? "text-red-400" : daysLeft <= 5 ? "text-amber-400" : "text-green-400"
    } else if (completedCount === totalPhases) {
      phaseValue = "All Done"
      phaseSub   = `${totalPhases} phases complete`
      phaseColor = "text-green-400"
    } else {
      phaseValue = `${completedCount} of ${totalPhases}`
      phaseSub   = "phases complete"
      phaseColor = "text-foreground"
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── KPI tiles (5-up) ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-blue-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Baseline Budget</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(baseline)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Locked at win</p>
        </div>

        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actual Spend</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(totalActual)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{burnPct}% burned</p>
        </div>

        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Remaining</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(remaining)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{baseline > 0 ? `${100 - burnPct}% left` : "—"}</p>
        </div>

        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
          <div className="flex items-center gap-2 mb-2">
            <GitPullRequest className="h-4 w-4 text-purple-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Approved Changes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(approvedChangesCost)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{changeRequests.filter(c => c.status === "approved").length} CRs</p>
        </div>

        {/* Phase Progress */}
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-sky-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phase Progress</span>
          </div>
          <p className={`text-2xl font-bold ${phaseColor}`}>{phaseValue}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate" title={phaseSub}>{phaseSub}</p>
        </div>
      </div>

      {/* ── Budget health bar ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Budget Health</p>
          <BudgetHealthBadge burnPct={burnPct} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(totalActual)} spent</span>
            <span>{fmt(baseline)} planned</span>
          </div>
          <div className="h-2 rounded-full bg-[#1E2D45] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${burnPct > 100 ? "bg-red-500" : burnPct > 85 ? "bg-amber-500" : "bg-blue-500"}`}
              style={{ width: `${Math.min(100, burnPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── High-level schedule (start/end dates from project fields) ─────── */}
      {project.project_start_date && project.project_target_end_date && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Schedule</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Start</p>
              <p className="font-medium">{format(parseISO(project.project_start_date), "MMM d, yyyy")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Target End</p>
              <p className="font-medium">{format(parseISO(project.project_target_end_date), "MMM d, yyyy")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Remaining</p>
              <p className={`font-semibold ${isOverdue ? "text-red-400" : "text-foreground"}`}>
                {daysRemaining === null ? "—" : isOverdue ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d`}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{progressPct}% elapsed</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#1E2D45] overflow-hidden">
              <div
                className={`h-full rounded-full ${isOverdue ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Project Schedule (phase-level, read-only Gantt) ────────────────── */}
      <TrackerScheduleSection phases={schedulePhases} estimatorProjectId={id} />

      {/* ── Component Health ──────────────────────────────────────────────── */}
      {componentHealth.total > 0 && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-sky-400" />
              <p className="text-sm font-semibold text-foreground">Component Health</p>
            </div>
            <Link href={`/tracker/projects/${id}/comparison`} className="text-xs text-primary hover:underline">
              View Full Breakdown →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: "✅", label: "Complete",    value: componentHealth.complete,    color: "text-green-400" },
              { icon: "🔴", label: "At Risk",     value: componentHealth.atRisk,      color: "text-red-400"   },
              { icon: "🔄", label: "In Progress", value: componentHealth.inProgress,  color: "text-blue-400"  },
              { icon: "⏳", label: "Not Started", value: componentHealth.notStarted,  color: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-base">{s.icon}</span>
                <div>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          {componentHealth.topAtRisk.length > 0 && (
            <div className="pt-2 border-t border-[#1E2D45] space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Most At Risk</p>
              {componentHealth.topAtRisk.map(r => (
                <div key={r.name} className="flex justify-between text-xs">
                  <span className="text-foreground truncate mr-2">{r.name}</span>
                  <span className="text-red-400 shrink-0 tabular-nums">+{Math.round(r.variancePct)}% over estimate</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Billing Summary ───────────────────────────────────────────────── */}
      {billingMilestones.length > 0 && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-400" />
              <p className="text-sm font-semibold text-foreground">Billing</p>
            </div>
            <Link href={`/tracker/projects/${id}/billing`} className="text-xs text-primary hover:underline">
              View Billing →
            </Link>
          </div>

          {billingOverdue.length > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-red-900/20 border border-red-800/40 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">
                {billingOverdue.length} invoice{billingOverdue.length > 1 ? "s" : ""} overdue
              </p>
            </div>
          )}

          {milestoneDateAlerts.length > 0 && (
            <Link
              href={`/tracker/projects/${id}/billing`}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 transition-colors hover:opacity-80 ${
                milestoneOverdueCount > 0
                  ? "bg-red-900/20 border-red-800/40"
                  : "bg-amber-900/20 border-amber-800/40"
              }`}
            >
              <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${milestoneOverdueCount > 0 ? "text-red-400" : "text-amber-400"}`} />
              <p className={`text-xs flex-1 ${milestoneOverdueCount > 0 ? "text-red-300" : "text-amber-300"}`}>
                {milestoneOverdueCount > 0 && `${milestoneOverdueCount} milestone${milestoneOverdueCount > 1 ? "s" : ""} overdue`}
                {milestoneOverdueCount > 0 && milestoneAtRiskCount > 0 && ", "}
                {milestoneAtRiskCount > 0 && `${milestoneAtRiskCount} at risk`}
                {" — "}View Billing →
              </p>
            </Link>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Invoiced</p>
              <p className="font-semibold text-foreground text-sm">{fmt(billingInvoiced)}</p>
              <p className="text-[10px] text-muted-foreground">
                {totalContract > 0 ? `${Math.round((billingInvoiced / totalContract) * 100)}% of contract` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Collected</p>
              <p className="font-semibold text-green-400 text-sm">{fmt(billingCollected)}</p>
              <p className="text-[10px] text-muted-foreground">
                {billingMilestones.filter(m => m.invoice_status === 'paid').length} paid
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Next Invoice</p>
              {nextUnpaid ? (
                <>
                  <p className="font-semibold text-foreground text-sm">{fmt(nextUnpaid.amount)}</p>
                  <p className="text-[10px] text-muted-foreground">{nextUnpaid.title}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{fmt(billingCollected)} collected</span>
              <span>{fmt(totalContract)} contract value</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#1E2D45] overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, totalContract > 0 ? Math.round((billingCollected / totalContract) * 100) : 0)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom grid: health check + open CRs ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latest health check */}
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Latest Health Check</p>
          {latestSnapshot ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{format(parseISO(latestSnapshot.snapshot_date), "MMM d, yyyy")}</p>
              {[
                { label: "Schedule", value: latestSnapshot.schedule_status as string },
                { label: "Budget",   value: latestSnapshot.budget_status   as string },
                { label: "Scope",    value: latestSnapshot.scope_status    as string },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className={`font-medium capitalize ${row.value === "on_track" ? "text-green-400" : row.value.includes("risk") || row.value.includes("pending") ? "text-amber-400" : "text-red-400"}`}>
                    {row.value.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
              {latestSnapshot.percent_complete != null && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">% Complete</span>
                  <span className="font-medium text-foreground">{latestSnapshot.percent_complete}%</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No health checks recorded yet.</p>
          )}
        </div>

        {/* Open change requests */}
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Open Change Requests</p>
            <Link href={`/tracker/projects/${id}/reports`} className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {openChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open change requests.</p>
          ) : (
            <div className="space-y-2">
              {openChanges.slice(0, 4).map(cr => (
                <div key={cr.id} className="flex justify-between items-start text-sm gap-2">
                  <p className="text-foreground truncate">{cr.title}</p>
                  {cr.impact_cost != null && (
                    <span className="text-xs text-amber-400 shrink-0">{fmt(cr.impact_cost)}</span>
                  )}
                </div>
              ))}
              {openChanges.length > 4 && (
                <p className="text-xs text-muted-foreground">+{openChanges.length - 4} more</p>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
