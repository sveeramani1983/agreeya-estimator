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
import { PeriodCost } from "@/lib/types"

interface BurnRateChartProps {
  data: PeriodCost[]
  quotedPrice?: number
}

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toLocaleString()}`
}

const TOOLTIP_STYLE = {
  backgroundColor: "#111827",
  border: "1px solid #1E2D45",
  borderRadius: "8px",
  color: "#F1F5F9",
  fontSize: 12,
}

const TICK = { fill: "#94A3B8", fontSize: 11 }

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 space-y-1">
      <p className="font-semibold text-white text-xs">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span style={{ color: p.color }}>●</span>
          <span className="text-[#94A3B8]">{p.name}:</span>
          <span className="font-medium text-white">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function BurnRateChart({ data, quotedPrice }: BurnRateChartProps) {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
        <p className="text-sm text-muted-foreground">No resource loading data yet.</p>
        <p className="text-xs text-muted-foreground">
          Add resource loading in the{" "}
          <a href="../resources" className="text-primary underline">Resources tab</a>{" "}
          to see the burn rate chart.
        </p>
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false} />
          <XAxis
            dataKey="label"
            tick={TICK}
            axisLine={{ stroke: "#1E2D45" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmt}
            tick={TICK}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#94A3B8", paddingTop: 8 }}
          />
          <Bar
            dataKey="margined_cost"
            name="Period Cost"
            fill="#2563EB"
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
          />
          <Line
            dataKey="cumulative"
            name="Cumulative Spend"
            type="monotone"
            stroke="#7C3AED"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#7C3AED" }}
          />
          {quotedPrice && quotedPrice > 0 && (
            <ReferenceLine
              y={quotedPrice}
              stroke="#EF4444"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: "Budget", fill: "#EF4444", fontSize: 10, position: "insideTopRight" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-right mt-1">
        Bars = per-period cost · Line = cumulative spend
        {quotedPrice ? " · Red line = quoted price" : ""}
      </p>
    </div>
  )
}
