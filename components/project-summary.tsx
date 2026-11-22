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

import {
  Project,
  OverheadConfig,
  AdditionalCost,
  CommercialsConfig,
  Assumption,
  Phase,
  PeriodCost,
  WBSComponentWithActual,
  BillingMilestone,
} from "@/lib/types"
import { updateProject } from "@/lib/actions"
import { ProjectHealth } from "@/components/project-health"

// ── PDF helpers ────────────────────────────────────────────────────────────────

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      marginBottom: 28, paddingBottom: 16,
      borderBottom: '2px solid #E2E8F0',
    }}>
      <span style={{ fontSize: '11pt', fontWeight: 700, color: '#2563EB', letterSpacing: '0.1em' }}>
        {number}
      </span>
      <h2 style={{ fontSize: '18pt', fontWeight: 700, color: '#0F172A', margin: 0 }}>
        {title}
      </h2>
    </div>
  )
}

function FactGrid({ facts }: { facts: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
      {facts.map(f => (
        <div key={f.label} style={{
          padding: 16, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0',
        }}>
          <div style={{ fontSize: '9pt', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {f.label}
          </div>
          <div style={{ fontSize: '14pt', fontWeight: 600, color: '#0F172A', marginTop: 4 }}>
            {f.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function triggerLabel(t: string) {
  const map: Record<string, string> = {
    date: 'By date',
    milestone: 'On milestone',
    phase_complete: 'Phase complete',
    client_approval: 'Client approval',
    contract_signing: 'Contract signing',
  }
  return map[t] ?? t
}

// ── Mini Gantt (screen only) ───────────────────────────────────────────────────

function SummaryMiniGantt({ phases }: { phases: Phase[] }) {
  if (phases.length === 0) return null
  const starts = phases.map(p => parseISO(p.start_date))
  const ends   = phases.map(p => parseISO(p.end_date))
  const projectStart = starts.reduce((a, b) => (a < b ? a : b))
  const projectEnd   = ends.reduce((a, b) => (a > b ? a : b))
  const totalDays = differenceInDays(projectEnd, projectStart) + 1
  const SVG_W = 560
  const dayW = SVG_W / Math.max(totalDays, 1)
  const ROW_H = 18, GAP = 3
  const svgH = phases.length * (ROW_H + GAP)
  return (
    <div className="mt-3 overflow-hidden rounded" style={{ border: '1px solid var(--border-primary)' }}>
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${svgH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {phases.map((phase, i) => {
          const x = differenceInDays(parseISO(phase.start_date), projectStart) * dayW
          const w = Math.max((differenceInDays(parseISO(phase.end_date), parseISO(phase.start_date)) + 1) * dayW, 2)
          const y = i * (ROW_H + GAP)
          return <rect key={phase.id} x={x} y={y} width={w} height={ROW_H} rx={3} fill={phase.color} fillOpacity={0.8} />
        })}
      </svg>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────────

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
  billingMilestones?: BillingMilestone[]
}

// ── Main component ─────────────────────────────────────────────────────────────

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
  billingMilestones = [],
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

  // ── PDF export ──────────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    toast.info(
      "PDF preview opening. In print settings: paper = A4, enable background graphics.",
      { duration: 5000 }
    )
    window.open(`/projects/${project.id}/pdf`, "_blank", "noopener,noreferrer")
  }

  // ── Excel export ────────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Field: "Project Name", Value: project.name },
      { Field: "Client", Value: project.client_name },
      { Field: "Date", Value: format(new Date(), "MMMM d, yyyy") },
      { Field: "Executive Summary", Value: executiveSummary },
      { Field: "Total Labor Cost", Value: totals.totalLaborCost },
      { Field: "Total Additional Costs", Value: totals.totalAdditionalCosts },
      { Field: "Total Project Cost", Value: totals.totalProjectCost },
      { Field: "Quoted Price", Value: totals.quotedPrice },
    ]), "Summary")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wbsComponents.map(c => ({
      Category: c.category, Component: c.component_name,
      "Story Points": c.story_points, Complexity: c.complexity,
      "Base Hours": c.base_hours, Confidence: c.confidence_level,
    }))), "WBS")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(laborCosts.map(l => ({
      Resource: l.name, Role: l.role, "Total Hours": l.total_hours,
      Rate: l.rate_per_hour, "Total Cost": l.total_cost,
    }))), "Labor")
    const addData = additionalCosts.map(a => ({
      Label: a.label, Type: a.cost_type, Amount: a.amount,
      Duration: a.cost_type === 'monthly' ? a.duration_months : 1,
      Total: a.cost_type === 'monthly' ? a.amount * a.duration_months : a.amount,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(addData), "Additional Costs")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      assumptions.length > 0 ? assumptions.map((a, i) => ({
        "#": i + 1, Title: a.title, Category: a.category ?? "", Description: a.description ?? "", Status: a.status,
      })) : [{ "#": "", Title: "No assumptions recorded", Category: "", Description: "", Status: "" }]
    ), "Assumptions")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      risks.length > 0 ? risks.map((r, i) => ({
        "#": i + 1, Title: r.title, Category: r.category ?? "",
        Likelihood: r.likelihood, Impact: r.impact, Score: r.risk_score ?? "",
        Mitigation: r.mitigation ?? "", Owner: r.owner ?? "", Status: r.status,
      })) : [{ "#": "", Title: "No risks recorded", Category: "", Likelihood: "", Impact: "", Score: "", Mitigation: "", Owner: "", Status: "" }]
    ), "Risk Register")
    if (burnRateData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(burnRateData.map(p => ({
        Period: p.label, "Period Cost": p.margined_cost, "Cumulative Spend": p.cumulative,
      }))), "Burn Rate")
    }
    XLSX.writeFile(wb, `${project.name.replace(/[/\\:*?"<>|\s]+/g, '_').slice(0, 100)}_Estimate.xlsx`)
  }

  // ── Markdown copy ───────────────────────────────────────────────────────────

  const handleCopyMarkdown = () => {
    let md = `# Project Estimate: ${project.name}\n**Client:** ${project.client_name}\n**Date:** ${format(new Date(), "MMMM d, yyyy")}\n\n`
    if (executiveSummary) md += `## Executive Summary\n${executiveSummary}\n\n`
    md += `## Financial Summary\n- **Total Labor Cost:** $${totals.totalLaborCost.toLocaleString()}\n- **Additional Costs:** $${totals.totalAdditionalCosts.toLocaleString()}\n- **Quoted Price:** $${totals.quotedPrice.toLocaleString()}\n\n`
    navigator.clipboard.writeText(md)
      .then(() => toast.success("Summary copied to clipboard"))
      .catch(() => toast.error("Failed to copy to clipboard"))
  }

  // ── Computed values for PDF ─────────────────────────────────────────────────

  const wbsByCategory = useMemo(() => {
    return wbsComponents.reduce((acc, curr) => {
      if (!acc[curr.category]) acc[curr.category] = []
      acc[curr.category].push(curr)
      return acc
    }, {} as Record<string, WBSComponentWithActual[]>)
  }, [wbsComponents])

  const categoryRollups = useMemo(() => {
    const byCategory: Record<string, number> = {}
    for (const c of wbsComponents) byCategory[c.category] = (byCategory[c.category] || 0) + c.base_hours
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0)
    return Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([category, hours]) => ({ category, hours, percentage: total > 0 ? Math.round((hours / total) * 100) : 0 }))
  }, [wbsComponents])

  const onsiteLabor = useMemo(() => laborCosts.filter(l => l.location !== 'offshore'), [laborCosts])
  const offshoreLabor = useMemo(() => laborCosts.filter(l => l.location === 'offshore'), [laborCosts])
  const onsiteHours = useMemo(() => onsiteLabor.reduce((a, l) => a + (l.total_hours || 0), 0), [onsiteLabor])
  const offshoreHours = useMemo(() => offshoreLabor.reduce((a, l) => a + (l.total_hours || 0), 0), [offshoreLabor])
  const onsiteCost = useMemo(() => onsiteLabor.reduce((a, l) => a + (l.total_cost || 0), 0), [onsiteLabor])
  const offshoreCost = useMemo(() => offshoreLabor.reduce((a, l) => a + (l.total_cost || 0), 0), [offshoreLabor])
  const totalLoadedHours = onsiteHours + offshoreHours
  const blendedRate = totalLoadedHours > 0 ? Math.round(totals.totalLaborCost / totalLoadedHours) : 0

  const deliveryModel = offshoreHours === 0 ? 'Onsite' : onsiteHours === 0 ? 'Offshore' : 'Hybrid'

  const durationWeeks = useMemo(() => {
    if (!project.timeline_start || !project.timeline_end) return null
    try {
      return Math.round(differenceInDays(parseISO(project.timeline_end), parseISO(project.timeline_start)) / 7)
    } catch { return null }
  }, [project.timeline_start, project.timeline_end])

  const offshoreSavings = useMemo(() => {
    if (offshoreHours === 0 || onsiteHours === 0) return 0
    const onsiteRate = onsiteCost / onsiteHours
    return Math.max(0, Math.round(offshoreHours * onsiteRate - offshoreCost))
  }, [offshoreHours, onsiteHours, onsiteCost, offshoreCost])
  const offshorePercent = totalLoadedHours > 0 ? Math.round((offshoreHours / totalLoadedHours) * 100) : 0

  const openAssumptions = assumptions.filter(a => a.status === 'open')
  const highRisks = risks.filter(r => (r.risk_score ?? 0) >= 6 && r.status === 'open')

  const taxMode = project.tax_mode ?? 'not_applicable'
  const taxApplicable = taxMode !== 'not_applicable' && (project.tax_percent ?? 0) > 0
  const taxLabel = project.tax_label || 'Sales Tax'
  const taxPercent = project.tax_percent ?? 0
  const taxAmount = taxApplicable ? Math.round(totals.quotedPrice * taxPercent / 100) : 0

  const paymentTerms = billingMilestones[0]?.payment_terms ?? 30
  const versionLabel = project.status === 'won' ? 'Final' : project.status === 'submitted' ? 'Rev 1' : 'Draft'

  const todayStr = format(new Date(), "MMMM d, yyyy")

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative pb-24">

      {/* ════════════════════════════════════════════════════════
          SCREEN VIEW — hidden during print
          ════════════════════════════════════════════════════════ */}
      <div className="print:hidden max-w-4xl mx-auto space-y-12 bg-[#111827] p-8 rounded-lg shadow-sm border border-[#1E2D45]">

        <header className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-foreground">{project.name}</h1>
              <p className="text-xl text-muted-foreground mt-1">{project.client_name}</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-foreground">Project Estimate</p>
              <p className="text-muted-foreground">{todayStr}</p>
            </div>
          </div>
          <Separator className="bg-[#1E2D45]" />
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Executive Summary</h2>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {saving ? <><Save className="h-3 w-3 animate-pulse" /> Saving...</> : <><CheckCircle2 className="h-3 w-3 text-green-500" /> Saved</>}
            </div>
          </div>
          <Textarea
            value={executiveSummary}
            onChange={handleSummaryChange}
            placeholder="Type executive summary here..."
            className="min-h-[120px] text-base resize-none border-dashed focus-visible:border-solid"
          />
        </section>

        <section className="space-y-4 break-inside-avoid">
          <h2 className="text-xl font-bold text-foreground">Financial Summary</h2>
          <Card className="bg-[#0D1526] border-[#1E2D45]">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Labor Cost</p>
                  <p className="text-2xl font-bold text-foreground">${totals.totalLaborCost.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Additional Costs</p>
                  <p className="text-2xl font-bold text-foreground">${totals.totalAdditionalCosts.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Net Cost</p>
                  <p className="text-2xl font-bold text-foreground">${totals.totalProjectCost.toLocaleString()}</p>
                </div>
                <div className="bg-sidebar text-white -my-6 -mr-6 p-6 flex flex-col justify-center rounded-r-xl">
                  <p className="text-sm font-semibold text-white/80 uppercase tracking-wider">Quoted Price</p>
                  <p className="text-3xl font-black">${totals.quotedPrice.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-foreground border-b pb-2">Scope Breakdown</h2>
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
                <tbody className="divide-y divide-slate-100/10">
                  {items.map(item => (
                    <tr key={item.id}>
                      <td className="py-2 pr-4 text-foreground">{item.component_name}</td>
                      <td className="py-2 capitalize text-muted-foreground">{item.complexity.replace('_', ' ')}</td>
                      <td className="py-2 text-right text-muted-foreground">{item.story_points}</td>
                      <td className="py-2 text-right text-foreground">{item.base_hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="space-y-4 break-inside-avoid">
          <h2 className="text-xl font-bold text-foreground border-b pb-2">Resource Plan</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E2D45] text-muted-foreground text-left">
                <th className="py-2 font-semibold">Resource</th>
                <th className="py-2 font-semibold">Role</th>
                <th className="py-2 font-semibold text-right">Hours</th>
                {commercialsConfig.show_margin_to_client && <th className="py-2 font-semibold text-right">Cost</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/10">
              {laborCosts.map(labor => (
                <tr key={labor.resource_id}>
                  <td className="py-2 font-medium text-foreground">{labor.name}</td>
                  <td className="py-2 text-muted-foreground">{labor.role}</td>
                  <td className="py-2 text-right text-foreground">{Number(labor.total_hours).toFixed(1)}</td>
                  {commercialsConfig.show_margin_to_client && (
                    <td className="py-2 text-right text-foreground">${Number(labor.total_cost).toLocaleString()}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {additionalCosts.length > 0 && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground border-b pb-2">Additional Costs</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D45] text-muted-foreground text-left">
                  <th className="py-2 font-semibold">Item</th>
                  <th className="py-2 font-semibold w-32">Type</th>
                  <th className="py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/10">
                {additionalCosts.map(cost => {
                  const total = cost.cost_type === 'monthly' ? cost.amount * cost.duration_months : cost.amount
                  return (
                    <tr key={cost.id}>
                      <td className="py-2 text-foreground">{cost.label}</td>
                      <td className="py-2 capitalize text-muted-foreground">{cost.cost_type}</td>
                      <td className="py-2 text-right text-foreground">${total.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}

        {assumptions.length > 0 && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground border-b pb-2">Key Assumptions</h2>
            <div className="space-y-2">
              {assumptions.filter(a => a.status === 'open').map((a, i) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <span className="text-sidebar font-bold shrink-0">{i + 1}.</span>
                  <div>
                    <p className="font-medium text-foreground">{a.title}</p>
                    {a.description && <p className="text-muted-foreground text-xs mt-0.5">{a.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {risks.length > 0 && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground border-b pb-2">Risk Register</h2>
            <div className="space-y-2">
              {risks.filter(r => r.status === 'open').sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)).map((r, i) => {
                const score = r.risk_score ?? 0
                const scoreCls = score >= 6 ? "bg-red-900/30 text-red-300" : score >= 3 ? "bg-yellow-900/30 text-yellow-300" : "bg-green-900/30 text-green-300"
                return (
                  <div key={r.id} className="flex gap-3 text-sm items-start">
                    <span className="text-sidebar font-bold shrink-0">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{r.title}</p>
                      {r.mitigation && <p className="text-muted-foreground text-xs mt-0.5">Mitigation: {r.mitigation}</p>}
                    </div>
                    <span className={`inline-flex items-center justify-center rounded-full w-7 h-7 text-xs font-bold shrink-0 ${scoreCls}`}>{score || '—'}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {phases.length > 0 && (
          <section className="space-y-3 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground border-b pb-2">Project Schedule</h2>
            <div className="space-y-1.5">
              {phases.map(phase => {
                const s = parseISO(phase.start_date); const e = parseISO(phase.end_date)
                const weeks = Math.round((differenceInDays(e, s) + 1) / 7)
                return (
                  <div key={phase.id} className="flex items-center gap-3 text-sm">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                    <span className="font-medium w-56 truncate text-foreground">{phase.name}</span>
                    <span className="text-muted-foreground text-xs">{format(s, "MMM d")} – {format(e, "MMM d, yyyy")}</span>
                    <span className="text-muted-foreground text-xs ml-auto">{weeks}w</span>
                  </div>
                )
              })}
            </div>
            <SummaryMiniGantt phases={phases} />
          </section>
        )}

        {commercialsConfig.quote_narrative && (
          <section className="space-y-4 break-inside-avoid">
            <h2 className="text-xl font-bold text-foreground border-b pb-2">Inclusions & Assumptions</h2>
            <div className="text-sm text-[#94A3B8] whitespace-pre-wrap leading-relaxed">
              {commercialsConfig.quote_narrative}
            </div>
          </section>
        )}
      </div>

      {/* Project Health (screen only) */}
      <div className="print:hidden">
        <ProjectHealth project={project} wbsComponents={wbsComponents} burnRateData={burnRateData} quotedPrice={totals.quotedPrice} />
      </div>

      {/* ════════════════════════════════════════════════════════
          PDF PRINT VIEW — hidden on screen, shown during print
          ════════════════════════════════════════════════════════ */}
      <div className="hidden print:block" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>

        {/* ── PAGE 1: COVER ── */}
        <div className="pdf-page" style={{ height: '297mm', display: 'flex', flexDirection: 'column' }}>
          {/* Top accent */}
          <div className="pdf-accent" style={{ height: 8, width: '100%' }} />

          <div style={{ flex: 1, padding: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* Top */}
            <div>
              <div style={{ fontSize: '14pt', fontWeight: 700, color: '#2563EB', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 60 }}>
                AgreeYa Solutions
                <span style={{ color: '#94A3B8', fontSize: '10pt', marginLeft: 12, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  A Computacenter Company
                </span>
              </div>
              <div style={{ fontSize: '32pt', fontWeight: 700, color: '#0F172A', lineHeight: 1.2, marginBottom: 16, maxWidth: 480 }}>
                {project.name}
              </div>
              <div style={{ fontSize: '14pt', color: '#64748B', marginBottom: 40 }}>
                Project Proposal & Cost Estimate
              </div>
              <div style={{ fontSize: '13pt', color: '#0F172A', fontWeight: 500 }}>
                Prepared for: {project.client_name}
              </div>
            </div>

            {/* Bottom */}
            <div>
              {/* Key facts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24, marginBottom: 48, padding: 24, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                {[
                  { label: 'Total Investment', value: `$${totals.quotedPrice.toLocaleString()}` },
                  { label: 'Duration', value: durationWeeks ? `${durationWeeks} weeks` : 'TBD' },
                  { label: 'Delivery Model', value: deliveryModel },
                ].map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: '9pt', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ fontSize: '20pt', fontWeight: 700, color: '#0F172A' }}>{f.value}</div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt', color: '#94A3B8', borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                <span>Prepared: {todayStr}</span>
                <span>{versionLabel}</span>
                <span>Confidential & Proprietary</span>
                <span>Valid for 30 days from issue</span>
              </div>
            </div>
          </div>

          {/* Bottom accent */}
          <div className="pdf-accent-sm" style={{ height: 4, width: '100%' }} />
        </div>

        {/* ── PAGE 2: EXECUTIVE SUMMARY ── */}
        <div className="pdf-page" style={{ padding: '40px 60px' }}>
          <SectionHeader number="01" title="Executive Summary" />
          <p style={{ fontSize: '12pt', lineHeight: 1.8, color: '#374151', marginBottom: 32 }}>
            {executiveSummary || commercialsConfig.quote_narrative || 'Please add an executive summary in the Commercials tab.'}
          </p>
          <FactGrid facts={[
            { label: 'Total Investment', value: `$${totals.quotedPrice.toLocaleString()}` },
            { label: 'Project Duration', value: durationWeeks ? `${durationWeeks} weeks` : 'TBD' },
            { label: 'Total Effort', value: `${totalLoadedHours.toLocaleString()} hours` },
            { label: 'Team Size', value: `${laborCosts.length} resource${laborCosts.length !== 1 ? 's' : ''}` },
            { label: 'Delivery Model', value: deliveryModel },
            { label: 'Effective Rate', value: blendedRate > 0 ? `$${blendedRate}/hr blended` : 'N/A' },
          ]} />
        </div>

        {/* ── PAGE 3: SCOPE OF WORK ── */}
        <div className="pdf-page" style={{ padding: '40px 60px' }}>
          <SectionHeader number="02" title="Scope of Work" />
          <p style={{ color: '#64748B', marginBottom: 24, fontSize: '11pt' }}>
            The following table summarizes estimated effort by work area. Detailed component breakdown is available upon request.
          </p>
          <table>
            <thead>
              <tr>
                <th>Work Area</th>
                <th style={{ textAlign: 'right' }}>Estimated Hours</th>
                <th style={{ textAlign: 'right' }}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {categoryRollups.map(cat => (
                <tr key={cat.category}>
                  <td>{cat.category}</td>
                  <td style={{ textAlign: 'right' }}>{cat.hours.toLocaleString()} hrs</td>
                  <td style={{ textAlign: 'right' }}>{cat.percentage}%</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>TOTAL EFFORT</td>
                <td style={{ textAlign: 'right' }}>{wbsComponents.reduce((a, c) => a + c.base_hours, 0).toLocaleString()} hrs</td>
                <td style={{ textAlign: 'right' }}>100%</td>
              </tr>
            </tbody>
          </table>

          {commercialsConfig.quote_narrative && (
            <div style={{ marginTop: 32 }}>
              <h4 style={{ color: '#374151', marginBottom: 8, fontSize: '12pt' }}>Inclusions & Notes</h4>
              <p style={{ color: '#374151', fontSize: '10pt', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {commercialsConfig.quote_narrative}
              </p>
            </div>
          )}
        </div>

        {/* ── PAGE 4: DELIVERY APPROACH ── */}
        <div className="pdf-page" style={{ padding: '40px 60px' }}>
          <SectionHeader number="03" title="Delivery Approach" />

          {phases.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <h4 style={{ marginBottom: 16, color: '#374151', fontSize: '12pt' }}>Project Timeline</h4>
              <table>
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Start</th>
                    <th>End</th>
                    <th style={{ textAlign: 'right' }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map(phase => {
                    const s = parseISO(phase.start_date); const e = parseISO(phase.end_date)
                    const weeks = Math.round((differenceInDays(e, s) + 1) / 7)
                    return (
                      <tr key={phase.id}>
                        <td>
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: phase.color, marginRight: 8, verticalAlign: 'middle' }} />
                          {phase.name}
                        </td>
                        <td>{format(s, 'MMM d, yyyy')}</td>
                        <td>{format(e, 'MMM d, yyyy')}</td>
                        <td style={{ textAlign: 'right' }}>{weeks}w</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h4 style={{ marginBottom: 16, color: '#374151', fontSize: '12pt' }}>Proposed Team</h4>
            <table>
              <thead>
                <tr>
                  <th>Role / Resource</th>
                  <th>Location</th>
                  <th style={{ textAlign: 'right' }}>Total Hours</th>
                </tr>
              </thead>
              <tbody>
                {laborCosts.map(r => (
                  <tr key={r.resource_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.role}</div>
                      <div style={{ fontSize: '9pt', color: '#64748B' }}>{r.name}</div>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: '9pt',
                        background: r.location === 'offshore' ? '#F0FDF4' : '#EFF6FF',
                        color: r.location === 'offshore' ? '#15803D' : '#1D4ED8',
                      }}>
                        {r.location === 'offshore' ? 'Offshore' : 'Onsite'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{Number(r.total_hours).toFixed(0)} hrs</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2}>TOTAL</td>
                  <td style={{ textAlign: 'right' }}>{totalLoadedHours.toFixed(0)} hrs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── PAGE 5: INVESTMENT SUMMARY ── */}
        <div className="pdf-page" style={{ padding: '40px 60px' }}>
          <SectionHeader number="04" title="Investment Summary" />

          <table style={{ marginBottom: 32 }}>
            <thead>
              <tr>
                <th>Cost Category</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {onsiteHours > 0 && (
                <tr>
                  <td>Onsite Labor ({onsiteHours.toFixed(0)} hrs @ blended rate)</td>
                  <td style={{ textAlign: 'right' }}>${Math.round(onsiteCost).toLocaleString()}</td>
                </tr>
              )}
              {offshoreHours > 0 && (
                <tr>
                  <td>Offshore Labor ({offshoreHours.toFixed(0)} hrs @ blended rate)</td>
                  <td style={{ textAlign: 'right' }}>${Math.round(offshoreCost).toLocaleString()}</td>
                </tr>
              )}
              {onsiteHours === 0 && offshoreHours === 0 && (
                <tr>
                  <td>Labor</td>
                  <td style={{ textAlign: 'right' }}>${Math.round(totals.totalLaborCost).toLocaleString()}</td>
                </tr>
              )}
              {additionalCosts.map(cost => {
                const total = cost.cost_type === 'monthly' ? cost.amount * cost.duration_months : cost.amount
                return (
                  <tr key={cost.id}>
                    <td style={{ paddingLeft: 24 }}>{cost.label}</td>
                    <td style={{ textAlign: 'right' }}>${Math.round(total).toLocaleString()}</td>
                  </tr>
                )
              })}
              <tr className="total-row">
                <td><strong>TOTAL INVESTMENT</strong></td>
                <td style={{ textAlign: 'right' }}><strong>${totals.quotedPrice.toLocaleString()}</strong></td>
              </tr>
            </tbody>
          </table>

          {blendedRate > 0 && (
            <p style={{ fontSize: '9pt', color: '#94A3B8', marginBottom: 24 }}>
              * Effective blended rate: ${blendedRate}/hr across all resources. Detailed rate card available upon request.
            </p>
          )}

          {taxApplicable && (
            <div style={{ padding: 16, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '11pt' }}>
                <span>Subtotal</span><span>${totals.quotedPrice.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '11pt' }}>
                <span>{taxLabel} ({taxPercent}%)</span><span>${taxAmount.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13pt', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                <span>Total including {taxLabel}</span><span>${(totals.quotedPrice + taxAmount).toLocaleString()}</span>
              </div>
            </div>
          )}

          {offshoreSavings > 0 && (
            <div style={{ padding: 16, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, color: '#15803D', marginBottom: 4, fontSize: '11pt' }}>
                💡 Offshore Delivery Value
              </div>
              <p style={{ fontSize: '10pt', color: '#374151', margin: 0 }}>
                By leveraging our offshore delivery center for {offshorePercent}% of the work, this engagement delivers ${offshoreSavings.toLocaleString()} in savings compared to an all-onsite delivery model.
              </p>
            </div>
          )}
        </div>

        {/* ── PAGE 6: PAYMENT SCHEDULE ── */}
        <div className="pdf-page" style={{ padding: '40px 60px' }}>
          <SectionHeader number="05" title="Payment Schedule" />

          {billingMilestones.length > 0 ? (
            <>
              <table style={{ marginBottom: 24 }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Milestone</th>
                    <th>Payment Trigger</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                    <th>Planned Date</th>
                  </tr>
                </thead>
                <tbody>
                  {billingMilestones.map((m, i) => (
                    <tr key={m.id}>
                      <td style={{ color: '#94A3B8' }}>{i + 1}</td>
                      <td>
                        <strong>{m.title}</strong>
                        {m.deliverables && <div style={{ fontSize: '9pt', color: '#64748B', marginTop: 2 }}>{m.deliverables}</div>}
                      </td>
                      <td style={{ fontSize: '10pt', color: '#64748B' }}>{triggerLabel(m.trigger_type)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${m.amount.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#64748B' }}>{m.percentage}%</td>
                      <td style={{ fontSize: '10pt' }}>{m.planned_date ? format(parseISO(m.planned_date), 'MMM d, yyyy') : 'TBD'}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3}>TOTAL</td>
                    <td style={{ textAlign: 'right' }}>${totals.quotedPrice.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>100%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: '9pt', color: '#94A3B8' }}>
                Payment terms: Net {paymentTerms} days from invoice date unless otherwise agreed.
              </p>
            </>
          ) : (
            <p style={{ color: '#94A3B8', fontSize: '11pt' }}>
              Payment schedule to be agreed upon contract execution.
            </p>
          )}
        </div>

        {/* ── PAGE 7: ASSUMPTIONS & TERMS ── */}
        <div className="pdf-page" style={{ padding: '40px 60px' }}>
          <SectionHeader number="06" title="Assumptions & Terms" />

          {openAssumptions.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h4 style={{ marginBottom: 12, color: '#374151', fontSize: '12pt' }}>Key Assumptions</h4>
              <p style={{ fontSize: '10pt', color: '#64748B', marginBottom: 12 }}>
                This estimate is based on the following assumptions. Changes may impact scope, timeline, and cost.
              </p>
              {openAssumptions.slice(0, 8).map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#2563EB', fontWeight: 600, minWidth: 20, fontSize: '10pt' }}>{i + 1}.</span>
                  <div style={{ fontSize: '10pt', color: '#374151' }}>
                    {a.title}
                    {a.description && <div style={{ color: '#64748B', fontSize: '9pt', marginTop: 2 }}>{a.description}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {highRisks.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h4 style={{ marginBottom: 12, color: '#DC2626', fontSize: '12pt' }}>⚠ Key Risks</h4>
              {highRisks.slice(0, 3).map(risk => (
                <div key={risk.id} style={{ padding: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: '#DC2626', fontSize: '10pt' }}>{risk.title}</div>
                  {risk.mitigation && (
                    <div style={{ fontSize: '9pt', color: '#374151', marginTop: 4 }}>Mitigation: {risk.mitigation}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <h4 style={{ marginBottom: 12, color: '#374151', fontSize: '12pt' }}>Commercial Terms</h4>
            <table>
              <tbody>
                {([
                  ['Estimate Validity', '30 days from date of issue'],
                  ['Contract Type', 'Fixed Price'],
                  ['Change Management', 'Changes to scope require written approval and may impact timeline and cost'],
                  ['Payment Terms', `Net ${paymentTerms} days from invoice`],
                  ['Intellectual Property', 'All deliverables transfer to client upon final payment'],
                  ['Warranty Period', '30 days post go-live for defect resolution'],
                ] as [string, string][]).map(([term, value]) => (
                  <tr key={term}>
                    <td style={{ fontWeight: 600, width: '35%', color: '#374151', fontSize: '10pt' }}>{term}</td>
                    <td style={{ color: '#374151', fontSize: '10pt' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      {/* end print view */}

      {/* ── Floating Action Bar (screen only) ── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--sidebar)] border border-[var(--sidebar-border)] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 print:hidden z-50" data-no-print>
        <Button variant="ghost" onClick={handleExportPDF} className="text-white hover:text-white hover:bg-white/10 gap-2">
          <Printer className="h-4 w-4" /> Export PDF
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
