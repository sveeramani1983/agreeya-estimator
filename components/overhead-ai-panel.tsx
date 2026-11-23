"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { OverheadConfig } from "@/lib/types"
import { OverheadRecommendationData } from "@/app/api/projects/[id]/ai-recommend/route"

interface OverheadAIPanelProps {
  projectId: string
  currentConfig: OverheadConfig
  constructionHours: number
  wbsConfidenceHours?: number
  onApplyRecommendations: (recommendations: OverheadRecommendationData["recommendations"]) => void
}

type PanelState = "loading" | "paused" | "ready" | "error" | "applied" | "dismissed"

interface RowComparison {
  key: string
  label: string
  layer: string
  currentPercent: number
  currentEnabled: boolean
  recPercent: number
  recEnabled: boolean
  isDifferent: boolean
}

export function OverheadAIPanel({
  projectId,
  currentConfig,
  constructionHours,
  onApplyRecommendations,
}: OverheadAIPanelProps) {
  const [state, setState] = useState<PanelState>("loading")
  const [data, setData] = useState<OverheadRecommendationData | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [pauseMessage, setPauseMessage] = useState("")
  const [actionUrl, setActionUrl] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [showFullComparison, setShowFullComparison] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const fetchRecommendations = useCallback(
    async (regenerate = false) => {
      // Pause condition check upfront on client
      if (constructionHours <= 0) {
        setState("paused")
        setPauseMessage(
          "The WBS currently has 0 construction hours. AI needs estimated construction components to recommend proportional overhead tiers and contingency buffers."
        )
        setActionUrl(`/projects/${projectId}/estimate`)
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
          body: JSON.stringify({ tab: "overhead", regenerate }),
        })

        const result = await res.json()

        if (result.status === "paused") {
          setState("paused")
          setPauseMessage(result.message)
          setActionUrl(result.actionUrl || `/projects/${projectId}/estimate`)
          return
        }

        if (!res.ok || result.status === "error" || !result.data) {
          setState("error")
          setErrorMessage(result.error || "Failed to load AI recommendations.")
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
    [projectId, constructionHours]
  )

  useEffect(() => {
    fetchRecommendations(false)
  }, [fetchRecommendations])

  // Build comparison rows
  const comparisons: RowComparison[] = data
    ? [
        // Layer 1
        {
          key: "ba",
          label: "Business Analysis",
          layer: "Layer 1",
          currentPercent: currentConfig.ba_percent,
          currentEnabled: currentConfig.ba_enabled,
          recPercent: data.recommendations.ba_percent,
          recEnabled: data.recommendations.ba_enabled,
          isDifferent:
            currentConfig.ba_percent !== data.recommendations.ba_percent ||
            currentConfig.ba_enabled !== data.recommendations.ba_enabled,
        },
        {
          key: "qa",
          label: "Quality Assurance",
          layer: "Layer 1",
          currentPercent: currentConfig.qa_percent,
          currentEnabled: currentConfig.qa_enabled,
          recPercent: data.recommendations.qa_percent,
          recEnabled: data.recommendations.qa_enabled,
          isDifferent:
            currentConfig.qa_percent !== data.recommendations.qa_percent ||
            currentConfig.qa_enabled !== data.recommendations.qa_enabled,
        },
        {
          key: "devops",
          label: "DevOps / Infrastructure",
          layer: "Layer 1",
          currentPercent: currentConfig.devops_percent,
          currentEnabled: currentConfig.devops_enabled,
          recPercent: data.recommendations.devops_percent,
          recEnabled: data.recommendations.devops_enabled,
          isDifferent:
            currentConfig.devops_percent !== data.recommendations.devops_percent ||
            currentConfig.devops_enabled !== data.recommendations.devops_enabled,
        },
        {
          key: "ux",
          label: "UX / Design",
          layer: "Layer 1",
          currentPercent: currentConfig.ux_percent,
          currentEnabled: currentConfig.ux_enabled,
          recPercent: data.recommendations.ux_percent,
          recEnabled: data.recommendations.ux_enabled,
          isDifferent:
            currentConfig.ux_percent !== data.recommendations.ux_percent ||
            currentConfig.ux_enabled !== data.recommendations.ux_enabled,
        },
        // Layer 2
        {
          key: "pm",
          label: "Project Management",
          layer: "Layer 2",
          currentPercent: currentConfig.pm_percent,
          currentEnabled: currentConfig.pm_enabled,
          recPercent: data.recommendations.pm_percent,
          recEnabled: data.recommendations.pm_enabled,
          isDifferent:
            currentConfig.pm_percent !== data.recommendations.pm_percent ||
            currentConfig.pm_enabled !== data.recommendations.pm_enabled,
        },
        {
          key: "change_mgmt",
          label: "Change Management",
          layer: "Layer 2",
          currentPercent: currentConfig.change_mgmt_percent,
          currentEnabled: currentConfig.change_mgmt_enabled,
          recPercent: data.recommendations.change_mgmt_percent,
          recEnabled: data.recommendations.change_mgmt_enabled,
          isDifferent:
            currentConfig.change_mgmt_percent !== data.recommendations.change_mgmt_percent ||
            currentConfig.change_mgmt_enabled !== data.recommendations.change_mgmt_enabled,
        },
        {
          key: "solutions_arch",
          label: "Solutions Architecture",
          layer: "Layer 2",
          currentPercent: currentConfig.solutions_arch_percent,
          currentEnabled: currentConfig.solutions_arch_enabled,
          recPercent: data.recommendations.solutions_arch_percent,
          recEnabled: data.recommendations.solutions_arch_enabled,
          isDifferent:
            currentConfig.solutions_arch_percent !== data.recommendations.solutions_arch_percent ||
            currentConfig.solutions_arch_enabled !== data.recommendations.solutions_arch_enabled,
        },
        {
          key: "training",
          label: "Training & Enablement",
          layer: "Layer 2",
          currentPercent: currentConfig.training_percent,
          currentEnabled: currentConfig.training_enabled,
          recPercent: data.recommendations.training_percent,
          recEnabled: data.recommendations.training_enabled,
          isDifferent:
            currentConfig.training_percent !== data.recommendations.training_percent ||
            currentConfig.training_enabled !== data.recommendations.training_enabled,
        },
        {
          key: "warranty",
          label: "Warranty / Hypercare",
          layer: "Layer 2",
          currentPercent: currentConfig.warranty_percent,
          currentEnabled: currentConfig.warranty_enabled,
          recPercent: data.recommendations.warranty_percent,
          recEnabled: data.recommendations.warranty_enabled,
          isDifferent:
            currentConfig.warranty_percent !== data.recommendations.warranty_percent ||
            currentConfig.warranty_enabled !== data.recommendations.warranty_enabled,
        },
        {
          key: "risk_buffer",
          label: "Risk Buffer",
          layer: "Layer 2",
          currentPercent: currentConfig.risk_buffer_percent,
          currentEnabled: currentConfig.risk_buffer_enabled,
          recPercent: data.recommendations.risk_buffer_percent,
          recEnabled: data.recommendations.risk_buffer_enabled,
          isDifferent:
            currentConfig.risk_buffer_percent !== data.recommendations.risk_buffer_percent ||
            currentConfig.risk_buffer_enabled !== data.recommendations.risk_buffer_enabled,
        },
        // Contingency
        {
          key: "contingency",
          label: "Project Contingency",
          layer: "Contingency",
          currentPercent: currentConfig.project_contingency_percent,
          currentEnabled: true,
          recPercent: data.recommendations.project_contingency_percent,
          recEnabled: true,
          isDifferent: currentConfig.project_contingency_percent !== data.recommendations.project_contingency_percent,
        },
      ]
    : []

  const changedComparisons = comparisons.filter((c) => c.isDifferent)

  const handleApply = () => {
    if (!data) return
    onApplyRecommendations(data.recommendations)
    setState("applied")
    toast.success("Applied AI overhead recommendations. All values remain fully editable and will auto-save.")
  }

  const handleKeepCurrent = () => {
    setState("dismissed")
    toast.info("Retained current overhead settings.")
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
                <span className="font-semibold text-sm text-amber-300">Estimate Required Before Overhead Calibration</span>
                <Badge variant="outline" className="border-amber-700/50 bg-amber-900/20 text-amber-300 text-[10px]">
                  Workflow Paused
                </Badge>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">{pauseMessage}</p>
              <div className="pt-2">
                <Link href={actionUrl}>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-amber-800/60 text-amber-300 hover:bg-amber-900/20 gap-1.5">
                    Go to Estimate Tab <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
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
            <p className="font-medium">AI is analyzing project context and evaluating overhead tiers…</p>
            <p className="text-[11px] text-muted-foreground">Evaluating construction hours, category mix, and confidence distribution.</p>
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
          <span>AI overhead recommendations available for this estimate.</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setState("ready")}
          className="h-6 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
        >
          Review Recommendations →
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
            <span>AI suggestions applied. All values remain fully editable and will auto-save as usual.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState("ready")}
              className="h-6 text-xs text-emerald-300 hover:bg-emerald-900/20"
            >
              Show Comparison
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

  const rowsToDisplay = showFullComparison ? comparisons : changedComparisons.length > 0 ? changedComparisons : comparisons

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
                <CardTitle className="text-sm font-semibold text-foreground">AI Overhead Recommendations</CardTitle>
                <Badge variant="outline" className="border-blue-700/50 bg-blue-900/20 text-blue-300 text-[10px]">
                  {isCached ? "Cached Recommendation" : "Fresh Recommendation"}
                </Badge>
              </div>
              <CardDescription className="text-xs text-[#94A3B8] mt-0.5">
                Calibrated to {constructionHours.toFixed(1)} construction hours and risk confidence.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isRegenerating}
              onClick={() => fetchRecommendations(true)}
              className="h-7 text-xs border-[#1E2D45] bg-[#0D1526] hover:bg-[#1E2D45]/50 gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleKeepCurrent}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              Keep Current Values
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 font-medium shadow-sm"
            >
              <Sparkles className="h-3 w-3" />
              Apply AI Suggestions
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-3.5">
        {/* Rationale & Drivers */}
        <div className="space-y-2">
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            <strong className="text-foreground">Rationale: </strong>
            {data.rationale}
          </p>

          {data.keyFactors && data.keyFactors.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
              {data.keyFactors.map((factor, idx) => (
                <div key={idx} className="rounded-md border border-[#1E2D45] bg-[#0D1526]/80 px-2.5 py-1.5 text-[11px] text-[#94A3B8] flex items-start gap-1.5">
                  <span className="text-blue-400 font-bold">•</span>
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comparison Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>
                {changedComparisons.length === 0
                  ? "All overhead tiers already match AI recommendations"
                  : `${changedComparisons.length} tier${changedComparisons.length !== 1 ? "s" : ""} differ from current configuration`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowFullComparison((prev) => !prev)}
              className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              {showFullComparison ? (
                <>
                  Show Differences Only <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  View All 11 Tiers <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          </div>

          <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#0D1526]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#111827] text-[#94A3B8] border-b border-[#1E2D45]">
                <tr>
                  <th className="py-2 px-3 font-medium">Overhead Category</th>
                  <th className="py-2 px-3 font-medium">Layer</th>
                  <th className="py-2 px-3 font-medium">Current Setting</th>
                  <th className="py-2 px-3 font-medium">AI Recommendation</th>
                  <th className="py-2 px-3 font-medium text-right">Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {rowsToDisplay.map((row) => {
                  const deltaPercent = row.recPercent - row.currentPercent
                  const statusChanged = row.recEnabled !== row.currentEnabled

                  return (
                    <tr
                      key={row.key}
                      className={row.isDifferent ? "bg-blue-900/10 hover:bg-blue-900/15" : "hover:bg-[#1E2D45]/30"}
                    >
                      <td className="py-2 px-3 font-medium text-foreground">{row.label}</td>
                      <td className="py-2 px-3 text-[#94A3B8] text-[11px]">{row.layer}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {row.layer === "Contingency" ? (
                          <span>{row.currentPercent}%</span>
                        ) : (
                          <span>
                            {row.currentPercent}%{" "}
                            <span className={row.currentEnabled ? "text-green-400 text-[10px]" : "text-zinc-500 text-[10px]"}>
                              ({row.currentEnabled ? "Enabled" : "Off"})
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-semibold text-foreground">
                        {row.layer === "Contingency" ? (
                          <span className="text-blue-300">{row.recPercent}%</span>
                        ) : (
                          <span>
                            <span className="text-blue-300">{row.recPercent}%</span>{" "}
                            <span className={row.recEnabled ? "text-green-400 text-[10px]" : "text-zinc-500 text-[10px]"}>
                              ({row.recEnabled ? "Enabled" : "Off"})
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {!row.isDifferent ? (
                          <span className="text-muted-foreground text-[11px]">— Matches</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {statusChanged && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 px-1.5 ${
                                  row.recEnabled
                                    ? "border-green-800 bg-green-950/40 text-green-300"
                                    : "border-zinc-800 bg-zinc-900 text-zinc-400"
                                }`}
                              >
                                {row.recEnabled ? "Turn ON" : "Turn OFF"}
                              </Badge>
                            )}
                            {deltaPercent !== 0 && (
                              <span
                                className={`font-mono text-[11px] font-semibold ${
                                  deltaPercent > 0 ? "text-emerald-400" : "text-amber-400"
                                }`}
                              >
                                {deltaPercent > 0 ? `+${deltaPercent}%` : `${deltaPercent}%`}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
