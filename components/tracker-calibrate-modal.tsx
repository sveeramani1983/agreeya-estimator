"use client"

import { useState } from "react"
import { toast } from "sonner"
import { applyCalibration } from "@/lib/tracker-actions"
import type { CalibrationSuggestion } from "@/lib/tracker-actions"
import { Loader2, Wand2, X } from "lucide-react"
import { useRouter } from "next/navigation"

interface Props {
  suggestions: CalibrationSuggestion[]
}

export function CalibrateLibraryButton({ suggestions }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(suggestions.map(s => s.libraryId)))
  const [saving, setSaving] = useState(false)

  if (suggestions.length === 0) return null

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleApply() {
    setSaving(true)
    try {
      const updates = suggestions
        .filter(s => selected.has(s.libraryId))
        .map(s => ({ libraryId: s.libraryId, newHours: s.suggestedHours }))
      await applyCalibration(updates)
      setOpen(false)
      toast.success(`Updated ${updates.length} component${updates.length !== 1 ? "s" : ""} in the library`)
      router.refresh()
    } catch {
      toast.error("Failed to update library. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-purple-800/50 bg-purple-900/20 hover:bg-purple-900/30 px-4 py-2 text-sm font-medium text-purple-300 transition-colors"
      >
        <Wand2 className="h-4 w-4" />
        Calibrate Component Library
        <span className="ml-1 rounded-full bg-purple-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {suggestions.length}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !saving && setOpen(false)} />

          <div className="relative w-full max-w-lg rounded-xl border border-[#1E2D45] bg-[#0D1526] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D45]">
              <div>
                <h2 className="text-base font-semibold text-foreground">Calibrate Component Library</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on actuals from tracked projects, these components consistently run over or under estimate.
                </p>
              </div>
              <button
                onClick={() => !saving && setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-[#1E2D45] text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-96 overflow-y-auto">
              {suggestions.map(s => (
                <label key={s.libraryId} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.has(s.libraryId)}
                    onChange={() => toggle(s.libraryId)}
                    className="mt-1 h-4 w-4 rounded border-[#1E2D45] accent-purple-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.componentName}</p>
                        <p className="text-xs text-muted-foreground">{s.category} · {s.sampleCount} data point{s.sampleCount !== 1 ? "s" : ""}</p>
                      </div>
                      <span className={`text-xs font-semibold shrink-0 ${s.variancePct > 0 ? "text-red-400" : "text-green-400"}`}>
                        {s.variancePct > 0 ? "+" : ""}{s.variancePct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-muted-foreground">Current: <span className="text-foreground">{s.currentHours} hrs</span></span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-muted-foreground">Suggested: <span className="text-purple-300 font-medium">{s.suggestedHours} hrs</span></span>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-[#1E2D45] bg-[#0A1120]">
              <button
                onClick={() => !saving && setOpen(false)}
                disabled={saving}
                className="flex-1 rounded-lg border border-[#1E2D45] px-4 py-2 text-sm text-muted-foreground hover:bg-[#1E2D45]/40 transition-colors disabled:opacity-50"
              >
                Keep Current
              </button>
              <button
                onClick={handleApply}
                disabled={saving || selected.size === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : `Update Library (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
