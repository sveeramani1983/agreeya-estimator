"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { applyCalibrationUpdatesAction } from "@/lib/actions"
import type { CalibrationSuggestion } from "@/lib/intelligence"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type FilterMode = 'all' | 'over' | 'under'
type MinSamples = 3 | 5 | 10

function VarianceBadge({ pct }: { pct: number }) {
  const abs = Math.abs(pct)
  const color = abs > 15
    ? pct > 0 ? '#DC2626' : '#059669'
    : abs > 5
      ? pct > 0 ? '#D97706' : '#059669'
      : 'var(--text-secondary, #94A3B8)'
  return (
    <span className="font-semibold tabular-nums" style={{ color }}>
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  )
}

interface Props {
  suggestions: CalibrationSuggestion[]
  health: {
    totalComponents: number
    withData: number
    wellCalibrated: number
    needsUpdate: number
    avgError: number
  }
}

export function CalibrationPageClient({ suggestions, health }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [minSamples, setMinSamples] = useState<MinSamples>(3)
  const [confirmAll, setConfirmAll] = useState(false)
  const [saving, setSaving] = useState(false)

  const filtered = suggestions.filter(s => {
    if (minSamples > s.sampleCount) return false
    if (filter === 'over' && s.direction !== 'over') return false
    if (filter === 'under' && s.direction !== 'under') return false
    return true
  })

  async function applyOne(s: CalibrationSuggestion) {
    setSaving(true)
    try {
      await applyCalibrationUpdatesAction([{ libraryId: s.libraryId, newHours: s.suggestedHours }])
      toast.success(`Updated ${s.componentName} to ${s.suggestedHours} hrs`)
      router.refresh()
    } catch {
      toast.error("Failed to update")
    } finally {
      setSaving(false)
    }
  }

  async function applyAll() {
    setSaving(true)
    try {
      const updates = filtered.map(s => ({ libraryId: s.libraryId, newHours: s.suggestedHours }))
      await applyCalibrationUpdatesAction(updates)
      toast.success(`Updated ${updates.length} component${updates.length !== 1 ? 's' : ''}`)
      setConfirmAll(false)
      router.refresh()
    } catch {
      toast.error("Failed to update")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Library Health Summary */}
      <div
        style={{
          background: 'color-mix(in srgb, #2563EB 6%, #111827)',
          border: '1px solid color-mix(in srgb, #2563EB 30%, #1E2D45)',
          borderRadius: 8,
          padding: '16px 20px',
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-3">Library Health</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Components with data</p>
            <p className="font-bold text-foreground text-lg">
              {health.withData} <span className="text-xs font-normal text-muted-foreground">of {health.totalComponents}</span>
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Well calibrated (±10%)</p>
            <p className="font-bold text-green-400 text-lg">{health.wellCalibrated}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Needs update (&gt;15%)</p>
            <p className="font-bold text-amber-400 text-lg">{health.needsUpdate}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Avg estimation error</p>
            <p className="font-bold text-foreground text-lg">
              +{health.avgError}%
              {health.avgError > 0 && (
                <span className="text-[10px] font-normal text-muted-foreground ml-1">(tend to underestimate)</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          {(['all', 'over', 'under'] as FilterMode[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${
                filter === f ? 'bg-blue-600 text-white border-blue-600' : 'border-[#1E2D45] text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'All' : f === 'over' ? 'Over Estimate' : 'Under Estimate'}
            </button>
          ))}
          <div className="h-5 border-l border-[#1E2D45] mx-1" />
          <label className="text-xs text-muted-foreground">Min samples:</label>
          <select
            value={minSamples}
            onChange={e => setMinSamples(Number(e.target.value) as MinSamples)}
            className="h-8 rounded-md border border-[#1E2D45] bg-[#111827] px-2 text-xs text-muted-foreground focus:outline-none"
          >
            <option value={3}>3+</option>
            <option value={5}>5+</option>
            <option value={10}>10+</option>
          </select>
        </div>

        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAll(true)}
            disabled={saving}
            className="gap-2"
          >
            Update All Suggestions ({filtered.length})
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-[#1E2D45] p-12 text-center">
          <p className="text-sm font-semibold text-foreground">No calibration data available</p>
          <p className="text-sm text-muted-foreground mt-1">
            {suggestions.length === 0
              ? 'Calibration data becomes available after 3+ projects have component actuals recorded in the Tracker.'
              : 'No components match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-[#1E2D45] bg-[#111827] overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0D1526]">
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right w-[110px]">Est Hrs</TableHead>
                <TableHead className="text-right w-[110px]">Avg Actual</TableHead>
                <TableHead className="text-right w-[100px]">Variance</TableHead>
                <TableHead className="text-right w-[90px]">Samples</TableHead>
                <TableHead className="w-[100px]">Confidence</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.libraryId}>
                  <TableCell className="font-medium text-foreground">{s.componentName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.category}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{s.currentEstimate} hrs</TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {s.avgActual} hrs
                    <span className="text-[10px] text-muted-foreground ml-1">({s.minActual}–{s.maxActual})</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <VarianceBadge pct={s.variancePercent} />
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{s.sampleCount}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${
                      s.confidence === 'high'
                        ? 'bg-green-900/30 text-green-300 border-green-800/50'
                        : s.confidence === 'medium'
                          ? 'bg-amber-900/30 text-amber-300 border-amber-800/50'
                          : 'bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A]'
                    }`}>
                      {s.confidence}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={saving}
                      onClick={() => applyOne(s)}
                    >
                      Update
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Confirm All dialog */}
      <AlertDialog open={confirmAll} onOpenChange={o => !saving && setConfirmAll(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update base hours for {filtered.length} components?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update base hours for {filtered.length} component{filtered.length !== 1 ? 's' : ''} based on actuals data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyAll} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? 'Updating…' : 'Confirm Update'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
