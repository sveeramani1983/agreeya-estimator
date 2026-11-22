import { getPipelineData } from "@/lib/actions"
import { PipelineClient } from "@/components/pipeline-client"
import { getCapacityAnalysis } from "@/lib/intelligence"
import { Target, Users } from "lucide-react"
import Link from "next/link"

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

function CapacityCard({ analysis }: { analysis: Awaited<ReturnType<typeof getCapacityAnalysis>> }) {
  const { committedResources, availableCapacity, pipelineDemand, capacityGap, monthlyBreakdown, activeProjects, pipelineDeals } = analysis

  const borderColor = capacityGap === 0 ? '#059669' : capacityGap <= 3 ? '#D97706' : '#DC2626'
  const gapLabel = capacityGap === 0 ? '🟢' : capacityGap <= 3 ? '🟡' : '🔴'

  let recommendation = ''
  if (capacityGap === 0) {
    recommendation = 'Capacity is sufficient for weighted pipeline demand.'
  } else if (capacityGap <= 3) {
    recommendation = 'Moderate capacity gap. Review deal timelines or plan additional resources.'
  } else {
    recommendation = 'Significant capacity gap. Consider staggering pursuit or planning offshore hiring.'
  }

  const nextBottleneck = monthlyBreakdown.find(m => m.gap > 0)

  return (
    <div
      className="rounded-lg border-2 bg-[#0D1526] p-5 space-y-4"
      style={{ borderColor }}
    >
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4" style={{ color: borderColor }} />
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: borderColor }}>
          Capacity Analysis
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Currently committed</p>
          <p className="font-bold text-foreground text-lg">{committedResources} <span className="text-xs font-normal text-muted-foreground">resources</span></p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Available capacity</p>
          <p className="font-bold text-foreground text-lg">{availableCapacity} <span className="text-xs font-normal text-muted-foreground">resources</span></p>
        </div>
      </div>

      <div className="border-t border-[#1E2D45] pt-3 space-y-1 text-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Demand ({pipelineDeals} deals)</p>
        <div className="flex justify-between">
          <span className="text-muted-foreground text-xs">If all deals close</span>
          <span className="font-medium">{pipelineDemand.maximum} resources</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground text-xs">Weighted (by probability)</span>
          <span className="font-medium">{pipelineDemand.weighted} resources</span>
        </div>
      </div>

      <div className="border-t border-[#1E2D45] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-foreground">Capacity Gap</span>
          <span className="text-lg font-black" style={{ color: borderColor }}>
            {gapLabel} {capacityGap} resources
          </span>
        </div>
        {nextBottleneck && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Starting {new Date(nextBottleneck.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      <div className="border-t border-[#1E2D45] pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recommendation</p>
        <p className="text-xs text-foreground leading-relaxed">"{recommendation}"</p>
      </div>

      {activeProjects > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {activeProjects} active delivery project{activeProjects !== 1 ? 's' : ''} in progress
        </p>
      )}
    </div>
  )
}

export default async function PipelinePage() {
  const [data, capacityAnalysis] = await Promise.all([
    getPipelineData(),
    getCapacityAnalysis(),
  ])
  const { metrics } = data

  const winRatePct = Math.round(metrics.winRate)
  const wonCount = data.wonThisYear.length
  const totalDecided = data.wonThisYear.length + data.lostThisYear.length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900/30 border border-blue-800/40">
            <Target className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Revenue Pipeline</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Pursuit tracking and forecast</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/pipeline/summary"
            className="flex items-center gap-2 rounded-lg border border-[#1E2D45] bg-[#0D1526] px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-[#2E3D55] transition-colors"
          >
            Executive Summary →
          </Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Pipeline",
            value: fmt(metrics.totalPipeline),
            sub: `${metrics.dealCount} active pursuit${metrics.dealCount !== 1 ? "s" : ""}`,
            color: "text-blue-400",
          },
          {
            label: "Weighted Forecast",
            value: fmt(metrics.weightedPipeline),
            sub: "Probability-adjusted",
            color: "text-purple-400",
          },
          {
            label: "Won This Year",
            value: fmt(metrics.wonRevenue),
            sub: `${wonCount} deal${wonCount !== 1 ? "s" : ""} closed`,
            color: "text-green-400",
          },
          {
            label: "Win Rate YTD",
            value: `${winRatePct}%`,
            sub: totalDecided > 0 ? `${wonCount} of ${totalDecided} pursued` : "No decisions yet",
            color: winRatePct >= 50 ? "text-green-400" : winRatePct > 0 ? "text-amber-400" : "text-muted-foreground",
          },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t.label}</p>
            <p className={`text-2xl font-black ${t.color}`}>{t.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Capacity Analysis card (Surface 6) */}
      <CapacityCard analysis={capacityAnalysis} />

      {/* 4-tab client component */}
      <PipelineClient data={data} />
    </div>
  )
}
