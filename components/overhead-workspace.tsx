"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Plus, Trash2, Save, CheckCircle2, Info, ArrowRight, Layers } from "lucide-react"
import debounce from "lodash.debounce"
import { v4 as uuidv4 } from "uuid"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

import { OverheadConfig, CustomOverhead } from "@/lib/types"
import { updateOverheadConfig } from "@/lib/actions"
import { OverheadAIPanel } from "@/components/overhead-ai-panel"
import { OverheadRecommendationData } from "@/app/api/projects/[id]/ai-recommend/route"

interface OverheadWorkspaceProps {
  projectId: string
  initialConfig: OverheadConfig
  constructionHours: number
  wbsConfidenceHours?: number
}

export function OverheadWorkspace({
  projectId,
  initialConfig,
  constructionHours,
  wbsConfidenceHours = 0,
}: OverheadWorkspaceProps) {
  const [config, setConfig] = useState<OverheadConfig>(initialConfig)
  const [saving, setSaving] = useState(false)
  const [aiAppliedKeys, setAiAppliedKeys] = useState<Set<string>>(new Set())
  const saveCount = useRef(0)

  // Cascading three-tier calculation
  const calc = useMemo(() => {
    const base = constructionHours

    const l1Rows = [
      { key: "ba", label: "Business Analysis", percent: config.ba_percent, enabled: config.ba_enabled },
      { key: "qa", label: "Quality Assurance", percent: config.qa_percent, enabled: config.qa_enabled },
      { key: "devops", label: "DevOps / Infrastructure", percent: config.devops_percent, enabled: config.devops_enabled },
      { key: "ux", label: "UX / Design", percent: config.ux_percent, enabled: config.ux_enabled },
    ].map(r => ({ ...r, hours: r.enabled ? Math.ceil(base * (Math.max(0, r.percent) / 100)) : 0 }))
    const l1Sum = l1Rows.reduce((a, r) => a + r.hours, 0)
    const layer1Subtotal = base + l1Sum

    const l2Rows = [
      { key: "pm", label: "Project Management", percent: config.pm_percent, enabled: config.pm_enabled },
      { key: "change_mgmt", label: "Change Management", percent: config.change_mgmt_percent, enabled: config.change_mgmt_enabled },
      { key: "solutions_arch", label: "Solutions Architecture", percent: config.solutions_arch_percent, enabled: config.solutions_arch_enabled },
      { key: "training", label: "Training & Enablement", percent: config.training_percent, enabled: config.training_enabled },
      { key: "warranty", label: "Warranty / Hypercare", percent: config.warranty_percent, enabled: config.warranty_enabled },
      { key: "risk_buffer", label: "Risk Buffer", percent: config.risk_buffer_percent, enabled: config.risk_buffer_enabled },
    ].map(r => ({ ...r, hours: r.enabled ? Math.ceil(layer1Subtotal * (Math.max(0, r.percent) / 100)) : 0 }))
    const l2Sum = l2Rows.reduce((a, r) => a + r.hours, 0)

    const l3Rows = (config.customOverheads || []).map(co => ({
      ...co,
      hours: Math.ceil(layer1Subtotal * (Math.max(0, co.percent) / 100)),
    }))
    const l3Sum = l3Rows.reduce((a, r) => a + r.hours, 0)

    const grandTotal = layer1Subtotal + l2Sum + l3Sum
    const contingencyHours = Math.ceil(grandTotal * (Math.max(0, config.project_contingency_percent) / 100))
    const finalTotal = grandTotal + contingencyHours

    return { l1Rows, l1Sum, layer1Subtotal, l2Rows, l2Sum, l3Rows, l3Sum, grandTotal, contingencyHours, finalTotal }
  }, [config, constructionHours])

  // Auto-save
  const debouncedSave = useCallback(
    debounce((data: OverheadConfig) => {
      saveCount.current += 1
      setSaving(true)
      updateOverheadConfig(projectId, data)
        .then(() => {
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
        .catch(err => {
          console.error(err)
          toast.error("Auto-save failed")
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
    }, 800),
    [projectId]
  )

  useEffect(() => {
    if (config !== initialConfig) debouncedSave(config)
  }, [config, debouncedSave, initialConfig])

  const update = (updates: Partial<OverheadConfig>, touchedKey?: string) => {
    if (touchedKey) {
      setAiAppliedKeys(prev => {
        if (!prev.has(touchedKey)) return prev
        const next = new Set(prev)
        next.delete(touchedKey)
        return next
      })
    }
    setConfig(prev => ({ ...prev, ...updates }))
  }

  const handleApplyAI = (recs: OverheadRecommendationData["recommendations"]) => {
    setConfig(prev => ({
      ...prev,
      ba_enabled: recs.ba_enabled,
      ba_percent: recs.ba_percent,
      qa_enabled: recs.qa_enabled,
      qa_percent: recs.qa_percent,
      devops_enabled: recs.devops_enabled,
      devops_percent: recs.devops_percent,
      ux_enabled: recs.ux_enabled,
      ux_percent: recs.ux_percent,

      pm_enabled: recs.pm_enabled,
      pm_percent: recs.pm_percent,
      change_mgmt_enabled: recs.change_mgmt_enabled,
      change_mgmt_percent: recs.change_mgmt_percent,
      solutions_arch_enabled: recs.solutions_arch_enabled,
      solutions_arch_percent: recs.solutions_arch_percent,
      training_enabled: recs.training_enabled,
      training_percent: recs.training_percent,
      warranty_enabled: recs.warranty_enabled,
      warranty_percent: recs.warranty_percent,
      risk_buffer_enabled: recs.risk_buffer_enabled,
      risk_buffer_percent: recs.risk_buffer_percent,

      project_contingency_percent: recs.project_contingency_percent,
    }))
    setAiAppliedKeys(new Set([
      "ba", "qa", "devops", "ux",
      "pm", "change_mgmt", "solutions_arch", "training", "warranty", "risk_buffer",
      "contingency"
    ]))
  }

  const addCustomOverhead = () => {
    const newItem: CustomOverhead = {
      id: uuidv4(),
      label: "Custom Overhead",
      percent: 5,
      sort_order: (config.customOverheads || []).length,
    }
    update({ customOverheads: [...(config.customOverheads || []), newItem] })
  }

  const updateCustomOverhead = (id: string, patch: Partial<CustomOverhead>) => {
    update({
      customOverheads: (config.customOverheads || []).map(co =>
        co.id === id ? { ...co, ...patch } : co
      ),
    })
  }

  const deleteCustomOverhead = (id: string) => {
    update({ customOverheads: (config.customOverheads || []).filter(co => co.id !== id) })
  }

  return (
    <div className="space-y-6">
      {/* AI Overhead Assistant Panel */}
      <OverheadAIPanel
        projectId={projectId}
        currentConfig={config}
        constructionHours={constructionHours}
        wbsConfidenceHours={wbsConfidenceHours}
        onApplyRecommendations={handleApplyAI}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Three-tier configuration */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-sidebar" />
              <h2 className="text-xl font-semibold">Three-Tier Overhead Model</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {saving ? (
                <><Save className="h-3 w-3 animate-pulse" /> Saving...</>
              ) : (
                <><CheckCircle2 className="h-3 w-3 text-green-500" /> Saved</>
              )}
            </div>
          </div>

          {/* LAYER 1 */}
          <LayerSection
            number={1}
            title="Direct Effort"
            color="blue"
            baseLabel="WBS Estimate Base"
            baseHours={constructionHours}
            subtotalHours={calc.layer1Subtotal}
            subtotalLabel="Layer 1 Subtotal"
          >
            <Table>
              <TableHeader className="bg-blue-900/10">
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-[130px]">% of Base</TableHead>
                  <TableHead className="w-[110px] text-right">Hours</TableHead>
                  <TableHead className="w-[70px] text-center">Include</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.l1Rows.map(row => (
                  <OverheadRow
                    key={row.key}
                    label={row.label}
                    percent={row.percent}
                    enabled={row.enabled}
                    hours={row.hours}
                    isAiApplied={aiAppliedKeys.has(row.key)}
                    onPercentChange={v => update({ [`${row.key}_percent`]: v } as any, row.key)}
                    onEnabledChange={v => update({ [`${row.key}_enabled`]: v } as any, row.key)}
                  />
                ))}
              </TableBody>
            </Table>
          </LayerSection>

          {/* LAYER 2 */}
          <LayerSection
            number={2}
            title="Management & Support"
            color="purple"
            baseLabel="Layer 1 Subtotal"
            baseHours={calc.layer1Subtotal}
            subtotalHours={calc.l2Sum}
            subtotalLabel="Layer 2 Overhead"
          >
            <div className="px-4 pb-1 text-[11px] text-purple-300 bg-purple-900/10 py-2 border-b border-purple-900/30 font-medium">
              Each row is calculated as % × Layer 1 Subtotal ({calc.layer1Subtotal.toFixed(1)} hrs)
            </div>
            <Table>
              <TableHeader className="bg-purple-900/10">
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-[130px]">% of L1 Subtotal</TableHead>
                  <TableHead className="w-[110px] text-right">Hours</TableHead>
                  <TableHead className="w-[70px] text-center">Include</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.l2Rows.map(row => (
                  <OverheadRow
                    key={row.key}
                    label={row.label}
                    percent={row.percent}
                    enabled={row.enabled}
                    hours={row.hours}
                    isAiApplied={aiAppliedKeys.has(row.key)}
                    onPercentChange={v => update({ [`${row.key}_percent`]: v } as any, row.key)}
                    onEnabledChange={v => update({ [`${row.key}_enabled`]: v } as any, row.key)}
                  />
                ))}
              </TableBody>
            </Table>
          </LayerSection>

        {/* LAYER 3 */}
        <LayerSection
          number={3}
          title="Custom Overheads"
          color="slate"
          baseLabel="Layer 1 Subtotal"
          baseHours={calc.layer1Subtotal}
          subtotalHours={calc.l3Sum}
          subtotalLabel="Layer 3 Overhead"
          action={
            <Button onClick={addCustomOverhead} variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Row
            </Button>
          }
        >
          {(config.customOverheads || []).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <p>No custom overheads defined.</p>
              <Button onClick={addCustomOverhead} variant="ghost" size="sm" className="mt-2">Add your first row</Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-[#0D1526]/50">
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="w-[130px]">% of L1 Subtotal</TableHead>
                  <TableHead className="w-[110px] text-right">Hours</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.l3Rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Input
                        value={row.label}
                        onChange={e => updateCustomOverhead(row.id, { label: e.target.value })}
                        className="h-8 border-none bg-transparent hover:bg-[#1E2D45] p-0 px-2 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={row.percent}
                          onChange={e => updateCustomOverhead(row.id, { percent: Number(e.target.value) })}
                          className="h-8 w-16 text-right"
                        />
                        <span className="text-muted-foreground text-xs">%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {row.hours.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCustomOverhead(row.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </LayerSection>

        {/* Info banner */}
        <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4 flex gap-3">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-300 space-y-1">
            <p><strong>Layer 1</strong> percentages apply to the WBS Estimate Base ({constructionHours.toFixed(1)} hrs).</p>
            <p><strong>Layers 2 & 3</strong> percentages apply to the Layer 1 Subtotal — the cascading base includes all direct effort.</p>
            {wbsConfidenceHours > 0 && (
              <p className="mt-1 text-blue-400">
                WBS confidence gap: <strong>{wbsConfidenceHours.toFixed(1)} hrs</strong> — consider this when setting your contingency %.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right: Summary card */}
      <div className="space-y-6">
        <Card className="shadow-lg border-t-4 border-t-sidebar sticky top-6">
          <CardHeader>
            <CardTitle>Live Summary</CardTitle>
            <CardDescription>Cascading hour breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <Link href={`/projects/${projectId}/estimate`} className="text-muted-foreground hover:text-sidebar flex items-center gap-1 group">
                Estimate Base <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all" />
              </Link>
              <span className="font-medium tabular-nums">{constructionHours.toFixed(1)}</span>
            </div>

            <div className="space-y-1.5 pl-2 border-l-2 border-blue-700">
              {calc.l1Rows.filter(r => r.enabled && r.hours > 0).map(r => (
                <div key={r.key} className="flex justify-between text-xs text-muted-foreground">
                  <span>{r.label} ({r.percent}%)</span>
                  <span className="tabular-nums">+{r.hours.toFixed(1)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center text-sm font-semibold bg-blue-900/20 px-2 py-1.5 rounded">
              <span>Layer 1 Subtotal</span>
              <span className="tabular-nums">{calc.layer1Subtotal.toFixed(1)}</span>
            </div>

            <Separator className="opacity-50" />

            <div className="space-y-1.5 pl-2 border-l-2 border-purple-700">
              {calc.l2Rows.filter(r => r.enabled && r.hours > 0).map(r => (
                <div key={r.key} className="flex justify-between text-xs text-muted-foreground">
                  <span>{r.label} ({r.percent}%)</span>
                  <span className="tabular-nums">+{r.hours.toFixed(1)}</span>
                </div>
              ))}
            </div>

            {calc.l2Sum > 0 && (
              <div className="flex justify-between items-center text-xs font-medium text-purple-300 bg-purple-900/20 px-2 py-1 rounded">
                <span>Layer 2 Subtotal</span>
                <span className="tabular-nums">+{calc.l2Sum.toFixed(1)}</span>
              </div>
            )}

            {calc.l3Rows.length > 0 && (
              <>
                <div className="space-y-1.5 pl-2 border-l-2 border-[#1E2D45]">
                  {calc.l3Rows.filter(r => r.hours > 0).map(r => (
                    <div key={r.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{r.label} ({r.percent}%)</span>
                      <span className="tabular-nums">+{r.hours.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                {calc.l3Sum > 0 && (
                  <div className="flex justify-between items-center text-xs font-medium text-[#94A3B8] bg-[#1E2D45]/30 px-2 py-1 rounded">
                    <span>Layer 3 Subtotal</span>
                    <span className="tabular-nums">+{calc.l3Sum.toFixed(1)}</span>
                  </div>
                )}
              </>
            )}

            <Separator className="opacity-50" />

            <div className="flex justify-between items-center text-sm font-bold">
              <span>Grand Total</span>
              <span className="tabular-nums">{calc.grandTotal.toFixed(1)}</span>
            </div>

            <div className="bg-[#0D1526] border border-dashed border-[#1E2D45] rounded p-2 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>Project Contingency</span>
                  {aiAppliedKeys.has("contingency") && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-blue-600/50 bg-blue-900/30 text-blue-300 font-normal">
                      ✨ AI
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={config.project_contingency_percent}
                    onChange={e => update({ project_contingency_percent: Number(e.target.value) }, "contingency")}
                    className="h-6 w-14 text-right px-1.5 text-xs"
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Contingency hours</span>
                <span className="tabular-nums">+{calc.contingencyHours.toFixed(1)}</span>
              </div>
              {wbsConfidenceHours > 0 && (
                <p className="text-[10px] text-blue-400 italic">
                  Suggested by WBS confidence: {wbsConfidenceHours.toFixed(1)} hrs
                </p>
              )}
            </div>

            <div className="pt-3 flex justify-between items-end border-t">
              <span className="text-base font-bold uppercase tracking-wide">Final Total</span>
              <span className="text-3xl font-black text-foreground tracking-tight tabular-nums">
                {calc.finalTotal.toFixed(1)}
              </span>
            </div>
            <p className="text-[10px] text-right text-muted-foreground -mt-1">hours</p>
          </CardContent>
        </Card>

        {/* Proportional breakdown chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Proportional Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-8 w-full bg-[#1E2D45] rounded-full overflow-hidden flex shadow-inner">
              <div
                className="h-full bg-sidebar transition-all duration-500"
                style={{ width: `${(constructionHours / (calc.finalTotal || 1)) * 100}%` }}
                title={`Estimate Base: ${constructionHours.toFixed(1)} hrs`}
              />
              <div
                className="h-full bg-blue-400 transition-all duration-500"
                style={{ width: `${(calc.l1Sum / (calc.finalTotal || 1)) * 100}%` }}
                title={`Layer 1: ${calc.l1Sum.toFixed(1)} hrs`}
              />
              <div
                className="h-full bg-purple-400 transition-all duration-500"
                style={{ width: `${(calc.l2Sum / (calc.finalTotal || 1)) * 100}%` }}
                title={`Layer 2: ${calc.l2Sum.toFixed(1)} hrs`}
              />
              {calc.l3Sum > 0 && (
                <div
                  className="h-full bg-slate-400 transition-all duration-500"
                  style={{ width: `${(calc.l3Sum / (calc.finalTotal || 1)) * 100}%` }}
                  title={`Layer 3: ${calc.l3Sum.toFixed(1)} hrs`}
                />
              )}
              <div
                className="h-full bg-zinc-400 transition-all duration-500"
                style={{ width: `${(calc.contingencyHours / (calc.finalTotal || 1)) * 100}%` }}
                title={`Contingency: ${calc.contingencyHours.toFixed(1)} hrs`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <LegendItem color="bg-sidebar" label="Estimate Base" />
              <LegendItem color="bg-blue-400" label="L1 Direct Effort" />
              <LegendItem color="bg-purple-400" label="L2 Management" />
              {calc.l3Sum > 0 && <LegendItem color="bg-slate-400" label="L3 Custom" />}
              <LegendItem color="bg-zinc-400" label="Contingency" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  )
}

function LayerSection({
  number,
  title,
  color,
  baseLabel,
  baseHours,
  subtotalHours,
  subtotalLabel,
  children,
  action,
}: {
  number: number
  title: string
  color: "blue" | "purple" | "slate"
  baseLabel: string
  baseHours: number
  subtotalHours: number
  subtotalLabel: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const colorMap = {
    blue: { badge: "bg-blue-600", border: "border-blue-800/50", header: "bg-blue-900/20", text: "text-blue-300", subtotal: "bg-blue-900/20 text-blue-300" },
    purple: { badge: "bg-purple-600", border: "border-purple-800/50", header: "bg-purple-900/20", text: "text-purple-300", subtotal: "bg-purple-900/20 text-purple-300" },
    slate: { badge: "bg-[#94A3B8]", border: "border-[#1E2D45]", header: "bg-[#1E2D45]/40", text: "text-[#94A3B8]", subtotal: "bg-[#1E2D45]/40 text-[#94A3B8]" },
  }
  const c = colorMap[color]

  return (
    <div className={`rounded-lg border ${c.border} overflow-hidden`}>
      <div className={`${c.header} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-white text-xs font-bold ${c.badge}`}>
            {number}
          </span>
          <div>
            <p className={`text-sm font-bold uppercase tracking-wider ${c.text}`}>Layer {number} — {title}</p>
            <p className="text-xs text-muted-foreground">
              Base: <span className="font-medium tabular-nums">{baseHours.toFixed(1)} hrs</span> ({baseLabel})
            </p>
          </div>
        </div>
        {action}
      </div>
      <div className="bg-[#111827]">
        {children}
      </div>
      <div className={`${c.subtotal} px-4 py-2 flex justify-between items-center text-sm font-semibold border-t ${c.border}`}>
        <span>{subtotalLabel}</span>
        <span className="tabular-nums font-mono">{subtotalHours.toFixed(1)} hrs</span>
      </div>
    </div>
  )
}

function OverheadRow({
  label,
  percent,
  enabled,
  hours,
  isAiApplied,
  onPercentChange,
  onEnabledChange,
}: {
  label: string
  percent: number
  enabled: boolean
  hours: number
  isAiApplied?: boolean
  onPercentChange: (v: number) => void
  onEnabledChange: (v: boolean) => void
}) {
  return (
    <TableRow className={enabled ? "" : "opacity-40 grayscale"}>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {isAiApplied && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-blue-600/50 bg-blue-900/30 text-blue-300 font-normal">
              ✨ AI
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="0"
            max="200"
            value={percent}
            onChange={e => onPercentChange(Number(e.target.value))}
            className="h-8 w-16 text-right"
          />
          <span className="text-muted-foreground text-xs">%</span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
        {hours.toFixed(1)}
      </TableCell>
      <TableCell className="text-center">
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </TableCell>
    </TableRow>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      <div className={`h-2 w-2 rounded-full ${color} shrink-0`} />
      <span className="text-[10px] text-muted-foreground truncate">{label}</span>
    </div>
  )
}
