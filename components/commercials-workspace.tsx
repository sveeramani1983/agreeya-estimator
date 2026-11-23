"use client"

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle2, 
  DollarSign,
  TrendingUp,
  FileText,
  Calculator,
  ChevronDown,
  ChevronRight,
  PlusCircle
} from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import debounce from "lodash.debounce"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

import { AdditionalCost, BillingMilestone, CommercialsConfig, MilestoneTemplate, OverheadConfig, Project } from "@/lib/types"
import type { ClientIntelligence } from "@/lib/intelligence"
import {
  updateAdditionalCost,
  deleteAdditionalCost,
  updateCommercialsConfig,
  updateProject,
  applyCommercialsPlan,
} from "@/lib/actions"
import { PaymentScheduleSection } from "@/components/payment-schedule-section"
import { CommercialsAIPanel } from "@/components/commercials-ai-panel"
import { CommercialsRecommendationData } from "@/app/api/projects/[id]/ai-recommend/route"

const ONSITE_RATE = 150

interface CommercialsWorkspaceProps {
  projectId: string
  project: Project
  laborCosts: {
    resource_id: string
    name: string
    role: string
    rate_per_hour: number
    total_hours: number
    total_cost: number
    location: string
  }[]
  initialAdditionalCosts: AdditionalCost[]
  initialConfig: CommercialsConfig
  totalSP: number
  overheadConfig: OverheadConfig
  constructionHours: number
  contingencyHours: number
  initialMilestones: BillingMilestone[]
  templates: MilestoneTemplate[]
  clientIntelligence?: ClientIntelligence | null
}

