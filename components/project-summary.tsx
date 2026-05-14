"use client"

import { useState, useCallback, useMemo } from "react"
import { Printer, Download, Copy, Save, CheckCircle2 } from "lucide-react"
import debounce from "lodash.debounce"
import { format, parseISO, differenceInDays } from "date-fns"
import * as XLSX from "xlsx"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

import { Project, WBSComponent, OverheadConfig, AdditionalCost, CommercialsConfig, ResourceLoading, Assumption, Phase, PeriodCost, WBSComponentWithActual } from "@/lib/types"
import { updateProject } from "@/lib/actions"
import { ProjectHealth } from "@/components/project-health"

interface ProjectSummaryProps {
  project: Project
  wbsComponents: WBSComponentWithActual[]
  overheadConfig: OverheadConfig
  laborCosts: any[]
  additionalCosts: AdditionalCost[]
  commercialsConfig: CommercialsConfig
  totals: any
  assumptions?: Assumption[]
  risks?: Assumption[]
  phases?: Phase[]
  burnRateData?: PeriodCost[]
}

function SummaryMiniGantt({ phases }: { phases: Phase[] }) {
  if (phases.length === 0) return null
  const starts = phases.map(p => parseISO(p.start_date))
  const ends   = phases.map(p => parseISO(p.end_date))
  const projectStart = starts.reduce((a, b) => (a < b ? a : b))
  const projectEnd   = ends.reduce((a, b) => (a > b ? a : b))
  const totalDays = differenceInDays(projectEnd, projectStart) + 1
  const SVG_W = 560
  const dayW = SVG_W / Math.max(totalDays, 1)
  const ROW_H = 18, GAP = 3, HEADER_H = 0
  const svgH = phases.length * (ROW_H + GAP)
  return (
    <div className="mt-3 overflow-hidden rounded" style={{ border: "1px solid var(--border-primary)" }}>
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${svgH}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {phases.map((phase, i) => {
          const x = differenceInDays(parseISO(phase.start_date), projectStart) * dayW
          const w = Math.max((differenceInDays(parseISO(phase.end_date), parseISO(phase.start_date)) + 1) * dayW, 2)
          const y = i * (ROW_H + GAP)
          return (
            <rect key={phase.id} x={x} y={y} width={w} height={ROW_H} rx={3}
              fill={phase.color} fillOpacity={0.8} />
          )
        })}
      </svg>
    </div>
  )
}

