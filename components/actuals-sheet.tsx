"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, BarChart2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

import { WBSComponent, WBSActual } from "@/lib/types"
import { upsertWBSActuals } from "@/lib/actions"

interface ActualsSheetProps {
  projectId: string
  components: WBSComponent[]
  existingActuals: WBSActual[]
  open: boolean
  onClose: () => void
}

function accuracyBadge(pct: number) {
  if (pct <= 100) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400">{pct}%</span>
  if (pct <= 120) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400">{pct}%</span>
  return          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400">{pct}%</span>
}

export function ActualsSheet({ projectId, components, existingActuals, open, onClose }: ActualsSheetProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // local state: component_id → actual hours string (empty = not set)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const a of existingActuals) {
      init[a.wbs_component_id] = String(a.actual_hours)
    }
    return init
  })

  const billableComponents = useMemo(
    () => components.filter(c => c.complexity !== "spike" && c.base_hours > 0),
    [components]
  )

  // Group by category
  const byCategory = useMemo(() => {
    const map: Record<string, WBSComponent[]> = {}
    for (const c of billableComponents) {
      const cat = c.category || "Other"
      if (!map[cat]) map[cat] = []
      map[cat].push(c)
    }
    return map
  }, [billableComponents])

  const totalEstimated = billableComponents.reduce((s, c) => s + c.base_hours, 0)
  const totalActual = billableComponents.reduce((s, c) => {
    const v = parseFloat(values[c.id] ?? "")
    return s + (isNaN(v) ? 0 : v)
  }, 0)
  const recordedCount = billableComponents.filter(c => values[c.id] !== undefined && values[c.id] !== "").length
  const overallPct = totalEstimated > 0 && recordedCount > 0
    ? Math.round((totalActual / totalEstimated) * 100) : null

  const handleSave = async () => {
    const actuals = billableComponents
      .filter(c => values[c.id] !== undefined && values[c.id] !== "")
      .map(c => ({ wbs_component_id: c.id, actual_hours: parseFloat(values[c.id]) }))
      .filter(a => !isNaN(a.actual_hours))

    if (!actuals.length) {
      toast.error("Enter at least one actual hours value before saving.")
      return
    }

    setSaving(true)
    try {
      await upsertWBSActuals(projectId, actuals)
      toast.success(`Actuals saved for ${actuals.length} component${actuals.length !== 1 ? "s" : ""}.`)
      onClose()
      router.refresh()
    } catch {
      toast.error("Failed to save actuals.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="overflow-y-auto" style={{ width: "680px", maxWidth: "95vw" }}>
        <SheetHeader className="pb-4 border-b border-[#1E2D45]">
          <SheetTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-green-400" />
            Record Actual Hours
          </SheetTitle>
          <SheetDescription>
            Enter actual delivery hours per component to track estimation accuracy.
          </SheetDescription>
        </SheetHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 my-4 px-6">
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Estimated</p>
            <p className="text-lg font-black text-foreground">{Math.round(totalEstimated)}<span className="text-xs font-normal ml-0.5">h</span></p>
          </div>
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Actual (so far)</p>
            <p className="text-lg font-black text-foreground">{Math.round(totalActual)}<span className="text-xs font-normal ml-0.5">h</span></p>
          </div>
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Accuracy</p>
            {overallPct !== null
              ? <p className={`text-lg font-black ${overallPct <= 100 ? "text-green-400" : overallPct <= 120 ? "text-amber-400" : "text-red-400"}`}>{overallPct}%</p>
              : <p className="text-lg font-black text-muted-foreground">—</p>
            }
          </div>
        </div>

        <Separator className="bg-[#1E2D45] mb-4" />

        {/* Component rows grouped by category */}
        <div className="space-y-5 pb-24 px-6">
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2">{cat}</p>
              <div className="space-y-2">
                {items.map(c => {
                  const raw = values[c.id] ?? ""
                  const actual = parseFloat(raw)
                  const pct = !isNaN(actual) && c.base_hours > 0
                    ? Math.round((actual / c.base_hours) * 100) : null
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-[#1E2D45] bg-[#111827] px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{c.component_name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.base_hours} hrs estimated</p>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="actual"
                        value={raw}
                        onChange={e => setValues(prev => ({ ...prev, [c.id]: e.target.value }))}
                        onFocus={e => e.target.select()}
                        className="w-24 h-8 text-xs text-center bg-[#0D1526] border-[#1E2D45]"
                      />
                      <div className="w-12 text-right">
                        {pct !== null ? accuracyBadge(pct) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Fixed footer */}
        <div className="fixed bottom-0 right-0 bg-[#0D1526] border-t border-[#1E2D45] px-6 py-4 flex items-center justify-between" style={{ width: "680px", maxWidth: "95vw" }}>
          <p className="text-xs text-muted-foreground">{recordedCount} of {billableComponents.length} components recorded</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}
              className="bg-green-700 hover:bg-green-600 text-white gap-1.5">
              {saving ? "Saving…" : <><CheckCircle2 className="h-4 w-4" /> Save Actuals</>}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
