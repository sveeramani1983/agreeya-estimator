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
  Users,
  DollarSign,
  Clock,
  MapPin,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ResourceRecommendationData } from "@/app/api/projects/[id]/ai-recommend/route"

interface ResourceAIPanelProps {
  projectId: string
  totalEstimatedHours: number
  timelineStart: string
  effectiveTimelineEnd: string
  rateCardCount: number
  onApplyRecommendations: (recommendation: ResourceRecommendationData) => Promise<void>
}

type PanelState = "loading" | "paused" | "ready" | "error" | "applied" | "dismissed"

export function ResourceAIPanel({
  projectId,
  totalEstimatedHours,
  timelineStart,
  effectiveTimelineEnd,
  rateCardCount,
  onApplyRecommendations,
}: ResourceAIPanelProps) {
  const [state, setState] = useState<PanelState>("loading")
  const [data, setData] = useState<ResourceRecommendationData | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [pauseReason, setPauseReason] = useState("")
  const [pauseMessage, setPauseMessage] = useState("")
  const [actionUrl, setActionUrl] = useState("")
  const [actionLabel, setActionLabel] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [showFullRoles, setShowFullRoles] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [applying, setApplying] = useState(false)

  const fetchRecommendations = useCallback(
    async (regenerate = false) => {
      // 1. Client-side pause condition checks
      if (totalEstimatedHours <= 0) {
        setState("paused")
        setPauseReason("zero_estimated_hours")
        setPauseMessage(
          "Total estimated hours (WBS construction + overhead) are 0. Please estimate components on the Estimate and Overhead tabs before generating a staffing plan."
        )
        setActionUrl(`/projects/${projectId}/estimate`)
        setActionLabel("Go to Estimate Tab")
        return
      }

      if (!timelineStart || !effectiveTimelineEnd || effectiveTimelineEnd <= timelineStart) {
        setState("paused")
        setPauseReason("missing_timeline")
        setPauseMessage(
          "Project timeline (start date and duration or end date) is not configured. Staffing AI requires a project duration to schedule role allocations across delivery periods."
        )
        setActionUrl("")
        setActionLabel("Configure Timeline Above")
        return
      }

      if (rateCardCount === 0) {
        setState("paused")
        setPauseReason("empty_rate_card")
        setPauseMessage(
          "The Rate Card has no active roles or rates. Staffing AI selects roles directly from your active Rate Card without inventing billing rates."
        )
        setActionUrl("/rate-card")
        setActionLabel("Go to Rate Card")
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
          body: JSON.stringify({ tab: "resources", regenerate }),
        })

        const result = await res.json()

        if (result.status === "paused") {
          setState("paused")
          setPauseReason(result.reason || "prerequisite_missing")
          setPauseMessage(result.message)
          setActionUrl(result.actionUrl || "")
          setActionLabel(result.actionLabel || "Review Prerequisites")
          return
        }

        if (!res.ok || result.status === "error" || !result.data) {
          setState("error")
          setErrorMessage(result.error || "Failed to load staffing recommendations.")
          return
        }

        setData(result.data)
        setIsCached(Boolean(result.cached))
        setState("ready")
      } catch (err: unknown) {
        setState("error")
        setErrorMessage(err instanceof Error ? err.message : "Network error reaching AI service.")
      } finally {
        setIsRegenerating(false)
      }
    },
    [projectId, totalEstimatedHours, timelineStart, effectiveTimelineEnd, rateCardCount]
  )

  useEffect(() => {
    fetchRecommendations(false)
  }, [fetchRecommendations])

  const handleApply = async () => {
    if (!data) return
    setApplying(true)
    try {
      await onApplyRecommendations(data)
      setState("applied")
      toast.success(
        `Applied AI staffing plan: ${data.staffing.length} roles loaded (${data.recommendedTotalHours} hrs). All values remain fully editable.`
      )
    } catch {
      toast.error("Failed to apply staffing plan")
    } finally {
      setApplying(false)
    }
  }

  const handleKeepCurrent = () => {
    setState("dismissed")
    toast.info("Retained current staffing roster and hours.")
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
                  {pauseReason === "timeline_capacity_constrained"
                    ? "Timeline Capacity Constraint — Duration Too Compressed"
                    : pauseReason === "missing_timeline"
                    ? "Timeline Configuration Required for Staffing"
                    : pauseReason === "empty_rate_card"
                    ? "Rate Card Roles Required"
                    : "Estimate & Overhead Required First"}
                </span>
                <Badge variant="outline" className="border-amber-700/50 bg-amber-900/20 text-amber-300 text-[10px]">
                  {pauseReason === "timeline_capacity_constrained" ? "Capacity Warning" : "Workflow Paused"}
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
                    {pauseReason === "timeline_capacity_constrained"
                      ? "👉 Extend the project end date or duration in the Timeline card above to create an achievable staffing plan."
                      : "👉 Set your start date and duration in the Timeline bar above to activate staffing recommendations."}
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
            <p className="font-medium">AI is analyzing project scope, timeline, and rate card to recommend staffing…</p>
            <p className="text-[11px] text-muted-foreground">
              Evaluating target hours ({totalEstimatedHours.toFixed(1)} hrs), roles from rate card, and onsite/offshore balance.
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
          <span>AI staffing plan recommendations available for this project.</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setState("ready")}
          className="h-6 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
        >
          Review Staffing Plan →
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
            <span>AI staffing plan applied. All roles and period hours remain fully editable and will auto-save.</span>
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

  const staffingRoles = data.staffing || []
  const displayRoles = showFullRoles ? staffingRoles : staffingRoles.slice(0, 5)
  const hoursMatchPct = Math.round((data.recommendedTotalHours / (data.targetHours || 1)) * 100)

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
                <CardTitle className="text-sm font-semibold text-foreground">AI Staffing Recommendations</CardTitle>
                <Badge variant="outline" className="border-blue-700/50 bg-blue-900/20 text-blue-300 text-[10px]">
                  {isCached ? "Cached Recommendation" : "Fresh Recommendation"}
                </Badge>
              </div>
              <CardDescription className="text-xs text-[#94A3B8] mt-0.5">
                Staffing model calibrated to {data.targetHours.toFixed(1)} target hours across the delivery schedule.
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
                  <Sparkles className="h-3 w-3" /> Apply AI Staffing Plan
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-3.5">
        {/* Rationale & Metrics Cards */}
        <div className="space-y-3">
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            <strong className="text-foreground">Staffing Strategy: </strong>
            {data.rationale}
          </p>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Target Hours</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{data.targetHours.toFixed(1)} hrs</span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Staffed Hours</span>
              <span className={`text-xs font-semibold tabular-nums ${hoursMatchPct >= 95 && hoursMatchPct <= 105 ? "text-emerald-400" : "text-amber-400"}`}>
                {data.recommendedTotalHours} hrs ({hoursMatchPct}%)
              </span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Est. Labor Cost</span>
              <span className="text-xs font-semibold tabular-nums text-emerald-400">
                ${data.recommendedTotalCost.toLocaleString()}
              </span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Blended Rate</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">${data.blendedRate}/hr</span>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#0D1526] p-2 text-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Location Split</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {data.onsitePercent}% On / {data.offshorePercent}% Off
              </span>
            </div>
          </div>

          {/* Budget Coverage Warning */}
          {(hoursMatchPct < 95 || hoursMatchPct > 105) && (
            <div className="flex items-center gap-2 rounded-md border border-amber-800/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                <strong>Staffing Budget Warning: </strong>Recommended staffed hours ({data.recommendedTotalHours} hrs, {hoursMatchPct}%) deviate from the authoritative target effort ({data.targetHours.toFixed(0)} hrs). Recommended coverage is 95% – 105%.
              </span>
            </div>
          )}

          {/* Key factors */}
          {data.keyFactors && data.keyFactors.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {data.keyFactors.map((factor, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-[#1E2D45] bg-[#0D1526]/80 px-2.5 py-1.5 text-[11px] text-[#94A3B8] flex items-start gap-1.5"
                >
                  <span className="text-blue-400 font-bold">•</span>
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staffing Roles Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              Recommended Team: {staffingRoles.length} Roles ({data.recommendedTotalHours} Total Hours)
            </span>
            {staffingRoles.length > 5 && (
              <button
                type="button"
                onClick={() => setShowFullRoles((prev) => !prev)}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                {showFullRoles ? (
                  <>
                    Show Top 5 Roles <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Show All {staffingRoles.length} Roles <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#0D1526]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#111827] text-[#94A3B8] border-b border-[#1E2D45]">
                <tr>
                  <th className="py-2 px-3 font-medium">Role / Resource</th>
                  <th className="py-2 px-3 font-medium">Location</th>
                  <th className="py-2 px-3 font-medium text-right">Rate</th>
                  <th className="py-2 px-3 font-medium text-right">Loaded Hours</th>
                  <th className="py-2 px-3 font-medium text-right">Cost</th>
                  <th className="py-2 px-3 font-medium">Role Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {displayRoles.map((role, idx) => (
                  <tr key={idx} className="hover:bg-[#1E2D45]/30">
                    <td className="py-2 px-3">
                      <div className="font-medium text-foreground">{role.name}</div>
                      <div className="text-[10px] text-muted-foreground">{role.role}</div>
                    </td>
                    <td className="py-2 px-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] py-0 px-1.5 capitalize ${
                          role.location === "onsite"
                            ? "border-blue-700/60 bg-blue-900/20 text-blue-300"
                            : "border-purple-700/60 bg-purple-900/20 text-purple-300"
                        }`}
                      >
                        {role.location}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                      ${role.rate_per_hour}/hr
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-foreground">
                      {role.total_hours} hrs
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-400">
                      ${role.total_cost.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-[#94A3B8] text-[11px] max-w-[280px] truncate" title={role.rationale}>
                      {role.rationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
