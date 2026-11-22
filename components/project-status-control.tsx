"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OutcomeModal } from "@/components/outcome-modal"
import { updateProjectOutcome, updateProject, updateProjectPursuitData } from "@/lib/actions"
import { Project, ProjectStatus, ProjectLifecycleStatus } from "@/lib/types"

interface ProjectStatusControlProps {
  projectId: string
  project: Project
  currentQuotedPrice: number
}

const ESTIMATE_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
}

const ESTIMATE_BADGE_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  submitted: "bg-blue-100 text-blue-700 border-blue-300",
  won: "bg-green-100 text-green-700 border-green-300",
  lost: "bg-red-100 text-red-700 border-red-300",
}

const LIFECYCLE_LABELS: Record<ProjectLifecycleStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
}

export function ProjectStatusControl({
  projectId,
  project,
  currentQuotedPrice,
}: ProjectStatusControlProps) {
  const router = useRouter()
  const currentStatus = project.status

  const [pendingStatus, setPendingStatus] = useState<"won" | "lost" | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  // Project dates dialog (shown after marking Won)
  const [datesOpen, setDatesOpen] = useState(false)
  const [startDate, setStartDate] = useState(project.project_start_date ?? "")
  const [targetEndDate, setTargetEndDate] = useState(project.project_target_end_date ?? "")
  const [savingDates, setSavingDates] = useState(false)

  const [savingLifecycle, setSavingLifecycle] = useState(false)

  // Win probability inline state
  const defaultProb = currentStatus === 'won' ? 100 : currentStatus === 'lost' ? 0 : (project.win_probability ?? 50)
  const [winProb, setWinProb] = useState(defaultProb)
  const [savingProb, setSavingProb] = useState(false)

  async function handleProbBlur() {
    const clamped = Math.min(100, Math.max(0, winProb))
    setWinProb(clamped)
    if (clamped === (project.win_probability ?? 50)) return
    setSavingProb(true)
    try {
      await updateProjectPursuitData(projectId, { win_probability: clamped })
      router.refresh()
    } catch {
      toast.error("Failed to save win probability.")
    } finally {
      setSavingProb(false)
    }
  }

  function probDotClass(p: number) {
    if (p >= 70) return "bg-green-500"
    if (p >= 40) return "bg-amber-500"
    return "bg-red-500"
  }

  async function handleEstimateStatusChange(newStatus: string) {
    const status = newStatus as ProjectStatus
    if (status === "won" || status === "lost") {
      setPendingStatus(status)
      setModalOpen(true)
      return
    }
    setIsUpdating(true)
    try {
      await updateProjectOutcome(projectId, status, null)
      toast.success(`Estimate status updated to ${ESTIMATE_STATUS_LABELS[status]}.`)
      router.refresh()
    } catch {
      toast.error("Failed to update estimate status.")
    } finally {
      setIsUpdating(false)
    }
  }

  function handleModalComplete() {
    setModalOpen(false)
    if (pendingStatus === "won") {
      // Prompt for project dates
      setDatesOpen(true)
    } else {
      setPendingStatus(null)
      router.refresh()
    }
  }

  function handleModalOpenChange(open: boolean) {
    setModalOpen(open)
    if (!open) setPendingStatus(null)
  }

  async function handleSaveDates() {
    setSavingDates(true)
    try {
      await updateProject(projectId, {
        project_start_date: startDate || null,
        project_target_end_date: targetEndDate || null,
      })
      toast.success("Project dates saved.")
    } catch {
      toast.error("Failed to save project dates.")
    } finally {
      setSavingDates(false)
      setDatesOpen(false)
      setPendingStatus(null)
      router.refresh()
    }
  }

  function handleSkipDates() {
    setDatesOpen(false)
    setPendingStatus(null)
    router.refresh()
  }

  async function handleLifecycleChange(newStatus: ProjectLifecycleStatus) {
    setSavingLifecycle(true)
    try {
      await updateProject(projectId, { project_status: newStatus })
      toast.success(`Project status updated to ${LIFECYCLE_LABELS[newStatus]}.`)
      router.refresh()
    } catch {
      toast.error("Failed to update project status.")
    } finally {
      setSavingLifecycle(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Estimate Status row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Estimate:</span>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ESTIMATE_BADGE_CLASSES[currentStatus]}`}>
            {ESTIMATE_STATUS_LABELS[currentStatus]}
          </span>
          <Select
            value={currentStatus}
            onValueChange={(val) => { if (val) handleEstimateStatusChange(val) }}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-36 h-8 text-sm capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Win Probability row — only for draft / submitted */}
        {(currentStatus === "draft" || currentStatus === "submitted") && (
          <div className="flex items-center gap-2 pt-1.5 border-t border-border/40">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Win Prob:</span>
            <div className={`h-2 w-2 rounded-full shrink-0 ${probDotClass(winProb)}`} />
            <input
              type="number"
              min={0}
              max={100}
              value={winProb}
              onChange={e => setWinProb(Number(e.target.value))}
              onBlur={handleProbBlur}
              disabled={savingProb}
              className="w-14 h-7 rounded border border-border/60 bg-transparent px-2 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        )}

        {/* Project Lifecycle Status row — only visible when Won */}
        {currentStatus === "won" && (
          <div className="flex items-center gap-2 pt-1.5 border-t border-border/40">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Project:</span>
            <Select
              value={project.project_status ?? "not_started"}
              onValueChange={(val) => { if (val) handleLifecycleChange(val as ProjectLifecycleStatus) }}
              disabled={savingLifecycle}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Outcome modal (win/loss details) */}
      {pendingStatus && (
        <OutcomeModal
          open={modalOpen}
          onOpenChange={handleModalOpenChange}
          projectId={projectId}
          status={pendingStatus}
          currentQuotedPrice={currentQuotedPrice}
          onComplete={handleModalComplete}
        />
      )}

      {/* Project dates dialog — shown automatically after marking Won */}
      <Dialog open={datesOpen} onOpenChange={(open) => { if (!open) handleSkipDates() }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Project Dates</DialogTitle>
            <DialogDescription>
              Optionally set a start date and target end date. These are used to track delivery progress in the Project Health section.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-start">Start Date</Label>
              <Input
                id="proj-start"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-end">Target End Date</Label>
              <Input
                id="proj-end"
                type="date"
                value={targetEndDate}
                min={startDate || undefined}
                onChange={e => setTargetEndDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={handleSkipDates}>
              Skip for now
            </Button>
            <Button size="sm" onClick={handleSaveDates} disabled={savingDates}>
              {savingDates ? "Saving…" : "Save Dates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
