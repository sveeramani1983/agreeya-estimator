"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { saveComponentActuals } from "@/lib/tracker-actions"
import type { ComponentWithActual } from "@/lib/types"
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, X } from "lucide-react"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtH(n: number) { return `${Math.round(n)} hrs` }
function round1(n: number) { return Math.round(n * 10) / 10 }

function varColor(pct: number, hasActuals: boolean) {
  if (!hasActuals) return "text-muted-foreground"
  if (pct > 10) return "text-red-400"
  if (pct < -10) return "text-green-400"
  return "text-muted-foreground"
}

function rowBorderColor(c: ComponentWithActual) {
  if (c.status === 'not_started') return ""
  if (c.status === 'complete') return "border-l-2 border-l-green-600/50"
  if (c.variance_percent > 10) return "border-l-2 border-l-red-600/50"
  return "border-l-2 border-l-blue-600/50"
}

function StatusIcon({ status }: { status: 'complete' | 'in_progress' | 'not_started' }) {
  if (status === 'complete')    return <span title="Complete"    className="text-green-400">✅</span>
  if (status === 'in_progress') return <span title="In Progress" className="text-blue-400">🔄</span>
  return <span title="Not Started" className="text-muted-foreground">⏳</span>
}

type Filter = 'all' | 'over_budget' | 'on_track' | 'under_budget' | 'complete' | 'in_progress' | 'not_started'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Summary {
  totalEstHours: number
  totalActHours: number
  totalRemaining: number
  totalVariance: number
  completeCount: number
  totalCount: number
  atRiskCount: number
  cpi: number | null
  topAtRisk: ComponentWithActual[]
  lastUpdated: string | null
}

