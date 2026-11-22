"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { upsertPeriodBurn, deletePeriodBurn, updateTrackerCadence } from "@/lib/actions"
import type { PeriodBurn, PeriodBurnResourceEntry, ReportingCadence } from "@/lib/types"
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Period {
  start: string
  end: string
  label: string
}

interface BaselineResource {
  id: string
  name: string
  role: string | null
}

interface Props {
  trackerProjectId: string
  projectId: string
  reportingCadence: ReportingCadence
  periodBurns: PeriodBurn[]
  projectStartDate: string | null
  projectTargetEndDate: string | null
  baselineTotalHours: number
  baselineTotalCost: number
  baselineResources: BaselineResource[]
}

// ── Period generation ─────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  return r
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function generatePeriods(cadence: ReportingCadence, projectStartDate: string | null): Period[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const anchor = projectStartDate
    ? new Date(projectStartDate + "T00:00:00")
    : new Date(today.getTime() - 12 * 7 * 24 * 60 * 60 * 1000)
  const periods: Period[] = []

  if (cadence === "weekly") {
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 14)
    let d = getMonday(anchor)
    while (d <= limit) {
      const end = new Date(d)
      end.setDate(end.getDate() + 6)
      periods.push({ start: fmtDate(d), end: fmtDate(end), label: `${shortDate(d)} — ${shortDate(end)}` })
      d = new Date(d)
      d.setDate(d.getDate() + 7)
    }
  } else if (cadence === "biweekly") {
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 28)
    let d = getMonday(anchor)
    while (d <= limit) {
      const end = new Date(d)
      end.setDate(end.getDate() + 13)
      periods.push({ start: fmtDate(d), end: fmtDate(end), label: `${shortDate(d)} — ${shortDate(end)}` })
      d = new Date(d)
      d.setDate(d.getDate() + 14)
    }
  } else if (cadence === "semimonthly") {
    const limit = new Date(today.getFullYear(), today.getMonth() + 2, 1)
    let m = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    while (m < limit) {
      const firstEnd = new Date(m.getFullYear(), m.getMonth(), 15)
      const ml = m.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      periods.push({ start: fmtDate(m), end: fmtDate(firstEnd), label: `${ml} 1–15` })
      const secondStart = new Date(m.getFullYear(), m.getMonth(), 16)
      const secondEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0)
      periods.push({ start: fmtDate(secondStart), end: fmtDate(secondEnd), label: `${ml} 16–${secondEnd.getDate()}` })
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
    }
  } else {
    const limit = new Date(today.getFullYear(), today.getMonth() + 2, 1)
    let m = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    while (m < limit) {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 0)
      periods.push({ start: fmtDate(m), end: fmtDate(end), label: m.toLocaleDateString("en-US", { month: "long", year: "numeric" }) })
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
    }
  }
  return periods
}

function getCurrentPeriodIndex(periods: Period[]): number {
  const today = new Date().toISOString().split("T")[0]
  const i = periods.findIndex(p => today >= p.start && today <= p.end)
  if (i !== -1) return i
  if (periods.length > 0 && today > periods[periods.length - 1].end) return periods.length - 1
  return 0
}

// ── Forecast ──────────────────────────────────────────────────────────────────

