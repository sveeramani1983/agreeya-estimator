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
import { OutcomeModal } from "@/components/outcome-modal"
import { updateProjectOutcome } from "@/lib/actions"
import { ProjectStatus } from "@/lib/types"

interface ProjectStatusControlProps {
  projectId: string
  currentStatus: ProjectStatus
  currentQuotedPrice: number
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
}

const STATUS_BADGE_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  submitted: "bg-blue-100 text-blue-700 border-blue-300",
  won: "bg-green-100 text-green-700 border-green-300",
  lost: "bg-red-100 text-red-700 border-red-300",
}

export function ProjectStatusControl({
  projectId,
  currentStatus,
  currentQuotedPrice,
}: ProjectStatusControlProps) {
  const router = useRouter()
  const [pendingStatus, setPendingStatus] = useState<"won" | "lost" | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  async function handleStatusChange(newStatus: string) {
    const status = newStatus as ProjectStatus

    if (status === "won" || status === "lost") {
      setPendingStatus(status)
      setModalOpen(true)
      return
    }

    // Draft or Submitted — no modal, update immediately
    setIsUpdating(true)
    try {
      await updateProjectOutcome(projectId, status, null)
      toast.success(`Project status updated to ${STATUS_LABELS[status]}.`)
      router.refresh()
    } catch {
      toast.error("Failed to update project status. Please try again.")
    } finally {
      setIsUpdating(false)
    }
  }

  function handleModalComplete() {
    setModalOpen(false)
    setPendingStatus(null)
    router.refresh()
  }

  function handleModalOpenChange(open: boolean) {
    setModalOpen(open)
    if (!open) {
      setPendingStatus(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[currentStatus]}`}
        >
          {STATUS_LABELS[currentStatus]}
        </span>

        <Select
          value={currentStatus}
          onValueChange={(val) => { if (val) handleStatusChange(val) }}
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
    </>
  )
}
