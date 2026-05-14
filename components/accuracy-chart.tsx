"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { WBSComponentWithActual } from "@/lib/types"

interface AccuracyChartProps {
  components: WBSComponentWithActual[]
}

const TOOLTIP_STYLE = {
  backgroundColor: "#111827",
  border: "1px solid #1E2D45",
  borderRadius: "8px",
  color: "#F1F5F9",
  fontSize: 12,
}

const TICK = { fill: "#94A3B8", fontSize: 11 }

export function AccuracyChart({ components }: AccuracyChartProps) {
  const withActuals = components.filter(c => c.actual_hours != null && c.base_hours > 0)

  if (!withActuals.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center gap-2 rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-6">
        <p className="text-sm text-muted-foreground">No actuals recorded yet.</p>
        <p className="text-xs text-muted-foreground">
          Set the project status to <strong className="text-foreground">Won</strong> and use{" "}
          <strong className="text-foreground">Record Actuals</strong> in the Estimate tab
          after delivery to see accuracy analysis here.
        </p>
      </div>
    )
  }

  // Aggregate by category
  const byCategory: Record<string, { estimated: number; actual: number }> = {}
  for (const c of withActuals) {
    const cat = c.category || "Other"
    if (!byCategory[cat]) byCategory[cat] = { estimated: 0, actual: 0 }
    byCategory[cat].estimated += c.base_hours
    byCategory[cat].actual   += c.actual_hours!
  }

  const chartData = Object.entries(byCategory)
    .map(([category, v]) => ({
      category,
      Estimated: Math.round(v.estimated),
      Actual:    Math.round(v.actual),
      accuracy:  Math.round((v.actual / v.estimated) * 100),
    }))
    .sort((a, b) => b.Estimated - a.Estimated)

  // Summary stats
  const totalEstimated = withActuals.reduce((s, c) => s + c.base_hours, 0)
  const totalActual    = withActuals.reduce((s, c) => s + (c.actual_hours ?? 0), 0)
  const overallPct     = totalEstimated > 0 ? Math.round((totalActual / totalEstimated) * 100) : 0
  const variance       = totalActual - totalEstimated

  const pctColor = overallPct <= 100 ? "text-green-400" : overallPct <= 120 ? "text-amber-400" : "text-red-400"

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Overall Accuracy</p>
          <p className={`text-2xl font-black ${pctColor}`}>{overallPct}%</p>
        </div>
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Estimated</p>
          <p className="text-2xl font-black text-foreground">{Math.round(totalEstimated).toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">hrs</span></p>
        </div>
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Actual</p>
          <p className={`text-2xl font-black ${pctColor}`}>{Math.round(totalActual).toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">hrs</span></p>
          <p className={`text-[10px] mt-0.5 ${variance > 0 ? "text-red-400" : "text-green-400"}`}>
            {variance > 0 ? "+" : ""}{Math.round(variance)} hrs variance
          </p>
        </div>
      </div>

      {/* Category comparison chart */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Hours by Category</p>
        <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 44)}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" horizontal={false} />
            <XAxis
              type="number"
              tick={TICK}
              axisLine={{ stroke: "#1E2D45" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              width={130}
              tick={TICK}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: unknown, name: unknown) => [`${v} hrs`, String(name ?? "")]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8", paddingTop: 8 }} />
            <Bar dataKey="Estimated" fill="#2563EB" radius={[0, 3, 3, 0]} maxBarSize={18} />
            <Bar dataKey="Actual"    fill="#059669" radius={[0, 3, 3, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-component table for components with actuals */}
      <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#0D1526]">
            <tr className="text-muted-foreground">
              <th className="text-left py-2 px-3 font-semibold">Component</th>
              <th className="text-left py-2 px-3 font-semibold">Category</th>
              <th className="text-right py-2 px-3 font-semibold">Est. Hrs</th>
              <th className="text-right py-2 px-3 font-semibold">Actual Hrs</th>
              <th className="text-right py-2 px-3 font-semibold">Accuracy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2D45]">
            {withActuals.map(c => {
              const pct = Math.round(((c.actual_hours ?? 0) / c.base_hours) * 100)
              const cls = pct <= 100 ? "text-green-400" : pct <= 120 ? "text-amber-400" : "text-red-400"
              return (
                <tr key={c.id} className="hover:bg-[#1E2D45]/30">
                  <td className="py-2 px-3 font-medium">{c.component_name}</td>
                  <td className="py-2 px-3 text-muted-foreground">{c.category}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{c.base_hours}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{c.actual_hours}</td>
                  <td className={`py-2 px-3 text-right font-semibold tabular-nums ${cls}`}>{pct}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