function computeForecast(
  periodBurns: PeriodBurn[],
  draftHours: number,
  baselineTotalHours: number,
  baselineTotalCost: number,
  blendedRate: number,
  projectTargetEndDate: string | null,
) {
  const submitted = [...periodBurns].filter(b => b.is_submitted).sort((a, b) => a.period_start < b.period_start ? -1 : 1)
  const totalActualHours = submitted.reduce((s, b) => s + b.total_hours, 0)
  const totalActualCost = totalActualHours * blendedRate
  const remainingHours = Math.max(0, baselineTotalHours - totalActualHours)
  const budgetBurnPct = baselineTotalCost > 0 ? (totalActualCost / baselineTotalCost) * 100 : 0

  const last3 = submitted.slice(-3)
  const recentRate = last3.length > 0 ? last3.reduce((s, b) => s + b.total_hours, 0) / last3.length : 0

  let projectedEndDate: string | null = null
  let scheduleDaysVariance: number | null = null
  if (recentRate > 0 && remainingHours > 0) {
    const weeksRemaining = remainingHours / recentRate
    const projEnd = new Date()
    projEnd.setDate(projEnd.getDate() + Math.round(weeksRemaining * 7))
    projectedEndDate = projEnd.toISOString().split("T")[0]
    if (projectTargetEndDate) {
      const target = new Date(projectTargetEndDate + "T00:00:00")
      scheduleDaysVariance = Math.round((projEnd.getTime() - target.getTime()) / 86400000)
    }
  } else if (recentRate === 0 && projectTargetEndDate) {
    scheduleDaysVariance = null
  }

  let healthStatus: "green" | "yellow" | "red" = "green"
  let healthLabel = "On Track"
  if (budgetBurnPct > 100 || (scheduleDaysVariance !== null && scheduleDaysVariance > 21)) {
    healthStatus = "red"; healthLabel = "At Risk"
  } else if (budgetBurnPct > 85 || (scheduleDaysVariance !== null && scheduleDaysVariance > 7)) {
    healthStatus = "yellow"; healthLabel = "Monitor"
  }

  return {
    thisPeriodCost: draftHours * blendedRate,
    totalActualHours,
    totalActualCost,
    remainingHours,
    projectedEndDate,
    healthStatus,
    healthLabel,
    budgetBurnPct,
    scheduleDaysVariance,
    recentRate,
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n).toLocaleString()}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrackerActualsV2({
  trackerProjectId,
  projectId,
  reportingCadence: initialCadence,
  periodBurns,
  projectStartDate,
  projectTargetEndDate,
  baselineTotalHours,
  baselineTotalCost,
  baselineResources,
}: Props) {
  const router = useRouter()
  const blendedRate = baselineTotalHours > 0 ? baselineTotalCost / baselineTotalHours : 0

  const [cadence, setCadence] = useState<ReportingCadence>(initialCadence)
  const [saving, setSaving] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const periods = useMemo(() => generatePeriods(cadence, projectStartDate), [cadence, projectStartDate])
  const [selectedIndex, setSelectedIndex] = useState(() => getCurrentPeriodIndex(periods))

  const selectedPeriod = periods[selectedIndex] ?? null
  const existingBurn = selectedPeriod ? periodBurns.find(b => b.period_start === selectedPeriod.start) ?? null : null

  const [totalHours, setTotalHours] = useState<string>(existingBurn ? String(existingBurn.total_hours) : "")
  const [notes, setNotes] = useState<string>(existingBurn?.notes ?? "")
  const [resourceEntries, setResourceEntries] = useState<PeriodBurnResourceEntry[]>(
    () => existingBurn?.resource_breakdown ?? baselineResources.map(r => ({ resource_id: r.id, resource_name: r.name, hours: 0 }))
  )

  const parsedHours = parseFloat(totalHours) || 0
  const resourceSum = resourceEntries.reduce((s, e) => s + e.hours, 0)
  const resourceSumMismatch = showBreakdown && parsedHours > 0 && Math.abs(resourceSum - parsedHours) > 0.01

  const selectPeriod = useCallback((index: number) => {
    if (index < 0 || index >= periods.length) return
    setSelectedIndex(index)
    const period = periods[index]
    const burn = period ? periodBurns.find(b => b.period_start === period.start) ?? null : null
    setTotalHours(burn ? String(burn.total_hours) : "")
    setNotes(burn?.notes ?? "")
    setResourceEntries(burn?.resource_breakdown ?? baselineResources.map(r => ({ resource_id: r.id, resource_name: r.name, hours: 0 })))
    setShowBreakdown(false)
  }, [periods, periodBurns, baselineResources])

  const forecast = useMemo(() => computeForecast(
    periodBurns, parsedHours, baselineTotalHours, baselineTotalCost, blendedRate, projectTargetEndDate,
  ), [periodBurns, parsedHours, baselineTotalHours, baselineTotalCost, blendedRate, projectTargetEndDate])

  async function handleCadenceChange(newCadence: ReportingCadence) {
    const newPeriods = generatePeriods(newCadence, projectStartDate)
    setCadence(newCadence)
    setSelectedIndex(getCurrentPeriodIndex(newPeriods))
    setTotalHours("")
    setNotes("")
    setSaving(true)
    try { await updateTrackerCadence(trackerProjectId, newCadence) } finally { setSaving(false); router.refresh() }
  }

  async function handleSave(submit: boolean) {
    if (!selectedPeriod || parsedHours <= 0) return
    setSaving(true)
    try {
      await upsertPeriodBurn(trackerProjectId, {
        period_start: selectedPeriod.start,
        period_end: selectedPeriod.end,
        period_label: selectedPeriod.label,
        total_hours: parsedHours,
        resource_breakdown: showBreakdown && resourceEntries.some(e => e.hours > 0) ? resourceEntries : null,
        notes: notes.trim() || null,
        is_submitted: submit,
      })
      router.refresh()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setSaving(true)
    try {
      await deletePeriodBurn(id)
      setTotalHours("")
      setNotes("")
      setDeleteConfirmId(null)
      router.refresh()
    } finally { setSaving(false) }
  }

  function periodStatus(p: Period): "submitted" | "draft" | "empty" {
    const burn = periodBurns.find(b => b.period_start === p.start)
    if (!burn) return "empty"
    return burn.is_submitted ? "submitted" : "draft"
  }

  const healthBg = { green: "border-green-800/50 bg-green-900/10", yellow: "border-amber-800/50 bg-amber-900/10", red: "border-red-800/50 bg-red-900/10" }[forecast.healthStatus]
  const healthColor = { green: "text-green-400", yellow: "text-amber-400", red: "text-red-400" }[forecast.healthStatus]
  const healthIcon = { green: "🟢", yellow: "🟡", red: "🔴" }[forecast.healthStatus]

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Actuals Entry</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Record hours burned per period. Skynet forecasts completion.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Cadence:</span>
          <select
            value={cadence}
            onChange={e => handleCadenceChange(e.target.value as ReportingCadence)}
            disabled={saving}
            className="text-xs bg-[#0D1526] border border-[#1E2D45] rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-Weekly</option>
            <option value="semimonthly">Semi-Monthly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {/* Period navigator */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => selectPeriod(selectedIndex - 1)}
            disabled={selectedIndex === 0}
            className="p-1.5 rounded hover:bg-[#1E2D45] disabled:opacity-30 transition-colors shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{selectedPeriod?.label ?? "—"}</p>
            {existingBurn && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {existingBurn.is_submitted ? "✓ Submitted" : "● Draft saved"}
              </p>
            )}
          </div>
          <button
            onClick={() => selectPeriod(selectedIndex + 1)}
            disabled={selectedIndex >= periods.length - 1}
            className="p-1.5 rounded hover:bg-[#1E2D45] disabled:opacity-30 transition-colors shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Status chips */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {periods.map((p, i) => {
            const status = periodStatus(p)
            const isSelected = i === selectedIndex
            const today = new Date().toISOString().split("T")[0]
            const isFuture = p.start > today
            return (
              <button
                key={p.start}
                onClick={() => selectPeriod(i)}
                title={p.label}
                className={[
                  "flex-shrink-0 w-6 h-6 rounded-full text-[10px] font-bold transition-all border",
                  isSelected ? "border-blue-500 ring-1 ring-blue-500/50" : "border-transparent",
                  status === "submitted" ? "bg-green-900/40 text-green-400"
                    : status === "draft" ? "bg-amber-900/40 text-amber-400"
                    : isFuture ? "text-[#2a3a50]"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {status === "submitted" ? "✓" : status === "draft" ? "●" : "○"}
              </button>
            )
          })}
        </div>
      </div>

      {/* Entry form + Forecast panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Burn entry form */}
        <div className="lg:col-span-3 rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Burn Entry · {selectedPeriod?.label ?? "—"}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Total Hours Burned</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={totalHours}
              onChange={e => setTotalHours(e.target.value)}
              placeholder="e.g. 120"
              className="w-full bg-[#091020] border border-[#1E2D45] rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {parsedHours > 0 && blendedRate > 0 && (
              <p className="text-xs text-muted-foreground">
                ≈ {fmtMoney(parsedHours * blendedRate)} at blended rate {fmtMoney(blendedRate)}/hr
              </p>
            )}
          </div>

          {/* Resource breakdown */}
          {baselineResources.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Settings2 className="h-3 w-3" />
                {showBreakdown ? "Hide" : "Show"} resource breakdown
              </button>

              {showBreakdown && (
                <div className="rounded border border-[#1E2D45] p-3 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Hours by resource</p>
                  {resourceEntries.map((entry, i) => (
                    <div key={entry.resource_id} className="flex items-center gap-2">
                      <span className="text-xs text-foreground flex-1 truncate">{entry.resource_name}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={entry.hours || ""}
                        onChange={e => {
                          const updated = [...resourceEntries]
                          updated[i] = { ...entry, hours: parseFloat(e.target.value) || 0 }
                          setResourceEntries(updated)
                          setTotalHours(String(updated.reduce((s, r) => s + r.hours, 0)))
                        }}
                        className="w-20 bg-[#091020] border border-[#1E2D45] rounded px-2 py-1 text-xs text-right text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                  <div className="border-t border-[#1E2D45] pt-2 flex justify-between text-xs">
                    <span className="text-muted-foreground">Sum</span>
                    <span className={resourceSumMismatch ? "text-red-400 font-medium" : "text-foreground"}>
                      {resourceSum.toFixed(1)} hrs
                    </span>
                  </div>
                  {resourceSumMismatch && (
                    <p className="text-xs text-red-400">⚠ Sum ({resourceSum.toFixed(1)}) ≠ total ({parsedHours})</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Blockers, highlights, context…"
              className="w-full bg-[#091020] border border-[#1E2D45] rounded px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving || parsedHours <= 0 || resourceSumMismatch}
              className="flex-1 py-2 rounded text-xs font-medium border border-[#1E2D45] text-muted-foreground hover:text-foreground hover:border-blue-500/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || parsedHours <= 0 || resourceSumMismatch}
              className="flex-1 py-2 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Submitting…" : "Submit Period"}
            </button>
            {existingBurn && (
              <button
                type="button"
                onClick={() => setDeleteConfirmId(existingBurn.id)}
                className="px-3 py-2 rounded text-xs text-red-400 hover:text-red-300 border border-transparent hover:border-red-900/40 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Forecast panel */}
        <div className={`lg:col-span-2 rounded-lg border p-4 space-y-3 ${healthBg}`}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Instant Forecast</p>
            <span className={`text-xs font-semibold ${healthColor}`}>{healthIcon} {forecast.healthLabel}</span>
          </div>

          {[
            {
              label: "This Period",
              value: parsedHours > 0 ? `${parsedHours} hrs · ${fmtMoney(forecast.thisPeriodCost)}` : "—",
            },
            {
              label: "Project to Date",
              value: `${Math.round(forecast.totalActualHours).toLocaleString()} hrs · ${fmtMoney(forecast.totalActualCost)}`,
            },
            {
              label: "Remaining (Baseline)",
              value: `${Math.round(forecast.remainingHours).toLocaleString()} hrs · ${fmtMoney(forecast.remainingHours * blendedRate)}`,
            },
            {
              label: "Budget Burned",
              value: `${Math.round(forecast.budgetBurnPct)}% of ${fmtMoney(baselineTotalCost)}`,
            },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">{row.label}</span>
              <span className="text-foreground font-medium text-right">{row.value}</span>
            </div>
          ))}

          <div className="border-t border-white/10 pt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Forecast to Completion</p>
            {forecast.recentRate > 0 ? (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Recent Rate</span>
                  <span className="text-foreground">{forecast.recentRate.toFixed(1)} hrs/period (avg 3)</span>
                </div>
                {forecast.projectedEndDate && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Projected End</span>
                    <span className={forecast.scheduleDaysVariance !== null && forecast.scheduleDaysVariance > 0 ? "text-amber-400" : "text-foreground"}>
                      {new Date(forecast.projectedEndDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {forecast.scheduleDaysVariance !== null && forecast.scheduleDaysVariance > 0 && (
                        <span className="text-amber-400 ml-1">+{forecast.scheduleDaysVariance}d</span>
                      )}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Submit at least 1 period to see forecast.</p>
            )}
          </div>
        </div>
      </div>

      {/* Burn history */}
      {periodBurns.length > 0 && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2D45]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Burn History</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1E2D45]">
                  {["Period", "Hours", "Cost", "Status", "Notes", ""].map(h => (
                    <th key={h} className={`px-4 py-2 text-muted-foreground font-medium ${h === "Hours" || h === "Cost" ? "text-right" : h === "Status" ? "text-center" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...periodBurns].sort((a, b) => a.period_start < b.period_start ? -1 : 1).map(burn => (
                  <tr key={burn.id} className="border-b border-[#1E2D45]/40 hover:bg-[#1E2D45]/20 transition-colors">
                    <td className="px-4 py-2.5 text-foreground">{burn.period_label}</td>
                    <td className="px-4 py-2.5 text-right text-foreground">{burn.total_hours}</td>
                    <td className="px-4 py-2.5 text-right text-foreground">{fmtMoney(burn.total_hours * blendedRate)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {burn.is_submitted
                        ? <span className="text-green-400">✓ Submitted</span>
                        : <span className="text-amber-400">● Draft</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[140px] truncate">{burn.notes ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => {
                          const idx = periods.findIndex(p => p.start === burn.period_start)
                          if (idx !== -1) selectPeriod(idx)
                        }}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
            <p className="text-sm font-semibold text-foreground">Clear this period entry?</p>
            <p className="text-xs text-muted-foreground">This will permanently delete the burn record for this period and cannot be undone.</p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-1.5 text-xs rounded border border-[#1E2D45] text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={saving}
                className="px-4 py-1.5 text-xs rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
