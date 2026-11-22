import Link from "next/link"
import { FileText, Activity, TrendingUp, ArrowRight, CheckCircle2, AlertCircle, FileSearch } from "lucide-react"
import type {
  EstimatorStats,
  TrackerStats,
  PipelineStats,
  HomepageAlert,
  ActivityItem,
} from "@/lib/homepage-actions"

function getGreeting(hour: number): string {
  if (hour >= 6 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 17) return "Good afternoon"
  if (hour >= 17 && hour < 21) return "Good evening"
  return "Working late"
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—"
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

interface Props {
  firstName: string | null
  estimatorStats: EstimatorStats
  trackerStats: TrackerStats
  pipelineStats: PipelineStats
  alerts: HomepageAlert[]
  recentActivity: ActivityItem[]
}

export function Homepage({ firstName, estimatorStats, trackerStats, pipelineStats, alerts, recentActivity }: Props) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = getGreeting(hour)
  const displayName = firstName ? `, ${firstName}` : ""

  const redAlerts = alerts.filter(a => a.severity === 'red')
  const amberAlerts = alerts.filter(a => a.severity === 'amber')

  return (
    <div className="space-y-10 pb-10">

      {/* ── Greeting ── */}
      <div>
        <h1 className="text-4xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
          {greeting}{displayName}.
        </h1>
        <p className="mt-1 text-base" style={{ color: "var(--text-secondary)" }}>
          {formatDate(now)}
        </p>
      </div>

      {/* ── Three workspace cards ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Estimator card */}
        <Link href="/estimator" className="group block rounded-xl border p-6 transition-all duration-200 hover:-translate-y-0.5" style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-primary)",
          borderTopWidth: 3,
          borderTopColor: "#2563EB",
        }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(37,99,235,0.12)" }}>
              <FileText className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Estimator</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Quotes, bids and proposals</p>
            </div>
          </div>
          <div className="space-y-2 mb-5">
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Active Estimates</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{estimatorStats.activeEstimates}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Submitted</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{estimatorStats.submitted}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Due This Week</span>
              <span className="font-bold" style={{ color: estimatorStats.dueThisWeek > 0 ? "#D97706" : "var(--text-primary)" }}>
                {estimatorStats.dueThisWeek}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-500 group-hover:gap-3 transition-all">
            Open Estimator <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        {/* Tracker card */}
        <Link href="/tracker" className="group block rounded-xl border p-6 transition-all duration-200 hover:-translate-y-0.5" style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-primary)",
          borderTopWidth: 3,
          borderTopColor: "#059669",
        }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(5,150,105,0.12)" }}>
              <Activity className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Project Tracker</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Delivery and actuals</p>
            </div>
          </div>
          <div className="space-y-2 mb-5">
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Active Projects</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{trackerStats.activeProjects}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>🔴 At Risk</span>
              <span className="font-bold" style={{ color: trackerStats.atRisk > 0 ? "#DC2626" : "var(--text-primary)" }}>
                {trackerStats.atRisk}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>🟡 Needs Attention</span>
              <span className="font-bold" style={{ color: trackerStats.needsAttention > 0 ? "#D97706" : "var(--text-primary)" }}>
                {trackerStats.needsAttention}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>🟢 On Track</span>
              <span className="font-bold" style={{ color: trackerStats.onTrack > 0 ? "#059669" : "var(--text-primary)" }}>
                {trackerStats.onTrack}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-500 group-hover:gap-3 transition-all">
            Open Tracker <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        {/* Pipeline card */}
        <Link href="/pipeline" className="group block rounded-xl border p-6 transition-all duration-200 hover:-translate-y-0.5" style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-primary)",
          borderTopWidth: 3,
          borderTopColor: "#7C3AED",
        }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(124,58,237,0.12)" }}>
              <TrendingUp className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Pipeline</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Pursuit and revenue forecast</p>
            </div>
          </div>
          <div className="space-y-2 mb-5">
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Active Pursuits</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{pipelineStats.activePursuits}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Total Value</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(pipelineStats.totalValue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Weighted Forecast</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(pipelineStats.weightedForecast)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Win Rate YTD</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{pipelineStats.winRateYTD}%</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-violet-500 group-hover:gap-3 transition-all">
            Open Pipeline <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      </div>

      {/* ── Quick Actions ── */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "+ New Estimate", href: "/estimator" },
          { label: "+ New Project", href: "/projects" },
          { label: "Analyze RFP", href: "/intelligence/rfp-analyzer", icon: FileSearch },
          { label: "View Pipeline", href: "/pipeline" },
        ].map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all hover:border-blue-500 hover:text-blue-400"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* ── Bottom two-column layout ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Needs Attention */}
        <div className="rounded-xl border p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>
            Needs Your Attention
          </p>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "#059669" }}>
              <CheckCircle2 className="h-4 w-4" />
              Everything is on track.
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <Link
                  key={i}
                  href={alert.url}
                  className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--bg-card-hover)] group"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertCircle
                      className="h-4 w-4 mt-0.5 shrink-0"
                      style={{ color: alert.severity === 'red' ? '#DC2626' : '#D97706' }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {alert.projectName}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{alert.text}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{timeAgo(alert.date)}</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-secondary)" }} />
                  </div>
                </Link>
              ))}
              {(redAlerts.length > 0 || amberAlerts.length > 0) && (
                <p className="text-[11px] pt-1 pl-1" style={{ color: "var(--text-secondary)" }}>
                  {redAlerts.length} critical · {amberAlerts.length} advisory
                </p>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div className="rounded-xl border p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>
              Recent Activity
            </p>
            <div className="space-y-1">
              {recentActivity.map((item, i) => (
                <Link
                  key={i}
                  href={item.url}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--bg-card-hover)] group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {item.projectName}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.action}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{timeAgo(item.timestamp)}</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-secondary)" }} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
