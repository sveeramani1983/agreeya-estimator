import { getTrackerDashboardData } from "@/lib/actions"
import { getComponentAccuracyByCategory, getCalibrationSuggestions } from "@/lib/tracker-actions"
import { TrackerPortfolioCharts } from "@/components/tracker-portfolio-charts"
import { CalibrateLibraryButton } from "@/components/tracker-calibrate-modal"

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n).toLocaleString()}`
}

function fmtH(n: number) { return `${Math.round(n * 10) / 10} hrs` }

function varBadge(pct: number) {
  if (pct > 15) return <span className="text-red-400 font-medium">+{pct}% 🔴</span>
  if (pct < -15) return <span className="text-green-400 font-medium">{pct}% 🟢</span>
  if (pct > 0)  return <span className="text-amber-400 font-medium">+{pct}% 🟡</span>
  if (pct < 0)  return <span className="text-green-400 font-medium">{pct}% 🟢</span>
  return <span className="text-muted-foreground">0%</span>
}

export default async function PortfolioAnalyticsPage() {
  const [data, accuracyByCategory, calibrationSuggestions] = await Promise.all([
    getTrackerDashboardData(),
    getComponentAccuracyByCategory(),
    getCalibrationSuggestions(),
  ])

  const totalSpendRatio = data.totalPortfolioValue > 0
    ? Math.round((data.totalActualSpend / data.totalPortfolioValue) * 100)
    : 0

  const statusBreakdown = [
    { name: "Not Started", value: data.notStarted,  fill: "#6B7280" },
    { name: "In Progress", value: data.active,       fill: "#2563EB" },
    { name: "On Hold",     value: data.onHold,       fill: "#D97706" },
    { name: "Completed",   value: data.completed,    fill: "#10B981" },
  ].filter(s => s.value > 0)

  const budgetBands = [
    { label: "Under 50%",    count: data.projects.filter((p: any) => p.budget_pct < 50).length,                     fill: "#10B981" },
    { label: "50–85%",       count: data.projects.filter((p: any) => p.budget_pct >= 50 && p.budget_pct <= 85).length, fill: "#2563EB" },
    { label: "85–100%",      count: data.projects.filter((p: any) => p.budget_pct > 85 && p.budget_pct <= 100).length, fill: "#D97706" },
    { label: "Over Budget",  count: data.projects.filter((p: any) => p.budget_pct > 100).length,                    fill: "#EF4444" },
  ].filter(b => b.count > 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portfolio Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Cross-project delivery intelligence</p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Portfolio Value",    value: fmt(data.totalPortfolioValue), sub: `${data.total} projects` },
          { label: "Total Actual Spend", value: fmt(data.totalActualSpend),    sub: `${totalSpendRatio}% of portfolio` },
          { label: "Remaining Budget",   value: fmt(Math.max(0, data.totalPortfolioValue - data.totalActualSpend)), sub: "Unspent baseline" },
          { label: "Projects at Risk",   value: data.atRisk, sub: "85%+ budget burned", highlight: data.atRisk > 0 },
        ].map(t => (
          <div key={t.label} className={`rounded-lg border ${'highlight' in t && t.highlight && t.value > 0 ? "border-red-800/50 bg-red-900/10" : "border-[#1E2D45] bg-[#0D1526]"} p-4`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t.label}</p>
            <p className="text-2xl font-bold text-foreground">{t.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      {data.total === 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">No data yet. Track your first project to see portfolio analytics.</p>
        </div>
      ) : (
        <>
          <TrackerPortfolioCharts
            statusBreakdown={statusBreakdown}
            budgetBands={budgetBands}
            projects={data.projects}
          />

          {/* Component Accuracy by Category */}
          {accuracyByCategory.length > 0 && (
            <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D45]">
                <div>
                  <p className="text-sm font-semibold text-foreground">Component Accuracy by Category</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Average estimate vs actual hours across all tracked projects</p>
                </div>
                <CalibrateLibraryButton suggestions={calibrationSuggestions} />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
                    <th className="text-left px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Component Category</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Avg Est</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Avg Actual</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Variance</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sample Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45]">
                  {accuracyByCategory.map(row => (
                    <tr key={row.category} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3 font-medium text-foreground">{row.category}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmtH(row.avgEst)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-foreground">{fmtH(row.avgActual)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{varBadge(row.variancePct)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{row.sampleCount} components</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
