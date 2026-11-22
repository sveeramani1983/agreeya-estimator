import { getTrackerDashboardData } from "@/lib/actions"
import { Activity, Folder, AlertTriangle, TrendingUp, CheckCircle, PauseCircle, Clock, ChevronRight } from "lucide-react"
import Link from "next/link"
import { differenceInDays, parseISO } from "date-fns"

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n).toLocaleString()}`
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

function BudgetBar({ burned, total }: { burned: number; total: number }) {
  const p = Math.min(100, pct(burned, total))
  const color = p > 100 ? "bg-red-500" : p > 85 ? "bg-amber-500" : "bg-blue-500"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#1E2D45] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{p}%</span>
    </div>
  )
}

const LIFECYCLE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-800 border-gray-700", text: "text-gray-400",  label: "Not Started" },
  in_progress: { bg: "bg-blue-900/40 border-blue-800/60", text: "text-blue-300", label: "In Progress" },
  on_hold:     { bg: "bg-amber-900/40 border-amber-800/60", text: "text-amber-300", label: "On Hold"     },
  completed:   { bg: "bg-green-900/40 border-green-800/60", text: "text-green-300", label: "Completed"   },
}

export default async function TrackerDashboardPage() {
  const data = await getTrackerDashboardData()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Project Tracker</h1>
        <p className="text-sm text-muted-foreground mt-1">Delivery health across your won portfolio</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total",       value: data.total,              icon: <Folder className="h-4 w-4 text-zinc-400" />        },
          { label: "Active",      value: data.active,             icon: <Activity className="h-4 w-4 text-blue-400" />      },
          { label: "Completed",   value: data.completed,          icon: <CheckCircle className="h-4 w-4 text-green-400" />  },
          { label: "On Hold",     value: data.onHold,             icon: <PauseCircle className="h-4 w-4 text-amber-400" />  },
          { label: "At Risk",     value: data.atRisk,             icon: <AlertTriangle className="h-4 w-4 text-red-400" />, highlight: data.atRisk > 0 },
          { label: "Portfolio",   value: fmt(data.totalPortfolioValue), icon: <TrendingUp className="h-4 w-4 text-purple-400" /> },
        ].map(tile => (
          <div key={tile.label} className={`rounded-lg border ${(tile as any).highlight ? "border-red-800/50 bg-red-900/10" : "border-[#1E2D45] bg-[#0D1526]"} p-4`}>
            <div className="flex items-center gap-2 mb-2">{tile.icon}<span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{tile.label}</span></div>
            <p className="text-2xl font-bold text-foreground">{tile.value}</p>
          </div>
        ))}
      </div>

      {/* Portfolio health grid */}
      {data.projects.length === 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-12 text-center">
          <Folder className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold text-muted-foreground">No tracked projects yet</p>
          <p className="text-xs text-muted-foreground mt-1">Mark an estimate as <strong className="text-foreground">Won</strong> in the Estimator to automatically create a tracker project.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2D45] bg-[#0D1526]">
            <p className="text-sm font-semibold text-foreground">Portfolio Overview</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E2D45] bg-[#0D1526]/50">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Project</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Budget</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Planned</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actual Spend</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Schedule</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D45]">
              {data.projects.map((p: any) => {
                const badge = LIFECYCLE_BADGE[p.project_status ?? "not_started"] ?? LIFECYCLE_BADGE.not_started
                let daysInfo: React.ReactNode = <span className="text-muted-foreground">—</span>
                if (p.project_target_end_date) {
                  try {
                    const remaining = differenceInDays(parseISO(p.project_target_end_date), new Date())
                    daysInfo = remaining < 0
                      ? <span className="text-red-400">{Math.abs(remaining)}d overdue</span>
                      : <span className="text-foreground">{remaining}d left</span>
                  } catch {}
                }
                return (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{p.project_name}</p>
                      <p className="text-xs text-muted-foreground">{p.client_name}</p>
                      {(p.billing_overdue > 0 || p.billing_at_risk > 0) && (
                        <Link
                          href={`/tracker/projects/${p.project_id}/billing`}
                          className={`inline-flex items-center gap-1 text-xs mt-0.5 ${p.billing_overdue > 0 ? "text-red-400 hover:text-red-300" : "text-amber-400 hover:text-amber-300"}`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {p.billing_overdue > 0
                            ? `${p.billing_overdue} billing milestone${p.billing_overdue > 1 ? "s" : ""} overdue`
                            : `${p.billing_at_risk} billing milestone${p.billing_at_risk > 1 ? "s" : ""} at risk`}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <BudgetBar burned={p.total_actual_cost} total={p.baseline_total_cost || 0} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{fmt(p.baseline_total_cost || 0)}</td>
                    <td className="px-4 py-3 tabular-nums">{fmt(p.total_actual_cost)}</td>
                    <td className="px-4 py-3">{daysInfo}</td>
                    <td className="px-4 py-3">
                      <Link href={`/tracker/projects/${p.project_id}/overview`} className="text-primary hover:underline flex items-center gap-1 text-xs font-medium">
                        View <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
