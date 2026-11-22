import { getTrackerProjects } from "@/lib/actions"
import { Activity, Folder, ChevronRight, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { differenceInDays, parseISO, format } from "date-fns"
import { TrackerProjectRow } from "@/lib/types"

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n).toLocaleString()}`
}

const LIFECYCLE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-100 dark:bg-gray-800",  text: "text-gray-600 dark:text-gray-400", label: "Not Started" },
  in_progress: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "In Progress" },
  on_hold:     { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", label: "On Hold"     },
  completed:   { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", label: "Completed"   },
}

export default async function TrackerProjectsPage() {
  const projects = await getTrackerProjects()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Active Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">{projects.length} project{projects.length !== 1 ? "s" : ""} in tracker</p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-12 text-center">
          <Folder className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold text-muted-foreground">No tracked projects</p>
          <p className="text-xs text-muted-foreground mt-1">
            Mark an estimate as <strong className="text-foreground">Won</strong> in the Estimator to automatically add it here.
          </p>
          <Link href="/projects" className="inline-block mt-4 text-sm text-primary hover:underline">
            Go to Estimator →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p: TrackerProjectRow) => {
            const badge = LIFECYCLE_BADGE[p.project_status ?? "not_started"] ?? LIFECYCLE_BADGE.not_started
            let daysRemaining: number | null = null
            let isOverdue = false
            if (p.project_target_end_date) {
              try {
                daysRemaining = differenceInDays(parseISO(p.project_target_end_date), new Date())
                isOverdue = daysRemaining < 0
              } catch {}
            }

            let progressPct = 0
            if (p.project_start_date && p.project_target_end_date) {
              try {
                const total = differenceInDays(parseISO(p.project_target_end_date), parseISO(p.project_start_date))
                const elapsed = differenceInDays(new Date(), parseISO(p.project_start_date))
                progressPct = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0
              } catch {}
            }

            return (
              <Link
                key={p.id}
                href={`/tracker/projects/${p.project_id}/overview`}
                className="block rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5 hover:border-blue-800/60 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{p.project_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.client_name}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                  {isOverdue && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      {Math.abs(daysRemaining!)}d overdue
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Budget: {fmt(p.baseline_total_cost || 0)}</span>
                    {daysRemaining !== null && !isOverdue && (
                      <span>{daysRemaining}d remaining</span>
                    )}
                  </div>
                  {progressPct > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Timeline progress</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-[#1E2D45] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isOverdue ? "bg-red-500" : "bg-blue-500"}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Tracked since {format(new Date(p.kicked_off_at), "MMM d, yyyy")}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
