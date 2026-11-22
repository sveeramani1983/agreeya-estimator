import { getProject, getTrackerProject, getPeriodBurns } from "@/lib/actions"
import { notFound } from "next/navigation"
import { TrackerBurnRateChart } from "@/components/tracker-burn-rate-chart"

function formatPeriodLabel(period: string): string {
  if (period.length === 7) {
    const [y, m] = period.split("-")
    return new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  if (period.length === 10) {
    const d = new Date(period + "T00:00:00")
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }
  return period
}

function computePlannedSeries(snapshot: any): { period: string; label: string; planned: number; plannedCumulative: number }[] {
  const { resourceLoading = [], resources = [], commercialsConfig } = snapshot
  const rateMap: Record<string, number> = {}
  for (const r of resources) rateMap[r.id] = r.rate_per_hour || 0
  const marginMult = (commercialsConfig && !commercialsConfig.rates_include_margin && commercialsConfig.margin_percent > 0)
    ? 1 + commercialsConfig.margin_percent / 100 : 1

  const byPeriod: Record<string, number> = {}
  for (const rl of resourceLoading) {
    if (!rl.hours || rl.hours <= 0) continue
    const cost = rl.hours * (rateMap[rl.resource_id] || 0) * marginMult
    byPeriod[rl.period_label] = (byPeriod[rl.period_label] || 0) + cost
  }

  const periods = Object.keys(byPeriod).sort()
  let cumulative = 0
  return periods.map(p => {
    cumulative += byPeriod[p]
    return { period: p, label: formatPeriodLabel(p), planned: Math.round(byPeriod[p]), plannedCumulative: Math.round(cumulative) }
  })
}

export default async function BurnRatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, trackerProject] = await Promise.all([getProject(id), getTrackerProject(id)])
  if (!project || !trackerProject) notFound()

  let snapshot: any = {}
  try { snapshot = JSON.parse(trackerProject.baseline_snapshot) } catch {}

  const periodBurns = await getPeriodBurns(trackerProject.id)
  const submittedBurns = periodBurns.filter(b => b.is_submitted)

  const blendedRate = (trackerProject.baseline_total_hours ?? 0) > 0
    ? (trackerProject.baseline_total_cost ?? 0) / (trackerProject.baseline_total_hours ?? 1)
    : 0

  const plannedSeries = computePlannedSeries(snapshot)

  // Build actual cost map from period_burns (submitted only)
  const actualsMap: Record<string, number> = {}
  for (const b of submittedBurns) {
    actualsMap[b.period_start] = b.total_hours * blendedRate
  }

  // Merge all unique periods
  const allPeriods = Array.from(new Set([
    ...plannedSeries.map(p => p.period),
    ...submittedBurns.map(b => b.period_start),
  ])).sort()

  let plannedCum = 0
  let actualCum = 0
  const chartData = allPeriods.map(period => {
    const plannedEntry = plannedSeries.find(p => p.period === period)
    const planned = plannedEntry?.planned ?? 0
    const actual = actualsMap[period] != null ? actualsMap[period] : null
    plannedCum += planned
    if (actual != null) actualCum += actual

    const burn = submittedBurns.find(b => b.period_start === period)
    return {
      period,
      label: burn?.period_label ?? formatPeriodLabel(period),
      planned: Math.round(planned),
      actual: actual != null ? Math.round(actual) : null,
      plannedCumulative: Math.round(plannedCum),
      actualCumulative: actual != null ? Math.round(actualCum) : null,
    }
  })

  const quotedPrice = trackerProject.baseline_total_cost ?? 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Burn Rate</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Planned spend from baseline vs actual spend computed from submitted period burns.</p>
      </div>

      {chartData.length === 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-10 text-center">
          <p className="text-sm text-muted-foreground">No period data available.</p>
          <p className="text-xs text-muted-foreground mt-1">Populate Resources in the Estimator and submit periods in Actuals Entry.</p>
        </div>
      ) : (
        <TrackerBurnRateChart data={chartData} quotedPrice={quotedPrice} />
      )}
    </div>
  )
}
