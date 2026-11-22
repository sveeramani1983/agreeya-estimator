"use client"

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

interface StatusSlice  { name: string; value: number; fill: string }
interface BudgetBand   { label: string; count: number; fill: string }
interface ProjectRow   { project_name: string; client_name: string; baseline_total_cost: number; total_actual_cost: number; budget_pct: number }

interface Props {
  statusBreakdown: StatusSlice[]
  budgetBands: BudgetBand[]
  projects: any[]
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n)}`
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] px-3 py-2 text-xs shadow-xl">
      {payload.map((e: any) => (
        <p key={e.name} style={{ color: e.fill || e.color }}>{e.name ?? e.dataKey}: {e.value}</p>
      ))}
    </div>
  )
}

export function TrackerPortfolioCharts({ statusBreakdown, budgetBands, projects }: Props) {
  const topProjects = [...projects]
    .sort((a, b) => (b.baseline_total_cost || 0) - (a.baseline_total_cost || 0))
    .slice(0, 10)
    .map(p => ({
      name: p.project_name.length > 20 ? p.project_name.slice(0, 18) + "…" : p.project_name,
      Planned: Math.round(p.baseline_total_cost || 0),
      Actual:  Math.round(p.total_actual_cost || 0),
    }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Status donut */}
      {statusBreakdown.length > 0 && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Project Status Distribution</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                {statusBreakdown.map((s, i) => <Cell key={i} fill={s.fill} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budget health bands */}
      {budgetBands.length > 0 && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Budget Health Distribution</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budgetBands} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Projects" radius={[3, 3, 0, 0]}>
                {budgetBands.map((b, i) => <Cell key={i} fill={b.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top projects by value */}
      {topProjects.length > 0 && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Planned vs Actual by Project (top {topProjects.length})</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topProjects} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" horizontal={false} />
              <XAxis type="number" tickFormatter={fmt} tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={(v: unknown) => [fmt(Number(v))]} contentStyle={{ background: "#0D1526", border: "1px solid #1E2D45", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Planned" fill="#2563EB" opacity={0.7} radius={[0, 2, 2, 0]} />
              <Bar dataKey="Actual"  fill="#10B981" opacity={0.9} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
