"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import {
  saveBillingMilestone, deleteBillingMilestone, loadMilestoneTemplate, getBillingMilestones,
} from "@/lib/actions"
import type { BillingMilestone, MilestoneTemplate, TriggerType, Project } from "@/lib/types"
import {
  AlertTriangle, ChevronDown, ChevronRight, GripVertical,
  Loader2, Plus, Trash2, X, CreditCard, ArrowUp, ArrowDown,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`
const round2 = (n: number) => Math.round(n * 100) / 100

const TRIGGER_META: Record<TriggerType, { label: string; color: string }> = {
  date:             { label: "Date",             color: "bg-gray-700 text-gray-300"   },
  milestone:        { label: "Milestone",        color: "bg-blue-900/50 text-blue-300" },
  phase_complete:   { label: "Phase Complete",   color: "bg-purple-900/50 text-purple-300" },
  client_approval:  { label: "Client Approval",  color: "bg-amber-900/50 text-amber-300" },
  contract_signing: { label: "Contract Signing", color: "bg-green-900/50 text-green-300" },
}

function TriggerBadge({ type }: { type: TriggerType }) {
  const meta = TRIGGER_META[type] ?? TRIGGER_META.milestone
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function getDefaultStart(project: Project): string {
  return project.project_start_date
    || project.timeline_start
    || new Date().toISOString().split('T')[0]
}

function getDefaultDuration(project: Project): number {
  if (project.timeline_duration_value && project.timeline_duration_unit) {
    return project.timeline_duration_unit === 'months'
      ? project.timeline_duration_value * 4
      : project.timeline_duration_value
  }
  if (project.timeline_start && project.timeline_end) {
    const ms = new Date(project.timeline_end).getTime() - new Date(project.timeline_start).getTime()
    return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))
  }
  return 16
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  quotedPrice: number
  project: Project
  initialMilestones: BillingMilestone[]
  templates: MilestoneTemplate[]
}

const EMPTY_FORM = (): Partial<BillingMilestone> => ({
  title: "", trigger_type: "milestone", deliverables: "", description: "",
  percentage: 0, amount: 0, planned_date: "", payment_terms: 30, notes: "",
  revised_date: "", milestone_notes: "",
})

export function PaymentScheduleSection({ projectId, quotedPrice, project, initialMilestones, templates }: Props) {
  const router = useRouter()
  const [milestones, setMilestones] = useState<BillingMilestone[]>(initialMilestones)

  // Slide-over state
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm] = useState<Partial<BillingMilestone>>(EMPTY_FORM())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Template modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.template_name ?? "")
  const [loadStart, setLoadStart]       = useState(getDefaultStart(project))
  const [loadDuration, setLoadDuration] = useState(String(getDefaultDuration(project)))
  const [templateLoading, setTemplateLoading] = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Cash flow
  const [cfOpen, setCfOpen] = useState(false)

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalPct    = milestones.reduce((s, m) => s + m.percentage, 0)
  const totalAmount = milestones.reduce((s, m) => s + m.amount, 0)

  // ── Template preview ────────────────────────────────────────────────────────
  const templatePreview = useMemo(() => {
    const tpl = templates.find(t => t.template_name === selectedTemplate)
    if (!tpl) return []
    const raw: any[] = tpl.milestones_json ? JSON.parse(tpl.milestones_json) : []
    const dw = parseFloat(loadDuration) || 16
    if (selectedTemplate === 'T&M Monthly') {
      const months = Math.max(1, Math.ceil(dw / 4))
      return Array.from({ length: months }, (_, i) => ({
        title: `Month ${i + 1} Invoice`,
        percentage: Math.round((100 / months) * 10) / 10,
        amount: Math.round(quotedPrice / months),
        trigger_type: 'date',
      }))
    }
    return raw.map((m: any) => ({
      title: m.title,
      percentage: m.percentage,
      amount: Math.round(quotedPrice * (m.percentage / 100)),
      trigger_type: m.trigger_type,
    }))
  }, [selectedTemplate, loadDuration, quotedPrice, templates])

  const previewTotal = templatePreview.reduce((s, m) => s + m.percentage, 0)

  // ── Cash flow chart data ─────────────────────────────────────────────────────
  const cashFlowData = useMemo(() => {
    const sorted = [...milestones]
      .filter(m => m.planned_date)
      .sort((a, b) => (a.planned_date ?? "").localeCompare(b.planned_date ?? ""))
    let cum = 0
    return sorted.map(m => {
      cum += m.amount
      return { label: m.title.length > 14 ? m.title.slice(0, 12) + "…" : m.title, amount: m.amount, cumulative: cum, date: m.planned_date }
    })
  }, [milestones])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openNew() {
    setForm({ ...EMPTY_FORM(), project_id: projectId, sort_order: milestones.length })
    setEditingId(null)
    setPanelOpen(true)
  }

  function openEdit(m: BillingMilestone) {
    setForm({ ...m })
    setEditingId(m.id)
    setPanelOpen(true)
  }

  function updateForm(updates: Partial<BillingMilestone>) {
    setForm(prev => {
      const next = { ...prev, ...updates }
      // Bidirectional sync: % → amount
      if ('percentage' in updates && updates.percentage !== undefined && quotedPrice > 0) {
        next.amount = Math.round(quotedPrice * (updates.percentage / 100))
      }
      // Bidirectional sync: amount → %
      if ('amount' in updates && updates.amount !== undefined && quotedPrice > 0) {
        next.percentage = round2((updates.amount / quotedPrice) * 100)
      }
      return next
    })
  }

  async function handleSave() {
    if (!form.title?.trim()) { toast.error("Milestone title is required"); return }
    setSaving(true)
    try {
      await saveBillingMilestone({
        ...form,
        id: editingId ?? uuidv4(),
        project_id: projectId,
      })
      const updated = await getBillingMilestones(projectId)
      setMilestones(updated)
      setPanelOpen(false)
      toast.success(editingId ? "Milestone updated" : "Milestone added")
      router.refresh()
    } catch {
      toast.error("Failed to save milestone")
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteBillingMilestone(deleteId, projectId)
      const updated = await getBillingMilestones(projectId)
      setMilestones(updated)
      setDeleteId(null)
      toast.success("Milestone removed")
      router.refresh()
    } catch { toast.error("Failed to delete milestone") }
  }

  async function handleMove(id: string, dir: 'up' | 'down') {
    const idx = milestones.findIndex(m => m.id === id)
    if (idx < 0) return
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === milestones.length - 1) return
    const next = [...milestones]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    const reordered = next.map((m, i) => ({ ...m, sort_order: i }))
    setMilestones(reordered)
    try {
      for (const m of reordered) await saveBillingMilestone({ id: m.id, project_id: projectId, sort_order: m.sort_order, title: m.title, percentage: m.percentage, amount: m.amount, trigger_type: m.trigger_type })
      router.refresh()
    } catch { toast.error("Failed to reorder milestones") }
  }

  async function handleLoadTemplate() {
    setTemplateLoading(true)
    try {
      await loadMilestoneTemplate(projectId, selectedTemplate, quotedPrice, loadStart, parseFloat(loadDuration) || 16)
      const updated = await getBillingMilestones(projectId)
      setMilestones(updated)
      setTemplateModalOpen(false)
      toast.success(`Payment schedule loaded: ${selectedTemplate}`)
      router.refresh()
    } catch { toast.error("Failed to load template") }
    finally { setTemplateLoading(false) }
  }

  // ── Validation bar color ─────────────────────────────────────────────────────
  const validColor = totalPct >= 99.5 && totalPct <= 100.5
    ? "text-green-400 border-green-800/40 bg-green-900/10"
    : totalPct >= 90
    ? "text-amber-400 border-amber-800/40 bg-amber-900/10"
    : "text-red-400 border-red-800/40 bg-red-900/10"

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-sidebar" />
          <h3 className="text-lg font-semibold">Payment Schedule</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTemplateModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E2D45] bg-[#0D1526] hover:bg-[#1E2D45]/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors"
          >
            Load Template <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Milestone
          </button>
        </div>
      </div>

      {/* ── Milestone table ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
        {milestones.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No milestones yet. Load a template or add manually.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0D1526] border-b border-[#1E2D45]">
                <th className="w-8 px-2 py-2.5" />
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Milestone</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Trigger</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">%</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Planned Date</th>
                <th className="w-20 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D45]">
              {milestones.map((m, i) => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => handleMove(m.id, 'up')} disabled={i === 0} className="rounded p-0.5 hover:bg-[#1E2D45] disabled:opacity-20 text-muted-foreground">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleMove(m.id, 'down')} disabled={i === milestones.length - 1} className="rounded p-0.5 hover:bg-[#1E2D45] disabled:opacity-20 text-muted-foreground">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-foreground">{m.title}</p>
                    {m.deliverables && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]" title={m.deliverables}>{m.deliverables}</p>}
                  </td>
                  <td className="px-4 py-2.5"><TriggerBadge type={m.trigger_type as TriggerType} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{m.percentage}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">{fmt(m.amount)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {m.planned_date ? new Date(m.planned_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(m)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-[#1E2D45] transition-colors">Edit</button>
                      <button onClick={() => setDeleteId(m.id)} className="rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-red-900/20 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Validation bar ───────────────────────────────────────────────── */}
      {milestones.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${validColor}`}>
          <span>
            Total Allocated: <span className="font-semibold tabular-nums">{fmt(totalAmount)}</span> ({round2(totalPct)}%)
            {totalPct >= 99.5 && totalPct <= 100.5 && " ✅"}
          </span>
          {!(totalPct >= 99.5 && totalPct <= 100.5) && (
            <span className="text-xs flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {totalPct < 100
                ? `${fmt(quotedPrice - totalAmount)} (${round2(100 - totalPct)}%) remaining`
                : `${fmt(totalAmount - quotedPrice)} (${round2(totalPct - 100)}%) over-allocated`
              }
            </span>
          )}
        </div>
      )}

      {/* ── Cash Flow Forecast ───────────────────────────────────────────── */}
      {cashFlowData.length > 0 && (
        <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
          <button
            onClick={() => setCfOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-white/[0.02] transition-colors"
          >
            Cash Flow Forecast
            {cfOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {cfOpen && (
            <div className="border-t border-[#1E2D45] bg-[#0D1526] p-4 space-y-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={cashFlowData} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
                  <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
                  <YAxis tickFormatter={n => `$${Math.round(n / 1000)}k`} tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: any) => [fmt(Number(v))]}
                    contentStyle={{ background: "#0D1526", border: "1px solid #1E2D45", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="cumulative" name="Cumulative" radius={[3, 3, 0, 0]}>
                    {cashFlowData.map((_, i) => <Cell key={i} fill={`hsl(${220 + i * 15}, 70%, ${40 + i * 3}%)`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1E2D45]">
                    {["Date", "Milestone", "Amount", "Cumulative", "Payment Due"].map(h => (
                      <th key={h} className={`py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ${h === "Date" || h === "Milestone" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45]">
                  {(() => {
                    let cum = 0
                    return milestones.filter(m => m.planned_date).sort((a, b) => (a.planned_date ?? "").localeCompare(b.planned_date ?? "")).map(m => {
                      cum += m.amount
                      const dueDate = new Date(m.planned_date + "T12:00:00")
                      dueDate.setDate(dueDate.getDate() + (m.payment_terms ?? 30))
                      return (
                        <tr key={m.id}>
                          <td className="py-1.5 text-muted-foreground">{new Date(m.planned_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                          <td className="py-1.5 text-foreground font-medium">{m.title}</td>
                          <td className="py-1.5 text-right tabular-nums text-foreground">{fmt(m.amount)}</td>
                          <td className="py-1.5 text-right tabular-nums text-green-400">{fmt(cum)}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">{dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Template modal ───────────────────────────────────────────────── */}
      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !templateLoading && setTemplateModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-xl border border-[#1E2D45] bg-[#0D1526] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D45]">
              <h3 className="text-base font-semibold text-foreground">Load Payment Template</h3>
              <button onClick={() => !templateLoading && setTemplateModalOpen(false)} className="rounded-lg p-1.5 hover:bg-[#1E2D45] text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {templates.map(t => <option key={t.id} value={t.template_name}>{t.template_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Quoted Price</label>
                  <input readOnly value={fmt(quotedPrice)} className="w-full rounded border border-[#1E2D45] bg-[#0A1120] px-3 py-1.5 text-sm text-muted-foreground cursor-not-allowed" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Start Date</label>
                  <input type="date" value={loadStart} onChange={e => setLoadStart(e.target.value)} className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Duration (weeks)</label>
                  <input type="number" min="1" value={loadDuration} onChange={e => setLoadDuration(e.target.value)} className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              {/* Preview */}
              {templatePreview.length > 0 && (
                <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
                  <div className="bg-[#0A1120] px-4 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview</p>
                  </div>
                  <div className="divide-y divide-[#1E2D45]">
                    {templatePreview.map((m, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                        <div>
                          <span className="text-foreground">{m.title}</span>
                          <span className="ml-2"><TriggerBadge type={m.trigger_type as TriggerType} /></span>
                        </div>
                        <div className="flex items-center gap-4 tabular-nums">
                          <span className="text-muted-foreground">{m.percentage}%</span>
                          <span className="font-medium text-foreground">{fmt(m.amount)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2 text-sm border-t-2 border-[#2D3F5A]">
                      <span className="font-semibold text-muted-foreground">Total</span>
                      <div className="flex items-center gap-4 tabular-nums">
                        <span className={`font-semibold ${Math.abs(previewTotal - 100) < 0.5 ? "text-green-400" : "text-amber-400"}`}>{round2(previewTotal)}%</span>
                        <span className="font-semibold text-foreground">{fmt(templatePreview.reduce((s, m) => s + m.amount, 0))}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {milestones.length > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> This will replace your existing {milestones.length} milestone{milestones.length !== 1 ? "s" : ""}.
                </p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-[#1E2D45] bg-[#0A1120]">
              <button onClick={() => !templateLoading && setTemplateModalOpen(false)} disabled={templateLoading} className="flex-1 rounded-lg border border-[#1E2D45] px-4 py-2 text-sm text-muted-foreground hover:bg-[#1E2D45]/40 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleLoadTemplate} disabled={templateLoading || !loadStart} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60">
                {templateLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</> : "Load Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteId(null)} />
          <div className="relative w-80 rounded-xl border border-[#1E2D45] bg-[#0D1526] p-6 shadow-2xl space-y-4">
            <p className="font-semibold text-foreground">Remove milestone?</p>
            <p className="text-sm text-muted-foreground">This will remove the milestone from the payment schedule.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="flex-1 rounded-lg border border-[#1E2D45] px-4 py-2 text-sm text-muted-foreground hover:bg-[#1E2D45]/40">Cancel</button>
              <button onClick={handleDelete} className="flex-1 rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-semibold text-white">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit slide-over ──────────────────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => !saving && setPanelOpen(false)} />
          <div className="w-full max-w-md bg-[#0D1526] border-l border-[#1E2D45] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D45] shrink-0">
              <h3 className="text-base font-semibold text-foreground">{editingId ? "Edit Milestone" : "Add Milestone"}</h3>
              <button onClick={() => !saving && setPanelOpen(false)} className="rounded-lg p-1.5 hover:bg-[#1E2D45] text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {[
                { label: "Milestone Title *", type: "text", field: "title" as const, placeholder: "e.g. Contract Signing" },
              ].map(f => (
                <div key={f.field} className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.field] ?? ""} onChange={e => updateForm({ [f.field]: e.target.value } as any)} placeholder={f.placeholder}
                    className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Trigger</label>
                <select value={form.trigger_type ?? "milestone"} onChange={e => updateForm({ trigger_type: e.target.value as TriggerType })}
                  className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {Object.entries(TRIGGER_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Deliverables</label>
                <textarea value={form.deliverables ?? ""} onChange={e => updateForm({ deliverables: e.target.value })} rows={2}
                  placeholder="What must be delivered to trigger this invoice?"
                  className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Percentage</label>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="100" step="0.1" value={form.percentage ?? 0} onChange={e => updateForm({ percentage: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Amount</label>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-sm">$</span>
                    <input type="number" min="0" value={form.amount ?? 0} onChange={e => updateForm({ amount: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
              {quotedPrice > 0 && <p className="text-[11px] text-muted-foreground -mt-2">Changing % updates amount and vice versa (based on {fmt(quotedPrice)} quoted price).</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Planned Date</label>
                  <input type="date" value={form.planned_date ?? ""} onChange={e => updateForm({ planned_date: e.target.value })}
                    className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Payment Terms (days)</label>
                  <input type="number" min="0" value={form.payment_terms ?? 30} onChange={e => updateForm({ payment_terms: parseInt(e.target.value) || 0 })}
                    className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">
                  Revised Date
                  <span className="ml-1 text-[11px] text-muted-foreground font-normal">(only set if original date cannot be met)</span>
                </label>
                <input type="date" value={form.revised_date ?? ""} onChange={e => updateForm({ revised_date: e.target.value || null })}
                  className={`w-full rounded border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    !form.revised_date && form.planned_date && new Date() > new Date(form.planned_date + "T12:00:00")
                      ? "border-amber-600/60 bg-amber-900/10"
                      : "border-[#1E2D45] bg-[#111827]"
                  }`} />
                {!form.revised_date && form.planned_date && new Date() > new Date(form.planned_date + "T12:00:00") && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Planned date has passed — consider setting a revised date.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Notes</label>
                <textarea value={form.notes ?? ""} onChange={e => updateForm({ notes: e.target.value })} rows={2}
                  className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Milestone Notes</label>
                <textarea value={form.milestone_notes ?? ""} onChange={e => updateForm({ milestone_notes: e.target.value })} rows={2}
                  placeholder="Reason for revision, blockers, or tracking notes…"
                  className="w-full rounded border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-[#1E2D45] bg-[#0A1120] shrink-0">
              <button onClick={() => !saving && setPanelOpen(false)} disabled={saving} className="flex-1 rounded-lg border border-[#1E2D45] px-4 py-2 text-sm text-muted-foreground hover:bg-[#1E2D45]/40 disabled:opacity-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save Milestone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
