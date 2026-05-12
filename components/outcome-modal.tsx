"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { updateProjectOutcome } from "@/lib/actions"

interface OutcomeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  status: "won" | "lost"
  currentQuotedPrice: number
  onComplete: () => void
}

const WIN_FACTORS = [
  "Competitive pricing",
  "Technical approach",
  "Relationship / trust",
  "Past performance",
  "Team composition",
  "Response quality",
  "Speed of response",
] as const

const LOSS_REASONS = [
  "Price too high",
  "Competitor relationship stronger",
  "Technical approach not compelling",
  "Scope misalignment",
  "Missed deadline / late submission",
  "Team / resource concerns",
  "No-bid awarded (sole source)",
  "Project cancelled",
] as const

export function OutcomeModal({
  open,
  onOpenChange,
  projectId,
  status,
  currentQuotedPrice,
  onComplete,
}: OutcomeModalProps) {
  const router = useRouter()

  // Shared fields
  const [finalQuotedPrice, setFinalQuotedPrice] = useState<string>(
    currentQuotedPrice > 0 ? String(currentQuotedPrice) : ""
  )
  const [decisionDate, setDecisionDate] = useState<string>("")
  const [notes, setNotes] = useState<string>("")

  // Won-only fields
  const [actualContractValue, setActualContractValue] = useState<string>("")
  const [contractType, setContractType] = useState<string>("")
  const [winFactors, setWinFactors] = useState<string[]>([])

  // Lost-only fields
  const [competitor, setCompetitor] = useState<string>("")
  const [estimatedCompetitorPrice, setEstimatedCompetitorPrice] = useState<string>("")
  const [lossReasons, setLossReasons] = useState<string[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)

  function toggleWinFactor(factor: string) {
    setWinFactors((prev) =>
      prev.includes(factor) ? prev.filter((f) => f !== factor) : [...prev, factor]
    )
  }

  function toggleLossReason(reason: string) {
    setLossReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    )
  }

  async function handleRecordOutcome() {
    setIsSubmitting(true)
    try {
      let formData: Record<string, unknown>

      if (status === "won") {
        formData = {
          finalQuotedPrice: finalQuotedPrice ? Number(finalQuotedPrice) : null,
          actualContractValue: actualContractValue ? Number(actualContractValue) : null,
          contractType: contractType || null,
          decisionDate: decisionDate || null,
          winFactors,
          notes: notes || null,
        }
      } else {
        formData = {
          finalQuotedPrice: finalQuotedPrice ? Number(finalQuotedPrice) : null,
          competitor: competitor || null,
          estimatedCompetitorPrice: estimatedCompetitorPrice
            ? Number(estimatedCompetitorPrice)
            : null,
          decisionDate: decisionDate || null,
          lossReasons,
          notes: notes || null,
        }
      }

      await updateProjectOutcome(projectId, status, formData)
      toast.success(
        status === "won"
          ? "Win outcome recorded successfully."
          : "Loss outcome recorded successfully."
      )
      router.refresh()
      onComplete()
    } catch {
      toast.error("Failed to record outcome. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSkip() {
    setIsSubmitting(true)
    try {
      await updateProjectOutcome(projectId, status, null)
      toast.success(
        status === "won" ? "Project marked as won." : "Project marked as lost."
      )
      router.refresh()
      onComplete()
    } catch {
      toast.error("Failed to update project status. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isWon = status === "won"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isWon ? "Record Win Outcome" : "Record Loss Outcome"}
          </DialogTitle>
          <DialogDescription>
            {isWon
              ? "Capture details about this won project to improve future estimates."
              : "Capture details about this loss to identify patterns and improve win rates."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Final Quoted Price */}
          <div className="space-y-1.5">
            <Label htmlFor="finalQuotedPrice">Final Quoted Price ($)</Label>
            <Input
              id="finalQuotedPrice"
              type="number"
              min={0}
              value={finalQuotedPrice}
              onChange={(e) => setFinalQuotedPrice(e.target.value)}
              placeholder="0"
            />
          </div>

          {isWon ? (
            <>
              {/* Actual Contract Value */}
              <div className="space-y-1.5">
                <Label htmlFor="actualContractValue">Actual Contract Value ($)</Label>
                <Input
                  id="actualContractValue"
                  type="number"
                  min={0}
                  value={actualContractValue}
                  onChange={(e) => setActualContractValue(e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Contract Type */}
              <div className="space-y-1.5">
                <Label>Contract Type</Label>
                <Select value={contractType} onValueChange={(val) => setContractType(val || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contract type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed Price">Fixed Price</SelectItem>
                    <SelectItem value="T&M">T&amp;M</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Decision Date */}
              <div className="space-y-1.5">
                <Label htmlFor="decisionDate">Decision Date</Label>
                <Input
                  id="decisionDate"
                  type="date"
                  value={decisionDate}
                  onChange={(e) => setDecisionDate(e.target.value)}
                />
              </div>

              <Separator />

              {/* Key Win Factors */}
              <div className="space-y-2">
                <Label>Key Win Factors</Label>
                <div className="grid grid-cols-1 gap-2">
                  {WIN_FACTORS.map((factor) => (
                    <div key={factor} className="flex items-center gap-2">
                      <Checkbox
                        id={`win-${factor}`}
                        checked={winFactors.includes(factor)}
                        onCheckedChange={() => toggleWinFactor(factor)}
                      />
                      <Label
                        htmlFor={`win-${factor}`}
                        className="font-normal cursor-pointer"
                      >
                        {factor}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Competitor */}
              <div className="space-y-1.5">
                <Label htmlFor="competitor">Competitor (if known)</Label>
                <Input
                  id="competitor"
                  type="text"
                  value={competitor}
                  onChange={(e) => setCompetitor(e.target.value)}
                  placeholder="Competitor name"
                />
              </div>

              {/* Estimated Competitor Price */}
              <div className="space-y-1.5">
                <Label htmlFor="estimatedCompetitorPrice">
                  Estimated Competitor Price ($)
                  <span className="ml-1 text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id="estimatedCompetitorPrice"
                  type="number"
                  min={0}
                  value={estimatedCompetitorPrice}
                  onChange={(e) => setEstimatedCompetitorPrice(e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Decision Date */}
              <div className="space-y-1.5">
                <Label htmlFor="decisionDate">Decision Date</Label>
                <Input
                  id="decisionDate"
                  type="date"
                  value={decisionDate}
                  onChange={(e) => setDecisionDate(e.target.value)}
                />
              </div>

              <Separator />

              {/* Loss Reasons */}
              <div className="space-y-2">
                <Label>Loss Reasons</Label>
                <div className="grid grid-cols-1 gap-2">
                  {LOSS_REASONS.map((reason) => (
                    <div key={reason} className="flex items-center gap-2">
                      <Checkbox
                        id={`loss-${reason}`}
                        checked={lossReasons.includes(reason)}
                        onCheckedChange={() => toggleLossReason(reason)}
                      />
                      <Label
                        htmlFor={`loss-${reason}`}
                        className="font-normal cursor-pointer"
                      >
                        {reason}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context or observations..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Skip for Now
          </Button>
          <Button
            onClick={handleRecordOutcome}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? "Saving..." : "Record Outcome & Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