interface Props {
  trackerId: string
  estimatorProjectId: string
  components: ComponentWithActual[]
  unallocatedHours: number
  periodBurnsTotal: number
  summary: Summary
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ComparisonClient({
  trackerId,
  estimatorProjectId,
  components,
  unallocatedHours,
  periodBurnsTotal,
  summary,
}: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [panelOpen, setPanelOpen] = useState(false)

  // Panel state — keyed by wbs_component_id
  const [panelData, setPanelData] = useState<Record<string, { actual_hours: string; is_complete: boolean; notes: string }>>({})
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  // Initialise panel data from existing actuals
  useEffect(() => {
    const init: Record<string, { actual_hours: string; is_complete: boolean; notes: string }> = {}
    for (const c of components) {
      init[c.id] = {
        actual_hours: c.actual_hours > 0 ? String(c.actual_hours) : "",
        is_complete: c.is_complete,
        notes: c.notes ?? "",
      }
    }
    setPanelData(init)
  }, [components])

  // ── Filtered view ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (filter === 'all') return components
    if (filter === 'complete')     return components.filter(c => c.status === 'complete')
    if (filter === 'in_progress')  return components.filter(c => c.status === 'in_progress')
    if (filter === 'not_started')  return components.filter(c => c.status === 'not_started')
    if (filter === 'over_budget')  return components.filter(c => c.variance_percent > 10 && c.status !== 'not_started')
    if (filter === 'under_budget') return components.filter(c => c.variance_percent < -10 && c.status !== 'not_started')
    if (filter === 'on_track')     return components.filter(c => Math.abs(c.variance_percent) <= 10 && c.status !== 'not_started')
    return components
  }, [components, filter])

  // Group by category
  const byCategory = useMemo(() => {
    const map: Record<string, ComponentWithActual[]> = {}
    for (const c of filtered) {
      if (!map[c.category]) map[c.category] = []
      map[c.category].push(c)
    }
    return map
  }, [filtered])

  // ── Panel helpers ──────────────────────────────────────────────────────────

  const panelTotalActuals = useMemo(() => {
    return Object.values(panelData).reduce((s, v) => s + (parseFloat(v.actual_hours) || 0), 0)
  }, [panelData])

  function updatePanelField(id: string, field: 'actual_hours' | 'is_complete' | 'notes', value: string | boolean) {
    setPanelData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const actuals = components
        .filter(c => panelData[c.id]?.actual_hours !== "" || panelData[c.id]?.is_complete)
        .map(c => ({
          wbs_component_id: c.id,
          actual_hours: parseFloat(panelData[c.id]?.actual_hours || "0") || 0,
          is_complete: panelData[c.id]?.is_complete ?? false,
          notes: panelData[c.id]?.notes || undefined,
        }))
      await saveComponentActuals(trackerId, actuals, asOfDate)
      setPanelOpen(false)
      toast.success(`Component actuals updated as of ${new Date(asOfDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`)
      router.refresh()
    } catch {
      toast.error("Failed to save actuals. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // ── Filter badges ──────────────────────────────────────────────────────────

  const filters: { value: Filter; label: string }[] = [
    { value: 'all',          label: 'All' },
    { value: 'over_budget',  label: 'Over Budget' },
    { value: 'on_track',     label: 'On Track' },
    { value: 'under_budget', label: 'Under Budget' },
    { value: 'complete',     label: 'Complete' },
    { value: 'in_progress',  label: 'In Progress' },
    { value: 'not_started',  label: 'Not Started' },
  ]

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Estimate vs Actual</h2>
          {summary.lastUpdated && (
            <p className="text-xs text-muted-foreground mt-0.5">Last updated: {summary.lastUpdated}</p>
          )}
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
          Update Actuals
        </button>
      </div>

      {/* ── Summary tiles ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Estimated",  value: fmtH(summary.totalEstHours),  sub: `${summary.totalCount} components` },
          { label: "Actual",     value: fmtH(summary.totalActHours),  sub: `${components.filter(c => c.status !== 'not_started').length} tracked` },
          { label: "Remaining",  value: fmtH(summary.totalRemaining), sub: `${summary.completeCount} complete` },
          {
            label: "Variance",
            value: (summary.totalVariance >= 0 ? "+" : "") + fmtH(summary.totalVariance),
            sub: summary.totalVariance > 0 ? "over estimate" : summary.totalVariance < 0 ? "under estimate" : "on target",
            color: summary.totalVariance > 0 ? "text-red-400" : summary.totalVariance < 0 ? "text-green-400" : "text-foreground",
          },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t.label}</p>
            <p className={`text-xl font-bold ${'color' in t ? t.color : "text-foreground"}`}>{t.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.value
                ? "bg-blue-600 text-white"
                : "bg-[#1E2D45] text-muted-foreground hover:text-foreground hover:bg-[#2D3F5A]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {components.length === 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-10 text-center">
          <p className="text-sm text-muted-foreground">No WBS components found for this project.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">No components match this filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E2D45] bg-[#0D1526]">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Component</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Est Hrs</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Act Hrs</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Remaining</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Variance</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D45]">
              {Object.entries(byCategory).map(([cat, catRows]) => {
                const catEstHrs = catRows.reduce((s, r) => s + r.base_hours, 0)
                const catActHrs = catRows.reduce((s, r) => s + r.actual_hours, 0)
                const catVar    = catActHrs - catEstHrs
                const catVarPct = catEstHrs > 0 ? (catVar / catEstHrs) * 100 : 0
                const catHasAct = catRows.some(r => r.status !== 'not_started')

                return [
                  /* Category header */
                  <tr key={`cat-${cat}`} className="bg-[#0A1120]">
                    <td colSpan={6} className="px-4 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{cat}</span>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Est: {fmtH(catEstHrs)}</span>
                          {catHasAct && <span>Act: {fmtH(catActHrs)}</span>}
                          {catHasAct && (
                            <span className={varColor(catVarPct, true)}>
                              Var: {catVar >= 0 ? "+" : ""}{fmtH(catVar)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>,
                  /* Component rows */
                  ...catRows.map(row => (
                    <tr key={row.id} className={`hover:bg-white/[0.02] ${rowBorderColor(row)}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">{row.component_name}</p>
                        {row.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]" title={row.description}>{row.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtH(row.base_hours)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {row.status === 'not_started'
                          ? <span className="text-muted-foreground">—</span>
                          : fmtH(row.actual_hours)
                        }
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.status === 'not_started' ? fmtH(row.base_hours) : fmtH(row.remaining)}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${varColor(row.variance_percent, row.status !== 'not_started')}`}>
                        {row.status === 'not_started'
                          ? "—"
                          : `${row.variance >= 0 ? "+" : ""}${fmtH(row.variance)} (${row.variance >= 0 ? "+" : ""}${round1(row.variance_percent)}%)`
                        }
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusIcon status={row.status} />
                      </td>
                    </tr>
                  )),
                  /* Category total row */
                  <tr key={`cat-total-${cat}`} className="bg-[#0A1120]/50 border-t border-[#1E2D45]">
                    <td className="px-4 py-2 text-xs font-semibold text-muted-foreground">Category Total</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground tabular-nums">{fmtH(catEstHrs)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-foreground">{catHasAct ? fmtH(catActHrs) : "—"}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">{fmtH(catRows.reduce((s, r) => s + r.remaining, 0))} remaining</td>
                    <td className={`px-4 py-2 text-right text-xs font-semibold tabular-nums ${varColor(catVarPct, catHasAct)}`}>
                      {catHasAct ? `${catVar >= 0 ? "+" : ""}${fmtH(catVar)}` : "—"}
                    </td>
                    <td />
                  </tr>,
                ]
              })}

              {/* Unallocated hours row */}
              {unallocatedHours > 0 && (
                <tr className="bg-amber-900/10 border-t border-amber-800/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      <span className="text-sm font-medium text-amber-300">Unallocated Hours</span>
                    </div>
                    <p className="text-xs text-amber-400/70 mt-0.5 ml-6">
                      {Math.round(unallocatedHours)} hrs in period burns not assigned to any component
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-right font-medium text-amber-300 tabular-nums">{fmtH(unallocatedHours)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
                  <td />
                </tr>
              )}

              {/* Grand total */}
              <tr className="bg-[#0D1526] border-t-2 border-[#2D3F5A]">
                <td className="px-4 py-3 text-sm font-bold text-foreground">TOTAL</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">{fmtH(summary.totalEstHours)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">{fmtH(summary.totalActHours)}</td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">{fmtH(summary.totalRemaining)}</td>
                <td className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${varColor(summary.totalVariance / Math.max(summary.totalEstHours, 1) * 100, summary.totalActHours > 0)}`}>
                  {summary.totalActHours > 0
                    ? `${summary.totalVariance >= 0 ? "+" : ""}${fmtH(summary.totalVariance)}`
                    : "—"
                  }
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── CPI Panel ────────────────────────────────────────────────────── */}
      {components.some(c => c.status !== 'not_started') && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Performance Metrics</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* CPI */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">CPI (Cost Performance Index)</p>
              {summary.cpi !== null ? (
                <>
                  <p className={`text-2xl font-bold ${summary.cpi >= 1 ? "text-green-400" : summary.cpi >= 0.9 ? "text-amber-400" : "text-red-400"}`}>
                    {round1(summary.cpi)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.cpi >= 1
                      ? `Team is ${Math.round((summary.cpi - 1) * 100)}% more efficient than estimated`
                      : `Team is spending ${Math.round((1 - summary.cpi) * 100)}% more hours per deliverable than estimated`
                    }
                  </p>
                </>
              ) : (
                <p className="text-xl text-muted-foreground">—</p>
              )}
            </div>

            {/* Completion Rate */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Completion Rate</p>
              <p className="text-2xl font-bold text-foreground">
                {summary.completeCount} <span className="text-base font-normal text-muted-foreground">of {summary.totalCount}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.totalCount > 0 ? Math.round((summary.completeCount / summary.totalCount) * 100) : 0}% complete
              </p>
            </div>

            {/* At Risk */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Components At Risk (&gt;10% over)</p>
              {summary.topAtRisk.length === 0 ? (
                <div className="flex items-center gap-1.5 text-green-400 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>None — all within estimate</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {summary.topAtRisk.map(r => (
                    <div key={r.id} className="flex justify-between text-xs">
                      <span className="text-foreground truncate mr-2">{r.component_name}</span>
                      <span className="text-red-400 shrink-0 tabular-nums">
                        +{fmtH(r.variance)} (+{round1(r.variance_percent)}%) 🔴
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Update Actuals Slide-over Panel ──────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="flex-1 bg-black/50"
            onClick={() => !saving && setPanelOpen(false)}
          />

          {/* Panel */}
          <div className="w-full max-w-lg bg-[var(--bg-card,#0D1526)] border-l border-[#1E2D45] flex flex-col overflow-hidden shadow-2xl">

            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D45] shrink-0">
              <div>
                <h3 className="text-base font-semibold text-foreground">Update Component Actuals</h3>
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-xs text-muted-foreground">As of date:</label>
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={e => setAsOfDate(e.target.value)}
                    className="rounded border border-[#1E2D45] bg-[#111827] px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={() => !saving && setPanelOpen(false)}
                className="rounded-lg p-1.5 hover:bg-[#1E2D45] transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Panel body — scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
              {Object.entries(
                components.reduce((acc, c) => {
                  if (!acc[c.category]) acc[c.category] = []
                  acc[c.category].push(c)
                  return acc
                }, {} as Record<string, ComponentWithActual[]>)
              ).map(([cat, catComps]) => (
                <div key={cat}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                    {cat} ({catComps.length})
                  </p>
                  <div className="space-y-2">
                    {catComps.map(comp => {
                      const d = panelData[comp.id] ?? { actual_hours: "", is_complete: false, notes: "" }
                      const hrs = parseFloat(d.actual_hours) || 0
                      const isOver3x = hrs > comp.base_hours * 3 && hrs > 0

                      return (
                        <div
                          key={comp.id}
                          className={`rounded-lg border p-3 space-y-2.5 transition-colors ${
                            d.is_complete
                              ? "border-green-800/50 bg-green-900/10"
                              : "border-[#1E2D45] bg-[#111827]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">{comp.component_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {comp.category} · {comp.complexity} · Est: {fmtH(comp.base_hours)}
                              </p>
                            </div>
                            {d.is_complete && (
                              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Actual Hours (cumulative)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={d.actual_hours}
                              onChange={e => updatePanelField(comp.id, 'actual_hours', e.target.value)}
                              placeholder="0"
                              className="w-full rounded border border-[#1E2D45] bg-[#0D1526] px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {isOver3x && (
                              <p className="text-xs text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                That&apos;s 3× the estimate ({fmtH(comp.base_hours)}). Please confirm this is correct.
                              </p>
                            )}
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={d.is_complete}
                              onChange={e => updatePanelField(comp.id, 'is_complete', e.target.checked)}
                              className="h-4 w-4 rounded border-[#1E2D45] accent-green-500"
                            />
                            <span className="text-xs text-muted-foreground">Mark as Complete</span>
                          </label>

                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Notes</label>
                            <input
                              type="text"
                              value={d.notes}
                              onChange={e => updatePanelField(comp.id, 'notes', e.target.value)}
                              placeholder="Optional notes…"
                              className="w-full rounded border border-[#1E2D45] bg-[#0D1526] px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Panel footer — sticky */}
            <div className="border-t border-[#1E2D45] px-5 py-4 space-y-3 bg-[#0A1120] shrink-0">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Summary</p>
                <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
                  <span>Total Actuals Entered:</span>
                  <span className="text-right text-foreground tabular-nums">{fmtH(panelTotalActuals)}</span>
                  <span>Period Burns Total:</span>
                  <span className="text-right text-foreground tabular-nums">{fmtH(periodBurnsTotal)}</span>
                  <span>Unallocated:</span>
                  <span className={`text-right tabular-nums ${Math.max(0, periodBurnsTotal - panelTotalActuals) > 0 ? "text-amber-400" : "text-green-400"}`}>
                    {fmtH(Math.max(0, periodBurnsTotal - panelTotalActuals))}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => !saving && setPanelOpen(false)}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-[#1E2D45] px-4 py-2 text-sm text-muted-foreground hover:bg-[#1E2D45]/40 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
                >
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save Actuals"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
