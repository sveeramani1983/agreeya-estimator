"use client"

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"

interface ChartDataPoint {
  period: string
  label: string
  planned: number
  actual: number | null
  plannedCumulative: number
  actualCumulative: number | null
}

interface TrackerBurnRateChartProps {
  data: ChartDataPoint[]
  quotedPrice?: number
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n)}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((entry: any) => (
        entry.value != null && (
          <p key={entry.name} style={{ color: entry.color }}>
            {entry.name}: {fmt(entry.value)}
          </p>
        )
      ))}
    </div>
  )
}

export function TrackerBurnRateChart({ data, quotedPrice }: TrackerBurnRateChartProps) {
  const hasActuals = data.some(d => d.actual != null)

  return (
    <div className="space-y-6">
      {/* Period bars */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Period Cost</p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="planned" name="Planned" fill="#2563EB" opacity={0.7} radius={[2, 2, 0, 0]} />
            {hasActuals && <Bar dataKey="actual" name="Actual" fill="#10B981" opacity={0.9} radius={[2, 2, 0, 0]} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative lines */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Cumulative Spend</p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line dataKey="plannedCumulative" name="Planned Cumulative" stroke="#2563EB" strokeWidth={2} dot={false} type="monotone" />
            {hasActuals && <Line dataKey="actualCumulative" name="Actual Cumulative" stroke="#10B981" strokeWidth={2} dot={false} strokeDasharray="5 3" type="monotone" connectNulls={false} />}
            {quotedPrice != null && quotedPrice > 0 && (
              <ReferenceLine y={quotedPrice} stroke="#EF4444" strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: `Budget: ${fmt(quotedPrice)}`, fill: "#EF4444", fontSize: 10, position: "insideTopRight" }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
