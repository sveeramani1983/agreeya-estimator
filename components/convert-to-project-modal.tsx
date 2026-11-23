"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
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
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Rocket,
  ShieldCheck,
  Calendar,
  DollarSign,
  User,
  CheckCircle2,
  Clock,
  ArrowRight,
  Layers,
  Sparkles,
  Loader2,
} from "lucide-react"
import { convertWonEstimateToDeliveryProject } from "@/lib/actions"

interface ConvertToProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  clientName?: string | null
  currentQuotedPrice: number
  initialStartDate?: string | null
  initialTargetEndDate?: string | null
  onComplete?: () => void
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

export function ConvertToProjectModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  clientName,
  currentQuotedPrice,
  initialStartDate,
  initialTargetEndDate,
  onComplete,
}: ConvertToProjectModalProps) {
  const router = useRouter()

  // Form states
  const [contractValue, setContractValue] = useState<string>(
    currentQuotedPrice > 0 ? String(Math.round(currentQuotedPrice)) : ""
  )
  const [decisionDate, setDecisionDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  )
  const [winFactors, setWinFactors] = useState<string[]>([
    "Technical approach",
    "Competitive pricing",
  ])
  const [startDate, setStartDate] = useState<string>(initialStartDate || "")
  const [targetEndDate, setTargetEndDate] = useState<string>(initialTargetEndDate || "")
  const [reportingCadence, setReportingCadence] = useState<"weekly" | "bi-weekly" | "monthly">("weekly")
  const [pmName, setPmName] = useState<string>("")
  const [pmEmail, setPmEmail] = useState<string>("")
  const [notes, setNotes] = useState<string>("")

  const [converting, setConverting] = useState(false)
  const [launchTracker, setLaunchTracker] = useState(true)

  const toggleWinFactor = (factor: string) => {
    setWinFactors((prev) =>
      prev.includes(factor) ? prev.filter((f) => f !== factor) : [...prev, factor]
    )
  }

  const handleConvert = async (shouldLaunchTracker: boolean) => {
    setConverting(true)
    setLaunchTracker(shouldLaunchTracker)

    try {
      const val = contractValue ? Number(contractValue) : currentQuotedPrice
      const result = await convertWonEstimateToDeliveryProject(projectId, {
        finalContractValue: val,
        decisionDate: decisionDate || null,
        winFactors,
        startDate: startDate || null,
        targetEndDate: targetEndDate || null,
        reportingCadence,
        pmName: pmName.trim() || undefined,
        pmEmail: pmEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      toast.success("Deal won! Converted to Delivery Project & baseline locked.")
      onOpenChange(false)
      if (onComplete) onComplete()

      if (shouldLaunchTracker) {
        router.push(result.trackerUrl)
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error(err)
      toast.error("Failed to convert estimate to delivery project.")
    } finally {
      setConverting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden border-[#1E2D45] bg-[#0D1526]">
        {/* Header Banner */}
        <div className="p-6 border-b border-[#1E2D45] bg-[#111827]">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-800/60 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              Presales Milestone: Deal Won
            </Badge>
          </div>
          <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2">
            <Rocket className="h-5 w-5 text-emerald-400" />
            Convert to Delivery Project
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Transition <strong className="text-foreground">{projectName}</strong> from presales bidding into active delivery execution.
          </DialogDescription>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Section 1: Commercial Win Baseline */}
          <div className="p-4 rounded-xl border border-[#1E2D45] bg-[#111827] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              Commercial Win Baseline
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="contract-val" className="text-muted-foreground">Agreed Contract Value ($)</Label>
                <Input
                  id="contract-val"
                  type="number"
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  placeholder={String(Math.round(currentQuotedPrice))}
                  className="bg-[#0D1526] border-[#1E2D45] text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="decision-date" className="text-muted-foreground">Award / Decision Date</Label>
                <Input
                  id="decision-date"
                  type="date"
                  value={decisionDate}
                  onChange={(e) => setDecisionDate(e.target.value)}
                  className="bg-[#0D1526] border-[#1E2D45] text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-[11px]">Primary Win Factors</Label>
              <div className="flex flex-wrap gap-1.5">
                {WIN_FACTORS.map((factor) => {
                  const isSelected = winFactors.includes(factor)
                  return (
                    <button
                      key={factor}
                      type="button"
                      onClick={() => toggleWinFactor(factor)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                        isSelected
                          ? "bg-emerald-900/40 text-emerald-200 border-emerald-700/60 font-semibold"
                          : "bg-[#0D1526] text-muted-foreground border-[#1E2D45] hover:text-foreground"
                      }`}
                    >
                      {isSelected ? "✓ " : "+ "}
                      {factor}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Section 2: Delivery Kickoff & Timeline */}
          <div className="p-4 rounded-xl border border-[#1E2D45] bg-[#111827] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Calendar className="h-4 w-4 text-primary" />
              Delivery Execution Parameters
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="start-date" className="text-muted-foreground">Kickoff / Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#0D1526] border-[#1E2D45] text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="target-end" className="text-muted-foreground">Target Completion Date</Label>
                <Input
                  id="target-end"
                  type="date"
                  value={targetEndDate}
                  min={startDate || undefined}
                  onChange={(e) => setTargetEndDate(e.target.value)}
                  className="bg-[#0D1526] border-[#1E2D45] text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="cadence" className="text-muted-foreground">Health Reporting Cadence</Label>
                <Select
                  value={reportingCadence}
                  onValueChange={(v) => setReportingCadence(v as any)}
                >
                  <SelectTrigger id="cadence" className="bg-[#0D1526] border-[#1E2D45] text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0D1526] border-[#1E2D45]">
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pm-name" className="text-muted-foreground">Delivery PM / Owner (Optional)</Label>
                <Input
                  id="pm-name"
                  value={pmName}
                  onChange={(e) => setPmName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="bg-[#0D1526] border-[#1E2D45] text-xs h-9"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Baseline Freeze Guarantee Card */}
          <div className="p-3.5 rounded-xl border border-blue-900/40 bg-blue-950/20 text-xs space-y-1.5">
            <p className="font-bold text-blue-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              As-Sold Baseline Freeze Guarantee
            </p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Upon conversion, Skynet creates an immutable As-Sold baseline snapshot capturing the authoritative labor hours, staffing profile, margin, and billing milestones. The delivery tracker will track variance against this frozen baseline.
            </p>
          </div>
        </div>

        {/* Modal Footer with Direct Launch */}
        <DialogFooter className="p-4 border-t border-[#1E2D45] bg-[#111827] flex flex-col sm:flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={converting}
            className="text-xs text-muted-foreground hover:text-foreground order-2 sm:order-1"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2 order-1 sm:order-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={converting}
              onClick={() => handleConvert(false)}
              className="text-xs h-9 flex-1 sm:flex-initial"
            >
              {converting && !launchTracker ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Save & Stay in Estimate
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={converting}
              onClick={() => handleConvert(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1.5 shadow-md flex-1 sm:flex-initial"
            >
              {converting && launchTracker ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Converting…
                </>
              ) : (
                <>
                  <Rocket className="h-3.5 w-3.5" />
                  Launch Delivery Tracker
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
