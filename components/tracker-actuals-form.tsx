"use client"

import { useState, useTransition } from "react"
import { upsertProjectActual } from "@/lib/actions"
import { ProjectActual, TrackerProject } from "@/lib/types"
import { toast } from "sonner"
import { Save, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"

interface TrackerActualsFormProps {
  trackerProject: TrackerProject
  existingActuals: ProjectActual[]
  plannedByPeriod: Record<string, number>
  sortedPeriods: string[]
  periodLabels: Record<string, string>
}

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

export function TrackerActualsForm({
  trackerProject,
  existingActuals,
  plannedByPeriod,
  sortedPeriods,
  periodLabels,
}: TrackerActualsFormProps) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const a of existingActuals) init[a.period_label] = String(a.actual_cost)
    return init
  })
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  function handleChange(period: string, val: string) {
    setValues(prev => ({ ...prev, [period]: val }))
    setDirty(prev => new Set(prev).add(period))
  }

  function handleSave() {
    const toSave = Array.from(dirty)
      .filter(p => values[p] !== undefined)
      .map(p => ({ period_label: p, actual_cost: parseFloat(values[p] || "0") || 0 }))
    if (toSave.length === 0) { toast.info("No changes to save."); return }

    startTransition(async () => {
      try {
        for (const entry of toSave) await upsertProjectActual(trackerProject.id, entry)
        setDirty(new Set())
        toast.success(`Saved ${toSave.length} period${toSave.length !== 1 ? "s" : ""}.`)
        router.refresh()
      } catch { toast.error("Failed to save actuals.") }
    })
  }

  const totalPlanned = sortedPeriods.reduce((s, p) => s + (plannedByPeriod[p] || 0), 0)
  const totalActual  = sortedPeriods.reduce((s, p) => s + (parseFloat(values[p] || "0") || 0), 0)
  const totalVar = totalPlanned - totalActual
  const favorable = totalVar >= 0

  if (sortedPeriods.length === 0) {
    return (
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-8 text-center">
        <Info className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No resource loading periods found in the baseline snapshot.</p>
        <p className="text-xs text-muted-foreground mt-1">Populate the Resources tab in the Estimator and re-mark this project as Won to generate a baseline.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Planned values from baseline. Enter actual spend per period.</p>
        <Button size="sm" onClick={handleSave} disabled={isPending || dirty.size === 0}>
          <Save className="h-4 w-4 mr-1.5" />
          {isPending ? "Saving…" : `Save${dirty.size > 0 ? ` (${dirty.size})` : ""}`}
        </Button>
      </div>

      <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E2D45] bg-[#0D1526]/80">
              <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Period</th>
              <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Planned</th>
              <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actual</th>
              <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2D45]">
            {sortedPeriods.map(period => {
              const planned = plannedByPeriod[period] || 0
              const actualVal = parseFloat(values[period] || "0") || 0
              const v = planned - actualVal
              const fav = v >= 0
              const isDirty = dirty.has(period)
              return (
                <tr key={period} className={isDirty ? "bg-blue-900/10" : ""}>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {periodLabels[period] || period}
                    {isDirty && <span className="ml-1.5 text-[10px] text-blue-400">●</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{fmt(planned)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end">
                      <Input
                        type="number" min="0" step="100"
                        value={values[period] ?? ""}
                        onChange={e => handleChange(period, e.target.value)}
                        className="w-32 h-7 text-right text-sm tabular-nums"
                        placeholder="0"
                      />
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${planned === 0 && actualVal === 0 ? "text-muted-foreground" : fav ? "text-green-400" : "text-red-400"}`}>
                    {planned === 0 && actualVal === 0 ? "—" : `${fav ? "+" : ""}${fmt(v)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#1E2D45] bg-[#0D1526]">
              <td className="px-4 py-3 text-sm font-bold text-foreground">Total</td>
              <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">{fmt(totalPlanned)}</td>
              <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">{fmt(totalActual)}</td>
              <td className={`px-4 py-3 text-right font-bold tabular-nums ${totalPlanned === 0 && totalActual === 0 ? "text-muted-foreground" : favorable ? "text-green-400" : "text-red-400"}`}>
                {totalPlanned === 0 && totalActual === 0 ? "—" : `${favorable ? "+" : ""}${fmt(totalVar)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