export function ProjectSummary({
  project,
  wbsComponents,
  overheadConfig,
  laborCosts,
  additionalCosts,
  commercialsConfig,
  totals,
  assumptions = [],
  risks = [],
  phases = [],
  burnRateData = [],
}: ProjectSummaryProps) {
  const [executiveSummary, setExecutiveSummary] = useState(project.executive_summary || "")
  const [saving, setSaving] = useState(false)

  const debouncedSaveProject = useCallback(
    debounce((text: string) => {
      setSaving(true)
      updateProject(project.id, { executive_summary: text })
        .then(() => setSaving(false))
        .catch(() => toast.error("Failed to save summary"))
    }, 800),
    [project.id]
  )

  const handleSummaryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setExecutiveSummary(e.target.value)
    debouncedSaveProject(e.target.value)
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    // 1. Summary Sheet
    const wsSummary = XLSX.utils.json_to_sheet([
      { Field: "Project Name", Value: project.name },
      { Field: "Client", Value: project.client_name },
      { Field: "Date", Value: format(new Date(), "MMMM d, yyyy") },
      { Field: "Executive Summary", Value: executiveSummary },
      { Field: "Total Labor Cost", Value: totals.totalLaborCost },
      { Field: "Total Additional Costs", Value: totals.totalAdditionalCosts },
      { Field: "Total Project Cost", Value: totals.totalProjectCost },
      { Field: "Quoted Price", Value: totals.quotedPrice },
    ])
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary")

    // 2. WBS Sheet
    const wbsData = wbsComponents.map(c => ({
      Category: c.category,
      Component: c.component_name,
      "Story Points": c.story_points,
      Complexity: c.complexity,
      "Base Hours": c.base_hours,
      Confidence: c.confidence_level
    }))
    const wsWbs = XLSX.utils.json_to_sheet(wbsData)
    XLSX.utils.book_append_sheet(wb, wsWbs, "WBS")

    // 3. Labor Costs
    const laborData = laborCosts.map(l => ({
      Resource: l.name,
      Role: l.role,
      "Total Hours": l.total_hours,
      "Rate": l.rate_per_hour,
      "Total Cost": l.total_cost
    }))
    const wsLabor = XLSX.utils.json_to_sheet(laborData)
    XLSX.utils.book_append_sheet(wb, wsLabor, "Labor")

    // 4. Additional Costs
    const addData = additionalCosts.map(a => ({
      Label: a.label,
      Type: a.cost_type,
      Amount: a.amount,
      Duration: a.cost_type === 'monthly' ? a.duration_months : 1,
      Total: a.cost_type === 'monthly' ? a.amount * a.duration_months : a.amount
    }))
    const wsAdd = XLSX.utils.json_to_sheet(addData)
    if (addData.length > 0) {
      const totalRow = addData.length + 2
      XLSX.utils.sheet_add_aoa(wsAdd, [["TOTAL", "", "", "", { f: `SUM(E2:E${totalRow - 1})` }]], { origin: `A${totalRow}` })
    }
    XLSX.utils.book_append_sheet(wb, wsAdd, "Additional Costs")

    // 5. Assumptions
    const assumptionsData = assumptions.map((a, i) => ({
      "#": i + 1,
      Title: a.title,
      Category: a.category ?? "",
      Description: a.description ?? "",
      Status: a.status,
    }))
    const wsAssumptions = XLSX.utils.json_to_sheet(assumptionsData.length > 0 ? assumptionsData : [{ "#": "", Title: "No assumptions recorded", Category: "", Description: "", Status: "" }])
    XLSX.utils.book_append_sheet(wb, wsAssumptions, "Assumptions")

    // 6. Risk Register
    const risksData = risks.map((r, i) => ({
      "#": i + 1,
      Title: r.title,
      Category: r.category ?? "",
      Likelihood: r.likelihood,
      Impact: r.impact,
      Score: r.risk_score ?? "",
      Mitigation: r.mitigation ?? "",
      Owner: r.owner ?? "",
      Status: r.status,
    }))
    const wsRisks = XLSX.utils.json_to_sheet(risksData.length > 0 ? risksData : [{ "#": "", Title: "No risks recorded", Category: "", Likelihood: "", Impact: "", Score: "", Mitigation: "", Owner: "", Status: "" }])
    XLSX.utils.book_append_sheet(wb, wsRisks, "Risk Register")

    // 7. Burn Rate
    if (burnRateData.length > 0) {
      const burnData = burnRateData.map(p => ({
        Period: p.label,
        "Period Cost": p.margined_cost,
        "Cumulative Spend": p.cumulative,
      }))
      const wsBurn = XLSX.utils.json_to_sheet(burnData)
      XLSX.utils.book_append_sheet(wb, wsBurn, "Burn Rate")
    }

    // 8. Accuracy (when project is won and actuals exist)
    if (project.status === 'won' && wbsComponents.some(c => c.actual_hours != null)) {
      const accuracyData = wbsComponents
        .filter(c => c.actual_hours != null)
        .map(c => ({
          Category: c.category,
          Component: c.component_name,
          "Estimated Hours": c.base_hours,
          "Actual Hours": c.actual_hours,
          "Accuracy %": c.accuracy_pct != null ? `${c.accuracy_pct}%` : "",
        }))
      const wsAccuracy = XLSX.utils.json_to_sheet(accuracyData)
      XLSX.utils.book_append_sheet(wb, wsAccuracy, "Accuracy")
    }

    const safeName = project.name.replace(/[/\\:*?"<>|\s]+/g, '_').slice(0, 100)
    XLSX.writeFile(wb, `${safeName}_Estimate.xlsx`)
  }

  const handleCopyMarkdown = () => {
    let md = `# Project Estimate: ${project.name}\n`
    md += `**Client:** ${project.client_name}\n`
    md += `**Date:** ${format(new Date(), "MMMM d, yyyy")}\n\n`

    if (executiveSummary) {
      md += `## Executive Summary\n${executiveSummary}\n\n`
    }

    md += `## Financial Summary\n`
    md += `- **Total Labor Cost:** $${totals.totalLaborCost.toLocaleString('en-US')}\n`
    md += `- **Total Additional Costs:** $${totals.totalAdditionalCosts.toLocaleString('en-US')}\n`
    md += `- **Project Net Cost:** $${totals.totalProjectCost.toLocaleString('en-US')}\n`
    if (commercialsConfig.show_margin_to_client) {
      md += `- **Quoted Price:** $${totals.quotedPrice.toLocaleString('en-US')}\n`
    }
    md += `\n`

    if (wbsComponents.length > 0) {
      md += `## Scope Breakdown\n`
      const grouped = wbsComponents.reduce((acc, c) => {
        if (!acc[c.category]) acc[c.category] = []
        acc[c.category].push(c)
        return acc
      }, {} as Record<string, typeof wbsComponents>)
      for (const [cat, items] of Object.entries(grouped)) {
        md += `\n### ${cat}\n`
        md += `| Component | Complexity | SP | Hours |\n|---|---|---|---|\n`
        items.forEach(c => {
          md += `| ${c.component_name} | ${c.complexity.replace('_', ' ')} | ${c.story_points} | ${c.base_hours} |\n`
        })
      }
      md += `\n`
    }

    if (laborCosts.length > 0) {
      md += `## Resource Plan\n`
      md += `| Resource | Role | Hours | Cost |\n|---|---|---|---|\n`
      laborCosts.forEach(l => {
        md += `| ${l.name} | ${l.role} | ${l.total_hours.toFixed(1)} | $${l.total_cost.toLocaleString('en-US')} |\n`
      })
      md += `\n`
    }

    if (additionalCosts.length > 0) {
      md += `## Additional Costs\n`
      md += `| Item | Type | Total |\n|---|---|---|\n`
      additionalCosts.forEach(a => {
        const total = a.cost_type === 'monthly' ? a.amount * a.duration_months : a.amount
        md += `| ${a.label} | ${a.cost_type} | $${total.toLocaleString('en-US')} |\n`
      })
      md += `\n`
    }

    if (commercialsConfig.quote_narrative) {
      md += `## Quote Narrative\n${commercialsConfig.quote_narrative}\n\n`
    }

    navigator.clipboard.writeText(md).then(() => {
      toast.success("Summary copied to clipboard")
    }).catch(() => {
      toast.error("Failed to copy to clipboard")
    })
  }

  // Group WBS by category
  const wbsByCategory = useMemo(() => {
    return wbsComponents.reduce((acc, curr) => {
      if (!acc[curr.category]) acc[curr.category] = []
      acc[curr.category].push(curr)
      return acc
    }, {} as Record<string, WBSComponentWithActual[]>)
  }, [wbsComponents])


  return (
    <div className="relative pb-24">
      <div className="print-page max-w-4xl mx-auto space-y-12 bg-[#111827] p-8 rounded-lg shadow-sm border border-[#1E2D45] print:bg-white print:border-gray-200">
        
        {/* Header */}
        <header className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-foreground print:text-slate-900">{project.name}</h1>
              <p className="text-xl text-muted-foreground mt-1">{project.client_name}</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-foreground print:text-slate-900">Project Estimate</p>
              <p className="text-muted-foreground">{format(new Date(), "MMMM d, yyyy")}</p>
            </div>
          </div>
          <Separator className="bg-[#1E2D45]" />
        </header>

        {/* Executive Summary */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground print:text-slate-800">Executive Summary</h2>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground print:hidden">
              {saving ? <><Save className="h-3 w-3 animate-pulse" /> Saving...</> : <><CheckCircle2 className="h-3 w-3 text-green-500" /> Saved</>}
            </div>
          </div>
          <Textarea 
            value={executiveSummary}
            onChange={handleSummaryChange}
            placeholder="Type executive summary here..."
            className="min-h-[120px] text-base resize-none border-dashed focus-visible:border-solid print:border-none print:p-0 print:resize-none"
          />
        </section>

        {/* Financial Summary */}
        <section className="space-y-4 break-inside-avoid">
          <h2 className="text-xl font-bold text-foreground print:text-slate-800">Financial Summary</h2>
          <Card className="bg-[#0D1526] border-[#1E2D45]">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Labor Cost</p>
                  <p className="text-2xl font-bold text-foreground print:text-slate-900">${totals.totalLaborCost.toLocaleString('en-US')}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Additional Costs</p>
                  <p className="text-2xl font-bold text-foreground print:text-slate-900">${totals.totalAdditionalCosts.toLocaleString('en-US')}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Net Cost</p>
                  <p className="text-2xl font-bold text-foreground print:text-slate-900">${totals.totalProjectCost.toLocaleString('en-US')}</p>
                </div>
                <div className="bg-sidebar text-white -my-6 -mr-6 p-6 flex flex-col justify-center rounded-r-xl">
                  <p className="text-sm font-semibold text-white/80 uppercase tracking-wider">Quoted Price</p>
                  <p className="text-3xl font-black">${totals.quotedPrice.toLocaleString('en-US')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* WBS Summary */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-foreground print:text-slate-800 border-b pb-2">Scope Breakdown</h2>
          {Object.entries(wbsByCategory).map(([category, items]) => (
            <div key={category} className="mb-6 break-inside-avoid">
              <h3 className="font-bold text-sidebar mb-2">{category}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D45] text-muted-foreground text-left">
                    <th className="py-2 font-semibold">Component</th>
                    <th className="py-2 font-semibold w-32">Complexity</th>
                    <th className="py-2 font-semibold w-24 text-right">Points</th>
                    <th className="py-2 font-semibold w-24 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(item => (
                    <tr key={item.id}>
                      <td className="py-2 pr-4">{item.component_name}</td>
                      <td className="py-2 capitalize">{item.complexity.replace('_', ' ')}</td>
                      <td className="py-2 text-right">{item.story_points}</td>
                      <td className="py-2 text-right">{item.base_hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        {/* Resource Plan */}
        <section className="space-y-4 break-inside-avoid">
          <h2 className="text-xl font-bold text-foreground print:text-slate-800 border-b pb-2">Resource Plan</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E2D45] text-muted-foreground text-left">
                <th className="py-2 font-semibold">Resource</th>
                <th className="py-2 font-semibold">Role</th>
                <th className="py-2 font-semibold text-right">Hours</th>
                {commercialsConfig.show_margin_to_client && (
                  <th className="py-2 font-semibold text-right">Cost</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {laborCosts.map(labor => (
                <tr key={labor.resource_id}>
                  <td className="py-2 font-medium">{labor.name}</td>
                  <td className="py-2 text-muted-foreground">{labor.role}</td>
                  <td className="py-2 text-right">{labor.total_hours.toFixed(1)}</td>
                  {commercialsConfig.show_margin_to_client && (
                    <td className="py-2 text-right">${labor.total_cost.toLocaleString('en-US')}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Additional Costs */}
        {additionalCosts.length > 0 && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground print:text-slate-800 border-b pb-2">Additional Costs</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D45] text-muted-foreground text-left">
                  <th className="py-2 font-semibold">Item</th>
                  <th className="py-2 font-semibold w-32">Type</th>
                  <th className="py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {additionalCosts.map(cost => {
                  const total = cost.cost_type === 'monthly' ? cost.amount * cost.duration_months : cost.amount
                  return (
                    <tr key={cost.id}>
                      <td className="py-2">{cost.label}</td>
                      <td className="py-2 capitalize">{cost.cost_type}</td>
                      <td className="py-2 text-right">${total.toLocaleString('en-US')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Key Assumptions */}
        {assumptions.length > 0 && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground print:text-slate-800 border-b pb-2">Key Assumptions</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D45] text-muted-foreground text-left">
                  <th className="py-2 font-semibold w-8">#</th>
                  <th className="py-2 font-semibold">Assumption</th>
                  <th className="py-2 font-semibold w-32">Category</th>
                  <th className="py-2 font-semibold w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {assumptions.filter(a => a.status === "open").map((a, i) => (
                  <tr key={a.id}>
                    <td className="py-2 text-[#64748B] font-mono text-xs">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <p className="font-medium">{a.title}</p>
                      {a.description && <p className="text-muted-foreground text-xs mt-0.5">{a.description}</p>}
                    </td>
                    <td className="py-2 text-muted-foreground">{a.category ?? "—"}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium capitalize">
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Risk Register Summary */}
        {risks.length > 0 && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground print:text-slate-800 border-b pb-2">Risk Register</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D45] text-muted-foreground text-left">
                  <th className="py-2 font-semibold w-8">#</th>
                  <th className="py-2 font-semibold">Risk</th>
                  <th className="py-2 font-semibold w-32">Category</th>
                  <th className="py-2 font-semibold w-24">Likelihood</th>
                  <th className="py-2 font-semibold w-20">Impact</th>
                  <th className="py-2 font-semibold w-16 text-center">Score</th>
                  <th className="py-2 font-semibold w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {risks
                  .filter(r => r.status === "open")
                  .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
                  .map((r, i) => {
                    const score = r.risk_score ?? 0
                    const scoreCls = score >= 6
                      ? "bg-red-900/30 text-red-300"
                      : score >= 3
                        ? "bg-yellow-900/30 text-yellow-300"
                        : "bg-green-900/30 text-green-300"
                    return (
                      <tr key={r.id}>
                        <td className="py-2 text-[#64748B] font-mono text-xs">{i + 1}</td>
                        <td className="py-2 pr-4">
                          <p className="font-medium">{r.title}</p>
                          {r.mitigation && <p className="text-muted-foreground text-xs mt-0.5">Mitigation: {r.mitigation}</p>}
                        </td>
                        <td className="py-2 text-muted-foreground">{r.category ?? "—"}</td>
                        <td className="py-2 capitalize">{r.likelihood}</td>
                        <td className="py-2 capitalize">{r.impact}</td>
                        <td className="py-2 text-center">
                          <span className={`inline-flex items-center justify-center rounded-full w-7 h-7 text-xs font-bold ${scoreCls}`}>
                            {score || "—"}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium capitalize">
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </section>
        )}

        {/* Project Schedule */}
        <section className="space-y-3 break-inside-avoid">
          <h2 className="text-xl font-bold text-foreground print:text-slate-800 border-b pb-2">Project Schedule</h2>
          {phases.length === 0 ? (
            <p className="text-sm text-muted-foreground print:hidden">
              No phases defined.{" "}
              <a href={`/projects/${project.id}/schedule`} className="text-primary underline">
                Add phases in the Schedule tab →
              </a>
            </p>
          ) : (
            <div>
              <div className="space-y-1.5">
                {phases.map(phase => {
                  const start = parseISO(phase.start_date)
                  const end   = parseISO(phase.end_date)
                  const weeks = Math.round((differenceInDays(end, start) + 1) / 7)
                  return (
                    <div key={phase.id} className="flex items-center gap-3 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                      <span className="font-medium w-56 truncate">{phase.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {format(start, "MMM d")} – {format(end, "MMM d, yyyy")}
                      </span>
                      <span className="text-muted-foreground text-xs ml-auto">{weeks}w</span>
                    </div>
                  )
                })}
              </div>
              <SummaryMiniGantt phases={phases} />
            </div>
          )}
        </section>

        {/* Narrative */}
        {commercialsConfig.quote_narrative && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground print:text-slate-800 border-b pb-2">Inclusions & Assumptions</h2>
            <div className="text-sm text-[#94A3B8] whitespace-pre-wrap leading-relaxed">
              {commercialsConfig.quote_narrative}
            </div>
          </section>
        )}

      </div>

      {/* Project Health — separate section below summary card */}
      <ProjectHealth
        project={project}
        wbsComponents={wbsComponents}
        burnRateData={burnRateData}
        quotedPrice={totals.quotedPrice}
      />

      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--sidebar)] border border-[var(--sidebar-border)] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 print:hidden z-50">
        <Button variant="ghost" onClick={handlePrint} className="text-white hover:text-white hover:bg-white/10 gap-2">
          <Printer className="h-4 w-4" /> Print PDF
        </Button>
        <Separator orientation="vertical" className="h-6 bg-white/20" />
        <Button variant="ghost" onClick={handleExportExcel} className="text-white hover:text-white hover:bg-white/10 gap-2">
          <Download className="h-4 w-4" /> Export Excel
        </Button>
        <Separator orientation="vertical" className="h-6 bg-white/20" />
        <Button variant="ghost" onClick={handleCopyMarkdown} className="text-white hover:text-white hover:bg-white/10 gap-2">
          <Copy className="h-4 w-4" /> Copy Markdown
        </Button>
      </div>
    </div>
  )
}
