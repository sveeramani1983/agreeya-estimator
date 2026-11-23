"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Sparkles,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  DollarSign,
  TrendingUp,
  FileText,
  Calendar,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { CommercialsRecommendationData } from "@/app/api/projects/[id]/ai-recommend/route"

interface CommercialsAIPanelProps {
  projectId: string
  constructionHours: number
  loadedLaborCost: number
  loadedLaborHours: number
  onApplyRecommendations: (
    recommendation: CommercialsRecommendationData,
    applyMilestones: boolean
  ) => Promise<void>
}

type PanelState = "loading" | "paused" | "ready" | "error" | "applied" | "dismissed"

export function CommercialsAIPanel({
  projectId,
  constructionHours,
  loadedLaborCost,
  loadedLaborHours,
  onApplyRecommendations,
}: CommercialsAIPanelProps) {
  const [state, setState] = useState<PanelState>("loading")
  const [data, setData] = useState<CommercialsRecommendationData | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [pauseReason, setPauseReason] = useState("")
  const [pauseMessage, setPauseMessage] = useState("")
  const [actionUrl, setActionUrl] = useState("")
  const [actionLabel, setActionLabel] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [includeMilestones, setIncludeMilestones] = useState(true)
  const [showNarrative, setShowNarrative] = useState(false)

  const fetchRecommendations = useCallback(
    async (regenerate = false) => {
      // 1. Client-side pause condition checks
      if (constructionHours <= 0) {
        setState("paused")
        setPauseReason("zero_construction_hours")
        setPauseMessage(
          "The WBS currently has 0 construction hours. Commercials AI requires accepted construction components to analyze scope and pricing."
        )
        setActionUrl(`/projects/${projectId}/estimate`)
        setActionLabel("Go to Estimate Tab")
        return
      }

      if (loadedLaborCost <= 0 || loadedLaborHours <= 0) {
        setState("paused")
        setPauseReason("zero_labor_cost")
        setPauseMessage(
          "The project currently has 0 staffed hours and $0 labor cost. Commercials AI requires an accepted staffing plan and labor cost baseline before recommending margins, pricing strategy, and payment milestones."
        )
        setActionUrl(`/projects/${projectId}/resources`)
        setActionLabel("Go to Resources Tab")
        return
      }

      if (regenerate) {
        setIsRegenerating(true)
      } else {
        setState("loading")
      }

      try {
        const res = await fetch(`/api/projects/${projectId}/ai-recommend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: "commercials", regenerate }),
        })

        const json = await res.json()

        if (!res.ok) {
          setState("error")
          setErrorMessage(json.error || "Failed to generate commercial recommendations")
          return
        }

        if (json.status === "paused") {
          setState("paused")
          setPauseReason(json.reason)
          setPauseMessage(json.message)
          setActionUrl(json.actionUrl || "")
          setActionLabel(json.actionLabel || "Resolve Missing Information")
          return
        }

        if (json.status === "ready" && json.data) {
          setData(json.data)
          setIsCached(Boolean(json.cached))
          setState("ready")
        }
      } catch (err: unknown) {
        setState("error")
        setErrorMessage("Network error connecting to AI service. Please try again.")
      } finally {
        setIsRegenerating(false)
      }
    },
    [projectId, constructionHours, loadedLaborCost, loadedLaborHours]
  )

  useEffect(() => {
    fetchRecommendations(false)
  }, [fetchRecommendations])

  const handleApply = async () => {
    if (!data) return
    setApplying(true)
    try {
      await onApplyRecommendations(data, includeMilestones)
      setState("applied")
      toast.success(
        `Applied commercial recommendations: ${data.targetMarginPercent}% margin and proposal narrative updated.`
      )
    } catch {
      toast.error("Failed to apply commercial recommendations")
    } finally {
      setApplying(false)
    }
  }

  const handleKeepCurrent = () => {
    setState("dismissed")
    toast.info("Retained current commercial configuration.")
  }

  // ── Render Paused State ──
  if (state === "paused") {
    return (
      <Card className="border-amber-800/40 bg-amber-900/10 shadow-sm print:hidden">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-amber-300">
                  {pauseReason === "zero_labor_cost"
                    ? "Staffing & Labor Cost Baseline Required for Commercials"
                    : "WBS Construction Effort Required for Commercials"}
                </span>
                <Badge variant="outline" className="border-amber-700/50 bg-amber-900/20 text-amber-300 text-[10px]">
                  Workflow Paused
                </Badge>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">{pauseMessage}</p>
              <div className="pt-2">
                {actionUrl ? (
                  <Link href={actionUrl}>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-amber-800/60 text-amber-300 hover:bg-amber-900/20 gap-1.5">
                      {actionLabel} <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                ) : (
                  <span className="inline-flex items-center text-xs text-amber-400 font-medium">
                    👉 Complete prior tabs to activate commercial recommendations.
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Render Loading State ──
  if (state === "loading") {
    return (
      <Card className="border-blue-800/30 bg-blue-900/10 shadow-sm print:hidden">
        <CardContent className="py-4 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
          <div className="text-xs text-blue-300 space-y-0.5">
            <p className="font-medium">AI is evaluating labor baseline, client intelligence, and scope to recommend commercial pricing…</p>
            <p className="text-[11px] text-muted-foreground">
              Analyzing cost baseline (${loadedLaborCost.toLocaleString()}), delivery risk profile, and payment milestone cadence.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Render Error State ──
  if (state === "error") {
    return (
      <Card className="border-red-800/30 bg-red-900/10 shadow-sm print:hidden">
        <CardContent className="py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchRecommendations(true)}
            className="h-7 text-xs border-red-800/50 text-red-300 hover:bg-red-900/20 gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Render Dismissed State ──
  if (state === "dismissed") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-[#1E2D45] bg-[#111827] px-4 py-2.5 text-xs text-muted-foreground print:hidden">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-blue-400" />
          <span>AI commercial recommendations available for this project.</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setState("ready")}
          className="h-6 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
        >
          Review Commercials Recommendation →
        </Button>
      </div>
    )
  }

  // ── Render Applied State ──
  if (state === "applied") {
    return (
      <Card className="border-emerald-800/40 bg-emerald-900/10 shadow-sm print:hidden">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>AI commercial recommendations applied. Margin % and Quote Narrative have been populated and remain fully editable.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState("ready")}
              className="h-6 text-xs text-emerald-300 hover:bg-emerald-900/20"
            >
              Show Plan Summary
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState("dismissed")}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Render Ready State ──
  if (!data) return null

  const p = data.authoritativePricing
  const c = data.authoritativeCost

  return (
    <Card className="border-blue-800/40 bg-[#111827] shadow-md print:hidden">
      <CardHeader className="pb-3 border-b border-[#1E2D45]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-blue-900/30 border border-blue-800/50">
              <Sparkles className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold text-foreground">AI Commercial & Pricing Strategy</CardTitle>
                <Badge variant="outline" className="border-blue-700/50 bg-blue-900/20 text-blue-300 text-[10px]">
                  {isCached ? "Cached Recommendation" : "Fresh Recommendation"}
                </Badge>
              </div>
              <CardDescription className="text-xs text-[#94A3B8] mt-0.5">
                Calibrated to ${c.subtotalCost.toLocaleString()} baseline project cost ({c.loadedLaborHours.toFixed(0)} labor hrs).
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isRegenerating || applying}
              onClick={() => fetchRecommendations(true)}
              className="h-7 text-xs border-[#1E2D45] bg-[#0D1526] hover:bg-[#1E2D45]/50 gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={applying}
              onClick={handleKeepCurrent}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              Keep Current Values
            </Button>
            <Button
              size="sm"
              disabled={applying}
              onClick={handleApply}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 font-medium shadow-sm"
            >
              {applying ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" /> Applying…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" /> Apply AI Suggestions
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-3.5">
        {/* Strategy & Rationale */}
        <div className="space-y-2">
          <div className="rounded-md border border-[#1E2D45] bg-[#0D1526]/70 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-300">Pricing Strategy:</span>
              <span className="text-xs text-foreground font-medium">{data.pricingStrategy}</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">{data.pricingRationale}</p>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Recommended Margin</span>
              <span className="text-xs font-bold tabular-nums text-emerald-400">{data.targetMarginPercent}%</span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Cost Baseline</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">${c.subtotalCost.toLocaleString()}</span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Margin Amount</span>
              <span className="text-xs font-semibold tabular-nums text-emerald-400">
                ${p.marginAmount.toLocaleString()}
              </span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Pre-Tax Quote</span>
              <span className="text-xs font-bold tabular-nums text-foreground">
                ${p.preTaxTotal.toLocaleString()}
              </span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Blended Sell Rate</span>
              <span className="text-xs font-semibold tabular-nums text-blue-300">
                ${p.blendedSellRate.toFixed(2)}/hr
              </span>
            </div>
          </div>

          {/* Commercial Considerations */}
          {data.commercialConsiderations && data.commercialConsiderations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
              {data.commercialConsiderations.map((consideration, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-[#1E2D45] bg-[#0D1526]/80 px-2.5 py-1.5 text-[11px] text-[#94A3B8] flex items-start gap-1.5"
                >
                  <span className="text-blue-400 font-bold">•</span>
                  <span>{consideration}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preliminary Payment Milestones */}
        {data.preliminaryMilestones && data.preliminaryMilestones.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#1E2D45]">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Preliminary Payment Milestones</span>
                <Badge variant="outline" className="border-amber-700/50 bg-amber-900/20 text-amber-300 text-[10px]">
                  Preliminary — Refine in Schedule
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={includeMilestones}
                    onCheckedChange={(checked) => setIncludeMilestones(Boolean(checked))}
                    className="h-3.5 w-3.5"
                  />
                  <span>Apply with commercial suggestions</span>
                </label>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#0D1526]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111827] text-[#94A3B8] border-b border-[#1E2D45]">
                  <tr>
                    <th className="py-2 px-3 font-medium">Milestone Title</th>
                    <th className="py-2 px-3 font-medium">Trigger Type</th>
                    <th className="py-2 px-3 font-medium text-right">Share (%)</th>
                    <th className="py-2 px-3 font-medium text-right">Amount</th>
                    <th className="py-2 px-3 font-medium">Timing Guidance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45]">
                  {data.preliminaryMilestones.map((m, idx) => (
                    <tr key={idx} className="hover:bg-[#1E2D45]/30">
                      <td className="py-2 px-3 font-medium text-foreground">
                        <div>{m.title}</div>
                        {m.description && <div className="text-[10px] text-muted-foreground">{m.description}</div>}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {m.trigger_type.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-foreground">{m.percentage}%</td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-emerald-400">
                        ${m.amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-[#94A3B8]">{m.timing_hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quote Narrative Preview */}
        {data.quoteNarrative && (
          <div className="pt-2 border-t border-[#1E2D45] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Recommended Proposal Narrative</span>
              <button
                type="button"
                onClick={() => setShowNarrative((prev) => !prev)}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                {showNarrative ? (
                  <>
                    Hide Narrative <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Preview Full Text <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            </div>
            {showNarrative ? (
              <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-3 text-xs text-[#94A3B8] leading-relaxed whitespace-pre-line max-h-60 overflow-y-auto">
                {data.quoteNarrative}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground line-clamp-2 italic">
                &ldquo;{data.quoteNarrative.slice(0, 180)}…&rdquo;
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
