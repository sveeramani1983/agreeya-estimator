"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowRight, Target, TrendingUp, DollarSign, Award } from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { format, parseISO } from "date-fns"
import type { PipelineData, PipelineProject } from "@/lib/types"
import { updateProjectPursuitData } from "@/lib/actions"

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n)}`
}

function probColor(p: number) {
  if (p >= 70) return "#059669"
  if (p >= 40) return "#D97706"
  return "#DC2626"
}

function probBg(p: number) {
  if (p >= 70) return "bg-green-900/20 text-green-400 border-green-800/40"
  if (p >= 40) return "bg-amber-900/20 text-amber-400 border-amber-800/40"
  return "bg-red-900/20 text-red-400 border-red-800/40"
}

function statusBadge(status: string) {
  if (status === "submitted") return "bg-blue-900/40 text-blue-300 border-blue-800/40"
  return "bg-gray-700/40 text-gray-400 border-gray-600/40"
}

// ── Inline Probability Cell ───────────────────────────────────────────────────

function ProbCell({ project }: { project: PipelineProject }) {
  const router = useRouter()
  const [val, setVal] = useState(project.win_probability ?? 50)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    setEditing(false)
    const clamped = Math.min(100, Math.max(0, val))
    setVal(clamped)
    if (clamped === (project.win_probability ?? 50)) return
    setSaving(true)
    try {
      await updateProjectPursuitData(project.id, { win_probability: clamped })
      router.refresh()
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        max={100}
        autoFocus
        value={val}
        onChange={e => setVal(Number(e.target.value))}
        onBlur={save}
        onKeyDown={e => e.key === "Enter" && save()}
        className="w-14 rounded border border-[#1E2D45] bg-[#0A1120] px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={saving}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold cursor-pointer hover:opacity-80 transition-opacity ${probBg(val)}`}
      title="Click to edit"
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: probColor(val) }}
      />
      {val}%
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  data: PipelineData
}

export function PipelineDashboardSection({ data }: Props) {
  const { pipeline, metrics, monthlyForecast, wonThisYear, lostThisYear } = data

  const top5 = pipeline.slice(0, 5)

  const totalRow = useMemo(() => ({
    total: top5.reduce((s, p) => s + p.quoted_price, 0),
    weighted: top5.reduce((s, p) => s + p.quoted_price * ((p.win_probability ?? 50) / 100), 0),
  }), [top5])

  // Month labels for chart
  const chartData = useMemo(() =>
    monthlyForecast.map(m => ({
      label: format(parseISO(m.month + "-01"), "MMM yy"),
      total: Math.round(m.total),
      weighted: Math.round(m.weighted),
    }))
  , [monthlyForecast])

  const winRatePct = Math.round(metrics.winRate)
  const wonCount = wonThisYear.length
  const totalDecided = wonThisYear.length + lostThisYear.length

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-400" />
          <h3 className="text-lg font-bold text-foreground">Pipeline Intelligence</h3>
        </div>
        <Link
          href="/pipeline"
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
        >
          View Full Pipeline <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Pipeline",
            value: fmt(metrics.totalPipeline),
            sub: `${metrics.dealCount} active pursuit${metrics.dealCount !== 1 ? "s" : ""}`,
            icon: Target,
            color: "text-blue-400",
          },
          {
            label: "Weighted Forecast",
            value: fmt(metrics.weightedPipeline),
            sub: "Probability-adjusted",
            icon: TrendingUp,
            color: "text-purple-400",
          },
          {
            label: "Won This Year",
            value: fmt(metrics.wonRevenue),
            sub: `${wonCount} deal${wonCount !== 1 ? "s" : ""} closed`,
            icon: Award,
            color: "text-green-400",
          },
          {
            label: "Win Rate YTD",
            value: `${winRatePct}%`,
            sub: totalDecided > 0 ? `${wonCount} of ${totalDecided} pursued` : "No decisions yet",
            icon: DollarSign,
            color: winRatePct >= 50 ? "text-green-400" : winRatePct > 0 ? "text-amber-400" : "text-muted-foreground",
          },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <t.icon className={`h-4 w-4 ${t.color}`} />
            </div>
            <p className="text-2xl font-black text-foreground">{t.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Pipeline table + chart side by side */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top 5 deals table */}
        <div className="lg:col-span-2 rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1E2D45]">
            <p className="text-sm font-semibold text-foreground">Top Active Pursuits</p>
          </div>
          {top5.length === 0 ? (
            <div className="p-8 text-center">
              <Target className="h-8 w-8 mx-auto text-muted-foreground opacity-20 mb-2" />
              <p className="text-sm text-muted-foreground">No active pipeline deals.</p>
              <p className="text-xs text-muted-foreground mt-1">Create a project in Draft or Submitted status to track it here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Value</th>
                    <th className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prob</th>
                    <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weighted</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45]">
                  {top5.map(p => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${p.id}/estimate`} className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1">
                          {p.name}
                        </Link>
                        <p className="text-[10px] text-muted-foreground truncate">{p.client_name}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                        {p.quoted_price > 0 ? fmt(p.quoted_price) : <span className="italic opacity-50">Not quoted</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <ProbCell project={p} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground text-xs">
                        {p.quoted_price > 0
                          ? fmt(p.quoted_price * ((p.win_probability ?? 50) / 100))
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge(p.status)}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#1E2D45] bg-[#0A1120]">
                    <td className="px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      {pipeline.length} deal{pipeline.length !== 1 ? "s" : ""} total
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-foreground text-xs">
                      {fmt(totalRow.total)}
                    </td>
                    <td />
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-foreground text-xs">
                      {fmt(totalRow.weighted)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Monthly forecast chart */}
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 flex flex-col">
          <p className="text-sm font-semibold text-foreground mb-1">Monthly Forecast</p>
          <p className="text-[10px] text-muted-foreground mb-4">Expected revenue by start month</p>
          {chartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">No forecast data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barGap={2} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0D1526", border: "1px solid #1E2D45", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#E5E7EB", fontWeight: 600 }}
                  formatter={(v: any, name: any) => [fmt(Number(v)), name === "total" ? "Total" : "Weighted"]}
                />
                <Bar dataKey="total" name="total" fill="rgba(37,99,235,0.25)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="weighted" name="weighted" fill="#2563EB" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {chartData.length > 0 && (
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-[rgba(37,99,235,0.25)]" />
                <span className="text-[10px] text-muted-foreground">Total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                <span className="text-[10px] text-muted-foreground">Weighted</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
