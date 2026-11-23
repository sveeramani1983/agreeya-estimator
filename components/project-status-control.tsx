"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Rocket, ExternalLink, Settings2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { OutcomeModal } from "@/components/outcome-modal"
import { ConvertToProjectModal } from "@/components/convert-to-project-modal"
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
  won: "bg-emerald-900/40 text-emerald-300 border-emerald-700/60",
  lost: "bg-red-900/40 text-red-300 border-red-700/60",
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

  const [pendingStatus, setPendingStatus] = useState<"lost" | null>(null)
  const [lossModalOpen, setLossModalOpen] = useState(false)
  const [convertModalOpen, setConvertModalOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
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
    if (status === "won") {
      setConvertModalOpen(true)
      return
    }
    if (status === "lost") {
      setPendingStatus("lost")
      setLossModalOpen(true)
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

  async function handleLifecycleChange(newStatus: ProjectLifecycleStatus) {
    setSavingLifecycle(true)
    try {
      await updateProject(projectId, { project_status: newStatus })
      toast.success(`Delivery status updated to ${LIFECYCLE_LABELS[newStatus]}.`)
      router.refresh()
    } catch {
      toast.error("Failed to update delivery status.")
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

        {/* Project Lifecycle Status row — visible when Won */}
        {currentStatus === "won" && (
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/40">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Delivery:</span>
              <Select
                value={project.project_status ?? "not_started"}
                onValueChange={(val) => { if (val) handleLifecycleChange(val as ProjectLifecycleStatus) }}
                disabled={savingLifecycle}
              >
                <SelectTrigger className="w-32 h-7 text-xs">
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

            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/20 gap-1 font-semibold"
            >
              <Link href={`/tracker/projects/${projectId}/overview`}>
                <Rocket className="h-3 w-3" />
                Tracker
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Structured Convert to Delivery Project Modal */}
      <ConvertToProjectModal
        open={convertModalOpen}
        onOpenChange={setConvertModalOpen}
        projectId={projectId}
        projectName={project.name}
        clientName={project.client_name}
        currentQuotedPrice={currentQuotedPrice}
        initialStartDate={project.project_start_date}
        initialTargetEndDate={project.project_target_end_date}
        onComplete={() => router.refresh()}
      />

      {/* Loss Outcome Modal */}
      {pendingStatus === "lost" && (
        <OutcomeModal
          open={lossModalOpen}
          onOpenChange={setLossModalOpen}
          projectId={projectId}
          status="lost"
          currentQuotedPrice={currentQuotedPrice}
          onComplete={() => {
            setLossModalOpen(false)
            setPendingStatus(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
