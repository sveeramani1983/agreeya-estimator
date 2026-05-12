"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { History, Camera, RotateCcw, GitCompare, Clock } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { EstimateVersion, WBSComponent } from "@/lib/types"
import { createEstimateVersion, restoreEstimateVersion } from "@/lib/actions"

interface VersionsWorkspaceProps {
  projectId: string
  initialVersions: EstimateVersion[]
  currentTotals: { hours: number; sp: number; cost: number }
}

interface SnapshotData {
  wbsComponents?: WBSComponent[]
}

function formatCost(value: number | null): string {
  if (value === null) return "—"
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDatetime(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy 'at' h:mm a")
  } catch {
    return iso
  }
}

function isAutoSave(label: string): boolean {
  return label.startsWith("Auto-save")
}

export function VersionsWorkspace({
  projectId,
  initialVersions,
  currentTotals,
}: VersionsWorkspaceProps) {
  const router = useRouter()

  const [versions, setVersions] = useState<EstimateVersion[]>(initialVersions)

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveLabel, setSaveLabel] = useState("")
  const [saveNotes, setSaveNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const [restoreTarget, setRestoreTarget] = useState<EstimateVersion | null>(null)
  const [restoring, setRestoring] = useState(false)

  const [compareTarget, setCompareTarget] = useState<EstimateVersion | null>(null)

  const handleSaveVersion = async () => {
    if (!saveLabel.trim()) {
      toast.error("Version label is required.")
      return
    }
    setSaving(true)
    try {
      await createEstimateVersion(projectId, saveLabel.trim(), saveNotes.trim() || null)
      toast.success("Version saved successfully.")
      setSaveDialogOpen(false)
      setSaveLabel("")
      setSaveNotes("")
      router.refresh()
    } catch {
      toast.error("Failed to save version. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await restoreEstimateVersion(projectId, restoreTarget.id)
      toast.success(`Restored to ${restoreTarget.version_label}.`)
      setRestoreTarget(null)
      router.push(`/projects/${projectId}/estimate`)
    } catch {
      toast.error("Failed to restore version. Please try again.")
      setRestoring(false)
    }
  }

  const compareSnapshot = compareTarget
    ? (() => {
        try {
          return JSON.parse(compareTarget.snapshot) as SnapshotData
        } catch {
          return null
        }
      })()
    : null

  const compareComponents: WBSComponent[] = compareSnapshot?.wbsComponents ?? []

  const compareTotalHours = compareComponents.reduce((acc, c) => acc + (c.base_hours || 0), 0)
  const compareTotalSP = compareComponents.reduce(
    (acc, c) => acc + (c.complexity !== "spike" ? c.story_points || 0 : 0),
    0
  )

  const categoriesMap = compareComponents.reduce<Record<string, WBSComponent[]>>((acc, c) => {
    const cat = c.category || "Uncategorized"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold">Version History</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {versions.length === 0
                ? "No saved versions yet."
                : `${versions.length} saved version${versions.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setSaveDialogOpen(true)}
          className="gap-2 bg-sidebar text-white hover:bg-sidebar-accent"
        >
          <Camera className="h-4 w-4" />
          Save Current Version
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-dashed border-[#1E2D45] bg-[#0D1526]/30 text-center space-y-4">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-[#1E2D45]">
                <History className="h-8 w-8 text-[#94A3B8]" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">No versions saved yet</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Save snapshots of your estimate to track changes over time and restore previous
                  states at any point.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setSaveDialogOpen(true)}
                className="gap-2 mt-2"
              >
                <Camera className="h-4 w-4" />
                Save First Version
              </Button>
            </div>
          ) : (
            <div className="relative space-y-0">
              <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" aria-hidden />
              {versions.map((version, index) => {
                const auto = isAutoSave(version.version_label)
                return (
                  <div key={version.id} className="relative flex gap-4 pb-4">
                    <div
                      className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                        auto
                          ? "bg-[#1E2D45] border-[#2D3F5A]"
                          : "bg-[#111827] border-primary shadow-sm"
                      }`}
                    >
                      {auto ? (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Camera className="h-4 w-4 text-sidebar" />
                      )}
                    </div>

                    <Card
                      className={`flex-1 shadow-sm transition-all ${
                        auto
                          ? "bg-[#0D1526]/50 border-[#1E2D45]"
                          : "bg-[#111827] border-border hover:shadow-md"
                      }`}
                    >
                      <CardHeader className="pb-3 pt-4 px-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={auto ? "secondary" : "default"}
                              className={
                                auto
                                  ? "bg-[#1E2D45] text-[#94A3B8] hover:bg-[#1E2D45]"
                                  : "bg-blue-900/30 text-blue-300 hover:bg-blue-900/30 border-blue-800/50"
                              }
                            >
                              v{version.version_number}
                            </Badge>
                            <span
                              className={`font-semibold text-sm ${
                                auto ? "text-muted-foreground" : "text-foreground"
                              }`}
                            >
                              {version.version_label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 h-7 text-xs"
                              onClick={() => setCompareTarget(version)}
                            >
                              <GitCompare className="h-3 w-3" />
                              Compare
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 h-7 text-xs text-red-400 border-red-900/50 hover:bg-red-900/20 hover:text-red-300"
                              onClick={() => setRestoreTarget(version)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restore
                            </Button>
                          </div>
                        </div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>
                          {formatDatetime(version.created_at)}
                        </p>
                      </CardHeader>
                      <CardContent className="px-5 pb-4 space-y-3">
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Hours</span>
                            <span className={`text-sm font-semibold tabular-nums ${auto ? "text-muted-foreground" : ""}`}>
                              {version.total_hours !== null ? version.total_hours.toLocaleString("en-US") : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">SP</span>
                            <span className={`text-sm font-semibold tabular-nums ${auto ? "text-muted-foreground" : ""}`}>
                              {version.total_sp !== null ? version.total_sp.toLocaleString("en-US") : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Cost</span>
                            <span className={`text-sm font-semibold tabular-nums ${auto ? "text-muted-foreground" : "text-sidebar"}`}>
                              {formatCost(version.total_cost)}
                            </span>
                          </div>
                        </div>
                        {version.notes && (
                          <p className="text-xs text-muted-foreground italic leading-relaxed">
                            {version.notes}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-t-4 border-t-sidebar shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Current State
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Hours</span>
                  <span className="font-semibold tabular-nums">
                    {currentTotals.hours.toLocaleString("en-US")}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Story Points</span>
                  <span className="font-semibold tabular-nums">
                    {currentTotals.sp.toLocaleString("en-US")}
                  </span>
                </div>
                <Separator className="opacity-50" />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Cost</span>
                  <span className="font-bold tabular-nums text-sidebar text-base">
                    {formatCost(currentTotals.cost)}
                  </span>
                </div>
              </div>
              <Button
                className="w-full gap-2 bg-sidebar text-white hover:bg-sidebar-accent"
                onClick={() => setSaveDialogOpen(true)}
              >
                <Camera className="h-4 w-4" />
                Save Snapshot
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-amber-50/60 border-amber-200">
            <CardContent className="px-5 py-4">
              <p className="text-xs font-semibold text-amber-800 mb-1">About version history</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Restoring a version replaces the current estimate. Your current state is
                auto-saved as a backup before any restore.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSaveLabel("")
            setSaveNotes("")
          }
          setSaveDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-sidebar" />
              Save Current Version
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="version-label">
                Version Label <span className="text-red-500">*</span>
              </Label>
              <Input
                id="version-label"
                placeholder="e.g. v1 — Initial Scope"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) handleSaveVersion()
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version-notes">Notes (optional)</Label>
              <Textarea
                id="version-notes"
                placeholder="Describe what changed in this version..."
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveLabel("")
                setSaveNotes("")
                setSaveDialogOpen(false)
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveVersion}
              disabled={saving || !saveLabel.trim()}
              className="gap-2 bg-sidebar text-white hover:bg-sidebar-accent"
            >
              <Camera className="h-4 w-4" />
              {saving ? "Saving..." : "Save Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open && !restoring) setRestoreTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore v{restoreTarget?.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm text-muted-foreground block">
              <span className="block">
                You are about to restore{" "}
                <span className="font-semibold text-foreground">
                  {restoreTarget?.version_label}
                </span>{" "}
                saved on{" "}
                {restoreTarget ? formatDatetime(restoreTarget.created_at) : ""}.
              </span>
              <span className="block">
                Restoring will replace your current estimate with this version&apos;s WBS
                components, overhead config, resources, and commercials. Your current state
                will be auto-saved first as a backup.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreConfirm}
              disabled={restoring}
              className="bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {restoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!compareTarget} onOpenChange={(open) => !open && setCompareTarget(null)}>
        <SheetContent side="right" className="w-full sm:max-w-4xl sm:!max-w-4xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <GitCompare className="h-5 w-5 text-sidebar" />
              {compareTarget
                ? `Compare v${compareTarget.version_number} — ${compareTarget.version_label}`
                : "Compare"}
            </SheetTitle>
            {compareTarget && (
              <p className="text-xs text-muted-foreground">
                Snapshot saved {formatDatetime(compareTarget.created_at)}
              </p>
            )}
          </SheetHeader>

          {compareTarget && (
            <div className="py-5 space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-[#0D1526] p-3 text-center">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
                    Hours
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    {compareTarget.total_hours !== null
                      ? compareTarget.total_hours.toLocaleString("en-US")
                      : compareTotalHours.toLocaleString("en-US")}
                  </p>
                </div>
                <div className="rounded-lg border bg-[#0D1526] p-3 text-center">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
                    Story Points
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    {compareTarget.total_sp !== null
                      ? compareTarget.total_sp.toLocaleString("en-US")
                      : compareTotalSP.toLocaleString("en-US")}
                  </p>
                </div>
                <div className="rounded-lg border bg-blue-50 border-blue-200 p-3 text-center">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-blue-600 mb-1">
                    Total Cost
                  </p>
                  <p className="text-xl font-bold tabular-nums text-blue-700">
                    {formatCost(compareTarget.total_cost)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  WBS Components ({compareComponents.length})
                </p>
              </div>

              {compareComponents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                  <History className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No WBS components in this snapshot.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(categoriesMap).map(([category, components]) => {
                    const catHours = components.reduce((a, c) => a + (c.base_hours || 0), 0)
                    const catSP = components.reduce(
                      (a, c) => a + (c.complexity !== "spike" ? c.story_points || 0 : 0),
                      0
                    )
                    return (
                      <div key={category} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">
                            {category}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{catHours.toLocaleString("en-US")} hrs</span>
                            <span>{catSP} SP</span>
                          </div>
                        </div>
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[#0D1526] border-b border-[#1E2D45]">
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">
                                  Component
                                </th>
                                <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-24">
                                  Complexity
                                </th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-20">
                                  Hours
                                </th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-16">
                                  SP
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {components.map((comp) => (
                                <tr key={comp.id} className="border-b border-[#1E2D45] last:border-0 hover:bg-[#162032]/50">
                                  <td className="px-3 py-2 font-medium text-sm">
                                    {comp.component_name}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <ComplexityBadge complexity={comp.complexity} />
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {(comp.base_hours || 0).toLocaleString("en-US")}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {comp.complexity !== "spike" ? comp.story_points || 0 : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}

                  <Separator />

                  <div className="rounded-md bg-[#0D1526] border border-[#1E2D45] p-3">
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>Total</span>
                      <div className="flex items-center gap-6 tabular-nums">
                        <span>{compareTotalHours.toLocaleString("en-US")} hrs</span>
                        <span>{compareTotalSP} SP</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ComplexityBadge({ complexity }: { complexity: WBSComponent["complexity"] }) {
  const map: Record<WBSComponent["complexity"], { label: string; className: string }> = {
    simple: { label: "Simple", className: "bg-green-50 text-green-700 border-green-200" },
    medium: { label: "Medium", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    complex: { label: "Complex", className: "bg-orange-50 text-orange-700 border-orange-200" },
    very_complex: { label: "Very Complex", className: "bg-red-50 text-red-700 border-red-200" },
    spike: { label: "Spike", className: "bg-purple-50 text-purple-700 border-purple-200" },
  }
  const { label, className } = map[complexity] ?? { label: complexity, className: "" }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}
    >
      {label}
    </span>
  )
}