export function CommercialsWorkspace({
  projectId,
  project,
  laborCosts,
  initialAdditionalCosts,
  initialConfig,
  totalSP,
  overheadConfig,
  constructionHours,
  contingencyHours,
  initialMilestones,
  templates,
  clientIntelligence,
}: CommercialsWorkspaceProps) {
  const router = useRouter()
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>(initialAdditionalCosts)
  const [config, setConfig] = useState<CommercialsConfig>(initialConfig)
  const [taxLabel, setTaxLabel] = useState(project.tax_label || "Sales Tax")
  const [taxPercent, setTaxPercent] = useState(project.tax_percent || 0)
  const [taxMode, setTaxMode] = useState<'full'|'additional_only'|'not_applicable'>(project.tax_mode || 'not_applicable')

  const [saving, setSaving] = useState(false)
  const saveCount = useRef(0)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [aiAppliedFields, setAiAppliedFields] = useState<Set<"margin" | "narrative">>(new Set())

  const handleApplyAICommercials = async (
    recommendation: CommercialsRecommendationData,
    applyMilestones: boolean
  ) => {
    try {
      const configUpdates = {
        margin_percent: recommendation.targetMarginPercent,
        quote_narrative: recommendation.quoteNarrative,
      }

      const milestonesPayload = applyMilestones
        ? recommendation.preliminaryMilestones.map((m) => ({
            title: m.title,
            trigger_type: m.trigger_type,
            percentage: m.percentage,
            description: m.description,
            deliverables: m.deliverables,
          }))
        : undefined

      await applyCommercialsPlan(projectId, configUpdates, milestonesPayload)

      setConfig((prev) => ({
        ...prev,
        margin_percent: recommendation.targetMarginPercent,
        quote_narrative: recommendation.quoteNarrative,
      }))

      setAiAppliedFields(new Set(["margin", "narrative"]))
      router.refresh()
    } catch (err) {
      console.error("Failed to apply commercials plan:", err)
      toast.error("Failed to apply commercials plan")
      throw err
    }
  }

  const [expanded, setExpanded] = useState({
    res: true,
    l1: true,
    l2: true,
    l3: true,
    add: true,
  })

  const toggleAll = (state: boolean) => {
    setExpanded({ res: state, l1: state, l2: state, l3: state, add: state })
  }

  // Calculations
  const totals = useMemo(() => {
    const loadedLaborCost = laborCosts.reduce((acc, curr) => acc + curr.total_cost, 0)
    const loadedLaborHours = laborCosts.reduce((acc, curr) => acc + curr.total_hours, 0)
    const resourceBlendedRate = loadedLaborHours > 0 ? loadedLaborCost / loadedLaborHours : 0

    const trueBaseHours = constructionHours + contingencyHours
    const trueBaseCost = trueBaseHours * resourceBlendedRate

    const oc = overheadConfig
    const l1HoursList = [
      { label: "Business Analysis", percent: oc.ba_percent, enabled: oc.ba_enabled },
      { label: "Quality Assurance", percent: oc.qa_percent, enabled: oc.qa_enabled },
      { label: "DevOps / Infrastructure", percent: oc.devops_percent, enabled: oc.devops_enabled },
      { label: "UX / Design", percent: oc.ux_percent, enabled: oc.ux_enabled },
    ].map(r => ({ ...r, hours: r.enabled ? trueBaseHours * (r.percent / 100) : 0, cost: (r.enabled ? trueBaseHours * (r.percent / 100) : 0) * resourceBlendedRate }))
    const l1SumHours = l1HoursList.reduce((a, r) => a + r.hours, 0)
    const l1SumCost = l1HoursList.reduce((a, r) => a + r.cost, 0)

    const layer1Subtotal = trueBaseHours + l1SumHours

    const l2HoursList = [
      { label: "Project Management", percent: oc.pm_percent, enabled: oc.pm_enabled },
      { label: "Change Management", percent: oc.change_mgmt_percent, enabled: oc.change_mgmt_enabled },
      { label: "Solutions Architecture", percent: oc.solutions_arch_percent, enabled: oc.solutions_arch_enabled },
      { label: "Training & Enablement", percent: oc.training_percent, enabled: oc.training_enabled },
      { label: "Warranty / Hypercare", percent: oc.warranty_percent, enabled: oc.warranty_enabled },
      { label: "Risk Buffer", percent: oc.risk_buffer_percent, enabled: oc.risk_buffer_enabled },
    ].map(r => ({ ...r, hours: r.enabled ? layer1Subtotal * (r.percent / 100) : 0, cost: (r.enabled ? layer1Subtotal * (r.percent / 100) : 0) * resourceBlendedRate }))
    const l2SumHours = l2HoursList.reduce((a, r) => a + r.hours, 0)
    const l2SumCost = l2HoursList.reduce((a, r) => a + r.cost, 0)

    const l3HoursList = (oc.customOverheads || []).map(co => ({
      label: co.label,
      hours: layer1Subtotal * (co.percent / 100),
      cost: (layer1Subtotal * (co.percent / 100)) * resourceBlendedRate,
      percent: co.percent,
    }))
    const l3SumHours = l3HoursList.reduce((a, r) => a + r.hours, 0)
    const l3SumCost = l3HoursList.reduce((a, r) => a + r.cost, 0)

    const totalCalculatedLaborHours = trueBaseHours + l1SumHours + l2SumHours + l3SumHours
    const totalCalculatedLaborCost = totalCalculatedLaborHours * resourceBlendedRate

    // Onsite / offshore breakdown
    const onsiteItems = laborCosts.filter(l => l.location !== 'offshore')
    const offshoreItems = laborCosts.filter(l => l.location === 'offshore')
    const onsiteHours = onsiteItems.reduce((a, b) => a + b.total_hours, 0)
    const offshoreHours = offshoreItems.reduce((a, b) => a + b.total_hours, 0)
    const onsiteCost = onsiteItems.reduce((a, b) => a + b.total_cost, 0)
    const offshoreCost = offshoreItems.reduce((a, b) => a + b.total_cost, 0)
    const hasOffshore = offshoreItems.length > 0
    const allOnsiteCost = loadedLaborHours * ONSITE_RATE
    const offshoreSavings = allOnsiteCost - loadedLaborCost

    const totalAdditionalCosts = additionalCosts.reduce((acc, curr) => {
      const lineTotal = curr.cost_type === 'monthly' ? (curr.amount || 0) * (curr.duration_months || 1) : (curr.amount || 0)
      return acc + lineTotal
    }, 0)

    const subtotal = loadedLaborCost + totalAdditionalCosts

    let marginAmount = 0
    let preTaxTotal = subtotal

    if (!config.rates_include_margin) {
      marginAmount = subtotal * (Math.max(0, config.margin_percent) / 100)
      preTaxTotal = subtotal + marginAmount
    }

    let taxAmount = 0
    if (taxMode === 'full') {
      taxAmount = preTaxTotal * (taxPercent / 100)
    } else if (taxMode === 'additional_only') {
      taxAmount = totalAdditionalCosts * (taxPercent / 100)
    }

    const quotedPrice = preTaxTotal + taxAmount
    const finalBlendedRate = totalCalculatedLaborHours > 0 ? quotedPrice / totalCalculatedLaborHours : 0
    const costPerSP = totalSP > 0 ? quotedPrice / totalSP : 0

    return {
      loadedLaborHours,
      loadedLaborCost,
      resourceBlendedRate,
      trueBaseHours,
      trueBaseCost,
      l1HoursList, l1SumHours, l1SumCost,
      l2HoursList, l2SumHours, l2SumCost,
      l3HoursList, l3SumHours, l3SumCost,
      totalCalculatedLaborHours,
      totalCalculatedLaborCost,
      onsiteHours,
      offshoreHours,
      onsiteCost,
      offshoreCost,
      hasOffshore,
      offshoreSavings,
      totalAdditionalCosts,
      subtotal,
      marginAmount,
      preTaxTotal,
      taxAmount,
      quotedPrice,
      finalBlendedRate,
      costPerSP,
    }
  }, [laborCosts, additionalCosts, config, totalSP, overheadConfig, constructionHours, contingencyHours, taxMode, taxPercent])

  // Auto-save logic
  const debouncedSaveConfig = useCallback(
    debounce((data: CommercialsConfig) => {
      saveCount.current += 1
      setSaving(true)
      updateCommercialsConfig(projectId, data)
        .then(() => {
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
        .catch(() => {
          toast.error("Failed to save configuration")
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
    }, 800),
    [projectId]
  )

  const debouncedSaveTaxFields = useCallback(
    debounce((label: string, percent: number, mode: 'full'|'additional_only'|'not_applicable') => {
      saveCount.current += 1
      setSaving(true)
      updateProject(projectId, { tax_label: label, tax_percent: percent, tax_mode: mode })
        .then(() => {
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
        .catch(() => {
          toast.error("Failed to save tax fields")
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
    }, 800),
    [projectId]
  )

  const debouncedSaveAdditionalCost = useCallback(
    debounce((cost: AdditionalCost) => {
      saveCount.current += 1
      setSaving(true)
      updateAdditionalCost(projectId, cost)
        .then(() => {
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
        .catch(() => {
          toast.error("Failed to save additional cost")
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
    }, 800),
    [projectId]
  )

  useEffect(() => {
    if (config !== initialConfig) {
      debouncedSaveConfig(config)
    }
  }, [config, debouncedSaveConfig, initialConfig])

  // Handlers
  const addAdditionalCost = () => {
    const newCost: AdditionalCost = {
      id: uuidv4(),
      project_id: projectId,
      label: "New Cost Item",
      cost_type: "fixed",
      amount: 0,
      duration_months: 1,
      notes: ""
    }
    setAdditionalCosts([...additionalCosts, newCost])
    updateAdditionalCost(projectId, newCost)
  }

  const removeAdditionalCost = async () => {
    if (!deleteId) return
    const id = deleteId
    setAdditionalCosts(additionalCosts.filter(c => c.id !== id))
    await deleteAdditionalCost(id)
    setDeleteId(null)
    toast.success("Cost item removed")
  }

  const handleAdditionalCostUpdate = (id: string, updates: Partial<AdditionalCost>) => {
    setAdditionalCosts(prev => prev.map(c => {
      if (c.id !== id) return c
      if (updates.amount !== undefined && updates.amount < 0) updates.amount = 0
      if (updates.duration_months !== undefined && updates.duration_months < 1) updates.duration_months = 1
      const updated = { ...c, ...updates }
      debouncedSaveAdditionalCost(updated)
      return updated
    }))
  }

  const updateConfig = (updates: Partial<CommercialsConfig>) => {
    setAiAppliedFields(prev => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      if (updates.margin_percent !== undefined) next.delete("margin")
      if (updates.quote_narrative !== undefined) next.delete("narrative")
      return next
    })
    if (updates.margin_percent !== undefined) {
      if (updates.margin_percent < 0) updates.margin_percent = 0
      if (updates.margin_percent > 100) {
        toast.warning("Margin exceeds 100%")
      }
    }
    setConfig(prev => ({ ...prev, ...updates }))
  }

  const handleTaxUpdate = (updates: { label?: string, percent?: number, mode?: 'full'|'additional_only'|'not_applicable' }) => {
    const newLabel = updates.label !== undefined ? updates.label : taxLabel
    const newPercent = updates.percent !== undefined ? updates.percent : taxPercent
    const newMode = updates.mode !== undefined ? updates.mode : taxMode
    
    if (updates.label !== undefined) setTaxLabel(newLabel)
    if (updates.percent !== undefined) setTaxPercent(newPercent)
    if (updates.mode !== undefined) setTaxMode(newMode)

    debouncedSaveTaxFields(newLabel, newPercent, newMode)
  }

  let marginColor = 'text-foreground'
  if (!config.rates_include_margin) {
    if (config.margin_percent >= 15) {
      marginColor = 'text-green-600'
    } else if (config.margin_percent >= 10) {
      marginColor = 'text-amber-500'
    } else {
      marginColor = 'text-red-600'
    }
  }

  return (
    <div className="space-y-10 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Commercials & Quote</h2>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {saving ? <><Save className="h-3 w-3 animate-pulse" /> Saving...</> : <><CheckCircle2 className="h-3 w-3 text-green-500" /> Saved</>}
        </div>
      </div>

      {/* ── AI Commercials Assistant Panel ───────────────────── */}
      <CommercialsAIPanel
        projectId={projectId}
        constructionHours={constructionHours}
        loadedLaborCost={totals.loadedLaborCost}
        loadedLaborHours={totals.loadedLaborHours}
        onApplyRecommendations={handleApplyAICommercials}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Detail Tables */}
        <div className="lg:col-span-2 space-y-10">
          
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Collapse All</Button>
            <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Expand All</Button>
          </div>

          {/* Section 1: Complete Effort Breakdown */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-sidebar" />
              <h3 className="text-lg font-semibold">Complete Effort Breakdown</h3>
            </div>
            <div className="rounded-md border border-[#1E2D45] bg-[#111827] overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-[#0D1526]">
                  <TableRow>
                    <TableHead>Category / Item</TableHead>
                    <TableHead className="text-right w-[110px]">Hours</TableHead>
                    <TableHead className="text-right w-[130px]">Blended Rate</TableHead>
                    <TableHead className="text-right w-[130px]">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Resource Labor Summary */}
                  <TableRow 
                    className="bg-[#1E2D45]/50 cursor-pointer hover:bg-[#1E2D45]/80"
                    onClick={() => setExpanded(p => ({ ...p, res: !p.res }))}
                  >
                    <TableCell colSpan={4} className="py-2 px-4 border-b-2 border-[#1E2D45]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {expanded.res ? <ChevronDown className="h-4 w-4 text-[#94A3B8]" /> : <ChevronRight className="h-4 w-4 text-[#94A3B8]" />}
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                            Resource Labor Summary
                          </span>
                        </div>
                        <div className="flex items-center gap-12 text-foreground text-sm font-medium pr-4">
                          <span className="tabular-nums w-[80px] text-right">{laborCosts.reduce((a, c) => a + c.total_hours, 0).toFixed(1)} hrs</span>
                          <span className="tabular-nums w-[90px] text-right">${laborCosts.reduce((a, c) => a + c.total_cost, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded.res && laborCosts.map(item => (
                    <TableRow key={item.resource_id} className="bg-[#111827]/50">
                      <TableCell className="pl-10">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{item.name}</span>
                          <span className="text-xs text-muted-foreground">{item.role}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        <div className="flex flex-col items-end gap-1">
                          <span>{item.total_hours.toFixed(1)}</span>
                          <Badge variant="outline" className={`scale-75 origin-right ${item.location === 'offshore' ? 'bg-emerald-900/20 text-emerald-300 border-emerald-800/50' : 'bg-blue-900/20 text-blue-300 border-blue-800/50'}`}>
                            {item.location === 'offshore' ? 'Offshore' : 'Onsite'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">${item.rate_per_hour.toLocaleString('en-US')}/hr</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">${item.total_cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                    </TableRow>
                  ))}
                  {expanded.res && laborCosts.length === 0 && (
                    <TableRow className="bg-[#111827]/50">
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground italic text-sm">
                        No resources loaded. Costs will populate once hours are added in the Resources tab.
                      </TableCell>
                    </TableRow>
                  )}
                  {expanded.res && laborCosts.length > 0 && (
                    <TableRow className="bg-[#0D1526] border-b-2 border-[#1E2D45]">
                      <TableCell colSpan={4} className="p-0">
                        <div className="flex flex-col px-10 py-4 gap-2 text-xs">
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span>Total Onsite Hours</span>
                            <div className="flex gap-8 text-right tabular-nums">
                              <span className="w-[80px]">{totals.onsiteHours.toFixed(1)} hrs</span>
                              <span className="w-[90px]">${totals.onsiteCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                              <span className="w-[40px]">({laborCosts.reduce((a,c) => a + c.total_hours, 0) > 0 ? ((totals.onsiteHours / laborCosts.reduce((a,c) => a + c.total_hours, 0)) * 100).toFixed(0) : 0}%)</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-muted-foreground border-b pb-2">
                            <span>Total Offshore Hours</span>
                            <div className="flex gap-8 text-right tabular-nums">
                              <span className="w-[80px]">{totals.offshoreHours.toFixed(1)} hrs</span>
                              <span className="w-[90px]">${totals.offshoreCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                              <span className="w-[40px]">({laborCosts.reduce((a,c) => a + c.total_hours, 0) > 0 ? ((totals.offshoreHours / laborCosts.reduce((a,c) => a + c.total_hours, 0)) * 100).toFixed(0) : 0}%)</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center font-bold pt-1 text-sm text-foreground">
                            <span>TOTAL LABOR</span>
                            <div className="flex gap-8 text-right tabular-nums">
                              <span className="w-[80px]">{laborCosts.reduce((a,c) => a + c.total_hours, 0).toFixed(1)} hrs</span>
                              <span className="w-[90px]">${laborCosts.reduce((a,c) => a + c.total_cost, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                              <span className="w-[40px]"></span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-2 mt-2 border-t border-dashed border-[#1E2D45]">
                            <span className="font-semibold text-[#94A3B8]">Blended Rate</span>
                            <span className="font-bold text-[#94A3B8]">${totals.resourceBlendedRate.toFixed(2)}/hr</span>
                          </div>
                          {totals.hasOffshore && (
                            <div className="flex justify-between items-center text-green-700 font-medium">
                              <span>Offshore Savings vs All-Onsite (${ONSITE_RATE}/hr)</span>
                              <span className="tabular-nums font-bold">
                                {totals.offshoreSavings >= 0 ? '+' : '-'}${Math.abs(totals.offshoreSavings).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Construction Row */}
                  <TableRow className="bg-[#0D1526]/50">
                    <TableCell className="font-semibold pl-6 py-3">Construction (Base + Dev Contingency)</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{totals.trueBaseHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">${totals.resourceBlendedRate.toFixed(2)}/hr</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">${totals.trueBaseCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                  </TableRow>

                  {/* Layer 1 */}
                  <TableRow 
                    className="bg-blue-50/40 cursor-pointer hover:bg-blue-50/60" 
                    onClick={() => setExpanded(p => ({ ...p, l1: !p.l1 }))}
                  >
                    <TableCell colSpan={4} className="py-2 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {expanded.l1 ? <ChevronDown className="h-4 w-4 text-blue-700" /> : <ChevronRight className="h-4 w-4 text-blue-700" />}
                          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                            Layer 1 — Direct Effort
                          </span>
                        </div>
                        <div className="flex items-center gap-12 text-blue-800 text-sm font-medium pr-4">
                          <span className="tabular-nums w-[80px] text-right">{totals.l1SumHours.toFixed(1)} hrs</span>
                          <span className="tabular-nums w-[90px] text-right">${totals.l1SumCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded.l1 && totals.l1HoursList.filter(r => r.enabled).map(r => (
                    <TableRow key={r.label}>
                      <TableCell className="text-sm pl-10 text-muted-foreground">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{r.hours.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">${totals.resourceBlendedRate.toFixed(2)}/hr</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">${r.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                    </TableRow>
                  ))}

                  {/* Layer 2 */}
                  <TableRow 
                    className="bg-purple-50/40 cursor-pointer hover:bg-purple-50/60"
                    onClick={() => setExpanded(p => ({ ...p, l2: !p.l2 }))}
                  >
                    <TableCell colSpan={4} className="py-2 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {expanded.l2 ? <ChevronDown className="h-4 w-4 text-purple-700" /> : <ChevronRight className="h-4 w-4 text-purple-700" />}
                          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                            Layer 2 — Management & Support
                          </span>
                        </div>
                        <div className="flex items-center gap-12 text-purple-800 text-sm font-medium pr-4">
                          <span className="tabular-nums w-[80px] text-right">{totals.l2SumHours.toFixed(1)} hrs</span>
                          <span className="tabular-nums w-[90px] text-right">${totals.l2SumCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded.l2 && totals.l2HoursList.filter(r => r.enabled).map(r => (
                    <TableRow key={r.label}>
                      <TableCell className="text-sm pl-10 text-muted-foreground">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{r.hours.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">${totals.resourceBlendedRate.toFixed(2)}/hr</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">${r.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                    </TableRow>
                  ))}

                  {/* Layer 3 */}
                  {totals.l3HoursList.length > 0 && (
                    <>
                      <TableRow 
                        className="bg-[#1E2D45]/30 cursor-pointer hover:bg-[#1E2D45]/60"
                        onClick={() => setExpanded(p => ({ ...p, l3: !p.l3 }))}
                      >
                        <TableCell colSpan={4} className="py-2 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {expanded.l3 ? <ChevronDown className="h-4 w-4 text-[#94A3B8]" /> : <ChevronRight className="h-4 w-4 text-[#94A3B8]" />}
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                                Layer 3 — Custom Overheads
                              </span>
                            </div>
                            <div className="flex items-center gap-12 text-foreground text-sm font-medium pr-4">
                              <span className="tabular-nums w-[80px] text-right">{totals.l3SumHours.toFixed(1)} hrs</span>
                              <span className="tabular-nums w-[90px] text-right">${totals.l3SumCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded.l3 && totals.l3HoursList.map(r => (
                        <TableRow key={r.label}>
                          <TableCell className="text-sm pl-10 text-muted-foreground">{r.label}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{r.hours.toFixed(1)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">${totals.resourceBlendedRate.toFixed(2)}/hr</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">${r.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}

                  <TableRow className="border-t-2 border-t-zinc-200">
                    <TableCell className="font-bold py-4">TOTAL LABOR HOURS</TableCell>
                    <TableCell className="text-right font-bold py-4">{totals.loadedLaborHours.toFixed(1)} hrs</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-bold pt-1 pb-4 text-lg">TOTAL LABOR COST</TableCell>
                    <TableCell colSpan={2} />
                    <TableCell className="text-right font-bold pt-1 pb-4 text-lg text-sidebar">
                      ${totals.loadedLaborCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Section 2: Additional Costs */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-sidebar" />
                <h3 className="text-lg font-semibold">Additional Costs</h3>
              </div>
              <Button onClick={addAdditionalCost} variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </div>
            
            <div className="rounded-md border border-[#1E2D45] bg-[#111827] overflow-hidden shadow-sm">
              <div
                className="flex items-center justify-between bg-[#0D1526] px-4 py-2 cursor-pointer border-b border-[#1E2D45] hover:bg-[#1E2D45]/30"
                onClick={() => setExpanded(p => ({ ...p, add: !p.add }))}
              >
                <div className="flex items-center gap-2">
                  {expanded.add ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Expenses & Licensing</span>
                </div>
                <div className="text-foreground text-sm font-medium pr-6">
                  ${totals.totalAdditionalCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
              </div>

              {expanded.add && (
                <Table>
                  <TableHeader className="bg-[#0D1526]/50">
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead className="w-[120px] text-right">Amount</TableHead>
                      <TableHead className="w-[100px] text-right">Duration (mo)</TableHead>
                      <TableHead className="w-[140px] text-right">Total</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {additionalCosts.map(cost => {
                      const lineTotal = cost.cost_type === 'monthly' ? cost.amount * cost.duration_months : cost.amount
                      return (
                        <TableRow key={cost.id}>
                          <TableCell>
                            <Input
                              value={cost.label}
                              onChange={e => handleAdditionalCostUpdate(cost.id, { label: e.target.value })}
                              className="h-8 border-none bg-transparent"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={cost.cost_type}
                              onValueChange={v => handleAdditionalCostUpdate(cost.id, { cost_type: v as any })}
                            >
                              <SelectTrigger className="h-8 border-none bg-transparent capitalize">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixed</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={cost.amount}
                              onChange={e => handleAdditionalCostUpdate(cost.id, { amount: Number(e.target.value) })}
                              className="h-8 border-none bg-transparent text-right"
                            />
                          </TableCell>
                          <TableCell>
                            {cost.cost_type === 'monthly' ? (
                              <Input
                                type="number"
                                min="1"
                                value={cost.duration_months}
                                onChange={e => handleAdditionalCostUpdate(cost.id, { duration_months: Number(e.target.value) })}
                                className="h-8 border-none bg-transparent text-right"
                              />
                            ) : (
                              <div className="text-right text-muted-foreground pr-3">—</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">${lineTotal.toLocaleString('en-US')}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(cost.id)} className="text-muted-foreground hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {additionalCosts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <PlusCircle className="h-8 w-8 text-muted-foreground opacity-20" />
                            <p className="text-sm text-muted-foreground">No additional costs defined.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="border-t-2 border-t-zinc-200">
                      <TableCell colSpan={4} className="font-bold py-4">TOTAL ADDITIONAL COSTS</TableCell>
                      <TableCell className="text-right font-bold py-4 text-sidebar text-lg">
                        ${totals.totalAdditionalCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
          </section>

          {/* Section 4: Payment Schedule */}
          <PaymentScheduleSection
            projectId={projectId}
            quotedPrice={totals.quotedPrice}
            project={project}
            initialMilestones={initialMilestones}
            templates={templates}
          />

          {/* Section 5: Quote Narrative */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-sidebar" />
                <h3 className="text-lg font-semibold">Quote Narrative</h3>
              </div>
              {aiAppliedFields.has("narrative") && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-purple-900/30 text-purple-300 border-purple-500/40 shrink-0 gap-1 font-semibold">
                  ✨ AI
                </Badge>
              )}
            </div>
            <Card>
              <CardContent className="pt-6">
                <Textarea
                  placeholder="Describe inclusions, exclusions, and assumptions here..."
                  value={config.quote_narrative || ""}
                  onChange={e => updateConfig({ quote_narrative: e.target.value })}
                  className="min-h-[200px] bg-[#111827]"
                />
                <p className="mt-2 text-xs text-muted-foreground italic">
                  This text will appear in the final proposal summary.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Right: Cost Roll-up & Quote Builder */}
        <div className="space-y-6">
          <Card className="shadow-xl border-t-4 border-t-sidebar sticky top-6">
            <CardHeader className="bg-[#0D1526]/50 border-b border-[#1E2D45] pb-4">
              <CardTitle>Cost Roll-up</CardTitle>
              <CardDescription>Final pricing logic & taxes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Labor Cost</span>
                  <span className="font-medium">${totals.loadedLaborCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Additional Costs</span>
                  <span className="font-medium">${totals.totalAdditionalCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
                <Separator className="opacity-50" />
                <div className="flex justify-between items-center text-sm font-bold">
                  <span>SUBTOTAL</span>
                  <span>${totals.subtotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>

              {!config.rates_include_margin && (
                <div className="space-y-4 p-4 rounded-lg bg-[#0D1526] border border-dashed border-[#1E2D45] transition-all">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">Margin %</span>
                      {aiAppliedFields.has("margin") && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-purple-900/30 text-purple-300 border-purple-500/40 shrink-0 gap-1 font-semibold">
                          ✨ AI
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={config.margin_percent}
                        onChange={e => updateConfig({ margin_percent: Number(e.target.value) })}
                        className="h-8 w-20 text-right px-2 bg-[#111827]"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  {clientIntelligence?.marginSuggestion !== null && clientIntelligence?.marginSuggestion !== undefined && (
                    <div className="flex items-center justify-between text-xs rounded-md bg-blue-900/10 border border-blue-800/30 px-3 py-2">
                      <span className="text-blue-300">
                        💡 Suggested: <strong>{clientIntelligence.marginSuggestion.toFixed(1)}%</strong>
                        {' '}({clientIntelligence.won > 0 ? `based on ${clientIntelligence.won} past win${clientIntelligence.won !== 1 ? 's' : ''}` : 'client insight'})
                      </span>
                      <button
                        type="button"
                        onClick={() => updateConfig({ margin_percent: Math.round(clientIntelligence.marginSuggestion! * 10) / 10 })}
                        className="ml-3 shrink-0 rounded-md bg-blue-700 hover:bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Margin Amount</span>
                    <span className="font-semibold text-green-600">${totals.marginAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2 text-xs">
                <Switch
                  checked={config.rates_include_margin}
                  onCheckedChange={v => updateConfig({ rates_include_margin: v })}
                  className="scale-75"
                />
                <span className="text-muted-foreground">Rates already include margin</span>
              </div>

              <Separator className="my-4 border-2" />

              <div className="flex justify-between items-center font-bold">
                <span>PRE-TAX TOTAL</span>
                <span>${totals.preTaxTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-[#0D1526] border border-[#1E2D45]">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Input 
                      value={taxLabel} 
                      onChange={e => handleTaxUpdate({ label: e.target.value })} 
                      className="h-8 text-xs w-[120px] font-medium bg-[#111827]"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={taxPercent}
                        onChange={e => handleTaxUpdate({ percent: Number(e.target.value) })}
                        className="h-8 w-20 text-right px-2 bg-[#111827]"
                        disabled={taxMode === 'not_applicable'}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  
                  <div className="pt-2 flex flex-col gap-1 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="taxmode" checked={taxMode === 'full'} onChange={() => handleTaxUpdate({ mode: 'full' })} className="accent-sidebar" />
                      <span>Apply to full amount</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="taxmode" checked={taxMode === 'additional_only'} onChange={() => handleTaxUpdate({ mode: 'additional_only' })} className="accent-sidebar" />
                      <span>Apply to additional costs only</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="taxmode" checked={taxMode === 'not_applicable'} onChange={() => handleTaxUpdate({ mode: 'not_applicable' })} className="accent-sidebar" />
                      <span className="text-muted-foreground italic">Not applicable (hide tax)</span>
                    </label>
                  </div>
                </div>

                {taxMode !== 'not_applicable' && (
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-[#1E2D45]">
                    <span className="text-muted-foreground">{taxLabel} Amount</span>
                    <span className="font-semibold text-[#94A3B8]">${totals.taxAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                {taxMode === 'additional_only' && (
                  <p className="text-[10px] text-muted-foreground italic text-right">* Applied to Additional Costs only</p>
                )}
              </div>

              <Separator className="my-4 border-2" />

              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">QUOTED PRICE</p>
                <div className="flex items-baseline justify-between">
                  <span className={`text-4xl font-black tracking-tight ${marginColor}`}>
                    ${totals.quotedPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 bg-[#0D1526]/50 rounded-md border border-[#1E2D45] text-center mt-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Effective Blended Rate</p>
                  <p className="text-lg font-bold">${totals.finalBlendedRate.toFixed(2)}/hr</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Cost per SP</p>
                  <p className="text-lg font-bold">
                    {totalSP > 0 ? `$${totals.costPerSP.toFixed(2)}/SP` : "N/A"}
                  </p>
                </div>
              </div>

              <Button
                onClick={() => router.push(`/projects/${projectId}/summary`)}
                className="w-full bg-sidebar text-white hover:bg-sidebar-accent gap-2 h-11 text-base font-bold shadow-lg mt-4"
              >
                <DollarSign className="h-5 w-5" />
                Generate Quote PDF
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove cost item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this line item from your project financials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeAdditionalCost} className="bg-red-600 hover:bg-red-700 text-white">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
